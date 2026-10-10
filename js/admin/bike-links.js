// js/admin/bike-links.js — Bike Links Admin section of admin.html:
// site_config/gear doc save.

// ── Bike Links Admin ──────────────────────────────────────────
async function saveBikeLinks() {
  const mikaPhoto = (document.getElementById('bike-photo-mika') || {}).value || '';
  const tomPhoto  = (document.getElementById('bike-photo-tom')  || {}).value || '';
  const mikaUrl   = (document.getElementById('bike-url-mika')   || {}).value || '';
  const tomUrl    = (document.getElementById('bike-url-tom')    || {}).value || '';
  const btn = document.getElementById('bike-links-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }
  try {
    await _getAdminDb().collection('site_config').doc('gear').set(
      {
        mikaBikePhoto: mikaPhoto.trim(), tomBikePhoto: tomPhoto.trim(),
        mikaBikeUrl:   mikaUrl.trim(),   tomBikeUrl:   tomUrl.trim()
      },
      { merge: true }
    );
    TomikaBikes.showToast('Bike photos & links saved!', 'success');
  } catch (e) {
    TomikaBikes.showToast('Save failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Save Bike Photos & Links'; }
  }
}

// Load bike links when gear section is shown
const _origShowSectionForGear = window.showSection;
window.showSection = function (name, linkEl) {
  _origShowSectionForGear(name, linkEl);
  if (name === 'gear' && typeof GearManagerAdmin !== 'undefined') {
    GearManagerAdmin.loadBikeLinks();
  }
  if (name === 'settings') {
    loadTripSettings();
  }
};
