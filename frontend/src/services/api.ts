const BASE_URL = "http://127.0.0.1:8000";

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
}

export const AgriApi = {
    // Get the Neon NDVI Tile URL from GEE
    getMapLayer: async (): Promise<string> => {
        const response = await fetch(`${BASE_URL}/map/ndvi`);
        const data = await response.json();
        return data.url_template;
    },

    // Get the Machine Learning "Foresee" data
    getPrediction: async (cityName: string = "Cavite Province"): Promise<ForecastData> => {
        const response = await fetch(`${BASE_URL}/predict/ndvi?city_name=${encodeURIComponent(cityName)}`);
        return await response.json();
    },

    // Get CVIP Evidence and metadata
    getCVIPEvidence: async () => {
        const response = await fetch(`${BASE_URL}/cvip/evidence`);
        return await response.json();
    }
};