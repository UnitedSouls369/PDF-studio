// Converteren en analyseren
import { makeCanvas, canvasBlob, loadBitmap, bmpW, bmpH, el, F, PDFLib, newDoc, parseRange, baseName, mm, openPdfJs, renderPage } from './core.js';

const plural = (n) => `${n} pagina${n === 1 ? '' : "'s"}`;
const first = (ctx) => ctx.files[0];

/* ---------- Afbeeldingen naar PDF ---------- */
function jpegOrientation(b) {
  if (b[0] !== 0xFF || b[1] !== 0xD8) return 1;
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xFF) return 1;
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const t = i + 10; const le = b[t] === 0x49;
      const r16 = (o) => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
      const r32 = (o) => le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
      const ifd = t + r32(t + 4); const n = r16(ifd);
      for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (r16(e) === 0x0112) return r16(e + 8); }
      return 1;
    }
    if (m === 0xDA) return 1;
    i += 2 + len;
  }
  return 1;
}
async function toEmbeddable(entry) {
  const b = entry.bytes; const isJpg = b[0] === 0xFF && b[1] === 0xD8; const isPng = b[0] === 0x89 && b[1] === 0x50;
  if (isJpg && jpegOrientation(b) === 1) return { kind: 'jpg', bytes: b };
  if (isPng) return { kind: 'png', bytes: b };
  // overige formaten (webp, gif, bmp) of gedraaide JPEG: via canvas
  const bmp = await loadBitmap(new Blob([b], { type: entry.file.type || 'image/*' }));
  const c = makeCanvas(bmpW(bmp), bmpH(bmp)); const g = c.getContext('2d');
  if (isJpg) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(bmp, 0, 0);
  const blob = await canvasBlob(c, isJpg ? 'image/jpeg' : 'image/png', 0.92);
  return { kind: isJpg ? 'jpg' : 'png', bytes: new Uint8Array(await blob.arrayBuffer()) };
}
const SIZES = { a4: [595.28, 841.89], letter: [612, 792], a3: [841.89, 1190.55] };
const imagesToPdf = {
  input: { kind: 'image', multiple: true }, runLabel: 'PDF maken', lead: 'Voeg afbeeldingen toe en zet ze in de juiste volgorde. Elke afbeelding wordt één pagina.',
  options: (ctx) => [
    F.select(ctx, 'size', 'Paginaformaat', [['a4', 'A4'], ['letter', 'Letter'], ['a3', 'A3'], ['fit', 'Zelfde als afbeelding']], 'a4'),
    F.seg(ctx, 'orient', 'Richting', [['auto', 'Automatisch'], ['portrait', 'Staand'], ['landscape', 'Liggend']], 'auto', { horizontal: true }),
    F.select(ctx, 'margin', 'Marge', [['0', 'Geen'], ['10', 'Klein (10 mm)'], ['20', 'Groot (20 mm)']], '10'),
    F.text(ctx, 'outName', 'Naam van het resultaat', 'Afbeeldingen.pdf')
  ],
  summary: (ctx) => ctx.files.length ? `${ctx.files.length} afbeelding${ctx.files.length > 1 ? 'en' : ''} → ${plural(ctx.files.length)}` : 'Nog geen afbeelding gekozen',
  async run(ctx) {
    const doc = await newDoc(); const o = ctx.opts; const m = mm(+o.margin || 0);
    for (const [i, f] of ctx.files.entries()) {
      ctx.progress(`Afbeelding ${i + 1} van ${ctx.files.length}…`);
      const e = await toEmbeddable(f); const img = e.kind === 'jpg' ? await doc.embedJpg(e.bytes) : await doc.embedPng(e.bytes);
      let pw, ph;
      if (o.size === 'fit') { pw = img.width * 0.75 + 2 * m; ph = img.height * 0.75 + 2 * m; }
      else {
        [pw, ph] = SIZES[o.size];
        const land = o.orient === 'landscape' || (o.orient === 'auto' && img.width > img.height);
        if (land) [pw, ph] = [ph, pw];
      }
      const page = doc.addPage([pw, ph]);
      const s = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
      const w = img.width * s, h = img.height * s;
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    let name = (o.outName || 'Afbeeldingen.pdf').trim(); if (!/\.pdf$/i.test(name)) name += '.pdf';
    return { title: `PDF gemaakt: ${plural(doc.getPageCount())}`, outputs: [{ name, data: await doc.save({ useObjectStreams: true }) }] };
  }
};

/* ---------- PDF naar afbeeldingen ---------- */
const pdfToImages = {
  runLabel: 'Afbeeldingen maken', lead: 'Elke pagina wordt een afbeelding. Meerdere pagina\'s komen samen in één ZIP.',
  options: (ctx) => [
    F.seg(ctx, 'fmt', 'Formaat', [['png', 'PNG (scherp)'], ['jpg', 'JPG (kleiner)']], 'png', { horizontal: true }),
    F.select(ctx, 'dpi', 'Resolutie', [['72', '72 dpi — scherm'], ['150', '150 dpi — standaard'], ['300', '300 dpi — afdrukken']], '150'),
    F.text(ctx, 'range', "Pagina's", '', { placeholder: 'alle' })
  ],
  summary: (ctx) => { const f = first(ctx); if (!f) return 'Nog geen bestand gekozen'; try { const r = parseRange(ctx.opts.range, f.pages); return `${r ? r.length : f.pages} afbeelding(en)`; } catch { return plural(f.pages); } },
  validate: (ctx) => { try { parseRange(ctx.opts.range, first(ctx).pages); } catch (e) { return e.message; } },
  async run(ctx) {
    const f = first(ctx); const pdf = await openPdfJs(f); const o = ctx.opts;
    const idx = parseRange(o.range, f.pages) || Array.from({ length: f.pages }, (_, i) => i);
    const outs = []; const pad = String(f.pages).length;
    for (const [k, i] of idx.entries()) {
      ctx.progress(`Pagina ${k + 1} van ${idx.length}…`);
      const c = await renderPage(pdf, i + 1, { scale: (+o.dpi) / 72 });
      let src = c;
      if (o.fmt === 'jpg') { src = document.createElement('canvas'); src.width = c.width; src.height = c.height; const x = src.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, src.width, src.height); x.drawImage(c, 0, 0); }
      const blob = await new Promise((res) => src.toBlob(res, o.fmt === 'jpg' ? 'image/jpeg' : 'image/png', 0.9));
      outs.push({ name: `${baseName(f.name)}_p${String(i + 1).padStart(pad, '0')}.${o.fmt}`, data: new Uint8Array(await blob.arrayBuffer()) });
      c.width = c.height = 0;
    }
    return { title: `${outs.length} afbeelding${outs.length > 1 ? 'en' : ''} gemaakt`, outputs: outs, zipName: baseName(f.name) + '_afbeeldingen' };
  }
};

