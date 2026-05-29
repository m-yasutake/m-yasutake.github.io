'use strict';

/**
 * fetch-strava-rides.js
 *
 * Fetches recent Strava bike rides, converts them to GPX, and uploads each
 * file to Firebase Storage (gpx/ prefix). A Firestore document is also added
 * to the 'routes' collection so that planning.html displays each ride
 * automatically, and so that the generate-pmtiles workflow can include them
 * in the PMTiles vector-tile overlay. The script also updates Firestore stats
 * docs for trips (stats/japan, stats/norway, etc.) and per-blog-post windows
 * (stats/post_<blogPostId>) based on each post's tripDateFrom/tripDateTo.
 *
 * Required environment variables:
 *   STRAVA_CLIENT_ID      - Strava application Client ID
 *   STRAVA_CLIENT_SECRET  - Strava application Client Secret
 *   STRAVA_REFRESH_TOKEN  - Long-lived OAuth refresh token
 *   FIREBASE_SERVICE_ACCOUNT - JSON string of a Firebase service account key
 *     with Firestore and Storage write permissions.
 *
 * Optional environment variables:
 *   STRAVA_AFTER_DATE  - ISO 8601 date string; only activities after this date
 *                        are fetched (default: 365 days ago). Activities already
 *                        saved in Firestore are always skipped regardless.
 *   STRAVA_BEFORE_DATE - ISO 8601 date string; only activities before this date
 *                        are fetched. Use to cap a finished trip (e.g. '2026-05-28').
 *                        Also limits which routes are summed in stats/japan.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='<json>' \
 *   STRAVA_CLIENT_ID=<id> STRAVA_CLIENT_SECRET=<secret> \
 *   STRAVA_REFRESH_TOKEN=<token> \
 *   node fetch-strava-rides.js
 *
 * When a new ride is saved the script writes `new_rides=<count>` and
 * `has_new_rides=true|false` to $GITHUB_OUTPUT (if that env var is set) so
 * that downstream GitHub Actions jobs can conditionally regenerate map tiles.
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

const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env;
if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
  console.error(
    'Error: Missing Strava credentials.\n' +
    'Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN.'
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'roots-eddf5.firebasestorage.app'
});

const db     = admin.firestore();
const bucket = admin.storage().bucket();

// Strava sport_type values treated as outdoor bike rides.
// (The legacy 'type' field is deprecated; sport_type is the current field.)
const RIDE_SPORT_TYPES = new Set([
  'Ride',
  'MountainBikeRide',
  'GravelRide',
  'EBikeRide',
  'EMountainBikeRide',
  'Handcycle',
  'Velomobile'
]);

// ── Strava API helpers ────────────────────────────────────────────────────────

/**
 * Exchange the long-lived refresh token for a short-lived access token.
 * Strava access tokens expire after 6 hours; the refresh token is reusable.
 */
async function refreshStravaToken() {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: STRAVA_REFRESH_TOKEN,
      grant_type:    'refresh_token'
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token refresh failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  console.log(`Access token obtained (expires ${new Date(data.expires_at * 1000).toISOString()}).`);
  return data.access_token;
}

/**
 * Fetch all athlete activities between `afterTimestamp` and `beforeTimestamp`
 * (Unix seconds). Paginates automatically using Strava's maximum page size of 200.
 */
