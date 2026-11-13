// Professionele hulpmiddelen: bladwijzers, paginalabels, Bates-nummering
import { L } from './i18n.js';
import { el, icon, toast, F, PDFLib, loadPdf, openPdfJs, renderPage, parseRange, baseName, mm, drawTextAt, hexToRgb } from './core.js';

const { PDFName, PDFHexString, PDFNull, PDFDict, PDFNumber, StandardFonts } = PDFLib;
const N = (x) => PDFName.of(x);
const save = (doc) => doc.save({ useObjectStreams: true });
const plural = (n) => `${n} pagina${n === 1 ? '' : "'s"}`;
const first = (ctx) => ctx.files[0];

/* ================= Bladwijzers ================= */
// Bestaande bladwijzers lezen (via pdf.js, dat ook benoemde bestemmingen oplost)
async function readOutline(entry) {
  const pdf = await openPdfJs(entry); const raw = await pdf.getOutline(); if (!raw) return [];
  const pageOf = async (dest) => {
    try {
      if (typeof dest === 'string') dest = await pdf.getDestination(dest);
      if (!Array.isArray(dest) || !dest.length) return 0;
      const ref = dest[0]; if (typeof ref === 'number') return ref;
      return await pdf.getPageIndex(ref);
    } catch { return 0; }
  };
  const walk = async (items) => Promise.all(items.map(async (it) => ({ title: it.title || '', page: await pageOf(it.dest), open: false, children: await walk(it.items || []), url: it.url || null })));
  return walk(raw);
}
// Bladwijzers schrijven als geneste outline
export function writeOutline(doc, tree) {
  const c = doc.context; const pages = doc.getPages();
  doc.catalog.delete(N('Outlines'));
  const items = tree.filter((t) => t.title.trim());
  if (!items.length) { doc.catalog.delete(N('PageMode')); return; }
  const rootRef = c.nextRef();
  const build = (list, parentRef) => {
    const refs = list.map(() => c.nextRef()); let visible = 0;
    list.forEach((it, i) => {
      const pg = pages[Math.min(Math.max(0, it.page | 0), pages.length - 1)];
      const d = c.obj({ Title: PDFHexString.fromText(it.title.trim()), Parent: parentRef, Dest: c.obj([pg.ref, N('XYZ'), PDFNull, PDFNull, PDFNull]) });
      if (i > 0) d.set(N('Prev'), refs[i - 1]);
      if (i < list.length - 1) d.set(N('Next'), refs[i + 1]);
      const kids = (it.children || []).filter((t) => t.title.trim());
      if (kids.length) { const k = build(kids, refs[i]); d.set(N('First'), k.first); d.set(N('Last'), k.last); d.set(N('Count'), PDFNumber.of(it.open ? k.count : -k.count)); if (it.open) visible += k.count; }
      c.assign(refs[i], d); visible++;
    });
    return { first: refs[0], last: refs[refs.length - 1], count: visible };
  };
  const top = build(items, rootRef);
  c.assign(rootRef, c.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: top.count }));
  doc.catalog.set(N('Outlines'), rootRef);
  doc.catalog.set(N('PageMode'), N('UseOutlines'));
}
// Koppen herkennen: regels in een duidelijk grotere letter dan de lopende tekst
async function detectHeadings(entry, progress) {
  const pdf = await openPdfJs(entry); const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    if (progress && p % 10 === 0) progress(`Pagina ${p} van ${pdf.numPages}…`);
    const pg = await pdf.getPage(p); const tc = await pg.getTextContent();
    const rows = new Map();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const size = Math.round(Math.hypot(it.transform[2], it.transform[3]) * 10) / 10; const y = Math.round(it.transform[5]);
      const k = y + '|' + size; const r = rows.get(k) || { y, size, txt: '', bold: /bold|black|heavy|semibold/i.test((tc.styles[it.fontName] || {}).fontFamily || '') || /Bold|Black|Heavy|Semibold/i.test(it.fontName) }; r.txt += (r.txt && !r.txt.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str; rows.set(k, r);
    }
    for (const r of [...rows.values()].sort((a, b) => b.y - a.y)) lines.push({ ...r, page: p - 1, txt: r.txt.replace(/\s+/g, ' ').trim() });
  }
  if (!lines.length) return [];
  // lopende tekst = de lettergrootte met de meeste tekens
  const weight = new Map(); lines.forEach((l) => weight.set(l.size, (weight.get(l.size) || 0) + l.txt.length));
  const body = [...weight.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const cand = lines.filter((l) => l.txt.length >= 2 && l.txt.length <= 90 && /[A-Za-zÀ-ÿ]/.test(l.txt) && (l.size >= body * 1.18 || (l.bold && l.size >= body * 1.05 && l.txt.length <= 60)));
  const sizes = [...new Set(cand.map((l) => l.size))].sort((a, b) => b - a);
  // hoogstens drie niveaus; grootste maten eerst
  const level = (s) => Math.min(2, sizes.indexOf(s));
  // regels die op (bijna) elke pagina terugkomen zijn kop- of voetteksten, geen koppen
  const freq = new Map(); cand.forEach((l) => freq.set(l.txt, (freq.get(l.txt) || 0) + 1));
  const maxRep = Math.max(3, pdf.numPages * 0.4);
  const tree = []; const stack = [];
  for (const l of cand) {
    if (freq.get(l.txt) > maxRep) continue;
    const node = { title: l.txt, page: l.page, open: true, children: [] }; const lv = level(l.size);
    while (stack.length && stack[stack.length - 1].lv >= lv) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node); else tree.push(node);
    stack.push({ node, lv });
  }
  return tree;
}
const countTree = (t) => t.reduce((n, x) => n + 1 + countTree(x.children || []), 0);
function flat(tree, depth = 0, parent = null, out = []) { tree.forEach((n, i) => { out.push({ n, depth, parent, list: tree, i }); flat(n.children || [], depth + 1, n, out); }); return out; }