/* ---------- Tekst uit PDF ---------- */
async function pageTexts(entry, progress) {
  const pdf = await openPdfJs(entry); const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    progress && progress(`${entry.name}: pagina ${i} van ${pdf.numPages}…`);
    const tc = await (await pdf.getPage(i)).getTextContent();
    let s = ''; for (const it of tc.items) { if (!('str' in it)) continue; s += it.str; s += it.hasEOL ? '\n' : (it.str && !/\s$/.test(it.str) ? ' ' : ''); }
    out.push(s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim());
  }
  return out;
}

/* ---------- Vergelijken ---------- */
function diffWords(a, b) { // LCS op woordniveau -> [{t:'=',w}|{t:'-',w}|{t:'+',w}]
  const n = a.length, m = b.length;
  if (n * m > 4e6) return [...a.map((w) => ({ t: '-', w })), ...b.map((w) => ({ t: '+', w }))];
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { out.push({ t: '=', w: a[i] }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: '-', w: a[i++] }); else out.push({ t: '+', w: b[j++] }); }
  while (i < n) out.push({ t: '-', w: a[i++] }); while (j < m) out.push({ t: '+', w: b[j++] });
  return out;
}
const compare = {
  input: { multiple: true, min: 2 }, runLabel: 'Vergelijken', lead: 'Kies de oude versie (1) en de nieuwe versie (2). Verschillen in tekst worden per pagina gemarkeerd.',
  options: (ctx) => [F.check(ctx, 'visual', 'Ook visueel vergelijken (pixelverschillen tonen)', true), F.check(ctx, 'ignoreCase', 'Hoofdletters negeren', false),
    el('div', { class: 'help' }, 'Het eerste bestand in de lijst geldt als origineel. Gebruik de pijltjes om te wisselen.')],
  summary: (ctx) => ctx.files.length >= 2 ? [`Origineel: ${ctx.files[0].name}`] : 'Kies twee bestanden',
  validate: (ctx) => ctx.files.length !== 2 ? 'Kies precies twee bestanden om te vergelijken.' : null,
  async run(ctx) {
    const [A, B] = ctx.files; const ta = await pageTexts(A, ctx.progress), tb = await pageTexts(B, ctx.progress);
    const n = Math.max(ta.length, tb.length); const view = el('div', { class: 'cmp' }); let changed = 0, ins = 0, del = 0;
    const norm = (s) => ctx.opts.ignoreCase ? s.toLowerCase() : s;
    view.append(el('div', { class: 'legend' }, el('span', { class: 'del' }, 'verwijderd'), el('span', { class: 'ins' }, 'toegevoegd'), el('span', null, ta.length === tb.length ? `${plural(n)} vergeleken` : `Origineel ${plural(ta.length)}, nieuw ${plural(tb.length)}`)));
    for (let p = 0; p < n; p++) {
      ctx.progress(`Pagina ${p + 1} van ${n} vergelijken…`);
      const wa = (ta[p] || '').split(/\s+/).filter(Boolean), wb = (tb[p] || '').split(/\s+/).filter(Boolean);
      const d = diffWords(wa.map(norm), wb.map(norm));
      // originele woorden terugzetten voor weergave
      let ia = 0, ib = 0; for (const x of d) { if (x.t === '=') { x.w = wb[ib]; ia++; ib++; } else if (x.t === '-') x.w = wa[ia++]; else x.w = wb[ib++]; }
      const nd = d.filter((x) => x.t === '-').length, ni = d.filter((x) => x.t === '+').length;
      let pix = 0, visual = null;
      if (ctx.opts.visual && p < ta.length && p < tb.length) {
        const [pa, pb] = [await openPdfJs(A), await openPdfJs(B)];
        const ca = await renderPage(pa, p + 1, { width: 600 }), cb = await renderPage(pb, p + 1, { width: 600 });
        const w = Math.min(ca.width, cb.width), h = Math.min(ca.height, cb.height);
        const da = ca.getContext('2d').getImageData(0, 0, w, h).data, db = cb.getContext('2d').getImageData(0, 0, w, h).data;
        const out = document.createElement('canvas'); out.width = w; out.height = h; const g = out.getContext('2d'); g.drawImage(cb, 0, 0); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 0, w, h);
        const od = g.getImageData(0, 0, w, h); const o = od.data;
        for (let k = 0; k < da.length; k += 4) if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 60) { pix++; o[k] = 220; o[k + 1] = 30; o[k + 2] = 60; o[k + 3] = 255; }
        g.putImageData(od, 0, 0); if (ca.width !== cb.width || ca.height !== cb.height) pix += 1;
        if (pix) { out.className = 'zoomable'; out.title = 'Klik om te vergroten'; out.addEventListener('click', () => out.classList.toggle('big')); visual = el('div', { class: 'vis' }, el('div', { class: 'flabel' }, 'Visuele verschillen (rood) op de nieuwe versie — klik om te vergroten'), out); }
      }
      if (!nd && !ni && !pix && p < ta.length && p < tb.length) continue;
      changed++; ins += ni; del += nd;
      const txt = el('div', { class: 'diff' }); for (const x of d) { txt.append(x.t === '=' ? x.w : el('span', { class: x.t === '-' ? 'del' : 'ins' }, x.w), ' '); }
      view.append(el('section', { class: 'cpage' }, el('h4', null, `Pagina ${p + 1}` + (p >= ta.length ? ' (nieuw)' : p >= tb.length ? ' (verwijderd)' : '') + ` — ${nd} woord(en) weg, ${ni} erbij`), nd || ni ? txt : el('div', { class: 'help' }, 'Geen tekstverschil; wel een visueel verschil.'), visual));
    }
    if (!changed) view.append(el('p', { class: 'note' }, 'Geen verschillen gevonden.'));
    return { title: changed ? `${changed} pagina('s) met verschillen` : 'De bestanden zijn gelijk', note: changed ? `${del} woord(en) verwijderd, ${ins} toegevoegd.` : '', outputs: [], view };
  }
};

