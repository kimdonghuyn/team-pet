// 🎆 Chat effects (server/team.js FX), the same ones server/pet.ps1 draws on Windows: fireworks,
// claps, hearts, ㅋㅋ, rain and snow with every animal's own umbrella, the dance stage, a catch
// leaping over whoever reeled it in, and a catch shown off on the golden stage. Everything is drawn
// in the effects' layer (fxLayer) over the pets, in the same shapes, colours and timings.
(() => {
  const WX_MS = 5000;
  const DANCE_MS = 4000;
  const BRAG_MS = 4200;
  const FX_ROOM = 190; // above the pets, for things to rise into
  let wx = null;    // the weather: { kind, until, umb: Map, solo: Set, closing, n }
  let stage = null; // the dance stage: { el, cx, y, unit, dancers, until, ending }
  const bragging = new Set();
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}) => { const n = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const dot = (w, h, color) => { const d = el('div', 'fxdot'); d.style.width = `${w}px`; d.style.height = `${h}px`; d.style.background = color; return d; };
  const area = () => $('#dock').getBoundingClientRect();

  // 🎆 A rocket goes up from the pet's head and bursts into a ring of sparks.
  function burst(x, y, up, delay) {
    fxGo(dot(3, 7, '#FFE8B0'), x - 1.5, y, 0, -up, 380, delay, EASE.quadOut);
    const c = pick(FX_COLORS), c2 = pick(FX_COLORS);
    fxGo(dot(14, 14, 'rgba(255, 244, 214, .8)'), x - 7, y - up - 7, 0, 0, 220, delay + 360);
    for (let i = 0; i < 18; i++) {
      const a = ((i + Math.random() * 0.5) / 18) * 2 * Math.PI, rr = 28 + rnd(16), sz = 3 + rnd(3);
      // Out in a ring, then a little lower: the sparks fall as they fade.
      fxGo(dot(sz, sz, i % 3 ? c : c2), x - sz / 2, y - up, Math.cos(a) * rr, Math.sin(a) * rr + 14, 1000, delay + 360, EASE.quadOut);
    }
  }

  function play(kind, key, data = null) {
    const at = fxAt(key);
    if (!at) return;
    const hx = at.x, hy = at.y;
    switch (kind) {
      case 'fireworks': burst(hx - 26, hy, 85, 0); burst(hx + 8, hy, 115, 380); burst(hx + 34, hy, 70, 760); break;
      case 'clap': for (let i = 0; i < 3; i++) fxGo(fxText('👏', 15, '#F4C27A'), hx - 10 + (i - 1) * 14, hy - 18, 0, -40, 1100, i * 250); break;
      case 'heart': for (let i = 0; i < 6; i++) fxGo(fxText('♥', 12 + rnd(7), '#F28482'), hx - 6 + rnd(-14, 15), hy - 14, rnd(-16, 17), -60 - rnd(30), 1500, i * 180); break;
      case 'lol': for (let i = 0; i < 5; i++) fxGo(fxText(i === 2 ? '😂' : 'ㅋ', 13 + rnd(4), '#E9C46A'), hx - 8 + rnd(-18, 19), hy - 16, rnd(-10, 11), -45 - rnd(25), 1100, i * 140); break;
      case 'snow': startWx('snow', key); break;
      case 'rain': startWx('rain', key); break;
      case 'umbrella': startWx('umbrella', key); break;
      case 'dance': dance(key, at); break;
      // ⛄ /눈사람: everyone on the row turns into their snowman for a while (pet-snow.js).
      case 'snowman': Mod.snow?.fx?.('snowman', key, data); break;
      case 'fish': fishShow(key, at, data); break;
      case 'brag': brag(key, at, data); break;
      case 'fling': fling(key, at, data); break;
    }
  }

  // ── 🌧 /비 and ❄ /눈: weather over the whole row for a few seconds ──
  // Everyone in it puts up an umbrella, one after another with a little hop. Rain splashes off the
  // umbrellas and leaves puddles at their feet; snow piles up on them and slides off when they
  // close. /우산 while it falls twirls that umbrella (the drops fly off), and without weather just
  // holds one up a moment.
  // Each animal's own umbrella: its colour, what sticks up from the dome (ears, horns, a comb...)
  // and what its face has besides two eyes and blushes (a beak, a snout).
  const UMB_KIND = {
    cat: ['#F4A261', 'pointy'], dog: ['#C9A27E', 'floppy'], rabbit: ['#EFE9F4', 'long'], chick: ['#F6D365', 'tuft', 'beak'],
    penguin: ['#4A4E69', '', 'beak'], hamster: ['#E9B87A', 'round'], fox: ['#E07A5F', 'pointy'], bear: ['#9C6B4E', 'round'],
    panda: ['#F2F2F2', 'round'], frog: ['#81B29A', 'frog'], pig: ['#F4B6C2', 'pointy', 'snout'], mouse: ['#B8B8C8', 'big'],
    parrot: ['#6BCB77', 'tuft', 'beak'], owl: ['#A0785A', 'pointy', 'beak'], hedgehog: ['#9C7A5B', 'spikes'], duck: ['#F7E07E', 'tuft', 'beak'],
    tiger: ['#F4A261', 'pointy'], ox: ['#D9CBB8', 'horns'], snake: ['#7FB77E', ''], horse: ['#A47551', 'pointy'],
    sheep: ['#F5F0E6', 'floppy'], monkey: ['#B07D56', 'side'], rooster: ['#F2E9DC', 'comb', 'beak'], shark: ['#7D9DB5', 'fin'], dragon: ['#6FB98F', 'horns'],
  };
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.floor(v * f).toString(16).padStart(2, '0'));
    return `#${c.join('')}`;
  }
  // An animal's umbrella wd wide, leaning a little towards its pet: a low dome of four panels,
  // every other one in shade, a scalloped hem, the animal's ears (or horns...) and face, a crook
  // handle. The canopy opens and closes sideways; snow gathers on it as lumps along the dome.
  function umbrella(wd, kind) {
    const spec = UMB_KIND[kind] || ['#C3B1E1', 'pointy'];
    const [color, style, nose] = spec;
    const r = wd / 2, h = Math.round(wd * 0.34 * 10) / 10, hl = Math.round((h + wd * 0.55) * 10) / 10, dip = 5;
    // A point on the dome at deg (0 = right, 90 = top), out further out.
    const dp = (deg, out) => { const a = (deg * Math.PI) / 180; return [r + (r + out) * Math.cos(a), h - (h + out) * Math.sin(a)]; };
    const poly = (fill, pts) => svg('polygon', { fill, points: pts.map((p) => p.join(',')).join(' ') });
    const oval = (fill, cx, cy, rx, ry, ang = 0) => svg('ellipse', { fill, cx, cy, rx, ry, ...(ang ? { transform: `rotate(${ang} ${cx} ${cy})` } : {}) });
    const box = svg('svg', { width: wd, height: hl + 4, viewBox: `0 0 ${wd} ${hl + 4}` });
    box.classList.add('fx-umb');
    box.style.transformOrigin = '50% 100%'; box.style.transform = 'rotate(-9deg)';
    box.append(svg('path', { d: `M ${r},${h} L ${r},${hl} A 3.5,3.5 0 0 1 ${r - 7},${hl}`, stroke: '#A89DBE', 'stroke-width': 1.8, fill: 'none', 'stroke-linecap': 'round' }));
    const top = svg('g');
    top.style.transformOrigin = `${r}px ${h}px`;
    const add = (n) => top.append(n);
    const pink = '#F2B5B5', dark = shade(color, 0.78);
    // Behind the dome: what sticks up from it.
    for (const sd of [1, -1]) {
      if (style === 'pointy') {
        const m0 = 90 + sd * 28;
        add(poly(color, [dp(m0 + 13, 0), dp(m0 - 13, 0), dp(m0, r * 0.34)]));
        add(poly(pink, [dp(m0 + 8, 1), dp(m0 - 8, 1), dp(m0, r * 0.22)]));
      } else if (style === 'round' || style === 'big') {
        const p0 = dp(90 + sd * 30, r * 0.05), er = r * (style === 'big' ? 0.27 : 0.2);
        add(oval(kind === 'panda' ? '#2E2E2E' : color, p0[0], p0[1], er, er));
        if (kind !== 'panda') add(oval(pink, p0[0], p0[1], er * 0.55, er * 0.55));
      } else if (style === 'long') {
        const p0 = dp(90 + sd * 16, r * 0.42);
        add(oval(color, p0[0], p0[1], r * 0.12, r * 0.42, -sd * 12)); add(oval(pink, p0[0], p0[1] + 2, r * 0.055, r * 0.3, -sd * 12));
      } else if (style === 'horns') {
        const m0 = 90 + sd * 28;
        add(poly('#F2E3C6', [dp(m0 + 7, 0), dp(m0 - 7, 0), dp(m0 - sd * 4, r * 0.42)]));
      } else if (style === 'frog') {
        const p0 = dp(90 + sd * 25, r * 0.04);
        add(oval(color, p0[0], p0[1], r * 0.17, r * 0.17));
      }
    }
    if (style === 'tuft') for (const j of [-1, 0, 1]) { const p0 = dp(90 - j * 7, r * 0.12); add(oval(dark, p0[0], p0[1], r * 0.05, r * 0.16, j * 25)); }
    if (style === 'comb') for (const j of [-1, 0, 1]) { const p0 = dp(90 - j * 9, r * 0.06); add(oval('#E05A47', p0[0], p0[1], r * 0.1, r * 0.1)); }
    if (style === 'spikes') for (let deg = 160; deg >= 20; deg -= 20) add(poly('#7A5C43', [dp(deg + 7, 0), dp(deg - 7, 0), dp(deg, r * 0.2)]));
    if (style === 'fin') add(poly(dark, [dp(106, 0), dp(80, 0), dp(100, r * 0.5)]));
    const xs = [0, 1, 2, 3, 4].map((i) => (i * wd) / 4);
    const hem = [4, 3, 2, 1].map((i) => `Q ${(xs[i] + xs[i - 1]) / 2},${h - dip} ${xs[i - 1]},${h}`).join(' ');
    const canopy = svg('path', { d: `M 0,${h} A ${r},${h} 0 0 1 ${wd},${h} ${hem} Z`, fill: color, stroke: 'rgba(0, 0, 0, .22)', 'stroke-width': 1 });
    add(canopy);
    for (const i of [1, 3]) add(svg('path', { d: `M ${r},0.5 L ${xs[i]},${h} Q ${(xs[i] + xs[i + 1]) / 2},${h - dip} ${xs[i + 1]},${h} Z`, fill: 'rgba(0, 0, 0, .118)' }));
    // In front of the dome: hanging ears, and the face.
    for (const sd of [1, -1]) {
      if (style === 'floppy') add(oval(dark, r - sd * r * 0.92, h * 0.78, r * 0.13, r * 0.3, sd * 20));
      if (style === 'side') { add(oval(color, r - sd * r * 1.0, h * 0.6, r * 0.17, r * 0.17)); add(oval('#E8C9A5', r - sd * r * 1.0, h * 0.6, r * 0.1, r * 0.1)); }
      if (style === 'frog') {
        const p0 = dp(90 + sd * 25, r * 0.04);
        add(oval('#FFFFFF', p0[0], p0[1], r * 0.1, r * 0.1)); add(oval('#3A3045', p0[0], p0[1], r * 0.05, r * 0.05));
      } else {
        const ex = r - sd * r * 0.2, ey = h * 0.56;
        if (kind === 'panda') add(oval('#3A3A3A', ex, ey, r * 0.1, r * 0.075, sd * 25));
        const eye = Math.max(1.3, r * 0.055);
        add(oval(kind === 'panda' || kind === 'penguin' ? '#FFFFFF' : '#3A3045', ex, ey, eye, eye));
      }
      add(oval('rgba(242, 132, 130, .33)', r - sd * r * 0.36, h * 0.74, r * 0.08, r * 0.045));
    }
    if (nose === 'beak') add(poly('#F2A541', [[r - r * 0.07, h * 0.64], [r + r * 0.07, h * 0.64], [r, h * 0.78]]));
    else if (nose === 'snout') { add(oval('#E89AAB', r, h * 0.72, r * 0.11, r * 0.075)); for (const sd of [1, -1]) add(oval('#9C5B6B', r - sd * r * 0.04, h * 0.72, 1, 1)); }
    else if (style !== 'frog') add(oval('#3A3045', r, h * 0.68, r * 0.035, r * 0.028));
    box.append(top);
    // Lumps of snow sitting on the dome, bigger towards the top; apart from the canopy, so they
    // slide off on their own when it closes.
    const pile = svg('g'), blobs = [];
    for (let k = 0; k < 7; k++) {
      const th = Math.PI * (0.86 - k * 0.12), d = 5 + 3 * Math.sin(th) + rnd(3);
      const px = r + r * 0.9 * Math.cos(th), py = h - h * Math.sin(th);
      const b = svg('ellipse', { cx: px, cy: py - d * 0.65 + d * 0.4, rx: d / 2, ry: d * 0.4, fill: '#F4F7FD', stroke: 'rgba(0, 0, 0, .118)', 'stroke-width': 0.6 });
      b.style.transformOrigin = `${px}px ${py - d * 0.65 + d * 0.8}px`; b.style.transform = 'scale(0)';
      pile.append(b); blobs.push(b);
    }
    box.append(pile);
    return { el: box, top, canopy, pile, blobs, wd, h, piling: false, puddle: null };
  }
  function umbOpen(m, at, n) {
    const u = umbrella(at.size * 1.45, m.kind);
    u.el.style.opacity = 0; u.top.style.transform = 'scaleX(.1)';
    umbPlace(u, at); fxLayer.append(u.el);
    const delay = (n % 6) * 150;
    anim(u.el, { opacity: [0, 1] }, 150, delay, 'linear');
    anim(u.top, { transform: ['scaleX(.1)', 'scaleX(1)'] }, 380, delay, EASE.back);
    // A little hop as it goes up.
    anim(m.g, { transform: ['translateY(0)', 'translateY(-10px)'] }, 150, delay, 'linear');
    after(delay + 160, () => anim(m.g, { transform: ['translateY(-10px)', 'translateY(0)'] }, 220));
    return u;
  }
  // Held a little to the side, the canopy just over the head; the puddle under the feet.
  function umbPlace(u, at) {
    u.el.style.left = `${at.x - u.wd / 2 + at.size * 0.22}px`; u.el.style.top = `${at.y - u.h + at.size * 0.08}px`;
    if (u.puddle) { u.puddle.style.left = `${at.x - u.puddle.offsetWidth / 2}px`; u.puddle.style.top = `${at.foot - 3}px`; }
  }
  // /우산 under the weather: a twirl (the canopy flips round and back) and the drops fly off it.
  function umbTwirl(u) {
    anim(u.top, { transform: ['scaleX(1)', 'scaleX(-1)'] }, 200);
    after(210, () => anim(u.top, { transform: ['scaleX(-1)', 'scaleX(1)'] }, 200));
    const x0 = parseFloat(u.el.style.left) + u.wd / 2, y0 = parseFloat(u.el.style.top) + u.h * 0.8;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 2 * Math.PI;
      fxGo(dot(3, 3, '#C8DAF0'), x0 + (Math.cos(a) * u.wd) / 2, y0, Math.cos(a) * 16, Math.sin(a) * 6 + 10, 450, 120);
    }
  }
  function startWx(kind, key) {
    const now = Date.now();
    if (wx?.closing) { after(900, () => play(kind, key)); return; }
    if (kind === 'umbrella') {
      if (wx?.umb.has(key)) { umbTwirl(wx.umb.get(key)); return; }
      if (!wx) wx = { kind: 'none', until: now, umb: new Map(), solo: new Set(), closing: false, n: 0 };
      wx.solo.add(key);
      if (wx.kind === 'none' && now + 3000 > wx.until) wx.until = now + 3000;
      return;
    }
    if (!wx) wx = { kind, until: now, umb: new Map(), solo: new Set(), closing: false, n: 0 };
    wx.kind = kind; wx.until = now + WX_MS;
  }
  // Every animation tick while there is weather: umbrellas for whoever has none yet (and kept over
  // their pets as the row changes), the falling rain or snow, splashes, the snow piling up.
  function wxTick() {
    if (!wx || wx.closing) return;
    if (Date.now() > wx.until) { wxEnd(wx); return; }
    let floorY = 0;
    for (const [k, m] of S.members) {
      if (wx.kind === 'none' && !wx.solo.has(k)) continue;
      const at = fxAt(m);
      if (!at || !at.size) continue;
      if (at.foot > floorY) floorY = at.foot;
      let u = wx.umb.get(k);
      if (!u) { u = umbOpen(m, at, wx.n); wx.umb.set(k, u); wx.n++; }
      const shown = m.img.style.visibility !== 'hidden';
      u.el.style.visibility = shown ? '' : 'hidden';
      if (wx.kind === 'snow' && !u.piling) {
        // One lump after another, in no particular order, each settling in with a small bounce.
        u.piling = true;
        for (const b of u.blobs) anim(b, { transform: ['scale(0)', 'scale(1)'] }, 600, 400 + rnd(3200), EASE.back);
      }
      if (wx.kind === 'rain' && !u.puddle) {
        const p = dot(at.size * 0.95, 5, 'rgba(127, 168, 201, .33)');
        p.style.opacity = 0; u.puddle = p; fxLayer.prepend(p);
        anim(p, { opacity: [0, 1] }, 1800, 500, 'linear');
      }
      umbPlace(u, at);
      if (wx.kind === 'rain' && shown && rnd(2) === 0) {
        const ux = parseFloat(u.el.style.left) + rnd(Math.floor(u.wd)), uy = parseFloat(u.el.style.top) + 2;
        fxGo(dot(2, 2, '#C8DAF0'), ux, uy, rnd(-7, 8), -5, 260, 0);
      }
    }
    if (!floorY) return;
    const a = area(), wd = Math.floor(a.width), top = a.top - FX_ROOM;
    if (wx.kind === 'rain') {
      for (let i = 0; i < 7; i++) {
        const y0 = top + rnd(30);
        const ln = svg('svg', { width: 4, height: 10, viewBox: '-3 0 4 10' });
        ln.append(svg('line', { x1: 0, y1: 0, x2: -2, y2: 9, stroke: 'rgba(180, 200, 232, .6)', 'stroke-width': 1.2 }));
        fxGo(ln, a.left + rnd(wd + 20), y0, -12, floorY - y0 - 6, 520 + rnd(160), rnd(200));
      }
    } else if (wx.kind === 'snow') {
      for (let i = 0; i < 2; i++) {
        const y0 = top + rnd(30);
        fxGo(fxText('❄', 9 + rnd(5), '#DDE6F5'), a.left + rnd(wd), y0, rnd(-20, 21), floorY - y0 - 8, 2400 + rnd(800), rnd(200));
      }
    }
  }
  // The weather stops: the umbrellas close (their snow slides off), the puddles dry up.
  function wxEnd(w) {
    w.closing = true;
    for (const u of w.umb.values()) {
      anim(u.top, { transform: ['scaleX(1)', 'scaleX(.1)'] }, 300);
      anim(u.el, { opacity: [1, 0] }, 250, 250, 'linear');
      if (u.piling) { anim(u.pile, { transform: ['translateY(0)', 'translateY(16px)'], opacity: [1, 0] }, 320); }
      if (u.puddle) anim(u.puddle, { opacity: [1, 0] }, 600, 0, 'linear');
    }
    after(700, () => {
      for (const u of w.umb.values()) { u.el.remove(); u.puddle?.remove(); }
      if (wx === w) wx = null;
    });
  }

  // ── 💃 /춤: a little stage comes up over the row ──
  // The dancer's stand-in hops onto it, dances for a few seconds and hops back while the pet in
  // the row waits out of sight. Whoever dances while the stage is up joins in beside them, and the
  // more there are, the more notes fly.
  function stageDraw() {
    const sg = stage;
    sg.el.replaceChildren();
    const wd = 24 + Math.max(1, sg.dancers.length) * sg.unit, left = sg.cx - wd / 2;
    for (const side of [-1, 1]) {
      const lx = sg.cx + side * (wd / 2 + 8), ly = sg.y - sg.unit * 1.7;
      sg.el.append(beam(side < 0 ? 'rgba(255, 232, 163, .13)' : 'rgba(126, 224, 200, .13)', [[lx, ly], [sg.cx - (side * wd) / 4, sg.y], [sg.cx + (side * wd) / 2, sg.y]]));
      const bulb = dot(7, 7, side < 0 ? '#FFE8A3' : '#7EE0C8'); bulb.style.left = `${lx - 3.5}px`; bulb.style.top = `${ly - 3.5}px`; sg.el.append(bulb);
    }
    const board = el('div', 'fx-board'); board.style.width = `${wd}px`; board.style.left = `${left}px`; board.style.top = `${sg.y}px`;
    board.style.background = '#3B355A'; board.style.borderColor = '#5E5486';
    sg.el.append(board);
  }
  // A light's beam: a triangle in page coordinates, drawn in an svg that covers the window.
  function beam(fill, pts) {
    const s = svg('svg', { width: window.innerWidth, height: window.innerHeight }); s.style.left = 0; s.style.top = 0;
    s.append(svg('polygon', { fill, points: pts.map((p) => p.join(',')).join(' ') }));
    return s;
  }
  // A dancer's stand-in: pos (the hop) > bob > rot > the sprite that flips, each turning about its feet.
  function standIn(m, at) {
    const pos = el('div', 'fx-dancer'), bob = el('div'), rot = el('div'), img = spriteEl(m.kind, at.size);
    for (const d of [pos, bob, rot]) { d.style.width = d.style.height = `${at.size}px`; d.style.transformOrigin = '50% 100%'; }
    pos.append(bob); bob.append(rot); rot.append(img);
    fxAdd(pos, at.x - at.size / 2, at.foot - at.size);
    return { pos, bob, rot, img };
  }
  function dance(key, at) {
    const m = S.members.get(key);
    if (!m) return;
    if (stage?.ending) { after(900, () => play('dance', key)); return; }
    const later = Date.now() + 3200;
    if (stage && stage.dancers.some((d) => d.key === key)) { if (later > stage.until) stage.until = later; return; }
    if (!stage) {
      const ref = fxAt(''), unit = Math.max(30, at.size) + 8;
      const box = el('div', 'fx-stage'); fxLayer.prepend(box);
      stage = { el: box, cx: clamp(unit * 1.5, window.innerWidth - unit * 1.5, at.x), y: ref.y - 32, unit, dancers: [], until: Date.now() + DANCE_MS, ending: false };
      anim(box, { opacity: [0, 1] }, 250, 0, 'linear');
    } else if (later > stage.until) stage.until = later;
    const sg = stage;
    const off = [0, -1, 1, -2, 2, -3, 3][Math.min(sg.dancers.length, 6)];
    const d = { key, ...standIn(m, at), kind: m.kind, size: at.size, dx: sg.cx + off * sg.unit - at.x, dy: sg.y - at.foot, cx: sg.cx + off * sg.unit, at: Date.now(), grooving: false, spun: false, flip: 1, anims: [] };
    sg.dancers.push(d); stageDraw();
    m.img.style.visibility = 'hidden';
    anim(d.pos, { transform: ['translate(0, 0)', `translate(${d.dx}px, ${d.dy}px)`] }, 500, 0, EASE.back);
    after(520, () => { if (!stage || stage.ending) return; groove(d); });
  }
  function groove(d) {
    d.anims.push(d.rot.animate({ transform: ['rotate(-14deg)', 'rotate(14deg)'] }, { duration: 300, direction: 'alternate', iterations: Infinity }));
    d.anims.push(d.bob.animate({ transform: ['translateY(0)', 'translateY(-7px)'] }, { duration: 150, direction: 'alternate', iterations: Infinity }));
    d.grooving = true;
  }
  function stopGroove(d) { for (const a of d.anims) a.cancel(); d.anims = []; d.grooving = false; }
  // Every animation tick (0.2 s) while the stage is up: steps, turns, one spin each, the notes.
  function fxTick() {
    const sg = stage;
    if (!sg) return;
    const now = Date.now();
    for (const d of sg.dancers) {
      const hm = S.members.get(d.key); if (hm && !sg.ending) hm.img.style.visibility = 'hidden';
      setFrame(d.img, [0, 1, 3, 1][S.tick % 4]);
      if (sg.ending) continue;
      if (d.grooving && S.tick % 2 === 0) { d.flip = -d.flip; d.img.style.transform = `scaleX(${d.flip})`; }
      if (d.grooving && !d.spun && now - d.at > 2000) {
        d.spun = true; stopGroove(d); d.flip = 1; d.img.style.transform = '';
        anim(d.rot, { transform: ['rotate(0deg)', 'rotate(360deg)'] }, 500);
        after(520, () => { if (stage && !stage.ending) { d.rot.getAnimations().forEach((a) => a.cancel()); groove(d); } });
      }
      if (rnd(3) === 0) fxGo(fxText(pick(['♪', '♫']), 13, pick(FX_COLORS)), d.cx - 5 + rnd(-12, 13), sg.y - d.size - 12, rnd(-12, 13), -45, 1200, 0);
    }
    if (!sg.ending && sg.dancers.length > 1) {
      for (let i = 1; i < sg.dancers.length; i++) if (rnd(2) === 0) fxGo(fxText(pick(['♪', '♫', '♬']), 12 + rnd(5), pick(FX_COLORS)), sg.cx + rnd(-50, 51), sg.y - sg.unit * 1.6, rnd(-15, 16), -40, 1300, 0);
    }
    if (!sg.ending && now > sg.until) stageDown(sg);
  }
  function stageDown(sg) {
    sg.ending = true;
    for (const d of sg.dancers) {
      stopGroove(d); d.img.style.transform = '';
      anim(d.pos, { transform: [`translate(${d.dx}px, ${d.dy}px)`, 'translate(0, 0)'] }, 450, 0, EASE.backIn);
    }
    anim(sg.el, { opacity: [1, 0] }, 300, 300, 'linear');
    after(470, () => { for (const d of sg.dancers) { d.pos.remove(); const hm = S.members.get(d.key); if (hm) hm.img.style.visibility = ''; } });
    after(650, () => { sg.el.remove(); if (stage === sg) stage = null; });
  }

  // ── 🎣 a catch, and 🏆 one shown off ──
  // A big catch said on the floor leaps out of the water to over whoever caught it, with its name
  // and size, as big as it really is (the card, the width and the leap come from pet-fish.js,
  // which draws the fish).
  function fishShow(key, at, info) {
    if (!info?.id || !Mod.fish) return;
    const wd = Mod.fish.width ? Mod.fish.width(info) : 58;
    const card = Mod.fish.card(info, wd, [`${info.mark || ''} ${info.name} · ${info.size}`.trim()], []);
    const cx = clamp(wd / 2 + 4, window.innerWidth - wd / 2 - 4, at.x);
    Mod.fish.leap(card, at.x - at.size * 0.6, at.foot, cx, Math.max(4, at.y - wd * 0.66 - 30), wd, 3200);
    if (info.rarity === 'legend') burst(cx - 30, at.y - 10, 70, 600);
  }
  // 🏆 자랑하기 (도감 → 자랑하기 or 🎣 낚싯대 자랑): the one showing off hops up onto a golden stage
  // with two warm lights, holds the fish (or the rod, drawn big) up over its head (bobbing,
  // twinkles round it) under a card with its name and size, then hops back down. One show at a
  // time per pet. 🏁 A contest's podium (place 1-3): side by side in the middle, second on the
  // left, first in the middle and highest, third on the right, each step its medal's colour and
  // number. It stands on the top edge of the pets' panels, over the contest's board and the chat,
  // not in front of them, and stays up longer: three of them to look at.
  function brag(key, at, f) {
    const m = S.members.get(key);
    if (!m || !f || (!f.id && f.rod == null) || bragging.has(key) || !Mod.fish) return;
    if (stage && stage.dancers.some((d) => d.key === key)) return;
    bragging.add(key);
    const ref = fxAt(''), unit = Math.max(30, at.size) + 8, wd = unit + 26;
    let cx = clamp(wd, window.innerWidth - wd, at.x), sy = ref.y - 30;
    const place = f.place | 0;
    let rise = 0, col = { top: '#C9A227', edge: '#8C6A1E', light: '#FFD666', beam: 'rgba(255, 214, 102, .2)' };
    if (place) {
      const a = area(), gap = Math.min(wd + 34, (window.innerWidth - 8) / 3);
      cx = clamp(wd / 2 + 4, window.innerWidth - wd / 2 - 4, a.left + a.width / 2 + [0, 0, -1, 1][place] * gap);
      rise = [0, 30, 16, 6][place];
      sy = Math.min(sy, a.top - 8) - rise;
      if (place === 2) col = { top: '#AEB8C2', edge: '#6E7A86', light: '#E3E8EE', beam: 'rgba(227, 232, 238, .2)' };
      if (place === 3) col = { top: '#C07A3E', edge: '#7E4E26', light: '#F0B07A', beam: 'rgba(240, 176, 122, .2)' };
    }
    const box = el('div', 'fx-stage'); fxLayer.prepend(box);
    for (const side of [-1, 1]) {
      const lx = cx + side * (wd / 2 + 8), ly = sy - unit * 1.7;
      box.append(beam(col.beam, [[lx, ly], [cx - (side * wd) / 4, sy], [cx + (side * wd) / 2, sy]]));
      const bulb = dot(7, 7, col.light); bulb.style.left = `${lx - 3.5}px`; bulb.style.top = `${ly - 3.5}px`; box.append(bulb);
    }
    const board = el('div', 'fx-board'); board.style.width = `${wd}px`; board.style.left = `${cx - wd / 2}px`; board.style.top = `${sy}px`;
    board.style.background = col.top; board.style.borderColor = col.edge;
    if (place) {
      board.style.height = `${8 + rise}px`; board.style.borderRadius = '3px';
      board.style.display = 'flex'; board.style.alignItems = 'center'; board.style.justifyContent = 'center';
      board.append(fxText(`${place}`, 12, '#FFFFFF'));
    }
    box.append(board);
    anim(box, { opacity: [0, 1] }, 250, 0, 'linear');
    // The pet hops up onto the stage (a copy, while the one in the row steps aside).
    const img = spriteEl(m.kind, at.size);
    fxAdd(img, at.x - at.size / 2, at.foot - at.size);
    m.img.style.visibility = 'hidden';
    const dx = cx - at.x, dy = sy - at.foot;
    anim(img, { transform: ['translate(0, 0)', `translate(${dx}px, ${dy}px)`] }, 450, 0, EASE.back);
    // The fish (or the rod) up over the head with its card, once the pet stands on the stage.
    let fw = place ? 48 : f.rarity === 'legend' ? 76 : f.rarity === 'epic' ? 66 : 58;
    const news = f.record ? [['층 최대어', '#F2C14E', '#2A2000']] : [];
    const head = place ? `${['', '🥇', '🥈', '🥉'][place]} ${place}등` : '🏆';
    let card;
    if (f.rod != null && Mod.fish.rodCard) { const rc = Mod.fish.rodCard(f); card = rc.el; fw = rc.w; }
    else card = Mod.fish.card(f, fw, [`${head} ${f.mark ? `${f.mark} ` : ''}${f.name}`, `${f.size || ''}`], news);
    card.style.opacity = 0; card.style.visibility = 'hidden';
    // On the podium the winner's card stays in front of its neighbours' where they overlap.
    if (place === 1) card.style.zIndex = 1;
    fxLayer.append(card);
    const cw = Math.max(fw, card.offsetWidth), ch = card.offsetHeight;
    const top = Math.max(2, sy - at.size - ch - 2);
    card.style.left = `${Math.max(4, Math.min(window.innerWidth - cw - 4, cx - cw / 2))}px`; card.style.top = `${top}px`; card.style.visibility = '';
    let bob = null;
    after(450, () => {
      anim(card, { opacity: [0, 1] }, 250, 0, 'linear');
      bob = card.animate({ transform: ['translateY(0)', 'translateY(-4px)'] }, { duration: 420, direction: 'alternate', iterations: Infinity });
      for (let i = 0; i < 6; i++) fxGo(fxText('✨', 11 + rnd(5), '#FFD666'), cx - 30 + rnd(60), top + 10 + rnd(20), rnd(-14, 15), -24 - rnd(16), 1100, i * 420);
    });
    // Then down again: the card goes, the pet hops back to its place, the stage fades.
    const hold = place ? 7000 : BRAG_MS;
    after(hold, () => {
      anim(card, { opacity: [1, 0] }, 250, 0, 'linear');
      anim(img, { transform: [`translate(${dx}px, ${dy}px)`, 'translate(0, 0)'] }, 450, 150, EASE.backIn);
      anim(box, { opacity: [1, 0] }, 300, 450, 'linear');
    });
    after(hold + 650, () => {
      bob?.cancel(); card.remove(); img.remove(); box.remove();
      m.img.style.visibility = ''; bragging.delete(key);
    });
  }

  // ── 💨 날리기: someone runs up and sends them flying ──
  // A kick or a toy hammer (the hub picks, turn and turn about); 💥 on impact, and the one hit spins off
  // in an arc, smaller and smaller, trailing sparkles, until a last twinkle. The row drops them
  // quietly afterwards — no: they land back a moment later, since it was only for fun. On their own
  // screen it is their pet that flies, and a word says who did it.
  // A toy squeaky hammer (뿅망치), drawn in pixels: a fat yellow head with red stripes on a thin stick.
  // Held by the end of the stick; it turns about it.
  function hammerEl(len) {
    const s = svg('svg', { width: Math.round(len * 0.5), height: Math.round(len), viewBox: '0 0 16 32', 'shape-rendering': 'crispEdges' });
    const px = (x, y, w, h, fill) => s.append(svg('rect', { x, y, width: w, height: h, fill }));
    px(0, 1, 16, 10, '#3B2B2B'); px(1, 0, 14, 12, '#3B2B2B');
    px(1, 1, 14, 10, '#F6D365'); px(2, 2, 12, 2, '#FFF1B8');
    for (const x of [2, 7, 12]) px(x, 1, 2, 10, '#E05A47');
    px(6, 12, 4, 20, '#3B2B2B'); px(7, 12, 2, 19, '#D9A66C'); px(7, 12, 1, 19, '#F0C994');
    s.classList.add('fx-bat');
    s.style.transformOrigin = '50% 97%';
    return s;
  }
  // A kick sends them off in an arc; a bat, higher and farther, spinning faster, with a louder twinkle.
  function flyAway(m, at, dir, { back = false, far = false } = {}) {
    const flyer = spriteEl(m.kind, at.size);
    fxAdd(flyer, at.x - at.size / 2, at.foot - at.size);
    m.img.style.visibility = 'hidden';
    const ms = far ? 1600 : 1400;
    const dx = dir * ((far ? 420 : 260) + rnd(80)), dy = -((far ? 380 : 220) + rnd(80));
    anim(flyer, { transform: ['translate(0, 0) rotate(0deg) scale(1)', `translate(${dx}px, ${dy}px) rotate(${dir * (far ? 1440 : 900)}deg) scale(.04)`] }, ms, 0, EASE.quadOut);
    anim(flyer, { opacity: [1, 1, 0] }, ms, 0, 'linear');
    const trail = setInterval(() => {
      const r = flyer.getBoundingClientRect();
      fxGo(fxText('✨', 9 + rnd(6), pick(['#FFD666', '#FFF4D6', '#7EE0C8'])), r.left + r.width / 2 + rnd(-8, 9), r.top + r.height / 2 + rnd(-8, 9), rnd(-10, 11), -8 - rnd(12), 500, 0);
    }, far ? 60 : 80);
    after(ms - 150, () => clearInterval(trail));
    after(ms - 50, () => { const tw = fxText('✦', far ? 22 : 16, '#FFF4D6'); tw.style.opacity = 0; fxAdd(tw, at.x + dx - 8, at.foot - at.size + dy - 8); anim(tw, { opacity: [0, 1, 0], transform: ['scale(.4)', 'scale(1.4)', 'scale(.2)'] }, 600, 0, 'ease'); after(650, () => tw.remove()); });
    after(ms + 100, () => { flyer.remove(); if (back) { m.img.style.visibility = ''; pop(m.col, 0, 18); } });
  }
  function fling(key, at, data) {
    const kicker = S.members.get(key);
    const mine = !!data?.who && data.who === S.st?.myId;
    const target = mine ? S.members.get('') : S.members.get(`${kicker?.floor || S.floor}|${data?.who}`);
    if (!kicker || !target || target === kicker) return;
    const tat = fxAt(target);
    const dir = tat.x >= at.x ? 1 : -1;
    // The owner's stand-in runs up to them while the one on the row waits out of sight.
    const runner = spriteEl(kicker.kind, at.size);
    fxAdd(runner, at.x - at.size / 2, at.foot - at.size);
    kicker.img.style.visibility = 'hidden';
    const dx = tat.x - at.x - dir * (tat.size * 0.6 + at.size * 0.4);
    const bat = data?.how === 'hammer';
    const run = runner.animate([{ transform: 'translate(0, 0)' }, { transform: `translate(${dx}px, -6px)` }], { duration: 380, easing: EASE.quadIn, fill: 'forwards' });
    let frame = 0;
    const steps = setInterval(() => setFrame(runner, [0, 1][frame++ % 2]), 90);
    // The hammer appears only for the swing itself, level in the hand with its head behind. The
    // swing is sideways, round the hand (rotateY): laid flat first, then turned about the upright
    // axis through the hand.
    let club = null;
    const len = Math.round(at.size * 1.0);
    const level = (y) => `perspective(300px) rotateY(${y}deg) rotate(${dir * 90}deg)`;
    after(400, () => {
      clearInterval(steps); setFrame(runner, 3);
      if (bat) {
        club = hammerEl(len);
        const r0 = runner.getBoundingClientRect();
        club.style.left = `${r0.left + r0.width / 2 + dir * r0.width * 0.15 - Math.round(len * 0.5) / 2}px`; club.style.top = `${r0.top + r0.height * 0.5 - len * 0.97}px`;
        fxLayer.append(club);
        // The wind-up and the swing: a twist back, then the hammer comes round sideways through them.
        runner.animate([{ transform: `translate(${dx}px, -6px) rotate(0deg)` }, { transform: `translate(${dx - dir * 4}px, -6px) rotate(${-dir * 10}deg)` }, { transform: `translate(${dx + dir * 6}px, -6px) rotate(${dir * 16}deg)` }, { transform: `translate(${dx}px, -6px) rotate(0deg)` }], { duration: 420, fill: 'forwards' });
        club.animate([{ transform: level(180) }, { transform: level(215), offset: 0.3 }, { transform: level(0), offset: 0.7 }, { transform: level(0) }], { duration: 420, easing: 'ease-in', fill: 'forwards' });
        // The swoosh: a thin arc at hand height, from behind the hand round to the front.
        after(130, () => {
          const r = runner.getBoundingClientRect(), hx = r.left + r.width / 2 + dir * r.width * 0.15, hy = r.top + r.height * 0.5;
          const sw = svg('svg', { width: len * 2 + 20, height: 30, viewBox: `0 0 ${len * 2 + 20} 30` });
          sw.append(svg('path', { d: `M ${len + 10 - dir * len} 15 A ${len} 11 0 0 ${dir > 0 ? 0 : 1} ${len + 10 + dir * len} 15`, fill: 'none', stroke: 'rgba(255, 244, 214, .85)', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-dasharray': `${len * 3.3}`, 'stroke-dashoffset': `${len * 3.3}` }));
          sw.style.opacity = 0; fxAdd(sw, hx - len - 10, hy - 15);
          sw.firstChild.animate([{ strokeDashoffset: len * 3.3 }, { strokeDashoffset: 0 }], { duration: 170, easing: 'ease-in', fill: 'forwards' });
          anim(sw, { opacity: [1, 1, 0] }, 320, 0, 'linear');
          after(340, () => sw.remove());
        });
        after(270, () => fxGo(fxText('뿅!', 15, '#FF8FA3'), tat.x + dir * 10, tat.y - 26, dir * 18, -22, 600, 0));
      } else {
        // The kick: a lean back, then the foot flies in.
        runner.animate([{ transform: `translate(${dx}px, -6px) rotate(0deg)` }, { transform: `translate(${dx - dir * 6}px, -6px) rotate(${-dir * 12}deg)` }, { transform: `translate(${dx + dir * 10}px, -8px) rotate(${dir * 28}deg)` }, { transform: `translate(${dx}px, -6px) rotate(0deg)` }], { duration: 300, fill: 'forwards' });
      }
      after(bat ? 280 : 150, () => {
        const bang = fxText('💥', bat ? 32 : 24, '#FFD666'); bang.style.opacity = 0;
        fxAdd(bang, tat.x - (bat ? 16 : 12), tat.y - 6);
        anim(bang, { opacity: [0, 1, 1, 0], transform: ['scale(.4)', 'scale(1.3)', 'scale(1)', 'scale(1.2)'] }, 500, 0, 'ease');
        after(520, () => bang.remove());
        flyAway(target, tat, dir, { far: bat, back: true });
        if (mine) after(bat ? 1900 : 1700, () => { flinch(); say(target, '💨', `${kicker.name} 님이 나를 날려 버렸어요!`, 6); });
      });
    });
    // Back to their place.
    after(1200, () => { run.cancel(); club?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }); runner.animate([{ transform: `translate(${dx}px, -6px)` }, { transform: 'translate(0, 0)' }], { duration: 380, easing: EASE.quadOut, fill: 'forwards' }); });
    after(1600, () => { runner.remove(); club?.remove(); kicker.img.style.visibility = ''; });
  }
  // ── 🤧 Someone leaves: the rest see them off ──
  // Each one still on the row (me too), one after another: a handkerchief comes up out of the
  // pocket to the eyes, the head tilts to it and dabs three times with the eyes shut, a tear or two
  // drops from the other eye, and the handkerchief goes back. The cloth sits inside the sprite, so
  // it leans and bobs with the body.
  function hankyEl(size) {
    const s = svg('svg', { width: size, height: size, viewBox: '0 0 8 8', 'shape-rendering': 'crispEdges' });
    const px = (x, y, w, h, fill) => s.append(svg('rect', { x, y, width: w, height: h, fill }));
    px(0, 1, 8, 6, '#CFC9E6'); px(1, 0, 6, 8, '#CFC9E6'); px(1, 1, 6, 6, '#FFFFFF'); px(1, 1, 6, 1, '#F4F2FA'); px(2, 2, 1, 1, '#F2B5B5'); px(5, 5, 1, 1, '#F2B5B5'); px(5, 2, 1, 1, '#9FE6CF'); px(3, 6, 2, 1, '#E6E1F3');
    return s;
  }
  function cry(m) {
    const size = m.size;
    m.crying = Date.now() + 2700;
    const hk = hankyEl(Math.round(size * 0.36));
    hk.style.position = 'absolute'; hk.style.left = `${size * 0.5}px`; hk.style.top = `${size * 0.6}px`; hk.style.opacity = 0; hk.style.transformOrigin = '50% 100%';
    m.img.append(hk);
    const up = `translateY(${-size * 0.28}px)`;
    // Out of the pocket, up to the eye.
    hk.animate([{ opacity: 0, transform: 'translateY(0) scale(.3)' }, { opacity: 1, transform: `${up} scale(1)` }], { duration: 300, easing: EASE.quadOut, fill: 'forwards' });
    after(300, () => {
      // The head tilts to the cloth and dabs, three times; the cloth presses in with it.
      m.img.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(8deg) translateY(1px)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(8deg) translateY(1px)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(8deg) translateY(1px)' }, { transform: 'rotate(0deg)' }], { duration: 1800, fill: 'forwards' });
      hk.animate([{ transform: `${up} scale(1)` }, { transform: `translate(2px, ${-size * 0.28 + 2}px) scale(.88)` }, { transform: `${up} scale(1)` }, { transform: `translate(2px, ${-size * 0.28 + 2}px) scale(.88)` }, { transform: `${up} scale(1)` }, { transform: `translate(2px, ${-size * 0.28 + 2}px) scale(.88)` }, { transform: `${up} scale(1)` }], { duration: 1800, fill: 'forwards' });
      // Tears from the other eye, down the cheek, each a little later.
      for (let i = 0; i < 3; i++) {
        const t = el('div', 'fxdot'); t.style.position = 'absolute'; t.style.width = `${Math.max(2, size * 0.07)}px`; t.style.height = `${Math.max(3, size * 0.1)}px`; t.style.background = '#7FB8E8';
        t.style.left = `${size * 0.22}px`; t.style.top = `${size * 0.42}px`; t.style.opacity = 0;
        m.img.append(t);
        t.animate([{ opacity: 0, transform: 'translateY(0)' }, { opacity: 1, transform: `translateY(${size * 0.08}px)`, offset: 0.2 }, { opacity: 1, transform: `translateY(${size * 0.45}px)`, offset: 0.85 }, { opacity: 0, transform: `translateY(${size * 0.55}px)` }], { duration: 650, delay: 200 + i * 550, easing: EASE.quadIn, fill: 'forwards' });
        after(900 + i * 550, () => t.remove());
      }
    });
    // Back into the pocket.
    after(2150, () => hk.animate([{ opacity: 1, transform: `${up} scale(1)` }, { opacity: 0, transform: 'translateY(0) scale(.3)' }], { duration: 300, easing: EASE.quadIn, fill: 'forwards' }));
    after(2500, () => { hk.remove(); for (const a of m.img.getAnimations()) a.cancel(); });
  }
  function farewell(gone) {
    let n = 0;
    for (const m of S.members.values()) {
      if (m === gone || m.img.style.visibility === 'hidden' || m.crying > Date.now()) continue;
      after(300 + (n++ % 5) * 260, () => cry(m));
    }
  }

  // ── 🛸 방 이동: the UFO ──
  // A saucer flies in and hovers over my head, its lights going round; a beam comes down over me
  // and I rise into it, small and turning; the beam shuts and it zips away. move() does the move
  // itself while I am aboard. Over my place in the new room it flies in again, the beam sets me down
  // on my feet, its people hop in, and it leaves. Nothing stands beside the others.
  function ufoEl(w) {
    const h = Math.round((w * 20) / 32);
    const u = el('div', 'fx-ufo'); u.style.width = `${w}px`; u.style.height = `${h}px`;
    const wob = el('div', 'wob');
    const s = svg('svg', { width: w, height: h, viewBox: '0 0 32 20', 'shape-rendering': 'crispEdges' });
    const px = (x, y, w2, h2, fill) => { const r = svg('rect', { x, y, width: w2, height: h2, fill }); s.append(r); return r; };
    // A pink antenna light, a round glass dome with a small green pilot peeking out, a pastel saucer.
    px(15, 0, 2, 2, '#FF8FB1').animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 800, iterations: Infinity });
    px(15, 2, 2, 1, '#8A76DD');
    px(13, 3, 6, 1, '#CFF6FF'); px(11, 4, 10, 1, '#CFF6FF'); px(10, 5, 12, 3, '#CFF6FF'); px(12, 4, 2, 1, '#FFFFFF'); px(11, 5, 1, 2, '#FFFFFF');
    px(13, 5, 6, 3, '#8BE38B'); px(14, 6, 1, 1, '#1E1B2E'); px(17, 6, 1, 1, '#1E1B2E'); px(13, 7, 1, 1, '#FFB3C7'); px(18, 7, 1, 1, '#FFB3C7');
    px(6, 8, 20, 1, '#C9B8FF'); px(2, 9, 28, 1, '#B4A1FF'); px(1, 10, 30, 1, '#A08CF0'); px(2, 11, 28, 1, '#8A76DD'); px(6, 12, 20, 1, '#6F5CC4'); px(11, 13, 10, 1, '#5A49A8');
    // The lights round the rim, each lit in turn.
    ['#FF8FB1', '#FFE08A', '#9FF5D9', '#FFFFFF', '#FF8FB1'].forEach((c, i) => {
      px(4 + i * 6, 10, 2, 1, c).animate([{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }], { duration: 600, delay: i * 120, iterations: Infinity });
    });
    px(14, 13, 4, 1, '#9FF5D9');
    const beam = el('div', 'beam');
    wob.append(s, beam); u.append(wob);
    // A bob and a little tilt, like it is having a look round.
    wob.animate([{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-3px) rotate(2.5deg)' }, { transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-3px) rotate(-2.5deg)' }, { transform: 'translateY(0) rotate(0deg)' }], { duration: 1800, iterations: Infinity, easing: 'ease-in-out' });
    return { el: u, w, h, beam };
  }
  async function ufo(from, move) {
    const me = S.members.get(''), at = fxAt(me);
    if (!at) return move();
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    // Over a spot: the saucer hovers a little above the head; the beam reaches the ground.
    const hover = (a) => {
      const u = ufoEl(Math.round(a.size * 1.7));
      const top = a.y - a.size * 0.55 - u.h, bottom = top + u.h * 0.68;
      fxAdd(u.el, a.x - u.w / 2, top);
      u.beam.style.top = `${u.h * 0.68}px`; u.beam.style.height = `${a.foot + 2 - bottom}px`;
      u.beam.style.left = `${u.w * 0.3}px`; u.beam.style.width = `${u.w * 0.4}px`;
      u.beam.style.transform = 'scaleY(0)';
      return { ...u, bottom };
    };
    const fly = (u, dx, dy, inward) => u.el.animate(inward
      ? [{ transform: `translate(${dx}px, ${dy}px) scale(.5)`, opacity: 0 }, { transform: 'translate(0, 0) scale(1)', opacity: 1 }]
      : [{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.4)`, opacity: 0 }],
    { duration: inward ? 650 : 500, easing: inward ? EASE.quadOut : EASE.quadIn, fill: 'forwards' });
    const beam = (u, on) => u.beam.animate([{ transform: `scaleY(${on ? 0 : 1})` }, { transform: `scaleY(${on ? 1 : 0})` }], { duration: 220, easing: 'ease-out', fill: 'forwards' });
    const glitter = (a, up) => { for (let i = 0; i < 8; i++) fxGo(dot(2, 2, pick(['#7EE0C8', '#FFFFFF', '#BFEFFF'])), a.x - a.size * 0.3 + rnd(a.size * 0.6), up ? a.foot - rnd(10) : a.foot - a.size * 1.2, 0, up ? -a.size * 1.1 : a.size * 1.1, 450, rnd(200), EASE.quadIn); };
    // In from above on one side, hovering over me; the beam comes down.
    const u1 = hover(at);
    fly(u1, -260, -220, true);
    await wait(700);
    beam(u1, true);
    await wait(260);
    // Up I go, sucked in: a little crouch, then I stretch thin and shoot up into the saucer in one
    // go, with a glitter in the beam.
    glitter(at, true);
    const lift = at.foot - u1.bottom;
    me.img.animate([{ transform: 'translateY(0) scale(1, 1)' }, { transform: 'translateY(3px) scale(1.15, .85)', offset: 0.25 }, { transform: `translateY(${-lift * 0.35}px) scale(.55, 1.6)`, offset: 0.6 }, { transform: `translateY(${-lift}px) scale(.12, 1.2)`, opacity: 0.4 }], { duration: 480, easing: 'cubic-bezier(.5, 0, .9, .4)', fill: 'forwards' });
    anim(me.nm, { opacity: [1, 0] }, 200);
    await wait(480);
    me.img.style.visibility = 'hidden';
    for (const a of me.img.getAnimations()) a.cancel();
    // The beam shuts and the saucer zips away, up and off the other side.
    beam(u1, false);
    await wait(240);
    fly(u1, 260, -260, false);
    let failed = null, to = '';
    const moving = move().then((name) => { to = name || ''; }).catch((e) => { failed = e; });
    await wait(520);
    u1.el.remove();
    await moving;
    await wait(150);
    // Over my place in the new room: in it comes, the beam sets me down, its people hop in.
    const me2 = S.members.get('') || me, at2 = fxAt(me2) || at;
    const u2 = hover(at2);
    fly(u2, -260, -220, true);
    await wait(700);
    beam(u2, true);
    await wait(260);
    glitter(at2, false);
    const drop = at2.foot - u2.bottom;
    me2.img.style.visibility = ''; me2.nm.style.opacity = '';
    // Down in one go, thin in the beam, squashed flat as I land, then back into shape.
    me2.img.animate([{ transform: `translateY(${-drop}px) scale(.12, 1.2)`, opacity: 0.4 }, { transform: `translateY(${-drop * 0.4}px) scale(.55, 1.6)`, opacity: 1, offset: 0.45 }, { transform: 'translateY(0) scale(1.25, .7)', offset: 0.7 }, { transform: 'translateY(0) scale(.92, 1.1)', offset: 0.85 }, { transform: 'translateY(0) scale(1, 1)' }], { duration: 560, easing: 'linear', fill: 'forwards' });
    anim(me2.nm, { opacity: [0, 1] }, 250, 350);
    await wait(560);
    for (const a of me2.img.getAnimations()) a.cancel();
    let d = 0;
    for (const m of S.quietNew || []) { m.col.style.visibility = ''; pop(m.col, d); d += 90; }
    S.quietNew = [];
    if (failed) say(me2, '🛸', `⚠ ${failed.message}`, 6); else say(me2, '🛸', `'${to}' 방으로 이동했어요`, 5);
    beam(u2, false);
    await wait(260);
    fly(u2, 260, -260, false);
    await wait(520);
    u2.el.remove();
  }

  // Everything put away (the pets are hidden): the dancers back, the weather gone.
  function stop() {
    if (stage) { for (const d of stage.dancers) { const hm = S.members.get(d.key); if (hm) hm.img.style.visibility = ''; d.pos.remove(); } stage.el.remove(); stage = null; }
    if (wx) { for (const u of wx.umb.values()) { u.el.remove(); u.puddle?.remove(); } wx = null; }
  }

  Mod.fx = { play, tick: () => { fxTick(); wxTick(); }, stop, burst, farewell, ufo };
})();
