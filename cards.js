// NutriLabel assembly builder — assembly cards (Modernist Cuisine style) linked like a flow.
// The final assembly is the main card; every sub-assembly row links to its own card.
(function () {
  const CARDW = 700, GAPX = 140, GAPY = 36;
  const COLORS = ['#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b', '#14b8a6', '#ec4899', '#f97316', '#6366f1'];
  const $ = s => document.querySelector(s);
  const vpEl = $('#vp'), worldEl = $('#world'), linksEl = $('#links'), boardCardsEl = $('#cards');
  let svEl = $('#sheetView'), svInnerEl = $('#svInner'), svCardsEl = $('#svCards'), svLinksEl = $('#svLinks'); // swapped while the split side is current
  let cardsEl = boardCardsEl, view = 'board', orderIdx = {}, depthMap = {}; // view: 'board' (canvas) or 'sheet' (stacked)

  let S, calc, hist, cost = {};
  // Building / Scaling card faces. Style 'flip' turns the card over to a read-only scaling side; 'hide' keeps the card and hides the building columns.
  let scaleStyle = 'flip'; try { if (localStorage.getItem('nlv3_scale_style') === 'hide') scaleStyle = 'hide'; } catch { }
  const flipIn = {}; // card id -> 1 while its flip-in animation should play
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
  function paintLeft() {
    calc = NL.calc(S); cost = NL.cost(S, calc);
    if (view === 'sheet') {
      const ord = sheetOrder(); orderIdx = Object.fromEntries(ord.map((id, k) => [id, k])); depthMap = depths();
      cardsEl.innerHTML = ord.length ? ord.map(cardHTML).join('') : SHEET_EMPTY;
    } else cardsEl.innerHTML = Object.keys(S.asm).map(cardHTML).join('');
    stickCols(cardsEl);
    drawLinks();
    drawTree();
    drawNut();
    $('#recipeTitle').textContent = hasFinal() ? A(S.root).name : (S.draftName || 'Untitled assembly');
    $('#emptyHint').hidden = Object.keys(S.asm).length > 0;
    wb.live(S);
  }
  const renderKeep = () => NL.keepFocus(render);
  // flip side: Ingredient, Weight and Cost stay put while the scaled columns scroll sideways
  function stickCols(root) {
    // Scaling side: widen the card so every pinned column fits without scrolling sideways
    for (const b of root.querySelectorAll('.rcard.face-scale .rc-body')) {
      const t = b.querySelector('.rc-tbl'), card = b.closest('.rcard'); if (!t || !b.clientWidth) continue;
      const zoom = b.getBoundingClientRect().width / b.offsetWidth || 1; // the board may be zoomed
      const over = Math.max(b.scrollWidth, t.getBoundingClientRect().width / zoom) - b.clientWidth;
      if (over > 0) card.style.width = Math.ceil(card.offsetWidth + over) + 1 + 'px';
    }
    for (const t of root.querySelectorAll('.rcard.flipface .rc-tbl')) {
      const h = t.tHead?.rows[0]; if (!h || !h.cells[0].offsetWidth) continue;
      const w1 = h.cells[0].offsetWidth, w2 = h.querySelector('.hc-w').offsetWidth;
      t.style.setProperty('--s1', w1 + 'px'); t.style.setProperty('--s2', w1 + w2 + 'px');
    }
  }
  // re-measure when the card area changes width (panel hidden, window resized, split opened)
  { const ro = new ResizeObserver(() => { for (const el of [boardCardsEl, $('#svCards'), $('#spCards')]) if (el) stickCols(el); }); for (const el of [$('#svCards'), $('#spCards'), $('#cmain')]) if (el) ro.observe(el); }
  function setFace(id, f) {
    const s = side, el = cardsEl.querySelector(`.rcard[data-id="${id}"]`), anim = scaleStyle === 'flip' && el && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const go = () => { const a = A(id); if (!a) return; if (f === 'scale') a.face = 'scale'; else delete a.face; if (anim) flipIn[id] = 1; render(); delete flipIn[id]; saveCur(); hist.sync(); };
    if (anim) { el.classList.add('flip-out'); setTimeout(() => withSide(s, go), 170); } else go();
  }

  function cardHTML(id) {
    const a = A(id), c = calc[id], cc = cost[id] || { batch: 0, perG: 0, missing: 0 }, isRoot = id === S.root;
    const parents = parentsOf(id);
    const kind = `<div class="rc-kind" title="Is this the final assembly or a sub-assembly?"><button class="${isRoot ? 'on' : ''}" data-kind="final:${id}">Final</button><button class="${isRoot ? '' : 'on'}" data-kind="sub:${id}">Sub-assembly</button></div>`;
    const apObj = isRoot ? null : activePin(a), ap = apObj ? pinPortion(apObj, c, baseTotal(a)) : null;
    // portion size on top: a dropdown of the parent's amount + each pinned column's portion (display only, never changes weights)
    const psLabel = p => {
      const pins0 = a.scalePins || [], used = `${NL.fmt(+p.amount || 0, 2)} g`;
      if (!pins0.length) return `<span class="rc-ps" title="The amount of this sub-assembly that goes into ${NL.esc(A(p.pid).name)}">(portion size ${used})</span>`;
      const label = q => q.mode === 'portion' ? `${NL.fmt(q.size, 1)} g × ${NL.fmt(q.count, 2)}` : q.mode === 'base' ? `Base ${NL.fmt(q.target, 1)} g` : `Yield ${NL.fmt(q.target, 1)} g`;
      return `<span class="rc-ps ${ap != null ? 'active' : ''}">(portion size <select class="ps-sel" data-pssel="${id}" title="Show a pinned scaling's portion here. Your weights are not changed">
        <option value="">${used} (as used in ${NL.esc(A(p.pid).name)})</option>
        ${pins0.map(q => `<option value="${q.id}" ${apObj && q.id === apObj.id ? 'selected' : ''}>${NL.fmt(pinPortion(q, c, baseTotal(a)), 2)} g · ${label(q)}</option>`).join('')}
      </select>)</span>`;
    };
    const kicker = isRoot ? 'Final assembly · per portion'
      : parents.length ? 'Sub-assembly · used in ' + parents.map(p => `<a data-goto="${p.pid}">${NL.esc(A(p.pid).name)}</a> ${psLabel(p)}`).join(', ')
        : 'Sub-assembly · not used yet. ' + (view === 'sheet' ? 'Link it with ↳ Link to assembly' : 'Drag the ● on the left onto an assembly to link it');
    const bset = baseSet(a), baseAmt = baseTotal(a), bname = baseLabel(a, bset), sc = scaleOf(a, c, parents, isRoot);
    // pinned scalings keep their target and recalculate from the current weights
    const pins = a.scalePins || [], pinF = p => pinFactor(p, c, baseAmt);
    // the pinned column in use: its portion weight is what the parent assembly takes (shown as "portion size" on top)
    const activeK = isRoot ? -1 : pins.findIndex(p => p.id && p.id === a.activePin);
    const pcls = k => ' pinned' + (k === activeK ? ' active' : '');
    // Building shows the recipe plus only the column in use; Scaling shows the live scaled column and every pinned column
    const scaling = a.face === 'scale' && c.batch > 0, flip = scaling && scaleStyle === 'flip', showSc = scaling;
    const vp = scaling ? pins.map((p, k) => ({ p, k })) : activeK >= 0 ? [{ p: pins[activeK], k: activeK }] : [];
    // Final card, Scaling side: one portion rebuilt with each sub-assembly's portion in use (the Final's own weights never change)
    const subUse = isRoot && scaling ? a.items.map(it => {
      const sid = subIdOf(it.ref), s = sid && A(sid), q = s && activePin(s);
      if (!q) return null;
      const g = pinPortion(q, calc[sid], baseTotal(s));
      return Math.abs(g - (+it.amount || 0)) < 0.005 ? null : { sid, g, on: !!a.pulled?.[sid] };
    }) : [];
    const subG = idx => subUse[idx]?.on ? subUse[idx].g : +a.items[idx].amount || 0;
    const showSub = subUse.some(u => u?.on);
    const ncol = 6 + (showSc ? 1 : 0) + (showSub ? 1 : 0) + vp.length, RO = scaling ? 'readonly tabindex="-1" ' : ''; // the Scaling side never edits the recipe
    // cost of the batch at each scaling (portion scalings also show cost per portion)
    const star = cc.missing ? '*' : '';
    const costCellFor = (f, p, k) => `<td class="r scl${p ? pcls(k) : ''}">${NL.money(costAll * f)}${allStar}${(p || sc).mode === 'portion' ? `<div class="scl-pp">${NL.money(costAll * f / ((p || sc).count || 1))} / portion</div>` : ''}</td>`;
    // packaging rows sit in the ingredient table above Total, so the Total cost includes them
    const pk = a.packaging || [], pkW = pk.reduce((t, r) => t + (+r.weight || 0), 0), pkTotal = pk.reduce((t, r) => t + (+r.cost || 0), 0), pkMissing = pk.filter(r => r.cost == null).length;
    const lb = a.labor || [], lbTotal = laborOf(a), lbMissing = lb.filter(r => laborCost(r) == null).length;
    const allMissing = cc.missing + pkMissing + lbMissing, allStar = allMissing ? '*' : '', costAll = cc.batch + pkTotal + lbTotal;
    const costTip = pk.length || lb.length ? `Ingredients ${NL.money(cc.batch)}${pk.length ? ` + packaging ${NL.money(pkTotal)}` : ''}${lb.length ? ` + labor ${NL.money(lbTotal)}` : ''}${allMissing ? `. ${allMissing} item(s) have no price yet` : ''}` : (cc.missing ? `${cc.missing} ingredient(s) have no price yet` : '');
    // each scaled column shows weights (g) or costs ($); the live column keeps its choice on the card, pinned ones on the pin
    const showCost = k => !!(k === 'sub' ? a.subShowCost : k < 0 ? a.scaleShowCost : pins[k]?.showCost);
    const scCols = [...(showSc ? [{ f: sc.f, k: -1, cls: '' }] : []), ...(showSub ? [{ f: 1, k: 'sub', cls: ' fromsub' }] : []), ...vp.map(({ p, k }) => ({ f: pinF(p), k, cls: pcls(k) }))];
    const money1 = (usd, f) => usd == null ? '<span class="faint">—</span>' : NL.money(usd.v * f) + (usd.miss ? '*' : '');
    // alt = { html, usd }: what the Sub portions column shows for this row (otherwise the row as typed)
    const scCells = (wt, usd, alt) => scCols.map(({ f, k, cls }) => `<td class="r scl${cls}">${k === 'sub' && alt ? (showCost(k) ? money1(alt.usd, 1) : alt.html) : showCost(k) ? money1(usd, f) : wt(f)}</td>`).join('');
    const scTog = k => `<span class="scl-tog" title="Show weights or costs in this column"><button class="${showCost(k) ? '' : 'on'}" data-sclshow="${id}:${k}:g">g</button><button class="${showCost(k) ? 'on' : ''}" data-sclshow="${id}:${k}:$">$</button></span>`;
    const pkW1 = (r, f) => r.weight != null ? `${NL.fmt(r.weight * f, 2)}<span class="u">g</span>` : '';
    const pkScaled = r => scCells(f => pkW1(r, f), r.cost != null ? { v: +r.cost } : null);
    const gross = (food, f = 1) => pkW > 0 ? `<div class="pk-gross" title="Food ${NL.fmt(food * f, 2)} g + packaging ${NL.fmt(pkW * f, 2)} g">gross ${NL.fmt((food + pkW) * f, 2)} g</div>` : '';
    const pkRows = pk.length ? `<tr class="pk-head"><td colspan="${ncol}">Packaging</td></tr>` + pk.map((r, k) => `<tr class="pk-row">
        <td><span class="pk-cell"><button class="rc-del rc-del-l" data-pkdel="${id}:${k}" title="Remove this packaging">×</button><input ${RO}class="pk-name" data-pkn="${id}:${k}" data-fk="pkn-${id}-${k}" value="${NL.esc(r.name || '')}" placeholder="e.g. Pouch"><button class="pk-more" data-pkedit="${id}:${k}" title="Edit name, cost and dimensions${r.l || r.w || r.h ? ` (${[r.l, r.w, r.h].map(v => v ?? '–').join(' × ')} ${r.unit || 'mm'})` : ''}">⋯</button></span></td>
        <td class="r w"><input ${RO}class="num" inputmode="decimal" data-pkd="${id}:${k}:weight" data-fk="pkw-${id}-${k}" value="${r.weight ?? ''}" placeholder="—" title="Weight of this packaging per unit (kept out of the food weight)"><span class="u">g</span></td><td class="pc"></td><td class="bk"></td>
        <td class="r cost pk-cost">$<input ${RO}class="num" inputmode="decimal" data-pkc="${id}:${k}" data-fk="pkc-${id}-${k}" value="${r.cost ?? ''}" placeholder="0.00"></td>
        ${pkScaled(r)}<td class="x"></td></tr>`).join('') : '';
    const lbMin = (r, f) => r.minutes != null ? `${NL.fmt(r.minutes * f, 0)}<span class="u">min</span>` : '';
    const lbScaled = r => scCells(f => lbMin(r, f), laborCost(r) == null ? null : { v: laborCost(r) });
    const lbRows = lb.length ? `<tr class="pk-head lab-head"><td colspan="${ncol}">Labor <small>approximate</small></td></tr>` + lb.map((r, k) => `<tr class="pk-row lab-row">
        <td><span class="pk-cell"><button class="rc-del rc-del-l" data-lbdel="${id}:${k}" title="Remove this task">×</button><input ${RO}class="pk-name" data-lbf="${id}:${k}:name" data-fk="lbn-${id}-${k}" value="${NL.esc(r.name || '')}" placeholder="e.g. Prep"><button class="pk-more" data-lbedit="${id}:${k}" title="Edit this task">⋯</button></span></td>
        <td class="r w"><input ${RO}class="num" inputmode="decimal" data-lbf="${id}:${k}:minutes" data-fk="lbm-${id}-${k}" value="${r.minutes ?? ''}" placeholder="—" title="Minutes"><span class="u">min</span></td>
        <td class="r lab-ppl pc">×<input ${RO}class="num" inputmode="decimal" data-lbf="${id}:${k}:people" data-fk="lbp-${id}-${k}" value="${r.people ?? 1}" title="People"></td>
        <td class="r lab-rate bk">$<input ${RO}class="num" inputmode="decimal" data-lbf="${id}:${k}:rate" data-fk="lbr-${id}-${k}" value="${r.rate ?? ''}" placeholder="—" title="Rate per hour"><span class="u">/h</span></td>
        <td class="r cost" title="${r.minutes ?? '?'} min × ${r.people ?? 1} × ${r.rate != null ? NL.money(r.rate) : '?'}/h">${laborCost(r) == null ? '—' : NL.money(laborCost(r))}</td>
        ${lbScaled(r)}<td class="x"></td></tr>`).join('') : '';
    const costRow = () => `<tr class="rc-costrow" ${cc.missing ? `title="${cc.missing} ingredient(s) have no price yet, so these are minimums"` : ''}><td>Cost</td><td class="r w" ${costTip ? `title="${costTip}"` : ''}>${NL.money(costAll)}${allStar}</td><td class="pc"></td><td class="bk"></td><td class="cost"></td>${showSc ? costCellFor(sc.f) : ''}${showSub ? `<td class="r scl fromsub">${NL.money(subAll)}${allStar}<div class="scl-pp">${NL.money(Math.abs(subAll - costAll))} ${subAll >= costAll ? 'more' : 'less'} / portion</div></td>` : ''}${vp.map(({ p, k }) => costCellFor(pinF(p), p, k)).join('')}<td></td></tr>`;
    const scCell = (g, usd, alt) => scCells(f => `${NL.fmt(g * f, 2)}<span class="u">g</span>`, usd, alt);
    const subCost = idx => { const it = a.items[idx], sid = subIdOf(it.ref), k = sid ? cost[sid] : null;
      if (!sid) return rowCost(it); return k ? { v: subG(idx) * k.perG, miss: !!k.missing } : null; };
    const subAlt = idx => ({ html: `<b class="sub-g">${NL.fmt(subG(idx), 2)}</b><span class="u">g</span>`, usd: subCost(idx) });
    // totals for the Sub portions column
    const subFood = a.items.reduce((t, _, idx) => t + subG(idx), 0);
    const subAll = a.items.reduce((t, _, idx) => t + (subCost(idx)?.v || 0), 0) + pkTotal + lbTotal;
    // the Pull button on a sub-assembly row whose card has a different portion in use (Final card, Scaling side)
    const subNote = idx => { const u = subUse[idx]; if (!u) return '';
      const g = `${NL.fmt(u.g, 2)} g`;
      return `<div><button class="sub-pull ${u.on ? 'on' : ''}" data-subpull="${id}:${u.sid}" title="${u.on ? 'Pulled into the Sub portions column. Click to remove' : 'Use the portion in use on its card in the Sub portions column. Your weight here is not changed'}">${u.on ? '✓ Pulled ' + g : 'Pull ' + g}</button></div>`; };
    const rows = a.items.map((it, idx) => {
      const sid = subIdOf(it.ref);
      const inBase = bset.includes(idx), bpct = baseAmt > 0 ? +((+it.amount || 0) / baseAmt * 100).toFixed(2) : null;
      const bbtn = `<button class="bk-b ${inBase ? 'on' : ''}" data-togbase="${id}:${idx}" title="${inBase ? 'Part of the base. Click to remove it from the base' : 'Click to add this ingredient to the base (100%)'}">B</button>`;
      const bk = inBase
        ? `<td class="r bk base"><span class="bk-base" title="Share of the base (${NL.esc(bname)})">${bpct == null ? '—' : NL.fmt(bpct, 2) + '%'}</span>${bbtn}</td>`
        : `<td class="r bk"><span class="bk-in"><input ${RO}class="num" inputmode="decimal" data-fk="bk-${id}-${idx}" data-bk="${id}:${idx}" value="${bpct ?? ''}" ${baseAmt > 0 ? 'title="Baker %: type a % to set this weight from the base"' : `disabled placeholder="—" title="${bset.length ? 'The base has no weight yet' : 'Press B on an ingredient to choose the base'}"`}>%</span>${bbtn}</td>`;
      const pct = `<td class="r pc">${NL.pct(+it.amount || 0, c.batch)}</td>${bk}${costCell(it, scaling)}${scCell(+it.amount || 0, rowCost(it), subUse[idx]?.on ? subAlt(idx) : null)}`;
      const aerr = amtErr[`${id}:${idx}`];
      const amt = `<td class="r w"><input ${RO}class="num ${aerr ? 'bad' : ''}" inputmode="decimal" data-fk="amt-${id}-${idx}" data-amt="${id}:${idx}" value="${it.amount}" ${aerr ? `title="${NL.esc(aerr)}"` : ''}><span class="u">g</span></td>`;
      const delL = `<button class="rc-del rc-del-l" data-delrow="${id}:${idx}" title="Remove this row">×</button>`, del = '<td class="x"></td>';
      if (sid && A(sid)) {
        return `<tr class="sub" data-sub="${sid}" style="--rc:${colorOf(sid)}"><td>${delL}<span class="rc-sublink" data-goto="${sid}">${NL.esc(A(sid).name)}</span><span class="rc-see" data-goto="${sid}">see assembly ${view === 'sheet' ? (orderIdx[sid] > orderIdx[id] ? '↓' : '↑') : '→'}</span>${subNote(idx)}</td>${amt}${pct}${del}</tr>`;
      }
      const ing = NL.ingMap[it.ref.slice(4)];
      return `<tr><td>${delL}${NL.esc(ing?.name || it.ref)}<span class="rc-vendor">${NL.esc(ing?.vendor || '')}</span></td>${amt}${pct}${del}</tr>`;
    }).join('') || `<tr class="rc-empty"><td colspan="${ncol}">No ingredients yet — use the buttons below or drag from the library</td></tr>`;
    const kcal = Math.round(c.perG[0] * (isRoot ? c.yielded : 100));
    const extra = scaling && !flip ? Math.max(0, pins.length - 2) : 0;
    return `<div class="rcard ${isRoot ? 'final' : ''} ${a.collapsed ? 'rc-collapsed' : ''} ${!isRoot && !parents.length ? 'orphan' : ''} ${scaling ? 'face-scale' : 'face-build'} ${flip ? 'flipface' : ''} ${flipIn[id] ? 'flip-in' : ''}" data-id="${id}" style="${view === 'sheet' ? `--depth:${depthMap[id] || 0};` : `left:${a.x}px;top:${a.y}px;`}--c:${colorOf(id)};--extra:${extra}">
      ${isRoot ? '' : `<span class="port" data-port="${id}" title="Drag onto the assembly that uses this card"></span>`}
      <div class="rc-top" data-drag>
        <div class="rc-kick-row"><div class="rc-kicker">${kicker}</div>${kind}</div>
        <div class="rc-titlebar">
          <span class="sv-grip" data-grip="${id}" title="Drag to move this card up or down">⠿</span>
          <input class="rc-title" data-fk="title-${id}" data-title="${id}" value="${NL.esc(a.name)}">
          <button class="rc-ib sv-only" data-move="${id}:-1" title="Move card up">↑</button><button class="rc-ib sv-only" data-move="${id}:1" title="Move card down">↓</button>
          <span class="rc-face"><button class="${scaling ? '' : 'on'}" data-face="${id}:build" title="Build the recipe: weights, %, packaging, labor, procedure">Building</button><button class="${scaling ? 'on' : ''}" data-face="${id}:scale" ${c.batch > 0 ? `title="${scaleStyle === 'flip' ? 'Flip to the scaling side' : 'Show scaling, hide building columns'}: scaled and pinned columns with cost"` : 'disabled title="Add ingredient weights first"'}>Scaling</button></span>
          <button class="rc-ib" data-collapse="${id}" title="${a.collapsed ? 'Expand' : 'Collapse'}">${a.collapsed ? '▸' : '▾'}</button>
          <button class="rc-ib fav ${favOf(id) ? 'on' : ''}" data-fav="${id}" title="${favOf(id) ? 'In your favorites. Click to update or remove' : 'Save this card to favorites'}">${favOf(id) ? '★' : '☆'}</button>
          <button class="rc-ib" data-copycard="${id}" title="Copy this card${descendants(id).size ? ' (with its sub-assembly cards)' : ''}. Paste into any tab with 📋 Paste card or Ctrl+V">⧉</button>
          <button class="rc-ib del" data-delcard="${id}" title="Delete this card">🗑</button>
        </div>
        <div class="rc-stats">
          <div><b>${NL.fmt(c.batch)} g</b><span>${isRoot ? 'Portion' : 'Batch'}</span></div>
          ${isRoot ? (n => `<div class="rc-count" title="Sub-assemblies in this final assembly"><b>${n}</b><span>Sub-assembl${n === 1 ? 'y' : 'ies'}</span></div>`)(a.items.filter(it => subIdOf(it.ref)).length) : ''}
          <div><b>${NL.fmt(c.yielded)} g</b><span>Yield</span></div>
          <div><b>${NL.fmt(+a.yieldLoss || 0, 1)}% / ${NL.fmt(NL.yieldPct(a.yieldLoss), 1)}%</b><span>Loss / Yield</span></div>
          <div><b>${kcal}</b><span>${isRoot ? 'kcal / portion' : 'kcal / 100 g'}</span></div>
          <div class="rc-cost" ${cc.missing ? `title="${cc.missing} ingredient(s) have no price yet, so this is a minimum"` : 'title="Cost from ingredient prices per kg"'}><b>${isRoot ? NL.money(cc.batch + (a.packaging || []).reduce((t, r) => t + (+r.cost || 0), 0) + laborOf(a)) : NL.money(cc.perG * 1000)}${cc.missing ? '*' : ''}</b><span>${isRoot ? 'cost / portion' : 'cost / kg'}</span></div>
        </div>
      </div>
      <div class="rc-body">
        <table class="rc-tbl"><thead><tr><th>Ingredient</th><th class="r hc-w">Weight</th><th class="r hc-pc">Relative %</th><th class="r hc-bk" title="Baker's percentage: weight relative to the base ingredient (100%)">Baker %</th><th class="r hc-cost" title="Cost of this row: price per kg × weight">Cost</th>${showSc ? `<th class="r scl" title="Weights for the target below; your Weight column is not changed">Scaled<div class="scl-ctl">${scTog(-1)}</div></th>` : ''}${showSub ? `<th class="r scl fromsub" title="One portion of this assembly using each sub-assembly's portion in use (chosen on each sub-assembly card). Your weights here are not changed">Sub portions<div class="scl-ctl">${scTog('sub')}</div></th>` : ''}${vp.map(({ p, k }) => `<th class="r scl${pcls(k)}" title="Pinned: ${p.mode === 'portion' ? 'scale by portion' : 'scale by yield'}">${p.mode === 'portion' ? `${NL.fmt(p.size, 1)} g × ${NL.fmt(p.count, 2)}` : p.mode === 'base' ? `Base ${NL.fmt(p.target, 1)} g` : `Yield ${NL.fmt(p.target, 1)} g`}<button class="scl-unpin" data-sclunpin="${id}:${k}" title="Remove this column">×</button><div class="scl-ctl">${scTog(k)}</div></th>`).join('')}<th></th></tr></thead><tbody>${rows}${pkRows}${lbRows}</tbody>
          ${a.items.length ? `<tfoot>${bset.length > 1 || a.baseName ? `<tr class="rc-base"><td><span class="rc-base-nm" data-basename="${id}" title="Click to rename the base">${NL.esc(bname)}${a.baseName ? ' <small>(Base)</small>' : ''}</span></td><td class="r w">${NL.fmt(baseAmt, 2)}<span class="u">g</span></td><td class="r pc">${NL.pct(baseAmt, c.batch)}</td><td class="r bk">100%</td><td class="r cost"></td>${scCell(baseAmt)}<td class="x"><button class="rc-del rc-base-x" data-delbase="${id}" title="Remove this base (clears its name and B marks)">×</button></td></tr>` : ''}<tr class="rc-tot"><td>Total</td><td class="r w">${NL.fmt(c.batch, 2)}<span class="u">g</span>${gross(c.batch)}</td><td class="r pc">100%</td><td class="r bk" title="Total formula percentage">${baseAmt > 0 ? NL.fmt(c.batch / baseAmt * 100, 1) + '%' : `<span class="bk-hint">${bset.length ? 'base has no weight' : 'press B to pick a base'}</span>`}</td><td class="r cost" ${costTip ? `title="${costTip}"` : ''}>${NL.money(costAll)}${allStar}</td>${scCells(f => `${NL.fmt(c.batch * f, 2)}<span class="u">g</span>${gross(c.batch, f)}`, { v: costAll, miss: allMissing > 0 }, { html: `${NL.fmt(subFood, 2)}<span class="u">g</span>${gross(subFood)}`, usd: { v: subAll, miss: allMissing > 0 } })}<td></td></tr>${showSc || vp.length ? costRow() : ''}</tfoot>` : ''}</table>
        <div class="rc-sec rc-fw bo ${fwErr[id] ? 'bad' : ''}">
          <label>${isRoot ? 'Final portion weight' : 'Final weight after cooking'} <input class="num" inputmode="decimal" data-fk="fw-${id}" data-fw="${id}" value="${+c.yielded.toFixed(1)}" placeholder="${+c.batch.toFixed(1)}"> g</label>
          <span class="rc-fw-res">from ${NL.fmt(c.batch)} g · <b>Yield ${NL.fmt(NL.yieldPct(a.yieldLoss), 1)}%</b> · Loss ${NL.fmt(+a.yieldLoss || 0, 1)}% (${NL.fmt(c.lossG)} g)</span>
          ${fwErr[id] ? `<div class="rc-fw-err">⚠ ${NL.esc(fwErr[id])}</div>` : ''}
        </div>
        <div class="rc-add bo">
          <button data-addi="${id}">+ Ingredient</button>
          <button data-basename="${id}" title="${a.baseName ? 'Rename the base group' : 'Name the base group (e.g. Total Flour), then press B on each ingredient that belongs to it'}">${a.baseName ? '✎ Rename base group' : '+ Base group'}</button>
          <button class="s" data-adds="${id}">＋ New sub-assembly</button>
          <button class="s" data-addl="${id}">↳ Link to assembly</button>
          <button class="pk" data-pkadd="${id}" title="Add a packaging item (pouch, film, box…) with its cost">+ Packaging</button>
          <button class="lb" data-lbadd="${id}" title="Add an approximate labor cost (task time × people × hourly rate)">+ Labor</button>
        </div>
        ${isRoot && !a.items.length ? `<div class="rc-sec guide bo"><b>Building from scratch</b><ol>
          <li>Name your assembly in the title above.</li>
          <li>Add raw ingredients with <b>+ Ingredient</b>, or drag them from the library onto this card.</li>
          <li>Need a component (a sauce, a broth)? Click <b>＋ New sub-assembly</b>. It opens its own linked card where you add its ingredients.</li>
          <li>Type the weight on each row. Batch, yield, % and nutrition update as you type.</li></ol></div>` : ''}
        ${c.batch > 0 ? `<div class="rc-sec rc-bscale">${scaleControls(id, a, c, sc)}<span class="scl-addrow"><button class="scl-add" data-sclpin="${id}" ${pins.length >= 4 ? 'disabled title="Up to 4 columns. Remove one with × first"' : pins.some(p => samePin(p, sc)) ? 'disabled title="These numbers are already a column. Change them above to add another"' : 'title="Add these numbers as a column, to compare with others"'}>${pins.length < 4 && pins.some(p => samePin(p, sc)) ? '✓ Already a column' : '+ Add as column'}</button><span class="faint">${pins.length} of 4 columns</span><span class="faint scl-note">${flip ? 'scaling side · read-only · press Building to edit' : 'reads your weights · never changes them'}</span></span></div>` : ''}
        <div class="bo">${nutSection(id, a, c, isRoot)}</div>
        <div class="rc-sec bo">
          <div class="rc-h">Procedure <button class="rc-mini" data-addstep="${id}">+ Step</button></div>
          <ol class="rc-steps">${(a.steps || []).map((s, i) => `<li><input data-fk="st-${id}-${i}" data-step="${id}:${i}" value="${NL.esc(s)}" placeholder="Describe this step…"><button class="rc-del" data-delstep="${id}:${i}">×</button></li>`).join('')}</ol>
        </div>
        <div class="rc-sec bo">
          <div class="rc-h">Notes · heating · tasting</div>
          <textarea class="rc-notes" data-fk="nt-${id}" data-notes="${id}" placeholder="Add notes…">${NL.esc(a.notes || '')}</textarea>
        </div>
      </div>
    </div>`;
  }

  // Nutrition for any card: a one-line summary per 100 g, or the full label when opened.
  // Cost of one row: ingredients use their price per kg (click to change it); sub-assemblies use their card's cost per gram.
  // cost of one row as a number (null when there is no price), for the scaled columns
  function rowCost(it) {
    const sid = subIdOf(it.ref), amt = +it.amount || 0;
    if (sid) { const k = cost[sid]; return k ? { v: amt * k.perG, miss: !!k.missing } : null; }
    const p = NL.price(it.ref.slice(4));
    return p == null ? null : { v: amt / 1000 * p };
  }
  function costCell(it, locked = false) {
    const sid = subIdOf(it.ref), amt = +it.amount || 0;
    if (sid) { const k = cost[sid]; return `<td class="r cost" title="${k ? NL.money(k.perG * 1000) + ' per kg, from its card' : ''}">${k ? NL.money(amt * k.perG) + (k.missing ? '*' : '') : '—'}</td>`; }
    const iid = it.ref.slice(4), p = NL.price(iid), name = NL.esc(NL.ingMap[iid]?.name || iid);
    const tip = p == null ? `No price yet for ${name}. Click to add a price per kg` : `${NL.money(p)} per kg${NL.isSamplePrice(iid) ? ' (sample price)' : ''}. Click to change`;
    if (locked) return `<td class="r cost" title="${p == null ? `No price yet for ${name}` : `${NL.money(p)} per kg`}. Prices are set on the Building side">${p == null ? '—' : NL.money(amt / 1000 * p)}</td>`;
    return `<td class="r cost"><button class="cost-b ${p == null ? 'none' : NL.isSamplePrice(iid) ? 'sample' : ''}" data-price="${iid}" title="${tip}">${p == null ? 'add $' : NL.money(amt / 1000 * p)}</button></td>`;
  }

  // Sub-assembly scaling: by finished yield, or by portion size × number of portions (default portion = amount used in the parent)
  // Scaling is a read-only planning view: it reads the card's weights and fills the scaled columns. It never changes a weight.
  function scaleOf(a, c, parents, isRoot = false) {
    const baseAmt = baseTotal(a), hasBase = baseAmt > 0;
    // the final assembly scales by portion or base only (no scale by yield)
    const mode = a.scaleMode === 'base' && hasBase ? 'base' : a.scaleMode === 'portion' || isRoot ? 'portion' : 'yield';
    const size = a.portionSize ?? (+parents[0]?.amount || +c.yielded.toFixed(2) || 100), count = a.portionCount ?? 1;
    const target = mode === 'portion' ? size * count : mode === 'base' ? (a.baseTarget ?? baseAmt) : (a.scaleTarget ?? c.yielded);
    const f = mode === 'base' ? target / baseAmt : c.yielded > 0 ? target / c.yielded : 1;
    return { mode, size, count, target, f, hasBase, baseAmt };
  }
  const samePin = (p, sc) => p.mode === sc.mode && (sc.mode === 'portion' ? Math.abs(p.size - sc.size) < 0.005 && Math.abs(p.count - sc.count) < 0.005 : Math.abs(p.target - sc.target) < 0.005);
  const pinFactor = (p, c, baseAmt) => p.mode === 'base' ? (baseAmt > 0 ? p.target / baseAmt : 1) : c.yielded > 0 ? p.target / c.yielded : 1;
  // the weight of one portion for a pinned scaling (shown as "portion size" when that column is the active scaling)
  const pinPortion = (p, c, baseAmt) => p.mode === 'portion' ? +p.size : c.yielded * pinFactor(p, c, baseAmt);
  const activePin = a => (a.scalePins || []).find(p => p.id && p.id === a.activePin);
  function scaleControls(id, a, c, sc) {
    const btn = (m, label, ok = true) => `<button class="${sc.mode === m ? 'on' : ''}" data-sclmode="${id}:${m}" ${ok ? '' : 'disabled title="Press B on an ingredient to choose a base first"'}>${label}</button>`;
    const seg = `<span class="scl-seg">${id === S.root ? '' : btn('yield', 'Scale by yield')}${btn('portion', 'Scale by portion')}${btn('base', 'Scale by base', sc.hasBase)}</span>`;
    const inputs = sc.mode === 'yield'
      ? `<input class="num" inputmode="decimal" data-fk="sct-${id}" data-sct="${id}" value="${+sc.target.toFixed(2)}" title="Finished weight you want after cooking loss"> g yield`
      : sc.mode === 'portion'
        ? `<input class="num" inputmode="decimal" data-fk="psz-${id}" data-psz="${id}" value="${+(+sc.size).toFixed(2)}" title="Finished weight of one portion"> g × <input class="num scl-n" inputmode="decimal" data-fk="pcn-${id}" data-pcn="${id}" value="${+(+sc.count).toFixed(2)}" title="Number of portions"> portion${sc.count === 1 ? '' : 's'}`
        : `<input class="num" inputmode="decimal" data-fk="sbt-${id}" data-sbt="${id}" value="${+sc.target.toFixed(2)}" title="Base weight you want; every Baker % is kept"> g of ${NL.esc(baseLabel(a))}`;
    const same = Math.abs(sc.f - 1) < 0.0005;
    return `<span class="rc-sc scl-row">${seg} ${inputs}
      <span class="faint">→ batch ${NL.fmt(c.batch * sc.f, 2)} g${same ? '' : ` (×${NL.fmt(sc.f, 3)})`}</span></span>`;
  }

  // ---------- packaging: any number of rows per card (name, cost, optional dimensions for later calculations) ----------
  const PK_UNITS = ['mm', 'cm', 'in'];
  // ---------- labor: approximate cost per task (minutes × people × hourly rate) ----------
  const LB_RATE = 'nlv3_labor_rate';
  const laborCost = r => r.minutes != null && r.rate != null ? r.minutes / 60 * (r.people ?? 1) * r.rate : null;
  const laborOf = a => (a.labor || []).reduce((t, r) => t + (laborCost(r) || 0), 0);
  function laborForm(cur = null) {
    return new Promise(resolve => {
      let lastRate = ''; try { lastRate = localStorage.getItem(LB_RATE) || ''; } catch { }
      const ov = document.createElement('div'); ov.className = 'nl-prompt-ov';
      ov.innerHTML = `<form class="nl-prompt nif">
        <div class="nl-prompt-label">${cur ? 'Edit labor' : 'Add labor'}</div>
        <label class="nif-f"><span>Task</span><input name="name" required placeholder="e.g. Prep, cooking, packing"></label>
        <div class="nif-grid lab-form">
          <label class="nif-n"><span>Time (minutes)</span><input name="minutes" inputmode="decimal" placeholder="e.g. 30"></label>
          <label class="nif-n"><span>People</span><input name="people" inputmode="decimal" value="1"></label>
          <label class="nif-n"><span>Rate ($ per hour)</span><input name="rate" inputmode="decimal" value="${lastRate}" placeholder="e.g. 18"></label>
        </div>
        <div class="pk-form-err" hidden></div>
        <div class="nl-prompt-btns"><button type="submit" class="btn primary">${cur ? 'Save' : 'Add labor'}</button><button type="button" class="btn ghost nl-prompt-cancel">Cancel</button></div>
      </form>`;
      document.body.appendChild(ov);
      const f = ov.querySelector('form'), err = ov.querySelector('.pk-form-err');
      if (cur) for (const k of ['name', 'minutes', 'people', 'rate']) if (cur[k] != null) f.elements[k].value = cur[k];
      f.elements.name.focus();
      const done = v => { ov.remove(); resolve(v); };
      const num = (field, label) => { const t = f.elements[field].value.trim(); if (!t) return null; const v = NL.parseNum(t); if (!isFinite(v) || v < 0) throw [label, field]; return v; };
      f.onsubmit = e => {
        e.preventDefault();
        const name = f.elements.name.value.trim(); if (!name) return f.elements.name.focus();
        try {
          const r = { id: cur?.id || NL.uid('l'), name, minutes: num('minutes', 'Time'), people: num('people', 'People') ?? 1, rate: num('rate', 'Rate') };
          if (r.rate != null) try { localStorage.setItem(LB_RATE, String(r.rate)); } catch { }
          done(r);
        } catch ([label, field]) { err.hidden = false; err.textContent = `${label} must be a number, like 12.5`; f.elements[field].focus(); }
      };
      ov.querySelector('.nl-prompt-cancel').onclick = () => done(null);
      ov.addEventListener('pointerdown', e => { if (e.target === ov) done(null); });
      f.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } });
    });
  }

  function packagingForm(cur = null) {
    return new Promise(resolve => {
      const ov = document.createElement('div'); ov.className = 'nl-prompt-ov';
      ov.innerHTML = `<form class="nl-prompt nif">
        <div class="nl-prompt-label">${cur ? 'Edit packaging' : 'Add packaging'}</div>
        <label class="nif-f"><span>Name</span><input name="name" required placeholder="e.g. Pouch, film, box"></label>
        <label class="nif-f"><span>Weight per unit in g (optional)</span><input name="weight" inputmode="decimal" placeholder="e.g. 4.5"></label>
        <label class="nif-f"><span>Cost per unit in $</span><input name="cost" inputmode="decimal" placeholder="e.g. 0.12"></label>
        <div class="nif-h">Dimensions <small>optional, for later calculations</small></div>
        <div class="nif-grid pk-form-dims">
          <label class="nif-n"><span>Length</span><input name="l" inputmode="decimal"></label>
          <label class="nif-n"><span>Width</span><input name="w" inputmode="decimal"></label>
          <label class="nif-n"><span>Height</span><input name="h" inputmode="decimal"></label>
          <label class="nif-n"><span>Unit</span><select name="unit">${PK_UNITS.map(u => `<option>${u}</option>`).join('')}</select></label>
        </div>
        <div class="pk-form-err" hidden></div>
        <div class="nl-prompt-btns"><button type="submit" class="btn primary">${cur ? 'Save' : 'Add packaging'}</button><button type="button" class="btn ghost nl-prompt-cancel">Cancel</button></div>
      </form>`;
      document.body.appendChild(ov);
      const f = ov.querySelector('form'), err = ov.querySelector('.pk-form-err');
      if (cur) for (const k of ['name', 'weight', 'cost', 'l', 'w', 'h', 'unit']) if (cur[k] != null) f.elements[k].value = cur[k];
      f.elements.name.focus();
      const done = v => { ov.remove(); resolve(v); };
      const num = (field, label) => { const t = f.elements[field].value.trim(); if (!t) return null; const v = NL.parseNum(t); if (!isFinite(v) || v < 0) throw label; return v; };
      f.onsubmit = e => {
        e.preventDefault();
        const name = f.elements.name.value.trim(); if (!name) return f.elements.name.focus();
        try { done({ id: cur?.id || NL.uid('k'), name, weight: num('weight', 'Weight'), cost: num('cost', 'Cost'), l: num('l', 'Length'), w: num('w', 'Width'), h: num('h', 'Height'), unit: f.elements.unit.value }); }
        catch (label) { err.hidden = false; err.textContent = `${label} must be a number, like 12.5`; f.elements[{ Weight: 'weight', Cost: 'cost', Length: 'l', Width: 'w', Height: 'h' }[label]].focus(); }
      };
      ov.querySelector('.nl-prompt-cancel').onclick = () => done(null);
      ov.addEventListener('pointerdown', e => { if (e.target === ov) done(null); });
      f.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } });
    });
  }

  function nutSection(id, a, c, isRoot) {
    if (!(c.yielded > 0)) return `<div class="rc-sec rc-nut"><div class="rc-h">Nutrition Facts</div><div class="faint">Add ingredients with weights to see nutrition.</div></div>`;
    const p = i => c.perG[i] * 100;
    const sum = `${Math.round(p(0))} kcal · Fat ${NL.fmt(p(1), 1)} g · Carbs ${NL.fmt(p(5), 1)} g · Protein ${NL.fmt(p(8), 1)} g · Sodium ${Math.round(p(4))} mg <span class="faint">per 100 g</span>`;
    const basis = a.nutBasis || (isRoot ? 'all' : '100');
    const seg = `<div class="nut-seg"><button class="${basis === 'all' ? 'on' : ''}" data-nutbasis="${id}:all">${isRoot ? 'Per portion' : 'Whole batch'}</button><label class="${basis === '100' ? 'on' : ''}" data-nutbasis="${id}:100" title="Type any serving size in grams">Per <input class="nut-g" inputmode="decimal" data-nutserv="${id}" data-fk="ns-${id}" value="${a.nutServing ?? 100}"> g</label></div>`;
    return `<div class="rc-sec rc-nut ${a.showNut ? 'open' : ''}">
      <div class="rc-h"><button class="rc-nut-tog" data-nuttog="${id}" title="${a.showNut ? 'Hide' : 'Show'} the Nutrition Facts label for this card">${a.showNut ? '▾' : '▸'} Nutrition Facts</button>${a.showNut ? seg : ''}</div>
      ${a.showNut ? `<div class="rc-nut-body">${NL.labelHTML(S, calc, id, basis === '100' ? (a.nutServing ?? 100) : undefined)}</div>` : `<div class="rc-nut-sum" data-nuttog="${id}">${sum}</div>`}
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
    // BOM-style tree: `rails` says, for each ancestor level, whether a vertical line continues below this row
    const item = (id, rails = [], last = true, depth = 0) => {
      const a = A(id); seen.add(id);
      const nIng = a.items.filter(it => it.ref.startsWith('ing:')).length;
      const kids = a.items.map(it => subIdOf(it.ref)).filter(s => s && A(s));
      const guide = depth ? `<span class="tg">${rails.map(r => `<i class="${r ? 'v' : ''}"></i>`).join('')}<i class="${last ? 'l' : 't'}"></i></span>` : '';
      return `<div class="tr-item ${id === S.root ? 'root' : ''}" data-goto="${id}">${guide}
        <span class="sw" style="background:${colorOf(id)}"></span><span class="nm">${NL.esc(a.name)}</span><span class="faint">${nIng} ing</span></div>` +
        (depth < 12 ? kids.map((k, i) => item(k, depth ? [...rails, !last] : [], i === kids.length - 1, depth + 1)).join('') : '');
    };
    let html = hasFinal() ? item(S.root, 0) : '', extra = '';
    // unlinked cards: list top-level ones first (their sub-assemblies nest under them), then anything left
    for (const id of Object.keys(S.asm)) if (!seen.has(id) && !parentsOf(id).length) extra += item(id, 0);
    for (const id of Object.keys(S.asm)) if (!seen.has(id)) extra += item(id, 0);
    if (extra) html += `<div class="tr-sep">${hasFinal() ? 'Not used in the assembly' : 'No final card yet. Use the Final toggle on a card'}</div>` + extra;
    if (!html) html = '<div class="tr-sep">No cards yet</div>';
    $('#tree').innerHTML = html;
  }
  function drawNut() {
    const nut = $('#nut');
    if (!$('#cmain').classList.contains('show-nut')) { nut.innerHTML = ''; return; }
    // every card's label, in assembly order; each uses the serving basis chosen on its card
    const ids = sheetOrder();
    nut.innerHTML = ids.length ? ids.map(id => {
      const a = A(id), c = calc[id], isRoot = id === S.root, basis = a.nutBasis || (isRoot ? 'all' : '100');
      const per = basis === '100' ? `per ${NL.fmt(a.nutServing ?? 100, 1)} g` : isRoot ? 'per portion' : 'whole batch';
      return `<div class="nut-card">
        <div class="nut-h" data-goto="${id}" title="Go to this card"><span class="sw" style="background:${colorOf(id)}"></span><b>${NL.esc(a.name)}</b><span class="faint">${isRoot ? 'Final' : 'Sub-assembly'} · ${per}</span></div>
        ${c.yielded > 0 ? NL.labelHTML(S, calc, id, basis === '100' ? (a.nutServing ?? 100) : undefined) : '<div class="nut-empty">No ingredients with weights yet.</div>'}
      </div>`;
    }).join('') : '<div class="nut-empty">Add a card to see nutrition.</div>';
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
  // real card widths (a card on its Scaling side grows to fit its pinned columns)
  function widths() {
    const w = {};
    cardsEl.querySelectorAll('.rcard').forEach(el => { w[el.dataset.id] = el.offsetWidth || CARDW; });
    return w;
  }
  function arrange() {
    if (view === 'sheet') { S._arrange = true; return render(); } // board layout is done when the board is shown
    render();
    const H = heights(), W = widths(), placed = new Set(), colBottom = [], depth = {};
    const place = (id, d, desired) => {
      if (placed.has(id)) return; placed.add(id);
      const a = A(id);
      depth[id] = d;
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
    // each column is as wide as its widest card
    const colW = [], colX = [0];
    for (const [id, d] of Object.entries(depth)) colW[d] = Math.max(colW[d] || CARDW, W[id]);
    for (let d = 1; d < colW.length; d++) colX[d] = colX[d - 1] + (colW[d - 1] || CARDW) + GAPX;
    for (const [id, d] of Object.entries(depth)) A(id).x = colX[d] + (id === S.root ? -20 : 0);
    let y = Math.max(0, ...colBottom.filter(v => v != null)) + 80;
    for (const id of Object.keys(S.asm)) if (!placed.has(id)) { A(id).x = (colW[0] || CARDW) + GAPX; A(id).y = y; y += H[id] + GAPY; }
    render();
  }
  function bounds() {
    if (!Object.keys(S.asm).length) return { x: 0, y: 0, w: 900, h: 600 };
    const H = heights(), W = widths(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [id, a] of Object.entries(S.asm)) { x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x + (W[id] || CARDW) + 20); y1 = Math.max(y1, a.y + (H[id] || 300)); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function goto(id) {
    const a = A(id), el = cardsEl.querySelector(`[data-id="${id}"]`); if (!a || !el) return;
    if (view === 'sheet') el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else vp.centerOn(a.x + CARDW / 2, a.y + Math.min(el.offsetHeight, 500) / 2, Math.max(vp.v.s, 0.7));
    setTimeout(() => { const e2 = cardsEl.querySelector(`[data-id="${id}"]`); e2?.classList.remove('flash'); void e2?.offsetWidth; e2?.classList.add('flash'); }, 150);
  }

  // ---------- sheet view: the same cards stacked top to bottom, in an order the chef sets ----------
  const SHEET_EMPTY = `<div class="empty-hint sv-empty"><b>Blank assembly</b><span>Start with any card: a sub-assembly (a sauce, a broth) or the final dish. Use the <i>Final / Sub-assembly</i> switch on each card. Cards stack top to bottom; drag ⠿ to reorder.</span><button class="btn primary" data-emptyadd>＋ Add card</button></div>`;
  const PREFS = 'nlv3_sheet_prefs';
  const prefs = { links: 'jump', width: 'full' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS)) || {}); } catch { }
  function applyPrefs() {
    svEl.className = `sheetview lk-${prefs.links} w-${prefs.width}`;
    svEl.querySelectorAll('[data-svlinks]').forEach(b => b.classList.toggle('on', b.dataset.svlinks === prefs.links));
    svEl.querySelectorAll('[data-svwidth]').forEach(b => b.classList.toggle('on', b.dataset.svwidth === prefs.width));
  }
  function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { } applyPrefs(); }
  applyPrefs();

  // saved order first, then any new cards; with no saved order, final assembly then its sub-assemblies depth-first
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
  new ResizeObserver(() => withSide('left', () => { if (view === 'sheet' && prefs.links === 'lines') drawSheetLinks(); })).observe(svCardsEl);
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
    useSide('left');
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
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest?.('#svCards, #spCards')) return;
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
    if (a.face === 'scale') return NL.toast(`"${a.name}" is showing its Scaling side. Press Building to add to it`);
    if (value === 'new-sub') return newSub(id);
    if (value.startsWith('fav:')) return useFav(value.slice(4), id);
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
    S.asm[nid] = { name: 'New sub-assembly', items: [], yieldLoss: 0, steps: [], notes: '', color, x: p.x + CARDW + GAPX, y: p.y + (el ? el.offsetHeight : 200) - 120 };
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
    NL.toast('Name the sub-assembly, then set its weight in "' + p.name + '"');
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
    NL.toast(view === 'sheet' ? 'Card added at the bottom. Link it with ↳ Link to assembly' : 'Card added. Drag its ● onto the assembly that uses it, or add it later with + Ingredient');
  }
  function linkCard(child, parent) {
    if (A(parent).face === 'scale') return NL.toast(`"${A(parent).name}" is showing its Scaling side. Press Building to link to it`);
    if (A(parent).items.some(it => it.ref === 'asm:' + child)) return NL.toast('Already linked');
    if (wouldCycle(parent, child)) return NL.toast('That would create a loop');
    addItem(parent, 'asm:' + child);
    NL.toast(`Linked. Set how many grams of "${A(child).name}" go into "${A(parent).name}"`);
  }
  // ---------- copy / paste cards (clipboard lives in localStorage so it works across tabs) ----------
  const CLIP = 'nlv3_card_clipboard';
  const readClip = () => { try { return JSON.parse(localStorage.getItem(CLIP)); } catch { return null; } };
  function updatePasteBtn() {
    const c = readClip(), btn = $('#pasteCard');
    btn.hidden = !c?.cards;
    if (c?.cards) btn.title = `Paste "${c.cards[c.top].name}"${Object.keys(c.cards).length > 1 ? ` with ${Object.keys(c.cards).length - 1} sub-assembly card(s)` : ''} as a new unlinked card (Ctrl+V)`;
  }
  function copyCard(id) {
    const ids = [id, ...descendants(id)];
    const cards = Object.fromEntries(ids.map(k => [k, JSON.parse(JSON.stringify(A(k)))]));
    try { localStorage.setItem(CLIP, JSON.stringify({ top: id, cards })); } catch { return NL.toast('Could not copy the card'); }
    updatePasteBtn();
    NL.toast(`Copied "${A(id).name}"${ids.length > 1 ? ` with ${ids.length - 1} sub-assembly card(s)` : ''}. Paste with 📋 Paste card or Ctrl+V`);
  }
  // Insert a set of cards ({ top, cards }) as fresh copies. With `parent`, the top card is linked into that card.
  function insertCards(clip, { parent = null, suffix = '' } = {}) {
    const map = Object.fromEntries(Object.keys(clip.cards).map(k => [k, NL.uid('s')]));
    const keys = [clip.top, ...Object.keys(clip.cards).filter(k => k !== clip.top)]; // top first, so board placement follows the links
    const top = clip.cards[clip.top], used = new Set(Object.values(S.asm).map(a => a.color));
    let dx = 0, dy = 0;
    if (view === 'board' && !parent) {
      const r = vpEl.getBoundingClientRect(), ctr = vp.toWorld(r.left + r.width / 2, r.top + r.height / 3);
      dx = Math.round(ctr.x - CARDW / 2 - (top.x || 0)); dy = Math.round(ctr.y - 60 - (top.y || 0));
    }
    for (const k of keys) {
      const n = JSON.parse(JSON.stringify(clip.cards[k])); delete n.kind; delete n.favId; delete n._place;
      n.items = n.items.filter(it => !subIdOf(it.ref) || map[subIdOf(it.ref)]).map(it => { const s = subIdOf(it.ref); return s ? { ...it, ref: 'asm:' + map[s] } : it; });
      if (k === clip.top) n.name = n.name + suffix;
      if (!n.color || n.color === ROOT_COLOR) n.color = COLORS.find(c => !used.has(c)) || COLORS[Object.keys(S.asm).length % COLORS.length];
      used.add(n.color);
      n.x = (n.x || 0) + dx; n.y = (n.y || 0) + dy;
      if (view === 'sheet' || parent) n._place = true;
      S.asm[map[k]] = n;
    }
    const nid = map[clip.top];
    if (parent) {
      A(parent).items.push({ ref: 'asm:' + nid, amount: 0 });
      if (S.order) S.order.splice(S.order.indexOf(parent) + 1, 0, ...keys.map(k => map[k]));
    }
    render();
    if (view === 'board' && parent) placeNewCards();
    commit();
    if (parent) focusAmt(parent, A(parent).items.length - 1); else goto(nid);
    return nid;
  }

  // ---------- favorites: saved cards (with their sub-assembly cards) reusable in any assembly ----------
  const FAV = 'nlv3_favorites';
  let favCache = null;
  const readFavs = () => favCache || (favCache = (() => { try { return JSON.parse(localStorage.getItem(FAV)) || []; } catch { return []; } })());
  const favById = fid => readFavs().find(f => f.id === fid);
  const favOf = id => { const f = A(id)?.favId; return f ? favById(f) : null; };
  function writeFavs(list) {
    try { localStorage.setItem(FAV, JSON.stringify(list)); } catch { NL.toast('Could not save favorites: browser storage is full'); return false; }
    favCache = list; drawFavs(); return true;
  }
  function saveFav(id) {
    const a = A(id), list = readFavs().slice(), existing = favOf(id), ids = [id, ...descendants(id)];
    const entry = { id: existing?.id || NL.uid('f'), name: a.name, savedAt: Date.now(), top: id, cards: Object.fromEntries(ids.map(k => [k, JSON.parse(JSON.stringify(A(k)))])) };
    if (existing) list[list.findIndex(f => f.id === existing.id)] = entry; else list.unshift(entry);
    if (!writeFavs(list)) return;
    a.favId = entry.id; render(); commit();
    NL.toast(existing ? `Updated "${a.name}" in your favorites` : `Saved "${a.name}" to favorites${ids.length > 1 ? ` with ${ids.length - 1} sub-assembly card(s)` : ''}`);
  }
  function removeFav(fid) { const f = favById(fid); writeFavs(readFavs().filter(x => x.id !== fid)); render(); if (f) NL.toast(`Removed "${f.name}" from favorites`); }
  function useFav(fid, parent) {
    if (parent && A(parent)?.face === 'scale') return NL.toast(`"${A(parent).name}" is showing its Scaling side. Press Building to add to it`);
    const f = favById(fid); if (!f) return NL.toast('That favorite no longer exists');
    insertCards(f, { parent });
    NL.toast(parent ? `Added "${f.name}" to "${A(parent).name}". Set its weight` : `Added "${f.name}" as a new card`);
  }
  function favMenu(id, anchor) {
    document.querySelector('.fav-menu')?.remove();
    const r = anchor.getBoundingClientRect(), m = document.createElement('div'); m.className = 'fav-menu';
    m.innerHTML = `<button data-fm="up">↻ Update saved copy with this card</button><button data-fm="rm" class="danger">Remove from favorites</button>`;
    m.style.left = Math.max(8, Math.min(r.right - 230, innerWidth - 240)) + 'px'; m.style.top = (r.bottom + 6) + 'px';
    document.body.appendChild(m);
    const off = e => { if (!m.contains(e.target)) close(); };
    const close = () => { m.remove(); removeEventListener('pointerdown', off, true); };
    setTimeout(() => addEventListener('pointerdown', off, true));
    m.onclick = e => { const b = e.target.closest('[data-fm]'); if (!b) return; close(); if (b.dataset.fm === 'up') saveFav(id); else removeFav(A(id).favId); };
  }
  function drawFavs() {
    const list = readFavs();
    $('#favList').innerHTML = list.length ? list.map(f => {
      const t = f.cards[f.top], nIng = t.items.filter(it => it.ref.startsWith('ing:')).length, nSub = Object.keys(f.cards).length - 1;
      return `<div class="fav-item" draggable="true" data-favdrag="${f.id}" title="Drag onto a card to add it as a sub-assembly, or click ＋ to add it as a new card">
        <span class="fav-star">★</span><span class="nm">${NL.esc(f.name)}</span><span class="faint">${nIng} ing${nSub ? ` · ${nSub} sub` : ''}</span>
        <button class="fav-b" data-favadd="${f.id}" title="Add to this assembly as a new card">＋</button><button class="fav-b x" data-favdel="${f.id}" title="Remove from favorites">×</button></div>`;
    }).join('') : '<div class="fav-empty">Click ☆ on any card to save it here, then reuse it in any assembly.</div>';
  }
  $('#favList').addEventListener('dragstart', e => { const it = e.target.closest('[data-favdrag]'); if (it) { e.dataTransfer.setData('text/plain', 'fav:' + it.dataset.favdrag); e.dataTransfer.effectAllowed = 'copy'; } });
  addEventListener('storage', e => { if (e.key === FAV) { favCache = null; drawFavs(); render(); } });

  function pasteCard() {
    const clip = readClip(); if (!clip?.cards) return NL.toast('Nothing copied yet');
    insertCards(clip, { suffix: ' (copy)' });
    NL.toast(view === 'sheet' ? 'Card pasted at the bottom' : 'Card pasted. Drag its ● onto an assembly to use it');
  }
  addEventListener('storage', e => { if (e.key === CLIP) updatePasteBtn(); });

  // ---------- split view: a second editable side ----------
  // Each side has its own assembly, undo history and card containers. Before any click, key or edit, the side it
  // happened on becomes current (its values are swapped into the globals the rest of the code uses).
  // When both sides show the same tab they share one assembly and one undo history.
  const split = { on: false, tab: null, card: '' };
  let side = 'left', leftCtx = null, right = null; // right: { tab, shared, S, hist }
  const grab = () => ({ S, hist, view, cardsEl, svCardsEl, svInnerEl, svLinksEl, svEl, calc, cost, orderIdx, depthMap });
  const put = x => { ({ S, hist, view, cardsEl, svCardsEl, svInnerEl, svLinksEl, svEl, calc, cost, orderIdx, depthMap } = x); };
  function rightCtx() {
    const tabs = wb.all(), act = tabs.find(t => t.active);
    if (!tabs.some(t => t.id === split.tab)) split.tab = act.id;
    const shared = split.tab === act.id;
    if (!right || right.tab !== split.tab || right.shared !== shared) {
      right = { tab: split.tab, shared };
      if (!shared) {
        right.S = tabs.find(t => t.id === split.tab).state;
        right.hist = NL.history(() => wb.saveTab(right.tab, right.S), () => right.S, s => { right.S = s; if (side === 'right') S = s; render(); });
      }
    }
    if (shared) { right.S = leftCtx.S; right.hist = leftCtx.hist; }
    return { S: right.S, hist: right.hist, view: 'sheet', cardsEl: $('#spCards'), svCardsEl: $('#spCards'), svInnerEl: $('#spInner'), svLinksEl: $('#spLinks'), svEl: $('#spBody'), calc, cost, orderIdx: {}, depthMap: {} };
  }
  function rawSwap(to) {
    if (to === side || (to === 'right' && !split.on)) return false;
    const cur = grab();
    if (side === 'left') leftCtx = cur;
    else if (right) { right.S = cur.S; if (right.shared) leftCtx.S = cur.S; }
    side = to;
    put(to === 'left' ? leftCtx : rightCtx());
    return true;
  }
  function withSide(to, fn) { const from = side; if (to !== side && !rawSwap(to)) return; try { fn(); } finally { rawSwap(from); } }
  // user moved to the other side: finish the pending edit on this side first
  function useSide(to) {
    if (to === side || (to === 'right' && !split.on)) return;
    clearTimeout(typingT); commit();
    rawSwap(to); markSide();
  }
  function markSide() {
    $('#cmain').classList.toggle('side-right', side === 'right');
  }
  const saveCur = () => side === 'right' && right && !right.shared ? wb.saveTab(right.tab, S) : wb.save(S);
  const sideOf = t => t?.closest?.('#split') ? 'right' : t?.closest?.('#vp, #sheetView, .side, #nut') ? 'left' : null;
  for (const type of ['pointerdown', 'focusin', 'dragover', 'drop'])
    document.addEventListener(type, e => { const s = sideOf(e.target); if (s) useSide(s); }, true);

  function paintRight() {
    calc = NL.calc(S); cost = NL.cost(S, calc);
    const ord = sheetOrder(); orderIdx = Object.fromEntries(ord.map((id, k) => [id, k])); depthMap = depths();
    if (split.card && !S.asm[split.card]) split.card = '';
    const ids = split.card ? [split.card] : ord;
    cardsEl.innerHTML = ids.length ? ids.map(cardHTML).join('') : SHEET_EMPTY;
    stickCols(cardsEl);
    $('#split').className = `split lk-${prefs.links} w-${prefs.width}`;
    drawSheetLinks();
    const tabs = wb.all(), L = side === 'right' ? leftCtx.S : S;
    $('#spTab').innerHTML = tabs.map(x => `<option value="${x.id}" ${x.id === split.tab ? 'selected' : ''}>${NL.esc(x.name)}${x.active ? ' (this sheet)' : ''}</option>`).join('');
    $('#spCard').innerHTML = '<option value="">All cards</option>' + ord.map(id => `<option value="${id}" ${id === split.card ? 'selected' : ''}>${NL.esc(S.asm[id].name)}</option>`).join('');
    $('#spLeft').innerHTML = '<option value="">Left: jump to card…</option>' + Object.keys(L.asm).map(id => `<option value="${id}">${NL.esc(L.asm[id].name)}</option>`).join('');
  }
  // draw both sides (each in its own context)
  function render() {
    if (side === 'right') { paintRight(); withSide('left', paintLeft); return; }
    paintLeft();
    $('#cmain').classList.toggle('split-on', split.on);
    if (split.on) withSide('right', paintRight); else { $('#spCards').innerHTML = ''; $('#spLinks').innerHTML = ''; }
    markSide();
  }
  function openSplit(tabId) {
    useSide('left');
    const tabs = wb.all(), act = tabs.find(t => t.active), others = tabs.filter(t => !t.active);
    split.on = true; split.card = ''; right = null;
    split.tab = tabId === act.id && others.length ? others[0].id : tabId;
    render(); setTimeout(drawLinks, 250);
  }
  function closeSplit() { useSide('left'); split.on = false; right = null; render(); setTimeout(drawLinks, 250); }
  $('#spTab').onchange = e => { useSide('left'); split.tab = e.target.value; split.card = ''; right = null; render(); };
  $('#spCard').onchange = e => { split.card = e.target.value; render(); $('#spBody').scrollTop = 0; };
  $('#spLeft').onchange = e => { const id = e.target.value; e.target.value = ''; if (!id) return; useSide('left'); goto(id); };
  $('#spClose').onclick = () => closeSplit();
  new ResizeObserver(() => withSide('right', () => { if (prefs.links === 'lines') drawSheetLinks(); })).observe($('#spCards'));

  // ---------- compare assemblies / versions ----------
  function recipeStats(state) {
    if (!state.root || !state.asm[state.root]) return null;
    const c = NL.calc(state), rc = c[state.root];
    return {
      batch: rc.batch, yielded: rc.yielded, loss: +state.asm[state.root].yieldLoss || 0,
      kcal100: rc.perG[0] * 100, cards: Object.keys(state.asm).length,
      nut: NL.NUTRIENTS.map((_, i) => rc.perG[i] * rc.yielded),
      ing: Object.fromEntries(NL.flatten(state, c, state.root)),
      cost: NL.cost(state, c)[state.root],
    };
  }
  function openCompare() {
    clearTimeout(typingT); commit();
    const all = wb.all(), tabs = all.filter(t => t.state.root && t.state.asm[t.state.root]), skipped = all.filter(t => !tabs.includes(t));
    if (tabs.length < 2) return NL.toast(skipped.length ? 'Compare needs two assemblies with a Final card. Use the Final toggle on a card' : 'Make a second tab first (＋ New assembly or ⎘ New Version), then compare');
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
      const body = !cols.length ? '<div class="cmp-empty">Tick at least one assembly above.</div>' : `<div class="cmp-scroll"><table class="cmp-tbl">
        <thead><tr><th></th>${cols.map(t => `<th>${NL.esc(t.name)}${t.id === baseId ? '<small>baseline</small>' : `<button class="cmp-mk" data-base="${t.id}" title="Compare everything against this assembly">set as baseline</button>`}</th>`).join('')}</tr></thead>
        <tbody>${sec('Summary')}
          ${row('Portion / batch weight', s => s.batch, ' g')}${row('Final weight (yield)', s => s.yielded, ' g')}${row('Cooking loss', s => s.loss, '%')}
          ${row('Calories per portion', s => s.nut[0], ' kcal', 0)}${row('Calories per 100 g', s => s.kcal100, ' kcal', 0)}${row('Cards in assembly', s => s.cards, '', 0)}
          ${row('Cost per portion ($)', s => s.cost.batch, '', 2)}${row('Cost per kg ($)', s => s.cost.perG * 1000, '', 2)}
          ${sec('Nutrition per portion')}
          ${NL.NUTRIENTS.slice(1).map((n, k) => row(n.label, s => s.nut[k + 1], ' ' + n.unit, n.unit === 'mg' ? 0 : 1)).join('')}
          ${sec('Raw ingredients per portion')}
          ${ingIds.map(iid => row(NL.esc(NL.ingMap[iid]?.name || iid), s => s.ing[iid] ?? null, ' g', 2)).join('')}</tbody>
      </table></div>`;
      ov.innerHTML = `<div class="cmp">
        <div class="cmp-top"><b>⇄ Compare assemblies</b><span class="spacer"></span>
          <label class="cmp-opt"><input type="checkbox" id="cmpDiff" ${diffOnly ? 'checked' : ''}> Only show differences</label>
          <button class="btn ghost cmp-x" title="Close (Esc)">×</button></div>
        <div class="cmp-pick">${tabs.map(t => `<label class="cmp-chip ${pick.has(t.id) ? 'on' : ''}"><input type="checkbox" data-pick="${t.id}" ${pick.has(t.id) ? 'checked' : ''}>${NL.esc(t.name)}${t.active ? ' <small>(open)</small>' : ''}</label>`).join('')}</div>
        ${body}
        ${skipped.length ? `<div class="cmp-foot">Not shown (no Final card yet): ${skipped.map(t => NL.esc(t.name)).join(', ')}</div>` : ''}
        <div class="cmp-foot">▲ / ▼ show the difference from the baseline column. Ingredient grams are the raw amounts that end up in one portion, including those inside sub-assemblies.</div>
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
      NL.toast(`"${a.name}" is now the final assembly${prev ? `. "${A(prev).name}" is now a sub-assembly` : ''}`);
    } else {
      if (S.root !== id) return;
      if (!a.color || a.color === ROOT_COLOR) a.color = nextColor();
      S.root = null;
      NL.toast(`"${a.name}" is now a sub-assembly. Mark any card as Final when you're ready`);
    }
    render(); commit();
  }
  function openPicker(id, anchor, mode) {
    const r = anchor.getBoundingClientRect();
    const subs = Object.entries(S.asm).filter(([sid]) => sid !== S.root && !wouldCycle(id, sid) && !A(id).items.some(it => it.ref === 'asm:' + sid))
      .map(([sid, a]) => ({ value: 'asm:' + sid, label: a.name, color: colorOf(sid), sub: 'sub-assembly' }));
    const favs = { label: '★ Favorites', items: readFavs().map(f => ({ value: 'fav:' + f.id, label: f.name, color: '#f59e0b', sub: 'favorite' })) };
    // the other direction: put this card into the Final assembly
    const toFinal = mode === 'link' && hasFinal() && id !== S.root && !A(S.root).items.some(it => it.ref === 'asm:' + id) && !wouldCycle(S.root, id)
      ? [{ label: 'Add this card to', items: [{ value: 'into:' + S.root, label: A(S.root).name, color: colorOf(S.root), sub: 'final assembly' }] }] : [];
    const groups = mode === 'link'
      ? [...toFinal, { label: 'Existing sub-assemblies', items: subs }, favs, { label: 'Create', items: [{ value: 'new-sub', label: '＋ New sub-assembly', color: '#7c5cff', always: true }] }]
      : [{ label: 'Sub-assemblies', items: subs }, favs, ...NL.ingredientGroups()];
    NL.picker({ x: r.left, y: r.bottom + 4, groups, placeholder: mode === 'link' ? 'Search sub-assemblies…' : 'Search ingredients…', onPick: v => v.startsWith('into:') ? linkCard(id, v.slice(5)) : addItem(id, v) });
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
    if (e.target.closest('input,button,textarea,a,select')) return;
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
    if (d.lbf) {
      const [id, k, f] = d.lbf.split(':'), r = A(id).labor?.[+k]; if (!r) return;
      const t = e.target.value.trim(), v = NL.parseNum(t);
      if (f === 'name') r.name = e.target.value;
      else if (t === '') r[f] = f === 'people' ? 1 : null;
      else if (isFinite(v) && v >= 0) { r[f] = v; if (f === 'rate') try { localStorage.setItem(LB_RATE, String(v)); } catch { } }
      renderKeep();
    }
    else if (d.pkn || d.pkc || d.pkd) {
      const [id, k, f] = (d.pkn || d.pkc || d.pkd).split(':'), r = A(id).packaging?.[+k]; if (!r) return;
      const t = e.target.value.trim(), v = NL.parseNum(t);
      if (d.pkn) r.name = e.target.value;
      else if (t === '') d.pkc ? r.cost = null : r[f] = null;
      else if (isFinite(v) && v >= 0) d.pkc ? r.cost = v : r[f] = v;
      renderKeep();
    }
    else if (d.amt) {
      const [id, i] = d.amt.split(':'), raw = e.target.value, v = raw.trim() === '' ? 0 : NL.parseNum(raw);
      if (!isFinite(v)) amtErr[d.amt] = 'Enter a weight in grams, e.g. 12.5';
      else if (v < 0) amtErr[d.amt] = "Weight can't be negative";
      else { delete amtErr[d.amt]; A(id).items[+i].amount = v; }
      renderKeep();
    }
    else if (d.title) { A(d.title).name = e.target.value; renderKeep(); }
    else if (d.fw) { setFinalWeight(d.fw, e.target.value); renderKeep(); }
    else if (d.sct || d.psz || d.pcn || d.sbt) {
      const id = d.sct || d.psz || d.pcn || d.sbt, a = A(id), v = NL.parseNum(e.target.value);
      if (v > 0) { if (d.sct) a.scaleTarget = v; else if (d.psz) a.portionSize = v; else if (d.sbt) a.baseTarget = v; else a.portionCount = v; renderKeep(); saveCur(); hist.sync(); }
    }
    else if (d.nutserv) { const v = NL.parseNum(e.target.value), a = A(d.nutserv); if (v > 0) { a.nutServing = v; a.nutBasis = '100'; renderKeep(); saveCur(); hist.sync(); } }
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
  const isField = d => d && (d.amt || d.title || d.fw || d.bk || d.bscale || d.wscale || d.step || d.notes || d.pkn || d.pkc || d.pkd || d.lbf);
  let typingT;
  document.addEventListener('input', e => { if (isField(e.target.dataset)) { clearTimeout(typingT); typingT = setTimeout(commit, 600); } });
  // portion size dropdown on top of a sub-assembly card: pick the active scaling (display only)
  document.addEventListener('change', e => {
    const pu = e.target.dataset?.pku;
    if (pu) { const [id, k] = pu.split(':'), r = A(id).packaging?.[+k]; if (r) { r.unit = e.target.value; render(); commit(); } return; }
    const id = e.target.dataset?.pssel; if (!id) return;
    const a = A(id), v = e.target.value;
    (a.scalePins || []).forEach(p => { if (!p.id) p.id = NL.uid('p'); });
    if (v) a.activePin = v; else delete a.activePin;
    render(); saveCur(); hist.sync();
  });
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
    if (e.key === 'Enter' && d && (d.amt || d.title || d.fw || d.bk || d.bscale || d.wscale || d.pkn || d.pkc || d.pkd || d.lbf)) e.target.blur();
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
    if ((b = q('[data-sclpin]'))) {
      const id = b.dataset.sclpin, a = A(id), sc = scaleOf(a, calc[id], parentsOf(id), id === S.root), list = a.scalePins || (a.scalePins = []);
      if (list.length >= 4) return NL.toast('Up to 4 pinned columns. Remove one with × first');
      if (list.some(p => samePin(p, sc))) return NL.toast('These numbers are already a column. Change them above to add another');
      list.push({ id: NL.uid('p'), mode: sc.mode, target: sc.target, size: sc.size, count: sc.count });
      render(); saveCur(); hist.sync(); return;
    }
    if ((b = q('[data-pkadd]'))) {
      const id = b.dataset.pkadd;
      packagingForm().then(r => { if (!r) return; (A(id).packaging || (A(id).packaging = [])).push(r); render(); commit(); NL.toast(`Added ${r.name}`); });
      return;
    }
    if ((b = q('[data-lbadd]'))) {
      const id = b.dataset.lbadd;
      laborForm().then(r => { if (!r) return; (A(id).labor || (A(id).labor = [])).push(r); render(); commit(); NL.toast(`Added ${r.name}`); });
      return;
    }
    if ((b = q('[data-lbedit]'))) {
      const [id, k] = b.dataset.lbedit.split(':'), list = A(id).labor;
      laborForm(list[+k]).then(r => { if (!r) return; list[+k] = r; render(); commit(); });
      return;
    }
    if ((b = q('[data-lbdel]'))) { const [id, k] = b.dataset.lbdel.split(':'); A(id).labor.splice(+k, 1); render(); commit(); return; }
    if ((b = q('[data-pkedit]'))) {
      const [id, k] = b.dataset.pkedit.split(':'), list = A(id).packaging;
      packagingForm(list[+k]).then(r => { if (!r) return; list[+k] = r; render(); commit(); });
      return;
    }
    if ((b = q('[data-pkdel]'))) { const [id, k] = b.dataset.pkdel.split(':'); A(id).packaging.splice(+k, 1); render(); commit(); return; }
    if ((b = q('[data-subpull]'))) {
      const [id, sid] = b.dataset.subpull.split(':'), a = A(id); if (!a) return;
      a.pulled = a.pulled || {};
      if (a.pulled[sid]) delete a.pulled[sid]; else a.pulled[sid] = true;
      if (!Object.keys(a.pulled).length) delete a.pulled;
      render(); saveCur(); hist.sync(); return;
    }
    if ((b = q('[data-sclshow]'))) {
      const [id, k, v] = b.dataset.sclshow.split(':'), a = A(id), t = k === 'sub' || +k < 0 ? a : a.scalePins?.[+k], key = k === 'sub' ? 'subShowCost' : +k < 0 ? 'scaleShowCost' : 'showCost';
      if (!t) return;
      if (v === '$') t[key] = true; else delete t[key];
      render(); saveCur(); hist.sync(); return;
    }
    if ((b = q('[data-scluse]'))) {
      const [id, k] = b.dataset.scluse.split(':'), a = A(id), p = a.scalePins[+k];
      if (!p) return;
      if (!p.id) p.id = NL.uid('p');
      if (a.activePin === p.id) delete a.activePin; else a.activePin = p.id;
      render(); saveCur(); hist.sync(); return;
    }
    if ((b = q('[data-sclunpin]'))) { const [id, k] = b.dataset.sclunpin.split(':'); A(id).scalePins.splice(+k, 1); render(); saveCur(); hist.sync(); return; }
    if ((b = q('[data-sclmode]'))) { const [id, m] = b.dataset.sclmode.split(':'), a = A(id); if (a.scaleMode === m || (!a.scaleMode && m === 'yield')) return; a.scaleMode = m; render(); saveCur(); hist.sync(); return; }
    if ((b = q('[data-nuttog]'))) { const a = A(b.dataset.nuttog); a.showNut = !a.showNut; render(); saveCur(); hist.sync(); return; }
    if ((b = q('[data-nutbasis]'))) { const [id, v] = b.dataset.nutbasis.split(':'); if (A(id).nutBasis === v) return; A(id).nutBasis = v; NL.keepFocus(render); saveCur(); hist.sync(); return; }
    if ((b = q('[data-price]'))) {
      const iid = b.dataset.price, name = NL.ingMap[iid]?.name || iid, cur = NL.price(iid);
      NL.prompt(`Price per kg for ${name} ($). Used everywhere this ingredient appears.`, cur == null ? '' : String(cur)).then(v => {
        if (v == null) return;
        const p = NL.parseNum(v);
        if (!isFinite(p) || p < 0) return NL.toast('Enter a price like 4.50');
        NL.setPrice(iid, p); render(); NL.toast(`${name}: ${NL.money(p)} per kg`);
      });
      return;
    }
    if ((b = q('[data-copycard]'))) return copyCard(b.dataset.copycard);
    if ((b = q('[data-fav]'))) { const id = b.dataset.fav; return favOf(id) ? favMenu(id, b) : saveFav(id); }
    if ((b = q('[data-favadd]'))) return useFav(b.dataset.favadd, null);
    if ((b = q('[data-favdel]'))) { const f = favById(b.dataset.favdel); if (f && confirm(`Remove "${f.name}" from favorites?`)) removeFav(f.id); return; }
    if ((b = q('[data-cut]'))) { const [pid, sid] = b.dataset.cut.split(':'); return unlink(pid, sid); }
    if ((b = q('[data-kind]'))) { const [k, id] = b.dataset.kind.split(':'); return setKind(id, k); }
    if ((b = q('[data-emptyadd]'))) return addCard();
    if ((b = q('[data-face]'))) { const [id, f] = b.dataset.face.split(':'); if ((A(id).face === 'scale' ? 'scale' : 'build') !== f) setFace(id, f); return; }
    if ((b = q('[data-collapse]'))) { const a = A(b.dataset.collapse); a.collapsed = !a.collapsed; render(); commit(); return; }
    if ((b = q('[data-addstep]'))) { const a = A(b.dataset.addstep); a.steps.push(''); render(); commit(); cardsEl.querySelector(`[data-step="${b.dataset.addstep}:${a.steps.length - 1}"]`)?.focus(); return; }
    if ((b = q('[data-delstep]'))) { const [id, i] = b.dataset.delstep.split(':'); A(id).steps.splice(+i, 1); render(); commit(); }
  });

  // library drag → card
  $('#libSearch').addEventListener('input', drawLib);
  $('#lib').addEventListener('dragstart', e => { const it = e.target.closest('.lib-item'); if (it) { e.dataTransfer.setData('text/plain', 'ing:' + it.dataset.ing); e.dataTransfer.effectAllowed = 'copy'; } });
  for (const dz of [vpEl, svEl, $('#spBody')]) dz.addEventListener('dragover', e => {
    e.preventDefault();
    const c = e.target.closest?.('.rcard');
    cardsEl.querySelectorAll('.drop').forEach(x => x !== c && x.classList.remove('drop'));
    c?.classList.add('drop');
  });
  for (const dz of [vpEl, svEl, $('#spBody')]) dz.addEventListener('drop', e => {
    e.preventDefault();
    cardsEl.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    const v = e.dataTransfer.getData('text/plain'), c = e.target.closest?.('.rcard');
    if (!v) return;
    if (v.startsWith('fav:')) return useFav(v.slice(4), c?.dataset.id || null);
    if (!c) return NL.toast('Drop the ingredient onto an assembly card');
    addItem(c.dataset.id, v);
  });

  document.addEventListener('keydown', e => {
    if (NL.isTyping()) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); hist.redo(); }
    else if (mod && e.key.toLowerCase() === 'v' && readClip()?.cards && !document.querySelector('.cmp-ov, .nl-prompt-ov')) { e.preventDefault(); pasteCard(); }
    else if ((e.key === 'f' || e.key === 'F') && side === 'left' && view === 'board') vp.fit(bounds());
  });

  $('#undo').onclick = () => hist.undo();
  $('#redo').onclick = () => hist.redo();
  $('#fit').onclick = () => { useSide('left'); vp.fit(bounds()); };
  // board: show or hide the link lines between cards (remembered per browser)
  { const btn = $('#linesBtn'); let off = false; try { off = localStorage.getItem('nlv3_hide_links') === '1'; } catch { }
    const apply = () => { document.body.classList.toggle('hide-links', off); btn.classList.toggle('off', off); btn.textContent = off ? '⤳ Lines off' : '⤳ Lines'; btn.setAttribute('aria-pressed', String(!off)); };
    btn.onclick = () => { off = !off; try { localStorage.setItem('nlv3_hide_links', off ? '1' : '0'); } catch { } apply(); };
    apply(); }
  $('#arrange').onclick = () => { useSide('left'); arrange(); commit(); vp.fit(bounds()); };
  $('#zin').onclick = () => vp.zoom(1.2);
  $('#zout').onclick = () => vp.zoom(1 / 1.2);
  const styleSel = $('#scaleStyle'); styleSel.value = scaleStyle;
  styleSel.onchange = () => { scaleStyle = styleSel.value === 'hide' ? 'hide' : 'flip'; try { localStorage.setItem('nlv3_scale_style', scaleStyle); } catch { } render(); };
  $('#toggleNut').onclick = () => {
    useSide('left');
    const m = $('#cmain'); m.classList.toggle('show-nut');
    $('#toggleNut').textContent = m.classList.contains('show-nut') ? 'All facts ◂' : 'All facts ▸';
    drawNut(); setTimeout(drawLinks, 220);
  };
  $('#newVer').onclick = async () => {
    useSide('left');
    const v = await NL.prompt('Version name (shown on the tab):', nameOf(S) + ' v' + (wb.count() + 1));
    if (!v) return;
    wb.add(JSON.parse(JSON.stringify(S)), v);
    NL.toast('Version "' + v + '" created');
  };
  $('#newRecipe').onclick = () => { useSide('left'); newRecipe(); };
  $('#addCard').onclick = () => addCard();
  $('#pasteCard').onclick = () => pasteCard();
  $('#compare').onclick = () => { useSide('left'); openCompare(); };
  // light / dark theme (first visit follows the computer's setting; the choice is remembered)
  function showTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('#themeBtn').textContent = dark ? '☀' : '☾';
    $('#themeBtn').title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  }
  $('#themeBtn').onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('nlv3_theme', t); } catch { }
    showTheme();
  };
  showTheme();
  // hide / show the left panel (remembered per browser)
  const SIDE = 'nlv3_side_hidden';
  function setSide(hidden) {
    $('#cmain').classList.toggle('hide-side', hidden);
    $('#sideTog').textContent = hidden ? '›' : '‹';
    $('#sideTog').title = hidden ? 'Show the panel (assembly structure and ingredient library)' : 'Hide the panel';
    try { localStorage.setItem(SIDE, hidden ? '1' : ''); } catch { }
    setTimeout(drawLinks, 220);
  }
  $('#sideTog').onclick = () => setSide(!$('#cmain').classList.contains('hide-side'));
  // drag handles to resize the left panel and the All facts panel (remembered per browser; double-click resets)
  (function panelResize() {
    const KEY = 'nlv3_panel_widths', m = $('#cmain');
    let w = {}; try { w = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { } };
    const apply = () => { for (const k of ['side', 'nut']) w[k] ? m.style.setProperty(`--${k}-w`, w[k] + 'px') : m.style.removeProperty(`--${k}-w`); };
    apply();
    for (const [which, min, max] of [['side', 180, 520], ['nut', 260, 680]]) {
      const h = document.createElement('div');
      h.className = `rsz rsz-${which}`; h.title = 'Drag to resize · double-click to reset';
      m.appendChild(h);
      h.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); m.classList.add('resizing'); h.classList.add('active');
        const r = m.getBoundingClientRect();
        const other = which === 'side' ? (m.classList.contains('show-nut') ? $('#nut').offsetWidth : 0) : (m.classList.contains('hide-side') ? 0 : $('.side').offsetWidth);
        const room = Math.max(min, r.width - other - 320); // always leave at least 320px for the canvas
        const mv = ev => { const px = which === 'side' ? ev.clientX - r.left : r.right - ev.clientX; w[which] = Math.round(Math.min(max, room, Math.max(min, px))); apply(); };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); m.classList.remove('resizing'); h.classList.remove('active'); save(); drawLinks(); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      h.addEventListener('dblclick', () => { delete w[which]; apply(); save(); setTimeout(drawLinks, 220); });
    }
  })();
  try { if (localStorage.getItem(SIDE)) setSide(true); } catch { }
  // TEMP: reset-to-sample button (remove with #resetSample in index.html)
  $('#resetSample').onclick = () => {
    useSide('left');
    if (!confirm('Replace this tab with the original sample assembly? Other tabs are not touched. You can undo with Ctrl+Z.')) return;
    S = fromSample(); arrange(); commit(); if (view === 'board') vp.fit(bounds(), 40, { min: 0.8, align: 'left' });
    NL.toast('Sample assembly restored');
  };
  $('#newIng').onclick = async () => { const i = await NL.ingredientForm(); if (i) NL.toast(`"${i.name}" added. Drag it from the list.`); };
  document.addEventListener('nl:ingredients', drawLib);

  // ---------- assemblies as tabs (workbook) ----------
  const nameOf = st => st.asm[st.root]?.name || st.draftName || 'Untitled assembly';
  const blank = () => ({ root: null, draftName: 'Untitled assembly ' + (wb.count() + 1), asm: {} });
  const sample = () => Object.assign(fromSample(), { _arrange: true });
  function newRecipe() { wb.add(blank()); }
  window.NL_resetSample = () => { wb.add(sample()); NL.toast('Sample assembly opened in a new tab'); };

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
    key: 'nlv3_cards_book',
    sample, nameOf,
    beforeSwitch: () => { useSide('left'); clearTimeout(typingT); commit(); },
    onSwitch: openState,
    onNew: newRecipe,
    onSplit: openSplit,
  });
  drawLib();
  drawFavs();
  updatePasteBtn();
  openState(wb.current());
})();
