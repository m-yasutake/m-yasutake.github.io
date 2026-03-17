'use strict';

/**
 * generate-pmtiles.js
 *
 * Downloads all GPX files from Firebase Storage (gpx/ prefix), converts them
 * to GeoJSON, and runs tippecanoe to generate two separate PMTiles files:
 *   - tiles/my-routes.pmtiles   – personal/Strava routes (isOwner: true)
 *   - tiles/planned-routes.pmtiles – manually uploaded planning routes
 *
 * Both files are uploaded back to Firebase Storage in the tiles/ prefix.
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

// Must match ROUTE_COLORS in planning.html exactly
const ROUTE_COLORS = ['#ff6b6b','#4ecdc4','#ffe66d','#a29bfe','#fd79a8','#00b894','#e17055','#0984e3','#6c5ce7','#fdcb6e'];

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if a Firestore route document belongs to the owner (personal/Strava route). */
function isOwnerDoc(data) {
  return !!(data.isOwner || data.source === 'strava');
}

/**
 * Convert GPX XML text to GeoJSON LineString features, applying color/name from
 * the provided metadata map entry.
 */
function gpxTextToFeatures(parser, xmlStr, storagePath, fallbackFileName, colorMap) {
  const doc = parser.parseFromString(xmlStr, 'application/xml');
  const geojson = gpxToGeoJSON(doc);
  const fileName = path.basename(storagePath || fallbackFileName || 'unknown.gpx');
  const meta = colorMap[storagePath] || colorMap[fileName] || {};
  const featureColor = meta.color || '#2A9D8F';
  const featureName  = meta.name  || fileName.replace(/\.gpx$/i, '');
  const produced = [];
  geojson.features.forEach(feat => {
    // Only include line/multiline geometries — skip Point features (waypoints)
    if (!feat.geometry) return;
    if (feat.geometry.type !== 'LineString' && feat.geometry.type !== 'MultiLineString') return;
    feat.properties = feat.properties || {};
    feat.properties.filename = fileName;
    feat.properties.color    = featureColor;
    feat.properties.name     = featureName;
    produced.push(feat);
  });

  if (produced.length === 0) {
    // Diagnostic: log what element types ARE present in this file
    const trkCount  = (xmlStr.match(/<trk[\s>]/g)   || []).length;
    const rteCount  = (xmlStr.match(/<rte[\s>]/g)   || []).length;
    const wptCount  = (xmlStr.match(/<wpt[\s>]/g)   || []).length;
    const trkptCount = (xmlStr.match(/<trkpt[\s>]/g) || []).length;
    const rteptCount = (xmlStr.match(/<rtept[\s>]/g) || []).length;
    const allFeatCount = geojson.features.length;
    const allFeatTypes = [...new Set(geojson.features.map(f => f.geometry && f.geometry.type))].join(', ');

    console.warn(`  ⚠ Zero LINE features from ${storagePath || fallbackFileName}`);
    console.warn(`      GPX elements: <trk>=${trkCount} <rte>=${rteCount} <wpt>=${wptCount} <trkpt>=${trkptCount} <rtept>=${rteptCount}`);
    console.warn(`      togeojson produced ${allFeatCount} feature(s) of type(s): [${allFeatTypes || 'none'}]`);

    // Fallback: if there are <rte>/<rtept> but togeojson gave us nothing useful,
    // try rewriting <rte>/<rtept> → <trk>/<trkseg>/<trkpt> and re-parsing
    if (rteptCount > 0 && trkptCount === 0) {
      console.warn(`      → Attempting <rte>→<trk> rewrite fallback...`);
      try {
        const rewritten = xmlStr
          .replace(/<rte>/g,        '<trk><trkseg>')
          .replace(/<\/rte>/g,      '</trkseg></trk>')
          .replace(/<rtept /g,      '<trkpt ')
          .replace(/<\/rtept>/g,    '</trkpt>')
          .replace(/<rtename>/g,    '<name>')
          .replace(/<\/rtename>/g,  '</name>');
        const doc2 = parser.parseFromString(rewritten, 'application/xml');
        const geojson2 = gpxToGeoJSON(doc2);
        geojson2.features.forEach(feat => {
          if (!feat.geometry) return;
          if (feat.geometry.type !== 'LineString' && feat.geometry.type !== 'MultiLineString') return;
          feat.properties = feat.properties || {};
          feat.properties.filename = fileName;
          feat.properties.color    = featureColor;
          feat.properties.name     = featureName;
          produced.push(feat);
        });
        if (produced.length > 0) {
          console.warn(`      → Fallback succeeded: produced ${produced.length} feature(s).`);
        } else {
          console.warn(`      → Fallback also produced 0 line features.`);
        }
      } catch (e) {
        console.warn(`      → Fallback failed: ${e.message}`);
      }
    }

    if (produced.length === 0) {
      console.warn(`      → This route will be MISSING from tiles. Re-export as a GPX track to fix.`);
    }
  }

  return produced;
}

