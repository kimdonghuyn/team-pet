// 🆕 Updates from the project's releases, for everyone — the room's hub too, so nobody has to
// install a new version by hand. Now and then the newest release's update.json is read; a newer
// build is downloaded, checked against its hash and unpacked beside the program, and the pet
// offers it ("새 버전이 나왔어요 [지금 업데이트]"). Pressing it copies the new files over the
// program's own (settings live elsewhere, in ~/.team-pet) and the program starts again.
// The Mac app is one signed bundle that cannot change file by file: it is only told, and its pet
// links to the download page.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { POWERSHELL } from './powershell.js';
import { PARTS, localVersion } from './update.js';

export const RELEASE_URL = 'https://github.com/kimdonghuyn/team-pet/releases/latest/download';
export const RELEASE_PAGE = 'https://github.com/kimdonghuyn/team-pet/releases/latest';
const FIRST_MS = 60_000; // a minute after starting: not in the way of the start itself
const EVERY_MS = 6 * 60 * 60_000;
const ZIP_LIMIT = 80 * 1024 * 1024;

// '0.10.1' > '0.9.3'; parts compared as numbers, a missing part is 0.
export function newerVersion(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

// What a release says about itself (scripts/pack.js writes it): only well-formed answers count.
export function readInfo(info) {
  if (!info || typeof info !== 'object') return null;
  const build = Number(info.build), version = String(info.version || '');
  if (!Number.isFinite(build) || build <= 0 || !/^\d+(\.\d+){0,3}$/.test(version)) return null;
  const zip = String(info.zip || ''), sha256 = String(info.sha256 || '').toLowerCase();
  return { build, version, zip: /^[\w.-]+\.zip$/.test(zip) ? zip : '', sha256: /^[0-9a-f]{64}$/.test(sha256) ? sha256 : '' };
}

// The zip's files into dir, by the Expand-Archive that every Windows has.
function unzipWindows(zipFile, dir) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  return new Promise((resolve, reject) => {
    execFile(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${q(zipFile)} -DestinationPath ${q(dir)} -Force`],
      { windowsHide: true, timeout: 120_000 }, (err) => (err ? reject(err) : resolve()));
  });
}

// root: the program folder. mac: the Mac app (told only). appVersion: this program's version
// (package.json). onReady(offer): a newer release is ready — { version, build, dir } on Windows,
// { version, mac: true, page } on the Mac.
export function releaseUpdater({ root, appVersion, mac = false, url = RELEASE_URL, log = () => {}, onReady = () => {}, firstMs = FIRST_MS, everyMs = EVERY_MS, unzip = unzipWindows }) {
  let ready = null;
  let busy = false;
  const base = url.replace(/\/+$/, '');

  async function check() {
    if (busy) return ready;
    busy = true;
    try {
      const res = await fetch(`${base}/update.json`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) { log(`release update: no update.json (${res.status})`); return ready; }
      const info = readInfo(await res.json().catch(() => null));
      if (!info) { log('release update: update.json is not one I understand'); return ready; }
      if (mac) {
        if (newerVersion(info.version, appVersion) && ready?.version !== info.version) {
          ready = { version: info.version, mac: true, page: RELEASE_PAGE };
          onReady(ready);
        }
        return ready;
      }
      if (!(info.build > localVersion(root)) || ready?.build === info.build) return ready;
      if (!info.zip || !info.sha256) { log('release update: update.json names no zip'); return ready; }
      const got = await fetch(`${base}/${info.zip}`, { signal: AbortSignal.timeout(5 * 60_000) });
      if (!got.ok) { log(`release update: could not download ${info.zip} (${got.status})`); return ready; }
      const buf = Buffer.from(await got.arrayBuffer());
      if (buf.length > ZIP_LIMIT) { log('release update: the zip is too big'); return ready; }
      if (crypto.createHash('sha256').update(buf).digest('hex') !== info.sha256) { log('release update: the zip arrived damaged'); return ready; }
      const dir = path.join(os.tmpdir(), `team-pet-update-${info.build}`);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const zipFile = path.join(dir, '..', `team-pet-update-${info.build}.zip`);
      fs.writeFileSync(zipFile, buf);
      try { await unzip(zipFile, dir); } finally { fs.rmSync(zipFile, { force: true }); }
      // Only a whole program of the promised build is offered.
      if (!fs.existsSync(path.join(dir, 'server', 'index.js')) || localVersion(dir) !== info.build) {
        log('release update: the zip does not hold the program it promised');
        fs.rmSync(dir, { recursive: true, force: true });
        return ready;
      }
      ready = { version: info.version, build: info.build, dir };
      log(`release update: ${info.version} (${info.build}) is ready`);
      onReady(ready);
      return ready;
    } catch (e) {
      log(`release update: skipped (${e.cause?.code || e.name || e.message})`);
      return ready;
    } finally {
      busy = false;
    }
  }

  // Copies the unpacked release over the program's own files. The program keeps running on what
  // it already loaded until it is started again (the caller does that next).
  function apply() {
    if (!ready || ready.mac || !fs.existsSync(ready.dir)) return false;
    for (const part of PARTS) {
      const from = path.join(ready.dir, part);
      if (fs.existsSync(from)) fs.cpSync(from, path.join(root, part), { recursive: true, force: true });
    }
    log(`release update: now ${ready.version} (${ready.build})`);
    return true;
  }

  const first = setTimeout(check, firstMs);
  const every = setInterval(check, everyMs);
  first.unref?.(); every.unref?.();
  return { check, apply, get ready() { return ready; }, stop: () => { clearTimeout(first); clearInterval(every); } };
}
