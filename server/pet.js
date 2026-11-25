// The desktop pet: a small animal that sits above the taskbar, shows the team
// floor's talk in a bubble (or only a dot, for a quiet office), lets me answer
// right there, and flinches when I am poked or called by name.
// The window itself is server/pet.ps1 (WPF through PowerShell, nothing to
// install); it reads GET /api/pet and talks through POST /api/chat, as this PC.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PETS } from '../scripts/make-pets.js';
import { POWERSHELL } from './powershell.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PET_KINDS = Object.keys(PETS);
// The animals handed out to people who never picked one (client/office.js PET_KINDS is the same
// list). A pet marked `pick` only shows when chosen, so adding one changes nobody's animal.
const AUTO_KINDS = PET_KINDS.filter((k) => !PETS[k].pick);
// Enough for a tall chat box; it scrolls, so a small one just shows the newest.
const CHAT_LINES = 40;
const MAX_FRIENDS = 6; // per floor
// How big the whole row is, dragged by its corner grip: a full office takes less screen when small.
const SCALE_MIN = 0.5;
const SCALE_MAX = 1.6;
// The chat box has its own size (dragged by its top-left corner) and see-through level.
const CHAT_W = [220, 560, 250];
const CHAT_H = [80, 600, 160];
const CHAT_ALPHA = [0.3, 1, 1];
// The whole window (pets, chat, games) at once, from the right-click menu.
const PET_ALPHA = [0.3, 1, 1];
const within = ([lo, hi, dflt], v, step) => (Number.isFinite(v) ? Math.round(Math.max(lo, Math.min(hi, v)) / step) * step : dflt);
const cleanScale = (v) => (Number.isFinite(v) ? Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, v)) * 100) / 100 : 1);

// Someone who has not picked an animal still gets the same one every time.
export function kindFor(userId, kind) {
  if (PET_KINDS.includes(kind)) return kind;
  let h = 0;
  for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AUTO_KINDS[h % AUTO_KINDS.length];
}

