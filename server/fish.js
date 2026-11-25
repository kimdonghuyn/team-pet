// 🎣 낚시: cast from the pet (or the page), wait for the bite, click within a moment. The hub
// times the bite and picks the catch, so nobody's screen decides what they get; each person's
// catches make a picture book per floor, and a rare one is said on the floor for everyone.
// What each catch looks like is in server/fish-art.js.
import { art, packed } from './fish-art.js';

export const RARITY = {
  common: { name: '흔함', mark: '', color: '#9AA0B5', weight: 45 },
  uncommon: { name: '가끔', mark: '', color: '#6FCF97', weight: 27 },
  rare: { name: '드묾', mark: '✨', color: '#5DADEC', weight: 13 },
  epic: { name: '아주 드묾', mark: '💎', color: '#B98AF0', weight: 4.5 },
  legend: { name: '전설', mark: '🌟', color: '#FFC94D', weight: 1.5 },
  junk: { name: '꽝', mark: '', color: '#A08C78', weight: 9 },
};
// Said on the floor when caught.
const LOUD = new Set(['rare', 'epic', 'legend']);

// 🎣 도감 낚싯대, raised by ⚒️ 강화: every catch on a floor earns points (POINTS, twice for a kind
// new to my book; none in a contest), and a step is tried for with them once the book has `need`
// kinds: `cost` points, `rate`% to go up, `brk`% to break (down one, two or all the way: BREAK; a 🛡 charm, one per legend
// landed, stops it), else it fails. Each fail fills 장인의 기운 by half the rate; full, the next try
// cannot fail. Each step makes the rarer ones (드묾 · 아주 드묾 · 전설) a little likelier (up: +2% …
// +40% on their odds, taken from 가끔 alone), never in a contest. line and bob (top, bottom) colour
// the line and the float on every screen; the rod's own picture is client/assets/rods/rod-NN.png
// (scripts/make-rods.js), and from step 10 a sky too.
export const RODS = [
  { name: '🪵 초보 낚싯대', need: 0, up: 0, line: '#DDE6F2', bob: ['#E5484D', '#F2F2F2'] },
  { name: '🎋 청죽', need: 5, cost: 5, rate: 95, brk: 0, up: 0.02, line: '#DDE6F2', bob: ['#E5484D', '#F2F2F2'] },
  { name: '🪶 바람깃', need: 10, cost: 8, rate: 90, brk: 0, up: 0.04, line: '#E8EEF8', bob: ['#5B8DEF', '#FFFFFF'] },
  { name: '⚓ 강철 닻', need: 17, cost: 12, rate: 85, brk: 0, up: 0.07, line: '#C8D0DA', bob: ['#E5484D', '#F2F2F2'] },
  { name: '🌊 심해 카본', need: 25, cost: 18, rate: 80, brk: 0, up: 0.10, line: '#9FD8FF', bob: ['#4FC3F7', '#E8F8FF'] },
  { name: '🍃 비취 용골', need: 34, cost: 24, rate: 70, brk: 5, up: 0.13, line: '#CFFFF0', bob: ['#2EA886', '#E6FFF6'] },
  { name: '❄️ 빙결', need: 44, cost: 30, rate: 60, brk: 8, up: 0.16, line: '#E6F6FF', bob: ['#7FC8EF', '#FFFFFF'] },
  { name: '🔥 불꽃 단조', need: 55, cost: 38, rate: 50, brk: 10, up: 0.19, line: '#FFC27A', bob: ['#FF7A2A', '#FFF2E0'] },
  { name: '🌙 월광', need: 68, cost: 45, rate: 45, brk: 12, up: 0.22, line: '#EEF3FF', bob: ['#B8C4FF', '#FFFFFF'] },
  { name: '☀️ 태양의 금장', need: 82, cost: 60, rate: 40, brk: 15, up: 0.25, line: '#FFE08A', bob: ['#F2C94C', '#FFF8E1'], sky: true },
  { name: '⚡ 뇌전', need: 98, cost: 75, rate: 35, brk: 18, up: 0.28, line: '#CFE0FF', bob: ['#5A8AFF', '#EEF4FF'], sky: true },
  { name: '💎 수정 결정', need: 116, cost: 90, rate: 30, brk: 20, up: 0.31, line: '#E9DCFF', bob: ['#B48CF0', '#F6F0FF'], sky: true },
  { name: '🌈 오로라', need: 136, cost: 105, rate: 25, brk: 25, up: 0.34, line: '#9FF0D0', bob: ['#FF6B6B', '#FFFFFF'], sky: true },
  { name: '🌌 은하수', need: 160, cost: 128, rate: 20, brk: 30, up: 0.37, line: '#D8C8FF', bob: ['#B48CF0', '#F6F0FF'], sky: true },
  { name: '🐉 흑룡의 숨결', need: 200, cost: 150, rate: 15, brk: 35, up: 0.40, line: '#FFB070', bob: ['#FF5A2A', '#E0A83A'], sky: true },
];
// ⚒️ 강화 points a catch earns, by its rarity (twice for a kind new to my book).
export const POINTS = { junk: 1, common: 1, uncommon: 2, rare: 5, epic: 12, legend: 30 };
const MAX_CHARMS = 3;
// How hard a break (6강 up) hits: of every break, ☠️ 5% back to the first rod, 💥💥 25% two
// steps down, the rest one.
const BREAK = { zero: 0.05, two: 0.25 };

// The book. cm: [smallest, biggest]; when: more of them at night, in the rain or the snow
// (a floor's /비 or /눈 within the last minute); w: how often within its rarity (default 1).
const F = (id, name, rarity, cm, desc, look, more = {}) => ({ id, name, rarity, cm, desc, look, ...more });
// A few things that come up with something different each time.
const NOTES = ['“오늘도 수고했어요!”', '“커밋은 자주, 푸시는 신중히.”', '“점심 뭐 먹지?” — 영원한 질문이 적혀 있어요.', '“이 편지를 받은 사람은 오늘 칼퇴합니다.”',
  '“금요일까지 조금만 힘내요!”', '“버그는 내일의 내가 고칠 거야.”', '“물 한 잔 마시고 기지개 쭉!”', '“당신이 짠 코드, 꽤 멋져요.”'];
