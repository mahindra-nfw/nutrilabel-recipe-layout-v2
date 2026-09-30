// Shared calculation engine + UI helpers. Both layouts convert their state into the same
// "model" shape ({ root, asm: { id: { name, items:[{ref, amount}], yieldLoss } } }) so the
// numbers are identical and only the interface differs.
window.NL = window.NL || {};

NL.CUSTOM_KEY = 'nlv2_custom_ingredients';
NL.CUSTOM_CAT = 'My Ingredients';
NL.CAT_COLORS[NL.CUSTOM_CAT] = '#0ea5e9';
try { (JSON.parse(localStorage.getItem(NL.CUSTOM_KEY)) || []).forEach(i => NL.INGREDIENTS.push(i)); } catch { }
NL.ingMap = Object.fromEntries(NL.INGREDIENTS.map(i => [i.id, i]));
NL.refreshCategories = () => { NL.CATEGORIES = [...new Set([...NL.INGREDIENTS.map(i => i.cat), NL.CUSTOM_CAT])]; };
NL.refreshCategories();
NL.addIngredient = function (ing) {
  NL.INGREDIENTS.push(ing); NL.ingMap[ing.id] = ing; NL.refreshCategories();
  try {
    const list = JSON.parse(localStorage.getItem(NL.CUSTOM_KEY)) || [];
    list.push(ing); localStorage.setItem(NL.CUSTOM_KEY, JSON.stringify(list));
  } catch { }
  document.dispatchEvent(new CustomEvent('nl:ingredients'));
  return ing;
};

// Modal form for a new raw ingredient (nutrition per 100 g). Resolves to the ingredient or null.
NL.ingredientForm = function (initialName = '') {
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.className = 'nl-prompt-ov';
    const cats = NL.CATEGORIES.map(c => `<option ${c === NL.CUSTOM_CAT ? 'selected' : ''}>${NL.esc(c)}</option>`).join('');
    const nut = NL.NUTRIENTS.map((n, k) => `<label class="nif-n${n.sub ? ' sub' : ''}"><span>${NL.esc(n.label)}${n.unit ? ` (${n.unit})` : ' (kcal)'}</span>
      <input type="number" min="0" step="any" data-n="${k}" placeholder="0"></label>`).join('');
    ov.innerHTML = `<form class="nl-prompt nif">
      <div class="nl-prompt-label">New ingredient</div>
      <label class="nif-f"><span>Name</span><input name="name" required value="${NL.esc(initialName)}" placeholder="e.g. Yuzu Kosho"></label>
      <div class="nif-row">
        <label class="nif-f"><span>Category</span><select name="cat">${cats}</select></label>
        <label class="nif-f"><span>Vendor (optional)</span><input name="vendor" placeholder="e.g. Sysco"></label>
      </div>
      <div class="nif-h">Nutrition per 100 g <small>blank = 0</small></div>
      <div class="nif-grid">${nut}</div>
      <div class="nl-prompt-btns"><button type="submit" class="btn primary">Save ingredient</button><button type="button" class="btn ghost nl-prompt-cancel">Cancel</button></div>
    </form>`;
    document.body.appendChild(ov);
    const f = ov.querySelector('form'), nameIn = f.elements.name;
    nameIn.focus(); nameIn.select();
    const done = v => { ov.remove(); resolve(v); };
    f.onsubmit = e => {
      e.preventDefault();
      const name = nameIn.value.trim(); if (!name) return nameIn.focus();
      if (NL.INGREDIENTS.some(i => i.name.toLowerCase() === name.toLowerCase()) && !confirm(`An ingredient called "${name}" already exists. Create another one anyway?`)) return;
      const n = NL.NUTRIENTS.map((_, k) => Math.max(0, parseFloat(f.querySelector(`[data-n="${k}"]`).value) || 0));
      done(NL.addIngredient({ id: NL.uid('c'), name, cat: f.elements.cat.value, vendor: f.elements.vendor.value.trim() || null, n, custom: true }));
    };
    ov.querySelector('.nl-prompt-cancel').onclick = () => done(null);
    ov.addEventListener('pointerdown', e => { if (e.target === ov) done(null); });
    f.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } });
  });
};
NL.NUTRIENTS = [
  { k: 'kcal', label: 'Calories', unit: '' },
  { k: 'fat', label: 'Total Fat', unit: 'g', dv: 78 },
  { k: 'sat', label: 'Saturated Fat', unit: 'g', dv: 20, sub: true },
  { k: 'chol', label: 'Cholesterol', unit: 'mg', dv: 300 },
  { k: 'na', label: 'Sodium', unit: 'mg', dv: 2300 },
  { k: 'carb', label: 'Total Carbohydrate', unit: 'g', dv: 275 },
  { k: 'fib', label: 'Dietary Fiber', unit: 'g', dv: 28, sub: true },
  { k: 'sug', label: 'Total Sugars', unit: 'g', sub: true },
  { k: 'pro', label: 'Protein', unit: 'g' },
];

