import React, { useEffect, useRef } from 'react';
import './App.css';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';

const App: React.FC = () => {
  // Define the type for the HTML element
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!mapElement.current) return;

    // Cavite Coordinates: [Longitude, Latitude]
    const caviteCenter = fromLonLat([120.9, 14.3]);

    mapRef.current = new Map({
      target: mapElement.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
      ],
      view: new View({
        center: caviteCenter,
        zoom: 11,
      }),
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.setTarget(undefined);
      }
    };
  }, []);

  const handleFetchData = (type: 'NDVI' | 'SAR') => {
    console.log(`Requesting ${type} data from FastAPI...`);
    // We will wire this up to our FastAPI fetch calls next
  };

  return (
    <div className="app-container">
      <nav className="sidebar">
        <h2 className="logo">Agri-Watch</h2>
        <div className="status-badge">Lead Dev: Carlos</div>
        <hr className="divider" />
        
        <button className="nav-btn" onClick={() => handleFetchData('NDVI')}>
          🛰️ NDVI (Drought)
        </button>
        <button className="nav-btn" onClick={() => handleFetchData('SAR')}>
          🌊 SAR (Flood)
        </button>
      </nav>

      <main className="main-section">
        <div ref={mapElement} className="map-container"></div>
        
        <footer className="trends-panel">
          <h3>Cavite Statistics & Forecast</h3>
          <div className="chart-wrapper">
             {/* Recharts will go here later */}
             <p>Awaiting satellite data stream...</p>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default App;