export const FISH = [
  // ── 흔함 ──
  F('pirami', '피라미', 'common', [8, 15], '개울 어디에나 있는 날쌘 친구. 짝짓기 철엔 몸에 분홍 물이 들어요.',
    { len: 66, h: 10, body: '#C3CDD4', backColor: '#7F98A8', bellyColor: '#F1F4F6', fin: '#EFA9A6', pattern: { type: 'stripes', n: 6, color: '#9BB3D6', op: 0.45, w: 0.035 } }),
  F('bungeo', '붕어', 'common', [10, 35], '못이든 강이든 묵묵히 사는 국민 민물고기.',
    { len: 62, h: 17, hump: 0.4, body: '#B49C5E', backColor: '#7D6A3C', bellyColor: '#E7DBAA', fin: '#9C8550', dorsal: 'long', pattern: { type: 'scales' } }),
  F('songsari', '송사리', 'common', [2, 4], '몸은 쪼끄매도 눈은 왕방울.',
    { len: 56, h: 9, body: '#DDD2B8', backColor: '#B8A985', bellyColor: '#F4EFE2', fin: '#E3D6B5', tail: 'square', dorsal: 'soft', eye: 1.6, cheek: true, shine: 0.4 }),
  F('mikkuraji', '미꾸라지', 'common', [10, 20], '비 오는 날이면 신나서 꼬물꼬물 올라와요.',
    { shape: 'eel', h: 6, wave: 4, body: '#9B8657', belly: '#D9CBA2', spots: '#5E4F2E', fin: 2.2, finFrom: 0.55, whiskers: true, taper: 0.55, tailPow: 2 }, { when: 'rain', w: 1.2 }),
  F('mangdung', '망둥어', 'common', [10, 25], '갯벌에서 폴짝폴짝. 바늘을 겁 없이 덥석 물어요.',
    { len: 64, h: 14, hump: 0.2, nose: 0.3, body: '#A99A79', bellyColor: '#E4DCC6', fin: '#B9AA88', tail: 'round', dorsal: ['soft', 'small'], dorsalAt: null, eye: 1.4, eyeUp: 0.5, eyeAt: 0.13, pattern: { type: 'spots', n: 16, color: '#6E604A', r: 1.6 }, pelvic: 'big', mouth: 'big' }),
  F('jeoneo', '전어', 'common', [15, 30], '집 나간 며느리도 돌아온다는 가을 전어.',
    { len: 66, h: 15, body: '#C8D5E2', backColor: '#5E82AA', backTo: 0.05, bellyColor: '#F2F5F8', fin: '#B9C6D3', pattern: { type: 'row', n: 1, r: 2.4, color: '#2E3A4A', y: 0.05 } }),
  F('godeungeo', '고등어', 'common', [25, 45], '등엔 물결무늬, 배는 은빛. 밥상의 단골.',
    { len: 74, h: 13, body: '#A3C3D1', backColor: '#3F7F9A', backTo: 0.05, bellyColor: '#EEF3F6', fin: '#7FA4B6', tail: 'moon', tailLen: 22, extras: ['finlets'], finletColor: '#C9D6DE', pattern: { type: 'waves', color: '#1F4A5E', n: 7 } }),
  F('jeongeori', '정어리', 'common', [12, 22], '떼로 다니면 바다가 반짝반짝.',
    { len: 66, h: 11, body: '#C9D6E0', backColor: '#3E6FA0', backTo: 0.1, bellyColor: '#F4F7FA', fin: '#AFC0CF', pattern: { type: 'row', n: 6, r: 1.4, color: '#25384D', y: 0.12 } }),
  F('myeolchi', '멸치', 'common', [5, 13], '작아도 국물 맛은 내가 책임진다.',
    { len: 66, h: 7.5, body: '#CCD9E1', bellyColor: '#F4F8FA', fin: '#DCE6EC', eye: 1.2, pattern: { type: 'line', color: '#EAF4FA', t: 0.35, op: 0.9 }, shine: 0.5, dorsal: 'tiny' }, { w: 1.3 }),
  F('bingeo', '빙어', 'common', [8, 15], '꽁꽁 언 호수 얼음 구멍에서 올라오는 투명한 물고기.',
    { len: 64, h: 8.5, body: '#DCE8EF', bellyColor: '#F6FAFC', fin: '#E8F0F5', eye: 1.25, pattern: { type: 'line', color: '#AFC6DE', t: 0.25 }, shine: 0.55, dorsal: ['small', 'adipose'] }, { when: 'snow', w: 0.9 }),
  F('ureok', '우럭', 'common', [20, 45], '바위틈의 터줏대감. 매운탕 하면 이 친구.',
    { len: 64, h: 17, hump: 0.3, nose: 0.4, body: '#6A6862', bellyColor: '#A9A69C', fin: '#5A5852', dorsal: 'spiky', tail: 'round', mouth: 'big', eye: 1.2, pattern: { type: 'blobs', n: 4, color: '#3E3C38', rx: 0.08, ry: 0.4, op: 0.7 } }),
  F('noraemi', '노래미', 'common', [15, 35], '얼룩덜룩 바위색 옷을 입은 숨바꼭질 선수.',
    { len: 68, h: 14, body: '#8E7C50', bellyColor: '#CBBE96', fin: '#7D6C45', dorsal: 'long', anal: 'long', tail: 'square', pattern: { type: 'blobs', n: 5, color: '#5C4C2B', rx: 0.07, ry: 0.35, op: 0.75 } }),
  F('bajirak', '바지락', 'common', [3, 5], '갯벌을 파면 쏙쏙. 칼국수의 친구.',
    { shape: 'shell', body: '#D8C8A8', bands: '#8E7756' }, { w: 0.8 }),
  F('beodeulchi', '버들치', 'common', [8, 15], '맑은 계곡 상류에 사는 수수한 토박이.',
    { len: 66, h: 10.5, body: '#A9A27E', backColor: '#6F6A4E', bellyColor: '#E6E1C9', fin: '#9C9573', pattern: { type: 'spots', n: 20, color: '#4E4A36', r: 1, op: 0.6 } }),
  F('moraemuji', '모래무지', 'common', [10, 25], '모래 속에 쏙 숨는 숨바꼭질 장인.',
    { len: 70, h: 10, nose: 0.4, body: '#C9B993', bellyColor: '#F1EBDA', fin: '#BBAA82', extras: ['barbels'], pattern: { type: 'blobs', n: 6, color: '#7A6A48', rx: 0.04, ry: 0.25, op: 0.6 } }),
  F('olchaengi', '올챙이', 'common', [2, 5], '뒷다리가 쏙! 곧 개구리가 될 거예요.', { shape: 'tadpole', body: '#4A4A3A', belly: '#9C9A7E' }, { when: 'rain' }),
  F('jeongaengi', '전갱이', 'common', [15, 35], '점심시간에 유난히 잘 무는 은빛 등푸른 생선.',
    { len: 70, h: 12.5, body: '#B7C7D3', backColor: '#55788F', backTo: 0.1, bellyColor: '#EEF2F5', fin: '#C9B868', extras: ['finlets'], finletColor: '#C9D6DE', pattern: { type: 'line', color: '#E3D27A', t: 0.14, op: 0.7 } }, { when: 'lunch', w: 1.2 }),
  F('kkongchi', '꽁치', 'common', [25, 35], '가을 바다의 날씬한 은빛 화살.',
    { len: 80, x0: 12, h: 8, nose: 0.9, body: '#C3D0DA', backColor: '#2E4E73', backTo: 0.05, bellyColor: '#F2F5F8', fin: '#5D7591', tailLen: 18, extras: ['finlets', 'sword'], finletColor: '#F2C14E' }),
  F('hakkkongchi', '학꽁치', 'common', [20, 40], '아래턱이 학 부리처럼 쭉 뻗었어요.',
    { len: 76, x0: 16, h: 7, nose: 0.9, body: '#D3E0E8', backColor: '#6E8FA8', backTo: 0.12, bellyColor: '#F5F8FA', fin: '#B8C8D4', tailLen: 18, extras: ['jaw'], pattern: { type: 'line', color: '#7F9DB5', t: 0.12, op: 0.7 } }),
  F('daseulgi', '다슬기', 'common', [1, 3], '맑은 냇물 돌에 붙어 사는 꼬마 고둥.', { shape: 'snail', kind: 'melania', body: '#4E4A3A', bands: '#7E7458' }),
  F('honghap', '홍합', 'common', [5, 10], '바위에 붙어 사는 까만 조개. 국물이 끝내줘요.', { shape: 'shell', kind: 'mussel', body: '#2E3247', bands: '#5E6690' }),
  F('sora', '소라', 'common', [8, 15], '귀에 대면 바다 소리가 들린다는 뿔 고둥.', { shape: 'snail', kind: 'conch', body: '#C9A27A', bands: '#8C6440' }),
  F('bangge', '방게', 'common', [3, 5], '갯벌을 옆으로 쌩쌩 달리는 꼬마 게.', { shape: 'crab', body: '#6E6A4E', claw: '#C9785A', spots: '#A8A27E' }),
  F('galgyeoni', '갈겨니', 'common', [10, 20], '눈이 커다란 냇가 친구. 피라미의 사촌이에요.',
    { len: 66, h: 10.5, body: '#B9C4C9', backColor: '#5E7480', bellyColor: '#EEF2F3', fin: '#CFA7A0', eye: 1.35, pattern: { type: 'line', color: '#3E5664', t: 0.16, op: 0.75 } }),
  F('napjaru', '납자루', 'common', [5, 10], '조개 속에 알을 낳는 꾀돌이.',
    { len: 56, x0: 20, h: 15, hump: 0.4, body: '#A9B6B0', bellyColor: '#E2E8E4', fin: '#D47F7F', dorsal: 'long', anal: 'long', pattern: { type: 'line', color: '#5E8FA8', t: 0.12, y: 0.05, from: 0.45, op: 0.8 } }),
  F('gaksibungeo', '각시붕어', 'common', [3, 5], '짝짓기 철엔 무지갯빛으로 꽃단장해요.',
    { len: 50, x0: 22, h: 15, hump: 0.42, body: '#B7C2C9', bellyColor: '#E9D9E6', fin: '#E07C8E', dorsal: 'long', anal: 'long', cheek: true, eye: 1.25, pattern: [{ type: 'line', color: '#7E9FD6', t: 0.12, from: 0.4, op: 0.8 }, { type: 'patch', color: '#E89AB5', at: 0.3, y: 0.2, rx: 0.08, ry: 0.35, op: 0.6 }] }),
  F('mireo', '밀어', 'common', [4, 8], '돌 밑에 딱 붙어 사는 꼬마 망둑.',
    { len: 60, h: 9, hump: 0.2, nose: 0.3, body: '#A49A7E', bellyColor: '#E2DCCB', fin: '#B3A988', tail: 'round', dorsal: ['soft', 'small'], eye: 1.3, eyeUp: 0.45, pelvic: 'big', pattern: { type: 'blobs', n: 5, color: '#6B624A', rx: 0.05, ry: 0.3, op: 0.7 } }),
  F('dongsari', '동사리', 'common', [10, 20], '넓적한 머리로 바닥에 숨어 사냥해요. 별명은 구구리.',
    { len: 64, h: 12, hump: 0.25, nose: 0.3, body: '#7C6E54', bellyColor: '#C7BCA2', fin: '#6E614A', tail: 'round', dorsal: ['soft', 'small'], mouth: 'big', pattern: { type: 'saddles', n: 4, color: '#3F362A', deep: 0.3 } }),
  F('bluegill', '블루길', 'common', [10, 25], '아가미 끝에 파란 점. 멀리 바다 건너 왔어요.',
    { len: 56, x0: 20, h: 19, hump: 0.4, nose: 0.6, body: '#7E8F62', bellyColor: '#E4A85E', fin: '#6E7D54', dorsal: ['spiky', 'soft'], tail: 'square', pattern: [{ type: 'stripes', n: 6, color: '#4F5C3C', op: 0.5, w: 0.05 }, { type: 'eyespot', color: '#2A3E78' }] }),
  F('bass', '배스', 'common', [25, 60], '입이 엄청 큰 외래종 사냥꾼. 손맛은 좋아요.',
    { len: 70, h: 15, nose: 0.45, body: '#8EA06A', backColor: '#55663A', bellyColor: '#E9ECD8', fin: '#7A8C58', dorsal: ['spiky', 'soft'], mouth: 'big', pattern: { type: 'blobs', n: 6, color: '#3D4A28', rx: 0.06, ry: 0.18, op: 0.75 } }),
  F('borimyeol', '보리멸', 'common', [15, 30], '모래사장 앞바다의 날씬한 은빛 아가씨.',
    { len: 72, x0: 12, h: 9, nose: 0.55, body: '#E3D9C2', bellyColor: '#F7F2E7', fin: '#E8D9B0', dorsal: ['small', 'soft'], shine: 0.45 }),
  F('jwichibaby', '쥐치 새끼', 'common', [3, 8], '아직 뿔도 쪼끄만 아기 쥐치.',
    { len: 44, x0: 30, h: 16, hump: 0.4, nose: 0.85, body: '#B4BDB8', bellyColor: '#DCE1DD', fin: '#D8C27A', tail: 'square', tailLen: 14, dorsal: ['tiny', 'long'], dorsalAt: null, anal: 'long', eye: 1.5, cheek: true, extras: ['lips'], pattern: { type: 'spots', n: 10, color: '#6E7873', r: 1.2 } }),
  F('bollakbaby', '볼락 치어', 'common', [3, 6], '왕눈이 볼락의 아기. 눈만 보여요!',
    { len: 46, x0: 28, h: 13, body: '#B08070', bellyColor: '#E0C5B8', fin: '#9A6A5A', dorsal: 'spiky', tail: 'square', tailLen: 16, eye: 2, cheek: true }),
  F('kkolttugi', '꼴뚜기', 'common', [5, 10], '어물전 망신은 꼴뚜기가… 그래도 귀여워요.', { shape: 'squid', body: '#E8C8D0', dots: '#B06A7A' }),
  F('jaecheop', '재첩', 'common', [1, 3], '강 모래 속 꼬마 조개. 재첩국 한 그릇!', { shape: 'shell', body: '#6E6450', bands: '#9C8F6E' }),
  F('kkomak', '꼬막', 'common', [3, 6], '골이 쭉쭉 파인 쫄깃한 조개.', { shape: 'shell', kind: 'cockle', body: '#D9CDB8', bands: '#7A6A52' }),
  F('garibi', '가리비', 'common', [8, 15], '부채 모양 껍데기. 가장자리에 눈이 수십 개래요!', { shape: 'shell', kind: 'scallop', body: '#E89A6A', bands: '#C26A3E' }),
  F('swiri', '쉬리', 'common', [8, 15], '맑은 여울에서만 사는 한국 토종. 몸에 주황 줄무늬가 예뻐요.',
    { len: 66, h: 9.5, body: '#C9BFA0', bellyColor: '#F1ECDD', fin: '#D9C9A0', pattern: [{ type: 'line', color: '#E8803E', t: 0.2, y: -0.05, op: 0.85 }, { type: 'line', color: '#3E4A6E', t: 0.14, y: -0.4, op: 0.7 }] }),
  F('chambungeo', '참붕어', 'common', [5, 12], '붕어보다 작고 날씬한, 연못의 단골 손님.',
    { len: 62, h: 12, body: '#B9B08E', backColor: '#7D7658', bellyColor: '#ECE6CE', fin: '#A89E7A', pattern: { type: 'line', color: '#4E4A36', t: 0.12, op: 0.5 } }),
  F('molgae', '몰개', 'common', [5, 10], '떼로 몰려다니는 작은 은빛 피라미 친척.',
    { len: 60, h: 9, body: '#D3D9DE', backColor: '#9AAAB6', bellyColor: '#F4F7F9', fin: '#E3E8EC', eye: 1.3, shine: 0.45, dorsal: 'soft' }, { w: 1.2 }),
  F('dorumuk', '도루묵', 'common', [15, 25], '"말짱 도루묵"의 그 물고기. 겨울에 알배기가 맛있어요.',
    { len: 66, h: 13, nose: 0.4, body: '#C9C2A8', backColor: '#8C8466', bellyColor: '#F4F0E4', fin: '#B8B096', mouth: 'big', dorsal: ['small', 'soft'], pattern: { type: 'blobs', n: 5, color: '#6E664C', rx: 0.05, ry: 0.25, op: 0.5 } }, { when: 'snow', w: 1.1 }),
  F('yangmiri', '양미리', 'common', [10, 20], '가늘고 긴 겨울 바다의 간식. 구워 먹으면 고소해요.',
    { len: 82, x0: 10, h: 6.5, nose: 0.8, body: '#C8D2D8', backColor: '#7E9AA8', bellyColor: '#F2F5F7', fin: '#D8E0E5', tailLen: 14, dorsal: 'long', anal: 'long' }),
  F('cheongeo', '청어', 'common', [20, 35], '등은 푸르고 배는 은빛. 과메기의 원조예요.',
    { len: 70, h: 12, body: '#B8C8D6', backColor: '#3E6E9A', backTo: 0.1, bellyColor: '#F1F4F7', fin: '#A8B8C6', shine: 0.45 }),
  F('nollaegi', '놀래기', 'common', [10, 25], '알록달록한 몸으로 갯바위를 누비는 장난꾸러기.',
    { len: 64, h: 13, nose: 0.45, body: '#7EB89A', bellyColor: '#E8D07A', fin: '#E89A6A', dorsal: 'long', anal: 'long', tail: 'round', pattern: [{ type: 'line', color: '#E8603E', t: 0.14, y: 0.1, op: 0.8 }, { type: 'spots', n: 10, color: '#3E7AB8', r: 1.3 }], cheek: true }),
  F('baekhap', '백합', 'common', [5, 10], '조개의 여왕. 맑은 국물이 시원해요.', { shape: 'shell', kind: 'cockle', body: '#E8E0D0', bands: '#A89878' }, { w: 0.8 }),

  // ── 가끔 ──
  F('ingeo', '잉어', 'uncommon', [30, 80], '수염 두 쌍, 비늘 반짝. 연못의 어르신.',
    { len: 66, h: 17, hump: 0.4, body: '#C49A4C', backColor: '#86672D', bellyColor: '#EBD7A2', fin: '#A9823F', dorsal: 'long', extras: ['barbels'], pattern: { type: 'scales', s: 5 } }),
  F('megi', '메기', 'uncommon', [30, 90], '넓적한 머리에 기다란 수염. 밤에 슬슬 나와요.',
    { len: 70, h: 13, hump: 0.15, nose: 0.25, back: 0.9, body: '#5F6651', bellyColor: '#C9C7B1', fin: '#4E543F', dorsal: 'tiny', anal: 'long', tail: 'round', mouth: 'big', eye: 0.8, eyeUp: 0.35, extras: ['whiskers'], pattern: { type: 'blobs', n: 4, color: '#4A4F3D', rx: 0.08, op: 0.5 } }, { when: 'night' }),
  F('ssogari', '쏘가리', 'uncommon', [20, 50], '표범 무늬를 두른 물속의 호랑이.',
    { len: 66, h: 15, nose: 0.45, body: '#D8B66C', bellyColor: '#F0DFB4', fin: '#C49A4C', dorsal: ['spiky', 'soft'], tail: 'round', mouth: 'big', pattern: { type: 'spots', n: 22, color: '#5A3E1B', r: 2.2 } }),
  F('kkeokji', '꺽지', 'uncommon', [12, 20], '아가미에 파란 점 하나. 한국에만 사는 토종이에요.',
    { len: 60, h: 15, body: '#6E6B45', bellyColor: '#A9A47A', fin: '#5C5938', dorsal: ['spiky', 'soft'], tail: 'round', pattern: [{ type: 'stripes', n: 6, color: '#4C4A2E', op: 0.55, w: 0.05 }, { type: 'eyespot' }] }),
  F('gamulchi', '가물치', 'uncommon', [40, 90], '뱀 머리를 닮은 힘센 사냥꾼. 손맛 최고.',
    { len: 82, x0: 8, h: 12, hump: 0.3, nose: 0.35, stem: 0.55, body: '#6B6A55', bellyColor: '#C2BFA2', fin: '#5A5946', dorsal: 'long', anal: 'long', tail: 'round', tailLen: 18, mouth: 'big', pattern: { type: 'saddles', n: 5, color: '#2F2E24', deep: 0.45 } }),
  F('songeo', '무지개송어', 'uncommon', [30, 60], '옆구리에 분홍빛 무지개 띠가 흘러요.',
    { len: 68, h: 13, body: '#A7B08F', backColor: '#6F7A5A', bellyColor: '#E9EADB', fin: '#9AA383', tail: 'square', dorsal: ['small', 'adipose'], pattern: [{ type: 'line', color: '#E58FA0', t: 0.42, op: 0.85 }, { type: 'spots', n: 26, color: '#3A3A2A', r: 1.1, upper: true }] }),
  F('euneo', '은어', 'uncommon', [15, 25], '갓 잡으면 수박 향이 나는 맑은 물의 귀공자.',
    { len: 70, h: 10, body: '#B9C2A8', backColor: '#7D8A68', bellyColor: '#EEF1E6', fin: '#E8D27A', dorsal: ['small', 'adipose'], pattern: { type: 'patch', color: '#F2D25C', at: 0.32, op: 0.85 } }),
  F('gwangeo', '광어', 'uncommon', [35, 80], '바닥에 납작. 두 눈이 한쪽에 몰려 있어요.',
    { shape: 'flat', body: '#8B7658', fin: '#7A6649', spots: '#5B4A33', spotN: 18 }),
  F('dodari', '도다리', 'uncommon', [20, 35], '봄 도다리 쑥국! 광어보다 동글동글해요.',
    { shape: 'flat', body: '#A88F68', fin: '#97805B', spots: '#E8A34A', spotN: 12 }),
  F('sungeo', '숭어', 'uncommon', [30, 70], '숭어가 뛰니 망둥어도 뛴다! 점프 선수.',
    { len: 70, h: 13, nose: 0.4, body: '#A9B3BC', backColor: '#5E6C79', bellyColor: '#EEF1F4', fin: '#8996A2', dorsal: ['soft', 'tiny'], pattern: { type: 'line', color: '#7A8794', t: 0.12, y: -0.2, op: 0.6 } }),
  F('bollak', '볼락', 'uncommon', [12, 25], '밤바다 방파제의 왕눈이.',
    { len: 62, h: 15, body: '#9E6E5C', bellyColor: '#D9B7A6', fin: '#8A5C4B', dorsal: 'spiky', tail: 'square', eye: 1.45, pattern: { type: 'stripes', n: 5, color: '#6B4436', op: 0.5, w: 0.06 } }, { when: 'night' }),
  F('galchi', '갈치', 'uncommon', [60, 150], '은빛 리본처럼 길쭉. 서서 헤엄치기도 해요.',
    { shape: 'eel', h: 6.5, wave: 3, waves: 1.6, body: '#D3DCE4', fin: 2.5, finColor: '#E9EEF3', finFrom: 0.1, jaw: true, sheen: 0.55, pectoral: false, taper: 0.97, tailPow: 1.1 }, { when: 'night' }),
  F('ojingeo', '오징어', 'uncommon', [20, 40], '밤바다 집어등 불빛을 따라오는 열 개 다리.',
    { shape: 'squid', body: '#F2DCD2', dots: '#C2725C' }, { when: 'night' }),
  F('kkotge', '꽃게', 'uncommon', [10, 25], '등딱지에 꽃무늬. 집게 조심!',
    { shape: 'crab', body: '#6F80B3', claw: '#7C8EC4', spots: '#E8F0FF' }),
  F('saeu', '새우', 'uncommon', [8, 20], '구부정한 허리, 길쭉한 더듬이.',
    { shape: 'shrimp', body: '#F4A9A0' }),
  F('bulgasari', '불가사리', 'uncommon', [10, 25], '별처럼 생겼지만 사실은 먹보.',
    { shape: 'star', body: '#F08A4B', dots: '#FFD8A8' }),
  F('seongge', '성게', 'uncommon', [5, 10], '가시투성이지만 속은 고소해요.',
    { shape: 'urchin', body: '#4B3A5C', spine: '#2D2238' }),
  F('nakji', '낙지', 'uncommon', [30, 70], '갯벌의 날쌘돌이. 다리가 길쭉길쭉.',
    { shape: 'octopus', body: '#B79A8C', suckers: '#F0E1D8', slim: true, long: 1.25 }),
  F('dongjagae', '동자개', 'uncommon', [15, 30], '잡으면 빠각빠각 운다는 빠가사리.',
    { len: 66, h: 12, hump: 0.2, nose: 0.3, body: '#B8933E', bellyColor: '#EED9A0', fin: '#9C7A30', dorsal: ['shark', 'adipose'], eye: 0.9, extras: ['whiskers'], pattern: { type: 'blobs', n: 3, color: '#5E4A1E', rx: 0.1, ry: 0.5, op: 0.7 } }, { when: 'night' }),
  F('kkeuri', '끄리', 'uncommon', [20, 40], '입이 ㅅ자로 꺾인 강의 사냥꾼.',
    { len: 72, h: 12, body: '#B8C3CC', backColor: '#4E6878', bellyColor: '#EEF1F4', fin: '#D99A8C', mouth: 'big', pattern: { type: 'stripes', n: 7, color: '#7FA0B8', op: 0.4, w: 0.03 } }),
  F('gangjunchi', '강준치', 'uncommon', [40, 100], '주걱턱이 위로 휙. 큰 강의 은빛 칼.',
    { len: 80, x0: 14, h: 12, hump: 0.45, body: '#D2DAE0', backColor: '#7D8E9C', bellyColor: '#F4F6F8', fin: '#B9C4CC', anal: 'long', extras: ['jaw'], shine: 0.45 }),
  F('nongeo', '농어', 'uncommon', [40, 100], '여름 바다의 은빛 장군. 점이 콕콕.',
    { len: 72, h: 14, nose: 0.5, body: '#B7C2C9', backColor: '#5A6E7C', bellyColor: '#EEF2F4', fin: '#8A9AA6', dorsal: ['spiky', 'soft'], mouth: 'big', pattern: { type: 'spots', n: 16, color: '#2E3A44', r: 1.1, upper: true } }),
  F('gamseongdom', '감성돔', 'uncommon', [25, 50], '낚시꾼들의 로망, 은회색 바다의 신사.',
    { len: 62, h: 18, hump: 0.34, nose: 0.6, body: '#9AA3A8', backColor: '#4E5960', bellyColor: '#DDE2E5', fin: '#4A5258', dorsal: 'spiky', pattern: { type: 'stripes', n: 6, color: '#5E686E', op: 0.35, w: 0.04 } }),
  F('bengedom', '벵에돔', 'uncommon', [25, 50], '파도 거품 속에서 노는 검은 돔. 눈이 파래요.',
    { len: 62, h: 17, hump: 0.36, nose: 0.65, body: '#3E4A4E', bellyColor: '#5E6A6E', fin: '#2E383C', dorsal: 'spiky', iris: '#2A6FA8', eye: 1.1, pattern: { type: 'scales', color: '#232C30', op: 0.6 } }),
  F('samchi', '삼치', 'uncommon', [50, 100], '겨울에 살이 오르는 날쌘 등푸른 생선.',
    { len: 82, x0: 8, h: 11, nose: 0.7, body: '#B9CCD8', backColor: '#3E6684', backTo: 0.05, bellyColor: '#F1F5F8', fin: '#6E8AA0', tail: 'moon', tailLen: 20, extras: ['finlets'], finletColor: '#C9D6DE', pattern: { type: 'spots', n: 22, color: '#2E5070', r: 1.2, upper: true } }),
  F('bangeo', '방어', 'uncommon', [50, 100], '눈 오는 겨울이 제철! 노란 띠가 멋져요.',
    { len: 76, h: 15, nose: 0.55, body: '#B7C9D6', backColor: '#3E6A90', backTo: 0.05, bellyColor: '#F1F5F8', fin: '#D9B84A', tail: 'moon', tailLen: 22, tailColor: '#D9B84A', pattern: { type: 'line', color: '#F2C94C', t: 0.12, y: -0.05, op: 0.9 } }, { when: 'snow' }),
  F('bungjangeo', '붕장어', 'uncommon', [40, 90], '퇴근 무렵 바다에서 스르르. 아나고라고도 해요.',
    { shape: 'eel', h: 6.5, body: '#7E6E5A', belly: '#E6DCC8', fin: 3, finColor: '#8C7C66', finFrom: 0.2, spots: '#F2EBDD' }, { when: 'evening' }),
  F('jukkumi', '주꾸미', 'uncommon', [10, 25], '봄 바다의 꼬마 문어. 소라 껍데기 속을 좋아해요.', { shape: 'octopus', body: '#B08A7C', suckers: '#F0E1D8', slim: true }),
  F('gabojingeo', '갑오징어', 'uncommon', [20, 40], '등에 단단한 뼈 갑옷을 품은 오징어.', { shape: 'squid', body: '#C9A88C', dots: '#5E4636' }),
  F('haesam', '해삼', 'uncommon', [10, 30], '바다의 인삼. 오돌토돌 몸에 좋아요.', { shape: 'cucumber', body: '#5E4A3E' }),
  F('meongge', '멍게', 'uncommon', [8, 15], '바다의 파인애플. 상큼 쌉싸름한 맛!', { shape: 'squirt', body: '#E86A4A' }),
  F('jeonbok', '전복', 'uncommon', [8, 20], '바위에 착 붙은 바다의 황제. 속은 무지갯빛.', { shape: 'abalone', body: '#7E6E52' }),
  F('soragae', '소라게', 'uncommon', [2, 8], '남의 집을 빌려 사는 이사 전문가.', { shape: 'hermit', body: '#C9A27A', bands: '#8C6440', crab: '#E8785A' }),
  F('nuchi', '누치', 'uncommon', [20, 50], '수염 한 쌍, 모래 바닥을 훑는 큰 강의 일꾼.',
    { len: 72, h: 13, nose: 0.45, body: '#C3C0A8', backColor: '#7E7B62', bellyColor: '#EEECE0', fin: '#A8A488', extras: ['barbels'], pattern: { type: 'scales', s: 4.5 } }),
  F('chammaja', '참마자', 'uncommon', [15, 25], '옆구리에 점이 줄줄이. 한국에만 사는 토종이에요.',
    { len: 66, h: 10.5, body: '#C9C3A8', bellyColor: '#F1EEE2', fin: '#B3AC90', extras: ['barbels'], pattern: { type: 'row', n: 8, r: 1.6, color: '#5E5A44', y: 0.05 } }),
  F('kkeokjeongi', '꺽정이', 'uncommon', [10, 17], '머리에 가시가 뾰족뾰족, 바닥의 수문장.',
    { len: 62, h: 12, hump: 0.25, nose: 0.3, body: '#8C8268', bellyColor: '#D9D2BE', fin: '#7A715A', tail: 'round', dorsal: ['spiky', 'soft'], pectoral: 'big', mouth: 'big', eyeUp: 0.45, pattern: { type: 'saddles', n: 3, color: '#4E4634', deep: 0.4 } }),
  F('sancheoneo', '산천어', 'uncommon', [20, 40], '눈 쌓인 계곡의 귀한 손님. 몸에 둥근 무늬가 있어요.',
    { len: 66, h: 13, body: '#A8AE98', backColor: '#5E6650', bellyColor: '#ECECE0', fin: '#E8A08C', dorsal: ['small', 'adipose'], pattern: [{ type: 'blobs', n: 6, color: '#5E6A5E', rx: 0.05, ry: 0.4, op: 0.6 }, { type: 'spots', n: 14, color: '#2E3428', r: 0.9, upper: true }] }, { when: 'snow' }),
  F('yeolmogeo', '열목어', 'uncommon', [30, 70], '눈이 빨갛게 빛나는 차가운 물의 귀족.',
    { len: 72, h: 13, body: '#9C9A7E', backColor: '#5A5844', bellyColor: '#E2DFCC', fin: '#7E7C62', iris: '#C9302C', dorsal: ['small', 'adipose'], pattern: { type: 'spots', n: 24, color: '#2E2C20', r: 1, upper: true } }, { when: 'snow' }),
  F('chamgajami', '참가자미', 'uncommon', [20, 35], '바닥에 납작. 노란 테두리가 포인트예요.', { shape: 'flat', body: '#8E7E62', fin: '#E8C25A', spots: '#5E5036', spotN: 10 }),
  F('norangaori', '노랑가오리', 'uncommon', [40, 120], '꼬리에 독가시! 노란 점박이 가오리.', { shape: 'ray', body: '#8C7A52', spots: '#E8C25A' }),
  F('ssombaengi', '쏨뱅이', 'uncommon', [15, 30], '울퉁불퉁 바위 같은 몸에 가시 지느러미.',
    { len: 60, h: 16, hump: 0.3, nose: 0.35, body: '#B4523E', bellyColor: '#E8A48C', fin: '#9C3E2E', dorsal: 'spiky', tail: 'round', pectoral: 'big', mouth: 'big', eye: 1.2, pattern: { type: 'blobs', n: 6, color: '#6E2A1E', rx: 0.06, ry: 0.3, op: 0.7 } }),
  F('dalgogi', '달고기', 'uncommon', [25, 50], '옆구리에 커다란 보름달 점이 하나!',
    { len: 56, x0: 20, h: 21, hump: 0.42, nose: 0.6, body: '#B9B8A8', bellyColor: '#DEDDD2', fin: '#8C8A78', dorsal: ['spiky', 'long'], dorsalAt: null, tail: 'round', mouth: 'big', pattern: { type: 'patch', color: '#2E2C26', at: 0.5, y: 0, rx: 0.09, ry: 0.42 } }),
  F('hwangeo', '황어', 'uncommon', [30, 50], '비 오는 봄날, 주황 띠를 두르고 강을 거슬러 와요.',
    { len: 72, h: 13, body: '#A8B0A8', backColor: '#4E5850', bellyColor: '#EEF0EC', fin: '#E8783E', pattern: [{ type: 'line', color: '#E8783E', t: 0.12, y: 0.35, op: 0.85 }, { type: 'line', color: '#E8783E', t: 0.1, y: -0.15, op: 0.6 }] }, { when: 'rain' }),
  F('nalchi', '날치', 'uncommon', [20, 35], '바다 위를 휙 나는 물고기! 지느러미가 날개예요.',
    { len: 70, h: 10, body: '#9CB8D0', backColor: '#2E5A84', backTo: 0.05, bellyColor: '#EEF3F8', fin: '#7EA0C0', pectoral: false, extras: ['wings'], wingColor: '#B9D4EC' }),
  F('daeha', '대하', 'uncommon', [15, 27], '가을 소금구이의 주인공, 큰 새우.', { shape: 'shrimp', body: '#C9B8A8' }),
  F('kijogae', '키조개', 'uncommon', [20, 30], '곡식 까부는 키를 닮은 커다란 조개.', { shape: 'shell', kind: 'pen', body: '#5E5A52', bands: '#9C968A' }),
  F('malmijal', '말미잘', 'uncommon', [5, 20], '바위에 핀 꽃 같지만 사실은 동물이에요.', { shape: 'anemone', body: '#E86A8C', tips: '#FFD0DC' }),
  F('gunso', '군소', 'uncommon', [10, 30], '바다의 토끼. 놀라면 보라색 먹물을 뿜어요.', { shape: 'slug', body: '#7E6A7E', spots: '#E8E0D8' }),
  F('seongdae', '성대', 'uncommon', [20, 40], '파란 날개 지느러미를 펼치면 나비 같아요.',
    { len: 68, h: 13, hump: 0.3, nose: 0.4, body: '#C9605A', bellyColor: '#F0D0C8', fin: '#B4504A', tail: 'square', pectoral: false, extras: ['wings'], wingColor: '#3EB0A8' }),
  F('daegu', '대구', 'uncommon', [40, 100], '입이 커서 대구(大口). 겨울 바다의 큰손이에요.',
    { len: 72, h: 16, nose: 0.45, body: '#B8A884', backColor: '#8C7C5A', bellyColor: '#F2ECDC', fin: '#A89874', mouth: 'big', dorsal: ['tall', 'soft'], extras: ['barbels'], pattern: { type: 'spots', n: 22, color: '#6E5E40', r: 1.4, upper: true } }, { when: 'snow' }),
  F('myeongtae', '명태', 'uncommon', [30, 60], '생태 · 동태 · 황태 · 코다리… 이름이 제일 많은 물고기.',
    { len: 74, h: 12, nose: 0.6, body: '#C2B8A2', backColor: '#8A7E66', bellyColor: '#F2EEE4', fin: '#B2A88E', dorsal: ['small', 'soft'], extras: ['jaw'], pattern: { type: 'line', color: '#6E644E', t: 0.1, y: 0.05, op: 0.45 } }),
  F('mineo', '민어', 'uncommon', [40, 90], '여름 보양식의 으뜸. 부레가 쫄깃해요.',
    { len: 72, h: 16, body: '#A8A49A', backColor: '#6E6A62', bellyColor: '#EEECE6', fin: '#8C887E', dorsal: 'long', tail: 'square', mouth: 'big' }),
  F('imyeonsu', '임연수어', 'uncommon', [30, 50], '"껍질 쌈 싸 먹다 배 망했다"는 그 생선.',
    { len: 72, h: 13, body: '#D8C890', backColor: '#5E5A3E', bellyColor: '#F4F0DC', fin: '#C9B878', dorsal: 'long', anal: 'long', pattern: { type: 'saddles', n: 5, deep: 0.1 } }),
  F('mulmegi', '물메기', 'uncommon', [30, 50], '흐물흐물 못생겨도 해장국은 최고. 곰치라고도 불러요.',
    { len: 66, h: 15, hump: 0.3, nose: 0.3, body: '#B8A8A8', bellyColor: '#E8DEDC', fin: '#A8989A', tail: 'round', dorsal: 'long', anal: 'long', mouth: 'big', eye: 0.8, shine: 0.5 }, { when: 'snow' }),
  F('chamge', '참게', 'uncommon', [6, 10], '집게발에 털이 북슬북슬. 가을 강가의 별미.', { shape: 'crab', body: '#5E6A4A', claw: '#7E7A50', spots: '#9CA87E' }),
  F('pippul', '피뿔고둥', 'uncommon', [10, 20], '삶아서 이쑤시개로 쏙! 술안주의 단골이에요.', { shape: 'snail', kind: 'conch', body: '#D8A878', bands: '#A8683E' }),
  F('hongeo', '홍어', 'uncommon', [50, 100], '코끝이 찡한 그 맛. 마름모꼴로 넓적해요.', { shape: 'ray', body: '#9C8A7A', spots: '#E8D8C8' }),

  // ── 드묾 ✨ ──
  F('geumbungeo', '금붕어', 'rare', [8, 20], '살랑살랑 꼬리가 드레스 같아요.',
    { len: 50, x0: 18, h: 18, hump: 0.42, nose: 0.5, body: '#F27A3D', bellyColor: '#F9B36B', fin: '#F79A5C', tail: 'fan', tailLen: 22, dorsal: 'tall', eye: 1.3, cheek: true, shine: 0.4 }),
  F('bidaningeo', '비단잉어', 'rare', [40, 90], '헤엄치는 보석. 무늬가 하나도 같지 않대요.',
    { len: 66, h: 16, hump: 0.4, body: '#F7F3EA', fin: '#F4ECDD', dorsal: 'long', extras: ['barbels'], pattern: [{ type: 'koi', n: 3, color: ['#E2513B', '#E2513B', '#2B2B2B'], rx: 0.13, ry: 0.6, op: 0.95 }] }),
  F('baemjangeo', '뱀장어', 'rare', [50, 120], '깊은 바다에서 태어나 강을 거슬러 온 여행자.',
    { shape: 'eel', h: 7, body: '#4F5D3E', belly: '#D9D2A8', fin: 3.5, finColor: '#5E6B4B', finFrom: 0.3 }, { when: 'night' }),
  F('yeoneo', '연어', 'rare', [50, 90], '태어난 강으로 돌아온 빨간 연어. 갈고리 턱이 멋져요.',
    { len: 72, h: 15, body: '#C9564B', headColor: '#6E8B5A', headTo: 0.26, bellyColor: '#E8A296', fin: '#7E9A6A', tail: 'square', dorsal: ['small', 'adipose'], extras: ['hook'] }),
  F('chamdom', '참돔', 'rare', [30, 80], '바다의 여왕. 분홍 몸에 파란 점이 콕콕.',
    { len: 64, h: 19, hump: 0.33, nose: 0.6, body: '#E8828C', bellyColor: '#F6C6C8', fin: '#E26E7A', dorsal: 'spiky', pattern: { type: 'spots', n: 18, color: '#6FC3F0', r: 1.2, upper: true } }),
  F('bogeo', '복어', 'rare', [15, 40], '놀라면 풍선처럼 빵빵! 독이 있으니 요리는 전문가에게.',
    { shape: 'round', body: '#E9D18A', belly: '#FFFFFF', spots: '#5E4A2A', fin: '#D9BE6E' }),
  F('muneo', '문어', 'rare', [50, 150], '똑똑하기로 소문난 바다의 천재.',
    { shape: 'octopus', body: '#C2574B', suckers: '#F7D9C9' }),
  F('haepari', '해파리', 'rare', [10, 40], '둥실둥실 바다의 풍선. 만지면 따끔!',
    { shape: 'jelly', body: '#F2A7C8' }),
  F('nemo', '흰동가리', 'rare', [6, 11], '말미잘 집에 사는 그 주황색 물고기.',
    { len: 58, x0: 16, h: 16, hump: 0.4, nose: 0.65, body: '#F57C2B', fin: '#F57C2B', tail: 'round', tailLen: 18, dorsal: 'long', eye: 1.25, cheek: true, pattern: { type: 'bands' }, line: '#2A1E14' }),
  F('bluetang', '블루탱', 'rare', [15, 30], '자꾸 까먹는 그 파란 친구. 꼬리는 노랑!',
    { len: 60, x0: 16, h: 20, hump: 0.42, nose: 0.75, body: '#2F6FD6', fin: '#1E3F8A', tailColor: '#F4C430', tail: 'moon', tailLen: 18, dorsal: 'long', anal: 'long', pectoral: true, pecColor: '#F4C430', eye: 1.2, pattern: { type: 'tang', color: '#13285C', op: 0.95 } }),
  F('angel', '엔젤피시', 'rare', [10, 20], '길게 늘어진 지느러미가 천사의 날개 같아요.',
    { len: 46, x0: 26, h: 21, hump: 0.45, nose: 0.75, body: '#E4E1D5', fin: '#D9D4C2', tail: 'square', tailLen: 16, dorsal: 'veil', anal: 'veil', dorsalK: 1.3, pelvic: false, pattern: { type: 'stripes', n: 3, color: '#2B2B2B', w: 0.08, from: 0.25, to: 0.75 } }),
  F('betta', '베타', 'rare', [5, 8], '화려한 지느러미를 펄럭이는 싸움꾼.',
    { len: 48, x0: 18, h: 11, body: '#4B3FBF', fin: '#D93B5C', tail: 'veil', tailLen: 22, dorsal: 'veil', anal: 'veil', eye: 1.15, shine: 0.35 }),
  F('haema', '해마', 'rare', [5, 20], '아빠가 아기를 품어 낳는 신기한 물고기.',
    { shape: 'seahorse', body: '#F2B544', fin: '#F7D27A' }),
  F('jwichi', '쥐치', 'rare', [15, 30], '등에 뿔 하나, 입은 쪼옥. 쥐포가 되는 그 친구.',
    { len: 58, x0: 18, h: 19, hump: 0.4, nose: 0.85, body: '#9AA5A8', bellyColor: '#C9D0D2', fin: '#C9B26A', tail: 'square', tailLen: 18, dorsal: ['tiny', 'long'], dorsalAt: null, anal: 'long', extras: ['lips'], pattern: { type: 'spots', n: 20, color: '#5C6669', r: 1.3 } }),
  F('daege', '대게', 'rare', [15, 30], '대나무처럼 쭉 뻗은 다리. 겨울 바다의 별미.',
    { shape: 'crab', body: '#E3814B', claw: '#EE935C', spots: '#FFE0C2', longLegs: true }, { when: 'snow' }),
  F('jinju', '진주조개', 'rare', [8, 15], '입을 열면… 반짝이는 진주가!',
    { shape: 'shell', body: '#C9C2D9', bands: '#9C92B8', pearl: true }, { w: 0.6 }),
  F('lionfish', '쏠배감펭', 'rare', [20, 35], '줄무늬 갈기에 독가시. 바닷속 사자예요.',
    { len: 56, x0: 20, h: 15, body: '#F2E0D2', fin: '#E8A08C', dorsal: 'sail', dorsalK: 0.9, tail: 'round', pectoral: 'big', pecColor: '#E8B8A8', pattern: { type: 'stripes', n: 7, color: '#B4423A', w: 0.05, from: 0.05, to: 0.95 } }),
  F('gomchi', '곰치', 'rare', [60, 150], '바위 구멍에서 입을 쩍. 무서워 보여도 겁쟁이래요.',
    { shape: 'eel', h: 9, wave: 3, body: '#8C7A3E', fin: 4, finColor: '#7A6A34', finFrom: 0.12, spots: '#4E4220', pectoral: false, jaw: true, taper: 0.75 }, { when: 'night' }),
  F('doldom', '돌돔', 'rare', [30, 60], '검은 띠 일곱 줄, 갯바위 낚시의 제왕.',
    { len: 60, h: 19, hump: 0.36, nose: 0.65, body: '#D9D6C8', bellyColor: '#ECEAE0', fin: '#4E5054', dorsal: 'spiky', pattern: { type: 'stripes', n: 7, color: '#2E3034', w: 0.06, from: 0.05, to: 0.95 } }),
  F('hwangbok', '황복', 'rare', [20, 45], '봄이면 강을 거슬러 오는 노란 복어.', { shape: 'round', body: '#E8C25A', belly: '#FFFFFF', spots: '#3E3420', fin: '#E8D07A' }),
  F('nabigogi', '나비고기', 'rare', [10, 20], '눈을 가린 띠, 꼬리엔 가짜 눈. 산호초의 나비.',
    { len: 46, x0: 26, h: 21, hump: 0.45, nose: 0.85, body: '#F2D04A', fin: '#F2D04A', tail: 'square', tailLen: 14, dorsal: 'long', anal: 'long', extras: ['lips'], pattern: [{ type: 'stripes', n: 1, color: '#2E2A2A', w: 0.08, from: 0.17, to: 0.17 }, { type: 'patch', color: '#2E2A2A', at: 0.82, y: -0.35, rx: 0.06, ry: 0.22 }] }),
  F('parrotfish', '파랑비늘돔', 'rare', [30, 60], '산호를 갉아 모래를 만드는 앵무새 부리.',
    { len: 66, h: 17, hump: 0.4, nose: 0.7, body: '#3EB0A0', bellyColor: '#7ED0C0', fin: '#E87AA0', tail: 'moon', tailLen: 18, tailColor: '#E87AA0', dorsal: 'long', anal: 'long', extras: ['lips'], pattern: { type: 'scales', color: '#2E8070', op: 0.6 } }),
  F('mandarin', '만다린피시', 'rare', [5, 7], '사이키델릭한 무늬, 바닷속 패션왕.',
    { len: 50, x0: 22, h: 13, hump: 0.3, nose: 0.4, body: '#2E6AD0', fin: '#E8783E', tail: 'round', dorsal: ['tall', 'soft'], eye: 1.4, cheek: true, pattern: [{ type: 'blobs', n: 7, color: ['#F2903E', '#3EC0B0'], rx: 0.06, ry: 0.3, op: 0.95 }, { type: 'waves', color: '#F2C04A', n: 5, w: 1.2 }] }),
  F('piranha', '피라냐', 'rare', [15, 30], '이빨이 날카로운 아마존의 빨간 배.',
    { len: 56, x0: 22, h: 19, hump: 0.42, nose: 0.55, body: '#8C969E', bellyColor: '#D84A3A', fin: '#5E6870', mouth: 'big', dorsal: ['small', 'adipose'], extras: ['teeth'], pattern: { type: 'spots', n: 20, color: '#C9D0D4', r: 0.9, op: 0.7, upper: true } }),
  F('arowana', '아로와나', 'rare', [60, 100], '큰 비늘이 반짝이는 용의 물고기.',
    { len: 84, x0: 8, h: 12, hump: 0.25, nose: 0.3, body: '#D8C27A', bellyColor: '#F2E6B8', fin: '#C9A24A', dorsal: 'long', dorsalAt: [0.72, 0.95], anal: 'long', tail: 'round', extras: ['barbels'], shine: 0.5, pattern: { type: 'scales', s: 6, color: '#A8862E', op: 0.8 } }),
  F('upa', '우파루파', 'rare', [15, 25], '늘 웃는 얼굴의 아홀로틀. 아가미가 깃털 같아요.',
    { len: 64, h: 12, hump: 0.25, nose: 0.25, body: '#F5C6D2', bellyColor: '#FBE3EA', fin: '#F2B4C4', tail: 'round', tailLen: 22, dorsal: 'long', pelvic: false, anal: false, pectoral: false, gill: false, eye: 0.9, cheek: true, extras: ['frills', 'legs', 'smile'], frillColor: '#E8708E' }),
  F('discus', '디스커스', 'rare', [12, 20], '접시처럼 동글납작, 열대어의 왕.',
    { len: 46, x0: 26, h: 24, hump: 0.5, nose: 0.8, body: '#E8783E', fin: '#D8683A', tail: 'square', tailLen: 12, dorsal: 'long', anal: 'long', iris: '#C9302C', pattern: { type: 'waves', color: '#3E90C0', n: 6, w: 1.6 } }),
  F('guppy', '구피', 'rare', [2, 6], '꼬리가 무지개 드레스. 작지만 화려해요.',
    { len: 44, x0: 22, h: 8, body: '#C9C3B8', fin: '#5EB0E8', tail: 'veil', tailLen: 26, tailColor: '#E86A8C', dorsal: 'soft', eye: 1.4, cheek: true, pattern: { type: 'blobs', n: 3, color: ['#3E90E8', '#F2903E'], rx: 0.08, ry: 0.4, from: 0.55, to: 0.9 } }),
  F('neon', '네온테트라', 'rare', [2, 4], '밤이 되면 파란 네온 줄이 반짝!',
    { len: 52, x0: 20, h: 9, body: '#C9C3C0', fin: '#E8E0D8', dorsal: ['small', 'adipose'], eye: 1.4, extras: ['glow'], glowColor: '#7EE0FF', pattern: [{ type: 'line', color: '#3EC8F0', t: 0.24, y: -0.15, op: 0.95 }, { type: 'line', color: '#E83E4A', t: 0.26, y: 0.35, from: 0.5, op: 0.9 }] }, { when: 'night' }),
  F('boksom', '복섬', 'rare', [8, 15], '작은 복어. 하얀 점박이 옷을 입었어요.', { shape: 'round', body: '#6E7A52', belly: '#FFFFFF', spots: '#F2F0E0', fin: '#8C9A6E' }),
  F('ssoljonggae', '쏠종개', 'rare', [15, 30], '떼로 몰려다니는 줄무늬 바다 메기.',
    { len: 70, h: 11, hump: 0.2, nose: 0.3, body: '#5E4A3A', bellyColor: '#C9B8A8', fin: '#4E3E30', dorsal: 'shark', anal: 'long', tail: 'round', extras: ['whiskers'], pattern: [{ type: 'line', color: '#F2E8C8', t: 0.12, y: -0.2, op: 0.95 }, { type: 'line', color: '#F2E8C8', t: 0.12, y: 0.2, op: 0.95 }] }),
  F('triggerfish', '클라운 트리거피시', 'rare', [20, 40], '배에 커다란 하얀 물방울, 입술은 노랑.',
    { len: 58, x0: 20, h: 19, hump: 0.4, nose: 0.8, body: '#22223A', fin: '#22223A', tail: 'square', tailLen: 16, dorsal: ['tiny', 'long'], dorsalAt: null, anal: 'long', extras: ['lips'], pattern: [{ type: 'blobs', n: 4, color: '#FFFFFF', rx: 0.08, ry: 0.35, low: true, op: 1 }, { type: 'patch', color: '#F2C04A', at: 0.45, y: -0.55, rx: 0.12, ry: 0.2 }] }),
  F('moorish', '무어리시 아이돌', 'rare', [10, 20], '긴 깃발 지느러미를 휘날리는 산호초 아이돌.',
    { len: 42, x0: 28, h: 22, hump: 0.5, nose: 0.9, body: '#F2E8C8', fin: '#2E2A2A', tail: 'square', tailLen: 14, tailColor: '#2E2A2A', dorsal: 'veil', dorsalK: 1.6, anal: 'long', extras: ['lips'], pattern: [{ type: 'stripes', n: 2, color: '#2E2A2A', w: 0.18, from: 0.25, to: 0.75 }, { type: 'patch', color: '#F2C04A', at: 0.6, y: 0, rx: 0.07, ry: 0.4 }] }),
  F('sunfishbaby', '개복치 새끼', 'rare', [10, 30], '아기 개복치. 아직은 손바닥만 해요.', { shape: 'round', kind: 'sunfish', body: '#B8C3CC', belly: '#EEF2F5' }),
  F('gaetgajae', '갯가재', 'rare', [10, 20], '주먹 한 방이 총알만큼 빠른 바다의 권투 선수.', { shape: 'shrimp', body: '#3EB08C' }),
  F('seadragonbaby', '해룡 새끼', 'rare', [5, 15], '나뭇잎 옷을 입기 시작한 아기 해룡.', { shape: 'seahorse', body: '#C9A84A', fin: '#E8C870', leaves: '#8CB860' }),
  F('aengmu', '앵무조개', 'rare', [15, 25], '공룡 시대부터 이어진 줄무늬 소용돌이 껍데기.', { shape: 'nautilus', body: '#F2E8D8', bands: '#B4603E' }),
  F('tugu', '투구게', 'rare', [30, 60], '파란 피를 가진 4억 년 된 살아 있는 화석.', { shape: 'horseshoe', body: '#7E6A4A' }),
  F('heartkoi', '하트 무늬 잉어', 'rare', [40, 80], '옆구리에 빨간 하트가 쏙. 낚으면 사랑이 이뤄진대요.',
    { len: 66, h: 16, hump: 0.4, body: '#F7F3EA', fin: '#F4ECDD', dorsal: 'long', extras: ['barbels'], pattern: { type: 'heart', color: '#E2513B' } }),
  F('smileray', '웃는 가오리', 'rare', [30, 80], '뒤집어 보면 배에 웃는 얼굴이! 보기만 해도 기분 좋아요.', { shape: 'ray', kind: 'face', body: '#F2E8E0' }),
  F('twingold', '쌍둥이 금붕어', 'rare', [8, 15], '늘 꼭 붙어 다니는 단짝 금붕어 둘.',
    { len: 40, x0: 20, h: 12, hump: 0.42, nose: 0.5, body: '#F27A3D', bellyColor: '#F9B36B', fin: '#F79A5C', tail: 'fan', tailLen: 16, dorsal: 'tall', eye: 1.3, cheek: true, shine: 0.4, twin: true }),
  F('yellowtang', '옐로 탱', 'rare', [10, 20], '샛노란 몸에 꼬리 쪽 하얀 가시. 수족관의 레몬이에요.',
    { len: 48, x0: 22, h: 21, hump: 0.45, nose: 0.6, body: '#FFD93D', bellyColor: '#FFE87A', fin: '#FFD02A', tail: 'square', tailLen: 14, dorsal: 'long', anal: 'long', eye: 1.2, extras: ['snout'], shine: 0.4 }),
  F('gasigogi', '가시고기', 'rare', [4, 8], '알이 깨어날 때까지 아빠가 지키는 순정의 물고기.',
    { len: 56, x0: 20, h: 9, body: '#9AA87A', backColor: '#5E6E46', bellyColor: '#E8503E', fin: '#B8C298', dorsal: 'spiky', eye: 1.3, cheek: true }),
  F('mutaejangeo', '무태장어', 'rare', [80, 200], '천연기념물 큰 뱀장어. 얼룩 무늬가 멋져요.',
    { shape: 'eel', h: 9, wave: 4, body: '#8C7A4E', belly: '#E8DCB8', spots: '#3E3420', fin: 3, finFrom: 0.35, taper: 0.7 }, { when: 'night' }),
  F('dokdoshrimp', '독도새우', 'rare', [10, 20], '독도 깊은 바다에서 온 귀한 빨간 새우.', { shape: 'shrimp', body: '#E8503E' }),
  F('hongge', '홍게', 'rare', [10, 15], '깊은 바다의 붉은 대게 사촌. 다리가 길쭉해요.', { shape: 'crab', body: '#D8503E', claw: '#E8684E', spots: '#FFD0B8', longLegs: true }, { when: 'snow' }),
  F('blueslug', '푸른갯민숭달팽이', 'rare', [2, 4], '바다의 작은 용. 파란 날개를 펼치고 떠다녀요.', { shape: 'slug', body: '#4E8AE8', spots: '#E8F2FF' }),
  F('byeolbok', '별복', 'rare', [10, 20], '몸에 별 무늬가 총총. 놀라면 동그랗게 부풀어요.', { shape: 'round', body: '#8CA0B8', belly: '#FFFFFF', spots: '#F2F5FF', fin: '#A8B8CC' }, { when: 'night' }),
  F('bluejelly', '파랑 해파리', 'rare', [5, 15], '햇빛을 받으면 파랗게 빛나는 작은 해파리.', { shape: 'jelly', body: '#8CC8F2' }),

  // ── 아주 드묾 💎 ──
  F('chamchi', '참치', 'epic', [100, 300], '바다를 쉬지 않고 달리는 초고속 크루저.',
    { len: 76, h: 17, hump: 0.4, nose: 0.6, stem: 0.18, body: '#8EA6BF', backColor: '#1D3557', backTo: -0.05, bellyColor: '#E9EEF3', fin: '#2E4A6E', tail: 'moon', tailLen: 22, dorsal: ['shark', 'tiny'], extras: ['finlets'], pattern: { type: 'line', color: '#F4C430', t: 0.08, y: -0.05, op: 0.6 } }),
  F('cheongsaechi', '청새치', 'epic', [150, 400], '창 같은 주둥이와 돛 같은 지느러미. 바다의 검객.',
    { len: 70, x0: 24, h: 13, nose: 0.6, stem: 0.18, body: '#3E6EA8', backColor: '#1E3A66', backTo: 0.1, bellyColor: '#E4ECF5', fin: '#2B4F86', tail: 'moon', tailLen: 22, dorsal: 'sail', extras: ['sword'], pattern: { type: 'stripes', n: 7, color: '#9CC8F2', w: 0.025, op: 0.75, half: true } }),
  F('gaebokchi', '개복치', 'epic', [100, 300], '세상 예민한 거대 물고기. 살살 다뤄 주세요.',
    { shape: 'round', kind: 'sunfish', body: '#9AA5B1', belly: '#E3E7EC' }),
  F('sangeo', '상어', 'epic', [100, 400], '바다의 무법자… 지만 얘는 좀 순해 보이네요.',
    { len: 80, x0: 8, h: 14, hump: 0.38, nose: 0.75, stem: 0.2, body: '#7D9AB2', bellyColor: '#EEF2F5', fin: '#6A879F', tail: 'shark', tailLen: 26, dorsal: 'shark', anal: 'shark', pectoral: 'big', gill: false, extras: ['gills'], eye: 0.9, cheek: true }),
  F('gaori', '가오리', 'epic', [50, 200], '바닷속을 나는 연. 날개를 펄럭펄럭.',
    { shape: 'ray', body: '#3A4E7A', spots: '#F2F5FF' }),
  F('geobuk', '바다거북', 'epic', [60, 120], '백 년을 산다는 바다의 할아버지.',
    { shape: 'turtle', body: '#8DB87A', shell: '#5E7B47' }),
  F('chorong', '초롱아귀', 'epic', [10, 40], '깊은 바다에서 머리에 등불을 켜고 기다려요.',
    { len: 58, x0: 20, h: 20, hump: 0.3, nose: 0.3, body: '#3B3550', bellyColor: '#4C4566', fin: '#2D283E', tail: 'round', tailLen: 16, dorsal: 'tiny', mouth: 'big', mouthDy: 1, eye: 0.85, iris: '#3BE3C2', extras: ['teeth', 'lure', 'glow'], glowColor: '#7FF5E0', pattern: { type: 'spots', n: 10, color: '#7FF5E0', r: 0.9, op: 0.7 } }, { when: 'night', w: 1.2 }),
  F('sangalchi', '산갈치', 'epic', [200, 800], '깊은 바다에서 올라온 붉은 갈기의 용. 보면 행운이래요.',
    { shape: 'eel', h: 7, wave: 7, waves: 2.6, body: '#D9E1E8', fin: 4, finColor: '#E8505B', finFrom: 0.08, crest: '#E8505B', sheen: 0.5, taper: 0.9, spots: '#8FA4B8' }),
  F('bluelobster', '파란 랍스터', 'epic', [25, 50], '200만 마리에 한 마리 나온다는 파란 바닷가재.',
    { shape: 'lobster', body: '#2E6FD8' }),
  F('cheolgap', '철갑상어', 'epic', [100, 250], '공룡 시대부터 살아온 갑옷 물고기.',
    { len: 82, x0: 14, h: 12, hump: 0.4, nose: 0.85, stem: 0.3, body: '#8C969C', bellyColor: '#D9DDDF', fin: '#737C82', tail: 'shark', tailLen: 22, dorsal: 'small', dorsalAt: [0.78, 0.9], gill: false, extras: ['snout', 'barbels'], pattern: { type: 'scutes' } }),
  F('dageumbari', '다금바리', 'epic', [50, 120], '제주 바다의 귀하디귀한 몸. 회 한 점이 금값!',
    { len: 70, h: 17, hump: 0.32, nose: 0.45, body: '#8C6A5A', bellyColor: '#C9A898', fin: '#6E5244', dorsal: ['spiky', 'soft'], tail: 'round', mouth: 'big', pattern: { type: 'stripes', n: 6, color: '#4E3428', op: 0.5, w: 0.06 } }),
  F('dotdom', '돗돔', 'epic', [100, 200], '깊은 바다의 거대 돔. 몇 년에 한 번 볼까 말까.',
    { len: 72, h: 20, hump: 0.35, nose: 0.5, body: '#6E6A62', bellyColor: '#A8A49A', fin: '#4E4A44', dorsal: ['spiky', 'soft'], tail: 'square', mouth: 'big', eye: 0.9, pattern: { type: 'scales', s: 6 } }),
  F('manta', '만타가오리', 'epic', [300, 700], '날개 폭이 7m! 바다를 나는 거대한 연.', { shape: 'ray', kind: 'manta', body: '#2E3448', spots: '#E8ECF2' }),
  F('whaleshark', '고래상어', 'epic', [500, 1200], '세상에서 제일 큰 물고기. 사람들이 모이면 슬쩍 와요.',
    { len: 84, x0: 8, h: 15, hump: 0.3, nose: 0.2, stem: 0.22, body: '#4E6A84', bellyColor: '#E8EEF2', fin: '#3E5670', tail: 'shark', tailLen: 22, dorsal: 'shark', pectoral: 'big', gill: false, eye: 0.7, mouth: 'big', extras: ['gills'], pattern: [{ type: 'spots', n: 34, color: '#E8EEF2', r: 1.1, upper: true }, { type: 'stripes', n: 8, color: '#E8EEF2', op: 0.35, w: 0.015, half: true }] }, { when: 'crowd' }),
  F('leafydragon', '나뭇잎해룡', 'epic', [20, 35], '해초인 척 하늘하늘. 이 모습으로 숨어요.', { shape: 'seahorse', body: '#D9A84A', fin: '#E8C870', leaves: ['#8CB860', '#A8C870', '#7EA850'] }),
  F('glassfish', '유리고기', 'epic', [3, 8], '몸이 투명해서 뼈가 다 비쳐요!',
    { len: 56, x0: 20, h: 14, body: '#D8EEF2', fin: '#E8F4F6', bellyColor: '#E8F6F8', dorsal: ['spiky', 'soft'], shine: 0.6, eye: 1.3, extras: ['bones'], ghost: true }),
  F('dolphin', '돌고래', 'epic', [150, 300], '끼익끼익! 웃는 얼굴로 인사하는 바다 친구.', { shape: 'cetacean', kind: 'dolphin', body: '#7E9AB4', belly: '#E8EEF2' }),
  F('isopod', '대왕구족', 'epic', [20, 50], '심해의 거대 쥐며느리. 몇 년을 굶어도 멀쩡해요.', { shape: 'isopod', body: '#C9B8A0' }),
  F('dumbo', '덤보문어', 'epic', [20, 30], '귀 같은 지느러미를 팔랑팔랑. 심해의 아기 코끼리.', { shape: 'octopus', kind: 'dumbo', body: '#F2A8B4', suckers: '#FFE0E6', slim: true, long: 0.6 }),
  F('blobfish', '블롭피시', 'epic', [20, 30], '세상에서 제일 시무룩한 얼굴. 심해에선 멀쩡해요.', { shape: 'blob', body: '#F0B8B4' }),
  F('viperfish', '바이퍼피시', 'epic', [20, 35], '입에 다 안 들어가는 긴 송곳니, 몸엔 불빛.',
    { len: 72, x0: 14, h: 10, hump: 0.25, nose: 0.4, body: '#2E3448', bellyColor: '#3E4660', fin: '#22283A', dorsal: 'tiny', dorsalAt: [0.15, 0.2], tailLen: 16, mouth: 'big', eye: 1.2, iris: '#3BE3C2', extras: ['fangs', 'lights'], glowColor: '#7FF5E0' }, { when: 'night' }),
  F('fangtooth', '귀신고기', 'epic', [10, 18], '몸에 비해 이빨이 제일 큰 심해의 도깨비.',
    { len: 52, x0: 24, h: 19, hump: 0.3, nose: 0.3, body: '#3A3036', bellyColor: '#4E4248', fin: '#2A2228', tailLen: 16, mouth: 'big', mouthDy: 1, eye: 0.8, iris: '#E8E0C0', extras: ['fangs'], pattern: { type: 'scales', color: '#22181E', op: 0.7 } }, { when: 'night' }),
  F('coral', '산호초 한 덩이', 'epic', [20, 60], '작은 물고기들의 아파트. 살며시 바다에 돌려줬어요.', { shape: 'coral', body: '#F2786A' }),
  F('hammerhead', '귀상어', 'epic', [200, 400], '망치 머리 양 끝에 눈이 달린 상어.',
    { len: 80, x0: 10, h: 13, hump: 0.38, nose: 0.75, stem: 0.2, body: '#8C98A4', bellyColor: '#EEF2F5', fin: '#76828E', tail: 'shark', tailLen: 26, dorsal: 'shark', anal: 'shark', pectoral: 'big', gill: false, eye: 0.8, extras: ['gills', 'hammer'] }),
  F('orca', '범고래', 'epic', [500, 900], '바다의 진짜 왕. 똑똑하고 가족을 아껴요.', { shape: 'cetacean', kind: 'orca', body: '#22232E', belly: '#F4F6F8' }),
  F('walrus', '바다코끼리 새끼', 'epic', [100, 150], '콧수염이 덥수룩한 아기 바다코끼리.', { shape: 'walrus', body: '#B48C70' }),
  F('narwhal', '일각돌고래', 'epic', [400, 550], '머리에 긴 뿔! 바다의 유니콘.', { shape: 'cetacean', kind: 'narwhal', body: '#9AA4AC', belly: '#E8ECEF', spots: '#5E6A74' }),
  F('albinomegi', '알비노 메기', 'epic', [30, 90], '새하얀 몸에 빨간 눈. 아주 귀한 하얀 메기.',
    { len: 70, h: 13, hump: 0.15, nose: 0.25, back: 0.9, body: '#F4ECE8', bellyColor: '#FFFFFF', fin: '#EADCD6', dorsal: 'tiny', anal: 'long', tail: 'round', mouth: 'big', eye: 0.8, eyeUp: 0.35, iris: '#E04A5A', extras: ['whiskers'] }),
  F('goldbungeo', '황금 붕어', 'epic', [20, 40], '황금 잉어의 막냇동생. 형처럼 되고 싶대요.',
    { len: 62, h: 17, hump: 0.4, body: '#F6C445', backColor: '#E0A21B', bellyColor: '#FFE38A', fin: '#F7D46A', dorsal: 'long', extras: ['sparkle'], pattern: [{ type: 'scales', color: '#C98A10', op: 0.6 }, { type: 'glitter', n: 5 }] }),
  F('hwangsaechi', '황새치', 'epic', [150, 300], '칼 같은 주둥이로 바다를 가르는 검객.',
    { len: 76, x0: 22, h: 13, nose: 0.6, body: '#5E6E8C', backColor: '#2E3A5A', bellyColor: '#D8DEE8', fin: '#4E5A78', tail: 'moon', tailLen: 22, dorsal: 'shark', extras: ['sword'], shine: 0.45 }),
  F('kingcrab', '킹크랩', 'epic', [20, 40], '다리를 펴면 1미터가 넘는 게의 왕.', { shape: 'crab', body: '#C2503E', claw: '#D8604A', spots: '#FFE0C8', longLegs: true }),
  F('daewangjogae', '대왕조개', 'epic', [60, 120], '산호초에 사는 세상에서 제일 큰 조개. 속은 푸른 빛이에요.', { shape: 'shell', body: '#D8D0BA', bands: '#4E8AB8', pearl: true }),
  F('badabaem', '바다뱀', 'epic', [80, 150], '검고 흰 줄무늬의 바다 뱀. 조용히 지나가 주세요.',
    { shape: 'eel', h: 7, wave: 6, body: '#2E2E3A', belly: '#F2F2F2', spots: '#F2F2F2', fin: 2, finFrom: 0.85, taper: 0.6 }),
  F('beluga', '벨루가', 'epic', [300, 500], '하얀 웃는 얼굴의 바다 카나리아. 노래를 불러요.', { shape: 'cetacean', kind: 'dolphin', body: '#E8EEF2', belly: '#FFFFFF' }),
  F('goblinshark', '고블린상어', 'epic', [200, 400], '뾰족한 코에 튀어나오는 턱. 심해의 괴짜.',
    { len: 74, h: 12, body: '#E8B8B8', bellyColor: '#F4DCDC', fin: '#D8A0A0', tail: 'shark', tailLen: 22, dorsal: ['shark', 'soft'], anal: 'shark', extras: ['snout', 'teeth', 'gills'], mouth: 'big' }, { when: 'night' }),
  F('bigjelly', '대왕 해파리', 'epic', [100, 200], '우산이 사람보다 큰 해파리. 촉수가 끝도 없어요.', { shape: 'jelly', body: '#E8A86A', glow: '#FFE0C2' }),
  F('goldarowana', '황금 아로와나', 'epic', [60, 90], '부르는 게 값인 황금빛 용고기. 행운을 불러요.',
    { len: 76, h: 13, nose: 0.6, body: '#F2C94C', backColor: '#C9962B', bellyColor: '#FFE8A0', fin: '#E8B83E', tail: 'round', dorsal: 'long', dorsalAt: [0.6, 0.95], anal: 'long', extras: ['barbels', 'sparkle'], pattern: { type: 'scales', s: 6, color: '#A87A1E', op: 0.7 } }),

  // ── 전설 🌟 ──
  F('hwanggeum', '황금 잉어', 'legend', [80, 150], '용이 되기 직전의 용왕님 잉어. 잡은 날은 운수 대통!',
    { len: 66, h: 17, hump: 0.4, body: '#F6C445', backColor: '#E0A21B', bellyColor: '#FFE38A', fin: '#F7D46A', tail: 'fan', tailLen: 22, dorsal: 'long', extras: ['barbels', 'crown', 'sparkle', 'glow'], glowColor: '#FFE38A', pattern: [{ type: 'scales', s: 5, color: '#C98A10', op: 0.7 }, { type: 'glitter', n: 8 }] }),
  F('mujigae', '무지개 물고기', 'legend', [20, 40], '반짝이 비늘을 나눠 주는 마음 착한 물고기.',
    { len: 60, x0: 18, h: 17, hump: 0.42, nose: 0.6, body: '#C9D9F5', fin: '#B6C8F0', tail: 'fan', tailLen: 20, dorsal: 'tall', eye: 1.2, cheek: true, extras: ['sparkle', 'glow'], glowColor: '#D9C9FF', pattern: [{ type: 'rainbow', op: 0.55 }, { type: 'glitter', n: 12 }, { type: 'scales', s: 4.5, color: '#FFFFFF', op: 0.6 }] }),
  F('gorae', '아기 고래', 'legend', [300, 700], '길 잃은 아기 고래! 사진만 찍고 엄마 품으로 보내 줬어요.',
    { shape: 'whale', body: '#5B8DC9', belly: '#E8F1F8', sparkle: true }),
  F('daewang', '대왕오징어', 'legend', [500, 1300], '심해의 전설. 눈이 축구공만 해요.',
    { shape: 'squid', body: '#B8423A', dots: '#7A1E18', giant: true, sparkle: true }, { when: 'night' }),
  F('coelacanth', '실러캔스', 'legend', [100, 200], '4억 년 전 모습 그대로. 살아 있는 화석!',
    { len: 72, h: 16, hump: 0.35, nose: 0.45, stem: 0.4, body: '#3E5E8C', bellyColor: '#5E7EA8', fin: '#34507A', tail: 'round', tailLen: 20, dorsal: ['small', 'soft'], pelvic: false, pectoral: false, anal: false, extras: ['lobes', 'glow'], glowColor: '#9CC8F2', pattern: { type: 'blobs', n: 7, color: '#E8EEF5', rx: 0.04, ry: 0.18, op: 0.8 } }),
  F('imugi', '이무기', 'legend', [300, 1000], '용이 되지 못한 큰 뱀. 비 오는 날 하늘을 노려봐요.',
    { shape: 'eel', h: 8, wave: 6, waves: 1.8, body: '#4E6A5A', belly: '#C9D8A8', fin: 0, spots: '#2E4A3A', mane: '#8CA87A', sparkle: true }, { when: 'rain' }),
  F('moonjelly', '달빛 해파리', 'legend', [30, 80], '달빛을 머금고 은은하게 빛나는 해파리.', { shape: 'jelly', body: '#C9D8FF', glow: '#E8EEFF', moon: true }, { when: 'night' }),
  F('goldturtle', '황금 거북', 'legend', [80, 150], '금요일에 나타나는 행운의 거북. 주말이 즐거워져요!', { shape: 'turtle', body: '#F2C94C', shell: '#D9A21B', sparkle: true }, { when: 'friday' }),
  F('cheongryong', '청룡', 'legend', [1000, 3000], '이무기가 마침내 용이 되었어요! 비구름을 타고 솟구쳐요.',
    { shape: 'eel', h: 8.5, wave: 8, waves: 1.6, body: '#3E8EC8', belly: '#F2E6A8', fin: 0, horns: '#F2C94C', mane: '#E8F2FF', legs: true, beard: true, scales: true, sparkle: true }, { when: 'rain', need: { id: 'imugi' }, only: true }),
  F('yeouiju', '용왕의 여의주', 'legend', [10, 20], '소원을 들어준다는 용왕님의 구슬. 반짝반짝!', { shape: 'orb', body: '#8CE0FF' }),
  F('byeoljubu', '별주부', 'legend', [40, 80], '토끼 간 찾으러 왔다가 토끼랑 친구가 됐어요.', { shape: 'turtle', body: '#9CB87A', shell: '#6E8A4E', rabbit: true, sparkle: true }),
  F('mermaid', '인어', 'legend', [120, 180], '달밤에만 나타나 노래하는 바다의 공주.', { shape: 'mermaid', body: '#3EC0B0', hair: '#E8708E' }, { when: 'night' }),
  F('haetae', '해태 물고기', 'legend', [50, 100], '머리에 뿔 하나, 나쁜 것을 막아 주는 수호 물고기.',
    { len: 64, h: 17, hump: 0.4, nose: 0.5, body: '#E8D8A8', backColor: '#C9A24A', bellyColor: '#FFF2C8', fin: '#4EA88C', tail: 'fan', tailLen: 20, dorsal: 'long', extras: ['horn', 'mane', 'barbels', 'sparkle', 'glow'], maneColor: '#4EA88C', glowColor: '#FFF2C8', pattern: { type: 'scales', color: '#A8822E', op: 0.6 } }),
  F('deungyongmun', '등용문 잉어', 'legend', [150, 300], '황금 잉어 열 마리 끝에 만난, 용이 되어 가는 잉어.',
    { len: 70, h: 17, hump: 0.4, body: '#F6C445', backColor: '#E0A21B', bellyColor: '#FFE38A', fin: '#F7D46A', tail: 'fan', tailLen: 22, dorsal: 'long', extras: ['horns', 'mane', 'whiskers', 'sparkle', 'glow'], maneColor: '#E8503E', glowColor: '#FFE38A', pattern: [{ type: 'scales', s: 5, color: '#C98A10', op: 0.7 }, { type: 'glitter', n: 8 }] }, { need: { id: 'hwanggeum', n: 10 }, only: true }),
  F('kraken', '크라켄', 'legend', [1000, 3000], '배를 통째로 삼킨다는 전설의 촉수 괴물!', { shape: 'octopus', kind: 'kraken', body: '#8C3E4E', suckers: '#F2C8D0', long: 1.3 }),
  F('ghostkraken', '유령 크라켄', 'legend', [1000, 3000], '가라앉은 유령선에 사는 반투명한 크라켄. 촉수가 푸르게 빛나요.',
    { shape: 'octopus', kind: 'kraken', body: '#4E9AA8', suckers: '#C8F2F8', long: 1.3, ghost: true }),
  F('megalodon', '메갈로돈', 'legend', [1500, 2000], '멸종했다던 거대 상어. 이빨 하나가 손바닥만 해요.',
    { len: 86, x0: 8, h: 18, hump: 0.38, nose: 0.6, stem: 0.2, body: '#6E7A86', bellyColor: '#E8ECEF', fin: '#5A6670', tail: 'shark', tailLen: 26, dorsal: 'shark', anal: 'shark', pectoral: 'big', gill: false, mouth: 'big', eye: 0.8, extras: ['gills', 'teeth', 'glow'], glowColor: '#C8D8E8' }),
  F('hydra', '바다 히드라', 'legend', [800, 2000], '머리를 하나 베면 둘이 자란다는 초록 바다뱀.',
    { shape: 'eel', h: 8.5, wave: 8, waves: 2, body: '#3E8A5E', belly: '#C8E8A8', fin: 3, finColor: '#2E6E4A', finFrom: 0.12, horns: '#E8D87A', mane: '#8AD86A', scales: true, sparkle: true }),
  F('bahamut', '바하무트', 'legend', [2000, 5000], '온 세상을 등에 지고 헤엄친다는 거대한 신화 속 물고기.',
    { len: 84, x0: 10, h: 19, hump: 0.4, body: '#3E5E9A', backColor: '#2A3E6E', bellyColor: '#C8D8F2', fin: '#E8C25A', tail: 'fan', tailLen: 22, dorsal: 'sail', extras: ['horns', 'mane', 'whiskers', 'sparkle', 'glow'], hornColor: '#F2D27A', maneColor: '#E8C25A', glowColor: '#9AB8F2', pattern: { type: 'scales', s: 6, color: '#1E2E5A', op: 0.6 } }),
  F('aspidochelone', '아스피도켈론', 'legend', [3000, 8000], '섬인 줄 알고 배를 댔더니 거대한 거북이었대요.',
    { shape: 'turtle', body: '#7A8A5E', shell: '#5E7A3E', sparkle: true }),
  F('leviathan', '리바이어던', 'legend', [2000, 5000], '바다를 휘감는 비늘 덮인 거대 바다뱀.',
    { shape: 'eel', h: 9, wave: 9, waves: 2.2, body: '#2E5A6E', belly: '#8CC0C8', fin: 4, finColor: '#3E8090', finFrom: 0.15, horns: '#C9D8E0', scales: true, sparkle: true }),
  F('hippocampos', '히포캄포스', 'legend', [200, 400], '앞은 말, 뒤는 물고기. 바다 신의 마차를 끌어요.', { shape: 'hippo', body: '#7EC8D8', mane: '#3E8EB0' }),
  F('nessie', '네시', 'legend', [500, 1500], '눈 오는 호수에 고개를 쏙. 진짜 있었구나!', { shape: 'nessie', body: '#5E8C6A' }, { when: 'snow' }),
  F('sirenscale', '세이렌의 비늘', 'legend', [5, 10], '무지갯빛 비늘 한 장. 귀에 대면 노랫소리가…', { shape: 'scale' }),
  F('phoenix', '불사조 물고기', 'legend', [60, 120], '불꽃 지느러미를 휘날리며 몇 번이고 되살아나요.',
    { len: 62, h: 15, hump: 0.4, nose: 0.6, body: '#F2783E', backColor: '#E8503E', bellyColor: '#FFD06A', fin: '#FFB03E', tail: 'fan', tailLen: 20, tailColor: '#F2503E', dorsal: 'tall', extras: ['flames', 'sparkle', 'glow'], glowColor: '#FFB03E', sparkColor: '#FFE38A' }),
  F('ghostfish', '유령 물고기', 'legend', [30, 60], '밤에만 보이는 반투명 물고기. 어? 방금 여기 있었는데…',
    { len: 62, h: 15, body: '#E8EEFF', bellyColor: '#FFFFFF', fin: '#D8E0FF', tail: 'fan', tailLen: 20, dorsal: 'tall', eye: 1.3, iris: '#7E8CE8', cheek: true, extras: ['glow'], glowColor: '#C8D4FF', ghost: true }, { when: 'night' }),
  F('galaxywhale', '은하수 고래', 'legend', [1000, 2500], '눈 오는 밤하늘을 헤엄쳐 온 별자리 고래.', { shape: 'cetacean', kind: 'galaxy', body: '#2A2A6E', belly: '#4A3E8C' }, { when: ['night', 'snow'], only: true }),
  F('icedragon', '얼음 용', 'legend', [800, 2000], '크리스탈 비늘이 반짝이는 눈의 용.',
    { shape: 'eel', h: 8, wave: 7, waves: 1.8, body: '#BEE4F4', belly: '#F2FAFF', fin: 3, finColor: '#8CC8E8', finFrom: 0.12, horns: '#E8F6FF', mane: '#FFFFFF', legs: true, scales: true, sparkle: true }, { when: 'snow' }),
  F('thundereel', '천둥 장어', 'legend', [200, 500], '비 오는 밤, 몸에 번개가 찌릿찌릿!',
    { shape: 'eel', h: 7.5, body: '#3E3A6E', belly: '#8C86C8', fin: 3.5, finColor: '#F2E04A', finFrom: 0.2, bolts: '#FFF06A', sparkle: true }, { when: ['rain', 'night'], only: true }),
  F('timefish', '시간의 물고기', 'legend', [20, 40], '정각에만 나타나는 시계 물고기. 째깍째깍.',
    { len: 58, x0: 18, h: 18, hump: 0.42, nose: 0.6, body: '#C9B8F2', fin: '#A894E8', tail: 'fan', tailLen: 20, dorsal: 'tall', eye: 1.2, cheek: true, extras: ['sparkle'], pattern: { type: 'clock' } }, { when: 'hour', only: true }),
  F('rainbowdragon', '무지개 해룡', 'legend', [30, 60], '무지개 리본 지느러미를 휘날리는 해룡.',
    { shape: 'seahorse', body: '#F2C0E8', fin: '#C8B0F2', leaves: ['#FF6B6B', '#FFB347', '#FFE066', '#7BD389', '#5DADEC', '#9B7FE6'], sparkle: true }),
  F('kaltoe', '칼퇴 물고기', 'legend', [20, 40], '18시 정각, 넥타이 매고 바로 퇴근하는 물고기.',
    { len: 62, h: 14, body: '#9CB8E8', backColor: '#5E7EB8', bellyColor: '#EEF3FA', fin: '#7E9AD0', eye: 1.2, cheek: true, extras: ['tie', 'sparkle'] }, { when: 'six', only: true }),
  F('paydaygold', '월급날 금붕어', 'legend', [10, 25], '월급날에만 나타나 금화를 뿜는 금붕어. 통장 스쳐 가기 전에!',
    { len: 50, x0: 22, h: 18, hump: 0.42, nose: 0.5, body: '#F6C445', bellyColor: '#FFE38A', fin: '#F7D46A', tail: 'fan', tailLen: 22, dorsal: 'tall', eye: 1.3, cheek: true, extras: ['coins', 'sparkle', 'crown'] }, { when: 'payday', only: true }),
  F('hyeonmu', '현무', 'legend', [100, 200], '북쪽 바다를 지키는 거북. 등딱지에 뱀이 감겨 있대요.', { shape: 'turtle', body: '#4E5E6E', shell: '#2E3A4A', sparkle: true }, { when: 'night' }),
  F('baekho', '백호 잉어', 'legend', [60, 100], '서쪽을 지키는 하얀 호랑이 무늬 잉어.',
    { len: 70, h: 17, hump: 0.4, body: '#F4F4F2', bellyColor: '#FFFFFF', fin: '#E8E8E4', tail: 'fan', tailLen: 22, dorsal: 'long', extras: ['barbels', 'whiskers', 'sparkle', 'glow'], glowColor: '#E8F2FF', pattern: { type: 'stripes', n: 6, color: '#2E2E3A', w: 0.04, op: 0.85 } }),
  F('jujak', '주작 물고기', 'legend', [40, 70], '남쪽을 지키는 붉은 새의 기운을 받은 물고기.',
    { len: 64, h: 15, hump: 0.4, nose: 0.6, body: '#E8403E', backColor: '#B8202E', bellyColor: '#FFB86A', fin: '#FF7A3E', tail: 'veil', tailLen: 22, tailColor: '#FF5A3E', dorsal: 'tall', extras: ['flames', 'wings', 'sparkle', 'glow'], wingColor: '#FFB86A', glowColor: '#FF9A6A', sparkColor: '#FFE38A' }),
  F('cherrykoi', '벚꽃 잉어', 'legend', [40, 70], '벚꽃잎이 내려앉은 분홍빛 잉어. 봄바람을 타고 와요.',
    { len: 66, h: 17, hump: 0.4, body: '#FFE8EE', bellyColor: '#FFF4F6', fin: '#FFC8D6', tail: 'fan', tailLen: 22, dorsal: 'long', extras: ['barbels', 'sparkle', 'glow'], glowColor: '#FFD6E2', sparkColor: '#FFB8CC', pattern: { type: 'koi', n: 5, color: ['#FF9AB8', '#FFB8CC'], rx: 0.08, ry: 0.35 } }),
  F('aurorajelly', '오로라 해파리', 'legend', [30, 60], '밤하늘 오로라 빛으로 일렁이는 해파리.', { shape: 'jelly', body: '#9AF2C8', glow: '#C8E8FF', moon: true }, { when: 'night', only: true }),
  F('cloudwhale', '구름 고래', 'legend', [800, 1500], '비 오는 날 구름 사이로 헤엄쳐 내려온 하얀 고래.', { shape: 'whale', body: '#E8EEF4', belly: '#FFFFFF', sparkle: true }, { when: 'rain', only: true }),
  F('shootingstar', '별똥별 물고기', 'legend', [20, 40], '밤하늘에서 떨어진 별이 물고기가 됐대요. 소원을 빌어 봐요.',
    { len: 58, x0: 20, h: 13, body: '#3E3A8C', backColor: '#2A2660', bellyColor: '#6E6AC8', fin: '#8C8AE8', tail: 'veil', tailLen: 24, tailColor: '#FFE38A', dorsal: 'tall', eye: 1.3, extras: ['sparkle', 'glow'], glowColor: '#FFE38A', sparkColor: '#FFF3B0', pattern: { type: 'glitter', n: 14, color: '#FFF3B0' } }, { when: 'night', only: true }),
  F('yeoncha', '연차 물고기', 'legend', [20, 40], '금요일에만 보이는, 월요일 연차 낸 물고기. 표정이 아주 밝아요.',
    { len: 58, x0: 20, h: 15, hump: 0.42, body: '#7ED8B8', backColor: '#4EB898', bellyColor: '#E8FFF4', fin: '#A8E8D0', tail: 'fan', tailLen: 18, dorsal: 'tall', eye: 1.3, cheek: true, extras: ['smile', 'sparkle'] }, { when: 'friday', only: true }),

  // ── 꽝 ──
  F('boot', '장화 한 짝', 'junk', null, '누가 잃어버렸을까요… 물이 가득.', { shape: 'junk', kind: 'boot' }),
  F('can', '빈 깡통', 'junk', null, '바다에 버리지 마세요! 분리수거 완료.', { shape: 'junk', kind: 'can' }),
  F('stick', '나뭇가지', 'junk', null, '손맛은 대어였는데…', { shape: 'junk', kind: 'stick' }),
  F('weed', '해초 뭉치', 'junk', null, '미역국이라도 끓일까요?', { shape: 'junk', kind: 'weed' }),
  F('sock', '양말 한 짝', 'junk', null, '세탁기에서 사라진 그 양말이 여기에!', { shape: 'junk', kind: 'sock' }),
  F('bottle', '페트병', 'junk', null, '안에 편지는… 없네요.', { shape: 'junk', kind: 'bottle' }),
  F('duck', '고무 오리', 'junk', null, '버그를 같이 들어 줄 디버깅 친구가 생겼어요.', { shape: 'junk', kind: 'duck' }, { w: 0.4 }),
  F('keycap', 'ESC 키캡', 'junk', null, '누군가 정말 탈출하고 싶었나 봐요.', { shape: 'junk', kind: 'keycap' }, { w: 0.4 }),
  F('badge', '사원증', 'junk', null, '사원증이 여기에! 오늘 출입은 어떻게 했지?', { shape: 'junk', kind: 'badge' }),
  F('cup', '테이크아웃 커피컵', 'junk', null, '마시다 만 아이스 아메리카노. 얼음은 다 녹았어요.', { shape: 'junk', kind: 'cup' }),
  F('earbud', '무선 이어폰 한 쪽', 'junk', null, '한 쪽만 남은 무선 이어폰. 나머지 한 쪽은 어디에…', { shape: 'junk', kind: 'earbud' }),
  F('mouse', '마우스', 'junk', null, '더블클릭이 안 되는 마우스. 그래서 버렸나 봐요.', { shape: 'junk', kind: 'mouse' }),
  F('umbrella', '뒤집힌 우산', 'junk', null, '바람에 뒤집힌 우산. 비가 엄청 왔나 봐요.', { shape: 'junk', kind: 'umbrella' }, { when: 'rain' }),
  F('letter', '병 속 편지', 'junk', null, '병 속에 편지가 있어요!', { shape: 'junk', kind: 'letter' }, { w: 0.4, notes: NOTES }),
  F('postit', '포스트잇 뭉치', 'junk', null, '“회의 3시” “회의 4시” “회의 5시”… 회의가 너무 많아요.', { shape: 'junk', kind: 'postit' }),
  F('calc', '고장 난 계산기', 'junk', null, '1+1=11 이 나오는 계산기. 정산은 다시 해 주세요.', { shape: 'junk', kind: 'calc' }),
  F('card', '명함 한 장', 'junk', null, '누군가의 명함이에요.', { shape: 'junk', kind: 'card' }),
  F('charger', '노트북 충전기', 'junk', null, '노트북 충전기! 이거 없으면 오늘 일 못 해요.', { shape: 'junk', kind: 'charger' }),
  F('paper', '결재 서류', 'junk', null, '빨간 도장이 쾅. “반려”… 다시 써야겠어요.', { shape: 'junk', kind: 'paper' }),
  F('receipt', '회식 영수증', 'junk', null, '어제 회식 영수증. 총무님께 갖다 드릴까요?', { shape: 'junk', kind: 'receipt' }),
  F('coupon', '배달 쿠폰', 'junk', null, '치킨 3천 원 할인 쿠폰! 유효기간은… 어제까지.', { shape: 'junk', kind: 'coupon' }),
  F('eraser', '닳은 지우개', 'junk', null, '반쯤 닳은 지우개. 실수를 많이 지워 줬네요.', { shape: 'junk', kind: 'eraser' }),
  F('clover', '행운의 네잎클로버', 'junk', null, '행운의 네잎클로버! 다음 한 번은 귀한 물고기가 두 배로 잘 나와요.', { shape: 'junk', kind: 'clover' }, { w: 0.5, luck: true }),
  F('chest', '빈 보물상자', 'junk', null, '두근두근 보물상자! …열어 보니 텅 비었어요.', { shape: 'junk', kind: 'chest' }, { w: 0.4 }),
  F('slipper', '삼선 슬리퍼', 'junk', null, '사무실 국룰 슬리퍼. 한 짝만 떠내려왔어요.', { shape: 'junk', kind: 'slipper' }),
  F('tumbler', '텀블러', 'junk', null, '환경을 생각하는 당신의 텀블러… 가 왜 여기에?', { shape: 'junk', kind: 'tumbler' }),
  F('usb', 'USB 메모리', 'junk', null, '"최종_진짜최종_v3.pptx" 가 들어 있을 것 같아요.', { shape: 'junk', kind: 'usb' }),
  F('pen', '볼펜', 'junk', null, '회의 때마다 사라지던 그 볼펜. 여기 있었네요.', { shape: 'junk', kind: 'pen' }),
  F('ramen', '컵라면 용기', 'junk', null, '야근의 흔적. 국물까지 다 마셨군요.', { shape: 'junk', kind: 'ramen' }),
  F('remote', '회의실 리모컨', 'junk', null, '회의실 프로젝터가 안 켜지던 이유를 찾았어요.', { shape: 'junk', kind: 'remote' }),
];
const BY_ID = new Map(FISH.map((f) => [f.id, f]));
// How many kinds a book holds, counting only what is still in FISH (an item taken out later
// stays in old books but no longer counts, so nobody reads 260/259).
const kindsIn = (caught) => Object.keys(caught || {}).filter((id) => BY_ID.has(id)).length;
export const fishById = (id) => BY_ID.get(id) || null;

