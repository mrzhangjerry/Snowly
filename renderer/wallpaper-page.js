// Two uses:
//   wallpaper.html?static=1&w=2560&h=1440  -> render one still image at that exact pixel size
//                                             (the app saves it and sets it as the Windows wallpaper)
//   wallpaper.html                          -> animated wallpaper (for Lively Wallpaper or a browser)
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');

  if (q.get('static')) {
    const w = Math.max(320, +q.get('w') || 1920), h = Math.max(240, +q.get('h') || 1080);
    const bg = document.createElement('canvas');
    bg.width = w; bg.height = h;
    window.Wallpaper.render(bg.getContext('2d'), w, h);
    cv.width = w; cv.height = h;
    // run the animation a few seconds so the chimney smoke is already drifting
    for (let i = 0; i < 90; i++) window.Wallpaper.animate(ctx, bg, 2 + i * 0.1, 0.1);
    window.__png = () => cv.toDataURL('image/png');
    window.__ready = true;
    return;
  }

  let W, H, DPR, bg;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    bg = document.createElement('canvas');
    bg.width = cv.width; bg.height = cv.height;
    const b = bg.getContext('2d'); b.setTransform(DPR, 0, 0, DPR, 0, 0);
    window.Wallpaper.render(b, W, H);
  }
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
  resize();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    window.Wallpaper.animate(ctx, bg, now / 1000, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
