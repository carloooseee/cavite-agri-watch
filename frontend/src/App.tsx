import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import 'ol/ol.css';
import OLMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import { fromLonLat, transformExtent } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorImageLayer from 'ol/layer/VectorImage';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Style, Stroke, Fill, Text } from 'ol/style';
import { AgriApi, type ForecastData } from './services/api';
import ValidationEvidence from './components/ValidationEvidence';
import XYZ from 'ol/source/XYZ';
import { jsPDF } from "jspdf";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import CircleStyle from 'ol/style/Circle';
import {
  Search,
  MapPin,
  Sparkles,
  Satellite,
  FileDown,
  Eye,
  EyeOff,
  Layers,
  Plus,
  Minus,
  Crosshair,
  Sun,
  Moon,
  X,
  Info,
  TrendingUp,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Menu,
  ChevronRight,
  ChevronDown,
  LocateFixed,
  Loader2
} from 'lucide-react';

const CITIES = [
  { name: 'Alfonso' },
  { name: 'Amadeo' },
  { name: 'Bacoor' },
  { name: 'Carmona' },
  { name: 'Cavite City' },
  { name: 'Dasmariñas' },
  { name: 'General Emilio Aguinaldo' },
  { name: 'General Trias' },
  { name: 'Imus' },
  { name: 'Indang' },
  { name: 'Kawit' },
  { name: 'Magallanes' },
  { name: 'Maragondon' },
  { name: 'Mendez' },
  { name: 'Naic' },
  { name: 'Noveleta' },
  { name: 'Rosario' },
  { name: 'Silang' },
  { name: 'Tagaytay' },
  { name: 'Tanza' },
  { name: 'Ternate' },
  { name: 'Trece Martires' }
];

