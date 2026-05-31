// js/japan-map.js — Full interactive map for the Japan trip
// Includes: PMTiles interceptor, Leaflet map + Firebase integration,
// route/point loading, server-side clustered points, filter UI, fullscreen toggle.

// ── PMTiles protocol interceptor ────────────────────────────
(function () {
  var _orig = window.fetch;
  window.__pmtilesInstances = {};
  window.fetch = function pmtilesFetch(resource, options) {
    var u = typeof resource === 'string' ? resource
          : (resource && typeof resource === 'object' ? resource.url : '');
    if (u && u.startsWith('pmtiles://')) {
      var m = u.match(/^pmtiles:\/\/([^/]+)\/(-?\d+)\/(-?\d+)\/(-?\d+)$/);
      if (m) {
        var p = window.__pmtilesInstances[m[1]];
        if (p) {
          var z = +m[2], x = +m[3], y = +m[4];
          return p.getZxy(z, x, y).then(function (result) {
            if (!result || !result.data) return new Response(new ArrayBuffer(0), { status: 200 });
            return new Response(result.data, { status: 200 });
          });
        }
      }
      return Promise.reject(new TypeError('pmtiles:// – no instance registered for: ' + u));
    }
    if (options && options.cache &&
        (options.cache === 'reload' || options.cache === 'no-store' || options.cache === 'no-cache')) {
      var safeOptions = Object.assign({}, options, { cache: 'default' });
      return _orig.call(window, resource, safeOptions).catch(function(err) {
        var bare = Object.assign({}, options);
        delete bare.cache;
        return _orig.call(window, resource, bare);
      });
    }
    return _orig.call(window, resource, options);
  };
}());

