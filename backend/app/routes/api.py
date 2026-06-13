from fastapi import APIRouter, HTTPException, Body, Depends, Header
from typing import List, Optional
from pydantic import BaseModel
import hashlib
from starlette.concurrency import run_in_threadpool
from ..database import get_collection
from ..firebase_config import get_db
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
    """
    Each elective subject in the same parallel group (same program, semester,
    elective group, and semester type) must have a distinct faculty member assigned.
    """
    subject_map = {s.name: s for s in subjects}
    group_faculty: dict = {}
    for m in mappings:
        sub = subject_map.get(m.subject_name)
        if not sub or not _is_elective_subject(sub):
            continue
        program = sub.program.value if hasattr(sub.program, "value") else sub.program
        semester = sub.semester
        group_name = sub.elective_group or "default"
        sem_type = normalize_semester_type(
            sub.semester_type.value if hasattr(sub.semester_type, "value") else sub.semester_type
        )
        group_key = (program, semester, group_name, sem_type)
        if group_key not in group_faculty:
            group_faculty[group_key] = {}
        if m.faculty_name in group_faculty[group_key]:
            other_sub = group_faculty[group_key][m.faculty_name]
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Faculty '{m.faculty_name}' is already assigned to elective "
                    f"'{other_sub}' in the same parallel group (Sem {semester}, Group '{group_name}', {sem_type} mode). "
                    f"Parallel electives must have different faculty members."
                ),
            )
        group_faculty[group_key][m.faculty_name] = m.subject_name



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


def _sync_cleanup_orphan_faculty_mappings(
    dept: str,
    subject_names: Optional[set] = None,
    faculty_names: Optional[set] = None,
) -> int:
    """Remove faculty_subject rows that no longer match saved subjects or faculty in this department."""
    coll = get_collection("faculty_subject")
    docs = list(coll.where("department", "==", dept).stream())
    deleted_count = 0
    db = get_db()
    batch = db.batch()
    batch_size = 0
    for doc in docs:
        val = doc.to_dict()
        should_delete = False
        if subject_names is not None and val.get("subject_name") not in subject_names:
            should_delete = True
        if faculty_names is not None and val.get("faculty_name") not in faculty_names:
            should_delete = True
        
        if should_delete:
            batch.delete(doc.reference)
            deleted_count += 1
            batch_size += 1
            if batch_size >= 400:
                batch.commit()
                batch = db.batch()
                batch_size = 0
    if batch_size > 0:
        batch.commit()
    return deleted_count


def _sync_cleanup_timetable_for_removed_subjects(dept: str, subject_names: set) -> int:
    """Drop generated timetable rows for subjects that were deleted in this department."""
    tt_coll = get_collection("timetable")
    docs = list(tt_coll.where("department", "==", dept).stream())
    allowed = subject_names | _TIMETABLE_RESERVED_SUBJECTS
    deleted_count = 0
    db = get_db()
    batch = db.batch()
    batch_size = 0
    for doc in docs:
        val = doc.to_dict()
        if val.get("subject") not in allowed:
            batch.delete(doc.reference)
            deleted_count += 1
            batch_size += 1
            if batch_size >= 400:
                batch.commit()
                batch = db.batch()
                batch_size = 0
    if batch_size > 0:
        batch.commit()
    return deleted_count


def _sync_cleanup_timetable_for_removed_faculty(dept: str, faculty_names: set) -> int:
    """Drop timetable rows for faculty removed from the registry in this department."""
    tt_coll = get_collection("timetable")
    docs = list(tt_coll.where("department", "==", dept).stream())
    deleted_count = 0
    db = get_db()
    batch = db.batch()
    batch_size = 0
    for doc in docs:
        val = doc.to_dict()
        should_delete = False
        if not faculty_names:
            if val.get("subject") not in _TIMETABLE_RESERVED_SUBJECTS:
                should_delete = True
        else:
            if val.get("faculty") not in faculty_names:
                should_delete = True
        
        if should_delete:
            batch.delete(doc.reference)
            deleted_count += 1
            batch_size += 1
            if batch_size >= 400:
                batch.commit()
                batch = db.batch()
                batch_size = 0
    if batch_size > 0:
        batch.commit()
    return deleted_count


def _sync_delete_all_by_department(collection_name: str, dept: str) -> None:
    coll = get_collection(collection_name)
    docs = list(coll.where("department", "==", dept).stream())
    db = get_db()
    batch = db.batch()
    batch_size = 0
    for doc in docs:
        batch.delete(doc.reference)
        batch_size += 1
        if batch_size >= 400:
            batch.commit()
            batch = db.batch()
            batch_size = 0
    if batch_size > 0:
        batch.commit()


