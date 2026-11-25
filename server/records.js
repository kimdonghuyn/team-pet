// 🏆 기록 도전: games played alone in a few seconds, each person's best kept per floor, and
// the floor's top three shown. The page or pet measures; the hub only keeps the numbers and
// drops ones no person could make (a reaction under 100 ms is a guess, not a reaction).
//   react — ⚡ 반응속도: ms from green to the click, less is better.
//   order — 🔢 1→25 누르기: ms to press 1 to 25 in order, less is better.
//   ten   — ⏱ 딱 10초: ms off from ten seconds, counted in one's head; less is better.
export const RECORD_GAMES = {
  react: { title: '⚡ 반응속도', min: 100, max: 3_000 },
  order: { title: '🔢 1→25 누르기', min: 3_000, max: 300_000 },
  ten: { title: '⏱ 딱 10초', min: 0, max: 10_000 },
};
const TOP = 3;

const err = (status, message) => Object.assign(new Error(message), { status });

// How a number reads on the board.
export function shown(game, ms) {
  if (game === 'react') return `${ms}ms`;
  if (game === 'order') return `${(ms / 1000).toFixed(2)}초`;
  return `${(ms / 1000).toFixed(2)}초 차이`;
}

export class Records {
  // best: { [floor]: { [game]: { [userId]: { name, ms, at } } } }
  // 🏷 A floor renamed: its board follows the name.
  renameFloor(from, to) { if (this.best[from]) { this.best[to] = this.best[from]; delete this.best[from]; } }
  constructor({ now = () => Date.now(), best = {} } = {}) {
    Object.assign(this, { now, best: JSON.parse(JSON.stringify(best || {})) });
  }

  top(floor, game) {
    return Object.entries(this.best[floor]?.[game] || {})
      .map(([id, r]) => ({ id, name: r.name, ms: r.ms, at: r.at }))
      .sort((a, b) => a.ms - b.ms || a.at - b.at)
      .slice(0, TOP);
  }

  // The floor's top three of each game, and my own best.
  board(floor, userId) {
    return Object.fromEntries(Object.keys(RECORD_GAMES).map((game) => [game, {
      title: RECORD_GAMES[game].title,
      top: this.top(floor, game).map((r) => ({ name: r.name, ms: r.ms, text: shown(game, r.ms), me: r.id === userId })),
      mine: this.best[floor]?.[game]?.[userId]?.ms ?? null,
    }]));
  }

  // One finished try. best: it beat my own best; first: it took first place from someone
  // (who held it, and with what), or was the very first record on the board.
  submit(floor, who, game, ms) {
    const g = RECORD_GAMES[game];
    if (!g) throw err(400, '없는 기록 도전입니다');
    ms = Math.round(Number(ms));
    if (!Number.isFinite(ms) || ms < g.min || ms > g.max) throw err(400, '기록으로 남길 수 없는 값이에요');
    const games = ((this.best[floor] ||= {})[game] ||= {});
    const before = this.top(floor, game)[0] || null;
    const mine = games[who.id];
    const best = !mine || ms < mine.ms;
    if (best) games[who.id] = { name: who.name, ms, at: this.now() };
    else games[who.id].name = who.name;
    const now = this.top(floor, game)[0];
    const first = best && now.id === who.id && (!before || before.id !== who.id || before.ms !== ms)
      ? { from: before && before.id !== who.id ? { name: before.name, text: shown(game, before.ms) } : null } : null;
    const rank = this.top(floor, game).findIndex((r) => r.id === who.id) + 1 || null;
    return { ms, text: shown(game, ms), best, rank, first };
  }
}
