import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ROOT, call, freePort, runServer, tempDir } from './helpers.js';
import { TeamHub, coarseWork, redact, startPush } from '../server/team.js';

// Team office: unit checks for redaction and merging, then a real hub (demo
// mode) attacked over HTTP the way another PC on the office network would.
const KEY = 'test-team-key-0123456789';
const FLOOR_KEY = 'test-floor-key-demo-0123';
const port = await freePort();
const dir = tempDir('team');
const cfgFile = path.join(dir, 'config.json');
let server;

const request = (method, p, opts = {}) => call(port, method, p, opts);
// Another PC: its Host header names the hub's LAN address, not localhost.
const remote = (method, p, opts = {}) => request(method, p, { ...opts, host: `192.168.1.40:${port}` });
const cookie = { 'x-team-key': KEY };

before(async () => {
  fs.writeFileSync(cfgFile, JSON.stringify({
    team: { key: KEY, host: '127.0.0.1' },
    user: { id: 'hubpc', name: '총괄' },
    floors: [
      { name: '예시팀', match: 'demo-shop-*', key: FLOOR_KEY },
      { name: '데모', match: 'web-app|api-server|infra|mobile|docs-site' },
    ],
  }));
  server = runServer(['--hub', '--demo', '--port', String(port)], { config: cfgFile });
  await server.ready;
});

after(() => {
  server.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('team: redact keeps who and what kind, drops file names, commands and thinking', () => {
  const a = redact({
    id: 's1', name: 'Claude', userId: 'u', userName: '하루', project: 'cms', branch: 'feature/x', cwd: 'C:/secret/path',
    title: 'Fix the secret login bug', activity: 'running', detail: 'npm test -- secret.spec', sessionId: 'abcdef',
    history: [{ t: 1, activity: 'editing', detail: 'Editing secret.ts' }, { t: 2, activity: 'editing', detail: 'Editing other.ts' }],
  });
  assert.equal(a.detail, '명령 실행 중');
  assert.equal(a.cwd, '');
  assert.equal(a.title, '');
  assert.equal(a.sessionId, '');
  assert.equal(a.branch, 'feature/x');
  assert.deepEqual(a.history, [{ t: 1, activity: 'editing', detail: '편집 중' }]);
  assert.doesNotMatch(JSON.stringify(a), /secret/);
});

test('team: people are there while their PC pushes; hidden or quiet ones leave; no activity is kept', () => {
  let now = 0;
  const hub = new TeamHub({ now: () => now });
  hub.receive({ user: { id: 'haru-pc', name: '하루' }, agents: [] }, { floor: 'CMS' });
  assert.deepEqual(hub.people().map((p) => [p.key, p.name]), [['haru-pc@CMS', '하루']]);
  hub.receive({ user: { id: 'haru-pc', name: '하루', hidden: true }, agents: [] }, { floor: 'CMS' });
  assert.deepEqual(hub.people(), []);
  // An admin-key push has no floor of its own: its projects place it.
  hub.receive({ user: { id: 'adm2', name: '관리' }, agents: [{ id: 'a', project: 'cms-be', activity: 'editing', detail: 'Editing secret.ts' }] });
  const people = hub.people((p) => (p === 'cms-be' ? 'CMS' : null));
  assert.deepEqual(people.map((p) => p.key), ['adm2@CMS']);
  assert.doesNotMatch(JSON.stringify(people), /editing|secret/i);
  assert.equal(hub.slotFor('adm2', 'CMS'), 'adm2');
  now = 61_000;
  assert.deepEqual(hub.people(() => 'CMS'), []);
  assert.throws(() => hub.receive({ agents: [] }), /user.id/);
  // Positions are kept inside the office and a known direction.
  hub.move('x@CMS', { x: 99999, y: -5, dir: 'sideways' });
  assert.deepEqual(hub.positions.get('x@CMS'), { x: 1280, y: 0, dir: 'down' });
  assert.throws(() => hub.move('x@CMS', { x: 'a', y: 1 }), /numbers/);
});

test('hub: the owner on this PC sees everything without a key', async () => {
  const r = await request('GET', '/api/state');
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body).team, true);
});

test('hub: another PC without the key gets nothing', async () => {
  for (const p of ['/', '/api/state', '/api/events', '/app.js']) {
    const r = await remote('GET', p);
    assert.equal(r.status, 403, p);
    assert.doesNotMatch(r.body, /agents/);
  }
  assert.equal((await remote('GET', '/api/state', { headers: { 'x-team-key': 'wrong' } })).status, 403);
});

test('hub: a team viewer sees people, not what anyone works on, and cannot touch the settings', async () => {
  await moveOwner('데모');
  const r = await remote('GET', '/api/state', { headers: cookie });
  assert.equal(r.status, 200);
  const s = JSON.parse(r.body);
  assert.deepEqual(s.agents, [], 'no sessions leave for a team viewer');
  assert.ok(s.people.some((p) => p.id === 'person:hubpc@데모' && p.name === '총괄'), 'the hub owner is on the floors they work on');
  assert.ok(s.people.find((p) => p.id === 'person:hubpc@데모').pokeable, 'others can poke the hub owner');
  const own = JSON.parse((await request('GET', '/api/state')).body).people.find((p) => p.id === 'person:hubpc@데모');
  assert.equal(own.pokeable, false, 'but not the owner themself');
  for (const p of s.people) {
    assert.equal(p.activity, 'present');
    assert.equal(p.detail, '');
  }
  assert.doesNotMatch(r.body, /Editing|Reading|Thinking/);
  assert.equal((await remote('GET', '/api/config', { headers: cookie })).status, 403);
  // The page is this PC's own: another PC's team pet only talks to the API.
  assert.equal((await remote('GET', '/', { headers: cookie })).status, 403);
});

test('hub: a push needs the right key header, and then its person shows up, never any work', async () => {
  // An older PC may still send its AI sessions along: they are dropped unstored.
  const body = JSON.stringify({ user: { id: 'haru-pc', name: '하루' }, agents: [{ id: 's1', name: 'Claude', project: 'demo-shop-api', activity: 'editing', detail: 'Editing secret.ts', branch: 'feature/course/course-content' }] });
  const json = { 'content-type': 'application/json' };
  assert.equal((await remote('POST', '/api/push', { headers: { ...json, 'x-team-key': 'wrong' }, body })).status, 401);
  assert.equal((await remote('POST', '/api/push', { headers: { ...json, 'x-team-key': FLOOR_KEY }, body })).status, 204);
  const r = await remote('GET', '/api/state', { headers: cookie });
  const haru = JSON.parse(r.body).people.find((p) => p.id === 'person:haru-pc@예시팀');
  assert.equal(haru.name, '하루');
  assert.equal(haru.floor, '예시팀');
  assert.deepEqual([haru.projects, haru.work, haru.course], [[], '', '']);
  assert.doesNotMatch(r.body, /secret|editing|demo-shop-api|course-content/i);
});

const pushAs = (key, userId, agents, extra = {}) => remote('POST', '/api/push', {
  headers: { 'content-type': 'application/json', 'x-team-key': key },
  body: JSON.stringify({ user: { id: userId, name: userId, ...extra }, agents }),
});
const peopleOf = async (opts) => JSON.parse((await (opts ? remote('GET', '/api/state', opts) : request('GET', '/api/state'))).body).people;
// 🚪 The hub's owner is in one room at a time; a test that looks for them on a floor moves them there first.
const moveOwner = (name) => request('PUT', '/api/floors', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, joined: true }) });

test('floors: a floor key sees only its floor and can push only to it', async () => {
  await moveOwner('예시팀');
  const floorCookie = { 'x-team-key': FLOOR_KEY };
  assert.equal((await pushAs(FLOOR_KEY, 'cms-pc', [
    { id: 'a', project: 'demo-shop-web', activity: 'reading' },
    { id: 'b', project: 'web-app', activity: 'editing' },
  ])).status, 204);
  const s = JSON.parse((await remote('GET', '/api/state', { headers: floorCookie })).body);
  assert.deepEqual(s.floors, ['예시팀']);
  assert.ok(s.people.every((p) => p.floor === '예시팀'));
  // The person lands on this floor; what their PC sent of any work does not.
  const cms = s.people.find((p) => p.id === 'person:cms-pc@예시팀');
  assert.deepEqual(cms.projects, []);
  const all = await peopleOf();
  assert.ok(!all.some((p) => p.userId === 'cms-pc' && p.floor !== '예시팀'), 'a floor key cannot place anyone on another floor');
  assert.ok(all.some((p) => p.floor === '예시팀'), 'the owner sees the floor they are on');
  assert.equal((await remote('GET', '/api/config', { headers: floorCookie })).status, 403);
});

test('floors: only the hub PC makes a floor, and its link opens just that floor', async () => {
  const json = { 'content-type': 'application/json' };
  const body = JSON.stringify({ name: '비상' });
  assert.equal((await remote('POST', '/api/floors', { headers: { ...json, ...cookie }, body })).status, 403);
  assert.equal((await request('POST', '/api/floors', { headers: { ...json, origin: 'http://evil.example' }, body })).status, 403);
  const made = await request('POST', '/api/floors', { headers: json, body });
  assert.equal(made.status, 201);
  assert.equal((await request('POST', '/api/floors', { headers: json, body })).status, 409);
  const floor = JSON.parse(made.body).floors.find((f) => f.name === '비상');
  const key = new URL(floor.link).searchParams.get('key');
  assert.ok(key && key !== KEY && key !== FLOOR_KEY);

  assert.equal((await pushAs(key, 'bisang-pc', [{ id: 'x', project: 'whatever-repo', activity: 'running' }])).status, 204);
  const seen = JSON.parse((await remote('GET', '/api/state', { headers: { 'x-team-key': key } })).body);
  assert.deepEqual(seen.floors, ['비상']);
  assert.ok(seen.people.some((p) => p.id === 'person:bisang-pc@비상'));
  assert.ok(seen.people.every((p) => p.floor === '비상'));
});

