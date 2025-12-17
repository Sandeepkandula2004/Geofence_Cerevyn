import os
import uuid
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from supabase import create_client
from google import genai


load_dotenv()

# --------------------------------------------------
# SUPABASE CONFIG
# --------------------------------------------------
SUPABASE_PROJECT_URL = os.getenv("SUPABASE_PROJECT_URL")
SUPABASE_ANON_KEY = os.getenv("ANON_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")

if not SUPABASE_PROJECT_URL:
    raise ValueError("SUPABASE_PROJECT_URL environment variable must be set")

if not SUPABASE_ANON_KEY:
    raise ValueError("ANON_KEY environment variable must be set")

if not SUPABASE_DB_URL:
    raise ValueError("SUPABASE_DB_URL environment variable must be set")

supabase = create_client(SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY)

# --------------------------------------------------
# GEMINI CLIENT (for OCR)
# --------------------------------------------------
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

# --------------------------------------------------
# DATABASE (Supabase PostgreSQL)
# --------------------------------------------------
# Enable pool_pre_ping to transparently recover dropped connections and pool_recycle
# to refresh stale connections from the pool. These reduce OperationalError when the
# DB closes idle connections (common on managed / free tiers).
engine = create_engine(
    SUPABASE_DB_URL,
    pool_pre_ping=True,
    pool_recycle=1800,  # recycle connections every 30 minutes
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --------------------------------------------------
# GENERIC IMAGE UPLOAD FUNCTION
# --------------------------------------------------
def upload_to_bucket(file, bucket_name: str):
    try:
        file_bytes = file.file.read()
        ext = file.filename.split(".")[-1]
        file_name = f"{uuid.uuid4()}.{ext}"

        print("Uploading to bucket:", bucket_name, "as", file_name)

        supabase.storage.from_(bucket_name).upload(file_name, file_bytes)

        public_url = supabase.storage.from_(bucket_name).get_public_url(file_name)

        print("Uploaded URL:", public_url)

        return public_url

    except Exception as e:
        print("Upload error:", e)
        return None


# --------------------------------------------------
# SPECIALIZED IMAGE UPLOADS
# --------------------------------------------------
def upload_selfie(file):
    return upload_to_bucket(file, "selfies")

def upload_odometer(file):
    return upload_to_bucket(file, "odometers")




# --------------------------------------------------
# ODOMETER OCR EXTRACTION (Gemini)
# --------------------------------------------------
def extract_odometer_mileage(file) -> float:
    """Extract the odometer mileage from an uploaded file using Gemini OCR.

    Returns a float mileage if parsed; otherwise returns 0.0.
    """
    if not gemini_client:
        return 0.0

    try:
        # Read file bytes from UploadFile-like object
        file_bytes = file.file.read() if hasattr(file, "file") else file.read()
        # Construct an image payload compatible with Gemini client
        # The genai client in ocr_test accepts PIL Image directly; for API simplicity here
        # we pass raw bytes with a generic prompt.
        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                (
                    "Identify the odometer reading in this image and return only a JSON like {\"mileage\": 12345}."
                ),
                file_bytes,
            ],
        )
        text = getattr(response, "text", "")
        # Attempt to parse a number from the response text
        import re, json
        mileage = 0.0
        # Try JSON parsing first
        try:
            data = json.loads(text)
            val = data.get("mileage")
            if isinstance(val, (int, float)):
                mileage = float(val)
        except Exception:
            # Fallback: find first integer/float in text
            match = re.search(r"\b(\d{1,8}(?:\.\d{1,2})?)\b", text)
            if match:
                mileage = float(match.group(1))
        return mileage
    except Exception:
        return 0.0