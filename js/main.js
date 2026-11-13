// PDF Studio — startpagina, routing en het gedeelde toolscherm
import { loadLibs, el, icon, toast, readBytes, fmtBytes, isPdfFile, isImageFile, probePdf, openPdfJs, renderPage, saveFile, zip, bytesToPdfJs } from './core.js';
import { PageGrid } from './grid.js';
import { startI18n, langSwitch, tr, lang } from './i18n.js';
const IMPL = {};
const SOON = new Set(['pdfa', 'pdf-to-word', 'word-to-pdf', 'ocr', 'scan-clean']); // tegels met 'Binnenkort' (modules laden pas op de achtergrond)
const MODULES = [
  () => import('./tools-organize.js').then((m) => m.ORGANIZE),
  () => import('./tools-optimize.js').then((m) => m.OPTIMIZE),
  () => import('./tools-convert.js').then((m) => m.CONVERT),
  () => import('./editor.js').then((m) => m.EDIT)
];

// Catalogus (volgorde en teksten zoals het ontwerp "2 · Toolbox")
const CATALOG = [
  { title: 'Bewerken en annoteren', tools: [
    ['edit-text', 'Tekst bewerken', 'text', 'Tekst wijzigen, toevoegen en zoeken-en-vervangen in de pagina.'],
    ['edit-image', 'Afbeeldingen bewerken', 'image', 'Afbeeldingen toevoegen, verplaatsen en schalen.'],
    ['edit-link', 'Koppelingen', 'link', 'Hyperlinks toevoegen op een gebied van de pagina.'],
    ['edit-annotate', 'Markeren en opmerken', 'comment', 'Markeren, onderstrepen, doorhalen en notities plaatsen.'],
    ['edit-draw', 'Tekenen en vormen', 'draw', 'Pijlen, kaders en vrije tekening op de pagina.'],
    ['fill-form', 'Formulier invullen', 'form', 'Bestaande formuliervelden invullen en opslaan.'],
    ['edit-sign', 'Handtekening zetten', 'sign', 'Handtekening of initialen tekenen, typen of uploaden.'],
    ['edit-redact', 'Permanent redigeren', 'redact', 'Gevoelige inhoud definitief zwart maken en verwijderen.']
  ]},
  { title: "Pagina's organiseren", tools: [
    ['merge', "PDF's samenvoegen", 'merge', "Meerdere PDF's of pagina's combineren tot één bestand."],
    ['split', 'PDF splitsen', 'split', 'Opdelen per pagina, per aantal pagina\'s of op bereik.'],
    ['extract', "Pagina's extraheren", 'extract', "Geselecteerde pagina's opslaan als nieuw bestand."],
    ['delete-pages', "Pagina's verwijderen", 'trash', "Ongewenste pagina's in één keer wegnemen."],
    ['organize', "Pagina's ordenen", 'reorder', 'Miniaturen slepen, draaien, verwijderen en lege pagina\'s invoegen.'],
    ['rotate', "Pagina's roteren", 'rotate', "Alle of enkele pagina's 90°, 180° of 270° draaien."],
    ['crop', 'Bijsnijden', 'crop', 'Marges bijsnijden op alle of geselecteerde pagina\'s.'],
    ['page-numbers', 'Paginanummering', 'number', 'Paginanummers toevoegen met opmaak en positie naar keuze.']
  ]},
  { title: 'Optimaliseren en beveiligen', tools: [
    ['compress', 'Comprimeren', 'compress', 'Bestandsgrootte verkleinen door afbeeldingen te optimaliseren.'],
    ['remove-metadata', 'Metadata verwijderen', 'tag', 'Auteur, titel, software en verborgen gegevens wissen.'],
    ['protect', 'Wachtwoord instellen', 'lock', 'PDF versleutelen (AES-256) en rechten beperken.'],
    ['unlock', 'Wachtwoord verwijderen', 'unlock', 'Beveiliging opheffen van een PDF waarvan u het wachtwoord kent.'],
    ['watermark', 'Watermerk', 'mark', 'Tekstwatermerk plaatsen, bv. "Vertrouwelijk".'],
    ['flatten', 'Platmaken', 'flat', 'Formuliervelden vastzetten in de pagina.'],
    ['header-footer', 'Kop- en voettekst', 'hf', 'Vaste tekst, datum of nummer bovenaan of onderaan elke pagina.'],
    ['pdfa', 'PDF/A omzetten', 'pdfa', 'Archiefversie maken voor langdurige bewaring.']
  ]},
  { title: 'Converteren en analyseren', tools: [
    ['pdf-to-word', 'PDF naar Word', 'convert', 'Omzetten naar een bewerkbaar .docx-bestand.'],
    ['word-to-pdf', 'Word naar PDF', 'convert', 'Documenten uit Word, Excel of PowerPoint omzetten.'],
    ['images-to-pdf', 'Afbeeldingen naar PDF', 'image', 'JPG- of PNG-bestanden bundelen in één PDF.'],
    ['pdf-to-images', 'PDF naar afbeeldingen', 'image', 'Elke pagina exporteren als PNG of JPG.'],
    ['ocr', 'Tekst herkennen (OCR)', 'ocr', 'Scans doorzoekbaar en selecteerbaar maken.'],
    ['scan-clean', 'Scan opschonen', 'scan', 'Scheef gescande pagina\'s rechtzetten en ruis verminderen.'],
    ['compare', "PDF's vergelijken", 'compare', 'Twee versies naast elkaar met verschillen gemarkeerd.'],
    ['search', "Zoeken in meerdere PDF's", 'search', 'Tekst opzoeken in een hele reeks bestanden.']
  ]}
];
const META = {}; CATALOG.forEach((s) => s.tools.forEach(([id, name, ic, desc]) => META[id] = { id, name, icon: ic, desc }));

