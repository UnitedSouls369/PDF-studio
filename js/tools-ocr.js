// Tekst herkennen (OCR) en scans opschonen — volledig lokaal (Tesseract, WebAssembly)
import { L } from './i18n.js';
import { el, F, PDFLib, loadPdf, openPdfJs, bytesToPdfJs, parseRange, baseName, isImageFile, readBytes } from './core.js';

const { PDFDocument, StandardFonts, PDFName, pushGraphicsState, popGraphicsState, beginText, endText, setFontAndSize, setTextRenderingMode, TextRenderingMode, setTextMatrix, setCharacterSqueeze, showText } = PDFLib;
const BASE = new URL('../', import.meta.url).href;
const save = (doc) => doc.save({ useObjectStreams: true });
const plural = (n) => `${n} pagina${n === 1 ? '' : "'s"}`;
const LANGS = [['nld', 'Nederlands'], ['eng', 'Engels'], ['fra', 'Frans'], ['deu', 'Duits']];

/* ---------- Tesseract laden ---------- */
const script = (src) => new Promise((res, rej) => { if (window.Tesseract) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('OCR-module kon niet geladen worden')); document.head.append(s); });
const langData = {};
async function getLang(code) {
  if (!langData[code]) langData[code] = import(BASE + 'lib/ocr/lang/' + code + '.js').then((m) => { const bin = atob(m.default); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; });
  return langData[code];
}
let worker = null, workerLangs = '';
export async function ocrWorker(langs, progress) {
  const key = langs.join('+');
  if (worker && workerLangs === key) return worker;
  if (worker) { await worker.terminate(); worker = null; }
  if (typeof WebAssembly === 'undefined') throw new Error(L('Deze browser ondersteunt geen WebAssembly; OCR is hier niet mogelijk.', 'This browser does not support WebAssembly; OCR is not possible here.'));
  progress && progress(L('OCR-module laden…', 'Loading OCR module…'));
  await script(BASE + 'lib/ocr/tesseract.min.js');
  const data = await Promise.all(langs.map(async (code) => ({ code, data: await getLang(code) })));
  try {
    worker = await window.Tesseract.createWorker(data, 1, { workerPath: BASE + 'lib/ocr/worker.min.js', corePath: BASE + 'lib/ocr/', workerBlobURL: false, cacheMethod: 'none', gzip: true, legacyCore: false, legacyLang: false });
  } catch (e) {
    worker = null; const m = String(e && (e.message || e));
    throw new Error(/WebAssembly|wasm|CompileError|unsafe-eval/i.test(m) ? L('OCR wordt in deze omgeving geblokkeerd (WebAssembly is niet toegestaan). Gebruik de app in een gewoon browservenster of de offline versie.', 'OCR is blocked in this environment (WebAssembly is not allowed). Use the app in a normal browser window or the offline version.') : m);
  }
  await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' });
  workerLangs = key; return worker;
}

/* ---------- Pagina renderen ---------- */
async function renderCanvas(pdfPage, dpi, maxSide = 5200) {
  let vp = pdfPage.getViewport({ scale: dpi / 72 });
  const k = Math.min(1, maxSide / Math.max(vp.width, vp.height)); if (k < 1) vp = pdfPage.getViewport({ scale: dpi / 72 * k });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await pdfPage.render({ canvasContext: g, viewport: vp }).promise; return { canvas: c, vp };
}