// Every entry's drawing, made once: { id: parts }.
let looks = null;
export function fishLooks() {
  if (!looks) looks = Object.fromEntries(FISH.map((f) => [f.id, packed(art(f))]));
  return looks;
}

// The bite comes BITE_MIN..BITE_MAX after the cast; the click counts from a little before it
// (the screens show it late by a poll's worth) until REEL_MS after, plus the trip here.
const BITE_MIN = 3_000, BITE_MAX = 10_000;
const EARLY_MS = 250;
export const REEL_MS = 1_500;
const SLACK_MS = 700;
const REST_MS = 3_000;
// Once hooked, the fight: a marker sweeps a bar and the click must land in its coloured part. The
// rarer the fish, the quicker the sweep (ms from one end to the other) and the narrower the part.
// One hit lands it; a miss leaves it on the hook for another go, up to TRIES (the same fish each
// time, the part somewhere else). Not clicked by HOOK_MS, that go is lost.
export const TRIES = 3;
export const FIGHT = {
  junk: { zone: 0.3, sweep: 1100 }, common: { zone: 0.26, sweep: 950 }, uncommon: { zone: 0.22, sweep: 820 },
  rare: { zone: 0.17, sweep: 680 },
  epic: { zone: 0.12, sweep: 560 },
  // A legend is a sliver that drifts back and forth along the bar while the marker speeds through
  // the middle and dawdles at the ends (ease), so the beat cannot be counted; and a click just
  // off its edge does not count (slack: how far off a click may be and still hit, else 0.015).
  // Hard but still a matter of aim: 5% at 0.34 s (11/02) left a hand no better than chance.
  legend: { zone: 0.08, sweep: 500, ease: true, drift: { amp: 0.1, ms: 2000 }, slack: 0 },
};
// When some fish come out (when: one, or several that must all hold), and what the book says of
// it. A fish marked only comes out then and never otherwise.
const HINT = {
  night: '🌙 오후 4시 이후(16시~)에 잘 나와요', rain: '🌧 비 오는 날 잘 나와요', snow: '❄ 눈 오는 날 잘 나와요', lunch: '🍱 점심시간(12시)에 잘 나와요',
  evening: '🏃 퇴근 무렵(17~22시)에 잘 나와요', friday: '🎉 금요일에 잘 나와요', crowd: '👥 층에서 셋 이상 낚시할 때 잘 나와요',
  payday: '💰 월급날(10일, 주말이면 그 전 평일)에만', hour: '⏰ 정각(XX:00)에만', six: '🕕 18시 정각(18:00~18:04)에만',
};
const WET = new Set(['rain', 'snow']);
// The 10th, or the Friday before it when it falls on a weekend.
export function payday(d) {
  const day = d.getDay(), date = d.getDate();
  if (date === 10) return day !== 0 && day !== 6;
  const tenth = new Date(d.getFullYear(), d.getMonth(), 10).getDay();
  return day === 5 && ((date === 9 && tenth === 6) || (date === 8 && tenth === 0));
}
const HOOK_MS = 6_000; // per go
const BRAG_GAP_MS = 15_000;
const WEATHER_MS = 60_000;
// 🏁 /낚시대회: half a minute to join, then two minutes of fishing, five bites each. The rare ones
// bite much more in it (a legend still hardly ever), and nothing caught in it goes in the book.
export const CONTEST_OPEN_MS = 30_000, CONTEST_MS = 120_000, CONTEST_TRIES = 5;
const CONTEST_GRACE_MS = 20_000; // a fight going at the whistle may still finish
const CONTEST_SHOWN_MS = 10_000; // the final board stays up a little
const CONTEST_BOOST = { rare: 2, epic: 1.6, legend: 1.3 };
const RANK = { common: 1, uncommon: 2, rare: 3, epic: 4, legend: 5 };
// Better first: the rarer, then the bigger; nothing caught last.
const ahead = (a, b) => (RANK[b?.rarity] || 0) - (RANK[a?.rarity] || 0) || (b?.cm ?? 0) - (a?.cm ?? 0);

