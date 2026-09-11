// js/admin/photo-picker.js — reusable photo-insert modal shared by the
// blog editor and email composer sections of admin.html.

// ── Photo Picker ──────────────────────────────────────────────
(function () {
  let _allPhotos = [];  // { id, url, thumbUrl, caption, album, location }
  let _selected  = new Set();
  let _loaded    = false;

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str == null ? '' : str);
    return d.innerHTML;
  }

  async function loadPhotos() {
    if (_loaded) return;
    const db = _getAdminDb();
    if (!db) return;
    const snap = await db.collection('photos').orderBy('uploadedAt', 'desc').limit(300).get();
    _allPhotos = [];
    snap.forEach(doc => {
      const d = doc.data();
      _allPhotos.push({ id: doc.id, url: d.url, thumbUrl: d.thumbUrl || d.url, caption: d.caption || '', album: d.album || '', location: d.location || '' });
    });
    _loaded = true;
  }

  function renderGrid(photos) {
    const grid    = document.getElementById('pp-grid');
    const loading = document.getElementById('pp-loading');
    const empty   = document.getElementById('pp-empty');
    loading.style.display = 'none';
    empty.style.display   = photos.length === 0 ? '' : 'none';
    grid.innerHTML = '';
    photos.forEach(p => {
      const item = document.createElement('div');
      item.className = 'photo-picker-item' + (_selected.has(p.id) ? ' selected' : '');
      item.dataset.id = p.id;
      item.innerHTML =
        '<img src="' + p.thumbUrl.replace(/"/g, '&quot;') + '" alt="' + esc(p.caption) + '" loading="lazy" />' +
        '<div class="pp-check">✓</div>' +
        (p.caption ? '<div class="pp-caption">' + esc(p.caption) + '</div>' : '');
      item.addEventListener('click', () => {
        if (_selected.has(p.id)) { _selected.delete(p.id); item.classList.remove('selected'); }
        else                     { _selected.add(p.id);    item.classList.add('selected'); }
        updateCount();
      });
      grid.appendChild(item);
    });
  }

  function updateCount() {
    const n = _selected.size;
    document.getElementById('pp-sel-count').textContent = n === 0 ? 'None selected' : n + ' selected';
    document.getElementById('pp-insert-btn').disabled = n === 0;
  }

  window.ppFilter = function () {
    const q = (document.getElementById('pp-search').value || '').toLowerCase();
    const filtered = q
      ? _allPhotos.filter(p => (p.caption + ' ' + p.album + ' ' + p.location).toLowerCase().includes(q))
      : _allPhotos;
    renderGrid(filtered);
  };

  let _coverMode = false;
  let _bikeTarget = null; // 'mika' | 'tom' | null

  window.openPhotoPicker = async function (mode) {
    _coverMode  = (mode === 'cover');
    _bikeTarget = (mode === 'bikeMika') ? 'mika' : (mode === 'bikeTom') ? 'tom' : null;
    const overlay = document.getElementById('photo-picker-overlay');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    _selected.clear();
    updateCount();
    document.getElementById('pp-search').value = '';
    document.getElementById('pp-grid').innerHTML = '';
    document.getElementById('pp-loading').style.display = '';
    document.getElementById('pp-empty').style.display   = 'none';
    // Update modal UI for cover / bike / content mode
    const isSingleSelect = _coverMode || _bikeTarget;
    document.querySelector('#photo-picker-overlay .photo-picker-header h3').textContent =
      _coverMode  ? '🖼 Choose Cover Image' :
      _bikeTarget ? '🚲 Choose Bike Photo'  : '📷 Insert Photo';
    document.getElementById('pp-insert-btn').textContent = isSingleSelect ? 'Set Photo' : 'Insert';
    document.getElementById('pp-style').closest('.pp-insert-style').style.display = isSingleSelect ? 'none' : '';
    await loadPhotos();
    renderGrid(_allPhotos);
  };

  window.closePhotoPicker = function () {
    document.getElementById('photo-picker-overlay').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.clearCoverImage = function () {
    document.getElementById('blog-cover-image').value = '';
    const preview = document.getElementById('cover-img-preview');
    preview.innerHTML = '<span class="cover-img-placeholder">📷<br>No cover selected</span>';
    document.getElementById('cover-img-clear').style.display = 'none';
  };

  window.clearBikePhoto = function (target) {
    const inp  = document.getElementById('bike-photo-' + target);
    if (inp) inp.value = '';
    const prev = document.getElementById('bike-photo-preview-' + target);
    if (prev) prev.innerHTML = '<span style="font-size:1.5rem">🚲</span>';
    const clr  = document.getElementById('bike-photo-clear-' + target);
    if (clr) clr.style.display = 'none';
  };

  window.ppInsert = function () {
    const photos  = _allPhotos.filter(p => _selected.has(p.id));
    if (!photos.length) return;

    if (_coverMode) {
      // Set the first selected photo as the cover image
      const photo = photos[0];
      document.getElementById('blog-cover-image').value = photo.url;
      const preview = document.getElementById('cover-img-preview');
      preview.innerHTML = '<img src="' + photo.url.replace(/"/g, '&quot;') + '" alt="cover" />';
      document.getElementById('cover-img-clear').style.display = '';
      closePhotoPicker();
      TomikaBikes.showToast('Cover image set ✅', 'success');
      return;
    }

    if (_bikeTarget) {
      // Set the first selected photo as the bike photo
      const photo = photos[0];
      const inp   = document.getElementById('bike-photo-' + _bikeTarget);
      if (inp) inp.value = photo.url;
      const prev  = document.getElementById('bike-photo-preview-' + _bikeTarget);
      if (prev) {
        prev.innerHTML = '';
        const img = document.createElement('img');
        img.src = photo.url;
        img.alt = (_bikeTarget === 'mika' ? "Mika's bike" : "Tom's bike");
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
        prev.appendChild(img);
      }
      const clr   = document.getElementById('bike-photo-clear-' + _bikeTarget);
      if (clr) clr.style.display = '';
      closePhotoPicker();
      TomikaBikes.showToast('Bike photo set ✅', 'success');
      return;
    }

    const style = document.getElementById('pp-style').value;
    let html;
    if (style === 'grid') {
      const imgs = photos.map(p =>
        '<img src="' + p.url.replace(/"/g, '&quot;') + '" alt="' + esc(p.caption) + '" />'
      ).join('\n    ');
      html = '\n<div class="photo-grid">\n    ' + imgs + '\n</div>\n';
    } else {
      html = photos.map(p =>
        '\n<img src="' + p.url.replace(/"/g, '&quot;') + '" alt="' + esc(p.caption) + '" style="max-width:100%;border-radius:8px;margin:.5rem 0" />'  +
        (p.caption ? '\n<p><em>' + esc(p.caption) + '</em></p>' : '')
      ).join('\n');
    }

    // Insert at cursor position in the target textarea (blog-content by default, or email-body)
    const ta    = window._ppTargetTextarea ? document.getElementById(window._ppTargetTextarea) : document.getElementById(window._activeBlogContent || 'blog-content');
    if (!ta) { closePhotoPicker(); window._ppTargetTextarea = null; return; }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    ta.value    = ta.value.slice(0, start) + html + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + html.length;
    ta.focus();
    closePhotoPicker();
    window._ppTargetTextarea = null;
    TomikaBikes.showToast('Photo' + (photos.length > 1 ? 's' : '') + ' inserted ✅', 'success');
  };

  // Close on backdrop click
  document.getElementById('photo-picker-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('photo-picker-overlay')) closePhotoPicker();
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('photo-picker-overlay').classList.contains('open')) closePhotoPicker();
  });
})();
