// 팀 펫 on any screen that can show a web page: the Mac app's see-through window (mac/main.cjs),
// or a browser tab. The same pet as server/pet.ps1 on Windows, drawn the same way: my animal at
// the right end, the people on my floors beside it, whoever speaks gets the bubble over their own
// pet; the chat box with its tabs, notes, the first run, the update notes. The chat effects
// (pet-fx.js), fishing (pet-fish.js) and the games (pet-games.js) come in their own files and hook
// in through Mod; everything they need from here is a plain top-level function or value.
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// "@이름" in a line is a call (server/pet.js calls): shown as a tag, the text otherwise as it is.
const TAG = /@[\w가-힣.-]+/g;
const tagged = (s) => esc(s).replace(TAG, (t) => `<span class="tag">${t}</span>`);
const el = (tag, cls = '') => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
// The Mac app hands in a few things only it can do (mac/preload.cjs); a browser has none.
const app = window.teamPet || null;
if (!app) document.body.classList.add('page');
// The other files: Mod.fx (effects), Mod.fish (fishing, the book, the forge, the contest), Mod.games (duel, relay,
// party, records, subway), Mod.smack (🦶 날려버리기 with the hoop, the hole and space), Mod.snow (❄️ 눈덩이, snowmen).
const Mod = {};
// One colour per floor, for its group's bar and its name in the chat.
const COLORS = ['#A496FF', '#4FD1A1', '#FFB454', '#FF8A8A', '#5CC8FF'];
const FX_CMDS = ['폭죽', '박수', '하트', 'ㅋㅋ', '눈', '눈사람', '비', '우산', '춤', '댄스'];
const FX_COLORS = ['#F4A261', '#E9C46A', '#7EE0C8', '#C3B1E1', '#F28482'];

// ── talking to my own server ──
async function call(path, body, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(path, method === 'GET' ? {} : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  return { ok: !!res?.ok, data, error: data.error || (res ? '저장하지 못했어요' : '연결되지 않았어요') };
}
// A POST whose answer matters (a game's state): the parsed answer, or { error } on a refusal.
async function ask(path, body, method = 'POST') { const r = await call(path, body, method); return r.ok ? r.data : { error: r.error }; }

// ── small helpers the other files use too ──
const after = (ms, fn, arg) => setTimeout(() => fn(arg), ms);
const rnd = (a, b) => (b === undefined ? Math.floor(Math.random() * a) : a + Math.floor(Math.random() * (b - a)));
const pick = (list) => list[rnd(list.length)];
const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
// WPF's easings, near enough: BackEase (amplitude ~0.7), BackEase in, QuadraticEase out and in.
const EASE = { back: 'cubic-bezier(.34,1.56,.64,1)', backIn: 'cubic-bezier(.36,0,.66,-.56)', quadOut: 'cubic-bezier(.25,.46,.45,.94)', quadIn: 'cubic-bezier(.55,.085,.68,.53)' };
// One animation: anim(el, { opacity: [0, 1] }, 220) or anim(el, { transform: ['translateY(26px)', 'none'] }, 450, 0, EASE.back).
function anim(node, frames, ms, delay = 0, ease = 'ease', fill = 'forwards') { return node.animate(frames, { duration: ms, delay, easing: ease, fill }); }
// A pet (or a panel) hops up into place.
function pop(node, delay = 0, rise = 26) {
  anim(node, { transform: [`translateY(${rise}px)`, 'translateY(0)'] }, 450, delay, EASE.back);
  anim(node, { opacity: [0, 1] }, 220, delay, 'linear');
}
// The sprites: 16 × 16 pixel animals, four frames side by side (scripts/make-pets.js):
// 0 idle · 1 bob · 2 blink · 3 talk. An element shows one by its background position.
const spriteUrl = (kind) => `url('assets/pets/${encodeURIComponent(kind)}.png')`;
function setFrame(node, f) { node.style.backgroundPosition = `${(f / 3) * 100}% 0`; }
function spriteEl(kind, size) { const s = el('div', 'sprite'); s.style.width = s.style.height = `${size}px`; s.style.backgroundImage = spriteUrl(kind); return s; }
// A button the way the Windows panels draw them (rounded, no chrome): hot = blue, off = disabled.
function btn(text, run, color = '', { hot = false, off = false, arg = null } = {}) {
  const b = el('button', `btn ${hot ? 'hot' : ''}`); b.type = 'button'; b.textContent = text; if (color) b.style.background = color; b.disabled = off;
  b.onclick = (e) => { e.stopPropagation(); run?.(arg); };
  return b;
}
// A see-through bar (30–100 %): change gets the level (0.3–1) while it moves, done runs when let go.
function setBar(input, v) {
  input.value = Math.round(v);
  input.style.setProperty('--fill', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);
  const pct = input.parentElement?.querySelector('.pct'); if (pct) pct.textContent = `${Math.round(input.value)}%`;
}
function bar(value, width, change, done, pct = true) {
  const row = el('div', 'barrow'); row.style.display = 'flex'; row.style.alignItems = 'center';
  const sl = el('input'); sl.type = 'range'; sl.min = 30; sl.max = 100; sl.style.width = `${width}px`;
  row.append(sl); if (pct) row.append(el('span', 'pct'));
  setBar(sl, value);
  sl.oninput = () => { setBar(sl, sl.value); change(sl.value / 100); };
  sl.onchange = () => done();
  sl.onpointerdown = (e) => e.stopPropagation();
  return row;
}

// ── the state ──
const S = {
  st: null, members: new Map(), rows: new Map(), seen: new Set(), first: true, pokes: -1, calls: null, tick: 0,
  floor: null, pick: null, noteTo: null, noteTab: null, armed: false, warnUntil: 0, linesSig: '', tabSig: '', castSig: '',
  shakeUntil: 0, walking: false, fly: false, k: 1, petA: 1, chatW: 250, chatH: 160, chatA: 1, pend: null,
  startAuto: false, start: null, news: null, newsShown: -1, newsOpen: false, newsUntil: Infinity, holding: false, dragged: false,
};
const fxLayer = $('#fx');
const floors = () => S.st?.floors || [];
const to = () => S.pick || S.floor;
const floorColor = (fl) => COLORS[Math.max(0, floors().indexOf(fl)) % COLORS.length];
const chatOpen = () => !$('#chat').hidden;

// ── one pet: a bubble over an animal, its name under it ──
// Mine (who = '') is bigger and carries the dot and the mark; a friend's knows its floor, where a
// click answers. Each slot keeps one width whatever is said: the bubble hangs out over the
// neighbours (negative margins) instead of widening the slot, so the row and the floor bars stay still.
function member(who, name, kind, size, floor, panel) {
  const W = size + 22, over = 180 - W;
  const col = el('div', `slot ${who ? '' : 'me'}`); col.style.width = `${W}px`;
  const bub = el('div', 'bub'); bub.hidden = true;
  if (who) bub.style.margin = `0 ${-over / 2}px 2px`; else { bub.style.margin = `0 0 2px ${-over}px`; bub.style.alignSelf = 'flex-end'; }
  const g = el('div', 'g'); g.style.width = `${size + 6}px`; g.style.height = `${size + 4}px`; g.title = name;
  const img = el('div', 'img'); img.style.width = img.style.height = `${size}px`; img.style.backgroundImage = spriteUrl(kind);
  g.append(img);
  const m = { who, name, kind, floor, size, col, g, img, bub, until: 0, walkUntil: 0, phase: S.members.size, dot: null, mark: null, open: null };
  if (!who) {
    m.dot = el('div', 'dot'); m.dot.hidden = true; m.mark = el('div', 'mark'); m.mark.hidden = true; g.append(m.dot, m.mark);
  }
  const nm = el('div', 'nm'); nm.textContent = name; nm.style.maxWidth = `${W}px`; m.nm = nm;
  col.append(bub, g, nm); panel.append(col);
  pressable(g, m);
  // A bubble with a link opens it; a note's bubble opens the answer to it (open is the writer).
  bub.onclick = (e) => {
    e.stopPropagation();
    if (!m.open) return;
    if (typeof m.open === 'object') noteTo(m.open); else window.open(m.open);
    bub.hidden = true; m.open = null;
  };
  g.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); openMenu(e.clientX, e.clientY, who ? { who, name, floor } : null, g); };
  return m;
}
// Drag any pet to move them all (the Mac app moves its window along); a press that hardly moves
// is a click: on a friend it opens that floor's chat (again: closes it), on mine the chat.
// A click on my pet while my line is in reels it in (no drag then).
function pressable(g, m) {
  g.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // ❄️ A snowball coming at me: the click is the dodge (pet-snow.js).
    if (!m.who && (Mod.snow?.press?.() || Mod.fish?.press?.())) return;
    const from = { x: e.screenX, y: e.screenY };
    let last = { ...from }, moved = false;
    S.holding = true; S.dragged = false;
    g.setPointerCapture(e.pointerId);
    const onMove = async (ev) => {
      if (!moved && Math.abs(ev.screenX - from.x) + Math.abs(ev.screenY - from.y) <= 4) return;
      moved = true; S.dragged = true; g.classList.add('held');
      const dx = ev.screenX - last.x, dy = ev.screenY - last.y; last = { x: ev.screenX, y: ev.screenY };
      if ((dx || dy) && app?.drag) await app.drag(dx, dy);
    };
    const onUp = async () => {
      g.removeEventListener('pointermove', onMove); g.removeEventListener('pointerup', onUp); g.removeEventListener('pointercancel', onUp);
      g.classList.remove('held'); S.holding = false;
      if (moved) {
        const at = await app?.drag?.(0, 0);
        if (at) call('api/pet', { x: at.x, y: at.y });
        after(0, () => { S.dragged = false; });
        return;
      }
      press(m.floor);
    };
    g.addEventListener('pointermove', onMove); g.addEventListener('pointerup', onUp); g.addEventListener('pointercancel', onUp);
  });
}
function press(floor) {
  if (floor) {
    if (chatOpen() && (S.noteTo || to() === floor)) toggleChat(false);
    else { if (!S.noteTo) S.pick = floor; S.linesSig = ''; toggleChat(true); }
  } else toggleChat(!chatOpen());
}
// Who said what over whose head. Called by name (@이름): a yellow bubble with an orange rim; a note
// (tone 'note'): lilac with a purple rim. Plain talk stays white. open: a link, or the writer of a
// note, so a click on the bubble answers it. Bubbles hang over the neighbours, so only the newest
// talk shows; the chat keeps the rest. A bubble that opens something stays until it times out.
function say(who, name, text, secs = 8, { open = null, img = null, tone = '' } = {}) {
  const m = typeof who === 'string' ? S.members.get(who) : who;
  if (!m) return;
  m.bub.className = `bub ${tone} ${open ? 'open' : ''}`;
  m.bub.innerHTML = `<b>${esc(name)}</b>${tagged(text)}${img ? `<img src="${esc(img)}" alt="">` : ''}`;
  m.open = open;
  for (const o of S.members.values()) if (o !== m && !o.open) o.bub.hidden = true;
  m.bub.hidden = false; m.until = Date.now() + secs * 1000;
}
// Where a pet is on the screen, for the effects: the middle of its head, its feet, its size (zoom and all).
function fxAt(who) {
  const m = typeof who === 'string' ? S.members.get(who) : who;
  if (!m) return null;
  const r = m.img.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top, foot: r.bottom, size: Math.max(16, r.height), m };
}
// The effects' layer over everything (clicks pass through it).
function fxAdd(node, x, y) { node.style.left = `${x}px`; node.style.top = `${y}px`; fxLayer.append(node); return node; }
function fxText(t, size, color) { const e = el('div', 'fxt'); e.textContent = t; e.style.fontSize = `${size}px`; e.style.color = color; return e; }
// Moves from (x, y) by (dx, dy) over ms after delay, bright for most of the way then quickly gone.
function fxGo(node, x, y, dx, dy, ms, delay = 0, ease = 'linear') {
  node.style.opacity = 0; fxAdd(node, x, y);
  anim(node, { transform: ['translate(0, 0)', `translate(${dx}px, ${dy}px)`] }, ms, delay, ease);
  anim(node, { opacity: [1, 0] }, ms, delay, EASE.quadIn);
  after(delay + ms + 50, () => node.remove());
  return node;
}

