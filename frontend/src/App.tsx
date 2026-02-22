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
import { Style, Stroke, Fill } from 'ol/style';
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
        url: 'https://nominatim.openstreetmap.org/search?q=Cavite+Philippines&polygon_geojson=1&format=geojson',
        format: new GeoJSON(),
      }),
      style: new Style({
        fill: new Fill({
          color: 'rgba(57, 255, 20, 0.2)', // Light neon green highlight
        }),
        stroke: new Stroke({
          color: '#39ff14', // Neon green border
          width: 2,
        }),
      }),
    });

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
        minZoom: 5, // Prevent zooming out to see the world
        extent: philippinesExtent, // Lock map panning to Philippines
      }),
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.setTarget(undefined);
      }
    };
  }, []);

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="top-header wireframe-box">
        <h2>Cavite Agri-Watch</h2>
        <div className="header-status">
          <span>Engine: Online</span>
          <span>Telemetry: Nominal</span>
          <span>Live: {activeLayer}</span>
        </div>
      </header>

      {/* Left Sidebar */}
      <nav className="sidebar wireframe-box">
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
        <button className="nav-btn">Historical Archives</button>
        <button className="nav-btn">Alert Thresholds</button>
      </nav>

      {/* Center Map Area */}
      <main className="main-section wireframe-box" style={{ padding: 0, overflow: 'hidden' }}>
        <div ref={mapElement} className="map-container"></div>
      </main>

      {/* Right Analytics Panel */}
      <aside className="analytics-panel wireframe-box">
        <h3>Live Analytics</h3>
        
        <div className="data-card">
          <div>Avg Vegetation Index</div>
          <h2>0.72</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockNdviData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" fontSize={12} />
                <YAxis fontSize={12} domain={[0.6, 0.9]} />
                <Area type="monotone" dataKey="value" stroke="#8884d8" fill="#cecece" />
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
                <Line type="monotone" dataKey="level" stroke="#8884d8" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default App;