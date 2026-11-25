import crypto from 'node:crypto';
import http from 'node:http';

// Team office: one hub serves the page on the office network and merges what
// collectors on other PCs push to it. Everything that leaves a PC goes through
// redact() first, so file names, commands and thinking text stay on that PC.

export const KEY_COOKIE = 'agent_town_key';
const REMOTE_TTL_MS = 60_000;   // a collector that stops pushing leaves the office
const MAX_AGENTS_PER_PUSH = 50;

const SHARED_LABEL = {
  thinking: '생각 중', talking: '답하는 중', reading: '읽는 중', editing: '편집 중', searching: '찾는 중',
  running: '명령 실행 중', mcp: 'MCP 호출 중', subagent: '서브에이전트에게 맡김', waiting: '입력 기다림', idle: '쉬는 중',
};

export function newKey() {
  return crypto.randomBytes(18).toString('base64url');
}

// Join codes: a short code the admin reads out or sends, traded once at the hub
// for the floor's key. No 0/O/1/I/L, so it survives being typed from a message.
// It lasts a week; the admin can make a new one any time, which retires the old.
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_MS = 7 * 24 * 60 * 60_000;
export function newJoinCode() {
  return [...crypto.randomBytes(6)].map((x) => CODE_ABC[x % CODE_ABC.length]).join('');
}
// What a person typed: spaces, dashes and case do not matter.
export const cleanJoinCode = (v) => String(v || '').toUpperCase().replace(/[\s-]/g, '').slice(0, 12);

// Guessing codes: a few wrong tries per address, then a pause.
export class TryLimit {
  constructor({ max = 8, windowMs = 10 * 60_000, now = () => Date.now() } = {}) {
    Object.assign(this, { max, windowMs, now, tries: new Map() });
  }
  blocked(who) {
    const t = this.tries.get(who);
    if (t && this.now() - t.from > this.windowMs) this.tries.delete(who);
    return (this.tries.get(who)?.n || 0) >= this.max;
  }
  miss(who) {
    const t = this.tries.get(who) || { n: 0, from: this.now() };
    t.n++;
    this.tries.set(who, t);
  }
}

