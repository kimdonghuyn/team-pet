#!/usr/bin/env node
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Me } from './me.js';
import { fail, fromOwnPage, hostIsSelf, json, openStream, readJsonBody, sentJson, servePage } from './http-util.js';
import { configPath, loadConfig, officeAddress, saveConfig } from './config.js';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { JOIN_CODE_MS, TeamHub, TryLimit, askHub, cleanAvatar, cleanJoinCode, cleanNote, cleanStatus, followHub, keyMatches, newJoinCode, newKey, redeemCode, startPush } from './team.js';
import { Duels, GAMES } from './duel.js';
import { Relays } from './relay.js';
import { KINDS, Parties } from './party.js';
import { Smacks, cleanAim, isSpace, shotAt, shotDetail, isGoalShot, newTarget, golfShot, golfDetail, HOOP_CHANCE } from './smack.js';
import { RECORD_GAMES, Records } from './records.js';
import { Fishing, fishLooks, RARITY } from './fish.js';
import { autostartOn } from '../scripts/autostart.js';
import { desktopNotify } from './notify.js';

// 🔕 알림 끄기 (cfg.notify.quiet, from my page or my pet's menu): no Windows alert at all;
// the pet and the page still show everything as usual.
function toast(...a) { if (!cfg.notify.quiet) desktopNotify(...a); }
import { localVersion, manifest, programFile, relaunch, startUpdater } from './update.js';
import { RELEASE_URL, releaseUpdater } from './release-update.js';
import { CALL_ALL, PetWindow, calls, cleanPet, newsView, petView } from './pet.js';

// Anything nobody caught ends this process (scripts/keeper.js starts it again): first it goes in
// the log with the time, so the cause can be found later.
const fell = (e) => {
  try { console.error(`[${new Date().toLocaleString('ko-KR', { hour12: false })}] 처리하지 못한 오류로 꺼집니다:`, e?.stack || e); } catch {}
  process.exit(1);
};
process.on('uncaughtException', fell);
process.on('unhandledRejection', fell);

const ROOT =path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = path.join(ROOT, 'client');
// How this copy was installed, for the admin's status board: the setup file leaves its uninstaller.
const VIA = fs.existsSync(path.join(ROOT, 'unins000.exe')) ? 'exe' : 'zip';
// The office this build was made for (scripts/pack.js writes it): a join code is tried there
// first, so a PC on another part of the office network (another Wi-Fi) needs no link either.
const BUILT_FOR = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'office.json'), 'utf8')).hubUrl || ''; } catch { return ''; } })();
// Where a teammate without the pet gets it (the invite page): the newest release's files.
const RELEASES = 'https://github.com/kimdonghuyn/team-pet/releases/latest/download';

// Flags: --demo (the tests: no pet window, no real network around), --port <n> over the settings' port.
const argValue = (flag) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : null; };
const demo = process.argv.slice(2).includes('--demo');
const cfgFile = configPath(process.argv);
let cfg = loadConfig(cfgFile); // read once at start; changes are made here and saved back
if (Number(argValue('--port')) > 0) cfg.port = Number(argValue('--port'));

// Team office modes. --hub serves the page on the office network behind a team
// key and merges pushes from other PCs; --push <hubUrl> sends this PC's office
// (redacted) to a hub. Without either flag this is the original single-user app.
// --push-config reads this PC's links from the settings — and once this PC has made a room of its
// own (the first room, from the pet: handleFirstRoom), it is that room's hub.
const isHub = process.argv.includes('--hub') || (process.argv.includes('--push-config') && cfg.floors.length > 0);
// One person is in one room, as a team sits in one office: the room this PC made (cfg.floors, this
// PC its hub) or the one it was invited to (team.links: its hub + floor key; a new invite replaces
// it). I stand in one: a floor by its joined flag, or a link by team.current (a number), never both;
// standing in a link, my person is pushed to its hub (pushLinks), and only that room is followed.
// --push <url> keeps the single-link form with team.key.
const rooms = argValue('--push')
  ? [{ hubUrl: argValue('--push'), key: cfg.team.key }]
  : Array.isArray(cfg.team.links) && cfg.team.links.length ? cfg.team.links
    : !isHub && process.argv.includes('--push-config') && cfg.team.hubUrl ? [{ hubUrl: cfg.team.hubUrl, key: cfg.team.key }] : [];
const standingLink = Number.isInteger(cfg.team.current) && rooms[cfg.team.current] && !cfg.floors.some((f) => f.joined === true) ? rooms[cfg.team.current] : null;
const pushLinks = standingLink ? [standingLink] : !isHub && rooms.length ? [rooms[0]] : [];
if (pushLinks.length) for (const f of cfg.floors) f.joined = false;
const pushUrl = pushLinks.length ? pushLinks[0].hubUrl : null;
const linkState = new Map(); // push link -> { ok, why } of its last delivery
const linkStops = new Map(); // push link -> stops its push and its follow
if (argValue('--key')) cfg.team.key = argValue('--key');
// A floor's join code, made fresh: it opens the floor for a week (team.js).
const freshCode = (f) => Object.assign(f, { code: newJoinCode(), codeUntil: Date.now() + JOIN_CODE_MS });
if (isHub && (!cfg.team.key || cfg.floors.some((f) => !f.key || !f.code))) {
  cfg.team.key ||= newKey();
  for (const f of cfg.floors) { f.key ||= newKey(); if (!f.code) freshCode(f); }
  saveConfig(cfgFile, cfg);
}
const joinTries = new TryLimit();
// Started again right after the first room was made (restartAsHub): for its first half minute the
// pet is told to show the room's invite link, whenever its window gets round to asking.
const bornAt = Date.now();
const firstRoom = !!process.env.TEAM_PET_FIRST_ROOM;

// What a key opens: 'admin' (every floor) or 'floor:<name>' (that floor only).
function accessFor(key) {
  if (keyMatches(key, cfg.team.key)) return 'admin';
  const f = cfg.floors.find((x) => keyMatches(key, x.key));
  return f ? `floor:${f.name}` : null;
}
const team = isHub ? new TeamHub() : null;
// 🎨 이어 그리기 (server/relay.js): one per floor; how it went is said on that floor. The
// topics already drawn are kept in a small file, so a restart does not bring them back early.
// 🎲 같이 하기 (server/party.js): 🏗 높이 쌓기 · 💣 폭탄 돌리기 · 🔤 끝말잇기 · 🕵️ 라이어 게임,
// one table per floor. The tower records per floor, and the liar words already given (so the
// list goes round before one comes back), are kept in small files.
const recordsFile = path.join(path.dirname(cfgFile), 'party-records.json');
const liarFile = path.join(path.dirname(cfgFile), 'liar-words-used.json');
const readJson = (file, empty) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return empty; } };
// 📦 The pet shows what changed after an update; the notes come with the program, and an update restarts it.
const patchNotes = readJson(path.join(ROOT, 'server', 'patch-notes.json'), []);
const parties = isHub ? new Parties({
  records: readJson(recordsFile, {}),
  liarUsed: readJson(liarFile, []),
  onEnd: (g) => {
    const names = g.players.map((p) => p.name).join('·');
    const line = g.kind === 'stack'
      ? `🏗 ${names} 팀이 ${g.height}층까지 쌓았어요!${g.record ? ' 🏆 층 신기록!' : ''} (${g.how})`
      : g.kind === 'bomb' ? `💣 ${g.how} (던진 횟수 ${g.throws})`
        : g.kind === 'words' ? `🔤 ${g.how}`
          : !g.word ? g.how : `${g.how} — 제시어 「${g.word}」${g.kind === 'fool' ? `, 라이어가 받은 말 「${g.decoy}」` : ''}`;
    try { team.say(`party@${g.floor}`, g.floor, KINDS[g.kind], line); } catch {}
    if (g.kind === 'stack') try { fs.writeFileSync(recordsFile, JSON.stringify(parties.records)); } catch {}
    if (g.kind === 'liar' || g.kind === 'fool') try { fs.writeFileSync(liarFile, JSON.stringify(parties.liarUsed)); } catch {}
    broadcast();
  },
}) : null;
// 🏆 기록 도전 (server/records.js): each person's best per floor and game, kept in a file.
const boardFile = path.join(path.dirname(cfgFile), 'record-board.json');
const records = isHub ? new Records({ best: readJson(boardFile, {}) }) : null;
// 🎣 낚시 (server/fish.js): the bites and catches, and everyone's picture book per floor, kept in a file.
const fishFile = path.join(path.dirname(cfgFile), 'fish-dex.json');
const fishing = isHub ? new Fishing({ dex: readJson(fishFile, {}) }) : null;
const topicsFile = path.join(path.dirname(cfgFile), 'relay-topics.json');
const relays = isHub ? new Relays({
  used: (() => { try { return JSON.parse(fs.readFileSync(topicsFile, 'utf8')); } catch { return []; } })(),
  onEnd: (g) => {
    try { fs.writeFileSync(topicsFile, JSON.stringify([...relays.used])); } catch {}
    const names = g.players.map((p) => p.name).join('·');
    const score = () => g.players.map((p, i) => `${p.name} ${g.scores[i]}`).join(' · ');
    const line = g.mode === 'catch'
      ? `🖍 ${g.stoppedBy ? `${g.stoppedBy} 님이 그만했어요` : g.winners.length ? `${g.winners.join('·')} 님 1등!` : '아무도 못 맞혔어요'} (${score()})`
      : g.stoppedBy ? `🎨 ${g.stoppedBy} 님이 이어 그리기를 그만했어요 (주제는 "${g.topic}")`
        : `🎨 ${names} 팀이 ${g.results.length}문제 중 ${g.score}개 맞혔어요${g.score === g.results.length ? '! 🎉' : g.score ? '!' : ' 😂'} (${g.results.map((r) => `${r.topic} ${r.correct ? '⭕' : `❌→"${r.answer || '…'}"`}`).join(' · ')})`;
    try { team.say(`relay@${g.floor}`, g.floor, g.mode === 'catch' ? '🖍 캐치마인드' : '🎨 이어 그리기', line); } catch {}
    broadcast();
  },
}) : null;
// ⚔️ 대결 (server/duel.js): the hub keeps and decides every game; how it ended is said
// on that floor in one line.
const smacks = isHub ? new Smacks() : null;
const duels = isHub ? new Duels({
  onEnd: (d) => {
    const w = d.win && d[d.win], l = d.win && d[d.win === 'a' ? 'b' : 'a'];
    const line = w ? `🏆 ${w.name} 님이 ${l.name} 님과의 ${GAMES[d.game]}에서 이겼어요! (${d.how})` : `🤝 ${d.a.name} 님과 ${d.b.name} 님의 ${GAMES[d.game]}는 비겼어요 (${d.how})`;
    try { team.say(`duel@${d.floor}`, d.floor, '⚔️ 대결', line); } catch {}
    broadcast();
  },
}) : null;
// The admin's status board, kept next to the settings so a restart does not forget who was here.
const seenFile = path.join(path.dirname(cfgFile), 'roster.json');
if (team) {
  try { team.importSeen(JSON.parse(fs.readFileSync(seenFile, 'utf8'))); } catch {}
  let last = '';
  setInterval(() => {
    const now = JSON.stringify(team.exportSeen());
    if (now !== last) { last = now; try { fs.writeFileSync(seenFile, now); } catch {} }
  }, 30_000).unref();
}
// The desktop pet (server/pet.js): its window, and how often I was poked, which it counts to flinch.
const petWindow = new PetWindow({ port: cfg.port, log: console.log });
let petPokes = 0;
// How often someone called me by name (@이름): the pet jumps and shakes, without the poke bubble.
let petCalls = 0;

const person = new Me({ id: cfg.user.id, name: cfg.user.name });