/* ---------- Onzichtbare tekstlaag ---------- */
function addTextLayer(doc, page, font, fontKey, words, vp) {
  const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
  let n = 0;
  for (const w of words) {
    const txt = cleanWord(font, w.text); if (!txt) continue;
    const { x0, y0, x1, y1 } = w.bbox; const hpx = y1 - y0; if (hpx < 4 || x1 - x0 < 2) continue;
    // basislijn ~ 80% van de woordhoogte; richting volgt uit de viewport (ook voor gedraaide pagina's)
    const yb = y0 + hpx * 0.8; const [ax, ay] = vp.convertToPdfPoint(x0, yb), [bx, by] = vp.convertToPdfPoint(x1, yb), [ux, uy] = vp.convertToPdfPoint(x0, yb - hpx);
    const len = Math.hypot(bx - ax, by - ay); const hpt = Math.hypot(ux - ax, uy - ay); if (len < 0.5 || hpt < 0.5) continue;
    const dx = (bx - ax) / len, dy = (by - ay) / len, px = (ux - ax) / hpt, py = (uy - ay) / hpt;
    const size = hpt * 0.95; const natural = font.widthOfTextAtSize(txt, size); if (!natural) continue;
    ops.push(setFontAndSize(fontKey, size), setCharacterSqueeze(Math.max(10, Math.min(500, (len / natural) * 100))), setTextMatrix(dx, dy, px, py, ax, ay), showText(font.encodeText(txt)));
    n++;
  }
  ops.push(endText(), popGraphicsState());
  if (n) page.pushOperators(...ops);
  return n;
}
// Alleen tekens die het standaardlettertype kan coderen (WinAnsi); andere worden benaderd
function cleanWord(font, t) {
  t = (t || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  let out = ''; for (const ch of t) { try { font.encodeText(ch); out += ch; } catch { out += '?'; } }
  return out;
}
const pageHasText = async (p) => { const tc = await p.getTextContent(); return tc.items.reduce((n, i) => n + (i.str || '').trim().length, 0) > 20; };

// OCR op een pdf-lib-document; pdf = pdf.js-versie van hetzelfde document
export async function ocrDocument(doc, pdf, { langs = ['nld', 'eng'], pages = null, skipText = true, dpi = 300, progress } = {}) {
  const w = await ocrWorker(langs, progress);
  const font = await doc.embedFont(StandardFonts.Helvetica); const dpages = doc.getPages();
  const list = pages || dpages.map((_, i) => i); let done = 0, skipped = 0, words = 0; const texts = [];
  for (const i of list) {
    const pp = await pdf.getPage(i + 1);
    if (skipText && await pageHasText(pp)) { skipped++; texts[i] = null; continue; }
    progress && progress(L(`Pagina ${i + 1} herkennen (${done + skipped + 1} van ${list.length})…`, `Recognising page ${i + 1} (${done + skipped + 1} of ${list.length})…`));
    const { canvas, vp } = await renderCanvas(pp, dpi);
    const r = await w.recognize(canvas, {}, { text: true, blocks: true });
    const ws = []; for (const b of r.data.blocks || []) for (const pa of b.paragraphs || []) for (const l of pa.lines || []) for (const wd of l.words || []) if (wd.confidence > 15) ws.push(wd);
    const page = dpages[i]; const key = page.node.newFontDictionary(font.name, font.ref);
    words += addTextLayer(doc, page, font, key, ws, vp); texts[i] = r.data.text; done++;
    canvas.width = canvas.height = 0;
  }
  return { done, skipped, words, texts };
}

const LANG_OPTS = (ctx) => el('div', { class: 'field' }, el('span', { class: 'flabel' }, 'Talen in het document'),
  el('div', { class: 'checks' }, LANGS.map(([code, name]) => { if (!('lang_' + code in ctx.opts)) ctx.opts['lang_' + code] = code === 'nld' || code === 'eng'; return F.check(ctx, 'lang_' + code, name, ctx.opts['lang_' + code]); })));
const chosenLangs = (ctx) => LANGS.map(([c]) => c).filter((c) => ctx.opts['lang_' + c]);

// Afbeeldingen omzetten naar een PDF (één pagina per afbeelding, 300 dpi aangenomen tenzij groot)
async function imagesToDoc(entries) {
  const doc = await PDFDocument.create();
  for (const f of entries) {
    let bytes = f.bytes, kind = /png/i.test(f.file.type) || /\.png$/i.test(f.name) ? 'png' : /jpe?g/i.test(f.file.type) || /\.jpe?g$/i.test(f.name) ? 'jpg' : null;
    const bmp = await createImageBitmap(new Blob([bytes]));
    if (!kind) { const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); bytes = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer()); kind = 'jpg'; }
    const img = kind === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const scale = 72 / (Math.max(bmp.width, bmp.height) > 2600 ? 300 : 200); const W = bmp.width * scale, H = bmp.height * scale;
    doc.addPage([W, H]).drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  return doc;
}

