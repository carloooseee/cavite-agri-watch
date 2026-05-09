# Cavite Agri-Watch — 30-Day Early Warning Dashboard

Cavite Agri-Watch is a localized, real-time platform designed to monitor crop stress across Cavite, Philippines. It utilizes Google Earth Engine (GEE) satellite imagery (Sentinel-2) and Machine Learning (Random Forest) to provide a 30-day early warning of agricultural stress.

## 🚀 Easy Setup (Windows)

The project is designed for a simple "one-click" setup on Windows systems.

### Prerequisites
- **Node.js** (v18 or higher)
- **Python** (v3.10 or higher)

### Installation
1.  **Configure Environment**:
    Run the following command in your terminal to install all dependencies and set up the Python virtual environment:
    ```bash
    npm run setup
    ```

### Running the Application
1.  **Launch the Dashboard**:
    Run the following command to start both the frontend and backend:
    ```bash
    npm run dev
    ```
    *(Alternatively, you can use `npm start`)*.
    This launches the **FastAPI backend** (Port 8000) and the **Vite frontend** (Port 5173).

2.  **Access the Dashboard**:
    Open your browser and go to: `http://localhost:5173`

---

## 🛰️ Technical Overview (Paper Summary Alignment)

This prototype implements the core technical blueprint described in the **Cavite Agri-Watch Research Paper**:

- **Geospatial Pipeline**: Automated extraction using Google Earth Engine.
- **Spectral Indices**: Real-time calculation and visualization of **NDVI, EVI, NDWI, LSWI, and NDRE**.
- **AI Forecasting**: A 30-day predictive analytics system using a pattern-recognition model.
- **Classification Logic**: Four-tier risk categorization (**No Stress**, **Mild Stress**, **Moderate Stress**, **Severe Stress**).
- **Web-GIS Dashboard**: Interactive OpenLayers map with municipal drill-down and agricultural intervention routines.

---

## 📂 Project Structure

- `frontend/`: React + TypeScript + Vite dashboard.
- `backend/`: FastAPI + Google Earth Engine API + ML Model.
- `data/`: Contains GeoJSON boundaries for Cavite municipalities and historical NDVI data.
- `setup.bat`: Automated environment configuration.
- `dev.bat`: Single-command execution script.

---

## 👨‍💻 Author
**Carlos — Lead Developer**
*CVIP Laboratory — Cavite Agri-Watch Project*