// Server-sent events: one snapshot per change, coalesced. Each client gets the
// view its access allows (the owner on this PC sees everything).
const clients = new Map(); // res -> viewer ('owner' | 'admin' | 'floor:<name>')
let broadcastSoon = null;
function broadcast() {
  if (broadcastSoon) return;
  broadcastSoon = setTimeout(() => {
    broadcastSoon = null;
    hearMentions(team ? team.chat : [...linkTeam.values()].flatMap((s) => s.chat || []));
    const cache = {};
    for (const [res, viewer] of clients) {
      cache[viewer] ??= `data: ${JSON.stringify(snapshotFor(viewer))}\n\n`;
      res.write(cache[viewer]);
    }
  }, 150);
}
person.on('change', broadcast);

// Called by name in a floor's talk (@이름): a desktop alert, and my pet flinches as
// when poked. "@hana" reaches "hana (admin)" too: the first word of a name is enough.
// Lines said before this program started are old news.
const heardLines = new Set();
const startedAt = Date.now();
const callsMe = (text) => calls(text, cfg.user.name);
function hearMentions(lines) {
  for (const m of lines) {
    const id = `${m.floor}|${m.id}`;
    if (heardLines.has(id)) continue;
    heardLines.add(id);
    if (m.at < startedAt || String(m.key || '').startsWith(`${cfg.user.id}@`) || !callsMe(m.text)) continue;
    petCalls += 1;
    const title = CALL_ALL.test(m.text) ? `📢 ${m.name} 님이 모두를 불렀어요` : `💬 ${m.name} 님이 불렀어요`;
    toast(title, `${m.floor} 층: ${m.text}`.slice(0, 120), { open: `http://localhost:${cfg.port}/#${encodeURIComponent(m.floor)}` });
  }
  if (heardLines.size > 2000) for (const id of [...heardLines].slice(0, 1000)) heardLines.delete(id);
}
setInterval(() => { for (const res of clients.keys()) res.write(': ping\n\n'); }, 20_000);
// Remote users expire on read; refresh viewers so a PC that went away leaves.
if (team) setInterval(broadcast, 15_000);

// The floor the hub's owner is on: one at a time, as a member is in one room. The one marked
// joined, else the first not marked off. On floors they only run for another team they get a
// head count, not people.
// The floor I stand on: the joined one; with none marked, the first not stepped off — unless I
// stand in another PC's room (pushLinks), then none.
const currentFloor = () => cfg.floors.find((f) => f.joined === true) || (pushLinks.length ? null : cfg.floors.find((f) => f.joined !== false)) || null;
const joined = (f) => f === currentFloor();
// This PC's own page: the server says so with a room name (it holds no AI sessions here; the
// page uses it to know it is at home, with my pet and my floors).
const ROOM = '🏠 내 방';

// The people on the hub's team floors: everyone whose collector is pushing,
// and the hub's owner on the floors they work on. No activity: a team floor
// shows who is here, what they said about themselves, and where they stand.
function hubPeople() {
  const list = team.people(() => null);
  if (!cfg.me.hidden) {
    const status = cleanStatus(cfg.me.status);
    for (const f of cfg.floors.filter(joined)) {
      list.push({
        key: `${cfg.user.id}@${f.name}`, userId: cfg.user.id, name: cfg.user.name, status, note: status ? cleanNote(cfg.me.note) : '', avatar: cleanAvatar(cfg.me.avatar), pet: cfg.pet.kind, noSmack: cfg.pet.smackOff === true,
        work: '', floor: f.name, agents: [], at: Date.now(),
      });
    }
  }
  return list.map((p) => {
    return {
      id: `person:${p.key}`, key: p.key, kind: 'person', userId: p.userId, name: p.name, userName: p.name,
      status: p.status, note: p.note, floor: p.floor, source: '', project: '', projects: [], course: '',
      pos: team.positions.get(p.key) || null,
      avatar: p.avatar ?? null,
      pet: p.pet || null,
      emote: team.emotes.get(p.key) || null,
      act: team.acts.get(p.key) || null,
      // 🎣 A line in the water: a rod in their hand on every screen.
      fishing: !!fishing?.fishing(p.key),
      // …and which rod (도감 낚싯대 step), drawn the same everywhere.
      rod: fishing ? fishing.rod(p.floor, p.userId).step : 0,
      work: '',
      guest: !!p.guest,
      hit: team.hits.get(p.key) || null,
      activity: 'present', detail: '', since: p.at, lastEventAt: p.at, history: [],
      pokeable: p.status !== 'focus',
      // 🦶 날려버리기: may be sent flying (unless they said no in their pet ⚙️; focusing does not stop it).
      smackable: !p.noSmack,
    };
  });
}

// What each push link's hub shows of its floor, for this PC's own page.
const linkTeam = new Map(); // push link -> the hub's last snapshot for that floor

function snapshotFor(viewer) {
  const snap = person.snapshot();
  const owner = viewer === 'owner';
  let people = [];
  let floors = [];
  let chat = [];
  const notJoined = {};
  if (team) {
    const live = new Set(cfg.floors.map((f) => f.name));
    people = hubPeople().filter((p) => live.has(p.floor));
    if (viewer.startsWith('floor:')) {
      floors = [viewer.slice(6)];
      people = people.filter((p) => p.floor === floors[0]);
    } else if (viewer === 'admin') {
      // The admin key (the floor directory, from another PC) sees every floor.
      floors = cfg.floors.map((f) => f.name);
    } else {
      // My own page and pet see every room of mine, people and talk alike (the pet stands in one,
      // currentFloor, and keeps the others as chat tabs).
      floors = cfg.floors.map((f) => f.name);
    }
    chat = team.chatOn(floors);
  }
  if (owner || !team) {
    // My own page: the other PC's room I stand in comes from its hub's live stream.
    for (const link of pushLinks) {
      const s = linkTeam.get(link);
      if (!s) continue;
      floors.push(...(s.floors || []));
      people.push(...(s.people || []));
      chat.push(...(s.chat || []));
    }
  }
  // On my own page I never poke myself; the keys move "me". (Others see the hub's owner as anyone else.)
  if (owner) people = people.map((p) => (p.userId === cfg.user.id ? { ...p, pokeable: false } : p));
  const self = owner ? floors.map((f) => `person:${cfg.user.id}@${f}`) : [];
  const hubs = owner ? pushLinks.map((l) => ({ name: l.name || '', url: l.hubUrl, ...(linkState.get(l) || {}) })) : [];
  return {
    user: snap.user, now: snap.now, agents: [], people, floors, notJoined, self, hubs, chat,
    room: owner ? ROOM : null,
    // My notes (쪽지), on my own page only.
    notes: owner ? myNotes.map((n) => ({ ...n, img: n.img ? `api/note-img?id=${encodeURIComponent(n.id)}` : null })) : [],
    me: owner && (team || pushLinks.length) ? cfg.me : null,
    team: !!team || pushLinks.length > 0,
  };
}

const LOOPBACK_ADDR = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Who is asking: 'owner' (this PC), 'admin' or 'floor:<name>' (another PC's team pet holding
// that key in a header, hub only), or nobody. There is no page for other PCs' browsers.
function viewerOf(req) {
  if (LOOPBACK_ADDR.has(req.socket.remoteAddress) && hostIsSelf(req) && !req.headers['x-team-key']) return 'owner';
  if (!team) return null;
  return accessFor(req.headers['x-team-key']);
}

// A request made on someone's page. From a browser it must come from this page
// with a JSON body; a collector's relay carries the key in a header, which no
// other site can send.
async function pageRequest(req, res) {
  if (req.method !== 'POST') { req.resume(); json(res, 405, { error: 'use POST' }); return null; }
  if (!req.headers['x-team-key'] && !fromOwnPage(req)) { req.resume(); json(res, 403, { error: '팀 펫 화면에서만 할 수 있어요' }); return null; }
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) { req.resume(); json(res, 415, { error: 'send JSON' }); return null; }
  try { return (await readJsonBody(req)) || {}; } catch (e) { fail(res, e); return null; }
}

