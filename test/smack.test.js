import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Smacks, cleanAim, SMACK_GAP_MS, SHOW_MS, SAFE_MS, AIM_MS } from '../server/smack.js';

test('🦶 날려버리기: one of mine per 30 s, one in the air per floor, the one who flew left alone', () => {
  let t = 0;
  const s = new Smacks({ now: () => t });
  assert.throws(() => s.hit('1층', 'a', 'b', 'punch'), { status: 400 });
  assert.throws(() => s.hit('1층', 'a', 'a', 'kick'), { status: 400 });
  assert.throws(() => s.hit('1층', 'a', 'b', 'kick', '낚시하는 중이에요'), { status: 409, message: /낚시/ });
  assert.deepEqual(s.hit('1층', 'a', 'b', 'kick'), { how: 'kick' });
  // Someone else, while b is still up in the air.
  assert.throws(() => s.hit('1층', 'c', 'd', 'hammer'), { status: 409, message: /날아가는 중/ });
  // Another floor is its own sky.
  s.hit('2층', 'c', 'd', 'hammer');
  t += SHOW_MS;
  // a again too soon; b just landed and is kept safe.
  assert.throws(() => s.hit('1층', 'a', 'c', 'kick'), { status: 429, message: new RegExp(`${(SMACK_GAP_MS - SHOW_MS) / 1000}초 뒤`) });
  assert.throws(() => s.hit('1층', 'c', 'b', 'kick'), { status: 409, message: /보호/ });
  s.hit('1층', 'c', 'a', 'hammer');
  t += SAFE_MS;
  s.hit('1층', 'd', 'b', 'kick');
  t = SMACK_GAP_MS + SHOW_MS + SAFE_MS;
  s.hit('1층', 'a', 'c', 'kick');
});

test('🦶 aiming holds the floor for the one aiming; a cancel or the clock lets it go', () => {
  let t = 0;
  const s = new Smacks({ now: () => t });
  s.aim('1층', 'a', 'b', 'kick');
  assert.throws(() => s.aim('1층', 'c', 'd', 'kick'), { status: 409, message: /조준하는 중/ });
  s.cancel('1층', 'c'); // not theirs to let go
  assert.throws(() => s.hit('1층', 'c', 'd', 'kick'), { status: 409 });
  s.cancel('1층', 'a');
  s.aim('1층', 'c', 'd', 'kick');
  t += AIM_MS + 1; // c wandered off
  s.aim('1층', 'a', 'b', 'hammer');
  t += 3000;
  s.hit('1층', 'a', 'b', 'hammer');
  assert.throws(() => s.aim('1층', 'c', 'd', 'kick'), { status: 409, message: /날아가는 중/ });
  assert.deepEqual(cleanAim(90, 3), { angle: 68, power: 1 });
  assert.deepEqual(cleanAim(undefined, 'x'), { angle: 40, power: 0.6 });
  assert.deepEqual(cleanAim(33.4, 0.456), { angle: 33, power: 0.46 });
});

