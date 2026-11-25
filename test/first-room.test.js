import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { call, freePort, runServer, tempDir } from './helpers.js';

// A PC that is nobody's member yet makes this team's first room from its pet: the room goes into
// the settings, the server ends, and the same command line (--push-config) brings it back as the hub.
const port = await freePort();
const dir = tempDir('first-room');
const cfgFile = path.join(dir, 'config.json');

const request = (method, p, opts = {}) => call(port, method, p, opts);
const page = (body) => ({ headers: { origin: `http://localhost:${port}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

// The member command line, with a port of its own; env goes along for TEAM_PET_FIRST_ROOM.
function start(env = {}) {
  const run = runServer(['--push-config', '--port', String(port)], { config: cfgFile, env });
  const exit = new Promise((resolve) => run.child.on('exit', resolve));
  return { ...run, exit };
}

test('first room: made from a member PC, saved, and the same command line comes back as the hub', async () => {
  fs.writeFileSync(cfgFile, JSON.stringify({ port }) + '\n');
  const member = start();
  await member.ready;
  try {
    const pet = JSON.parse((await request('GET', '/api/pet')).body);
    assert.equal(pet.hub, false);
    assert.equal(pet.setup, 'member', 'a fresh PC gets the first-run box');

    const bad = await request('POST', '/api/floors', page({ name: '개발팀?' }));
    assert.equal(bad.status, 400);
    const evil = await request('POST', '/api/floors', { headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'pwned' }) });
    assert.equal(evil.status, 403);

    const r = await request('POST', '/api/floors', page({ name: '개발팀' }));
    assert.equal(r.status, 201, r.body);
    assert.deepEqual(JSON.parse(r.body), { name: '개발팀', restarting: true });
    const saved = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    assert.equal(saved.floors.length, 1);
    assert.equal(saved.floors[0].name, '개발팀');
    assert.ok(saved.floors[0].key && saved.floors[0].code, 'the room has its key and join code');
    assert.ok(saved.team.key, 'the hub has its admin key');
    // Run by hand (no launcher's pid file, not the Mac app): it ends, for whoever started it to start again.
    assert.equal(await Promise.race([member.exit, new Promise((ok) => setTimeout(() => ok('still running'), 5000))]), 0, member.log());
  } finally {
    member.child.kill();
  }

  // Started again the way the launcher and the Mac app do (--push-config): now the hub, and for its
  // first half minute it tells the pet to show the rooms, when TEAM_PET_FIRST_ROOM came along.
  const hub = start({ TEAM_PET_FIRST_ROOM: '1' });
  try {
    await hub.ready;
    const pet = JSON.parse((await request('GET', '/api/pet')).body);
    assert.equal(pet.hub, true);
    assert.match(hub.log(), /1 floor\(s\) open to the office network/);
    assert.equal(pet.setup, 'codes');
    const floors = JSON.parse((await request('GET', '/api/floors')).body);
    assert.equal(floors.floors[0].name, '개발팀');
    assert.match(floors.floors[0].invite, /^http:\/\/.+\/\?code=/);
    const again = await request('POST', '/api/floors', page({ name: '개발팀' }));
    assert.equal(again.status, 409, 'the hub keeps its own room rules');
  } finally {
    hub.child.kill();
    await hub.exit;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
