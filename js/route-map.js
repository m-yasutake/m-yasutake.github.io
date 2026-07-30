// js/route-map.js
// Shared route map component – displays current (Strava) route tiles only.
// No points, no planned routes.  Designed to be reused across pages
// (Home, Norway, …) without conflicting with japan.html's own map setup.
//
// Usage:
//   RouteMap.init('element-id', { center: [36.5, 138], zoom: 5 });
//   map.setTripFilter('2026-03-14', '2026-05-24'); // filter by date range

(function () {
  'use strict';

  // ── PMTiles protocol interceptor ──────────────────────────────────────────
  // Idempotent: only installed once per page-load even if route-map.js is
  // included multiple times.
  if (!window.__routeMapInterceptorInstalled) {
    window.__routeMapInterceptorInstalled = true;
    var _origFetch = window.fetch;
    window.__pmtilesInstances = window.__pmtilesInstances || {};
    window.fetch = function routeMapFetch(resource, options) {
      var u = typeof resource === 'string' ? resource
            : (resource && resource.url ? resource.url : '');
      if (u && u.startsWith('pmtiles://')) {
        var m = u.match(/^pmtiles:\/\/([^/]+)\/(-?\d+)\/(-?\d+)\/(-?\d+)$/);
        if (m) {
          var p = window.__pmtilesInstances[m[1]];
          if (p) {
            return p.getZxy(+m[2], +m[3], +m[4]).then(function (result) {
              if (!result || !result.data) {
                return new Response(new ArrayBuffer(0), { status: 200 });
              }
              return new Response(result.data, { status: 200 });
            });
          }
        }
        return Promise.reject(new TypeError('pmtiles:// – no instance for: ' + u));
      }
      // Force no-store so Chrome never tries to serve range requests from its
      // HTTP cache (which causes ERR_CACHE_OPERATION_NOT_SUPPORTED when it has
      // cached a full-file response and then tries to slice it for a range req).
      // Fall back to the original options if the browser rejects no-store.
      var noStoreOpts = Object.assign({}, options, { cache: 'no-store' });
      return _origFetch.call(window, resource, noStoreOpts).catch(function () {
        return _origFetch.call(window, resource, options);
      });
    };
  }

  // ── Route line weight (matches japan.html) ───────────────────────────────
  function getRouteWeight(zoom) {
    if (zoom >= 17) return 0.5;
    if (zoom >= 15) return 0.75;
    if (zoom >= 13) return 1.2;
    if (zoom >= 11) return 1.8;
    if (zoom >= 9)  return 2.2;
    return 3;
  }

  // ── Public API ───────────────────────────────────────────────────────────
  /**
   * Initialize a read-only map showing only the current (Strava) route tiles.
   *
   * @param {string} elementId  – id of the map <div>
   * @param {object} [options]
   *   center      {number[]}  [lat, lng] map center    (default: central Japan)
   *   zoom        {number}    initial zoom             (default: 5)
   *   manifestUrl {string}    URL for the my-routes-manifest.json shard list
   *   dateFrom    {string}    ISO date string YYYY-MM-DD; only show rides on/after this date
   *   dateTo      {string}    ISO date string YYYY-MM-DD; only show rides on/before this date
   * @returns {L.Map} with an extra setTripFilter(dateFrom, dateTo) method
   */
  function init(elementId, options) {
    options = options || {};
    var center      = options.center      || [36.5, 138];
    var zoom        = options.zoom        || 5;
    var manifestUrl = options.manifestUrl || 'assets/tiles/my-routes-manifest.json';

    // Unique PMTiles instance key prefix per element avoids collisions when
    // multiple maps are on the same page. My Routes is split into several
    // per-trip shards (see scripts/generate-pmtiles.js) so each shard gets
    // its own instance key, e.g. "route-map-<elementId>-japan".
    var instanceKeyPrefix = 'route-map-' + elementId;

    var map = L.map(elementId, {
      renderer: L.canvas({ tolerance: 10 }),
      zoomControl: true
    }).setView(center, zoom);

    // Base tile layer
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
        maxZoom: 19
      }
    ).addTo(map);

    L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

    // ── Load route tiles via PMTiles + VectorGrid ─────────────────────────
    // My Routes is split into several per-trip shards; the manifest lists
    // which ones exist so this file never needs a hardcoded category list.
    var _categories      = [];   // shard categories loaded from the manifest
    var _headers         = {};   // category -> PMTiles header
    var _routeLayerGroup = null; // group of all shard layers, one map entry
    var _dateFrom        = options.dateFrom || null;
    var _dateTo          = options.dateTo   || null;

    function routeStyle(properties) {
      if (_dateFrom || _dateTo) {
        var filename = properties.filename || '';
        var m = filename.match(/strava_\d+_(\d{4}-\d{2}-\d{2})_/);
        if (!m) return { weight: 0, opacity: 0, fill: false };
        var d = m[1];
        if (_dateFrom && d < _dateFrom) return { weight: 0, opacity: 0, fill: false };
        if (_dateTo   && d > _dateTo)   return { weight: 0, opacity: 0, fill: false };
      }
      return {
        weight: getRouteWeight(map.getZoom()),
        color: properties.color || '#E76F51',
        opacity: 0.9,
        fill: false
      };
    }

    function buildLayer() {
      if (_routeLayerGroup) { map.removeLayer(_routeLayerGroup); _routeLayerGroup = null; }
      if (_categories.length === 0) return;

      var layers = _categories.map(function (category) {
        var header = _headers[category] || { minZoom: 2, maxZoom: 14 };
        return L.vectorGrid.protobuf(
          'pmtiles://' + instanceKeyPrefix + '-' + category + '/{z}/{x}/{y}',
          {
            vectorTileLayerStyles: { routes: routeStyle },
            interactive: false,
            updateWhenZooming: false,
            keepBuffer: 4,
            maxNativeZoom: header.maxZoom || 14,
            minNativeZoom: header.minZoom || 2
          }
        );
      });

      _routeLayerGroup = L.layerGroup(layers);
      _routeLayerGroup.addTo(map);
    }

    if (typeof pmtiles !== 'undefined' && typeof L.vectorGrid !== 'undefined') {
      fetch(manifestUrl).then(function (res) {
        if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
        return res.json();
      }).then(function (manifest) {
        var categories = (manifest && manifest.categories) || [];
        return Promise.all(categories.map(function (category) {
          var key = instanceKeyPrefix + '-' + category;
          var p = new pmtiles.PMTiles('assets/tiles/my-routes-' + category + '.pmtiles');
          window.__pmtilesInstances[key] = p;
          return p.getHeader().then(function (header) {
            _headers[category] = header;
          }).catch(function () {
            _headers[category] = { minZoom: 2, maxZoom: 14 };
          }).then(function () {
            return category;
          });
        }));
      }).then(function (loadedCategories) {
        _categories = loadedCategories || [];
        buildLayer();
      }).catch(function (err) {
        console.warn('RouteMap: could not load route tiles:', (err && err.message) || err || 'Unknown error');
      });
    }

    // Update the date filter and redraw the route layer.
    // If the PMTiles header hasn't loaded yet the new filter is stored and
    // applied automatically when it does.
    map.setTripFilter = function (dateFrom, dateTo) {
      _dateFrom = dateFrom || null;
      _dateTo   = dateTo   || null;
      buildLayer();
    };

    return map;
  }

  window.RouteMap = { init: init };
}());