// My floors, on a member's own page: GET lists them (no keys) and this PC's project
// folders to pick from; POST { code, name? } joins a floor with a join code from my admin
// (or a pasted link), POST { leave: i } leaves floor i, POST { share: i, projects } sets
// which of my projects floor i sees. A new floor starts as "person only".
const linkList = () => rooms.map((l, i) => ({ i, name: l.name || '', url: l.hubUrl, current: l === pushLinks[0], ...(linkState.get(l) || {}) }));
// A pasted share link (http://office/?key=…) instead of a code.
// An invite link (http://hub/?code=…) carries the hub's address and a room's join code; an older
// share link (?key=…) the room's key itself.
function linkFrom(text) {
  try {
    const u = new URL(String(text).trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    const hubUrl = `${u.protocol}//${u.host}`;
    const key = u.searchParams.get('key');
    const code = cleanJoinCode(u.searchParams.get('code') || '');
    return key ? { hubUrl, key } : code.length >= 4 ? { hubUrl, code } : null;
  } catch { return null; }
}
async function floorOfLink({ hubUrl, key }) {
  try {
    const res = await fetch(new URL('api/link-info', hubUrl + '/'), { headers: { 'x-team-key': key }, signal: AbortSignal.timeout(5000) });
    if (res.status === 401) return { status: 401, error: '이 링크는 허브가 받지 않습니다(키가 틀렸거나 층이 삭제됨). 관리자에게 새 링크를 받아 주세요' };
    const body = await res.json();
    return { floor: body.admin ? '관리자(전 층)' : body.floor, key };
  } catch (e) {
    return { status: 0, error: `허브에 연결되지 않습니다 (${e.cause?.code || e.message})` };
  }
}
// The code's office: the ones I know first, then any office answering on my network.
// A bare code goes only to hubs this PC already knows: the ones it is on, and the one its
// installer was made on. It never looks around the office network for one.
async function redeemKnown(code) {
  const hubs = [...new Set([...rooms.map((l) => l.hubUrl), ...(BUILT_FOR ? [BUILT_FOR] : [])])];
  if (!hubs.length) return { status: 404, error: '참가 코드만으로는 방장 PC 를 알 수 없어요. 방장에게 받은 참가 링크(http://…/?code=…)를 통째로 붙여 넣어 주세요' };
  let why = null;
  for (const hubUrl of hubs) {
    const got = await redeemCode(hubUrl, code);
    if (got.key) return { hubUrl, ...got };
    if (!why || why.status === 404) why = got;
  }
  return why;
}
// The rooms I know and where I stand, into the settings (team.key stays: it is the admin key of my
// own rooms; the old single hubUrl form is replaced by the list).
function saveLinks() {
  const { hubUrl, ...rest } = cfg.team;
  cfg.team = { ...rest, links: rooms, current: pushLinks.length ? rooms.indexOf(pushLinks[0]) : null };
  saveConfig(cfgFile, cfg);
}
// Say goodbye to a room's hub first, so the floor drops me now rather than after a minute.
async function goodbye(link) {
  const user = { ...person.snapshot().user, hidden: true };
  await fetch(new URL('api/push', link.hubUrl.endsWith('/') ? link.hubUrl : link.hubUrl + '/'), {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-team-key': link.key }, body: JSON.stringify({ user, agents: [] }), signal: AbortSignal.timeout(4000),
  }).catch(() => {});
}
// 🚪 방 이동: out of the room I am in, into another PC's room I know (link), or onto a floor of my
// own (null: the joined one, else the first) — or into none, after leaving the last.
async function switchTo(link) {
  for (const old of pushLinks.splice(0)) { await goodbye(old); linkStops.get(old)?.(); linkStops.delete(old); }
  if (link) { pushLinks.push(link); connect(link); keepUpdated(); for (const f of cfg.floors) f.joined = false; }
  else if (cfg.floors.length && !cfg.floors.some((f) => f.joined === true)) cfg.floors[0].joined = true;
  saveLinks();
  broadcast();
}
// A room its hub no longer has (the owner deleted it: the key is refused): out of my list, and the
// pet is told for a minute so it can show the room coming down.
const lost = [];
function roomGone(link) {
  if (!rooms.includes(link)) return;
  rooms.splice(rooms.indexOf(link), 1);
  lost.push({ name: link.name || '', at: Date.now() });
  console.log(`room gone: ${link.name || link.hubUrl} no longer takes my key`);
  if (link === pushLinks[0]) switchTo(rooms[0]); else { saveLinks(); broadcast(); }
}
async function handleLinks(req, res, viewer) {
  if (viewer !== 'owner') { req.resume(); return json(res, 403, { error: '내 화면에서만 쓸 수 있습니다' }); }
  if (req.method === 'GET') return json(res, 200, { links: linkList(), name: cfg.user.name });
  const body = await pageRequest(req, res);
  if (!body) return;
  if ('leave' in body) {
    const link = rooms[Number(body.leave)];
    if (!link) return json(res, 404, { error: '없는 방입니다' });
    // Out of the room I am in: into the next one I know, or, after the last, back to the first run.
    rooms.splice(rooms.indexOf(link), 1);
    if (link === pushLinks[0]) await switchTo(rooms[0]);
    else saveLinks();
    broadcast();
    return json(res, 200, { links: linkList(), left: link.name || '' });
  }
  // 🚪 방 이동 to a room I already know.
  if ('switch' in body) {
    const link = rooms[Number(body.switch)];
    if (!link) return json(res, 404, { error: '없는 방입니다' });
    if (link !== pushLinks[0]) await switchTo(link);
    return json(res, 200, { links: linkList(), moved: link.name || '' });
  }
  // The first time, the page also asks for the name the office shows.
  if (typeof body.name === 'string' && body.name.trim()) {
    cfg.user = { ...cfg.user, name: body.name.trim().slice(0, 30) };
    person.rename(cfg.user.name);
  }
  const pasted = linkFrom(body.code);
  const code = cleanJoinCode(body.code);
  if (!pasted && code.length < 4) return json(res, 400, { error: '참가 코드를 적어 주세요' });
  const got = pasted?.key ? { hubUrl: pasted.hubUrl, ...(await floorOfLink(pasted)) }
    : pasted ? { hubUrl: pasted.hubUrl, ...(await redeemCode(pasted.hubUrl, pasted.code)) } : await redeemKnown(code);
  if (!got.key) {
    saveConfig(cfgFile, cfg);
    return json(res, got.status === 0 ? 502 : got.status || 400, { error: got.error });
  }
  // My own room's invite: just stand there (never a link to myself).
  const mine = team && cfg.floors.find((f) => f.key === got.key);
  if (mine) {
    if (joined(mine)) { saveConfig(cfgFile, cfg); return json(res, 409, { error: `이미 "${mine.name}" 방에 들어가 있습니다` }); }
    for (const x of cfg.floors) x.joined = x === mine;
    await switchTo(null);
    return json(res, 200, { links: linkList(), joined: mine.name });
  }
  const known = rooms.find((l) => l.hubUrl === got.hubUrl && l.key === got.key);
  if (known && known === pushLinks[0]) {
    saveConfig(cfgFile, cfg);
    person.changed();
    return json(res, 409, { error: `이미 "${got.floor}" 방에 들어가 있습니다` });
  }
  // One room at a time: the new room takes the place of the one I was in (its hub is told now).
  const link = known || { hubUrl: got.hubUrl, key: got.key, name: got.floor || '' };
  const prev = pushLinks[0] && pushLinks[0] !== link ? pushLinks[0] : null;
  for (const old of rooms.filter((l) => l !== link)) rooms.splice(rooms.indexOf(old), 1);
  if (!known) rooms.push(link);
  await switchTo(link);
  // Start with Windows from now on: a member who joined from the page never ran setup.
  if (process.platform === 'win32' && !process.env.TEAM_PET_CONFIG && !demo) autostartOn('collector');
  broadcast();
  return json(res, 200, { links: linkList(), joined: link.name, ...(prev ? { left: prev.name || '' } : {}) });
}

// The push link that holds a team floor, on a collector's own page.
const linkForFloor = (floor) => pushLinks.find((l) => (linkTeam.get(l)?.floors || []).includes(floor));
const floorOfPerson = (id) => String(id || '').replace(/^person:/, '').split('@').slice(1).join('@');

// A collector passes a move or a poke from its own page on to the hub of that floor.
async function relay(res, floor, apiPath, body) {
  const link = linkForFloor(floor);
  if (!link) return json(res, 404, { error: '연결된 층이 아닙니다' });
  try {
    const r = await askHub({ url: link.hubUrl, key: link.key, path: apiPath, body });
    json(res, r.status, r.body);
    return r.status === 200;
  } catch {
    json(res, 502, { error: '팀 펫에 연결되지 않습니다' });
    return false;
  }
}

// Something I do as my person on a team floor: move, react, say something.
// On a collector it is relayed to that floor's hub; on the hub it lands on the
// person who did it: the owner here, or the user a collector names with its key.
// done(body, args): after it worked for the person at this PC (a note keeps its sent copy).
function personAction(apiPath, fields, apply, done = null) {
  return async (req, res, viewer) => {
    const body = await pageRequest(req, res);
    if (!body) return;
    const args = Object.fromEntries(fields.map((f) => [f, body[f]]));
    // Another PC's room: on to its hub (relay says 404 for a room I do not know).
    if (viewer === 'owner' && !cfg.floors.some((f) => f.name === body.floor)) {
      if (await relay(res, body.floor, apiPath, { user: cfg.user.id, ...args })) done?.(body, args);
      return;
    }
    if (!team) return json(res, 403, { error: 'only on this PC' });
    let key, floor, name;
    if (viewer === 'owner') {
      floor = body.floor;
      key = `${cfg.user.id}@${floor}`;
      name = cfg.user.name;
    } else if (req.headers['x-team-key'] && viewer.startsWith('floor:')) {
      // A collector acts for its own person, on the floor its key opens.
      const user = typeof body.user === 'string' ? body.user.slice(0, 60) : '';
      if (!user) return json(res, 400, { error: 'user is required' });
      floor = viewer.slice(6);
      key = `${user}@${floor}`;
      name = team.users.get(key)?.name || team.users.get(user)?.name || user;
    } else {
      return json(res, 403, { error: '팀 펫을 설치한 PC 에서만 할 수 있습니다' });
    }
    // apply may answer with something of its own (a game's state); otherwise { ok: true }.
    // A plain look (quiet) changes nothing, so it does not wake every page.
    let out;
    try { out = apply({ key, floor, name }, args); } catch (e) { return fail(res, e); }
    if (viewer === 'owner') done?.(body, args);
    if (!out?.quiet) broadcast();
    if (out) delete out.quiet;
    return json(res, 200, out ?? { ok: true });
  };
}

// ✉️ 쪽지 (TeamHub.note): to one person on the floor I am on. What I sent and what came to
// me stay on my own PC only (myNotes, for my page and my pet); a note's picture is kept
// apart and served from here, so the page's snapshots stay small.
const myNotes = []; // { id, dir: 'in' | 'out', who, name, floor, text, img, at }, newest last
const noteImgs = new Map(); // note id -> data URL
function keepNote(n) {
  if (n.img) { noteImgs.set(n.id, n.img); n = { ...n, img: true }; }
  myNotes.push(n);
  for (const old of myNotes.splice(0, Math.max(0, myNotes.length - 50))) noteImgs.delete(old.id);
  broadcast();
}
function gotNotes(list) {
  for (const n of list) {
    keepNote({ id: `in:${n.id}:${n.at}`, dir: 'in', who: n.from, name: n.name, floor: n.floor, text: n.text, img: n.img || null, at: n.at });
    petCalls += 1;
    toast(`✉️ ${n.name} 님의 쪽지`, (n.text || '(사진)').slice(0, 120), { open: `http://localhost:${cfg.port}/#${encodeURIComponent(n.floor)}` });
  }
}
// ⚔️ 대결: op 'state' (my game, if any), 'invite' { to, game }, 'accept' | 'decline' { id },
// 'move' { id, move }, 'leave' { id }. Always answers with my view of my game.
const handleDuel = personAction('api/duel', ['op', 'game', 'to', 'id', 'move'], ({ key, floor, name }, a) => {
  const me = key.slice(0, key.lastIndexOf('@'));
  if (a.op === 'invite') {
    const to = hubPeople().find((p) => p.userId === String(a.to || '') && p.floor === floor);
    if (!to) throw Object.assign(new Error('그 사람은 지금 이 층에 없습니다'), { status: 404 });
    duels.invite({ id: me, name, floor }, { id: to.userId, name: to.name }, a.game);
  } else if (a.op === 'accept' || a.op === 'decline') duels.answer(me, a.id, a.op === 'accept');
  else if (a.op === 'move') duels.move(me, a.id, a.move);
  else if (a.op === 'leave') duels.leave(me, a.id);
  else return { duel: duels.view(me), quiet: true };
  return { duel: duels.view(me) };
});

// 🎨 이어 그리기: op 'state', 'open', 'join', 'leave', 'start', 'stroke' { stroke },
// 'pass' (done drawing), 'guess' { text }. Answers with my view of the floor's game.
// 🏆 기록 도전: op 'board' (the floor's top three of each game, and my bests), or 'submit'
// { game, ms } — a new first place is said on the floor in one line.
const handleRecord = personAction('api/record', ['op', 'game', 'ms'], ({ key, floor, name }, a) => {
  const me = key.slice(0, key.lastIndexOf('@'));
  if (a.op !== 'submit') return { board: records.board(floor, me), quiet: true };
  const result = records.submit(floor, { id: me, name }, a.game, a.ms);
  if (result.best) try { fs.writeFileSync(boardFile, JSON.stringify(records.best)); } catch {}
  if (result.first) {
    const was = result.first.from ? ` (${result.first.from.name} 님 ${result.first.from.text} 경신)` : '';
    try { team.say(`record@${floor}`, floor, '🏆 기록 도전', `${RECORD_GAMES[a.game].title} ${name} 님 1등! ${result.text}${was}`); } catch {}
  }
  return { board: records.board(floor, me), result, quiet: !result.first };
});

// 🦶 날려버리기 { to, how: 'kick' | 'hammer' }: someone on my floor flies off into the sky and
// drops back (server/smack.js keeps it from piling up). Said on the floor with the show's data,
// so every pet and page plays it over the two of them.
const SMACK_SAY = { kick: ['🦶', '뻥! 날려버렸어요'], hammer: ['🔨', '뿅망치로 날려버렸어요'] };
const SHOT_SAY = {
  swish: (n) => `🏀 골! ${n} 님을 골대에 쏙 넣었어요!`,
  'rim-in': (n) => `🏀 링 맞고 골! ${n} 님이 통 튀어서 들어갔어요!`,
  'bank-in': (n) => `🏀 백보드 맞고 골! ${n} 님이 쿵 하고 들어갔어요!`,
  'rim-out': (n) => `🏀 아깝다! ${n} 님이 링 맞고 튕겨 나왔어요`,
  'bank-out': (n) => `🏀 아깝다! ${n} 님이 백보드 맞고 튕겨 나왔어요`,
  ace: (n) => `⛳ 홀인원! ${n} 님이 홀컵에 쏙 들어갔어요!`,
  'roll-in': (n) => `⛳ 굴러서 홀인! ${n} 님이 데굴데굴 들어갔어요!`,
  'roll-short': (n) => `⛳ 아깝다! ${n} 님이 홀컵 바로 앞에서 멈췄어요`,
  'lip-out': (n) => `⛳ 아깝다! ${n} 님이 홀컵을 덜컹 넘어갔어요`,
};
function smackBusy(floor, to, p) {
  if (p.noSmack) return '날려버리기를 안 받는 사람이에요';
  if (fishing.fishing(p.key)) return '낚시하는 중이에요';
  const c = fishing.contestView(floor, to);
  if (c?.joined && c.phase === 'on') return '낚시대회 중이에요';
  const g = parties.get(floor);
  if (g && g.phase === 'play' && g.players.some((x) => x.id === to)) return '같이 하기 게임 중이에요';
  const r = relays.get(floor);
  if (r && !['lobby', 'done'].includes(r.phase) && r.players.some((x) => x.id === to)) return '그림 게임 중이에요';
  const d = duels.of(to);
  if (d && d.phase === 'play') return '1:1 대결 중이에요';
  return '';
}
// op 'aim' (I start aiming: the floor waits for me), 'cancel' (I stopped), or 'hit' { angle, power }
// (no op: an older program, hitting at once).
const handleSmack = personAction('api/smack', ['op', 'to', 'how', 'angle', 'power', 'hoop'], ({ key, floor, name }, a) => {
  const me = key.slice(0, key.lastIndexOf('@'));
  if (a.op === 'cancel') { smacks.cancel(floor, me); return { ok: true, quiet: true }; }
  const to = String(a.to || '');
  const p = hubPeople().find((x) => x.userId === to && x.floor === floor);
  if (!p) throw Object.assign(new Error('그 사람은 지금 이 층에 없습니다'), { status: 404 });
  const how = String(a.how || '');
  // 🏀 a hoop or ⛳ a hole, every time, for a program that can draw them (it asks with hoop: true;
  // a program that knows only hoops is told only of a hoop).
  if (a.op === 'aim') {
    const target = a.hoop === true && Math.random() < HOOP_CHANCE ? newTarget() : null;
    smacks.aim(floor, me, to, how, smackBusy(floor, to, p), target);
    return { ok: true, quiet: true, ...(target ? { [target.kind]: target } : {}) };
  }
  const { hoop: target } = smacks.hit(floor, me, to, how, smackBusy(floor, to, p));
  const golf = target?.kind === 'golf' ? target : null, hoop = target && !golf ? target : null;
  const [mark, said] = SMACK_SAY[how], aim = cleanAim(a.angle, a.power), space = isSpace(aim);
  const shot = golf ? golfShot(aim, golf) : shotAt(aim, hoop), goal = isGoalShot(shot);
  const at = !shot ? {} : golf ? golfDetail(aim, golf) : shotDetail(aim, hoop);
  const text = space ? `🚀 ${p.name} 님을 우주까지 날려버렸어요!` : SHOT_SAY[shot] ? SHOT_SAY[shot](p.name) : `${mark} ${p.name} 님을 ${said}!`;
  team.shout(key, floor, name, text, 'smack', { to, how, name: p.name, floor, ...aim, ...(space ? { space } : {}), ...(hoop ? { hoop, goal, shot, ...at } : {}), ...(golf ? { golf, goal, shot, ...at } : {}) }, 'fish');
  // The one who hit it plays the shot the hub picked, as everyone else will.
  return { ok: true, ...(target ? { shot, goal, ...at } : {}) };
});

// ❄️ 눈덩이: { to, hit } — thrown at someone on my floor. The thrower's pet times it (a snowflake
// running over a bar; hit: let go in its blue part): a hit turns their pet into its snowman for a
// few seconds on every screen of the floor, a miss lands at their feet. No one can turn it off;
// one throw per person every SNOWBALL_GAP_MS keeps a flurry of clicks from burying the row.
const SNOWBALL_GAP_MS = 3_000;
const snowballAt = new Map(); // "userId@floor" -> when they last threw
// A hit can still be dodged: the hub says 'aim' first, the one aimed at sees it coming on their
// own PC (a ❗ and a ring closing in), clicks their pet just before it lands and says how it went
// (op 'end'); then the hub says 'end' to everyone. Their PC judges it, since each screen gets the
// news a little apart. No answer by SNOWBALL_WAIT_MS (pet off, hidden): it hit.
const SNOWBALL_WARN_MS = 1_000, SNOWBALL_FLY_MS = 350, SNOWBALL_WAIT_MS = 8_000;
const snowFlying = new Map(); // id -> { key, name, floor, to, toName, timer }
let snowSeq = 0;
function snowballLands(id, dodged) {
  const s = snowFlying.get(id);
  if (!s) return;
  snowFlying.delete(id);
  clearTimeout(s.timer);
  team.shout(s.key, s.floor, s.name, dodged ? `💨 ${s.toName} 님이 눈덩이를 피했어요!` : `❄️ 명중! ${s.toName} 님이 눈사람이 됐어요`, 'snowball', { to: s.to, name: s.toName, floor: s.floor, hit: !dodged, dodged, phase: 'end', id }, 'fish');
  broadcast();
}
const handleSnowball = personAction('api/snowball', ['to', 'hit', 'op', 'id', 'dodged'], ({ key, floor, name }, a) => {
  if (a.op === 'end') {
    const s = snowFlying.get(String(a.id || ''));
    if (!s || s.floor !== floor) return { ok: true, quiet: true };
    if (key.slice(0, key.lastIndexOf('@')) !== s.to) throw Object.assign(new Error('맞는 사람만 알릴 수 있어요'), { status: 403 });
    snowballLands(String(a.id), a.dodged === true);
    return { ok: true, quiet: true };
  }
  const to = String(a.to || '');
  const p = hubPeople().find((x) => x.userId === to && x.floor === floor);
  if (!p) throw Object.assign(new Error('그 사람은 지금 이 층에 없습니다'), { status: 404 });
  const last = snowballAt.get(key) ?? -Infinity;
  if (Date.now() - last < SNOWBALL_GAP_MS) throw Object.assign(new Error('눈덩이 뭉치는 중이에요'), { status: 429 });
  snowballAt.set(key, Date.now());
  if (a.hit !== true) {
    team.shout(key, floor, name, `❄️ ${p.name} 님에게 던졌지만 빗나갔어요`, 'snowball', { to, name: p.name, floor, hit: false }, 'fish');
    return { ok: true };
  }
  const id = `${Date.now().toString(36)}${++snowSeq}`;
  snowFlying.set(id, { key, name, floor, to, toName: p.name, timer: setTimeout(() => snowballLands(id, false), SNOWBALL_WAIT_MS) });
  team.shout(key, floor, name, `❄️ ${p.name} 님에게 눈덩이를 던졌어요!`, 'snowball', { to, name: p.name, floor, hit: true, phase: 'aim', id, warn: SNOWBALL_WARN_MS, fly: SNOWBALL_FLY_MS }, 'fish');
  return { ok: true };
});

// 🎣 낚시: op 'cast' (the bite comes in biteIn ms), 'hook' (the click on the bite: on the hook, the
// fight's zone and sweep), 'land' { hit } (the fight's click), 'stop', or 'book' (my picture book on
// the floor and its top three), or 'brag' { id } (🏆 show off one from my book: up on a stage
// with it, on every screen of the floor). A rare catch is said on the floor, over the one who caught it.
// 🏁 낚시대회: 'contest' (the floor's contest as I see it), 'contest-open' | 'contest-join' |
// 'contest-leave' | 'contest-start'; the clock moves it on (contestClock).
const handleFish = personAction('api/fish', ['op', 'hit', 'id', 'late', 'ms', 'presses'], ({ key, floor, name }, a) => {
  const me = key.slice(0, key.lastIndexOf('@'));
  if (a.op === 'cast') return { ...fishing.cast(key), rod: fishing.rod(floor, me).step };
  if (a.op === 'stop') { fishing.stop(key); return { ok: true }; }
  if (a.op === 'hook') return fishing.hook(floor, key, a.late === true, a.ms, { name, presses: a.presses });
  if (a.op === 'contest') return { contest: fishing.contestView(floor, me), quiet: true };
  if (a.op === 'contest-open') {
    fishing.contestOpen(floor, { id: me, name });
    try { team.say(`contest@${floor}`, floor, '🏁 낚시대회', `${name} 님이 낚시대회를 열었어요! 30초 안에 참가 → 2분 동안 5번씩, 가장 귀한 물고기(같은 등급이면 더 큰 것)가 1등`); } catch {}
  } else if (a.op === 'contest-join') fishing.contestJoin(floor, { id: me, name });
  else if (a.op === 'contest-leave') fishing.contestLeave(floor, me);
  else if (a.op === 'contest-start') { fishing.contestStart(floor, me); contestSaid(floor, 'started'); }
  if (a.op.startsWith('contest-')) return { contest: fishing.contestView(floor, me) };
  if (a.op === 'brag') {
    const f = fishing.brag(floor, key, a.id);
    const how = [f.size, f.record ? '🏆 층 최대어' : '', f.n > 1 ? `${f.n}마리째` : ''].filter(Boolean).join(' · ');
    team.shout(key, floor, name, `🏆 ${f.mark ? f.mark + ' ' : ''}${f.name} 자랑해요!${how ? ` (${how})` : ''}`, 'brag',
      { id: f.id, rarity: f.rarity, name: f.name, size: f.size, color: f.color, mark: f.mark, record: f.record }, 'fish');
    return { ok: true };
  }
  // ⚒️ 강화: one try at the next rod. A success or a break is said on the floor; a fail is mine alone.
  if (a.op === 'enhance') {
    const r = fishing.enhance(floor, me);
    try { fs.writeFileSync(fishFile, JSON.stringify(fishing.dex)); } catch {}
    if (r.result === 'success') team.shout(key, floor, name, `⚒️ 낚싯대 강화 성공! ${r.from} → ${r.to}`);
    if (r.result === 'break') team.shout(key, floor, name, r.zero ? `☠️ 완전 파괴… 낚싯대가 처음으로 돌아갔어요 ${r.from} → ${r.to}` : r.drop === 2 ? `💥💥 대파괴! 낚싯대가 두 단계나… ${r.from} → ${r.to}` : `💥 낚싯대가 깨졌어요… ${r.from} → ${r.to}`);
    return r;
  }
  if (a.op === 'rodbrag') {
    const r = fishing.rodBrag(floor, key);
    team.shout(key, floor, name, `🎣 낚싯대 자랑해요! ${r.name} (도감 ${r.kinds}종${r.up ? ` · 드문 물고기 +${r.up}%` : ''})`, 'brag',
      { rod: r.step, name: r.name, kinds: r.kinds }, 'fish');
    return { ok: true };
  }
  if (a.op !== 'land') return { book: fishing.book(floor, me), quiet: true };
  const out = fishing.land(floor, { id: me, name }, key, a.hit === true);
  if (out.fish) {
    if (!out.contest) try { fs.writeFileSync(fishFile, JSON.stringify(fishing.dex)); } catch {}
    const f = out.fish;
    if (['rare', 'epic', 'legend'].includes(f.rarity)) {
      const was = out.record?.from ? ` (${out.record.from.name} 님 ${out.record.from.size} 기록 경신)` : '';
      team.shout(key, floor, name, `🎣 ${f.mark} ${f.name} ${f.size} 낚았어요!${was}`, 'fish', { id: f.id, rarity: f.rarity, name: f.name, size: f.size, cm: f.cm, color: f.color, mark: f.mark });
    }
  }
  return out;
});
// The floor hears a contest start, and its end: the top three in one line, then each of them up
// on the podium with their best catch (the brag stage, in gold, silver and bronze).
const MEDALS = ['🥇', '🥈', '🥉'];
function contestSaid(floor, what, top = []) {
  try {
    if (what === 'started') { team.say(`contest@${floor}`, floor, '🏁 낚시대회', '시작! 2분 동안 5번 — 다 같이 던져요 🎣'); return; }
    const line = top.length ? top.map((p, i) => `${MEDALS[i]} ${p.name} ${p.fish.mark ? p.fish.mark + ' ' : ''}${p.fish.name} ${p.fish.size}`.trim()).join(' · ') : '아무도 못 낚아서 우승자가 없어요';
    team.say(`contest@${floor}`, floor, '🏁 낚시대회', `끝! ${line}`);
    top.forEach((p, i) => team.shout(`${p.id}@${floor}`, floor, p.name, `${MEDALS[i]} 낚시대회 ${i + 1}등!`, 'brag',
      { id: p.fish.id, rarity: p.fish.rarity, name: p.fish.name, size: p.fish.size, color: p.fish.color, mark: p.fish.mark, place: i + 1 }, 'fish'));
  } catch {}
}
function contestClock() {
  let moved = false;
  for (const floor of [...fishing.contests.keys()]) {
    const r = fishing.contestTick(floor);
    if (r?.started) contestSaid(floor, 'started');
    if (r?.ended) contestSaid(floor, 'ended', r.top);
    if (r) moved = true;
  }
  if (moved) broadcast();
}
if (fishing) setInterval(contestClock, 1_000).unref();

// 🎲 같이 하기: op 'state', 'open' { kind }, 'join', 'leave', 'start', and the moves
// 'drop' { x } (🏗), 'toss' { to } (💣), 'say' { word } (🔤, and 🕵️ hints and the liar's
// guess), 'topic' { category } and 'vote' { to } (🕵️). Answers with my view.
const handleParty = personAction('api/party', ['op', 'kind', 'x', 'to', 'word', 'category', 'from'], ({ key, floor, name }, a) => {
  const me = key.slice(0, key.lastIndexOf('@'));
  if (a.op === 'open') parties.open(floor, { id: me, name }, a.kind);
  else if (a.op === 'join') parties.join(floor, { id: me, name });
  else if (a.op === 'leave') parties.leave(floor, me);
  else if (a.op === 'start') parties.start(floor, me);
  else if (a.op === 'drop') parties.act(floor, me, 'drop', a.x);
  else if (a.op === 'toss') parties.act(floor, me, 'toss', a.to);
  else if (a.op === 'say') parties.act(floor, me, 'say', a.word);
  else if (a.op === 'vote') parties.act(floor, me, 'vote', a.to);
  else if (a.op === 'topic') parties.act(floor, me, 'topic', a.category);
  // 🚇 the host sets the race's two stations in the lobby: { from, to }.
  else if (a.op === 'route') parties.setRoute(floor, me, a.from, a.to);
  else if (a.op === 'route-random') parties.setRandomRoute(floor, me);
  else return { party: parties.view(floor, me), quiet: true };
  return { party: parties.view(floor, me) };
}, (body) => { if (body.op !== 'state') partyRefresh(); });

// 🖍 캐치마인드 is the same table: 'open' { mode: 'catch' }, 'setup' { rounds, secs } (the
// host, before it starts), and 'clear' wipes the sheet.
const handleRelay = personAction('api/relay', ['op', 'stroke', 'text', 'mode', 'rounds', 'secs'], ({ key, floor, name }, a) => {
  const me = key.slice(0, key.lastIndexOf('@'));
  if (a.op === 'open') relays.open(floor, { id: me, name }, a.mode);
  else if (a.op === 'setup') relays.setup(floor, me, { rounds: a.rounds, secs: a.secs });
  else if (a.op === 'clear') relays.clear(floor, me);
  else if (a.op === 'join') relays.join(floor, { id: me, name });
  else if (a.op === 'leave') relays.leave(floor, me);
  else if (a.op === 'start') relays.start(floor, me);
  else if (a.op === 'stroke') relays.stroke(floor, me, a.stroke);
  else if (a.op === 'pass') relays.pass(floor, me);
  else if (a.op === 'guess') relays.guess(floor, me, a.text);
  else return { relay: relays.view(floor, me), quiet: true };
  // A stroke changes nothing anyone else sees yet: no need to wake every page.
  return { relay: relays.view(floor, me), ...(a.op === 'stroke' ? { quiet: true } : {}) };
});

// Someone challenged me: a desktop alert, whether or not my page or pet is open. On a
// member's PC the hub is asked now and then (faster while a game is on); the hub's own
// person is looked up here. The latest view also feeds my pet.
let duelNow = null;
let duelAt = 0; // when duelNow was heard: "쏴!" (goIn) is counted from then
const duelAlerted = new Set();
// My game as my pet sees it, with "쏴!" counted from now rather than from when it was heard.
const myDuel = () => (duelNow && duelNow.goIn != null ? { ...duelNow, goIn: duelNow.goIn - (Date.now() - duelAt) } : duelNow);
function heardDuel(v) {
  duelNow = v;
  duelAt = Date.now();
  if (v?.phase === 'invite' && v.invited && !duelAlerted.has(v.id)) {
    duelAlerted.add(v.id);
    petCalls += 1;
    toast(`⚔️ ${v.foe.name} 님이 대결을 신청했어요`, `${v.title} — 눌러서 수락하기`, { open: `http://localhost:${cfg.port}/?duel=1` });
  }
}
// 🎨 이어 그리기 on my floors: the one that matters most to me (my turn, then one I am in,
// then an open table), for my pet; and an alert when a table opens or my turn comes.
let relayNow = null;
let relayAt = 0;
const relayAlerted = new Set();
const myRelay = () => (relayNow && relayNow.timeLeft != null ? { ...relayNow, timeLeft: Math.max(0, relayNow.timeLeft - (Date.now() - relayAt)) } : relayNow);
function heardRelays(list) {
  const rank = (v) => (v.myTurn ? 4 : v.joined && v.phase !== 'lobby' ? 3 : v.joined ? 2 : v.phase === 'lobby' ? 1 : v.phase === 'done' ? 0.5 : 0);
  relayNow = list.filter(Boolean).sort((a, b) => rank(b) - rank(a))[0] || null;
  relayAt = Date.now();
  for (const v of list.filter(Boolean)) {
    if (v.phase === 'lobby' && !v.joined && !relayAlerted.has(`open:${v.id}`)) {
      relayAlerted.add(`open:${v.id}`);
      toast(`${v.mode === 'catch' ? '🖍' : '🎨'} ${v.players[0]?.name} 님이 ${v.mode === 'catch' ? '캐치마인드' : '이어 그리기'}를 열었어요`, `${v.floor} 층 — 펫이나 내 화면에서 참가하기`, { open: `http://localhost:${cfg.port}/#${encodeURIComponent(v.floor)}` });
    }
    const turnKey = v.mode === 'catch' ? `turn:${v.id}:${v.round}` : `turn:${v.id}:${v.turn}`;
    if (v.myTurn && !relayAlerted.has(turnKey)) {
      relayAlerted.add(turnKey);
      petCalls += 1;
      if (v.mode === 'catch') toast('🖍 그릴 차례예요!', `「${v.topic}」 — 다른 사람들이 맞히게 그려요`, { open: `http://localhost:${cfg.port}/#${encodeURIComponent(v.floor)}` });
      else toast(v.role === 'guesser' ? '🎨 정답을 외칠 차례예요!' : '🎨 그릴 차례예요!', v.role === 'first' ? `주제를 보고 ${Math.round(v.timeLeft / 1000)}초 안에 그려요` : '지금까지의 그림을 보고 이어서!', { open: `http://localhost:${cfg.port}/#${encodeURIComponent(v.floor)}` });
    }
  }
}
// 🎲 같이 하기 on my floors: the one that matters most to me, for my pet; an alert when a
// table opens, when my turn comes, and when the bomb lands in my hands.
let partyNow = null;
let partyAt = 0;
const partyAlerted = new Set();
const myParty = () => {
  if (!partyNow || partyNow.phase !== 'play') return partyNow;
  const gone = Date.now() - partyAt;
  return { ...partyNow, ...(partyNow.timeLeft != null ? { timeLeft: Math.max(0, partyNow.timeLeft - gone) } : {}),
    ...(partyNow.slide ? { slide: { ...partyNow.slide, elapsed: partyNow.slide.elapsed + gone } } : {}) };
};
function heardParties(list) {
  const rank = (v) => (v.myTurn ? 4 : v.joined && v.phase !== 'lobby' ? 3 : v.joined ? 2 : v.phase === 'lobby' ? 1 : v.phase === 'done' ? 0.5 : 0);
  partyNow = list.filter(Boolean).sort((a, b) => rank(b) - rank(a))[0] || null;
  partyAt = Date.now();
  for (const v of list.filter(Boolean)) {
    if (v.phase === 'lobby' && !v.joined && !partyAlerted.has(`open:${v.id}`)) {
      partyAlerted.add(`open:${v.id}`);
      toast(`🎲 ${v.players[0]} 님이 ${v.title} 를 열었어요`, `${v.floor} 층 — 펫이나 내 화면에서 참가하기`, { open: `http://localhost:${cfg.port}/#${encodeURIComponent(v.floor)}` });
    }
    const liar = v.kind === 'liar' || v.kind === 'fool';
    const turnKey = v.kind === 'bomb' ? `bomb:${v.id}:${v.throws}` : v.kind === 'stack' ? `turn:${v.id}:${v.height}`
      : liar ? `liar:${v.id}:${v.step}:${(v.hints || []).length}` : `turn:${v.id}:${(v.words || []).length}`;
    if (v.myTurn && v.kind !== 'subway' && !partyAlerted.has(turnKey)) {
      partyAlerted.add(turnKey);
      petCalls += 1;
      const what = v.kind === 'stack' ? '블록을 떨어뜨려요'
        : liar ? { topic: '어떤 주제로 할지 투표해요', hint: '제시어를 한 줄로 설명해요', vote: '라이어는 누구? 투표해요', guess: '들켰어요! 제시어를 맞혀 보세요' }[v.step]
          : `「${(v.starts || []).join(' / ')}」 로 시작하는 말`;
      if (v.kind !== 'bomb') toast(`${v.title} — 내 차례예요!`, what, { open: `http://localhost:${cfg.port}/#${encodeURIComponent(v.floor)}` });
    }
  }
}
// 🏁 낚시대회 on my floors: the one I am in (else one taking joiners), for my pet's board; an
// alert when one opens.
let contestNow = null;
let contestAt = 0;
const contestAlerted = new Set();
const myContest = () => contestNow && { ...contestNow, left: Math.max(0, contestNow.left - (Date.now() - contestAt)) };
function heardContests(list) {
  const rank = (v) => (v.joined ? 2 : v.phase === 'open' ? 1 : 0);
  contestNow = list.filter(Boolean).sort((a, b) => rank(b) - rank(a))[0] || null;
  contestAt = Date.now();
  for (const v of list.filter(Boolean)) {
    if (v.phase === 'open' && !v.joined && !contestAlerted.has(v.id)) {
      contestAlerted.add(v.id);
      toast(`🏁 ${v.by} 님이 낚시대회를 열었어요`, `${v.floor} 층 — 30초 안에 펫이나 내 화면에서 참가하기`, { open: `http://localhost:${cfg.port}/#${encodeURIComponent(v.floor)}` });
    }
  }
}
// My game on my floors, now (not at the next poll): after a move of mine, so my pet does not show
// the table as it was before it for a moment.
async function partyRefresh() {
  try {
    if (team) heardParties(cfg.floors.filter(joined).map((f) => parties.view(f.name, cfg.user.id)));
    else heardParties(await Promise.all(pushLinks.map((l) => askHub({ url: l.hubUrl, key: l.key, path: 'api/party', body: { user: cfg.user.id, op: 'state' } }).then((r) => r.body?.party || null).catch(() => null))));
  } catch {}
}
async function watchDuels() {
  try {
    // My own floors' tables and the other PC's room's I stand in; a duel from that room when none of my own.
    let duel = team ? duels.view(cfg.user.id) : null;
    const link = pushLinks[0];
    if (link && !duel) duel = (await askHub({ url: link.hubUrl, key: link.key, path: 'api/duel', body: { user: cfg.user.id, op: 'state' } })).body?.duel || null;
    heardDuel(duel);
    const own = (views) => (team ? cfg.floors.map((f) => views.view(f.name, cfg.user.id)) : []);
    heardParties([...own(parties), ...(await Promise.all(pushLinks.map((l) => askHub({ url: l.hubUrl, key: l.key, path: 'api/party', body: { user: cfg.user.id, op: 'state' } }).then((r) => r.body?.party || null).catch(() => null))))]);
    heardRelays([...own(relays), ...(await Promise.all(pushLinks.map((l) => askHub({ url: l.hubUrl, key: l.key, path: 'api/relay', body: { user: cfg.user.id, op: 'state' } }).then((r) => r.body?.relay || null).catch(() => null))))]);
    heardContests([...own({ view: (f, u) => fishing.contestView(f, u) }), ...(await Promise.all(pushLinks.map((l) => askHub({ url: l.hubUrl, key: l.key, path: 'api/fish', body: { user: cfg.user.id, op: 'contest' } }).then((r) => r.body?.contest || null).catch(() => null))))]);
  } catch {}
  const busy = duelNow?.phase === 'play' || duelNow?.phase === 'invite' || (relayNow && relayNow.phase !== 'done' && relayNow.joined) || (partyNow && partyNow.phase !== 'done' && partyNow.joined)
    || (contestNow?.joined && contestNow.phase !== 'done');
  setTimeout(watchDuels, busy ? 1000 : 2500).unref();
}
if (!demo) setTimeout(watchDuels, 3000).unref();

const handleNote = personAction('api/note', ['to', 'text', 'image'], ({ key, floor, name }, a) => {
  const to = String(a.to || '');
  if (!hubPeople().some((p) => p.userId === to && p.floor === floor)) throw Object.assign(new Error('그 사람은 지금 이 층에 없습니다'), { status: 404 });
  team.note(key, floor, name, to, a.text, a.image);
  // The hub's own person reads here, not through a push.
  if (to === cfg.user.id) gotNotes(team.takeNotes(cfg.user.id));
}, (body, a) => keepNote({ id: `out:${Date.now()}`, dir: 'out', who: String(a.to || ''), name: String(body.toName || a.to || '').slice(0, 60), floor: body.floor,
  text: String(a.text || '').trim().slice(0, 200), img: typeof a.image === 'string' ? a.image : null, at: Date.now() }));

// A chat line (memory only).
const handleChat = personAction('api/chat', ['text', 'image'], ({ key, floor, name }, a) => {
  team.say(key, floor, name, a.text, a.image);
  // 🌧 Rain or snow on the floor brings the rarer fish up for a while.
  const said = team.chat[team.chat.length - 1];
  if (said?.key === key && said.fx) fishing?.sky(floor, said.fx);
});

// A chat line's picture, for those who see its floor. A collector's page (and its
// pet) asks its own server, which fetches it from that floor's hub with the key.
async function handleChatImage(req, res, viewer, url) {
  const floor = url.searchParams.get('floor') || '';
  const id = url.searchParams.get('id') || '';
  if (!team || (viewer === 'owner' && !cfg.floors.some((f) => f.name === floor))) {
    const link = viewer === 'owner' && linkForFloor(floor);
    if (!link) return json(res, 404, { error: 'not found' });
    try {
      const r = await fetch(`${link.hubUrl}/api/chat-img?${new URLSearchParams({ floor, id })}`, { headers: { 'x-team-key': link.key } });
      if (!r.ok) return json(res, r.status, { error: 'not found' });
      res.writeHead(200, { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'private, max-age=3600' });
      return res.end(Buffer.from(await r.arrayBuffer()));
    } catch {
      return json(res, 502, { error: '팀 펫에 연결되지 않습니다' });
    }
  }
  const pic = team.image(id);
  const sees = viewer === 'owner' || viewer === 'admin' || viewer === `floor:${pic?.floor}`;
  if (!pic || pic.floor !== floor || !sees) return json(res, 404, { error: 'not found' });
  res.writeHead(200, { 'content-type': pic.type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' });
  res.end(pic.buf);
}

async function handlePush(req, res) {
  // Refusals drain the body first so the collector reads the status, not a reset.
  const refuse = (code, error) => { req.resume(); return json(res, code, { error }); };
  if (req.method !== 'POST') return refuse(405, 'use POST');
  // A custom header, not the cookie: a cross-site form cannot send it.
  const access = accessFor(req.headers['x-team-key']);
  if (!access) return refuse(401, 'team key required');
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return refuse(415, 'send JSON');
  let slot;
  try {
    const body = await readJsonBody(req);
    // With a floor key everything sent lands on that floor. A person comes with no AI work.
    const floor = access.startsWith('floor:') ? access.slice(6) : null;
    if (body && typeof body === 'object') body.agents = [];
    slot = team.receive(body, { floor, ip: req.socket.remoteAddress || '' });
  } catch (e) {
    return fail(res, e);
  }
  broadcast();
  // Pokes waiting for this PC go back in the answer; otherwise nothing to say.
  // The office's own build rides on every answer: a member behind it updates right away.
  res.setHeader('x-office-build', String(officeBuild()));
  const poked = team.takePokes(slot);
  // Notes (쪽지) for this PC's person ride on the answer, and only on it.
  const notes = team.takeNotes(slot.split('@')[0]);
  if (poked.pokes || notes.length) return json(res, 200, { ...poked, ...(notes.length ? { notes } : {}) });
  res.writeHead(204);
  return res.end();
}

// POST { code } -> { floor, key }. Wrong tries count per address, so codes cannot be guessed.
async function handleJoin(req, res) {
  const refuse = (code, error) => { req.resume(); return json(res, code, { error }); };
  if (req.method !== 'POST') return refuse(405, 'use POST');
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return refuse(415, 'send JSON');
  const who = req.socket.remoteAddress || '';
  if (joinTries.blocked(who)) return refuse(429, '코드를 너무 많이 틀렸습니다. 10분 뒤에 다시 해 주세요');
  let code = '';
  try { code = cleanJoinCode((await readJsonBody(req))?.code); } catch (e) { return fail(res, e); }
  const f = code && cfg.floors.find((x) => keyMatches(code, x.code));
  if (!f) { joinTries.miss(who); return json(res, 404, { error: '없는 코드입니다. 관리자에게 코드를 다시 확인해 주세요' }); }
  if (!(f.codeUntil > Date.now())) return json(res, 410, { error: '기간이 지난 코드입니다. 관리자에게 새 코드를 받아 주세요' });
  return json(res, 200, { floor: f.name, key: f.key });
}

// 💨 날리기: anyone sends anyone on their floor flying, for fun (they land back a moment later;
// nothing else happens). A member's PC relays it to the floor's hub; the hub says it as a chat
// effect with who, whom and how — a kick and a toy hammer, turn and turn about (team.js fling).
async function handleFling(req, res, viewer) {
  const body = await pageRequest(req, res);
  if (!body) return;
  const who = typeof body.who === 'string' ? body.who : '';
  // Another PC's room: on to its hub.
  if (viewer === 'owner' && !cfg.floors.some((f) => f.name === body.floor)) return relay(res, typeof body.floor === 'string' ? body.floor : '', 'api/fling', { who, from: cfg.user.id, fromName: cfg.user.name });
  if (!team) return json(res, 403, { error: 'only on this PC' });
  const floor = viewer.startsWith('floor:') ? viewer.slice(6) : typeof body.floor === 'string' ? body.floor : '';
  const from = viewer === 'owner' ? cfg.user.id : String(body.from || '');
  const fromName = viewer === 'owner' ? cfg.user.name : String(body.fromName || from).slice(0, 60);
  const target = snapshotFor(viewer).people.find((p) => p.floor === floor && p.userId === who);
  if (!target || !from || target.userId === from) return json(res, 404, { error: '날릴 수 없는 사람이에요' });
  let how;
  try {
    how = team.fling(`${from}@${floor}`, floor, '💨 날리기', (h) => `${fromName} 님이 ${target.name} 님을 ${h === 'hammer' ? '뿅망치로' : '발로 차서'} 날려 버렸어요!`, { who, name: target.name, by: from });
  } catch (e) {
    return fail(res, e);
  }
  broadcast();
  return json(res, 200, { ok: true, how });
}

// 👋 The invite page (client/invite.html), filled in: the room the code opens and who made it,
// or why the code no longer opens anything; the link as the visitor reached it, so it works for them.
function invitePage(req, res, url) {
  const code = cleanJoinCode(url.searchParams.get('code') || '');
  const f = code && cfg.floors.find((x) => keyMatches(code, x.code));
  const why = !f ? '이 참가 링크는 더 이상 맞지 않아요 (없는 코드). 방장에게 새 링크를 받아 주세요.'
    : !(f.codeUntil > Date.now()) ? '이 참가 링크는 기간이 지났어요 (7일). 방장에게 새 링크를 받아 주세요.' : '';
  const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const title = f ? `${h(cfg.user.name)} 님이 <span class="room">'${h(f.name)}'</span> 방에 초대했어요` : '팀 펫 초대';
  const fill = { title, why: h(why), link: h(`http://${req.headers.host}/?code=${code}`), releases: RELEASES };
  let page = fs.readFileSync(path.join(CLIENT_DIR, 'invite.html'), 'utf8');
  for (const [k, v] of Object.entries(fill)) page = page.split(`{{${k}}}`).join(v);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(page);
}

// Poking: anyone who can see a person can nudge them, as often as they like.
// The person gets a desktop alert that someone poked them, nothing more: no
// message and no sender, so it stays a nudge, not a channel. Focusing is how a
// person says not now.

async function handlePoke(req, res, viewer) {
  const body = await pageRequest(req, res);
  if (!body) return;
  const id = body.id;
  if (!team) {
    if (viewer !== 'owner') return json(res, 403, { error: 'only on this PC' });
    return relay(res, floorOfPerson(id), 'api/poke', { id, from: cfg.user.id });
  }
  // Only someone this viewer can see right now, and who said they may be poked.
  const p = snapshotFor(viewer).people.find((x) => x.id === id);
  if (!p || !p.pokeable) return json(res, 404, { error: '찌를 수 없는 사람입니다' });
  // A relayed poke must not come back to the one who sent it.
  const from = body.from;
  if (typeof from === 'string' && from === p.userId) return json(res, 404, { error: '찌를 수 없는 사람입니다' });
  if (p.userId === cfg.user.id) {
    petPokes += 1;
    // Demo mode has nobody at the hub, so a poke there only shows in the console.
    (demo ? console.log : toast)('👉 누군가 찔렀어요', `팀 펫 ${p.floor} 층에서 찾고 있어요`);
  } else {
    const slot = team.slotFor(p.userId, p.floor);
    if (!slot) return json(res, 404, { error: '찌를 수 없는 사람입니다' });
    team.poke(slot, p.floor);
  }
  // Everyone on the floor sees the poked one flinch.
  team.hits.set(p.key, Date.now());
  broadcast();
  return json(res, 200, { ok: true });
}

function shareLinks() {
  const base = `http://${lanAddress()}:${cfg.port}/?key=`;
  return {
    admin: base + cfg.team.key,
    // invite: what a member pastes into their pet — this hub's address and the room's join code.
    floors: cfg.floors.map((f) => ({ name: f.name, link: base + f.key, invite: f.code ? `http://${lanAddress()}:${cfg.port}/?code=${f.code}` : '', joined: joined(f), code: f.code || '', codeUntil: f.codeUntil || 0 })),
  };
}

// The links carry keys, so they go to a file, not the console.
function writeShareLinks() {
  const l = shareLinks();
  const lines = [`[관리자 · 전 층] ${l.admin}`, ...l.floors.map((f) => `[${f.name} 층] ${f.link}`)];
  const file = path.join(path.dirname(cfgFile), 'share-link.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

// Floors are made on the hub PC only: GET lists them with their share links,
// POST { name } adds one with a fresh key. The team that gets the link decides
// on its own PCs which repositories to share.
async function handleFloors(req, res, viewer) {
  if (viewer !== 'owner') {
    // Drain the body so the refusal reaches the client instead of a reset.
    req.resume();
    return json(res, 403, { error: 'floors can only be managed on the hub PC' });
  }
  if (req.method === 'GET') return json(res, 200, shareLinks());
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'use GET, POST, PUT or DELETE' });
  if (!fromOwnPage(req)) return json(res, 403, { error: '방은 팀 펫 화면에서만 바꿀 수 있어요' });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'send JSON' });
  try {
    const body = await readJsonBody(req);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (req.method === 'PUT') {
      // { name, joined }: whether the owner works on this floor and sees its people.
      // { name, code: true }: a new join code; the old one stops working.
      const f = cfg.floors.find((x) => x.name === name);
      if (!f) throw Object.assign(new Error('없는 층입니다'), { status: 404 });
      // { name, rename }: 🏷 a new name; everything kept under the old one follows it, the members'
      // pets hear it with the next snapshot (their link keeps the key; its name follows in connect).
      if (typeof body.rename === 'string') {
        const to = body.rename.trim();
        if (!to || to.length > 30 || /[#?&]/.test(to)) throw new Error('방 이름은 1~30자이고 # ? & 를 쓸 수 없습니다');
        if (to !== f.name) {
          if (cfg.floors.some((x) => x.name === to)) throw Object.assign(new Error('이미 있는 이름입니다'), { status: 409 });
          const from = f.name; f.name = to;
          for (const x of [team, fishing, records, relays, parties]) x?.renameFloor?.(from, to);
          // The members' live streams were opened under the old name: they follow too.
          for (const [c, v] of clients) if (v === `floor:${from}`) clients.set(c, `floor:${to}`);
          try { fs.writeFileSync(fishFile, JSON.stringify(fishing.dex)); fs.writeFileSync(boardFile, JSON.stringify(records.best)); } catch {}
          saveConfig(cfgFile, cfg);
          writeShareLinks();
          broadcast();
        }
        return json(res, 200, shareLinks());
      }
      if (body.code === true) freshCode(f);
      else if (typeof body.joined !== 'boolean') throw new Error('joined 는 true 또는 false 입니다');
      else if (body.joined) { for (const x of cfg.floors) x.joined = x === f; await switchTo(null); } // 🚪 방 이동: one room at a time, out of another PC's room
      else f.joined = false;
      saveConfig(cfgFile, cfg);
      broadcast();
      return json(res, 200, shareLinks());
    }
    if (req.method === 'DELETE') {
      // Removing a floor also retires its key: its link and its collectors stop working.
      const i = cfg.floors.findIndex((f) => f.name === name);
      if (i < 0) throw Object.assign(new Error('없는 층입니다'), { status: 404 });
      cfg.floors.splice(i, 1);
      // The floor I stood on: onto another of mine, if there is one.
      if (cfg.floors.length && !pushLinks.length && !cfg.floors.some((f) => f.joined === true)) cfg.floors[0].joined = true;
      saveConfig(cfgFile, cfg);
      writeShareLinks();
      broadcast();
      return json(res, 200, shareLinks());
    }
    if (!name || name.length > 30 || /[#?&]/.test(name)) throw new Error('층 이름은 1~30자이고 # ? & 를 쓸 수 없습니다');
    if (cfg.floors.some((f) => f.name === name)) throw Object.assign(new Error('이미 있는 층입니다'), { status: 409 });
    cfg.floors.push(freshCode({ name, key: newKey() }));
    saveConfig(cfgFile, cfg);
    writeShareLinks();
    broadcast();
    return json(res, 201, shareLinks());
  } catch (e) {
    return fail(res, e);
  }
}

// 🏠 The first room, from a PC that is nobody's member yet (the pet's first-run box): the room
// goes into the settings and the program starts again — as the hub, since isHub reads them.
async function handleFirstRoom(req, res, viewer) {
  if (viewer !== 'owner') { req.resume(); return json(res, 403, { error: '이 PC 에서만 쓸 수 있습니다' }); }
  const body = await pageRequest(req, res);
  if (!body) return;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 30 || /[#?&]/.test(name)) return json(res, 400, { error: '방 이름은 1~30자이고 # ? & 를 쓸 수 없습니다' });
  cfg.team.key ||= newKey();
  // I stand in the new room: out of another PC's room I was in (its hub told now; the rooms I know stay).
  cfg.floors.push(freshCode({ name, key: newKey(), joined: true }));
  for (const old of pushLinks.splice(0)) { await goodbye(old); linkStops.get(old)?.(); linkStops.delete(old); }
  saveLinks();
  // Start with Windows from now on, as a member who joined from the page does (handleLinks).
  if (process.platform === 'win32' && !process.env.TEAM_PET_CONFIG && !demo) autostartOn('collector');
  json(res, 201, { name, restarting: true });
  restartAsHub();
}
// The Mac app starts the server again when it ends (mac/main.cjs); a Windows install was started by
// scripts/launch.js, whose helper does the same (update.js relaunch). Run by hand, it just ends.
function restartAsHub() {
  console.log(`first room '${cfg.floors[0].name}' made: starting again as the hub`);
  process.env.TEAM_PET_FIRST_ROOM = '1';
  if (!process.env.TEAM_PET_APP && fs.existsSync(path.join(path.dirname(cfgFile), 'collector.pid'))) return relaunch(ROOT, 'collector');
  setTimeout(() => process.exit(0), 300);
}

// The person at this PC decides how they show up: hidden, focused, asking for
// help. Only this PC's own page can change it, like the settings.
async function handleMe(req, res, viewer) {
  if (viewer !== 'owner') { req.resume(); return json(res, 403, { error: 'only the person at this PC sets their own state' }); }
  if (req.method === 'GET') return json(res, 200, cfg.me);
  if (req.method !== 'POST') return json(res, 405, { error: 'use GET or POST' });
  if (!fromOwnPage(req)) return json(res, 403, { error: '팀 펫 화면에서만 바꿀 수 있어요' });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'send JSON' });
  try {
    const body = (await readJsonBody(req)) || {};
    const next = { ...cfg.me };
    if ('hidden' in body) next.hidden = body.hidden === true;
    if ('status' in body) next.status = cleanStatus(body.status);
    if ('note' in body) next.note = cleanNote(body.note);
    if ('avatar' in body) next.avatar = cleanAvatar(body.avatar);
    if (!next.status) next.note = '';
    cfg.me = next;
    saveConfig(cfgFile, cfg);
    // A change counts as a change of the office: the hubs and my page hear it now.
    person.changed();
    return json(res, 200, cfg.me);
  } catch (e) {
    return fail(res, e);
  }
}

// The desktop pet, from this PC only: GET is what its window shows, POST changes
// it (from my page, or the pet's own menu, which sends no Origin).
async function handlePet(req, res, viewer) {
  if (viewer !== 'owner') { req.resume(); return json(res, 403, { error: '이 PC 에서만 쓸 수 있습니다' }); }
  // Quiet: only the games I am already playing reach the pet, not a table someone opened
  // nor a challenge (it runs out on its own).
  // Not set up yet, so the pet opens its own first-run box: on the hub, make the first room;
  // on a member PC, a name, the join code and an animal. hub: the pet offers the codes.
  // 'member' offers both: an invite link to paste, or the first room to make (handleFirstRoom).
  const setup = team && !cfg.floors.length ? 'hub' : !cfg.floors.length && !rooms.length ? 'member' : firstRoom && Date.now() - bornAt < 30_000 ? 'codes' : null;
  // The room my pet stands in (the others are chat tabs): the hub's joined floor, a member's pushed room.
  const current = currentFloor()?.name || linkTeam.get(pushLinks[0])?.floors?.[0] || pushLinks[0]?.name || null;
  const view = () => ({ ...petView(snapshotFor('owner'), { myId: cfg.user.id, myName: cfg.user.name, pet: cfg.pet, pokes: petPokes, calls: petCalls, current,
    duel: (team && duels.view(cfg.user.id)) || myDuel(), relay: myRelay(), party: myParty(), contest: myContest() }), quiet: !!cfg.notify.quiet, news: newsView(patchNotes, cfg.pet.newsSeen),
    setup, hub: !!team, myName: cfg.user.name, myId: cfg.user.id,
    // 🚪 방 이동: the rooms I know — my own (own, with their head count) and other PCs' — the one I stand in marked.
    rooms: [...(team ? cfg.floors.map((f, i) => ({ i, name: f.name, own: true, current: joined(f), count: team.people(() => null).filter((p) => p.floor === f.name).length + 1 })) : []),
      ...linkList().map((l) => ({ i: l.i, name: l.name, current: l.current }))],
    // Rooms that came down under me in the last minute (roomGone), for the pet to show.
    lost: lost.filter((l) => Date.now() - l.at < 60_000),
    // 🆕 A newer release, ready to put in (Windows) or to download (the Mac app).
    update: releaseOffer ? { version: releaseOffer.version, mac: !!releaseOffer.mac, page: releaseOffer.page || '' } : null,
    // The room's hub runs an older build than mine: some new things may not work there yet.
    hubOld: !team && hubBuildSeen > 0 && hubBuildSeen < localVersion(ROOT) });
  if (req.method === 'GET') return json(res, 200, view());
  const body = await pageRequest(req, res);
  if (!body) return;
  cfg.pet = cleanPet(body, cfg.pet);
  saveConfig(cfgFile, cfg);
  person.changed(); // a new animal reaches the floors with the next push
  if (cfg.pet.on && !demo) petWindow.start();
  if (!cfg.pet.on) petWindow.stop();
  return json(res, 200, view());
}

async function handleNotify(req, res, viewer) {
  if (viewer !== 'owner') { req.resume(); return json(res, 403, { error: 'only on this PC' }); }
  const state = () => ({ ...cfg.notify });
  if (req.method === 'GET') return json(res, 200, state());
  if (req.method !== 'POST') return json(res, 405, { error: 'use GET or POST' });
  if (!fromOwnPage(req)) return json(res, 403, { error: '팀 펫 화면에서만 바꿀 수 있어요' });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'send JSON' });
  try {
    const body = (await readJsonBody(req)) || {};
    if ('quiet' in body) cfg.notify.quiet = body.quiet === true;
    saveConfig(cfgFile, cfg);
    return json(res, 200, state());
  } catch (e) {
    return fail(res, e);
  }
}

let programList = null; // { at, body }: the hub's manifest for members' updates
// The build on this hub's disk, read at most once a minute (pushes come every few seconds).
let buildSeen = { at: 0, v: 0 };
const officeBuild = () => {
  if (Date.now() - buildSeen.at > 60_000) buildSeen = { at: Date.now(), v: localVersion(ROOT) };
  return buildSeen.v;
};

async function handle(req, res) {
  // Only the path and the query matter here; the Host is checked on its own (viewerOf).
  const url = new URL(req.url || '/', 'http://team-pet.invalid');
  if (team && url.pathname === '/api/push') return handlePush(req, res);
  // The installer checks a pasted link: which floor does this key open?
  if (team && url.pathname === '/api/link-info') {
    const access = accessFor(req.headers['x-team-key']);
    if (!access) return json(res, 401, { error: 'team key required' });
    return json(res, 200, { floor: access.startsWith('floor:') ? access.slice(6) : null, admin: access === 'admin' });
  }
  // A member's PC trades a floor's join code for its key (the code itself is the secret).
  if (team && url.pathname === '/api/join') return handleJoin(req, res);
  // An invite link opened in a browser — a teammate who has no pet yet: the page that gets them
  // in (what room, who asked, the downloads, the link to paste). The code alone opens nothing.
  if (team && url.pathname === '/' && url.searchParams.has('code')) return invitePage(req, res, url);
  // Members' collectors keep up with the hub's own program (server/update.js).
  if (team && url.pathname.startsWith('/api/update')) {
    if (!accessFor(req.headers['x-team-key'])) return json(res, 401, { error: 'team key required' });
    if (url.pathname === '/api/update') {
      // The program on disk changes only when the admin installs a new build; a minute's cache is plenty.
      if (!programList || Date.now() - programList.at > 60_000) programList = { at: Date.now(), body: manifest(ROOT) };
      return json(res, 200, programList.body);
    }
    const file = url.pathname === '/api/update/file' && programFile(ROOT, url.searchParams.get('path'));
    if (!file) return json(res, 404, { error: 'not a program file' });
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }
  const viewer = viewerOf(req);
  if (!viewer) return json(res, 403, { error: '팀 펫은 설치한 PC 에서만 엽니다' });
  if (url.pathname === '/api/state') return json(res, 200, snapshotFor(viewer));
  if (url.pathname === '/api/events') {
    const stream = openStream(req, res, snapshotFor(viewer));
    clients.set(res, viewer);
    stream.gone(() => clients.delete(res));
    return;
  }
  if (url.pathname === '/api/floors') return team ? handleFloors(req, res, viewer) : handleFirstRoom(req, res, viewer);
  if (url.pathname === '/api/fling') return handleFling(req, res, viewer);
  // The admin's status board (hub PC only): who is connected, since when, on which build.
  if (team && url.pathname === '/api/roster') {
    if (viewer !== 'owner') return json(res, 403, { error: '관리자 PC 에서만 볼 수 있습니다' });
    return json(res, 200, { version: localVersion(ROOT), people: team.roster(), hooks: fishing.hookLog });
  }
  // A page opened from the office address on a PC that has the office installed: point it home.
  if (url.pathname === '/api/me') return handleMe(req, res, viewer);
  if (url.pathname === '/api/links') return handleLinks(req, res, viewer);
  if (url.pathname === '/api/notify') return handleNotify(req, res, viewer);
  if (url.pathname === '/api/pet') return handlePet(req, res, viewer);
  // 🔄 다시 시작 (the pet's menu, my page): this PC's office ends and starts again in a moment,
  // the same way an update does (scripts/launch.js after-exit). Only from this PC.
  // 🆕 업데이트 (the pet's offer): the release that is ready goes in and this PC's program starts
  // again on it. The Mac app only gets the download page to open.
  if (url.pathname === '/api/release-now' && req.method === 'POST') {
    if (viewer !== 'owner') return json(res, 403, { error: 'only on this PC' });
    if (!fromOwnPage(req)) return json(res, 403, { error: '팀 펫 화면에서만 할 수 있어요' });
    if (!releaseOffer) return json(res, 409, { error: '받아 둔 새 버전이 없어요' });
    if (releaseOffer.mac) return json(res, 200, { page: releaseOffer.page });
    if (!releases.apply()) return json(res, 500, { error: '새 버전을 넣지 못했어요. 잠시 뒤 다시 해 주세요' });
    json(res, 200, { ok: true, version: releaseOffer.version });
    console.log(`update: ${releaseOffer.version} put in, starting again`);
    petWindow.stop();
    return relaunch(ROOT, isHub ? 'hub' : 'collector');
  }
  if (url.pathname === '/api/restart' && req.method === 'POST') {
    if (viewer !== 'owner') return json(res, 403, { error: 'only on this PC' });
    json(res, 200, { ok: true });
    console.log('restart: asked from this PC');
    petWindow.stop();
    // In the Mac app the app starts its office again when it ends (mac/main.cjs).
    if (process.env.TEAM_PET_APP) return setTimeout(() => process.exit(0), 300);
    return relaunch(ROOT, isHub ? 'hub' : 'collector');
  }
  if (url.pathname === '/api/poke') return handlePoke(req, res, viewer);
  if (url.pathname === '/api/chat') return handleChat(req, res, viewer);
  if (url.pathname === '/api/note') return handleNote(req, res, viewer);
  if (url.pathname === '/api/duel') return handleDuel(req, res, viewer);
  if (url.pathname === '/api/relay') return handleRelay(req, res, viewer);
  if (url.pathname === '/api/party') return handleParty(req, res, viewer);
  if (url.pathname === '/api/record') return handleRecord(req, res, viewer);
  if (url.pathname === '/api/fish') return handleFish(req, res, viewer);
  if (url.pathname === '/api/smack') return handleSmack(req, res, viewer);
  if (url.pathname === '/api/snowball') return handleSnowball(req, res, viewer);
  // 🎣 How every catch looks (server/fish-art.js), the same on every PC: fetched once and kept.
  if (url.pathname === '/api/fish-looks') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'private, max-age=3600' });
    return res.end(JSON.stringify({ looks: fishLooks(), rarity: RARITY }));
  }
  // A note's picture, from this PC's own notes only.
  if (url.pathname === '/api/note-img') {
    if (viewer !== 'owner') return json(res, 403, { error: 'only on this PC' });
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(noteImgs.get(url.searchParams.get('id')) || '');
    if (!m) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': m[1], 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' });
    return res.end(Buffer.from(m[2], 'base64'));
  }
  if (url.pathname === '/api/chat-img') return handleChatImage(req, res, viewer, url);
  if (url.pathname === '/api/config') return handleConfig(req, res, viewer);

  // 🌟 The photos there are (<id>.jpg, <id>-2.jpg …), so the page can pick one at random.
  if (url.pathname === '/assets/stars/index.json') {
    let names = [];
    try { names = fs.readdirSync(path.join(CLIENT_DIR, 'assets', 'stars')).filter((n) => /^[\w-]+\.jpg$/.test(n)); } catch {}
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(names));
  }
  // The page is this PC's own; another PC's team pet only talks to the API.
  if (viewer !== 'owner') { res.writeHead(403); return res.end(); }
  return servePage(res, CLIENT_DIR, url.pathname);
}

