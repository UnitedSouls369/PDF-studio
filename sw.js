// PDF Studio — offline-werking. Alles wordt lokaal bewaard; er gaat niets naar een server.
const VERSION = 'd029be74db';
const CORE = ["./", "./.nojekyll", "./css/app.css", "./css/fonts.css", "./css/mobile.css", "./css/theme-matrix.css", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./index.html", "./js/core.js", "./js/editor.js", "./js/fontlib.js", "./js/grid.js", "./js/i18n.js", "./js/main.js", "./js/pwa.js", "./js/rain.js", "./js/textengine.js", "./js/tools-convert.js", "./js/tools-docx.js", "./js/tools-misc.js", "./js/tools-ocr.js", "./js/tools-office.js", "./js/tools-optimize.js", "./js/tools-organize.js", "./js/tools-pdfa.js", "./js/tools-pro.js", "./lib/fflate.min.js", "./lib/fontkit-subset.js", "./lib/fontkit.min.js", "./lib/fonts/fonts.json", "./lib/icc/fogra39.js", "./lib/icc/srgb.js", "./lib/ocr/tesseract.min.js", "./lib/ocr/worker.min.js", "./lib/pdf-lib.min.js", "./lib/pdfjs/data/FoxitDingbats.pfb.js", "./lib/pdfjs/data/FoxitFixed.pfb.js", "./lib/pdfjs/data/FoxitFixedBold.pfb.js", "./lib/pdfjs/data/FoxitFixedBoldItalic.pfb.js", "./lib/pdfjs/data/FoxitFixedItalic.pfb.js", "./lib/pdfjs/data/FoxitSerif.pfb.js", "./lib/pdfjs/data/FoxitSerifBold.pfb.js", "./lib/pdfjs/data/FoxitSerifBoldItalic.pfb.js", "./lib/pdfjs/data/FoxitSerifItalic.pfb.js", "./lib/pdfjs/data/FoxitSymbol.pfb.js", "./lib/pdfjs/data/LiberationSans-Bold.ttf.js", "./lib/pdfjs/data/LiberationSans-BoldItalic.ttf.js", "./lib/pdfjs/data/LiberationSans-Italic.ttf.js", "./lib/pdfjs/data/LiberationSans-Regular.ttf.js", "./lib/pdfjs/data/jbig2.wasm.js", "./lib/pdfjs/data/openjpeg.wasm.js", "./lib/pdfjs/data/qcms_bg.wasm.js", "./lib/pdfjs/pdf.min.js", "./lib/pdfjs/pdf.worker.min.js", "./lib/pdfjs/wasm/jbig2_nowasm_fallback.js", "./lib/pdfjs/wasm/openjpeg_nowasm_fallback.js", "./lib/ui/Cousine-400.woff2", "./lib/ui/Cousine-700.woff2", "./lib/ui/Inter-300.woff2", "./lib/ui/Inter-400.woff2", "./lib/ui/Inter-500.woff2", "./lib/ui/Inter-600.woff2", "./lib/ui/Montserrat-600.woff2", "./lib/ui/Montserrat-700.woff2", "./logo.png", "./manifest.webmanifest"];
const CACHE = 'pdfstudio-' + VERSION;
const FONTS = 'pdfstudio-fonts-v1'; // lettertypes blijven bewaard tussen versies

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pdfstudio-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const isFont = (url.pathname.includes('/lib/fonts/') && !url.pathname.endsWith('fonts.json')) || /\/lib\/ocr\/(lang\/|tesseract-core)/.test(url.pathname); // groot: apart en blijvend bewaard
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(isFont ? FONTS : CACHE); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      if (req.mode === 'navigate') { const idx = await caches.match('./index.html'); if (idx) return idx; }
      return new Response('Offline en nog niet bewaard: ' + url.pathname, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
// Op vraag van de pagina: alle lettertypes van de bibliotheek vooraf bewaren
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'cache-fonts') return;
  e.waitUntil((async () => {
    const c = await caches.open(FONTS); const list = e.data.files; let done = 0;
    const post = (msg) => self.clients.matchAll().then((cs) => cs.forEach((cl) => cl.postMessage(msg)));
    for (let i = 0; i < list.length; i += 6) {
      await Promise.all(list.slice(i, i + 6).map(async (f) => { const u = f.includes('/') ? './' + f : './lib/fonts/' + f; if (!(await c.match(u))) { try { const r = await fetch(u); if (r.ok) await c.put(u, r); } catch {} } done++; }));
      post({ type: 'fonts-progress', done, total: list.length });
    }
    post({ type: 'fonts-done', total: list.length });
  })());
});