(function() {
  // ── Map & Route Logic ──────────────────────────────────────
  const ROUTE_COLORS = ['#ff6b6b','#4ecdc4','#ffe66d','#a29bfe','#fd79a8','#00b894','#e17055','#0984e3','#6c5ce7','#fdcb6e'];
  const OUR_TRACK_COLOR = '#E76F51'; // Distinctive coral/orange for our Strava track
  const routes = [];
  const points = [];
  let colorIdx = 0;

  const POINT_ICON_SIZE = [18, 18];
  const POINT_ICON_ANCHOR = [9, 9];
  const POINT_POPUP_ANCHOR = [0, -10];

  const POINT_TYPE_ICONS = {
    'Onsen': {
      color: '#e74c3c',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#e74c3c" stroke="#fff" stroke-width="1.5"/><path d="M8 13c0-2.2 1.8-4 4-4s4 1.8 4 4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><path d="M9.5 8.5c0.3-1 0.7-1.5 0.5-2.5M12 7.5c0.3-1 0.7-1.5 0.5-2.5M14.5 8.5c0.3-1 0.7-1.5 0.5-2.5" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/></svg>'
    },
    'Foot Bath': {
      color: '#e8906b',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#e8906b" stroke="#fff" stroke-width="1.5"/><path d="M7 15c0-1.7 1.3-3 3-3h4c1.7 0 3 1.3 3 3v1H7v-1z" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M10 8.5c0.2-.8 0.5-1.2 0.4-2M12.5 8c0.2-.8 0.5-1.2 0.4-2" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/></svg>'
    },
    'Hotel Onsen': {
      color: '#9b3066',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#9b3066" stroke="#fff" stroke-width="1.5"/><rect x="8" y="11" width="8" height="5" rx="0.5" fill="none" stroke="#fff" stroke-width="1.2"/><path d="M9.5 9c0.2-.7 0.5-1 0.3-1.8M12 8.5c0.2-.7 0.5-1 0.3-1.8M14.5 9c0.2-.7 0.5-1 0.3-1.8" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/></svg>'
    },
    'Super Sento': {
      color: '#0277bd',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#0277bd" stroke="#fff" stroke-width="1.5"/><path d="M9.5 8.5c0.3-1 0.7-1.5 0.5-2.5M12 7.5c0.3-1 0.7-1.5 0.5-2.5M14.5 8.5c0.3-1 0.7-1.5 0.5-2.5" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/><rect x="7" y="12" width="10" height="4" rx="1" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M8.5 14c0.7-0.5 1.3-0.5 2 0s1.3 0.5 2 0s1.3-0.5 2 0" fill="none" stroke="#fff" stroke-width="0.8" stroke-linecap="round"/></svg>'
    },
    'Campsite': {
      color: '#27ae60',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#27ae60" stroke="#fff" stroke-width="1.5"/><path d="M12 6L6 17h12L12 6z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 17v-3h4v3" fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="round"/></svg>'
    },
    'Roadside Station': {
      color: '#3498db',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#3498db" stroke="#fff" stroke-width="1.5"/><rect x="7" y="9" width="10" height="7" rx="1" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M7 12h10" stroke="#fff" stroke-width="1"/><path d="M10 9V7h4v2" fill="none" stroke="#fff" stroke-width="1.2"/></svg>'
    },
    'Must See': {
      color: '#f1c40f',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#f1c40f" stroke="#fff" stroke-width="1.5"/><polygon points="12,5 13.8,10.2 19.4,10.2 14.8,13.4 16.6,18.6 12,15.4 7.4,18.6 9.2,13.4 4.6,10.2 10.2,10.2" fill="#fff"/></svg>'
    },
    'Hotel': {
      color: '#9b59b6',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#9b59b6" stroke="#fff" stroke-width="1.5"/><rect x="7" y="8" width="10" height="9" rx="1" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M7 11h10" stroke="#fff" stroke-width="1"/><rect x="9" y="13" width="2" height="3" fill="#fff"/><rect x="13" y="13" width="2" height="3" fill="#fff"/></svg>'
    },
    'Other': {
      color: '#95a5a6',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#95a5a6" stroke="#fff" stroke-width="1.5"/><path d="M12 8v8M8 12h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>'
    },
    '_default': {
      color: '#7f8c8d',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#7f8c8d" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg>'
    }
  };

  // Cache one L.divIcon instance per point type (avoids re-creating per marker)
  const _pointIconCache = {};
  function getPointIcon(type) {
    const key = normalizePointType(type);
    if (_pointIconCache[key]) return _pointIconCache[key];
    const iconDef = POINT_TYPE_ICONS[key] || POINT_TYPE_ICONS['_default'];
    const icon = L.divIcon({ html: iconDef.svg, className: 'point-type-icon', iconSize: POINT_ICON_SIZE, iconAnchor: POINT_ICON_ANCHOR, popupAnchor: POINT_POPUP_ANCHOR });
    _pointIconCache[key] = icon;
    return icon;
  }

  function normalizePointType(type) {
    const rawType = type ? String(type).trim() : '';
    if (!rawType) return '_default';
    // Onsen subcategories — check these before the generic onsen test
    if (/foot\s*bath/i.test(rawType)) return 'Foot Bath';
    if (/hotel\s*onsen|onsen.*hotel/i.test(rawType)) return 'Hotel Onsen';
    if (/Hotel\/Ryokan Onsen/i.test(rawType)) return 'Hotel Onsen';
    if (/super\s*sento/i.test(rawType)) return 'Super Sento';
    if (/Day-use Onsen/i.test(rawType)) return 'Onsen';
    if (/onsen/i.test(rawType)) return 'Onsen';
    if (/Community Center/i.test(rawType)) return 'Onsen';
    // Campsite subcategories — check these before the generic camp test
    if (/camp/i.test(rawType)) return 'Campsite';
    if (/roadside\s*station/i.test(rawType)) return 'Roadside Station';
    if (/must\s*see/i.test(rawType)) return 'Must See';
    if (/hotel/i.test(rawType)) return 'Hotel';
    if (/other/i.test(rawType)) return 'Other';
    return POINT_TYPE_ICONS[rawType] ? rawType : 'Other';
  }

  function getPointType(pointData) {
    const rawType = pointData && pointData.metadata
      ? (pointData.metadata.Type || pointData.metadata.type || pointData.type || null)
      : (pointData ? pointData.type : null);
    const normalized = normalizePointType(rawType);
    return normalized === '_default' ? 'Other' : normalized;
  }

  const map = L.map('map', {
    renderer: L.canvas({ tolerance: 10 })   // Canvas for speed; tolerance widens clickable area around thin lines
  }).setView([36.5, 138], 4);

  // Debounced fit-all: fires 600ms after the last route/point is added,
  // ensuring async Firebase Storage routes are included before zooming.
  let _fitAllTimer = null;
  function scheduleFitAll() {
    clearTimeout(_fitAllTimer);
    _fitAllTimer = setTimeout(() => {
      map.invalidateSize();
      const visibleLayers = [];
      if (map.hasLayer(ourTrackGroup) && ourTrackGroup.getLayers().length > 0) visibleLayers.push(ourTrackGroup);
      if (map.hasLayer(planningRoutesGroup) && planningRoutesGroup.getLayers().length > 0) visibleLayers.push(planningRoutesGroup);
      if (pointLayerGroup && pointLayerGroup.getLayers().length > 0) visibleLayers.push(pointLayerGroup);
      if (visibleLayers.length > 0) map.fitBounds(L.featureGroup(visibleLayers).getBounds(), { padding: [30, 30] });
    }, 600);
  }

  const baseLayers = {
    'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }),
    'OpenTopoMap': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      maxZoom: 17
    }),
    'CyclOSM (Cycling)': L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://www.cyclosm.org">CyclOSM</a>',
      maxZoom: 20
    }),
    'ESRI Topo': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
      maxZoom: 19
    }),
    'ESRI Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
      maxZoom: 19
    })
  };

  baseLayers['ESRI Topo'].addTo(map);
  const overlayLayers = {
    'Waymarked Cycling Routes': L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://cycling.waymarkedtrails.org">Waymarked Trails</a>',
      maxZoom: 19,
      opacity: 0.85
    })
  };

  const layerControl = L.control.layers(baseLayers, overlayLayers, { position: 'bottomleft', collapsed: true }).addTo(map);

  L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

  const pointLayerGroup = L.layerGroup().addTo(map);

  // ── Route layer groups ─────────────────────────────────────
  const ourTrackGroup = L.featureGroup();         // isOwner (Strava) routes; kept off map — displayed via PMTiles tiles
  const planningRoutesGroup = L.featureGroup();   // non-isOwner routes; off by default

  // Helper: returns the layer group a route belongs to.
  function routeLayerGroup(r) { return r.isOwner ? ourTrackGroup : planningRoutesGroup; }

  // ── "Show My Location" control ─────────────────────────────
  (function addLocationControl() {
    const LocationControl = L.Control.extend({
      onAdd: function() {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const btn = L.DomUtil.create('a', '', container);
        btn.innerHTML = '📍';
        btn.href = '#';
        btn.title = 'Show my location';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', 'Show my location');
        btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:30px;height:30px;font-size:1.1em;text-decoration:none;cursor:pointer;';
        let _locationMarker = null;
        let _locationCircle = null;
        L.DomEvent.on(btn, 'click', function(e) {
          L.DomEvent.preventDefault(e);
          L.DomEvent.stopPropagation(e);
          if (!navigator.geolocation) { alert('Geolocation is not supported by this browser.'); return; }
          btn.innerHTML = '⏳';
          navigator.geolocation.getCurrentPosition(
            function(pos) {
              btn.innerHTML = '📍';
              const latlng = [pos.coords.latitude, pos.coords.longitude];
              const accuracy = pos.coords.accuracy;
              if (_locationMarker) { _locationMarker.remove(); _locationMarker = null; }
              if (_locationCircle) { _locationCircle.remove(); _locationCircle = null; }
              _locationCircle = L.circle(latlng, { radius: accuracy, color: '#4285f4', fillColor: '#4285f4', fillOpacity: 0.12, weight: 1 }).addTo(map);
              _locationMarker = L.circleMarker(latlng, { radius: 8, fillColor: '#4285f4', fillOpacity: 0.9, color: 'white', weight: 2.5 })
                .addTo(map)
                .bindPopup('<b>You are here</b><br><span style="color:#888;font-size:0.85em;">Accuracy: ~' + Math.round(accuracy) + ' m</span>')
                .openPopup();
              map.setView(latlng, Math.max(map.getZoom(), 14));
            },
            function(err) {
              btn.innerHTML = '📍';
              const msgs = { 1: 'Location access denied. Please allow location access in your browser settings.', 2: 'Location unavailable.', 3: 'Location request timed out.' };
              alert(msgs[err.code] || 'Could not get location: ' + err.message);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
          );
        });
        return container;
      }
    });
    new LocationControl({ position: 'topleft' }).addTo(map);
  })();

  // ── Filter popup open / close ───────────────────────────────
  (function setupFilterPopup() {
    const filterBtn = document.getElementById('filter-btn');
    const filterPopup = document.getElementById('filter-popup');
    const filterCloseBtn = document.getElementById('filter-close-btn');
    const filterSelectAll = document.getElementById('filter-select-all');
    const filterClearAll = document.getElementById('filter-clear-all');
    if (!filterBtn || !filterPopup) return;
    filterBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      filterPopup.classList.toggle('open');
    });
    filterCloseBtn.addEventListener('click', function() { filterPopup.classList.remove('open'); });
    document.addEventListener('click', function(e) {
      if (!filterPopup.contains(e.target) && !filterBtn.contains(e.target)) filterPopup.classList.remove('open');
    });
    filterPopup.addEventListener('click', function(e) { e.stopPropagation(); });
    filterSelectAll.addEventListener('click', function() {
      getAvailablePointTypes().forEach(t => { pointTypeFilters.add(t); _seenPointTypes.add(t); });
      renderPointToggles();
    });
    filterClearAll.addEventListener('click', function() {
      pointTypeFilters.clear();
      // Mark all types as seen so the auto-enable logic doesn't re-add them.
      getAvailablePointTypes().forEach(t => _seenPointTypes.add(t));
      renderPointToggles();
    });
  })();

  function parseGPX(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');
    const pts = [];
    doc.querySelectorAll('trkpt, rtept').forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      const eleEl = pt.querySelector('ele');
      const ele = eleEl ? parseFloat(eleEl.textContent) : null;
      if (!isNaN(lat) && !isNaN(lon)) pts.push({ lat, lon, ele });
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
      const a = Math.sin(dLat/2)**2 + Math.cos(pts[i-1].lat*Math.PI/180)*Math.cos(pts[i].lat*Math.PI/180)*Math.sin(dLon/2)**2;
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

  // ── Web Worker for GPX parsing ──────────────────────────────
  let _gpxWorker = null;
  let _workerCallbacks = new Map();
  let _workerMsgId = 0;

  (function initGpxWorker() {
    try {
      _gpxWorker = new Worker('js/gpx-worker.js');
      _gpxWorker.onmessage = function(e) {
        const { id, latlngs, stats, name, error } = e.data;
        const cb = _workerCallbacks.get(id);
        if (cb) { _workerCallbacks.delete(id); cb(error ? null : { latlngs, stats, name }, error || null); }
      };
      _gpxWorker.onerror = function(e) {
        console.warn('GPX Worker error:', e);
        _workerCallbacks.forEach(function(cb) { cb(null, 'Worker failed'); });
        _workerCallbacks.clear();
        _gpxWorker = null;
      };
    } catch(e) {
      _gpxWorker = null;
    }
  })();

  function parseGpxAsync(gpxText) {
    return new Promise((resolve, reject) => {
      if (!_gpxWorker) {
        try {
          const { points: pts, name } = parseGPX(gpxText);
          const latlngs = pts.map(p => [p.lat, p.lon]);
          const stats = computeStats(pts);
          resolve({ latlngs, stats, name });
        } catch(e) { reject(e); }
        return;
      }
      const id = ++_workerMsgId;
      _workerCallbacks.set(id, (result, err) => { if (err) reject(new Error(err)); else resolve(result); });
      _gpxWorker.postMessage({ id, gpxText });
    });
  }

  // ── Route popup content ────────────────────────────────────
  function buildRoutePopupContent(idx) {
    const r = routes[idx];
    let html = '<div style="min-width:210px">';
    html += '<div style="display:flex;align-items:center;gap:0.5em;margin-bottom:0.6em">';
    html += '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + r.color + ';flex-shrink:0"></span>';
    html += '<strong style="font-size:1em;color:var(--color-primary)">' + escapeHtml(r.routeName) + '</strong>';
    html += '</div>';
    if (r.stats) {
      html += '<table style="width:100%;border-collapse:collapse;font-size:0.85em;margin-bottom:0.4em">';
      html += '<tr><td style="color:#6c757d;padding:2px 8px 2px 0">Distance</td><td style="font-weight:600">' + r.stats.distanceKm + ' km</td></tr>';
      html += '<tr><td style="color:#6c757d;padding:2px 8px 2px 0">Elev Gain</td><td style="font-weight:600">↑ ' + r.stats.elevGain + ' m</td></tr>';
      html += '<tr><td style="color:#6c757d;padding:2px 8px 2px 0">Elev Loss</td><td style="font-weight:600">↓ ' + r.stats.elevLoss + ' m</td></tr>';
      html += '<tr><td style="color:#6c757d;padding:2px 8px 2px 0">Min / Max</td><td style="font-weight:600">' + r.stats.minEle + ' / ' + r.stats.maxEle + ' m</td></tr>';
      html += '</table>';
    }
    if (r.metadata.description) html += '<p style="font-size:0.85em;color:#6c757d;margin:0.3em 0">' + escapeHtml(r.metadata.description) + '</p>';
    if (r.metadata.sourceUrl) html += '<a href="' + escapeAttr(r.metadata.sourceUrl) + '" target="_blank" rel="noopener" style="font-size:0.85em;color:#5B8C6B">🔗 Source</a>';
    if (r.firebaseDocId) {
      html += '<div style="margin-top:0.6em;display:flex;gap:0.4em;flex-wrap:wrap">';
      html += '<button class="roots-btn popup-info-btn" data-ridx="' + idx + '" style="font-size:0.8em;padding:0.25em 0.6em">ℹ Info</button>';
      if (isAdmin()) html += '<button class="roots-btn popup-del-btn" data-ridx="' + idx + '" style="font-size:0.8em;padding:0.25em 0.6em;color:var(--color-coral,#E76F51)">✕ Delete</button>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function _bindPolylinePopup(polyline, routeRef) {
    polyline.on('popupopen', () => {
      const idx = routes.indexOf(routeRef);
      polyline.setPopupContent(buildRoutePopupContent(idx));
      const popup = polyline.getPopup().getElement();
      if (!popup) return;
      const infoBtn = popup.querySelector('.popup-info-btn');
      const delBtn  = popup.querySelector('.popup-del-btn');
      if (infoBtn) infoBtn.addEventListener('click', () => { map.closePopup(); openMetadataModal(parseInt(infoBtn.dataset.ridx)); });
      if (delBtn)  delBtn.addEventListener('click',  () => { map.closePopup(); deleteFirebaseRoute(parseInt(delBtn.dataset.ridx)); });
    });
    polyline.bindPopup(buildRoutePopupContent(routes.indexOf(routeRef)), { maxWidth: 280 });
  }

  // ── Route line weight – scales down as you zoom in so roads stay visible ──
  // Weights at low zoom levels (zoomed out) are kept small to speed up
  // Canvas rendering on mobile devices.
  function getRouteWeight(zoom) {
    if (zoom >= 17) return 0.5;
    if (zoom >= 15) return 0.75;
    if (zoom >= 13) return 1.2;
    if (zoom >= 11) return 1.8;
    if (zoom >= 9)  return 2.2;
    if (zoom >= 7)  return 2;
    return 1.5;
  }

  // ── addRoute: supports preview (gpxText=null) and full mode ───────────
  function addRoute(gpxText, fileName, firebaseDocId, metadata, storagePath, cachedGpx, isOwner) {
    if (!gpxText) {
      const color = isOwner ? OUR_TRACK_COLOR : ROUTE_COLORS[colorIdx % ROUTE_COLORS.length];
      if (!isOwner) colorIdx++;
      const routeName = (metadata && metadata.name) || fileName.replace(/\.gpx$/i, '');
      routes.push({ routeName, color, polyline: null, stats: null, visible: !!isOwner,
                    isOwner: !!isOwner,
                    firebaseDocId: firebaseDocId || null, metadata: metadata || {},
                    _loading: false, _gpxCached: cachedGpx || null,
                    _storagePath: storagePath || null, _fileName: fileName });
      if (isOwner) {
        loadFullGpxForRoute(routes.length - 1);
      }
      scheduleRenderToggles();
      return;
    }
    const { points: pts, name } = parseGPX(gpxText);
    if (pts.length === 0) { alert('No track points found in ' + fileName); return; }
    const color = isOwner ? OUR_TRACK_COLOR : ROUTE_COLORS[colorIdx % ROUTE_COLORS.length];
    if (!isOwner) colorIdx++;
    const latlngs = pts.map(p => [p.lat, p.lon]);
    const weight = isOwner ? 5 : getRouteWeight(map.getZoom());
    const opacity = isOwner ? 1 : 0.85;
    const polyline = L.polyline(latlngs, { color, weight, opacity });
    routeLayerGroup({ isOwner }).addLayer(polyline);
    const routeName = name || fileName.replace(/\.gpx$/i, '');
    const stats = computeStats(pts);
    const meta = metadata || {};
    const routeObj = { routeName, color, polyline, stats, visible: true,
                       isOwner: !!isOwner,
                       firebaseDocId: firebaseDocId || null, metadata: meta,
                       _loading: false, _gpxCached: gpxText,
                       _storagePath: storagePath || null, _fileName: fileName };
    routes.push(routeObj);
    _bindPolylinePopup(polyline, routeObj);
    scheduleRenderToggles();
    renderStats();
  }

  // ── Load full GPX on demand ───────────────────────────────────────────
  function loadFullGpxForRoute(idx) {
    const r = routes[idx];
    if (r.polyline || r._loading) {
      if (r.polyline && r.visible) {
        const grp = routeLayerGroup(r);
        if (!grp.hasLayer(r.polyline)) grp.addLayer(r.polyline);
      }
      return;
    }
    r._loading = true;

    function onParsed(result) {
      if (!result || !result.latlngs || !result.latlngs.length) { r._loading = false; return; }
      const weight = r.isOwner ? 5 : getRouteWeight(map.getZoom());
      const opacity = r.isOwner ? 1 : 0.85;
      r.polyline = L.polyline(result.latlngs, { color: r.color, weight, opacity });
      if (result.name && r.routeName === (r._fileName || '').replace(/\.gpx$/i, '')) r.routeName = result.name;
      r.stats = result.stats;
      r._loading = false;
      _bindPolylinePopup(r.polyline, r);
      if (r.visible) {
        routeLayerGroup(r).addLayer(r.polyline);
      }
      renderToggles();
      renderStats();
    }

    function fetchAndParse(gpxText) {
      parseGpxAsync(gpxText).then(onParsed).catch(err => {
        console.error('GPX parse error for ' + r.routeName + ':', err);
        r._loading = false;
      });
    }

    if (r._gpxCached) { fetchAndParse(r._gpxCached); return; }
    if (!storage || !r._storagePath) { r._loading = false; return; }
    storage.ref(r._storagePath).getDownloadURL()
      .then(url => fetch(url))
      .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
      .then(gpxText => {
        r._gpxCached = gpxText;
        fetchAndParse(gpxText);
      })
      .catch(err => { console.error('Error loading route ' + r.routeName + ':', err); r._loading = false; });
  }

  // Debounced zoom handler: batch polyline-weight updates and cluster-level
  // switches into a single callback fired 150 ms after the last zoomend event,
  // so rapid zoom steps (e.g. double-tap on mobile) do not trigger many redraws.
  let _zoomEndTimer = null;
  function _onZoomEnd() {
    if (_zoomEndTimer) clearTimeout(_zoomEndTimer);
    _zoomEndTimer = setTimeout(function() {
      _zoomEndTimer = null;
      const zoom = map.getZoom();
      const w = getRouteWeight(zoom);
      routes.forEach(function(r) {
        if (r.polyline && r.visible) r.polyline.setStyle({ weight: r.isOwner ? 5 : w });
      });
      // Delegate cluster-level switching to the snapshot listener if active
      if (_onZoomEndSnapshot) _onZoomEndSnapshot(zoom);
    }, 150);
  }
  map.on('zoomend', _onZoomEnd);

  // ── PMTiles route layers ────────────────────────────────────
  function initPMTilesLayer() {
    if (typeof pmtiles === 'undefined' || typeof L.vectorGrid === 'undefined') return;

    function buildLayer(pmtilesUrl, instanceKey) {
      const p = new pmtiles.PMTiles(pmtilesUrl);
      if (window.__pmtilesInstances) window.__pmtilesInstances[instanceKey] = p;
      return p.getHeader().then(function(header) {
        const layer = L.vectorGrid.protobuf(`pmtiles://${instanceKey}/{z}/{x}/{y}`, {
          vectorTileLayerStyles: {
            routes: function(properties) {
              return {
                weight: getRouteWeight(map.getZoom()),
                color: properties.color || '#5B8C6B',
                opacity: 0.85,
                fill: false
              };
            }
          },
          interactive: true,
          getFeatureId: function(f) { return f.properties.name || f.properties.filename; },
          maxNativeZoom: header.maxZoom || 14,
          minNativeZoom: header.minZoom || 2
        });
        layer.on('click', function(e) {
          const props = e.layer.properties;
          if (!props) return;
          const name = props.name || props.filename || 'Route';
          L.popup()
            .setLatLng(e.latlng)
            .setContent(
              '<div style="min-width:160px">' +
              '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + (props.color || '#5B8C6B') + ';margin-right:6px;vertical-align:middle"></span>' +
              '<strong>' + name + '</strong>' +
              (props.sourceUrl
                ? '<br><a href="' + escapeAttr(props.sourceUrl) + '" target="_blank" rel="noopener" style="font-size:0.85em;color:#5B8C6B">🔗 View on Strava</a>'
                : '') +
              '</div>'
            )
            .openOn(map);
        });
        layer.on('mouseover', function(e) {
          const props = e.layer.properties || {};
          if (e.layer.setStyle) e.layer.setStyle({ weight: 5, color: props.color || '#5B8C6B', opacity: 1 });
        });
        layer.on('mouseout', function(e) {
          const props = e.layer.properties || {};
          if (e.layer.setStyle) e.layer.setStyle({ weight: getRouteWeight(map.getZoom()), color: props.color || '#5B8C6B', opacity: 0.85 });
        });
        return layer;
      });
    }

    function tryLoadTile(storageName, instanceKey, overlayLabel, directUrl, addToMap) {
      function tryLoad(url) {
        return buildLayer(url, instanceKey).then(function(layer) {
          layerControl.addOverlay(layer, overlayLabel);
          if (addToMap) layer.addTo(map);
        });
      }
      const storagePromise = storage
        ? storage.ref('tiles/' + storageName).getDownloadURL().then(tryLoad)
        : Promise.reject(new Error('storage not ready'));
      storagePromise.catch(function() {
        tryLoad(directUrl).catch(function(err) {
          console.warn('PMTiles layer "' + overlayLabel + '" unavailable:', err && err.message || err);
        });
      });
    }

    tryLoadTile(
      'my-routes.pmtiles',
      'my-routes',
      'My Routes (tiles)',
      'https://firebasestorage.googleapis.com/v0/b/roots-eddf5.firebasestorage.app/o/tiles%2Fmy-routes.pmtiles?alt=media',
      true
    );

    tryLoadTile(
      'planned-routes.pmtiles',
      'planned-routes',
      'Planned Routes (tiles)',
      'https://firebasestorage.googleapis.com/v0/b/roots-eddf5.firebasestorage.app/o/tiles%2Fplanned-routes.pmtiles?alt=media',
      false
    );
  }

  function removeRouteFromMap(idx) {
    const r = routes[idx];
    if (r.polyline) routeLayerGroup(r).removeLayer(r.polyline);
    routes.splice(idx, 1);
    renderToggles(); renderStats();
  }

  // ── Debounced renderToggles ───────────────────────────────────────────
  let _routeToggleTimer = null;
  function scheduleRenderToggles() {
    if (_routeToggleTimer) clearTimeout(_routeToggleTimer);
    _routeToggleTimer = setTimeout(renderToggles, 100);
  }

  function renderToggles() {
    const container = document.getElementById('route-toggles');
    if (!container) return;
    container.innerHTML = '';

    function appendRouteToggle(target, r, i) {
      const lbl = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = r.visible;
      cb.addEventListener('change', () => toggleRoute(i));
      const dot = document.createElement('span');
      dot.className = 'route-color-dot'; dot.style.background = r.color;
      lbl.appendChild(cb); lbl.appendChild(dot); lbl.appendChild(document.createTextNode(r.routeName + (r._loading ? ' ⏳' : '')));
      if (r.firebaseDocId) {
        const info = document.createElement('button');
        info.className = 'info-btn'; info.textContent = 'ℹ'; info.title = 'Route info';
        info.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openMetadataModal(i); });
        lbl.appendChild(info);
      }
      if (r.firebaseDocId && isAdmin()) {
        const del = document.createElement('button');
        del.className = 'delete-btn'; del.textContent = '✕'; del.title = 'Delete from Firebase';
        del.addEventListener('click', (e) => { e.preventDefault(); deleteFirebaseRoute(i); });
        lbl.appendChild(del);
      }
      target.appendChild(lbl);
    }

    const ourRoutes      = routes.map((r, i) => ({ r, i })).filter(({ r }) =>  r.isOwner);
    const planningRoutes = routes.map((r, i) => ({ r, i })).filter(({ r }) => !r.isOwner);

    if (ourRoutes.length > 0) {
      const hdr = document.createElement('div');
      hdr.className = 'route-section-header our-track-header';
      hdr.textContent = '🚴 Our Track';
      container.appendChild(hdr);
      const sec = document.createElement('div');
      sec.className = 'roots-controls route-section';
      ourRoutes.forEach(({ r, i }) => appendRouteToggle(sec, r, i));
      container.appendChild(sec);
    }

    if (planningRoutes.length > 0) {
      const hdr = document.createElement('div');
      hdr.className = 'route-section-header';
      hdr.textContent = '📋 Planning Routes';
      container.appendChild(hdr);
      const sec = document.createElement('div');
      sec.className = 'roots-controls route-section';
      planningRoutes.forEach(({ r, i }) => appendRouteToggle(sec, r, i));
      container.appendChild(sec);
    }
  }

  function toggleRoute(idx) {
    const r = routes[idx]; r.visible = !r.visible;
    const grp = routeLayerGroup(r);
    if (r.visible) {
      if (r.polyline) {
        if (!grp.hasLayer(r.polyline)) grp.addLayer(r.polyline);
      } else {
        loadFullGpxForRoute(idx);
      }
    } else {
      if (r.polyline && grp.hasLayer(r.polyline)) grp.removeLayer(r.polyline);
    }
    renderStats();
  }

  function renderStats() {
    const statsDiv = document.getElementById('route-stats');
    if (!statsDiv) return;
    const visible = routes.filter(r => r.visible && r.stats);
    if (visible.length === 0) { statsDiv.style.display = 'none'; return; }
    statsDiv.style.display = 'block';
    let html = '<table><tr><th>Route</th><th>Distance</th><th>Elev Gain</th><th>Elev Loss</th><th>Min Elev</th><th>Max Elev</th></tr>';
    visible.forEach(r => {
      html += '<tr><td><span class="route-color-dot" style="background:' + r.color + '"></span>' + r.routeName + '</td>';
      html += '<td>' + r.stats.distanceKm + ' km</td><td>' + r.stats.elevGain + ' m</td><td>' + r.stats.elevLoss + ' m</td><td>' + r.stats.minEle + ' m</td><td>' + r.stats.maxEle + ' m</td></tr>';
    });
    statsDiv.innerHTML = html + '</table>';
  }

  function resolvePointUrl(data, metadata) {
    const fromData = data && (data.url||data.URL||data.link||data.Link||data.website||data.Website||data.page||data.Page);
    if (fromData) return String(fromData).trim();
    const fromMeta = metadata && (metadata.url||metadata.URL||metadata.link||metadata.Link||metadata.website||metadata.Website||metadata.page||metadata.Page);
    return fromMeta ? String(fromMeta).trim() : null;
  }

  let _toggleTimer = null;
  function scheduleRenderPointToggles() { if (_toggleTimer) clearTimeout(_toggleTimer); _toggleTimer = setTimeout(renderPointToggles, 50); }

  const pointTypeFilters = new Set();
  const _seenPointTypes = new Set();

  function getAvailablePointTypes() {
    const available = new Set();
    points.forEach(p => available.add(p.type||'Other'));
    if (available.size === 0) ['Onsen','Campsite','Roadside Station','Must See','Hotel','Other'].forEach(t => available.add(t));
    return Array.from(available);
  }

  function applyPointTypeFilters() {
    points.forEach(p => {
      const type = p.type||'Other';
      if (p.visible !== false && pointTypeFilters.has(type)) pointLayerGroup.addLayer(p.marker);
      else pointLayerGroup.removeLayer(p.marker);
    });
  }

  function createPointMarker(pointData) {
    const clusterMeta = pointData && pointData.metadata && pointData.metadata.__cluster;
    const clusterCount = Number(clusterMeta && clusterMeta.count) || 0;
    if (clusterCount > 1) {
      const clusterClass = clusterCount > 100 ? 'marker-cluster-large' : (clusterCount > 10 ? 'marker-cluster-medium' : 'marker-cluster-small');
      const marker = L.marker([pointData.lat, pointData.lon], {
        icon: L.divIcon({
          html: '<div><span>' + clusterCount + '</span></div>',
          className: 'marker-cluster ' + clusterClass,
          iconSize: L.point(40, 40)
        })
      });
      marker.bindPopup(function() {
        const items = (clusterMeta && clusterMeta.items) || [];
        let html = '<b>' + escapeHtml(pointData.name || 'Cluster') + '</b><br><span style="font-size:0.9em;color:#6c757d;">' + clusterCount + ' points</span>';
        if (items.length > 0) {
          html += '<ul style="margin:0.4em 0 0 1.1em;padding:0;max-height:180px;overflow:auto">';
          items.forEach(function(item) {
            const itemName = item && item.name ? item.name : 'Point';
            const itemUrl = item && item.url ? String(item.url) : '';
            html += '<li>' + (itemUrl ? '<a href="' + escapeAttr(itemUrl) + '" target="_blank" rel="noopener">' + escapeHtml(itemName) + '</a>' : escapeHtml(itemName)) + '</li>';
          });
          html += '</ul>';
        }
        return html;
      });
      return marker;
    }
    const pointType = getPointType(pointData);
    const marker = L.marker([pointData.lat, pointData.lon], { icon: getPointIcon(pointType) });
    // Popup: show only the essential info upfront; extra details (description,
    // price, hours, notes) are deferred inside a <details> element so they are
    // not rendered until the user explicitly expands them.
    marker.bindPopup(function() {
      const pointUrl = resolvePointUrl(pointData, pointData.metadata);
      let content = '<b>' + escapeHtml(pointData.name) + '</b>';
      if (pointType !== '_default') content += '<br><span style="font-size:0.85em;color:#6c757d;">' + escapeHtml(pointType) + '</span>';
      if (pointUrl) content += '<br><a href="' + escapeAttr(pointUrl) + '" target="_blank" rel="noopener" aria-label="View details for ' + escapeAttr(pointData.name) + '">View Details</a>';
      if (pointData.metadata) {
        const meta = pointData.metadata;
        const desc  = meta.description || meta.Description || '';
        const price = meta.price || meta.Price || '';
        const hours = meta.hours || meta.Hours || '';
        const notes = meta.notes || meta.Notes || '';
        if (desc || price || hours || notes) {
          content += '<details style="margin-top:0.4em"><summary style="cursor:pointer;font-size:0.85em;color:#6c757d;">More details</summary><div style="margin-top:0.3em">';
          if (desc)  content += '<span style="color:#6c757d;font-size:0.92em;display:block;">' + escapeHtml(desc) + '</span>';
          if (price) content += '<span style="font-size:0.9em;display:block;">💴 ' + escapeHtml(price) + '</span>';
          if (hours) content += '<span style="font-size:0.9em;display:block;">🕐 ' + escapeHtml(hours) + '</span>';
          if (notes) content += '<span style="color:#6c757d;font-size:0.88em;font-style:italic;display:block;">' + escapeHtml(notes) + '</span>';
          content += '</div></details>';
        }
      }
      return content;
    });
    return marker;
  }

  function addPoint(pointData, fileName, firebaseDocId) {
    const marker = createPointMarker(pointData);
    pointLayerGroup.addLayer(marker);
    points.push({ name: pointData.name, lat: pointData.lat, lon: pointData.lon, url: resolvePointUrl(pointData, pointData.metadata), type: getPointType(pointData), metadata: pointData.metadata, marker, visible: true, fileName, firebaseDocId: firebaseDocId||null });
    scheduleRenderPointToggles();
  }

  function addPointsBatch(pointDataArray) {
    for (let i = 0; i < pointDataArray.length; i++) {
      const { pointData, fileName, firebaseDocId } = pointDataArray[i];
      const marker = createPointMarker(pointData);
      // LayerGroup has addLayer/removeLayer but no addLayers batch API.
      pointLayerGroup.addLayer(marker);
      points.push({ name: pointData.name, lat: pointData.lat, lon: pointData.lon, url: resolvePointUrl(pointData, pointData.metadata), type: getPointType(pointData), metadata: pointData.metadata, marker, visible: true, fileName, firebaseDocId: firebaseDocId||null });
    }
    scheduleRenderPointToggles();
  }

  function removePointFromMap(idx) { pointLayerGroup.removeLayer(points[idx].marker); points.splice(idx, 1); renderPointToggles(); }

  function renderPointToggles() {
    const container = document.getElementById('type-filters');
    if (!container) return;
    container.innerHTML = '';
    const availableTypes = getAvailablePointTypes();
    availableTypes.forEach(t => { if (!_seenPointTypes.has(t)) { _seenPointTypes.add(t); } });
    availableTypes.forEach(type => {
      const count = points.filter(p => (p.type||'Other') === type).length;
      const iconDef = POINT_TYPE_ICONS[type] || POINT_TYPE_ICONS['_default'];
      const lbl = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = pointTypeFilters.has(type);
      cb.addEventListener('change', () => togglePointType(type, cb.checked));
      const iconSpan = document.createElement('span');
      iconSpan.className = 'filter-icon';
      iconSpan.innerHTML = iconDef.svg;
      iconSpan.style.flexShrink = '0';
      lbl.appendChild(cb);
      lbl.appendChild(iconSpan);
      lbl.appendChild(document.createTextNode(type + ' (' + count + ')'));
      container.appendChild(lbl);
    });
    applyPointTypeFilters();
    const badge = document.getElementById('filter-active-badge');
    if (badge) {
      const hiddenCount = availableTypes.filter(t => !pointTypeFilters.has(t)).length;
      if (hiddenCount > 0) {
        badge.textContent = availableTypes.filter(t => pointTypeFilters.has(t)).length + '/' + availableTypes.length;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  function togglePointType(type, isChecked) { if (isChecked) pointTypeFilters.add(type); else pointTypeFilters.delete(type); applyPointTypeFilters(); }

  // ── Firebase Integration ───────────────────────────────────
  let currentUser = null;
  let _isAdmin = false;
  let db = null;
  let storage = null;
  let firebaseReady = false;
  const loadedFirebaseIds = new Set();
  const loadedFirebasePointIds = new Set();
  let metaPointIdx = null;

  const _loadTasks = { routes: false };
  let _onPointsLoaded = null;
  function markLoaded(task) {
    if (task === 'points') {
      if (_onPointsLoaded) { const cb = _onPointsLoaded; _onPointsLoaded = null; cb(); }
      return;
    }
    _loadTasks[task] = true;
    const done = Object.values(_loadTasks).filter(Boolean).length;
    const total = Object.keys(_loadTasks).length;
    const pct = Math.round((done/total)*100);
    const fill = document.getElementById('progress-fill');
    const text = document.getElementById('loading-text');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = done < total ? 'Loading data... ' + pct + '%' : 'Done';
    if (done >= total) {
      clearTimeout(_loadingTimeoutId);
      const overlay = document.getElementById('map-loading');
      if (overlay) { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 500); }
    }
  }

  let authLoaded = false;
  function loadAuthAndStorage() {
    if (authLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const as = document.createElement('script');
      as.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js';
      as.onload = () => {
        const ss = document.createElement('script');
        ss.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js';
        ss.onload = () => { authLoaded = true; storage = firebase.storage(); resolve(); };
        ss.onerror = reject; document.head.appendChild(ss);
      };
      as.onerror = reject; document.head.appendChild(as);
    });
  }

  let _authSetupDone = false;
  function setupAuth() {
    if (_authSetupDone) return; _authSetupDone = true;
    firebase.auth().onAuthStateChanged(async user => {
      currentUser = user;
      if (user && db) {
        const emails = await window.getAdminEmails(db);
        _isAdmin = emails.includes(user.email);
      } else {
        _isAdmin = false;
      }
      updateAuthUI();
    });
  }

  function initFirebase() {
    loadFirebaseRoutes(); // Fetch static stats — no Firebase needed
    if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
      console.log('Map: Firebase not configured — running in local-only mode.');
      markLoaded('points'); return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      const _app = firebase.app();
      const isIOS = (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream)
                 || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

      function _finishInit(firestoreSettings) {
        db = firebase.firestore();
        if (firestoreSettings) {
          try { db.settings(firestoreSettings); } catch(e) { /* already set — ignore */ }
        }
        firebaseReady = true;
        loadFirebasePoints();
        loadAuthAndStorage()
          .then(() => {
            routes.forEach((r, idx) => {
              if (r.isOwner && !r.polyline && !r._loading) loadFullGpxForRoute(idx);
            });
            return setupAuth();
          })
          .catch(err => console.warn('Auth load:', err));
      }

      if (!isIOS) {
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
          .then(function(mod) {
            try {
              mod.initializeFirestore(_app, {
                localCache: mod.memoryLocalCache()
              });
            } catch(e) { /* already initialised — ignore */ }
            _finishInit();
          })
          .catch(function() { _finishInit(); });
      } else {
        _finishInit({ experimentalForceLongPolling: true });
      }
    } catch (err) { console.error('Firebase init error:', err); markLoaded('routes'); markLoaded('points'); }
  }

  function isAdmin() { return _isAdmin; }

  function updateAuthUI() {
    renderToggles();
  }

  // ── Update Trip Overview sidebar stats from static assets/stats.json ──
  function updateMapTripStats(statsData) {
    const japan = statsData && statsData.japan;
    const totalKm = japan && typeof japan.totalDistanceKm === 'number' ? japan.totalDistanceKm : 0;
    const kmEl = document.getElementById('map-stat-km');
    if (kmEl) kmEl.textContent = totalKm > 0 ? Math.round(totalKm).toLocaleString() : '0';

    const START_DATE = new Date('2026-03-05T00:00:00');
    const daysSince = Math.max(0, Math.floor((Date.now() - START_DATE.getTime()) / 86400000));
    const daysEl = document.getElementById('map-stat-days');
    if (daysEl) daysEl.textContent = daysSince.toLocaleString();
  }

  function loadFirebaseRoutes() {
    fetch('assets/stats.json', { cache: 'default' })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        updateMapTripStats(data);
        markLoaded('routes');
      })
      .catch(function(err) {
        console.warn('Could not load stats.json:', err);
        markLoaded('routes');
      });
  }

  const POINTS_SNAPSHOT_URL = 'assets/points.json';

  let _pointsLoadStarted = false;
  const POINTS_BATCH_SIZE = 1000;
  // Keep clustering active until zoom 13 by default so that mobile users see
  // fewer individual markers at moderate zoom levels; the snapshot can override
  // this via `clusterZoomRange.disableClusteringAtZoom`.
  let serverClusterDisableZoom = 13;
  let snapshotRawPoints = null;
  let serverClusterLevels = null;
  let serverClusterLevelKeys = [];
  let serverClusterLevelActiveKey = null;
  let snapshotZoomListener = null;
  // Called by the debounced _onZoomEnd handler; set when the snapshot has
  // cluster levels so zoom transitions update the displayed cluster layer.
  let _onZoomEndSnapshot = null;

  function normalizeSnapshotPoint(d) {
    return {
      name: d.name || 'Point',
      lat: d.lat,
      lon: d.lon,
      url: d.url || null,
      type: d.type || null,
      metadata: d.metadata || {},
      fileName: d.fileName || 'points.json',
      id: d.id || null
    };
  }

  function normalizeServerClusterPoint(d) {
    const pointData = normalizeSnapshotPoint(d);
    const count = Number(d?.count ?? d?.metadata?.__cluster?.count ?? 0);
    if (count > 1 && (!pointData.metadata || !pointData.metadata.__cluster)) {
      pointData.metadata = Object.assign({}, pointData.metadata, {
        __cluster: {
          count,
          items: Array.isArray(d.items) ? d.items : []
        }
      });
    }
    return pointData;
  }

  function getServerClusterLevelKeyForZoom(zoom) {
    if (!serverClusterLevelKeys.length || zoom >= serverClusterDisableZoom) return null;
    let selected = serverClusterLevelKeys[0];
    for (let i = 0; i < serverClusterLevelKeys.length; i++) {
      const key = serverClusterLevelKeys[i];
      if (key <= zoom) selected = key;
      else break;
    }
    return String(selected);
  }

  function getSnapshotDisplayPointsForZoom(zoom) {
    const levelKey = getServerClusterLevelKeyForZoom(zoom);
    if (levelKey && serverClusterLevels && Array.isArray(serverClusterLevels[levelKey])) {
      return {
        levelKey,
        points: serverClusterLevels[levelKey].map(normalizeServerClusterPoint)
      };
    }
    return {
      levelKey: null,
      points: (snapshotRawPoints || []).map(normalizeSnapshotPoint)
    };
  }

  function applySnapshotDisplayForZoom(zoom, force) {
    if (!snapshotRawPoints) return;
    const display = getSnapshotDisplayPointsForZoom(zoom);
    if (!force && serverClusterLevelActiveKey === display.levelKey) return;
    serverClusterLevelActiveKey = display.levelKey;
    pointLayerGroup.clearLayers();
    points.length = 0;
    const batch = display.points.map(d => ({
      pointData: d,
      fileName: d.fileName || 'points.json',
      firebaseDocId: d.id || null
    }));
    addPointsBatch(batch);
  }

  function loadFirebasePoints(lastDoc) {
    if (!firebaseReady) return;

    if (!lastDoc) {
      if (_pointsLoadStarted) return;
      _pointsLoadStarted = true;

      fetch(POINTS_SNAPSHOT_URL, { cache: 'default' })
        .then(res => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(data => {
          let snapPoints, generatedAt;
          if (Array.isArray(data)) {
            snapPoints = data; generatedAt = null;
          } else if (data && Array.isArray(data.points)) {
            generatedAt = data.generatedAt || null;
            snapPoints = data.points;
            const disableZoomRaw = data.clusterZoomRange?.disableClusteringAtZoom;
            const disableZoom = Number(disableZoomRaw);
            serverClusterDisableZoom = Number.isFinite(disableZoom) ? disableZoom : 9;
            if (data.clustersByZoom && typeof data.clustersByZoom === 'object') {
              serverClusterLevels = data.clustersByZoom;
              serverClusterLevelKeys = Object.keys(serverClusterLevels)
                .map(k => Number(k))
                .filter(Number.isFinite)
                .sort((a, b) => a - b);
            } else if (Array.isArray(data.clusters)) {
              serverClusterLevels = { '0': data.clusters };
              serverClusterLevelKeys = [0];
            } else {
              serverClusterLevels = null;
              serverClusterLevelKeys = [];
              serverClusterDisableZoom = 13;
            }
          } else {
            throw new Error('unrecognised snapshot format');
          }
          if (snapPoints.length === 0) throw new Error('empty snapshot');
          snapshotRawPoints = snapPoints;
          serverClusterLevelActiveKey = null;
          snapPoints.forEach(d => { if (d.id) loadedFirebasePointIds.add(d.id); });
          applySnapshotDisplayForZoom(map.getZoom(), true);
          if (serverClusterLevelKeys.length > 0) {
            // Route the cluster-level switch through the shared debounced
            // _onZoomEnd handler instead of registering a separate listener.
            _onZoomEndSnapshot = function(zoom) { applySnapshotDisplayForZoom(zoom, false); };
            if (snapshotZoomListener) { map.off('zoomend', snapshotZoomListener); snapshotZoomListener = null; }
          } else {
            _onZoomEndSnapshot = null;
            if (snapshotZoomListener) { map.off('zoomend', snapshotZoomListener); snapshotZoomListener = null; }
          }
          if (generatedAt && db) {
            const since = firebase.firestore.Timestamp.fromDate(new Date(generatedAt));
            db.collection('points').where('uploadedAt', '>', since).get()
              .then(snap => {
                const deltaB = [];
                snap.forEach(doc => {
                  if (loadedFirebasePointIds.has(doc.id)) return;
                  loadedFirebasePointIds.add(doc.id);
                  const d = doc.data();
                  deltaB.push({ pointData: { name: d.name, lat: d.lat, lon: d.lon, url: resolvePointUrl(d, d.metadata), metadata: d.metadata || {} }, fileName: d.fileName, firebaseDocId: doc.id });
                });
                if (deltaB.length > 0) { addPointsBatch(deltaB); }
                markLoaded('points');
              })
              .catch(() => markLoaded('points'));
          } else {
            markLoaded('points');
          }
        })
        .catch(() => {
          console.info('Points snapshot not found; loading from Firestore...');
          _loadFirebasePointsFirestore(null);
        });
      return;
    }

    _loadFirebasePointsFirestore(lastDoc);
  }

  function _loadFirebasePointsFirestore(lastDoc) {
    let query = db.collection('points').orderBy('uploadedAt', 'desc').limit(POINTS_BATCH_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    query.get()
      .then(snapshot => {
        const batch = [];
        snapshot.forEach(doc => {
          if (loadedFirebasePointIds.has(doc.id)) return;
          loadedFirebasePointIds.add(doc.id);
          const data = doc.data();
          batch.push({ pointData: { name: data.name, lat: data.lat, lon: data.lon, url: resolvePointUrl(data, data.metadata), metadata: data.metadata||{} }, fileName: data.fileName, firebaseDocId: doc.id });
        });
        if (batch.length > 0) {
          addPointsBatch(batch);
        }
        if (snapshot.size === POINTS_BATCH_SIZE) {
          const nextLast = snapshot.docs[snapshot.docs.length - 1];
          const scheduleNext = typeof requestIdleCallback === 'function'
            ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
            : (fn) => setTimeout(fn, 0);
          scheduleNext(() => loadFirebasePoints(nextLast));
        } else {
          markLoaded('points');
        }
      })
      .catch(err => { console.error('Firestore points read error:', err); markLoaded('points'); });
  }

  function deleteFirebaseRoute(routeIdx) {
    const route = routes[routeIdx];
    if (!route.firebaseDocId || !isAdmin()) return;
    if (!confirm('Delete "' + route.routeName + '" from Firebase?')) return;
    db.collection('routes').doc(route.firebaseDocId).get()
      .then(doc => { const data = doc.data(); return storage.ref(data.storagePath).delete().then(() => db.collection('routes').doc(route.firebaseDocId).delete()); })
      .then(() => { removeRouteFromMap(routeIdx); })
      .catch(err => { console.error('Delete error:', err); alert('Delete failed: ' + err.message); });
  }

  // ── Metadata modal ──────────────────────────────────────────
  let metaRouteIdx = null;
  const metaOverlay = document.getElementById('meta-overlay');
  const metaTitle = document.getElementById('meta-title');
  const metaBody = document.getElementById('meta-body');
  const metaSaveBtn = document.getElementById('meta-save-btn');
  const metaCloseBtn = document.getElementById('meta-close-btn');

  metaCloseBtn.addEventListener('click', () => { metaOverlay.classList.remove('open'); metaRouteIdx = null; metaPointIdx = null; });
  metaOverlay.addEventListener('click', (e) => { if (e.target === metaOverlay) { metaOverlay.classList.remove('open'); metaRouteIdx = null; metaPointIdx = null; } });

  function openMetadataModal(idx) {
    const route = routes[idx]; if (!route.firebaseDocId) return;
    metaRouteIdx = idx; metaTitle.textContent = route.routeName;
    metaBody.innerHTML = '<span style="color:#888;">Loading...</span>'; metaSaveBtn.style.display = 'none'; metaOverlay.classList.add('open');
    db.collection('routes').doc(route.firebaseDocId).get()
      .then(doc => { const meta = (doc.data()||{}).metadata||{}; if (isAdmin()) renderMetadataEdit(meta); else renderMetadataView(meta); })
      .catch(err => { metaBody.innerHTML = '<span style="color:#ff6b6b;">Failed to load metadata.</span>'; console.error('Metadata load error:', err); });
  }

  function renderMetadataView(meta) {
    let html = '<label>Source Link</label>';
    html += meta.sourceUrl ? '<div class="meta-view-value"><a class="meta-link" href="' + escapeAttr(meta.sourceUrl) + '" target="_blank" rel="noopener">' + escapeHtml(meta.sourceUrl) + '</a></div>' : '<div class="meta-view-value empty">Not provided</div>';
    html += '<label>Description</label><div class="meta-view-value' + (meta.description ? '' : ' empty') + '">' + (meta.description ? escapeHtml(meta.description) : 'No description') + '</div>';
    html += '<label>Notes</label><div class="meta-view-value' + (meta.notes ? '' : ' empty') + '">' + (meta.notes ? escapeHtml(meta.notes) : 'No notes') + '</div>';
    metaBody.innerHTML = html; metaSaveBtn.style.display = 'none';
  }

  function renderMetadataEdit(meta) {
    metaBody.innerHTML =
      '<label for="meta-source-url">Source Link</label><input type="text" id="meta-source-url" placeholder="https://example.com/route-page" value="' + escapeAttr(meta.sourceUrl||'') + '">' +
      '<label for="meta-description">Description</label><textarea id="meta-description" placeholder="Brief description of this route">' + escapeHtml(meta.description||'') + '</textarea>' +
      '<label for="meta-notes">Notes</label><textarea id="meta-notes" placeholder="Any additional notes">' + escapeHtml(meta.notes||'') + '</textarea>';
    metaSaveBtn.style.display = ''; metaSaveBtn.onclick = saveMetadata;
  }

  function saveMetadata() {
    if (metaRouteIdx === null) return;
    const route = routes[metaRouteIdx]; if (!route.firebaseDocId || !isAdmin()) return;
    const metadata = { sourceUrl: document.getElementById('meta-source-url').value.trim(), description: document.getElementById('meta-description').value.trim(), notes: document.getElementById('meta-notes').value.trim() };
    metaSaveBtn.disabled = true; metaSaveBtn.textContent = 'Saving...';
    db.collection('routes').doc(route.firebaseDocId).update({ metadata })
      .then(() => { metaSaveBtn.textContent = 'Saved!'; setTimeout(() => { metaSaveBtn.textContent = 'Save'; metaSaveBtn.disabled = false; }, 1500); })
      .catch(err => { console.error('Metadata save error:', err); metaSaveBtn.textContent = 'Save'; metaSaveBtn.disabled = false; alert('Failed to save metadata: ' + err.message); });
  }

  function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
  function escapeAttr(str) { return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Packing checklist ───────────────────────────────────────
  function updatePackProgress() {
    const items = document.querySelectorAll('.pack-check');
    const checked = document.querySelectorAll('.pack-check.checked').length;
    const el = document.getElementById('packProgress');
    if (el) el.textContent = checked + ' of ' + items.length + ' items packed';
  }
  updatePackProgress();

  // ── Safety timeout: dismiss loading overlay after 30 s ──────
  const _loadingTimeoutId = setTimeout(function() {
    const overlay = document.getElementById('map-loading');
    if (overlay) { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 500); }
  }, 30000);

  // ── Initialise ─────────────────────────────────────────────
  initFirebase();
  // PMTiles overlay layers are non-essential for the initial view; defer their
  // loading until the browser is idle (or after 2 s on unsupported browsers)
  // so essential Firebase data and the base map render first.
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(initPMTilesLayer, { timeout: 1000 });
  } else {
    setTimeout(initPMTilesLayer, 1000);
  }
})();