const zero = () => NL.NUTRIENTS.map(() => 0);

// Returns { [asmId]: { batch, yielded, lossG, perG:[...], total:[...], cycle } }
NL.calc = function (model) {
  const res = {}, visiting = new Set();
  function perG(ref) {
    const [t, id] = ref.split(':');
    if (t === 'ing') { const i = NL.ingMap[id]; return i ? i.n.map(v => v / 100) : null; }
    return model.asm[id] ? asm(id).perG : null;
  }
  function asm(id) {
    if (res[id]) return res[id];
    if (visiting.has(id)) return { batch: 0, yielded: 0, lossG: 0, perG: zero(), total: zero(), cycle: true };
    visiting.add(id);
    const a = model.asm[id];
    let batch = 0; const total = zero();
    for (const it of a.items) {
      const amt = +it.amount || 0; batch += amt;
      const pg = perG(it.ref);
      if (pg) pg.forEach((v, i) => { total[i] += v * amt; });
    }
    const loss = Math.min(Math.max(+a.yieldLoss || 0, 0), 95);
    const yielded = batch * (1 - loss / 100);
    visiting.delete(id);
    return (res[id] = { batch, yielded, lossG: batch - yielded, perG: total.map(v => yielded > 0 ? v / yielded : 0), total });
  }
  Object.keys(model.asm).forEach(asm);
  return res;
};

// Raw-ingredient breakdown (grams per one unit of root) → for the ingredient statement.
NL.flatten = function (model, calc, rootId) {
  const out = {};
  (function walk(id, factor, depth) {
    if (depth > 20) return;
    const a = model.asm[id]; // yield loss is treated as moisture, so it scales sub-recipe usage
    for (const it of a.items) {
      const [t, rid] = it.ref.split(':');
      if (t === 'ing') out[rid] = (out[rid] || 0) + (+it.amount || 0) * factor;
      else if (model.asm[rid] && calc[rid].yielded > 0) walk(rid, factor * (+it.amount || 0) / calc[rid].yielded, depth + 1);
    }
  })(rootId, 1, 0);
  return Object.entries(out).filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]);
};

NL.refName = function (model, ref) {
  const [t, id] = ref.split(':');
  if (t === 'ing') return NL.ingMap[id]?.name || id;
  return model.asm[id]?.name || '(missing)';
};

NL.fmt = function (n, d = 1) {
  if (!isFinite(n)) return '0';
  const r = Math.round(n * 10 ** d) / 10 ** d;
  return r.toLocaleString(undefined, { maximumFractionDigits: d });
};
NL.pct = (part, whole) => whole > 0 ? NL.fmt(part / whole * 100, 1) + '%' : '0%';
NL.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
NL.uid = (p = 'n') => p + Math.random().toString(36).slice(2, 8);

// FDA-style nutrition facts panel (US format, simplified rounding).
NL.labelHTML = function (model, calc, rootId) {
  const c = calc[rootId]; const serving = c.yielded; const t = c.perG.map(v => v * serving);
  const rows = NL.NUTRIENTS.slice(1).map((n, i) => {
    const v = t[i + 1];
    const dv = n.dv ? Math.round(v / n.dv * 100) + '%' : '';
    return `<div class="lb-row ${n.sub ? 'sub' : ''}"><span><b>${n.sub ? '' : n.label}</b>${n.sub ? n.label : ''} ${NL.fmt(v, n.unit === 'mg' ? 0 : 1)}${n.unit}</span><b>${dv}</b></div>`;
  }).join('');
  const stmt = NL.flatten(model, calc, rootId).map(([id]) => NL.ingMap[id]?.name).join(', ');
  return `<div class="nlabel">
    <div class="lb-title">Nutrition Facts</div>
    <div class="lb-serv"><span>Serving size</span><b>${NL.fmt(serving, 1)} g</b></div>
    <div class="lb-thick"></div>
    <div class="lb-cal"><span>Calories</span><b>${Math.round(t[0])}</b></div>
    <div class="lb-med"></div>
    <div class="lb-row right"><b>% Daily Value*</b></div>
    ${rows}
    <div class="lb-thick"></div>
    <div class="lb-foot">* Approximate values from the test ingredient library.</div>
  </div>
  <div class="lb-stmt"><b>INGREDIENTS:</b> ${NL.esc(stmt) || '—'}</div>`;
};

