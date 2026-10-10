// js/admin/shelter-picker.js — Shelter Picker Admin section of admin.html: an
// embedded Leaflet map limited to Norway's hut/shelter-type points, for
// toggling the `visited` flag, with an optional Strava-route overlay.
// Mirrors js/admin/onsen-picker.js (see that file's header for the rationale
// behind reading from a static points snapshot instead of a live Firestore
// collection read).
//
// Only counts the manually-catalogued hut/shelter points in
// assets/norway-points.json (open shelters, lean-tos, DNT huts, day huts,
// rock shelters/caves) — never the ~2,600 generic OSM "Public Shelter"
// facilities in assets/norway-facilities.json, which are bus-stop-style
// shelters scattered across all of Norway, not stops on our route.

(function () {
  'use strict';

  const SHELTER_TYPE_RE = /shelter|lean.?to|dnt|hut|gapahuk|cave/i;
  const STRAVA_BUCKET = 'roots-eddf5.firebasestorage.app';
  const STRAVA_ROUTE_COLOR = '#E76F51';
  const POINTS_SNAPSHOT_URL = 'assets/norway-points.json';
  let _shelterMap = null;
  let _shelterCluster = null; // L.markerClusterGroup
  let _shelterMarkers = []; // { docId, marker, visited }
  let _shelterDb = null;
  let _stravaRouteLayer = null;
  let _stravaRoutesLoading = false;
  let _leafletAssetsPromise = null;

  // ── Lazy-load Leaflet + Leaflet.markercluster (JS + CSS) ─────
  function loadScript(src, integrity) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      if (integrity) { s.integrity = integrity; s.crossOrigin = ''; }
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  function loadStylesheet(href, integrity) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    if (integrity) { link.integrity = integrity; link.crossOrigin = ''; }
    document.head.appendChild(link);
  }

  function loadLeafletAssets() {
    if (_leafletAssetsPromise) return _leafletAssetsPromise;
    if (typeof L !== 'undefined' && L.markerClusterGroup) return (_leafletAssetsPromise = Promise.resolve());

    loadStylesheet('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=');
    loadStylesheet('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css');
    loadStylesheet('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css');

    // markercluster extends the L global, so it must load strictly after leaflet.js.
    _leafletAssetsPromise = loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=')
      .then(() => loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'));
    return _leafletAssetsPromise;
  }

  const VISITED_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28">',
    '<circle cx="14" cy="14" r="12" fill="#2a9d8f" stroke="#fff" stroke-width="1.5"/>',
    '<path d="M9 17V11l5-3 5 3v6H9z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>',
    '<circle cx="21" cy="21" r="6" fill="#e9c46a" stroke="#fff" stroke-width="1.2"/>',
    '<path d="M18.5 21l1.5 1.5L23 18.5" fill="none" stroke="#264653" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    '</svg>'
  ].join('');

  const NOT_VISITED_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">',
    '<circle cx="12" cy="12" r="10" fill="#e74c3c" stroke="#fff" stroke-width="1.5"/>',
    '<path d="M7 15V9l5-3 5 3v6H7z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>',
    '</svg>'
  ].join('');

  function makeIcon(visited) {
    const svg = visited ? VISITED_SVG : NOT_VISITED_SVG;
    const size = visited ? [28, 28] : [24, 24];
    const anchor = visited ? [14, 14] : [12, 12];
    return L.divIcon({
      html: svg,
      className: '',
      iconSize: size,
      iconAnchor: anchor,
      popupAnchor: [0, -anchor[1] - 4]
    });
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str == null ? '' : str);
    return d.innerHTML;
  }

  function buildPopupHtml(name, type, visited, docId) {
    const statusText = visited ? '✅ Visited' : '⬜ Not visited';
    const btnLabel   = visited ? '✕ Mark as not visited' : '✓ Mark as visited';
    const btnStyle   = visited
      ? 'background:#fee;color:#c0392b;border:1px solid #fcc;'
      : 'background:#e8f7f5;color:#2a9d8f;border:1px solid #b2dfdb;';
    return '<div style="min-width:180px">' +
      '<strong style="font-size:.95em;color:var(--color-primary)">' + esc(name) + '</strong>' +
      '<div style="font-size:.78em;color:#888;margin:.2em 0">' + esc(type) + '</div>' +
      '<div style="font-size:.82em;margin:.35em 0">' + statusText + '</div>' +
      '<button data-docid="' + esc(docId) + '" class="shelter-toggle-btn" ' +
        'style="margin-top:.4em;padding:.3em .7em;border-radius:4px;cursor:pointer;font-size:.8em;font-family:inherit;' + btnStyle + '">' +
        btnLabel + '</button>' +
      '</div>';
  }

  function ensureShelterDb() {
    if (_shelterDb) return Promise.resolve(_shelterDb);
    _shelterDb = _getAdminDb();
    return Promise.resolve(_shelterDb);
  }

  window.loadShelterPickerMap = async function () {
    const btn      = document.getElementById('shelter-picker-load-btn');
    const statusEl = document.getElementById('shelter-picker-status');
    const mapDiv   = document.getElementById('shelter-picker-map');
    const legendEl = document.getElementById('shelter-picker-legend');
    if (!btn || !mapDiv) return;

    btn.disabled = true;
    btn.textContent = '⏳ Loading…';
    statusEl.textContent = '';

    try {
      const db = await ensureShelterDb();
      await loadLeafletAssets();

      // Show the map container
      mapDiv.style.display = 'block';
      if (legendEl) legendEl.style.display = 'flex';

      // Show the Strava routes toggle button
      const stravaBtn = document.getElementById('shelter-strava-toggle-btn');
      if (stravaBtn) stravaBtn.style.display = '';

      // Initialise Leaflet map once
      if (!_shelterMap) {
        _shelterMap = L.map('shelter-picker-map', { zoomControl: true })
          .setView([65, 13], 4);
        L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
          { attribution: '&copy; Esri', maxZoom: 19 }
        ).addTo(_shelterMap);
        L.control.scale({ position: 'bottomright', imperial: false }).addTo(_shelterMap);
        _shelterCluster = L.markerClusterGroup({
          maxClusterRadius: function (zoom) {
            if (zoom >= 10) return 0;
            return Math.max(0, 80 - (zoom * 4));
          },
          disableClusteringAtZoom: 10,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true,
          chunkedLoading: true,
          chunkInterval: 100,
          chunkDelay: 20
        });
        _shelterCluster.addTo(_shelterMap);
      }

      // Invalidate size after the container becomes visible
      setTimeout(() => _shelterMap.invalidateSize(), 120);

      // Clear existing markers
      _shelterCluster.clearLayers();
      _shelterMarkers = [];

      // Fetch shelter/hut-type points from the static snapshot (same file the
      // public Norway map reads) instead of a live full-collection Firestore read.
      const snapshotRes = await fetch(POINTS_SNAPSHOT_URL, { cache: 'default' });
      if (!snapshotRes.ok) throw new Error('HTTP ' + snapshotRes.status + ' loading ' + POINTS_SNAPSHOT_URL);
      const snapshotData = await snapshotRes.json();
      const snapshotPoints = Array.isArray(snapshotData.points) ? snapshotData.points : [];
      const snapshotGeneratedAt = snapshotData.generatedAt || null;

      let count = 0;
      const bounds = [];
      const newMarkers = [];

      snapshotPoints.forEach(d => {
        if (!d.id || typeof d.lat !== 'number' || typeof d.lon !== 'number') return;
        const rawType = (d.metadata && (d.metadata.Type || d.metadata.type)) || d.type || '';
        if (!SHELTER_TYPE_RE.test(rawType)) return;

        const visited = !!d.visited;
        const marker = L.marker([d.lat, d.lon], { icon: makeIcon(visited) });
        const name = d.name || 'Shelter';

        marker.bindPopup(buildPopupHtml(name, rawType, visited, d.id), { maxWidth: 260 });

        marker.on('popupopen', function () {
          const popupEl = marker.getPopup().getElement();
          if (!popupEl) return;
          const toggleBtn = popupEl.querySelector('.shelter-toggle-btn');
          if (!toggleBtn) return;
          toggleBtn.addEventListener('click', function () {
            const docId = toggleBtn.getAttribute('data-docid');
            const entry = _shelterMarkers.find(m => m.docId === docId);
            if (!entry) return;
            const newVisited = !entry.visited;
            toggleBtn.disabled = true;
            toggleBtn.textContent = 'Saving…';
            db.collection('points').doc(docId).update({ visited: newVisited })
              .then(() => {
                entry.visited = newVisited;
                entry.marker.setIcon(makeIcon(newVisited));
                entry.marker.setPopupContent(buildPopupHtml(name, rawType, newVisited, docId));
                marker.closePopup();
                const label = newVisited ? 'marked as visited' : 'marked as not visited';
                if (typeof TomikaBikes !== 'undefined' && TomikaBikes.showToast) {
                  TomikaBikes.showToast(name + ' ' + label, 'success');
                }
              })
              .catch(err => {
                toggleBtn.disabled = false;
                toggleBtn.textContent = newVisited ? '✓ Mark as visited' : '✕ Mark as not visited';
                if (typeof TomikaBikes !== 'undefined' && TomikaBikes.showToast) {
                  TomikaBikes.showToast('Failed: ' + err.message, 'error');
                }
              });
          });
        });

        newMarkers.push(marker);
        _shelterMarkers.push({ docId: d.id, marker, visited });
        bounds.push([d.lat, d.lon]);
        count++;
      });

      // Add all markers to the cluster group in one batch for efficiency
      _shelterCluster.addLayers(newMarkers);

      if (bounds.length > 0) {
        _shelterMap.fitBounds(bounds, { padding: [40, 40] });
      }

      const visitedCount = _shelterMarkers.filter(m => m.visited).length;
      const asOf = snapshotGeneratedAt ? ' — snapshot from ' + new Date(snapshotGeneratedAt).toLocaleString() : '';
      statusEl.textContent = '✓ Loaded ' + count + ' shelter point' + (count !== 1 ? 's' : '') +
        ' (' + visitedCount + ' visited)' + asOf;
      btn.textContent = '🔄 Refresh';
      btn.disabled = false;
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      btn.textContent = '🗺️ Open Shelter Map';
      btn.disabled = false;
      console.error('Shelter picker error:', err);
    }
  };

  window.toggleShelterStravaRoutes = async function () {
    const btn = document.getElementById('shelter-strava-toggle-btn');
    const legendEntry = document.getElementById('shelter-strava-legend');
    if (!btn || !_shelterMap) return;

    // Toggle off if already shown
    if (_stravaRouteLayer && _shelterMap.hasLayer(_stravaRouteLayer)) {
      _shelterMap.removeLayer(_stravaRouteLayer);
      btn.textContent = '🚴 Show Strava Routes';
      if (legendEntry) legendEntry.style.display = 'none';
      return;
    }

    // Toggle on if already loaded but hidden
    if (_stravaRouteLayer) {
      _stravaRouteLayer.addTo(_shelterMap);
      btn.textContent = '🚴 Hide Strava Routes';
      if (legendEntry) legendEntry.style.display = '';
      return;
    }

    // First-time load
    if (_stravaRoutesLoading) return;
    _stravaRoutesLoading = true;
    btn.disabled = true;
    btn.textContent = '⏳ Loading routes…';

    try {
      const db = await ensureShelterDb();
      const snap = await db.collection('routes').where('source', '==', 'strava').get();
      const routes = [];
      snap.forEach(doc => {
        const d = doc.data();
        if (d.storagePath) routes.push(d);
      });

      _stravaRouteLayer = L.layerGroup();

      if (routes.length === 0) {
        _stravaRouteLayer.addTo(_shelterMap);
        btn.disabled = false;
        btn.textContent = '🚴 No routes found';
        _stravaRoutesLoading = false;
        return;
      }

      let pending = routes.length;
      let loaded = 0;

      routes.forEach(route => {
        const url = `https://firebasestorage.googleapis.com/v0/b/${STRAVA_BUCKET}/o/${encodeURIComponent(route.storagePath)}?alt=media`;
        fetch(url)
          .then(res => res.ok ? res.text() : Promise.reject(new Error('HTTP ' + res.status)))
          .then(gpxText => {
            const pts = [];
            try {
              const gpxDoc = (new DOMParser()).parseFromString(gpxText, 'application/xml');
              gpxDoc.querySelectorAll('trkpt').forEach(tp => {
                const lat = parseFloat(tp.getAttribute('lat'));
                const lon = parseFloat(tp.getAttribute('lon'));
                if (!isNaN(lat) && !isNaN(lon)) pts.push([lat, lon]);
              });
            } catch (e) {
              (gpxText.match(/<trkpt[^>]*>/g) || []).forEach(tag => {
                const latM = tag.match(/lat="([^"]+)"/);
                const lonM = tag.match(/lon="([^"]+)"/);
                if (latM && lonM) pts.push([parseFloat(latM[1]), parseFloat(lonM[1])]);
              });
            }
            if (pts.length > 0) {
              L.polyline(pts, { color: STRAVA_ROUTE_COLOR, weight: 3, opacity: 0.85 }).addTo(_stravaRouteLayer);
              loaded++;
            }
          })
          .catch(err => console.warn('Strava GPX fetch failed:', err))
          .finally(() => {
            if (--pending === 0) {
              _stravaRouteLayer.addTo(_shelterMap);
              btn.disabled = false;
              btn.textContent = '🚴 Hide Strava Routes (' + loaded + ')';
              if (legendEntry) legendEntry.style.display = '';
              _stravaRoutesLoading = false;
            }
          });
      });
    } catch (err) {
      _stravaRoutesLoading = false;
      btn.disabled = false;
      btn.textContent = '🚴 Show Strava Routes';
      console.error('Strava routes load error:', err);
    }
  };
})();
