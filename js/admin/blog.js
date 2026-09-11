// js/admin/blog.js — Blog Admin section of admin.html: blog_posts CRUD
// (EN/JA/NO tabs, save/delete/preview) plus the rich-text formatting
// toolbar helper (blogFmt) used by the blog editor.

// ── Blog Admin ────────────────────────────────────────────────
let adminBlogLoaded = false;
let adminBlogPosts = []; // { id, data }
let adminBlogDb = null;
const BLOG_COLLECTION = 'blog_posts';

async function adminBlogEnsureDb() {
  if (adminBlogDb) return;
  await window.TomikaBikes.ensureFirebaseAuth();
  adminBlogDb = _getAdminDb();
}

async function adminBlogLoadPosts() {
  adminBlogLoaded = true;
  const listEl = document.getElementById('blog-post-list');
  listEl.innerHTML = '<p style="color:var(--color-gray-500);padding:.5rem 0">Loading…</p>';
  try {
    await adminBlogEnsureDb();
    const snap = await adminBlogDb.collection(BLOG_COLLECTION).orderBy('date', 'desc').get();
    adminBlogPosts = [];
    snap.forEach(doc => adminBlogPosts.push({ id: doc.id, data: doc.data() }));
  } catch (e) {
    adminBlogPosts = [];
  }
  adminBlogRenderList();
}

