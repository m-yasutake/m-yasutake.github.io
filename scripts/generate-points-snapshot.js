'use strict';

/**
 * generate-points-snapshot.js
 *
 * Downloads all point documents from the Firestore 'points' collection and
 * writes them as a single JSON array to Firebase Storage at
 * points/points.json. The planning.html map page fetches this file on load
 * instead of paginating through Firestore, reducing initial load time from
 * 10+ network round-trips to a single cached HTTP request.
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
        fileName: d.fileName || null
      });
    });

    console.log(`  Fetched ${points.length} point(s) so far...`);

    if (snapshot.size < BATCH) break;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  console.log(`Total: ${points.length} point(s).`);

  // Serialise to JSON
  const json   = JSON.stringify(points);
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

  console.log(`Done. ${points.length} point(s) written to points/points.json.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
