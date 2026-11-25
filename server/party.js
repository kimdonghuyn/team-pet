// 🎲 같이 하기: games the whole floor plays in turns. One table per floor, opened, joined
// and started like 🎨 이어 그리기 (server/relay.js); the hub keeps the turns, the time and
// every decision, and each person sees their own view (view).
//   🏗 stack — drop a sliding block on the tower; what overhangs is cut off; a miss ends it.
//   💣 bomb  — throw the bomb to someone; it goes off at a moment nobody knows.
//   🔤 words — 끝말잇기: a word that starts with the last one's last syllable, in time.
//   🕵️ liar  — 라이어 게임: all but one see the word; two rounds of one-line hints, a vote,
//              and a caught liar may still win by naming the word.
//   🤪 fool  — 바보 라이어: the same, but the liar is told another word of the category and
//              does not know they are the liar.
//   🚇 subway — 지하철 타자 레이스: the host picks two stations (or leaves it to chance), the
//              hub works out the way with the fewest stops, and everyone types it stop by stop
//              (changes of line just happen) — ranked by when they arrive.
import { LIAR_WORDS } from './liar-words.js';
import { findStation, lineColor, norm, pickRoute, planRoute } from './subway.js';

export const KINDS = { stack: '🏗 높이 쌓기', bomb: '💣 폭탄 돌리기', words: '🔤 끝말잇기', liar: '🕵️ 라이어 게임', fool: '🤪 바보 라이어', subway: '🚇 지하철 레이스' };
// 🚇 how long a race may take; after that the ones still riding are left unranked.
// GO_MS: the countdown at the start, when the way is shown to all and nobody may type yet.
const RACE_MS = 6 * 60_000, MAX_STEPS = 40, GO_MS = 3_000;
const isLiar = (g) => g.kind === 'liar' || g.kind === 'fool';
const LOBBY_MS = 10 * 60_000;
const SHOWN_MS = 45_000;
const MAX_PLAYERS = 10;
// 🏗 the tower lives on a 1000-wide floor; the first block is 400 wide.
const STACK_W = 1000, STACK_START = 400, STACK_TURN_MS = 10_000, PERFECT = 8;
// 💣 a fuse between these, and a bomb is held at least this long before it can fly on.
const FUSE_MIN = 15_000, FUSE_MAX = 40_000, HOLD_MS = 1_000;
// 🔤 time for a word, and words to begin with.
const WORD_MS = 12_000;
const FIRST_WORDS = ['기차', '사과', '바다', '나무', '고양이', '컴퓨터', '하늘', '우산', '자전거', '도서관', '라면', '김치', '토끼', '노래', '시계'];
// 🕵️ rounds of hints, and the time for a hint, the vote (the talk happens in the floor chat
// meanwhile) and the caught liar's one guess.
const LIAR_ROUNDS = 2, TOPIC_MS = 15_000, HINT_MS = 25_000, VOTE_MS = 40_000, GUESS_MS = 20_000, LIAR_MIN = 3;
export const LIAR_TOPICS = Object.keys(LIAR_WORDS);
const sameWord = (a, b) => String(a || '').replace(/\s/g, '') === String(b || '').replace(/\s/g, '');

const err = (status, message) => Object.assign(new Error(message), { status });

// 끝말잇기 with 두음법칙: 력 → 역, 녀 → 여, 래 → 내 … The syllables a word may begin with.
const HANGUL = 0xac00;
const split = (ch) => { const c = ch.charCodeAt(0) - HANGUL; return c < 0 || c > 11171 ? null : { i: Math.floor(c / 588), v: Math.floor((c % 588) / 28), f: c % 28 }; };
const join = ({ i, v, f }) => String.fromCharCode(HANGUL + i * 588 + v * 28 + f);
const I_N = 2, I_R = 5, I_O = 11; // ㄴ ㄹ ㅇ
const Y_VOWELS = new Set([2, 6, 7, 12, 17, 20]); // ㅑ ㅕ ㅖ ㅛ ㅠ ㅣ
export function startsFor(last) {
  const s = split(last);
  const out = new Set([last]);
  if (!s) return out;
  if (s.i === I_R) out.add(join({ ...s, i: Y_VOWELS.has(s.v) ? I_O : I_N }));
  if (s.i === I_N && Y_VOWELS.has(s.v)) out.add(join({ ...s, i: I_O }));
  return out;
}

