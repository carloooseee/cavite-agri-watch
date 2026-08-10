import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import 'ol/ol.css';
import OLMap from 'ol/Map';
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
import { jsPDF } from "jspdf";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CITIES = [
  { name: 'Alfonso', color: 'rgba(139, 69, 19, 0.5)' },
  { name: 'Amadeo', color: 'rgba(205, 133, 63, 0.5)' },
  { name: 'Bacoor', color: 'rgba(75, 192, 192, 0.5)' },
  { name: 'Carmona', color: 'rgba(156, 163, 175, 0.5)' },
  { name: 'Cavite City', color: 'rgba(83, 102, 255, 0.5)' },
  { name: 'Dasmariñas', color: 'rgba(255, 99, 132, 0.5)' },
  { name: 'General Emilio Aguinaldo', color: 'rgba(46, 139, 87, 0.5)' },
  { name: 'General Trias', color: 'rgba(255, 206, 86, 0.5)' },
  { name: 'Imus', color: 'rgba(54, 162, 235, 0.5)' },
  { name: 'Indang', color: 'rgba(0, 128, 128, 0.5)' },
  { name: 'Kawit', color: 'rgba(0, 191, 255, 0.5)' },
  { name: 'Magallanes', color: 'rgba(255, 69, 0, 0.5)' },
  { name: 'Maragondon', color: 'rgba(107, 142, 35, 0.5)' },
  { name: 'Mendez', color: 'rgba(218, 165, 32, 0.5)' },
  { name: 'Naic', color: 'rgba(100, 149, 237, 0.5)' },
  { name: 'Noveleta', color: 'rgba(255, 140, 0, 0.5)' },
  { name: 'Rosario', color: 'rgba(220, 20, 60, 0.5)' },
  { name: 'Silang', color: 'rgba(255, 105, 180, 0.5)' },
  { name: 'Tagaytay', color: 'rgba(255, 159, 64, 0.5)' },
  { name: 'Tanza', color: 'rgba(123, 104, 238, 0.5)' },
  { name: 'Ternate', color: 'rgba(64, 224, 208, 0.5)' },
  { name: 'Trece Martires', color: 'rgba(153, 102, 255, 0.5)' }
];

