// js/admin/gear.js — Gear Admin section of admin.html (GearManagerAdmin).
//
// The gear list itself (categories/items) is no longer Firestore-backed —
// it's hardcoded in gear.html and edited by committing code changes there
// instead of through this dashboard. This file now only handles the bike
// photo + link fields (site_config/gear doc), which gear.html still reads
// live from Firestore.

// ── Gear Admin ────────────────────────────────────────────────
const GearManagerAdmin = (function () {
  let _fsLoaded = false;
  let _initialized = false;

  async function ensureFirestore() {
    if (_fsLoaded) return;
    await window.TomikaBikes.ensureFirebaseAuth();
    const src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js';
    if (![...document.scripts].some(s => (s.getAttribute('src') || '') === src)) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    _fsLoaded = true;
  }

  async function loadBikeLinks() {
    try {
      await ensureFirestore();
      const doc = await _getAdminDb().collection('site_config').doc('gear').get();
      if (doc.exists) {
        const d = doc.data();
        // Load bike photos using DOM methods to avoid XSS
        if (d.mikaBikePhoto) {
          const inp = document.getElementById('bike-photo-mika');
          if (inp) inp.value = d.mikaBikePhoto;
          const prev = document.getElementById('bike-photo-preview-mika');
          if (prev) {
            prev.innerHTML = '';
            const img = document.createElement('img');
            img.src = d.mikaBikePhoto;
            img.alt = "Mika's bike";
            img.style.cssText = 'width:100%;height:100%;object-fit:cover';
            prev.appendChild(img);
          }
          const clr = document.getElementById('bike-photo-clear-mika');
          if (clr) clr.style.display = '';
        }
        if (d.tomBikePhoto) {
          const inp = document.getElementById('bike-photo-tom');
          if (inp) inp.value = d.tomBikePhoto;
          const prev = document.getElementById('bike-photo-preview-tom');
          if (prev) {
            prev.innerHTML = '';
            const img = document.createElement('img');
            img.src = d.tomBikePhoto;
            img.alt = "Tom's bike";
            img.style.cssText = 'width:100%;height:100%;object-fit:cover';
            prev.appendChild(img);
          }
          const clr = document.getElementById('bike-photo-clear-tom');
          if (clr) clr.style.display = '';
        }
        const mikaUrlInp = document.getElementById('bike-url-mika');
        if (mikaUrlInp) mikaUrlInp.value = d.mikaBikeUrl || '';
        const tomUrlInp = document.getElementById('bike-url-tom');
        if (tomUrlInp) tomUrlInp.value = d.tomBikeUrl || '';
      }
    } catch (e) { /* non-critical */ }
  }

  async function init() {
    if (_initialized) return;
    _initialized = true;
    await loadBikeLinks();
  }

  return {
    get _initialized() { return _initialized; },
    init,
    loadBikeLinks,
  };
})();
