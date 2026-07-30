'use strict';

/**
 * generate-pmtiles.js
 *
 * Downloads all GPX files from Firebase Storage (gpx/ prefix), converts them
 * to GeoJSON, and runs tippecanoe to generate PMTiles files:
 *   - tiles/my-routes-<category>.pmtiles – personal/Strava routes (isOwner:
 *     true), split into bounded shards by trip so no single file grows
 *     past GitHub's 100 MB limit. Category is one of 'japan', 'norway',
 *     'denmark' (using the same JAPAN_TRIP_FROM/TO-style date windows as
 *     fetch-strava-rides.js) or 'other-<year>' for anything outside those
 *     windows.
 *   - tiles/planned-routes.pmtiles – manually uploaded planning routes
 *   - assets/tiles/my-routes-manifest.json – lists the category shards
 *     generated this run, so frontend pages can discover them without any
 *     hardcoded list.
 *
 * All pmtiles files are uploaded back to Firebase Storage in the tiles/
 * prefix and copied to assets/tiles/ for GitHub Pages serving.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node generate-pmtiles.js
 *   # or place serviceAccountKey.json in the same directory as this script
 *
 * Optional env vars (same names/format as fetch-strava-rides.js):
 *   JAPAN_TRIP_FROM / JAPAN_TRIP_TO
 *   NORWAY_TRIP_FROM / NORWAY_TRIP_TO
 *   DENMARK_TRIP_FROM / DENMARK_TRIP_TO
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

// Matches the date segment in: strava_{id}_{YYYY-MM-DD}_{name}.gpx — same
// convention used by fetch-strava-rides.js and route-map.js.
const DATE_FROM_FILENAME_RE = /strava_\d+_(\d{4}-\d{2}-\d{2})_/;

/**
 * Returns the activity date (epoch ms) for a Firestore route doc, preferring
 * the structured `activityDate` Timestamp field and falling back to parsing
 * the date out of the file name for older/unbackfilled docs.
 */
function extractActivityMs(data) {
  if (data.activityDate && typeof data.activityDate.toMillis === 'function') {
    return data.activityDate.toMillis();
  }
  const candidate = data.fileName || (data.storagePath ? path.basename(data.storagePath) : '');
  const m = candidate.match(DATE_FROM_FILENAME_RE);
  if (!m) return null;
  return new Date(m[1] + 'T00:00:00Z').getTime();
}

/** True if the given timestamp (ms) falls inside the <PREFIX>_TRIP_FROM/TO env window. */
function isInTripWindow(activityMs, envPrefix) {
  const fromEnv = process.env[`${envPrefix}_TRIP_FROM`];
  if (!fromEnv) return false;
  const fromMs = new Date(fromEnv).getTime();
  const toEnv = process.env[`${envPrefix}_TRIP_TO`];
  const toMs = toEnv ? new Date(toEnv).getTime() : Date.now();
  return activityMs >= fromMs && activityMs <= toMs;
}

/**
 * Classifies a personal route's activity date into a bounded pmtiles shard
 * category: a named trip if it falls inside one of the JAPAN/NORWAY/DENMARK
 * date windows, otherwise 'other-<year>' so the fallback bucket can't grow
 * unbounded either. Returns 'other-unknown' if no date could be determined.
 */
