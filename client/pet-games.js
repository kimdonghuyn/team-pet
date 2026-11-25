// ⚔️ 대결 · 🎨 이어 그리기 · 🖍 캐치마인드 · 🎲 같이 하기 · 🏆 기록 도전, the same as the Windows
// pet's (server/pet.ps1, "⚔️ 대결" to "🏆 기록 도전"). The hub decides every game (server/duel.js,
// relay.js, party.js, records.js); each poll hands this file my view of mine (Mod.games.duel /
// relay / party), the panels in pet.html are drawn from those views, and their buttons ask the
// hub. Everything here stays inside this file: pet.js gives the helpers ($, el, btn, ask, anim,
// after, pop, say, to, flinch…) and the right-click menu takes menu() and menuFor().
(() => {
  // What the Windows pet keeps in $S for the games.
  const G = {
    duel: null, duelSig: '', drawId: null, fired: false, watch: 0, gunFlip: 1,
    relay: null, relaySig: '', relayHidden: null, relayEnds: null, relayTitle: '', stopSure: 0, catchSheet: '',
    inkOn: false, inkColor: '#000', stroke: null,
    relayReplay: 0,
    party: null, partySig: '', partyHidden: null, partyTitle: '', slider: null, partyClock: 0, slideClock: 0, slideKey: '', slideBase: 0, raf: 0,
    towerFall: null, towerKey: '', barTop: null, partyErr: '', partyErrAt: 0, wordOn: false, wordWait: false,
    subPos: new Map(), subMine: null, subFocus: '',
    recGame: 'react', recBoard: null, recTry: 0, recFloor: null, recMode: null, recGo: false, recNext: 1, recClock: 0,
  };
  // The panels' parts (pet.html), once.
  const U = {
    duel: $('#duel'), duelTitle: $('#duel-title'), duelStage: $('#duel-stage'), duelText: $('#duel-text'), duelButtons: $('#duel-buttons'),
    relay: $('#relay'), relayTitle: $('#relay-title'), relayStop: $('#relay-stop'), relayText: $('#relay-text'), sheet: $('#relay-sheet'),
    past: $('#relay-past'), ink: $('#relay-ink'), guess: $('#relay-guess'), relayButtons: $('#relay-buttons'),
    party: $('#party'), partyTitle: $('#party-title'), partyStop: $('#party-stop'), tower: $('#party-tower'), stack: $('#party-stack'),
    partyStage: $('#party-stage'), partyText: $('#party-text'), word: $('#party-word'), partyButtons: $('#party-buttons'),
    record: $('#record'), recordTitle: $('#record-title'), pick: $('#record-pick'), pad: $('#record-pad'), padText: $('#record-pad-text'),
    grid: $('#record-grid'), recordText: $('#record-text'), recordTop: $('#record-top'), recordButtons: $('#record-buttons'),
  };
  U.pastCtx = U.past.getContext('2d'); U.inkCtx = U.ink.getContext('2d');
  // What the newer games put in the panels (kept here, next to the code that draws them).
  const css = el('style');
  css.textContent = [
    // 🏗 the falling block, the squashed top and the cut-off piece (Tower-Fall).
    '.game-brick.game-fall { z-index: 2; }',
    // 🚇 the way as a map in the tower's place (Subway-Map): lines and stations, names, pets.
    '#party-tower.game-map { cursor: default; }',
    '.game-map-svg { position: absolute; left: 0; top: 0; overflow: visible; }',
    '.game-map-text { position: absolute; transform: translateX(-50%); white-space: nowrap; line-height: 1.25; font-family: "Malgun Gothic", sans-serif; pointer-events: none; }',
    '.game-map-pet { position: absolute; pointer-events: none; }',
    '.game-map-pet .sprite { display: block; }',
    '.game-map-pet.mine .sprite { filter: drop-shadow(0 0 2px #FFD700) drop-shadow(0 0 2px #FFD700); }',
  ].join('\n');
  document.head.append(css);
  // A panel comes up with a small hop when it was hidden, the way the Windows ones do.
  const show = (panel) => { if (panel.hidden) { panel.hidden = false; pop(panel, 0, 10); } };
  // A button for a panel: body is what to ask the hub, or a function to run instead.
  const action = (doer, body) => (typeof body === 'function' ? body : () => doer(body));

  // ── ⚔️ 대결 (server/duel.js decides everything) ──
  // An invite pops up over my pet and the game is played right here. The quick draw counts my
  // reaction from the moment "쏴!" shows on my own screen; the hub said when that is (goIn), the
  // same moment for both of us.
  async function duelDo(body) {
    const r = await ask('api/duel', { floor: G.duel ? G.duel.floor : to(), ...body });
    if (r.error) { U.duel.hidden = false; U.duelText.textContent = `⚠ ${r.error}`; G.duelSig = ''; } else showDuel(r.duel);
  }
  function duelButton(text, body, hot = false) { U.duelButtons.append(btn(text, action(duelDo, body), hot ? '#F59E0B' : '')); }
  function stageText(text, size = 14, color = '#F1EEFC') {
    const t = el('div', 'game-stage'); t.textContent = text; t.style.fontSize = `${size}px`; t.style.color = color;
    U.duelStage.append(t);
    return t;
  }
  // "쏴!": shown at the moment the hub picked; my reaction is timed from here.
  function fireDraw() {
    if (!G.duel || G.duel.id !== G.drawId || G.duel.shot) return;
    G.fired = true; G.watch = performance.now();
    U.duelText.textContent = '🔫 쏴!!!'; U.duelText.style.fontSize = '26px'; U.duelText.style.color = '#FF6B6B';
  }
  function shoot() {
    const move = G.fired ? { ms: Math.floor(performance.now() - G.watch) } : { early: true };
    duelDo({ op: 'move', id: G.duel.id, move });
  }
  function showDuel(v) {
    if (!v) { U.duel.hidden = true; G.duel = null; G.duelSig = ''; return; }
    const first = U.duel.hidden;
    G.duel = v;
    const sig = [v.id, v.phase, v.pos, v.myTurn, (v.score || []).join(':'), v.picked, v.foePicked, v.result, (v.rounds || []).length, v.shot, v.passes].join('|');
    if (sig === G.duelSig) return;
    G.duelSig = sig;
    U.duel.hidden = false; if (first) pop(U.duel, 0, 10);
    U.duelTitle.textContent = `⚔️ ${v.title} · ${v.foe.name} 님과`;
    U.duelStage.replaceChildren(); U.duelButtons.replaceChildren();
    U.duelText.style.fontSize = '14px'; U.duelText.style.color = '#fff';
    const id = v.id, foe = v.foe.name, text = U.duelText;
    if (v.phase === 'invite') {
      if (v.invited) {
        text.textContent = `${foe} 님이 대결을 신청했어요!`;
        duelButton('수락', { op: 'accept', id }, true); duelButton('거절', { op: 'decline', id });
      } else { text.textContent = `${foe} 님의 대답을 기다리는 중…`; duelButton('취소', { op: 'leave', id }); }
      return;
    }
    if (v.phase !== 'play' && v.phase !== 'done') {
      text.textContent = v.phase === 'declined' ? (v.invited ? '거절했어요' : `${foe} 님이 거절했어요`) : '대결이 취소됐어요';
      duelButton('닫기', { op: 'leave', id }); return;
    }
    if (v.game === 'quickdraw') {
      stageText(foe, 12); stageText('🤠    🤠', 22); stageText('나', 12);
      if (v.phase === 'play') {
        if (v.shot) text.textContent = '쐈어요! 결과를 기다리는 중…';
        else {
          if (G.drawId !== id) { G.drawId = id; G.fired = false; after(Math.max(0, Math.round(v.goIn) || 0), fireDraw); }
          if (G.fired) fireDraw(); else text.textContent = '준비… "쏴!" 가 뜨면 바로 누르세요 (먼저 누르면 반칙패)';
          duelButton('🔫 쏘기', shoot, true);
        }
      }
    }
    if (v.game === 'roulette') {
      // The gun turns its muzzle to whoever pulls next: the other one on the left, me on the right.
      stageText(foe, 12);
      const gun = stageText('🔫', 26), dir = v.myTurn ? -1 : 1;
      anim(gun, { transform: [`scaleX(${G.gunFlip})`, `scaleX(${dir})`] }, 350); G.gunFlip = dir;
      stageText('나', 12);
      const cyl = Array.from({ length: v.chambers }, (_, i) => (v.phase === 'done' && i === v.bullet ? '💥' : i < v.pos ? '○' : i === v.pos ? '◉' : '●')).join(' ');
      if (v.phase === 'play') {
        if (v.myTurn) {
          text.textContent = `${cyl}\n내 차례! 방아쇠를 당길까요?`;
          duelButton('🔫 당기기', { op: 'move', id, move: 'pull' }, true);
          if (v.passes > 0) duelButton(`넘기기 (${v.passes})`, { op: 'move', id, move: 'pass' });
        } else text.textContent = `${cyl}\n${foe} 님 차례… 두근두근`;
      } else text.textContent = cyl;
    }
    if (v.game === 'rps') {
      const score = v.score || [0, 0];
      stageText(`나 ${score[0]} : ${score[1]} ${foe}`, 16, '#FCD34D');
      const last = (v.rounds || []).at(-1);
      const said = last ? `나 ${last.me} vs ${last.foe} ${foe} → ${{ me: '이겼어요', foe: '졌어요', draw: '비겼어요' }[last.win]}\n` : '';
      if (v.phase === 'play') {
        if (v.picked) text.textContent = `${said}${foe} 님이 낼 때까지 기다리는 중…`;
        else {
          text.textContent = `${said}세 판 중 두 판 먼저! 하나 고르세요`;
          duelButton('✊', { op: 'move', id, move: 'r' }); duelButton('✋', { op: 'move', id, move: 'p' }); duelButton('✌️', { op: 'move', id, move: 's' });
        }
      } else text.textContent = said.trimEnd();
    }
    if (v.phase === 'done') {
      const res = { win: ['🏆 이겼어요!', '#FCD34D'], lose: ['😵 졌어요…', '#FF8A8A'], draw: ['🤝 비겼어요', '#C4B5FD'] }[v.result];
      text.textContent = `${text.textContent}\n${res[0]}\n${v.how}`.trim(); text.style.color = res[1];
      if (v.result === 'lose') flinch();
      duelButton('닫기', { op: 'leave', id });
    }
  }

  // ── 🎨 이어 그리기 (server/relay.js keeps the turns and the time) ──
  // My turn to draw: the picture so far lies under a sheet I draw on in my colour, and each line
  // goes to the hub as I lift the pen. The last one types the answer. At the end the picture
  // draws itself again, line by line.
  async function relayDo(body) {
    const r = await ask('api/relay', { floor: G.relay ? G.relay.floor : to(), ...body });
    if (r.error) { U.relay.hidden = false; U.relayText.textContent = `⚠ ${r.error}`; G.relaySig = ''; }
    else if (body.op !== 'stroke') { G.relayHidden = null; showRelay(r.relay); }
  }
  function relayButton(text, body, hot = false) { U.relayButtons.append(btn(text, action(relayDo, body), hot ? '#2A9D8F' : '')); }
  // Stopping a game stops it for everyone at the table, so it takes a second press within 3 s.
  // The asking lives in G.stopSure, not on the button: the panel is drawn again with each new
  // line or guess, and that must not undo it.
  function stopLook(b) {
    const sure = Date.now() < G.stopSure;
    b.textContent = sure ? '끝낼까요? ✕' : '✕';
    b.style.background = sure ? '#C0392B' : '#3B355A';
  }
  function stopButton(slot, send) {
    const b = btn('', () => {
      if (Date.now() < G.stopSure) { G.stopSure = 0; send(); return; }
      G.stopSure = Date.now() + 3000; stopLook(b);
      after(3050, stopLook, b);
    });
    b.classList.add('game-stop'); b.title = '그만하기 — 모두에게서 끝나요';
    stopLook(b);
    slot.replaceChildren(b);
  }
  // A line on the 220 px sheet from the hub's 0..1000 square.
  function drawLine(points, color, w) {
    const c = U.pastCtx;
    c.strokeStyle = color; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(p[0] * 0.22, p[1] * 0.22) : c.moveTo(p[0] * 0.22, p[1] * 0.22)));
    if (points.length === 1) c.lineTo(points[0][0] * 0.22, points[0][1] * 0.22);
    c.stroke();
  }
  const pastClear = () => U.pastCtx.clearRect(0, 0, 220, 220);
  const inkClear = () => U.inkCtx.clearRect(0, 0, 220, 220);
  // The ink takes the pen only on my turn, in my colour (the InkCanvas's IsEnabled and DefaultDrawingAttributes).
  function inkEnable(on, color = null) { G.inkOn = on; if (color) G.inkColor = color; U.ink.classList.toggle('game-on', on); }
  function hideRelay() { G.relayHidden = G.relay.id; U.relay.hidden = true; }
  function showRelay(v) {
    if (!v || v.id === G.relayHidden) { U.relay.hidden = true; G.relay = null; G.relaySig = ''; return; }
    G.relay = v;
    G.relayEnds = v.timeLeft ? Date.now() + v.timeLeft : null;
    if (v.mode === 'catch') { showCatch(v); return; }
    const players = v.players || [];
    const sig = [v.id, v.phase, v.round, v.turn, v.joined, players.length, v.myTurn].join('|');
    if (sig === G.relaySig) return;
    G.relaySig = sig;
    // 🎨 three topics in a game: which one this is, in the title.
    const nth = v.rounds ? ` · ${v.round}/${v.rounds}문제` : '';
    show(U.relay);
    U.sheet.hidden = true; U.guess.hidden = true; U.relayButtons.replaceChildren(); U.relayStop.replaceChildren();
    inkClear(); inkEnable(false); pastClear();
    const replay = ++G.relayReplay; // a replay still drawing stops once the sheet is drawn anew
    const names = players.map((p) => p.name).join(', ');
    if (v.phase === 'lobby') {
      G.relayTitle = `🎨 이어 그리기 · ${v.floor} 층 · ${players.length}명`;
      U.relayText.textContent = `참가: ${names}\n주제는 첫 사람만 알고, 다음 사람은 그림만 보고 이어서 그려요. 마지막 사람이 맞혀요!`;
      if (!v.joined) { relayButton('참가', { op: 'join' }, true); relayButton('숨기기', hideRelay); }
      else if (v.host) { relayButton('시작', { op: 'start' }, true); relayButton('닫기', { op: 'leave' }); }
      else relayButton('나가기', { op: 'leave' });
    } else if (v.phase === 'done' || v.phase === 'reveal') {
      // Between topics (reveal) the answer and the picture show a moment; at the end, every topic
      // with ⭕ or ❌ and what was said, and how many of the three were named.
      const said = `주제: ${v.topic}\n답: ${v.answer ? v.answer : '(답 없음)'}  ${v.correct ? '🎉 맞혔어요!' : '😂 아쉬워요!'}`;
      if (v.phase === 'reveal') { G.relayTitle = `🎨 이어 그리기${nth} 결과`; U.relayText.textContent = `${said}\n잠시 뒤 다음 문제! (그리는 순서가 바뀌어요)`; }
      else if (v.stoppedBy) { G.relayTitle = '🎨 이어 그리기 결과'; U.relayText.textContent = `🛑 ${v.stoppedBy} 님이 그만했어요\n주제: ${v.topic}`; }
      else {
        const res = v.results || [];
        G.relayTitle = `🎨 이어 그리기 결과 · ${res.length}문제 중 ${v.score}개`;
        U.relayText.textContent = res.map((r, k) => `${k + 1}. ${r.topic} ${r.correct ? '⭕' : `❌ → ${r.answer ? r.answer : '…'}`}`).join('\n');
      }
      U.sheet.hidden = false;
      // The picture draws itself again, in the order and colours it was drawn.
      (v.strokes || []).forEach((line, i) => after(300 + i * 90, () => { if (replay === G.relayReplay) drawLine(line.points, players[line.by].color, line.w); }));
      if (v.phase === 'done') relayButton('닫기', hideRelay);
      else if (v.joined) stopButton(U.relayStop, () => relayDo({ op: 'leave' }));
    } else {
      const cur = players[v.turn].name;
      G.relayTitle = `🎨 이어 그리기${nth} · ${v.turn + 1}/${players.length}번째`;
      if (v.myTurn) {
        U.sheet.hidden = false;
        for (const line of v.strokes || []) drawLine(line.points, players[line.by].color, line.w);
        if (v.phase === 'draw') {
          inkEnable(true, players[v.me].color);
          U.relayText.textContent = v.role === 'first' ? `주제: 「${v.topic}」\n그려 주세요! (글자는 안 돼요)` : '앞 사람 그림에 이어서 그려요 (주제는 비밀!)';
          relayButton('다 그렸어요', { op: 'pass' }, true);
          window.focus();
        } else {
          U.relayText.textContent = '이 그림은 뭘까요? 정답을 외쳐요!';
          U.guess.value = ''; U.guess.hidden = false; window.focus(); U.guess.focus();
          relayButton('정답!', () => relayDo({ op: 'guess', text: U.guess.value }), true);
        }
      } else {
        const doing = v.phase === 'guess' ? '맞히는' : '그리는';
        U.relayText.textContent = v.joined ? `${cur} 님이 ${doing} 중… 내 차례를 기다려요` : `${cur} 님이 ${doing} 중 (구경 중)`;
        if (!v.joined) relayButton('숨기기', hideRelay);
      }
      if (v.joined) stopButton(U.relayStop, () => relayDo({ op: 'leave' }));
    }
    U.relayTitle.textContent = G.relayTitle;
  }
  // Each line I draw goes to the hub when I lift the pen (at most 200 points of it). The pen
  // draws on the ink as it goes, in my colour, 5 wide. While it is down the Mac window keeps
  // taking the mouse (S.holding), so a line that slips off the panel's edge is not cut short.
  const inkAt = (e) => { const r = U.ink.getBoundingClientRect(); return [(e.clientX - r.left) * (220 / r.width), (e.clientY - r.top) * (220 / r.height)]; };
  U.ink.addEventListener('pointerdown', (e) => {
    if (!G.inkOn || e.button !== 0) return;
    e.stopPropagation(); U.ink.setPointerCapture(e.pointerId); S.holding = true;
    const p = inkAt(e); G.stroke = [p];
    const c = U.inkCtx; c.strokeStyle = G.inkColor; c.lineWidth = 5; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0], p[1]); c.stroke();
  });
  U.ink.addEventListener('pointermove', (e) => {
    if (!G.stroke) return;
    const p = inkAt(e), q = G.stroke.at(-1); G.stroke.push(p);
    const c = U.inkCtx; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(p[0], p[1]); c.stroke();
  });
  const inkUp = () => {
    const pts = G.stroke; G.stroke = null; S.holding = false;
    if (!pts || !G.relay || !G.relay.myTurn) return;
    const step = Math.max(1, Math.ceil(pts.length / 200)), out = [];
    for (let i = 0; i < pts.length; i += step) out.push([Math.round(pts[i][0] / 0.22), Math.round(pts[i][1] / 0.22)]);
    relayDo({ op: 'stroke', stroke: { w: 5, points: out } });
  };
  U.ink.addEventListener('pointerup', inkUp); U.ink.addEventListener('pointercancel', inkUp);
  onEnter(U.guess, () => {
    if (!U.guess.value.trim()) return;
    relayDo({ op: 'guess', text: U.guess.value });
    // 🖍 guesses go on until one is right; the box is ready for the next.
    if (G.relay?.mode === 'catch') U.guess.value = '';
  });
  // 🖍 캐치마인드 in the same panel: the sheet fills in as the drawer lifts the pen, the last
  // few guesses and the scores go in the text, and the guess box keeps what I am typing.
  // 🖍 one setting before it starts: its name, then small pills; the picked one is coloured.
  function pickRow(label, options, current, field, unit) {
    const row = el('div', 'game-pills');
    const t = el('div', 'game-label'); t.textContent = label; row.append(t);
    for (const o of options) row.append(btn(`${o}${unit}`, () => relayDo({ op: 'setup', [field]: o }), o === current ? '#2A9D8F' : '#2E2A45'));
    U.relayButtons.append(row);
  }
  function showCatch(v) {
    const players = v.players || [], strokes = v.strokes || [], feedAll = v.feed || [];
    const sig = [v.id, v.phase, v.round, v.joined, players.length, v.myTurn, strokes.length, feedAll.length, v.rounds, v.secs].join('|');
    if (sig === G.relaySig) return;
    G.relaySig = sig;
    show(U.relay);
    U.relayButtons.replaceChildren(); U.relayStop.replaceChildren();
    const score = v.scores ? `점수: ${players.map((p, i) => `${p.name} ${v.scores[i]}`).join(' · ')}` : '';
    U.sheet.hidden = v.phase === 'lobby';
    const guessing = v.phase === 'draw' && v.role === 'guesser';
    if (!guessing) U.guess.hidden = true;
    else if (U.guess.hidden) { U.guess.value = ''; U.guess.hidden = false; window.focus(); U.guess.focus(); }
    // The drawer's own lines are on the ink already; the sheet is redrawn for a new turn, and
    // for the others whenever a line comes in.
    const key = `${v.id}|${v.round}|${v.myTurn ? 'mine' : strokes.length}`;
    if (key !== G.catchSheet) {
      G.catchSheet = key; pastClear(); inkClear();
      for (const line of strokes) drawLine(line.points, players[line.by].color, line.w);
    }
    inkEnable(!!v.myTurn, v.myTurn ? players[v.me].color : null);
    const feed = feedAll.slice(-3).map((f) => (f.ok ? `✅ ${f.by} 님 정답!` : `${f.by}: ${f.text}`)).join('\n');
    if (v.phase === 'lobby') {
      G.relayTitle = `🖍 캐치마인드 · ${v.floor} 층 · ${players.length}명`;
      U.relayText.textContent = `참가: ${players.map((p) => p.name).join(', ')}\n한 사람이 그리고 나머지가 맞혀요. 맞힌 사람이 다음에 그려요!\n${v.rounds}문제 · 한 문제 ${v.secs}초${!v.host ? ' (연 사람이 정해요)' : ''}`;
      if (!v.joined) { relayButton('참가', { op: 'join' }, true); relayButton('숨기기', hideRelay); }
      else if (v.host) {
        pickRow('문제 수', v.roundOptions || [], v.rounds, 'rounds', '');
        pickRow('시간(초)', v.secOptions || [], v.secs, 'secs', '');
        relayButton('▶ 시작', { op: 'start' }, true); relayButton('닫기', { op: 'leave' });
      } else relayButton('나가기', { op: 'leave' });
    } else if (v.phase === 'done') {
      G.relayTitle = '🖍 캐치마인드 결과'; U.sheet.hidden = true;
      const winners = v.winners || [];
      const head = v.stoppedBy ? `🛑 ${v.stoppedBy} 님이 그만했어요` : winners.length ? `🏆 ${winners.join(', ')} 님 1등!` : '아무도 못 맞혔어요 😂';
      U.relayText.textContent = `${head}\n${score}`;
      relayButton('닫기', hideRelay);
    } else {
      // A hard topic (worth two) says so to everyone, in the title.
      G.relayTitle = `🖍 캐치마인드 · ${v.round}/${v.rounds}문제${v.hard ? ' · 🔥 어려운 문제 (2점)' : ''}`;
      if (v.phase === 'reveal') {
        const l = v.last;
        U.relayText.textContent = `${l.by ? `✅ ${l.by} 님 정답!${l.hard ? ' (🔥 +2점)' : ''} 「${l.topic}」\n다음은 ${l.by} 님이 그려요` : `⏰ 아무도 못 맞혔어요 — 정답은 「${l.topic}」`}\n${score}`;
      } else if (v.myTurn) {
        U.relayText.textContent = `내 차례! 「${v.topic}」 을(를) 그려요${feed ? `\n${feed}` : ''}`;
        relayButton('🧽 지우기', () => { pastClear(); inkClear(); relayDo({ op: 'clear' }); });
        relayButton('넘기기', { op: 'pass' });
        window.focus();
      } else {
        U.relayText.textContent = `${v.drawer} 님이 그리는 중 · ${v.mask}${feed ? `\n${feed}` : ''}`;
        if (!v.joined) relayButton('숨기기', hideRelay);
      }
      if (v.joined) stopButton(U.relayStop, () => relayDo({ op: 'leave' }));
    }
    U.relayTitle.textContent = G.relayTitle;
  }

  // ── 🎲 같이 하기 (server/party.js decides) ──
  // The tower's sliding block moves here by the hub's own rule (where it started, how fast), so
  // where I let go is where it lands.
  async function partyDo(body) {
    const r = await ask('api/party', { floor: G.party ? G.party.floor : to(), ...body });
    if (r.error) {
      U.party.hidden = false; U.partyText.textContent = `⚠ ${r.error}`; G.partySig = ''; G.partyErr = r.error; G.partyErrAt = Date.now();
      if (G.party?.kind === 'subway') subwayShake();
    } else { if (body.op !== 'state') G.partyHidden = null; showParty(r.party); }
  }
  function partyButton(text, body, hot = false, off = false) { U.partyButtons.append(btn(text, action(partyDo, body), hot ? '#7C6CF0' : '', { off })); }
  function hideParty() { G.partyHidden = G.party.id; U.party.hidden = true; }
  // 🏗 back and forth over the 1000-wide floor, as on the hub. (The Windows pet's bar once stood
  // still here: a local $s hid its $S, names ignoring case. G and sl cannot clash.)
  function slideX() {
    const sl = G.party.slide, span = 1000 - sl.w;
    const d = (((G.slideBase + (performance.now() - G.slideClock)) / 1000) * sl.speed) % (2 * span);
    return d <= span ? d : 2 * span - d;
  }
  function brick(x, w, row, level, alpha = 1) {
    const r = el('div', 'game-brick');
    r.style.width = `${Math.max(1, w * 0.22)}px`; r.style.opacity = alpha;
    r.style.background = `rgb(${120 + (level * 53) % 120}, ${140 + (level * 31) % 100}, ${200 - (level * 41) % 120})`;
    r.style.left = `${x * 0.22}px`; r.style.top = `${240 - 6 - (row + 1) * 15}px`;
    U.stack.append(r);
    return r;
  }
  function drawTower() {
    const p = G.party; U.stack.replaceChildren(); G.slider = null; G.towerFall = null;
    U.tower.classList.remove('game-map'); U.tower.style.height = '';
    const blocks = p.blocks || [], shown = blocks.slice(-13), skip = blocks.length - shown.length;
    let topEl = null;
    shown.forEach((b, i) => { topEl = brick(b.x, b.w, i, skip + i); });
    const i = shown.length;
    if (p.phase === 'play') G.slider = brick(slideX(), p.slide.w, i + 1, skip + i, p.myTurn ? 1 : 0.55);
    // A block just dropped (on this game, since the last drawing) falls from where the bar was drawn:
    // onto the stack, the overhang then cut off and tumbling away; or, missing, past it.
    const key = `${p.id}|${blocks.length}|${p.phase}`, was = G.towerKey, wasTop = G.barTop;
    G.towerKey = key; G.barTop = 240 - 6 - (i + 2) * 15;
    if (was && was !== key && was.startsWith(`${p.id}|`) && p.last && wasTop != null) {
      const fe = brick(p.last.x, p.last.w, 0, skip + i); fe.classList.add('game-fall'); fe.style.top = `${wasTop}px`;
      const tf = { el: fe, y0: wasTop, t0: performance.now(), landed: false, level: skip + i };
      if (blocks.length > Number(was.split('|')[1]) && topEl) {
        topEl.style.visibility = 'hidden'; tf.top = topEl; tf.y1 = parseFloat(topEl.style.top);
        const nb = blocks.at(-1), lx = Number(p.last.x), lw = Number(p.last.w);
        if (lx < nb.x) tf.cut = [lx, nb.x - lx, -1];
        else if (lx + lw > nb.x + nb.w) tf.cut = [nb.x + nb.w, lx + lw - nb.x - nb.w, 1];
      } else { tf.y1 = 252; tf.miss = true; }
      // Falling as things fall (1400 px/s²), not in a set time: a short drop is quick.
      tf.dur = Math.max(0.09, Math.sqrt((2 * Math.max(1, tf.y1 - tf.y0)) / 1400));
      if (G.slider) G.slider.style.visibility = 'hidden';
      G.towerFall = tf;
    }
    if ((G.slider || G.towerFall) && !G.raf) G.raf = requestAnimationFrame(slideLoop);
  }
  // The fall, frame by frame: down faster and faster; landed, the stack's new top shows (a little
  // squash) and the cut piece tumbles off, sideways and down, fading.
  function towerFall() {
    const tf = G.towerFall, te = (performance.now() - tf.t0) / 1000;
    if (!tf.landed) {
      const q = Math.min(1, te / tf.dur);
      tf.el.style.top = `${tf.y0 + (tf.y1 - tf.y0) * q * q}px`;
      if (tf.miss) tf.el.style.opacity = Math.max(0, 1 - Math.max(0, q - 0.6) / 0.4);
      if (q < 1) return;
      tf.landed = true; tf.t1 = te; tf.el.remove();
      if (tf.miss) { G.towerFall = null; return; }
      tf.top.style.visibility = ''; tf.top.style.transformOrigin = '50% 100%'; tf.top.style.transform = 'scaleY(0.7)';
      if (tf.cut) {
        tf.piece = brick(tf.cut[0], tf.cut[1], 0, tf.level); tf.piece.classList.add('game-fall');
        tf.piece.style.top = `${tf.y1}px`; tf.piece.style.transformOrigin = '50% 50%';
      }
      if (G.slider) G.slider.style.visibility = '';
      return;
    }
    const k = te - tf.t1;
    tf.top.style.transform = `scaleY(${Math.min(1, 0.7 + (k / 0.12) * 0.3)})`;
    if (tf.piece) {
      tf.piece.style.top = `${tf.y1 + 40 * k + 700 * k * k}px`;
      tf.piece.style.left = `${tf.cut[0] * 0.22 + tf.cut[2] * 30 * k}px`;
      tf.piece.style.transform = `rotate(${tf.cut[2] * 260 * k}deg)`; tf.piece.style.opacity = Math.max(0, 1 - k / 0.75);
    }
    if (k >= 0.75) { tf.piece?.remove(); tf.top.style.transform = ''; G.towerFall = null; }
  }
  function dropBlock() { if (G.party && G.party.myTurn && G.party.kind === 'stack') partyDo({ op: 'drop', x: Math.round(slideX()) }); }
  U.tower.addEventListener('pointerdown', (e) => { if (e.button === 0) dropBlock(); });
  // Enter, once the syllable being typed is written (onEnter in pet.js).
  onEnter(U.word, wordSend);
  function wordSend() {
    const t = U.word.value.trim();
    if (!t) return;
    U.word.value = '';
    // 🚇 the host, in the lobby: the two stations, however they are put between.
    if (G.party && G.party.kind === 'subway' && G.party.phase === 'lobby') {
      const two = t.split(/\s*(?:→|->|>|,|~|\s)\s*/).filter(Boolean);
      if (two.length !== 2) { U.partyText.textContent = '⚠ 출발역과 도착역 두 개를 띄어 써요 (예: 합정 고속터미널)'; return; }
      partyDo({ op: 'route', from: two[0], to: two[1] }); return;
    }
    partyDo({ op: 'say', word: t });
  }
  // The slide moves on every frame the screen draws (a timer of its own stutters), while the
  // block is on the panel, and so does a block falling; the bomb's shake and the seconds left on
  // my turn need less.
  function slideLoop() {
    G.raf = 0;
    const p = G.party;
    const sliding = p && p.kind === 'stack' && p.phase === 'play' && G.slider && !U.party.hidden;
    if (sliding) G.slider.style.left = `${slideX() * 0.22}px`;
    if (G.towerFall) { try { towerFall(); } catch { G.towerFall = null; } }
    if (sliding || G.towerFall) G.raf = requestAnimationFrame(slideLoop);
  }
  setInterval(() => {
    const p = G.party;
    if (!p || U.party.hidden || p.phase !== 'play') return;
    const gone = performance.now() - G.partyClock;
    if (p.kind === 'bomb') {
      const amp = [0, 4, 8, 14][p.heat | 0], speed = [1, 300, 160, 70][p.heat | 0];
      U.partyStage.style.transform = `rotate(${Math.sin(gone / speed) * amp}deg)`;
    }
    if ((p.myTurn || p.kind === 'liar' || p.kind === 'fool') && p.timeLeft != null) {
      const left = Math.max(0, Math.ceil((p.timeLeft - gone) / 1000));
      U.partyTitle.textContent = `${G.partyTitle} · ⏱ ${left}초`;
    }
  }, 50);
  function wordBox(max) { G.wordOn = true; U.word.maxLength = max; U.word.value = ''; U.word.hidden = false; window.focus(); U.word.focus(); }
  // 🕵️ my card (the word, or that I am the liar) and the hints so far, then the vote and the
  // caught liar's guess; the word box takes a hint or the guess.
  function showLiar(v, cur) {
    const done = v.phase === 'done', players = v.players || [];
    if (v.step === 'topic' && !done) {
      U.partyStage.textContent = '어떤 주제로 할까요?\n(표가 가장 많은 주제에서 제시어가 나와요)';
      U.partyText.textContent = `주제 투표 ${v.voted}/${players.length}${v.myTopic ? ` · 내 표: ${v.myTopic}` : ''}`;
      if (v.joined) for (const t of v.topics || []) partyButton(`${t.name}${t.votes ? ` ${t.votes}` : ''}`, { op: 'topic', category: t.name }, v.myTopic === t.name);
      return;
    }
    if (done && !v.word) { U.partyText.textContent = v.how; return; }
    const card = !v.joined ? '구경 중 — 제시어는 참가한 사람만 봐요'
      : v.iAmLiar && !done ? `카테고리: ${v.category}\n🕵️ 당신은 라이어입니다`
        : `카테고리: ${v.category}\n제시어: ${v.word}${done && v.decoy ? `\n(라이어가 받은 말: ${v.decoy})` : ''}`;
    const hints = (v.hints || []).slice(-8).map((h) => `${h.by}: ${h.text ? h.text : '(시간 초과)'}`).join('\n');
    U.partyStage.textContent = hints ? `${card}\n─────\n${hints}` : card;
    if (done) {
      const tally = v.tally ? `\n표: ${players.map((p, i) => `${p} ${v.tally[i]}`).join(' · ')}` : '';
      U.partyText.textContent = `${v.how}\n라이어는 ${v.liar} 님이었어요${tally}`;
    } else if (v.step === 'hint') {
      const round = `${v.round}/${v.rounds}바퀴`;
      if (v.myTurn) { U.partyText.textContent = `내 차례! 제시어를 한 줄로 설명해요 (${round}, Enter)`; wordBox(30); }
      else U.partyText.textContent = `${cur} 님이 설명하는 중 · ${round}`;
    } else if (v.step === 'vote') {
      U.partyText.textContent = `라이어는 누구? 층 대화로 의논해도 돼요 · 투표 ${v.voted}/${players.length}`;
      if (v.joined) players.forEach((p, i) => { if (i !== v.me) partyButton(`${v.myVote === i ? '✔ ' : ''}🗳 ${p}`, { op: 'vote', to: i }, v.myVote === i); });
    } else if (v.step === 'guess') {
      if (v.myTurn) { U.partyText.textContent = '들켰어요! 제시어를 맞히면 역전승 (Enter)'; wordBox(20); }
      else U.partyText.textContent = `라이어 ${cur} 님이 잡혔어요! 제시어를 맞히는 중…`;
    }
  }
  // 🚇 지하철 레이스: the way as a map, with every pet on it where it has got to and the next stop
  // to type big above; the box keeps a half-typed name when the board changes. Under it the board:
  // arrived by time, the rest by how far along they are.
  // The map's nodes: the start, then every stop typed (a node's line is the one it is reached on);
  // folded into rows of 4, each row back the other way so the line runs on down the side.
  function subXY(i) {
    const row = Math.floor(i / 4); let col = i % 4; if (row % 2) col = 3 - col;
    return { x: 18 + col * 61.3, y: 24 + row * 48 };
  }
  const SVG = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) { const e = document.createElementNS(SVG, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function subwayMap(v) {
    const rt = v.route, steps = rt.steps || [];
    const nodes = [{ name: rt.from, color: steps[0]?.color || '#888' }, ...steps.map((s) => ({ name: s.name, color: s.color, change: !!s.change }))];
    U.stack.replaceChildren(); G.slider = null; G.towerFall = null;
    const h = 24 + Math.ceil(nodes.length / 4) * 48 - 12;
    U.tower.classList.add('game-map'); U.tower.style.height = `${h}px`; U.tower.hidden = false;
    const svg = svgEl('svg', { class: 'game-map-svg', width: 220, height: h });
    const text = (t, x, y, size, fg, bold) => {
      const d = el('div', 'game-map-text'); d.textContent = t;
      d.style.left = `${x}px`; d.style.top = `${y}px`; d.style.fontSize = `${size}px`; d.style.color = fg; if (bold) d.style.fontWeight = '700';
      U.stack.append(d); return d;
    };
    for (let i = 1; i < nodes.length; i++) {
      const p = subXY(i - 1), q = subXY(i);
      svg.append(svgEl('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: nodes[i].color, 'stroke-width': 4, 'stroke-linecap': 'round' }));
    }
    U.stack.append(svg);
    nodes.forEach((n, i) => {
      const p = subXY(i), end = i === nodes.length - 1, big = n.change || end || i === 0;
      const r = big ? 6 : 3.5, sw = big ? 2.5 : 1.8;
      // (WPF draws an ellipse's stroke inside its size; SVG on its edge.)
      svg.append(svgEl('circle', { cx: p.x, cy: p.y, r: r - sw / 2, fill: '#fff', stroke: n.color, 'stroke-width': sw }));
      if (n.change) text('🔁', p.x + 10, p.y - 16, 8, '#FFFFFF', false);
      if (end) text('⭐', p.x + 10, p.y - 16, 9, '#FFD666', false);
      const nm = n.name.length > 5 ? `${n.name.slice(0, 4)}…` : n.name;
      text(nm, p.x, p.y + 6, 8.5, end ? '#FFD666' : '#D8D4EA', end || i === 0);
    });
    // The pets, mine last (on top) and bigger; a few on one station side by side.
    const board = v.board || [], here = new Map(), arrived = board.filter((e) => e.done != null);
    let mine = null;
    for (const e of [...board].sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0))) {
      const node = Math.min(e.pos | 0, nodes.length - 1), k = here.get(node) || 0; here.set(node, k + 1);
      const m = e.me ? S.members.get('') : S.members.get(`${v.floor}|${e.id}`);
      const size = e.me ? 20 : 16, p = subXY(node);
      const wrap = el('div', `game-map-pet${e.me ? ' mine' : ''}`), sp = spriteEl(m?.kind || 'cat', size);
      setFrame(sp, 0); wrap.append(sp);
      const off = k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 8 : 0;
      wrap.style.left = `${p.x - size / 2 + off}px`; wrap.style.top = `${p.y - size - 4}px`;
      U.stack.append(wrap);
      if (e.me) mine = sp;
      // Moved since last drawn: slide in from the station it stood on.
      const was = G.subPos.get(e.id);
      if (was != null && was !== node) { const o = subXY(was); anim(wrap, { transform: [`translate(${o.x - p.x}px, ${o.y - p.y}px)`, 'translate(0, 0)'] }, 260, 0, 'linear'); }
      G.subPos.set(e.id, node);
      if (e.done != null) {
        const place = arrived.indexOf(e);
        text(place >= 0 && place < 3 ? ['🥇', '🥈', '🥉'][place] : '🏁', p.x, p.y - size - 16, 9, '#FFFFFF', false);
      }
    }
    G.subMine = mine;
  }
  // A wrong name: my pet shakes where it is.
  function subwayShake() {
    if (!G.subMine || !G.subMine.isConnected) return;
    G.subMine.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }], { duration: 50, direction: 'alternate', iterations: 4 });
  }
  function showSubway(v) {
    const rt = v.route, r = v.ride, medal = ['🥇', '🥈', '🥉'];
    if (!rt) return;
    const n = (rt.steps || []).length;
    const top = `🚇 ${rt.from} → ${rt.to} · ${n}역${rt.random ? ' (🎲 무작위)' : ''}`;
    if (r && r.done != null) U.partyStage.textContent = `${top}\n🏁 도착! ${(r.done / 1000).toFixed(1)}초${r.miss ? ` · 틀림 ${r.miss}번` : ''}`;
    else if (r && v.phase === 'play' && v.startsIn > 0) {
      U.partyStage.textContent = `${top}\n⏳ ${Math.ceil(v.startsIn / 1000)}초 뒤 출발! 노선을 미리 봐 두세요`;
      const go = `${v.id}|${Math.ceil(v.startsIn / 1000)}`;
      if (G.subGo !== go) { G.subGo = go; after(Math.round(v.startsIn) + 50, () => partyDo({ op: 'state' })); }
    } else if (r && v.phase === 'play') { const st = rt.steps[r.pos]; U.partyStage.textContent = `${top}\n다음 역 ▶ ${st.name}${st.change ? ` (${st.line}으로 환승)` : ''}`; }
    else U.partyStage.textContent = top;
    subwayMap(v);
    if (v.phase === 'done') U.partyText.textContent = v.how;
    else {
      const err = G.partyErr && Date.now() - G.partyErrAt < 1500 ? `⚠ ${G.partyErr}\n` : '';
      U.partyText.textContent = err + (v.board || []).map((e, k) => (e.done != null
        ? `${k < 3 ? medal[k] : `${k + 1}등`} ${e.name} ${(e.done / 1000).toFixed(1)}초${e.me ? ' ◀' : ''}`
        : `🚃 ${e.name} ${e.pos}/${n}${e.me ? ' ◀' : ''}`)).join('   ');
    }
    // The box stays as it is while others move on (hiding it each time lost what I was typing).
    if (v.myTurn) {
      G.wordOn = true; U.word.maxLength = 14; U.word.hidden = false;
      if (G.subFocus !== `${v.id}|play`) { G.subFocus = `${v.id}|play`; window.focus(); U.word.focus(); }
    }
  }
  function showParty(v) {
    if (!v || v.id === G.partyHidden) { U.party.hidden = true; G.party = null; G.partySig = ''; G.slider = null; return; }
    G.party = v; G.partyClock = performance.now();
    // The slide's clock is set once per block: setting it on every poll made it jump by the lag.
    if (v.slide) {
      const key = `${v.id}|${v.height}|${v.turn}`;
      if (key !== G.slideKey) { G.slideKey = key; G.slideBase = v.slide.elapsed; G.slideClock = performance.now(); }
    }
    const players = v.players || [];
    // A refusal in the lobby (a station that is not there) stays 4 s: drawn again on the next poll,
    // it would vanish at once, and the race then start on a random way with no word why.
    const lobbyErr = v.phase === 'lobby' && G.partyErr && Date.now() - G.partyErrAt < 4000 ? G.partyErr : '';
    const sig = [lobbyErr, v.id, v.phase, v.turn, v.joined, players.length, v.myTurn, v.height, v.throws, (v.words || []).length, v.canToss, v.heat, v.step, (v.hints || []).length, v.voted, v.myVote, v.myTopic,
      v.route?.to, (v.route?.steps || []).length, v.route?.count, Math.ceil((v.startsIn || 0) / 1000), v.ride?.pos, (v.board || []).map((e) => `${e.pos}:${e.done}`).join(',')].join('|');
    if (sig === G.partySig) return;
    G.partySig = sig;
    show(U.party);
    U.tower.hidden = true; G.wordOn = false; U.partyButtons.replaceChildren(); U.partyStop.replaceChildren();
    U.partyStage.textContent = ''; U.partyStage.style.fontSize = '13px'; U.partyStage.style.transform = '';
    G.partyTitle = `${v.title} · ${v.floor} 층`;
    if (v.phase === 'lobby') {
      G.partyTitle += ` · ${players.length}명`;
      U.partyText.textContent = `${lobbyErr ? `⚠ ${lobbyErr}\n` : ''}참가: ${players.join(', ')}${v.kind === 'stack' && v.best ? `\n이 층 최고 기록: ${v.best}층` : ''}`;
      if (v.kind === 'subway') {
        U.partyStage.textContent = v.route ? `🚇 ${v.route.from} → ${v.route.to} · ${v.route.count}역${v.route.random ? ' (🎲 무작위)' : ''}\n노선은 출발할 때 모두에게 공개돼요`
          : '🚇 아직 경로를 안 정했어요\n(그냥 시작하면 무작위로 정해져요)';
        if (v.host) {
          U.partyText.textContent += '\n⬇ 출발역 도착역을 입력하고 Enter (예: 학동 암사)\n또는 🎲 무작위 경로 버튼';
          G.wordOn = true; U.word.maxLength = 30; U.word.hidden = false;
          partyButton(v.route?.random ? '🎲 다시 뽑기' : '🎲 무작위 경로', { op: 'route-random' });
          if (G.subFocus !== v.id) { G.subFocus = v.id; window.focus(); U.word.focus(); }
        }
      }
      if (!v.joined) { partyButton('참가', { op: 'join' }, true); partyButton('숨기기', hideParty); }
      else if (v.host) { partyButton('시작', { op: 'start' }, true); partyButton('닫기', { op: 'leave' }); }
      else partyButton('나가기', { op: 'leave' });
    } else {
      const cur = v.turn != null ? players[v.turn] : '';
      if (v.kind === 'stack') {
        U.tower.hidden = false; drawTower();
        U.partyText.textContent = v.phase === 'done' ? `${v.height}층${v.record ? ' 🏆 이 층 신기록!' : ` (최고 ${v.best}층)`}\n${v.how}`
          : v.myTurn ? `내 차례! 그림을 눌러 떨어뜨려요${v.last?.perfect ? '\n✨ 앞 사람 퍼펙트!' : ''}` : `${cur} 님 차례 · 지금 ${v.height}층`;
        if (v.myTurn) { partyButton('⬇ 떨어뜨리기', dropBlock, true); window.focus(); }
      }
      if (v.kind === 'bomb') {
        U.partyStage.textContent = v.phase === 'done' ? '💥' : '💣'; U.partyStage.style.fontSize = '40px';
        if (v.phase === 'done') U.partyText.textContent = v.how;
        else if (v.myTurn) {
          U.partyText.textContent = v.canToss ? '내 손에 폭탄이! 누구에게 던질까요?' : '받았어요! 1초 뒤에 던질 수 있어요';
          players.forEach((p, i) => { if (i !== v.me) partyButton(`→ ${p}`, { op: 'toss', to: i }, true, !v.canToss); });
          if (!v.canToss) after(1100, () => partyDo({ op: 'state' }));
        } else U.partyText.textContent = `${cur} 님이 폭탄을 들고 있어요 ${['', '…째깍', '…째깍째깍', '…째깍째깍째깍!!'][v.heat | 0]}`;
      }
      if (v.kind === 'words') {
        const starts = (v.starts || []).join(' / ');
        U.partyStage.textContent = (v.words || []).slice(-6).map((x) => (x.word ? x.word : `✖${x.by}`)).join(' → ');
        if (v.phase === 'done') U.partyText.textContent = v.how;
        else if (v.myTurn) { U.partyText.textContent = `내 차례! 「${starts}」 로 시작하는 말 (Enter)`; wordBox(10); }
        else {
          const out = v.joined && !(v.alive || [])[v.me] ? '\n(나는 탈락, 구경 중)' : '';
          U.partyText.textContent = `${cur} 님 차례 · 「${starts}」${out}`;
        }
      }
      if (v.kind === 'liar' || v.kind === 'fool') showLiar(v, cur);
      if (v.kind === 'subway') showSubway(v);
      if (v.phase === 'done') partyButton('닫기', hideParty);
      else if (!v.joined) partyButton('숨기기', hideParty);
      else stopButton(U.partyStop, () => partyDo({ op: 'leave' }));
    }
    if (!G.wordOn) U.word.hidden = true;
    U.partyTitle.textContent = G.partyTitle;
  }

  // ── 🏆 기록 도전 (server/records.js keeps the bests) ──
  // Played alone in its panel and timed here; the floor's top three underneath. Nothing goes to
  // the hub until a try is finished. G.recTry moves on whenever a try ends or is dropped, so a
  // late timer or click is ignored.
  const RECORD_HOW = {
    react: ['⚡ 반응속도', '빨간 칸이 초록으로 바뀌는 순간 클릭!\n먼저 누르면 실격이에요.'],
    order: ['🔢 1→25', '1부터 25까지 순서대로 빨리!\n첫 화면이 뜨는 순간부터 잽니다.'],
    ten: ['⏱ 딱 10초', '시작하고 속으로 10초를 센 뒤 칸을 클릭!\n10초에 가까울수록 1등.'],
  };
  const recMs = () => Math.floor(performance.now() - G.recClock);
  async function recordDo(body) {
    const r = await ask('api/record', { floor: G.recFloor, ...body });
    if (r.error) { U.recordText.textContent = `⚠ ${r.error}`; return null; }
    if (r.board) G.recBoard = r.board;
    return r;
  }
  function recordMs(game, ms) {
    if (game === 'react') return `${ms}ms`;
    if (game === 'order') return `${(ms / 1000).toFixed(2)}초`;
    return `${(ms / 1000).toFixed(2)}초 차이`;
  }
  function recordTop() {
    const b = G.recBoard ? G.recBoard[G.recGame] : null;
    const medal = ['🥇', '🥈', '🥉'], lines = [];
    for (const r of b?.top || []) if (r) lines.push(`${medal[lines.length]} ${r.name} · ${r.text}${r.me ? ' ◀ 나' : ''}`);
    if (!lines.length) lines.push('아직 기록이 없어요 — 첫 1등이 되어 보세요');
    if (b?.mine != null && !(b.top || []).some((r) => r.me)) lines.push(`내 최고 · ${recordMs(G.recGame, b.mine)}`);
    U.recordTop.textContent = lines.join('\n');
  }
  function recordButton(text, run, hot = false) { U.recordButtons.append(btn(text, run, hot ? '#C99A2E' : '')); }
  // The choice of game and its top three, with a start button; note is the last try's result.
  function recordIdle(note = '') {
    G.recTry++; G.recMode = null;
    U.recordTitle.textContent = `🏆 기록 도전 · ${G.recFloor} 층 TOP 3`;
    U.pick.replaceChildren();
    for (const game of Object.keys(RECORD_HOW)) {
      const on = game === G.recGame;
      const b = btn(RECORD_HOW[game][0], () => { G.recGame = game; recordIdle(); }, on ? '#E9B949' : '#2E2A45');
      b.style.color = on ? '#1E1B2E' : '#FFFFFF';
      U.pick.append(b);
    }
    U.pad.hidden = true; U.grid.hidden = true;
    U.recordText.textContent = note ? note : RECORD_HOW[G.recGame][1];
    recordTop();
    U.recordButtons.replaceChildren();
    recordButton('▶ 시작', recordPlay, true);
    recordButton('닫기', () => { G.recTry++; G.recMode = null; U.record.hidden = true; });
  }
  async function recordOpen(game) {
    G.recFloor = to(); if (game) G.recGame = game;
    show(U.record);
    recordIdle(); await recordDo({ op: 'board' }); recordTop();
  }
  async function recordDone(ms, line) {
    const r = await recordDo({ op: 'submit', game: G.recGame, ms: Math.round(ms) });
    let extra = '';
    // One line for how it stands: a new best of mine, and my place on the board (first with a crown).
    if (r && r.result) extra = `${r.result.best ? '\n🎉 내 최고 기록!' : ''}${r.result.first ? `${r.result.best ? ' · ' : '\n'}👑 지금 1등!` : r.result.rank ? `${r.result.best ? ' · ' : '\n'}지금 ${r.result.rank}등` : ''}`;
    recordIdle(`${line}${extra}`);
    if (U.recordButtons.children.length) U.recordButtons.children[0].textContent = '▶ 다시';
  }
  function recordPlay() {
    G.recTry++; const tr = G.recTry; G.recMode = G.recGame;
    U.pick.replaceChildren(); U.recordButtons.replaceChildren();
    recordButton('그만', () => recordIdle());
    window.focus();
    if (G.recGame === 'react') {
      G.recGo = false; U.pad.hidden = false; U.pad.style.background = '#C0392B'; U.padText.textContent = '기다리세요…';
      U.recordText.textContent = '초록이 되면 클릭!';
      after(1500 + rnd(2500), () => {
        if (tr !== G.recTry) return;
        G.recGo = true; U.pad.style.background = '#2ECC71'; U.padText.textContent = '지금!'; G.recClock = performance.now();
      });
    }
    if (G.recGame === 'order') {
      U.grid.replaceChildren(); G.recNext = 1;
      const nums = Array.from({ length: 25 }, (_, i) => i + 1);
      for (let i = nums.length - 1; i > 0; i--) { const j = rnd(i + 1); [nums[i], nums[j]] = [nums[j], nums[i]]; }
      for (const n of nums) {
        const b = btn(`${n}`, () => {
          if (G.recMode !== 'order') return;
          if (n !== G.recNext) {
            b.style.background = '#C0392B'; after(250, () => { if (!b.disabled) b.style.background = '#3B355A'; }); return;
          }
          b.disabled = true; b.style.background = '#1F1C30'; G.recNext++;
          if (G.recNext > 25) { const ms = recMs(); G.recMode = null; recordDone(ms, `🔢 ${(ms / 1000).toFixed(2)}초`); }
          else U.recordText.textContent = `다음: ${G.recNext}`;
        }, '#3B355A');
        U.grid.append(b);
      }
      U.grid.hidden = false; U.recordText.textContent = '1 부터!'; G.recClock = performance.now();
    }
    if (G.recGame === 'ten') {
      U.pad.hidden = false; U.pad.style.background = '#2E2A45'; U.padText.textContent = '속으로 하나, 둘, 셋…';
      U.recordText.textContent = '10초라고 생각될 때 칸을 클릭!'; G.recClock = performance.now();
    }
  }
  U.pad.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (G.recMode === 'react') {
      if (!G.recGo) { recordIdle('😅 너무 빨라요! 초록이 된 다음에 눌러요'); return; }
      const ms = recMs(); G.recMode = null; recordDone(ms, `⚡ ${ms}ms`);
    } else if (G.recMode === 'ten') {
      const ms = recMs(), off = Math.abs(ms - 10000); G.recMode = null;
      if (off > 10000) { recordIdle(`⏱ ${(ms / 1000).toFixed(2)}초 — 너무 멀어서 기록하지 않아요`); return; }
      recordDone(off, `⏱ ${(ms / 1000).toFixed(2)}초에 멈췄어요\n🎯 10초보다 ${(off / 1000).toFixed(2)}초 ${ms < 10000 ? '빨라요' : '늦어요'}`);
    }
  });

  // ── the right-click menu's game items ──
  // The floor's games, by what they ask of you.
  const GAMES = [
    ['🖌 그림', [['catch', '🖍 캐치마인드'], ['relay', '🎨 이어 그리기']]],
    ['💬 말', [['words', '🔤 끝말잇기'], ['liar', '🕵️ 라이어 게임 (3명~)'], ['fool', '🤪 바보 라이어 (3명~)']]],
    ['⚡ 순발력', [['stack', '🏗 높이 쌓기'], ['bomb', '💣 폭탄 돌리기']]],
    ['⌨️ 타자', [['subway', '🚇 지하철 레이스']]],
  ];
  function openGame(kind) {
    if (kind === 'relay') relayDo({ op: 'open' });
    else if (kind === 'catch') relayDo({ op: 'open', mode: 'catch' });
    else partyDo({ op: 'open', kind });
  }
  // On someone else's pet: a game with just them.
  function menuFor(p) {
    const games = [['quickdraw', '🤠 결투 (먼저 쏘기)'], ['roulette', '🔫 러시안 룰렛'], ['rps', '✊ 가위바위보 (3판 2선승)']];
    return [{ text: '⚔️ 1:1 대결 신청', sub: games.map(([game, text]) => ({ text, run: () => duelDo({ op: 'invite', to: p.who, game, floor: p.floor }) })) }];
  }
  // On mine: one 🎮 게임 item, the floor's games by kind (같이) and then the ones played alone.
  function menu() {
    return [{
      text: '🎮 게임',
      sub: [
        ...GAMES.flatMap(([head, kinds]) => [{ head: `${head} · 같이` }, ...kinds.map(([kind, text]) => ({ text, run: () => openGame(kind) }))]),
        { head: '🏆 혼자 기록 도전 (층 TOP 3)' },
        ...Object.keys(RECORD_HOW).map((game) => ({ text: RECORD_HOW[game][0], run: () => recordOpen(game) })),
      ],
    }];
  }

  // Every 0.2 s from pet.js: 🎨 the seconds left on my turn, in the title.
  function tick(now) {
    const r = G.relay;
    if (r && (r.myTurn || (r.mode === 'catch' && r.phase !== 'done' && r.phase !== 'lobby')) && G.relayEnds && !U.relay.hidden) {
      U.relayTitle.textContent = `${G.relayTitle} · ⏱ ${Math.max(0, Math.ceil((G.relayEnds - now) / 1000))}초`;
    }
  }
  // In a game right now: a duel asked or under way, or a table I sit at that has started.
  const busy = () => !!((G.duel && (G.duel.phase === 'invite' || G.duel.phase === 'play'))
    || (G.relay?.joined && G.relay.phase !== 'lobby' && G.relay.phase !== 'done')
    || (G.party?.joined && G.party.phase === 'play'));

  Mod.games = { duel: showDuel, relay: showRelay, party: showParty, tick, menu, menuFor, busy };
})();
