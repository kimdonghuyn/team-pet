#!/usr/bin/env node
// Draws the ⛄ /눈사람 snowmen: one pixel snowman per pet kind, W x H, into
// client/assets/snowmen/<kind>.png. Every one is the same snowman — three balls of snow lit from
// the top left, coal eyes and buttons, a carrot, a red scarf, stick arms — and which animal it is
// shows only in what it has on, in that pet's own colours (scripts/make-pets.js): a knitted hat
// with its ears or horns, a beak or a snout for a nose, a tail, a thing in its hand.
// The pet window scales them with nearest-neighbour, the feet at the bottom of the picture.
//   node scripts/make-snowmen.js [preview.png]   (an enlarged sheet of all, for checking by eye)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PETS, png } from './make-pets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client', 'assets', 'snowmen');
export const W = 36, H = 60;
const DX = 2, DY = 6; // the drawing below is laid out from (0, 0); this much room round it
const SNOW = { hi: '#ffffff', base: '#eef4fc', s1: '#d6e1ef', s2: '#b7c6db', line: '#4e5d78' };
const COAL = '#2b2b33', GLINT = '#8a8a98';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));

// A picture being drawn: each pixel a colour and the colour of the line round its part (or none).
function canvas(W_ = W, H_ = H, DX_ = DX, DY_ = DY) {
  const W = W_, H = H_, DX = DX_, DY = DY_;
  const px = Array.from({ length: H }, () => Array(W).fill(null));
  const put = (x, y, c, o = null) => { x = Math.floor(x) + DX; y = Math.floor(y) + DY; if (x >= 0 && x < W && y >= 0 && y < H) px[y][x] = { c, o }; };
  const at = (x, y) => (x >= 0 && x < W && y >= 0 && y < H ? px[y][x] : null);
  const disc = (cx, cy, rx, ry, fill, o) => { for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) put(x, y, typeof fill === 'function' ? fill(dx, dy) : fill, o); } };
  const tri = (a, b, d, fill, o) => {
    const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    for (let y = Math.floor(Math.min(a[1], b[1], d[1])); y <= Math.max(a[1], b[1], d[1]); y++) for (let x = Math.floor(Math.min(a[0], b[0], d[0])); x <= Math.max(a[0], b[0], d[0]); x++) {
      const p = [x + 0.5, y + 0.5], d1 = s(p, a, b), d2 = s(p, b, d), d3 = s(p, d, a);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) put(x, y, fill, o);
    }
  };
  // A thick line through points (a tail, a banana), `w` pixels wide.
  const path_ = (pts, w, fill, o) => { for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2)); for (let k = 0; k <= n; k++) disc(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, w / 2, w / 2, fill, o); } };
  const line = (pts, c) => { for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); for (let k = 0; k <= n; k++) put(Math.round(a[0] + (b[0] - a[0]) * k / n), Math.round(a[1] + (b[1] - a[1]) * k / n), c); } };
  // The outline grows outward: an empty pixel next to a part takes that part's line colour.
  const done = () => px.map((row, y) => row.map((p, x) => { if (p) return p.c; for (const [a, b] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const q = at(x + a, y + b); if (q && q.o) return q.o; } return null; }));
  return { put, disc, tri, path: path_, line, done };
}