const err = (status, message) => Object.assign(new Error(message), { status });
const cmText = (cm) => (cm == null ? '' : cm >= 100 ? `${(cm / 100).toFixed(2)}m` : `${cm.toFixed(1)}cm`);

// A catch as the screens get it: what it is and how big, without the drawing (they have the looks).
export function shown(f, cm, desc = f.desc) {
  const r = RARITY[f.rarity];
  return { id: f.id, name: f.name, rarity: f.rarity, rarityName: r.name, mark: r.mark, color: r.color, cm, size: cmText(cm), desc };
}
const whens = (f) => (f.when == null ? [] : [].concat(f.when));

export class Fishing {
  // dex: { [floor]: { [userId]: { name, total, fish: { [id]: { n, best, first } } } } }
  constructor({ now = () => Date.now(), random = Math.random, dex = {} } = {}) {
    Object.assign(this, { now, random, dex: JSON.parse(JSON.stringify(dex || {})) });
    this.casts = new Map();   // "userId@floor" -> { at, bite }
    this.rest = new Map();    // "userId@floor" -> when they may cast again
    this.weather = new Map(); // floor -> { kind: 'rain' | 'snow', at }
    this.hooked = new Map();  // "userId@floor" -> { f, cm, at }: on the hook, the fight not yet won
    this.hookLog = [];        // the last bites' clicks, newest first (hook)
    this.luck = new Set();    // "userId@floor" with a four-leaf clover: the next bite is likelier rare
    this.bragged = new Map(); // "userId@floor" -> when they last showed off a catch
    this.contests = new Map(); // floor -> { id, by, phase: 'open' | 'on' | 'done', until, people }
    this.contestSeq = 0;
  }

