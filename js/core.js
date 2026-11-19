// PDF Studio — gedeelde hulpfuncties
// De zware bibliotheken (pdf-lib, fflate, pdf.js ≈ 1,1 MB) worden pas geladen wanneer een hulpmiddel ze nodig heeft,
// zodat de startpagina meteen verschijnt. loadLibs() is idempotent.
export let PDFLib = window.PDFLib;
export let fflate = window.fflate;
export let pdfjsLib;

const BASE = new URL('../', import.meta.url).href;
const classic = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = BASE + src; s.onload = res; s.onerror = () => rej(new Error('Kon ' + src + ' niet laden')); document.head.append(s); });
let libsP;
export function loadLibs() {
  return libsP || (libsP = Promise.all([
    PDFLib ? null : classic('lib/pdf-lib.min.js').then(() => { PDFLib = window.PDFLib; tunePdfLib(PDFLib); }),
    fflate ? null : classic('lib/fflate.min.js').then(() => { fflate = window.fflate; }),
    import('../lib/pdfjs/pdf.min.js').then((m) => { pdfjsLib = m; m.GlobalWorkerOptions.workerSrc = BASE + 'lib/pdfjs/pdf.worker.min.js'; })
  ]).catch((e) => { libsP = null; throw e; }));
}
// pdf-lib geeft standaard na elke 100 objecten (laden) / 50 objecten (opslaan) de browser even terug; bij grote PDF's kost dat
// honderden milliseconden wachttijd. Grotere stappen houden het scherm nog steeds vlot maar zijn veel sneller.
function tunePdfLib(L) {
  const D = L.PDFDocument; const load0 = D.load.bind(D); const save0 = D.prototype.save;
  D.load = (bytes, o = {}) => load0(bytes, { parseSpeed: 2000, ...o });
  D.prototype.save = function (o = {}) {
    // een ingesloten, verkleind lettertype zonder één gebruikt teken krijgt anders een ongeldige breedtetabel (W [[]])
    for (const f of this.fonts || []) { const e = f.embedder; if (e && e.subset && Array.isArray(e.glyphs) && typeof e.computeWidths === 'function' && !e._wFix) { const cw = e.computeWidths; e.computeWidths = function () { return this.glyphs.filter(Boolean).length ? cw.call(this) : []; }; e._wFix = true; } }
    return save0.call(this, { objectsPerTick: 1500, ...o });
  };
}
if (PDFLib) tunePdfLib(PDFLib);

/* ---------- DOM ---------- */
export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') n.innerHTML = v;
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return n;
}

