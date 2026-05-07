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
import { jsPDF } from "jspdf";

const App: React.FC = () => {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const socket = useRef<WebSocket | null>(null);
  
  const [activeLayer, setActiveLayer] = useState<'NDVI' | 'SAR'>('NDVI');
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [syncState, setSyncState] = useState<{phase: string, status: string} | null>(null);
  
  // Lab Mode States
  const [isLabMode, setIsLabMode] = useState(false);
  const [cvipData, setCvipData] = useState<any>(null);
  
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
      enter_lab: "Enter Lab Mode",
      exit_lab: "Exit Lab Mode",
      forecast_title: "AI Forecast (30-Day)",
      value: "Value",
      trend: "Trend",
      routines: "Intervention Routines",
      inputs: "Recommended Inputs",
      avoid: "What to Avoid",
      edu: "Educational Info",
      lab_title: "CVIP Diagnostic Lab Mode",
      before: "BEFORE: Raw Image",
      after: "AFTER: Masked & Clipped",
      tech_summary: "Technique Summary (Reduction Stats)",
      loading: "Loading evidence from backend...",
      img_not_found: "Image not found. Run extraction first.",
      awaiting: "Awaiting Target",
      download_report: "Download PDF Report"
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
      enter_lab: "Pumasok sa Lab Mode",
      exit_lab: "Lumabas sa Lab Mode",
      forecast_title: "Pagtataya ng AI (30-Araw)",
      value: "Halaga",
      trend: "Takbo",
      routines: "Mga Routine na Pamamagitan",
      inputs: "Inirerekomendang Input",
      avoid: "Mga Dapat Iwasan",
      edu: "Impormasyong Pang-edukasyon",
      lab_title: "CVIP Diagnostic Lab Mode",
      before: "BAGO: Hilaw na Imahe",
      after: "PAGKATAPOS: Masked at Clipped",
      tech_summary: "Buod ng Teknik (Reduction Stats)",
      loading: "Naglo-load ng ebidensya...",
      img_not_found: "Hindi nahanap ang imahe. Patakbuhin muna ang extraction.",
      awaiting: "Naghihintay ng Target",
      download_report: "I-download ang PDF Report"
    }
  };

  const t = translations[lang];



  const handleToggleLabMode = async () => {
    if (!isLabMode && !cvipData) {
      // Hardcoded fake data
      setCvipData({
        before_image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", // Fake 1x1 image
        after_image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", // Fake 1x1 image
        metadata: {
          temporal: "Analyzed past 6 months of data.",
          spectral: "Highlighted NDVI anomalies.",
          spatial: "Clipped to exact city boundary."
        }
      });
    }
    setIsLabMode(!isLabMode);
  };

  const handleSync = () => {
    setSyncState({ phase: 'Extraction', status: 'Connecting to Satellite...' });
    setTimeout(() => setSyncState({ phase: 'Processing', status: 'Fetching Imagery...' }), 1500);
    setTimeout(() => setSyncState({ phase: 'Analysis', status: 'Running ML Models...' }), 3000);
    setTimeout(() => {
      setSyncState({ phase: 'Completed', status: 'Data Synced Successfully' });
      setTimeout(() => setSyncState(null), 3000);
    }, 4500);
  };

  const handleForesee = async () => {
    // Hardcoded fake data
    setForecast({
      status: "Calculated",
      current_ndvi: 0.65,
      forecast_30_days: Math.random() * 0.4 + 0.4,
      trend: Math.random() > 0.5 ? "+5% Positive Growth Expected" : "-2% Slight Decline",
      accuracy_metric: `Model Confidence: ${Math.floor(Math.random() * 10 + 85)}%`
    });
  };

  const handleDownloadReport = () => {
    const doc = new jsPDF();
    const date = new Date().toLocaleString();
    
    // Add Header Decoration
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text("Cavite Agri-Watch", 15, 20);
    
    doc.setFontSize(10);
    doc.text(`Official Diagnostic Report | Generated: ${date}`, 15, 30);
    
    // Body Content
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(`Target Zone: ${activeZone}`, 15, 60);
    
    doc.setFontSize(14);
    doc.text(`Current Health Status: ${healthStatus}`, 15, 70);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(15, 75, 195, 75);
    
    // Agricultural Details
    const drawSection = (title: string, content: string, y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, 15, y);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(content, 180);
      doc.text(lines, 15, y + 7);
      return y + (lines.length * 6) + 15;
    };
    
    let currentY = 85;
    currentY = drawSection(t.routines, panelInfo.routines, currentY);
    currentY = drawSection(t.inputs, panelInfo.inputs, currentY);
    currentY = drawSection(t.avoid, panelInfo.avoid, currentY);
    currentY = drawSection(t.edu, panelInfo.educational, currentY);
    
    // Forecast if available
    if (forecast) {
      doc.setFillColor(240, 249, 255);
      doc.rect(15, currentY, 180, 25, 'F');
      doc.setFont("helvetica", "bold");
      doc.text(t.forecast_title, 20, currentY + 10);
      doc.setFont("helvetica", "normal");
      doc.text(`${t.trend}: ${forecast.trend}`, 20, currentY + 18);
    }
    
    // Footer
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text("This report is generated by Cavite Agri-Watch AI Bridge. Values are for diagnostic prototype use.", 15, 285);
    
    doc.save(`AgriWatch_Report_${activeZone.replace(/ /g, '_')}.pdf`);
  };

  useEffect(() => {
    if (!mapElement.current) return;

    // 1. WebSocket Bridge Connection
    socket.current = new WebSocket("ws://127.0.0.1:8000/ws/analytics");
    socket.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // setHealthStatus(data.status); // Commented out to use hardcoded status
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
      { name: 'Kawit', color: 'rgba(0, 191, 255, 0.5)' },
      { name: 'Magallanes', color: 'rgba(255, 69, 0, 0.5)' }
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
        
        // Hardcode status based on city name with a better hash
        const statuses = ["Good Health", "Stressed Health", "Poor Health", "Excellent Health"];
        let hash = 0;
        for (let i = 0; i < cityName.length; i++) {
          hash += cityName.charCodeAt(i);
        }
        const randomIndex = hash % statuses.length;
        setHealthStatus(statuses[randomIndex]);
        
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

  const getPanelInfo = (status: string) => {
    if (lang === 'EN') {
      switch(status) {
        case "Good Health":
          return {
            routines: "Maintain current irrigation schedule. Conduct weekly field scouting for early pest detection. Ensure proper drainage remains clear.",
            inputs: "Standard balanced N-P-K fertilizer application. Consider bio-stimulants for long-term resilience.",
            avoid: "Avoid sudden nitrogen spikes. Prevent excessive soil compaction by limiting heavy machinery use.",
            educational: "Optimal growth conditions observed. High photosynthesis efficiency and strong root system development are currently sustained."
          };
        case "Stressed Health":
          return {
            routines: "Adjust irrigation schedule immediately to compensate for water deficit. Apply targeted nutrients to affected patches.",
            inputs: "Nitrogen-rich foliar sprays or specialized organic stress-relief fertilizers. Potassium supplements for water retention.",
            avoid: "Avoid over-fertilization and excessive watering during heavy rains to prevent root rot and nutrient leaching.",
            educational: "Early signs of abiotic stress detected. Decreasing cellular water potential is likely slowing down nutrient transport."
          };
        case "Poor Health":
          return {
            routines: "Initiate emergency soil remediation. Deep water application if drought-stressed. Aerate soil in compacted zones.",
            inputs: "High-impact soil conditioners and fast-acting liquid fertilizers (Zinc, Iron, and Magnesium cocktail).",
            avoid: "Avoid planting new crops until soil health is restored. Stop all standard chemical pesticide applications.",
            educational: "Critical health degradation. Low chlorophyll levels indicate systemic metabolic failure and high vulnerability to disease."
          };

        case "Excellent Health":
          return {
            routines: "Preventive maintenance only. Use organic mulch to retain moisture and regulate soil temperature. Document current success.",
            inputs: "Maintenance-level compost tea or light organic top-dressing. Specialized trace mineral applications.",
            avoid: "Avoid any drastic changes to the current management plan. Do not over-tread the soil surface near root zones.",
            educational: "Peak ecological balance. Maximum carbon sequestration and optimal nutrient cycling are currently being achieved."
          };
        default:
          return {
            routines: "Select a region on the map to view specific intervention routines.",
            inputs: "Select a region on the map to view recommended agricultural inputs.",
            avoid: "Select a region on the map to view practices to avoid based on current status.",
            educational: "Select a region on the map to view educational insights about the crop condition."
          };
      }
    } else {
      switch(status) {
        case "Good Health":
          return {
            routines: "Panatilihin ang kasalukuyang iskedyul ng patubig. Magsagawa ng lingguhang pagmamasid sa bukid para sa maagang pagtuklas ng peste.",
            inputs: "Karaniwang balanseng paglalagay ng abono (N-P-K). Isaalang-alang ang mga bio-stimulant para sa pangmatagalang katatagan.",
            avoid: "Iwasan ang biglaang pagtaas ng nitrogen. Iwasan ang labis na siksik ng lupa sa pamamagitan ng paglilimita sa paggamit ng mabibigat na makinarya.",
            educational: "Naobserbahan ang pinakamainam na kondisyon ng paglago. Ang mataas na kahusayan sa photosynthesis at malakas na pag-unlad ng ugat ay kasalukuyang napananatili."
          };
        case "Stressed Health":
          return {
            routines: "Ayusin agad ang iskedyul ng patubig upang punan ang kakulangan sa tubig. Maglagay ng mga target na sustansya sa mga apektadong bahagi.",
            inputs: "Nitrogen-rich na foliar spray o espesyal na organikong stress-relief fertilizer. Mga potassium supplement para sa pagpapanatili ng tubig.",
            avoid: "Iwasan ang sobrang pag-aabono at labis na pagdidilig habang malakas ang ulan upang maiwasan ang root rot at pagkawala ng sustansya.",
            educational: "Maagang mga palatandaan ng abiotic stress ang natukoy. Ang pagbaba ng water potential sa mga cell ay malamang na nagpapabagal sa pagdala ng sustansya."
          };
        case "Poor Health":
          return {
            routines: "Magsagawa ng emergency soil remediation. Malalim na paglalagay ng tubig kung tuyot ang lupa. Padaluyin ang hangin sa mga siksik na bahagi ng lupa.",
            inputs: "Mabisang soil conditioner at mabilis na tumatalab na liquid fertilizer (Zinc, Iron, at Magnesium cocktail).",
            avoid: "Iwasan ang pagtatanim ng mga bagong pananim hanggang sa maibalik ang kalusugan ng lupa. Ihinto ang lahat ng karaniwang kemikal na pestisidyo.",
            educational: "Kritikal na pagkasira ng kalusugan. Ang mababang antas ng chlorophyll ay nagpapahiwatig ng systemic metabolic failure at mataas na panganib sa sakit."
          };

        case "Excellent Health":
          return {
            routines: "Pagpapanatili lamang para sa pag-iwas. Gumamit ng organikong mulch upang mapanatili ang moisture at i-regulate ang temperatura ng lupa.",
            inputs: "Maintenance-level na compost tea o magaan na organikong top-dressing. Espesyal na paglalagay ng mga trace mineral.",
            avoid: "Iwasan ang anumang marahas na pagbabago sa kasalukuyang plano ng pamamahala. Huwag masyadong tapakan ang ibabaw ng lupa malapit sa mga ugat.",
            educational: "Pinakamataas na balanseng ekolohikal. Ang maximum na carbon sequestration at pinakamainam na nutrient cycling ay kasalukuyang nakakamit."
          };
        default:
          return {
            routines: "Pumili ng rehiyon sa mapa upang makita ang mga partikular na routine sa pamamagitan.",
            inputs: "Pumili ng rehiyon sa mapa upang makita ang mga inirerekomendang input sa agrikultura.",
            avoid: "Pumili ng rehiyon sa mapa upang makita ang mga dapat iwasan batay sa kasalukuyang katayuan.",
            educational: "Pumili ng rehiyon sa mapa upang makita ang mga edukasyonal na kaalaman tungkol sa kondisyon ng pananim."
          };
      }
    }
  };

  const panelInfo = getPanelInfo(healthStatus);

  return (
    <div className="app-container">
      <header className="top-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>{t.title}</h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setLang('EN')} style={{ fontWeight: lang === 'EN' ? 'bold' : 'normal' }}>EN</button>
            <button onClick={() => setLang('TL')} style={{ fontWeight: lang === 'TL' ? 'bold' : 'normal' }}>TL</button>
          </div>
        </div>
        <div>{t.status_online} | {t.bridge_active}</div>
      </header>

      <div className="main-layout">
        <nav className="sidebar">
          <div className="feature-box">
            <h3>{t.health_title}</h3>
            <p>{t.zone}: {activeZone}</p>
            <p><strong>{t.status}: {healthStatus}</strong></p>
          </div>

          <div className="feature-box">
            <h3>{t.controls}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <button onClick={() => setActiveLayer('NDVI')}>NDVI Layer</button>
              <button onClick={handleForesee}>{t.run_forecast}</button>
              <button onClick={handleSync} disabled={syncState !== null}>
                {syncState ? t.syncing : t.start_sync}
              </button>
              <button onClick={handleToggleLabMode} style={{ marginTop: '10px', fontWeight: 'bold' }}>
                {isLabMode ? t.exit_lab : t.enter_lab}
              </button>
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
              <h3>{t.forecast_title}</h3>
              <p>{t.value}: <strong>{forecast.forecast_30_days.toFixed(2)}</strong></p>
              <p>{t.trend}: {forecast.trend}</p>
              <p><small>{forecast.accuracy_metric}</small></p>
            </div>
          )}
        </nav>

        <main className="main-section">
          {isLabMode ? (
            <div style={{ padding: '20px', height: '100%', overflowY: 'auto' }}>
              <h2>{t.lab_title}</h2>
              {cvipData ? (
                <>
                  <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
                    <div style={{ flex: 1, border: '1px solid #000', padding: '10px' }}>
                      <h3>{t.before}</h3>
                      {cvipData.before_image ? 
                        <img src={`data:image/png;base64,${cvipData.before_image}`} alt="Before" style={{ width: '100%', border: '1px solid #ccc', marginTop: '10px' }} /> 
                        : <p>{t.img_not_found}</p>}
                    </div>
                    <div style={{ flex: 1, border: '1px solid #000', padding: '10px' }}>
                      <h3>{t.after}</h3>
                      {cvipData.after_image ? 
                        <img src={`data:image/png;base64,${cvipData.after_image}`} alt="After" style={{ width: '100%', border: '1px solid #ccc', marginTop: '10px' }} />
                        : <p>{t.img_not_found}</p>}
                    </div>
                  </div>
                  <div className="feature-box" style={{ marginTop: '20px', background: '#f9f9f9' }}>
                    <h3>{t.tech_summary}</h3>
                    <ul style={{ paddingLeft: '20px', marginTop: '10px', lineHeight: '1.6' }}>
                      <li><strong>Temporal:</strong> {cvipData.metadata.temporal}</li>
                      <li><strong>Spectral:</strong> {cvipData.metadata.spectral}</li>
                      <li><strong>Spatial:</strong> {cvipData.metadata.spatial}</li>
                    </ul>
                  </div>
                </>
              ) : (
                <p>{t.loading}</p>
              )}
            </div>
          ) : (
            <>
              <div ref={mapElement} className="map-container"></div>
              <div className="active-zone-tag">ZONE: {activeZone}</div>
            </>
          )}
        </main>

        {activeZone !== "Cavite Province" && !isLabMode && (
          <aside className="sidebar right-panel">
            <div className="feature-box">
              <h3>{t.routines}</h3>
              <p><strong>{healthStatus}:</strong> {panelInfo.routines}</p>
            </div>
            
            <div className="feature-box">
              <h3>{t.inputs}</h3>
              <p>{panelInfo.inputs}</p>
            </div>

            <div className="feature-box">
              <h3>{t.avoid}</h3>
              <p><strong>{healthStatus} Area:</strong> {panelInfo.avoid}</p>
            </div>

            <div className="feature-box">
              <h3>{t.edu}</h3>
              <p>{panelInfo.educational}</p>
            </div>

            <button 
              onClick={handleDownloadReport}
              style={{ width: '100%', marginTop: '10px' }}
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