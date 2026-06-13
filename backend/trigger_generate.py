import requests
import json

def main():
    url = "http://localhost:8000/api/generate"
    headers = {
        "Content-Type": "application/json",
        "X-Department": "Forensic Science"
    }
    payload = {
        "semesterType": "even"
    }
    
    try:
        print("Sending request to generate timetable...")
        response = requests.post(url, headers=headers, json=payload)
        print("Response status code:", response.status_code)
        print("Response JSON:")
        print(json.dumps(response.json(), indent=2))
    except Exception as e:
        print("Error connecting to API:", e)

if __name__ == "__main__":
    main()
