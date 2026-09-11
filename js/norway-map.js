// js/norway-map.js — Norway config for the shared js/country-map.js module.
// Loads points from assets/norway-points.json (+ assets/norway-facilities.json)
// with server-side clustering at zoom levels 3–7; shows PMTiles route
// overlays, point-type filter UI, fullscreen toggle.
//
// Type normalization and icons come from js/point-types.js (shared with
// scripts/generate-points-snapshot.js) so the frontend and the server-side
// clustering can't drift apart on which types exist.

CountryMap.init({
  id: 'no',
  center: [64.5, 14.0],
  zoom: 5,
  snapshotUrl: 'assets/norway-points.json',
  facilitiesUrl: 'assets/norway-facilities.json',

  metadataFields: [
    { label: 'Capacity', keys: ['capacity', 'Capacity'] },
    { label: 'Amenities', keys: ['amenities', 'Amenities'] }
  ],
  descKeys: ['description_text', 'description', 'Description'],
  notesKeys: ['notes', 'Notes'],

  defaultPointTypes: PointTypes.norway.defaultTypes,

  pointTypeIcons: PointTypes.norway.icons,
  normalizePointType: PointTypes.norway.normalize
});
