// Word (.docx) → PDF: eigen lezer en opmaakmotor, met metrisch gelijke lettertypen (bv. Carlito voor Calibri)
import { L } from './i18n.js';
import { el, F, PDFLib, fflate, baseName } from './core.js';
import { candidates } from './fontlib.js';

const { PDFDocument, rgb, PDFName, PDFString } = PDFLib;
const dec = new TextDecoder();

/* ---------------- XML-hulp ---------------- */
const kids = (n, name) => (n ? [...n.children].filter((c) => c.localName === name) : []);
const kid = (n, name) => (n ? [...n.children].find((c) => c.localName === name) || null : null);
const path = (n, ...names) => names.reduce((x, nm) => kid(x, nm), n);
const at = (n, name) => (n ? n.getAttribute('w:' + name) ?? n.getAttribute(name) : null);
const num = (v, d = 0) => (v == null || v === '' || isNaN(+v) ? d : +v);
const onOff = (n) => (n ? !['0', 'false', 'off', 'none'].includes(at(n, 'val') || '') : undefined);
const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');

/* ---------------- Pakket lezen ---------------- */
function readPackage(bytes) {
  const files = fflate.unzipSync(bytes); const txt = (p) => (files[p] ? dec.decode(files[p]) : null);
  if (!files['word/document.xml']) throw new Error(L('Dit is geen geldig Word-document (.docx).', 'This is not a valid Word document (.docx).'));
  const rels = (p) => { const r = {}; const x = txt(p); if (!x) return r; for (const e of parseXml(x).getElementsByTagName('Relationship')) r[e.getAttribute('Id')] = { target: e.getAttribute('Target'), external: e.getAttribute('TargetMode') === 'External', type: e.getAttribute('Type') }; return r; };
  return { files, txt, rels };
}
function readTheme(pkg) {
  const x = pkg.txt('word/theme/theme1.xml'); const t = { major: 'Calibri Light', minor: 'Calibri' }; if (!x) return t;
  const d = parseXml(x); const mj = d.getElementsByTagNameNS('*', 'majorFont')[0], mn = d.getElementsByTagNameNS('*', 'minorFont')[0];
  const lat = (n) => n && kid(n, 'latin') && kid(n, 'latin').getAttribute('typeface');
  return { major: lat(mj) || t.major, minor: lat(mn) || t.minor };
}
// Eigenschappen van tekst (rPr) en alinea (pPr) samenvoegen
function readRPr(n, theme) {
  const r = {}; if (!n) return r;
  const f = kid(n, 'rFonts'); if (f) { const a = at(f, 'ascii') || at(f, 'hAnsi'); const th = at(f, 'asciiTheme') || at(f, 'hAnsiTheme'); r.font = a || (th ? (/major/.test(th) ? theme.major : theme.minor) : undefined); if (!r.font) delete r.font; }
  for (const [k, nm] of [['bold', 'b'], ['italic', 'i'], ['strike', 'strike'], ['caps', 'caps'], ['smallCaps', 'smallCaps'], ['vanish', 'vanish']]) { const v = onOff(kid(n, nm)); if (v !== undefined) r[k] = v; }
  const u = kid(n, 'u'); if (u) r.underline = at(u, 'val') !== 'none';
  const sz = kid(n, 'sz'); if (sz) r.size = num(at(sz, 'val'), 22) / 2;
  const c = kid(n, 'color'); if (c && at(c, 'val') && at(c, 'val') !== 'auto') r.color = at(c, 'val');
  const h = kid(n, 'highlight'); if (h && at(h, 'val') !== 'none') r.highlight = at(h, 'val');
  const shd = kid(n, 'shd'); if (shd && at(shd, 'fill') && !/auto/i.test(at(shd, 'fill'))) r.shade = at(shd, 'fill');
  const va = kid(n, 'vertAlign'); if (va) r.vert = at(va, 'val');
  const rs = kid(n, 'rStyle'); if (rs) r.rStyle = at(rs, 'val');
  return r;
}
function readPPr(n) {
  const p = {}; if (!n) return p;
  const ps = kid(n, 'pStyle'); if (ps) p.style = at(ps, 'val');
  const jc = kid(n, 'jc'); if (jc) p.align = at(jc, 'val');
  const sp = kid(n, 'spacing'); if (sp) { if (at(sp, 'before') != null) p.before = num(at(sp, 'before')) / 20; if (at(sp, 'after') != null) p.after = num(at(sp, 'after')) / 20; if (at(sp, 'line') != null) { p.line = num(at(sp, 'line')); p.lineRule = at(sp, 'lineRule') || 'auto'; } if (at(sp, 'beforeAutospacing') === '1') p.before = 14; if (at(sp, 'afterAutospacing') === '1') p.after = 14; }
  const ind = kid(n, 'ind'); if (ind) { const l = at(ind, 'left') ?? at(ind, 'start'), r = at(ind, 'right') ?? at(ind, 'end'); if (l != null) p.left = num(l) / 20; if (r != null) p.right = num(r) / 20; if (at(ind, 'firstLine') != null) p.first = num(at(ind, 'firstLine')) / 20; if (at(ind, 'hanging') != null) p.first = -num(at(ind, 'hanging')) / 20; }
  const np = kid(n, 'numPr'); if (np) { p.numId = at(kid(np, 'numId'), 'val'); p.ilvl = num(at(kid(np, 'ilvl'), 'val')); }
  if (onOff(kid(n, 'pageBreakBefore'))) p.pageBreakBefore = true;
  if (onOff(kid(n, 'contextualSpacing'))) p.contextual = true;
  const tabs = kid(n, 'tabs'); if (tabs) p.tabs = kids(tabs, 'tab').map((t) => ({ pos: num(at(t, 'pos')) / 20, val: at(t, 'val') })).filter((t) => t.val !== 'clear').sort((a, b) => a.pos - b.pos);
  const shd = kid(n, 'shd'); if (shd && at(shd, 'fill') && !/auto/i.test(at(shd, 'fill'))) p.shade = at(shd, 'fill');
  return p;
}
function readStyles(pkg, theme) {
  const x = pkg.txt('word/styles.xml'); const S = { def: { r: { font: theme.minor, size: 10 }, p: {} }, map: {}, defPara: null, defTable: null };
  if (!x) return S; const d = parseXml(x);
  const dd = d.getElementsByTagNameNS('*', 'docDefaults')[0];
  if (dd) { Object.assign(S.def.r, readRPr(path(dd, 'rPrDefault', 'rPr'), theme)); Object.assign(S.def.p, readPPr(path(dd, 'pPrDefault', 'pPr'))); }
  for (const s of d.getElementsByTagNameNS('*', 'style')) {
    const id = at(s, 'styleId'); const type = at(s, 'type');
    S.map[id] = { type, basedOn: at(kid(s, 'basedOn'), 'val'), r: readRPr(kid(s, 'rPr'), theme), p: readPPr(kid(s, 'pPr')), name: at(kid(s, 'name'), 'val') || id, tblBorders: readBorders(path(s, 'tblPr', 'tblBorders')) };
    if (at(s, 'default') === '1' && type === 'paragraph') S.defPara = id;
    if (at(s, 'default') === '1' && type === 'table') S.defTable = id;
  }
  return S;
}
function styleChain(S, id) { const out = []; let k = 0; while (id && S.map[id] && k++ < 20) { out.unshift(S.map[id]); id = S.map[id].basedOn; } return out; }
function readBorders(n) { if (!n) return null; const b = {}; for (const side of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV', 'start', 'end']) { const e = kid(n, side); if (e) b[side === 'start' ? 'left' : side === 'end' ? 'right' : side] = at(e, 'val') && !['nil', 'none'].includes(at(e, 'val')) ? { w: Math.max(0.25, num(at(e, 'sz'), 4) / 8), color: at(e, 'color') && at(e, 'color') !== 'auto' ? at(e, 'color') : '000000' } : null; } return b; }
function readNumbering(pkg) {
  const x = pkg.txt('word/numbering.xml'); const N = { abs: {}, num: {} }; if (!x) return N; const d = parseXml(x);
  for (const a of d.getElementsByTagNameNS('*', 'abstractNum')) { const lv = {}; for (const l of kids(a, 'lvl')) lv[num(at(l, 'ilvl'))] = { fmt: at(kid(l, 'numFmt'), 'val') || 'decimal', text: at(kid(l, 'lvlText'), 'val') ?? '%1.', start: num(at(kid(l, 'start'), 'val'), 1), p: readPPr(kid(l, 'pPr')), r: readRPr(kid(l, 'rPr'), { major: '', minor: '' }) }; N.abs[at(a, 'abstractNumId')] = lv; }
  for (const n of d.getElementsByTagNameNS('*', 'num')) { const ov = {}; for (const o of kids(n, 'lvlOverride')) { const so = kid(o, 'startOverride'); if (so) ov[num(at(o, 'ilvl'))] = num(at(so, 'val')); } N.num[at(n, 'numId')] = { abs: at(kid(n, 'abstractNumId'), 'val'), ov }; }
  return N;
}
const roman = (n) => { const m = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let s = ''; for (const [v, t] of m) while (n >= v) { s += t; n -= v; } return s; };
const fmtNum = (n, f) => f === 'lowerLetter' ? String.fromCharCode(96 + ((n - 1) % 26) + 1) : f === 'upperLetter' ? String.fromCharCode(64 + ((n - 1) % 26) + 1) : f === 'lowerRoman' ? roman(n) : f === 'upperRoman' ? roman(n).toUpperCase() : f === 'none' ? '' : String(n);
const BULLETS = { '': '•', '': '▪', '': '➢', '': '❖', '': '✓', 'o': '◦', '': '◦', '§': '▪', '': '□', '': '➔' };

/* ---------------- Document → model ---------------- */
function buildModel(pkg) {
  const theme = readTheme(pkg); const S = readStyles(pkg, theme); const NUM = readNumbering(pkg); const docRels = pkg.rels('word/_rels/document.xml.rels');
  const counters = {}; const skipped = { charts: 0, other: 0 };
  const media = (rels, rid, dir = 'word/') => { const r = rels[rid]; if (!r) return null; const t = r.target.replace(/^\//, ''); return pkg.files[t.startsWith('word/') ? t : dir + t] || null; };
  const resolveP = (ppr) => { const chain = styleChain(S, ppr.style || S.defPara); const p = { ...S.def.p }; const r = { ...S.def.r }; const keys = new Set(Object.keys(ppr)); for (const s of chain) { Object.assign(p, s.p); Object.assign(r, s.r); if (s !== S.map[S.defPara]) Object.keys(s.p).forEach((k) => keys.add(k)); } Object.assign(p, ppr); return { p, r, keys }; };
  function numberLabel(p) {
    const nm = NUM.num[p.numId]; if (!nm || p.numId === '0') return null; const lv = (NUM.abs[nm.abs] || {})[p.ilvl || 0]; if (!lv) return null;
    const key = p.numId; const c = counters[key] || (counters[key] = []); const lvl = p.ilvl || 0;
    c[lvl] = (c[lvl] == null ? (nm.ov[lvl] ?? lv.start) : c[lvl] + 1); for (let k = lvl + 1; k < 9; k++) c[k] = null;
    let text = lv.fmt === 'bullet' ? (BULLETS[lv.text] || (lv.text && lv.text.charCodeAt(0) >= 0xf000 ? '•' : lv.text) || '•') : lv.text.replace(/%(\d)/g, (m, d) => { const k = +d - 1; const l2 = (NUM.abs[nm.abs] || {})[k]; return fmtNum(c[k] ?? (l2 ? l2.start : 1), l2 ? l2.fmt : 'decimal'); });
    return { text, p: lv.p, r: lv.r };
  }
  function runs(pNode, base, rels, out = []) {
    let fld = null; // complex field state
    for (const n of pNode.children) {
      const ln = n.localName;
      if (ln === 'r') {
        const rpr = readRPr(kid(n, 'rPr'), theme); const chain = rpr.rStyle ? styleChain(S, rpr.rStyle) : []; const st = { ...base }; for (const s of chain) Object.assign(st, s.r); Object.assign(st, rpr);
        for (const c of n.children) {
          const cn = c.localName;
          if (cn === 'fldChar') { const t = at(c, 'fldCharType'); if (t === 'begin') fld = { instr: '', stage: 'instr' }; else if (t === 'separate' && fld) { fld.stage = 'result'; const ins = fld.instr.trim().split(/\s+/)[0].toUpperCase(); if (ins === 'PAGE' || ins === 'NUMPAGES') { out.push({ field: ins, st }); fld.stage = 'skip'; } } else if (t === 'end') fld = null; continue; }
          if (cn === 'instrText' && fld) { fld.instr += c.textContent; continue; }
          if (fld && fld.stage !== 'result') continue;
          if (st.vanish) continue;
          if (cn === 't') out.push({ text: c.textContent, st });
          else if (cn === 'tab' || cn === 'ptab') out.push({ tab: true, st });
          else if (cn === 'br') out.push(at(c, 'type') === 'page' ? { pageBreak: true } : { br: true, st });
          else if (cn === 'cr') out.push({ br: true, st });
          else if (cn === 'noBreakHyphen') out.push({ text: '‑', st });
          else if (cn === 'softHyphen') {}
          else if (cn === 'sym') { const ch = String.fromCharCode(parseInt(at(c, 'char') || '2022', 16)); out.push({ text: BULLETS[ch] || (ch.charCodeAt(0) >= 0xf000 ? '•' : ch), st }); }
          else if (cn === 'drawing' || cn === 'pict' || cn === 'object') {
            const blip = c.getElementsByTagNameNS('*', 'blip')[0]; const ext = c.getElementsByTagNameNS('*', 'extent')[0];
            const txb = c.getElementsByTagNameNS('*', 'txbxContent')[0];
            if (blip) { const rid = blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'); const data = media(rels, rid); const w = ext ? num(ext.getAttribute('cx')) / 12700 : 100, h = ext ? num(ext.getAttribute('cy')) / 12700 : 100; if (data) out.push({ image: data, w, h, st, anchor: !!c.getElementsByTagNameNS('*', 'anchor')[0] }); else skipped.other++; }
            else if (txb) { out.push({ box: blocks(txb, rels) }); }
            else if (c.getElementsByTagNameNS('*', 'chart')[0]) skipped.charts++; else if (cn !== 'object') skipped.other++;
            const imd = c.getElementsByTagNameNS('*', 'imagedata')[0]; if (!blip && imd) { const rid = imd.getAttribute('r:id'); const data = media(rels, rid); if (data) out.push({ image: data, w: 120, h: 90, st }); }
          }
        }
      } else if (ln === 'hyperlink') { const rid = n.getAttribute('r:id'); const href = rid && rels[rid] ? rels[rid].target : null; const s = out.length; runs(n, base, rels, out); if (href) for (let k = s; k < out.length; k++) out[k].href = href; }
      else if (ln === 'fldSimple') { const ins = (at(n, 'instr') || '').trim().split(/\s+/)[0].toUpperCase(); if (ins === 'PAGE' || ins === 'NUMPAGES') out.push({ field: ins, st: { ...base } }); else runs(n, base, rels, out); }
      else if (['smartTag', 'ins', 'customXml', 'sdt', 'sdtContent', 'bdo', 'dir'].includes(ln)) runs(ln === 'sdt' ? kid(n, 'sdtContent') || n : n, base, rels, out);
      else if (ln === 'oMath' || ln === 'oMathPara') { out.push({ text: n.textContent, st: { ...base, italic: true } }); }
    }
    return out;
  }
  function para(n, rels) {
    const own = readPPr(kid(n, 'pPr')); const { p, r, keys } = resolveP(own);
    const prMark = readRPr(path(n, 'pPr', 'rPr'), theme);
    let label = null; if (p.numId) { label = numberLabel(p); if (label) { Object.assign(p, { left: label.p.left ?? p.left, first: label.p.first ?? p.first }, own.left != null ? { left: own.left } : {}, own.first != null ? { first: own.first } : {}); label.st = { ...r, ...prMark, ...label.r, underline: false }; } }
    return { type: 'p', p, pKeys: keys, runs: runs(n, r, rels), label, markSize: (prMark.size || r.size) };
  }
  function table(n, rels) {
    const tblPr = kid(n, 'tblPr'); const sid = at(kid(tblPr, 'tblStyle'), 'val') || S.defTable; const chain = styleChain(S, sid);
    let borders = null; const tp = {}; for (const s of chain) { if (s.tblBorders) borders = { ...(borders || {}), ...s.tblBorders }; Object.assign(tp, s.p); } const own = readBorders(kid(tblPr, 'tblBorders')); if (own) borders = { ...(borders || {}), ...own };
    const grid = kids(kid(n, 'tblGrid'), 'gridCol').map((g) => num(at(g, 'w')) / 20);
    const jc = at(kid(tblPr, 'jc'), 'val'); const ind = num(at(kid(tblPr, 'tblInd'), 'w')) / 20;
    const rows = kids(n, 'tr').map((tr) => {
      const trPr = kid(tr, 'trPr'); const hRule = kid(trPr, 'trHeight'); const header = onOff(kid(trPr, 'tblHeader'));
      return { header, minH: hRule ? num(at(hRule, 'val')) / 20 : 0, cells: kids(tr, 'tc').map((tc) => { const pr = kid(tc, 'tcPr'); const shd = kid(pr, 'shd'); const vm = kid(pr, 'vMerge');
        return { span: num(at(kid(pr, 'gridSpan'), 'val'), 1), vMerge: vm ? (at(vm, 'val') || 'continue') : null, fill: shd && at(shd, 'fill') && !/auto/i.test(at(shd, 'fill')) ? at(shd, 'fill') : null, valign: at(kid(pr, 'vAlign'), 'val') || 'top', borders: readBorders(kid(pr, 'tcBorders')), w: num(at(kid(pr, 'tcW'), 'w')) / 20, content: blocks(tc, rels) }; }) };
    });
    // tabelstijl geldt voor alinea's in de cellen, tenzij de alineastijl zelf iets zegt
    const applyTP = (bl) => bl.forEach((b) => { if (b.type === 'p') { for (const [k, v] of Object.entries(tp)) if (!b.pKeys.has(k) && k !== 'style') b.p[k] = v; } });
    rows.forEach((r) => r.cells.forEach((c) => applyTP(c.content)));
    return { type: 'table', grid, rows, borders, jc, ind };
  }
  function blocks(container, rels) {
    const out = [];
    for (const n of container.children) {
      if (n.localName === 'p') out.push(para(n, rels));
      else if (n.localName === 'tbl') out.push(table(n, rels));
      else if (n.localName === 'sdt') out.push(...blocks(kid(n, 'sdtContent') || n, rels));
      else if (n.localName === 'customXml') out.push(...blocks(n, rels));
    }
    return out;
  }
  const doc = parseXml(pkg.txt('word/document.xml')); const body = doc.getElementsByTagNameNS('*', 'body')[0];
  const content = blocks(body, docRels);
  const sp = kid(body, 'sectPr') || doc.getElementsByTagNameNS('*', 'sectPr')[0];
  const pg = kid(sp, 'pgSz'), mar = kid(sp, 'pgMar');
  const sect = { w: num(at(pg, 'w'), 11906) / 20, h: num(at(pg, 'h'), 16838) / 20, top: num(at(mar, 'top'), 1440) / 20, bottom: num(at(mar, 'bottom'), 1440) / 20, left: num(at(mar, 'left'), 1440) / 20, right: num(at(mar, 'right'), 1440) / 20, header: num(at(mar, 'header'), 708) / 20, footer: num(at(mar, 'footer'), 708) / 20 };
  if (at(pg, 'orient') === 'landscape' && sect.w < sect.h) [sect.w, sect.h] = [sect.h, sect.w];
  const hf = (kind) => { const refs = kids(sp, kind + 'Reference'); const r = refs.find((x) => at(x, 'type') === 'default') || refs[0]; if (!r) return null; const rid = r.getAttribute('r:id'); const rel = docRels[rid]; if (!rel) return null; const p = 'word/' + rel.target.replace(/^\/?word\//, ''); const x = pkg.txt(p); if (!x) return null; const hrels = pkg.rels(p.replace(/word\//, 'word/_rels/') + '.rels'); return blocks(parseXml(x).documentElement, hrels); };
  const settings = pkg.txt('word/settings.xml'); let defTab = 36; if (settings) { const m = settings.match(/defaultTabStop w:val="(\d+)"/); if (m) defTab = +m[1] / 20; }
  return { content, sect, header: hf('header'), footer: hf('footer'), defTab, skipped, def: S.def };
}

/* ---------------- Lettertypen ---------------- */
// fontkit-versie die lettertypen kan verkleinen (alleen gebruikte tekens insluiten)
const BASE = new URL('../', import.meta.url).href; let fkP;
const subsetFontkit = () => fkP || (fkP = new Promise((res, rej) => { if (window.fontkitCantoo) return res(window.fontkitCantoo.default || window.fontkitCantoo); const s = document.createElement('script'); s.src = BASE + 'lib/fontkit-subset.js'; s.onload = () => res(window.fontkitCantoo.default || window.fontkitCantoo); s.onerror = () => { fkP = null; rej(new Error('fontkit')); }; document.head.append(s); }));
const SYMBOL_FALLBACK = 'DejaVu Sans';
async function fontManager(doc, subset) {
  const fk = await subsetFontkit(); doc.registerFontkit(fk); const cache = new Map(); const loaded = new Map();
  async function get(name, bold, italic) {
    const key = `${name}|${bold ? 1 : 0}|${italic ? 1 : 0}`; if (cache.has(key)) return cache.get(key);
    const p = (async () => {
      const c = (await candidates({ base: name, family: name, weight: bold ? 700 : 400, italic: !!italic })).filter((x) => x.key.startsWith('lib:') || x.key.startsWith('own:'));
      const pick = c[0]; const fb = c.find((x) => /DejaVu/.test(x.label)) || c[c.length - 1];
      const emb = async (cand) => { if (loaded.has(cand.key)) return loaded.get(cand.key); const bytes = await cand.load(); const f = await doc.embedFont(bytes, { subset, features: { liga: false, rlig: false, clig: false, dlig: false, calt: false } }); loaded.set(cand.key, f); return f; };
      const main = await emb(pick); const fallback = fb && fb !== pick ? await emb(fb) : main;
      return { main, fallback, label: pick.label };
    })();
    cache.set(key, p); return p;
  }
  return { get, used: () => [...new Set([...loaded.keys()])] };
}
const hasAll = (font, text) => { try { const f = font.embedder.font; for (const ch of text) { if (ch === ' ' || ch === ' ') continue; if (!f.hasGlyphForCodePoint(ch.codePointAt(0))) return false; } return true; } catch { return true; } };

/* ---------------- Opmaak ---------------- */
const HL = { yellow: 'FFFF00', green: '00FF00', cyan: '00FFFF', magenta: 'FF00FF', blue: '0000FF', red: 'FF0000', darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000', darkYellow: '808000', darkGray: '808080', lightGray: 'C0C0C0', black: '000000', white: 'FFFFFF' };
const col = (hex, d = [0, 0, 0]) => { if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return rgb(...d); return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255); };

async function layoutDoc(model, fm, progress) {
  const { sect } = model; const pages = []; let page = null; let y = 0; const cw = sect.w - sect.left - sect.right;
  const newPage = () => { page = { ops: [], links: [] }; pages.push(page); y = sect.top; };
  newPage();
  const fontOf = async (st) => fm.get(st.font || model.def.r.font || 'Calibri', !!st.bold, !!st.italic);
  // Tekens → woorden met maten
  async function measureRuns(runs, label, p) {
    const toks = [];
    for (const r of runs) {
      if (r.pageBreak) { toks.push({ pageBreak: true }); continue; }
      if (r.br) { toks.push({ br: true }); continue; }
      if (r.tab) { toks.push({ tab: true, st: r.st, h: (r.st.size || 11) }); continue; }
      if (r.image) { const k = Math.min(1, cw / r.w); toks.push({ image: r.image, w: r.w * k, h: r.h * k }); continue; }
      if (r.box) { toks.push({ box: r.box }); continue; }
      let text = r.field ? '\u0000' + r.field : r.text; if (!text) continue;
      const st = r.st; if (st.caps) text = text.toUpperCase();
      const size = (st.size || 11) * (st.vert && st.vert !== 'baseline' ? 0.65 : 1);
      const F = await fontOf(st);
      for (const part of text.split(/( +)/)) {
        if (!part) continue;
        const isField = part.startsWith('\u0000'); const shown = isField ? '99' : part;
        const font = hasAll(F.main, shown) ? F.main : F.fallback;
        let w; try { w = font.widthOfTextAtSize(shown, size); } catch { w = shown.length * size * 0.5; }
        toks.push({ text: part, field: isField ? part.slice(1) : null, space: /^ +$/.test(part), w, st, size, font, href: r.href, asc: size * 0.9, h: size });
      }
    }
    return toks;
  }
  const lineHeight = (p, maxSize, maxH) => p.lineRule === 'exact' ? p.line / 20 : p.lineRule === 'atLeast' ? Math.max(p.line / 20, maxH * 1.17) : Math.max(maxH, maxSize * 1.17) * ((p.line || 240) / 240);
  // Eén alinea opmaken binnen [x0, x0+width]; draw=false geeft enkel de hoogte
  async function layoutPara(b, x0, width, ctx) {
    const p = b.p; const left = p.left || 0, right = p.right || 0; let first = p.first || 0;
    if (b.label) { // nummer/opsommingsteken staat op left+first; de tekst begint na een tab op 'left' (of verder als het label langer is)
      const F = await fontOf(b.label.st); const lw = F.main.widthOfTextAtSize(b.label.text, b.label.st.size || 11);
      const lx = left + first; first = Math.max(0, lx + lw + 3 - left); if (first > 0 && p.first < 0) first = Math.max(first, 0); b._labelX = lx; }
    const toks = await measureRuns(b.runs, b.label, p);
    const lines = []; let cur = { toks: [], w: 0, first: true }; const startX = (ln) => left + (ln.first ? first : 0);
    const avail = (ln) => width - left - right - (ln.first ? first : 0);
    const tabStop = (pos) => { const t = (p.tabs || []).find((s) => s.pos > pos + 0.5); if (t) return t; return { pos: (Math.floor(pos / model.defTab) + 1) * model.defTab, val: 'left' }; };
    const push = () => { lines.push(cur); cur = { toks: [], w: 0, first: false }; };
    for (const t of toks) {
      if (t.pageBreak) { push(); lines.push({ pageBreak: true, toks: [] }); continue; }
      if (t.br) { cur.hardBreak = true; push(); continue; }
      if (t.box) { push(); lines.push({ box: t.box, toks: [] }); continue; }
      if (t.tab) { const pos = startX(cur) + cur.w; const ts = tabStop(pos); const w = Math.max(2, ts.pos - pos); t.w = w; t.tabVal = ts.val; cur.toks.push(t); cur.w += w; continue; }
      if (t.space) { cur.toks.push(t); cur.w += t.w; continue; }
      if (cur.w + t.w > avail(cur) + 0.01 && cur.toks.some((x) => !x.space)) {
        // afbreken: spaties aan het einde vallen weg
        while (cur.toks.length && cur.toks.at(-1).space) cur.w -= cur.toks.pop().w;
        push();
      }
      if (t.w > avail(cur) && t.text && !t.image) { // te lang woord: per teken splitsen
        let s = ''; for (const ch of t.text) { const w = t.font.widthOfTextAtSize(s + ch, t.size); if (w > avail(cur) - cur.w && s) { cur.toks.push({ ...t, text: s, w: t.font.widthOfTextAtSize(s, t.size) }); cur.w += cur.toks.at(-1).w; push(); s = ch; } else s += ch; }
        if (s) { const w = t.font.widthOfTextAtSize(s, t.size); cur.toks.push({ ...t, text: s, w }); cur.w += w; } continue;
      }
      cur.toks.push(t); cur.w += t.w;
    }
    if (cur.toks.length || !lines.length) { cur.last = true; lines.push(cur); } else if (lines.length) lines.at(-1).last = true;
    lines.forEach((ln) => { if (ln.hardBreak) ln.last = true; });
    const markSize = b.markSize || 11;
    for (const ln of lines) { const sizes = ln.toks.filter((t) => t.size).map((t) => t.size); const hs = ln.toks.map((t) => t.image ? t.h : t.size || 0); const ms = sizes.length ? Math.max(...sizes) : markSize; const mh = Math.max(ms, ...hs); ln.h = lineHeight(p, ms, mh); ln.asc = Math.max(ms * 0.9, ...ln.toks.filter((t) => t.image).map((t) => t.h)); if (ln.toks.some((t) => t.image)) ln.h = Math.max(ln.h, ln.asc + ms * 0.25); }
    return { lines, left, right, first };
  }
  // Tekenen van een opgemaakte alinea op (x0, y)
  function drawLine(ln, b, lay, x0, width, yTop, target) {
    const p = b.p; let x = x0 + lay.left + (ln.first ? lay.first : 0); const avail = width - lay.left - lay.right - (ln.first ? lay.first : 0);
    const content = ln.toks.slice(); while (content.length && content.at(-1).space) content.pop();
    const w = content.reduce((s, t) => s + t.w, 0); const align = p.align === 'start' ? 'left' : p.align === 'end' ? 'right' : p.align;
    let extra = 0; const spaces = content.filter((t) => t.space).length;
    if (align === 'center') x += (avail - w) / 2; else if (align === 'right') x += avail - w; else if ((align === 'both' || align === 'distribute') && !ln.last && spaces) extra = (avail - w) / spaces;
    const base = yTop + ln.asc;
    if (ln.first && b.label) { const L0 = b.label; target.ops.push({ t: 'text', text: L0.text, x: x0 + (b._labelX ?? lay.left + lay.first), y: base, st: L0.st, size: L0.st.size || 11, labelFont: true }); }
    for (const t of content) {
      if (t.image) { target.ops.push({ t: 'img', data: t.image, x, y: base - t.h, w: t.w, h: t.h }); x += t.w; continue; }
      if (t.tab) { x += t.w; continue; }
      if (t.space) { if (t.st.underline || t.st.strike || t.st.highlight || t.st.shade) target.ops.push({ t: 'deco', x, y: base, w: t.w + extra, st: t.st, size: t.size }); x += t.w + extra; continue; }
      const yOff = t.st.vert === 'superscript' ? -t.size * 0.5 : t.st.vert === 'subscript' ? t.size * 0.2 : 0;
      target.ops.push({ t: 'text', text: t.text, field: t.field, x, y: base + yOff, size: t.size, font: t.font, st: t.st, w: t.w });
      if (t.href) target.links.push({ x, y: base - t.size, w: t.w, h: t.size * 1.2, href: t.href });
      x += t.w;
    }
  }
  async function placePara(b, x0, width, target, prevAfter) {
    const p = b.p; const lay = await layoutPara(b, x0, width);
    if (p.pageBreakBefore && target === null && page.ops.length) newPage();
    const before = p.contextual && prevAfter != null ? 0 : (p.before || 0); y += Math.max(0, before - (prevAfter || 0));
    if (p.shade && target === null) { const tot = lay.lines.reduce((s, l) => s + (l.h || 0), 0); page.ops.push({ t: 'rect', x: x0 + (p.left || 0), y, w: width - (p.left || 0) - (p.right || 0), h: tot, fill: p.shade }); }
    for (const ln of lay.lines) {
      if (ln.pageBreak) { if (target === null) newPage(); continue; }
      if (ln.box) { for (const bb of ln.box) { if (bb.type === 'p') await placePara(bb, x0, width, target, 0); } continue; }
      if (target === null && y + ln.h > sect.h - sect.bottom && page.ops.length) newPage();
      drawLine(ln, b, lay, x0, width, y, target || page); y += ln.h;
    }
    y += p.after ?? 0;
    return p.after ?? 0;
  }
  // Tabel: rijhoogte = hoogste cel; rij past niet → nieuwe pagina
  async function placeTable(tb, x0, width) {
    let grid = tb.grid.length ? tb.grid.slice() : null; const ncol = grid ? grid.length : Math.max(...tb.rows.map((r) => r.cells.reduce((s, c) => s + c.span, 0)));
    if (!grid) grid = Array(ncol).fill(width / ncol);
    const tot = grid.reduce((a, b) => a + b, 0); if (tot > width) grid = grid.map((g) => g * width / tot);
    const tw = grid.reduce((a, b) => a + b, 0); let tx = x0 + (tb.jc === 'center' ? (width - tw) / 2 : tb.jc === 'right' ? width - tw : (tb.ind || 0));
    const pad = 5.4, padV = 1.5; const B = tb.borders;
    const headerRows = tb.rows.filter((r) => r.header);
    const renderRow = async (row, ri) => {
      // cellen opmaken in een tijdelijke lijst
      let gi = 0; const cells = [];
      for (const c of row.cells) { const w = grid.slice(gi, gi + c.span).reduce((a, b) => a + b, 0); const cx = tx + grid.slice(0, gi).reduce((a, b) => a + b, 0); gi += c.span; cells.push({ c, x: cx, w }); }
      let maxH = row.minH || 0; const tmp = [];
      for (const cell of cells) {
        const sub = { ops: [], links: [] }; const saveY = y; y = 0; let prevAfter = null;
        if (cell.c.vMerge !== 'continue') for (const b of cell.c.content) { if (b.type === 'p') prevAfter = await placePara(b, cell.x + pad, cell.w - pad * 2, sub, prevAfter); }
        const h = y + padV * 2; y = saveY; tmp.push({ ...cell, sub, h }); maxH = Math.max(maxH, h);
      }
      return { tmp, h: maxH };
    };
    for (const [ri, row] of tb.rows.entries()) {
      let r = await renderRow(row, ri);
      if (y + r.h > sect.h - sect.bottom && y > sect.top + 1) { newPage(); for (const hr of headerRows) if (hr !== row) { const rr = await renderRow(hr); emitRow(rr, true); } }
      emitRow(r, ri === 0, ri === tb.rows.length - 1, row);
    }
    function emitRow(r, isFirst, isLast) {
      for (const cell of r.tmp) {
        if (cell.c.fill) page.ops.push({ t: 'rect', x: cell.x, y, w: cell.w, h: r.h, fill: cell.c.fill });
        const off = cell.c.valign === 'center' ? (r.h - cell.h) / 2 : cell.c.valign === 'bottom' ? r.h - cell.h : 0;
        for (const op of cell.sub.ops) page.ops.push({ ...op, y: op.y + y + padV + off });
        for (const ln of cell.sub.links) page.links.push({ ...ln, y: ln.y + y + padV + off });
        const cb = cell.c.borders || {}; const side = (k, inner) => (cb[k] !== undefined ? cb[k] : B ? (inner ? B[inner] : B[k]) : null);
        const top = side('top', isFirst ? null : 'insideH'), bottom = side('bottom', isLast ? null : 'insideH'), left = side('left', cell.x > tx + 0.5 ? 'insideV' : null), right = side('right', Math.abs(cell.x + cell.w - (tx + grid.reduce((a, b) => a + b, 0))) > 0.5 ? 'insideV' : null);
        if (top && cell.c.vMerge !== 'continue') page.ops.push({ t: 'line', x1: cell.x, y1: y, x2: cell.x + cell.w, y2: y, b: top });
        if (bottom) page.ops.push({ t: 'line', x1: cell.x, y1: y + r.h, x2: cell.x + cell.w, y2: y + r.h, b: bottom });
        if (left) page.ops.push({ t: 'line', x1: cell.x, y1: y, x2: cell.x, y2: y + r.h, b: left });
        if (right) page.ops.push({ t: 'line', x1: cell.x + cell.w, y1: y, x2: cell.x + cell.w, y2: y + r.h, b: right });
      }
      y += r.h;
    }
  }
  let prevAfter = null; let k = 0;
  for (const b of model.content) {
    if (++k % 40 === 0) { progress && progress(L(`Opmaken… blok ${k} van ${model.content.length}`, `Laying out… block ${k} of ${model.content.length}`)); await new Promise((r) => setTimeout(r)); }
    if (b.type === 'p') prevAfter = await placePara(b, sect.left, cw, null, prevAfter);
    else { await placeTable(b, sect.left, cw); y += 6; prevAfter = null; }
  }
  // kop- en voettekst per pagina (met paginanummer)
  for (const [kind, blocksHF] of [['header', model.header], ['footer', model.footer]]) {
    if (!blocksHF || !blocksHF.length) continue;
    const saveP = page, saveY = y; const sub = { ops: [], links: [] }; y = 0; let pa = null;
    for (const b of blocksHF) { if (b.type === 'p') pa = await placePara(b, sect.left, cw, sub, pa); }
    const h = y; y = saveY; page = saveP;
    const top = kind === 'header' ? sect.header : sect.h - sect.footer - h;
    pages.forEach((pg, i) => sub.ops.forEach((op) => pg.ops.push({ ...op, y: op.y + top, pageNo: i + 1, total: pages.length })));
  }
  return pages;
}

async function render(model, pages, doc) {
  const imgCache = new Map();
  const embedImg = async (data) => {
    if (imgCache.has(data)) return imgCache.get(data);
    let img = null; const isPng = data[0] === 0x89 && data[1] === 0x50, isJpg = data[0] === 0xff && data[1] === 0xd8;
    try { img = isPng ? await doc.embedPng(data) : isJpg ? await doc.embedJpg(data) : null; } catch { img = null; }
    if (!img) { try { const bmp = await createImageBitmap(new Blob([data])); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); img = await doc.embedPng(new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer())); } catch { img = null; } }
    imgCache.set(data, img); return img;
  };
  const { sect } = model; const H = sect.h;
  for (const pg of pages) {
    const page = doc.addPage([sect.w, sect.h]);
    for (const op of pg.ops) {
      if (op.t === 'rect') page.drawRectangle({ x: op.x, y: H - op.y - op.h, width: op.w, height: op.h, color: col(op.fill) });
      else if (op.t === 'line') page.drawLine({ start: { x: op.x1, y: H - op.y1 }, end: { x: op.x2, y: H - op.y2 }, thickness: op.b.w, color: col(op.b.color) });
      else if (op.t === 'img') { const img = await embedImg(op.data); if (img) page.drawImage(img, { x: op.x, y: H - op.y - op.h, width: op.w, height: op.h }); }
      else if (op.t === 'deco') decorate(page, op, H);
      else if (op.t === 'text') {
        let text = op.text; if (op.field === 'PAGE') text = String(op.pageNo || 1); else if (op.field === 'NUMPAGES') text = String(op.total || pages.length);
        let font = op.font; if (!font || op.labelFont) { const F = await fmGlobal.get(op.st.font || 'Calibri', !!op.st.bold, !!op.st.italic); font = hasAll(F.main, text) ? F.main : F.fallback; }
        const w = font.widthOfTextAtSize(text, op.size);
        if (op.st.highlight || op.st.shade) page.drawRectangle({ x: op.x, y: H - op.y - op.size * 0.22, width: w, height: op.size * 1.12, color: col(HL[op.st.highlight] || op.st.shade) });
        page.drawText(text, { x: op.x, y: H - op.y, size: op.size, font, color: col(op.st.color) });
        decorate(page, { ...op, w }, H, true);
      }
    }
    for (const l of pg.links) { if (!/^(https?:|mailto:)/i.test(l.href)) continue; const a = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [l.x, H - l.y - l.h, l.x + l.w, H - l.y], Border: [0, 0, 0], F: 4, A: { Type: 'Action', S: 'URI', URI: PDFString.of(l.href) } }); page.node.addAnnot(doc.context.register(a)); }
  }
}
function decorate(page, op, H, noBg) {
  const c = col(op.st.color); const t = Math.max(0.5, op.size / 18);
  if (!noBg && (op.st.highlight || op.st.shade)) page.drawRectangle({ x: op.x, y: H - op.y - op.size * 0.22, width: op.w, height: op.size * 1.12, color: col(HL[op.st.highlight] || op.st.shade) });
  if (op.st.underline) page.drawLine({ start: { x: op.x, y: H - op.y - op.size * 0.12 }, end: { x: op.x + op.w, y: H - op.y - op.size * 0.12 }, thickness: t, color: c });
  if (op.st.strike) page.drawLine({ start: { x: op.x, y: H - op.y + op.size * 0.3 }, end: { x: op.x + op.w, y: H - op.y + op.size * 0.3 }, thickness: t, color: c });
}
let fmGlobal = null;
export async function docxToPdf(bytes, { title = '', progress } = {}) {
  const pkg = readPackage(bytes); progress && progress(L('Document lezen…', 'Reading document…'));
  const model = buildModel(pkg);
  for (const subset of [true, false]) {
    try {
      const doc = await PDFDocument.create(); const fm = await fontManager(doc, subset); fmGlobal = fm;
      progress && progress(L('Opmaken…', 'Laying out…'));
      const pages = await layoutDoc(model, fm, progress);
      progress && progress(L('PDF opbouwen…', 'Building PDF…'));
      await render(model, pages, doc);
      doc.setTitle(title); doc.setProducer(document.title.includes('ABN') ? 'ABN PDF Studio' : 'PDF Studio'); doc.setCreator('Word');
      const out = await doc.save({ useObjectStreams: true });
      return { bytes: out, pages: pages.length, skipped: model.skipped, fonts: fm.used() };
    } catch (e) { if (!subset) throw e; console.warn('subset mislukt, opnieuw zonder', e); }
  }
}

const wordToPdf = {
  input: { kind: 'docx', multiple: true, accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', test: (f) => /\.docx$/i.test(f.name) || /wordprocessingml/.test(f.type), label: 'Sleep Word-bestanden (.docx) hierheen of' },
  runLabel: 'Omzetten naar PDF', lead: 'Zet Word-documenten (.docx) om naar PDF, met koppen, lijsten, tabellen, afbeeldingen en kop-/voetteksten. Lettertypen als Calibri, Cambria, Arial en Times worden vervangen door metrisch gelijke lettertypen, zodat de opmaak behouden blijft.',
  options: (ctx) => [el('div', { class: 'help' }, 'Oude .doc-bestanden worden niet ondersteund: sla ze in Word eerst op als .docx. Grafieken en SmartArt worden overgeslagen.')],
  summary: (ctx) => ctx.files.length ? `${ctx.files.length} document(en)` : 'Nog geen bestand gekozen',
  async run(ctx) {
    const outs = []; const notes = [];
    for (const [i, f] of ctx.files.entries()) {
      ctx.progress(`${f.name} (${i + 1}/${ctx.files.length})…`);
      const r = await docxToPdf(f.bytes, { title: baseName(f.name), progress: ctx.progress });
      outs.push({ name: `${baseName(f.name)}.pdf`, data: r.bytes });
      if (r.skipped.charts || r.skipped.other) notes.push(`${f.name}: ${r.skipped.charts + r.skipped.other} onderdeel/onderdelen (grafiek, vorm) overgeslagen`);
    }
    return { title: `${outs.length} document(en) omgezet naar PDF`, note: notes.join(' · '), outputs: outs, zipName: 'word-naar-pdf' };
  }
};

export const DOCX = { 'word-to-pdf': wordToPdf };
