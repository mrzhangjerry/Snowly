// Snowly renderer.
// The snow lying on the taskbar is a height map: one column every DX pixels.
// - Falling flakes add snow where they land.
// - Snow slides when a slope is steeper than the angle of repose, so piles form
//   natural cones and wedges.
// - The plow's body is a solid wall. Snow the blade runs into is shoved in front of
//   it, so a wedge of snow builds up and grows as it travels. When the wedge gets
//   taller than the blade, clumps tumble over the top, roll forward, and some spill
//   off to the side.
(() => {
  'use strict';

  const api = window.snowAPI;
  if (!api) document.body.classList.add('demo');      // opened in a normal browser
  const params = new URLSearchParams(location.search);
  const FAST = Math.max(1, +params.get('fast') || 1);  // preview/testing: speed up time

  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');

  // ---------------- settings ----------------
  const settings = { snow: 2, plow: true, plowSize: 1, paused: false };
  const SNOW_LEVELS = [0, 0.5, 1, 1.8];
  if (api) {
    api.onSettings((s) => Object.assign(settings, s));
    api.onCommand((c) => { if (c === 'clear') { h.fill(0); plow.load = 0; } });
  }

  // ---------------- world ----------------
  const DX = 2;                 // px per height-map column
  const REPOSE = 0.62;          // max rise per px before snow slides (≈ 32°)
  const RESID = 0.6;            // thin layer the plow leaves behind
  let W = 0, H = 0, DPR = 1, N = 0;
  let h = new Float32Array(0);  // snow height per column (px)
  let lock = new Uint8Array(0); // 1 = column is under the plow (solid)
  let tmp = new Float32Array(0);

  const S = () => settings.plowSize;
  const BLADE_H = () => 22 * S();
  const MAX_H = () => Math.max(70, 90 * S());

  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    const n = Math.ceil(W / DX) + 1;
    if (n !== N) {
      const old = h, oldN = N;
      h = new Float32Array(n); lock = new Uint8Array(n); tmp = new Float32Array(n);
      if (oldN > 0) {
        for (let i = 0; i < n; i++) h[i] = old[Math.min(oldN - 1, Math.round(i * (oldN - 1) / Math.max(1, n - 1)))];
      } else {
        const p = Math.random() * 10;
        for (let i = 0; i < n; i++) h[i] = 10 + 2.5 * Math.sin(i * 0.031 + p) + 1.6 * Math.sin(i * 0.11 + p * 2) + Math.random() * 0.6;
      }
      N = n;
      makeSparkles();
    }
    plow.x = Math.min(Math.max(plow.x, 40), Math.max(40, W - 40));
  }
  window.addEventListener('resize', resize);

  // snow sliding (angle of repose), never through the plow
  function relax(iters) {
    const lim = REPOSE * DX;
    for (let it = 0; it < iters; it++) {
      if (it & 1) {
        for (let i = N - 2; i >= 0; i--) step(i, lim);
      } else {
        for (let i = 0; i < N - 1; i++) step(i, lim);
      }
    }
  }
  // gentle rounding so mounds look soft rather than faceted
  function soften(k) {
    for (let i = 1; i < N - 1; i++) {
      if (lock[i] || lock[i - 1] || lock[i + 1]) continue;
      const lap = h[i - 1] + h[i + 1] - 2 * h[i];
      tmp[i] = lap * k;
    }
    for (let i = 1; i < N - 1; i++) { h[i] += tmp[i]; tmp[i] = 0; }
  }
  function step(i, lim) {
    if (lock[i] || lock[i + 1]) return;
    const d = h[i] - h[i + 1];
    if (d > lim) { const m = (d - lim) * 0.5; h[i] -= m; h[i + 1] += m; }
    else if (d < -lim) { const m = (-d - lim) * 0.5; h[i] += m; h[i + 1] -= m; }
  }

  const DEP_W = [0.1, 0.2, 0.4, 0.2, 0.1];
  function deposit(i, a) {
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j >= 0 && j < N && !lock[j]) h[j] += a * DEP_W[k + 2];
    }
  }

  // ---------------- falling snow ----------------
  const flakes = [];
  const sprite = document.createElement('canvas');
  (function makeSprite() {
    sprite.width = sprite.height = 32;
    const g = sprite.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,.95)');
    gr.addColorStop(0.7, 'rgba(255,255,255,.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  })();
  function newFlake(fromTop) {
    const big = Math.random() < 0.45;
    const r = big ? 1.6 + Math.random() * 1.8 : 0.7 + Math.random() * 0.9;
    return {
      x: Math.random() * (W + 80) - 40,
      y: fromTop ? -10 - Math.random() * 60 : Math.random() * H,
      r, vy: 28 + r * 17 + Math.random() * 12,
      ws: 0.5 + Math.random() * 1.5, wa: 8 + Math.random() * 16, p: Math.random() * 7,
      a: 0.55 + Math.random() * 0.45,
    };
  }
  const SNOW_RATE = 0.75;

  // ---------------- clumps (tumbling snow) & exhaust ----------------
  const clumps = [];
  const puffs = [];

  // ---------------- the plow ----------------
  const plow = { x: 60, dir: 1, face: 1, state: 'push', t: 0, odo: 0, lift: 0, load: 0, backed: 0, speed: 0 };
  // body extents relative to plow.x, for a plow facing right
  const BACK = () => 31 * S();
  const FRONT = () => 31 * S();   // blade face

  function bodyRange() {
    const lo = plow.dir > 0 ? plow.x - BACK() : plow.x - FRONT();
    const hi = plow.dir > 0 ? plow.x + FRONT() : plow.x + BACK();
    return [lo, hi];
  }

  function updatePlow(dt) {
    lock.fill(0);
    if (!settings.plow) return;
    const s = S();
    const [lo0, hi0] = bodyRange();

    if (plow.state === 'push') {
      plow.lift = Math.max(0, plow.lift - dt * 3);
      // heavier load -> slower, like a real machine straining
      const ahead = sumAhead(16);
      plow.load = ahead;
      const target = 34 * s / (1 + ahead / (420 * s * s));
      plow.speed += (target - plow.speed) * Math.min(1, dt * 3);
      plow.x += plow.dir * plow.speed * dt;
      plow.odo += plow.speed * dt;
    } else if (plow.state === 'backup') {
      plow.lift = Math.min(1, plow.lift + dt * 3);
      const v = 42 * s;
      plow.x -= plow.dir * v * dt; plow.odo -= v * dt; plow.backed += v * dt;
      if (plow.backed > 46 * s) { plow.state = 'pause'; plow.t = 0; }
    } else if (plow.state === 'pause') {
      plow.t += dt;
      if (plow.t > 0.6) { plow.state = 'turn'; plow.t = 0; }
    } else if (plow.state === 'turn') {
      plow.t += dt;
      const T = 1.1;
      plow.face = plow.dir * Math.cos(Math.PI * Math.min(1, plow.t / T));
      if (plow.t >= T) { plow.dir = -plow.dir; plow.face = plow.dir; plow.state = 'push'; plow.speed = 0; }
    }
    plow.x = Math.min(Math.max(plow.x, BACK() + 1), W - BACK() - 1);

    // everything under the body is shoved ahead of the blade (or out the back when not pushing)
    const [lo, hi] = bodyRange();
    const i0 = Math.max(0, Math.floor(Math.min(lo, lo0) / DX));
    const i1 = Math.min(N - 1, Math.ceil(Math.max(hi, hi0) / DX));
    const pushing = plow.state === 'push';
    let dest;
    if (pushing) dest = plow.dir > 0 ? Math.min(N - 1, Math.floor(hi / DX) + 1) : Math.max(0, Math.ceil(lo / DX) - 1);
    else dest = plow.dir > 0 ? Math.max(0, Math.floor(lo / DX) - 1) : Math.min(N - 1, Math.ceil(hi / DX) + 1);
    const ilo = Math.max(0, Math.ceil(lo / DX)), ihi = Math.min(N - 1, Math.floor(hi / DX));
    for (let i = i0; i <= i1; i++) {
      const inside = i >= ilo && i <= ihi;
      if (!inside) continue;
      if (h[i] > RESID) { h[dest] += h[i] - RESID; h[i] = RESID; }
      lock[i] = 1;
    }

    if (pushing) {
      // snow heaped taller than the blade tumbles over the top
      const cap = BLADE_H() * 1.75;
      if (h[dest] > cap) {
        const extra = h[dest] - cap;
        h[dest] = cap;
        spill(dest, extra);
      }
      // engine exhaust
      plow.t += dt;
      if (plow.t > 0.22) {
        plow.t = 0;
        const px = plow.x - plow.dir * 7 * s * Math.sign(plow.face || 1);
        puffs.push({ x: px, y: H - RESID - 36 * s, r: 2.5 * s, life: 0, vx: -plow.dir * 6 });
      }
      // stop when the shoved snow runs into the wall / an old mound near the screen edge
      const wallDist = plow.dir > 0 ? W - hi : lo;
      const resist = sumAhead(30);
      let full = false;
      if (wallDist < 320 * s) {
        // average snow height between blade and the screen edge
        let sum = 0, n = 0;
        if (plow.dir > 0) for (let i = dest; i < N; i++) { sum += h[i]; n++; }
        else for (let i = dest; i >= 0; i--) { sum += h[i]; n++; }
        full = n > 0 && sum / n > BLADE_H() * 1.05;
      }
      if (wallDist < 6 || full || (wallDist < 320 * s && resist > 30 * BLADE_H() * 1.5)) {
        plow.state = 'backup'; plow.backed = 0; plow.t = 0;
      }
    }
  }

  function sumAhead(n) {
    const [lo, hi] = bodyRange();
    let sum = 0;
    if (plow.dir > 0) { const a = Math.ceil(hi / DX) + 1; for (let i = a; i < Math.min(N, a + n); i++) sum += h[i]; }
    else { const a = Math.floor(lo / DX) - 1; for (let i = a; i > Math.max(-1, a - n); i--) sum += h[i]; }
    return sum;
  }

  function spill(col, mass) {
    const n = Math.min(6, Math.ceil(mass / 1.5));
    const x0 = col * DX, y0 = H - h[col];
    for (let k = 0; k < n; k++) {
      const m = mass / n;
      const side = Math.random() < 0.4;  // rolls off sideways (out of the screen plane)
      clumps.push({
        x: x0 + plow.dir * Math.random() * 4, y: y0 - Math.random() * 3,
        vx: plow.dir * (plow.speed + 15 + Math.random() * 55), vy: -15 - Math.random() * 45,
        r: Math.min(4.5, 1.2 + Math.sqrt(m) * 1.1), m, side, life: 0, spin: Math.random() * 6,
      });
    }
    if (clumps.length > 500) clumps.splice(0, clumps.length - 500);
  }

  // ---------------- sparkles on the snow ----------------
  let sparkles = [];
  function makeSparkles() {
    sparkles = [];
    const n = Math.round(N * 0.35);
    for (let k = 0; k < n; k++) sparkles.push({ i: Math.floor(Math.random() * N), d: Math.random(), p: Math.random() * 7, s: 0.6 + Math.random() * 2 });
  }

  // ---------------- update ----------------
  function update(dt, t) {
    updatePlow(dt);

    // flakes
    const target = Math.round(Math.min(700, W * H / 6500) * SNOW_LEVELS[settings.snow]);
    while (flakes.length < target) flakes.push(newFlake(flakes.length > target * 0.4));
    if (flakes.length > target) flakes.length = target;
    const wind = Math.sin(t * 0.11) * 10 + Math.sin(t * 0.37) * 4;
    for (const f of flakes) {
      f.y += f.vy * dt;
      f.x += (wind + Math.sin(t * f.ws + f.p) * f.wa) * dt;
      if (f.x >= 0 && f.x < W) {
        const col = Math.round(f.x / DX);
        if (f.y >= H - h[col] - 0.5) {
          if (!lock[col]) deposit(col, f.r * f.r * SNOW_RATE);
          Object.assign(f, newFlake(true));
          continue;
        }
      }
      if (f.y > H + 10 || f.x < -60 || f.x > W + 60) Object.assign(f, newFlake(true));
    }

    // clumps
    for (let k = clumps.length - 1; k >= 0; k--) {
      const c = clumps[k];
      c.life += dt; c.vy += 650 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.spin += c.vx * dt * 0.2;
      if (c.x < 1) { c.x = 1; c.vx = Math.abs(c.vx) * 0.3; }
      if (c.x > W - 1) { c.x = W - 1; c.vx = -Math.abs(c.vx) * 0.3; }
      if (c.side) { if (c.life > 0.7) clumps.splice(k, 1); continue; }
      const col = Math.min(N - 1, Math.max(0, Math.round(c.x / DX)));
      if (c.y >= H - h[col] && c.vy > 0) {
        if (lock[col]) { c.vy = -c.vy * 0.2; c.y = H - h[col] - 1; continue; }
        // roll a little further downhill before settling
        const slope = (h[Math.max(0, col - 1)] - h[Math.min(N - 1, col + 1)]);
        if (Math.abs(slope) > 1.2 && !c.rolled) { c.rolled = true; c.vx = Math.sign(slope) * Math.max(12, Math.abs(c.vx) * 0.5); c.vy = -20; c.y = H - h[col] - 1; continue; }
        deposit(col, c.m);
        clumps.splice(k, 1);
      }
    }

    // exhaust
    for (let k = puffs.length - 1; k >= 0; k--) {
      const p = puffs[k]; p.life += dt; p.y -= 16 * dt; p.x += p.vx * dt; p.r += 6 * dt;
      if (p.life > 1.6) puffs.splice(k, 1);
    }

    relax(4);
    soften(0.12);

    // very tall mounds slowly compact
    const mh = MAX_H(), soft = mh * 0.6;
    for (let i = 0; i < N; i++) {
      if (h[i] > soft) h[i] -= (h[i] - soft) * 0.03 * dt;
      if (h[i] > mh) h[i] = mh;
    }
  }

  // ---------------- drawing ----------------
  function drawSnow(t) {
    let top = 0;
    for (let i = 0; i < N; i++) if (h[i] > top) top = h[i];
    if (top < 0.3) return;

    const path = new Path2D();
    path.moveTo(0, H + 1);
    path.lineTo(0, H - h[0]);
    let px = 0, py = H - h[0];
    for (let i = 1; i < N; i++) {
      const x = Math.min(W, i * DX), y = H - h[i];
      path.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
      px = x; py = y;
    }
    path.lineTo(W, py);
    path.lineTo(W, H + 1);
    path.closePath();

    // soft shadow so the snow reads on bright wallpapers too
    ctx.save();
    ctx.shadowColor = 'rgba(30,40,80,.35)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = -1;
    const g = ctx.createLinearGradient(0, H - top - 2, 0, H);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#f3f6ff');
    g.addColorStop(1, '#d7dff7');
    ctx.fillStyle = g;
    ctx.fill(path);
    ctx.restore();

    // light from the upper left: shade faces turned away, brighten faces turned toward it
    ctx.save();
    ctx.clip(path);
    for (let i = 1; i < N - 1; i++) {
      if (h[i] < 1.2) continue;
      const a = h[Math.max(0, i - 3)], b = h[Math.min(N - 1, i + 3)];
      const d = (b - a) / (6 * DX);
      const dot = (0.6 * d + 0.8) / Math.sqrt(1 + d * d);
      const x = i * DX - DX / 2, y = H - h[i];
      if (dot < 0.76) {
        const sg = ctx.createLinearGradient(0, y, 0, H);
        const al = Math.min(0.32, (0.76 - dot) * 0.55);
        sg.addColorStop(0, `rgba(120,135,200,${al})`); sg.addColorStop(1, `rgba(120,135,200,${al * 0.4})`);
        ctx.fillStyle = sg;
        ctx.fillRect(x, y, DX, h[i]);
      } else if (dot > 0.84) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, (dot - 0.84) * 2.2)})`;
        ctx.fillRect(x, y, DX, h[i] * 0.5);
      }
    }
    // ambient occlusion where the snow meets the taskbar
    const ao = ctx.createLinearGradient(0, H - 10, 0, H);
    ao.addColorStop(0, 'rgba(140,155,215,0)'); ao.addColorStop(1, 'rgba(140,155,215,.45)');
    ctx.fillStyle = ao; ctx.fillRect(0, H - 10, W, 10);
    // glitter
    for (const s of sparkles) {
      const hh = h[s.i];
      if (hh < 3) continue;
      const a = Math.max(0, Math.sin(t * s.s + s.p));
      if (a < 0.6) continue;
      ctx.fillStyle = `rgba(255,255,255,${(a - 0.6) * 2.5})`;
      const x = s.i * DX, y = H - hh + 1 + s.d * hh * 0.8;
      ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    }
    ctx.restore();

    // crisp rim
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, H - h[0]);
    px = 0; py = H - h[0];
    for (let i = 1; i < N; i++) {
      const x = Math.min(W, i * DX), y = H - h[i];
      ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
      px = x; py = y;
    }
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }

  function rr(x, y, w, hh, r) { ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); }

  function drawPlow(t) {
    if (!settings.plow) return;
    const s = S();
    const pushing = plow.state === 'push';
    const shake = pushing ? Math.sin(t * 47) * 0.45 * s : 0;
    const y = H - RESID;
    ctx.save();
    ctx.translate(plow.x, y + shake);
    ctx.scale(s, s);
    ctx.scale(plow.face || 0.001, 1);

    // ground shadow
    ctx.fillStyle = 'rgba(40,50,90,.25)';
    ctx.beginPath(); ctx.ellipse(-2, 0, 32, 3, 0, 0, Math.PI * 2); ctx.fill();

    // tracks
    ctx.fillStyle = '#1e2127';
    rr(-30, -13, 50, 13, 6.5); ctx.fill();
    // moving lugs
    ctx.fillStyle = '#3a3f48';
    const off = ((plow.odo / s) % 6 + 6) % 6;
    for (let x = -27 + off; x < 17; x += 6) { ctx.fillRect(x, -13, 2.4, 2); ctx.fillRect(x, -2, 2.4, 2); }
    for (let k = 0; k < 4; k++) {
      const cx = -21.5 + k * 11;
      ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.arc(cx, -6.5, 4.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#5d636d'; ctx.beginPath(); ctx.arc(cx, -6.5, 1.8, 0, 7); ctx.fill();
    }

    // body
    let g = ctx.createLinearGradient(0, -27, 0, -12);
    g.addColorStop(0, '#ffd84a'); g.addColorStop(1, '#eba300');
    ctx.fillStyle = g; rr(-28, -27, 44, 15, 3.5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-28, -16, 44, 2);
    // hazard stripes on the back
    ctx.save(); rr(-28, -27, 7, 15, 3.5); ctx.clip();
    ctx.fillStyle = '#222';
    for (let k = -30; k < 0; k += 5) { ctx.beginPath(); ctx.moveTo(k, -12); ctx.lineTo(k + 2.5, -12); ctx.lineTo(k + 10, -27); ctx.lineTo(k + 7.5, -27); ctx.fill(); }
    ctx.restore();

    // cab
    g = ctx.createLinearGradient(0, -45, 0, -26);
    g.addColorStop(0, '#ffdc55'); g.addColorStop(1, '#f2b000');
    ctx.fillStyle = g; rr(-24, -45, 22, 20, 4); ctx.fill();
    // window
    g = ctx.createLinearGradient(-20, -42, -6, -31);
    g.addColorStop(0, '#d8f1ff'); g.addColorStop(1, '#7cc4f2');
    ctx.fillStyle = g; rr(-20.5, -41.5, 15, 11, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath(); ctx.moveTo(-18, -41.5); ctx.lineTo(-14, -41.5); ctx.lineTo(-19, -31.5); ctx.lineTo(-20.5, -31.5); ctx.lineTo(-20.5, -37); ctx.fill();
    // a little snow on the roof
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-13, -45.5, 12, 2.6, 0, 0, 7); ctx.fill();

    // exhaust pipe
    ctx.fillStyle = '#2b2e35'; rr(4, -36, 3.2, 10, 1); ctx.fill();

    // beacon
    const on = Math.floor(t * 3) % 2 === 0;
    if (on) {
      const bg = ctx.createRadialGradient(-13, -50, 0, -13, -50, 9);
      bg.addColorStop(0, 'rgba(255,150,40,.85)'); bg.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = bg; ctx.fillRect(-22, -59, 18, 18);
    }
    ctx.fillStyle = on ? '#ffa021' : '#b2610f';
    rr(-15.5, -51.5, 5, 4.5, 2); ctx.fill();

    // blade arm + blade (lifts when reversing)
    const lift = -plow.lift * 7;
    ctx.strokeStyle = '#4a4f58'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(14, -18); ctx.lineTo(25, -12 + lift * 0.6); ctx.stroke();
    ctx.save(); ctx.translate(0, lift);
    g = ctx.createLinearGradient(23, -27, 33, 0);
    g.addColorStop(0, '#eef0f4'); g.addColorStop(0.6, '#b4bac5'); g.addColorStop(1, '#7e8592');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(26, -27);
    ctx.quadraticCurveTo(34, -15, 32.5, 0);
    ctx.lineTo(27, 0);
    ctx.quadraticCurveTo(28.5, -12, 22, -24);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5b616c'; ctx.fillRect(27, -1.6, 6, 1.6);   // cutting edge
    ctx.restore();

    ctx.restore();
  }

  function drawFx() {
    // exhaust
    for (const p of puffs) {
      const a = 0.18 * (1 - p.life / 1.6);
      ctx.fillStyle = `rgba(120,125,140,${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    // clumps
    for (const c of clumps) {
      const a = c.side ? Math.max(0, 1 - c.life / 0.7) : 1;
      ctx.save();
      ctx.translate(c.x, c.y); ctx.rotate(c.spin);
      ctx.globalAlpha = a;
      const cg = ctx.createRadialGradient(-c.r * 0.35, -c.r * 0.35, 0, 0, 0, c.r * 1.15);
      cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.7, '#f7f8ff'); cg.addColorStop(1, '#dde3f8');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(0, 0, c.r * 1.15, c.r * 0.95, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    // flakes
    for (const f of flakes) {
      const d = f.r * 3.2;
      ctx.globalAlpha = f.a;
      ctx.drawImage(sprite, f.x - d / 2, f.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- loop ----------------
  let last = performance.now();
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    if (!settings.paused) {
      dt *= FAST;
      // sub-step so fast-forward stays stable
      const steps = Math.ceil(dt / 0.034);
      for (let k = 0; k < steps; k++) update(dt / steps, t);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawSnow(t);
    drawPlow(t);
    drawFx();
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);

  // for automated checks
  window.__snow = { get h() { return h; }, plow, settings };
})();
