#!/usr/bin/env node
// 배포 압축 두 개를 만든다: dist/team-pet.zip (팀원용), dist/team-pet-admin.zip (관리자용, 팀원용 압축 포함).
// .cmd 는 여기서 CRLF·영문으로 써 넣는다 — 한글·LF 로 된 배치 파일은 cmd 가 읽다가 바로 꺼진다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPath, loadConfig, officeAddress } from '../server/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PROGRAM = ['client', 'server', 'scripts', 'LICENSE', 'README.md', 'package.json'];

// The installer brings its own Node in runtime\; a zip install uses the one on PATH.
const cmd = (...lines) => ['@echo off', 'chcp 65001 >nul', 'cd /d "%~dp0"', 'set "NODE=node"',
  'if exist "%~dp0runtime\\node.exe" set "NODE=%~dp0runtime\\node.exe"', ...lines].join('\r\n') + '\r\n';
const needNode = [
  'if not "%NODE%"=="node" goto havenode',
  'where node >nul 2>nul',
  'if errorlevel 1 (',
  '  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.',
  '  echo Or in PowerShell: winget install OpenJS.NodeJS.LTS',
  '  pause',
  '  exit /b 1',
  ')',
  ':havenode',
];

const BUILD = Date.now();

// This PC's office address, when this PC is the hub (it has floors): same pick as server/index.js.
const OFFICE = (() => {
  const cfg = loadConfig(configPath());
  if (!cfg.floors?.length) return '';
  const ip = officeAddress();
  return ip !== 'localhost' ? `http://${ip}:${cfg.port}` : '';
})();

function stage(name, files) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `pack-${name}-`)), 'team-pet');
  fs.mkdirSync(dir, { recursive: true });
  for (const p of PROGRAM) fs.cpSync(path.join(ROOT, p), path.join(dir, p), { recursive: true });
  // The build stamp members compare against their hub's to update themselves (server/update.js).
  fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ version: BUILD }) + '\n');
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    if (Buffer.isBuffer(content)) fs.writeFileSync(path.join(dir, rel), content);
    else fs.writeFileSync(path.join(dir, rel), content, 'utf8');
  }
  return dir;
}

function zip(dir, out) {
  fs.rmSync(out, { force: true });
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${dir}' -DestinationPath '${out}' -Force`], { stdio: 'inherit' });
  console.log(`${path.relative(ROOT, out)}  ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
  return dir;
}

fs.mkdirSync(DIST, { recursive: true });
const memberZip = path.join(DIST, 'team-pet.zip');

const memberFiles = {
  'setup.cmd': cmd(...needNode, '"%NODE%" scripts\\setup-collector.js', 'if errorlevel 1 (', '  pause', '  exit /b 1', ')', '"%NODE%" scripts\\launch.js restart collector', 'pause'),
  // No window to keep open: start in the background, open my page, say how it went, close by itself.
  'start-collector.cmd': cmd(...needNode, '"%NODE%" scripts\\launch.js start collector --open', 'timeout /t 6'),
  'stop-collector.cmd': cmd('"%NODE%" scripts\\launch.js stop collector', 'timeout /t 4'),
  'autostart-on.cmd': cmd('"%NODE%" scripts\\autostart.js on collector', 'pause'),
  'autostart-off.cmd': cmd('"%NODE%" scripts\\autostart.js off collector', 'pause'),
  'desktop-icon.cmd': cmd('"%NODE%" scripts\\desktop-shortcut.js', 'pause'),
  '사용-설명서.md': fs.readFileSync(path.join(ROOT, '사용-설명서.md')),
  // The office this build is for: a join code is tried there first (server/index.js BUILT_FOR),
  // so a PC on another part of the office network needs no link. Only when packed on the hub PC.
  ...(OFFICE ? { 'office.json': JSON.stringify({ hubUrl: OFFICE }) + '\n' } : {}),
};
const memberDir = zip(stage('member', memberFiles), memberZip);
// For a PC where the setup program is blocked (Smart App Control): the same files with
// Node inside (runtime\node.exe, signed by its makers), unzipped and started by hand.
const NODE_EXE = path.join(ROOT, 'build', 'runtime', 'node.exe');
const memberNodeDir = fs.existsSync(NODE_EXE)
  ? zip(stage('member-node', { ...memberFiles, 'runtime/node.exe': fs.readFileSync(NODE_EXE) }), path.join(DIST, '팀-펫-압축판.zip'))
  : null;

// 🆕 The update that installs fetch from the releases by themselves (server/release-update.js):
// the program's files only, at the zip's top (no team-pet level), with update.json beside it to
// say which build it is, its version and its hash. Both go up to each release.
const updateDir = stage('update', { '사용-설명서.md': fs.readFileSync(path.join(ROOT, '사용-설명서.md')) });
const updateZip = path.join(DIST, 'team-pet-update.zip');
fs.rmSync(updateZip, { force: true });
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${updateDir}\\*' -DestinationPath '${updateZip}' -Force`], { stdio: 'inherit' });
const appVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const updateSha = createHash('sha256').update(fs.readFileSync(updateZip)).digest('hex');
fs.writeFileSync(path.join(DIST, 'update.json'), JSON.stringify({ build: BUILD, version: appVersion, zip: 'team-pet-update.zip', sha256: updateSha }, null, 2) + '\n');
console.log(`${path.relative(ROOT, updateZip)}  ${(fs.statSync(updateZip).size / 1e6).toFixed(1)} MB  (update.json: ${appVersion}, ${BUILD})`);

