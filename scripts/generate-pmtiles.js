'use strict';

/**
 * generate-pmtiles.js
 *
 * Downloads all GPX files from Firebase Storage (gpx/ prefix), converts them
 * to GeoJSON, runs tippecanoe to generate routes.pmtiles, and uploads the
 * result back to Firebase Storage at tiles/routes.pmtiles.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node generate-pmtiles.js
 *   # or place serviceAccountKey.json in the same directory as this script
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const admin = require('firebase-admin');
const { gpx: gpxToGeoJSON } = require('@tmcw/togeojson');
const { DOMParser } = require('@xmldom/xmldom');

// ── Credentials ───────────────────────────────────────────────────────────────
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error('Error: FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
    process.exit(1);
  }
} else {
  const keyPath = path.join(__dirname, 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    console.error(
      'Error: No Firebase credentials found.\n' +
      'Set the FIREBASE_SERVICE_ACCOUNT environment variable to a JSON string,\n' +
      'or place serviceAccountKey.json in the scripts/ directory.'
    );
    process.exit(1);
  }
  serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'roots-eddf5.firebasestorage.app'
});

const bucket = admin.storage().bucket();

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmtiles-'));
  console.log('Working directory:', tmpDir);

  try {
    // 1. List all GPX files under the gpx/ prefix
    console.log('Listing GPX files in Firebase Storage...');
    const [files] = await bucket.getFiles({ prefix: 'gpx/' });
    const gpxFiles = files.filter(f => f.name.toLowerCase().endsWith('.gpx'));
    console.log(`Found ${gpxFiles.length} GPX file(s).`);

    if (gpxFiles.length === 0) {
      console.warn('No GPX files found. Exiting without generating tiles.');
      return;
    }

    // 2. Download each GPX file and convert to GeoJSON LineString features
    const parser = new DOMParser();
    const features = [];

    for (const file of gpxFiles) {
      console.log(`  Processing: ${file.name}`);
      try {
        const [content] = await file.download();
        const xmlStr = content.toString('utf8');
        const doc = parser.parseFromString(xmlStr, 'application/xml');
        const geojson = gpxToGeoJSON(doc);
        geojson.features.forEach(feat => {
          feat.properties = feat.properties || {};
          feat.properties.filename = path.basename(file.name);
          features.push(feat);
        });
      } catch (err) {
        console.warn(`  Warning: Failed to process ${file.name}:`, err.message);
      }
    }

    console.log(`Converted ${features.length} GeoJSON feature(s).`);

    if (features.length === 0) {
      console.warn('No valid GeoJSON features produced. Exiting without generating tiles.');
      return;
    }

    // 3. Write combined GeoJSON to a temp file
    const geojsonPath = path.join(tmpDir, 'routes.geojson');
    fs.writeFileSync(geojsonPath, JSON.stringify({ type: 'FeatureCollection', features }));
    console.log('Wrote combined GeoJSON to:', geojsonPath);

    // 4. Run tippecanoe to produce routes.pmtiles
    //    -zg              auto-select max zoom based on data density
    //    -Z2              minimum zoom level 2
    //    --drop-densest-as-needed  thin points at lower zooms to keep tiles small
    //    --extend-zooms-if-still-dropping  add zoom levels until all features fit
    //    -l routes        name the layer "routes" (referenced in planning.html)
    //    --force          overwrite output file if it already exists
    const outputPath = path.join(tmpDir, 'routes.pmtiles');
    const tippecanoeCmd = [
      'tippecanoe',
      '-zg',
      '-Z2',
      '--drop-densest-as-needed',
      '--extend-zooms-if-still-dropping',
      '-l', 'routes',
      '-o', outputPath,
      '--force',
      geojsonPath
    ].join(' ');

    console.log('Running tippecanoe...');
    execSync(tippecanoeCmd, { stdio: 'inherit' });
    console.log('Generated routes.pmtiles at:', outputPath);

    // 5. Upload routes.pmtiles to Firebase Storage at tiles/routes.pmtiles
    console.log('Uploading routes.pmtiles to Firebase Storage...');
    await bucket.upload(outputPath, {
      destination: 'tiles/routes.pmtiles',
      metadata: {
        contentType: 'application/vnd.pmtiles',
        cacheControl: 'public, max-age=3600'
      }
    });
    console.log('Successfully uploaded tiles/routes.pmtiles.');

  } finally {
    // 6. Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('Cleaned up temp directory.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
