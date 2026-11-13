// Overige professionele hulpmiddelen: invoegen/vervangen, paginaformaat, afbeeldingen vervangen, verborgen inhoud,
// bijlagen, lagen, opmerkingen exporteren, toegankelijkheid en batchverwerking
import { L, tr } from './i18n.js';
import { el, icon, toast, F, PDFLib, loadPdf, openPdfJs, bytesToPdfJs, renderPage, parseRange, baseName, readBytes, isImageFile, fmtBytes, saveFile, probePdf, mm } from './core.js';

const { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, PDFRawStream, PDFRef, PDFNumber, PDFString, PDFHexString, PDFNull, decodePDFRawStream, StandardFonts, rgb } = PDFLib;
const N = (x) => PDFName.of(x);
const save = (doc) => doc.save({ useObjectStreams: true });
const plural = (n) => `${n} pagina${n === 1 ? '' : "'s"}`;
const first = (ctx) => ctx.files[0];
const nameStr = (o) => (o instanceof PDFName ? o.decodeText() : o ? String(o).replace(/^\//, '') : '');
const dictOf = (o) => (o instanceof PDFDict ? o : o && o.dict instanceof PDFDict ? o.dict : null);
const txt = (o) => (o && o.decodeText ? o.decodeText() : '');
const walk = (ctx, fn) => { for (const [ref, obj] of ctx.enumerateIndirectObjects()) fn(obj, ref); };

/* ================= Pagina's invoegen of vervangen ================= */
const insertPages = {
  input: { multiple: true, min: 2 }, runLabel: 'Uitvoeren', lead: 'Het eerste bestand is het hoofddocument, het tweede levert de pagina\'s die ingevoegd worden of in de plaats komen.',
  options: (ctx) => [
    F.seg(ctx, 'mode', 'Wat wilt u doen?', [['insert', 'Invoegen'], ['replace', 'Vervangen']], 'insert', { horizontal: true }),
    F.text(ctx, 'srcRange', 'Pagina\'s uit het tweede bestand', '', { placeholder: 'alle' }),
    ctx.opts.mode === 'replace' ? F.text(ctx, 'target', 'Te vervangen pagina\'s in het hoofddocument', '1', { placeholder: 'bv. 3-5', help: 'Deze pagina\'s worden weggehaald; de nieuwe pagina\'s komen op die plaats.' })
      : F.select(ctx, 'where', 'Waar invoegen?', [['start', 'Vooraan'], ['end', 'Achteraan'], ['after', 'Na pagina…']], 'end'),
    ctx.opts.mode !== 'replace' && ctx.opts.where === 'after' ? F.number(ctx, 'after', 'Na pagina', 1, { min: 1 }) : null
  ].filter(Boolean),
  onChange: (ctx, key) => { if (key === 'mode' || key === 'where') ctx.refresh(); },
  summary: (ctx) => ctx.files.length < 2 ? 'Kies het hoofddocument en het bestand met de nieuwe pagina\'s' : [`Hoofddocument: ${ctx.files[0].name} (${plural(ctx.files[0].pages)})`, `Bron: ${ctx.files[1].name} (${plural(ctx.files[1].pages)})`],
  validate: (ctx) => { if (ctx.files.length < 2) return 'Kies twee PDF\'s.'; try { parseRange(ctx.opts.srcRange, ctx.files[1].pages); if (ctx.opts.mode === 'replace') { if (!parseRange(ctx.opts.target, ctx.files[0].pages)) return 'Geef de te vervangen pagina\'s op.'; } else if (ctx.opts.where === 'after' && (+ctx.opts.after < 1 || +ctx.opts.after > ctx.files[0].pages)) return `Kies een pagina tussen 1 en ${ctx.files[0].pages}.`; } catch (e) { return e.message; } },
  async run(ctx) {
    const [a, b] = ctx.files; const doc = await loadPdf(a); const src = await loadPdf(b);
    const sIdx = parseRange(ctx.opts.srcRange, b.pages, { keepOrder: true }) || Array.from({ length: b.pages }, (_, i) => i);
    const pages = await doc.copyPages(src, sIdx); let at, removed = 0;
    if (ctx.opts.mode === 'replace') { const t = parseRange(ctx.opts.target, a.pages).sort((x, y) => x - y); at = t[0]; for (const i of [...t].reverse()) { doc.removePage(i); removed++; } }
    else at = ctx.opts.where === 'start' ? 0 : ctx.opts.where === 'after' ? +ctx.opts.after : doc.getPageCount();
    pages.forEach((p, k) => doc.insertPage(at + k, p));
    return { title: ctx.opts.mode === 'replace' ? `${plural(removed)} vervangen door ${plural(pages.length)}` : `${plural(pages.length)} ingevoegd`, note: `Het resultaat heeft ${plural(doc.getPageCount())}.`, outputs: [{ name: `${baseName(a.name)}_aangepast.pdf`, data: await save(doc) }] };
  }
};

/* ================= Paginaformaat wijzigen ================= */
const SIZES = { A3: [297, 420], A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };
const pageSize = {
  runLabel: 'Formaat wijzigen', lead: 'Schaalt elke pagina naar het gekozen papierformaat, met behoud van verhoudingen. Opmerkingen en koppelingen schalen mee.',
  options: (ctx) => [
    F.select(ctx, 'size', 'Nieuw formaat', [['A4', 'A4 (210 × 297 mm)'], ['A3', 'A3 (297 × 420 mm)'], ['A5', 'A5 (148 × 210 mm)'], ['Letter', 'Letter (8,5 × 11 in)'], ['Legal', 'Legal (8,5 × 14 in)'], ['custom', 'Eigen formaat…']], 'A4'),
    ctx.opts.size === 'custom' ? el('div', { class: 'row2' }, F.number(ctx, 'cw', 'Breedte (mm)', 210, { min: 20 }), F.number(ctx, 'ch', 'Hoogte (mm)', 297, { min: 20 })) : null,
    F.seg(ctx, 'orient', 'Richting', [['auto', 'Zoals elke pagina'], ['portrait', 'Staand'], ['landscape', 'Liggend']], 'auto'),
    F.seg(ctx, 'fit', 'Inhoud', [['fit', 'Passend schalen'], ['none', 'Niet schalen (centreren)']], 'fit'),
    F.number(ctx, 'margin', 'Witrand (mm)', 0, { min: 0, step: 1 }),
    F.text(ctx, 'range', 'Pagina\'s', '', { placeholder: 'alle' })
  ].filter(Boolean),
  onChange: (ctx, key) => { if (key === 'size') ctx.refresh(); },
  summary: (ctx) => first(ctx) ? plural(first(ctx).pages) : 'Nog geen bestand gekozen',
  validate: (ctx) => { try { parseRange(ctx.opts.range, first(ctx).pages); } catch (e) { return e.message; } },
  async preview(ctx) { const src = await loadPdf(first(ctx)); resizeDoc(src, ctx.opts, [0]); const d = await PDFDocument.create(); d.addPage((await d.copyPages(src, [0]))[0]); return d.save(); },
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const idx = parseRange(ctx.opts.range, f.pages) || doc.getPages().map((_, i) => i);
    resizeDoc(doc, ctx.opts, idx);
    const [w, h] = targetMm(ctx.opts, 1, 2);
    return { title: `${plural(idx.length)} aangepast`, note: `Nieuw formaat: ${ctx.opts.size === 'custom' ? `${Math.round(w)} × ${Math.round(h)} mm` : ctx.opts.size}.`, outputs: [{ name: `${baseName(f.name)}_${ctx.opts.size === 'custom' ? 'formaat' : ctx.opts.size}.pdf`, data: await save(doc) }] };
  }
};
const targetMm = (o, vw, vh) => { let [w, h] = o.size === 'custom' ? [+o.cw || 210, +o.ch || 297] : SIZES[o.size] || SIZES.A4; const land = o.orient === 'landscape' || (o.orient === 'auto' && vw > vh); if (land !== w > h) [w, h] = [h, w]; return [w, h]; };
function resizeDoc(doc, o, idx) {
  const pages = doc.getPages();
  for (const i of idx) {
    const pg = pages[i]; const rot = ((pg.getRotation().angle % 360) + 360) % 360; const box = pg.getCropBox ? pg.getCropBox() : pg.getMediaBox();
    const sw = rot % 180 ? box.height : box.width, sh = rot % 180 ? box.width : box.height; // zichtbare maten
    let [W, H] = targetMm(o, sw, sh).map(mm); const m = mm(+o.margin || 0);
    const k = o.fit === 'none' ? 1 : Math.min((W - 2 * m) / sw, (H - 2 * m) / sh);
    if (rot % 180) [W, H] = [H, W]; // terug naar onverdraaide ruimte
    const dx = (W - box.width * k) / 2 - box.x * k, dy = (H - box.height * k) / 2 - box.y * k;
    pg.node.set(N('MediaBox'), doc.context.obj([0, 0, W, H])); ['CropBox', 'BleedBox', 'TrimBox', 'ArtBox'].forEach((b) => pg.node.delete(N(b)));
    // inhoud schalen en verschuiven
    const ctx = doc.context;
    const pre = ctx.register(ctx.flateStream(`q ${k} 0 0 ${k} ${dx} ${dy} cm\n`)), post = ctx.register(ctx.flateStream('\nQ'));
    const c = pg.node.get(N('Contents')); const arr = c instanceof PDFArray ? c.asArray() : c ? [c] : []; pg.node.set(N('Contents'), ctx.obj([pre, ...arr, post]));
    const annots = pg.node.lookup(N('Annots'));
    if (annots instanceof PDFArray) for (const r of annots.asArray()) { const a = ctx.lookup(r); if (!(a instanceof PDFDict)) continue; const R = a.lookup(N('Rect')); if (R instanceof PDFArray && R.size() === 4) { const v = R.asArray().map((x) => ctx.lookup(x).asNumber()); a.set(N('Rect'), ctx.obj([v[0] * k + dx, v[1] * k + dy, v[2] * k + dx, v[3] * k + dy])); } const Q = a.lookup(N('QuadPoints')); if (Q instanceof PDFArray) a.set(N('QuadPoints'), ctx.obj(Q.asArray().map((x, j) => ctx.lookup(x).asNumber() * k + (j % 2 ? dy : dx)))); }
  }
}

/* ================= Afbeeldingen vervangen ================= */
function listImages(doc) {
  const ctx = doc.context; const map = new Map();
  const scan = (res, pi, seen) => { if (!(res instanceof PDFDict)) return; const xo = res.lookup(N('XObject')); if (!(xo instanceof PDFDict)) return; for (const [name, ref] of xo.entries()) { if (!(ref instanceof PDFRef)) continue; const o = ctx.lookup(ref); const d = dictOf(o); if (!d) continue; const st = nameStr(d.get(N('Subtype'))); const key = ref.toString(); if (st === 'Image') { if (!map.has(key)) map.set(key, { ref, stream: o, pages: new Set(), w: d.lookup(N('Width'))?.asNumber?.() || 0, h: d.lookup(N('Height'))?.asNumber?.() || 0 }); map.get(key).pages.add(pi + 1); } else if (st === 'Form' && !seen.has(key)) { seen.add(key); scan(d.lookup(N('Resources')), pi, seen); } } };
  doc.getPages().forEach((p, i) => scan(p.node.Resources(), i, new Set()));
  return [...map.values()].filter((x) => x.w * x.h >= 64 && !dictOf(x.stream).get(N('ImageMask')));
}
async function imageThumb(img) {
  const d = dictOf(img.stream); const filt = String(d.get(N('Filter')) || '');
  try {
    if (/DCTDecode/.test(filt) && img.stream instanceof PDFRawStream && !/,/.test(filt.replace(/^\[|\]$/g, '').trim().replace(/\s+/g, ','))) { const cs = String(d.get(N('ColorSpace')) || ''); if (!/CMYK|ICCBased/.test(cs)) return URL.createObjectURL(new Blob([img.stream.contents], { type: 'image/jpeg' })); }
    const bits = d.lookup(N('BitsPerComponent'))?.asNumber?.() || 8; const cs = d.lookup(N('ColorSpace')); const csn = cs instanceof PDFName ? cs.decodeText() : cs instanceof PDFArray ? nameStr(cs.get(0)) : '';
    if (bits !== 8 || !/DeviceRGB|DeviceGray|ICCBased/.test(csn) || /DCT|JPX|JBIG|CCITT/.test(filt)) return null;
    const raw = decodePDFRawStream(img.stream).decode(); const n = csn === 'DeviceGray' ? 1 : csn === 'DeviceRGB' ? 3 : raw.length / (img.w * img.h);
    const c = document.createElement('canvas'); c.width = img.w; c.height = img.h; const g = c.getContext('2d'); const id = g.createImageData(img.w, img.h);
    for (let i = 0, j = 0; i < img.w * img.h; i++) { const v = i * n; id.data[j++] = raw[v]; id.data[j++] = raw[v + (n > 1 ? 1 : 0)]; id.data[j++] = raw[v + (n > 1 ? 2 : 0)]; id.data[j++] = 255; }
    g.putImageData(id, 0, 0); return c.toDataURL('image/png');
  } catch { return null; }
}
const replaceImages = {
  runLabel: 'Opslaan', lead: 'Kies een afbeelding in de PDF en vervang ze door een andere (bv. een nieuw logo of een bijgewerkte foto). De nieuwe afbeelding komt op exact dezelfde plaats.',
  async onFiles(ctx) { ctx.repl = new Map(); ctx.imgs = first(ctx) ? listImages(await loadPdf(first(ctx))) : []; for (const im of ctx.imgs) im.thumb = await imageThumb(im); },
  options: (ctx) => [F.seg(ctx, 'fitMode', 'Nieuwe afbeelding', [['fit', 'Verhoudingen behouden'], ['fill', 'Kader vullen']], 'fit'), el('div', { class: 'help' }, 'Een afbeelding die op meerdere pagina\'s staat (bv. een logo in de kop) wordt overal vervangen.')],
  summary: (ctx) => first(ctx) ? `${(ctx.imgs || []).length} afbeelding(en) · ${ctx.repl ? ctx.repl.size : 0} gewijzigd` : 'Nog geen bestand gekozen',
  renderMain(ctx, box) {
    box.innerHTML = ''; if (!first(ctx)) return;
    if (!ctx.imgs.length) { box.append(el('p', { class: 'empty' }, 'Geen afbeeldingen gevonden in deze PDF.')); return; }
    box.append(el('h2', { style: { fontSize: '16px' } }, `Afbeeldingen (${ctx.imgs.length})`), el('div', { class: 'img-grid', id: 'img-grid' }, ctx.imgs.map((im, k) => {
      const r = ctx.repl.get(im.ref.toString()); const inp = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'sr', id: 'img-file-' + k, onchange: async (e) => { const f = e.target.files[0]; if (!f || !isImageFile(f)) return; ctx.repl.set(im.ref.toString(), { file: f, bytes: await readBytes(f) }); ctx.refresh(); } });
      return el('div', { class: 'img-card' + (r ? ' changed' : ''), 'data-k': k },
        el('div', { class: 'img-th' }, r && !r.remove ? el('img', { src: URL.createObjectURL(r.file), alt: '' }) : r && r.remove ? el('span', { class: 'help' }, 'Wordt verwijderd') : im.thumb ? el('img', { src: im.thumb, alt: '' }) : icon('image', 36, '#86BCBF')),
        el('div', { class: 'help' }, `${im.w} × ${im.h} px · p. ${[...im.pages].slice(0, 5).join(', ')}${im.pages.size > 5 ? '…' : ''}`),
        el('div', { class: 'img-act' }, el('button', { class: 'btn sm', type: 'button', onclick: () => inp.click() }, r ? 'Andere kiezen' : 'Vervangen'),
          el('button', { class: 'btn sm ghost', type: 'button', 'aria-label': 'Afbeelding verwijderen', onclick: () => { ctx.repl.set(im.ref.toString(), { remove: true }); ctx.refresh(); } }, icon('trash', 16)),
          r ? el('button', { class: 'btn sm ghost', type: 'button', onclick: () => { ctx.repl.delete(im.ref.toString()); ctx.refresh(); } }, 'Herstellen') : null), inp);
    })));
  },
  validate: (ctx) => (!ctx.repl || !ctx.repl.size ? 'Kies eerst bij minstens één afbeelding een vervanging.' : null),
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const c = doc.context; let n = 0;
    for (const [key, r] of ctx.repl) {
      const im = listImages(doc).find((x) => x.ref.toString() === key); if (!im) continue;
      let form;
      if (r.remove) form = c.stream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1] });
      else {
        let bytes = r.bytes, isPng = /png/i.test(r.file.type) || /\.png$/i.test(r.file.name);
        if (!isPng && !/jpe?g/i.test(r.file.type)) { const bmp = await createImageBitmap(r.file); const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0); bytes = new Uint8Array(await (await new Promise((res) => cv.toBlob(res, 'image/png'))).arrayBuffer()); isPng = true; }
        const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        // in het eenheidsvierkant van de oude afbeelding passen (Form XObject), eventueel met behoud van verhoudingen
        let a = 1, d = 1, e = 0, fy = 0; if (ctx.opts.fitMode !== 'fill') { const ro = im.w / im.h, rn = img.width / img.height; if (rn > ro) { d = ro / rn; fy = (1 - d) / 2; } else { a = rn / ro; e = (1 - a) / 2; } }
        form = c.stream(`q ${a} 0 0 ${d} ${e} ${fy} cm /Im0 Do Q`, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1], Resources: { XObject: { Im0: img.ref } } });
      }
      c.assign(im.ref, form); n++;
    }
    return { title: `${n} afbeelding(en) vervangen`, outputs: [{ name: `${baseName(f.name)}_afbeeldingen.pdf`, data: await save(doc) }] };
  }
};

