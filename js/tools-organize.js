// Pagina's organiseren
import { el, F, PDFLib, loadPdf, newDoc, parseRange, rangeString, baseName, mm, drawTextAt, hexToRgb, toRoman, visualBox, v2p } from './core.js';

const { PDFDocument, PDFName, PDFHexString, PDFNull, degrees, StandardFonts } = PDFLib;
const save = (doc) => doc.save({ useObjectStreams: true });
const plural = (n) => `${n} pagina${n === 1 ? '' : "'s"}`;
const first = (ctx) => ctx.files[0];

// Bladwijzers (outline) toevoegen: items [{title, page}]
export function addOutline(doc, items) {
  if (!items.length) return;
  const c = doc.context;
  const rootRef = c.nextRef();
  const refs = items.map(() => c.nextRef());
  items.forEach((it, i) => {
    const d = c.obj({
      Title: PDFHexString.fromText(it.title), Parent: rootRef,
      Dest: c.obj([it.page.ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull])
    });
    if (i > 0) d.set(PDFName.of('Prev'), refs[i - 1]);
    if (i < items.length - 1) d.set(PDFName.of('Next'), refs[i + 1]);
    c.assign(refs[i], d);
  });
  c.assign(rootRef, c.obj({ Type: 'Outlines', First: refs[0], Last: refs[refs.length - 1], Count: items.length }));
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

function rotateBy(page, a) { page.setRotation(degrees((((page.getRotation().angle + a) % 360) + 360) % 360)); }

/* ---------- Samenvoegen ---------- */
const merge = {
  input: { multiple: true, min: 2 }, perFileRange: true, runLabel: "PDF's samenvoegen",
  lead: 'Voeg bestanden toe, zet ze in de juiste volgorde en voeg ze samen tot één PDF.',
  options: (ctx) => [
    F.text(ctx, 'outName', 'Naam van het resultaat', 'Samengevoegd.pdf'),
    F.check(ctx, 'outline', 'Bladwijzer per bestand toevoegen', true),
    F.check(ctx, 'normalize', 'Alle pagina\'s even breed maken (schalen naar breedste)', false)
  ],
  summary: (ctx) => {
    let n = 0; for (const f of ctx.files) { try { const r = parseRange(f.range, f.pages); n += r ? r.length : f.pages; } catch { n += 0; } }
    return [`${ctx.files.length} bestanden`, plural(n)];
  },
  validate: (ctx) => {
    if (ctx.files.length < 2) return 'Kies minstens twee bestanden.';
    for (const f of ctx.files) { try { const r = parseRange(f.range, f.pages); if (r && !r.length) return `Leeg bereik bij ${f.name}.`; } catch (e) { return `${f.name}: ${e.message}`; } }
  },
  async run(ctx) {
    const out = await newDoc();
    const marks = [];
    for (const [i, f] of ctx.files.entries()) {
      ctx.progress(`Bestand ${i + 1} van ${ctx.files.length}…`);
      const src = await loadPdf(f);
      const idx = parseRange(f.range, f.pages, { keepOrder: true }) || src.getPageIndices();
      const pages = await out.copyPages(src, idx);
      pages.forEach((p) => out.addPage(p));
      if (pages.length) marks.push({ title: baseName(f.name), page: pages[0] });
    }
    if (ctx.opts.normalize) {
      const ps = out.getPages(); const maxW = Math.max(...ps.map((p) => visualBox(p).VW));
      for (const p of ps) { const w = visualBox(p).VW; if (w < maxW - 0.5) { const s = maxW / w; p.scale(s, s); } }
    }
    if (ctx.opts.outline) addOutline(out, marks);
    let name = (ctx.opts.outName || 'Samengevoegd.pdf').trim(); if (!/\.pdf$/i.test(name)) name += '.pdf';
    return { title: `Samengevoegd: ${plural(out.getPageCount())}`, outputs: [{ name, data: await save(out) }] };
  }
};

/* ---------- Splitsen ---------- */
const split = {
  runLabel: 'PDF splitsen',
  options: (ctx) => {
    const box = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    const draw = () => {
      box.replaceChildren(...[
        F.seg(ctx, 'mode', 'Splitsen', [['each', 'Elke pagina apart'], ['every', 'Elke N pagina\'s'], ['ranges', 'Op paginabereiken']], 'each'),
        ctx.opts.mode === 'every' ? F.number(ctx, 'n', 'Aantal pagina\'s per bestand', 2, { min: 1 }) : null,
        ctx.opts.mode === 'ranges' ? F.text(ctx, 'ranges', 'Bereiken (één bestand per komma)', '', { placeholder: 'bv. 1-3, 4-6, 7-', help: 'Elk deel tussen komma\'s wordt een apart bestand.' }) : null].filter(Boolean));
    };
    ctx.onModeRedraw = draw; draw();
    return box;
  },
  onChange: (ctx, key) => { if (key === 'mode' && ctx.onModeRedraw) ctx.onModeRedraw(); },
  summary: (ctx) => {
    const f = first(ctx); if (!f) return 'Nog geen bestand gekozen';
    try { return [plural(f.pages), `${groups(ctx).length} bestand(en)`]; } catch { return plural(f.pages); }
  },
  validate: (ctx) => { try { if (!groups(ctx).length) return 'Geef minstens één bereik op.'; } catch (e) { return e.message; } },
  async run(ctx) {
    const f = first(ctx); const src = await loadPdf(f); const gs = groups(ctx); const outs = [];
    for (const [i, g] of gs.entries()) {
      ctx.progress(`Deel ${i + 1} van ${gs.length}…`);
      const d = await newDoc(); (await d.copyPages(src, g)).forEach((p) => d.addPage(p));
      const lbl = g.length === 1 ? `p${g[0] + 1}` : `p${g[0] + 1}-${g[g.length - 1] + 1}`;
      outs.push({ name: `${baseName(f.name)}_${lbl}.pdf`, data: await save(d) });
    }
    return { title: `Gesplitst in ${outs.length} bestand${outs.length > 1 ? 'en' : ''}`, outputs: outs, zipName: baseName(f.name) + '_gesplitst' };
  }
};
function groups(ctx) {
  const f = first(ctx); const n = f.pages; const m = ctx.opts.mode;
  if (m === 'every') { const k = Math.max(1, Math.floor(ctx.opts.n || 1)); const g = []; for (let i = 0; i < n; i += k) g.push(Array.from({ length: Math.min(k, n - i) }, (_, j) => i + j)); return g; }
  if (m === 'ranges') return (ctx.opts.ranges || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => parseRange(s, n, { keepOrder: true }));
  return Array.from({ length: n }, (_, i) => [i]);
}

/* ---------- Extraheren ---------- */
const extract = {
  grid: 'select', runLabel: "Pagina's extraheren", lead: "Klik op de pagina's die u wilt bewaren (Shift-klik voor een reeks) of typ een bereik.",
  options: (ctx) => [F.check(ctx, 'separate', 'Elke pagina als apart bestand', false)],
  summary: (ctx) => ctx.grid.count() ? [`${ctx.grid.selected.size} geselecteerd`, `van ${plural(ctx.grid.count())}`] : 'Nog geen bestand gekozen',
  validate: (ctx) => ctx.grid.selected.size ? null : "Selecteer minstens één pagina.",
  async run(ctx) {
    const f = first(ctx); const src = await loadPdf(f); const sel = ctx.grid.selection();
    if (ctx.opts.separate) {
      const outs = [];
      for (const i of sel) { const d = await newDoc(); d.addPage((await d.copyPages(src, [i]))[0]); outs.push({ name: `${baseName(f.name)}_p${i + 1}.pdf`, data: await save(d) }); }
      return { title: `${outs.length} pagina's geëxtraheerd`, outputs: outs, zipName: baseName(f.name) + '_paginas' };
    }
    const d = await newDoc(); (await d.copyPages(src, sel)).forEach((p) => d.addPage(p));
    return { title: `${plural(sel.length)} geëxtraheerd (${rangeString(sel)})`, outputs: [{ name: `${baseName(f.name)}_extract.pdf`, data: await save(d) }] };
  }
};

/* ---------- Verwijderen ---------- */
const deletePages = {
  grid: 'select', gridOpts: { selStyle: 'del' }, runLabel: "Pagina's verwijderen", lead: "Klik op de pagina's die weg moeten (Shift-klik voor een reeks) of typ een bereik.",
  summary: (ctx) => ctx.grid.count() ? [`${ctx.grid.selected.size} te verwijderen`, `${ctx.grid.count() - ctx.grid.selected.size} blijven over`] : 'Nog geen bestand gekozen',
  validate: (ctx) => !ctx.grid.selected.size ? 'Selecteer de pagina\'s die u wilt verwijderen.' : ctx.grid.selected.size >= ctx.grid.count() ? 'U kunt niet alle pagina\'s verwijderen.' : null,
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const sel = ctx.grid.selection();
    for (const i of [...sel].reverse()) doc.removePage(i);
    return { title: `${plural(sel.length)} verwijderd — ${plural(doc.getPageCount())} over`, outputs: [{ name: `${baseName(f.name)}_bewerkt.pdf`, data: await save(doc) }] };
  }
};