export const ICONS = {
  bookmark:'M6 3h12v18l-6-4-6 4z', label:'M3 12l9-9h8v8l-9 9zM15 8h.01', bates:'M9 4L7 20M17 4l-2 16M4 9h16M3 15h16', indent:'M4 6h16M10 12h10M10 18h10M4 10l3 3-3 3', outdent:'M4 6h16M10 12h10M10 18h10M7 10l-3 3 3 3', ruler:'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2', stamp:'M9 4h6l-1 7h4l2 5H4l2-5h4zM4 20h16', field:'M3 7h18v10H3zM7 10v4M6 10h2M6 14h2', attach:'M8 12l6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l7-7', layers:'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5', swap:'M4 5h10v8H4zM10 11h10v8H10z', shield:'M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6zM9 12l2 2 4-4', insert:'M7 3h8l4 4v14H7zM15 3v4h4M13 11v6M10 14h6', resize:'M4 4h7M4 4v7M20 20h-7M20 20v-7M4 4l7 7M20 20l-7-7', list:'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', access:'M12 4a1.5 1.5 0 1 0 0 .01M5 8l7 1 7-1M12 9v5l-3 6M12 14l3 6', batch:'M4 8h12v12H4zM8 4h12v12', table:'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14', slides:'M3 4h18v12H3zM12 16v4M8 20h8', word:'M7 3h8l4 4v14H7zM15 3v4h4M9 12l1.5 5 1.5-4 1.5 4 1.5-5', dist:'M3 12h18M3 8v8M21 8v8', perim:'M4 18l4-12 8 2 4 10z', area:'M4 18l4-12 8 2 4 10zM8 14h8M9 10h6', scale:'M3 17h18M5 17v-3M9 17v-5M13 17v-3M17 17v-5M21 17v-3', radio:'M12 12h.01M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16', drop:'M3 7h18v10H3zM15 11l2 2 2-2', sigfield:'M3 7h18v10H3zM6 14c1 0 2-4 3-4s1 3 2 3 2-2 3-2',
  text:'M4 7V4h16v3M12 4v16M9 20h6', image:'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M9 8h.01',
  link:'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  comment:'M4 5h16v11H9l-5 4z', draw:'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3', form:'M5 4h14v16H5zM8 9h8M8 13h8M8 17h4',
  sign:'M4 19c2 0 3-8 5-8s1 6 3 6 3-5 4-5M4 21h16', redact:'M4 6h16M4 12h8M4 18h16M14 10h6v4h-6z',
  merge:'M4 4h6v6H4zM14 4h6v6h-6zM8 14l4 4 4-4M12 10v8', split:'M12 3v18M4 7h5v10H4zM15 7h5v10h-5z',
  extract:'M7 3h8l4 4v14H7zM15 3v4h4M10 14h6', trash:'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  reorder:'M8 4v16M8 4L5 7M8 4l3 3M16 20V4M16 20l-3-3M16 20l3-3', rotate:'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  rotl:'M4 11a8 8 0 1 1 2.3 5.7M4 4v7h7',
  crop:'M7 3v14h14M3 7h14v14', number:'M5 3h14v18H5zM10 17h4',
  compress:'M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5', tag:'M3 12l9-9h8v8l-9 9zM8 8h.01M4 4l16 16',
  lock:'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', unlock:'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
  mark:'M12 3l8 9-8 9-8-9z', flat:'M3 8l9-5 9 5-9 5zM3 13l9 5 9-5', hf:'M5 3h14v18H5zM5 7h14M5 17h14',
  convert:'M4 8h13l-3-3M20 16H7l3 3', ocr:'M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M8 9h8M8 12h8M8 15h5',
  pdfa:'M7 3h8l4 4v14H7zM15 3v4h4M10 12l2 2 4-4', compare:'M4 4h7v16H4zM13 4h7v16h-7z', scan:'M3 12h18M5 5h14v14H5z',
  search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', upload:'M12 16V4M7 9l5-5 5 5M5 20h14',
  download:'M12 4v12M7 11l5 5 5-5M5 20h14', file:'M7 3h8l4 4v14H7zM15 3v4h4', grip:'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  x:'M6 6l12 12M18 6L6 18', up:'M12 19V5M6 11l6-6 6 6', down:'M12 5v14M6 13l6 6 6-6', check:'M5 12l5 5 9-9',
  plus:'M12 5v14M5 12h14', back:'M15 6l-6 6 6 6', undo:'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo:'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3', grid:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  zin:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6M11 8v6', zout:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
  cursor:'M5 3l6 16 2-7 7-2z', shape:'M4 4h8v8H4zM14 14a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', highlight:'M4 20h16M7 16l9-9 3 3-9 9H7z',
  strike:'M5 12h14M8 7a4 4 0 0 1 8 0M8 17a4 4 0 0 0 8 0', underline:'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
  whiteout:'M4 6h16v12H4z', textadd:'M4 5h16v14H4zM8 9h8M12 9v7'
};
export function icon(name, size = 22, color = 'currentColor', sw = 1.7) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', color); s.setAttribute('stroke-width', sw);
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[name] || ICONS.file);
  s.append(p); return s;
}

/* ---------- Compatibiliteit (iPhone, oudere Android) ---------- */
export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') { try { const c = new OffscreenCanvas(w, h); if (c.getContext('2d') && c.convertToBlob) return c; } catch {} }
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
export function canvasBlob(c, type, quality) {
  if (c.convertToBlob) return c.convertToBlob({ type, quality });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('afbeelding kon niet gemaakt worden'))), type, quality));
}
// Afbeelding decoderen (respecteert EXIF-draaiing); valt terug op <img> waar createImageBitmap ontbreekt of faalt
export async function loadBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch {}
    try { return await createImageBitmap(blob); } catch {}
  }
  const url = URL.createObjectURL(blob);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
export const bmpW = (b) => b.naturalWidth || b.width, bmpH = (b) => b.naturalHeight || b.height;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isMobile = () => isIOS() || /Android|Mobi/i.test(navigator.userAgent);