function computeCategory(activityMs) {
  if (activityMs == null) return 'other-unknown';
  if (isInTripWindow(activityMs, 'JAPAN'))   return 'japan';
  if (isInTripWindow(activityMs, 'DENMARK')) return 'denmark';
  if (isInTripWindow(activityMs, 'NORWAY'))  return 'norway';
  return `other-${new Date(activityMs).getUTCFullYear()}`;
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
  const featureName = meta.name || fileName.replace(/\.gpx$/i, '');
  const featureSource = meta.sourceUrl || null;
  const produced = [];
  geojson.features.forEach(feat => {
    // Only include line/multiline geometries — skip Point features (waypoints)
    if (!feat.geometry) return;
    if (feat.geometry.type !== 'LineString' && feat.geometry.type !== 'MultiLineString') return;
    feat.properties = feat.properties || {};
    feat.properties.filename = fileName;
    feat.properties.color    = featureColor;
    feat.properties.name     = featureName;
    if (featureSource) feat.properties.sourceUrl = featureSource;
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
  //    --simplification=10  slightly more aggressive line simplification than
  //                     tippecanoe's default, to keep output size down with
  //                     negligible visual difference at normal viewing zooms
  //    -l routes        name the layer "routes" (referenced in planning.html)
  //    --force          overwrite output file if it already exists
  const outputPath = path.join(tmpDir, `${baseName}.pmtiles`);
  const tippecanoeCmd = [
    'tippecanoe',
    '-zg',
    '-Z2',
    '--drop-densest-as-needed',
    '--extend-zooms-if-still-dropping',
    '--simplification=10',
    '-l', 'routes',
    '-o', outputPath,
    '--force',
    geojsonPath
  ].join(' ');

  console.log(`Running tippecanoe for ${baseName}...`);
  execSync(tippecanoeCmd, { stdio: 'inherit' });
  console.log(`Generated ${baseName}.pmtiles at: ${outputPath}`);

  // Safety guard: fail loudly here, with an actionable message, rather than
  // letting an oversized file reach `git push` and get rejected there.
  // GitHub's hard limit is 100 MB; 90 MB leaves a safety margin.
  const MAX_SAFE_BYTES = 90 * 1024 * 1024;
  const outputSize = fs.statSync(outputPath).size;
  console.log(`  ${baseName}.pmtiles size: ${(outputSize / (1024 * 1024)).toFixed(1)} MB`);
  if (outputSize > MAX_SAFE_BYTES) {
    throw new Error(
      `${baseName}.pmtiles is ${(outputSize / (1024 * 1024)).toFixed(1)} MB, ` +
      `exceeding the ${(MAX_SAFE_BYTES / (1024 * 1024)).toFixed(0)} MB safety threshold ` +
      `(GitHub's hard limit is 100 MB). This shard needs a narrower trip window, an ` +
      `additional split, or more simplification before it can be committed.`
    );
  }

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

  // Also copy to assets/tiles/ for local GitHub Pages serving
  const assetsDir = path.join(__dirname, '..', 'assets', 'tiles');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  const localDest = path.join(assetsDir, `${baseName}.pmtiles`);
  fs.copyFileSync(outputPath, localDest);
  console.log(`Copied ${baseName}.pmtiles to ${localDest}`);
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
        sourceUrl:   (data.metadata && data.metadata.sourceUrl) || null,
        gpxContent:  data.gpxContent || null, // backward-compat: legacy docs may have gpxContent cached inline
        storagePath: data.storagePath || null,
        fileName:    data.fileName    || null,
        category:    isOwner ? computeCategory(extractActivityMs(data)) : null
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
    const myFeaturesByCategory = {}; // category -> feature array
    const planFeatures = [];

    // Determine if a storage file belongs to personal routes
    function isOwnerFile(storagePath) {
      const fileName = path.basename(storagePath);
      return !!(myColorMap[storagePath] || myColorMap[fileName]);
    }

    function categoryForFile(storagePath) {
      const fileName = path.basename(storagePath);
      const meta = myColorMap[storagePath] || myColorMap[fileName];
      return (meta && meta.category) || 'other-unknown';
    }

    function addToCategory(category, features) {
      if (features.length === 0) return;
      if (!myFeaturesByCategory[category]) myFeaturesByCategory[category] = [];
      myFeaturesByCategory[category].push(...features);
    }

    for (const file of gpxFiles) {
      console.log(`  Processing Storage file: ${file.name}`);
      try {
        const [content] = await file.download();
        const xmlStr = content.toString('utf8');
        if (isOwnerFile(file.name)) {
          addToCategory(categoryForFile(file.name), gpxTextToFeatures(parser, xmlStr, file.name, null, myColorMap));
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
        addToCategory(
          r.category || 'other-unknown',
          gpxTextToFeatures(parser, r.gpxContent, r.storagePath, r.fileName, myColorMap)
        );
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

    const categories = Object.keys(myFeaturesByCategory).sort();
    const myFeatureCount = categories.reduce((sum, c) => sum + myFeaturesByCategory[c].length, 0);
    console.log(`Personal routes: ${myFeatureCount} GeoJSON feature(s) across ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}: ${categories.join(', ') || '(none)'}.`);
    console.log(`Planning routes: ${planFeatures.length} GeoJSON feature(s).`);

    if (myFeatureCount === 0 && planFeatures.length === 0) {
      console.warn('No valid GeoJSON features produced for either route set. Exiting without generating tiles.');
      return;
    }

    // 4 & 5. Generate and upload one PMTiles shard per personal-route category,
    // plus a single file for planned routes.
    for (const category of categories) {
      await generateAndUpload(myFeaturesByCategory[category], tmpDir, `my-routes-${category}`, bucket);
    }
    await generateAndUpload(planFeatures, tmpDir, 'planned-routes', bucket);

    // Write a manifest listing the shards generated this run, so frontend
    // pages can discover them dynamically without any hardcoded category list.
    const assetsDir = path.join(__dirname, '..', 'assets', 'tiles');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    const manifestPath = path.join(assetsDir, 'my-routes-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ categories }, null, 2));
    console.log(`Wrote manifest: ${manifestPath}`);

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