// ── the cast: who sits on the row ──
// It changes when someone comes or goes, or picks another animal, or I move. The row is the room my
// pet stands in (st.floor): its people in a group, mine apart at the right end; the other rooms are
// only chat tabs. Newcomers walk in through a door; a first cast just hops in.
function cast(st) {
  const sig = [`floor=${st.floor}`, ...st.friends.filter((f) => f.floor === st.floor).map((f) => `${f.who}=${f.kind}`), `me=${st.kind}`].join(',');
  if (sig === S.castSig) return;
  S.castSig = sig;
  const old = S.members;
  // 🏷 Only the room's name changed (the same people): rebuilt with no doors and no hops.
  const folk = st.friends.filter((f) => f.floor === st.floor).map((f) => f.who).sort().join(',');
  const renamed = old.size > 0 && S.folk === folk && S.floorSig && S.floorSig !== st.floor;
  S.folk = folk; S.floorSig = st.floor;
  const row = $('#row');
  row.replaceChildren(); S.members = new Map(); S.rows = new Map();
  [st.floor].filter(Boolean).forEach((fl) => {
    const here = st.friends.filter((f) => f.floor === fl);
    if (!here.length) return;
    const grp = el('div', 'grp'), grow = el('div', 'grow');
    grp.append(grow);
    for (const f of here) S.members.set(`${fl}|${f.who}`, member(f.who, f.name, f.kind, 36, fl, grow));
    S.rows.set(fl, grow);
    row.append(grp);
  });
  S.members.set('', member('', '나', st.kind, 48, '', row));
  if (renamed) return;
  // While I walk out of the door, the other groups wait to hop in when I arrive.
  if (S.fly) { for (const c of row.children) if (c !== S.members.get('').col) c.style.visibility = 'hidden'; return; }
  if (S.castQuiet) return castQuiet(st, old, row);
  let d = 0;
  for (const [k, m] of S.members) {
    if (old.has(k)) continue;
    if (k && old.size) enterDoor(m);
    else { pop(m.col, d); d += 90; }
  }
  const gone = [...old].filter(([k]) => k && !S.members.has(k)).map(([, o]) => o);
  if (S.quake) S.quakeGone = gone; else gone.forEach(leaveDoor);
}
// 🛸 While I am aboard the UFO (pet-fx.js), the row changes with no doors: the ones left behind
// just go, the new ones wait unseen (and so do I) until the beam sets me down.
function castQuiet(st, old, row) {
  S.quietNew = [];
  for (const [k, m] of S.members) {
    if (!k) { m.img.style.visibility = 'hidden'; continue; }
    if (!old.has(k)) { m.col.style.visibility = 'hidden'; S.quietNew.push(m); }
  }
  void row;
}
// 🚧 The room I was in came down (its owner deleted it): a sign drops onto the row, everything
// shakes, dust flies up at everyone's feet, and whoever was in it hurries out through the doors.
function demolish(name, gone) {
  const me = S.members.get(''), at = fxAt(me);
  const sign = fxText('🚧', 24, '#F5C542'); sign.style.opacity = 0;
  fxAdd(sign, at.x - 70, at.y - 40);
  anim(sign, { transform: ['translateY(-90px) rotate(-25deg)', 'translateY(0) rotate(0deg)'], opacity: [0, 1] }, 450, 0, EASE.quadIn);
  after(450, () => {
    $('#row').animate({ transform: ['translateX(0)', 'translateX(-6px)', 'translateX(6px)', 'translateX(-4px)', 'translateX(4px)', 'translateX(0)'] }, { duration: 450, iterations: 3 });
    const standIns = gone.map(leaveDoor);
    after(50, () => {
      for (const m of [me, ...standIns]) {
        const a = fxAt(m); if (!a) continue;
        for (let i = 0; i < 7; i++) { const d = el('div', 'fxdot'); const sz = 3 + rnd(4); d.style.width = d.style.height = `${sz}px`; d.style.background = '#B8B2C8'; fxGo(d, a.x - a.size / 2 + rnd(Math.floor(a.size)), a.foot - 2, rnd(-22, 23), -10 - rnd(18), 700 + rnd(400), rnd(300), EASE.quadOut); }
      }
    });
    flinch();
    say(me, '🚪', `'${name}' 방이 사라졌어요! 방장이 방을 없앴어요.`, 10);
  });
  after(3000, () => { anim(sign, { opacity: [1, 0] }, 400); after(450, () => sign.remove()); });
}

