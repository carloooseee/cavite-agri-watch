const https = require('https');
const fs = require('fs');

const MISSING = ['Naic', 'Tanza'];

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    reject(new Error("Invalid JSON"));
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    for (const name of MISSING) {
        try {
            console.log(`Downloading ${name}...`);
            const targetUrl = `https://nominatim.openstreetmap.org/search?q=${name}+Cavite+Philippines&polygon_geojson=1&format=json`;
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
            const data = await fetchJSON(proxyUrl);
            
            if (data && data.length > 0) {
                // Find a relation or polygon
                const place = data.find(d => d.geojson && (d.geojson.type === 'Polygon' || d.geojson.type === 'MultiPolygon'));
                if (place) {
                    const featureCol = {
                        type: "FeatureCollection",
                        features: [
                            {
                                type: "Feature",
                                properties: { name: name },
                                geometry: place.geojson
                            }
                        ]
                    };
                    fs.writeFileSync(`public/geojson/${name.toLowerCase()}.geojson`, JSON.stringify(featureCol));
                    console.log(`Success ${name}`);
                } else {
                    console.log(`No valid geometry found for ${name}`);
                }
            } else {
                console.log(`Failed ${name}`);
            }
        } catch (e) {
            console.log(`Error ${name}:`, e.message);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}
main();
