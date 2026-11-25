#!/usr/bin/env node
// Puts "팀 펫" on the desktop: a web shortcut to this PC's own page
// (localhost), where the switch leads to the team floors and my room. It saves
// remembering an address. node scripts/desktop-shortcut.js [port]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POWERSHELL } from '../server/powershell.js';

const ICON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'assets', 'icon.ico');

// Every place the visible desktop may be, best guess first: Windows' own answer
// (it follows a desktop OneDrive has moved), then the usual OneDrive and local folders.
function desktopDirs() {
  const dirs = [];
  try {
    const ps = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Environment]::GetFolderPath('Desktop')";
    dirs.push(execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch {}
  for (const root of [process.env.OneDrive, process.env.OneDriveCommercial, process.env.OneDriveConsumer].filter(Boolean)) {
    dirs.push(path.join(root, 'Desktop'), path.join(root, '바탕 화면'));
  }
  dirs.push(path.join(os.homedir(), 'Desktop'));
  return [...new Set(dirs.filter((d) => d && fs.existsSync(d)))];
}

// The icon from a plain-letters path when it can be: Explorer reads a shortcut's
// icon path more reliably that way than from a folder named in Korean.
function iconPath() {
  const dir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'TeamOffice');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const copy = path.join(dir, 'icon.ico');
    fs.copyFileSync(ICON, copy);
    return copy;
  } catch {
    return ICON;
  }
}

export function desktopShortcut(port = 4322) {
  if (process.platform !== 'win32') return { ok: false, message: 'Windows 에서만 만듭니다' };
  const dir = desktopDirs()[0];
  if (!dir) return { ok: false, message: `바탕화면 폴더를 찾지 못했습니다 — 브라우저 즐겨찾기에 http://localhost:${port} 를 넣어 주세요` };
  try {
    const file = path.join(dir, '팀 펫.url');
    const text = `[InternetShortcut]\r\nURL=http://localhost:${port}/\r\nIconFile=${iconPath()}\r\nIconIndex=0\r\n`;
    // Plain text when it can be; an icon path with other letters needs Unicode with a byte-order mark.
    const ascii = /^[\x00-\x7f]*$/.test(text);
    fs.writeFileSync(file, ascii ? text : Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
    return { ok: true, file, message: `바탕화면에 "팀 펫" 아이콘을 만들었습니다 — ${file}` };
  } catch (e) {
    return { ok: false, message: `바탕화면 아이콘을 만들지 못했습니다 (${e.message}) — 브라우저 즐겨찾기에 http://localhost:${port} 를 넣어 주세요` };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = desktopShortcut(Number(process.argv[2]) || 4322);
  console.log(r.message);
  if (r.ok) console.log('바탕화면에 안 보이면 바탕화면 빈 곳을 누르고 F5. 그림이 기본 모양이어도 더블클릭하면 열립니다.');
}
