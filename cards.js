// NutriLabel recipe builder — recipe cards (Modernist Cuisine style) linked like a flow.
// The final recipe is the main card; every sub-recipe row links to its own card.
(function () {
  const CARDW = 460, GAPX = 140, GAPY = 36;
  const COLORS = ['#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b', '#14b8a6', '#ec4899', '#f97316', '#6366f1'];
  const $ = s => document.querySelector(s);
  const vpEl = $('#vp'), worldEl = $('#world'), linksEl = $('#links'), cardsEl = $('#cards');

  let S, calc, hist;

  function fromSample() {
    const s = JSON.parse(JSON.stringify(NL.SAMPLE));
    Object.entries(s.asm).forEach(([id, a], i) => {
      a.color = id === s.root ? '#0f766e' : COLORS[(i - 1) % COLORS.length];
      a.steps = a.steps || []; a.notes = a.notes || ''; a.x = 0; a.y = 0;
    });
    return s;
  }
  const A = id => S.asm[id];
  const subIdOf = ref => ref.startsWith('asm:') ? ref.slice(4) : null;
  const parentsOf = id => Object.entries(S.asm).flatMap(([pid, a]) => a.items.filter(it => it.ref === 'asm:' + id).map(it => ({ pid, amount: it.amount })));
  function descendants(id, acc = new Set()) {
    for (const it of A(id).items) { const s = subIdOf(it.ref); if (s && A(s) && !acc.has(s)) { acc.add(s); descendants(s, acc); } }
    return acc;
  }
  const wouldCycle = (parent, child) => parent === child || descendants(child).has(parent);

  // ---------- rendering ----------
  function render() {
    calc = NL.calc(S);
    cardsEl.innerHTML = Object.keys(S.asm).map(cardHTML).join('');
    drawLinks();
    drawTree();
    drawNut();
    $('#recipeTitle').textContent = A(S.root).name;
    wb.live(S);
  }
  const renderKeep = () => NL.keepFocus(render);

  function cardHTML(id) {
    const a = A(id), c = calc[id], isRoot = id === S.root;
    const parents = parentsOf(id);
    const kicker = isRoot ? 'Final recipe · per portion'
      : parents.length ? 'Sub-recipe · used in ' + parents.map(p => `<a data-goto="${p.pid}">${NL.esc(A(p.pid).name)}</a> (${p.amount} g)`).join(', ')
        : 'Sub-recipe · not used yet. Drag the ● on the left onto a recipe to link it';
    const rows = a.items.map((it, idx) => {
      const sid = subIdOf(it.ref);
      const pct = `<td class="r pc">${NL.pct(+it.amount || 0, c.batch)}</td>`;
      const amt = `<td class="r w"><input class="num" inputmode="decimal" data-fk="amt-${id}-${idx}" data-amt="${id}:${idx}" value="${it.amount}"><span class="u">g</span></td>`;
      const del = `<td class="x"><button class="rc-del" data-delrow="${id}:${idx}" title="Remove">×</button></td>`;
      if (sid && A(sid)) {
        return `<tr class="sub" data-sub="${sid}" style="--rc:${A(sid).color}"><td><span class="rc-sublink" data-goto="${sid}">${NL.esc(A(sid).name)}</span><span class="rc-see" data-goto="${sid}">see recipe →</span></td>${amt}${pct}${del}</tr>`;
      }
      const ing = NL.ingMap[it.ref.slice(4)];
      return `<tr><td>${NL.esc(ing?.name || it.ref)}<span class="rc-vendor">${NL.esc(ing?.vendor || '')}</span></td>${amt}${pct}${del}</tr>`;
    }).join('') || `<tr class="rc-empty"><td colspan="4">No ingredients yet — use the buttons below or drag from the library</td></tr>`;
    const kcal = Math.round(c.perG[0] * (isRoot ? c.yielded : 100));
    return `<div class="rcard ${isRoot ? 'final' : ''} ${a.collapsed ? 'rc-collapsed' : ''} ${!isRoot && !parents.length ? 'orphan' : ''}" data-id="${id}" style="left:${a.x}px;top:${a.y}px;--c:${a.color}">
      ${isRoot ? '' : `<span class="port" data-port="${id}" title="Drag onto the recipe that uses this card"></span>`}
      <div class="rc-top" data-drag>
        <div class="rc-kicker">${kicker}</div>
        <div class="rc-titlebar">
          <input class="rc-title" data-fk="title-${id}" data-title="${id}" value="${NL.esc(a.name)}">
          <button class="rc-ib" data-collapse="${id}" title="${a.collapsed ? 'Expand' : 'Collapse'}">${a.collapsed ? '▸' : '▾'}</button>
          ${isRoot ? '' : `<button class="rc-ib del" data-delcard="${id}" title="Delete sub-recipe">🗑</button>`}
        </div>
        <div class="rc-stats">
          <div><b>${NL.fmt(c.batch)} g</b><span>${isRoot ? 'Portion' : 'Batch'}</span></div>
          <div><b>${NL.fmt(c.yielded)} g</b><span>Yield</span></div>
          <div><b>${+a.yieldLoss || 0}% / ${NL.yieldPct(a.yieldLoss)}%</b><span>Loss / Yield</span></div>
          <div><b>${kcal}</b><span>${isRoot ? 'kcal / portion' : 'kcal / 100 g'}</span></div>
        </div>
      </div>
      <div class="rc-body">
        <table class="rc-tbl"><thead><tr><th>Ingredient</th><th class="r">Weight</th><th class="r">%</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        <div class="rc-add">
          <button data-addi="${id}">+ Ingredient</button>
          <button class="s" data-adds="${id}">＋ New sub-recipe</button>
          <button class="s" data-addl="${id}">↳ Link existing sub-recipe</button>
        </div>
        ${isRoot && !a.items.length ? `<div class="rc-sec guide"><b>Building from scratch</b><ol>
          <li>Name your recipe in the title above.</li>
          <li>Add raw ingredients with <b>+ Ingredient</b>, or drag them from the library onto this card.</li>
          <li>Need a component (a sauce, a broth)? Click <b>＋ New sub-recipe</b>. It opens its own linked card where you add its ingredients.</li>
          <li>Type the weight on each row. Batch, yield, % and nutrition update as you type.</li></ol></div>` : ''}
        <div class="rc-sec rc-yl">Yield loss <input class="num" inputmode="decimal" data-fk="yl-${id}" data-yl="${id}" value="${a.yieldLoss || 0}"> % <span class="rc-yp">Yield <input class="num" inputmode="decimal" data-fk="yp-${id}" data-yp="${id}" value="${NL.yieldPct(a.yieldLoss)}"> %</span></div>
        <div class="rc-sec">
          <div class="rc-h">Procedure <button class="rc-mini" data-addstep="${id}">+ Step</button></div>
          <ol class="rc-steps">${(a.steps || []).map((s, i) => `<li><input data-fk="st-${id}-${i}" data-step="${id}:${i}" value="${NL.esc(s)}" placeholder="Describe this step…"><button class="rc-del" data-delstep="${id}:${i}">×</button></li>`).join('')}</ol>
        </div>
        <div class="rc-sec">
          <div class="rc-h">Notes · heating · tasting</div>
          <textarea class="rc-notes" data-fk="nt-${id}" data-notes="${id}" placeholder="Add notes…">${NL.esc(a.notes || '')}</textarea>
        </div>
      </div>
    </div>`;
  }

  function drawLinks() {
    let out = '';
    for (const [pid, a] of Object.entries(S.asm)) {
      const pEl = cardsEl.querySelector(`[data-id="${pid}"]`); if (!pEl) continue;
      const pr = pEl.getBoundingClientRect(), s = pr.width / pEl.offsetWidth || 1; // actual on-screen scale
      a.items.forEach(it => {
        const sid = subIdOf(it.ref); if (!sid || !A(sid)) return;
        const row = pEl.querySelector(`tr[data-sub="${sid}"]`);
        const rr = row && !a.collapsed ? row.getBoundingClientRect() : null;
        const x1 = a.x + pr.width / s, y1 = a.y + (rr ? (rr.top - pr.top + rr.height / 2) / s : 34);
        const ch = A(sid), x2 = ch.x, y2 = ch.y + 30;
        const dx = Math.max(60, Math.abs(x2 - x1) / 2);
        const back = x2 < x1; // child sits to the left: loop around
        const d = back
          ? `M${x1},${y1} C${x1 + 80},${y1} ${x2 - 80},${y2} ${x2},${y2}`
          : `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
        out += `<path class="link" d="${d}" stroke="${ch.color}"/><circle class="link-dot" cx="${x1}" cy="${y1}" r="5" fill="${ch.color}"/><circle class="link-dot" cx="${x2}" cy="${y2}" r="5" fill="${ch.color}"/>`;
      });
    }
    linksEl.innerHTML = out;
  }

  function drawTree() {
    const seen = new Set();
    const item = (id, depth) => {
      const a = A(id); seen.add(id);
      const nIng = a.items.filter(it => it.ref.startsWith('ing:')).length;
      const kids = a.items.map(it => subIdOf(it.ref)).filter(s => s && A(s));
      return `<div class="tr-item ${id === S.root ? 'root' : ''}" style="padding-left:${6 + depth * 14}px" data-goto="${id}">
        <span class="sw" style="background:${a.color}"></span><span class="nm">${NL.esc(a.name)}</span><span class="faint">${nIng} ing</span></div>` +
        (depth < 12 ? kids.map(k => item(k, depth + 1)).join('') : '');
    };
    let html = item(S.root, 0);
    const orphans = Object.keys(S.asm).filter(id => !seen.has(id));
    if (orphans.length) html += `<div class="tr-sep">Not used in the recipe</div>` + orphans.map(id => item(id, 0)).join('');
    $('#tree').innerHTML = html;
  }
  function drawNut() {
    const nut = $('#nut');
    if (!$('#cmain').classList.contains('show-nut')) { nut.innerHTML = ''; return; }
    nut.innerHTML = `<h3>${NL.esc(A(S.root).name)}</h3>${NL.labelHTML(S, calc, S.root)}`;
  }
  function drawLib() {
    const q = $('#libSearch').value.trim().toLowerCase();
    $('#lib').innerHTML = NL.CATEGORIES.map(cat => {
      const items = NL.INGREDIENTS.filter(i => i.cat === cat && (!q || i.name.toLowerCase().includes(q)));
      if (!items.length) return '';
      return `<div class="lib-cat"><i style="background:${NL.CAT_COLORS[cat]}"></i>${cat}</div>` +
        items.map(i => `<div class="lib-item" draggable="true" data-ing="${i.id}"><span>${NL.esc(i.name)}</span><span class="faint">${Math.round(i.n[0])} kcal</span></div>`).join('');
    }).join('');
  }

  // ---------- layout ----------
  function heights() {
    const h = {};
    cardsEl.querySelectorAll('.rcard').forEach(el => { h[el.dataset.id] = el.offsetHeight; });
    return h;
  }
  function arrange() {
    render();
    const H = heights(), placed = new Set(), colBottom = [];
    const place = (id, d, desired) => {
      if (placed.has(id)) return; placed.add(id);
      const a = A(id);
      a.x = d * (CARDW + GAPX) + (id === S.root ? -20 : 0);
      a.y = Math.max(desired, (colBottom[d] ?? -Infinity) + GAPY);
      colBottom[d] = a.y + H[id];
      // rows are ~34px; place each child next to the row that references it
      a.items.forEach((it, idx) => {
        const s = subIdOf(it.ref);
        if (s && A(s)) place(s, d + 1, a.y + 150 + idx * 34 - 30);
      });
    };
    place(S.root, 0, 0);
    let y = Math.max(0, ...colBottom.filter(v => v != null)) + 80;
    for (const id of Object.keys(S.asm)) if (!placed.has(id)) { A(id).x = CARDW + GAPX; A(id).y = y; y += H[id] + GAPY; }
    render();
  }
  function bounds() {
    const H = heights(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [id, a] of Object.entries(S.asm)) { x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x + CARDW + 20); y1 = Math.max(y1, a.y + (H[id] || 300)); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function goto(id) {
    const a = A(id), el = cardsEl.querySelector(`[data-id="${id}"]`); if (!a || !el) return;
    vp.centerOn(a.x + CARDW / 2, a.y + Math.min(el.offsetHeight, 500) / 2, Math.max(vp.v.s, 0.7));
    setTimeout(() => { const e2 = cardsEl.querySelector(`[data-id="${id}"]`); e2?.classList.remove('flash'); void e2?.offsetWidth; e2?.classList.add('flash'); }, 150);
  }

  // ---------- mutations ----------
  const commit = () => hist.commit();
  function addItem(id, value, { focus = true } = {}) {
    const a = A(id);
    if (value === 'new-sub') return newSub(id);
    if (value.startsWith('asm:') && wouldCycle(id, value.slice(4))) return NL.toast('That would create a loop');
    if (value.startsWith('asm:') && a.items.some(it => it.ref === value)) return NL.toast('Already linked');
    a.items.push({ ref: value, amount: 0 });
    render(); commit();
    if (focus) focusAmt(id, a.items.length - 1);
  }
  function focusAmt(id, idx) { const i = cardsEl.querySelector(`[data-amt="${id}:${idx}"]`); if (i) { i.focus(); i.select(); } }
  function newSub(pid) {
    const p = A(pid), nid = NL.uid('s');
    const used = new Set(Object.values(S.asm).map(a => a.color));
    const color = COLORS.find(c => !used.has(c)) || COLORS[Object.keys(S.asm).length % COLORS.length];
    const el = cardsEl.querySelector(`[data-id="${pid}"]`);
    S.asm[nid] = { name: 'New sub-recipe', items: [], yieldLoss: 0, steps: [], notes: '', color, x: p.x + CARDW + GAPX, y: p.y + (el ? el.offsetHeight : 200) - 120 };
    // avoid landing on top of another card
    const H = heights();
    for (let k = 0; k < 30; k++) {
      const n = S.asm[nid];
      const hit = Object.entries(S.asm).find(([id, a]) => id !== nid && Math.abs(a.x - n.x) < CARDW && n.y < a.y + (H[id] || 300) && n.y + 300 > a.y);
      if (!hit) break; n.y = hit[1].y + (H[hit[0]] || 300) + GAPY;
    }
    p.items.push({ ref: 'asm:' + nid, amount: 0 });
    render(); commit();
    goto(nid);
    setTimeout(() => { const t = cardsEl.querySelector(`[data-title="${nid}"]`); t?.focus(); t?.select(); }, 330);
    NL.toast('Name the sub-recipe, then set its weight in "' + p.name + '"');
  }
  function addCard() {
    const nid = NL.uid('s'), used = new Set(Object.values(S.asm).map(a => a.color));
    const color = COLORS.find(c => !used.has(c)) || COLORS[Object.keys(S.asm).length % COLORS.length];
    const r = vpEl.getBoundingClientRect(), c = vp.toWorld(r.left + r.width / 2, r.top + r.height / 3);
    S.asm[nid] = { name: 'New card', items: [], yieldLoss: 0, steps: [], notes: '', color, x: Math.round(c.x - CARDW / 2), y: Math.round(c.y - 60) };
    const H = heights();
    for (let k = 0; k < 30; k++) {
      const n = S.asm[nid];
      const hit = Object.entries(S.asm).find(([id, a]) => id !== nid && Math.abs(a.x - n.x) < CARDW && n.y < a.y + (H[id] || 300) && n.y + 300 > a.y);
      if (!hit) break; n.x = hit[1].x + CARDW + 40;
    }
    render(); commit(); goto(nid);
    setTimeout(() => { const t = cardsEl.querySelector(`[data-title="${nid}"]`); t?.focus(); t?.select(); }, 330);
    NL.toast('Card added. Drag its ● onto the recipe that uses it, or add it later with + Ingredient');
  }
  function linkCard(child, parent) {
    if (A(parent).items.some(it => it.ref === 'asm:' + child)) return NL.toast('Already linked');
    if (wouldCycle(parent, child)) return NL.toast('That would create a loop');
    addItem(parent, 'asm:' + child);
    NL.toast(`Linked. Set how many grams of "${A(child).name}" go into "${A(parent).name}"`);
  }
  function deleteCard(id) {
    const ps = parentsOf(id);
    if (!confirm(`Delete "${A(id).name}"?${ps.length ? `\nIt will be removed from: ${ps.map(p => A(p.pid).name).join(', ')}` : ''}`)) return;
    delete S.asm[id];
    for (const a of Object.values(S.asm)) a.items = a.items.filter(it => it.ref !== 'asm:' + id);
    render(); commit();
  }
  function openPicker(id, anchor, mode) {
    const r = anchor.getBoundingClientRect();
    const subs = Object.entries(S.asm).filter(([sid]) => sid !== S.root && !wouldCycle(id, sid) && !A(id).items.some(it => it.ref === 'asm:' + sid))
      .map(([sid, a]) => ({ value: 'asm:' + sid, label: a.name, color: a.color, sub: 'sub-recipe' }));
    const groups = mode === 'link'
      ? [{ label: 'Existing sub-recipes', items: subs }, { label: 'Create', items: [{ value: 'new-sub', label: '＋ New sub-recipe', color: '#7c5cff', always: true }] }]
      : [{ label: 'Sub-recipes', items: subs }, ...NL.ingredientGroups()];
    NL.picker({ x: r.left, y: r.bottom + 4, groups, placeholder: mode === 'link' ? 'Search sub-recipes…' : 'Search ingredients…', onPick: v => addItem(id, v) });
  }

  // ---------- interactions ----------
  const vp = NL.viewport(vpEl, worldEl, {
    isBackground: t => t === vpEl || t === worldEl || t === cardsEl || t === linksEl,
    onChange: v => { $('#zl').textContent = Math.round(v.s * 100) + '%'; },
  });

  cardsEl.addEventListener('pointerdown', e => {
    const port = e.target.closest('[data-port]');
    if (port && e.button === 0) {
      const id = port.dataset.port, a = A(id);
      return NL.connectDrag({ e, vp, linksEl, from: { x: a.x, y: a.y + 30 }, color: a.color, targetSel: '.rcard', selfEl: port.closest('.rcard'), onDrop: t => linkCard(id, t.dataset.id) });
    }
    const top = e.target.closest('[data-drag]'); if (!top || e.button !== 0) return;
    if (e.target.closest('input,button,textarea,a')) return;
    e.preventDefault();
    const el = top.closest('.rcard'), id = el.dataset.id, a = A(id);
    const st = vp.toWorld(e.clientX, e.clientY), ox = a.x, oy = a.y; let moved = false;
    const mv = ev => {
      const p = vp.toWorld(ev.clientX, ev.clientY);
      if (!moved && Math.hypot(p.x - st.x, p.y - st.y) < 3) return;
      moved = true; a.x = ox + p.x - st.x; a.y = oy + p.y - st.y;
      el.style.left = a.x + 'px'; el.style.top = a.y + 'px'; drawLinks();
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) commit(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });

  document.addEventListener('input', e => {
    const d = e.target.dataset; if (!d) return;
    if (d.amt) { const [id, i] = d.amt.split(':'); A(id).items[+i].amount = e.target.value === '' ? 0 : +e.target.value || 0; renderKeep(); }
    else if (d.title) { A(d.title).name = e.target.value; renderKeep(); }
    else if (d.yl) { A(d.yl).yieldLoss = +e.target.value || 0; renderKeep(); }
    else if (d.yp) { if (e.target.value !== '') { A(d.yp).yieldLoss = NL.lossFromYield(e.target.value); renderKeep(); } }
    else if (d.step) { const [id, i] = d.step.split(':'); A(id).steps[+i] = e.target.value; }
    else if (d.notes) { A(d.notes).notes = e.target.value; }
  });
  // inputs are re-rendered while typing, so 'change' never fires: commit shortly after typing stops, and on blur
  const isField = d => d && (d.amt || d.title || d.yl || d.yp || d.step || d.notes);
  let typingT;
  document.addEventListener('input', e => { if (isField(e.target.dataset)) { clearTimeout(typingT); typingT = setTimeout(commit, 600); } });
  document.addEventListener('focusout', e => { if (isField(e.target.dataset)) commit(); });
  document.addEventListener('keydown', e => {
    const d = e.target.dataset;
    if (e.key === 'Enter' && d && (d.amt || d.title || d.yl || d.yp)) e.target.blur();
    if (e.key === 'Enter' && d?.step) { const [id, i] = d.step.split(':'); A(id).steps.splice(+i + 1, 0, ''); render(); commit(); cardsEl.querySelector(`[data-step="${id}:${+i + 1}"]`)?.focus(); }
  });

  document.addEventListener('click', e => {
    const t = e.target, q = s => t.closest(s);
    let b;
    if ((b = q('[data-goto]'))) return goto(b.dataset.goto);
    if ((b = q('[data-delrow]'))) { const [id, i] = b.dataset.delrow.split(':'); A(id).items.splice(+i, 1); render(); commit(); return; }
    if ((b = q('[data-addi]'))) return openPicker(b.dataset.addi, b, 'ing');
    if ((b = q('[data-addl]'))) return openPicker(b.dataset.addl, b, 'link');
    if ((b = q('[data-adds]'))) return newSub(b.dataset.adds);
    if ((b = q('[data-delcard]'))) return deleteCard(b.dataset.delcard);
    if ((b = q('[data-collapse]'))) { const a = A(b.dataset.collapse); a.collapsed = !a.collapsed; render(); commit(); return; }
    if ((b = q('[data-addstep]'))) { const a = A(b.dataset.addstep); a.steps.push(''); render(); commit(); cardsEl.querySelector(`[data-step="${b.dataset.addstep}:${a.steps.length - 1}"]`)?.focus(); return; }
    if ((b = q('[data-delstep]'))) { const [id, i] = b.dataset.delstep.split(':'); A(id).steps.splice(+i, 1); render(); commit(); }
  });

  // library drag → card
  $('#libSearch').addEventListener('input', drawLib);
  $('#lib').addEventListener('dragstart', e => { const it = e.target.closest('.lib-item'); if (it) { e.dataTransfer.setData('text/plain', 'ing:' + it.dataset.ing); e.dataTransfer.effectAllowed = 'copy'; } });
  vpEl.addEventListener('dragover', e => {
    e.preventDefault();
    const c = e.target.closest?.('.rcard');
    cardsEl.querySelectorAll('.drop').forEach(x => x !== c && x.classList.remove('drop'));
    c?.classList.add('drop');
  });
  vpEl.addEventListener('drop', e => {
    e.preventDefault();
    cardsEl.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    const v = e.dataTransfer.getData('text/plain'), c = e.target.closest?.('.rcard');
    if (!v) return;
    if (!c) return NL.toast('Drop the ingredient onto a recipe card');
    addItem(c.dataset.id, v);
  });

  document.addEventListener('keydown', e => {
    if (NL.isTyping()) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); hist.redo(); }
    else if (e.key === 'f' || e.key === 'F') vp.fit(bounds());
  });

  $('#undo').onclick = () => hist.undo();
  $('#redo').onclick = () => hist.redo();
  $('#fit').onclick = () => vp.fit(bounds());
  $('#arrange').onclick = () => { arrange(); commit(); vp.fit(bounds()); };
  $('#zin').onclick = () => vp.zoom(1.2);
  $('#zout').onclick = () => vp.zoom(1 / 1.2);
  $('#toggleNut').onclick = () => {
    const m = $('#cmain'); m.classList.toggle('show-nut');
    $('#toggleNut').textContent = m.classList.contains('show-nut') ? 'Nutrition ◂' : 'Nutrition ▸';
    drawNut(); setTimeout(drawLinks, 220);
  };
  $('#newVer').onclick = async () => {
    const v = await NL.prompt('Version name (shown on the tab):', nameOf(S) + ' v' + (wb.count() + 1));
    if (!v) return;
    wb.add(JSON.parse(JSON.stringify(S)), v);
    NL.toast('Version "' + v + '" created');
  };
  $('#newRecipe').onclick = () => newRecipe();
  $('#addCard').onclick = () => addCard();
  $('#newIng').onclick = async () => { const i = await NL.ingredientForm(); if (i) NL.toast(`"${i.name}" added. Drag it from the list.`); };
  document.addEventListener('nl:ingredients', drawLib);

  // ---------- recipes as tabs (workbook) ----------
  const nameOf = st => st.asm[st.root]?.name;
  const blank = () => ({ root: 'final', asm: { final: { name: 'Untitled recipe ' + (wb.count() + 1), kind: 'final', items: [], yieldLoss: 0, steps: [], notes: '', color: '#0f766e', x: 0, y: 0 } } });
  const sample = () => Object.assign(fromSample(), { _arrange: true });
  function newRecipe() { wb.add(blank()); }
  window.NL_resetSample = () => { wb.add(sample()); NL.toast('Sample recipe opened in a new tab'); };

  function openState(state) {
    S = state;
    const needsArrange = S._arrange; delete S._arrange;
    hist = NL.history(() => wb.save(S), () => S, s => { S = s; render(); });
    if (needsArrange) { arrange(); wb.save(S); } else render();
    const empty = Object.keys(S.asm).length === 1 && !A(S.root).items.length;
    if (empty) {
      const a = A(S.root); vp.v.s = 1; vp.v.x = 40 - a.x; vp.v.y = 30 - a.y; vp.apply();
      const t = cardsEl.querySelector(`[data-title="${S.root}"]`); t.focus(); t.select();
    } else vp.fit(bounds(), 40, { min: 0.8, align: 'left' });
  }

  // ---------- boot ----------
  const wb = NL.workbook({
    key: 'nlv2_cards_book',
    sample, nameOf,
    beforeSwitch: () => { clearTimeout(typingT); commit(); },
    onSwitch: openState,
    onNew: newRecipe,
  });
  drawLib();
  openState(wb.current());
})();