test('floors: deleting a floor retires its key and its people', async () => {
  const json = { 'content-type': 'application/json' };
  const made = JSON.parse((await request('POST', '/api/floors', { headers: json, body: JSON.stringify({ name: '임시' }) })).body);
  const key = new URL(made.floors.find((f) => f.name === '임시').link).searchParams.get('key');
  assert.equal((await pushAs(key, 'tmp-pc', [{ id: 't', project: 'x', activity: 'editing' }])).status, 204);
  assert.equal((await remote('DELETE', '/api/floors', { headers: { ...json, ...cookie }, body: JSON.stringify({ name: '임시' }) })).status, 403);
  assert.equal((await request('DELETE', '/api/floors', { headers: json, body: JSON.stringify({ name: '임시' }) })).status, 200);
  assert.equal((await request('DELETE', '/api/floors', { headers: json, body: JSON.stringify({ name: '임시' }) })).status, 404);
  assert.equal((await pushAs(key, 'tmp-pc', [])).status, 401);
  const all = JSON.parse((await request('GET', '/api/state')).body);
  assert.ok(!all.people.some((p) => p.userId === 'tmp-pc'));
  assert.ok(!all.floors.includes('임시'));
});

test('floors: one PC on two floors of the same hub keeps both', async () => {
  const json = { 'content-type': 'application/json' };
  const made = JSON.parse((await request('POST', '/api/floors', { headers: json, body: JSON.stringify({ name: '둘째' }) })).body);
  const second = new URL(made.floors.find((f) => f.name === '둘째').link).searchParams.get('key');
  assert.equal((await pushAs(FLOOR_KEY, 'two-pc', [{ id: 's', project: 'demo-shop-api' }])).status, 204);
  assert.equal((await pushAs(second, 'two-pc', [{ id: 't', project: 'other-repo' }])).status, 204);
  assert.equal((await request('PUT', '/api/floors', { headers: json, body: JSON.stringify({ name: '둘째', joined: true }) })).status, 200);
  // The hub keeps both: the first floor's own key sees them there, and the owner, moved to 둘째, there.
  const cms = JSON.parse((await remote('GET', '/api/state', { headers: { 'x-team-key': FLOOR_KEY } })).body).people;
  assert.ok(cms.some((p) => p.id === 'person:two-pc@예시팀'));
  assert.ok((await peopleOf()).some((p) => p.id === 'person:two-pc@둘째'));
});

test('floors: the hub owner sees every floor of theirs, standing on one (joined); a member sees only its floor', async () => {
  const json = { 'content-type': 'application/json' };
  const made = JSON.parse((await request('POST', '/api/floors', { headers: json, body: JSON.stringify({ name: '남의 팀' }) })).body);
  const f = made.floors.find((x) => x.name === '남의 팀');
  // A floor made from the page has the hub's owner on it; they can step off one they only run.
  assert.equal(f.joined, false, 'a new floor leaves the owner where they are');
  assert.equal((await request('PUT', '/api/floors', { headers: json, body: JSON.stringify({ name: '남의 팀', joined: false }) })).status, 200);
  const key = new URL(f.link).searchParams.get('key');
  assert.equal((await pushAs(key, 'other-pc', [{ id: 'o', project: 'their-repo' }])).status, 204);
  for (const [who, opts] of [['owner', {}]]) {
    const s = JSON.parse((await (opts.remote ? remote : request)('GET', '/api/state', opts)).body);
    assert.ok(s.people.some((p) => p.floor === '남의 팀'), `${who} sees the people of every floor of theirs (the pet keeps the others as chat tabs)`);
    assert.deepEqual(s.notJoined, {});
  }
  // The floor's own people see each other as before.
  const theirs = JSON.parse((await remote('GET', '/api/state', { headers: { 'x-team-key': key } })).body);
  assert.ok(theirs.people.some((p) => p.id === 'person:other-pc@남의 팀'));
  assert.deepEqual(theirs.notJoined, {});
  // Joining is only for the hub PC, and needs a clear yes or no.
  assert.equal((await remote('PUT', '/api/floors', { headers: { ...json, ...cookie }, body: JSON.stringify({ name: '남의 팀', joined: true }) })).status, 403);
  assert.equal((await request('PUT', '/api/floors', { headers: json, body: JSON.stringify({ name: '남의 팀', joined: 'yes' }) })).status, 400);
  assert.equal((await request('PUT', '/api/floors', { headers: json, body: JSON.stringify({ name: '남의 팀', joined: true }) })).status, 200);
  assert.ok((await peopleOf()).some((p) => p.id === 'person:other-pc@남의 팀'));
});

test('me: a pushed status and note reach the floor, cleaned', async () => {
  assert.equal((await pushAs(FLOOR_KEY, 'help-pc', [], { name: '하루', status: 'help', note: 'API 질문 있어요\u0007' + 'x'.repeat(60) })).status, 204);
  const floorCookie = { headers: { 'x-team-key': FLOOR_KEY } };
  const a = (await peopleOf(floorCookie)).find((p) => p.id === 'person:help-pc@예시팀');
  assert.ok(a, 'a person is there with no AI session at all');
  assert.equal(a.status, 'help');
  assert.ok(a.note.startsWith('API 질문 있어요x') && a.note.length <= 40);
  // Anything but the known statuses is no status at all.
  await pushAs(FLOOR_KEY, 'help-pc', [], { name: '하루', status: 'boss', note: 'hi' });
  const b = (await peopleOf(floorCookie)).find((p) => p.id === 'person:help-pc@예시팀');
  assert.equal(b.status, '');
  assert.equal(b.note, '');
});

test('me: hidden people leave the floor at once; only this PC sets my state', async () => {
  await moveOwner('데모');
  const json = { 'content-type': 'application/json' };
  // A member who hides is gone from the floor on their next push.
  await pushAs(FLOOR_KEY, 'shy-pc', [{ id: 'q', project: 'demo-shop-api' }]);
  assert.ok((await peopleOf({ headers: cookie })).some((p) => p.userId === 'shy-pc'));
  await pushAs(FLOOR_KEY, 'shy-pc', [], { hidden: true });
  assert.ok(!(await peopleOf({ headers: cookie })).some((p) => p.userId === 'shy-pc'));

  // The hub owner sets theirs on this PC only.
  assert.equal((await remote('POST', '/api/me', { headers: { ...json, ...cookie }, body: '{"hidden":true}' })).status, 403);
  assert.equal((await request('POST', '/api/me', { headers: { ...json, origin: 'http://evil.example' }, body: '{"hidden":true}' })).status, 403);
  const set = await request('POST', '/api/me', { headers: json, body: JSON.stringify({ status: 'focus', note: '리뷰 중' }) });
  assert.deepEqual(JSON.parse(set.body), { hidden: false, status: 'focus', note: '리뷰 중', avatar: null });
  const seen = JSON.parse((await remote('GET', '/api/state', { headers: cookie })).body);
  const owner = seen.people.find((p) => p.id === 'person:hubpc@데모');
  assert.deepEqual([owner.status, owner.note, owner.pokeable], ['focus', '리뷰 중', false]);
  assert.equal(seen.me, null);

  await request('POST', '/api/me', { headers: json, body: '{"hidden":true}' });
  assert.ok(!(await peopleOf({ headers: cookie })).some((p) => p.userId === 'hubpc'));
  const mine = JSON.parse((await request('GET', '/api/state')).body);
  assert.equal(mine.me.hidden, true);

  // Clearing the status clears the note with it.
  const back = JSON.parse((await request('POST', '/api/me', { headers: json, body: '{"hidden":false,"status":""}' })).body);
  assert.deepEqual(back, { hidden: false, status: '', note: '', avatar: null });
});

test('avatar: the character I pick shows on the floor; a collector sends its pick', async () => {
  await moveOwner('데모');
  const json = { 'content-type': 'application/json' };
  const set = JSON.parse((await request('POST', '/api/me', { headers: json, body: '{"avatar":3}' })).body);
  assert.equal(set.avatar, 3);
  assert.equal((await peopleOf({ headers: cookie })).find((p) => p.id === 'person:hubpc@데모').avatar, 3);
  // Anything outside the list means "pick one for me".
  assert.equal(JSON.parse((await request('POST', '/api/me', { headers: json, body: '{"avatar":99}' })).body).avatar, null);
  await pushAs(FLOOR_KEY, 'look-pc', [], { avatar: 5 });
  assert.equal((await peopleOf({ headers: cookie })).find((p) => p.id === 'person:look-pc@예시팀').avatar, 5);
});

test('🎆 chat effects: a line that is only a command plays for the floor and reads as its words; one per person every 10 s', () => {
  let now = 1_000_000;
  const hub = new TeamHub({ now: () => now });
  hub.say('a@F', 'F', '다온', '/폭죽');
  hub.say('a@F', 'F', '다온', '/폭죽이다'); // not a command: plain words
  hub.say('a@F', 'F', '다온', '/춤 추자'); // words after it: plain words
  assert.deepEqual(hub.chatOn(['F']).map((m) => [m.text, m.fx]), [['🎆 폭죽 펑!', 'fireworks'], ['/폭죽이다', undefined], ['/춤 추자', undefined]]);
  assert.throws(() => hub.say('a@F', 'F', '다온', '/하트'), (e) => e.status === 429 && /10초/.test(e.message), 'too soon after the last one');
  hub.say('b@F', 'F', '하루', '/댄스'); // someone else is not held up
  now += 10_000;
  hub.say('a@F', 'F', '다온', '/춤');
  assert.deepEqual(hub.chatOn(['F']).slice(-2).map((m) => [m.name, m.fx]), [['하루', 'dance'], ['다온', 'dance']], '/댄스 is /춤');
  now += 10_000;
  hub.say('a@F', 'F', '다온', '/비');
  hub.say('b@F', 'F', '하루', '/우산');
  assert.deepEqual(hub.chatOn(['F']).slice(-2).map((m) => m.fx), ['rain', 'umbrella']);
});