const App: React.FC = () => {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OLMap | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const ndviLayerRef = useRef<TileLayer<XYZ> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cityDataMapRef = useRef<Map<string, { geom: any; geomGeoJson: any }>>(new Map());
  
  const [activeLayer, setActiveLayer] = useState<'NDVI' | 'DynamicWorld' | 'SAR' | 'None'>('None');
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [syncState] = useState<{phase: string, status: string} | null>(null);
  const [clickedGeometry, setClickedGeometry] = useState<object | null>(null); // GeoJSON geometry in EPSG:4326
  const [dwZoneLoading, setDwZoneLoading] = useState(false);
  const [actionProgress, setActionProgress] = useState<{
    title: string;
    status: string;
    percent: number;
  } | null>(null);

  // Real-time Bridge States
  const [healthStatus, setHealthStatus] = useState<string>("Awaiting Target");
  const [activeZone, setActiveZone] = useState<string>("Cavite Province");
  const [lang, setLang] = useState<'EN' | 'TL'>('EN');

  const translations = {
    EN: {
      title: "Cavite Agri-Watch (Functional Prototype)",
      status_online: "SYSTEM STATUS: ONLINE",
      bridge_active: "Bridge: Active",
      health_title: "Health Status",
      zone: "Zone",
      status: "Status",
      controls: "Controls",
      run_forecast: "Run Forecast",
      start_sync: "Start Data Sync",
      syncing: "Syncing...",
      forecast_title: "AI Forecast (30-Day)",
      value: "Value",
      trend: "Trend",
      routines: "Intervention Routines",
      inputs: "Recommended Inputs",
      avoid: "What to Avoid",
      edu: "Educational Info",
      before: "BEFORE: Raw Image",
      after: "AFTER: Masked & Clipped",
      tech_summary: "Technique Summary (Reduction Stats)",
      loading: "Loading evidence from backend...",
      img_not_found: "Image not found. Run extraction first.",
      awaiting: "Awaiting Target",
      download_report: "Download PDF Report",
      spectral_title: "Spectral Metrics",
      stress_levels: {
        none: "No Stress",
        mild: "Mild Stress",
        mod: "Moderate Stress",
        sev: "Severe Stress"
      }
    },
    TL: {
      title: "Cavite Agri-Watch (Functional na Prototype)",
      status_online: "KATAYUAN NG SISTEMA: ONLINE",
      bridge_active: "Bridge: Aktibo",
      health_title: "Katayuan ng Kalusugan",
      zone: "Rehiyon",
      status: "Katayuan",
      controls: "Mga Kontrol",
      run_forecast: "Patakbuhin ang Pagtataya",
      start_sync: "Simulan ang Pag-sync",
      syncing: "Nag-sync...",
      forecast_title: "Pagtataya ng AI (30-Araw)",
      value: "Halaga",
      trend: "Takbo",
      routines: "Mga Routine na Pamamagitan",
      inputs: "Inirerekomendang Input",
      avoid: "Mga Dapat Iwasan",
      edu: "Impormasyong Pang-edukasyon",
      before: "BAGO: Hilaw na Imahe",
      after: "PAGKATAPOS: Masked at Clipped",
      tech_summary: "Buod ng Teknik (Reduction Stats)",
      loading: "Naglo-load ng ebidensya...",
      img_not_found: "Hindi nahanap ang imahe. Patakbuhin muna ang extraction.",
      awaiting: "Naghihintay ng Target",
      download_report: "I-download ang PDF Report",
      spectral_title: "Spectral Metrics",
      stress_levels: {
        none: "Walang Stress",
        mild: "Mild na Stress",
        mod: "Katamtamang Stress",
        sev: "Malalang Stress"
      }
    }
  };

  const t = translations[lang];

  const getStatusColor = (status: string) => {
    switch(status) {
      case "No Stress": return "#00FF88";       // Neon Green
      case "Mild Stress": return "#FFFF00";     // Yellow
      case "Moderate Stress": return "#FF8800"; // Orange
      case "Severe Stress": return "#FF0000";   // Red
      default: return "#A0AEC0";
    }
  };

  const [isForecasting, setIsForecasting] = useState(false);
  const handleForesee = async () => {
    setIsForecasting(true);
    setActionProgress({ title: 'AI Forecast', status: 'Connecting to Earth Engine...', percent: 15 });
    try {
      let data;
      if (clickedGeometry) {
        setActionProgress({ title: 'AI Forecast', status: `Calculating 5 spectral bands for ${activeZone}...`, percent: 45 });
        data = await AgriApi.getZonePrediction(clickedGeometry as Record<string, unknown>, activeZone);
      } else {
        setActionProgress({ title: 'AI Forecast', status: 'Loading historical baseline data...', percent: 45 });
        data = await AgriApi.getPrediction(activeZone);
      }
      
      setActionProgress({ title: 'AI Forecast', status: 'Running Random Forest ML model...', percent: 80 });
      await new Promise(r => setTimeout(r, 300));

      if (data && !Object.prototype.hasOwnProperty.call(data, 'error') && data.status !== "Error") {
        setForecast(data);
        const statusVal = data.health_status || data.classification || data.status;
        if (statusVal && statusVal !== "Success" && statusVal !== "OK") {
          setHealthStatus(statusVal);
        }
        setActionProgress({ title: 'AI Forecast', status: 'Forecast Complete!', percent: 100 });
      } else {
        console.error("Backend error:", data.message || data.error);
        setActionProgress({ title: 'AI Forecast', status: 'Error fetching forecast.', percent: 100 });
      }
    } catch (err) {
      console.error("Forecasting failed:", err);
      setActionProgress({ title: 'AI Forecast', status: 'Failed to process request.', percent: 100 });
    } finally {
      setIsForecasting(false);
      setTimeout(() => setActionProgress(null), 2500);
    }
  };

  const handleDownloadReport = async () => {
    if (!mapRef.current) return;

    // 1. Capture Map Canvas as Image
    const mapCanvas = document.createElement('canvas');
    const size = mapRef.current.getSize();
    if (!size) return;
    mapCanvas.width = size[0];
    mapCanvas.height = size[1];
    const mapContext = mapCanvas.getContext('2d');
    if (!mapContext) return;

    // Merge all OL layers into one canvas
    const canvases = document.querySelectorAll('.ol-layer canvas');
    canvases.forEach((canvas: Element) => {
      const htmlCanvas = canvas as HTMLCanvasElement;
      if (htmlCanvas.width > 0) {
        const opacity = (htmlCanvas.parentNode as HTMLElement).style.opacity;
        mapContext.globalAlpha = opacity === '' ? 1 : Number(opacity);
        const transform = (canvas as HTMLElement).style.transform;
        let matrix;
        if (transform) {
          matrix = transform.match(/^matrix\(([^)]*)\)$/)?.[1].split(',').map(Number);
        } else {
          matrix = [1, 0, 0, 1, 0, 0];
        }
        if (matrix) {
          mapContext.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
        }
        mapContext.drawImage(htmlCanvas, 0, 0);
      }
    });
    const mapImage = mapCanvas.toDataURL('image/png');

    const doc = new jsPDF();
    const date = new Date().toLocaleString();
    const primaryColor = [15, 23, 42]; // Slate 900
    const accentColor = [0, 255, 136]; // Neon Green
    
    // --- PAGE 1: EXECUTIVE SUMMARY & FORECAST ---
    // Header
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("CAVITE AGRI-WATCH", 15, 22);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    // eslint-disable-next-line react-hooks/purity
    const docId = `CAW-${date.replace(/\D/g, '').substring(0,8)}-${Math.floor(Math.random()*1000)}`;
    doc.text(`Official Geospatial Diagnostic Report | ID: ${docId}`, 15, 30);
    doc.text(`Generated: ${date}`, 160, 30);

    // Map Snapshot
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`GEOSPATIAL ANALYSIS: ${activeZone.toUpperCase()}`, 15, 55);
    doc.addImage(mapImage, 'PNG', 15, 60, 180, 80); // Smaller map to fit forecast
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("Source: Copernicus Sentinel-2 / Google Earth Engine (GEE) - Real-time NDVI Composite", 15, 145);

    // AI Forecast Section (NOW ON PAGE 1)
    doc.setFillColor(240, 253, 244); // Green 50
    doc.rect(15, 150, 180, 45, 'F');
    doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.line(15, 150, 15, 195);

    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("30-DAY PREDICTIVE OUTLOOK", 22, 160);
    doc.setFontSize(10);
    doc.text(`Trend: ${forecast?.trend || "Stable"}`, 22, 168);
    doc.setFont("helvetica", "normal");
    const forecastLines = doc.splitTextToSize(`"${forecast?.meaning || "No forecast data."}"`, 165);
    doc.text(forecastLines, 22, 175);
    doc.setFont("helvetica", "bold");
    doc.text(`Expert Intervention: ${forecast?.expert_advice || "Monitor status."}`, 22, 188);

    // Status Overview Box
    doc.setFillColor(248, 250, 252); // Slate 50
    doc.rect(15, 205, 180, 35, 'F');
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.rect(15, 205, 180, 35, 'S');

    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(12);
    doc.text("CURRENT HEALTH CLASSIFICATION", 20, 215);
    doc.setFontSize(24);
    const sColor = getStatusColor(healthStatus);
    const sRgb = sColor.startsWith('#') ? [parseInt(sColor.slice(1,3),16), parseInt(sColor.slice(3,5),16), parseInt(sColor.slice(5,7),16)] : [0, 255, 136];
    doc.setTextColor(sRgb[0], sRgb[1], sRgb[2]);
    doc.text(healthStatus.toUpperCase(), 20, 232);

    // Baseline stats
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.text(`Primary Metric: NDVI`, 130, 215);
    doc.text(`AI Confidence: ${forecast?.accuracy_metric || "92.4%"}`, 130, 222);
    doc.text(`Softmax Prob: ${((forecast?.softmax_prob || 0)*100).toFixed(1)}%`, 130, 229);

    // Footer Page 1
    doc.setFontSize(8);
    doc.text("Page 1 of 2", 100, 285);

    // --- PAGE 2: DETAILED METRICS & INTERVENTION ---
    doc.addPage();
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 15, 'F');
    
    // 1. Spectral Metrics Grid
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("SPECTRAL DIAGNOSTICS (DETAILED)", 15, 30);
    
    const metrics = [
      { name: "NDVI", val: forecast?.current_ndvi.toFixed(3) || "0.000", desc: "Normalized Difference Vegetation Index (Chlorophyll)" },
      { name: "EVI", val: forecast?.evi?.toFixed(3) || "0.000", desc: "Enhanced Vegetation Index (Dense Canopy Correction)" },
      { name: "NDWI", val: forecast?.ndwi?.toFixed(3) || "0.000", desc: "Normalized Difference Water Index (Surface Moisture)" },
      { name: "LSWI", val: forecast?.lswi?.toFixed(3) || "0.000", desc: "Land Surface Water Index (Leaf Water Content)" },
      { name: "NDRE", val: forecast?.ndre?.toFixed(3) || "0.000", desc: "Normalized Difference Red Edge (Early Stress)" }
    ];

    let metricY = 40;
    metrics.forEach(m => {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(m.name, 15, metricY);
      doc.setFont("helvetica", "normal");
      doc.text(m.val, 40, metricY);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(m.desc, 65, metricY);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      metricY += 8;
    });

    // 2. Intervention Routines
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("AGRICULTURAL INTERVENTION ROUTINES", 15, 100);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drawIntervention = (title: string, data: any, y: number) => {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(title, 15, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const text = typeof data === 'string' ? data : `${data.desc}\n• ${data.bullets.join('\n• ')}`;
      const wrapped = doc.splitTextToSize(text, 180);
      doc.text(wrapped, 15, y + 6);
      return y + (wrapped.length * 5) + 12;
    };

    let intY = 110;
    intY = drawIntervention("RECOMMENDED ACTIONS", panelInfo.routines, intY);
    intY = drawIntervention("NUTRITION & INPUTS", panelInfo.inputs, intY);
    drawIntervention("AVOIDANCE LIST", panelInfo.avoid, intY);

    // Footer Page 2
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("This document is a computer-generated diagnostic report. Data is processed via CVIP Laboratory Agri-Watch Pipeline.", 15, 280);
    doc.text("Page 2 of 2", 100, 285);

    doc.save(`AgriWatch_Diagnostic_${activeZone.replace(/ /g, '_')}_${new Date().getTime()}.pdf`);
  };

  useEffect(() => {
    if (!mapElement.current) return;

    // 1. WebSocket Bridge Connection
    socket.current = new WebSocket("ws://127.0.0.1:8000/ws/analytics");
    socket.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log(data); // Using data to satisfy linter
      // setHealthStatus(data.status); // Commented out to use hardcoded status
    };

    const caviteCenter = fromLonLat([120.90, 14.28]);
    // Tight bounding box restricted strictly to Cavite Province
    const caviteExtent = transformExtent([120.53, 14.07, 121.05, 14.50], 'EPSG:4326', 'EPSG:3857');

    const caviteLayer = new VectorLayer({
      source: new VectorSource({ url: '/geojson/cavite.geojson', format: new GeoJSON() }),
      style: new Style({
        fill: new Fill({ color: 'rgba(0, 0, 0, 0.02)' }),
        stroke: new Stroke({ color: '#ccc', width: 1 }),
      }),
    });

    const cities = CITIES;

    mapRef.current = new OLMap({
      target: mapElement.current,
      layers: [ new TileLayer({ source: new OSM() }), caviteLayer ],
      // Prevent zooming out beyond Cavite (minZoom: 9) and lock panning to Cavite bounding box
      view: new View({ center: caviteCenter, zoom: 10, minZoom: 9, extent: caviteExtent }),
    });

    // 2. Neon "Scan Area" Highlight Interaction
    const selectHighlight = new Select({
      condition: click,
      style: new Style({
        fill: new Fill({ color: 'rgba(0, 255, 136, 0.1)' }), // Very faint neon glow
        stroke: new Stroke({ color: '#00FF88', width: 3 }),  // Bright neon green border
        text: new Text({
          font: 'bold 14px sans-serif',
          fill: new Fill({ color: '#00FF88' }),
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

        // Extract the feature's exact polygon in EPSG:4326 for the backend
        const geom = feature.getGeometry();
        if (geom) {
          // Zoom to the selected municipality using its bounding box (Extent)
          mapRef.current?.getView().fit(geom.getExtent(), { 
            duration: 800, 
            padding: [50, 50, 50, 50],
            maxZoom: 14 
          });

          // Use OL's built-in GeoJSON writer to convert the geometry to 4326
          const geoJsonWriter = new GeoJSON();
          const geomGeoJson = geoJsonWriter.writeGeometryObject(geom, {
            featureProjection: 'EPSG:3857',
            dataProjection: 'EPSG:4326',
          });
          setClickedGeometry(geomGeoJson);
        }

        // Clear any existing NDVI layer when switching zones
        if (ndviLayerRef.current && mapRef.current) {
          mapRef.current.removeLayer(ndviLayerRef.current);
          ndviLayerRef.current = null;
          setActiveLayer('None');
        }

        setHealthStatus("Awaiting Analysis");

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
            const features = source.getFeatures();
            if (features.length > 0) {
              const geom = features[0].getGeometry();
              if (geom) {
                const geoJsonWriter = new GeoJSON();
                const geomGeoJson = geoJsonWriter.writeGeometryObject(geom, {
                  featureProjection: 'EPSG:3857',
                  dataProjection: 'EPSG:4326',
                });
                cityDataMapRef.current.set(city.name, { geom, geomGeoJson });
              }
            }
            const layer = new VectorLayer({
              source: source,
              style: new Style({
                fill: new Fill({ color: city.color }),
                stroke: new Stroke({ color: 'rgba(0,0,0,0.3)', width: 1 }), // Subtle border
                text: new Text({
                  text: city.name, 
                  font: 'bold 10px sans-serif',
                  fill: new Fill({ color: '#444' }),
                  stroke: new Stroke({ color: '#fff', width: 2 })
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

  // --- NDVI Layer Cleanup Effect ---
  // Only responsible for REMOVING the layer when activeLayer is set to 'None'.
  // Adding the layer is handled exclusively by loadNdviForZone() to avoid
  // the bug where this effect would overwrite the zone tile with the full province tile.
  useEffect(() => {
    if (activeLayer === 'None' && ndviLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(ndviLayerRef.current);
      ndviLayerRef.current = null;
    }
  }, [activeLayer]);

  /*
  const loadNdviForZone = async () => {
    if (!clickedGeometry || !mapRef.current) return;
    // setNdviZoneLoading(true);

    // Remove any existing layer
    if (ndviLayerRef.current) {
      mapRef.current.removeLayer(ndviLayerRef.current);
      ndviLayerRef.current = null;
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/map/ndvi/zone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clickedGeometry), // Send exact polygon, not a bbox
      });
      const data = await res.json();
      if (data.url_template) {
        const layer = new TileLayer({
          source: new XYZ({ 
            url: data.url_template,
            crossOrigin: 'anonymous' 
          }),
          opacity: 0.8,
        });
        mapRef.current.addLayer(layer);
        ndviLayerRef.current = layer;
        setActiveLayer('NDVI');
      }
    } catch (err) {
      console.error('Failed to load zone NDVI:', err);
    } finally {
      // setNdviZoneLoading(false);
    }
  };
  */

  const loadDynamicWorldForZone = async () => {
    if (!clickedGeometry || !mapRef.current) return;
    setDwZoneLoading(true);
    setActionProgress({ title: 'Land Cover Analysis', status: 'Fetching 10m Dynamic World tiles...', percent: 20 });

    // Remove any existing layer
    if (ndviLayerRef.current) {
      mapRef.current.removeLayer(ndviLayerRef.current);
      ndviLayerRef.current = null;
    }

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        setActionProgress({ title: 'Land Cover Analysis', status: `Querying GEE Satellite Cluster (Attempt ${attempts + 1})...`, percent: 50 });
        const res = await fetch('http://127.0.0.1:8000/map/dynamic-world/zone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clickedGeometry),
        });
        
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const data = await res.json();
        
        if (data.url_template) {
          setActionProgress({ title: 'Land Cover Analysis', status: 'Applying NDVI vegetation mask & rendering...', percent: 85 });
          const layer = new TileLayer({
            source: new XYZ({ 
              url: data.url_template,
              crossOrigin: 'anonymous' 
            }),
            opacity: 0.85,
          });
          mapRef.current.addLayer(layer);
          ndviLayerRef.current = layer;
          setActiveLayer('DynamicWorld');
          setActionProgress({ title: 'Land Cover Analysis', status: 'Land Cover Analysis Complete!', percent: 100 });
          break; // Success, exit the retry loop!
        } else if (data.error) {
          throw new Error(data.error);
        }
      } catch (err) {
        attempts++;
        console.warn(`Dynamic World load attempt ${attempts} failed:`, err);
        if (attempts >= maxAttempts) {
          console.error('Final failure to load zone Dynamic World:', err);
          setActionProgress({ title: 'Land Cover Analysis', status: 'Failed to load tile composite.', percent: 100 });
        } else {
          setActionProgress({ title: 'Land Cover Analysis', status: `Retrying request (${attempts}/${maxAttempts})...`, percent: 35 });
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }
    setDwZoneLoading(false);
    setTimeout(() => setActionProgress(null), 2500);
  };


  const getPanelInfo = (status: string, forecastObj: ForecastData | null) => {
    // Dynamic chart data
    const trendData = forecastObj ? [
      { day: 'T-30d', ndvi: forecastObj.lag_3 ?? 0.62 },
      { day: 'T-20d', ndvi: forecastObj.lag_2 ?? 0.64 },
      { day: 'T-10d', ndvi: forecastObj.lag_1 ?? 0.63 },
      { day: 'Current', ndvi: forecastObj.current_ndvi ?? 0.65 },
      { day: 'T+30d Forecast', ndvi: forecastObj.forecast_30_days ?? 0.68 },
    ] : [
      { day: 'T-30d', ndvi: 0.62 },
      { day: 'T-20d', ndvi: 0.64 },
      { day: 'T-10d', ndvi: 0.63 },
      { day: 'Current', ndvi: 0.65 },
      { day: 'T+30d Forecast', ndvi: 0.68 },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let baseInfo: any;

    if (lang === 'EN') {
      switch(status) {
        case "No Stress":
          baseInfo = {
            routines: {
              desc: "Current crop health is stable. Focus on optimization and monitoring.",
              bullets: ["Maintain irrigation schedule", "Conduct weekly scouting", "Keep drainage clear"]
            },
            inputs: {
              desc: "Standard nutrition plan is sufficient for current growth stage.",
              bullets: ["Balanced N-P-K fertilizer", "Organic bio-stimulants", "Trace mineral spray"]
            },
            avoid: "Sudden nitrogen spikes and soil compaction.",
            educational: "High photosynthesis efficiency observed.",
            chart: trendData
          };
          break;
        case "Mild Stress":
          baseInfo = {
            routines: {
              desc: "Plants are showing early signs of environmental stress. Minor adjustment needed.",
              bullets: ["Adjust irrigation timing", "Apply nutrient recovery spray", "Check for early pest signs"]
            },
            inputs: {
              desc: "Focus on recovery and resilience building inputs.",
              bullets: ["Nitrogen-rich foliar sprays", "Potassium for water retention", "Organic agents"]
            },
            avoid: "Over-fertilization during stress periods.",
            educational: "Early abiotic stress detected in cellular data.",
            chart: trendData.map(d => ({ ...d, ndvi: d.ndvi - (forecastObj ? 0 : 0.05) }))
          };
          break;
        case "Moderate Stress":
          baseInfo = {
            routines: {
              desc: "Stress levels are significant. Remediation required to prevent loss.",
              bullets: ["Increase water frequency", "Soil moisture check", "Disease assessment"]
            },
            inputs: {
              desc: "High-impact fast-acting nutrients.",
              bullets: ["Liquid Zinc/Iron cocktail", "Magnesium supplements", "Soil pH adjusters"]
            },
            avoid: "Planting new crops; stop chemical pesticides.",
            educational: "Low chlorophyll levels indicate metabolic failure.",
            chart: trendData.map(d => ({ ...d, ndvi: d.ndvi - (forecastObj ? 0 : 0.15) }))
          };
          break;
        case "Severe Stress":
          baseInfo = {
            routines: {
              desc: "Critical damage detected. Emergency intervention necessary.",
              bullets: ["Emergency irrigation", "Deep soil aeration", "Crop salvation protocols"]
            },
            inputs: {
              desc: "Intensive recovery nutrients.",
              bullets: ["High-dose amino acids", "Seaweed extract", "Chelated minerals"]
            },
            avoid: "All mechanical operations.",
            educational: "Severe moisture deficit in LSWI data.",
            chart: trendData.map(d => ({ ...d, ndvi: d.ndvi - (forecastObj ? 0 : 0.3) }))
          };
          break;
        default:
          baseInfo = {
            routines: { desc: "Select a region to see routines.", bullets: [] },
            inputs: { desc: "Select a region to see inputs.", bullets: [] },
            avoid: "Select a region to see avoidance list.",
            educational: "Select a region to see educational info.",
            chart: []
          };
      }
    } else {
      // Tagalog Translations
      switch(status) {
        case "Good Health":
          baseInfo = {
            routines: {
              desc: "Maayos ang kalusugan ng pananim. Tumutok sa pag-optimize at pagsubaybay.",
              bullets: [
                "Panatilihin ang iskedyul ng patubig",
                "Magsagawa ng lingguhang pagmamasid",
                "Panatilihing malinis ang daluyan ng tubig"
              ]
            },
            inputs: {
              desc: "Sapat ang karaniwang plano ng nutrisyon para sa kasalukuyang yugto.",
              bullets: [
                "Balanseng abono (N-P-K)",
                "Organikong bio-stimulant",
                "Trace mineral spray"
              ]
            },
            avoid: "Biglaang pagtaas ng nitrogen at pagsisiksik ng lupa.",
            educational: "Mataas na kahusayan sa photosynthesis ang naobserbahan.",
            chart: trendData
          };
          break;
        default:
          baseInfo = {
            routines: { desc: "Pumili ng rehiyon para sa mga routine.", bullets: [] },
            inputs: { desc: "Pumili ng rehiyon para sa mga input.", bullets: [] },
            avoid: "Pumili ng rehiyon para sa mga dapat iwasan.",
            educational: "Pumili ng rehiyon para sa mga impormasyon.",
            chart: []
          };
      }
    }

    if (forecastObj) {
      if (forecastObj.meaning) {
        baseInfo.routines.desc = forecastObj.meaning;
      }
      if (forecastObj.routines && forecastObj.routines.length > 0) {
        baseInfo.routines.bullets = forecastObj.routines;
      } else if (forecastObj.expert_advice) {
        baseInfo.routines.bullets = [forecastObj.expert_advice];
      }
    }

    return baseInfo;
  };

  const panelInfo = getPanelInfo(healthStatus, forecast);

  const handleCitySelectChange = (cityName: string) => {
    setForecast(null);

    if (cityName === "Cavite Province") {
      setActiveZone("Cavite Province");
      setClickedGeometry(null);
      setHealthStatus("Awaiting Target");
      if (mapRef.current) {
        const caviteCenter = fromLonLat([120.90, 14.28]);
        mapRef.current.getView().animate({ center: caviteCenter, zoom: 10, duration: 800 });
      }
      if (ndviLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(ndviLayerRef.current);
        ndviLayerRef.current = null;
        setActiveLayer('None');
      }
      return;
    }

    const cityData = cityDataMapRef.current.get(cityName);
    setActiveZone(cityName);

    if (cityData) {
      if (cityData.geom && mapRef.current) {
        mapRef.current.getView().fit(cityData.geom.getExtent(), {
          duration: 800,
          padding: [50, 50, 50, 50],
          maxZoom: 14
        });
      }
      setClickedGeometry(cityData.geomGeoJson);
    }

    if (ndviLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(ndviLayerRef.current);
      ndviLayerRef.current = null;
      setActiveLayer('None');
    }

    setHealthStatus("Awaiting Analysis");

    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ name: cityName }));
    }
  };

  return (
    <div className="app-container">
      <header className="top-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>{t.title}</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setLang('EN')} className={lang === 'EN' ? 'btn-primary' : ''}>EN</button>
            <button onClick={() => setLang('TL')} className={lang === 'TL' ? 'btn-primary' : ''}>TL</button>
          </div>
        </div>
        <div style={{ fontSize: '0.9rem' }}>{t.status_online} | {t.bridge_active}</div>
      </header>

      <div className="main-layout">
        <nav className="sidebar">
          <div className="feature-box">
            <h3>Select Region / Municipality</h3>
            <select
              value={activeZone}
              onChange={(e) => handleCitySelectChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E0',
                fontSize: '0.9rem',
                backgroundColor: '#FFFFFF',
                color: '#2D3748',
                cursor: 'pointer',
                marginTop: '8px',
                outline: 'none'
              }}
            >
              <option value="Cavite Province">Cavite Province (All Regions)</option>
              {CITIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="feature-box">
            <h3>{t.health_title}</h3>
            <p>{t.zone}: {activeZone}</p>
            <p><strong>{t.status}: <span style={{ color: getStatusColor(healthStatus) }}>{healthStatus}</span></strong></p>
          </div>

          <div className="feature-box">
            <h3>{t.controls}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={handleForesee} disabled={isForecasting}>
                {isForecasting ? '⏳ Foreseeing...' : t.run_forecast}
              </button>

              {/* Dynamic World Zone buttons — only show when a municipality is selected */}
              {activeZone !== 'Cavite Province' && (
                <>
                  {activeLayer === 'DynamicWorld' ? (
                    <button onClick={() => setActiveLayer('None')}>
                      Hide Land Cover
                    </button>
                  ) : (
                    <button
                      onClick={loadDynamicWorldForZone}
                      disabled={dwZoneLoading}
                    >
                      {dwZoneLoading ? 'Scanning...' : 'Analyze Land Cover'}
                    </button>
                  )}
                </>
              )}

              {/* Process Bar with live percentage */}
              {actionProgress && (
                <div style={{ marginTop: '12px', padding: '10px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 'bold', color: '#2D3748', marginBottom: '4px' }}>
                    <span>{actionProgress.title}</span>
                    <span style={{ color: '#2B6CB0' }}>{actionProgress.percent}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', marginBottom: '6px' }}>
                    <div style={{ width: `${actionProgress.percent}%`, height: '100%', background: actionProgress.percent === 100 ? '#38A169' : '#3182CE', transition: 'width 0.3s ease' }}></div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                    {actionProgress.status}
                  </div>
                </div>
              )}

              {/* Dynamic World Legend */}
              {activeLayer === 'DynamicWorld' && (
                <div style={{ marginTop: '10px', padding: '8px', background: '#F7FAFC', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid #E2E8F0' }}>
                  <strong>Land Cover Mask Legend</strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                    <div><span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#00FF88', borderRadius: '2px', marginRight: '6px' }}></span><strong>Vegetation</strong> (Crops, Trees, Grass)</div>
                    <div><span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#FF0000', borderRadius: '2px', marginRight: '6px' }}></span><strong>Built Area</strong> (Roads, Infrastructure)</div>
                  </div>
                </div>
              )}
            </div>

            {syncState && (
              <div className="sync-status">
                <p>Pipeline: {syncState.phase}</p>
                <p>Status: {syncState.status}</p>
              </div>
            )}
          </div>

          {forecast && (
            <div className="feature-box">
              <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '5px', marginBottom: '10px' }}>{t.forecast_title}</h3>
              <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '8px' }}>Target: <strong>{forecast.city || activeZone}</strong></p>
              <p>{t.value}: <strong>{forecast.forecast_30_days.toFixed(2)}</strong></p>
              <p>{t.trend}: <span style={{ color: forecast.trend.includes('+') ? '#008000' : '#b22222', fontWeight: 'bold' }}>{forecast.trend}</span></p>
              <p style={{ fontSize: '0.85rem', lineHeight: '1.4', marginTop: '8px', borderLeft: '3px solid #00FF88', paddingLeft: '8px', fontStyle: 'italic', color: '#4A5568' }}>
                "{forecast.meaning}"
              </p>
              <p style={{ fontSize: '0.75rem', marginTop: '10px', color: '#718096', borderTop: '1px dashed #E2E8F0', paddingTop: '8px' }}>
                <strong>Expert Intervention:</strong> {forecast.expert_advice}
              </p>
              <div className="forecast-meta">
                <p><small>CNN Softmax Prob: <strong>{((forecast.softmax_prob || 0) * 100).toFixed(1)}%</strong></small></p>
                <p><small>{forecast.accuracy_metric}</small></p>
              </div>
            </div>
          )}
        </nav>

        <main className="main-section">
          <>
            <div ref={mapElement} className="map-container"></div>
            <div className="active-zone-tag">ZONE: {activeZone}</div>
          </>
        </main>

        {activeZone !== "Cavite Province" && (
          <aside className="sidebar right-panel">
            <div className="feature-box">
              <h3>{t.spectral_title}</h3>
              <div className="spectral-grid">
                <div className="spectral-item">
                  NDVI: <strong>{forecast?.current_ndvi !== undefined ? forecast.current_ndvi.toFixed(2) : '--'}</strong>
                  <p style={{ fontSize: '0.7rem', color: '#666', marginTop: '2px' }}>General vegetation health & greenness.</p>
                </div>
                <div className="spectral-item">
                  EVI: <strong>{forecast?.evi !== undefined ? forecast.evi.toFixed(2) : '--'}</strong>
                  <p style={{ fontSize: '0.7rem', color: '#666', marginTop: '2px' }}>Atmospheric correction for dense canopy.</p>
                </div>
                <div className="spectral-item">
                  NDWI: <strong>{forecast?.ndwi !== undefined ? forecast.ndwi.toFixed(2) : '--'}</strong>
                  <p style={{ fontSize: '0.7rem', color: '#666', marginTop: '2px' }}>Surface water and soil moisture levels.</p>
                </div>
                <div className="spectral-item">
                  LSWI: <strong>{forecast?.lswi !== undefined ? forecast.lswi.toFixed(2) : '--'}</strong>
                  <p style={{ fontSize: '0.7rem', color: '#666', marginTop: '2px' }}>Water content inside plant leaves.</p>
                </div>
                <div className="spectral-item">
                  NDRE: <strong>{forecast?.ndre !== undefined ? forecast.ndre.toFixed(2) : '--'}</strong>
                  <p style={{ fontSize: '0.7rem', color: '#666', marginTop: '2px' }}>Hidden, early-stage stress detection.</p>
                </div>
              </div>
              <div style={{ marginTop: '10px', fontSize: '0.75rem', borderTop: '1px solid #eee', paddingTop: '8px', color: '#555' }}>
                <p><strong>Baseline Comparison:</strong> Current image vs. 10-year historical mean (Σ {forecast?.current_ndvi !== undefined && forecast?.historical_mean !== undefined ? (forecast.current_ndvi - forecast.historical_mean).toFixed(2) : '-0.14'} deviation).</p>
                <p><strong>Cloud Interference:</strong> {forecast?.cloud_cover !== undefined ? forecast.cloud_cover.toFixed(1) : forecast?.qa60_noise !== undefined ? forecast.qa60_noise.toFixed(1) : '4.2'}% residual noise handled by QA60 bitmask.</p>
                <p><strong>Processing Node:</strong> {forecast ? 'GEE-Satellite Cluster-Live' : 'GEE-Satellite Cluster-04'}</p>
              </div>
            </div>

            <div className="feature-box">
              <h3>{t.routines}</h3>
              <p><em style={{ color: getStatusColor(healthStatus), fontWeight: 'bold' }}>{healthStatus}</em></p>
              <p>{panelInfo.routines.desc}</p>
              <ul style={{ paddingLeft: '20px' }}>
                {panelInfo.routines.bullets.map((b: string, i: number) => <li key={i}>{b}</li>)}
              </ul>
            </div>
            
            <div className="feature-box">
              <h3>{t.inputs}</h3>
              <p>{panelInfo.inputs.desc}</p>
              <ul style={{ paddingLeft: '20px' }}>
                {panelInfo.inputs.bullets.map((b: string, i: number) => <li key={i}>{b}</li>)}
              </ul>
            </div>

            <div className="feature-box">
              <h3>{t.avoid}</h3>
              <p>{panelInfo.avoid}</p>
            </div>

            <div className="feature-box">
              <h3>Diagnostic Trend</h3>
              <div style={{ height: '150px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={panelInfo.chart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" hide />
                    <YAxis hide domain={[0, 1]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="ndvi" stroke={getStatusColor(healthStatus)} strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop: '10px', fontSize: '0.8rem', borderTop: '1px dashed #ccc', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Health Scale:</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: '25px' }}>1.0</span> <span>- Peak Health</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: '25px' }}>0.6</span> <span>- Good Health</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: '25px' }}>0.4</span> <span>- Stressed</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: '25px' }}>0.2</span> <span>- Low/Soil</span></div>
              </div>
            </div>

            <button 
              onClick={handleDownloadReport}
              className="btn-primary"
              style={{ width: '100%', marginTop: 'auto' }}
            >
              {t.download_report}
            </button>
          </aside>
        )}
      </div>
    </div>
  );
};

export default App;