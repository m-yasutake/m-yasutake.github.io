// js/admin/videos.js — Videos Admin section of admin.html: upload queue,
// thumbnail capture, and videos collection CRUD.

// ── Videos Admin ─────────────────────────────────────────────
(function () {
  let videosDb      = null;
  let videosStorage = null;
  let queue         = []; // { id, file, thumbBlobUrl, thumbBlob, duration, el, barEl, statusEl, titleEl, locationEl }
  let galleryDocs   = [];
  let initialized   = false;
  let _sdkLoaded    = false;

  // ── Lazy-load Firebase Storage SDK (shared with Photos admin)
  function loadStorageSdk() {
    if (_sdkLoaded) return Promise.resolve();
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
      if (videosDb) return;
      videosDb      = _getAdminDb();
      videosStorage = firebase.storage();
    });
  }

  // ── Helpers
  function fmtSize(b) {
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str == null ? '' : str);
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

  function autoTitle(filename) {
    let name = filename.replace(/\.[^.]+$/, '');
    name = name.replace(/^(IMG|DSC|DSCN|MVI|VID|MOV|PXL)[-_]/i, '');
    name = name.replace(/^\d{4}[-_]?\d{2}[-_]?\d{2}([-_T]\d{6})?[-_]?/, '');
    name = name.replace(/[-_]+/g, ' ').trim();
    if (!name) name = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
  }

  function fmtDuration(secs) {
    if (!secs || isNaN(secs)) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  // ── First-frame thumbnail capture via canvas
  function captureVideoThumb(file) {
    return new Promise((resolve, reject) => {
      const vidUrl = URL.createObjectURL(file);
      const video  = document.createElement('video');
      video.muted       = true;
      video.playsInline = true;
      video.preload     = 'metadata';
      const maxPx = 600;

      video.addEventListener('loadedmetadata', () => {
        video.currentTime = Math.min(0.5, (video.duration || 0) * 0.05);
      }, { once: true });

      video.addEventListener('seeked', () => {
        const w0 = video.videoWidth, h0 = video.videoHeight;
        if (!w0 || !h0) {
          URL.revokeObjectURL(vidUrl);
          reject(new Error('Could not read video dimensions'));
          return;
        }
        let w = w0, h = h0;
        if (w > maxPx || h > maxPx) {
          if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else        { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(video, 0, 0, w, h);
        const duration = video.duration;
        URL.revokeObjectURL(vidUrl);
        canvas.toBlob(
          blob => (blob ? resolve({ blob, duration }) : reject(new Error('Canvas toBlob failed'))),
          'image/jpeg', 0.75
        );
      }, { once: true });

      video.addEventListener('error', () => {
        URL.revokeObjectURL(vidUrl);
        reject(new Error('Video could not be read for thumbnail capture'));
      }, { once: true });

      video.src = vidUrl;
      video.load();
    });
  }

  // ── Queue management
  const MAX_SIZE = 500 * 1048576; // 500 MB
  const ALLOWED  = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];

  function addFileToQueue(file) {
    const extMatch = file.name.match(/\.([^.]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : '';
    const isMovExt = ext === 'mov';
    const typeOk = ALLOWED.includes(file.type) || (isMovExt && !file.type);
    if (!typeOk) {
      showToast(file.name + ' is not a supported video type (MP4, MOV, WebM)', 'error');
      return;
    }
    if (file.size > MAX_SIZE) {
      showToast(file.name + ' exceeds the 500 MB limit', 'error');
      return;
    }

    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const suggestedTitle = autoTitle(file.name);

    const el = document.createElement('div');
    el.className  = 'photo-queue-item';
    el.dataset.qid = id;
    el.innerHTML =
      '<div class="photo-queue-thumb" id="vqthumb-' + escAttr(id) + '" ' +
        'style="display:flex;align-items:center;justify-content:center;font-size:1.25rem;' +
        'background:var(--color-gray-200);overflow:hidden">⏳</div>' +
      '<div class="photo-queue-info">' +
        '<div class="photo-queue-name">' + esc(file.name) + '</div>' +
        '<div class="photo-queue-meta">' + esc(fmtSize(file.size)) + '</div>' +
        '<div class="photo-queue-fields">' +
          '<input type="text" class="photo-queue-caption" placeholder="Title…" value="' + escAttr(suggestedTitle) + '">' +
          '<input type="text" class="photo-queue-location" placeholder="📍 Location (optional)" value="">' +
        '</div>' +
        '<div class="photo-queue-progress"><div class="photo-queue-bar"></div></div>' +
        '<div class="photo-queue-status" style="font-size:.72rem;margin-top:.2rem;color:var(--color-gray-500)">Capturing thumbnail…</div>' +
      '</div>' +
      '<button class="photo-queue-remove" title="Remove">✕</button>';

    const titleEl    = el.querySelector('.photo-queue-caption');
    const locationEl = el.querySelector('.photo-queue-location');
    const statusEl   = el.querySelector('.photo-queue-status');
    const barEl      = el.querySelector('.photo-queue-bar');
    const thumbDiv   = document.getElementById('vqthumb-' + id) || el.querySelector('.photo-queue-thumb');

    const queueItem = { id, file, thumbBlobUrl: null, thumbBlob: null, duration: null,
                        el, barEl, statusEl, titleEl, locationEl };

    el.querySelector('.photo-queue-remove').addEventListener('click', () => {
      if (queueItem.thumbBlobUrl) URL.revokeObjectURL(queueItem.thumbBlobUrl);
      queue = queue.filter(q => q.id !== id);
      el.remove();
      syncUploadBtn();
    });

    queue.push(queueItem);
    document.getElementById('videos-queue').appendChild(el);

    // Async thumbnail capture
    captureVideoThumb(file)
      .then(({ blob, duration }) => {
        queueItem.thumbBlob    = blob;
        queueItem.duration     = duration;
        queueItem.thumbBlobUrl = URL.createObjectURL(blob);
        thumbDiv.innerHTML = '';
        const img = document.createElement('img');
        img.src = queueItem.thumbBlobUrl;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        thumbDiv.appendChild(img);
        statusEl.textContent = duration ? 'Ready  (' + fmtDuration(duration) + ')' : 'Ready';
        statusEl.style.color = 'var(--color-gray-500)';
        syncUploadBtn();
      })
      .catch(() => {
        thumbDiv.innerHTML = '🎬';
        statusEl.textContent = 'Thumbnail unavailable — will upload without preview';
        statusEl.style.color = 'var(--color-gray-500)';
        syncUploadBtn();
      });

    syncUploadBtn();
  }

  function addFilesToQueue(files) {
    Array.from(files).forEach(f => addFileToQueue(f));
  }

  function syncUploadBtn() {
    document.getElementById('videos-upload-btn').disabled = queue.length === 0;
  }

  // ── Drop-zone wiring
  function setupDropZone() {
    const zone  = document.getElementById('videos-drop-zone');
    const input = document.getElementById('videos-file-input');
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

  // ── Upload
  function uploadAll() {
    if (!queue.length) return;
    const album = (document.getElementById('videos-album').value.trim() || 'general')
      .replace(/[^a-zA-Z0-9 _-]/g, '_');
    const btn = document.getElementById('videos-upload-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Uploading…';

    ensureReady()
      .then(() => Promise.allSettled(queue.map(item => uploadOne(item, album))))
      .then(results => {
        const ok   = results.filter(r => r.status === 'fulfilled').length;
        const fail = results.filter(r => r.status === 'rejected').length;
        if (fail === 0) {
          showToast(ok + ' video' + (ok !== 1 ? 's' : '') + ' uploaded!', 'success');
          const failedIds = new Set(
            results.map((r, i) => r.status === 'rejected' ? queue[i].id : null).filter(Boolean)
          );
          queue = queue.filter(q => failedIds.has(q.id));
          if (!queue.length) document.getElementById('videos-queue').innerHTML = '';
        } else {
          showToast(ok + ' uploaded, ' + fail + ' failed', 'error');
        }
        btn.textContent = '📤 Upload All';
        btn.disabled    = queue.length === 0;
        loadGallery();
      });
  }

  function uploadOne(item, album) {
    const extMatch  = item.file.name.match(/\.([^.]+)$/);
    const ext       = extMatch ? extMatch[1].toLowerCase() : 'mp4';
    const safeName  = sanitizeFilename(item.file.name).replace(/\.[^.]+$/, '');
    const base      = 'videos/' + album + '/' + Date.now();
    const pathVideo = base + '_' + safeName + '.' + ext;
    const pathThumb = base + '_thumb_' + safeName + '.jpg';
    const title     = item.titleEl    ? item.titleEl.value.trim()    : '';
    const location  = item.locationEl ? item.locationEl.value.trim() : '';

    item.statusEl.textContent = 'Uploading…';
    item.statusEl.style.color = 'var(--color-secondary)';

    const uploadBlob = (path, blob, mime) => new Promise((resolve, reject) => {
      const task = videosStorage.ref(path).put(blob, { contentType: mime });
      task.on('state_changed',
        snap => {
          const pct    = snap.bytesTransferred / snap.totalBytes * 100;
          const isThumb = path === pathThumb;
          item.barEl.style.width = Math.round(isThumb ? 85 + pct * 0.1 : pct * 0.85) + '%';
        },
        reject,
        () => task.snapshot.ref.getDownloadURL().then(resolve).catch(reject)
      );
    });

    const videoMime = item.file.type || 'video/mp4';
    const thumbOp   = item.thumbBlob
      ? uploadBlob(pathThumb, item.thumbBlob, 'image/jpeg')
      : Promise.resolve(null);

    return Promise.all([uploadBlob(pathVideo, item.file, videoMime), thumbOp])
      .then(([videoUrl, thumbUrl]) => {
        item.barEl.style.width = '95%';
        const docData = {
          url:              videoUrl,
          thumbUrl:         thumbUrl || '',
          storagePath:      pathVideo,
          thumbStoragePath: thumbUrl ? pathThumb : '',
          album,
          title:            title    || '',
          location:         location || '',
          fileName:         item.file.name,
          uploadedAt:       firebase.firestore.FieldValue.serverTimestamp()
        };
        if (item.duration) docData.duration = Math.round(item.duration);
        return videosDb.collection('videos').add(docData);
      })
      .then(() => {
        item.barEl.style.width = '100%';
        item.statusEl.textContent = '✓ Done';
        item.statusEl.style.color = '#27ae60';
        if (item.thumbBlobUrl) URL.revokeObjectURL(item.thumbBlobUrl);
      })
      .catch(err => {
        item.statusEl.textContent = 'Failed: ' + err.message;
        item.statusEl.style.color = '#e74c3c';
        throw err;
      });
  }

  // ── Gallery
  function loadGallery() {
    const statusEl = document.getElementById('videos-gallery-status');
    statusEl.textContent = 'Loading videos…';
    ensureReady()
      .then(() => videosDb.collection('videos').orderBy('uploadedAt', 'desc').limit(200).get())
      .then(snapshot => {
        galleryDocs = [];
        snapshot.forEach(doc => galleryDocs.push({ id: doc.id, data: doc.data() }));
        populateAlbumFilter();
        renderGallery(document.getElementById('videos-gallery-filter').value);
        statusEl.textContent = galleryDocs.length + ' video' + (galleryDocs.length !== 1 ? 's' : '');
      })
      .catch(err => { statusEl.textContent = 'Error: ' + err.message; });
  }

  function populateAlbumFilter() {
    const select  = document.getElementById('videos-gallery-filter');
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

  function renderGallery(filterAlbum) {
    const gallery = document.getElementById('videos-gallery');
    const docs    = filterAlbum ? galleryDocs.filter(d => d.data.album === filterAlbum) : galleryDocs;
    if (!docs.length) {
      gallery.innerHTML = '<p style="color:var(--color-gray-500);grid-column:1/-1">No videos yet.</p>';
      return;
    }
    gallery.innerHTML = docs.map(doc => {
      const d   = doc.data;
      const dur = d.duration
        ? '<span style="position:absolute;bottom:.3rem;right:.3rem;background:rgba(0,0,0,.65);' +
          'color:#fff;font-size:.68rem;padding:.1rem .35rem;border-radius:3px">' + esc(fmtDuration(d.duration)) + '</span>'
        : '';
      const thumb = d.thumbUrl
        ? '<img src="' + escAttr(d.thumbUrl) + '" alt="' + escAttr(d.title || d.fileName || '') + '" loading="lazy" style="aspect-ratio:16/9;object-fit:cover">'
        : '<div style="width:100%;aspect-ratio:16/9;background:linear-gradient(135deg,var(--color-primary),var(--color-secondary));' +
          'display:flex;align-items:center;justify-content:center;font-size:2rem">🎬</div>';
      return '<div class="photo-gallery-card">' +
        '<div style="position:relative">' +
          thumb +
          '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">' +
            '<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.8);' +
            'display:flex;align-items:center;justify-content:center;font-size:.85rem;padding-left:3px">▶</div>' +
          '</div>' +
          dur +
        '</div>' +
        '<div class="pgc-body">' +
          '<div class="pgc-album">' + esc(d.album || 'general') + '</div>' +
          (d.location ? '<div class="pgc-location">📍 ' + esc(d.location) + '</div>' : '') +
          '<div class="pgc-caption">' + esc(d.title || d.fileName || '') + '</div>' +
        '</div>' +
        '<div class="pgc-actions">' +
          '<a href="' + escAttr(d.url || '#') + '" target="_blank" rel="noopener noreferrer">🔗 View</a>' +
          '<button class="pgc-del-btn" ' +
            'data-docid="' + escAttr(doc.id) + '" ' +
            'data-sp="'    + escAttr(d.storagePath      || '') + '" ' +
            'data-tsp="'   + escAttr(d.thumbStoragePath || '') + '">🗑 Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');

    gallery.querySelectorAll('.pgc-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteVideo(btn.dataset.docid, btn.dataset.sp, btn.dataset.tsp));
    });
  }

  function deleteVideo(docId, storagePath, thumbStoragePath) {
    if (!confirm('Delete this video? This cannot be undone.')) return;
    ensureReady()
      .then(() => {
        const ops = [videosDb.collection('videos').doc(docId).delete()];
        if (storagePath)      ops.push(videosStorage.ref(storagePath).delete().catch(e => console.warn('Storage delete:', e)));
        if (thumbStoragePath) ops.push(videosStorage.ref(thumbStoragePath).delete().catch(e => console.warn('Thumb delete:', e)));
        return Promise.all(ops);
      })
      .then(() => {
        galleryDocs = galleryDocs.filter(d => d.id !== docId);
        populateAlbumFilter();
        renderGallery(document.getElementById('videos-gallery-filter').value);
        document.getElementById('videos-gallery-status').textContent =
          galleryDocs.length + ' video' + (galleryDocs.length !== 1 ? 's' : '');
        showToast('Video deleted', 'success');
      })
      .catch(err => showToast('Delete failed: ' + err.message, 'error'));
  }

  // ── Init (lazy — runs on first visit to Videos section)
  function init() {
    if (initialized) return;
    initialized = true;
    setupDropZone();
    document.getElementById('videos-upload-btn').addEventListener('click', uploadAll);
    document.getElementById('videos-clear-btn').addEventListener('click', () => {
      queue.forEach(q => { if (q.thumbBlobUrl) URL.revokeObjectURL(q.thumbBlobUrl); });
      queue = [];
      document.getElementById('videos-queue').innerHTML = '';
      syncUploadBtn();
    });
    document.getElementById('videos-gallery-filter').addEventListener('change', e => renderGallery(e.target.value));
    loadGallery();
  }

  // Intercept showSection to trigger Videos init
  const _origShowSection = window.showSection;
  window.showSection = function (name, linkEl) {
    _origShowSection(name, linkEl);
    if (name === 'videos') init();
  };
})();
