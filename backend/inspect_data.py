import sys
import os
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
load_dotenv()
from app.database import get_collection

def main():
    coll = get_collection("timetable")
    dept = "Forensic Science"
    
    pg_docs = list(coll.where("department", "==", dept).where("program", "==", "PG").where("semester", "==", 2).stream())
    print(f"PG Sem 2 count in DB: {len(pg_docs)}")
    
    ug_docs = list(coll.where("department", "==", dept).where("program", "==", "UG").where("semester", "==", 2).stream())
    print(f"UG Sem 2 count in DB: {len(ug_docs)}")
    
    print(f"Total Forensic Science even entries in DB: {len(pg_docs) + len(ug_docs)}")

if __name__ == "__main__":
    main()
