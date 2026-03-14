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
import { AgriApi, type ForecastData } from './services/api';
import XYZ from 'ol/source/XYZ';

const mockNdviData = [
  { time: '00:00', value: 0.65 },
  { time: '04:00', value: 0.68 },
  { time: '08:00', value: 0.72 },
  { time: '12:00', value: 0.81 },
  { time: '16:00', value: 0.75 },
  { time: '20:00', value: 0.69 },
];

const mockSarData = [
  { time: '00:00', level: 12 },
  { time: '04:00', level: 14 },
  { time: '08:00', level: 18 },
  { time: '12:00', level: 45 },
  { time: '16:00', level: 38 },
  { time: '20:00', level: 22 },
];

const App: React.FC = () => {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [activeLayer, setActiveLayer] = useState<'NDVI' | 'SAR'>('NDVI');
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [syncState, setSyncState] = useState<{phase: string, status: string} | null>(null);

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
    // 1. Get the Prediction Data
    const data = await AgriApi.getPrediction();
    setForecast(data);

    // 2. Get and Add the Neon Map Layer
    const tileUrl = await AgriApi.getMapLayer();
    
    const ndviLayer = new TileLayer({
        source: new XYZ({
            url: tileUrl,
        }),
        className: 'ndvi-layer', // Useful for CSS styling later
        opacity: 0.8
    });

    if (mapRef.current) {
        mapRef.current.addLayer(ndviLayer);
    }
  };

  useEffect(() => {
    if (!mapElement.current) return;

    // Cavite Coordinates
    const caviteCenter = fromLonLat([120.90, 14.28]);
    
    // Philippines Bounding Box [minLon, minLat, maxLon, maxLat]
    const philippinesExtent = transformExtent(
      [116.93, 4.59, 126.60, 21.28],
      'EPSG:4326',
      'EPSG:3857'
    );

    // Cavite GeoJSON Highlight Layer
    const caviteLayer = new VectorLayer({
      source: new VectorSource({
        url: '/geojson/cavite.geojson',
        format: new GeoJSON(),
      }),
      style: new Style({
        fill: new Fill({
          color: 'rgba(0, 0, 0, 0.05)',
        }),
        stroke: new Stroke({
          color: '#000',
          width: 2,
        }),
      }),
    });
    const cities_opacity = 1;
    const cities = [
      { name: 'Dasmariñas', color: 'rgba(255, 99, 132, {0.4})' },
      { name: 'Imus', color: 'rgba(54, 162, 235, 0.4)' },
      { name: 'General Trias', color: 'rgba(255, 206, 86, 0.4)' },
      { name: 'Bacoor', color: 'rgba(75, 192, 192, 0.4)' },
      { name: 'Trece Martires', color: 'rgba(153, 102, 255, 0.4)' },
      { name: 'Tagaytay', color: 'rgba(255, 159, 64, 0.4)' },
      { name: 'Carmona', color: 'rgba(199, 199, 199, 0.4)' },
      { name: 'Cavite City', color: 'rgba(83, 102, 255, 0.4)' },
      { name: 'Silang', color: 'rgba(255, 105, 180, 0.4)' },
      { name: 'Amadeo', color: 'rgba(205, 133, 63, 0.4)' },
      { name: 'Mendez', color: 'rgba(218, 165, 32, 0.4)' },
      { name: 'Indang', color: 'rgba(0, 128, 128, 0.4)' },
      { name: 'Alfonso', color: 'rgba(139, 69, 19, 0.4)' },
      { name: 'General Emilio Aguinaldo', color: 'rgba(46, 139, 87, 0.4)' },
      { name: 'Maragondon', color: 'rgba(107, 142, 35, 0.4)' },
      { name: 'Ternate', color: 'rgba(64, 224, 208, 0.4)' },
      { name: 'Naic', color: 'rgba(100, 149, 237, 0.4)' },
      { name: 'Tanza', color: 'rgba(123, 104, 238, 0.4)' },
      { name: 'Noveleta', color: 'rgba(255, 140, 0, 0.4)' },
      { name: 'Rosario', color: 'rgba(220, 20, 60, 0.4)' },
      { name: 'Kawit', color: 'rgba(0, 191, 255, 0.4)' }
    ];

    mapRef.current = new Map({
      target: mapElement.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        caviteLayer,
      ],
      view: new View({
        center: caviteCenter,
        zoom: 10,
        minZoom: 5,
        extent: philippinesExtent,
      }),
    });

    const loadCitiesSequentially = async () => {
      // Local files load much faster and avoid API limits.
      for (const city of cities) {
        try {
          const fileName = city.name.replace(/ /g, '_').toLowerCase();
          const res = await fetch(`/geojson/${fileName}.geojson`);
          if (res.ok) {
            const data = await res.json();
            const source = new VectorSource({
              features: new GeoJSON().readFeatures(data, {
                  featureProjection: 'EPSG:3857'
              }),
            });
            const layer = new VectorLayer({
              source: source,
              style: new Style({
                fill: new Fill({ color: city.color }),
                stroke: new Stroke({ color: '#333', lineDash: [4, 4], width: 1 }),
                text: new Text({
                  text: city.name,
                  font: '14px Calibri,sans-serif',
                  fill: new Fill({ color: '#000' }),
                  stroke: new Stroke({ color: '#fff', width: 3 })
                })
              }),
            });
            if (mapRef.current) mapRef.current.addLayer(layer);
          }
        } catch (e) {
          console.warn(`Failed to dynamically load boundary for ${city.name}`, e);
        }
      }
    };

    loadCitiesSequentially();

    return () => {
      if (mapRef.current) {
        mapRef.current.setTarget(undefined);
      }
    };
  }, []);

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="top-header">
        <h2>Cavite Agri-Watch</h2>
        <div className="header-status">
          <span>Engine: Online</span>
          <span>Telemetry: Nominal</span>
          <span>Live: {activeLayer}</span>
        </div>
      </header>

      {/* Left Sidebar */}
      <nav className="sidebar">
        <h3>Layers</h3>
        <button 
          className={`nav-btn ${activeLayer === 'NDVI' ? 'active' : ''}`} 
          onClick={() => setActiveLayer('NDVI')}
        >
          NDVI Analysis
        </button>
        <button 
          className={`nav-btn ${activeLayer === 'SAR' ? 'active' : ''}`} 
          onClick={() => setActiveLayer('SAR')}
        >
          SAR Intel
        </button>

        <h3 style={{ marginTop: '20px' }}>Controls</h3>
        <button className="nav-btn" onClick={handleForesee}>Foresee Future NDVI</button>
        <button className="nav-btn">Historical Archives</button>
        <button className="nav-btn">Alert Thresholds</button>
        
        <h3 style={{ marginTop: '20px', color: '#00FF88' }}>Autonomous Sync</h3>
        <button 
          className="nav-btn" 
          style={{ borderColor: syncState ? '#aaa' : '#00FF88', color: syncState ? '#aaa' : '#00FF88' }} 
          onClick={handleSync}
          disabled={syncState !== null}
        >
          {syncState ? 'SYNC IN PROGRESS...' : 'INITIATE SYNC'}
        </button>
        
        {syncState && (
          <div className="sync-status" style={{ 
            marginTop: '15px', 
            padding: '12px', 
            background: 'rgba(0, 255, 136, 0.05)', 
            border: '1px solid rgba(0, 255, 136, 0.3)', 
            borderRadius: '4px', 
            fontFamily: 'monospace',
            color: '#fff',
            fontSize: '13px'
          }}>
            <div style={{ color: '#00FF88', marginBottom: '8px', fontSize: '11px', letterSpacing: '1px' }}>
              [ PIPELINE ACTIVE ]
            </div>
            <div style={{ marginBottom: '4px' }}>
              PHASE: <span style={{ color: '#00FF88', fontWeight: 'bold' }}>{syncState.phase.toUpperCase()}</span>
            </div>
            <div style={{ marginBottom: '10px' }}>
              STATUS: <span style={{ color: '#aaa' }}>{syncState.status}</span>
            </div>
            <div style={{ 
              height: '2px', 
              background: 'rgba(255, 255, 255, 0.1)', 
              width: '100%',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ 
                position: 'absolute',
                top: 0, left: 0, height: '100%',
                background: '#00FF88', 
                boxShadow: '0 0 10px #00FF88',
                width: syncState.phase === 'Completed' ? '100%' : 
                       syncState.phase === 'Retraining' ? '75%' : 
                       syncState.phase === 'Appending' ? '45%' : '15%',
                transition: 'width 0.8s ease-out'
              }}></div>
            </div>
          </div>
        )}
      </nav>

      {/* Center Map Area */}
      <main className="main-section">
        <div ref={mapElement} className="map-container"></div>
      </main>

      {/* Right Analytics Panel */}
      <aside className="analytics-panel">
        <h3>Live Analytics</h3>
        
        {forecast && (
          <div className="data-card">
            <div>30-Day NDVI Forecast</div>
            <h2>{forecast.forecast_30_days.toFixed(2)}</h2>
            <div>
              Trend: {forecast.trend} | {forecast.accuracy_metric}
            </div>
          </div>
        )}

        <div className="data-card">
          <div>Avg Vegetation Index</div>
          <h2>0.72</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockNdviData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" fontSize={12} />
                <YAxis fontSize={12} domain={[0.6, 0.9]} />
                <Area type="monotone" dataKey="value" stroke="#000" fill="#ccc" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="data-card">
          <div>Soil Moisture Content</div>
          <h2>38%</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockSarData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" fontSize={12} />
                <YAxis fontSize={12} />
                <Line type="monotone" dataKey="level" stroke="#000" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default App;