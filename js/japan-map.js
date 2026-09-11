// js/japan-map.js — Japan config for the shared js/country-map.js module.
// Loads points from assets/points.json with server-side clustering at zoom
// levels 3–7; shows PMTiles route overlays, point-type filter UI, fullscreen
// toggle. Same architecture as js/norway-map.js and js/denmark-map.js.
//
// Type normalization and icons come from js/point-types.js (shared with
// scripts/generate-points-snapshot.js) so the frontend and the server-side
// clustering can't drift apart on which types exist.
//
// This used to be a much larger (1022-line) file with its own live Firestore
// route list, admin-gated route delete, and a route-metadata-edit modal.
// That machinery was dead code — the `routes[]` array it depended on was
// never populated by anything (the actual "My Routes"/"Planned Routes"
// tracks have rendered from PMTiles for a while), so the toggle panel, the
// delete button, and the metadata modal were unreachable. It was removed
// rather than ported, along with a trip-stats sidebar and packing-checklist
// hookup that had no matching elements left in planning-japan.html either.

CountryMap.init({
  id: 'japan',
  center: [36.5, 138],
  zoom: 4,
  snapshotUrl: 'assets/points.json',
  facilitiesUrl: null,

  // generate-points-snapshot.js now filters assets/points.json to Japan
  // only (matching Norway/Denmark), so auto-fit-to-points would be safe to
  // re-enable here — but the committed assets/points.json won't reflect
  // that filter until the next snapshot regeneration. Left off defensively
  // so a stale (unfiltered) snapshot can't re-center the map on whichever
  // country was edited most recently; flip to true (or drop this line,
  // since true is the default) once a regenerated snapshot has deployed.
  fitBoundsToPoints: false,

  metadataFields: [
    { label: 'Price', keys: ['price', 'Price'] },
    { label: 'Hours', keys: ['hours', 'Hours'] }
  ],
  descKeys: ['description', 'Description'],
  notesKeys: ['notes', 'Notes'],

  defaultPointTypes: PointTypes.japan.defaultTypes,

  pointTypeIcons: PointTypes.japan.icons,
  normalizePointType: PointTypes.japan.normalize
});
