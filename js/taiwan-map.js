// js/taiwan-map.js — Taiwan config for the shared js/country-map.js module.
// Loads points from assets/taiwan-points.json with server-side clustering at
// zoom levels 3–7; shows PMTiles route overlays, point-type filter UI,
// fullscreen toggle.
//
// No facilitiesUrl yet — unlike Norway/Türkiye, there's no
// fetch-taiwan-facilities.js/Overpass workflow set up for this trip yet.
// Add one (mirroring scripts/fetch-turkey-facilities.js) and pass
// facilitiesUrl: 'assets/taiwan-facilities.json' here once that's wired up.
//
// Type normalization and icons come from js/point-types.js (shared with
// scripts/generate-points-snapshot.js) so the frontend and the server-side
// clustering can't drift apart on which types exist.

CountryMap.init({
  id: 'tw',
  center: [23.7, 121.0],
  zoom: 7,
  snapshotUrl: 'assets/taiwan-points.json',

  metadataFields: [
    { label: 'Capacity', keys: ['capacity', 'Capacity'] },
    { label: 'Amenities', keys: ['amenities', 'Amenities'] }
  ],
  descKeys: ['description_text', 'description', 'Description'],
  notesKeys: ['notes', 'Notes'],

  defaultPointTypes: PointTypes.taiwan.defaultTypes,

  pointTypeIcons: PointTypes.taiwan.icons,
  normalizePointType: PointTypes.taiwan.normalize
});
