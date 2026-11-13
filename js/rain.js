// Digitale regen in de kopband van de startpagina (stopt vanzelf als de pagina niet zichtbaar is)
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const chars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789PDF';
  let cv, raf, drops = [], size = 16, last = 0;
  function attach() {
    const hero = document.querySelector('.hero'); if (!hero || hero.querySelector('.matrix-rain')) return;
    cv = document.createElement('canvas'); cv.className = 'matrix-rain'; cv.setAttribute('aria-hidden', 'true'); hero.prepend(cv);
    resize(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function resize() { if (!cv) return; const r = cv.getBoundingClientRect(); const d = Math.min(devicePixelRatio || 1, 2); cv.width = r.width * d; cv.height = r.height * d; size = Math.round(15 * d); drops = Array.from({ length: Math.ceil(cv.width / size) }, () => Math.random() * -40); }
  function tick(t) {
    if (!cv || !cv.isConnected) { cv = null; return; }
    raf = requestAnimationFrame(tick);
    if (document.hidden || t - last < 55) return; last = t;
    const g = cv.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0.09)'; g.fillRect(0, 0, cv.width, cv.height);
    g.font = size + 'px monospace';
    for (let i = 0; i < drops.length; i++) {
      const y = drops[i] * size; const ch = chars[(Math.random() * chars.length) | 0];
      g.fillStyle = Math.random() < 0.06 ? '#CCFFD8' : '#00FF41'; g.fillText(ch, i * size, y);
      if (y > cv.height && Math.random() > 0.975) drops[i] = 0; else drops[i]++;
    }
  }
  addEventListener('resize', resize);
  new MutationObserver(attach).observe(document.getElementById('app'), { childList: true });
  attach();
})();
