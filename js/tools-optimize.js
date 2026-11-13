// Optimaliseren en beveiligen
import { makeCanvas, canvasBlob, loadBitmap, el, F, PDFLib, loadPdf, parseRange, baseName, mm, drawTextAt, hexToRgb, visualBox, v2p, safeText, fmtBytes, readBytes, isImageFile, toast } from './core.js';

const { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, PDFRawStream, PDFNumber, PDFString, PDFHexString, StandardFonts, degrees, decodePDFRawStream } = PDFLib;
const N = (s) => PDFName.of(s);
const plural = (n) => `${n} pagina${n === 1 ? '' : "'s"}`;
const first = (ctx) => ctx.files[0];
const nameOf = (o) => (o instanceof PDFName ? o.decodeText() : null);

/* ---------- Comprimeren ---------- */
const PRESETS = { light: { q: 0.82, max: 3000, label: 'Licht' }, medium: { q: 0.7, max: 2000, label: 'Gemiddeld' }, strong: { q: 0.5, max: 1300, label: 'Sterk' } };
async function recompressImages(doc, preset, progress) {
  const ctx = doc.context; let done = 0, seen = 0, saved = 0;
  const objs = ctx.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && nameOf(o.dict.get(N('Subtype'))) === 'Image');
  for (const [ref, s] of objs) {
    seen++; progress && progress(`Afbeelding ${seen} van ${objs.length}…`);
    const d = s.dict;
    if (d.get(N('ImageMask')) || d.get(N('Decode')) || d.get(N('Mask'))) continue;
    const w = d.lookup(N('Width'), PDFNumber).asNumber(), h = d.lookup(N('Height'), PDFNumber).asNumber();
    if (w * h < 64 * 64) continue;
    const fl = d.lookup(N('Filter'));
    const filters = fl instanceof PDFArray ? fl.asArray().map((x) => nameOf(x instanceof PDFLib.PDFRef ? ctx.lookup(x) : x)) : [nameOf(fl)];
    const last = filters[filters.length - 1];
    const parms = d.lookup(N('DecodeParms')); const lastParms = parms instanceof PDFArray ? parms.lookup(parms.size() - 1) : parms;
    let cs = d.lookup(N('ColorSpace'));
    let comps = nameOf(cs) === 'DeviceRGB' ? 3 : nameOf(cs) === 'DeviceGray' ? 1 : 0;
    if (!comps && cs instanceof PDFArray && nameOf(cs.lookup(0)) === 'ICCBased') { const icc = cs.lookup(1); const n = icc && icc.dict && icc.dict.lookup(N('N')); comps = n && (n.asNumber() === 3 || n.asNumber() === 1) ? n.asNumber() : 0; }
    if (!comps) continue;
    const bpc = d.lookup(N('BitsPerComponent')); if (!bpc || bpc.asNumber() !== 8) continue;
    let bmp;
    try {
      if (last === 'DCTDecode') {
        let jpeg = s.contents;
        if (filters.length > 1) { // eerst de buitenste coderingen (bv. ASCII85) ontcijferen
          const td = ctx.obj({}); td.set(N('Filter'), ctx.obj(filters.slice(0, -1).map((x) => N(x))));
          jpeg = decodePDFRawStream(PDFRawStream.of(td, s.contents)).decode();
        }
        bmp = await loadBitmap(new Blob([jpeg], { type: 'image/jpeg' }));
      } else if (last === 'FlateDecode' && !(lastParms instanceof PDFDict)) {
        const raw = decodePDFRawStream(s).decode(); if (raw.length < w * h * comps) continue;
        const id = new ImageData(w, h); const px = id.data;
        for (let i = 0, j = 0; i < w * h; i++, j += comps) { const k = i * 4; if (comps === 3) { px[k] = raw[j]; px[k + 1] = raw[j + 1]; px[k + 2] = raw[j + 2]; } else { px[k] = px[k + 1] = px[k + 2] = raw[j]; } px[k + 3] = 255; }
        { const tc = makeCanvas(w, h); tc.getContext('2d').putImageData(id, 0, 0); bmp = tc; }
      } else continue;
    } catch { continue; }
    const sc = Math.min(1, preset.max / Math.max(w, h));
    const nw = Math.max(1, Math.round(w * sc)), nh = Math.max(1, Math.round(h * sc));
    const cv = makeCanvas(nw, nh); const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, nw, nh); g.drawImage(bmp, 0, 0, nw, nh); bmp.close && bmp.close();
    const jpg = new Uint8Array(await (await canvasBlob(cv, 'image/jpeg', preset.q)).arrayBuffer());
    if (jpg.length >= s.contents.length * 0.92) continue;
    const nd = ctx.obj({ Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' });
    for (const k of ['SMask', 'Intent', 'Interpolate', 'OC']) { const v = d.get(N(k)); if (v) nd.set(N(k), v); }
    ctx.assign(ref, PDFRawStream.of(nd, jpg));
    saved += s.contents.length - jpg.length; done++;
  }
  return { done, seen: objs.length, saved };
}
const compress = {
  runLabel: 'Comprimeren', lead: 'Verkleint afbeeldingen en optimaliseert de bestandsstructuur. Tekst blijft scherp en doorzoekbaar.',
  options: (ctx) => [
    F.seg(ctx, 'level', 'Compressie', [['light', 'Licht — beste kwaliteit'], ['medium', 'Gemiddeld — aanbevolen'], ['strong', 'Sterk — kleinste bestand']], 'medium'),
    el('div', { class: 'help' }, 'Afbeeldingen worden opnieuw opgeslagen als JPEG en zo nodig verkleind. Pagina-inhoud, tekst en formulieren blijven ongewijzigd.')
  ],
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f);
    const r = await recompressImages(doc, PRESETS[ctx.opts.level], ctx.progress);
    ctx.progress('Opslaan…');
    const out = await doc.save({ useObjectStreams: true });
    const before = f.size;
    if (out.length >= before) return { title: 'Niet verder te verkleinen', note: `Dit bestand is al optimaal (${fmtBytes(before)}). U kunt het origineel houden.`, outputs: [] };
    const pct = Math.round((1 - out.length / before) * 100);
    return { title: `${fmtBytes(before)} → ${fmtBytes(out.length)} (−${pct}%)`, note: `${r.done} van ${r.seen} afbeeldingen opnieuw gecomprimeerd.`, outputs: [{ name: `${baseName(f.name)}_gecomprimeerd.pdf`, data: out }] };
  }
};

