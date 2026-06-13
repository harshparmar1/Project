import sys
import os
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.database import get_collection
from app.models import Subject, FacultySubject, ElectiveAssignment
from app.scheduler.generator import TimetableGenerator

def _build_faculty_mapping(mappings_data):
    result = {}
    for m in mappings_data:
        subject = m["subject_name"]
        faculty = m["faculty_name"]
        batch = m.get("batch")
        if batch:
            result[(subject, batch)] = faculty
        else:
            result[subject] = faculty
    return result

def main():
    load_dotenv()
    dept = "Forensic Science"
    mode = "even"
    
    # Load data
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
        
    # Filter by mode
    def filter_by_mode(items, m_type):
        res = []
        for i in items:
            raw = i.get("semesterType") or i.get("semester_type") or "odd"
            if raw == m_type:
                res.append(i)
        return res

    subjects_data = filter_by_mode(subjects_data, mode)
    assignments_data = filter_by_mode(assignments_data, mode)
    
    print(f"Loaded {len(subjects_data)} subjects for {dept} {mode}.")
    print(f"Loaded {len(mappings_data)} mappings.")
    
    subjects = [Subject(**s) for s in subjects_data]
    faculty_mapping = _build_faculty_mapping(mappings_data)
    elective_assignments = [ElectiveAssignment(**a) for a in assignments_data]
    
    generator = TimetableGenerator(
        subjects, faculty_mapping, elective_assignments, semester_type=mode,
        other_department_entries=[]
    )
    timetable = generator.generate()
    
    print("\n--- GENERATION RESULT ---")
    print(f"Scheduled count: {len(timetable)} entries")
    print(f"Failed allocations: {len(generator.failed_allocations)}")
    for f in generator.failed_allocations[:10]:
        print(f"Failed: {f['subject']} ({f['type']}) for Sem {f['semester']} {f['program']}")

if __name__ == "__main__":
    main()
