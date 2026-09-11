// js/admin/dashboard.js — Dashboard section of admin.html: aggregate
// counts and the recent-posts table.

// ── Dashboard counts ──────────────────────────────────────────
let _dashCountsLoaded = false;
function adminDashLoadCounts() {
  if (_dashCountsLoaded) return;
  _dashCountsLoaded = true;
  if (typeof firebase === 'undefined' || typeof FIREBASE_CONFIG === 'undefined'
      || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') return;
  try {
    const db = _getAdminDb();
    // Aggregate count() queries are computed server-side and don't transfer any
    // document data, so they stay fast (and accurate) no matter how large a
    // collection grows — unlike fetching up to N docs just to read .size.
    const countInto = (collection, elId) => db.collection(collection).count().get()
      .then(s => { const el = document.getElementById(elId); if (el) el.textContent = s.data().count; })
      .catch(() => {
        // Fallback for older SDKs/environments without count() support
        return db.collection(collection).get()
          .then(s => { const el = document.getElementById(elId); if (el) el.textContent = s.size; })
          .catch(() => {});
      });
    countInto('photos', 'dash-photo-count');
    countInto('routes', 'dash-route-count');
    countInto('points', 'dash-point-count');
    countInto('subscribers', 'dash-subscriber-count');
    // Blog Posts stat card uses the real collection count, independent of the
    // 20-row cap used just below for populating the recent-posts table.
    db.collection('blog_posts').count().get()
      .then(s => {
        document.querySelectorAll('.admin-stat-card').forEach(card => {
          if (card.querySelector('.stat-label')?.textContent === 'Blog Posts') {
            card.querySelector('.stat-value').textContent = s.data().count;
          }
        });
      })
      .catch(() => {});
    // Populate the dashboard posts table (most recent 20 — the table itself is
    // just a preview, not a total; the stat card above shows the real count)
    db.collection('blog_posts').orderBy('date', 'desc').limit(20).get()
      .then(snap => {
        const tbody = document.getElementById('dash-posts-tbody');
        if (!tbody) return;
        if (snap.empty) {
          tbody.innerHTML = '<tr><td colspan="5" style="color:var(--color-gray-500);padding:.75rem 1rem">No posts yet.</td></tr>';
          return;
        }
        const rows = [];
        snap.forEach(doc => {
          const d = doc.data();
          const badgeCls = d.status === 'published' ? 'status-published' : 'status-draft';
          const badgeTxt = d.status === 'published' ? 'Published' : 'Draft';
          rows.push('<tr>' +
            '<td>' + escHtml(d.title || 'Untitled') + '</td>' +
            '<td>' + escHtml(d.author || '') + '</td>' +
            '<td>' + escHtml(d.category || '') + '</td>' +
            '<td><span class="status-badge ' + badgeCls + '">' + badgeTxt + '</span></td>' +
            '<td><button class="btn" style="padding:.3rem .75rem;font-size:.75rem" onclick="showSection(\'posts\',document.querySelector(\'.admin-nav a[onclick*=posts]\'));adminBlogLoadPosts()">Edit</button></td>' +
          '</tr>');
        });
        tbody.innerHTML = rows.join('');
      })
      .catch(() => {});
  } catch (e) { /* Firebase not ready */ }
}

// Load counts when admin dashboard is first shown
document.addEventListener('DOMContentLoaded', () => {
  adminDashLoadCounts();
  // Also load blog posts list lazily
});
