import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIGHT, FISH, Fishing, POINTS, RARITY, RODS, TRIES, fishLooks } from '../server/fish.js';

const clock = (t = Date.UTC(2026, 9, 30, 3)) => { const c = { t, now: () => c.t }; return c; };
// A random that plays back the given numbers, then 0.5 forever.
const seq = (...xs) => () => (xs.length ? xs.shift() : 0.5);
const me = { id: 'u1', name: '하나' };

test('the book: many kinds, every rarity, every one drawable', () => {
  assert.ok(FISH.length >= 60, `only ${FISH.length}`);
  assert.equal(new Set(FISH.map((f) => f.id)).size, FISH.length);
  for (const r of Object.keys(RARITY)) assert.ok(FISH.some((f) => f.rarity === r), r);
  const looks = fishLooks();
  for (const f of FISH) {
    const { parts, clips } = looks[f.id];
    assert.ok(parts.length >= 2, f.id);
    for (const p of parts) {
      assert.match(p.d, /^M [-\d.]/, `${f.id}: ${p.d.slice(0, 20)}`);
      assert.doesNotMatch(p.d, /NaN|undefined/, f.id);
      assert.ok(p.fill || p.stroke, f.id);
      if (p.clip != null) assert.ok(clips[p.clip], f.id);
    }
    if (f.rarity === 'junk') assert.equal(f.cm, null); else assert.ok(f.cm[0] < f.cm[1], f.id);
  }
});

test('cast, hook it on the bite, win the fight: a catch in its size range, kept in my book', () => {
  const c = clock();
  const fishing = new Fishing({ now: c.now, random: seq(0.5, 0.0, 0.0, 0.5, 0.5, 0.5) });
  const { biteIn, window } = fishing.cast('u1@1층');
  assert.equal(biteIn, 6500);
  assert.equal(window, 1500);
  assert.equal(fishing.fishing('u1@1층'), true);
  assert.throws(() => fishing.cast('u1@1층'), { status: 409 });
  c.t += biteIn + 300;
  const on = fishing.hook('1층', 'u1@1층');
  assert.equal(on.hooked, true);
  assert.equal(on.rarity, 'common');
  // Three goes at the same fish, each with its part somewhere on the bar.
  assert.equal(on.tries, TRIES);
  assert.equal(on.zones.length, TRIES);
  for (const z of on.zones) assert.ok(Math.abs(z.to - z.from - FIGHT.common.zone) < 0.011);
  assert.equal(fishing.fishing('u1@1층'), true);
  const out = fishing.land('1층', me, 'u1@1층', true);
  assert.equal(out.fish.rarity, 'common');
  const f = FISH.find((x) => x.id === out.fish.id);
  assert.ok(out.fish.cm >= f.cm[0] && out.fish.cm <= f.cm[1]);
  assert.equal(out.isNew, true);
  assert.equal(out.count, 1);
  assert.equal(fishing.fishing('u1@1층'), false);
  // A short rest before the next cast.
  assert.throws(() => fishing.cast('u1@1층'), { status: 429 });
  c.t += 3_000;
  assert.ok(fishing.cast('u1@1층').biteIn);
});

test('too early scares it off, too late it got away, no cast is no catch', () => {
  const c = clock();
  const fishing = new Fishing({ now: c.now, random: () => 0 });
  fishing.cast('u1@1층');
  c.t += 1_000;
  assert.equal(fishing.hook('1층', 'u1@1층').miss, 'early');
  c.t += 5_000;
  fishing.cast('u1@1층');
  c.t += 3_000 + 1_500 + 800;
  assert.equal(fishing.hook('1층', 'u1@1층').miss, 'late');
  assert.throws(() => fishing.hook('1층', 'u1@1층'), { status: 400 });
  assert.throws(() => fishing.land('1층', me, 'u1@1층', true), { status: 400 });
  assert.equal(fishing.book('1층', 'u1').count, 0);
});