const app = document.getElementById('app');
const LOGO = new URL('../logo.png', import.meta.url).href;

function topbar(right) {
  return el('header', { class: 'top' },
    el('a', { href: '#', 'aria-label': 'PDF Studio – startpagina', style: { display: 'flex' } }, el('img', { src: LOGO, alt: '' })),
    el('div', { class: 'sep' }), el('span', { class: 'app' }, 'PDF Studio'), el('div', { class: 'sp' }), langSwitch(el), right);
}

/* ---------------- Startpagina ---------------- */
function renderHome() {
  document.title = 'PDF Studio';
  const q = el('input', { id: 'q', type: 'search', placeholder: 'bv. samenvoegen, metadata, comprimeren', autocomplete: 'off' });
  const body = el('main', { class: 'home' });
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    body.innerHTML = '';
    let n = 0;
    for (const s of CATALOG) {
      const tools = s.tools.filter(([id, name, , desc]) => !term || (name + ' ' + desc + ' ' + tr(name) + ' ' + tr(desc)).toLowerCase().includes(term));
      if (!tools.length) continue;
      n += tools.length;
      body.append(el('section', null,
        el('div', { class: 'sec-h' }, el('span'), el('h2', null, s.title)),
        el('div', { class: 'tiles' }, tools.map(([id, name, ic, desc]) => {
          const ok = !SOON.has(id);
          const inner = [el('span', { class: 'ic' }, icon(ic, 24, '#004974')),
            el('span', null, el('span', { class: 't' }, name), el('span', { class: 'd' }, desc), ok ? null : el('span', { class: 'badge' }, 'Binnenkort'))];
          return ok ? el('a', { class: 'tile', href: '#' + id, 'data-tool': id }, inner)
                    : el('div', { class: 'tile soon', 'aria-disabled': 'true', 'data-tool': id }, inner);
        }))));
    }
    if (!n) body.append(el('p', { class: 'empty' }, 'Geen hulpmiddel gevonden voor "' + q.value + '".'));
  };
  q.addEventListener('input', draw);
  app.replaceChildren(
    topbar(el('a', { class: 'btn pri', href: '#edit-text' }, 'Open PDF in editor')),
    el('section', { class: 'hero' },
      el('svg', { class: 'wm', viewBox: '0 0 400 400', 'aria-hidden': 'true', html: '<rect x="100" y="100" width="200" height="200" rx="4" transform="rotate(45 200 200)" fill="none" stroke="#fff" stroke-width="8"/>' }),
      el('div', { class: 'in' },
        el('div', null, el('h1', null, 'Alle PDF-hulpmiddelen op één plek'),
          el('p', null, "Bewerk, organiseer, beveilig en converteer PDF's — gratis, ook zonder internet. Bestanden worden lokaal in uw browser verwerkt.")),
        el('div', null, el('label', { for: 'q' }, 'Zoek een hulpmiddel'), q))),
    body,
    el('footer', { class: 'foot' }, el('span', null, 'PDF Studio · open-source PDF-gereedschap'), el('div', { id: 'offline-slot', class: 'offline-slot' }), el('span', null, 'Verwerking gebeurt lokaal — er worden geen bestanden verstuurd')));
  draw();
}

