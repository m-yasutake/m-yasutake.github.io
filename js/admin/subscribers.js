// js/admin/subscribers.js — Subscribers + Email Composer section of
// admin.html: subscribers collection CRUD and the HTML email builder.

// ── Subscribers Admin ────────────────────────────────────────
let _adminSubsLoaded = false;
let _adminSubsDb = null;
let _adminSubsRows = [];   // cached subscriber rows

async function _adminSubsEnsureDb() {
  if (_adminSubsDb) return _adminSubsDb;
  await window.TomikaBikes.ensureFirebaseAuth();
  const src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js';
  if (![...document.scripts].some(s => (s.getAttribute('src') || '') === src)) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  _adminSubsDb = _getAdminDb();
  return _adminSubsDb;
}

async function adminSubscribersLoad() {
  const tbody   = document.getElementById('sub-admin-tbody');
  const countEl = document.getElementById('sub-admin-count');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" style="padding:2rem;text-align:center;color:var(--color-gray-500)">Loading…</td></tr>';
  try {
    const db   = await _adminSubsEnsureDb();
    // Try ordered query first; fall back to unordered if index is missing
    let snap;
    try {
      snap = await db.collection('subscribers').orderBy('subscribedAt', 'desc').get();
    } catch (e) {
      snap = await db.collection('subscribers').get();
    }
    const rows = [];
    snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
    // Sort client-side in case we fell back to unordered query
    function toSortKey(v) {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (v.seconds) return new Date(v.seconds * 1000).toISOString();
      return String(v);
    }
    rows.sort((a, b) => toSortKey(b.subscribedAt).localeCompare(toSortKey(a.subscribedAt)));

    // Cache rows for email composer
    _adminSubsRows = rows;
    emailUpdateRecipientSummary();

    const dashEl = document.getElementById('dash-subscriber-count');
    if (dashEl) dashEl.textContent = rows.length;
    if (countEl) countEl.textContent = rows.length + ' subscriber' + (rows.length !== 1 ? 's' : '');

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:2rem;text-align:center;color:var(--color-gray-500)">No subscribers yet.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const date  = r.subscribedAt ? r.subscribedAt.slice(0, 10) : '—';
      const blog  = r.preferences && r.preferences.blog   ? '✅' : '—';
      const photos = r.preferences && r.preferences.photos ? '✅' : '—';
      return '<tr>' +
        '<td style="padding:.65rem 1rem;font-size:.875rem;border-bottom:1px solid var(--color-gray-100)">' + escHtml(r.email || '—') + '</td>' +
        '<td style="padding:.65rem 1rem;text-align:center;font-size:1rem;border-bottom:1px solid var(--color-gray-100)">' + blog + '</td>' +
        '<td style="padding:.65rem 1rem;text-align:center;font-size:1rem;border-bottom:1px solid var(--color-gray-100)">' + photos + '</td>' +
        '<td style="padding:.65rem 1rem;font-size:.8rem;color:var(--color-gray-600);border-bottom:1px solid var(--color-gray-100)">' + date + '</td>' +
        '<td style="padding:.65rem 1rem;text-align:center;border-bottom:1px solid var(--color-gray-100)">' +
          '<button onclick="adminSubscriberDelete(\'' + r.id + '\')" style="background:#fee2e2;color:#dc2626;border:1px solid #fecaca;border-radius:var(--radius-sm);padding:.25rem .65rem;font-size:.78rem;cursor:pointer">Remove</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:2rem;text-align:center;color:#dc2626">Error loading subscribers: ' + escHtml(e.message) + '</td></tr>';
    if (countEl) countEl.textContent = 'Error';
  }
}

async function adminSubscriberDelete(docId) {
  if (!confirm('Remove this subscriber? This cannot be undone.')) return;
  try {
    const db = await _adminSubsEnsureDb();
    await db.collection('subscribers').doc(docId).delete();
    TomikaBikes.showToast('Subscriber removed', 'success');
    adminSubscribersLoad();
  } catch (e) {
    TomikaBikes.showToast('Failed to remove subscriber: ' + e.message, 'error');
  }
}

// ── Email Composer ────────────────────────────────────────────
let _emailAudience = 'all';
let _epActiveTab   = 'preview';