test('rain within the minute brings the rarer ones up', () => {
  const c = clock();
  const dry = new Fishing({ now: c.now, random: seq(0.9) });
  const wet = new Fishing({ now: c.now, random: seq(0.9) });
  wet.sky('1층', 'rain');
  const order = Object.keys(RARITY);
  assert.ok(order.indexOf(wet.pick('1층').rarity) >= order.indexOf(dry.pick('1층').rarity));
  // The 0.9 that lands on 'rare' when dry lands higher in the rain.
  const total = (boost) => Object.entries(RARITY).reduce((s, [k, r]) => s + r.weight * (boost[k] || 1), 0);
  assert.ok(total({ rare: 1.6, epic: 2, legend: 2 }) > total({}));
  c.t += 61_000;
  assert.equal(wet.pick('1층').rarity, dry.pick('1층').rarity);
});

test('the picture book: ??? until caught, the floor record and its top three', () => {
  const c = clock();
  const fishing = new Fishing({ now: c.now });
  const f = FISH.find((x) => x.id === 'bungeo');
  fishing.keep('1층', me, f, 20);
  const r = fishing.keep('1층', { id: 'u2', name: '두리' }, f, 30);
  assert.deepEqual(r.record, { from: { name: '하나', size: '20.0cm' } });
  assert.equal(fishing.keep('1층', me, f, 25).record, null);
  const mine = fishing.book('1층', 'u1');
  const bungeo = mine.list.find((x) => x.id === 'bungeo');
  assert.equal(bungeo.name, '붕어');
  assert.equal(bungeo.n, 2);
  assert.equal(bungeo.best, '25.0cm');
  assert.deepEqual(bungeo.record, { name: '두리', size: '30.0cm', me: false });
  assert.equal(mine.list.find((x) => x.id === 'nemo').name, '???');
  assert.equal(mine.top[0].name, '하나');
  assert.equal(mine.count, 1);
  // Another floor's book is its own.
  assert.equal(fishing.book('2층', 'u1').count, 0);
});

test('big ones read in metres', () => {
  const c = clock();
  const fishing = new Fishing({ now: c.now, random: seq(0.999, 0) });
  // 0.999 → the last rarity bucket (junk) has no size; force a known fish through keep instead.
  const whale = FISH.find((x) => x.id === 'gorae');
  fishing.keep('1층', me, whale, 512.3);
  assert.equal(fishing.book('1층', 'u1').list.find((x) => x.id === 'gorae').best, '5.12m');
});

test('the fight: three goes at the same fish, then the line breaks; the rarer, the narrower and quicker', () => {
  const c = clock();
  const fishing = new Fishing({ now: c.now, random: () => 0 });
  fishing.cast('u1@1층');
  c.t += 3_000;
  assert.equal(fishing.hook('1층', 'u1@1층').hooked, true);
  const off = fishing.land('1층', me, 'u1@1층', false);
  assert.equal(off.miss, 'escape');
  assert.match(off.text, /줄이 끊어졌어요/);
  assert.equal(fishing.book('1층', 'u1').count, 0);
  // Hooked, then left too long.
  c.t += 3_000; fishing.cast('u1@1층'); c.t += 3_000; fishing.hook('1층', 'u1@1층');
  c.t += 19_000;
  assert.equal(fishing.land('1층', me, 'u1@1층', true).miss, 'escape');
  // Still on the hook after a missed go or two (inside three goes' time).
  c.t += 3_000; fishing.cast('u1@1층'); c.t += 3_000; fishing.hook('1층', 'u1@1층');
  c.t += 13_000;
  assert.equal(fishing.fishing('u1@1층'), true);
  assert.ok(fishing.land('1층', me, 'u1@1층', true).fish);
  // How hard each rarity fights.
  const order = ['junk', 'common', 'uncommon', 'rare', 'epic', 'legend'];
  for (let i = 2; i < order.length; i++) {
    assert.ok(FIGHT[order[i]].zone < FIGHT[order[i - 1]].zone && FIGHT[order[i]].sweep < FIGHT[order[i - 1]].sweep, order[i]);
  }
  // A legend on the hook (0.9 lands in its slice of the odds): three goes, each a narrow eased
  // part drifting yet never off the bar.
  const sea = new Fishing({ now: c.now, random: seq(0.5, 0.9, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0, 0, 1) });
  sea.cast('u2@1층'); c.t += 6_500;
  const big = sea.hook('1층', 'u2@1층');
  assert.equal(big.rarity, 'legend');
  assert.equal(big.heavy, true);
  assert.equal(big.zones.length, TRIES);
  for (const { from, to, drift, ease } of big.zones) {
    assert.ok(ease && drift);
    assert.equal(big.zones[0].slack, 0);
    assert.ok(from - drift.amp >= 0 && to + drift.amp <= 1, `${from} ${to}`);
  }
  c.t += 8_000;
  assert.equal(sea.land('1층', { id: 'u2', name: '두리' }, 'u2@1층', true).fish.rarity, 'legend');
});

