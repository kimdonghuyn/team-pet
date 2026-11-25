#!/usr/bin/env node
// Runs the office in the background, with no window to keep open:
//   node scripts/launch.js start hub|collector [--open]   start (once) and report how it went
//   node scripts/launch.js restart hub|collector [--open] stop if running, then start
//   node scripts/launch.js stop  hub|collector            stop it
//   node scripts/launch.js status hub|collector
//   node scripts/launch.js open  hub|collector            the settings page, starting it first if it is off
//   node scripts/launch.js pet   hub|collector            the pet, starting it first if it is off
// What the window used to show goes to <config dir>/<role>.log, and the process
// id to <role>.pid next to it, so a rehearsal config (TEAM_PET_CONFIG) keeps
// its own pair and never stops the real one.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPath, loadConfig } from '../server/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROLES = {
  hub: { args: ['--hub'], what: '팀 펫 허브' },
  collector: { args: ['--push-config'], what: '팀 펫' },
};

const files = (role) => {
  const dir = path.dirname(configPath());
  return { dir, pid: path.join(dir, `${role}.pid`), log: path.join(dir, `${role}.log`) };
};

export function runningPid(role) {
  let pid;
  try { pid = Number(fs.readFileSync(files(role).pid, 'utf8')); } catch { return null; }
  if (!pid) return null;
  try { process.kill(pid, 0); return pid; } catch { return null; }
}

export function start(role, { open = false } = {}) {
  const r = ROLES[role];
  const f = files(role);
  const pid = runningPid(role);
  if (pid) return { ok: true, already: true, pid, log: f.log };
  fs.mkdirSync(f.dir, { recursive: true });
  // Keep the last run's log only: it is for "what happened just now".
  const out = fs.openSync(f.log, 'w');
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), ...r.args, ...(open ? ['--open'] : [])], {
    cwd: ROOT, detached: true, windowsHide: true, stdio: ['ignore', out, out],
  });
  child.unref();
  fs.writeFileSync(f.pid, String(child.pid));
  return { ok: true, pid: child.pid, log: f.log };
}

export function stop(role) {
  const f = files(role);
  const pid = runningPid(role);
  try { fs.unlinkSync(f.pid); } catch {}
  if (!pid) return { ok: true, message: '이미 꺼져 있습니다' };
  try { process.kill(pid); } catch {}
  return { ok: true, message: '껐습니다' };
}

// After a start, look at the office for a few seconds and say how it went in
// words, since there is no window to read anymore.
async function report(role, port) {
  const f = files(role);
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (!runningPid(role)) break;
    const log = fs.existsSync(f.log) ? fs.readFileSync(f.log, 'utf8') : '';
    if (role === 'hub' && log.includes('is open at')) return `켜졌습니다 — 관리자 화면 http://localhost:${port}`;
    if (role === 'collector') {
      const lines = log.split('\n').filter((l) => l.startsWith('push to '));
      if (lines.some((l) => l.includes(': connected'))) return `켜졌고 허브에 연결됐습니다 — 설정 화면 http://localhost:${port}`;
      const bad = lines.find((l) => l.includes('not delivered'));
      if (bad && i >= 8) return `켜졌지만 아직 연결되지 않았습니다: ${bad}\n  (허브가 꺼져 있으면 켜질 때 저절로 붙습니다. 자세한 기록: ${f.log})`;
    }
  }
  if (!runningPid(role)) {
    const log = fs.existsSync(f.log) ? fs.readFileSync(f.log, 'utf8').trim().split('\n').slice(-5).join('\n  ') : '';
    return `켜지지 않았습니다. 마지막 기록:\n  ${log || '(없음)'}`;
  }
  return `켜졌습니다 — 기록: ${f.log}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, role] = process.argv.slice(2);
  const usage = 'usage: launch.js start|restart|stop|status|open|pet hub|collector [--open]';
  if (!ROLES[role]) { console.log(usage); process.exit(1); }
  const what = ROLES[role].what;
  const port = loadConfig(configPath()).port;
  if (mode === 'start' || mode === 'restart') {
    // restart: after setup, so the running copy picks up the new settings.
    if (mode === 'restart' && runningPid(role)) {
      stop(role);
      await new Promise((r) => setTimeout(r, 1500));
    }
    const r = start(role, { open: process.argv.includes('--open') });
    if (r.already) console.log(`${what}: 이미 켜져 있습니다 (창 없이 실행 중). 끄려면 stop 파일을 실행하세요.`);
    else console.log(`${what}: ${await report(role, port)}`);
    console.log('이 창은 닫아도 됩니다. 뒤에서 계속 돕니다.');
  } else if (mode === 'pet') {
    // The desktop icon: the pet, starting team pet first if it was off. A pet put away
    // ("펫 끄기") comes back on.
    if (!runningPid(role)) start(role);
    for (let i = 0; i < 40; i++) {
      const r = await fetch(`http://localhost:${port}/api/pet`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"on":true}' }).catch(() => null);
      if (r?.ok) break;
      await new Promise((ok) => setTimeout(ok, 500));
    }
  } else if (mode === 'open') {
    // The settings page, starting team pet first if it was off.
    if (runningPid(role)) {
      if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', `http://localhost:${port}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else {
      start(role, { open: true });
    }
  } else if (mode === 'after-exit') {
    // After a self-update: wait for the old process (its pid is the 3rd argument) to end, then start fresh.
    const old = Number(process.argv[4]);
    for (let i = 0; i < 40; i++) {
      try { process.kill(old, 0); } catch { break; }
      await new Promise((r) => setTimeout(r, 250));
    }
    try { fs.unlinkSync(files(role).pid); } catch {}
    start(role);
  } else if (mode === 'stop') {
    console.log(`${what}: ${stop(role).message}`);
  } else if (mode === 'status') {
    const pid = runningPid(role);
    console.log(`${what}: ${pid ? `켜져 있음 (기록: ${files(role).log})` : '꺼져 있음'}`);
  } else {
    console.log(usage);
    process.exit(1);
  }
}
