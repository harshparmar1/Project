import asyncio
import httpx

API_URL = "http://localhost:8000/api"

subjects = [
    {"name": "Data Structures", "semester": 1, "program": "UG", "type": "Lecture", "semesterType": "odd"},
    {"name": "Python Lab", "semester": 1, "program": "UG", "type": "Lab", "semesterType": "odd"},
    {"name": "Mathematics", "semester": 1, "program": "UG", "type": "Lecture", "semesterType": "odd"},
    {"name": "Operating Systems", "semester": 3, "program": "UG", "type": "Lecture", "semesterType": "odd"},
    {"name": "OS Lab", "semester": 3, "program": "UG", "type": "Lab", "semesterType": "odd"},
    {"name": "Advanced AI", "semester": 1, "program": "PG", "type": "Lecture", "semesterType": "odd"},
    {"name": "AI Lab", "semester": 1, "program": "PG", "type": "Lab", "semesterType": "odd"},
]

faculty = [
    {"name": "Dr. Smith"},
    {"name": "Prof. Johnson"},
    {"name": "Dr. Brown"},
    {"name": "Ms. Davis"},
    {"name": "Mr. Wilson"},
]

mappings = [
    {"subject_name": "Data Structures", "faculty_name": "Dr. Smith"},
    {"subject_name": "Python Lab", "faculty_name": "Prof. Johnson"},
    {"subject_name": "Mathematics", "faculty_name": "Dr. Brown"},
    {"subject_name": "Operating Systems", "faculty_name": "Ms. Davis"},
    {"subject_name": "OS Lab", "faculty_name": "Ms. Davis"},
    {"subject_name": "Advanced AI", "faculty_name": "Mr. Wilson"},
    {"subject_name": "AI Lab", "faculty_name": "Mr. Wilson"},
]

async def seed():
    async with httpx.AsyncClient() as client:
        print("Seeding subjects...")
        await client.post(f"{API_URL}/subjects", json=subjects)
        print("Seeding faculty...")
        await client.post(f"{API_URL}/faculty", json=faculty)
        print("Seeding mappings...")
        await client.post(f"{API_URL}/faculty_subject", json=mappings)
        print("Generating timetable...")
        res = await client.post(f"{API_URL}/generate", json={"semesterType": "odd"})
        print(f"Generated {res.json().get('count')} entries.")

if __name__ == "__main__":
    try:
        asyncio.run(seed())
    except Exception as e:
        print(f"Error seeding: {e}. Make sure the backend is running at {API_URL}")