test('chat picture: the line carries only its id, its floor fetches it, odd ones are refused', async () => {
  await moveOwner('예시팀');
  const json = { 'content-type': 'application/json' };
  const said = (body) => remote('POST', '/api/chat', { headers: { ...json, 'x-team-key': FLOOR_KEY }, body: JSON.stringify({ user: 'talk-pc', ...body }) });
  const pic = `data:image/png;base64,${Buffer.from('not-really-a-png').toString('base64')}`;
  await pushAs(FLOOR_KEY, 'talk-pc', [], { name: '하루' });
  assert.equal((await said({ text: '', image: pic })).status, 200, 'a picture alone is a line');
  const state = (await request('GET', '/api/state')).body;
  assert.doesNotMatch(state, /base64/, 'snapshots never carry the picture itself');
  const line = JSON.parse(state).chat.findLast((m) => m.img);
  assert.equal(line.floor, '예시팀');

  const at = (floor, id = line.img) => `/api/chat-img?floor=${encodeURIComponent(floor)}&id=${id}`;
  const floorCookie = { 'x-team-key': FLOOR_KEY };
  const got = await remote('GET', at('예시팀'), { headers: floorCookie });
  assert.equal(got.status, 200);
  assert.equal(got.headers['content-type'], 'image/png');
  assert.equal(got.body, 'not-really-a-png');
  assert.equal((await request('GET', at('예시팀'))).status, 200, 'the hub PC sees every floor');
  assert.equal((await remote('GET', at('데모'), { headers: floorCookie })).status, 404, 'named under another floor');
  assert.equal((await remote('GET', at('예시팀', 99999), { headers: floorCookie })).status, 404);

  // Only plain picture types, and not too big.
  const svg = `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`;
  assert.equal((await said({ text: 'x', image: svg })).status, 400);
  assert.equal((await said({ text: 'x', image: `data:image/jpeg;base64,${Buffer.alloc(600_001).toString('base64')}` })).status, 413);
});

test('poke: someone on the floor pokes a person, who collects it on their next push', async () => {
  const json = { 'content-type': 'application/json' };
  const floorCookie = { 'x-team-key': FLOOR_KEY };
  assert.equal((await pushAs(FLOOR_KEY, 'poke-pc', [], { name: '대상' })).status, 204);
  const id = 'person:poke-pc@예시팀';
  assert.equal((await peopleOf({ headers: floorCookie })).find((p) => p.id === id).pokeable, true);

  assert.equal((await remote('POST', '/api/poke', { headers: { ...json, ...floorCookie }, body: JSON.stringify({ id }) })).status, 200);
  // No limit: poking again counts again. A collector relays with the key header.
  assert.equal((await remote('POST', '/api/poke', { headers: { ...json, 'x-team-key': FLOOR_KEY }, body: JSON.stringify({ id, from: 'someone-pc' }) })).status, 200);
  // Nobody pokes themself through a relay.
  assert.equal((await remote('POST', '/api/poke', { headers: { ...json, 'x-team-key': FLOOR_KEY }, body: JSON.stringify({ id, from: 'poke-pc' }) })).status, 404);

  // The pokes ride on the answer to that PC's next push, once.
  const got = await pushAs(FLOOR_KEY, 'poke-pc', [], { name: '대상' });
  assert.equal(got.status, 200);
  assert.deepEqual(JSON.parse(got.body), { pokes: 2, floor: '예시팀' });
  // Everyone on the floor learns when they were poked, to see them flinch.
  assert.ok((await peopleOf({ headers: floorCookie })).find((p) => p.id === id).hit > 0);
  assert.equal((await pushAs(FLOOR_KEY, 'poke-pc', [], { name: '대상' })).status, 204);

  // Focusing means not now; and nobody pokes a person they cannot see.
  await pushAs(FLOOR_KEY, 'poke-pc2', [], { name: '집중', status: 'focus' });
  assert.equal((await remote('POST', '/api/poke', { headers: { ...json, ...floorCookie }, body: JSON.stringify({ id: 'person:poke-pc2@예시팀' }) })).status, 404);
  assert.equal((await remote('POST', '/api/poke', { headers: { ...json, ...floorCookie }, body: JSON.stringify({ id: 'person:other-pc@남의 팀' }) })).status, 404);
});

test('push: the collector hands a poke from the hub to the person', async () => {
  const pokes = [];
  const sink = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"pokes":2,"floor":"예시팀"}'); }); });
  await new Promise((r) => sink.listen(0, '127.0.0.1', r));
  const store = new EventEmitter();
  store.snapshot = () => ({ user: { id: 'pc', name: '나' }, agents: [] });
  const stop = startPush(store, { url: `http://127.0.0.1:${sink.address().port}`, key: 'k', onPoke: (n, floor) => pokes.push([n, floor]) });
  while (!pokes.length) await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(pokes[0], [2, '예시팀']);
  stop();
  sink.close();
});

test('push: the collector sends my status, and nothing of mine while hidden', async () => {
  const bodies = [];
  const sink = http.createServer((req, res) => {
    let s = '';
    req.on('data', (c) => { s += c; });
    req.on('end', () => { bodies.push(JSON.parse(s)); res.writeHead(204); res.end(); });
  });
  await new Promise((r) => sink.listen(0, '127.0.0.1', r));
  const store = new EventEmitter();
  store.snapshot = () => ({ user: { id: 'pc', name: '나' }, agents: [{ id: 'a', kind: 'main', project: 'cms', activity: 'editing', detail: 'secret.ts' }] });
  let me = { hidden: false, status: 'help', note: '질문' };
  const stop = startPush(store, {
    url: `http://127.0.0.1:${sink.address().port}`, key: 'k',
    prepare: (agents) => (me.hidden ? [] : agents), me: () => me,
  });
  const next = async (n) => { while (bodies.length < n) await new Promise((r) => setTimeout(r, 50)); return bodies[n - 1]; };
  const first = await next(1);
  assert.deepEqual([first.user.status, first.user.note, first.agents.length], ['help', '질문', 1]);
  assert.doesNotMatch(JSON.stringify(first), /secret/);
  me = { hidden: true, status: '', note: '' };
  store.emit('change');
  const second = await next(2);
  assert.equal(second.agents.length, 0);
  stop();
  sink.close();
});

test('link-info: the installer learns which floor a link opens', async () => {
  const ok = JSON.parse((await remote('GET', '/api/link-info', { headers: { 'x-team-key': FLOOR_KEY } })).body);
  assert.equal(ok.floor, '예시팀');
  assert.equal((await remote('GET', '/api/link-info', { headers: { 'x-team-key': 'wrong' } })).status, 401);
});

test('update: the hub hands out its program files only, to key holders only', async () => {
  assert.equal((await remote('GET', '/api/update')).status, 401);
  const r = await remote('GET', '/api/update', { headers: { 'x-team-key': FLOOR_KEY } });
  assert.equal(r.status, 200);
  const m = JSON.parse(r.body);
  assert.ok(m.files['server/index.js'] && m.files['client/app.js']);
  assert.ok(!Object.keys(m.files).some((f) => f.includes('config') && f.endsWith('.json') && !f.startsWith('server/') && !f.startsWith('client/')));
  const ok = await remote('GET', '/api/update/file?path=server/team.js', { headers: { 'x-team-key': FLOOR_KEY } });
  assert.equal(ok.status, 200);
  assert.match(ok.body, /class TeamHub/);
  for (const bad of ['../package.json', 'test/team.test.js', 'C:/Windows/win.ini', 'server\index.js', '']) {
    assert.equal((await remote('GET', '/api/update/file?path=' + encodeURIComponent(bad), { headers: { 'x-team-key': FLOOR_KEY } })).status, 404, bad);
  }
});

test('update: a member takes the newer build from its hub, file by file, and never goes back', async () => {
  const { manifest, programFile, updateFrom } = await import('../server/update.js');
  const hubRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'town-hub-'));
  const memRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'town-mem-'));
  const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  put(hubRoot, 'version.json', '{"version":200}');
  put(hubRoot, 'server/a.js', 'new a');
  put(hubRoot, 'client/new.js', 'brand new');
  put(hubRoot, 'scripts/same.js', 'same');
  put(memRoot, 'version.json', '{"version":100}');
  put(memRoot, 'server/a.js', 'old a');
  put(memRoot, 'scripts/same.js', 'same');
  put(memRoot, 'config.json', '{"mine":true}');
  const hub = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.headers['x-team-key'] !== 'k') { res.writeHead(401); return res.end(); }
    if (u.pathname === '/api/update') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(manifest(hubRoot))); }
    const f = programFile(hubRoot, u.searchParams.get('path'));
    if (!f) { res.writeHead(404); return res.end(); }
    res.writeHead(200); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => hub.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${hub.address().port}`;
  try {
    const r = await updateFrom({ url, key: 'k', root: memRoot, log: () => {} });
    assert.equal(r.updated, true);
    assert.equal(r.files, 3, 'version.json, a.js and the new file — not the unchanged one');
    assert.equal(fs.readFileSync(path.join(memRoot, 'server/a.js'), 'utf8'), 'new a');
    assert.equal(fs.readFileSync(path.join(memRoot, 'client/new.js'), 'utf8'), 'brand new');
    assert.equal(fs.readFileSync(path.join(memRoot, 'config.json'), 'utf8'), '{"mine":true}', 'settings are never touched');
    assert.equal((await updateFrom({ url, key: 'k', root: memRoot, log: () => {} })).updated, false, 'now up to date');
    // A member on a newer build than the hub stays where it is.
    put(memRoot, 'version.json', '{"version":300}');
    put(memRoot, 'server/a.js', 'newer a');
    assert.equal((await updateFrom({ url, key: 'k', root: memRoot, log: () => {} })).updated, false);
    assert.equal(fs.readFileSync(path.join(memRoot, 'server/a.js'), 'utf8'), 'newer a');
    // A wrong key gets nothing.
    assert.equal((await updateFrom({ url, key: 'nope', root: memRoot, log: () => {} })).updated, false);
  } finally {
    hub.close();
    fs.rmSync(hubRoot, { recursive: true, force: true });
    fs.rmSync(memRoot, { recursive: true, force: true });
  }
});

test('first run: a new PC never looks around the network; it joins with the hub\'s invite link', async () => {
  const json = { 'content-type': 'application/json' };
  // The hub hands out an invite: its own address and the room's join code.
  const floor = JSON.parse((await request('GET', '/api/floors')).body).floors.find((f) => f.name === '데모');
  assert.match(floor.invite, new RegExp(`^http://[\\d.]+:${port}/\\?code=${floor.code}$`));
  const mPort = await freePort();
  const mCfg = path.join(dir, 'invited.json');
  fs.writeFileSync(mCfg, JSON.stringify({ user: { id: 'invited-pc', name: '초대' } }));
  const member = spawn(process.execPath, [path.join(ROOT, 'server/index.js'), '--push-config', '--demo', '--port', String(mPort), '--config', mCfg], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    member.stdout.on('data', (d) => { if (String(d).includes('is open at')) resolve(); });
    member.on('exit', (code) => reject(new Error(`invited member exited with ${code}`)));
  });
  const mine = async (body) => {
    const r = await fetch(`http://127.0.0.1:${mPort}/api/links`, { method: 'POST', headers: json, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  try {
    // A bare code, with no hub known yet: it asks for the link instead of sweeping the network.
    const bare = await mine({ code: floor.code });
    assert.equal(bare.status, 404);
    assert.match(bare.body.error, /참가 링크/);
    // The invite, with this test hub's address in place of its office address.
    const joined = await mine({ code: `http://127.0.0.1:${port}/?code=${floor.code.toLowerCase()}`, name: '초대받은 사람' });
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    assert.equal(joined.body.joined, '데모');
    // A wrong code in an invite says so.
    assert.equal((await mine({ code: `http://127.0.0.1:${port}/?code=ZZZZZZ` })).status, 404);
  } finally {
    member.kill();
  }
});


test('invite page: the link opened in a browser gets a teammate in; the code alone, or a wrong one, opens no page', async () => {
  const floor = JSON.parse((await request('GET', '/api/floors')).body).floors.find((f) => f.name === '데모');
  const r = await remote('GET', `/?code=${floor.code.toLowerCase()}`);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/html/);
  assert.match(r.body, /총괄 님이 <span class="room">'데모'<\/span> 방에 초대했어요/);
  assert.match(r.body, /TeamPet-mac-arm64\.dmg/);
  assert.match(r.body, /TeamPet-Setup\.exe/);
  assert.match(r.body, new RegExp(`value="http://192\\.168\\.1\\.40:${port}/\\?code=${floor.code}"`), 'the link as the visitor reached the hub');
  assert.doesNotMatch(r.body, /<p class="why">[^<]/, 'a working code has nothing to warn about');
  const bad = await remote('GET', '/?code=ZZZZZZ');
  assert.equal(bad.status, 200);
  assert.match(bad.body, /없는 코드/);
  assert.doesNotMatch(bad.body, /총괄 님이/);
  // Without a code the page stays this PC's own.
  assert.equal((await remote('GET', '/')).status, 403);
  assert.equal((await remote('GET', '/pet.html')).status, 403);
});

