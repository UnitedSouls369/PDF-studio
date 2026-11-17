// ABN PDF Studio — editor (tekst bewerken, annoteren, tekenen, formulieren, handtekening, redigeren)
import { tr } from './i18n.js';
import { rewritePage, fontsForItems, embedFallbackFont, ensureFontkit, setSubset } from './textengine.js';
import { addOwnFont, loadOwnFonts, ownFonts, localFontsSupported, findLocalFonts } from './fontlib.js';
import { el, icon, toast, modal, readBytes, isPdfFile, isImageFile, probePdf, openPdfJs, loadPdf, saveFile, baseName, PDFLib, pdfjsLib, safeText, hexToRgb, bytesToPdfJs } from './core.js';

const { PDFName, PDFHexString, PDFString, StandardFonts, degrees, BlendMode, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList } = PDFLib;

/* ---------- Gereedschappen ---------- */
const TABS = [
  { id: 'edit', label: 'Bewerken', tools: [['select', 'Selecteren', 'cursor'], ['textedit', 'Tekst bewerken', 'text'], ['text', 'Tekstvak', 'textadd'], ['image', 'Afbeelding', 'image'], ['link', 'Koppeling', 'link'], ['whiteout', 'Witmaken', 'whiteout']] },
  { id: 'annot', label: 'Annoteren', tools: [['select', 'Selecteren', 'cursor'], ['highlight', 'Markeren', 'highlight'], ['underline', 'Onderstrepen', 'underline'], ['strike', 'Doorhalen', 'strike'], ['comment', 'Opmerking', 'comment'], ['ink', 'Tekenen', 'draw'], ['rect', 'Rechthoek', 'shape'], ['ellipse', 'Ellips', 'shape'], ['stamp', 'Stempel', 'stamp'], ['arrow', 'Pijl', 'convert']] },
  { id: 'forms', label: 'Formulieren & handtekening', tools: [['select', 'Selecteren', 'cursor'], ['sign', 'Handtekening', 'sign'], ['date', 'Datum', 'textadd'], ['check', 'Vinkje', 'check']] },
  { id: 'protect', label: 'Redigeren', tools: [['select', 'Selecteren', 'cursor'], ['redact', 'Redigeren', 'redact']] },
  { id: 'measure', label: 'Meten', tools: [['select', 'Selecteren', 'cursor'], ['mdist', 'Afstand', 'dist'], ['mperim', 'Omtrek', 'perim'], ['marea', 'Oppervlakte', 'area'], ['mscale', 'Schaal kalibreren', 'scale']] },
  { id: 'formdesign', label: 'Formulier ontwerpen', tools: [['select', 'Selecteren', 'cursor'], ['ftext', 'Tekstveld', 'field'], ['fmulti', 'Tekstvak', 'textadd'], ['fcheck', 'Selectievakje', 'check'], ['fradio', 'Keuzerondje', 'radio'], ['fdrop', 'Keuzelijst', 'drop'], ['fdate', 'Datumveld', 'textadd'], ['fsig', 'Handtekeningveld', 'sigfield']] }
];
const FIELD_TOOLS = { ftext: [160, 22], fmulti: [240, 64], fcheck: [14, 14], fradio: [14, 14], fdrop: [150, 22], fdate: [100, 22], fsig: [180, 48] };
const FIELD_NAMES = { ftext: 'Tekstveld', fmulti: 'Tekstvak', fcheck: 'Selectievakje', fradio: 'Keuzerondje', fdrop: 'Keuzelijst', fdate: 'Datum', fsig: 'Handtekening' };
const STAMPS = [['approved', 'GOEDGEKEURD', '#1E7B3A'], ['rejected', 'AFGEKEURD', '#B3261E'], ['draft', 'CONCEPT', '#1F5FAF'], ['forexec', 'VOOR UITVOERING', '#1E7B3A'], ['asbuilt', 'AS-BUILT', '#004974'], ['seen', 'GEZIEN', '#004974'], ['info', 'TER INFO', '#1F5FAF'], ['conf', 'VERTROUWELIJK', '#B3261E'], ['void', 'VERVALLEN', '#B3261E'], ['custom', '', '#004974']];
const SCALES = [['1', '1:1 (papier)'], ['5', '1:5'], ['10', '1:10'], ['20', '1:20'], ['25', '1:25'], ['50', '1:50'], ['100', '1:100'], ['200', '1:200'], ['500', '1:500'], ['1000', '1:1000']];
const UNITS = { mm: 1, cm: 10, m: 1000 };
const MM_PER_PT = 25.4 / 72;
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const DRAG_TOOLS = new Set(['ftext', 'fmulti', 'fcheck', 'fradio', 'fdrop', 'fdate', 'fsig', 'link', 'whiteout', 'highlight', 'underline', 'strike', 'rect', 'ellipse', 'arrow', 'redact']);
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
  redact: 'Sleep zwarte vlakken over gevoelige inhoud. Bij opslaan wordt de inhoud eronder definitief verwijderd.',
  stamp: 'Kies een stempel en klik op de pagina om hem te plaatsen.',
  mdist: 'Sleep van het ene punt naar het andere. Houd Shift ingedrukt voor een horizontale, verticale of schuine lijn van 45°.',
  mperim: 'Klik de hoekpunten aan. Dubbelklik, klik op het eerste punt of druk Enter om af te sluiten; Esc annuleert.',
  marea: 'Klik de hoekpunten van de oppervlakte aan. Dubbelklik, klik op het eerste punt of druk Enter om af te sluiten; Esc annuleert.',
  mscale: 'Sleep over een maat waarvan u de echte lengte kent (bv. een maatlijn op het plan) en vul die lengte in.',
  ftext: 'Klik of sleep om een tekstveld te plaatsen.', fmulti: 'Sleep om een tekstvak met meerdere regels te plaatsen.', fcheck: 'Klik om een selectievakje te plaatsen.',
  fradio: 'Klik om een keuzerondje te plaatsen. Rondjes met dezelfde groepsnaam sluiten elkaar uit.', fdrop: 'Klik of sleep om een keuzelijst te plaatsen en vul de keuzes in.',
  fdate: 'Klik of sleep om een datumveld (dd-mm-jjjj) te plaatsen.', fsig: 'Sleep om een veld te plaatsen waarin iemand later digitaal kan ondertekenen.'
};
const MODE_FROM_HASH = { 'edit-text': ['edit', 'textedit'], 'edit-image': ['edit', 'image'], 'edit-link': ['edit', 'link'], 'edit-annotate': ['annot', 'highlight'], 'edit-draw': ['annot', 'ink'], 'fill-form': ['forms', 'select'], 'edit-sign': ['forms', 'sign'], 'edit-redact': ['protect', 'redact'], 'edit-measure': ['measure', 'mdist'], 'edit-stamp': ['annot', 'stamp'], 'form-design': ['formdesign', 'ftext'] };
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
  document.title = 'Editor – ABN PDF Studio';
  const [tab0, tool0] = MODE_FROM_HASH[id] || ['edit', 'textedit'];
  const S = { mscale: { ratio: +lsGet('pdfstudio-mscale', 1), unit: lsGet('pdfstudio-munit', 'm'), cal: null }, stamp: { kind: 'approved', text: '', name: lsGet('pdfstudio-stampname', ''), date: true }, file: null, pdf: null, pages: [], scale: 1, tab: tab0, tool: tool0, objs: [], sel: null, hist: [], fut: [], assets: new Map(), fields: [], formVals: {}, flattenForm: false, seq: 0, dirty: false };
  window.__editor = S; // voor tests

  const fileIn = el('input', { type: 'file', accept: '.pdf,application/pdf', class: 'sr', id: 'file-in', 'aria-label': 'PDF openen' });
  const imgIn = el('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'sr', id: 'img-in', 'aria-label': 'Afbeelding kiezen' });
  const nameEl = el('span', { class: 'ed-name' }, 'Geen bestand geopend');
  const undoBtn = el('button', { class: 'btn icon', type: 'button', 'aria-label': 'Ongedaan maken', onclick: () => undo() }, icon('undo', 20));
  const redoBtn = el('button', { class: 'btn icon', type: 'button', 'aria-label': 'Opnieuw', onclick: () => redo() }, icon('redo', 20));
  const saveBtn = el('button', { class: 'btn pri', type: 'button', id: 'ed-save', onclick: () => save() }, icon('download', 18, '#fff'), 'Opslaan als PDF');
  const tabsEl = el('nav', { class: 'ed-tabs', role: 'tablist', 'aria-label': 'Gereedschapsgroepen' });
  const ribbon = el('div', { class: 'ed-ribbon', role: 'toolbar', 'aria-label': 'Gereedschappen' });
  const thumbs = el('aside', { class: 'ed-thumbs', 'aria-label': 'Paginaminiaturen' });
  const stage = el('main', { class: 'ed-stage', id: 'ed-stage' });
  const props = el('aside', { class: 'ed-props', 'aria-label': 'Eigenschappen' });
  const status = el('footer', { class: 'ed-status' });

  app.replaceChildren(
    topbar(el('div', { class: 'ed-top' }, nameEl, undoBtn, redoBtn,
      el('a', { class: 'btn', href: '#' }, icon('grid', 18), 'Toolbox'), saveBtn)),
    el('div', { class: 'editor' }, tabsEl, ribbon, el('div', { class: 'ed-body' }, thumbs, stage, props), status), fileIn, imgIn);

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
    if (S.mdraft) cancelPoly();
    S.tool = t; select(null);
    if (t === 'image') { if (S.pdf) imgIn.click(); }
    if (t === 'sign' && S.pdf) signatureDialog();
    stage.dataset.tool = t; S.pages.forEach(drawTextLayer);
    drawRibbon(); drawProps(); drawStatus();
  }

  /* ----- Openen ----- */
  function emptyStage() {
    const drop = el('div', { class: 'drop ed-drop' }, icon('upload', 32, '#1B93A5'), el('span', { style: { fontSize: '16px' } }, 'Sleep een PDF hierheen of'),
      el('button', { class: 'btn pri', type: 'button', onclick: () => fileIn.click() }, 'PDF openen'), el('span', { class: 'hint' }, 'Het bestand blijft op uw computer.'));
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
    S.scale = Math.min(1.6, Math.max(0.5, (stage.clientWidth - 64) / vp1.width));
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
        // voorbeeld op een losse kopie van alleen deze pagina: veel sneller dan het hele document opnieuw opbouwen
        const single = pg.single || (pg.single = await singlePage(pg.i));
        let { bytes, removed, overflow, fontReport } = await buildPdf(new Set(), { only: pg.i, textOnly: true, single });
        const bad = await verifyRemoval(bytes, removed, true);
        if (bad.length) ({ bytes, removed, overflow, fontReport } = await buildPdf(new Set(bad), { only: pg.i, textOnly: true, single }));
        if (pg.pvSig !== sig) return; // inmiddels weer gewijzigd
        const doc = await bytesToPdfJs(bytes); pg.view = await doc.getPage(1); pg.pvMode = removed.has(pg.i) ? 'engine' : 'cover'; pg.overflow = overflow; pg.fontReport = fontReport;
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
  function select(oid, focus) { S.sel = oid; drawObjects(); drawProps(); if (focus) { const go = () => { const n = stage.querySelector(`.ed-obj[data-id="${oid}"] .ed-edit`); if (n) { n.focus(); const r = document.createRange(); r.selectNodeContents(n); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }; go(); requestAnimationFrame(go); } }
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
    } else if (o.type === 'measure') {
      const pts = o.pts.map(([px, py]) => `${(px - o.x) * s},${(py - o.y) * s}`).join(' ');
      const shape = o.kind === 'area' ? `<polygon points="${pts}" fill="${o.color}" fill-opacity="0.12" stroke="${o.color}" stroke-width="${o.width * s}" stroke-linejoin="round"/>` : `<polyline points="${pts}" fill="none" stroke="${o.color}" stroke-width="${o.width * s}" stroke-linejoin="round" stroke-linecap="round"/>`;
      const ends = o.kind === 'dist' ? o.pts.map(([px, py]) => tick(o, px, py, s)).join('') : o.pts.map(([px, py]) => `<circle cx="${(px - o.x) * s}" cy="${(py - o.y) * s}" r="${2 * s}" fill="${o.color}"/>`).join('');
      n.innerHTML = `<svg width="100%" height="100%" style="overflow:visible" aria-hidden="true">${shape}${ends}</svg>`;
      const [lx, ly] = labelPos(o); n.append(el('span', { class: 'ed-mlabel', style: { left: (lx - o.x) * s + 'px', top: (ly - o.y) * s + 'px', color: o.color, fontSize: Math.max(10, 10 * s) + 'px' } }, measureLabel(o)));
    } else if (o.type === 'stamp') {
      const fs = stampFont(o); n.style.color = o.color; n.style.borderColor = o.color; n.style.borderWidth = Math.max(1.5, o.h * 0.05) * s + 'px'; n.style.borderRadius = o.h * 0.14 * s + 'px';
      n.append(el('span', { class: 'ed-st-main', style: { fontSize: fs.main * s + 'px' } }, o.text || ' '), o.sub ? el('span', { class: 'ed-st-sub', style: { fontSize: fs.sub * s + 'px' } }, o.sub) : '');
    } else if (o.type === 'field') {
      n.classList.add('ed-f-' + o.ftype);
      n.append(el('span', { class: 'ed-fname' }, o.ftype === 'fradio' ? `${o.group}: ${o.value}` : o.name), o.ftype === 'fdrop' ? el('span', { class: 'ed-fdrop' }, '▾') : '');
    }
    if (['rect', 'ellipse'].includes(o.type)) { n.style.border = `${o.width * s}px solid ${o.color}`; n.style.background = o.fill || 'transparent'; if (o.type === 'ellipse') n.style.borderRadius = '50%'; }
    if (o.type === 'highlight') n.style.background = o.color;
    if (o.type === 'underline' || o.type === 'strike') n.style.setProperty('--lc', o.color);
    n.addEventListener('pointerdown', (e) => objPointer(e, o, n));
    if (sel && !['comment', 'measure'].includes(o.type)) {
      n.append(el('span', { class: 'ed-handle', 'aria-hidden': 'true', 'data-h': '1' }));
    }
    if (sel && (o.type === 'text' || o.type === 'textedit')) n.append(el('span', { class: 'ed-grip', role: 'img', 'aria-label': 'Verplaatsen', title: 'Slepen om te verplaatsen' }, '✥ ', el('span', null, 'Verplaatsen')));
    if (sel) n.append(el('button', { type: 'button', class: 'ed-del', 'aria-label': 'Verwijderen', onclick: (e) => { e.stopPropagation(); remove(o.id); } }, icon('x', 14, '#fff', 2.5)));
    return n;
  }
  // ----- Meten -----
  function measureValue(o) {
    const L = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]); const pts = o.pts; const k = MM_PER_PT * (o.ratio || 1) / (UNITS[o.unit] || 1);
    if (o.kind === 'dist') return L(pts[0], pts[1]) * k;
    if (o.kind === 'perim') { let t = 0; for (let i = 1; i < pts.length; i++) t += L(pts[i - 1], pts[i]); return t * k; }
    let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2) * k * k;
  }
  const fmtNum = (v) => { const d = v >= 100 ? 1 : v >= 10 ? 2 : 3; return v.toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'nl-BE', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  function measureLabel(o) { const v = measureValue(o); return (o.kind === 'area' ? fmtNum(v) + ' ' + o.unit + '²' : fmtNum(v) + ' ' + o.unit); }
  function labelPos(o) {
    const pts = o.pts;
    if (o.kind === 'dist') return [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
    if (o.kind === 'perim') { const a = pts[pts.length - 2], b = pts[pts.length - 1]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    return [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length];
  }
  function tick(o, px, py, s) { const [a, b] = o.pts; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2; const d = 5; return `<line x1="${(px - o.x + Math.cos(ang) * d) * s}" y1="${(py - o.y + Math.sin(ang) * d) * s}" x2="${(px - o.x - Math.cos(ang) * d) * s}" y2="${(py - o.y - Math.sin(ang) * d) * s}" stroke="${o.color}" stroke-width="${o.width * s}"/>`; }
  function measureBox(o) { const xs = o.pts.map((p) => p[0]), ys = o.pts.map((p) => p[1]); const x = Math.min(...xs) - 4, y = Math.min(...ys) - 4; Object.assign(o, { x, y, w: Math.max(...xs) - x + 4, h: Math.max(...ys) - y + 4 }); return o; }
  function addMeasure(pg, kind, pts) { return add(measureBox({ type: 'measure', kind, page: pg.i, pts, color: S.mColor || '#C8102E', width: 1.2, ratio: S.mscale.ratio, unit: S.mscale.unit })); }
  function stampFont(o) { return o.sub ? { main: o.h * 0.42, sub: o.h * 0.2 } : { main: o.h * 0.58, sub: 0 }; }
  function stampSub() { const parts = []; if (S.stamp.name.trim()) parts.push(S.stamp.name.trim()); if (S.stamp.date) parts.push(today()); return parts.join(' · '); }
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
      if (t === 'stamp') {
        const [kind, label, color] = STAMPS.find((x) => x[0] === S.stamp.kind) || STAMPS[0]; const text = kind === 'custom' ? (S.stamp.text || tr('STEMPEL')).toUpperCase() : tr(label); const sub = stampSub();
        const h = sub ? 46 : 34; const w = Math.max(110, text.length * h * (sub ? 0.3 : 0.42) + 24);
        const o = add({ type: 'stamp', page: pg.i, x: x0 - w / 2, y: y0 - h / 2, w, h, text, sub, color: S.stamp.color || color, kind }); select(o.id); return;
      }
      if (t === 'mperim' || t === 'marea') { polyClick(pg, t, x0, y0, e); return; }
      if (t === 'mdist' || t === 'mscale') {
        const svgNs = 'http://www.w3.org/2000/svg'; const draft = el('div', { class: 'ed-draft' }); const svg = document.createElementNS(svgNs, 'svg'); svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
        const ln = document.createElementNS(svgNs, 'line'); ln.setAttribute('stroke', t === 'mscale' ? '#1B93A5' : '#C8102E'); ln.setAttribute('stroke-width', 2); ln.setAttribute('stroke-dasharray', t === 'mscale' ? '6 4' : ''); svg.append(ln);
        const lab = el('span', { class: 'ed-mlabel' }); draft.append(svg, lab); pg.layer.append(draft); let x1 = x0, y1 = y0;
        const mv = (ev) => { [x1, y1] = pt(ev); if (ev.shiftKey) { const a = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * Math.PI / 4; const d = Math.hypot(x1 - x0, y1 - y0); x1 = x0 + Math.cos(a) * d; y1 = y0 + Math.sin(a) * d; }
          ln.setAttribute('x1', x0 * S.scale); ln.setAttribute('y1', y0 * S.scale); ln.setAttribute('x2', x1 * S.scale); ln.setAttribute('y2', y1 * S.scale);
          lab.textContent = t === 'mscale' ? '' : measureLabel({ kind: 'dist', pts: [[x0, y0], [x1, y1]], ratio: S.mscale.ratio, unit: S.mscale.unit }); Object.assign(lab.style, { left: (x0 + x1) / 2 * S.scale + 'px', top: (y0 + y1) / 2 * S.scale + 'px' }); };
        const up = async () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); draft.remove(); const len = Math.hypot(x1 - x0, y1 - y0); if (len < 4) return;
          if (t === 'mdist') { const o = addMeasure(pg, 'dist', [[x0, y0], [x1, y1]]); select(o.id); }
          else await calibrate(len); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up); return;
      }
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
          if (FIELD_TOOLS[t] && (w < 6 || h < 6)) { [w, h] = FIELD_TOOLS[t]; x = x0; y = y0 - h / 2; }
          if ((t === 'fcheck' || t === 'fradio') && (w > 40 || h > 40)) { w = h = Math.min(w, h, 40); }
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
          else if (FIELD_TOOLS[t]) { o = add({ ...base, type: 'field', ftype: t, name: uniqueName(FIELD_NAMES[t]), required: false, value: t === 'fradio' ? 'Keuze ' + (S.objs.filter((x) => x.ftype === 'fradio').length + 1) : '', group: 'Groep 1', options: t === 'fdrop' ? 'Optie 1\nOptie 2\nOptie 3' : '', fontSize: 0 }); select(o.id); return; }
          else if (t === 'link') { o = add({ ...base, type: t, url: 'https://' }); select(o.id); setTimeout(() => { const i = document.getElementById('p-url'); if (i) { i.focus(); i.select(); } }, 0); return; }
          if (o && ['rect', 'ellipse', 'arrow'].includes(t)) select(o.id);
        };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      }
    });
  }

  // Veelhoek (omtrek/oppervlakte) punt voor punt
  function polyClick(pg, t, x, y, e) {
    const D = S.mdraft;
    if (D && D.pg !== pg) { cancelPoly(); }
    if (!S.mdraft) {
      const svgNs = 'http://www.w3.org/2000/svg'; const node = el('div', { class: 'ed-draft' }); const svg = document.createElementNS(svgNs, 'svg'); svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.style.overflow = 'visible';
      const pl = document.createElementNS(svgNs, t === 'marea' ? 'polygon' : 'polyline'); pl.setAttribute('fill', t === 'marea' ? 'rgba(200,16,46,.12)' : 'none'); pl.setAttribute('stroke', '#C8102E'); pl.setAttribute('stroke-width', 2); svg.append(pl);
      const lab = el('span', { class: 'ed-mlabel' }); node.append(svg, lab); pg.layer.append(node);
      const move = (ev) => { const r = pg.el.getBoundingClientRect(); S.mdraft.hover = [(ev.clientX - r.left) / S.scale, (ev.clientY - r.top) / S.scale]; drawPoly(); };
      const dbl = (ev) => { ev.preventDefault(); finishPoly(); };
      pg.el.addEventListener('pointermove', move); pg.el.addEventListener('dblclick', dbl);
      S.mdraft = { pg, t, pts: [], node, pl, lab, move, dbl, hover: null };
    }
    const d = S.mdraft; const f = d.pts[0];
    if (f && d.pts.length >= (t === 'marea' ? 3 : 2) && Math.hypot(x - f[0], y - f[1]) * S.scale < 9) { if (t === 'marea') finishPoly(); else { d.pts.push([...f]); finishPoly(); } return; }
    const last = d.pts[d.pts.length - 1]; if (last && Math.hypot(x - last[0], y - last[1]) * S.scale < 3) return;
    d.pts.push([x, y]); drawPoly(); if (d.pts.length === 1 || d.pts.length === 2) drawProps();
  }
  function drawPoly() {
    const d = S.mdraft; if (!d) return; const pts = d.hover ? [...d.pts, d.hover] : d.pts;
    d.pl.setAttribute('points', pts.map(([a, b]) => `${a * S.scale},${b * S.scale}`).join(' '));
    if (pts.length >= 2) { const o = { kind: d.t === 'marea' ? 'area' : 'perim', pts, ratio: S.mscale.ratio, unit: S.mscale.unit }; const [lx, ly] = labelPos(o); d.lab.textContent = measureLabel(o); Object.assign(d.lab.style, { left: lx * S.scale + 'px', top: ly * S.scale + 'px' }); }
  }
  function cancelPoly() { const d = S.mdraft; if (!d) return; d.pg.el.removeEventListener('pointermove', d.move); d.pg.el.removeEventListener('dblclick', d.dbl); d.node.remove(); S.mdraft = null; }
  function finishPoly() {
    const d = S.mdraft; if (!d) return; const kind = d.t === 'marea' ? 'area' : 'perim'; const pts = d.pts.map((p) => [...p]); cancelPoly();
    if (pts.length < (kind === 'area' ? 3 : 2)) return; const o = addMeasure(d.pg, kind, pts); select(o.id);
  }
  async function calibrate(lenPt) {
    const inp = el('input', { type: 'number', id: 'cal-len', min: 0, step: 'any', value: '' }); const un = el('select', { id: 'cal-unit' }, Object.keys(UNITS).map((u) => el('option', { value: u }, u))); un.value = S.mscale.unit;
    const ok = await modal({ title: 'Schaal kalibreren', body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, el('p', { class: 'help' }, 'Hoe lang is de lijn die u net trok in werkelijkheid?'), el('div', { class: 'row2' }, el('div', { class: 'field' }, el('label', { for: 'cal-len' }, 'Echte lengte'), inp), el('div', { class: 'field' }, el('label', { for: 'cal-unit' }, 'Eenheid'), un))), ok: 'Schaal instellen', onOk: () => (+inp.value > 0 ? true : (toast('Vul een lengte groter dan 0 in.', 'error'), false)) });
    if (!ok) return;
    const realMm = +inp.value * UNITS[un.value]; S.mscale = { ratio: realMm / (lenPt * MM_PER_PT), unit: un.value, cal: true }; lsSet('pdfstudio-mscale', S.mscale.ratio); lsSet('pdfstudio-munit', S.mscale.unit);
    applyScaleToAll(); toast(`Schaal ingesteld: 1:${fmtNum(S.mscale.ratio)}`); setTool('mdist');
  }
  function applyScaleToAll() { let n = 0; S.objs.forEach((o) => { if (o.type === 'measure') { o.ratio = S.mscale.ratio; o.unit = S.mscale.unit; n++; } }); if (n) commit(); drawObjects(); drawProps(); }
  function uniqueName(base) { const used = new Set([...S.fields.map((f) => f.name), ...S.objs.filter((o) => o.type === 'field').map((o) => o.name)]); let i = 1; while (used.has(base + '_' + i)) i++; return base + '_' + i; }
  async function autoFields() {
    let n = 0;
    for (const pg of S.pages) {
      if (!pg.textItems) await loadText(pg);
      for (const it of pg.textItems) {
        const re = /_{4,}|\.{6,}|…{3,}/g; let m;
        while ((m = re.exec(it.str))) { const cw = it.w / it.str.length; const x = it.x + cw * m.index, w = cw * m[0].length; if (w < 20) continue; const h = Math.max(14, it.size * 1.25);
          add({ type: 'field', ftype: 'ftext', page: pg.i, x, y: it.base - h + it.size * 0.25, w, h, name: uniqueName('Tekstveld'), required: false, value: '', group: 'Groep 1', options: '', fontSize: 0 }); n++; }
        const re2 = /[☐□❑▢]/g; while ((m = re2.exec(it.str))) { const cw = it.w / it.str.length; const sz = Math.max(9, it.size * 0.9); add({ type: 'field', ftype: 'fcheck', page: pg.i, x: it.x + cw * m.index, y: it.base - sz, w: sz, h: sz, name: uniqueName('Selectievakje'), required: false, value: '', group: 'Groep 1', options: '', fontSize: 0 }); n++; }
      }
    }
    toast(n ? `${n} veld(en) herkend. Controleer namen en posities.` : 'Geen invulplaatsen (____ of ☐) gevonden.' , n ? undefined : 'error');
  }

  /* ----- Afbeelding en handtekening ----- */
  imgIn.addEventListener('change', async () => {
    const f = imgIn.files[0]; imgIn.value = ''; if (!f || !isImageFile(f)) return;
    let bytes = await readBytes(f); let kind = /png/i.test(f.type) ? 'png' : 'jpg';
    if (!/png|jpe?g/i.test(f.type)) { const bmp = await createImageBitmap(f); const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); kind = 'png'; }
    const bmp = await createImageBitmap(new Blob([bytes])); placeImage(bytes, kind, bmp.width, bmp.height, 220); setTool('select');
  });
  function currentPage() { const r = stage.getBoundingClientRect(); let best = S.pages[0], d = 1e9; for (const pg of S.pages) { const b = pg.el.getBoundingClientRect(); const dd = Math.abs(b.top + Math.min(b.height, r.height) / 2 - (r.top + r.height / 2)); if (b.bottom > r.top && dd < d) { d = dd; best = pg; } } return best; }
  function placeImage(bytes, kind, iw, ih, width, extra = {}) {
    const pg = currentPage(); const aid = 'a' + (++S.seq); S.assets.set(aid, { bytes, kind });
    const w = Math.min(width, pg.w * 0.8), h = w * ih / iw;
    const o = add({ type: 'image', page: pg.i, x: (pg.w - w) / 2, y: Math.max(20, (pg.h - h) / 2), w, h, asset: aid, opacity: 1, ...extra }); select(o.id);
  }
  /* Opgeslagen handtekeningen: alleen in deze browser (localStorage), nooit verstuurd. */
  const SIG_KEY = 'pdfstudio-signatures';
  const sigLoad = () => { try { const a = JSON.parse(lsGet(SIG_KEY, '[]')); return Array.isArray(a) ? a.filter((x) => x && typeof x.id === 'string' && typeof x.png === 'string' && x.png.startsWith('data:image/png;base64,')).map((x) => ({ ...x, name: typeof x.name === 'string' ? x.name : '' })) : []; } catch { return []; } };
  const sigSave = (a) => { try { localStorage.setItem(SIG_KEY, JSON.stringify(a)); return true; } catch { return false; } };
  const loadCanvasFromUrl = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); res(c); }; im.onerror = rej; im.src = url; });
  // Foto of scan van een handtekening naar een canvas; wit papier wordt desgewenst transparant.
  async function fileToSigCanvas(file, transparent) {
    const bmp = await createImageBitmap(file); const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, c.width, c.height);
    if (transparent) {
      const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
      for (let i = 0; i < d.length; i += 4) { const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; const a = lum >= 235 ? 0 : lum > 170 ? Math.round(255 * (235 - lum) / 65) : 255; d[i + 3] = Math.min(d[i + 3], a); }
      g.putImageData(im, 0, 0);
    }
    return c;
  }
  async function signatureDialog() {
    let mode = 'draw', savedSel = null, imgFile = null, imgCanvas = null, drawn = false, down = false;
    let saved = sigLoad();
    const c = el('canvas', { width: 560, height: 200, class: 'sigpad', 'aria-label': 'Tekenvlak voor handtekening' });
    const g = c.getContext('2d'); g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000000';
    c.addEventListener('pointerdown', (e) => { down = true; drawn = true; const r = c.getBoundingClientRect(); g.beginPath(); g.moveTo((e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height); c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (!down) return; const r = c.getBoundingClientRect(); g.lineTo((e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height); g.stroke(); });
    c.addEventListener('pointerup', () => { down = false; });
    const typed = el('input', { type: 'text', id: 'sig-text', placeholder: 'Of typ uw naam', autocomplete: 'name' });
    // Afbeelding
    const fileIn = el('input', { type: 'file', id: 'sig-file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp' });
    const transp = el('input', { type: 'checkbox', id: 'sig-transp', checked: true });
    const prev = el('canvas', { class: 'sigpad sigprev', width: 560, height: 200, 'aria-label': 'Voorbeeld van de afbeelding' });
    const refreshImg = async () => {
      if (!imgFile) return; try { imgCanvas = await fileToSigCanvas(imgFile, transp.checked); } catch { imgCanvas = null; toast('Deze afbeelding kan niet worden gelezen.', 'error'); return; }
      const pg = prev.getContext('2d'); pg.clearRect(0, 0, prev.width, prev.height); const t = trimCanvas(imgCanvas); const k = Math.min(prev.width / t.width, prev.height / t.height, 1); const w = t.width * k, h = t.height * k; pg.drawImage(t, (prev.width - w) / 2, (prev.height - h) / 2, w, h);
    };
    fileIn.addEventListener('change', () => { imgFile = fileIn.files[0] || null; if (imgFile && !isImageFile(imgFile)) { imgFile = null; toast('Kies een afbeelding (PNG, JPG of WebP).', 'error'); return; } refreshImg(); });
    transp.addEventListener('change', refreshImg);
    // Panelen en tabs
    const panels = {
      draw: el('div', { class: 'sig-panel' }, el('div', { class: 'help' }, 'Teken met muis, pen of vinger in het vak.'), c,
        el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, el('button', { type: 'button', class: 'btn sm', onclick: () => { g.clearRect(0, 0, c.width, c.height); drawn = false; } }, 'Wissen'))),
      type: el('div', { class: 'sig-panel', hidden: true }, el('div', { class: 'field' }, el('label', { for: 'sig-text' }, 'Getypte handtekening'), typed)),
      image: el('div', { class: 'sig-panel', hidden: true }, el('div', { class: 'help' }, 'Kies een foto of scan van uw handtekening (PNG, JPG of WebP). Teken ze het best met donkere inkt op wit papier.'), fileIn,
        el('label', { class: 'check', for: 'sig-transp' }, transp, 'Witte achtergrond transparant maken'), prev),
    };
    const tabBtns = {};
    const setMode = (m) => { mode = m; savedSel = null; Object.entries(panels).forEach(([k, p]) => { p.hidden = k !== m; }); Object.entries(tabBtns).forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === m))); renderSaved(); };
    const tabs = el('div', { class: 'seg h', role: 'group', 'aria-label': 'Manier van invoeren' }, ...[['draw', 'Tekenen'], ['type', 'Typen'], ['image', 'Afbeelding']].map(([k, label]) => (tabBtns[k] = el('button', { type: 'button', 'aria-pressed': String(k === mode), onclick: () => setMode(k) }, label))));
    // Bewaren
    const keep = el('input', { type: 'checkbox', id: 'sig-keep', onchange: () => { nameRow.hidden = !keep.checked || !!savedSel; if (keep.checked) nameIn.focus(); } });
    const nameIn = el('input', { type: 'text', id: 'sig-name', maxlength: '40', placeholder: 'bv. Jan Peeters', autocomplete: 'off' });
    const nameRow = el('div', { class: 'field', hidden: true }, el('label', { for: 'sig-name' }, 'Naam bij deze handtekening'), nameIn);
    const keepRow = el('label', { class: 'check', for: 'sig-keep' }, keep, 'Bewaar deze handtekening voor later gebruik (alleen in deze browser)');
    // Opgeslagen lijst
    const savedBox = el('div', { class: 'sig-saved' });
    function renderSaved() {
      savedBox.innerHTML = ''; savedBox.hidden = !saved.length; if (!saved.length) return;
      savedBox.append(el('div', { class: 'flabel' }, 'Opgeslagen handtekeningen'), el('div', { class: 'sig-grid' }, ...saved.map((s) => el('div', { class: 'sig-item' },
        el('button', { type: 'button', class: 'sig-pick', 'aria-pressed': String(savedSel === s.id), 'aria-label': 'Deze handtekening gebruiken' + (s.name ? ': ' + s.name : ''), title: s.name || '', onclick: () => { savedSel = savedSel === s.id ? null : s.id; renderSaved(); } }, el('img', { src: s.png, alt: '' }), el('span', { class: 'sig-name' }, s.name || 'Zonder naam')),
        el('button', { type: 'button', class: 'sig-del', 'aria-label': 'Handtekening verwijderen', onclick: () => { saved = saved.filter((x) => x.id !== s.id); if (savedSel === s.id) savedSel = null; sigSave(saved); renderSaved(); } }, icon('x', 12, '#fff', 2.5))))));
      keepRow.hidden = !!savedSel; nameRow.hidden = !!savedSel || !keep.checked; panelWrap.hidden = !!savedSel; tabs.hidden = !!savedSel;
    }
    const panelWrap = el('div', null, panels.draw, panels.type, panels.image);
    const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, savedBox, tabs, panelWrap, keepRow, nameRow);
    renderSaved();
    let result = null;
    const ok = await modal({ title: 'Handtekening', body, ok: 'Plaatsen', onOk: async () => {
      let src = null;
      if (savedSel) { const s = saved.find((x) => x.id === savedSel); try { src = await loadCanvasFromUrl(s.png); } catch { toast('Deze opgeslagen handtekening kan niet worden geladen.', 'error'); return false; } }
      else if (mode === 'draw') { if (!drawn) { toast('Teken eerst een handtekening.', 'error'); return false; } src = c; }
      else if (mode === 'type') { if (!typed.value.trim()) { toast('Typ eerst uw naam.', 'error'); return false; } src = document.createElement('canvas'); src.width = 900; src.height = 220; const x = src.getContext('2d'); x.fillStyle = '#000000'; x.font = 'italic 110px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive'; x.textBaseline = 'middle'; x.fillText(typed.value.trim(), 20, 115); }
      else { if (!imgFile) { toast('Kies eerst een afbeelding.', 'error'); return false; } if (!imgCanvas) await refreshImg(); if (!imgCanvas) return false; src = imgCanvas; }
      result = { src, fromSaved: !!savedSel, keep: keep.checked, name: nameIn.value.trim().slice(0, 40) }; return true;
    } });
    if (!ok || !result) { setTool('select'); return; }
    let trimmed = trimCanvas(result.src); blackenInk(trimmed);
    if (result.keep && !result.fromSaved) {
      // kleine PNG bewaren (max. 600 px breed) zodat de opslag beperkt blijft
      const k = Math.min(1, 600 / trimmed.width); const sm = document.createElement('canvas'); sm.width = Math.max(1, Math.round(trimmed.width * k)); sm.height = Math.max(1, Math.round(trimmed.height * k)); sm.getContext('2d').drawImage(trimmed, 0, 0, sm.width, sm.height);
      const list = [{ id: Date.now().toString(36), name: result.name, png: sm.toDataURL('image/png') }, ...sigLoad()].slice(0, 8);
      toast(sigSave(list) ? 'Handtekening opgeslagen.' : 'Opslaan is niet gelukt (opslag vol of geblokkeerd).', sigSave(list) ? undefined : 'error');
    }
    const blob = await new Promise((r) => trimmed.toBlob(r, 'image/png'));
    placeImage(new Uint8Array(await blob.arrayBuffer()), 'png', trimmed.width, trimmed.height, 170, { sig: true });
    setTool('select');
  }
  // Handtekeningen zijn altijd zwart: heeft de afbeelding een transparante achtergrond, dan wordt alle inkt zwart.
  function blackenInk(c) {
    const g = c.getContext('2d', { willReadFrequently: true }); const im = g.getImageData(0, 0, c.width, c.height), d = im.data; let clear = false;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { clear = true; break; }
    if (!clear) return; for (let i = 0; i < d.length; i += 4) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; } g.putImageData(im, 0, 0);
  }
  function trimCanvas(c) {
    const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    if (x1 <= x0) return c; const o = document.createElement('canvas'); o.width = x1 - x0 + 8; o.height = y1 - y0 + 8; o.getContext('2d').drawImage(c, x0 - 4, y0 - 4, o.width, o.height, 0, 0, o.width, o.height); return o;
  }

  /* ----- Eigenschappenpaneel ----- */
  function field(label, input) { if (!input.id) input.id = 'p-' + label.toLowerCase().replace(/\W+/g, '-'); return el('div', { class: 'field' }, el('label', { for: input.id }, label), input); }
  function drawProps() {
    props.innerHTML = '';
    const o = selObj();
    if (!S.pdf) { props.append(el('h2', null, 'Editor'), el('p', { class: 'help' }, 'Open een PDF om te beginnen. Alles wordt lokaal in uw browser verwerkt.')); return; }
    if (o) {
      const T = { text: 'Tekstvak', textedit: 'Tekst', image: o.sig ? 'Handtekening' : 'Afbeelding', link: 'Koppeling', highlight: 'Markering', underline: 'Onderstreping', strike: 'Doorhaling', comment: 'Opmerking', ink: 'Tekening', rect: 'Rechthoek', ellipse: 'Ellips', arrow: 'Pijl', whiteout: 'Witvlak', redact: 'Redactievlak', measure: 'Meting', stamp: 'Stempel', field: 'Formulierveld' };
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
        props.append(field('Webadres', u), el('div', { class: 'help' }, 'bv. https://www.abn-cleanroomtechnology.com'));
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
      } else if (o.type === 'measure') {
        const col = el('input', { type: 'color', id: 'p-color', value: o.color, onchange: () => update(o, { color: col.value }) });
        const w = el('input', { type: 'number', id: 'p-width', min: 0.5, max: 10, step: 0.5, value: o.width, onchange: () => update(o, { width: +w.value || 1 }) });
        props.append(el('div', { class: 'm-value', id: 'm-value' }, measureLabel(o)), el('div', { class: 'help' }, `Schaal 1:${fmtNum(o.ratio)}`), el('div', { class: 'row2' }, field('Kleur', col), field('Lijndikte', w)));
      } else if (o.type === 'stamp') {
        const tx = el('input', { type: 'text', id: 'p-stamptext', value: o.text, onchange: () => update(o, { text: tx.value.toUpperCase() }) });
        const sb = el('input', { type: 'text', id: 'p-stampsub', value: o.sub || '', onchange: () => update(o, { sub: sb.value }) });
        const col = el('input', { type: 'color', id: 'p-color', value: o.color, onchange: () => update(o, { color: col.value }) });
        props.append(field('Tekst', tx), field('Onderregel (naam, datum)', sb), field('Kleur', col), el('div', { class: 'help' }, 'Sleep het hoekje rechtsonder om de stempel groter of kleiner te maken.'));
      } else if (o.type === 'field') {
        const nm = el('input', { type: 'text', id: 'p-fname', value: o.name, onchange: () => { const v = nm.value.trim(); if (!v || S.objs.some((x) => x !== o && x.type === 'field' && x.name === v && x.ftype !== 'fradio') || S.fields.some((f) => f.name === v)) { toast('Deze veldnaam bestaat al of is leeg.', 'error'); nm.value = o.name; return; } update(o, { name: v }); } });
        props.append(el('div', { class: 'help' }, FIELD_NAMES[o.ftype]));
        if (o.ftype === 'fradio') {
          const g = el('input', { type: 'text', id: 'p-fgroup', value: o.group, onchange: () => update(o, { group: g.value.trim() || 'Groep 1' }) });
          const v = el('input', { type: 'text', id: 'p-fvalue', value: o.value, onchange: () => update(o, { value: v.value.trim() || 'Keuze' }) });
          props.append(field('Groepsnaam', g), field('Waarde van dit rondje', v), el('div', { class: 'help' }, 'Rondjes met dezelfde groepsnaam vormen één keuzevraag.'));
        } else props.append(field('Veldnaam', nm));
        if (o.ftype === 'fdrop') { const op = el('textarea', { id: 'p-foptions', rows: 5, onchange: () => update(o, { options: op.value }) }); op.value = o.options; props.append(field('Keuzes (één per regel)', op)); }
        if (['ftext', 'fmulti', 'fdate'].includes(o.ftype)) {
          const dv = el('input', { type: 'text', id: 'p-fdefault', value: o.value, onchange: () => update(o, { value: dv.value }) });
          const fs = el('input', { type: 'number', id: 'p-fsize', min: 0, max: 72, value: o.fontSize, onchange: () => update(o, { fontSize: +fs.value || 0 }) });
          props.append(el('div', { class: 'row2' }, field('Standaardwaarde', dv), field('Lettergrootte (0 = auto)', fs)));
        }
        if (o.ftype === 'fcheck') { const c = el('input', { type: 'checkbox', id: 'p-fchecked', onchange: () => update(o, { value: c.checked ? 'on' : '' }) }); c.checked = !!o.value; props.append(el('label', { class: 'check' }, c, 'Standaard aangevinkt')); }
        if (o.ftype !== 'fsig') { const rq = el('input', { type: 'checkbox', id: 'p-freq', onchange: () => update(o, { required: rq.checked }) }); rq.checked = !!o.required; props.append(el('label', { class: 'check' }, rq, 'Verplicht veld')); }
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
    if (S.tool === 'stamp') props.append(stampPanel());
    if (S.tab === 'measure') props.append(measurePanel());
    if (S.tab === 'formdesign') props.append(designPanel());
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
  function stampPanel() {
    const box = el('div', { class: 'ed-section' });
    const kind = el('select', { id: 'st-kind', onchange: () => { S.stamp.kind = kind.value; S.stamp.color = null; drawProps(); } }, STAMPS.map(([k, label]) => el('option', { value: k }, label || 'Eigen tekst…'))); kind.value = S.stamp.kind;
    box.append(field('Stempel', kind));
    if (S.stamp.kind === 'custom') { const tx = el('input', { type: 'text', id: 'st-text', value: S.stamp.text, placeholder: 'bv. GECONTROLEERD', oninput: () => { S.stamp.text = tx.value; } }); box.append(field('Eigen tekst', tx)); }
    const nm = el('input', { type: 'text', id: 'st-name', value: S.stamp.name, placeholder: 'bv. W. Hermans', oninput: () => { S.stamp.name = nm.value; lsSet('pdfstudio-stampname', nm.value); } });
    const dt = el('input', { type: 'checkbox', id: 'st-date', onchange: () => { S.stamp.date = dt.checked; } }); dt.checked = S.stamp.date;
    box.append(field('Naam op de stempel', nm), el('label', { class: 'check' }, dt, 'Datum van vandaag toevoegen'),
      el('div', { class: 'help' }, 'De stempel wordt vast in de pagina geplaatst, zoals een gedrukte stempel.'));
    return box;
  }
  function measurePanel() {
    const box = el('div', { class: 'ed-section' });
    if (S.mdraft) box.append(el('div', { style: { display: 'flex', gap: '8px' } }, el('button', { type: 'button', class: 'btn pri', id: 'm-finish', onclick: () => { finishPoly(); } }, icon('check', 16, '#fff'), 'Meting afronden'), el('button', { type: 'button', class: 'btn', id: 'm-cancel', onclick: () => { cancelPoly(); drawProps(); } }, 'Annuleren')));
    box.append(el('h3', null, 'Schaal'));
    const sc = el('select', { id: 'm-scale', onchange: () => { if (sc.value === 'cal') { setTool('mscale'); return; } S.mscale = { ...S.mscale, ratio: +sc.value, cal: false }; lsSet('pdfstudio-mscale', S.mscale.ratio); applyScaleToAll(); } },
      SCALES.map(([v, t]) => el('option', { value: v }, t)), S.mscale.cal || !SCALES.some(([v]) => +v === S.mscale.ratio) ? el('option', { value: String(S.mscale.ratio) }, `1:${fmtNum(S.mscale.ratio)} (gekalibreerd)`) : null, el('option', { value: 'cal' }, 'Kalibreren op een gekende maat…'));
    sc.value = String(S.mscale.ratio);
    const un = el('select', { id: 'm-unit', onchange: () => { S.mscale = { ...S.mscale, unit: un.value }; lsSet('pdfstudio-munit', un.value); applyScaleToAll(); } }, Object.keys(UNITS).map((u) => el('option', { value: u }, u))); un.value = S.mscale.unit;
    box.append(el('div', { class: 'row2' }, field('Schaal van het plan', sc), field('Eenheid', un)));
    const ms = S.objs.filter((o) => o.type === 'measure');
    if (ms.length) {
      const KN = { dist: 'Afstand', perim: 'Omtrek', area: 'Oppervlakte' };
      box.append(el('h3', null, `Metingen (${ms.length})`), el('ul', { class: 'm-list', id: 'm-list' }, ms.map((o) => el('li', { onclick: () => select(o.id) }, el('span', null, `${KN[o.kind]} · p. ${o.page}`), el('strong', null, measureLabel(o))))));
      const sum = (k) => ms.filter((o) => o.kind === k).reduce((t, o) => t + measureValue(o), 0);
      const tot = [['dist', S.mscale.unit], ['perim', S.mscale.unit], ['area', S.mscale.unit + '²']].filter(([k]) => ms.some((o) => o.kind === k)).map(([k, u]) => `${KN[k]}: ${fmtNum(sum(k))} ${u}`);
      box.append(el('div', { class: 'note-box', id: 'm-total' }, 'Totaal — ' + tot.join(' · ')),
        el('button', { type: 'button', class: 'btn', id: 'm-csv', onclick: () => { const rows = [['Nr', 'Soort', 'Pagina', 'Waarde', 'Eenheid', 'Schaal'].map(tr)].concat(ms.map((o, i) => [i + 1, tr(KN[o.kind]), o.page, measureValue(o).toFixed(4).replace('.', ','), o.kind === 'area' ? o.unit + '²' : o.unit, '1:' + Math.round(o.ratio * 1000) / 1000])); saveFile(baseName(S.file.name) + (document.documentElement.lang === 'en' ? '_measurements.csv' : '_metingen.csv'), new TextEncoder().encode('\ufeff' + rows.map((r) => r.join(';')).join('\r\n'))); } }, icon('download', 16), 'Metingen als CSV'));
    }
    return box;
  }
  function designPanel() {
    const box = el('div', { class: 'ed-section' }, el('h3', null, 'Velden'));
    const fs = S.objs.filter((o) => o.type === 'field');
    box.append(el('button', { type: 'button', class: 'btn', id: 'fd-auto', onclick: () => autoFields() }, icon('search', 16), 'Invulplaatsen automatisch herkennen'),
      el('div', { class: 'help' }, `${fs.length} nieuw(e) veld(en)${S.fields.length ? `, ${S.fields.length} bestaand(e)` : ''}. Bij opslaan worden het echte PDF-formuliervelden die in Acrobat, Edge, Chrome en op telefoons invulbaar zijn.`));
    return box;
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
      el('span', null, 'Lokaal verwerkt — niets verlaat uw computer'));
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
    else if (S.mdraft && e.key === 'Enter') { e.preventDefault(); finishPoly(); }
    else if (S.mdraft && e.key === 'Escape') { cancelPoly(); }
    else if (e.key === 'Escape' && !inField) { select(null); if (S.tool !== 'select') setTool('select'); }
  };
  addEventListener('keydown', onKey);

  /* ----- Opslaan ----- */
  async function save() {
    if (!S.pdf) return;
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    saveBtn.disabled = true; const lbl = saveBtn.innerHTML; saveBtn.replaceChildren(el('span', { class: 'spin' }), 'Opslaan…');
    try {
      let r0; try { r0 = await buildPdf(); } catch (e) { console.warn('verkleind insluiten mislukt, opnieuw met volledige lettertypen', e); setSubset(false); try { r0 = await buildPdf(); } finally { setSubset(true); } }
      let { bytes, removed, overflow } = r0;
      const bad = await verifyRemoval(bytes, removed);
      if (bad.length) { ({ bytes } = await buildPdf(new Set(bad))); toast(`Op pagina ${bad.join(', ')} kon de tekst niet in het originele lettertype vervangen worden; daar is ze afgedekt en opnieuw geplaatst.`); }
      S.lastRemoved = [...removed].filter((p) => !bad.includes(p));
      if (overflow.length) toast(`Let op: ${overflow.length} gewijzigde regel(s) passen niet: ze lopen voorbij de marge of overlappen met tekst ernaast (max. ${Math.max(...overflow.map((x) => x.mm))} mm).`);
      const reds = S.objs.filter((o) => o.type === 'redact');
      if (reds.length) bytes = await applyRedactions(bytes, reds);
      const name = baseName(S.file.name) + (document.documentElement.lang === 'en' ? '_edited.pdf' : '_bewerkt.pdf');
      window.__lastResult = { title: 'Opgeslagen', outputs: [{ name, data: bytes }] };
      await saveFile(name, bytes); S.dirty = false; toast(`Opgeslagen als ${name}`);
    } catch (e) { console.error(e); toast('Opslaan mislukt: ' + e.message, 'error'); }
    finally { saveBtn.innerHTML = lbl; drawStatus(); }
  }
  async function singlePage(pn) {
    const src = await (S._srcDoc || (S._srcDoc = loadPdf(S.file)));
    const d = await PDFLib.PDFDocument.create({ updateMetadata: false }); d.addPage((await d.copyPages(src, [pn - 1]))[0]);
    return d.save({ useObjectStreams: false });
  }
  async function buildPdf(skip = new Set(), { only = null, textOnly = false, single = null } = {}) {
    const doc = single ? await loadPdf({ bytes: single }) : await loadPdf(S.file); const pages0 = doc.getPages();
    const pages = single ? { [only - 1]: pages0[0] } : pages0; const fonts = {}; const ctx = doc.context; const docFonts = new Map();
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
    const images = new Map(); const radios = new Map(); let form0 = null; const getForm = () => form0 || (form0 = doc.getForm());
    // pad in kijkcoördinaten -> PDF (werkt ook op gedraaide pagina's)
    const pathPdf = (P, cmds) => cmds.map(([c, ...v]) => { const out = [c]; for (let k = 0; k < v.length; k += 2) { const q = P(v[k], v[k + 1]); out.push(q.x.toFixed(2), (-q.y).toFixed(2)); } return out.join(' '); }).join(' ');
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
      } else if (o.type === 'measure') {
        const col = hexToRgb(o.color); const pts = o.pts;
        const cmds = pts.map((q, k) => [k ? 'L' : 'M', ...q]); if (o.kind === 'area') cmds.push(['Z']);
        if (o.kind === 'area') page.drawSvgPath(pathPdf(P, cmds), { x: 0, y: 0, color: col, opacity: 0.12, borderWidth: 0 });
        page.drawSvgPath(pathPdf(P, cmds), { x: 0, y: 0, borderColor: col, borderWidth: o.width, borderLineCap: PDFLib.LineCapStyle.Round });
        if (o.kind === 'dist') { const [a, b] = pts; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2; for (const [px, py] of pts) page.drawLine({ start: P(px + Math.cos(ang) * 5, py + Math.sin(ang) * 5), end: P(px - Math.cos(ang) * 5, py - Math.sin(ang) * 5), thickness: o.width, color: col }); }
        const f = await font('Helvetica'); const txt = measureLabel(o).replace(/\u202f|\u00a0/g, ' '); const sz = 9; const tw = f.widthOfTextAtSize(txt, sz); const [lx, ly] = labelPos(o);
        const bx = lx - tw / 2 - 3, by = ly - sz * 0.7 - 2; const a0 = P(bx, by + sz * 1.4 + 2);
        page.drawRectangle({ x: a0.x, y: a0.y, width: tw + 6, height: sz * 1.4 + 2, color: PDFLib.rgb(1, 1, 1), opacity: 0.85, rotate: rot });
        const tp = P(lx - tw / 2, by + sz * 1.1 + 1); page.drawText(txt, { x: tp.x, y: tp.y, size: sz, font: f, color: col, rotate: rot });
      } else if (o.type === 'stamp') {
        const col = hexToRgb(o.color); const r = o.h * 0.14, bw = Math.max(1.5, o.h * 0.05); const X = o.x + bw / 2, Y = o.y + bw / 2, W = o.w - bw, H = o.h - bw;
        const cmds = [['M', X + r, Y], ['L', X + W - r, Y], ['Q', X + W, Y, X + W, Y + r], ['L', X + W, Y + H - r], ['Q', X + W, Y + H, X + W - r, Y + H], ['L', X + r, Y + H], ['Q', X, Y + H, X, Y + H - r], ['L', X, Y + r], ['Q', X, Y, X + r, Y], ['Z']];
        page.drawSvgPath(pathPdf(P, cmds), { x: 0, y: 0, borderColor: col, borderWidth: bw, opacity: 0.9, borderOpacity: 0.9 });
        const fb = await font('HelveticaBold'), fr = await font('Helvetica'); const fs = stampFont(o);
        const main = safeText(fb, o.text || ''); let ms = fs.main; while (ms > 4 && fb.widthOfTextAtSize(main, ms) > o.w * 0.9) ms -= 0.5;
        const mw = fb.widthOfTextAtSize(main, ms); const baseMain = o.sub ? o.y + o.h * 0.52 : o.y + o.h / 2 + ms * 0.36;
        let q = P(o.x + (o.w - mw) / 2, baseMain); page.drawText(main, { x: q.x, y: q.y, size: ms, font: fb, color: col, rotate: rot, opacity: 0.9 });
        if (o.sub) { const sub = safeText(fr, o.sub); let ss = fs.sub; while (ss > 3 && fr.widthOfTextAtSize(sub, ss) > o.w * 0.9) ss -= 0.5; const sw = fr.widthOfTextAtSize(sub, ss); q = P(o.x + (o.w - sw) / 2, o.y + o.h * 0.82); page.drawText(sub, { x: q.x, y: q.y, size: ss, font: fr, color: col, rotate: rot, opacity: 0.9 }); }
      } else if (o.type === 'field') {
        const cs = [P(o.x, o.y), P(o.x + o.w, o.y), P(o.x, o.y + o.h), P(o.x + o.w, o.y + o.h)]; const fx = Math.min(...cs.map((c) => c.x)), fy = Math.min(...cs.map((c) => c.y));
        const box = { x: fx, y: fy, width: Math.max(...cs.map((c) => c.x)) - fx, height: Math.max(...cs.map((c) => c.y)) - fy, borderColor: PDFLib.rgb(0.55, 0.62, 0.66), borderWidth: 0.75, backgroundColor: PDFLib.rgb(0.93, 0.96, 1), rotate: rot };
        const form = getForm(); let name = o.name; const taken = (n) => { try { form.getField(n); return true; } catch { return false; } };
        if (o.ftype !== 'fradio' && taken(name)) { let i = 2; while (taken(name + '_' + i)) i++; name = name + '_' + i; }
        try {
          if (o.ftype === 'ftext' || o.ftype === 'fmulti' || o.ftype === 'fdate') {
            const tf = form.createTextField(name); if (o.ftype === 'fmulti') tf.enableMultiline(); if (o.value) tf.setText(o.value); if (o.fontSize) tf.setFontSize(o.fontSize); if (o.required) tf.enableRequired();
            tf.addToPage(page, box);
            if (o.ftype === 'fdate') tf.acroField.dict.set(PDFName.of('AA'), ctx.obj({ F: { S: 'JavaScript', JS: PDFString.of('AFDate_FormatEx("dd-mm-yyyy");') }, K: { S: 'JavaScript', JS: PDFString.of('AFDate_KeystrokeEx("dd-mm-yyyy");') } }));
          } else if (o.ftype === 'fcheck') { const cb = form.createCheckBox(name); cb.addToPage(page, box); if (o.value) cb.check(); if (o.required) cb.enableRequired(); }
          else if (o.ftype === 'fdrop') { const dd = form.createDropdown(name); dd.addOptions(o.options.split('\n').map((x) => x.trim()).filter(Boolean)); dd.addToPage(page, box); if (o.required) dd.enableRequired(); }
          else if (o.ftype === 'fradio') { let rg = radios.get(o.group); if (!rg) { try { rg = form.getRadioGroup(o.group); } catch { rg = form.createRadioGroup(o.group); } radios.set(o.group, rg); } rg.addOptionToPage(o.value || 'Keuze', page, box); if (o.required) rg.enableRequired(); }
          else if (o.ftype === 'fsig') {
            const w = ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFHexString.fromText(name), Rect: [box.x, box.y, box.x + box.width, box.y + box.height], F: 4, P: page.ref, MK: { BC: [0.55, 0.62, 0.66], BG: [0.93, 0.96, 1] } });
            const W = box.width, H = box.height; const ap = ctx.register(ctx.stream(`q 0.93 0.96 1 rg 0 0 ${W.toFixed(2)} ${H.toFixed(2)} re f 0.55 0.62 0.66 RG 0.75 w 0.38 0.38 ${(W - 0.75).toFixed(2)} ${(H - 0.75).toFixed(2)} re S Q`, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, W, H] }));
            w.set(PDFName.of('AP'), ctx.obj({ N: ap }));
            const ref = ctx.register(w); page.node.addAnnot(ref); form.acroForm.addField(ref);
          }
        } catch (e) { console.warn('veld', name, e); throw new Error(`Veld "${name}" kon niet gemaakt worden: ${e.message}`); }
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
        else annot = ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: rect, Contents: PDFHexString.fromText(o.text || ''), Name: 'Comment', C: [1, 0.85, 0.2], T: PDFHexString.fromText('ABN PDF Studio'), F: 4, Open: false });
        page.node.addAnnot(ctx.register(annot));
      }
    }
    return { bytes: await doc.save({ useObjectStreams: true }), removed, overflow, fontReport };
  }
  // Controle: staat alle niet-bewerkte tekst er nog en is de oude tekst weg?
  async function verifyRemoval(bytes, pagesSet, single = false) {
    const bad = []; if (!pagesSet.size) return bad; const pdf = await bytesToPdfJs(bytes);
    const norm = (x) => x.replace(/\s+/g, '');
    for (const pn of pagesSet) {
      const tc = await (await pdf.getPage(single ? 1 : pn)).getTextContent(); const now = norm(tc.items.map((i) => i.str || '').join(''));
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