async function fetchActivities(accessToken, afterTimestamp, beforeTimestamp) {
  const activities = [];
  let page = 1;
  const PER_PAGE = 200;

  while (true) {
    const url = new URL('https://www.strava.com/api/v3/athlete/activities');
    url.searchParams.set('after',    afterTimestamp);
    if (beforeTimestamp) url.searchParams.set('before', beforeTimestamp);
    url.searchParams.set('per_page', PER_PAGE);
    url.searchParams.set('page',     page);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Strava activities fetch failed (${res.status}): ${text}`);
    }
    const batch = await res.json();
    activities.push(...batch);
    if (batch.length < PER_PAGE) break;
    page++;
  }
  return activities;
}

/**
 * Fetch latlng, altitude, and time streams for a single activity.
 * Returns the raw Strava streams response object keyed by stream type.
 */
async function fetchActivityStreams(accessToken, activityId) {
  const url = new URL(`https://www.strava.com/api/v3/activities/${activityId}/streams`);
  url.searchParams.set('keys',        'latlng,altitude,time');
  url.searchParams.set('key_by_type', 'true');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava streams fetch failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── GPX generation ────────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

/**
 * Build a GPX 1.1 string from a Strava activity summary and its streams.
 * Throws if there are no GPS track points.
 */
function buildGpx(activity, streams) {
  const startTime = new Date(activity.start_date);
  const latlng    = streams.latlng   && streams.latlng.data;
  const altitude  = streams.altitude && streams.altitude.data;
  const timeData  = streams.time     && streams.time.data;

  if (!latlng || latlng.length === 0) {
    throw new Error('No GPS data available (latlng stream is empty or missing)');
  }

  const trkpts = latlng.map((ll, i) => {
    const lat = ll[0].toFixed(7);
    const lon = ll[1].toFixed(7);
    let extra = '';
    if (altitude && altitude[i] != null) {
      extra += `\n        <ele>${altitude[i].toFixed(1)}</ele>`;
    }
    if (timeData && timeData[i] != null) {
      const ts = new Date(startTime.getTime() + timeData[i] * 1000);
      extra += `\n        <time>${ts.toISOString()}</time>`;
    }
    return `      <trkpt lat="${lat}" lon="${lon}">${extra}\n      </trkpt>`;
  }).join('\n');

  const name     = escapeXml(activity.name);
  const startIso = startTime.toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${startIso}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <type>cycling</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

/**
 * Return the set of Strava activity IDs already saved in Firestore so we can
 * skip re-uploading rides that exist from a previous run.
 */
async function getExistingStravaIds() {
  const snapshot = await db.collection('routes')
    .where('source', '==', 'strava')
    .get();
  const ids = new Set();
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.stravaActivityId != null) ids.add(data.stravaActivityId);
  });
  return ids;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Determine date window
  const afterDate = process.env.STRAVA_AFTER_DATE
    ? new Date(process.env.STRAVA_AFTER_DATE)
    : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const beforeDate = process.env.STRAVA_BEFORE_DATE
    ? new Date(process.env.STRAVA_BEFORE_DATE)
    : null;
  const afterTimestamp  = Math.floor(afterDate.getTime() / 1000);
  const beforeTimestamp = beforeDate ? Math.floor(beforeDate.getTime() / 1000) : null;
  console.log(`Fetching Strava activities after ${afterDate.toISOString()}${
    beforeDate ? ' and before ' + beforeDate.toISOString() : ''}`);

  // Obtain a short-lived access token
  const accessToken = await refreshStravaToken();

  // Fetch the athlete's activity list
  console.log('Fetching Strava activities...');
  const all        = await fetchActivities(accessToken, afterTimestamp, beforeTimestamp);
  const rideOnly   = all.filter(a => RIDE_SPORT_TYPES.has(a.sport_type));
  console.log(`Found ${rideOnly.length} ride(s) of ${all.length} total activities.`);

  if (rideOnly.length === 0) {
    console.log('No rides found.');
    await updateStatsDocument();
    writeGithubOutput(0);
    return;
  }

  // Skip rides already saved to Firestore
  const existingIds = await getExistingStravaIds();
  console.log(`${existingIds.size} ride(s) already saved in Firestore.`);
  const newRides = rideOnly.filter(a => !existingIds.has(a.id));
  console.log(`${newRides.length} new ride(s) to process.`);

  if (newRides.length === 0) {
    console.log('No new rides to save.');
    await updateStatsDocument();
    writeGithubOutput(0);
    return;
  }

  let savedCount   = 0;
  let skippedCount = 0;

  for (const activity of newRides) {
    const activityId   = activity.id;
    const activityName = activity.name || `Ride ${activityId}`;
    const startDate    = new Date(activity.start_date);
    const datePart     = startDate.toISOString().slice(0, 10); // YYYY-MM-DD
    // Build a safe, human-readable file name
    const safeName    = activityName.replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 50);
    const fileName    = `strava_${activityId}_${datePart}_${safeName}.gpx`;
    const storagePath = `gpx/${fileName}`;

    console.log(`\nProcessing: [${activityId}] "${activityName}" (${datePart})`);

    // Fetch GPS streams from Strava
    let streams;
    try {
      streams = await fetchActivityStreams(accessToken, activityId);
    } catch (err) {
      console.warn(`  Skipping: could not fetch streams — ${err.message}`);
      skippedCount++;
      continue;
    }

    // Convert streams to GPX
    let gpxText;
    try {
      gpxText = buildGpx(activity, streams);
    } catch (err) {
      console.warn(`  Skipping: could not build GPX — ${err.message}`);
      skippedCount++;
      continue;
    }

    const gpxBuffer = Buffer.from(gpxText, 'utf8');
    console.log(`  GPX size: ${(gpxBuffer.length / 1024).toFixed(1)} KB`);

    // Upload GPX file to Firebase Storage
    console.log(`  Uploading to Storage: ${storagePath}`);
    const fileRef = bucket.file(storagePath);
    await fileRef.save(gpxBuffer, {
      contentType: 'application/gpx+xml',
      metadata: { cacheControl: 'public, max-age=3600' }
    });
    try {
      await fileRef.makePublic();
    } catch (err) {
      console.warn(`  Note: could not set public ACL (${err.message})`);
    }

    // Extract start/end GPS coordinates from latlng stream
    const latlngData = streams.latlng && streams.latlng.data;
    const startLatLng = (latlngData && latlngData.length > 0)
      ? [latlngData[0][0], latlngData[0][1]]
      : null;
    const endLatLng = (latlngData && latlngData.length > 0)
      ? [latlngData[latlngData.length - 1][0], latlngData[latlngData.length - 1][1]]
      : null;

    // Build route metadata for Firestore and the map page
    const distanceKm = activity.distance ? (activity.distance / 1000).toFixed(1) : null;
    const metadata = {
      name:      activityName,
      description: [
        `Strava activity on ${datePart}.`,
        distanceKm ? `Distance: ${distanceKm} km.` : null
      ].filter(Boolean).join(' '),
      sourceUrl: `https://www.strava.com/activities/${activityId}`
    };

    // Save Firestore document (same schema as admin-uploaded routes)
    console.log(`  Saving Firestore document...`);
    const elevationGain = typeof activity.total_elevation_gain === 'number'
      ? activity.total_elevation_gain
      : null;
    await db.collection('routes').add({
      fileName,
      storagePath,
      metadata,
      distanceKm:           distanceKm ? parseFloat(distanceKm) : null,
      totalElevationGain:   elevationGain,
      uploadedAt:           admin.firestore.FieldValue.serverTimestamp(),
      activityDate:         admin.firestore.Timestamp.fromDate(new Date(activity.start_date)),
      source:               'strava',
      isOwner:              true,
      stravaActivityId:     activityId,
      startLatLng:          startLatLng,
      endLatLng:            endLatLng
    });

    console.log(`  ✓ Saved: "${activityName}"`);
    savedCount++;
  }

  console.log(`\nDone. Saved ${savedCount} new ride(s), skipped ${skippedCount}.`);
  await updateStatsDocument();
  writeGithubOutput(savedCount);
}