/* ---------- Ordenen ---------- */
const organize = {
  grid: 'organize', input: { multiple: true }, runLabel: 'Opslaan als nieuwe PDF',
  lead: "Sleep miniaturen om de volgorde te wijzigen, draai of verwijder pagina's. Meerdere bestanden mogen.",
  summary: (ctx) => ctx.grid.count() ? plural(ctx.grid.count()) : 'Nog geen bestand gekozen',
  validate: (ctx) => ctx.grid.count() ? null : 'Er zijn geen pagina\'s over.',
  async run(ctx) {
    const out = await newDoc(); const srcs = new Map();
    let lastSize = [595.28, 841.89];
    for (const it of ctx.grid.items) {
      if (it.blank) { const p = out.addPage(lastSize); if (it.rot) rotateBy(p, it.rot); continue; }
      if (!srcs.has(it.f.id)) srcs.set(it.f.id, await loadPdf(it.f));
      const [p] = await out.copyPages(srcs.get(it.f.id), [it.p]);
      out.addPage(p); if (it.rot) rotateBy(p, it.rot);
      const s = p.getSize(); lastSize = [s.width, s.height];
    }
    const nm = ctx.files.length === 1 ? baseName(ctx.files[0].name) + '_geordend.pdf' : 'Geordend.pdf';
    return { title: `Opgeslagen: ${plural(out.getPageCount())}`, outputs: [{ name: nm, data: await save(out) }] };
  }
};

