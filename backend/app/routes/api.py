from fastapi import APIRouter, HTTPException, Body, Depends, Header
from typing import List, Optional
import hashlib
from ..database import get_collection
from ..models import (
    Subject,
    Faculty,
    TimetableEntry,
    FacultySubject,
    ElectiveAssignment,
    ClashReport,
    GenerateRequest,
    SubjectType,
    Department,
    UserSignup,
    UserLogin,
)
from ..scheduler.generator import TimetableGenerator
from ..services.faculty_timetable import build_faculty_timetable
from ..services.timetable_display import group_timetable_for_display
from ..semester_mode import (
    normalize_semester_type,
    validate_subject_semester,
    get_semesters_for_program,
)

router = APIRouter()


# ----------------------------------------------------------------------
# HELPER FUNCTIONS & AUTH DEPENDENCY
# ----------------------------------------------------------------------

async def get_current_department(x_department: str = Header(None)):
    if not x_department:
        raise HTTPException(
            status_code=401,
            detail="Department context missing. Please select your department and log in."
        )
    return x_department


def hash_password(password: str) -> str:
    salt = "timetable_salt_2026_"
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed


def _doc_semester_type(doc: dict) -> str:
    raw = doc.get("semesterType") or doc.get("semester_type") or "odd"
    return normalize_semester_type(raw)


def _validate_subjects_list(subjects: List[Subject]) -> None:
    for s in subjects:
        mode = normalize_semester_type(
            s.semester_type.value if hasattr(s.semester_type, "value") else s.semester_type
        )
        try:
            validate_subject_semester(
                s.program.value if hasattr(s.program, "value") else s.program,
                s.semester,
                mode,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e


def _is_elective_subject(sub: Subject) -> bool:
    return sub.is_elective or sub.type == SubjectType.ELECTIVE


def _build_faculty_mapping(mappings_data: List[dict]) -> dict:
    """Build lookup for generator: lectures/electives by subject, labs by (subject, batch)."""
    result: dict = {}
    for m in mappings_data:
        subject = m["subject_name"]
        faculty = m["faculty_name"]
        batch = m.get("batch")
        if batch:
            result[(subject, batch)] = faculty
        else:
            result[subject] = faculty
    return result


def _validate_lab_faculty_mappings(
    subjects: List[Subject], mappings: List[FacultySubject]
) -> None:
    """Each batch on a lab subject must have exactly one faculty assigned."""
    default_lab_batches = ["A1", "A2", "B1", "B2"]
    seen: set = set()

    for m in mappings:
        if m.batch:
            key = (m.subject_name, m.batch)
            if key in seen:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Duplicate faculty assignment for lab '{m.subject_name}' "
                        f"batch {m.batch}."
                    ),
                )
            seen.add(key)

    for sub in subjects:
        if sub.type != SubjectType.LAB:
            continue
        batches = sub.batches if sub.batches else default_lab_batches
        for batch in batches:
            assigned = [
                m
                for m in mappings
                if m.subject_name == sub.name
                and m.batch == batch
                and m.faculty_name
            ]
            if not assigned:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Lab '{sub.name}' batch {batch} needs a faculty assignment."
                    ),
                )


def _validate_faculty_elective_mappings(
    subjects: List[Subject], mappings: List[FacultySubject]
) -> None:
    """One faculty cannot teach more than one elective subject."""
    elective_names = {s.name for s in subjects if _is_elective_subject(s)}
    faculty_used: dict = {}
    for m in mappings:
        if m.subject_name not in elective_names:
            continue
        if m.faculty_name in faculty_used:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Faculty '{m.faculty_name}' is already assigned to elective "
                    f"'{faculty_used[m.faculty_name]}'. Each elective needs a different faculty."
                ),
            )
        faculty_used[m.faculty_name] = m.subject_name


def _validate_elective_assignments(
    assignments: List[ElectiveAssignment],
) -> None:
    seen = set()
    for a in assignments:
        mode = normalize_semester_type(
            a.semester_type.value if hasattr(a.semester_type, "value") else a.semester_type
        )
        try:
            validate_subject_semester(
                a.program.value if hasattr(a.program, "value") else a.program,
                a.semester,
                mode,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        group = a.elective_group or "default"
        key = (a.program, a.semester, a.section, a.batch, group, mode)
        if key in seen:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Duplicate elective assignment for batch {a.batch} "
                    f"(Sem {a.semester}, Section {a.section}, {mode} mode)"
                ),
            )
        seen.add(key)


