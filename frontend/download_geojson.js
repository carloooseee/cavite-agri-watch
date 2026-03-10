const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  require.resolve('osmtogeojson');
} catch (e) {
  console.log('Installing osmtogeojson...');
  execSync('npm install osmtogeojson', { stdio: 'inherit' });
}

const osmtogeojson = require('osmtogeojson');

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

async function downloadCity(city) {
    console.log(`Downloading ${city}...`);
    const fileName = city.replace(/ /g, '_').toLowerCase();
    const filePath = path.join(__dirname, 'public/geojson', `${fileName}.geojson`);
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
        console.log(`Skipping ${city}`);
        return;
    }

    let query;
    if (city === 'Cavite') {
        query = `[out:json];relation["name"="Cavite"]["admin_level"="4"];out body;>;out skel qt;`;
    } else {
        query = `[out:json];area["name"="Cavite"]->.a;relation["name"="${city}"](area.a)["admin_level"~"6|8|9"];out body;>;out skel qt;`;
    }

    try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        const data = await res.json();
        const geojson = osmtogeojson(data);
        
        const feature = geojson.features.find(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
        if (feature) {
            fs.writeFileSync(filePath, JSON.stringify({type: "FeatureCollection", features: [feature]}));
            console.log(`Saved ${city}`);
        } else {
            console.log(`No valid geometry found for ${city}`);
        }
    } catch (e) {
        console.log(`Failed for ${city}:`, e.message);
    }
    
    // sleep
    await new Promise(r => setTimeout(r, 2000));
}

async function main() {
    fs.mkdirSync(path.join(__dirname, 'public/geojson'), {recursive:true});
    for (const city of CITIES) await downloadCity(city);
}
main();