test('office address: a real Wi-Fi or Ethernet address, never a VPN, virtual or link-local one', async () => {
  const { officeAddress } = await import('../server/config.js');
  const v4 = (address) => [{ family: 'IPv4', internal: false, address }];
  assert.equal(officeAddress({ lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }], utun3: v4('192.0.0.2'), en0: v4('192.168.2.58'), en17: v4('169.254.126.93') }), '192.168.2.58', 'a Mac on Wi-Fi with a VPN up');
  assert.equal(officeAddress({ 'vEthernet (WSL)': v4('172.29.0.1'), 'VMware Network Adapter VMnet8': v4('192.168.56.1'), 이더넷: v4('10.20.30.40') }), '10.20.30.40', 'Windows with WSL and VMware');
  assert.equal(officeAddress({ 'Wi-Fi': v4('192.168.0.7'), 이더넷: v4('10.20.30.40') }), '192.168.0.7', '192.168 first, as before');
  assert.equal(officeAddress({ utun0: v4('100.64.0.5') }), '100.64.0.5', 'only a VPN: better than nothing');
  assert.equal(officeAddress({}), 'localhost');
});

test('join code: short, easy to type, read the same however it is typed', async () => {
  const { newJoinCode, cleanJoinCode, TryLimit } = await import('../server/team.js');
  const c = newJoinCode();
  assert.match(c, /^[A-HJKMNP-Z2-9]{6}$/, 'no 0 O 1 I L');
  assert.equal(cleanJoinCode(' k7q-2mx '), 'K7Q2MX');
  let t = 0;
  const lim = new TryLimit({ max: 2, windowMs: 1000, now: () => t });
  lim.miss('a'); lim.miss('a');
  assert.equal(lim.blocked('a'), true);
  assert.equal(lim.blocked('b'), false);
  t = 2000;
  assert.equal(lim.blocked('a'), false, 'the pause ends');
});

test('join code: a member joins a floor with a code from their page, and leaves it themselves', async () => {
  await moveOwner('데모');
  const json = { 'content-type': 'application/json' };
  const floorsOf = async () => JSON.parse((await request('GET', '/api/floors')).body).floors;
  const demo = (await floorsOf()).find((f) => f.name === '데모');
  assert.match(demo.code, /^[A-Z2-9]{6}$/);
  assert.ok(demo.codeUntil > Date.now() + 6 * 86_400_000, 'a week to use it');
  // Only the hub PC sees the codes.
  assert.equal((await remote('GET', '/api/floors', { headers: cookie })).status, 403);

  // A member's PC, already on 예시팀.
  const mPort = await freePort();
  const mCfg = path.join(dir, 'member.json');
  fs.writeFileSync(mCfg, JSON.stringify({ user: { id: 'member-pc', name: '팀원' }, team: { links: [{ hubUrl: `http://127.0.0.1:${port}`, key: FLOOR_KEY, name: '예시팀', share: [] }] } }));
  const member = spawn(process.execPath, [path.join(ROOT, 'server/index.js'), '--push-config', '--demo', '--port', String(mPort), '--config', mCfg], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    member.stdout.on('data', (d) => { if (String(d).includes('is open at')) resolve(); });
    member.on('exit', (code) => reject(new Error(`member exited with ${code}`)));
  });
  const mine = (method, p, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: mPort, method, path: p, headers: { host: `localhost:${mPort}`, ...(body ? { ...json, 'content-length': Buffer.byteLength(body) } : {}) } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
  const onDemo = async () => (await peopleOf()).some((p) => p.userId === 'member-pc' && p.floor === '데모');
  const until = async (ok) => { for (let i = 0; i < 100 && !(await ok()); i++) await new Promise((r) => setTimeout(r, 100)); return ok(); };
  try {
    // The hub PC may be a member of other PCs' rooms too: an empty list, not a refusal.
    assert.equal((await request('GET', '/api/links')).status, 200);
    assert.deepEqual(JSON.parse((await request('GET', '/api/links')).body).links, []);
    assert.equal((await mine('POST', '/api/links', JSON.stringify({ code: 'ZZZZZZ' }))).status, 404);
    // Typed in lower case with the dash, as read out.
    const code = `${demo.code.slice(0, 3)}-${demo.code.slice(3)}`.toLowerCase();
    const joined = await mine('POST', '/api/links', JSON.stringify({ code }));
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    assert.equal(joined.body.joined, '데모');
    // One room at a time: the new one takes the old one's place.
    assert.equal(joined.body.left, '예시팀');
    assert.deepEqual(joined.body.links.map((l) => l.name), ['데모']);
    assert.ok(joined.body.links.every((l) => !('key' in l)), 'the page never sees a key');
    assert.equal(JSON.parse(fs.readFileSync(mCfg, 'utf8')).team.links.length, 1, 'kept for the next start');
    assert.ok(await until(onDemo), 'the member shows up on the new floor without a restart');
    assert.equal((await mine('POST', '/api/links', JSON.stringify({ code }))).status, 409, 'already on it');

    const left = await mine('POST', '/api/links', JSON.stringify({ leave: 0 }));
    assert.equal(left.status, 200, 'out of the room: back to the first run');
    assert.equal(left.body.left, '데모');
    assert.equal(await onDemo(), false, 'gone from the floor at once, not after a minute');
    assert.deepEqual(left.body.links, []);
    assert.equal(JSON.parse(fs.readFileSync(mCfg, 'utf8')).team.links.length, 0);

    // A new code retires the old one.
    const renewed = await request('PUT', '/api/floors', { headers: json, body: JSON.stringify({ name: '데모', code: true }) });
    assert.notEqual(JSON.parse(renewed.body).floors.find((f) => f.name === '데모').code, demo.code);
    assert.equal((await mine('POST', '/api/links', JSON.stringify({ code }))).status, 404);
    // Guessing stops after a few wrong tries.
    let last;
    for (let i = 0; i < 10; i++) last = await request('POST', '/api/join', { headers: json, body: JSON.stringify({ code: 'WRONG' + i }) });
    assert.equal(last.status, 429);
  } finally {
    member.kill();
  }
});