// The animals: what each puts on. Colours come from the pet (hat: the main one).
const KINDS = {
  cat: { hat: 'B', ears: 'pointy', inner: 'P', tail: 'curl' },
  dog: { hat: 'B', ears: 'floppy', earC: 'D', tail: 'stub', hand: 'bone' },
  rabbit: { hat: 'B', ears: 'long', inner: 'P', hand: 'carrot' },
  chick: { hat: 'B', tuft: 'Y', nose: 'beak', beakC: 'Y' },
  penguin: { hat: 'K', band: 'W', pom: 'W', nose: 'beak', beakC: 'Y' },
  hamster: { hat: 'B', ears: 'small', inner: 'P', hand: 'seed' },
  fox: { hat: 'B', ears: 'pointy', inner: 'L', tips: 'D', tail: 'brush' },
  bear: { hat: 'B', ears: 'round', inner: 'D', foot: 'honey' },
  panda: { hat: 'W', ears: 'round', earC: 'K', hand: 'bamboo' },
  frog: { hat: 'B', eyes: true },
  pig: { hat: 'B', ears: 'pointy', inner: 'D', nose: 'snout' },
  mouse: { hat: 'B', ears: 'big', inner: 'P', foot: 'cheese' },
  parrot: { hat: 'B', crest: 'R', nose: 'hook', beakC: 'W', band: 'W' },
  owl: { hat: 'B', ears: 'tufts', nose: 'beak', beakC: 'Y', rings: 'W' },
  hedgehog: { hat: 'K', spikes: 'T' },
  duck: { hat: 'L', pom: 'Y', nose: 'bill', beakC: 'Y', foot: 'ring' },
  tiger: { hat: 'B', ears: 'round', inner: 'W', stripes: 'K', tail: 'striped' },
  ox: { hat: 'W', spots: 'K', horns: 'Y', bell: true },
  snake: { hat: 'B', zig: 'L', tongue: 'M', tail: 'snake' },
  horse: { hat: 'B', ears: 'pointy', inner: 'L', mane: 'D' },
  sheep: { hat: 'W', fluffy: true, ears: 'side', earC: 'K' },
  monkey: { hat: 'B', ears: 'side', earC: 'L', hand: 'banana' },
  rooster: { hat: 'W', comb: 'R', nose: 'beak', beakC: 'Y', wattle: 'R' },
  shark: { hat: 'B', fin: 'B', tail: 'fin' },
  dragon: { hat: 'B', horns: 'Y', ridge: 'L', tail: 'dragon' },
  mochi: { hat: 'B', ears: 'round', inner: 'P' },
  bluecat: { hat: 'D', ears: 'pointy', inner: 'P', tail: 'curl' },
  lemonbun: { hat: 'B', ears: 'long', inner: 'L', hand: 'carrot' },
  otter: { hat: 'B', ears: 'small', inner: 'L', tail: 'stub' },
  seal: { hat: 'D', pom: 'B' },
  ghost: { hat: 'B', pom: 'P' },
  sprout: { hat: 'B', tuft: 'G' },
  unicorn: { hat: 'B', horn: 'Y', ears: 'pointy', inner: 'R' },
  capybara: { hat: 'B', ears: 'small', inner: 'D', pom: 'T' },
  axolotl: { hat: 'B', ears: 'side', earC: 'R', pom: 'R', tail: 'fin' },
};

