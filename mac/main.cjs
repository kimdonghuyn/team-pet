// 팀 펫 for macOS: a see-through window over the Dock showing the web pet (client/pet.html), with
// this PC's team pet server running beside it (server/index.js, on Electron's own Node). A menu
// bar icon shows, hides and quits it; it starts at login. Windows has its own pet (server/pet.ps1).
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, shell, globalShortcut, clipboard } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CONFIG = process.env.TEAM_PET_CONFIG || path.join(os.homedir(), '.team-pet', 'config.json');
const readConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; } };
const PORT = Number(readConfig().port) || 4322;
const PAGE = `http://localhost:${PORT}`;
// The window: wide enough for a full row at its biggest, tall enough for a game panel over the
// chat (the Windows window grows to fit; this one is as big as it may need to be, and see-through).
const W = 760, H = 820;

let win = null, tray = null, quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => show());

// The server (which on the first run waits for the invite link, or the first room, from the pet).
// Not started if one already answers on the port.
async function answering() {
  try { return (await fetch(`${PAGE}/api/pet`, { signal: AbortSignal.timeout(800) })).ok; } catch { return false; }
}
// The server runs inside the app itself, not as a child process. macOS 15 grants the Local Network
// permission to the app; a child process's connections to other PCs (the hub) were refused without
// the question ever being asked (EHOSTUNREACH), and the app never showed up under Privacy & Security
// → Local Network. Here the connections are the app's own, so macOS asks once and remembers.
let serverOn = false;
const appStartedAt = Date.now();
async function startServer() {
  if (serverOn || await answering()) return;
  serverOn = true;
  const hub = Array.isArray(readConfig().floors) && readConfig().floors.length > 0;
  // A first run has no settings folder yet: the server makes it, but the log file comes first.
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  const out = fs.createWriteStream(path.join(path.dirname(CONFIG), hub ? 'hub.log' : 'collector.log'), { flags: 'w' });
  const { inspect } = require('node:util');
  const write = (...parts) => { try { out.write(`${parts.map((p) => (typeof p === 'string' ? p : inspect(p))).join(' ')}\n`); } catch {} };
  console.log = console.info = console.warn = console.error = write;
  // When the server ends itself (🔄 restart, a first room made, a fatal error) the whole app starts
  // again, as the child process used to be started again. One that falls over right after starting
  // stays down rather than starting over and over.
  process.exit = (code = 0) => {
    if (quitting || (code && Date.now() - appStartedAt < 30_000)) return app.exit(code);
    app.relaunch();
    app.exit(0);
  };
  process.env.TEAM_PET_APP = '1';
  // --push-config reads the rooms from the settings: this Mac is the hub of its own rooms, if any,
  // and a member of the others' at the same time.
  const entry = path.join(ROOT, 'server', 'index.js');
  process.argv = [process.argv[0], entry, '--push-config'];
  await import(require('node:url').pathToFileURL(entry).href);
}

