# pyrefly: ignore [missing-import]
import ee
import pickle
import pandas as pd
import numpy as np
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import asyncio
import base64
from datetime import datetime, timedelta
from fastapi.responses import StreamingResponse
from train_model import train_agri_model
import paper_models
import zone_analysis

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

# Load the research models from /models (CNN 5.2.1, Random Forest 5.2.3, OPA calibrator 5.2.4)
paper_models.load_models()

# 2. ENDPOINTS
@app.get("/map/ndvi")
def get_cavite_ndvi():
    """Returns a tile URL for the NDVI layer — full Cavite coverage via median composite."""
    try:
        # Define Cavite using official boundaries
        countries = ee.FeatureCollection("FAO/GAUL/2015/level2")
        cavite = countries.filter(ee.Filter.eq('ADM2_NAME', 'Cavite'))

        # Use a 90-day median composite so every part of Cavite is covered.
        # .first() only returns one satellite swath, leaving gaps.
        # A median composite merges all available passes into one seamless image.
        now = datetime.now()
        start = (now - timedelta(days=90)).strftime('%Y-%m-%d')
        end = now.strftime('%Y-%m-%d')

        def mask_clouds(img):
            qa = img.select('QA60')
            cloud_mask = 1 << 10
            cirrus_mask = 1 << 11
            mask = qa.bitwiseAnd(cloud_mask).eq(0).And(qa.bitwiseAnd(cirrus_mask).eq(0))
            return img.updateMask(mask).divide(10000).copyProperties(img, ['system:time_start'])

        composite = (
            ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
            .filterBounds(cavite)
            .filterDate(start, end)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
            .map(mask_clouds)
            .median()
            .clip(cavite)
        )

        # Calculate NDVI from the full composite
        ndvi = composite.normalizedDifference(['B8', 'B4']).rename('ndvi')

        # Mask out non-vegetation (NDVI < 0.2 = urban, water, bare soil)
        ndvi = ndvi.updateMask(ndvi.gt(0.2))

        # Stress (Red) -> Alert (Yellow) -> Healthy (Neon Green)
        viz_params = {
            'min': 0.2,
            'max': 0.85,
            'palette': ['#FF0000', '#FFFF00', '#00FF00', '#00FF88'],
            'opacity': 0.75
        }
        
        map_info = ndvi.clip(cavite).getMapId(viz_params)
        return {"url_template": map_info['tile_fetcher'].url_format}
    except Exception as e:
        return {"error": str(e)}

@app.post("/map/ndvi/zone")
async def get_zone_ndvi_polygon(request: Request):
    """
    Accepts a GeoJSON geometry (Polygon or MultiPolygon) in the request body.
    Clips the NDVI composite to the EXACT municipality shape — not a bounding box.
    This ensures vegetation is only highlighted within the actual polygon boundary.
    """
    try:
        body = await request.json()
        # GEE accepts GeoJSON geometry objects directly
        zone_geom = ee.Geometry(body)

        now = datetime.now()
        start = (now - timedelta(days=90)).strftime('%Y-%m-%d')
        end = now.strftime('%Y-%m-%d')

        def mask_clouds(img):
            qa = img.select('QA60')
            cloud_mask = 1 << 10
            cirrus_mask = 1 << 11
            mask = qa.bitwiseAnd(cloud_mask).eq(0).And(qa.bitwiseAnd(cirrus_mask).eq(0))
            return img.updateMask(mask).divide(10000).copyProperties(img, ['system:time_start'])

        composite = (
            ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
            .filterBounds(zone_geom)
            .filterDate(start, end)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
            .map(mask_clouds)
            .median()
            .clip(zone_geom)  # Clips to the exact polygon, not a rectangle
        )

        ndvi = composite.normalizedDifference(['B8', 'B4']).rename('ndvi')
        # Mask buildings, roads, water (NDVI < 0.2 = non-vegetation)
        ndvi = ndvi.updateMask(ndvi.gt(0.2))

        viz_params = {
            'min': 0.2,
            'max': 0.85,
            'palette': ['#FF0000', '#FFFF00', '#00FF00', '#00FF88'],
            'opacity': 0.8
        }

        map_info = ndvi.getMapId(viz_params)
        return {"url_template": map_info['tile_fetcher'].url_format}
    except Exception as e:
        return {"error": str(e)}

