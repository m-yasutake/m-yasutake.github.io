'use strict';

/**
 * generate-points-snapshot.js
 *
 * Downloads all point documents from the Firestore 'points' collection and
 * writes per-country points snapshots plus server-prebuilt dynamic cluster
 * levels to Firebase Storage: points/points.json (Japan — every point not
 * explicitly tagged Norway or Denmark, since Japan points predate the
 * `country` field and were never backfilled), points/norway-points.json,
 * points/denmark-points.json. Each country's planning map page fetches its
 * file on load and switches cluster levels by zoom without clustering
 * on-device.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='<json>' node generate-points-snapshot.js
 *   # or place serviceAccountKey.json in the same directory as this script
 *
 * The output file is uploaded with:
 *   contentType: application/json
 *   cacheControl: public, max-age=300   (5 min CDN cache — re-run to refresh)
 */

const path = require('path');
const fs   = require('fs');

const admin = require('firebase-admin');
const PointTypes = require('../js/point-types.js');

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

const db     = admin.firestore();
const bucket = admin.storage().bucket();
const MAX_CLUSTER_ITEMS = 12; // keep popup lists readable while still showing representative nearby points
const SERVER_CLUSTER_MIN_ZOOM = 3;
const SERVER_CLUSTER_MAX_ZOOM = 7;
const SERVER_CLUSTER_DISABLE_ZOOM = 8; // above this zoom render raw points for full detail
const BASE_CLUSTER_CELL_SIZE = 10.0; // degrees at min zoom; cell size halves each zoom level for dynamic dissolve

// All per-country normalization/icon rules live in js/point-types.js, shared
// with the frontend (js/japan-map.js, js/norway-map.js, js/denmark-map.js)
// so this generator can't drift out of sync with what the map actually
// renders. PointTypes.<country>.normalize returns '_default' for unmatched
// types; buildServerClustersForZoom below expects 'Other' for that case, so
// wrap it.
function wrapDefaultAsOther(normalizeFn) {
  return (rawType) => {
    const normalized = normalizeFn(rawType);
    return normalized === '_default' ? 'Other' : normalized;
  };
}
const normalizePointType        = wrapDefaultAsOther(PointTypes.japan.normalize);
const normalizeNorwayPointType  = wrapDefaultAsOther(PointTypes.norway.normalize);
const normalizeDenmarkPointType = wrapDefaultAsOther(PointTypes.denmark.normalize);