/* ---------- Meldingen & dialogen ---------- */
export function toast(msg, type = 'info', ms = 4500) {
  const t = el('div', { class: 'toast' + (type === 'error' ? ' error' : ''), role: type === 'error' ? 'alert' : 'status' }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}
export function modal({ title, body, ok = 'OK', cancel = 'Annuleren', onOk }) {
  return new Promise((resolve) => {
    const bg = el('div', { class: 'modal-bg' });
    const close = (v) => { bg.remove(); resolve(v); };
    const okBtn = el('button', { class: 'btn pri', type: 'submit' }, ok);
    const form = el('form', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('h2', null, title), body,
      el('div', { class: 'acts' }, cancel ? el('button', { class: 'btn', type: 'button', onclick: () => close(null) }, cancel) : null, okBtn));
    form.addEventListener('submit', async (e) => { e.preventDefault(); const v = onOk ? await onOk() : true; if (v !== undefined && v !== false) close(v); });
    bg.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
    bg.append(form); document.body.append(bg);
    // eerste zichtbare invoerveld focussen (verborgen tabbladen overslaan); anders het venster zelf, zodat Esc altijd werkt
    form.tabIndex = -1; const f = [...form.querySelectorAll('input,select,textarea,button.pri')].find((x) => x.offsetParent !== null && !x.disabled && !/^(checkbox|radio)$/.test(x.type));
    (f || form).focus(); if (document.activeElement !== f && document.activeElement !== form) form.focus();
  });
}
export async function askPassword(fileName, wrong) {
  const inp = el('input', { type: 'password', id: 'pw-in', autocomplete: 'off' });
  const errBox = el('div', { class: 'help', style: { color: '#A3262A' } }, wrong ? 'Wachtwoord onjuist, probeer opnieuw.' : '');
  return modal({ title: 'Beveiligde PDF', ok: 'Openen',
    body: el('div', { class: 'field' }, el('div', { class: 'help' }, `"${fileName}" is beveiligd met een wachtwoord.`),
      el('label', { for: 'pw-in' }, 'Wachtwoord'), inp, errBox),
    onOk: () => inp.value });
}

/* ---------- Bestanden ---------- */
export const readBytes = (file) => file.arrayBuffer().then((b) => new Uint8Array(b));
export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' kB';
  return (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
}
export const baseName = (n) => n.replace(/\.[^.]+$/, '');
export const isPdfFile = (f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
export const isImageFile = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(f.name);

const MIME = { pdf: 'application/pdf', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg', csv: 'text/csv' };
function shareable(file) { try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch { return false; } }
// Opslaan: computer = gewone download; iPhone = deelvenster (Bewaar in Bestanden), met een knop zodat het altijd vanuit een tik gebeurt
export async function saveFile(name, data) {
  const ext = (name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
  const blob = new Blob([data], { type: MIME[ext] || 'application/octet-stream' });
  const file = typeof File === 'function' ? new File([blob], name, { type: blob.type }) : null;
  if (isIOS() && file && shareable(file)) {
    return new Promise((resolve) => {
      const go = el('button', { class: 'btn pri big', type: 'button', id: 'share-go' }, 'Opslaan of delen');
      const bg = el('div', { class: 'modal-bg' }, el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Bestand klaar' },
        el('h2', null, 'Bestand klaar'), el('p', { class: 'help', style: { fontSize: '14px' } }, name + ' — kies daarna "Bewaar in Bestanden".'), go,
        el('button', { class: 'btn', type: 'button', onclick: () => { bg.remove(); resolve(false); } }, 'Sluiten')));
      go.addEventListener('click', async () => { try { await navigator.share({ files: [file], title: name }); bg.remove(); resolve(true); } catch (e) { if (e && e.name === 'AbortError') return; bg.remove(); anchorDownload(name, blob); resolve(true); } });
      document.body.append(bg); go.focus();
    });
  }
  anchorDownload(name, blob); return true;
}
function anchorDownload(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name, style: { display: 'none' } });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
export function zip(files) { // [{name, data}]
  const obj = {}; const used = new Set();
  for (const f of files) {
    let n = f.name, i = 2; while (used.has(n)) n = baseName(f.name) + ` (${i++})` + (f.name.match(/\.[^.]+$/) || [''])[0];
    used.add(n); obj[n] = [f.data, { level: 0 }];
  }
  return fflate.zipSync(obj);
}

/* ---------- Paginabereik ---------- */
// "1-3, 5, 8-" -> [0,1,2,4,7,...]; null bij lege invoer; werpt Error bij ongeldige invoer
export function parseRange(str, n, { keepOrder = false } = {}) {
  if (!str || !str.trim()) return null;
  const out = [];
  for (let part of str.split(/[,;]/)) {
    part = part.trim(); if (!part) continue;
    const m = part.match(/^(\d*)\s*[-–]\s*(\d*)$/);
    let a, b;
    if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; }
    else if (/^\d+$/.test(part)) { a = b = +part; }
    else throw new Error(`Ongeldig paginabereik: "${part}"`);
    if (a < 1 || b < 1 || a > n || b > n) throw new Error(`Pagina ${a > n || a < 1 ? a : b} bestaat niet (document heeft ${n} pagina's)`);
    const step = a <= b ? 1 : -1;
    for (let i = a; step > 0 ? i <= b : i >= b; i += step) out.push(i - 1);
  }
  if (keepOrder) return out;
  return [...new Set(out)].sort((x, y) => x - y);
}
export function rangeString(idx) { // [0,1,2,4] -> "1-3, 5"
  const s = [...idx].sort((a, b) => a - b); const parts = [];
  for (let i = 0; i < s.length; i++) {
    let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(i === j ? `${s[i] + 1}` : `${s[i] + 1}-${s[j] + 1}`); i = j;
  }
  return parts.join(', ');
}

/* ---------- PDF laden ---------- */
export async function loadPdf(entry, opts = {}) {
  const o = { updateMetadata: false, ...opts };
  if (entry.password != null) o.password = entry.password;
  const doc = await PDFLib.PDFDocument.load(entry.bytes, o);
  if (entry.encrypted && entry.password != null) purgeEncryptionLeftovers(doc);
  return doc;
}
// Na ontsleutelen kunnen het oude versleutelingswoordenboek en xref-streams als losse objecten achterblijven
export function purgeEncryptionLeftovers(doc) {
  const { PDFName, PDFDict } = PDFLib; const ctx = doc.context; const N = (x) => PDFName.of(x);
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    const d = obj instanceof PDFDict ? obj : obj && obj.dict instanceof PDFDict ? obj.dict : null; if (!d) continue;
    const type = d.get(N('Type')); const filt = d.get(N('Filter'));
    if ((type && type.toString() === '/XRef') || (filt && filt.toString() === '/Standard' && d.get(N('O')) && d.get(N('U')))) ctx.delete(ref);
  }
}
// Nieuw document met PDF Studio als maker
export async function newDoc() {
  const d = await PDFLib.PDFDocument.create({ updateMetadata: false });
  d.setProducer('PDF Studio'); d.setCreator('PDF Studio');
  return d;
}
// Controleert versleuteling en vraagt zo nodig een wachtwoord. Geeft {pages, encrypted} of werpt.
export async function probePdf(entry, { askPw = true } = {}) {
  let doc;
  try { doc = await PDFLib.PDFDocument.load(entry.bytes, { ignoreEncryption: true, updateMetadata: false }); }
  catch (e) { throw new Error(`"${entry.name}" is geen geldige PDF of is beschadigd.`); }
  entry.encrypted = !!doc.isEncrypted;
  if (!doc.isEncrypted) { entry.pages = doc.getPageCount(); return entry; }
  // eerst leeg gebruikerswachtwoord proberen (alleen eigenaarswachtwoord)
  try { const d = await PDFLib.PDFDocument.load(entry.bytes, { password: '', updateMetadata: false }); entry.password = ''; entry.pages = d.getPageCount(); return entry; } catch {}
  if (!askPw) { entry.pages = doc.getPageCount(); entry.needsPw = true; return entry; }
  let wrong = false;
  for (;;) {
    const pw = await askPassword(entry.name, wrong);
    if (pw == null) throw new Error(`"${entry.name}" is beveiligd; geen wachtwoord opgegeven.`);
    try { const d = await PDFLib.PDFDocument.load(entry.bytes, { password: pw, updateMetadata: false }); entry.password = pw; entry.pages = d.getPageCount(); return entry; }
    catch { wrong = true; }
  }
}
// Lettertypen en wasm van pdf.js zitten als base64-modules in lib/pdfjs/data (alleen geladen wanneer nodig)
class StudioDataFactory {
  constructor() {}
  async fetch({ filename }) {
    const m = await import(BASE + 'lib/pdfjs/data/' + filename + '.js');
    const bin = atob(m.default); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
}
const PDFJS_OPTS = { BinaryDataFactory: StudioDataFactory, useWorkerFetch: false, standardFontDataUrl: BASE + 'lib/pdfjs/data/', wasmUrl: BASE + 'lib/pdfjs/wasm/', isEvalSupported: false };
export function openPdfJs(entry) {
  if (!entry._pdfjs) entry._pdfjs = loadLibs().then(() => pdfjsLib.getDocument({ ...PDFJS_OPTS, data: entry.bytes.slice(), password: entry.password || undefined }).promise);
  return entry._pdfjs;
}
export async function bytesToPdfJs(bytes, password, extra = {}) {
  await loadLibs();
  return pdfjsLib.getDocument({ ...PDFJS_OPTS, ...extra, data: bytes.slice(), password }).promise;
}
export async function renderPage(pdf, num, { width, scale, rotation = 0, canvas } = {}) {
  const page = await pdf.getPage(num);
  let vp = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
  const s = scale || (width / vp.width);
  vp = page.getViewport({ scale: s, rotation: (page.rotate + rotation) % 360 });
  const c = canvas || document.createElement('canvas');
  c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
  await page.render({ canvas: c, viewport: vp }).promise;
  return c;
}

/* ---------- Tekst tekenen ---------- */
const MM = 72 / 25.4;
export const mm = (v) => v * MM;
export function safeText(font, text) {
  let out = '';
  for (const ch of text) {
    try { font.encodeText(ch); out += ch; }
    catch { out += ch === '’' || ch === '‘' ? "'" : ch === '“' || ch === '”' ? '"' : '?'; }
  }
  return out;
}
export function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/.{2}/g).map((x) => parseInt(x, 16) / 255);
  return PDFLib.rgb(m[0], m[1], m[2]);
}
// Zichtbare afmetingen van een pagina (na /Rotate)
export function visualBox(page) {
  const box = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  return { ...box, r, VW: r % 180 ? box.height : box.width, VH: r % 180 ? box.width : box.height };
}
// Visuele coördinaten (vx vanaf links, vy vanaf onder) -> PDF-coördinaten
export function v2p(b, vx, vy) {
  const { x, y, width: W, height: H, r } = b;
  if (r === 90) return { x: x + W - vy, y: y + vx };
  if (r === 180) return { x: x + W - vx, y: y + H - vy };
  if (r === 270) return { x: x + vy, y: y + H - vx };
  return { x: x + vx, y: y + vy };
}
// Tekst op positie 0..8 (3x3 raster) tekenen, rekening houdend met paginarotatie
export function drawTextAt(page, text, { font, size, pos, margin, color, opacity = 1 }) {
  const b = visualBox(page);
  const t = safeText(font, text);
  const tw = font.widthOfTextAtSize(t, size);
  const col = pos % 3, row = Math.floor(pos / 3);
  const vx = col === 0 ? margin : col === 1 ? (b.VW - tw) / 2 : b.VW - margin - tw;
  const vy = row === 0 ? b.VH - margin - size * 0.75 : row === 1 ? (b.VH - size * 0.7) / 2 : margin;
  const p = v2p(b, vx, vy);
  page.drawText(t, { x: p.x, y: p.y, size, font, color, opacity, rotate: PDFLib.degrees(b.r) });
}
export function toRoman(n) {
  const m = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
  let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s;
}