// Whether a line calls this name: "@이름", or "@" and the first word of a long name
// ("@hana" calls "hana (admin)"); "@all" (or @모두, @전체) calls everyone on the floor.
// The page has the same rule (client/main.js callsName).
export const CALL_ALL = /@(all|모두|전체)(?![\w가-힣])/i;
export function calls(text, name) {
  const n = String(name || '').trim().toLowerCase();
  const short = n.split(/[\s(]/)[0];
  const t = String(text || '').toLowerCase();
  return CALL_ALL.test(t) || [n, short].some((x) => x && t.includes('@' + x));
}

// "userId@floor" → userId (a guest's id is "guest:<id>").
const userOf = (key) => (typeof key === 'string' && key.includes('@') ? key.slice(0, key.lastIndexOf('@')) : '');

// What the pet window needs, from my own page's snapshot (snapshotFor('owner')).
// friends: the people on my floors, each with their animal, grouped by floor so
// several floors never blur into one crowd (someone on two of my floors sits in
// both groups); a chat line names who said it and where, so the pet in that
// floor's group gets the bubble.
// floor: the room my pet stands in (current); the other floors are chat tabs. friends come from
// every floor; the pet shows the current one's in its row.
export function petView(snap, { myId, myName = '', pet, pokes, calls: called = 0, current = null, duel = null, relay = null, party = null, contest = null }) {
  const chat = [...(snap.chat || [])].sort((a, b) => a.at - b.at).slice(-CHAT_LINES)
    .map((m) => ({ id: `${m.floor}|${m.id}`, floor: m.floor, who: userOf(m.key), name: m.name, text: m.text, at: m.at, mine: userOf(m.key) === myId,
      // Someone called me by name (@이름): the pet shows that line in its own colour.
      me: userOf(m.key) !== myId && calls(m.text, myName),
      // A picture's path on my own server (it fetches from the hub when it is not one).
      img: m.img ? `/api/chat-img?${new URLSearchParams({ floor: m.floor, id: m.img })}` : null,
      // 🎆 A chat effect (server/team.js FX) to play over whoever said it.
      fx: m.fx || null,
      // 🎣 A big catch said on the floor: which one, to leap over whoever caught it.
      fish: m.fish ? { ...m.fish, ...(m.fx === 'smack' || m.fx === 'snowball' ? { me: m.fish.to === myId } : {}) } : null,
      // 💨 A fling said on the floor: who flew, sent by whom, how (pet-fx.js plays it).
      fling: m.fling || null }));
  const floors = snap.floors || [];
  const friends = new Map();
  for (const p of snap.people || []) {
    const at = `${p.floor}|${p.userId}`;
    if (p.userId === myId || friends.has(at)) continue;
    friends.set(at, { floor: p.floor, who: p.userId, name: p.name, kind: kindFor(p.userId, p.pet), guest: !!p.guest, fishing: !!p.fishing, rod: p.rod || 0, smackable: p.smackable !== false });
  }
  const byFloor = floors.map((fl) => [...friends.values()].filter((p) => p.floor === fl)
    .sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_FRIENDS));
  return {
    on: pet.on, kind: pet.kind, bubbles: pet.bubbles !== false, x: pet.x, y: pet.y,
    // 🎆 Others' chat effects off on this screen (mine still play for me).
    fxOff: pet.fxOff === true,
    // 🦶 날려버리기 not taken (others are told so).
    smackOff: pet.smackOff === true,
    scale: cleanScale(pet.scale ?? 1),
    chatW: within(CHAT_W, pet.chatW, 1), chatH: within(CHAT_H, pet.chatH, 1), chatAlpha: Math.round(within(CHAT_ALPHA, pet.chatAlpha, 0.05) * 100) / 100,
    petAlpha: Math.round(within(PET_ALPHA, pet.petAlpha, 0.05) * 100) / 100,
    kinds: PET_KINDS.map((k) => ({ kind: k, name: PETS[k].name })),
    floors,
    floor: current || floors[0] || null,
    friends: byFloor.flat(),
    chat,
    // ✉️ 쪽지: the latest ones to me and from me (dir 'in' | 'out'); a picture by its path here.
    notes: (snap.notes || []).slice(-10).map((n) => ({ ...n, img: n.img ? `/${n.img}` : null })),
    // ⚔️ 대결: my game, as the hub shows it to me (server/duel.js view), or null.
    duel,
    // 🎨 이어 그리기 on my floors that matters most to me (server/relay.js view), or null.
    relay,
    // 🎲 같이 하기 (server/party.js view) that matters most to me, or null.
    party,
    // 🏁 낚시대회 on my floors (server/fish.js contestView), or null.
    contest,
    pokes,
    calls: called,
  };
}

// 📦 What changed (server/patch-notes.json, each note numbered upward): the ones after the last I
// put away, newest first, or else only the newest (for the menu). Someone who never put one away
// gets just the newest, not the whole history. null without any notes.
export function newsView(notes, seen) {
  const list = (Array.isArray(notes) ? notes : []).filter((x) => Number.isInteger(x?.n) && Array.isArray(x.lines)).sort((a, b) => b.n - a.n);
  if (!list.length) return null;
  const top = list[0].n;
  const since = Number.isInteger(seen) ? seen : top - 1;
  const fresh = list.filter((x) => x.n > since);
  const items = (fresh.length ? fresh : list.slice(0, 1)).map((x) => ({ date: String(x.date || ''), head: String(x.head || ''), lines: x.lines.map(String) }));
  return { n: top, fresh: fresh.length > 0, items };
}

