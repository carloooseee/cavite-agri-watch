import ee
import pickle
import pandas as pd
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import asyncio
from datetime import datetime, timedelta
from fastapi.responses import StreamingResponse
from train_model import train_agri_model

app = FastAPI()

# Enable CORS so your Frontend can talk to this Backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. AUTHENTICATION & MODEL LOADING
SERVICE_ACCOUNT_FILE = 'cavite-agri-watch-7717292883ca.json'
SERVICE_ACCOUNT_EMAIL = "carlo10lg3@gmail.com"
MODEL_PATH = 'data/agri_model.pkl'

# Initialize GEE (Benchmark: Information Retrieval)
try:
    credentials = ee.ServiceAccountCredentials(SERVICE_ACCOUNT_EMAIL, SERVICE_ACCOUNT_FILE)
    ee.Initialize(credentials)
    print("GEE Initialized Successfully!")
except Exception as e:
    print(f"Failed to initialize GEE: {e}")

# Load the Brain (Benchmark: Model Deployment)
agri_model = None
if os.path.exists(MODEL_PATH):
    with open(MODEL_PATH, 'rb') as f:
        agri_model = pickle.load(f)
    print("AI Model (agri_model.pkl) loaded successfully!")

# 2. ENDPOINTS
@app.get("/map/ndvi")
def get_cavite_ndvi():
    """Returns a tile URL for the NDVI layer with Anti-Gravity styling."""
    try:
        # Define Cavite using official boundaries
        countries = ee.FeatureCollection("FAO/GAUL/2015/level2")
        cavite = countries.filter(ee.Filter.eq('ADM2_NAME', 'Cavite'))
        
        # Get latest Sentinel-2 image (Image Analysis Benchmark)
        image = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
            .filterBounds(cavite) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) \
            .first()
        
        # Calculate NDVI (Normalized Difference Vegetation Index)
        ndvi = image.normalizedDifference(['B8', 'B4']).rename('ndvi')
        
        # Anti-Gravity Palette: Stress (Red) -> Alert (Yellow) -> Healthy (Neon Green)
        viz_params = {
            'min': 0, 
            'max': 1, 
            'palette': ['#FF0000', '#FFFF00', '#00FF00', '#00FF88'],
            'opacity': 0.7
        }
        
        map_info = ndvi.clip(cavite).getMapId(viz_params)
        return {"url_template": map_info['tile_fetcher'].url_format}
    except Exception as e:
        return {"error": str(e)}

@app.get("/predict/ndvi")
def predict_crop_health():
    """Uses the ML model to foresee future crop health based on history."""
    if not agri_model:
        return {"error": "Model not found. Run train_model.py first."}
    
    try:
        # Load historical data (Benchmark: Pattern Discovery)
        df = pd.read_csv('data/cavite_history.csv')
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date')
        df = df.tail(3)
        
        # Ensure correct order: lag_1 is newest, lag_2 is middle, lag_3 is oldest
        last_3_ndvi = df['ndvi'].values[::-1] 
        input_df = pd.DataFrame([last_3_ndvi], columns=['lag_1', 'lag_2', 'lag_3'])
        
        # Predict 30 days ahead (Benchmark: Foreseeing values)
        prediction = agri_model.predict(input_df)[0]
        current_val = float(last_3_ndvi[0])
        
        return {
            "status": "Success",
            "current_ndvi": current_val,
            "forecast_30_days": float(prediction),
            "trend": "Improving" if prediction > current_val else "Declining",
            "accuracy_metric": "MAE: 0.1390"
        }
    except Exception as e:
        return {"status": "Error", "message": str(e)}