function emailSetAudience(audience, btn) {
  _emailAudience = audience;
  document.querySelectorAll('.email-audience-pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  emailUpdateRecipientSummary();
}

function emailGetRecipients() {
  if (!_adminSubsRows.length) return [];
  if (_emailAudience === 'blog') {
    return _adminSubsRows.filter(r => r.preferences && r.preferences.blog).map(r => r.email).filter(Boolean);
  }
  if (_emailAudience === 'photos') {
    return _adminSubsRows.filter(r => r.preferences && r.preferences.photos).map(r => r.email).filter(Boolean);
  }
  return _adminSubsRows.map(r => r.email).filter(Boolean);
}

function emailUpdateRecipientSummary() {
  const el = document.getElementById('email-recipient-summary');
  if (!el) return;
  const recipients = emailGetRecipients();
  if (!_adminSubsRows.length) {
    el.textContent = 'No subscriber data loaded yet — click Refresh above to load subscribers.';
    return;
  }
  const total = _adminSubsRows.length;
  const label = _emailAudience === 'blog' ? 'blog' : _emailAudience === 'photos' ? 'photo' : 'all';
  el.textContent = recipients.length + ' recipient' + (recipients.length !== 1 ? 's' : '') +
    ' (' + label + ' subscribers out of ' + total + ' total)';
}

function emailFmt(tag) {
  var ta = document.getElementById('email-body');
  ta.focus();
  var start = ta.selectionStart;
  var end   = ta.selectionEnd;
  var sel   = ta.value.substring(start, end);
  var before = ta.value.substring(0, start);
  var after  = ta.value.substring(end);
  var insert = '';
  var cursorOffset = 0;

  if (tag === 'hr') {
    insert = '\n<hr style="border:none;border-top:1px solid #e5e1d8;margin:1.5rem 0">\n';
    cursorOffset = insert.length;
  } else if (tag === 'br') {
    insert = '<br>\n';
    cursorOffset = insert.length;
  } else if (tag === 'a') {
    var url = prompt('Enter URL:', 'https://');
    if (!url) { ta.focus(); return; }
    // Only allow http/https URLs to prevent javascript: XSS
    if (!/^https?:\/\//i.test(url.trim())) { TomikaBikes.showToast('Only http:// and https:// URLs are allowed', 'error'); ta.focus(); return; }
    var linkText = sel || 'Link text';
    insert = '<a href="' + url.replace(/"/g, '&quot;') + '" style="color:#5B8C6B">' + linkText + '</a>';
    cursorOffset = insert.length;
  } else if (tag === 'ul') {
    var ulItems = sel ? sel.split('\n') : ['Item 1', 'Item 2'];
    insert = '<ul style="padding-left:1.25rem;margin:.5rem 0">\n' +
      ulItems.map(function(l){ return '  <li style="margin-bottom:.35rem">' + (l.trim() || 'Item') + '</li>'; }).join('\n') +
      '\n</ul>';
    cursorOffset = insert.length;
  } else if (tag === 'ol') {
    var olItems = sel ? sel.split('\n') : ['Item 1', 'Item 2'];
    insert = '<ol style="padding-left:1.25rem;margin:.5rem 0">\n' +
      olItems.map(function(l){ return '  <li style="margin-bottom:.35rem">' + (l.trim() || 'Item') + '</li>'; }).join('\n') +
      '\n</ol>';
    cursorOffset = insert.length;
  } else {
    var styleMap = {
      p:      ' style="margin:.75rem 0;line-height:1.7;color:#3D3A32"',
      h2:     ' style="font-family:Georgia,serif;font-size:1.5rem;color:#2F4F3A;margin:1.5rem 0 .75rem"',
      h3:     ' style="font-family:Georgia,serif;font-size:1.2rem;color:#2F4F3A;margin:1.25rem 0 .5rem"',
      strong: '', em: '', u: ''
    };
    var defaults = { p: 'Paragraph text.', h2: 'Heading', h3: 'Sub-heading', strong: 'bold text', em: 'italic text', u: 'underlined text' };
    var s    = styleMap[tag] || '';
    var open  = '<' + tag + s + '>';
    var close = '</' + tag + '>';
    var inner = sel || defaults[tag] || 'text';
    insert = open + inner + close;
    cursorOffset = sel ? insert.length : open.length;
  }

  ta.value = before + insert + after;
  ta.selectionStart = ta.selectionEnd = start + cursorOffset;
  ta.focus();
}

function openEmailPhotoPicker() {
  window._ppTargetTextarea = 'email-body';
  window.openPhotoPicker();
}

function adminEmailClear() {
  if (!confirm('Clear the email composer? This will erase the subject, preheader and body.')) return;
  document.getElementById('email-subject').value   = '';
  document.getElementById('email-preheader').value = '';
  document.getElementById('email-body').value      = '';
}

function buildEmailHtml(subject, preheader, body) {
  var siteUrl   = 'https://tomika.bike';
  var unsubUrl  = siteUrl + '/unsubscribe.html';
  var year      = new Date().getFullYear();
  var esc       = function(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var preheaderHtml = preheader
    ? '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">' + esc(preheader) + '</div>'
    : '';
  return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="UTF-8"/>\n' +
'<meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n' +
'<title>' + esc(subject) + '</title>\n' +
'</head>\n' +
'<body style="margin:0;padding:0;background:#F0EDE6;font-family:Arial,Helvetica,sans-serif;color:#3D3A32">\n' +
preheaderHtml + '\n' +
'<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0EDE6">\n' +
'<tr><td align="center" style="padding:32px 16px">\n' +
'<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">\n' +
'<!-- Header -->\n' +
'<tr><td style="background:#2F4F3A;border-radius:12px 12px 0 0;padding:28px 36px;text-align:center">\n' +
'  <p style="margin:0;font-size:26px;font-weight:700;color:#FAFAF8;font-family:Arial,Helvetica,sans-serif">🚴 tomika<span style="color:#B87333">.bike</span></p>\n' +
'  <p style="margin:4px 0 0;font-size:12px;color:#ACB9B0;letter-spacing:.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">Travel Newsletter</p>\n' +
'</td></tr>\n' +
'<!-- Subject banner -->\n' +
'<tr><td style="background:#5B8C6B;padding:18px 36px;text-align:center">\n' +
'  <h1 style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#FAFAF8;line-height:1.3">' + esc(subject) + '</h1>\n' +
'</td></tr>\n' +
'<!-- Body -->\n' +
'<tr><td style="background:#FAFAF8;padding:36px;border-left:1px solid #E5E1D8;border-right:1px solid #E5E1D8">\n' +
'  <div style="font-size:15px;line-height:1.7;color:#3D3A32;font-family:Arial,Helvetica,sans-serif">\n' +
    body + '\n' +
'  </div>\n' +
'</td></tr>\n' +
'<!-- Visit button -->\n' +
'<tr><td style="background:#FAFAF8;padding:0 36px 32px;border-left:1px solid #E5E1D8;border-right:1px solid #E5E1D8;text-align:center">\n' +
'  <table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td style="background:#2F4F3A;border-radius:4px">\n' +
'    <a href="' + siteUrl + '" target="_blank" style="display:block;padding:12px 28px;color:#FAFAF8;text-decoration:none;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif">Visit tomika.bike →</a>\n' +
'  </td></tr></table>\n' +
'</td></tr>\n' +
'<!-- Footer -->\n' +
'<tr><td style="background:#E5E1D8;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center">\n' +
'  <p style="margin:0 0 6px;font-size:12px;color:#7A776E;font-family:Arial,Helvetica,sans-serif">You\'re receiving this because you subscribed to updates from <a href="' + siteUrl + '" target="_blank" style="color:#5B8C6B">tomika.bike</a>.</p>\n' +
'  <p style="margin:0;font-size:12px;color:#7A776E;font-family:Arial,Helvetica,sans-serif"><a href="' + unsubUrl + '" target="_blank" style="color:#7A776E">Unsubscribe</a> &nbsp;·&nbsp; &#169; ' + year + ' Tomika Bike</p>\n' +
'</td></tr>\n' +
'</table>\n' +
'</td></tr>\n' +
'</table>\n' +
'</body>\n' +
'</html>';
}

function adminEmailPreview() {
  var subject   = (document.getElementById('email-subject').value   || '').trim();
  var preheader = (document.getElementById('email-preheader').value || '').trim();
  var body      = (document.getElementById('email-body').value      || '').trim();

  if (!subject) { TomikaBikes.showToast('Please enter a subject line', 'error'); return; }
  if (!body)    { TomikaBikes.showToast('Please write some content in the body', 'error'); return; }

  var html       = buildEmailHtml(subject, preheader, body);
  var recipients = emailGetRecipients();

  document.getElementById('email-html-output').value       = html;
  document.getElementById('email-recipients-output').value = recipients.join(', ');
  document.getElementById('email-recipients-count').textContent =
    recipients.length + ' recipient' + (recipients.length !== 1 ? 's' : '');

  // Render preview iframe using srcdoc (no same-origin needed)
  var iframe = document.getElementById('email-preview-iframe');
  iframe.srcdoc = html;

  // Gmail link: subject pre-filled, user pastes HTML body manually
  document.getElementById('ep-gmail-link').href =
    'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent(subject);

  document.getElementById('email-preview-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  emailPreviewSwitchTab('preview');
}

function closeEmailPreview() {
  document.getElementById('email-preview-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function emailPreviewSwitchTab(tab) {
  _epActiveTab = tab;
  document.querySelectorAll('.email-preview-tab').forEach(function(t) {
    t.classList.toggle('active', t.id === 'epTab-' + tab);
  });
  document.querySelectorAll('.email-preview-panel').forEach(function(p) {
    p.classList.toggle('active', p.id === 'epPanel-' + tab);
  });
  var btn = document.getElementById('ep-copy-btn');
  btn.textContent = (tab === 'recipients') ? '📋 Copy Recipients' : '📋 Copy HTML';
}

function emailCopyActive() {
  var text = (_epActiveTab === 'recipients')
    ? document.getElementById('email-recipients-output').value
    : document.getElementById('email-html-output').value;
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      var btn = document.getElementById('ep-copy-btn');
      var orig = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(function(){ btn.textContent = orig; }, 2000);
    }).catch(function(){ _emailCopyFallback(text); });
  } else {
    _emailCopyFallback(text);
  }
}

function _emailCopyFallback(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); TomikaBikes.showToast('Copied to clipboard!', 'success'); }
  catch(e) { TomikaBikes.showToast('Copy failed — please select the text manually', 'error'); }
  document.body.removeChild(ta);
}

document.getElementById('email-preview-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeEmailPreview();
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('email-preview-overlay').classList.contains('open')) closeEmailPreview();
});

const _origShowSectionForSubs = window.showSection;
window.showSection = function (name, linkEl) {
  _origShowSectionForSubs(name, linkEl);
  if (name === 'subscribers' && !_adminSubsLoaded) {
    _adminSubsLoaded = true;
    adminSubscribersLoad();
  }
};