test('first run: a new PC with no floor stays up, greets me, and joins from my page with a name and a link', async () => {
  await moveOwner('예시팀');
  const json = { 'content-type': 'application/json' };
  const mPort = await freePort();
  const mCfg = path.join(dir, 'fresh.json');
  fs.writeFileSync(mCfg, JSON.stringify({ user: { id: 'fresh-pc', name: 'pcuser' } }));
  const member = spawn(process.execPath, [path.join(ROOT, 'server/index.js'), '--push-config', '--demo', '--port', String(mPort), '--config', mCfg], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    member.stdout.on('data', (d) => { if (String(d).includes('is open at')) resolve(); });
    member.on('exit', (code) => reject(new Error(`fresh member exited with ${code}`)));
  });
  const mine = (method, p, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: mPort, method, path: p, headers: { host: `localhost:${mPort}`, ...(body ? { ...json, 'content-length': Buffer.byteLength(body) } : {}) } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
  try {
    const before = (await mine('GET', '/api/state')).body;
    assert.equal(before.team, false, 'no floor yet: the page shows the welcome');
    assert.ok(before.room);
    assert.deepEqual((await mine('GET', '/api/links')).body.links, []);
    // A pasted share link works in the code box too, and the name comes along.
    const joined = await mine('POST', '/api/links', JSON.stringify({ name: '새 팀원', code: `http://127.0.0.1:${port}/?key=${FLOOR_KEY}` }));
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    assert.equal(joined.body.joined, '예시팀');
    const saved = JSON.parse(fs.readFileSync(mCfg, 'utf8'));
    assert.equal(saved.user.name, '새 팀원');
    assert.equal(saved.team.links.length, 1);
    assert.ok(await (async () => { for (let i = 0; i < 100; i++) { if ((await peopleOf()).some((p) => p.userId === 'fresh-pc' && p.name === '새 팀원')) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })(), 'on the floor under the new name');
    assert.equal((await mine('GET', '/api/state')).body.team, true);
    // A wrong link says so.
    assert.equal((await mine('POST', '/api/links', JSON.stringify({ code: `http://127.0.0.1:${port}/?key=nope` }))).status, 401);
  } finally {
    member.kill();
  }
});

test('roster: the admin sees who connected, when, on which build; a PC with the office installed is known by its address', () => {
  let now = 1_000_000;
  const hub = new TeamHub({ now: () => now });
  hub.receive({ user: { id: 'rio-pc', name: 'Rio', client: { version: 5, via: 'exe', pet: true } }, agents: [] }, { floor: '놀이터', ip: '192.168.1.77' });
  hub.receive({ user: { id: 'haru-pc', name: 'Haru', client: { version: 3, via: 'zip', pet: false, extra: 'x' } }, agents: [] }, { floor: '예시팀', ip: '192.168.1.78' });
  hub.visit('g1', '놀이터', { name: '손님' });
  assert.equal(hub.installedAt('192.168.1.77'), true);
  assert.equal(hub.installedAt('192.168.1.99'), false);
  assert.equal(hub.installedAt('127.0.0.1'), false, 'this PC itself says nothing');
  now += 2 * 60_000;
  hub.receive({ user: { id: 'rio-pc', name: 'Rio', client: { version: 5, via: 'exe', pet: true } }, agents: [] }, { floor: '놀이터', ip: '192.168.1.77' });
  const r = hub.roster();
  assert.deepEqual(r.map((p) => [p.name, p.online, p.via, p.version, p.pet]), [['Rio', true, 'exe', 5, true], ['Haru', false, 'zip', 3, false]], 'the guest left with the minute, Haru is gone but remembered');
  assert.equal(hub.installedAt('192.168.1.78'), false, 'gone is not here');
  // It survives a restart of the hub.
  const again = new TeamHub({ now: () => now });
  again.importSeen(JSON.parse(JSON.stringify(hub.exportSeen())));
  assert.deepEqual(again.roster().map((p) => [p.name, p.floors]), [['Rio', ['놀이터']], ['Haru', ['예시팀']]]);
});

test('mention: "@이름" calls that person, and "@" with the first word of a long name does too', async () => {
  const { calls, petView } = await import('../server/pet.js');
  assert.equal(calls('@하루 리뷰 부탁해요', '하루'), true);
  assert.equal(calls('@hana 확인', 'hana (admin)'), true);
  assert.equal(calls('@HANA (admin) 확인', 'hana (admin)'), true);
  assert.equal(calls('하루 리뷰', '하루'), false, 'no @, no call');
  assert.equal(calls('@다온 봐줘', '하루'), false);
  assert.equal(calls('@all 회의 5분 전', '하루'), true, '@all calls everyone');
  assert.equal(calls('@모두 점심!', '다온'), true);
  assert.equal(calls('@allen 봐줘', '하루'), false, 'a name that starts with all is not everyone');
  const v = petView({ floors: ['A'], people: [], chat: [
    { id: 1, floor: 'A', key: 'mj@A', name: '다온', text: '@하루 이거 봐줘', at: 1 },
    { id: 2, floor: 'A', key: 'el@A', name: '하루', text: '@하루 메모', at: 2 },
  ] }, { myId: 'el', myName: '하루', pet: { on: true, kind: 'cat' }, pokes: 0, agents: [] });
  assert.deepEqual(v.chat.map((m) => m.me), [true, false], 'my own line never calls me');
});

test('update: every push answer names the office build, so a member behind it updates right away', async () => {
  const r = await pushAs(FLOOR_KEY, 'build-pc', []);
  assert.ok('x-office-build' in r.headers);
  const seen = [];
  const sink = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(204, { 'x-office-build': '777' }); res.end(); }); });
  await new Promise((ok) => sink.listen(0, '127.0.0.1', ok));
  const store = new EventEmitter();
  store.snapshot = () => ({ user: { id: 'pc', name: '나' }, agents: [] });
  const stop = startPush(store, { url: `http://127.0.0.1:${sink.address().port}`, key: 'k', onOffice: (b) => seen.push(b) });
  while (!seen.length) await new Promise((ok) => setTimeout(ok, 50));
  assert.equal(seen[0], 777);
  stop();
  sink.close();
});

test('note: a note reaches only its reader, on their next push, and never the floor', async () => {
  const json = { 'content-type': 'application/json' };
  assert.equal((await pushAs(FLOOR_KEY, 'note-pc', [])).status, 204);
  assert.equal((await pushAs(FLOOR_KEY, 'other-pc', [])).status, 204);
  // The hub's owner writes to note-pc on 예시팀.
  const sent = await request('POST', '/api/note', { headers: json, body: JSON.stringify({ floor: '예시팀', to: 'note-pc', toName: 'note', text: '비밀 이야기' }) });
  assert.equal(sent.status, 200, sent.body);
  assert.equal((await request('POST', '/api/note', { headers: json, body: JSON.stringify({ floor: '예시팀', to: 'nobody-pc', text: 'x' }) })).status, 404, 'only to someone on the floor');
  const floor = JSON.parse((await remote('GET', '/api/state', { headers: { 'x-team-key': FLOOR_KEY } })).body);
  assert.ok(!JSON.stringify(floor).includes('비밀 이야기'), 'not on the floor');
  assert.equal((await pushAs(FLOOR_KEY, 'other-pc', [])).status, 204, 'nothing for someone else');
  const mine = await pushAs(FLOOR_KEY, 'note-pc', []);
  assert.equal(mine.status, 200);
  const got = JSON.parse(mine.body).notes;
  assert.equal(got.length, 1);
  assert.equal(got[0].text, '비밀 이야기');
  assert.equal(got[0].from, 'hubpc');
  assert.equal((await pushAs(FLOOR_KEY, 'note-pc', [])).status, 204, 'handed over once');
  // My own page keeps what I sent.
  const me = JSON.parse((await request('GET', '/api/state')).body);
  assert.ok(me.notes.some((n) => n.dir === 'out' && n.who === 'note-pc' && n.text === '비밀 이야기'));
});

test('duel: invites, Russian roulette, rock-paper-scissors and the quick draw, decided by the hub', async () => {
  const { Duels } = await import('../server/duel.js');
  let now = 0;
  const ended = [];
  const rolls = [];
  const d = new Duels({ now: () => now, rand: () => (rolls.length ? rolls.shift() : 0), onEnd: (g) => ended.push(g) });
  const A = { id: 'a', name: '다온', floor: 'F' };
  const B = { id: 'b', name: '하루' };
  // An invite: only the invited one answers; a second game waits for the first.
  const g = d.invite(A, B, 'roulette');
  assert.throws(() => d.invite(A, B, 'rps'), /이미 대결 중/);
  assert.throws(() => d.answer('a', g.id, true), /받은 대결 신청이 없습니다/);
  assert.equal(d.view('b').invited, true);
  // The bullet in chamber 2 (the third), "a" first: a pulls, b passes, a pulls, b pulls the bullet.
  rolls.push(2 / 6, 0.1);
  d.answer('b', g.id, true);
  assert.equal(d.view('a').bullet, undefined, 'the bullet is never shown during the game');
  assert.equal(d.view('a').myTurn, true);
  assert.throws(() => d.move('b', g.id, 'pull'), /내 차례가 아니에요/);
  d.move('a', g.id, 'pull');
  d.move('b', g.id, 'pass');
  assert.throws(() => d.move('b', g.id, 'pass'), /내 차례가 아니에요/);
  d.move('a', g.id, 'pull');
  d.move('b', g.id, 'pull');
  assert.equal(d.view('b').result, 'lose');
  assert.equal(d.view('a').result, 'win');
  assert.equal(d.view('a').bullet, 2, 'shown once it is over');
  assert.equal(ended.length, 1);
  now += 13_000;
  assert.equal(d.view('a'), null, 'gone a little after');
  // Rock-paper-scissors, best of three.
  const r = d.invite(A, B, 'rps');
  d.answer('b', r.id, true);
  d.move('a', r.id, 'r'); d.move('b', r.id, 's');
  assert.deepEqual(d.view('a').score, [1, 0]);
  d.move('a', r.id, 'p'); d.move('b', r.id, 'p');
  d.move('a', r.id, 'p'); d.move('b', r.id, 'r');
  assert.equal(d.view('a').result, 'win');
  now += 13_000;
  // The quick draw: a shot before "쏴!" loses; a declined invite ends at once.
  rolls.push(0.5);
  const q = d.invite(A, B, 'quickdraw');
  d.answer('b', q.id, true);
  assert.ok(d.view('a').goIn >= 4000);
  d.move('a', q.id, { early: true });
  d.move('b', q.id, { ms: 320 });
  assert.equal(d.view('b').result, 'win');
  now += 13_000;
  const q2 = d.invite(A, B, 'quickdraw');
  d.answer('b', q2.id, true);
  d.move('b', q2.id, { ms: 250 });
  now += 20_000;
  assert.equal(d.view('b').result, 'win', 'the one who never shot loses when time runs out');
  now += 13_000;
  const no = d.invite(A, B, 'rps');
  d.answer('b', no.id, false);
  assert.equal(d.view('a').phase, 'declined');
});

test('duel: the hub owner challenges a member, the member answers through its PC, and the floor hears who won', async () => {
  await moveOwner('예시팀');
  const json = { 'content-type': 'application/json' };
  assert.equal((await pushAs(FLOOR_KEY, 'duel-pc', [], { name: '도전자' })).status, 204);
  const mine = (body) => request('POST', '/api/duel', { headers: json, body: JSON.stringify({ floor: '예시팀', ...body }) });
  const theirs = (body) => remote('POST', '/api/duel', { headers: { ...json, 'x-team-key': FLOOR_KEY }, body: JSON.stringify({ user: 'duel-pc', ...body }) });
  const inv = JSON.parse((await mine({ op: 'invite', to: 'duel-pc', game: 'roulette' })).body).duel;
  assert.equal(inv.phase, 'invite');
  assert.equal(inv.invited, false);
  const seen = JSON.parse((await theirs({ op: 'state' })).body).duel;
  assert.equal(seen.invited, true);
  assert.equal(seen.foe.name, '총괄');
  let v = JSON.parse((await theirs({ op: 'accept', id: seen.id })).body).duel;
  assert.equal(v.phase, 'play');
  // Pull in turns until someone draws the bullet: six chambers, so it ends.
  for (let i = 0; i < 6 && v.phase === 'play'; i++) {
    const who = v.myTurn ? theirs : mine;
    v = JSON.parse((await who({ op: 'move', id: v.id, move: 'pull' })).body).duel;
    v = JSON.parse((await theirs({ op: 'state' })).body).duel;
  }
  assert.equal(v.phase, 'done');
  assert.ok(['win', 'lose'].includes(v.result));
  const floor = JSON.parse((await request('GET', '/api/state')).body);
  assert.ok(floor.chat.some((m) => m.name === '⚔️ 대결' && m.text.includes('러시안 룰렛')), 'the floor hears how it ended');
  assert.equal((await mine({ op: 'invite', to: 'nobody', game: 'rps' })).status, 404);
});