// A member's PC asks one of its offices what a code opens: { floor, key } or why not.
export async function redeemCode(hubUrl, code) {
  try {
    const res = await fetch(new URL('api/join', hubUrl.endsWith('/') ? hubUrl : hubUrl + '/'), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(5000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.key) return { floor: body.floor, key: body.key };
    return { status: res.status, error: body.error || `사무실이 ${res.status} 로 답했습니다` };
  } catch (e) {
    return { status: 0, error: `사무실에 연결되지 않습니다 (${e.cause?.code || e.message})` };
  }
}

export function keyMatches(given, key) {
  if (!key || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function cookieValue(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const str = (v, max = 120) => (typeof v === 'string' ? v.slice(0, max) : '');
// What a person says about themselves; anything else is dropped.
export const STATUSES = new Set(['focus', 'help']);
export const cleanStatus = (v) => (STATUSES.has(v) ? v : '');
export const cleanNote = (v) => str(v, 40).replace(/[\u0000-\u001f]/g, '').trim();
const num = (v) => (Number.isFinite(v) ? v : Date.now());

// The shape another PC may see: who, which project and branch, and the kind of
// activity. The detail line becomes the activity's generic label.
export function redact(a) {
  const history = [];
  for (const h of Array.isArray(a.history) ? a.history : []) {
    if (history.length && history[history.length - 1].activity === h.activity) continue;
    history.push({ t: num(h.t), activity: str(h.activity, 20), detail: SHARED_LABEL[h.activity] || '' });
    if (history.length >= 15) break;
  }
  return {
    id: str(a.id, 200),
    kind: a.kind === 'subagent' ? 'subagent' : 'main',
    parentId: a.parentId ? str(a.parentId, 200) : null,
    source: str(a.source, 20),
    sessionId: '',
    name: str(a.name, 60),
    userId: str(a.userId, 60),
    userName: str(a.userName, 60),
    project: str(a.project, 80),
    branch: str(a.branch, 120),
    model: str(a.model, 60),
    title: '',
    cwd: '',
    activity: SHARED_LABEL[a.activity] ? a.activity : 'idle',
    detail: SHARED_LABEL[a.activity] || '',
    stay: !!a.stay,
    // Set by the person, never inferred: their status and a short note.
    status: cleanStatus(a.status),
    note: cleanNote(a.note),
    since: num(a.since),
    lastEventAt: num(a.lastEventAt),
    subagents: [],
    history,
  };
}

// What a team floor gets about a session: which project and branch (for the
// floor and the course badge), never what it is doing. The activity stays on
// the PC: team floors show people, not their work.
export function shareable(a) {
  return {
    id: str(a.id, 200),
    kind: a.kind === 'subagent' ? 'subagent' : 'main',
    source: str(a.source, 20),
    project: str(a.project, 80),
    branch: str(a.branch, 120),
  };
}

// What a member's program says about itself, for the admin's status board: its build,
// installed with the setup file or from the zip, and whether the desktop pet is on.
const cleanClient = (c) => (c && typeof c === 'object'
  ? { version: Number.isFinite(c.version) ? c.version : 0, via: c.via === 'exe' || c.via === 'zip' ? c.via : '', pet: c.pet === true }
  : null);

const WORLD = { w: 40 * 32, h: 27 * 32 }; // client/office-map.js: COLS × ROWS × TILE
// Reactions (number keys 1-5 on the page) and chat limits.
export const EMOTES = new Set(['👍', '❤️', '😂', '👏', '🎉']);
// Space jumps (a moment), X sits down until I stand or walk (like ZEP).
export const ACTS = new Set(['jump', 'sit', 'stand']);
// 🎆 Chat effects: a line that is only one of these commands plays on every screen of the floor
// (the pet and the page), over whoever said it, and reads as its words in the talk. One per
// person every FX_GAP_MS, so nobody floods the floor. client/main.js and server/pet.ps1 draw them.
export const FX = {
  폭죽: ['fireworks', '🎆 폭죽 펑!'], 박수: ['clap', '👏 짝짝짝'], 하트: ['heart', '❤️ 하트 뿅'],
  ㅋㅋ: ['lol', '😂 ㅋㅋㅋ'], 눈: ['snow', '❄️ 눈이 와요'], 눈사람: ['snowman', '⛄ 다 같이 눈사람!'], 춤: ['dance', '💃 춤춰요!'], 댄스: ['dance', '💃 춤춰요!'],
  // Weather over the whole row: everyone there puts up an umbrella; /우산 changes mine's colour.
  비: ['rain', '🌧 비가 와요'], 우산: ['umbrella', '☂ 우산 펼침'],
};
const FX_GAP_MS = 10_000;
export const FLING_HOW = ['kick', 'hammer'];
const CHAT_MAX = 200;
const CHAT_KEEP = 60;
const CHAT_TTL_MS = 60 * 60_000;
// A pasted picture: the page shrinks it first, so this is only a guard.
export const CHAT_IMG_MAX = 600_000;
const CHAT_IMG_TYPES = new Set(['png', 'jpeg', 'gif', 'webp']);
function picture(dataUrl) {
  const m = /^data:image\/([a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(typeof dataUrl === 'string' ? dataUrl : '');
  if (!m || !CHAT_IMG_TYPES.has(m[1])) throw Object.assign(new Error('not a picture'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > CHAT_IMG_MAX) throw Object.assign(new Error('picture too large'), { status: 413 });
  return { type: `image/${m[1]}`, buf };
}
// Characters to choose from (client/assets/sprites/manifest.json lists 8).
export const AVATARS = 8;
export const cleanAvatar = (v) => (Number.isInteger(v) && v >= 0 && v < AVATARS ? v : null);
// The animal a person picked for the desktop pet (client/assets/pets/<kind>.png).
export const cleanPetKind = (v) => (typeof v === 'string' && /^[a-z]{2,16}$/.test(v) ? v : null);

// How busy someone is, in two words and nothing more: working (an AI session is
// doing something) or waiting (it is waiting for them). Never what it does.
const WORK = new Set(['working', 'waiting']);
export const cleanWork = (v) => (WORK.has(v) ? v : '');
export function coarseWork(agents) {
  const mains = agents.filter((a) => a.kind !== 'subagent');
  if (mains.some((a) => a.activity && a.activity !== 'idle' && a.activity !== 'waiting')) return 'working';
  if (mains.some((a) => a.activity === 'waiting')) return 'waiting';
  return '';
}
const coord = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : null);
const DIRS = new Set(['up', 'down', 'left', 'right']);

// People on the team floors: one per PC and floor, there while its collector
// keeps pushing (an AI session or not). Plus where each one stands.
export class TeamHub {
  constructor({ now = () => Date.now() } = {}) {
    this.users = new Map(); // slot -> { userId, name, status, note, floor, hidden, agents, ip, at }
    this.seen = new Map();  // userId -> { name, floors, at, client }: for the admin's status board
    this.pokes = new Map(); // slot -> pokes not yet collected
    this.positions = new Map(); // "userId@floor" -> { x, y, dir }
    this.emotes = new Map();    // "userId@floor" -> { emote, at }
    this.acts = new Map();      // "userId@floor" -> { act: 'jump' | 'sit', at }
    this.hits = new Map();      // "userId@floor" -> when they were last poked (everyone sees them flinch)
    this.chat = [];             // recent messages, in memory only: { id, floor, key, name, text, at, img?, fx? }
    this.fxAt = new Map();      // "userId@floor" -> when they last played a chat effect
    this.images = new Map();    // message id -> { type, buf, floor }: a line's picture, gone with the line
    this.notes = new Map();     // reader userId -> notes (쪽지) waiting for their next push
    this.seq = 0;
    this.now = now;
  }

  // A jump everyone sees once, or sitting down until standing up or walking off.
  act(key, act) {
    if (!ACTS.has(act)) throw Object.assign(new Error('unknown act'), { status: 400 });
    if (act === 'stand') this.acts.delete(key);
    else this.acts.set(key, { act, at: this.now() });
  }

  // A quick reaction above someone's head.
  emote(key, emote) {
    if (!EMOTES.has(emote)) throw Object.assign(new Error('unknown emote'), { status: 400 });
    this.emotes.set(key, { emote, at: this.now() });
  }

  // A chat line on a floor. Kept only in memory and only for a while: the floor
  // is a place to talk, not a record of what was said. A picture rides along as a
  // data URL and is kept apart, so the floor's snapshots (sent on every change)
  // carry only its id and pages fetch it by that.
  say(key, floor, name, text, image) {
    const t = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, CHAT_MAX);
    const pic = image == null ? null : picture(image);
    if (!t && !pic) throw Object.assign(new Error('empty message'), { status: 400 });
    const fx = !pic && /^\/(\S+)$/.test(t) ? FX[t.slice(1)] : null;
    if (fx) {
      if (this.now() - (this.fxAt.get(key) ?? -Infinity) < FX_GAP_MS) throw Object.assign(new Error('효과는 10초에 한 번 쓸 수 있어요'), { status: 429 });
      this.fxAt.set(key, this.now());
    }
    const m = { id: ++this.seq, floor, key, name: str(name, 60), text: fx ? fx[1] : t, at: this.now(), ...(fx ? { fx: fx[0] } : {}) };
    if (pic) { m.img = m.id; this.images.set(m.id, { ...pic, floor }); }
    this.chat.push(m);
    this.chat = this.chat.filter((x) => this.now() - x.at < CHAT_TTL_MS).slice(-CHAT_KEEP);
    const kept = new Set(this.chat.map((x) => x.id));
    for (const id of this.images.keys()) if (!kept.has(id)) this.images.delete(id);
  }

  // A line the hub says for someone (a big catch, a catch shown off): it plays fx over them like
  // a chat effect, with what it was about (data, under `as`) for the screens to draw.
  shout(key, floor, name, text, fx, data, as = fx) {
    this.chat.push({ id: ++this.seq, floor, key, name: str(name, 60), text: str(text, CHAT_MAX), at: this.now(), fx, ...(data ? { [as]: data } : {}) });
    this.chat = this.chat.filter((x) => this.now() - x.at < CHAT_TTL_MS).slice(-CHAT_KEEP);
  }

  image(id) {
    return this.images.get(Number(id)) || null;
  }

  // 🏷 A floor renamed: everything kept under its name (people, their spots, the talk, the notes)
  // follows it, so nothing on the screens changes but the name.
  renameFloor(from, to) {
    const tail = '@' + from, swap = (k) => (typeof k === 'string' && k.endsWith(tail) ? k.slice(0, -from.length) + to : k);
    const rekey = (map) => { for (const [k, v] of [...map]) if (swap(k) !== k) { map.delete(k); map.set(swap(k), v); } };
    for (const [k, u] of [...this.users]) if (u.floor === from) { this.users.delete(k); u.floor = to; this.users.set(swap(k), u); }
    for (const s of this.seen.values()) if (s.floors?.has(from)) { s.floors.delete(from); s.floors.add(to); }
    for (const p of this.pokes.values()) if (p.floor === from) p.floor = to;
    for (const m of [this.pokes, this.positions, this.emotes, this.acts, this.hits, this.fxAt]) rekey(m);
    for (const m of this.chat) if (m.floor === from) { m.floor = to; m.key = swap(m.key); }
    for (const p of this.images.values()) if (p.floor === from) p.floor = to;
    for (const list of this.notes.values()) for (const n of list) if (n.floor === from) n.floor = to;
  }

  // A note (쪽지) to one person only. It never joins a floor's snapshot: it waits here
  // for its reader and leaves with the answer to their next push (or a guest's beat),
  // so it reaches their PC and nobody else's. Unread after an hour, it is dropped.
  note(key, floor, name, to, text, image) {
    const t = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, CHAT_MAX);
    // Checked like a floor picture, then carried whole: the reader's own PC shows it.
    const img = image == null ? null : (picture(image), String(image));
    if (!t && !img) throw Object.assign(new Error('빈 쪽지입니다'), { status: 400 });
    const reader = str(to, 70);
    if (!reader) throw Object.assign(new Error('받는 사람이 없습니다'), { status: 400 });
    const n = { id: ++this.seq, from: key.slice(0, key.lastIndexOf('@')), name: str(name, 60), floor, text: t, img, at: this.now() };
    const box = (this.notes.get(reader) || []).filter((x) => this.now() - x.at < CHAT_TTL_MS);
    box.push(n);
    this.notes.set(reader, box.slice(-30));
    return n;
  }

  // A reader's waiting notes, handed over once.
  takeNotes(userId) {
    const box = (this.notes.get(userId) || []).filter((x) => this.now() - x.at < CHAT_TTL_MS);
    this.notes.delete(userId);
    return box;
  }

  chatOn(floors) {
    const on = new Set(floors);
    return this.chat.filter((m) => on.has(m.floor) && this.now() - m.at < CHAT_TTL_MS);
  }

  // Where a person moved their character. key: "userId@floor".
  move(key, { x, y, dir } = {}) {
    const px = coord(x, WORLD.w), py = coord(y, WORLD.h);
    if (px == null || py == null) throw Object.assign(new Error('x, y are numbers'), { status: 400 });
    const was = this.positions.get(key);
    this.positions.set(key, { x: px, y: py, dir: DIRS.has(dir) ? dir : 'down' });
    // Walking off is standing up.
    if (this.acts.get(key)?.act === 'sit' && was && (was.x !== px || was.y !== py)) this.acts.delete(key);
  }

  // The people present, per floor. floorOf places a PC that pushed with the
  // admin key (no floor of its own) by its projects, like the hub's own sessions.
  people(floorOf = () => null) {
    const out = [];
    for (const [slot, u] of this.users) {
      if (this.now() - u.at > REMOTE_TTL_MS) { this.users.delete(slot); continue; }
      if (u.hidden) continue;
      const floors = u.floor ? [u.floor] : [...new Set(u.agents.map((a) => floorOf(a.project)).filter(Boolean))];
      for (const floor of floors) {
        const mine = u.agents.filter((a) => a.kind !== 'subagent' && (u.floor || floorOf(a.project) === floor));
        out.push({ slot, key: `${u.userId}@${floor}`, userId: u.userId, name: u.name, status: u.status, note: u.note, avatar: u.avatar, pet: u.pet || null, noSmack: !!u.noSmack, work: u.work, guest: !!u.guest, floor, agents: mine, at: u.at });
      }
    }
    return out;
  }

  // floor: set when the push came with a floor key; every agent lands there.
  // ip: the pushing PC's address, so a browser opened on that same PC can be told it
  // is installed there (see installedAt) instead of joining a second time as a guest.
  receive(body, { floor = null, ip = '' } = {}) {
    const user = body && body.user;
    const userId = str(user && user.id, 60);
    if (!userId) throw Object.assign(new Error('user.id is required'), { status: 400 });
    if (!Array.isArray(body.agents)) throw Object.assign(new Error('agents must be a list'), { status: 400 });
    const name = str(user.name, 60) || userId;
    const status = cleanStatus(user.status);
    const note = status ? cleanNote(user.note) : '';
    // One PC can push to several floors of the same hub; each floor's push is
    // kept apart so they do not overwrite each other.
    const slot = floor ? `${userId}@${floor}` : userId;
    const agents = body.agents.slice(0, MAX_AGENTS_PER_PUSH).map((raw) => ({ ...shareable(raw || {}), id: `${slot}:${str(raw?.id, 200)}` }));
    this.users.set(slot, { userId, name, status, note, floor, hidden: user.hidden === true, avatar: cleanAvatar(user.avatar), pet: cleanPetKind(user.pet), noSmack: user.noSmack === true, work: cleanWork(user.work), agents, ip, at: this.now() });
    // The admin's status board remembers everyone who pushed since the hub started,
    // gone or not, with what their program said about itself.
    const seen = this.seen.get(userId) || { userId, floors: new Set() };
    if (floor) seen.floors.add(floor);
    Object.assign(seen, { name, at: this.now(), client: cleanClient(user.client), hidden: user.hidden === true });
    this.seen.set(userId, seen);
    return slot;
  }

  // The admin's status board: every PC that pushed since the hub started, and the
  // guests here now. online: pushed within the last minute (a push comes every few seconds).
  roster() {
    const now = this.now();
    const pcs = [...this.seen.values()].map((s) => ({
      userId: s.userId, name: s.name, floors: [...s.floors], at: s.at, online: now - s.at <= REMOTE_TTL_MS && !s.hidden, hidden: s.hidden,
      version: s.client?.version || 0, via: s.client?.via || '', pet: s.client ? s.client.pet : null,
    }));
    const guests = [...this.users.values()].filter((u) => u.guest && now - u.at <= REMOTE_TTL_MS)
      .map((u) => ({ userId: u.userId, name: u.name, floors: [u.floor], at: u.at, online: true, hidden: false, version: 0, via: 'guest', pet: null }));
    return [...pcs, ...guests].sort((a, b) => b.online - a.online || a.name.localeCompare(b.name, 'ko'));
  }

  // The board survives a restart of the hub (scripts update it often): kept in a small file.
  exportSeen() {
    return [...this.seen.values()].map((s) => ({ ...s, floors: [...s.floors] }));
  }
  importSeen(list) {
    for (const s of Array.isArray(list) ? list : []) {
      const userId = str(s && s.userId, 60);
      if (!userId || this.seen.has(userId)) continue;
      this.seen.set(userId, { userId, name: str(s.name, 60) || userId, floors: new Set((s.floors || []).map((f) => str(f, 60)).filter(Boolean)),
        at: Number(s.at) || 0, client: cleanClient(s.client), hidden: s.hidden === true });
    }
  }

  // Whether a PC at this address has its own office program connected right now.
  // This PC itself (loopback) says nothing: a rehearsal runs the hub and a member side by side.
  installedAt(ip) {
    if (!ip || /^(127\.|::1$|::ffff:127\.)/.test(ip)) return false;
    const now = this.now();
    return [...this.users.values()].some((u) => !u.guest && u.ip === ip && now - u.at <= REMOTE_TTL_MS);
  }

  // A guest: someone who only holds the floor link, with no collector. They say
  // who they are themselves, so they are always marked as a guest, and they stay
  // while their page keeps calling (like a collector's heartbeat).
  visit(guestId, floor, { name, avatar } = {}) {
    const n = cleanNote(name).slice(0, 20);
    if (!n) throw Object.assign(new Error('이름을 적어 주세요'), { status: 400 });
    const slot = `guest:${guestId}@${floor}`;
    this.users.set(slot, { userId: `guest:${guestId}`, name: n, status: '', note: '', floor, hidden: false, guest: true, avatar: cleanAvatar(avatar), work: '', agents: [], at: this.now() });
    return slot;
  }

  // A guest who pressed "나가기" (or closed the page) leaves at once, not after the TTL.
  leave(guestId) {
    for (const slot of [...this.users.keys()]) {
      if (!slot.startsWith(`guest:${guestId}@`)) continue;
      this.users.delete(slot);
      this.positions.delete(slot);
      this.emotes.delete(slot);
      this.acts.delete(slot);
      this.pokes.delete(slot);
    }
  }

  // 💨 날리기: one person sends another flying, for everyone on the floor to see (they land back a
  // moment later; nothing else happens). One a person every ten seconds, like any effect.
  // how: a kick and a toy hammer, turn and turn about (a refused try takes no turn); text(how) says it.
  fling(key, floor, name, text, data) {
    if (this.now() - (this.fxAt.get(key) ?? -Infinity) < FX_GAP_MS) throw Object.assign(new Error('효과는 10초에 한 번 쓸 수 있어요'), { status: 429 });
    this.fxAt.set(key, this.now());
    const how = FLING_HOW[(this.flings = ((this.flings ?? -1) + 1) % FLING_HOW.length)];
    this.shout(key, floor, name, text(how), 'fling', { ...data, how });
    return how;
  }

  // The slot to poke for a person: their floor's push, or an admin-key push.
  slotFor(userId, floor) {
    for (const slot of [`${userId}@${floor}`, userId]) if (this.users.has(slot)) return slot;
    return null;
  }

  // A poke waits for that PC's next push (a heartbeat comes every 15s), which
  // collects it. The hub cannot reach a collector, so it rides on the answer.
  poke(slot, floor) {
    const p = this.pokes.get(slot) || { pokes: 0, floor };
    p.pokes += 1;
    this.pokes.set(slot, p);
  }

  takePokes(slot) {
    const p = this.pokes.get(slot) || { pokes: 0, floor: '' };
    this.pokes.delete(slot);
    return p;
  }

}

// Collector: sends this PC's office (redacted) to the hub on every change and as
// a heartbeat, so the hub can tell a quiet agent from a PC that went away.
// prepare: this PC's last say before anything leaves (hiding, own status).
// onOffice(build): the hub's program build, from each answer, so a member can update
// as soon as the admin installs a new one (server/update.js soon).
export function startPush(store, { url, key, filter = () => true, prepare = (x) => x, me = () => ({}), shareWork = () => true, onPoke = () => {}, onStatus = () => {}, onOffice = () => {}, onNotes = () => {} }) {
  const endpoint = new URL('api/push', url.endsWith('/') ? url : url + '/').toString();
  let timer = null;
  let lastOk = null;
  async function send() {
    timer = null;
    const snap = store.snapshot();
    // Subagents carry their parent's project, so they follow its decision.
    const { status, note, hidden, avatar, pet, client, noSmack } = me();
    // Hidden: say so and send nothing else, so the floor drops me at once.
    const shared = prepare(snap.agents.filter(filter));
    // Only the sessions shared with this floor count, and only as working / waiting.
    const work = !hidden && shareWork() ? coarseWork(shared) : '';
    const user = { ...snap.user, status: cleanStatus(status), note: cleanNote(note), hidden: hidden === true, avatar: cleanAvatar(avatar), pet: cleanPetKind(pet), noSmack: noSmack === true, work, client: cleanClient(client) };
    const body = JSON.stringify({ user, agents: hidden ? [] : shared.map(shareable) });
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-team-key': key }, body });
      const ok = res.ok;
      if (ok !== lastOk) onStatus(ok, ok ? 'connected' : `hub answered ${res.status}`);
      lastOk = ok;
      const build = Number(res.headers.get('x-office-build'));
      if (build) onOffice(build);
      // Someone on my floor poked me since my last push.
      if (res.status === 200) {
        const answer = await res.json().catch(() => ({}));
        if (answer.pokes > 0) onPoke(answer.pokes, answer.floor || '');
        // Notes (쪽지) for me, handed over by the hub only in this answer.
        if (Array.isArray(answer.notes) && answer.notes.length) onNotes(answer.notes);
      }
    } catch (e) {
      if (lastOk !== false) onStatus(false, e.cause?.code || e.message);
      lastOk = false;
    }
  }
  const soon = () => { if (!timer) timer = setTimeout(send, 1000); };
  store.on('change', soon);
  const beat = setInterval(soon, 15_000);
  soon();
  return () => { clearInterval(beat); if (timer) clearTimeout(timer); store.off('change', soon); };
}

// Collector: keeps a live line to the hub's team floor (the hub's own event
// stream, opened with the floor key), so this PC's page can show that floor and
// see people move as they move. Reconnects on its own.
export function followHub({ url, key, onState = () => {} }) {
  const endpoint = new URL('api/events', url.endsWith('/') ? url : url + '/');
  let stopped = false;
  let req = null;
  let retry = null;
  const again = () => { if (!stopped && !retry) retry = setTimeout(() => { retry = null; open(); }, 3000); };
  function open() {
    req = http.get(endpoint, { headers: { 'x-team-key': key, accept: 'text/event-stream' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); onState(null); return again(); }
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
          if (data) try { onState(JSON.parse(data)); } catch {}
        }
      });
      res.on('end', () => { onState(null); again(); });
      res.on('error', () => {});
    });
    req.on('error', () => { onState(null); again(); });
  }
  open();
  return () => { stopped = true; clearTimeout(retry); req?.destroy(); };
}

// Collector: sends one request to the hub with the floor key (a move or a poke
// made on this PC's page) and hands back the hub's answer.
export async function askHub({ url, key, path: p, body }) {
  const endpoint = new URL(p, url.endsWith('/') ? url : url + '/').toString();
  const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-team-key': key }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
