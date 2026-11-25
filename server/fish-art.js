// 🎣 What each catch looks like: a list of shapes in a 120 × 80 box, head to the left. Each shape
// is SVG path data (the pet's WPF Geometry.Parse and the page's Path2D read the same text) with
// its fill, outline, see-through level and, for patterns and bellies, the body it is cut to.
// The hub sends these, so the pet and the page draw every fish alike from one place.
//   part: { d, fill?, stroke?, w?, op?, clip? }
const r1 = (n) => Math.round(n * 10) / 10;
const P = (...xs) => xs.map((x) => (typeof x === 'number' ? r1(x) : x)).join(' ');

export function shade(hex, f) {
  return '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function mix(a, b, t) {
  return '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// A small repeatable random from the fish's id, so its spots sit in the same places everywhere.
function seeded(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

export const ell = (cx, cy, rx, ry) => P('M', cx - rx, cy, 'A', rx, ry, 0, 1, 0, cx + rx, cy, 'A', rx, ry, 0, 1, 0, cx - rx, cy, 'Z');
export const circ = (cx, cy, r) => ell(cx, cy, r, r);
// A smooth closed (or open) line through points: each corner rounded by going through midpoints.
function smooth(pts, closed = true) {
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (!closed) {
    let d = P('M', pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) { const m = mid(pts[i], pts[i + 1]); d += ' ' + P('Q', pts[i][0], pts[i][1], m[0], m[1]); }
    const z = pts[pts.length - 1];
    return d + ' ' + P('L', z[0], z[1]);
  }
  const n = pts.length;
  const m0 = mid(pts[n - 1], pts[0]);
  let d = P('M', m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); d += ' ' + P('Q', pts[i][0], pts[i][1], m[0], m[1]); }
  return d + ' Z';
}
const poly = (pts) => P('M', pts[0][0], pts[0][1], ...pts.slice(1).flatMap((p) => ['L', p[0], p[1]]), 'Z');

// A round eye with a shine: big and soft, like the pets.
function eye(x, y, r, iris = '#1E1B2E') {
  return [
    { d: circ(x, y, r), fill: '#FFFFFF', stroke: '#1E1B2E', w: 1 },
    { d: circ(x + r * 0.12, y + r * 0.08, r * 0.62), fill: iris },
    { d: circ(x - r * 0.18, y - r * 0.22, r * 0.24), fill: '#FFFFFF' },
  ];
}
const blush = (x, y, r) => ({ d: ell(x, y, r * 1.3, r * 0.75), fill: '#FF8FA3', op: 0.45 });
// A four-pointed twinkle.
function star(x, y, r, fill = '#FFF3B0') {
  const k = r * 0.28;
  return { d: P('M', x, y - r, 'Q', x + k, y - k, x + r, y, 'Q', x + k, y + k, x, y + r, 'Q', x - k, y + k, x - r, y, 'Q', x - k, y - k, x, y - r, 'Z'), fill };
}
function sparkles(seed, n = 4, fill = '#FFF3B0') {
  const rnd = seeded(seed + ':sp');
  const spots = [[10, 12], [104, 14], [100, 66], [16, 64], [60, 6], [58, 74]];
  return spots.slice(0, n).map(([x, y]) => star(x + (rnd() - 0.5) * 8, y + (rnd() - 0.5) * 6, 3.5 + rnd() * 2.5, fill));
}
function crown(x, y, s = 1) {
  const w = 14 * s, h = 9 * s;
  return [{ d: P('M', x - w / 2, y, 'L', x - w / 2 - 1 * s, y - h, 'L', x - w / 4, y - h * 0.45, 'L', x, y - h * 1.15, 'L', x + w / 4, y - h * 0.45, 'L', x + w / 2 + 1 * s, y - h, 'L', x + w / 2, y, 'Z'), fill: '#FFD34E', stroke: '#B8860B', w: 1 },
    { d: circ(x, y - h * 0.35, 1.6 * s), fill: '#E63946' }];
}

// ── the usual fish ───────────────────────────────────────────────────────────────────────────
// The body's half height along its length (f 0 → nose, 1 → where the tail starts).
function profile(o) {
  const { hump, stem, nose } = o;
  return (f) => (f < hump ? Math.pow(Math.sin((Math.PI / 2) * (f / hump)), nose) : stem + (1 - stem) * Math.cos((Math.PI / 2) * ((f - hump) / (1 - hump))));
}

const FISH_DEFAULTS = { x0: 14, len: 68, tail: 'fork', tailLen: 24, h: 15, hump: 0.36, stem: 0.3, nose: 0.55, belly: 1, cy: 40, dorsal: 'small', anal: 'small', pelvic: true, pectoral: true, eye: 1, gill: true };

export function fish(look, seed) {
  const o = { ...FISH_DEFAULTS, ...look };
  const { x0, len: L, h: H, cy, tailLen: T } = o;
  const x1 = x0 + L;
  const prof = profile(o);
  const dip = o.noseDy ?? 2;
  const topY = (f) => cy + dip * (1 - f) ** 3 - H * prof(f) * (o.back ?? 1);
  const botY = (f) => cy + dip * (1 - f) ** 3 + H * o.belly * prof(f);
  const X = (f) => x0 + L * f;
  const N = 18;
  const top = [], bot = [];
  for (let i = 0; i <= N; i++) { const f = i / N; top.push([X(f), topY(f)]); bot.push([X(f), botY(f)]); }
  // Through the points, starting at the nose: a real point there keeps it sharp or round as asked.
  const outline = [...top, ...bot.slice(1, -1).reverse().map((p) => p)];
  const ring = [...top.slice(0, N + 1), ...[...bot].reverse().slice(0, N)];
  const body = smooth(ring);
  void outline;
  const line = o.line || shade(o.body, 0.55);
  const fin = o.fin || shade(o.body, 0.85);
  const finLine = shade(fin, 0.6);
  const parts = [];
  const finPart = (d, color = fin, op = 0.95) => parts.push({ d, fill: color, stroke: finLine, w: 1.2, op });
  const th = H * o.stem;
  const ty = cy, tx = x1 - 2;

  // Tail, behind everything.
  const tailShape = {
    fork: () => P('M', tx, ty - th, 'C', tx + T * 0.4, ty - th - H * 0.3, tx + T * 0.8, ty - H * 0.95, tx + T, ty - H * 1.08, 'Q', tx + T * 0.5, ty, tx + T, ty + H * 1.08, 'C', tx + T * 0.8, ty + H * 0.95, tx + T * 0.4, ty + th + H * 0.3, tx, ty + th, 'Z'),
    round: () => P('M', tx, ty - th, 'C', tx + T * 0.6, ty - H * 1.0, tx + T * 1.15, ty - H * 0.6, tx + T * 1.1, ty, 'C', tx + T * 1.15, ty + H * 0.6, tx + T * 0.6, ty + H * 1.0, tx, ty + th, 'Z'),
    square: () => P('M', tx, ty - th, 'L', tx + T * 0.85, ty - H * 0.85, 'Q', tx + T * 0.97, ty, tx + T * 0.85, ty + H * 0.85, 'L', tx, ty + th, 'Z'),
    moon: () => P('M', tx, ty - th * 0.7, 'C', tx + T * 0.3, ty - H * 0.5, tx + T * 0.7, ty - H * 1.1, tx + T * 1.05, ty - H * 1.4, 'C', tx + T * 0.55, ty - H * 0.6, tx + T * 0.5, ty + H * 0.6, tx + T * 1.05, ty + H * 1.4, 'C', tx + T * 0.7, ty + H * 1.1, tx + T * 0.3, ty + H * 0.5, tx, ty + th * 0.7, 'Z'),
    fan: () => P('M', tx, ty - th, 'C', tx + T * 0.5, ty - H * 1.7, tx + T * 1.5, ty - H * 1.6, tx + T * 1.35, ty - H * 0.35, 'Q', tx + T * 0.85, ty, tx + T * 1.35, ty + H * 0.35, 'C', tx + T * 1.5, ty + H * 1.6, tx + T * 0.5, ty + H * 1.7, tx, ty + th, 'Z'),
    veil: () => P('M', tx, ty - th, 'C', tx + T * 0.7, ty - H * 1.9, tx + T * 1.8, ty - H * 1.3, tx + T * 1.75, ty, 'C', tx + T * 1.9, ty + H * 1.5, tx + T * 1.0, ty + H * 2.3, tx + T * 0.25, ty + H * 1.7, 'Q', tx + T * 0.05, ty + H * 0.8, tx, ty + th, 'Z'),
    shark: () => P('M', tx, ty - th, 'C', tx + T * 0.4, ty - H * 0.6, tx + T * 0.8, ty - H * 1.3, tx + T * 1.15, ty - H * 1.75, 'C', tx + T * 0.85, ty - H * 0.5, tx + T * 0.75, ty + H * 0.2, tx + T * 0.8, ty + H * 0.95, 'C', tx + T * 0.45, ty + H * 0.65, tx + T * 0.15, ty + th * 1.5, tx, ty + th, 'Z'),
  };
  if (tailShape[o.tail]) {
    finPart(tailShape[o.tail](), o.tailColor || fin);
    // Rays across the tail.
    if (['fork', 'round', 'fan', 'veil', 'square'].includes(o.tail)) {
      const rays = [-0.6, -0.25, 0.25, 0.6].map((k) => P('M', tx + 2, ty + k * th, 'Q', tx + T * 0.55, ty + k * H * 0.9, tx + T * (o.tail === 'fan' || o.tail === 'veil' ? 1.15 : 0.8), ty + k * H * (o.tail === 'veil' ? 1.4 : 1.0))).join(' ');
      parts.push({ d: rays, stroke: finLine, w: 0.8, op: 0.45 });
    }
  }

  // Fins on the back: a small one, a tall one, spines, a sail, a shark's, one all along, a veil.
  const at = (f, dy = 2) => [X(f), topY(f) + dy];
  const dorsal = Array.isArray(o.dorsal) ? o.dorsal : [o.dorsal];
  for (const kind of dorsal) {
    const [a0, a1] = o.dorsalAt || {
      small: [0.38, 0.62], tall: [0.32, 0.62], spiky: [0.26, 0.6], sail: [0.12, 0.72], shark: [0.36, 0.56], long: [0.3, 0.97], veil: [0.34, 0.92], soft: [0.58, 0.8], adipose: [0.84, 0.92], tiny: [0.4, 0.5],
    }[kind] || [0.4, 0.6];
    const [ax, ay] = at(a0), [bx, by] = at(a1);
    const hgt = { small: 0.6, tall: 1.05, spiky: 0.75, sail: 1.75, shark: 1.0, long: 0.42, veil: 1.35, soft: 0.5, adipose: 0.22, tiny: 0.35 }[kind] * H * (o.dorsalK ?? 1);
    const top0 = Math.min(ay, by) - hgt;
    if (kind === 'spiky') {
      const n = 6; const pts = [[ax, ay]];
      for (let i = 0; i <= n; i++) { const f = a0 + ((a1 - a0) * i) / n; const [x, y] = at(f, 1); pts.push([x + 1.5, y - hgt * (1 - 0.35 * (i / n))]); if (i < n) { const g = a0 + ((a1 - a0) * (i + 0.5)) / n; const [x2, y2] = at(g, 1); pts.push([x2 + 1, y2 - hgt * 0.45]); } }
      pts.push([bx, by]);
      finPart(poly(pts));
    } else if (kind === 'sail') {
      finPart(P('M', ax, ay, 'C', ax + 2, top0 + 4, ax + (bx - ax) * 0.25, top0, ax + (bx - ax) * 0.5, top0 + hgt * 0.1, 'C', ax + (bx - ax) * 0.8, top0 + hgt * 0.25, bx - 2, by - hgt * 0.35, bx, by, 'Z'));
      parts.push({ d: [0.2, 0.4, 0.6, 0.8].map((k) => { const x = ax + (bx - ax) * k; return P('M', x, topY(a0 + (a1 - a0) * k) + 1, 'L', x + 2, top0 + hgt * (0.12 + k * 0.2)); }).join(' '), stroke: finLine, w: 0.8, op: 0.5 });
    } else if (kind === 'long' || kind === 'veil') {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const f = a0 + ((a1 - a0) * i) / 8; const [x, y] = at(f, 0); const k = kind === 'veil' ? Math.sin((Math.PI * i) / 8) * 0.6 + (i / 8) * 0.6 : Math.sin((Math.PI * Math.min(i, 7)) / 7) * 0.5 + 0.5; pts.push([x + (kind === 'veil' ? i * 1.2 : 0), y - hgt * k]); }
      finPart(P('M', ax, ay + 2, ...pts.flatMap((p, i) => (i ? ['L', p[0], p[1]] : ['L', p[0], p[1]])), 'L', bx, by + 2, 'Z'));
    } else {
      // small, tall, shark, soft, adipose, tiny: a swept-back curve.
      const back = kind === 'shark' ? 0.2 : 0.1;
      finPart(P('M', ax, ay, 'C', ax + (bx - ax) * 0.3, top0 + hgt * 0.15, ax + (bx - ax) * (0.55 + back), top0 - hgt * 0.05, bx + (kind === 'shark' ? 3 : 1), top0, 'C', bx - (bx - ax) * 0.1, top0 + hgt * 0.45, bx, by - hgt * 0.15, bx, by, 'Z'));
    }
  }

  // Fins underneath.
  const under = (f0, f1, k, swept = 0.15) => {
    const ax = X(f0), ay = botY(f0) - 2, bx = X(f1), by = botY(f1) - 2;
    const lo = Math.max(ay, by) + H * k;
    return P('M', ax, ay, 'C', ax + (bx - ax) * 0.3, lo - H * k * 0.1, ax + (bx - ax) * (0.6 + swept), lo + H * k * 0.05, bx + 1, lo, 'C', bx - 1, lo - H * k * 0.4, bx, by + H * k * 0.2, bx, by, 'Z');
  };
  if (o.anal === 'veil') {
    const ax = X(0.5), ay = botY(0.5) - 2, bx = X(0.95), by = botY(0.95) - 2;
    finPart(P('M', ax, ay, 'C', ax + 4, ay + H * 1.2, ax + (bx - ax) * 0.6, ay + H * 1.6, bx + 6, by + H * 1.3, 'Q', bx + 2, by + H * 0.5, bx, by, 'Z'));
  } else if (o.anal === 'long') {
    const pts = []; for (let i = 0; i <= 8; i++) { const f = 0.45 + (0.52 * i) / 8; pts.push([X(f), botY(f) + H * 0.32 * Math.sin((Math.PI * Math.min(i, 7)) / 7)]); }
    finPart(P('M', X(0.45), botY(0.45) - 2, ...pts.flatMap((p) => ['L', p[0], p[1]]), 'L', X(0.97), botY(0.97) - 2, 'Z'));
  } else if (o.anal === 'shark') {
    finPart(under(0.72, 0.82, 0.32, 0.25));
  } else if (o.anal) {
    finPart(under(0.66, 0.84, 0.42));
  }
  if (o.pelvic) finPart(under(0.36, 0.48, o.pelvic === 'big' ? 0.65 : 0.38));

  // The body, its back and belly, its pattern, then its outline on top.
  parts.push({ d: body, fill: o.body });
  if (o.backColor) parts.push({ d: P('M', x0 - 4, cy - H - 6, 'H', x1 + 4, 'V', cy - H * (o.backTo ?? 0.15), 'Q', X(0.5), cy - H * ((o.backTo ?? 0.15) - 0.15), x0 - 4, cy - H * ((o.backTo ?? 0.15) - 0.3), 'Z'), fill: o.backColor, clip: body });
  if (o.bellyColor) parts.push({ d: P('M', x0 - 4, cy + H * 0.25, 'Q', X(0.5), cy + H * 0.05, x1 + 4, cy + H * 0.2, 'V', cy + H * 2, 'H', x0 - 4, 'Z'), fill: o.bellyColor, clip: body });
  if (o.headColor) parts.push({ d: P('M', x0 - 4, cy - H * 2, 'H', X(o.headTo ?? 0.28), 'Q', X((o.headTo ?? 0.28) + 0.05), cy, X(o.headTo ?? 0.28), cy + H * 2, 'H', x0 - 4, 'Z'), fill: o.headColor, clip: body });
  for (const pat of [].concat(o.pattern || [])) parts.push(...pattern(pat, { o, X, topY, botY, body, seed, H, cy, x0, x1 }));
  // A soft shine along the back.
  parts.push({ d: P('M', X(0.12), topY(0.12) + H * 0.32, 'Q', X(0.45), topY(0.4) + H * 0.12, X(0.75), topY(0.75) + H * 0.3, 'Q', X(0.45), topY(0.4) + H * 0.38, X(0.12), topY(0.12) + H * 0.32, 'Z'), fill: '#FFFFFF', op: o.shine ?? 0.28, clip: body });
  parts.push({ d: body, stroke: line, w: 1.6 });

  // Gill line, side fin, eye, mouth and whatever else this fish has.
  const gf = o.gillAt ?? 0.25;
  if (o.gill) parts.push({ d: P('M', X(gf), topY(gf) + H * 0.35, 'Q', X(gf) + H * 0.22, cy + dip * 0.5, X(gf) - 1, botY(gf) - H * 0.3), stroke: line, w: 1.1, op: 0.55 });
  if (o.pectoral) {
    const px = X(gf) + 3, py = cy + H * 0.25, pk = o.pectoral === 'big' ? 1.7 : 1;
    finPart(P('M', px, py - 2 * pk, 'C', px + 7 * pk, py - 4 * pk, px + 12 * pk, py + 1 * pk, px + 11 * pk, py + 5 * pk, 'C', px + 7 * pk, py + 5 * pk, px + 2, py + 3, px, py + 1, 'Z'), o.pecColor || fin, 0.9);
  }
  const er = Math.max(2.6, H * 0.21) * o.eye;
  const ex = X(o.eyeAt ?? 0.12) + (o.eyeDx ?? 0), ey = cy - H * (o.eyeUp ?? 0.22) + dip * 0.5;
  if (o.cheek) parts.push(blush(ex + er * 1.1, ey + er * 1.6, er * 0.7));
  parts.push(...eye(ex, ey, er, o.iris));
  const mx = x0 + 0.5, my = cy + dip + (o.mouthDy ?? 0.5);
  if (o.mouth === 'big') {
    parts.push({ d: P('M', mx - 1, my - 2, 'Q', X(0.1), my + H * 0.25, X(0.2), my + H * 0.05), stroke: line, w: 1.4 });
  } else {
    parts.push({ d: P('M', mx + 0.5, my, 'Q', mx + 3, my + 1.8, mx + 5.5, my + 0.6), stroke: line, w: 1.2 });
  }
  for (const ex2 of [].concat(o.extras || [])) parts.push(...extra(ex2, { o, X, topY, botY, H, cy, x0, x1, mx, my, ex, ey, er, line, fin, seed, dip }));
  return parts;
}