// Parts that move on their own in the pet window (a wagging tail, a bone thrown up) are drawn
// apart, each in a picture the size of the snowman, and left out of the snowman itself.
export const PARTS = { cat: ['tail'], dog: ['tail', 'bone'], fox: ['tail'], snake: ['tail'], rabbit: ['carrot'], monkey: ['banana'], panda: ['bamboo'] };
export function draw(kind, part = null) {
  const pet = PETS[kind], k = KINDS[kind] || {}, col = pet.colors;
  const apart = PARTS[kind] || [];
  const want = (p) => (part ? part === p : !apart.includes(p));
  const C = (letter, fb) => col[letter] || fb;
  const g = canvas(), { put, disc, tri, path: tube, line } = g;
  const dark = col.O, hat = C(k.hat, '#d94848'), rib = mix(hat, '#000000', 0.18), hatHi = mix(hat, '#ffffff', 0.3);
  // Behind everything: the tail and what stands at the feet.
  const tail = { curl: [[26, 45], [29, 43], [30, 40], [29, 37], [27.5, 36]], brush: [[26, 47], [29, 46], [31, 43], [31.5, 40]], stub: [[26, 42], [28.5, 40]], striped: [[26, 45], [29, 43], [30, 40], [29, 37]], snake: [[6, 48], [3, 47], [2, 44], [4, 42]], dragon: [[26, 47], [29, 46], [31, 44], [31.5, 41]], fin: [[26, 44], [29, 44]] }[k.tail];
  if (tail && want('tail')) {
    const tc = C(k.hat, '#888');
    tube(tail, k.tail === 'brush' ? 4 : 2.6, tc, dark);
    if (k.tail === 'brush') disc(31.5, 39.5, 2, 2, C('L', '#fff'), dark);
    if (k.tail === 'curl') disc(27.5, 36, 1.3, 1.3, mix(tc, '#ffffff', 0.4), dark);
    if (k.tail === 'striped') for (const [x, y] of [[28, 44], [30, 41], [29.5, 38]]) put(x, y, C('K', '#222'));
    if (k.tail === 'dragon') tri([30, 41], [34, 41], [32, 37], C('Y', '#fd6'), dark);
    if (k.tail === 'fin') tri([28, 41], [28, 47], [33, 44], tc, dark);
  }
  if (part === 'tail') return g.done();
  const bone = () => { tube([[29, 18], [33, 12]], 2, '#fbf7ee', '#9a8f78'); for (const [x, y] of [[28.6, 18.8], [29.8, 19.2], [32.4, 11.4], [33.8, 12]]) disc(x, y, 1.4, 1.4, '#fbf7ee', '#9a8f78'); };
  const carrot = () => { tri([29, 12], [33, 12], [31, 22], '#f28a2e', '#9a4a14'); for (const y of [14, 17, 20]) put(30.5, y, '#d86a1c'); tri([30, 12], [31, 8], [32, 12], '#5fb34a', '#2f6a2a'); tri([31, 12], [34, 9], [32, 12], '#5fb34a', '#2f6a2a'); };
  const banana = () => { tube([[29, 18], [31.5, 15], [32, 11], [31, 8]], 2.4, '#f6d23c', '#9a7a14'); put(31, 7, '#6b4426'); };
  const bamboo = () => { tube([[30, 22], [30, 6]], 2.4, '#7cc46a', '#2f6a2a'); for (const y of [9, 14, 19]) line([[29, y], [31, y]], '#3c7a2e'); tri([31, 8], [35, 5], [32, 10], '#5fa84a', '#2f6a2a'); };
  const held = { bone, carrot, banana, bamboo };
  if (held[part]) { held[part](); return g.done(); }
  // Snow: three balls lit from the top left; where a ball lies over the one below, a seam.
  const ball = (cx, cy, r, under) => disc(cx, cy, r, r, (dx, dy) => {
    const d = Math.hypot(dx, dy), v = -dx * 0.55 - dy * 0.75 + (d < 0.35 ? 0.25 : 0);
    if (under && d > 1 - 1.2 / r && dy > 0) return SNOW.s2;
    return v > 0.62 ? SNOW.hi : v > -0.15 ? SNOW.base : v > -0.6 ? SNOW.s1 : SNOW.s2;
  }, SNOW.line);
  ball(16, 41, 10.5); ball(16, 26.5, 7.8, true); ball(16, 14, 6.6, true);
  if (k.foot === 'ring') { disc(16, 41, 12.5, 3.4, (dx) => (Math.floor((dx + 1) * 6) % 2 ? '#ffffff' : C('Y', '#f90')), dark); disc(16, 41, 10.4, 1.6, SNOW.s1); }
  // Arms: sticks with a twig — or what the animal holds instead.
  const brown = '#6b4426';
  line([[9, 26], [3, 21], [1, 18]], brown); line([[4, 22], [3, 25]], brown);
  if (k.hand === 'bamboo') { tube([[24, 26], [30, 20]], 1.6, '#5fa84a', '#2f6a2a'); if (want('bamboo')) bamboo(); }
  else {
    line([[23, 26], [29, 21], [31, 18]], brown); line([[28, 22], [30, 24]], brown);
    if (k.hand === 'carrot' && want('carrot')) carrot();
    if (k.hand === 'bone' && want('bone')) bone();
    if (k.hand === 'seed') { disc(31, 15, 2.4, 3.4, '#8a6a4a', '#3a2a1a'); line([[30, 13], [30, 17]], '#f2e6c8'); line([[32, 13], [32, 17]], '#3a2a1a'); }
    if (k.hand === 'banana' && want('banana')) banana();
  }
  if (part) return g.done();
  // At the feet.
  if (k.foot === 'honey') { disc(30, 47, 3.6, 3.8, '#c98a2b', '#6b4414'); disc(30, 43.6, 3, 1, '#f6c344', '#6b4414'); line([[27.5, 46], [32.5, 46]], '#f6e2a8'); }
  if (k.foot === 'cheese') { tri([25, 50], [34, 50], [34, 44], '#f6c93c', '#9a7a14'); for (const [x, y] of [[31, 47], [33, 48], [32, 45]]) put(x, y, '#d8a420'); }
  // Coal buttons with a glint.
  for (const y of [23, 27, 31]) { disc(16, y + 1, 1.1, 1.1, COAL); put(15, y, GLINT); }
  // The hat, its ears, horns or spikes.
  const ears = {
    pointy: () => { for (const s of [-1, 1]) { tri([16 + s * 9, 9], [16 + s * 3, 6], [16 + s * 8, -1], hat, dark); tri([16 + s * 7, 7], [16 + s * 4.5, 6], [16 + s * 7, 2], C(k.inner, hatHi)); if (k.tips) tri([16 + s * 8.8, 2], [16 + s * 7, 2], [16 + s * 8, -1], C(k.tips, dark)); } },
    round: () => { for (const s of [-1, 1]) { disc(16 + s * 6.5, 4.5, 3, 3, C(k.earC, hat), dark); disc(16 + s * 6.5, 4.5, 1.6, 1.6, C(k.inner, hatHi)); } },
    small: () => { for (const s of [-1, 1]) { disc(16 + s * 6, 5, 2.2, 2.2, hat, dark); disc(16 + s * 6, 5, 1, 1, C(k.inner, hatHi)); } },
    big: () => { for (const s of [-1, 1]) { disc(16 + s * 7.5, 3.5, 4.4, 4.4, hat, dark); disc(16 + s * 7.5, 3.5, 2.6, 2.6, C(k.inner, hatHi)); } },
    long: () => { for (const s of [-1, 1]) { disc(16 + s * 3.5, -1, 2.3, 6.2, hat, dark); disc(16 + s * 3.5, -0.5, 1, 4.6, C(k.inner, hatHi)); } },
    floppy: () => { for (const s of [-1, 1]) disc(16 + s * 8.6, 11, 2.4, 4.8, C(k.earC, hat), dark); },
    tufts: () => { for (const s of [-1, 1]) tri([16 + s * 8.5, 7], [16 + s * 4, 5.5], [16 + s * 9.5, 0], hat, dark); },
    side: () => { for (const s of [-1, 1]) { disc(16 + s * 8.4, 13, 2.6, 2.6, C(k.earC, hat), dark); disc(16 + s * 8.4, 13, 1.2, 1.2, mix(C(k.earC, hat), '#000000', 0.15)); } },
  }[k.ears];
  if (ears && !['floppy', 'side'].includes(k.ears)) ears();
  if (k.horn) tri([14, 6.5], [18, 6.5], [16, -4], C(k.horn, '#fd6'), dark);
  if (k.horns) for (const s of [-1, 1]) tri([16 + s * 8, 8], [16 + s * 3, 6], [16 + s * 9.5, 0], C(k.horns, '#eee'), dark);
  if (k.ridge) for (const sx of [12.5, 16, 19.5]) tri([sx - 1.8, 6], [sx + 1.8, 6], [sx, 1.5], C(k.ridge, '#cfc'), dark);
  if (k.spikes) for (let i = 0; i < 9; i++) { const a = Math.PI * (0.05 + 0.9 * i / 8), bx = 16 - Math.cos(a) * 7.5, by = 9 - Math.sin(a) * 3.5; tri([bx - 1.8, by + 1], [bx + 1.8, by + 1], [16 - Math.cos(a) * 11.5, 9 - Math.sin(a) * 8], i % 2 ? C(k.spikes, hat) : hat, dark); }
  if (k.fin) tri([12, 6], [20, 6], [17.5, -3], C(k.fin, hat), dark);
  if (k.crest) for (const [a, b, c] of [[[14, 6], [17, 6], [12, -1]], [[15, 6], [18, 6], [16, -2.5]], [[16, 6], [19, 6], [20, -1]]]) tri(a, b, c, C(k.crest, '#e33'), dark);
  if (k.comb) { for (const x of [13.5, 16, 18.5]) disc(x, 3.6 - (x === 16 ? 1 : 0), 2, 2.4, C(k.comb, '#e33'), dark); }
  if (k.tuft) for (const [a, b, c] of [[[14.5, 6], [16.5, 6], [14, 1.5]], [[15.5, 6], [17.5, 6], [17.5, 1]]]) tri(a, b, c, C(k.tuft, '#f90'), dark);
  if (k.mane) for (let i = 0; i < 4; i++) tri([12 + i * 2.5, 6], [14.5 + i * 2.5, 6], [13 + i * 2.5, 1.5 - (i % 2)], C(k.mane, dark), dark);
  if (k.eyes) for (const s of [-1, 1]) { disc(16 + s * 4.5, 4.5, 3, 3, hat, dark); disc(16 + s * 4.5, 4.5, 2, 2, C('W', '#fff')); disc(16 + s * 4.5 + 0.5, 4.8, 1, 1.1, C('E', COAL)); }
  if (k.fluffy) { for (let i = 0; i < 7; i++) disc(9 + i * 2.35, 6.5 - Math.sin(i / 6 * Math.PI) * 2.2, 2.4, 2.4, '#ffffff', '#9a9aa8'); }
  // The hat itself: a dome, its rim knitted in ribs, a shine on the top left.
  for (let y = 5; y <= 11; y++) for (let x = 7; x <= 25; x++) {
    const dx = x + 0.5 - 16, dy = y + 0.5 - 12.5; if (Math.hypot(dx * 0.92, dy * 1.25) > 8.2) continue;
    let c = y >= 10 ? (x % 2 ? rib : hat) : (dx < -2 && dy < -2.5 ? hatHi : hat);
    if (k.fluffy && y < 10) c = (x + y) % 3 ? '#ffffff' : '#e6e6ee';
    if (k.band && y === 8) c = C(k.band, '#fff');
    if (k.zig && y < 10 && (x + (y % 2)) % 4 === 0) c = C(k.zig, hatHi);
    if (k.stripes && y < 10 && [10, 15, 21].includes(x)) c = C(k.stripes, dark);
    if (k.spots && ((x === 11 && y >= 7 && y <= 8) || (x === 12 && y === 7) || (x >= 19 && x <= 20 && y >= 6 && y <= 7))) c = C(k.spots, dark);
    put(x, y, c, dark);
  }
  if (ears && ['floppy', 'side'].includes(k.ears)) ears();
  if (k.pom) disc(16, 3.6, 2.4, 2.4, C(k.pom, '#fff'), dark);
  // The face: coal eyes with a glint (in rings for the owl), the nose, a smile of coal.
  if (k.rings) for (const ex of [13.5, 18.5]) disc(ex, 14, 2.6, 2.6, C(k.rings, '#fff'), mix(C(k.hat), '#000000', 0.2));
  for (const ex of [13, 18]) { put(ex, 13, COAL); put(ex + 1, 13, COAL); put(ex, 14, COAL); put(ex + 1, 14, COAL); put(ex, 13, GLINT); }
  const beak = C(k.beakC, '#f90'), beakD = mix(beak, '#000000', 0.25);
  if (k.nose === 'beak') { tri([14, 15.5], [18, 15.5], [16, 19], beak, beakD); line([[15, 16], [17, 16]], mix(beak, '#ffffff', 0.3)); }
  else if (k.nose === 'bill') { disc(16, 17, 3.4, 1.6, beak, beakD); line([[13.5, 17], [18.5, 17]], beakD); }
  else if (k.nose === 'hook') { disc(16, 16.4, 2, 1.8, beak, mix(beak, '#000000', 0.4)); tri([14.5, 17], [17.5, 17], [16, 19.5], beak, mix(beak, '#000000', 0.4)); }
  else if (k.nose === 'snout') { disc(16, 16.6, 2.6, 1.9, C('L', '#f9a'), C('N', '#934')); put(15, 16, C('N', '#934')); put(17, 16, C('N', '#934')); }
  else [[16, 15, '#f7a24a'], [17, 15, '#f28a2e'], [18, 15, '#f28a2e'], [19, 15, '#e0741c'], [20, 16, '#e0741c'], [21, 16, '#c8601a'], [16, 16, '#e0741c'], [17, 16, '#d86a1c'], [18, 16, '#c8601a']].forEach(([x, y, c]) => put(x, y, c, '#9a4a14'));
  if (!['bill', 'hook'].includes(k.nose)) for (const [x, y] of [[12, 17], [13, 18], [15, 19], [17, 19], [19, 18]]) put(x, y, COAL);
  if (k.tongue) { line([[16, 19], [16, 22]], C(k.tongue, '#c33')); put(15, 23, C(k.tongue, '#c33')); put(17, 23, C(k.tongue, '#c33')); }
  if (k.wattle) disc(16, 20.5, 1.2, 1.8, C(k.wattle, '#e33'), dark);
  // The scarf round the neck, a darker fold, the end hanging down the right with a fringe.
  const scarf = '#d94848', fold = '#a83232';
  for (let x = 10; x <= 22; x++) { put(x, 20, scarf, '#7a2228'); put(x, 21, x % 3 ? scarf : fold, '#7a2228'); }
  for (let y = 22; y <= 27; y++) { put(19, y, scarf, '#7a2228'); put(20, y, fold, '#7a2228'); }
  put(19, 28, '#f2e6c8'); put(20, 28, '#f2e6c8');
  if (k.bell) { disc(16, 22.6, 1.8, 1.8, C('Y', '#fd6'), '#8a6a14'); put(15, 22, '#fff6c8'); }
  return g.done();
}
const rgba = (h) => [...hex(h), 255];
// Small things that come and go round a snowman: a ball of yarn (the cat's), a fly (the frog's).
export const PROPS = {
  yarn: [12, 12, (g) => {
    g.disc(5, 5, 5, 5, (dx, dy) => (-dx * 0.6 - dy * 0.8 > 0.55 ? '#ff8a8a' : '#e04848'), '#7a1f24');
    for (const p of [[[2, 3], [8, 1]], [[1, 6], [9, 3]], [[2, 8], [9, 6]], [[4, 9], [9, 8]]]) g.line(p, '#b02c34');
    g.put(3, 2, '#ffd0d0');
  }],
  fly: [8, 7, (g) => {
    g.disc(2.5, 1.6, 1.8, 1.5, '#d8f0ff', '#6a8aa8'); g.disc(5, 1.6, 1.8, 1.5, '#d8f0ff', '#6a8aa8');
    g.disc(3.8, 3.8, 2.2, 1.6, '#2b2b33', '#111118'); g.put(5, 3, '#c83a3a');
  }],
};
// The rest of the animals' things. Each is drawn from (0, 0), its outline grown round it.
const feather = (c, d) => (g) => { g.tri([2, 0], [5, 3], [2, 9], c, d); g.tri([2, 0], [0, 4], [2, 9], c, d); g.line([[2, 2], [2, 10]], d); };
Object.assign(PROPS, {
  seed: [5, 7, (g) => { g.disc(2, 3, 1.6, 2.6, '#6a4a32', '#2a1a10'); g.line([[1, 2], [1, 4]], '#f2e6c8'); g.put(3, 2, '#3a2a1a'); }],
  bee: [9, 8, (g) => {
    g.disc(3, 1.8, 1.8, 1.6, '#e8f6ff', '#7a9ab8'); g.disc(5.6, 1.8, 1.8, 1.6, '#e8f6ff', '#7a9ab8');
    g.disc(4.4, 4.6, 3.4, 2.2, '#f6c93c', '#3a2a10'); g.line([[3, 3], [3, 6]], '#2b2b33'); g.line([[5, 3], [5, 6]], '#2b2b33'); g.put(7, 4, '#2b2b33');
  }],
  foxfire: [7, 10, (g) => { g.disc(3, 6.5, 3, 3, (dx, dy) => (Math.hypot(dx, dy) < 0.5 ? '#ffffff' : '#7fd4ff'), '#2f7ad0'); g.tri([0.5, 6], [5.5, 6], [3.5, -0.5], '#7fd4ff', '#2f7ad0'); g.disc(3, 6.6, 1.2, 1.4, '#ffffff'); }],
  heart: [9, 8, (g) => { g.disc(2.5, 2.5, 2.5, 2.5, '#ff7a9a', '#b02c54'); g.disc(6, 2.5, 2.5, 2.5, '#ff7a9a', '#b02c54'); g.tri([0.2, 3.4], [8.3, 3.4], [4.25, 7.6], '#ff7a9a', '#b02c54'); g.put(2, 1, '#ffd6e2'); }],
  'feather-r': [6, 11, feather('#ff5a4a', '#8a1a14')],
  'feather-g': [6, 11, feather('#5fd06a', '#1f6a2a')],
  'feather-y': [6, 11, feather('#ffd23c', '#8a6a10')],
  duckie: [11, 9, (g) => {
    g.disc(5, 6, 4.6, 2.6, '#ffd23c', '#8a6a10'); g.disc(7.4, 2.6, 2.4, 2.4, '#ffd23c', '#8a6a10');
    g.tri([9, 2.4], [11, 3], [9, 3.8], '#ff8a2e', '#8a3a10'); g.put(8, 2, '#2b2b33'); g.line([[2, 6], [5, 5]], '#e8b020');
  }],
  note: [8, 11, (g) => { g.disc(2.6, 8, 2.2, 1.8, '#ffd36e', '#7a5a10'); g.path([[4.2, 1.5], [4.2, 8]], 1.4, '#ffd36e', '#7a5a10'); g.path([[4.4, 1.5], [6.8, 3], [6.8, 4.5]], 1.4, '#ffd36e', '#7a5a10'); }],
  peel: [11, 8, (g) => {
    g.disc(5.5, 5.5, 2.4, 2.2, '#f6d23c', '#9a7a14'); g.path([[4.5, 4.5], [1.5, 1.5], [0.5, 4]], 1.8, '#f6d23c', '#9a7a14');
    g.path([[6.5, 4.5], [9.5, 1.5], [10.5, 4]], 1.8, '#f6d23c', '#9a7a14'); g.path([[5.5, 4], [5.5, 0.5]], 1.8, '#f6d23c', '#9a7a14'); g.put(5, 7, '#6b4426');
  }],
  sun: [15, 15, (g) => {
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.tri([7.5 + Math.cos(a + 0.3) * 4.5, 7.5 + Math.sin(a + 0.3) * 4.5], [7.5 + Math.cos(a - 0.3) * 4.5, 7.5 + Math.sin(a - 0.3) * 4.5], [7.5 + Math.cos(a) * 7.4, 7.5 + Math.sin(a) * 7.4], '#ffb12e', '#b05a10'); }
    g.disc(7.5, 7.5, 4.4, 4.4, (dx, dy) => (-dx - dy > 0.7 ? '#fff2b0' : '#ffd24a'), '#b05a10');
  }],
  apple: [7, 8, (g) => { g.disc(3.5, 4.8, 3.2, 3, (dx, dy) => (-dx - dy > 0.9 ? '#ff9a8a' : '#e0302e'), '#7a1414'); g.line([[3, 0], [3, 2]], '#6b4426'); g.tri([4, 1.5], [6.5, 0.5], [4.5, 2.5], '#5fb34a', '#2f6a2a'); }],
  leaf: [8, 8, (g) => { g.tri([4, 0], [0.5, 4], [4, 7.5], '#ff7a2e', '#8a3010'); g.tri([4, 0], [7.5, 4], [4, 7.5], '#ff9a3c', '#8a3010'); g.tri([0, 2], [4, 4], [2, 5.5], '#ff7a2e', '#8a3010'); g.tri([8, 2], [4, 4], [6, 5.5], '#ff9a3c', '#8a3010'); g.line([[4, 2], [4, 8]], '#b04a14'); }],
  fin: [9, 8, (g) => { g.tri([0.5, 7.5], [8.5, 7.5], [5.5, 0], '#7a8aa8', '#2a3a5a'); g.tri([5, 1.5], [7.4, 7], [5.6, 7], '#c8d4e8'); }],
});
export function prop(name) { const [w, h, fn] = PROPS[name]; const g = canvas(w, h, 0, 0); fn(g); return { w, h, map: g.done() }; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const missing = Object.keys(PETS).filter((p) => !KINDS[p]);
  if (missing.length) throw new Error(`no snowman for: ${missing.join(', ')}`);
  fs.mkdirSync(OUT, { recursive: true });
  for (const kind of Object.keys(PETS)) {
    const m = draw(kind);
    fs.writeFileSync(path.join(OUT, `${kind}.png`), png(W, H, (x, y) => (m[y][x] ? rgba(m[y][x]) : [0, 0, 0, 0])));
  }
  for (const [kind, parts] of Object.entries(PARTS)) for (const p of parts) {
    const m = draw(kind, p);
    fs.writeFileSync(path.join(OUT, `${kind}-${p}.png`), png(W, H, (x, y) => (m[y][x] ? rgba(m[y][x]) : [0, 0, 0, 0])));
  }
  for (const name of Object.keys(PROPS)) {
    const { w, h, map } = prop(name);
    fs.writeFileSync(path.join(OUT, `fx-${name}.png`), png(w, h, (x, y) => (map[y][x] ? rgba(map[y][x]) : [0, 0, 0, 0])));
  }
  const preview = process.argv[2];
  if (preview) {
    const kinds = Object.keys(PETS), Z = 4, CW = (W + 4) * Z, CH = (H + 4) * Z, COLS = 9;
    const maps = kinds.map(draw);
    fs.writeFileSync(preview, png(COLS * CW, Math.ceil(kinds.length / COLS) * CH, (x, y) => {
      const i = Math.floor(y / CH) * COLS + Math.floor(x / CW), px = Math.floor((x % CW) / Z) - 2, py = Math.floor((y % CH) / Z) - 2;
      const c = maps[i] && px >= 0 && px < W && py >= 0 && py < H ? maps[i][py][px] : null;
      return c ? rgba(c) : [43, 58, 85, 255];
    }));
  }
  console.log(`${Object.keys(PETS).length} snowmen ${W}x${H} → ${path.relative(ROOT, OUT)}`);
}
