import os
import time
import json
import urllib.request
import urllib.parse

CITIES = [
    'Cavite',
    'Dasmariñas',
    'Imus',
    'General Trias',
    'Bacoor',
    'Trece Martires',
    'Tagaytay',
    'Carmona',
    'Cavite City',
    'Silang',
    'Amadeo',
    'Mendez',
    'Indang',
    'Alfonso',
    'General Emilio Aguinaldo',
    'Maragondon',
    'Ternate',
    'Naic',
    'Tanza',
    'Noveleta',
    'Rosario',
    'Kawit'
]

os.makedirs('frontend/public/geojson', exist_ok=True)

# Important to have a realistic User-Agent to avoid immediate blocks from Nominatim
headers = {
    'User-Agent': 'CaviteAgriWatch/1.0 (carlo.dev@example.com)',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.5'
}

for city in CITIES:
    file_path = f"frontend/public/geojson/{city.replace(' ', '_').lower()}.geojson"
    
    if os.path.exists(file_path):
        size = os.path.getsize(file_path)
        if size > 1000:
            print(f"Skipping {city}, already exists.")
            continue
            
    q = "Cavite Philippines" if city == 'Cavite' else f"{city} Cavite Philippines"
    url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(q)}&polygon_geojson=1&format=geojson"
    
    print(f"Downloading {city}...")
    req = urllib.request.Request(url, headers=headers)
    
    try:
        with urllib.request.urlopen(req) as response:
            data = response.read().decode('utf-8')
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(data)
            print(f"Saved {city} successfully.")
    except urllib.error.HTTPError as e:
        print(f"Failed to download {city}: HTTP {e.code} {e.reason}")
        if e.code == 429:
            print("Rate limited. Pausing for 10 seconds before continuing...")
            time.sleep(10.0)
    except Exception as e:
        print(f"Failed to download {city}: {e}")
        
    time.sleep(3.0)  # Wait 3 seconds to respect Nominatim limits