// ── Stats document ────────────────────────────────────────────────────────────

/**
 * Read owner Strava routes and recompute:
 *   - per-post stats documents (stats/post_<blogPostId>)
 *   - per-category totals in stats/<category> for home-page counters
 *
 * Uses { merge: true } so onsensCount (written by generate-points-snapshot.js)
 * on stats/japan is preserved.
 */
function parseYmdToUtcMs(ymd, endOfDay = false) {
  if (!ymd) return null;
  return new Date(`${ymd}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).getTime();
}

function computeStatsForRoutes(routes) {
  let totalDistanceKm    = 0;
  let totalElevationGain = 0;
  let latestTs           = -Infinity;
  let latestRouteData    = null;

  routes.forEach(route => {
    if (typeof route.distanceKm === 'number')         totalDistanceKm    += route.distanceKm;
    if (typeof route.totalElevationGain === 'number') totalElevationGain += route.totalElevationGain;
    if (route.endLatLng) {
      const ts = route.activityDate ? route.activityDate.toMillis()
               : (route.uploadedAt && route.uploadedAt.seconds) ? route.uploadedAt.seconds * 1000 : 0;
      if (ts > latestTs) { latestTs = ts; latestRouteData = route; }
    }
  });

  const stats = {
    totalDistanceKm:    Math.round(totalDistanceKm * 10) / 10,
    totalElevationGain: Math.round(totalElevationGain),
    rideCount:          routes.length,
    statsUpdatedAt:     admin.firestore.FieldValue.serverTimestamp(),
  };
  if (latestRouteData) {
    stats.currentPosition  = latestRouteData.endLatLng;
    stats.currentRouteName = (latestRouteData.metadata && latestRouteData.metadata.name)
      || latestRouteData.fileName || 'Latest ride';
  }
  return stats;
}

// ── Per-post route cache ──────────────────────────────────────────────────────

/**
 * Haversine great-circle distance in km.
 */
function haversineKm(la1, lo1, la2, lo2) {
  const R    = 6371;
  const dLat = (la2 - la1) * Math.PI / 180;
  const dLon = (lo2 - lo1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) *
               Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetch GPX files for `matchingRoutes`, downsample the polylines, compute a
 * cumulative elevation profile, then upload a compact JSON cache to Firebase
 * Storage at `post-routes/post_<postId>.json`.
 *
 * Cache schema:
 *   { totalDistanceKm, totalElevationGain, rideCount,
 *     bounds: [[minLat,minLng],[maxLat,maxLng]],
 *     firstPoint: [lat,lng], lastPoint: [lat,lng],
 *     routes: [{ date, pts: [[lat,lng],...], eles: [m|null,...] }],
 *     elevationProfile: [{ dist: km, ele: m }, ...],
 *     generatedAt: ISO string }
 */
async function generatePostRouteCache(post, matchingRoutes) {
  const BUCKET            = 'roots-eddf5.firebasestorage.app';
  const MAX_PTS_PER_ROUTE = 300;  // max trackpoints per route after downsampling
  const MAX_ELEV_PTS      = 600;  // max elevation profile points total

  if (!matchingRoutes || matchingRoutes.length === 0) return;

  // Sort chronologically so first/last markers are correct
  const sorted = [...matchingRoutes].sort((a, b) => (a.activityMs || 0) - (b.activityMs || 0));

  let totalDistanceKm    = 0;
  let totalElevationGain = 0;
  let minLat = Infinity,  maxLat = -Infinity;
  let minLng = Infinity,  maxLng = -Infinity;
  let firstPoint = null,  lastPoint = null;
  const cacheRoutes    = [];
  const rawElevProfile = [];  // full-resolution { dist, ele }
  let cumDistGlobal    = 0;

  for (const route of sorted) {
    if (!route.storagePath) continue;

    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/` +
                `${encodeURIComponent(route.storagePath)}?alt=media`;

    let pts = [], eles = [];
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`    GPX fetch failed (${res.status}) for ${route.storagePath}`);
        continue;
      }
      const gpxText = await res.text();

      // Parse trkpt elements with a regex (no DOM available in Node)
      const trkptRe = /<trkpt([^>]*)>([\s\S]*?)<\/trkpt>/g;
      let m;
      while ((m = trkptRe.exec(gpxText)) !== null) {
        const latM = m[1].match(/lat="([^"]+)"/);
        const lonM = m[1].match(/lon="([^"]+)"/);
        if (!latM || !lonM) continue;
        const lat = parseFloat(latM[1]);
        const lon = parseFloat(lonM[1]);
        if (isNaN(lat) || isNaN(lon)) continue;
        pts.push([lat, lon]);
        const eleM = m[2].match(/<ele>([^<]+)<\/ele>/);
        eles.push(eleM ? parseFloat(eleM[1]) : null);
      }
    } catch (err) {
      console.warn(`    Could not process GPX for route ${route.id}: ${err.message}`);
      continue;
    }

    if (pts.length === 0) continue;

    // Accumulate distance + elevation gain at full resolution
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) {
        const seg = haversineKm(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]);
        totalDistanceKm += seg;
        cumDistGlobal   += seg;
        if (eles[i] != null && eles[i-1] != null && eles[i] > eles[i-1]) {
          totalElevationGain += eles[i] - eles[i-1];
        }
      }
      if (eles[i] != null) rawElevProfile.push({ dist: cumDistGlobal, ele: eles[i] });
      if (pts[i][0] < minLat) minLat = pts[i][0];
      if (pts[i][0] > maxLat) maxLat = pts[i][0];
      if (pts[i][1] < minLng) minLng = pts[i][1];
      if (pts[i][1] > maxLng) maxLng = pts[i][1];
    }

    if (!firstPoint) firstPoint = pts[0];
    lastPoint = pts[pts.length - 1];

    // Downsample to at most MAX_PTS_PER_ROUTE points, always keeping the last
    const step = Math.max(1, Math.ceil(pts.length / MAX_PTS_PER_ROUTE));
    const indices = new Set();
    for (let i = 0; i < pts.length; i += step) indices.add(i);
    indices.add(pts.length - 1);
    const sPts = [], sEles = [];
    for (const i of [...indices].sort((a, b) => a - b)) {
      sPts.push([Math.round(pts[i][0] * 1e5) / 1e5, Math.round(pts[i][1] * 1e5) / 1e5]);
      sEles.push(eles[i] != null ? Math.round(eles[i]) : null);
    }

    const dateStr = route.activityMs
      ? new Date(route.activityMs).toISOString().slice(0, 10)
      : null;
    cacheRoutes.push({ date: dateStr, pts: sPts, eles: sEles });
  }

  if (cacheRoutes.length === 0) {
    console.log(`  No valid GPX data for post ${post.id}, skipping cache.`);
    return;
  }

  // Downsample elevation profile to MAX_ELEV_PTS points
  let elevProfile = rawElevProfile;
  if (rawElevProfile.length > MAX_ELEV_PTS) {
    const step = Math.ceil(rawElevProfile.length / MAX_ELEV_PTS);
    elevProfile = rawElevProfile.filter((_, i) =>
      i === 0 || i === rawElevProfile.length - 1 || i % step === 0
    );
  }
  elevProfile = elevProfile.map(p => ({
    dist: Math.round(p.dist * 10) / 10,
    ele:  Math.round(p.ele)
  }));

  const bounds = minLat < Infinity
    ? [[Math.round(minLat * 1e5) / 1e5, Math.round(minLng * 1e5) / 1e5],
       [Math.round(maxLat * 1e5) / 1e5, Math.round(maxLng * 1e5) / 1e5]]
    : null;

  const cacheDoc = {
    totalDistanceKm:    Math.round(totalDistanceKm * 10) / 10,
    totalElevationGain: Math.round(totalElevationGain),
    rideCount:          cacheRoutes.length,
    bounds,
    firstPoint: firstPoint
      ? [Math.round(firstPoint[0] * 1e5) / 1e5, Math.round(firstPoint[1] * 1e5) / 1e5]
      : null,
    lastPoint: lastPoint
      ? [Math.round(lastPoint[0] * 1e5) / 1e5, Math.round(lastPoint[1] * 1e5) / 1e5]
      : null,
    routes:           cacheRoutes,
    elevationProfile: elevProfile,
    generatedAt:      new Date().toISOString()
  };

  const storagePath = `post-routes/post_${post.id}.json`;
  const jsonBuffer  = Buffer.from(JSON.stringify(cacheDoc), 'utf8');
  console.log(`  Uploading ${storagePath} ` +
    `(${(jsonBuffer.length / 1024).toFixed(1)} KB, ${cacheRoutes.length} route(s), ` +
    `${Math.round(totalDistanceKm)} km)...`);

  const fileRef = bucket.file(storagePath);
  await fileRef.save(jsonBuffer, {
    contentType: 'application/json',
    metadata:    { cacheControl: 'public, max-age=3600' }
  });
  try {
    await fileRef.makePublic();
  } catch (err) {
    console.warn(`  Note: could not set public ACL (${err.message})`);
  }
  console.log(`  ✓ post-routes/post_${post.id}.json saved`);
}