def _filter_by_mode(items: List[dict], semester_type: Optional[str]) -> List[dict]:
    if not semester_type:
        return items
    mode = normalize_semester_type(semester_type)
    return [i for i in items if _doc_semester_type(i) == mode]


_TIMETABLE_RESERVED_SUBJECTS = frozenset({"BUFFER SLOT", "TDPCL"})


async def _cleanup_orphan_faculty_mappings(
    dept: str,
    subject_names: Optional[set] = None,
    faculty_names: Optional[set] = None,
) -> int:
    """Remove faculty_subject rows that no longer match saved subjects or faculty in this department."""
    coll = await get_collection("faculty_subject")
    query: dict = {"department": dept}
    
    sub_query: dict = {}
    if subject_names is not None:
        sub_query["subject_name"] = {"$nin": list(subject_names)}
    if faculty_names is not None:
        fac_query = {"faculty_name": {"$nin": list(faculty_names)}}
        if sub_query:
            query["$or"] = [sub_query, fac_query]
        else:
            query.update(fac_query)
    elif sub_query:
        query.update(sub_query)

    result = await coll.delete_many(query)
    return result.deleted_count


async def _cleanup_timetable_for_removed_subjects(dept: str, subject_names: set) -> int:
    """Drop generated timetable rows for subjects that were deleted in this department."""
    tt_coll = await get_collection("timetable")
    to_remove = {
        "department": dept,
        "subject": {
            "$nin": list(subject_names | _TIMETABLE_RESERVED_SUBJECTS),
        }
    }
    result = await tt_coll.delete_many(to_remove)
    return result.deleted_count


async def _cleanup_timetable_for_removed_faculty(dept: str, faculty_names: set) -> int:
    """Drop timetable rows for faculty removed from the registry in this department."""
    tt_coll = await get_collection("timetable")
    if not faculty_names:
        result = await tt_coll.delete_many(
            {"department": dept, "subject": {"$nin": list(_TIMETABLE_RESERVED_SUBJECTS)}}
        )
        return result.deleted_count
    result = await tt_coll.delete_many({"department": dept, "faculty": {"$nin": list(faculty_names)}})
    return result.deleted_count


# ----------------------------------------------------------------------
# AUTHENTICATION & DEPARTMENT CONFIG ROUTES
# ----------------------------------------------------------------------