// Patterns cut to the body.
function pattern(p, g) {
  const { X, topY, botY, body, seed, H, cy, x0, x1, o } = g;
  const rnd = seeded(seed + ':' + p.type);
  const out = [];
  const color = p.color || shade(o.body, 0.6);
  const op = p.op ?? 0.9;
  const cut = (d, extra = {}) => out.push({ d, fill: color, op, clip: body, ...extra });
  if (p.type === 'stripes') {
    // Upright bands, a little bowed.
    const n = p.n || 4, f0 = p.from ?? 0.22, f1 = p.to ?? 0.86, w = (p.w ?? 0.05) * (x1 - x0);
    for (let i = 0; i < n; i++) {
      const x = X(f0 + ((f1 - f0) * i) / Math.max(1, n - 1)) - w / 2;
      cut(P('M', x, cy - H * 2, 'Q', x + 3, cy, x, cy + H * (p.half ? 0.1 : 2), 'L', x + w, cy + H * (p.half ? 0.1 : 2), 'Q', x + w + 3, cy, x + w, cy - H * 2, 'Z'));
    }
  } else if (p.type === 'bands') {
    // Clownfish bands: white, rimmed dark.
    for (const [f, k] of p.at || [[0.24, 0.09], [0.55, 0.1], [0.92, 0.06]]) {
      const w = k * (x1 - x0), x = X(f) - w / 2;
      const d = P('M', x, cy - H * 2, 'Q', x - 4, cy, x, cy + H * 2, 'L', x + w, cy + H * 2, 'Q', x + w - 4, cy, x + w, cy - H * 2, 'Z');
      cut(d, { fill: p.color || '#FFFFFF', stroke: p.rim || '#1E1B2E', w: 1.6 });
    }
  } else if (p.type === 'line') {
    // A stripe along the side.
    const y = cy + H * (p.y ?? 0), t = H * (p.t ?? 0.22);
    cut(P('M', x0 + (x1 - x0) * (p.from ?? 0.15), y - t / 2, 'Q', X(0.5), y - t, x1 + 2, y - t * 0.3, 'L', x1 + 2, y + t * 0.3, 'Q', X(0.5), y + t * 0.9, x0 + (x1 - x0) * (p.from ?? 0.15), y + t / 2, 'Z'));
  } else if (p.type === 'spots' || p.type === 'dots') {
    const n = p.n || 14, rmax = p.r || 1.8;
    for (let i = 0; i < n; i++) {
      const f = (p.from ?? 0.2) + rnd() * ((p.to ?? 0.95) - (p.from ?? 0.2));
      const lo = topY(f) + 1, hi = p.upper ? cy + H * 0.1 : botY(f) - 1;
      cut(circ(X(f), lo + rnd() * (hi - lo), rmax * (0.6 + rnd() * 0.5)));
    }
  } else if (p.type === 'row') {
    // A row of dots along the side (정어리).
    const n = p.n || 6;
    for (let i = 0; i < n; i++) cut(circ(X(0.3 + (0.45 * i) / Math.max(1, n - 1)), cy - H * (p.y ?? 0.2), p.r || 1.5));
  } else if (p.type === 'scales') {
    // Overlapping arcs, outline only.
    let d = '';
    const s = p.s || H * 0.32;
    for (let row = -3; row <= 3; row++) {
      for (let x = X(0.28) + (row % 2 ? s / 2 : 0); x < x1 - 2; x += s) d += ' ' + P('M', x, cy + row * s * 0.7 - s * 0.5, 'Q', x + s * 0.6, cy + row * s * 0.7, x, cy + row * s * 0.7 + s * 0.5);
    }
    out.push({ d: d.trim(), stroke: p.color || shade(o.body, 0.65), w: 0.8, op: p.op ?? 0.55, clip: body });
  } else if (p.type === 'blobs' || p.type === 'koi') {
    // Big soft patches (비단잉어, 노래미).
    const n = p.n || 3;
    for (let i = 0; i < n; i++) {
      const f = (p.from ?? 0.15) + ((p.to ?? 0.85) - (p.from ?? 0.15)) * (n === 1 ? 0.5 : i / (n - 1)) + (rnd() - 0.5) * 0.08;
      const cxp = X(f), cyp = cy - H * (0.2 + rnd() * 0.5) * (p.low ? -1 : 1), rx = (p.rx ?? 0.12) * (x1 - x0) * (0.75 + rnd() * 0.5), ry = H * (p.ry ?? 0.5) * (0.7 + rnd() * 0.5);
      const pts = []; for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; const j = 0.75 + rnd() * 0.45; pts.push([cxp + Math.cos(a) * rx * j, cyp + Math.sin(a) * ry * j]); }
      cut(smooth(pts), { fill: Array.isArray(p.color) ? p.color[i % p.color.length] : color });
    }
  } else if (p.type === 'waves') {
    // Tiger lines over the back (고등어).
    let d = '';
    for (let i = 0; i < (p.n || 7); i++) {
      const x = X(0.22 + i * 0.1);
      d += ' ' + P('M', x, topY(0.2 + i * 0.1) - 2, 'Q', x + 4, cy - H * 0.55, x - 1, cy - H * 0.3, 'Q', x + 3, cy - H * 0.15, x + 1, cy - H * 0.02);
    }
    out.push({ d: d.trim(), stroke: color, w: p.w || 1.8, op, clip: body });
  } else if (p.type === 'saddles') {
    // Dark patches across the back and down the side (가물치, 쏘가리).
    const n = p.n || 4;
    for (let i = 0; i < n; i++) {
      const f = 0.25 + (0.65 * i) / Math.max(1, n - 1), x = X(f), w = (x1 - x0) * 0.07;
      cut(smooth([[x - w, cy - H * 2], [x + w, cy - H * 2], [x + w * 1.2, cy - H * 0.2], [x + w * 0.2, cy + H * (p.deep ?? 0.35)], [x - w * 0.9, cy - H * 0.1]]));
    }
  } else if (p.type === 'rainbow') {
    const cols = p.colors || ['#FF6B6B', '#FFB347', '#FFE066', '#7BD389', '#5DADEC', '#9B7FE6'];
    const band = (H * 2.2) / cols.length;
    cols.forEach((c, i) => cut(P('M', x0 - 4, cy - H * 1.1 + i * band, 'H', x1 + 4, 'V', cy - H * 1.1 + (i + 1) * band + 0.5, 'H', x0 - 4, 'Z'), { fill: c, op: p.op ?? 0.75 }));
  } else if (p.type === 'glitter') {
    for (let i = 0; i < (p.n || 10); i++) {
      const f = 0.2 + rnd() * 0.75, y = topY(f) + 2 + rnd() * (botY(f) - topY(f) - 4);
      out.push({ ...star(X(f), y, 1.6 + rnd() * 1.6, p.color || '#FFFFFF'), op: 0.85, clip: body });
    }
  } else if (p.type === 'scutes') {
    // Bony plates in a row (철갑상어).
    for (let i = 0; i < 9; i++) { const x = X(0.3 + i * 0.075); out.push({ d: P('M', x - 2.2, cy - H * 0.2, 'L', x, cy - H * 0.38, 'L', x + 2.2, cy - H * 0.2, 'L', x, cy - H * 0.02, 'Z'), fill: p.color || '#E9E3D3', stroke: shade(o.body, 0.5), w: 0.7, clip: body }); }
    for (let i = 0; i < 8; i++) { const x = X(0.32 + i * 0.075); out.push({ d: P('M', x - 2, topY(0.32 + i * 0.075) + 1.6, 'L', x, topY(0.32 + i * 0.075) - 0.6, 'L', x + 2, topY(0.32 + i * 0.075) + 1.6, 'Z'), fill: p.color || '#E9E3D3', stroke: shade(o.body, 0.5), w: 0.7 }); }
  } else if (p.type === 'eyespot') {
    // A blue dot on the gill cover (꺽지).
    out.push({ d: circ(X(0.27), cy - H * 0.05, H * 0.13), fill: p.color || '#3F7CD6', stroke: '#F5E27A', w: 1 });
  } else if (p.type === 'patch') {
    // One spot of colour (은어's yellow mark behind the gill).
    cut(ell(X(p.at ?? 0.3), cy + H * (p.y ?? -0.05), (x1 - x0) * (p.rx ?? 0.05), H * (p.ry ?? 0.18)));
  } else if (p.type === 'heart') {
    // A red heart on the side (하트 무늬 잉어).
    const hx = X(0.5), hy = cy - H * 0.15, s = H * 0.55;
    cut(P('M', hx, hy + s * 0.9, 'C', hx - s * 1.3, hy + s * 0.1, hx - s * 0.9, hy - s * 0.9, hx, hy - s * 0.35, 'C', hx + s * 0.9, hy - s * 0.9, hx + s * 1.3, hy + s * 0.1, hx, hy + s * 0.9, 'Z'), { fill: p.color || '#E2513B', op: 1 });
  } else if (p.type === 'clock') {
    // A clock face with its hands (시간의 물고기).
    const hx = X(0.5), r = H * 0.62;
    out.push({ d: circ(hx, cy, r), fill: '#FFFDF2', stroke: '#6E5AA8', w: 1.2 });
    out.push({ d: P('M', hx, cy - r + 1.5, 'L', hx, cy - r + 3.5, 'M', hx + r - 1.5, cy, 'L', hx + r - 3.5, cy, 'M', hx, cy + r - 1.5, 'L', hx, cy + r - 3.5, 'M', hx - r + 1.5, cy, 'L', hx - r + 3.5, cy), stroke: '#6E5AA8', w: 1 });
    out.push({ d: P('M', hx, cy, 'L', hx, cy - r * 0.7, 'M', hx, cy, 'L', hx + r * 0.45, cy + r * 0.2), stroke: '#2E2448', w: 1.4 });
  } else if (p.type === 'tang') {
    // Blue tang's dark palette sweep.
    cut(P('M', X(0.18), cy - H * 0.55, 'C', X(0.45), cy - H * 1.1, X(0.8), cy - H * 0.6, X(0.95), cy - H * 0.05, 'C', X(0.75), cy + H * 0.15, X(0.62), cy - H * 0.15, X(0.5), cy + H * 0.35, 'C', X(0.42), cy - H * 0.1, X(0.3), cy - H * 0.05, X(0.18), cy - H * 0.55, 'Z'));
  }
  return out;
}

// Things some fish have and others do not.
function extra(kind, g) {
  const { o, X, topY, H, cy, x0, mx, my, ex, ey, er, line, fin, seed } = g;
  if (kind === 'barbels') return [{ d: P('M', mx + 2, my + 0.5, 'q', -3, 4, -6, 5, 'M', mx + 4, my + 1, 'q', -1, 5, -3, 7), stroke: line, w: 1.1 }];
  if (kind === 'whiskers') return [{ d: P('M', mx + 1, my - 1, 'C', mx - 8, my - 4, mx - 13, my - 10, mx - 10, my - 16, 'M', mx + 2, my + 1, 'C', mx - 9, my + 3, mx - 14, my + 9, mx - 11, my + 15, 'M', mx + 4, my + 2, 'q', -2, 6, -6, 9, 'M', mx + 6, my + 2, 'q', 0, 6, -2, 9), stroke: line, w: 1.2 }];
  if (kind === 'sword') return [{ d: P('M', x0 + 2, my - 2.5, 'L', x0 - 13, my - 0.6, 'L', x0 + 2, my + 0.8, 'Z'), fill: shade(o.body, 0.7), stroke: line, w: 1 }];
  if (kind === 'snout') return [{ d: P('M', x0 + 3, my - 3, 'Q', x0 - 6, my - 2, x0 - 8, my + 1, 'Q', x0 - 4, my + 2, x0 + 3, my + 2, 'Z'), fill: shade(o.body, 0.9), stroke: line, w: 1.1 }];
  if (kind === 'teeth') {
    let d = '';
    for (let i = 0; i < 5; i++) { const x = mx + 1 + i * 3.2; d += ' ' + P('M', x, my - 1, 'L', x + 1.4, my + 2.6, 'L', x + 2.8, my - 1, 'Z'); }
    return [{ d: d.trim(), fill: '#FFFFFF', stroke: line, w: 0.6 }];
  }
  if (kind === 'lure') {
    const bx = x0 + 2, by = topY(0.05) - H * 0.9;
    return [{ d: P('M', X(0.16), topY(0.16) + 1, 'C', X(0.18), by - 6, bx + 10, by - 9, bx + 1, by), stroke: shade(o.body, 0.8), w: 1.4 },
      { d: circ(bx, by + 1, 6), fill: '#FFF6A8', op: 0.35 }, { d: circ(bx, by + 1, 3.2), fill: '#FFF07A', stroke: '#E0B400', w: 0.8 }];
  }
  if (kind === 'crown') return crown(X(0.15), topY(0.15) + 1.5, 0.9);
  if (kind === 'sparkle') return sparkles(seed, 5, o.sparkColor);
  if (kind === 'glow') return [1.25, 1.05, 0.85].map((k) => ({ d: ell(x0 + (g.x1 - x0) / 2 + 6, cy, ((g.x1 - x0) / 2 + 16) * k, H * 1.6 * k), fill: o.glowColor || '#FFF3B0', op: 0.09 }));
  if (kind === 'blush') return [blush(ex + er * 1.3, ey + er * 1.5, er * 0.75)];
  if (kind === 'finlets') {
    let d = '';
    for (let i = 0; i < 5; i++) { const f = 0.74 + i * 0.05, x = X(f); d += ' ' + P('M', x, topY(f) + 1, 'L', x + 2, topY(f) - 3, 'L', x + 3, topY(f) + 1.5, 'Z', 'M', x, g.botY(f) - 1, 'L', x + 2, g.botY(f) + 3, 'L', x + 3, g.botY(f) - 1.5, 'Z'); }
    return [{ d: d.trim(), fill: o.finletColor || '#F4C430', stroke: shade(o.finletColor || '#F4C430', 0.6), w: 0.6 }];
  }
  if (kind === 'gills') {
    // Five slits (상어).
    let d = '';
    for (let i = 0; i < 4; i++) { const x = X(0.22 + i * 0.035); d += ' ' + P('M', x, cy - H * 0.35, 'Q', x + 1.5, cy, x, cy + H * 0.3); }
    return [{ d: d.trim(), stroke: line, w: 1, op: 0.7 }];
  }
  if (kind === 'hook') return [{ d: P('M', x0 + 2, my - 1, 'Q', x0 - 5, my - 2, x0 - 4, my + 4, 'Q', x0 - 1, my + 1, x0 + 3, my + 1.5, 'Z'), fill: shade(o.headColor || o.body, 0.85), stroke: line, w: 1.1 }];
  if (kind === 'lips') return [{ d: ell(mx + 1.5, my, 2.6, 2), fill: '#F6A6B2', stroke: line, w: 0.8 }];
  if (kind === 'spikes') {
    // Little spines all over (복어 when calm).
    const rnd = seeded(seed + ':spk'); let d = '';
    for (let i = 0; i < 14; i++) { const f = 0.15 + rnd() * 0.75, x = X(f), y = topY(f) + 3 + rnd() * (g.botY(f) - topY(f) - 6); d += ' ' + P('M', x - 1, y, 'L', x + 1.5, y - 2.5, 'L', x + 1, y + 0.5, 'Z'); }
    return [{ d: d.trim(), fill: shade(o.body, 0.7) }];
  }
  if (kind === 'fringe') return [{ d: P('M', X(0.3), topY(0.3) + 3, 'q', 3, -6, 6, -8, 'M', X(0.36), topY(0.36) + 3, 'q', 3, -6, 6, -9), stroke: o.crestColor || '#E63946', w: 1.6 }];
  // A long lower jaw (학꽁치, 강준치).
  if (kind === 'jaw') return [{ d: P('M', x0 + 3, my + 0.4, 'L', x0 - 11, my + 2.2, 'L', x0 + 3, my + 2.6, 'Z'), fill: shade(o.body, 0.8), stroke: line, w: 0.9 }, { d: circ(x0 - 10, my + 2.2, 1.2), fill: '#E8503E' }];
  // A dragon's antlers, a unicorn's horn, a mane of spikes along the back.
  if (kind === 'horns') {
    const hx = X(0.13), hy = topY(0.13) + 2;
    return [{ d: P('M', hx, hy, 'Q', hx - 2, hy - 9, hx - 7, hy - 14, 'M', hx - 1.5, hy - 6, 'L', hx + 4, hy - 11, 'M', hx + 4, hy + 0.5, 'Q', hx + 3, hy - 8, hx + 1, hy - 13), stroke: o.hornColor || '#F2C14E', w: 2.2 }];
  }
  if (kind === 'horn') return [{ d: P('M', X(0.07), topY(0.07) + 1.5, 'L', X(0.02) - 2, topY(0.05) - 13, 'L', X(0.14), topY(0.13) + 1, 'Z'), fill: o.hornColor || '#F2C14E', stroke: '#B8860B', w: 0.9 }];
  if (kind === 'mane') {
    let d = '';
    for (let i = 0; i < 8; i++) { const f = 0.16 + i * 0.1, x = X(f), y = topY(f) + 1.5; d += ' ' + P('M', x - 2.5, y, 'L', x + 1, y - 6 - (i % 2) * 2, 'L', x + 3, y, 'Z'); }
    return [{ d: d.trim(), fill: o.maneColor || '#E8503E', stroke: shade(o.maneColor || '#E8503E', 0.65), w: 0.7 }];
  }
  // Flames along the back (불사조).
  if (kind === 'flames') {
    const out = [];
    for (const f of [0.22, 0.38, 0.54, 0.7, 0.86]) {
      const x = X(f), y = topY(f) + 2, s = 1 + Math.sin(f * 9) * 0.25;
      out.push({ d: P('M', x - 4 * s, y, 'Q', x - 5 * s, y - 7 * s, x + 1, y - 14 * s, 'Q', x + 1, y - 7 * s, x + 5 * s, y - 5 * s, 'Q', x + 6 * s, y - 1, x + 3 * s, y, 'Z'), fill: '#FF7A3E', op: 0.9 });
      out.push({ d: P('M', x - 2 * s, y, 'Q', x - 2 * s, y - 4 * s, x + 0.5, y - 8 * s, 'Q', x + 1, y - 4 * s, x + 3 * s, y - 2 * s, 'Q', x + 3 * s, y, x + 1, y, 'Z'), fill: '#FFE38A' });
    }
    return out;
  }
  // An axolotl's feathery gills, little legs and a smile.
  if (kind === 'frills') {
    const fx = X(0.2), fy = topY(0.2) + 3, c = o.frillColor || '#E8708E';
    return [{ d: P('M', fx, fy, 'Q', fx + 2, fy - 7, fx + 8, fy - 11, 'M', fx + 1, fy + 2, 'Q', fx + 6, fy - 3, fx + 13, fy - 3, 'M', fx, fy + 5, 'Q', fx + 6, fy + 5, fx + 12, fy + 8,
      'M', fx + 3, fy - 4, 'l', -2, -3, 'M', fx + 6, fy - 7, 'l', -2, -3, 'M', fx + 5, fy - 1, 'l', 0, -3, 'M', fx + 9, fy - 2, 'l', 0, -3, 'M', fx + 5, fy + 5, 'l', 1, 3, 'M', fx + 9, fy + 6, 'l', 1, 3), stroke: c, w: 2 }];
  }
  if (kind === 'legs') {
    const c = shade(o.body, 0.85);
    return [{ d: P('M', X(0.3), g.botY(0.3) - 2, 'l', -2, 6, 'l', -3, 1, 'M', X(0.36), g.botY(0.36) - 2, 'l', 1, 6, 'l', 3, 0.5, 'M', X(0.72), g.botY(0.72) - 2, 'l', -2, 6, 'l', -3, 1, 'M', X(0.78), g.botY(0.78) - 2, 'l', 1, 6, 'l', 3, 0.5), stroke: c, w: 2.6 }];
  }
  if (kind === 'smile') return [{ d: P('M', mx + 1, my - 1, 'Q', mx + 6, my + 4, mx + 11, my), stroke: line, w: 1.3 }];
  // A salaryman's necktie (칼퇴 물고기).
  if (kind === 'tie') {
    const tx = X(0.26), ty = cy + H * 0.05;
    return [{ d: P('M', tx - 2.2, ty - 2, 'L', tx + 2.2, ty - 2, 'L', tx + 1.2, ty + 1.5, 'L', tx - 1.2, ty + 1.5, 'Z'), fill: '#C62E3E' },
      { d: P('M', tx - 1.2, ty + 1.5, 'L', tx + 1.2, ty + 1.5, 'L', tx + 3, ty + H * 0.85, 'L', tx, ty + H * 1.05, 'L', tx - 2.5, ty + H * 0.85, 'Z'), fill: '#E8503E', stroke: '#9E2230', w: 0.7 }];
  }
  // Gold coins out of the mouth (월급날).
  if (kind === 'coins') {
    const out = [];
    for (const [dx, dy, r] of [[-8, 6, 3.4], [-4, 14, 3], [-11, 17, 2.6]]) {
      const x = Math.max(r + 1, mx + dx), y = my + dy;
      out.push({ d: circ(x, y, r), fill: '#FFD34E', stroke: '#B8860B', w: 0.9 }, { d: P('M', x, y - r * 0.5, 'L', x, y + r * 0.5), stroke: '#B8860B', w: 0.8 });
    }
    return out;
  }
  // A coelacanth's fleshy lobed fins and the little tuft in the middle of its tail.
  if (kind === 'lobes') {
    const f2 = fin;
    return [[0.3, 1, 6], [0.58, 1, 5], [0.62, -1, 5]].map(([f, s, r]) => ({ d: ell(X(f) + 2, (s > 0 ? g.botY(f) + 2 : topY(f) - 2), r, r * 0.55), fill: f2, stroke: shade(f2, 0.6), w: 1 }))
      .concat([{ d: ell(g.x1 + 18, cy, 5, 2.4), fill: f2, stroke: shade(f2, 0.6), w: 1 }]);
  }
  // Wing-like side fins (날치, 성대).
  if (kind === 'wings') {
    const c = o.wingColor || '#B9D4EC', wx = X(0.26);
    return [{ d: P('M', wx, cy + 1, 'C', X(0.36), cy - H * 2.1, X(0.66), cy - H * 2.5, X(0.86), cy - H * 1.7, 'C', X(0.66), cy - H * 1.1, X(0.46), cy - H * 0.3, wx, cy + 3, 'Z'), fill: c, stroke: shade(c, 0.6), w: 1, op: 0.85 },
      { d: P('M', wx + 2, cy, 'L', X(0.5), cy - H * 1.9, 'M', wx + 2, cy + 1, 'L', X(0.65), cy - H * 1.8, 'M', wx + 2, cy + 2, 'L', X(0.78), cy - H * 1.5), stroke: shade(c, 0.6), w: 0.7, op: 0.6 }];
  }
  // Fangs too long for the mouth, and lights along the belly (심해).
  if (kind === 'fangs') {
    let d = '';
    for (const [dx, len, up] of [[1, 7, 1], [4.5, 9, -1], [8, 5, 1], [10.5, 6, -1]]) d += ' ' + P('M', mx + dx, my, 'L', mx + dx + 1, my + up * len, 'L', mx + dx + 2.2, my, 'Z');
    return [{ d: d.trim(), fill: '#F4F0E0', stroke: line, w: 0.5 }];
  }
  if (kind === 'lights') {
    const out = [];
    for (let i = 0; i < 9; i++) { const f = 0.15 + i * 0.09; out.push({ d: circ(X(f), g.botY(f) - 2.2, 1.1), fill: o.glowColor || '#7FF5E0', op: 0.95 }); }
    return out;
  }
  // A hammerhead: the head stretched up and down, an eye at its top end.
  if (kind === 'hammer') return [{ d: ell(x0 + 5, cy - 1, 4.5, H * 1.3), fill: o.body, stroke: line, w: 1.3 }, ...eye(x0 + 5, cy - H * 1.05, er * 0.85)];
  // See-through bones (유리고기).
  if (kind === 'bones') {
    let d = P('M', X(0.22), cy, 'Q', X(0.6), cy - 1, X(0.98), cy);
    for (let i = 0; i < 9; i++) { const f = 0.3 + i * 0.075; d += ' ' + P('M', X(f), cy, 'L', X(f) + 2.5, topY(f) + 3, 'M', X(f), cy, 'L', X(f) + 2.5, g.botY(f) - 3); }
    return [{ d, stroke: '#8CA8B4', w: 0.9, op: 0.8 }];
  }
  void fin;
  return [];
}