/* ================= Inhoudsstroom: verborgen lagen verwijderen ================= */
const WS = new Set([0, 9, 10, 12, 13, 32]); const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
function tokenize(b) { // → [{type, v, s, e}]
  const out = []; let i = 0; const n = b.length;
  while (i < n) {
    const c = b[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; }
    const s = i;
    if (c === 40) { let depth = 1; i++; while (i < n && depth) { if (b[i] === 92) i += 2; else { if (b[i] === 40) depth++; else if (b[i] === 41) depth--; i++; } } out.push({ t: 'str', s, e: i }); continue; }
    if (c === 60 && b[i + 1] === 60) { out.push({ t: '<<', s, e: i + 2 }); i += 2; continue; }
    if (c === 62 && b[i + 1] === 62) { out.push({ t: '>>', s, e: i + 2 }); i += 2; continue; }
    if (c === 60) { while (i < n && b[i] !== 62) i++; i++; out.push({ t: 'str', s, e: i }); continue; }
    if (c === 91 || c === 93 || c === 123 || c === 125) { out.push({ t: String.fromCharCode(c), s, e: ++i }); continue; }
    if (c === 47) { i++; while (i < n && !WS.has(b[i]) && !DELIM.has(b[i])) i++; out.push({ t: 'name', v: new TextDecoder('latin1').decode(b.subarray(s + 1, i)), s, e: i }); continue; }
    while (i < n && !WS.has(b[i]) && !DELIM.has(b[i])) i++;
    const v = new TextDecoder('latin1').decode(b.subarray(s, i)); if (i === s) { i++; continue; }
    if (/^[+\-.\d]/.test(v)) out.push({ t: 'num', v, s, e: i });
    else {
      out.push({ t: 'op', v, s, e: i });
      if (v === 'ID') { // ingesloten afbeelding: binaire data tot EI
        let j = i + 1; while (j < n - 2 && !(WS.has(b[j - 1]) && b[j] === 69 && b[j + 1] === 73 && (j + 2 >= n || WS.has(b[j + 2]))) ) j++;
        out.push({ t: 'bin', s: i, e: j }); i = j;
      }
    }
  }
  return out;
}
// Verwijdert inhoud binnen /OC-markeringen die naar een verborgen laag verwijzen, en Do van verborgen XObjects
function stripContent(bytes, hiddenProps, hiddenXo) {
  const toks = tokenize(bytes); const keep = []; let opStart = 0; let skip = 0; let removed = 0; let operands = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t !== 'op') { operands.push(t); continue; }
    const s = operands.length ? operands[0].s : t.s; let e = t.e;
    if (t.v === 'BI') { // tot en met EI meenemen
      while (k + 1 < toks.length && !(toks[k + 1].t === 'op' && toks[k + 1].v === 'EI')) k++; k++; e = toks[k] ? toks[k].e : e;
    }
    if (skip) { if (t.v === 'BDC' || t.v === 'BMC') skip++; else if (t.v === 'EMC') skip--; removed++; operands = []; continue; }
    if (t.v === 'BDC' && operands.length >= 2 && operands[0].t === 'name' && operands[0].v === 'OC' && operands[1].t === 'name' && hiddenProps.has(operands[1].v)) { skip = 1; removed++; operands = []; continue; }
    if (t.v === 'Do' && operands.length && operands[0].t === 'name' && hiddenXo.has(operands[0].v)) { removed++; operands = []; continue; }
    keep.push([s, e]); operands = [];
  }
  if (!removed) return null;
  const parts = keep.map(([s, e]) => bytes.subarray(s, e)); const total = parts.reduce((a, p) => a + p.length + 1, 0); const out = new Uint8Array(total); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; out[o++] = 10; }
  return out;
}
function ocgState(doc) {
  const ctx = doc.context; const ocp = doc.catalog.lookup(N('OCProperties')); if (!(ocp instanceof PDFDict)) return null;
  const ocgs = (ocp.lookup(N('OCGs')) instanceof PDFArray ? ocp.lookup(N('OCGs')).asArray() : []).map((r) => ({ ref: r, name: txt(ctx.lookup(r).lookup?.(N('Name'))) || 'Laag' }));
  const D = ocp.lookup(N('D')); const off = new Set(D instanceof PDFDict && D.lookup(N('OFF')) instanceof PDFArray ? D.lookup(N('OFF')).asArray().map((r) => r.toString()) : []);
  const baseOff = D instanceof PDFDict && nameStr(D.get(N('BaseState'))) === 'OFF'; const on = new Set(D instanceof PDFDict && D.lookup(N('ON')) instanceof PDFArray ? D.lookup(N('ON')).asArray().map((r) => r.toString()) : []);
  ocgs.forEach((g) => { g.visible = baseOff ? on.has(g.ref.toString()) : !off.has(g.ref.toString()); });
  return { ocp, D, ocgs };
}
// verborgen = volgens 'visible' (map ref→bool); OCMD's benaderd (AnyOn standaard)
function isHiddenOC(ctx, v, vis) {
  const o = v instanceof PDFRef ? ctx.lookup(v) : v; if (!(o instanceof PDFDict)) return false;
  if (nameStr(o.get(N('Type'))) === 'OCG') return vis.get((v instanceof PDFRef ? v : o).toString()) === false;
  if (nameStr(o.get(N('Type'))) === 'OCMD') { const g = o.get(N('OCGs')); const list = g instanceof PDFArray ? g.asArray() : g ? [g] : []; const st = list.map((r) => vis.get(r.toString()) !== false); const P = nameStr(o.get(N('P'))) || 'AnyOn'; return P === 'AllOn' ? st.includes(false) : P === 'AnyOff' ? !st.includes(false) : P === 'AllOff' ? st.includes(true) : !st.includes(true); }
  return false;
}
function removeHiddenContent(doc, vis) {
  const ctx = doc.context; let removed = 0; const done = new Set();
  const processRes = (res, contentRefs, setContent) => {
    if (!(res instanceof PDFDict)) return;
    const props = res.lookup(N('Properties')); const hp = new Set(); if (props instanceof PDFDict) for (const [k, v] of props.entries()) if (isHiddenOC(ctx, v, vis)) hp.add(k.decodeText());
    const xo = res.lookup(N('XObject')); const hx = new Set();
    if (xo instanceof PDFDict) for (const [k, v] of xo.entries()) { const d = dictOf(ctx.lookup(v)); if (!d) continue; if (d.get(N('OC')) && isHiddenOC(ctx, d.get(N('OC')), vis)) hx.add(k.decodeText()); else if (nameStr(d.get(N('Subtype'))) === 'Form' && v instanceof PDFRef && !done.has(v.toString())) { done.add(v.toString()); const st = ctx.lookup(v); processRes(d.lookup(N('Resources')), [v], (bytes) => { const nd = {}; for (const [kk, vv] of d.entries()) if (!['Length', 'Filter', 'DecodeParms'].includes(kk.decodeText())) nd[kk.decodeText()] = vv; ctx.assign(v, ctx.flateStream(bytes, nd)); }); } }
    if (!hp.size && !hx.size) return;
    const streams = contentRefs.map((r) => ctx.lookup(r)).filter((s) => s instanceof PDFRawStream || s instanceof PDFStream);
    const bytes = streams.map((s) => { try { return s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents(); } catch { return new Uint8Array(); } });
    const all = new Uint8Array(bytes.reduce((a, b) => a + b.length + 1, 0)); let o = 0; for (const b of bytes) { all.set(b, o); o += b.length; all[o++] = 10; }
    const out = stripContent(all, hp, hx); if (out) { setContent(out); removed++; }
  };
  for (const pg of doc.getPages()) {
    const c = pg.node.get(N('Contents')); const refs = c instanceof PDFArray ? c.asArray() : c ? [c] : [];
    processRes(pg.node.Resources(), refs, (bytes) => pg.node.set(N('Contents'), ctx.register(ctx.flateStream(bytes))));
    const an = pg.node.lookup(N('Annots')); if (an instanceof PDFArray) { const keep = an.asArray().filter((r) => { const a = ctx.lookup(r); return !(a instanceof PDFDict && a.get(N('OC')) && isHiddenOC(ctx, a.get(N('OC')), vis)); }); if (keep.length !== an.size()) pg.node.set(N('Annots'), ctx.obj(keep)); }
  }
  return removed;
}