test('payday is the 10th, or the Friday before it when the 10th is a weekend', async () => {
  const { payday } = await import('../server/fish.js');
  assert.equal(payday(new Date(2026, 10, 10)), true);  // Tue 10 Nov
  assert.equal(payday(new Date(2026, 10, 9)), false);
  assert.equal(payday(new Date(2026, 9, 9)), true);    // Sat 10 Oct → Fri 9th
  assert.equal(payday(new Date(2026, 9, 10)), false);
  assert.equal(payday(new Date(2027, 0, 8)), true);    // Sun 10 Jan → Fri 8th
  assert.equal(payday(new Date(2027, 0, 9)), false);
});

test('some fish only at their time, one only after another, a clover brings luck', () => {
  const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi).getTime();
  const only = (id) => FISH.find((f) => f.id === id);
  // Every legend over many rolls at a time that suits none of the only-then ones.
  const legends = (t, fishing = new Fishing({ now: () => t }), first = 0.9) => {
    const seen = new Set();
    for (let i = 0; i < 4000; i++) {
      let n = 0;
      fishing.random = () => (n++ === 0 ? first : (i + 0.5) / 4000);
      seen.add(fishing.pick('1층', 'u1@1층').id);
    }
    return seen;
  };
  const plain = legends(at(2026, 10, 3, 14, 30)); // a Tuesday afternoon
  for (const id of ['timefish', 'kaltoe', 'paydaygold', 'galaxywhale', 'thundereel', 'cheongryong', 'deungyongmun']) assert.ok(!plain.has(id), id);
  assert.ok(legends(at(2026, 10, 3, 15, 0)).has('timefish'));
  assert.ok(legends(at(2026, 10, 3, 18, 2)).has('kaltoe'));
  assert.ok(legends(at(2026, 10, 10, 14, 30)).has('paydaygold'));
  // The blue dragon comes in the rain (the rain lifts the rarer odds: 0.91 is a legend then), and
  // only for one who has the imugi.
  const wet = new Fishing({ now: () => at(2026, 10, 3, 14, 30) });
  wet.sky('1층', 'rain');
  assert.ok(!legends(0, wet, 0.91).has('cheongryong'));
  wet.keep('1층', me, only('imugi'), 500);
  assert.ok(legends(0, wet, 0.91).has('cheongryong'));
  // The book tells when, and names the one before only once I have it.
  assert.match(wet.book('1층', 'u1').list.find((x) => x.id === 'cheongryong').hint, /이무기를 먼저/);
  assert.match(wet.book('1층', 'u2').list.find((x) => x.id === 'cheongryong').hint, /어떤 물고기를 먼저/);
  // A clover: the next bite's rarer odds doubled, once.
  const c = clock();
  const lucky = new Fishing({ now: c.now, random: () => 0 });
  lucky.hooked.set('u1@1층', { f: only('clover'), cm: null, hits: 1, at: c.t });
  assert.equal(lucky.land('1층', me, 'u1@1층', true).luck, true);
  assert.equal(lucky.luck.has('u1@1층'), true);
  lucky.pick('1층', 'u1@1층');
  assert.equal(lucky.luck.has('u1@1층'), false);
});

