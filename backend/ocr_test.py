from google import genai
from PIL import Image
from dotenv import load_dotenv
import os
load_dotenv()


client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
# Load your odometer image
img = Image.open(r"C:\GeoFence_New\Odometer_Data\odometer1.jpeg")

# Prompt the model
response = client.models.generate_content(
    model="gemini-2.0-flash",
    contents=[
        "Identify the odometer in this image and extract the total mileage. "
        "Return only the numerical value in a JSON format like {'mileage': 12345}.", 
        img
    ]
)

print(response.text)