/* ---------- Roteren ---------- */
const rotate = {
  grid: 'select', gridOpts: { initialAll: true }, runLabel: "Pagina's roteren", lead: "Kies de draaiing en de pagina's (standaard alle).",
  options: (ctx) => [F.seg(ctx, 'angle', 'Draaien', [[90, '90° rechtsom'], [180, '180°'], [270, '90° linksom']], 90)],
  summary: (ctx) => ctx.grid.count() ? `${ctx.grid.selected.size} van ${plural(ctx.grid.count())}` : 'Nog geen bestand gekozen',
  validate: (ctx) => ctx.grid.selected.size ? null : 'Selecteer minstens één pagina.',
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const pages = doc.getPages();
    for (const i of ctx.grid.selection()) rotateBy(pages[i], +ctx.opts.angle);
    return { title: `${plural(ctx.grid.selected.size)} gedraaid`, outputs: [{ name: `${baseName(f.name)}_geroteerd.pdf`, data: await save(doc) }] };
  }
};

/* ---------- Bijsnijden ---------- */
function cropPage(p, t, r, b, l) {
  const box = p.getCropBox(); const rot = ((p.getRotation().angle % 360) + 360) % 360;
  // visuele zijden -> PDF-zijden
  let [L, R, B, T] = [l, r, b, t];
  if (rot === 90) [L, R, B, T] = [t, b, l, r];
  else if (rot === 180) [L, R, B, T] = [r, l, t, b];
  else if (rot === 270) [L, R, B, T] = [b, t, r, l];
  const w = box.width - L - R, h = box.height - B - T;
  if (w < 10 || h < 10) throw new Error('De marges zijn groter dan de pagina.');
  p.setCropBox(box.x + L, box.y + B, w, h);
}
const crop = {
  grid: 'select', gridOpts: { initialAll: true }, runLabel: 'Bijsnijden', lead: "Geef de marges op die eraf moeten. Het voorbeeld toont de eerste geselecteerde pagina.",
  options: (ctx) => [
    el('div', { class: 'row2' }, F.number(ctx, 'top', 'Boven (mm)', 10, { min: 0, step: 0.5 }), F.number(ctx, 'bottom', 'Onder (mm)', 10, { min: 0, step: 0.5 }),
      F.number(ctx, 'left', 'Links (mm)', 10, { min: 0, step: 0.5 }), F.number(ctx, 'right', 'Rechts (mm)', 10, { min: 0, step: 0.5 })),
    el('div', { class: 'help' }, 'Bijsnijden verbergt de rand; de inhoud buiten het kader blijft in het bestand aanwezig. Gebruik Permanent redigeren voor gevoelige inhoud.')
  ],
  summary: (ctx) => ctx.grid.count() ? `${ctx.grid.selected.size} van ${plural(ctx.grid.count())}` : 'Nog geen bestand gekozen',
  validate: (ctx) => ctx.grid.selected.size ? null : 'Selecteer minstens één pagina.',
  async preview(ctx) {
    const f = first(ctx); const src = await loadPdf(f); const i = ctx.grid.selection()[0] ?? 0;
    const d = await newDoc(); const [p] = await d.copyPages(src, [i]); d.addPage(p);
    const o = ctx.opts; const box = p.getCropBox(); const b = visualBox(p);
    // kader tekenen in visuele coördinaten
    const a = v2p(b, mm(o.left), mm(o.bottom)), c = v2p(b, b.VW - mm(o.right), b.VH - mm(o.top));
    p.drawRectangle({ x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), width: Math.abs(c.x - a.x), height: Math.abs(c.y - a.y), borderColor: hexToRgb('#00C7E5'), borderWidth: 2, borderDashArray: [6, 4] });
    return d.save();
  },
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const pages = doc.getPages(); const o = ctx.opts;
    for (const i of ctx.grid.selection()) cropPage(pages[i], mm(o.top), mm(o.right), mm(o.bottom), mm(o.left));
    return { title: `${plural(ctx.grid.selected.size)} bijgesneden`, outputs: [{ name: `${baseName(f.name)}_bijgesneden.pdf`, data: await save(doc) }] };
  }
};

