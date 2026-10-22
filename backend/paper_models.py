"""
paper_models.py — Runtime bridge between the research models in /models and the live API.

Models applied here (each mapped to its designated function):
  5.2.1  CNN Land-Cover (PyTorch)        -> land-cover masking + 'softmax_prob'
  5.2.2  Multispectral Vigor indices     -> index computation stays live in GEE (main.py);
                                            offline correlation evidence is served here
  5.2.3  Random Forest (Regressor+Clf)   -> 30-day NDVI forecast + 4-tier stress classification
  5.2.4  OPA ground-truth calibrator     -> alert score -> calibrated OPA damage probability

Every public function degrades gracefully (returns None) so the dashboard keeps working
even if a model artifact is missing or GEE is unreachable.
"""
import base64
import importlib.util
import os
import pickle
import sys

import numpy as np
import pandas as pd

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.getenv("MODELS_DIR") or os.path.abspath(os.path.join(BACKEND_DIR, "..", "models"))
if not os.path.exists(MODELS_DIR):
    for candidate in ["/models", os.path.join(BACKEND_DIR, "models"), os.path.join(os.getcwd(), "models")]:
        if os.path.exists(candidate):
            MODELS_DIR = candidate
            break

CS_DIR = os.path.join(MODELS_DIR, "crop_stress_prediction")
CNN_DIR = os.path.join(MODELS_DIR, "cnn_landcover")
GT_DIR = os.path.join(MODELS_DIR, "ground_truth_agreement")
MV_DIR = os.path.join(MODELS_DIR, "multispectral_vigor")

# The dataset labels the healthiest tier "Optimal"; the dashboard calls it "No Stress".
TIER_TO_DASHBOARD = {
    "Optimal": "No Stress",
    "Mild Stress": "Mild Stress",
    "Moderate Stress": "Moderate Stress",
    "Severe Stress": "Severe Stress",
}

TIER_TEXT = {
    "No Stress": (
        "Lush green canopy and healthy vegetative vigor. Crop photosynthesis and water absorption are running at peak performance.",
        "Maintain normal irrigation cycles and routine weekly field scouting; keep drainage canals clear.",
    ),
    "Mild Stress": (
        "Early crop fatigue: leaves may show slight curling or dullness under afternoon heat, but root systems are sound and fully recoverable.",
        "Shift watering to early morning (5:00-8:00 AM), check topsoil moisture at 10 cm, apply potassium foliar spray, and weed within 30 cm of crop bases.",
    ),
    "Moderate Stress": (
        "Noticeable vegetation decline: lower leaves yellowing (chlorosis), wilting past midday, and stunted growth needing urgent field intervention.",
        "Perform deep soak irrigation, apply rapid chelated foliar micronutrients (Zinc/Magnesium), and stop chemical herbicide sprays immediately.",
    ),
    "Severe Stress": (
        "Critical crop distress: severe wilting, leaf tip scorch, and risk of permanent yield loss within 48-72 hours if unaddressed.",
        "Emergency root-zone watering, prune scorched lower leaves to conserve water, apply protective mulch, and alert local municipal agriculturist.",
    ),
}