/* ---------- Metadata ---------- */
const INFO_LABELS = { Title: 'Titel', Author: 'Auteur', Subject: 'Onderwerp', Keywords: 'Trefwoorden', Creator: 'Gemaakt met', Producer: 'PDF-producent', CreationDate: 'Aanmaakdatum', ModDate: 'Wijzigingsdatum', Trapped: 'Trapped' };
function pdfDate(s) { const m = /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(s); return m ? `${m[3] || '01'}-${m[2] || '01'}-${m[1]}${m[4] ? ` ${m[4]}:${m[5] || '00'}` : ''}` : s; }
function valText(v) { try { if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText(); if (v instanceof PDFName) return v.decodeText(); return String(v); } catch { return String(v); } }
function lookupMaybe(dict, key, type) { try { return dict.lookupMaybe(N(key), type); } catch { return undefined; } }
export function inspectMeta(doc) {
  const rows = []; const cat = doc.catalog;
  const infoRef = doc.context.trailerInfo.Info; const info = infoRef ? doc.context.lookup(infoRef) : null;
  if (info instanceof PDFDict) for (const [k, v] of info.entries()) {
    const key = k.decodeText(); let t = valText(v); if (/Date$/.test(key)) t = pdfDate(t);
    rows.push({ id: 'info:' + key, label: INFO_LABELS[key] || key, value: t, kind: /Date$/.test(key) ? 'Datums' : ['Creator', 'Producer'].includes(key) ? 'Software' : 'Documenteigenschap' });
  }
  if (cat.get(N('Metadata'))) rows.push({ id: 'xmp', label: 'XMP-metadata', value: 'Uitgebreide eigenschappen en bewerkingsgeschiedenis', kind: 'Verborgen' });
  const pages = doc.getPages(); let pm = 0, annots = 0; const types = new Set();
  if (cat.get(N('PieceInfo'))) pm++;
  for (const p of pages) {
    if (p.node.get(N('Metadata')) || p.node.get(N('PieceInfo'))) pm++;
    const a = p.node.Annots(); if (a) for (let i = 0; i < a.size(); i++) { const d = a.lookup(i); const st = d instanceof PDFDict ? nameOf(d.lookup(N('Subtype'))) : null; if (st && !['Link', 'Widget', 'Popup'].includes(st)) { annots++; types.add(st); } }
  }
  if (pm) rows.push({ id: 'pagemeta', label: 'Paginametadata', value: `Op ${pm} plaats(en) — o.a. bewerkingsinfo van de maker-software`, kind: 'Verborgen' });
  const names = lookupMaybe(cat, 'Names', PDFDict);
  if (names && names.get(N('EmbeddedFiles'))) rows.push({ id: 'files', label: 'Ingesloten bestanden', value: 'Bijlagen die in de PDF verstopt zitten', kind: 'Verborgen' });
  const oa = lookupMaybe(cat, 'OpenAction', PDFDict);
  if ((names && names.get(N('JavaScript'))) || cat.get(N('AA')) || (oa && nameOf(oa.lookup(N('S'))) === 'JavaScript')) rows.push({ id: 'js', label: 'JavaScript', value: 'Scripts die bij openen of acties uitgevoerd worden', kind: 'Verborgen' });
  if (annots) rows.push({ id: 'annots', label: 'Opmerkingen en markeringen', value: `${annots} stuks (${[...types].join(', ')})`, kind: 'Verborgen' });
  if (doc.context.trailerInfo.ID) rows.push({ id: 'docid', label: 'Document-ID', value: 'Unieke code waarmee versies te herkennen zijn', kind: 'Verborgen' });
  return rows;
}
export function stripMeta(doc, ids) {
  const want = (id) => !ids || ids.has(id); const cat = doc.context.lookup(doc.context.trailerInfo.Root); const ctx = doc.context;
  const infoRef = ctx.trailerInfo.Info; const info = infoRef ? ctx.lookup(infoRef) : null;
  if (info instanceof PDFDict) {
    for (const [k] of info.entries()) if (want('info:' + k.decodeText())) info.delete(k);
    if (!info.entries().length) ctx.trailerInfo.Info = undefined;
  }
  if (want('xmp')) cat.delete(N('Metadata'));
  if (want('pagemeta')) { cat.delete(N('PieceInfo')); for (const p of doc.getPages()) { p.node.delete(N('Metadata')); p.node.delete(N('PieceInfo')); } }
  const names = lookupMaybe(cat, 'Names', PDFDict);
  if (want('files') && names) names.delete(N('EmbeddedFiles'));
  if (want('js')) {
    if (names) names.delete(N('JavaScript')); cat.delete(N('AA'));
    const oa = lookupMaybe(cat, 'OpenAction', PDFDict); if (oa && nameOf(oa.lookup(N('S'))) === 'JavaScript') cat.delete(N('OpenAction'));
    for (const p of doc.getPages()) p.node.delete(N('AA'));
  }
  if (want('annots')) for (const p of doc.getPages()) {
    const a = p.node.Annots(); if (!a) continue; const keep = [];
    for (let i = 0; i < a.size(); i++) { const d = a.lookup(i); const st = d instanceof PDFDict ? nameOf(d.lookup(N('Subtype'))) : null; if (!st || ['Link', 'Widget'].includes(st)) keep.push(a.get(i)); }
    p.node.set(N('Annots'), ctx.obj(keep));
  }
  if (want('docid')) ctx.trailerInfo.ID = undefined;
}
const removeMetadata = {
  runLabel: 'Metadata wissen', lead: 'Bekijk wat er in de PDF verborgen zit en wis wat niet gedeeld mag worden.',
  async onFiles(ctx) {
    ctx.meta = null; const f = first(ctx); if (!f) return;
    const doc = await loadPdf(f); ctx.meta = inspectMeta(doc); ctx.opts.rm = new Set(ctx.meta.map((r) => r.id));
  },
  renderMain(ctx, box) {
    box.innerHTML = ''; if (!ctx.meta) return;
    if (!ctx.meta.length) { box.append(el('div', { class: 'result' }, el('h3', null, 'Geen metadata gevonden'), el('div', { class: 'note' }, 'Dit bestand bevat geen documenteigenschappen of verborgen gegevens die we kunnen wissen.'))); return; }
    const tbl = el('table', { class: 'mtable', id: 'meta-table' },
      el('thead', null, el('tr', null, el('th', { style: { width: '44px' } }, el('span', { class: 'sr' }, 'Wissen')), el('th', null, 'Veld'), el('th', null, 'Gevonden waarde'), el('th', null, 'Soort'))),
      el('tbody', null, ctx.meta.map((r) => {
        const cb = el('input', { type: 'checkbox', 'aria-label': r.label + ' wissen', 'data-id': r.id, onchange: (e) => { e.target.checked ? ctx.opts.rm.add(r.id) : ctx.opts.rm.delete(r.id); ctx.changed('rm'); } });
        cb.checked = ctx.opts.rm.has(r.id);
        return el('tr', null, el('td', null, cb), el('td', { class: 'b' }, r.label), el('td', { class: 'v', title: r.value }, r.value || '—'), el('td', { class: 'k' }, r.kind));
      })));
    box.append(tbl);
  },
  options: (ctx) => {
    if (!ctx.meta) return el('div', { class: 'help' }, 'Kies een PDF om te zien welke metadata erin zit.');
    const set = (fn) => { ctx.opts.rm = new Set(ctx.meta.filter(fn).map((r) => r.id)); ctx.refresh(); };
    return [el('div', { class: 'seg' },
      el('button', { type: 'button', onclick: () => set(() => true) }, 'Alles selecteren (aanbevolen)'),
      el('button', { type: 'button', onclick: () => set((r) => r.id.startsWith('info:')) }, 'Alleen documenteigenschappen'),
      el('button', { type: 'button', onclick: () => set((r) => !r.id.startsWith('info:')) }, 'Alleen verborgen inhoud')),
    el('div', { class: 'help' }, 'Pagina-inhoud, bladwijzers en formuliervelden blijven ongewijzigd. Het resultaat wordt als nieuw bestand opgeslagen.')];
  },
  summary: (ctx) => ctx.meta ? `${ctx.opts.rm.size} van ${ctx.meta.length} onderdelen geselecteerd` : 'Nog geen bestand gekozen',
  validate: (ctx) => ctx.opts.rm && ctx.opts.rm.size ? null : 'Selecteer minstens één onderdeel om te wissen.',
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); stripMeta(doc, ctx.opts.rm);
    const out = await doc.save({ useObjectStreams: true });
    const left = inspectMeta(await PDFDocument.load(out, { updateMetadata: false }));
    return { title: `${ctx.opts.rm.size} onderdelen gewist`, note: left.length ? `Nog aanwezig (niet geselecteerd): ${left.map((r) => r.label).join(', ')}.` : 'Er is geen metadata meer aanwezig.', outputs: [{ name: `${baseName(f.name)}_zonder-metadata.pdf`, data: out }] };
  }
};