// Searchable dropdown used for "add ingredient / sub-assembly" in both layouts.
// groups: [{ label, items: [{ value, label, sub, color }] }]
NL.picker = function ({ x, y, groups, placeholder = 'Search ingredients…', onPick }) {
  NL.closePicker();
  const el = document.createElement('div');
  el.className = 'picker';
  el.innerHTML = `<div class="pk-head"><input placeholder="${placeholder}"><button class="pk-close" title="Close (Esc)">×</button></div><div class="pk-list"></div>`;
  el.querySelector('.pk-close').onclick = () => NL.closePicker();
  document.body.appendChild(el);
  const input = el.querySelector('input'), list = el.querySelector('.pk-list');
  let active = 0, flat = [];
  function draw() {
    const q = input.value.trim().toLowerCase();
    flat = []; let html = '';
    // while searching, pinned actions ("always") move to the end so Enter picks the best match
    const pinned = groups.filter(g => g.items.some(i => i.always)).sort((a, b) => b.items.some(i => i.value === 'new-ing') - a.items.some(i => i.value === 'new-ing'));
    const ordered = q ? [...groups.filter(g => !g.items.some(i => i.always)), ...pinned] : groups;
    for (const g of ordered) {
      const items = g.items.filter(i => !q || i.label.toLowerCase().includes(q) || (i.sub || '').toLowerCase().includes(q) || i.always);
      if (!items.length) continue;
      html += `<div class="pk-group">${NL.esc(g.label)}</div>`;
      for (const i of items) {
        html += `<div class="pk-item ${flat.length === active ? 'active' : ''}" data-i="${flat.length}">
          <span class="pk-dot" style="background:${i.color || '#94a3b8'}"></span>
          <span class="pk-label">${NL.esc(i.label)}</span><span class="pk-sub">${NL.esc(i.sub || '')}</span></div>`;
        flat.push(i);
      }
    }
    list.innerHTML = html || '<div class="pk-empty">No matches</div>';
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }
  function pick(i) {
    const it = flat[i]; if (!it) return;
    const typed = input.value.trim();
    NL.closePicker();
    if (it.value === 'new-ing') NL.ingredientForm(typed).then(ing => { if (ing) { NL.toast(`"${ing.name}" added to your ingredients`); onPick('ing:' + ing.id, it); } });
    else onPick(it.value, it);
  }
  input.addEventListener('input', () => { active = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, flat.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(active); e.preventDefault(); }
    else if (e.key === 'Escape') NL.closePicker();
  });
  list.addEventListener('mousedown', e => { const it = e.target.closest('.pk-item'); if (it) { e.preventDefault(); pick(+it.dataset.i); } });
  const W = 300, H = 360;
  el.style.left = Math.max(8, Math.min(x, innerWidth - W - 8)) + 'px';
  el.style.top = Math.max(8, Math.min(y, innerHeight - H - 8)) + 'px';
  draw(); input.focus();
  // pointerdown in the capture phase: the canvas calls preventDefault() on pointerdown (for panning),
  // which suppresses 'mousedown', so a mousedown listener never saw clicks on the canvas.
  NL._pickerOutside = e => { if (!el.contains(e.target)) NL.closePicker(); };
  NL._pickerEsc = e => { if (e.key === 'Escape') NL.closePicker(); };
  setTimeout(() => {
    document.addEventListener('pointerdown', NL._pickerOutside, true);
    document.addEventListener('keydown', NL._pickerEsc, true);
    window.addEventListener('wheel', NL._pickerOutside, { capture: true, passive: true });
  }, 0);
};
NL.closePicker = function () {
  document.querySelector('.picker')?.remove();
  if (NL._pickerOutside) {
    document.removeEventListener('pointerdown', NL._pickerOutside, true);
    document.removeEventListener('keydown', NL._pickerEsc, true);
    window.removeEventListener('wheel', NL._pickerOutside, { capture: true });
  }
  NL._pickerOutside = NL._pickerEsc = null;
};
NL.ingredientGroups = function () {
  return [{ label: 'New', items: [{ value: 'new-ing', label: '＋ Create new ingredient', color: NL.CAT_COLORS[NL.CUSTOM_CAT], always: true }] }, ...NL.CATEGORIES.map(cat => ({
    label: cat,
    items: NL.INGREDIENTS.filter(i => i.cat === cat).map(i => ({ value: 'ing:' + i.id, label: i.name, sub: i.vendor || (i.custom ? 'custom' : ''), color: NL.CAT_COLORS[cat] || '#94a3b8' })),
  })).filter(g => g.items.length)];
};

