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
import { AgriApi, BASE_URL, WS_URL, type ForecastData } from './services/api';
import ValidationEvidence from './components/ValidationEvidence';
import XYZ from 'ol/source/XYZ';
import { jsPDF } from "jspdf";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Feature, { type FeatureLike } from 'ol/Feature';
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
  Loader2,
  Compass,
  HelpCircle
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

const SPECTRAL_INFO: Record<string, {
  fullName: string;
  category: { EN: string; TL: string };
  whatItIs: { EN: string; TL: string };
  analogy: { EN: string; TL: string };
  ranges: { EN: string; TL: string };
  interpret: (val: number | undefined, lang: 'EN' | 'TL') => { label: string; statusClass: string; text: string };
}> = {
  NDVI: {
    fullName: "Normalized Difference Vegetation Index",
    category: {
      EN: "Overall Plant Greenness & Photosynthetic Vigor",
      TL: "Pangkalahatang Sigla at Berde ng Pananim"
    },
    whatItIs: {
      EN: "Measures the balance between red sunlight (which healthy leaves absorb to generate food) and near-infrared light (which live cells scatter back into space). Higher numbers indicate rich, active foliage.",
      TL: "Sinusukat ang pulang liwanag na sinisipsip ng dahon at infrared na pinatatalbog nito. Ang mataas na marka ay patunay ng masiglang kloropil at mabilis na paglaki ng halaman."
    },
    analogy: {
      EN: "Think of NDVI like a plant's heartbeat: high values mean active, vigorous growth; low values signal thinning foliage or moisture exhaustion.",
      TL: "Parang pulso ng halaman: kapag mataas, masigla at lumalaki; kapag mababa, nanlalata o kinakapos sa tubig."
    },
    ranges: {
      EN: "Optimal: > 0.60 | Mild: 0.45 – 0.58 | Moderate: 0.30 – 0.45 | Severe: < 0.30",
      TL: "Malusog: > 0.60 | Bahagyang Pagbaba: 0.45 – 0.58 | Katamtaman: 0.30 – 0.45 | Malala: < 0.30"
    },
    interpret: (val, lang) => {
      const v = val ?? 0;
      if (v >= 0.60) {
        return {
          label: lang === 'EN' ? "Optimal Vigor" : "Napakalusog",
          statusClass: "#15803d",
          text: lang === 'EN' ? "Crops are thriving with thick foliage and high photosynthetic activity." : "Napakasigla ng pananim na may makapal at berdeng mga dahon."
        };
      }
      if (v >= 0.45) {
        return {
          label: lang === 'EN' ? "Mild Strain" : "Bahagyang Napapagod",
          statusClass: "#b45309",
          text: lang === 'EN' ? "Early vigor drop; plants are experiencing minor heat or water fatigue." : "Maagang pagbaba ng sigla; may kaunting stress sa init o patubig."
        };
      }
      if (v >= 0.30) {
        return {
          label: lang === 'EN' ? "Moderate Stress" : "Katamtamang Stress",
          statusClass: "#ea580c",
          text: lang === 'EN' ? "Noticeable yellowing (chlorosis) and thinning canopy; intervention needed." : "Kapansin-pansing paninilaw at pagkalagas; kailangan ng aksyon."
        };
      }
      return {
        label: lang === 'EN' ? "Severe Deficit" : "Malalang Kakulangan",
        statusClass: "#dc2626",
        text: lang === 'EN' ? "Critical vegetative decline or bare soil; high crop loss risk." : "Kritikal na pagkasira ng dahon o tuyong lupa; nanganganib ang ani."
      };
    }
  },
  EVI: {
    fullName: "Enhanced Vegetation Index",
    category: {
      EN: "Structural Canopy Volume & Biomass Depth",
      TL: "Kapal ng Dahon at Dami ng Tanim"
    },
    whatItIs: {
      EN: "An improved vegetation metric that penetrates through dense tropical foliage (like banana, corn, or lush rice) without saturating like standard NDVI.",
      TL: "Mas advanced na panukat na tumatagos sa makakapal na dahon (gaya ng sagingan, maisan, o palayan) nang hindi nagkakamali dahil sa sobrang berde."
    },
    analogy: {
      EN: "Like an X-ray through a crowded jungle canopy: reveals real biomass depth beneath the top layer of leaves.",
      TL: "Parang X-ray sa masusukal na halaman: nakikita kung gaano kakapal ang dahon hanggang sa pinaka-ilalim."
    },
    ranges: {
      EN: "Dense: > 0.40 | Moderate: 0.20 – 0.40 | Sparse / Open: < 0.20",
      TL: "Makapal: > 0.40 | Katamtaman: 0.20 – 0.40 | Manipis: < 0.20"
    },
    interpret: (val, lang) => {
      const v = val ?? 0;
      if (v >= 0.40) {
        return {
          label: lang === 'EN' ? "Dense Biomass" : "Makapal na Taniman",
          statusClass: "#15803d",
          text: lang === 'EN' ? "Deep canopy architecture with strong leaf coverage." : "Makapal ang mga dahon at may magandang proteksyon sa lupa."
        };
      }
      if (v >= 0.20) {
        return {
          label: lang === 'EN' ? "Moderate Canopy" : "Katamtamang Kapal",
          statusClass: "#b45309",
          text: lang === 'EN' ? "Standard canopy density typical of mid-stage vegetable or grain crops." : "Karaniwang kapal ng dahon para sa lumalaking gulay o palay."
        };
      }
      return {
        label: lang === 'EN' ? "Sparse Cover" : "Manipis na Tanim",
        statusClass: "#ea580c",
        text: lang === 'EN' ? "Thin canopy exposing bare soil to high evaporation." : "Manipis ang dahon kaya madaling matuyo ang lupa sa init."
      };
    }
  },
  NDWI: {
    fullName: "Normalized Difference Water Index",
    category: {
      EN: "Canopy & Surface Moisture Saturation",
      TL: "Basa at Halumigmig ng Dahon at Lupa"
    },
    whatItIs: {
      EN: "Uses shortwave-infrared absorption to gauge how much liquid water is stored across plant leaves and surrounding topsoil.",
      TL: "Gumagamit ng infrared upang malaman kung gaano karaming likidong tubig ang nasa mga dahon at lupa."
    },
    analogy: {
      EN: "Like a satellite sponge test: tells you immediately if the field is freshly quenched or starting to dry out.",
      TL: "Parang basang espongha mula sa kalawakan: malalaman agad kung basang-basa pa o natutuyo na ang taniman."
    },
    ranges: {
      EN: "Hydrated: > 0.15 | Normal: 0.00 – 0.15 | Water Deficit: < 0.00",
      TL: "Basang-basa: > 0.15 | Katamtaman: 0.00 – 0.15 | Tuyot: < 0.00"
    },
    interpret: (val, lang) => {
      const v = val ?? 0;
      if (v >= 0.15) {
        return {
          label: lang === 'EN' ? "Well Hydrated" : "Sapat sa Tubig",
          statusClass: "#15803d",
          text: lang === 'EN' ? "Abundant water content in leaves and soil profile." : "Sapat na sapat ang tubig sa lupa at mga dahon."
        };
      }
      if (v >= 0.00) {
        return {
          label: lang === 'EN' ? "Adequate Moisture" : "Katamtamang Basa",
          statusClass: "#b45309",
          text: lang === 'EN' ? "Normal moisture; monitor during extended hot spells." : "Normal ang basa ng lupa; bantayan kung tuloy-tuloy ang init."
        };
      }
      return {
        label: lang === 'EN' ? "Moisture Deficit" : "Kinakapos sa Tubig",
        statusClass: "#dc2626",
        text: lang === 'EN' ? "Topsoil and foliage are parched; irrigation is urgently needed." : "Tuyot ang lupa at dahon; kailangan agad ng patubig."
      };
    }
  },
  LSWI: {
    fullName: "Land Surface Water Index",
    category: {
      EN: "Internal Leaf Cell Hydration",
      TL: "Tubig sa Loob ng Selyula ng Halaman"
    },
    whatItIs: {
      EN: "Specifically targets the water inside the spongy mesophyll cells of living leaves. It is the primary satellite early warning for agricultural drought.",
      TL: "Tinitingnan ang tubig sa loob ng selyula ng dahon. Ito ang pinaka-maagang babala sa tagtuyot sa agrikultura."
    },
    analogy: {
      EN: "Early drought radar: catches cellular dehydration days before human eyes can see leaves wilt under the noon sun.",
      TL: "Maagang radar sa tagtuyot: nahuhuli ang pagkaubos ng tubig sa dahon mga araw bago pa makitang lanta ang halaman."
    },
    ranges: {
      EN: "Plump Cells: > 0.15 | Cellular Thirst: 0.00 – 0.15 | Osmotic Drought: < 0.00",
      TL: "Makatas: > 0.15 | Uhaw: 0.00 – 0.15 | Matinding Tagtuyot: < 0.00"
    },
    interpret: (val, lang) => {
      const v = val ?? 0;
      if (v >= 0.15) {
        return {
          label: lang === 'EN' ? "Cellularly Turgid" : "Makatas ang Selyula",
          statusClass: "#15803d",
          text: lang === 'EN' ? "Plant cells are fully inflated with water, keeping stems upright and pores open." : "Puno ng tubig ang mga selyula kaya tuwid ang tangkay."
        };
      }
      if (v >= 0.00) {
        return {
          label: lang === 'EN' ? "Mild Cellular Thirst" : "Bahagyang Nauuhaw",
          statusClass: "#b45309",
          text: lang === 'EN' ? "Leaves are closing stomata to conserve moisture; irrigate within 48 hours." : "Nagsasara ang butas ng dahon para magtipid sa tubig; diligan sa loob ng 48 oras."
        };
      }
      return {
        label: lang === 'EN' ? "Severe Dehydration" : "Matinding Pagkatuyo",
        statusClass: "#dc2626",
        text: lang === 'EN' ? "Cellular collapse from extreme water deficit; risk of permanent leaf scorch." : "Nangungulubot ang mga selyula; panganib ng pagkasunog ng dahon."
      };
    }
  },
  NDRE: {
    fullName: "Normalized Difference Red Edge",
    category: {
      EN: "Early Nitrogen & Chlorophyll Health",
      TL: "Maagang Babala sa Nutrisyon at Kloropil"
    },
    whatItIs: {
      EN: "Monitors the narrow 'Red Edge' wavelength where plant reflectance jumps sharply. Senses leaf chlorophyll and nitrogen levels before visible symptoms appear.",
      TL: "Sinusukat ang 'Red Edge' na liwanag upang matukoy ang kloropil at nitrogen bago pa man makita ang paninilaw."
    },
    analogy: {
      EN: "Like a fever thermometer for plants: catches nutrient starvation and root illness while the crop still looks green from a distance.",
      TL: "Parang thermometer sa lagnat: nalalaman kung may sakit o kulang sa abono ang halaman kahit mukha pa itong berde sa malayo."
    },
    ranges: {
      EN: "Optimal: > 0.35 | Early Warning: 0.20 – 0.35 | Chlorophyll Deficient: < 0.20",
      TL: "Sagana: > 0.35 | May Babala: 0.20 – 0.35 | Kulang sa Kloropil: < 0.20"
    },
    interpret: (val, lang) => {
      const v = val ?? 0;
      if (v >= 0.35) {
        return {
          label: lang === 'EN' ? "Rich Chlorophyll" : "Sagana sa Kloropil",
          statusClass: "#15803d",
          text: lang === 'EN' ? "Healthy nitrogen uptake and strong chlorophyll production." : "Maganda ang pagsipsip ng nitrogen at sapat ang nutrisyon."
        };
      }
      if (v >= 0.20) {
        return {
          label: lang === 'EN' ? "Early Chlorosis" : "Maagang Paninilaw",
          statusClass: "#b45309",
          text: lang === 'EN' ? "Early nitrogen starvation or root absorption restriction detected." : "May maagang kakulangan sa abono o hirap ang ugat sumipsip."
        };
      }
      return {
        label: lang === 'EN' ? "Nutrient Starved" : "Kulang sa Sustansya",
        statusClass: "#dc2626",
        text: lang === 'EN' ? "Impaired chlorophyll synthesis; foliar feeding or fertilizer needed." : "Bagsak ang kloropil; kailangan agad ng pataba o foliar spray."
      };
    }
  }
};

