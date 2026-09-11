// js/denmark-map.js — Denmark config for the shared js/country-map.js module.
// Loads points from assets/denmark-points.json with server-side clustering
// at zoom levels 3–7; shows PMTiles route overlays, point-type filter UI,
// fullscreen toggle.
//
// Type normalization and icons come from js/point-types.js (shared with
// scripts/generate-points-snapshot.js) so the frontend and the server-side
// clustering can't drift apart on which types exist.

CountryMap.init({
  id: 'dk',
  center: [56.0, 10.5],
  zoom: 6,
  snapshotUrl: 'assets/denmark-points.json',
  facilitiesUrl: null,

  metadataFields: [],
  descKeys: ['description', 'Description'],
  notesKeys: ['notes', 'Notes'],

  defaultPointTypes: PointTypes.denmark.defaultTypes,

  pointTypeIcons: PointTypes.denmark.icons,
  normalizePointType: PointTypes.denmark.normalize
});