@app.post("/map/satellite/zone")
async def get_zone_satellite_polygon(request: Request):
    """
    Returns a true color (RGB) satellite image for the requested geometry.
    """
    try:
        body = await request.json()
        zone_geom = ee.Geometry(body)

        now = datetime.now()
        start = (now - timedelta(days=90)).strftime('%Y-%m-%d')
        end = now.strftime('%Y-%m-%d')

        def mask_clouds(img):
            qa = img.select('QA60')
            cloud_mask = 1 << 10
            cirrus_mask = 1 << 11
            mask = qa.bitwiseAnd(cloud_mask).eq(0).And(qa.bitwiseAnd(cirrus_mask).eq(0))
            return img.updateMask(mask).divide(10000).copyProperties(img, ['system:time_start'])

        composite = (
            ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
            .filterBounds(zone_geom)
            .filterDate(start, end)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
            .map(mask_clouds)
            .median()
            .clip(zone_geom)
        )

        viz_params = {
            'bands': ['B4', 'B3', 'B2'], # True color RGB
            'min': 0.0,
            'max': 0.3,
        }

        map_info = composite.getMapId(viz_params)
        return {"url_template": map_info['tile_fetcher'].url_format}
    except Exception as e:
        return {"error": str(e)}
# Solid vegetation colors based on forecast results:
SOLID_VEG_COLORS = {
    'healthy': '#00FF88',   # Solid Vibrant Neon Green
    'warning': '#FACC15',   # Solid Amber Yellow
    'stressed': '#EF4444',  # Solid Crimson Red
}
BUILT_AREA_COLOR = '#111827'  # Deep dark solid black for built area, roads, and water bodies

def get_veg_color(status: str) -> str:
    s = (status or "").lower()
    if 'warn' in s or 'moderat' in s or 'alert' in s or 'mild' in s:
        return SOLID_VEG_COLORS['warning']
    elif 'stress' in s or 'damag' in s or 'danger' in s or 'sever' in s:
        return SOLID_VEG_COLORS['stressed']
    return SOLID_VEG_COLORS['healthy']


@app.get("/map/dynamic-world")
def get_cavite_dynamic_world():
    """Returns a tile URL for the Dynamic World LULC layer across Cavite with solid black built/roads/water and solid green vegetation."""
    try:
        countries = ee.FeatureCollection("FAO/GAUL/2015/level2")
        cavite = countries.filter(ee.Filter.eq('ADM2_NAME', 'Cavite'))

        now = datetime.now()
        start = (now - timedelta(days=180)).strftime('%Y-%m-%d')
        end = now.strftime('%Y-%m-%d')

        # 1. Base Dynamic World Mask (Mode composite over 180 days avoids single-cloud misclassification)
        dw = (
            ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
            .filterBounds(cavite)
            .filterDate(start, end)
            .select('label')
            .reduce(ee.Reducer.mode())
            .rename('label')
            # Fill Dynamic World coverage gaps (cloudy/mountainous areas like GEA & Maragondon)
            # with a neutral class (-1) so the NDVI/NDBI physics checks decide instead of
            # the masked pixels silently falling back to black "missing patches".
            .unmask(-1)
        )

        # 2. Physics-Based Correction using NDVI and NDBI with cloud-free fallback
        def mask_clouds(img):
            qa = img.select('QA60')
            cloud_mask = 1 << 10
            cirrus_mask = 1 << 11
            mask = qa.bitwiseAnd(cloud_mask).eq(0).And(qa.bitwiseAnd(cirrus_mask).eq(0))
            return img.updateMask(mask).divide(10000)

        s2_coll = (
            ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
            .filterBounds(cavite)
            .filterDate(start, end)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        )
        s2_composite = s2_coll.map(mask_clouds).median().unmask(s2_coll.median())
        ndvi = s2_composite.normalizedDifference(['B8', 'B4']).rename('ndvi')
        ndbi = s2_composite.normalizedDifference(['B11', 'B8']).rename('ndbi')
        ndwi = s2_composite.normalizedDifference(['B3', 'B8']).rename('ndwi')

        # Cavite province baseline: solid healthy green
        veg_color = SOLID_VEG_COLORS['healthy']

        # 3. Comprehensive Non-Vegetation Mask (Roads, Buildings, Bare Ground, Water):
        # - Water/Ocean/Bays: DW 0, negative NDVI, or positive NDWI
        # - Built & Roads: NDVI < 0.28, or DW built/bare (with NDVI < 0.48 to avoid false cloud/shadow patches over crops)
        is_water = dw.eq(0).Or(ndvi.lt(0.0)).Or(ndvi.lt(0.12).And(ndwi.gt(0.0)))
        is_non_veg = (
            is_water
            .Or(ndvi.lt(0.28))
            .Or(dw.eq(6).And(ndvi.lt(0.48)))
            .Or(dw.eq(7).And(ndvi.lt(0.38)))
            .Or(ndbi.gt(-0.02).And(ndvi.lt(0.35)))
        )
        is_veg = is_non_veg.Not()

        # Solid black base for all roads, built areas, and water (#111827)
        built_viz = ee.Image.constant(1).visualize(palette=[BUILT_AREA_COLOR])
        # Solid colored vegetation (#00FF88)
        veg_viz = ee.Image.constant(1).visualize(palette=[veg_color])

        # Composite: solid black base with solid colored crops overlaid
        final_img = built_viz.where(is_veg, veg_viz).clip(cavite)

        map_info = final_img.getMapId()
        return {"url_template": map_info['tile_fetcher'].url_format}
    except Exception as e:
        return {"error": str(e)}