  // 🏁 A floor's fishing contest, one at a time: open for joining (the one who opened it is in,
  // and may start it sooner), then on, then its final board for a moment.
  contestOpen(floor, by) {
    const c = this.contests.get(floor);
    if (c && c.phase !== 'done') throw err(409, c.phase === 'open' ? '벌써 낚시대회 참가를 받고 있어요' : '지금 낚시대회 중이에요');
    this.contests.set(floor, { id: ++this.contestSeq, by, phase: 'open', until: this.now() + CONTEST_OPEN_MS, people: { [by.id]: { name: by.name, tries: 0, best: null } } });
  }

  contestJoin(floor, who) {
    const c = this.contests.get(floor);
    if (c?.phase !== 'open') throw err(409, '지금은 낚시대회에 참가할 수 없어요');
    c.people[who.id] ||= { name: who.name, tries: 0, best: null };
  }

  // Out before it starts; the one who opened it leaving calls it off.
  contestLeave(floor, id) {
    const c = this.contests.get(floor);
    if (c?.phase !== 'open') return;
    delete c.people[id];
    if (id === c.by.id || !Object.keys(c.people).length) this.contests.delete(floor);
  }

  contestStart(floor, id) {
    const c = this.contests.get(floor);
    if (c?.phase !== 'open') throw err(409, '시작할 낚시대회가 없어요');
    if (id !== c.by.id) throw err(403, '연 사람만 시작할 수 있어요');
    c.phase = 'on'; c.until = this.now() + CONTEST_MS;
  }