// Practice on the hub PC (설명서 부록): the member side keeps its own config and port 4323.
const rehearsalSetup = [
  '@echo off',
  'rem Rehearsal on the hub PC: the member keeps its own config in this folder and uses port 4323,',
  'rem so the admin config and localhost:4322 stay the hub.',
  'set "TEAM_PET_CONFIG=%~dp0rehearsal-config.json"',
  'if not exist "%TEAM_PET_CONFIG%" echo {"port": 4323}> "%TEAM_PET_CONFIG%"',
  'call "%~dp0setup.cmd"',
].join('\r\n') + '\r\n';
const rehearsalStart = [
  '@echo off',
  'rem Starts the rehearsal member again with its own config (port 4323).',
  'set "TEAM_PET_CONFIG=%~dp0rehearsal-config.json"',
  'call "%~dp0start-collector.cmd"',
].join('\r\n') + '\r\n';
const rehearsalStop = [
  '@echo off',
  'rem Stops the rehearsal member only (its own config), never the real one.',
  'set "TEAM_PET_CONFIG=%~dp0rehearsal-config.json"',
  'call "%~dp0stop-collector.cmd"',
].join('\r\n') + '\r\n';

const adminFiles = {
  'setup-hub.cmd': cmd(...needNode, '"%NODE%" scripts\\setup-hub.js', 'if errorlevel 1 (', '  pause', '  exit /b 1', ')', '"%NODE%" scripts\\launch.js restart hub --open', 'pause'),
  'start-hub.cmd': cmd('"%NODE%" scripts\\launch.js start hub', 'timeout /t 6'),
  'stop-hub.cmd': cmd('"%NODE%" scripts\\launch.js stop hub', 'timeout /t 4'),
  'autostart-on.cmd': cmd('"%NODE%" scripts\\autostart.js on hub', 'pause'),
  'autostart-off.cmd': cmd('"%NODE%" scripts\\autostart.js off hub', 'pause'),
  'desktop-icon.cmd': cmd('"%NODE%" scripts\\desktop-shortcut.js', 'pause'),
  '사용-설명서.md': fs.readFileSync(path.join(ROOT, '사용-설명서.md')),
};
const adminDir = zip(stage('admin', {
  ...adminFiles,
  '팀원에게-보낼-파일/team-pet.zip': fs.readFileSync(memberZip),
  '연습용-같은PC/rehearsal-setup.cmd': rehearsalSetup,
  '연습용-같은PC/rehearsal-start.cmd': rehearsalStart,
  '연습용-같은PC/rehearsal-stop.cmd': rehearsalStop,
}), path.join(DIST, 'team-pet-admin.zip'));

// Setup programs (installer/team-pet.iss), when Inno Setup and the Node to
// bundle are on this PC. They carry their own Node, so nobody installs one.
const ISCC = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
].find((f) => fs.existsSync(f));
const d = new Date(BUILD);
const appVer = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}.${d.getHours() * 100 + d.getMinutes()}`;
const installerDirs = [];
if (!ISCC || !fs.existsSync(NODE_EXE)) {
  console.log(`설치 파일은 건너뜁니다: ${!ISCC ? 'Inno Setup 이 없습니다 (winget install JRSoftware.InnoSetup)' : `묶을 node.exe 가 없습니다 (${path.relative(ROOT, NODE_EXE)})`}`);
} else {
  for (const [role, files] of [['member', memberFiles], ['hub', adminFiles]]) {
    // The setup program installs the program folder itself, without the zip's team-pet level.
    const dir = stage(`setup-${role}`, files);
    installerDirs.push(dir);
    execFileSync(ISCC, ['/Qp', `/DRole=${role}`, `/DSrc=${dir}`, `/DNodeExe=${NODE_EXE}`, `/DAppVer=${appVer}`, `/DOut=${DIST}`,
      path.join(ROOT, 'installer', 'team-pet.iss')], { stdio: 'inherit' });
  }
  for (const f of fs.readdirSync(DIST).filter((f) => f.endsWith('.exe'))) console.log(`${path.join('dist', f)}  ${(fs.statSync(path.join(DIST, f)).size / 1e6).toFixed(1)} MB`);
}
for (const dir of [memberDir, memberNodeDir, updateDir, adminDir, ...installerDirs].filter(Boolean)) fs.rmSync(path.dirname(dir), { recursive: true, force: true });