// ⚙️ The settings, on this PC only: GET reads them; POST (from this page, as JSON) sets my name.
async function handleConfig(req, res, viewer) {
  if (viewer !== 'owner') return json(res, 403, { error: '설정은 이 PC 에서만 바꿀 수 있어요' });
  if (req.method === 'GET') return json(res, 200, { config: cfg, demo, file: cfgFile });
  if (req.method !== 'POST') return json(res, 405, { error: 'GET 이나 POST 로 보내 주세요' });
  if (!fromOwnPage(req)) return json(res, 403, { error: '설정은 팀 펫 화면에서만 바꿀 수 있어요' });
  if (!sentJson(req)) return json(res, 415, { error: '설정은 JSON 으로 보내 주세요' });
  try {
    const body = await readJsonBody(req);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('설정은 JSON 객체여야 해요');
    const name = typeof body.user?.name === 'string' ? body.user.name.trim().slice(0, 30) : '';
    if (name) cfg.user = { ...cfg.user, name };
    saveConfig(cfgFile, cfg);
    person.rename(cfg.user.name);
    person.changed();
    return json(res, 200, { config: cfg });
  } catch (e) {
    return fail(res, e);
  }
}

// A request that throws is logged and answered with a 500; the server itself carries on.
const server = createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (e) {
    console.error(`${req.method} ${req.url} failed:`, e);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    if (!res.writableEnded) res.end();
  }
});

