import os
import sys
from dotenv import load_dotenv

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.models import Subject, Faculty, FacultySubject, ElectiveAssignment, SubjectType, ProgramType, SemesterType
from app.scheduler.generator import TimetableGenerator
from app.scheduler.clash import DAYS, SLOTS, validate_faculty_clashes, validate_room_clashes, validate_elective_room_clashes
from app.database import get_collection
from app.firebase_config import get_db

load_dotenv()

def test_scheduler():
    print("Connecting to Firestore...")
    db = get_db()
    
    # 1. Clear database
    print("Clearing test data...")
    for coll_name in ["subjects", "faculty", "faculty_subject", "timetable", "departments", "users"]:
        coll = get_collection(coll_name)
        docs = list(coll.stream())
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()

    # 2. Setup departments
    print("Setting up departments...")
    coll_depts = get_collection("departments")
    for d in [
        {"name": "Data Science", "code": "DS2026"},
        {"name": "Forensic Science", "code": "FS2026"}
    ]:
        coll_depts.add(d)

    # 3. Setup subjects (Mandatory + Elective)
    print("Seeding subjects for Data Science...")
    subjects_ds = [
        # UG Sem 3 Subjects
        {"name": "DBMS", "semester": 3, "program": "UG", "type": "Lecture", "semesterType": "odd", "department": "Data Science"},
        {"name": "Probability", "semester": 3, "program": "UG", "type": "Lecture", "semesterType": "odd", "department": "Data Science"},
        {"name": "Python Lab", "semester": 3, "program": "UG", "type": "Lab", "semesterType": "odd", "department": "Data Science", "batches": ["A1", "A2", "B1", "B2"]},
        {"name": "AI Elective", "semester": 3, "program": "UG", "type": "Elective", "semesterType": "odd", "department": "Data Science", "isElective": True},
        {"name": "Cloud Elective", "semester": 3, "program": "UG", "type": "Elective", "semesterType": "odd", "department": "Data Science", "isElective": True},
    ]
    coll_subjects = get_collection("subjects")
    for s in subjects_ds:
        coll_subjects.add(s)

    print("Seeding subjects for Forensic Science...")
    subjects_fs = [
        {"name": "Forensic Chemistry", "semester": 3, "program": "UG", "type": "Lecture", "semesterType": "odd", "department": "Forensic Science"},
    ]
    for s in subjects_fs:
        coll_subjects.add(s)

    # 4. Setup Faculty
    print("Seeding faculty...")
    faculty_ds = [
        {"name": "Dr. Alice", "department": "Data Science"},
        {"name": "Dr. Bob", "department": "Data Science"},
        {"name": "Dr. Charlie", "department": "Data Science"},
        {"name": "Dr. Dave", "department": "Data Science"},
    ]
    coll_faculty = get_collection("faculty")
    for f in faculty_ds:
        coll_faculty.add(f)

    # 5. Setup Faculty-Subject Mappings
    print("Seeding faculty mappings...")
    mappings_ds = [
        {"subject_name": "DBMS", "faculty_name": "Dr. Alice", "department": "Data Science"},
        {"subject_name": "Probability", "faculty_name": "Dr. Bob", "department": "Data Science"},
        {"subject_name": "Python Lab", "faculty_name": "Dr. Charlie", "batch": "A1", "department": "Data Science"},
        {"subject_name": "Python Lab", "faculty_name": "Dr. Charlie", "batch": "A2", "department": "Data Science"},
        {"subject_name": "Python Lab", "faculty_name": "Dr. Charlie", "batch": "B1", "department": "Data Science"},
        {"subject_name": "Python Lab", "faculty_name": "Dr. Charlie", "batch": "B2", "department": "Data Science"},
        {"subject_name": "AI Elective", "faculty_name": "Dr. Alice", "department": "Data Science"},
        {"subject_name": "Cloud Elective", "faculty_name": "Dr. Dave", "department": "Data Science"},
    ]
    coll_fac_sub = get_collection("faculty_subject")
    for m in mappings_ds:
        coll_fac_sub.add(m)

    # 6. Test Department Isolation Query
    print("Verifying Department Isolation...")
    ds_subjects = [doc.to_dict() for doc in coll_subjects.where("department", "==", "Data Science").stream()]
    fs_subjects = [doc.to_dict() for doc in coll_subjects.where("department", "==", "Forensic Science").stream()]
    
    assert len(ds_subjects) == 5, f"Expected 5 subjects for Data Science, got {len(ds_subjects)}"
    assert len(fs_subjects) == 1, f"Expected 1 subject for Forensic Science, got {len(fs_subjects)}"
    print("[OK] Department isolation test passed.")

    # 7. Generate Timetable for Data Science
    print("Generating timetable for Data Science...")
    subjects_models = [Subject(**s) for s in ds_subjects]
    
    faculty_mapping = {}
    for m in mappings_ds:
        subj = m["subject_name"]
        fac = m["faculty_name"]
        batch = m.get("batch")
        if batch:
            faculty_mapping[(subj, batch)] = fac
        else:
            faculty_mapping[subj] = fac

    generator = TimetableGenerator(
        subjects_models, faculty_mapping, [], semester_type="odd"
    )
    timetable = generator.generate()
    
    assert len(timetable) > 0, "Failed to generate timetable entries!"
    print(f"Generated {len(timetable)} entries.")

    # 8. Verify No Free Slots
    print("Verifying No Free Slots...")
    for entry in timetable:
        assert entry.subject not in ("BUFFER", "FREE SLOT", "FREE BUFFER"), f"Free slot found: {entry}"
    print("[OK] No free slots test passed.")

    # 9. Verify Elective vs Core Lecture Conflict Prevention
    print("Verifying Elective vs Core Lecture Conflict Prevention...")
    for day in DAYS:
        for slot in SLOTS:
            slot_entries = [e for e in timetable if e.day == day and e.slot == slot]
            if not slot_entries:
                continue
            
            has_elective = any(e.is_elective for e in slot_entries)
            has_core = any(not e.is_elective and e.subject not in ("FREE SLOT", "TDPCL") for e in slot_entries)
            
            # An elective and a core lecture must not happen in the same slot for the same semester
            assert not (has_elective and has_core), f"Elective conflict at {day} Slot {slot}! Elective and Core Lecture scheduled together."
            
    print("[OK] Elective vs Core Lecture isolation test passed.")

    # 10. Verify no clashes
    print("Verifying Faculty & Room clashes...")
    f_clashes = validate_faculty_clashes(timetable)
    r_clashes = validate_room_clashes(timetable)
    e_clashes = validate_elective_room_clashes(timetable)
    
    assert len(f_clashes) == 0, f"Faculty clashes detected: {f_clashes}"
    assert len(r_clashes) == 0, f"Room clashes detected: {r_clashes}"
    assert len(e_clashes) == 0, f"Elective room clashes detected: {e_clashes}"
    print("[OK] No clashes test passed.")
    print("\nALL BACKEND SCHEDULER TESTS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    test_scheduler()
