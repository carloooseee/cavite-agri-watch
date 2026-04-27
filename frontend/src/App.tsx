import React, { useEffect, useRef, useState } from 'react';
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
      { name: 'Dasmariñas', color: 'rgba(255, 99, 132, 0.6)' }, { name: 'Imus', color: 'rgba(54, 162, 235, 0.6)' },
      { name: 'General Trias', color: 'rgba(255, 206, 86, 0.6)' }, { name: 'Bacoor', color: 'rgba(75, 192, 192, 0.6)' },
      { name: 'Trece Martires', color: 'rgba(153, 102, 255, 0.6)' }, { name: 'Tagaytay', color: 'rgba(255, 159, 64, 0.6)' },
      { name: 'Carmona', color: 'rgba(156, 163, 175, 0.6)' }, { name: 'Cavite City', color: 'rgba(83, 102, 255, 0.6)' },
      { name: 'Silang', color: 'rgba(255, 105, 180, 0.6)' }, { name: 'Amadeo', color: 'rgba(205, 133, 63, 0.6)' },
      { name: 'Mendez', color: 'rgba(218, 165, 32, 0.6)' }, { name: 'Indang', color: 'rgba(0, 128, 128, 0.6)' },
      { name: 'Alfonso', color: 'rgba(139, 69, 19, 0.6)' }, { name: 'General Emilio Aguinaldo', color: 'rgba(46, 139, 87, 0.6)' },
      { name: 'Maragondon', color: 'rgba(107, 142, 35, 0.6)' }, { name: 'Ternate', color: 'rgba(64, 224, 208, 0.6)' },
      { name: 'Naic', color: 'rgba(100, 149, 237, 0.6)' }, { name: 'Tanza', color: 'rgba(123, 104, 238, 0.6)' },
      { name: 'Noveleta', color: 'rgba(255, 140, 0, 0.6)' }, { name: 'Rosario', color: 'rgba(220, 20, 60, 0.6)' },
      { name: 'Kawit', color: 'rgba(0, 191, 255, 0.6)' }
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

    const handleResize = () => {
      if (mapRef.current) mapRef.current.updateSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (mapRef.current) mapRef.current.setTarget(undefined);
      socket.current?.close();
    };
  }, []);

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="top-header">
        <h2>TERRA-SYNC V2</h2>
        <div className="header-status">
          <span style={{ color: '#00FF88' }}>● SYSTEM ONLINE</span>
          <span>FastAPI Bridge</span>
        </div>
      </header>

      {/* LEFT SIDEBAR */}
      <nav className="sidebar">
        <div className="health-card">
          <div className="health-title">SOIL HEALTH CLASSIFICATION</div>
          <h2>{healthStatus}</h2>
          <p className="health-desc">
            Agricultural composition in <strong>{activeZone}</strong> analyzed via satellite telemetry.
          </p>
        </div>

        <div className="data-card controls-card">
          <h3>Layers & Controls</h3>
          <button className={`nav-btn ${activeLayer === 'NDVI' ? 'active' : ''}`} onClick={() => setActiveLayer('NDVI')}>NDVI Analysis</button>
          <button className={`nav-btn ${activeLayer === 'SAR' ? 'active' : ''}`} onClick={() => setActiveLayer('SAR')}>SAR Intel</button>
          <button className="nav-btn" onClick={handleForesee}>Foresee Future NDVI</button>
          
          <button className="nav-btn sync-btn" onClick={handleSync} disabled={syncState !== null}>
            {syncState ? 'SYNC IN PROGRESS...' : 'INITIATE SYNC'}
          </button>
          
          {syncState && (
            <div className="sync-status">
              <div>[ PIPELINE ACTIVE ]</div>
              <div>PHASE: <span style={{ color: '#00FF88' }}>{syncState.phase.toUpperCase()}</span></div>
            </div>
          )}
        </div>
      </nav>

      {/* CENTER MAP */}
      <main className={`main-section ${!forecast ? 'main-section--wide' : ''}`}>
        <div ref={mapElement} className="map-container"></div>
        <div className="active-zone-tag">ACTIVE ZONE: {activeZone}</div>
      </main>

      {/* RIGHT ANALYTICS */}
      {forecast && (
        <aside className="analytics-panel">
          <div className="data-card">
            <small>30-DAY FORECAST</small>
            <h2>{forecast.forecast_30_days.toFixed(2)}</h2>
            <small>{forecast.trend}</small>
          </div>
        </aside>
      )}
    </div>
  );
};

export default App;