/* ================= Lagen ================= */
const layers = {
  runLabel: 'Opslaan', lead: 'Bekijk de lagen van de PDF (bv. uit AutoCAD of Revit), kies welke zichtbaar zijn en verwijder verborgen lagen desgewenst definitief.',
  async onFiles(ctx) { ctx.ocg = null; const f = first(ctx); if (!f) return; const doc = await loadPdf(f); const st = ocgState(doc); ctx.ocg = st ? st.ocgs.map((g) => ({ ref: g.ref.toString(), name: g.name, visible: g.visible, orig: g.visible })) : []; },
  options: (ctx) => [
    F.seg(ctx, 'mode', 'Bij opslaan', [['default', 'Zichtbaarheid instellen'], ['remove', 'Verborgen lagen verwijderen'], ['flatten', 'Lagen samenvoegen (alles zichtbaar → één laag)']], 'default'),
    el('div', { class: 'help' }, ctx.opts.mode === 'remove' ? 'De inhoud van uitgevinkte lagen wordt definitief uit het bestand gehaald.' : ctx.opts.mode === 'flatten' ? 'Uitgevinkte lagen worden verwijderd, de rest wordt gewone pagina-inhoud zonder lagen.' : 'De lagen blijven bestaan; de PDF opent met de gekozen lagen zichtbaar.')
  ],
  onChange: (ctx, key) => { if (key === 'mode') ctx.refresh(); },
  summary: (ctx) => !first(ctx) ? 'Nog geen bestand gekozen' : ctx.ocg && ctx.ocg.length ? `${ctx.ocg.filter((g) => g.visible).length} van ${ctx.ocg.length} lagen zichtbaar` : 'Geen lagen',
  renderMain(ctx, box) {
    box.innerHTML = ''; const f = first(ctx); if (!f) return;
    if (!ctx.ocg.length) { box.append(el('p', { class: 'empty' }, 'Deze PDF heeft geen lagen.')); return; }
    const pv = el('div', { class: 'preview', id: 'layer-pv', style: { padding: '14px', minHeight: '120px' } });
    const draw = async () => { try { const pdf = await openPdfJs(f); const cfg = await pdf.getOptionalContentConfig(); for (const g of ctx.ocg) { const [num, gen] = g.ref.split(' '); const id = gen === '0' ? `${num}R` : `${num}R${gen}`; try { cfg.setVisibility(id, g.visible); } catch {} } const p = await pdf.getPage(1); const vp = p.getViewport({ scale: Math.min(1.2, 520 / p.getViewport({ scale: 1 }).width) }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await p.render({ canvasContext: c.getContext('2d'), viewport: vp, optionalContentConfigPromise: Promise.resolve(cfg) }).promise; pv.replaceChildren(el('div', { class: 'pw' }, c)); } catch (e) { pv.replaceChildren(el('div', { class: 'help' }, 'Geen voorbeeld: ' + e.message)); } };
    box.append(el('h2', { style: { fontSize: '16px' } }, `Lagen (${ctx.ocg.length})`),
      el('div', { style: { display: 'flex', gap: '8px' } }, el('button', { class: 'btn sm', type: 'button', onclick: () => { ctx.ocg.forEach((g) => { g.visible = true; }); ctx.refresh(); } }, 'Alles aan'), el('button', { class: 'btn sm', type: 'button', onclick: () => { ctx.ocg.forEach((g) => { g.visible = false; }); ctx.refresh(); } }, 'Alles uit')),
      el('div', { class: 'layer-list', id: 'layer-list' }, ctx.ocg.map((g, k) => { const c = el('input', { type: 'checkbox', id: 'lay-' + k, onchange: () => { g.visible = c.checked; ctx.changed('ocg'); draw(); } }); c.checked = g.visible; return el('label', { class: 'check' }, c, g.name); })),
      el('div', { class: 'flabel' }, 'Voorbeeld (pagina 1)'), pv);
    draw();
  },
  validate: (ctx) => (!ctx.ocg || !ctx.ocg.length ? 'Deze PDF heeft geen lagen.' : null),
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const c = doc.context; const st = ocgState(doc);
    const vis = new Map(ctx.ocg.map((g) => [g.ref, g.visible])); let note = '';
    if (ctx.opts.mode === 'default') {
      const D = st.D instanceof PDFDict ? st.D : c.obj({}); if (!(st.D instanceof PDFDict)) st.ocp.set(N('D'), D);
      D.set(N('BaseState'), N('ON')); D.set(N('OFF'), c.obj(st.ocgs.filter((g) => !vis.get(g.ref.toString())).map((g) => g.ref))); D.set(N('ON'), c.obj(st.ocgs.filter((g) => vis.get(g.ref.toString())).map((g) => g.ref)));
      note = 'De PDF opent nu met de gekozen lagen zichtbaar. Lezers kunnen ze nog aan- of uitzetten.';
    } else {
      const n = removeHiddenContent(doc, vis);
      if (ctx.opts.mode === 'flatten') { doc.catalog.delete(N('OCProperties')); note = 'Lagen samengevoegd; de PDF heeft geen lagen meer.'; }
      else { // verwijderde lagen uit de lijst halen
        const keep = st.ocgs.filter((g) => vis.get(g.ref.toString())); st.ocp.set(N('OCGs'), c.obj(keep.map((g) => g.ref))); const D = st.D instanceof PDFDict ? st.D : c.obj({}); D.set(N('OFF'), c.obj([])); D.set(N('ON'), c.obj(keep.map((g) => g.ref))); D.delete(N('Order')); st.ocp.set(N('D'), D);
        note = `${st.ocgs.length - keep.length} laag/lagen definitief verwijderd.`;
      }
      note += n ? '' : ' (Er was geen inhoud in de verborgen lagen gevonden.)';
    }
    return { title: 'Lagen aangepast', note, outputs: [{ name: `${baseName(f.name)}_lagen.pdf`, data: await save(doc) }] };
  }
};