// Where the pet sits: P is the screen point under the row's bottom-right corner (pet.x/y in the
// settings, saved by the page as the Windows pet saves its right/bottom), or above the Dock at the
// bottom right. The window is as big as the pet may ever need; settle() keeps it on the screen and
// tells the page where in it the pet goes, so the pet can sit at any edge or in the middle.
let P = null;
const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
function place() {
  const { x, y } = readConfig().pet || {};
  const prim = screen.getPrimaryDisplay().workArea;
  const onScreen = Number.isFinite(x) && Number.isFinite(y) && screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return x > a.x + 40 && x <= a.x + a.width && y > a.y + 40 && y <= a.y + a.height;
  });
  P = onScreen ? { x, y } : { x: prim.x + prim.width - 12, y: prim.y + prim.height - 4 };
  return settle();
}
function settle() {
  if (!win) return null;
  const a = screen.getDisplayNearestPoint({ x: Math.round(P.x), y: Math.round(P.y) }).workArea;
  P.x = clamp(a.x + 80, a.x + a.width - 12, P.x); P.y = clamp(a.y + 120, a.y + a.height - 4, P.y);
  const wx = clamp(a.x, a.x + a.width - W, P.x + 12 - W), wy = clamp(a.y, a.y + a.height - H, P.y + 4 - H);
  win.setBounds({ x: Math.round(wx), y: Math.round(wy), width: W, height: H });
  const dock = { right: Math.round(wx + W - P.x), bottom: Math.round(wy + H - P.y) };
  win.webContents.send('dock', dock);
  return dock;
}
function createWindow() {
  win = new BrowserWindow({
    width: W, height: H, transparent: true, frame: false, resizable: false, hasShadow: false, skipTaskbar: true,
    alwaysOnTop: true, fullscreenable: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Clicks pass through to the desktop except over the pets and their boxes (the page says where).
  win.setIgnoreMouseEvents(true, { forward: true });
  // What the page says in its console goes to pet.log next to the settings, as the Windows pet's
  // window errors go to the server's log: a typo in the page would otherwise show nothing at all.
  const petLog = path.join(path.dirname(CONFIG), 'pet.log');
  try { fs.writeFileSync(petLog, ''); } catch {}
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level < 2) return;
    try { fs.appendFileSync(petLog, `${new Date().toISOString()} ${level === 3 ? 'error' : 'warn'} ${message} (${path.basename(source)}:${line})\n`); } catch {}
  });
  place();
  load();
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
// The page comes from the server, which may still be starting.
async function load() {
  for (let i = 0; i < 60 && !(await answering()); i++) await new Promise((r) => setTimeout(r, 500));
  win.loadURL(`${PAGE}/pet.html`).catch(() => setTimeout(load, 2000));
  win.webContents.once('did-finish-load', () => settle());
}
function show() { if (!win) return; win.showInactive(); place(); }
function toggle() { if (!win) return; if (win.isVisible()) win.hide(); else show(); }

ipcMain.on('mouse', (_e, over) => { if (win) win.setIgnoreMouseEvents(!over, { forward: true }); });
// The page drags my pet: the pet's spot moves by that much, the window follows as it must, and
// the page hears where the pet now sits in the window and on the screen (to save).
ipcMain.handle('drag', (_e, dx, dy) => {
  if (!win || !P) return null;
  P.x += dx; P.y += dy;
  return { x: Math.round(P.x), y: Math.round(P.y), ...settle() };
});
ipcMain.handle('clipboard', () => clipboard.readText());
ipcMain.on('hide', () => win?.hide());
ipcMain.on('quit', () => app.quit());

function makeTray() {
  const icon = nativeImage.createFromPath(path.join(ROOT, 'client', 'assets', 'icon.png')).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('팀 펫');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `버전 ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: '펫 보이기 / 숨기기   ⌃⌥Z', click: toggle },
    { label: '설정 화면 열기', click: () => shell.openExternal(PAGE) },
    { type: 'separator' },
    { label: '팀 펫 끄기', click: () => app.quit() },
  ]));
}

// macOS 15 asks before an app talks to other machines on the local network (the hub's PC). It
// asks only when the app itself does; the server runs as a child process, whose connections are
// refused without a word (EHOSTUNREACH, or a timeout), and the app never shows up under Privacy &
// Security → Local Network. So the app itself sends one small packet to the local network first
// (an mDNS query, as Bonjour does), which brings up the question; once allowed, the server's
// connections go through too.
function askLocalNetwork() {
  try {
    const sock = require('node:dgram').createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('error', () => { try { sock.close(); } catch {} });
    // A query for _services._dns-sd._udp.local (PTR), the standard "what is here?" question.
    const q = Buffer.from('000000000001000000000000095f7365727669636573075f646e732d7364045f756470056c6f63616c00000c0001', 'hex');
    sock.send(q, 5353, '224.0.0.251', () => setTimeout(() => { try { sock.close(); } catch {} }, 500));
  } catch {}
  // And a plain look at the hubs this Mac knows, the way the server will (each answered or not).
  try {
    const links = (readConfig().team?.links || []).map((l) => l.hubUrl).filter(Boolean);
    for (const url of links) fetch(url, { signal: AbortSignal.timeout(3000) }).catch(() => {});
  } catch {}
}

app.whenReady().then(async () => {
  app.dock?.hide();
  askLocalNetwork();
  // Starts again at login, as the Windows pet does.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  await startServer();
  createWindow();
  makeTray();
  globalShortcut.register('Control+Alt+Z', toggle);
  screen.on('display-metrics-changed', () => win && place());
});
app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { quitting = true; globalShortcut.unregisterAll(); });