def _sync_insert_many(collection_name: str, items: List[dict]) -> None:
    coll = get_collection(collection_name)
    db = get_db()
    batch = db.batch()
    batch_size = 0
    for item in items:
        doc_ref = coll.document()
        batch.set(doc_ref, item)
        batch_size += 1
        if batch_size >= 400:
            batch.commit()
            batch = db.batch()
            batch_size = 0
    if batch_size > 0:
        batch.commit()


def _sync_delete_timetable_for_unmapped_subjects(dept: str, unmapped: set) -> int:
    tt_coll = get_collection("timetable")
    docs = list(tt_coll.where("department", "==", dept).stream())
    deleted_count = 0
    db = get_db()
    batch = db.batch()
    batch_size = 0
    for doc in docs:
        val = doc.to_dict()
        if val.get("subject") in unmapped:
            batch.delete(doc.reference)
            deleted_count += 1
            batch_size += 1
            if batch_size >= 400:
                batch.commit()
                batch = db.batch()
                batch_size = 0
    if batch_size > 0:
        batch.commit()
    return deleted_count


def _sync_delete_timetable_for_generation(dept: str, mode: str) -> None:
    tt_coll = get_collection("timetable")
    docs = list(tt_coll.where("department", "==", dept).stream())
    db = get_db()
    batch = db.batch()
    batch_size = 0
    for doc in docs:
        val = doc.to_dict()
        val_mode = val.get("semesterType") or val.get("semester_type")
        if val_mode == mode:
            batch.delete(doc.reference)
            batch_size += 1
            if batch_size >= 400:
                batch.commit()
                batch = db.batch()
                batch_size = 0
    if batch_size > 0:
        batch.commit()


# ----------------------------------------------------------------------
# AUTHENTICATION & DEPARTMENT CONFIG ROUTES
# ----------------------------------------------------------------------

@router.post("/auth/signup")
async def signup(body: UserSignup):
    def run():
        dept_coll = get_collection("departments")
        dept_stream = list(dept_coll.where("name", "==", body.department).limit(1).stream())
        if not dept_stream:
            raise HTTPException(status_code=400, detail=f"Department '{body.department}' not found.")
        dept = dept_stream[0].to_dict()
        
        if dept["code"] != body.department_code:
            raise HTTPException(status_code=400, detail="Incorrect department code for the selected department.")
        
        users_coll = get_collection("users")
        user_stream = list(users_coll.where("email", "==", body.email).limit(1).stream())
        if user_stream:
            raise HTTPException(status_code=400, detail="Email is already registered.")
        
        pwd_hash = hash_password(body.password)
        user_doc = {
            "fullName": body.full_name,
            "email": body.email,
            "passwordHash": pwd_hash,
            "department": body.department
        }
        users_coll.add(user_doc)
        
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
    return await run_in_threadpool(run)


@router.post("/auth/login")
async def login(body: UserLogin):
    def run():
        users_coll = get_collection("users")
        user_stream = list(users_coll.where("email", "==", body.email).limit(1).stream())
        if not user_stream:
            raise HTTPException(status_code=400, detail="Invalid email or password.")
        user = user_stream[0].to_dict()
        
        if not verify_password(body.password, user["passwordHash"]):
            raise HTTPException(status_code=400, detail="Invalid email or password.")
        
        dept_coll = get_collection("departments")
        dept_stream = list(dept_coll.where("name", "==", body.department).limit(1).stream())
        if not dept_stream or dept_stream[0].to_dict()["code"] != body.department_code:
            raise HTTPException(status_code=400, detail="Incorrect department or department code.")
        
        if user["department"] != body.department:
            raise HTTPException(status_code=400, detail="User does not belong to the selected department.")
        
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
    return await run_in_threadpool(run)


@router.get("/departments")
async def get_departments():
    def run():
        coll = get_collection("departments")
        depts = []
        for doc in coll.stream():
            d = doc.to_dict()
            d["_id"] = doc.id
            depts.append(d)
        return depts
    return await run_in_threadpool(run)