# Real, field-tested guidelines aligned with FAO Good Agricultural Practices (GAP) and PhilRice
FAO_AGRONOMIC_GUIDELINES = {
    "No Stress": {
        "diagnosis": "Healthy green canopy with strong chlorophyll density and optimal leaf turgor. Crops are actively transpiring and metabolizing nutrients effectively.",
        "field_routines": [
            "Morning Irrigation (5:00 - 8:00 AM): Maintain regular 3–5 day schedule to minimize daytime evaporation.",
            "Drainage Canal Check: Keep furrows and drainage clear to avoid water stagnation and root suffocation.",
            "Weekly Border Scouting: Walk field perimeter weekly to catch early weed and pest ingress before it spreads.",
            "Mulch Top-up: Maintain a 3–5 cm layer of rice straw or dried grass to protect topsoil from baking in the sun."
        ],
        "recommended_inputs": [
            "Balanced Complete Fertilizer (14-14-14 N-P-K) or well-decomposed animal manure.",
            "Beneficial Microorganisms (EM-1 or Trichoderma) to enhance root zone nutrient availability.",
            "Maintenance Foliar Spray (Zinc + Magnesium) every 14 days to sustain rich green chlorophyll."
        ],
        "what_to_avoid": [
            "Excessive synthetic Nitrogen application (causes weak, watery stems prone to lodging and insect attack).",
            "Water stagnation lasting over 24 hours in flat furrows (leads to anaerobic root asphyxiation)."
        ],
        "fao_reference": "FAO Good Agricultural Practices (GAP) — Section 4: Soil Management & Crop Nutrition"
    },
    "Mild Stress": {
        "diagnosis": "Early moisture fatigue and transpirational strain. Leaves show temporary midday rolling or slight loss of gloss, though vascular integrity is intact.",
        "field_routines": [
            "Shift Irrigation Hours: Water only in early morning (5:00 - 8:00 AM) or late afternoon to cut evaporation by 40%.",
            "Soil Moisture Squeeze Test: Dig 10 cm deep; if soil crumbles without forming a loose ball, irrigate immediately.",
            "Root-Zone Mulching: Spread a 5–7 cm layer of rice straw, rice hulls, or dry banana leaves around plant bases to lock in soil moisture.",
            "Clear Weeds within 30 cm: Weeds consume up to half of available moisture and fertilizer—hand-weed around crop stems immediately."
        ],
        "recommended_inputs": [
            "Potassium Boost (Muriate of Potash / 0-0-60 or clean wood ash): Regulates leaf stomata to reduce water transpiration.",
            "Gentle Foliar Bio-stimulant: Spray diluted seaweed extract or fish amino acid (FAA) at dawn for quick foliar uptake.",
            "Organic Vermicompost: Apply 1–2 handfuls per hill around root base to improve soil water-holding capacity."
        ],
        "what_to_avoid": [
            "NEVER apply concentrated granular Urea (46-0-0) to dry soil (releases caustic ammonia and burns thirsty roots).",
            "DO NOT spray foliar nutrients or pesticides during peak noon sun (10:00 AM – 3:00 PM) as droplets scorch leaves.",
            "Avoid deep hoeing or cultivation near root crowns that shears delicate water-seeking feeder roots."
        ],
        "fao_reference": "FAO Good Agricultural Practices (GAP) — Section 5: Water Management & Abiotic Stress Mitigation"
    },
    "Moderate Stress": {
        "diagnosis": "Substantial moisture deficit or nutrient lockout. Lower leaves exhibiting chlorosis (yellowing), delayed vegetative growth, and impaired photosynthetic output.",
        "field_routines": [
            "Deep Soak Irrigation: Irrigate slowly to allow water to penetrate 15–20 cm deep into root zones without eroding dry topsoil.",
            "Soil Aeration & Crust Breaking: Lightly hoe crusted topsoil between rows to allow air and water to reach suffocating roots.",
            "Daily Pest Inspection: Stressed plants emit distress volatiles that attract aphids, armyworms, and stem borers—check undersides of leaves daily.",
            "Temporary Shade Protection: For vegetables and nurseries, erect temporary 30–50% shade netting to lower leaf temperatures."
        ],
        "recommended_inputs": [
            "Chelated Zinc & Magnesium Foliar Spray: Applied at dawn to directly restart impaired chlorophyll synthesis.",
            "Humic / Fulvic Acid Soil Drench: Dilute 1:1000 in irrigation water to stimulate root hair re-growth and unlock soil phosphorus.",
            "Bio-protective Inoculant (Trichoderma): Protects vulnerable, stressed roots against soil-borne damping-off and rot pathogens."
        ],
        "what_to_avoid": [
            "DO NOT apply chemical pesticides or systemic herbicides (weakened crops cannot metabolize toxins and will die).",
            "DO NOT sow new seedlings or transplant until soil moisture stabilizes.",
            "Avoid alternating between parched dry soil and sudden heavy flooding (causes root shock and fruit splitting)."
        ],
        "fao_reference": "FAO Good Agricultural Practices (GAP) — Section 6: Integrated Plant Nutrition & Stress Recovery"
    },
    "Severe Stress": {
        "diagnosis": "Severe cellular dehydration and metabolic shutdown. Foliage shows extensive tip burn, permanent wilting, and high risk of irreversible yield collapse.",
        "field_routines": [
            "Low-Volume Basin/Drip Watering: Deliver gentle, targeted watering directly to root crowns; water slowly so it does not run off hardened soil.",
            "Emergency Pruning of Dead Foliage: Cut off dead and severely scorched lower leaves to reduce transpirational water burden on surviving plant tissue.",
            "Micro-Basin Contour Trenching: Shape small soil rings/trenches around plants to capture every drop of water.",
            "Notify Agricultural Officer (OPA Cavite): Report crop stress to the Municipal / Provincial Agricultural Office for drought support and irrigation assistance."
        ],
        "recommended_inputs": [
            "Kaolin Clay / Natural Anti-transpirant Spray: Shields foliage from intense solar radiation and lowers leaf surface temperature by 3–5°C.",
            "Liquid Seaweed Extract + Amino Acids: Drench root base with mild biological extract to support cellular osmoprotection.",
            "Thick Mulch Blanket (10 cm): Completely cover bed surfaces with rice straw, dry leaves, or husks to trap subterranean moisture."
        ],
        "what_to_avoid": [
            "STRICTLY FORBIDDEN: Chemical fertilizers (Urea, Muriate of Potash, 14-14-14)—fertilizer salts in bone-dry soil will immediately dehydrate and kill remaining roots via reverse osmosis.",
            "DO NOT flood dry, baked clay soils rapidly (causes root drowning and collar rot).",
            "Avoid running heavy machinery or foot traffic across root zones (compacts depleted soil pores permanently)."
        ],
        "fao_reference": "FAO Good Agricultural Practices (GAP) — Section 7: Disaster Risk Management & Emergency Crop Salvation"
    }
}

