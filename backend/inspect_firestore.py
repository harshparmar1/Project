import sys
import os
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.database import get_collection

def main():
    load_dotenv()
    
    tt = get_collection("timetable").limit(1).stream()
    for entry in tt:
        print("Raw Keys:", entry.to_dict().keys())
        print("Raw Data:", entry.to_dict())

if __name__ == "__main__":
    main()
