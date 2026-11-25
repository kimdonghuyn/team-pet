// 🦶 날려버리기 (server/smack.js), the same show as the Windows pet's (server/pet.ps1, "🦶 날려버리기" —
// Smack-Do, Smk-*): the one who does it runs up to the other and stops just before the hit; on its
// own screen an arrow swings up and down (a click sets the angle), then a power gauge (a click sets
// the power, 90% and up goes to space) — then a spotlight drops on the two for a beat, the hit, and
// off the other flies along an arc, wind and sparkles round it, bounces lower each time, falls flat,
// gets up and runs back. The hub puts a 🏀 hoop or a ⛳ hole on the way and says how the shot goes;
// every screen on the floor plays that, laid out over its own width.
// Everything is drawn afresh every frame from the time since its part began, on one canvas over the
// whole window (in the effects' layer, so it is as see-through as the pets). While I aim, a clear
// layer on top takes the clicks (and Space, Esc to stop).
(() => {
  const SMK = { run: 0.4, strike: 0.22, spot: 0.6, grav: 1000, spacePw: 0.9 };
  const FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Pretendard Variable", "Segoe UI Symbol", sans-serif';
  const PI = Math.PI;
  let sh = null;       // the show on my screen, or null
  let sentAt = 0;      // when I last let go of one (my own line then plays no second time)
  let asking = false;  // an aim on its way to the hub
  let cv = null, c = null, catcher = null, raf = 0, lastFrame = 0, dpr = 1;

  {
    const st = el('style');
    st.textContent = '#smk { left: 0; top: 0; pointer-events: none; }\n'
      + '.smk-catch { position: fixed; inset: 0; z-index: 60; cursor: pointer; background: rgba(0, 0, 0, .004); }';
    document.head.append(st);
  }

  // ── small things ──
  const sheets = new Map();
  function sheet(kind) {
    let im = sheets.get(kind);
    if (!im) { im = new Image(); im.src = `assets/pets/${encodeURIComponent(kind)}.png`; sheets.set(kind, im); }
    return im;
  }
  const ease3 = (u) => 1 - Math.pow(1 - u, 3);
  const clamp01 = (u) => Math.max(0, Math.min(1, u));
  const smkAngle = (tt) => ((40 + 28 * Math.sin(tt * 1.7)) * PI) / 180;
  const smkPower = (tt) => (1 - Math.cos(tt * 2.2)) / 2;
  const reachOf = (s) => Math.max(100, (s.dir > 0 ? s.area.wd - 30 - s.bx : s.bx - 30) * 0.9);
  // Seconds to fall from y0 up with vy0 (up is more) down to the floor.
  const fallT = (y0, vy0) => (vy0 + Math.sqrt(Math.max(0, vy0 * vy0 + 2 * SMK.grav * y0))) / SMK.grav;
  const rgbaCache = new Map();
  function rgba(hex, a = 1) {
    const k = `${hex}|${a}`;
    let v = rgbaCache.get(k);
    if (!v) {
      const n = parseInt(hex.slice(1), 16);
      v = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
      if (rgbaCache.size > 800) rgbaCache.clear();
      rgbaCache.set(k, v);
    }
    return v;
  }

  // ── where things stand ──
  // The hoop on this screen: the ring's middle and height (above the one kicked) from the hub's
  // spot for it, the rest to the pets' size. The flight is aimed at the spot of this drawing the
  // hub says it meets (plan).
  function hoopGeo(s) {
    const rch = reachOf(s), dir = s.dir, bcy = s.bfoot - s.bsz / 2;
    const hcx = Math.max(30, Math.min(s.area.wd - 30, s.bx + dir * s.hoop.fx * rch));
    const ringY = Math.min(s.hoop.fy * rch, bcy - 60), rw = Math.max(18, Math.min(46, s.bsz * 0.8));
    return { hcx, ringY, hpy: bcy - ringY, rw, rh: rw * 0.3, boardH: rw * 1.9, face: hcx + dir * rw * 1.12 };
  }
  // The flight from the one kicked to (tx across, ty up from where it stood), at the angle it was
  // kicked if that comes down onto the spot, else steeper.
  function aimTo(s, tx, ty) {
    const dxp = Math.max(20, Math.abs(tx - s.bx)), lo = ty / dxp;
    let tn = Math.tan(s.angle);
    if (ty > 1 && tn < lo * 2.2) tn = lo * 2.6;
    tn = Math.max(0.2, Math.min(4, tn));
    const ang = Math.atan(tn), cs = Math.cos(ang);
    const v = Math.sqrt((SMK.grav * dxp * dxp) / (2 * cs * cs * Math.max(1, dxp * tn - ty)));
    return { vx: v * cs, vy: v * Math.sin(ang), t: dxp / (v * cs) };
  }
  function golfGeo(s) {
    const cx = Math.max(40, Math.min(s.area.wd - 40, s.bx + s.dir * s.golf.fx * reachOf(s)));
    return { cx, foot: s.bfoot, cup: Math.max(9, s.bsz * 0.32), green: Math.max(40, s.bsz * 1.7), pole: Math.max(46, s.bsz * 2.1) };
  }
  const hoopOf = (h) => (h && h.fx != null ? { fx: +h.fx, fy: +h.fy } : null);
  const golfOf = (g) => (g && g.fx != null ? { fx: +g.fx } : null);

  // ── drawing (c: the context being drawn on) ──
  function rrPath(x, y, w, h, r) {
    c.beginPath();
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    if (c.roundRect) c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else c.rect(x, y, w, h);
  }
  function rrect(x, y, w, h, r, fill, stroke = null, lw = 1) {
    rrPath(x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  function rect(x, y, w, h, fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
  function ell(x, y, rx, ry, fill, stroke = null, lw = 1) {
    if (rx <= 0 || ry <= 0) return;
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 2 * PI);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  function line(pts, color, lw, cap = 'round') {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.strokeStyle = color; c.lineWidth = lw; c.lineCap = cap; c.lineJoin = 'round'; c.stroke();
  }
  function shape(pts, fill, stroke = null, lw = 1) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }
  }
  // A soft dark patch (radius rad across, 0.75 of it up and down) by stops [offset, alpha 0..255].
  function glow(cx, cy, rad, stops) {
    if (rad <= 0) return;
    c.save(); c.translate(cx, cy); c.scale(1, 0.75);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rad);
    for (const [o, a] of stops) g.addColorStop(clamp01(o), `rgba(10, 8, 18, ${a / 255})`);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rad, 0, 2 * PI); c.fill(); c.restore();
  }
  // A round gradient from `inner` in the middle to `outer` at the edge, over an ellipse.
  function radial(cx, cy, rx, ry, inner, outer) {
    if (rx <= 0 || ry <= 0) return;
    c.save(); c.translate(cx, cy); c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, 2 * PI); c.fill(); c.restore();
  }
  // A word, outlined dark, centred at (x, y).
  function word(text, x, y, size, color, alpha = 1) {
    if (size < 1 || alpha <= 0) return;
    c.save(); c.globalAlpha = Math.min(1, alpha);
    c.font = `900 ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = 4; c.strokeStyle = 'rgba(20, 18, 29, .85)'; c.strokeText(text, x, y);
    c.fillStyle = color; c.fillText(text, x, y); c.restore();
  }
  // A pet's picture at (px, py) (its middle), turned, flipped to face left, squashed.
  function pet(kind, fi, px, py, size, rot = 0, flip = false, sx = 1, sy = 1) {
    const im = sheet(kind);
    if (!im.complete || !im.naturalWidth || size <= 0) return;
    const fw = im.naturalWidth / 4;
    c.save(); c.translate(px, py); c.rotate(rot); c.scale((flip ? -1 : 1) * sx, sy);
    c.imageSmoothingEnabled = false;
    c.drawImage(im, (((fi % 4) + 4) % 4) * fw, 0, fw, im.naturalHeight, -size / 2, -size / 2, size, size);
    c.restore();
  }
  // The 뿅망치 (squashed or not): a yellow handle with a red stripe, a red pleated barrel across its
  // top with round yellow caps. Grip at (0, 0), straight up.
  function hammerArt(sq) {
    rrect(-3.5, -46, 7, 46, 3, '#FFD34E', '#A8801A', 1.5);
    c.save(); rrPath(-3.5, -46, 7, 46, 3); c.clip();
    for (let k = -46; k < 6; k += 9) line([[-7, k + 6], [7, k]], '#E5484D', 2.5, 'butt');
    c.restore();
    const len = 66 * (1 - 0.38 * sq), rr = 15 * (1 + 0.22 * sq), cy = -46 - rr + 2;
    rrect(-len / 2, cy - rr, len, rr * 2, 4, '#E5484D', '#8E1F2A', 1.6);
    for (let i = 1; i < 7; i++) {
      const px = -len / 2 + (len * i) / 7;
      line([[px, cy - rr + 1], [px, cy + rr - 1]], '#8E1F2A', 2, 'butt');
      line([[px + 2, cy - rr + 2], [px + 2, cy + rr - 2]], rgba('#FFBEBE', 0.7), 1, 'butt');
    }
    rrect(-len / 2 + 4, cy - rr + 3, len - 8, 4, 2, rgba('#FFFFFF', 0.35));
    for (const side of [-1, 1]) {
      ell((side * len) / 2, cy, 7, rr + 1, '#FFD34E', '#A8801A', 1.6);
      ell((side * len) / 2 - 1.5, cy - rr * 0.45, 2.2, rr * 0.3, rgba('#FFFFFF', 0.45));
    }
  }
  // Held in a paw at (hx, hy) facing dir, turned by rot about the paw (0 = up); u: the pets' size
  // against the 64 the art was made for.
  function held(hx, hy, rot, sq, dir, u) {
    c.save(); c.translate(hx, hy); c.scale(dir, 1);
    c.save(); c.rotate(rot); const k = 0.8 * u * 0.69; c.scale(k, k); hammerArt(Math.round(clamp01(sq) * 2) / 2); c.restore();
    c.save(); c.scale(0.69 * u, 0.69 * u);
    ell(0, -2, 7, 6, '#F08A3C', '#7A3E12', 2); ell(dir, -1, 3, 2.5, '#FFF3E0');
    c.restore(); c.restore();
  }
  // Drawn once into a picture of the whole window and kept (the hoop, the hole), then laid down.
  function bake(draw) {
    const pic = document.createElement('canvas');
    pic.width = cv.width; pic.height = cv.height;
    const keep = c;
    c = pic.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { draw(); } finally { c = keep; }
    return pic;
  }
  function blit(pic) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(pic, 0, 0); c.restore(); }

  // 🏀 The hoop, seen from the side and facing the one kicked: on the far side a pole on a weighted
  // base with a short arm to the board (white, a red bar on its face), a bracket to an orange ring
  // (its back half behind the net, its front half over it), and a criss-cross net that tapers down
  // and swings when one drops through (sinceGoal seconds ago, or less than 0).
  function hoopBody(s, sinceGoal) {
    const g = s.hoopGeo, dir = s.dir, hpx = g.hcx, hpy = g.hpy, rw = g.rw, rh = g.rh, face = g.face, foot = s.bfoot;
    const bw = rw * 0.3, bTop = hpy - g.boardH, bH = g.boardH + rw * 0.55, back = face + dir * bw, bl = Math.min(face, back);
    const poleX = back + dir * rw * 0.55, pw = Math.max(4, rw * 0.2);
    ell(poleX, foot + 2, rw * 0.8, rw * 0.16, rgba('#000000', 0.2));
    rrect(poleX - rw * 0.5, foot - rw * 0.28, rw, rw * 0.32, 4, '#3B4152');
    const pTop = bTop + bH * 0.3;
    rrect(poleX - pw / 2, pTop, pw, foot - rw * 0.26 - pTop, 2, '#5A6275');
    rect(poleX - pw / 2 + 1, pTop + 2, pw * 0.3, foot - rw * 0.3 - pTop, '#8C94A8');
    rect(Math.min(back, poleX), pTop + bH * 0.08, Math.abs(poleX - back), pw * 0.9, '#5A6275');
    rrect(bl + 2, bTop + 3, bw, bH, 3, rgba('#000000', 0.16));
    rrect(bl, bTop, bw, bH, 3, '#FFFFFF', '#2F3442', 2);
    rect(dir > 0 ? bl + bw * 0.5 : bl + 1.5, bTop + 1.5, bw * 0.45, bH - 3, '#D7DDE8');
    rrect(dir > 0 ? face + 1.5 : face - 1.5 - bw * 0.32, hpy - rw * 1.05, bw * 0.32, rw * 0.95, 1, '#E5484D');
    line([[hpx + dir * rw * 0.9, hpy + 1], [face, hpy + 1]], '#9A4A14', Math.max(3, rw * 0.14));
    const ringW = Math.max(3, rw * 0.13), rBack = [], rFront = [];
    for (let i = 0; i <= 16; i++) {
      const ga = (PI * i) / 16;
      rBack.push([hpx + Math.cos(ga) * rw, hpy - Math.sin(ga) * rh]); rFront.push([hpx + Math.cos(ga) * rw, hpy + Math.sin(ga) * rh]);
    }
    line(rBack, '#B4501A', ringW);
    const live = sinceGoal >= 0 && sinceGoal < 1.2;
    const sway = live ? Math.sin(sinceGoal * 20) * (1.2 - sinceGoal) * rw * 0.22 : 0;
    const hang = rw * 1.1 * (sinceGoal >= 0 && sinceGoal < 0.3 ? 1 + 0.35 * (1 - sinceGoal / 0.3) : 1);
    const rows = [], n = 8;
    for (const lv of [0, 0.34, 0.68, 1]) {
      const half = rw * (1 - 0.42 * lv), dy = hang * lv, row = [];
      for (let i = 0; i <= n; i++) { const ga = (PI * i) / n; row.push([hpx + Math.cos(ga) * half + sway * lv, hpy + Math.sin(ga) * rh * (1 - 0.5 * lv) + dy]); }
      rows.push(row);
    }
    const np = rgba('#FFFFFF', 0.92), nw = Math.max(1.2, rw * 0.055);
    for (let r = 0; r < 3; r++) for (let i = 0; i < n; i++) { line([rows[r][i], rows[r + 1][i + 1]], np, nw); line([rows[r][i + 1], rows[r + 1][i]], np, nw); }
    line(rows[3], rgba('#FFFFFF', 0.8), Math.max(1, rw * 0.05));
    line(rFront, '#FF7A1A', ringW);
    line(rFront.slice(11, 16), rgba('#FFC48A', 0.9), Math.max(1, ringW * 0.35));
  }
  // ⛳ The hole, from the side: a green patch on the floor, the cup, a flag on a pole that lifts and
  // flutters when one drops in.
  function golfBody(s, sinceGoal) {
    const g = s.golfGeo, cx = g.cx, ft = g.foot, cup = g.cup, gr = g.green;
    ell(cx, ft + 1, gr, gr * 0.2, rgba('#3E9B4F', 0.9), '#2C7A3B', 2);
    ell(cx - gr * 0.15, ft, gr * 0.7, gr * 0.12, rgba('#5BBF6A', 0.85));
    ell(cx, ft + 1, cup, cup * 0.35, '#1B2A1E', rgba('#E8F5E9', 0.8), 1.5);
    const live = sinceGoal >= 0 && sinceGoal < 1.2;
    const lift = live ? (Math.sin((Math.min(1, sinceGoal / 0.3) * PI) / 2) * g.pole * 0.25 * (1.2 - sinceGoal)) / 1.2 : 0;
    const pTop = ft - g.pole - lift, pBot = ft - lift * 0.5;
    line([[cx, pBot], [cx, pTop]], '#F2F2F2', Math.max(2, cup * 0.18));
    line([[cx + 1, pBot], [cx + 1, pTop]], '#9AA0AE', Math.max(1, cup * 0.06));
    const wave = live ? Math.sin(sinceGoal * 18) * cup * 0.3 : 0, fw = g.pole * 0.42, fh = g.pole * 0.26, fd = -s.dir;
    shape([[cx, pTop], [cx + fd * fw, pTop + fh * 0.5 + wave], [cx, pTop + fh]], '#E5484D', '#A12B30', 1.5);
    ell(cx, pTop - 2, Math.max(2, cup * 0.2), Math.max(2, cup * 0.2), '#FFD34E');
  }
  function gold(cx, cy, rad) { radial(cx, cy, rad, rad, 'rgba(255, 215, 0, .59)', 'rgba(255, 215, 0, 0)'); }
  // Drawn once and kept while it stands still; only the moment of a goal is drawn live.
  function golfArt(s, sinceGoal, now) {
    if (!s.golfGeo) s.golfGeo = golfGeo(s);
    const g = s.golfGeo, live = sinceGoal >= 0 && sinceGoal < 1.2;
    if (live) golfBody(s, sinceGoal);
    else { if (!s.golfPic) s.golfPic = bake(() => golfBody(s, -1)); blit(s.golfPic); }
    const top = g.foot - g.pole;
    if (s.mine && (s.phase === 'aim' || s.phase === 'power')) word('홀컵에 쏙!', g.cx, top - 16 - Math.abs(Math.sin(now * 4)) * 5, 15, '#7EE07A');
    if (sinceGoal >= 0 && sinceGoal < 1.6) {
      gold(g.cx, g.foot - g.cup, g.green * (0.6 + sinceGoal * 0.5));
      word(s.shot === 'ace' ? '홀인원!' : '홀인!', g.cx, top - 22 - sinceGoal * 30, 32 + 8 * Math.min(1, sinceGoal * 4), '#FFD700', sinceGoal > 1 ? 1 - (sinceGoal - 1) / 0.6 : 1);
    }
  }
  function hoopArt(s, sinceGoal, now) {
    if (!s.hoopGeo) s.hoopGeo = hoopGeo(s);
    const g = s.hoopGeo, live = sinceGoal >= 0 && sinceGoal < 1.2, bTop = g.hpy - g.boardH;
    if (live) hoopBody(s, sinceGoal);
    else { if (!s.hoopPic) s.hoopPic = bake(() => hoopBody(s, -1)); blit(s.hoopPic); }
    if (s.mine && (s.phase === 'aim' || s.phase === 'power')) word('골대에 쏙!', g.hcx, bTop - 14 - Math.abs(Math.sin(now * 4)) * 5, 15, '#FF9F1C');
    if (sinceGoal >= 0 && sinceGoal < 1.6) {
      gold(g.hcx, g.hpy, g.rw * (1.4 + sinceGoal));
      word('골!', g.hcx, bTop - 18 - sinceGoal * 30, 34 + 8 * Math.min(1, sinceGoal * 4), '#FFD700', sinceGoal > 1 ? 1 - (sinceGoal - 1) / 0.6 : 1);
    }
  }
  // A soft dark patch round the two, a pool of light on them and a short cone of it from just above;
  // it snaps in from wide to tight.
  function spotlight(s, kq) {
    const mx = (s.bx + s.nearX) / 2, gy = s.bfoot - s.bsz * 0.6, rr = s.bsz * 1.35 + 60 * Math.max(0, 1 - kq / 0.12);
    const on = Math.min(1, kq / 0.08), big = rr * 3.2;
    glow(mx, gy, big, [[0, 0], [rr / big, 0], [(rr * 1.3) / big, 185 * on], [0.75, 120 * on], [1, 0]]);
    const top = gy - big * 0.75;
    const cone = c.createLinearGradient(0, top, 0, gy);
    cone.addColorStop(0, 'rgba(255, 244, 200, 0)'); cone.addColorStop(1, `rgba(255, 244, 200, ${(72 * on) / 255})`);
    shape([[mx - 14, top], [mx + 14, top], [mx + rr * 1.1, gy], [mx - rr * 1.1, gy]], cone);
    radial(mx, s.bfoot - 2, rr * 1.15, rr * 0.35, `rgba(255, 244, 200, ${(90 * on) / 255})`, 'rgba(255, 244, 200, 0)');
  }

  // ── the show ──
  // Who does it to whom (their keys in S.members), how, and — once set — the angle and power.
  function smkNew(akey, bkey, how) {
    const ma = S.members.get(akey), mb = S.members.get(bkey);
    if (!ma || !mb || ma === mb) return null;
    if (ma.img.style.visibility === 'hidden' || mb.img.style.visibility === 'hidden') return null;
    const pa = fxAt(ma), pb = fxAt(mb);
    if (!pa || !pb || !ma.img.getBoundingClientRect().width || !mb.img.getBoundingClientRect().width) return null;
    const area = { wd: window.innerWidth, ht: window.innerHeight };
    const t0 = performance.now();
    return {
      ma, mb, akey, bkey, how, kick: how !== 'hammer', area, ax: pa.x, afoot: pa.foot, asz: pa.size, bx: pb.x, bfoot: pb.foot, bsz: pb.size,
      dir: pb.x < area.wd / 2 ? 1 : -1, clock: () => (performance.now() - t0) / 1000, pt0: 0, phase: 'run', mine: false,
      angle: (40 * PI) / 180, power: 0.6, path: null, trail: [], sparks: [], crowd: null,
    };
  }
  function phase(s, ph) { s.phase = ph; s.pt0 = s.clock(); }
  function begin(s) {
    if (!cv) { cv = el('canvas'); cv.id = 'smk'; }
    if (!cv.isConnected) fxLayer.append(cv);
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(s.area.wd * dpr); cv.height = Math.round(s.area.ht * dpr);
    cv.style.width = `${s.area.wd}px`; cv.style.height = `${s.area.ht}px`; cv.style.display = '';
    c = cv.getContext('2d');
    sh = s;
    cancelAnimationFrame(raf);
    const step = () => { if (sh !== s) return; draw(); if (sh === s) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }
  function shown(m, on) { if (m?.img) m.img.style.visibility = on ? '' : 'hidden'; }
  function end() {
    const s = sh;
    if (!s) return;
    sh = null; cancelAnimationFrame(raf);
    catchOff();
    shown(s.ma, true); shown(s.mb, true);
    for (const d of s.crowd || []) shown(d.m, true);
    if (cv) { c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; }
  }
  // 🚀 A trip to space: the moment the one hit flies off, the whole row gets up and dances.
  function crowdOf(s) {
    const list = [];
    let i = 0;
    for (const m of S.members.values()) {
      if (!m || m === s.ma || m === s.mb || m.img.style.visibility === 'hidden') continue;
      const p = fxAt(m);
      if (!p || !m.img.getBoundingClientRect().width) continue;
      list.push({ m, x: p.x, foot: p.foot, size: p.size, seed: i * 0.37 }); i++;
    }
    return list;
  }
  function dancer(kind, x, foot, size, t, seed) {
    const up = Math.min(1, t / 0.2), ts = t + seed;
    const cy = foot - size / 2 - size * 0.12 * up - Math.abs(Math.sin(ts * 10)) * size * 0.12 * up;
    const flip = Math.floor(ts * 2.5) % 2 === 1;
    pet(kind, [0, 1, 3, 1][Math.floor(t * 8) % 4], x, cy, size, Math.sin(ts * 7) * 0.28 * up, flip);
    const nq = (ts * 0.8) % 1;
    word(Math.floor(ts * 0.8) % 2 ? '♫' : '♪', Math.round(x + Math.sin(ts * 3) * 8), Math.round((foot - size * 1.25 - nq * 28) / 3) * 3, 13, '#FFD36E', Math.round((1 - nq) * 10) / 10);
  }

  // ── aiming: my clicks ──
  function onKey(e) {
    if (!sh?.mine || !catcher) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); click(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
  }
  function catchOn() {
    catcher = el('div', 'smk-catch');
    catcher.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.button === 0) click(); else if (e.button === 2) cancel(); });
    catcher.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
    document.body.append(catcher);
    window.addEventListener('keydown', onKey, true);
    document.activeElement?.blur?.();
    // The Mac window lets clicks through where nothing is drawn: while I aim it takes them all.
    S.holding = true;
    if (app?.mouse) { app.mouse(true); S.over = true; }
  }
  function catchOff() {
    if (!catcher) return;
    catcher.remove(); catcher = null;
    window.removeEventListener('keydown', onKey, true);
    S.holding = false; S.over = null;
  }
  // From the menu on someone's pet: ask the hub first (it holds the floor while I aim), then aim.
  async function smackDo(body) {
    if (sh || asking) return;
    asking = true;
    try {
      const r = await ask('api/smack', { op: 'aim', to: body.to, how: body.how, floor: body.floor, hoop: true });
      if (r.error) { say('', '🦶', `⚠ ${r.error}`, 4); return; }
      const s = sh ? null : smkNew('', `${body.floor}|${body.to}`, body.how);
      if (!s) { ask('api/smack', { op: 'cancel', floor: body.floor }); say('', '🦶', '⚠ 그 사람의 동물이 내 화면에 없어요', 4); return; }
      s.mine = true; s.body = body; s.hoop = hoopOf(r.hoop); s.golf = golfOf(r.golf);
      begin(s); catchOn();
      // Left too long: let the floor go.
      after(20000, (x0) => { if (sh === x0 && !x0.sending && ['run', 'aim', 'power'].includes(x0.phase)) cancel(); }, s);
    } finally { asking = false; }
  }
  async function click() {
    const s = sh;
    if (!s || !s.mine || s.sending) return;
    let tt = s.clock() - s.pt0;
    // Judged by the gauge on screen, not by the clock when the click gets through.
    if (s.seen && s.seen[0] === s.phase) tt = s.seen[1];
    if (s.phase === 'aim') { s.angle = smkAngle(tt); phase(s, 'power'); return; }
    if (s.phase !== 'power') return;
    s.power = Math.max(0.12, smkPower(tt)); s.frozen = s.power; s.sending = true;
    catchOff();
    const deg = Math.round((s.angle * 180) / PI), pw2 = Math.round(s.power * 100) / 100;
    // Fly by what the hub and everyone else get (whole degrees, power to two places).
    s.angle = (deg * PI) / 180; s.power = pw2; s.space = pw2 >= SMK.spacePw;
    sentAt = Date.now();
    const r = await ask('api/smack', { op: 'hit', to: s.body.to, how: s.how, floor: s.body.floor, angle: deg, power: pw2 });
    if (sh !== s) return;
    if (r.error) { end(); say('', '🦶', `⚠ ${r.error}`, 4); return; }
    // How it goes at the hoop or the hole: the hub's pick, so it plays here as everywhere else.
    s.shot = r.shot ? String(r.shot) : ''; s.goal = !!r.goal; s.shotDx = r.dx; s.shotUp = r.up; s.shotStop = r.stop;
    sentAt = Date.now(); s.sending = false; phase(s, 'spot');
  }
  function cancel() {
    const s = sh;
    if (!s || !s.mine) return;
    ask('api/smack', { op: 'cancel', floor: s.body.floor });
    end();
  }
  // Someone on my floor did it (the hub said so): the same, with their angle and power.
  function watch(akey, f, line) {
    if (sh || !f || !f.to) return;
    const s = smkNew(akey, f.me ? '' : `${f.floor ?? line.floor}|${f.to}`, f.how);
    if (!s) return;
    if (f.angle != null) s.angle = (Number(f.angle) * PI) / 180;
    if (f.power != null) s.power = Math.max(0.12, Math.min(1, Number(f.power)));
    s.space = !!f.space; s.hoop = hoopOf(f.hoop); s.golf = golfOf(f.golf); s.goal = !!f.goal;
    s.shot = f.shot ? String(f.shot) : s.goal ? 'swish' : ''; s.shotDx = f.dx; s.shotUp = f.up; s.shotStop = f.stop;
    begin(s);
  }

  // The way the one hit goes, worked out once at the hit on this screen: the flight (the far side of
  // the screen is full power at 45°), then bounces each lower and shorter.
  function plan(s) {
    const ar = s.area, dir = s.dir, grv = SMK.grav, reach = (dir > 0 ? ar.wd - 30 - s.bx : s.bx - 30) * 0.9;
    const v = Math.sqrt(Math.max(100, reach) * grv) * Math.pow(s.power, 0.6);
    let vx = v * Math.cos(s.angle), vy = v * Math.sin(s.angle), px = s.bx, t0 = 0;
    const legs = [], shot = String(s.shot || '');
    if (s.golf && ['ace', 'roll-in', 'roll-short', 'lip-out'].includes(shot)) {
      // ⛳ It lands where the hub says, bounces as any landing does, then rolls on at the last
      // bounce's speed, slowing evenly, to where the hub says it stops.
      const g = golfGeo(s), cx = g.cx, cup = g.cup, rch = reachOf(s);
      const clampX = (xx) => Math.max(30, Math.min(ar.wd - 30, xx));
      const dxr = s.shotDx != null ? Number(s.shotDx) : 0, stopR = s.shotStop != null ? Number(s.shotStop) : dxr;
      const tx = shot === 'ace' ? cx : clampX(cx + dir * dxr * rch);
      const fl = aimTo(s, tx, 0);
      legs.push({ t: 0, x: s.bx, vx: fl.vx, vy: fl.vy, y0: 0, dur: fl.t, flight: true });
      t0 = fl.t;
      if (shot === 'ace') {
        legs.push({ t: t0, x: cx, vx: 0, vy: 0, y0: 0, dur: 0.45, sink: true, quiet: true });
        return { legs, land: cx, done: t0 + 0.45, goalT: t0, hole: true };
      }
      const total = Math.max(12, (stopR - dxr) * rch); // how far it goes on after it lands
      const toCup = (cx - tx) * dir;                    // to the cup's middle (less than 0: past it)
      const fric = 320;
      let hs = [], vyb = fl.vy * 0.38;
      while (hs.length < 3 && vyb >= 60) { hs.push(vyb); vyb *= 0.38; }
      const limit = toCup > cup ? toCup - cup * 1.2 : Infinity;
      let nb, cr, u1;
      for (;;) {
        nb = hs.length; let span = 0;
        for (let i = 0; i < nb; i++) span += (Math.pow(0.7, i) * 2 * hs[i]) / grv;
        cr = Math.pow(0.7, nb); const qa = (cr * cr) / (2 * fric);
        u1 = Math.min((-span + Math.sqrt(span * span + 4 * qa * total)) / (2 * qa), fl.vx * 0.7);
        if (nb === 0 || u1 * span <= limit) break;
        hs = hs.slice(0, nb - 1);
      }
      let x = tx, first = true;
      for (let i = 0; i < nb; i++) {
        const bvx = u1 * Math.pow(0.7, i), bd = (2 * hs[i]) / grv;
        legs.push({ t: t0, x, vx: bvx, vy: hs[i], y0: 0, dur: bd, say: first && shot === 'lip-out' && toCup <= cup ? '덜컹!' : null });
        x += dir * bvx * bd; t0 += bd; first = false;
      }
      // The roll: on at the last bounce's speed (0.7 of it), slowing evenly over what is left.
      let left = Math.max(0, total - (x - tx) * dir);
      const v0 = Math.max(40, u1 * cr);
      const rollTo = (dist, acc) => { if (dist <= 0.5) return 0; const vv = Math.max(0, v0 * v0 - 2 * acc * dist); return (v0 - Math.sqrt(vv)) / Math.max(0.001, acc); };
      const toCupNow = (cx - x) * dir;
      if (shot === 'roll-in') {
        // Rolls on toward a stop just past the cup and drops in on the way.
        const dc = Math.max(0, toCupNow), acc = (v0 * v0) / (2 * Math.max(left, dc + 4)), tr = rollTo(dc, acc);
        if (tr > 0) { legs.push({ t: t0, x, vx: v0, acc, vy: 0, y0: 0, dur: tr, roll: true, quiet: true }); t0 += tr; }
        legs.push({ t: t0, x: cx, vx: 0, vy: 0, y0: 0, dur: 0.4, sink: true, quiet: true });
        return { legs, land: cx, done: t0 + 0.4, goalT: t0, hole: true };
      }
      if (shot === 'roll-short') {
        left = Math.max(0, Math.min(left, toCupNow - cup * 1.3));
        if (left > 0.5) {
          const acc = (v0 * v0) / (2 * left), tr = (2 * left) / v0;
          legs.push({ t: t0, x, vx: v0, acc, vy: 0, y0: 0, dur: tr, roll: true, quiet: true }); t0 += tr; x += dir * left;
        }
        return { legs, land: x, done: t0, goalT: -1 };
      }
      // Lip-out: rolling up to the cup (if it is still ahead) fast, a little hop over it (덜컹!), and
      // on, slower, to a stop.
      let acc = (v0 * v0) / (2 * Math.max(left, 1)), vr = v0;
      if (toCupNow > cup) {
        const dc = toCupNow - cup, tr = rollTo(dc, acc);
        if (tr > 0) { legs.push({ t: t0, x, vx: v0, acc, vy: 0, y0: 0, dur: tr, roll: true, quiet: true }); t0 += tr; }
        x = cx - dir * cup; vr = Math.max(60, v0 - acc * tr); left = Math.max(0, left - dc);
        // Over the cup at the speed it got there (a small hop, as long as the crossing takes).
        const hop = Math.max(0.12, Math.min(0.3, (2 * cup) / Math.max(80, vr)));
        legs.push({ t: t0, x, vx: (2 * cup) / hop, vy: (grv * hop) / 2, y0: 0, dur: hop, say: '덜컹!' });
        t0 += hop; x += dir * 2 * cup; left = Math.max(0, left - 2 * cup); vr *= 0.6;
      }
      if (left > 0.5) {
        acc = (vr * vr) / (2 * left); const tr = (2 * left) / vr;
        legs.push({ t: t0, x, vx: vr, acc, vy: 0, y0: 0, dur: tr, roll: true, quiet: true }); t0 += tr; x += dir * left;
      }
      return { legs, land: clampX(x), done: t0, goalT: -1 };
    }
    if (s.hoop && ['swish', 'rim-in', 'rim-out', 'bank-in', 'bank-out'].includes(shot)) {
      // 🏀 The flight goes right to where the hub says it meets the hoop, on this drawing of it: the
      // middle of the ring, the near or far rim (탕!), or up the board's face (쿵!).
      const g = hoopGeo(s), ringY = g.ringY, hcx = g.hcx, rw = g.rw;
      const clampX = (xx) => Math.max(30, Math.min(ar.wd - 30, xx));
      const dxr = s.shotDx != null ? Number(s.shotDx) : 0;
      let tx, ty;
      if (shot.startsWith('bank-')) {
        const up = s.shotUp != null ? Number(s.shotUp) : 0.5;
        tx = g.face - dir * s.bsz * 0.32; ty = ringY + Math.max(0.12, Math.min(0.9, up)) * g.boardH;
      } else if (shot.startsWith('rim-')) { tx = hcx + dir * (dxr >= 0 ? 1 : -1) * rw * 0.85; ty = ringY + 3; }
      else { tx = hcx + dir * Math.max(-1, Math.min(1, dxr / 0.02)) * rw * 0.3; ty = ringY; }
      const fl = aimTo(s, tx, ty);
      legs.push({ t: 0, x: s.bx, vx: fl.vx, vy: fl.vy, y0: 0, dur: fl.t, flight: true });
      t0 = fl.t;
      let xAt = tx, vyAt = fl.vy - grv * fl.t;
      if (shot.startsWith('bank-')) {
        // Off the board's face (쿵!): knocked back toward the ring, down to its height.
        const vBack = Math.max(60, fl.vx * 0.3), vyB = Math.min(0, vyAt) * 0.3, tDown = fallT(ty - ringY, vyB);
        legs.push({ t: t0, x: tx, vx: -vBack, vy: vyB, y0: ty, dur: tDown, say: '쿵!' });
        t0 += tDown; xAt = clampX(tx - dir * vBack * tDown); vyAt = vyB - grv * tDown;
      } else if (shot === 'rim-in') {
        // Off the rim: up a little and back down over the middle.
        const hop = 0.42;
        legs.push({ t: t0, x: xAt, vx: ((hcx - xAt) * dir) / hop, vy: (grv * hop) / 2, y0: ty, dur: hop, say: '탕!' });
        t0 += hop; xAt = hcx; vyAt = (-grv * hop) / 2;
      }
      if (['swish', 'rim-in', 'bank-in'].includes(shot)) {
        const vDrop = Math.min(-80, vyAt * 0.35), tDrop = fallT(ringY, vDrop), goalT = t0;
        legs.push({ t: t0, x: xAt, vx: ((hcx - xAt) * dir) / Math.max(0.05, tDrop), vy: vDrop, y0: ringY, dur: tDrop, quiet: true });
        t0 += tDrop;
        legs.push({ t: t0, x: hcx, vx: 0, vy: 200, y0: 0, dur: 0.4 });
        return { legs, land: hcx, done: t0 + 0.4, goalT };
      }
      // Out: off the rim it springs back away from the board, toward the kicker, down to the floor,
      // and one small bounce.
      const vyOut = 300, vxOut = -240, tOut = fallT(ringY, vyOut);
      legs.push({ t: t0, x: xAt, vx: vxOut, vy: vyOut, y0: ringY, dur: tOut, say: '탕!' });
      t0 += tOut; xAt = clampX(xAt + dir * vxOut * tOut);
      legs.push({ t: t0, x: xAt, vx: vxOut * 0.4, vy: 150, y0: 0, dur: 0.3 });
      t0 += 0.3; xAt = clampX(xAt + dir * vxOut * 0.4 * 0.3);
      return { legs, land: xAt, done: t0, goalT: -1 };
    }
    for (let i = 0; i < 4; i++) {
      const dur = (2 * vy) / grv;
      legs.push({ t: t0, x: px, vx, vy, y0: 0, dur, flight: i === 0 });
      t0 += dur; px += dir * vx * dur;
      if (px < 30 || px > ar.wd - 30) { px = Math.max(30, Math.min(ar.wd - 30, px)); vx = 0; }
      vy *= 0.38; vx *= 0.7;
      if (vy < 60) break;
    }
    return { legs, land: px, done: t0, goalT: -1 };
  }

  // 🚀 Hit too hard: off the top of the screen the way it was hit, a while adrift in space (a dark
  // window near the top: stars, a ringed planet, the Earth small below), then back down where it
  // stood. False once it is over.
  function spaceTrip(s, ff, now) {
    const dir = s.dir, u = s.bsz / 34, bcy = s.bfoot - s.bsz / 2, kb = s.mb.kind, faceB = dir > 0;
    const rise = 1, adrift = rise + 3, fall = adrift + 0.7, lie = fall + 1, up = lie + 0.3;
    const far = (bcy + 90) / Math.sin(s.angle), cosA = Math.cos(s.angle), sinA = Math.sin(s.angle);
    if (ff < rise) {
      const e = Math.pow(ff / rise, 1.6), px = s.bx + dir * cosA * far * e, py = bcy - sinA * far * e;
      const sk = rgba('#9BD0FF', 0.7);
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * 6 * u, ln = (30 + (i % 2) * 24) * Math.max(0.7, u) * (0.5 + ff);
        line([[px - dir * cosA * 20 * u - sinA * off, py + sinA * 20 * u - dir * cosA * off], [px - dir * cosA * (20 * u + ln) - sinA * off, py + sinA * (20 * u + ln) - dir * cosA * off]], sk, 3);
      }
      if (ff < 0.8) {
        const q = ff / 0.8;
        for (let i = 0; i < 6; i++) {
          const ga = (i * PI) / 3 + 0.4, r = (6 + 14 * q) * u;
          ell(s.bx + Math.cos(ga) * (14 + 40 * q) * u, s.bfoot - 6 - Math.abs(Math.sin(ga)) * 20 * q * u, r, r, rgba('#E8E2D4', 0.6 * (1 - q)));
        }
      }
      word('슈우웅~!', s.bx + dir * 40, bcy - 60 - ff * 30, 22, '#9BD0FF', 1 - ff / rise);
      pet(kb, 2, px, py, s.bsz * (1 - (0.5 * ff) / rise), dir * ff * 30, faceB);
    } else if (ff < adrift) {
      const kq = (ff - rise) / (adrift - rise), fade = Math.max(0, Math.min(1, Math.min(kq / 0.1, (1 - kq) / 0.12)));
      const boxW = Math.min(340, s.area.wd - 40), boxH = 190, boxT = 30;
      const boxL = Math.max(20, Math.min(s.area.wd - boxW - 20, s.bx + dir * cosA * far - boxW / 2));
      rrect(boxL, boxT, boxW, boxH, 16, rgba('#0B1030', 0.96 * fade), rgba('#7C6CF0', fade), 2);
      for (let i = 0; i < 30; i++) {
        const stx = boxL + 10 + ((i * 73) % (boxW - 20)), sty = boxT + 10 + ((i * 41) % (boxH - 20)), tw = fade * (0.35 + 0.65 * Math.abs(Math.sin(now * 3 + i)));
        const z = i % 3 ? 2 : 3;
        rect(stx - 1, sty - 1, z, z, rgba(i % 5 ? '#FFFFFF' : '#FFE066', tw));
      }
      const plx = boxL + boxW * 0.8, ply = boxT + boxH * 0.3;
      ell(plx, ply, 20, 20, rgba('#F4A261', fade)); ell(plx - 5, ply + 6, 9, 5, rgba('#E07A3F', 0.7 * fade));
      ell(plx, ply, 32, 8, null, rgba('#FFE066', 0.9 * fade), 3);
      const erx = boxL + boxW * 0.16, ery = boxT + boxH * 0.8;
      ell(erx, ery, 15, 15, rgba('#4CC9F0', fade)); ell(erx - 4, ery - 3, 7, 5, rgba('#7EE07A', fade)); ell(erx + 6, ery + 5, 4, 3, rgba('#7EE07A', fade));
      if (fade > 0.5) {
        const drx = boxL + 50 + (boxW - 100) * kq, dry = boxT + boxH * 0.52 + Math.sin(now * 1.6) * 14;
        pet(kb, Math.floor(now * 2) % 2 ? 3 : 2, drx, dry, s.bsz * 0.9, now * 1.3, faceB);
        word('?', drx + 22 * u, dry - 26 * u, 16, '#FFFFFF', 0.5 + 0.5 * Math.sin(now * 5));
      }
      word('우주까지 날아갔다!', boxL + boxW / 2, boxT + boxH + 22, 22, '#9BD0FF', fade);
    } else if (ff < fall) {
      const kq = (ff - adrift) / (fall - adrift);
      pet(kb, 2, s.bx, -20 + (bcy + 20) * kq * kq, s.bsz, dir * kq * 6, faceB);
    } else if (ff < lie) {
      const kq = ff - fall, fl = Math.min(1, kq / 0.2), sq = kq < 0.1 ? 0.25 : 0;
      pet(kb, 2, s.bx, s.bfoot - s.bsz * 0.32, s.bsz, (-dir * fl * PI) / 2, faceB, 1 + sq, 1 - sq);
      word('털썩!', s.bx, s.bfoot - 46 - Math.min(kq, 0.4) * 25, 22, '#7C6CF0', kq > 0.7 ? 1 - (kq - 0.7) / 0.3 : 1);
    } else if (ff < up) {
      const kq = (ff - lie) / (up - lie);
      pet(kb, Math.floor(now * 6) % 4, s.bx, s.bfoot - s.bsz * 0.32 - s.bsz * 0.18 * kq, s.bsz, (-dir * (1 - kq) * PI) / 2, faceB);
    } else return false;
    return true;
  }

  function draw() {
    const s = sh;
    if (!s) return;
    // Someone came or went and the row was laid out again: the pets are not where they were.
    if (S.members.get(s.akey) !== s.ma || S.members.get(s.bkey) !== s.mb) { end(); return; }
    lastFrame = performance.now();
    const ar = s.area, now = s.clock(), dir = s.dir, u = s.bsz / 34;
    let tt = now - s.pt0;
    const kick = s.kick, fr = Math.floor(now * 6) % 4, acy = s.afoot - s.asz / 2, bcy = s.bfoot - s.bsz / 2;
    // Where the one who does it stands to hit: just behind the other, on the side away from where it flies.
    s.nearX = s.bx - dir * 22 * u * (kick ? 1.2 : 1.5);
    const ncy = s.bfoot - s.asz / 2;
    const faceA = dir < 0, faceB = dir > 0; // the one hit looks at the one who does it
    if (s.phase === 'run' && tt >= SMK.run) { phase(s, s.mine ? 'aim' : 'spot'); tt = 0; }
    if (s.phase === 'spot' && tt >= SMK.spot) { phase(s, 'go'); tt = 0; s.path = plan(s); }
    // What this frame shows; a click is judged by it.
    s.seen = [s.phase, tt];
    shown(s.ma, false); shown(s.mb, false);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, ar.wd, ar.ht);
    c.globalAlpha = 1;
    const ka = s.ma.kind, kb = s.mb.kind;
    const sinceGoal = s.goal && s.path && s.phase === 'go' && s.path.goalT >= 0 ? tt - SMK.strike - s.path.goalT : -1;
    if (s.hoop) hoopArt(s, sinceGoal, now);
    if (s.golf) golfArt(s, sinceGoal, now);
    if (['run', 'aim', 'power', 'spot'].includes(s.phase)) {
      if (s.phase === 'aim' || s.phase === 'power') glow((s.bx + s.nearX) / 2, s.bfoot - s.bsz * 0.6, s.bsz * 4, [[0, 40], [0.6, 30], [1, 0]]);
      if (s.phase === 'spot') spotlight(s, tt);
      const shake = s.phase === 'run' ? 0 : Math.sin(now * 50) * 1.2;
      pet(kb, s.phase === 'run' ? fr : 2, s.bx + shake, bcy, s.bsz, 0, faceB);
      if (s.phase === 'run') {
        const q = ease3(tt / SMK.run), fy = acy + (ncy - acy) * q;
        pet(ka, Math.floor(now * 10) % 4, s.ax + (s.nearX - s.ax) * q, fy - Math.abs(Math.sin(tt * 22)) * 5 * u, s.asz, 0, faceA);
      } else if (kick) pet(ka, 1, s.nearX - dir * 4 * u, ncy - 16 * u + Math.sin(now * 6) * 2, s.asz, ((faceA ? 1 : -1) * PI) / 2, faceA, 1.1, 0.9);
      else { pet(ka, 1, s.nearX, ncy, s.asz, dir * 0.2, faceA); held(s.nearX + dir * 9 * u + Math.sin(now * 40) * 1.2, ncy - 3 * u, -2.3, 0, dir, u); }
      if (s.phase !== 'run') word('!', s.bx, bcy - 30 * u, 22, '#FF5A5A');
      if (s.phase === 'aim' || s.phase === 'power') {
        // ① The arrow, swinging up and down from the one to be hit, the way it will fly.
        const ang = s.phase === 'aim' ? smkAngle(tt) : s.angle;
        const col = s.phase === 'aim' ? '#FF9F1C' : '#2FBF71', len = 70, ox = s.bx + dir * 8, oy = bcy;
        const guide = [];
        for (let gd = 12; gd <= 68; gd += 4) { const ra = (gd * PI) / 180; guide.push([ox + dir * Math.cos(ra) * len, oy - Math.sin(ra) * len]); }
        line(guide, rgba(col, 0.3), 2);
        const ex = ox + dir * Math.cos(ang) * len, ey = oy - Math.sin(ang) * len;
        c.save(); c.setLineDash([2, 9]); line([[ox, oy], [ex, ey]], col, 5); c.restore();
        const at = Math.atan2(ey - oy, ex - ox);
        shape([[ex + Math.cos(at) * 12, ey + Math.sin(at) * 12], [ex + Math.cos(at + 2.4) * 12, ey + Math.sin(at + 2.4) * 12], [ex + Math.cos(at - 2.4) * 12, ey + Math.sin(at - 2.4) * 12]], col);
        word(s.phase === 'aim' ? '① 방향! 클릭' : `각도 ${Math.round((s.angle * 180) / PI)}°`, ox + dir * 50, oy - 105, s.phase === 'aim' ? 20 : 14, col);
        if (s.phase === 'power') {
          // ② The power gauge, filling and emptying.
          const pw = s.frozen ?? smkPower(tt), gw = 130, gh = 16, gx = s.bx - dir * 30 - gw / 2, gy = bcy - 74;
          rrect(gx, gy, gw, gh, 8, rgba('#14121D', 0.9), '#FFFFFF', 2);
          const gr = c.createLinearGradient(gx, 0, gx + gw, 0);
          gr.addColorStop(0, '#7EE07A'); gr.addColorStop(0.6, '#FFD34E'); gr.addColorStop(1, '#FF5A5A');
          rrect(gx + 3, gy + 3, Math.max(4, (gw - 6) * pw), gh - 6, 5, gr);
          // From 90% up it goes to space: that end of the gauge is marked.
          const sx0 = gx + 3 + (gw - 6) * SMK.spacePw;
          c.strokeStyle = '#4CC9F0'; c.lineWidth = 2; c.strokeRect(sx0, gy + 1, (gw - 6) * (1 - SMK.spacePw) + 2, gh - 2);
          word('우주', sx0 + ((gw - 6) * (1 - SMK.spacePw)) / 2, gy + gh + 11, 11, '#9BD0FF');
          if (pw >= SMK.spacePw) rrect(gx - 2, gy - 2, gw + 4, gh + 4, 9, null, rgba('#4CC9F0', 0.9), 3);
          word('② 힘! 클릭', gx + gw / 2, gy - 18, 20, '#FF9F1C');
        }
        if (s.mine) word('클릭 또는 Space · 취소 Esc', s.bx - dir * 30, bcy - 140, 13, '#CFC9E6');
      }
    } else {
      // ── the hit and after (tt from the strike) ──
      if (tt < 0.15) radial(s.bx, bcy, s.bsz * 3, s.bsz * 3, `rgba(255, 255, 255, ${(200 * (1 - tt / 0.15)) / 255})`, 'rgba(255, 255, 255, 0)');
      const nx = s.nearX;
      if (tt < SMK.strike) {
        const q = ease3(tt / SMK.strike);
        if (kick) pet(ka, 1, nx - dir * 4 * u + dir * 12 * u * q, ncy - 16 * u + 10 * u * q, s.asz, ((faceA ? 1 : -1) * PI) / 2, faceA, 1.1, 0.9);
        else {
          const rot = -2.3 + (-5.33 + 2.3) * q, hx = nx + dir * 9 * u, hy = ncy - 3 * u, rad = 44 * 0.8 * u * 0.69;
          for (let i = 1; i <= 10; i++) {
            const a1 = -2.3 + ((rot + 2.3) * (i - 1)) / 10 - PI / 2, a2 = -2.3 + ((rot + 2.3) * i) / 10 - PI / 2;
            line([[hx + dir * Math.cos(a1) * rad, hy + Math.sin(a1) * rad], [hx + dir * Math.cos(a2) * rad, hy + Math.sin(a2) * rad]], rgba('#7C6CF0', 0.45), 5);
          }
          pet(ka, 1, nx, ncy, s.asz, -dir * 0.2, faceA); held(hx, hy, rot, q > 0.85 ? (q - 0.85) / 0.15 : 0, dir, u);
        }
      } else {
        // Back home, along the row it came from.
        const q = clamp01((tt - SMK.strike - 0.35) / 0.5), moving = q > 0 && q < 1;
        if (s.space && q >= 1) dancer(ka, s.ax, s.afoot, s.asz, tt - SMK.strike - 0.85, 0.2);
        else pet(ka, moving ? Math.floor(now * 10) % 4 : 0, nx + (s.ax - nx) * ease3(q), ncy + (acy - ncy) * ease3(q), s.asz, 0, moving ? !faceA : faceA);
        if (!kick && tt < SMK.strike + 0.35) {
          const q2 = (tt - SMK.strike) / 0.3;
          held(nx + dir * 9 * u, ncy - 3 * u, -5.33 - 0.35 * Math.min(1, q2), q2 < 1 ? Math.max(0, 1 - q2) : 0, dir, u);
        }
      }
      if (tt >= SMK.strike - 0.03 && tt < SMK.strike + 0.4) {
        const q = (tt - SMK.strike + 0.03) / 0.43, bp = rgba('#7C6CF0', 1 - q);
        for (let i = 0; i < 10; i++) {
          const ga = (i * PI) / 5, r0 = (20 + 40 * q) * u * 0.7, r1 = r0 + 10;
          line([[s.bx + Math.cos(ga) * r0, bcy + Math.sin(ga) * r0], [s.bx + Math.cos(ga) * r1, bcy + Math.sin(ga) * r1]], bp, 3);
        }
        word(kick ? '뻥!' : '뿅!', s.bx, bcy - 44 * u - q * 16, 30, '#FF9F1C', 1 - q * 0.5);
      }
      // ── the one hit ──
      const pl = s.path, ff = tt - SMK.strike;
      const lie = pl.done + 1.4, up = lie + 0.3, back = up + Math.abs(pl.land - s.bx) / 900;
      if (ff >= 0 && s.space) {
        if (!s.crowd) s.crowd = crowdOf(s);
        for (const d of s.crowd) { shown(d.m, false); dancer(d.m.kind, d.x, d.foot, d.size, ff, d.seed); }
        if (!spaceTrip(s, ff, now)) { end(); return; }
      } else if (ff < 0) pet(kb, 2, s.bx, bcy, s.bsz, 0, faceB);
      else if (ff < pl.done) {
        let lg = pl.legs.find((l) => ff < l.t + l.dur) || pl.legs[pl.legs.length - 1];
        const kq = ff - lg.t;
        const py = lg.sink || lg.roll ? bcy - lg.y0 : bcy - (lg.y0 + lg.vy * kq - (SMK.grav * kq * kq) / 2);
        const px = Math.max(30, Math.min(ar.wd - 30, lg.x + dir * (lg.roll ? lg.vx * kq - (lg.acc * kq * kq) / 2 : lg.vx * kq)));
        if (lg.flight) {
          s.trail.push([px, py]);
          // Wind streaks behind it, and sparkles falling off.
          const wp = rgba('#7C6CF0', 0.55 * Math.min(1, 0.4 + s.power));
          for (let i = 0; i < 5; i++) {
            const oy2 = (i - 2) * 7 * u, ln = (24 + (i % 2) * 18 + Math.sin(now * 30 + i) * 6) * Math.max(0.7, u);
            line([[px - dir * 22 * u, py + oy2], [px - dir * (22 * u + ln), py + oy2]], wp, 3);
          }
          if (Math.random() < 0.7) s.sparks.push({ x: px, y: py, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40, t: now, c: pick(['#FFD34E', '#FF9F1C', '#7C6CF0', '#2FBF71']) });
          pet(kb, 2, px, py, s.bsz, dir * kq * (10 + 22 * s.power), faceB);
        } else if (lg.sink) {
          // ⛳ Down into the cup: smaller and lower until it is gone.
          const q = Math.min(1, kq / lg.dur), zs = s.bsz * (1 - 0.9 * q);
          if (zs > 2) pet(kb, 2, px, s.bfoot - zs / 2 + q * 6, zs, dir * q * 4, faceB);
        } else if (lg.roll) {
          // Rolling: it turns as far as it goes.
          const rolled = lg.vx * kq - (lg.acc * kq * kq) / 2;
          pet(kb, 2, px, py + s.bsz * 0.04, s.bsz, (dir * rolled) / (s.bsz * 0.45), faceB);
        } else pet(kb, 2, px, py, s.bsz, dir * (kq / Math.max(0.001, lg.dur)) * PI * 2, faceB, 1.1, 0.92);
        for (const l of pl.legs.slice(1)) {
          const kb2 = ff - l.t;
          if (!l.quiet && kb2 >= 0 && kb2 < 0.3) word(l.say || '통!', l.x, s.bfoot - Number(l.y0) - 40 - kb2 * 40, 18 * (1 - kb2 / 0.6), '#FF9F1C', 1 - kb2 / 0.3);
        }
      } else if (pl.hole && ff < up) {
        // ⛳ Out of the cup again (퐁!), up in a little hop and down on its feet.
        const k2 = ff - pl.done, q = Math.min(1, k2 / 0.5), zs = s.bsz * (0.15 + 0.85 * ease3(q));
        pet(kb, q < 1 ? 2 : fr, pl.land, s.bfoot - zs / 2 - Math.sin(q * PI) * s.bsz * 0.8, zs, 0, faceB);
        if (k2 < 0.6) word('퐁!', pl.land, s.bfoot - s.bsz * 1.6 - k2 * 30, 20, '#7EE07A', 1 - k2 / 0.6);
      } else if (ff < lie) {
        const k2 = ff - pl.done, fl = Math.min(1, k2 / 0.25), sq = k2 < 0.1 ? 0.2 : 0;
        pet(kb, 2, pl.land, s.bfoot - s.bsz * 0.32, s.bsz, (-dir * fl * PI) / 2, faceB, 1 + sq, 1 - sq);
        if (k2 < 0.6) {
          const qd = k2 / 0.6;
          for (const sd of [-1, 1]) for (let j = 0; j < 3; j++) ell(pl.land + sd * (14 + qd * 30 + j * 8) * u, s.bfoot - 4 - j * 4 - qd * 8, 4 + qd * 6, 4 + qd * 6, rgba('#C9BFA6', 0.55 * (1 - qd)));
        }
        word('털썩!', pl.land, s.bfoot - 46 - Math.min(k2, 0.4) * 25, 22, '#7C6CF0', k2 > 1 ? 1 - (k2 - 1) / 0.4 : 1);
        word(`${(Math.abs(pl.land - s.bx) / 30).toFixed(1)}m`, pl.land, s.bfoot - 78, 16, '#2FBF71', k2 > 1.1 ? 1 - (k2 - 1.1) / 0.3 : 1);
      } else if (ff < up) {
        const q = (ff - lie) / (up - lie);
        pet(kb, fr, pl.land, s.bfoot - s.bsz * 0.32 - s.bsz * 0.18 * q, s.bsz, (-dir * (1 - q) * PI) / 2, faceB);
      } else if (ff < back) {
        const q = (ff - up) / (back - up), px = pl.land + (s.bx - pl.land) * q;
        pet(kb, Math.floor(now * 10) % 4, px, bcy - Math.abs(Math.sin(ff * 20)) * 4, s.bsz, 0, !faceB);
        if (Math.random() < 0.5) s.sparks.push({ x: px, y: s.bfoot - 4, vx: 0, vy: -10, t: now, c: '#C9BFA6', dust: true });
      } else { end(); return; }
      // The dotted way it flew, fading after it lands.
      const ta = ff < pl.done ? 0.6 : Math.max(0, 0.6 - (ff - pl.done) * 0.5);
      if (ta > 0) { c.fillStyle = rgba('#7C6CF0', Math.round(ta * 100) / 100); for (let i = 0; i < s.trail.length; i += 4) c.fillRect(s.trail[i][0] - 1.5, s.trail[i][1] - 1.5, 3, 3); }
      // Sparkles and dust: falling and fading over a second.
      s.sparks = s.sparks.filter((sp) => now - sp.t < 1);
      for (const sp of s.sparks) {
        const kq = now - sp.t, sx2 = sp.x + sp.vx * kq, sy2 = sp.y + sp.vy * kq + 60 * kq * kq, br = rgba(sp.c, Math.round((1 - kq) * 100) / 100);
        if (sp.dust) ell(sx2, sy2, 3 + kq * 6, 3 + kq * 6, br);
        else { c.save(); c.translate(sx2, sy2); c.rotate((kq * 340 * PI) / 180); c.fillStyle = br; c.fillRect(-3, -1, 6, 2); c.fillRect(-1, -3, 2, 6); c.restore(); }
      }
    }
  }

  // ── what pet.js calls ──
  // 🦶 on someone else's pet: 날아차기 or 뿅망치 — or a note that they said no (pet ⚙️).
  function menuFor(p) {
    if (!p?.who) return [];
    const f = (S.st?.friends || []).find((x) => x.floor === p.floor && x.who === p.who);
    if (f && f.smackable === false) return [{ text: '🦶 날려버리기', sub: [{ text: '🙅 날려버리기를 안 받는 사람이에요', off: true }] }];
    return [{ text: '🦶 날려버리기', sub: [['kick', '🦶 날아차기'], ['hammer', '🔨 뿅망치']].map(([how, text]) => ({ text, run: () => smackDo({ to: p.who, how, floor: p.floor }) })) }];
  }
  // A smack line on my floor: everyone sees the show; I already play mine from my own hit.
  function play(m, who, st) {
    const f = m?.fish;
    if (m.mine && Date.now() - sentAt < 15_000) return;
    if (who === null || who === undefined) return;
    // Aimed at me or done by me plays even with others' effects off.
    if (!(m.mine || f?.me || !st?.fxOff)) return;
    watch(who, f, m);
  }
  function state(st) { if (sh && st && !st.on) end(); }
  // The frames run on the screen's own clock; if that stops (a hidden page), the tick keeps it going.
  function tick() { if (sh && performance.now() - lastFrame > 400) draw(); }
  Mod.smack = { menuFor, play, state, tick, command: () => false, busy: () => !!sh, current: () => sh, end };
})();
