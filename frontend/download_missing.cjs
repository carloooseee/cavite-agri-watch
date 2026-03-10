const https = require('https');
const fs = require('fs');

const MISSING = {
    'naic': 1686621
};

const osmtogeojson = require('osmtogeojson');

function fetchJSON(url, options = {}, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error("Invalid JSON")); }
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function main() {
    for (const [name, id] of Object.entries(MISSING)) {
        try {
            console.log(`Downloading ${name} ways from Overpass...`);
            const query = `[out:json];relation(${id});>>;out geom;`;
            
            const data = await fetchJSON('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }, query);
            
            const coordinates = [];
            if (data && data.elements) {
                for (const el of data.elements) {
                    if (el.type === 'way' && el.geometry) {
                        const line = el.geometry.map(pt => [pt.lon, pt.lat]);
                        coordinates.push(line);
                    }
                }
            }
            
            if (coordinates.length > 0) {
                const featureCol = {
                    type: "FeatureCollection",
                    features: [
                        {
                            type: "Feature",
                            properties: { name: name },
                            geometry: {
                                type: "MultiLineString",
                                coordinates: coordinates
                            }
                        }
                    ]
                };
                fs.writeFileSync(`public/geojson/${name}.geojson`, JSON.stringify(featureCol));
                console.log(`Success ${name} (MultiLineString)`);
            } else {
                console.log(`Failed ${name}: no ways found`);
            }
        } catch (e) {
            console.log(`Error ${name}:`, e.message);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}
main();
main();
