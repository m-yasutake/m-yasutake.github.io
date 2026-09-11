// js/admin/gear.js — Gear Admin section of admin.html (GearManagerAdmin):
// gear collection + site_config/gear doc CRUD.

// ── Gear Admin ────────────────────────────────────────────────
const GearManagerAdmin = (function () {
  const GEAR_COLLECTION = 'gear_categories';
  let _gearData = [];
  let _editMode = false;
  let _fsLoaded = false;
  let _origData = null;
  let _initialized = false;

  const GEAR_DEFAULT = [
    { id: 'mika-rig', icon: '🚲', name: "Mika's Rig", order: 0, items: [
      { id: 'mr1', name: 'Touring bike',          notes: 'Steel frame, 700c wheels',     group: 'Bike'   },
      { id: 'mr2', name: 'Rear rack',             notes: '',                             group: 'Mounts' },
      { id: 'mr3', name: 'Front rack',            notes: '',                             group: 'Mounts' },
      { id: 'mr4', name: 'Rear panniers (pair)',  notes: 'Ortlieb Back-Roller Classic',  group: 'Bags'   },
      { id: 'mr5', name: 'Front panniers (pair)', notes: 'Ortlieb Front-Roller',         group: 'Bags'   },
      { id: 'mr6', name: 'Handlebar bag',         notes: 'Quick access for snacks & map',group: 'Bags'   },
      { id: 'mr7', name: 'Frame bag',             notes: 'Tools & spares',               group: 'Bags'   },
    ]},
    { id: 'tom-rig', icon: '🚲', name: "Tom's Rig", order: 1, items: [
      { id: 'tr1', name: 'Touring bike',          notes: 'Steel frame, 700c wheels',     group: 'Bike'   },
      { id: 'tr2', name: 'Rear rack',             notes: '',                             group: 'Mounts' },
      { id: 'tr3', name: 'Front rack',            notes: '',                             group: 'Mounts' },
      { id: 'tr4', name: 'Rear panniers (pair)',  notes: 'Ortlieb Back-Roller Classic',  group: 'Bags'   },
      { id: 'tr5', name: 'Front panniers (pair)', notes: 'Ortlieb Front-Roller',         group: 'Bags'   },
      { id: 'tr6', name: 'Handlebar bag',         notes: 'Route notes and quick-access gear', group: 'Bags' },
      { id: 'tr7', name: 'Frame bag',             notes: 'Pump and repair essentials',   group: 'Bags'   },
    ]},
    { id: 'shelter-sleep', icon: '🛏️', name: 'Shelter & Sleep', order: 2, items: [
      { id: 'ss1', name: 'Tent (2-person)',     notes: 'Main shelter',           group: '' },
      { id: 'ss2', name: 'Sleeping bags',       notes: 'Down bags for cool nights', group: '' },
      { id: 'ss3', name: 'Sleeping mats',       notes: 'Compact inflatable mats',  group: '' },
    ]},
    { id: 'cooking-eating', icon: '🍳', name: 'Cooking & Eating', order: 3, items: [
      { id: 'ce1', name: 'Cooking stove + fuel',     notes: 'Primary cooking setup', group: '' },
      { id: 'ce2', name: 'Cook pot + pan',           notes: 'Simple camp cooking set', group: '' },
      { id: 'ce3', name: 'Mugs, bowls and utensils', notes: 'Shared meal kit', group: '' },
    ]},
    { id: 'clothing', icon: '👕', name: 'Clothing', order: 4, items: [
      { id: 'cl1', name: 'Cycling jerseys (×3)', notes: 'Merino wool preferred', group: '' },
      { id: 'cl2', name: 'Bib shorts / shorts (×2)', notes: '', group: '' },
      { id: 'cl3', name: 'Rain jacket',          notes: 'Lightweight packable', group: '' },
    ]},
    { id: 'nav-tech', icon: '📡', name: 'Navigation & Tech', order: 5, items: [
      { id: 'nt1', name: 'GPS device',  notes: 'Garmin Edge', group: '' },
      { id: 'nt2', name: 'Camera',      notes: '',            group: '' },
      { id: 'nt3', name: 'Laptop',      notes: 'For blog & work on the road', group: '' },
    ]},
    { id: 'bike-maintenance', icon: '🔧', name: 'Bike Maintenance', order: 6, items: [
      { id: 'bm1', name: 'Repair kit & multi-tool', notes: '', group: '' },
      { id: 'bm2', name: 'Spare tubes (×4)',         notes: '700×35c', group: '' },
    ]},
    { id: 'extras', icon: '✨', name: 'Extras & Luxuries', order: 7, items: [
      { id: 'ex1', name: 'Coffee dripper',  notes: '', group: '' },
      { id: 'ex2', name: 'Small sketchbook', notes: '', group: '' },
    ]},
  ];

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  async function ensureFirestore() {
    if (_fsLoaded) return;
    await window.TomikaBikes.ensureFirebaseAuth();
    const src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js';
    if (![...document.scripts].some(s => (s.getAttribute('src') || '') === src)) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    _fsLoaded = true;
  }

  async function fetchFromFirestore() {
    const snap = await _getAdminDb().collection(GEAR_COLLECTION).orderBy('order').get();
    if (snap.empty) return null;
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async function saveToFirestore(data) {
    const db = _getAdminDb();
    const batch = db.batch();
    const existing = await db.collection(GEAR_COLLECTION).get();
    existing.docs.forEach(doc => batch.delete(doc.ref));
    data.forEach((cat, idx) => {
      batch.set(db.collection(GEAR_COLLECTION).doc(cat.id),
        { icon: cat.icon, name: cat.name, order: idx, items: cat.items });
    });
    await batch.commit();
  }

  function whoTag(who, editable) {
    if (editable) {
      return '<select class="gear-status-select" data-field="who">' +
        ['Both', 'Mika', 'Tom'].map(v =>
          '<option value="' + v + '"' + (who === v ? ' selected' : '') + '>' + v + '</option>'
        ).join('') + '</select>';
    }
    const cls = (who || 'both').toLowerCase();
    return '<span class="gear-tag ' + cls + '">' + (who || 'Both') + '</span>';
  }

  const RIG_IDS = new Set(['mika-rig', 'tom-rig']);
  const RIG_GROUPS = ['Bike', 'Mounts', 'Bags'];

  function renderGear(data, editMode) {
    const content = document.getElementById('gearContent');
    if (!content) return;
    let html = '';
    data.forEach(cat => {
      const cid = cat.id;
      const isRig = RIG_IDS.has(cid);
      // rig edit: Item | Group | Notes | actions (4 cols)
      // rig view: Item | Notes (2 cols, with group separators)
      // other edit: Item | Notes | actions (3 cols)
      // other view: Item | Notes (2 cols)
      const colCount = editMode ? (isRig ? 4 : 3) : 2;

      html += '<div class="gear-category"' + (editMode ? ' data-editing="1"' : '') + ' data-cat-id="' + cid + '">';
      html += '<div class="gear-category-header">';
      html += '<span class="gear-category-icon"' + (editMode ? ' contenteditable="true" data-field="icon"' : '') + '>' + cat.icon + '</span>';
      html += '<h3' + (editMode ? ' contenteditable="true" data-field="name"' : '') + '>' + cat.name + '</h3>';
      if (editMode) html += '<button class="gear-cat-delete" onclick="GearManagerAdmin.deleteCategory(\'' + cid + '\')" title="Remove category">✕ Remove</button>';
      html += '</div>';

      let headerCols = '<th>Item</th>';
      if (editMode && isRig) headerCols += '<th>Group</th>';
      headerCols += '<th>Notes</th>';
      if (editMode) headerCols += '<th></th>';

      html += '<table class="gear-table"><thead><tr>' + headerCols + '</tr></thead><tbody>';

      let lastGroup = null;
      cat.items.forEach(item => {
        const iid = item.id;
        const grp = item.group || '';
        if (!editMode && isRig && grp && grp !== lastGroup) {
          lastGroup = grp;
          html += '<tr class="gear-group-header"><td colspan="' + colCount + '" class="gear-group-label">' + grp + '</td></tr>';
        }
        html += '<tr data-item-id="' + iid + '">';
        html += '<td data-label="Item"' + (editMode ? ' contenteditable="true" data-field="name"' : '') + '>' + (item.name || '') + '</td>';
        if (editMode && isRig) {
          html += '<td data-label="Group"><select class="gear-status-select" data-field="group">' +
            ['', ...RIG_GROUPS].map(v => '<option value="' + v + '"' + (grp === v ? ' selected' : '') + '>' + (v || '—') + '</option>').join('') +
            '</select></td>';
        }
        html += '<td data-label="Notes" class="gear-notes"' + (editMode ? ' contenteditable="true" data-field="notes"' : '') + '>' + (item.notes || '') + '</td>';
        if (editMode) {
          html += '<td data-label="" style="white-space:nowrap">' +
            '<button class="gear-row-move" onclick="GearManagerAdmin.moveItemUp(\'' + cid + '\',\'' + iid + '\')" title="Move up">↑</button>' +
            '<button class="gear-row-move" onclick="GearManagerAdmin.moveItemDown(\'' + cid + '\',\'' + iid + '\')" title="Move down">↓</button>' +
            '<button class="gear-row-delete" onclick="GearManagerAdmin.deleteItem(\'' + cid + '\',\'' + iid + '\')" title="Delete row">🗑</button></td>';
        }
        html += '</tr>';
      });
      html += '</tbody>';
      if (editMode) {
        html += '<tfoot><tr><td colspan="' + colCount + '"><button class="gear-add-row-btn" onclick="GearManagerAdmin.addItem(\'' + cid + '\')">＋ Add item</button></td></tr></tfoot>';
      }
      html += '</table></div>';
    });
    if (editMode) {
      html += '<button class="gear-add-cat-btn" onclick="GearManagerAdmin.addCategory()">＋ Add category</button>';
    }
    content.innerHTML = html;
  }

  function collectFromDOM() {
    const cats = [];
    document.querySelectorAll('#gearContent .gear-category').forEach(catEl => {
      const catId  = catEl.dataset.catId;
      const header = catEl.querySelector('.gear-category-header');
      const icon   = (header.querySelector('[data-field="icon"]') || {}).textContent || '';
      const name   = (header.querySelector('[data-field="name"]') || {}).textContent || '';
      const items  = [];
      catEl.querySelectorAll('tbody tr').forEach(row => {
        const nameEl  = row.querySelector('[data-field="name"]');
        const notesEl = row.querySelector('[data-field="notes"]');
        const groupEl = row.querySelector('[data-field="group"]');
        if (!nameEl) return;
        items.push({
          id:    row.dataset.itemId || uid(),
          name:  nameEl.textContent.trim(),
          notes: notesEl ? notesEl.textContent.trim() : '',
          group: groupEl ? groupEl.value              : '',
        });
      });
      cats.push({ id: catId, icon: icon.trim(), name: name.trim(), items });
    });
    return cats;
  }

  function setEditMode(on) {
    _editMode = on;
    document.getElementById('gearEditBtn').style.display   = on ? 'none' : '';
    document.getElementById('gearSaveBtn').style.display   = on ? ''     : 'none';
    document.getElementById('gearCancelBtn').style.display = on ? ''     : 'none';
    renderGear(_gearData, on);
  }

  async function init() {
    if (_initialized) return;
    _initialized = true;
    try {
      await ensureFirestore();
      const data = await fetchFromFirestore();
      _gearData = data || GEAR_DEFAULT;
      if (!data) await saveToFirestore(_gearData);
    } catch (e) {
      console.warn('Gear: Firestore unavailable, using defaults:', e);
      _gearData = GEAR_DEFAULT;
    }
    renderGear(_gearData, false);
    document.getElementById('gearAdminBar').style.display = 'flex';

    document.getElementById('gearEditBtn').addEventListener('click', () => {
      _origData = deepClone(_gearData);
      setEditMode(true);
    });
    document.getElementById('gearSaveBtn').addEventListener('click', async () => {
      _gearData = collectFromDOM();
      const btn = document.getElementById('gearSaveBtn');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        await ensureFirestore();
        await saveToFirestore(_gearData);
        _origData = null;
        setEditMode(false);
        TomikaBikes.showToast('Gear list saved!', 'success');
      } catch (e) {
        TomikaBikes.showToast('Save failed: ' + e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '💾 Save';
      }
    });
    document.getElementById('gearCancelBtn').addEventListener('click', () => {
      if (_origData) { _gearData = _origData; _origData = null; }
      setEditMode(false);
    });
  }

  return {
    get _initialized() { return _initialized; },
    init,
    loadBikeLinks: async function() {
      try {
        const doc = await _getAdminDb().collection('site_config').doc('gear').get();
        if (doc.exists) {
          const d = doc.data();
          // Load bike photos using DOM methods to avoid XSS
          if (d.mikaBikePhoto) {
            const inp = document.getElementById('bike-photo-mika');
            if (inp) inp.value = d.mikaBikePhoto;
            const prev = document.getElementById('bike-photo-preview-mika');
            if (prev) {
              prev.innerHTML = '';
              const img = document.createElement('img');
              img.src = d.mikaBikePhoto;
              img.alt = "Mika's bike";
              img.style.cssText = 'width:100%;height:100%;object-fit:cover';
              prev.appendChild(img);
            }
            const clr = document.getElementById('bike-photo-clear-mika');
            if (clr) clr.style.display = '';
          }
          if (d.tomBikePhoto) {
            const inp = document.getElementById('bike-photo-tom');
            if (inp) inp.value = d.tomBikePhoto;
            const prev = document.getElementById('bike-photo-preview-tom');
            if (prev) {
              prev.innerHTML = '';
              const img = document.createElement('img');
              img.src = d.tomBikePhoto;
              img.alt = "Tom's bike";
              img.style.cssText = 'width:100%;height:100%;object-fit:cover';
              prev.appendChild(img);
            }
            const clr = document.getElementById('bike-photo-clear-tom');
            if (clr) clr.style.display = '';
          }
        }
      } catch (e) { /* non-critical */ }
    },
    deleteCategory(catId) {
      _gearData = collectFromDOM();
      _gearData = _gearData.filter(c => c.id !== catId);
      renderGear(_gearData, true);
    },
    deleteItem(catId, itemId) {
      _gearData = collectFromDOM();
      const cat = _gearData.find(c => c.id === catId);
      if (cat) cat.items = cat.items.filter(i => i.id !== itemId);
      renderGear(_gearData, true);
    },
    addItem(catId) {
      _gearData = collectFromDOM();
      const cat = _gearData.find(c => c.id === catId);
      if (cat) cat.items.push({ id: uid(), name: 'New item', notes: '', group: '' });
      renderGear(_gearData, true);
    },
    addCategory() {
      _gearData = collectFromDOM();
      _gearData.push({ id: uid(), icon: '📦', name: 'New Category', order: _gearData.length, items: [] });
      renderGear(_gearData, true);
    },
    moveItemUp(catId, itemId) {
      _gearData = collectFromDOM();
      const cat = _gearData.find(c => c.id === catId);
      if (!cat) return;
      const idx = cat.items.findIndex(i => i.id === itemId);
      if (idx <= 0) return;
      [cat.items[idx - 1], cat.items[idx]] = [cat.items[idx], cat.items[idx - 1]];
      renderGear(_gearData, true);
    },
    moveItemDown(catId, itemId) {
      _gearData = collectFromDOM();
      const cat = _gearData.find(c => c.id === catId);
      if (!cat) return;
      const idx = cat.items.findIndex(i => i.id === itemId);
      if (idx < 0 || idx >= cat.items.length - 1) return;
      [cat.items[idx + 1], cat.items[idx]] = [cat.items[idx], cat.items[idx + 1]];
      renderGear(_gearData, true);
    },
  };
})();