/* ---------- Wachtwoord instellen ---------- */
function randomPw() { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join(''); }
const protect = {
  runLabel: 'Beveiligen', lead: 'Versleutel de PDF met AES-256. Zonder het wachtwoord kan niemand het bestand openen.',
  options: (ctx) => [
    F.text(ctx, 'pw', 'Wachtwoord om te openen', '', { type: 'password' }),
    F.text(ctx, 'pw2', 'Herhaal wachtwoord', '', { type: 'password' }),
    F.text(ctx, 'owner', 'Eigenaarswachtwoord (optioneel)', '', { type: 'password', help: 'Nodig om de beperkingen hieronder later op te heffen. Leeg = willekeurig, sterk wachtwoord.' }),
    el('span', { class: 'flabel' }, 'Toestaan voor wie het bestand opent'),
    F.check(ctx, 'pPrint', 'Afdrukken', true), F.check(ctx, 'pCopy', 'Tekst en afbeeldingen kopiëren', true),
    F.check(ctx, 'pModify', 'Inhoud wijzigen', false), F.check(ctx, 'pAnnot', 'Opmerkingen en formulieren invullen', true)
  ],
  validate: (ctx) => { const o = ctx.opts; if (!o.pw) return 'Geef een wachtwoord op.'; if (o.pw.length < 4) return 'Gebruik minstens 4 tekens.'; if (o.pw !== o.pw2) return 'De wachtwoorden komen niet overeen.'; },
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const o = ctx.opts;
    doc.encrypt({ userPassword: o.pw, ownerPassword: o.owner || randomPw(), algorithm: 'AES-256',
      permissions: { printing: o.pPrint ? 'highResolution' : false, copying: !!o.pCopy, contentAccessibility: true, modifying: !!o.pModify, annotating: !!o.pAnnot, fillingForms: !!o.pAnnot, documentAssembly: !!o.pModify } });
    return { title: 'PDF beveiligd met AES-256', note: 'Bewaar het wachtwoord goed: zonder kan het bestand niet meer geopend worden.', outputs: [{ name: `${baseName(f.name)}_beveiligd.pdf`, data: await doc.save() }] };
  }
};

