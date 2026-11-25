#!/usr/bin/env node
// 자동 실행 켜기/끄기: Windows 시작 프로그램 폴더에 하나를 넣고 뺀다.
// node scripts/autostart.js on|off [collector|hub]   (기본: collector)
// 먼저 창 없는 바로가기(wscript + hidden.vbs)를 만든다. PowerShell·COM 이 막힌 PC 에서는
// 같은 일을 하는 작은 .vbs 를 시작 프로그램 폴더에 직접 둔다 — 어느 쪽이든 창이 뜨지 않는다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POWERSHELL } from '../server/powershell.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROLES = {
  collector: { name: 'team-pet-collector', what: '팀 펫' },
  hub: { name: 'team-pet-hub', what: '팀 펫 허브' },
};
const startupDir = () => path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const quote = (s) => `'${s.replace(/'/g, "''")}'`;
const entries = (role) => ['.lnk', '.vbs'].map((ext) => path.join(startupDir(), ROLES[role].name + ext));

function shortcut(role) {
  const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
  const vbs = path.join(ROOT, 'scripts', 'hidden.vbs');
  const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut(${quote(entries(role)[0])});`
    + `$s.TargetPath=${quote(wscript)};$s.Arguments=${quote(`"${vbs}" ${role}`)};$s.WorkingDirectory=${quote(ROOT)};$s.Save()`;
  // Encoded, so no quote or non-ASCII character in a path can break the command line.
  execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, encoding: 'utf8',
  });
}

function startupScript(role) {
  const launch = path.join(ROOT, 'scripts', 'launch.js').replace(/"/g, '""');
  const text = `' Team office: start the ${role} with no window at sign-in.\r\n`
    + `CreateObject("WScript.Shell").Run """${process.execPath.replace(/"/g, '""')}"" ""${launch}"" start ${role}", 0, False\r\n`;
  // UTF-16 with a byte-order mark: wscript reads any folder name that way.
  fs.writeFileSync(entries(role)[1], Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
}

export function autostartOn(role = 'collector') {
  const r = ROLES[role];
  if (process.platform !== 'win32') return { ok: false, message: 'Windows 에서만 자동 실행을 등록합니다' };
  const done = `켬 — PC 를 켜면 ${r.what}가 창 없이 자동으로 켜집니다 (끄려면 autostart-off.cmd)`;
  for (const f of entries(role)) try { fs.unlinkSync(f); } catch {}
  let why = '';
  try {
    shortcut(role);
    return { ok: true, message: done };
  } catch (e) {
    why = String(e.stderr || e.message || e).trim().split('\n')[0];
  }
  try {
    startupScript(role);
    return { ok: true, message: done };
  } catch (e) {
    return { ok: false, message: `등록하지 못했습니다 (${why || e.message}). 켤 때마다 start-${role === 'hub' ? 'hub' : 'collector'}.cmd 를 실행해 주세요` };
  }
}

export function autostartOff(role = 'collector') {
  for (const f of entries(role)) try { fs.unlinkSync(f); } catch {}
  return { ok: true, message: `끔 — PC 를 켤 때마다 start-${role === 'hub' ? 'hub' : 'collector'}.cmd 를 실행하세요 (다시 켜려면 autostart-on.cmd)` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, role = 'collector'] = process.argv.slice(2);
  const r = !ROLES[role] ? { ok: false, message: 'usage: autostart.js on|off [collector|hub]' }
    : mode === 'on' ? autostartOn(role) : mode === 'off' ? autostartOff(role) : { ok: false, message: 'usage: autostart.js on|off [collector|hub]' };
  console.log(`자동 실행: ${r.message}`);
  process.exit(r.ok ? 0 : 1);
}