_state = {"rf_reg": None, "rf_clf": None, "cnn": None, "calibrator": None, "loaded": False}
_cnn_mod = None


def _load_module(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


class _RemapUnpickler(pickle.Unpickler):
    """The RF pickles were written by running train_crop_stress.py as a script, so their
    classes are stamped '__main__'. Remap those to the real module."""

    def __init__(self, f, module):
        super().__init__(f)
        self._module = module

    def find_class(self, module, name):
        if module == "__main__" and hasattr(self._module, name):
            return getattr(self._module, name)
        return super().find_class(module, name)


def load_models():
    """Load every available artifact once. Safe to call repeatedly."""
    if _state["loaded"]:
        return status()
    _state["loaded"] = True

    # --- Random Forest (regressor + classifier) ---
    try:
        cs = _load_module("train_crop_stress", os.path.join(CS_DIR, "train_crop_stress.py"))
        for key, fname in (("rf_reg", "rf_vigor_regressor.pkl"), ("rf_clf", "rf_stress_classifier.pkl")):
            with open(os.path.join(CS_DIR, fname), "rb") as f:
                _state[key] = _RemapUnpickler(f, cs).load()
        print("Random Forest models (5.2.3) loaded successfully!")
    except Exception as e:
        print(f"Random Forest models unavailable, using legacy model: {e}")

    # --- CNN land cover ---
    global _cnn_mod
    try:
        import torch
        torch.set_num_threads(1)
        _cnn_mod = _load_module("train_cnn_landcover", os.path.join(CNN_DIR, "train_cnn_landcover.py"))
        net = _cnn_mod.LandCoverCNN(in_channels=4, num_classes=2)
        net.load_state_dict(torch.load(os.path.join(CNN_DIR, "cnn_landcover_model.pt"), map_location="cpu"))
        net.eval()
        _state["cnn"] = net
        print("CNN land-cover model (5.2.1) loaded successfully!")
    except Exception as e:
        print(f"CNN land-cover model unavailable: {e}")

    # --- OPA alert calibrator (5.2.4) ---
    try:
        path = os.path.join(GT_DIR, "opa_alert_calibrator.pkl")
        if not os.path.exists(path):
            _fit_calibrator(path)
        with open(path, "rb") as f:
            _state["calibrator"] = pickle.load(f)
        print("OPA alert calibrator (5.2.4) loaded successfully!")
    except Exception as e:
        print(f"OPA calibrator unavailable: {e}")

    import gc
    gc.collect()
    return status()


def _fit_calibrator(path):
    """Same fit as models/ground_truth_agreement/calibrate_ground_truth.py."""
    from sklearn.linear_model import LogisticRegression
    df = pd.read_csv(os.path.join(GT_DIR, "opa_ground_truth_validation_dataset.csv"))
    clf = LogisticRegression(random_state=42).fit(df[["alert_score"]].values, df["opa_damaged"].values)
    with open(path, "wb") as f:
        pickle.dump(clf, f)


def status():
    return {
        "rf_regressor": _state["rf_reg"] is not None,
        "rf_classifier": _state["rf_clf"] is not None,
        "cnn_landcover": _state["cnn"] is not None,
        "opa_calibrator": _state["calibrator"] is not None,
    }


# ----------------------------------------------------------------------------------
# 5.2.3  Random Forest forecast + stress tier
# ----------------------------------------------------------------------------------
_RAINFALL_FALLBACK = None


def default_rainfall_mm():
    """Mean CHIRPS rainfall of the training dataset (used when live CHIRPS is unavailable)."""
    global _RAINFALL_FALLBACK
    if _RAINFALL_FALLBACK is None:
        try:
            df = pd.read_csv(os.path.join(CS_DIR, "crop_stress_prediction_dataset.csv"))
            _RAINFALL_FALLBACK = float(df["chirps_rainfall_mm"].mean())
        except Exception:
            _RAINFALL_FALLBACK = 35.0
    return _RAINFALL_FALLBACK


def _rainfall_bounds():
    try:
        df = pd.read_csv(os.path.join(CS_DIR, "crop_stress_prediction_dataset.csv"))
        return float(df["chirps_rainfall_mm"].min()), float(df["chirps_rainfall_mm"].max())
    except Exception:
        return 0.0, 400.0


def rf_features(observed, lag_1, lag_2, lag_3, rainfall_mm):
    """Feature order must match training: lag_1, lag_2, lag_3, chirps_rainfall_mm,
    baseline_anomaly_delta.

    In the training dataset: lag_k are the preceding observations and
    baseline_anomaly_delta = observed - mean(observed, lag_1, lag_2, lag_3).
    """
    lo, hi = _rainfall_bounds()
    rainfall_mm = float(np.clip(rainfall_mm, lo, hi))
    anomaly = float(observed) - float(np.mean([observed, lag_1, lag_2, lag_3]))
    return np.array([[lag_1, lag_2, lag_3, rainfall_mm, anomaly]], dtype=float)


def rf_forecast(observed, lag_1, lag_2, lag_3, rainfall_mm=None):
    """Returns (predicted_ndvi, dashboard_stress_tier) or None if RF models unavailable."""
    if _state["rf_reg"] is None or _state["rf_clf"] is None:
        return None
    try:
        if rainfall_mm is None:
            rainfall_mm = default_rainfall_mm()
        X = rf_features(observed, lag_1, lag_2, lag_3, rainfall_mm)
        ndvi = float(_state["rf_reg"].predict(X)[0])
        tier = str(_state["rf_clf"].predict(X)[0])
        return ndvi, TIER_TO_DASHBOARD.get(tier, tier)
    except Exception as e:
        print(f"RF inference failed: {e}")
        return None


def chirps_rainfall_mm(ee, geometry, now, days=30):
    """30-day CHIRPS accumulated rainfall (mm) over a geometry; None on failure."""
    try:
        end = now.strftime("%Y-%m-%d")
        coll = (
            ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
            .filterDate((now - pd.Timedelta(days=days * 4)).strftime("%Y-%m-%d"), end)
            .sort("system:time_start", False)
            .limit(days)
        )
        img = coll.sum()
        val = img.reduceRegion(reducer=ee.Reducer.mean(), geometry=geometry, scale=5566, maxPixels=1e9).getInfo()
        v = val.get("precipitation")
        return float(v) if v is not None else None
    except Exception as e:
        print(f"CHIRPS rainfall fetch failed: {e}")
        return None


# ----------------------------------------------------------------------------------
# 5.2.1  CNN land-cover
# ----------------------------------------------------------------------------------
PATCH = 64
PATCH_SCALE_M = 120  # training patches were sampled from a 120 m reprojection


def cnn_predict_patch(patch_hwc):
    """patch_hwc: (64,64,4) reflectance [Blue,Green,Red,NIR]. Returns (label, p_veg, p_pred)."""
    import torch
    if _state["cnn"] is None:
        return None
    x = np.transpose(patch_hwc.astype(np.float32), (2, 0, 1))
    x = np.clip(x / 0.5, 0.0, 1.0)  # identical normalisation to SentinelPatchDataset
    with torch.inference_mode():
        probs = torch.softmax(_state["cnn"](torch.from_numpy(x).unsqueeze(0)), dim=1)[0].numpy()
    cls = int(np.argmax(probs))
    label = "Vegetated / Cropland" if cls == 1 else "Urban / Built-up / Non-vegetated"
    return label, float(probs[1]), float(probs[cls])


def cnn_landcover_from_gee(ee, composite, zone_geom):
    """Sample a 64x64 (120 m) 4-band window centred on the zone and classify it with the CNN."""
    if _state["cnn"] is None:
        return None
    try:
        img = (
            composite.select(["B2", "B3", "B4", "B8"])
            .rename(["Blue", "Green", "Red", "NIR"])
            .unmask(0)
        )
        region = zone_geom.centroid(100).buffer(PATCH * PATCH_SCALE_M / 2).bounds()
        data = (
            img.reproject(crs="EPSG:4326", scale=PATCH_SCALE_M)
            .sampleRectangle(region=region, defaultValue=0)
            .getInfo()
        )
        props = data["properties"]
        arr = np.stack([np.array(props[b], dtype=np.float32) for b in ("Blue", "Green", "Red", "NIR")], axis=-1)
        h, w, _ = arr.shape
        # centre-crop (or edge-pad) to exactly 64x64
        if h < PATCH or w < PATCH:
            arr = np.pad(arr, ((0, max(0, PATCH - h)), (0, max(0, PATCH - w)), (0, 0)), mode="edge")
            h, w, _ = arr.shape
        r0, c0 = (h - PATCH) // 2, (w - PATCH) // 2
        arr = arr[r0:r0 + PATCH, c0:c0 + PATCH, :]
        result = cnn_predict_patch(arr)
        if result is None:
            return None
        label, p_veg, p_pred = result
        return {"label": label, "vegetated_probability": round(p_veg, 4), "confidence": round(p_pred, 4)}
    except Exception as e:
        print(f"CNN land-cover inference failed: {e}")
        return None


# ----------------------------------------------------------------------------------
# 5.2.4  OPA ground-truth calibrated alert
# ----------------------------------------------------------------------------------
def alert_score_from_ndvi(forecast_ndvi):
    """Severity score in [0,1] on the same scale as the OPA validation set
    (stressed incidents >= ~0.65, normal periods <= ~0.35): NDVI 0.75 -> 0, NDVI 0.25 -> 1."""
    return float(np.clip((0.75 - float(forecast_ndvi)) / 0.5, 0.0, 1.0))


def opa_alert(forecast_ndvi):
    """Returns (alert_score, calibrated_probability_of_OPA_damage) or None."""
    if _state["calibrator"] is None:
        return None
    try:
        score = alert_score_from_ndvi(forecast_ndvi)
        prob = float(_state["calibrator"].predict_proba([[score]])[0][1])
        return round(score, 3), round(prob, 3)
    except Exception as e:
        print(f"OPA calibration failed: {e}")
        return None


# ----------------------------------------------------------------------------------
# Real validation metrics (replaces the hard-coded confidence string)
# ----------------------------------------------------------------------------------
def _kv_csv(path):
    try:
        df = pd.read_csv(path)
        return {str(r.iloc[0]): str(r.iloc[1]) for _, r in df.iterrows()}
    except Exception:
        return {}


def accuracy_summary():
    reg = _kv_csv(os.path.join(CS_DIR, "regression_metrics.csv"))
    cnn = _kv_csv(os.path.join(CNN_DIR, "metrics_summary.csv"))
    gt = _kv_csv(os.path.join(GT_DIR, "cohen_kappa_summary.csv"))
    parts = []
    r2 = next((v for k, v in reg.items() if k.startswith("R2")), None)
    if r2:
        parts.append(f"RF R2={float(r2):.2f}")
    oa = cnn.get("Overall Accuracy (OA)")
    if oa:
        parts.append(f"CNN OA={oa}")
    kappa = next((v for k, v in gt.items() if k.startswith("Cohen")), None)
    if kappa:
        parts.append(f"OPA kappa={float(kappa):.2f}")
    return "Validated: " + " | ".join(parts) if parts else "Model Confidence: n/a"


def _b64(path):
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _table(path):
    try:
        return pd.read_csv(path).to_dict(orient="records")
    except Exception:
        return []


def validation_evidence():
    """All offline evaluation artifacts used in the paper, for the dashboard."""
    return {
        "models_loaded": status(),
        "cnn_landcover": {
            "metrics": _table(os.path.join(CNN_DIR, "metrics_summary.csv")),
            "confusion_matrix": _b64(os.path.join(CNN_DIR, "confusion_matrix.png")),
            "training_curves": _b64(os.path.join(CNN_DIR, "training_validation_curves.png")),
        },
        "multispectral_vigor": {
            "descriptive_summary": _table(os.path.join(MV_DIR, "indices_descriptive_summary.csv")),
            "pearson": _table(os.path.join(MV_DIR, "pearson_correlation_matrix.csv")),
            "spearman": _table(os.path.join(MV_DIR, "spearman_correlation_matrix.csv")),
            "correlation_heatmap": _b64(os.path.join(MV_DIR, "correlation_heatmap.png")),
            "seasonal_distribution": _b64(os.path.join(MV_DIR, "seasonal_index_distribution.png")),
        },
        "crop_stress_prediction": {
            "regression_metrics": _table(os.path.join(CS_DIR, "regression_metrics.csv")),
            "classification_report": _table(os.path.join(CS_DIR, "stress_classification_report.csv")),
            "feature_importance": _table(os.path.join(CS_DIR, "feature_importance_ranking.csv")),
            "scatter": _b64(os.path.join(CS_DIR, "actual_vs_predicted_scatter.png")),
            "feature_importance_chart": _b64(os.path.join(CS_DIR, "feature_importance_barchart.png")),
        },
        "ground_truth_agreement": {
            "kappa_summary": _table(os.path.join(GT_DIR, "cohen_kappa_summary.csv")),
            "municipal_alignment": _table(os.path.join(GT_DIR, "municipal_hotspot_alignment.csv")),
            "contingency_matrix": _b64(os.path.join(GT_DIR, "opa_contingency_matrix.png")),
            "hotspot_alignment": _b64(os.path.join(GT_DIR, "spatial_hotspot_alignment.png")),
        },
    }