// ── doors: a little door rises, swings open, someone steps through, it shuts and sinks ──
function doorEl(wd = 44, ht = 60) {
  const d = el('div', 'door'); d.style.width = `${wd}px`; d.style.height = `${ht}px`;
  d.innerHTML = '<div class="light"></div><div class="leaf"><div class="knob"></div></div>';
  d.style.transform = 'scaleY(0)';
  return { el: d, leaf: d.querySelector('.leaf') };
}
function openDoor(k) {
  anim(k.el, { transform: ['scaleY(0)', 'scaleY(1)'] }, 320, 0, EASE.back);
  anim(k.leaf, { transform: ['scaleX(1)', 'scaleX(.12)'] }, 300, 450);
  k.out(k.arg);
  after(1850, () => anim(k.leaf, { transform: ['scaleX(.12)', 'scaleX(1)'] }, 250));
  after(2250, () => anim(k.el, { transform: ['scaleY(1)', 'scaleY(0)'] }, 260));
  after(2600, () => k.done(k));
}
// A friend who comes in: a door rises right where they will sit, behind them, and they step out.
function enterDoor(m) {
  const k = doorEl(38, 50);
  k.el.style.left = `${(m.size + 6 - 38) / 2}px`; k.el.style.top = `${m.size + 4 - 50}px`;
  m.g.prepend(k.el);
  m.img.style.opacity = 0; m.nm.style.opacity = 0;
  k.out = () => after(800, () => stepOut(m)); k.done = () => k.el.remove();
  openDoor(k);
}
// Out of the doorway towards me: small at the back, full size at the front, a few steps.
function stepOut(m) {
  anim(m.img, { opacity: [0, 1] }, 200);
  anim(m.img, { transform: ['scale(.6)', 'scale(1)'] }, 600);
  anim(m.nm, { opacity: [0, 1] }, 300, 400);
  m.walkUntil = Date.now() + 700;
}
// Someone who left: a stand-in stays in their floor's group (or a spot of its own if they were
// its last) while a door opens behind them and they step back in.
function leaveDoor(o) {
  let at = S.rows.get(o.floor), spot = null;
  if (!at) { spot = el('div', 'grp'); at = el('div', 'grow'); spot.append(at); $('#row').insertBefore(spot, S.members.get('').col); }
  const m = member(o.who, o.name, o.kind, 36, o.floor, at);
  m.g.style.pointerEvents = 'none'; setFrame(m.img, 0);
  const k = doorEl(38, 50);
  k.el.style.left = `${(m.size + 6 - 38) / 2}px`; k.el.style.top = `${m.size + 4 - 50}px`;
  m.g.prepend(k.el);
  k.out = () => after(800, () => stepIn(m)); k.done = () => (spot || m.col).remove();
  openDoor(k);
  // The others see them off: a wave, a handkerchief, a tear or two (pet-fx.js).
  Mod.fx?.farewell?.(m);
  return m;
}
function stepIn(m) {
  anim(m.img, { transform: ['scale(1)', 'scale(.6)'] }, 600);
  anim(m.img, { opacity: [1, 0] }, 250, 400);
  anim(m.nm, { opacity: [1, 0] }, 300);
}
// On start a door rises a short walk left of my place, swings open, and I walk out of it to my
// place (the whole pet slides over, a small bob at every step); it shuts behind me and my friends hop in.
function fly() {
  S.fly = true;
  const me = S.members.get(''), dock = $('#dock'), dist = 170;
  me.col.style.opacity = 0;
  // The door stands behind me while I come out of it (the effects' layer is over the pets otherwise).
  document.body.classList.add('flying');
  S.walkMs = Math.max(1300, dist / 0.13); S.steps = Math.max(4, Math.round(dist / 18));
  dock.style.transform = `translateX(${-dist}px)`;
  const r = me.img.getBoundingClientRect();
  const k = doorEl();
  k.el.style.left = `${r.left + r.width / 2 + 8 - 22}px`; k.el.style.top = `${r.bottom - 60}px`;
  fxLayer.append(k.el);
  // Out of the doorway: small at the back, full size at the front, then the walk to my place.
  k.out = () => {
    after(800, () => {
      me.col.style.opacity = '';
      anim(me.img, { opacity: [0, 1] }, 200);
      anim(me.img, { transform: ['scale(.55)', 'scale(1)'] }, 600, 0, EASE.quadOut);
      anim(me.nm, { opacity: [0, 1] }, 300, 400);
      me.walkUntil = Date.now() + 700;
    });
    after(1150, () => walk(dock, dist));
  };
  k.done = () => { k.el.remove(); document.body.classList.remove('flying'); };
  openDoor(k);
}
function walk(dock, dist) {
  const t0 = performance.now();
  const step = (now) => {
    const t = clamp(0, 1, (now - t0) / S.walkMs);
    S.walking = t > 0 && t < 1;
    // Steady walking pace, easing only into the first and out of the last steps.
    let e = t < 0.15 ? (t * t) / 0.3 : t > 0.85 ? 0.925 - ((1 - t) * (1 - t)) / 0.3 : t - 0.075;
    e /= 0.925;
    const bob = 3 * Math.abs(Math.sin(Math.PI * t * S.steps));
    dock.style.transform = `translate(${-dist * (1 - e)}px, ${-bob}px)`;
    if (t < 1) requestAnimationFrame(step); else { dock.style.transform = ''; land(); }
  };
  requestAnimationFrame(step);
}
function land() {
  S.fly = false;
  for (const c of $('#row').children) c.style.visibility = '';
  let d = 120;
  for (const [k, m] of S.members) if (k) { pop(m.col, d); d += 90; }
  say('', '나', '왔어요!', 3);
}

// ── size and see-through levels ──
// The whole row (pets, names, bubbles, doors) zooms as one. Dragging the grip up-left makes it
// bigger, down-right smaller; Ctrl+wheel (a pinch on the trackpad) too. Saved on release.
function zoom(k) { S.k = clamp(0.5, 1.6, +k); document.documentElement.style.setProperty('--k', S.k); }
const saveZoom = () => call('api/pet', { scale: Math.round(S.k * 100) / 100 });
// The whole pet's level, kept on this PC like the chat's.
function petAlpha(a) { S.petA = clamp(0.3, 1, +a); document.documentElement.style.setProperty('--a', S.petA); }
const savePetAlpha = () => call('api/pet', { petAlpha: Math.round(S.petA * 100) / 100 });
// The chat box on its own: width and the height of its lines, dragged by the chip at its top left,
// and how see-through it is. Writing a note turns the box violet.
function chatSize(cw, ch, ca) {
  S.chatW = clamp(220, 560, +cw); S.chatH = clamp(80, 600, +ch); S.chatA = clamp(0.3, 1, +ca);
  const box = $('#chatbox');
  box.style.width = `${S.chatW}px`; $('#linesbox').style.height = `${S.chatH}px`;
  $('#chatbody').style.opacity = S.chatA; $('#tabs').style.opacity = S.chatA;
  box.classList.toggle('note', !!S.noteTo);
  box.style.background = `rgba(${S.noteTo ? '42, 34, 62' : '30, 27, 46'}, ${0.95 * S.chatA})`;
  const sl = $('#chatalpha input');
  if (Math.abs(sl.value - S.chatA * 100) > 0.5) setBar(sl, S.chatA * 100);
}
const saveChat = () => call('api/pet', { chatW: Math.round(S.chatW), chatH: Math.round(S.chatH), chatAlpha: S.chatA });
{
  // The row's grip.
  const grip = $('#grip');
  grip.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); grip.setPointerCapture(e.pointerId); grip.classList.add('held');
    S.rz = { x: e.screenX, y: e.screenY, k: S.k };
  });
  grip.addEventListener('pointermove', (e) => { if (S.rz) zoom(S.rz.k * (1 + ((S.rz.x - e.screenX) + (S.rz.y - e.screenY)) / 300)); });
  const up = () => { if (!S.rz) return; S.rz = null; grip.classList.remove('held'); saveZoom(); };
  grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  $('#dock').addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoom(S.k * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); saveZoom();
  }, { passive: false });
  // The chat's grip and its ◐.
  const cg = $('#chatgrip');
  cg.addEventListener('pointerdown', (e) => { e.stopPropagation(); cg.setPointerCapture(e.pointerId); cg.classList.add('held'); S.crz = { x: e.screenX, y: e.screenY, w: S.chatW, h: S.chatH }; });
  cg.addEventListener('pointermove', (e) => { if (S.crz) chatSize(S.crz.w + (S.crz.x - e.screenX), S.crz.h + (S.crz.y - e.screenY), S.chatA); });
  const cup = () => { if (!S.crz) return; S.crz = null; cg.classList.remove('held'); saveChat(); $('#linesbox').scrollTop = 1e9; };
  cg.addEventListener('pointerup', cup); cg.addEventListener('pointercancel', cup);
  const ca = $('#chatalpha'), cbar = $('#chatalpha .bar'), csl = $('#chatalpha input');
  setBar(csl, 100);
  ca.addEventListener('mouseenter', () => { cbar.hidden = false; });
  ca.addEventListener('mouseleave', () => { if (!S.cDrag) cbar.hidden = true; });
  csl.oninput = () => { S.cDrag = true; setBar(csl, csl.value); chatSize(S.chatW, S.chatH, csl.value / 100); };
  csl.onchange = () => { S.cDrag = false; saveChat(); if (!ca.matches(':hover')) cbar.hidden = true; };
  csl.onpointerdown = (e) => { e.stopPropagation(); S.cDrag = true; ca.classList.add('held'); };
  csl.onpointerup = () => ca.classList.remove('held');
}