test('🏆 showing off: only a catch in my book on this floor, at my biggest, once every 15 s', () => {
  let t = Date.UTC(2026, 9, 30, 3);
  const fishing = new Fishing({ now: () => t });
  const f = FISH.find((x) => x.id === 'chamdom');
  assert.throws(() => fishing.brag('1층', 'u1@1층', 'chamdom'), { status: 404 });
  fishing.keep('1층', me, f, 40);
  fishing.keep('1층', me, f, 55.5);
  // Not in my book on another floor, and not a fish that does not exist.
  assert.throws(() => fishing.brag('2층', 'u1@2층', 'chamdom'), { status: 404 });
  assert.throws(() => fishing.brag('1층', 'u1@1층', 'nope'), { status: 404 });
  const shown = fishing.brag('1층', 'u1@1층', 'chamdom');
  assert.deepEqual([shown.id, shown.name, shown.size, shown.n, shown.record, shown.rarity], ['chamdom', '참돔', '55.5cm', 2, true, 'rare']);
  assert.throws(() => fishing.brag('1층', 'u1@1층', 'chamdom'), { status: 429 });
  t += 15_000;
  // Someone else bigger now: still mine to show, no longer the floor's record.
  fishing.keep('1층', { id: 'u2', name: '두리' }, f, 70);
  assert.equal(fishing.brag('1층', 'u1@1층', 'chamdom').record, false);
});

test('낚시대회: join in half a minute, five bites each, best by rarity then size, nothing in the book', () => {
  const c = clock();
  const fishing = new Fishing({ now: c.now, random: () => 0.5 });
  const two = { id: 'u2', name: '두리' };
  fishing.contestOpen('1층', me);
  assert.throws(() => fishing.contestOpen('1층', two), /참가를 받고/);
  fishing.contestJoin('1층', two);
  assert.throws(() => fishing.contestStart('1층', 'u2'), /연 사람만/);
  const v = fishing.contestView('1층', 'u2');
  assert.equal(v.phase, 'open');
  assert.equal(v.joined, true);
  assert.equal(v.board.length, 2);
  assert.equal(fishing.contestTick('1층'), null);
  // Half a minute on, it starts by itself.
  c.t += 30_000;
  assert.ok(fishing.contestTick('1층').started);
  const go = (key, who) => {
    fishing.cast(key); c.t += 6_500;
    const h = fishing.hook('1층', key);
    const out = h.hooked ? fishing.land('1층', who, key, true) : h;
    c.t += 3_000;
    return { h, out };
  };
  // A bite counts, the catch is on the board but not in my book.
  const first = go('u1@1층', me);
  assert.deepEqual(first.h.contest, { n: 1, of: 5 });
  assert.equal(first.out.contest, true);
  assert.equal(fishing.dex['1층']?.u1, undefined);
  for (let i = 0; i < 4; i++) go('u1@1층', me);
  // My five used: a sixth is plain fishing again.
  assert.equal(go('u1@1층', me).h.contest, undefined);
  assert.equal(fishing.contestView('1층', 'u1').tries, 5);
  for (let i = 0; i < 4; i++) go('u2@1층', two);
  assert.equal(fishing.contestTick('1층'), null);
  // The rarer first, then the bigger.
  const cc = fishing.contests.get('1층');
  const common = FISH.find((f) => f.rarity === 'common' && f.cm), rare = FISH.find((f) => f.rarity === 'rare' && f.cm);
  cc.people.u1.best = { f: common, cm: 30 };
  cc.people.u2.best = { f: rare, cm: 10 };
  assert.equal(fishing.standings(cc)[0].id, 'u2');
  cc.people.u1.best = { f: rare, cm: 20 };
  assert.equal(fishing.standings(cc)[0].id, 'u1');
  // Everyone through their five: it ends at once, the board stays up a moment, then goes.
  go('u2@1층', two);
  const end = fishing.contestTick('1층');
  assert.deepEqual(end.top.map((p) => p.id), ['u1', 'u2']);
  assert.equal(fishing.contestView('1층', 'u1').phase, 'done');
  assert.throws(() => fishing.contestJoin('1층', two), /참가할 수 없어요/);
  c.t += 10_000;
  fishing.contestTick('1층');
  assert.equal(fishing.contestView('1층', 'u1'), null);
});