@router.post("/departments")
async def configure_department(dept: Department):
    def run():
        coll = get_collection("departments")
        existing_stream = list(coll.where("name", "==", dept.name).limit(1).stream())
        if existing_stream:
            doc_ref = existing_stream[0].reference
            doc_ref.update({"code": dept.code})
            message = f"Department '{dept.name}' code updated successfully."
        else:
            coll.add(dept.model_dump())
            message = f"Department '{dept.name}' configured successfully."
        return {"message": message}
    return await run_in_threadpool(run)


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
    
    def run():
        _sync_delete_all_by_department("subjects", dept)
        if subjects:
            _sync_insert_many("subjects", [s.model_dump(by_alias=True) for s in subjects])

        subject_names = {s.name for s in subjects}
        removed_mappings = _sync_cleanup_orphan_faculty_mappings(dept, subject_names=subject_names)
        removed_timetable = _sync_cleanup_timetable_for_removed_subjects(dept, subject_names)
        return removed_mappings, removed_timetable

    removed_mappings, removed_timetable = await run_in_threadpool(run)

    return {
        "message": "Subjects saved successfully",
        "count": len(subjects),
        "removed_mappings": removed_mappings,
        "removed_timetable_entries": removed_timetable,
    }


@router.get("/subjects")
async def get_subjects(semester_type: str = None, dept: str = Depends(get_current_department)):
    def run():
        coll = get_collection("subjects")
        docs = coll.where("department", "==", dept).stream()
        subjects = []
        for doc in docs:
            s = doc.to_dict()
            s["_id"] = doc.id
            subjects.append(s)
        return _filter_by_mode(subjects, semester_type)
    return await run_in_threadpool(run)


@router.post("/faculty")
async def add_faculty(faculty: List[Faculty], dept: str = Depends(get_current_department)):
    for f in faculty:
        f.department = dept
    
    def run():
        _sync_delete_all_by_department("faculty", dept)
        if faculty:
            _sync_insert_many("faculty", [f.model_dump(by_alias=True) for f in faculty])

        faculty_names = {f.name for f in faculty}
        removed_mappings = _sync_cleanup_orphan_faculty_mappings(dept, faculty_names=faculty_names)
        removed_timetable = _sync_cleanup_timetable_for_removed_faculty(dept, faculty_names)
        return removed_mappings, removed_timetable

    removed_mappings, removed_timetable = await run_in_threadpool(run)

    return {
        "message": "Faculty registry saved successfully",
        "count": len(faculty),
        "removed_mappings": removed_mappings,
        "removed_timetable_entries": removed_timetable,
    }


@router.get("/faculty")
async def get_faculty(dept: str = Depends(get_current_department)):
    def run():
        coll = get_collection("faculty")
        docs = coll.where("department", "==", dept).stream()
        faculty = []
        for doc in docs:
            f = doc.to_dict()
            f["_id"] = doc.id
            faculty.append(f)

        # Fetch approved requests where requester_department == dept
        req_coll = get_collection("faculty_requests")
        approved_reqs = list(req_coll.where("requester_department", "==", dept).where("status", "==", "approved").stream())
        approved_faculty_names = [r.to_dict().get("faculty_name") for r in approved_reqs]
        
        if approved_faculty_names:
            for name in approved_faculty_names:
                if any(f["name"] == name for f in faculty):
                    continue
                # Find the faculty details from any other department
                fac_docs = list(coll.where("name", "==", name).limit(1).stream())
                if fac_docs:
                    f = fac_docs[0].to_dict()
                    f["_id"] = fac_docs[0].id
                    faculty.append(f)

        return faculty
    return await run_in_threadpool(run)


@router.post("/faculty_subject")
async def map_faculty_subject(mappings: List[FacultySubject], dept: str = Depends(get_current_department)):
    for m in mappings:
        m.department = dept
        
    def run():
        sub_coll = get_collection("subjects")
        subs_data = []
        for doc in sub_coll.where("department", "==", dept).stream():
            s = doc.to_dict()
            s["_id"] = doc.id
            subs_data.append(s)
            
        if subs_data:
            subject_models = [Subject(**s) for s in subs_data]
            _validate_faculty_elective_mappings(subject_models, mappings)
            _validate_lab_faculty_mappings(subject_models, mappings)
            
        _sync_delete_all_by_department("faculty_subject", dept)
        if mappings:
            _sync_insert_many("faculty_subject", [m.model_dump() for m in mappings])

        removed_timetable = 0
        if subs_data:
            mapped_names = {m.subject_name for m in mappings}
            unmapped = {s["name"] for s in subs_data} - mapped_names
            if unmapped:
                removed_timetable = _sync_delete_timetable_for_unmapped_subjects(dept, unmapped)
        return removed_timetable

    removed_timetable = await run_in_threadpool(run)

    return {
        "message": "Mappings saved successfully",
        "count": len(mappings),
        "removed_timetable_entries": removed_timetable,
    }


@router.get("/faculty_subject")
async def get_faculty_mappings(dept: str = Depends(get_current_department)):
    def run():
        coll = get_collection("faculty_subject")
        docs = coll.where("department", "==", dept).stream()
        mappings = []
        for doc in docs:
            m = doc.to_dict()
            m["_id"] = doc.id
            mappings.append(m)
        return mappings
    return await run_in_threadpool(run)