/* ---------------- Toolpagina ---------------- */
let fileSeq = 0;
function renderTool(def) {
  const meta = META[def.id] || def;
  document.title = meta.name + ' – PDF Studio';
  const input = { kind: 'pdf', multiple: false, ...def.input };
  const ctx = { def, files: [], opts: {}, grid: null, busy: false };
  const accept = input.kind === 'image' ? 'image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic' : input.kind === 'pdf+image' ? '.pdf,application/pdf,image/*' : '.pdf,application/pdf';
  const fileIn = el('input', { type: 'file', accept, multiple: input.multiple, class: 'sr', id: 'file-in', 'aria-label': 'Bestanden kiezen' });
  const drop = el('div', { class: 'drop' }, icon('upload', 28, '#1B93A5'),
    el('span', { style: { fontSize: '15px' } }, input.kind === 'image' ? 'Sleep afbeeldingen hierheen of' : input.multiple ? "Sleep PDF's hierheen of" : 'Sleep een PDF hierheen of'),
    el('button', { class: 'btn', type: 'button', onclick: () => fileIn.click() }, 'Bestand' + (input.multiple ? 'en' : '') + ' kiezen'),
    el('span', { class: 'hint' }, 'Alles blijft op uw toestel.'), fileIn);
  const listBox = el('div', { class: 'flist' });
  const gridBox = el('div');
  const custom = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
  const aside = el('aside', { 'aria-label': 'Opties' });
  const resultBox = el('div', { id: 'result' });

  if (def.grid) { ctx.grid = new PageGrid(ctx, def.grid, def.gridOpts); gridBox.append(ctx.grid.el); }
  let pvTimer;
  ctx.changed = (key) => { def.onChange && def.onChange(ctx, key); updateSummary(); if (def.preview) { clearTimeout(pvTimer); pvTimer = setTimeout(() => preview(), 350); } };
  ctx.refresh = () => { renderList(); renderAside(); if (def.renderMain) def.renderMain(ctx, custom); };
  ctx.showResult = showResult;

  async function addFiles(fl) {
    let arr = [...fl];
    const want = input.kind === 'image' ? isImageFile : input.kind === 'pdf+image' ? (f) => isPdfFile(f) || isImageFile(f) : isPdfFile;
    const bad = arr.filter((f) => !want(f)); arr = arr.filter(want);
    if (bad.length) toast(`${bad.length} bestand(en) overgeslagen: verkeerd bestandstype.`, 'error');
    if (!arr.length) return;
    if (!input.multiple) { arr = arr.slice(0, 1); ctx.files = []; }
    for (const file of arr) {
      const entry = { id: ++fileSeq, file, name: file.name, size: file.size, bytes: await readBytes(file), range: '' };
      try {
        if (isPdfFile(file)) { entry.kind = 'pdf'; await probePdf(entry, { askPw: !def.noPasswordPrompt }); }
        else entry.kind = 'image';
        ctx.files.push(entry);
      } catch (e) { toast(e.message, 'error'); }
    }
    resultBox.innerHTML = '';
    if (ctx.grid) ctx.grid.sync();
    if (def.onFiles) await def.onFiles(ctx);
    ctx.refresh(); if (def.preview) preview();
  }
  fileIn.addEventListener('change', () => { addFiles(fileIn.files); fileIn.value = ''; });
  drop.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });

  function renderList() {
    listBox.innerHTML = '';
    if (!ctx.files.length) return;
    if (input.multiple) listBox.append(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      el('h2', { style: { fontSize: '16px' } }, `Bestanden (${ctx.files.length})`),
      ctx.files.length > 1 && !def.unordered ? el('span', { class: 'help' }, 'Sleep of gebruik de pijltjes om de volgorde te wijzigen') : null));
    ctx.files.forEach((f, i) => {
      const th = el('div', { class: 'th' });
      const row = el('div', { class: 'fitem', 'data-i': i },
        input.multiple && !def.unordered ? el('span', { class: 'grip', 'aria-hidden': 'true' }, icon('grip', 20)) : null,
        input.multiple ? el('span', { class: 'num' }, i + 1) : null, th,
        el('div', { class: 'info' }, el('div', { class: 'nm' }, f.name),
          el('div', { class: 'mt' }, (f.kind === 'pdf' ? `${f.pages} pagina${f.pages === 1 ? '' : "'s"} · ` : '') + fmtBytes(f.size) + (f.encrypted ? ' · beveiligd' : ''))),
        def.perFileRange ? el('div', { class: 'rng' }, el('label', { for: 'rng-' + f.id }, 'Paginabereik'),
          el('input', { id: 'rng-' + f.id, type: 'text', placeholder: 'alle', value: f.range, oninput: (e) => { f.range = e.target.value; updateSummary(); } })) : null,
        input.multiple && !def.unordered ? el('div', { style: { display: 'flex', flexDirection: 'column' } },
          el('button', { class: 'btn ghost icon sm', type: 'button', 'aria-label': 'Omhoog', disabled: i === 0, onclick: () => moveFile(i, i - 1) }, icon('up', 16)),
          el('button', { class: 'btn ghost icon sm', type: 'button', 'aria-label': 'Omlaag', disabled: i === ctx.files.length - 1, onclick: () => moveFile(i, i + 1) }, icon('down', 16))) : null,
        el('button', { class: 'btn ghost icon', type: 'button', 'aria-label': 'Bestand verwijderen', onclick: () => { ctx.files.splice(i, 1); resultBox.innerHTML = ''; if (ctx.grid) ctx.grid.sync(); def.onFiles && def.onFiles(ctx); ctx.refresh(); } }, icon('trash', 20)));
      if (input.multiple && !def.unordered) {
        row.draggable = true;
        row.addEventListener('dragstart', (e) => { ctx._drag = i; row.classList.add('dragging'); e.dataTransfer.setData('text/plain', 'f'); });
        row.addEventListener('dragend', () => row.classList.remove('dragging'));
        row.addEventListener('dragover', (e) => { if (ctx._drag != null) { e.preventDefault(); row.classList.add('dragover'); } });
        row.addEventListener('dragleave', () => row.classList.remove('dragover'));
        row.addEventListener('drop', (e) => { if (ctx._drag == null) return; e.preventDefault(); e.stopPropagation(); row.classList.remove('dragover'); moveFile(ctx._drag, i); ctx._drag = null; });
      }
      listBox.append(row);
      thumbFor(f).then((c) => c && th.append(c)).catch(() => {});
    });
  }
  function moveFile(a, b) { if (b < 0 || b >= ctx.files.length) return; const [x] = ctx.files.splice(a, 1); ctx.files.splice(b, 0, x); if (ctx.grid) ctx.grid.sync(); renderList(); updateSummary(); }

  let summaryEl, runBtn;
  function updateSummary() {
    if (!summaryEl) return;
    const s = def.summary ? def.summary(ctx) : (ctx.files.length ? `${ctx.files.length} bestand${ctx.files.length > 1 ? 'en' : ''}` : 'Nog geen bestand gekozen');
    summaryEl.replaceChildren(...(Array.isArray(s) ? s.map((x) => el('span', null, x)) : [el('span', null, s)]));
    const min = input.min || 1;
    runBtn.disabled = ctx.busy || ctx.files.length < min;
  }
  function renderAside() {
    aside.innerHTML = '';
    if (def.noRun && !def.options) { aside.style.display = 'none'; return; }
    aside.append(el('h2', { style: { fontSize: '16px' } }, 'Opties'));
    if (def.options) { const o = def.options(ctx); if (o) aside.append(...[o].flat()); }
    aside.append(el('div', { style: { flex: '1' } }));
    if (def.noRun) return;
    summaryEl = el('div', { class: 'summary', id: 'summary' });
    runBtn = el('button', { class: 'btn pri big', id: 'run', type: 'button', onclick: run }, def.runLabel || meta.name);
    aside.append(summaryEl, runBtn, el('div', { class: 'local' }, 'Verwerking gebeurt lokaal. Er worden geen bestanden verstuurd.'));
    updateSummary();
  }
  async function run() {
    if (ctx.busy) return;
    resultBox.innerHTML = '';
    const err = def.validate && def.validate(ctx);
    if (err) { resultBox.append(el('div', { class: 'err', role: 'alert' }, err)); return; }
    ctx.busy = true; const label = runBtn.textContent;
    runBtn.replaceChildren(el('span', { class: 'spin' }), el('span', { id: 'progress' }, 'Bezig…')); runBtn.disabled = true;
    ctx.progress = (m) => { const p = document.getElementById('progress'); if (p) p.textContent = m; };
    try {
      const t0 = performance.now();
      const res = await def.run(ctx);
      showResult(res, performance.now() - t0);
    } catch (e) {
      console.error(e);
      resultBox.append(el('div', { class: 'err', role: 'alert' }, 'Er ging iets mis: ' + (e.message || e)));
    } finally {
      ctx.busy = false; runBtn.textContent = label; updateSummary();
    }
  }
  function showResult(res, ms) {
    resultBox.innerHTML = '';
    if (!res) return;
    (res.outputs || []).forEach((o) => { o.name = outName(o.name); }); if (res.zipName) res.zipName = outName(res.zipName);
    const outs = res.outputs || [];
    const box = el('div', { class: 'result', role: 'status' }, el('h3', null, res.title || 'Klaar'));
    if (res.note) box.append(el('div', { class: 'note' }, res.note));
    if (outs.length > 1) {
      box.append(el('button', { class: 'btn pri', type: 'button', id: 'dl-zip', onclick: () => saveFile((res.zipName || 'resultaat') + '.zip', zip(outs)) }, icon('download', 18, '#fff'), `Alles downloaden als ZIP (${outs.length})`));
    }
    outs.slice(0, 50).forEach((o, i) => box.append(el('div', { class: 'out' },
      el('span', null, `${o.name} · ${fmtBytes(o.data.length)}`),
      el('button', { class: 'btn sm' + (outs.length === 1 ? ' pri' : ''), type: 'button', 'data-dl': i, onclick: () => saveFile(o.name, o.data) }, icon('download', 16, outs.length === 1 ? '#fff' : '#004974'), 'Downloaden'))));
    if (outs.length > 50) box.append(el('div', { class: 'note' }, `… en nog ${outs.length - 50} bestanden (in de ZIP).`));
    if (res.view) box.append(res.view);
    resultBox.append(box);
    window.__lastResult = res; // voor tests
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Live voorbeeld (pagina 1 van het resultaat)
  const pvBox = el('div');
  async function preview() {
    if (!def.preview || !ctx.files.length) { pvBox.innerHTML = ''; return; }
    try {
      const bytes = await def.preview(ctx);
      if (!bytes) { pvBox.innerHTML = ''; return; }
      const pdf = await bytesToPdfJs(bytes);
      const c = await renderPage(pdf, 1, { width: 300 });
      pvBox.replaceChildren(el('div', { class: 'flabel', style: { marginBottom: '8px' } }, 'Voorbeeld (eerste pagina)'),
        el('div', { class: 'preview', style: { padding: '14px' } }, el('div', { class: 'pw' }, c)));
    } catch (e) { pvBox.replaceChildren(el('div', { class: 'help' }, 'Geen voorbeeld: ' + e.message)); }
  }

  app.replaceChildren(topbar(el('a', { class: 'btn', href: '#' }, icon('back', 18), 'Alle hulpmiddelen')),
    el('div', { class: 'tool' },
      el('main', null,
        el('div', { class: 'thead' }, el('span', { class: 'ic' }, icon(meta.icon, 26, '#004974')),
          el('div', null, el('h1', null, meta.name), el('p', null, def.lead || meta.desc))),
        drop, listBox, def.preview ? pvBox : null, gridBox, custom, resultBox),
      aside));
  ctx.refresh();
  if (def.init) def.init(ctx);
}

