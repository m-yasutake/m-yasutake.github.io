// js/country-map.js — Shared interactive planning map for a single country.
// Loads points from a static JSON snapshot with server-side clustering,
// shows PMTiles route overlays, point-type filter UI, fullscreen toggle.
//
// Per-country differences (icon set, type-normalization rules, popup fields,
// map center, optional facilities layer, etc.) are supplied as a config
// object to CountryMap.init(). See js/norway-map.js / js/denmark-map.js for
// the thin per-country config files that call this.
//
// Usage:
//   CountryMap.init({
//     id: 'norway',                       // short id, used for pmtiles instance keys
//     center: [64.5, 14.0], zoom: 5,
//     snapshotUrl: 'assets/norway-points.json',
//     facilitiesUrl: 'assets/norway-facilities.json',  // optional
//     pointTypeIcons: { ... },            // see existing files for the shape
//     normalizePointType: function (raw) { ... },
//     defaultPointTypes: ['Campsite', 'Roadside Station', 'Must See', 'Hotel', 'Other'],
//     metadataFields: [{ label: 'Capacity', keys: ['capacity', 'Capacity'] }, ...],
//     descKeys: ['description_text', 'description', 'Description'],
//     notesKeys: ['notes', 'Notes']
//   });

// ── PMTiles protocol interceptor ────────────────────────────
// Idempotent: shared with route-map.js; only installed once per page load.
(function () {
  if (window.__routeMapInterceptorInstalled) return;
  window.__routeMapInterceptorInstalled = true;
  var _orig = window.fetch;
  window.__pmtilesInstances = window.__pmtilesInstances || {};
  window.fetch = function countryMapFetch(resource, options) {
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

  function init(config) {
    var id                 = config.id;
    var snapshotUrl        = config.snapshotUrl;
    var facilitiesUrl      = config.facilitiesUrl || null;
    var POINT_TYPE_ICONS   = config.pointTypeIcons;
    var normalizePointType = config.normalizePointType;
    var defaultPointTypes  = config.defaultPointTypes || ['Other'];
    var metadataFields     = config.metadataFields || [];
    var descKeys           = config.descKeys || ['description', 'Description'];
    var notesKeys          = config.notesKeys || ['notes', 'Notes'];
    var fitBoundsToPoints  = config.fitBoundsToPoints !== false;

    // ── Constants ───────────────────────────────────────────────
    var POINT_ICON_SIZE    = [18, 18];
    var POINT_ICON_ANCHOR  = [9, 9];
    var POINT_POPUP_ANCHOR = [0, -10];

    var _pointIconCache = {};
    function getPointIcon(type) {
      var key = normalizePointType(type);
      if (_pointIconCache[key]) return _pointIconCache[key];
      var iconDef = POINT_TYPE_ICONS[key] || POINT_TYPE_ICONS['_default'];
      var icon = L.divIcon({
        html: iconDef.svg,
        className: 'point-type-icon',
        iconSize: POINT_ICON_SIZE,
        iconAnchor: POINT_ICON_ANCHOR,
        popupAnchor: POINT_POPUP_ANCHOR
      });
      _pointIconCache[key] = icon;
      return icon;
    }

    function getPointType(pointData) {
      var rawType = pointData && pointData.metadata
        ? (pointData.metadata.Type || pointData.metadata.type || pointData.type || null)
        : (pointData ? pointData.type : null);
      var normalized = normalizePointType(rawType);
      return normalized === '_default' ? 'Other' : normalized;
    }

    function firstMetaValue(meta, keys) {
      for (var i = 0; i < keys.length; i++) {
        if (meta[keys[i]]) return meta[keys[i]];
      }
      return '';
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
    var map = L.map('map', {
      renderer: L.canvas({ tolerance: 10 })
    }).setView(config.center, config.zoom);

    var baseLayers = {
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

    var overlayLayers = {
      'Waymarked Cycling Routes': L.tileLayer(
        'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
        {
          attribution: '&copy; <a href="https://cycling.waymarkedtrails.org">Waymarked Trails</a>',
          maxZoom: 19,
          opacity: 0.85
        }
      )
    };

    var layerControl = L.control.layers(baseLayers, overlayLayers, {
      position: 'bottomleft',
      collapsed: true
    }).addTo(map);

    L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

    var pointLayerGroup      = L.layerGroup().addTo(map);
    var facilitiesLayerGroup = facilitiesUrl ? L.layerGroup().addTo(map) : null;

    // ── "Show My Location" control ─────────────────────────────
    (function addLocationControl() {
      var LocationControl = L.Control.extend({
        onAdd: function () {
          var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
          var btn = L.DomUtil.create('a', '', container);
          btn.innerHTML = '📍';
          btn.href = '#';
          btn.title = 'Show my location';
          btn.setAttribute('role', 'button');
          btn.setAttribute('aria-label', 'Show my location');
          btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:30px;height:30px;font-size:1.1em;text-decoration:none;cursor:pointer;';
          var _locationMarker = null;
          var _locationCircle = null;
          L.DomEvent.on(btn, 'click', function (e) {
            L.DomEvent.preventDefault(e);
            L.DomEvent.stopPropagation(e);
            if (!navigator.geolocation) { alert('Geolocation is not supported by this browser.'); return; }
            btn.innerHTML = '⏳';
            navigator.geolocation.getCurrentPosition(
              function (pos) {
                btn.innerHTML = '📍';
                var latlng = [pos.coords.latitude, pos.coords.longitude];
                var accuracy = pos.coords.accuracy;
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
                var msgs = { 1: 'Location access denied. Please allow location access in your browser settings.', 2: 'Location unavailable.', 3: 'Location request timed out.' };
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
    var points          = [];
    var facilitiesPoints = [];
    var pointTypeFilters = new Set();
    var _seenPointTypes  = new Set();

    // ── Snapshot state ──────────────────────────────────────────
    var _pointsLoadStarted = false;
    var snapshotRawPoints = null;
    var serverClusterLevels = null;
    var serverClusterLevelKeys = [];
    var serverClusterLevelActiveKey = null;
    var serverClusterDisableZoom = 8;
    var _onZoomEndSnapshot = null;

    // ── Facilities cluster state (only used when facilitiesUrl is set) ──
    var facilitiesRawPoints = null;
    var facilityClusterLevels = null;
    var facilityClusterLevelKeys = [];
    var facilityClusterLevelActiveKey = null;
    var facilityClusterDisableZoom = 8;
    var _onZoomEndFacilities = null;

    function getAvailablePointTypes() {
      var available = new Set();
      points.forEach(function (p) { available.add(p.type || 'Other'); });
      facilitiesPoints.forEach(function (p) { available.add(p.type || 'Other'); });
      if (available.size === 0) {
        defaultPointTypes.forEach(function (t) { available.add(t); });
      }
      return Array.from(available);
    }

    // ── Viewport culling ────────────────────────────────────────
    var _moveEndTimer = null;
    map.on('moveend', function () {
      if (_moveEndTimer) clearTimeout(_moveEndTimer);
      _moveEndTimer = setTimeout(applyPointTypeFilters, 150);
    });

    // ── Zoom-based cluster switching ────────────────────────────
    var _zoomEndTimer = null;
    map.on('zoomend', function () {
      if (_zoomEndTimer) clearTimeout(_zoomEndTimer);
      _zoomEndTimer = setTimeout(function () {
        _zoomEndTimer = null;
        var zoom = map.getZoom();
        if (_onZoomEndSnapshot)   _onZoomEndSnapshot(zoom);
        if (_onZoomEndFacilities) _onZoomEndFacilities(zoom);
      }, 150);
    });

    function applyPointTypeFilters() {
      var bounds = map.getBounds().pad(0.6);
      points.forEach(function (p) {
        var type = p.type || 'Other';
        var show = pointTypeFilters.has(type) && bounds.contains([p.lat, p.lon]);
        if (show) {
          if (!p.marker) p.marker = createPointMarker(p);
          pointLayerGroup.addLayer(p.marker);
        } else if (p.marker) {
          pointLayerGroup.removeLayer(p.marker);
        }
      });
      if (facilitiesLayerGroup) {
        facilitiesPoints.forEach(function (p) {
          var type = p.type || 'Other';
          var show = pointTypeFilters.has(type) && bounds.contains([p.lat, p.lon]);
          if (show) {
            if (!p.marker) p.marker = createPointMarker(p);
            facilitiesLayerGroup.addLayer(p.marker);
          } else if (p.marker) {
            facilitiesLayerGroup.removeLayer(p.marker);
          }
        });
      }
    }

    function createPointMarker(pointData) {
      // Render cluster node (pre-aggregated by the snapshot generator)
      var clusterMeta = pointData && pointData.metadata && pointData.metadata.__cluster;
      var clusterCount = Number(clusterMeta && clusterMeta.count) || 0;
      if (clusterCount > 1) {
        var clusterClass = clusterCount > 100 ? 'marker-cluster-large'
                          : clusterCount > 10  ? 'marker-cluster-medium'
                          : 'marker-cluster-small';
        var marker = L.marker([pointData.lat, pointData.lon], {
          icon: L.divIcon({
            html: '<div><span>' + clusterCount + '</span></div>',
            className: 'marker-cluster ' + clusterClass,
            iconSize: L.point(40, 40)
          })
        });
        marker.bindPopup(function () {
          var items = (clusterMeta && clusterMeta.items) || [];
          var html = '<b>' + escapeHtml(pointData.name || 'Cluster') + '</b><br>'
                   + '<span style="font-size:0.9em;color:#6c757d;">' + clusterCount + ' points</span>';
          if (items.length > 0) {
            html += '<ul style="margin:0.4em 0 0 1.1em;padding:0;max-height:180px;overflow:auto">';
            items.forEach(function (item) {
              var n = item && item.name ? item.name : 'Point';
              var u = item && item.url ? String(item.url) : '';
              html += '<li>' + (u ? '<a href="' + escapeAttr(u) + '" target="_blank" rel="noopener">' + escapeHtml(n) + '</a>' : escapeHtml(n)) + '</li>';
            });
            html += '</ul>';
          }
          return html;
        });
        return marker;
      }

      // Individual point marker
      var pointType = getPointType(pointData);
      marker = L.marker([pointData.lat, pointData.lon], { icon: getPointIcon(pointType) });
      marker.bindPopup(function () {
        var pointUrl = pointData.url || null;
        var content = '<b>' + escapeHtml(pointData.name) + '</b>';
        if (pointType !== '_default') {
          content += '<br><span style="font-size:0.85em;color:#6c757d;">' + escapeHtml(pointType) + '</span>';
        }
        if (pointData.metadata) {
          var meta = pointData.metadata;
          metadataFields.forEach(function (field) {
            var value = firstMetaValue(meta, field.keys);
            if (value) {
              content += '<span style="font-size:0.85em;display:block;margin-top:0.25em;"><b>' + escapeHtml(field.label) + ':</b> ' + escapeHtml(value) + '</span>';
            }
          });
          var desc  = firstMetaValue(meta, descKeys);
          var notes = firstMetaValue(meta, notesKeys);
          if (desc)  content += '<span style="color:#6c757d;font-size:0.88em;display:block;margin-top:0.25em;">' + escapeHtml(desc) + '</span>';
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
        fileName: d.fileName || (id + '-points.json'),
        id: d.id || null
      };
    }

    function normalizeServerClusterPoint(d) {
      var pd = normalizeSnapshotPoint(d);
      var count = Number(d && d.metadata && d.metadata.__cluster && d.metadata.__cluster.count || 0);
      if (count > 1 && (!pd.metadata || !pd.metadata.__cluster)) {
        pd.metadata = Object.assign({}, pd.metadata, {
          __cluster: { count: count, items: Array.isArray(d.items) ? d.items : [] }
        });
      }
      return pd;
    }

    function getServerClusterLevelKeyForZoom(zoom) {
      if (!serverClusterLevelKeys.length || zoom >= serverClusterDisableZoom) return null;
      var selected = serverClusterLevelKeys[0];
      for (var i = 0; i < serverClusterLevelKeys.length; i++) {
        var key = serverClusterLevelKeys[i];
        if (key <= zoom) selected = key;
        else break;
      }
      return String(selected);
    }

    function getSnapshotDisplayPointsForZoom(zoom) {
      var levelKey = getServerClusterLevelKeyForZoom(zoom);
      if (levelKey && serverClusterLevels && Array.isArray(serverClusterLevels[levelKey])) {
        return { levelKey: levelKey, points: serverClusterLevels[levelKey].map(normalizeServerClusterPoint) };
      }
      return { levelKey: null, points: (snapshotRawPoints || []).map(normalizeSnapshotPoint) };
    }

    function getFacilityClusterLevelKeyForZoom(zoom) {
      if (!facilityClusterLevelKeys.length || zoom >= facilityClusterDisableZoom) return null;
      var selected = facilityClusterLevelKeys[0];
      for (var i = 0; i < facilityClusterLevelKeys.length; i++) {
        var key = facilityClusterLevelKeys[i];
        if (key <= zoom) selected = key;
        else break;
      }
      return String(selected);
    }

    function applyFacilitiesDisplayForZoom(zoom, force) {
      if (!facilitiesRawPoints) return;
      var levelKey = getFacilityClusterLevelKeyForZoom(zoom);
      if (!force && facilityClusterLevelActiveKey === levelKey) return;
      facilityClusterLevelActiveKey = levelKey;
      facilitiesLayerGroup.clearLayers();
      facilitiesPoints.length = 0;

      var displayPoints;
      if (levelKey && facilityClusterLevels && Array.isArray(facilityClusterLevels[levelKey])) {
        displayPoints = facilityClusterLevels[levelKey].map(normalizeServerClusterPoint);
      } else {
        displayPoints = facilitiesRawPoints.map(normalizeSnapshotPoint);
      }

      displayPoints.forEach(function (d) {
        var pointType = getPointType(d);
        facilitiesPoints.push({
          name:     d.name     || 'Point',
          lat:      d.lat,
          lon:      d.lon,
          url:      d.url      || null,
          type:     pointType,
          metadata: d.metadata || {},
          marker:   null
        });
      });
      scheduleRenderPointToggles();
    }

    function applySnapshotDisplayForZoom(zoom, force) {
      if (!snapshotRawPoints) return;
      var display = getSnapshotDisplayPointsForZoom(zoom);
      if (!force && serverClusterLevelActiveKey === display.levelKey) return;
      serverClusterLevelActiveKey = display.levelKey;
      pointLayerGroup.clearLayers();
      points.length = 0;
      display.points.forEach(function (d) {
        var pointType = getPointType(d);
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
      scheduleRenderPointToggles();
    }

    // ── Point type toggles ──────────────────────────────────────

    var _toggleTimer = null;
    function scheduleRenderPointToggles() {
      if (_toggleTimer) clearTimeout(_toggleTimer);
      _toggleTimer = setTimeout(renderPointToggles, 50);
    }

    function renderPointToggles() {
      var container = document.getElementById('type-filters');
      if (!container) return;
      container.innerHTML = '';
      var availableTypes = getAvailablePointTypes();
      availableTypes.forEach(function (t) {
        if (!_seenPointTypes.has(t)) { _seenPointTypes.add(t); pointTypeFilters.add(t); }
      });
      var typeCounts = Object.create(null);
      points.forEach(function (p) { var t = p.type || 'Other'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
      availableTypes.forEach(function (type) {
        var count = typeCounts[type] || 0;
        var iconDef = POINT_TYPE_ICONS[type] || POINT_TYPE_ICONS['_default'];
        var lbl = document.createElement('label');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = pointTypeFilters.has(type);
        cb.addEventListener('change', function () { togglePointType(type, cb.checked); });
        var iconSpan = document.createElement('span');
        iconSpan.className = 'filter-icon';
        iconSpan.innerHTML = iconDef.svg;
        iconSpan.style.flexShrink = '0';
        lbl.appendChild(cb);
        lbl.appendChild(iconSpan);
        lbl.appendChild(document.createTextNode(type + ' (' + count + ')'));
        container.appendChild(lbl);
      });
      applyPointTypeFilters();
      var badge = document.getElementById('filter-active-badge');
      if (badge) {
        var hiddenCount = availableTypes.filter(function (t) { return !pointTypeFilters.has(t); }).length;
        if (hiddenCount > 0) {
          badge.textContent = availableTypes.filter(function (t) { return pointTypeFilters.has(t); }).length + '/' + availableTypes.length;
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
      var filterBtn    = document.getElementById('filter-btn');
      var filterPopup  = document.getElementById('filter-popup');
      var filterClose  = document.getElementById('filter-close-btn');
      var filterAll    = document.getElementById('filter-select-all');
      var filterNone   = document.getElementById('filter-clear-all');
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
        getAvailablePointTypes().forEach(function (t) { pointTypeFilters.add(t); _seenPointTypes.add(t); });
        renderPointToggles();
      });
      filterNone.addEventListener('click', function () {
        pointTypeFilters.clear();
        getAvailablePointTypes().forEach(function (t) { _seenPointTypes.add(t); });
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
        var absUrl = new URL(pmtilesUrl, location.href).href;
        var p = new pmtiles.PMTiles(absUrl);
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
            return buildLayer('assets/tiles/my-routes-' + category + '.pmtiles', id + '-my-routes-' + category);
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
      loadTile('planned-routes.pmtiles', id + '-planned-routes', 'Planned Routes (tiles)', true);
    }

    // ── Loading overlay helpers ─────────────────────────────────
    function dismissLoadingOverlay() {
      var overlay = document.getElementById('map-loading');
      if (overlay) {
        overlay.classList.add('fade-out');
        setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 500);
      }
    }

    var _safetyTimeout = setTimeout(dismissLoadingOverlay, 30000);

    // ── Load facilities from static snapshot (optional) ─────────
    function loadFacilities() {
      if (!facilitiesUrl) return;
      fetch(facilitiesUrl, { cache: 'default' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!data || !Array.isArray(data.points) || data.points.length === 0) return;

          facilitiesRawPoints = data.points;

          var disableZoom = data.clusterZoomRange && Number(data.clusterZoomRange.disableClusteringAtZoom);
          facilityClusterDisableZoom = Number.isFinite(disableZoom) ? disableZoom : 8;

          if (data.clustersByZoom && typeof data.clustersByZoom === 'object') {
            facilityClusterLevels = data.clustersByZoom;
            facilityClusterLevelKeys = Object.keys(facilityClusterLevels)
              .map(function (k) { return Number(k); })
              .filter(Number.isFinite)
              .sort(function (a, b) { return a - b; });
          } else {
            facilityClusterLevels = null;
            facilityClusterLevelKeys = [];
          }

          facilityClusterLevelActiveKey = null;
          applyFacilitiesDisplayForZoom(map.getZoom(), true);

          if (facilityClusterLevelKeys.length > 0) {
            _onZoomEndFacilities = function (zoom) { applyFacilitiesDisplayForZoom(zoom, false); };
          }
        })
        .catch(function (err) {
          console.warn(id + ' facilities: could not load:', err && err.message || err);
        });
    }

    // ── Load points from static snapshot ─────────────────────────
    function loadSnapshot() {
      if (_pointsLoadStarted) return;
      _pointsLoadStarted = true;

      fetch(snapshotUrl, { cache: 'default' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!data || !Array.isArray(data.points)) throw new Error('unrecognised snapshot format');
          if (data.points.length === 0) throw new Error('empty snapshot');

          snapshotRawPoints = data.points;

          var disableZoom = data.clusterZoomRange && Number(data.clusterZoomRange.disableClusteringAtZoom);
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
          // Skipped when the snapshot isn't country-filtered (fitBoundsToPoints:
          // false) — e.g. Japan's assets/points.json includes every country's
          // points, ordered by upload recency, so a sample of it can center the
          // map on whichever country was edited most recently instead of Japan.
          if (fitBoundsToPoints) {
            var sample = snapshotRawPoints.slice(0, 200);
            if (sample.length > 0) {
              var fg = L.featureGroup(sample.map(function (p) { return L.marker([p.lat, p.lon]); }));
              map.fitBounds(fg.getBounds(), { padding: [40, 40], maxZoom: 12 });
            }
          }

          clearTimeout(_safetyTimeout);
          dismissLoadingOverlay();
        })
        .catch(function (err) {
          console.warn(id + ': could not load snapshot:', err && err.message || err);
          clearTimeout(_safetyTimeout);
          dismissLoadingOverlay();
        });
    }

    // ── Initialise ──────────────────────────────────────────────
    loadSnapshot();
    loadFacilities();

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(initPMTilesLayer, { timeout: 1000 });
    } else {
      setTimeout(initPMTilesLayer, 1000);
    }

    // Exposed so the fullscreen toggle below (which runs outside this
    // closure) can call invalidateSize() after the map wrapper resizes.
    window.__countryMapInstance = map;

    return map;
  }

  window.CountryMap = { init: init };
}());

// ── Fullscreen map toggle ────────────────────────────────────
// Shared across all country planning pages; safe to run once per page load
// regardless of which country config included this file.
(function () {
  var fsBtn          = document.getElementById('fullscreen-btn');
  var fsExpandIcon   = document.getElementById('fs-expand-icon');
  var fsCollapseIcon = document.getElementById('fs-collapse-icon');
  var mapWrapper     = document.getElementById('map-wrapper');
  if (!fsBtn || !mapWrapper) return;

  fsBtn.addEventListener('click', function () {
    var isFullscreen = mapWrapper.classList.toggle('map-fullscreen');
    fsExpandIcon.style.display   = isFullscreen ? 'none' : '';
    fsCollapseIcon.style.display = isFullscreen ? '' : 'none';
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    setTimeout(function () {
      if (window.__countryMapInstance) window.__countryMapInstance.invalidateSize();
    }, 200);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mapWrapper.classList.contains('map-fullscreen')) {
      mapWrapper.classList.remove('map-fullscreen');
      fsExpandIcon.style.display   = '';
      fsCollapseIcon.style.display = 'none';
      document.body.style.overflow = '';
      setTimeout(function () {
        if (window.__countryMapInstance) window.__countryMapInstance.invalidateSize();
      }, 200);
    }
  });
}());