// ── 💬 the chat box ──
// The room's talk (one room: the one I am in). Rebuilt only when the lines change, so pictures do
// not flicker.
function showChat() {
  renderTabs();
  if (S.noteTo) return showNotes();
  const lines = (S.st?.chat || []).filter((l) => l.floor === to()).slice(-30);
  const sig = `${to()}|${lines.map((l) => l.id).join(',')}`;
  if (sig === S.linesSig) return;
  S.linesSig = sig;
  const box = $('#lines');
  box.replaceChildren();
  if (!lines.length) {
    box.append(chatLine(`이 방은 아직 조용합니다. 여기 적으면 ${to()} 방에 올라갑니다. 이미지는 ⌘V`));
    return;
  }
  for (const l of lines) {
    box.append(chatLine(l.text, l.mine ? '나' : l.name, l.mine, !!l.me));
    if (l.img) box.append(picLine(l.img));
  }
  box.parentElement.scrollTop = 1e9;
}
// The name in its own colour (mine green, others violet); a line that calls me by name in yellow.
function chatLine(text, name = null, mine = false, called = false) {
  const t = el('div', `line ${mine ? 'mine' : ''} ${called ? 'called' : ''}`);
  if (name) { const b = el('b'); b.textContent = name; t.append(b); }
  t.insertAdjacentHTML('beforeend', tagged(text));
  return t;
}
function picLine(src) {
  const im = el('img', 'pic'); im.src = src; im.style.maxWidth = `${S.chatW - 50}px`; im.title = '눌러서 크게 보기';
  im.onclick = () => window.open(src);
  return im;
}
function toggleChat(open) {
  const chat = $('#chat');
  if (open) {
    if (!S.pick) S.pick = S.floor;
    const was = !chat.hidden;
    showChat(); chat.hidden = false; if (!was) pop(chat, 0, 10);
    const me = S.members.get(''); if (me?.dot) me.dot.hidden = true;
    $('#input').focus();
  } else { chat.hidden = true; S.pick = null; S.linesSig = ''; S.armed = false; dropPic(); }
}
// ✉️ 쪽지 and the floor's talk are two tabs under the box, so where Enter goes is never a guess:
// the note tab turns the whole box violet, and the empty box says who will read it. Right after
// going back to the floor, the first Enter only asks (see sendLine).
const floorCount = (fl) => (S.st?.friends || []).filter((f) => f.floor === fl).length + 1;
function tab(text, on, note, tip) {
  const b = el('div', `tab ${on ? 'on' : ''} ${note ? 'note' : ''}`); b.textContent = text; b.title = tip;
  return b;
}
function toFloor() {
  if (S.noteTo) { S.noteTo = null; S.warnUntil = Date.now() + 30_000; }
  S.armed = false; S.linesSig = ''; showChat(); $('#input').focus();
}
function renderTabs() {
  const note = S.noteTo, fl = to(), n = floorCount(fl);
  const sig = `${note?.who}|${S.noteTab?.who}|${fl}|${n}|${S.armed}`;
  if (sig !== S.tabSig) {
    S.tabSig = sig;
    const tabs = $('#tabs');
    tabs.replaceChildren();
    const ft = tab(`📢 ${fl} 전체 · ${n}명`, !note, false, '눌러서 방 대화로');
    ft.onclick = () => toFloor();
    tabs.append(ft);
    if (S.noteTab) {
      const nt = tab(`✉️ ${S.noteTab.name}`, !!note, true, `${S.noteTab.name} 님에게만 가는 쪽지`);
      const x = el('span', 'x'); x.textContent = '✕'; x.title = '쪽지 탭 닫기';
      x.onclick = (e) => { e.stopPropagation(); S.noteTab = null; toFloor(); };
      nt.append(x);
      nt.onclick = () => { if (!S.noteTo) { S.noteTo = S.noteTab; S.armed = false; S.linesSig = ''; showChat(); $('#input').focus(); } };
      tabs.append(nt);
    }
    $('#hint').textContent = note ? `🔒 ${note.name} 님에게만 보입니다` : `📢 ${fl} 방 ${n}명 모두에게 보입니다`;
    const tg = $('#target');
    tg.hidden = !S.armed;
    if (S.armed) { tg.className = 'armed'; tg.textContent = `📢 ${fl} 방 ${n}명 모두에게 보냅니다. 맞으면 Enter 한 번 더 (쪽지는 아래 ✉️ 탭)`; }
  }
  chatSize(S.chatW, S.chatH, S.chatA);
}
function warn(msg) { const t = $('#target'); t.hidden = false; t.className = 'warn'; t.textContent = msg; }
function info(msg) { const t = $('#target'); t.hidden = false; t.className = ''; t.textContent = msg; }
// Enter: a line to the floor, a note, or a command. A failed send keeps the text.
async function sendLine() {
  const input = $('#input');
  let t = input.value.trim();
  if (!t && !S.pend) return;
  if (!S.armed) $('#target').hidden = true;
  if (/^\/(명령|도움|help)$/.test(t)) { info('명령: /낚시 (찌가 쑥 들어가면 펫 클릭!) /도감 /강화 /낚시대회 · /폭죽 /박수 /하트 /ㅋㅋ /춤 (같이 추기) · /눈사람 (다 같이) · /비 /눈 (다 같이 우산, /우산 은 빙글) · /r 답장 · /쪽지 이름 할 말'); input.value = ''; return; }
  // 🎣 /낚시 casts from my pet, /도감 opens the picture book (here only, nothing is said).
  if (/^\/(낚시|낚싯대)$/.test(t)) { input.value = ''; Mod.fish?.cast?.(); return; }
  if (/^\/(도감|물고기)$/.test(t)) { input.value = ''; Mod.fish?.book?.(); return; }
  // /강화, /낚시대회, /눈사람 and the like: whichever module knows the word (true when it took it).
  if (/^\/\S+$/.test(t) && [Mod.fish, Mod.games, Mod.smack, Mod.snow].some((md) => md?.command?.(t))) { input.value = ''; return; }
  // 🎆 "/폭죽" and the like play for the floor I am talking to, whichever tab is open.
  const fx = t.match(/^\/(\S+)$/);
  if (fx && FX_CMDS.includes(fx[1])) {
    if (!to()) return;
    const r = await ask('api/chat', { floor: to(), text: t });
    if (r.error) warn(`⚠ ${r.error}`); else input.value = '';
    return;
  }
  if (/^\/[^\s/]+$/.test(t) && !/^\/(r|w|쪽지)$/.test(t)) { warn('⚠ 모르는 명령이에요 — /명령 으로 목록을 볼 수 있어요'); return; }
  // "/r 할 말" answers the last note I got; "/쪽지 이름 할 말" (or "/w") writes to someone here.
  const nt = t.match(/^\/(r|w|쪽지)(?:\s+|$)(.*)$/);
  if (nt) {
    const cmd = nt[1], rest = nt[2];
    const dest = cmd === 'r' ? lastNoteFrom() : personNamed(rest.split(/\s+/)[0]);
    if (!dest) { warn(cmd === 'r' ? '⚠ 답장할 쪽지가 없습니다' : '⚠ 이 층에 그 이름의 사람이 없습니다'); return; }
    S.noteTo = dest; S.noteTab = dest; S.armed = false; S.linesSig = '';
    t = cmd === 'r' ? rest.trim() : rest.replace(/^\S+\s*/, '').trim();
    if (!t && !S.pend) { input.value = ''; showChat(); return; }
  }
  if (S.noteTo) {
    const body = { floor: S.noteTo.floor, to: S.noteTo.who, toName: S.noteTo.name, text: t, ...(S.pend ? { image: S.pend } : {}) };
    const r = await call('api/note', body);
    if (r.ok) { input.value = ''; dropPic(); } else warn(`⚠ ${S.noteTo.name} 님에게 쪽지를 보내지 못했습니다 (지금 그 층에 없을 수 있어요)`);
    return;
  }
  if (!to()) return;
  if (Date.now() < S.warnUntil && !S.armed) { S.armed = true; renderTabs(); return; }
  S.armed = false; S.warnUntil = 0;
  const r = await call('api/chat', { floor: to(), text: t, ...(S.pend ? { image: S.pend } : {}) });
  if (r.ok) { input.value = ''; dropPic(); } else if (S.pend) warn(`⚠ 이미지를 보내지 못했습니다 (${r.error})`); else warn(`⚠ ${r.error}`);
  renderTabs();
}
// ✉️ 쪽지: to one person only (the server hands it to their PC alone).
function lastNoteFrom() {
  const n = (S.st?.notes || []).filter((x) => x.dir === 'in').at(-1);
  return n ? { who: n.who, name: n.name, floor: n.floor } : null;
}
function personNamed(word) {
  const w = String(word || '').replace(/^@/, '').toLowerCase();
  if (!w) return null;
  const m = [...S.members.values()].find((x) => x.who && x.floor === to() && (x.name.toLowerCase() === w || x.name.split(/[\s(]/)[0].toLowerCase() === w));
  return m ? { who: m.who, name: m.name, floor: m.floor } : null;
}
function noteTo(dest) {
  S.noteTo = dest; S.noteTab = dest; S.armed = false; S.linesSig = ''; toggleChat(true);
  after(80, () => $('#input').focus());
}
function showNotes() {
  const dest = S.noteTo;
  const lines = (S.st?.notes || []).filter((n) => n.who === dest.who).slice(-10);
  const sig = `note|${dest.who}|${lines.map((l) => l.id).join(',')}`;
  if (sig === S.linesSig) return;
  S.linesSig = sig;
  const box = $('#lines');
  box.replaceChildren();
  if (!lines.length) { box.append(chatLine(`여기 적으면 ${dest.name} 님에게만 갑니다. 다른 사람에게는 보이지 않아요.`)); return; }
  for (const l of lines) {
    const line = chatLine(l.text, l.dir === 'out' ? '나' : l.name, l.dir === 'out');
    if (l.dir === 'in') line.classList.add('in');
    box.append(line);
    if (l.img) box.append(picLine(l.img));
  }
  box.parentElement.scrollTop = 1e9;
}
// A pasted picture is held above the box: Enter sends it with whatever is typed, ✕ or Esc drops it.
// Shrunk to 800 px on its longest side and saved as JPEG, the way the server expects.
function dropPic() { S.pend = null; $('#pend-img').src = ''; $('#pend').hidden = true; }
function holdPic(file) {
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 800 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    S.pend = c.toDataURL('image/jpeg', 0.85);
    $('#pend-img').src = S.pend; $('#pend').hidden = false; $('#input').focus();
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => warn('⚠ 이미지를 보내지 못했습니다 (클립보드 이미지를 읽지 못함)');
  img.src = URL.createObjectURL(file);
}
// "@이름" of someone on the floor I am talking to turns mint while I type: a shade repeats the
// line over the box with only those drawn. A line longer than the box scrolls inside it, where
// the shade cannot follow: then none.
// ⏎ Enter in a text box, safe with the Korean input method. On the Mac a syllable being typed (조합
// 중인 글자) is still open when Enter is pressed: Chrome there sends Enter while it is open, then
// again once it is written, and clearing the box in between makes the input method put the
// syllable back — so a line went without its last syllable, or it stayed behind in the box. Here
// an Enter during typing waits for the syllable to be written, and the line goes a moment after,
// once; a second Enter for the same line is ignored.
function onEnter(box, run, { keys = null } = {}) {
  let typing = false, waiting = false, last = 0;
  const go = () => { if (Date.now() - last < 250) return; last = Date.now(); setTimeout(run, 0); };
  box.addEventListener('compositionstart', () => { typing = true; });
  box.addEventListener('compositionend', () => { typing = false; if (waiting) { waiting = false; go(); } });
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') { if (!e.isComposing && !typing) keys?.(e); return; }
    // While typing, the key is the input method's (it writes the syllable): left alone.
    if (e.isComposing || typing || e.keyCode === 229) { waiting = true; return; }
    e.preventDefault();
    go();
  });
}

