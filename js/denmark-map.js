// js/denmark-map.js — Interactive planning map for the Denmark trip
// Loads points from a static JSON snapshot (assets/denmark-points.json) with
// server-side clustering at zoom levels 3–7; shows PMTiles route overlays,
// point-type filter UI, fullscreen toggle.

// ── PMTiles protocol interceptor ────────────────────────────
// Idempotent: shared with route-map.js; only installed once per page load.
(function () {
  if (window.__routeMapInterceptorInstalled) return;
  window.__routeMapInterceptorInstalled = true;
  var _orig = window.fetch;
  window.__pmtilesInstances = window.__pmtilesInstances || {};
  window.fetch = function denmarkMapFetch(resource, options) {
    var u = typeof resource === 'string' ? resource
          : (resource && typeof resource === 'object' ? resource.url : '');
    if (u && u.startsWith('pmtiles://')) {
      var m = u.match(/^pmtiles:\/\/([^/]+)\/(-?\d+)\/(-?\d+)\/(-?\d+)$/);
      if (m) {
        var p = window.__pmtilesInstances[m[1]];
        if (p) {
          return p.getZxy(+m[2], +m[3], +m[4]).then(function (result) {
            if (!result || !result.data) return new Response(new ArrayBuffer(0), { status: 200 });
            return new Response(result.data, { status: 200 });
          });
        }
      }
      return Promise.reject(new TypeError('pmtiles:// – no instance for: ' + u));
    }
    if (u && u.endsWith('.pmtiles') && options && options.cache) {
      var stripped = Object.assign({}, options);
      delete stripped.cache;
      return _orig.call(window, resource, stripped);
    }
    return _orig.call(window, resource, options);
  };
}());

