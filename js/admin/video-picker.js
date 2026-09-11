// js/admin/video-picker.js — reusable video-insert modal, same pattern as
// js/admin/photo-picker.js.

// ── Video Picker (insert from Firebase Storage) ───────────────
(function () {
  let _allVideos  = [];  // { id, url, thumbUrl, title, album, location, duration }
  let _selectedId = null;
  let _loaded     = false;

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str == null ? '' : str);
    return d.innerHTML;
  }

  function fmtDuration(secs) {
    if (!secs || isNaN(secs)) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  async function loadVideos() {
    if (_loaded) return;
    const db = _getAdminDb();
    if (!db) return;
    const snap = await db.collection('videos').orderBy('uploadedAt', 'desc').limit(200).get();
    _allVideos = [];
    snap.forEach(doc => {
      const d = doc.data();
      _allVideos.push({
        id:       doc.id,
        url:      d.url,
        thumbUrl: d.thumbUrl || '',
        title:    d.title || d.fileName || '',
        album:    d.album    || '',
        location: d.location || '',
        duration: d.duration || null
      });
    });
    _loaded = true;
  }

  function renderGrid(videos) {
    const grid    = document.getElementById('vp-grid');
    const loading = document.getElementById('vp-loading');
    const empty   = document.getElementById('vp-empty');
    loading.style.display = 'none';
    empty.style.display   = videos.length === 0 ? '' : 'none';
    grid.innerHTML = '';

    videos.forEach(v => {
      const item = document.createElement('div');
      item.className = 'photo-picker-item' + (_selectedId === v.id ? ' selected' : '');
      item.dataset.id = v.id;

      const dur = v.duration
        ? '<div style="position:absolute;bottom:.3rem;right:.3rem;background:rgba(0,0,0,.65);' +
          'color:#fff;font-size:.62rem;padding:.1rem .3rem;border-radius:3px">' +
          esc(fmtDuration(v.duration)) + '</div>'
        : '';

      const thumb = v.thumbUrl
        ? '<img src="' + v.thumbUrl.replace(/"/g, '&quot;') + '" alt="' + esc(v.title) +
          '" loading="lazy" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block" />'
        : '<div style="width:100%;aspect-ratio:16/9;background:linear-gradient(135deg,var(--color-primary),' +
          'var(--color-secondary));display:flex;align-items:center;justify-content:center;font-size:1.5rem">🎬</div>';

      item.innerHTML =
        '<div style="position:relative">' +
          thumb +
          '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">' +
            '<div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.75);' +
            'display:flex;align-items:center;justify-content:center;font-size:.7rem;padding-left:2px">▶</div>' +
          '</div>' +
          dur +
        '</div>' +
        '<div class="pp-check">✓</div>' +
        (v.title
          ? '<div style="font-size:.7rem;padding:.25rem .4rem;white-space:nowrap;overflow:hidden;' +
            'text-overflow:ellipsis;background:rgba(0,0,0,.55);color:#fff">' + esc(v.title) + '</div>'
          : '');

      item.addEventListener('click', () => {
        grid.querySelectorAll('.photo-picker-item.selected').forEach(el => el.classList.remove('selected'));
        if (_selectedId === v.id) {
          _selectedId = null;
        } else {
          _selectedId = v.id;
          item.classList.add('selected');
        }
        updateFooter();
      });

      grid.appendChild(item);
    });
  }

  function updateFooter() {
    document.getElementById('vp-sel-count').textContent = _selectedId ? '1 selected' : 'None selected';
    document.getElementById('vp-insert-btn').disabled = !_selectedId;
  }

  window.vpFilter = function () {
    const q = (document.getElementById('vp-search').value || '').toLowerCase();
    const filtered = q
      ? _allVideos.filter(v => (v.title + ' ' + v.album + ' ' + v.location).toLowerCase().includes(q))
      : _allVideos;
    renderGrid(filtered);
  };

  window.openVideoInsert = async function () {
    _selectedId = null;
    const overlay = document.getElementById('video-insert-overlay');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('vp-search').value = '';
    document.getElementById('vp-grid').innerHTML = '';
    document.getElementById('vp-loading').style.display = '';
    document.getElementById('vp-empty').style.display   = 'none';
    document.getElementById('vp-caption-input').value   = '';
    updateFooter();
    await loadVideos();
    renderGrid(_allVideos);
  };

  window.closeVideoInsert = function () {
    document.getElementById('video-insert-overlay').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.doInsertVideo = function () {
    if (!_selectedId) return;
    const video = _allVideos.find(v => v.id === _selectedId);
    if (!video) { closeVideoInsert(); return; }

    const caption = document.getElementById('vp-caption-input').value.trim();
    const safeUrl = video.url.replace(/"/g, '%22');
    let html = '\n<video src="' + safeUrl + '" controls playsinline style="width:100%;border-radius:8px;margin:.75rem 0"></video>\n';

    if (caption) {
      const safeCaption = caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += '<p><em>' + safeCaption + '</em></p>\n';
    }

    const taId = window._activeBlogContent || 'blog-content';
    const ta   = document.getElementById(taId);
    if (!ta) { closeVideoInsert(); return; }

    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    ta.value = ta.value.slice(0, start) + html + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + html.length;
    ta.focus();
    closeVideoInsert();
    if (typeof TomikaBikes !== 'undefined') TomikaBikes.showToast('Video inserted ✅', 'success');
  };

  // Close on backdrop click
  document.getElementById('video-insert-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('video-insert-overlay')) closeVideoInsert();
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('video-insert-overlay').classList.contains('open')) closeVideoInsert();
  });
})();