const App: React.FC = () => {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OLMap | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const ndviLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const philippinesLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const caviteLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const caviteSourceRef = useRef<VectorSource | null>(null);
  const selectedZoneRef = useRef<string>("Cavite Province");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cityDataMapRef = useRef<Map<string, { geom: any; geomGeoJson: any }>>(new Map());
  const locationLayerRef = useRef<VectorLayer<VectorSource> | null>(null);

  const [isLocating, setIsLocating] = useState(false);
  const [deviceCoords, setDeviceCoords] = useState<{ lon: number; lat: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 4000);
  };
  
  const [activeLayer, setActiveLayer] = useState<'NDVI' | 'DynamicWorld' | 'SAR' | 'None'>('None');
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [clickedGeometry, setClickedGeometry] = useState<object | null>(null); // GeoJSON geometry in EPSG:4326
  const [actionProgress, setActionProgress] = useState<{
    title: string;
    status: string;
    percent: number;
  } | null>(null);

  // Real-time Bridge States
  const [healthStatus, setHealthStatus] = useState<string>("Awaiting Target");
  const [activeZone, setActiveZone] = useState<string>("Cavite Province");
  const [lang, setLang] = useState<'EN' | 'TL'>('EN');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const handleToggleMenu = () => {
    if (window.innerWidth <= 840) {
      setIsMobileSidebarOpen(prev => !prev);
    } else {
      setIsDrawerOpen(prev => !prev);
    }
  };

  useEffect(() => {
    document.body.className = theme;
    philippinesLayerRef.current?.changed();
    caviteLayerRef.current?.changed();
  }, [theme]);

  const translations = {
    EN: {
      title: "Agricultural Watch",
      status_system: "SYSTEM STATUS:",
      status_online: "ONLINE",
      bridge: "Bridge:",
      bridge_active: "Active",
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
      title: "Agricultural Watch",
      status_system: "KATAYUAN NG SISTEMA:",
      status_online: "ONLINE",
      bridge: "Bridge:",
      bridge_active: "Aktibo",
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
    const isDark = theme === 'dark';
    switch(status) {
      case "No Stress": return isDark ? "#4ade80" : "#15803d";       // Crisp green
      case "Mild Stress": return isDark ? "#facc15" : "#b45309";     // Warm high-contrast amber (clearly visible on white)
      case "Moderate Stress": return isDark ? "#fb923c" : "#ea580c"; // Deep orange
      case "Severe Stress": return isDark ? "#f87171" : "#dc2626";   // Strong red
      default: return isDark ? "#94a3b8" : "#64748b";
    }
  };

  const [isForecasting, setIsForecasting] = useState(false);
  const satelliteLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const [isSatelliteLoading, setIsSatelliteLoading] = useState(false);
  const [isSatelliteLoaded, setIsSatelliteLoaded] = useState(false);
  const [showSatellite, setShowSatellite] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleToggleSatelliteVisibility = () => {
    if (!satelliteLayerRef.current) return;
    const nextVisible = !showSatellite;
    satelliteLayerRef.current.setVisible(nextVisible);
    // When satellite is visible, hide forecast mask so satellite is clear; when satellite is hidden, show forecast mask
    if (ndviLayerRef.current) {
      ndviLayerRef.current.setVisible(!nextVisible);
    }
    setShowSatellite(nextVisible);
  };

  const handleToggleSatellite = async () => {
    if (!mapRef.current || activeZone === "Cavite Province" || !clickedGeometry) return;
    
    // If already loaded into the map, toggle visibility directly without reloading from network
    if (isSatelliteLoaded && satelliteLayerRef.current) {
      handleToggleSatelliteVisibility();
      return;
    }

    setIsSatelliteLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/map/satellite/zone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clickedGeometry)
      });
      const data = await response.json();
      
      if (data.url_template) {
        const layer = new TileLayer({
          source: new XYZ({ url: data.url_template, crossOrigin: 'anonymous' }),
          zIndex: 30, // Above forecast layer (zIndex: 25) and Cavite base layer (zIndex: 10)
        });
        mapRef.current.addLayer(layer);
        satelliteLayerRef.current = layer;
        setIsSatelliteLoaded(true);
        setShowSatellite(true);
        // Hide forecast mask so the true-color satellite imagery is unobstructed
        if (ndviLayerRef.current) {
          ndviLayerRef.current.setVisible(false);
        }
      }
    } catch (error) {
      console.error("Failed to load satellite image:", error);
    } finally {
      setIsSatelliteLoading(false);
    }
  };
  const handleForesee = async () => {
    setIsForecasting(true);
    setActionProgress({ title: 'AI Analysis & Land Cover', status: 'Connecting to Earth Engine...', percent: 15 });
    try {
      let data;
      if (clickedGeometry) {
        setActionProgress({ title: 'AI Analysis & Land Cover', status: `Analyzing ${activeZone} spectral bands & satellite imagery...`, percent: 40 });

        // Remove any existing layer before rendering
        if (ndviLayerRef.current && mapRef.current) {
          mapRef.current.removeLayer(ndviLayerRef.current);
          ndviLayerRef.current = null;
        }

        // Hide satellite layer while rendering new forecast so the land cover mask is immediately visible
        if (satelliteLayerRef.current) {
          satelliteLayerRef.current.setVisible(false);
          setShowSatellite(false);
        }

        const prediction = await AgriApi.getZonePrediction(clickedGeometry as Record<string, unknown>, activeZone);
        data = prediction;
        const statusVal = data?.health_status || data?.classification || data?.status;

        setActionProgress({ title: 'AI Analysis & Land Cover', status: 'Rendering Vegetation & Built Area mask...', percent: 75 });

        const builtColor = '#111827'; // Dark / black for clear distinction from colorful vegetation gradient
        const dwRes = await fetch('http://127.0.0.1:8000/map/dynamic-world/zone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            geometry: clickedGeometry,
            status: statusVal,
            city_name: activeZone,
            theme: theme,
            built_color: builtColor,
          }),
        }).then(r => r.ok ? r.json() : null);

        if (dwRes?.url_template && mapRef.current) {
          const layer = new TileLayer({
            source: new XYZ({ 
              url: dwRes.url_template,
              crossOrigin: 'anonymous' 
            }),
            zIndex: 25,
          });
          mapRef.current.addLayer(layer);
          ndviLayerRef.current = layer;
          ndviLayerRef.current.setVisible(true);
          setActiveLayer('DynamicWorld');
        }
      } else {
        setActionProgress({ title: 'AI Forecast', status: 'Loading historical baseline data...', percent: 45 });
        data = await AgriApi.getPrediction(activeZone);
      }
      
      if (data && !Object.prototype.hasOwnProperty.call(data, 'error') && data.status !== "Error") {
        setForecast(data);
        const statusVal = data.health_status || data.classification || data.status;
        if (statusVal && statusVal !== "Success" && statusVal !== "OK") {
          setHealthStatus(statusVal);
        }
        setActionProgress({ title: 'AI Analysis & Land Cover', status: 'Analysis & Land Cover Mask Complete!', percent: 100 });
      } else {
        console.error("Backend error:", data?.message || data?.error);
        setActionProgress({ title: 'AI Analysis & Land Cover', status: 'Analysis complete.', percent: 100 });
      }
    } catch (err) {
      console.error("Forecasting failed:", err);
      setActionProgress({ title: 'AI Analysis & Land Cover', status: 'Failed to process request.', percent: 100 });
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
    doc.text(`AI Confidence: ${forecast?.accuracy_metric || "n/a"}`, 130, 222);
    doc.text(`Softmax Prob: ${forecast?.softmax_prob != null ? (forecast.softmax_prob * 100).toFixed(1) + '%' : 'n/a'}`, 130, 229);

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
    // Bounding box covering the Philippines archipelago to allow panning and viewing the entire country
    const phExtent = transformExtent([114.0, 4.0, 130.0, 22.0], 'EPSG:4326', 'EPSG:3857');

    // Greyed out, unselectable styling for the rest of the Philippines (solid land over blue water)
    const phLightStyle = new Style({
      fill: new Fill({ color: '#dde3ea' }),
      stroke: new Stroke({ color: '#cbd5e1', width: 1 }),
    });
    const phDarkStyle = new Style({
      fill: new Fill({ color: '#1e293b' }),
      stroke: new Stroke({ color: '#334155', width: 1 }),
    });
    const phStyleFunction = () => {
      return document.body.classList.contains('dark') ? phDarkStyle : phLightStyle;
    };

    // 1. Optimized Vector Image Layer for the rest of the Philippines (cached off-screen raster for 60 FPS)
    const philippinesLayer = new VectorImageLayer({
      source: new VectorSource({ url: '/geojson/philippines.geojson', format: new GeoJSON() }),
      style: phStyleFunction,
      zIndex: 0,
      properties: { isSelectable: false },
    });
    philippinesLayerRef.current = philippinesLayer as any;

    // 2. High-performance single consolidated VectorLayer for all 22 Cavite municipalities
    // Styled in a refined slate palette that harmonizes with the greyed-out Philippines backdrop
    // but stands out clearly with a richer solid fill, bold crisp boundary, and prominent municipal labels
    const caviteSource = new VectorSource();
    caviteSourceRef.current = caviteSource;
    const styleCache = new Map<string, Style>();

    const getCityStyle = (feature: any) => {
      const cityName = feature.get('name') || '';
      const displayName = feature.get('displayName') || cityName;
      const isDark = document.body.classList.contains('dark');
      const isSelected = (cityName === selectedZoneRef.current && cityName !== "Cavite Province");
      const cacheKey = `${cityName}_${isDark ? 'dark' : 'light'}_${isSelected ? 'selected' : 'normal'}`;

      let cached = styleCache.get(cacheKey);
      if (!cached) {
        if (isSelected) {
          // Selected region: made slightly darker to indicate it's been selected
          cached = new Style({
            zIndex: 100, // Render boundary and fill on top of adjacent lines
            fill: new Fill({
              color: isDark ? '#1E293B' : '#64748B', // Visibly slightly darker slate
            }),
            stroke: new Stroke({
              color: isDark ? '#CBD5E1' : '#0F172A', // Crisp high-contrast border
              width: 2.2,
            }),
            text: new Text({
              text: displayName,
              font: 'bold 14px Helvetica, Arial, sans-serif',
              fill: new Fill({ color: isDark ? '#F8FAFC' : '#FFFFFF' }),
              stroke: new Stroke({ color: isDark ? '#0F172A' : '#0F172A', width: 3.5 }),
              overflow: true,
            }),
          });
        } else {
          // Unselected region: standard slate
          cached = new Style({
            zIndex: 10,
            fill: new Fill({
              color: isDark ? '#334155' : '#94A3B8',
            }),
            stroke: new Stroke({
              color: isDark ? '#94A3B8' : '#334155',
              width: 1.8,
            }),
            text: new Text({
              text: displayName,
              font: 'bold 14px Helvetica, Arial, sans-serif',
              fill: new Fill({ color: isDark ? '#F8FAFC' : '#0F172A' }),
              stroke: new Stroke({ color: isDark ? '#0F172A' : '#FFFFFF', width: 3.5 }),
              overflow: true,
            }),
          });
        }
        styleCache.set(cacheKey, cached);
      }
      return cached;
    };

    const caviteLayer = new VectorLayer({
      source: caviteSource,
      zIndex: 10,
      properties: { isSelectable: true },
      style: getCityStyle,
    });
    caviteLayerRef.current = caviteLayer;

    mapRef.current = new OLMap({
      target: mapElement.current,
      layers: [ philippinesLayer, caviteLayer ],
      view: new View({ center: caviteCenter, zoom: 10, minZoom: 5.5, extent: phExtent }),
    });

    // 3. Native Map Click Selection for Cavite Municipalities
    // Directly updates selectedZoneRef without any intercepting Select interaction so region NEVER disappears
    mapRef.current.on('singleclick', (evt) => {
      const hit = mapRef.current?.forEachFeatureAtPixel(evt.pixel, (feat, layer) => {
        if (layer === caviteLayer && feat instanceof Feature) return feat;
        return null;
      });

      if (hit && hit instanceof Feature) {
        const cityName = hit.get('name') || "Unknown Area";
        selectedZoneRef.current = cityName;
        caviteLayerRef.current?.changed();

        setActiveZone(cityName);
        setSearchQuery(cityName);
        setIsDrawerOpen(true);

        const geom = hit.getGeometry();
        if (geom) {
          mapRef.current?.getView().fit(geom.getExtent(), { 
            duration: 800, 
            padding: [50, 50, 50, 50],
            maxZoom: 14 
          });

          const geoJsonWriter = new GeoJSON();
          const geomGeoJson = geoJsonWriter.writeGeometryObject(geom, {
            featureProjection: 'EPSG:3857',
            dataProjection: 'EPSG:4326',
          });
          setClickedGeometry(geomGeoJson);
        }

        if (ndviLayerRef.current && mapRef.current) {
          mapRef.current.removeLayer(ndviLayerRef.current);
          ndviLayerRef.current = null;
          setActiveLayer('None');
        }

        if (satelliteLayerRef.current && mapRef.current) {
          mapRef.current.removeLayer(satelliteLayerRef.current);
          satelliteLayerRef.current = null;
        }
        setIsSatelliteLoaded(false);
        setShowSatellite(false);

        setHealthStatus("Awaiting Analysis");

        if (socket.current?.readyState === WebSocket.OPEN) {
          socket.current.send(JSON.stringify({ name: cityName }));
        }
      }
    });

    // Dynamic pointer cursor only for desktop mice (bypassed on touch to prevent mobile frame drops)
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches) {
      mapRef.current.on('pointermove', (evt) => {
        if (evt.dragging) return;
        const hit = mapRef.current?.hasFeatureAtPixel(evt.pixel, {
          layerFilter: (l) => l === caviteLayer,
        });
        if (mapElement.current) {
          mapElement.current.style.cursor = hit ? 'pointer' : '';
        }
      });
    }

    // 5. Parallel Batch Feature Loading (all 22 cities fetched concurrently in parallel and added as 1 batch)
    const loadCitiesParallel = async () => {
      const geoJsonReader = new GeoJSON();
      const promises = CITIES.map(async (city) => {
        try {
          const fileName = city.name.replace(/ /g, '_').toLowerCase();
          const res = await fetch(`/geojson/${fileName}.geojson`);
          if (!res.ok) return null;
          const data = await res.json();
          const features = geoJsonReader.readFeatures(data, { featureProjection: 'EPSG:3857' });
          if (features.length > 0) {
            const feat = features[0];
            const geom = feat.getGeometry();
            if (geom) {
              const geomGeoJson = geoJsonReader.writeGeometryObject(geom, {
                featureProjection: 'EPSG:3857',
                dataProjection: 'EPSG:4326',
              });
              cityDataMapRef.current.set(city.name, { geom, geomGeoJson });
            }
            let displayName = city.name;
            if (displayName === "General Emilio Aguinaldo") {
              displayName = "General Emilio\nAguinaldo";
            } else if (displayName === "Trece Martires") {
              displayName = "Trece\nMartires";
            } else if (displayName === "General Trias") {
              displayName = "General\nTrias";
            } else if (displayName === "Cavite City") {
              displayName = "Cavite\nCity";
            }
            feat.set('name', city.name);
            feat.set('displayName', displayName);
            return feat;
          }
        } catch (e) {
          console.warn(`Failed to load boundary for ${city.name}`, e);
        }
        return null;
      });

      const loadedFeatures = (await Promise.all(promises)).filter((f): f is NonNullable<typeof f> => f !== null);
      caviteSource.addFeatures(loadedFeatures);
    };

    loadCitiesParallel();

    return () => {
      if (mapRef.current) mapRef.current.setTarget(undefined);
      philippinesLayerRef.current = null;
      caviteLayerRef.current = null;
      caviteSourceRef.current = null;
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
          zIndex: 25,
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

  /*
  const loadDynamicWorldForZone = async () => {
    if (!clickedGeometry || !mapRef.current) return;
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
            zIndex: 25,
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
    setTimeout(() => setActionProgress(null), 2500);
  };
  */


  const getPanelInfo = (status: string, forecastObj: ForecastData | null) => {
    // Trend chart built only from measured/predicted values returned by the backend
    const trendData = forecastObj ? [
      { day: 'T-45d', ndvi: forecastObj.lag_3 },
      { day: 'T-30d', ndvi: forecastObj.lag_2 },
      { day: 'T-15d', ndvi: forecastObj.lag_1 },
      { day: 'Current', ndvi: forecastObj.current_ndvi },
      { day: 'T+30d Forecast', ndvi: forecastObj.forecast_30_days },
    ].filter(p => typeof p.ndvi === 'number') : [];

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
            chart: trendData
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
            chart: trendData
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
            chart: trendData
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
    setSearchQuery(cityName === "Cavite Province" ? "" : cityName);
    setIsSearchOpen(false);
    setIsDrawerOpen(true);

    selectedZoneRef.current = cityName;
    caviteLayerRef.current?.changed();

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
      if (satelliteLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(satelliteLayerRef.current);
        satelliteLayerRef.current = null;
      }
      setIsSatelliteLoaded(false);
      setShowSatellite(false);
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
    if (satelliteLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(satelliteLayerRef.current);
      satelliteLayerRef.current = null;
    }
    setIsSatelliteLoaded(false);
    setShowSatellite(false);

    setHealthStatus("Awaiting Analysis");

    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ name: cityName }));
    }
  };

  const handleZoomIn = () => {
    const view = mapRef.current?.getView();
    if (view) {
      view.animate({ zoom: (view.getZoom() ?? 10) + 1, duration: 250 });
    }
  };

  const handleZoomOut = () => {
    const view = mapRef.current?.getView();
    if (view) {
      view.animate({ zoom: (view.getZoom() ?? 10) - 1, duration: 250 });
    }
  };

  const handleRecenter = () => {
    if (activeZone !== "Cavite Province") {
      const cityData = cityDataMapRef.current.get(activeZone);
      if (cityData?.geom && mapRef.current) {
        mapRef.current.getView().fit(cityData.geom.getExtent(), {
          duration: 800,
          padding: [80, 80, 80, 80],
          maxZoom: 14
        });
        return;
      }
    }
    if (mapRef.current) {
      const caviteCenter = fromLonLat([120.90, 14.28]);
      mapRef.current.getView().animate({ center: caviteCenter, zoom: 10, duration: 800 });
    }
  };

  const handleCenterOnDevice = () => {
    if (!navigator.geolocation) {
      showToast(lang === 'EN' ? "Geolocation is not supported by your browser." : "Hindi suportado ang geolocation sa browser na ito.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { longitude, latitude } = pos.coords;
        setDeviceCoords({ lon: longitude, lat: latitude });

        const coords3857 = fromLonLat([longitude, latitude]);

        if (mapRef.current) {
          // Initialize user location vector layer if not already added
          if (!locationLayerRef.current) {
            const locSource = new VectorSource();
            const locLayer = new VectorLayer({
              source: locSource,
              zIndex: 999
            });
            mapRef.current.addLayer(locLayer);
            locationLayerRef.current = locLayer;
          }

          // Add / update Google Maps style blue location dot with halo
          const source = locationLayerRef.current.getSource();
          if (source) {
            source.clear();

            // Outer soft accuracy halo
            const haloFeature = new Feature({
              geometry: new Point(coords3857)
            });
            haloFeature.setStyle(
              new Style({
                image: new CircleStyle({
                  radius: 18,
                  fill: new Fill({ color: 'rgba(26, 115, 232, 0.22)' }),
                  stroke: new Stroke({ color: 'rgba(26, 115, 232, 0.45)', width: 1.5 })
                })
              })
            );

            // Inner solid blue dot with white border
            const dotFeature = new Feature({
              geometry: new Point(coords3857)
            });
            dotFeature.setStyle(
              new Style({
                image: new CircleStyle({
                  radius: 7,
                  fill: new Fill({ color: '#1a73e8' }),
                  stroke: new Stroke({ color: '#ffffff', width: 2.5 })
                })
              })
            );

            source.addFeatures([haloFeature, dotFeature]);
          }

          // Animate smoothly to device position
          mapRef.current.getView().animate({
            center: coords3857,
            zoom: Math.max(mapRef.current.getView().getZoom() ?? 10, 14),
            duration: 850
          });

          // Check if coordinate is inside any Cavite municipality polygon
          let matchedCity: string | null = null;
          cityDataMapRef.current.forEach((data, cityName) => {
            if (!matchedCity && data.geom && data.geom.intersectsCoordinate(coords3857)) {
              matchedCity = cityName;
            }
          });

          if (matchedCity) {
            handleCitySelectChange(matchedCity);
            showToast(lang === 'EN' ? `Located inside ${matchedCity}!` : `Nahanap sa loob ng ${matchedCity}!`);
          } else {
            showToast(
              lang === 'EN'
                ? "Device location centered (outside Cavite agricultural boundary)"
                : "Naka-sentro sa device location (sa labas ng Cavite)"
            );
          }
        }
      },
      (err) => {
        setIsLocating(false);
        console.warn("Device location error:", err);
        if (err.code === 1) {
          showToast(
            lang === 'EN'
              ? "Location permission denied. Please allow GPS access in your browser."
              : "Hindi pinahintulutan ang lokasyon. Paki-enable ang GPS sa browser."
          );
        } else if (err.code === 2) {
          showToast(
            lang === 'EN'
              ? "Location unavailable. Please check your GPS / network connection."
              : "Hindi mahanap ang lokasyon. Paki-check ang GPS / koneksyon."
          );
        } else {
          showToast(
            lang === 'EN'
              ? "Location request timed out. Please try again."
              : "Nag-timeout ang request ng lokasyon. Subukan muli."
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000
      }
    );
  };

  return (
    <div className="app-container">
      {/* Floating GPS / Status Toast Notification */}
      {toastMessage && (
        <div className="gm-floating-toast">
          <MapPin size={15} color="var(--gm-primary-blue)" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Map Canvas (Full screen background) */}
      <div ref={mapElement} className="map-container"></div>

      {/* 2. Top-Center Floating Zone Pill */}
      <div className="gm-top-center-pill">
        <MapPin size={16} color="var(--gm-primary-blue)" />
        <span>{activeZone === "Cavite Province" ? "Cavite Province Overview" : `${activeZone}, Cavite`}</span>
      </div>

      {/* 3. Top-Right Floating Utility Bar */}
      <div className="gm-utility-bar">
        <div className="gm-utility-pill">
          <span className="gm-status-dot-pulse"></span>
          <span>{t.status_online}</span>
          <span style={{ color: 'var(--gm-border)' }}>|</span>
          <span>{t.bridge_active}</span>
        </div>
        <div className="gm-lang-toggle">
          <button 
            type="button" 
            onClick={() => setLang('EN')} 
            className={`gm-lang-btn ${lang === 'EN' ? 'active' : ''}`}
          >
            EN
          </button>
          <button 
            type="button" 
            onClick={() => setLang('TL')} 
            className={`gm-lang-btn ${lang === 'TL' ? 'active' : ''}`}
          >
            TL
          </button>
        </div>
        <button 
          type="button" 
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} 
          className="gm-icon-btn"
          title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>

      {/* 4. Top-Left Google Maps Search Box & Action Chips */}
      <div className={`gm-search-wrapper ${isMobileSidebarOpen ? 'mobile-sidebar-active' : ''}`}>
        <div className="gm-search-card">
          <button 
            type="button" 
            className="gm-search-icon-btn gm-hamburger-btn"
            onClick={handleToggleMenu}
            title={lang === 'EN' ? "Menu & Function Controls" : "Menu at mga Kontrol"}
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>
          
          <div className="gm-search-input-container">
            <input 
              type="text"
              className="gm-search-input"
              placeholder={lang === 'EN' ? "Search Cavite municipality or city..." : "Maghanap ng munisipalidad o lungsod..."}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const matches = CITIES.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
                  if (matches.length > 0) {
                    handleCitySelectChange(matches[0].name);
                  }
                }
              }}
            />
          </div>

          {searchQuery ? (
            <button 
              type="button" 
              className="gm-search-icon-btn"
              onClick={() => {
                setSearchQuery("");
                handleCitySelectChange("Cavite Province");
              }}
              title="Clear search"
            >
              <X size={18} />
            </button>
          ) : (
            <button 
              type="button" 
              className="gm-search-icon-btn"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              title="Search"
            >
              <Search size={18} />
            </button>
          )}
        </div>

        {/* Backdrop for closing search menu */}
        {isSearchOpen && (
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 28 }}
            onClick={() => setIsSearchOpen(false)}
          />
        )}

        {/* Dropdown Menu for Autocomplete / Municipality Search */}
        {isSearchOpen && (
          <div className="gm-dropdown-menu">
            <div 
              className={`gm-dropdown-item ${activeZone === "Cavite Province" ? 'active' : ''}`}
              onClick={() => handleCitySelectChange("Cavite Province")}
            >
              <MapPin size={16} />
              <span>Cavite Province (All Regions)</span>
              <span className="gm-dropdown-item-sub">Overview</span>
            </div>
            {CITIES
              .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(c => (
                <div 
                  key={c.name}
                  className={`gm-dropdown-item ${activeZone === c.name ? 'active' : ''}`}
                  onClick={() => handleCitySelectChange(c.name)}
                >
                  <MapPin size={16} color="var(--gm-primary-blue)" />
                  <span>{c.name}</span>
                  <span className="gm-dropdown-item-sub">Municipality</span>
                </div>
              ))}
          </div>
        )}

        {/* Google Maps Action Chips */}
        <div className="gm-chips-container">
          <button 
            type="button"
            className={`gm-chip ${isForecasting ? 'active' : ''}`}
            onClick={handleForesee}
            disabled={isForecasting}
          >
            <Sparkles size={15} color="var(--gm-primary-blue)" />
            <span>{isForecasting ? (lang === 'EN' ? 'Forecasting...' : 'Tinataya...') : t.run_forecast}</span>
          </button>

          {activeZone !== "Cavite Province" && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <button 
                type="button"
                className={`gm-chip ${showSatellite ? 'active' : ''}`}
                onClick={handleToggleSatellite}
                disabled={isSatelliteLoading}
                id="btn-satellite-toggle"
              >
                <Satellite size={15} color="var(--gm-green)" />
                <span>
                  {isSatelliteLoading
                    ? (lang === 'EN' ? 'Loading Satellite...' : 'Naglo-load...')
                    : isSatelliteLoaded
                      ? (showSatellite ? (lang === 'EN' ? 'Hide Satellite' : 'Itago ang Satellite') : (lang === 'EN' ? 'Satellite View' : 'Tingnan ang Satellite'))
                      : (lang === 'EN' ? 'Satellite View' : 'Tingnan ang Satellite')}
                </span>
              </button>
              {isSatelliteLoaded && (
                <button 
                  type="button"
                  onClick={handleToggleSatelliteVisibility}
                  id="btn-satellite-eye-toggle"
                  title={showSatellite ? "Hide Satellite Image (Keeps cached layer)" : "Show Satellite Image (Instant)"}
                  aria-label={showSatellite ? "Hide Satellite Image" : "Show Satellite Image"}
                  className="gm-icon-btn"
                  style={{ width: '32px', height: '32px' }}
                >
                  {showSatellite ? <Eye size={16} color="var(--gm-primary-blue)" /> : <EyeOff size={16} color="var(--gm-text-tertiary)" />}
                </button>
              )}
            </div>
          )}

          <button 
            type="button"
            className="gm-chip"
            onClick={handleDownloadReport}
          >
            <FileDown size={15} color="#ea4335" />
            <span>{t.download_report}</span>
          </button>

          <button 
            type="button"
            className={`gm-chip ${showAdvanced ? 'active' : ''}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <Info size={15} color="#fbbc04" />
            <span>{showAdvanced ? (lang === 'EN' ? 'Hide Details' : 'Itago ang Detalye') : (lang === 'EN' ? 'Show Details' : 'Ipakita ang Detalye')}</span>
          </button>
        </div>

        {/* Mobile Sidebar Backdrop (Behind Drawer) */}
        {isMobileSidebarOpen && (
          <div 
            className="gm-sidebar-backdrop"
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-label="Close menu backdrop"
          />
        )}

        {/* 5. Left Floating Place Card / Drawer (Google Maps Drawer / Sidebar) */}
        <aside className={`gm-place-drawer ${!isDrawerOpen ? 'desktop-collapsed' : ''} ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
        {/* Mobile Top Header */}
        <div className="gm-mobile-drawer-header">
          <div className="gm-mobile-drawer-brand">
            <MapPin size={18} color="var(--gm-primary-blue)" />
            <span>Cavite Agri-Watch</span>
          </div>
          <div className="gm-mobile-drawer-controls">
            <div className="gm-lang-toggle">
              <button 
                type="button" 
                onClick={() => setLang('EN')} 
                className={`gm-lang-btn ${lang === 'EN' ? 'active' : ''}`}
              >
                EN
              </button>
              <button 
                type="button" 
                onClick={() => setLang('TL')} 
                className={`gm-lang-btn ${lang === 'TL' ? 'active' : ''}`}
              >
                TL
              </button>
            </div>
            <button 
              type="button" 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} 
              className="gm-icon-btn"
              title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button
              type="button"
              className="gm-mobile-close-btn"
              onClick={() => setIsMobileSidebarOpen(false)}
              title="Close sidebar"
              aria-label="Close sidebar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="gm-place-header">
          <div className="gm-place-title-row">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeZone !== "Cavite Province" && (
                  <span 
                    style={{ 
                      width: '12px', 
                      height: '12px', 
                      borderRadius: '50%', 
                      backgroundColor: 'var(--gm-primary-blue)',
                      display: 'inline-block',
                      flexShrink: 0
                    }} 
                  />
                )}
                <h2 className="gm-place-title">{activeZone}</h2>
              </div>
              <p className="gm-place-subtitle">
                {activeZone === "Cavite Province" 
                  ? "Cavite Province, Philippines • Regional Overview"
                  : `${activeZone}, Cavite • Agricultural Zone`}
              </p>
            </div>
          </div>

          <div className="gm-status-badge">
            <span className="gm-status-dot" style={{ backgroundColor: getStatusColor(healthStatus) }}></span>
            <span>{t.status}: <strong style={{ color: getStatusColor(healthStatus) }}>{healthStatus}</strong></span>
          </div>
        </div>

        {/* Circular Action Buttons Row */}
        <div className="gm-action-buttons-row">
          <button 
            type="button"
            className="gm-action-btn-item"
            onClick={handleForesee}
            disabled={isForecasting}
          >
            <div className={`gm-action-circle ${isForecasting ? 'active' : ''}`}>
              <Sparkles size={18} />
            </div>
            <span>{t.run_forecast}</span>
          </button>

          {activeZone !== "Cavite Province" && (
            <button 
              type="button"
              className="gm-action-btn-item"
              onClick={handleToggleSatellite}
              disabled={isSatelliteLoading}
            >
              <div className={`gm-action-circle ${showSatellite ? 'active' : ''}`}>
                <Satellite size={18} />
              </div>
              <span>Satellite</span>
            </button>
          )}


          <button 
            type="button"
            className="gm-action-btn-item"
            onClick={handleDownloadReport}
          >
            <div className="gm-action-circle">
              <FileDown size={18} />
            </div>
            <span>Export</span>
          </button>

          <button 
            type="button"
            className="gm-action-btn-item"
            onClick={handleRecenter}
          >
            <div className="gm-action-circle">
              <Crosshair size={18} />
            </div>
            <span>Center</span>
          </button>
        </div>

        {/* Progress Bar (if active) */}
        {actionProgress && (
          <div className="gm-progress-box">
            <div className="gm-progress-header">
              <span>{actionProgress.title}</span>
              <span style={{ color: 'var(--gm-primary-blue)' }}>{actionProgress.percent}%</span>
            </div>
            <div className="gm-progress-bar-bg">
              <div className="gm-progress-bar-fill" style={{ width: `${actionProgress.percent}%` }}></div>
            </div>
            <div className="gm-progress-status-text">
              {actionProgress.status}
            </div>
          </div>
        )}

        {/* Dynamic World Legend if active */}
        {activeLayer === 'DynamicWorld' && (
          <div style={{ padding: '10px 18px', background: 'var(--gm-surface-hover)', borderBottom: '1px solid var(--gm-divider)', fontSize: '12px' }}>
            <strong>Land Cover & Crop Vigor (10m Resolution)</strong>
            <div style={{ display: 'flex', gap: '16px', marginTop: '6px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span 
                  style={{ 
                    width: '32px', 
                    height: '10px', 
                    borderRadius: '2px', 
                    display: 'inline-block',
                    background: healthStatus.includes('Damaged') || healthStatus.includes('Stressed')
                      ? 'linear-gradient(to right, #FCA5A5, #EF4444, #450A0A)'
                      : healthStatus.includes('Moderate') || healthStatus.includes('Warning')
                        ? 'linear-gradient(to right, #FEF08A, #FACC15, #CA8A04, #713F12)'
                        : 'linear-gradient(to right, #86EFAC, #22C55E, #16A34A, #14532D)',
                  }} 
                />
                <span><strong>Vegetation (Gradient: Light to Dark Vigor)</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span 
                  style={{ 
                    width: '12px', 
                    height: '10px', 
                    background: '#111827', 
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    borderRadius: '2px', 
                    display: 'inline-block' 
                  }} 
                />
                <span><strong>Built Area (Dark / Urban)</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* Drawer Body Content */}
        <div className="gm-drawer-content">
          {/* AI 30-Day Predictive Outlook Card */}
          {forecast && (
            <div className="gm-section-card">
              <div className="gm-section-title">
                <Sparkles size={16} color="var(--gm-primary-blue)" />
                <span>{t.forecast_title}</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--gm-text-secondary)' }}>
                Target: <strong>{forecast.city || activeZone}</strong>
              </p>
              
              <div className="gm-quote-box">
                "{forecast.meaning}"
              </div>

              <div className="gm-advice-box">
                <strong>Expert Advice:</strong> {forecast.expert_advice}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--gm-divider)', fontSize: '13px' }}>
                <span style={{ color: 'var(--gm-text-secondary)' }}>
                  {lang === 'EN' ? '30-Day Expected Trend:' : 'Inaasahang Takbo (30-Araw):'}
                </span>
                <span style={{ color: forecast.trend.includes('+') ? '#1e8e3e' : '#d93025', fontWeight: 'bold' }}>
                  {forecast.trend}
                </span>
              </div>
            </div>
          )}

          {/* Prescriptions & Agronomic Routines */}
          {activeZone !== "Cavite Province" && (
            <>
              <div className="gm-section-card">
                <div className="gm-section-title">
                  <Activity size={16} color="var(--gm-green)" />
                  <span>{t.routines}</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--gm-text-secondary)' }}>
                  {panelInfo.routines.desc}
                </p>
                <ul className="gm-bullet-list">
                  {panelInfo.routines.bullets.map((b: string, i: number) => (
                    <li key={i} className="gm-bullet-item">
                      <span className="gm-bullet-dot"></span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="gm-section-card">
                <div className="gm-section-title">
                  <CheckCircle2 size={16} color="var(--gm-primary-blue)" />
                  <span>{t.inputs}</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--gm-text-secondary)' }}>
                  {panelInfo.inputs.desc}
                </p>
                <ul className="gm-bullet-list">
                  {panelInfo.inputs.bullets.map((b: string, i: number) => (
                    <li key={i} className="gm-bullet-item">
                      <span className="gm-bullet-dot" style={{ backgroundColor: 'var(--gm-green)' }}></span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="gm-section-card">
                <div className="gm-section-title">
                  <AlertTriangle size={16} color="#d93025" />
                  <span>{t.avoid}</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--gm-text-secondary)' }}>
                  {panelInfo.avoid}
                </p>
              </div>
            </>
          )}

          {/* Text Toggle for Technical Details */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 10px 0' }}>
            <button 
              type="button"
              className="gm-details-text-btn"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Info size={15} />
              <span>{showAdvanced ? (lang === 'EN' ? 'Hide Details' : 'Itago ang Detalye') : (lang === 'EN' ? 'Show Details' : 'Ipakita ang Detalye')}</span>
              <ChevronDown size={15} className={`gm-details-chevron ${showAdvanced ? 'open' : ''}`} />
            </button>
          </div>

          {/* Advanced Technical Details */}
          {showAdvanced && (
            <>
              <div className="gm-section-card">
                <div className="gm-section-title">
                  <Info size={16} color="var(--gm-primary-blue)" />
                  <span>{t.spectral_title}</span>
                </div>

                {forecast && (
                  <div style={{ padding: '8px 12px', background: 'var(--gm-surface-hover)', borderRadius: 'var(--gm-radius-sm)', marginBottom: '12px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--gm-text-secondary)' }}>{lang === 'EN' ? 'NDVI Predicted (30-day):' : 'Tinatayang NDVI (30-araw):'}</span>
                    <strong style={{ fontSize: '14px', color: 'var(--gm-primary-blue)' }}>{forecast.forecast_30_days.toFixed(2)}</strong>
                  </div>
                )}

                <div className="gm-spectral-grid">
                  <div className="gm-spectral-chip">
                    <span className="gm-spectral-name">NDVI</span>
                    <span className="gm-spectral-val">{forecast?.current_ndvi !== undefined ? forecast.current_ndvi.toFixed(2) : '--'}</span>
                    <span className="gm-spectral-desc">Vegetation vigor</span>
                  </div>
                  <div className="gm-spectral-chip">
                    <span className="gm-spectral-name">EVI</span>
                    <span className="gm-spectral-val">{forecast?.evi !== undefined ? forecast.evi.toFixed(2) : '--'}</span>
                    <span className="gm-spectral-desc">Canopy index</span>
                  </div>
                  <div className="gm-spectral-chip">
                    <span className="gm-spectral-name">NDWI</span>
                    <span className="gm-spectral-val">{forecast?.ndwi !== undefined ? forecast.ndwi.toFixed(2) : '--'}</span>
                    <span className="gm-spectral-desc">Moisture level</span>
                  </div>
                  <div className="gm-spectral-chip">
                    <span className="gm-spectral-name">LSWI</span>
                    <span className="gm-spectral-val">{forecast?.lswi !== undefined ? forecast.lswi.toFixed(2) : '--'}</span>
                    <span className="gm-spectral-desc">Leaf water content</span>
                  </div>
                  <div className="gm-spectral-chip">
                    <span className="gm-spectral-name">NDRE</span>
                    <span className="gm-spectral-val">{forecast?.ndre !== undefined ? forecast.ndre.toFixed(2) : '--'}</span>
                    <span className="gm-spectral-desc">Red Edge early stress</span>
                  </div>
                </div>

                {forecast && (
                  <div style={{ marginTop: '10px', fontSize: '12px', borderTop: '1px solid var(--gm-divider)', paddingTop: '8px', color: 'var(--gm-text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <p>CNN Softmax Prob: <strong>{forecast.softmax_prob != null ? (forecast.softmax_prob * 100).toFixed(1) + '%' : '--'}</strong></p>
                    {forecast.landcover && (
                      <p>CNN Land Cover: <strong>{forecast.landcover.label}</strong> ({(forecast.landcover.vegetated_probability * 100).toFixed(1)}% veg)</p>
                    )}
                    {forecast.rainfall_mm != null && (
                      <p>CHIRPS Rainfall (30d): <strong>{forecast.rainfall_mm.toFixed(1)} mm</strong></p>
                    )}
                    {forecast.opa_alert_probability != null && (
                      <p>OPA Alert: <strong>{(forecast.opa_alert_probability * 100).toFixed(0)}%</strong> (score {forecast.opa_alert_score})</p>
                    )}
                    {forecast.model_used && <p>Model: <strong>{forecast.model_used}</strong></p>}
                  </div>
                )}
              </div>

              {/* 30-Day Trend Chart */}
              {panelInfo.chart && panelInfo.chart.length > 0 && (
                <div className="gm-section-card">
                  <div className="gm-section-title">
                    <TrendingUp size={16} color="var(--gm-primary-blue)" />
                    <span>Diagnostic NDVI Progression</span>
                  </div>
                  <div style={{ height: '140px', width: '100%', marginTop: '6px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={panelInfo.chart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--gm-border)" opacity={0.5} />
                        <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--gm-text-tertiary)' }} />
                        <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: 'var(--gm-text-tertiary)' }} />
                        <Tooltip />
                        <Line 
                          type="monotone" 
                          dataKey="ndvi" 
                          stroke={getStatusColor(healthStatus)} 
                          strokeWidth={3} 
                          dot={{ r: 4, fill: getStatusColor(healthStatus) }} 
                          activeDot={{ r: 6 }} 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <ValidationEvidence />
            </>
          )}

          {/* Download Report Button at bottom of card */}
          <button 
            type="button"
            onClick={handleDownloadReport}
            className="gm-chip"
            style={{ 
              width: '100%', 
              justifyContent: 'center', 
              background: 'var(--gm-primary-blue)', 
              color: '#ffffff', 
              borderColor: 'var(--gm-primary-blue)',
              padding: '10px',
              marginTop: '4px'
            }}
          >
            <FileDown size={16} />
            <span>{t.download_report}</span>
          </button>
        </div>
      </aside>
  </div>

      {/* 6. Mobile Floating Stacked Status & Region Card */}
      <div 
        className="gm-mobile-status-card" 
        onClick={() => setIsMobileSidebarOpen(true)}
        role="button"
        tabIndex={0}
      >
        <div className="gm-mobile-status-info">
          <div className="gm-mobile-zone-name">
            {activeZone !== "Cavite Province" && (
              <span 
                className="gm-mobile-color-dot"
                style={{ backgroundColor: 'var(--gm-primary-blue)' }} 
              />
            )}
            <span>{activeZone}</span>
          </div>
          <div className="gm-mobile-status-row">
            <span className="gm-status-dot" style={{ backgroundColor: getStatusColor(healthStatus) }}></span>
            <span className="gm-mobile-status-text">
              {t.status}: <strong style={{ color: getStatusColor(healthStatus) }}>{healthStatus}</strong>
            </span>
          </div>
        </div>
        <div className="gm-mobile-open-pill-btn">
          <span>{lang === 'EN' ? 'Details' : 'Detalye'}</span>
          <ChevronRight size={16} />
        </div>
      </div>





      {/* 7. Bottom-Right Floating Controls (Google Maps Signature Stack) */}
      <div className="gm-bottom-right-controls">
        {/* Layer Selector */}
        <button 
          type="button" 
          className={`gm-layer-box ${showSatellite ? 'active' : ''}`}
          onClick={() => {
            if (activeZone === "Cavite Province") {
              handleCitySelectChange("Silang");
            } else {
              handleToggleSatellite();
            }
          }}
          title={showSatellite ? "Switch to Map View" : "Switch to Satellite Imagery"}
          aria-label="Toggle map layer"
        >
          <Layers size={20} />
          <span style={{ fontSize: '9px', fontWeight: 600, marginTop: '2px' }}>
            {showSatellite ? 'Sat' : 'Map'}
          </span>
        </button>

        {/* Device Location (GPS) Center Button */}
        <button 
          type="button" 
          className={`gm-location-btn ${isLocating ? 'locating' : ''} ${deviceCoords ? 'active' : ''}`}
          onClick={handleCenterOnDevice}
          title={lang === 'EN' ? "Center on my device location (GPS)" : "I-sentro sa lokasyon ng device (GPS)"}
          aria-label="Center on device location"
        >
          {isLocating ? (
            <Loader2 size={19} className="gm-spin-icon" />
          ) : (
            <LocateFixed size={19} />
          )}
        </button>

        {/* Recenter Button */}
        <button 
          type="button" 
          className="gm-recenter-btn"
          onClick={handleRecenter}
          title={lang === 'EN' ? "Recenter view on Cavite" : "I-sentro ang view sa Cavite"}
          aria-label="Recenter map"
        >
          <Crosshair size={20} />
        </button>

        {/* Stacked Zoom Controls (+ / -) */}
        <div className="gm-zoom-group">
          <button 
            type="button" 
            className="gm-zoom-btn"
            onClick={handleZoomIn}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={18} />
          </button>
          <div className="gm-zoom-divider"></div>
          <button 
            type="button" 
            className="gm-zoom-btn"
            onClick={handleZoomOut}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;