const App: React.FC = () => {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OLMap | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const ndviLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const philippinesLayerRef = useRef<VectorImageLayer<VectorSource> | VectorLayer<VectorSource> | null>(null);
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
  const [selectedSpectralMetric, setSelectedSpectralMetric] = useState<string>('NDVI');
  const [showLandCoverExplainer, setShowLandCoverExplainer] = useState<boolean>(false);

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
      routines: "Field Action Routines (FAO Guidelines)",
      inputs: "Recommended Inputs & Soil Care",
      avoid: "What to Avoid (Critical Mistakes)",
      fao_badge: "FAO Good Agricultural Practices",
      fao_ref: "Standard: FAO & PhilRice Agronomic Guidelines",
      field_signs: "Observed Field Condition",
      edu: "Educational Info",
      before: "BEFORE: Raw Image",
      after: "AFTER: Masked & Clipped",
      tech_summary: "Technique Summary (Reduction Stats)",
      loading: "Loading evidence from backend...",
      img_not_found: "Image not found. Run extraction first.",
      awaiting: "Awaiting Target",
      download_report: "Download PDF Report",
      spectral_title: "Spectral Metrics",
      map_legend: "Map Legend",
      curious_guide_title: "Curious Mind's Guide: Spectral Sensors",
      tap_to_explore: "Tap any metric chip above to explore what it measures",
      analogy_title: "Everyday Analogy",
      what_score_means: "What this score means",
      sensor_ranges: "Benchmark Scale",
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
      routines: "Mga Hakbang sa Bukid (Gabay ng FAO)",
      inputs: "Inirerekomendang Pataba at Gamot sa Lupa",
      avoid: "Mga Dapat Iwasan (Kritikal na Paalala)",
      fao_badge: "FAO Good Agricultural Practices",
      fao_ref: "Pamantayan: FAO at PhilRice Gabay sa Pagsasaka",
      field_signs: "Kondisyon sa Bukid",
      edu: "Impormasyong Pang-edukasyon",
      before: "BAGO: Hilaw na Imahe",
      after: "PAGKATAPOS: Masked at Clipped",
      tech_summary: "Buod ng Teknik (Reduction Stats)",
      loading: "Naglo-load ng ebidensya...",
      img_not_found: "Hindi nahanap ang imahe. Patakbuhin muna ang extraction.",
      awaiting: "Naghihintay ng Target",
      download_report: "I-download ang PDF Report",
      spectral_title: "Spectral Metrics",
      map_legend: "Alamat ng Mapa",
      curious_guide_title: "Gabay sa Pag-unawa: Mga Sensor ng Satellite",
      tap_to_explore: "Pindutin ang alinmang sensor sa itaas upang maintindihan",
      analogy_title: "Pang-araw-araw na Halimbawa",
      what_score_means: "Kahulugan ng markang ito",
      sensor_ranges: "Pamantayan sa Pagsukat",
      stress_levels: {
        none: "Walang Stress",
        mild: "Bahagyang Stress",
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
      const response = await fetch(`${BASE_URL}/map/satellite/zone`, {
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
        const dwRes = await fetch(`${BASE_URL}/map/dynamic-world/zone`, {
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
    const mapContext = mapCanvas.getContext('2d', { willReadFrequently: true });
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
    intY = drawIntervention("FIELD ACTION ROUTINES (FAO GOOD AGRICULTURAL PRACTICES)", panelInfo.routines, intY);
    intY = drawIntervention("RECOMMENDED NUTRITION & SOIL INPUTS", panelInfo.inputs, intY);
    drawIntervention("CRITICAL ACTIONS TO AVOID", panelInfo.avoid, intY);

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
    socket.current = new WebSocket(WS_URL);
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
    philippinesLayerRef.current = philippinesLayer;

    // 2. High-performance single consolidated VectorLayer for all 22 Cavite municipalities
    // Styled in a refined slate palette that harmonizes with the greyed-out Philippines backdrop
    // but stands out clearly with a richer solid fill, bold crisp boundary, and prominent municipal labels
    const caviteSource = new VectorSource();
    caviteSourceRef.current = caviteSource;
    const styleCache = new Map<string, Style>();

    const getCityStyle = (feature: FeatureLike) => {
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
      const res = await fetch(`${BASE_URL}/map/ndvi/zone`, {
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
        const res = await fetch(`${BASE_URL}/map/dynamic-world/zone`, {
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

    const normalizedStatus = (status || "").toLowerCase();
    const isOptimal = normalizedStatus.includes("no stress") || normalizedStatus.includes("optimal") || normalizedStatus.includes("good health");
    const isMild = normalizedStatus.includes("mild");
    const isModerate = normalizedStatus.includes("moderate") || normalizedStatus.includes("warning");
    const isSevere = normalizedStatus.includes("severe") || normalizedStatus.includes("damage");

    if (lang === 'EN') {
      if (isOptimal) {
        baseInfo = {
          diagnosis: "Lush green canopy and healthy vegetative vigor. Crop photosynthesis and water absorption are running at optimal rates.",
          routines: {
            desc: "Current crop health is stable and thriving. Follow standard maintenance and preventive field scouting:",
            bullets: [
              "Morning Irrigation (5:00 - 8:00 AM): Maintain regular 3–5 day schedule to minimize daytime evaporation.",
              "Drainage Canal Check: Keep furrows and drainage clear to avoid water stagnation and root suffocation.",
              "Weekly Border Scouting: Walk field perimeter weekly to catch early weed and pest ingress before it spreads.",
              "Mulch Top-up: Maintain a 3–5 cm layer of rice straw or dried grass to protect topsoil from baking in the sun."
            ]
          },
          inputs: {
            desc: "Standard maintenance nutrition according to current crop growth stage (FAO Good Agricultural Practices):",
            bullets: [
              "Balanced Complete Fertilizer (14-14-14 N-P-K) or well-decomposed animal manure.",
              "Beneficial Microorganisms (EM-1 or Trichoderma) to enhance root zone nutrient availability.",
              "Maintenance Foliar Spray (Zinc + Magnesium) every 14 days to sustain rich green chlorophyll."
            ]
          },
          avoid: {
            desc: "Excessive synthetic Nitrogen and water stagnation:",
            bullets: [
              "Excessive synthetic Nitrogen application (causes weak, watery stems prone to lodging and insect attack).",
              "Water stagnation lasting over 24 hours in flat furrows (leads to anaerobic root asphyxiation)."
            ]
          },
          educational: "High photosynthesis efficiency observed across satellite multispectral bands (NDVI > 0.60).",
          faoRef: "FAO Good Agricultural Practices (GAP) — Section 4: Soil Management & Crop Nutrition",
          chart: trendData
        };
      } else if (isMild) {
        baseInfo = {
          diagnosis: "Early crop fatigue: leaves may show slight curling or dullness under afternoon heat, but root systems are sound and fully recoverable.",
          routines: {
            desc: "Early environmental or moisture stress detected. Follow these field actions to stop vigor decline:",
            bullets: [
              "Shift Irrigation Hours: Water only in early morning (5:00 - 8:00 AM) or late afternoon to cut evaporation by 40%.",
              "Soil Moisture Squeeze Test: Dig 10 cm deep; if soil crumbles without forming a loose ball, irrigate immediately.",
              "Root-Zone Mulching: Spread a 5–7 cm layer of rice straw, rice hulls, or dry banana leaves around plant bases to lock in soil moisture.",
              "Clear Weeds within 30 cm: Weeds consume up to half of available moisture and fertilizer—hand-weed around crop stems immediately."
            ]
          },
          inputs: {
            desc: "Nutrient inputs aimed at cellular water retention and stress recovery (FAO/PhilRice standards):",
            bullets: [
              "Potassium Boost (Muriate of Potash / 0-0-60 or clean wood ash): Regulates leaf stomata to reduce water transpiration.",
              "Gentle Foliar Bio-stimulant: Spray diluted seaweed extract or fish amino acid (FAA) at dawn for quick foliar uptake.",
              "Organic Vermicompost: Apply 1–2 handfuls per hill around root base to improve soil water-holding capacity."
            ]
          },
          avoid: {
            desc: "Mistakes that aggravate early stress:",
            bullets: [
              "NEVER apply concentrated granular Urea (46-0-0) to dry soil (burns thirsty roots and causes salt scorch).",
              "DO NOT spray foliar nutrients or pesticides during peak noon sun (10:00 AM – 3:00 PM) as droplets scorch leaves.",
              "Avoid deep hoeing or cultivation near root crowns that shears delicate water-seeking feeder roots."
            ]
          },
          educational: "Early abiotic water/heat stress detected in canopy spectral reflectance (NDVI 0.45–0.58).",
          faoRef: "FAO Good Agricultural Practices (GAP) — Section 5: Water Management & Abiotic Stress Mitigation",
          chart: trendData
        };
      } else if (isModerate) {
        baseInfo = {
          diagnosis: "Noticeable vegetation decline: lower leaves yellowing (chlorosis), wilting past midday, and stunted growth needing urgent field intervention.",
          routines: {
            desc: "Active crop stress requires immediate soil, water, and canopy intervention:",
            bullets: [
              "Deep Soak Irrigation: Irrigate slowly to allow water to penetrate 15–20 cm deep into root zones without eroding dry topsoil.",
              "Soil Aeration & Crust Breaking: Lightly hoe crusted topsoil between rows to allow air and water to reach suffocating roots.",
              "Daily Pest Inspection: Stressed plants emit distress volatiles that attract aphids, armyworms, and stem borers—check undersides of leaves daily.",
              "Temporary Shade Protection: For vegetables and nurseries, erect temporary 30–50% shade netting to lower leaf temperatures."
            ]
          },
          inputs: {
            desc: "Fast-acting restorative nutrients to bypass damaged or dormant root uptake (FAO Guidelines):",
            bullets: [
              "Chelated Zinc & Magnesium Foliar Spray: Applied at dawn to directly restart impaired chlorophyll synthesis.",
              "Humic / Fulvic Acid Soil Drench: Dilute 1:1000 in irrigation water to stimulate root hair re-growth and unlock soil phosphorus.",
              "Bio-protective Inoculant (Trichoderma): Protects vulnerable, stressed roots against soil-borne damping-off and rot pathogens."
            ]
          },
          avoid: {
            desc: "Critical actions to avoid during moderate stress:",
            bullets: [
              "DO NOT apply chemical pesticides or systemic herbicides (weakened crops cannot metabolize toxins and will die).",
              "DO NOT sow new seedlings or transplant until soil moisture stabilizes.",
              "Avoid alternating between parched dry soil and sudden heavy flooding (causes root shock and fruit splitting)."
            ]
          },
          educational: "Significant drop in leaf chlorophyll and canopy moisture detected (NDVI 0.30–0.45, negative LSWI anomaly).",
          faoRef: "FAO Good Agricultural Practices (GAP) — Section 6: Integrated Plant Nutrition & Stress Recovery",
          chart: trendData
        };
      } else if (isSevere) {
        baseInfo = {
          diagnosis: "Critical crop distress: severe wilting, leaf tip scorch, and risk of permanent yield loss within 48-72 hours if unaddressed.",
          routines: {
            desc: "Emergency salvation protocols to prevent total harvest loss:",
            bullets: [
              "Low-Volume Basin/Drip Watering: Deliver gentle, targeted watering directly to root crowns; water slowly so it does not run off hardened soil.",
              "Emergency Pruning of Dead Foliage: Cut off dead and severely scorched lower leaves to reduce transpirational water burden on surviving plant tissue.",
              "Micro-Basin Contour Trenching: Shape small soil rings/trenches around plants to capture every drop of water.",
              "Notify Agricultural Officer (OPA Cavite): Report crop stress to the Municipal / Provincial Agricultural Office for drought support and irrigation assistance."
            ]
          },
          inputs: {
            desc: "Emergency protective treatments to keep core plant tissue alive (FAO Guidelines):",
            bullets: [
              "Kaolin Clay / Natural Anti-transpirant Spray: Shields foliage from intense solar radiation and lowers leaf surface temperature by 3–5°C.",
              "Liquid Seaweed Extract + Amino Acids: Drench root base with mild biological extract to support cellular osmoprotection.",
              "Thick Mulch Blanket (10 cm): Completely cover bed surfaces with rice straw, dry leaves, or husks to trap subterranean moisture."
            ]
          },
          avoid: {
            desc: "Catastrophic errors to strictly avoid:",
            bullets: [
              "STRICTLY FORBIDDEN: Chemical fertilizers (Urea, Muriate of Potash, 14-14-14)—fertilizer salts in bone-dry soil will immediately dehydrate and kill remaining roots via reverse osmosis.",
              "DO NOT flood dry, baked clay soils rapidly (causes root drowning and collar rot).",
              "Avoid running heavy machinery or foot traffic across root zones (compacts depleted soil pores permanently)."
            ]
          },
          educational: "Critical moisture deficit and cellular breakdown detected across satellite bands (NDVI < 0.30).",
          faoRef: "FAO Good Agricultural Practices (GAP) — Section 7: Disaster Risk Management & Emergency Crop Salvation",
          chart: trendData
        };
      } else {
        baseInfo = {
          diagnosis: "Select an agricultural municipality to inspect crop health.",
          routines: { desc: "Select a region to see field action routines.", bullets: [] },
          inputs: { desc: "Select a region to see recommended inputs.", bullets: [] },
          avoid: { desc: "Select a region to see critical avoidance list.", bullets: [] },
          educational: "Select a region to view satellite indices.",
          faoRef: "FAO Good Agricultural Practices (GAP)",
          chart: []
        };
      }
    } else {
      // Filipino / Tagalog Translations
      if (isOptimal) {
        baseInfo = {
          diagnosis: "Luntiang mga dahon at masiglang paglaki. Ang pagsipsip ng tubig at sustansya ng pananim ay nasa pinakamagandang antas.",
          routines: {
            desc: "Maayos at malusog ang pananim. Panatilihin ang karaniwang pangangalaga at lingguhang pagmamasid sa bukid:",
            bullets: [
              "Patubig sa Umaga (5:00 - 8:00 AM): Panatilihin ang 3–5 araw na iskedyul ng patubig upang mabawasan ang pagsingaw sa init ng araw.",
              "Linisin ang Kanal ng Tubig: Panatilihing malinis ang mga daluyan upang hindi magtubig-baha at mababad ang mga ugat.",
              "Lingguhang Pag-ikot sa Paligid ng Bukid: Tingnan ang gilid ng palayan/taniman upang maagapan ang damo at peste.",
              "Pagpapanatili ng Multsa: Maglagay ng 3–5 cm na dayami o tuyong damo sa ibabaw ng lupa upang hindi matuyo sa init."
            ]
          },
          inputs: {
            desc: "Karaniwang abono at nutrisyon ayon sa yugto ng tanim (Alinsunod sa FAO Good Agricultural Practices):",
            bullets: [
              "Balanseng Kumpletong Abono (14-14-14 N-P-K) o nabulok na dumi ng hayop (organic compost).",
              "Kapaki-pakinabang na Microorganisms (EM-1 o Trichoderma) upang mapabilis ang pagkuha ng sustansya.",
              "Maintenance Foliar Spray (Zinc + Magnesium) tuwing 14 araw upang mapanatili ang berdeng kloropil."
            ]
          },
          avoid: {
            desc: "Mga dapat iwasan sa malusog na tanim:",
            bullets: [
              "Labis na synthetic Nitrogen (nagpapadapa sa uhay ng palay at umaakit ng peste).",
              "Pagkababad ng tubig nang lampas sa 24 oras sa mga tudling (nagdudulot ng pagkabulok ng ugat)."
            ]
          },
          educational: "Mataas na kahusayan sa photosynthesis ang naitala sa satellite (NDVI > 0.60).",
          faoRef: "FAO Good Agricultural Practices (GAP) — Seksiyon 4: Pangangalaga sa Lupa at Nutrisyon",
          chart: trendData
        };
      } else if (isMild) {
        baseInfo = {
          diagnosis: "Maagang pagkapagod ng pananim: bahagyang nangungulubot o maputla ang mga dahon kapag matindi ang sikat ng araw, ngunit buo at kayang-kayang bawiin ang sigla ng mga ugat.",
          routines: {
            desc: "May maagang senyales ng pagkaubos ng tubig at init. Sundin ang mga hakbang na ito upang hindi tuluyang bumaba ang ani:",
            bullets: [
              "Ibahin ang Oras ng Patubig: Magpatubig lamang sa madaling-araw (5:00 - 8:00 AM) o bandang hapon upang makatipid ng 40% sa tubig.",
              "Pagsubok sa Basa ng Lupa: Humukay ng 10 cm; kapag nadurog agad ang lupa sa kamay, tuyo na ang root zone at kailangang diligan.",
              "Maglagay ng Dayami sa Puno (Mulching): Takpan ng 5–7 cm na dayami, ipa, o tuyong dahon ng saging ang paligid ng puno upang kulungin ang lamig.",
              "Hawanin ang Damo sa Loob ng 30 cm: Agad bunutin ang mga damo sa paligid ng puno dahil inaagaw nito ang tubig at sustansya."
            ]
          },
          inputs: {
            desc: "Mga input para sa pagbawi ng tubig at resistensya ng halaman (Pamantayang FAO/PhilRice):",
            bullets: [
              "Dagdag na Potassium (Muriate of Potash / 0-0-60 o malinis na abo ng kahoy): Tumutulong sa dahon na magbawas ng pagsingaw ng tubig.",
              "Banayad na Foliar Bio-stimulant: Mag-spray ng diluted seaweed extract o fish amino acid (FAA) tuwing madaling-araw.",
              "Organikong Vermicompost: Maglagay ng 1–2 dakot bawat puno upang mapahusay ang pagpigil ng tubig sa lupa."
            ]
          },
          avoid: {
            desc: "Mga mapanganib na pagkakamali sa may stress na tanim:",
            bullets: [
              "HUWAG maglagay ng concentrated Urea (46-0-0) sa tigang na lupa (sinusunog nito ang uhaw na mga ugat).",
              "HUWAG mag-spray ng abono o pestisidyo sa kasagsagan ng tirik na araw (10:00 AM – 3:00 PM) dahil napapaso ang dahon.",
              "Iwasan ang malalim na pag-araro malapit sa puno na nakakaputol sa maliliit na ugat."
            ]
          },
          educational: "Maagang kakulangan sa tubig at init ang naobserbahan sa satellite (NDVI 0.45–0.58).",
          faoRef: "FAO Good Agricultural Practices (GAP) — Seksiyon 5: Pangangasiwa sa Tubig at Stress sa Init",
          chart: trendData
        };
      } else if (isModerate) {
        baseInfo = {
          diagnosis: "Kapansin-pansing pagbagsak ng sigla: naninilaw ang mga ibabang dahon (chlorosis) at nalalanta kahit bandang tanghali pa lamang. Kailangan ng mabilisang aksyon.",
          routines: {
            desc: "Aktibong stress sa halaman; kailangan ng agarang interbensyon sa lupa, tubig, at dahon:",
            bullets: [
              "Mabagal at Malalim na Pagpapatubig: Dahan-dahang patubigan ang lupa upang makapasok ang tubig hanggang 15–20 cm sa ugat.",
              "Paghukay at Pagpapahinga ng Lupa: Bahagyang bungkalin ang nanigas na ibabaw ng lupa upang makahinga ang mga ugat.",
              "Araw-araw na Pagsusuri sa Peste: Tignan ang ilalim ng dahon araw-araw para sa aphids, armyworms, at uod na umaatake sa mahihinang halaman.",
              "Pansamantalang Lilim: Para sa gulay at seedling, maglagay ng 30–50% shade netting upang maibsan ang init ng tanghali."
            ]
          },
          inputs: {
            desc: "Mabisang nutrisyon upang maipagpatuloy ang paglaki kahit mahina ang ugat (Gabay ng FAO):",
            bullets: [
              "Chelated Zinc at Magnesium Foliar Spray: I-spray sa madaling-araw upang direktang maibalik ang berdeng kulay ng dahon.",
              "Humic / Fulvic Acid sa Tubig: Ihalo (1:1000) sa pandilig upang pasiglahin ang bagong ugat at buksan ang sustansya sa lupa.",
              "Bio-fungicide (Trichoderma): Proteksyon sa mahihinang ugat laban sa fungi at pagkabulok."
            ]
          },
          avoid: {
            desc: "Mga mahigpit na ipinagbabawal sa katamtamang stress:",
            bullets: [
              "HUWAG mag-spray ng kemikal na pamatay-damo o mabagsik na pestisidyo (hindi kakayanin ng mahinang halaman at ikamamatay nito).",
              "HUWAG maglipat o magtanim ng bagong punla hangga't hindi bumabalik ang tamang moisture ng lupa.",
              "Iwasan ang salit-salit na tuyong-tuyo at biglang binabahang lupa (nagdudulot ng root shock at pagputok ng bunga)."
            ]
          },
          educational: "Bagsak na kloropil at pagkaubos ng tubig sa dahon ang naitala sa satellite (NDVI 0.30–0.45).",
          faoRef: "FAO Good Agricultural Practices (GAP) — Seksiyon 6: Nutrisyon at Pagbawi ng Pananim",
          chart: trendData
        };
      } else if (isSevere) {
        baseInfo = {
          diagnosis: "Kritikal na pinsala sa pananim: matinding pagkalanta, sunog na dulo ng dahon, at panganib ng kabuuang pagkalugi sa loob ng 48–72 oras.",
          routines: {
            desc: "Protokol sa emergency na pagsagip sa taniman upang maiwasan ang tuluyang pagkasira ng ani:",
            bullets: [
              "Dahan-dahang Pagdilig sa Puno: Magbuhos ng kaunting tubig nang diretso sa ugat; huwag hayaang umagos lang sa tigang na lupa.",
              "Pagtabas ng mga Patay na Dahon: Putulin ang mga sunog at tuyong dahon upang hindi maubos ang natitirang tubig ng halaman.",
              "Gumawa ng Maliliit na Kanal sa Paligid: Gumawa ng munting hukay sa paligid ng puno upang masalo ang bawat patak ng tubig.",
              "Makipag-ugnayan sa Tanggapan ng Agrikultura (OPA Cavite): Ipaalam sa Municipal o Provincial Agriculturist para sa tulong sa patubig at binhi."
            ]
          },
          inputs: {
            desc: "Pang-emergency na proteksyon upang manatiling buhay ang ubod ng halaman (Gabay ng FAO):",
            bullets: [
              "Kaolin Clay / Natural Anti-transpirant Spray: Pinipigilan ang labis na init sa dahon at binabawasan ang temperatura nito ng 3–5°C.",
              "Liquid Seaweed Extract at Amino Acids: Idilig sa puno upang tulungan ang mga selyula ng halaman laban sa matinding stress.",
              "Makapal na Sapin ng Dayami (10 cm): Takpan ang buong taniman ng dayami o ipa upang maiwasan ang tuluyang pagkatuyo ng lupa."
            ]
          },
          avoid: {
            desc: "Kritikal na ipinagbabawal sa malalang stress:",
            bullets: [
              "MAHIGPIT NA IPINAGBABAWAL: Mga kemikal na abono (Urea, Muriate of Potash, 14-14-14)—ang asin nito sa tuyong lupa ay agad papatay sa nalalabing ugat.",
              "HUWAG biglaang bahain ang tuyong nanigas na lupa (nagiging sanhi ng pagkalunod ng ugat at collar rot).",
              "Iwasan ang pagdaan ng mabibigat na makinarya o yabag sa paligid ng ugat."
            ]
          },
          educational: "Kritikal na kawalan ng tubig at pagkasira ng selyula ang naitala sa satellite (NDVI < 0.30).",
          faoRef: "FAO Good Agricultural Practices (GAP) — Seksiyon 7: Emergency Management sa Sakuna sa Pananim",
          chart: trendData
        };
      } else {
        baseInfo = {
          diagnosis: "Pumili ng bayan o lungsod upang makita ang kalagayan ng pananim.",
          routines: { desc: "Pumili ng rehiyon para sa mga hakbang sa bukid.", bullets: [] },
          inputs: { desc: "Pumili ng rehiyon para sa mga inirerekumendang input.", bullets: [] },
          avoid: { desc: "Pumili ng rehiyon para sa mga dapat iwasan.", bullets: [] },
          educational: "Pumili ng rehiyon para sa impormasyon.",
          faoRef: "FAO Good Agricultural Practices (GAP)",
          chart: []
        };
      }
    }

    if (forecastObj) {
      if (forecastObj.diagnosis && lang === 'EN') {
        baseInfo.diagnosis = forecastObj.diagnosis;
      }
      if (forecastObj.meaning && lang === 'EN') {
        baseInfo.routines.desc = forecastObj.meaning;
      }
      if (Array.isArray(forecastObj.fao_routines) && forecastObj.fao_routines.length > 0 && lang === 'EN') {
        baseInfo.routines.bullets = forecastObj.fao_routines;
      }
      if (Array.isArray(forecastObj.fao_inputs) && forecastObj.fao_inputs.length > 0 && lang === 'EN') {
        baseInfo.inputs.bullets = forecastObj.fao_inputs;
      }
      if (Array.isArray(forecastObj.fao_avoid) && forecastObj.fao_avoid.length > 0 && lang === 'EN') {
        baseInfo.avoid.bullets = forecastObj.fao_avoid;
      }
      if (forecastObj.fao_reference) {
        baseInfo.faoRef = forecastObj.fao_reference;
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

        {/* Dynamic World Land Cover & Crop Vigor Overlay Legend */}
        {activeLayer === 'DynamicWorld' && (
          <div className="gm-landcover-legend-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={14} color="var(--gm-primary-blue)" />
                <strong style={{ fontSize: '12.5px', color: 'var(--gm-text-primary)' }}>
                  {lang === 'EN' ? 'Land Cover & Crop Vigor (10m Resolution)' : 'Takip ng Lupa at Sigla ng Tanim (10m)'}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => setShowLandCoverExplainer(!showLandCoverExplainer)}
                className="gm-legend-help-btn"
                title={lang === 'EN' ? "How to read this overlay" : "Paano basahin ang mapa"}
              >
                <HelpCircle size={13} />
                <span>{showLandCoverExplainer ? (lang === 'EN' ? 'Hide Guide' : 'Itago') : (lang === 'EN' ? 'How to Read' : 'Gabay')}</span>
              </button>
            </div>

            {/* Solid Swatches for Crops and Built Area / Roads / Water */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--gm-text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span 
                    style={{ 
                      width: '14px', 
                      height: '10px', 
                      borderRadius: '2px', 
                      display: 'inline-block',
                      background: healthStatus.includes('Damaged') || healthStatus.includes('Stressed')
                        ? '#EF4444'
                        : healthStatus.includes('Moderate') || healthStatus.includes('Warning')
                          ? '#FACC15'
                          : '#00FF88',
                    }} 
                  />
                  <span><strong>{lang === 'EN' ? 'Vegetation / Cropland:' : 'Taniman / Pananim:'}</strong></span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--gm-text-tertiary)' }}>
                  {lang === 'EN' ? 'Active agricultural crops' : 'Aktibong pananim'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--gm-text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span 
                    style={{ 
                      width: '14px', 
                      height: '10px', 
                      background: '#111827', 
                      border: '1px solid rgba(255, 255, 255, 0.35)',
                      borderRadius: '2px', 
                      display: 'inline-block' 
                    }} 
                  />
                  <span><strong>{lang === 'EN' ? 'Built Area, Roads & Water:' : 'Kalsada, Bahay at Tubig:'}</strong></span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--gm-text-tertiary)' }}>
                  {lang === 'EN' ? 'Excluded non-crop surfaces' : 'Hindi sakop na taniman'}
                </span>
              </div>
            </div>

            {/* Collapsible Quick Guide for Curious Individuals */}
            {showLandCoverExplainer && (
              <div className="gm-legend-explainer-box">
                <p>
                  {lang === 'EN'
                    ? "🛰️ This high-resolution overlay isolates living crops from roads, buildings, and water bodies. Solid black areas represent roads, built infrastructure, and water. Solid colored pixels indicate verified active cropland colored by the forecast status."
                    : "🛰️ Ibinubukod ng mapa ang buhay na tanim sa mga kalsada, bahay, at katubigan. Ang solidong itim ay mga kalsada, istruktura, at tubig. Ang may kulay ay mga napatunayang aktibong taniman ayon sa resulta ng pagtataya."}
                </p>
              </div>
            )}
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

              {panelInfo.diagnosis && (
                <div style={{ 
                  fontSize: '12.5px', 
                  color: 'var(--gm-text-secondary)', 
                  lineHeight: '1.45', 
                  padding: '8px 10px', 
                  background: 'var(--gm-surface-hover)', 
                  borderRadius: '6px',
                  border: '1px solid var(--gm-border)'
                }}>
                  <strong style={{ color: 'var(--gm-text-primary)' }}>{t.field_signs}:</strong> {panelInfo.diagnosis}
                </div>
              )}

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
                  {typeof panelInfo.avoid === 'string' ? panelInfo.avoid : panelInfo.avoid.desc}
                </p>
                {typeof panelInfo.avoid === 'object' && Array.isArray(panelInfo.avoid.bullets) && panelInfo.avoid.bullets.length > 0 && (
                  <ul className="gm-bullet-list">
                    {panelInfo.avoid.bullets.map((b: string, i: number) => (
                      <li key={i} className="gm-bullet-item">
                        <span className="gm-bullet-dot" style={{ backgroundColor: '#d93025' }}></span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--gm-text-secondary)', opacity: 0.85, padding: '2px 0 6px 0' }}>
                🌾 {panelInfo.faoRef || t.fao_ref}
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
              {/* 1. Map & Color Legend */}
              <div className="gm-section-card">
                <div className="gm-section-title">
                  <Compass size={16} color="var(--gm-primary-blue)" />
                  <span>{lang === 'EN' ? 'Map & Color Legend' : 'Alamat ng Kulay sa Mapa'}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gm-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {lang === 'EN' ? 'Crop Health Scale (AI Forecast)' : 'Antas ng Kalusugan (AI Forecast)'}
                  </span>
                  <div className="gm-legend-item-row">
                    <span className="gm-legend-swatch" style={{ background: '#00FF88' }}></span>
                    <span><strong>{lang === 'EN' ? 'No Stress / Healthy:' : 'Walang Stress / Malusog:'}</strong> {lang === 'EN' ? 'Optimal photosynthesis & lush vigor' : 'Masiglang paglaki'}</span>
                  </div>
                  <div className="gm-legend-item-row">
                    <span className="gm-legend-swatch" style={{ background: '#FACC15' }}></span>
                    <span><strong>{lang === 'EN' ? 'Warning / Moderate Stress:' : 'Babala / Katamtamang Stress:'}</strong> {lang === 'EN' ? 'Early heat/water fatigue or nutrient chlorosis' : 'Maagang pagkapagod sa init, tubig o abono'}</span>
                  </div>
                  <div className="gm-legend-item-row">
                    <span className="gm-legend-swatch" style={{ background: '#EF4444' }}></span>
                    <span><strong>{lang === 'EN' ? 'Severe / Critical Stress:' : 'Malala / Kritikal na Pinsala:'}</strong> {lang === 'EN' ? 'Severe wilting, critical yield loss risk' : 'Matinding pagkalanta, panganib ng pagkasira'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', borderTop: '1px solid var(--gm-divider)', paddingTop: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gm-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {lang === 'EN' ? 'Map Boundaries & Surface' : 'Hangganan at Katangian'}
                  </span>
                  <div className="gm-legend-item-row">
                    <span className="gm-legend-swatch" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.25)' }}></span>
                    <span><strong>{lang === 'EN' ? 'Built Area, Roads & Water:' : 'Kalsada, Bahay at Tubig:'}</strong> {lang === 'EN' ? 'Excluded non-crop surfaces, infrastructure & water' : 'Mga kalsada, bahay at katubigan'}</span>
                  </div>
                  <div className="gm-legend-item-row">
                    <span className="gm-legend-swatch" style={{ background: theme === 'dark' ? '#1E293B' : '#64748B' }}></span>
                    <span><strong>{lang === 'EN' ? 'Selected Municipality:' : 'Napiling Bayan:'}</strong> {lang === 'EN' ? 'Darker highlight on click' : 'Mas madilim na kulay kapag pinili'}</span>
                  </div>
                </div>
              </div>

              {/* 2. Satellite Spectral Indices & AI Diagnostics */}
              <div className="gm-section-card">
                <div className="gm-section-title">
                  <Info size={16} color="var(--gm-primary-blue)" />
                  <span>{t.spectral_title}</span>
                </div>

                {/* Primary AI Health Metric: NDVI */}
                {forecast && (
                  <div style={{ padding: '10px 12px', background: 'var(--gm-surface-hover)', borderRadius: 'var(--gm-radius-sm)', marginBottom: '10px', border: '1px solid var(--gm-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--gm-text-primary)' }}>
                        🌿 {lang === 'EN' ? 'Primary AI Forecast (NDVI):' : 'Pangunahing Hula ng AI (NDVI):'}
                      </span>
                      <strong style={{ fontSize: '14px', color: 'var(--gm-primary-blue)' }}>
                        {forecast.current_ndvi.toFixed(2)} → {forecast.forecast_30_days.toFixed(2)} (30d)
                      </strong>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--gm-text-tertiary)', margin: 0, lineHeight: 1.35 }}>
                      {lang === 'EN'
                        ? 'NDVI is the primary crop vigor index tracked and projected into the future by the AI. The supporting diagnostic indices below explain WHY vigor is changing (water deficit vs. nutrient shortage vs. canopy density).'
                        : 'Sinusukat ng NDVI ang kabuuang sigla ng tanim at ang pangunahing tinataya ng AI. Ang mga karagdagang sensor sa ibaba ang nagsusuri sa DAHILAN ng pagbabago (tubig, pataba, o kapal ng dahon).'}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--gm-text-tertiary)', fontStyle: 'italic' }}>
                    {t.tap_to_explore}
                  </span>
                </div>

                <div className="gm-spectral-grid">
                  {[
                    { key: 'NDVI', val: forecast?.current_ndvi, desc: lang === 'EN' ? 'Vegetation vigor' : 'Sigla ng tanim' },
                    { key: 'NDWI', val: forecast?.ndwi, desc: lang === 'EN' ? 'Canopy water check' : 'Suri sa tubig ng dahon' },
                    { key: 'LSWI', val: forecast?.lswi, desc: lang === 'EN' ? 'Leaf cell hydration' : 'Tubig sa selyula' },
                    { key: 'NDRE', val: forecast?.ndre, desc: lang === 'EN' ? 'Nitrogen & early stress' : 'Babala sa pataba' },
                    { key: 'EVI', val: forecast?.evi, desc: lang === 'EN' ? 'Dense canopy index' : 'Kapal ng dahon' },
                  ].map(item => {
                    const info = SPECTRAL_INFO[item.key];
                    const interp = info.interpret(item.val, lang);
                    const isSelected = selectedSpectralMetric === item.key;
                    return (
                      <div 
                        key={item.key} 
                        className={`gm-spectral-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => setSelectedSpectralMetric(item.key)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="gm-spectral-chip-header">
                          <span className="gm-spectral-name">{item.key}</span>
                          <span className="gm-spectral-dot" style={{ backgroundColor: interp.statusClass }} />
                        </div>
                        <div className="gm-spectral-val">{item.val !== undefined ? item.val.toFixed(2) : '--'}</div>
                        <div className="gm-spectral-status" style={{ color: interp.statusClass }} title={interp.label}>
                          {interp.label}
                        </div>
                        <span className="gm-spectral-desc">{item.desc}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Curious Learner Explainer Card for Selected Metric */}
                {selectedSpectralMetric && SPECTRAL_INFO[selectedSpectralMetric] && (() => {
                  const info = SPECTRAL_INFO[selectedSpectralMetric];
                  const currentVal = selectedSpectralMetric === 'NDVI' ? forecast?.current_ndvi
                    : selectedSpectralMetric === 'EVI' ? forecast?.evi
                    : selectedSpectralMetric === 'NDWI' ? forecast?.ndwi
                    : selectedSpectralMetric === 'LSWI' ? forecast?.lswi
                    : forecast?.ndre;
                  const interp = info.interpret(currentVal, lang);

                  return (
                    <div className="gm-spectral-explainer-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <strong style={{ fontSize: '13px', color: 'var(--gm-text-primary)' }}>
                            {selectedSpectralMetric} — {info.fullName}
                          </strong>
                          <div style={{ fontSize: '11px', color: 'var(--gm-text-secondary)', marginTop: '1px' }}>
                            {info.category[lang]}
                          </div>
                        </div>
                        <span 
                          className="gm-explainer-badge"
                          style={{ 
                            color: interp.statusClass, 
                            backgroundColor: `${interp.statusClass}15`,
                            border: `1px solid ${interp.statusClass}35`
                          }}
                        >
                          {interp.label} ({currentVal !== undefined ? currentVal.toFixed(2) : '--'})
                        </span>
                      </div>

                      <p style={{ fontSize: '12px', color: 'var(--gm-text-secondary)', margin: 0, lineHeight: 1.45 }}>
                        {info.whatItIs[lang]}
                      </p>

                      <div className="gm-explainer-analogy">
                        <strong>💡 {t.analogy_title}:</strong> "{info.analogy[lang]}"
                      </div>

                      <div style={{ fontSize: '11.5px', color: 'var(--gm-text-secondary)', lineHeight: 1.4 }}>
                        <strong>{t.what_score_means}:</strong> {interp.text}
                      </div>

                      <div className="gm-explainer-range">
                        <strong>{t.sensor_ranges}:</strong> {info.ranges[lang]}
                      </div>
                    </div>
                  );
                })()}

                {forecast && (
                  <div style={{ marginTop: '14px', fontSize: '12px', borderTop: '1px solid var(--gm-divider)', paddingTop: '10px', color: 'var(--gm-text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--gm-text-primary)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Activity size={14} color="var(--gm-primary-blue)" />
                      <span>{lang === 'EN' ? 'Field Verification & Weather Sensors:' : 'Pagsusuri sa Bukid at Panahon:'}</span>
                    </div>

                    {forecast.rainfall_mm != null && (
                      <div style={{ padding: '6px 10px', background: 'var(--gm-surface-hover)', borderRadius: '6px', border: '1px solid var(--gm-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>🌧️ <strong>CHIRPS Satellite Rainfall (30d):</strong></span>
                          <strong style={{ color: 'var(--gm-primary-blue)' }}>{forecast.rainfall_mm.toFixed(1)} mm</strong>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--gm-text-tertiary)', margin: '2px 0 0 0' }}>
                          {lang === 'EN' ? 'Total accumulated precipitation over this municipality from weather satellites.' : 'Kabuuang ulan na naipon sa bayang ito mula sa mga satellite ng panahon.'}
                        </p>
                      </div>
                    )}

                    {forecast.landcover && (
                      <div style={{ padding: '6px 10px', background: 'var(--gm-surface-hover)', borderRadius: '6px', border: '1px solid var(--gm-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>🛰️ <strong>Land Cover Verification:</strong></span>
                          <strong style={{ color: '#15803d' }}>{forecast.landcover.label}</strong>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--gm-text-tertiary)', margin: '2px 0 0 0' }}>
                          {lang === 'EN'
                            ? 'Verified active agricultural cropland (automatically filters out urban roads and built structures).'
                            : 'Kinumpirma ang aktibong taniman (sinasala ang mga kalsada at bahay).'}
                        </p>
                      </div>
                    )}

                    {forecast.opa_alert_probability != null && (
                      <div style={{ padding: '6px 10px', background: 'var(--gm-surface-hover)', borderRadius: '6px', border: '1px solid var(--gm-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>🏛️ <strong>Provincial Agriculturist Alert (OPA):</strong></span>
                          <strong style={{ color: forecast.opa_alert_probability > 0.4 ? '#dc2626' : '#15803d' }}>
                            {(forecast.opa_alert_probability * 100).toFixed(0)}% Risk
                          </strong>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--gm-text-tertiary)', margin: '2px 0 0 0' }}>
                          {lang === 'EN'
                            ? 'Calibrated with historical damage logs from the Cavite Office of the Provincial Agriculturist.'
                            : 'Ibinase sa mga nakaraang talaan ng pinsala ng Tanggapan ng Panlalawigang Agrikultor ng Cavite.'}
                        </p>
                      </div>
                    )}
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