#!/usr/bin/env node
// 팀원 설치 도우미: 이름 · 관리자에게 받은 링크(또는 참가 코드)로 설정 파일을 만든다.
// 여러 층(여러 관리자)에 속하면 다시 실행해 링크를 하나 더 넣는다.
// 설치 파일로 깔았다면 이것 없이 화면에서 참가 코드만 넣어도 된다.
import { configPath, loadConfig, saveConfig } from '../server/config.js';
import { autostartOn } from './autostart.js';
import { desktopShortcut } from './desktop-shortcut.js';
import { ask, closePrompt } from './picker.js';
import { cleanJoinCode, redeemCode } from '../server/team.js';

// An invite link (?code=…, from the hub's pet) or an older share link (?key=…).
function parseLink(link) {
  try {
    const u = new URL(link.trim());
    const hubUrl = `${u.protocol}//${u.host}`;
    const key = u.searchParams.get('key');
    const code = cleanJoinCode(u.searchParams.get('code') || '');
    return key ? { hubUrl, key } : code.length >= 4 ? { hubUrl, code } : null;
  } catch {
    return null;
  }
}

// Ask the hub which floor the link opens. Unreachable is not fatal: the hub
// may simply be off right now, and the pet retries later.
async function floorOf(link) {
  try {
    const res = await fetch(`${link.hubUrl}/api/link-info`, { headers: { 'x-team-key': link.key }, signal: AbortSignal.timeout(4000) });
    if (res.status === 401) return { bad: true };
    if (!res.ok) return {};
    const body = await res.json();
    return { name: body.admin ? '관리자(전 층)' : body.floor };
  } catch {
    return { offline: true };
  }
}

const file = configPath();
const cfg = loadConfig(file);
// Older single-link settings become the first entry of the list.
const links = Array.isArray(cfg.team.links) ? cfg.team.links
  : cfg.team.hubUrl && cfg.team.key ? [{ hubUrl: cfg.team.hubUrl, key: cfg.team.key }] : [];
const label = (l) => `${l.name || '(층 이름 모름)'} · ${l.hubUrl}`;

console.log('\n=== 팀 펫 — 팀원 설치 ===\n');
console.log('(Enter = 괄호 안 값 그대로)\n');

const name = await ask(`1) 펫 대화에 보일 내 이름 (${cfg.user.name}): `, cfg.user.name);

if (links.length) {
  console.log('\n   지금 연결된 층:');
  links.forEach((l, i) => console.log(`   ${i + 1}. ${label(l)}`));
  console.log('   · 새 링크나 참가 코드를 넣으면 → 층이 하나 더 연결됩니다(기존 연결은 그대로)');
  console.log('   · 연결을 끊으려면 → 빼기와 번호 (예: -2)');
  console.log('   · 이름만 바꾸고 끝내려면 → 그냥 Enter');
}

let link = null;
for (;;) {
  const answer = await ask(links.length ? '2) 참가 링크 · 참가 코드 · -번호: ' : '2) 방장에게 받은 참가 링크를 붙여 넣으세요 (http://… 전체): ');
  if (!answer && links.length) break;
  const drop = answer.match(/^-\s*(\d+)$/);
  if (drop && links[Number(drop[1]) - 1]) {
    const [gone] = links.splice(Number(drop[1]) - 1, 1);
    console.log(`   연결을 끊었습니다: ${label(gone)}`);
    if (!links.length) console.log('   남은 연결이 없습니다. 새 링크를 붙여 넣으세요.');
    continue;
  }
  // A join code works too, once one hub is known: ask each known hub what it opens.
  if (links.length && /^[A-Za-z0-9][A-Za-z0-9\s-]{3,10}$/.test(answer)) {
    let got = null;
    for (const hubUrl of [...new Set(links.map((l) => l.hubUrl))]) {
      const r = await redeemCode(hubUrl, cleanJoinCode(answer));
      if (r.key) { got = { hubUrl, key: r.key, name: r.floor || '' }; break; }
      if (r.status !== 404) console.log(`   ${r.error}`);
    }
    if (!got) { console.log('   이 참가 코드를 아는 허브가 없습니다. 관리자에게 코드를 다시 확인해 주세요.'); continue; }
    console.log(`   → "${got.name}" 층 참가 코드입니다.`);
    link = got;
    break;
  }
  link = parseLink(answer);
  if (!link) { console.log(`   링크 형식이 아닙니다. 받은 링크를 통째로 붙여 넣어 주세요${links.length ? '(또는 참가 코드)' : ''}.`); continue; }
  // An invite: the hub named in it trades the code for the room's key.
  if (link.code) {
    const r = await redeemCode(link.hubUrl, link.code);
    if (!r.key) { console.log(`   ${r.error}`); link = null; continue; }
    link = { hubUrl: link.hubUrl, key: r.key, name: r.floor || '' };
    console.log(`   → "${link.name}" 방 참가 링크입니다.`);
    break;
  }
  const info = await floorOf(link);
  if (info.bad) { console.log('   이 링크는 허브가 받지 않습니다(키가 틀렸거나 층이 삭제됨). 관리자에게 새 링크를 받아 주세요.'); link = null; continue; }
  if (info.offline) console.log('   허브에 지금 연결되지 않습니다(꺼져 있을 수 있음). 설정은 저장하고, 켜지면 자동으로 연결됩니다.');
  if (info.name) console.log(`   → "${info.name}" 층 링크입니다.`);
  link.name = info.name || '';
  break;
}

if (link) {
  const same = links.find((l) => l.hubUrl === link.hubUrl && l.key === link.key);
  if (same) same.name = link.name || same.name;
  else links.push(link);
}

cfg.user = { id: cfg.user.id, name };
// Links replace the old single-link fields.
const { key, hubUrl, ...rest } = cfg.team;
cfg.team = { ...rest, links };
saveConfig(file, cfg);

// Start with Windows by default; autostart-off.cmd turns it off. Skipped for a
// custom config (a rehearsal), since the shortcut would not carry it.
const autostart = process.platform === 'win32' && !process.env.TEAM_PET_CONFIG && links.length ? autostartOn('collector').message : '';
const icon = !process.env.TEAM_PET_CONFIG && links.length ? desktopShortcut(cfg.port).message : '';
closePrompt();

console.log(`\n저장했습니다: ${file}`);
console.log(`  이름: ${name}`);
if (links.length) links.forEach((l, i) => console.log(`  연결 ${i + 1}: ${label(l)}`));
else console.log('  연결: 없음');
if (autostart) console.log(`  자동 실행: ${autostart}`);
if (icon) console.log(`  ${icon}`);
if (!links.length) {
  console.log('\n연결된 층이 없어 펫을 시작하지 않습니다.\n');
  process.exit(1);
}
console.log('\n이제 팀 펫을 창 없이 뒤에서 켭니다. 끄려면 stop-collector.cmd, 다시 켜려면 start-collector.cmd.');
console.log('다른 층(다른 관리자)에도 속하면 setup.cmd 를 다시 실행해 그 링크를 추가하세요.\n');