/* ---------- Wachtwoord verwijderen ---------- */
const unlock = {
  runLabel: 'Beveiliging verwijderen', lead: 'Kies een beveiligde PDF en geef het wachtwoord in. U krijgt een onbeveiligde kopie.',
  summary: (ctx) => first(ctx) ? (first(ctx).encrypted ? 'Beveiligd bestand — wachtwoord ok' : 'Dit bestand is niet beveiligd') : 'Nog geen bestand gekozen',
  validate: (ctx) => first(ctx).encrypted ? null : 'Dit bestand is niet beveiligd; er is niets te verwijderen.',
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f);
    const bytes = await doc.save();
    let chk; try { chk = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); } catch {}
    if (chk && chk.isEncrypted) throw new Error('De versleuteling kon niet verwijderd worden.');
    return { title: 'Beveiliging verwijderd', outputs: [{ name: `${baseName(f.name)}_ontgrendeld.pdf`, data: bytes }] };
  }
};

/* ---------- Watermerk ---------- */
async function stampWatermark(ctx, doc, onlyIdx) {
  const o = ctx.opts; const pages = doc.getPages();
  const target = parseRange(o.range, pages.length) || pages.map((_, i) => i);
  let font, img;
  if (o.kind === 'image') {
    if (!ctx.wmImage) throw new Error('Kies eerst een afbeelding voor het watermerk.');
    img = ctx.wmImage.type === 'png' ? await doc.embedPng(ctx.wmImage.bytes) : await doc.embedJpg(ctx.wmImage.bytes);
  } else font = await doc.embedFont(StandardFonts[o.font] || StandardFonts.HelveticaBold);
  const color = hexToRgb(o.color || '#1B93A5'); const opacity = (+o.opacity || 25) / 100;
  for (const i of target) {
    if (onlyIdx != null && i !== onlyIdx) continue;
    const p = pages[i]; const b = visualBox(p);
    const th = (o.angle === 'diag' ? Math.atan2(b.VH, b.VW) * 180 / Math.PI : +o.angle || 0); const rad = th * Math.PI / 180;
    let w, h, drawAt;
    if (img) {
      w = b.VW * (+o.scale || 50) / 100; h = w * img.height / img.width;
      drawAt = (s) => p.drawImage(img, { x: s.x, y: s.y, width: w, height: h, opacity, rotate: degrees(th + b.r) });
    } else {
      const text = safeText(font, o.text || ' '); const size = +o.size || 60; w = font.widthOfTextAtSize(text, size); h = size * 0.72;
      drawAt = (s) => p.drawText(text, { x: s.x, y: s.y, size, font, color, opacity, rotate: degrees(th + b.r) });
    }
    const centers = [];
    if (o.layout === 'tile') {
      const dx = w * Math.abs(Math.cos(rad)) + h + 70, dy = w * Math.abs(Math.sin(rad)) + h + 90;
      for (let y = dy / 2, row = 0; y < b.VH + dy; y += dy, row++) for (let x = (row % 2 ? dx / 2 : 0); x < b.VW + dx; x += dx) centers.push([x, y]);
    } else centers.push([b.VW / 2, o.layout === 'top' ? b.VH - h - 40 : o.layout === 'bottom' ? h + 40 : b.VH / 2]);
    for (const [cx, cy] of centers) {
      const sx = cx - (w / 2) * Math.cos(rad) + (h / 2) * Math.sin(rad), sy = cy - (w / 2) * Math.sin(rad) - (h / 2) * Math.cos(rad);
      drawAt(v2p(b, sx, sy));
    }
  }
  return target;
}
const watermark = {
  runLabel: 'Watermerk toevoegen', lead: 'Plaats tekst zoals "VERTROUWELIJK" of een logo over de pagina\'s.',
  options: (ctx) => {
    const box = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    const imgIn = el('input', { type: 'file', accept: 'image/png,image/jpeg', id: 'wm-img', onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return; const bytes = await readBytes(f);
      ctx.wmImage = { bytes, type: /png/i.test(f.type) || /\.png$/i.test(f.name) ? 'png' : 'jpg', name: f.name }; ctx.changed('img');
    } });
    const draw = () => box.replaceChildren(...[
      F.seg(ctx, 'kind', 'Soort', [['text', 'Tekst'], ['image', 'Afbeelding']], 'text', { horizontal: true }),
      ...(ctx.opts.kind === 'image'
        ? [el('div', { class: 'field' }, el('label', { for: 'wm-img' }, 'Afbeelding (PNG of JPG)'), imgIn, ctx.wmImage ? el('div', { class: 'help' }, 'Gekozen: ' + ctx.wmImage.name) : null),
          F.range(ctx, 'scale', 'Breedte (% van pagina)', 50, { min: 5, max: 100, fmt: (v) => v + '%' })]
        : [F.text(ctx, 'text', 'Tekst', 'VERTROUWELIJK'),
          el('div', { class: 'row2' }, F.number(ctx, 'size', 'Grootte (pt)', 60, { min: 6, max: 300 }), F.color(ctx, 'color', 'Kleur', '#1B93A5')),
          F.select(ctx, 'font', 'Lettertype', [['HelveticaBold', 'Helvetica vet'], ['Helvetica', 'Helvetica'], ['TimesRomanBold', 'Times vet'], ['CourierBold', 'Courier vet']], 'HelveticaBold')]),
      F.range(ctx, 'opacity', 'Dekking', 25, { min: 5, max: 100, fmt: (v) => v + '%' }),
      F.select(ctx, 'angle', 'Hoek', [['diag', 'Diagonaal'], ['0', 'Horizontaal'], ['45', '45°'], ['90', 'Verticaal']], 'diag'),
      F.select(ctx, 'layout', 'Plaatsing', [['center', 'Midden van de pagina'], ['tile', 'Herhaald over de hele pagina'], ['top', 'Bovenaan'], ['bottom', 'Onderaan']], 'center'),
      F.text(ctx, 'range', "Pagina's", '', { placeholder: 'alle' })].filter(Boolean));
    ctx.redrawOpts = draw; draw(); return box;
  },
  onChange: (ctx, k) => { if ((k === 'kind' || k === 'img') && ctx.redrawOpts) ctx.redrawOpts(); },
  validate: (ctx) => { if (ctx.opts.kind === 'image' && !ctx.wmImage) return 'Kies een afbeelding.'; if (ctx.opts.kind !== 'image' && !ctx.opts.text.trim()) return 'Geef een tekst op.'; try { parseRange(ctx.opts.range, first(ctx).pages); } catch (e) { return e.message; } },
  async preview(ctx) {
    if (ctx.opts.kind === 'image' && !ctx.wmImage) return null;
    const f = first(ctx); const src = await loadPdf(f); let idx = 0; try { idx = (parseRange(ctx.opts.range, f.pages) || [0])[0]; } catch {}
    await stampWatermark(ctx, src, idx); const d = await PDFDocument.create(); d.addPage((await d.copyPages(src, [idx]))[0]); return d.save();
  },
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const t = await stampWatermark(ctx, doc);
    return { title: `Watermerk op ${plural(t.length)}`, outputs: [{ name: `${baseName(f.name)}_watermerk.pdf`, data: await doc.save({ useObjectStreams: true }) }] };
  }
};