/* ================= Bijlagen ================= */
function embeddedFiles(doc) { // [{name, spec(ref/dict), parentArr, index}]
  const ctx = doc.context; const out = []; const names = doc.catalog.lookup(N('Names')); const ef = names instanceof PDFDict ? names.lookup(N('EmbeddedFiles')) : null;
  const walkTree = (node) => { if (!(node instanceof PDFDict)) return; const nm = node.lookup(N('Names')); if (nm instanceof PDFArray) for (let i = 0; i + 1 < nm.size(); i += 2) out.push({ key: txt(nm.lookup(i)), spec: nm.get(i + 1) }); const kids = node.lookup(N('Kids')); if (kids instanceof PDFArray) kids.asArray().forEach((k) => walkTree(ctx.lookup(k))); };
  walkTree(ef);
  return out.map((x) => { const s = ctx.lookup(x.spec); const ef2 = s instanceof PDFDict ? s.lookup(N('EF')) : null; const st = ef2 instanceof PDFDict ? (ef2.lookup(N('UF')) || ef2.lookup(N('F'))) : null; let size = 0; try { const p = dictOf(st).lookup(N('Params')); size = p instanceof PDFDict && p.lookup(N('Size')) ? p.lookup(N('Size')).asNumber() : 0; } catch {} return { ...x, name: txt(s.lookup?.(N('UF'))) || txt(s.lookup?.(N('F'))) || x.key, desc: txt(s.lookup?.(N('Desc'))), stream: st, size }; });
}
const attachments = {
  runLabel: 'Opslaan', lead: 'Bekijk welke bestanden in de PDF zitten, haal ze eruit, verwijder ze of voeg nieuwe bijlagen toe (bv. een rekenblad of tekening bij een rapport).',
  async onFiles(ctx) { ctx.att = []; ctx.del = new Set(); ctx.added = []; const f = first(ctx); if (!f) return; const doc = await loadPdf(f); ctx.att = embeddedFiles(doc); const pdf = await openPdfJs(f); const a = await pdf.getAttachments(); ctx.annAtt = 0; for (let i = 1; i <= pdf.numPages; i++) ctx.annAtt += (await (await pdf.getPage(i)).getAnnotations()).filter((x) => x.subtype === 'FileAttachment').length; ctx.jsAtt = a; },
  summary: (ctx) => !first(ctx) ? 'Nog geen bestand gekozen' : `${ctx.att.length - ctx.del.size + ctx.added.length} bijlage(n)`,
  renderMain(ctx, box) {
    box.innerHTML = ''; const f = first(ctx); if (!f) return;
    const addIn = el('input', { type: 'file', multiple: true, class: 'sr', id: 'att-add', onchange: async (e) => { for (const file of e.target.files) ctx.added.push({ name: file.name, bytes: await readBytes(file), type: file.type }); e.target.value = ''; ctx.refresh(); } });
    const rows = [
      ...ctx.att.map((a, k) => el('div', { class: 'att-row' + (ctx.del.has(k) ? ' del' : '') }, icon('attach', 18), el('span', { class: 'nm' }, a.name), el('span', { class: 'help' }, a.size ? fmtBytes(a.size) : ''),
        el('button', { class: 'btn sm', type: 'button', 'data-get': k, onclick: async () => { try { const data = decodePDFRawStream(a.stream).decode(); saveFile(a.name, data); } catch { const j = ctx.jsAtt && Object.values(ctx.jsAtt).find((x) => x.filename === a.name); if (j) saveFile(a.name, j.content); } } }, icon('download', 16), 'Opslaan'),
        el('button', { class: 'btn sm ghost', type: 'button', 'aria-label': ctx.del.has(k) ? 'Terugzetten' : 'Bijlage verwijderen', onclick: () => { ctx.del.has(k) ? ctx.del.delete(k) : ctx.del.add(k); ctx.refresh(); } }, ctx.del.has(k) ? 'Terugzetten' : icon('trash', 16)))),
      ...ctx.added.map((a, k) => el('div', { class: 'att-row new' }, icon('plus', 18), el('span', { class: 'nm' }, a.name), el('span', { class: 'help' }, fmtBytes(a.bytes.length) + ' · nieuw'), el('button', { class: 'btn sm ghost', type: 'button', 'aria-label': 'Niet toevoegen', onclick: () => { ctx.added.splice(k, 1); ctx.refresh(); } }, icon('x', 16))))
    ];
    box.append(el('h2', { style: { fontSize: '16px' } }, 'Bijlagen'), rows.length ? el('div', { class: 'att-list', id: 'att-list' }, rows) : el('p', { class: 'empty' }, 'Deze PDF heeft geen bijlagen.'),
      ctx.annAtt ? el('div', { class: 'help' }, `Daarnaast ${ctx.annAtt} bijlage(n) als opmerking op een pagina (blijven ongewijzigd).`) : null,
      el('button', { class: 'btn', type: 'button', id: 'att-addbtn', onclick: () => addIn.click() }, icon('plus', 16), 'Bijlage toevoegen'), addIn);
  },
  validate: (ctx) => (!ctx.del.size && !ctx.added.length ? 'Er is niets gewijzigd. Voeg een bijlage toe of verwijder er een.' : null),
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const c = doc.context;
    if (ctx.del.size) { // naamboom opnieuw opbouwen zonder de verwijderde
      const all = embeddedFiles(doc).filter((_, k) => !ctx.del.has(k)); const names = doc.catalog.lookup(N('Names'));
      const arr = []; all.sort((a, b) => (a.key < b.key ? -1 : 1)).forEach((a) => arr.push(PDFHexString.fromText(a.key), a.spec));
      if (names instanceof PDFDict) { if (arr.length) names.set(N('EmbeddedFiles'), c.obj({ Names: c.obj(arr) })); else names.delete(N('EmbeddedFiles')); }
    }
    for (const a of ctx.added) await doc.attach(a.bytes, a.name, { mimeType: a.type || 'application/octet-stream', creationDate: new Date(), modificationDate: new Date() });
    return { title: 'Bijlagen bijgewerkt', note: [ctx.added.length ? `${ctx.added.length} toegevoegd` : '', ctx.del.size ? `${ctx.del.size} verwijderd` : ''].filter(Boolean).join(', ') + '.', outputs: [{ name: `${baseName(f.name)}_bijlagen.pdf`, data: await save(doc) }] };
  }
};