const bookmarks = {
  runLabel: 'Bladwijzers opslaan', lead: 'Maak, wijzig of verwijder de bladwijzers (inhoudsopgave in de zijbalk van de PDF-lezer).',
  async onFiles(ctx) { ctx.tree = first(ctx) ? await readOutline(first(ctx)) : []; ctx.sel = null; },
  options: (ctx) => [
    el('div', { class: 'help' }, 'Bladwijzers verwijzen naar een pagina. Met de pijlen verschuift u ze of maakt u er een onderdeel van de bladwijzer erboven van.'),
    el('button', { class: 'btn', type: 'button', id: 'bm-auto', disabled: !first(ctx), onclick: async (e) => {
      e.target.disabled = true;
      try { const t = await detectHeadings(first(ctx)); if (!t.length) toast('Geen duidelijke koppen gevonden (de PDF heeft geen tekst of alle tekst heeft dezelfde grootte).', 'error'); else { ctx.tree = t; toast(`${countTree(t)} kop(pen) gevonden.`); ctx.refresh(); } }
      finally { e.target.disabled = false; }
    } }, icon('search', 18), 'Uit koppen aanmaken'),
    el('button', { class: 'btn', type: 'button', id: 'bm-pages', disabled: !first(ctx), onclick: () => { ctx.tree = Array.from({ length: first(ctx).pages }, (_, i) => ({ title: L('Pagina ', 'Page ') + (i + 1), page: i, open: false, children: [] })); ctx.refresh(); } }, icon('number', 18), 'Eén per pagina'),
    el('button', { class: 'btn ghost', type: 'button', id: 'bm-clear', disabled: !first(ctx), onclick: () => { ctx.tree = []; ctx.refresh(); } }, icon('trash', 18), 'Alles wissen')
  ],
  summary: (ctx) => first(ctx) ? `${countTree(ctx.tree || [])} bladwijzer(s)` : 'Nog geen bestand gekozen',
  renderMain(ctx, box) {
    box.innerHTML = ''; const f = first(ctx); if (!f) return;
    const rows = flat(ctx.tree);
    const list = el('div', { class: 'bm-list', role: 'tree', 'aria-label': 'Bladwijzers' });
    const redraw = () => ctx.refresh();
    rows.forEach(({ n, depth, parent, list: arr, i }, k) => {
      const title = el('input', { type: 'text', class: 'bm-title', value: n.title, 'aria-label': 'Titel van bladwijzer ' + (k + 1), oninput: (e) => { n.title = e.target.value; } });
      const pageIn = el('input', { type: 'number', class: 'bm-page', min: 1, max: f.pages, value: n.page + 1, 'aria-label': 'Pagina', oninput: (e) => { n.page = Math.min(f.pages, Math.max(1, +e.target.value || 1)) - 1; } });
      const b = (lbl, ic, fn, dis) => el('button', { type: 'button', class: 'btn ghost icon sm', 'aria-label': lbl, title: lbl, disabled: !!dis, onclick: () => { fn(); redraw(); } }, icon(ic, 16));
      const up = () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; };
      const down = () => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; };
      const indent = () => { const prev = arr[i - 1]; arr.splice(i, 1); (prev.children = prev.children || []).push(n); prev.open = true; };
      const outdent = () => { const gp = flat(ctx.tree).find((r) => r.n === parent); const garr = gp ? gp.list : ctx.tree; const gi = gp ? gp.i : 0; arr.splice(i, 1); garr.splice(gi + 1, 0, n); };
      const add = () => { (n.children = n.children || []).push({ title: L('Nieuwe bladwijzer', 'New bookmark'), page: n.page, open: true, children: [] }); n.open = true; };
      list.append(el('div', { class: 'bm-row', role: 'treeitem', 'aria-level': depth + 1, style: { paddingLeft: 8 + depth * 22 + 'px' } },
        el('span', { class: 'bm-dot', 'aria-hidden': 'true' }), title, el('span', { class: 'bm-p' }, 'p.'), pageIn,
        b('Omhoog', 'up', up, i === 0), b('Omlaag', 'down', down, i === arr.length - 1),
        b('Inspringen', 'indent', indent, i === 0), b('Terugspringen', 'outdent', outdent, !parent),
        b('Onderdeel toevoegen', 'plus', add), b('Bladwijzer verwijderen', 'x', () => arr.splice(i, 1))));
    });
    if (!rows.length) list.append(el('p', { class: 'empty' }, 'Deze PDF heeft nog geen bladwijzers.'));
    const newT = el('input', { type: 'text', id: 'bm-new', placeholder: 'Titel', 'aria-label': 'Titel nieuwe bladwijzer' });
    const newP = el('input', { type: 'number', id: 'bm-newpage', min: 1, max: f.pages, value: 1, 'aria-label': 'Pagina nieuwe bladwijzer', class: 'bm-page' });
    const addTop = () => { if (!newT.value.trim()) { newT.focus(); return; } ctx.tree.push({ title: newT.value.trim(), page: Math.min(f.pages, Math.max(1, +newP.value || 1)) - 1, open: true, children: [] }); ctx.refresh(); setTimeout(() => document.getElementById('bm-new')?.focus(), 0); };
    newT.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTop(); });
    box.append(el('h2', { style: { fontSize: '16px' } }, 'Bladwijzers'), list,
      el('div', { class: 'bm-add' }, newT, el('span', { class: 'bm-p' }, 'p.'), newP, el('button', { class: 'btn', type: 'button', id: 'bm-addbtn', onclick: addTop }, icon('plus', 16), 'Toevoegen')));
  },
  validate: (ctx) => (!first(ctx) ? 'Kies eerst een PDF.' : null),
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); writeOutline(doc, ctx.tree);
    const n = countTree(ctx.tree);
    return { title: n ? `${n} bladwijzer(s) opgeslagen` : 'Bladwijzers verwijderd', outputs: [{ name: `${baseName(f.name)}_bladwijzers.pdf`, data: await save(doc) }] };
  }
};

