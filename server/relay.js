// 🎨 이어 그리기 (a co-op drawing relay) on a floor: the first drawer sees the topic, the
// ones after see only the picture so far and add to it for a few seconds each, and the
// last one names it. One game per floor; the hub holds it, keeps the turns and the time,
// and shows each person only what their part allows (view): nobody sees the picture
// until their turn, and only the first drawer sees the topic before the end. A game is
// RELAY_ROUNDS topics: after each the answer shows a moment (reveal), the order turns by one (a new
// first drawer, a new guesser), and the end tells how many the team named.
// 🖍 캐치마인드 (mode 'catch') on the same table: one draws, everyone else watches the
// lines come in and types guesses; the first right one ends the turn, scores a point (only
// the one who named it, not the drawer), and draws next. The host picks how many topics and how long each before it starts;
// its words are plain single ones (server/catch-words.js), not the relay's scenes.
import { CATCH_WORDS, CATCH_HARD } from './catch-words.js';

// Drawable in a few seconds each, but not in one stroke: places, scenes, people doing
// things, and two things together, so the relay has something to get wrong.
export const TOPICS = [
  // Places and buildings
  '등대', '놀이공원', '롤러코스터', '회전목마', '관람차', '캠핑장', '수영장', '도서관', '병원', '소방서',
  '경찰서', '학교', '편의점', '빵집', '카페', '영화관', '공항', '기차역', '주유소', '무인도',
  '피라미드', '에펠탑', '성', '동굴', '화산', '사막', '폭포', '정글', '남극', '우주 정거장',
  // People doing things
  '치과 치료', '낚시', '스키', '서핑', '등산', '줄넘기', '태권도', '요가', '볼링', '농구 슛',
  '축구 골', '야구 홈런', '마라톤', '자전거 여행', '캠핑 불멍', '바비큐', '김장', '이사', '청소기 돌리기', '빨래 널기',
  '설거지', '머리 감기', '양치질', '낮잠', '야근', '출근길 지하철', '회의 시간', '발표', '커피 쏟기', '택배 받기',
  '사진 찍기', '노래방', '생일 파티', '결혼식', '졸업식', '소풍', '불꽃놀이', '눈싸움', '썰매 타기', '연날리기',
  // Animals doing things
  '우산 쓴 고양이', '스키 타는 펭귄', '책 읽는 부엉이', '선글라스 낀 강아지', '피아노 치는 곰', '자전거 타는 원숭이', '수영하는 코끼리', '모자 쓴 개구리', '왕관 쓴 사자', '케이크 먹는 돼지',
  '커피 마시는 판다', '노트북 하는 토끼', '줄다리기하는 개미', '날아가는 돼지', '잠자는 나무늘보', '헤엄치는 상어', '알 품는 닭', '달리는 치타', '춤추는 문어', '기린 목도리',
  // Things and situations
  '눈사람', '허수아비', '로봇 청소기', '자판기', '신호등', '횡단보도', '엘리베이터', '에스컬레이터', '회전문', '분수대',
  '열기구', '잠수함', '헬리콥터', '우주선', '유에프오', '해적선', '소방차', '구급차', '트랙터', '케이블카',
  '무지개', '번개', '태풍', '일식', '오로라', '별똥별', '모래성', '이글루', '트리하우스', '오두막',
  '생일 케이크', '도시락', '라면', '김밥', '팥빙수', '붕어빵', '솜사탕', '팝콘', '햄버거 세트', '치킨',
  '산타클로스', '해적', '마법사', '닌자', '우주인', '인어', '좀비', '유령', '공룡', '용',
  '체스', '루빅큐브', '레고', '시소', '미끄럼틀', '그네', '트램펄린', '물총 싸움', '종이비행기', '저금통',
];
export const COLORS = ['#E63946', '#2A9D8F', '#3D5A80', '#F4A261', '#8E44AD', '#E76F51', '#6A994E', '#1D3557'];
const FIRST_MS = 20_000;     // the first drawer, who knows the topic
const NEXT_MS = 15_000;      // each one after
const GUESS_MS = 30_000;     // the last one, to name it
const LOBBY_MS = 10 * 60_000; // an open table nobody starts
const SHOWN_MS = 60_000;     // the ending stays this long, replay included
export const RELAY_ROUNDS = 3; // 🎨 topics in a game
const RELAY_REVEAL_MS = 8_000; // 🎨 a topic's answer and picture, before the next
const MAX_PLAYERS = 8;
// 🖍 what the host may pick: how many topics, and seconds to draw each; then the defaults.
export const CATCH_ROUNDS = [5, 10, 15, 20];
export const CATCH_SECS = [60, 90, 120];
const CATCH_DEFAULT = { rounds: 10, secs: 90 };
const REVEAL_MS = 4_000;     // 🖍 the topic shown between turns
const MAX_FEED = 30;
const MAX_STROKES = 400;
const MAX_POINTS = 400;