test('낚시대회: time up ends it, a fight going may finish; the opener leaving calls it off', () => {
  const c = clock();
  const fishing = new Fishing({ now: c.now, random: () => 0.5 });
  fishing.contestOpen('1층', me);
  fishing.contestLeave('1층', 'u1');
  assert.equal(fishing.contestView('1층', 'u1'), null);
  fishing.contestOpen('1층', me);
  fishing.contestStart('1층', 'u1');
  fishing.cast('u1@1층');
  c.t += 119_000;
  // Bitten at the very end (the bite came long ago: a late click, still one of the five).
  fishing.casts.get('u1@1층').bite = c.t;
  const h = fishing.hook('1층', 'u1@1층');
  assert.equal(h.hooked, true);
  c.t += 2_000;
  assert.equal(fishing.contestTick('1층'), null);
  fishing.land('1층', me, 'u1@1층', true);
  const end = fishing.contestTick('1층');
  assert.ok(end.ended);
  assert.equal(end.top.length, h.rarity === 'junk' ? 0 : 1);
});

test('도감 낚싯대: 15 steps, each needing more kinds and points, harder, and from step 6 able to break', () => {
  assert.equal(RODS.length, 15);
  for (let i = 1; i < RODS.length; i++) {
    const r = RODS[i], p = RODS[i - 1];
    assert.ok(r.need > p.need && r.up > p.up, r.name);
    if (i > 1) assert.ok(r.cost > p.cost && r.rate < p.rate && r.brk >= p.brk, r.name);
    assert.equal(r.brk > 0, i >= 5, r.name);
  }
});

const kindsOf = (list) => Object.fromEntries(list.map(([f, n]) => [f.id, { n, best: null, first: 0 }]));
const byRarity = (r, i = 0) => FISH.filter((f) => f.rarity === r)[i];

test('⚒️ points: one who had a book starts at the first rod with what their catches would have earned', () => {
  const fishing = new Fishing({ dex: { '1층': { u1: { name: '하나', total: 4, fish: kindsOf([[byRarity('common'), 2], [byRarity('rare'), 1], [byRarity('legend'), 1]]) } } } });
  const r = fishing.rod('1층', 'u1');
  // Each kind's first catch twice: common 1×3, rare 5×2, legend 30×2; a charm for the legend.
  assert.equal(r.step, 0);
  assert.equal(r.pts, 3 + 10 + 60);
  assert.equal(r.charms, 1);
  assert.equal(r.next.name, '🎋 청죽');
  assert.equal(fishing.rod('1층', 'nobody').pts, 0);
});

test('⚒️ points: every catch adds its rarity\'s points, twice for a new kind; a legend brings a charm', () => {
  const fishing = new Fishing({});
  assert.equal(fishing.keep('1층', me, byRarity('common'), 10).points, 2);
  assert.equal(fishing.keep('1층', me, byRarity('common'), 10).points, 1);
  const lg = fishing.keep('1층', me, byRarity('legend'), 500);
  assert.equal(lg.points, 60);
  assert.equal(lg.charm, true);
  assert.equal(fishing.rod('1층', 'u1').pts, 63);
  assert.equal(fishing.rod('1층', 'u1').charms, 1);
});