/* ---------- Paginanummering ---------- */
const FORMATS = [['{n}', '1, 2, 3 …'], ['Pagina {n} van {t}', 'Pagina 1 van 12'], ['{n} / {t}', '1 / 12'], ['{r}', 'i, ii, iii …'], ['- {n} -', '- 1 -']];
const FONTS = [['Helvetica', 'Helvetica'], ['HelveticaBold', 'Helvetica vet'], ['TimesRoman', 'Times'], ['Courier', 'Courier']];
async function numberDoc(ctx, doc, onlyFirst) {
  const o = ctx.opts; const font = await doc.embedFont(StandardFonts[o.font] || StandardFonts.Helvetica);
  const pages = doc.getPages(); const total = pages.length;
  let target; try { target = parseRange(o.range, total) || pages.map((_, i) => i); } catch (e) { throw e; }
  if (o.skipFirst) target = target.filter((i) => i !== 0);
  const counted = o.countAll ? null : target;
  target.forEach((i, k) => {
    if (onlyFirst && i !== onlyFirst.idx) return;
    const num = (counted ? k : i) + (+o.start || 1);
    const tot = (counted ? counted.length : total) + (+o.start || 1) - 1;
    const txt = String(o.format).replace('{n}', num).replace('{t}', tot).replace('{r}', toRoman(num));
    drawTextAt(pages[i], txt, { font, size: +o.size || 10, pos: +o.pos, margin: mm(+o.margin || 0), color: hexToRgb(o.color || '#000000') });
  });
  return target;
}
const pageNumbers = {
  runLabel: 'Nummers toevoegen', lead: 'Kies positie en opmaak; het voorbeeld werkt meteen mee.',
  options: (ctx) => [
    F.pos(ctx, 'pos', 'Positie', 7),
    F.select(ctx, 'format', 'Formaat', FORMATS, '{n}'),
    el('div', { class: 'row2' }, F.number(ctx, 'start', 'Beginnen bij', 1, { min: 0 }), F.text(ctx, 'range', 'Pagina\'s', '', { placeholder: 'alle' }),
      F.select(ctx, 'font', 'Lettertype', FONTS, 'Helvetica'), F.number(ctx, 'size', 'Grootte (pt)', 10, { min: 4, max: 72 }),
      F.number(ctx, 'margin', 'Marge (mm)', 12, { min: 0, step: 0.5 }), F.color(ctx, 'color', 'Kleur', '#000000')),
    F.check(ctx, 'skipFirst', 'Eerste pagina (voorblad) niet nummeren', false),
    F.check(ctx, 'countAll', 'Overgeslagen pagina\'s wel meetellen', true)
  ],
  summary: (ctx) => first(ctx) ? plural(first(ctx).pages) : 'Nog geen bestand gekozen',
  validate: (ctx) => { try { parseRange(ctx.opts.range, first(ctx).pages); } catch (e) { return e.message; } },
  async preview(ctx) {
    const f = first(ctx); const src = await loadPdf(f);
    let idx = 0; try { const t = parseRange(ctx.opts.range, f.pages) || Array.from({ length: f.pages }, (_, i) => i); idx = ctx.opts.skipFirst ? (t.find((i) => i !== 0) ?? 0) : t[0]; } catch {}
    await numberDoc(ctx, src, { idx });
    const d = await newDoc(); d.addPage((await d.copyPages(src, [idx]))[0]); return d.save();
  },
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const t = await numberDoc(ctx, doc);
    return { title: `${plural(t.length)} genummerd`, outputs: [{ name: `${baseName(f.name)}_genummerd.pdf`, data: await save(doc) }] };
  }
};

export const ORGANIZE = { merge, split, extract, 'delete-pages': deletePages, organize, rotate, crop, 'page-numbers': pageNumbers };