const thumbCache = new WeakMap();
async function thumbFor(f) {
  if (thumbCache.has(f)) return thumbCache.get(f);
  let c;
  if (f.kind === 'pdf') { const pdf = await openPdfJs(f); c = await renderPage(pdf, 1, { width: 92 }); }
  else { c = el('img', { src: URL.createObjectURL(f.file), alt: '' }); }
  thumbCache.set(f, c); return c;
}

// Bestandsnamen van resultaten in de gekozen taal
const SUF = { bewerkt: 'edited', gesplitst: 'split', extract: 'extract', paginas: 'pages', geordend: 'organised', geroteerd: 'rotated', bijgesneden: 'cropped', genummerd: 'numbered', gecomprimeerd: 'compressed', 'zonder-metadata': 'no-metadata', beveiligd: 'protected', ontgrendeld: 'unlocked', watermerk: 'watermark', plat: 'flattened', 'kop-voet': 'header-footer', afbeeldingen: 'images' };
export function outName(n) {
  if (lang() !== 'en' || !n) return n;
  return n.replace(/_(bewerkt|gesplitst|extract|paginas|geordend|geroteerd|bijgesneden|genummerd|gecomprimeerd|zonder-metadata|beveiligd|ontgrendeld|watermerk|plat|kop-voet|afbeeldingen)((?:\.\w+)?)$/, (m, k, e) => '_' + SUF[k] + e)
    .replace(/^Geordend\.pdf$/, 'Organised.pdf').replace(/^zoekresultaten_/, 'search-results_');
}