(function () {
  'use strict';

  // ── Constants ───────────────────────────────────────────────
  const POINT_ICON_SIZE    = [18, 18];
  const POINT_ICON_ANCHOR  = [9, 9];
  const POINT_POPUP_ANCHOR = [0, -10];

  const POINT_TYPE_ICONS = {
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
    'Shelter': {
      color: '#d35400',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#d35400" stroke="#fff" stroke-width="1.5"/><path d="M7 17V9l10 4v4H7z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>'
    },
    'Canoe/Kayak Site': {
      color: '#1565c0',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#1565c0" stroke="#fff" stroke-width="1.5"/><line x1="12" y1="6" x2="12" y2="18" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="12" cy="7.5" rx="3" ry="1.8" fill="none" stroke="#fff" stroke-width="1.3"/><ellipse cx="12" cy="16.5" rx="3" ry="1.8" fill="none" stroke="#fff" stroke-width="1.3"/></svg>'
    },
    'Tent Site': {
      color: '#229954',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#229954" stroke="#fff" stroke-width="1.5"/><path d="M12 7L6 17h12L12 7z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><path d="M10.5 17v-3h3v3" fill="none" stroke="#fff" stroke-width="1"/></svg>'
    },
    'Wild Camping': {
      color: '#16a085',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#16a085" stroke="#fff" stroke-width="1.5"/><path d="M12 9L6 17h12L12 9z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><path d="M10.5 17v-2.5h3v2.5" fill="none" stroke="#fff" stroke-width="1"/><circle cx="12" cy="6.5" r="1.5" fill="#fff"/></svg>'
    },
    'Hammock Grove': {
      color: '#6d4c41',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#6d4c41" stroke="#fff" stroke-width="1.5"/><line x1="7" y1="9" x2="7" y2="17" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="17" y1="9" x2="17" y2="17" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M7 12Q12 15.5 17 12" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><path d="M7 14Q12 17.5 17 14" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>'
    },
    'Fire Hut': {
      color: '#e74c3c',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#e74c3c" stroke="#fff" stroke-width="1.5"/><path d="M12 5.5L6 11h1.5v6h9v-6H18L12 5.5z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><line x1="10" y1="15.5" x2="14" y2="15.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/><line x1="10.5" y1="15.5" x2="12" y2="12.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/><line x1="13.5" y1="15.5" x2="12" y2="12.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>'
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

  const _pointIconCache = {};
  function getPointIcon(type) {
    const key = normalizePointType(type);
    if (_pointIconCache[key]) return _pointIconCache[key];
    const iconDef = POINT_TYPE_ICONS[key] || POINT_TYPE_ICONS['_default'];
    const icon = L.divIcon({
      html: iconDef.svg,
      className: 'point-type-icon',
      iconSize: POINT_ICON_SIZE,
      iconAnchor: POINT_ICON_ANCHOR,
      popupAnchor: POINT_POPUP_ANCHOR
    });
    _pointIconCache[key] = icon;
    return icon;
  }

  function normalizePointType(type) {
    const raw = type ? String(type).trim() : '';
    if (!raw) return '_default';
    if (/^3071$|fri.?telt|wild.?camp/i.test(raw))       return 'Wild Camping';
    if (/camp/i.test(raw))                               return 'Campsite';
    if (/roadside\s*station/i.test(raw))                 return 'Roadside Station';
    if (/must\s*see/i.test(raw))                         return 'Must See';
    if (/hotel/i.test(raw))                              return 'Hotel';
    if (/^3012$|shelter/i.test(raw))                     return 'Shelter';
    if (/^3022$|kano|kajak|canoe|kayak/i.test(raw))      return 'Canoe/Kayak Site';
    if (/^3031$|teltplads|tent.?site/i.test(raw))        return 'Tent Site';
    if (/^3081$|hæng|hammock/i.test(raw))                return 'Hammock Grove';
    if (/^3091$|bålhytte|fire.?hut/i.test(raw))          return 'Fire Hut';
    if (/other/i.test(raw))                              return 'Other';
    return POINT_TYPE_ICONS[raw] ? raw : 'Other';
  }

  function getPointType(pointData) {
    const rawType = pointData && pointData.metadata
      ? (pointData.metadata.Type || pointData.metadata.type || pointData.type || null)
      : (pointData ? pointData.type : null);
    const normalized = normalizePointType(rawType);
    return normalized === '_default' ? 'Other' : normalized;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Map initialisation ──────────────────────────────────────
  const map = L.map('map', {
    renderer: L.canvas({ tolerance: 10 })
  }).setView([56.0, 10.5], 6);

  const baseLayers = {
    'CyclOSM (Cycling)': L.tileLayer(
      'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://www.cyclosm.org">CyclOSM</a>',
        maxZoom: 20,
        updateWhenIdle: true,
        keepBuffer: 1
      }
    ),
    'ESRI Topo': L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
        maxZoom: 19,
        updateWhenIdle: true,
        keepBuffer: 1
      }
    )
  };

  baseLayers['CyclOSM (Cycling)'].addTo(map);

  const overlayLayers = {
    'Waymarked Cycling Routes': L.tileLayer(
      'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
      {
        attribution: '&copy; <a href="https://cycling.waymarkedtrails.org">Waymarked Trails</a>',
        maxZoom: 19,
        opacity: 0.85
      }
    )
  };

  const layerControl = L.control.layers(baseLayers, overlayLayers, {
    position: 'bottomleft',
    collapsed: true
  }).addTo(map);

  L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

  const pointLayerGroup = L.layerGroup().addTo(map);

  // ── "Show My Location" control ─────────────────────────────
  (function addLocationControl() {
    const LocationControl = L.Control.extend({
      onAdd: function () {
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
        L.DomEvent.on(btn, 'click', function (e) {
          L.DomEvent.preventDefault(e);
          L.DomEvent.stopPropagation(e);
          if (!navigator.geolocation) { alert('Geolocation is not supported by this browser.'); return; }
          btn.innerHTML = '⏳';
          navigator.geolocation.getCurrentPosition(
            function (pos) {
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
            function (err) {
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

  // ── Point data ──────────────────────────────────────────────
  const points = [];
  const pointTypeFilters = new Set();
  const _seenPointTypes = new Set();

  // ── Snapshot state ──────────────────────────────────────────
  let _pointsLoadStarted = false;
  let snapshotRawPoints = null;
  let serverClusterLevels = null;
  let serverClusterLevelKeys = [];
  let serverClusterLevelActiveKey = null;
  let serverClusterDisableZoom = 8;
  let _onZoomEndSnapshot = null;

  function getAvailablePointTypes() {
    const available = new Set();
    points.forEach(p => available.add(p.type || 'Other'));
    if (available.size === 0) {
      ['Campsite', 'Roadside Station', 'Must See', 'Hotel', 'Other'].forEach(t => available.add(t));
    }
    return Array.from(available);
  }

  // ── Viewport culling ────────────────────────────────────────
  let _moveEndTimer = null;
  map.on('moveend', function () {
    if (_moveEndTimer) clearTimeout(_moveEndTimer);
    _moveEndTimer = setTimeout(applyPointTypeFilters, 150);
  });

  // ── Zoom-based cluster switching ────────────────────────────
  let _zoomEndTimer = null;
  map.on('zoomend', function () {
    if (_zoomEndTimer) clearTimeout(_zoomEndTimer);
    _zoomEndTimer = setTimeout(function () {
      _zoomEndTimer = null;
      const zoom = map.getZoom();
      if (_onZoomEndSnapshot) _onZoomEndSnapshot(zoom);
    }, 150);
  });

  function applyPointTypeFilters() {
    const bounds = map.getBounds().pad(0.6);
    points.forEach(p => {
      const type = p.type || 'Other';
      const show = pointTypeFilters.has(type) && bounds.contains([p.lat, p.lon]);
      if (show) {
        if (!p.marker) p.marker = createPointMarker(p);
        pointLayerGroup.addLayer(p.marker);
      } else if (p.marker) {
        pointLayerGroup.removeLayer(p.marker);
      }
    });
  }

  function createPointMarker(pointData) {
    // Render cluster node (pre-aggregated by the snapshot generator)
    const clusterMeta = pointData && pointData.metadata && pointData.metadata.__cluster;
    const clusterCount = Number(clusterMeta && clusterMeta.count) || 0;
    if (clusterCount > 1) {
      const clusterClass = clusterCount > 100 ? 'marker-cluster-large'
                         : clusterCount > 10  ? 'marker-cluster-medium'
                         : 'marker-cluster-small';
      const marker = L.marker([pointData.lat, pointData.lon], {
        icon: L.divIcon({
          html: '<div><span>' + clusterCount + '</span></div>',
          className: 'marker-cluster ' + clusterClass,
          iconSize: L.point(40, 40)
        })
      });
      marker.bindPopup(function () {
        const items = (clusterMeta && clusterMeta.items) || [];
        let html = '<b>' + escapeHtml(pointData.name || 'Cluster') + '</b><br>'
                 + '<span style="font-size:0.9em;color:#6c757d;">' + clusterCount + ' points</span>';
        if (items.length > 0) {
          html += '<ul style="margin:0.4em 0 0 1.1em;padding:0;max-height:180px;overflow:auto">';
          items.forEach(function (item) {
            const n = item && item.name ? item.name : 'Point';
            const u = item && item.url ? String(item.url) : '';
            html += '<li>' + (u ? '<a href="' + escapeAttr(u) + '" target="_blank" rel="noopener">' + escapeHtml(n) + '</a>' : escapeHtml(n)) + '</li>';
          });
          html += '</ul>';
        }
        return html;
      });
      return marker;
    }

    // Individual point marker
    const pointType = getPointType(pointData);
    const marker = L.marker([pointData.lat, pointData.lon], { icon: getPointIcon(pointType) });
    marker.bindPopup(function () {
      const pointUrl = pointData.url || null;
      let content = '<b>' + escapeHtml(pointData.name) + '</b>';
      if (pointType !== '_default') {
        content += '<br><span style="font-size:0.85em;color:#6c757d;">' + escapeHtml(pointType) + '</span>';
      }
      if (pointData.metadata) {
        const meta = pointData.metadata;
        const desc  = meta.description || meta.Description || '';
        const notes = meta.notes || meta.Notes || '';
        if (desc)  content += '<span style="color:#6c757d;font-size:0.92em;display:block;margin-top:0.3em;">' + escapeHtml(desc) + '</span>';
        if (notes) content += '<span style="color:#6c757d;font-size:0.88em;font-style:italic;display:block;">' + escapeHtml(notes) + '</span>';
      }
      if (pointUrl) {
        content += '<br><a href="' + escapeAttr(pointUrl) + '" target="_blank" rel="noopener" aria-label="View details for ' + escapeAttr(pointData.name) + '">View Details</a>';
      }
      return content;
    });
    return marker;
  }

  // ── Snapshot helpers ────────────────────────────────────────

  function normalizeSnapshotPoint(d) {
    return {
      name: d.name || 'Point',
      lat: d.lat,
      lon: d.lon,
      url: d.url || null,
      type: d.type || null,
      metadata: d.metadata || {},
      fileName: d.fileName || 'denmark-points.json',
      id: d.id || null
    };
  }

  function normalizeServerClusterPoint(d) {
    const pd = normalizeSnapshotPoint(d);
    const count = Number(d && d.metadata && d.metadata.__cluster && d.metadata.__cluster.count || 0);
    if (count > 1 && (!pd.metadata || !pd.metadata.__cluster)) {
      pd.metadata = Object.assign({}, pd.metadata, {
        __cluster: { count, items: Array.isArray(d.items) ? d.items : [] }
      });
    }
    return pd;
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
      return { levelKey, points: serverClusterLevels[levelKey].map(normalizeServerClusterPoint) };
    }
    return { levelKey: null, points: (snapshotRawPoints || []).map(normalizeSnapshotPoint) };
  }

  function applySnapshotDisplayForZoom(zoom, force) {
    if (!snapshotRawPoints) return;
    const display = getSnapshotDisplayPointsForZoom(zoom);
    if (!force && serverClusterLevelActiveKey === display.levelKey) return;
    serverClusterLevelActiveKey = display.levelKey;
    pointLayerGroup.clearLayers();
    points.length = 0;
    display.points.forEach(function (d) {
      const pointType = getPointType(d);
      points.push({
        name: d.name || 'Point',
        lat: d.lat,
        lon: d.lon,
        url: d.url || null,
        type: pointType,
        metadata: d.metadata || {},
        marker: null
      });
    });
    renderPointToggles();
  }

  function renderPointToggles() {
    const container = document.getElementById('type-filters');
    if (!container) return;
    container.innerHTML = '';
    const availableTypes = getAvailablePointTypes();
    availableTypes.forEach(t => {
      if (!_seenPointTypes.has(t)) { _seenPointTypes.add(t); pointTypeFilters.add(t); }
    });
    const typeCounts = Object.create(null);
    points.forEach(p => { const t = p.type || 'Other'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
    availableTypes.forEach(type => {
      const count = typeCounts[type] || 0;
      const iconDef = POINT_TYPE_ICONS[type] || POINT_TYPE_ICONS['_default'];
      const lbl = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = pointTypeFilters.has(type);
      cb.addEventListener('change', function () { togglePointType(type, cb.checked); });
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

  function togglePointType(type, isChecked) {
    if (isChecked) pointTypeFilters.add(type); else pointTypeFilters.delete(type);
    applyPointTypeFilters();
  }

  // ── Filter popup open / close ───────────────────────────────
  (function setupFilterPopup() {
    const filterBtn    = document.getElementById('filter-btn');
    const filterPopup  = document.getElementById('filter-popup');
    const filterClose  = document.getElementById('filter-close-btn');
    const filterAll    = document.getElementById('filter-select-all');
    const filterNone   = document.getElementById('filter-clear-all');
    if (!filterBtn || !filterPopup) return;
    filterBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      filterPopup.classList.toggle('open');
    });
    filterClose.addEventListener('click', function () { filterPopup.classList.remove('open'); });
    document.addEventListener('click', function (e) {
      if (!filterPopup.contains(e.target) && !filterBtn.contains(e.target)) {
        filterPopup.classList.remove('open');
      }
    });
    filterPopup.addEventListener('click', function (e) { e.stopPropagation(); });
    filterAll.addEventListener('click', function () {
      getAvailablePointTypes().forEach(t => { pointTypeFilters.add(t); _seenPointTypes.add(t); });
      renderPointToggles();
    });
    filterNone.addEventListener('click', function () {
      pointTypeFilters.clear();
      getAvailablePointTypes().forEach(t => _seenPointTypes.add(t));
      renderPointToggles();
    });
  })();

  // ── Route line weight ───────────────────────────────────────
  function getRouteWeight(zoom) {
    if (zoom >= 17) return 0.5;
    if (zoom >= 15) return 0.75;
    if (zoom >= 13) return 1.2;
    if (zoom >= 11) return 1.8;
    if (zoom >= 9)  return 2.2;
    if (zoom >= 7)  return 2;
    return 1.5;
  }

  // ── PMTiles route overlays ──────────────────────────────────
  function initPMTilesLayer() {
    if (typeof pmtiles === 'undefined' || typeof L.vectorGrid === 'undefined') return;

    function buildLayer(pmtilesUrl, instanceKey) {
      const absUrl = new URL(pmtilesUrl, location.href).href;
      const p = new pmtiles.PMTiles(absUrl);
      window.__pmtilesInstances[instanceKey] = p;
      return p.getHeader()
        .catch(function () { return { minZoom: 2, maxZoom: 14 }; })
        .then(function (header) {
          return L.vectorGrid.protobuf('pmtiles://' + instanceKey + '/{z}/{x}/{y}', {
            vectorTileLayerStyles: {
              routes: function (properties) {
                return {
                  weight: getRouteWeight(map.getZoom()),
                  color: properties.color || '#5B8C6B',
                  opacity: 0.85,
                  fill: false
                };
              }
            },
            interactive: false,
            maxNativeZoom: header.maxZoom || 14,
            minNativeZoom: header.minZoom || 2,
            updateWhenZooming: false,
            keepBuffer: 4
          });
        });
    }

    function loadTile(storageName, instanceKey, overlayLabel, addToMap) {
      buildLayer('assets/tiles/' + storageName, instanceKey)
        .then(function (layer) {
          layerControl.addOverlay(layer, overlayLabel);
          if (addToMap) layer.addTo(map);
        })
        .catch(function (err) {
          console.warn('PMTiles layer "' + overlayLabel + '" unavailable:', err && err.message || err);
        });
    }

    // My Routes is split into several per-trip shards (see
    // scripts/generate-pmtiles.js) so no single file grows past GitHub's
    // 100 MB limit. The manifest lists which shards exist; they're all
    // grouped into one layer so the UI still shows a single "My Routes"
    // toggle, same as before.
    function loadMyRoutesShards() {
      fetch('assets/tiles/my-routes-manifest.json').then(function (res) {
        if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
        return res.json();
      }).then(function (manifest) {
        var categories = (manifest && manifest.categories) || [];
        return Promise.all(categories.map(function (category) {
          return buildLayer('assets/tiles/my-routes-' + category + '.pmtiles', 'dk-my-routes-' + category);
        }));
      }).then(function (layers) {
        if (layers.length === 0) return;
        var group = L.layerGroup(layers);
        layerControl.addOverlay(group, 'My Routes (tiles)');
        group.addTo(map);
      }).catch(function (err) {
        console.warn('PMTiles layer "My Routes (tiles)" unavailable:', err && err.message || err);
      });
    }

    loadMyRoutesShards();
    loadTile('planned-routes.pmtiles', 'dk-planned-routes', 'Planned Routes (tiles)', true);
  }

  // ── Loading overlay helpers ─────────────────────────────────
  function dismissLoadingOverlay() {
    const overlay = document.getElementById('map-loading');
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 500);
    }
  }

  const _safetyTimeout = setTimeout(dismissLoadingOverlay, 30000);

  // ── Load Denmark points from static snapshot ────────────────
  const DENMARK_SNAPSHOT_URL = 'assets/denmark-points.json';

  function loadDenmarkSnapshot() {
    if (_pointsLoadStarted) return;
    _pointsLoadStarted = true;

    fetch(DENMARK_SNAPSHOT_URL, { cache: 'default' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.points)) throw new Error('unrecognised snapshot format');
        if (data.points.length === 0) throw new Error('empty snapshot');

        snapshotRawPoints = data.points;

        const disableZoom = data.clusterZoomRange && Number(data.clusterZoomRange.disableClusteringAtZoom);
        serverClusterDisableZoom = Number.isFinite(disableZoom) ? disableZoom : 8;

        if (data.clustersByZoom && typeof data.clustersByZoom === 'object') {
          serverClusterLevels = data.clustersByZoom;
          serverClusterLevelKeys = Object.keys(serverClusterLevels)
            .map(function (k) { return Number(k); })
            .filter(Number.isFinite)
            .sort(function (a, b) { return a - b; });
        } else {
          serverClusterLevels = null;
          serverClusterLevelKeys = [];
        }

        serverClusterLevelActiveKey = null;
        applySnapshotDisplayForZoom(map.getZoom(), true);

        if (serverClusterLevelKeys.length > 0) {
          _onZoomEndSnapshot = function (zoom) { applySnapshotDisplayForZoom(zoom, false); };
        }

        // Fit map to a sample of the raw points so the view isn't dominated by
        // a handful of z3 cluster centroids spanning the whole country.
        const sample = snapshotRawPoints.slice(0, 200);
        if (sample.length > 0) {
          const fg = L.featureGroup(sample.map(function (p) { return L.marker([p.lat, p.lon]); }));
          map.fitBounds(fg.getBounds(), { padding: [40, 40], maxZoom: 12 });
        }

        clearTimeout(_safetyTimeout);
        dismissLoadingOverlay();
      })
      .catch(function (err) {
        console.warn('Denmark: could not load snapshot:', err && err.message || err);
        clearTimeout(_safetyTimeout);
        dismissLoadingOverlay();
      });
  }

  // ── Initialise ──────────────────────────────────────────────
  loadDenmarkSnapshot();

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(initPMTilesLayer, { timeout: 1000 });
  } else {
    setTimeout(initPMTilesLayer, 1000);
  }

}());

// ── Fullscreen map toggle ────────────────────────────────────
(function () {
  const fsBtn          = document.getElementById('fullscreen-btn');
  const fsExpandIcon   = document.getElementById('fs-expand-icon');
  const fsCollapseIcon = document.getElementById('fs-collapse-icon');
  const mapWrapper     = document.getElementById('map-wrapper');
  if (!fsBtn || !mapWrapper) return;

  fsBtn.addEventListener('click', function () {
    const isFullscreen = mapWrapper.classList.toggle('map-fullscreen');
    fsExpandIcon.style.display   = isFullscreen ? 'none' : '';
    fsCollapseIcon.style.display = isFullscreen ? '' : 'none';
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    setTimeout(function () {
      if (typeof map !== 'undefined') map.invalidateSize();
    }, 200);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mapWrapper.classList.contains('map-fullscreen')) {
      mapWrapper.classList.remove('map-fullscreen');
      fsExpandIcon.style.display   = '';
      fsCollapseIcon.style.display = 'none';
      document.body.style.overflow = '';
      setTimeout(function () {
        if (typeof map !== 'undefined') map.invalidateSize();
      }, 200);
    }
  });
}());