// ── the unusual ones ─────────────────────────────────────────────────────────────────────────
// A long wavy body: eels, loaches, a hairtail's ribbon, an oarfish with its red crest.
function eel(o, seed) {
  const n = 24, x0 = o.x0 ?? 8, x1 = o.x1 ?? 112, cy = 40, A = o.wave ?? 6, Hm = o.h ?? 7;
  const yc = (f) => cy + A * Math.sin(f * Math.PI * (o.waves ?? 2.2) + 0.6) * Math.min(1, f * 3);
  const thick = (f) => Hm * (f < 0.07 ? Math.sqrt(f / 0.07) * 0.9 + 0.1 : 1 - (o.taper ?? 0.85) * Math.pow((f - 0.07) / 0.93, o.tailPow ?? 1.4));
  const top = [], bot = [], fin = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, x = x0 + (x1 - x0) * f, t = thick(f);
    top.push([x, yc(f) - t]); bot.push([x, yc(f) + t]);
    fin.push([x, yc(f) - t - (f > (o.finFrom ?? 0.25) ? (o.fin ?? 3.5) * Math.min(1, (f - (o.finFrom ?? 0.25)) * 6) : 0)]);
  }
  const ring = [...top, ...[...bot].reverse()];
  const body = smooth(ring);
  const line = shade(o.body, 0.55);
  const parts = [];
  if (o.fin !== 0) {
    const ribbon = [...fin, ...[...top].reverse()];
    parts.push({ d: smooth(ribbon), fill: o.finColor || shade(o.body, 0.85), stroke: shade(o.finColor || o.body, 0.6), w: 1, op: o.finOp ?? 0.9 });
    // The same frill underneath, from the middle back.
    const low = bot.map(([x, y], i) => [x, y + (i / n > 0.5 ? (o.fin ?? 3.5) * 0.8 * Math.min(1, (i / n - 0.5) * 6) : 0)]);
    parts.push({ d: smooth([...bot, ...[...low].reverse()]), fill: o.finColor || shade(o.body, 0.85), op: (o.finOp ?? 0.9) * 0.9 });
  }
  if (o.crest) {
    // An oarfish's red crown of long rays over its head.
    let d = '';
    for (let i = 0; i < 6; i++) { const x = x0 + 5 + i * 3; d += ' ' + P('M', x, yc((x - x0) / (x1 - x0)) - Hm + 1, 'Q', x - 4 + i, yc(0) - Hm - 10 - i * 1.5, x + 6 + i * 2, yc(0) - Hm - 16 - i * 1.2); }
    parts.push({ d: d.trim(), stroke: o.crest, w: 2, op: 0.95 });
  }
  // A dragon's: spikes along the back and four clawed legs, behind the body.
  if (o.mane) {
    let d = '';
    for (let i = 2; i < n - 2; i += 2) { const [x, y] = top[i]; d += ' ' + P('M', x - 2.5, y + 1.5, 'L', x + 1.5, y - 5 - (i % 4 ? 0 : 2), 'L', x + 3, y + 1.5, 'Z'); }
    parts.push({ d: d.trim(), fill: o.mane, stroke: shade(o.mane, 0.65), w: 0.7 });
  }
  if (o.legs) {
    let d = '';
    for (const i of [5, 7, 14, 16]) { const [x, y] = bot[i]; d += ' ' + P('M', x, y - 1, 'L', x - 3, y + 6, 'M', x - 3, y + 6, 'l', -2, 1.5, 'M', x - 3, y + 6, 'l', 0, 2.5, 'M', x - 3, y + 6, 'l', 2, 1.5); }
    parts.push({ d: d.trim(), stroke: shade(o.body, 0.75), w: 2 });
  }
  parts.push({ d: body, fill: o.body });
  if (o.belly) parts.push({ d: smooth([...bot.map(([x, y]) => [x, y - 0.5]), ...[...bot].reverse().map(([x, y], i) => [x, y - thick(1 - i / n) * 0.9])]), fill: o.belly, clip: body });
  if (o.scales) {
    let d = '';
    for (let i = 2; i < n - 1; i++) { const [x, y] = top[i]; const t = thick(i / n); d += ' ' + P('M', x, y + t * 0.5, 'q', 2, 1.5, 0, 3, 'M', x + 2, y + t * 1.1, 'q', 2, 1.5, 0, 3); }
    parts.push({ d: d.trim(), stroke: shade(o.body, 0.7), w: 0.7, op: 0.7, clip: body });
  }
  if (o.bolts) {
    let d = '';
    for (const f of [0.2, 0.45, 0.7]) { const i = Math.round(f * n), [x, y] = top[i]; d += ' ' + P('M', x - 2, y + 1, 'L', x + 2, y + Hm * 0.8, 'L', x - 1, y + Hm * 0.9, 'L', x + 3, y + Hm * 1.8); }
    parts.push({ d: d.trim(), stroke: o.bolts, w: 1.6, clip: body });
    parts.push({ d: P('M', top[3][0] - 4, top[3][1] - 10, 'L', top[3][0], top[3][1] - 5, 'L', top[3][0] - 3, top[3][1] - 4, 'L', top[3][0] + 1, top[3][1] + 1, 'M', top[17][0], top[17][1] - 12, 'L', top[17][0] + 4, top[17][1] - 7, 'L', top[17][0] + 1, top[17][1] - 6, 'L', top[17][0] + 5, top[17][1] - 1), stroke: o.bolts, w: 1.4 });
  }
  if (o.spots) {
    const rnd = seeded(seed + ':eel');
    for (let i = 0; i < 18; i++) { const f = 0.1 + rnd() * 0.85, x = x0 + (x1 - x0) * f; parts.push({ d: circ(x, yc(f) - thick(f) * 0.3 + (rnd() - 0.5) * thick(f), 0.9 + rnd() * 0.9), fill: o.spots, op: 0.85, clip: body }); }
  }
  if (o.sheen) parts.push({ d: smooth(top.map(([x, y], i) => [x, y + thick(i / n) * 0.35]).concat([...top].reverse().map(([x, y], i) => [x, y + thick(1 - i / n) * 0.8]))), fill: '#FFFFFF', op: o.sheen, clip: body });
  parts.push({ d: body, stroke: line, w: 1.5 });
  const ex = x0 + 4.5, ey = yc(0.02) - Hm * 0.25, er = Math.max(2.4, Hm * 0.38) * (o.eye ?? 1);
  if (o.pectoral !== false) parts.push({ d: P('M', ex + 6, yc(0.08) + 1, 'q', 5, -3, 7, 1, 'q', -3, 2, -7, 1, 'Z'), fill: o.finColor || shade(o.body, 0.85), stroke: line, w: 0.8 });
  parts.push(...eye(ex, ey, er));
  if (o.jaw) parts.push({ d: P('M', x0 - 0.5, yc(0) + 0.5, 'L', x0 - 5, yc(0) + 1.2, 'L', x0 + 3, yc(0) + 2.2, 'Z'), fill: o.body, stroke: line, w: 1 });
  else parts.push({ d: P('M', x0 + 0.5, yc(0) + 1.2, 'q', 2.5, 1.5, 5, 0.3), stroke: line, w: 1.1 });
  if (o.whiskers) parts.push({ d: P('M', x0 + 1, yc(0) + 1.5, 'q', -4, 2, -6, 5, 'M', x0 + 2.5, yc(0) + 2, 'q', -2, 3, -3, 6, 'M', x0 + 1, yc(0) - 0.5, 'q', -4, -1, -6, -3), stroke: line, w: 1 });
  // A dragon's long flowing whiskers and antlers.
  if (o.beard) parts.push({ d: P('M', x0 + 1, yc(0) + 1, 'C', x0 - 4, yc(0) + 6, x0 + 4, yc(0) + 12, x0 - 2, yc(0) + 18, 'M', x0 + 2, yc(0) - 1, 'C', x0 - 4, yc(0) - 8, x0 + 6, yc(0) - 12, x0 + 1, yc(0) - 19), stroke: o.mane || shade(o.body, 0.6), w: 1.4 });
  if (o.horns) {
    const hx = x0 + 7, hy = yc(0.05) - Hm;
    parts.push({ d: P('M', hx, hy + 1, 'Q', hx + 1, hy - 7, hx + 7, hy - 12, 'M', hx + 2, hy - 5, 'L', hx - 2, hy - 9, 'M', hx + 4, hy + 1, 'Q', hx + 6, hy - 5, hx + 12, hy - 9), stroke: o.horns, w: 2.2 });
  }
  if (o.sparkle) parts.push(...sparkles(seed, 4));
  return parts;
}

// Flatfish from above: an oval with a frill all round, both eyes on top.
function flat(o, seed) {
  const cx = 56, cy = 40, rx = 36, ry = 22;
  const body = ell(cx, cy, rx, ry);
  const parts = [
    { d: P('M', cx + rx - 4, cy - 4, 'C', cx + rx + 8, cy - 14, cx + rx + 18, cy - 12, cx + rx + 20, cy, 'C', cx + rx + 18, cy + 12, cx + rx + 8, cy + 14, cx + rx - 4, cy + 4, 'Z'), fill: o.fin || shade(o.body, 0.85), stroke: shade(o.body, 0.55), w: 1.2 },
    { d: ell(cx, cy, rx + 5, ry + 5), fill: o.fin || shade(o.body, 0.85), stroke: shade(o.body, 0.6), w: 1.1, op: 0.95 },
  ];
  let rays = '';
  for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2; rays += ' ' + P('M', cx + Math.cos(a) * rx * 0.96, cy + Math.sin(a) * ry * 0.96, 'L', cx + Math.cos(a) * (rx + 4.5), cy + Math.sin(a) * (ry + 4.5)); }
  parts.push({ d: rays.trim(), stroke: shade(o.body, 0.6), w: 0.7, op: 0.5 });
  parts.push({ d: body, fill: o.body });
  const rnd = seeded(seed + ':flat');
  for (let i = 0; i < (o.spotN ?? 16); i++) { const a = rnd() * Math.PI * 2, k = Math.sqrt(rnd()) * 0.85; parts.push({ d: circ(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k, 1.2 + rnd() * 1.8), fill: o.spots || shade(o.body, 0.65), op: 0.8, clip: body }); }
  parts.push({ d: P('M', cx - rx * 0.5, cy - ry * 0.55, 'Q', cx, cy - ry * 0.95, cx + rx * 0.5, cy - ry * 0.55, 'Q', cx, cy - ry * 0.7, cx - rx * 0.5, cy - ry * 0.55, 'Z'), fill: '#FFFFFF', op: 0.25 });
  parts.push({ d: body, stroke: shade(o.body, 0.55), w: 1.5 });
  // Both eyes up on one side, as flatfish have; a crooked little mouth.
  parts.push(...eye(cx - rx * 0.62, cy - 6, 3.6), ...eye(cx - rx * 0.5, cy + 2, 3.6));
  parts.push({ d: P('M', cx - rx + 1, cy + 6, 'q', 3, 3, 6, 1.5), stroke: shade(o.body, 0.5), w: 1.2 });
  return parts;
}

// A ray: wide wings, a whip of a tail.
function ray(o, seed) {
  const cx = 52, cy = 40;
  const body = P('M', cx - 30, cy, 'C', cx - 24, cy - 6, cx - 6, cy - 34, cx + 4, cy - 36, 'C', cx + 8, cy - 22, cx + 18, cy - 8, cx + 26, cy, 'C', cx + 18, cy + 8, cx + 8, cy + 22, cx + 4, cy + 36, 'C', cx - 6, cy + 34, cx - 24, cy + 6, cx - 30, cy, 'Z');
  const parts = [{ d: P('M', cx + 22, cy - 1.2, 'Q', cx + 50, cy - 4, cx + 66, cy + 2, 'Q', cx + 50, cy - 1, cx + 22, cy + 1.2, 'Z'), fill: shade(o.body, 0.7), stroke: shade(o.body, 0.5), w: 1 }];
  parts.push({ d: body, fill: o.body });
  const rnd = seeded(seed + ':ray');
  if (o.spots) for (let i = 0; i < 26; i++) { const x = cx - 24 + rnd() * 46, y = cy + (rnd() - 0.5) * 60; parts.push({ d: circ(x, y, 1.1 + rnd() * 1.3), fill: o.spots, clip: body }); }
  parts.push({ d: P('M', cx - 18, cy - 6, 'Q', cx + 2, cy - 30, cx + 5, cy - 31, 'Q', cx + 2, cy - 12, cx - 18, cy - 6, 'Z'), fill: '#FFFFFF', op: 0.2, clip: body });
  parts.push({ d: body, stroke: shade(o.body, 0.5), w: 1.5 });
  // A manta's two horn-like fins up front.
  if (o.kind === 'manta') parts.push({ d: P('M', cx - 28, cy - 3, 'q', -7, -1, -9, -8, 'q', 6, -1, 10, 5, 'Z', 'M', cx - 28, cy + 3, 'q', -7, 1, -9, 8, 'q', 6, 1, 10, -5, 'Z'), fill: shade(o.body, 0.85), stroke: shade(o.body, 0.5), w: 1 });
  if (o.kind === 'face') {
    // Its underside: the nostrils that look like eyes, and a big smile.
    parts.push({ d: ell(cx - 12, cy - 6, 2.2, 3.2) + ' ' + ell(cx - 12, cy + 6, 2.2, 3.2), fill: '#3E3A44' });
    parts.push({ d: P('M', cx - 2, cy - 9, 'Q', cx + 8, cy, cx - 2, cy + 9), stroke: '#3E3A44', w: 1.8 });
    parts.push(blush(cx - 6, cy - 13, 2.6), blush(cx - 6, cy + 13, 2.6));
    return parts;
  }
  parts.push(...eye(cx - 20, cy - 5, 3), ...eye(cx - 20, cy + 5, 3));
  parts.push({ d: P('M', cx - 29, cy - 2, 'q', -3, 2, 0, 4), stroke: shade(o.body, 0.45), w: 1.1 });
  return parts;
}

// A round one: a puffer (all spines out) or a sunfish (a tall disc cut off behind).
function round(o, seed) {
  const parts = [];
  if (o.kind === 'sunfish') {
    const body = P('M', 22, 40, 'C', 22, 18, 44, 12, 66, 14, 'C', 82, 16, 92, 24, 96, 30, 'Q', 100, 40, 96, 50, 'C', 92, 56, 82, 64, 66, 66, 'C', 44, 68, 22, 62, 22, 40, 'Z');
    parts.push({ d: P('M', 74, 18, 'C', 78, 4, 84, -6, 92, -8, 'C', 92, 4, 90, 14, 86, 22, 'Z'), fill: shade(o.body, 0.85), stroke: shade(o.body, 0.55), w: 1.2 });
    parts.push({ d: P('M', 74, 62, 'C', 78, 76, 84, 86, 92, 88, 'C', 92, 76, 90, 66, 86, 58, 'Z'), fill: shade(o.body, 0.85), stroke: shade(o.body, 0.55), w: 1.2 });
    parts.push({ d: P('M', 94, 28, 'q', 7, 3, 6, 6, 'q', 5, 3, 3, 6, 'q', 5, 3, 3, 6, 'q', 3, 3, -2, 6, 'L', 94, 52, 'Z'), fill: shade(o.body, 0.8), stroke: shade(o.body, 0.55), w: 1.2 });
    parts.push({ d: body, fill: o.body });
    parts.push({ d: P('M', 20, 46, 'Q', 60, 52, 100, 46, 'V', 80, 'H', 20, 'Z'), fill: o.belly || '#E6E9EE', clip: body });
    const rnd = seeded(seed + ':sun');
    for (let i = 0; i < 9; i++) parts.push({ d: circ(40 + rnd() * 44, 24 + rnd() * 30, 1.5 + rnd() * 1.5), fill: shade(o.body, 0.8), op: 0.6, clip: body });
    parts.push({ d: body, stroke: shade(o.body, 0.55), w: 1.6 });
    parts.push({ d: P('M', 50, 38, 'q', 6, -3, 8, 3, 'q', -4, 4, -8, -3, 'Z'), fill: shade(o.body, 0.85), stroke: shade(o.body, 0.55), w: 0.9 });
    parts.push(...eye(34, 34, 4.2), blush(38, 42, 3));
    parts.push({ d: P('M', 23, 41, 'q', 2, 2, 4, 0.5), stroke: shade(o.body, 0.5), w: 1.2 });
    return parts;
  }
  // Puffer, blown up.
  const cx = 54, cy = 40, r = 25;
  let spines = '';
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; const b = a + 0.08; spines += ' ' + P('M', cx + Math.cos(a - 0.08) * r, cy + Math.sin(a - 0.08) * r, 'L', cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6), 'L', cx + Math.cos(b) * r, cy + Math.sin(b) * r, 'Z'); }
  parts.push({ d: P('M', cx + r - 3, cy - 3, 'C', cx + r + 6, cy - 12, cx + r + 13, cy - 9, cx + r + 13, cy, 'C', cx + r + 13, cy + 9, cx + r + 6, cy + 12, cx + r - 3, cy + 3, 'Z'), fill: o.fin || shade(o.body, 0.85), stroke: shade(o.body, 0.55), w: 1.1 });
  parts.push({ d: spines.trim(), fill: shade(o.body, 0.75), stroke: shade(o.body, 0.55), w: 0.6 });
  const body = circ(cx, cy, r);
  parts.push({ d: body, fill: o.body });
  parts.push({ d: P('M', cx - r - 2, cy + 4, 'Q', cx, cy - 2, cx + r + 2, cy + 4, 'V', cy + r + 4, 'H', cx - r - 2, 'Z'), fill: o.belly || '#FFFFFF', clip: body });
  const rnd = seeded(seed + ':puff');
  for (let i = 0; i < 12; i++) { const a = Math.PI + rnd() * Math.PI, k = 0.3 + rnd() * 0.6; parts.push({ d: circ(cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k, 1.4 + rnd() * 1.4), fill: o.spots || shade(o.body, 0.55), op: 0.85, clip: body }); }
  parts.push({ d: P('M', cx - 14, cy - 15, 'Q', cx, cy - 24, cx + 12, cy - 16, 'Q', cx, cy - 19, cx - 14, cy - 15, 'Z'), fill: '#FFFFFF', op: 0.35 });
  parts.push({ d: body, stroke: shade(o.body, 0.5), w: 1.6 });
  parts.push({ d: P('M', cx - 2, cy + 2, 'q', 6, -5, 9, 1, 'q', -5, 3, -9, -1, 'Z'), fill: o.fin || shade(o.body, 0.85), stroke: shade(o.body, 0.55), w: 0.9 });
  parts.push(...eye(cx - 13, cy - 7, 5.2), blush(cx - 10, cy + 3, 3.4));
  parts.push({ d: ell(cx - r + 1, cy + 3, 2.6, 2.2), fill: '#F6A6B2', stroke: shade(o.body, 0.5), w: 0.9 });
  return parts;
}