/* ================= Verborgen inhoud verwijderen ================= */
const sanitize = {
  input: { multiple: true }, runLabel: 'Opschonen', lead: 'Verwijdert verborgen en mogelijk gevoelige onderdelen voor u een PDF extern deelt.',
  options: (ctx) => [
    F.check(ctx, 'js', 'JavaScript, automatische acties en startacties', true),
    F.check(ctx, 'meta', 'Metadata (auteur, software, bewerkingsgeschiedenis, XMP)', true),
    F.check(ctx, 'att', 'Ingesloten bijlagen', true),
    F.check(ctx, 'layers', 'Verborgen lagen (inhoud definitief weg)', true),
    F.check(ctx, 'annots', 'Opmerkingen en markeringen', false),
    F.check(ctx, 'forms', 'Formuliervelden (waarden worden vastgezet)', false),
    F.check(ctx, 'links', 'Koppelingen naar websites en andere bestanden', false),
    F.check(ctx, 'private', 'Programma-specifieke en ongebruikte gegevens (PieceInfo, miniaturen, zoekindex)', true)
  ],
  summary: (ctx) => ctx.files.length ? `${ctx.files.length} bestand(en)` : 'Nog geen bestand gekozen',
  async run(ctx) {
    const o = ctx.opts; const outs = []; const notes = [];
    for (const f of ctx.files) {
      const doc = await loadPdf(f); const c = doc.context; const cat = doc.catalog; const done = [];
      if (o.js) { let n = 0; cat.delete(N('AA')); const oa = cat.lookup(N('OpenAction')); if (oa instanceof PDFDict && !/GoTo$/.test(nameStr(oa.get(N('S'))))) { cat.delete(N('OpenAction')); n++; } const nm = cat.lookup(N('Names')); if (nm instanceof PDFDict && nm.get(N('JavaScript'))) { nm.delete(N('JavaScript')); n++; }
        walk(c, (obj) => { const d = dictOf(obj); if (!d) return; if (d.get(N('AA'))) { d.delete(N('AA')); n++; } const a = d.lookup(N('A')); if (a instanceof PDFDict && /JavaScript|Launch|ImportData|SubmitForm|ResetForm/.test(nameStr(a.get(N('S'))))) { d.delete(N('A')); n++; } });
        if (n) done.push(`${n} script(s)/actie(s)`); }
      if (o.meta) { const info = c.lookup(c.trailerInfo.Info); let n = 0; if (info instanceof PDFDict) { n = info.keys().length; c.trailerInfo.Info = c.register(c.obj({})); } if (cat.get(N('Metadata'))) { cat.delete(N('Metadata')); n++; } walk(c, (obj) => { const d = dictOf(obj); if (d && d !== cat && d.get(N('Metadata'))) { d.delete(N('Metadata')); n++; } }); if (n) done.push('metadata'); }
      if (o.att) { const nm = cat.lookup(N('Names')); let n = 0; if (nm instanceof PDFDict && nm.get(N('EmbeddedFiles'))) { n += embeddedFiles(doc).length; nm.delete(N('EmbeddedFiles')); } cat.delete(N('AF')); for (const p of doc.getPages()) { const an = p.node.lookup(N('Annots')); if (an instanceof PDFArray) { const keep = an.asArray().filter((r) => nameStr(c.lookup(r)?.get?.(N('Subtype'))) !== 'FileAttachment'); n += an.size() - keep.length; p.node.set(N('Annots'), c.obj(keep)); } } if (n) done.push(`${n} bijlage(n)`); }
      if (o.layers) { const st = ocgState(doc); if (st) { const vis = new Map(st.ocgs.map((g) => [g.ref.toString(), g.visible])); const hidden = st.ocgs.filter((g) => !g.visible).length; if (hidden) { removeHiddenContent(doc, vis); const keep = st.ocgs.filter((g) => g.visible); st.ocp.set(N('OCGs'), c.obj(keep.map((g) => g.ref))); if (st.D instanceof PDFDict) { st.D.set(N('OFF'), c.obj([])); st.D.delete(N('Order')); } done.push(`${hidden} verborgen laag/lagen`); } } }
      if (o.forms) { try { const form = doc.getForm(); const n = form.getFields().length; if (n) { form.flatten(); done.push(`${n} formulierveld(en)`); } } catch {} }
      if (o.annots || o.links) { let n = 0; for (const p of doc.getPages()) { const an = p.node.lookup(N('Annots')); if (!(an instanceof PDFArray)) continue; const keep = an.asArray().filter((r) => { const a = c.lookup(r); const s = nameStr(a?.get?.(N('Subtype'))); if (s === 'Widget') return true; if (s === 'Link') { if (!o.links) return true; const act = a.lookup(N('A')); const internal = !(act instanceof PDFDict) || /GoTo$/.test(nameStr(act.get(N('S')))); return internal; } return !o.annots; }); n += an.size() - keep.length; p.node.set(N('Annots'), c.obj(keep)); } if (n) done.push(`${n} opmerking(en)/koppeling(en)`); }
      if (o.private) { let n = 0; walk(c, (obj) => { const d = dictOf(obj); if (!d) return; for (const k of ['PieceInfo', 'Thumb', 'LastModified']) if (d.get(N(k))) { d.delete(N(k)); n++; } }); for (const k of ['SpiderInfo', 'Threads', 'Legal', 'Perms']) if (cat.get(N(k))) { cat.delete(N(k)); n++; } if (n) done.push(`${n} privé-onderdeel/-onderdelen`); }
      // alleen objecten bewaren waar nog naar verwezen wordt
      const bytes = await save(doc); const clean = await PDFDocument.load(bytes, { updateMetadata: false }); const refd = reachable(clean); let orphans = 0; for (const [ref] of [...clean.context.enumerateIndirectObjects()]) if (!refd.has(ref.toString())) { clean.context.delete(ref); orphans++; }
      outs.push({ name: `${baseName(f.name)}_opgeschoond.pdf`, data: await save(clean) });
      notes.push((ctx.files.length > 1 ? f.name + ': ' : '') + (done.length ? 'verwijderd: ' + done.join(', ') : 'niets gevonden') + (orphans ? ` · ${orphans} ongebruikte objecten` : ''));
    }
    return { title: `${outs.length} bestand(en) opgeschoond`, note: notes.join(' — '), outputs: outs, zipName: 'opgeschoond' };
  }
};
function reachable(doc) {
  const c = doc.context; const seen = new Set(); const stack = [c.trailerInfo.Root, c.trailerInfo.Info, c.trailerInfo.Encrypt].filter(Boolean);
  const visit = (o) => { if (!o) return; if (o instanceof PDFRef) { const k = o.toString(); if (seen.has(k)) return; seen.add(k); stack.push(c.lookup(o)); return; } if (o instanceof PDFDict) for (const [, v] of o.entries()) visit(v); else if (o instanceof PDFArray) o.asArray().forEach(visit); else if (o && o.dict instanceof PDFDict) visit(o.dict); };
  while (stack.length) visit(stack.pop());
  return seen;
}

