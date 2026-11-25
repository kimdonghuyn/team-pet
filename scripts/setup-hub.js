#!/usr/bin/env node
// 관리자 설치 도우미: 이 PC 에 팀 펫 허브를 차린다.
// 질문: 내 이름 · 첫 층 이름. 키와 참가 코드는 허브가 켜질 때 만든다.
// 다시 실행하면 층을 하나 더 추가할 수 있다.
import { configPath, loadConfig, saveConfig } from '../server/config.js';
import { newKey } from '../server/team.js';
import { autostartOn } from './autostart.js';
import { desktopShortcut } from './desktop-shortcut.js';
import { ask, closePrompt } from './picker.js';

const file = configPath();
const cfg = loadConfig(file);
const first = !cfg.floors.length;

console.log('\n=== 팀 펫 — 관리자 설치 ===\n');
console.log('이 PC 에 우리 팀 펫 허브를 차립니다. 팀원들의 펫이 이 PC 를 거쳐 대화하고 게임을 합니다.');
console.log('(Enter = 괄호 안 값 그대로)\n');

const name = await ask(`1) 펫 대화에 보일 내 이름 (${cfg.user.name}): `, cfg.user.name);

if (cfg.floors.length) console.log(`\n   지금 있는 층: ${cfg.floors.map((f) => f.name).join(', ')}`);
let floorName = '';
while (!floorName) {
  floorName = await ask(`2) ${first ? '첫 층 이름 — 대화방 이름 (예: 개발팀)' : '추가할 층 이름 (그냥 Enter = 추가 안 함)'}: `);
  if (!floorName && !first) break;
  if (floorName.length > 30 || /[#?&]/.test(floorName)) { console.log('   1~30자, # ? & 는 쓸 수 없습니다.'); floorName = ''; }
}
if (floorName && !cfg.floors.some((f) => f.name === floorName)) cfg.floors.push({ name: floorName, key: newKey() });
cfg.user = { id: cfg.user.id, name };
cfg.team.key ||= newKey();
saveConfig(file, cfg);

const autostart = process.platform === 'win32' && !process.env.TEAM_PET_CONFIG ? autostartOn('hub').message : '';
const icon = !process.env.TEAM_PET_CONFIG ? desktopShortcut(cfg.port).message : '';
closePrompt();

console.log(`\n저장했습니다: ${file}`);
console.log(`  이름: ${name}`);
console.log(`  층: ${cfg.floors.map((f) => f.name).join(', ')}`);
if (autostart) console.log(`  자동 실행: ${autostart}`);
if (icon) console.log(`  ${icon}`);
console.log(`\n이제 허브를 창 없이 뒤에서 켭니다. 브라우저에서 http://localhost:${cfg.port} 가 열립니다.`);
console.log('오른쪽 "층 관리" 의 참가 코드를 팀원에게 알려 주세요. 팀원은 설치한 뒤 화면에 그 코드를 넣습니다.');
console.log('끄려면 stop-hub.cmd, 다시 켜려면 start-hub.cmd.\n');