function squid(o, seed) {
  const big = o.giant;
  const parts = [];
  const col = o.body, ln = shade(col, 0.55);
  // Arms trailing to the left, two long feeding tentacles past them.
  let arms = '';
  for (let i = 0; i < 8; i++) { const y = 34 + i * 1.8; arms += ' ' + P('M', 44, y, 'C', 34, y + (i - 3.5) * 1.5, 26, y + (i - 3.5) * 2.4, 18 + (i % 2) * 3, y + (i - 3.5) * 3.2); }
  parts.push({ d: arms.trim(), stroke: shade(col, 0.9), w: 3.2 });
  parts.push({ d: arms.trim(), stroke: ln, w: 0.6, op: 0.5 });
  parts.push({ d: P('M', 44, 38, 'C', 30, 40, 16, 30, 6, 34, 'M', 44, 42, 'C', 30, 44, 16, 52, 6, 48), stroke: shade(col, 0.9), w: 1.6 });
  parts.push({ d: ell(6, 34, 3, 2) + ' ' + ell(6, 48, 3, 2), fill: shade(col, 0.85) });
  // Mantle pointing right, fins at its tip.
  parts.push({ d: P('M', 92, 40, 'C', 100, 30, 108, 26, 114, 26, 'C', 112, 34, 112, 46, 114, 54, 'C', 108, 54, 100, 50, 92, 40, 'Z'), fill: shade(col, 0.9), stroke: ln, w: 1.2 });
  const mantle = P('M', 48, 30, 'C', 66, 26, 90, 28, 108, 40, 'C', 90, 52, 66, 54, 48, 50, 'C', 44, 46, 44, 34, 48, 30, 'Z');
  parts.push({ d: mantle, fill: col });
  const rnd = seeded(seed + ':sq');
  for (let i = 0; i < 22; i++) parts.push({ d: circ(52 + rnd() * 50, 31 + rnd() * 18, 0.7 + rnd() * 1.1), fill: o.dots || shade(col, 0.7), op: 0.8, clip: mantle });
  parts.push({ d: P('M', 54, 33, 'Q', 80, 28, 100, 38, 'Q', 80, 33, 54, 36, 'Z'), fill: '#FFFFFF', op: 0.3 });
  parts.push({ d: mantle, stroke: ln, w: 1.5 });
  // Head with big eyes.
  const head = ell(44, 40, 7, 9);
  parts.push({ d: head, fill: shade(col, 0.95), stroke: ln, w: 1.3 });
  if (big) parts.push({ d: circ(43, 37, 7.5), fill: '#9BE7FF', op: 0.35 });
  parts.push(...eye(43, 37, big ? 4.6 : 3.8, big ? '#0B5E7A' : undefined));
  if (o.sparkle) parts.push(...sparkles(seed, 4));
  return parts;
}

function octopus(o, seed) {
  const col = o.body, ln = shade(col, 0.55);
  const parts = [];
  // Eight curling arms under the head.
  const arm = (x, dir, len, curl) => P('M', x, 44, 'C', x + dir * 4, 56, x + dir * (len * 0.6), 64, x + dir * len, 60, 'C', x + dir * (len + curl), 56, x + dir * (len - 2), 50, x + dir * (len - 6), 54);
  let arms = '';
  [[44, -1, 22, 4], [50, -1, 15, 3], [56, -1, 9, 2], [62, -1, 4, 2], [64, 1, 4, 2], [70, 1, 9, 2], [76, 1, 15, 3], [82, 1, 22, 4]].forEach(([x, d, l, c]) => { arms += ' ' + arm(x, d, l * (o.long ?? 1), c); });
  parts.push({ d: arms.trim(), stroke: col, w: o.slim ? 3.6 : 5.2 });
  parts.push({ d: arms.trim(), stroke: ln, w: 0.8, op: 0.45 });
  // Suckers.
  const rnd = seeded(seed + ':oc');
  for (let i = 0; i < 14; i++) { const x = 30 + rnd() * 66, y = 50 + rnd() * 12; parts.push({ d: circ(x, y, 0.9), fill: o.suckers || '#F7D9C9', op: 0.9 }); }
  const head = P('M', 40, 46, 'C', 34, 32, 40, 10, 63, 10, 'C', 86, 10, 92, 32, 86, 46, 'C', 78, 52, 48, 52, 40, 46, 'Z');
  if (o.kind === 'kraken') {
    // Two giant arms rearing up behind it, suckers and all.
    const big = P('M', 42, 50, 'C', 20, 56, 4, 40, 10, 20, 'C', 14, 8, 26, 6, 28, 16, 'C', 30, 24, 22, 26, 20, 20, 'M', 84, 50, 'C', 106, 56, 118, 40, 112, 20, 'C', 108, 8, 96, 6, 94, 16, 'C', 92, 24, 100, 26, 102, 20);
    parts.unshift({ d: big, stroke: ln, w: 1.2, op: 0.6 });
    parts.unshift({ d: big, stroke: col, w: 7 });
    for (const [x, y] of [[12, 32], [10, 24], [16, 14], [110, 32], [112, 24], [106, 14]]) parts.push({ d: circ(x, y, 1.2), fill: o.suckers || '#F7D9C9' });
  }
  // A dumbo's ear-like fins.
  if (o.kind === 'dumbo') parts.push({ d: P('M', 44, 22, 'C', 30, 10, 24, 22, 32, 30, 'C', 36, 32, 42, 30, 44, 28, 'Z', 'M', 82, 22, 'C', 96, 10, 102, 22, 94, 30, 'C', 90, 32, 84, 30, 82, 28, 'Z'), fill: shade(col, 0.88), stroke: ln, w: 1.2 });
  parts.push({ d: head, fill: col });
  for (let i = 0; i < 10; i++) parts.push({ d: circ(46 + rnd() * 36, 14 + rnd() * 24, 1 + rnd() * 1.6), fill: shade(col, 0.75), op: 0.6, clip: head });
  parts.push({ d: P('M', 48, 18, 'Q', 62, 10, 76, 17, 'Q', 62, 14, 48, 18, 'Z'), fill: '#FFFFFF', op: 0.35 });
  parts.push({ d: head, stroke: ln, w: 1.6 });
  const iris = o.kind === 'kraken' ? '#C9A21B' : undefined;
  parts.push(...eye(54, 36, 4.2, iris), ...eye(72, 36, 4.2, iris), blush(50, 43, 2.6), blush(76, 43, 2.6));
  parts.push({ d: P('M', 60, 44, 'q', 3, 3, 6, 0), stroke: ln, w: 1.3 });
  return parts;
}

function crab(o, seed) {
  const col = o.body, ln = shade(col, 0.55);
  const parts = [];
  const legLen = o.longLegs ? 1.7 : 1;
  let legs = '';
  for (let i = 0; i < 4; i++) {
    const y = 44 + i * 3;
    legs += ' ' + P('M', 44, y, 'L', 44 - 10 * legLen, y + 4 + i, 'L', 44 - 14 * legLen, y + 12 * legLen + i);
    legs += ' ' + P('M', 76, y, 'L', 76 + 10 * legLen, y + 4 + i, 'L', 76 + 14 * legLen, y + 12 * legLen + i);
  }
  parts.push({ d: legs.trim(), stroke: shade(col, 0.85), w: 3 });
  parts.push({ d: legs.trim(), stroke: ln, w: 0.6, op: 0.6 });
  // Claws up front.
  const claw = (x, dir) => [
    { d: P('M', x, 38, 'L', x + dir * 10, 28, 'L', x + dir * 12, 22), stroke: shade(col, 0.85), w: 4 },
    { d: P('M', x + dir * 12, 24, 'C', x + dir * 4, 18, x + dir * 6, 6, x + dir * 14, 6, 'C', x + dir * 20, 6, x + dir * 22, 14, x + dir * 18, 18, 'L', x + dir * 14, 14, 'L', x + dir * 16, 22, 'Z'), fill: o.claw || col, stroke: ln, w: 1.3 },
  ];
  parts.push(...claw(46, -1), ...claw(74, 1));
  const shell = o.longLegs
    ? P('M', 40, 42, 'C', 40, 28, 50, 24, 60, 24, 'C', 70, 24, 80, 28, 80, 42, 'C', 80, 52, 70, 56, 60, 56, 'C', 50, 56, 40, 52, 40, 42, 'Z')
    : P('M', 26, 36, 'L', 40, 30, 'C', 50, 26, 70, 26, 80, 30, 'L', 94, 36, 'L', 82, 40, 'C', 80, 50, 70, 56, 60, 56, 'C', 50, 56, 40, 50, 38, 40, 'Z');
  parts.push({ d: shell, fill: col });
  const rnd = seeded(seed + ':crab');
  for (let i = 0; i < 10; i++) parts.push({ d: circ(44 + rnd() * 32, 30 + rnd() * 20, 0.9 + rnd() * 1.4), fill: o.spots || '#FFFFFF', op: 0.7, clip: shell });
  parts.push({ d: P('M', 46, 32, 'Q', 60, 27, 74, 32, 'Q', 60, 30, 46, 32, 'Z'), fill: '#FFFFFF', op: 0.35 });
  parts.push({ d: shell, stroke: ln, w: 1.6 });
  // Eyes on stalks.
  parts.push({ d: P('M', 54, 30, 'L', 53, 22, 'M', 66, 30, 'L', 67, 22), stroke: ln, w: 1.6 });
  parts.push(...eye(53, 21, 3.2), ...eye(67, 21, 3.2), blush(50, 40, 2.6), blush(70, 40, 2.6));
  parts.push({ d: P('M', 57, 44, 'q', 3, 3, 6, 0), stroke: ln, w: 1.3 });
  return parts;
}

function lobster(o, seed) {
  const col = o.body, ln = shade(col, 0.55);
  const parts = [];
  parts.push({ d: P('M', 30, 34, 'C', 18, 20, 8, 14, 2, 4, 'M', 30, 38, 'C', 16, 32, 8, 30, 2, 26), stroke: ln, w: 1 });
  // Big claws forward.
  parts.push({ d: P('M', 34, 34, 'L', 24, 24, 'M', 34, 46, 'L', 24, 56), stroke: shade(col, 0.85), w: 4 });
  parts.push({ d: P('M', 26, 26, 'C', 14, 30, 6, 22, 8, 14, 'C', 12, 10, 20, 12, 22, 16, 'L', 16, 18, 'L', 26, 22, 'Z'), fill: col, stroke: ln, w: 1.2 });
  parts.push({ d: P('M', 26, 54, 'C', 14, 50, 6, 58, 8, 66, 'C', 12, 70, 20, 68, 22, 64, 'L', 16, 62, 'L', 26, 58, 'Z'), fill: col, stroke: ln, w: 1.2 });
  let legs = '';
  for (let i = 0; i < 4; i++) legs += ' ' + P('M', 44 + i * 5, 46, 'l', -2, 8, 'M', 44 + i * 5, 34, 'l', -2, -8);
  parts.push({ d: legs.trim(), stroke: ln, w: 1.5 });
  const head = P('M', 30, 40, 'C', 30, 32, 40, 30, 62, 31, 'L', 62, 49, 'C', 40, 50, 30, 48, 30, 40, 'Z');
  parts.push({ d: head, fill: col, stroke: ln, w: 1.4 });
  for (let i = 0; i < 5; i++) { const x = 62 + i * 8; parts.push({ d: P('M', x, 32 + i * 0.6, 'Q', x + 4, 30 + i * 0.6, x + 9, 32.5 + i * 0.8, 'L', x + 9, 47.5 - i * 0.8, 'Q', x + 4, 50 - i * 0.6, x, 48 - i * 0.6, 'Z'), fill: shade(col, i % 2 ? 0.92 : 1), stroke: ln, w: 1.1 }); }
  parts.push({ d: P('M', 102, 36, 'L', 114, 28, 'Q', 118, 40, 114, 52, 'L', 102, 44, 'Z'), fill: shade(col, 0.9), stroke: ln, w: 1.2 });
  parts.push({ d: P('M', 34, 34, 'Q', 50, 31, 60, 33), stroke: '#FFFFFF', w: 2, op: 0.35 });
  parts.push(...eye(36, 35, 3));
  void seed;
  return parts;
}

function shrimp(o, seed) {
  const col = o.body, ln = shade(col, 0.55);
  const parts = [];
  parts.push({ d: P('M', 30, 36, 'C', 18, 20, 10, 18, 4, 22, 'M', 30, 38, 'C', 14, 30, 8, 36, 2, 40), stroke: ln, w: 0.9 });
  let legs = '';
  for (let i = 0; i < 6; i++) legs += ' ' + P('M', 40 + i * 7, 46 + Math.sin(i / 2) * 2, 'l', -1, 7);
  parts.push({ d: legs.trim(), stroke: shade(col, 0.75), w: 1.6 });
  // A curled back of segments ending in a fan tail.
  const segs = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (1.05 - i * 0.13), r = 24, cx = 60, cy = 52;
    segs.push([cx + Math.cos(a) * r, cy - Math.sin(a) * r]);
  }
  parts.push({ d: P('M', 82, 58, 'L', 92, 52, 'Q', 98, 62, 92, 72, 'L', 84, 64, 'Z'), fill: shade(col, 0.9), stroke: ln, w: 1.1 });
  const body = P('M', 30, 40, 'C', 30, 26, 48, 22, 62, 26, 'C', 76, 30, 86, 44, 84, 60, 'L', 78, 62, 'C', 76, 50, 70, 44, 60, 44, 'C', 48, 44, 40, 46, 30, 40, 'Z');
  parts.push({ d: body, fill: col });
  let rings = '';
  for (let i = 1; i < 6; i++) { const x = 40 + i * 7.5; rings += ' ' + P('M', x, 26 + Math.abs(i - 3) * 0.8 - (i > 3 ? -i : 0), 'Q', x + 3, 36, x - 1, 45); }
  parts.push({ d: rings.trim(), stroke: ln, w: 0.9, op: 0.55, clip: body });
  parts.push({ d: P('M', 36, 32, 'Q', 56, 22, 76, 34, 'Q', 56, 27, 36, 32, 'Z'), fill: '#FFFFFF', op: 0.35 });
  parts.push({ d: body, stroke: ln, w: 1.4 });
  parts.push(...eye(34, 33, 3.2));
  void segs; void seed;
  return parts;
}

function starfish(o, seed) {
  const cx = 60, cy = 42, R = 30, r = 12;
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const k = i % 2 ? r : R; pts.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k]); }
  const body = smooth(pts);
  const parts = [{ d: body, fill: o.body }];
  const rnd = seeded(seed + ':st');
  for (let i = 0; i < 30; i++) { const a = rnd() * Math.PI * 2, k = rnd() * R * 0.9; parts.push({ d: circ(cx + Math.cos(a) * k, cy + Math.sin(a) * k, 0.8 + rnd()), fill: o.dots || '#FFE3B3', op: 0.9, clip: body }); }
  parts.push({ d: body, stroke: shade(o.body, 0.55), w: 1.6 });
  parts.push(...eye(cx - 5, cy - 3, 3.2), ...eye(cx + 5, cy - 3, 3.2), blush(cx - 8, cy + 3, 2.2), blush(cx + 8, cy + 3, 2.2));
  parts.push({ d: P('M', cx - 2.5, cy + 3, 'q', 2.5, 2.5, 5, 0), stroke: shade(o.body, 0.5), w: 1.2 });
  return parts;
}

function urchin(o, seed) {
  const cx = 60, cy = 42, r = 16;
  let sp = '';
  const rnd = seeded(seed + ':ur');
  for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2 + rnd() * 0.1, l = r + 9 + rnd() * 8; sp += ' ' + P('M', cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), 'L', cx + Math.cos(a) * l, cy + Math.sin(a) * l); }
  return [{ d: sp.trim(), stroke: o.spine || shade(o.body, 0.8), w: 1.3 }, { d: circ(cx, cy, r), fill: o.body, stroke: shade(o.body, 0.6), w: 1.4 },
    { d: P('M', cx - 9, cy - 9, 'Q', cx, cy - 15, cx + 8, cy - 10, 'Q', cx, cy - 12, cx - 9, cy - 9, 'Z'), fill: '#FFFFFF', op: 0.3 },
    ...eye(cx - 5, cy - 1, 3), ...eye(cx + 5, cy - 1, 3), blush(cx - 8, cy + 5, 2), blush(cx + 8, cy + 5, 2)];
}

function jelly(o, seed) {
  const col = o.body;
  const parts = [];
  // A moonlit one: a soft glow round it and a crescent over it.
  if (o.glow) parts.push(...[1.3, 1.1, 0.9].map((k) => ({ d: ell(60, 38, 34 * k, 34 * k), fill: o.glow, op: 0.12 })));
  if (o.moon) parts.push({ d: P('M', 100, 3, 'A', 9, 9, 0, 1, 0, 110, 19, 'A', 7, 7, 0, 1, 1, 100, 3, 'Z'), fill: '#FFF3B0', stroke: '#E0C060', w: 0.8 }, ...sparkles(seed, 3));
  let tent = '';
  const rnd = seeded(seed + ':je');
  for (let i = 0; i < 7; i++) { const x = 42 + i * 6; tent += ' ' + P('M', x, 44, 'C', x - 4 + rnd() * 3, 54, x + 4, 62, x - 2 + rnd() * 4, 76); }
  parts.push({ d: tent.trim(), stroke: shade(col, 0.9), w: 1.5, op: 0.8 });
  parts.push({ d: P('M', 52, 44, 'C', 48, 54, 56, 58, 52, 68, 'M', 62, 44, 'C', 66, 54, 58, 60, 64, 70), stroke: shade(col, 0.8), w: 3, op: 0.7 });
  const bell = P('M', 34, 44, 'C', 32, 22, 46, 12, 60, 12, 'C', 74, 12, 88, 22, 86, 44, 'Q', 82, 48, 78, 44, 'Q', 74, 48, 70, 44, 'Q', 66, 48, 62, 44, 'Q', 58, 48, 54, 44, 'Q', 50, 48, 46, 44, 'Q', 42, 48, 38, 44, 'Q', 36, 46, 34, 44, 'Z');
  parts.push({ d: bell, fill: col, op: 0.75 });
  parts.push({ d: P('M', 46, 34, 'C', 50, 26, 70, 26, 74, 34, 'C', 70, 38, 50, 38, 46, 34, 'Z'), fill: shade(col, 0.8), op: 0.5 });
  parts.push({ d: P('M', 42, 24, 'Q', 56, 12, 72, 18, 'Q', 56, 16, 42, 24, 'Z'), fill: '#FFFFFF', op: 0.5 });
  parts.push({ d: bell, stroke: shade(col, 0.6), w: 1.3 });
  parts.push(...eye(52, 32, 3), ...eye(68, 32, 3), blush(48, 38, 2.2), blush(72, 38, 2.2));
  return parts;
}