  // One of my bites in the contest, caught or not; null when I am not in one that is on.
  contestGo(floor, key) {
    const c = this.contests.get(floor);
    const p = c?.phase === 'on' && this.now() < c.until && c.people[key.slice(0, key.lastIndexOf('@'))];
    if (!p || p.tries >= CONTEST_TRIES) return null;
    p.tries += 1;
    return p;
  }

  // Moves a contest on with the clock: an open one starts when its time is up; one that is on
  // ends when its time is up (a counted fight still going gets a little longer) or once everyone
  // in it has had all their bites; a final board goes after a moment. What happened, to be said.
  contestTick(floor) {
    const c = this.contests.get(floor);
    if (!c || this.now() < c.until && c.phase !== 'on') return null;
    if (c.phase === 'done') { this.contests.delete(floor); return null; }
    if (c.phase === 'open') { c.phase = 'on'; c.until = this.now() + CONTEST_MS; return { started: c }; }
    const going = [...this.hooked].some(([k, h]) => h.contest === c.id && k.endsWith('@' + floor) && this.now() - h.at <= HOOK_MS * h.hits);
    const all = Object.values(c.people).every((p) => p.tries >= CONTEST_TRIES);
    if (going ? this.now() < c.until + CONTEST_GRACE_MS : !all && this.now() < c.until) return null;
    c.phase = 'done'; c.until = this.now() + CONTEST_SHOWN_MS;
    return { ended: c, top: this.standings(c).filter((p) => p.fish).slice(0, 3) };
  }

