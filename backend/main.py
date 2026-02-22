import ee
from fastapi import FastAPI
import os

app = FastAPI()

# Path to your JSON key
SERVICE_ACCOUNT = 'cavite-agri-watch-7717292883ca.json'

try:
    # This is the "Acquisition" part of the Computer Vision benchmark
    credentials = ee.ServiceAccountCredentials("carlo10lg3@gmail.com", SERVICE_ACCOUNT)
    ee.Initialize(credentials)
    print("GEE Initialized Successfully!")
except Exception as e:
    print(f"Failed to initialize GEE: {e}")

@app.get("/map/ndvi")
def get_cavite_ndvi():
    # Benchmark: Image Analysis & Manipulation on raw image data
    # 1. Define Cavite Boundary (Geometry)
    # 2. Filter Sentinel-2 Collection
    # 3. Perform Band Math (NDVI)
    return {"message": "Logic ready for image processing"}

@app.get("/test-gee")
def test_gee():
    try:
        # A simple test: Get the elevation of DLSU-D (approx coords)
        dem = ee.Image('USGS/SRTMGL1_003')
        point = ee.Geometry.Point([120.94, 14.32]) 
        sample = dem.sample(point, 30).first().get('elevation').getInfo()
        
        return {
            "status": "Success",
            "message": "GEE is authenticated",
            "sample_data": f"Elevation at DLSU-D: {sample}m"
        }
    except Exception as e:
        return {"status": "Error", "message": str(e)}