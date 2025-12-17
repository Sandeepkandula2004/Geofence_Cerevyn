from pydantic import BaseModel
from typing import Optional
from datetime import date


# --------------------------------------------------
# 1️⃣ ADMIN
# --------------------------------------------------
class AdminCreate(BaseModel):
    name: str
    email: str
    password: Optional[str] = None


# --------------------------------------------------
# 2️⃣ EMPLOYEE
# --------------------------------------------------
class EmployeeCreate(BaseModel):
    name: str
    employee_code: str


# --------------------------------------------------
# 2️⃣.1 EMPLOYEE HOME SETTINGS
# --------------------------------------------------
class EmployeeHomeUpdate(BaseModel):
    home_lat: float
    home_lng: float
    home_radius_m: float


# --------------------------------------------------
# 3️⃣ SESSION START (CHECK-IN)
# --------------------------------------------------
class SessionStart(BaseModel):
    lat: float
    lng: float
    employee_id: Optional[int] = None
    employee_code: Optional[str] = None


# --------------------------------------------------
# 4️⃣ LOCATION UPDATE (EVERY 10 SECONDS)
# --------------------------------------------------
class LocationUpdate(BaseModel):
    session_id: int
    lat: float
    lng: float
    
    class Config:
        # Allow string to number coercion
        str_strip_whitespace = True


# --------------------------------------------------
# 5️⃣ GEOFENCE (CIRCLE ONLY)
# --------------------------------------------------
class GeofenceCreate(BaseModel):
    name: str
    center_lat: float
    center_lng: float
    radius_m: float


# --------------------------------------------------
# 6️⃣ GEOFENCE ASSIGNMENT
# --------------------------------------------------
class GeofenceAssignmentCreate(BaseModel):
    employee_id: int
    geofence_id: int
    assigned_date: date


# --------------------------------------------------
# 7️⃣ OTP (FUTURE FALLBACK LOGIN)
# --------------------------------------------------
class OTPCreate(BaseModel):
    employee_id: int
    otp_code: str
    valid_for_date: date
