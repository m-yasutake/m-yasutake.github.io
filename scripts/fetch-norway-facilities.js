'use strict';

/**
 * fetch-norway-facilities.js
 *
 * Queries the Overpass API for drinking water points, public toilets,
 * picnic benches, and public shelters across Norway and writes the results
 * to assets/norway-facilities.json.
 *
 * The output file is loaded by the Norway planning map (planning-norway.html)
 * as a static asset — no runtime API calls needed.
 *
 * Usage:
 *   node fetch-norway-facilities.js
 *
 * No secrets required — Overpass is a public API.
 * Expect the query to take 10–60 seconds to complete.
 */

const path = require('path');
const fs   = require('fs');

// ── Clustering constants (mirrors generate-points-snapshot.js) ────────────────
const MAX_CLUSTER_ITEMS          = 12;
const SERVER_CLUSTER_MIN_ZOOM    = 3;
const SERVER_CLUSTER_MAX_ZOOM    = 7;
const SERVER_CLUSTER_DISABLE_ZOOM = 8;
const BASE_CLUSTER_CELL_SIZE     = 10.0;

function getClusterCellSizeForZoom(zoom) {
  return BASE_CLUSTER_CELL_SIZE / Math.pow(2, Math.max(0, zoom - SERVER_CLUSTER_MIN_ZOOM));
}

function buildServerClustersForZoom(points, zoom) {
  const cellSize = getClusterCellSizeForZoom(zoom);
  const buckets  = new Map();

  for (const p of points) {
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') continue;
    const type   = p.type || 'Other';
    const latKey = Math.round(p.lat / cellSize);
    const lonKey = Math.round(p.lon / cellSize);
    const key    = `${type}:${latKey}:${lonKey}`;
    if (!buckets.has(key)) {
      buckets.set(key, { type, latSum: 0, lonSum: 0, count: 0, items: [], singlePoint: null });
    }
    const bucket = buckets.get(key);
    bucket.latSum += p.lat;
    bucket.lonSum += p.lon;
    bucket.count  += 1;
    if (bucket.count === 1) bucket.singlePoint = p;
    else bucket.singlePoint = null;
    if (bucket.items.length < MAX_CLUSTER_ITEMS) {
      bucket.items.push({ name: p.name || 'Point', url: p.url || null });
    }
  }

  return Array.from(buckets.values()).map(bucket => {
    const count = bucket.count;
    if (count === 1) {
      const s = bucket.singlePoint;
      return { id: s.id || null, name: s.name || 'Point', lat: s.lat, lon: s.lon,
               url: s.url || null, type: s.type || null, metadata: s.metadata || {} };
    }
    return {
      name: `${bucket.type} (${count})`,
      lat:  bucket.latSum / count,
      lon:  bucket.lonSum / count,
      type: bucket.type,
      metadata: { __cluster: { count, items: bucket.items } }
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

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Bounding box covers mainland Norway + Svalbard without needing a slow area lookup.
// Format: south,west,north,east
const BBOX = '57.5,4.0,71.5,31.5';

// Each query is issued separately so that high-volume types (e.g. picnic_table)
// don't cause the combined request to hit the Overpass timeout.
const QUERIES = [
  { label: 'drinking water',  query: `[out:json][timeout:60][bbox:${BBOX}];\nnode[amenity=drinking_water];\nout body;` },
  { label: 'toilets',         query: `[out:json][timeout:60][bbox:${BBOX}];\nnode[amenity=toilets];\nout body;` },
  { label: 'shelters',        query: `[out:json][timeout:60][bbox:${BBOX}];\nnode[amenity=shelter];\nout body;` },
  { label: 'picnic benches',  query: `[out:json][timeout:90][bbox:${BBOX}];\nnode[leisure=picnic_table];\nout body;` },
];

function mapElement(element) {
  const tags    = element.tags || {};
  const amenity = tags.amenity;
  const leisure = tags.leisure;

  let type;
  if (amenity === 'drinking_water') type = 'Drinking Water';
  else if (amenity === 'toilets')   type = 'Public Toilet';
  else if (amenity === 'shelter')   type = 'Public Shelter';
  else if (leisure === 'picnic_table') type = 'Picnic Bench';
  else type = amenity || leisure || 'Other';

  const name = tags.name && tags.name.trim() ? tags.name.trim() : type;

  const descParts = [];
  if (tags.operator)       descParts.push('Operator: ' + tags.operator);
  if (tags.fee)            descParts.push('Fee: ' + tags.fee);
  if (tags.opening_hours)  descParts.push('Hours: ' + tags.opening_hours);
  if (tags.shelter_type)   descParts.push('Type: ' + tags.shelter_type);
  if (tags.access && tags.access !== 'yes' && tags.access !== 'public') {
    descParts.push('Access: ' + tags.access);
  }

  const metadata = {};
  if (amenity) metadata.amenity = amenity;
  if (leisure) metadata.leisure = leisure;
  if (descParts.length) metadata.description = descParts.join(' · ');

  return {
    id:   'node/' + element.id,
    name,
    lat:  element.lat,
    lon:  element.lon,
    type,
    metadata
  };
}

async function fetchQuery({ label, query }) {
  console.log(`Querying Overpass for ${label}…`);
  const res = await fetch(
    OVERPASS_URL + '?data=' + encodeURIComponent(query),
    { headers: { 'User-Agent': 'norway-facilities-fetcher/1.0 (github.com/m-yasutake)' } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Overpass returned HTTP ${res.status} for ${label}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.elements)) {
    throw new Error(`Unexpected Overpass response format for ${label}`);
  }
  return data.elements
    .filter(el => el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number')
    .map(mapElement);
}

async function main() {
  const allPoints = [];
  for (const q of QUERIES) {
    const points = await fetchQuery(q);
    console.log(`  ${q.label}: ${points.length}`);
    allPoints.push(...points);
  }
  const points = allPoints;

  const counts = {};
  points.forEach(p => { counts[p.type] = (counts[p.type] || 0) + 1; });
  console.log('Results:');
  Object.entries(counts).sort().forEach(([type, n]) => console.log('  ' + type + ': ' + n));
  console.log('  Total: ' + points.length);

  const clustersByZoom = buildServerClusterLevels(points);
  Object.keys(clustersByZoom).forEach(zoom => {
    console.log('Clusters @ z' + zoom + ': ' + clustersByZoom[zoom].length);
  });

  const generatedAt = new Date().toISOString();
  const json = JSON.stringify({
    generatedAt,
    points,
    clustersByZoom,
    clusterZoomRange: {
      min: SERVER_CLUSTER_MIN_ZOOM,
      max: SERVER_CLUSTER_MAX_ZOOM,
      disableClusteringAtZoom: SERVER_CLUSTER_DISABLE_ZOOM
    }
  }, null, 0);

  const outPath = path.join(__dirname, '..', 'assets', 'norway-facilities.json');
  fs.writeFileSync(outPath, json, 'utf8');
  console.log('Written to ' + outPath + ' (' + (Buffer.byteLength(json) / 1024).toFixed(1) + ' KB)');
  console.log('generatedAt: ' + generatedAt);
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