  standings(c) {
    return Object.entries(c.people).map(([id, p]) => ({ id, name: p.name, tries: p.tries, fish: p.best && shown(p.best.f, p.best.cm) }))
      .sort((a, b) => ahead(a.fish, b.fish));
  }

  // The contest as one person sees it: the board, best first, and the time left.
  contestView(floor, me) {
    const c = this.contests.get(floor);
    if (!c) return null;
    const brief = (f) => f && { name: f.name, mark: f.mark, size: f.size, rarity: f.rarity, rarityName: f.rarityName, color: f.color };
    return { id: c.id, floor, phase: c.phase, by: c.by.name, host: c.by.id === me, joined: !!c.people[me], left: Math.max(0, c.until - this.now()),
      of: CONTEST_TRIES, tries: c.people[me]?.tries || 0,
      board: this.standings(c).map((p) => ({ name: p.name, tries: p.tries, fish: brief(p.fish), me: p.id === me })) };
  }

  // 🏆 Showing off one of my catches from the book: only one I have on this floor, at my biggest,
  // and not more than once every BRAG_GAP_MS. What the floor sees comes back for the screens.
  brag(floor, key, fishId) {
    const who = key.slice(0, key.lastIndexOf('@'));
    const f = fishById(String(fishId || ''));
    const mine = f && this.dex[floor]?.[who]?.fish[f.id];
    if (!mine) throw err(404, '도감에 있는 물고기만 자랑할 수 있어요');
    const wait = (this.bragged.get(key) ?? -Infinity) + BRAG_GAP_MS - this.now();
    if (wait > 0) throw err(429, `조금 있다가 다시 자랑해요 (${Math.ceil(wait / 1000)}초)`);
    this.bragged.set(key, this.now());
    const rec = this.record(floor, f.id);
    return { ...shown(f, mine.best ?? null), n: mine.n, record: !!rec && rec.id === who && mine.best != null };
  }

  // 🎣 Showing off my rod (the same stage, the same 15 s apart as a catch): which one, how many kinds.
  rodBrag(floor, key) {
    const who = key.slice(0, key.lastIndexOf('@'));
    const wait = (this.bragged.get(key) ?? -Infinity) + BRAG_GAP_MS - this.now();
    if (wait > 0) throw err(429, `조금 있다가 다시 자랑해요 (${Math.ceil(wait / 1000)}초)`);
    this.bragged.set(key, this.now());
    return { ...this.rod(floor, who), kinds: kindsIn(this.dex[floor]?.[who]?.fish) };
  }

  // How many on a floor have a line in the water now.
  crowd(floor) {
    let n = 0;
    for (const key of new Set([...this.casts.keys(), ...this.hooked.keys()])) if (key.endsWith('@' + floor) && this.fishing(key)) n++;
    return n;
  }

  // A floor's /비 or /눈: for a minute after, the rain-and-snow fish come more.
  sky(floor, kind) { if (kind === 'rain' || kind === 'snow') this.weather.set(floor, { kind, at: this.now() }); }

  // Whether someone has a line in the water now (their character holds a rod on every screen).
  fishing(key) {
    const c = this.casts.get(key);
    if (c && this.now() > c.bite + REEL_MS + SLACK_MS + 5_000) this.casts.delete(key);
    const h = this.hooked.get(key);
    if (h && this.now() - h.at > HOOK_MS * h.hits + 5_000) this.hooked.delete(key);
    return this.casts.has(key) || this.hooked.has(key);
  }

  cast(key) {
    if (this.fishing(key)) throw err(409, '이미 낚싯대를 던졌어요');
    const wait = (this.rest.get(key) ?? 0) - this.now();
    if (wait > 0) throw err(429, `잠깐 쉬었다가 다시 던져요 (${Math.ceil(wait / 1000)}초)`);
    const biteIn = Math.round(BITE_MIN + this.random() * (BITE_MAX - BITE_MIN));
    this.casts.set(key, { at: this.now(), bite: this.now() + biteIn });
    return { biteIn, window: REEL_MS };
  }

  stop(key) { this.casts.delete(key); this.hooked.delete(key); }

