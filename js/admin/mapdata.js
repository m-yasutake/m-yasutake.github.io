// js/admin/mapdata.js — Map Data section of admin.html: GPX route upload,
// CSV points upload, Google-Maps point add, and delete-points-by-filename,
// for all three countries via the country selector.

// ── Map Data Upload ───────────────────────────────────────────
(function () {
  let _mapDb = null;
  let _mapStorage = null;
  let _mapSdkLoaded = false;

  function loadMapSdks() {
    if (_mapSdkLoaded) return Promise.resolve();
    const FIREBASE_SDK_VERSION = '10.12.2';
    const FIREBASE_AUTH_COMPAT_URL = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-auth-compat.js';
    const FIREBASE_STORAGE_COMPAT_URL = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-storage-compat.js';
    const SDK_LOAD_TIMEOUT_MS = 10000;
    const SDK_POLL_INTERVAL_MS = 200;
    const already = src => [...document.scripts].some(s => (s.getAttribute('src') || '').includes(src));
    const waitFor = (ready, sdkName) => new Promise((resolve, reject) => {
      if (ready()) { resolve(); return; }
      const start = Date.now();
      (function poll() {
        if (ready()) { resolve(); return; }
        if (Date.now() - start > SDK_LOAD_TIMEOUT_MS) {
          reject(new Error('Timed out loading Firebase ' + sdkName + ' SDK'));
          return;
        }
        setTimeout(poll, SDK_POLL_INTERVAL_MS);
      })();
    });
    const load = src => new Promise((res, rej) => {
      if (already(src)) { res(); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    return load(FIREBASE_AUTH_COMPAT_URL)
      .then(() => waitFor(() => typeof firebase !== 'undefined' && typeof firebase.auth === 'function', 'Auth'))
      .then(() => load(FIREBASE_STORAGE_COMPAT_URL))
      .then(() => waitFor(() => typeof firebase !== 'undefined' && typeof firebase.storage === 'function', 'Storage'))
      .then(() => { _mapSdkLoaded = true; });
  }

  async function ensureMapReady() {
    await loadMapSdks();
    if (!_mapDb) {
      _mapDb = _getAdminDb();
      _mapStorage = firebase.storage();
    }
  }

  function getSelectedMapCountry() {
    const select = document.getElementById('mapdata-country-select');
    if (!select) return '';
    const value = select.value.trim();
    if (value) return value;
    const fallback = select.options && select.options[0] && select.options[0].value
      ? String(select.options[0].value).trim()
      : '';
    return fallback;
  }

  function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    function parseLine(line) {
      const result = []; let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
        else cur += c;
      }
      result.push(cur.trim()); return result;
    }
    const headers = parseLine(lines[0]);
    const nameIdx = headers.findIndex(h => h.toLowerCase() === 'name');
    const latIdx  = headers.findIndex(h => ['latitude','lat'].includes(h.toLowerCase()));
    const lonIdx  = headers.findIndex(h => ['longitude','lon','lng'].includes(h.toLowerCase()));
    const urlIdx  = headers.findIndex(h => ['url','link','page','website'].includes(h.toLowerCase().trim()));
    if (latIdx === -1 || lonIdx === -1) { alert('CSV must have latitude and longitude columns'); return []; }
    const pts = [];
    for (let i = 1; i < lines.length; i++) {
      const v = parseLine(lines[i]);
      if (v.length < 2) continue;
      const lat = parseFloat(v[latIdx]), lon = parseFloat(v[lonIdx]);
      if (isNaN(lat) || isNaN(lon)) continue;
      const metadata = {};
      headers.forEach((h, idx) => { if (idx !== latIdx && idx !== lonIdx && idx !== nameIdx && idx !== urlIdx && v[idx]) metadata[h] = v[idx]; });
      pts.push({ name: nameIdx !== -1 && v[nameIdx] ? v[nameIdx] : ('Point ' + i), lat, lon, url: urlIdx !== -1 && v[urlIdx] ? v[urlIdx] : null, metadata });
    }
    return pts;
  }

  function parseGoogleMapsUrl(url) {
    const placeMatch = url.match(/\/place\/([^/@]+)/);
    const name = placeMatch ? decodeURIComponent(placeMatch[1].replace(/\+/g,' ').replace(/%20/g,' ')) : 'Unnamed Location';
    const coordMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (!coordMatch) {
      const alt = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
      if (!alt) throw new Error('Could not extract coordinates from URL');
      return { name, lat: parseFloat(alt[1]), lon: parseFloat(alt[2]) };
    }
    return { name, lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[2]) };
  }

  function isShortGoogleMapsUrl(url) {
    return /maps\.app\.goo\.gl\//.test(url) || /goo\.gl\/maps\//.test(url);
  }

  function expandShortUrl(shortUrl) {
    // Try allorigins.win first, then corsproxy.io as fallback
    function tryProxy(proxyUrl) {
      return fetch(proxyUrl)
        .then(res => { if (!res.ok) throw new Error('Proxy failed'); return res.json(); })
        .then(data => {
          const finalUrl = data && data.status && data.status.url ? data.status.url : null;
          if (finalUrl && /google\.com\/maps/.test(finalUrl) && finalUrl !== shortUrl) return finalUrl;
          const html = data && data.contents ? data.contents : '';
          // Try several patterns used by Google Maps URLs
          const patterns = [
            /https:\/\/www\.google\.com\/maps\/[^\s"'<>\\]+/,
            /https:\/\/maps\.google\.com\/[^\s"'<>\\]+/,
          ];
          for (const pat of patterns) {
            const m = html.match(pat);
            if (m) return m[0].replace(/\\u003d/g,'=').replace(/\\u0026/g,'&');
          }
          // Try to find coordinates embedded in the HTML (data attributes or JSON)
          const coordInHtml = html.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
          if (coordInHtml) return 'https://www.google.com/maps/@' + coordInHtml[1] + ',' + coordInHtml[2] + ',15z';
          const embedCoord = html.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
          if (embedCoord) return 'https://www.google.com/maps?q=' + embedCoord[1] + ',' + embedCoord[2];
          throw new Error('Could not resolve URL from proxy response');
        });
    }

    const allOriginsUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(shortUrl);
    return tryProxy(allOriginsUrl).catch(() => {
      // Fallback: corsproxy.io returns the raw response, not JSON — handle differently
      return fetch('https://corsproxy.io/?' + encodeURIComponent(shortUrl), { redirect: 'follow' })
        .then(res => {
          const finalUrl = res.url;
          if (finalUrl && /google\.com\/maps/.test(finalUrl) && finalUrl !== shortUrl) return finalUrl;
          return res.text().then(html => {
            const m = html.match(/https:\/\/www\.google\.com\/maps\/[^\s"'<>\\]+/);
            if (m) return m[0].replace(/\\u003d/g,'=').replace(/\\u0026/g,'&');
            const coordInHtml = html.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
            if (coordInHtml) return 'https://www.google.com/maps/@' + coordInHtml[1] + ',' + coordInHtml[2] + ',15z';
            throw new Error('Could not resolve URL');
          });
        });
    });
  }

  // ── GPX wiring
  let pendingGpxFiles = [];

  function setupGpxDropZone() {
    const zone  = document.getElementById('gpx-drop-zone');
    const input = document.getElementById('gpx-file-input');
    const listEl = document.getElementById('gpx-file-list');

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      pendingGpxFiles = Array.from(input.files);
      renderGpxFileList(listEl);
      document.getElementById('gpx-upload-btn').disabled = pendingGpxFiles.length === 0;
      input.value = '';
    });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      pendingGpxFiles = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.gpx'));
      renderGpxFileList(listEl);
      document.getElementById('gpx-upload-btn').disabled = pendingGpxFiles.length === 0;
    });

    document.getElementById('gpx-clear-btn').addEventListener('click', () => {
      pendingGpxFiles = []; listEl.innerHTML = '';
      document.getElementById('gpx-upload-btn').disabled = true;
      document.getElementById('gpx-upload-status').textContent = '';
    });

    document.getElementById('gpx-upload-btn').addEventListener('click', () => {
      if (!pendingGpxFiles.length) return;
      const statusEl = document.getElementById('gpx-upload-status');
      statusEl.textContent = 'Uploading…';
      ensureMapReady().then(() => {
        const promises = pendingGpxFiles.map((file, i) => {
          const sourceUrl = (document.querySelectorAll('.gpx-source-url')[i] || {}).value || '';
          return uploadGpxFile(file, sourceUrl).then(() => {
            statusEl.textContent = 'Uploaded ' + (i + 1) + '/' + pendingGpxFiles.length + '…';
          });
        });
        return Promise.all(promises);
      }).then(() => {
        statusEl.textContent = '✓ ' + pendingGpxFiles.length + ' file(s) uploaded successfully!';
        TomikaBikes.showToast('Routes uploaded!', 'success');
        pendingGpxFiles = []; listEl.innerHTML = '';
        document.getElementById('gpx-upload-btn').disabled = true;
      }).catch(err => {
        statusEl.textContent = 'Error: ' + err.message;
        TomikaBikes.showToast('Upload failed: ' + err.message, 'error');
      });
    });
  }

  function renderGpxFileList(listEl) {
    if (!pendingGpxFiles.length) { listEl.innerHTML = ''; return; }
    listEl.innerHTML = pendingGpxFiles.map((f, i) =>
      '<div style="margin-top:.5rem">' +
        '<div style="font-size:.85rem;font-weight:600;color:var(--color-dark)">📄 ' + escHtml(f.name) + '</div>' +
        '<input type="text" class="gpx-source-url form-control" data-idx="' + i + '" placeholder="Source URL (optional)" style="font-size:.8rem;margin-top:.2rem">' +
      '</div>'
    ).join('');
  }

  async function uploadGpxFile(file, sourceUrl) {
    const storagePath = 'gpx/' + Date.now() + '_' + file.name;
    const country = getSelectedMapCountry();
    const metadata = sourceUrl ? { sourceUrl } : {};
    await _mapStorage.ref(storagePath).put(file, { contentType: 'application/gpx+xml' });
    await _mapDb.collection('routes').add({
      fileName: file.name, storagePath,
      country, metadata, uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  // ── CSV wiring
  let pendingCsvFiles = [];

  function setupCsvDropZone() {
    const zone   = document.getElementById('csv-drop-zone');
    const input  = document.getElementById('csv-file-input');
    const listEl = document.getElementById('csv-file-list');

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      pendingCsvFiles = Array.from(input.files);
      listEl.textContent = pendingCsvFiles.map(f => f.name).join(', ');
      document.getElementById('csv-upload-btn').disabled = pendingCsvFiles.length === 0;
      input.value = '';
    });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      pendingCsvFiles = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.csv'));
      listEl.textContent = pendingCsvFiles.map(f => f.name).join(', ');
      document.getElementById('csv-upload-btn').disabled = pendingCsvFiles.length === 0;
    });

    document.getElementById('csv-clear-btn').addEventListener('click', () => {
      pendingCsvFiles = []; listEl.textContent = '';
      document.getElementById('csv-upload-btn').disabled = true;
      document.getElementById('csv-upload-status').textContent = '';
    });

    document.getElementById('csv-upload-btn').addEventListener('click', () => {
      if (!pendingCsvFiles.length) return;
      const statusEl = document.getElementById('csv-upload-status');
      statusEl.textContent = 'Uploading…';
      ensureMapReady().then(async () => {
        let total = 0;
        const country = getSelectedMapCountry();
        for (const file of pendingCsvFiles) {
          const text = await file.text();
          const pts = parseCSV(text);
          if (!pts.length) throw new Error('No valid points in ' + file.name);

          // Check for existing points with the same filename + country
          const existing = await _mapDb.collection('points')
            .where('fileName', '==', file.name)
            .where('country', '==', country)
            .get();

          if (!existing.empty) {
            const choice = await new Promise(resolve => {
              const overlay = document.createElement('div');
              overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
              overlay.innerHTML = `
                <div style="background:var(--color-surface,#fff);border-radius:8px;padding:1.5rem;max-width:380px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,.3)">
                  <p style="margin:0 0 1rem;font-weight:600">Duplicate file detected</p>
                  <p style="margin:0 0 1.25rem;font-size:.9rem">${existing.size} point(s) from <strong>${file.name}</strong> already exist for <strong>${country}</strong>. What would you like to do?</p>
                  <div style="display:flex;gap:.5rem;justify-content:flex-end">
                    <button id="_dup-cancel" style="padding:.4rem .9rem;border:1px solid currentColor;border-radius:4px;background:none;cursor:pointer">Cancel</button>
                    <button id="_dup-keep" style="padding:.4rem .9rem;border:1px solid currentColor;border-radius:4px;background:none;cursor:pointer">Keep both</button>
                    <button id="_dup-replace" style="padding:.4rem .9rem;border-radius:4px;background:var(--color-primary,#1a73e8);color:#fff;border:none;cursor:pointer">Replace</button>
                  </div>
                </div>`;
              document.body.appendChild(overlay);
              const cleanup = v => { document.body.removeChild(overlay); resolve(v); };
              overlay.querySelector('#_dup-cancel').onclick  = () => cleanup('cancel');
              overlay.querySelector('#_dup-keep').onclick    = () => cleanup('keep');
              overlay.querySelector('#_dup-replace').onclick = () => cleanup('replace');
            });

            if (choice === 'cancel') continue;

            if (choice === 'replace') {
              // Delete existing docs in chunks of 500 (Firestore batch limit)
              const docs = existing.docs;
              for (let i = 0; i < docs.length; i += 500) {
                const delBatch = _mapDb.batch();
                docs.slice(i, i + 500).forEach(d => delBatch.delete(d.ref));
                await delBatch.commit();
              }
            }
          }

          const storagePath = 'csv/' + Date.now() + '_' + file.name;
          await _mapStorage.ref(storagePath).put(file);
          const batch = _mapDb.batch();
          pts.forEach(p => {
            const ref = _mapDb.collection('points').doc();
            batch.set(ref, { name: p.name, lat: p.lat, lon: p.lon, url: p.url || null,
              country, metadata: p.metadata, fileName: file.name, storagePath,
              uploadedAt: firebase.firestore.FieldValue.serverTimestamp() });
          });
          await batch.commit();
          total += pts.length;
        }
        return total;
      }).then(total => {
        statusEl.textContent = '✓ Uploaded ' + total + ' point(s) from ' + pendingCsvFiles.length + ' file(s)!';
        TomikaBikes.showToast('Points uploaded!', 'success');
        pendingCsvFiles = []; document.getElementById('csv-file-list').textContent = '';
        document.getElementById('csv-upload-btn').disabled = true;
      }).catch(err => {
        statusEl.textContent = 'Error: ' + err.message;
        TomikaBikes.showToast('Upload failed: ' + err.message, 'error');
      });
    });
  }

  // ── Google Maps Point wiring
  function setupGmapsInput() {
    const btn = document.getElementById('gmaps-admin-btn');
    btn.addEventListener('click', () => {
      const url = document.getElementById('gmaps-admin-url').value.trim();
      if (!url) { TomikaBikes.showToast('Please enter a Google Maps URL', 'error'); return; }
      const nameOverride = document.getElementById('gmaps-admin-name').value.trim();
      const type = document.getElementById('gmaps-admin-type').value;
      const country = getSelectedMapCountry();
      const statusEl = document.getElementById('gmaps-admin-status');
      statusEl.textContent = 'Processing…';
      btn.disabled = true;

      function handleParsed(parsed) {
        const pointName = nameOverride || parsed.name;
        return ensureMapReady().then(() =>
          _mapDb.collection('points').add({
            name: pointName, lat: parsed.lat, lon: parsed.lon, url,
            country,
            metadata: { Type: type },
            fileName: 'Google Maps - ' + pointName, storagePath: null,
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
          })
        ).then(() => {
          statusEl.textContent = '✓ Added "' + pointName + '" to the map!';
          TomikaBikes.showToast('Point added: ' + pointName, 'success');
          document.getElementById('gmaps-admin-url').value = '';
          document.getElementById('gmaps-admin-name').value = '';
        });
      }

      const done = (fn) => fn().then(() => { btn.disabled = false; }).catch(err => {
        statusEl.textContent = 'Error: ' + err.message;
        TomikaBikes.showToast('Failed: ' + err.message, 'error');
        btn.disabled = false;
      });

      if (isShortGoogleMapsUrl(url)) {
        btn.textContent = 'Resolving…';
        done(() => expandShortUrl(url)
          .then(full => handleParsed(parseGoogleMapsUrl(full)))
          .finally(() => { btn.textContent = '📍 Add Point'; })
        );
      } else {
        done(() => {
          try { return handleParsed(parseGoogleMapsUrl(url)); }
          catch (e) { return Promise.reject(e); }
        });
      }
    });
  }

  // ── Delete points by filename wiring
  function setupDeleteByFilename() {
    const searchBtn  = document.getElementById('del-filename-search-btn');
    const deleteBtn  = document.getElementById('del-filename-btn');
    const input      = document.getElementById('del-filename-input');
    const previewEl  = document.getElementById('del-filename-preview');
    const statusEl   = document.getElementById('del-filename-status');

    let matchedDocs = [];

    function reset() {
      matchedDocs = [];
      previewEl.textContent = '';
      statusEl.textContent = '';
      deleteBtn.disabled = true;
    }

    input.addEventListener('input', reset);

    searchBtn.addEventListener('click', async () => {
      const filename = input.value.trim();
      if (!filename) { previewEl.textContent = 'Enter a filename first.'; return; }
      previewEl.textContent = 'Searching…';
      statusEl.textContent = '';
      deleteBtn.disabled = true;
      matchedDocs = [];
      try {
        await ensureMapReady();
        const country = getSelectedMapCountry();
        const snap = await _mapDb.collection('points')
          .where('fileName', '==', filename)
          .where('country', '==', country)
          .get();
        matchedDocs = snap.docs;
        if (matchedDocs.length === 0) {
          previewEl.textContent = `No points found for "${filename}" in ${country}.`;
        } else {
          previewEl.textContent = `Found ${matchedDocs.length} point(s) from "${filename}" in ${country}.`;
          deleteBtn.disabled = false;
        }
      } catch (err) {
        previewEl.textContent = 'Search failed: ' + err.message;
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (!matchedDocs.length) return;
      const filename = input.value.trim();
      const country = getSelectedMapCountry();
      if (!confirm(`Permanently delete ${matchedDocs.length} point(s) from "${filename}" in ${country}? This cannot be undone.`)) return;
      deleteBtn.disabled = true;
      statusEl.textContent = 'Deleting…';
      try {
        for (let i = 0; i < matchedDocs.length; i += 500) {
          const batch = _mapDb.batch();
          matchedDocs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        statusEl.textContent = `✓ Deleted ${matchedDocs.length} point(s).`;
        previewEl.textContent = '';
        input.value = '';
        matchedDocs = [];
        TomikaBikes.showToast('Points deleted!', 'success');
      } catch (err) {
        statusEl.textContent = 'Delete failed: ' + err.message;
        deleteBtn.disabled = false;
      }
    });
  }

  // ── Init all wiring on page load
  setupGpxDropZone();
  setupCsvDropZone();
  setupGmapsInput();
  setupDeleteByFilename();
})();
