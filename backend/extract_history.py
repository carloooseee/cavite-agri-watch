import ee
import pandas as pd
from datetime import datetime

# 1. Initialize with your Service Account (Benchmark: System Security)
SERVICE_ACCOUNT = 'cavite-agri-watch-7717292883ca.json'
# Replace with your actual service account email from the JSON file
EE_USER = "carlo10lg3@gmail.com" 

try:
    credentials = ee.ServiceAccountCredentials(EE_USER, SERVICE_ACCOUNT)
    ee.Initialize(credentials)
    print("GEE Initialized Successfully for Extraction!")
except Exception as e:
    print(f"Auth Failed: {e}")
    exit()

def extract_cavite_history(years=3):
    print(f"Starting extraction for the last {years} years...")
    
    # Define Cavite using official boundaries (GIS Application Benchmark)
    countries = ee.FeatureCollection("FAO/GAUL/2015/level2")
    cavite = countries.filter(ee.Filter.eq('ADM2_NAME', 'Cavite'))
    
    # Define time range
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = f"{datetime.now().year - years}-01-01"
    
    # Load Sentinel-2 and filter (Image Analysis Benchmark)
    collection = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                  .filterBounds(cavite)
                  .filterDate(start_date, end_date)
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)))

    def get_monthly_stats(img):
        # Calculate NDVI (Image Processing Benchmark)
        ndvi = img.normalizedDifference(['B8', 'B4']).rename('ndvi')
        # Reduce the region to a single mean value (Numerical Methods)
        stats = ndvi.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=cavite.geometry(),
            scale=30,
            maxPixels=1e9
        )
        return img.set('date', img.date().format('YYYY-MM-dd')).set('mean_ndvi', stats.get('ndvi'))

    # Process the collection
    processed = collection.map(get_monthly_stats)
    
    # Pull data to local (Big Data Analytics Benchmark)
    data_list = processed.reduceColumns(ee.Reducer.toList(2), ['date', 'mean_ndvi']).get('list').getInfo()
    
    # Save to CSV (Data Storage Requirement)
    df = pd.DataFrame(data_list, columns=['date', 'ndvi'])
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').dropna()
    
    df.to_csv('data/cavite_history.csv', index=False)
    print("Extraction Complete! File saved: data/cavite_history.csv")

if __name__ == "__main__":
    extract_cavite_history()