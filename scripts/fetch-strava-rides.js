'use strict';

/**
 * fetch-strava-rides.js
 *
 * Fetches recent Strava bike rides, converts them to GPX, and uploads each
 * file to Firebase Storage (gpx/ prefix). A Firestore document is also added
 * to the 'routes' collection so that planning.html displays each ride
 * automatically, and so that the generate-pmtiles workflow can include them
 * in the PMTiles vector-tile overlay.
 *
 * Required environment variables:
 *   STRAVA_CLIENT_ID      - Strava application Client ID
 *   STRAVA_CLIENT_SECRET  - Strava application Client Secret
 *   STRAVA_REFRESH_TOKEN  - Long-lived OAuth refresh token
 *   FIREBASE_SERVICE_ACCOUNT - JSON string of a Firebase service account key
 *     with Firestore and Storage write permissions.
 *
 * Optional environment variables:
 *   STRAVA_AFTER_DATE - ISO 8601 date string; only activities after this date
 *                       are fetched (default: 365 days ago). Activities already
 *                       saved in Firestore are always skipped regardless.
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
 * Fetch all athlete activities after `afterTimestamp` (Unix seconds).
 * Paginates automatically using Strava's maximum page size of 200.
 */
async function fetchActivities(accessToken, afterTimestamp) {
  const activities = [];
  let page = 1;
  const PER_PAGE = 200;

  while (true) {
    const url = new URL('https://www.strava.com/api/v3/athlete/activities');
    url.searchParams.set('after',    afterTimestamp);
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
  // Determine lookback window (default: 365 days ago)
  const afterDate = process.env.STRAVA_AFTER_DATE
    ? new Date(process.env.STRAVA_AFTER_DATE)
    : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const afterTimestamp = Math.floor(afterDate.getTime() / 1000);
  console.log(`Fetching Strava activities after ${afterDate.toISOString()}`);

  // Obtain a short-lived access token
  const accessToken = await refreshStravaToken();

  // Fetch the athlete's activity list
  console.log('Fetching Strava activities...');
  const all        = await fetchActivities(accessToken, afterTimestamp);
  const rideOnly   = all.filter(a => RIDE_SPORT_TYPES.has(a.sport_type));
  console.log(`Found ${rideOnly.length} ride(s) of ${all.length} total activities.`);

  if (rideOnly.length === 0) {
    console.log('No rides found. Exiting.');
    writeGithubOutput(0);
    return;
  }

  // Skip rides already saved to Firestore
  const existingIds = await getExistingStravaIds();
  console.log(`${existingIds.size} ride(s) already saved in Firestore.`);
  const newRides = rideOnly.filter(a => !existingIds.has(a.id));
  console.log(`${newRides.length} new ride(s) to process.`);

  if (newRides.length === 0) {
    console.log('No new rides to save. Exiting.');
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
      source:               'strava',
      isOwner:              true,
      stravaActivityId:     activityId
    });

    console.log(`  ✓ Saved: "${activityName}"`);
    savedCount++;
  }

  console.log(`\nDone. Saved ${savedCount} new ride(s), skipped ${skippedCount}.`);
  writeGithubOutput(savedCount);
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
