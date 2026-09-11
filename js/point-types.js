// js/point-types.js — Single source of truth for per-country planning-point
// type normalization and icon sets. Loaded as a <script> tag in the browser
// (defines window.PointTypes) and required as a CommonJS module from
// scripts/generate-points-snapshot.js (Node). Keep this file free of
// browser-only or Node-only globals so both environments work unmodified.
//
// This exists so the frontend (js/norway-map.js, js/denmark-map.js,
// js/japan-map.js) and the server-side snapshot generator can't drift apart
// on which raw type strings map to which display type — they used to
// duplicate this logic and had fallen out of sync (the generator was
// missing Public Shelter, Drinking Water, Public Toilet and Picnic Bench for
// Norway).
//
// To add or change a type: edit it here once. Norway/Denmark icons live here
// too since they're small and travel with the type they draw.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PointTypes = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NORWAY_POINT_TYPE_ICONS = {
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
    'Onsen': {
      color: '#e74c3c',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#e74c3c" stroke="#fff" stroke-width="1.5"/><path d="M8 13c0-2.2 1.8-4 4-4s4 1.8 4 4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><path d="M9.5 8.5c0.3-1 0.7-1.5 0.5-2.5M12 7.5c0.3-1 0.7-1.5 0.5-2.5M14.5 8.5c0.3-1 0.7-1.5 0.5-2.5" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/></svg>'
    },
    'Open Shelter': {
      color: '#d35400',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#d35400" stroke="#fff" stroke-width="1.5"/><path d="M7 17V9l10 4v4H7z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>'
    },
    'DNT Hut': {
      color: '#c0392b',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#c0392b" stroke="#fff" stroke-width="1.5"/><path d="M12 5.5L5.5 11h2v6h9V11h2L12 5.5z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="13" r="1.8" fill="#fff"/><rect x="11" y="14.5" width="2" height="2.5" fill="#fff"/></svg>'
    },
    'Day Hut': {
      color: '#f39c12',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#f39c12" stroke="#fff" stroke-width="1.5"/><path d="M12 8L7.5 12h1.5v5h6v-5H17L12 8z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="6" r="1.5" fill="#fff"/></svg>'
    },
    'Cave': {
      color: '#2c3e50',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#2c3e50" stroke="#fff" stroke-width="1.5"/><polygon points="12,5 4,18 20,18" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 18 A2.5 3 0 0 1 14.5 18" fill="none" stroke="#fff" stroke-width="1.4"/></svg>'
    },
    'DNT Code Hut': {
      color: '#7d3c98',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#7d3c98" stroke="#fff" stroke-width="1.5"/><path d="M12 5.5L5.5 11h2v6h9V11h2L12 5.5z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><rect x="10" y="14" width="4" height="3" rx="0.5" fill="none" stroke="#fff" stroke-width="1"/><path d="M11 14V12a1 1 0 0 1 2 0v2" fill="none" stroke="#fff" stroke-width="1"/></svg>'
    },
    'Rental': {
      color: '#1abc9c',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#1abc9c" stroke="#fff" stroke-width="1.5"/><path d="M12 5.5L5.5 11h2v6h9V11h2L12 5.5z" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><rect x="8" y="13.5" width="8" height="3" rx="0.5" fill="none" stroke="#fff" stroke-width="1"/><rect x="8.5" y="13" width="2.5" height="1.5" rx="0.3" fill="#fff"/></svg>'
    },
    'Drinking Water': {
      color: '#2980b9',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#2980b9" stroke="#fff" stroke-width="1.5"/><path d="M12 5.5c0 0-5 5.8-5 9.5a5 5 0 0 0 10 0c0-3.7-5-9.5-5-9.5z" fill="#fff"/></svg>'
    },
    'Public Toilet': {
      color: '#16a085',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#16a085" stroke="#fff" stroke-width="1.5"/><circle cx="9" cy="8" r="1.6" fill="#fff"/><circle cx="15" cy="8" r="1.6" fill="#fff"/><path d="M7 10.5h4v4.5l.5 3h1l.5-3V10.5h4" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    },
    'Public Shelter': {
      color: '#8e44ad',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#8e44ad" stroke="#fff" stroke-width="1.5"/><rect x="6" y="8" width="12" height="2.5" rx="0.5" fill="#fff"/><line x1="8" y1="10.5" x2="8" y2="16" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><line x1="16" y1="10.5" x2="16" y2="16" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="16" x2="17" y2="16" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>'
    },
    'Picnic Bench': {
      color: '#27ae60',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#27ae60" stroke="#fff" stroke-width="1.5"/><rect x="7" y="10" width="10" height="2" rx="0.5" fill="#fff"/><line x1="9" y1="12" x2="8" y2="16" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/><line x1="15" y1="12" x2="16" y2="16" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/><line x1="6" y1="14" x2="10" y2="14" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/><line x1="14" y1="14" x2="18" y2="14" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/></svg>'
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

  function normalizeNorwayPointType(type) {
    var raw = type ? String(type).trim() : '';
    if (!raw) return '_default';
    if (/camp/i.test(raw))            return 'Campsite';
    if (/roadside\s*station/i.test(raw)) return 'Roadside Station';
    if (/must\s*see/i.test(raw))      return 'Must See';
    if (/hotel/i.test(raw))           return 'Hotel';
    if (/onsen/i.test(raw))           return 'Onsen';
    if (/dnt.+special|dnt.+code|frilufts/i.test(raw))           return 'DNT Code Hut';
    if (/dnt/i.test(raw))                                        return 'DNT Hut';
    if (/cave|rock.?shelter/i.test(raw))                         return 'Cave';
    if (/municipal|day.?trip/i.test(raw))                        return 'Day Hut';
    if (/rental/i.test(raw))                                     return 'Rental';
    if (/public.?shelter/i.test(raw))                            return 'Public Shelter';
    if (/open.?shelter|lean.?to|shelter|hut|koie|hytte/i.test(raw)) return 'Open Shelter';
    if (/drinking.?water|water.?point/i.test(raw)) return 'Drinking Water';
    if (/toilet|restroom|wc/i.test(raw))           return 'Public Toilet';
    if (/picnic/i.test(raw))                       return 'Picnic Bench';
    if (/other/i.test(raw))                        return 'Other';
    return NORWAY_POINT_TYPE_ICONS[raw] ? raw : 'Other';
  }

  var DENMARK_POINT_TYPE_ICONS = {
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

  function normalizeDenmarkPointType(type) {
    var raw = type ? String(type).trim() : '';
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
    return DENMARK_POINT_TYPE_ICONS[raw] ? raw : 'Other';
  }

  var JAPAN_POINT_TYPE_ICONS = {
    'Onsen': {
      color: '#e74c3c',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#e74c3c" stroke="#fff" stroke-width="1.5"/><path d="M8 13c0-2.2 1.8-4 4-4s4 1.8 4 4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><path d="M9.5 8.5c0.3-1 0.7-1.5 0.5-2.5M12 7.5c0.3-1 0.7-1.5 0.5-2.5M14.5 8.5c0.3-1 0.7-1.5 0.5-2.5" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/></svg>'
    },
    'Foot Bath': {
      color: '#e8906b',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#e8906b" stroke="#fff" stroke-width="1.5"/><path d="M7 15c0-1.7 1.3-3 3-3h4c1.7 0 3 1.3 3 3v1H7v-1z" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M10 8.5c0.2-.8 0.5-1.2 0.4-2M12.5 8c0.2-.8 0.5-1.2 0.4-2" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/></svg>'
    },
    'Hotel Onsen': {
      color: '#9b3066',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#9b3066" stroke="#fff" stroke-width="1.5"/><rect x="8" y="11" width="8" height="5" rx="0.5" fill="none" stroke="#fff" stroke-width="1.2"/><path d="M9.5 9c0.2-.7 0.5-1 0.3-1.8M12 8.5c0.2-.7 0.5-1 0.3-1.8M14.5 9c0.2-.7 0.5-1 0.3-1.8" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/></svg>'
    },
    'Super Sento': {
      color: '#0277bd',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#0277bd" stroke="#fff" stroke-width="1.5"/><path d="M9.5 8.5c0.3-1 0.7-1.5 0.5-2.5M12 7.5c0.3-1 0.7-1.5 0.5-2.5M14.5 8.5c0.3-1 0.7-1.5 0.5-2.5" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/><rect x="7" y="12" width="10" height="4" rx="1" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M8.5 14c0.7-0.5 1.3-0.5 2 0s1.3 0.5 2 0s1.3-0.5 2 0" fill="none" stroke="#fff" stroke-width="0.8" stroke-linecap="round"/></svg>'
    },
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
    'Other': {
      color: '#95a5a6',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#95a5a6" stroke="#fff" stroke-width="1.5"/><path d="M12 8v8M8 12h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>'
    },
    '_default': {
      color: '#7f8c8d',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#7f8c8d" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg>'
    }
  };

  function normalizeJapanPointType(type) {
    var raw = type ? String(type).trim() : '';
    if (!raw) return '_default';
    // Onsen subcategories — checked before the generic onsen test
    if (/foot\s*bath/i.test(raw)) return 'Foot Bath';
    if (/hotel\s*onsen|onsen.*hotel/i.test(raw)) return 'Hotel Onsen';
    if (/super\s*sento/i.test(raw)) return 'Super Sento';
    if (/onsen|community\s*center/i.test(raw)) return 'Onsen';
    if (/camp/i.test(raw)) return 'Campsite';
    if (/roadside\s*station/i.test(raw)) return 'Roadside Station';
    if (/must\s*see/i.test(raw)) return 'Must See';
    if (/hotel/i.test(raw)) return 'Hotel';
    if (/other/i.test(raw)) return 'Other';
    return JAPAN_POINT_TYPE_ICONS[raw] ? raw : 'Other';
  }

  return {
    japan: {
      icons: JAPAN_POINT_TYPE_ICONS,
      normalize: normalizeJapanPointType,
      defaultTypes: ['Onsen', 'Campsite', 'Roadside Station', 'Must See', 'Hotel', 'Other']
    },
    norway: {
      icons: NORWAY_POINT_TYPE_ICONS,
      normalize: normalizeNorwayPointType,
      defaultTypes: ['Campsite', 'Roadside Station', 'Must See', 'Hotel', 'Other']
    },
    denmark: {
      icons: DENMARK_POINT_TYPE_ICONS,
      normalize: normalizeDenmarkPointType,
      defaultTypes: ['Campsite', 'Roadside Station', 'Must See', 'Hotel', 'Other']
    }
  };
}));