// Counts visited onsens among Japan's points and writes stats/japan so
// index.html can read a single document instead of downloading the entire
// points collection. Uses { merge: true } so route stats (written by
// fetch-strava-rides.js) are preserved. Respects TRIP_AFTER_DATE /
// TRIP_BEFORE_DATE to cap the count to a specific trip.
const ONSEN_RE = /onsen|foot\s*bath|super\s*sento|sento|community\s*center/i;
async function writeJapanOnsenStats(japanPoints) {
  const afterMs  = process.env.TRIP_AFTER_DATE  ? new Date(process.env.TRIP_AFTER_DATE).getTime()  : null;
  const beforeMs = process.env.TRIP_BEFORE_DATE ? new Date(process.env.TRIP_BEFORE_DATE).getTime() : null;
  if (afterMs || beforeMs) {
    console.log(`Counting onsens uploaded after ${process.env.TRIP_AFTER_DATE || '(any)'}` +
                ` and before ${process.env.TRIP_BEFORE_DATE || '(any)'}`);
  }
  let onsensCount = 0;
  for (const p of japanPoints) {
    if (!p.visited) continue;
    if (afterMs || beforeMs) {
      if (p.uploadedAt !== null) {
        if (afterMs  && p.uploadedAt < afterMs)  continue;
        if (beforeMs && p.uploadedAt > beforeMs) continue;
      }
    }
    const rawType = (p.metadata && (p.metadata.Type || p.metadata.type)) || p.type || '';
    if (ONSEN_RE.test(rawType)) onsensCount++;
  }
  console.log(`Onsen count: ${onsensCount}`);
  await db.collection('stats').doc('japan').set(
    { onsensCount, statsUpdatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  console.log('  ✓ stats/japan onsensCount updated.');
}

// Per-country snapshot config, used by the loop in main() below.
//
// Japan predates the multi-country feature — its snapshot used to just be
// "all points" because Japan was the only country. Norway/Denmark points
// were later added to the same Firestore collection and tagged with an
// explicit `country`, but Japan points were never backfilled with
// country: 'Japan' (only 6 of ~13.6k have it — see the point-type drift note
// in js/point-types.js for the same class of issue). So its filter means
// "not explicitly another country", not "explicitly tagged Japan" — and it
// keeps the legacy points.json/points/points.json file names instead of the
// japan-points.json pattern the other countries use.
//
// To add another country: add an entry here (and, if it needs frontend
// icons/normalization, a block in js/point-types.js). Only Japan needs
// extraStats — it's an optional hook for a country-specific side effect
// beyond the snapshot file itself.
const COUNTRY_SNAPSHOTS = [
  {
    key: 'japan',
    filter: (p) => p.country !== 'Norway' && p.country !== 'Denmark',
    normalize: normalizePointType,
    localFile: 'points.json',
    storageFile: 'points/points.json',
    extraStats: writeJapanOnsenStats
  },
  {
    key: 'norway',
    filter: (p) => p.country === 'Norway',
    normalize: normalizeNorwayPointType,
    localFile: 'norway-points.json',
    storageFile: 'points/norway-points.json'
  },
  {
    key: 'denmark',
    filter: (p) => p.country === 'Denmark',
    normalize: normalizeDenmarkPointType,
    localFile: 'denmark-points.json',
    storageFile: 'points/denmark-points.json'
  }
];

// A large share of Japan points only carry their link under a metadata field
// (metadata.website, in practice, but check every variant the old frontend
// code checked) rather than the top-level `url` field the snapshot's
// consumers read — resolve it once here so no consumer has to special-case
// metadata lookups themselves.
function resolvePointUrl(d) {
  if (d.url) return d.url;
  const m = d.metadata || {};
  return m.url || m.URL || m.link || m.Link || m.website || m.Website || m.page || m.Page || null;
}

function getClusterCellSizeForZoom(zoom) {
  return BASE_CLUSTER_CELL_SIZE / Math.pow(2, Math.max(0, zoom - SERVER_CLUSTER_MIN_ZOOM));
}

function buildServerClustersForZoom(points, zoom, normalizeFn) {
  const normalize = normalizeFn || normalizePointType;
  const cellSize = getClusterCellSizeForZoom(zoom);
  const buckets = new Map();

  for (const p of points) {
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') continue;
    const rawType = (p.metadata && (p.metadata.Type || p.metadata.type)) || p.type || '';
    const type = normalize(rawType);
    const latKey = Math.round(p.lat / cellSize);
    const lonKey = Math.round(p.lon / cellSize);
    const key = `${type}:${latKey}:${lonKey}`;
    if (!buckets.has(key)) {
      buckets.set(key, { type, latSum: 0, lonSum: 0, count: 0, items: [], singlePoint: null });
    }
    const bucket = buckets.get(key);
    bucket.latSum += p.lat;
    bucket.lonSum += p.lon;
    bucket.count += 1;
    if (bucket.count === 1) bucket.singlePoint = p;
    else bucket.singlePoint = null;
    if (bucket.items.length < MAX_CLUSTER_ITEMS) {
      bucket.items.push({ name: p.name || 'Point', url: p.url || null });
    }
  }

  return Array.from(buckets.values()).map((bucket) => {
    const count = bucket.count;
    if (count === 1) {
      const single = bucket.singlePoint;
      return {
        id: single.id || null,
        name: single.name || 'Point',
        lat: single.lat,
        lon: single.lon,
        url: single.url || null,
        type: single.type || null,
        metadata: single.metadata || {},
        fileName: single.fileName || null
      };
    }
    return {
      name: count > 1 ? `${bucket.type} (${count})` : (bucket.items[0] && bucket.items[0].name) || bucket.type,
      lat: bucket.latSum / count,
      lon: bucket.lonSum / count,
      type: bucket.type,
      metadata: {
        __cluster: {
          count,
          items: bucket.items
        }
      }
    };
  });
}

function buildServerClusterLevels(points, normalizeFn) {
  const levels = {};
  for (let zoom = SERVER_CLUSTER_MIN_ZOOM; zoom <= SERVER_CLUSTER_MAX_ZOOM; zoom++) {
    levels[String(zoom)] = buildServerClustersForZoom(points, zoom, normalizeFn);
  }
  return levels;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching all points from Firestore...');

  const points   = [];
  let   lastDoc  = null;
  const BATCH    = 1000;

  // Paginate through the entire collection (same ordering as the browser client)
  while (true) {
    let query = db.collection('points').orderBy('uploadedAt', 'desc').limit(BATCH);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snapshot = await query.get();
    snapshot.forEach(doc => {
      const d = doc.data();
      points.push({
        id:       doc.id,
        name:     d.name     || '',
        lat:      d.lat,
        lon:      d.lon,
        url:      resolvePointUrl(d),
        metadata: d.metadata || {},
        fileName: d.fileName || null,
        visited:  d.visited  || false,
        type:     d.type     || null,
        country:  d.country  || null,
        uploadedAt: d.uploadedAt ? d.uploadedAt.toMillis() : null,
      });
    });

    console.log(`  Fetched ${points.length} point(s) so far...`);

    if (snapshot.size < BATCH) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  console.log(`Total: ${points.length} point(s).`);

  const generatedAt = new Date().toISOString();

  // ── Per-country snapshots (Japan, Norway, Denmark, ...) ─────────────────────
  // To add a country here, add an entry to COUNTRY_SNAPSHOTS above (and, if it
  // needs frontend icons/normalization, a block in js/point-types.js).
  for (const country of COUNTRY_SNAPSHOTS) {
    const countryPoints = points.filter(country.filter);
    console.log(`\n${country.key} points: ${countryPoints.length}`);

    if (countryPoints.length === 0) {
      console.log(`No ${country.key} points found — ${country.localFile} not written.`);
      continue;
    }

    if (country.extraStats) await country.extraStats(countryPoints);

    const clustersByZoom = buildServerClusterLevels(countryPoints, country.normalize);
    Object.keys(clustersByZoom).forEach(zoom => {
      console.log(`${country.key} server clusters @ z${zoom}: ${clustersByZoom[zoom].length}`);
    });

    const countryJson = JSON.stringify({
      generatedAt,
      points: countryPoints,
      clustersByZoom,
      clusterZoomRange: {
        min: SERVER_CLUSTER_MIN_ZOOM,
        max: SERVER_CLUSTER_MAX_ZOOM,
        disableClusteringAtZoom: SERVER_CLUSTER_DISABLE_ZOOM
      }
    });
    const countryBuffer = Buffer.from(countryJson, 'utf8');
    console.log(`${country.key} snapshot size: ${(countryBuffer.length / 1024).toFixed(1)} KB`);

    const countryLocalPath = path.join(__dirname, '..', 'assets', country.localFile);
    fs.writeFileSync(countryLocalPath, countryJson, 'utf8');
    console.log(`${country.key} local snapshot written to ${countryLocalPath}`);

    console.log(`Uploading ${country.storageFile} to Firebase Storage...`);
    const countryFile = bucket.file(country.storageFile);
    await countryFile.save(countryBuffer, {
      contentType: 'application/json',
      metadata: { cacheControl: 'public, max-age=300' }
    });
    // Make the file publicly readable so the browser can fetch it without
    // auth. This works when uniform bucket-level access is disabled (the
    // default for Firebase Storage buckets created before 2023). If your
    // bucket has uniform access enabled, grant the Storage Object Viewer
    // role to allUsers via IAM instead and remove this.
    try {
      await countryFile.makePublic();
      console.log(`${country.key} file made publicly readable.`);
    } catch (err) {
      console.warn(
        `Could not set public ACL for ${country.key} file (fine if uniform bucket-level access is enabled):\n`,
        err.message
      );
    }
    console.log(`${country.key} done. ${countryPoints.length} point(s) written.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
