// PDF/A-2b / PDF/A-3b omzetten (archiefformaat): lettertypen insluiten, kleurprofiel, XMP-metadata, verboden inhoud weg
import { L } from './i18n.js';
import { el, F, PDFLib, loadPdf, openPdfJs, bytesToPdfJs, baseName, pdfjsLib } from './core.js';

const { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, PDFRawStream, PDFRef, PDFNumber, PDFString, PDFHexString, PDFBool, decodePDFRawStream } = PDFLib;
const N = (x) => PDFName.of(x);
const BASE = new URL('../', import.meta.url).href;
const b64 = async (p) => { const m = await import(BASE + p); const s = atob(m.default); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const fetchBytes = async (p) => new Uint8Array(await (await fetch(BASE + p)).arrayBuffer());

/* Windows-1252 → Unicode (voor breedtes van ingesloten vervangers) */
const W1252 = { 128: 0x20ac, 130: 0x201a, 131: 0x192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x2c6, 137: 0x2030, 138: 0x160, 139: 0x2039, 140: 0x152, 142: 0x17d, 145: 0x2018, 146: 0x2019, 147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x2dc, 153: 0x2122, 154: 0x161, 155: 0x203a, 156: 0x153, 158: 0x17e, 159: 0x178 };
const uniOf = (c) => W1252[c] || c;
const STD = [[/^(arial|helvetica|arialmt|arialnarrow|helv)/, 'LiberationSans'], [/^(times|timesnewroman|tmsrmn)/, 'LiberationSerif'], [/^(courier|couriernew)/, 'LiberationMono']];

function walk(ctx, fn) { for (const [ref, obj] of ctx.enumerateIndirectObjects()) fn(obj, ref); }
const dictOf = (o) => (o instanceof PDFDict ? o : o && o.dict instanceof PDFDict ? o.dict : null);
const nameStr = (o) => (o instanceof PDFName ? o.decodeText() : o ? String(o).replace(/^\//, '') : '');

export async function toPdfA(src, pdfjs, { part = 2, rasterFallback = true, progress, title } = {}) {
  const doc = src; const ctx = doc.context; const cat = doc.catalog; const log = { removed: [], fixed: [], raster: [], warnings: [] };
  const add = (k, msg) => log[k].push(msg);
  // 1. Verboden of ongewenste onderdelen
  cat.delete(N('AA')); if (cat.get(N('OpenAction'))) { const oa = cat.lookup(N('OpenAction')); if (oa instanceof PDFDict && /JavaScript|Launch/.test(String(oa.get(N('S'))))) { cat.delete(N('OpenAction')); add('removed', 'JavaScript bij openen'); } }
  const names = cat.lookup(N('Names')); if (names instanceof PDFDict) { if (names.get(N('JavaScript'))) { names.delete(N('JavaScript')); add('removed', 'JavaScript'); } if (part < 3 && names.get(N('EmbeddedFiles'))) { names.delete(N('EmbeddedFiles')); add('removed', 'bijlagen (niet toegestaan in PDF/A-2)'); } }
  const af = cat.lookup(N('AcroForm')); if (af instanceof PDFDict) { if (af.get(N('XFA'))) { af.delete(N('XFA')); add('removed', 'XFA-formulier'); } af.set(N('NeedAppearances'), PDFBool.False); }
  cat.delete(N('NeedsRendering')); cat.delete(N('Perms')); if (part < 3) cat.delete(N('AF'));
  // optionele inhoud: elke configuratie een naam, geen AS
  const ocp = cat.lookup(N('OCProperties')); if (ocp instanceof PDFDict) { const cfgs = [ocp.lookup(N('D'))].concat(ocp.lookup(N('Configs')) instanceof PDFArray ? ocp.lookup(N('Configs')).asArray().map((r) => ctx.lookup(r)) : []); cfgs.forEach((c, i) => { if (c instanceof PDFDict) { if (!c.get(N('Name'))) c.set(N('Name'), PDFString.of(i ? 'Config ' + i : 'Standaard')); c.delete(N('AS')); } }); }
  let js = 0, ann = 0, gs = 0, interp = 0, lzw = 0;
  const BAD_ACTIONS = /JavaScript|Launch|Sound|Movie|ResetForm|ImportData|Hide|SetOCGState|Rendition|Trans|GoTo3DView/;
  walk(ctx, (obj, ref) => {
    const d = dictOf(obj); if (!d) return;
    const type = nameStr(d.get(N('Type'))), sub = nameStr(d.get(N('Subtype')));
    if (d.get(N('AA')) && (type === 'Annot' || type === 'Page' || d.get(N('FT')) || d.get(N('Kids')))) { d.delete(N('AA')); js++; }
    const a = d.lookup(N('A')); if (a instanceof PDFDict && BAD_ACTIONS.test(nameStr(a.get(N('S'))))) { d.delete(N('A')); js++; }
    if (type === 'Annot' || ['Link', 'Text', 'Widget', 'Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'FreeText', 'Square', 'Circle', 'Line', 'Polygon', 'PolyLine', 'Ink', 'Stamp', 'Caret', 'Popup', 'FileAttachment', 'Sound', 'Movie', 'Screen', '3D', 'RichMedia'].includes(sub) && d.get(N('Rect'))) {
      let f = d.get(N('F')) instanceof PDFNumber ? d.get(N('F')).asNumber() : 0; f = (f | 4) & ~(1 | 2 | 32); d.set(N('F'), PDFNumber.of(f)); ann++;
    }
    if (type === 'ExtGState' || d.get(N('TR')) || d.get(N('TR2')) || d.get(N('HTP'))) { for (const k of ['TR', 'HTP']) if (d.get(N(k))) { d.delete(N(k)); gs++; } const tr2 = d.get(N('TR2')); if (tr2 && nameStr(tr2) !== 'Default') { d.delete(N('TR2')); gs++; } }
    if (sub === 'Image') { const ip = d.get(N('Interpolate')); if (ip && String(ip) === 'true') { d.set(N('Interpolate'), PDFBool.False); interp++; } d.delete(N('Alternates')); d.delete(N('OPI')); }
    if (sub === 'Form') { d.delete(N('OPI')); d.delete(N('PS')); if (d.get(N('Subtype2')) && nameStr(d.get(N('Subtype2'))) === 'PS') d.delete(N('Subtype2')); }
    if (obj instanceof PDFRawStream && /LZWDecode/.test(String(d.get(N('Filter'))))) { try { const raw = decodePDFRawStream(obj).decode(); d.delete(N('Filter')); d.delete(N('DecodeParms')); const ns = ctx.flateStream(raw, Object.fromEntries([...d.entries()].filter(([k]) => !['Length', 'Filter', 'DecodeParms'].includes(k.decodeText())).map(([k, v]) => [k.decodeText(), v]))); ctx.assign(ref, ns); lzw++; } catch (e) { add('warnings', 'LZW-stroom kon niet omgezet worden'); } }
  });
  if (js) add('removed', `${js} actie(s)/script(s)`); if (gs) add('fixed', `${gs} overdrachtsfunctie(s)`); if (interp) add('fixed', `${interp} afbeelding(en) zonder interpolatie`); if (lzw) add('fixed', `${lzw} LZW-stroom/stromen omgezet`); if (ann) add('fixed', `${ann} opmerking(en)/veld(en) afdrukbaar gemaakt`);
  // annotaties zonder weergave (behalve koppelingen en pop-ups) zijn niet toegestaan → verwijderen
  let noAp = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookup(N('Annots')); if (!(annots instanceof PDFArray)) continue;
    const keep = annots.asArray().filter((r) => { const a = ctx.lookup(r); if (!(a instanceof PDFDict)) return false; const s = nameStr(a.get(N('Subtype'))); if (['Sound', 'Movie', 'Screen', '3D', 'RichMedia'].includes(s) || (s === 'FileAttachment' && part < 3)) { noAp++; return false; } if (['Link', 'Popup'].includes(s)) return true; if (!a.get(N('AP'))) { const rect = a.lookup(N('Rect')); const zero = rect instanceof PDFArray && rect.size() === 4 && Math.abs(rect.lookup(2).asNumber() - rect.lookup(0).asNumber()) < 0.01; if (!zero) { noAp++; return false; } } return true; });
    if (keep.length !== annots.size()) page.node.set(N('Annots'), ctx.obj(keep));
  }
  if (noAp) add('removed', `${noAp} opmerking(en) zonder weergave of met media`);

  // 2. Lettertypen: niet-ingesloten standaardlettertypen vervangen door metrisch gelijke, ingesloten lettertypen
  const fkP = (async () => { const m = await import('./textengine.js'); return m.ensureFontkit(); })();
  const embedCache = new Map(); let embedded = 0; const badPages = new Set(); const failed = new Set();
  const isEmb = (fd) => fd instanceof PDFDict && (fd.get(N('FontFile')) || fd.get(N('FontFile2')) || fd.get(N('FontFile3')));
  async function embedSimple(font) {
    const base = nameStr(font.get(N('BaseFont'))).replace(/^[A-Z]{6}\+/, ''); const nb = base.toLowerCase().replace(/[^a-z]/g, '');
    if (/symbol|dingbat|wingding/.test(nb)) return false;
    const fam = (STD.find(([re]) => re.test(nb)) || [])[1]; let file;
    if (fam) { const bold = /bold|black|heavy|semibold/.test(nb), it = /italic|oblique/.test(nb); file = `${fam}-${bold ? 700 : 400}${it ? 'i' : ''}.ttf`; }
    else { try { const { candidates } = await import('./fontlib.js'); const c = (await candidates({ base })).find((x) => x.key.startsWith('lib:')); if (c) file = c.key.slice(4); } catch {} }
    if (!file) return false;
    if (!embedCache.has(file)) embedCache.set(file, (async () => { const bytes = await fetchBytes('lib/fonts/' + file); const fk = await fkP; const f = fk.create(bytes); const stream = ctx.register(ctx.flateStream(bytes, { Length1: bytes.length })); return { f, stream }; })());
    const { f, stream } = await embedCache.get(file); const k = 1000 / f.unitsPerEm;
    const it = /i\.ttf$/.test(file), bold = /-7\d\d/.test(file), serif = /Serif|Times|Caladea|Tinos|Termes/i.test(file), mono = /Mono|Cousine|Courier/i.test(file);
    const fd = ctx.obj({ Type: 'FontDescriptor', FontName: N(base.replace(/[^A-Za-z0-9+\-]/g, '') || 'Font'), Flags: 32 | (it ? 64 : 0) | (serif ? 2 : 0) | (mono ? 1 : 0) | (bold ? 262144 : 0), FontBBox: [f.bbox.minX * k, f.bbox.minY * k, f.bbox.maxX * k, f.bbox.maxY * k].map(Math.round), ItalicAngle: f.italicAngle || 0, Ascent: Math.round(f.ascent * k), Descent: Math.round(f.descent * k), CapHeight: Math.round((f.capHeight || f.ascent * 0.7) * k), StemV: bold ? 140 : 80, FontFile2: stream });
    font.set(N('FontDescriptor'), ctx.register(fd)); font.set(N('Subtype'), N('TrueType'));
    const enc = font.lookup(N('Encoding'));
    if (!enc || (enc instanceof PDFName && !['WinAnsiEncoding', 'MacRomanEncoding'].includes(enc.decodeText()))) font.set(N('Encoding'), N('WinAnsiEncoding'));
    else if (enc instanceof PDFDict) { const be = enc.get(N('BaseEncoding')); if (!be || !['WinAnsiEncoding', 'MacRomanEncoding'].includes(nameStr(be))) enc.set(N('BaseEncoding'), N('WinAnsiEncoding')); }
    const ws = []; for (let c = 32; c <= 255; c++) { const g = f.glyphForCodePoint(uniOf(c)); ws.push(Math.round((g ? g.advanceWidth : 0) * k)); }
    font.set(N('FirstChar'), PDFNumber.of(32)); font.set(N('LastChar'), PDFNumber.of(255)); font.set(N('Widths'), ctx.obj(ws));
    return true;
  }
  // alle lettertypen in het bestand (ook in formulieren en weergaven van opmerkingen)
  const allFonts = []; walk(ctx, (obj, ref) => { if (obj instanceof PDFDict && nameStr(obj.get(N('Type'))) === 'Font') allFonts.push([ref, obj]); });
  for (const [ref, font] of allFonts) {
    const st = nameStr(font.get(N('Subtype')));
    if (st === 'Type3' || st === 'CIDFontType0' || st === 'CIDFontType2') continue;
    if (st === 'Type0') { const df = font.lookup(N('DescendantFonts')); const d0 = df instanceof PDFArray ? df.lookup(0) : null; if (!(d0 instanceof PDFDict) || !isEmb(d0.lookup(N('FontDescriptor')))) failed.add(ref.toString()); continue; }
    if (isEmb(font.lookup(N('FontDescriptor')))) continue;
    try { if (await embedSimple(font)) embedded++; else failed.add(ref.toString()); } catch (e) { console.warn('lettertype', e); failed.add(ref.toString()); }
  }
  if (failed.size) { // welke pagina's gebruiken een lettertype dat niet ingesloten kon worden?
    const contentOf = (pg) => { try { const c = pg.node.Contents(); const arr = c instanceof PDFArray ? c.asArray().map((r) => ctx.lookup(r)) : [c]; return arr.map((st) => st instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(st).decode()) : '').join('\n'); } catch { return null; } };
    const uses = (res, seen = new Set(), content = null) => { if (!(res instanceof PDFDict)) return false; const fd = res.lookup(N('Font')); if (fd instanceof PDFDict) for (const [k, v] of fd.entries()) if (failed.has(v.toString()) && (content == null || new RegExp('/' + k.decodeText().replace(/[^A-Za-z0-9]/g, '\\$&') + '\\s+[-\\d.]+\\s+Tf').test(content))) return true; const xo = res.lookup(N('XObject')); if (xo instanceof PDFDict) for (const [, v] of xo.entries()) { if (seen.has(v.toString())) continue; seen.add(v.toString()); const xd = dictOf(ctx.lookup(v)); if (xd && nameStr(xd.get(N('Subtype'))) === 'Form' && uses(xd.lookup(N('Resources')), seen)) return true; } return false; };
    const apUses = (a) => { const ap = a.lookup(N('AP')); if (!(ap instanceof PDFDict)) return false; for (const k of ['N', 'R', 'D']) { const v = ap.lookup(N(k)); const list = v instanceof PDFDict && !(v instanceof PDFStream) ? [...v.entries()].map(([, x]) => ctx.lookup(x)) : [v]; for (const s of list) { const sd = dictOf(s); if (sd && uses(sd.lookup(N('Resources')))) return true; } } return false; };
    doc.getPages().forEach((pg, pi) => { if (uses(pg.node.Resources(), new Set(), contentOf(pg))) badPages.add(pi); const an = pg.node.lookup(N('Annots')); if (an instanceof PDFArray) for (const r of an.asArray()) { const a = ctx.lookup(r); if (a instanceof PDFDict && apUses(a)) badPages.add(pi); } });
    // niet-gebruikte, niet-insluitbare lettertypen uit formulierbronnen weghalen
    const dr = af instanceof PDFDict ? af.lookup(N('DR')) : null; const drf = dr instanceof PDFDict ? dr.lookup(N('Font')) : null;
    if (drf instanceof PDFDict) for (const [k, v] of [...drf.entries()]) if (failed.has(v.toString())) drf.delete(k);
  }
  if (embedded) add('fixed', `${embedded} lettertype(n) ingesloten (metrisch gelijke vervanger)`);
  // 3. Pagina's die niet conform te maken zijn → afbeelding (met onzichtbare, doorzoekbare tekst)
  if (badPages.size) {
    if (!rasterFallback) throw new Error(L(`Pagina ${[...badPages].map((p) => p + 1).join(', ')} gebruikt lettertypen die niet ingesloten kunnen worden.`, `Page ${[...badPages].map((p) => p + 1).join(', ')} uses fonts that cannot be embedded.`));
    const fontBytes = await fetchBytes('lib/fonts/LiberationSans-400.ttf'); doc.registerFontkit(await fkP); const tf = await doc.embedFont(fontBytes, { subset: false });
    for (const pi of [...badPages].sort((a, b) => a - b)) {
      progress && progress(L(`Pagina ${pi + 1} omzetten naar afbeelding…`, `Converting page ${pi + 1} to an image…`));
      const pp = await pdfjs.getPage(pi + 1); const vp1 = pp.getViewport({ scale: 1 }); const vp = pp.getViewport({ scale: 200 / 72 });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await pp.render({ canvasContext: g, viewport: vp }).promise; const jpg = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88))).arrayBuffer()); c.width = c.height = 0;
      const img = await doc.embedJpg(jpg); const np = doc.insertPage(pi, [vp1.width, vp1.height]); np.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
      const tc = await pp.getTextContent();
      for (const itx of tc.items) { if (!itx.str || !itx.str.trim()) continue; const t = pdfjsLib.Util.transform(vp1.transform, itx.transform); const size = Math.hypot(t[2], t[3]); if (size < 1) continue; let s = ''; for (const ch of itx.str) { try { tf.encodeText(ch); if (tf.embedder.font.hasGlyphForCodePoint(ch.codePointAt(0))) s += ch; } catch {} } if (!s.trim()) continue; try { np.drawText(s, { x: t[4], y: vp1.height - t[5], size, font: tf, opacity: 0 }); } catch {} }
      doc.removePage(pi + 1); add('raster', String(pi + 1)); 
    }
  }
  if (failed.size) { // overgebleven verwijzingen naar niet-insluitbare lettertypen opruimen (worden niet meer gebruikt)
    for (const pg of doc.getPages()) { const fd = pg.node.Resources() && pg.node.Resources().lookup(N('Font')); if (fd instanceof PDFDict) for (const [k, v] of [...fd.entries()]) if (failed.has(v.toString())) fd.delete(k); }
    for (const [ref] of allFonts) if (failed.has(ref.toString())) ctx.delete(ref);
  }
  // 4. Kleur: sRGB als uitvoerintentie; bij CMYK-gebruik een standaard-CMYK-profiel per pagina
  const srgb = await b64('lib/icc/srgb.js'); const iccRef = ctx.register(ctx.flateStream(srgb, { N: 3 }));
  cat.set(N('OutputIntents'), ctx.obj([ctx.obj({ Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'), Info: PDFString.of('sRGB IEC61966-2.1'), RegistryName: PDFString.of('http://www.color.org'), DestOutputProfile: iccRef })]));
  let cmyk = false;
  walk(ctx, (obj) => { if (cmyk) return; const d = dictOf(obj); if (d && /DeviceCMYK/.test(String(d.get(N('ColorSpace')) || '') + String(d.get(N('CS')) || ''))) cmyk = true;
    if (!cmyk && obj instanceof PDFRawStream && !d.get(N('Subtype'))) { try { const s = new TextDecoder('latin1').decode(decodePDFRawStream(obj).decode().subarray(0, 400000)); if (/(^|\s)-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+[kK](\s|$)|\/DeviceCMYK/.test(s)) cmyk = true; } catch {} } });
  if (cmyk) {
    const fogra = await b64('lib/icc/fogra39.js'); const cRef = ctx.register(ctx.flateStream(fogra, { N: 4 })); const csArr = ctx.register(ctx.obj([N('ICCBased'), cRef]));
    const addDef = (res) => { if (!(res instanceof PDFDict)) return; let cs = res.lookup(N('ColorSpace')); if (!(cs instanceof PDFDict)) { cs = ctx.obj({}); res.set(N('ColorSpace'), cs); } if (!cs.get(N('DefaultCMYK'))) cs.set(N('DefaultCMYK'), csArr); };
    for (const p of doc.getPages()) addDef(p.node.Resources());
    walk(ctx, (obj) => { const d = dictOf(obj); if (d && nameStr(d.get(N('Subtype'))) === 'Form') { let r = d.lookup(N('Resources')); if (!(r instanceof PDFDict)) { r = ctx.obj({}); d.set(N('Resources'), r); } addDef(r); } });
    add('fixed', 'CMYK-kleuren gekoppeld aan een standaardprofiel (FOGRA39)');
  }
  // 5. Metadata (Info + XMP, identiek) en bestands-ID
  const now = new Date(); const pad = (n) => String(n).padStart(2, '0');
  const pdfDate = `D:${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const xmpDate = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const info = ctx.lookup(ctx.trailerInfo.Info); const getI = (k) => { const v = info instanceof PDFDict ? info.lookup(N(k)) : null; return v && v.decodeText ? v.decodeText() : ''; };
  const t = title || getI('Title'), author = getI('Author'), subject = getI('Subject'), keywords = getI('Keywords'), creatorTool = getI('Creator');
  const created = (() => { const c = getI('CreationDate'); const m = c.match(/D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/); return m ? { pdf: `D:${m[1]}${m[2] || '01'}${m[3] || '01'}${m[4] || '00'}${m[5] || '00'}${m[6] || '00'}Z`, xmp: `${m[1]}-${m[2] || '01'}-${m[3] || '01'}T${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}Z` } : { pdf: pdfDate, xmp: xmpDate }; })();
  const producer = document.title.includes('ABN') ? 'ABN PDF Studio' : 'PDF Studio';
  const newInfo = ctx.obj({ Producer: PDFHexString.fromText(producer), CreationDate: PDFString.of(created.pdf), ModDate: PDFString.of(pdfDate) });
  if (t) newInfo.set(N('Title'), PDFHexString.fromText(t)); if (author) newInfo.set(N('Author'), PDFHexString.fromText(author)); if (subject) newInfo.set(N('Subject'), PDFHexString.fromText(subject)); if (keywords) newInfo.set(N('Keywords'), PDFHexString.fromText(keywords)); if (creatorTool) newInfo.set(N('Creator'), PDFHexString.fromText(creatorTool));
  ctx.trailerInfo.Info = ctx.register(newInfo);
  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>${part}</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format>${t ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${x(t)}</rdf:li></rdf:Alt></dc:title>` : ''}${author ? `<dc:creator><rdf:Seq><rdf:li>${x(author)}</rdf:li></rdf:Seq></dc:creator>` : ''}${subject ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${x(subject)}</rdf:li></rdf:Alt></dc:description>` : ''}</rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>${created.xmp}</xmp:CreateDate><xmp:ModifyDate>${xmpDate}</xmp:ModifyDate><xmp:MetadataDate>${xmpDate}</xmp:MetadataDate>${creatorTool ? `<xmp:CreatorTool>${x(creatorTool)}</xmp:CreatorTool>` : ''}</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>${x(producer)}</pdf:Producer>${keywords ? `<pdf:Keywords>${x(keywords)}</pdf:Keywords>` : ''}</rdf:Description>
</rdf:RDF></x:xmpmeta>
${' '.repeat(2000)}
<?xpacket end="w"?>`;
  cat.set(N('Metadata'), ctx.register(ctx.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' })));
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((v) => v.toString(16).padStart(2, '0')).join('');
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);
  ctx.trailerInfo.Encrypt = undefined;
  return log;
}

// Eenvoudige controle achteraf (de belangrijkste PDF/A-regels)
export async function checkPdfA(bytes) {
  const d = await PDFDocument.load(bytes, { updateMetadata: false }); const ctx = d.context; const res = [];
  const ok = (cond, msg) => res.push({ ok: !!cond, msg });
  const meta = d.catalog.lookup(N('Metadata')); let xmp = ''; if (meta instanceof PDFRawStream) xmp = new TextDecoder().decode(meta.contents);
  ok(/pdfaid:part>[23]</.test(xmp), L('PDF/A-kenmerk in de metadata', 'PDF/A identification in metadata'));
  ok(meta instanceof PDFRawStream && !meta.dict.get(N('Filter')), L('Metadata leesbaar (niet gecomprimeerd)', 'Metadata readable (not compressed)'));
  ok(d.catalog.lookup(N('OutputIntents')) instanceof PDFArray, L('Kleurprofiel (sRGB) ingesloten', 'Colour profile (sRGB) embedded'));
  ok(ctx.trailerInfo.ID, L('Bestands-ID aanwezig', 'File ID present'));
  ok(!ctx.trailerInfo.Encrypt, L('Niet versleuteld', 'Not encrypted'));
  let notEmb = 0, jsN = 0;
  walk(ctx, (o) => { const dd = dictOf(o); if (!dd) return; const ty = nameStr(dd.get(N('Type'))); if (ty === 'Font') { const st = nameStr(dd.get(N('Subtype'))); if (st === 'Type3' || st === 'Type0') return; const fd = dd.lookup(N('FontDescriptor')); if (!(fd instanceof PDFDict) || !(fd.get(N('FontFile')) || fd.get(N('FontFile2')) || fd.get(N('FontFile3')))) notEmb++; } if (ty === 'FontDescriptor') return; const a = dd.lookup(N('S')); if (a && /JavaScript|Launch/.test(String(a))) jsN++; });
  ok(!notEmb, notEmb ? L(`${notEmb} lettertype(n) niet ingesloten`, `${notEmb} font(s) not embedded`) : L('Alle lettertypen ingesloten', 'All fonts embedded'));
  ok(!jsN && !(d.catalog.lookup(N('Names')) instanceof PDFDict && d.catalog.lookup(N('Names')).get(N('JavaScript'))), L('Geen JavaScript of startacties', 'No JavaScript or launch actions'));
  return res;
}

const pdfa = {
  input: { multiple: true }, runLabel: 'Omzetten naar PDF/A', lead: 'Maakt een archiefversie (PDF/A) voor langdurige bewaring: alle lettertypen ingesloten, vast kleurprofiel, volledige metadata, geen scripts of externe inhoud.',
  options: (ctx) => [
    F.seg(ctx, 'part', 'Variant', [[2, 'PDF/A-2b (aanbevolen)'], [3, 'PDF/A-3b (bijlagen toegestaan)']], 2),
    F.check(ctx, 'raster', 'Pagina\'s die niet om te zetten zijn als afbeelding opnemen (tekst blijft doorzoekbaar)', true),
    el('div', { class: 'help' }, 'Niet-ingesloten lettertypen zoals Arial, Helvetica, Times en Courier worden vervangen door metrisch gelijke lettertypen, zodat de opmaak exact gelijk blijft.')
  ],
  summary: (ctx) => ctx.files.length ? `${ctx.files.length} bestand(en)` : 'Nog geen bestand gekozen',
  async run(ctx) {
    const outs = []; const notes = []; let report = null;
    for (const f of ctx.files) {
      ctx.progress(`${f.name}…`);
      const doc = await loadPdf(f); const pdf = await openPdfJs(f);
      const log = await toPdfA(doc, pdf, { part: +ctx.opts.part || 2, rasterFallback: ctx.opts.raster, progress: ctx.progress, title: null });
      const bytes = await doc.save({ useObjectStreams: true });
      const chk = await checkPdfA(bytes); report = report || chk;
      outs.push({ name: `${baseName(f.name)}_pdfa.pdf`, data: bytes });
      const parts = [...log.fixed, ...log.removed.map((r) => 'verwijderd: ' + r)]; if (log.raster.length) parts.push(`pagina ${log.raster.join(', ')} als afbeelding`);
      notes.push((ctx.files.length > 1 ? f.name + ': ' : '') + (parts.join(' · ') || 'geen aanpassingen nodig'));
      if (chk.some((c) => !c.ok)) notes.push('Let op: ' + chk.filter((c) => !c.ok).map((c) => c.msg).join(', '));
    }
    const view = report ? el('ul', { class: 'pdfa-check', id: 'pdfa-check' }, report.map((c) => el('li', { class: c.ok ? 'ok' : 'bad' }, (c.ok ? '✓ ' : '✗ ') + c.msg))) : null;
    return { title: `${outs.length} bestand(en) omgezet naar PDF/A-${+ctx.opts.part || 2}b`, note: notes.join(' — '), outputs: outs, view, zipName: 'pdfa' };
  }
};

export const PDFA = { pdfa };
