from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    Date,
    Text,
    ForeignKey,
    UniqueConstraint,
    ARRAY
)
from sqlalchemy.orm import declarative_base
from sqlalchemy.sql import text
from sqlalchemy.dialects.postgresql import TIMESTAMP

Base = declarative_base()

# --------------------------------------------------
# 1️⃣ ADMINS (minimal, auth later)
# --------------------------------------------------
class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(Text)
    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )


# --------------------------------------------------
# 2️⃣ EMPLOYEES
# --------------------------------------------------
class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    employee_code = Column(String, unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
    # Home geofence (for check-in verification)
    home_lat = Column(Float, nullable=True)
    home_lng = Column(Float, nullable=True)
    home_radius_m = Column(Float, nullable=True)
    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )


# --------------------------------------------------
# 2️⃣➕ EMPLOYEE FACES (face embeddings)
# --------------------------------------------------
class EmployeeFace(Base):
    __tablename__ = "employee_faces"

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, unique=True, nullable=False)

    embedding = Column(ARRAY(Float), nullable=False)
    reference_image_url = Column(Text)

    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )


# --------------------------------------------------
# 3️⃣ CHECK-IN OTPs (fallback login later)
# --------------------------------------------------
class CheckinOTP(Base):
    __tablename__ = "checkin_otps"

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    otp_code = Column(String, nullable=False)
    valid_for_date = Column(Date, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )


# --------------------------------------------------
# 4️⃣ USER SESSIONS (heart of tracking)
# --------------------------------------------------
class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)

    check_in_time = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )
    check_in_selfie_url = Column(Text)

    odometer_start_image_url = Column(Text)
    odometer_start_value = Column(Float)

    check_out_time = Column(TIMESTAMP)
    odometer_end_image_url = Column(Text)
    odometer_end_value = Column(Float)

    start_lat = Column(Float)
    start_lng = Column(Float)
    end_lat = Column(Float)
    end_lng = Column(Float)


# --------------------------------------------------
# 5️⃣ USER LOCATIONS (polyline storage only)
# --------------------------------------------------
class UserLocation(Base):
    __tablename__ = "user_locations"

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("user_sessions.id"), nullable=False)

    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    timestamp = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP"),
        default=datetime.utcnow,
        nullable=False,
    )


# --------------------------------------------------
# 6️⃣ GEOFENCES (circle only)
# --------------------------------------------------
class Geofence(Base):
    __tablename__ = "geofences"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)

    center_lat = Column(Float, nullable=False)
    center_lng = Column(Float, nullable=False)
    radius_m = Column(Float, nullable=False)

    created_by = Column(Integer, ForeignKey("admins.id"))
    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )
    
    # Unique constraint on center coordinates
    __table_args__ = (
        UniqueConstraint('center_lat', 'center_lng', name='uq_geofence_center'),
    )


# --------------------------------------------------
# 7️⃣ GEOFENCE STATUS (per session)
# --------------------------------------------------
class GeofenceStatus(Base):
    __tablename__ = "geofence_status"

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("user_sessions.id"), nullable=False)
    geofence_id = Column(Integer, ForeignKey("geofences.id"), nullable=False)

    completed = Column(Boolean, default=False)
    completed_at = Column(TIMESTAMP)

    __table_args__ = (
        UniqueConstraint('session_id', 'geofence_id', name='uq_geofence_status_session'),
    )


# --------------------------------------------------
# 8️⃣ GEOFENCE ASSIGNMENTS (daily targets)
# --------------------------------------------------
class GeofenceAssignment(Base):
    __tablename__ = "geofence_assignments"

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    geofence_id = Column(Integer, ForeignKey("geofences.id"), nullable=False)
    assigned_date = Column(Date, nullable=False)
    assigned_by = Column(Integer, ForeignKey("admins.id"), nullable=True)
    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )


# --------------------------------------------------
# 9️⃣ DAILY SUMMARY (reports)
# --------------------------------------------------
class DailySummary(Base):
    __tablename__ = "daily_summary"

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    date = Column(Date, nullable=False)

    odometer_start = Column(Float)
    odometer_end = Column(Float)
    total_distance = Column(Float)

    geofence_count = Column(Integer)

    start_lat = Column(Float)
    start_lng = Column(Float)
    end_lat = Column(Float)
    end_lng = Column(Float)

    __table_args__ = (
        UniqueConstraint('employee_id', 'date', name='uq_daily_summary_employee_date'),
    )