/* ================= Opmerkingen exporteren ================= */
const ANN_TYPES = { Text: 'Notitie', FreeText: 'Tekstvak', Highlight: 'Markering', Underline: 'Onderstreping', StrikeOut: 'Doorhaling', Squiggly: 'Golflijn', Square: 'Rechthoek', Circle: 'Ellips', Line: 'Lijn', Polygon: 'Veelhoek', PolyLine: 'Lijnenreeks', Ink: 'Tekening', Stamp: 'Stempel', Caret: 'Invoegteken', FileAttachment: 'Bijlage', Sound: 'Geluid' };
const pdfDate = (s) => { const m = /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(s || ''); return m ? `${m[3] || '01'}-${m[2] || '01'}-${m[1]}${m[4] ? ` ${m[4]}:${m[5] || '00'}` : ''}` : ''; };
async function collectComments(f) {
  const pdf = await openPdfJs(f); const list = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i); const anns = (await pg.getAnnotations()).filter((a) => ANN_TYPES[a.subtype]); if (!anns.length) continue;
    let items = null;
    for (const a of anns) {
      let marked = '';
      if (['Highlight', 'Underline', 'StrikeOut', 'Squiggly'].includes(a.subtype) && a.quadPoints) {
        if (!items) items = (await pg.getTextContent()).items.filter((t) => t.str);
        const qs = a.quadPoints; const rects = []; for (let q = 0; q < qs.length; q += 8) { const xs = [qs[q], qs[q + 2], qs[q + 4], qs[q + 6]], ys = [qs[q + 1], qs[q + 3], qs[q + 5], qs[q + 7]]; rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]); }
        if (!rects.length && a.rect) rects.push(a.rect);
        marked = items.filter((t) => { const x = t.transform[4], y = t.transform[5] + (t.height || 6) / 2; return rects.some(([x0, y0, x1, y1]) => x + t.width > x0 + 1 && x < x1 - 1 && y >= y0 - 1 && y <= y1 + 1); }).map((t) => t.str).join(' ').replace(/\s+/g, ' ').trim();
      }
      const col = a.color ? '#' + [...a.color].map((v) => v.toString(16).padStart(2, '0')).join('') : '';
      list.push({ page: i, type: tr(ANN_TYPES[a.subtype]), author: (a.titleObj && a.titleObj.str) || '', text: (a.contentsObj && a.contentsObj.str) || '', marked, date: pdfDate(a.modificationDate || a.creationDate), color: col, y: a.rect ? -a.rect[3] : 0 });
    }
  }
  list.sort((a, b) => a.page - b.page || a.y - b.y); return list;
}
async function commentsPdf(fileName, list) {
  const doc = await PDFDocument.create(); const fr = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 50; let page = doc.addPage([W, H]); let y = H - M;
  const safe = (s) => [...(s || '')].map((ch) => { try { fr.encodeText(ch); return ch; } catch { return '?'; } }).join('');
  const wrap = (s, font, size, width) => { const out = []; for (const para of safe(s).split('\n')) { let line = ''; for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t; } out.push(line); } return out; };
  const need = (h) => { if (y - h < M) { page = doc.addPage([W, H]); y = H - M; } };
  page.drawText(safe(L('Overzicht van opmerkingen', 'Summary of comments')), { x: M, y, size: 16, font: fb, color: rgb(0, 0.29, 0.45) }); y -= 20;
  page.drawText(safe(`${fileName} · ${list.length} ${L('opmerking(en)', 'comment(s)')}`), { x: M, y, size: 10, font: fr, color: rgb(0.3, 0.3, 0.3) }); y -= 24;
  let lastPage = 0;
  for (const c of list) {
    if (c.page !== lastPage) { need(30); page.drawText(safe(`${L('Pagina', 'Page')} ${c.page}`), { x: M, y, size: 12, font: fb, color: rgb(0.11, 0.58, 0.65) }); y -= 18; lastPage = c.page; }
    const head = [c.type, c.author, c.date].filter(Boolean).join(' · '); const body = [c.marked ? `"${c.marked}"` : '', c.text].filter(Boolean).join('\n');
    const lines = wrap(body, fr, 10, W - 2 * M - 14); need(16 + lines.length * 13);
    if (c.color) { const h = c.color.slice(1).match(/.{2}/g).map((v) => parseInt(v, 16) / 255); page.drawRectangle({ x: M, y: y - 3 - lines.length * 13, width: 3, height: 14 + lines.length * 13, color: rgb(...h) }); }
    page.drawText(safe(head), { x: M + 10, y, size: 9, font: fb, color: rgb(0.27, 0.42, 0.49) }); y -= 13;
    for (const l of lines) { page.drawText(l, { x: M + 10, y, size: 10, font: fr }); y -= 13; }
    y -= 8;
  }
  return doc.save();
}
const commentsExport = {
  input: { multiple: true }, runLabel: 'Exporteren', lead: 'Maakt een overzicht van alle opmerkingen, markeringen en stempels, met de gemarkeerde tekst, auteur en datum.',
  options: (ctx) => [F.seg(ctx, 'fmt', 'Uitvoer', [['both', 'PDF + CSV'], ['pdf', 'PDF-overzicht'], ['csv', 'CSV (Excel)']], 'both')],
  summary: (ctx) => ctx.files.length ? `${ctx.files.length} bestand(en)` : 'Nog geen bestand gekozen',
  async run(ctx) {
    const outs = []; let total = 0; let firstList = null;
    for (const f of ctx.files) {
      ctx.progress(`${f.name}…`); const list = await collectComments(f); total += list.length; firstList = firstList || list;
      if (!list.length) continue;
      if (ctx.opts.fmt !== 'csv') outs.push({ name: `${baseName(f.name)}_opmerkingen.pdf`, data: await commentsPdf(f.name, list) });
      if (ctx.opts.fmt !== 'pdf') { const rows = [['Pagina', 'Soort', 'Auteur', 'Datum', 'Gemarkeerde tekst', 'Opmerking', 'Kleur'].map((h) => L(h, { Pagina: 'Page', Soort: 'Type', Auteur: 'Author', Datum: 'Date', 'Gemarkeerde tekst': 'Marked text', Opmerking: 'Comment', Kleur: 'Colour' }[h]))].concat(list.map((c) => [c.page, c.type, c.author, c.date, c.marked, c.text, c.color])); const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'); outs.push({ name: `${baseName(f.name)}_opmerkingen.csv`, data: new TextEncoder().encode('﻿' + csv) }); }
    }
    const view = firstList && firstList.length ? el('div', { class: 'tbl-wrap' }, el('table', { class: 'meta-table', id: 'cm-table' }, el('thead', null, el('tr', null, ['Pagina', 'Soort', 'Auteur', 'Tekst'].map((h) => el('th', null, h)))), el('tbody', null, firstList.slice(0, 200).map((c) => el('tr', null, el('td', null, String(c.page)), el('td', null, c.type), el('td', null, c.author), el('td', null, [c.marked && `"${c.marked}"`, c.text].filter(Boolean).join(' — '))))))) : null;
    return { title: total ? `${total} opmerking(en) gevonden` : 'Geen opmerkingen gevonden', outputs: outs, view, zipName: 'opmerkingen' };
  }
};

/* ================= Toegankelijkheid ================= */
async function accessCheck(f) {
  const doc = await loadPdf(f); const c = doc.context; const cat = doc.catalog; const pdf = await openPdfJs(f); const R = [];
  const add = (level, title, help) => R.push({ level, title, help });
  const info = c.lookup(c.trailerInfo.Info); const title = info instanceof PDFDict ? txt(info.lookup(N('Title'))) : '';
  const mark = cat.lookup(N('MarkInfo')); const tagged = mark instanceof PDFDict && String(mark.get(N('Marked'))) === 'true' && !!cat.get(N('StructTreeRoot'));
  add(tagged ? 'ok' : 'bad', tagged ? 'Het document is getagd (structuur aanwezig)' : 'Het document is niet getagd', tagged ? '' : 'Schermlezers kennen de leesvolgorde, koppen en tabellen niet. Maak de PDF opnieuw aan vanuit Word met "Toegankelijkheid/tags" aangevinkt.');
  const lang = txt(cat.lookup(N('Lang')));
  add(lang ? 'ok' : 'bad', lang ? `Documenttaal ingesteld (${lang})` : 'Geen documenttaal ingesteld', lang ? '' : 'Schermlezers weten niet in welke taal ze moeten voorlezen. Kan hieronder automatisch hersteld worden.');
  const vp = cat.lookup(N('ViewerPreferences')); const ddt = vp instanceof PDFDict && String(vp.get(N('DisplayDocTitle'))) === 'true';
  add(title ? (ddt ? 'ok' : 'warn') : 'bad', title ? (ddt ? `Titel: "${title}"` : `Titel aanwezig ("${title}"), maar de lezer toont de bestandsnaam`) : 'Geen documenttitel', title && ddt ? '' : 'Kan automatisch hersteld worden.');
  // tekst / scans
  let scanned = 0, noUni = 0; for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) { const tc = await (await pdf.getPage(i)).getTextContent(); const s = tc.items.map((x) => x.str).join(''); if (s.trim().length < 20) scanned++; if (/�/.test(s)) noUni++; }
  add(scanned ? 'bad' : 'ok', scanned ? `${scanned} pagina('s) zonder tekst (scan?)` : 'Alle pagina\'s bevatten echte tekst', scanned ? 'Gebruik "Tekst herkennen (OCR)" zodat de tekst voorgelezen en doorzocht kan worden.' : '');
  if (noUni) add('warn', `${noUni} pagina('s) met tekens die niet als tekst te herkennen zijn`, 'Sommige lettertypen missen een Unicode-tabel; kopiëren en voorlezen geeft onzin.');
  // lettertypen
  let notEmb = 0; walk(c, (o) => { const d = o instanceof PDFDict ? o : null; if (!d || nameStr(d.get(N('Type'))) !== 'Font') return; const st = nameStr(d.get(N('Subtype'))); if (['Type0', 'Type3'].includes(st)) return; const fd = d.lookup(N('FontDescriptor')); if (!(fd instanceof PDFDict) || !(fd.get(N('FontFile')) || fd.get(N('FontFile2')) || fd.get(N('FontFile3')))) notEmb++; });
  add(notEmb ? 'warn' : 'ok', notEmb ? `${notEmb} lettertype(n) niet ingesloten` : 'Alle lettertypen ingesloten', notEmb ? 'Op andere computers kan de tekst er anders uitzien. "PDF/A omzetten" sluit ze in.' : '');
  // bladwijzers
  const outl = await pdf.getOutline(); add(pdf.numPages > 9 && !(outl && outl.length) ? 'warn' : 'ok', outl && outl.length ? `${outl.length} bladwijzer(s) aanwezig` : pdf.numPages > 9 ? 'Geen bladwijzers bij een document van ' + plural(pdf.numPages) : 'Kort document: bladwijzers niet nodig', pdf.numPages > 9 && !(outl && outl.length) ? 'Gebruik "Bladwijzers" (bv. automatisch uit koppen) zodat lezers snel kunnen navigeren.' : '');
  // afbeeldingen met alternatieve tekst (alleen als getagd)
  if (tagged) { let fig = 0, alt = 0; walk(c, (o) => { if (o instanceof PDFDict && nameStr(o.get(N('S'))) === 'Figure') { fig++; if (o.get(N('Alt'))) alt++; } }); if (fig) add(alt === fig ? 'ok' : 'bad', `${alt} van ${fig} afbeelding(en) met alternatieve tekst`, alt === fig ? '' : 'Afbeeldingen zonder beschrijving zijn onzichtbaar voor schermlezers.'); }
  // formuliervelden met omschrijving
  try { const fields = doc.getForm().getFields(); if (fields.length) { const withTU = fields.filter((x) => x.acroField.dict.get(N('TU'))).length; add(withTU === fields.length ? 'ok' : 'warn', `${withTU} van ${fields.length} formulierveld(en) met omschrijving`, withTU === fields.length ? '' : 'Velden zonder omschrijving (tooltip) worden enkel met hun technische naam voorgelezen.'); } } catch {}
  // tabvolgorde
  const pagesWithAnn = doc.getPages().filter((p) => p.node.lookup(N('Annots')) instanceof PDFArray && p.node.lookup(N('Annots')).size()); const tabsOk = pagesWithAnn.every((p) => nameStr(p.node.get(N('Tabs'))) === 'S');
  if (pagesWithAnn.length) add(tabsOk ? 'ok' : 'warn', tabsOk ? 'Tabvolgorde volgt de structuur' : 'Tabvolgorde niet ingesteld', tabsOk ? '' : 'Kan automatisch hersteld worden.');
  // beveiliging
  if (f.encrypted) add('warn', 'Het document is beveiligd', 'Controleer dat "toegankelijkheid voor schermlezers" toegestaan is.');
  return { R, doc, title };
}
const accessibility = {
  runLabel: 'Controleren', lead: 'Controleert de belangrijkste punten voor toegankelijkheid (PDF/UA, WCAG): tags, taal, titel, echte tekst, lettertypen, bladwijzers, alternatieve tekst en formulieren.',
  options: (ctx) => [F.check(ctx, 'fix', 'Wat automatisch kan, meteen herstellen (titel, taal, tabvolgorde)', true), F.select(ctx, 'lang', 'Documenttaal (indien ontbrekend)', [['nl-BE', 'Nederlands (België)'], ['nl-NL', 'Nederlands (Nederland)'], ['fr-BE', 'Frans (België)'], ['en-GB', 'Engels'], ['de-DE', 'Duits']], 'nl-BE')],
  summary: (ctx) => first(ctx) ? first(ctx).name : 'Nog geen bestand gekozen',
  async run(ctx) {
    const f = first(ctx); const { R, doc, title } = await accessCheck(f); const outs = []; const fixed = [];
    if (ctx.opts.fix) {
      const c = doc.context; const cat = doc.catalog;
      if (!title) { let t = baseName(f.name); try { const pdf = await openPdfJs(f); const tc = await (await pdf.getPage(1)).getTextContent(); const big = tc.items.filter((x) => x.str.trim()).sort((a, b) => Math.hypot(b.transform[2], b.transform[3]) - Math.hypot(a.transform[2], a.transform[3]))[0]; if (big && big.str.trim().length > 3) t = big.str.trim().slice(0, 120); } catch {} doc.setTitle(t); fixed.push(`titel "${t}"`); }
      if (!cat.get(N('Lang'))) { cat.set(N('Lang'), PDFString.of(ctx.opts.lang)); fixed.push(`taal ${ctx.opts.lang}`); }
      let vp = cat.lookup(N('ViewerPreferences')); if (!(vp instanceof PDFDict)) { vp = c.obj({}); cat.set(N('ViewerPreferences'), vp); } if (String(vp.get(N('DisplayDocTitle'))) !== 'true') { vp.set(N('DisplayDocTitle'), PDFLib.PDFBool.True); fixed.push('titel tonen in de lezer'); }
      let tabs = 0; for (const p of doc.getPages()) if (p.node.lookup(N('Annots')) instanceof PDFArray && nameStr(p.node.get(N('Tabs'))) !== 'S') { p.node.set(N('Tabs'), N('S')); tabs++; } if (tabs) fixed.push('tabvolgorde');
      if (fixed.length) outs.push({ name: `${baseName(f.name)}_toegankelijk.pdf`, data: await save(doc) });
    }
    const score = R.filter((r) => r.level === 'ok').length;
    const view = el('ul', { class: 'acc-list', id: 'acc-list' }, R.map((r) => el('li', { class: 'acc-' + r.level }, el('span', { class: 'acc-ic', 'aria-hidden': 'true' }, r.level === 'ok' ? '✓' : r.level === 'warn' ? '!' : '✗'), el('div', null, el('strong', null, r.title), r.help ? el('div', { class: 'help' }, r.help) : null))));
    return { title: `${score} van ${R.length} controles in orde`, note: fixed.length ? 'Hersteld: ' + fixed.join(', ') + '. Tags en alternatieve teksten moeten in het bronbestand (bv. Word) aangemaakt worden.' : '', outputs: outs, view };
  }
};