/**
 * Build a tippecanoe command, run it, and upload the resulting .pmtiles file
 * to Firebase Storage.
 *
 * @param {object[]} features       GeoJSON features to tile
 * @param {string}   tmpDir         Temp directory for intermediate files
 * @param {string}   baseName       Base name for output file (without extension), e.g. 'my-routes'
 * @param {object}   bucket         Firebase Storage bucket
 */
async function generateAndUpload(features, tmpDir, baseName, bucket) {
  if (features.length === 0) {
    console.warn(`No valid GeoJSON features for ${baseName}. Skipping tile generation.`);
    return;
  }

  // Write GeoJSON
  const geojsonPath = path.join(tmpDir, `${baseName}.geojson`);
  fs.writeFileSync(geojsonPath, JSON.stringify({ type: 'FeatureCollection', features }));
  console.log(`Wrote GeoJSON for ${baseName} (${features.length} feature(s)) to: ${geojsonPath}`);

  // Run tippecanoe
  //    -zg              auto-select max zoom based on data density
  //    -Z2              minimum zoom level 2
  //    --drop-densest-as-needed  thin points at lower zooms to keep tiles small
  //    --extend-zooms-if-still-dropping  add zoom levels until all features fit
  //    -l routes        name the layer "routes" (referenced in planning.html)
  //    --force          overwrite output file if it already exists
  const outputPath = path.join(tmpDir, `${baseName}.pmtiles`);
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

  console.log(`Running tippecanoe for ${baseName}...`);
  execSync(tippecanoeCmd, { stdio: 'inherit' });
  console.log(`Generated ${baseName}.pmtiles at: ${outputPath}`);

  // Upload to Firebase Storage
  const destination = `tiles/${baseName}.pmtiles`;
  console.log(`Uploading to Firebase Storage: ${destination}`);
  await bucket.upload(outputPath, {
    destination,
    metadata: {
      contentType: 'application/vnd.pmtiles',
      cacheControl: 'public, max-age=3600'
    }
  });
  console.log(`Successfully uploaded ${destination}.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmtiles-'));
  console.log('Working directory:', tmpDir);

  try {
    // 1. Fetch ALL route documents from Firestore (same ordering as planning.html so
    //    colors are assigned consistently).
    console.log('Fetching route order from Firestore...');
    const db = admin.firestore();
    const snapshot = await db.collection('routes').orderBy('uploadedAt', 'desc').get();

    // Build two color maps — one for personal (isOwner) routes, one for planned routes.
    // Each map: storagePath / fileName → { color, name }
    const myColorMap      = {};  // isOwner routes
    const planColorMap    = {};  // planning routes
    const myRoutesMeta    = [];  // isOwner Firestore docs
    const planRoutesMeta  = [];  // planning Firestore docs
    let colorIdx = 0;

    snapshot.forEach(doc => {
      const data    = doc.data();
      const isOwner = isOwnerDoc(data);
      const color   = ROUTE_COLORS[colorIdx % ROUTE_COLORS.length];
      colorIdx++;
      const meta = {
        color,
        name:        (data.metadata && data.metadata.name) || data.fileName,
        gpxContent:  data.gpxContent || null, // backward-compat: legacy docs may have gpxContent cached inline
        storagePath: data.storagePath || null,
        fileName:    data.fileName    || null
      };
      if (isOwner) {
        myRoutesMeta.push(meta);
        if (data.storagePath) myColorMap[data.storagePath] = meta;
        if (data.fileName)    myColorMap[data.fileName]    = meta;
      } else {
        planRoutesMeta.push(meta);
        if (data.storagePath) planColorMap[data.storagePath] = meta;
        if (data.fileName)    planColorMap[data.fileName]    = meta;
      }
    });
    console.log(`Loaded ${myRoutesMeta.length} personal route(s) and ${planRoutesMeta.length} planning route(s) from Firestore.`);

    // 2. List all GPX files under the gpx/ prefix
    console.log('Listing GPX files in Firebase Storage...');
    const [files] = await bucket.getFiles({ prefix: 'gpx/' });
    const gpxFiles = files.filter(f => f.name.toLowerCase().endsWith('.gpx'));
    console.log(`Found ${gpxFiles.length} GPX file(s) in Storage.`);

    const storageFileNames = new Set(gpxFiles.map(f => f.name));

    // Helper: warn about Firestore docs with no Storage file and no gpxContent
    function warnMissing(routesMeta, label) {
      const missing = routesMeta.filter(r => {
        const inStorage = r.storagePath && storageFileNames.has(r.storagePath);
        return !inStorage && !r.gpxContent;
      });
      if (missing.length > 0) {
        console.warn(`  ⚠ ${missing.length} ${label} route(s) have no Storage file AND no cached gpxContent — will be MISSING from tiles:`);
        missing.forEach(r => console.warn(`      • ${r.fileName || '(unknown)'} (storagePath: ${r.storagePath || 'null'})`));
      }
    }
    warnMissing(myRoutesMeta,   'personal');
    warnMissing(planRoutesMeta, 'planning');

    // 3. Download each Storage GPX file and convert to GeoJSON LineString features.
    //    Route membership (personal vs planning) is determined by which colorMap
    //    contains the storagePath/fileName.
    const parser = new DOMParser();
    const myFeatures   = [];
    const planFeatures = [];

    // Determine if a storage file belongs to personal routes
    function isOwnerFile(storagePath) {
      const fileName = path.basename(storagePath);
      return !!(myColorMap[storagePath] || myColorMap[fileName]);
    }

    for (const file of gpxFiles) {
      console.log(`  Processing Storage file: ${file.name}`);
      try {
        const [content] = await file.download();
        const xmlStr = content.toString('utf8');
        if (isOwnerFile(file.name)) {
          myFeatures.push(...gpxTextToFeatures(parser, xmlStr, file.name, null, myColorMap));
        } else {
          planFeatures.push(...gpxTextToFeatures(parser, xmlStr, file.name, null, planColorMap));
        }
      } catch (err) {
        console.warn(`  Warning: Failed to process ${file.name}:`, err.message);
      }
    }

    // 3b. Process Firestore-only routes (Storage file missing, gpxContent present)
    const myFirestoreOnly   = myRoutesMeta.filter(r => {
      const inStorage = r.storagePath && storageFileNames.has(r.storagePath);
      return !inStorage && r.gpxContent;
    });
    const planFirestoreOnly = planRoutesMeta.filter(r => {
      const inStorage = r.storagePath && storageFileNames.has(r.storagePath);
      return !inStorage && r.gpxContent;
    });

    if (myFirestoreOnly.length > 0) {
      console.warn(`  ⚠ ${myFirestoreOnly.length} personal route(s) have no Storage file — will use inline gpxContent from Firestore:`);
      myFirestoreOnly.forEach(r => console.warn(`      • ${r.fileName || '(unknown)'}`));
    }
    if (planFirestoreOnly.length > 0) {
      console.warn(`  ⚠ ${planFirestoreOnly.length} planning route(s) have no Storage file — will use inline gpxContent from Firestore:`);
      planFirestoreOnly.forEach(r => console.warn(`      • ${r.fileName || '(unknown)'}`));
    }

    for (const r of myFirestoreOnly) {
      console.log(`  Processing Firestore-cached GPX (personal): ${r.fileName || '(unknown)'}`);
      try {
        myFeatures.push(...gpxTextToFeatures(parser, r.gpxContent, r.storagePath, r.fileName, myColorMap));
      } catch (err) {
        console.warn(`  Warning: Failed to process inline gpxContent for ${r.fileName || '(unknown)'}:`, err.message);
      }
    }

    for (const r of planFirestoreOnly) {
      console.log(`  Processing Firestore-cached GPX (planning): ${r.fileName || '(unknown)'}`);
      try {
        planFeatures.push(...gpxTextToFeatures(parser, r.gpxContent, r.storagePath, r.fileName, planColorMap));
      } catch (err) {
        console.warn(`  Warning: Failed to process inline gpxContent for ${r.fileName || '(unknown)'}:`, err.message);
      }
    }

    console.log(`Personal routes: ${myFeatures.length} GeoJSON feature(s).`);
    console.log(`Planning routes: ${planFeatures.length} GeoJSON feature(s).`);

    if (myFeatures.length === 0 && planFeatures.length === 0) {
      console.warn('No valid GeoJSON features produced for either route set. Exiting without generating tiles.');
      return;
    }

    // 4 & 5. Generate and upload separate PMTiles for each route type.
    await generateAndUpload(myFeatures,   tmpDir, 'my-routes',      bucket);
    await generateAndUpload(planFeatures, tmpDir, 'planned-routes', bucket);

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
