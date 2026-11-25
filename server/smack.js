// 🦶 날려버리기: kick someone on my floor (or 뿅망치 them) across the screen. The one who does it
// aims first — an angle and a power, on their own screen — and everyone on the floor then sees it
// fly that way, bounce and fall flat. Only a show: nothing is kept but the clocks that stop it
// from turning into chaos when everyone keeps doing it.
//   - SMACK_GAP_MS: one of mine every 30 s.
//   - AIM_MS: while I aim the floor is mine (nobody else starts one), for at most this long.
//   - SHOW_MS: one in the air per floor at a time (the show lasts up to ~10 s).
//   - SAFE_MS: whoever just flew is left alone for 20 s after landing.
// Whoever is busy (fishing, in a game) or said no (pet ⚙️) is told apart by the caller.
export const SMACK_GAP_MS = 30_000, AIM_MS = 20_000, SHOW_MS = 11_000, SAFE_MS = 20_000;
export const SMACK_HOWS = ['kick', 'hammer'];
const err = (status, message) => Object.assign(new Error(message), { status });
const secs = (ms) => Math.ceil(ms / 1000);
// The aim as the screens draw it: 12°..68° up, power 0.12..1. Anything else (an older program
// that does not aim) gets a fair middle.
export function cleanAim(angle, power) {
  const a = Number(angle), p = Number(power);
  return { angle: Number.isFinite(a) ? Math.round(Math.max(12, Math.min(68, a))) : 40, power: Number.isFinite(p) ? Math.round(Math.max(0.12, Math.min(1, p)) * 100) / 100 : 0.6 };
}

// 🚀 우주: a hit at 90% power or more, at any angle, leaves the screen for a while.
export const SPACE_POWER = 0.9;
export const isSpace = (aim) => aim.power >= SPACE_POWER;

// 🏀 골대: on every aim a hoop stands somewhere along the way, for the one aiming and then for
// everyone. It is placed, and the flight judged, in "reaches" — the full-power 45° flight
// is one reach long on every screen (server/pet.ps1 Smk-Plan: v = √(reach·g)·power^0.6) — so each
// screen lays the same hoop out over its own width. A hoop stands anywhere, evenly, from a fifth to
// about three quarters of a reach out and a little to a quarter of a reach up, wherever some flight
// at 30–85% power comes down onto it (never at the far end, which only a 우주 hit reaches). Where the flight comes
// down through the ring's height decides the shot (shotAt): within HOOP_W of the middle it drops
// clean through; a little off (RIM_W, or anywhere between the far rim and the board) it hits the rim
// and drops in or springs out. Longer, it reaches the board — BOARD_DX past the ring's middle,
// standing BOARD_H above the ring — and is off the board only when it meets that face within it:
// higher, it sails over and misses. In or out off the rim and the board is the hub's throw of the
// dice, sent with the hit, so every screen plays the same one.
export const HOOP_CHANCE = 1, HOOP_W = 0.02, RIM_W = 0.04, BOARD_DX = 0.045, BOARD_H = 0.06, RIM_IN = 0.35, BANK_IN = 0.4;
export const SHOTS = ['swish', 'rim-in', 'rim-out', 'bank-in', 'bank-out', 'miss', 'ace', 'roll-in', 'roll-short', 'lip-out'];
export const isGoalShot = (shot) => ['swish', 'rim-in', 'bank-in', 'ace', 'roll-in'].includes(shot);

const lift = (power) => Math.pow(power, 1.2); // v² / (reach·g)
// Whether some whole-degree aim at 30–85% power comes down (past its top) right onto (fx, fy).
function reachable(fx, fy) {
  for (let deg = 15; deg <= 65; deg++) {
    const a = (deg * Math.PI) / 180, rise = fx * Math.tan(a) - fy;
    if (rise <= 0) continue;
    const P = (fx * fx) / (2 * Math.cos(a) ** 2 * rise), power = P ** (1 / 1.2);
    if (power >= 0.3 && power <= 0.85 && fx >= P * Math.sin(a) * Math.cos(a)) return true;
  }
  return false;
}
export function newHoop(rand = Math.random) {
  for (let i = 0; i < 200; i++) {
    const fx = 0.2 + rand() * 0.52, fy = 0.05 + rand() * 0.2;
    if (reachable(fx, fy)) return { fx: Math.round(fx * 1000) / 1000, fy: Math.round(fy * 1000) / 1000 };
  }
  return { fx: 0.45, fy: 0.112 };
}
// ⛳ 골프: the other target, a hole on the ground from a quarter to three quarters of a reach out.
// The flight first lands (in reaches: power^1.2 · sin 2θ) and then rolls on, the further the
// flatter it was kicked (ROLL_K · power^1.2 · cos²θ: kicked low it runs, lofted it stops). Landing
// within CUP_W of the hole drops straight in (홀인원). Short of it, it rolls: stopping before the
// cup is short; reaching the cup with no more than DROP_W of roll left, slow enough, it drops in;
// with more, it rattles over the cup and out. Landing a little long (LIP_W) rattles out too.
export const CUP_W = 0.02, ROLL_K = 0.2, DROP_W = 0.04, LIP_W = 0.04, SHORT_W = 0.06;
export const newGolf = (rand = Math.random) => ({ kind: 'golf', fx: Math.round((0.25 + rand() * 0.5) * 1000) / 1000 });
// A target for an aim: a hoop or a hole, half and half.
export const newTarget = (rand = Math.random) => (rand() < 0.5 ? { kind: 'hoop', ...newHoop(rand) } : newGolf(rand));
// Where it lands and where it stops rolling, both from the hole (in reaches; less than 0 short of it).
export function golfDetail(aim, golf) {
  const a = (aim.angle * Math.PI) / 180, P = lift(aim.power), dx = P * Math.sin(2 * a) - golf.fx;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return { dx: r3(dx), stop: r3(dx + ROLL_K * P * Math.cos(a) ** 2) };
}
// One of SHOTS, or null with no hole or for a 우주 hit (which leaves before it gets there).
export function golfShot(aim, golf) {
  if (!golf || isSpace(aim)) return null;
  const { dx, stop } = golfDetail(aim, golf);
  if (Math.abs(dx) <= CUP_W) return 'ace';
  if (dx < 0) {
    if (stop < -CUP_W) return stop >= -SHORT_W ? 'roll-short' : 'miss';
    return stop <= DROP_W ? 'roll-in' : 'lip-out';
  }
  return dx <= LIP_W ? 'lip-out' : 'miss';
}