/* ================= Batchverwerking ================= */
const STEPS = [
  ['scan-clean', 'Scan opschonen', () => import('./tools-ocr.js').then((m) => m.OCR['scan-clean'])],
  ['ocr', 'Tekst herkennen (OCR)', () => import('./tools-ocr.js').then((m) => m.OCR.ocr)],
  ['rotate-auto', 'Liggende pagina\'s rechtop zetten', null],
  ['compress', 'Comprimeren', () => import('./tools-optimize.js').then((m) => m.OPTIMIZE.compress)],
  ['remove-metadata', 'Metadata verwijderen', () => import('./tools-optimize.js').then((m) => m.OPTIMIZE['remove-metadata'])],
  ['sanitize', 'Verborgen inhoud verwijderen', async () => sanitize],
  ['page-numbers', 'Paginanummers', () => import('./tools-organize.js').then((m) => m.ORGANIZE['page-numbers'])],
  ['header-footer', 'Kop- en voettekst', () => import('./tools-optimize.js').then((m) => m.OPTIMIZE['header-footer'])],
  ['watermark', 'Watermerk', () => import('./tools-optimize.js').then((m) => m.OPTIMIZE.watermark)],
  ['pdfa', 'PDF/A omzetten', () => import('./tools-pdfa.js').then((m) => m.PDFA.pdfa)],
  ['protect', 'Wachtwoord instellen', () => import('./tools-optimize.js').then((m) => m.OPTIMIZE.protect)]
];
const batch = {
  input: { multiple: true }, runLabel: 'Batch starten', lead: 'Voer dezelfde bewerkingen in één keer uit op veel PDF\'s. De stappen gebeuren in de getoonde volgorde.',
  options: (ctx) => [
    el('span', { class: 'flabel' }, 'Stappen'),
    ...STEPS.map(([id, name]) => F.check(ctx, 'st_' + id, name, id === 'compress')),
    ctx.opts['st_watermark'] ? F.text(ctx, 'b_wm', 'Watermerktekst', 'VERTROUWELIJK') : null,
    ctx.opts['st_header-footer'] ? F.text(ctx, 'b_hf', 'Voettekst', '{bestand} — pagina {pagina} van {totaal}') : null,
    ctx.opts['st_protect'] ? F.text(ctx, 'b_pw', 'Wachtwoord', '', { type: 'password' }) : null,
    F.text(ctx, 'b_suffix', 'Achtervoegsel bestandsnaam', '_batch')
  ].filter(Boolean),
  onChange: (ctx, key) => { if (/^st_(watermark|header-footer|protect)$/.test(key)) ctx.refresh(); },
  summary: (ctx) => { const n = STEPS.filter(([id]) => ctx.opts['st_' + id]).length; return ctx.files.length ? [`${ctx.files.length} bestand(en)`, `${n} stap(pen)`] : 'Nog geen bestand gekozen'; },
  validate: (ctx) => { if (!STEPS.some(([id]) => ctx.opts['st_' + id])) return 'Kies minstens één stap.'; if (ctx.opts.st_protect && (!ctx.opts.b_pw || ctx.opts.b_pw.length < 4)) return 'Geef een wachtwoord van minstens 4 tekens.'; },
  async run(ctx) {
    const steps = STEPS.filter(([id]) => ctx.opts['st_' + id]); const outs = []; const log = [];
    for (const [fi, f0] of ctx.files.entries()) {
      let entry = f0; const did = [];
      for (const [id, name, load] of steps) {
        ctx.progress(`${fi + 1}/${ctx.files.length} · ${f0.name}: ${name}…`);
        if (id === 'rotate-auto') { const d = await loadPdf(entry); let n = 0; for (const p of d.getPages()) { const { width, height } = p.getSize(); const r = p.getRotation().angle % 180; const vw = r ? height : width, vh = r ? width : height; if (vw > vh * 1.05) { p.setRotation(PDFLib.degrees((p.getRotation().angle + 90) % 360)); n++; } } if (n) { entry = await asEntry(await save(d), entry); did.push(name); } continue; }
        const def = await load(); const sub = { files: [entry], opts: {}, progress: () => {}, changed: () => {}, refresh: () => {}, grid: null };
        try { def.options && def.options(sub); } catch {} // standaardwaarden invullen
        if (id === 'watermark') { sub.opts.kind = 'text'; sub.opts.text = ctx.opts.b_wm || 'VERTROUWELIJK'; }
        if (id === 'header-footer') { for (const k of ['hl', 'hc', 'hr', 'fl', 'fr']) sub.opts[k] = ''; sub.opts.fc = ctx.opts.b_hf || ''; }
        if (id === 'protect') { sub.opts.pw = sub.opts.pw2 = ctx.opts.b_pw; }
        if (id === 'sanitize') sub.opts.meta = true;
        const err = def.validate && def.validate(sub); if (err) { log.push(`${f0.name}: ${name} overgeslagen (${err})`); continue; }
        const res = await def.run(sub); const out = (res.outputs || []).find((o) => /\.pdf$/i.test(o.name));
        if (out) { entry = await asEntry(out.data, entry, id === 'protect' ? ctx.opts.b_pw : null); did.push(name); }
      }
      outs.push({ name: `${baseName(f0.name)}${ctx.opts.b_suffix || ''}.pdf`, data: entry.bytes });
      log.push(`${f0.name}: ${did.join(' → ') || 'geen wijzigingen'}`);
    }
    return { title: `${outs.length} bestand(en) verwerkt`, note: log.slice(0, 8).join(' · ') + (log.length > 8 ? ' …' : ''), outputs: outs, zipName: 'batch' };
  }
};
async function asEntry(bytes, prev, password = null) {
  const e = { id: prev.id, file: prev.file, name: prev.name, size: bytes.length, bytes, range: '', kind: 'pdf' };
  if (password) e.password = password; try { await probePdf(e, { askPw: false }); } catch {} if (password) e.password = password; return e;
}

export const MISC = { 'insert-pages': insertPages, 'page-size': pageSize, 'replace-images': replaceImages, layers, attachments, sanitize, 'comments-export': commentsExport, accessibility, batch };