test('relay drawing: the first sees the topic, the next ones only the picture, the last names it', async () => {
  const { Relays } = await import('../server/relay.js');
  const { CATCH_WORDS } = await import('../server/catch-words.js');
  const TOPICS = CATCH_WORDS; // one plain word each, as 캐치마인드
  let now = 0;
  const ended = [];
  const r = new Relays({ now: () => now, rand: () => 0, onEnd: (g) => ended.push(g) });
  const P = (id) => ({ id, name: id.toUpperCase() });
  r.open('F', P('a'));
  assert.throws(() => r.open('F', P('b')), /이미/);
  r.join('F', P('b'));
  r.join('F', P('c'));
  assert.throws(() => r.start('F', 'b'), /연 사람/);
  r.start('F', 'a');
  const order = r.get('F').players.map((p) => p.id);
  const [first, mid, last] = order;
  assert.equal(r.view('F', first).topic, TOPICS[0], 'the first drawer sees the topic');
  assert.equal(r.view('F', mid).topic, undefined, 'the middle one does not');
  assert.equal(r.view('F', mid).strokes, undefined, 'and sees no picture until their turn');
  r.stroke('F', first, { w: 6, points: [[10, 10], [500, 500], [2000, -5]] });
  assert.deepEqual(r.get('F').strokes[0].points.at(-1), [1000, 0], 'kept on the sheet');
  assert.throws(() => r.stroke('F', mid, { points: [[1, 1]] }), /내 차례가 아니에요/);
  r.pass('F', first);
  assert.equal(r.view('F', mid).myTurn, true);
  assert.equal(r.view('F', mid).strokes.length, 1, 'now the middle one sees what came before');
  assert.equal(r.view('F', mid).topic, undefined);
  now += 16_000;
  assert.equal(r.view('F', last).role, 'guesser', 'time up: on to the guesser');
  assert.equal(r.view('F', last).myTurn, true);
  r.guess('F', last, ' ' + TOPICS[0].split('').join(' ') + ' ');
  const end = r.view('F', mid);
  assert.equal(end.phase, 'reveal', 'the first of three topics: its answer shows a moment');
  assert.equal(end.correct, true, 'spaces do not matter');
  assert.equal(end.topic, TOPICS[0], 'everyone sees it once it is over');
  assert.deepEqual([end.round, end.rounds], [1, 3]);
  assert.equal(ended.length, 0, 'not over yet');
  // The next topic: the order turns by one, so someone else starts and someone else names it.
  now += 9_000;
  const g = r.get('F');
  assert.equal(g.phase, 'draw');
  assert.deepEqual(g.players.map((p) => p.id), [mid, last, first]);
  assert.equal(r.view('F', mid).role, 'first');
  assert.equal(r.view('F', first).role, 'guesser');
  assert.notEqual(r.view('F', mid).topic, TOPICS[0], 'a new topic');
  assert.equal(r.view('F', mid).strokes.length, 0, 'a clean sheet');
  // Nobody names the second (time runs out), a wrong name for the third: over, 1 of 3.
  now += 21_000; r.get('F'); now += 16_000; r.get('F'); now += 31_000; r.get('F');
  assert.equal(g.phase, 'reveal');
  now += 9_000; r.get('F');
  r.pass('F', g.players[0].id); r.pass('F', g.players[1].id);
  // A part of the word, or a word with it in, is not the word.
  const third = g.topic;
  assert.throws(() => r.guess('F', g.players[0].id, third), /마지막 사람/);
  r.guess('F', g.players[2].id, third + '집');
  assert.equal(r.view('F', first).results[2].correct, false, 'more than the word is wrong');
  const fin = r.view('F', first);
  assert.equal(fin.phase, 'done');
  assert.equal(fin.score, 1);
  assert.deepEqual(fin.results.map((x) => x.correct), [true, false, false]);
  assert.equal(ended.length, 1);
});

test('relay drawing: a topic comes back only after all the others had their turn', async () => {
  const { Relays, TOPICS } = await import('../server/relay.js');
  assert.ok(TOPICS.length >= 150, 'plenty of topics');
  assert.equal(new Set(TOPICS).size, TOPICS.length, 'no topic twice');
  const r = new Relays({ used: ['등대'] });
  const seen = new Set();
  for (let i = 0; i < TOPICS.length - 1; i++) seen.add(r.pickTopic());
  assert.equal(seen.size, TOPICS.length - 1, 'every other topic once');
  assert.ok(!seen.has('등대'), 'the used one waits');
  assert.ok(TOPICS.includes(r.pickTopic()));
  assert.equal(r.used.size, 1, 'all drawn: a new round starts');
});

test('party: the stack cuts what overhangs and ends on a miss; the bomb flies and goes off; 끝말잇기 keeps 두음법칙', async () => {
  const { Parties, startsFor } = await import('../server/party.js');
  let now = 0;
  const ended = [];
  const P = (id) => ({ id, name: id.toUpperCase() });
  const p = new Parties({ now: () => now, rand: () => 0, onEnd: (g) => ended.push(g) });
  // 🏗 stack: rand 0 keeps the order b, c, a after the shuffle; drop by drop.
  p.open('F', P('a'), 'stack');
  p.join('F', P('b'));
  p.start('F', 'a');
  const g = p.get('F');
  const first = g.players[0].id;
  assert.equal(p.view('F', first).myTurn, true);
  p.act('F', first, 'drop', 300 + 4);
  assert.equal(g.blocks.at(-1).w, 400, 'within a hair of the one below: perfect, nothing cut');
  const second = g.players[1].id;
  p.act('F', second, 'drop', 400);
  assert.deepEqual(g.blocks.at(-1), { x: 400, w: 300, by: 1 }, 'the overhang is cut off');
  p.act('F', first, 'drop', 0);
  assert.equal(g.phase, 'done', 'a miss brings it down');
  assert.equal(g.height, 2);
  assert.equal(p.records.F, 2, 'the floor record');
  now += 50_000;
  // 💣 bomb: held a second before it flies; goes off in the holder's hands.
  p.open('F', P('a'), 'bomb');
  p.join('F', P('b'));
  p.start('F', 'a');
  const b = p.get('F');
  const holder = b.players[b.turn].id, other = b.players[1 - b.turn].id;
  assert.throws(() => p.act('F', holder, 'toss', other), /1초/);
  now += 1500;
  p.act('F', holder, 'toss', other);
  assert.equal(p.view('F', other).myTurn, true);
  assert.throws(() => p.act('F', holder, 'toss', other), /든 사람만/);
  now += 40_000;
  assert.equal(p.view('F', other).phase, 'done');
  assert.equal(b.loser, 1 - 0, 'the one holding it loses');
  now += 50_000;
  // 🔤 words: 두음법칙, no repeats, out on time.
  assert.deepEqual([...startsFor('력')].sort(), ['력', '역'].sort());
  assert.deepEqual([...startsFor('라')].sort(), ['나', '라'].sort());
  assert.deepEqual([...startsFor('녀')].sort(), ['녀', '여'].sort());
  p.open('F', P('a'), 'words');
  p.join('F', P('b'));
  p.join('F', P('c'));
  p.start('F', 'a');
  const w = p.get('F');
  w.words = [{ word: '기차', by: null }];
  const at0 = w.players[w.turn].id;
  assert.throws(() => p.act('F', at0, 'say', '사과'), /「차」/);
  p.act('F', at0, 'say', '차력');
  const at1 = w.players[w.turn].id;
  p.act('F', at1, 'say', '역사');
  const at2 = w.players[w.turn].id;
  now += 13_000;
  assert.equal(p.view('F', at2).alive.filter(Boolean).length, 2, 'out on time');
  const next = w.players[w.turn].id;
  w.words.splice(1, 0, { word: '사자', by: 0 });
  assert.throws(() => p.act('F', next, 'say', '사자'), /이미 나온/);
  p.act('F', next, 'say', '사탕');
  now += 13_000;
  p.get('F');
  assert.equal(w.phase, 'done', 'the time runs out on the next one: one is left');
  assert.ok(w.how.includes('살아남았어요'));
});

test('📦 update notes: the ones after the last put away, newest first; a first look gets only the newest; the shipped file reads', async () => {
  const { newsView } = await import('../server/pet.js');
  const notes = [
    { n: 1, date: '10/29', head: '하나', lines: ['a'] },
    { n: 3, date: '11/02', head: '셋', lines: ['c', 'c2'] },
    { n: 2, date: '10/31', head: '둘', lines: ['b'] },
  ];
  assert.deepEqual(newsView(notes, 1), { n: 3, fresh: true, items: [{ date: '11/02', head: '셋', lines: ['c', 'c2'] }, { date: '10/31', head: '둘', lines: ['b'] }] }, 'away for days: both missed ones');
  assert.deepEqual(newsView(notes, undefined).items.map((x) => x.head), ['셋'], 'never put any away: not the whole history');
  const seen = newsView(notes, 3);
  assert.equal(seen.fresh, false, 'nothing new: no card');
  assert.deepEqual(seen.items.map((x) => x.head), ['셋'], 'the menu still shows the newest');
  assert.equal(newsView([], 0), null);
  assert.equal(newsView([{ n: 'x', lines: [] }], 0), null);
  const shipped = JSON.parse(fs.readFileSync(new URL('../server/patch-notes.json', import.meta.url), 'utf8'));
  const v = newsView(shipped, undefined);
  assert.ok(v && v.fresh && v.items[0].head && v.items[0].lines.length, 'the shipped notes have a number, a head and lines');
  assert.equal(new Set(shipped.map((x) => x.n)).size, shipped.length, 'each note its own number');
});