test('⚒️ 강화: needs the kinds and the points; success, fail filling 장인의 기운 until it cannot fail, break and a charm', () => {
  const book = (n, forge) => ({ '1층': { u1: { name: '하나', total: n, fish: kindsOf(FISH.slice(0, n).map((x) => [x, 1])), forge } } });
  let roll = 0;
  const at = (n, forge) => new Fishing({ dex: book(n, forge), random: () => roll });
  // Not enough kinds, then not enough points.
  assert.throws(() => at(3, { step: 0, pts: 100, gauge: 0, charms: 0 }).enhance('1층', 'u1'), { status: 409, message: /5종부터/ });
  assert.throws(() => at(6, { step: 0, pts: 2, gauge: 0, charms: 0 }).enhance('1층', 'u1'), { status: 409, message: /포인트가 3 모자라요/ });
  // A success: up a step, the cost paid.
  let f = at(6, { step: 0, pts: 20, gauge: 0, charms: 0 }); roll = 0;
  let out = f.enhance('1층', 'u1');
  assert.equal(out.result, 'success');
  assert.equal(out.rod.step, 1);
  assert.equal(out.rod.pts, 15);
  // Fails at step 10 → 11 (35% up, 18% break): 장인의 기운 fills by 17.5 each, and full it cannot fail.
  f = at(120, { step: 9, pts: 1000, gauge: 0, charms: 0 }); roll = 0.99;
  for (let i = 0; i < 6; i++) assert.equal(f.enhance('1층', 'u1').result, 'fail');
  assert.equal(f.rod('1층', 'u1').gauge, 100);
  assert.equal(f.rod('1층', 'u1').next.sure, true);
  out = f.enhance('1층', 'u1');
  assert.equal(out.result, 'success');
  assert.equal(out.rod.step, 10);
  assert.equal(out.rod.gauge, 0);
  // A break: down a step, 장인의 기운 gone; a charm turns it into a fail and is used up.
  roll = 0.4; // past 35%, inside 35 + 18
  f = at(120, { step: 9, pts: 1000, gauge: 40, charms: 1 });
  out = f.enhance('1층', 'u1');
  assert.equal(out.result, 'saved');
  assert.equal(out.rod.step, 9);
  assert.equal(out.rod.charms, 0);
  out = f.enhance('1층', 'u1');
  assert.equal(out.result, 'break');
  assert.equal(out.rod.step, 8);
  assert.equal(out.rod.gauge, 0);
  assert.equal(out.drop, 1);
  // 💥💥 One break in four drops two steps (the second roll from 0.05 under 0.30), ☠️ one in twenty all the way.
  const rolls = [0.4, 0.1];
  f = new Fishing({ dex: book(120, { step: 9, pts: 1000, gauge: 0, charms: 0 }), random: () => rolls.shift() ?? 0.5 });
  out = f.enhance('1층', 'u1');
  assert.equal(out.result, 'break');
  assert.equal(out.drop, 2);
  assert.equal(out.rod.step, 7);
  const zr = [0.4, 0.01];
  f = new Fishing({ dex: book(120, { step: 9, pts: 1000, gauge: 0, charms: 0 }), random: () => zr.shift() ?? 0.5 });
  out = f.enhance('1층', 'u1');
  assert.equal(out.zero, true);
  assert.equal(out.drop, 9);
  assert.equal(out.rod.step, 0);
  // A two-step break trying for 6강 (step 4 → 2).
  const r6 = [0.72, 0.1];
  f = new Fishing({ dex: book(40, { step: 4, pts: 1000, gauge: 0, charms: 0 }), random: () => r6.shift() ?? 0.5 });
  assert.equal(f.enhance('1층', 'u1').rod.step, 2);
  // Steps up to 5 never break.
  f = at(30, { step: 3, pts: 100, gauge: 0, charms: 0 }); roll = 0.99;
  assert.equal(f.enhance('1층', 'u1').result, 'fail');
  // The last rod has nothing after it.
  assert.throws(() => at(220, { step: 14, pts: 1000, gauge: 0, charms: 0 }).enhance('1층', 'u1'), { status: 409 });
});

test('a bite let go unclicked is a miss even within the slack: no fight', () => {
  const c = clock();
  const fishing = new Fishing({ now: c.now, random: () => 0.5 });
  const { biteIn } = fishing.cast('u1@1층');
  c.t += biteIn + 300;
  const out = fishing.hook('1층', 'u1@1층', true);
  assert.equal(out.miss, 'late');
  assert.equal(out.hooked, undefined);
  assert.equal(fishing.fishing('u1@1층'), false);
});

test('the rod takes its extra out of 가끔 only: 흔함 and 꽝 come as often at the top rod as at the first', () => {
  const book = (step) => ({ '1층': { u1: { name: '하나', total: 1, fish: {}, forge: { step, pts: 0, gauge: 0, charms: 0 } } } });
  const count = (n) => {
    const c = {}; let i = 0, flip = false;
    const f = new Fishing({ dex: book(n), now: () => Date.UTC(2026, 9, 28, 3), random: () => ((flip = !flip) ? (i++ + 0.5) / 4000 : 0.5) });
    for (let j = 0; j < 4000; j++) { const r = f.pick('1층', 'u1@1층').rarity; c[r] = (c[r] || 0) + 1; }
    return c;
  };
  const first = count(0), top = count(14);
  assert.ok(Math.abs(top.common - first.common) <= 2, `흔함 ${first.common} → ${top.common}`);
  assert.ok(Math.abs(top.junk - first.junk) <= 2, `꽝 ${first.junk} → ${top.junk}`);
  assert.ok(top.uncommon < first.uncommon);
  assert.ok(top.legend > first.legend);
});