function turtle(o, seed) {
  const col = o.body, shell = o.shell || shade(col, 0.75), ln = shade(col, 0.5);
  const parts = [];
  parts.push({ d: P('M', 44, 32, 'C', 36, 18, 26, 14, 20, 18, 'C', 24, 26, 34, 32, 42, 36, 'Z'), fill: col, stroke: ln, w: 1.2 });
  parts.push({ d: P('M', 44, 50, 'C', 36, 62, 28, 66, 22, 62, 'C', 26, 54, 34, 50, 42, 46, 'Z'), fill: col, stroke: ln, w: 1.2 });
  parts.push({ d: P('M', 86, 34, 'q', 10, -6, 14, -2, 'q', -4, 6, -12, 6, 'Z', 'M', 86, 48, 'q', 10, 6, 14, 2, 'q', -4, -6, -12, -6, 'Z'), fill: col, stroke: ln, w: 1.1 });
  parts.push({ d: P('M', 34, 40, 'C', 30, 34, 24, 33, 18, 36, 'C', 12, 39, 12, 45, 18, 47, 'C', 24, 49, 30, 46, 34, 42, 'Z'), fill: col, stroke: ln, w: 1.3 });
  const sh = ell(64, 41, 26, 16);
  parts.push({ d: sh, fill: shell });
  // Plates.
  let pl = P('M', 64, 30, 'L', 74, 36, 'L', 74, 46, 'L', 64, 52, 'L', 54, 46, 'L', 54, 36, 'Z');
  pl += ' ' + P('M', 54, 36, 'L', 42, 34, 'M', 54, 46, 'L', 42, 48, 'M', 74, 36, 'L', 86, 34, 'M', 74, 46, 'L', 86, 48, 'M', 64, 30, 'L', 64, 25, 'M', 64, 52, 'L', 64, 57);
  parts.push({ d: pl, stroke: shade(shell, 0.6), w: 1.2, clip: sh });
  parts.push({ d: P('M', 46, 32, 'Q', 64, 22, 82, 32, 'Q', 64, 27, 46, 32, 'Z'), fill: '#FFFFFF', op: 0.3 });
  parts.push({ d: sh, stroke: ln, w: 1.6 });
  parts.push(...eye(20, 39, 2.8), blush(23, 44, 1.8));
  parts.push({ d: P('M', 13, 42, 'q', 2, 1.5, 4, 0.5), stroke: ln, w: 1.1 });
  if (o.rabbit) {
    // 별주부's passenger: a white rabbit sitting on the shell.
    parts.push({ d: ell(57, 3, 1.8, 6) + ' ' + ell(62, 2, 1.8, 6.5), fill: '#FFFFFF', stroke: '#9AA0AE', w: 0.9 });
    parts.push({ d: ell(66, 21, 8, 6.5), fill: '#FFFFFF', stroke: '#9AA0AE', w: 1 }, { d: circ(59, 13, 5.5), fill: '#FFFFFF', stroke: '#9AA0AE', w: 1 });
    parts.push({ d: ell(57, 3, 0.8, 4) + ' ' + ell(62, 2, 0.8, 4.5), fill: '#FFB3C1' });
    parts.push(...eye(57, 12, 1.8), blush(58, 16, 1.4), { d: circ(54, 14, 0.9), fill: '#FF8FA3' });
  }
  if (o.sparkle) parts.push(...sparkles(seed, 5));
  return parts;
}

function whale(o, seed) {
  const col = o.body, ln = shade(col, 0.5);
  const parts = [];
  parts.push({ d: P('M', 92, 40, 'C', 100, 34, 104, 26, 104, 18, 'C', 110, 22, 118, 22, 118, 14, 'C', 120, 26, 112, 32, 102, 34, 'C', 108, 30, 100, 40, 94, 44, 'Z'), fill: col, stroke: ln, w: 1.3 });
  const body = P('M', 10, 44, 'C', 8, 26, 26, 18, 48, 20, 'C', 70, 22, 88, 30, 98, 38, 'C', 92, 48, 76, 60, 50, 62, 'C', 26, 64, 12, 58, 10, 44, 'Z');
  parts.push({ d: body, fill: col });
  parts.push({ d: P('M', 6, 48, 'C', 30, 50, 60, 52, 100, 40, 'V', 80, 'H', 6, 'Z'), fill: o.belly || '#E8F1F8', clip: body });
  let grooves = '';
  for (let i = 0; i < 5; i++) grooves += ' ' + P('M', 16 + i * 2, 52 + i * 1.6, 'Q', 34, 56 + i * 1.4, 54, 55 + i * 1.2);
  parts.push({ d: grooves.trim(), stroke: shade(o.belly || '#E8F1F8', 0.8), w: 0.9, clip: body });
  parts.push({ d: P('M', 18, 28, 'Q', 44, 18, 70, 26, 'Q', 44, 23, 18, 28, 'Z'), fill: '#FFFFFF', op: 0.3 });
  parts.push({ d: body, stroke: ln, w: 1.6 });
  parts.push({ d: P('M', 44, 52, 'C', 50, 58, 56, 64, 62, 64, 'C', 58, 58, 54, 54, 50, 50, 'Z'), fill: shade(col, 0.9), stroke: ln, w: 1.1 });
  // A little spout.
  parts.push({ d: P('M', 30, 19, 'Q', 26, 8, 20, 6, 'M', 30, 19, 'Q', 30, 6, 32, 2, 'M', 30, 19, 'Q', 36, 8, 42, 7), stroke: '#9AD4F5', w: 2, op: 0.9 });
  parts.push(...eye(24, 42, 3.4), blush(28, 49, 2.6));
  parts.push({ d: P('M', 11, 47, 'Q', 18, 52, 26, 50), stroke: ln, w: 1.2 });
  if (o.sparkle) parts.push(...sparkles(seed, 4));
  return parts;
}

function seahorse(o, seed) {
  const col = o.body, ln = shade(col, 0.55);
  const body = P('M', 56, 18, 'C', 66, 16, 72, 24, 68, 32, 'C', 66, 40, 72, 48, 70, 56, 'C', 68, 64, 60, 70, 58, 64, 'C', 56, 60, 64, 60, 64, 56, 'C', 62, 50, 56, 46, 56, 38, 'C', 54, 32, 50, 30, 46, 30, 'L', 38, 28, 'L', 38, 24, 'L', 46, 23, 'C', 48, 19, 52, 18, 56, 18, 'Z');
  const parts = [];
  // A sea dragon's leafy flaps, all round it.
  if (o.leaves) {
    const cols = [].concat(o.leaves);
    [[50, 28, -12, -10], [44, 24, -8, -14], [62, 22, 10, -10], [70, 34, 14, -4], [72, 48, 14, 2], [70, 58, 12, 10], [60, 66, 4, 12], [56, 44, -12, 4], [40, 28, -8, 8]].forEach(([x, y, dx, dy], i) => {
      const c = cols[i % cols.length];
      parts.push({ d: P('M', x, y, 'Q', x + dx * 0.3 - dy * 0.3, y + dy * 0.3 + dx * 0.3, x + dx, y + dy, 'Q', x + dx * 0.7 + dy * 0.3, y + dy * 0.7 - dx * 0.3, x, y, 'Z'), fill: c, stroke: shade(c, 0.6), w: 0.8 });
    });
  }
  parts.push({ d: P('M', 64, 36, 'q', 8, 2, 8, 8, 'q', -5, 0, -8, -3, 'Z'), fill: o.fin || shade(col, 0.85), stroke: ln, w: 1 }, { d: body, fill: col });
  let rings = '';
  for (let i = 0; i < 7; i++) rings += ' ' + P('M', 56 + i * 0.6, 36 + i * 4, 'L', 70, 36 + i * 4);
  parts.push({ d: rings.trim(), stroke: ln, w: 0.8, op: 0.5, clip: body });
  parts.push({ d: P('M', 54, 16, 'L', 56, 10, 'L', 58, 15, 'L', 61, 11, 'L', 62, 17, 'Z'), fill: shade(col, 0.85), stroke: ln, w: 0.9 });
  parts.push({ d: body, stroke: ln, w: 1.5 });
  parts.push(...eye(54, 23, 3), blush(56, 28, 1.8));
  if (o.sparkle) parts.push(...sparkles(seed, 4));
  return parts;
}

function shell(o, seed) {
  const col = o.body, ln = shade(col, 0.55);
  if (o.kind === 'mussel' || o.kind === 'pen') {
    // Long ones: a mussel's dark tear-drop, a pen shell's wide fan.
    const sh = o.kind === 'mussel'
      ? P('M', 24, 50, 'C', 22, 40, 34, 26, 58, 22, 'C', 82, 18, 100, 26, 98, 38, 'C', 96, 50, 72, 58, 44, 58, 'C', 32, 58, 25, 56, 24, 50, 'Z')
      : P('M', 22, 46, 'L', 96, 18, 'C', 104, 30, 104, 56, 96, 66, 'Z');
    const parts = [{ d: sh, fill: col }];
    let lines = '';
    for (let i = 1; i < 5; i++) lines += ' ' + (o.kind === 'mussel' ? P('M', 26, 50, 'Q', 60, 50 - i * 7, 98 - i * 2, 36 - i * 2) : P('M', 24, 46, 'Q', 70, 30 + i * 6, 100, 18 + i * 10));
    parts.push({ d: lines.trim(), stroke: o.bands || shade(col, 1.4), w: 1.1, op: 0.6, clip: sh });
    parts.push({ d: P('M', 40, 34, 'Q', 60, 24, 84, 26, 'Q', 60, 28, 40, 34, 'Z'), fill: '#FFFFFF', op: 0.3, clip: sh });
    parts.push({ d: sh, stroke: ln, w: 1.6 });
    parts.push(...eye(50, 42, 3), ...eye(64, 40, 3), blush(46, 48, 2), blush(68, 46, 2));
    return parts;
  }
  const sh = P('M', 30, 52, 'C', 28, 30, 44, 18, 60, 18, 'C', 76, 18, 92, 30, 90, 52, 'Q', 60, 60, 30, 52, 'Z');
  const parts = [{ d: P('M', 50, 54, 'L', 54, 62, 'L', 66, 62, 'L', 70, 54, 'Z'), fill: shade(col, 0.85), stroke: ln, w: 1.1 }, { d: sh, fill: col }];
  // A scallop's two ears at the hinge; a cockle's many deep ribs.
  if (o.kind === 'scallop') parts.unshift({ d: P('M', 46, 52, 'L', 40, 62, 'L', 54, 62, 'Z', 'M', 74, 52, 'L', 80, 62, 'L', 66, 62, 'Z'), fill: shade(col, 0.9), stroke: ln, w: 1.1 });
  const rib = o.kind === 'cockle' ? 6 : 3;
  let ridges = '';
  for (let i = -rib; i <= rib; i++) ridges += ' ' + P('M', 60, 58, 'L', 60 + i * (27 / rib), 20 + Math.abs(i) * (9 / rib));
  parts.push({ d: ridges.trim(), stroke: shade(col, 0.7), w: o.kind === 'cockle' ? 1.8 : 1.2, clip: sh });
  if (o.bands) for (let i = 0; i < 3; i++) parts.push({ d: P('M', 20, 28 + i * 9, 'Q', 60, 20 + i * 9, 100, 28 + i * 9, 'V', 32 + i * 9, 'Q', 60, 24 + i * 9, 20, 32 + i * 9, 'Z'), fill: o.bands, op: 0.6, clip: sh });
  parts.push({ d: sh, stroke: ln, w: 1.6 });
  if (o.pearl) parts.push({ d: circ(60, 56, 10), fill: '#FFF8DC', op: 0.4 }, { d: circ(60, 56, 6), fill: '#FBF7F0', stroke: '#D9CFC2', w: 1 }, { d: circ(58, 54, 2), fill: '#FFFFFF' }, ...sparkles(seed, 3));
  parts.push(...eye(52, 40, 3), ...eye(68, 40, 3), blush(48, 46, 2), blush(72, 46, 2));
  return parts;
}

// A sea cucumber: a soft bumpy sausage with a crown of feelers.
function cucumber(o, seed) {
  const col = o.body, ln = shade(col, 0.55), rnd = seeded(seed + ':cu');
  const body = smooth([[18, 42], [24, 30], [44, 26], [70, 27], [92, 30], [104, 38], [102, 48], [86, 54], [60, 55], [36, 54], [22, 50]]);
  let bumps = '';
  for (let i = 0; i < 9; i++) { const x = 28 + i * 8.5, y = 29 - Math.sin((i / 8) * Math.PI) * 2.5; bumps += ' ' + P('M', x - 3, y + 2, 'Q', x, y - 6 - rnd() * 2, x + 3, y + 2, 'Z'); }
  const parts = [{ d: bumps.trim(), fill: shade(col, 0.85), stroke: ln, w: 0.8 }, { d: body, fill: col }];
  parts.push({ d: P('M', 18, 46, 'Q', 60, 50, 106, 44, 'V', 60, 'H', 18, 'Z'), fill: o.belly || shade(col, 1.3), clip: body });
  for (let i = 0; i < 16; i++) parts.push({ d: circ(26 + rnd() * 74, 32 + rnd() * 14, 0.8 + rnd() * 1.2), fill: shade(col, 0.7), op: 0.7, clip: body });
  parts.push({ d: P('M', 30, 32, 'Q', 60, 26, 92, 33, 'Q', 60, 30, 30, 32, 'Z'), fill: '#FFFFFF', op: 0.25 }, { d: body, stroke: ln, w: 1.5 });
  parts.push({ d: P('M', 19, 40, 'q', -5, -4, -8, -2, 'M', 19, 43, 'q', -6, 0, -9, 3, 'M', 20, 46, 'q', -4, 3, -6, 7), stroke: shade(col, 0.8), w: 1.6 });
  parts.push(...eye(30, 38, 2.8), blush(33, 44, 2));
  return parts;
}

// A sea squirt: a knobbly orange lump with two little chimneys, one + and one −.
function squirt(o, seed) {
  const col = o.body, ln = shade(col, 0.55), rnd = seeded(seed + ':sq2');
  const pts = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, k = i % 2 ? 1.07 : 0.97; pts.push([60 + Math.cos(a) * 27 * k, 48 + Math.sin(a) * 24 * k]); }
  const body = smooth(pts);
  const parts = [{ d: P('M', 46, 28, 'L', 44, 12, 'L', 53, 12, 'L', 54, 27, 'Z', 'M', 67, 27, 'L', 69, 10, 'L', 78, 11, 'L', 76, 29, 'Z'), fill: shade(col, 0.9), stroke: ln, w: 1.2 },
    { d: P('M', 46, 12, 'L', 51, 12, 'M', 48.5, 9.5, 'L', 48.5, 14.5, 'M', 71, 10.5, 'L', 76, 10.5), stroke: ln, w: 1.3 }, { d: body, fill: col }];
  for (let i = 0; i < 22; i++) { const a = rnd() * Math.PI * 2, k = Math.sqrt(rnd()) * 0.9, x = 60 + Math.cos(a) * 25 * k, y = 48 + Math.sin(a) * 22 * k; parts.push({ d: P('M', x - 2, y + 1.5, 'L', x, y - 2.5, 'L', x + 2, y + 1.5, 'Z'), fill: shade(col, 0.82), clip: body }); }
  parts.push({ d: P('M', 40, 34, 'Q', 56, 24, 72, 30, 'Q', 56, 29, 40, 34, 'Z'), fill: '#FFFFFF', op: 0.3 }, { d: body, stroke: ln, w: 1.6 });
  parts.push(...eye(52, 46, 3.2), ...eye(68, 46, 3.2), blush(48, 53, 2.2), blush(72, 53, 2.2), { d: P('M', 57, 54, 'q', 3, 3, 6, 0), stroke: ln, w: 1.2 });
  return parts;
}

// Whales and dolphins with their own fins: a dolphin's beak, an orca's white patches, a narwhal's
// tusk, a galaxy whale's stars.
function cetacean(o, seed) {
  const col = o.body, ln = shade(col, 0.5), kind = o.kind || 'dolphin', rnd = seeded(seed + ':ce');
  const parts = [];
  if (kind === 'galaxy') parts.push(...[1.3, 1.1, 0.9].map((k) => ({ d: ell(56, 40, 54 * k, 26 * k), fill: '#B9A8FF', op: 0.1 })));
  parts.push({ d: P('M', 94, 40, 'C', 100, 34, 106, 26, 113, 21, 'C', 113, 30, 110, 36, 104, 40, 'C', 110, 44, 113, 50, 113, 59, 'C', 106, 54, 100, 46, 94, 42, 'Z'), fill: col, stroke: ln, w: 1.3 });
  const body = kind === 'dolphin'
    ? P('M', 6, 45, 'L', 16, 42, 'C', 20, 30, 40, 24, 60, 26, 'C', 78, 28, 90, 34, 98, 40, 'C', 90, 48, 74, 56, 52, 56, 'C', 36, 56, 22, 52, 16, 47, 'L', 6, 47, 'Z')
    : P('M', 14, 44, 'C', 12, 30, 28, 24, 48, 25, 'C', 70, 26, 88, 33, 98, 40, 'C', 90, 48, 72, 58, 48, 58, 'C', 28, 58, 16, 54, 14, 44, 'Z');
  const dh = { orca: 22, dolphin: 12, galaxy: 10 }[kind] || 0;
  if (dh) parts.push({ d: P('M', 48, 27, 'C', 52, 22, 56, 26 - dh, 63, 24 - dh, 'C', 60, 18, 62, 24, 70, 28, 'Z'), fill: shade(col, 0.9), stroke: ln, w: 1.2 });
  if (kind === 'narwhal') parts.push({ d: P('M', 16, 38, 'L', 1, 22, 'L', 17, 41, 'Z'), fill: '#F4EEDC', stroke: '#B8AE90', w: 0.9 }, { d: P('M', 13, 36, 'l', -2, -1, 'M', 9, 32, 'l', -2, -1, 'M', 6, 28, 'l', -2, -1), stroke: '#B8AE90', w: 0.8 });
  parts.push({ d: body, fill: col });
  parts.push({ d: P('M', 4, 47, 'C', 30, 51, 60, 55, 100, 41, 'V', 80, 'H', 4, 'Z'), fill: o.belly || '#EEF3F7', clip: body });
  if (kind === 'orca') parts.push({ d: ell(32, 36, 7, 3.5), fill: '#FFFFFF', clip: body }, { d: P('M', 58, 54, 'Q', 72, 44, 86, 46, 'Q', 76, 52, 62, 58, 'Z'), fill: '#FFFFFF', clip: body });
  if (o.spots) for (let i = 0; i < 18; i++) parts.push({ d: circ(24 + rnd() * 70, 28 + rnd() * 18, 0.9 + rnd() * 1.4), fill: o.spots, op: 0.7, clip: body });
  if (kind === 'galaxy') {
    parts.push({ d: P('M', 16, 44, 'C', 40, 30, 70, 34, 98, 40, 'C', 70, 42, 40, 40, 16, 50, 'Z'), fill: '#C9B8FF', op: 0.35, clip: body });
    for (let i = 0; i < 24; i++) parts.push({ ...star(18 + rnd() * 78, 28 + rnd() * 26, 0.8 + rnd() * 1.6, i % 3 ? '#FFFFFF' : '#FFE38A'), op: 0.9, clip: body });
    parts.push({ d: P('M', 40, 32, 'L', 52, 36, 'L', 62, 31, 'L', 74, 38), stroke: '#FFFFFF', w: 0.6, op: 0.7 });
  }
  parts.push({ d: P('M', 20, 30, 'Q', 46, 20, 72, 28, 'Q', 46, 25, 20, 30, 'Z'), fill: '#FFFFFF', op: 0.28 }, { d: body, stroke: ln, w: 1.6 });
  parts.push({ d: P('M', 42, 52, 'C', 48, 58, 54, 64, 60, 64, 'C', 56, 58, 52, 54, 48, 50, 'Z'), fill: shade(col, 0.9), stroke: ln, w: 1.1 });
  parts.push(...eye(kind === 'dolphin' ? 24 : 26, 41, 3.2, kind === 'galaxy' ? '#3E2E8C' : undefined), blush(29, 48, 2.6));
  parts.push({ d: kind === 'dolphin' ? P('M', 7, 46, 'Q', 14, 49, 20, 47) : P('M', 15, 47, 'Q', 22, 52, 30, 50), stroke: ln, w: 1.2 });
  if (kind === 'galaxy') parts.push(...sparkles(seed, 6, '#FFE38A'));
  return parts;
}