test('pet: friends sit with their animal in their floor group, a line names who said it, answers go to that floor', async () => {
  const { petView, cleanPet, kindFor, PET_KINDS } = await import('../server/pet.js');
  const snap = {
    floors: ['A', 'B'],
    people: [
      { userId: 'me', name: '나', pet: 'cat', floor: 'A' },
      { userId: 'haru', name: '하루', pet: 'rabbit', floor: 'B' },
      { userId: 'haru', name: '하루', pet: 'rabbit', floor: 'A' }, // the same person on a second floor
      { userId: 'haru', name: '하루', pet: 'rabbit', floor: 'A' }, // listed twice: still one pet
      { userId: 'guest:ab', name: '손님', guest: true, floor: 'A' },
    ],
    chat: [
      { id: 2, floor: 'B', key: 'haru@B', name: '하루', text: '리뷰 부탁해요', at: 20 },
      { id: 1, floor: 'A', key: 'me@A', name: '나', text: '안녕', at: 10 },
    ],
  };
  const v = petView(snap, { myId: 'me', pet: { on: true, kind: 'dog', bubbles: false, x: 5, y: 6 }, pokes: 3, current: 'B' });
  // Grouped by floor, in the floors' order: someone on two of my floors sits in both groups.
  assert.deepEqual(v.friends.map((f) => [f.floor, f.who, f.kind, f.guest]),
    [['A', 'guest:ab', kindFor('guest:ab'), true], ['A', 'haru', 'rabbit', false], ['B', 'haru', 'rabbit', false]]);
  assert.equal(v.alerts, undefined, 'no AI alerts');
  assert.deepEqual(v.chat.map((m) => [m.who, m.mine, m.text]), [['me', true, '안녕'], ['haru', false, '리뷰 부탁해요']]);
  assert.equal(v.floor, 'B', 'the pet stands in the room I am in (current)');
  assert.equal(petView(snap, { myId: 'me', pet: {}, pokes: 0 }).floor, 'A', 'without one, the first floor');
  assert.equal(petView(snap, { myId: 'me', pet: {}, pokes: 0, current: 'Z' }).floor, 'Z', 'a room whose hub has not answered yet is still where I stand');
  assert.deepEqual([v.on, v.kind, v.bubbles, v.x, v.y, v.pokes], [true, 'dog', false, 5, 6, 3]);
  assert.ok(PET_KINDS.includes(kindFor('anyone')) && kindFor('anyone') === kindFor('anyone'), 'no pick: the same animal every time');

  const cur = { on: false, kind: 'cat', bubbles: true, x: null, y: null };
  assert.deepEqual(cleanPet({ on: true, kind: 'no-such-animal', bubbles: false, x: 120.6, y: 'x' }, cur), { on: true, kind: 'cat', bubbles: false, x: 121, y: null });
  // The size from the grip: kept within 0.5–1.6, two decimals.
  assert.equal(cleanPet({ scale: 0.734 }, cur).scale, 0.73);
  assert.equal(cleanPet({ scale: 9 }, cur).scale, 1.6);
  assert.equal(cleanPet({ scale: 'big' }, cur).scale, 1);
  // The chat box's own size and see-through level: kept in range, defaults when unset.
  assert.deepEqual([v.chatW, v.chatH, v.chatAlpha], [250, 160, 1]);
  const c = cleanPet({ chatW: 9999, chatH: 10, chatAlpha: 0.62 }, cur);
  assert.deepEqual([c.chatW, c.chatH, c.chatAlpha], [560, 80, 0.6]);
  assert.equal(cleanPet({ chatAlpha: 0 }, cur).chatAlpha, 0.3, 'never fully clear: it could not be found again');
  assert.equal(cleanPet({ chatW: 'wide' }, cur).chatW, 250);
  // The whole window's see-through level, apart from the chat box's own.
  assert.equal(v.petAlpha, 1);
  assert.equal(cleanPet({ petAlpha: 0.48 }, cur).petAlpha, 0.5);
  assert.equal(cleanPet({ petAlpha: 0.1 }, cur).petAlpha, 0.3);
  // The last update notes I put away: a whole number or nothing.
  assert.equal(cleanPet({ newsSeen: 3 }, cur).newsSeen, 3);
  assert.equal(cleanPet({ newsSeen: 'x' }, cur).newsSeen, undefined);

  // Only this PC reads or changes its pet; the team never sees it.
  const json = { 'content-type': 'application/json' };
  assert.equal((await remote('GET', '/api/pet', { headers: cookie })).status, 403);
  const set = await request('POST', '/api/pet', { headers: json, body: JSON.stringify({ kind: 'penguin', bubbles: false }) });
  assert.equal(set.status, 200);
  assert.deepEqual([JSON.parse(set.body).kind, JSON.parse(set.body).bubbles], ['penguin', false]);
  // My animal reaches the floor with me, for the friends' pets on other desktops.
  const me = (await peopleOf()).find((p) => p.userId === 'hubpc');
  assert.equal(me.pet, 'penguin');
});

// The pet window is PowerShell: a typo there shows nothing at all, so build it once
// (parse, XAML, members, the hop out of the taskbar) and stop just before it would start running.
test('pet: the window script parses and builds its window', { skip: process.platform !== 'win32' }, async () => {
  const { PetWindow } = await import('../server/pet.js');
  const s = new PetWindow({ port: 1 }).script()
    .replace("$ErrorActionPreference = 'SilentlyContinue'", "$ErrorActionPreference = 'Stop'")
    .replace('[Windows.Threading.Dispatcher]::Run()', "'built'; exit");
  // Run the way start() does: a short loader that reads the script from a file.
  const file = path.join(os.tmpdir(), `team-pet-test-${process.pid}.ps1`);
  fs.writeFileSync(file, s);
  const loader = `. ([scriptblock]::Create([IO.File]::ReadAllText('${file}', [Text.Encoding]::UTF8)))`;
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(loader, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 60_000 });
  fs.rmSync(file, { force: true });
  assert.match(r.stdout, /built/, (r.stderr || '').replace(/<[^>]+>|_x000D__x000A_/g, ' ').replace(/\s+/g, ' ').slice(0, 600));
});

test('party: 라이어 게임 — the liar alone lacks the word, hints go round twice, the vote and the caught liar\'s guess decide; 바보 라이어 gets another word', async () => {
  const { Parties } = await import('../server/party.js');
  const { LIAR_WORDS } = await import('../server/liar-words.js');
  let now = 0;
  const P = (id) => ({ id, name: id.toUpperCase() });
  const p = new Parties({ now: () => now, rand: () => 0 });
  p.open('F', P('a'), 'liar');
  p.join('F', P('b'));
  assert.throws(() => p.start('F', 'a'), /3명/);
  p.join('F', P('c'));
  p.start('F', 'a');
  const g = p.get('F');
  // The table votes the category first: two for 동물 beat one for 음식.
  assert.equal(g.step, 'topic');
  assert.equal(p.view('F', 'a').word, null, 'no word before the topic is chosen');
  assert.throws(() => p.act('F', 'a', 'topic', '없는거'), /없는 주제/);
  p.act('F', 'a', 'topic', '음식');
  p.act('F', 'b', 'topic', '동물');
  assert.equal(p.view('F', 'b').myTopic, '동물');
  p.act('F', 'c', 'topic', '동물');
  assert.equal(g.step, 'hint');
  assert.equal(g.category, '동물');
  const liar = g.players[g.liar].id;
  const town = g.players.filter((x) => x.id !== liar).map((x) => x.id);
  assert.equal(p.view('F', liar).word, null, 'the liar is not told the word');
  assert.equal(p.view('F', liar).iAmLiar, true);
  assert.equal(p.view('F', town[0]).word, g.word);
  assert.ok(LIAR_WORDS[g.category].includes(g.word));
  assert.equal(p.view('F', 'zed').word, null, 'onlookers see no word');
  // Two rounds of hints; the word itself is not allowed; a missed turn passes on.
  const say = (t) => p.act('F', g.players[g.turn].id, 'say', t);
  if (g.players[g.turn].id !== liar) assert.throws(() => say(`그냥 ${g.word}`), /그대로/);
  say('빨갛다');
  now += 26_000;
  p.get('F');
  assert.equal(g.hints[1].text, null, 'time up: an empty hint');
  for (let i = 0; i < 4; i++) say(`힌트${i}`);
  assert.equal(g.step, 'vote');
  // Everyone but the liar points at the liar: caught, then a wrong guess loses.
  for (const id of town) p.act('F', id, 'vote', liar);
  assert.throws(() => p.act('F', liar, 'vote', liar), /골라/);
  p.act('F', liar, 'vote', town[0]);
  assert.equal(g.step, 'guess');
  assert.equal(p.view('F', liar).myTurn, true);
  p.act('F', liar, 'say', '모르겠다');
  assert.equal(g.phase, 'done');
  assert.equal(g.loser, g.liar);
  assert.equal(p.view('F', town[0]).liar, g.players[g.liar].name);
  now += 50_000;
  // A tie lets the liar go; a caught liar naming the word wins.
  p.open('F', P('a'), 'liar'); p.join('F', P('b')); p.join('F', P('c')); p.start('F', 'a'); now += 16_000; p.get('F');
  const t = p.get('F');
  t.step = 'vote';
  t.players.forEach((x, i) => p.act('F', x.id, 'vote', (i + 1) % 3));
  assert.equal(t.phase, 'done');
  assert.equal(t.winner, t.liar, 'one vote each: the liar gets away');
  now += 50_000;
  p.open('F', P('a'), 'liar'); p.join('F', P('b')); p.join('F', P('c')); p.start('F', 'a'); now += 16_000; p.get('F');
  const c = p.get('F');
  Object.assign(c, { step: 'vote' });
  const cl = c.players[c.liar].id;
  c.players.forEach((x) => { if (x.id !== cl) p.act('F', x.id, 'vote', cl); });
  now += 41_000;
  p.get('F');
  assert.equal(c.step, 'guess', 'the time ends the vote');
  p.act('F', cl, 'say', ` ${c.word} `);
  assert.equal(c.winner, c.liar, 'named the word: the liar wins');
  assert.ok(c.how.includes('역전승'));
  now += 50_000;
  // 🤪 the liar is told another word of the same category and does not know.
  p.open('F', P('a'), 'fool'); p.join('F', P('b')); p.join('F', P('c')); p.start('F', 'a'); now += 16_000; p.get('F');
  const f = p.get('F');
  const fl = f.players[f.liar].id;
  const v = p.view('F', fl);
  assert.equal(v.iAmLiar, false);
  assert.equal(v.word, f.decoy);
  assert.notEqual(f.decoy, f.word);
  assert.ok(LIAR_WORDS[f.category].includes(f.decoy));
  // No word comes back until the list has gone round.
  assert.equal(new Set(p.liarUsed).size, p.liarUsed.length);
});

