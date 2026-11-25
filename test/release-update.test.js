import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { newerVersion, readInfo, releaseUpdater } from '../server/release-update.js';

// A release on this PC: update.json and a "zip" (any bytes; the test's unzip writes the files).
function fakeRelease(files) {
  const server = http.createServer((req, res) => {
    const body = files[path.basename(req.url)];
    if (body === undefined) { res.writeHead(404); return res.end(); }
    res.writeHead(200); res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}
const tmp = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `team-pet-rel-${tag}-`));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const quiet = { firstMs: 1e9, everyMs: 1e9 };

describe('release update', () => {
  const cleanup = [];
  after(() => { for (const f of cleanup) f(); });

  it('compares versions part by part', () => {
    assert.equal(newerVersion('0.10.0', '0.9.9'), true);
    assert.equal(newerVersion('0.5.4', '0.5.4'), false);
    assert.equal(newerVersion('1.0', '0.99.99'), true);
    assert.equal(newerVersion('0.5', '0.5.1'), false);
  });

  it('only understands a well-formed update.json', () => {
    assert.equal(readInfo(null), null);
    assert.equal(readInfo({ build: 'x', version: '1.0.0' }), null);
    assert.equal(readInfo({ build: 5, version: 'latest' }), null);
    assert.deepEqual(readInfo({ build: 5, version: '0.6.0', zip: '../evil.zip', sha256: 'nope' }), { build: 5, version: '0.6.0', zip: '', sha256: '' });
  });

  it('offers a newer build, puts its files in, and never offers an older one', async () => {
    const zipBytes = 'pretend zip';
    const rel = await fakeRelease({ 'update.json': { build: 200, version: '0.6.0', zip: 'u.zip', sha256: sha(zipBytes) }, 'u.zip': zipBytes });
    cleanup.push(rel.close);
    const root = tmp('root');
    fs.mkdirSync(path.join(root, 'server'), { recursive: true });
    fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ version: 100 }));
    fs.writeFileSync(path.join(root, 'server', 'index.js'), '// old');
    let offered = null;
    const unzip = async (_zip, dir) => {
      fs.mkdirSync(path.join(dir, 'server'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'server', 'index.js'), '// new');
      fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ version: 200 }));
    };
    const up = releaseUpdater({ root, appVersion: '0.5.0', url: rel.url, unzip, onReady: (o) => { offered = o; }, ...quiet });
    cleanup.push(up.stop);
    await up.check();
    assert.equal(offered?.version, '0.6.0');
    assert.equal(offered?.build, 200);
    assert.equal(up.apply(), true);
    assert.equal(fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8'), '// new');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')).version, 200);
    // Now as new as the release: nothing more to offer.
    offered = null;
    const again = releaseUpdater({ root, appVersion: '0.6.0', url: rel.url, unzip, onReady: (o) => { offered = o; }, ...quiet });
    cleanup.push(again.stop);
    await again.check();
    assert.equal(offered, null);
  });

  it('turns down a zip that does not match its hash', async () => {
    const rel = await fakeRelease({ 'update.json': { build: 300, version: '0.7.0', zip: 'u.zip', sha256: sha('the real one') }, 'u.zip': 'something else' });
    cleanup.push(rel.close);
    const root = tmp('bad');
    fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ version: 100 }));
    let unzipped = false;
    const up = releaseUpdater({ root, appVersion: '0.5.0', url: rel.url, unzip: async () => { unzipped = true; }, ...quiet });
    cleanup.push(up.stop);
    assert.equal(await up.check(), null);
    assert.equal(unzipped, false);
    assert.equal(up.apply(), false);
  });

  it('only tells the Mac app, by its version, with the download page', async () => {
    const rel = await fakeRelease({ 'update.json': { build: 400, version: '0.8.0' } });
    cleanup.push(rel.close);
    const up = releaseUpdater({ root: tmp('mac'), appVersion: '0.5.4', mac: true, url: rel.url, ...quiet });
    cleanup.push(up.stop);
    const offer = await up.check();
    assert.equal(offer.mac, true);
    assert.equal(offer.version, '0.8.0');
    assert.match(offer.page, /releases\/latest$/);
    assert.equal(up.apply(), false, 'the Mac app is never changed file by file');
  });
});