// A horseshoe crab from above: a round helmet, a spiny back half, a long tail spike.
function horseshoe(o) {
  const col = o.body, ln = shade(col, 0.55);
  const helmet = P('M', 62, 16, 'C', 34, 8, 12, 24, 12, 42, 'C', 12, 60, 34, 76, 62, 68, 'Q', 57, 42, 62, 16, 'Z');
  const back = P('M', 60, 24, 'L', 84, 30, 'L', 87, 42, 'L', 84, 54, 'L', 60, 60, 'Q', 56, 42, 60, 24, 'Z');
  return [{ d: P('M', 85, 40, 'L', 118, 39, 'L', 118, 41.5, 'L', 85, 45, 'Z'), fill: shade(col, 0.8), stroke: ln, w: 1 },
    { d: P('M', 66, 26, 'l', 2, -5, 'l', 2, 6, 'M', 74, 28, 'l', 2, -5, 'l', 2, 6, 'M', 66, 58, 'l', 2, 5, 'l', 2, -6, 'M', 74, 56, 'l', 2, 5, 'l', 2, -6), stroke: ln, w: 1 },
    { d: back, fill: shade(col, 0.9), stroke: ln, w: 1.3 }, { d: helmet, fill: col },
    { d: P('M', 22, 42, 'Q', 40, 41, 60, 42, 'M', 30, 30, 'Q', 44, 34, 58, 32, 'M', 30, 54, 'Q', 44, 50, 58, 52), stroke: ln, w: 1, op: 0.6, clip: helmet },
    { d: P('M', 22, 30, 'Q', 34, 18, 52, 18, 'Q', 34, 22, 22, 30, 'Z'), fill: '#FFFFFF', op: 0.3 }, { d: helmet, stroke: ln, w: 1.6 },
    ...eye(36, 34, 2.8), ...eye(36, 50, 2.8)];
}

// A nautilus: a striped coil of a shell, its hood and feelers out of the opening.
function nautilus(o) {
  const col = o.body, ln = shade(col, 0.55), sh = circ(66, 40, 25);
  const parts = [{ d: P('M', 44, 34, 'C', 30, 32, 24, 40, 26, 50, 'L', 46, 52, 'Z'), fill: '#E8B8A0', stroke: shade('#E8B8A0', 0.6), w: 1.1 }];
  let tent = '';
  for (let i = 0; i < 6; i++) tent += ' ' + P('M', 30, 40 + i * 2, 'Q', 18, 38 + i * 3, 8 + (i % 2) * 3, 36 + i * 4);
  parts.push({ d: tent.trim(), stroke: '#D8A088', w: 1.4 }, { d: sh, fill: col });
  let st = '';
  for (let i = 0; i < 6; i++) st += ' ' + P('M', 50 + i * 6, 15, 'Q', 66 + i * 6, 32, 56 + i * 5, 66);
  parts.push({ d: st.trim(), stroke: o.bands || '#B4603E', w: 3.5, op: 0.85, clip: sh });
  parts.push({ d: circ(74, 37, 9), fill: shade(col, 0.92), stroke: ln, w: 1.2 }, { d: circ(76, 36, 4), fill: shade(col, 0.8), stroke: ln, w: 1 });
  parts.push({ d: P('M', 50, 22, 'Q', 66, 12, 82, 20, 'Q', 66, 17, 50, 22, 'Z'), fill: '#FFFFFF', op: 0.35 }, { d: sh, stroke: ln, w: 1.6 });
  parts.push(...eye(37, 40, 3));
  return parts;
}

// A sea snail's spiral cone (소라 with its spikes, 다슬기 long and dark), or a hermit crab in one.
function snail(o, seed) {
  const col = o.body, ln = shade(col, 0.55), conch = o.kind === 'conch', crab = o.kind === 'hermit';
  const sh = o.kind === 'melania'
    ? P('M', 36, 52, 'C', 34, 40, 46, 32, 60, 32, 'L', 104, 38, 'Q', 106, 42, 104, 46, 'L', 60, 58, 'C', 50, 60, 38, 60, 36, 52, 'Z')
    : P('M', 30, 54, 'C', 28, 36, 44, 24, 62, 24, 'L', 100, 34, 'Q', 104, 40, 100, 46, 'L', 62, 60, 'C', 48, 64, 32, 62, 30, 54, 'Z');
  const parts = [];
  if (crab) {
    const c = o.crab || '#E8785A', cl = shade(c, 0.6);
    parts.push({ d: P('M', 30, 56, 'L', 18, 64, 'L', 14, 72, 'M', 36, 58, 'L', 28, 68, 'L', 26, 76, 'M', 42, 58, 'L', 38, 70, 'L', 40, 77), stroke: c, w: 2.6 });
    parts.push({ d: P('M', 30, 46, 'C', 18, 40, 10, 44, 10, 52, 'C', 10, 58, 18, 58, 22, 54, 'L', 16, 52, 'L', 24, 50, 'Z'), fill: c, stroke: cl, w: 1.2 });
    parts.push({ d: P('M', 30, 44, 'L', 26, 30, 'M', 34, 44, 'L', 34, 30), stroke: cl, w: 1.4 }, ...eye(26, 29, 2.8), ...eye(34, 29, 2.8));
  } else {
    parts.push({ d: P('M', 14, 62, 'C', 14, 54, 26, 50, 40, 54, 'L', 46, 62, 'C', 34, 66, 20, 66, 14, 62, 'Z'), fill: o.foot || '#D8C8B0', stroke: shade(o.foot || '#D8C8B0', 0.6), w: 1.1 });
    parts.push({ d: P('M', 20, 56, 'L', 14, 46, 'M', 24, 55, 'L', 22, 44), stroke: shade(o.foot || '#D8C8B0', 0.6), w: 1.3 }, ...eye(14, 45, 2.4), ...eye(22, 43, 2.4));
  }
  if (conch) {
    let sp = '';
    for (let i = 0; i < 5; i++) { const x = 44 + i * 11, y = 27 + i * 1.8; sp += ' ' + P('M', x - 3, y + 2, 'L', x, y - 6, 'L', x + 3, y + 2, 'Z'); }
    parts.push({ d: sp.trim(), fill: shade(col, 0.85), stroke: ln, w: 0.9 });
  }
  parts.push({ d: sh, fill: col });
  let wh = '';
  for (let i = 0; i < 5; i++) { const x = 50 + i * 11; wh += ' ' + P('M', x, 22, 'Q', x + 6, 42, x - 2, 64); }
  parts.push({ d: wh.trim(), stroke: o.bands || shade(col, 0.7), w: 1.6, op: 0.75, clip: sh });
  parts.push({ d: P('M', 40, 34, 'Q', 66, 26, 92, 36, 'Q', 66, 31, 40, 34, 'Z'), fill: '#FFFFFF', op: 0.3 }, { d: sh, stroke: ln, w: 1.5 });
  // The opening at the front.
  parts.push({ d: ell(36, 50, 6, 7), fill: shade(col, 0.6), stroke: ln, w: 1 });
  void seed;
  return parts;
}

// An abalone from above: an ear-shaped shell with its row of holes.
function abalone(o, seed) {
  const col = o.body, ln = shade(col, 0.55);
  const sh = P('M', 22, 44, 'C', 20, 24, 44, 14, 66, 16, 'C', 92, 18, 104, 34, 100, 50, 'C', 96, 64, 70, 70, 48, 66, 'C', 30, 63, 23, 56, 22, 44, 'Z');
  const parts = [{ d: P('M', 18, 46, 'C', 16, 62, 44, 74, 70, 72, 'C', 92, 70, 106, 56, 104, 44, 'L', 100, 50, 'C', 96, 64, 70, 70, 48, 66, 'Z'), fill: '#E8D8B8', stroke: shade('#E8D8B8', 0.6), w: 1 }, { d: sh, fill: col }];
  let rings = '';
  for (let i = 1; i < 5; i++) rings += ' ' + ell(78 - i * 2, 40, 6 * i, 4.5 * i);
  parts.push({ d: rings.trim(), stroke: shade(col, 0.72), w: 1.2, op: 0.7, clip: sh });
  for (let i = 0; i < 6; i++) parts.push({ d: circ(34 + i * 9, 26 - Math.sin((i / 5) * Math.PI) * 6 + i * 0.5, 2), fill: shade(col, 0.45), stroke: '#C9E8F0', w: 0.7 });
  parts.push({ d: P('M', 36, 26, 'Q', 60, 16, 86, 24, 'Q', 60, 21, 36, 26, 'Z'), fill: '#BDE8F0', op: 0.35 }, { d: sh, stroke: ln, w: 1.6 });
  parts.push(...eye(50, 46, 3), ...eye(64, 46, 3), blush(46, 52, 2), blush(68, 52, 2));
  void seed;
  return parts;
}

// A sea anemone: a short column under a ring of waving tentacles with round tips.
function anemone(o, seed) {
  const col = o.body, ln = shade(col, 0.55), rnd = seeded(seed + ':an');
  let t = '';
  const tips = [];
  for (let i = 0; i < 13; i++) { const x = 34 + i * 4.4, end = [x + (rnd() - 0.5) * 14, 8 + rnd() * 16]; t += ' ' + P('M', x, 46, 'Q', x + (rnd() - 0.5) * 10, 30, end[0], end[1]); tips.push(end); }
  const col2 = P('M', 40, 76, 'L', 44, 46, 'L', 80, 46, 'L', 84, 76, 'Z');
  return [{ d: t.trim(), stroke: col, w: 3.4 }, ...tips.map(([x, y]) => ({ d: circ(x, y, 2.2), fill: o.tips || '#FFD0DC' })),
    { d: col2, fill: shade(col, 0.85), stroke: ln, w: 1.3 }, { d: ell(62, 46, 20, 4), fill: col, stroke: ln, w: 1.2 },
    ...eye(54, 60, 3), ...eye(70, 60, 3), blush(50, 66, 2), blush(74, 66, 2), { d: P('M', 59, 67, 'q', 3, 3, 6, 0), stroke: ln, w: 1.2 }];
}

// A sea hare: a soft blob with two ear-feelers on top, spotted.
function slug(o, seed) {
  const col = o.body, ln = shade(col, 0.55), rnd = seeded(seed + ':sl');
  const body = smooth([[16, 52], [22, 36], [40, 30], [62, 26], [86, 30], [104, 44], [100, 56], [70, 60], [40, 60], [20, 58]]);
  const parts = [{ d: P('M', 30, 34, 'C', 26, 22, 30, 14, 34, 14, 'C', 36, 22, 36, 28, 36, 32, 'Z', 'M', 40, 31, 'C', 40, 18, 46, 12, 50, 14, 'C', 48, 22, 46, 28, 46, 31, 'Z'), fill: shade(col, 0.9), stroke: ln, w: 1.1 },
    { d: P('M', 54, 28, 'C', 66, 14, 84, 16, 92, 30, 'Z'), fill: shade(col, 0.8), stroke: ln, w: 1 }, { d: body, fill: col }];
  for (let i = 0; i < 20; i++) parts.push({ d: circ(24 + rnd() * 76, 34 + rnd() * 22, 0.9 + rnd() * 1.6), fill: o.spots || '#E8E0D8', op: 0.75, clip: body });
  parts.push({ d: P('M', 28, 38, 'Q', 60, 28, 92, 36, 'Q', 60, 33, 28, 38, 'Z'), fill: '#FFFFFF', op: 0.25 }, { d: body, stroke: ln, w: 1.5 });
  parts.push(...eye(30, 44, 3), blush(34, 51, 2.2), { d: P('M', 17, 52, 'q', 3, 2, 6, 0.5), stroke: ln, w: 1.1 });
  return parts;
}

// A tadpole: a round head and a wiggly tail, two back legs on the way.
function tadpole(o) {
  const col = o.body, ln = shade(col, 0.6);
  const tail = P('M', 46, 34, 'C', 62, 28, 74, 44, 88, 38, 'C', 98, 34, 106, 40, 114, 36, 'C', 104, 46, 94, 44, 86, 48, 'C', 72, 54, 62, 44, 46, 48, 'Z');
  const head = ell(36, 41, 17, 14);
  return [{ d: P('M', 46, 50, 'l', 4, 8, 'l', 4, 1, 'M', 52, 48, 'l', 5, 7, 'l', 4, 0), stroke: col, w: 2.4 }, { d: tail, fill: shade(col, 1.25), stroke: ln, w: 1.1, op: 0.9 },
    { d: head, fill: col }, { d: P('M', 18, 46, 'Q', 36, 52, 54, 46, 'V', 60, 'H', 18, 'Z'), fill: o.belly || shade(col, 1.6), clip: head },
    { d: P('M', 26, 32, 'Q', 36, 26, 46, 32, 'Q', 36, 30, 26, 32, 'Z'), fill: '#FFFFFF', op: 0.3 }, { d: head, stroke: ln, w: 1.5 },
    ...eye(28, 38, 3.6), blush(30, 46, 2.4), { d: P('M', 20, 44, 'q', 3, 2, 6, 0.5), stroke: ln, w: 1.1 }];
}

// A blobfish: a sad droopy pink blob with a big soft nose.
function blob(o) {
  const col = o.body, ln = shade(col, 0.6);
  const body = smooth([[18, 50], [20, 30], [40, 18], [66, 20], [88, 28], [104, 40], [100, 56], [76, 64], [44, 66], [24, 62]]);
  return [{ d: P('M', 98, 42, 'C', 108, 36, 116, 40, 116, 48, 'C', 112, 54, 104, 54, 98, 50, 'Z'), fill: shade(col, 0.9), stroke: ln, w: 1.1 }, { d: body, fill: col },
    { d: P('M', 30, 28, 'Q', 52, 18, 76, 26, 'Q', 52, 23, 30, 28, 'Z'), fill: '#FFFFFF', op: 0.3 }, { d: body, stroke: ln, w: 1.5 },
    { d: P('M', 18, 40, 'C', 10, 40, 8, 54, 18, 56, 'C', 26, 56, 28, 44, 22, 40, 'Z'), fill: shade(col, 0.92), stroke: ln, w: 1.3 },
    { d: circ(34, 34, 2.4), fill: '#1E1B2E' }, { d: circ(50, 33, 2.4), fill: '#1E1B2E' }, { d: P('M', 30, 30, 'L', 37, 32, 'M', 47, 31, 'L', 53, 29), stroke: ln, w: 1 },
    { d: P('M', 24, 62, 'Q', 34, 54, 46, 62), stroke: ln, w: 1.4 }];
}

// A giant isopod from above: a segmented oval with many little legs and feelers.
function isopod(o) {
  const col = o.body, ln = shade(col, 0.55), sh = ell(62, 40, 42, 22);
  let legs = '';
  for (let i = 0; i < 7; i++) { const x = 38 + i * 9; legs += ' ' + P('M', x, 22, 'l', -3, -7, 'M', x, 58, 'l', -3, 7); }
  let seg = '';
  for (let i = 0; i < 8; i++) { const x = 36 + i * 9; seg += ' ' + P('M', x, 16, 'Q', x + 4, 40, x, 64); }
  return [{ d: legs.trim(), stroke: shade(col, 0.75), w: 2 }, { d: P('M', 22, 34, 'Q', 8, 26, 2, 30, 'M', 22, 46, 'Q', 8, 54, 2, 50, 'M', 100, 34, 'l', 14, -4, 'M', 100, 46, 'l', 14, 4), stroke: ln, w: 1.2 },
    { d: sh, fill: col }, { d: seg.trim(), stroke: ln, w: 1.1, op: 0.7, clip: sh }, { d: P('M', 30, 30, 'Q', 62, 16, 94, 30, 'Q', 62, 23, 30, 30, 'Z'), fill: '#FFFFFF', op: 0.3 },
    { d: sh, stroke: ln, w: 1.6 }, ...eye(28, 33, 3, '#2E2A3A'), ...eye(28, 47, 3, '#2E2A3A')];
}

// A walrus pup lying down: whiskery muzzle, two short tusks, flippers.
function walrus(o) {
  const col = o.body, ln = shade(col, 0.55);
  const body = P('M', 16, 40, 'C', 14, 24, 32, 18, 50, 22, 'C', 70, 24, 92, 34, 104, 46, 'C', 108, 52, 102, 58, 90, 58, 'L', 30, 60, 'C', 20, 58, 16, 50, 16, 40, 'Z');
  return [{ d: P('M', 100, 50, 'C', 110, 44, 118, 46, 118, 54, 'C', 112, 60, 104, 60, 98, 56, 'Z'), fill: shade(col, 0.85), stroke: ln, w: 1.1 },
    { d: P('M', 46, 56, 'C', 44, 66, 52, 70, 60, 68, 'C', 58, 62, 56, 58, 54, 56, 'Z'), fill: shade(col, 0.85), stroke: ln, w: 1.1 }, { d: body, fill: col },
    { d: P('M', 26, 26, 'Q', 50, 18, 76, 28, 'Q', 50, 23, 26, 26, 'Z'), fill: '#FFFFFF', op: 0.3 }, { d: body, stroke: ln, w: 1.6 },
    { d: P('M', 18, 48, 'L', 17, 62, 'L', 20, 48, 'M', 28, 49, 'L', 29, 63, 'L', 31, 49), fill: '#FFF8E8', stroke: '#B8AE90', w: 0.8 },
    { d: ell(18, 44, 7, 5) + ' ' + ell(28, 45, 7, 5), fill: shade(col, 1.15), stroke: ln, w: 1 }, { d: P('M', 13, 43, 'l', -6, -1, 'M', 13, 46, 'l', -6, 1, 'M', 33, 43, 'l', 5, -2), stroke: ln, w: 0.8 },
    ...eye(22, 33, 2.6), ...eye(34, 32, 2.6), blush(38, 38, 2)];
}

// A mermaid: long hair, a shell top, and a fish tail curling off to the right.
function mermaid(o, seed) {
  const tail = o.body || '#3EC0B0', hair = o.hair || '#E8708E', skin = '#FFD9C2', tl = shade(tail, 0.55);
  const tailD = P('M', 34, 46, 'C', 50, 58, 76, 60, 92, 48, 'L', 96, 44, 'C', 82, 52, 60, 50, 52, 38, 'C', 46, 38, 38, 40, 34, 46, 'Z');
  const parts = [{ d: P('M', 26, 10, 'C', 14, 14, 12, 34, 16, 50, 'C', 22, 56, 30, 46, 30, 40, 'L', 48, 26, 'C', 48, 12, 38, 6, 26, 10, 'Z'), fill: hair, stroke: shade(hair, 0.6), w: 1.1 },
    { d: P('M', 92, 48, 'C', 98, 36, 108, 30, 118, 28, 'C', 112, 38, 112, 44, 104, 48, 'C', 112, 52, 114, 60, 118, 68, 'C', 106, 64, 98, 58, 92, 50, 'Z'), fill: shade(tail, 0.9), stroke: tl, w: 1.2 },
    { d: tailD, fill: tail }];
  let sc = '';
  for (let x = 46; x < 92; x += 6) sc += ' ' + P('M', x, 44 + (x - 46) * 0.05, 'q', 3, 2.5, 6, 0, 'M', x + 3, 49, 'q', 3, 2.5, 6, 0);
  parts.push({ d: sc.trim(), stroke: shade(tail, 0.7), w: 0.8, op: 0.8, clip: tailD }, { d: tailD, stroke: tl, w: 1.4 });
  // Body, arm, face.
  parts.push({ d: P('M', 28, 28, 'C', 26, 36, 30, 44, 36, 46, 'L', 50, 40, 'C', 48, 32, 42, 26, 36, 26, 'Z'), fill: skin, stroke: shade(skin, 0.7), w: 1.1 });
  parts.push({ d: P('M', 30, 32, 'Q', 34, 28, 38, 32, 'Q', 34, 35, 30, 32, 'Z', 'M', 38, 32, 'Q', 42, 28, 46, 32, 'Q', 42, 35, 38, 32, 'Z'), fill: '#B98AF0', stroke: '#8E5EC8', w: 0.8 });
  parts.push({ d: P('M', 44, 34, 'Q', 52, 38, 56, 32), stroke: skin, w: 3 });
  parts.push({ d: circ(34, 18, 9), fill: skin, stroke: shade(skin, 0.7), w: 1.1 });
  parts.push({ d: P('M', 25, 16, 'C', 26, 6, 40, 6, 43, 14, 'C', 38, 11, 32, 11, 25, 16, 'Z'), fill: hair });
  parts.push(...eye(31, 19, 2.2), ...eye(38, 19, 2.2), blush(29, 23, 1.6), blush(40, 23, 1.6), { d: P('M', 33, 24, 'q', 1.5, 1.2, 3, 0), stroke: '#C26A5A', w: 1 });
  parts.push(star(44, 10, 2.6, '#FFF3B0'), ...sparkles(seed, 3));
  return parts;
}

