'use strict';

/**
 * fetch-norway-facilities.js
 *
 * Queries the Overpass API for drinking water points and public toilets
 * across Norway and writes the results to assets/norway-facilities.json.
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

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Bounding box covers mainland Norway + Svalbard without needing a slow area lookup.
// Format: south,west,north,east
const OVERPASS_QUERY = `
[out:json][timeout:90][bbox:57.5,4.0,71.5,31.5];
(
  node[amenity=drinking_water];
  node[amenity=toilets];
);
out body;
`.trim();

function mapElement(element) {
  const tags    = element.tags || {};
  const amenity = tags.amenity;
  const type    = amenity === 'drinking_water' ? 'Drinking Water' : 'Public Toilet';

  const name = tags.name && tags.name.trim() ? tags.name.trim() : type;

  const descParts = [];
  if (tags.operator)       descParts.push('Operator: ' + tags.operator);
  if (tags.fee)            descParts.push('Fee: ' + tags.fee);
  if (tags.opening_hours)  descParts.push('Hours: ' + tags.opening_hours);
  if (tags.access && tags.access !== 'yes' && tags.access !== 'public') {
    descParts.push('Access: ' + tags.access);
  }

  const metadata = { amenity };
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

async function main() {
  console.log('Querying Overpass API for Norway facilities (this may take up to 60 s)…');

  const res = await fetch(
    OVERPASS_URL + '?data=' + encodeURIComponent(OVERPASS_QUERY),
    { headers: { 'User-Agent': 'norway-facilities-fetcher/1.0 (github.com/m-yasutake)' } }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Overpass returned HTTP ' + res.status + ': ' + text.slice(0, 200));
  }

  const data = await res.json();

  if (!Array.isArray(data.elements)) {
    throw new Error('Unexpected Overpass response format');
  }

  const points = data.elements
    .filter(el => el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number')
    .map(mapElement);

  const counts = {};
  points.forEach(p => { counts[p.type] = (counts[p.type] || 0) + 1; });
  console.log('Results:');
  Object.entries(counts).sort().forEach(([type, n]) => console.log('  ' + type + ': ' + n));
  console.log('  Total: ' + points.length);

  const generatedAt = new Date().toISOString();
  const json = JSON.stringify({ generatedAt, points }, null, 0);

  const outPath = path.join(__dirname, '..', 'assets', 'norway-facilities.json');
  fs.writeFileSync(outPath, json, 'utf8');
  console.log('Written to ' + outPath + ' (' + (Buffer.byteLength(json) / 1024).toFixed(1) + ' KB)');
  console.log('generatedAt: ' + generatedAt);
}

main().catch(err => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