export class Parties {
  constructor({ now = () => Date.now(), rand = Math.random, onEnd = () => {}, records = {}, liarUsed = [] } = {}) {
    Object.assign(this, { now, rand, onEnd, games: new Map(), seq: 0, records: { ...records }, liarUsed: [...liarUsed] });
  }

  // A word of the category not given since that category's list went round; it starts over
  // when every word of it is used.
  pickLiarWord(category) {
    const words = LIAR_WORDS[category];
    let left = words.filter((w) => !this.liarUsed.includes(w));
    if (!left.length) { this.liarUsed = this.liarUsed.filter((w) => !words.includes(w)); left = words; }
    const word = left[Math.floor(this.rand() * left.length)];
    this.liarUsed.push(word);
    const others = words.filter((w) => w !== word);
    return { category, word, decoy: others[Math.floor(this.rand() * others.length)] };
  }

  // 🏷 A floor renamed: its table follows the name.
  renameFloor(from, to) { const g = this.games.get(from); if (g) { this.games.delete(from); g.floor = to; this.games.set(to, g); } }
  sweep() {
    const now = this.now();
    for (const [floor, g] of this.games) {
      if (g.phase === 'lobby' && now - g.at > LOBBY_MS) this.games.delete(floor);
      else if (g.phase === 'done' && now - g.at > SHOWN_MS) this.games.delete(floor);
      else if (g.phase === 'play') {
        if (g.kind === 'stack' && now > g.ends) this.drop(g, this.slide(g, now));
        if (g.kind === 'bomb' && now >= g.fuse) this.boom(g);
        if (g.kind === 'words' && now > g.ends) this.out(g, '시간 초과');
        if (isLiar(g) && now > g.ends) this.liarTimeUp(g);
        if (g.kind === 'subway' && now > g.ends) this.raceEnd(g);
      }
    }
  }

  get(floor) { this.sweep(); return this.games.get(floor) || null; }

  open(floor, who, kind) {
    if (!KINDS[kind]) throw err(400, '없는 놀이입니다');
    const g = this.get(floor);
    if (g && g.phase !== 'done') throw err(409, `이 층에는 이미 ${KINDS[g.kind]} 가 열려 있어요`);
    const n = { id: ++this.seq, floor, kind, host: who.id, players: [{ id: who.id, name: who.name }], phase: 'lobby', at: this.now() };
    this.games.set(floor, n);
    return n;
  }

  join(floor, who) {
    const g = this.get(floor);
    if (!g || g.phase !== 'lobby') throw err(404, '참가할 수 있는 놀이가 없어요');
    if (!g.players.some((p) => p.id === who.id)) {
      if (g.players.length >= MAX_PLAYERS) throw err(409, `${MAX_PLAYERS}명까지 할 수 있어요`);
      g.players.push({ id: who.id, name: who.name });
    }
    return g;
  }

  leave(floor, userId) {
    const g = this.get(floor);
    if (!g) return null;
    if (g.phase === 'done' || (g.phase === 'lobby' && g.host === userId)) { this.games.delete(floor); return null; }
    if (g.phase === 'lobby') g.players = g.players.filter((p) => p.id !== userId);
    // A player leaving mid-game stops it for the whole table; no record or winner comes of it.
    const who = g.players.find((p) => p.id === userId);
    if (g.phase === 'play' && who) {
      g.stopped = true;
      return this.finish(g, `🛑 ${who.name} 님이 그만했어요`);
    }
    return g;
  }

