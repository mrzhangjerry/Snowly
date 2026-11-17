// Snowly renderer.
//
// Everything here is drawn on a layer that sits behind all app windows.
//
// Taskbar snow: a height map with one column every DX pixels.
// - Falling flakes add snow where they land.
// - Snow slides when a slope is steeper than the angle of repose, so drifts form
//   natural slopes and mounds.
// - The plow's body is solid. Snow the blade runs into is shoved in front of it and
//   builds into a growing wedge. Once the wedge is taller than the blade, clumps
//   tumble over the top.
//
// Window snow: each app window gets its own small height map along its top edge. Snow
// builds up there over time, moves with the window, and gets shaken off when the
// window is dragged quickly.
//
// Snowballs: they rest on the taskbar snow or on window tops. Click one to burst it,
// drag one to move it, and drop it on another to stack them.
(() => {
  'use strict';

  const api = window.snowAPI;
  if (!api) document.body.classList.add('demo');      // opened in a normal browser
  const params = new URLSearchParams(location.search);
  const FAST = Math.max(1, +params.get('fast') || 1);  // preview/testing: speed up time

  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------- settings ----------------
  const settings = { snow: 2, plow: true, plowSize: 1, paused: false };
  const SNOW_LEVELS = [0, 0.5, 1, 1.8];

  // ---------------- taskbar snow ----------------
  const DX = 2;                 // px per height-map column
  const REPOSE = 0.62;          // max rise per px before snow slides (about 32 degrees)
  const RESID = 0.6;            // thin layer the plow leaves behind
  let W = 0, H = 0, DPR = 1, N = 0;
  let h = new Float32Array(0);  // snow height per column (px)
  let lock = new Uint8Array(0); // 1 = column is under the plow (solid)
  let tmp = new Float32Array(0);

  const S = () => settings.plowSize;
  const BLADE_H = () => 22 * S();
  const MAX_H = () => Math.max(70, 90 * S());

  // ---------------- window snow ----------------
  const WSTEP = 3;              // px per column on window tops
  const WMAX = 22;              // deepest snow on a window top
  const WIN_RATE = 0.9;         // how fast window tops collect snow, relative to the taskbar
  const wins = new Map();       // window id -> surface
  let winOrder = [];            // surfaces of the windows on screen right now, front first

  // ---------------- particles & things ----------------
  const flakes = [];
  const clumps = [];
  const puffs = [];
  const balls = [];
  let ballSeq = 0;
  let nextBallIn = 30;

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
      if (oldN === 0) {
        for (const [u, r] of [[0.22, 14], [0.235, 9], [0.47, 11], [0.71, 16], [0.86, 10]]) addBall(u * W, r, false);
      }
    }
    plow.x = clamp(plow.x, 40, Math.max(40, W - 40));
  }
  window.addEventListener('resize', resize);

  // snow sliding (angle of repose), never through the plow
  function relax(iters) {
    const lim = REPOSE * DX;
    for (let it = 0; it < iters; it++) {
      if (it & 1) { for (let i = N - 2; i >= 0; i--) step(i, lim); }
      else { for (let i = 0; i < N - 1; i++) step(i, lim); }
    }
  }
  function step(i, lim) {
    if (lock[i] || lock[i + 1]) return;
    const d = h[i] - h[i + 1];
    if (d > lim) { const m = (d - lim) * 0.5; h[i] -= m; h[i + 1] += m; }
    else if (d < -lim) { const m = (-d - lim) * 0.5; h[i] += m; h[i + 1] -= m; }
  }
  // gentle rounding so mounds look soft rather than faceted
  function soften(k) {
    for (let i = 1; i < N - 1; i++) {
      if (lock[i] || lock[i - 1] || lock[i + 1]) continue;
      tmp[i] = (h[i - 1] + h[i + 1] - 2 * h[i]) * k;
    }
    for (let i = 1; i < N - 1; i++) { h[i] += tmp[i]; tmp[i] = 0; }
  }

  const DEP_W = [0.1, 0.2, 0.4, 0.2, 0.1];
  function deposit(i, a) {
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j >= 0 && j < N && !lock[j]) h[j] += a * DEP_W[k + 2];
    }
  }

  // ======================= window surfaces =======================
  function capLimit(i, n) { const d = Math.min(i, n - 1 - i) * WSTEP; return Math.min(WMAX, 0.5 + d * 0.45); }

  // list: windows on screen, front first, in page coordinates
  function setWindows(list) {
    const now = performance.now();
    const order = [];
    list.forEach((r, z) => {
      const n = Math.max(2, Math.ceil(r.w / WSTEP) + 1);
      let s = wins.get(r.id);
      if (!s) {
        s = { id: r.id, cols: new Float32Array(n), x: r.x, y: r.y, w: r.w, h: r.h, seen: now };
        wins.set(r.id, s);
      } else {
        const dx = r.x - s.x, dy = r.y - s.y;
        if (dx || dy) {
          const elapsed = Math.max(16, now - s.seen);
          const speed = Math.hypot(dx, dy) / elapsed * 1000;   // px per second
          for (const b of balls) if (b.on === s.id && !b.drag) moveStack(b, dx, dy);
          if (speed > 900) shedWindow(s, Math.min(1, (speed - 900) / 2500), dx / elapsed * 1000);
        }
        if (s.cols.length !== n) {
          const old = s.cols, c = new Float32Array(n);
          for (let i = 0; i < n; i++) c[i] = Math.min(capLimit(i, n), old[Math.min(old.length - 1, Math.round(i * (old.length - 1) / Math.max(1, n - 1)))]);
          s.cols = c;
        }
      }
      Object.assign(s, { x: r.x, y: r.y, w: r.w, h: r.h, snow: r.snow !== false, z, seen: now });
      order.push(s);
    });
    winOrder = order;
    for (const [id, s] of wins) if (now - s.seen > 120000) wins.delete(id);   // closed long ago
    // balls whose window disappeared start falling
    const live = new Set(order.filter((s) => s.snow).map((s) => s.id));
    for (const b of balls) if (b.on && b.on !== 'ground' && b.on !== 'ball' && !live.has(b.on)) b.on = null;
  }

  // Is the point hidden behind one of the first `z` windows (those in front)?
  function covered(x, y, z) {
    for (let k = 0; k < z && k < winOrder.length; k++) {
      const o = winOrder[k];
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return true;
    }
    return false;
  }

  function winDeposit(s, col, a) {
    const c = s.cols, n = c.length;
    c[col] += a;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = Math.max(0, col - 7); i < Math.min(n - 1, col + 7); i++) {
        const d = c[i] - c[i + 1];
        if (Math.abs(d) > 1.4) { const mv = d * 0.3; c[i] -= mv; c[i + 1] += mv; }
      }
    }
    for (let i = Math.max(0, col - 8); i < Math.min(n, col + 8); i++) c[i] = Math.min(c[i], capLimit(i, n));
  }

  function shedWindow(s, strength, vx) {
    const c = s.cols;
    for (let i = 0; i < c.length; i++) {
      if (c[i] > 1.2 && Math.random() < 0.4 * strength + 0.1) {
        const amt = c[i] * (0.35 + 0.5 * strength);
        c[i] -= amt;
        clumps.push({ x: s.x + i * WSTEP, y: s.y - c[i] - amt * 0.5, vx: -vx * 0.15 + (Math.random() - 0.5) * 60,
          vy: -20 - Math.random() * 60, r: 1.3 + Math.min(amt, 10) * 0.25, m: amt * WSTEP / DX * 0.5, side: false, life: 0, spin: 0 });
      }
    }
    for (const b of balls) {
      if (b.on === s.id && !b.drag && strength > 0.25) { b.on = null; b.vx = -vx * 0.3; b.vy = -80; }
    }
    if (clumps.length > 700) clumps.splice(0, clumps.length - 700);
  }

  // A falling particle between prevY and y: does it land somewhere? (adds `mass` if so)
  function land(x, prevY, y, mass) {
    for (const s of winOrder) {
      if (!s.snow || x < s.x + 1 || x > s.x + s.w - 1) continue;
      const col = clamp(Math.round((x - s.x) / WSTEP), 0, s.cols.length - 1);
      const sy = s.y - s.cols[col];
      if (prevY < sy && y >= sy) {
        if (covered(x, sy, s.z)) break;               // hidden behind a window in front
        winDeposit(s, col, mass * WIN_RATE * DX / WSTEP);
        return true;
      }
    }
    if (x >= 0 && x < W) {
      const col = Math.round(x / DX);
      if (y >= H - h[col] - 0.5) { if (!lock[col]) deposit(col, mass); return true; }
    }
    return false;
  }

  // ======================= falling snow =======================
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

  // ======================= the plow =======================
  const plow = { x: 60, dir: 1, face: 1, state: 'push', t: 0, odo: 0, lift: 0, load: 0, backed: 0, speed: 0 };
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
      const ahead = sumAhead(16);
      plow.load = ahead;
      const target = 34 * s / (1 + ahead / (420 * s * s));   // heavier load, slower plow
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
    plow.x = clamp(plow.x, BACK() + 1, W - BACK() - 1);

    // snow under the body is shoved ahead of the blade (or out the back when not pushing)
    const [lo, hi] = bodyRange();
    const pushing = plow.state === 'push';
    let dest;
    if (pushing) dest = plow.dir > 0 ? Math.min(N - 1, Math.floor(hi / DX) + 1) : Math.max(0, Math.ceil(lo / DX) - 1);
    else dest = plow.dir > 0 ? Math.max(0, Math.floor(lo / DX) - 1) : Math.min(N - 1, Math.ceil(hi / DX) + 1);
    const ilo = Math.max(0, Math.ceil(lo / DX)), ihi = Math.min(N - 1, Math.floor(hi / DX));
    const i0 = Math.max(0, Math.floor(Math.min(lo, lo0) / DX)), i1 = Math.min(N - 1, Math.ceil(Math.max(hi, hi0) / DX));
    for (let i = i0; i <= i1; i++) {
      if (i < ilo || i > ihi) continue;
      if (h[i] > RESID) { h[dest] += h[i] - RESID; h[i] = RESID; }
      lock[i] = 1;
    }

    // snowballs on the ground get shoved along too
    for (const b of balls) {
      if (b.drag || b.on !== 'ground') continue;
      if (b.x + b.r < lo || b.x - b.r > hi || b.y + b.r < H - 50 * s) continue;
      const ahead = plow.dir > 0 ? b.x >= plow.x : b.x <= plow.x;
      const nx = ahead ? (plow.dir > 0 ? hi + b.r * 0.9 : lo - b.r * 0.9) : (plow.dir > 0 ? lo - b.r * 0.9 : hi + b.r * 0.9);
      moveStack(b, nx - b.x, 0);
      if (ahead && pushing) b.vx = plow.dir * plow.speed;
    }

    if (pushing) {
      const cap = BLADE_H() * 1.75;
      if (h[dest] > cap) {
        const extra = h[dest] - cap;
        h[dest] = cap;
        spill(dest, extra);
      }
      plow.t += dt;
      if (plow.t > 0.22) {
        plow.t = 0;
        puffs.push({ x: plow.x - plow.dir * 7 * s, y: H - RESID - 36 * s, r: 2.5 * s, life: 0, vx: -plow.dir * 6 });
      }
      // stop when the shoved snow runs into the screen edge or an old drift there
      const wallDist = plow.dir > 0 ? W - hi : lo;
      const resist = sumAhead(30);
      let full = false;
      if (wallDist < 320 * s) {
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
      clumps.push({
        x: x0 + plow.dir * Math.random() * 4, y: y0 - Math.random() * 3,
        vx: plow.dir * (plow.speed + 15 + Math.random() * 55), vy: -15 - Math.random() * 45,
        r: Math.min(4.5, 1.2 + Math.sqrt(m) * 1.1), m, side: Math.random() < 0.4, life: 0, spin: Math.random() * 6,
      });
    }
    if (clumps.length > 700) clumps.splice(0, clumps.length - 700);
  }

  // ======================= snowballs =======================
  function addBall(x, r, grow) {
    const b = { id: ++ballSeq, x, y: 0, r, vx: 0, vy: 0, on: null, under: null, drag: false, grow: grow ? 0.05 : 1 };
    b.y = restOnGround(b);
    b.on = 'ground';
    balls.push(b);
    return b;
  }

  // move a ball and everything stacked on it
  function moveStack(b, dx, dy, depth = 0) {
    b.x += dx; b.y += dy;
    if (depth > 6) return;
    for (const o of balls) if (o.under === b.id && !o.drag) moveStack(o, dx, dy, depth + 1);
  }

  function restOnGround(b) {
    let best = H - b.r;
    const r = b.r * b.grow;
    const i0 = Math.max(0, Math.floor((b.x - r) / DX)), i1 = Math.min(N - 1, Math.ceil((b.x + r) / DX));
    for (let i = i0; i <= i1; i++) {
      const dx = i * DX - b.x, k = r * r - dx * dx;
      if (k <= 0) continue;
      const cy = H - h[i] - Math.sqrt(k) + r * 0.15;     // sinks a little into the snow
      if (cy < best) best = cy;
    }
    return best;
  }
  function restOnWindow(b, s) {
    const r = b.r * b.grow;
    let best = s.y - r;
    const n = s.cols.length;
    const i0 = Math.max(0, Math.floor((b.x - r - s.x) / WSTEP)), i1 = Math.min(n - 1, Math.ceil((b.x + r - s.x) / WSTEP));
    for (let i = i0; i <= i1; i++) {
      const dx = s.x + i * WSTEP - b.x, k = r * r - dx * dx;
      if (k <= 0) continue;
      const cy = s.y - s.cols[i] - Math.sqrt(k) + r * 0.12;
      if (cy < best) best = cy;
    }
    return best;
  }
  function settle(b, ry, dt) {
    b.y = ry;
    if (b.vy > 0) b.vy = b.vy > 160 ? -b.vy * 0.12 : 0;
    b.vx *= Math.pow(0.03, dt);            // snow is sticky: balls stop quickly
    if (Math.abs(b.vx) < 4) b.vx = 0;
  }

  function updateBalls(dt) {
    for (const b of balls) {
      if (b.grow < 1) b.grow = Math.min(1, b.grow + dt * 1.2);
      b.under = null;
      if (b.drag) continue;
      const py = b.y;
      b.vy += 900 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const r = b.r * b.grow;
      if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * 0.3; }
      if (b.x > W - r) { b.x = W - r; b.vx = -Math.abs(b.vx) * 0.3; }
      b.on = null;
      for (const s of winOrder) {
        if (!s.snow || b.x < s.x || b.x > s.x + s.w) continue;
        const ry = restOnWindow(b, s);
        if (py <= ry + 3 && b.y >= ry && !covered(b.x, s.y - 2, s.z)) { settle(b, ry, dt); b.on = s.id; break; }
      }
      if (!b.on) { const ry = restOnGround(b); if (b.y >= ry) { settle(b, ry, dt); b.on = 'ground'; } }
    }
    // ball-to-ball contacts
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], c = balls[j];
          const ra = a.r * a.grow, rc = c.r * c.grow;
          const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy), min = (ra + rc) * 0.94;
          if (d >= min || d < 0.001) continue;
          const nx = dx / d, ny = dy / d, ov = min - d;
          let ma = a.drag ? 0 : 1 / (ra * ra), mc = c.drag ? 0 : 1 / (rc * rc);
          // the lower ball of a stack is held up by what it rests on
          if (ny > 0.6 && c.on) mc = 0;
          if (ny < -0.6 && a.on) ma = 0;
          if (ma + mc === 0) { if (!a.drag) ma = 1; else if (!c.drag) mc = 1; else continue; }
          const sum = ma + mc;
          a.x -= nx * ov * ma / sum; a.y -= ny * ov * ma / sum;
          c.x += nx * ov * mc / sum; c.y += ny * ov * mc / sum;
          const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (rv < 0) {
            a.vx += nx * rv * ma / sum; a.vy += ny * rv * ma / sum;
            c.vx -= nx * rv * mc / sum; c.vy -= ny * rv * mc / sum;
          }
          // sticky snow: a ball sitting on top of another stays put
          if (Math.abs(ny) > 0.55) {
            const top = ny > 0 ? a : c, bot = ny > 0 ? c : a;
            if (!top.drag) {
              top.vx = bot.vx;
              if (top.vy > bot.vy) top.vy = bot.vy;
              if (!top.on) top.on = 'ball';
              top.under = bot.id;
            }
          }
        }
      }
    }
    // the taskbar slowly rolls up new snowballs
    nextBallIn -= dt;
    if (nextBallIn <= 0) {
      nextBallIn = 35 + Math.random() * 45;
      if (balls.length < 8) {
        for (let tries = 0; tries < 12; tries++) {
          const x = 30 + Math.random() * (W - 60);
          const col = Math.round(x / DX);
          if (h[col] < 6 || Math.abs(x - plow.x) < 90) continue;
          const r = 7 + Math.random() * 8;
          for (let i = Math.max(0, col - Math.ceil(r / DX)); i <= Math.min(N - 1, col + Math.ceil(r / DX)); i++) h[i] = Math.max(RESID, h[i] - r * 0.35);
          addBall(x, r, true);
          break;
        }
      }
    }
  }

  function burst(b) {
    const idx = balls.indexOf(b);
    if (idx < 0) return;
    balls.splice(idx, 1);
    const r = b.r * b.grow;
    const n = clamp(Math.round(r * 2.4), 10, 44);
    const total = Math.PI * r * r / DX * 0.55;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI * Math.random();
      const v = 60 + Math.random() * 180;
      clumps.push({
        x: b.x + Math.cos(a) * r * 0.5, y: b.y + Math.sin(a) * r * 0.5,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
        r: 1 + Math.random() * Math.min(3.5, r * 0.25), m: total / n, side: Math.random() < 0.15, life: 0, spin: Math.random() * 6,
      });
    }
    for (let k = 0; k < 10; k++) {
      puffs.push({ x: b.x + (Math.random() - 0.5) * r, y: b.y + (Math.random() - 0.5) * r, r: r * 0.4, life: 0.4, vx: (Math.random() - 0.5) * 30, snow: true });
    }
    for (const o of balls) if (o.under === b.id) { o.on = null; o.under = null; }
  }

  // ======================= mouse =======================
  let drag = null, hover = null, interactive = false;
  function setInteractive(on) {
    if (on !== interactive) {
      interactive = on;
      if (api && api.setInteractive) api.setInteractive(on);
    }
    cv.style.cursor = drag ? 'grabbing' : (hover ? 'grab' : '');
  }
  function ballAt(x, y) {
    if (covered(x, y, winOrder.length)) return null;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (Math.hypot(x - b.x, y - b.y) <= b.r * b.grow + 3) return b;
    }
    return null;
  }
  window.addEventListener('pointermove', (e) => {
    if (drag) {
      const b = drag.b, now = performance.now();
      const nx = clamp(e.clientX - drag.ox, b.r, W - b.r), ny = Math.min(e.clientY - drag.oy, H - b.r);
      const dt = Math.max(1, now - drag.lt) / 1000;
      drag.vx = drag.vx * 0.6 + ((nx - b.x) / dt) * 0.4;
      drag.vy = drag.vy * 0.6 + ((ny - b.y) / dt) * 0.4;
      moveStack(b, nx - b.x, ny - b.y);
      drag.lt = now;
      return;
    }
    hover = ballAt(e.clientX, e.clientY);
    setInteractive(!!hover);
  });
  window.addEventListener('pointerdown', (e) => {
    const b = ballAt(e.clientX, e.clientY);
    if (!b) return;
    e.preventDefault();
    drag = { b, ox: e.clientX - b.x, oy: e.clientY - b.y, sx: e.clientX, sy: e.clientY, t: performance.now(), lt: performance.now(), vx: 0, vy: 0 };
    b.drag = true; b.vx = 0; b.vy = 0; b.on = null;
    try { cv.setPointerCapture(e.pointerId); } catch { /* not over the canvas */ }
    setInteractive(true);
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const { b } = drag;
    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
    b.drag = false;
    if (moved < 6 && performance.now() - drag.t < 400) burst(b);
    else { b.vx = clamp(drag.vx, -900, 900); b.vy = clamp(drag.vy, -900, 900); }
    drag = null;
    hover = ballAt(e.clientX, e.clientY);
    setInteractive(!!hover);
  });

  // ---------------- sparkles on the snow ----------------
  let sparkles = [];
  function makeSparkles() {
    sparkles = [];
    const n = Math.round(N * 0.35);
    for (let k = 0; k < n; k++) sparkles.push({ i: Math.floor(Math.random() * N), d: Math.random(), p: Math.random() * 7, s: 0.6 + Math.random() * 2 });
  }

  // ======================= update =======================
  function update(dt, t) {
    updatePlow(dt);

    const target = Math.round(Math.min(700, W * H / 6500) * SNOW_LEVELS[settings.snow]);
    while (flakes.length < target) flakes.push(newFlake(flakes.length > target * 0.4));
    if (flakes.length > target) flakes.length = target;
    const wind = Math.sin(t * 0.11) * 10 + Math.sin(t * 0.37) * 4;
    for (const f of flakes) {
      const py = f.y;
      f.y += f.vy * dt;
      f.x += (wind + Math.sin(t * f.ws + f.p) * f.wa) * dt;
      if (land(f.x, py, f.y, f.r * f.r * SNOW_RATE)) { Object.assign(f, newFlake(true)); continue; }
      if (f.y > H + 10 || f.x < -60 || f.x > W + 60) Object.assign(f, newFlake(true));
    }

    for (let k = clumps.length - 1; k >= 0; k--) {
      const c = clumps[k];
      const py = c.y;
      c.life += dt; c.vy += 650 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.spin += c.vx * dt * 0.2;
      if (c.x < 1) { c.x = 1; c.vx = Math.abs(c.vx) * 0.3; }
      if (c.x > W - 1) { c.x = W - 1; c.vx = -Math.abs(c.vx) * 0.3; }
      if (c.side) { if (c.life > 0.7) clumps.splice(k, 1); continue; }
      if (c.vy <= 0) continue;
      const col = clamp(Math.round(c.x / DX), 0, N - 1);
      if (c.y >= H - h[col] && lock[col]) { c.vy = -c.vy * 0.2; c.y = H - h[col] - 1; continue; }
      if (c.y >= H - h[col] && !c.rolled) {
        const slope = h[Math.max(0, col - 1)] - h[Math.min(N - 1, col + 1)];
        if (Math.abs(slope) > 1.2) { c.rolled = true; c.vx = Math.sign(slope) * Math.max(12, Math.abs(c.vx) * 0.5); c.vy = -20; c.y = H - h[col] - 1; continue; }
      }
      if (land(c.x, py, c.y, c.m) || c.y > H + 10) clumps.splice(k, 1);
    }

    for (let k = puffs.length - 1; k >= 0; k--) {
      const p = puffs[k]; p.life += dt; p.y -= (p.snow ? 6 : 16) * dt; p.x += p.vx * dt; p.r += 6 * dt;
      if (p.life > 1.6) puffs.splice(k, 1);
    }

    updateBalls(dt);

    relax(4);
    soften(0.12);
    const mh = MAX_H(), soft = mh * 0.6;
    for (let i = 0; i < N; i++) {
      if (h[i] > soft) h[i] -= (h[i] - soft) * 0.03 * dt;
      if (h[i] > mh) h[i] = mh;
    }
  }

  // ======================= drawing =======================
  function drawGround(t) {
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

    ctx.save();
    ctx.shadowColor = 'rgba(30,40,80,.35)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = -1;
    const g = ctx.createLinearGradient(0, H - top - 2, 0, H);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f3f6ff'); g.addColorStop(1, '#d7dff7');
    ctx.fillStyle = g;
    ctx.fill(path);
    ctx.restore();

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
    const ao = ctx.createLinearGradient(0, H - 10, 0, H);
    ao.addColorStop(0, 'rgba(140,155,215,0)'); ao.addColorStop(1, 'rgba(140,155,215,.45)');
    ctx.fillStyle = ao; ctx.fillRect(0, H - 10, W, 10);
    for (const s of sparkles) {
      const hh = h[s.i];
      if (hh < 3) continue;
      const a = Math.max(0, Math.sin(t * s.s + s.p));
      if (a < 0.6) continue;
      ctx.fillStyle = `rgba(255,255,255,${(a - 0.6) * 2.5})`;
      ctx.fillRect(s.i * DX - 0.6, H - hh + 1 + s.d * hh * 0.8 - 0.6, 1.2, 1.2);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(0, H - h[0]);
    px = 0; py = H - h[0];
    for (let i = 1; i < N; i++) {
      const x = Math.min(W, i * DX), y = H - h[i];
      ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
      px = x; py = y;
    }
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.2; ctx.stroke();
  }

  function drawWindowSnow() {
    for (let k = winOrder.length - 1; k >= 0; k--) {
      const s = winOrder[k];
      if (!s.snow) continue;
      const c = s.cols, n = c.length;
      let top = 0;
      for (let i = 0; i < n; i++) if (c[i] > top) top = c[i];
      if (top < 0.4) continue;
      const base = s.y + 4;   // tucks under the window's top edge (the window hides it)
      ctx.save();
      ctx.shadowColor = 'rgba(20,30,70,.35)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = -1;
      ctx.beginPath();
      ctx.moveTo(s.x + 3, base);
      let px = s.x, py = s.y - c[0];
      ctx.lineTo(px, py);
      for (let i = 1; i < n; i++) {
        const x = Math.min(s.x + s.w, s.x + i * WSTEP), y = s.y - c[i];
        ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        px = x; py = y;
      }
      ctx.lineTo(s.x + s.w, s.y - c[n - 1]);
      ctx.lineTo(s.x + s.w - 3, base);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, s.y - top, 0, s.y + 2);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#eef1ff'); g.addColorStop(1, '#c4cbef');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBalls() {
    for (const b of balls) {
      const r = b.r * b.grow;
      // contact shadow
      ctx.fillStyle = 'rgba(70,85,150,.22)';
      ctx.beginPath(); ctx.ellipse(b.x, b.y + r * 0.85, r * 0.9, r * 0.22, 0, 0, 7); ctx.fill();
      const g = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.65, '#f1f4ff'); g.addColorStop(1, '#c9d1f1');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.fill();
      // a few packed-snow specks
      ctx.fillStyle = 'rgba(150,165,215,.35)';
      for (let k = 0; k < 4; k++) {
        const a = b.id * 2.3 + k * 1.7, d = r * (0.3 + 0.12 * k);
        ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, Math.max(0.6, r * 0.07), 0, 7); ctx.fill();
      }
      ctx.lineWidth = b === hover || b.drag ? 2 : 1;
      ctx.strokeStyle = b === hover || b.drag ? 'rgba(255,255,255,.95)' : 'rgba(110,125,185,.35)';
      ctx.stroke();
    }
  }

  function rr(x, y, w, hh, r) { ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); }

  function drawPlow(t) {
    if (!settings.plow) return;
    const s = S();
    const pushing = plow.state === 'push';
    const shake = pushing ? Math.sin(t * 47) * 0.45 * s : 0;
    ctx.save();
    ctx.translate(plow.x, H - RESID + shake);
    ctx.scale(s, s);
    ctx.scale(plow.face || 0.001, 1);

    ctx.fillStyle = 'rgba(40,50,90,.25)';
    ctx.beginPath(); ctx.ellipse(-2, 0, 32, 3, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#1e2127';
    rr(-30, -13, 50, 13, 6.5); ctx.fill();
    ctx.fillStyle = '#3a3f48';
    const off = ((plow.odo / s) % 6 + 6) % 6;
    for (let x = -27 + off; x < 17; x += 6) { ctx.fillRect(x, -13, 2.4, 2); ctx.fillRect(x, -2, 2.4, 2); }
    for (let k = 0; k < 4; k++) {
      const cx = -21.5 + k * 11;
      ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.arc(cx, -6.5, 4.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#5d636d'; ctx.beginPath(); ctx.arc(cx, -6.5, 1.8, 0, 7); ctx.fill();
    }

    let g = ctx.createLinearGradient(0, -27, 0, -12);
    g.addColorStop(0, '#ffd84a'); g.addColorStop(1, '#eba300');
    ctx.fillStyle = g; rr(-28, -27, 44, 15, 3.5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-28, -16, 44, 2);
    ctx.save(); rr(-28, -27, 7, 15, 3.5); ctx.clip();
    ctx.fillStyle = '#222';
    for (let k = -30; k < 0; k += 5) { ctx.beginPath(); ctx.moveTo(k, -12); ctx.lineTo(k + 2.5, -12); ctx.lineTo(k + 10, -27); ctx.lineTo(k + 7.5, -27); ctx.fill(); }
    ctx.restore();

    g = ctx.createLinearGradient(0, -45, 0, -26);
    g.addColorStop(0, '#ffdc55'); g.addColorStop(1, '#f2b000');
    ctx.fillStyle = g; rr(-24, -45, 22, 20, 4); ctx.fill();
    g = ctx.createLinearGradient(-20, -42, -6, -31);
    g.addColorStop(0, '#d8f1ff'); g.addColorStop(1, '#7cc4f2');
    ctx.fillStyle = g; rr(-20.5, -41.5, 15, 11, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath(); ctx.moveTo(-18, -41.5); ctx.lineTo(-14, -41.5); ctx.lineTo(-19, -31.5); ctx.lineTo(-20.5, -31.5); ctx.lineTo(-20.5, -37); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-13, -45.5, 12, 2.6, 0, 0, 7); ctx.fill();

    ctx.fillStyle = '#2b2e35'; rr(4, -36, 3.2, 10, 1); ctx.fill();

    const on = Math.floor(t * 3) % 2 === 0;
    if (on) {
      const bg = ctx.createRadialGradient(-13, -50, 0, -13, -50, 9);
      bg.addColorStop(0, 'rgba(255,150,40,.85)'); bg.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = bg; ctx.fillRect(-22, -59, 18, 18);
    }
    ctx.fillStyle = on ? '#ffa021' : '#b2610f';
    rr(-15.5, -51.5, 5, 4.5, 2); ctx.fill();

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
    ctx.fillStyle = '#5b616c'; ctx.fillRect(27, -1.6, 6, 1.6);
    ctx.restore();

    ctx.restore();
  }

  function drawFx() {
    for (const p of puffs) {
      const a = (p.snow ? 0.45 : 0.18) * (1 - p.life / 1.6);
      ctx.fillStyle = p.snow ? `rgba(255,255,255,${a})` : `rgba(120,125,140,${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
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
    for (const f of flakes) {
      const d = f.r * 3.2;
      ctx.globalAlpha = f.a;
      ctx.drawImage(sprite, f.x - d / 2, f.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  }

  // ======================= loop =======================
  let last = performance.now();
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    if (!settings.paused) {
      dt *= FAST;
      const steps = Math.ceil(dt / 0.034);
      for (let k = 0; k < steps; k++) update(dt / steps, t);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawGround(t);
    drawWindowSnow();
    drawBalls();
    drawPlow(t);
    drawFx();
    requestAnimationFrame(frame);
  }

  if (api) {
    api.onSettings((s) => Object.assign(settings, s));
    api.onCommand((c) => {
      if (c === 'clear') { h.fill(0); plow.load = 0; for (const s of wins.values()) s.cols.fill(0); }
    });
    if (api.onWindows) api.onWindows(setWindows);
  }

  resize();
  requestAnimationFrame(frame);

  // used by the browser preview (demo.js) and automated checks
  window.SnowEngine = { setWindows, burst, get balls() { return balls; }, get wins() { return wins; } };
  window.__snow = { get h() { return h; }, plow, settings, balls, wins };
})();
