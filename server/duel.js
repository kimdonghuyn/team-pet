// 1:1 games between two people on a floor (⚔️ 대결): a quick-draw duel, Russian
// roulette and rock-paper-scissors. The hub holds every game and decides it (where the
// bullet is, when "쏴!" comes), so neither side can cheat; each person sees only their
// own view of it (view). Kept in memory, gone a little after it ends.

export const GAMES = { quickdraw: '🤠 결투', roulette: '🔫 러시안 룰렛', rps: '✊ 가위바위보' };
const INVITE_MS = 30_000;   // an invite nobody answers expires
const SHOWN_MS = 12_000;    // a finished (or declined) game stays this long, for both to see
const IDLE_MS = 3 * 60_000; // a game nobody moves in is dropped
const DRAW_WAIT_MS = 5_000; // after "쏴!", how long a shot may take
const CHAMBERS = 6;
const RPS = { r: '✊', p: '✋', s: '✌️' };
const BEATS = { r: 's', p: 'r', s: 'p' };

const err = (status, message) => Object.assign(new Error(message), { status });
const other = (side) => (side === 'a' ? 'b' : 'a');

export class Duels {
  constructor({ now = () => Date.now(), rand = Math.random, onEnd = () => {} } = {}) {
    Object.assign(this, { now, rand, onEnd, games: new Map(), seq: 0 });
  }

  // Drops what has expired and settles a duel whose shots time out.
  sweep() {
    const now = this.now();
    for (const [id, d] of this.games) {
      if (d.phase === 'invite' && now - d.at > INVITE_MS) this.finish(d, 'expired');
      else if (d.phase === 'play' && d.game === 'quickdraw' && now > d.goAt + DRAW_WAIT_MS) this.settleDraw(d, true);
      else if (d.phase === 'play' && now - d.at > IDLE_MS) this.finish(d, 'expired');
      else if (d.phase !== 'invite' && d.phase !== 'play' && now - d.at > SHOWN_MS) this.games.delete(id);
    }
  }

  // The game a person is in (or invited to), if any.
  of(userId) {
    this.sweep();
    return [...this.games.values()].find((d) => d.a.id === userId || d.b.id === userId) || null;
  }

  invite(from, to, game) {
    if (!GAMES[game]) throw err(400, '없는 게임입니다');
    if (!to?.id || to.id === from.id) throw err(400, '대결할 사람을 골라 주세요');
    const busy = (id) => { const d = this.of(id); return d && (d.phase === 'invite' || d.phase === 'play'); };
    if (busy(from.id)) throw err(409, '이미 대결 중이에요');
    if (busy(to.id)) throw err(409, `${to.name} 님은 지금 다른 대결 중이에요`);
    for (const id of [from.id, to.id]) { const d = this.of(id); if (d) this.games.delete(d.id); }
    const d = { id: ++this.seq, game, floor: from.floor, a: { id: from.id, name: from.name }, b: { id: to.id, name: to.name }, phase: 'invite', at: this.now() };
    this.games.set(d.id, d);
    return d;
  }

  sideOf(d, userId) {
    return d.a.id === userId ? 'a' : d.b.id === userId ? 'b' : null;
  }

  answer(userId, id, yes) {
    const d = this.games.get(Number(id));
    if (!d || d.phase !== 'invite' || d.b.id !== userId) throw err(404, '받은 대결 신청이 없습니다');
    if (!yes) return this.finish(d, 'declined');
    d.phase = 'play';
    d.at = this.now();
    if (d.game === 'quickdraw') Object.assign(d, { goAt: this.now() + 4000 + Math.floor(this.rand() * 3000), shots: { a: null, b: null } });
    if (d.game === 'roulette') Object.assign(d, { bullet: Math.floor(this.rand() * CHAMBERS), pos: 0, turn: this.rand() < 0.5 ? 'a' : 'b', passes: { a: 1, b: 1 } });
    if (d.game === 'rps') Object.assign(d, { picks: { a: null, b: null }, score: { a: 0, b: 0 }, rounds: [] });
    return d;
  }

  // Leaving: an invite is withdrawn; a game under way is lost.
  leave(userId, id) {
    const d = this.games.get(Number(id));
    const side = d && this.sideOf(d, userId);
    if (!side) return null;
    if (d.phase === 'invite') return this.finish(d, 'cancelled');
    if (d.phase === 'play') return this.finish(d, 'done', other(side), `${d[side].name} 님이 나갔어요`);
    this.games.delete(d.id);
    return null;
  }