// Pan / zoom canvas. `world` is transformed; background dots follow the transform.
NL.viewport = function (vp, world, { isBackground, onChange } = {}) {
  const v = { s: 1, x: 0, y: 0 };
  function apply() {
    world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.s})`;
    vp.style.backgroundPosition = `${v.x}px ${v.y}px`;
    vp.style.backgroundSize = `${22 * v.s}px ${22 * v.s}px`;
    onChange && onChange(v);
  }
  function zoomAt(f, cx, cy) {
    const ns = Math.min(2, Math.max(0.25, v.s * f));
    v.x = cx - (cx - v.x) * ns / v.s; v.y = cy - (cy - v.y) * ns / v.s; v.s = ns; apply();
  }
  vp.addEventListener('wheel', e => {
    if (e.target.closest('.no-wheel')) return;
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= 50 && e.deltaX === 0) zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    else { v.x -= e.deltaX; v.y -= e.deltaY; apply(); } // trackpad two-finger scroll pans
  }, { passive: false });
  vp.addEventListener('pointerdown', e => {
    if (!(e.button === 1 || (e.button === 0 && isBackground(e.target)))) return;
    e.preventDefault();
    const sx = e.clientX - v.x, sy = e.clientY - v.y; let moved = false;
    vp.classList.add('panning');
    const mv = ev => { moved = true; v.x = ev.clientX - sx; v.y = ev.clientY - sy; apply(); };
    const up = () => { vp.classList.remove('panning'); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); api.lastPanMoved = moved; };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  const api = {
    v, apply,
    toWorld(cx, cy) { const r = vp.getBoundingClientRect(); return { x: (cx - r.left - v.x) / v.s, y: (cy - r.top - v.y) / v.s }; },
    zoom(f) { const r = vp.getBoundingClientRect(); zoomAt(f, r.width / 2, r.height / 2); },
    // min: never zoom out further than this; if clamped, anchor to `align` ('left' | 'right') and top.
    fit(b, pad = 60, { min = 0.25, align = 'left' } = {}) {
      const r = vp.getBoundingClientRect();
      if (!b || b.w <= 0) return;
      const s = Math.min(1.1, Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h));
      v.s = Math.max(min, s);
      if (s >= min) { v.x = (r.width - b.w * v.s) / 2 - b.x * v.s; v.y = (r.height - b.h * v.s) / 2 - b.y * v.s; }
      else { v.x = align === 'right' ? r.width - pad - (b.x + b.w) * v.s : pad - b.x * v.s; v.y = pad / 2 - b.y * v.s; }
      api.animate(); apply();
    },
    centerOn(x, y, s) {
      const r = vp.getBoundingClientRect(); if (s) v.s = s;
      v.x = r.width / 2 - x * v.s; v.y = r.height / 2 - y * v.s; api.animate(); apply();
    },
    animate() { world.classList.add('animating'); clearTimeout(api._t); api._t = setTimeout(() => world.classList.remove('animating'), 320); },
  };
  apply();
  return api;
};

// Undo/redo. `save` is called after every change (it persists the current state).
NL.history = function (save, get, set) {
  const past = [], future = [];
  let last = JSON.stringify(get());
  return {
    commit() {
      const now = JSON.stringify(get());
      if (now === last) return;
      past.push(last); if (past.length > 100) past.shift();
      future.length = 0; last = now; save();
    },
    undo() { if (!past.length) return; future.push(last); last = past.pop(); set(JSON.parse(last)); save(); },
    redo() { if (!future.length) return; past.push(last); last = future.pop(); set(JSON.parse(last)); save(); },
  };
};

// Excel-style workbook: one recipe per tab, tab bar pinned to the bottom of the page.
// opts: key, legacyKey, sample(), nameOf(state), onSwitch(state), onNew(), beforeSwitch()
// A tab shows its own `title` once renamed; until then it follows the recipe name.
NL.workbook = function (o) {
  const clone = x => JSON.parse(JSON.stringify(x));
  let book = NL.load(o.key);
  if (!book || !book.tabs?.length) {
    const first = { id: NL.uid('t'), state: (o.legacyKey && NL.load(o.legacyKey)) || o.sample() };
    book = { active: first.id, tabs: [first] };
  }
  if (!book.tabs.some(t => t.id === book.active)) book.active = book.tabs[0].id;
  let live = null, renaming = null, dragId = null;
  const tab = id => book.tabs.find(t => t.id === id);
  const persist = () => { try { localStorage.setItem(o.key, JSON.stringify(book)); } catch { } };
  const name = t => t.title || o.nameOf(t.id === book.active && live ? live : t.state) || 'Untitled';

  const bar = document.createElement('div');
  bar.className = 'tabbar';
  document.body.appendChild(bar);
  document.body.classList.add('has-tabbar');

  function draw() {
    if (renaming) return;
    bar.innerHTML = `<button class="tb-add" data-new title="New recipe">+</button>
      <div class="tb-tabs">${book.tabs.map(t => `<div class="tb-tab ${t.id === book.active ? 'active' : ''}" draggable="true" data-tab="${t.id}" title="Click to open · double-click to rename · right-click for more">
        <span class="tb-name">${NL.esc(name(t))}</span><button class="tb-x" data-close="${t.id}" title="Delete recipe">×</button></div>`).join('')}</div>
      <span class="tb-hint">${book.tabs.length} recipe${book.tabs.length > 1 ? 's' : ''} · double-click a tab to rename</span>`;
    bar.querySelector('.tb-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function switchTo(id) {
    if (id === book.active || !tab(id)) return;
    o.beforeSwitch && o.beforeSwitch();
    book.active = id; live = null; persist(); draw();
    o.onSwitch(tab(id).state);
  }
  function add(state, title) {
    o.beforeSwitch && o.beforeSwitch();
    const t = { id: NL.uid('t'), state };
    if (title) t.title = title;
    book.tabs.splice(book.tabs.findIndex(x => x.id === book.active) + 1, 0, t);
    book.active = t.id; live = null; persist(); draw();
    o.onSwitch(state);
  }
  function close(id) {
    if (book.tabs.length === 1) return NL.toast('You need at least one recipe tab');
    if (!confirm(`Delete the recipe "${name(tab(id))}"? This can't be undone.`)) return;
    const i = book.tabs.findIndex(t => t.id === id);
    book.tabs.splice(i, 1);
    if (id === book.active) { book.active = book.tabs[Math.min(i, book.tabs.length - 1)].id; live = null; persist(); draw(); o.onSwitch(tab(book.active).state); }
    else { persist(); draw(); }
  }
  function duplicate(id) {
    o.beforeSwitch && o.beforeSwitch();
    add(clone(tab(id).state), name(tab(id)) + ' (copy)');
  }
  function rename(id) {
    switchTo(id);
    const el = bar.querySelector(`[data-tab="${id}"] .tb-name`); if (!el) return;
    renaming = id;
    const inp = document.createElement('input');
    inp.className = 'tb-input'; inp.value = name(tab(id)); el.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const finish = ok => {
      if (done) return; done = true; renaming = null;
      const v = inp.value.trim();
      if (ok && v) { tab(id).title = v; persist(); } draw();
    };
    inp.onkeydown = e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); e.stopPropagation(); };
    inp.onblur = () => finish(true);
  }
  function menu(id, x, y) {
    document.querySelector('.tb-menu')?.remove();
    const m = document.createElement('div');
    m.className = 'tb-menu';
    m.innerHTML = `<button data-m="rename">Rename</button><button data-m="dup">Duplicate</button><button data-m="del" class="danger">Delete</button>`;
    document.body.appendChild(m);
    m.style.left = Math.min(x, innerWidth - 170) + 'px'; m.style.top = (y - m.offsetHeight - 6) + 'px';
    const off = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    m.onclick = e => {
      const a = e.target.dataset.m; if (!a) return;
      m.remove(); document.removeEventListener('pointerdown', off, true);
      if (a === 'rename') rename(id); else if (a === 'dup') duplicate(id); else close(id);
    };
  }

  bar.addEventListener('click', e => {
    if (e.target.closest('[data-new]')) return o.onNew();
    const x = e.target.closest('[data-close]'); if (x) { e.stopPropagation(); return close(x.dataset.close); }
    const t = e.target.closest('[data-tab]'); if (t && !renaming) switchTo(t.dataset.tab);
  });
  bar.addEventListener('dblclick', e => { const t = e.target.closest('[data-tab]'); if (t && !e.target.closest('[data-close]')) rename(t.dataset.tab); });
  bar.addEventListener('contextmenu', e => { const t = e.target.closest('[data-tab]'); if (t) { e.preventDefault(); menu(t.dataset.tab, e.clientX, e.clientY); } });
  bar.addEventListener('dragstart', e => { const t = e.target.closest('[data-tab]'); if (t) { dragId = t.dataset.tab; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/nl-tab', dragId); } });
  bar.addEventListener('dragover', e => { if (dragId) { e.preventDefault(); } });
  bar.addEventListener('drop', e => {
    const t = e.target.closest('[data-tab]'); if (!dragId || !t || t.dataset.tab === dragId) { dragId = null; return; }
    e.preventDefault();
    const from = book.tabs.findIndex(x => x.id === dragId), moved = book.tabs.splice(from, 1)[0];
    const r = t.getBoundingClientRect(), to = book.tabs.findIndex(x => x.id === t.dataset.tab) + (e.clientX > r.left + r.width / 2 ? 1 : 0);
    book.tabs.splice(to, 0, moved); dragId = null; persist(); draw();
  });
  bar.addEventListener('dragend', () => { dragId = null; });

  draw();
  return {
    current: () => tab(book.active).state,
    save(state) { tab(book.active).state = state; live = null; persist(); draw(); },
    live(state) { live = state; const el = bar.querySelector('.tb-tab.active .tb-name'); if (el && !renaming && !tab(book.active).title) el.textContent = o.nameOf(state); },
    add,
    count: () => book.tabs.length,
    names: () => book.tabs.map(name),
  };
};
NL.load = function (key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } };

// Yield % is the complement of yield loss %; only yieldLoss is stored.
NL.yieldPct = loss => +(100 - (+loss || 0)).toFixed(2);
NL.lossFromYield = v => +(100 - Math.min(Math.max(+v || 0, 0), 100)).toFixed(2);

// Re-render while keeping the focused input focused (elements carry data-fk keys).
NL.keepFocus = function (fn) {
  const a = document.activeElement, fk = a?.dataset?.fk, typed = a?.value;
  let s = null, e = null; try { s = a.selectionStart; e = a.selectionEnd; } catch { }
  fn();
  if (!fk) return;
  const n = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
  if (n) { if (typed != null && 'value' in n) n.value = typed; n.focus(); try { if (s != null) n.setSelectionRange(s, e); } catch { } }
};

NL.toast = function (msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(NL._toastT); NL._toastT = setTimeout(() => t.classList.remove('show'), 1800);
};

// Drag a wire from a card's port onto another card. Calls onDrop(targetEl) if released over one.
NL.connectDrag = function ({ e, vp, linksEl, from, color, targetSel, selfEl, onDrop }) {
  e.preventDefault(); e.stopPropagation();
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'link link-temp'); path.setAttribute('stroke', color);
  linksEl.appendChild(path);
  let target = null;
  const mv = ev => {
    const p = vp.toWorld(ev.clientX, ev.clientY), dx = Math.max(60, Math.abs(p.x - from.x) / 2);
    path.setAttribute('d', `M${from.x},${from.y} C${from.x - dx},${from.y} ${p.x + dx},${p.y} ${p.x},${p.y}`);
    const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(targetSel);
    const next = t && t !== selfEl ? t : null;
    if (next !== target) { target?.classList.remove('drop'); next?.classList.add('drop'); target = next; }
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    path.remove(); target?.classList.remove('drop');
    if (target) onDrop(target); else NL.toast('Drop the handle onto the recipe card that uses it');
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
  mv(e);
};

NL.prompt = function (label, defaultVal) {
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.className = 'nl-prompt-ov';
    ov.innerHTML = `<div class="nl-prompt">
      <div class="nl-prompt-label">${NL.esc(label)}</div>
      <input class="nl-prompt-input" value="${NL.esc(defaultVal || '')}">
      <div class="nl-prompt-btns"><button class="btn nl-prompt-ok">OK</button><button class="btn ghost nl-prompt-cancel">Cancel</button></div>
    </div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector('.nl-prompt-input');
    inp.focus(); inp.select();
    const done = v => { ov.remove(); resolve(v); };
    ov.querySelector('.nl-prompt-ok').onclick = () => done(inp.value.trim() || null);
    ov.querySelector('.nl-prompt-cancel').onclick = () => done(null);
    ov.addEventListener('pointerdown', e => { if (e.target === ov) done(null); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(inp.value.trim() || null); if (e.key === 'Escape') done(null); });
  });
};


NL.isTyping = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };
