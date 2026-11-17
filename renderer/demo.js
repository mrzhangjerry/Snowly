// Browser preview only: makes the sample windows draggable and reports where they are,
// the same way the real app reports your actual windows.
(() => {
  'use strict';
  if (window.snowAPI || !window.SnowEngine) return;
  const dwins = [...document.querySelectorAll('.dwin')];
  let z = 10;
  dwins.forEach((w, i) => {
    w.style.zIndex = String(++z);
    w.dataset.id = 'demo' + i;
    const bar = w.querySelector('.bar');
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    w.addEventListener('pointerdown', () => { w.style.zIndex = String(++z); });
    bar.addEventListener('pointerdown', (e) => {
      dragging = true; sx = e.clientX; sy = e.clientY; ox = w.offsetLeft; oy = w.offsetTop;
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      w.style.left = (ox + e.clientX - sx) + 'px';
      w.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
    });
    const end = () => { dragging = false; };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  });
  function report() {
    const list = dwins
      .map((w) => ({ w, z: +w.style.zIndex }))
      .sort((a, b) => b.z - a.z)
      .map(({ w }) => { const r = w.getBoundingClientRect(); return { id: w.dataset.id, x: r.left, y: r.top, w: r.width, h: r.height, snow: true }; });
    window.SnowEngine.setWindows(list);
    requestAnimationFrame(report);
  }
  requestAnimationFrame(report);
})();
