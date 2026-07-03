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
   *   center   {number[]}  [lat, lng] map center    (default: central Japan)
   *   zoom     {number}    initial zoom             (default: 5)
   *   tilesUrl {string}    direct URL for my-routes.pmtiles
   *   dateFrom {string}    ISO date string YYYY-MM-DD; only show rides on/after this date
   *   dateTo   {string}    ISO date string YYYY-MM-DD; only show rides on/before this date
   * @returns {L.Map} with an extra setTripFilter(dateFrom, dateTo) method
   */
  function init(elementId, options) {
    options = options || {};
    var center   = options.center   || [36.5, 138];
    var zoom     = options.zoom     || 5;
    var tilesUrl = options.tilesUrl || 'assets/tiles/my-routes.pmtiles';

    // Unique PMTiles instance key per element avoids collisions when multiple
    // maps are on the same page.
    var instanceKey = 'route-map-' + elementId;

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
    var _header     = null;
    var _routeLayer = null;
    var _dateFrom   = options.dateFrom || null;
    var _dateTo     = options.dateTo   || null;

    function buildLayer() {
      if (_routeLayer) { map.removeLayer(_routeLayer); _routeLayer = null; }
      if (!_header) return;

      var gridOptions = {
        vectorTileLayerStyles: {
          routes: function (properties) {
            return {
              weight: getRouteWeight(map.getZoom()),
              color: properties.color || '#E76F51',
              opacity: 0.9,
              fill: false
            };
          }
        },
        interactive: false,
        updateWhenZooming: false,
        keepBuffer: 4,
        maxNativeZoom: _header.maxZoom || 14,
        minNativeZoom: _header.minZoom || 2
      };

      // Date-range filter: only render features whose filename encodes a date
      // within the specified range. Filenames from fetch-strava-rides.js follow
      // the pattern: strava_<id>_<YYYY-MM-DD>_<name>.gpx
      if (_dateFrom || _dateTo) {
        gridOptions.filter = function (properties) {
          var filename = properties.filename || '';
          var m = filename.match(/strava_\d+_(\d{4}-\d{2}-\d{2})_/);
          if (!m) return false; // hide non-dated routes when a date filter is active
          var d = m[1];
          if (_dateFrom && d < _dateFrom) return false;
          if (_dateTo   && d > _dateTo)   return false;
          return true;
        };
      }

      _routeLayer = L.vectorGrid.protobuf(
        'pmtiles://' + instanceKey + '/{z}/{x}/{y}',
        gridOptions
      );
      _routeLayer.addTo(map);
    }

    if (typeof pmtiles !== 'undefined' && typeof L.vectorGrid !== 'undefined') {
      var pmInstance = new pmtiles.PMTiles(tilesUrl);
      window.__pmtilesInstances[instanceKey] = pmInstance;

      pmInstance.getHeader().then(function (header) {
        _header = header;
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
