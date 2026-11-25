// 팀 펫's own page on this PC: the first join, my pet, my name, my floors, and on the hub PC its
// floors and who is connected. Talk, notes, games and fishing all happen in the pet.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function call(path, body, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(path, method === 'GET' ? {} : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  return { ok: !!res?.ok, status: res?.status || 0, data, error: data.error || (res ? '' : '이 PC 의 팀 펫이 꺼져 있습니다') };
}
function note(el, text, bad = false) {
  el.textContent = text;
  el.classList.toggle('bad', bad);
}
// Two presses for anything that cannot be undone: the page cannot use confirm().
function twice(b, label, act) {
  b.onclick = async () => {
    if (!b.dataset.armed) {
      b.dataset.armed = '1';
      b.textContent = '한 번 더 누르면 됩니다';
      setTimeout(() => { delete b.dataset.armed; b.textContent = label; }, 4000);
      return;
    }
    await act();
  };
}
const ago = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}초` : s < 3600 ? `${Math.round(s / 60)}분` : s < 86400 ? `${Math.round(s / 3600)}시간` : `${Math.round(s / 86400)}일`;
};
// A join code shown as ABC-DEF; members may type it either way.
const showCode = (c) => (c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c);
const codeLeft = (until) => { const d = Math.ceil((until - Date.now()) / 86_400_000); return d > 0 ? `${d}일 남음` : '기간 지남'; };

// ── what this PC is: the hub, a member on some floors, or a member with none yet ──
let isHub = false;
async function load() {
  const st = await call('api/state');
  if (!st.ok) { $('#conn-label').textContent = st.error || '연결되지 않습니다'; $('#conn').className = 'dot down'; return; }
  const floors = await call('api/floors');
  isHub = floors.ok;
  $('#welcome').hidden = isHub || st.data.team;
  for (const id of ['#pet', '#me']) $(id).hidden = false;
  $('#links').hidden = isHub || !st.data.team;
  $('#floors').hidden = !isHub;
  if (!st.data.team && !isHub) $('#welcome-name').value ||= st.data.user?.name || '';
  renderConn(st.data);
  loadPet();
  loadMe();
  loadQuiet();
  if (isHub) { renderFloors(floors.data); loadRoster(); } else if (st.data.team) loadLinks();
}
function renderConn(s) {
  const down = (s.hubs || []).filter((h) => h.ok === false);
  const dot = $('#conn');
  if (isHub) { dot.className = 'dot up'; $('#conn-label').textContent = `허브 · 층 ${s.floors.length}개`; return; }
  if (!s.team) { dot.className = 'dot'; $('#conn-label').textContent = '아직 들어간 층이 없습니다'; return; }
  dot.className = `dot ${down.length ? 'down' : 'up'}`;
  $('#conn-label').textContent = down.length ? `연결 안 됨: ${down.map((h) => h.name || h.url).join(', ')}` : `연결됨 · ${s.floors.join(', ')}`;
}

// ── first run ──
$('#welcome-form').onsubmit = async (e) => {
  e.preventDefault();
  note($('#welcome-note'), '허브에 확인하는 중…');
  const r = await call('api/links', { name: $('#welcome-name').value.trim(), code: $('#welcome-code').value.trim() });
  if (!r.ok) return note($('#welcome-note'), r.error || '들어가지 못했습니다', true);
  note($('#welcome-note'), `"${r.data.joined}" 층에 들어갔습니다! 펫을 띄워 대화해 보세요.`);
  setTimeout(load, 1200);
};

// ── my pet ──
let petOn = false;
async function loadPet() {
  const r = await call('api/pet');
  if (r.ok) renderPet(r.data);
}
function renderPet(p) {
  petOn = !!p.on;
  $('#pet-on').textContent = petOn ? '펫 끄기' : '🐾 펫 띄우기';
  $('#pet-on').classList.toggle('primary', !petOn);
  $('#pet-bubbles').checked = p.bubbles !== false;
  $('#pet-fx').checked = p.fxOff === true;
  $('#pet-kinds').innerHTML = p.kinds.map((k) => `<button type="button" class="${k.kind === p.kind ? 'on' : ''}" data-kind="${esc(k.kind)}" title="${esc(k.name)}">`
    + `<span class="face" style="background-image:url('assets/pets/${esc(k.kind)}.png')"></span></button>`).join('');
  for (const b of $('#pet-kinds').querySelectorAll('button')) b.onclick = () => savePet({ kind: b.dataset.kind }, `${b.title}(으)로 바꿨습니다`);
}
async function savePet(change, said) {
  const r = await call('api/pet', change);
  if (r.ok) renderPet(r.data);
  note($('#pet-note'), r.ok ? said : r.error || '저장하지 못했습니다', !r.ok);
}
$('#pet-on').onclick = () => savePet({ on: !petOn }, !petOn ? '펫이 나갑니다! 작업표시줄 위를 보세요.' : '펫을 껐습니다.');
$('#pet-bubbles').onchange = (e) => savePet({ bubbles: e.target.checked }, e.target.checked ? '새 대화를 말풍선으로 보여 줍니다.' : '새 대화가 오면 빨간 점만 뜹니다.');
$('#pet-fx').onchange = (e) => savePet({ fxOff: e.target.checked }, e.target.checked ? '남이 쓴 채팅 효과를 이 PC 에서 안 보여 줍니다.' : '채팅 효과를 다시 보여 줍니다.');

// ── me: my name, and hiding for a while ──
let hidden = false;
async function loadMe() {
  const [cfg, me] = await Promise.all([call('api/config'), call('api/me')]);
  if (cfg.ok && document.activeElement !== $('#my-name')) $('#my-name').value = cfg.data.config.user.name;
  if (me.ok) renderMe(me.data);
}
function renderMe(m) {
  hidden = !!m.hidden;
  $('#hide').textContent = hidden ? '🙈 숨김 중 — 다시 보이기' : '잠깐 숨기기';
  $('#hide').classList.toggle('on', hidden);
  $('#hide-line').textContent = hidden ? '지금은 같은 층 사람들에게 내가 보이지 않습니다.' : '같은 층 사람들의 펫 줄에 내 동물이 보입니다.';
}
$('#hide').onclick = async () => {
  const r = await call('api/me', { hidden: !hidden });
  if (r.ok) renderMe(r.data); else note($('#me-note'), r.error, true);
};
$('#name-form').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('#my-name').value.trim();
  if (!name) return;
  const r = await call('api/config', { user: { name } });
  note($('#me-note'), r.ok ? `이름을 "${name}" 으로 바꿨습니다.` : r.error, !r.ok);
};

// ── 🔕 Windows alerts on this PC ──
let quiet = false;
async function loadQuiet() {
  const r = await call('api/notify');
  if (r.ok) renderQuiet(r.data);
}
function renderQuiet(s) {
  quiet = !!s.quiet;
  $('#quiet').textContent = quiet ? '🔕 알림 꺼짐' : '🔔 알림';
  $('#quiet').classList.toggle('on', quiet);
}
$('#quiet').onclick = async () => {
  const r = await call('api/notify', { quiet: !quiet });
  if (r.ok) renderQuiet(r.data);
};

// ── a member's floors ──
async function loadLinks() {
  const r = await call('api/links');
  if (r.ok) renderLinks(r.data.links);
}
function renderLinks(list) {
  $('#link-list').innerHTML = list.map((l) => `<li>
      <span class="dot ${l.ok === false ? 'down' : l.ok ? 'up' : ''}"></span>
      <span class="who"><span class="name">${esc(l.name || '(층 이름 모름)')}</span><span class="title">${esc(l.url)}${l.ok === false && l.why ? ` · ${esc(l.why)}` : ''}</span></span>
      ${list.length > 1 ? `<button class="btn ghost" type="button" data-leave="${l.i}">나가기</button>` : ''}</li>`).join('')
    || '<li class="empty">아직 들어간 층이 없습니다.</li>';
  for (const b of $('#link-list').querySelectorAll('button[data-leave]')) {
    twice(b, '나가기', async () => {
      const r = await call('api/links', { leave: Number(b.dataset.leave) });
      if (!r.ok) return note($('#join-note'), r.error, true);
      renderLinks(r.data.links);
      note($('#join-note'), `"${r.data.left}" 층에서 나왔습니다.`);
    });
  }
}
$('#join-form').onsubmit = async (e) => {
  e.preventDefault();
  const code = $('#join-code').value.trim();
  if (!code) return;
  note($('#join-note'), '허브에 확인하는 중…');
  const r = await call('api/links', { code });
  if (!r.ok) return note($('#join-note'), r.error || '들어가지 못했습니다', true);
  $('#join-code').value = '';
  renderLinks(r.data.links);
  note($('#join-note'), `"${r.data.joined}" 층에 들어갔습니다.`);
};

// ── the hub: floors and their codes ──
function renderFloors({ floors: list }) {
  $('#floor-list').innerHTML = list.map((f, i) => `<li>
      <span class="who"><span class="name">${esc(f.name)}</span>
        <span class="title">참가 코드 <span class="code">${esc(showCode(f.code || ''))}</span> · ${codeLeft(f.codeUntil)}</span></span>
      <button class="btn primary" type="button" data-copy="${i}" title="팀원은 설치 뒤 펫에 이 링크를 붙여 넣으면 들어옵니다">🔗 링크 복사</button>
      <button class="btn ghost" type="button" data-renew="${i}" title="새 코드를 만들면 지금 코드는 더 이상 안 됩니다(이미 들어온 사람은 그대로)">새 코드</button>
      <button class="btn ${f.joined ? 'on' : 'ghost'}" type="button" data-join="${i}" title="${f.joined ? '내 펫도 이 층 대화에 있습니다. 누르면 빠집니다' : '관리만 하는 층입니다. 누르면 내 펫도 들어갑니다'}">${f.joined ? '✓ 참여 중' : '참여'}</button>
      <button class="btn ghost" type="button" data-del="${i}">삭제</button></li>`).join('')
    || '<li class="empty">아직 층이 없습니다. 아래에서 만들어 주세요.</li>';
  const put = async (body, said) => {
    const r = await call('api/floors', body, 'PUT');
    if (!r.ok) return note($('#floor-note'), r.error, true);
    renderFloors(r.data);
    note($('#floor-note'), said);
  };
  for (const b of $('#floor-list').querySelectorAll('button[data-copy]')) {
    b.onclick = async () => {
      const f = list[Number(b.dataset.copy)];
      if (!(f.codeUntil > Date.now())) return note($('#floor-note'), '기간이 지난 코드입니다. "새 코드" 를 눌러 주세요.', true);
      try { await navigator.clipboard.writeText(f.invite); note($('#floor-note'), `"${f.name}" 층 참가 링크를 복사했습니다. 팀원에게 붙여 넣어 보내 주세요.`); }
      catch { note($('#floor-note'), `"${f.name}" 층 참가 링크: ${f.invite}`); }
    };
  }
  for (const b of $('#floor-list').querySelectorAll('button[data-renew]')) {
    const f = list[Number(b.dataset.renew)];
    twice(b, '새 코드', () => put({ name: f.name, code: true }, `"${f.name}" 층에 새 참가 코드를 만들었습니다.`));
  }
  for (const b of $('#floor-list').querySelectorAll('button[data-join]')) {
    const f = list[Number(b.dataset.join)];
    b.onclick = () => put({ name: f.name, joined: !f.joined }, f.joined ? `"${f.name}" 층 대화에서 빠졌습니다.` : `"${f.name}" 층 대화에 들어갔습니다.`);
  }
  for (const b of $('#floor-list').querySelectorAll('button[data-del]')) {
    const f = list[Number(b.dataset.del)];
    twice(b, '삭제', async () => {
      const r = await call('api/floors', { name: f.name }, 'DELETE');
      if (!r.ok) return note($('#floor-note'), r.error, true);
      renderFloors(r.data);
      note($('#floor-note'), `"${f.name}" 층을 지웠습니다. 그 층의 코드와 링크는 더 이상 안 됩니다.`);
    });
  }
}
$('#new-floor').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('#new-floor-name').value.trim();
  if (!name) return;
  const r = await call('api/floors', { name });
  if (!r.ok) return note($('#floor-note'), r.error, true);
  $('#new-floor-name').value = '';
  renderFloors(r.data);
  note($('#floor-note'), `"${name}" 층을 만들었습니다. 참가 코드를 팀원에게 알려 주세요.`);
};

// ── the hub: who is connected ──
async function loadRoster() {
  const r = await call('api/roster');
  if (!r.ok) return;
  const { version, people } = r.data;
  $('#roster-sum').textContent = `연결 ${people.filter((p) => p.online).length} / ${people.length}명`;
  $('#roster').innerHTML = people.map((p) => {
    const via = p.via === 'exe' ? '설치판' : p.via === 'zip' ? '압축판' : '';
    const ver = !p.version ? '' : p.version >= version ? '최신' : '업데이트 전';
    const pet = p.pet === true ? '펫 켬' : p.pet === false ? '펫 끔' : '';
    const state = p.online ? '연결됨' : p.hidden ? '숨김' : `끊김 · ${ago(p.at)} 전`;
    return `<li class="${p.online ? '' : 'off'}"><span class="dot ${p.online ? 'up' : 'down'}"></span>
      <span class="who"><span class="name">${esc(p.name)}</span><span class="title">${[state, p.floors.join(', '), via, ver, pet].filter(Boolean).map(esc).join(' · ')}</span></span></li>`;
  }).join('') || '<li class="empty">아직 아무도 연결하지 않았습니다.</li>';
}

load();
// The connection and the roster change on their own; the rest only when I act here.
setInterval(async () => {
  const st = await call('api/state');
  if (st.ok) renderConn(st.data);
  if (isHub) loadRoster();
  else if (st.ok && st.data.team) loadLinks();
}, 10_000);