/* ---------- Platmaken ---------- */
function flattenAnnots(doc, page) {
  const ctx = doc.context; const a = page.node.Annots(); if (!a) return 0; const keep = []; let n = 0;
  for (let i = 0; i < a.size(); i++) {
    const ref = a.get(i); const d = a.lookup(i); if (!(d instanceof PDFDict)) continue;
    const st = nameOf(d.lookup(N('Subtype')));
    if (st === 'Link' || st === 'Widget') { keep.push(ref); continue; }
    if (st === 'Popup') continue;
    const ap = d.lookupMaybe(N('AP'), PDFDict); if (!ap) continue;
    let nRef = ap.get(N('N')); let s = ap.lookup(N('N'));
    if (s instanceof PDFDict && !(s instanceof PDFStream)) { const as = d.lookupMaybe(N('AS'), PDFName); if (!as) continue; nRef = s.get(as); s = s.lookup(as); }
    if (!(s instanceof PDFStream)) continue;
    const r = d.lookup(N('Rect'), PDFArray).asArray().map((x) => x.asNumber()); const bb = s.dict.lookup(N('BBox'), PDFArray).asArray().map((x) => x.asNumber());
    const [rx1, ry1, rx2, ry2] = [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];
    const bw = (bb[2] - bb[0]) || 1, bh = (bb[3] - bb[1]) || 1; const sx = (rx2 - rx1) / bw, sy = (ry2 - ry1) / bh;
    if (!(nRef instanceof PDFLib.PDFRef)) nRef = ctx.register(s);
    const nm = page.node.newXObject('FlatA', nRef);
    page.pushOperators(PDFLib.pushGraphicsState(), PDFLib.concatTransformationMatrix(sx, 0, 0, sy, rx1 - bb[0] * sx, ry1 - bb[1] * sy), PDFLib.drawObject(nm), PDFLib.popGraphicsState());
    n++;
  }
  page.node.set(N('Annots'), ctx.obj(keep));
  return n;
}
const flatten = {
  runLabel: 'Platmaken', lead: 'Zet ingevulde formuliervelden en opmerkingen vast in de pagina, zodat ze niet meer te wijzigen zijn.',
  options: (ctx) => [F.check(ctx, 'forms', 'Formuliervelden platmaken', true), F.check(ctx, 'annots', 'Opmerkingen en markeringen platmaken', true)],
  validate: (ctx) => ctx.opts.forms || ctx.opts.annots ? null : 'Kies minstens één optie.',
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); let nf = 0, na = 0;
    if (ctx.opts.forms) { const form = doc.getForm(); nf = form.getFields().length; if (nf) form.flatten(); }
    if (ctx.opts.annots) for (const p of doc.getPages()) na += flattenAnnots(doc, p);
    return { title: nf || na ? 'Platgemaakt' : 'Niets om plat te maken', note: `${nf} formulierveld(en) en ${na} opmerking(en) vastgezet.`, outputs: nf || na ? [{ name: `${baseName(f.name)}_plat.pdf`, data: await doc.save({ useObjectStreams: true }) }] : [] };
  }
};

