// js/admin/photos.js — Photos Admin section of admin.html: EXIF GPS/date
// extraction, reverse-geocoding, upload queue, and photos collection CRUD.

// ── Photos Admin ──────────────────────────────────────────────
(function () {
  let photosDb = null;
  let photosStorage = null;
  let queue = []; // { id, file, blobUrl, el, barEl, statusEl, captionEl, locationEl }
  let galleryDocs = [];
  let initialized = false;
  let _sdkLoaded = false;
  let editDocId = null;

  // ── Load exifr (lite) for GPS extraction from EXIF
  (function () {
    if (window.exifr) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js';
    s.onerror = () => console.warn('exifr failed to load; GPS detection disabled');
    document.head.appendChild(s);
  })();

  // ── Lazy-load Firebase Storage SDK
  function loadStorageSdk() {
    if (_sdkLoaded) return Promise.resolve();
    // Check if another section already injected it
    if ([...document.scripts].some(s => (s.getAttribute('src') || '').includes('firebase-storage-compat'))) {
      _sdkLoaded = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js';
      s.onload = () => { _sdkLoaded = true; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function ensureReady() {
    return loadStorageSdk().then(() => {
      if (photosDb) return;
      photosDb = _getAdminDb();
      photosStorage = firebase.storage();
    });
  }

  // ── Helpers
  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  function escAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  // ── Auto-generate caption from filename
  function autoCaption(filename) {
    let name = filename.replace(/\.[^.]+$/, '');
    // Strip common camera prefixes
    name = name.replace(/^(IMG|DSC|DSCN|DSCF|MVI|VID|MOV|PXL|PANO|BURST)[-_]/i, '');
    // Strip leading date/time stamps (YYYYMMDD or YYYY-MM-DD with optional HHMMSS)
    name = name.replace(/^\d{4}[-_]?\d{2}[-_]?\d{2}([-_T]\d{6})?[-_]?/, '');
    // Replace separators with spaces
    name = name.replace(/[-_]+/g, ' ').trim();
    if (!name) name = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
  }

  // ── Extract GPS from EXIF using exifr (if loaded)
  async function tryExtractGps(file) {
    if (!window.exifr) return null;
    try {
      const gps = await window.exifr.gps(file);
      if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
        return { lat: gps.latitude, lon: gps.longitude };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // ── Extract date taken from EXIF using exifr (if loaded)
  async function tryExtractDate(file) {
    if (!window.exifr) return null;
    try {
      const data = await window.exifr.parse(file, ['DateTimeOriginal', 'DateTime']);
      if (data && data.DateTimeOriginal instanceof Date) return data.DateTimeOriginal;
      if (data && data.DateTime instanceof Date) return data.DateTime;
    } catch (e) { /* ignore */ }
    return null;
  }

  // ── Reverse-geocode lat/lon to nearest city via Nominatim
  async function reverseGeocode(lat, lon) {
    try {
      const url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
        encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon) + '&zoom=12&accept-language=en';
      const resp = await fetch(url, { headers: { 'User-Agent': 'tomika.bike/1.0 (travel photo gallery)' } });
      if (!resp.ok) return '';
      const data = await resp.json();
      const a = data.address || {};
      return a.city || a.town || a.village || a.county || a.state || '';
    } catch (e) { return ''; }
  }

  // ── Queue management
  const MAX_SIZE = 10 * 1048576;
  const ALLOWED  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

  function addFilesToQueue(files) {
    Array.from(files).forEach(file => {
      const extMatch = file.name.match(/\.([^.]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : '';
      const isHeicExt = ext === 'heic' || ext === 'heif';
      // Some mobile browsers report HEIC files with an empty MIME type; fall back to extension check
      const typeOk = ALLOWED.includes(file.type) || (isHeicExt && !file.type);
      if (!typeOk) {
        showToast(file.name + ' is not a supported image type', 'error');
        return;
      }
      if (file.size > MAX_SIZE) {
        showToast(file.name + ' exceeds the 10 MB limit', 'error');
        return;
      }
      const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const blobUrl = URL.createObjectURL(file);
      const suggestedCaption = autoCaption(file.name);

      const el = document.createElement('div');
      el.className = 'photo-queue-item';
      el.dataset.qid = id;
      el.innerHTML =
        '<img class="photo-queue-thumb" src="' + escAttr(blobUrl) + '" alt="">' +
        '<div class="photo-queue-info">' +
          '<div class="photo-queue-name">' + esc(file.name) + '</div>' +
          '<div class="photo-queue-meta">' + esc(fmtSize(file.size)) + '</div>' +
          '<div class="photo-queue-fields">' +
            '<input type="text" class="photo-queue-caption" placeholder="Caption..." value="' + escAttr(suggestedCaption) + '">' +
            '<input type="text" class="photo-queue-location" placeholder="📍 Detecting location…" value="">' +
            '<div class="photo-queue-location-status"></div>' +
          '</div>' +
          '<div class="photo-queue-progress"><div class="photo-queue-bar"></div></div>' +
          '<div class="photo-queue-status" style="font-size:.72rem;margin-top:.2rem;color:var(--color-gray-500)">Ready</div>' +
        '</div>' +
        '<button class="photo-queue-remove" title="Remove">✕</button>';

      el.querySelector('.photo-queue-remove').addEventListener('click', () => {
        URL.revokeObjectURL(blobUrl);
        queue = queue.filter(q => q.id !== id);
        el.remove();
        syncUploadBtn();
      });

      const captionEl  = el.querySelector('.photo-queue-caption');
      const locationEl = el.querySelector('.photo-queue-location');
      const locStatus  = el.querySelector('.photo-queue-location-status');

      queue.push({ id, file, blobUrl, el,
        barEl:     el.querySelector('.photo-queue-bar'),
        statusEl:  el.querySelector('.photo-queue-status'),
        captionEl,
        locationEl,
        takenAt:   null });
      document.getElementById('photos-queue').appendChild(el);

      // Async GPS + date detection
      (async () => {
        const [gps, dateTaken] = await Promise.all([tryExtractGps(file), tryExtractDate(file)]);
        // Store date taken for upload
        const queueItem = queue.find(q => q.id === id);
        if (queueItem && dateTaken) queueItem.takenAt = dateTaken;
        if (!gps) {
          locationEl.placeholder = '📍 No GPS data — enter manually';
          return;
        }
        locStatus.textContent = '🔍 Looking up location…';
        locationEl.placeholder = '📍 Looking up…';
        const city = await reverseGeocode(gps.lat, gps.lon);
        locStatus.textContent = '';
        if (city) {
          locationEl.value = city;
          locationEl.placeholder = '📍 Location';
        } else {
          locationEl.placeholder = '📍 Location not found — enter manually';
        }
      })();
    });
    syncUploadBtn();
  }

  function syncUploadBtn() {
    document.getElementById('photos-upload-btn').disabled = queue.length === 0;
  }

  // ── Drop-zone wiring
  function setupDropZone() {
    const zone  = document.getElementById('photos-drop-zone');
    const input = document.getElementById('photos-file-input');

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files.length) addFilesToQueue(input.files);
      input.value = '';
    });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', e => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) addFilesToQueue(e.dataTransfer.files);
    });
  }

  // ── Canvas resize helper
  // Returns a Promise<Blob> of the image resized to fit within maxPx on its longest side.
  function resizeImage(file, maxPx, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const blobUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
          else                 { width  = Math.round(width  * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Image load failed')); };
      img.src = blobUrl;
    });
  }

  // ── Upload
  function uploadAll() {
    if (!queue.length) return;
    const album = (document.getElementById('photos-album').value.trim() || 'general').replace(/[^a-zA-Z0-9 _-]/g, '_');
    const btn = document.getElementById('photos-upload-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Uploading…';

    ensureReady()
      .then(() => Promise.allSettled(queue.map(item => uploadOne(item, album))))
      .then(results => {
        const ok   = results.filter(r => r.status === 'fulfilled').length;
        const fail = results.filter(r => r.status === 'rejected').length;
        if (fail === 0) {
          showToast(ok + ' photo' + (ok !== 1 ? 's' : '') + ' uploaded!', 'success');
          // Remove successful items
          const failedIds = new Set(
            results.map((r, i) => r.status === 'rejected' ? queue[i].id : null).filter(Boolean)
          );
          queue = queue.filter(q => failedIds.has(q.id));
          if (!queue.length) document.getElementById('photos-queue').innerHTML = '';
        } else {
          showToast(ok + ' uploaded, ' + fail + ' failed', 'error');
        }
        btn.textContent = '📤 Upload All';
        btn.disabled = queue.length === 0;
        loadGallery();
      });
  }

  function uploadOne(item, album) {
    const safeName  = sanitizeFilename(item.file.name).replace(/\.[^.]+$/, '') + '.jpg';
    const base      = 'photos/' + album + '/' + Date.now();
    const pathFull  = base + '_full_'  + safeName;
    const pathThumb = base + '_thumb_' + safeName;
    const caption   = item.captionEl  ? item.captionEl.value.trim()  : '';
    const location  = item.locationEl ? item.locationEl.value.trim() : '';

    item.statusEl.textContent = 'Resizing…';
    item.statusEl.style.color = 'var(--color-secondary)';

    return Promise.all([
      resizeImage(item.file, 1920, 0.82),
      resizeImage(item.file, 600,  0.75)
    ]).then(([fullBlob, thumbBlob]) => {
      item.statusEl.textContent = 'Uploading…';
      // Show combined progress: full upload = 0-70%, thumb = 70-90%, Firestore = 90-100%
      let fullPct = 0, thumbPct = 0;
      const updateBar = () => {
        item.barEl.style.width = Math.round(fullPct * 0.7 + thumbPct * 0.2 + 0) + '%';
      };

      const uploadBlob = (path, blob) => new Promise((resolve, reject) => {
        const task = photosStorage.ref(path).put(blob, { contentType: 'image/jpeg' });
        task.on('state_changed',
          snap => {
            const pct = snap.bytesTransferred / snap.totalBytes * 100;
            if (path === pathFull) { fullPct = pct; } else { thumbPct = pct; }
            updateBar();
          },
          reject,
          () => task.snapshot.ref.getDownloadURL().then(resolve).catch(reject)
        );
      });

      return Promise.all([uploadBlob(pathFull, fullBlob), uploadBlob(pathThumb, thumbBlob)])
        .then(([url, thumbUrl]) => {
          item.barEl.style.width = '90%';
          return photosDb.collection('photos').add({
            url,
            thumbUrl,
            storagePath: pathFull,
            thumbStoragePath: pathThumb,
            album,
            caption: caption || '',
            location: location || '',
            fileName: item.file.name,
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
            ...(item.takenAt ? { takenAt: firebase.firestore.Timestamp.fromDate(item.takenAt) } : {})
          });
        })
        .then(() => {
          item.barEl.style.width = '100%';
          item.statusEl.textContent = '✓ Done';
          item.statusEl.style.color = '#27ae60';
          URL.revokeObjectURL(item.blobUrl);
        });
    }).catch(err => {
      item.statusEl.textContent = 'Failed: ' + err.message;
      item.statusEl.style.color = '#e74c3c';
      throw err;
    });
  }

  // ── Gallery (paginated — loads GALLERY_PAGE_SIZE at a time, "See more" fetches the next page)
  const GALLERY_PAGE_SIZE = 60;
  let _galleryLastDoc = null;
  let _galleryHasMore = true;

  function loadGallery() {
    galleryDocs = [];
    _galleryLastDoc = null;
    _galleryHasMore = true;
    const statusEl = document.getElementById('photos-gallery-status');
    statusEl.textContent = 'Loading photos…';
    ensureReady()
      .then(() => fetchGalleryPage())
      .catch(err => { statusEl.textContent = 'Error loading gallery: ' + err.message; });
  }

  function fetchGalleryPage() {
    let q = photosDb.collection('photos').orderBy('uploadedAt', 'desc').limit(GALLERY_PAGE_SIZE);
    if (_galleryLastDoc) q = q.startAfter(_galleryLastDoc);
    return q.get().then(snapshot => {
      snapshot.forEach(doc => galleryDocs.push({ id: doc.id, data: doc.data() }));
      _galleryHasMore = snapshot.size === GALLERY_PAGE_SIZE;
      if (!snapshot.empty) _galleryLastDoc = snapshot.docs[snapshot.docs.length - 1];
      populateAlbumFilter();
      renderGallery(document.getElementById('photos-gallery-filter').value);
      const statusEl = document.getElementById('photos-gallery-status');
      statusEl.textContent = galleryDocs.length + ' photo' + (galleryDocs.length !== 1 ? 's' : '') +
        (_galleryHasMore ? ' — more available' : '');
      const moreBtn = document.getElementById('photos-gallery-more-btn');
      moreBtn.style.display = _galleryHasMore ? '' : 'none';
    });
  }

  function loadMoreGallery() {
    const btn = document.getElementById('photos-gallery-more-btn');
    btn.disabled = true;
    btn.textContent = 'Loading…';
    fetchGalleryPage()
      .catch(err => showToast('Failed to load more photos: ' + err.message, 'error'))
      .finally(() => {
        btn.disabled = false;
        btn.textContent = 'See more photos';
      });
  }

  function populateAlbumFilter() {
    const select  = document.getElementById('photos-gallery-filter');
    const current = select.value;
    select.innerHTML = '<option value="">All albums</option>';
    const albums = new Set(galleryDocs.map(d => d.data.album).filter(Boolean));
    Array.from(albums).sort().forEach(a => {
      const opt = document.createElement('option');
      opt.value = a; opt.textContent = a;
      select.appendChild(opt);
    });
    if (current) select.value = current;
  }

  // ── Helper: sortable ms timestamp from takenAt or uploadedAt
  function docTs(data) {
    const t = data.takenAt || data.uploadedAt;
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (t instanceof Date) return t.getTime();
    return 0;
  }

  // ── Helper: format a Firestore Timestamp (or Date) as a short date string
  function fmtDocDate(t) {
    if (!t) return '';
    let d;
    if (typeof t.toDate === 'function') d = t.toDate();
    else if (t.seconds) d = new Date(t.seconds * 1000);
    else if (t instanceof Date) d = t;
    else return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderGallery(filterAlbum) {
    const gallery = document.getElementById('photos-gallery');
    let docs = filterAlbum ? galleryDocs.filter(d => d.data.album === filterAlbum) : galleryDocs;
    if (!docs.length) {
      gallery.innerHTML = '<p style="color:var(--color-gray-500);grid-column:1/-1">No photos yet.</p>';
      return;
    }
    // Sort by takenAt first, falling back to uploadedAt (most recent first, oldest last)
    docs = docs.slice().sort((a, b) => docTs(b.data) - docTs(a.data));
    gallery.innerHTML = docs.map(doc => {
      const d = doc.data;
      const dateStr = fmtDocDate(d.takenAt || d.uploadedAt);
      return '<div class="photo-gallery-card">' +
        '<img src="' + escAttr(d.thumbUrl || d.url || '') + '" alt="' + escAttr(d.caption || d.fileName || '') + '" loading="lazy">' +
        '<div class="pgc-body">' +
          '<div class="pgc-album">' + esc(d.album || 'general') + '</div>' +
          (d.location ? '<div class="pgc-location">📍 ' + esc(d.location) + '</div>' : '') +
          '<div class="pgc-caption">' + esc(d.caption || d.fileName || '') + '</div>' +
          (dateStr ? '<div class="pgc-date" style="font-size:.68rem;color:var(--color-gray-400);margin-top:.15rem">📅 ' + esc(dateStr) + '</div>' : '') +
        '</div>' +
        '<div class="pgc-actions">' +
          '<a href="' + escAttr(d.url || '#') + '" target="_blank" rel="noopener noreferrer">🔗 View</a>' +
          '<button class="pgc-edit-btn" data-docid="' + escAttr(doc.id) + '">✏️ Edit</button>' +
          '<button class="pgc-del-btn" data-docid="' + escAttr(doc.id) + '" data-sp="' + escAttr(d.storagePath || '') + '">🗑 Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');

    gallery.querySelectorAll('.pgc-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const doc = galleryDocs.find(d => d.id === btn.dataset.docid);
        if (doc) editPhoto(doc.id, doc.data);
      });
    });

    gallery.querySelectorAll('.pgc-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deletePhoto(btn.dataset.docid, btn.dataset.sp));
    });
  }

  function deletePhoto(docId, storagePath) {
    if (!confirm('Delete this photo? This cannot be undone.')) return;
    ensureReady()
      .then(() => {
        const ops = [photosDb.collection('photos').doc(docId).delete()];
        if (storagePath) {
          ops.push(photosStorage.ref(storagePath).delete().catch(e => console.warn('Storage delete:', e)));
        }
        return Promise.all(ops);
      })
      .then(() => {
        galleryDocs = galleryDocs.filter(d => d.id !== docId);
        populateAlbumFilter();
        renderGallery(document.getElementById('photos-gallery-filter').value);
        document.getElementById('photos-gallery-status').textContent =
          galleryDocs.length + ' photo' + (galleryDocs.length !== 1 ? 's' : '');
        showToast('Photo deleted', 'success');
      })
      .catch(err => showToast('Delete failed: ' + err.message, 'error'));
  }

  // ── Edit photo
  function editPhoto(docId, data) {
    editDocId = docId;
    document.getElementById('photo-edit-img').src = data.thumbUrl || data.url || '';
    document.getElementById('photo-edit-caption').value = data.caption || '';
    document.getElementById('photo-edit-location').value = data.location || '';
    document.getElementById('photo-edit-album').value = data.album || '';
    // Populate date field from takenAt (Firestore Timestamp) or uploadedAt as fallback
    const dateEl = document.getElementById('photo-edit-date');
    let dateVal = '';
    if (data.takenAt && typeof data.takenAt.toDate === 'function') {
      dateVal = data.takenAt.toDate().toISOString().slice(0, 10);
    } else if (data.takenAt && data.takenAt.seconds) {
      dateVal = new Date(data.takenAt.seconds * 1000).toISOString().slice(0, 10);
    }
    if (dateEl) dateEl.value = dateVal;
    document.getElementById('photo-edit-overlay').classList.add('open');
  }

  function closeEditModal() {
    document.getElementById('photo-edit-overlay').classList.remove('open');
    editDocId = null;
  }

  function savePhotoEdit() {
    if (!editDocId) return;
    const caption  = document.getElementById('photo-edit-caption').value.trim();
    const location = document.getElementById('photo-edit-location').value.trim();
    const album    = document.getElementById('photo-edit-album').value.trim().replace(/[^a-zA-Z0-9 _-]/g, '_');
    const dateVal  = (document.getElementById('photo-edit-date') || {}).value || '';
    const saveBtn  = document.getElementById('photo-edit-save');
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Saving…';

    const updates = { caption, location, album };
    if (dateVal) {
      updates.takenAt = firebase.firestore.Timestamp.fromDate(new Date(dateVal));
    } else {
      updates.takenAt = firebase.firestore.FieldValue.delete();
    }

    ensureReady()
      .then(() => photosDb.collection('photos').doc(editDocId).update(updates))
      .then(() => {
        const idx = galleryDocs.findIndex(d => d.id === editDocId);
        if (idx >= 0) {
          galleryDocs[idx].data.caption  = caption;
          galleryDocs[idx].data.location = location;
          galleryDocs[idx].data.album    = album;
          if (dateVal) {
            galleryDocs[idx].data.takenAt = firebase.firestore.Timestamp.fromDate(new Date(dateVal));
          } else {
            delete galleryDocs[idx].data.takenAt;
          }
        }
        closeEditModal();
        populateAlbumFilter();
        renderGallery(document.getElementById('photos-gallery-filter').value);
        showToast('Photo updated!', 'success');
      })
      .catch(err => showToast('Save failed: ' + err.message, 'error'))
      .finally(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Changes';
      });
  }

  // ── Init (lazy — runs on first visit to Photos section)
  function init() {
    if (initialized) return;
    initialized = true;
    setupDropZone();
    document.getElementById('photos-upload-btn').addEventListener('click', uploadAll);
    document.getElementById('photos-clear-btn').addEventListener('click', () => {
      queue.forEach(q => URL.revokeObjectURL(q.blobUrl));
      queue = [];
      document.getElementById('photos-queue').innerHTML = '';
      syncUploadBtn();
    });
    document.getElementById('photos-gallery-filter').addEventListener('change', e => renderGallery(e.target.value));
    document.getElementById('photos-gallery-more-btn').addEventListener('click', loadMoreGallery);
    // Edit modal
    document.getElementById('photo-edit-close').addEventListener('click', closeEditModal);
    document.getElementById('photo-edit-cancel').addEventListener('click', closeEditModal);
    document.getElementById('photo-edit-save').addEventListener('click', savePhotoEdit);
    document.getElementById('photo-edit-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('photo-edit-overlay')) closeEditModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('photo-edit-overlay').classList.contains('open')) closeEditModal();
    });
    loadGallery();
  }

  // Intercept showSection to trigger Photos init
  const _origShowSection = window.showSection;
  window.showSection = function (name, linkEl) {
    _origShowSection(name, linkEl);
    if (name === 'photos') init();
  };
})();
