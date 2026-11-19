// Installatie als app en offline-status
(function () {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  let deferred = null; const st = { fonts: null, ready: false };
  // Nieuwe versie: de service worker neemt meteen over; de pagina zelf draait nog op de oude bestanden → melden en laten herladen
  const hadController = !!navigator.serviceWorker.controller; let barShown = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || barShown) return; barShown = true;
    const bar = document.createElement('div'); bar.className = 'update-bar'; bar.setAttribute('role', 'status');
    const t = document.createElement('span'); t.textContent = 'Nieuwe versie geïnstalleerd.';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = 'Nu herladen'; b.onclick = () => location.reload();
    const x = document.createElement('button'); x.type = 'button'; x.className = 'btn sm'; x.textContent = '×'; x.setAttribute('aria-label', 'Sluiten'); x.onclick = () => bar.remove();
    bar.append(t, b, x); document.body.append(bar);
  });
  // bij openen en telkens de app weer zichtbaar wordt: op de server nakijken of er een nieuwe versie is
  const check = () => navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 30 * 60 * 1000);
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(() => navigator.serviceWorker.ready).then(() => { st.ready = true; checkFonts(); paint(); }).catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; paint(); });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data.type === 'fonts-progress') st.fonts = { busy: true, done: e.data.done, total: e.data.total };
    if (e.data.type === 'fonts-done') st.fonts = { complete: true, total: e.data.total };
    paint();
  });
  const EXTRA = ['lib/ocr/tesseract-core-simd-lstm.wasm.js', 'lib/ocr/tesseract-core-lstm.wasm.js', 'lib/ocr/lang/nld.js', 'lib/ocr/lang/eng.js', 'lib/ocr/lang/fra.js', 'lib/ocr/lang/deu.js'];
  async function fontList() { const m = await (await fetch('lib/fonts/fonts.json')).json(); return [...new Set(Object.values(m).flatMap((f) => Object.values(f)))].concat(EXTRA); }
  const cacheUrl = (f) => (f.includes('/') ? './' + f : './lib/fonts/' + f);
  async function checkFonts() {
    try { const files = await fontList(); const c = await caches.open('pdfstudio-fonts-v1'); let n = 0; for (const f of files) if (await c.match(cacheUrl(f))) n++; if (!st.fonts || !st.fonts.busy) st.fonts = n === files.length ? { complete: true, total: n } : { done: n, total: files.length }; paint(); } catch {}
  }
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  function paint() {
    const slot = document.getElementById('offline-slot'); if (!slot) return;
    slot.innerHTML = '';
    const mk = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt) n.textContent = txt; return n; };
    if (st.ready) slot.append(mk('span', 'ok', 'Werkt offline'));
    if (st.fonts && !st.fonts.complete) {
      if (st.fonts.busy) slot.append(mk('span', null, `Lettertypes bewaren… ${st.fonts.done}/${st.fonts.total}`));
      else { const b = mk('button', 'btn sm', 'Lettertypes en OCR offline bewaren (± 115 MB)'); b.type = 'button'; b.id = 'cache-fonts'; b.onclick = async () => { st.fonts = { busy: true, done: 0, total: 0 }; paint(); const reg = await navigator.serviceWorker.ready; reg.active.postMessage({ type: 'cache-fonts', files: await fontList() }); }; slot.append(b); }
    } else if (st.fonts && st.fonts.complete) slot.append(mk('span', 'ok', 'Lettertypes en OCR offline'));
    if (deferred && !standalone) { const b = mk('button', 'btn sm', 'Installeren als app'); b.type = 'button'; b.onclick = async () => { deferred.prompt(); await deferred.userChoice; deferred = null; paint(); }; slot.append(b); }
    else if (ios && !standalone) slot.append(mk('span', null, 'iPhone/iPad: tik op Deel → "Zet op beginscherm" om te installeren.'));
  }
  new MutationObserver(() => { const s = document.getElementById('offline-slot'); if (s && !s.childNodes.length) paint(); }).observe(document.getElementById('app'), { childList: true, subtree: true });
})();