  // move: quickdraw { ms } (the shot's reaction time, measured on the shooter's screen)
  // or { early: true }; roulette 'pull' | 'pass'; rps 'r' | 'p' | 's'.
  move(userId, id, move) {
    const d = this.games.get(Number(id));
    const side = d && this.sideOf(d, userId);
    if (!side || d.phase !== 'play') throw err(404, '진행 중인 대결이 없습니다');
    d.at = this.now();
    if (d.game === 'quickdraw') {
      if (d.shots[side]) return d;
      d.shots[side] = move?.early ? { early: true } : { ms: Math.max(0, Math.min(DRAW_WAIT_MS, Math.round(Number(move?.ms) || DRAW_WAIT_MS))) };
      return this.settleDraw(d, false);
    }
    if (d.game === 'roulette') {
      if (d.turn !== side) throw err(409, '내 차례가 아니에요');
      if (move === 'pass') {
        if (d.passes[side] < 1) throw err(409, '넘기기를 이미 썼어요');
        d.passes[side] -= 1;
        d.turn = other(side);
        return d;
      }
      if (move !== 'pull') throw err(400, '당기기 또는 넘기기');
      if (d.pos === d.bullet) return this.finish(d, 'done', other(side), `💥 ${d[side].name} 님이 꽝을 뽑았어요`);
      d.pos += 1;
      d.turn = other(side);
      return d;
    }
    if (!RPS[move]) throw err(400, '✊ ✋ ✌️ 중 하나');
    if (d.picks[side]) throw err(409, '이미 냈어요');
    d.picks[side] = move;
    if (d.picks.a && d.picks.b) {
      const { a, b } = d.picks;
      const win = a === b ? null : BEATS[a] === b ? 'a' : 'b';
      if (win) d.score[win] += 1;
      d.rounds.push({ a, b, win });
      d.picks = { a: null, b: null };
      if (d.score[win] === 2) return this.finish(d, 'done', win, `${RPS[d.rounds.at(-1)[win]]} ${d.score.a}:${d.score.b}`);
    }
    return d;
  }

  // Both shot, or the time ran out: the faster valid shot wins; a shot before "쏴!" loses.
  settleDraw(d, timeUp) {
    const { a, b } = d.shots;
    if (!timeUp && !(a && b)) return d;
    const ok = (s) => s && !s.early;
    let win = null;
    if (ok(a) && ok(b)) win = a.ms === b.ms ? null : a.ms < b.ms ? 'a' : 'b';
    else if (ok(a)) win = 'a';
    else if (ok(b)) win = 'b';
    const shown = (s) => (!s ? '안 쏨' : s.early ? '반칙' : `${s.ms}ms`);
    return this.finish(d, 'done', win, `${d.a.name} ${shown(a)} · ${d.b.name} ${shown(b)}`);
  }

  finish(d, phase, win = null, how = '') {
    Object.assign(d, { phase, win, how, at: this.now() });
    if (phase === 'done') this.onEnd(d);
    return d;
  }

  // What one side sees: never the bullet, and "쏴!" as time from now.
  view(userId) {
    const d = this.of(userId);
    if (!d) return null;
    const me = this.sideOf(d, userId);
    const foe = other(me);
    const v = {
      id: d.id, game: d.game, title: GAMES[d.game], floor: d.floor, phase: d.phase, invited: me === 'b',
      me: d[me].name, foe: { id: d[foe].id, name: d[foe].name },
      result: d.phase === 'done' ? (d.win === me ? 'win' : d.win === foe ? 'lose' : 'draw') : null, how: d.how || '',
    };
    if (d.phase !== 'play' && d.phase !== 'done') return v;
    if (d.game === 'quickdraw') {
      v.goIn = d.goAt - this.now();
      v.shot = !!d.shots[me];
    }
    if (d.game === 'roulette') {
      Object.assign(v, { chambers: CHAMBERS, pos: d.pos, myTurn: d.turn === me, passes: d.passes[me], foePasses: d.passes[foe] });
      if (d.phase === 'done') v.bullet = d.bullet;
    }
    if (d.game === 'rps') {
      Object.assign(v, { score: [d.score[me], d.score[foe]], picked: !!d.picks[me], foePicked: !!d.picks[foe],
        rounds: d.rounds.map((r) => ({ me: RPS[r[me]], foe: RPS[r[foe]], win: r.win === me ? 'me' : r.win === foe ? 'foe' : 'draw' })) });
    }
    return v;
  }
}
