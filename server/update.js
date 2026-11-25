import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Self-update for members. The hub's own install is the program everyone runs:
// it lists its files (with a hash each) and the build version that pack.js
// stamped into version.json. A member's collector asks now and then; when the
// hub's build is newer, it fetches the files that differ, writes them over its
// own, and starts again. Settings live elsewhere (~/.team-pet) and are never
// part of it. A member newer than the hub is left alone.

// What makes up the program: these folders and files under the install root.
export const PARTS = ['client', 'server', 'scripts', 'sprites', 'package.json', 'version.json', '사용-설명서.md'];
const CHECK_EVERY_MS = 30 * 60_000;

export function localVersion(root) {
  try { return Number(JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')).version) || 0; } catch { return 0; }
}

function walk(root, rel, out) {
  const full = path.join(root, rel);
  let st;
  try { st = fs.statSync(full); } catch { return; }
  if (st.isDirectory()) for (const name of fs.readdirSync(full)) walk(root, path.posix.join(rel, name), out);
  else out.push(rel);
}

const hashOf = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// { version, files: { "client/main.js": sha256, ... } } — paths with forward slashes.
export function manifest(root) {
  const list = [];
  for (const p of PARTS) walk(root, p, list);
  return { version: localVersion(root), files: Object.fromEntries(list.map((rel) => [rel, hashOf(path.join(root, rel))])) };
}

// A path inside the program: one of its parts, nothing above or outside it.
const programPath = (rel) => typeof rel === 'string' && !!rel && !rel.includes('..') && !path.isAbsolute(rel) && !rel.includes('\\') && !rel.includes(':')
  && PARTS.some((p) => rel === p || rel.startsWith(p + '/'));

// A file the hub may hand out: one of the program's own, never a path outside it.
export function programFile(root, rel) {
  if (!programPath(rel)) return null;
  const full = path.join(root, rel);
  return full.startsWith(root + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile() ? full : null;
}

// Collector side: compare with the hub, fetch what differs, then start again.
export async function updateFrom({ url, key, root, log = console.log, onUpdated = () => {} }) {
  const base = url.endsWith('/') ? url : url + '/';
  const headers = { 'x-team-key': key };
  const res = await fetch(new URL('api/update', base), { headers });
  if (!res.ok) return { updated: false, why: `hub answered ${res.status}` };
  const theirs = await res.json();
  const mine = localVersion(root);
  if (!(theirs.version > mine)) return { updated: false, why: 'up to date' };
  const ours = manifest(root).files;
  const changed = Object.entries(theirs.files || {}).filter(([rel, sha]) => ours[rel] !== sha);
  // Fetch everything first; write only when all of it arrived, so a broken
  // download never leaves half a program behind.
  const got = [];
  for (const [rel, sha] of changed) {
    if (!programPath(rel)) continue;
    const r = await fetch(new URL(`api/update/file?path=${encodeURIComponent(rel)}`, base), { headers });
    if (!r.ok) return { updated: false, why: `could not fetch ${rel} (${r.status})` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (crypto.createHash('sha256').update(buf).digest('hex') !== sha) return { updated: false, why: `${rel} arrived damaged` };
    got.push([rel, buf]);
  }
  for (const [rel, buf] of got) {
    const full = path.join(root, rel);
    if (!full.startsWith(root + path.sep)) continue;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buf);
  }
  log(`update: ${mine} -> ${theirs.version}, ${got.length} file(s)`);
  onUpdated(theirs.version, got.length);
  return { updated: true, files: got.length, version: theirs.version };
}

// Starts this collector again on the new files: a detached helper waits for
// this process to end, then launches it the usual way (no window).
export function relaunch(root, role = 'collector') {
  const helper = spawn(process.execPath, [path.join(root, 'scripts', 'launch.js'), 'after-exit', role, String(process.pid)], {
    cwd: root, detached: true, windowsHide: true, stdio: 'ignore', env: process.env,
  });
  helper.unref();
  setTimeout(() => process.exit(0), 300);
}

// soon(version): the hub mentioned its build in a push answer; a newer one is fetched now
// instead of at the next half-hour check (at most once a minute, one at a time).
export function startUpdater({ url, key, root, log, notify }) {
  let busy = false;
  let lastTry = 0;
  const check = async () => {
    if (busy) return;
    busy = true;
    lastTry = Date.now();
    try {
      const r = await updateFrom({ url, key, root, log });
      if (r.updated) {
        notify?.('팀 펫을 새 버전으로 업데이트했습니다', '잠시 뒤 다시 켜집니다');
        relaunch(root);
      }
    } catch (e) {
      log(`update: skipped (${e.cause?.code || e.message})`);
    } finally {
      busy = false;
    }
  };
  const first = setTimeout(check, 20_000);
  const every = setInterval(check, CHECK_EVERY_MS);
  every.unref?.();
  return {
    stop: () => { clearTimeout(first); clearInterval(every); },
    soon: (version) => { if (version > localVersion(root) && Date.now() - lastTry > 60_000) check(); },
  };
}
