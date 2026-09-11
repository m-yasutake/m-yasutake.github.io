// js/admin/core.js — shared admin.html infrastructure: the singleton
// Firestore instance (with the iOS Safari long-polling fix) and the
// sidebar/mobile-nav section switcher used by every other admin-*.js file.

// ── iOS Safari Firestore fix ──────────────────────────────────
// Force Firestore to use long-polling instead of WebChannel on iOS Safari.
// WebChannel can silently hang or crash the page on that platform.
// iPadOS 13+ reports itself as 'Macintosh' — use maxTouchPoints to detect it.
const _adminIsIOS = (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream)
                 || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
let _adminDbInstance = null;
function _getAdminDb() {
  if (_adminDbInstance) return _adminDbInstance;
  if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey) {
    console.error('Firebase config not loaded. Check that assets/js/firebase-config.js is accessible.');
    return null;
  }
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  _adminDbInstance = firebase.firestore();
  if (_adminIsIOS) {
    try { _adminDbInstance.settings({ experimentalForceLongPolling: true }); } catch(e) { /* already set */ }
  }
  return _adminDbInstance;
}

  function showSection(name, linkEl) {
    // Hide all sections
    document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
    // Show target
    const target = document.getElementById('section-' + name);
    if (target) target.style.display = 'block';
    // Update sidebar nav
    document.querySelectorAll('.admin-nav a').forEach(a => a.classList.remove('active'));
    if (linkEl && linkEl.tagName === 'A') linkEl.classList.add('active');
    // Update mobile nav tabs
    document.querySelectorAll('.amn-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.section === name);
    });
    // Scroll mobile nav tab into view
    const activeTab = document.querySelector('.amn-tab.active');
    if (activeTab) activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    // Init gear manager on first visit
    if (name === 'gear' && typeof GearManagerAdmin !== 'undefined' && !GearManagerAdmin._initialized) {
      GearManagerAdmin.init();
    }
    // Load blog posts on first visit
    if (name === 'posts' && !adminBlogLoaded) {
      adminBlogLoadPosts();
    }
    // Load dashboard counts on first visit
    if (name === 'dashboard') {
      adminDashLoadCounts();
    }
  }