@app.get("/sync-data")
async def sync_data():
    """Three-stage autonomous sync: Extract, Append, Retrain."""
    async def event_generator():
        try:
            # Phase 1: Data Extraction
            yield 'data: ' + json.dumps({"phase": "Extraction", "status": "Fetching current month NDVI..."}) + '\n\n'
            await asyncio.sleep(0.5)
            
            countries = ee.FeatureCollection("FAO/GAUL/2015/level2")
            cavite = countries.filter(ee.Filter.eq('ADM2_NAME', 'Cavite'))
            now = datetime.now()
            start_date = (now - timedelta(days=30)).strftime('%Y-%m-%d')
            end_date = now.strftime('%Y-%m-%d')
            
            collection = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                          .filterBounds(cavite)
                          .filterDate(start_date, end_date)
                          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)))
            
            def get_monthly_stats(img):
                ndvi = img.normalizedDifference(['B8', 'B4']).rename('ndvi')
                stats = ndvi.reduceRegion(reducer=ee.Reducer.mean(), geometry=cavite.geometry(), scale=30, maxPixels=1e9)
                return img.set('date', img.date().format('YYYY-MM-dd')).set('mean_ndvi', stats.get('ndvi'))
            
            processed = collection.map(get_monthly_stats)
            # Run blocking GEE call in thread to avoid freezing FastAPI
            data_list = await asyncio.to_thread(
                lambda: processed.reduceColumns(ee.Reducer.toList(2), ['date', 'mean_ndvi']).get('list').getInfo()
            )
            
            # Phase 2: History Appending
            yield 'data: ' + json.dumps({"phase": "Appending", "status": "Updating cavite_history.csv..."}) + '\n\n'
            await asyncio.sleep(0.5)
            df_new = pd.DataFrame(data_list, columns=['date', 'ndvi'])
            df_new['date'] = pd.to_datetime(df_new['date'])
            df_new = df_new.sort_values('date').dropna()
            
            if not df_new.empty:
                latest_record = df_new.iloc[-1:]
                df_hist = pd.read_csv('data/cavite_history.csv')
                df_hist['date'] = pd.to_datetime(df_hist['date'])
                if latest_record['date'].iloc[0] not in df_hist['date'].values:
                    df_hist = pd.concat([df_hist, latest_record]).sort_values('date')
                    df_hist.to_csv('data/cavite_history.csv', index=False)
            
            # Phase 3: Model Retraining
            yield 'data: ' + json.dumps({"phase": "Retraining", "status": "Triggering agri_model.pkl retraining..."}) + '\n\n'
            await asyncio.sleep(0.5)
            mae_score = await asyncio.to_thread(train_agri_model)
            
            # Reload model into app memory
            global agri_model
            if os.path.exists(MODEL_PATH):
                with open(MODEL_PATH, 'rb') as f:
                    agri_model = pickle.load(f)
            
            yield 'data: ' + json.dumps({"phase": "Completed", "status": f"Sync done. New MAE: {mae_score:.4f}"}) + '\n\n'
        except Exception as e:
            yield 'data: ' + json.dumps({"phase": "Error", "status": str(e)}) + '\n\n'

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/test-gee")
def test_gee():
    return {"status": "Online", "model_ready": agri_model is not None}

@app.get("/")
def read_root():
    return {
        "project": "Cavite Agri-Watch",
        "status": "Operational",
        "phase": 3,
        "author": "Carlos - Lead Dev"
    }

from fastapi import WebSocket, WebSocketDisconnect

# Existing health mapping (You can later replace this with your ML prediction)
HEALTH_DATABASE = {
    "Indang": "Excellent",
    "Silang": "Good",
    "Naic": "Critical",
    "Tanza": "Excellent"
}

@app.websocket("/ws/analytics")
async def websocket_bridge(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive city name from React click
            data = await websocket.receive_json()
            city_name = data.get("name")
            
            # Lookup health
            status = HEALTH_DATABASE.get(city_name, "Stable")
            
            # Push back to Dashboard
            await websocket.send_json({
                "status": status,
                "location": city_name
            })
    except WebSocketDisconnect:
        print("Dashboard disconnected")