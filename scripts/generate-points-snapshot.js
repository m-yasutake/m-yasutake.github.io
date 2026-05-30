'use strict';

/**
 * generate-points-snapshot.js
 *
 * Downloads all point documents from the Firestore 'points' collection and
 * writes a points snapshot plus server-prebuilt dynamic cluster levels to
 * Firebase Storage at points/points.json. The planning map page fetches this
 * file on load and switches cluster levels by zoom without clustering on-device.
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
const MAX_CLUSTER_ITEMS = 50; // keep popup lists readable while still showing representative nearby points
const SERVER_CLUSTER_MIN_ZOOM = 3;
const SERVER_CLUSTER_MAX_ZOOM = 8;
const SERVER_CLUSTER_DISABLE_ZOOM = 9; // above this zoom render raw points for full detail
const BASE_CLUSTER_CELL_SIZE = 2.0; // degrees at min zoom; cell size halves each zoom level for dynamic dissolve

function normalizePointType(rawType) {
  const type = rawType ? String(rawType).trim() : '';
  if (!type) return 'Other';
  if (/foot\s*bath/i.test(type)) return 'Foot Bath';
  if (/hotel\s*onsen|onsen.*hotel|Hotel\/Ryokan Onsen/i.test(type)) return 'Hotel Onsen';
  if (/super\s*sento/i.test(type)) return 'Super Sento';
  if (/onsen|community\s*center/i.test(type)) return 'Onsen';
  if (/camp/i.test(type)) return 'Campsite';
  if (/roadside\s*station/i.test(type)) return 'Roadside Station';
  if (/must\s*see/i.test(type)) return 'Must See';
  if (/hotel/i.test(type)) return 'Hotel';
  if (/other/i.test(type)) return 'Other';
  return type;
}

function getClusterCellSizeForZoom(zoom) {
  return BASE_CLUSTER_CELL_SIZE / Math.pow(2, Math.max(0, zoom - SERVER_CLUSTER_MIN_ZOOM));
}

function buildServerClustersForZoom(points, zoom) {
  const cellSize = getClusterCellSizeForZoom(zoom);
  const buckets = new Map();

  for (const p of points) {
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') continue;
    const rawType = (p.metadata && (p.metadata.Type || p.metadata.type)) || p.type || '';
    const type = normalizePointType(rawType);
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

function buildServerClusterLevels(points) {
  const levels = {};
  for (let zoom = SERVER_CLUSTER_MIN_ZOOM; zoom <= SERVER_CLUSTER_MAX_ZOOM; zoom++) {
    levels[String(zoom)] = buildServerClustersForZoom(points, zoom);
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
        url:      d.url      || null,
        metadata: d.metadata || {},
        fileName: d.fileName || null,
        visited:  d.visited  || false,
        type:     d.type     || null,
        uploadedAt: d.uploadedAt ? d.uploadedAt.toMillis() : null,
      });
    });

    console.log(`  Fetched ${points.length} point(s) so far...`);

    if (snapshot.size < BATCH) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  console.log(`Total: ${points.length} point(s).`);

  // Count visited onsens and write to stats/japan so index.html can read
  // a single document instead of downloading the entire points collection.
  // Uses { merge: true } so route stats (written by fetch-strava-rides.js) are preserved.
  // Respects TRIP_AFTER_DATE / TRIP_BEFORE_DATE to cap to a specific trip.
  const afterMs  = process.env.TRIP_AFTER_DATE  ? new Date(process.env.TRIP_AFTER_DATE).getTime()  : null;
  const beforeMs = process.env.TRIP_BEFORE_DATE ? new Date(process.env.TRIP_BEFORE_DATE).getTime() : null;
  if (afterMs || beforeMs) {
    console.log(`Counting onsens uploaded after ${process.env.TRIP_AFTER_DATE || '(any)'}` +
                ` and before ${process.env.TRIP_BEFORE_DATE || '(any)'}`);
  }
  const ONSEN_RE = /onsen|foot\s*bath|super\s*sento|sento|community\s*center/i;
  let onsensCount = 0;
  for (const p of points) {
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

  const clustersByZoom = buildServerClusterLevels(points);
  Object.keys(clustersByZoom).forEach((zoom) => {
    console.log(`Server clusters @ z${zoom}: ${clustersByZoom[zoom].length}`);
  });

  // Serialise to JSON — wrap in an envelope so the client can detect the
  // generation time and query Firestore for only the delta (new points added
  // since the snapshot was taken).
  const generatedAt = new Date().toISOString();
  const json   = JSON.stringify({
    generatedAt,
    points,
    clustersByZoom,
    clusterZoomRange: { min: SERVER_CLUSTER_MIN_ZOOM, max: SERVER_CLUSTER_MAX_ZOOM, disableClusteringAtZoom: SERVER_CLUSTER_DISABLE_ZOOM }
  });
  const buffer = Buffer.from(json, 'utf8');
  console.log(`Snapshot size: ${(buffer.length / 1024).toFixed(1)} KB`);

  // Upload to Firebase Storage
  console.log('Uploading points/points.json to Firebase Storage...');
  const file = bucket.file('points/points.json');
  await file.save(buffer, {
    contentType: 'application/json',
    metadata: {
      cacheControl: 'public, max-age=300'
    }
  });

  // Make the file publicly readable so the browser can fetch it without auth.
  // This works when uniform bucket-level access is disabled (the default for
  // Firebase Storage buckets created before 2023). If your bucket has uniform
  // access enabled, grant the Storage Object Viewer role to allUsers via IAM
  // instead and remove this line.
  try {
    await file.makePublic();
    console.log('File made publicly readable.');
  } catch (err) {
    console.warn(
      'Could not set public ACL (this is fine if uniform bucket-level access is\n' +
      'enabled — ensure allUsers has Storage Object Viewer via IAM instead):\n',
      err.message
    );
  }

  console.log(`Done. ${points.length} point(s) written to points/points.json (generatedAt: ${generatedAt}).`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