/* ================= OCR ================= */
const ocr = {
  input: { kind: 'pdf+image', multiple: true }, runLabel: 'Tekst herkennen', lead: 'Maakt gescande PDF\'s en foto\'s van documenten doorzoekbaar en selecteerbaar. De scan zelf blijft ongewijzigd; er komt een onzichtbare tekstlaag bovenop.',
  options: (ctx) => [
    LANG_OPTS(ctx),
    F.text(ctx, 'range', 'Pagina\'s', '', { placeholder: 'alle' }),
    F.check(ctx, 'skipText', 'Pagina\'s die al tekst bevatten overslaan', true),
    F.seg(ctx, 'dpi', 'Nauwkeurigheid', [[200, 'Snel'], [300, 'Normaal'], [400, 'Nauwkeurig']], 300),
    F.check(ctx, 'txt', 'Herkende tekst ook als .txt-bestand', false),
    el('div', { class: 'help' }, 'De eerste keer wordt de OCR-module (± 12 MB) geladen. Herkenning duurt enkele seconden per pagina.')
  ],
  summary: (ctx) => { if (!ctx.files.length) return 'Nog geen bestand gekozen'; const pdfs = ctx.files.filter((f) => f.kind === 'pdf'), imgs = ctx.files.length - pdfs.length; return [pdfs.length ? `${pdfs.length} PDF('s)` : '', imgs ? `${imgs} afbeelding(en) → 1 PDF` : ''].filter(Boolean); },
  validate: (ctx) => { if (!chosenLangs(ctx).length) return 'Kies minstens één taal.'; if (ctx.opts.range) for (const f of ctx.files.filter((x) => x.kind === 'pdf')) { try { parseRange(ctx.opts.range, f.pages); } catch (e) { return e.message; } } },
  async run(ctx) {
    const outs = []; let tot = { done: 0, skipped: 0, words: 0 };
    const jobs = ctx.files.filter((f) => f.kind === 'pdf').map((f) => ({ f }));
    const imgs = ctx.files.filter((f) => f.kind === 'image'); if (imgs.length) jobs.push({ imgs });
    for (const j of jobs) {
      // (een pdf-lib-document niet eerst opslaan en daarna verder bewerken: dan gaan latere wijzigingen verloren)
      let doc, pdf; if (j.f) { doc = await loadPdf(j.f); pdf = await openPdfJs(j.f); } else { const b = await (await imagesToDoc(j.imgs)).save(); doc = await PDFDocument.load(b); pdf = await bytesToPdfJs(b); }
      const pages = j.f && ctx.opts.range ? parseRange(ctx.opts.range, j.f.pages) : null;
      const r = await ocrDocument(doc, pdf, { langs: chosenLangs(ctx), pages, skipText: ctx.opts.skipText, dpi: +ctx.opts.dpi || 300, progress: ctx.progress });
      tot.done += r.done; tot.skipped += r.skipped; tot.words += r.words;
      const name = j.f ? baseName(j.f.name) : baseName(j.imgs[0].name);
      outs.push({ name: `${name}_ocr.pdf`, data: await save(doc) });
      if (ctx.opts.txt) outs.push({ name: `${name}_ocr.txt`, data: new TextEncoder().encode(r.texts.map((t, i) => t == null ? '' : `--- ${L('Pagina', 'Page')} ${i + 1} ---\r\n${t.replace(/\n/g, '\r\n')}`).filter(Boolean).join('\r\n')) });
    }
    return { title: `${plural(tot.done)} herkend`, note: `${tot.words} woorden herkend.` + (tot.skipped ? ` ${tot.skipped} pagina('s) hadden al tekst en zijn overgeslagen.` : ''), outputs: outs, zipName: 'ocr' };
  }
};