const lanAddress = () => officeAddress();

// No floor yet (just installed): keep running anyway, so the pet can greet me and take an
// invite link (handleLinks) — or make this team's first room (handleFirstRoom).
if (process.argv.includes('--push-config') && !team && !pushLinks.length) {
  console.log(`push: no room yet — the pet at http://localhost:${cfg.port} asks for an invite link, or makes the first room`);
}
for (const link of pushLinks) {
  if (!link.key) {
    console.error(`push: ${link.hubUrl} has no key (--key or the link from your admin)`);
    process.exit(1);
  }
  connect(link);
}

// Pushing my person to the room I stand in and following it (its people and talk, live, for my
// page and pet); joining with a code later switches while running (see handleLinks).
function connect(link) {
  const label = link.name ? `${link.name} (${link.hubUrl})` : link.hubUrl;
  const stopPush = startPush(person, {
    url: link.hubUrl,
    key: link.key,
    // A person only (name, state, talk, pet): nothing about any work leaves this PC.
    filter: () => false,
    // My pet's animal goes along, so it sits beside theirs on their desktops.
    me: () => ({ ...cfg.me, pet: cfg.pet.kind, noSmack: cfg.pet.smackOff === true, client: { version: localVersion(ROOT), via: VIA, pet: petWindow.running } }),
    shareWork: () => false,
    onNotes: gotNotes,
    onPoke: (n, floor) => {
      petPokes += n;
      toast('👉 누군가 찔렀어요', `팀 펫 ${floor || link.name || ''} 층에서 찾고 있어요${n > 1 ? ` (${n}번)` : ''}`);
    },
    // Only the first office's build counts: that is where updates come from.
    onOffice: (build) => { if (link === pushLinks[0]) { hubBuildSeen = build; updater?.soon(build); } },
    onStatus: (ok, why) => {
      if (!pushLinks.includes(link)) return; // a push still in flight when I left that floor
      console.log(`push to ${label}: ${ok ? 'connected' : `not delivered (${why})`}`);
      // The hub refuses my key: the room was deleted (a hub that is down answers nothing at all).
      if (!ok && /answered 401/.test(String(why))) return roomGone(link);
      // Shown on my own page: with no window, that is where I see it.
      linkState.set(link, { ok, why: ok ? '' : String(why) });
      broadcast();
    },
  });
  const stopFollow = followHub({ url: link.hubUrl, key: link.key, onState: (s) => {
    if (s && pushLinks.includes(link)) linkTeam.set(link, s); else linkTeam.delete(link);
    // 🏷 The room's name as its hub has it now (renamed there): kept with the link.
    if (s?.floors?.[0] && link.name !== s.floors[0]) { link.name = s.floors[0]; saveLinks(); }
    broadcast();
  } });
  linkStops.set(link, () => { stopPush(); stopFollow(); linkTeam.delete(link); linkState.delete(link); });
}