function toggleCheck(el) {
  el.classList.toggle('checked');
  el.textContent = el.classList.contains('checked') ? '✓' : '';
  const items = document.querySelectorAll('.pack-check');
  const checked = document.querySelectorAll('.pack-check.checked').length;
  const prog = document.getElementById('packProgress');
  if (prog) prog.textContent = checked + ' of ' + items.length + ' items packed';
}

// ── Fullscreen map toggle ───────────────────────────────────
(function () {
  const fsBtn = document.getElementById('fullscreen-btn');
  const fsExpandIcon = document.getElementById('fs-expand-icon');
  const fsCollapseIcon = document.getElementById('fs-collapse-icon');
  const mapWrapper = document.getElementById('map-wrapper');

  fsBtn.addEventListener('click', function () {
    const isFullscreen = mapWrapper.classList.toggle('map-fullscreen');
    fsExpandIcon.style.display = isFullscreen ? 'none' : '';
    fsCollapseIcon.style.display = isFullscreen ? '' : 'none';
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    setTimeout(function () {
      if (typeof map !== 'undefined') map.invalidateSize();
    }, 200);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mapWrapper.classList.contains('map-fullscreen')) {
      mapWrapper.classList.remove('map-fullscreen');
      fsExpandIcon.style.display = '';
      fsCollapseIcon.style.display = 'none';
      document.body.style.overflow = '';
      setTimeout(function () {
        if (typeof map !== 'undefined') map.invalidateSize();
      }, 200);
    }
  });
}());
