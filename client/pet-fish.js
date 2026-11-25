// 🎣 낚시, 📖 물고기 도감, ⚒️ 낚싯대 강화 and 🏁 낚시대회: the fishing part of server/pet.ps1 (Fish-*,
// Rod*, Fight-*, Book-*, Forge-*, Contest-*), drawn the same way on the web pet. /낚시 or the menu
// starts 계속 낚시: my pet casts into a little pond at its feet, and again by itself after each bite
// until I stop it (or two bites in a row go by unclicked). The bobber floats, nibbles now and then,
// and when the hub's bite comes it sinks and a ❗ jumps over my head: a click on my pet within a
// moment hooks it, and then the fight: a click when the marker on the bar over my head is in its
// coloured part lands it; a miss is another go at the same fish, up to three. The catch comes up
// on the line, flapping, and my pet holds it up over its head with its name, size and news. Every
// rod out is the 도감 낚싯대 of its step (client/assets/rods). Friends with a line in the water hold
// their rod on my row. Everything is drawn in #fx with inline SVG and plain divs; the hub
// (server/fish.js) decides the bite, the hook, the catch, the book, the forge and the contest.
(() => {
  // The Windows $S.fish, $S.rods, $S.looks, $S.book, $S.bookPick, $S.bookTab, $S.bookFloor.
  let fish = null;          // my line: { floor, rod, bite, until, state, mark, bar, zones, hit, rarity, presses, unclicked }
  const rods = new Map();   // friends' rods, by "floor|who"
  let looksCache = null, looksP = null;
  let book = null, bookPick = null, bookTab = null, bookFloor = null;
  // 🎣 계속 낚시 ($S.fishLoop, $S.fishAway) and the last time a line was out ($S.fishBusy).
  let fishLoop = false, fishAway = 0, fishBusy = 0;
  // 🏁 The contest I watch ($S.contest, contestSig, contestHidden, contestAt).
  let contest = null, contestSig = '', contestHidden = null, contestAt = 0;
  // ⚒️ The forge ($S.forgeFloor, forgeNote, forgeRod, forgeNext).
  let forgeFloor = null, forgeNote = null, forgeRod = null, forgeNext = null;
  // WPF's SineEase in-out, BackEase with amplitude 1.2 and 0.5 (EASE.back is ~0.7).
  const SINE = 'cubic-bezier(.37,0,.63,1)';
  const BACK12 = 'cubic-bezier(.34,2.1,.64,1)';
  const BACK05 = 'cubic-bezier(.34,1.38,.64,1)';
  const forever = { direction: 'alternate', iterations: Infinity };
  const W = () => window.innerWidth;
  // WPF Anim with no easing is linear; the core's anim defaults to 'ease'.
  const lin = (node, frames, ms, delay = 0) => anim(node, frames, ms, delay, 'linear');
  // WPF colours come as #AARRGGBB; keep them verbatim and turn them into rgba() here.
  const argb = (c) => (c.length === 9 ? `rgba(${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${parseInt(c.slice(7, 9), 16)},${(parseInt(c.slice(1, 3), 16) / 255).toFixed(3)})` : c);
  // Where an animated transform is right now (the WPF transform's live X, Y or Angle).
  const mat = (node) => { const t = getComputedStyle(node).transform; return t && t !== 'none' ? new DOMMatrix(t) : new DOMMatrix(); };
  // The WPF DropShadowEffect on a text (blur 3, depth 1, 80 %).
  const shade = (node) => { node.classList.add('fish-sh'); return node; };
  const svgEl = (tag) => document.createElementNS('http://www.w3.org/2000/svg', tag);
  const attrs = (node, o) => { for (const [k, v] of Object.entries(o)) if (v != null) node.setAttribute(k, v); return node; };
  const me = () => S.members.get('');

  // The forge's and the contest's panels and what goes in them (pet.html has the book's frame;
  // these two are made here, in the Windows order: the contest on top, the forge under the book).
  const style = el('style');
  style.textContent = `
#contest { border-color: #3B9EDB; padding: 8px 10px; }
#contest .phead { display: flex; justify-content: space-between; align-items: baseline; }
#contest-title { font-size: 12px; color: #9FD8FF; margin-right: 0; }
#contest-clock { font-size: 12px; color: #FFD27A; font-weight: 700; white-space: nowrap; font-family: "Apple Symbols", "Segoe UI Symbol", inherit; }
#contest-board { margin-top: 6px; }
#contest-board .fc-who { font-size: 12px; color: #fff; word-break: break-word; }
#contest-board .fc-row { display: grid; grid-template-columns: 24px 62px 1fr 28px; margin: 1px 0; font-size: 11px; }
#contest-board .fc-row > div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#contest-board .fc-row > div:last-child { text-align: right; color: #9A93BD; }
#contest-text { font-size: 11px; color: #CFC9E6; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
#contest-buttons { margin-top: 4px; }
#contest-buttons .btn { font-size: 12px; padding: 3px 10px; }
#forge { border-color: #E0A83A; }
#forge-title { color: #FFD27A; }
#forge-stage { height: 62px; margin-top: 2px; display: flex; justify-content: center; align-items: center; }
#forge-stage .fg-arrow { font-size: 18px; color: #FFD27A; font-weight: 700; }
#forge-sum { font-size: 12px; color: #fff; white-space: pre-wrap; word-break: break-word; margin-top: 2px; }
#forge-gauge { position: relative; height: 12px; margin-top: 6px; background: #2E2A45; border-radius: 6px; }
#forge-gauge .fg-fill { position: absolute; left: 0; top: 0; bottom: 0; background: #E0A83A; border-radius: 6px; }
#forge-gauge .fg-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: #fff; white-space: nowrap; }
#forge-text { font-size: 11px; color: #E8E4FF; white-space: pre-wrap; word-break: break-word; margin-top: 6px; }
#forge-text:empty { display: none; }
#forge-buttons { margin-top: 4px; }
.fish-pic { position: relative; flex: none; }
.fish-strip { position: absolute; left: 0; top: 0; background-repeat: no-repeat; }
.fish-ring { width: 20px; height: 20px; border-radius: 50%; border: 3px solid #FFD666; box-sizing: border-box; box-shadow: 0 0 12px gold; }
#book-sum { white-space: pre-wrap; }
`;
  document.head.append(style);
  const contestEl = el('section', 'panel'); contestEl.id = 'contest'; contestEl.hidden = true;
  contestEl.innerHTML = '<div class="phead"><div class="ptitle" id="contest-title"></div><div id="contest-clock"></div></div><div id="contest-board"></div><div id="contest-text"></div><div id="contest-buttons" class="pbuttons"></div>';
  $('#dock').prepend(contestEl);
  const forgeEl = el('section', 'panel'); forgeEl.id = 'forge'; forgeEl.hidden = true;
  forgeEl.innerHTML = '<div class="ptitle" id="forge-title"></div><div id="forge-stage"></div><div id="forge-sum"></div><div id="forge-gauge"><div class="fg-fill"></div><div class="fg-text"></div></div><div id="forge-text"></div><div id="forge-buttons" class="pbuttons"></div>';
  ($('#book') || contestEl).after(forgeEl);

  // How every catch looks (server/fish-art.js), fetched once and kept; asked again if the first
  // try failed (the server may not be up yet at start).
  function looks() {
    if (looksCache) return Promise.resolve(looksCache);
    if (!looksP) looksP = call('api/fish-looks').then((r) => { looksP = null; if (r.ok && r.data.looks) looksCache = r.data.looks; return looksCache; });
    return looksP;
  }
  // One catch drawn from the hub's shapes, wd wide. The parts' d and the clips are path data (the
  // WPF Geometry mini-language is the SVG one). A shadow: one flat colour, no pattern.
  let clipN = 0;
  function fishVisual(id, wd, shadow = false) {
    const lk = looksCache?.[id]; if (!lk) return null;
    const svg = attrs(svgEl('svg'), { class: 'fish-vis', viewBox: '0 0 120 80', width: wd, height: (wd * 80) / 120 });
    const n = clipN++;
    if (!shadow && lk.clips?.length) {
      const defs = svgEl('defs');
      lk.clips.forEach((d, i) => { const cp = attrs(svgEl('clipPath'), { id: `fish-clip-${n}-${i}` }); cp.append(attrs(svgEl('path'), { d })); defs.append(cp); });
      svg.append(defs);
    }
    for (const p of lk.parts) {
      if (shadow && (p.clip != null || (p.op != null && p.op < 1))) continue;
      const pa = attrs(svgEl('path'), { d: p.d, fill: 'none' });
      if (shadow) {
        if (p.fill) pa.setAttribute('fill', '#3A3454');
        if (p.stroke) attrs(pa, { stroke: '#3A3454', 'stroke-width': p.w || 1.6 });
      } else {
        if (p.fill) pa.setAttribute('fill', p.fill);
        if (p.stroke) attrs(pa, { stroke: p.stroke, 'stroke-width': p.w || 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
        if (p.op != null) pa.setAttribute('opacity', p.op);
        if (p.clip != null) pa.setAttribute('clip-path', `url(#fish-clip-${n}-${p.clip})`);
      }
      svg.append(pa);
    }
    return svg;
  }
  // How wide a catch is drawn: by its size, a 3 cm one small and a whale big (on a log scale, so a
  // 30 cm one is still a good handful); junk at a middling size.
  function fishWidth(f) {
    const cm = f?.cm; if (!cm) return 58;
    return Math.max(38, Math.min(124, 30 + 24 * Math.log10(Number(cm))));
  }

  // ── 🎣 도감 낚싯대: the pictures ──
  // Each step's picture is a strip of stills (client/assets/rods, scripts/make-rods.js) played in
  // turn on every rod out, 200 ms apart, all on the same beat; rods.json says where the hand and
  // tip are in a still, and each step's line and float colours and whether a sky glows behind it.
  let art = null;
  fetch('assets/rods/rods.json').then((r) => (r.ok ? r.json() : null)).then((a) => { if (a?.rods) art = a; }).catch(() => {});
  const rodN = (step) => String(clamp(0, 14, step | 0) + 1).padStart(2, '0');
  const rodKind = (step) => (art ? art.rods[clamp(0, art.rods.length - 1, step | 0)] : null);
  const frameNow = () => (art ? Math.floor(Date.now() / (art.step || 200)) % art.frames : 0);
  // What plays: each picture's setter, until its piece leaves the page.
  const live = new Set();
  function play(node, set) {
    const p = { node, set, seen: false }; set(frameNow()); live.add(p); return p;
  }
  function playTick() {
    if (!live.size) return;
    const f = frameNow();
    for (const p of [...live]) {
      if (p.node.isConnected) { p.seen = true; p.set(f); } else if (p.seen) live.delete(p);
    }
  }
  // One strip in the rod's SVG, scaled by k and laid so the still's point (ax, ay) is at (x, y),
  // turned by turn degrees about it.
  function rodPic(parent, file, k, ax, ay, x, y, turn, alpha) {
    const g = attrs(svgEl('g'), { transform: `translate(${x} ${y}) rotate(${turn}) scale(${k}) translate(${-ax} ${-ay})`, opacity: alpha });
    const vp = attrs(svgEl('svg'), { x: 0, y: 0, width: art.w, height: art.h, viewBox: `0 0 ${art.w} ${art.h}`, overflow: 'hidden' });
    const im = attrs(svgEl('image'), { href: `assets/rods/${file}`, x: 0, y: 0, width: art.w * art.frames, height: art.h, preserveAspectRatio: 'none' });
    vp.append(im); g.append(vp); parent.append(g);
    play(im, (f) => im.setAttribute('x', -f * art.w));
    return g;
  }
  // One strip as a plain div, k times the still's size (the forge's pictures, the rod shown off).
  function stripDiv(file, k, still = false) {
    const d = el('div', 'fish-strip');
    d.style.width = `${art.w * k}px`; d.style.height = `${art.h * k}px`;
    d.style.backgroundImage = `url('assets/rods/${file}')`; d.style.backgroundSize = `${art.w * art.frames * k}px ${art.h * k}px`;
    if (still) d.style.backgroundPosition = '0 0'; else play(d, (f) => { d.style.backgroundPosition = `${-f * art.w * k}px 0`; });
    return d;
  }

  // ── the rod ──
  // A rod in a pet's hand and a pond at its feet, on its left: everything in one window-sized SVG
  // laid where the pet is now (o.at), moved along (o.mv) when the row shifts. cast: thrown with a
  // swing. step: which 도감 낚싯대 (0 = the first). The rod turns about the hand; the bobber's X and
  // Y move on their own (two nested groups, like the WPF transform's two properties), so the line
  // can be drawn to where it is.
  function rod(m, cast, step = 0) {
    const at = fxAt(m), sz = at.size;
    const svg = attrs(svgEl('svg'), { class: 'fish-rod' });
    const mv = svgEl('g'); svg.append(mv);
    const hx = at.x - sz * 0.2, hy = at.y + sz * 0.62, len = sz * 0.95;
    // The pond lies right under where the rod's tip rests (turned -35°), so the line hangs straight down into it.
    const ra = (-35 * Math.PI) / 180, px = hx - len * 0.62 * Math.cos(ra) - len * 0.78 * Math.sin(ra);
    const py = at.foot - 3, pw = sz * 1.0, ph = Math.max(7, sz * 0.22);
    // WPF draws a shape's stroke inside its size: the ellipse is half a stroke smaller.
    const pond = attrs(svgEl('ellipse'), { cx: px, cy: py, rx: pw / 2 - 0.5, ry: ph / 2 - 0.5, fill: argb('#CC6FA3DA'), stroke: '#4F7FB8', 'stroke-width': 1 });
    const glint = attrs(svgEl('ellipse'), { cx: px - pw * 0.3 + pw * 0.175, cy: py - ph * 0.25 + 1, rx: pw * 0.175, ry: 1, fill: argb('#AAFFFFFF') });
    mv.append(pond, glint);
    const rodG = svgEl('g'); rodG.style.transformOrigin = `${hx}px ${hy}px`; rodG.style.transform = 'rotate(-35deg)';
    const tx = hx - len * 0.62, ty = hy - len * 0.78;
    const kind = rodKind(step), n = rodN(step);
    if (kind) {
      // The still's pole, from its hand to its tip, laid on this one's: same length, turned to match.
      const sx = art.tip[0] - art.hand[0], sy = art.tip[1] - art.hand[1];
      const k = Math.hypot(tx - hx, ty - hy) / Math.hypot(sx, sy);
      const turn = ((Math.atan2(ty - hy, tx - hx) - Math.atan2(sy, sx)) * 180) / Math.PI;
      // From step 10 its sky glows behind the pet and the pond, a little bigger than the still.
      if (kind.sky) { const sv = svgEl('g'); rodPic(sv, `sky-${n}.png`, k * 1.5, 125, 140, hx - len * 0.1, at.foot - sz * 0.1, 0, 0.9); mv.prepend(sv); }
      rodPic(rodG, `rod-${n}.png`, k, art.hand[0], art.hand[1], hx, hy, turn, 1);
    } else {
      const pole = attrs(svgEl('line'), { x1: hx, y1: hy, x2: tx, y2: ty, stroke: '#9C6B3E', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
      const grip = attrs(svgEl('line'), { x1: hx + 2, y1: hy + 2.5, x2: hx - len * 0.12, y2: hy - len * 0.15, stroke: '#4A3424', 'stroke-width': 3.4, 'stroke-linecap': 'round' });
      rodG.append(pole, grip);
    }
    const lc = kind ? kind.line : '#DDE6F2', bc = kind ? kind.bob : ['#E5484D', '#F2F2F2'];
    const line = attrs(svgEl('path'), { stroke: lc, 'stroke-width': 0.9, fill: 'none' });
    const bob = attrs(svgEl('g'), { transform: `translate(${px} ${py})` });
    const bobX = svgEl('g'), bobY = svgEl('g');
    const b1 = attrs(svgEl('circle'), { cx: 0, cy: -1.5, r: 3.5, fill: bc[1], stroke: argb('#55000000'), 'stroke-width': 0.6 });
    const b2 = attrs(svgEl('path'), { d: 'M 0,3.5 A 3.5,3.5 0 0 1 7,3.5 Z', transform: 'translate(-3.5 -5)', fill: bc[0] });
    bobY.append(b1, b2); bobX.append(bobY); bob.append(bobX);
    mv.append(rodG, line, bob);
    const o = { key: null, el: svg, mv, mvX: 0, mvY: 0, at, rodG, line, bob, bobX, bobY, tip: [tx, ty], hand: [hx, hy], bx: px, by: py, px, py, pw, m, rotA: null, xA: null, yA: null };
    // Under the other effects. In the layer before the line is drawn: its start is read from the rod's live turn.
    fxLayer.prepend(svg);
    rodLine(o);
    if (cast) {
      // Swung back over the shoulder and flicked forward; the bobber flies out and plops in.
      spin(o, 40, -35, 380);
      bob.style.opacity = 0; line.style.opacity = 0;
      after(330, () => {
        bob.style.opacity = 1; line.style.opacity = 1;
        moveX(o, o.tip[0] - o.bx, 0, 380);
        moveY(o, o.tip[1] - o.by, 0, 380, EASE.quadIn);
        after(390, () => { ripple(o); bobFloat(o); });
      });
      lin(pond, { opacity: [0, 1] }, 300);
    } else bobFloat(o);
    return o;
  }
  // The WPF animations on the rod's angle and the bobber's X and Y: a new one replaces the old,
  // none at all (cancel) leaves the base value, as BeginAnimation(prop, $null) does.
  function spin(o, from, to, ms, opts = {}) {
    o.rotA?.cancel();
    o.rotA = o.rodG.animate([{ transform: `rotate(${from}deg)` }, { transform: `rotate(${to}deg)` }], { duration: ms, fill: 'forwards', easing: 'linear', ...opts });
  }
  function moveX(o, from, to, ms, ease = 'linear', opts = {}) {
    o.xA?.cancel();
    o.xA = o.bobX.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: ms, fill: 'forwards', easing: ease, ...opts });
  }
  function moveY(o, from, to, ms, ease = 'linear', opts = {}) {
    o.yA?.cancel();
    o.yA = o.bobY.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }], { duration: ms, fill: 'forwards', easing: ease, ...opts });
  }
  // The line from the rod's tip to the bobber, sagging a little; drawn again as the bobber moves.
  function rodLine(o) {
    const rm = mat(o.rodG), a = Math.atan2(rm.b, rm.a);
    const dx = o.tip[0] - o.hand[0], dy = o.tip[1] - o.hand[1];
    const tx = o.hand[0] + dx * Math.cos(a) - dy * Math.sin(a), ty = o.hand[1] + dx * Math.sin(a) + dy * Math.cos(a);
    const bx = o.bx + mat(o.bobX).e, by = o.by - 4 + mat(o.bobY).f;
    o.line.setAttribute('d', `M ${tx.toFixed(1)},${ty.toFixed(1)} Q ${((tx + bx) / 2).toFixed(1)},${(Math.max(ty, by) + 4).toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`);
  }
  function bobFloat(o) { moveY(o, 0, 1.6, 700, 'linear', forever); }
  function ripple(o, big = false) {
    for (let i = 0; i < (big ? 3 : 2); i++) {
      const rg = el('div', 'fish-rip');
      fxAdd(rg, o.bx + o.mvX - 3, o.by + o.mvY - 1.2);
      const k = big ? 6 : 4;
      lin(rg, { transform: ['scale(1)', `scale(${k})`] }, 700, i * 220);
      lin(rg, { opacity: [1, 0] }, 700, i * 220);
      after(760 + i * 220, () => rg.remove());
    }
  }
  function splash(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      const d = el('div', 'fxdot'); d.style.width = d.style.height = '3px'; d.style.background = '#CFE6FF';
      fxGo(d, x, y, rnd(-16, 17), -8 - rnd(14), 420, 0, EASE.quadOut);
    }
  }
  function rodDrop(o) {
    if (!o) return;
    o.yA?.cancel();
    lin(o.el, { opacity: [1, 0] }, 350); after(400, () => o.el.remove());
  }

  // ── my line ──
  async function fishCast() {
    if (fish) { say(me(), '🎣', '벌써 낚싯대를 던졌어요 — 찌가 쑥 들어가면 펫을 클릭!', 3); return; }
    const fl = to() || S.floor; if (!fl) { say(me(), '🎣', '먼저 층에 들어가야 낚시할 수 있어요', 3); return; }
    if (!me()) return;
    fish = { floor: fl, state: 'casting' };
    const r = await ask('api/fish', { floor: fl, op: 'cast' });
    if (r.error || !me()) { fish = null; if (r.error) say(me(), '🎣', r.error, 3); return; }
    const now = Date.now();
    const rd = rod(me(), true, r.rod); rd.key = '';
    fish = { floor: fl, rod: rd, bite: now + r.biteIn, until: now + r.biteIn + r.window, state: 'wait', mark: null, bar: null, presses: 0 };
    // The drawings come while the line sits in the water, so the catch shows at once.
    after(900, looks);
  }
  // 🎣 계속 낚시: once started (/낚시, the menu, the book), my pet casts again by itself a moment
  // after each bite (contestAuto) until I stop it (/낚시 again, the menu) or two bites in a row go
  // by unclicked: nobody at the desk, so no line left out all afternoon.
  async function fishGo() {
    if (fishLoop) { fishStop(); say(me(), '🎣', '낚시를 그만했어요', 3); return; }
    const v = contest;
    if (v && v.phase === 'on' && v.joined) { fishCast(); return; }
    if (!fish) { await fishCast(); if (!fish) return; }
    fishLoop = true; fishAway = 0;
    say(me(), '🎣', '계속 낚시해요 — 그만하려면 /낚시 한 번 더', 3);
  }
  function fishStop() {
    fishLoop = false;
    const fs = fish; if (!fs || !fs.rod) return;
    fish = null; fs.mark?.remove(); fs.bar?.remove(); rodDrop(fs.rod);
    ask('api/fish', { floor: fs.floor, op: 'stop' });
  }
  // Every animation tick (200 ms): the rods follow their pets (and hide while their pet is away,
  // up on a stage); mine gets a nibble now and then, the bite, and a bite let go.
  function fishTick(now) {
    playTick();
    for (const o of [...rods.values(), fish?.rod]) {
      if (!o) continue;
      if (o.key != null && S.members.has(o.key)) o.m = S.members.get(o.key);
      if (!o.m.img.isConnected || !o.m.img.getBoundingClientRect().width) continue;
      const at = fxAt(o.m); o.mvX = at.x - o.at.x; o.mvY = at.foot - o.at.foot;
      o.mv.style.transform = `translate(${o.mvX}px, ${o.mvY}px)`;
      o.el.style.visibility = getComputedStyle(o.m.img).visibility === 'hidden' ? 'hidden' : '';
      rodLine(o);
    }
    const fs = fish; if (!fs || !fs.rod) return;
    if (fs.state === 'wait') {
      if (now >= fs.bite) {
        // The bite: down goes the bobber, the rod tip shakes, and a ❗ over my head.
        fs.state = 'bite'; const o = fs.rod;
        moveY(o, 0, 6, 160); lin(o.bob, { opacity: [1, 0.35] }, 160);
        spin(o, -35, -27, 90, forever);
        ripple(o, true); splash(o.bx + o.mvX, o.by + o.mvY - 3, 5);
        const at = fxAt(me());
        const mk = fxText('❗', 26, '#FFD43B'); mk.style.transformOrigin = '50% 100%';
        fxAdd(mk, at.x - 9, at.y - 40); fs.mark = mk;
        anim(mk, { transform: ['scale(.2)', 'scale(1)'] }, 260, 0, BACK12);
      } else if (rnd(14) === 0 && fs.bite - now > 700) {
        // A nibble: a little dip that is not the bite yet.
        const o = fs.rod; moveY(o, 0, 2.6, 120);
        after(260, () => { if (fish && fish.rod === o && fish.state === 'wait') bobFloat(o); });
        ripple(o);
      }
    } else if (fs.state === 'bite' && now > fs.until + 250) { fs.unclicked = true; fishReel(); }
    // Too long on a go: that go is lost.
    else if (fs.state === 'fight' && now > fs.until) fightMiss();
  }
  async function fishReel() {
    const fs = fish; if (!fs || !['wait', 'bite'].includes(fs.state)) return;
    fs.state = 'hooking';
    if (fs.mark) { fs.mark.remove(); fs.mark = null; }
    // The hub decides first (a moment on this PC): too soon, too late, or on the hook.
    // A bite let go unclicked is a miss, never a fight (the hub would hook it within its slack).
    const ms = Date.now() - fs.bite;
    const r = await ask('api/fish', { floor: fs.floor, op: 'hook', late: !!fs.unclicked, ms, presses: fs.presses | 0 });
    const o = fs.rod;
    rodTug(o);
    // A bite nobody clicked (let go when its time was up): two in a row and 계속 낚시 stops.
    if (fs.unclicked && fishLoop) {
      fishAway++;
      if (fishAway >= 2) { fishLoop = false; after(1500, () => say(me(), '🎣', '자리에 없는 것 같아 낚시를 멈췄어요 — /낚시 로 다시', 5)); }
    } else if (!fs.unclicked) fishAway = 0;
    if (r.contest) {
      const ca = fxAt(me());
      fxGo(fxText(`🏁 ${r.contest.n}/${r.contest.of}`, 12, '#9FD8FF'), ca.x + 14, ca.y - 60, 0, -16, 1400, 0);
    }
    if (!r.hooked) {
      S.shakeUntil = Date.now() + 380;
      after(380, () => fishLost(o, r.error || r.text));
      return;
    }
    const at = fxAt(me());
    S.shakeUntil = Date.now() + 600;
    const text = r.rarity === 'legend' ? '🌟 전설이 걸렸다!!' : r.heavy ? '걸렸다! 엄청 무거워!' : '걸렸다!';
    if (r.rarity === 'legend') legendFlash(at);
    const hey = shade(fxText(text, 13, '#FFFFFF'));
    fxAdd(hey, Math.max(2, Math.min(W() - text.length * 12 - 4, at.x - 10 - text.length * 5)), at.y - 100 * clamp(0.7, 1.3, S.k));
    pop(hey, 0, 8); after(900, () => hey.remove());
    fs.state = 'fight'; fs.zones = r.zones; fs.hit = 0; fs.until = Date.now() + r.ms; fs.rarity = r.rarity;
    fightBar();
  }
  // The rod bends and shakes, the bobber is dragged about under water.
  function rodTug(o) { spin(o, -24, -8, 70, forever); moveX(o, -6, 6, 90, 'linear', forever); }
  function rodStill(o) { o.rotA?.cancel(); o.rotA = null; o.xA?.cancel(); o.xA = null; }

  // ── the fight ──
  // The fight's bar over my head: a marker sweeping from end to end and the part to click it in
  // (green; violet for the very rare, gold for a legend). A miss is not the end: the same fish stays
  // on for another go, up to three (the hearts over it), the part somewhere else each time.
  function fightBar() {
    const fs = fish, zn = fs.zones[fs.hit];
    fs.bar?.remove();
    const at = fxAt(me()), k = clamp(0.7, 1.3, S.k);
    const bw = Math.round(128 * k), bh = Math.round(14 * k);
    const bar = el('div', 'fish-bar'); bar.style.width = `${bw}px`; bar.style.height = `${bh + 16}px`;
    const bg = el('div', 'fish-bar-bg'); bg.style.width = `${bw}px`; bg.style.height = `${bh}px`;
    const zc = fs.rarity === 'legend' ? '#F2C14E' : fs.rarity === 'epic' ? '#B98AF0' : '#3DBE7A';
    const zone = el('div', 'fish-zone'); zone.style.width = `${Math.max(6, (zn.to - zn.from) * bw)}px`; zone.style.height = `${bh - 2}px`; zone.style.background = zc;
    zone.style.left = `${zn.from * bw}px`; zone.style.top = '1px';
    // A legend's last stage: the part itself swings back and forth along the bar.
    if (zn.drift) fs.zA = zone.animate([{ left: `${(zn.from - zn.drift.amp) * bw}px` }, { left: `${(zn.from + zn.drift.amp) * bw}px` }], { duration: zn.drift.ms / 2, easing: SINE, ...forever });
    else fs.zA = null;
    const mk = el('div', 'fish-mark'); mk.style.height = `${bh + 8}px`; mk.style.top = '-4px';
    fs.mtA = mk.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${bw - 3}px)` }], { duration: zn.sweep, easing: zn.ease ? SINE : 'linear', ...forever });
    const n = fs.zones.length;
    let tip = n > 1 ? `${fs.zones.map((_, i) => (i < fs.hit ? '♡' : '♥')).join('')}  색칸에 오면 내 펫 클릭!` : '색칸에 오면 내 펫 클릭!';
    const tt = shade(fxText(tip, 10, '#FFFFFF'));
    // Over the bar, not under it: under it sits on my pet's head.
    tt.style.top = '-16px';
    bar.append(bg, zone, mk, tt);
    const x0 = Math.max(4, Math.min(W() - bw - 4, at.x - bw / 2));
    fxAdd(bar, x0, at.y - 40 - bh);
    fs.bar = bar; fs.mt = mk; fs.bw = bw; fs.zone = zone;
    // 🌟 A legend's bar: a gold rim glowing in and out, and gold sparkles popping round it.
    if (fs.rarity === 'legend') {
      bg.style.borderColor = '#FFD666'; bg.style.borderWidth = '1.8px';
      bg.animate([{ boxShadow: '0 0 14px rgba(255,215,0,.35)' }, { boxShadow: '0 0 14px rgba(255,215,0,1)' }], { duration: 380, ...forever });
      tip = `🌟 전설!  ${tip}`; tt.textContent = tip; tt.style.color = '#FFD666';
      for (let i = 0; i < 16; i++) {
        const sx = x0 + rnd(0, bw), sy = at.y - 40 - bh + (i % 2 ? -6 : bh + 2);
        fxGo(fxText('✦', 8 + rnd(6), '#FFE38A'), sx, sy, rnd(-6, 7), i % 2 ? -12 : 12, 600, i * 280);
      }
    }
  }
  // 🌟 A legend on the hook: a gold ring flashes out from my pet, gold sparkles burst, the row shakes.
  function legendFlash(at) {
    const cx = at.x, cy = at.y + at.size * 0.4;
    for (let i = 0; i < 2; i++) {
      const rg = el('div', 'fish-ring');
      fxAdd(rg, cx - 10, cy - 10);
      rg.style.opacity = 0;
      anim(rg, { transform: ['scale(.5)', 'scale(7)'] }, 650, i * 220, EASE.quadOut);
      lin(rg, { opacity: [1, 0] }, 650, i * 220);
      after(700 + i * 220, () => rg.remove());
    }
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI * 2) / 14, d = 40 + rnd(30);
      fxGo(fxText('✦', 10 + rnd(8), i % 3 ? '#FFD666' : '#FFFFFF'), cx - 5, cy - 8, Math.cos(a) * d, Math.sin(a) * d * 0.7, 700, i * 15, EASE.quadOut);
    }
    shakeRow();
  }
  // A legend (or a broken rod) shakes the row of pets for a moment.
  function shakeRow() {
    $('#row')?.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }], { duration: 50, direction: 'alternate', iterations: 10 });
  }
  // A click in the fight: where the marker is now decides it.
  function fightClick() {
    const fs = fish; if (!fs || fs.state !== 'fight') return;
    const zn = fs.zones[fs.hit], pos = (mat(fs.mt).e + 1.5) / fs.bw;
    fs.mtA?.cancel(); fs.mt.style.transform = `translateX(${pos * fs.bw - 1.5}px)`;
    // Where the part is now (a drifting one stops where it was).
    const z0 = parseFloat(getComputedStyle(fs.zone).left) / fs.bw, z1 = z0 + (zn.to - zn.from);
    if (fs.zA) { fs.zA.cancel(); fs.zone.style.left = `${z0 * fs.bw}px`; }
    const sl = zn.slack != null ? zn.slack : 0.015;
    if (pos >= z0 - sl && pos <= z1 + sl) {
      fs.zone.style.background = '#FFFFFF';
      S.shakeUntil = Date.now() + 300;
      fightEnd(true);
    } else {
      fs.zone.style.background = '#E5484D';
      fightMiss();
    }
  }
  // A go missed (or let run out): another go at the same fish while there are any left.
  function fightMiss() {
    const fs = fish; if (!fs || fs.state !== 'fight') return;
    fs.hit++;
    if (fs.hit >= fs.zones.length) { fightEnd(false); return; }
    const left = fs.zones.length - fs.hit;
    const at = fxAt(me());
    fxGo(fxText(`한 번 더! (${left}번 남음)`, 12, '#FFD27A'), Math.min(W() - 110, at.x - 40), at.y - 96, 0, -14, 700, 0);
    fs.state = 'next'; fs.until = Date.now() + 6000;
    after(500, () => { if (fish === fs && fs.state === 'next') { fs.state = 'fight'; fs.until = Date.now() + 5000; fightBar(); } });
  }
  async function fightEnd(won) {
    const fs = fish; if (!fs) return;
    fs.state = 'landing';
    if (fs.bar) { const b = fs.bar; lin(b, { opacity: [1, 0] }, 200, 250); after(480, () => b.remove()); fs.bar = null; }
    const r = await ask('api/fish', { floor: fs.floor, op: 'land', hit: !!won });
    const o = fs.rod;
    if (r.fish) { after(200, () => { rodStill(o); fishCatch(r, o); }); return; }
    after(200, () => fishLost(o, r.error || r.text, true));
  }
  // Nothing landed: the line goes slack (or snaps with a "툭!") and the bobber comes up empty.
  function fishLost(o, text, snap = false) {
    rodStill(o);
    spin(o, -16, -40, 200);
    if (snap) {
      o.line.style.visibility = 'hidden'; o.bob.style.opacity = 0;
      fxGo(fxText('툭!', 13, '#FFB3AD'), o.bx + o.mvX - 8, o.by + o.mvY - 30, 0, -12, 700, 0);
      ripple(o, true);
    } else {
      lin(o.bob, { opacity: [0.35, 1] }, 150);
      moveY(o, 6, -14, 300);
    }
    say('', '🎣', text, 4);
    // Only my own line is let go: a line cast after a 거두기 meanwhile stays.
    after(650, () => { rodDrop(o); if (fish?.rod === o) fish = null; });
  }
  // A big splash out of the pond: drops thrown high and a "철퍽!".
  function bigSplash(x, y, n) {
    for (let i = 0; i < n; i++) {
      const sz = 2 + rnd(3), d = el('div', 'fxdot'); d.style.width = d.style.height = `${sz}px`; d.style.background = i % 3 ? '#CFE6FF' : '#FFFFFF';
      fxGo(d, x + rnd(-6, 7), y, rnd(-26, 27), -18 - rnd(34), 480 + rnd(200), 0, EASE.quadOut);
    }
    const t = shade(fxText('철퍽!', 13, '#E8F4FF'));
    fxGo(t, Math.max(2, x - 34), y - 26, -6, -14, 800, 0);
  }
  // My pet hops for joy (twice for a big one).
  function joyHop(big) {
    const g = me()?.g; if (!g) return;
    const h = big ? -24 : -14;
    lin(g, { transform: ['translateY(0px)', `translateY(${h}px)`] }, 170);
    after(190, () => lin(g, { transform: [`translateY(${h}px)`, 'translateY(0px)'] }, 260));
    if (big) after(520, () => { lin(g, { transform: ['translateY(0px)', 'translateY(-12px)'] }, 150); after(160, () => lin(g, { transform: ['translateY(-12px)', 'translateY(0px)'] }, 220)); });
  }
  // 🎆 A legend's fireworks: pet-fx.js's rocket when it has one, else the same one drawn here.
  function burst(x, y, up, delay) {
    if (Mod.fx?.burst) return Mod.fx.burst(x, y, up, delay);
    const r = el('div', 'fxdot'); r.style.width = '3px'; r.style.height = '7px'; r.style.background = '#FFE8B0';
    fxGo(r, x - 1.5, y, 0, -up, 380, delay, EASE.quadOut);
    const c = pick(FX_COLORS), c2 = pick(FX_COLORS);
    const flash = el('div', 'fxdot'); flash.style.width = flash.style.height = '14px'; flash.style.background = argb('#CCFFF4D6');
    fxGo(flash, x - 7, y - up - 7, 0, 0, 220, delay + 360);
    for (let i = 0; i < 18; i++) {
      const a = ((i + Math.random() * 0.5) / 18) * 2 * Math.PI, rr = 28 + rnd(16), sz = 3 + rnd(3);
      const sg = el('div', 'fxdot'); sg.style.width = sg.style.height = `${sz}px`; sg.style.background = i % 3 ? c : c2;
      // Out in a ring, then a little lower: the sparks fall as they fade.
      fxGo(sg, x - sz / 2, y - up, Math.cos(a) * rr, Math.sin(a) * rr + 14, 1000, delay + 360, EASE.quadOut);
    }
  }
  // The catch: the rod heaves up and the fish comes out of the pond on the end of the line, hangs
  // there flapping and dripping, then my pet takes it and holds it up over its head with its name,
  // size and news. As big as it really is (fishWidth); the rarer, the more sparkle.
  function fishCatch(r, o) {
    const f = r.fish, at = fxAt(me());
    const wd = fishWidth(f);
    const hold = { legend: 5200, epic: 4200, rare: 3600 }[f.rarity] || 3000;
    const big = ['epic', 'legend'].includes(f.rarity);
    // Heave: the rod bends down hard, then swings up; a splash where the float was.
    spin(o, -10, -2, 140);
    after(140, () => spin(o, -2, -48, 420, { easing: BACK05 }));
    bigSplash(o.bx + o.mvX, o.by + o.mvY - 3, big ? 26 : 16); ripple(o, true);
    // The fish on the end of the line, head up: its mouth where the float was. The float was dimmed
    // under water at the bite; the fish comes out in full.
    o.bobY.replaceChildren(); o.bob.getAnimations().forEach((a) => a.cancel()); o.bob.style.opacity = 1;
    const hw = wd * clamp(0.55, 1.3, S.k);
    const vb = fishVisual(f.id, hw);
    if (vb) {
      const nx = (hw * 14) / 120, ny = hw / 3;
      attrs(vb, { x: -nx, y: -ny, overflow: 'visible' });
      const swing = svgEl('g'); swing.style.transformOrigin = '0px 0px'; swing.style.transform = 'rotate(90deg)';
      swing.append(vb); o.bobY.append(swing);
      // Flapping on the line.
      swing.animate([{ transform: 'rotate(64deg)' }, { transform: 'rotate(116deg)' }], { duration: 120, delay: 500, direction: 'alternate', iterations: 12, fill: 'forwards' });
    }
    // Up it comes, to hang a little under where the rod's tip ends up (the line follows: fishTick).
    const lift = -Math.max(30, o.by - at.y + 6 + hw * 0.2), over = (o.hand[0] - o.bx) * 0.25;
    moveY(o, 4, lift, 520, EASE.quadOut, { delay: 120, fill: 'both' });
    moveX(o, 0, over, 520, EASE.quadOut, { delay: 120, fill: 'both' });
    // Drips off it while it hangs.
    for (let i = 0; i < 6; i++) {
      after(650 + i * 140, () => {
        const d = el('div', 'fxdot'); d.style.width = '2.5px'; d.style.height = '3.5px'; d.style.background = '#CFE6FF';
        fxGo(d, o.bx + o.mvX + mat(o.bobX).e + rnd(-5, 6), o.by + o.mvY + mat(o.bobY).f + 6, 0, 24 + rnd(10), 420, 0, EASE.quadIn);
      });
    }
    const lines = [`${f.mark ? `${f.mark} ` : ''}${f.name}${f.size ? ` · ${f.size}` : ''}`];
    const news = [];
    if (f.rarity === 'junk') news.push(['꽝!', '#8A7560', '#FFFFFF']);
    if (r.isNew) news.push([`NEW ${r.count}/${r.of}`, '#3DBE7A', '#FFFFFF']);
    if (r.luck) news.push(['🍀 다음 한 번 행운', '#2E8B57', '#FFFFFF']);
    if (r.points) news.push([`⚒️ +${r.points}`, '#8C5A2E', '#FFE8B0']);
    if (r.charm) news.push(['🛡 부적 +1', '#3B7DD8', '#FFFFFF']);
    if (r.record) news.push(['층 최대어', '#F2C14E', '#2A2000']); else if (r.best && !r.isNew) news.push(['내 최고', '#5DADEC', '#FFFFFF']);
    // Then into my pet's paws: off the line and up over its head, with a hop (two for a big one).
    after(1500, () => {
      const at2 = fxAt(me()); if (!at2) return;
      const x0 = o.bx + o.mvX + mat(o.bobX).e, y0 = o.by + o.mvY + mat(o.bobY).f;
      rodDrop(o);
      joyHop(['rare', 'epic', 'legend'].includes(f.rarity));
      const card = fishCard(f, wd, lines, news);
      const top = Math.max(4, at2.y - wd * clamp(0.55, 1.3, S.k) * 0.66 - 46);
      fishHold(card, x0, y0, at2.x, top, wd, hold);
      const cx = Math.max(wd / 2 + 4, Math.min(W() - wd / 2 - 4, at2.x));
      if (['rare', 'epic', 'legend'].includes(f.rarity)) for (let i = 0; i < 8; i++) fxGo(fxText('✦', 9 + rnd(6), f.color), cx - 4 + rnd(-wd / 2, wd / 2), top + rnd(10, 40), rnd(-14, 15), -30 - rnd(20), 1300, 300 + i * 120);
      if (f.rarity === 'legend') { burst(cx - 40, top + 30, 70, 400); burst(cx + 36, top + 30, 90, 800); shakeRow(); }
    });
    after(hold + 2400, () => { if (fish?.rod === o) fish = null; });
  }
  // The fish with its name under it (and what it means for me), as one piece that leaps. Used by
  // pet-fx.js too (someone's rare catch, 🏆 자랑하기): a plain element to place and move.
  function fishCard(f, wd, lines, news) {
    const card = el('div', 'fish-card'), sp = el('div', 'fish-card-in');
    // As big as the pets are drawn (the pets' size from the grip or Ctrl+wheel). The zoom sits on
    // the inner piece so left/top on the card itself stay in window pixels.
    sp.style.zoom = clamp(0.55, 1.3, S.k);
    const vb = fishVisual(f.id, wd); if (vb) sp.append(vb);
    const tag = el('div', 'fish-tag'); tag.textContent = lines.join(' ');
    // A thin stripe in the rarity's colour under the name.
    const bar = el('div', 'fish-stripe'); bar.style.background = f.color;
    sp.append(tag, bar);
    if (news.length) {
      const row = el('div', 'fish-news');
      for (const n of news) { const pill = el('div', 'fish-pill'); pill.textContent = n[0]; pill.style.background = n[1]; pill.style.color = n[2]; row.append(pill); }
      sp.append(row);
    }
    card.append(sp);
    return card;
  }
  // Off the line at (x0, y0) up to over my head (cx, top): a short toss with a flip, held there
  // with a wriggle, then gone. The card is placed by its middle.
  function fishHold(card, x0, y0, cx, top, wd, hold) {
    const mx = el('div', 'fish-leap'), my = el('div', 'fish-w'), rt = el('div', 'fish-w');
    rt.append(card); my.append(rt); mx.append(my);
    fxLayer.append(mx);
    const cw = Math.max(wd, card.getBoundingClientRect().width);
    cx = Math.max(cw / 2 + 12, Math.min(W() - cw / 2 - 12, cx));
    rt.style.transformOrigin = `${cw / 2}px ${wd * 0.33}px`;
    mx.style.left = `${cx - cw / 2}px`; mx.style.top = `${top}px`;
    lin(mx, { transform: [`translateX(${x0 - cx}px)`, 'translateX(0px)'] }, 380);
    anim(my, { transform: [`translateY(${y0 - top - wd * 0.33}px)`, 'translateY(0px)'] }, 380, 0, BACK05);
    lin(rt, { transform: ['rotate(90deg)', 'rotate(0deg)'] }, 380);
    // Three wriggles (there and back), left at the last tilt like the WPF one.
    after(420, () => rt.animate([{ transform: 'rotate(-7deg)' }, { transform: 'rotate(7deg)' }], { duration: 110, direction: 'alternate', iterations: 6, fill: 'forwards' }));
    anim(mx, { opacity: [1, 0] }, 450, hold, EASE.quadIn);
    after(hold + 500, () => mx.remove());
  }
  // Out of the water at (x0, y0), up in an arc to (cx, top) with a flip and a wriggle; held, then
  // gone (someone's rare catch, pet-fx.js). One wrapper per WPF transform (X, Y, turn, scale), so
  // each can run on its own clock.
  function fishLeap(card, x0, y0, cx, top, wd, hold) {
    const mx = el('div', 'fish-leap'), my = el('div', 'fish-w'), rt = el('div', 'fish-w'), sc = el('div', 'fish-w');
    sc.append(card); rt.append(sc); my.append(rt); mx.append(my);
    fxLayer.append(mx);
    // Kept inside the window: the name under it is often wider than the fish.
    const cw = Math.max(wd, card.getBoundingClientRect().width);
    cx = Math.max(cw / 2 + 12, Math.min(W() - cw / 2 - 12, cx));
    rt.style.transformOrigin = sc.style.transformOrigin = `${cw / 2}px ${wd * 0.33}px`;
    mx.style.left = `${cx - cw / 2}px`; mx.style.top = `${top}px`;
    lin(mx, { transform: [`translateX(${x0 - cx}px)`, 'translateX(0px)'] }, 650);
    anim(my, { transform: [`translateY(${y0 - top - wd * 0.33}px)`, 'translateY(0px)'] }, 650, 0, EASE.back);
    lin(sc, { transform: ['scale(.3)', 'scale(1)'] }, 500);
    lin(rt, { transform: ['rotate(-320deg)', 'rotate(0deg)'] }, 650);
    // Four wriggles (there and back), left hanging at the last tilt like the WPF one.
    after(700, () => rt.animate([{ transform: 'rotate(-9deg)' }, { transform: 'rotate(9deg)' }], { duration: 110, direction: 'alternate', iterations: 8, fill: 'forwards' }));
    anim(mx, { opacity: [1, 0] }, 450, hold, EASE.quadIn);
    lin(my, { transform: ['translateY(0px)', 'translateY(-18px)'] }, 450, hold);
    after(hold + 500, () => mx.remove());
  }
  // 🎣 The rod shown off on the stage (pet-fx.js brag): its strip played big (about 155 px wide at
  // the pets' size, more than five times the rod in the hand), its sky glowing behind from step 10,
  // and a tag with its name and how many kinds the book has. { el, w } for pet-fx.js to place.
  function rodCard(f) {
    const n = rodN(f.rod), kind = rodKind(f.rod);
    const k = 0.62 * clamp(0.7, 1.3, S.k), wd = (art ? art.w : 250) * k, ht = (art ? art.h : 190) * k;
    const sp = el('div', 'fish-card-in'); sp.style.pointerEvents = 'none'; sp.style.width = 'max-content';
    const cv = el('div', 'fish-pic'); cv.style.width = `${wd}px`; cv.style.height = `${ht}px`;
    if (kind?.sky) { const s = stripDiv(`sky-${n}.png`, k); s.style.opacity = 0.95; cv.append(s); }
    if (kind) cv.append(stripDiv(`rod-${n}.png`, k));
    const tag = el('div', 'fish-tag'); tag.style.border = '1.2px solid #E0A83A';
    tag.textContent = `🏆 ${f.name}${f.kinds ? ` · 도감 ${f.kinds}종` : ''}`;
    sp.append(cv, tag);
    return { el: sp, w: wd };
  }
  // Friends with a line in the water (the hub says so in each one's state) hold their rod on my row.
  function fishFriends(st) {
    const want = new Map();
    for (const fr of st.friends || []) if (fr.fishing) want.set(`${fr.floor}|${fr.who}`, fr.rod | 0);
    for (const [k, o] of [...rods]) if (!want.has(k) || !S.members.has(k)) { rodDrop(o); rods.delete(k); }
    for (const [k, step] of want) {
      if (rods.has(k) || !S.members.has(k)) continue;
      const m = S.members.get(k); if (!m.img.getBoundingClientRect().width) continue;
      const o = rod(m, true, step); o.key = k; rods.set(k, o);
    }
  }

  // ── 🏁 낚시대회 ──
  // Opened with /낚시대회 or from the menu, a card for everyone on the floor to join for half a
  // minute; then, for those in it, the board (best first, everyone's bites, the time left) while my
  // pet casts by itself between bites. The top three end up on the podium (pet-fx.js brag, place).
  async function contestDo(body) {
    const fl = contest ? contest.floor : to() || S.floor;
    if (!fl) { say(me(), '🏁', '먼저 층에 들어가야 낚시대회를 열 수 있어요', 3); return; }
    const r = await ask('api/fish', { floor: fl, ...body });
    if (r.error) { say(me(), '🏁', r.error, 3); return; }
    contestHidden = null; contestAt = Date.now(); showContest(r.contest, true);
  }
  function contestButton(text, run, hot = false) {
    $('#contest-buttons').append(btn(text, typeof run === 'function' ? run : () => contestDo(run), hot ? '#3B9EDB' : '#3B355A'));
  }
  function contestText(text, color, bold = false) {
    const d = el('div'); d.textContent = text; d.style.color = color; if (bold) d.style.fontWeight = 700; return d;
  }
  // One line of the board: place, name, best catch (in its rarity's colour), bites used.
  function contestRow(rank, name, fishText, tries, color, mine) {
    const g = el('div', 'fc-row');
    g.append(contestText(rank, '#FFFFFF'), contestText(name, mine ? '#FFD27A' : '#FFFFFF', mine), contestText(fishText, color, mine), contestText(tries, '#9A93BD'));
    g.title = `${name} · ${fishText}`;
    $('#contest-board').append(g);
  }
  function showContest(v, direct = false) {
    // The poll's view comes through this PC's server a few seconds late: right after my own click
    // it would still say what was before (no contest yet, or the one I just left).
    if (!direct && contestAt && Date.now() - contestAt < 3500) return;
    const p = contestEl;
    // Not mine to watch: one I am not in, once it is past taking joiners, or one I put away.
    if (!v || v.id === contestHidden || (!v.joined && v.phase !== 'open')) {
      if (!p.hidden) p.hidden = true;
      contest = null; contestSig = ''; return;
    }
    contest = v;
    const sec = Math.ceil(v.left / 1000);
    $('#contest-clock').textContent = v.phase === 'done' ? '끝' : `⏱ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const board = v.board || [];
    const sig = `${v.id}|${v.phase}|${v.joined}|${v.tries}|${board.map((b) => `${b.name}:${b.tries}:${b.fish?.name}:${b.fish?.size}`).join(',')}`;
    if (sig === contestSig) return; contestSig = sig;
    if (p.hidden) { p.hidden = false; pop(p, 0, 10); }
    $('#contest-board').replaceChildren(); $('#contest-buttons').replaceChildren();
    if (v.phase === 'open') {
      $('#contest-title').textContent = `🏁 낚시대회 참가 · ${board.length}명`;
      const who = contestText(`참가: ${board.map((b) => b.name).join(', ')}`, '#FFFFFF'); who.className = 'fc-who';
      $('#contest-board').append(who);
      $('#contest-text').textContent = `${v.by} 님이 열었어요. 2분 동안 5번씩, 가장 귀한 물고기(같은 등급이면 더 큰 것)가 1등! 대회에선 귀한 물고기가 더 잘 물지만 도감에는 안 들어가요.`;
      if (!v.joined) { contestButton('참가', { op: 'contest-join' }, true); contestButton('안 할래요', () => { contestHidden = contest?.id; p.hidden = true; }); }
      else if (v.host) { contestButton('지금 시작', { op: 'contest-start' }, true); contestButton('취소', { op: 'contest-leave' }); }
      else contestButton('나가기', { op: 'contest-leave' });
      return;
    }
    $('#contest-title').textContent = v.phase === 'done' ? '🏁 낚시대회 결과' : `🏁 낚시대회 · 내 낚시 ${v.tries}/${v.of}`;
    const medal = ['🥇', '🥈', '🥉'];
    board.forEach((b, i) => {
      const ft = b.fish ? `${b.fish.mark ? `${b.fish.mark} ` : ''}${b.fish.name} ${b.fish.size || ''}`.trim() : '—';
      contestRow(b.fish && i < 3 ? medal[i] : `${i + 1}.`, b.name, ft, `${b.tries}/${v.of}`, b.fish ? b.fish.color : '#7D769E', !!b.me);
    });
    $('#contest-text').textContent = v.phase === 'done' ? '대회 물고기는 도감에 들어가지 않아요' : v.tries >= v.of ? '5번 다 했어요 — 끝나길 기다려요' : '펫이 알아서 던져요. 찌가 쑥 들어가면 펫 클릭!';
  }
  // My pet casts again by itself a moment after each bite is over (the hub lets a line go back in
  // 3 s after the last one): in a contest that is on, until my five are used or time is nearly up;
  // otherwise while 계속 낚시 is on (fishGo).
  function contestAuto() {
    if (fish) { fishBusy = Date.now(); return; }
    const v = contest;
    if (v && v.phase === 'on' && v.joined) { if (v.tries >= v.of || v.left < 4000) return; }
    else if (!fishLoop) return;
    if (Date.now() - fishBusy < 2600) return;
    fishBusy = Date.now(); fishCast();
  }

  // ── 📖 the book ──
  // 🏆 The picked catch, or 🎣 my rod, shown off: the hub says it on the floor and every screen
  // (mine too) puts me on the golden stage with it (pet-fx.js plays 'brag').
  async function bookRodBrag() {
    const r = await ask('api/fish', { floor: bookFloor, op: 'rodbrag' });
    if (r.error) { say('', '🎣', r.error, 4); return; }
    $('#book').hidden = true;
  }
  async function bookBrag() {
    const r = await ask('api/fish', { floor: bookFloor, op: 'brag', id: bookPick });
    if (r.error) { say('', '🏆', r.error, 4); return; }
    $('#book').hidden = true;
  }
  // 📖 물고기 도감: every kind on the floor's book, mine in colour and the rest as shadows; a click
  // shows one big with what it is, my biggest and the floor's record; the floor's top three under.
  async function bookOpen() {
    const fl = to() || S.floor; if (!fl) return;
    bookFloor = fl;
    const p = $('#book'); if (p.hidden) { p.hidden = false; pop(p, 0, 10); }
    $('#book-title').textContent = `📖 물고기 도감 · ${fl} 층`; $('#book-sum').textContent = '불러오는 중…';
    await looks();
    const r = await ask('api/fish', { floor: fl, op: 'book' });
    if (r.error) { $('#book-sum').textContent = `⚠ ${r.error}`; return; }
    book = r.book;
    if (!bookPick) bookPick = r.book.list.find((e) => e.caught)?.id || null;
    if (!bookTab) bookTab = (bookPick && r.book.list.find((e) => e.id === bookPick)?.rarity) || 'common';
    bookDraw();
  }
  const TABS = [['common', '흔함'], ['uncommon', '가끔'], ['rare', '드묾'], ['epic', '아주'], ['legend', '전설'], ['junk', '꽝']];
  function bookDraw() {
    const bk = book; if (!bk) return;
    let sum = `내 도감 ${bk.count} / ${bk.of}종 · 지금까지 ${bk.total}마리`;
    // 🎣 My rod on this floor (N강), my ⚒️ points, and whether I can try for the next one now.
    if (bk.rod) {
      const nx = bk.rod.next;
      sum += `\n🎣 ${bk.rod.step + 1}강 ${bk.rod.name} · ⚒️ 포인트 ${bk.rod.pts}${!nx ? ' · 마지막 낚싯대!' : !nx.kindsLeft && bk.rod.pts >= nx.cost ? ' · 강화 가능!' : nx.kindsLeft ? ` · 다음 강화까지 ${nx.kindsLeft}종` : ` · 다음 강화까지 ${nx.cost - bk.rod.pts}포인트`}`;
    }
    $('#book-sum').textContent = sum;
    // One tab per rarity, each with how many of it I have.
    const tabs = $('#book-tabs'); tabs.replaceChildren();
    for (const [id, label] of TABS) {
      const all = bk.list.filter((e) => e.rarity === id), got = all.filter((e) => e.caught).length, on = bookTab === id;
      const col = all.length ? all[0].color : '#9AA0B5';
      const tab = el('div', `fish-tab ${on ? 'on' : ''}`); tab.style.borderBottomColor = on ? col : '#2E2A45';
      const r1 = el('b'); r1.textContent = label; r1.style.color = col;
      const r2 = el('span'); r2.textContent = `${got}/${all.length}`;
      tab.append(r1, r2);
      tab.onclick = () => { bookTab = id; bookDraw(); };
      tabs.append(tab);
    }
    const grid = $('#book-grid'); grid.replaceChildren();
    for (const e of bk.list.filter((x) => x.rarity === bookTab)) {
      const cell = el('div', 'fish-cell'); cell.style.background = e.caught ? '#2A2640' : '#221F33';
      cell.style.borderWidth = bookPick === e.id ? '2px' : '1px';
      cell.style.borderColor = bookPick === e.id ? '#FFFFFF' : e.caught ? e.color : '#2E2A45';
      const vb = fishVisual(e.id, 39, !e.caught); if (vb) cell.append(vb);
      cell.title = e.caught ? `${e.name} · ${e.rarityName}` : `??? · ${e.rarityName}`;
      cell.onclick = () => { bookPick = e.id; bookDraw(); };
      grid.append(cell);
    }
    // The picked one, big.
    const detail = $('#book-detail'); detail.replaceChildren();
    const e = bk.list.find((x) => x.id === bookPick);
    if (e) {
      const vb = fishVisual(e.id, 84, !e.caught); if (vb) detail.append(vb);
      const tb = el('div', 'fish-dt');
      const r1 = el('b'); r1.textContent = `${e.mark ? `${e.mark} ` : ''}${e.name}`;
      const r2 = el('span', 'rar'); r2.textContent = `  ${e.rarityName}`; r2.style.color = e.color;
      tb.append(r1, r2);
      const more = [];
      if (e.desc) more.push(e.desc);
      if (e.caught) more.push(`${e.n}마리${e.best ? ` · 최고 ${e.best}` : ''}`);
      if (e.record) more.push(`🏆 층 최대 ${e.record.size} · ${e.record.me ? '나!' : e.record.name}`);
      if (e.hint) more.push(e.hint);
      for (const t of more) { const d = el('div'); d.textContent = t; tb.append(d); }
      detail.append(tb);
      detail.hidden = false;
    } else detail.hidden = true;
    const medal = ['🥇', '🥈', '🥉'], tops = [];
    for (const p of bk.top || []) if (p) tops.push(`${medal[tops.length]} ${p.name} ${p.kinds}종${p.me ? ' ◀' : ''}`);
    $('#book-top').textContent = tops.length ? `층 TOP 3  ${tops.join('   ')}` : '아직 아무도 못 낚았어요 — 첫 손맛의 주인공이 되어 보세요';
    const bb = $('#book-buttons'); bb.replaceChildren();
    // 🏆 The picked one, if it is mine: up on a stage with it, for the whole floor to see.
    const pk = bk.list.find((x) => x.id === bookPick && x.caught);
    if (pk) bb.append(btn('🏆 자랑하기', bookBrag, '#C9A227'));
    // 🎣 My rod up on the same stage, drawn big; ⚒️ the forge.
    if (bk.rod) bb.append(btn('🎣 낚싯대 자랑', bookRodBrag, '#B8862B'), btn('⚒️ 강화', forgeOpen, '#8C5A2E'));
    bb.append(btn('🎣 낚시하기', () => { $('#book').hidden = true; if (!fishLoop) fishGo(); }, '#3B7DD8'));
    bb.append(btn('닫기', () => { $('#book').hidden = true; }, '#3B355A'));
  }

  // ── ⚒️ 낚싯대 강화 ──
  // /강화, or the menu, or the book: this rod and the next side by side, what I have (my step as
  // "N강", points, 장인의 기운, charms) and what the next needs, with its odds.
  async function forgeOpen() {
    const fl = to() || S.floor; if (!fl) { say(me(), '⚒️', '먼저 층에 들어가야 강화할 수 있어요', 3); return; }
    forgeFloor = fl; forgeNote = null;
    $('#book').hidden = true;
    const p = forgeEl; if (p.hidden) { p.hidden = false; pop(p, 0, 10); }
    $('#forge-title').textContent = `⚒️ 낚싯대 강화 · ${fl} 층`; $('#forge-sum').textContent = '불러오는 중…'; $('#forge-text').textContent = ''; $('#forge-buttons').replaceChildren();
    const r = await ask('api/fish', { floor: fl, op: 'book' });
    if (r.error) { $('#forge-sum').textContent = `⚠ ${r.error}`; return; }
    forgeDraw(r.book.rod);
  }
  // One step's picture, still: its sky behind (from step 10) and the rod, wd wide.
  function forgePic(step, wd) {
    const g = el('div', 'fish-pic'); g.style.width = `${wd}px`; g.style.height = `${(wd * 190) / 250}px`;
    if (art) {
      const n = rodN(step), k = wd / art.w;
      if (rodKind(step)?.sky) g.append(stripDiv(`sky-${n}.png`, k, true));
      g.append(stripDiv(`rod-${n}.png`, k, true));
    }
    return g;
  }
  function forgeDraw(rd) {
    forgeRod = rd; if (!rd) return;
    const stage = $('#forge-stage'); stage.replaceChildren();
    stage.append(forgePic(rd.step, 80));
    const nx = rd.next;
    forgeNext = null;
    if (nx) {
      const ar = el('div', 'fg-arrow'); ar.textContent = '→'; stage.append(ar);
      const np = forgePic(rd.step + 1, 80); np.style.opacity = 0.85; forgeNext = np; stage.append(np);
    }
    $('#forge-sum').textContent = `지금 ${rd.step + 1}강 ${rd.name}${rd.up ? ` (드문 물고기 +${rd.up}%)` : ''}\n강화 포인트 ${rd.pts} · 🛡 보호 부적 ${rd.charms}/3 · 도감 ${rd.kinds}종`;
    $('#forge-gauge .fg-fill').style.width = `${clamp(0, 1, rd.gauge / 100) * 226}px`;
    $('#forge-gauge .fg-text').textContent = nx && nx.sure ? '장인의 기운 가득! 다음 강화는 확정 성공' : `장인의 기운 ${rd.gauge}%`;
    const lines = [];
    if (forgeNote) lines.push(forgeNote);
    if (nx) {
      lines.push(`다음: ${rd.step + 2}강 ${nx.name}`);
      lines.push(`필요: 도감 ${nx.need}종${nx.kindsLeft ? ` (${nx.kindsLeft}종 더)` : ''} · 포인트 ${nx.cost}${rd.pts < nx.cost ? ` (${nx.cost - rd.pts} 모자람)` : ''}`);
      lines.push(nx.sure ? '성공 100% (장인의 기운)' : `성공 ${nx.rate}% · 실패 ${100 - nx.rate - nx.brk}% · 깨짐 ${nx.brk}%${nx.brk ? ' (-1 70% · -2 25% · 처음으로 5%)' : ''}${nx.brk && rd.charms ? ' · 🛡 부적이 막아 줘요' : ''}`);
    } else lines.push('🐉 마지막 낚싯대예요!');
    $('#forge-text').textContent = lines.join('\n');
    const bb = $('#forge-buttons'); bb.replaceChildren();
    if (nx && !nx.kindsLeft && rd.pts >= nx.cost) bb.append(btn(`⚒️ 강화하기 (-${nx.cost})`, forgeGo, '#B8862B'));
    bb.append(btn('📖 도감', () => { forgeEl.hidden = true; bookOpen(); }, '#3B7DD8'));
    bb.append(btn('닫기', () => { forgeEl.hidden = true; }, '#3B355A'));
  }
  // One try: the hub decides at once; the next rod shakes and glows for a moment, then the result
  // (success, fail, break, or a break a charm stopped) with what it left me, and its effect over my pet.
  async function forgeGo() {
    $('#forge-buttons').replaceChildren(); $('#forge-text').textContent = '⚒️ 두근두근…';
    const r = await ask('api/fish', { floor: forgeFloor, op: 'enhance' });
    if (r.error) { forgeNote = `⚠ ${r.error}`; forgeDraw(forgeRod); return; }
    if (forgeNext) {
      forgeNext.animate([{ transform: 'rotate(-6deg)' }, { transform: 'rotate(6deg)' }], { duration: 70, direction: 'alternate', iterations: 16 });
      forgeNext.style.filter = 'drop-shadow(0 0 8px gold)';
    }
    after(1200, () => {
      const rd = r.rod;
      const left = `남은 포인트 ${rd.pts} · 🛡 ${rd.charms}/3 · 장인의 기운 ${rd.gauge}%`;
      forgeNote = {
        success: `✨ 강화 성공! ${rd.step}강 → ${rd.step + 1}강 ${rd.name}\n${left}`,
        fail: `😵 강화 실패… 지금 ${rd.step + 1}강 그대로\n${left}`,
        saved: `🛡 깨질 뻔했는데 보호 부적이 막았어요! 지금 ${rd.step + 1}강 그대로\n${left}`,
        break: r.zero ? `☠️ 완전 파괴… ${rd.step + 1 + (r.drop | 0)}강 → 1강 ${rd.name}\n${left}`
          : r.drop === 2 ? `💥💥 대파괴! ${rd.step + 3}강 → ${rd.step + 1}강 ${rd.name}\n${left}`
          : `💥 낚싯대가 깨졌어요… ${rd.step + 2}강 → ${rd.step + 1}강 ${rd.name}\n${left}`,
      }[r.result] || null;
      forgeDraw(rd);
      forgeFx(r.result === 'break' && (r.zero || r.drop === 2) ? 'bigbreak' : r.result);
    });
  }
  // Over my pet: gold for a success, a puff for a fail, a shield for a save, shards for a break.
  function forgeFx(result) {
    const at = fxAt(me()); if (!at) return;
    if (result === 'success') {
      // A few gold sparkles; the big gold ring and the shake only for 13강 and up.
      if (forgeRod && forgeRod.step >= 12) legendFlash(at);
      else for (let i = 0; i < 8; i++) { const g = (i * Math.PI) / 4; fxGo(fxText('✦', 8 + rnd(4), '#FFD666'), at.x - 4, at.y - 6, Math.cos(g) * 22, Math.sin(g) * 14, 600, i * 20); }
      fxGo(fxText('✨ 강화 성공!', 12, '#FFD666'), at.x - 34, at.y - 34, 0, -14, 1300, 0);
    } else if (result === 'fail') {
      fxGo(fxText('💨', 22, '#FFFFFF'), at.x - 12, at.y - 10, 0, -20, 900, 0); fxGo(fxText('😵 실패…', 12, '#CFC9E6'), at.x - 26, at.y - 34, 0, -12, 1200, 100);
    } else if (result === 'saved') {
      fxGo(fxText('🛡', 24, '#FFFFFF'), at.x - 12, at.y - 30, 0, -14, 1200, 0); fxGo(fxText('막았다!', 12, '#9FD8FF'), at.x - 20, at.y - 46, 0, -12, 1200, 150);
    } else if (result === 'bigbreak') {
      fxGo(fxText('💥💥 대파괴!', 13, '#FF6A4A'), at.x - 44, at.y - 44, 0, -16, 1500, 0);
      for (let i = 0; i < 22; i++) { const g = (i * Math.PI) / 11; fxGo(fxText('◆', 6 + rnd(6), i % 2 ? '#C9CED6' : '#FF8A6A'), at.x - 4, at.y - 10, Math.cos(g) * (36 + rnd(26)), Math.sin(g) * 26 + 26, 900, i * 10); }
      shakeRow();
    } else if (result === 'break') {
      fxGo(fxText('💥 쨍그랑!', 12, '#FF8A6A'), at.x - 40, at.y - 40, 0, -14, 1300, 0);
      for (let i = 0; i < 12; i++) { const g = (i * Math.PI) / 6; fxGo(fxText('◆', 6 + rnd(5), '#C9CED6'), at.x - 4, at.y - 10, Math.cos(g) * (30 + rnd(20)), Math.sin(g) * 20 + 24, 800, 0); }
      shakeRow();
    }
  }

  // ── hooks for the core ──
  // A left press on my pet while my line is in: the bite comes first, then a fight click, or the
  // reel; true = handled, no drag. The hub hears how many clicks my pet got while the line was in,
  // so a bite let go can be told from a click lost.
  function press() {
    if (!fish || !fish.rod) return false;
    fish.presses = 1 + (fish.presses | 0);
    if (fish.state === 'fight') fightClick(); else if (fish.state === 'wait' || fish.state === 'bite') fishReel();
    return true;
  }
  // The 🎣 낚시 submenu (the Windows "나" menu): 계속 낚시 or stop, the contest, the book, the forge.
  const menu = () => {
    const sub = [];
    if (fish || fishLoop) sub.push({ text: '🎣 낚시 그만하기   /낚시', run: fishStop }); else sub.push({ text: '🎣 낚시하기 (계속)   /낚시', run: fishGo });
    if (!contest) sub.push({ text: '🏁 낚시대회 열기   /낚시대회', run: () => contestDo({ op: 'contest-open' }) });
    sub.push({ text: '📖 물고기 도감   /도감', run: bookOpen }, { text: '⚒️ 낚싯대 강화   /강화', run: forgeOpen });
    return [{ text: '🎣 낚시', sub }];
  };
  // /강화 opens the forge, /낚시대회 opens a contest (true when the word was mine).
  function command(t) {
    if (/^\/강화$/.test(t)) { forgeOpen(); return true; }
    if (/^\/낚시\s*대회$/.test(t)) { contestDo({ op: 'contest-open' }); return true; }
    return false;
  }
  // The poll's view of the floor's contest; then my pet casts again if it should.
  function contestState(v) { showContest(v || null); contestAuto(); }
  Mod.fish = {
    press, cast: fishGo, go: fishGo, stop: fishStop, book: bookOpen, forge: forgeOpen, tick: fishTick, friends: fishFriends, contest: contestState, command, menu,
    card: fishCard, leap: fishLeap, hold: fishHold, visual: fishVisual, width: fishWidth, rodCard, legendFlash, shakeRow, looks,
    get active() { return !!fish; },
  };
  // The drawings early, so the first catch (or someone's) shows at once.
  looks();
})();