/* ---------------- Router ---------------- */
let modsP;
function ensureModules() {
  return modsP || (modsP = loadLibs().then(() => Promise.allSettled(MODULES.map((m) => m()))).then((res) => {
    res.forEach((r) => { if (r.status === 'fulfilled' && r.value) Object.assign(IMPL, r.value); else if (r.status === 'rejected' && !String(r.reason).includes('Failed to fetch')) console.warn(r.reason); });
  }).catch((e) => { modsP = null; throw e; }));
}
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
let routeN = 0;
async function route() {
  const id = location.hash.replace(/^#/, ''); const n = ++routeN;
  if (!id) { renderHome(); window.scrollTo(0, 0); idle(() => ensureModules().catch(() => {})); return; }
  if (!modsP || !Object.keys(IMPL).length) { app.replaceChildren(el('div', { class: 'boot' }, el('span', { class: 'spin' }), el('span', null, 'Laden…'))); }
  try { await ensureModules(); } catch (e) { toast('Laden mislukt: ' + e.message, 'error'); return; }
  if (n !== routeN) return; // intussen naar een andere pagina gegaan
  const def = IMPL[id];
  if (def && def.page) { def.page(app, { topbar, meta: META[id] || def, id }); }
  else if (def) renderTool({ id, ...def });
  else renderHome();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
startI18n();
route();
export { META };
