// 🚇 지하철 타자 레이스: the map (server/subway-lines.js) as a graph to move on. A station is
// where one or more lines stop; a move goes one stop along the line I am on, typed as that
// stop's name; at a station with other lines, typing a line's name changes to it.
import { LINES } from './subway-lines.js';

// What a typed name is, whatever the spaces and a trailing 역 ("서울역" or "서울").
export const norm = (s) => String(s || '').replace(/\s/g, '').replace(/역$/, '');

// station -> { lines: [line…], next: { line: [neighbour…] } }
const MAP = new Map();
for (const [line, { stations, loop }] of Object.entries(LINES)) {
  stations.forEach((st, i) => {
    const s = MAP.get(st) || { lines: [], next: {} };
    if (!s.lines.includes(line)) s.lines.push(line);
    const ns = (s.next[line] ||= []);
    const prev = i > 0 ? stations[i - 1] : loop ? stations.at(-1) : null;
    const next = i < stations.length - 1 ? stations[i + 1] : loop ? stations[0] : null;
    for (const n of [prev, next]) if (n && !ns.includes(n)) ns.push(n);
    MAP.set(st, s);
  });
}
export const STATIONS = [...MAP.keys()];
const BY_NORM = new Map(STATIONS.map((s) => [norm(s), s]));
export const station = (name) => MAP.get(name) || null;
export const findStation = (typed) => BY_NORM.get(norm(typed)) || null;
// "2호선", "2", "이호선" is too much: a line by its number or full name.
export function findLine(typed) {
  const t = norm(typed).replace(/호선$/, '');
  return Object.keys(LINES).find((l) => l.replace(/호선$/, '') === t) || null;
}
export const lineColor = (line) => LINES[line]?.color || '#888';

// Stops from a station to every other (changing lines costs no stop): what is left to go.
export function stopsFrom(from) {
  const d = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const s = q.shift();
    for (const ns of Object.values(MAP.get(s).next)) for (const n of ns) if (!d.has(n)) { d.set(n, d.get(s) + 1); q.push(n); }
  }
  return d;
}

// The way from one station to another with the fewest stops to type (only stops are typed; a
// change of line just happens), and of those the fewest changes. Each stop says the line it is
// reached on, so a change shows where that line differs from the one before.
// [{ kind: 'stop', name, line, change? }…], or null.
export function planRoute(from, to) {
  const key = (s, l) => `${s}|${l || ''}`;
  const STOP = 1000, CHANGE = 1; // a stop always outweighs any number of changes
  const best = new Map([[key(from, null), 0]]);
  const prev = new Map([[key(from, null), null]]);
  const open = [[0, from, null]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [cost, s, l] = open.shift();
    if (cost > best.get(key(s, l))) continue;
    if (s === to) {
      const steps = [];
      for (let k = key(s, l); prev.get(k); k = prev.get(k).from) if (prev.get(k).step) steps.unshift(prev.get(k).step);
      return steps.map((st, i) => (i > 0 && steps[i - 1].line !== st.line ? { ...st, change: true } : st));
    }
    const here = MAP.get(s);
    const go = (ns, nl, c, step) => {
      const k = key(ns, nl);
      if (best.has(k) && best.get(k) <= cost + c) return;
      best.set(k, cost + c); prev.set(k, { from: key(s, l), step }); open.push([cost + c, ns, nl]);
    };
    for (const line of l ? [l] : here.lines) for (const n of here.next[line]) go(n, line, STOP, { kind: 'stop', name: n, line });
    if (l) for (const line of here.lines) if (line !== l) go(s, line, CHANGE, null);
  }
  return null;
}

// A start and an end whose way takes `min`..`max` things typed (rand: 0..1).
export function pickRoute(rand, min = 10, max = 16) {
  for (let tries = 0; tries < 300; tries++) {
    const from = STATIONS[Math.floor(rand() * STATIONS.length)];
    const d = stopsFrom(from);
    const near = [...d].filter(([, n]) => n >= min - 2 && n <= max).map(([s]) => s);
    if (!near.length) continue;
    const to = near[Math.floor(rand() * near.length)];
    const steps = planRoute(from, to);
    if (steps && steps.length >= min && steps.length <= max) return { from, to, steps };
  }
  throw new Error('no route');
}