@app.post("/map/dynamic-world/zone")
async def get_zone_dynamic_world_polygon(request: Request):
    """
    Clips 10m LULC & NDVI composite to the exact municipality geometry.
    - Built / Non-Vegetation areas (roads, urban fabric, ocean/water) are rendered in solid black (#111827).
    - Vegetation areas are rendered in a single solid color matching the forecast results:
      Healthy (#00FF88), Warning (#FACC15), or Stressed (#EF4444).
    """
    try:
        body = await request.json()
        if isinstance(body, dict) and 'geometry' in body:
            zone_geom = ee.Geometry(body['geometry'])
            status = str(body.get('status') or body.get('classification') or '')
            built_color = body.get('built_color') or BUILT_AREA_COLOR
        else:
            zone_geom = ee.Geometry(body)
            status = ''
            built_color = BUILT_AREA_COLOR

        now = datetime.now()
        start = (now - timedelta(days=180)).strftime('%Y-%m-%d')
        end = now.strftime('%Y-%m-%d')

        # 1. Base Dynamic World Mask (Mode composite over 180 days avoids single-cloud misclassification)
        dw = (
            ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
            .filterBounds(zone_geom)
            .filterDate(start, end)
            .select('label')
            .reduce(ee.Reducer.mode())
            .rename('label')
            # Fill Dynamic World coverage gaps (cloudy/mountainous areas like GEA & Maragondon)
            # with a neutral class (-1) so the NDVI/NDBI physics checks decide instead of
            # the masked pixels silently falling back to black "missing patches".
            .unmask(-1)
        )

        # 2. Physics-Based Correction using NDVI and NDBI with cloud-free fallback
        def mask_clouds(img):
            qa = img.select('QA60')
            cloud_mask = 1 << 10
            cirrus_mask = 1 << 11
            mask = qa.bitwiseAnd(cloud_mask).eq(0).And(qa.bitwiseAnd(cirrus_mask).eq(0))
            return img.updateMask(mask).divide(10000)

        s2_coll = (
            ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
            .filterBounds(zone_geom)
            .filterDate(start, end)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        )
        s2_composite = s2_coll.map(mask_clouds).median().unmask(s2_coll.median())
        ndvi = s2_composite.normalizedDifference(['B8', 'B4']).rename('ndvi')
        ndbi = s2_composite.normalizedDifference(['B11', 'B8']).rename('ndbi')
        ndwi = s2_composite.normalizedDifference(['B3', 'B8']).rename('ndwi')

        # If status was not provided in request, infer from zone mean NDVI
        if not status:
            try:
                mean_val = ndvi.reduceRegion(ee.Reducer.mean(), zone_geom, scale=60, bestEffort=True).getInfo().get('ndvi')
                if mean_val is not None:
                    if mean_val < 0.38:
                        status = 'stressed'
                    elif mean_val < 0.52:
                        status = 'warning'
                    else:
                        status = 'healthy'
            except Exception:
                status = 'healthy'

        veg_color = get_veg_color(status)

        # 3. Comprehensive Non-Vegetation Mask (Roads, Buildings, Bare Ground, Water):
        # - Water/Ocean/Bays: DW 0, negative NDVI, or positive NDWI
        # - Built & Roads: NDVI < 0.28, or DW built/bare (with NDVI < 0.48 to avoid false cloud/shadow patches over crops)
        is_water = dw.eq(0).Or(ndvi.lt(0.0)).Or(ndvi.lt(0.12).And(ndwi.gt(0.0)))
        is_non_veg = (
            is_water
            .Or(ndvi.lt(0.28))
            .Or(dw.eq(6).And(ndvi.lt(0.48)))
            .Or(dw.eq(7).And(ndvi.lt(0.38)))
            .Or(ndbi.gt(-0.02).And(ndvi.lt(0.35)))
        )
        is_veg = is_non_veg.Not()

        # Built area, roads, urban fabric, ocean/water are all SOLID BLACK (#111827)
        built_viz = ee.Image.constant(1).visualize(palette=[built_color])
        # Vegetation is a single SOLID COLOR matching forecast status (Green, Amber, or Red)
        veg_viz = ee.Image.constant(1).visualize(palette=[veg_color])

        # Composite: solid black base for roads/built/water, with solid colored crops overlaid
        final_img = built_viz.where(is_veg, veg_viz).clip(zone_geom)

        map_info = final_img.getMapId()
        return {"url_template": map_info['tile_fetcher'].url_format}
    except Exception as e:
        return {"error": str(e)}