const err = (status, message) => Object.assign(new Error(message), { status });
// Spaces and signs do not matter in an answer: "눈 사람" is "눈사람".
const plain = (s) => String(s || '').toLowerCase().replace(/[\s.,!?~'"·-]/g, '');

export class Relays {
  // used: topics already drawn; a topic comes back only after all the others had their turn.
  constructor({ now = () => Date.now(), rand = Math.random, onEnd = () => {}, used = [] } = {}) {
    Object.assign(this, { now, rand, onEnd, games: new Map(), seq: 0, used: new Set(used.filter((t) => TOPICS.includes(t) || CATCH_WORDS.includes(t) || CATCH_HARD.includes(t))) });
  }

  // From the relay's scenes, or 🖍's words; a list starts over once all of it has been used.
  pickTopic(list = TOPICS) {
    let pool = list.filter((t) => !this.used.has(t));
    if (!pool.length) { for (const t of list) this.used.delete(t); pool = list; }
    const t = pool[Math.floor(this.rand() * pool.length)];
    this.used.add(t);
    return t;
  }

  // Moves on a turn whose time is up, and drops what is over.
  // 🏷 A floor renamed: its table follows the name.
  renameFloor(from, to) { const g = this.games.get(from); if (g) { this.games.delete(from); g.floor = to; this.games.set(to, g); } }
  sweep() {
    const now = this.now();
    for (const [floor, g] of this.games) {
      if (g.phase === 'lobby' && now - g.at > LOBBY_MS) this.games.delete(floor);
      else if (g.mode === 'catch' && g.phase === 'draw' && now > g.ends) this.endCatchTurn(g, null);
      else if (g.phase === 'reveal' && now > g.ends) { if (g.mode === 'catch') this.nextCatchTurn(g); else this.nextRelayRound(g); }
      else if (g.phase === 'draw' && now > g.ends) this.pass(g);
      else if (g.phase === 'guess' && now > g.ends) this.finish(g, '');
      else if (g.phase === 'done' && now - g.at > SHOWN_MS) this.games.delete(floor);
    }
  }

  get(floor) {
    this.sweep();
    return this.games.get(floor) || null;
  }

  open(floor, who, mode = 'relay') {
    const g = this.get(floor);
    if (g && g.phase !== 'done') throw err(409, `이 층에는 이미 ${g.mode === 'catch' ? '캐치마인드' : '이어 그리기'}가 열려 있어요`);
    const n = { id: ++this.seq, floor, mode: mode === 'catch' ? 'catch' : 'relay', host: who.id, players: [{ id: who.id, name: who.name }], phase: 'lobby', at: this.now(),
      ...(mode === 'catch' ? CATCH_DEFAULT : {}) };
    this.games.set(floor, n);
    return n;
  }

  join(floor, who) {
    const g = this.get(floor);
    if (!g || g.phase !== 'lobby') throw err(404, '참가할 수 있는 이어 그리기가 없어요');
    if (g.players.some((p) => p.id === who.id)) return g;
    if (g.players.length >= MAX_PLAYERS) throw err(409, `${MAX_PLAYERS}명까지 할 수 있어요`);
    g.players.push({ id: who.id, name: who.name });
    return g;
  }

  // Leaving the table before it starts; the host leaving closes it. A player leaving once it
  // has started stops it for everyone, and the topic is told.
  leave(floor, userId) {
    const g = this.get(floor);
    if (!g) return null;
    if (g.phase === 'done' || (g.phase === 'lobby' && g.host === userId)) { this.games.delete(floor); return null; }
    if (g.phase === 'lobby') { g.players = g.players.filter((p) => p.id !== userId); return g; }
    const who = g.players.find((p) => p.id === userId);
    if (who) { g.stoppedBy = who.name; return g.mode === 'catch' ? this.finishCatch(g) : g.phase === 'reveal' ? this.endRelay(g) : this.finish(g, ''); }
    return g;
  }

  start(floor, userId) {
    const g = this.get(floor);
    if (!g || g.phase !== 'lobby') throw err(404, '시작할 이어 그리기가 없어요');
    if (g.host !== userId) throw err(403, '연 사람이 시작해요');
    if (g.players.length < 2) throw err(409, '두 명 이상 모이면 시작할 수 있어요 (세 명 이상이면 더 재밌어요)');
    // A random order: the first draws knowing the topic, the last guesses.
    const order = [...g.players];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    if (g.mode === 'catch') {
      Object.assign(g, { players: order.map((p, i) => ({ ...p, color: COLORS[i % COLORS.length] })), scores: order.map(() => 0), round: 0, next: 0, hardRounds: this.hardRounds(g.rounds) });
      return this.nextCatchTurn(g);
    }
    Object.assign(g, { players: order.map((p, i) => ({ ...p, color: COLORS[i % COLORS.length] })), rounds: RELAY_ROUNDS, round: 0, results: [] });
    return this.nextRelayRound(g);
  }

  // 🎨 the next topic: after the first, the order turns by one, so someone else starts and
  // someone else names it.
  nextRelayRound(g) {
    if (g.round > 0) g.players.push(g.players.shift());
    // One plain word each (server/catch-words.js): a scene drawn on by a few hands was too hard to name.
    Object.assign(g, { round: g.round + 1, topic: this.pickTopic(CATCH_WORDS), strokes: [], turn: 0, phase: g.players.length > 1 ? 'draw' : 'guess', answer: undefined, correct: undefined });
    this.beginTurn(g);
    return g;
  }

  beginTurn(g) {
    g.at = this.now();
    g.ends = this.now() + (g.phase === 'guess' ? GUESS_MS : g.turn === 0 ? FIRST_MS : NEXT_MS);
  }

  // stroke: { w, points: [[x, y], ...] } in 0..1000 on a square sheet; the drawer's colour.
  stroke(floor, userId, stroke) {
    const g = this.get(floor);
    if (!g || g.phase !== 'draw' || g.players[g.turn].id !== userId) throw err(409, '내 차례가 아니에요');
    if (g.strokes.length >= MAX_STROKES) throw err(413, '그림이 너무 많아요');
    const pts = (Array.isArray(stroke?.points) ? stroke.points : []).slice(0, MAX_POINTS)
      .map((p) => [Math.max(0, Math.min(1000, Math.round(Number(p?.[0]) || 0))), Math.max(0, Math.min(1000, Math.round(Number(p?.[1]) || 0)))]);
    if (!pts.length) throw err(400, '빈 선이에요');
    g.strokes.push({ by: g.turn, w: Math.max(2, Math.min(24, Math.round(Number(stroke.w) || 6))), points: pts });
    return g;
  }

  // 🖍 the drawer wipes the sheet and starts over.
  clear(floor, userId) {
    const g = this.get(floor);
    if (!g || g.mode !== 'catch' || g.phase !== 'draw' || g.players[g.turn].id !== userId) throw err(409, '그리는 사람만 지울 수 있어요');
    g.strokes = [];
    return g;
  }

  // ---- 🖍 캐치마인드 ----
  // The host's choice before it starts: how many topics, how many seconds each.
  setup(floor, userId, { rounds, secs } = {}) {
    const g = this.get(floor);
    if (!g || g.mode !== 'catch' || g.phase !== 'lobby') throw err(404, '설정할 캐치마인드가 없어요');
    if (g.host !== userId) throw err(403, '연 사람이 정해요');
    if (rounds !== undefined && rounds !== null) { if (!CATCH_ROUNDS.includes(Number(rounds))) throw err(400, '고를 수 없는 문제 수예요'); g.rounds = Number(rounds); }
    if (secs !== undefined && secs !== null) { if (!CATCH_SECS.includes(Number(secs))) throw err(400, '고를 수 없는 시간이에요'); g.secs = Number(secs); }
    return g;
  }
  // One or two of a game's topics are hard ones (CATCH_HARD), never the first.
  hardRounds(rounds) {
    const later = Array.from({ length: rounds - 1 }, (_, i) => i + 2);
    const n = Math.min(later.length, this.rand() < 0.5 ? 1 : 2);
    const picked = [];
    while (picked.length < n) picked.push(later.splice(Math.floor(this.rand() * later.length), 1)[0]);
    return picked;
  }
  nextCatchTurn(g) {
    if (g.round >= g.rounds) return this.finishCatch(g);
    Object.assign(g, { phase: 'draw', round: g.round + 1, turn: g.next, hard: g.hardRounds.includes(g.round + 1), topic: this.pickTopic(g.hardRounds.includes(g.round + 1) ? CATCH_HARD : CATCH_WORDS), strokes: [], feed: [], at: this.now(), ends: this.now() + g.secs * 1000 });
    return g;
  }
  // by: who named it (they draw next), or null when the time ran out or the drawer gave up.
  endCatchTurn(g, by) {
    const n = g.players.length;
    if (by !== null) g.scores[by] += g.hard ? 2 : 1; // a hard topic is worth two
    Object.assign(g, { phase: 'reveal', last: { topic: g.topic, drawer: g.turn, by, hard: g.hard === true }, next: by ?? (g.turn + 1) % n, ends: this.now() + REVEAL_MS });
    return g;
  }
  catchGuess(g, userId, text) {
    const me = g.players.findIndex((p) => p.id === userId);
    if (g.phase !== 'draw') throw err(409, '지금은 맞히는 시간이 아니에요');
    if (me < 0) throw err(403, '참가한 사람만 맞혀요');
    if (me === g.turn) throw err(409, '그리는 사람은 맞힐 수 없어요');
    const t = String(text || '').trim().slice(0, 40);
    if (!t) throw err(400, '답을 적어 주세요');
    const ok = plain(t) === plain(g.topic);
    g.feed.push({ by: me, text: ok ? null : t, ok });
    if (g.feed.length > MAX_FEED) g.feed.shift();
    return ok ? this.endCatchTurn(g, me) : g;
  }
  finishCatch(g) {
    const top = Math.max(...g.scores);
    Object.assign(g, { phase: 'done', winners: g.players.filter((_, i) => g.scores[i] === top && top > 0).map((p) => p.name), at: this.now() });
    this.onEnd(g);
    return g;
  }

  // "다 그렸어요" (or the time is up): the next one draws, or the last one guesses.
  // 🖍 the drawer's "넘기기": the topic is shown and the next one in order draws.
  pass(g, userId = null) {
    if (typeof g === 'string') g = this.get(g);
    if (!g || g.phase !== 'draw') throw err(404, '그리는 중인 이어 그리기가 없어요');
    if (userId && g.players[g.turn].id !== userId) throw err(409, '내 차례가 아니에요');
    if (g.mode === 'catch') return this.endCatchTurn(g, null);
    g.turn += 1;
    if (g.turn >= g.players.length - 1) { g.turn = g.players.length - 1; g.phase = 'guess'; }
    this.beginTurn(g);
    return g;
  }

  guess(floor, userId, text) {
    const g = this.get(floor);
    if (g?.mode === 'catch') return this.catchGuess(g, userId, text);
    if (!g || g.phase !== 'guess' || g.players[g.turn].id !== userId) throw err(409, '정답은 마지막 사람이 외쳐요');
    return this.finish(g, String(text || '').trim().slice(0, 40));
  }

  // 🎨 a topic is over (named, the time up, or someone stopped): its answer shows a moment, then
  // the next topic; after the last one (or a stop) the game is over.
  finish(g, answer) {
    const a = plain(answer), t = plain(g.topic);
    // The word itself (spaces and signs aside): a part of it, or a word with it in, is not it.
    const correct = !!a && a === t;
    g.results.push({ topic: g.topic, answer, correct });
    Object.assign(g, { answer, correct, at: this.now() });
    if (g.stoppedBy || g.round >= g.rounds) return this.endRelay(g);
    Object.assign(g, { phase: 'reveal', ends: this.now() + RELAY_REVEAL_MS });
    return g;
  }
  endRelay(g) {
    Object.assign(g, { phase: 'done', score: g.results.filter((r) => r.correct).length, at: this.now() });
    this.onEnd(g);
    return g;
  }

  // What one person sees. role: 'first' | 'middle' | 'guesser' | 'watch' (not playing).
  view(floor, userId) {
    const g = this.get(floor);
    if (!g) return null;
    const me = g.players.findIndex((p) => p.id === userId);
    const role = me < 0 ? 'watch' : me === 0 ? 'first' : me === g.players.length - 1 && g.phase !== 'lobby' ? 'guesser' : 'middle';
    const v = {
      id: g.id, floor: g.floor, mode: g.mode, phase: g.phase, host: g.host === userId, joined: me >= 0, role,
      players: g.players.map((p) => ({ name: p.name, color: p.color || null })), turn: g.turn ?? null, me,
    };
    if (g.phase === 'lobby') return g.mode === 'catch' ? { ...v, rounds: g.rounds, secs: g.secs, roundOptions: CATCH_ROUNDS, secOptions: CATCH_SECS } : v;
    if (g.mode === 'catch') return this.catchView(g, v, me);
    const mine = me === g.turn, over = g.phase === 'done' || g.phase === 'reveal';
    Object.assign(v, { round: g.round, rounds: g.rounds });
    v.myTurn = mine && !over;
    v.timeLeft = g.phase === 'done' ? 0 : Math.max(0, g.ends - this.now());
    // The picture: to whoever holds it now, and to all once the topic is over (for the replay).
    if (mine || over) v.strokes = g.strokes;
    if ((mine && me === 0) || over) v.topic = g.topic;
    if (over) Object.assign(v, { answer: g.answer, correct: g.correct });
    if (g.phase === 'done') Object.assign(v, { stoppedBy: g.stoppedBy || null, score: g.score, results: g.results });
    return v;
  }

  // 🖍 everyone sees the lines as they come; only the drawer sees the topic (the others its
  // shape, ○ for each letter), until the turn ends.
  catchView(g, v, me) {
    const name = (i) => (i === null || i === undefined ? null : g.players[i].name);
    Object.assign(v, {
      role: me < 0 ? 'watch' : me === g.turn ? 'drawer' : 'guesser', round: g.round, rounds: g.rounds,
      myTurn: g.phase === 'draw' && me === g.turn, timeLeft: g.phase === 'done' ? 0 : Math.max(0, g.ends - this.now()),
      strokes: g.strokes, scores: g.scores, drawer: name(g.turn), hard: g.hard === true,
      feed: (g.feed || []).map((f) => ({ by: name(f.by), text: f.text, ok: f.ok })),
      last: g.last ? { topic: g.last.topic, drawer: name(g.last.drawer), by: name(g.last.by), hard: g.last.hard === true } : null,
    });
    if (g.phase === 'draw') {
      if (me === g.turn) v.topic = g.topic;
      else v.mask = g.topic.replace(/\S/g, '○');
    }
    if (g.phase === 'done') Object.assign(v, { winners: g.winners, stoppedBy: g.stoppedBy || null });
    return v;
  }
}