@router.post("/auth/signup")
async def signup(body: UserSignup):
    # 1. Verify selected department exists and code matches
    dept_coll = await get_collection("departments")
    dept = await dept_coll.find_one({"name": body.department})
    if not dept:
        raise HTTPException(status_code=400, detail=f"Department '{body.department}' not found.")
    
    if dept["code"] != body.department_code:
        raise HTTPException(status_code=400, detail="Incorrect department code for the selected department.")
    
    # 2. Check if user already exists
    users_coll = await get_collection("users")
    existing_user = await users_coll.find_one({"email": body.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered.")
    
    # 3. Create user
    pwd_hash = hash_password(body.password)
    user_doc = {
        "fullName": body.full_name,
        "email": body.email,
        "passwordHash": pwd_hash,
        "department": body.department
    }
    await users_coll.insert_one(user_doc)
    
    # 4. Generate token
    token = hashlib.sha256(f"{body.email}_{pwd_hash}".encode('utf-8')).hexdigest()
    
    return {
        "message": "Signup successful",
        "user": {
            "fullName": body.full_name,
            "email": body.email,
            "department": body.department,
            "token": token
        }
    }


@router.post("/auth/login")
async def login(body: UserLogin):
    # 1. Find user by email
    users_coll = await get_collection("users")
    user = await users_coll.find_one({"email": body.email})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email or password.")
    
    # 2. Verify password
    if not verify_password(body.password, user["passwordHash"]):
        raise HTTPException(status_code=400, detail="Invalid email or password.")
    
    # 3. Verify department and code
    dept_coll = await get_collection("departments")
    dept = await dept_coll.find_one({"name": body.department})
    if not dept or dept["code"] != body.department_code:
        raise HTTPException(status_code=400, detail="Incorrect department or department code.")
    
    # Ensure user's department matches
    if user["department"] != body.department:
        raise HTTPException(status_code=400, detail="User does not belong to the selected department.")
    
    # 4. Generate token
    token = hashlib.sha256(f"{body.email}_{user['passwordHash']}".encode('utf-8')).hexdigest()
    
    return {
        "message": "Login successful",
        "user": {
            "fullName": user["fullName"],
            "email": user["email"],
            "department": user["department"],
            "token": token
        }
    }


@router.get("/departments")
async def get_departments():
    coll = await get_collection("departments")
    depts = await coll.find({}).to_list(length=100)
    for d in depts:
        d["_id"] = str(d["_id"])
    return depts


@router.post("/departments")
async def configure_department(dept: Department):
    coll = await get_collection("departments")
    existing = await coll.find_one({"name": dept.name})
    if existing:
        await coll.update_one({"name": dept.name}, {"$set": {"code": dept.code}})
        message = f"Department '{dept.name}' code updated successfully."
    else:
        await coll.insert_one(dept.model_dump())
        message = f"Department '{dept.name}' configured successfully."
    return {"message": message}


# ----------------------------------------------------------------------
# TIMETABLE MANAGEMENT ROUTES
# ----------------------------------------------------------------------

@router.get("/semester-modes")
async def get_semester_modes():
    """Return odd/even semester mapping for UG and PG."""
    return {
        "odd": {"UG": [1, 3, 5], "PG": [1, 3]},
        "even": {"UG": [2, 4, 6], "PG": [2, 4]},
    }


@router.post("/subjects")
async def add_subjects(subjects: List[Subject], dept: str = Depends(get_current_department)):
    for s in subjects:
        if _is_elective_subject(s) and not s.elective_group:
            s.elective_group = "default"
        s.department = dept
    _validate_subjects_list(subjects)
    coll = await get_collection("subjects")
    await coll.delete_many({"department": dept})
    if subjects:
        await coll.insert_many([s.model_dump(by_alias=True) for s in subjects])

    subject_names = {s.name for s in subjects}
    removed_mappings = await _cleanup_orphan_faculty_mappings(dept, subject_names=subject_names)
    removed_timetable = await _cleanup_timetable_for_removed_subjects(dept, subject_names)

    return {
        "message": "Subjects saved successfully",
        "count": len(subjects),
        "removed_mappings": removed_mappings,
        "removed_timetable_entries": removed_timetable,
    }


@router.get("/subjects")
async def get_subjects(semester_type: str = None, dept: str = Depends(get_current_department)):
    coll = await get_collection("subjects")
    subjects = await coll.find({"department": dept}).to_list(length=500)
    subjects = _filter_by_mode(subjects, semester_type)
    for s in subjects:
        s["_id"] = str(s["_id"])
    return subjects


@router.post("/faculty")
async def add_faculty(faculty: List[Faculty], dept: str = Depends(get_current_department)):
    for f in faculty:
        f.department = dept
    coll = await get_collection("faculty")
    await coll.delete_many({"department": dept})
    if faculty:
        await coll.insert_many([f.model_dump(by_alias=True) for f in faculty])

    faculty_names = {f.name for f in faculty}
    removed_mappings = await _cleanup_orphan_faculty_mappings(dept, faculty_names=faculty_names)
    removed_timetable = await _cleanup_timetable_for_removed_faculty(dept, faculty_names)

    return {
        "message": "Faculty registry saved successfully",
        "count": len(faculty),
        "removed_mappings": removed_mappings,
        "removed_timetable_entries": removed_timetable,
    }


@router.get("/faculty")
async def get_faculty(dept: str = Depends(get_current_department)):
    coll = await get_collection("faculty")
    cursor = coll.find({"department": dept})
    faculty = await cursor.to_list(length=100)
    for f in faculty:
        f["_id"] = str(f["_id"])
    return faculty


@router.post("/faculty_subject")
async def map_faculty_subject(mappings: List[FacultySubject], dept: str = Depends(get_current_department)):
    for m in mappings:
        m.department = dept
    sub_coll = await get_collection("subjects")
    subs_data = await sub_coll.find({"department": dept}).to_list(length=500)
    if subs_data:
        subject_models = [Subject(**s) for s in subs_data]
        _validate_faculty_elective_mappings(subject_models, mappings)
        _validate_lab_faculty_mappings(subject_models, mappings)
    coll = await get_collection("faculty_subject")
    await coll.delete_many({"department": dept})
    if mappings:
        await coll.insert_many([m.model_dump() for m in mappings])

    removed_timetable = 0
    if subs_data:
        mapped_names = {m.subject_name for m in mappings}
        unmapped = {s["name"] for s in subs_data} - mapped_names
        if unmapped:
            tt_coll = await get_collection("timetable")
            result = await tt_coll.delete_many({"department": dept, "subject": {"$in": list(unmapped)}})
            removed_timetable = result.deleted_count

    return {
        "message": "Mappings saved successfully",
        "count": len(mappings),
        "removed_timetable_entries": removed_timetable,
    }


@router.get("/faculty_subject")
async def get_faculty_mappings(dept: str = Depends(get_current_department)):
    coll = await get_collection("faculty_subject")
    cursor = coll.find({"department": dept})
    mappings = await cursor.to_list(length=100)
    for m in mappings:
        m["_id"] = str(m["_id"])
    return mappings


@router.post("/elective_assignments")
async def add_elective_assignments(assignments: List[ElectiveAssignment], dept: str = Depends(get_current_department)):
    for a in assignments:
        a.department = dept
    _validate_elective_assignments(assignments)
    coll = await get_collection("elective_assignments")
    await coll.delete_many({"department": dept})
    if assignments:
        await coll.insert_many([a.model_dump(by_alias=True) for a in assignments])
    return {"message": "Elective assignments saved successfully", "count": len(assignments)}


@router.get("/elective_assignments")
async def get_elective_assignments(
    program: str = None,
    semester: int = None,
    section: str = None,
    semester_type: str = None,
    dept: str = Depends(get_current_department),
):
    coll = await get_collection("elective_assignments")
    query = {"department": dept}
    if program:
        query["program"] = program
    if semester is not None:
        query["semester"] = int(semester)
    if section:
        query["section"] = section
    if semester_type:
        mode = normalize_semester_type(semester_type)
        query["$or"] = [{"semesterType": mode}, {"semester_type": mode}]

    cursor = coll.find(query)
    assignments = await cursor.to_list(length=500)
    for a in assignments:
        a["_id"] = str(a["_id"])
    return assignments


@router.post("/generate")
async def generate_timetable(body: GenerateRequest = Body(...), dept: str = Depends(get_current_department)):
    mode = normalize_semester_type(
        body.semester_type.value if hasattr(body.semester_type, "value") else body.semester_type
    )

    sub_coll = await get_collection("subjects")
    fac_sub_coll = await get_collection("faculty_subject")
    elective_coll = await get_collection("elective_assignments")

    subjects_data = await sub_coll.find({"department": dept}).to_list(length=500)
    mappings_data = await fac_sub_coll.find({"department": dept}).to_list(length=200)
    assignments_data = await elective_coll.find({"department": dept}).to_list(length=500)

    subjects_data = _filter_by_mode(subjects_data, mode)
    assignments_data = _filter_by_mode(assignments_data, mode)

    if not subjects_data or not mappings_data:
        raise HTTPException(
            status_code=400,
            detail=f"No subjects or faculty mappings found for {mode} semester mode.",
        )

    subjects = []
    for s in subjects_data:
        try:
            subjects.append(Subject(**s))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid subject data: {e}") from e

    _validate_subjects_list(subjects)
    faculty_subjects = [Subject(**s) for s in subjects_data]
    faculty_mappings = [FacultySubject(**m) for m in mappings_data]
    _validate_faculty_elective_mappings(faculty_subjects, faculty_mappings)
    _validate_lab_faculty_mappings(faculty_subjects, faculty_mappings)

    faculty_mapping = _build_faculty_mapping(mappings_data)
    elective_assignments = [ElectiveAssignment(**a) for a in assignments_data]
    _validate_elective_assignments(elective_assignments)

    generator = TimetableGenerator(
        subjects, faculty_mapping, elective_assignments, semester_type=mode
    )
    timetable = generator.generate()

    # Tag entries with the department
    for entry in timetable:
        entry.department = dept

    tt_coll = await get_collection("timetable")
    await tt_coll.delete_many(
        {"department": dept, "$or": [{"semesterType": mode}, {"semester_type": mode}]}
    )
    if timetable:
        await tt_coll.insert_many([entry.model_dump(by_alias=True) for entry in timetable])

    clash_report = ClashReport(
        faculty_clashes=generator.clash_report.get("faculty", []),
        room_clashes=generator.clash_report.get("room", []),
        elective_room_clashes=generator.clash_report.get("elective_room", []),
    )

    subject_names = {s.name for s in subjects}
    scheduled_subjects = {e.subject for e in timetable if e.subject not in ("BUFFER SLOT", "TDPCL")}
    missing_subjects = sorted(subject_names - scheduled_subjects)

    return {
        "message": f"Timetable generated successfully for {mode} semester mode",
        "semester_type": mode,
        "semesters": {
            "UG": get_semesters_for_program("UG", mode),
            "PG": get_semesters_for_program("PG", mode),
        },
        "count": len(timetable),
        "subjects_total": len(subject_names),
        "subjects_scheduled": len(scheduled_subjects & subject_names),
        "subjects_missing": missing_subjects,
        "failed_allocations": generator.failed_allocations,
        "clashes": clash_report.model_dump(),
    }


@router.get("/clashes")
async def get_clashes(semester_type: str = None, dept: str = Depends(get_current_department)):
    from ..scheduler.clash import (
        validate_faculty_clashes,
        validate_room_clashes,
        validate_elective_room_clashes,
    )

    coll = await get_collection("timetable")
    entries_data = await coll.find({"department": dept}).to_list(length=5000)
    entries_data = _filter_by_mode(entries_data, semester_type)
    entries = [TimetableEntry(**e) for e in entries_data]

    return ClashReport(
        faculty_clashes=validate_faculty_clashes(entries),
        room_clashes=validate_room_clashes(entries),
        elective_room_clashes=validate_elective_room_clashes(entries),
    ).model_dump()


@router.get("/faculty-timetable/{faculty_name}")
async def get_faculty_timetable(
    faculty_name: str,
    semester_type: str = None,
    program: str = None,
    semester: int = None,
    dept: str = Depends(get_current_department),
):
    if semester_type and program and semester:
        try:
            validate_subject_semester(program, int(semester), semester_type)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    coll = await get_collection("timetable")
    query = {"faculty": faculty_name, "department": dept}
    if program:
        query["program"] = program
    if semester is not None:
        query["semester"] = int(semester)
    if semester_type:
        mode = normalize_semester_type(semester_type)
        query["$or"] = [{"semesterType": mode}, {"semester_type": mode}]

    entries_data = await coll.find(query).to_list(length=5000)
    for e in entries_data:
        e["_id"] = str(e["_id"])
    result = build_faculty_timetable(faculty_name, entries_data)
    result["semester_type"] = normalize_semester_type(semester_type) if semester_type else None
    result["program"] = program
    result["semester"] = int(semester) if semester is not None else None
    return result


@router.get("/timetable")
async def get_timetable(
    program: str = None,
    semester: int = None,
    section: str = None,
    batch: str = None,
    semester_type: str = None,
    dept: str = Depends(get_current_department),
):
    if semester_type and program and semester:
        try:
            validate_subject_semester(program, int(semester), semester_type)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    coll = await get_collection("timetable")
    query = {"department": dept}
    if program:
        query["program"] = program
    if semester:
        query["semester"] = int(semester)
    if section:
        query["section"] = section
    if batch:
        query["batch"] = batch
    if semester_type:
        mode = normalize_semester_type(semester_type)
        query["$or"] = [{"semesterType": mode}, {"semester_type": mode}]

    cursor = coll.find(query)
    entries = await cursor.to_list(length=5000)
    for e in entries:
        e["_id"] = str(e["_id"])

    display = group_timetable_for_display(entries)
    return {
        "entries": entries,
        "display": display,
    }
