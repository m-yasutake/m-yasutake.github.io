// js/turkey-map.js — Turkey config for the shared js/country-map.js module.
// Loads points from assets/turkey-points.json (+ assets/turkey-facilities.json)
// with server-side clustering at zoom levels 3–7; shows PMTiles route
// overlays, point-type filter UI, fullscreen toggle.
//
// Type normalization and icons come from js/point-types.js (shared with
// scripts/generate-points-snapshot.js) so the frontend and the server-side
// clustering can't drift apart on which types exist.

CountryMap.init({
  id: 'tr',
  center: [39.0, 35.0],
  zoom: 6,
  snapshotUrl: 'assets/turkey-points.json',
  facilitiesUrl: 'assets/turkey-facilities.json',

  metadataFields: [
    { label: 'Capacity', keys: ['capacity', 'Capacity'] },
    { label: 'Amenities', keys: ['amenities', 'Amenities'] }
  ],
  descKeys: ['description_text', 'description', 'Description'],
  notesKeys: ['notes', 'Notes'],

  defaultPointTypes: PointTypes.turkey.defaultTypes,

  pointTypeIcons: PointTypes.turkey.icons,
  normalizePointType: PointTypes.turkey.normalize
});