async function updateStatsDocument() {
  console.log('\nRecomputing trip/post stats from Firestore routes...');
  const routesSnap = await db.collection('routes')
    .where('isOwner', '==', true)
    .where('source', '==', 'strava')
    .get();

  const routes = [];
  routesSnap.forEach(doc => {
    const d = doc.data();
    const activityMs = d.activityDate ? d.activityDate.toMillis() : null;
    routes.push({
      id: doc.id,
      ...d,
      activityMs
    });
  });

  const postsSnap = await db.collection('blog_posts').get();
  const posts = [];
  postsSnap.forEach(doc => {
    const d = doc.data();
    if (!d || !d.tripDateFrom || !d.tripDateTo) return;
    const fromMs = parseYmdToUtcMs(d.tripDateFrom, false);
    const toMs   = parseYmdToUtcMs(d.tripDateTo, true);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) return;
    posts.push({
      id: doc.id,
      category: d.category || 'japan',
      tripDateFrom: d.tripDateFrom,
      tripDateTo: d.tripDateTo,
      fromMs,
      toMs
    });
  });

  const categoryRouteIds = new Map();
  for (const post of posts) {
    const postRoutes = routes.filter(r => r.activityMs !== null && r.activityMs >= post.fromMs && r.activityMs <= post.toMs);
    const postStats = computeStatsForRoutes(postRoutes);
    await db.collection('stats').doc(`post_${post.id}`).set({
      ...postStats,
      category: post.category,
      tripDateFrom: post.tripDateFrom,
      tripDateTo: post.tripDateTo
    }, { merge: true });
    console.log(`  ✓ stats/post_${post.id} updated (${postStats.rideCount} rides)`);
    await generatePostRouteCache(post, postRoutes);

    if (!categoryRouteIds.has(post.category)) categoryRouteIds.set(post.category, new Set());
    const categorySet = categoryRouteIds.get(post.category);
    postRoutes.forEach(route => categorySet.add(route.id));
  }

  // Fallback to env date window for Japan when no category routes were inferred.
  if (!categoryRouteIds.has('japan') || categoryRouteIds.get('japan').size === 0) {
    const afterMs  = process.env.STRAVA_AFTER_DATE  ? new Date(process.env.STRAVA_AFTER_DATE).getTime()  : null;
    const beforeMs = process.env.STRAVA_BEFORE_DATE ? new Date(process.env.STRAVA_BEFORE_DATE).getTime() : null;
    const fallbackJapan = routes.filter(r => {
      if (r.activityMs === null) return true;
      if (afterMs && r.activityMs < afterMs) return false;
      if (beforeMs && r.activityMs > beforeMs) return false;
      return true;
    });
    categoryRouteIds.set('japan', new Set(fallbackJapan.map(r => r.id)));
  }

  for (const [category, ids] of categoryRouteIds.entries()) {
    const categoryRoutes = routes.filter(r => ids.has(r.id));
    const stats = computeStatsForRoutes(categoryRoutes);
    await db.collection('stats').doc(category).set(stats, { merge: true });
    console.log(`  ✓ stats/${category} totalDistanceKm    = ${stats.totalDistanceKm} km`);
    console.log(`  ✓ stats/${category} totalElevationGain = ${stats.totalElevationGain} m`);
    if (stats.currentPosition) {
      console.log(`  ✓ stats/${category} currentPosition    = [${stats.currentPosition}] (${stats.currentRouteName})`);
    }
  }
}

/** Write job outputs for downstream GitHub Actions steps. */
function writeGithubOutput(savedCount) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `new_rides=${savedCount}\nhas_new_rides=${savedCount > 0 ? 'true' : 'false'}\n`
    );
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