/* ---------- Zoeken in meerdere PDF's ---------- */
const search = {
  input: { multiple: true }, unordered: true, runLabel: 'Zoeken', lead: "Voeg één of meer PDF's toe en zoek naar een woord of zin.",
  options: (ctx) => {
    const q = F.text(ctx, 'q', 'Zoek naar', '', { placeholder: 'bv. ISO 7' });
    q.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const b = document.getElementById('run'); if (b && !b.disabled) b.click(); } });
    return [q, F.check(ctx, 'case', 'Hoofdlettergevoelig', false), F.check(ctx, 'word', 'Alleen hele woorden', false)];
  },
  summary: (ctx) => ctx.files.length ? `${ctx.files.length} bestand${ctx.files.length > 1 ? 'en' : ''}` : 'Nog geen bestand gekozen',
  validate: (ctx) => (ctx.opts.q || '').trim() ? null : 'Geef een zoekterm op.',
  async run(ctx) {
    ctx._texts = ctx._texts || new Map();
    const q = ctx.opts.q.trim(); const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const re = new RegExp(ctx.opts.word ? `(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])` : esc, 'gu' + (ctx.opts.case ? '' : 'i'));
    const view = el('div', { class: 'hits' }); const rows = [['Bestand', 'Pagina', 'Fragment']]; let total = 0, filesHit = 0;
    for (const f of ctx.files) {
      if (!ctx._texts.has(f.id)) ctx._texts.set(f.id, await pageTexts(f, ctx.progress));
      const pages = ctx._texts.get(f.id); const list = el('ul'); let n = 0;
      pages.forEach((t, p) => {
        const flat = t.replace(/\n/g, ' '); let m; re.lastIndex = 0;
        while ((m = re.exec(flat))) {
          n++; const a = Math.max(0, m.index - 60), b = Math.min(flat.length, m.index + m[0].length + 60);
          const pre = (a ? '…' : '') + flat.slice(a, m.index), post = flat.slice(m.index + m[0].length, b) + (b < flat.length ? '…' : '');
          list.append(el('li', null, el('span', { class: 'pg-no' }, `p. ${p + 1}`), el('span', null, pre, el('mark', null, m[0]), post)));
          rows.push([f.name, String(p + 1), (pre + m[0] + post).replace(/"/g, '""')]);
          if (m[0].length === 0) re.lastIndex++;
        }
      });
      total += n; if (n) filesHit++;
      view.append(el('section', { class: 'hfile' }, el('h4', null, `${f.name} — ${n} treffer${n === 1 ? '' : 's'}`), n ? list : el('div', { class: 'help' }, pages.every((t) => !t) ? 'Geen tekst gevonden in dit bestand (mogelijk een scan).' : 'Geen treffers.')));
    }
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${c}"`).join(';')).join('\r\n');
    return { title: `${total} treffer${total === 1 ? '' : 's'} in ${filesHit} van ${ctx.files.length} bestand(en)`, outputs: total ? [{ name: `zoekresultaten_${q.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 30)}.csv`, data: new TextEncoder().encode(csv) }] : [], view };
  }
};

export const CONVERT = { 'images-to-pdf': imagesToPdf, 'pdf-to-images': pdfToImages, compare, search };
