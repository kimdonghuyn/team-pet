import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { call, freePort, runServer, tempDir } from './helpers.js';
import { fromOwnPage, hostIsSelf, readJsonBody, sentJson, typeOf } from '../server/http-util.js';
import { loadConfig, saveConfig } from '../server/config.js';
import { Me } from '../server/me.js';
import { Readable } from 'node:stream';

// The pieces first, then a real server (demo mode, its own settings file) poked over HTTP the way
// another web page in this PC's browser might.
describe('http-util', () => {
  const req = (headers) => ({ headers });
  it('knows this machine by its Host, whatever the port, and nothing else', () => {
    for (const host of ['localhost', 'localhost:4322', '127.0.0.1:9', '[::1]:4322', 'LOCALHOST']) assert.equal(hostIsSelf(req({ host })), true, host);
    for (const host of ['attacker.example', 'attacker.example:4322', '192.168.1.40:4322', 'localhost.evil:80', '']) assert.equal(hostIsSelf(req({ host })), false, host);
  });
  it('takes a change from its own page or from no page, not from another site', () => {
    assert.equal(fromOwnPage(req({ host: 'localhost:4322' })), true);
    assert.equal(fromOwnPage(req({ host: 'localhost:4322', origin: 'http://localhost:4322' })), true);
    assert.equal(fromOwnPage(req({ host: 'localhost:4322', origin: 'https://evil.example' })), false);
    assert.equal(sentJson(req({ 'content-type': 'application/json; charset=utf-8' })), true);
    assert.equal(sentJson(req({ 'content-type': 'text/plain' })), false);
  });
  it('reads a JSON body, and refuses one too big or broken', async () => {
    const body = (text) => Object.assign(Readable.from([Buffer.from(text)]), { headers: {} });
    assert.deepEqual(await readJsonBody(body('{"a":1}')), { a: 1 });
    await assert.rejects(readJsonBody(body('{nope')), (e) => e.status === 400);
    await assert.rejects(readJsonBody(body('x'.repeat(50)), 10), (e) => e.status === 413);
  });
  it('names the types the page uses', () => {
    assert.match(typeOf('pet.js'), /javascript/);
    assert.equal(typeOf('a/b.PNG'), 'image/png');
    assert.equal(typeOf('x.unknown'), 'application/octet-stream');
  });
});

describe('settings and my person', () => {
  it('fills an old or broken settings file from the defaults and saves it whole', () => {
    const dir = tempDir('cfg');
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, '{ not json');
    assert.equal(loadConfig(file).port, 4322, 'a broken file is an empty one');
    fs.writeFileSync(file, JSON.stringify({ pet: { kind: 'otter' }, floors: [{ name: 'A' }] }));
    const cfg = loadConfig(file);
    assert.equal(cfg.pet.kind, 'otter');
    assert.equal(cfg.pet.bubbles, true, 'a key the file lacks comes from the defaults');
    assert.deepEqual(cfg.floors, [{ name: 'A' }]);
    cfg.user.name = '테스트';
    saveConfig(file, cfg);
    assert.equal(loadConfig(file).user.name, '테스트');
    assert.deepEqual(fs.readdirSync(dir), ['config.json'], 'no half-written file left beside it');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('says when my name changes, and carries no work', () => {
    const me = new Me({ id: 'pc1', name: 'A' });
    let told = 0;
    me.on('change', () => { told++; });
    me.rename('A');
    me.rename('B');
    assert.equal(told, 1, 'only a real change');
    assert.deepEqual({ ...me.snapshot(), now: 0 }, { user: { id: 'pc1', name: 'B' }, now: 0, agents: [] });
  });
});

describe('the server on this PC', () => {
  let port, dir, cfgFile, srv;
  const savedName = () => (fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')).user?.name : null);
  before(async () => {
    port = await freePort();
    dir = tempDir('server');
    cfgFile = path.join(dir, 'config.json');
    srv = runServer(['--demo', '--port', String(port)], { config: cfgFile });
    await srv.ready;
  });
  after(() => { srv.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('serves the page and the state to this PC', async () => {
    assert.equal((await call(port, 'GET', '/')).status, 200);
    assert.equal((await call(port, 'GET', '/api/state')).status, 200);
    assert.equal((await call(port, 'GET', '/api/state', { host: `127.0.0.1:${port}` })).status, 200);
  });
  it('turns away a page that only points its own name at this PC (DNS rebinding)', async () => {
    const r = await call(port, 'GET', '/api/state', { host: `attacker.example:${port}` });
    assert.equal(r.status, 403);
    assert.doesNotMatch(r.body, /"user"/);
    assert.equal((await call(port, 'GET', '/api/events', { host: 'attacker.example' })).status, 403);
  });
  it('does not let another site change the settings', async () => {
    const before = savedName();
    const evil = await call(port, 'POST', '/api/config', { headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ user: { name: 'pwned' } }) });
    assert.equal(evil.status, 403);
    // A form on another site can only send the "simple" types.
    const form = await call(port, 'POST', '/api/config', { headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ user: { name: 'pwned' } }) });
    assert.equal(form.status, 415);
    assert.equal(savedName(), before);
  });
  it('lets its own page change the name', async () => {
    const r = await call(port, 'POST', '/api/config', { json: { user: { name: 'Tester' } } });
    assert.equal(r.status, 200);
    assert.equal(r.data.config.user.name, 'Tester');
    assert.equal(savedName(), 'Tester');
  });
  it('answers a bad path and a path out of the page with an error, and keeps running', async () => {
    assert.equal((await call(port, 'GET', '/%E0%A4%A')).status, 400);
    assert.equal((await call(port, 'GET', '/..%2f..%2fpackage.json')).status, 403);
    assert.equal((await call(port, 'GET', '/no-such-file.js')).status, 404);
    assert.equal(srv.child.exitCode, null);
    assert.equal((await call(port, 'GET', '/api/state')).status, 200);
  });
});