  start(floor, userId) {
    const g = this.get(floor);
    if (!g || g.phase !== 'lobby') throw err(404, '시작할 놀이가 없어요');
    if (g.host !== userId) throw err(403, '연 사람이 시작해요');
    if (g.players.length < 2) throw err(409, '두 명 이상 모이면 시작할 수 있어요');
    if (isLiar(g) && g.players.length < LIAR_MIN) throw err(409, `${LIAR_MIN}명 이상 모이면 시작할 수 있어요`);
    const order = [...g.players];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    Object.assign(g, { players: order, phase: 'play', turn: 0, at: this.now() });
    if (g.kind === 'stack') { g.blocks = [{ x: (STACK_W - STACK_START) / 2, w: STACK_START }]; this.stackTurn(g); }
    if (g.kind === 'bomb') Object.assign(g, { fuse: this.now() + FUSE_MIN + Math.floor(this.rand() * (FUSE_MAX - FUSE_MIN)), held: this.now(), lit: this.now(), throws: 0 });
    if (g.kind === 'words') Object.assign(g, { words: [{ word: FIRST_WORDS[Math.floor(this.rand() * FIRST_WORDS.length)], by: null }], alive: order.map(() => true), ends: this.now() + WORD_MS });
    if (isLiar(g)) Object.assign(g, { liar: Math.floor(this.rand() * order.length), step: 'topic', topicVotes: {}, hints: [], votes: {}, turn: null, ends: this.now() + TOPIC_MS });
    if (g.kind === 'subway') {
      const route = g.route || { ...pickRoute(this.rand), random: true };
      Object.assign(g, { route, t0: this.now() + GO_MS, ends: this.now() + GO_MS + RACE_MS, turn: null, riders: order.map(() => ({ pos: 0, done: null, miss: 0 })) });
    }
    return g;
  }

  // ---- 🚇 subway ----
  // The host, in the lobby: the two stations, and the way between them shown to all at once.
  setRoute(floor, userId, from, to) {
    const g = this.get(floor);
    if (!g || g.kind !== 'subway' || g.phase !== 'lobby') throw err(404, '지하철 레이스 대기실이 없어요');
    if (g.host !== userId) throw err(403, '연 사람이 정해요');
    const a = findStation(from), b = findStation(to);
    if (!a) throw err(400, `「${String(from || '').trim().slice(0, 20)}」 역은 없어요 (1~9호선)`);
    if (!b) throw err(400, `「${String(to || '').trim().slice(0, 20)}」 역은 없어요 (1~9호선)`);
    if (a === b) throw err(400, '출발역과 도착역이 같아요');
    const steps = planRoute(a, b);
    if (!steps) throw err(400, '이어지는 길이 없어요');
    if (steps.length > MAX_STEPS) throw err(400, `너무 멀어요 (${steps.length}번, ${MAX_STEPS}번까지)`);
    g.route = { from: a, to: b, steps };
    return g;
  }
  setRandomRoute(floor, userId) {
    const g = this.get(floor);
    if (!g || g.kind !== 'subway' || g.phase !== 'lobby') throw err(404, '지하철 레이스 대기실이 없어요');
    if (g.host !== userId) throw err(403, '연 사람이 정해요');
    g.route = { ...pickRoute(this.rand), random: true };
    return g;
  }
  // What I typed must be the next stop on the way (a change of line needs nothing typed).
  ride(g, userId, typed) {
    const me = g.players.findIndex((p) => p.id === userId);
    if (me < 0) throw err(403, '참가한 사람만 탈 수 있어요');
    const r = g.riders[me];
    if (r.done != null) throw err(409, '벌써 도착했어요');
    if (this.now() < g.t0) throw err(409, '아직 출발 전이에요');
    const step = g.route.steps[r.pos];
    if (norm(typed) !== norm(step.name)) { r.miss += 1; throw err(400, `땡! 다음은 「${step.name}」`); }
    r.pos += 1;
    if (r.pos >= g.route.steps.length) {
      r.done = this.now() - g.t0;
      if (g.riders.every((x) => x.done != null)) this.raceEnd(g);
    }
    return g;
  }
  // The board: arrived first by time, then the rest by how far along they are.
  raceBoard(g) {
    return g.riders.map((r, i) => ({ i, id: g.players[i].id, name: g.players[i].name, pos: r.pos, done: r.done, miss: r.miss }))
      .sort((a, b) => (a.done ?? Infinity) - (b.done ?? Infinity) || b.pos - a.pos);
  }
  raceEnd(g) {
    const board = this.raceBoard(g), n = g.route.steps.length;
    const medal = ['🥇', '🥈', '🥉'];
    const line = board.map((p, k) => (p.done != null ? `${medal[k] || `${k + 1}등`} ${p.name} ${(p.done / 1000).toFixed(1)}초` : `${p.name} 미도착(${p.pos}/${n})`)).join(' · ');
    return this.finish(g, `🚇 ${g.route.from} → ${g.route.to}: ${line}`, null, board[0].done != null ? board[0].i : null);
  }