@router.post("/elective_assignments")
async def add_elective_assignments(assignments: List[ElectiveAssignment], dept: str = Depends(get_current_department)):
    for a in assignments:
        a.department = dept
    _validate_elective_assignments(assignments)
    
    def run():
        _sync_delete_all_by_department("elective_assignments", dept)
        if assignments:
            _sync_insert_many("elective_assignments", [a.model_dump(by_alias=True) for a in assignments])
            
    await run_in_threadpool(run)
    return {"message": "Elective assignments saved successfully", "count": len(assignments)}


@router.get("/elective_assignments")
async def get_elective_assignments(
    program: str = None,
    semester: int = None,
    section: str = None,
    semester_type: str = None,
    dept: str = Depends(get_current_department),
):
    def run():
        coll = get_collection("elective_assignments")
        query = coll.where("department", "==", dept)
        if program:
            query = query.where("program", "==", program)
        if semester is not None:
            query = query.where("semester", "==", int(semester))
        if section:
            query = query.where("section", "==", section)

        docs = query.stream()
        assignments = []
        for doc in docs:
            a = doc.to_dict()
            a["_id"] = doc.id
            if semester_type:
                mode = normalize_semester_type(semester_type)
                val_mode = a.get("semesterType") or a.get("semester_type")
                if val_mode != mode:
                    continue
            assignments.append(a)
        return assignments
    return await run_in_threadpool(run)


@router.post("/generate")
async def generate_timetable(body: GenerateRequest = Body(...), dept: str = Depends(get_current_department)):
    mode = normalize_semester_type(
        body.semester_type.value if hasattr(body.semester_type, "value") else body.semester_type
    )

    def run():
        # Load other departments' timetable entries (Rule 4 & 5)
        tt_coll = get_collection("timetable")
        all_docs = list(tt_coll.stream())
        other_entries = []
        for doc in all_docs:
            data_dict = doc.to_dict()
            if data_dict.get("department") != dept:
                other_entries.append(data_dict)

        sub_coll = get_collection("subjects")
        fac_sub_coll = get_collection("faculty_subject")
        elective_coll = get_collection("elective_assignments")

        subjects_data = []
        for doc in sub_coll.where("department", "==", dept).stream():
            s = doc.to_dict()
            s["_id"] = doc.id
            subjects_data.append(s)
            
        mappings_data = []
        for doc in fac_sub_coll.where("department", "==", dept).stream():
            m = doc.to_dict()
            m["_id"] = doc.id
            mappings_data.append(m)
            
        assignments_data = []
        for doc in elective_coll.where("department", "==", dept).stream():
            a = doc.to_dict()
            a["_id"] = doc.id
            assignments_data.append(a)

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
            subjects, faculty_mapping, elective_assignments, semester_type=mode,
            other_department_entries=other_entries
        )
        timetable = generator.generate()

        # Tag entries with the department
        for entry in timetable:
            entry.department = dept

        _sync_delete_timetable_for_generation(dept, mode)
        if timetable:
            _sync_insert_many("timetable", [entry.model_dump(by_alias=True) for entry in timetable])

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

    return await run_in_threadpool(run)


@router.get("/clashes")
async def get_clashes(semester_type: str = None, dept: str = Depends(get_current_department)):
    from ..scheduler.clash import (
        validate_faculty_clashes,
        validate_room_clashes,
        validate_elective_room_clashes,
    )

    def run():
        coll = get_collection("timetable")
        entries_data = []
        for doc in coll.where("department", "==", dept).stream():
            e = doc.to_dict()
            e["_id"] = doc.id
            entries_data.append(e)
            
        entries_data = _filter_by_mode(entries_data, semester_type)
        entries = [TimetableEntry(**e) for e in entries_data]

        return ClashReport(
            faculty_clashes=validate_faculty_clashes(entries),
            room_clashes=validate_room_clashes(entries),
            elective_room_clashes=validate_elective_room_clashes(entries),
        ).model_dump()

    return await run_in_threadpool(run)


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

    def run():
        coll = get_collection("timetable")
        query = coll.where("faculty", "==", faculty_name).where("department", "==", dept)
        if program:
            query = query.where("program", "==", program)
        if semester is not None:
            query = query.where("semester", "==", int(semester))

        entries_data = []
        for doc in query.stream():
            e = doc.to_dict()
            e["_id"] = doc.id
            
            if semester_type:
                mode = normalize_semester_type(semester_type)
                val_mode = e.get("semesterType") or e.get("semester_type")
                if val_mode != mode:
                    continue
            entries_data.append(e)

        result = build_faculty_timetable(faculty_name, entries_data)
        result["semester_type"] = normalize_semester_type(semester_type) if semester_type else None
        result["program"] = program
        result["semester"] = int(semester) if semester is not None else None
        return result

    return await run_in_threadpool(run)


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

    def run():
        coll = get_collection("timetable")
        query = coll.where("department", "==", dept)
        if program:
            query = query.where("program", "==", program)
        if semester:
            query = query.where("semester", "==", int(semester))
        if section:
            query = query.where("section", "==", section)
        if batch:
            query = query.where("batch", "==", batch)

        entries = []
        for doc in query.stream():
            e = doc.to_dict()
            e["_id"] = doc.id
            
            if semester_type:
                mode = normalize_semester_type(semester_type)
                val_mode = e.get("semesterType") or e.get("semester_type")
                if val_mode != mode:
                    continue
            entries.append(e)

        display = group_timetable_for_display(entries)
        return {
            "entries": entries,
            "display": display,
        }

    return await run_in_threadpool(run)


