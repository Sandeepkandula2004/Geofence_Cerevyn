# app.py
from fastapi import FastAPI, Depends, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from schemas import SessionStart
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

# utils
from util import get_db, engine, upload_selfie, upload_odometer
from util import extract_odometer_mileage


# models & schemas
from models import Base, Admin, Employee, UserSession, UserLocation, Geofence, GeofenceStatus, DailySummary, GeofenceAssignment
from schemas import AdminCreate, EmployeeCreate, SessionStart, LocationUpdate, GeofenceCreate, GeofenceAssignmentCreate, EmployeeHomeUpdate

import time
from datetime import datetime, date ,timedelta
import requests
from haversine import haversine

app = FastAPI(title="Tracking System - Day 1")

# --------------------------------------------------
# VALIDATION ERROR HANDLER
# --------------------------------------------------
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = await request.body()
    logger.error(f"Validation error at {request.url}")
    logger.error(f"Validation errors: {exc.errors()}")
    logger.error(f"Request body: {body}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )

# --------------------------------------------------
# CORS CONFIGURATION
# --------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (change in production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------
# CREATE TABLES ON STARTUP (SAFE MODE)
# ---------------------------------------------
@app.on_event("startup")
def startup():
    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
        logger.info("✔ Tables checked — existing tables were NOT modified.")
    except Exception as e:
        logger.error(f"❌ Error checking/creating tables: {str(e)}")

# ---------------------------------------------
# ADMIN CREATE
# ---------------------------------------------
@app.post("/admin/create")
def create_admin(data: AdminCreate, db: Session = Depends(get_db)):
    admin = Admin(name=data.name, email=data.email, password_hash="default_admin_password_hash")
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return {"message": "Admin created", "admin_id": admin.id}

# ---------------------------------------------
# EMPLOYEE CREATE
# ---------------------------------------------
@app.post("/employee/create")
def create_employee(data: EmployeeCreate, db: Session = Depends(get_db)):
    emp = Employee(name=data.name, employee_code=data.employee_code)
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return {"message": "Employee created", "employee_id": emp.id}


# ---------------------------------------------
# EMPLOYEE LIST (ADMIN)
# ---------------------------------------------
@app.get("/admin/employees")
def list_employees(db: Session = Depends(get_db)):
    employees = db.query(Employee).order_by(Employee.created_at.desc()).all()
    return [
        {
            "id": e.id,
            "name": e.name,
            "employee_code": e.employee_code,
            "is_active": e.is_active,
            "created_at": e.created_at,
        }
        for e in employees
    ]


# ---------------------------------------------
# ROOT
# ---------------------------------------------
@app.get("/")
def root():
    return {"message": "Tracking backend running (Day 1 complete)"}


# ----------------------------------------------------------
# EMPLOYEE CHECK-IN (START SESSION)
# ----------------------------------------------------------
@app.post("/session/start")
def start_session(
    data: str = Form(...),  # Receive as string
    selfie: UploadFile = File(...),
    odometer: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"Starting session - parsing data...")
        # Parse the JSON string
        import json
        session_data = json.loads(data)
        parsed_data = SessionStart(**session_data)
        logger.info(f"Parsed session data: employee_id={parsed_data.employee_id}, employee_code={parsed_data.employee_code}")
        
        # Find employee by ID or code
        employee = None
        if parsed_data.employee_id:
            employee = db.query(Employee).filter(Employee.id == parsed_data.employee_id).first()
            logger.info(f"Looking up employee by ID: {parsed_data.employee_id}")
        elif parsed_data.employee_code:
            employee = db.query(Employee).filter(Employee.employee_code == parsed_data.employee_code).first()
            logger.info(f"Looking up employee by code: {parsed_data.employee_code}")
        
        if not employee:
            logger.error(f"Employee not found for ID/code: {parsed_data.employee_id or parsed_data.employee_code}")
            raise HTTPException(status_code=404, detail="Employee not found")
        
        logger.info(f"Employee found: {employee.name} (ID: {employee.id})")

        # --------------------------------------------------
        # Enforce HOME check-in (must be within home_radius_m)
        # --------------------------------------------------
        if employee.home_lat is not None and employee.home_lng is not None and employee.home_radius_m is not None:
            distance_km = haversine((employee.home_lat, employee.home_lng), (parsed_data.lat, parsed_data.lng))
            if distance_km > (employee.home_radius_m / 1000.0):
                logger.error(
                    f"Check-in denied: outside home radius. distance_km={distance_km:.4f}, allowed_km={employee.home_radius_m/1000.0:.4f}"
                )
                raise HTTPException(status_code=403, detail="Check-in location not at home")
        else:
            logger.warning("Employee home location not set; skipping home radius check")

        # --------------------------------------------------
        # Face verification via microservice (port 7000)
        # --------------------------------------------------
        try:
            # Use sync file read (we are in a sync def)
            files = {"file": (selfie.filename or "selfie.jpg", selfie.file.read(), selfie.content_type or "image/jpeg")}
            face_resp = requests.post("http://localhost:7000/face/verify", files=files, timeout=20)
            face_resp.raise_for_status()
            face_json = face_resp.json()
            logger.info(f"Face verify response: {face_json}")
            if not face_json.get("match"):
                raise HTTPException(status_code=401, detail="Face not recognized")
            verified_id = face_json.get("employee_id")
            if verified_id != employee.id:
                raise HTTPException(status_code=401, detail="Face does not match employee")
        except HTTPException:
            raise
        except Exception as exc:
            logger.error(f"Face verification failed: {exc}")
            raise HTTPException(status_code=502, detail="Face verification service error")
        
        # Upload images to the correct Supabase buckets
        logger.info(f"Uploading selfie and odometer images...")
        # Rewind file if needed after verify
        try:
            selfie.file.seek(0)
        except Exception:
            pass
        selfie_url = upload_selfie(selfie)
        odo_url = upload_odometer(odometer)
        logger.info(f"Images uploaded - selfie_url: {selfie_url}, odo_url: {odo_url}")

        # Placeholder odometer reading (extract later)
        odo_value = extract_odometer_mileage(odometer)
        logger.info(f"Odometer value extracted: {odo_value}")

        # Create session
        session = UserSession(
            employee_id=employee.id,
            check_in_selfie_url=selfie_url,
            odometer_start_image_url=odo_url,
            odometer_start_value=odo_value,
            start_lat=parsed_data.lat,
            start_lng=parsed_data.lng
        )

        db.add(session)
        db.commit()
        db.refresh(session)
        logger.info(f"✅ Session created successfully - Session ID: {session.id}")
        logger.info(f"Session details: employee_id={session.employee_id}, lat={session.start_lat}, lng={session.start_lng}")

        return {
            "message": "Session started",
            "session_id": session.id,
            "employee_id": session.employee_id,
            "selfie_url": selfie_url,
            "odometer_url": odo_url,
            "odometer_value": odo_value
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error in start_session: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ----------------------------------------------------------
# ADMIN: SET EMPLOYEE HOME COORDS
# ----------------------------------------------------------
@app.put("/admin/employee/{employee_id}/home")
def set_employee_home(employee_id: int, data: EmployeeHomeUpdate, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp.home_lat = data.home_lat
    emp.home_lng = data.home_lng
    emp.home_radius_m = data.home_radius_m
    db.commit()
    return {"message": "Employee home updated", "employee_id": employee_id}


# ----------------------------------------------------------
# ADMIN: ENROLL EMPLOYEE FACE (proxy to face service)
# ----------------------------------------------------------
@app.post("/admin/employee/{employee_id}/enroll-face")
def enroll_employee_face_route(
    employee_id: int,
    file: UploadFile | None = File(None),
    image_url: str | None = Form(None),
    db: Session = Depends(get_db)
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    try:
        if image_url:
            data = {"image_url": image_url}
            resp = requests.post(f"http://localhost:7000/face/enroll/{employee_id}", data=data, timeout=180)
        elif file is not None:
            files = {"file": (file.filename or "face.jpg", file.file.read(), file.content_type or "image/jpeg")}
            resp = requests.post(f"http://localhost:7000/face/enroll/{employee_id}", files=files, timeout=180)
        else:
            raise HTTPException(status_code=400, detail="Provide file or image_url")
        resp.raise_for_status()
        return resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Enroll face failed: {exc}")
        raise HTTPException(status_code=502, detail="Face enrollment service error")


# ----------------------------------------------------------
# ADMIN: DELETE EMPLOYEE (and face)
# ----------------------------------------------------------
@app.delete("/admin/employee/{employee_id}")
def delete_employee(employee_id: int, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # call face service delete (best effort)
    try:
        requests.delete(f"http://localhost:7000/face/delete/{employee_id}", timeout=20)
    except Exception as exc:
        logger.warning(f"Face delete warning: {exc}")

    # Also remove local EmployeeFace if exists
    try:
        from models import EmployeeFace
        face = db.query(EmployeeFace).filter(EmployeeFace.employee_id == employee_id).first()
        if face:
            db.delete(face)
            db.commit()
    except Exception as exc:
        logger.warning(f"Local face row delete warning: {exc}")

    # Finally delete employee
    db.delete(emp)
    db.commit()
    return {"message": "Employee deleted", "employee_id": employee_id}



# ----------------------------------------------------------
# LOCATION UPDATE LOGGING(10 sec - FOR DISTANCE /60 sec - SQL) - FOR POLYLINE  
# ----------------------------------------------------------
@app.post("/tracking/update-location")
def update_location(
    data: LocationUpdate,
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"Location update received - session_id: {data.session_id}, lat: {data.lat}, lng: {data.lng}")
        
        # --------------------------------------------------
        # 1️⃣ Validate session
        # --------------------------------------------------
        session = (
            db.query(UserSession)
            .filter(UserSession.id == data.session_id)
            .first()
        )
        if not session:
            logger.error(f"Invalid session ID: {data.session_id}")
            raise HTTPException(status_code=404, detail="Session not found")

        logger.info(f"Session validated - employee_id: {session.employee_id}")

        # --------------------------------------------------
        # 2️⃣ Update last known position (for reports)
        # --------------------------------------------------
        session.end_lat = data.lat # type: ignore
        session.end_lng = data.lng # type: ignore
        db.commit()
        logger.debug(f"Session position updated: {data.lat}, {data.lng}")

        # --------------------------------------------------
        # 3️⃣ POLYLINE LOGGING (EVERY 60 SECONDS)
        # --------------------------------------------------
        last_point = (
            db.query(UserLocation)
            .filter(UserLocation.session_id == data.session_id)
            .order_by(UserLocation.timestamp.desc())
            .first()
        )

        current_time = datetime.utcnow()
        should_log_polyline = (
            not last_point or
            (current_time - last_point.timestamp).total_seconds() >= 60
        )

        if should_log_polyline:
            logger.info(f"Logging polyline point for session {data.session_id}")
            user_loc = UserLocation(
                session_id=data.session_id,
                employee_id=session.employee_id,
                lat=data.lat,
                lng=data.lng,
                timestamp=current_time
            )
            db.add(user_loc)
            db.commit()
            logger.debug(f"Polyline point logged")

        # --------------------------------------------------
        # 4️⃣ GEOFENCE CHECK (EVERY 10 SECONDS)
        # --------------------------------------------------
        geofences = db.query(Geofence).all()
        logger.debug(f"Checking {len(geofences)} geofences")

        geofence_count = 0
        for gf in geofences:
            dist_km = haversine(
                (gf.center_lat, gf.center_lng),
                (data.lat, data.lng)
            )

            logger.debug(f"Geofence {gf.id} ({gf.name}): distance = {dist_km:.4f} km, radius = {gf.radius_m/1000:.4f} km")

            # Check if employee is within geofence
            if dist_km <= (gf.radius_m / 1000.0):
                logger.info(f"Employee inside geofence: {gf.name} (ID: {gf.id})")
                
                # Check if this geofence was already completed in this session
                already_done = (
                    db.query(GeofenceStatus)
                    .filter(
                        GeofenceStatus.geofence_id == gf.id,
                        GeofenceStatus.session_id == data.session_id
                    )
                    .first()
                )

                # Mark geofence as completed if not already done
                if not already_done:
                    logger.info(f"Marking geofence {gf.id} as completed for session {data.session_id}")
                    
                    # Log entry point
                    entry_point = UserLocation(
                        session_id=data.session_id,
                        employee_id=session.employee_id,
                        lat=data.lat,
                        lng=data.lng,
                        timestamp=current_time
                    )
                    db.add(entry_point)

                    # Create geofence status
                    status = GeofenceStatus(
                        geofence_id=gf.id,
                        session_id=data.session_id,
                        employee_id=session.employee_id,
                        completed=True,
                        completed_at=current_time
                    )
                    db.add(status)
                    db.commit()
                    geofence_count += 1
                    logger.info(f"Geofence {gf.id} completed and recorded")
                else:
                    logger.debug(f"Geofence {gf.id} already completed in this session")

        logger.info(f"Location update processed - polyline_logged: {should_log_polyline}, geofences_completed: {geofence_count}")

        return {
            "message": "Location processed",
            "session_id": data.session_id,
            "lat": data.lat,
            "lng": data.lng,
            "polyline_logged": should_log_polyline,
            "geofences_completed": geofence_count
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in update_location: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))



# ----------------------------------------------------------
# GET POLYLINE FOR SESSION
# ----------------------------------------------------------
@app.get("/tracking/polyline/{session_id}")
def get_polyline(session_id: int, db: Session = Depends(get_db)):

    points = (
        db.query(UserLocation)
        .filter(UserLocation.session_id == session_id)
        .order_by(UserLocation.timestamp.asc())
        .all()
    )

    return [
        {
            "lat": p.lat,
            "lng": p.lng,
            "timestamp": p.timestamp
        }
        for p in points
    ]

# ----------------------------------------------------------
# GEOFENCE CREATE BY ADMIN
# ----------------------------------------------------------
@app.post("/geofence/create")
def create_geofence(data: GeofenceCreate, db: Session = Depends(get_db)):
    gf = Geofence(
        name=data.name,
        center_lat=data.center_lat,
        center_lng=data.center_lng,
        radius_m=data.radius_m
    )
    db.add(gf)
    db.commit()
    db.refresh(gf)

    return {
        "message": "Geofence created",
        "geofence_id": gf.id
    }


# ----------------------------------------------------------
# GEOFENCE DELETE BY ADMIN
# ----------------------------------------------------------
@app.delete("/geofence/{geofence_id}")
def delete_geofence(geofence_id: int, db: Session = Depends(get_db)):
    geofence = (
        db.query(Geofence)
        .filter(Geofence.id == geofence_id)
        .first()
    )

    if not geofence:
        return {"error": "Geofence not found"}, 404

    # Clean up geofence statuses
    db.query(GeofenceStatus).filter(
        GeofenceStatus.geofence_id == geofence_id
    ).delete()

    db.delete(geofence)
    db.commit()

    return {
        "message": "Geofence deleted",
        "geofence_id": geofence_id
    }


# ----------------------------------------------------------
# ODOMETER CHECK-OUT (END SESSION) AND DAILY SUMMARY
# ----------------------------------------------------------

@app.post("/session/checkout")
def checkout_session(
    session_id: int = Form(...),
    odometer: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # --------------------------------------------------
    # 1️⃣ Validate session
    # --------------------------------------------------
    session = (
        db.query(UserSession)
        .filter(UserSession.id == session_id)
        .first()
    )
    if not session:
        return {"error": "Invalid session"}

    if session.check_out_time: # type: ignore
        return {"error": "Session already checked out"}

    # --------------------------------------------------
    # 2️⃣ Upload odometer end image
    # --------------------------------------------------
    odo_end_url = upload_odometer(odometer)
    if not odo_end_url:
        return {"error": "Odometer upload failed"}

    # --------------------------------------------------
    # 3️⃣ OCR extract odometer mileage (Gemini)
    # --------------------------------------------------
    odo_end_value = extract_odometer_mileage(odometer)

    # --------------------------------------------------
    # 4️⃣ Close session
    # --------------------------------------------------
    session.check_out_time = datetime.utcnow() # type: ignore
    session.odometer_end_image_url = odo_end_url # type: ignore
    session.odometer_end_value = odo_end_value  # type: ignore

    odo_start = session.odometer_start_value or 0.0
    odo_distance = max(odo_end_value - odo_start, 0.0)

    db.commit()

    # --------------------------------------------------
    # 5️⃣ Count completed geofences
    # --------------------------------------------------
    geofence_count = (
        db.query(GeofenceStatus)
        .filter(
            GeofenceStatus.session_id == session.id,
            GeofenceStatus.completed == True
        )
        .count()
    )

    # --------------------------------------------------
    # 6️⃣ Create DAILY SUMMARY (DAY 6 CORE)
    # --------------------------------------------------
    summary = DailySummary(
        employee_id=session.employee_id,
        date=date.today(),

        total_distance = round(odo_distance, 3), # type: ignore
        odometer_start=odo_start,
        odometer_end=odo_end_value,
        

        geofence_count=geofence_count,

        start_lat=session.start_lat,
        start_lng=session.start_lng,
        end_lat=session.end_lat,
        end_lng=session.end_lng
    )

    db.add(summary)
    db.commit()

    return {
        "message": "Session checked out successfully",
        "session_id": session.id,
        "odometer_distance_km": round(odo_distance, 3), # type: ignore
        "geofence_count": geofence_count
    }



                                        # ----------------------------------------------------------#
                                                        # ADMIN DASHBOARD REPORTS
                                        # ----------------------------------------------------------#


# ----------------------------------------------------------
# SUMMARY REPORT FOR EMPLOYEE OR ADMIN
# ----------------------------------------------------------

@app.get("/summary/{employee_id}")
def get_daily_summary(employee_id: int, db: Session = Depends(get_db)):

    summaries = (
        db.query(DailySummary)
        .filter(DailySummary.employee_id == employee_id)
        .order_by(DailySummary.date.desc())
        .all()
    )

    return [
        {
            "date": s.date,
            "distance_km": s.total_distance,
            "odometer_start": s.odometer_start,
            "odometer_end": s.odometer_end,
            "start": [s.start_lat, s.start_lng],
            "end": [s.end_lat, s.end_lng]
        }
        for s in summaries
    ]


# ----------------------------------------------------------
# SUMMARY REPORT OF ALL EMPLOYEES FOR TODAY
# ----------------------------------------------------------
@app.get("/admin/summary/today")
def today_summary(db: Session = Depends(get_db)):
    today = date.today()

    summaries = (
        db.query(DailySummary)
        .filter(DailySummary.date == today)
        .all()
    )

    return summaries


# ----------------------------------------------------------
# SUMMARY REPORT OF ALL EMPLOYEES FOR YESTERDAY
# ----------------------------------------------------------
@app.get("/admin/summary/yesterday")
def yesterday_summary(db: Session = Depends(get_db)):
    yesterday = date.today() - timedelta(days=1)

    summaries = (
        db.query(DailySummary)
        .filter(DailySummary.date == yesterday)
        .all()
    )

    return summaries

# ----------------------------------------------------------
# SUMMARY REPORT OF ALL EMPLOYEES FOR THE WEEK
# ----------------------------------------------------------
@app.get("/admin/summary/weekly")
def weekly_summary(db: Session = Depends(get_db)):
    start_date = date.today() - timedelta(days=7)

    summaries = (
        db.query(DailySummary)
        .filter(DailySummary.date >= start_date)
        .order_by(DailySummary.date.desc())
        .all()
    )

    return summaries

# ----------------------------------------------------------
# SUMMARY REPORT FOR A SPECIFIC EMPLOYEE
# ----------------------------------------------------------
@app.get("/admin/summary/employee/{employee_id}")
def employee_summary(employee_id: int, db: Session = Depends(get_db)):
    summaries = (
        db.query(DailySummary)
        .filter(DailySummary.employee_id == employee_id)
        .order_by(DailySummary.date.desc())
        .all()
    )
    return summaries


# ----------------------------------------------------------
# ALL SESSIONS REPORT FOR A SPECIFIC EMPLOYEE
# ----------------------------------------------------------
@app.get("/admin/employee/{employee_id}/sessions")
def get_employee_sessions(employee_id: int, db: Session = Depends(get_db)):

    sessions = (
        db.query(UserSession)
        .filter(UserSession.employee_id == employee_id)
        .order_by(UserSession.check_in_time.desc())
        .all()
    )

    return [
        {
            "session_id": s.id,
            "check_in_time": s.check_in_time,
            "check_out_time": s.check_out_time,
            "start": [s.start_lat, s.start_lng],
            "end": [s.end_lat, s.end_lng]
        }
        for s in sessions
    ]


# ----------------------------------------------------------
# PARTICULAR SESSION DETAILS REPORT
# ----------------------------------------------------------
@app.get("/admin/session/{session_id}")
def get_session_details(session_id: int, db: Session = Depends(get_db)):

    session = (
        db.query(UserSession)
        .filter(UserSession.id == session_id)
        .first()
    )

    if not session:
        return {"error": "Session not found"}

    return {
        "session_id": session.id,
        "employee_id": session.employee_id,
        "check_in_time": session.check_in_time,
        "check_out_time": session.check_out_time,
        "odometer_start": session.odometer_start_value,
        "odometer_end": session.odometer_end_value,
        "start": [session.start_lat, session.start_lng],
        "end": [session.end_lat, session.end_lng]
    }


# ----------------------------------------------------------
# SESSION POLYLINE REPORT (ADMIN CAN SEE THE SESSION PATH ON MAP)
# ----------------------------------------------------------
@app.get("/admin/session/{session_id}/polyline")
def get_session_polyline(session_id: int, db: Session = Depends(get_db)):

    points = (
        db.query(UserLocation)
        .filter(UserLocation.session_id == session_id)
        .order_by(UserLocation.timestamp.asc())
        .all()
    )

    return [
        {
            "lat": p.lat,
            "lng": p.lng,
            "timestamp": p.timestamp
        }
        for p in points
    ]


# ----------------------------------------------------------
# LIST ALL GEOFENCES(I DONT KNOW WHY THIS IS NEEDED)
# ----------------------------------------------------------
@app.get("/admin/geofences")
def list_geofences(db: Session = Depends(get_db)):

    geofences = db.query(Geofence).all()

    return [
        {
            "geofence_id": g.id,
            "name": g.name,
            "center": [g.center_lat, g.center_lng],
            "radius_m": g.radius_m
        }
        for g in geofences
    ]


# ----------------------------------------------------------
# LIST ALL GEOFENCES COMPLETIONS FOR A PARTICULAR SESSION (I DONT KNOW WHY THIS IS NEEDED)
# ----------------------------------------------------------
@app.get("/admin/session/{session_id}/geofences")
def geofence_completion(session_id: int, db: Session = Depends(get_db)):

    statuses = (
        db.query(GeofenceStatus)
        .filter(GeofenceStatus.session_id == session_id)
        .all()
    )

    return [
        {
            "geofence_id": s.geofence_id,
            "completed": s.completed,
            "completed_at": s.completed_at
        }
        for s in statuses
    ]


# ----------------------------------------------------------
# LIVE LOCATION FOR A SESSION (LATEST POINT)
# ----------------------------------------------------------

@app.get("/admin/live-location/{session_id}")
def get_live_location(session_id: int, db: Session = Depends(get_db)):

    point = (
        db.query(UserLocation)
        .filter(UserLocation.session_id == session_id)
        .order_by(UserLocation.timestamp.desc())
        .first()
    )

    if not point:
        return {"status": "no data"}

    return {
        "lat": point.lat,
        "lng": point.lng,
        "timestamp": point.timestamp
    }



# --------------------------------------------------
# CLEANUP OLD GPS SQL LOGS (OLDER THAN 30 DAYS)
# --------------------------------------------------

@app.delete("/admin/cleanup/gps")
def cleanup_old_gps(db: Session = Depends(get_db)):

    cutoff = datetime.utcnow() - timedelta(days=30)

    deleted = (
        db.query(UserLocation)
        .filter(UserLocation.timestamp < cutoff)
        .delete()
    )

    db.commit()

    return {
        "message": "Old GPS logs cleaned",
        "rows_deleted": deleted
    }


# ----------------------------------------------------------
# GEOFENCE ASSIGNMENTS (ADMIN ASSIGNS TARGETS TO EMPLOYEES)
# ----------------------------------------------------------

@app.post("/admin/assign-geofence")
def assign_geofence(data: GeofenceAssignmentCreate, db: Session = Depends(get_db)):
    assignment = GeofenceAssignment(
        employee_id=data.employee_id,
        geofence_id=data.geofence_id,
        assigned_date=data.assigned_date,
        assigned_by=None  # Will be set from auth context later
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return {
        "message": "Geofence assigned",
        "assignment_id": assignment.id
    }


@app.delete("/admin/assignment/{assignment_id}")
def delete_assignment(assignment_id: int, db: Session = Depends(get_db)):
    """Delete a geofence assignment"""
    assignment = db.query(GeofenceAssignment).filter(
        GeofenceAssignment.id == assignment_id
    ).first()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    db.delete(assignment)
    db.commit()
    return {"message": "Assignment deleted successfully"}


@app.get("/employee/{employee_identifier}/targets")
def get_employee_targets(employee_identifier: str, db: Session = Depends(get_db)):
    """Get today's geofence targets for an employee (by ID or code)"""
    today = date.today()
    
    # Try to find employee by ID first, then by code
    employee = None
    try:
        emp_id = int(employee_identifier)
        employee = db.query(Employee).filter(Employee.id == emp_id).first()
    except ValueError:
        # Not a number, try by code
        employee = db.query(Employee).filter(Employee.employee_code == employee_identifier).first()
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    assignments = (
        db.query(GeofenceAssignment)
        .filter(
            GeofenceAssignment.employee_id == employee.id,
            GeofenceAssignment.assigned_date == today
        )
        .all()
    )
    
    result = []
    for assign in assignments:
        geofence = db.query(Geofence).filter(Geofence.id == assign.geofence_id).first()
        if geofence:
            result.append({
                "assignment_id": assign.id,
                "geofence_id": geofence.id,
                "geofence_name": geofence.name,
                "center": [geofence.center_lat, geofence.center_lng],
                "radius_m": geofence.radius_m,
                "assigned_date": assign.assigned_date
            })
    
    return result


@app.get("/employee/{employee_identifier}/info")
def get_employee_info(employee_identifier: str, db: Session = Depends(get_db)):
    """Get employee name for welcome screen (by ID or code)"""
    # Try to find employee by ID first, then by code
    employee = None
    try:
        emp_id = int(employee_identifier)
        employee = db.query(Employee).filter(Employee.id == emp_id).first()
    except ValueError:
        # Not a number, try by code
        employee = db.query(Employee).filter(Employee.employee_code == employee_identifier).first()
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    return {
        "id": employee.id,
        "name": employee.name,
        "employee_code": employee.employee_code
    }