// Keep this member's program up to date from its (first) office, so nobody
// passes zip files around after the first install. Not for a source checkout
// (a .git folder): that is a developer's tree, not an install.
// A PC that joins its first floor from the page starts keeping up from then on.
let updating = false;
function keepUpdated() {
  // The Mac app (TEAM_PET_APP) is signed as a whole: it updates from a new release, never file by file.
  if (updating || !pushLinks.length || team || demo || process.env.TEAM_PET_APP || fs.existsSync(path.join(ROOT, '.git'))) return;
  updating = true;
  updater = startUpdater({
    url: pushLinks[0].hubUrl, key: pushLinks[0].key, root: ROOT,
    log: (l) => console.log(l),
    notify: (title, body) => toast(title, body),
  });
}
let updater = null;
keepUpdated();

// 🆕 New releases (server/release-update.js), on every install — the hub's too. Not in the tests
// (--demo) or a developer's tree, unless TEAM_PET_UPDATE_URL points at a release to try.
let releaseOffer = null;
let hubBuildSeen = 0;
const releaseUrl = process.env.TEAM_PET_UPDATE_URL || RELEASE_URL;
const appVersion = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || ''; } catch { return ''; } })();
const releases = demo || process.env.TEAM_PET_NO_UPDATE || (fs.existsSync(path.join(ROOT, '.git')) && !process.env.TEAM_PET_UPDATE_URL)
  ? { apply: () => false, stop: () => {} }
  : releaseUpdater({
    root: ROOT, appVersion, mac: !!process.env.TEAM_PET_APP, url: releaseUrl,
    log: (l) => console.log(l),
    onReady: (offer) => { releaseOffer = offer; broadcast(); },
    ...(process.env.TEAM_PET_UPDATE_URL ? { firstMs: 3_000 } : {}),
  });

// A collector's own page is a convenience: if its port is taken (the hub or
// another program on this PC), keep pushing without it.
server.on('error', (e) => {
  if (pushUrl && e.code === 'EADDRINUSE') {
    console.log(`port ${cfg.port} is in use, so this PC's own page is off; pushing to the hub continues`);
    return;
  }
  throw e;
});
server.listen(cfg.port, team ? cfg.team.host : '127.0.0.1', () => {
  console.log(`Team Pet is open at http://localhost:${cfg.port}${demo ? '  (demo mode)' : ''}`);
  if (cfg.pet.on && !demo) petWindow.start();
  if (pushLinks.length) console.log(`내 상태 바꾸기(숨기기 · 집중 중 · 도움 필요): http://localhost:${cfg.port}`);
  // --open: the installer (and the desktop icon) shows my page once it is listening.
  if (process.argv.includes('--open') && process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', `http://localhost:${cfg.port}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
  if (team) {
    const file = writeShareLinks();
    console.log(`team office: ${cfg.floors.length} floor(s) open to the office network; share links saved to ${file}`);
    if (!cfg.floors.length) console.log('team office: no floors yet — open http://localhost:' + cfg.port + ' and add one from the floor directory');
  }
});