  // The click on the bite. Too soon and the fish swims off; too late and it got away; in time,
  // it is on the hook and the fight begins: what it is stays a secret, only how hard it pulls
  // (its rarity: the fight's zone and sweep, and where the zone sits on the bar).
  // late: the screen let the bite go unclicked (계속 낚시 counting who is away): a miss even when
  // it came within the slack, so nobody gets a fight they never asked for.
  // ms: how long after the bite showed on the clicker's own screen the click came. A slow trip
  // between that PC and here would otherwise turn a click in time into a late one; the screen's
  // count is taken when it fits what reached here (never more than the trip could explain).
  hook(floor, key, late = false, ms = null, why = {}) {
    const c = this.casts.get(key);
    if (!c) throw err(400, '먼저 낚싯대를 던져요');
    this.casts.delete(key);
    this.rest.set(key, this.now() + REST_MS);
    const got = this.now() - c.bite;
    const fair = Number.isFinite(ms) && ms >= -2_000 && ms <= got + 500 && got - ms <= 8_000;
    const dt = fair ? ms : got;
    const r = this.hookOn(floor, key, late, dt, c);
    // The last few, for the admin's status board (/api/roster): who, clicked or not, how late.
    this.hookLog = [{ at: this.now(), who: why.name || key, late, ms: Number.isFinite(ms) ? Math.round(ms) : null, got,
      presses: Number.isFinite(why.presses) ? why.presses : null, miss: r.miss || '' }, ...this.hookLog].slice(0, 30);
    return r;
  }

  hookOn(floor, key, late, dt, c) {
    // In a contest every bite is one of my five, caught or not.
    const p = this.contestGo(floor, key);
    const go = p ? { contest: { n: p.tries, of: CONTEST_TRIES } } : {};
    if (dt < -EARLY_MS) return { miss: 'early', text: '너무 빨리 당겼어요 — 물고기가 놀라서 도망갔어요', ...go };
    if (late || dt > REEL_MS + SLACK_MS) return { miss: 'late', text: '앗, 놓쳤어요… 물고기가 미끼만 먹고 갔어요', ...go };
    const f = this.pick(floor, key, !!p);
    const cm = f.cm ? this.size(f, Math.max(0, dt)) : null;
    const r2 = (x) => Math.round(x * 100) / 100;
    // Each go's part somewhere on the bar (a drifting one kept clear of the ends it swings to).
    const s = FIGHT[f.rarity];
    const amp = s.drift?.amp || 0;
    const zones = Array.from({ length: TRIES }, () => {
      const at = r2(0.08 + amp + this.random() * (0.84 - s.zone - 2 * amp));
      return { from: at, to: r2(at + s.zone), sweep: s.sweep, ...(s.ease ? { ease: true } : {}), ...(s.drift ? { drift: s.drift } : {}), ...(s.slack != null ? { slack: s.slack } : {}) };
    });
    this.hooked.set(key, { f, cm, hits: TRIES, at: this.now(), ...(p ? { contest: this.contests.get(floor).id } : {}) });
    return { hooked: true, rarity: f.rarity, heavy: f.rarity === 'epic' || f.rarity === 'legend', zones, tries: TRIES, ms: HOOK_MS - 1_000, ...go };
  }

  // The fight's end: hit (the marker in the zone on one of the goes) lands it in my book; every go
  // missed, or too long, and it breaks free (and I hear what kind of fish it was).
  land(floor, who, key, hit) {
    const h = this.hooked.get(key);
    if (!h) throw err(400, '걸린 물고기가 없어요');
    this.hooked.delete(key);
    this.rest.set(key, this.now() + REST_MS);
    if (!hit || this.now() - h.at > HOOK_MS * h.hits) {
      const r = RARITY[h.f.rarity];
      const what = h.f.rarity === 'junk' ? '…근데 묵직한 게 쓰레기 같았어요' : `놓친 건 ${r.mark ? r.mark + ' ' : ''}${r.name} 물고기였어요`;
      return { miss: 'escape', rarity: h.f.rarity, text: `툭! 줄이 끊어졌어요 — ${what}` };
    }
    // A contest's catch only counts on its board: not in the book, no records, no clover.
    if (h.contest) {
      const c = this.contests.get(floor);
      const p = c?.id === h.contest && c.phase === 'on' && c.people[who.id];
      const mine = { rarity: h.f.rarity, cm: h.cm };
      if (p && h.f.rarity !== 'junk' && (!p.best || ahead(mine, { rarity: p.best.f.rarity, cm: p.best.cm }) < 0)) p.best = { f: h.f, cm: h.cm };
      return { fish: shown(h.f, h.cm), contest: true };
    }
    // A clover makes the next bite likelier rare; a letter says something new each time, and a
    // business card is someone's on this floor.
    if (h.f.luck) this.luck.add(key);
    let desc = h.f.desc;
    if (h.f.notes) desc = `${h.f.desc} ${h.f.notes[Math.floor(this.random() * h.f.notes.length)]}`;
    if (h.f.id === 'card') {
      const others = Object.entries(this.dex[floor] || {}).filter(([id]) => id !== who.id).map(([, p]) => p.name);
      desc = others.length ? `${others[Math.floor(this.random() * others.length)]} 님 명함이에요. 잘 돌려드릴게요!` : '이름이 물에 번져 누구 건지 모르겠어요.';
    }
    return { fish: shown(h.f, h.cm, desc), ...this.keep(floor, who, h.f, h.cm), ...(h.f.luck ? { luck: true } : {}) };
  }

  // What holds now on a floor: the hour, the weather, the day, how many are fishing.
  moment(floor) {
    const t = new Date(this.now());
    const hr = t.getHours(), min = t.getMinutes();
    const sky = this.weather.get(floor);
    const wet = sky && this.now() - sky.at < WEATHER_MS ? sky.kind : null;
    return {
      // 'night' from 4 pm: nobody fishes here after work, so the night ones come in the late afternoon.
      wet, night: hr >= 16 || hr < 6, rain: wet === 'rain', snow: wet === 'snow', lunch: hr === 12, evening: hr >= 17 && hr < 22,
      friday: t.getDay() === 5, payday: payday(t), hour: min === 0, six: hr === 18 && min < 5, crowd: this.crowd(floor) >= 3,
    };
  }

  // Which one bit: a rarity first (rain and snow, and a clover, bring the rarer ones up), then one
  // in it: the ones whose time it is come more, the ones only for some time never otherwise, and
  // one that follows another needs that one in my book first.
  pick(floor, key = '', contest = false) {
    const now = this.moment(floor);
    const lucky = contest ? 1 : this.luck.delete(key) ? 2 : 1;
    const up = contest ? CONTEST_BOOST : {};
    const mine = this.dex[floor]?.[key.slice(0, key.lastIndexOf('@'))]?.fish || {};
    // My rod's step makes the rarer ones likelier, but a contest is everyone on the same rod.
    const rod = contest ? 1 : 1 + RODS[this.forge(floor, key.slice(0, key.lastIndexOf('@'))).step].up;
    const boost = { rare: (now.wet ? 1.6 : 1) * lucky * (up.rare || 1), epic: (now.wet ? 2 : 1) * lucky * (up.epic || 1), legend: (now.wet ? 2 : 1) * lucky * (up.legend || 1) };
    const rar = Object.entries(RARITY).map(([k, r]) => [k, r.weight * (boost[k] || 1)]);
    // What the rod adds to the rarer ones comes out of 가끔 alone, so 흔함 and 꽝 stay as they are.
    let extra = 0;
    for (const e of rar) if (LOUD.has(e[0])) { extra += e[1] * (rod - 1); e[1] *= rod; }
    const some = rar.find(([r]) => r === 'uncommon');
    some[1] = Math.max(0, some[1] - extra);
    const k = roll(rar, this.random());
    const odds = (f) => {
      if (f.need && (mine[f.need.id]?.n || 0) < (f.need.n || 1)) return 0;
      const ws = whens(f);
      if (!ws.length) return f.w ?? 1;
      const met = ws.every((w) => now[w]);
      if (f.only) return met ? (f.w ?? 1) * 3 : 0;
      return (f.w ?? 1) * (met ? (ws[0] === 'night' ? 3 : 4) : ws[0] === 'night' ? 0.4 : WET.has(ws[0]) ? 0.7 : 0.6);
    };
    const list = FISH.filter((f) => f.rarity === k).map((f) => [f, odds(f)]).filter(([, w]) => w > 0);
    return roll(list, this.random());
  }

  // How big: most near the middle of the range; a quick hand pulls a slightly bigger one.
  size(f, dt) {
    const [lo, hi] = f.cm;
    const u = (this.random() + this.random() + this.random()) / 3;
    const quick = dt < 350 ? 0.08 : 0;
    const v = Math.min(1, u + quick * this.random());
    return Math.round((lo + (hi - lo) * v) * 10) / 10;
  }

  // Into my book. isNew: the first of its kind for me; best: my biggest of it; record: the
  // floor's biggest of it (from: whose it was).
  keep(floor, who, f, cm) {
    const people = (this.dex[floor] ||= {});
    const before = this.record(floor, f.id);
    const me = (people[who.id] ||= { name: who.name, total: 0, fish: {} });
    me.name = who.name;
    me.total += 1;
    const had = me.fish[f.id];
    const isNew = !had;
    const best = cm != null && (!had || had.best == null || cm > had.best);
    // ⚒️ Points for the catch (twice for a new kind), and a 🛡 charm for a legend.
    const forge = this.forge(floor, who.id);
    const points = POINTS[f.rarity] * (isNew ? 2 : 1);
    forge.pts += points;
    const charm = f.rarity === 'legend' && forge.charms < MAX_CHARMS;
    if (charm) forge.charms += 1;
    me.fish[f.id] = { n: (had?.n || 0) + 1, best: best ? cm : had?.best ?? null, first: had?.first || this.now() };
    const record = cm != null && (!before || cm > before.cm)
      ? { from: before && before.id !== who.id ? { name: before.name, size: cmText(before.cm) } : null } : null;
    return { isNew, best, record, count: kindsIn(me.fish), of: FISH.length, points, ...(charm ? { charm: true } : {}) };
  }

  // My ⚒️ 강화 state on a floor (kept with my book): the rod's step, my points, 장인의 기운 (0-100)
  // and charms. One who had a book before 강화 starts from the first rod with the points their
  // catches so far would have earned (each kind's first twice), and a charm per legend.
  forge(floor, userId) {
    const me = this.dex[floor]?.[userId];
    if (!me) return { step: 0, pts: 0, gauge: 0, charms: 0 };
    if (!me.forge) {
      let pts = 0, legends = 0;
      for (const [id, e] of Object.entries(me.fish)) {
        const f = fishById(id); if (!f) continue;
        pts += POINTS[f.rarity] * ((e.n || 1) + 1);
        if (f.rarity === 'legend') legends += e.n || 1;
      }
      me.forge = { step: 0, pts, gauge: 0, charms: Math.min(MAX_CHARMS, legends) };
    }
    return me.forge;
  }

  // My rod on a floor as the screens show it: its step, name and how much likelier the rarer ones
  // are; my points, 장인의 기운 and charms; and the next step: what it needs and its odds.
  rod(floor, userId) {
    const kinds = kindsIn(this.dex[floor]?.[userId]?.fish);
    const fg = this.forge(floor, userId), r = RODS[fg.step], n = RODS[fg.step + 1];
    return {
      step: fg.step, name: r.name, up: Math.round(r.up * 100), pts: fg.pts, gauge: Math.round(fg.gauge), charms: fg.charms, kinds,
      next: n ? { name: n.name, need: n.need, kindsLeft: Math.max(0, n.need - kinds), cost: n.cost, rate: n.rate, brk: n.brk, sure: fg.gauge >= 100 } : null,
    };
  }

  // ⚒️ One try at the next rod. success: up a step; break: down one, two or to the first (a charm, if I have one, stops
  // that and is used up: saved); fail: 장인의 기운 fills by half the rate, and full it cannot fail.
  enhance(floor, userId) {
    const me = this.dex[floor]?.[userId];
    if (!me) throw err(409, '먼저 물고기를 낚아야 강화할 수 있어요');
    const fg = this.forge(floor, userId), n = RODS[fg.step + 1];
    if (!n) throw err(409, '벌써 마지막 낚싯대예요');
    const kinds = kindsIn(me.fish);
    if (kinds < n.need) throw err(409, `도감 ${n.need}종부터 강화할 수 있어요 (${n.need - kinds}종 더)`);
    if (fg.pts < n.cost) throw err(409, `강화 포인트가 ${n.cost - fg.pts} 모자라요`);
    fg.pts -= n.cost;
    const from = RODS[fg.step].name, roll = this.random() * 100;
    let result, drop = 0;
    if (fg.gauge >= 100 || roll < n.rate) { result = 'success'; fg.step += 1; fg.gauge = 0; }
    else if (roll < n.rate + n.brk) {
      if (fg.charms > 0) { result = 'saved'; fg.charms -= 1; fg.gauge = Math.min(100, fg.gauge + n.rate / 2); }
      else {
        result = 'break';
        const u = this.random();
        drop = u < BREAK.zero ? fg.step : Math.min(fg.step, u < BREAK.zero + BREAK.two ? 2 : 1);
        fg.step -= drop; fg.gauge = 0;
      }
    } else { result = 'fail'; fg.gauge = Math.min(100, fg.gauge + n.rate / 2); }
    return { result, from, to: RODS[fg.step].name, ...(result === 'break' ? { drop, ...(fg.step === 0 ? { zero: true } : {}) } : {}), rod: this.rod(floor, userId) };
  }

  // The floor's biggest of one kind.
  record(floor, fishId) {
    let top = null;
    for (const [id, p] of Object.entries(this.dex[floor] || {})) {
      const b = p.fish[fishId]?.best;
      if (b != null && (!top || b > top.cm)) top = { id, name: p.name, cm: b };
    }
    return top;
  }

  // When it comes out, as the book tells it (a fish that follows another names that one only once
  // I have caught it).
  hint(f, me) {
    const ws = whens(f);
    // One only at some time says so; several together read as one.
    const SHORT = { night: '🌙 오후 4시 이후', rain: '🌧 비 오는 날', snow: '❄ 눈 오는 날' };
    const out = f.only && ws.length && ws.every((w) => SHORT[w]) ? [ws.map((w) => SHORT[w]).join(' + ') + '에만'] : ws.map((w) => HINT[w]);
    if (f.need) { const n = FISH.find((x) => x.id === f.need.id); out.push(`🔗 ${me[f.need.id] ? n.name : '어떤 물고기'}를 ${f.need.n > 1 ? `${f.need.n}마리 ` : ''}먼저 낚아야 나와요`); }
    return out.join(' · ');
  }

  // My picture book on a floor, every kind in order: what I caught (and how big), the floor's
  // record of each, and the floor's top three by how many kinds they have.
  book(floor, userId) {
    const people = this.dex[floor] || {};
    const me = people[userId]?.fish || {};
    const list = FISH.map((f) => {
      const mine = me[f.id];
      const rec = f.cm ? this.record(floor, f.id) : null;
      const anyone = Object.values(people).some((p) => p.fish[f.id]);
      return {
        id: f.id, rarity: f.rarity, mark: RARITY[f.rarity].mark, color: RARITY[f.rarity].color, rarityName: RARITY[f.rarity].name,
        // Not caught by me: only the shadow and "???", so the book stays something to fill.
        name: mine ? f.name : '???', desc: mine ? f.desc : (anyone ? '이 층 누군가는 낚았어요' : ''), hint: this.hint(f, me),
        n: mine?.n || 0, best: mine?.best != null ? cmText(mine.best) : '', caught: !!mine,
        record: rec ? { name: rec.name, size: cmText(rec.cm), me: rec.id === userId } : null,
      };
    });
    const top = Object.entries(people).map(([id, p]) => ({ id, name: p.name, kinds: kindsIn(p.fish), total: p.total }))
      .sort((a, b) => b.kinds - a.kinds || b.total - a.total).slice(0, 3)
      .map((p) => ({ name: p.name, kinds: p.kinds, total: p.total, me: p.id === userId }));
    return { list, top, count: kindsIn(me), of: FISH.length, total: people[userId]?.total || 0, rod: this.rod(floor, userId) };
  }
}

function roll(weighted, r) {
  const sum = weighted.reduce((s, [, w]) => s + w, 0);
  let x = r * sum;
  for (const [v, w] of weighted) { if ((x -= w) < 0) return v; }
  return weighted[weighted.length - 1][0];
}
