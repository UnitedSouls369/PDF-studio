// Lettertype-bibliotheek: koppelt de lettertypenaam uit een PDF aan het best passende lettertypebestand.
// Volgorde: eigen lettertypen (geüpload of van deze computer) → identiek open lettertype → metrisch gelijk → gelijkend.
const BASE = new URL('../', import.meta.url).href;
let manifest = null;
async function getManifest() { if (!manifest) manifest = fetch(BASE + 'lib/fonts/fonts.json').then((r) => r.json()); return manifest; }

export const norm = (s) => (s || '').replace(/^[A-Z]{6}\+/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------- Naam ontleden ---------- */
const WEIGHTS = [[/hairline|thin/i, 100], [/extralight|ultralight/i, 200], [/light/i, 300], [/medium/i, 500], [/semibold|demibold|demi/i, 600], [/extrabold|ultrabold/i, 800], [/black|heavy/i, 900], [/bold/i, 700]];
export function parseName(base) {
  const b = (base || '').replace(/^[A-Z]{6}\+/, '');
  const style = (b.match(/[-,](.*)$/) || [, ''])[1] + ' ' + (b.match(/(Bold|Italic|Oblique|Light|Medium|Semibold|SemiBold|Black|Heavy|Thin|Regular|Book|Roman)+(MT|PS)?$/) || [''])[0];
  let weight = 400; for (const [re, w] of WEIGHTS) if (re.test(style) || re.test(b.replace(/^.*?(?=(Bold|Light|Medium|Semi|Demi|Black|Heavy|Thin|Extra))/, ''))) { weight = w; break; }
  if (!/bold|light|medium|semi|demi|black|heavy|thin/i.test(b)) weight = 400;
  const italic = /italic|oblique|[-,]it$|[a-z]It$/i.test(b);
  const family = b.replace(/[-,].*$/, '').replace(/(PSMT|MT|PS)$/, '').replace(/(Bold|Italic|Oblique|Light|Medium|SemiBold|Semibold|Black|Heavy|Thin|Regular|Book|Roman)+$/g, '');
  return { family, weight, italic };
}

/* ---------- Koppeling naam → bibliotheek ---------- */
// [patroon op genormaliseerde familienaam, bibliotheekfamilie, kwaliteit]
// identiek = hetzelfde (open) lettertype; metrisch = zelfde letterbreedtes als het origineel (onzichtbaar verschil in opmaak); gelijkend = zelfde stijl
const MAP = [
  [/^roboto/, 'Roboto', 'identiek'], [/^opensans/, 'Open Sans', 'identiek'], [/^lato/, 'Lato', 'identiek'], [/^montserrat/, 'Montserrat', 'identiek'],
  [/^sourcesans/, 'Source Sans 3', 'identiek'], [/^notosans(?!mono)/, 'Noto Sans', 'identiek'], [/^notoserif/, 'Noto Serif', 'identiek'], [/^gelasio/, 'Gelasio', 'identiek'],
  [/^ebgaramond/, 'EB Garamond', 'identiek'], [/^ptsans/, 'PT Sans', 'identiek'], [/^ptserif/, 'PT Serif', 'identiek'], [/^raleway/, 'Raleway', 'identiek'],
  [/^nunitosans/, 'Nunito Sans', 'identiek'], [/^arimo/, 'Arimo', 'identiek'], [/^tinos/, 'Tinos', 'identiek'], [/^cousine/, 'Cousine', 'identiek'], [/^ubuntu/, 'Ubuntu', 'identiek'],
  [/^merriweather/, 'Merriweather', 'identiek'], [/^playfair/, 'Playfair Display', 'identiek'], [/^worksans/, 'Work Sans', 'identiek'], [/^firasans/, 'Fira Sans', 'identiek'],
  [/^ibmplexsans/, 'IBM Plex Sans', 'identiek'], [/^titillium/, 'Titillium Web', 'identiek'], [/^oswald/, 'Oswald', 'identiek'], [/^inter/, 'Inter', 'identiek'], [/^poppins/, 'Poppins', 'identiek'],
  [/^liberationsans/, 'Liberation Sans', 'identiek'], [/^liberationserif/, 'Liberation Serif', 'identiek'], [/^liberationmono/, 'Liberation Mono', 'identiek'],
  [/^carlito/, 'Carlito', 'identiek'], [/^caladea/, 'Caladea', 'identiek'], [/^dejavusansmono/, 'DejaVu Sans Mono', 'identiek'], [/^dejavuserif/, 'DejaVu Serif', 'identiek'], [/^dejavusans/, 'DejaVu Sans', 'identiek'],
  [/^(lmroman|cmr|cmbx|cmti|cmsl|latinmodernroman)/, 'Latin Modern Roman', 'identiek'], [/^(lmsans|cmss|latinmodernsans)/, 'Latin Modern Sans', 'identiek'], [/^(lmmono|cmtt|latinmodernmono)/, 'Latin Modern Mono', 'identiek'],
  [/^texgyreheros|^nimbussans/, 'TeX Gyre Heros', 'identiek'], [/^texgyretermes|^nimbusroman/, 'TeX Gyre Termes', 'identiek'], [/^texgyrecursor|^nimbusmono/, 'TeX Gyre Cursor', 'identiek'],
  [/^texgyrepagella|^urwpalladio|^p052/, 'TeX Gyre Pagella', 'identiek'], [/^texgyrebonum|^urwbookman/, 'TeX Gyre Bonum', 'identiek'], [/^texgyreschola|^centuryschl/, 'TeX Gyre Schola', 'identiek'], [/^texgyreadventor|^urwgothic/, 'TeX Gyre Adventor', 'identiek'],
  // eigendomslettertypen → metrisch gelijke tegenhanger
  [/^(arial(?!narrow|black|rounded)|helvetica(?!neue)|arialmt)/, 'Liberation Sans', 'metrisch'], [/^(timesnewroman|times)/, 'Liberation Serif', 'metrisch'], [/^(couriernew|courier)/, 'Liberation Mono', 'metrisch'],
  [/^calibri/, 'Carlito', 'metrisch'], [/^cambria/, 'Caladea', 'metrisch'], [/^georgia/, 'Gelasio', 'metrisch'],
  [/^(palatino|bookantiqua)/, 'TeX Gyre Pagella', 'metrisch'], [/^(bookman)/, 'TeX Gyre Bonum', 'metrisch'], [/^(centuryschoolbook|newcenturyschlbk)/, 'TeX Gyre Schola', 'metrisch'],
  [/^(avantgarde|itcavantgarde)/, 'TeX Gyre Adventor', 'metrisch'], [/^(zapfchancery|itczapfchancery)/, 'TeX Gyre Chorus', 'metrisch'],
  // overige veelgebruikte → gelijkend
  [/^helveticaneue|^segoeui|^aptos|^frutiger|^myriad|^univers|^dinpro|^din|^avenir|^gillsans|^corbel|^candara|^franklingothic/, 'Liberation Sans', 'gelijkend'],
  [/^(verdana|tahoma|trebuchet|lucidasans|lucidagrande|microsoftsansserif|dejavu)/, 'DejaVu Sans', 'gelijkend'], [/^centurygothic|^futura/, 'TeX Gyre Adventor', 'gelijkend'],
  [/^(garamond|adobegaramond|minion|constantia|sabon|baskerville|bembo|caslon)/, 'EB Garamond', 'gelijkend'], [/^(consolas|lucidaconsole|menlo|monaco|sourcecode|andalemono)/, 'DejaVu Sans Mono', 'gelijkend'],
  [/^(arialnarrow|ariblack|arialblack|impact|bahnschrift)/, 'Oswald', 'gelijkend'], [/^(century|bodoni|didot)/, 'TeX Gyre Schola', 'gelijkend']
];
function classOf(f) { // f: {family, serif, mono}
  if (f.mono) return ['Liberation Mono', 'gelijkend'];
  if (f.serif) return ['Liberation Serif', 'gelijkend'];
  return ['Liberation Sans', 'gelijkend'];
}

/* ---------- Eigen lettertypen (geüpload of van deze computer) ---------- */
const own = []; // {name, ps, family, sub, weight, italic, bytes, source}
let ownLoaded = null;
function idb() { return new Promise((res, rej) => { try { const r = indexedDB.open('pdf-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('fonts', { keyPath: 'ps' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); }
export async function loadOwnFonts(fk) {
  if (ownLoaded) return ownLoaded;
  ownLoaded = (async () => { try { const db = await idb(); const all = await new Promise((res) => { const q = db.transaction('fonts').objectStore('fonts').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); for (const r of all) registerParsed(fk, r.bytes, r.source || 'upload', false); } catch {} return own; })();
  return ownLoaded;
}
function registerParsed(fk, bytes, source, persist) {
  let f; try { f = fk.create(bytes); } catch { return []; }
  const fonts = f.fonts ? f.fonts : [f]; const added = [];
  for (const x of fonts) {
    try {
      const ps = x.postscriptName || ''; const fam = x.familyName || ''; const sub = x.subfamilyName || '';
      const os2 = x['OS/2'] || {}; const weight = os2.usWeightClass || (/bold/i.test(sub) ? 700 : 400);
      const italic = !!x.italicAngle || /italic|oblique/i.test(sub);
      const fileBytes = f.fonts ? null : bytes; // collecties (.ttc) kunnen niet rechtstreeks ingesloten worden
      if (!fileBytes) continue;
      const rec = { ps, family: fam, sub, weight, italic, bytes: fileBytes, source, name: x.fullName || ps };
      const i = own.findIndex((o) => norm(o.ps) === norm(ps)); if (i >= 0) own[i] = rec; else own.push(rec);
      added.push(rec);
      if (persist) idb().then((db) => db.transaction('fonts', 'readwrite').objectStore('fonts').put({ ps, bytes: fileBytes, source })).catch(() => {});
    } catch {}
  }
  return added;
}
export function addOwnFont(fk, bytes, source = 'upload') { return registerParsed(fk, bytes, source, true); }
export function ownFonts() { return own; }
export const localFontsSupported = () => typeof window.queryLocalFonts === 'function';
// Zoekt lettertypen op deze computer die overeenkomen met de gegeven PDF-namen (vraagt toestemming aan de gebruiker)
export async function findLocalFonts(fk, names) {
  const want = new Set(names.map((n) => norm(n)));
  const fams = new Set(names.map((n) => norm(parseName(n).family)));
  const list = await window.queryLocalFonts();
  let n = 0;
  for (const fd of list) {
    const ps = norm(fd.postscriptName), fam = norm(fd.family);
    if (!want.has(ps) && !fams.has(fam) && !want.has(norm(fd.fullName))) continue;
    try { const bytes = new Uint8Array(await (await fd.blob()).arrayBuffer()); n += addOwnFont(fk, bytes, 'computer').length; } catch {}
  }
  return n;
}

/* ---------- Oplossen ---------- */
function nearest(files, weight, italic) {
  let best = null, d = 1e9;
  for (const [k, file] of Object.entries(files)) {
    const w = parseInt(k, 10), it = k.endsWith('i'); const dd = Math.abs(w - weight) + (it === italic ? 0 : 1000);
    if (dd < d) { d = dd; best = file; }
  }
  return best;
}
const byteCache = new Map();
const fetchFont = (file) => { if (!byteCache.has(file)) byteCache.set(file, fetch(BASE + 'lib/fonts/' + file).then((r) => { if (!r.ok) throw new Error('lettertype ' + file); return r.arrayBuffer(); }).then((b) => new Uint8Array(b))); return byteCache.get(file); };

/**
 * Kandidaten voor een gewenst lettertype, beste eerst.
 * want: { base (PDF-naam), family (optioneel, UI-keuze), weight, italic, serif, mono }
 * → [{ key, label, quality, load: () => Promise<Uint8Array> }]
 */
export async function candidates(want) {
  const out = []; const m = await getManifest();
  const p = parseName(want.base || ''); const weight = want.weight ?? p.weight; const italic = want.italic ?? p.italic;
  const nb = norm(want.base), nf = norm(want.family || p.family);
  // 1. eigen lettertypen
  const exact = own.find((o) => norm(o.ps) === nb && (o.weight >= 600) === (weight >= 600) && o.italic === italic);
  const famMatches = own.filter((o) => nf && (norm(o.family) === nf || norm(o.ps).startsWith(nf)));
  let ownPick = exact; if (!ownPick && famMatches.length) { ownPick = famMatches.reduce((b, o) => (Math.abs(o.weight - weight) + (o.italic === italic ? 0 : 1000) < Math.abs(b.weight - weight) + (b.italic === italic ? 0 : 1000) ? o : b)); if (ownPick.italic !== italic) ownPick = null; }
  if (ownPick) out.push({ key: 'own:' + ownPick.ps, label: ownPick.name + (ownPick.source === 'computer' ? ' (van deze computer)' : ' (uw lettertype)'), quality: 'identiek', load: async () => ownPick.bytes });
  // 2. bibliotheek
  let fam = null, quality = 'gelijkend';
  if (want.uiFamily) [fam, quality] = [{ Helvetica: 'Liberation Sans', Times: 'Liberation Serif', Courier: 'Liberation Mono' }[want.uiFamily], 'gelijkend'];
  else for (const [re, f, q] of MAP) if (re.test(nf)) { fam = f; quality = q; break; }
  if (!fam || !m[fam]) [fam, quality] = classOf(want);
  const file = nearest(m[fam], weight, italic);
  out.push({ key: 'lib:' + file, label: fam, quality, load: () => fetchFont(file) });
  // 3. breed dekkend reservelettertype voor speciale tekens
  const dv = want.mono ? 'DejaVu Sans Mono' : want.serif ? 'DejaVu Serif' : 'DejaVu Sans';
  const dfile = nearest(m[dv], weight, italic); if (dfile !== file) out.push({ key: 'lib:' + dfile, label: dv, quality: 'gelijkend', load: () => fetchFont(dfile) });
  return out;
}
