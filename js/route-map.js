// js/route-map.js
// Shared route map component – displays current (Strava) route tiles only.
// No points, no planned routes.  Designed to be reused across pages
// (Home, Norway, …) without conflicting with japan.html's own map setup.
//
// Usage:
//   RouteMap.init('element-id', { center: [36.5, 138], zoom: 5 });

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
      // Safari < 16 rejects certain cache modes; strip them gracefully.
      if (options && options.cache &&
          (options.cache === 'reload' || options.cache === 'no-store' || options.cache === 'no-cache')) {
        var safeOptions = Object.assign({}, options, { cache: 'default' });
        return _origFetch.call(window, resource, safeOptions).catch(function () {
          var bare = Object.assign({}, options);
          delete bare.cache;
          return _origFetch.call(window, resource, bare);
        });
      }
      return _origFetch.call(window, resource, options);
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
   * @returns {L.Map}
   */
  function init(elementId, options) {
    options = options || {};
    var center   = options.center   || [36.5, 138];
    var zoom     = options.zoom     || 5;
    var tilesUrl = options.tilesUrl ||
      'https://firebasestorage.googleapis.com/v0/b/roots-eddf5.firebasestorage.app/o/tiles%2Fmy-routes.pmtiles?alt=media';

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
    if (typeof pmtiles !== 'undefined' && typeof L.vectorGrid !== 'undefined') {
      var pmInstance = new pmtiles.PMTiles(tilesUrl);
      window.__pmtilesInstances[instanceKey] = pmInstance;

      pmInstance.getHeader().then(function (header) {
        var routeLayer = L.vectorGrid.protobuf(
          'pmtiles://' + instanceKey + '/{z}/{x}/{y}',
          {
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
            maxNativeZoom: header.maxZoom || 14,
            minNativeZoom: header.minZoom || 2
          }
        );

        routeLayer.addTo(map);
      }).catch(function (err) {
        console.warn('RouteMap: could not load route tiles:', (err && err.message) || err || 'Unknown error');
      });
    }

    return map;
  }

  window.RouteMap = { init: init };
}());
