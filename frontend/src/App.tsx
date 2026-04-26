import React, { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area } from 'recharts';
import './App.css';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat, transformExtent } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Style, Stroke, Fill, Text } from 'ol/style';
import { Select } from 'ol/interaction';
import { click } from 'ol/events/condition';
import { AgriApi, type ForecastData } from './services/api';
import XYZ from 'ol/source/XYZ';

const mockNdviData = [
  { time: '00:00', value: 0.65 }, { time: '04:00', value: 0.68 }, { time: '08:00', value: 0.72 },
  { time: '12:00', value: 0.81 }, { time: '16:00', value: 0.75 }, { time: '20:00', value: 0.69 },
];

const mockSarData = [
  { time: '00:00', level: 12 }, { time: '04:00', level: 14 }, { time: '08:00', level: 18 },
  { time: '12:00', level: 45 }, { time: '16:00', level: 38 }, { time: '20:00', level: 22 },
];

const App: React.FC = () => {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const socket = useRef<WebSocket | null>(null);
  
  const [activeLayer, setActiveLayer] = useState<'NDVI' | 'SAR'>('NDVI');
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [syncState, setSyncState] = useState<{phase: string, status: string} | null>(null);
  
  // Real-time Bridge States
  const [healthStatus, setHealthStatus] = useState<string>("Awaiting Target");
  const [activeZone, setActiveZone] = useState<string>("Cavite Province");

  const handleSync = () => {
    setSyncState({ phase: 'Extraction', status: 'Connecting...' });
    const eventSource = new EventSource('http://127.0.0.1:8000/sync-data');
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setSyncState(data);
      if (data.phase === 'Completed' || data.phase === 'Error') {
        eventSource.close();
        setTimeout(() => setSyncState(null), 8000);
      }
    };
    eventSource.onerror = () => {
      setSyncState({ phase: 'Error', status: 'Connection failed' });
      eventSource.close();
      setTimeout(() => setSyncState(null), 8000);
    };
  };

  const handleForesee = async () => {
    const data = await AgriApi.getPrediction();
    setForecast(data);
    const tileUrl = await AgriApi.getMapLayer();
    const ndviLayer = new TileLayer({
        source: new XYZ({ url: tileUrl }),
        className: 'ndvi-layer',
        opacity: 0.8
    });
    if (mapRef.current) mapRef.current.addLayer(ndviLayer);
  };

  useEffect(() => {
    if (!mapElement.current) return;

    // 1. WebSocket Bridge Connection
    socket.current = new WebSocket("ws://127.0.0.1:8000/ws/analytics");
    socket.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setHealthStatus(data.status); 
    };

    const caviteCenter = fromLonLat([120.90, 14.28]);
    const philippinesExtent = transformExtent([116.93, 4.59, 126.60, 21.28], 'EPSG:4326', 'EPSG:3857');

    const caviteLayer = new VectorLayer({
      source: new VectorSource({ url: '/geojson/cavite.geojson', format: new GeoJSON() }),
      style: new Style({
        fill: new Fill({ color: 'rgba(0, 0, 0, 0.02)' }),
        stroke: new Stroke({ color: '#ccc', width: 1 }),
      }),
    });

    // Darker Municipalities (0.6 opacity)
    const cities = [
      { name: 'Dasmariñas', color: 'rgba(255, 99, 132, 0.5)' },
      { name: 'Imus', color: 'rgba(54, 162, 235, 0.5)' },
      { name: 'General Trias', color: 'rgba(255, 206, 86, 0.5)' },
      { name: 'Bacoor', color: 'rgba(75, 192, 192, 0.5)' },
      { name: 'Trece Martires', color: 'rgba(153, 102, 255, 0.5)' },
      { name: 'Tagaytay', color: 'rgba(255, 159, 64, 0.5)' },
      { name: 'Carmona', color: 'rgba(156, 163, 175, 0.5)' },
      { name: 'Cavite City', color: 'rgba(83, 102, 255, 0.5)' },
      { name: 'Silang', color: 'rgba(255, 105, 180, 0.5)' },
      { name: 'Amadeo', color: 'rgba(205, 133, 63, 0.5)' },
      { name: 'Mendez', color: 'rgba(218, 165, 32, 0.5)' },
      { name: 'Indang', color: 'rgba(0, 128, 128, 0.5)' },
      { name: 'Alfonso', color: 'rgba(139, 69, 19, 0.5)' },
      { name: 'General Emilio Aguinaldo', color: 'rgba(46, 139, 87, 0.5)' },
      { name: 'Maragondon', color: 'rgba(107, 142, 35, 0.5)' },
      { name: 'Ternate', color: 'rgba(64, 224, 208, 0.5)' },
      { name: 'Naic', color: 'rgba(100, 149, 237, 0.5)' },
      { name: 'Tanza', color: 'rgba(123, 104, 238, 0.5)' },
      { name: 'Noveleta', color: 'rgba(255, 140, 0, 0.5)' },
      { name: 'Rosario', color: 'rgba(220, 20, 60, 0.5)' },
      { name: 'Kawit', color: 'rgba(0, 191, 255, 0.5)' }
    ];

    mapRef.current = new Map({
      target: mapElement.current,
      layers: [ new TileLayer({ source: new OSM() }), caviteLayer ],
      view: new View({ center: caviteCenter, zoom: 10, minZoom: 5, extent: philippinesExtent }),
    });

    // 2. Neon "Scan Area" Highlight Interaction
    const selectHighlight = new Select({
      condition: click,
      style: new Style({
        fill: new Fill({ color: 'rgba(0, 255, 136, 0.2)' }),
        stroke: new Stroke({ color: '#00FF88', width: 4, lineDash: [8, 8] }),
        text: new Text({
          font: 'bold 14px Inter,sans-serif',
          fill: new Fill({ color: '#fff' }),
          stroke: new Stroke({ color: '#000', width: 3 })
        })
      }),
    });

    mapRef.current.addInteraction(selectHighlight);

    // 3. Trigger Bridge on Click
    selectHighlight.on('select', (e) => {
      if (e.selected.length > 0) {
        const feature = e.selected[0];
        const cityName = feature.get('name') || "Unknown Area"; 
        setActiveZone(cityName); 
        
        if (socket.current?.readyState === WebSocket.OPEN) {
          socket.current.send(JSON.stringify({ name: cityName }));
        }
      }
    });

    const loadCitiesSequentially = async () => {
      for (const city of cities) {
        try {
          const fileName = city.name.replace(/ /g, '_').toLowerCase();
          const res = await fetch(`/geojson/${fileName}.geojson`);
          if (res.ok) {
            const data = await res.json();
            const source = new VectorSource({
              features: new GeoJSON().readFeatures(data, { featureProjection: 'EPSG:3857' }),
            });
            const layer = new VectorLayer({
              source: source,
              style: new Style({
                fill: new Fill({ color: city.color }),
                stroke: new Stroke({ color: 'rgba(255,255,255,0.6)', width: 1.5 }),
                text: new Text({
                  text: city.name, 
                  font: 'bold 13px Inter,sans-serif',
                  fill: new Fill({ color: '#0f172a' }),
                  stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.95)', width: 3.5 })
                })
              }),
            });
            if (mapRef.current) mapRef.current.addLayer(layer);
          }
        } catch (e) {
          console.warn(`Failed to load boundary for ${city.name}`, e);
        }
      }
    };

    loadCitiesSequentially();

    return () => {
      if (mapRef.current) mapRef.current.setTarget(undefined);
      socket.current?.close();
    };
  }, []);

  return (
    <div className="app-container">
      <header className="top-header">
        <h1>Cavite Agri-Watch (Functional Prototype)</h1>
        <div>SYSTEM STATUS: ONLINE | Bridge: Active</div>
      </header>

      <div className="main-layout">
        <nav className="sidebar">
          <div className="feature-box">
            <h3>Health Status</h3>
            <p>Zone: {activeZone}</p>
            <p><strong>Status: {healthStatus}</strong></p>
          </div>

          <div className="feature-box">
            <h3>Controls</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <button onClick={() => setActiveLayer('NDVI')}>NDVI Layer</button>
              <button onClick={() => setActiveLayer('SAR')}>SAR Layer</button>
              <button onClick={handleForesee}>Run Forecast</button>
              <button onClick={handleSync} disabled={syncState !== null}>
                {syncState ? 'Syncing...' : 'Start Data Sync'}
              </button>
            </div>

            {syncState && (
              <div className="sync-status">
                <p>Pipeline: {syncState.phase}</p>
                <p>Status: {syncState.status}</p>
              </div>
            )}
          </div>
        </nav>

        <main className="main-section">
          <div ref={mapElement} className="map-container"></div>
          <div className="active-zone-tag">ZONE: {activeZone}</div>
        </main>

        <aside className="analytics-panel">
          <div className="feature-box">
            <h3>Buildings Detected</h3>
            <p style={{ fontSize: '24px' }}>1,402</p>
          </div>

          {forecast && (
            <div className="feature-box">
              <h3>30-Day Forecast</h3>
              <p>Value: {forecast.forecast_30_days.toFixed(2)}</p>
              <p>Trend: {forecast.trend}</p>
            </div>
          )}

          <div className="feature-box">
            <h3>NDVI Trend</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockNdviData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis domain={[0.6, 0.9]} />
                  <Area type="monotone" dataKey="value" stroke="#000" fill="#ccc" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="feature-box">
            <h3>Soil Moisture</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockSarData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Line type="monotone" dataKey="level" stroke="#000" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default App;