  // ---- 🕵️ liar ----
  // First the table votes the category; the word in it is drawn after, so the liar's vote
  // gives nothing away.
  voteTopic(g, userId, category) {
    if (g.step !== 'topic') throw err(409, '지금은 주제 투표 시간이 아니에요');
    const me = g.players.findIndex((p) => p.id === userId);
    if (me < 0) throw err(403, '참가한 사람만 투표해요');
    if (!LIAR_WORDS[category]) throw err(400, '없는 주제예요');
    g.topicVotes[me] = category;
    if (Object.keys(g.topicVotes).length === g.players.length) this.settleTopic(g);
    return g;
  }
  // The most voted category; a tie is drawn among the top ones, no votes among all.
  settleTopic(g) {
    const counts = LIAR_TOPICS.map((c) => Object.values(g.topicVotes).filter((v) => v === c).length);
    const top = Math.max(...counts);
    const pool = LIAR_TOPICS.filter((_, i) => counts[i] === top);
    Object.assign(g, this.pickLiarWord(pool[Math.floor(this.rand() * pool.length)]), { step: 'hint', turn: 0, ends: this.now() + HINT_MS });
    return g;
  }
  hint(g, userId, text) {
    if (g.step !== 'hint' || g.players[g.turn].id !== userId) throw err(409, '내 차례가 아니에요');
    const t = String(text || '').trim().slice(0, 30);
    if (!t) throw err(400, '한 줄로 설명해 주세요');
    // The word itself gives the game away; 🤪's liar keeps the same rule for their own word.
    const told = g.turn !== g.liar ? g.word : g.kind === 'fool' ? g.decoy : null;
    if (told && t.replace(/\s/g, '').includes(told.replace(/\s/g, ''))) throw err(400, '제시어를 그대로 말하면 안 돼요');
    return this.nextHint(g, t);
  }
  nextHint(g, text) {
    g.hints.push({ by: g.turn, text });
    if (g.hints.length >= g.players.length * LIAR_ROUNDS) Object.assign(g, { step: 'vote', turn: null, ends: this.now() + VOTE_MS });
    else Object.assign(g, { turn: (g.turn + 1) % g.players.length, ends: this.now() + HINT_MS });
    return g;
  }
  vote(g, userId, to) {
    if (g.step !== 'vote') throw err(409, '지금은 투표 시간이 아니에요');
    const me = g.players.findIndex((p) => p.id === userId);
    if (me < 0) throw err(403, '참가한 사람만 투표해요');
    const i = Number.isInteger(to) ? to : g.players.findIndex((p) => p.id === to);
    if (!(i >= 0 && i < g.players.length) || i === me) throw err(400, '라이어라고 생각하는 사람을 골라 주세요');
    g.votes[me] = i;
    if (Object.keys(g.votes).length === g.players.length) this.count(g);
    return g;
  }
  // The most votes, alone at the top, is the one accused; a tie or no votes lets the liar go.
  count(g) {
    const tally = g.players.map((_, i) => Object.values(g.votes).filter((v) => v === i).length);
    g.tally = tally;
    const top = Math.max(...tally);
    const accused = top > 0 && tally.filter((n) => n === top).length === 1 ? tally.indexOf(top) : null;
    const liar = g.players[g.liar].name;
    if (accused === null) return this.finish(g, `🕵️ 표가 갈려서 라이어 ${liar} 님이 빠져나갔어요! 라이어 승`, null, g.liar);
    if (accused !== g.liar) return this.finish(g, `🕵️ ${g.players[accused].name} 님은 라이어가 아니었어요… 라이어 ${liar} 님 승!`, accused, g.liar);
    Object.assign(g, { step: 'guess', turn: g.liar, ends: this.now() + GUESS_MS });
    return g;
  }
  guess(g, userId, text) {
    if (g.step !== 'guess' || g.players[g.liar].id !== userId) throw err(409, '라이어만 맞힐 수 있어요');
    const t = String(text || '').trim();
    if (!t) throw err(400, '제시어를 적어 주세요');
    return this.liarGuessed(g, t);
  }
  liarGuessed(g, t) {
    const liar = g.players[g.liar].name;
    g.liarGuess = t;
    if (sameWord(t, g.word)) return this.finish(g, `🕵️ 라이어 ${liar} 님이 잡혔지만 제시어 「${g.word}」 를 맞혀서 역전승!`, null, g.liar);
    return this.finish(g, `🕵️ 라이어 ${liar} 님을 잡았어요! ${t ? `(「${t}」 땡!) ` : ''}시민 승`, g.liar);
  }
  liarTimeUp(g) {
    if (g.step === 'topic') return this.settleTopic(g);
    if (g.step === 'hint') return this.nextHint(g, null);
    if (g.step === 'vote') return this.count(g);
    return this.liarGuessed(g, '');
  }