test('a player stops a started game for the whole table: 같이 하기 with no record, 이어 그리기 with the topic told', async () => {
  const { Parties } = await import('../server/party.js');
  const { Relays } = await import('../server/relay.js');
  const P = (id) => ({ id, name: id.toUpperCase() });
  const ended = [];
  const p = new Parties({ now: () => 0, rand: () => 0, onEnd: (g) => ended.push(g) });
  p.open('F', P('a'), 'stack'); p.join('F', P('b')); p.start('F', 'a');
  const g = p.get('F');
  p.act('F', g.players[0].id, 'drop', 300);
  p.leave('F', 'outsider');
  assert.equal(g.phase, 'play', 'someone not at the table cannot stop it');
  p.leave('F', 'b');
  assert.equal(g.phase, 'done');
  assert.ok(g.how.includes('B 님이 그만했어요'));
  assert.equal(g.record, false);
  assert.equal(p.records.F, undefined, 'a stopped tower sets no record');
  assert.equal(ended.length, 1);
  const r = new Relays({ now: () => 0, rand: () => 0 });
  r.open('F', P('a')); r.join('F', P('b')); r.start('F', 'a');
  r.leave('F', 'b');
  const v = r.view('F', 'a');
  assert.equal(v.phase, 'done');
  assert.equal(v.stoppedBy, 'B');
  assert.ok(v.topic);
});

test('캐치마인드: only the drawer sees the topic, a right guess ends the turn and its guesser draws next, ten topics make a game', async () => {
  const { Relays } = await import('../server/relay.js');
  let now = 0;
  const ended = [];
  const P = (id) => ({ id, name: id.toUpperCase() });
  const r = new Relays({ now: () => now, rand: () => 0, onEnd: (g) => ended.push(g) });
  r.open('F', P('a'), 'catch'); r.join('F', P('b')); r.join('F', P('c'));
  // The host picks the number of topics and the seconds before it starts: 10 and 90 unless picked.
  assert.deepEqual([r.view('F', 'b').rounds, r.view('F', 'b').secs], [10, 90]);
  assert.throws(() => r.setup('F', 'b', { rounds: 5 }), /연 사람이/);
  assert.throws(() => r.setup('F', 'a', { rounds: 7 }), /문제 수/);
  r.setup('F', 'a', { rounds: 5, secs: 120 });
  assert.deepEqual([r.view('F', 'c').rounds, r.view('F', 'c').secs], [5, 120]);
  r.setup('F', 'a', { rounds: 10 });
  r.start('F', 'a');
  assert.throws(() => r.setup('F', 'a', { rounds: 5 }), /설정할/);
  const g = r.get('F');
  // One plain word: no spaces, so no "줄다리기하는 개미".
  assert.ok(!/\s/.test(g.topic));
  const id = (i) => g.players[i].id;
  const drawer = id(g.turn);
  const others = g.players.map((p) => p.id).filter((x) => x !== drawer);
  assert.equal(r.view('F', drawer).topic, g.topic);
  assert.equal(r.view('F', others[0]).topic, undefined, 'the others only see its shape');
  assert.equal(r.view('F', others[0]).mask, g.topic.replace(/\S/g, '○'));
  // The lines are for everyone at once; the drawer may wipe them.
  r.stroke('F', drawer, { w: 5, points: [[1, 2], [3, 4]] });
  assert.equal(r.view('F', others[1]).strokes.length, 1);
  assert.throws(() => r.clear('F', others[0]), /그리는 사람만/);
  r.clear('F', drawer);
  assert.equal(g.strokes.length, 0);
  // Wrong guesses are shown to all; the drawer cannot guess; a right one (spaces aside) ends it.
  assert.throws(() => r.guess('F', drawer, g.topic), /그리는 사람은/);
  r.guess('F', others[0], '모르겠다');
  assert.deepEqual(r.view('F', others[1]).feed.at(-1), { by: g.players.find((p) => p.id === others[0]).name, text: '모르겠다', ok: false });
  const topic = g.topic;
  r.guess('F', others[1], ` ${topic.replace(/\s/g, '')} `);
  assert.equal(g.phase, 'reveal');
  const guesser = g.players.findIndex((p) => p.id === others[1]);
  assert.equal(g.scores[guesser], 1);
  assert.equal(g.scores[g.players.findIndex((p) => p.id === drawer)], 0, 'only the one who named it scores');
  assert.equal(r.view('F', others[0]).last.topic, topic, 'the topic is shown to all between turns');
  now += 5_000;
  r.get('F');
  assert.equal(g.phase, 'draw');
  assert.equal(g.turn, guesser, 'who named it draws next');
  assert.equal(r.view('F', others[1]).myTurn, true);
  // Nobody gets it in time: the next one in order draws.
  now += 119_000; r.get('F');
  assert.equal(g.phase, 'draw', '120 s picked: still drawing at 119 s');
  now += 2_000; r.get('F');
  assert.equal(g.last.by, null);
  now += 5_000; r.get('F');
  assert.equal(g.turn, (guesser + 1) % 3);
  // The drawer's 넘기기 is the same; after ten topics the game is over.
  while (g.phase !== 'done') { if (g.phase === 'draw') r.pass('F', id(g.turn)); now += 5_000; r.get('F'); }
  assert.equal(g.round, 10);
  assert.equal(ended.length, 1);
  assert.deepEqual(g.winners.sort(), [g.players[0].name, g.players[1].name, g.players[2].name].filter((n, i) => g.scores[i] === 1).sort());
  // Stopping mid-game ends it for everyone.
  now += 70_000;
  r.open('F', P('a'), 'catch'); r.join('F', P('b')); r.start('F', 'a');
  r.leave('F', 'b');
  assert.equal(r.view('F', 'a').phase, 'done');
  assert.equal(r.view('F', 'a').stoppedBy, 'B');
});

test('캐치마인드: one or two topics of a game are hard ones, never the first, and everyone is told which', async () => {
  const { Relays } = await import('../server/relay.js');
  const { CATCH_WORDS, CATCH_HARD } = await import('../server/catch-words.js');
  const all = [...CATCH_WORDS, ...CATCH_HARD];
  assert.equal(new Set(all).size, all.length, 'no word twice, in either list');
  assert.ok(all.every((w) => w && !/\s/.test(w)), 'one plain word each');
  const P = (id) => ({ id, name: id.toUpperCase() });
  for (const rounds of [5, 10, 20]) {
    for (let seed = 1; seed <= 30; seed++) {
      let s = seed * 7919, now = 0;
      const r = new Relays({ now: () => now, rand: () => (s = (s * 16807) % 2147483647) / 2147483647 });
      r.open('F', P('a'), 'catch'); r.join('F', P('b'));
      r.setup('F', 'a', { rounds });
      r.start('F', 'a');
      const g = r.get('F'), hard = [], seen = [];
      while (g.phase !== 'done') {
        if (g.phase === 'draw') {
          seen.push(g.topic);
          assert.equal(CATCH_HARD.includes(g.topic), g.hard);
          assert.equal(r.view('F', 'a').hard, g.hard);
          if (g.hard) hard.push(g.round);
          // Named: two points for a hard one, one for the rest.
          const who = (g.turn + 1) % 2, had = g.scores[who], worth = g.hard ? 2 : 1;
          r.guess('F', g.players[who].id, g.topic);
          assert.equal(g.scores[who], had + worth);
          assert.equal(r.view('F', 'a').last.hard, worth === 2);
        }
        now += 5_000; r.get('F');
      }
      assert.ok(hard.length === 1 || hard.length === 2, `${rounds} topics: ${hard.length} hard`);
      assert.ok(!hard.includes(1), 'the first topic is a plain one');
      assert.equal(new Set(seen).size, rounds, 'no topic twice in a game');
    }
  }
});

test('🏆 기록 도전: each person keeps their best per floor, the top three are shown, a new first place is told', async () => {
  const { Records } = await import('../server/records.js');
  let now = 0;
  const r = new Records({ now: () => ++now });
  const P = (id) => ({ id, name: id.toUpperCase() });
  assert.throws(() => r.submit('F', P('a'), 'react', 50), /남길 수 없는/, 'under 100 ms is a guess');
  assert.throws(() => r.submit('F', P('a'), 'nope', 300), /없는 기록/);
  const first = r.submit('F', P('a'), 'react', 300);
  assert.equal(first.rank, 1);
  assert.deepEqual(first.first, { from: null }, 'the very first record is a first place');
  assert.equal(r.submit('F', P('a'), 'react', 350).best, false, 'a worse try keeps the best');
  const took = r.submit('F', P('b'), 'react', 250);
  assert.deepEqual(took.first, { from: { name: 'A', text: '300ms' } });
  r.submit('F', P('c'), 'react', 400);
  r.submit('F', P('d'), 'react', 500);
  const board = r.board('F', 'd');
  assert.deepEqual(board.react.top.map((x) => x.name), ['B', 'A', 'C'], 'three only, best first');
  assert.equal(board.react.mine, 500, 'my best even when off the board');
  assert.equal(r.submit('F', P('c'), 'react', 410).first, null, 'not a first place: nothing to tell');
  assert.equal(r.board('G', 'a').react.top.length, 0, 'each floor its own board');
  r.submit('F', P('a'), 'ten', 120);
  assert.equal(r.board('F', 'a').ten.top[0].text, '0.12초 차이');
  r.submit('F', P('a'), 'order', 12345);
  assert.equal(r.board('F', 'a').order.top[0].text, '12.35초');
});