/* ================= Paginalabels ================= */
const STYLES = [['D', '1, 2, 3'], ['r', 'i, ii, iii'], ['R', 'I, II, III'], ['a', 'a, b, c'], ['A', 'A, B, C'], ['', 'Alleen voorvoegsel']];
const roman = (n) => { const m = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let s = ''; for (const [v, t] of m) while (n >= v) { s += t; n -= v; } return s; };
const alpha = (n) => { const k = Math.floor((n - 1) / 26) + 1; return String.fromCharCode(97 + ((n - 1) % 26)).repeat(k); };
export function labelFor(rules, i) {
  const r = [...rules].sort((a, b) => a.from - b.from).filter((x) => x.from - 1 <= i).pop(); if (!r) return String(i + 1);
  const n = (r.start || 1) + i - (r.from - 1);
  const num = r.style === 'D' ? String(n) : r.style === 'r' ? roman(n) : r.style === 'R' ? roman(n).toUpperCase() : r.style === 'a' ? alpha(n) : r.style === 'A' ? alpha(n).toUpperCase() : '';
  return (r.prefix || '') + num;
}
const pageLabels = {
  runLabel: 'Labels opslaan', lead: 'Geef pagina\'s een eigen nummering in de PDF-lezer, bv. i–iv voor het voorwerk en 1, 2, 3 vanaf het eerste hoofdstuk.',
  async onFiles(ctx) {
    const f = first(ctx); ctx.rules = [{ from: 1, style: 'D', prefix: '', start: 1 }]; if (!f) return;
    try { // bestaande labels omzetten naar regels
      const pdf = await openPdfJs(f); const lab = await pdf.getPageLabels(); if (!lab) return;
      const doc = await loadPdf(f); const pl = doc.catalog.lookup(N('PageLabels'), PDFDict); const nums = pl && pl.lookup(N('Nums'));
      if (nums) { const rules = []; for (let k = 0; k + 1 < nums.size(); k += 2) { const from = nums.lookup(k).asNumber() + 1; const d = nums.lookup(k + 1); const S = d.get(N('S')); const P = d.lookup(N('P')); const St = d.get(N('St')); rules.push({ from, style: S ? S.toString().slice(1) : '', prefix: P ? P.decodeText() : '', start: St ? St.asNumber() : 1 }); } if (rules.length) ctx.rules = rules; }
    } catch (e) { console.warn('labels', e); }
  },
  options: (ctx) => [
    el('div', { class: 'help' }, 'Elke regel geldt vanaf de opgegeven pagina tot de volgende regel. De gedrukte paginanummers veranderen niet; gebruik daarvoor Paginanummering.'),
    el('button', { class: 'btn', type: 'button', id: 'pl-preset', disabled: !first(ctx), onclick: () => { const n = Math.min(4, first(ctx).pages); ctx.rules = [{ from: 1, style: 'r', prefix: '', start: 1 }, { from: Math.min(first(ctx).pages, n + 1), style: 'D', prefix: '', start: 1 }]; ctx.refresh(); } }, 'Voorbeeld: voorwerk i–iv, daarna 1, 2, 3')
  ],
  summary: (ctx) => first(ctx) ? `${(ctx.rules || []).length} regel(s) · ${plural(first(ctx).pages)}` : 'Nog geen bestand gekozen',
  renderMain(ctx, box) {
    box.innerHTML = ''; const f = first(ctx); if (!f) return;
    const prev = el('div', { class: 'pl-prev', id: 'pl-prev' });
    const showPrev = () => { const n = Math.min(f.pages, 40); prev.replaceChildren(...Array.from({ length: n }, (_, i) => el('span', null, el('small', null, i + 1), labelFor(ctx.rules, i))), f.pages > n ? el('span', null, '…') : ''); ctx.changed('rules'); };
    const rows = ctx.rules.map((r, k) => el('div', { class: 'pl-row' },
      el('div', { class: 'field' }, el('label', { for: 'pl-from-' + k }, 'Vanaf pagina'), el('input', { id: 'pl-from-' + k, type: 'number', min: 1, max: f.pages, value: r.from, disabled: k === 0, oninput: (e) => { r.from = Math.min(f.pages, Math.max(2, +e.target.value || 2)); showPrev(); } })),
      el('div', { class: 'field' }, el('label', { for: 'pl-style-' + k }, 'Stijl'), (() => { const s = el('select', { id: 'pl-style-' + k, onchange: (e) => { r.style = e.target.value; showPrev(); } }, STYLES.map(([v, t]) => el('option', { value: v }, t))); s.value = r.style; return s; })()),
      el('div', { class: 'field' }, el('label', { for: 'pl-prefix-' + k }, 'Voorvoegsel'), el('input', { id: 'pl-prefix-' + k, type: 'text', value: r.prefix, placeholder: 'bv. A-', oninput: (e) => { r.prefix = e.target.value; showPrev(); } })),
      el('div', { class: 'field' }, el('label', { for: 'pl-start-' + k }, 'Begin bij'), el('input', { id: 'pl-start-' + k, type: 'number', min: 1, value: r.start, oninput: (e) => { r.start = Math.max(1, +e.target.value || 1); showPrev(); } })),
      k ? el('button', { class: 'btn ghost icon', type: 'button', 'aria-label': 'Regel verwijderen', onclick: () => { ctx.rules.splice(k, 1); ctx.refresh(); } }, icon('trash', 18)) : el('span')));
    box.append(el('h2', { style: { fontSize: '16px' } }, 'Regels'), ...rows,
      el('button', { class: 'btn', type: 'button', id: 'pl-add', onclick: () => { const last = ctx.rules[ctx.rules.length - 1]; ctx.rules.push({ from: Math.min(f.pages, last.from + 1), style: 'D', prefix: '', start: 1 }); ctx.refresh(); } }, icon('plus', 16), 'Regel toevoegen'),
      el('div', { class: 'flabel', style: { marginTop: '8px' } }, 'Zo heten de pagina\'s in de PDF-lezer'), prev);
    showPrev();
  },
  validate: (ctx) => { const f = first(ctx); if (!f) return 'Kies eerst een PDF.'; const s = new Set(); for (const r of ctx.rules) { if (s.has(r.from)) return `Twee regels beginnen op pagina ${r.from}.`; s.add(r.from); } },
  async run(ctx) {
    const f = first(ctx); const doc = await loadPdf(f); const c = doc.context;
    const rules = [...ctx.rules].sort((a, b) => a.from - b.from);
    const nums = []; for (const r of rules) { const d = { }; if (r.style) d.S = r.style; if (r.prefix) d.P = PDFHexString.fromText(r.prefix); if ((r.start || 1) !== 1) d.St = r.start; nums.push(r.from - 1, c.obj(d)); }
    doc.catalog.set(N('PageLabels'), c.obj({ Nums: c.obj(nums) }));
    return { title: 'Paginalabels ingesteld', note: `Bv. pagina 1 = "${labelFor(rules, 0)}", laatste pagina = "${labelFor(rules, f.pages - 1)}".`, outputs: [{ name: `${baseName(f.name)}_labels.pdf`, data: await save(doc) }] };
  }
};