/* ---------- Formuliervelden ---------- */
export const F = {
  _set(ctx, key, v) { ctx.opts[key] = v; ctx.changed && ctx.changed(key); },
  text(ctx, key, label, def = '', { placeholder, help, type = 'text' } = {}) {
    const id = 'f-' + key; if (!(key in ctx.opts)) ctx.opts[key] = def;
    const i = el('input', { type, id, value: ctx.opts[key], placeholder, autocomplete: 'off', oninput: (e) => F._set(ctx, key, e.target.value) });
    return el('div', { class: 'field' }, el('label', { for: id }, label), i, help ? el('div', { class: 'help' }, help) : null);
  },
  area(ctx, key, label, def = '', { help } = {}) {
    const id = 'f-' + key; if (!(key in ctx.opts)) ctx.opts[key] = def;
    const i = el('textarea', { id, oninput: (e) => F._set(ctx, key, e.target.value) }); i.value = ctx.opts[key];
    return el('div', { class: 'field' }, el('label', { for: id }, label), i, help ? el('div', { class: 'help' }, help) : null);
  },
  number(ctx, key, label, def, { min, max, step = 1, help } = {}) {
    const id = 'f-' + key; if (!(key in ctx.opts)) ctx.opts[key] = def;
    const i = el('input', { type: 'number', id, value: ctx.opts[key], min, max, step, oninput: (e) => F._set(ctx, key, e.target.value === '' ? def : +e.target.value) });
    return el('div', { class: 'field' }, el('label', { for: id }, label), i, help ? el('div', { class: 'help' }, help) : null);
  },
  range(ctx, key, label, def, { min, max, step = 1, fmt = (v) => v } = {}) {
    const id = 'f-' + key; if (!(key in ctx.opts)) ctx.opts[key] = def;
    const out = el('span', null, fmt(ctx.opts[key]));
    const i = el('input', { type: 'range', id, value: ctx.opts[key], min, max, step, oninput: (e) => { out.textContent = fmt(+e.target.value); F._set(ctx, key, +e.target.value); } });
    return el('div', { class: 'field' }, el('label', { for: id }, label, ': ', out), i);
  },
  color(ctx, key, label, def) {
    const id = 'f-' + key; if (!(key in ctx.opts)) ctx.opts[key] = def;
    const i = el('input', { type: 'color', id, value: ctx.opts[key], oninput: (e) => F._set(ctx, key, e.target.value) });
    return el('div', { class: 'field' }, el('label', { for: id }, label), i);
  },
  check(ctx, key, label, def = false) {
    if (!(key in ctx.opts)) ctx.opts[key] = def;
    const i = el('input', { type: 'checkbox', id: 'f-' + key, onchange: (e) => F._set(ctx, key, e.target.checked) }); i.checked = ctx.opts[key];
    return el('label', { class: 'check' }, i, label);
  },
  select(ctx, key, label, options, def) {
    const id = 'f-' + key; if (!(key in ctx.opts)) ctx.opts[key] = def ?? options[0][0];
    const s = el('select', { id, onchange: (e) => F._set(ctx, key, e.target.value) }, options.map(([v, t]) => el('option', { value: v }, t)));
    s.value = ctx.opts[key];
    return el('div', { class: 'field' }, el('label', { for: id }, label), s);
  },
  seg(ctx, key, label, options, def, { horizontal = false } = {}) {
    if (!(key in ctx.opts)) ctx.opts[key] = def ?? options[0][0];
    const wrap = el('div', { class: 'seg' + (horizontal ? ' h' : ''), role: 'group', 'aria-label': label });
    const btns = options.map(([v, t]) => el('button', { type: 'button', 'data-v': v, 'aria-pressed': String(ctx.opts[key] === v),
      onclick: () => { btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v)))); F._set(ctx, key, v); } }, t));
    wrap.append(...btns);
    return el('div', { class: 'field' }, el('span', { class: 'flabel' }, label), wrap);
  },
  pos(ctx, key, label, def = 7) {
    if (!(key in ctx.opts)) ctx.opts[key] = def;
    const names = ['linksboven','middenboven','rechtsboven','linksmidden','midden','rechtsmidden','linksonder','middenonder','rechtsonder'];
    const g = el('div', { class: 'posgrid', role: 'group', 'aria-label': label });
    const btns = names.map((n, i) => el('button', { type: 'button', 'aria-label': 'Positie ' + n, 'aria-pressed': String(ctx.opts[key] === i),
      onclick: () => { btns.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j))); F._set(ctx, key, i); } }, el('span')));
    g.append(...btns);
    return el('div', { class: 'field' }, el('span', { class: 'flabel' }, label), g);
  }
};
