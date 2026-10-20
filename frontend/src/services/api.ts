export const BASE_URL = import.meta.env?.VITE_API_URL || "http://127.0.0.1:8000";
export const WS_URL = import.meta.env?.VITE_WS_URL || (BASE_URL.replace(/^http/, 'ws') + '/ws/analytics');

export interface ForecastData {
    status: string;
    current_ndvi: number;
    forecast_30_days: number;
    trend: string;
    accuracy_metric: string;
    // New metrics from paper
    evi?: number;
    ndwi?: number;
    lswi?: number;
    ndre?: number;
    softmax_prob?: number;
    classification?: string;
    city?: string;
    meaning?: string;
    expert_advice?: string;
    diagnosis?: string;
    routines?: string[];
    fao_routines?: string[];
    fao_inputs?: string[];
    fao_avoid?: string[];
    fao_reference?: string;
    lag_1?: number;
    lag_2?: number;
    lag_3?: number;
    cloud_cover?: number;
    qa60_noise?: number;
    historical_mean?: number;
    health_status?: string;
    error?: string;
    message?: string;
    // Paper models (5.2.1 CNN, 5.2.3 Random Forest, 5.2.4 OPA calibration)
    landcover?: { label: string; vegetated_probability: number; confidence: number } | null;
    rainfall_mm?: number | null;
    model_used?: string;
    opa_alert_score?: number | null;
    opa_alert_probability?: number | null;
    historical_years?: number;
}

export const AgriApi = {
    // Get the Neon NDVI Tile URL from GEE
    getMapLayer: async (): Promise<string> => {
        const response = await fetch(`${BASE_URL}/map/ndvi`);
        const data = await response.json();
        return data.url_template;
    },

    // Get Dynamic World 10m Land Use/Land Cover Tile URL from GEE
    getDynamicWorldLayer: async (): Promise<string> => {
        const response = await fetch(`${BASE_URL}/map/dynamic-world`);
        const data = await response.json();
        return data.url_template;
    },


    // Get the Machine Learning "Foresee" data (Fallback/mock)
    getPrediction: async (cityName: string = "Cavite Province"): Promise<ForecastData> => {
        const response = await fetch(`${BASE_URL}/predict/ndvi?city_name=${encodeURIComponent(cityName)}`);
        return await response.json();
    },

    // Get the REAL calculated indices via GEE reduceRegion for a specific polygon
    getZonePrediction: async (geometry: Record<string, unknown>, cityName: string = "Unknown Area"): Promise<ForecastData> => {
        const response = await fetch(`${BASE_URL}/predict/indices/zone`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ geometry, city_name: cityName })
        });
        return await response.json();
    },

    // Get CVIP Evidence and metadata
    getCVIPEvidence: async () => {
        const response = await fetch(`${BASE_URL}/cvip/evidence`);
        return await response.json();
    },

    // Offline validation metrics + figures for all paper models
    getValidationEvidence: async () => {
        const response = await fetch(`${BASE_URL}/validation/evidence`);
        return await response.json();
    }
};