  // ---- 🏗 stack ----
  // The sliding block runs back and forth over the floor, faster on each storey.
  stackTurn(g) {
    const level = g.blocks.length - 1;
    Object.assign(g, { t0: this.now(), speed: 320 + level * 28, ends: this.now() + STACK_TURN_MS });
  }
  slide(g, at) {
    const w = g.blocks.at(-1).w, span = STACK_W - w;
    const d = ((at - g.t0) / 1000) * g.speed % (2 * span);
    return d <= span ? d : 2 * span - d;
  }
  // x: where the block was on the dropper's screen when they let go.
  drop(g, x) {
    const top = g.blocks.at(-1);
    x = Math.max(0, Math.min(STACK_W - top.w, Math.round(Number(x) || 0)));
    if (Math.abs(x - top.x) <= PERFECT) x = top.x;
    const left = Math.max(x, top.x), right = Math.min(x + top.w, top.x + top.w);
    g.last = { x, w: top.w, perfect: x === top.x, by: g.turn };
    if (right - left <= 0) return this.finish(g, `${g.players[g.turn].name} 님이 무너뜨렸어요 😱`, g.turn);
    g.blocks.push({ x: left, w: right - left, by: g.turn });
    g.turn = (g.turn + 1) % g.players.length;
    this.stackTurn(g);
    return g;
  }

  // ---- 💣 bomb ----
  toss(g, userId, to) {
    if (g.players[g.turn].id !== userId) throw err(409, '폭탄을 든 사람만 던질 수 있어요');
    if (this.now() - g.held < HOLD_MS) throw err(409, '받자마자 던질 수는 없어요 (1초)');
    // to: a player's place at the table (pages see names in order), or their id.
    const i = Number.isInteger(to) ? to : g.players.findIndex((p) => p.id === to);
    if (!(i >= 0 && i < g.players.length) || i === g.turn) throw err(400, '던질 사람을 골라 주세요');
    Object.assign(g, { turn: i, held: this.now(), throws: g.throws + 1 });
    return g;
  }
  boom(g) { return this.finish(g, `💥 ${g.players[g.turn].name} 님 손에서 터졌어요!`, g.turn); }