// A hippocampus: a horse's head and front legs, the rest a fish tail in a coil.
function hippo(o, seed) {
  const col = o.body, ln = shade(col, 0.55), mane = o.mane || shade(col, 0.7);
  const body = P('M', 26, 26, 'C', 24, 16, 32, 10, 40, 12, 'C', 48, 14, 52, 22, 54, 32, 'C', 62, 40, 78, 40, 90, 34, 'C', 104, 28, 114, 36, 110, 48, 'C', 106, 58, 92, 58, 90, 50, 'C', 96, 52, 102, 48, 100, 42, 'C', 96, 38, 86, 46, 74, 50, 'C', 60, 54, 44, 50, 40, 40, 'L', 34, 34, 'C', 28, 36, 18, 38, 14, 34, 'C', 12, 30, 18, 26, 26, 26, 'Z');
  const parts = [{ d: P('M', 42, 46, 'L', 36, 60, 'L', 30, 62, 'M', 48, 48, 'L', 46, 62, 'L', 40, 65), stroke: col, w: 3 },
    { d: P('M', 28, 61, 'q', -4, 2, -2, 5, 'q', 4, 0, 5, -4, 'Z', 'M', 38, 64, 'q', -4, 2, -2, 5, 'q', 4, 0, 5, -4, 'Z'), fill: shade(col, 1.2), stroke: ln, w: 0.8 },
    { d: P('M', 40, 12, 'C', 50, 8, 56, 16, 58, 26, 'L', 52, 30, 'C', 50, 22, 46, 16, 40, 14, 'Z'), fill: mane, stroke: shade(mane, 0.7), w: 1 }, { d: body, fill: col }];
  let sc = '';
  for (let x = 58; x < 96; x += 6) sc += ' ' + P('M', x, 40, 'q', 3, 3, 6, 0);
  parts.push({ d: sc.trim(), stroke: ln, w: 0.8, op: 0.6, clip: body }, { d: body, stroke: ln, w: 1.5 });
  parts.push({ d: P('M', 34, 12, 'L', 36, 4, 'L', 39, 12, 'Z'), fill: col, stroke: ln, w: 1 });
  parts.push(...eye(32, 20, 2.8), blush(26, 28, 1.8), { d: circ(16, 31, 0.9), fill: ln });
  parts.push(...sparkles(seed, 3));
  return parts;
}

// Nessie: humps in the water, a long neck up to a small head.
function nessie(o, seed) {
  const col = o.body, ln = shade(col, 0.55);
  const body = P('M', 40, 60, 'C', 40, 46, 54, 38, 68, 40, 'C', 84, 42, 96, 50, 112, 56, 'C', 98, 60, 86, 62, 70, 62, 'Z');
  const neck = P('M', 44, 52, 'C', 36, 40, 28, 26, 30, 16, 'C', 32, 8, 42, 6, 46, 12, 'C', 48, 16, 44, 18, 40, 18, 'C', 38, 28, 46, 40, 56, 46, 'Z');
  return [{ d: P('M', 76, 58, 'C', 82, 64, 92, 68, 96, 66, 'C', 92, 62, 86, 58, 82, 56, 'Z'), fill: shade(col, 0.85), stroke: ln, w: 1 },
    { d: body, fill: col, stroke: ln, w: 1.5 }, { d: neck, fill: col, stroke: ln, w: 1.5 },
    { d: P('M', 52, 46, 'Q', 66, 40, 82, 46, 'Q', 66, 43, 52, 46, 'Z'), fill: '#FFFFFF', op: 0.3 },
    ...eye(38, 12, 2.6), blush(42, 16, 1.6), { d: P('M', 31, 15, 'q', 2, 1.5, 4, 0.3), stroke: ln, w: 1 },
    { d: P('M', 20, 64, 'q', 6, -4, 12, 0, 'q', 6, 4, 12, 0, 'M', 64, 68, 'q', 6, -4, 12, 0, 'q', 6, 4, 12, 0, 'q', 6, -4, 12, 0), stroke: '#7DB8E8', w: 1.8 },
    ...sparkles(seed, 2, '#FFFFFF')];
}

// 용왕의 여의주: a shining pearl in a ring of flame.
function orb(o, seed) {
  const pts = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 2, k = i % 2 ? 24 : 32; pts.push([60 + Math.cos(a) * k, 42 + Math.sin(a) * k * 0.95]); }
  return [...[1.4, 1.15].map((k) => ({ d: circ(60, 42, 30 * k), fill: '#FFF3B0', op: 0.12 })), { d: smooth(pts), fill: '#FFB03E', op: 0.75 },
    { d: circ(60, 42, 20), fill: o.body || '#8CE0FF', stroke: '#3E9EC8', w: 1.4 }, { d: P('M', 46, 38, 'Q', 52, 24, 68, 26, 'Q', 54, 30, 46, 38, 'Z'), fill: '#FFFFFF', op: 0.7 },
    { d: circ(66, 50, 3), fill: '#FFFFFF', op: 0.5 }, ...sparkles(seed, 6)];
}

// 세이렌의 비늘: one big rainbow scale.
function scale(o, seed) {
  const sh = P('M', 60, 8, 'C', 88, 8, 100, 32, 96, 50, 'C', 90, 68, 74, 74, 60, 74, 'C', 46, 74, 30, 68, 24, 50, 'C', 20, 32, 32, 8, 60, 8, 'Z');
  const cols = ['#FF8FA3', '#FFC98A', '#FFF0A0', '#A8F0C0', '#9CD8FF', '#C8A8FF'];
  return [{ d: sh, fill: '#E8F4FF' }, ...cols.map((c, i) => ({ d: P('M', 10, 12 + i * 11, 'Q', 60, 2 + i * 11, 110, 12 + i * 11, 'V', 24 + i * 11, 'Q', 60, 14 + i * 11, 10, 24 + i * 11, 'Z'), fill: c, op: 0.7, clip: sh })),
    { d: P('M', 40, 20, 'Q', 52, 12, 66, 14, 'Q', 50, 18, 40, 30, 'Z'), fill: '#FFFFFF', op: 0.7 }, { d: sh, stroke: '#9CB8E8', w: 1.6 }, ...sparkles(seed, 5, '#FFFFFF')];
}

// A lump of coral, branching up from its foot, little polyps on the tips.
function coral(o, seed) {
  const col = o.body, ln = shade(col, 0.6), rnd = seeded(seed + ':co');
  const br = P('M', 60, 74, 'L', 60, 50, 'L', 46, 34, 'L', 40, 16, 'M', 46, 34, 'L', 30, 28, 'M', 60, 50, 'L', 74, 32, 'L', 72, 12, 'M', 74, 32, 'L', 90, 22, 'M', 60, 56, 'L', 86, 46, 'L', 98, 40, 'M', 60, 60, 'L', 36, 52, 'L', 22, 46);
  const parts = [{ d: br, stroke: ln, w: 8 }, { d: br, stroke: col, w: 6 }];
  for (const [x, y] of [[40, 16], [30, 28], [72, 12], [90, 22], [98, 40], [22, 46]]) parts.push({ d: circ(x, y, 3.6), fill: shade(col, 1.2), stroke: ln, w: 0.8 });
  for (let i = 0; i < 18; i++) parts.push({ d: circ(26 + rnd() * 70, 18 + rnd() * 50, 0.8), fill: '#FFFFFF', op: 0.7 });
  parts.push({ d: P('M', 44, 74, 'Q', 60, 66, 76, 74, 'Z'), fill: '#C9B8A0', stroke: '#8C7A62', w: 1 }, ...eye(54, 62, 2.6), ...eye(66, 62, 2.6));
  return parts;
}

