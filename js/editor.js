// PDF Studio — editor (tekst bewerken, annoteren, tekenen, formulieren, handtekening, redigeren)
import { rewritePage, fontsForItems, embedFallbackFont, ensureFontkit } from './textengine.js';
import { addOwnFont, loadOwnFonts, ownFonts, localFontsSupported, findLocalFonts } from './fontlib.js';
import { makeCanvas, canvasBlob, loadBitmap, bmpW, bmpH } from './core.js';
import { el, icon, toast, modal, readBytes, isPdfFile, isImageFile, probePdf, openPdfJs, loadPdf, saveFile, baseName, PDFLib, pdfjsLib, safeText, hexToRgb, bytesToPdfJs } from './core.js';

const { PDFName, PDFHexString, PDFString, StandardFonts, degrees, BlendMode, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList } = PDFLib;

/* ---------- Gereedschappen ---------- */
const TABS = [
  { id: 'edit', label: 'Bewerken', tools: [['select', 'Selecteren', 'cursor'], ['textedit', 'Tekst bewerken', 'text'], ['text', 'Tekstvak', 'textadd'], ['image', 'Afbeelding', 'image'], ['link', 'Koppeling', 'link'], ['whiteout', 'Witmaken', 'whiteout']] },
  { id: 'annot', label: 'Annoteren', tools: [['select', 'Selecteren', 'cursor'], ['highlight', 'Markeren', 'highlight'], ['underline', 'Onderstrepen', 'underline'], ['strike', 'Doorhalen', 'strike'], ['comment', 'Opmerking', 'comment'], ['ink', 'Tekenen', 'draw'], ['rect', 'Rechthoek', 'shape'], ['ellipse', 'Ellips', 'shape'], ['arrow', 'Pijl', 'convert']] },
  { id: 'forms', label: 'Formulieren & handtekening', tools: [['select', 'Selecteren', 'cursor'], ['sign', 'Handtekening', 'sign'], ['date', 'Datum', 'textadd'], ['check', 'Vinkje', 'check']] },
  { id: 'protect', label: 'Redigeren', tools: [['select', 'Selecteren', 'cursor'], ['redact', 'Redigeren', 'redact']] }
];
const DRAG_TOOLS = new Set(['link', 'whiteout', 'highlight', 'underline', 'strike', 'rect', 'ellipse', 'arrow', 'redact']);
const HELP = {
  select: 'Klik op een element om het te selecteren, te verplaatsen of aan te passen. Delete verwijdert het.',
  textedit: 'Klik op bestaande tekst om ze te wijzigen. De originele tekst wordt afgedekt en vervangen.',
  text: 'Klik op de pagina om een nieuw tekstvak te plaatsen.',
  image: 'Kies een afbeelding; ze verschijnt op de huidige pagina en is te verslepen en te schalen.',
  link: 'Sleep een kader over het gebied dat klikbaar moet worden en vul het webadres in.',
  whiteout: 'Sleep een wit vlak over inhoud die u wilt afdekken.',
  highlight: 'Sleep over tekst om ze te markeren.', underline: 'Sleep over tekst om ze te onderstrepen.', strike: 'Sleep over tekst om ze door te halen.',
  comment: 'Klik op de pagina om een notitie te plaatsen.', ink: 'Teken met de muis of pen op de pagina.',
  rect: 'Sleep om een rechthoek te tekenen.', ellipse: 'Sleep om een ellips te tekenen.', arrow: 'Sleep van begin- naar eindpunt.',
  sign: 'Teken of typ uw handtekening; ze verschijnt op de huidige pagina.', date: 'Klik op de pagina om de datum van vandaag te plaatsen.', check: 'Klik op de pagina om een vinkje te plaatsen.',
  redact: 'Sleep zwarte vlakken over gevoelige inhoud. Bij opslaan wordt de inhoud eronder definitief verwijderd.'
};
const MODE_FROM_HASH = { 'edit-text': ['edit', 'textedit'], 'edit-image': ['edit', 'image'], 'edit-link': ['edit', 'link'], 'edit-annotate': ['annot', 'highlight'], 'edit-draw': ['annot', 'ink'], 'fill-form': ['forms', 'select'], 'edit-sign': ['forms', 'sign'], 'edit-redact': ['protect', 'redact'] };
const FAMILIES = { Helvetica: 'Helvetica, Arial, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' };
function stdFont(fam, bold, italic) {
  if (fam === 'Times') return bold && italic ? 'TimesRomanBoldItalic' : bold ? 'TimesRomanBold' : italic ? 'TimesRomanItalic' : 'TimesRoman';
  if (fam === 'Courier') return bold && italic ? 'CourierBoldOblique' : bold ? 'CourierBold' : italic ? 'CourierOblique' : 'Courier';
  return bold && italic ? 'HelveticaBoldOblique' : bold ? 'HelveticaBold' : italic ? 'HelveticaOblique' : 'Helvetica';
}
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };
const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/* ---------- Editor ---------- */
function page(app, { topbar, id }) {
  document.title = 'Editor – PDF Studio';
  const [tab0, tool0] = MODE_FROM_HASH[id] || ['edit', 'textedit'];
  const S = { file: null, pdf: null, pages: [], scale: 1, tab: tab0, tool: tool0, objs: [], sel: null, hist: [], fut: [], assets: new Map(), fields: [], formVals: {}, flattenForm: false, seq: 0, dirty: false };
  window.__editor = S; // voor tests

  const fileIn = el('input', { type: 'file', accept: '.pdf,application/pdf', class: 'sr', id: 'file-in', 'aria-label': 'PDF openen' });
  const imgIn = el('input', { type: 'file', accept: 'image/*', class: 'sr', id: 'img-in', 'aria-label': 'Afbeelding kiezen' });
  const nameEl = el('span', { class: 'ed-name' }, 'Geen bestand geopend');
  const undoBtn = el('button', { class: 'btn icon', type: 'button', 'aria-label': 'Ongedaan maken', onclick: () => undo() }, icon('undo', 20));
  const redoBtn = el('button', { class: 'btn icon', type: 'button', 'aria-label': 'Opnieuw', onclick: () => redo() }, icon('redo', 20));
  const saveBtn = el('button', { class: 'btn pri', type: 'button', id: 'ed-save', onclick: () => save() }, icon('download', 18, '#fff'), el('span', { class: 'lbl-long' }, 'Opslaan als PDF'), el('span', { class: 'lbl-short' }, 'Opslaan'));
  const tabsEl = el('nav', { class: 'ed-tabs', role: 'tablist', 'aria-label': 'Gereedschapsgroepen' });
  const ribbon = el('div', { class: 'ed-ribbon', role: 'toolbar', 'aria-label': 'Gereedschappen' });
  const thumbs = el('aside', { class: 'ed-thumbs', 'aria-label': 'Paginaminiaturen' });
  const stage = el('main', { class: 'ed-stage', id: 'ed-stage' });
  const propsWrap = el('aside', { class: 'ed-props', 'aria-label': 'Eigenschappen' });
  const sheetBtn = el('button', { type: 'button', class: 'ed-sheet-handle', 'aria-expanded': 'false', onclick: () => sheet(!propsWrap.classList.contains('open')) }, el('span', { id: 'sheet-title' }, 'Eigenschappen'), el('span', { 'aria-hidden': 'true' }, '⌃'));
  const props = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
  propsWrap.append(sheetBtn, props);
  const sheet = (open) => { propsWrap.classList.toggle('open', open); sheetBtn.setAttribute('aria-expanded', String(open)); };
  const status = el('footer', { class: 'ed-status' });

  app.replaceChildren(
    topbar(el('div', { class: 'ed-top' }, nameEl, undoBtn, redoBtn,
      el('a', { class: 'btn', href: '#' }, icon('grid', 18), 'Toolbox'), saveBtn)),
    el('div', { class: 'editor' }, tabsEl, ribbon, el('div', { class: 'ed-body' }, thumbs, stage, propsWrap), status), fileIn, imgIn);

  /* ----- Lint ----- */
  function drawRibbon() {
    tabsEl.replaceChildren(...TABS.map((t) => el('button', { role: 'tab', type: 'button', 'aria-selected': String(t.id === S.tab), class: 'ed-tab', 'data-tab': t.id,
      onclick: () => { S.tab = t.id; setTool(t.id === 'forms' ? 'select' : t.tools[1][0]); } }, t.label)));
    const t = TABS.find((x) => x.id === S.tab);
    ribbon.replaceChildren(...t.tools.map(([tid, label, ic]) => el('button', { type: 'button', class: 'ed-tool', 'data-tool': tid, 'aria-pressed': String(S.tool === tid), onclick: () => setTool(tid) }, icon(ic, 22, '#004974'), el('span', null, label))),
      el('div', { style: { flex: '1' } }),
      el('div', { class: 'ed-zoom' },
        el('button', { class: 'btn icon sm', type: 'button', 'aria-label': 'Uitzoomen', onclick: () => zoom(S.scale / 1.2) }, icon('zout', 18)),
        el('span', { id: 'zoom-lbl' }, Math.round(S.scale * 100) + '%'),
        el('button', { class: 'btn icon sm', type: 'button', 'aria-label': 'Inzoomen', onclick: () => zoom(S.scale * 1.2) }, icon('zin', 18))));
  }
  function setTool(t) {
    S.tool = t; select(null);
    if (t === 'image') { if (S.pdf) imgIn.click(); }
    if (t === 'sign' && S.pdf) signatureDialog();
    stage.dataset.tool = t; S.pages.forEach(drawTextLayer);
    drawRibbon(); drawProps(); drawStatus();
  }

  /* ----- Openen ----- */
  function emptyStage() {
    const drop = el('div', { class: 'drop ed-drop' }, icon('upload', 32, '#1B93A5'), el('span', { style: { fontSize: '16px' } }, 'Sleep een PDF hierheen of'),
      el('button', { class: 'btn pri', type: 'button', onclick: () => fileIn.click() }, 'PDF openen'), el('span', { class: 'hint' }, 'Het bestand blijft op uw toestel.'));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); openFile(e.dataTransfer.files[0]); });
    stage.replaceChildren(el('div', { class: 'ed-empty' }, drop));
  }
  fileIn.addEventListener('change', () => { openFile(fileIn.files[0]); fileIn.value = ''; });
  async function openFile(file) {
    if (!file) return;
    if (!isPdfFile(file)) return toast('Kies een PDF-bestand.', 'error');
    if (S.dirty && !(await modal({ title: 'Niet-opgeslagen wijzigingen', body: el('p', null, 'De huidige wijzigingen gaan verloren. Doorgaan?'), ok: 'Doorgaan' }))) return;
    const entry = { id: Date.now(), file, name: file.name, size: file.size, bytes: await readBytes(file) };
    try { await probePdf(entry); } catch (e) { return toast(e.message, 'error'); }
    Object.assign(S, { libDoc: null, file: entry, objs: [], sel: null, hist: [], fut: [], formVals: {}, dirty: false });
    S.pdf = await openPdfJs(entry);
    nameEl.textContent = entry.name;
    try { const d = await loadPdf(entry); S.fields = d.getForm().getFields().map(fieldInfo).filter(Boolean); } catch { S.fields = []; }
    if (S.fields.length && S.tab !== 'forms' && id === 'fill-form') S.tab = 'forms';
    await buildPages();
    drawRibbon(); drawProps(); drawStatus();
  }
  function fieldInfo(f) {
    const name = f.getName();
    if (f instanceof PDFTextField) return { name, type: 'text', value: f.getText() || '', multi: f.isMultiline() };
    if (f instanceof PDFCheckBox) return { name, type: 'check', value: f.isChecked() };
    if (f instanceof PDFDropdown) return { name, type: 'select', value: (f.getSelected() || [])[0] || '', options: f.getOptions() };
    if (f instanceof PDFOptionList) return { name, type: 'select', value: (f.getSelected() || [])[0] || '', options: f.getOptions() };
    if (f instanceof PDFRadioGroup) return { name, type: 'radio', value: f.getSelected() || '', options: f.getOptions() };
    return null;
  }

  /* ----- Pagina's ----- */
  async function buildPages() {
    stage.innerHTML = ''; thumbs.innerHTML = ''; S.pages = [];
    const first = await S.pdf.getPage(1); const vp1 = first.getViewport({ scale: 1 });
    S.scale = Math.min(1.6, Math.max(0.3, (stage.clientWidth - (stage.clientWidth < 700 ? 24 : 64)) / vp1.width));
    const wrap = el('div', { class: 'ed-pages' });
    for (let i = 1; i <= S.pdf.numPages; i++) {
      const p = await S.pdf.getPage(i); const vp = p.getViewport({ scale: 1 });
      const pg = { i, p, vp, w: vp.width, h: vp.height, el: null, canvas: null, layer: null, textItems: null, rendered: 0 };
      pg.canvas = el('canvas', { class: 'ed-canvas' });
      pg.textLayer = el('div', { class: 'ed-text' });
      pg.layer = el('div', { class: 'ed-layer', 'data-page': i });
      pg.el = el('div', { class: 'ed-page', 'data-page': i }, pg.canvas, pg.textLayer, pg.layer);
      wrap.append(pg.el); S.pages.push(pg);
      attachPointer(pg);
      const th = el('button', { class: 'ed-th', type: 'button', 'data-page': i, 'aria-label': 'Ga naar pagina ' + i, onclick: () => pg.el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, el('canvas'), el('span', null, i));
      thumbs.append(th);
    }
    stage.append(wrap);
    layout();
    S.io && S.io.disconnect();
    S.io = new IntersectionObserver((ents) => ents.forEach((e) => { const pg = S.pages[+e.target.dataset.page - 1]; if (e.isIntersecting) renderPg(pg); }), { root: stage, rootMargin: '600px' });
    S.pages.forEach((pg) => S.io.observe(pg.el));
    const tio = new IntersectionObserver((ents) => ents.forEach(async (e) => { if (!e.isIntersecting) return; tio.unobserve(e.target); const pg = S.pages[+e.target.dataset.page - 1]; const c = e.target.querySelector('canvas'); const vp = pg.p.getViewport({ scale: 96 / pg.w }); c.width = vp.width; c.height = vp.height; await pg.p.render({ canvas: c, viewport: vp }).promise; }), { root: thumbs });
    thumbs.querySelectorAll('.ed-th').forEach((t) => tio.observe(t));
    stage.addEventListener('scroll', drawStatus, { passive: true });
  }
  function layout() {
    for (const pg of S.pages) { pg.el.style.width = pg.w * S.scale + 'px'; pg.el.style.height = pg.h * S.scale + 'px'; pg.rendered = 0; }
    drawObjects();
  }
  async function renderPg(pg) {
    if (pg.rendered === S.scale || pg.busy) return; pg.busy = true;
    const src = pg.view || pg.p; const dpr = Math.min(window.devicePixelRatio || 1, 2); const vp = src.getViewport({ scale: S.scale * dpr });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    try { await src.render({ canvas: c, viewport: vp }).promise; } catch (e) { pg.busy = false; return; }
    c.className = 'ed-canvas'; pg.canvas.replaceWith(c); pg.canvas = c; pg.dpr = dpr;
    pg.rendered = S.scale; pg.busy = false;
    if (!pg.textItems) await loadText(pg);
    drawTextLayer(pg);
  }
  async function loadText(pg) {
    const tc = await pg.p.getTextContent(); const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const tx = pdfjsLib.Util.transform(pg.vp.transform, it.transform);
      if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01 || tx[0] <= 0) continue; // alleen horizontale tekst
      const st = tc.styles[it.fontName] || {}; const fh = Math.hypot(tx[2], tx[3]);
      const asc = st.ascent || 0.8, desc = Math.abs(st.descent || -0.2);
      let fontId = '', fb = false, fi = false; try { if (pg.p.commonObjs.has(it.fontName)) { const fo = pg.p.commonObjs.get(it.fontName); fontId = (fo.loadedName || '') + ' ' + (fo.fallbackName || ''); fb = !!(fo.bold || fo.black); fi = !!fo.italic; } } catch {}
      const fam = /mono|courier/i.test(st.fontFamily + fontId) ? 'Courier' : /serif/i.test(st.fontFamily) && !/sans/i.test(st.fontFamily) || /times|georgia|garamond|cambria/i.test(fontId) ? 'Times' : 'Helvetica';
      items.push({ str: it.str, x: tx[4], base: tx[5], top: tx[5] - fh * asc, w: it.width * pg.vp.scale, h: fh * (asc + desc), size: fh, asc, fam, bold: fb || /bold|black|heavy|semibold/i.test(fontId), italic: fi || /italic|oblique/i.test(fontId) });
    }
    // echte lettertypenamen uit de PDF (vet, cursief, familie)
    try {
      if (!S.libDoc) S.libDoc = await loadPdf(S.file);
      const fi = fontsForItems(S.libDoc, S.libDoc.getPages()[pg.i - 1], items, pg.vp.transform);
      fi.forEach((f, k) => { if (f) { items[k].fam = f.fam; items[k].bold = items[k].bold || f.bold; items[k].italic = items[k].italic || f.italic; items[k].font = f.base; } });
    } catch (e) { console.warn('lettertypen', e); }
    pg.textItems = items;
  }
  function drawTextLayer(pg) {
    pg.textLayer.innerHTML = '';
    if (S.tool !== 'textedit' || !pg.textItems) return;
    for (const [k, it] of pg.textItems.entries()) {
      if (S.objs.some((o) => o.type === 'textedit' && o.page === pg.i && o.src === k)) continue;
      pg.textLayer.append(el('button', { type: 'button', class: 'ed-tspan', 'data-k': k, title: it.str, 'aria-label': 'Tekst bewerken: ' + it.str,
        style: { left: it.x * S.scale + 'px', top: it.top * S.scale + 'px', width: Math.max(4, it.w) * S.scale + 'px', height: it.h * S.scale + 'px' },
        onclick: (e) => { e.stopPropagation(); editText(pg, k); } }));
    }
  }
  function sample(pg, x, y, w, h) { // kleur van tekst (donkerst) en achtergrond (meest voorkomend aan de rand)
    const c = pg.canvas; if (!c || !pg.dpr) return { fg: '#000000', bg: '#ffffff' };
    const s = S.scale * pg.dpr; const g = c.getContext('2d', { willReadFrequently: true });
    const X = Math.max(0, Math.floor(x * s)), Y = Math.max(0, Math.floor(y * s)), W = Math.max(1, Math.min(c.width - X, Math.ceil(w * s))), H = Math.max(1, Math.min(c.height - Y, Math.ceil(h * s)));
    const d = g.getImageData(X, Y, W, H).data; let best = 999, fg = [0, 0, 0]; const cnt = new Map();
    for (let k = 0; k < d.length; k += 4) {
      const l = d[k] + d[k + 1] + d[k + 2]; if (l < best) { best = l; fg = [d[k], d[k + 1], d[k + 2]]; }
      const px = (k / 4) % W, py = Math.floor(k / 4 / W);
      if (px === 0 || py === 0 || px === W - 1 || py === H - 1) { const key = (d[k] >> 3) + ',' + (d[k + 1] >> 3) + ',' + (d[k + 2] >> 3); cnt.set(key, (cnt.get(key) || 0) + 1); }
    }
    let bgk = '31,31,31', m = 0; for (const [k2, v] of cnt) if (v > m) { m = v; bgk = k2; }
    let bg = bgk.split(',').map((v) => Math.min(255, (+v << 3) + 4));
    if (bg.every((v) => v >= 236)) bg = [255, 255, 255];
    return { fg: rgbHex(...fg), bg: rgbHex(...bg) };
  }
  function editText(pg, k) {
    const it = pg.textItems[k]; const col = sample(pg, it.x, it.top, it.w, it.h);
    const o = add({ type: 'textedit', page: pg.i, src: k, x: it.x, y: it.top, w: it.w, h: it.h, base: it.base - it.top, orig: it.str, text: it.str, size: +it.size.toFixed(2), fam: it.fam, bold: it.bold, italic: it.italic, color: col.fg, bg: col.bg, style0: { fam: it.fam, bold: it.bold, italic: it.italic, size: +it.size.toFixed(2), color: col.fg } });
    drawTextLayer(pg); select(o.id, true);
  }

  /* ----- Objecten ----- */
  function snapshot() { return JSON.stringify({ objs: S.objs, formVals: S.formVals }); }
  function commit() { S.hist.push(S._last || JSON.stringify({ objs: [], formVals: {} })); if (S.hist.length > 100) S.hist.shift(); S.fut = []; S._last = snapshot(); S.dirty = true; drawStatus(); schedulePreviews(); }
  // Na een tekstwijziging tonen we de echte uitkomst (originele lettertype, verschoven regel) op het canvas
  const pvTimers = new Map();
  function schedulePreviews() {
    for (const pg of S.pages) {
      const sig = JSON.stringify(S.objs.filter((o) => o.type === 'textedit' && o.page === pg.i).map((o) => [o.src, o.text, o.fam, o.bold, o.italic, o.size, o.color]));
      if (sig === (pg.pvSig || '[]')) continue; pg.pvSig = sig;
      clearTimeout(pvTimers.get(pg.i)); pvTimers.set(pg.i, setTimeout(() => preview(pg, sig), 250));
    }
  }
  async function preview(pg, sig) {
    try {
      if (sig === '[]') { pg.view = null; pg.overflow = []; pg.fontReport = new Map(); }
      else {
        let { bytes, removed, overflow, fontReport } = await buildPdf(new Set(), { only: pg.i, textOnly: true });
        const bad = await verifyRemoval(bytes, removed);
        if (bad.length) ({ bytes, removed, overflow, fontReport } = await buildPdf(new Set(bad), { only: pg.i, textOnly: true }));
        if (pg.pvSig !== sig) return; // inmiddels weer gewijzigd
        const doc = await bytesToPdfJs(bytes); pg.view = await doc.getPage(pg.i); pg.pvMode = removed.has(pg.i) ? 'engine' : 'cover'; pg.overflow = overflow; pg.fontReport = fontReport;
      }
      pg.rendered = 0; await renderPg(pg); drawObjects(); drawProps();
    } catch (e) { console.warn('voorbeeld', e); }
  }
  function restore(snap) { const s = JSON.parse(snap); S.objs = s.objs; S.formVals = s.formVals; S._last = snap; S.sel = null; drawObjects(); S.pages.forEach(drawTextLayer); drawProps(); drawStatus(); schedulePreviews(); }
  function undo() { if (!S.hist.length) return; S.fut.push(snapshot()); restore(S.hist.pop()); }
  function redo() { if (!S.fut.length) return; S.hist.push(snapshot()); restore(S.fut.pop()); }
  function add(o) { o.id = ++S.seq; S.objs.push(o); commit(); drawObjects(); return o; }
  function remove(oid) { const o = S.objs.find((x) => x.id === oid); S.objs = S.objs.filter((x) => x.id !== oid); if (S.sel === oid) S.sel = null; commit(); drawObjects(); if (o && o.type === 'textedit') drawTextLayer(S.pages[o.page - 1]); drawProps(); }
  function selObj() { return S.objs.find((o) => o.id === S.sel); }
  function select(oid, focus) { S.sel = oid; drawObjects(); drawProps(); if (matchMedia('(max-width:760px)').matches) sheet(!!oid && !focus); if (focus) { const go = () => { const n = stage.querySelector(`.ed-obj[data-id="${oid}"] .ed-edit`); if (n) { n.focus(); const r = document.createRange(); r.selectNodeContents(n); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }; go(); requestAnimationFrame(go); } }
  function update(o, patch, noCommit) { Object.assign(o, patch); if (!noCommit) commit(); drawObjects(); }

  function drawObjects() {
    for (const pg of S.pages) pg.layer.innerHTML = '';
    for (const o of S.objs) { const pg = S.pages[o.page - 1]; if (pg) pg.layer.append(objNode(o)); }
  }
  function objNode(o) {
    const s = S.scale; const sel = o.id === S.sel;
    const n = el('div', { class: 'ed-obj ed-' + o.type + (sel ? ' sel' : ''), 'data-id': o.id, style: { left: o.x * s + 'px', top: o.y * s + 'px', width: o.w * s + 'px', height: o.h * s + 'px' } });
    if (o.type === 'text' || o.type === 'textedit') {
      const t = el('div', { class: 'ed-edit', contenteditable: 'true', spellcheck: 'true', 'aria-label': 'Tekst',
        style: { fontFamily: FAMILIES[o.fam], fontSize: o.size * s + 'px', fontWeight: o.bold ? '700' : '400', fontStyle: o.italic ? 'italic' : 'normal', color: o.color, lineHeight: o.type === 'textedit' ? o.h * s + 'px' : '1.2', whiteSpace: o.type === 'textedit' ? 'pre' : 'pre-wrap' } });
      t.textContent = o.text;
      if (o.type === 'textedit') { n.style.background = o.bg; n.style.boxShadow = `0 0 0 ${Math.max(1, o.size * 0.12) * s}px ${o.bg}`; if (S.pages[o.page - 1] && S.pages[o.page - 1].view) n.classList.add('pv'); }
      t.addEventListener('focus', () => { if (S.sel !== o.id) { S.sel = o.id; n.classList.add('sel'); drawProps(); } });
      t.addEventListener('input', () => { o.text = t.innerText.replace(/\n$/, ''); S.dirty = true; if (o.type === 'textedit') { o.w = Math.max(o.w, t.scrollWidth / s); n.style.width = o.w * s + 'px'; } });
      t.addEventListener('blur', () => { const now = snapshot(); if (now !== S._last) commit(); });
      t.addEventListener('keydown', (e) => { if (e.key === 'Escape') { t.blur(); select(null); } if (o.type === 'textedit' && e.key === 'Enter') { e.preventDefault(); t.blur(); } });
      n.append(t);
    } else if (o.type === 'image') {
      n.append(el('img', { src: assetUrl(o.asset), alt: '', draggable: 'false', style: { opacity: o.opacity ?? 1 } }));
    } else if (o.type === 'ink') {
      const svg = `<svg width="100%" height="100%" viewBox="${o.x} ${o.y} ${o.w} ${o.h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${o.pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${o.color}" stroke-width="${o.width}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="stroke-width:${o.width * s}px"/></svg>`;
      n.innerHTML = svg;
    } else if (o.type === 'arrow') {
      const [x1, y1, x2, y2] = o.line.map((v) => v * s); const ox = o.x * s, oy = o.y * s;
      n.innerHTML = `<svg width="100%" height="100%" style="overflow:visible" aria-hidden="true"><line x1="${x1 - ox}" y1="${y1 - oy}" x2="${x2 - ox}" y2="${y2 - oy}" stroke="${o.color}" stroke-width="${o.width * s}" stroke-linecap="round"/>${arrowHead(x1 - ox, y1 - oy, x2 - ox, y2 - oy, o.width * s * 4, o.color, o.width * s)}</svg>`;
    } else if (o.type === 'comment') {
      n.append(icon('comment', Math.max(16, 20 * s), '#004974', 2));
      n.title = o.text || 'Opmerking';
    } else if (o.type === 'link') {
      n.append(el('span', { class: 'ed-linkurl' }, o.url || 'geen adres'));
    } else if (o.type === 'redact') {
      n.append(el('span', { class: 'sr' }, 'Redactievlak'));
    }
    if (['rect', 'ellipse'].includes(o.type)) { n.style.border = `${o.width * s}px solid ${o.color}`; n.style.background = o.fill || 'transparent'; if (o.type === 'ellipse') n.style.borderRadius = '50%'; }
    if (o.type === 'highlight') n.style.background = o.color;
    if (o.type === 'underline' || o.type === 'strike') n.style.setProperty('--lc', o.color);
    n.addEventListener('pointerdown', (e) => objPointer(e, o, n));
    if (sel && !['comment'].includes(o.type)) {
      n.append(el('span', { class: 'ed-handle', 'aria-hidden': 'true', 'data-h': '1' }));
    }
    if (sel) n.append(el('button', { type: 'button', class: 'ed-del', 'aria-label': 'Verwijderen', onclick: (e) => { e.stopPropagation(); remove(o.id); } }, icon('x', 14, '#fff', 2.5)));
    return n;
  }
  function arrowHead(x1, y1, x2, y2, len, color, w) {
    const a = Math.atan2(y2 - y1, x2 - x1), b = Math.PI / 7;
    const p1 = [x2 - len * Math.cos(a - b), y2 - len * Math.sin(a - b)], p2 = [x2 - len * Math.cos(a + b), y2 - len * Math.sin(a + b)];
    return `<polyline points="${p1.join(',')} ${x2},${y2} ${p2.join(',')}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  function assetUrl(aid) { const a = S.assets.get(aid); if (!a.url) a.url = URL.createObjectURL(new Blob([a.bytes], { type: a.kind === 'png' ? 'image/png' : 'image/jpeg' })); return a.url; }

  // Verslepen en schalen
  function objPointer(e, o, n) {
    if (e.target.closest('.ed-del')) return;
    const editing = e.target.classList.contains('ed-edit') && S.sel === o.id;
    if (editing) return;
    if (S.tool !== 'select' && S.tool !== 'textedit' && !['text', 'textedit'].includes(o.type)) { if (S.tool !== o.type) return; }
    e.stopPropagation();
    if (S.sel !== o.id) { select(o.id); }
    const handle = e.target.dataset && e.target.dataset.h;
    const sx = e.clientX, sy = e.clientY; const start = { x: o.x, y: o.y, w: o.w, h: o.h, pts: o.pts && o.pts.map((p) => [...p]), line: o.line && [...o.line] };
    let moved = false;
    const mv = (ev) => {
      const dx = (ev.clientX - sx) / S.scale, dy = (ev.clientY - sy) / S.scale; if (!moved && Math.hypot(dx, dy) < 2) return; moved = true;
      if (handle) {
        let w = Math.max(8, start.w + dx), h = Math.max(8, start.h + dy);
        if (o.type === 'image' && o.keep !== false) h = w * start.h / start.w;
        Object.assign(o, { w, h });
        if (o.type === 'textedit' || o.type === 'text') { o.size = +(o.type === 'text' ? o.size : start.h ? o.size : o.size).toFixed(2); }
      } else {
        o.x = start.x + dx; o.y = start.y + dy;
        if (o.pts) o.pts = start.pts.map(([px, py]) => [px + dx, py + dy]);
        if (o.line) o.line = [start.line[0] + dx, start.line[1] + dy, start.line[2] + dx, start.line[3] + dy];
      }
      const node = stage.querySelector(`.ed-obj[data-id="${o.id}"]`); if (node) { node.style.left = o.x * S.scale + 'px'; node.style.top = o.y * S.scale + 'px'; node.style.width = o.w * S.scale + 'px'; node.style.height = o.h * S.scale + 'px'; }
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) { commit(); drawObjects(); } else if (['text', 'textedit'].includes(o.type)) select(o.id, true); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }

  // Nieuwe objecten op een pagina
  function attachPointer(pg) {
    pg.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.ed-obj') || e.target.closest('.ed-tspan')) return;
      const r = pg.el.getBoundingClientRect(); const pt = (ev) => [(ev.clientX - r.left) / S.scale, (ev.clientY - r.top) / S.scale];
      const [x0, y0] = pt(e); const t = S.tool;
      if (t === 'select' || t === 'textedit') { select(null); return; }
      e.preventDefault(); // voorkomt dat de klik de focus uit het nieuwe element haalt
      if (t === 'text') { const o = add({ type: 'text', page: pg.i, x: x0, y: y0 - 8, w: 220, h: 24, text: '', size: 12, fam: 'Helvetica', bold: false, italic: false, color: '#000000' }); select(o.id, true); return; }
      if (t === 'date') { const o = add({ type: 'text', page: pg.i, x: x0, y: y0 - 8, w: 90, h: 18, text: today(), size: 11, fam: 'Helvetica', bold: false, italic: false, color: '#000000' }); select(o.id); return; }
      if (t === 'check') { add({ type: 'text', page: pg.i, x: x0 - 7, y: y0 - 9, w: 18, h: 18, text: '✓', size: 14, fam: 'Helvetica', bold: true, italic: false, color: '#000000', glyph: 'check' }); return; }
      if (t === 'comment') { const o = add({ type: 'comment', page: pg.i, x: x0 - 10, y: y0 - 10, w: 20, h: 20, text: '' }); select(o.id); setTimeout(() => { const ta = document.getElementById('p-comment'); ta && ta.focus(); }, 0); return; }
      if (t === 'ink') {
        e.preventDefault(); const pts = [[x0, y0]];
        const tmp = el('div', { class: 'ed-draft' }); const svgNs = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNs, 'svg'); svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); const pl = document.createElementNS(svgNs, 'polyline');
        pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', S.inkColor || '#004974'); pl.setAttribute('stroke-width', (S.inkWidth || 2) * S.scale); pl.setAttribute('stroke-linecap', 'round'); svg.append(pl); tmp.append(svg); pg.layer.append(tmp);
        const mv = (ev) => { pts.push(pt(ev)); pl.setAttribute('points', pts.map(([a, b]) => `${a * S.scale},${b * S.scale}`).join(' ')); };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); tmp.remove(); if (pts.length < 2) return;
          const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); const x = Math.min(...xs) - 2, y = Math.min(...ys) - 2;
          add({ type: 'ink', page: pg.i, x, y, w: Math.max(...xs) - x + 2, h: Math.max(...ys) - y + 2, pts, color: S.inkColor || '#004974', width: S.inkWidth || 2 }); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up); return;
      }
      if (DRAG_TOOLS.has(t)) {
        e.preventDefault(); const draft = el('div', { class: 'ed-draft box' }); pg.layer.append(draft); let x1 = x0, y1 = y0;
        const mv = (ev) => { [x1, y1] = pt(ev); Object.assign(draft.style, { left: Math.min(x0, x1) * S.scale + 'px', top: Math.min(y0, y1) * S.scale + 'px', width: Math.abs(x1 - x0) * S.scale + 'px', height: Math.abs(y1 - y0) * S.scale + 'px' }); };
        const up = () => {
          removeEventListener('pointermove', mv); removeEventListener('pointerup', up); draft.remove();
          let x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
          if (t !== 'arrow' && (w < 3 || h < 3)) { if (['underline', 'strike', 'highlight'].includes(t) && w >= 3) h = 12; else return; }
          if (t === 'arrow' && Math.hypot(w, h) < 5) return;
          const base = { page: pg.i, x, y, w: Math.max(w, 1), h: Math.max(h, 1) };
          let o;
          if (t === 'highlight') o = add({ ...base, type: t, color: '#FFE45C', opacity: 0.45 });
          else if (t === 'underline' || t === 'strike') o = add({ ...base, type: t, color: '#C8102E', width: 1.2 });
          else if (t === 'rect' || t === 'ellipse') o = add({ ...base, type: t, color: '#C8102E', width: 2, fill: '' });
          else if (t === 'arrow') o = add({ ...base, x: x - 6, y: y - 6, w: w + 12, h: h + 12, type: t, color: '#C8102E', width: 2, line: [x0, y0, x1, y1] });
          else if (t === 'whiteout') o = add({ ...base, type: t, color: '#FFFFFF' });
          else if (t === 'redact') o = add({ ...base, type: t });
          else if (t === 'link') { o = add({ ...base, type: t, url: 'https://' }); select(o.id); setTimeout(() => { const i = document.getElementById('p-url'); if (i) { i.focus(); i.select(); } }, 0); return; }
          if (o && ['rect', 'ellipse', 'arrow'].includes(t)) select(o.id);
        };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      }
    });
  }

  /* ----- Afbeelding en handtekening ----- */
  imgIn.addEventListener('change', async () => {
    const f = imgIn.files[0]; imgIn.value = ''; if (!f || !isImageFile(f)) return;
    let bytes = await readBytes(f); let kind = /png/i.test(f.type) ? 'png' : 'jpg';
    const bmp0 = await loadBitmap(f);
    // altijd via canvas: EXIF-draaiing van telefoonfoto's en formaten als HEIC/WebP worden zo correct omgezet
    if (!/png/i.test(f.type)) { const c = makeCanvas(bmpW(bmp0), bmpH(bmp0)); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp0, 0, 0); bytes = new Uint8Array(await (await canvasBlob(c, 'image/jpeg', 0.92)).arrayBuffer()); kind = 'jpg'; }
    placeImage(bytes, kind, bmpW(bmp0), bmpH(bmp0), 220); setTool('select');
  });
  function currentPage() { const r = stage.getBoundingClientRect(); let best = S.pages[0], d = 1e9; for (const pg of S.pages) { const b = pg.el.getBoundingClientRect(); const dd = Math.abs(b.top + Math.min(b.height, r.height) / 2 - (r.top + r.height / 2)); if (b.bottom > r.top && dd < d) { d = dd; best = pg; } } return best; }
  function placeImage(bytes, kind, iw, ih, width, extra = {}) {
    const pg = currentPage(); const aid = 'a' + (++S.seq); S.assets.set(aid, { bytes, kind });
    const w = Math.min(width, pg.w * 0.8), h = w * ih / iw;
    const o = add({ type: 'image', page: pg.i, x: (pg.w - w) / 2, y: Math.max(20, (pg.h - h) / 2), w, h, asset: aid, opacity: 1, ...extra }); select(o.id);
  }
  async function signatureDialog() {
    const c = el('canvas', { width: 560, height: 200, class: 'sigpad', 'aria-label': 'Tekenvlak voor handtekening' });
    const g = c.getContext('2d'); g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0b2a6b'; let drawn = false, down = false;
    c.addEventListener('pointerdown', (e) => { down = true; drawn = true; const r = c.getBoundingClientRect(); g.beginPath(); g.moveTo((e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height); c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (!down) return; const r = c.getBoundingClientRect(); g.lineTo((e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height); g.stroke(); });
    c.addEventListener('pointerup', () => { down = false; });
    const typed = el('input', { type: 'text', id: 'sig-text', placeholder: 'Of typ uw naam', autocomplete: 'name' });
    const colorIn = el('select', { id: 'sig-color', onchange: () => { g.strokeStyle = colorIn.value; } }, el('option', { value: '#0b2a6b' }, 'Blauw'), el('option', { value: '#000000' }, 'Zwart'));
    const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      el('div', { class: 'help' }, 'Teken met muis, pen of vinger in het vak, of typ uw naam.'), c,
      el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, el('button', { type: 'button', class: 'btn sm', onclick: () => { g.clearRect(0, 0, c.width, c.height); drawn = false; } }, 'Wissen'), el('label', { for: 'sig-color', class: 'flabel' }, 'Kleur'), colorIn),
      el('div', { class: 'field' }, el('label', { for: 'sig-text' }, 'Getypte handtekening'), typed));
    const ok = await modal({ title: 'Handtekening', body, ok: 'Plaatsen', onOk: () => drawn || typed.value.trim() ? true : (toast('Teken of typ eerst een handtekening.', 'error'), false) });
    if (!ok) { setTool('select'); return; }
    let src = c;
    if (!drawn) { src = document.createElement('canvas'); src.width = 900; src.height = 220; const x = src.getContext('2d'); x.fillStyle = colorIn.value; x.font = 'italic 110px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive'; x.textBaseline = 'middle'; x.fillText(typed.value.trim(), 20, 115); }
    const trimmed = trimCanvas(src); const blob = await new Promise((r) => trimmed.toBlob(r, 'image/png'));
    placeImage(new Uint8Array(await blob.arrayBuffer()), 'png', trimmed.width, trimmed.height, 170, { sig: true });
    setTool('select');
  }
  function trimCanvas(c) {
    const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    if (x1 <= x0) return c; const o = document.createElement('canvas'); o.width = x1 - x0 + 8; o.height = y1 - y0 + 8; o.getContext('2d').drawImage(c, x0 - 4, y0 - 4, o.width, o.height, 0, 0, o.width, o.height); return o;
  }

  /* ----- Eigenschappenpaneel ----- */
  function field(label, input) { if (!input.id) input.id = 'p-' + label.toLowerCase().replace(/\W+/g, '-'); return el('div', { class: 'field' }, el('label', { for: input.id }, label), input); }
  function drawProps() {
    props.innerHTML = ''; setTimeout(() => { const h = props.querySelector('h2'); const t = document.getElementById('sheet-title'); if (h && t) t.textContent = h.textContent; }, 0);
    const o = selObj();
    if (!S.pdf) { props.append(el('h2', null, 'Editor'), el('p', { class: 'help' }, 'Open een PDF om te beginnen. Alles wordt lokaal in uw browser verwerkt.')); return; }
    if (o) {
      const T = { text: 'Tekstvak', textedit: 'Tekst', image: o.sig ? 'Handtekening' : 'Afbeelding', link: 'Koppeling', highlight: 'Markering', underline: 'Onderstreping', strike: 'Doorhaling', comment: 'Opmerking', ink: 'Tekening', rect: 'Rechthoek', ellipse: 'Ellips', arrow: 'Pijl', whiteout: 'Witvlak', redact: 'Redactievlak' };
      props.append(el('h2', null, T[o.type] || 'Element'));
      if (o.type === 'text' || o.type === 'textedit') {
        const fam = el('select', { id: 'p-font', onchange: () => update(o, { fam: fam.value }) }, Object.keys(FAMILIES).map((f) => el('option', { value: f }, f))); fam.value = o.fam;
        const size = el('input', { type: 'number', id: 'p-size', min: 4, max: 200, step: 0.5, value: o.size, onchange: () => update(o, { size: +size.value || o.size }) });
        const col = el('input', { type: 'color', id: 'p-color', value: o.color, onchange: () => update(o, { color: col.value }) });
        props.append(field('Lettertype', fam), el('div', { class: 'row2' }, field('Grootte (pt)', size), field('Tekstkleur', col)),
          el('div', { style: { display: 'flex', gap: '8px' } },
            el('button', { type: 'button', class: 'btn icon', 'aria-label': 'Vet', 'aria-pressed': String(!!o.bold), style: { fontWeight: '700' }, onclick: () => update(o, { bold: !o.bold }) }, 'B'),
            el('button', { type: 'button', class: 'btn icon', 'aria-label': 'Cursief', 'aria-pressed': String(!!o.italic), style: { fontStyle: 'italic' }, onclick: () => update(o, { italic: !o.italic }) }, 'I')));
        if (o.type === 'textedit') {
          const bg = el('input', { type: 'color', id: 'p-bg', value: o.bg, onchange: () => update(o, { bg: bg.value }) });
          const pg = S.pages[o.page - 1]; const ov = (pg.overflow || []).find((x) => x.id === o.id);
          if (ov) props.append(el('div', { class: 'warn-box', role: 'alert' }, ov.lines ? `De alinea heeft ${ov.lines} regel(s) meer nodig, maar daaronder staat andere inhoud. Maak de tekst korter of de letter kleiner.` : ov.overlap ? `De nieuwe tekst overlapt ${ov.mm} mm met de tekst ernaast (volgende kolom). Maak de tekst korter of de letter kleiner.` : `Deze regel loopt ${ov.mm} mm voorbij de tekstmarge. Maak de tekst korter of de letter kleiner.`));
          props.append(fontPanel(o, pg));
          props.append(el('div', { class: 'note-box' }, el('strong', null, 'Origineel: '), o.orig),
            el('div', { class: 'help' }, pg.pvMode === 'cover' ? 'Deze pagina laat geen directe vervanging toe; de oude tekst wordt afgedekt en de nieuwe tekst geplaatst in een gelijkend lettertype.' : 'De tekst wordt in de PDF zelf vervangen, in het originele lettertype. De rest van de regel schuift mee.'));
          if (pg.pvMode === 'cover') props.append(field('Achtergrond (afdekking)', bg));
        }
      } else if (o.type === 'link') {
        const u = el('input', { type: 'text', id: 'p-url', value: o.url, onchange: () => update(o, { url: u.value.trim() }) });
        props.append(field('Webadres', u), el('div', { class: 'help' }, 'bv. https://www.voorbeeld.be'));
      } else if (o.type === 'comment') {
        const ta = el('textarea', { id: 'p-comment', rows: 5, onchange: () => update(o, { text: ta.value }) }); ta.value = o.text;
        props.append(field('Notitie', ta), el('div', { class: 'help' }, 'Wordt een echte PDF-opmerking die in Acrobat en andere lezers zichtbaar is.'));
      } else if (['highlight', 'underline', 'strike', 'rect', 'ellipse', 'arrow', 'ink'].includes(o.type)) {
        const col = el('input', { type: 'color', id: 'p-color', value: o.color, onchange: () => update(o, { color: col.value }) });
        props.append(field('Kleur', col));
        if (o.width != null) { const w = el('input', { type: 'number', id: 'p-width', min: 0.5, max: 20, step: 0.5, value: o.width, onchange: () => update(o, { width: +w.value || 1 }) }); props.append(field('Lijndikte (pt)', w)); }
        if (o.type === 'rect' || o.type === 'ellipse') { const fill = el('select', { id: 'p-fill', onchange: () => update(o, { fill: fill.value }) }, el('option', { value: '' }, 'Geen vulling'), el('option', { value: '#FFFFFF' }, 'Wit'), el('option', { value: '#AFDCDF' }, 'Lichtblauw'), el('option', { value: '#FFE45C' }, 'Geel')); fill.value = o.fill || ''; props.append(field('Vulling', fill)); }
      } else if (o.type === 'image') {
        const op = el('input', { type: 'range', id: 'p-op', min: 10, max: 100, value: Math.round((o.opacity ?? 1) * 100), onchange: () => update(o, { opacity: +op.value / 100 }) });
        props.append(field('Dekking', op), el('div', { class: 'help' }, 'Sleep om te verplaatsen; sleep het hoekje rechtsonder om te schalen.'));
      } else if (o.type === 'redact') {
        props.append(el('div', { class: 'note-box' }, 'Bij opslaan wordt deze pagina omgezet naar een afbeelding met een zwart vlak. Zo is de onderliggende tekst echt weg en niet meer te kopiëren of te doorzoeken.'));
      } else if (o.type === 'whiteout') props.append(el('div', { class: 'help' }, 'Dekt de inhoud visueel af. De inhoud blijft wel in het bestand; gebruik Redigeren om ze echt te verwijderen.'));
      props.append(el('button', { type: 'button', class: 'btn danger', id: 'p-delete', onclick: () => remove(o.id) }, icon('trash', 18, '#A3262A'), 'Verwijderen'));
      return;
    }
    props.append(el('h2', null, (TABS.flatMap((t) => t.tools).find((t) => t[0] === S.tool) || [, 'Selecteren'])[1]), el('p', { class: 'help' }, HELP[S.tool] || ''));
    if (S.tool === 'ink') {
      const col = el('input', { type: 'color', id: 'p-inkcolor', value: S.inkColor || '#004974', onchange: () => { S.inkColor = col.value; } });
      const w = el('input', { type: 'number', id: 'p-inkwidth', min: 0.5, max: 20, step: 0.5, value: S.inkWidth || 2, onchange: () => { S.inkWidth = +w.value || 2; } });
      props.append(el('div', { class: 'row2' }, field('Kleur', col), field('Lijndikte', w)));
    }
    if (S.tool === 'image') props.append(el('button', { type: 'button', class: 'btn', onclick: () => imgIn.click() }, 'Afbeelding kiezen'));
    if (S.tool === 'sign') props.append(el('button', { type: 'button', class: 'btn', onclick: () => signatureDialog() }, 'Handtekening maken'));
    if (S.tab === 'edit' || S.tool === 'textedit') props.append(searchReplacePanel());
    if (S.tab === 'forms') props.append(formPanel());
    const reds = S.objs.filter((x) => x.type === 'redact').length;
    if (S.tab === 'protect' && reds) props.append(el('div', { class: 'note-box' }, `${reds} redactievlak(ken). Bij opslaan worden de betrokken pagina's omgezet naar een afbeelding zodat de inhoud definitief weg is.`));
  }
  // Welk lettertype wordt gebruikt, en een origineel lettertype toevoegen
  function fontPanel(o, pg) {
    const it = pg.textItems && pg.textItems[o.src]; const pdfName = (it && it.font) || 'onbekend';
    const rep = (pg.fontReport && pg.fontReport.get(o.id)) || [];
    const Q = { origineel: 'identiek (origineel)', identiek: 'identiek', metrisch: 'metrisch gelijk', gelijkend: 'gelijkend' };
    const box = el('div', { class: 'ed-section', id: 'font-panel' }, el('h3', null, 'Lettertype'), el('div', { class: 'help' }, 'In de PDF: ', el('strong', null, pdfName)));
    if (rep.length) box.append(el('ul', { class: 'font-rep' }, rep.map((r) => el('li', { class: 'q-' + r.quality }, el('span', null, r.label), el('span', { class: 'qb' }, Q[r.quality] || r.quality), el('span', { class: 'n' }, r.n + ' teken' + (r.n === 1 ? '' : 's'))))));
    else if (pg.pvMode !== 'cover') box.append(el('div', { class: 'help' }, 'Wordt bepaald na de wijziging…'));
    const notExact = rep.some((r) => r.quality === 'metrisch' || r.quality === 'gelijkend');
    if (notExact) {
      box.append(el('div', { class: 'warn-box' }, `Niet alle tekens zitten in de PDF. Voor een 100% identiek resultaat voegt u het lettertype "${pdfName.replace(/[-,].*$/, '')}" toe (bv. uit C:\\Windows\\Fonts).`));
      const inp = el('input', { type: 'file', accept: '.ttf,.otf,font/ttf,font/otf', multiple: true, class: 'sr', id: 'font-up', onchange: async () => {
        const fk = await ensureFontkit(); let n = 0; for (const f of inp.files) n += addOwnFont(fk, new Uint8Array(await f.arrayBuffer())).length; inp.value = '';
        toast(n ? `${n} lettertype(n) toegevoegd.` : 'Geen bruikbaar lettertype gevonden (gebruik .ttf of .otf).', n ? 'info' : 'error'); if (n) refreshFonts();
      } });
      box.append(inp, el('button', { type: 'button', class: 'btn', id: 'font-up-btn', onclick: () => inp.click() }, 'Lettertypebestand toevoegen'));
      if (localFontsSupported()) box.append(el('button', { type: 'button', class: 'btn', id: 'font-local-btn', onclick: async () => {
        try { const fk = await ensureFontkit(); const names = [...new Set(S.pages.flatMap((p) => (p.textItems || []).map((x) => x.font).filter(Boolean)))]; const n = await findLocalFonts(fk, names); toast(n ? `${n} lettertype(n) van deze computer gebruikt.` : 'Het lettertype is niet op deze computer gevonden.'); if (n) refreshFonts(); }
        catch (err) { toast('Lettertypen van deze computer zijn hier niet toegankelijk. Voeg het bestand toe met de knop hierboven.', 'error'); }
      } }, 'Zoek op deze computer'));
    }
    const mine = ownFonts(); if (mine.length) box.append(el('div', { class: 'help' }, `Eigen lettertypen beschikbaar: ${mine.length}`));
    return box;
  }
  function refreshFonts() { for (const pg of S.pages) pg.pvSig = null; schedulePreviews(); }
  function searchReplacePanel() {
    const q = el('input', { type: 'text', id: 'sr-find', placeholder: 'Zoek' }), r = el('input', { type: 'text', id: 'sr-repl', placeholder: 'Vervang door' });
    const out = el('div', { class: 'help', id: 'sr-out' });
    const go = async () => {
      const term = q.value; if (!term) return; let n = 0;
      for (const pg of S.pages) {
        if (!pg.textItems) await loadText(pg);
        pg.textItems.forEach((it, k) => {
          if (!it.str.includes(term) || S.objs.some((o) => o.type === 'textedit' && o.page === pg.i && o.src === k)) return;
          const col = pg.dpr ? sample(pg, it.x, it.top, it.w, it.h) : { fg: '#000000', bg: '#ffffff' };
          S.objs.push({ id: ++S.seq, type: 'textedit', page: pg.i, src: k, x: it.x, y: it.top, w: it.w, h: it.h, base: it.base - it.top, orig: it.str, text: it.str.split(term).join(r.value), size: +it.size.toFixed(2), fam: it.fam, bold: it.bold, italic: it.italic, color: col.fg, bg: col.bg, style0: { fam: it.fam, bold: it.bold, italic: it.italic, size: +it.size.toFixed(2), color: col.fg } });
          n++;
        });
      }
      if (n) { commit(); drawObjects(); S.pages.forEach(drawTextLayer); }
      out.textContent = n ? `${n} tekstfragment(en) vervangen.` : 'Niet gevonden (of al bewerkt).';
    };
    return el('div', { class: 'ed-section' }, el('h3', null, 'Zoeken en vervangen'), field('Zoek', q), field('Vervang door', r),
      el('button', { type: 'button', class: 'btn pri', id: 'sr-go', onclick: go }, 'Alles vervangen'), out);
  }
  function formPanel() {
    const box = el('div', { class: 'ed-section' }, el('h3', null, 'Formuliervelden'));
    if (!S.fields.length) { box.append(el('p', { class: 'help' }, 'Deze PDF heeft geen invulbare velden. Gebruik Tekstvak, Datum of Vinkje om tekst op de pagina te zetten.')); return box; }
    S.fields.forEach((f, k) => {
      const v = f.name in S.formVals ? S.formVals[f.name] : f.value; const idf = 'ff-' + k; let inp;
      const set = (val) => { S.formVals[f.name] = val; commit(); };
      if (f.type === 'check') { inp = el('input', { type: 'checkbox', id: idf, onchange: () => set(inp.checked) }); inp.checked = !!v; box.append(el('label', { class: 'check' }, inp, f.name)); return; }
      if (f.type === 'select' || f.type === 'radio') inp = el('select', { id: idf, onchange: () => set(inp.value) }, el('option', { value: '' }, '—'), f.options.map((x) => el('option', { value: x }, x)));
      else if (f.multi) inp = el('textarea', { id: idf, rows: 3, onchange: () => set(inp.value) });
      else inp = el('input', { type: 'text', id: idf, onchange: () => set(inp.value) });
      inp.value = v ?? '';
      box.append(el('div', { class: 'field' }, el('label', { for: idf }, f.name), inp));
    });
    const fl = el('input', { type: 'checkbox', id: 'ff-flatten', onchange: () => { S.flattenForm = fl.checked; } }); fl.checked = S.flattenForm;
    box.append(el('label', { class: 'check' }, fl, 'Formulier platmaken bij opslaan'));
    return box;
  }
  function drawStatus() {
    const pg = S.pdf ? currentPage() : null; const z = document.getElementById('zoom-lbl'); if (z) z.textContent = Math.round(S.scale * 100) + '%';
    status.replaceChildren(el('span', null, 'Gereedschap: ' + ((TABS.flatMap((t) => t.tools).find((t) => t[0] === S.tool) || [, ''])[1])),
      el('span', null, S.pdf ? `Pagina ${pg ? pg.i : 1} / ${S.pdf.numPages} · ${S.objs.length} wijziging(en)${S.dirty ? ' · niet opgeslagen' : ''}` : 'Geen bestand'),
      el('span', null, 'Lokaal verwerkt — niets verlaat uw toestel'));
    undoBtn.disabled = !S.hist.length; redoBtn.disabled = !S.fut.length; saveBtn.disabled = !S.pdf;
    thumbs.querySelectorAll('.ed-th').forEach((t) => t.classList.toggle('cur', pg && +t.dataset.page === pg.i));
  }
  function zoom(z) { if (!S.pdf) return; const pg = currentPage(); S.scale = Math.min(4, Math.max(0.3, z)); layout(); S.pages.forEach((p) => { p.rendered = 0; }); S.pages.forEach((p) => { const b = p.el.getBoundingClientRect(); const r = stage.getBoundingClientRect(); if (b.bottom > r.top - 600 && b.top < r.bottom + 600) renderPg(p); }); pg.el.scrollIntoView({ block: 'start' }); drawStatus(); }

  /* ----- Toetsenbord ----- */
  const onKey = (e) => {
    if (!document.body.contains(stage)) { removeEventListener('keydown', onKey); return; }
    const inField = e.target.closest('input,textarea,select,[contenteditable]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !inField) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !inField) { e.preventDefault(); redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel && !inField) { e.preventDefault(); remove(S.sel); }
    else if (e.key === 'Escape' && !inField) { select(null); if (S.tool !== 'select') setTool('select'); }
  };
  addEventListener('keydown', onKey);

  /* ----- Opslaan ----- */
  async function save() {
    if (!S.pdf) return;
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    saveBtn.disabled = true; const lbl = saveBtn.innerHTML; saveBtn.replaceChildren(el('span', { class: 'spin' }), 'Opslaan…');
    try {
      let { bytes, removed, overflow } = await buildPdf();
      const bad = await verifyRemoval(bytes, removed);
      if (bad.length) { ({ bytes } = await buildPdf(new Set(bad))); toast(`Op pagina ${bad.join(', ')} kon de tekst niet in het originele lettertype vervangen worden; daar is ze afgedekt en opnieuw geplaatst.`); }
      S.lastRemoved = [...removed].filter((p) => !bad.includes(p));
      if (overflow.length) toast(`Let op: ${overflow.length} gewijzigde regel(s) passen niet: ze lopen voorbij de marge of overlappen met tekst ernaast (max. ${Math.max(...overflow.map((x) => x.mm))} mm).`);
      const reds = S.objs.filter((o) => o.type === 'redact');
      if (reds.length) bytes = await applyRedactions(bytes, reds);
      const name = baseName(S.file.name) + '_bewerkt.pdf';
      window.__lastResult = { title: 'Opgeslagen', outputs: [{ name, data: bytes }] };
      await saveFile(name, bytes); S.dirty = false; toast(`Opgeslagen als ${name}`);
    } catch (e) { console.error(e); toast('Opslaan mislukt: ' + e.message, 'error'); }
    finally { saveBtn.innerHTML = lbl; drawStatus(); }
  }
  async function buildPdf(skip = new Set(), { only = null, textOnly = false } = {}) {
    const doc = await loadPdf(S.file); const pages = doc.getPages(); const fonts = {}; const ctx = doc.context; const docFonts = new Map();
    // tekst vervangen in de paginacode zelf (origineel lettertype, rest van de regel schuift mee)
    const removed = new Set(); const overflow = []; const fontReport = new Map();
    const editPages = [...new Set(S.objs.filter((o) => o.type === 'textedit').map((o) => o.page))].filter((pn) => only == null || pn === only);
    for (const pn of editPages) {
      if (skip.has(pn)) continue; const pg = S.pages[pn - 1]; if (!pg.textItems) await loadText(pg);
      const objs = S.objs.filter((o) => o.type === 'textedit' && o.page === pn && pg.textItems[o.src]);
      const edits = objs.map((o) => ({ item: pg.textItems[o.src], text: o.text, style: { fam: o.fam, bold: o.bold, italic: o.italic, size: o.size, color: o.color }, style0: o.style0 || { fam: o.fam, bold: o.bold, italic: o.italic, size: o.size, color: o.color } }));
      try {
        const r = await rewritePage(doc, pages[pn - 1], edits, pg.vp.transform, docFonts);
        if (r.ok) { removed.add(pn); r.reports.forEach((rp, k) => { if (objs[k]) fontReport.set(objs[k].id, rp); }); r.overflow.filter((x) => !x.info && objs[x.index]).forEach((x) => overflow.push({ id: objs[x.index].id, page: pn, mm: x.mm, overlap: !!x.overlap, lines: x.lines || 0 })); }
        else console.info('tekst-engine pagina ' + pn + ': ' + r.reason);
      } catch (e) { console.warn('tekst-engine', e); }
    }
    const font = async (k) => fonts[k] || (fonts[k] = await doc.embedFont(StandardFonts[k]));
    // formulier
    if (S.fields.length && !textOnly) {
      const form = doc.getForm();
      for (const [nm, v] of Object.entries(S.formVals)) {
        try { const f = form.getField(nm);
          if (f instanceof PDFTextField) f.setText(String(v)); else if (f instanceof PDFCheckBox) v ? f.check() : f.uncheck();
          else if (f instanceof PDFDropdown || f instanceof PDFOptionList) { if (v) f.select(v); else f.clear(); } else if (f instanceof PDFRadioGroup) { if (v) f.select(v); else f.clear(); }
        } catch (e) { console.warn('veld', nm, e); }
      }
      if (S.flattenForm) form.flatten(); else if (Object.keys(S.formVals).length) form.updateFieldAppearances(await font('Helvetica'));
    }
    const images = new Map();
    for (const o of S.objs) {
      if (o.type === 'redact') continue;
      if (only != null && o.page !== only) continue;
      if (textOnly && o.type !== 'textedit') continue;
      if (o.type === 'textedit' && removed.has(o.page)) continue; // al in de paginacode geplaatst
      const pg = S.pages[o.page - 1]; const page = pages[o.page - 1]; const vp = pg.vp; const r = ((page.getRotation().angle % 360) + 360) % 360;
      const P = (x, y) => { const [px, py] = vp.convertToPdfPoint(x, y); return { x: px, y: py }; };
      const rot = degrees(r);
      const bl = P(o.x, o.y + o.h);
      if (o.type === 'textedit' || o.type === 'text') {
        if (o.type === 'textedit') { const pad = Math.max(1, o.size * 0.12); const a = P(o.x - pad, o.y + o.h + pad); page.drawRectangle({ x: a.x, y: a.y, width: o.w + 2 * pad, height: o.h + 2 * pad, color: hexToRgb(o.bg), rotate: rot }); }
        if (!o.text) continue;
        if (o.glyph === 'check') { const a = P(o.x + o.w * 0.15, o.y + o.h * 0.55), b = P(o.x + o.w * 0.4, o.y + o.h * 0.85), c = P(o.x + o.w * 0.9, o.y + o.h * 0.15); page.drawLine({ start: a, end: b, thickness: 2, color: hexToRgb(o.color) }); page.drawLine({ start: b, end: c, thickness: 2, color: hexToRgb(o.color) }); continue; }
        let f, txt;
        if (o.type === 'textedit') { f = await embedFallbackFont(doc, o.fam, o.bold, o.italic, docFonts, (S.pages[o.page - 1].textItems[o.src] || {}).font); txt = o.text; }
        else { f = await font(stdFont(o.fam, o.bold, o.italic)); txt = safeText(f, o.text); }
        const baseOff = o.type === 'textedit' ? o.base : o.size * 0.93;
        const s = P(o.x, o.y + baseOff);
        page.drawText(txt, { x: s.x, y: s.y, size: o.size, font: f, color: hexToRgb(o.color), rotate: rot, lineHeight: o.size * 1.2, maxWidth: o.type === 'text' ? o.w + 1 : undefined });
      } else if (o.type === 'image') {
        let img = images.get(o.asset); const a = S.assets.get(o.asset);
        if (!img) { img = a.kind === 'png' ? await doc.embedPng(a.bytes) : await doc.embedJpg(a.bytes); images.set(o.asset, img); }
        page.drawImage(img, { x: bl.x, y: bl.y, width: o.w, height: o.h, rotate: rot, opacity: o.opacity ?? 1 });
      } else if (o.type === 'whiteout') page.drawRectangle({ x: bl.x, y: bl.y, width: o.w, height: o.h, color: PDFLib.rgb(1, 1, 1), rotate: rot });
      else if (o.type === 'highlight') page.drawRectangle({ x: bl.x, y: bl.y, width: o.w, height: o.h, color: hexToRgb(o.color), opacity: o.opacity ?? 0.45, blendMode: BlendMode.Multiply, rotate: rot });
      else if (o.type === 'underline' || o.type === 'strike') { const yy = o.type === 'underline' ? o.y + o.h - 1 : o.y + o.h / 2; page.drawLine({ start: P(o.x, yy), end: P(o.x + o.w, yy), thickness: o.width, color: hexToRgb(o.color) }); }
      else if (o.type === 'rect') page.drawRectangle({ x: bl.x, y: bl.y, width: o.w, height: o.h, borderColor: hexToRgb(o.color), borderWidth: o.width, color: o.fill ? hexToRgb(o.fill) : undefined, rotate: rot });
      else if (o.type === 'ellipse') { const c = P(o.x + o.w / 2, o.y + o.h / 2); page.drawEllipse({ x: c.x, y: c.y, xScale: o.w / 2, yScale: o.h / 2, borderColor: hexToRgb(o.color), borderWidth: o.width, color: o.fill ? hexToRgb(o.fill) : undefined, rotate: rot }); }
      else if (o.type === 'ink') { for (let k = 1; k < o.pts.length; k++) page.drawLine({ start: P(...o.pts[k - 1]), end: P(...o.pts[k]), thickness: o.width, color: hexToRgb(o.color), lineCap: PDFLib.LineCapStyle.Round }); }
      else if (o.type === 'arrow') {
        const [x1, y1, x2, y2] = o.line; const col = hexToRgb(o.color); const len = o.width * 4 + 6, a = Math.atan2(y2 - y1, x2 - x1), b = Math.PI / 7;
        page.drawLine({ start: P(x1, y1), end: P(x2, y2), thickness: o.width, color: col, lineCap: PDFLib.LineCapStyle.Round });
        for (const s of [-1, 1]) page.drawLine({ start: P(x2, y2), end: P(x2 - len * Math.cos(a + s * b), y2 - len * Math.sin(a + s * b)), thickness: o.width, color: col, lineCap: PDFLib.LineCapStyle.Round });
      } else if (o.type === 'link' || o.type === 'comment') {
        const a = P(o.x, o.y), b = P(o.x + o.w, o.y + o.h); const rect = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
        let annot;
        if (o.type === 'link') { if (!o.url || o.url === 'https://') continue; annot = ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0], F: 4, A: { Type: 'Action', S: 'URI', URI: PDFString.of(o.url) } }); }
        else annot = ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: rect, Contents: PDFHexString.fromText(o.text || ''), Name: 'Comment', C: [1, 0.85, 0.2], T: PDFHexString.fromText('PDF Studio'), F: 4, Open: false });
        page.node.addAnnot(ctx.register(annot));
      }
    }
    return { bytes: await doc.save({ useObjectStreams: true }), removed, overflow, fontReport };
  }
  // Controle: staat alle niet-bewerkte tekst er nog en is de oude tekst weg?
  async function verifyRemoval(bytes, pagesSet) {
    const bad = []; if (!pagesSet.size) return bad; const pdf = await bytesToPdfJs(bytes);
    const norm = (x) => x.replace(/\s+/g, '');
    for (const pn of pagesSet) {
      const tc = await (await pdf.getPage(pn)).getTextContent(); const now = norm(tc.items.map((i) => i.str || '').join(''));
      const pg = S.pages[pn - 1]; const edits = S.objs.filter((o) => o.type === 'textedit' && o.page === pn); const srcs = new Set(edits.map((o) => o.src));
      const keptOk = pg.textItems.every((it, k) => srcs.has(k) || now.includes(norm(it.str)));
      const count = (hay, t) => { let n = 0, i = 0; while ((i = hay.indexOf(t, i)) >= 0) { n++; i += t.length; } return n; };
      const allowedText = pg.textItems.filter((it, k) => !srcs.has(k)).map((it) => norm(it.str)).concat(edits.map((o) => norm(o.text))).join('\u0000');
      const goneOk = edits.every((o) => { const t = norm(o.orig); return !t || count(now, t) <= count(allowedText, t); });
      if (!keptOk || !goneOk) bad.push(pn);
    }
    return bad;
  }
  async function applyRedactions(bytes, reds) {
    const doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false }); const pdf = await bytesToPdfJs(bytes);
    const byPage = new Map(); reds.forEach((o) => { if (!byPage.has(o.page)) byPage.set(o.page, []); byPage.get(o.page).push(o); });
    for (const [pn, list] of byPage) {
      const p = await pdf.getPage(pn); const dpi = 200; const vp = p.getViewport({ scale: dpi / 72 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await p.render({ canvas: c, viewport: vp }).promise;
      const g = c.getContext('2d'); g.fillStyle = '#000'; for (const o of list) g.fillRect(o.x * dpi / 72, o.y * dpi / 72, o.w * dpi / 72, o.h * dpi / 72);
      const jpg = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer());
      const img = await doc.embedJpg(jpg); const W = vp.width * 72 / dpi, H = vp.height * 72 / dpi;
      const np = doc.insertPage(pn - 1, [W, H]); np.drawImage(img, { x: 0, y: 0, width: W, height: H });
      doc.removePage(pn); c.width = c.height = 0;
    }
    return doc.save({ useObjectStreams: true });
  }

  ensureFontkit().then((fk) => loadOwnFonts(fk)).catch(() => {});
  window.__editorOpen = openFile; // voor tests
  drawRibbon(); drawProps(); drawStatus(); emptyStage();
}

const def = (id) => ({ page: (app, o) => page(app, { ...o, id }) });
export const EDIT = Object.fromEntries(Object.keys(MODE_FROM_HASH).map((k) => [k, def(k)]));
