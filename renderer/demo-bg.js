// Browser preview only: paint the snowy-cabin wallpaper behind the fake taskbar,
// the same way the real app sets it as the Windows wallpaper.
(() => {
  'use strict';
  if (window.snowAPI || !window.Wallpaper) return;
  const cv = document.getElementById('bg');
  const ctx = cv.getContext('2d');
  let W, H, DPR, bg;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
    const b = bg.getContext('2d'); b.setTransform(DPR, 0, 0, DPR, 0, 0);
    window.Wallpaper.render(b, W, H);
  }
  addEventListener('resize', resize);
  resize();
  let last = performance.now();
  (function frame(now) {
    const dt = Math.min(0.05, ((now || last) - last) / 1000); last = now || last;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    window.Wallpaper.animate(ctx, bg, (now || 0) / 1000, dt);
    requestAnimationFrame(frame);
  })();
})();
