const fs = require('fs');
const path = require('path');
const https = require('https');

const CITIES = [
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
];

function fetchJSON(url, options = {}, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Invalid JSON format from ${url}`));
                }
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function fetchOverpassId(city) {
    let query;
    if (city === 'Cavite') {
        return 1687040; // Hardcoded Cavite province OSM Relation ID
    } else {
        query = `[out:json];relation["name"="${city}"]["boundary"="administrative"]["admin_level"~"6|8|9|10"];out ids;`;
    }

    try {
        const data = await fetchJSON('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }, query);
        if (data && data.elements && data.elements.length > 0) {
            // Pick the first relation that matches
            return data.elements[0].id;
        }
    } catch (e) {
        console.error(`Failed to fetch ID for ${city}:`, e.message);
    }
    return null;
}

async function fetchGeojson(id) {
    try {
        const data = await fetchJSON(`https://polygons.openstreetmap.fr/get_geojson.py?id=${id}&params=0`);
        return data;
    } catch (e) {
        console.error(`Failed to fetch GeoJSON for ID ${id}:`, e.message);
        return null;
    }
}

async function downloadCity(city) {
    console.log(`Downloading ${city}...`);
    const fileName = city.replace(/ /g, '_').toLowerCase();
    const filePath = path.join(__dirname, 'public/geojson', `${fileName}.geojson`);

    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
        console.log(`Skipping ${city}`);
        return;
    }

    const id = await fetchOverpassId(city);
    if (!id) {
        console.log(`Could not find OSM Relation ID for ${city}`);
        return;
    }
    
    console.log(`Found ID for ${city}: ${id}, fetching geometry...`);
    const geometry = await fetchGeojson(id);
    
    if (geometry) {
        // Wrap in FeatureCollection for OpenLayers
        const featureCol = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: { name: city },
                    geometry: geometry.geometries ? geometry.geometries[0] : geometry
                }
            ]
        };
        fs.writeFileSync(filePath, JSON.stringify(featureCol));
        console.log(`Saved ${city}`);
    } else {
        console.log(`Failed to get geometry for ${city}`);
    }
    
    // sleep
    await new Promise(r => setTimeout(r, 1000));
}

async function main() {
    fs.mkdirSync(path.join(__dirname, 'public/geojson'), {recursive:true});
    for (const city of CITIES) await downloadCity(city);
}
main();