// A settings change from my page or the pet's own menu, cleaned.
export function cleanPet(body, cur) {
  const next = { ...cur };
  if ('on' in body) next.on = body.on === true;
  if ('kind' in body && PET_KINDS.includes(body.kind)) next.kind = body.kind;
  if ('bubbles' in body) next.bubbles = body.bubbles !== false;
  if ('fxOff' in body) next.fxOff = body.fxOff === true;
  if ('smackOff' in body) next.smackOff = body.smackOff === true;
  if ('scale' in body) next.scale = cleanScale(body.scale);
  if ('chatW' in body) next.chatW = within(CHAT_W, body.chatW, 1);
  if ('chatH' in body) next.chatH = within(CHAT_H, body.chatH, 1);
  if ('chatAlpha' in body) next.chatAlpha = Math.round(within(CHAT_ALPHA, body.chatAlpha, 0.05) * 100) / 100;
  if ('petAlpha' in body) next.petAlpha = Math.round(within(PET_ALPHA, body.petAlpha, 0.05) * 100) / 100;
  if ('newsSeen' in body && Number.isInteger(body.newsSeen) && body.newsSeen >= 0) next.newsSeen = body.newsSeen;
  for (const k of ['x', 'y']) {
    if (k in body) next[k] = Number.isFinite(body[k]) ? Math.round(Math.max(-10000, Math.min(10000, body[k]))) : null;
  }
  return next;
}

// The window process. It closes itself when this server goes away (it watches
// our pid), and the server closes it when the pet is turned off. One that falls over
// (ends with an error) is started again PET_KEEP_AFTER_MS later, up to PET_KEEP_MAX a minute.
export const PET_KEEP_AFTER_MS = 3_000;
export const PET_KEEP_MAX = 5;
export class PetWindow {
  constructor({ port, log = () => {} }) {
    this.port = port;
    this.log = log;
    this.child = null;
  }

  get running() { return !!this.child && this.child.exitCode === null; }

  script() {
    const fill = { __PORT__: String(this.port), __PARENT__: String(process.pid),
      __PETS__: path.join(ROOT, 'client', 'assets', 'pets'), __ICON__: path.join(ROOT, 'client', 'assets', 'icon.ico') };
    let s = fs.readFileSync(path.join(ROOT, 'server', 'pet.ps1'), 'utf8');
    for (const [k, v] of Object.entries(fill)) s = s.split(k).join(v.replace(/'/g, "''"));
    return s;
  }

  start() {
    // Windows only; the Mac app (TEAM_PET_APP) shows the web pet instead (mac/main.cjs).
    if (process.platform !== 'win32' || process.env.TEAM_PET_APP || this.running) return;
    this.wanted = true;
    // The window script outgrew the command line (32767 characters), so it waits in
    // a file and a short encoded loader runs it. Encoded like scripts/autostart.js
    // so no quoting breaks the command line; a script block made from text is not
    // held back by the execution policy the way running a .ps1 file would be.
    const file = path.join(os.tmpdir(), `team-pet-${this.port}.ps1`);
    fs.writeFileSync(file, this.script());
    const loader = `. ([scriptblock]::Create([IO.File]::ReadAllText('${file.replace(/'/g, "''")}', [Text.Encoding]::UTF8)))`;
    const encoded = Buffer.from(loader, 'utf16le').toString('base64');
    const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    this.child = child;
    let err = '';
    // A window that cannot start (no PowerShell, a blocked PC) costs the pet, never the office.
    child.on('error', (e) => { this.log(`pet window did not start: ${e.code || e.message}`); if (this.child === child) this.child = null; this.wanted = false; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (code) => {
      if (this.child !== child) return; // stopped on purpose
      this.child = null;
      if (!code) return; // closed itself: turned off, or its office went away
      this.log(`pet window closed (${code}): ${err.trim().split('\n')[0] || ''}`);
      // Fell over: up again in a moment, unless it keeps falling (more than PET_KEEP_MAX a minute).
      const now = Date.now();
      this.falls = (this.falls || []).filter((t) => now - t < 60_000).concat(now);
      if (this.falls.length > PET_KEEP_MAX) { this.log('pet window keeps closing: not starting it again'); this.wanted = false; return; }
      setTimeout(() => { if (this.wanted && !this.running) this.start(); }, PET_KEEP_AFTER_MS);
    });
  }

  stop() {
    this.wanted = false;
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null) child.kill();
  }
}