function markAt() {
  const input = $('#input'), shade = $('#shade');
  const names = ['all', '모두', '전체', ...[...S.members.values()].filter((m) => m.who && m.floor === to()).flatMap((m) => [m.name, m.name.split(/[\s(]/)[0]]).filter(Boolean).map((s) => s.toLowerCase())];
  let any = false;
  shade.innerHTML = input.value.split(/(@[^\s@]{1,20})/).map((part) => {
    const who = part.startsWith('@') ? part.slice(1).toLowerCase() : null;
    if (who && names.some((n) => who.startsWith(n))) { any = true; return `<span class="at">${esc(part)}</span>`; }
    return esc(part);
  }).join('');
  shade.hidden = !(any && input.scrollWidth <= input.clientWidth + 1);
  $('#hint').hidden = !!input.value;
}
{
  const input = $('#input');
  input.addEventListener('input', markAt);
  input.addEventListener('scroll', markAt);
  onEnter(input, sendLine, { keys: (e) => { if (e.key === 'Escape') { if (S.pend) dropPic(); else toggleChat(false); } } });
  input.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))?.getAsFile();
    if (f) { e.preventDefault(); holdPic(f); }
  });
  $('#pend-x').onclick = () => { dropPic(); input.focus(); };
}

// ── the right-click menu: the panels' dark rounded look, with submenus ──
// items: { text, run, checked, tip, off, sub: [...] } · { head } · { sep } · { foot } (the see-through bar).
const menuRuns = new Map();
function menuHtml(items) {
  return `<div class="mbox">${items.map((it) => {
    if (it.sep) return '<div class="msep"></div>';
    if (it.head) return `<div class="mhead">${esc(it.head)}</div>`;
    if (it.foot) return '<div class="mfoot" title="전체 진하기 (펫·대화창·게임)"><span class="ic">◐</span><span class="foot"></span></div>';
    // The animals themselves, small, the picked one framed in gold: a name alone says little.
    if (it.kinds) return `<div class="kinds mkinds">${it.kinds.map((k) => `<div class="kind ${k.kind === it.kind ? 'on' : ''}" data-kind="${esc(k.kind)}" title="${esc(k.name)}"><div class="face" style="background-image:${spriteUrl(k.kind)}"></div></div>`).join('')}</div>`;
    const id = menuRuns.size; menuRuns.set(id, it.run);
    return `<div class="mi ${it.checked ? 'checked' : ''} ${it.off ? 'off' : ''}" data-i="${id}" title="${esc(it.tip || '')}"><span class="ck">✓</span><span>${esc(it.text)}</span>${it.sub ? `<span class="ar">›</span><div class="msub">${menuHtml(it.sub)}</div>` : '<span></span>'}</div>`;
  }).join('')}</div>`;
}
function openMenu(x, y, p, anchor = null) {
  const st = S.st || { kinds: [] };
  const items = [];
  if (p) {
    // Someone else's pet: only what I can do with them — a note, a game for two, a smack, a snowball.
    items.push({ head: `${p.name} 님` }, { text: '✉️ 쪽지 보내기', run: () => noteTo(p) });
    items.push(...(Mod.games?.menuFor?.(p) || []));
    // 🦶 Send them flying (at a hoop, a hole, or to space) and ❄️ throw a snowball at them.
    items.push(...(Mod.smack?.menuFor?.(p) || []), ...(Mod.snow?.menuFor?.(p) || []));
  } else {
    // My own pet: the room's games and fishing, my room, my animal, the settings, and the app.
    items.push(...(Mod.games?.menu?.() || []));
    items.push(...(Mod.fish?.menu?.() || []));
    items.push({ sep: true });
    // 🚪 My room: its invite link (mine), or the way to another room and out (someone else's).
    if (st.setup) items.push({ text: '👋 시작하기', run: () => openStart('member') });
    else items.push({ text: '🚪 내 방…', run: () => openStart('rooms') });
    // The animals open beside the menu as a grid of faces; the settings fold into one submenu, so
    // the menu itself stays short.
    items.push({ text: '🐾 내 동물', sub: [{ kinds: st.kinds, kind: st.kind }] });
    const settings = [
      { text: '💬 대화창 크기 처음대로', run: () => { chatSize(250, 160, S.chatA); saveChat(); } },
      { text: '💭 말풍선으로 보기', checked: !!st.bubbles, tip: '끄면 새 대화가 와도 빨간 점만', run: () => call('api/pet', { bubbles: !st.bubbles }) },
      { text: '🔕 알림 끄기', checked: !!st.quiet, run: () => call('api/notify', { quiet: !st.quiet }) },
      { text: '🦶 날려버리기 안 받기', checked: !!st.smackOff, tip: '켜면 다른 사람이 나를 날려버릴 수 없어요', run: () => call('api/pet', { smackOff: !st.smackOff }) },
      { text: '🎆 남이 쓴 효과 끄기', checked: !!st.fxOff, tip: '/폭죽 · /춤 같은 채팅 효과를 내 화면에서만 끕니다 (대화창 줄은 그대로)', run: () => call('api/pet', { fxOff: !st.fxOff }) },
    ];
    if (st.news) settings.push({ text: '📦 이번 업데이트 보기', run: () => showNews(st.news, true) });
    items.push({ text: '⚙️ 설정', sub: settings });
    if (app) items.push({ sep: true }, { text: '🙈 잠깐 숨기기   ⌃⌥Z', run: () => app.hide() }, { text: '⏻ 팀 펫 끄기', run: () => app.quit() });
    items.push({ foot: true });
  }
  menuRuns.clear();
  const m = $('#menu');
  m.innerHTML = menuHtml(items);
  if (app?.mouse) { app.mouse(true); S.over = true; }
  // At the very bottom: the whole window's level, ◐ then the bar, on one dark strip.
  $('.foot', m)?.replaceWith(bar(S.petA * 100, 120, (a) => { S.aDrag = true; petAlpha(a); }, () => { S.aDrag = false; savePetAlpha(); }));
  for (const k of $$('.mkinds .kind', m)) k.onclick = async (e) => { e.stopPropagation(); closeMenu(); await call('api/pet', { kind: k.dataset.kind }); poll(); };
  m.hidden = false; S.menuOpen = true;
  // Over the pet it was opened on, like the Dock's menus: centred on it, rising from its head, a
  // small tail pointing at it. Without room above, beside it on the left; without a pet, at the click.
  const w = m.offsetWidth, h = m.offsetHeight, a = anchor?.getBoundingClientRect();
  $('.caret', m)?.remove();
  let left, top;
  if (a && a.top - h - 10 >= 4) {
    left = clamp(4, window.innerWidth - w - 4, a.left + a.width / 2 - w / 2); top = a.top - h - 10;
    const c = el('div', 'caret'); c.style.left = `${a.left + a.width / 2 - left - 6}px`; m.firstElementChild.append(c);
  } else if (a) {
    left = clamp(4, window.innerWidth - w - 4, a.left - w - 8); top = clamp(4, window.innerHeight - h - 4, a.bottom - h);
  } else {
    left = clamp(4, window.innerWidth - w - 4, x); top = clamp(4, window.innerHeight - h - 4, y - h);
  }
  m.style.left = `${left}px`; m.style.top = `${top}px`;
  // A submenu opens to the right, or to the left without room there (the arrow turns with it),
  // and is lifted so none of it hangs below the screen. Brushing a neighbour on the way into an
  // open submenu does not close it: a switch waits a moment, and entering the submenu cancels it.
  let switching = null;
  const placeSub = (mi, sub) => {
    sub.classList.remove('left'); sub.style.top = '';
    const left = sub.getBoundingClientRect().right > window.innerWidth - 4;
    sub.classList.toggle('left', left);
    mi.querySelector(':scope > .ar').textContent = left ? '‹' : '›';
    const over = sub.getBoundingClientRect().bottom - (window.innerHeight - 4);
    if (over > 0) sub.style.top = `${-9 - over}px`;
  };
  for (const mi of $$('.mi', m)) {
    const sub = mi.querySelector(':scope > .msub');
    mi.addEventListener('mouseenter', () => {
      clearTimeout(switching);
      const open = () => {
        for (const o of mi.parentElement.querySelectorAll(':scope > .mi.open')) if (o !== mi) o.classList.remove('open');
        if (!sub) return;
        mi.classList.add('open'); placeSub(mi, sub);
      };
      const other = mi.parentElement.querySelector(':scope > .mi.open');
      if (other && other !== mi) switching = setTimeout(open, 300); else open();
    });
    mi.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (sub) { clearTimeout(switching); mi.classList.toggle('open'); if (mi.classList.contains('open')) placeSub(mi, sub); return; }
      closeMenu();
      await menuRuns.get(Number(mi.dataset.i))?.();
      poll();
    });
  }
}
// A click anywhere else, Escape, or another app taking the focus closes it. While it is open the
// Mac window takes every click (see the mousemove hook below), or a click on the clear part of
// the window would go through to the desktop and the menu would stay.
// Closing forgets what the window last told the app, so the next mouse move decides afresh
// (the pointer may well be over a pet, which must keep taking clicks).
function closeMenu() { $('#menu').hidden = true; S.menuOpen = false; S.over = null; }
document.addEventListener('mousedown', (e) => { if (S.menuOpen && !e.target.closest('#menu')) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('blur', () => { if (S.menuOpen) closeMenu(); });

// 💨 날리기: the floor sees them fly (pet-fx.js) and land back; one a person in ten seconds.
async function fling(p) {
  const r = await ask('api/fling', { floor: p.floor, who: p.who });
  if (r.error) say('', '💨', `⚠ ${r.error}`, 5);
}

// 🛸 Out of the room I am in, into another, by UFO: go() does the move itself while I am aboard
// (it answers with the new room's name, or throws); the row changes quietly meanwhile (castQuiet),
// and the UFO brings the new people in as it sets me down.
async function travel(go) {
  if (S.moving) return;
  const quiet = async () => {
    const name = await go();
    S.pick = null; S.linesSig = ''; S.tabSig = '';
    S.castQuiet = true;
    try { await poll(); } finally { S.castQuiet = false; }
    return name;
  };
  if (!Mod.fx?.ufo || !S.members.get('')) {
    try { say('', '🚪', `'${await quiet()}' 방으로 이동했어요`, 5); } catch (e) { say('', '🚪', `⚠ ${e.message}`, 5); }
    return;
  }
  S.moving = true;
  try { await Mod.fx.ufo(S.floor || '', quiet); } finally { S.moving = false; }
}
// One of my own floors by its joined flag, another PC's room by its number in my list.
function moveRoom(r) {
  if (r.current) return;
  return travel(async () => {
    const x = r.own ? await ask('api/floors', { name: r.name, joined: true }, 'PUT') : await ask('api/links', { switch: r.i });
    if (x.error) throw new Error(x.error);
    return r.name;
  });
}

// ── 👋 the first run, another room, my room ──
// member: the first run offers two ways in — paste the invite link someone sent (join), or make the
// team's room (hub: this PC is its hub, and the server starts again as one). Later, join moves me
// to another room in place of this one.
function sText(text, cls = '') { const t = el('div', `stext ${cls}`); t.textContent = text; return t; }
function sBox(text, max) { const b = el('input', 'sbox'); b.type = 'text'; b.value = text; b.maxLength = max; return b; }
function sKinds() {
  const wp = el('div', 'kinds');
  for (const o of S.st?.kinds || []) {
    const k = el('div', `kind ${o.kind === S.start.kind ? 'on' : ''}`); k.title = o.name;
    const face = el('div', 'face'); face.style.backgroundImage = spriteUrl(o.kind); k.append(face);
    k.onclick = () => { S.start.kind = o.kind; for (const x of wp.children) x.classList.toggle('on', x === k); };
    wp.append(k);
  }
  return wp;
}
function openStart(mode) {
  const st = S.st || {};
  S.start = { mode, kind: st.kind, way: 'join' };
  const body = $('#start-body');
  body.replaceChildren();
  const first = mode === 'member' || mode === 'hub';
  if (mode === 'codes') mode = 'rooms';
  S.start.mode = mode;
  $('#start-title').textContent = { member: '👋 팀 펫 시작하기', join: (st.rooms || []).length ? '🔗 다른 방으로 옮기기' : '🔗 참가 링크로 들어가기', hub: '🏠 우리 팀 방 만들기', rooms: '🚪 내 방' }[mode];
  const show = () => { const p = $('#start'); if (p.hidden) { p.hidden = false; pop(p, 0, 10); } };
  if (mode === 'rooms') { drawRooms(); show(); return; }
  const lead = { member: '팀원이 보낸 참가 링크가 있으면 붙여 넣고, 우리 팀 방이 아직 없으면 새로 만들어요. 방을 만든 PC 가 그 방의 서버가 돼요.', hub: '이 PC 가 방장입니다. 방을 만들면 팀원에게 보낼 참가 링크가 나와요.', join: (st.rooms || []).length ? '옮겨 갈 방의 참가 링크를 붙여 넣어 주세요. 지금 방에서는 나가게 돼요.' : '들어갈 방의 참가 링크를 붙여 넣어 주세요.' }[mode];
  body.append(sText(lead));
  if (first) { body.append(sText('대화에 보일 내 이름', 'label')); S.start.name = sBox(st.myName || '', 30); body.append(S.start.name); }
  if (mode === 'member') {
    const ways = el('div', 'ways'); S.start.wayBtns = {};
    for (const [way, text] of [['join', '🔗 참가 링크로 들어가기'], ['make', '🏠 우리 팀 방 만들기']]) {
      const b = btn(text, () => startWay(way), '#221F33'); S.start.wayBtns[way] = b; ways.append(b);
    }
    body.append(ways);
  }
  const naming = mode === 'hub';
  S.start.codeLabel = sText(naming ? '방 이름 (예: 개발팀)' : '참가 링크 (http://… 통째로 붙여 넣기)', 'label'); body.append(S.start.codeLabel);
  S.start.code = sBox('', naming ? 30 : 200); body.append(S.start.code);
  onEnter(S.start.code, startGo);
  if (first) { body.append(sText('내 동물', 'label'), sKinds()); }
  S.start.note = sText('', 'note'); body.append(S.start.note);
  const row = el('div', 'srow');
  S.start.go = btn(naming ? '방 만들기' : '들어가기', startGo, '#3B7DD8'); row.append(S.start.go);
  if (!first) row.append(btn('닫기', () => { $('#start').hidden = true; }));
  body.append(row);
  if (mode === 'member') startWay('join');
  show();
  // An invite link on the clipboard (copied from the invite page) goes in by itself, once the box
  // is up (the app answers a moment later; without one, the box simply waits for a paste).
  if (!naming) {
    const code = S.start.code;
    Promise.resolve().then(() => app?.clipboard?.()).then((clip) => {
      clip = String(clip || '').trim();
      if (code.value || !/^https?:\/\/\S+[?&](code|key)=\S+$/.test(clip)) return;
      code.value = clip; S.start.note.className = 'stext note ok'; S.start.note.textContent = '복사해 둔 참가 링크를 넣어 두었어요. 들어가기를 눌러 주세요.';
    }).catch(() => {});
  }
  after(80, () => (first && !S.start.name.value ? S.start.name : S.start.code).focus());
}
// 🔗 or 🏠 on the first run: the box asks for the invite link, or for the new room's name.
function startWay(way) {
  const s = S.start; s.way = way; const make = way === 'make';
  for (const [k, b] of Object.entries(s.wayBtns)) b.style.background = k === way ? '#3B7DD8' : '#221F33';
  s.codeLabel.textContent = make ? '방 이름 (예: 개발팀)' : '참가 링크 (http://… 통째로 붙여 넣기)';
  s.code.maxLength = make ? 30 : 200;
  s.go.textContent = make ? '방 만들기' : '들어가기';
  s.note.textContent = '';
}
async function startGo() {
  const s = S.start, code = s.code.value.trim(), name = s.name ? s.name.value.trim() : '';
  const make = s.mode === 'hub' || (s.mode === 'member' && s.way === 'make');
  s.note.className = 'stext note';
  if (s.name && !name) { s.note.textContent = '이름을 적어 주세요'; return; }
  if (!code) { s.note.textContent = make ? '방 이름을 적어 주세요' : '참가 링크를 붙여 넣어 주세요'; return; }
  s.note.className = 'stext note ok'; s.note.textContent = make ? '만드는 중…' : '방을 찾는 중… (몇 초 걸릴 수 있어요)';
  if (s.kind && s.kind !== S.st.kind) await call('api/pet', { kind: s.kind });
  let r;
  if (make) {
    r = await ask('api/config', { user: { name } });
    if (!r.error) r = await ask('api/floors', { name: code });
  } else {
    r = await ask('api/links', { code, ...(name ? { name } : {}) });
  }
  if (r.error) { s.note.className = 'stext note'; s.note.textContent = `⚠ ${r.error}`; return; }
  const made = `'${code}' 방을 만들었어요! 위 참가 링크를 팀원에게 보내 주세요.`;
  // Already running as a hub (no room yet): the room is simply there.
  if (make && S.st?.hub) { await poll(); openStart('rooms'); copyInvite(code, made); return; }
  // 🛸 Already in a room: off to the other one by UFO (the box closes; a wrong link is said over me).
  if (!make && S.floor && (S.st?.rooms || []).length) {
    $('#start').hidden = true;
    const body = { code, ...(name ? { name } : {}) };
    await travel(async () => { const x = await ask('api/links', body); if (x.error) throw new Error(x.error); return x.joined; });
    return;
  }
  if (make) {
    // The first room of mine: the server is starting again as its hub (a few seconds); then the room's invite link.
    s.note.textContent = `'${code}' 방을 만들었어요! 서버를 다시 켜는 중… 잠시만요`;
    for (let i = 0; i < 40; i++) {
      await new Promise((ok) => setTimeout(ok, 1000));
      const p = await call('api/pet');
      if (p.ok && p.data.hub) { S.st = p.data; openStart('rooms'); copyInvite(code, made); return; }
    }
    s.note.className = 'stext note'; s.note.textContent = '아직 다시 켜지지 않았어요. 팀 펫을 끄고 다시 켜 주세요';
    return;
  }
  $('#start').hidden = true;
  await poll();
  say('', '👋', `'${r.joined}' 방에 들어왔어요! 나를 누르면 대화창이 열려요.`, 10);
}
// A room just made: its invite link goes straight to the clipboard, ready to paste to the team.
async function copyInvite(name, made) {
  const r = await call('api/floors');
  const f = r.ok && r.data.floors.find((x) => x.name === name);
  if (f?.invite) {
    try { await navigator.clipboard.writeText(f.invite); say('', '🏠', `'${name}' 방을 만들고 참가 링크를 복사했어요! 팀원에게 붙여 넣어 보내 주세요.`, 10); return; } catch {}
  }
  say('', '🏠', made, 8);
}
// 🚪 내 방: the room I am in. My own (🏠, this PC its hub): the invite link to copy, a fresh code,
// delete (pressed twice). Another PC's: off to another room by its invite link, or out.
async function drawRooms() {
  const st = S.st || {}, hub = !!st.hub, body = $('#start-body');
  body.replaceChildren();
  const codes = hub ? (await call('api/floors')).data?.floors || [] : [];
  const note = sText('', 'note');
  const show = (c) => (c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c);
  body.append(sText(hub ? '[🔗 링크 복사] 로 참가 링크를 팀원에게 보내 주세요. 링크는 7일 동안 쓸 수 있고, [새 코드] 를 누르면 예전 링크는 더 안 돼요.' : '다른 방의 참가 링크를 받았으면 그 방으로 옮길 수 있어요. 나간 방에는 참가 링크로 다시 들어올 수 있어요.'));
  for (const r of st.rooms || []) {
    const f = r.own && codes.find((x) => x.name === r.name);
    const room = el('div', `room ${r.current ? 'here' : ''}`);
    const head = el('b'); head.textContent = `${r.current ? '✓ ' : ''}${r.own ? '🏠 ' : ''}${r.name || '(이름 모름)'}${r.count ? ` · ${r.count}명` : ''}`;
    head.title = r.current ? '지금 있는 방' : '누르면 이동'; head.className = r.current ? '' : 'go';
    head.onclick = () => { if (!r.current) moveRoom(r); };
    room.append(head);
    if (f) {
      const left = Math.ceil((f.codeUntil - Date.now()) / 86_400_000);
      const c = el('span', `code ${left > 0 ? '' : 'old'}`); c.textContent = `${show(f.code || '')} · ${left > 0 ? `${left}일 남음` : '기간 지남'}`;
      room.append(c);
    }
    const row = el('div', 'srow');
    if (f) {
      // ✏️ A new name for the room, typed right here.
      row.append(btn('✏️ 이름', () => {
        if (room.querySelector('.rename')) return;
        const rn = el('div', 'srow rename'), inp = sBox(f.name, 30);
        const ok = async () => {
          const to = inp.value.trim();
          if (!to || to === f.name) { rn.remove(); return; }
          const x = await ask('api/floors', { name: f.name, rename: to }, 'PUT');
          if (x.error) { note.textContent = `⚠ ${x.error}`; return; }
          await poll(); drawRooms(); say('', '🏷', `방 이름을 '${to}' 로 바꿨어요.`, 6);
        };
        onEnter(inp, ok);
        rn.append(inp, btn('확인', ok, '#3B7DD8'), btn('취소', () => rn.remove()));
        room.append(rn); inp.focus(); inp.select();
      }));
      row.append(btn('🔗 링크 복사', async () => {
        if (!(f.codeUntil > Date.now())) { note.textContent = `'${f.name}' 방 코드는 기간이 지났어요. [새 코드] 를 눌러 주세요.`; return; }
        try { await navigator.clipboard.writeText(f.invite); say('', '🔗', `'${f.name}' 방 참가 링크를 복사했어요. 팀원에게 붙여 넣어 보내 주세요`, 6); }
        catch { note.className = 'stext note ok'; note.textContent = `참가 링크: ${f.invite}`; }
      }, '#3B7DD8'), btn('새 코드', async () => {
        const x = await ask('api/floors', { name: f.name, code: true }, 'PUT');
        if (x.error) { note.textContent = `⚠ ${x.error}`; return; }
        drawRooms(); say('', '🔑', `'${f.name}' 방에 새 코드를 만들었어요. 예전 코드는 이제 안 돼요.`, 6);
      }));
      const del = btn('삭제', async () => {
        if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = '정말 지울까요?'; del.style.background = '#B54A4A'; note.textContent = '한 번 더 누르면 방이 사라지고, 들어와 있던 사람들은 모두 나가게 돼요.'; return; }
        const x = await ask('api/floors', { name: f.name }, 'DELETE');
        if (x.error) { note.textContent = `⚠ ${x.error}`; return; }
        await poll(); drawRooms(); say('', '🚪', `'${f.name}' 방을 없앴어요.`, 6);
      });
      row.append(del);
    } else if (!r.own) {
      row.append(btn('🔗 다른 방으로 옮기기', () => openStart('join'), '#3B7DD8'), btn('나가기', async () => {
        const x = await ask('api/links', { leave: r.i });
        if (x.error) { note.textContent = `⚠ ${x.error}`; return; }
        await poll();
        if (!(S.st?.rooms || []).length) { $('#start').hidden = true; S.startAuto = false; say('', '🚪', `'${r.name}' 방에서 나왔어요. 이제 들어간 방이 없어요.`, 6); return; }
        drawRooms(); say('', '🚪', `'${r.name}' 방에서 나왔어요.`, 6);
      }));
    }
    room.append(row); body.append(room);
  }
  if (!(st.rooms || []).length) body.append(sText('아직 방이 없어요.'), btn('👋 시작하기', () => openStart('member'), '#3B7DD8'));
  const foot = el('div', 'srow');
  foot.append(btn('닫기', () => { $('#start').hidden = true; }));
  body.append(note, foot);
}

// ── 📦 after an update, what changed, once ──
// Folded it is one line, a click unfolds all of it, and ✕ (or 15 s folded and untouched) puts it
// away for good. The menu shows the newest again any time.
function newsText() {
  const items = S.news.items;
  $('#news-title').textContent = `📦 업데이트됐어요 · ${items.map((i) => i.date).join(', ')}`;
  const list = $('#news-list'), text = $('#news-text');
  list.replaceChildren(); text.hidden = S.newsOpen; list.hidden = !S.newsOpen;
  if (S.newsOpen) {
    for (const it of items) {
      if (items.length > 1) { const d = el('div', 'date'); d.textContent = `[${it.date}]`; list.append(d); }
      for (const l of it.lines) { const d = el('div'); d.textContent = l; d.style.marginTop = '5px'; list.append(d); }
    }
    const f = el('div', 'fold'); f.textContent = '▴ 접기'; list.append(f);
  } else {
    text.textContent = `${items[0].head}${items.length > 1 ? ` · 이전 업데이트 ${items.length - 1}개 더` : ''}  ▾`;
  }
}
const newsClock = () => { S.newsUntil = S.newsOpen ? Infinity : Date.now() + 15_000; };
function showNews(v, open) {
  if (!v) return;
  S.news = v; S.newsOpen = !!open; newsText(); newsClock();
  const p = $('#news'); if (p.hidden) { p.hidden = false; pop(p, 0, 10); }
}
// 🆕 A newer release. The Mac app is one signed bundle, so its new version is downloaded by hand:
// 받기 opens the download page. Elsewhere (Windows, in a browser) 지금 업데이트 puts it in and the
// program starts again on it. 나중에 puts it off until the program starts again.
function showUpdate(u) {
  const box = $('#upd'), buttons = $('#upd-buttons');
  $('#upd-text').textContent = u.mac ? `🆕 새 버전 ${u.version} 이 나왔어요. 받아서 덮어써 주세요.` : `🆕 새 버전 ${u.version} 이 나왔어요. 받아 두었으니 누르면 바로 바뀌어요.`;
  buttons.replaceChildren(
    btn(u.mac ? '받기' : '지금 업데이트', async () => {
      const r = await ask('api/release-now', {});
      if (r.error) { $('#upd-text').textContent = `⚠ ${r.error}`; return; }
      if (r.page) { window.open(r.page, '_blank'); box.hidden = true; S.updLater = u.version; return; }
      $('#upd-text').textContent = '업데이트하는 중이에요… 몇 초 뒤 다시 켜져요.';
      buttons.replaceChildren();
    }, '#2E8B57'),
    btn('나중에', () => { S.updLater = u.version; box.hidden = true; }),
  );
  if (box.hidden) { box.hidden = false; pop(box, 0, 10); }
}
function doneNews() {
  $('#news').hidden = true;
  if (S.news?.fresh) { S.news.fresh = false; call('api/pet', { newsSeen: S.news.n }); }
}
$('#news').onclick = (e) => {
  if (e.target.id === 'news-x') { doneNews(); return; }
  S.newsOpen = !S.newsOpen; newsText(); newsClock();
};

// ── every 1.5 s: who is here, what they said, notes, pokes ──
async function poll() {
  const r = await call('api/pet');
  $('#off').hidden = r.ok;
  if (!r.ok) return;
  const st = r.data;
  S.st = st;
  if (!st.on) { app?.hide(); return; }
  // 🚧 A room that came down under me (its owner deleted it), once.
  for (const l of st.lost || []) {
    const id = `lost|${l.name}|${l.at}`;
    if (S.seen.has(id)) continue;
    S.seen.add(id);
    if (!S.first) S.quake = l.name;
  }
  cast(st);
  if (S.quake) { demolish(S.quake, S.quakeGone || []); S.quake = null; S.quakeGone = null; }
  const me = S.members.get('');
  // A size set from the menu or another window of mine; never while I am dragging.
  if (!S.rz && st.scale && Math.abs(st.scale - S.k) > 0.005) zoom(st.scale);
  if (!S.aDrag && st.petAlpha != null && Math.abs(st.petAlpha - S.petA) > 0.01) petAlpha(st.petAlpha);
  if (!S.crz && !S.cDrag && st.chatW && (st.chatW !== S.chatW || st.chatH !== S.chatH || Math.abs(st.chatAlpha - S.chatA) > 0.01)) chatSize(st.chatW, st.chatH, st.chatAlpha);
  S.floor = st.floor;
  for (const m of st.chat) {
    if (S.seen.has(m.id)) continue;
    S.seen.add(m.id);
    if (S.first) continue;
    const at = `${m.floor}|${m.who}`;
    const who = m.mine ? '' : S.members.has(at) ? at : null;
    // 🎆 An effect plays over whoever sent it instead of a bubble; the chat box still has the line.
    // My own catch already leapt over me when I reeled it in.
    if (m.fx === 'fish' && m.mine) continue;
    // 🦶 A smack and ❄️ a snowball: their modules get the whole line (m.fish holds the show; me: aimed at me),
    // since the one aimed at may be on my row even when whoever did it is not.
    if (m.fx === 'smack' || m.fx === 'snowball') { (m.fx === 'smack' ? Mod.smack : Mod.snow)?.play?.(m, who, st); continue; }
    if (m.fx) { if (who !== null && (m.mine || !st.fxOff)) Mod.fx?.play?.(m.fx, who, m.fish || m.fling); continue; }
    if (!st.bubbles && !m.mine) { if (!chatOpen() && me?.dot) me.dot.hidden = false; continue; }
    say(who !== null ? who : me, m.mine ? '나' : m.name, m.text, 8, { img: m.img, tone: m.me ? 'called' : '' });
  }
  // A note to me: a lilac bubble over the writer (or over me when they are not on my row), shown
  // even with bubbles off since it is only mine; a click on it opens the answer.
  for (const n of st.notes || []) {
    if (S.seen.has(`note|${n.id}`)) continue;
    S.seen.add(`note|${n.id}`);
    if (S.first || n.dir !== 'in') continue;
    const at = `${n.floor}|${n.who}`;
    say(S.members.has(at) ? at : me, `${n.name} 님의 쪽지`, n.text ? `✉️ ${n.text}` : '✉️ (사진)', 12, { open: { who: n.who, name: n.name, floor: n.floor }, img: n.img, tone: 'note' });
  }
  if (chatOpen()) showChat();
  Mod.games?.duel?.(st.duel);
  Mod.games?.relay?.(st.relay);
  Mod.games?.party?.(st.party);
  Mod.fish?.friends?.(st);
  Mod.fish?.contest?.(st.contest);
  Mod.smack?.state?.(st);
  Mod.snow?.state?.(st);
  // 👋 Not set up yet: the first-run box opens by itself, once (the menu opens it again).
  if (st.setup && !S.startAuto) { S.startAuto = true; openStart(st.setup); }
  // 📦 A new update's notes once the pets are in sight; folded and untouched, they go by themselves.
  if (st.news?.fresh && !st.setup && S.newsShown !== st.news.n) { S.newsShown = st.news.n; showNews(st.news, false); }
  // 🆕 A newer release (once per version, until 나중에), and a room's hub older than me (said once).
  if (st.update && !st.setup && S.updLater !== st.update.version && $('#upd').hidden) showUpdate(st.update);
  if (st.hubOld && !S.hubOldSaid && !S.first) { S.hubOldSaid = true; say(me, '🆕', '방장 PC 가 아직 옛 버전이에요. 방장 PC 가 업데이트하면 새 기능이 다 돼요.', 8); }
  if (!$('#news').hidden && !$('#news').matches(':hover') && Date.now() > S.newsUntil) doneNews();
  // Poked: a jump, a good shake and a bubble that says so. Called by name: the same jump and shake.
  if (S.pokes >= 0 && st.pokes > S.pokes) { flinch(); say(me, '👉', '누가 찔렀어요!', 3); }
  if (S.calls !== null && st.calls > S.calls) flinch();
  S.pokes = st.pokes; S.calls = st.calls | 0;
  S.first = false;
  if (S.seen.size > 2000) S.seen = new Set([...S.seen].slice(-1000));
}
// Poked or called: my pet hops up and comes down, then shakes for two seconds.
function flinch() {
  S.shakeUntil = Date.now() + 2000;
  const g = S.members.get('')?.g;
  if (!g) return;
  anim(g, { transform: ['translateY(0)', 'translateY(-16px)'] }, 160);
  after(180, () => anim(g, { transform: ['translateY(-16px)', 'translateY(0)'] }, 300));
}
// Every 0.2 s: each pet breathes on its own beat, blinks now and then, chatters while its bubble
// is fresh; mine shakes when I am poked. The modules get the same tick.
setInterval(() => {
  S.tick++;
  const now = Date.now();
  Mod.games?.tick?.(now);
  for (const m of S.members.values()) {
    if (!m.bub.hidden && now > m.until) { m.bub.hidden = true; m.open = null; }
    let f = (S.tick + m.phase * 2) % 6 < 3 ? 0 : 1;
    if (rnd(30) === 0) f = 2;
    if (!m.bub.hidden && now < m.until - 5000) f = [0, 3][S.tick % 2];
    if (m.crying > now) f = 2; // eyes shut, dabbing at them (pet-fx.js farewell)
    let dx = 0;
    if (!m.who && now < S.shakeUntil) { f = 3; dx = [-6, 6][S.tick % 2]; }
    if ((!m.who && S.walking) || now < m.walkUntil) f = [0, 1][S.tick % 2];
    setFrame(m.img, f);
    m.img.style.marginLeft = `${dx}px`; m.img.style.marginRight = `${-dx}px`;
  }
  Mod.fx?.tick?.(now);
  Mod.fish?.tick?.(now);
  Mod.smack?.tick?.(now);
  Mod.snow?.tick?.(now);
  if (app && !S.fly) fit();
}, 200);

// The Mac app's window is see-through and lets clicks pass where nothing is drawn; held for a
// drag, it keeps taking the mouse even if the window lags a step behind.
if (app?.mouse) {
  S.over = null;
  document.addEventListener('mousemove', (e) => {
    const hit = S.holding || S.menuOpen || !!e.target.closest('#dock .slot, #dock .panel, #chat, #grip, #menu, #off');
    if (hit !== S.over) { S.over = hit; app.mouse(hit); }
  });
}

// The Mac app says where in its window the pet sits (it moves the pet, not the window, along a
// screen edge), so the pet can be put anywhere on the screen.
app?.onDock?.((d) => { S.dockRight = d.right; $('#dock').style.bottom = `${d.bottom}px`; fit(); });
// The panels hang to the left of the pet, as on Windows — unless the pet sits near the screen's
// left edge with no room for them there: then they hang to the right of it, and so does my bubble.
S.dockRight = 12;
function fit() {
  const dock = $('#dock'), rb = $('#rowbox').getBoundingClientRect();
  const petLeft = window.innerWidth - S.dockRight - rb.width;
  const flip = petLeft < 258;
  dock.classList.toggle('flip', flip);
  if (flip) { dock.style.left = `${Math.max(4, petLeft)}px`; dock.style.right = 'auto'; }
  else { dock.style.left = 'auto'; dock.style.right = `${S.dockRight}px`; }
}

// On start: my place and size from the settings, then in through the door.
(async () => {
  const r = await call('api/pet');
  S.fly = true;
  if (r.ok) {
    S.st = r.data; cast(r.data);
    if (r.data.scale) zoom(r.data.scale);
    if (r.data.chatW) chatSize(r.data.chatW, r.data.chatH, r.data.chatAlpha);
    if (r.data.petAlpha) petAlpha(r.data.petAlpha);
  } else {
    S.members.set('', member('', '나', 'cat', 48, '', $('#row')));
  }
  fly();
  poll();
  setInterval(poll, 1500);
})();
