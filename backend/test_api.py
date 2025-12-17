import json
import time
import requests

BASE_URL = "http://127.0.0.1:8000"

# Adjust these as needed
EMPLOYEE_NAME = "Test User"
EMPLOYEE_CODE = "EMP-TEST-001"


def create_employee():
    resp = requests.post(
        f"{BASE_URL}/employee/create",
        json={"name": EMPLOYEE_NAME, "employee_code": EMPLOYEE_CODE},
        timeout=10,
    )
    data = resp.json()
    assert "employee_id" in data, data
    return data["employee_id"]


def start_session(employee_id: int):
    # Simulate files with small binaries
    selfie_bytes = b"selfie-bytes"
    odo_bytes = b"odo-bytes"

    data = {
        "data": json.dumps({
            "employee_id": employee_id,
            "lat": 12.9716,
            "lng": 77.5946,
        })
    }
    files = {
        "selfie": ("selfie.jpg", selfie_bytes, "image/jpeg"),
        "odometer": ("odometer.jpg", odo_bytes, "image/jpeg"),
    }

    resp = requests.post(f"{BASE_URL}/session/start", data=data, files=files, timeout=20)
    payload = resp.json()
    assert "session_id" in payload, payload
    return payload["session_id"], payload


def update_location(session_id: int, employee_id: int, lat: float, lng: float):
    resp = requests.post(
        f"{BASE_URL}/tracking/update-location",
        json={
            "session_id": session_id,
            "employee_id": employee_id,
            "lat": lat,
            "lng": lng,
        },
        timeout=10,
    )
    return resp.status_code, resp.json()


def get_polyline(session_id: int):
    resp = requests.get(f"{BASE_URL}/tracking/polyline/{session_id}", timeout=10)
    return resp.status_code, resp.json()


if __name__ == "__main__":
    print("Creating employee...")
    emp_id = create_employee()
    print("Employee:", emp_id)

    print("Starting session...")
    session_id, start_payload = start_session(emp_id)
    print("Session:", session_id)

    # Send a few location updates
    print("Updating locations...")
    for (lat, lng) in [
        (12.9717, 77.5947),
        (12.9718, 77.5948),
        (12.9719, 77.5950),
    ]:
        code, body = update_location(session_id, emp_id, lat, lng)
        print("Update:", code, body)
        time.sleep(1)

    print("Fetching polyline...")
    code, points = get_polyline(session_id)
    print("Polyline:", code, points)
