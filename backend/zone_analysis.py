"""
zone_analysis.py — single, data-driven analysis pipeline used by every prediction entry point
(/predict/ndvi, /predict/indices/zone and the /ws/analytics WebSocket).

Nothing here is hard-coded per city: indices, vigor lags, rainfall, cloud noise, historical
baseline and land-cover all come from Google Earth Engine for the requested geometry, and the
stress forecast / tier / OPA alert come from the trained models in /models (via paper_models).
"""
import gc
import json
import os
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import pandas as pd

import paper_models

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_LOCAL_GEOJSON = os.path.join(_BACKEND_DIR, "data", "geojson")
_SHARED_GEOJSON = os.path.abspath(os.path.join(_BACKEND_DIR, "..", "frontend", "public", "geojson"))

GEOJSON_DIR = os.getenv("GEOJSON_DIR") or (_LOCAL_GEOJSON if os.path.isdir(_LOCAL_GEOJSON) else _SHARED_GEOJSON)
HISTORY_CSV = os.path.join(_BACKEND_DIR, "data", "cavite_history.csv")
PROVINCE_NAME = "Cavite Province"
HISTORICAL_YEARS = 5
CACHE_TTL_S = 6 * 3600
_cache = {}


# ---------------------------------------------------------------- geometry helpers
def _slug(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return "".join(c if c.isalnum() else "_" for c in s).strip("_")


def municipality_geometry(name):
    """GeoJSON geometry dict for a municipality from the dashboard's own boundary files."""
    target = _slug(name)
    if not os.path.isdir(GEOJSON_DIR):
        return None
    for fname in os.listdir(GEOJSON_DIR):
        if fname.endswith(".geojson") and _slug(fname[:-8]) == target:
            try:
                with open(os.path.join(GEOJSON_DIR, fname), encoding="utf-8") as f:
                    fc = json.load(f)
                geoms = [
                    ft["geometry"] for ft in fc.get("features", [])
                    if ft.get("geometry", {}).get("type") in ("Polygon", "MultiPolygon")
                ]
                if geoms:
                    return {"type": "GeometryCollection", "geometries": geoms}
            except Exception as e:
                print(f"Could not read boundary for {name}: {e}")
    return None


def province_geometry(ee):
    cavite = ee.FeatureCollection("FAO/GAUL/2015/level2").filter(ee.Filter.eq("ADM2_NAME", "Cavite"))
    return cavite.geometry()


# ---------------------------------------------------------------- GEE building blocks
def _mask_clouds(img):
    qa = img.select("QA60")
    mask = qa.bitwiseAnd(1 << 10).eq(0).And(qa.bitwiseAnd(1 << 11).eq(0))
    return img.updateMask(mask).divide(10000)


def _collection(ee, geom, end, days=90):
    start = end - timedelta(days=days)
    return (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(geom)
        .filterDate(start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
    )


def _zone_mean_ndvi(ee, geom, end, scale, days=90):
    """Zone-mean NDVI of a 90-day cloud-masked median composite ending at `end`.

    Deliberately NOT vegetation-masked: the Random Forest was trained on whole-area mean NDVI
    (backend/extract_history.py), so inputs must use the same definition."""
    try:
        comp = _collection(ee, geom, end, days).map(_mask_clouds).median()
        ndvi = comp.normalizedDifference(["B8", "B4"]).rename("ndvi")
        v = ndvi.reduceRegion(ee.Reducer.mean(), geom, scale=scale, maxPixels=1e9, bestEffort=True).getInfo()
        return v.get("ndvi")
    except Exception as e:
        print(f"zone NDVI window ending {end:%Y-%m-%d} failed: {e}")
        return None


def _residual_cloud_percent(ee, geom, now, scale):
    """Share of pixels still flagged by the QA60 cloud/cirrus bits across the scenes used (%)."""
    try:
        coll = _collection(ee, geom, now)
        flagged = coll.map(
            lambda i: i.select("QA60").bitwiseAnd(3 << 10).neq(0).rename("flag").toFloat()
        ).mean()
        v = flagged.reduceRegion(ee.Reducer.mean(), geom, scale=scale, maxPixels=1e9, bestEffort=True).getInfo()
        f = v.get("flag")
        return round(float(f) * 100.0, 1) if f is not None else None
    except Exception as e:
        print(f"cloud noise estimate failed: {e}")
        return None


def _history_fallback():
    """Newest-first NDVI history from the project's own CSV, used only if GEE windows are empty."""
    try:
        df = pd.read_csv(HISTORY_CSV)
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"])
            df = df.sort_values("date")
        return list(df["ndvi"].values[-3:][::-1])
    except Exception:
        return []


# ---------------------------------------------------------------- narrative helpers
def _trend(current, forecast):
    d = (forecast - current) * 100
    if forecast > current + 0.05:
        return f"+{d:.1f}% Significant Recovery"
    if forecast > current:
        return f"+{d:.1f}% Positive Growth"
    if forecast < current - 0.05:
        return f"-{-d:.1f}% Critical Decline"
    return f"-{-d:.1f}% Slight Decline"


def _ladder_tier(ndvi):
    """Fallback only (used when the Random Forest classifier is unavailable)."""
    if ndvi > 0.6:
        return "No Stress"
    if ndvi > 0.45:
        return "Mild Stress"
    if ndvi > 0.3:
        return "Moderate Stress"
    return "Severe Stress"


# ---------------------------------------------------------------- main pipeline
def analyze(ee, geometry, city_name, agri_model=None, scale=30):
    """Run the full pipeline for one geometry (GeoJSON dict or ee.Geometry). Blocking call."""
    zone = geometry if isinstance(geometry, ee.Geometry) else ee.Geometry(geometry)
    now = datetime.now()

    composite = _collection(ee, zone, now).map(_mask_clouds).median()
    ndvi = composite.normalizedDifference(["B8", "B4"]).rename("ndvi")
    veg = ndvi.gt(0.2)
    ndvi = ndvi.updateMask(veg)
    evi = composite.expression(
        "2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))",
        {"NIR": composite.select("B8"), "RED": composite.select("B4"), "BLUE": composite.select("B2")},
    ).rename("evi").updateMask(veg)
    ndwi = composite.normalizedDifference(["B3", "B8"]).rename("ndwi").updateMask(veg)
    lswi = composite.normalizedDifference(["B8", "B11"]).rename("lswi").updateMask(veg)
    ndre = composite.normalizedDifference(["B8", "B5"]).rename("ndre").updateMask(veg)
    indices = ee.Image.cat([ndvi, evi, ndwi, lswi, ndre])

    # Keep workers conservative (max_workers=3) so concurrent memory stays well below 512MB on Render
    with ThreadPoolExecutor(max_workers=3) as pool:
        f_stats = pool.submit(
            lambda: indices.reduceRegion(
                ee.Reducer.mean(), zone, scale=scale, maxPixels=1e9, bestEffort=True
            ).getInfo()
        )
        # vigor lags at T-15 / T-30 / T-45 days (RF features lag_1..lag_3)
        f_cur = pool.submit(_zone_mean_ndvi, ee, zone, now, scale)
        f_lags = [pool.submit(_zone_mean_ndvi, ee, zone, now - timedelta(days=d), scale) for d in (15, 30, 45)]
        # same-season baseline from previous years
        f_hist = [
            pool.submit(_zone_mean_ndvi, ee, zone, now - timedelta(days=365 * y), scale)
            for y in range(1, HISTORICAL_YEARS + 1)
        ]
        f_cloud = pool.submit(_residual_cloud_percent, ee, zone, now, scale)
        f_rain = pool.submit(paper_models.chirps_rainfall_mm, ee, zone, now)
        f_land = pool.submit(paper_models.cnn_landcover_from_gee, ee, composite, zone)

        stats = f_stats.result() or {}
        lags = [f.result() for f in f_lags]
        hist_vals = [v for v in (f.result() for f in f_hist) if v is not None]
        cloud = f_cloud.result()
        rainfall = f_rain.result()
        landcover = f_land.result()

    vegetation_ndvi = stats.get("ndvi")
    current = f_cur.result()
    if current is None:
        current = vegetation_ndvi
    if current is None:
        return {"status": "Error", "message": "No cloud-free vegetated pixels found for this area."}

    # Fill any empty lag window from the project's own NDVI history (data, not constants)
    fallback = _history_fallback()
    for i in range(3):
        if lags[i] is None:
            lags[i] = fallback[i] if i < len(fallback) else current
    lag_1, lag_2, lag_3 = (float(x) for x in lags)

    # ---- 5.2.3 Random Forest regressor + classifier
    rf = paper_models.rf_forecast(current, lag_1, lag_2, lag_3, rainfall)
    if rf:
        forecast, tier = rf
        model_used = "Random Forest (5.2.3)"
    elif agri_model is not None:
        forecast = float(agri_model.predict(pd.DataFrame([[current, lag_1, lag_2]], columns=["lag_1", "lag_2", "lag_3"]))[0])
        tier = _ladder_tier(forecast)
        model_used = "Legacy RandomForest (fallback)"
    else:
        return {"status": "Error", "message": "No prediction model available."}
    forecast = max(0.0, min(1.0, float(forecast)))

    meaning, advice = paper_models.TIER_TEXT[tier]
    fao_data = paper_models.FAO_AGRONOMIC_GUIDELINES.get(tier, {})
    opa = paper_models.opa_alert(forecast)  # 5.2.4

    res = {
        "status": "Success",
        "city": city_name,
        "current_ndvi": round(current, 3),
        "vegetation_ndvi": round(vegetation_ndvi, 3) if vegetation_ndvi is not None else None,
        "forecast_30_days": round(forecast, 3),
        "trend": _trend(current, forecast),
        "classification": tier,
        "meaning": meaning,
        "expert_advice": advice,
        "diagnosis": fao_data.get("diagnosis", meaning),
        "fao_routines": fao_data.get("field_routines", []),
        "fao_inputs": fao_data.get("recommended_inputs", []),
        "fao_avoid": fao_data.get("what_to_avoid", []),
        "fao_reference": fao_data.get("fao_reference", "FAO Good Agricultural Practices (GAP)"),
        "accuracy_metric": paper_models.accuracy_summary(),
        "evi": round(stats.get("evi") or 0, 3),
        "ndwi": round(stats.get("ndwi") or 0, 3),
        "lswi": round(stats.get("lswi") or 0, 3),
        "ndre": round(stats.get("ndre") or 0, 3),
        "softmax_prob": landcover["confidence"] if landcover else None,
        "landcover": landcover,
        "rainfall_mm": round(rainfall, 1) if rainfall is not None else None,
        "lag_1": round(lag_1, 3),
        "lag_2": round(lag_2, 3),
        "lag_3": round(lag_3, 3),
        "cloud_cover": cloud,
        "historical_mean": round(sum(hist_vals) / len(hist_vals), 3) if hist_vals else None,
        "historical_years": len(hist_vals),
        "model_used": model_used,
        "opa_alert_score": opa[0] if opa else None,
        "opa_alert_probability": opa[1] if opa else None,
    }
    gc.collect()
    return res


def analyze_cached(ee, city_name, agri_model=None):
    """Name-based analysis (province or municipality) with a TTL cache; blocking."""
    key = _slug(city_name)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL_S:
        return hit[1]

    if key in ("", _slug(PROVINCE_NAME), "cavite"):
        result = analyze(ee, province_geometry(ee), PROVINCE_NAME, agri_model, scale=120)
    else:
        geom = municipality_geometry(city_name)
        if geom is None:
            return {"status": "Error", "message": f"No boundary available for '{city_name}'."}
        result = analyze(ee, geom, city_name, agri_model, scale=30)

    if result.get("status") == "Success":
        _cache[key] = (time.time(), result)
    return result