// How far past the hoop's middle (in reaches; less than 0 short of it) the flight comes down through
// the ring's height, or null when it never gets that high.
export function crossing(aim, hoop) {
  const a = (aim.angle * Math.PI) / 180, tan = Math.tan(a), k = 1 / (2 * lift(aim.power) * Math.cos(a) ** 2);
  const d = tan * tan - 4 * k * hoop.fy;
  return d < 0 ? null : (tan + Math.sqrt(d)) / (2 * k) - hoop.fx;
}
// How high (in reaches) the flight is at x reaches out.
export function heightAt(aim, x) {
  const a = (aim.angle * Math.PI) / 180;
  return x * Math.tan(a) - (x * x) / (2 * lift(aim.power) * Math.cos(a) ** 2);
}
// Where the shot meets the hoop, for the screens to aim their drawing at: dx, how far past the
// ring's middle it comes down (in reaches; less than 0 short of it, null when it never gets that
// high), and up, how high up the board it meets the board's face (0 at the ring, 1 at the top).
export function shotDetail(aim, hoop) {
  const dx = crossing(aim, hoop), up = (heightAt(aim, hoop.fx + BOARD_DX) - hoop.fy) / BOARD_H;
  return { dx: dx === null ? null : Math.round(dx * 1000) / 1000, up: Math.round(Math.max(0, Math.min(1, up)) * 100) / 100 };
}
// One of SHOTS, or null with no hoop or for a 우주 hit (which leaves before it gets there).
export function shotAt(aim, hoop, rand = Math.random) {
  if (!hoop || isSpace(aim)) return null;
  const dx = crossing(aim, hoop);
  if (dx === null) return 'miss';
  if (Math.abs(dx) <= HOOP_W) return 'swish';
  if (Math.abs(dx) <= RIM_W || (dx > 0 && dx <= BOARD_DX)) return rand() < RIM_IN ? 'rim-in' : 'rim-out';
  if (dx > 0) {
    // Long: does it meet the board's face within the board, or sail over it?
    const up = heightAt(aim, hoop.fx + BOARD_DX) - hoop.fy;
    if (up >= 0 && up <= BOARD_H) return rand() < BANK_IN ? 'bank-in' : 'bank-out';
  }
  return 'miss';
}

export class Smacks {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.by = new Map(); // "userId@floor" -> when they last sent someone flying
    this.safe = new Map(); // "userId@floor" -> left alone until
    this.air = new Map(); // floor -> { until, aim: userId aiming, or null when someone flies }
  }

  // Everything that would stop it, for `from` (an aim of their own on the floor does not).
  check(floor, from, to, how, busy) {
    if (!SMACK_HOWS.includes(how)) throw err(400, '발차기나 뿅망치만 돼요');
    if (!to || from === to) throw err(400, '나 자신은 날릴 수 없어요');
    if (busy) throw err(409, busy);
    const t = this.now();
    const wait = (this.by.get(`${from}@${floor}`) ?? -Infinity) + SMACK_GAP_MS - t;
    if (wait > 0) throw err(429, `${secs(wait)}초 뒤에 다시 날릴 수 있어요`);
    const air = this.air.get(floor);
    if (air && air.until > t && air.aim !== from) throw err(409, air.aim ? '지금 다른 사람이 조준하는 중이에요. 잠깐 뒤에 해 주세요' : '지금 다른 사람이 날아가는 중이에요. 잠깐 뒤에 해 주세요');
    const safe = (this.safe.get(`${to}@${floor}`) ?? -Infinity) - t;
    if (safe > 0) throw err(409, `방금 날아갔다 온 사람이에요 (${secs(safe)}초 동안 보호)`);
    return t;
  }

  // I start aiming: the floor is held for me a little while.
  aim(floor, from, to, how, busy = '', hoop = null) {
    const t = this.check(floor, from, to, how, busy);
    this.air.set(floor, { until: t + AIM_MS, aim: from, hoop });
    return { how, ...(hoop ? { hoop } : {}) };
  }

  // I let go (no aim needed: an older program hits at once).
  hit(floor, from, to, how, busy = '') {
    const t = this.check(floor, from, to, how, busy);
    // The hoop I aimed at, if one stood there.
    const held = this.air.get(floor), hoop = held?.aim === from ? held.hoop || null : null;
    this.by.set(`${from}@${floor}`, t);
    this.air.set(floor, { until: t + SHOW_MS, aim: null });
    this.safe.set(`${to}@${floor}`, t + SHOW_MS + SAFE_MS);
    for (const [k, until] of this.safe) if (until < t) this.safe.delete(k);
    return { how, ...(hoop ? { hoop } : {}) };
  }

  // I stopped aiming: the floor is free again.
  cancel(floor, from) {
    if (this.air.get(floor)?.aim === from) this.air.delete(floor);
  }
}