/* ================= Scan opschonen ================= */
// Scheefstand meten via de projectie van donkere pixels (variantie van rijsommen)
function detectSkew(g, w, h) {
  const k = Math.min(1, 1100 / w); const sw = Math.round(w * k), sh = Math.round(h * k);
  const c = document.createElement('canvas'); c.width = sw; c.height = sh; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(g.canvas, 0, 0, sw, sh);
  const d = x.getImageData(0, 0, sw, sh).data; const pts = [];
  for (let y = Math.round(sh * 0.04); y < sh * 0.96; y++) for (let i = Math.round(sw * 0.06); i < sw * 0.94; i++) { const p = (y * sw + i) * 4; if (d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11 < 110) pts.push(i, y); }
  if (pts.length < 400) return 0;
  const score = (deg) => { const a = deg * Math.PI / 180, s = Math.sin(a), co = Math.cos(a); const H = new Float64Array(sh * 2 + sw + 10); const off = sw + 4; for (let i = 0; i < pts.length; i += 2) H[Math.round(-pts[i] * s + pts[i + 1] * co) + off]++; let t = 0; for (let i = 1; i < H.length; i++) { const dd = H[i] - H[i - 1]; t += dd * dd; } return t; };
  let best = 0, bs = -1; for (let a = -8; a <= 8; a += 0.5) { const v = score(a); if (v > bs) { bs = v; best = a; } }
  let fine = best; for (let a = best - 0.5; a <= best + 0.5; a += 0.05) { const v = score(a); if (v > bs) { bs = v; fine = a; } }
  return Math.round(fine * 100) / 100;
}
function whiteBorders(c) { // donkere randen (scannerdeksel, schaduw) wit maken
  const W = c.width, H = c.height; const g = c.getContext('2d', { willReadFrequently: true }); const im = g.getImageData(0, 0, W, H); const d = im.data;
  const lum = (i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; const dark = (y0, y1, x0, x1) => { let s = 0, n = 0; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { s += lum((y * W + x) * 4); n++; } return s / n < 90; };
  const fill = (x0, y0, x1, y1) => { for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; } };
  const lim = 0.12; let t = 0; while (t < H * lim && dark(t, t + 1, 0, W)) t++; let b = 0; while (b < H * lim && dark(H - b - 1, H - b, 0, W)) b++;
  let l = 0; while (l < W * lim && dark(0, H, l, l + 1)) l++; let r = 0; while (r < W * lim && dark(0, H, W - r - 1, W - r)) r++;
  if (t) fill(0, 0, W, t + 3); if (b) fill(0, H - b - 3, W, H); if (l) fill(0, 0, l + 3, H); if (r) fill(W - r - 3, 0, W, H);
  // schuine donkere wiggen langs de randen (van scheef inscannen): vanaf elke rand donkere pixels wegvegen tot het eerste lichte punt
  const band = Math.round(Math.min(W, H) * 0.06);
  for (let y = 0; y < H; y++) { for (let x = 0; x < band && lum((y * W + x) * 4) < 90; x++) fill(x, y, x + 1, y + 1); for (let x = W - 1; x > W - band && lum((y * W + x) * 4) < 90; x--) fill(x, y, x + 1, y + 1); }
  for (let x = 0; x < W; x++) { for (let y = 0; y < band && lum((y * W + x) * 4) < 90; y++) fill(x, y, x + 1, y + 1); for (let y = H - 1; y > H - band && lum((y * W + x) * 4) < 90; y--) fill(x, y, x + 1, y + 1); }
  g.putImageData(im, 0, 0);
}
function cleanCanvas(src, o) {
  let c = src; const W = c.width, H = c.height; let angle = 0;
  if (o.borders) whiteBorders(c);
  if (o.deskew) {
    angle = detectSkew(c.getContext('2d'), W, H);
    if (Math.abs(angle) >= 0.1) { const r = document.createElement('canvas'); r.width = W; r.height = H; const x = r.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.translate(W / 2, H / 2); x.rotate(-angle * Math.PI / 180); x.drawImage(c, -W / 2, -H / 2); c = r; }
  }
  const g = c.getContext('2d', { willReadFrequently: true }); const im = g.getImageData(0, 0, W, H); const d = im.data;
  if (o.levels || o.whiten || o.bw) {
    const hist = new Uint32Array(256); for (let i = 0; i < d.length; i += 4) hist[(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) | 0]++;
    const tot = W * H; let acc = 0, lo = 0; while (lo < 255 && (acc += hist[lo]) < tot * 0.005) lo++;
    // papierkleur = meest voorkomende lichte grijswaarde
    let paper = 200, pm = 0; for (let v = 120; v < 256; v++) if (hist[v] > pm) { pm = hist[v]; paper = v; }
    const hi = Math.max(lo + 40, paper - 4);
    const lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) { let n = o.levels ? (v - lo) * 255 / (hi - lo) : v; if (o.whiten && v >= hi - (hi - lo) * 0.12) n = 255; lut[v] = n; }
    if (o.bw) { const thr = (lo + hi) / 2 + (hi - lo) * 0.1; for (let i = 0; i < d.length; i += 4) { const v = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) < thr ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; } }
    else for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  }
  if (o.bw && o.despeckle) { // losse zwarte puntjes zonder buren verwijderen
    const isB = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4] === 0; const kill = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isB(x, y)) { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isB(x + dx, y + dy)) n++; if (n <= 1) kill.push((y * W + x) * 4); }
    for (const i of kill) d[i] = d[i + 1] = d[i + 2] = 255;
  }
  g.putImageData(im, 0, 0);
  return { canvas: c, angle };
}
const scanClean = {
  input: { kind: 'pdf+image', multiple: true }, runLabel: 'Scan opschonen', lead: 'Zet scheef gescande pagina\'s recht, maakt de achtergrond wit en verwijdert donkere randen. Handig voor scans en foto\'s van documenten.',
  options: (ctx) => [
    F.check(ctx, 'deskew', 'Scheve pagina\'s rechtzetten', true),
    F.check(ctx, 'levels', 'Contrast verbeteren', true),
    F.check(ctx, 'whiten', 'Achtergrond wit maken', true),
    F.check(ctx, 'borders', 'Donkere randen verwijderen', true),
    F.check(ctx, 'bw', 'Zwart-wit (kleinste bestand, voor tekst)', false),
    F.check(ctx, 'despeckle', 'Losse puntjes verwijderen (bij zwart-wit)', true),
    F.seg(ctx, 'dpi', 'Resolutie', [[150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi']], 200),
    F.check(ctx, 'ocr', 'Daarna tekst herkennen (OCR, Nederlands + Engels)', false)
  ],
  summary: (ctx) => ctx.files.length ? `${ctx.files.length} bestand(en)` : 'Nog geen bestand gekozen',
  async preview(ctx) {
    const f = ctx.files[0]; let pdf; if (f.kind === 'pdf') pdf = await openPdfJs(f); else pdf = await bytesToPdfJs(await (await imagesToDoc([f])).save());
    const { canvas } = await renderCanvas(await pdf.getPage(1), 110); const { canvas: out } = cleanCanvas(canvas, ctx.opts);
    const d = await PDFDocument.create(); const jpg = new Uint8Array(await (await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.85))).arrayBuffer()); const img = await d.embedJpg(jpg); d.addPage([out.width, out.height]).drawImage(img, { x: 0, y: 0, width: out.width, height: out.height }); return d.save();
  },
  async run(ctx) {
    const outs = []; const angles = []; let n = 0, words = 0; const o = ctx.opts; const dpi = +o.dpi || 200;
    for (const f of ctx.files) {
      const pdf = f.kind === 'pdf' ? await openPdfJs(f) : await bytesToPdfJs(await (await imagesToDoc([f])).save());
      const doc = await PDFDocument.create();
      for (let i = 1; i <= pdf.numPages; i++) {
        ctx.progress(`${f.name}: pagina ${i} van ${pdf.numPages}…`);
        const pp = await pdf.getPage(i); const { canvas } = await renderCanvas(pp, dpi, 6000); const { canvas: out, angle } = cleanCanvas(canvas, o); if (Math.abs(angle) >= 0.1) angles.push(angle);
        const blob = await new Promise((r) => out.toBlob(r, o.bw ? 'image/png' : 'image/jpeg', 0.82)); const bytes = new Uint8Array(await blob.arrayBuffer());
        const img = o.bw ? await doc.embedPng(bytes) : await doc.embedJpg(bytes); const vp1 = pp.getViewport({ scale: 1 });
        doc.addPage([vp1.width, vp1.height]).drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height }); n++;
        canvas.width = canvas.height = 0; out.width = out.height = 0;
      }
      let data = await save(doc);
      if (o.ocr) { const d2 = await PDFDocument.load(data); const rr = await ocrDocument(d2, await bytesToPdfJs(data), { langs: ['nld', 'eng'], skipText: false, progress: ctx.progress }); words += rr.words; data = await save(d2); }
      outs.push({ name: `${baseName(f.name)}_opgeschoond.pdf`, data });
    }
    const fmt = (a) => a.toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'nl-BE', { maximumFractionDigits: 1 });
    return { title: `${plural(n)} opgeschoond`, note: (angles.length ? `${angles.length} pagina('s) rechtgezet (${angles.map((a) => fmt(-a) + '°').slice(0, 6).join(', ')}${angles.length > 6 ? ' …' : ''}).` : 'Er waren geen scheve pagina\'s.') + (o.ocr ? ` ${words} woorden herkend.` : ''), outputs: outs, zipName: 'opgeschoond' };
  }
};

export const OCR = { ocr, 'scan-clean': scanClean };
