// js/admin/trip-settings.js — Trip Settings Admin section of admin.html:
// site_config/trips doc load/save.

// ── Trip Settings Admin ──────────────────────────────────────
async function loadTripSettings() {
  try {
    const doc = await _getAdminDb().collection('site_config').doc('trips').get();
    if (doc.exists) {
      const d = doc.data();
      document.getElementById('trip-japan-start').value  = (d.japan  && d.japan.startDate)  || '';
      document.getElementById('trip-japan-end').value    = (d.japan  && d.japan.endDate)    || '';
      document.getElementById('trip-norway-start').value = (d.norway && d.norway.startDate) || '';
      document.getElementById('trip-norway-end').value   = (d.norway && d.norway.endDate)   || '';
    }
  } catch (e) {
    console.warn('Could not load trip settings:', e.message);
  }
}

async function saveTripSettings() {
  const btn    = document.getElementById('trip-settings-save-btn');
  const status = document.getElementById('trip-settings-status');
  btn.disabled = true; btn.textContent = '⏳ Saving…';
  try {
    await _getAdminDb().collection('site_config').doc('trips').set({
      japan: {
        startDate: document.getElementById('trip-japan-start').value || null,
        endDate:   document.getElementById('trip-japan-end').value   || null
      },
      norway: {
        startDate: document.getElementById('trip-norway-start').value || null,
        endDate:   document.getElementById('trip-norway-end').value   || null
      }
    });
    TomikaBikes.showToast('Trip settings saved!', 'success');
    status.textContent = '✓ Saved';
    setTimeout(() => { status.textContent = ''; }, 3000);
  } catch (e) {
    TomikaBikes.showToast('Save failed: ' + e.message, 'error');
    status.textContent = '✗ Save failed';
  } finally {
    btn.disabled = false; btn.textContent = '💾 Save Trip Settings';
  }
}