/* ---------- Kop- en voettekst ---------- */
const SLOTS = [['hl', 'Kop links', 0], ['hc', 'Kop midden', 1], ['hr', 'Kop rechts', 2], ['fl', 'Voet links', 6], ['fc', 'Voet midden', 7], ['fr', 'Voet rechts', 8]];
async function stampHF(ctx, doc, file, onlyIdx) {
  const o = ctx.opts; const font = await doc.embedFont(StandardFonts[o.font] || StandardFonts.Helvetica);
  const pages = doc.getPages(); let target = parseRange(o.range, pages.length) || pages.map((_, i) => i); if (o.skipFirst) target = target.filter((i) => i !== 0);
  const d = new Date(); const datum = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  for (const i of target) {
    if (onlyIdx != null && i !== onlyIdx) continue;
    for (const [k, , pos] of SLOTS) {
      const t = (o[k] || '').trim(); if (!t) continue;
      const txt = t.replace(/\{pagina\}/gi, i + 1).replace(/\{totaal\}/gi, pages.length).replace(/\{datum\}/gi, datum).replace(/\{bestand\}/gi, baseName(file.name));
      drawTextAt(pages[i], txt, { font, size: +o.size || 9, pos, margin: mm(+o.margin || 10), color: hexToRgb(o.color || '#000000') });
    }
  }
  return target;
}
const headerFooter = {
  runLabel: 'Kop- en voettekst toevoegen', lead: 'Gebruik {pagina}, {totaal}, {datum} en {bestand} als variabelen.',
  options: (ctx) => [
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, SLOTS.map(([k, l]) => F.text(ctx, k, l, k === 'fr' ? 'Pagina {pagina} van {totaal}' : k === 'fl' ? '{bestand}' : ''))),
    el('div', { class: 'row2' }, F.select(ctx, 'font', 'Lettertype', [['Helvetica', 'Helvetica'], ['HelveticaBold', 'Helvetica vet'], ['TimesRoman', 'Times'], ['Courier', 'Courier']], 'Helvetica'),
      F.number(ctx, 'size', 'Grootte (pt)', 9, { min: 4, max: 48 }), F.number(ctx, 'margin', 'Marge (mm)', 10, { min: 0, step: 0.5 }), F.color(ctx, 'color', 'Kleur', '#004974')),
    F.text(ctx, 'range', "Pagina's", '', { placeholder: 'alle' }), F.check(ctx, 'skipFirst', 'Niet op de eerste pagina', false)
  ],
  validate: (ctx) => { if (!SLOTS.some(([k]) => (ctx.opts[k] || '').trim())) return 'Vul minstens één tekstvak in.'; try { parseRange(ctx.opts.range, first(ctx).pages); } catch (e) { return e.message; } },
  async preview(ctx) {
    const f = first(ctx); const src = await loadPdf(f);
    let t = []; try { t = parseRange(ctx.opts.range, f.pages) || Array.from({ length: f.pages }, (_, i) => i); } catch {}
    if (ctx.opts.skipFirst) t = t.filter((i) => i !== 0); const idx = t[0] ?? 0;
    await stampHF(ctx, src, f, idx); const d = await PDFDocument.create(); d.addPage((await d.copyPages(src, [idx]))[0]); return d.save();
  },
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const t = await stampHF(ctx, doc, f);
    return { title: `Kop- en voettekst op ${plural(t.length)}`, outputs: [{ name: `${baseName(f.name)}_kop-voet.pdf`, data: await doc.save({ useObjectStreams: true }) }] };
  }
};

export const OPTIMIZE = { compress, 'remove-metadata': removeMetadata, protect, unlock, watermark, flatten, 'header-footer': headerFooter };
