import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { call, freePort, runServer, tempDir } from './helpers.js';

// 🚪 One person is in one room: a member's new invite takes the place of the room they were in;
// the hub's owner moves between their own floors by the joined flag.
const dir = tempDir('rooms');

const request = (port, method, p, body) => call(port, method, p, body ? { json: body } : {}).then((r) => ({ status: r.status, body: r.data }));
const start = (args, cfgFile) => runServer(args, { config: cfgFile });
// The member's view comes from the hub's live stream, a moment after a move: the room the pet
// stands in (floor) and every room it knows (floors, its chat tabs).
async function floorsOf(port, want) {
  let got = [];
  for (let i = 0; i < 40; i++) {
    const b = (await request(port, 'GET', '/api/pet')).body;
    got = [b.floor, ...b.floors];
    if (JSON.stringify(got) === JSON.stringify(want)) return got;
    await new Promise((ok) => setTimeout(ok, 250));
  }
  return got;
}

test('한 방: a member\'s new invite replaces their room; the hub owner moves between their floors', async () => {
  const hp = await freePort(), mp = await freePort();
  const hubCfg = path.join(dir, 'hub.json'), memCfg = path.join(dir, 'member.json');
  fs.writeFileSync(hubCfg, JSON.stringify({ port: hp, user: { id: 'hub-pc', name: '방장' }, team: { key: 'hub-admin-key-0123456789', host: '127.0.0.1' }, floors: [{ name: 'A팀', key: 'floor-a-key-01234567890' }, { name: 'B팀', key: 'floor-b-key-01234567890' }] }));
  fs.writeFileSync(memCfg, JSON.stringify({ port: mp, user: { id: 'member-pc', name: '팀원' } }));
  const hub = start(['--hub', '--demo', '--port', String(hp)], hubCfg);
  const member = start(['--push-config', '--demo', '--port', String(mp)], memCfg);
  try {
    await hub.ready; await member.ready;
    const invites = Object.fromEntries((await request(hp, 'GET', '/api/floors')).body.floors.map((f) => [f.name, f.invite.replace(/^http:\/\/[^/]+/, `http://127.0.0.1:${hp}`)]));
    // In through two invites: the second room takes the first one's place.
    const a = await request(mp, 'POST', '/api/links', { code: invites['A팀'], name: '팀원' });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.joined, 'A팀');
    const b = await request(mp, 'POST', '/api/links', { code: invites['B팀'] });
    assert.equal(b.status, 200, JSON.stringify(b.body));
    assert.deepEqual([b.body.joined, b.body.left], ['B팀', 'A팀']);
    assert.deepEqual(b.body.links.map((l) => [l.name, l.current]), [['B팀', true]]);
    assert.deepEqual(await floorsOf(mp, ['B팀', 'B팀']), ['B팀', 'B팀'], 'the pet stands in the one room I am in');
    const pet = (await request(mp, 'GET', '/api/pet')).body;
    assert.deepEqual(pet.rooms.map((r) => [r.name, r.current]), [['B팀', true]]);
    const saved = JSON.parse(fs.readFileSync(memCfg, 'utf8'));
    assert.equal(saved.team.links.length, 1);
    assert.equal(saved.team.current, 0);
    // The same invite again: I am there already.
    assert.equal((await request(mp, 'POST', '/api/links', { code: invites['B팀'] })).status, 409);
    assert.equal((await request(mp, 'POST', '/api/links', { switch: 7 })).status, 404);
    // The hub's owner: standing on the first floor unless they move, every floor a tab.
    assert.deepEqual((await request(hp, 'GET', '/api/pet')).body.floor, 'A팀');
    assert.deepEqual((await request(hp, 'GET', '/api/pet')).body.floors, ['A팀', 'B팀']);
    assert.deepEqual((await request(hp, 'GET', '/api/pet')).body.rooms.map((r) => [r.name, r.current]), [['A팀', true], ['B팀', false]]);
    const put = await request(hp, 'PUT', '/api/floors', { name: 'B팀', joined: true });
    assert.equal(put.status, 200);
    assert.deepEqual(put.body.floors.map((f) => f.joined), [false, true]);
    assert.deepEqual((await request(hp, 'GET', '/api/pet')).body.floor, 'B팀');
    // 💨 날리기: anyone sends anyone on the floor flying, for fun — the member the owner, the owner
    // the member — as a chat effect that says who, whom and how; one a person in ten seconds.
    assert.deepEqual(await floorsOf(mp, ['B팀', 'B팀']), ['B팀', 'B팀']);
    for (let i = 0; i < 40 && !(await request(hp, 'GET', '/api/state')).body.people.some((x) => x.userId === 'member-pc' && x.floor === 'B팀'); i++) await new Promise((ok) => setTimeout(ok, 250));
    const up = await request(mp, 'POST', '/api/fling', { floor: 'B팀', who: 'hub-pc' });
    assert.equal(up.status, 200, JSON.stringify(up.body));
    let heard = (await request(hp, 'GET', '/api/state')).body.chat.at(-1);
    assert.equal(heard.fx, 'fling');
    assert.deepEqual([heard.fling.who, heard.fling.name, heard.fling.by, heard.fling.how], ['hub-pc', '방장', 'member-pc', up.body.how]);
    assert.match(heard.text, up.body.how === 'hammer' ? /뿅망치로 날려 버렸어요/ : /발로 차서 날려 버렸어요/);
    assert.equal((await request(mp, 'POST', '/api/fling', { floor: 'B팀', who: 'hub-pc' })).status, 429, 'one in ten seconds');
    const down = await request(hp, 'POST', '/api/fling', { floor: 'B팀', who: 'member-pc' });
    assert.equal(down.status, 200, JSON.stringify(down.body));
    assert.notEqual(down.body.how, up.body.how, 'turn and turn about');
    heard = (await request(hp, 'GET', '/api/state')).body.chat.at(-1);
    assert.deepEqual([heard.fling.who, heard.fling.by], ['member-pc', 'hub-pc']);
    assert.ok((await request(hp, 'GET', '/api/state')).body.people.some((x) => x.userId === 'member-pc'), 'still on the floor: it was only for fun');
    assert.equal((await request(hp, 'POST', '/api/fling', { floor: 'B팀', who: 'nobody' })).status, 404);
    assert.equal((await request(hp, 'POST', '/api/fling', { floor: 'B팀', who: 'hub-pc' })).status, 404, 'not oneself');
    // The owner deletes the room the member is in: the member's next push is refused, their pet
    // hears the room came down, and they are back at the first run (no room at all).
    assert.equal((await request(hp, 'DELETE', '/api/floors', { name: 'B팀' })).status, 200);
    assert.equal((await request(mp, 'POST', '/api/me', { status: 'focus' })).status, 200, 'a change of mine pushes right away');
    assert.deepEqual(await floorsOf(mp, [null]), [null], 'no room any more');
    const after = (await request(mp, 'GET', '/api/pet')).body;
    assert.deepEqual(after.rooms, []);
    assert.deepEqual(after.lost.map((l) => l.name), ['B팀']);
    assert.equal(after.setup, 'member');
    assert.equal(JSON.parse(fs.readFileSync(memCfg, 'utf8')).team.links.length, 0);
  } finally {
    hub.child.kill(); member.child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('방 참가 + 방 만들기: the hub of my own rooms is a member of another PC\'s room too, standing in one at a time', async () => {
  const hp = await freePort(), hp2 = await freePort();
  const dir2 = tempDir('rooms2');
  const hubCfg = path.join(dir2, 'hub-both.json'), hub2Cfg = path.join(dir2, 'hub-other.json');
  fs.writeFileSync(hubCfg, JSON.stringify({ port: hp, user: { id: 'hub-pc', name: '방장' }, team: { key: 'hub-admin-key-0123456789', host: '127.0.0.1' }, floors: [{ name: 'A팀', key: 'floor-a-key-01234567890' }, { name: 'B팀', key: 'floor-b-key-01234567890' }] }));
  fs.writeFileSync(hub2Cfg, JSON.stringify({ port: hp2, user: { id: 'hub2-pc', name: '옆방장' }, team: { key: 'hub2-admin-key-012345678', host: '127.0.0.1' }, floors: [{ name: '옆팀', key: 'floor-o-key-01234567890' }] }));
  const hub = start(['--push-config', '--demo', '--port', String(hp)], hubCfg);
  const other = start(['--push-config', '--demo', '--port', String(hp2)], hub2Cfg);
  const until = async (ok) => { for (let i = 0; i < 60 && !(await ok()); i++) await new Promise((r) => setTimeout(r, 250)); return ok(); };
  const onOther = async () => (await request(hp2, 'GET', '/api/state')).body.people.some((p) => p.userId === 'hub-pc' && p.floor === '옆팀');
  try {
    await hub.ready; await other.ready;
    const invite = (await request(hp2, 'GET', '/api/floors')).body.floors[0].invite.replace(/^http:\/\/[^/]+/, `http://127.0.0.1:${hp2}`);
    // In through the other PC's invite: their room joins my list beside my own, and I stand there.
    const j = await request(hp, 'POST', '/api/links', { code: invite });
    assert.equal(j.status, 200, JSON.stringify(j.body));
    assert.equal(j.body.joined, '옆팀');
    let pet = (await request(hp, 'GET', '/api/pet')).body;
    assert.deepEqual(pet.rooms.map((r) => [r.name, !!r.own, r.current]), [['A팀', true, false], ['B팀', true, false], ['옆팀', false, true]]);
    assert.equal(pet.floor, '옆팀');
    assert.deepEqual(await floorsOf(hp, ['옆팀', 'A팀', 'B팀', '옆팀']), ['옆팀', 'A팀', 'B팀', '옆팀'], 'my own floors and theirs are all tabs');
    assert.ok(await until(onOther), 'their hub shows me on their floor');
    assert.ok(!(await request(hp, 'GET', '/api/state')).body.people.some((p) => p.userId === 'hub-pc'), 'and none of my own floors has me');
    // What I say goes to the room it is for: theirs through their hub, mine straight in.
    assert.equal((await request(hp, 'POST', '/api/chat', { floor: '옆팀', text: '옆방 안녕' })).status, 200);
    assert.ok(await until(async () => (await request(hp2, 'GET', '/api/state')).body.chat.some((m) => m.text === '옆방 안녕' && m.key === 'hub-pc@옆팀')));
    assert.equal((await request(hp, 'POST', '/api/chat', { floor: 'A팀', text: '우리 방 안녕' })).status, 200);
    assert.ok((await request(hp, 'GET', '/api/state')).body.chat.some((m) => m.text === '우리 방 안녕' && m.floor === 'A팀'));
    assert.equal((await request(hp, 'POST', '/api/chat', { floor: '없는방', text: 'x' })).status, 404);
    // My own invite only moves me onto that floor; never a link to myself.
    const own = (await request(hp, 'GET', '/api/floors')).body.floors.find((f) => f.name === 'B팀').invite.replace(/^http:\/\/[^/]+/, `http://127.0.0.1:${hp}`);
    const back = await request(hp, 'POST', '/api/links', { code: own });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(back.body.joined, 'B팀');
    pet = (await request(hp, 'GET', '/api/pet')).body;
    assert.deepEqual(pet.rooms.map((r) => [r.name, r.current]), [['A팀', false], ['B팀', true], ['옆팀', false]]);
    assert.ok(await until(async () => !(await onOther())), 'their hub drops me as I step onto my own floor');
    assert.equal((await request(hp, 'POST', '/api/links', { code: own })).status, 409, 'already there');
    // Onto their floor by its number, onto mine by its joined flag; the choice is saved with the admin key kept.
    assert.equal((await request(hp, 'POST', '/api/links', { switch: 0 })).body.moved, '옆팀');
    assert.equal((await request(hp, 'GET', '/api/pet')).body.floor, '옆팀');
    let saved = JSON.parse(fs.readFileSync(hubCfg, 'utf8'));
    assert.equal(saved.team.current, 0); assert.equal(saved.team.key, 'hub-admin-key-0123456789');
    assert.ok(saved.floors.every((f) => f.joined === false));
    assert.equal((await request(hp, 'PUT', '/api/floors', { name: 'A팀', joined: true })).status, 200);
    assert.equal((await request(hp, 'GET', '/api/pet')).body.floor, 'A팀');
    saved = JSON.parse(fs.readFileSync(hubCfg, 'utf8'));
    assert.equal(saved.team.current, null);
    assert.deepEqual(saved.floors.map((f) => f.joined), [true, false]);
    // Out of their room: only my own stay, and I keep standing where I was.
    const left = await request(hp, 'POST', '/api/links', { leave: 0 });
    assert.equal(left.status, 200);
    assert.deepEqual((await request(hp, 'GET', '/api/pet')).body.rooms.map((r) => [r.name, r.current]), [['A팀', true], ['B팀', false]]);
  } finally {
    hub.child.kill(); other.child.kill();
    fs.rmSync(dir2, { recursive: true, force: true });
  }
});

test('🏷 방 이름 바꾸기: the talk and the people follow the new name; a member\'s pet hears it without a restart', async () => {
  const hp = await freePort(), mp = await freePort();
  const dir3 = tempDir('rooms3');
  const hubCfg = path.join(dir3, 'hub.json'), memCfg = path.join(dir3, 'member.json');
  fs.writeFileSync(hubCfg, JSON.stringify({ port: hp, user: { id: 'hub-pc', name: '방장' }, team: { key: 'hub-admin-key-0123456789', host: '127.0.0.1' }, floors: [{ name: 'A팀', key: 'floor-a-key-01234567890' }, { name: 'B팀', key: 'floor-b-key-01234567890' }] }));
  fs.writeFileSync(memCfg, JSON.stringify({ port: mp, user: { id: 'member-pc', name: '팀원' } }));
  const hub = start(['--push-config', '--demo', '--port', String(hp)], hubCfg);
  const member = start(['--push-config', '--demo', '--port', String(mp)], memCfg);
  const until = async (ok) => { for (let i = 0; i < 60 && !(await ok()); i++) await new Promise((r) => setTimeout(r, 250)); return ok(); };
  try {
    await hub.ready; await member.ready;
    const invite = (await request(hp, 'GET', '/api/floors')).body.floors[0].invite.replace(/^http:\/\/[^/]+/, `http://127.0.0.1:${hp}`);
    assert.equal((await request(mp, 'POST', '/api/links', { code: invite, name: '팀원' })).status, 200);
    assert.ok(await until(async () => (await request(hp, 'GET', '/api/state')).body.people.some((p) => p.userId === 'member-pc' && p.floor === 'A팀')));
    assert.equal((await request(mp, 'POST', '/api/chat', { floor: 'A팀', text: '이름 바꾸기 전' })).status, 200);
    // Bad names, a taken one, then the real thing.
    assert.equal((await request(hp, 'PUT', '/api/floors', { name: 'A팀', rename: 'a#b' })).status, 400);
    assert.equal((await request(hp, 'PUT', '/api/floors', { name: 'A팀', rename: 'B팀' })).status, 409);
    const r = await request(hp, 'PUT', '/api/floors', { name: 'A팀', rename: '알파팀' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.floors.map((f) => f.name), ['알파팀', 'B팀']);
    assert.equal(JSON.parse(fs.readFileSync(hubCfg, 'utf8')).floors[0].name, '알파팀');
    const st = (await request(hp, 'GET', '/api/state')).body;
    assert.ok(st.people.some((p) => p.userId === 'member-pc' && p.floor === '알파팀' && p.key === 'member-pc@알파팀'), 'the people followed');
    assert.ok(st.chat.some((m) => m.text === '이름 바꾸기 전' && m.floor === '알파팀'), 'the talk followed');
    assert.ok(!st.people.some((p) => p.floor === 'A팀') && !st.chat.some((m) => m.floor === 'A팀'));
    // The member's pet stands in the renamed room, its link named after it, and talks there.
    assert.deepEqual(await floorsOf(mp, ['알파팀', '알파팀']), ['알파팀', '알파팀']);
    assert.ok(await until(async () => (await request(mp, 'GET', '/api/pet')).body.rooms[0]?.name === '알파팀'));
    assert.equal(JSON.parse(fs.readFileSync(memCfg, 'utf8')).team.links[0].name, '알파팀');
    assert.equal((await request(mp, 'POST', '/api/chat', { floor: '알파팀', text: '이름 바꾼 뒤' })).status, 200);
    assert.ok(await until(async () => (await request(hp, 'GET', '/api/state')).body.chat.some((m) => m.text === '이름 바꾼 뒤' && m.floor === '알파팀')));
  } finally {
    hub.child.kill(); member.child.kill();
    fs.rmSync(dir3, { recursive: true, force: true });
  }
});
