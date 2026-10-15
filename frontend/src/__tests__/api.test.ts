import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgriApi } from '../services/api';

describe('AgriApi Service Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getMapLayer should request /map/ndvi and return tile url template', async () => {
    const mockUrl = 'https://earthengine.googleapis.com/v1/projects/map/{z}/{x}/{y}';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url_template: mockUrl }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AgriApi.getMapLayer();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/map/ndvi');
    expect(result).toBe(mockUrl);
  });

  it('getDynamicWorldLayer should request /map/dynamic-world and return tile url', async () => {
    const mockUrl = 'https://earthengine.googleapis.com/v1/projects/dw/{z}/{x}/{y}';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url_template: mockUrl }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AgriApi.getDynamicWorldLayer();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/map/dynamic-world');
    expect(result).toBe(mockUrl);
  });

  it('getPrediction should encode city names properly', async () => {
    const mockData = {
      status: 'Success',
      current_ndvi: 0.65,
      forecast_30_days: 0.62,
      trend: 'Stable',
      accuracy_metric: '0.04 MAE',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AgriApi.getPrediction('Tagaytay City');
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/predict/ndvi?city_name=Tagaytay%20City');
    expect(result.current_ndvi).toBe(0.65);
    expect(result.status).toBe('Success');
  });

  it('getZonePrediction should send POST payload with geometry and city name', async () => {
    const mockGeometry = {
      type: 'Polygon',
      coordinates: [[[120.9, 14.1], [120.95, 14.1], [120.95, 14.15], [120.9, 14.15], [120.9, 14.1]]],
    };
    const mockResponse = {
      status: 'Success',
      current_ndvi: 0.58,
      forecast_30_days: 0.55,
      trend: 'Declining',
      accuracy_metric: '0.04 MAE',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AgriApi.getZonePrediction(mockGeometry, 'Silang');
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/predict/indices/zone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ geometry: mockGeometry, city_name: 'Silang' }),
    });
    expect(result.trend).toBe('Declining');
  });

  it('getValidationEvidence should fetch /validation/evidence', async () => {
    const mockEvidence = {
      cnn_landcover: { accuracy: 0.94 },
      random_forest: { mae: 0.038 },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockEvidence,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AgriApi.getValidationEvidence();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/validation/evidence');
    expect(result.cnn_landcover.accuracy).toBe(0.94);
  });
});