  // ---- 🔤 words ----
  say(g, userId, word) {
    if (g.players[g.turn].id !== userId) throw err(409, '내 차례가 아니에요');
    const w = String(word || '').trim();
    if (!/^[가-힣]{2,10}$/.test(w)) throw err(400, '한글 두 글자 이상이에요');
    // The last word said (an "out" line in between has none).
    const last = g.words.filter((x) => x.word).at(-1).word.at(-1);
    if (!startsFor(last).has(w[0])) throw err(400, `「${[...startsFor(last)].join(' / ')}」 로 시작해야 해요`);
    if (g.words.some((x) => x.word === w)) throw err(409, '이미 나온 단어예요');
    g.words.push({ word: w, by: g.turn });
    this.nextAlive(g);
    return g;
  }
  out(g, why) {
    g.alive[g.turn] = false;
    g.words.push({ word: null, by: g.turn, why });
    if (g.alive.filter(Boolean).length <= 1) {
      const win = g.alive.indexOf(true);
      return this.finish(g, `🏆 ${g.players[win].name} 님이 끝까지 살아남았어요! (${g.words.filter((x) => x.word).length - 1}단어)`, null, win);
    }
    this.nextAlive(g);
    return g;
  }
  nextAlive(g) {
    do g.turn = (g.turn + 1) % g.players.length; while (!g.alive[g.turn]);
    g.ends = this.now() + WORD_MS;
  }

  act(floor, userId, op, arg) {
    const g = this.get(floor);
    if (!g || g.phase !== 'play') throw err(404, '진행 중인 놀이가 없어요');
    if (g.kind === 'stack' && op === 'drop') {
      if (g.players[g.turn].id !== userId) throw err(409, '내 차례가 아니에요');
      return this.drop(g, arg);
    }
    if (g.kind === 'bomb' && op === 'toss') return this.toss(g, userId, arg);
    if (g.kind === 'words' && op === 'say') return this.say(g, userId, arg);
    // One box to type in on the pages: a hint while hinting, the word when guessing.
    if (isLiar(g) && op === 'say') return g.step === 'guess' ? this.guess(g, userId, arg) : this.hint(g, userId, arg);
    if (isLiar(g) && op === 'vote') return this.vote(g, userId, arg);
    if (isLiar(g) && op === 'topic') return this.voteTopic(g, userId, arg);
    if (g.kind === 'subway' && op === 'say') return this.ride(g, userId, arg);
    throw err(400, '할 수 없는 동작이에요');
  }

  finish(g, how, loser = null, winner = null) {
    Object.assign(g, { phase: 'done', how, loser, winner, at: this.now() });
    if (g.kind === 'stack') {
      g.height = g.blocks.length - 1;
      g.record = !g.stopped && g.height > (this.records[g.floor] || 0);
      if (g.record) this.records[g.floor] = g.height;
    }
    this.onEnd(g);
    return g;
  }