// ── 꽝 ────────────────────────────────────────────────────────────────────────────────────────
function junk(o) {
  const K = {
    boot: () => [
      { d: P('M', 46, 12, 'L', 72, 12, 'L', 74, 50, 'C', 86, 52, 98, 56, 98, 64, 'L', 98, 70, 'L', 40, 70, 'L', 42, 50, 'Z'), fill: '#3D6B4F', stroke: '#22402E', w: 1.6 },
      { d: P('M', 40, 66, 'L', 98, 66, 'L', 98, 72, 'L', 40, 72, 'Z'), fill: '#2A2A2A' },
      { d: P('M', 44, 12, 'L', 74, 12, 'L', 74, 18, 'L', 44, 18, 'Z'), fill: '#5E8E70', stroke: '#22402E', w: 1.2 },
      { d: P('M', 50, 24, 'Q', 58, 22, 64, 26), stroke: '#FFFFFF', w: 2, op: 0.3 },
      { d: P('M', 88, 54, 'q', 4, -6, 8, -3, 'M', 92, 50, 'q', 0, -5, 3, -6), stroke: '#7DB8E8', w: 1.6 }],
    can: () => [
      { d: P('M', 40, 26, 'L', 80, 22, 'L', 84, 58, 'L', 44, 62, 'Z'), fill: '#C9CED6', stroke: '#6B7380', w: 1.6 },
      { d: P('M', 41, 34, 'L', 81, 30, 'L', 83, 50, 'L', 43, 54, 'Z'), fill: '#E63946' },
      { d: P('M', 52, 40, 'L', 72, 38, 'M', 54, 46, 'L', 66, 45), stroke: '#FFFFFF', w: 2 },
      { d: ell(60, 24, 20, 3.5), fill: '#AEB4BE', stroke: '#6B7380', w: 1.2 },
      { d: P('M', 64, 30, 'L', 70, 58), stroke: '#FFFFFF', w: 2.5, op: 0.35 }],
    stick: () => [
      { d: P('M', 12, 50, 'C', 40, 40, 70, 36, 108, 26, 'L', 110, 32, 'C', 72, 42, 42, 48, 14, 56, 'Z'), fill: '#8B6B4A', stroke: '#5A4330', w: 1.4 },
      { d: P('M', 62, 40, 'C', 66, 30, 72, 24, 78, 20, 'L', 80, 23, 'C', 74, 28, 70, 34, 66, 40, 'Z'), fill: '#8B6B4A', stroke: '#5A4330', w: 1.2 },
      { d: P('M', 78, 20, 'C', 84, 12, 94, 14, 92, 20, 'C', 88, 24, 82, 24, 78, 20, 'Z'), fill: '#7FB069', stroke: '#4E7A3E', w: 1.1 },
      { d: P('M', 24, 50, 'q', 8, -3, 16, -5, 'M', 50, 44, 'q', 8, -2, 14, -4), stroke: '#5A4330', w: 0.9, op: 0.6 }],
    weed: () => {
      let d = '';
      [[40, 0], [52, 1], [64, -1], [76, 1]].forEach(([x, k]) => { d += ' ' + P('M', x, 74, 'C', x - 8, 60, x + 8 + k * 4, 44, x - 4, 30, 'C', x - 10, 20, x + 4, 14, x, 6); });
      return [{ d: d.trim(), stroke: '#3E8E5A', w: 6 }, { d: d.trim(), stroke: '#6CC28A', w: 2, op: 0.7 }];
    },
    sock: () => [
      { d: P('M', 50, 10, 'L', 72, 10, 'L', 72, 46, 'C', 72, 58, 82, 58, 90, 58, 'C', 102, 60, 100, 76, 88, 74, 'L', 62, 72, 'C', 52, 70, 50, 62, 50, 54, 'Z'), fill: '#F2F2F2', stroke: '#9AA0AE', w: 1.5 },
      { d: P('M', 50, 10, 'L', 72, 10, 'L', 72, 20, 'L', 50, 20, 'Z'), fill: '#E63946' },
      { d: P('M', 50, 26, 'L', 72, 26, 'L', 72, 31, 'L', 50, 31, 'Z'), fill: '#457B9D' },
      { d: P('M', 84, 60, 'C', 96, 60, 98, 72, 88, 73, 'Z'), fill: '#E63946', op: 0.85 }],
    bottle: () => [
      { d: P('M', 54, 8, 'L', 66, 8, 'L', 66, 18, 'C', 78, 24, 80, 30, 80, 38, 'L', 80, 70, 'Q', 80, 74, 76, 74, 'L', 44, 74, 'Q', 40, 74, 40, 70, 'L', 40, 38, 'C', 40, 30, 42, 24, 54, 18, 'Z'), fill: '#BDE4F4', stroke: '#5C9DBB', w: 1.5, op: 0.85 },
      { d: P('M', 52, 4, 'L', 68, 4, 'L', 68, 10, 'L', 52, 10, 'Z'), fill: '#2E86DE', stroke: '#1B5E9E', w: 1 },
      { d: P('M', 40, 44, 'L', 80, 44, 'L', 80, 56, 'L', 40, 56, 'Z'), fill: '#7BD389' },
      { d: P('M', 46, 30, 'L', 46, 68), stroke: '#FFFFFF', w: 3, op: 0.45 }],
    duck: () => [
      { d: P('M', 30, 52, 'C', 28, 38, 44, 34, 58, 38, 'C', 62, 30, 58, 16, 72, 14, 'C', 86, 12, 92, 24, 86, 32, 'C', 98, 36, 100, 56, 86, 64, 'C', 70, 72, 40, 72, 30, 52, 'Z'), fill: '#FFD93D', stroke: '#C9A21B', w: 1.6 },
      { d: P('M', 86, 24, 'C', 96, 22, 102, 26, 100, 30, 'C', 96, 32, 90, 30, 86, 30, 'Z'), fill: '#FF8C42', stroke: '#C9601B', w: 1.2 },
      { d: P('M', 46, 48, 'C', 54, 42, 66, 46, 68, 54, 'C', 60, 58, 50, 56, 46, 48, 'Z'), fill: '#F5C518', stroke: '#C9A21B', w: 1 },
      ...eye(78, 22, 3), blush(82, 29, 2.2)],
    keycap: () => [
      { d: P('M', 30, 30, 'L', 90, 30, 'L', 98, 64, 'L', 22, 64, 'Z'), fill: '#5C6370', stroke: '#2E323A', w: 1.6 },
      { d: P('M', 36, 22, 'L', 84, 22, 'L', 88, 52, 'L', 32, 52, 'Z'), fill: '#E6E8EC', stroke: '#8A909C', w: 1.4 },
      { d: P('M', 50, 31, 'H', 42, 'V', 43, 'H', 50, 'M', 42, 37, 'H', 48, 'M', 62, 32, 'Q', 54, 30, 54, 34, 'Q', 54, 37, 58, 37, 'Q', 63, 38, 62, 41, 'Q', 61, 44, 53, 42, 'M', 77, 32, 'Q', 68, 29, 67, 37, 'Q', 68, 45, 77, 42), stroke: '#2E323A', w: 1.6 }],
    // The office's lost things.
    badge: () => [
      { d: P('M', 46, 2, 'L', 54, 30, 'M', 74, 2, 'L', 66, 30), stroke: '#3B7DD8', w: 3 },
      { d: P('M', 42, 28, 'L', 78, 28, 'L', 78, 76, 'L', 42, 76, 'Z'), fill: '#FFFFFF', stroke: '#8A909C', w: 1.5 },
      { d: P('M', 42, 28, 'L', 78, 28, 'L', 78, 36, 'L', 42, 36, 'Z'), fill: '#3B7DD8' },
      { d: P('M', 50, 42, 'L', 70, 42, 'L', 70, 60, 'L', 50, 60, 'Z'), fill: '#D8DEE8', stroke: '#8A909C', w: 1 },
      { d: circ(60, 48, 4), fill: '#9AA4B4' }, { d: P('M', 53, 59, 'Q', 60, 51, 67, 59, 'Z'), fill: '#9AA4B4' },
      { d: P('M', 48, 66, 'L', 72, 66, 'M', 52, 71, 'L', 68, 71), stroke: '#5C6370', w: 1.6 }],
    cup: () => [
      { d: P('M', 42, 22, 'L', 78, 22, 'L', 72, 74, 'L', 48, 74, 'Z'), fill: '#FFFFFF', stroke: '#9AA0AE', w: 1.5 },
      { d: P('M', 44, 36, 'L', 76, 36, 'L', 74, 54, 'L', 46, 54, 'Z'), fill: '#A8754E' },
      { d: P('M', 38, 16, 'L', 82, 16, 'L', 80, 24, 'L', 40, 24, 'Z'), fill: '#3E3A44', stroke: '#22202A', w: 1.2 },
      { d: P('M', 66, 16, 'L', 74, 2), stroke: '#2EA06A', w: 3 }, { d: circ(60, 45, 4), fill: '#FFFFFF', op: 0.8 }],
    earbud: () => [
      { d: P('M', 58, 40, 'L', 64, 74, 'Q', 66, 78, 70, 76, 'L', 72, 74, 'L', 68, 40, 'Z'), fill: '#F4F6F8', stroke: '#9AA0AE', w: 1.4 },
      { d: circ(58, 32, 14), fill: '#FFFFFF', stroke: '#9AA0AE', w: 1.5 }, { d: circ(52, 32, 6), fill: '#3E3A44' },
      { d: P('M', 62, 22, 'Q', 68, 24, 70, 30), stroke: '#FFFFFF', w: 2, op: 0.9 }],
    mouse: () => [
      { d: P('M', 60, 22, 'C', 46, 6, 30, 20, 24, 10), stroke: '#5C6370', w: 2 },
      { d: P('M', 60, 22, 'C', 80, 22, 90, 36, 90, 52, 'C', 90, 68, 78, 76, 60, 76, 'C', 42, 76, 30, 68, 30, 52, 'C', 30, 36, 40, 22, 60, 22, 'Z'), fill: '#D8DCE4', stroke: '#6B7380', w: 1.6 },
      { d: P('M', 60, 22, 'L', 60, 44, 'M', 31, 44, 'L', 89, 44), stroke: '#6B7380', w: 1.2 },
      { d: ell(60, 32, 2.6, 5), fill: '#5C6370' }, { d: P('M', 70, 54, 'L', 80, 66, 'M', 80, 54, 'L', 70, 66), stroke: '#E5484D', w: 1.8 }],
    umbrella: () => [
      { d: P('M', 18, 20, 'Q', 30, 52, 60, 54, 'Q', 90, 52, 102, 20, 'Q', 90, 30, 78, 24, 'Q', 68, 32, 60, 24, 'Q', 52, 32, 42, 24, 'Q', 30, 30, 18, 20, 'Z'), fill: '#E8503E', stroke: '#9E2E22', w: 1.5 },
      { d: P('M', 42, 24, 'L', 58, 52, 'M', 78, 24, 'L', 62, 52), stroke: '#9E2E22', w: 1 },
      { d: P('M', 60, 24, 'L', 60, 70, 'Q', 60, 78, 52, 76), stroke: '#5A4330', w: 3 }],
    letter: () => [
      { d: P('M', 54, 8, 'L', 66, 8, 'L', 66, 18, 'C', 78, 24, 80, 30, 80, 38, 'L', 80, 70, 'Q', 80, 74, 76, 74, 'L', 44, 74, 'Q', 40, 74, 40, 70, 'L', 40, 38, 'C', 40, 30, 42, 24, 54, 18, 'Z'), fill: '#CFEAD8', stroke: '#5C9D7B', w: 1.5, op: 0.85 },
      { d: P('M', 53, 2, 'L', 67, 2, 'L', 66, 10, 'L', 54, 10, 'Z'), fill: '#B48C5A', stroke: '#7A5A30', w: 1 },
      { d: P('M', 48, 36, 'L', 72, 36, 'L', 72, 64, 'L', 48, 64, 'Z'), fill: '#F6EBD0', stroke: '#B89E6A', w: 1 },
      { d: ell(48, 50, 3, 14) + ' ' + ell(72, 50, 3, 14), fill: '#E8D8B0', stroke: '#B89E6A', w: 0.8 },
      { d: P('M', 53, 42, 'L', 67, 42, 'M', 53, 48, 'L', 67, 48, 'M', 53, 54, 'L', 62, 54), stroke: '#8C7A52', w: 1 },
      { d: P('M', 58, 58, 'C', 55, 55, 57, 53, 60, 56, 'C', 63, 53, 65, 55, 62, 58, 'L', 60, 60, 'Z'), fill: '#E5484D' }],
    postit: () => [
      { d: P('M', 32, 24, 'L', 80, 18, 'L', 86, 64, 'L', 38, 70, 'Z'), fill: '#FFB3C1', stroke: '#C9808E', w: 1.2 },
      { d: P('M', 36, 16, 'L', 84, 14, 'L', 86, 60, 'L', 38, 62, 'Z'), fill: '#9CE0B8', stroke: '#5EA884', w: 1.2 },
      { d: P('M', 38, 10, 'L', 86, 12, 'L', 84, 58, 'L', 36, 56, 'Z'), fill: '#FFE066', stroke: '#C9A21B', w: 1.3 },
      { d: P('M', 44, 22, 'L', 76, 24, 'M', 44, 32, 'L', 72, 34, 'M', 44, 42, 'L', 66, 43), stroke: '#7A6A2E', w: 1.6 }],
    calc: () => [
      { d: P('M', 38, 8, 'L', 82, 8, 'L', 82, 74, 'L', 38, 74, 'Z'), fill: '#5C6370', stroke: '#2E323A', w: 1.6 },
      { d: P('M', 44, 14, 'L', 76, 14, 'L', 76, 28, 'L', 44, 28, 'Z'), fill: '#BFD8B0', stroke: '#2E323A', w: 1 },
      { d: P('M', 70, 18, 'l', -3, 6, 'M', 60, 18, 'l', 0, 6, 'M', 56, 18, 'l', 0, 6), stroke: '#2E323A', w: 1.2 },
      ...[0, 1, 2, 3].flatMap((r) => [0, 1, 2].map((c) => ({ d: P('M', 45 + c * 11, 34 + r * 10, 'l', 8, 0, 'l', 0, 7, 'l', -8, 0, 'Z'), fill: r === 3 && c === 2 ? '#F2903E' : '#D8DCE4' }))),
      { d: P('M', 40, 30, 'L', 52, 46, 'L', 46, 54, 'L', 60, 72), stroke: '#FFFFFF', w: 1.4, op: 0.8 }],
    card: () => [
      { d: P('M', 18, 22, 'L', 102, 22, 'L', 102, 66, 'L', 18, 66, 'Z'), fill: '#FFFFFF', stroke: '#9AA0AE', w: 1.5 },
      { d: P('M', 18, 22, 'L', 30, 22, 'L', 30, 66, 'L', 18, 66, 'Z'), fill: '#3B7DD8' },
      { d: P('M', 38, 34, 'L', 66, 34), stroke: '#2E323A', w: 3 }, { d: P('M', 38, 46, 'L', 90, 46, 'M', 38, 54, 'L', 80, 54), stroke: '#8A909C', w: 1.4 },
      { d: circ(88, 32, 5), fill: '#F2C14E' }],
    charger: () => [
      { d: P('M', 70, 40, 'C', 90, 40, 96, 60, 80, 64, 'C', 66, 68, 60, 76, 70, 78), stroke: '#3E3A44', w: 2.4 },
      { d: P('M', 24, 26, 'L', 70, 26, 'L', 70, 54, 'L', 24, 54, 'Z'), fill: '#3E3A44', stroke: '#22202A', w: 1.5 },
      { d: P('M', 32, 36, 'L', 50, 36, 'M', 32, 44, 'L', 44, 44), stroke: '#8A909C', w: 1.2 }, { d: circ(62, 34, 2), fill: '#7BD389' },
      { d: P('M', 14, 34, 'L', 24, 34, 'M', 14, 46, 'L', 24, 46), stroke: '#C9CED6', w: 3 }],
    paper: () => [
      { d: P('M', 30, 6, 'L', 80, 6, 'L', 90, 16, 'L', 90, 76, 'L', 30, 76, 'Z'), fill: '#FFFFFF', stroke: '#9AA0AE', w: 1.5 },
      { d: P('M', 80, 6, 'L', 80, 16, 'L', 90, 16), stroke: '#9AA0AE', w: 1.2 },
      { d: P('M', 40, 18, 'L', 70, 18), stroke: '#2E323A', w: 2.6 }, { d: P('M', 40, 30, 'L', 80, 30, 'M', 40, 38, 'L', 80, 38, 'M', 40, 46, 'L', 66, 46), stroke: '#8A909C', w: 1.3 },
      { d: circ(70, 60, 11), stroke: '#E5484D', w: 2.2, op: 0.9 }, { d: P('M', 64, 54, 'L', 76, 66, 'M', 76, 54, 'L', 64, 66), stroke: '#E5484D', w: 2.2, op: 0.9 }],
    receipt: () => [
      { d: P('M', 40, 4, 'L', 80, 4, 'L', 80, 72, 'L', 76, 76, 'L', 72, 72, 'L', 68, 76, 'L', 64, 72, 'L', 60, 76, 'L', 56, 72, 'L', 52, 76, 'L', 48, 72, 'L', 44, 76, 'L', 40, 72, 'Z'), fill: '#FFFDF4', stroke: '#B8AE90', w: 1.3 },
      { d: P('M', 48, 12, 'L', 72, 12, 'M', 46, 24, 'L', 74, 24, 'M', 46, 32, 'L', 74, 32, 'M', 46, 40, 'L', 74, 40, 'M', 46, 48, 'L', 74, 48), stroke: '#8C8670', w: 1.2 },
      { d: P('M', 46, 58, 'L', 74, 58), stroke: '#2E323A', w: 2.6 }, { d: P('M', 44, 64, 'L', 76, 64), stroke: '#B8AE90', w: 0.8 }],
    coupon: () => [
      { d: P('M', 14, 24, 'L', 106, 24, 'L', 106, 36, 'A', 5, 5, 0, 0, 0, 106, 46, 'L', 106, 58, 'L', 14, 58, 'L', 14, 46, 'A', 5, 5, 0, 0, 0, 14, 36, 'Z'), fill: '#FFD34E', stroke: '#C9A21B', w: 1.5 },
      { d: P('M', 80, 26, 'L', 80, 30, 'M', 80, 34, 'L', 80, 38, 'M', 80, 42, 'L', 80, 46, 'M', 80, 50, 'L', 80, 56), stroke: '#C9A21B', w: 1.4 },
      { d: circ(40, 36, 4) + ' ' + circ(56, 48, 4), stroke: '#9E2E22', w: 2 }, { d: P('M', 58, 32, 'L', 38, 52), stroke: '#9E2E22', w: 2 },
      { d: P('M', 88, 36, 'L', 98, 36, 'M', 88, 44, 'L', 96, 44), stroke: '#7A5A10', w: 1.6 }, { d: P('M', 20, 30, 'L', 100, 52), stroke: '#E5484D', w: 2, op: 0.7 }],
    eraser: () => [
      { d: P('M', 22, 40, 'L', 70, 26, 'L', 98, 40, 'L', 50, 56, 'Z'), fill: '#FFFFFF', stroke: '#9AA0AE', w: 1.4 },
      { d: P('M', 22, 40, 'Q', 18, 48, 26, 52, 'L', 50, 64, 'L', 50, 56, 'Z'), fill: '#F2E8E0', stroke: '#9AA0AE', w: 1.2 },
      { d: P('M', 50, 56, 'L', 98, 40, 'L', 98, 48, 'L', 50, 64, 'Z'), fill: '#E8E0D8', stroke: '#9AA0AE', w: 1.2 },
      { d: P('M', 58, 32, 'L', 86, 46, 'L', 86, 52, 'L', 98, 48, 'L', 98, 40, 'L', 70, 26, 'Z'), fill: '#3B7DD8', stroke: '#22508E', w: 1.2 }],
    clover: () => [
      { d: P('M', 60, 44, 'C', 62, 56, 60, 68, 70, 78), stroke: '#3E8E5A', w: 3 },
      ...[0, 90, 180, 270].map((deg) => {
        const a = ((deg + 45) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), R = (x, y) => [60 + x * c - y * s, 40 + x * s + y * c];
        const [p0, p1, p2, p3, p4, p5] = [R(0, 0), R(-10, -14), R(4, -24), R(14, -16), R(24, -4), R(14, 10)];
        return { d: P('M', ...p0, 'C', ...p1, ...p2, ...p3, 'C', ...p4, ...p5, ...p0, 'Z'), fill: '#6CC28A', stroke: '#3E8E5A', w: 1.2 };
      }), { d: circ(60, 40, 3), fill: '#4EA86A' }, ...sparkles('clover', 3)],
    chest: () => [
      { d: P('M', 26, 14, 'L', 94, 14, 'L', 92, 34, 'L', 28, 34, 'Z'), fill: '#8C5A2E', stroke: '#5A3A1E', w: 1.5 },
      { d: P('M', 28, 34, 'L', 92, 34, 'L', 92, 40, 'L', 28, 40, 'Z'), fill: '#2E2218' },
      { d: P('M', 24, 40, 'L', 96, 40, 'L', 96, 74, 'L', 24, 74, 'Z'), fill: '#A86A36', stroke: '#5A3A1E', w: 1.5 },
      { d: P('M', 24, 50, 'L', 96, 50, 'M', 40, 40, 'L', 40, 74, 'M', 80, 40, 'L', 80, 74, 'M', 40, 14, 'L', 40, 34, 'M', 80, 14, 'L', 80, 34), stroke: '#E0B43E', w: 2.4 },
      { d: P('M', 56, 46, 'L', 64, 46, 'L', 64, 56, 'L', 56, 56, 'Z'), fill: '#F2C14E', stroke: '#8C6A1E', w: 1 }],
    // A three-striped office slipper.
    slipper: () => [
      { d: P('M', 18, 54, 'C', 16, 40, 40, 34, 70, 36, 'C', 92, 36, 104, 44, 102, 54, 'C', 100, 64, 80, 66, 60, 66, 'C', 36, 66, 20, 64, 18, 54, 'Z'), fill: '#3E3A44', stroke: '#22202A', w: 1.5 },
      { d: P('M', 30, 52, 'C', 30, 30, 70, 26, 72, 52, 'Z'), fill: '#2E64B8', stroke: '#1E4480', w: 1.4 },
      { d: P('M', 38, 40, 'L', 64, 36, 'M', 36, 45, 'L', 68, 42, 'M', 34, 50, 'L', 70, 48), stroke: '#FFFFFF', w: 2.2 }],
    tumbler: () => [
      { d: P('M', 44, 16, 'L', 76, 16, 'L', 72, 76, 'L', 48, 76, 'Z'), fill: '#7ED8B8', stroke: '#3E9878', w: 1.5 },
      { d: P('M', 42, 8, 'L', 78, 8, 'L', 78, 18, 'L', 42, 18, 'Z'), fill: '#E8ECEF', stroke: '#8A909C', w: 1.3 },
      { d: P('M', 46, 40, 'L', 74, 40, 'L', 73, 52, 'L', 47, 52, 'Z'), fill: '#FFFFFF', op: 0.7 },
      { d: P('M', 54, 46, 'q', 3, -4, 6, 0, 'q', 3, -4, 6, 0), stroke: '#3E9878', w: 1.4 },
      { d: P('M', 52, 22, 'L', 50, 70), stroke: '#FFFFFF', w: 2.5, op: 0.45 }],
    usb: () => [
      { d: P('M', 24, 30, 'L', 80, 30, 'L', 80, 56, 'L', 24, 56, 'Z'), fill: '#E5484D', stroke: '#9E2230', w: 1.5 },
      { d: P('M', 80, 34, 'L', 100, 34, 'L', 100, 52, 'L', 80, 52, 'Z'), fill: '#C9CED6', stroke: '#6B7380', w: 1.3 },
      { d: P('M', 86, 39, 'L', 92, 39, 'L', 92, 43, 'L', 86, 43, 'Z', 'M', 86, 45, 'L', 92, 45, 'L', 92, 49, 'L', 86, 49, 'Z'), fill: '#6B7380' },
      { d: circ(32, 43, 3), stroke: '#FFFFFF', w: 1.5 }, { d: P('M', 42, 38, 'L', 70, 38), stroke: '#FFFFFF', w: 2, op: 0.5 }],
    pen: () => [
      { d: P('M', 16, 58, 'L', 92, 22, 'L', 98, 32, 'L', 22, 68, 'Z'), fill: '#2E64B8', stroke: '#1E4480', w: 1.4 },
      { d: P('M', 16, 58, 'L', 22, 68, 'L', 8, 70, 'Z'), fill: '#E8DCC0', stroke: '#8C7A52', w: 1.1 }, { d: circ(9, 69, 1.2), fill: '#2E2E3A' },
      { d: P('M', 92, 22, 'L', 104, 16, 'L', 108, 26, 'L', 98, 32, 'Z'), fill: '#1E2E5A', stroke: '#101830', w: 1.1 },
      { d: P('M', 70, 30, 'L', 96, 18, 'L', 98, 22, 'L', 72, 34, 'Z'), fill: '#C9CED6', stroke: '#6B7380', w: 1 }],
    ramen: () => [
      { d: P('M', 30, 24, 'L', 90, 24, 'L', 82, 74, 'L', 38, 74, 'Z'), fill: '#FFFFFF', stroke: '#9AA0AE', w: 1.5 },
      { d: P('M', 32, 34, 'L', 88, 34, 'L', 86, 50, 'L', 34, 50, 'Z'), fill: '#E5484D' },
      { d: P('M', 50, 38, 'L', 70, 38, 'M', 48, 45, 'L', 72, 45), stroke: '#FFFFFF', w: 2 },
      { d: ell(60, 24, 30, 5), fill: '#F2E0C0', stroke: '#9AA0AE', w: 1.2 },
      { d: P('M', 60, 22, 'L', 92, 6, 'M', 64, 23, 'L', 96, 9), stroke: '#C9A26A', w: 2 }],
    // A hand cream squeezed flat to the last drop, rolled up from the end.
    handcream: () => [
      { d: P('M', 22, 34, 'L', 80, 30, 'C', 84, 36, 84, 50, 80, 56, 'L', 22, 52, 'Q', 18, 43, 22, 34, 'Z'), fill: '#FFE3EA', stroke: '#C98A9A', w: 1.5 },
      { d: P('M', 22, 34, 'Q', 30, 40, 22, 52, 'M', 30, 33, 'Q', 36, 43, 30, 53, 'M', 38, 33, 'Q', 43, 43, 38, 53), stroke: '#C98A9A', w: 1, op: 0.7 },
      { d: P('M', 50, 36, 'Q', 56, 38, 62, 36, 'M', 48, 46, 'Q', 58, 48, 66, 45), stroke: '#C98A9A', w: 0.8, op: 0.5 },
      { d: P('M', 80, 34, 'L', 96, 36, 'L', 96, 50, 'L', 80, 52, 'Z'), fill: '#F2F2F2', stroke: '#9AA0AE', w: 1.3 },
      { d: P('M', 56, 40, 'L', 70, 39), stroke: '#E8708E', w: 2.2 }, { d: circ(100, 43, 2.2), fill: '#FFFFFF', stroke: '#C98A9A', w: 0.8 }],
    // A ThinkPad's red pointing nub, with a bit of the keyboard round it.
    trackpoint: () => [
      { d: P('M', 18, 20, 'L', 102, 20, 'L', 98, 68, 'L', 22, 68, 'Z'), fill: '#2A2A30', stroke: '#141418', w: 1.5 },
      ...[[26, 26], [46, 26], [70, 26], [26, 48], [70, 48]].map(([x, y]) => ({ d: P('M', x, y, 'l', 18, 0, 'l', 0, 15, 'l', -18, 0, 'Z'), fill: '#3E3E46', stroke: '#141418', w: 1 })),
      { d: P('M', 46, 48, 'l', 18, 0, 'l', 0, 15, 'l', -18, 0, 'Z'), fill: '#3E3E46', stroke: '#141418', w: 1 },
      { d: circ(64, 45, 6), fill: '#E8203A', stroke: '#8E1020', w: 1.2 }, { d: circ(62.5, 43.5, 1.8), fill: '#FF8A9A' },
      { d: P('M', 30, 31, 'l', 8, 0, 'M', 76, 31, 'l', 8, 0), stroke: '#8A8A96', w: 1 }],
    // A sky-blue steel drawer cabinet.
    cabinet: () => [
      { d: P('M', 34, 6, 'L', 86, 6, 'L', 86, 76, 'L', 34, 76, 'Z'), fill: '#7EC8F0', stroke: '#3E88B8', w: 1.6 },
      ...[0, 1, 2].map((i) => ({ d: P('M', 38, 10 + i * 22, 'L', 82, 10 + i * 22, 'L', 82, 28 + i * 22, 'L', 38, 28 + i * 22, 'Z'), fill: '#A8DCF8', stroke: '#3E88B8', w: 1.2 })),
      ...[0, 1, 2].map((i) => ({ d: P('M', 52, 18 + i * 22, 'L', 68, 18 + i * 22), stroke: '#2E5E8A', w: 2.6 })),
      { d: circ(60, 23, 2), fill: '#F2C94C' }, { d: P('M', 40, 12, 'L', 40, 72), stroke: '#FFFFFF', w: 2, op: 0.4 }],
    // A ten-year-old white laptop, a little yellowed, its screen dim.
    laptop: () => [
      { d: P('M', 30, 10, 'L', 90, 10, 'L', 90, 52, 'L', 30, 52, 'Z'), fill: '#F2F0E8', stroke: '#9A968A', w: 1.5 },
      { d: P('M', 35, 14, 'L', 85, 14, 'L', 85, 47, 'L', 35, 47, 'Z'), fill: '#3E4656' },
      { d: P('M', 52, 30, 'L', 56, 27, 'L', 60, 32, 'L', 66, 25), stroke: '#8AB8E8', w: 1.2, op: 0.6 },
      { d: P('M', 22, 54, 'L', 98, 54, 'L', 104, 66, 'L', 16, 66, 'Z'), fill: '#E8E4D8', stroke: '#9A968A', w: 1.5 },
      { d: P('M', 30, 57, 'L', 90, 57, 'M', 28, 60, 'L', 92, 60), stroke: '#B8B4A8', w: 1.2 },
      { d: P('M', 50, 62.5, 'L', 70, 62.5), stroke: '#B8B4A8', w: 1.6 }, { d: circ(84, 44, 1.2), fill: '#7BD389' }],
    // A disposable floss pick.
    floss: () => [
      { d: P('M', 20, 60, 'L', 78, 34, 'L', 81, 40, 'L', 23, 66, 'Z'), fill: '#7ED8B8', stroke: '#3E9878', w: 1.3 },
      { d: P('M', 78, 34, 'L', 88, 18, 'L', 92, 20, 'L', 84, 37, 'Z', 'M', 81, 40, 'L', 100, 36, 'L', 100, 40, 'L', 82, 44, 'Z'), fill: '#7ED8B8', stroke: '#3E9878', w: 1.2 },
      { d: P('M', 90, 19, 'L', 100, 38), stroke: '#FFFFFF', w: 1.4 },
      { d: P('M', 22, 63, 'q', -5, 1, -6, 6), stroke: '#3E9878', w: 1.4 }],
    remote: () => [
      { d: P('M', 42, 6, 'L', 78, 6, 'Q', 82, 6, 82, 10, 'L', 82, 72, 'Q', 82, 76, 78, 76, 'L', 42, 76, 'Q', 38, 76, 38, 72, 'L', 38, 10, 'Q', 38, 6, 42, 6, 'Z'), fill: '#3E3A44', stroke: '#22202A', w: 1.5 },
      { d: circ(60, 18, 5), fill: '#E5484D' },
      ...[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ({ d: circ(48 + c * 12, 34 + r * 11, 3.2), fill: '#C9CED6' }))),
      { d: P('M', 50, 68, 'L', 70, 68), stroke: '#8A909C', w: 2 }],
  };
  return (K[o.kind] || K.can)();
}

const SHAPES = {
  fish, eel, flat, ray, round, squid, octopus, crab, lobster, shrimp, star: starfish, urchin, jelly, turtle, whale, seahorse, shell, junk,
  cucumber, squirt, cetacean, horseshoe, nautilus, snail, hermit: (o, s) => snail({ ...o, kind: 'hermit' }, s), abalone, anemone, slug, tadpole, blob, isopod, walrus, mermaid, hippo, nessie, orb, scale, coral,
};

// The parts of one catalogue entry (server/fish.js FISH): its look drawn by its shape. A twin is
// two of it, one a little behind the other; a ghost is all of it half see-through.
export function art(entry) {
  const look = entry.look || {};
  const draw = SHAPES[look.shape || 'fish'] || fish;
  let parts = look.twin
    ? [...draw({ ...look, cy: 30, x0: (look.x0 ?? 14) + 14 }, entry.id + ':b'), ...draw({ ...look, cy: 50 }, entry.id)]
    : draw(look, entry.id);
  if (look.ghost) parts = parts.map((p) => ({ ...p, op: (p.op ?? 1) * 0.55 }));
  return parts;
}

// The same outline cuts many parts (a belly, spots, a shine), so it travels once: clip becomes
// an index into clips.
export function packed(parts) {
  const clips = [];
  return {
    clips,
    parts: parts.map((p) => {
      if (!p.clip) return p;
      let i = clips.indexOf(p.clip);
      if (i < 0) i = clips.push(p.clip) - 1;
      return { ...p, clip: i };
    }),
  };
}
