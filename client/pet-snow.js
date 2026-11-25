// ❄️ 눈덩이 and ⛄ 눈사람, the same as server/pet.ps1 draws them on Windows (Snowball…, Sb-…, Snow-…,
// Act-…, Freeze-Tick). /눈사람: everyone on the row turns at once into a pixel snowman in the pets'
// own style (scripts/make-snowmen.js, 36 x 60, one per kind), stands SNOW_MS with snow falling on
// it doing its animal's little thing, then melts into a puddle and the pet pops back. The dragon
// breathes fire and melts first; the penguin likes it and stays a little longer.
// A snowball (the hub's /api/snowball): the thrower times it on a bar over their pet (a snowflake
// runs back and forth; let go in the blue part to hit). A hit comes in two steps: 'aim' — the
// thrower winds up, a ❗ over the one aimed at, and on their own screen a ring closes in: a click
// on their pet just before it lands dodges (their PC judges it and tells the hub) — then 'end'.
// Hit, the pet stands frozen as its snowman for FREEZE_MS and everyone else dances round it.
// Everything is drawn in the effects' layer (#fx); movement runs on a small key-frame player below
// (the WPF key frames, eases and hold-at-the-end), so the timings are the Windows ones.
(() => {
  const SNOW_MS = 5000;
  const FREEZE_MS = 5000;
  const SNOW_LATE = { dragon: -1800, penguin: 1500 }; // melts this much before (−) or after the rest
  const SNOW_PX = 24; // the snowman's pixels per pet size: its body about as wide as the pet
  const FX_ROOM = 190;
  // Parts drawn apart by make-snowmen.js move on their own: where each turns about, in the picture's pixels.
  const PARTS = {
    cat: { tail: [28, 51] }, dog: { tail: [28, 48], bone: [33, 21] }, fox: { tail: [28, 53] }, snake: { tail: [8, 54] },
    rabbit: { carrot: [33, 26] }, monkey: { banana: [31, 24] }, panda: { bamboo: [32, 27] },
  };
  const FX_PICS = ['yarn', 'fly', 'seed', 'foxfire', 'bee', 'heart', 'feather-r', 'feather-g', 'feather-y', 'note', 'peel', 'sun', 'fin', 'leaf', 'apple', 'duckie'];
  const snowUrl = (name) => `assets/snowmen/${encodeURIComponent(name)}.png`;
  const pics = {};
  for (const n of FX_PICS) { const i = new Image(); i.src = snowUrl(`fx-${n}`); pics[n] = i; }

  const style = document.createElement('style');
  style.textContent = `
.sn-o { border-radius: 50%; box-sizing: border-box; }
.sn { width: 0; height: 0; transform-origin: 0 0; }
.sn > *, .sn-w > *, .sn-bar > * { position: absolute; }
.sn-px, .sn-w img { image-rendering: pixelated; display: block; user-select: none; -webkit-user-drag: none; }
.sn-bub { background: rgba(255, 255, 255, .95); border-radius: 7px; padding: 1px 5px 2px; border: 1px solid #55657E; color: #3A3550; white-space: nowrap; line-height: 1.3; box-sizing: border-box;
  font: 700 11px "Pretendard Variable", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
.sn-bar-bg { box-sizing: border-box; border-radius: 9px; background: rgba(30, 27, 46, .9); border: 1.5px solid #9FD3F2; }
.sn-catch { position: fixed; inset: 0; z-index: 9; cursor: pointer; background: rgba(0, 0, 0, .004); }
`;
  document.head.append(style);

  // ── a small key-frame player: WPF's DoubleAnimationUsingKeyFrames, near enough ──
  // A node is one element with its own translate (x, y), rotate (r, about cy below its origin when
  // set), scale (sx, sy) and opacity (op); keys() runs one of them through values at times (ms),
  // eased in between, and holds the last one. A new run of the same property replaces the old.
  const E = {
    lin: (t) => t, out: (t) => t * (2 - t), in: (t) => t * t,
    sine: (t) => (1 - Math.cos(Math.PI * t)) / 2,
    back: (a, mode = 'out') => { const g = (s) => s * s * s - s * a * Math.sin(Math.PI * s); return mode === 'in' ? g : (t) => 1 - g(1 - t); },
  };
  const live = new Set();
  let raf = 0;
  function nd(node, origin = '') { const n = { el: node, x: 0, y: 0, r: 0, sx: 1, sy: 1, cy: 0, op: null, tr: {} }; if (origin) node.style.transformOrigin = origin; return n; }
  function draw(n) {
    if (n.own) {
      // A pet's own sprite: the separate properties, which the core's animations on its transform
      // (a hop in, held at the end) leave alone; they come in this same order before it.
      const s = n.el.style;
      s.translate = `${n.x}px ${n.y}px`; s.rotate = `${n.r}deg`; s.scale = `${n.sx} ${n.sy}`;
      if (n.op !== null) s.opacity = n.op;
      return;
    }
    let t = `translate(${n.x}px, ${n.y}px)`;
    t += n.cy ? ` translate(0px, ${n.cy}px) rotate(${n.r}deg) translate(0px, ${-n.cy}px)` : ` rotate(${n.r}deg)`;
    n.el.style.transform = `${t} scale(${n.sx}, ${n.sy})`;
    if (n.op !== null) n.el.style.opacity = n.op;
  }
  const set = (n, v) => { Object.assign(n, v); draw(n); return n; };
  function keys(n, prop, vals, times, { ease = E.out, delay = 0, loop = false, rev = false } = {}) {
    halt(n, prop);
    const k = { n, prop, vals, times, ease, t0: performance.now() + delay, loop, rev };
    n.tr[prop] = k; live.add(k);
    if (!raf) raf = requestAnimationFrame(frame);
    return k;
  }
  // WPF's Anim: from a to b in ms after delay (linear unless eased).
  const tw = (n, prop, a, b, ms, delay = 0, ease = E.lin) => keys(n, prop, [a, b], [0, ms], { ease, delay });
  const loop = (n, prop, a, b, ms) => keys(n, prop, [a, b], [0, ms], { ease: E.sine, loop: true, rev: true }); // Sn-Loop
  const path = (n, xs, ys, ts) => { keys(n, 'x', xs, ts); keys(n, 'y', ys, ts); };
  const fade = (n, ops, ts) => keys(n, 'op', ops, ts);
  function halt(n, ...props) { for (const p of props) { const k = n.tr[p]; if (k) { live.delete(k); delete n.tr[p]; } } }
  function frame(now) {
    raf = 0;
    const dirty = new Set();
    for (const k of live) {
      const t = now - k.t0;
      if (t < 0) continue;
      if (!k.n.el.isConnected) { live.delete(k); if (k.n.tr[k.prop] === k) delete k.n.tr[k.prop]; continue; }
      const ts = k.times, end = ts[ts.length - 1];
      let tt = t, done = false;
      if (k.loop) { if (k.rev) { tt = t % (2 * end); if (tt > end) tt = 2 * end - tt; } else tt = t % end; } else if (t >= end) { tt = end; done = true; }
      let i = 0;
      while (i < ts.length - 2 && tt > ts[i + 1]) i++;
      const span = (ts[i + 1] ?? ts[i]) - ts[i], p = span > 0 ? clamp(0, 1, (tt - ts[i]) / span) : 1;
      const ez = Array.isArray(k.ease) ? k.ease[i] || E.lin : k.ease;
      const v1 = k.vals[i], v2 = k.vals[i + 1] ?? v1;
      k.n[k.prop] = v1 + (v2 - v1) * ez(p);
      dirty.add(k.n);
      if (done) { live.delete(k); if (k.n.tr[k.prop] === k) delete k.n.tr[k.prop]; }
    }
    for (const n of dirty) draw(n);
    if (live.size) raf = requestAnimationFrame(frame);
  }

  // ── small things to draw with ──
  const put = (parent, node, x, y) => { node.style.left = `${x}px`; node.style.top = `${y}px`; parent.append(node); return node; };
  const drop = (node, ms) => after(ms, () => node.remove());
  function oval(w, h, fill, line = null, lw = 0.8) {
    const d = el('div', 'sn-o'); d.style.width = `${w}px`; d.style.height = `${h}px`;
    if (fill) d.style.background = fill;
    if (line) d.style.border = `${lw}px solid ${line}`;
    return d;
  }
  const sdot = (d, color, line = null) => oval(d, d, color, line); // Snow-Dot
  const inward = (x) => (x > window.innerWidth / 2 ? -1 : 1); // Snow-In: toward the middle
  const shown = (m) => !!m && m.img.getBoundingClientRect().width > 0 && m.img.style.visibility !== 'hidden';
  const rowArea = () => ($('#rowbox') || $('#dock')).getBoundingClientRect();
  function picImg(name, w, h) {
    const im = el('img', 'sn-px'); im.src = snowUrl(name); im.draggable = false; im.alt = '';
    im.style.width = `${w}px`; im.style.height = `${h}px`;
    return im;
  }
  function measure(node) { node.style.visibility = 'hidden'; fxLayer.append(node); const r = [node.offsetWidth, node.offsetHeight]; node.remove(); node.style.visibility = ''; return r; }
  // A soft cloud of snow: white puffs that spread and fade.
  function puff(x, y, n, spread, delay = 0) {
    for (let i = 0; i < n; i++) {
      const an = (i / n) * 2 * Math.PI + Math.random() * 0.5, d = 6 + rnd(7);
      fxGo(sdot(d, '#F2F8FF', '#C9D6E8'), x - d / 2, y - d / 2, Math.cos(an) * spread, Math.sin(an) * spread * 0.5 - 6, 500 + rnd(250), delay);
    }
  }
  function spark(x, y, n, delay = 0) {
    for (let i = 0; i < n; i++) fxGo(fxText(pick(['✦', '✧', '❄']), 9 + rnd(6), pick(['#FFFFFF', '#CFEFFF', '#FFF6C8'])), x + rnd(-22, 23), y + rnd(-14, 10), rnd(-8, 9), -14 - rnd(14), 700, delay + i * 90);
  }
  // A small picture of make-snowmen.js's (fx-*.png) in whole pixels, turning about its middle.
  function snImg(name, u) {
    const p = pics[name];
    if (!p || !p.naturalWidth) return null;
    const w = p.naturalWidth * u, h = p.naturalHeight * u;
    const box = el('div', 'sn-w'); box.style.width = `${w}px`; box.style.height = `${h}px`;
    const im = el('img'); im.src = p.src; im.draggable = false; im.alt = ''; im.style.width = `${w}px`; im.style.height = `${h}px`;
    box.append(im);
    const n = nd(box, '50% 50%'); n.w = w; n.h = h; n.img = im;
    return n;
  }
  // On the effects layer itself, centred at (x, y): for things that leave the snowman.
  function snFx(n, x, y, ms) { fxAdd(n.el, x - n.w / 2, y - n.h / 2); if (ms) drop(n.el, ms); return n; }
  const put2 = (sm, node, x, y) => put(sm.el, node, x, y); // Sn-Put2, in the snowman's own place (feet at 0, 0)
  function bubble(sm, text, ms) {
    const b = el('div', 'sn-bub'); b.textContent = text;
    const [bw, bh] = measure(b);
    const d = inward(sm.x), bx = d < 0 ? sm.x - bw - 4 * sm.u : sm.x + 4 * sm.u;
    const n = nd(b, d < 0 ? '100% 100%' : '0% 100%'); set(n, { sx: 0, sy: 0 });
    fxAdd(b, bx, sm.foot - sm.ht - bh);
    tw(n, 'sx', 0, 1, 260, 0, E.back(0.8)); tw(n, 'sy', 0, 1, 260, 0, E.back(0.8));
    fade(n, [1, 1, 0], [0, ms - 250, ms]); drop(b, ms + 20);
  }

  // ── the snowman ──
  let snow = null;            // /눈사람: { until, men: Map key -> snowman }
  const frozen = new Map();   // hit by a snowball: key -> { sm, until }

  // One snowman for a pet of this kind, size the pet's size: a box whose (0, 0) is the feet.
  function make(kind, size) {
    const u = Math.max(1, Math.round(size / SNOW_PX)), iw = 36 * u, ih = 60 * u, ht = 52 * u;
    const box = el('div', 'sn');
    const body = picImg(kind, iw, ih);
    body.onerror = () => { body.onerror = null; body.src = snowUrl('cat'); };
    put(box, body, -iw / 2, -58 * u);
    const sm = { el: box, kind, ht, u, parts: {}, bub: null, acting: false, acted: false, melting: false, gone: false };
    if (kind === 'parrot') {
      const b = el('div', 'sn-bub'); b.textContent = '메리 크리스마스!'; b.style.fontSize = '10px';
      const [bw, bh] = measure(b);
      put(box, b, -bw / 2, -ht - bh - 4);
      sm.bub = nd(b, '50% 100%');
    }
    // Whole-body movement (a waddle, a hop, a squash) and the rise, all about the feet.
    sm.n = set(nd(box, '0 0'), { sy: 0 });
    for (const [name, pv] of Object.entries(PARTS[kind] || {})) {
      const im = picImg(`${kind}-${name}`, iw, ih);
      im.style.left = `${-iw / 2}px`; im.style.top = `${-58 * u}px`;
      // A tail goes behind the snow, what is held in front.
      if (name === 'tail') box.prepend(im); else box.append(im);
      sm.parts[name] = nd(im, `${(pv[0] / 36) * 100}% ${(pv[1] / 60) * 100}%`);
    }
    idle(sm);
    return sm;
  }
  function idle(sm) {
    const t = sm.parts.tail;
    if (!t) return;
    if (sm.kind === 'cat') loop(t, 'r', -14, 16, 650);
    if (sm.kind === 'dog') loop(t, 'r', -22, 22, 140);
    if (sm.kind === 'fox') loop(t, 'r', -6, 8, 900);
    if (sm.kind === 'snake') loop(t, 'r', -10, 10, 700);
  }
  function place(sm, at) { sm.x = at.x; sm.foot = at.foot; sm.el.style.left = `${at.x}px`; sm.el.style.top = `${at.foot}px`; }
  // A snowman stands up where the pet is: snow swirls in, then it pops up out of a puff.
  function rise(sm, at, delay = 0) {
    for (let i = 0; i < 10; i++) {
      const an = (i / 10) * 2 * Math.PI, r = 46 + rnd(14);
      fxGo(fxText('❄', 9 + rnd(5), '#E6F4FF'), at.x + Math.cos(an) * r - 5, at.foot - sm.ht * 0.5 + Math.sin(an) * r * 0.6 - 6, -Math.cos(an) * r, -Math.sin(an) * r * 0.6, 420, delay);
    }
    sm.el.style.opacity = 0;
    after(delay + 380, () => {
      sm.el.style.opacity = 1;
      tw(sm.n, 'sy', 0, 1, 520, 0, E.back(0.9)); tw(sm.n, 'sx', 1.35, 1, 520, 0, E.back(0.9));
      puff(at.x, at.foot - 4, 9, 30);
      spark(at.x, at.foot - sm.ht, 4, 200);
    });
  }
  // The pet hops back into place (Pop), drawn by the player so nothing lingers on its transform.
  function popPet(m, rise = 14) {
    const n = petNode(m.img, '50% 100%');
    set(n, { y: rise, op: 0 });
    tw(n, 'y', rise, 0, 450, 0, E.back(0.7)); tw(n, 'op', 0, 1, 220);
    after(480, () => freePet(m.img, n));
  }
  // A pet's own sprite moved by the player (the wind-up, a hop): one at a time, then let go.
  const petNodes = new WeakMap();
  function petNode(img, origin) {
    const old = petNodes.get(img);
    if (old) halt(old, 'x', 'y', 'r', 'sx', 'sy', 'op');
    const n = nd(img, origin); n.own = true; petNodes.set(img, n);
    return n;
  }
  function freePet(img, n) {
    if (petNodes.get(img) !== n) return;
    halt(n, 'x', 'y', 'r', 'sx', 'sy', 'op'); petNodes.delete(img);
    img.style.translate = img.style.rotate = img.style.scale = ''; img.style.transformOrigin = ''; img.style.opacity = '';
  }

  // ── each animal's own thing, once, a moment after it stands ──
  // (Where things sit, in the snowman's own units u from its feet: the head's middle (0, -38u),
  // the mouth (0, -33u), the eyes (±2.5u, -39u), the hat's top -49u.)
  function actStop(sm) {
    sm.acting = false;
    halt(sm.n, 'r', 'x', 'y');
    set(sm.n, { r: 0, cy: 0, x: 0, y: 0 });
  }
  const actDone = (sm, ms) => after(ms, () => { if (sm.acting) actStop(sm); });
  function act(sm) {
    if (!sm || sm.gone || sm.melting) return;
    sm.acted = true;
    (ACTS[sm.kind] || (() => {}))(sm);
  }
  const ACTS = {
    // 🐱 A ball of yarn rolls up; a little hop at it and off it goes, rolling away. The tail flicks.
    cat(sm) {
      const u = sm.u, d = inward(sm.x), y = snImg('yarn', u);
      if (!y) return;
      sm.acting = true;
      put2(sm, y.el, d * 46 * u - 6 * u, -12 * u);
      fade(y, [0, 1, 1, 0], [0, 200, 1500, 1850]);
      keys(y, 'x', [0, -d * 28 * u, -d * 28 * u, d * 40 * u], [0, 800, 880, 1600]);
      keys(y, 'r', [0, -d * 330, -d * 330, d * 300], [0, 800, 880, 1600]);
      keys(y, 'y', [0, 0, -7 * u, 0, -2 * u, 0], [0, 880, 1060, 1240, 1340, 1440]);
      drop(y.el, 1900);
      // The pounce: a hop at it, leaning in.
      keys(sm.n, 'x', [0, 0, d * 4 * u, 0], [0, 700, 860, 1150]);
      keys(sm.n, 'y', [0, 0, -5 * u, 0], [0, 700, 800, 950]);
      keys(sm.n, 'r', [0, 0, d * 9, 0], [0, 700, 860, 1200]);
      const t = sm.parts.tail;
      if (t) after(860, () => { keys(t, 'r', [0, 38, -10, 0], [0, 120, 300, 450]); after(470, () => loop(t, 'r', -14, 16, 650)); });
      after(880, () => spark(sm.x + inward(sm.x) * 18 * sm.u, sm.foot - 8 * sm.u, 2));
      actDone(sm, 1300);
    },
    // 🐶 The bone goes up turning and is caught; then the tail spins like a propeller, little hops.
    dog(sm) {
      const u = sm.u, b = sm.parts.bone, t = sm.parts.tail;
      sm.acting = true;
      if (b) {
        keys(b, 'y', [0, -36 * u, 0], [0, 380, 760], { ease: [E.out, E.in] });
        tw(b, 'r', 0, 720, 760);
      }
      // Caught: a squash, and the tail goes round and round.
      keys(sm.n, 'y', [0, 0, 2 * u, 0, -4 * u, 0, -4 * u, 0, -4 * u, 0], [0, 740, 820, 900, 1050, 1200, 1350, 1500, 1650, 1800]);
      if (t) {
        after(780, () => keys(t, 'r', [0, 360], [0, 180], { ease: E.lin, loop: true }));
        after(2300, () => loop(t, 'r', -22, 22, 140));
      }
      for (let i = 0; i < 3; i++) after(900 + i * 300, () => fxGo(fxText('♥', 10 + rnd(4), '#FF7A9A'), sm.x + rnd(-10, 6), sm.foot - sm.ht - 4, rnd(-8, 9), -26, 900));
      actDone(sm, 1900);
    },
    // 🐧 Off across the snow on its belly-front, leaning in, a spray behind; back again; a hop.
    penguin(sm) {
      const u = sm.u, d = inward(sm.x), go = d * 42 * u;
      sm.acting = true;
      keys(sm.n, 'x', [0, go, go, 0, 0], [0, 650, 900, 1550, 1900]);
      keys(sm.n, 'r', [0, d * 13, d * 13, 0, -d * 13, -d * 13, 0], [0, 120, 600, 800, 950, 1450, 1600]);
      keys(sm.n, 'y', [0, 0, -8 * u, 0], [0, 1600, 1720, 1880]);
      for (let i = 0; i < 10; i++) {
        const back = i >= 5, q = (i % 5) / 5, e = 1 - (1 - q) * (1 - q);
        const px = back ? go * (1 - e) : go * e, dl = back ? 900 + q * 650 : q * 650, sd = back ? d : -d;
        for (let j = 0; j < 2; j++) fxGo(sdot(3 + rnd(3), '#FFFFFF', '#C9D6E8'), sm.x + px - sd * 8 * u, sm.foot - 3, sd * (10 + rnd(12)), -6 - rnd(10), 450, dl);
      }
      after(1760, () => spark(sm.x, sm.foot - sm.ht, 2));
      actDone(sm, 1950);
    },
    // 🐸 A fly buzzes round its head; the tongue shoots out and has it; a gulp, and a bubble or two.
    frog(sm) {
      const u = sm.u, d = inward(sm.x), f = snImg('fly', u);
      if (!f) return;
      sm.acting = true;
      const cx = d * 16 * u, cy = -52 * u;
      put2(sm, f.el, cx - 4 * u, cy - 3.5 * u);
      const fx = [], fy = [], ft = [];
      for (let i = 0; i <= 16; i++) { const a = (i / 16) * 2 * Math.PI; fx.push(Math.sin(a) * 7 * u); fy.push(Math.sin(a * 2) * 3 * u); ft.push((800 * i) / 16); }
      keys(f, 'x', fx, ft, { ease: E.lin, loop: true }); keys(f, 'y', fy, ft, { ease: E.lin, loop: true });
      after(1250, () => frogTongue(sm, f, cx, cy));
      actDone(sm, 2100);
    },
    // 🐲 Fireworks: three shot straight up from its mouth, each bursting big overhead and falling away.
    dragon(sm) {
      sm.acting = true;
      const d = inward(sm.x);
      keys(sm.n, 'r', [0, -d * 8, 0, -d * 8, 0, -d * 8, 0], [0, 120, 450, 670, 1000, 1220, 1550]);
      for (const no of [0, 1, 2]) after(no * 550, () => dragonRocket(sm, no));
      actDone(sm, 1700);
    },
    // 🐰 The carrot up to its mouth, crunched (crumbs falling), then two happy hops.
    rabbit(sm) {
      const u = sm.u, c = sm.parts.carrot;
      sm.acting = true;
      if (c) {
        keys(c, 'x', [0, -12 * u, -12 * u, 0], [0, 260, 1100, 1350]);
        keys(c, 'y', [0, -2 * u, -2 * u, 0], [0, 260, 1100, 1350]);
        keys(c, 'r', [0, -72, -60, -74, -60, -74, -62, 0], [0, 260, 420, 580, 740, 900, 1060, 1350]);
      }
      for (let i = 0; i < 9; i++) fxGo(sdot(2 + rnd(2), pick(['#F28A2E', '#D86A1C', '#F7A24A'])), sm.x + rnd(-3, 4) * u, sm.foot - 33 * u, rnd(-10, 11), 18 + rnd(12), 450, 380 + i * 80);
      keys(sm.n, 'y', [0, 0, -7 * u, 0, -7 * u, 0], [0, 1350, 1480, 1610, 1740, 1870]);
      actDone(sm, 1950);
    },
    // 🐥 Two little chicks walk out from behind it, a few steps out, and back in again.
    chick(sm) {
      const u = sm.u, d = inward(sm.x), sz = Math.max(10, sm.size * 0.45);
      sm.acting = true;
      for (const j of [0, 1]) {
        const im = spriteEl('chick', sz);
        let fi = 0; const tick = setInterval(() => { if (!im.isConnected && fi > 0) { clearInterval(tick); return; } setFrame(im, [0, 1, 3, 1][fi++ % 4]); }, 100);
        const n = set(nd(im, '50% 100%'), { sx: d, op: 0 });
        im.style.left = `${-sz / 2}px`; im.style.top = `${-sz}px`; sm.el.prepend(im);
        const dl = j * 260, far = d * (16 + 11 * (1 - j)) * u;
        keys(n, 'x', [0, 0, far, far, 0], [0, dl, dl + 700, dl + 1000, dl + 1700]);
        keys(n, 'sx', [d, d, -d, -d], [0, dl + 980, dl + 1020, dl + 1700]);
        fade(n, [0, 0, 1, 1, 0], [0, dl, dl + 150, dl + 1550, dl + 1700]);
        after(dl + 1750, () => { im.remove(); clearInterval(tick); });
      }
      keys(sm.n, 'y', [0, -4 * u, 0, -4 * u, 0], [0, 120, 240, 360, 480]);
      actDone(sm, 2050);
    },
    // 🐹 Cheeks puffed out wide — then seeds spat out one after another, landing on the snow.
    hamster(sm) {
      const u = sm.u, d = inward(sm.x);
      sm.acting = true;
      keys(sm.n, 'sx', [1, 1.22, 1.16, 1.22, 1.12, 1.16, 1.06, 1.08, 1], [0, 300, 450, 600, 760, 900, 1060, 1200, 1400]);
      for (let i = 0; i < 5; i++) {
        const sd = snImg('seed', u);
        if (!sd) break;
        const x0 = sm.x + d * 3 * u, y0 = sm.foot - 33 * u, far = d * (16 + 7 * i + rnd(5)) * u, t0 = 700 + i * 150;
        snFx(sd, x0, y0, 1950); set(sd, { op: 0 });
        keys(sd, 'x', [0, 0, far * 0.6, far, far], [0, t0, t0 + 160, t0 + 320, 1950]);
        keys(sd, 'y', [0, 0, -12 * u, 31 * u, 29 * u, 31 * u], [0, t0, t0 + 140, t0 + 320, t0 + 380, t0 + 440]);
        keys(sd, 'r', [0, 0, d * 400], [0, t0, t0 + 330]);
        fade(sd, [0, 0, 1, 1, 0], [0, t0, t0 + 20, 1650, 1950]);
      }
      actDone(sm, 1500);
    },
    // 🦊 A big sweep of the tail, and two blue foxfires circling round it.
    fox(sm) {
      const u = sm.u, t = sm.parts.tail;
      sm.acting = true;
      if (t) { keys(t, 'r', [0, -40, 25, -30, 15, 0], [0, 260, 600, 950, 1300, 1600]); after(1650, () => { if (!sm.melting) loop(t, 'r', -6, 8, 900); }); }
      for (const j of [0, 1]) {
        const ff = snImg('foxfire', u);
        if (!ff) break;
        snFx(ff, sm.x, sm.foot - 28 * u, 1950);
        const xs = [], ys = [], ts = [], ops = [];
        for (let k = 0; k <= 20; k++) { const a = (k / 10) * Math.PI + j * Math.PI; xs.push(Math.cos(a) * 17 * u); ys.push(Math.sin(a) * 6 * u - k * 0.6 * u); ts.push(80 * k); ops.push(Math.sin(a) < 0 ? 0.45 : 1); }
        path(ff, xs, ys, ts);
        ops[0] = 0; ops[20] = 0; set(ff, { op: 0 }); fade(ff, ops, ts);
      }
      actDone(sm, 1650);
    },
    // 🐻 A bee buzzes round its head; a swat, another; off goes the bee, and a heart.
    bear(sm) {
      const u = sm.u, d = inward(sm.x), b = snImg('bee', u);
      if (!b) return;
      sm.acting = true;
      snFx(b, sm.x, sm.foot - 42 * u, 1900);
      const xs = [], ys = [], ts = [];
      for (let k = 0; k <= 14; k++) { const a = (k / 7) * Math.PI; xs.push(Math.cos(a) * 14 * u); ys.push(Math.sin(a * 2) * 4 * u); ts.push(90 * k); }
      xs.push(d * 40 * u); ys.push(-30 * u); ts.push(1650);
      path(b, xs, ys, ts); set(b, { op: 0 }); fade(b, [0, 1, 1, 0], [0, 150, 1400, 1650]);
      keys(b, 'r', [0, -10, 10, -10, 10, -10, 10, 0], [0, 200, 400, 600, 800, 1000, 1200, 1400]);
      keys(sm.n, 'r', [0, 0, -9, 0, 0, 9, 0], [0, 500, 620, 800, 950, 1070, 1250]);
      after(1450, () => fxGo(fxText('♥', 13, '#FF7A9A'), sm.x - 4, sm.foot - sm.ht - 6, 0, -24, 900));
      actDone(sm, 1500);
    },
    // 🐼 Munches on the bamboo (bits flying), then a roll over sideways and back up like a roly-poly.
    panda(sm) {
      const u = sm.u, d = inward(sm.x), bb = sm.parts.bamboo;
      sm.acting = true;
      if (bb) keys(bb, 'r', [0, -38, -30, -38, -30, 0], [0, 160, 300, 440, 580, 720]);
      for (let i = 0; i < 6; i++) fxGo(sdot(2 + rnd(2), pick(['#7CC46A', '#5FA84A'])), sm.x + rnd(-2, 5) * u, sm.foot - 34 * u, rnd(-10, 11), 16 + rnd(12), 450, 200 + i * 80);
      sm.n.cy = -sm.ht / 2;
      keys(sm.n, 'r', [0, 0, d * 360, d * 348, d * 368, d * 356, d * 360, 0], [0, 760, 1300, 1420, 1540, 1640, 1720, 2250]);
      keys(sm.n, 'x', [0, 0, d * 22 * u, d * 22 * u, 0], [0, 760, 1300, 1720, 2250]);
      after(1300, () => puff(sm.x + inward(sm.x) * 22 * sm.u, sm.foot - 4, 5, 18));
      actDone(sm, 2300);
    },
    // 🐷 A jump into a mud puddle, splash; hearts puff out of its snout.
    pig(sm) {
      const u = sm.u;
      sm.acting = true;
      const pd = oval(36 * u, 7 * u, 'rgba(122, 80, 52, .67)', '#6A4020', 1);
      pd.style.left = `${-18 * u}px`; pd.style.top = `${-3.5 * u}px`; sm.el.prepend(pd);
      const pn = set(nd(pd), { op: 0 }); fade(pn, [0, 0, 1, 1, 0], [0, 300, 420, 1700, 2000]); drop(pd, 2050);
      keys(sm.n, 'y', [0, -9 * u, 0, 2 * u, 0], [0, 180, 400, 470, 560]);
      for (let i = 0; i < 12; i++) {
        const an = Math.PI * (1.05 + (0.9 * i) / 11), r = 14 + rnd(14);
        fxGo(sdot(3 + rnd(4), pick(['#8A5A34', '#6A4020', '#A0703E'])), sm.x + Math.cos(an) * 12 * u, sm.foot - 3, Math.cos(an) * r, Math.sin(an) * r * 0.8, 520, 400);
      }
      for (let i = 0; i < 4; i++) {
        const h = snImg('heart', u);
        if (!h) break;
        const t0 = 700 + i * 260;
        snFx(h, sm.x + ((i % 2) * 2 - 1) * 2 * u, sm.foot - 35 * u, 2100); set(h, { op: 0 });
        path(h, [0, 0, rnd(-8, 9), rnd(-12, 13)], [0, 0, -14 * u, -26 * u], [0, t0, t0 + 450, t0 + 900]);
        fade(h, [0, 0, 1, 1, 0], [0, t0, t0 + 80, t0 + 650, t0 + 900]);
      }
      actDone(sm, 700);
    },
    // 🐭 Leans down to its cheese and nibbles: one hole, two, three, crumbs flying.
    mouse(sm) {
      const u = sm.u;
      sm.acting = true;
      keys(sm.n, 'r', [0, 7, 5, 7, 5, 7, 5, 7, 0], [0, 250, 450, 650, 850, 1050, 1250, 1450, 1700]);
      const holes = [[14, -4.5], [16.6, -6.4], [11.6, -3.2]];
      for (let i = 0; i < 3; i++) {
        const hx = holes[i][0] * u, hy = holes[i][1] * u, t0 = 450 + i * 400;
        const o = oval(2.2 * u, 1.8 * u, '#B07A14'); o.style.opacity = 0;
        put2(sm, o, hx - 1.1 * u, hy - 0.9 * u);
        after(t0, () => {
          o.style.opacity = 1;
          for (let k = 0; k < 4; k++) fxGo(sdot(2 + rnd(2), pick(['#F6C93C', '#FFE08A'])), sm.x + hx, sm.foot + hy, rnd(-8, 9), -8 - rnd(8), 380, k * 40);
        });
      }
      actDone(sm, 1750);
    },
    // 🦜 Head-bobs to its own "메리 크리스마스!", the bubble bouncing, feathers flying up and floating down.
    parrot(sm) {
      const u = sm.u;
      sm.acting = true;
      keys(sm.n, 'y', [0, -4 * u, 0, -4 * u, 0, -4 * u, 0], [0, 120, 240, 360, 480, 600, 720]);
      if (sm.bub) { keys(sm.bub, 'sx', [1, 1.25, 0.95, 1.08, 1], [0, 120, 260, 380, 500]); keys(sm.bub, 'sy', [1, 1.25, 0.95, 1.08, 1], [0, 120, 260, 380, 500]); }
      for (let i = 0; i < 6; i++) {
        const f = snImg(['feather-r', 'feather-g', 'feather-y'][i % 3], u);
        if (!f) break;
        snFx(f, sm.x, sm.foot - 42 * u, 2300);
        const an = Math.PI * (1.15 + (0.7 * i) / 5), r = (14 + rnd(8)) * u, ex = Math.cos(an) * r, ey = Math.sin(an) * r;
        path(f, [0, ex, ex + 5 * u, ex - 5 * u, ex + 4 * u], [0, ey, ey + 10 * u, ey + 20 * u, ey + 30 * u], [0, 300, 900, 1500, 2100]);
        keys(f, 'r', [0, 40, -30, 30, -20], [0, 300, 900, 1500, 2100]);
        fade(f, [1, 1, 0], [0, 1700, 2200]);
      }
      actDone(sm, 800);
    },
    // 🦉 The head turns right round (a flip) and back; the big eyes glow and blink; stars twinkle.
    owl(sm) {
      const u = sm.u;
      sm.acting = true;
      keys(sm.n, 'sx', [1, 1, -1, -1, 1], [0, 200, 330, 700, 830]);
      for (const ex of [-2.5, 2.5]) {
        const g = oval(5 * u, 5 * u, 'radial-gradient(closest-side, rgba(255, 236, 120, 1), rgba(255, 210, 60, 0))');
        const gn = set(nd(g, '50% 50%'), { op: 0 });
        put2(sm, g, (ex - 2.5) * u, -41.5 * u);
        fade(gn, [0, 0, 1, 1, 0], [0, 900, 1050, 1900, 2100]);
        keys(gn, 'sy', [1, 1, 0.1, 1, 1, 0.1, 1], [0, 1300, 1380, 1460, 1600, 1680, 1760]);
        drop(g, 2150);
      }
      for (let i = 0; i < 6; i++) fxGo(fxText('✦', 8 + rnd(5), pick(['#FFF2B0', '#CFEFFF', '#FFFFFF'])), sm.x + rnd(-24, 20), sm.foot - sm.ht - rnd(0, 20), 0, -6, 700, 950 + i * 140);
      actDone(sm, 900);
    },
    // 🦆 A little pond under it, a rubber duck floating across, rings on the water.
    duck(sm) {
      const u = sm.u, d = inward(sm.x);
      sm.acting = true;
      const pd = oval(40 * u, 8 * u, 'rgba(140, 203, 240, .6)', 'rgba(95, 168, 216, .67)', 1);
      pd.style.left = `${-20 * u}px`; pd.style.top = `${-4 * u}px`; sm.el.prepend(pd);
      const pn = set(nd(pd), { op: 0 }); fade(pn, [0, 1, 1, 0], [0, 250, 2100, 2400]); drop(pd, 2450);
      const dk = snImg('duckie', u);
      if (dk) {
        dk.el.style.transformOrigin = '50% 100%';
        put2(sm, dk.el, -d * 17 * u - 5.5 * u, -8 * u); set(dk, { op: 0 });
        if (d < 0) dk.img.style.transform = 'scaleX(-1)';
        const xs = [0], ys = [0], ts = [0];
        for (let k = 0; k <= 12; k++) { xs.push((d * 34 * u * k) / 12); ys.push(Math.sin(k * 1.4) * 1.2 * u); ts.push(300 + 140 * k); }
        path(dk, xs, ys, ts); fade(dk, [0, 0, 1, 1, 0], [0, 300, 450, 1800, 2000]);
        keys(dk, 'r', [0, -8, 8, -8, 8, 0], [0, 600, 900, 1200, 1500, 1800]);
        drop(dk.el, 2050);
      }
      for (let i = 0; i < 3; i++) {
        const rg = oval(10 * u, 2.4 * u, '', '#E6F6FF', 1), t0 = 500 + i * 450;
        const rn = set(nd(rg, '50% 50%'), { sx: 0.3, sy: 0.3, op: 0 });
        put2(sm, rg, rnd(-10, 6) * u, -2.4 * u);
        keys(rn, 'sx', [0.3, 0.3, 2], [0, t0, t0 + 600]); keys(rn, 'sy', [0.3, 0.3, 2], [0, t0, t0 + 600]);
        fade(rn, [0, 0, 1, 0], [0, t0, t0 + 60, t0 + 600]); drop(rg, t0 + 650);
      }
      actDone(sm, 600);
    },
    // 🐯 A crouch, then a roar: rings of sound go out, snow is blown off, everything shakes.
    tiger(sm) {
      const u = sm.u, d = inward(sm.x);
      sm.acting = true;
      keys(sm.n, 'r', [0, -d * 8, d * 6, d * 6, 0], [0, 350, 480, 1100, 1300]);
      keys(sm.n, 'x', [0, 0, -2, 2, -2, 2, -2, 2, 0], [0, 480, 560, 640, 720, 800, 880, 960, 1040]);
      for (let i = 0; i < 3; i++) {
        const rg = oval(30, 22, '', '#FFB04A', 2.5), t0 = 480 + i * 170;
        const rn = set(nd(rg, '50% 50%'), { sx: 0.2, sy: 0.2, op: 0 });
        fxAdd(rg, sm.x + d * 4 * u - 15, sm.foot - 33 * u - 11);
        keys(rn, 'sx', [0.2, 0.2, 2.6], [0, t0, t0 + 550]); keys(rn, 'sy', [0.2, 0.2, 2.6], [0, t0, t0 + 550]);
        fade(rn, [0, 0, 1, 0], [0, t0, t0 + 40, t0 + 550]); drop(rg, t0 + 600);
      }
      for (let i = 0; i < 14; i++) {
        const an = Math.random() * 2 * Math.PI;
        fxGo(sdot(3 + rnd(3), '#FFFFFF', '#C9D6E8'), sm.x + Math.cos(an) * 8 * u, sm.foot - 30 * u + Math.sin(an) * 12 * u, Math.cos(an) * 40 + d * 20, Math.sin(an) * 24, 600, 500 + rnd(200));
      }
      actDone(sm, 1350);
    },
    // 🐮 Nods along to its own bell: a jingle, notes going up.
    ox(sm) {
      const u = sm.u;
      sm.acting = true;
      keys(sm.n, 'r', [0, -5, 5, -5, 5, -5, 5, 0], [0, 220, 440, 660, 880, 1100, 1320, 1500]);
      for (let i = 0; i < 5; i++) {
        const n = snImg('note', u);
        if (!n) break;
        const t0 = 150 + i * 260, sx = ((i % 2) * 2 - 1) * (10 + rnd(8)) * u;
        snFx(n, sm.x + ((i % 2) * 2 - 1) * 3 * u, sm.foot - 30 * u, 2200); set(n, { op: 0 });
        path(n, [0, 0, sx * 0.6, sx], [0, 0, -16 * u, -30 * u], [0, t0, t0 + 450, t0 + 900]);
        fade(n, [0, 0, 1, 1, 0], [0, t0, t0 + 60, t0 + 650, t0 + 900]);
      }
      for (let i = 0; i < 4; i++) fxGo(fxText('✦', 9, '#FFE066'), sm.x + rnd(-8, 4), sm.foot - 32 * u + rnd(-4, 4), 0, -4, 400, i * 300);
      actDone(sm, 1550);
    },
    // 🐍 Sways as if charmed, the tail wiggling, the forked tongue flicking out and in.
    snake(sm) {
      const u = sm.u, t = sm.parts.tail;
      sm.acting = true;
      keys(sm.n, 'r', [0, -6, 6, -6, 6, -6, 0], [0, 300, 600, 900, 1200, 1500, 1750]);
      if (t) { keys(t, 'r', [0, 28, -20, 28, -20, 28, -20, 0], [0, 200, 400, 600, 800, 1000, 1200, 1400]); after(1450, () => { if (!sm.melting) loop(t, 'r', -10, 10, 700); }); }
      const ns = 'http://www.w3.org/2000/svg', sv = document.createElementNS(ns, 'svg');
      sv.setAttribute('width', '1'); sv.setAttribute('height', '1'); sv.style.overflow = 'visible';
      const pl = document.createElementNS(ns, 'polyline');
      pl.setAttribute('points', [[0, 0], [0, 7], [-2, 9.5], [0, 7], [2, 9.5]].map((p) => `${p[0] * u},${p[1] * u}`).join(' '));
      pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#E0304A'); pl.setAttribute('stroke-width', Math.max(1, u * 0.9));
      sv.append(pl);
      const tn = set(nd(sv, '0 0'), { sy: 0 });
      put2(sm, sv, 0, -29 * u);
      keys(tn, 'sy', [0, 0, 1, 0, 0, 1, 0, 0, 1, 0], [0, 300, 380, 470, 650, 730, 820, 1000, 1080, 1170]);
      drop(sv, 1250);
      actDone(sm, 1800);
    },
    // 🐴 Rears up and stamps down, twice — snow kicked up behind, the wind in its mane.
    horse(sm) {
      const u = sm.u, d = inward(sm.x);
      sm.acting = true;
      keys(sm.n, 'r', [0, -d * 12, 0, 0, -d * 12, 0], [0, 300, 450, 750, 1050, 1200]);
      keys(sm.n, 'y', [0, -6 * u, 0, 0, -6 * u, 0], [0, 300, 450, 750, 1050, 1200]);
      for (const t0 of [450, 1200]) after(t0, () => {
        const dd = inward(sm.x);
        for (let i = 0; i < 8; i++) fxGo(sdot(3 + rnd(3), '#FFFFFF', '#C9D6E8'), sm.x - dd * 6 * sm.u, sm.foot - 3, -dd * (14 + rnd(22)), -8 - rnd(16), 500);
        puff(sm.x, sm.foot - 3, 4, 16);
      });
      for (let i = 0; i < 5; i++) {
        const ln = el('div'); ln.style.width = `${10 + rnd(8)}px`; ln.style.height = '1.5px'; ln.style.background = 'rgba(255, 255, 255, .8)';
        fxGo(ln, sm.x + d * 26 * u, sm.foot - (40 + rnd(10)) * u, -d * 50 * u, 0, 600, 200 + i * 220);
      }
      actDone(sm, 1300);
    },
    // 🐑 Fluffs up and floats like a cloud, drifting a little, then settles back down.
    sheep(sm) {
      const u = sm.u;
      sm.acting = true;
      keys(sm.n, 'sx', [1, 1.14, 1.14, 1], [0, 300, 1700, 2000]); keys(sm.n, 'sy', [1, 1.1, 1.1, 1], [0, 300, 1700, 2000]);
      keys(sm.n, 'y', [0, -16 * u, -12 * u, -16 * u, 0], [0, 700, 1100, 1500, 2000]);
      keys(sm.n, 'r', [0, 4, -4, 4, 0], [0, 600, 1000, 1400, 1900]);
      for (const t0 of [300, 700, 1100, 1500]) after(t0, () => { for (let i = 0; i < 3; i++) fxGo(sdot(8 + rnd(6), '#F6F8FF', '#C9D6E8'), sm.x + rnd(-14, 10) * sm.u * 0.6, sm.foot - 6, rnd(-10, 11), 6, 700); });
      actDone(sm, 2050);
    },
    // 🐵 Eats the banana in two bites, throws the peel over its shoulder, and bounces about.
    monkey(sm) {
      const u = sm.u, d = inward(sm.x), bn = sm.parts.banana;
      sm.acting = true;
      if (bn) {
        keys(bn, 'x', [0, -11 * u, -11 * u], [0, 250, 900]);
        keys(bn, 'y', [0, -4 * u, -4 * u], [0, 250, 900]);
        keys(bn, 'r', [0, -50, -40, -50, -40], [0, 250, 450, 650, 850]);
        fade(bn, [1, 1, 0, 0, 1], [0, 880, 920, 2100, 2300]);
        after(2100, () => { halt(bn, 'x', 'y', 'r'); set(bn, { x: 0, y: 0, r: 0 }); });
      }
      const pl = snImg('peel', u);
      if (pl) {
        snFx(pl, sm.x, sm.foot - 36 * u, 2200); set(pl, { op: 0 });
        const bx = -d * 26 * u;
        path(pl, [0, 0, bx * 0.5, bx, bx], [0, 0, -22 * u, 33 * u, 33 * u], [0, 920, 1150, 1420, 2200]);
        keys(pl, 'r', [0, 0, -d * 540], [0, 920, 1420]);
        fade(pl, [0, 0, 1, 1, 0], [0, 900, 930, 1900, 2200]);
      }
      keys(sm.n, 'y', [0, 0, -6 * u, 0, -6 * u, 0], [0, 1450, 1570, 1690, 1810, 1930]);
      actDone(sm, 2000);
    },
    // 🐓 Leans back and crows: a little sun comes up behind it, its rays turning, "꼬끼오!".
    rooster(sm) {
      const u = sm.u, d = inward(sm.x);
      sm.acting = true;
      keys(sm.n, 'r', [0, -d * 12, -d * 12, 0], [0, 300, 1100, 1350]);
      const sn = snImg('sun', u);
      if (sn) {
        sn.el.style.left = `${(d * 12 - 7.5) * u}px`; sn.el.style.top = `${-46 * u}px`; sm.el.prepend(sn.el); set(sn, { op: 0 });
        keys(sn, 'y', [0, -22 * u, -24 * u], [0, 700, 1800]);
        tw(sn, 'r', 0, 120, 2000);
        fade(sn, [0, 1, 1, 0], [0, 300, 1600, 2000]);
        drop(sn.el, 2050);
      }
      after(350, () => bubble(sm, '꼬끼오~!', 1300));
      for (let i = 0; i < 5; i++) fxGo(fxText('✦', 9 + rnd(4), '#FFD24A'), sm.x + d * 12 * sm.u + rnd(-20, 16), sm.foot - 70 * sm.u + rnd(-12, 12), 0, -6, 600, 700 + i * 150);
      actDone(sm, 1400);
    },
    // 🦈 The snow turns to water round it and a fin goes round and round it, then dives.
    shark(sm) {
      const u = sm.u;
      sm.acting = true;
      const pd = oval(46 * u, 10 * u, 'rgba(111, 180, 224, .6)', 'rgba(63, 136, 192, .67)', 1);
      pd.style.left = `${-23 * u}px`; pd.style.top = `${-5 * u}px`; sm.el.prepend(pd);
      const pn = set(nd(pd), { op: 0 }); fade(pn, [0, 1, 1, 0], [0, 250, 2000, 2300]); drop(pd, 2350);
      const fn = snImg('fin', u);
      if (fn) {
        fn.el.style.transformOrigin = '50% 100%';
        put2(sm, fn.el, -4.5 * u, -9 * u);
        const xs = [0], ys = [0], ts = [0], ops = [0];
        for (let k = 0; k <= 24; k++) { const a = (k / 12) * 2 * Math.PI; xs.push(Math.cos(a) * 19 * u); ys.push(Math.sin(a) * 3.5 * u); ts.push(250 + 70 * k); ops.push(Math.sin(a) < -0.2 ? 0.35 : 1); }
        ops[1] = 0;
        set(fn, { op: 0 }); path(fn, xs, ys, ts); fade(fn, ops, ts);
        drop(fn.el, 2000);
      }
      for (let i = 0; i < 8; i++) fxGo(sdot(2 + rnd(3), '#BFE6FF'), sm.x + rnd(-18, 18) * u, sm.foot - 3, rnd(-6, 7), -10 - rnd(8), 400, 300 + i * 200);
      actDone(sm, 400);
    },
    // 🦔 Bristles up — and little apples and maple leaves pop onto the tips of its spikes, then drop off.
    hedgehog(sm) {
      const u = sm.u;
      sm.acting = true;
      keys(sm.n, 'sy', [1, 0.88, 1.08, 1], [0, 200, 330, 450]);
      let j = 0;
      for (const i of [1, 3, 5, 7]) {
        const a = Math.PI * (0.05 + (0.9 * i) / 8), ix = 16 - Math.cos(a) * 11.5 + 2, iy = 9 - Math.sin(a) * 8 + 6;
        const p = snImg(j % 2 ? 'leaf' : 'apple', u);
        if (!p) break;
        const x = (ix - 18) * u, y = (iy - 58) * u;
        put2(sm, p.el, x - p.w / 2, y - p.h / 2); set(p, { op: 0 });
        const t0 = 350 + j * 120, dropY = -y - 3 * u, t1 = 1300 + j * 100;
        path(p, [0, 0, 0, 0, rnd(-8, 9) * u], [-6 * u, -6 * u, 0, 0, dropY], [0, t0, t0 + 160, t1, t1 + 400]);
        keys(p, 'r', [0, 0, 200], [0, t1, t1 + 400]);
        fade(p, [0, 0, 1, 1, 0], [0, t0, t0 + 100, t1 + 500, t1 + 750]);
        after(t0, () => spark(sm.x + x, sm.foot + y, 1));
        drop(p.el, t1 + 800); j++;
      }
      actDone(sm, 500);
    },
  };
  function frogTongue(sm, f, cx, cy) {
    if (sm.gone) return;
    const u = sm.u, fx = cx + f.x, fy = cy + f.y;
    halt(f, 'x', 'y'); set(f, { x: fx - cx, y: fy - cy });
    const mx = 0, my = -33 * u, len = Math.hypot(fx - mx, fy - my), ang = (Math.atan2(fy - my, fx - mx) * 180) / Math.PI;
    const tg = el('div');
    tg.style.width = `${len}px`; tg.style.height = `${2.4 * u}px`; tg.style.borderRadius = `${1.2 * u}px`; tg.style.boxSizing = 'border-box';
    tg.style.background = '#E8627A'; tg.style.border = `${Math.max(1, u * 0.6)}px solid #9A2A40`;
    const tn = set(nd(tg, '0 50%'), { r: ang, sx: 0 });
    put2(sm, tg, mx, my - 1.2 * u);
    keys(tn, 'sx', [0, 1, 1, 0], [0, 90, 150, 330]);
    // Caught on the tip and pulled in.
    keys(f, 'x', [fx - cx, fx - cx, mx - cx], [0, 150, 330]);
    keys(f, 'y', [fy - cy, fy - cy, my - cy], [0, 150, 330]);
    after(340, () => { f.el.remove(); tg.remove(); });
    // The gulp: puffed out wide, then a bubble or two going up.
    after(360, () => {
      keys(sm.n, 'sx', [1, 1.2, 0.95, 1], [0, 120, 260, 380]);
      for (let i = 0; i < 3; i++) { const dd = (3 + i) * sm.u * 0.8; fxGo(oval(dd, dd, '', '#9FD8F2', 1.2), sm.x + rnd(-4, 5), sm.foot - 36 * sm.u, rnd(-6, 7), -26 - i * 6, 800, 200 + i * 160); }
    });
  }
  function dragonRocket(sm, no) {
    if (sm.gone) return;
    const u = sm.u, d = inward(sm.x);
    const x0 = sm.x + d * 2 * u, y0 = sm.foot - 34 * u;
    const x1 = sm.x + d * [4, 22, 12][no] * u, y1 = Math.max(30, sm.foot - sm.ht - [70, 56, 84][no]);
    const up = 480;
    // The rocket: a bright head going up fast, slowing, embers dropping off behind it.
    const hd = sdot(6, '#FFF6C8', '#FFB12E'), hn = nd(hd);
    fxAdd(hd, x0 - 3, y0 - 3);
    tw(hn, 'x', 0, x1 - x0, up, 0, E.out); tw(hn, 'y', 0, y1 - y0, up, 0, E.out);
    drop(hd, up);
    for (let i = 0; i < 10; i++) {
      const q = i / 10, p = 1 - (1 - q) * (1 - q);
      fxGo(sdot(2 + rnd(3), pick(['#FFE066', '#FFB12E', '#FF7A2E'])), x0 + (x1 - x0) * p - 1, y0 + (y1 - y0) * p - 1, rnd(-3, 4), 8 + rnd(8), 380, q * up);
    }
    after(up, () => firework(x1, y1, no));
  }
  // A burst: a flash, a ring of sparks flying out and drooping as they fade, a few smaller inside,
  // then a twinkle here and there.
  function firework(x, y, no) {
    const set3 = [['#FFD24A', '#FFF2B0', '#FF9F2E'], ['#FF7AB8', '#FFD0E6', '#FF4F8A'], ['#7CE8FF', '#E6F8FF', '#5FA8FF']][no % 3];
    const fl = oval(40, 40, 'radial-gradient(closest-side, rgba(255, 250, 225, .86), rgba(255, 250, 225, 0))');
    const fn = set(nd(fl, '50% 50%'), { sx: 0.3, sy: 0.3 });
    fxAdd(fl, x - 20, y - 20);
    tw(fn, 'sx', 0.3, 1.6, 260); tw(fn, 'sy', 0.3, 1.6, 260); tw(fn, 'op', 1, 0, 280); drop(fl, 300);
    for (const [n, r, sz] of [[22, 46, 5], [10, 22, 3]]) {
      for (let i = 0; i < n; i++) {
        const an = (i / n) * 2 * Math.PI + Math.random() * 0.15, rr = r * (0.85 + Math.random() * 0.3), dd = sz + rnd(2);
        const sp = sdot(dd, pick(set3)), sn = nd(sp);
        fxAdd(sp, x - dd / 2, y - dd / 2);
        const dx = Math.cos(an) * rr, dy = Math.sin(an) * rr * 0.85;
        tw(sn, 'x', 0, dx, 1000, 0, E.out);
        keys(sn, 'y', [0, dy, dy + 24], [0, 420, 1100]);
        fade(sn, [1, 1, 0], [0, 600, 1100]);
        drop(sp, 1150);
      }
    }
    for (let i = 0; i < 6; i++) fxGo(fxText('✦', 9 + rnd(6), pick(set3)), x + rnd(-44, 40), y + rnd(-34, 30), 0, 10, 600, 380 + i * 90);
  }

  // ── ⛄ /눈사람 for everyone ──
  function snowAll() {
    const now = Date.now();
    if (!snow) snow = { until: now + SNOW_MS, men: new Map() };
    else { snow.until = now + SNOW_MS; for (const [k, sm] of snow.men) if (sm.gone) snow.men.delete(k); }
    // A flurry over the whole row first.
    const a = rowArea(), top = Math.max(0, a.top - FX_ROOM);
    for (let i = 0; i < 16; i++) fxGo(fxText('❄', 9 + rnd(9), pick(['#FFFFFF', '#E6F4FF', '#CFE8FF'])), a.left + rnd(Math.max(10, Math.floor(a.width) - 10)), top + rnd(60), rnd(-25, 26), 110 + rnd(60), 2200, i * 120);
    snowTick();
  }
  // 🔥 The dragon breathes a flame up into the sky, and its own snow goes first.
  function dragonFire(sm) {
    const dir = inward(sm.x), mx = sm.x + dir * sm.u * 2, my = sm.foot - 34 * sm.u;
    for (let i = 0; i < 22; i++) {
      const d = 6 + rnd(5) + i * 0.35;
      fxGo(sdot(d, pick(['#FFE066', '#FFB12E', '#FF7A2E', '#FF4A2E'])), mx - d / 2, my - d / 2, dir * (4 + rnd(26)) + rnd(-8, 9), -60 - rnd(50), 520 + rnd(200), i * 40);
    }
    fxGo(fxText('화르륵!', 15, '#FF6A2E'), mx + (dir < 0 ? -64 : 8), my - 20, dir * 10, -16, 1000, 100);
    puff(sm.x, sm.foot - sm.ht * 0.6, 6, 22, 300);
  }
  function melt(sm) {
    if (sm.acting) actStop(sm);
    sm.melting = true;
    set(sm.n, { r: 0, x: 0, y: 0, sx: 1, sy: 1 });
    let wait = 0;
    if (sm.kind === 'dragon') { dragonFire(sm); wait = 700; }
    tw(sm.n, 'sy', 1, 0.1, 1200, wait, E.in); tw(sm.n, 'sx', 1, 1.4, 1200, wait, E.in);
    sm.n.op = 1; tw(sm.n, 'op', 1, 0, 350, wait + 950);
    // Steam going up, drops coming down.
    for (let i = 0; i < 5; i++) fxGo(sdot(7 + rnd(5), '#D8E6F0'), sm.x + rnd(-14, 10), sm.foot - sm.ht * 0.55, rnd(-8, 9), -30 - rnd(18), 800, wait + 150 + i * 150);
    for (let i = 0; i < 7; i++) fxGo(oval(3, 5, '#8CCBF0'), sm.x + rnd(-16, 17), sm.foot - sm.ht * 0.45, 0, sm.ht * 0.42, 450, wait + 150 + i * 130);
    const pw = sm.u * 34, ph = sm.u * 6, pd = oval(pw, ph, 'rgba(140, 203, 240, .6)', 'rgba(95, 168, 216, .67)', 1);
    const pn = set(nd(pd), { op: 0 });
    fxAdd(pd, sm.x - pw / 2, sm.foot - ph / 2);
    tw(pn, 'op', 0, 1, 400, wait + 500);
    after(wait + 1500, () => { tw(pn, 'op', 1, 0, 900); drop(pd, 950); });
    after(wait + 1250, () => {
      sm.el.remove(); sm.gone = true;
      const hm = S.members.get(sm.key);
      if (hm && !frozen.has(sm.key)) { hm.img.style.visibility = ''; popPet(hm, 14); spark(sm.x, sm.foot - 20, 3); }
    });
  }
  // Every tick (0.2 s) while there are snowmen: new arrivals on the row, where each stands now,
  // snow falling on them, each one's own little thing, the melting.
  function snowTick() {
    const sn = snow;
    if (!sn) return;
    const now = Date.now(), tk = S.tick;
    let liveN = 0, n = 0;
    for (const [k, m] of S.members) {
      if (!m || !m.img.getBoundingClientRect().width) continue;
      let sm = sn.men.get(k);
      if (!sm) {
        if (now > sn.until - 1500) continue;
        const fz = frozen.get(k);
        // Hidden by something else (on the dance stage, flying): not now.
        if (!fz && m.img.style.visibility === 'hidden') continue;
        if (fz) { fz.sm.el.remove(); fz.sm.gone = true; frozen.delete(k); }
        const at = fxAt(m);
        sm = make(m.kind, at.size);
        sm.key = k; sm.size = at.size; sm.born = now;
        fxAdd(sm.el, at.x, at.foot); place(sm, at); sn.men.set(k, sm); m.img.style.visibility = 'hidden';
        rise(sm, at, n * 90); n++;
      }
      if (sm.gone) continue;
      liveN++;
      if (sm.melting) continue;
      m.img.style.visibility = 'hidden';
      place(sm, fxAt(m));
      if (now - sm.born < 1000) continue; // still coming up
      // Snow keeps falling on it, and now and then a glint.
      if (rnd(3) === 0) fxGo(fxText('❄', 7 + rnd(4), '#EAF6FF'), sm.x + rnd(-26, 22), sm.foot - sm.ht - 18, rnd(-6, 7), 34 + rnd(20), 1100);
      if (rnd(9) === 0) spark(sm.x, sm.foot - sm.ht * 0.6, 1);
      if (!sm.acted && now - sm.born > 1300) act(sm);
      if (!sm.acting) idleTick(sm, tk);
      // The penguin jumps for joy, hearts and all, while the others melt.
      if (sm.kind === 'penguin' && !sm.acting && [...sn.men.values()].some((o) => o.melting && !o.gone)) {
        set(sm.n, { y: [-8, 0][tk % 2] });
        if (tk % 2 === 0) fxGo(fxText('♥', 11 + rnd(5), '#FF7A9A'), sm.x + rnd(-12, 8), sm.foot - sm.ht - 6, rnd(-8, 9), -30, 900);
      }
      if (now > sn.until + (SNOW_LATE[m.kind] || 0)) melt(sm);
    }
    // Snowmen of pets no longer on the row go as they are.
    for (const [k, sm] of sn.men) if (!S.members.has(k) && !sm.gone) { sm.el.remove(); sm.gone = true; }
    if (!liveN && now > sn.until) snow = null;
  }
  function idleTick(sm, tk) {
    const n = sm.n, k = sm.kind;
    if (n.tr.r || n.tr.x || n.tr.y) return;
    if (k === 'duck' || k === 'chick') set(n, { r: [-5, 0, 5, 0][tk % 4] });
    else if (k === 'penguin') set(n, { r: [-4, 0, 4, 0][tk % 4] });
    else if (['dog', 'cat', 'fox', 'tiger'].includes(k)) set(n, { r: tk % 10 < 2 ? [-4, 4][tk % 2] : 0 });
    else if (['rabbit', 'frog', 'horse', 'monkey', 'mouse'].includes(k)) set(n, { y: tk % 8 === 0 ? -7 : tk % 8 === 1 ? -3 : 0 });
    else if (k === 'hamster') { if (!n.tr.sx) set(n, { sx: tk % 10 < 3 ? 1.1 : 1 }); }
    else if (k === 'shark') { if (!n.tr.sx && tk % 4 === 0) set(n, { sx: -n.sx }); }
    else if (k === 'ox') set(n, { r: [-3, 0, 3, 0][tk % 4] });
    else set(n, { x: tk % 12 < 2 ? [-1, 1][tk % 2] : 0 });
  }

  // ── ❄️ 눈덩이 ──
  let aim = null;      // the timing bar: { el, mk, bw, zone, body, catcher, onKey }
  const flying = new Map(); // id -> a hit on its way (between 'aim' and 'end')
  let dodge = null;    // aimed at me: the one my click on my pet dodges

  // The timing bar over my pet: a snowflake runs back and forth; the blue part in the middle hits.
  function throwAt(body) {
    if (aim) return;
    const me = S.members.get('');
    if (!shown(me)) return;
    const at = fxAt(me), bw = 100, zone = 20;
    const box = el('div', 'sn-bar');
    const bg = el('div', 'sn-bar-bg'); bg.style.width = `${bw + 8}px`; bg.style.height = '18px'; put(box, bg, -4, -3);
    const zr = el('div'); zr.style.width = `${zone}px`; zr.style.height = '12px'; zr.style.borderRadius = '3px'; zr.style.background = '#5FB3DD'; put(box, zr, (bw - zone) / 2, 0);
    const mk = fxText('❄', 15, '#FFFFFF'); put(box, mk, -6, -5);
    const lb = fxText('파란 칸에서 클릭!', 11, '#CFEFFF'); put(box, lb, 8, -22);
    const x0 = Math.max(4, Math.min(window.innerWidth - bw - 8, at.x - bw / 2));
    fxAdd(box, x0, at.y - 44);
    const mn = nd(mk);
    keys(mn, 'x', [0, bw], [0, 520], { ease: E.lin, loop: true, rev: true });
    // The click (or Space) anywhere: a see-through cover over the window for a moment.
    const cover = el('div', 'sn-catch');
    cover.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); letGo(e.button === 2); });
    cover.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
    const onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); letGo(); } else if (e.key === 'Escape') { e.preventDefault(); letGo(true); }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.append(cover);
    // The Mac app lets clicks through where nothing is drawn: keep the mouse while the bar is up.
    S.holding = true; if (app?.mouse) { S.over = true; app.mouse(true); }
    aim = { el: box, mn, bw, zone, body, cover, onKey };
    // Nothing pressed: it goes anyway, wide.
    const a0 = aim;
    after(2500, () => { if (aim === a0) letGo(); });
  }
  // Let go: where the snowflake is now decides it (a hit in the blue part); Esc or right click stops.
  async function letGo(stop = false) {
    const a0 = aim;
    if (!a0) return;
    aim = null;
    const pos = a0.mn.x;
    halt(a0.mn, 'x'); a0.el.remove(); a0.cover.remove();
    document.removeEventListener('keydown', a0.onKey, true);
    S.holding = false;
    if (stop) return;
    const hit = Math.abs(pos - a0.bw / 2) <= a0.zone / 2 + 1;
    const r = await ask('api/snowball', { to: a0.body.to, floor: a0.body.floor, hit });
    if (r.error) say('', '❄️', `⚠ ${r.error}`, 3);
  }

  // A throw on this screen. A miss just goes. A hit comes in two steps from the hub: 'aim' — the
  // thrower winds up and holds, a ❗ over the one aimed at; on their own screen a ring closes in and
  // a click on their pet just before it lands dodges (mine) — then 'end', how it went.
  function snowball(akey, f) {
    if (!f || !f.to) return;
    const tk = f.me ? '' : `${f.floor}|${f.to}`;
    if (f.phase === 'end') {
      const st = flying.get(f.id);
      if (st) flying.delete(f.id);
      if (st && st.me) {
        // The hub's word came before the ball left here: put the dodge away and show how it went.
        if (!st.gone) { if (dodge === st) dodge = null; sbClear(st); st.me = false; sbLet(st, !!f.hit, !!f.dodged); }
        return;
      }
      if (st) { sbLet(st, !!f.hit, !!f.dodged); return; }
    }
    const st = plan(akey, tk);
    if (!st) {
      // My pet is not up to see it coming: it hits.
      if (f.phase === 'aim' && f.me) ask('api/snowball', { op: 'end', id: f.id, dodged: false, floor: f.floor });
      return;
    }
    if (f.phase === 'aim') {
      st.id = f.id; st.me = !!f.me; st.floor = f.floor; flying.set(f.id, st);
      wind(st); warnOver(st);
      if (st.me) mine(st, f.warn | 0, f.fly | 0);
      else after(10000, () => { if (flying.get(st.id) === st) { flying.delete(st.id); sbClear(st); } });
      return;
    }
    // A miss, or how it went when the 'aim' never showed here: the plain throw.
    wind(st); after(240, () => sbLet(st, !!f.hit, !!f.dodged));
  }
  function plan(akey, tk) {
    const ma = akey === null || akey === undefined ? null : S.members.get(akey), mb = S.members.get(tk);
    if (!shown(mb)) return null;
    const b = fxAt(mb);
    const own = !!ma && akey !== tk && shown(ma);
    const a = own ? fxAt(ma) : { x: b.x + 140 * inward(b.x), y: b.y - 10, size: b.size };
    return { ma, mb, tk, own, a, b, dir: b.x >= a.x ? 1 : -1, me: false };
  }
  // The wind-up: lean back, the ball held up behind the head, and stay so until it goes.
  function wind(st) {
    if (!st.own) return;
    const dir = st.dir, a = st.a, pn = petNode(st.ma.img, '50% 100%');
    tw(pn, 'r', 0, -dir * 17, 160); tw(pn, 'x', 0, -dir * 4, 160); tw(pn, 'sy', 1, 0.89, 160); tw(pn, 'sx', 1, 1.07, 160);
    const hb = oval(11, 11, '#F6F9FF', '#55657E', 1.3), hn = nd(hb);
    fxAdd(hb, a.x - dir * a.size * 0.45 - 5, a.y - 2);
    tw(hn, 'y', 0, -7, 200); tw(hn, 'x', 0, -dir * 3, 200);
    st.pn = pn; st.hb = hb;
  }
  // ❗ over the one aimed at, bobbing, until it goes.
  function warnOver(st) {
    const b = st.b, t = fxText('❗', 16, '#FF5A5A');
    fxAdd(t, b.x - 7, b.y - 26);
    keys(nd(t), 'y', [0, -5], [0, 220], { ease: E.lin, loop: true, rev: true });
    st.warn = t;
  }
  function sbClear(st) {
    for (const e of [st.hb, st.warn, st.ring, st.hint]) e?.remove();
    st.hb = st.warn = st.ring = st.hint = null;
    if (st.own && st.pn) { freePet(st.ma.img, st.pn); st.pn = null; }
  }
  // Let it go: snap forward, the ball leaves on the snap.
  function sbLet(st, hit, dodged) {
    st.gone = true;
    st.hb?.remove(); st.warn?.remove(); st.hb = st.warn = null;
    if (st.own && st.pn) {
      const dir = st.dir, tm = [0, 80, 330], pn = st.pn;
      keys(pn, 'r', [-dir * 17, dir * 14, 0], tm); keys(pn, 'x', [-dir * 4, dir * 6, 0], tm);
      keys(pn, 'sy', [0.89, 1.08, 1], tm); keys(pn, 'sx', [1.07, 0.94, 1], tm);
      after(380, () => freePet(st.ma.img, pn)); st.pn = null;
    }
    fly({ a: st.a, b: st.b, tk: st.tk, mb: st.mb, hit, dodge: dodged, dir: st.dir, st: st.me ? st : null, ms: st.flyMs });
  }
  // On my own screen, aimed at me: a ring closes in on my pet; when it turns gold (the ball is on its
  // way and nearly here), a click on my pet jumps it. Too early, and the jump is spent.
  function mine(st, warn, flyMs) {
    if (warn <= 0) warn = 1000;
    if (flyMs <= 0) flyMs = 350;
    st.t0 = Date.now(); st.flyMs = flyMs; st.win0 = warn + flyMs - 330; st.win1 = warn + flyMs - 20; st.pressed = false; st.dodged = false;
    dodge = st;
    const b = st.b, d = b.size * 1.15;
    const ring = oval(d, d, '', '#9FD3F2', 2.5), rn = set(nd(ring, '50% 50%'), { sx: 2.6, sy: 2.6 });
    fxAdd(ring, b.x - d / 2, b.y + b.size / 2 - d / 2);
    tw(rn, 'sx', 2.6, 1, warn + flyMs); tw(rn, 'sy', 2.6, 1, warn + flyMs);
    st.ring = ring;
    const h = fxText('내 펫을 눌러 피하기!', 11, '#CFEFFF');
    fxAdd(h, Math.max(4, Math.min(window.innerWidth - 110, b.x - 52)), b.y - 48); st.hint = h;
    after(st.win0, () => { if (st.ring && !st.pressed) { st.ring.style.borderColor = '#FFD84A'; st.ring.style.borderWidth = '3.5px'; } });
    after(warn, () => { if (flying.get(st.id) === st) sbLet(st, true, false); });
  }
  // The click on my pet while a ball is coming at me (pet.js pressable, before the fishing line).
  function press() {
    if (dodge && Date.now() - dodge.t0 > dodge.win1 + 3000) dodge = null; // long past its ball: let go
    const st = dodge;
    if (!st) return false;
    if (st.pressed) return true;
    st.pressed = true;
    const t = Date.now() - st.t0;
    st.dodged = t >= st.win0 && t <= st.win1;
    if (st.ring) st.ring.style.borderColor = st.dodged ? '#7CF29A' : '#FF7A7A';
    hop(st.mb, st.dodged);
    return true;
  }
  // Up it goes: high and turning when it dodges (the ball flies under), a little hop when too early.
  function hop(m, big) {
    if (!m || !m.img.getBoundingClientRect().width) return;
    const img = m.img, sz = img.getBoundingClientRect().height, n = petNode(img, '50% 50%');
    if (big) {
      keys(n, 'y', [0, -sz * 1.1, -sz * 1.1, 0], [0, 150, 400, 600]);
      tw(n, 'r', 0, 360, 450, 100);
      after(650, () => freePet(img, n));
    } else {
      keys(n, 'y', [0, -sz * 0.35, 0], [0, 120, 260]);
      after(300, () => freePet(img, n));
    }
  }
  function ballEl() {
    const b = el('div'); b.style.width = b.style.height = '12px';
    const o = oval(12, 12, '#F6F9FF', '#55657E', 1.5); o.style.position = 'absolute'; o.style.left = o.style.top = '0';
    // A crease of darker snow, so the spin shows.
    const c = oval(4, 4, '#B8C7DC'); c.style.position = 'absolute'; c.style.left = '2px'; c.style.top = '3px';
    b.append(o, c);
    return nd(b, '50% 50%');
  }
  // Low and fast: barely lifts, straight in.
  function fly(q) {
    const { a, b, dir } = q;
    const sx = a.x + dir * a.size * 0.35, sy = a.y + a.size * 0.2;
    let ex = b.x - dir * b.size * 0.15, ey = b.y + b.size * 0.3;
    if (!q.hit && !q.dodge && !q.st) { ex = b.x - dir * b.size * 0.9; ey = b.foot - 2; }
    const dx = ex - sx, dy = ey - sy, dist = Math.hypot(dx, dy);
    const ms = q.ms ? q.ms | 0 : Math.round(Math.max(220, Math.min(420, 160 + dist * 0.45))), hi = 12;
    const bl = ballEl();
    fxAdd(bl.el, sx - 6, sy - 6);
    const xs = [0], ys = [0], ts = [0];
    for (let i = 1; i <= 8; i++) {
      const u = i / 8, px = dx * u, py = dy * u - hi * 4 * u * (1 - u);
      xs.push(px); ys.push(py); ts.push(ms * u);
      // A short streak behind it, gone fast.
      if (i < 8) fxGo(sdot(2 + rnd(3), '#FFFFFF', '#C9D6E8'), sx + px - 2, sy + py - 2, -dir * 4, 2, 220, ms * u);
    }
    keys(bl, 'x', xs, ts, { ease: E.lin }); keys(bl, 'y', ys, ts, { ease: E.lin });
    tw(bl, 'r', 0, dir * 540, ms);
    // Dodged, seen from another screen: the pet jumps just as it comes.
    if (q.dodge && !q.st) after(Math.max(10, ms - 170), () => hop(q.mb, true));
    Object.assign(q, { bl, ex, ey, dx, dy });
    after(ms, () => land(q));
  }
  function land(q) {
    const bl = q.bl;
    if (q.st) {
      // Aimed at me: how it went is mine to say.
      const st = q.st;
      if (dodge === st) dodge = null;
      sbClear(st); q.dodge = !!st.dodged; q.hit = !q.dodge;
      ask('api/snowball', { op: 'end', id: st.id, dodged: q.dodge, floor: st.floor });
    }
    if (q.dodge) {
      // Under the pet and on, gone.
      keys(bl, 'x', [q.dx, q.dx + q.dir * 70], [0, 300]); keys(bl, 'y', [q.dy, q.dy + 6], [0, 300]);
      tw(bl, 'op', 1, 0, 300); drop(bl.el, 320);
      const d = inward(q.b.x);
      fxGo(fxText('휙!', 15, '#9FD3F2'), q.b.x + (d < 0 ? -40 : 8), q.b.y - 34, d * 6, -16, 800);
      return;
    }
    bl.el.remove();
    if (q.hit) hitAt(q.tk); else missAt(q.ex, q.ey);
  }
  // A miss: snow bursts up off the ground at the feet.
  function missAt(x, y) {
    for (let i = 0; i < 9; i++) { const an = Math.PI * (1 + i / 8); fxGo(sdot(3 + rnd(3), '#FFFFFF', '#AFC0D8'), x, y - 3, Math.cos(an) * (14 + rnd(10)), Math.sin(an) * 12, 500); }
    const dir = inward(x);
    fxGo(fxText('빗나갔다!', 13, '#8FA6C4'), x + (dir < 0 ? -64 : 6), y - 30, dir * 6, -14, 900);
  }
  function hitAt(tk) {
    const mb = S.members.get(tk);
    if (!mb || !mb.img.getBoundingClientRect().width) return;
    const b = fxAt(mb), hy = b.y + b.size * 0.3;
    for (let i = 0; i < 16; i++) {
      const an = (i / 16) * 2 * Math.PI + Math.random() * 0.3, sz = 3 + rnd(5);
      fxGo(sdot(sz, '#FFFFFF', '#AFC0D8'), b.x - sz / 2, hy, Math.cos(an) * (22 + rnd(18)), Math.sin(an) * 16 + 12, 650);
    }
    const ring = oval(44, 26, '', '#FFFFFF', 2), rn = set(nd(ring, '50% 50%'), { sx: 0.2, sy: 0.2 });
    fxAdd(ring, b.x - 22, hy - 13);
    tw(rn, 'sx', 0.2, 1.2, 350); tw(rn, 'sy', 0.2, 1.2, 350); tw(rn, 'op', 1, 0, 350); drop(ring, 400);
    const dir = inward(b.x);
    fxGo(fxText('퍽!', 17, '#5F7FA8'), b.x + (dir < 0 ? -40 : 8), hy - 30, dir * 6, -18, 850);
    // Already a snowman (/눈사람 going on): only the burst.
    if (snow?.men.get(tk) && !snow.men.get(tk).gone) return;
    const fz = frozen.get(tk);
    if (fz) { fz.until = Date.now() + FREEZE_MS; return; }
    const sm = make(mb.kind, b.size);
    sm.key = tk; sm.size = b.size;
    fxAdd(sm.el, b.x, b.foot); place(sm, b); mb.img.style.visibility = 'hidden';
    tw(sm.n, 'sy', 0, 1, 350, 0, E.back(0.9)); tw(sm.n, 'sx', 1.4, 1, 350, 0, E.back(0.9));
    puff(b.x, b.foot - 4, 7, 26);
    after(1000, () => { const f2 = frozen.get(sm.key); if (f2 && f2.sm === sm) act(sm); });
    frozen.set(tk, { sm, until: Date.now() + FREEZE_MS });
    after(250, () => crowdDance(tk));
  }
  // A snowman made: everyone else on the row gets up and dances round it (the one who threw too).
  function crowdDance(skip) {
    for (const [k, m] of S.members) {
      if (k === skip || frozen.has(k)) continue;
      if (shown(m)) Mod.fx?.play?.('dance', k);
    }
  }
  // Every tick: the frozen ones shiver where their pets stand, then shake it all off.
  function freezeTick() {
    if (!frozen.size) return;
    const now = Date.now();
    for (const [k, fz] of frozen) {
      const sm = fz.sm, m = S.members.get(k);
      if (!m || !m.img.getBoundingClientRect().width) { sm.el.remove(); sm.gone = true; frozen.delete(k); if (m) m.img.style.visibility = ''; continue; }
      const at = fxAt(m);
      place(sm, at);
      m.img.style.visibility = 'hidden';
      if (!sm.acting) set(sm.n, { x: [-1.5, 1.5][S.tick % 2] });
      if (rnd(4) === 0) fxGo(fxText('❄', 8, '#DDF0FF'), at.x + rnd(-20, 16), at.foot - sm.ht * 0.8, rnd(-10, 11), 18, 700);
      if (now < fz.until) continue;
      // Shaken off: snow flies out every way and the pet hops back.
      frozen.delete(k); sm.el.remove(); sm.gone = true;
      for (let i = 0; i < 16; i++) { const an = (i / 16) * 2 * Math.PI; fxGo(sdot(3 + rnd(4), '#FFFFFF', '#AFC0D8'), at.x, at.foot - sm.ht * 0.5, Math.cos(an) * 34, Math.sin(an) * 22, 550); }
      puff(at.x, at.foot - 6, 6, 24);
      m.img.style.visibility = ''; popPet(m, 12);
    }
  }
  // Everything put away (the pet turned off): the pets back as they are.
  function stopAll() {
    if (aim) letGo(true);
    for (const [k, fz] of frozen) { fz.sm.el.remove(); const m = S.members.get(k); if (m) m.img.style.visibility = ''; }
    frozen.clear();
    if (snow) { for (const sm of snow.men.values()) { sm.el.remove(); const m = S.members.get(sm.key); if (m && !sm.gone) m.img.style.visibility = ''; } snow = null; }
    for (const st of flying.values()) sbClear(st);
    flying.clear(); dodge = null;
  }

  // ── hooks for the core ──
  Mod.snow = {
    // Someone else's pet: thrown at once from the bar over mine; anyone can be hit.
    menuFor: (p) => [{ text: '❄️ 눈덩이 던지기', run: () => throwAt({ to: p.who, floor: p.floor }) }],
    // A snowball line from the hub (m.fish: the throw; me: aimed at me). Others' effects off: only
    // what I threw or what is thrown at me.
    play(m, who, st) {
      const f = m.fish;
      if (!f) return;
      if (!m.mine && !f.me && st?.fxOff) return;
      snowball(who, f);
    },
    fx(kind) { if (kind === 'snowman') snowAll(); },
    state(st) { if (st && st.on === false) stopAll(); },
    tick() { snowTick(); freezeTick(); if (dodge && Date.now() - dodge.t0 > dodge.win1 + 3000) dodge = null; },
    command: () => false,
    press,
    stop: stopAll,
  };
})();