test('🏀 골대: a hoop never at the far end, a goal comes down through it; 🚀 90% or more, at any angle, goes to space', async () => {
  const { newHoop, shotAt, isGoalShot, isSpace, HOOP_W, HOOP_CHANCE, SPACE_POWER } = await import('../server/smack.js');
  const isGoal = (aim, h) => shotAt(aim, h) === 'swish';
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 300; i++) {
    const h = newHoop(rand);
    assert.ok(h.fx > 0.15 && h.fx < 0.75, `not at the far end: ${h.fx}`);
    assert.ok(h.fy >= 0.05 && h.fy <= 0.26, `a height on every screen: ${h.fy}`);
    // Some aim under 우주 power scores on it.
    let scored = false;
    for (let a = 14; a <= 66 && !scored; a++) for (let p = 20; p < SPACE_POWER * 100 && !scored; p++) scored = isGoal(cleanAim(a, p / 100), h);
    assert.ok(scored, `reachable: ${JSON.stringify(h)}`);
  }
  // Spread out, not bunched in the middle: every tenth of the way from 0.2 to 0.7 gets its share.
  const bins = [0, 0, 0, 0, 0];
  for (let i = 0; i < 2000; i++) { const h = newHoop(rand); if (h.fx < 0.7) bins[Math.floor((h.fx - 0.2) * 10)]++; }
  for (const n of bins) assert.ok(n > 2000 * 0.1, `each stretch gets some: ${bins}`);
  // The hoop the test is worked out for: 45° at power 0.6 comes down at 0.45 of a reach, 0.1125 high.
  const hoop = { fx: 0.45, fy: 0.1125 };
  const P = Math.pow(0.6, 1.2);
  assert.equal(isGoal(cleanAim(45, 0.6), { fx: 0.45, fy: Math.round((0.45 - 0.2025 / P) * 1000) / 1000 }), true);
  assert.equal(isGoal(cleanAim(45, 0.3), hoop), false, 'too soft: never that high');
  assert.equal(isGoal(cleanAim(20, 0.6), hoop), false, 'too flat');
  assert.equal(shotAt(cleanAim(45, 0.6), null), null, 'no hoop, no shot');
  assert.ok(HOOP_W > 0.01 && HOOP_W < 0.1);
  // 🚀 space at 90%+ whatever the angle (no star any more); never a goal as well.
  assert.equal(isSpace(cleanAim(30, 0.9)), true);
  assert.equal(isSpace(cleanAim(30, 0.89)), false);
  assert.equal(isSpace(cleanAim(45, 1)), true, 'what was the star is space now');
  assert.equal(HOOP_CHANCE, 1, 'a hoop on every aim');
  for (let a = 12; a <= 68; a++) assert.equal(shotAt(cleanAim(a, 0.95), hoop), null, 'off to space, not at the hoop');
  assert.equal(isGoalShot('rim-in') && isGoalShot('bank-in') && isGoalShot('swish'), true);
  assert.equal(isGoalShot('rim-out') || isGoalShot('bank-out') || isGoalShot('miss') || isGoalShot(null), false);
  // The hoop I aimed at comes back with my hit, and only mine.
  let t = 0;
  const s = new Smacks({ now: () => t });
  assert.deepEqual(s.aim('1층', 'a', 'b', 'kick', '', hoop), { how: 'kick', hoop });
  assert.deepEqual(s.hit('1층', 'a', 'b', 'kick'), { how: 'kick', hoop });
  t += SHOW_MS + SAFE_MS + SMACK_GAP_MS;
  s.aim('1층', 'a', 'b', 'kick');
  assert.deepEqual(s.hit('1층', 'a', 'b', 'kick'), { how: 'kick' }, 'no hoop that time');
});