function adminBlogRenderList() {
  const listEl = document.getElementById('blog-post-list');
  if (!adminBlogPosts.length) {
    listEl.innerHTML = '<p style="color:var(--color-gray-500)">No posts yet. Click <strong>New Post</strong> to create one.</p>';
    return;
  }
  listEl.innerHTML = adminBlogPosts.map(p => {
    const d = p.data;
    const badgeCls = d.status === 'published' ? 'status-published' : 'status-draft';
    const badgeTxt = d.status === 'published' ? 'Published' : 'Draft';
    return '<div class="blog-post-list-item" onclick="adminBlogEditPost(\'' + p.id + '\')">' +
      (d.coverImage
        ? '<div class="blog-post-list-emoji" style="background-size:cover;background-position:center;background-image:url(' + d.coverImage.replace(/"/g,'&quot;') + ');border-radius:6px"></div>'
        : '<div class="blog-post-list-emoji">✍️</div>') +
      '<div class="blog-post-list-body">' +
        '<div class="blog-post-list-title">' + escHtml(d.title || 'Untitled') + '</div>' +
        '<div class="blog-post-list-meta">' + escHtml(d.author || '') + ' · ' + (d.date || '') + ' · ' + escHtml(d.category || '') + '</div>' +
      '</div>' +
      '<div class="blog-post-list-actions">' +
        '<span class="status-badge ' + badgeCls + '">' + badgeTxt + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function adminBlogShowList() {
  document.getElementById('blog-list-view').style.display = '';
  document.getElementById('blog-editor-view').style.display = 'none';
}

function adminBlogSwitchLang(lang) {
  ['en', 'ja', 'no'].forEach(function (l) {
    document.getElementById('blog-lang-tab-' + l).classList.toggle('active', l === lang);
    document.getElementById('blog-title-pane-' + l).style.display = l === lang ? '' : 'none';
    document.getElementById('blog-excerpt-content-pane-' + l).style.display = l === lang ? '' : 'none';
  });
  window._activeBlogContent = lang === 'en' ? 'blog-content' : 'blog-content-' + lang;
}

function adminBlogNewPost() {
  document.getElementById('blog-list-view').style.display = 'none';
  document.getElementById('blog-editor-view').style.display = '';
  document.getElementById('blog-editor-heading').textContent = 'New Post';
  document.getElementById('blog-post-id').value = '';
  document.getElementById('blog-title').value = '';
  document.getElementById('blog-title-ja').value = '';
  document.getElementById('blog-title-no').value = '';
  document.getElementById('blog-author').value = 'Mika & Tom';
  document.getElementById('blog-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('blog-trip-date-from').value = '';
  document.getElementById('blog-trip-date-to').value = '';
  document.getElementById('blog-category').value = 'japan';
  document.getElementById('blog-status').value = 'draft';
  document.getElementById('blog-cover-image').value = '';
  const prevEl = document.getElementById('cover-img-preview');
  if (prevEl) prevEl.innerHTML = '<span class="cover-img-placeholder">📷<br>No cover selected</span>';
  const clearBtn = document.getElementById('cover-img-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  document.getElementById('blog-tags').value = '';
  document.getElementById('blog-excerpt').value = '';
  document.getElementById('blog-excerpt-ja').value = '';
  document.getElementById('blog-excerpt-no').value = '';
  document.getElementById('blog-content').value = '';
  document.getElementById('blog-content-ja').value = '';
  document.getElementById('blog-content-no').value = '';
  document.getElementById('blog-delete-btn').style.display = 'none';
  document.getElementById('blog-editor-save-status').textContent = '';
  adminBlogSwitchLang('en');
}

function adminBlogEditPost(id) {
  const post = adminBlogPosts.find(p => p.id === id);
  if (!post) return;
  const d = post.data;
  document.getElementById('blog-list-view').style.display = 'none';
  document.getElementById('blog-editor-view').style.display = '';
  document.getElementById('blog-editor-heading').textContent = 'Edit Post';
  document.getElementById('blog-post-id').value = id;
  document.getElementById('blog-title').value = d.title || '';
  document.getElementById('blog-author').value = d.author || 'Mika & Tom';
  document.getElementById('blog-date').value = d.date || '';
  document.getElementById('blog-trip-date-from').value = d.tripDateFrom || '';
  document.getElementById('blog-trip-date-to').value = d.tripDateTo || '';
  document.getElementById('blog-category').value = d.category || 'japan';
  document.getElementById('blog-status').value = d.status || 'draft';
  const coverUrl = d.coverImage || '';
  document.getElementById('blog-cover-image').value = coverUrl;
  const prevEl2 = document.getElementById('cover-img-preview');
  if (prevEl2) {
    if (coverUrl) {
      prevEl2.innerHTML = '<img src="' + coverUrl.replace(/"/g, '&quot;') + '" alt="cover" />';
      document.getElementById('cover-img-clear').style.display = '';
    } else {
      prevEl2.innerHTML = '<span class="cover-img-placeholder">📷<br>No cover selected</span>';
      document.getElementById('cover-img-clear').style.display = 'none';
    }
  }
  document.getElementById('blog-tags').value = d.tags || '';
  document.getElementById('blog-title-ja').value = d.title_ja || '';
  document.getElementById('blog-title-no').value = d.title_no || '';
  document.getElementById('blog-excerpt').value = d.excerpt || '';
  document.getElementById('blog-excerpt-ja').value = d.excerpt_ja || '';
  document.getElementById('blog-excerpt-no').value = d.excerpt_no || '';
  document.getElementById('blog-content').value = d.content || '';
  document.getElementById('blog-content-ja').value = d.content_ja || '';
  document.getElementById('blog-content-no').value = d.content_no || '';
  document.getElementById('blog-delete-btn').style.display = id ? '' : 'none';
  document.getElementById('blog-editor-save-status').textContent = '';
  adminBlogSwitchLang('en');
}

async function adminBlogSave(asDraft) {
  const id = document.getElementById('blog-post-id').value;
  const statusEl = document.getElementById('blog-editor-save-status');
  if (asDraft) document.getElementById('blog-status').value = 'draft';
  const data = {
    title: document.getElementById('blog-title').value.trim(),
    title_ja: document.getElementById('blog-title-ja').value.trim(),
    title_no: document.getElementById('blog-title-no').value.trim(),
    author: document.getElementById('blog-author').value.trim(),
    date: document.getElementById('blog-date').value,
    tripDateFrom: document.getElementById('blog-trip-date-from').value || null,
    tripDateTo: document.getElementById('blog-trip-date-to').value || null,
    category: document.getElementById('blog-category').value,
    status: document.getElementById('blog-status').value,
    coverImage: document.getElementById('blog-cover-image').value.trim(),
    tags: document.getElementById('blog-tags').value.trim(),
    excerpt: document.getElementById('blog-excerpt').value.trim(),
    excerpt_ja: document.getElementById('blog-excerpt-ja').value.trim(),
    excerpt_no: document.getElementById('blog-excerpt-no').value.trim(),
    content: document.getElementById('blog-content').value.trim(),
    content_ja: document.getElementById('blog-content-ja').value.trim(),
    content_no: document.getElementById('blog-content-no').value.trim(),
    updatedAt: new Date().toISOString()
  };
  if (!data.title) { TomikaBikes.showToast('Please enter a post title', 'error'); return; }
  statusEl.textContent = 'Saving…';
  try {
    await adminBlogEnsureDb();
    if (id) {
      await adminBlogDb.collection(BLOG_COLLECTION).doc(id).set(data);
      const idx = adminBlogPosts.findIndex(p => p.id === id);
      if (idx >= 0) adminBlogPosts[idx].data = data;
    } else {
      const ref = await adminBlogDb.collection(BLOG_COLLECTION).add(data);
      adminBlogPosts.push({ id: ref.id, data });
      document.getElementById('blog-post-id').value = ref.id;
      document.getElementById('blog-delete-btn').style.display = '';
    }
    adminBlogRenderList();
    statusEl.textContent = '✓ Saved ' + new Date().toLocaleTimeString();
    TomikaBikes.showToast('Post saved!', 'success');
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    TomikaBikes.showToast('Save failed: ' + e.message, 'error');
  }
}

async function adminBlogDelete() {
  const id = document.getElementById('blog-post-id').value;
  if (!id) return;
  if (!confirm('Delete this post? This cannot be undone.')) return;
  try {
    await adminBlogEnsureDb();
    await adminBlogDb.collection(BLOG_COLLECTION).doc(id).delete();
    adminBlogPosts = adminBlogPosts.filter(p => p.id !== id);
    adminBlogRenderList();
    adminBlogShowList();
    TomikaBikes.showToast('Post deleted', 'success');
  } catch (e) {
    TomikaBikes.showToast('Delete failed: ' + e.message, 'error');
  }
}

async function adminBlogPreview() {
  const title = document.getElementById('blog-title').value.trim();
  if (!title) { TomikaBikes.showToast('Please enter a post title before previewing', 'error'); return; }
  const previewWindow = window.open('', '_blank');
  await adminBlogSave(false);
  const id = document.getElementById('blog-post-id').value;
  if (!id) {
    if (previewWindow) previewWindow.close();
    TomikaBikes.showToast('Save the post first before previewing', 'info');
    return;
  }
  const previewUrl = 'post?id=' + encodeURIComponent(id);
  if (previewWindow) {
    previewWindow.location.href = previewUrl;
    return;
  }
  if (!window.open(previewUrl, '_blank')) {
    TomikaBikes.showToast('Popup blocked. Please allow popups to preview.', 'info');
  }
}

// Set default date on new post on page load
document.getElementById('blog-date').value = new Date().toISOString().slice(0, 10);

// ── Blog content formatting toolbar ────────────────────────────────────────
function blogFmt(tag) {
  var ta = document.getElementById(window._activeBlogContent || 'blog-content');
  ta.focus();
  var start = ta.selectionStart;
  var end   = ta.selectionEnd;
  var sel   = ta.value.substring(start, end);
  var before = ta.value.substring(0, start);
  var after  = ta.value.substring(end);
  var insert = '';
  var cursorOffset = 0;

  if (tag === 'hr') {
    insert = '\n<hr>\n';
    cursorOffset = insert.length;
  } else if (tag === 'br') {
    insert = '<br>\n';
    cursorOffset = insert.length;
  } else if (tag === 'a') {
    var url = prompt('Enter URL:', 'https://');
    if (!url) { ta.focus(); return; }
    var linkText = sel || 'Link text';
    insert = '<a href="' + url + '">' + linkText + '</a>';
    cursorOffset = insert.length;
  } else if (tag === 'ul') {
    var items = sel ? sel.split('\n') : ['Item 1', 'Item 2'];
    insert = '<ul>\n' + items.map(function(l){ return '  <li>' + (l.trim() || 'Item') + '</li>'; }).join('\n') + '\n</ul>';
    cursorOffset = insert.length;
  } else if (tag === 'ol') {
    items = sel ? sel.split('\n') : ['Item 1', 'Item 2'];
    insert = '<ol>\n' + items.map(function(l){ return '  <li>' + (l.trim() || 'Item') + '</li>'; }).join('\n') + '\n</ol>';
    cursorOffset = insert.length;
  } else if (tag === 'pre') {
    var code = sel || 'code here';
    insert = '<pre><code>' + code + '</code></pre>';
    cursorOffset = sel ? insert.length : '<pre><code>'.length;
  } else {
    var open  = '<' + tag + '>';
    var close = '</' + tag + '>';
    var defaults = { p: 'Paragraph text.', h2: 'Heading', h3: 'Sub-heading' };
    var inner = sel || defaults[tag] || 'text';
    insert = open + inner + close;
    cursorOffset = sel ? insert.length : open.length;
  }

  ta.value = before + insert + after;
  ta.selectionStart = ta.selectionEnd = start + cursorOffset;
  ta.focus();
}
