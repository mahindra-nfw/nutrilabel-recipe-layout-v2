// NutriLabel recipe builder — recipe cards (Modernist Cuisine style) linked like a flow.
// The final recipe is the main card; every sub-recipe row links to its own card.
(function () {
  const CARDW = 540, GAPX = 140, GAPY = 36;
  const COLORS = ['#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b', '#14b8a6', '#ec4899', '#f97316', '#6366f1'];
  const $ = s => document.querySelector(s);
  const vpEl = $('#vp'), worldEl = $('#world'), linksEl = $('#links'), boardCardsEl = $('#cards');
  const svEl = $('#sheetView'), svInnerEl = $('#svInner'), svCardsEl = $('#svCards'), svLinksEl = $('#svLinks');
  let cardsEl = boardCardsEl, view = 'board', orderIdx = {}, depthMap = {}; // view: 'board' (canvas) or 'sheet' (stacked)

  let S, calc, hist;
  const fwErr = {}; // card id -> message while the typed final weight is invalid
  const amtErr = {}; // 'card:row' -> message while a typed ingredient weight is invalid
  const fwStart = {}; // card id -> yieldLoss when editing began, restored if the entry is invalid

  function fromSample() {
    const s = JSON.parse(JSON.stringify(NL.SAMPLE));
    Object.entries(s.asm).forEach(([id, a], i) => {
      a.color = id === s.root ? '#0f766e' : COLORS[(i - 1) % COLORS.length];
      a.steps = a.steps || []; a.notes = a.notes || ''; a.x = 0; a.y = 0;
    });
    return s;
  }
  const A = id => S.asm[id];
  const ROOT_COLOR = '#0f766e';
  // The final card is optional: S.root is null until the chef marks a card as Final.
  const colorOf = id => id === S.root ? ROOT_COLOR : (A(id)?.color || '#94a3b8');
  const hasFinal = () => !!(S.root && A(S.root));
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
    if (view === 'sheet') {
      const ord = sheetOrder(); orderIdx = Object.fromEntries(ord.map((id, k) => [id, k])); depthMap = depths();
      cardsEl.innerHTML = ord.length ? ord.map(cardHTML).join('') : SHEET_EMPTY;
    } else cardsEl.innerHTML = Object.keys(S.asm).map(cardHTML).join('');
    drawLinks();
    drawTree();
    drawNut();
    $('#recipeTitle').textContent = hasFinal() ? A(S.root).name : (S.draftName || 'Untitled recipe');
    $('#emptyHint').hidden = Object.keys(S.asm).length > 0;
    wb.live(S);
  }
  const renderKeep = () => NL.keepFocus(render);

  function cardHTML(id) {
    const a = A(id), c = calc[id], isRoot = id === S.root;
    const parents = parentsOf(id);
    const kind = `<div class="rc-kind" title="Is this the final recipe or a sub-recipe?"><button class="${isRoot ? 'on' : ''}" data-kind="final:${id}">Final</button><button class="${isRoot ? '' : 'on'}" data-kind="sub:${id}">Sub-recipe</button></div>`;
    const kicker = isRoot ? 'Final recipe · per portion'
      : parents.length ? 'Sub-recipe · used in ' + parents.map(p => `<a data-goto="${p.pid}">${NL.esc(A(p.pid).name)}</a> (${p.amount} g)`).join(', ')
        : 'Sub-recipe · not used yet. ' + (view === 'sheet' ? 'Link it from the card that uses it with ↳ Link existing sub-recipe' : 'Drag the ● on the left onto a recipe to link it');
    const bset = baseSet(a), baseAmt = baseTotal(a), bname = baseLabel(a, bset);
    const rows = a.items.map((it, idx) => {
      const sid = subIdOf(it.ref);
      const inBase = bset.includes(idx), bpct = baseAmt > 0 ? +((+it.amount || 0) / baseAmt * 100).toFixed(2) : null;
      const bbtn = `<button class="bk-b ${inBase ? 'on' : ''}" data-togbase="${id}:${idx}" title="${inBase ? 'Part of the base. Click to remove it from the base' : 'Click to add this ingredient to the base (100%)'}">B</button>`;
      const bk = inBase
        ? `<td class="r bk base"><span class="bk-base" title="Share of the base (${NL.esc(bname)})">${bpct == null ? '—' : NL.fmt(bpct, 2) + '%'}</span>${bbtn}</td>`
        : `<td class="r bk"><span class="bk-in"><input class="num" inputmode="decimal" data-fk="bk-${id}-${idx}" data-bk="${id}:${idx}" value="${bpct ?? ''}" ${baseAmt > 0 ? 'title="Baker %: type a % to set this weight from the base"' : `disabled placeholder="—" title="${bset.length ? 'The base has no weight yet' : 'Press B on an ingredient to choose the base'}"`}>%</span>${bbtn}</td>`;
      const pct = `<td class="r pc">${NL.pct(+it.amount || 0, c.batch)}</td>${bk}`;
      const aerr = amtErr[`${id}:${idx}`];
      const amt = `<td class="r w"><input class="num ${aerr ? 'bad' : ''}" inputmode="decimal" data-fk="amt-${id}-${idx}" data-amt="${id}:${idx}" value="${it.amount}" ${aerr ? `title="${NL.esc(aerr)}"` : ''}><span class="u">g</span></td>`;
      const del = `<td class="x"><button class="rc-del" data-delrow="${id}:${idx}" title="Remove">×</button></td>`;
      if (sid && A(sid)) {
        return `<tr class="sub" data-sub="${sid}" style="--rc:${colorOf(sid)}"><td><span class="rc-sublink" data-goto="${sid}">${NL.esc(A(sid).name)}</span><span class="rc-see" data-goto="${sid}">see recipe ${view === 'sheet' ? (orderIdx[sid] > orderIdx[id] ? '↓' : '↑') : '→'}</span></td>${amt}${pct}${del}</tr>`;
      }
      const ing = NL.ingMap[it.ref.slice(4)];
      return `<tr><td>${NL.esc(ing?.name || it.ref)}<span class="rc-vendor">${NL.esc(ing?.vendor || '')}</span></td>${amt}${pct}${del}</tr>`;
    }).join('') || `<tr class="rc-empty"><td colspan="5">No ingredients yet — use the buttons below or drag from the library</td></tr>`;
    const kcal = Math.round(c.perG[0] * (isRoot ? c.yielded : 100));
    return `<div class="rcard ${isRoot ? 'final' : ''} ${a.collapsed ? 'rc-collapsed' : ''} ${!isRoot && !parents.length ? 'orphan' : ''}" data-id="${id}" style="${view === 'sheet' ? `--depth:${depthMap[id] || 0};` : `left:${a.x}px;top:${a.y}px;`}--c:${colorOf(id)}">
      ${isRoot ? '' : `<span class="port" data-port="${id}" title="Drag onto the recipe that uses this card"></span>`}
      <div class="rc-top" data-drag>
        <div class="rc-kick-row"><div class="rc-kicker">${kicker}</div>${kind}</div>
        <div class="rc-titlebar">
          <span class="sv-grip" data-grip="${id}" title="Drag to move this card up or down">⠿</span>
          <input class="rc-title" data-fk="title-${id}" data-title="${id}" value="${NL.esc(a.name)}">
          <button class="rc-ib sv-only" data-move="${id}:-1" title="Move card up">↑</button><button class="rc-ib sv-only" data-move="${id}:1" title="Move card down">↓</button>
          <button class="rc-ib" data-collapse="${id}" title="${a.collapsed ? 'Expand' : 'Collapse'}">${a.collapsed ? '▸' : '▾'}</button>
          <button class="rc-ib" data-copycard="${id}" title="Copy this card${descendants(id).size ? ' (with its sub-recipe cards)' : ''}. Paste into any tab with 📋 Paste card or Ctrl+V">⧉</button>
          <button class="rc-ib del" data-delcard="${id}" title="Delete this card">🗑</button>
        </div>
        <div class="rc-stats">
          <div><b>${NL.fmt(c.batch)} g</b><span>${isRoot ? 'Portion' : 'Batch'}</span></div>
          <div><b>${NL.fmt(c.yielded)} g</b><span>Yield</span></div>
          <div><b>${NL.fmt(+a.yieldLoss || 0, 1)}% / ${NL.fmt(NL.yieldPct(a.yieldLoss), 1)}%</b><span>Loss / Yield</span></div>
          <div><b>${kcal}</b><span>${isRoot ? 'kcal / portion' : 'kcal / 100 g'}</span></div>
        </div>
      </div>
      <div class="rc-body">
        <table class="rc-tbl"><thead><tr><th>Ingredient</th><th class="r">Weight</th><th class="r">Relative %</th><th class="r" title="Baker's percentage: weight relative to the base ingredient (100%)">Baker %</th><th></th></tr></thead><tbody>${rows}</tbody>
          ${a.items.length ? `<tfoot>${bset.length > 1 || a.baseName ? `<tr class="rc-base"><td><span class="rc-base-nm" data-basename="${id}" title="Click to rename the base">${NL.esc(bname)}${a.baseName ? ' <small>(Base)</small>' : ''}</span></td><td class="r w">${NL.fmt(baseAmt, 2)}<span class="u">g</span></td><td class="r pc">${NL.pct(baseAmt, c.batch)}</td><td class="r bk">100%</td><td class="x"><button class="rc-del rc-base-x" data-delbase="${id}" title="Remove this base (clears its name and B marks)">×</button></td></tr>` : ''}<tr class="rc-tot"><td>Total</td><td class="r w">${NL.fmt(c.batch, 2)}<span class="u">g</span></td><td class="r pc">100%</td><td class="r bk" title="Total formula percentage">${baseAmt > 0 ? NL.fmt(c.batch / baseAmt * 100, 1) + '%' : `<span class="bk-hint">${bset.length ? 'base has no weight' : 'press B to pick a base'}</span>`}</td><td></td></tr></tfoot>` : ''}</table>
        ${c.batch > 0 ? `<div class="rc-bscale"><span class="rc-sc">Scale by yield <input class="num" inputmode="decimal" data-fk="ws-${id}" data-wscale="${id}" value="${+c.yielded.toFixed(2)}" title="Type the finished weight you need after cooking loss; the batch is calculated as yield ÷ (1 − loss %)"> g
            <span class="faint">${+a.yieldLoss ? `→ batch ${NL.fmt(c.batch, 2)} g at ${NL.fmt(+a.yieldLoss, 1)}% loss` : '(no cooking loss)'}</span></span>
          ${bset.length ? `<span class="rc-sc">Scale by base <b>${NL.esc(bname)}</b> <input class="num" inputmode="decimal" data-fk="bs-${id}" data-bscale="${id}" value="${+baseAmt.toFixed(2)}" title="Type the base weight you want; every Baker % is kept"> g</span>` : ''}
          <span class="faint">ratios and % stay the same</span></div>` : ''}
        <div class="rc-add">
          <button data-addi="${id}">+ Ingredient</button>
          <button data-basename="${id}" title="${a.baseName ? 'Rename the base' : 'Name the base (e.g. Total Flour), then press B on each ingredient that belongs to it'}">${a.baseName ? '✎ Rename base' : '+ Base'}</button>
          <button class="s" data-adds="${id}">＋ New sub-recipe</button>
          <button class="s" data-addl="${id}">↳ Link existing sub-recipe</button>
        </div>
        ${isRoot && !a.items.length ? `<div class="rc-sec guide"><b>Building from scratch</b><ol>
          <li>Name your recipe in the title above.</li>
          <li>Add raw ingredients with <b>+ Ingredient</b>, or drag them from the library onto this card.</li>
          <li>Need a component (a sauce, a broth)? Click <b>＋ New sub-recipe</b>. It opens its own linked card where you add its ingredients.</li>
          <li>Type the weight on each row. Batch, yield, % and nutrition update as you type.</li></ol></div>` : ''}
        <div class="rc-sec rc-fw ${fwErr[id] ? 'bad' : ''}">
          <label>${isRoot ? 'Final portion weight' : 'Final weight after cooking'} <input class="num" inputmode="decimal" data-fk="fw-${id}" data-fw="${id}" value="${+c.yielded.toFixed(1)}" placeholder="${+c.batch.toFixed(1)}"> g</label>
          <span class="rc-fw-res">from ${NL.fmt(c.batch)} g · <b>Yield ${NL.fmt(NL.yieldPct(a.yieldLoss), 1)}%</b> · Loss ${NL.fmt(+a.yieldLoss || 0, 1)}% (${NL.fmt(c.lossG)} g)</span>
          ${fwErr[id] ? `<div class="rc-fw-err">⚠ ${NL.esc(fwErr[id])}</div>` : ''}
        </div>
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
    if (view === 'sheet') return drawSheetLinks();
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
        const [c1, c2] = back ? [x1 + 80, x2 - 80] : [x1 + dx, x2 - dx];
        const d = `M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}`;
        const mx = (x1 + 3 * c1 + 3 * c2 + x2) / 8, my = (y1 + y2) / 2; // bezier point at t = 0.5
        const col = colorOf(sid);
        out += `<g class="lk" data-link="${pid}:${sid}"><path class="link" d="${d}" stroke="${col}"/><path class="link-hit" d="${d}"/><circle class="link-dot" cx="${x1}" cy="${y1}" r="5" fill="${col}"/><circle class="link-dot" cx="${x2}" cy="${y2}" r="5" fill="${col}"/>
          <g class="lk-cut" data-cut="${pid}:${sid}" transform="translate(${mx},${my})" style="--lc:${col}"><title>Remove link: ${NL.esc(A(sid).name)} → ${NL.esc(a.name)}</title><circle r="13"/><text y="1">✂</text></g></g>`;
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
        <span class="sw" style="background:${colorOf(id)}"></span><span class="nm">${NL.esc(a.name)}</span><span class="faint">${nIng} ing</span></div>` +
        (depth < 12 ? kids.map(k => item(k, depth + 1)).join('') : '');
    };
    let html = hasFinal() ? item(S.root, 0) : '', extra = '';
    // unlinked cards: list top-level ones first (their sub-recipes nest under them), then anything left
    for (const id of Object.keys(S.asm)) if (!seen.has(id) && !parentsOf(id).length) extra += item(id, 0);
    for (const id of Object.keys(S.asm)) if (!seen.has(id)) extra += item(id, 0);
    if (extra) html += `<div class="tr-sep">${hasFinal() ? 'Not used in the recipe' : 'No final card yet. Use the Final toggle on a card'}</div>` + extra;
    if (!html) html = '<div class="tr-sep">No cards yet</div>';
    $('#tree').innerHTML = html;
  }
  function drawNut() {
    const nut = $('#nut');
    if (!$('#cmain').classList.contains('show-nut')) { nut.innerHTML = ''; return; }
    nut.innerHTML = hasFinal() ? `<h3>${NL.esc(A(S.root).name)}</h3>${NL.labelHTML(S, calc, S.root)}` : '<div class="nut-empty">Mark a card as <b>Final</b> to see its nutrition label.</div>';
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
    if (view === 'sheet') { S._arrange = true; return render(); } // board layout is done when the board is shown
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
    if (hasFinal()) place(S.root, 0, 0);
    else for (const id of Object.keys(S.asm)) if (!parentsOf(id).length) place(id, 0, 0);
    let y = Math.max(0, ...colBottom.filter(v => v != null)) + 80;
    for (const id of Object.keys(S.asm)) if (!placed.has(id)) { A(id).x = CARDW + GAPX; A(id).y = y; y += H[id] + GAPY; }
    render();
  }
  function bounds() {
    if (!Object.keys(S.asm).length) return { x: 0, y: 0, w: 900, h: 600 };
    const H = heights(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [id, a] of Object.entries(S.asm)) { x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x + CARDW + 20); y1 = Math.max(y1, a.y + (H[id] || 300)); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function goto(id) {
    const a = A(id), el = cardsEl.querySelector(`[data-id="${id}"]`); if (!a || !el) return;
    if (view === 'sheet') el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else vp.centerOn(a.x + CARDW / 2, a.y + Math.min(el.offsetHeight, 500) / 2, Math.max(vp.v.s, 0.7));
    setTimeout(() => { const e2 = cardsEl.querySelector(`[data-id="${id}"]`); e2?.classList.remove('flash'); void e2?.offsetWidth; e2?.classList.add('flash'); }, 150);
  }

  // ---------- sheet view: the same cards stacked top to bottom, in an order the chef sets ----------
  const SHEET_EMPTY = `<div class="empty-hint sv-empty"><b>Blank recipe</b><span>Start with any card: a sub-recipe (a sauce, a broth) or the final dish. Use the <i>Final / Sub-recipe</i> switch on each card. Cards stack top to bottom; drag ⠿ to reorder.</span><button class="btn primary" data-emptyadd>＋ Add card</button></div>`;
  const PREFS = 'nlv2_sheet_prefs';
  const prefs = { links: 'jump', width: 'full' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS)) || {}); } catch { }
  function applyPrefs() {
    svEl.className = `sheetview lk-${prefs.links} w-${prefs.width}`;
    svEl.querySelectorAll('[data-svlinks]').forEach(b => b.classList.toggle('on', b.dataset.svlinks === prefs.links));
    svEl.querySelectorAll('[data-svwidth]').forEach(b => b.classList.toggle('on', b.dataset.svwidth === prefs.width));
  }
  function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { } applyPrefs(); }
  applyPrefs();

  // saved order first, then any new cards; with no saved order, final recipe then its sub-recipes depth-first
  function sheetOrder() {
    const ids = Object.keys(S.asm), have = new Set(ids), out = [], seen = new Set();
    const push = id => { if (have.has(id) && !seen.has(id)) { seen.add(id); out.push(id); return true; } return false; };
    if (S.order) { S.order.forEach(push); ids.forEach(push); return out; }
    const walk = id => { if (!push(id)) return; for (const it of A(id).items) { const s = subIdOf(it.ref); if (s) walk(s); } };
    if (hasFinal()) walk(S.root);
    ids.filter(id => !parentsOf(id).length).forEach(walk);
    ids.forEach(walk);
    return out;
  }
  const ensureOrder = () => { S.order = sheetOrder(); };
  function depths() {
    const d = {}, q = Object.keys(S.asm).filter(id => id === S.root || !parentsOf(id).length).map(id => [id, 0]);
    while (q.length) {
      const [id, k] = q.shift(); if (d[id] != null && d[id] <= k) continue; d[id] = k;
      for (const it of A(id).items) { const s = subIdOf(it.ref); if (s && A(s)) q.push([s, k + 1]); }
    }
    return d;
  }
  function moveCard(id, dir) {
    ensureOrder();
    const i = S.order.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= S.order.length) return;
    [S.order[i], S.order[j]] = [S.order[j], S.order[i]];
    render(); commit();
    cardsEl.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function drawSheetLinks() {
    if (prefs.links !== 'lines') { svLinksEl.innerHTML = ''; return; }
    const box = svInnerEl.getBoundingClientRect(); let out = '', k = 0;
    for (const [pid, a] of Object.entries(S.asm)) {
      const pEl = svCardsEl.querySelector(`[data-id="${pid}"]`); if (!pEl) continue;
      const pr = pEl.getBoundingClientRect();
      for (const it of a.items) {
        const sid = subIdOf(it.ref), cEl = sid && A(sid) && svCardsEl.querySelector(`[data-id="${sid}"]`); if (!cEl) continue;
        const row = pEl.querySelector(`tr[data-sub="${sid}"]`), rr = row && !a.collapsed ? row.getBoundingClientRect() : null, cr = cEl.getBoundingClientRect();
        const x1 = pr.left - box.left, y1 = (rr ? rr.top + rr.height / 2 : pr.top + 34) - box.top;
        const x2 = cr.left - box.left, y2 = cr.top - box.top + 30;
        const g = 34 + (k++ % 4) * 14, c1 = x1 - g, c2 = x2 - g, col = colorOf(sid);
        const d = `M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}`, mx = (x1 + 3 * c1 + 3 * c2 + x2) / 8, my = (y1 + y2) / 2;
        out += `<g class="lk" data-link="${pid}:${sid}"><path class="link" d="${d}" stroke="${col}"/><path class="link-hit" d="${d}"/><circle class="link-dot" cx="${x1}" cy="${y1}" r="5" fill="${col}"/><circle class="link-dot" cx="${x2}" cy="${y2}" r="5" fill="${col}"/>
          <g class="lk-cut" data-cut="${pid}:${sid}" transform="translate(${mx},${my})" style="--lc:${col}"><title>Remove link: ${NL.esc(A(sid).name)} → ${NL.esc(a.name)}</title><circle r="13"/><text y="1">✂</text></g></g>`;
      }
    }
    svLinksEl.innerHTML = out;
  }
  new ResizeObserver(() => { if (view === 'sheet' && prefs.links === 'lines') drawSheetLinks(); }).observe(svCardsEl);
  // cards added while in the sheet get a free spot on the board the next time it is shown
  function placeNewCards() {
    const ids = Object.keys(S.asm).filter(id => A(id)._place); if (!ids.length) return false;
    const H = heights(), placed = Object.entries(S.asm).filter(([, a]) => !a._place);
    let right = placed.length ? Math.max(...placed.map(([, a]) => a.x + CARDW)) : -GAPX;
    for (const id of ids) {
      const n = A(id), p = parentsOf(id).map(x => A(x.pid)).find(a => !a._place);
      if (p) { n.x = p.x + CARDW + GAPX; n.y = p.y; } else { n.x = right + GAPX; n.y = 0; right = n.x + CARDW; }
      for (let t = 0; t < 40; t++) {
        const hit = Object.entries(S.asm).find(([oid, a]) => oid !== id && !a._place && Math.abs(a.x - n.x) < CARDW && n.y < a.y + (H[oid] || 300) && n.y + (H[id] || 300) > a.y);
        if (!hit) break; n.y = hit[1].y + (H[hit[0]] || 300) + GAPY;
      }
      delete n._place;
    }
    render(); return true;
  }
  function setView(v) {
    if (v === view) return;
    clearTimeout(typingT); commit(); NL.closePicker();
    view = v;
    document.body.classList.toggle('view-sheet', v === 'sheet');
    document.querySelectorAll('#viewSeg [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    boardCardsEl.innerHTML = ''; svCardsEl.innerHTML = ''; linksEl.innerHTML = ''; svLinksEl.innerHTML = '';
    cardsEl = v === 'sheet' ? svCardsEl : boardCardsEl;
    if (v === 'sheet') { render(); svEl.scrollTop = 0; return; }
    // board placement is saved without its own undo step, so undo keeps meaning "undo my last edit"
    if (S._arrange) { delete S._arrange; arrange(); wb.save(S); hist.sync(); vp.fit(bounds(), 40, { min: 0.8, align: 'left' }); }
    else { render(); if (placeNewCards()) { wb.save(S); hist.sync(); } }
  }
  // drag a card's ⠿ grip up or down
  svCardsEl.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-grip]'); if (!g || e.button !== 0) return;
    e.preventDefault();
    const id = g.dataset.grip, el = g.closest('.rcard');
    ensureOrder();
    const line = document.createElement('div'); line.className = 'sv-drop'; svInnerEl.appendChild(line);
    el.classList.add('sv-dragging');
    let to = null;
    const mv = ev => {
      const cards = [...svCardsEl.querySelectorAll('.rcard')], box = svInnerEl.getBoundingClientRect();
      let idx = cards.length;
      for (let k = 0; k < cards.length; k++) { const r = cards[k].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { idx = k; break; } }
      to = idx;
      const yy = cards[idx] ? cards[idx].getBoundingClientRect().top - 10 : cards[cards.length - 1].getBoundingClientRect().bottom + 8;
      line.style.top = (yy - box.top) + 'px';
      const sr = svEl.getBoundingClientRect();
      if (ev.clientY < sr.top + 60) svEl.scrollTop -= 16; else if (ev.clientY > sr.bottom - 60) svEl.scrollTop += 16;
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      line.remove(); el.classList.remove('sv-dragging');
      if (to == null) return;
      const from = S.order.indexOf(id); let t = to > from ? to - 1 : to;
      if (t === from) return;
      S.order.splice(from, 1); S.order.splice(t, 0, id);
      render(); commit();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    mv(e);
  });

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
  // Chefs enter the weighed final weight; yield loss is derived from it (only yieldLoss is stored).
  function setFinalWeight(id, raw) {
    const batch = calc[id].batch, v = raw.trim();
    if (v === '') { delete fwErr[id]; if (id in fwStart) A(id).yieldLoss = fwStart[id]; return; }
    const fw = NL.parseNum(v);
    let err = '';
    if (!isFinite(fw)) err = 'Enter a number in grams';
    else if (batch <= 0) err = 'Add ingredients with weights first';
    else if (fw <= 0) err = 'Final weight must be more than 0 g';
    else if (fw > batch + 1e-9) err = `Final weight (${NL.fmt(fw)} g) can't be more than the starting weight (${NL.fmt(batch)} g)`;
    if (err) { fwErr[id] = err; if (id in fwStart) A(id).yieldLoss = fwStart[id]; return; }
    delete fwErr[id];
    A(id).yieldLoss = (1 - fw / batch) * 100;
  }
  // Baker's math: the base item is the one flagged `base`, else the first item with a weight.
  // Baker's math: the base is every item the chef flagged with B (their weights add up to 100%).
  const baseSet = a => a.items.map((it, k) => it.base ? k : -1).filter(k => k >= 0);
  const baseTotal = a => baseSet(a).reduce((s, k) => s + (+a.items[k].amount || 0), 0);
  const baseLabel = (a, set = baseSet(a)) => a.baseName || (set.length === 1 ? itemName(a.items[set[0]]) : 'Total base');
  const itemName = it => { const s = subIdOf(it.ref); return s ? (A(s)?.name || s) : (NL.ingMap[it.ref.slice(4)]?.name || it.ref); };
  const round2 = v => Math.round(v * 100) / 100;
  const bscaleStart = {}; // card id -> amounts when scaling began, so each keystroke scales from the original
  function focusAmt(id, idx) { const i = cardsEl.querySelector(`[data-amt="${id}:${idx}"]`); if (i) { i.focus(); i.select(); } }
  function newSub(pid) {
    const p = A(pid), nid = NL.uid('s');
    const used = new Set(Object.values(S.asm).map(a => a.color));
    const color = COLORS.find(c => !used.has(c)) || COLORS[Object.keys(S.asm).length % COLORS.length];
    const el = cardsEl.querySelector(`[data-id="${pid}"]`);
    S.asm[nid] = { name: 'New sub-recipe', items: [], yieldLoss: 0, steps: [], notes: '', color, x: p.x + CARDW + GAPX, y: p.y + (el ? el.offsetHeight : 200) - 120 };
    if (view === 'sheet') { S.asm[nid]._place = true; if (S.order) S.order.splice(S.order.indexOf(pid) + 1, 0, nid); }
    // avoid landing on top of another card
    const H = view === 'sheet' ? null : heights();
    for (let k = 0; H && k < 30; k++) {
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
    S.asm[nid] = { name: 'New card', items: [], yieldLoss: 0, steps: [], notes: '', color, x: Math.round(c.x - CARDW / 2), y: Math.round(c.y - 60), ...(view === 'sheet' ? { _place: true } : {}) };
    const H = view === 'sheet' ? null : heights();
    for (let k = 0; H && k < 30; k++) {
      const n = S.asm[nid];
      const hit = Object.entries(S.asm).find(([id, a]) => id !== nid && Math.abs(a.x - n.x) < CARDW && n.y < a.y + (H[id] || 300) && n.y + 300 > a.y);
      if (!hit) break; n.x = hit[1].x + CARDW + 40;
    }
    render(); commit(); goto(nid);
    setTimeout(() => { const t = cardsEl.querySelector(`[data-title="${nid}"]`); t?.focus(); t?.select(); }, 330);
    NL.toast(view === 'sheet' ? 'Card added at the bottom. Link it from the card that uses it with ↳ Link existing sub-recipe' : 'Card added. Drag its ● onto the recipe that uses it, or add it later with + Ingredient');
  }
  function linkCard(child, parent) {
    if (A(parent).items.some(it => it.ref === 'asm:' + child)) return NL.toast('Already linked');
    if (wouldCycle(parent, child)) return NL.toast('That would create a loop');
    addItem(parent, 'asm:' + child);
    NL.toast(`Linked. Set how many grams of "${A(child).name}" go into "${A(parent).name}"`);
  }
  // ---------- copy / paste cards (clipboard lives in localStorage so it works across tabs) ----------
  const CLIP = 'nlv2_card_clipboard';
  const readClip = () => { try { return JSON.parse(localStorage.getItem(CLIP)); } catch { return null; } };
  function updatePasteBtn() {
    const c = readClip(), btn = $('#pasteCard');
    btn.hidden = !c?.cards;
    if (c?.cards) btn.title = `Paste "${c.cards[c.top].name}"${Object.keys(c.cards).length > 1 ? ` with ${Object.keys(c.cards).length - 1} sub-recipe card(s)` : ''} as a new unlinked card (Ctrl+V)`;
  }
  function copyCard(id) {
    const ids = [id, ...descendants(id)];
    const cards = Object.fromEntries(ids.map(k => [k, JSON.parse(JSON.stringify(A(k)))]));
    try { localStorage.setItem(CLIP, JSON.stringify({ top: id, cards })); } catch { return NL.toast('Could not copy the card'); }
    updatePasteBtn();
    NL.toast(`Copied "${A(id).name}"${ids.length > 1 ? ` with ${ids.length - 1} sub-recipe card(s)` : ''}. Paste with 📋 Paste card or Ctrl+V`);
  }
  function pasteCard() {
    const clip = readClip(); if (!clip?.cards) return NL.toast('Nothing copied yet');
    const map = Object.fromEntries(Object.keys(clip.cards).map(k => [k, NL.uid('s')]));
    const top = clip.cards[clip.top], r = vpEl.getBoundingClientRect(), ctr = vp.toWorld(r.left + r.width / 2, r.top + r.height / 3);
    const dx = Math.round(ctr.x - CARDW / 2 - (top.x || 0)), dy = Math.round(ctr.y - 60 - (top.y || 0));
    const used = new Set(Object.values(S.asm).map(a => a.color));
    for (const [k, card] of Object.entries(clip.cards)) {
      const n = JSON.parse(JSON.stringify(card)); delete n.kind;
      n.items = n.items.filter(it => !subIdOf(it.ref) || map[subIdOf(it.ref)]).map(it => { const s = subIdOf(it.ref); return s ? { ...it, ref: 'asm:' + map[s] } : it; });
      if (k === clip.top) n.name = n.name + ' (copy)';
      if (!n.color || n.color === '#0f766e') n.color = COLORS.find(c => !used.has(c)) || COLORS[Object.keys(S.asm).length % COLORS.length];
      used.add(n.color);
      n.x = (n.x || 0) + dx; n.y = (n.y || 0) + dy;
      if (view === 'sheet') n._place = true;
      S.asm[map[k]] = n;
    }
    render(); commit(); goto(map[clip.top]);
    NL.toast('Card pasted. Drag its ● onto a recipe to use it');
  }
  addEventListener('storage', e => { if (e.key === CLIP) updatePasteBtn(); });

  // ---------- compare recipes / versions ----------
  function recipeStats(state) {
    if (!state.root || !state.asm[state.root]) return null;
    const c = NL.calc(state), rc = c[state.root];
    return {
      batch: rc.batch, yielded: rc.yielded, loss: +state.asm[state.root].yieldLoss || 0,
      kcal100: rc.perG[0] * 100, cards: Object.keys(state.asm).length,
      nut: NL.NUTRIENTS.map((_, i) => rc.perG[i] * rc.yielded),
      ing: Object.fromEntries(NL.flatten(state, c, state.root)),
    };
  }
  function openCompare() {
    clearTimeout(typingT); commit();
    const all = wb.all(), tabs = all.filter(t => t.state.root && t.state.asm[t.state.root]), skipped = all.filter(t => !tabs.includes(t));
    if (tabs.length < 2) return NL.toast(skipped.length ? 'Compare needs two recipes with a Final card. Use the Final toggle on a card' : 'Make a second tab first (＋ New recipe or ⎘ New Version), then compare');
    const pick = new Set(tabs.slice(0, 4).map(t => t.id));
    let baseId = tabs[0].id, diffOnly = false;
    const ov = document.createElement('div'); ov.className = 'cmp-ov';
    document.body.appendChild(ov);
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const close = () => { ov.remove(); removeEventListener('keydown', esc, true); };
    addEventListener('keydown', esc, true);
    const near = (a, b, d) => Math.abs((a ?? 0) - (b ?? 0)) < 10 ** -d / 2;
    function delta(v, b, unit, d) {
      if (near(v, b, d)) return '<span class="cmp-same">=</span>';
      const dv = v - b, pct = b ? ` (${dv > 0 ? '+' : ''}${NL.fmt(dv / b * 100, 1)}%)` : '';
      return `<span class="cmp-d ${dv > 0 ? 'up' : 'dn'}">${dv > 0 ? '▲ +' : '▼ '}${NL.fmt(dv, d)}${unit}${pct}</span>`;
    }
    function draw() {
      const cols = tabs.filter(t => pick.has(t.id));
      if (!pick.has(baseId)) baseId = cols[0]?.id;
      cols.sort((a, b) => (b.id === baseId) - (a.id === baseId));
      const st = Object.fromEntries(cols.map(t => [t.id, recipeStats(t.state)]));
      const base = st[baseId];
      const row = (label, get, unit = '', d = 1) => {
        const vals = cols.map(t => get(st[t.id]));
        const same = vals.every(v => v != null && near(v, vals[0], d)) || vals.every(v => v == null);
        if (diffOnly && same) return '';
        const bv = base ? get(base) : null;
        return `<tr class="${same ? 'same' : 'diff'}"><th>${label}</th>${cols.map((t, i) => {
          const v = vals[i];
          const main = v == null ? '<span class="cmp-na">—</span>' : `<b>${NL.fmt(v, d)}${unit}</b>`;
          const sub = t.id === baseId ? '' : v == null ? (bv == null ? '' : '<span class="cmp-d dn">not used</span>') : bv == null ? '<span class="cmp-d up">new</span>' : delta(v, bv, unit, d);
          return `<td>${main}${sub ? `<div>${sub}</div>` : ''}</td>`;
        }).join('')}</tr>`;
      };
      const ingIds = [...new Set(cols.flatMap(t => Object.keys(st[t.id].ing)))].sort((a, b) => (base?.ing[b] || 0) - (base?.ing[a] || 0));
      const sec = t => `<tr><td class="cmp-h" colspan="${cols.length + 1}">${t}</td></tr>`;
      const body = !cols.length ? '<div class="cmp-empty">Tick at least one recipe above.</div>' : `<div class="cmp-scroll"><table class="cmp-tbl">
        <thead><tr><th></th>${cols.map(t => `<th>${NL.esc(t.name)}${t.id === baseId ? '<small>baseline</small>' : `<button class="cmp-mk" data-base="${t.id}" title="Compare everything against this recipe">set as baseline</button>`}</th>`).join('')}</tr></thead>
        <tbody>${sec('Summary')}
          ${row('Portion / batch weight', s => s.batch, ' g')}${row('Final weight (yield)', s => s.yielded, ' g')}${row('Cooking loss', s => s.loss, '%')}
          ${row('Calories per portion', s => s.nut[0], ' kcal', 0)}${row('Calories per 100 g', s => s.kcal100, ' kcal', 0)}${row('Cards in recipe', s => s.cards, '', 0)}
          ${sec('Nutrition per portion')}
          ${NL.NUTRIENTS.slice(1).map((n, k) => row(n.label, s => s.nut[k + 1], ' ' + n.unit, n.unit === 'mg' ? 0 : 1)).join('')}
          ${sec('Raw ingredients per portion')}
          ${ingIds.map(iid => row(NL.esc(NL.ingMap[iid]?.name || iid), s => s.ing[iid] ?? null, ' g', 2)).join('')}</tbody>
      </table></div>`;
      ov.innerHTML = `<div class="cmp">
        <div class="cmp-top"><b>⇄ Compare recipes</b><span class="spacer"></span>
          <label class="cmp-opt"><input type="checkbox" id="cmpDiff" ${diffOnly ? 'checked' : ''}> Only show differences</label>
          <button class="btn ghost cmp-x" title="Close (Esc)">×</button></div>
        <div class="cmp-pick">${tabs.map(t => `<label class="cmp-chip ${pick.has(t.id) ? 'on' : ''}"><input type="checkbox" data-pick="${t.id}" ${pick.has(t.id) ? 'checked' : ''}>${NL.esc(t.name)}${t.active ? ' <small>(open)</small>' : ''}</label>`).join('')}</div>
        ${body}
        ${skipped.length ? `<div class="cmp-foot">Not shown (no Final card yet): ${skipped.map(t => NL.esc(t.name)).join(', ')}</div>` : ''}
        <div class="cmp-foot">▲ / ▼ show the difference from the baseline column. Ingredient grams are the raw amounts that end up in one portion, including those inside sub-recipes.</div>
      </div>`;
      ov.querySelector('.cmp-x').onclick = close;
      ov.querySelector('#cmpDiff').onchange = e => { diffOnly = e.target.checked; draw(); };
      ov.querySelectorAll('[data-pick]').forEach(cb => cb.onchange = () => { cb.checked ? pick.add(cb.dataset.pick) : pick.delete(cb.dataset.pick); draw(); });
      ov.querySelectorAll('[data-base]').forEach(b => b.onclick = () => { baseId = b.dataset.base; draw(); });
    }
    ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
    draw();
  }

  function deleteCard(id) {
    const ps = parentsOf(id);
    if (!confirm(`Delete "${A(id).name}"?${ps.length ? `\nIt will be removed from: ${ps.map(p => A(p.pid).name).join(', ')}` : ''}`)) return;
    delete S.asm[id];
    if (S.root === id) S.root = null;
    for (const a of Object.values(S.asm)) a.items = a.items.filter(it => it.ref !== 'asm:' + id);
    render(); commit();
  }
  // ---------- remove a connection (hover a line, click its scissors) ----------
  function unlink(pid, sid) {
    A(pid).items = A(pid).items.filter(it => it.ref !== 'asm:' + sid);
    render(); commit();
    NL.toast(`Unlinked "${A(sid).name}" from "${A(pid).name}". The card is kept. Ctrl+Z to undo`);
  }

  function nextColor() {
    const used = new Set(Object.values(S.asm).map(a => a.color));
    return COLORS.find(c => !used.has(c)) || COLORS[Object.keys(S.asm).length % COLORS.length];
  }
  function setKind(id, kind) {
    const a = A(id);
    if (kind === 'final') {
      if (S.root === id) return;
      const ps = parentsOf(id);
      if (ps.length) return NL.toast(`"${a.name}" is used inside ${ps.map(p => '"' + A(p.pid).name + '"').join(', ')}. Remove it there first, then make it Final`);
      const prev = hasFinal() ? S.root : null;
      if (prev && (!A(prev).color || A(prev).color === ROOT_COLOR)) A(prev).color = nextColor();
      S.root = id;
      NL.toast(`"${a.name}" is now the final recipe${prev ? `. "${A(prev).name}" is now a sub-recipe` : ''}`);
    } else {
      if (S.root !== id) return;
      if (!a.color || a.color === ROOT_COLOR) a.color = nextColor();
      S.root = null;
      NL.toast(`"${a.name}" is now a sub-recipe. Mark any card as Final when you're ready`);
    }
    render(); commit();
  }
  function openPicker(id, anchor, mode) {
    const r = anchor.getBoundingClientRect();
    const subs = Object.entries(S.asm).filter(([sid]) => sid !== S.root && !wouldCycle(id, sid) && !A(id).items.some(it => it.ref === 'asm:' + sid))
      .map(([sid, a]) => ({ value: 'asm:' + sid, label: a.name, color: colorOf(sid), sub: 'sub-recipe' }));
    const groups = mode === 'link'
      ? [{ label: 'Existing sub-recipes', items: subs }, { label: 'Create', items: [{ value: 'new-sub', label: '＋ New sub-recipe', color: '#7c5cff', always: true }] }]
      : [{ label: 'Sub-recipes', items: subs }, ...NL.ingredientGroups()];
    NL.picker({ x: r.left, y: r.bottom + 4, groups, placeholder: mode === 'link' ? 'Search sub-recipes…' : 'Search ingredients…', onPick: v => addItem(id, v) });
  }

  // ---------- interactions ----------
  const vp = NL.viewport(vpEl, worldEl, {
    isBackground: t => t === vpEl || t === worldEl || t === boardCardsEl || t === linksEl,
    onChange: v => { $('#zl').textContent = Math.round(v.s * 100) + '%'; },
  });

  boardCardsEl.addEventListener('pointerdown', e => {
    const port = e.target.closest('[data-port]');
    if (port && e.button === 0) {
      const id = port.dataset.port, a = A(id);
      return NL.connectDrag({ e, vp, linksEl, from: { x: a.x, y: a.y + 30 }, color: colorOf(id), targetSel: '.rcard', selfEl: port.closest('.rcard'), onDrop: t => linkCard(id, t.dataset.id) });
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
    if (d.amt) {
      const [id, i] = d.amt.split(':'), raw = e.target.value, v = raw.trim() === '' ? 0 : NL.parseNum(raw);
      if (!isFinite(v)) amtErr[d.amt] = 'Enter a weight in grams, e.g. 12.5';
      else if (v < 0) amtErr[d.amt] = "Weight can't be negative";
      else { delete amtErr[d.amt]; A(id).items[+i].amount = v; }
      renderKeep();
    }
    else if (d.title) { A(d.title).name = e.target.value; renderKeep(); }
    else if (d.fw) { setFinalWeight(d.fw, e.target.value); renderKeep(); }
    else if (d.bk) {
      const [id, i] = d.bk.split(':'), a = A(id), base = baseTotal(a), v = e.target.value.trim();
      const pv = NL.parseNum(v);
      if (base > 0 && isFinite(pv) && pv >= 0) { a.items[+i].amount = round2(base * pv / 100); renderKeep(); }
    }
    else if (d.bscale || d.wscale) {
      const id = d.bscale || d.wscale, a = A(id), v = NL.parseNum(e.target.value);
      const snap = bscaleStart[id] || (bscaleStart[id] = a.items.map(it => +it.amount || 0));
      // scale by yield: required batch = desired yield / (1 - loss), so the factor is taken against the snapshot's yield
      const snapBase = d.bscale ? baseSet(a).reduce((s, k) => s + snap[k], 0) : snap.reduce((s, x) => s + x, 0) * (1 - Math.min(+a.yieldLoss || 0, 99.99) / 100);
      if (e.target.value.trim() !== '' && isFinite(v) && v > 0 && snapBase > 0) { const f = v / snapBase; a.items.forEach((it, k) => { it.amount = round2(snap[k] * f); }); renderKeep(); }
    }
    else if (d.step) { const [id, i] = d.step.split(':'); A(id).steps[+i] = e.target.value; }
    else if (d.notes) { A(d.notes).notes = e.target.value; }
  });
  // inputs are re-rendered while typing, so 'change' never fires: commit shortly after typing stops, and on blur
  const isField = d => d && (d.amt || d.title || d.fw || d.bk || d.bscale || d.wscale || d.step || d.notes);
  let typingT;
  document.addEventListener('input', e => { if (isField(e.target.dataset)) { clearTimeout(typingT); typingT = setTimeout(commit, 600); } });
  document.addEventListener('focusin', e => {
    if (NL.refocusing) return;
    const id = e.target.dataset?.fw; if (id) fwStart[id] = A(id).yieldLoss || 0;
    const sc = e.target.dataset?.bscale || e.target.dataset?.wscale; if (sc) delete bscaleStart[sc];
  });
  document.addEventListener('focusout', e => {
    if (NL.refocusing) return;
    const d = e.target.dataset;
    if (d?.fw) {
      if (e.target.value.trim() === '') render();
      else if (fwErr[d.fw]) { NL.toast('Final weight not saved: ' + fwErr[d.fw]); delete fwErr[d.fw]; render(); }
    }
    if (d?.amt && amtErr[d.amt]) { NL.toast('Weight not saved: ' + amtErr[d.amt]); delete amtErr[d.amt]; render(); }
    if (d?.bscale || d?.wscale || d?.bk) { delete bscaleStart[d.bscale || d.wscale]; render(); }
    if (isField(d)) commit();
  });
  document.addEventListener('keydown', e => {
    const d = e.target.dataset;
    if (e.key === 'Enter' && d && (d.amt || d.title || d.fw || d.bk || d.bscale || d.wscale)) e.target.blur();
    if (e.key === 'Enter' && d?.step) { const [id, i] = d.step.split(':'); A(id).steps.splice(+i + 1, 0, ''); render(); commit(); cardsEl.querySelector(`[data-step="${id}:${+i + 1}"]`)?.focus(); }
  });

  document.addEventListener('click', e => {
    const t = e.target, q = s => t.closest(s);
    let b;
    if ((b = q('[data-view]'))) return setView(b.dataset.view);
    if ((b = q('[data-svlinks]'))) { prefs.links = b.dataset.svlinks; savePrefs(); return render(); }
    if ((b = q('[data-svwidth]'))) { prefs.width = b.dataset.svwidth; savePrefs(); return render(); }
    if ((b = q('[data-move]'))) { const [id, d] = b.dataset.move.split(':'); return moveCard(id, +d); }
    if ((b = q('[data-goto]'))) return goto(b.dataset.goto);
    if ((b = q('[data-togbase]'))) {
      const [id, i] = b.dataset.togbase.split(':'), a = A(id), it = a.items[+i];
      if (it.base) delete it.base; else it.base = true;
      render(); commit(); return;
    }
    if ((b = q('[data-delbase]'))) {
      const a = A(b.dataset.delbase);
      delete a.baseName; a.items.forEach(it => delete it.base);
      render(); commit(); NL.toast('Base removed. Press B on an ingredient to choose a new base'); return;
    }
    if ((b = q('[data-basename]'))) {
      const a = A(b.dataset.basename);
      NL.prompt('Name the base (e.g. Total Flour)', a.baseName || 'Total Flour').then(v => {
        if (v == null) return;
        if (v) a.baseName = v; else delete a.baseName;
        render(); commit();
        NL.toast(v ? `Press B on each ingredient that belongs to "${v}"` : 'Base name removed');
      });
      return;
    }
    if ((b = q('[data-delrow]'))) { const [id, i] = b.dataset.delrow.split(':'); A(id).items.splice(+i, 1); render(); commit(); return; }
    if ((b = q('[data-addi]'))) return openPicker(b.dataset.addi, b, 'ing');
    if ((b = q('[data-addl]'))) return openPicker(b.dataset.addl, b, 'link');
    if ((b = q('[data-adds]'))) return newSub(b.dataset.adds);
    if ((b = q('[data-delcard]'))) return deleteCard(b.dataset.delcard);
    if ((b = q('[data-copycard]'))) return copyCard(b.dataset.copycard);
    if ((b = q('[data-cut]'))) { const [pid, sid] = b.dataset.cut.split(':'); return unlink(pid, sid); }
    if ((b = q('[data-kind]'))) { const [k, id] = b.dataset.kind.split(':'); return setKind(id, k); }
    if ((b = q('[data-emptyadd]'))) return addCard();
    if ((b = q('[data-collapse]'))) { const a = A(b.dataset.collapse); a.collapsed = !a.collapsed; render(); commit(); return; }
    if ((b = q('[data-addstep]'))) { const a = A(b.dataset.addstep); a.steps.push(''); render(); commit(); cardsEl.querySelector(`[data-step="${b.dataset.addstep}:${a.steps.length - 1}"]`)?.focus(); return; }
    if ((b = q('[data-delstep]'))) { const [id, i] = b.dataset.delstep.split(':'); A(id).steps.splice(+i, 1); render(); commit(); }
  });

  // library drag → card
  $('#libSearch').addEventListener('input', drawLib);
  $('#lib').addEventListener('dragstart', e => { const it = e.target.closest('.lib-item'); if (it) { e.dataTransfer.setData('text/plain', 'ing:' + it.dataset.ing); e.dataTransfer.effectAllowed = 'copy'; } });
  for (const dz of [vpEl, svEl]) dz.addEventListener('dragover', e => {
    e.preventDefault();
    const c = e.target.closest?.('.rcard');
    cardsEl.querySelectorAll('.drop').forEach(x => x !== c && x.classList.remove('drop'));
    c?.classList.add('drop');
  });
  for (const dz of [vpEl, svEl]) dz.addEventListener('drop', e => {
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
    else if (mod && e.key.toLowerCase() === 'v' && readClip()?.cards && !document.querySelector('.cmp-ov, .nl-prompt-ov')) { e.preventDefault(); pasteCard(); }
    else if ((e.key === 'f' || e.key === 'F') && view === 'board') vp.fit(bounds());
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
  $('#pasteCard').onclick = () => pasteCard();
  $('#compare').onclick = () => openCompare();
  // hide / show the left panel (remembered per browser)
  const SIDE = 'nlv2_side_hidden';
  function setSide(hidden) {
    $('#cmain').classList.toggle('hide-side', hidden);
    $('#sideTog').textContent = hidden ? '›' : '‹';
    $('#sideTog').title = hidden ? 'Show the panel (recipe structure and ingredient library)' : 'Hide the panel';
    try { localStorage.setItem(SIDE, hidden ? '1' : ''); } catch { }
    setTimeout(drawLinks, 220);
  }
  $('#sideTog').onclick = () => setSide(!$('#cmain').classList.contains('hide-side'));
  try { if (localStorage.getItem(SIDE)) setSide(true); } catch { }
  // TEMP: reset-to-sample button (remove with #resetSample in index.html)
  $('#resetSample').onclick = () => {
    if (!confirm('Replace this tab with the original sample recipe? Other tabs are not touched. You can undo with Ctrl+Z.')) return;
    S = fromSample(); arrange(); commit(); if (view === 'board') vp.fit(bounds(), 40, { min: 0.8, align: 'left' });
    NL.toast('Sample recipe restored');
  };
  $('#newIng').onclick = async () => { const i = await NL.ingredientForm(); if (i) NL.toast(`"${i.name}" added. Drag it from the list.`); };
  document.addEventListener('nl:ingredients', drawLib);

  // ---------- recipes as tabs (workbook) ----------
  const nameOf = st => st.asm[st.root]?.name || st.draftName || 'Untitled recipe';
  const blank = () => ({ root: null, draftName: 'Untitled recipe ' + (wb.count() + 1), asm: {} });
  const sample = () => Object.assign(fromSample(), { _arrange: true });
  function newRecipe() { wb.add(blank()); }
  window.NL_resetSample = () => { wb.add(sample()); NL.toast('Sample recipe opened in a new tab'); };

  function openState(state) {
    S = state;
    if (view === 'sheet') { render(); hist = NL.history(() => wb.save(S), () => S, s => { S = s; render(); }); svEl.scrollTop = 0; return; }
    const needsArrange = S._arrange; delete S._arrange;
    if (needsArrange) { arrange(); wb.save(S); } else { render(); if (placeNewCards()) wb.save(S); }
    hist = NL.history(() => wb.save(S), () => S, s => { S = s; render(); }); // after arranging, so undo never returns to unplaced cards
    if (!Object.keys(S.asm).length) { vp.v.s = 1; vp.v.x = 0; vp.v.y = 0; vp.apply(); return; }
    const empty = hasFinal() && Object.keys(S.asm).length === 1 && !A(S.root).items.length;
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
  updatePasteBtn();
  openState(wb.current());
})();
