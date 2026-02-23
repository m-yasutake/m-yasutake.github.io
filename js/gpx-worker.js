/* gpx-worker.js — Parses GPX text and computes route stats off the main thread.
 * Receives: { id, gpxText }
 * Sends back: { id, latlngs, stats, name }  or  { id, error }
 */

function parseGPX(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const pts = [];
  doc.querySelectorAll('trkpt, rtept').forEach(function(pt) {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    const eleEl = pt.querySelector('ele');
    const ele = eleEl ? parseFloat(eleEl.textContent) : null;
    if (!isNaN(lat) && !isNaN(lon)) pts.push({ lat: lat, lon: lon, ele: ele });
  });
  const nameEl = doc.querySelector('trk > name, rte > name, metadata > name');
  return { points: pts, name: nameEl ? nameEl.textContent : null };
}

function computeStats(pts) {
  let distance = 0, elevGain = 0, elevLoss = 0, minEle = Infinity, maxEle = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].ele !== null) { minEle = Math.min(minEle, pts[i].ele); maxEle = Math.max(maxEle, pts[i].ele); }
    if (i === 0) continue;
    const R = 6371000;
    const dLat = (pts[i].lat - pts[i-1].lat) * Math.PI / 180;
    const dLon = (pts[i].lon - pts[i-1].lon) * Math.PI / 180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) +
              Math.cos(pts[i-1].lat*Math.PI/180)*Math.cos(pts[i].lat*Math.PI/180)*
              Math.sin(dLon/2)*Math.sin(dLon/2);
    distance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    if (pts[i].ele !== null && pts[i-1].ele !== null) {
      const diff = pts[i].ele - pts[i-1].ele;
      if (diff > 0) elevGain += diff; else elevLoss += Math.abs(diff);
    }
  }
  return {
    distanceKm: (distance/1000).toFixed(1),
    elevGain: Math.round(elevGain),
    elevLoss: Math.round(elevLoss),
    minEle: minEle === Infinity ? '—' : Math.round(minEle),
    maxEle: maxEle === -Infinity ? '—' : Math.round(maxEle)
  };
}

self.onmessage = function(e) {
  const id = e.data.id;
  const gpxText = e.data.gpxText;
  try {
    const parsed = parseGPX(gpxText);
    const pts = parsed.points;
    const name = parsed.name;
    const latlngs = pts.map(function(p) { return [p.lat, p.lon]; });
    const stats = computeStats(pts);
    self.postMessage({ id: id, latlngs: latlngs, stats: stats, name: name });
  } catch (err) {
    self.postMessage({ id: id, error: err.message || String(err) });
  }
};