  view(floor, userId) {
    const g = this.get(floor);
    if (!g) return null;
    const me = g.players.findIndex((p) => p.id === userId);
    const v = { id: g.id, floor: g.floor, kind: g.kind, title: KINDS[g.kind], phase: g.phase, host: g.host === userId, joined: me >= 0,
      players: g.players.map((p) => p.name), me, turn: g.turn ?? null, myTurn: g.phase === 'play' && me >= 0 && g.turn === me };
    if (g.phase === 'lobby') return { ...v, best: this.records[g.floor] || 0, ...(g.kind === 'subway' && g.route ? { route: { from: g.route.from, to: g.route.to, random: !!g.route.random, count: g.route.steps.length } } : {}) };
    if (g.phase === 'done') Object.assign(v, { how: g.how, loser: g.loser, winner: g.winner });
    if (g.kind === 'stack') {
      Object.assign(v, { blocks: g.blocks, best: this.records[g.floor] || 0, height: g.blocks.length - 1, last: g.last || null, record: !!g.record });
      if (g.phase === 'play') Object.assign(v, { slide: { w: g.blocks.at(-1).w, speed: g.speed, elapsed: this.now() - g.t0 }, timeLeft: g.ends - this.now() });
    }
    if (g.kind === 'bomb') {
      Object.assign(v, { throws: g.throws });
      if (g.phase === 'play') {
        // How hot it is, never how long is left: calm, then warm, then hot.
        const left = (g.fuse - this.now()) / (g.fuse - g.lit);
        Object.assign(v, { heat: left > 0.5 ? 1 : left > 0.25 ? 2 : 3, canToss: this.now() - g.held >= HOLD_MS });
      }
    }
    if (g.kind === 'words') {
      Object.assign(v, { words: g.words.slice(-10).map((x) => ({ word: x.word, by: g.players[x.by]?.name || null, why: x.why || null })), alive: g.alive });
      if (g.phase === 'play') Object.assign(v, { starts: [...startsFor(g.words.filter((x) => x.word).at(-1).word.at(-1))], timeLeft: g.ends - this.now() });
    }
    if (g.kind === 'subway') {
      const r = me >= 0 && g.riders ? g.riders[me] : null;
      Object.assign(v, { route: g.route ? { from: g.route.from, to: g.route.to, random: !!g.route.random, steps: g.route.steps.map((x) => ({ ...x, color: lineColor(x.line) })) } : null });
      if (g.riders) Object.assign(v, { elapsed: this.now() - g.t0, board: this.raceBoard(g).map(({ i, ...p }) => ({ ...p, me: i === me })), ride: r ? { pos: r.pos, done: r.done, miss: r.miss } : null });
      if (g.phase === 'play') Object.assign(v, { timeLeft: g.ends - this.now(), startsIn: Math.max(0, g.t0 - this.now()) });
      v.myTurn = g.phase === 'play' && !!r && r.done == null;
    }
    if (isLiar(g)) {
      // What I was told: the word, or (the liar) only that — in 🤪 the liar's own other word.
      const told = me < 0 ? null : me !== g.liar ? g.word : g.kind === 'fool' ? g.decoy : null;
      Object.assign(v, { category: g.category, word: told, iAmLiar: me === g.liar && g.kind === 'liar', step: g.step,
        round: Math.min(LIAR_ROUNDS, Math.floor(g.hints.length / g.players.length) + 1), rounds: LIAR_ROUNDS,
        hints: g.hints.map((h) => ({ by: g.players[h.by].name, text: h.text })),
        voted: Object.keys(g.votes).length, myVote: me >= 0 ? g.votes[me] ?? null : null });
      if (g.phase === 'play') {
        v.timeLeft = g.ends - this.now();
        if (g.step === 'vote') v.myTurn = me >= 0 && g.votes[me] === undefined;
        if (g.step === 'topic') {
          Object.assign(v, { topics: LIAR_TOPICS.map((name) => ({ name, votes: Object.values(g.topicVotes).filter((c) => c === name).length })),
            voted: Object.keys(g.topicVotes).length, myTopic: me >= 0 ? g.topicVotes[me] ?? null : null, category: null, word: null, iAmLiar: false });
          v.myTurn = me >= 0 && g.topicVotes[me] === undefined;
        }
      } else Object.assign(v, { word: g.word, decoy: g.kind === 'fool' ? g.decoy : null, liar: g.players[g.liar].name, tally: g.tally || null, liarGuess: g.liarGuess ?? null });
    }
    return v;
  }
}