/* ================= Bates-nummering ================= */
const batesText = (o, n) => (o.prefix || '') + String(n).padStart(Math.max(1, +o.digits || 6), '0') + (o.suffix || '');
const bates = {
  input: { multiple: true, min: 1 }, runLabel: 'Bates-nummers plaatsen', lead: 'Doorlopende identificatienummers op elke pagina van één of meer documenten, bv. voor dossiers en juridische stukken.',
  options: (ctx) => [
    el('div', { class: 'row2' }, F.text(ctx, 'prefix', 'Voorvoegsel', 'ABN'), F.text(ctx, 'suffix', 'Achtervoegsel', '')),
    el('div', { class: 'row2' }, F.number(ctx, 'start', 'Eerste nummer', 1, { min: 0 }), F.number(ctx, 'digits', 'Aantal cijfers', 6, { min: 1, max: 12 })),
    F.pos(ctx, 'pos', 'Positie', 8),
    el('div', { class: 'row2' }, F.number(ctx, 'size', 'Grootte (pt)', 9, { min: 5, max: 40 }), F.number(ctx, 'margin', 'Marge (mm)', 8, { min: 0, step: 0.5 }), F.color(ctx, 'color', 'Kleur', '#000000'), F.select(ctx, 'font', 'Lettertype', [['Helvetica', 'Helvetica'], ['HelveticaBold', 'Helvetica vet'], ['Courier', 'Courier']], 'Helvetica')),
    F.check(ctx, 'rename', 'Bestanden hernoemen naar hun Bates-bereik', true)
  ],
  summary: (ctx) => { if (!ctx.files.length) return 'Nog geen bestand gekozen'; const tot = ctx.files.reduce((a, f) => a + f.pages, 0); const s = +ctx.opts.start || 0; return [`${ctx.files.length} bestand(en), ${plural(tot)}`, `${batesText(ctx.opts, s)} t/m ${batesText(ctx.opts, s + tot - 1)}`]; },
  async preview(ctx) { const f = first(ctx); const src = await loadPdf(f); const d = await PDFLib.PDFDocument.create(); d.addPage((await d.copyPages(src, [0]))[0]); await stampBates(ctx, d, +ctx.opts.start || 0); return d.save(); },
  async run(ctx) {
    let n = +ctx.opts.start || 0; const outs = [];
    for (const [k, f] of ctx.files.entries()) {
      ctx.progress(`Bestand ${k + 1} van ${ctx.files.length}…`);
      const doc = await loadPdf(f); const from = n; n = await stampBates(ctx, doc, n);
      const name = ctx.opts.rename ? `${batesText(ctx.opts, from)}-${batesText(ctx.opts, n - 1)}.pdf` : `${baseName(f.name)}_bates.pdf`;
      outs.push({ name, data: await save(doc) });
    }
    const s = +ctx.opts.start || 0;
    return { title: `Bates-nummers ${batesText(ctx.opts, s)} t/m ${batesText(ctx.opts, n - 1)}`, outputs: outs, zipName: 'bates' };
  }
};
async function stampBates(ctx, doc, n) {
  const o = ctx.opts; const font = await doc.embedFont(StandardFonts[o.font] || StandardFonts.Helvetica);
  for (const p of doc.getPages()) drawTextAt(p, batesText(o, n++), { font, size: +o.size || 9, pos: +o.pos, margin: mm(+o.margin || 0), color: hexToRgb(o.color || '#000000') });
  return n;
}

export const PRO = { bookmarks, 'page-labels': pageLabels, bates };