test('🏀 off the rim or the board: a little off hits the rim, a little long hits the board, and the dice say in or out', async () => {
  const { shotAt, crossing, heightAt, HOOP_W, RIM_W, BOARD_DX, BOARD_H } = await import('../server/smack.js');
  const hoop = { fx: 0.45, fy: 0.112 };
  // Every aim, sorted by where it comes down through the ring's height.
  const by = { swish: [], rim: [], bank: [], miss: [] };
  for (let a = 12; a <= 68; a++) for (let p = 12; p < 90; p++) {
    const aim = cleanAim(a, p / 100), dx = crossing(aim, hoop);
    const up = heightAt(aim, hoop.fx + BOARD_DX) - hoop.fy;
    const kind = dx === null ? 'miss' : Math.abs(dx) <= HOOP_W ? 'swish' : Math.abs(dx) <= RIM_W || (dx > 0 && dx <= BOARD_DX) ? 'rim' : dx > 0 && up >= 0 && up <= BOARD_H ? 'bank' : 'miss';
    by[kind].push(aim);
  }
  for (const k of ['swish', 'rim', 'bank', 'miss']) assert.ok(by[k].length > 0, `some aims are ${k}`);
  const low = () => 0.01, high = () => 0.99;
  for (const aim of by.swish) assert.equal(shotAt(aim, hoop, high), 'swish', 'clean through, whatever the dice');
  for (const aim of by.rim) { assert.equal(shotAt(aim, hoop, low), 'rim-in'); assert.equal(shotAt(aim, hoop, high), 'rim-out'); }
  for (const aim of by.bank) { assert.equal(shotAt(aim, hoop, low), 'bank-in'); assert.equal(shotAt(aim, hoop, high), 'bank-out'); }
  for (const aim of by.miss) assert.equal(shotAt(aim, hoop, low), 'miss');
  // Short of the hoop by as much as long of it is a miss: the board only stands behind.
  const short = by.miss.find((aim) => { const dx = crossing(aim, hoop); return dx !== null && dx < -RIM_W && dx > -0.1; });
  assert.ok(short && shotAt(short, hoop, low) === 'miss');
  // Shot high, it sails over the board and comes down just behind it: a miss, not off the board.
  const over = by.miss.find((aim) => { const dx = crossing(aim, hoop); return dx !== null && dx > BOARD_DX && dx < 0.12 && heightAt(aim, hoop.fx + BOARD_DX) - hoop.fy > BOARD_H; });
  assert.ok(over, 'some high shots come down just behind the board');
  assert.equal(shotAt(over, hoop, low), 'miss', 'over the board is no goal');
  // What the screens aim their drawing at: which side of the ring, how high up the board.
  const { shotDetail } = await import('../server/smack.js');
  const near = by.rim.find((aim) => crossing(aim, hoop) < 0), far = by.rim.find((aim) => crossing(aim, hoop) > 0);
  assert.ok(shotDetail(near, hoop).dx < 0 && shotDetail(far, hoop).dx > 0, 'the near rim and the far rim');
  for (const aim of by.bank) { const { up } = shotDetail(aim, hoop); assert.ok(up >= 0 && up <= 1, `up the board: ${up}`); }
});

test('⛳ 골프: half the targets are a hole; on it is a hole-in-one, short it rolls — in when slow at the cup, over when fast, or to a stop', async () => {
  const { newTarget, golfShot, golfDetail, isGoalShot, CUP_W, DROP_W, LIP_W, SHORT_W } = await import('../server/smack.js');
  let seed = 3;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const kinds = { hoop: 0, golf: 0 };
  for (let i = 0; i < 1000; i++) { const t = newTarget(rand); kinds[t.kind]++; if (t.kind === 'golf') assert.ok(t.fx >= 0.25 && t.fx <= 0.75); else assert.ok(t.fx > 0.15 && t.fy >= 0.05); }
  assert.ok(kinds.hoop > 400 && kinds.golf > 400, `both kinds: ${JSON.stringify(kinds)}`);
  const golf = { kind: 'golf', fx: 0.5 };
  const seen = new Set();
  for (let a = 12; a <= 68; a++) for (let p = 12; p < 90; p++) {
    const aim = cleanAim(a, p / 100), { dx, stop } = golfDetail(aim, golf), shot = golfShot(aim, golf);
    assert.ok(stop >= dx, 'it rolls on, never back');
    const want = Math.abs(dx) <= CUP_W ? 'ace' : dx < 0 ? (stop < -CUP_W ? (stop >= -SHORT_W ? 'roll-short' : 'miss') : stop <= DROP_W ? 'roll-in' : 'lip-out') : dx <= LIP_W ? 'lip-out' : 'miss';
    assert.equal(shot, want, `${a}° ${p}%: dx ${dx} stop ${stop}`);
    assert.equal(golfShot(aim, golf), shot, 'the same aim, the same shot: no dice');
    seen.add(shot);
  }
  for (const k of ['ace', 'roll-in', 'roll-short', 'lip-out', 'miss']) assert.ok(seen.has(k), `some aims are ${k}`);
  // Kicked low it runs further than lofted, for the same landing spot.
  const low = golfDetail(cleanAim(25, 0.6), golf), high = golfDetail(cleanAim(65, 0.6), golf);
  assert.ok(low.stop - low.dx > (high.stop - high.dx) * 2, 'low kicks roll, lofted ones stop');
  assert.equal(golfShot(cleanAim(45, 0.95), golf), null, 'off to space, not at the hole');
  assert.equal(isGoalShot('ace') && isGoalShot('roll-in'), true);
  assert.equal(isGoalShot('roll-short') || isGoalShot('lip-out'), false);
});