# ----------------------------------------------------------------------
# FACULTY REQUESTS SCHEMAS & ENDPOINTS
# ----------------------------------------------------------------------

class FacultyRequestCreate(BaseModel):
    target_department: str
    faculty_name: str

class FacultyRequestUpdate(BaseModel):
    status: str  # "approved" or "rejected"


@router.post("/faculty-requests")
async def create_faculty_request(body: FacultyRequestCreate, dept: str = Depends(get_current_department)):
    def run():
        # Check if faculty exists in the target department
        fac_coll = get_collection("faculty")
        fac_stream = list(fac_coll.where("name", "==", body.faculty_name).where("department", "==", body.target_department).limit(1).stream())
        if not fac_stream:
            raise HTTPException(status_code=400, detail=f"Faculty '{body.faculty_name}' not found in department '{body.target_department}'.")
            
        req_coll = get_collection("faculty_requests")
        # Check if already requested
        existing = list(req_coll.where("requester_department", "==", dept)
                                .where("target_department", "==", body.target_department)
                                .where("faculty_name", "==", body.faculty_name)
                                .limit(1).stream())
        if existing:
            raise HTTPException(status_code=400, detail="Request already exists.")
            
        req_doc = {
            "requester_department": dept,
            "target_department": body.target_department,
            "faculty_name": body.faculty_name,
            "status": "pending"
        }
        req_coll.add(req_doc)
        return {"message": "Faculty request submitted successfully."}
    return await run_in_threadpool(run)


@router.get("/faculty-requests/sent")
async def get_sent_requests(dept: str = Depends(get_current_department)):
    def run():
        req_coll = get_collection("faculty_requests")
        docs = req_coll.where("requester_department", "==", dept).stream()
        res = []
        for doc in docs:
            d = doc.to_dict()
            d["_id"] = doc.id
            res.append(d)
        return res
    return await run_in_threadpool(run)


@router.get("/faculty-requests/received")
async def get_received_requests(dept: str = Depends(get_current_department)):
    def run():
        req_coll = get_collection("faculty_requests")
        docs = req_coll.where("target_department", "==", dept).stream()
        res = []
        for doc in docs:
            d = doc.to_dict()
            d["_id"] = doc.id
            res.append(d)
        return res
    return await run_in_threadpool(run)


@router.patch("/faculty-requests/{request_id}")
async def update_faculty_request(request_id: str, body: FacultyRequestUpdate, dept: str = Depends(get_current_department)):
    if body.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status. Use 'approved' or 'rejected'.")
        
    def run():
        req_coll = get_collection("faculty_requests")
        doc_ref = req_coll.document(request_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Request not found.")
            
        data = doc.to_dict()
        if data.get("target_department") != dept:
            raise HTTPException(status_code=403, detail="Not authorized to update this request.")
            
        doc_ref.update({"status": body.status})
        return {"message": f"Request {body.status} successfully."}
    return await run_in_threadpool(run)


@router.get("/other-departments-faculty")
async def get_other_departments_faculty(dept: str = Depends(get_current_department)):
    def run():
        coll = get_collection("faculty")
        docs = coll.stream()
        faculty = []
        for doc in docs:
            f = doc.to_dict()
            if f.get("department") != dept:
                faculty.append({
                    "name": f.get("name"),
                    "department": f.get("department"),
                    "qualification": f.get("qualification", ""),
                    "teacher_type": f.get("teacher_type") or f.get("teacherType", "Assistant")
                })
        return faculty
    return await run_in_threadpool(run)