@app.get("/predict/ndvi")
async def predict_crop_health(city_name: str = "Cavite Province"):
    """Province / municipality forecast by name: live GEE indices + trained RF/CNN/OPA models."""
    try:
        return await asyncio.to_thread(zone_analysis.analyze_cached, ee, city_name, agri_model)
    except Exception as e:
        return {"status": "Error", "message": str(e)}

@app.post("/predict/indices/zone")
async def predict_zone_indices(request: Request):
    """Same pipeline for an arbitrary clicked geometry."""
    try:
        body = await request.json()
        city_name = body.get('city_name', 'Unknown Area')
        return await asyncio.to_thread(zone_analysis.analyze, ee, body.get('geometry'), city_name, agri_model)
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

@app.get("/cvip/evidence")
def get_cvip_evidence():
    before_path = "data/cvip_output/before_after/BEFORE_raw_unmasked.png"
    after_path = "data/cvip_output/before_after/AFTER_masked_clipped.png"
    
    def get_b64(path):
        if not os.path.exists(path):
            return None
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode('utf-8')
            
    return {
        "before_image": get_b64(before_path),
        "after_image": get_b64(after_path),
        "metadata": {
            "temporal": "30-day median composite",
            "spectral": "12 to 4 bands (RGB + NIR)",
            "spatial": "64x64 patch size"
        }
    }

@app.get("/validation/evidence")
def get_validation_evidence():
    """Offline evaluation artifacts of all four paper models (metrics tables + figures)."""
    return paper_models.validation_evidence()

@app.get("/test-gee")
def test_gee():
    return {"status": "Online", "model_ready": agri_model is not None, "paper_models": paper_models.status()}

@app.get("/")
def read_root():
    return {
        "project": "Cavite Agri-Watch",
        "status": "Operational",
        "phase": 3,
        "author": "Carlos - Lead Dev"
    }

from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/ws/analytics")
async def websocket_bridge(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive city name from React click
            data = await websocket.receive_json()
            city_name = data.get("name")

            # Health comes from the trained models on live satellite data (cached per area)
            try:
                result = await asyncio.to_thread(zone_analysis.analyze_cached, ee, city_name, agri_model)
            except Exception as e:
                result = {"status": "Error", "message": str(e)}

            if result.get("status") == "Success":
                await websocket.send_json({
                    "status": result["classification"],
                    "location": city_name,
                    "forecast_30_days": result["forecast_30_days"],
                    "opa_alert_probability": result["opa_alert_probability"],
                })
            else:
                await websocket.send_json({
                    "status": "Unavailable",
                    "location": city_name,
                    "message": result.get("message"),
                })
    except WebSocketDisconnect:
        print("Dashboard disconnected")
