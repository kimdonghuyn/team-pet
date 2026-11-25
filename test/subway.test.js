import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINES } from '../server/subway-lines.js';
import { findLine, findStation, planRoute, station } from '../server/subway.js';
import { Parties } from '../server/party.js';

test('🚇 the map: lines 1-9, stops on both sides of each, 2호선 a loop, names found however typed', () => {
  assert.deepEqual(Object.keys(LINES), ['1호선', '2호선', '3호선', '4호선', '5호선', '6호선', '7호선', '8호선', '9호선']);
  assert.ok(station('시청').lines.includes('1호선') && station('시청').lines.includes('2호선'));
  assert.equal(station('시청').next['2호선'].length, 2);
  assert.equal(findStation('서울역'), '서울역');
  assert.equal(findStation(' 고속 터미널 역'), '고속터미널');
  assert.equal(findLine('9'), '9호선');
  assert.equal(findLine('9호선'), '9호선');
  // The fewest stops to type; a change of line is only marked on the stop after it.
  const way = planRoute('합정', '고속터미널');
  assert.deepEqual(way.slice(0, 2).map((x) => x.name), ['당산', '국회의사당']);
  assert.equal(way[1].change, true);
  assert.equal(way[1].line, '9호선');
  assert.equal(way.at(-1).name, '고속터미널');
});

test('🚇 지하철 레이스: the host sets the stations, everyone types the way, ranked by arrival', () => {
  let t = 0;
  const p = new Parties({ now: () => t, rand: () => 0.3 });
  p.open('1층', { id: 'a', name: '하나' }, 'subway');
  p.join('1층', { id: 'b', name: '둘' });
  assert.throws(() => p.setRoute('1층', 'b', '합정', '고속터미널'), { status: 403 });
  assert.throws(() => p.setRoute('1층', 'a', '합정', '없는역'), { status: 400 });
  p.setRoute('1층', 'a', '합정역', '고속터미널');
  assert.equal(p.view('1층', 'b').route.count, 11);
  assert.equal(p.view('1층', 'b').route.steps, undefined);
  p.start('1층', 'a');
  assert.throws(() => p.act('1층', 'a', 'say', '당산'), { status: 409, message: /출발 전/ });
  t += 3000;
  const steps = p.view('1층', 'b').route.steps;
  assert.equal(steps.length, 11);
  assert.throws(() => p.act('1층', 'a', 'say', '여의도'), { status: 400, message: /땡! 다음은 「당산」/ });
  const type = (who) => { for (const s of steps) { t += 500; p.act('1층', who, 'say', `${s.name}역`); } };
  type('b');
  assert.equal(p.view('1층', 'b').ride.done, 5500);
  assert.equal(p.view('1층', 'a').board[0].id, 'b');
  type('a');
  const v = p.view('1층', 'a');
  assert.equal(v.phase, 'done');
  assert.match(v.how, /🥇 둘 5\.5초 · 🥈 하나 11\.0초/);
});

test('🚇 🎲 the host draws a route by chance in the lobby, shown before the start', () => {
  const p = new Parties({ now: () => 0, rand: () => 0.42 });
  p.open('1층', { id: 'a', name: '하나' }, 'subway');
  p.join('1층', { id: 'b', name: '둘' });
  assert.throws(() => p.setRandomRoute('1층', 'b'), { status: 403 });
  p.setRandomRoute('1층', 'a');
  const lobby = p.view('1층', 'b').route;
  assert.equal(lobby.random, true);
  p.start('1층', 'a');
  assert.equal(p.view('1층', 'a').route.from, lobby.from);
  assert.equal(p.view('1층', 'a').route.to, lobby.to);
});

test('🚇 no stations chosen: a route by chance, 10-16 things to type', () => {
  const p = new Parties({ now: () => 0, rand: () => 0.42 });
  p.open('1층', { id: 'a', name: '하나' }, 'subway');
  p.join('1층', { id: 'b', name: '둘' });
  p.start('1층', 'a');
  const n = p.view('1층', 'a').route.steps.length;
  assert.ok(n >= 10 && n <= 16, String(n));
});
