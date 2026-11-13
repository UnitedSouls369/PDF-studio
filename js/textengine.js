// Tekst-engine: bestaande tekst echt vervangen in de paginacode, in het originele lettertype,
// met verschuiving van de rest van de regel (reflow op regelniveau).
import { PDFLib } from './core.js';
import { candidates } from './fontlib.js';
const { PDFName, PDFDict, PDFArray, PDFNumber, PDFRawStream, PDFStream, PDFRef, decodePDFRawStream, StandardFontEmbedder, StandardFonts } = PDFLib;
const N = (s) => PDFName.of(s);
const BASE = new URL('../', import.meta.url).href;

/* ================= Tokenizer ================= */
const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
function tokenize(b) {
  const toks = []; let i = 0; const n = b.length;
  while (i < n) {
    const c = b[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; }
    const s = i;
    if (c === 40) {
      let depth = 1; i++; const out = [];
      while (i < n && depth) {
        let ch = b[i];
        if (ch === 92) { i++; ch = b[i];
          if (ch === 110) out.push(10); else if (ch === 114) out.push(13); else if (ch === 116) out.push(9); else if (ch === 98) out.push(8); else if (ch === 102) out.push(12);
          else if (ch >= 48 && ch <= 55) { let v = ch - 48; for (let k = 0; k < 2 && b[i + 1] >= 48 && b[i + 1] <= 55; k++) { i++; v = v * 8 + b[i] - 48; } out.push(v & 255); }
          else if (ch === 13) { if (b[i + 1] === 10) i++; } else if (ch === 10) {} else out.push(ch);
          i++; continue; }
        if (ch === 40) depth++; else if (ch === 41) { depth--; if (!depth) { i++; break; } }
        out.push(ch); i++;
      }
      toks.push({ t: 'str', v: out, s, e: i }); continue;
    }
    if (c === 60 && b[i + 1] === 60) { toks.push({ t: '<<', s, e: i + 2 }); i += 2; continue; }
    if (c === 62 && b[i + 1] === 62) { toks.push({ t: '>>', s, e: i + 2 }); i += 2; continue; }
    if (c === 60) { i++; let h = ''; while (i < n && b[i] !== 62) { if (!WS.has(b[i])) h += String.fromCharCode(b[i]); i++; } i++; if (h.length % 2) h += '0'; const out = []; for (let k = 0; k < h.length; k += 2) out.push(parseInt(h.substr(k, 2), 16)); toks.push({ t: 'str', v: out, s, e: i }); continue; }
    if (c === 91) { toks.push({ t: '[', s, e: i + 1 }); i++; continue; }
    if (c === 93) { toks.push({ t: ']', s, e: i + 1 }); i++; continue; }
    if (c === 123 || c === 125) { i++; continue; }
    if (c === 47) { i++; while (i < n && !WS.has(b[i]) && !DELIM.has(b[i])) i++; toks.push({ t: 'name', v: String.fromCharCode(...b.subarray(s + 1, i)), s, e: i }); continue; }
    while (i < n && !WS.has(b[i]) && !DELIM.has(b[i])) i++;
    if (i === s) { i++; continue; }
    const w = String.fromCharCode(...b.subarray(s, i));
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) toks.push({ t: 'num', v: parseFloat(w), s, e: i });
    else if (w === 'true' || w === 'false' || w === 'null') toks.push({ t: 'lit', v: w, s, e: i });
    else {
      toks.push({ t: 'op', v: w, s, e: i });
      if (w === 'ID') { i++; while (i < n - 2 && !(WS.has(b[i]) && b[i + 1] === 69 && b[i + 2] === 73 && (i + 3 >= n || WS.has(b[i + 3]) || DELIM.has(b[i + 3])))) i++; i += 3; toks.push({ t: 'op', v: 'EI', s: i - 2, e: i }); }
    }
  }
  return toks;
}

/* ================= Coderingen ================= */
const WIN = (() => { const m = {}; for (let c = 32; c < 127; c++) m[c] = c; for (let c = 160; c < 256; c++) m[c] = c;
  [0x20AC, 0, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017D, 0, 0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0, 0x017E, 0x0178].forEach((u, k) => { if (u) m[0x80 + k] = u; }); return m; })();
const ASCII_NAMES = 'space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde'.split(' ');
const HI_NAMES = 'space exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot hyphen registered macron degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex idieresis eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ydieresis'.split(' ');
const GLYPH = (() => { const g = {}; ASCII_NAMES.forEach((n, k) => g[n] = 32 + k); HI_NAMES.forEach((n, k) => { if (!(n in g)) g[n] = 160 + k; });
  Object.assign(g, { Euro: 0x20AC, quotesinglbase: 0x201A, florin: 0x192, quotedblbase: 0x201E, ellipsis: 0x2026, dagger: 0x2020, daggerdbl: 0x2021, circumflex: 0x2C6, perthousand: 0x2030, Scaron: 0x160, guilsinglleft: 0x2039, OE: 0x152, Zcaron: 0x17D, quoteleft: 0x2018, quoteright: 0x2019, quotedblleft: 0x201C, quotedblright: 0x201D, bullet: 0x2022, endash: 0x2013, emdash: 0x2014, tilde: 0x2DC, trademark: 0x2122, scaron: 0x161, guilsinglright: 0x203A, oe: 0x153, zcaron: 0x17E, Ydieresis: 0x178, minus: 0x2212, fi: 0xFB01, fl: 0xFB02, nbspace: 0xA0, sfthyphen: 0xAD, dotlessi: 0x131 }); return g; })();
function glyphToUni(n) { if (n in GLYPH) return GLYPH[n]; let m = /^uni([0-9A-F]{4})$/i.exec(n); if (m) return parseInt(m[1], 16); m = /^u([0-9A-F]{4,6})$/i.exec(n); if (m) return parseInt(m[1], 16); return null; }
function parseCMap(bytes) {
  const s = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 2e6))); const map = new Map(); let blen = 1;
  const u16 = (h) => { let out = ''; for (let k = 0; k + 3 < h.length + 1; k += 4) out += String.fromCharCode(parseInt(h.substr(k, 4), 16)); return out; };
  for (const blk of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) { blen = m[1].length / 2; map.set(parseInt(m[1], 16), u16(m[2])); }
  for (const blk of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
    blen = m[1].length / 2; const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16); if (hi - lo > 65535) continue;
    if (m[3][0] === '[') { const arr = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => u16(x[1])); for (let c = lo; c <= hi && c - lo < arr.length; c++) map.set(c, arr[c - lo]); }
    else { const base = u16(m[3].slice(1, -1)); for (let c = lo; c <= hi; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo))); }
  }
  return { map, blen };
}
const STD = { 'Helvetica': 'Helvetica', 'Helvetica-Bold': 'HelveticaBold', 'Helvetica-Oblique': 'HelveticaOblique', 'Helvetica-BoldOblique': 'HelveticaBoldOblique', 'Times-Roman': 'TimesRoman', 'Times-Bold': 'TimesRomanBold', 'Times-Italic': 'TimesRomanItalic', 'Times-BoldItalic': 'TimesRomanBoldItalic', 'Courier': 'Courier', 'Courier-Bold': 'CourierBold', 'Courier-Oblique': 'CourierOblique', 'Courier-BoldOblique': 'CourierBoldOblique', 'Arial': 'Helvetica', 'Arial,Bold': 'HelveticaBold', 'Arial-BoldMT': 'HelveticaBold', 'ArialMT': 'Helvetica' };

/* ================= Lettertypen ================= */
class FontInfo {
  constructor(ctx, dict, resName) {
    this.res = resName; this.dict = dict; this.ok = dict instanceof PDFDict;
    if (!this.ok) return;
    const L = (k, d = dict) => { try { return d.lookup(N(k)); } catch { return undefined; } };
    const st = L('Subtype'); this.subtype = st && st.decodeText ? st.decodeText() : '';
    const bf = L('BaseFont'); this.rawBase = bf && bf.decodeText ? bf.decodeText() : ''; this.base = this.rawBase.replace(/^[A-Z]{6}\+/, '');
    this.subset = /^[A-Z]{6}\+/.test(this.rawBase); this.twoByte = this.subtype === 'Type0'; this.type3 = this.subtype === 'Type3';
    let desc = L('FontDescriptor'); let d0 = null;
    if (this.twoByte) { const df = L('DescendantFonts'); d0 = df instanceof PDFArray ? df.lookup(0) : null; if (d0 instanceof PDFDict) desc = L('FontDescriptor', d0); }
    let flags = 0; if (desc instanceof PDFDict) { const f = L('Flags', desc); if (f instanceof PDFNumber) flags = f.asNumber(); const w = L('FontWeight', desc); if (w instanceof PDFNumber && w.asNumber() >= 600) flags |= 1 << 18; this.embedded = !!(L('FontFile', desc) || L('FontFile2', desc) || L('FontFile3', desc)); }
    this.bold = /bold|black|heavy|semibold|demi/i.test(this.base) || !!(flags & (1 << 18));
    this.italic = /italic|oblique/i.test(this.base) || !!(flags & (1 << 6));
    this.family = familyOf(this.base, flags);
    this.serif = this.family === 'LiberationSerif' || this.family === 'Caladea'; this.mono = this.family === 'LiberationMono';
    // ingesloten lettertypeprogramma (TrueType of OpenType) — kan ontbrekende tekens leveren als het volledig is
    if (desc instanceof PDFDict) { const ff = L('FontFile2', desc) || (() => { const f3 = L('FontFile3', desc); const st3 = f3 && f3.dict && f3.dict.lookup(N('Subtype')); return st3 && st3.decodeText && st3.decodeText() === 'OpenType' ? f3 : null; })();
      if (ff instanceof PDFStream) this.programStream = ff; }
    this.familyKey = this.base.replace(/[-,]?(Bold|Italic|Oblique|BoldItalic|BoldOblique|Regular|Roman|Book|Medium|Semibold|SemiBold|Black|Light|MT|PS)+$/gi, '').replace(/[-,]$/, '').toLowerCase();
    // breedtes
    this.widths = new Map(); this.dw = this.twoByte ? 1000 : 0;
    if (this.twoByte && d0 instanceof PDFDict) {
      const dw = L('DW', d0); if (dw instanceof PDFNumber) this.dw = dw.asNumber();
      const W = L('W', d0); if (W instanceof PDFArray) { const a = W.asArray(); for (let k = 0; k < a.length;) { const c1 = ctx.lookup(a[k]).asNumber(); const nx = ctx.lookup(a[k + 1]);
        if (nx instanceof PDFArray) { nx.asArray().forEach((w, j) => this.widths.set(c1 + j, ctx.lookup(w).asNumber())); k += 2; } else { const c2 = nx.asNumber(), w = ctx.lookup(a[k + 2]).asNumber(); for (let c = c1; c <= c2; c++) this.widths.set(c, w); k += 3; } } }
    } else {
      const W = L('Widths'), fc = L('FirstChar');
      if (W instanceof PDFArray && fc instanceof PDFNumber) { const f = fc.asNumber(); W.asArray().forEach((w, j) => { const v = ctx.lookup(w); if (v instanceof PDFNumber) this.widths.set(f + j, v.asNumber()); }); }
      else if (STD[this.base] && StandardFontEmbedder) { try { this.std = StandardFontEmbedder.for(StandardFonts[STD[this.base]]); } catch {} }
    }
    // code <-> unicode
    this.c2u = new Map(); this.blen = this.twoByte ? 2 : 1;
    const tu = L('ToUnicode');
    if (tu instanceof PDFStream) { try { const raw = tu instanceof PDFRawStream ? decodePDFRawStream(tu).decode() : tu.getContents(); const cm = parseCMap(raw); this.c2u = cm.map; if (this.twoByte) this.blen = cm.blen || 2; } catch {} }
    if (!this.twoByte && !this.c2u.size) {
      const enc = L('Encoding'); let baseEnc = 'WinAnsiEncoding'; let diffs = null;
      if (enc instanceof PDFName) baseEnc = enc.decodeText(); else if (enc instanceof PDFDict) { const be = L('BaseEncoding', enc); if (be instanceof PDFName) baseEnc = be.decodeText(); diffs = L('Differences', enc); }
      const full = baseEnc === 'WinAnsiEncoding' || (!this.embedded && !this.subset);
      for (const [c, u] of Object.entries(WIN)) if (full || (+c >= 32 && +c < 127)) this.c2u.set(+c, String.fromCharCode(u));
      if (diffs instanceof PDFArray) { let code = 0; for (const x of diffs.asArray()) { const v = ctx.lookup(x); if (v instanceof PDFNumber) code = v.asNumber(); else if (v instanceof PDFName) { const u = glyphToUni(v.decodeText()); if (u != null) this.c2u.set(code, String.fromCodePoint(u)); else this.c2u.delete(code); code++; } } }
    }
    this.u2c = new Map(); for (const [c, u] of this.c2u) if (u && [...u].length === 1 && !this.u2c.has(u)) this.u2c.set(u, c);
    this.usable = !this.type3 && (this.widths.size > 0 || !!this.std) && this.u2c.size > 0;
  }
  has(ch) {
    if (!this.usable) return false; const c = this.u2c.get(ch); if (c == null) return false;
    if (this.widths.size) return this.widths.has(c) && (this.widths.get(c) > 0 || ch === ' ');
    return !!this.std;
  }
  code(ch) { return this.u2c.get(ch); }
  width(c) { if (this.widths.has(c)) return this.widths.get(c); if (this.std) { const u = this.c2u.get(c); try { return this.std.widthOfTextAtSize(u || ' ', 1000); } catch { return 500; } } return this.dw || 500; }
  hex(codes) { return '<' + codes.map((c) => c.toString(16).padStart(this.blen * 2, '0')).join('') + '>'; }
}
function familyOf(base, flags = 0) {
  if (/calibri|carlito/i.test(base)) return 'Carlito';
  if (/cambria|caladea/i.test(base)) return 'Caladea';
  if (/courier|mono|consol|menlo/i.test(base) || (flags & 1)) return 'LiberationMono';
  if ((/times|georgia|garamond|minion|palatino|antiqua|serif|book/i.test(base) && !/sans/i.test(base)) || ((flags & 2) && !/sans|arial|helvet|verdana|segoe|inter|tahoma|calibri|roboto|open/i.test(base))) return 'LiberationSerif';
  return 'LiberationSans';
}


/* ================= Analyse ================= */
const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const latin1 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };

function analyze(doc, page, vpT) {
  const ctx = doc.context; const contents = page.node.Contents(); if (!contents) return null;
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => ctx.lookup(r)) : [contents];
  const parts = [];
  for (const s of streams) { if (s instanceof PDFRawStream) parts.push(decodePDFRawStream(s).decode()); else if (s instanceof PDFStream && s.getContents) parts.push(s.getContents()); else return null; }
  let total = 0; parts.forEach((p) => total += p.length + 1);
  const buf = new Uint8Array(total); let off = 0; for (const p of parts) { buf.set(p, off); off += p.length; buf[off++] = 10; }
  const res = page.node.Resources(); const fontsDict = res && res.lookup(N('Font'));
  const fonts = new Map(); const fontOf = (name) => { if (!fonts.has(name)) fonts.set(name, new FontInfo(ctx, fontsDict instanceof PDFDict ? fontsDict.lookup(N(name)) : null, name)); return fonts.get(name); };
  const toks = tokenize(buf); const ops = []; let stack = [];
  for (let k = 0; k < toks.length; k++) { const t = toks[k];
    if (t.t === 'op') { ops.push({ op: t.v, args: stack, s: stack.length ? stack[0].s : t.s, e: t.e }); stack = []; }
    else if (t.t === '[') { const arr = []; const s0 = t.s; k++; while (k < toks.length && toks[k].t !== ']') { arr.push(toks[k]); k++; } stack.push({ t: 'arr', v: arr, s: s0, e: toks[k] ? toks[k].e : t.e }); }
    else if (t.t === '<<') { let depth = 1; const s0 = t.s; k++; while (k < toks.length && depth) { if (toks[k].t === '<<') depth++; else if (toks[k].t === '>>') depth--; k++; } k--; stack.push({ t: 'dict', s: s0, e: toks[k].e }); }
    else stack.push(t);
  }
  const raw = (x) => latin1(buf.subarray(x.s, x.e));
  let G = { ctm: [1, 0, 0, 1, 0, 0], fill: [], gs: '', ts: { font: null, size: 0, tc: 0, tw: 0, th: 1, tl: 0, rise: 0, tr: 0 } };
  const stackG = []; let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0]; let chain = 0;
  const shows = []; const num = (a, k) => (a[k] && a[k].t === 'num' ? a[k].v : 0);
  const graphics = []; let path = null; const addPt = (x, y) => { const [u, v] = apply(vpT, ...apply(G.ctm, x, y)); if (!path) path = [u, v, u, v]; else { path[0] = Math.min(path[0], u); path[1] = Math.min(path[1], v); path[2] = Math.max(path[2], u); path[3] = Math.max(path[3], v); } };
  const unitBox = () => { const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => apply(vpT, ...apply(G.ctm, x, y))); graphics.push([Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]); };
  const advance = (bytes, f, ts) => { let w = 0, n = 0; const codes = codesOf(f, bytes); for (const c of codes) { w += f.width(c) / 1000 * ts.size + ts.tc + (!f.twoByte && c === 32 ? ts.tw : 0); n++; } return w * ts.th; };
  for (let i = 0; i < ops.length; i++) {
    const { op, args } = ops[i]; const ts = G.ts;
    switch (op) {
      case 'q': stackG.push({ ...G, fill: [...G.fill], ts: { ...G.ts } }); break;
      case 'Q': if (stackG.length) G = stackG.pop(); break;
      case 'cm': G.ctm = mul(args.map((a) => a.v), G.ctm); break;
      case 'g': case 'rg': case 'k': case 'cs': G.fill = [raw(ops[i])]; break;
      case 'sc': case 'scn': G.fill = [...G.fill.filter((x) => / cs\s*$/.test(x)), raw(ops[i])]; break;
      case 'gs': G.gs = raw(ops[i]); break;
      case 'm': case 'l': addPt(num(args, 0), num(args, 1)); break;
      case 'c': addPt(num(args, 0), num(args, 1)); addPt(num(args, 2), num(args, 3)); addPt(num(args, 4), num(args, 5)); break;
      case 'v': case 'y': addPt(num(args, 0), num(args, 1)); addPt(num(args, 2), num(args, 3)); break;
      case 're': addPt(num(args, 0), num(args, 1)); addPt(num(args, 0) + num(args, 2), num(args, 1) + num(args, 3)); break;
      case 'S': case 's': case 'f': case 'F': case 'f*': case 'B': case 'B*': case 'b': case 'b*': if (path) graphics.push(path); path = null; break;
      case 'n': path = null; break;
      case 'Do': case 'EI': unitBox(); break;
      case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; chain++; break;
      case 'ET': chain++; break;
      case 'Tf': ts.font = args[0] && args[0].v; ts.size = num(args, 1); break;
      case 'Tc': ts.tc = num(args, 0); break; case 'Tw': ts.tw = num(args, 0); break; case 'Tz': ts.th = num(args, 0) / 100; break;
      case 'TL': ts.tl = num(args, 0); break; case 'Ts': ts.rise = num(args, 0); break; case 'Tr': ts.tr = num(args, 0); break;
      case 'Td': tlm = mul([1, 0, 0, 1, num(args, 0), num(args, 1)], tlm); tm = tlm; chain++; break;
      case 'TD': ts.tl = -num(args, 1); tlm = mul([1, 0, 0, 1, num(args, 0), num(args, 1)], tlm); tm = tlm; chain++; break;
      case 'Tm': tlm = args.map((a) => a.v); tm = tlm; chain++; break;
      case 'T*': tlm = mul([1, 0, 0, 1, 0, -ts.tl], tlm); tm = tlm; chain++; break;
      case "'": case '"': case 'Tj': case 'TJ': {
        if (op === '"') { ts.tw = num(args, 0); ts.tc = num(args, 1); }
        if (op === "'" || op === '"') { tlm = mul([1, 0, 0, 1, 0, -ts.tl], tlm); tm = tlm; chain++; }
        const f = fontOf(ts.font); const m = mul(mul([1, 0, 0, 1, 0, ts.rise], tm), G.ctm); const [x, y] = apply(vpT, m[4], m[5]);
        let adv = 0, operand = null, str = '';
        if (op === 'TJ') { operand = args[0]; const arr = args[0] && args[0].t === 'arr' ? args[0].v : []; for (const el of arr) { if (el.t === 'str') { adv += advance(el.v, f, ts); str += decodeStr(f, el.v); } else if (el.t === 'num') adv -= el.v / 1000 * ts.size * ts.th; } }
        else { operand = args[args.length - 1]; if (operand && operand.t === 'str') { adv = advance(operand.v, f, ts); str = decodeStr(f, operand.v); } }
        const lin = mul(tm, G.ctm); const sx = Math.hypot(lin[0], lin[1]) * Math.hypot(vpT[0], vpT[1]);
        shows.push({ i, op, x, y, endX: x + adv * sx, adv, sx, str, font: ts.font, f, ts: { ...ts }, ctm: [...G.ctm], tm: [...tm], fill: [...G.fill], gs: G.gs, operandRaw: operand ? raw(operand) : '', chain, upright: Math.abs(lin[1]) < 1e-6 && Math.abs(lin[2]) < 1e-6 && lin[0] > 0,
          elems: op === 'TJ' ? (args[0] && args[0].t === 'arr' ? args[0].v : []) : null, bytes: op !== 'TJ' && operand && operand.t === 'str' ? operand.v : null });
        tm = mul([1, 0, 0, 1, adv, 0], tm);
        break;
      }
      default: break;
    }
  }
  return { ctx, buf, ops, shows, fonts, fontOf, fontsDict, res, graphics, pageWidth: (() => { const b = page.getCropBox(); const r = ((page.getRotation().angle % 360) + 360) % 360; return r % 180 ? b.height : b.width; })(), pageBottom: (() => { const b = page.getCropBox(); const r = ((page.getRotation().angle % 360) + 360) % 360; return r % 180 ? b.width : b.height; })() };
}
function codesOf(f, bytes) { if (f.blen === 1) return bytes; const out = []; for (let k = 0; k + f.blen - 1 < bytes.length; k += f.blen) { let c = 0; for (let j = 0; j < f.blen; j++) c = (c << 8) | bytes[k + j]; out.push(c); } return out; }
function decodeStr(f, bytes) { let s = ''; for (const c of codesOf(f, bytes)) s += f.c2u.get(c) ?? ''; return s; }

/* ================= Publieke functies ================= */
export function fontsForItems(doc, page, items, vpT) {
  let a; try { a = analyze(doc, page, vpT); } catch { return items.map(() => null); }
  if (!a) return items.map(() => null);
  return items.map((it) => { const sh = matchShows(a.shows, it)[0]; if (!sh || !sh.f.ok) return null; const f = sh.f; return { base: f.base, bold: f.bold, italic: f.italic, fam: f.family === 'LiberationSerif' || f.family === 'Caladea' ? 'Times' : f.family === 'LiberationMono' ? 'Courier' : 'Helvetica' }; });
}
function matchShows(shows, it) {
  const tolY = Math.max(1, it.size * 0.35);
  return shows.filter((sh) => Math.abs(sh.y - it.base) <= tolY && sh.x >= it.x - 1.5 && sh.x <= it.x + it.w - 0.5);
}
let fontkitP;
export function ensureFontkit() {
  if (!fontkitP) fontkitP = window.fontkit ? Promise.resolve(window.fontkit) : new Promise((res, rej) => { const s = document.createElement('script'); s.src = BASE + 'lib/fontkit.min.js'; s.onload = () => res(window.fontkit); s.onerror = () => rej(new Error('fontkit niet geladen')); document.head.append(s); });
  return fontkitP;
}
const fmt = (v) => { const r = Math.round(v * 10000) / 10000; return Object.is(r, -0) ? '0' : String(r); };
const mtx = (m) => m.map(fmt).join(' ');
function hexColor(h) { const m = h.replace('#', '').match(/.{2}/g).map((x) => parseInt(x, 16) / 255); return `${fmt(m[0])} ${fmt(m[1])} ${fmt(m[2])} rg`; }

/**
 * Vervangt tekstfragmenten op een pagina.
 * edits: [{ item:{x,base,w,size}, text, style:{fam,bold,italic,size,color}, style0:{...zelfde, bij aanmaak} }]
 * Resultaat: { ok, overflow:[{index, mm}], reason }
 */
export async function rewritePage(doc, page, edits, vpT, docFonts) {
  const a = analyze(doc, page, vpT); if (!a) return { ok: false, reason: 'geen inhoud' };
  const { ctx, buf, ops, shows } = a;
  // fragmenten koppelen
  const groups = edits.map((e) => ({ e, sh: matchShows(shows, e.item) }));
  if (groups.some((g) => !g.sh.length)) return { ok: false, reason: 'tekst niet gevonden in de paginacode' };
  if (groups.some((g) => g.sh.some((s) => !s.upright))) return { ok: false, reason: 'gedraaide of geschuinde tekst' };
  for (const g of groups) { const last = g.sh[g.sh.length - 1]; if (last.f.usable && last.endX > g.e.item.x + g.e.item.w + Math.max(2, g.e.item.size * 0.6)) return { ok: false, reason: 'tekstfragment loopt over in buurtekst' }; }
  const editOf = new Map(); groups.forEach((g, gi) => g.sh.forEach((s) => editOf.set(s.i, gi)));
  // regels bepalen (op basislijn)
  const lines = [];
  for (const g of groups) { const b = g.sh[0].y; let L = lines.find((l) => Math.abs(l.y - b) <= Math.max(1, g.e.item.size * 0.35)); if (!L) { L = { y: b, tol: Math.max(1, g.e.item.size * 0.35) }; lines.push(L); } }
  const remove = new Set(); const blocks = []; const overflow = [];
  // marge van de tekstkolom: grootste eindpositie van alle tekst op de pagina met dezelfde linkermarge
  const pageRight = Math.max(...shows.map((s) => s.endX));
  // alinea's: als een gewijzigde regel niet meer past (of ruimte vrijkomt), woorden over de regels herverdelen
  const handled = new Set();
  const para = await reflowParagraphs(doc, a, page, groups, editOf, lines, vpT, docFonts, remove, blocks, overflow);
  para.forEach((y) => handled.add(y));
  for (const L of lines) {
    if (handled.has(L)) continue;
    const onLine = shows.filter((s) => Math.abs(s.y - L.y) <= L.tol && s.upright).sort((p, q) => p.x - q.x || p.i - q.i);
    const firstEditX = Math.min(...onLine.filter((s) => editOf.has(s.i)).map((s) => s.x));
    let delta = 0; const done = new Set(); let prevEnd = null; let lastEdit = null;
    for (const s of onLine) {
      if (s.x < firstEditX - 0.01) { prevEnd = Math.max(prevEnd ?? -1e9, s.endX); continue; }
      if (prevEnd != null && !editOf.has(s.i) && s.x - prevEnd > Math.max(20, 3 * s.ts.size * s.sx)) { // andere kolom: niet verschuiven
        if (delta > 0 && prevEnd + delta > s.x - 2 && lastEdit) overflow.push({ index: lastEdit.gi, mm: +((prevEnd + delta - s.x + 2) * 25.4 / 72).toFixed(1), overlap: true });
        delta = 0;
      }
      prevEnd = Math.max(prevEnd ?? -1e9, s.endX);
      const gi = editOf.get(s.i);
      if (gi != null) {
        remove.add(s.i); if (done.has(gi)) continue; done.add(gi);
        const g = groups[gi]; const first = g.sh[0]; const lastS = g.sh[g.sh.length - 1];
        const oldEnd = lastS.endX; const built = await buildEditBlock(doc, a, page, g.e, first, delta, vpT, docFonts);
        blocks.push(built.block);
        const newEnd = first.x + delta + built.widthVp;
        delta = newEnd - oldEnd;
        g.newEnd = newEnd; g.gi = gi; lastEdit = g;
      } else { remove.add(s.i); blocks.push(replayBlock(s, delta, vpT)); }
    }
    const lineEnd = Math.max(...onLine.map((s) => s.endX)) + delta;
    for (const g of groups) if (g.newEnd != null && Math.abs(g.sh[0].y - L.y) <= L.tol && delta > 0.5 && lineEnd > pageRight + 1) overflow.push({ index: g.gi, mm: +((lineEnd - pageRight) * 25.4 / 72).toFixed(1) });
  }
  // nieuwe inhoud: origineel zonder de verwijderde operatoren, omsloten door q/Q, plus de nieuwe blokken
  const enc = new TextEncoder(); const pieces = [enc.encode('q\n')]; let pos = 0;
  for (const i of [...remove].sort((x, y) => x - y)) {
    const o = ops[i]; pieces.push(buf.subarray(pos, o.s));
    let rep = ' ';
    if (o.op === "'") rep = ' T* '; else if (o.op === '"') rep = ` ${fmt(o.args[0] ? o.args[0].v : 0)} Tw ${fmt(o.args[1] ? o.args[1].v : 0)} Tc T* `;
    pieces.push(enc.encode(rep)); pos = o.e;
  }
  pieces.push(buf.subarray(pos)); pieces.push(enc.encode('\nQ\n' + blocks.join('\n') + '\n'));
  let len = 0; pieces.forEach((p) => len += p.length); const out = new Uint8Array(len); let o2 = 0; for (const p of pieces) { out.set(p, o2); o2 += p.length; }
  page.node.set(N('Contents'), ctx.obj([ctx.register(ctx.flateStream(out))])); // als lijst, zodat later tekenen op deze pagina kan
  return { ok: true, overflow, reports: edits.map((e) => e.report || []) };
}
function userShift(vpT, dVp, dyVp = 0) { // verschuiving in viewport terugrekenen naar gebruikersruimte
  const [a, b, c, d] = vpT; const det = a * d - b * c; return [(d * dVp - c * dyVp) / det, (-b * dVp + a * dyVp) / det];
}
function prelude(s, dVp, vpT, fillOverride, dyVp = 0) {
  const [dx, dy] = userShift(vpT, dVp, dyVp); const t = s.ts;
  return `q 1 0 0 1 ${fmt(dx)} ${fmt(dy)} cm ${mtx(s.ctm)} cm ${s.gs ? s.gs + ' ' : ''}${fillOverride || s.fill.join(' ')} BT ${fmt(t.tc)} Tc ${fmt(t.tw)} Tw ${fmt(t.th * 100)} Tz ${fmt(t.rise)} Ts ${fmt(t.tr)} Tr ${mtx(s.tm)} Tm`;
}
function replayBlock(s, dVp, vpT, dyVp = 0) {
  const showOp = s.op === 'TJ' ? 'TJ' : 'Tj';
  return `${prelude(s, dVp, vpT, null, dyVp)} /${s.font} ${fmt(s.ts.size)} Tf ${s.operandRaw} ${showOp} ET Q`;
}
// bouw het blok voor de nieuwe tekst (lettertype per teken gekozen door glyphsOfEdit)
async function buildEditBlock(doc, a, page, e, first, dVp, vpT, docFonts) {
  const gl = await glyphsOfEdit(doc, a, page, e, first, docFonts);
  let parts = '', w = 0, k = 0;
  while (k < gl.length) { const r = gl[k]; let hex = ''; while (k < gl.length && gl[k].res === r.res) { hex += gl[k].hex; w += gl[k].adv; k++; } parts += ` /${r.res} ${fmt(r.size)} Tf <${hex}> Tj`; }
  const fill = gl.length ? gl[0].fill : null;
  const block = gl.length ? `${prelude(first, dVp, vpT, fill)}${parts} ET Q` : '';
  return { block, widthVp: w };
}
// Lettertype uit de bibliotheek of van de gebruiker insluiten (één keer per document) en op de pagina registreren
async function embedSpec(doc, page, spec, docFonts) {
  let entry = docFonts.get(spec.key);
  if (!entry) {
    const fk = await ensureFontkit(); if (!doc._fkRegistered) { doc.registerFontkit(fk); doc._fkRegistered = true; }
    let font = null; try { font = await doc.embedFont(await spec.load(), { subset: false }); } catch (err) { console.warn('lettertype', spec.label, err); }
    entry = { font, pages: new Map(), fk: font && font.embedder && font.embedder.font }; docFonts.set(spec.key, entry);
  }
  if (!entry.font) return null;
  let res = entry.pages.get(page.ref.toString());
  if (!res) { res = page.node.newFontDictionary('PS' + spec.key.replace(/\W/g, '').slice(-24), entry.font.ref).decodeText(); entry.pages.set(page.ref.toString(), res); }
  return { font: entry.font, fk: entry.fk, res };
}
function glyphOk(fk, ch) {
  if (!fk) return false; const cp = ch.codePointAt(0); if (!fk.hasGlyphForCodePoint(cp)) return false;
  if (/\s/.test(ch)) return true; try { const g = fk.glyphForCodePoint(cp); return g.id !== 0 && g.path && g.path.commands.length > 0; } catch { return false; }
}
// Kandidaten (beste eerst) voor de tekens die het originele subset-lettertype niet bevat
async function pickerFor(doc, a, page, e, first, docFonts) {
  const st = e.style, st0 = e.style0 || e.style; const styleChanged = st.bold !== st0.bold || st.italic !== st0.italic || st.fam !== st0.fam;
  const famChanged = st.fam !== st0.fam; const f0 = first.f;
  let orig = f0;
  if (styleChanged) {
    orig = null;
    if (!famChanged && f0.ok && a.fontsDict instanceof PDFDict) for (const [k] of a.fontsDict.entries()) { const f = a.fontOf(k.decodeText()); if (f.ok && f.usable && f.familyKey === f0.familyKey && f.bold === st.bold && f.italic === st.italic) { orig = f; break; } }
    if (!orig && !famChanged && f0.ok && f0.std) {
      const fam = /times/i.test(f0.base) ? 'Times' : /courier/i.test(f0.base) ? 'Courier' : 'Helvetica';
      const key = fam === 'Times' ? (st.bold && st.italic ? 'TimesRomanBoldItalic' : st.bold ? 'TimesRomanBold' : st.italic ? 'TimesRomanItalic' : 'TimesRoman') : fam === 'Courier' ? (st.bold && st.italic ? 'CourierBoldOblique' : st.bold ? 'CourierBold' : st.italic ? 'CourierOblique' : 'Courier') : (st.bold && st.italic ? 'HelveticaBoldOblique' : st.bold ? 'HelveticaBold' : st.italic ? 'HelveticaOblique' : 'Helvetica');
      orig = await stdVariant(doc, page, key, docFonts);
    }
  }
  const specs = [];
  const src = orig && orig.programStream ? orig : (!styleChanged && f0.programStream ? f0 : null);
  if (src) specs.push({ key: 'pdf:' + src.res + ':' + src.rawBase, label: src.base + ' (uit de PDF)', quality: 'origineel',
    load: async () => (src.programStream instanceof PDFRawStream ? decodePDFRawStream(src.programStream).decode() : src.programStream.getContents()),
    // de interne tekentabel moet Unicode zijn: breedtes van bekende tekens moeten kloppen met de PDF
    validate: (fk) => { if (!fk || !src.u2c || !src.widths.size) return false; let n = 0;
      for (const [u, c] of src.u2c) { if (n >= 12) break; if (/\s/.test(u) || !src.widths.has(c)) continue; const cp = u.codePointAt(0); if (!fk.hasGlyphForCodePoint(cp)) return false;
        const w = fk.glyphForCodePoint(cp).advanceWidth * 1000 / fk.unitsPerEm; if (Math.abs(w - src.widths.get(c)) > Math.max(2, src.widths.get(c) * 0.02)) return false; n++; }
      return n >= 3; } });
  const p = { base: famChanged ? '' : (f0.ok ? f0.base : ''), uiFamily: famChanged ? st.fam : null, italic: st.italic, serif: f0.serif || st.fam === 'Times', mono: f0.mono || st.fam === 'Courier' };
  if (st.bold !== st0.bold || famChanged) p.weight = st.bold ? 700 : 400;
  else if (!f0.ok || !/bold|light|medium|semi|demi|black|heavy|thin/i.test(f0.base)) p.weight = st.bold ? 700 : 400;
  specs.push(...(await candidates(p)));
  return { orig, specs };
}
async function glyphsOfEdit(doc, a, page, e, first, docFonts) {
  const st = e.style, st0 = e.style0 || e.style; const scale = st0.size ? st.size / st0.size : 1; const size = first.ts.size * scale; const t = first.ts;
  const { orig, specs } = await pickerFor(doc, a, page, e, first, docFonts);
  const fill = st.color && st0.color && st.color.toLowerCase() !== st0.color.toLowerCase() ? hexColor(st.color) : null;
  const out = []; let prevRes = null, run = 0; const report = new Map();
  const note = (label, quality) => { const r = report.get(label) || { label, quality, n: 0 }; r.n++; report.set(label, r); };
  const embedded = []; // [{spec, emb}]
  for (const ch of e.text) {
    let g = null;
    if (orig && orig.has(ch)) { const c = orig.code(ch); const w = (orig.width(c) / 1000 * size + t.tc + (!orig.twoByte && c === 32 ? t.tw : 0)) * t.th;
      g = { res: orig.res, hex: c.toString(16).padStart((orig.blen || 1) * 2, '0'), adv: w * first.sx }; note((orig.base || 'origineel') + ' (origineel)', 'origineel'); }
    else {
      let pick = null;
      for (let k = 0; k < specs.length && !pick; k++) {
        if (!embedded[k]) { const emb = await embedSpec(doc, page, specs[k], docFonts); embedded[k] = { spec: specs[k], emb: emb && specs[k].validate && !specs[k].validate(emb.fk) ? null : emb }; }
        const E = embedded[k]; if (E.emb && (glyphOk(E.emb.fk, ch) || (k === specs.length - 1))) pick = E;
      }
      if (!pick) pick = embedded.find((x) => x && x.emb);
      const font = pick.emb.font; const w = (font.widthOfTextAtSize(ch, size) + t.tc) * t.th;
      g = { res: pick.emb.res, hex: font.encodeText(ch).toString().replace(/[<>]/g, ''), adv: w * first.sx }; note(pick.spec.label, pick.spec.quality);
    }
    if (g.res !== prevRes) { run = ++runSeq; prevRes = g.res; }
    out.push({ run, src: first, res: g.res, size, fill, hex: g.hex, ch, adv: g.adv, kern: 0, space: ch === ' ', gapAfter: 0 });
  }
  e.report = [...report.values()];
  return out;
}

// Reserve voor de afdek-route (als de paginacode niet aangepast kan worden)
export async function embedFallbackFont(doc, fam, bold, italic, docFonts, baseHint) {
  const specs = await candidates({ base: baseHint || '', uiFamily: baseHint ? null : fam, weight: bold ? 700 : 400, italic, serif: fam === 'Times', mono: fam === 'Courier' });
  for (const spec of specs) { let entry = docFonts.get(spec.key); if (!entry) { const fk = await ensureFontkit(); if (!doc._fkRegistered) { doc.registerFontkit(fk); doc._fkRegistered = true; } let font = null; try { font = await doc.embedFont(await spec.load(), { subset: false }); } catch {} entry = { font, pages: new Map() }; docFonts.set(spec.key, entry); } if (entry.font) return entry.font; }
  throw new Error('geen lettertype beschikbaar');
}

// Standaardletter als bruikbaar 'origineel' lettertype op de pagina
async function stdVariant(doc, page, key, docFonts) {
  const id = 'std:' + key; let entry = docFonts.get(id);
  if (!entry) { entry = { font: await doc.embedFont(StandardFonts[key]), pages: new Map(), emb: StandardFontEmbedder.for(StandardFonts[key]) }; docFonts.set(id, entry); }
  let res = entry.pages.get(page.ref.toString());
  if (!res) { res = page.node.newFontDictionary('PSStd' + key, entry.font.ref).decodeText(); entry.pages.set(page.ref.toString(), res); }
  const emb = entry.emb;
  return {
    res, twoByte: false, blen: 1, base: { TimesRoman: 'Times-Roman', TimesRomanBold: 'Times-Bold', TimesRomanItalic: 'Times-Italic', TimesRomanBoldItalic: 'Times-BoldItalic', HelveticaBold: 'Helvetica-Bold', HelveticaOblique: 'Helvetica-Oblique', HelveticaBoldOblique: 'Helvetica-BoldOblique' }[key] || key,
    has(ch) { if (ch === ' ') return true; const c = WIN_REV.get(ch); return c != null; },
    code(ch) { return WIN_REV.get(ch); },
    width(c) { try { return emb.widthOfTextAtSize(String.fromCharCode(WIN[c]), 1000); } catch { return 500; } },
    hex(codes) { return '<' + codes.map((c) => c.toString(16).padStart(2, '0')).join('') + '>'; }
  };
}
const WIN_REV = new Map(Object.entries(WIN).map(([c, u]) => [String.fromCharCode(u), +c]));

/* ================= Alinea-reflow ================= */
const invAff = (m) => { const det = m[0] * m[3] - m[1] * m[2]; return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]; };
let runSeq = 0;
function glyphsOfShow(s) {
  const f = s.f, t = s.ts, out = []; const run = ++runSeq;
  const push = (bytes) => { for (const c of codesOf(f, bytes)) { const w = (f.width(c) / 1000 * t.size + t.tc + (!f.twoByte && c === 32 ? t.tw : 0)) * t.th; const ch = f.c2u.get(c) ?? ''; out.push({ run, src: s, res: s.font, size: t.size, fill: null, hex: c.toString(16).padStart(f.blen * 2, '0'), ch, adv: w * s.sx, kern: 0, space: ch === ' ', gapAfter: 0 }); } };
  if (s.elems) { for (const el of s.elems) { if (el.t === 'str') push(el.v); else if (el.t === 'num' && out.length) { const g = out[out.length - 1]; g.kern += el.v; g.adv -= el.v / 1000 * t.size * t.th * s.sx; } } }
  else if (s.bytes) push(s.bytes);
  return out;
}
function lineGroups(shows) {
  const ls = [];
  for (const s of shows.filter((x) => x.upright && (x.str || '').length)) { const tol = Math.max(1, s.ts.size * s.sx * 0.35); let L = ls.find((l) => Math.abs(l.y - s.y) <= tol); if (!L) { L = { y: s.y, shows: [] }; ls.push(L); } L.shows.push(s); }
  ls.forEach((L) => { L.shows.sort((p, q) => p.x - q.x || p.i - q.i); L.left = L.shows[0].x; L.end = Math.max(...L.shows.map((s) => s.endX)); L.size = L.shows[0].ts.size * L.shows[0].sx;
    L.gapped = L.shows.some((s, k) => k && s.x - Math.max(...L.shows.slice(0, k).map((q) => q.endX)) > Math.max(20, 3 * L.size)); });
  return ls.sort((p, q) => p.y - q.y);
}
async function reflowParagraphs(doc, a, page, groups, editOf, editLines, vpT, docFonts, remove, blocks, overflow) {
  const handled = []; const all = lineGroups(a.shows);
  const lineOf = (y) => all.find((l) => Math.abs(l.y - y) <= Math.max(1, l.size * 0.35));
  const used = new Set();
  // rechterrand van de tekst: breedste regel in de kolom (bij ≥3 regels), anders gespiegelde linkermarge
  const textRight = (L) => { const col = all.filter((l) => Math.abs(l.left - L.left) <= 2 && !l.gapped); const m = Math.max(...col.map((l) => l.end)); return col.length >= 3 ? m : Math.max(m, a.pageWidth - L.left); };
  const firstWordW = (L) => { let w = 0; for (const g of glyphsOfShow(L.shows[0])) { if (g.space) break; w += g.adv; } return w; };
  const wrapped = (prev, L) => prev.end + prev.size * 0.25 + firstWordW(L) > textRight(prev) - 0.5;
  for (const EL of editLines) {
    const L0 = lineOf(EL.y); if (!L0 || used.has(L0) || L0.gapped) continue;
    const k0 = all.indexOf(L0);
    // alinea: volgende regels met dezelfde linkermarge, regelafstand en lettergrootte
    const P = [L0]; let lead = null;
    for (let k = k0 + 1; k < all.length; k++) {
      const L = all[k], prev = all[k - 1]; const d = L.y - prev.y;
      if (L.gapped || Math.abs(L.size - L0.size) > L0.size * 0.15 || d > L0.size * 2.2 || d < L0.size * 0.9) break;
      const prevTxt = prev.shows.map((x) => x.str).join('').trim(), nextTxt = L.shows.map((x) => x.str).join('').trim();
      if (!wrapped(prev, L)) break; // harde regeleinde: de vorige regel was niet vol
      if (/[.!?:]$/.test(prevTxt) && /^[A-Z0-9À-Ý•]/.test(nextTxt) && P.length === 1 && editLines.length && k === k0 + 1 && prev === L0) break;
      if (P.length === 1) { if (Math.abs(L.left - L0.left) > L0.size * 3) break; lead = d; } else if (Math.abs(L.left - P[1].left) > 2 || Math.abs(d - lead) > lead * 0.2) break;
      P.push(L);
    }
    const paraLeft = P.length > 1 ? P[1].left : L0.left;
    // regels boven de gewijzigde regel die tot dezelfde alinea horen (alleen voor marge en uitvulling)
    const above = [];
    for (let k = k0 - 1; k >= 0; k--) { const L = all[k], nxt = all[k + 1]; const d = nxt.y - L.y; const ld = lead || d;
      if (L.gapped || Math.abs(L.size - L0.size) > L0.size * 0.15 || Math.abs(d - ld) > ld * 0.2 || d > L0.size * 2.2) break;
      if (Math.abs(L.left - L0.left) > 2 && k !== k0 - 1 && Math.abs(L.left - all[k + 1].left) > L0.size * 3) break;
      if (!wrapped(L, all[k + 1])) break;
      above.unshift(L); if (!lead) lead = d; if (Math.abs(L.left - paraLeft) > 2) break; }
    const ctxLines = [...above, ...P];
    // rechtermarge: langste regel van de alinea, of van de kolom als de alinea één regel heeft
    let R = Math.max(...ctxLines.map((l) => l.end));
    { const col = all.filter((l) => (Math.abs(l.left - L0.left) <= 2 || Math.abs(l.left - paraLeft) <= 2) && !l.gapped); R = Math.max(R, ...col.map((l) => l.end)); } // breedte van de tekstkolom
    if (ctxLines.length === 1) R = Math.max(R, a.pageWidth - Math.min(L0.left, paraLeft)); // losse regel: tot de rechtermarge (gespiegeld)
    if (!lead) lead = L0.size * 1.2;
    // glyph-stroom opbouwen
    const lineGlyphs = [];
    for (const L of P) {
      const gl = []; const doneG = new Set(); let prevEnd = null;
      for (const s of L.shows) {
        const gi = editOf.get(s.i); let add;
        if (gi != null) { if (doneG.has(gi)) continue; doneG.add(gi); const g = groups[gi]; add = await glyphsOfEdit(doc, a, page, g.e, g.sh[0], docFonts); add.forEach((x) => x.edit = gi); if (!add.length && gl.length) { gl[gl.length - 1].gapAfter += 0; } }
        else add = glyphsOfShow(s);
        if (prevEnd != null && gl.length) { const gap = s.x - prevEnd; if (gap > 0.3) gl[gl.length - 1].gapAfter += gap; }
        gl.push(...add);
        const last = gi != null ? groups[gi].sh[groups[gi].sh.length - 1] : s; prevEnd = last.endX;
      }
      lineGlyphs.push(gl);
    }
    const width = (gl) => gl.reduce((w, g) => w + g.adv + g.gapAfter, 0);
    const newFirstEnd = L0.left + width(lineGlyphs[0]);
    // woorden
    const words = []; let cur = [];
    const flat = lineGlyphs.flat();
    flat.forEach((g, idx) => { cur.push(g); const br = g.space || g.gapAfter > 0.2 * L0.size || (g.kern < -200 && !g.space); const lineEndOrig = lineGlyphs.some((gl) => gl[gl.length - 1] === g); if (br || lineEndOrig || idx === flat.length - 1) { words.push({ gl: cur, softEnd: lineEndOrig && !br }); cur = []; } });
    // regeleinde-woorden uit de originele opmaak zonder spatie: voeg een spatie-breedte toe bij samenvoegen
    const spaceW = L0.size * 0.28;
    const wW = (w) => width(w.gl); const trail = (w) => { const g = w.gl[w.gl.length - 1]; return g.space ? g.adv + g.gapAfter : g.gapAfter; };
    // nodig?
    const firstLineFits = newFirstEnd <= R + 0.5;
    const nextFirstWord = P.length > 1 ? (() => { let ww = 0; for (const g of lineGlyphs[1]) { if (g.space) break; ww += g.adv; } return ww; })() : Infinity;
    const pullUp = P.length > 1 && newFirstEnd + spaceW + nextFirstWord <= R && L0.end + spaceW + nextFirstWord > R - 0.5;
    if (firstLineFits && !pullUp) continue; // regelverschuiving volstaat
    // greedy indeling
    const outLines = []; let line = [], lw = 0; let avail = R - L0.left;
    for (const w of words) {
      const add = (line.length && !line[line.length - 1].gl[line[line.length - 1].gl.length - 1].space && line[line.length - 1].softEnd ? spaceW : 0);
      const need = lw + add + wW(w) - trail(w);
      if (line.length && need > avail + 0.5) { outLines.push(line); line = []; lw = 0; avail = R - paraLeft; }
      if (line.length && add) line[line.length - 1].join = add;
      line.push(w); lw += (line.length > 1 ? add : 0) + wW(w);
    }
    if (line.length) outLines.push(line);
    // extra regels: past dat onder de alinea zonder botsing?
    const extra = outLines.length - P.length; let pushDown = 0;
    if (extra > 0) {
      const lastY = P[P.length - 1].y; const yBot = lastY + lead * extra + L0.size * 0.3;
      const inP = (s) => P.some((l) => l.shows.includes(s));
      const clash = a.shows.some((s) => !inP(s) && s.y > lastY + 1 && s.y < yBot + L0.size && s.endX > paraLeft && s.x < R);
      if (clash) {
        // alles wat onder de alinea in dezelfde kolom staat, zakt mee — alleen als daar geen afbeeldingen of lijnen staan en de pagina lang genoeg is
        const below = a.shows.filter((s) => !inP(s) && s.upright && s.y > lastY + 1 && s.endX > paraLeft - 2 && s.x < R + 2);
        const blocking = a.graphics.some((g) => g[1] > lastY && g[2] > paraLeft - 2 && g[0] < R + 2 && (g[2] - g[0] > 2 || g[3] - g[1] > 2));
        const pageBottom = a.pageBottom; const lowest = Math.max(...below.map((s) => s.y));
        const dy = lead * extra;
        const canPush = !blocking && below.every((s) => !editOf.has(s.i)) && lowest + dy <= Math.max(pageBottom - 28, lowest);
        if (canPush) { pushDown = dy; for (const s of below) { remove.add(s.i); blocks.push(replayBlock(s, 0, vpT, dy)); } }
        else overflow.push({ index: groups.findIndex((g) => g.sh.some((s) => L0.shows.includes(s))), mm: +((lead * extra) * 25.4 / 72).toFixed(1), lines: extra });
      }
    }
    // uitvullen?
    const nonLast = ctxLines.slice(0, -1); const justified = ctxLines.length >= 3 && nonLast.every((l) => l.end >= R - 1.5);
    // posities berekenen en uitvoeren
    outLines.forEach((ln, li) => {
      const y = li < P.length ? P[li].y : P[P.length - 1].y + lead * (li - P.length + 1);
      let x = li === 0 ? L0.left : paraLeft;
      const gls = []; ln.forEach((w, wi) => { w.gl.forEach((g) => gls.push(g)); if (w.join && wi < ln.length - 1) gls[gls.length - 1] = { ...gls[gls.length - 1], gapAfter: gls[gls.length - 1].gapAfter + w.join }; });
      // laatste glyph: geen naloop
      const lastG = gls[gls.length - 1]; let lineW = width(gls) - (lastG.space ? lastG.adv : 0) - lastG.gapAfter;
      const isLastLine = li === outLines.length - 1;
      let extraPer = 0; const breaks = ln.length - 1;
      if (justified && !isLastLine && breaks > 0) extraPer = Math.max(0, (R - x - lineW) / breaks);
      // runs
      let k = 0; let wordEndIdx = new Set(); let acc = 0; ln.forEach((w, wi) => { acc += w.gl.length; if (wi < ln.length - 1) wordEndIdx.add(acc - 1); });
      while (k < gls.length) {
        const r0 = gls[k]; let j = k; const items = []; const startX = x;
        while (j < gls.length && gls[j].run === r0.run) {
          const g = gls[j]; const isLast = j === gls.length - 1;
          let kern = g.kern; const t = g.src.ts;
          const extraVp = (wordEndIdx.has(j) ? extraPer : 0) + (isLast ? 0 : g.gapAfter);
          if (extraVp && j + 1 < gls.length && gls[j + 1].run === g.run) kern -= (extraVp / g.src.sx) / (g.size * t.th) * 1000;
          if (isLast) kern = 0;
          items.push({ hex: g.hex, kern });
          x += g.adv + (isLast ? 0 : (g.gapAfter + (wordEndIdx.has(j) ? extraPer : 0)));
          if (isLast && g.kern) x += 0;
          j++;
        }
        blocks.push(runBlock(r0, startX, y, items, vpT));
        k = j;
      }
    });
    // alle oorspronkelijke tekst van deze alinea weghalen
    for (const L of P) for (const s of L.shows) remove.add(s.i);
    P.forEach((L) => used.add(L));
    for (const L of P) for (const E of editLines) if (Math.abs(E.y - L.y) <= Math.max(1, L.size * 0.35)) handled.push(E);
    if (extra > 0) overflow.push({ index: groups.findIndex((g) => g.sh.some((s) => L0.shows.includes(s))), mm: 0, lines: extra, info: true, pushed: pushDown });
  }
  return handled;
}
function runBlock(g, x, y, items, vpT) {
  const s = g.src, t = s.ts; const u = apply(invAff(vpT), x, y); const o = apply(invAff(s.ctm), u[0], u[1]);
  const tm = [s.tm[0], s.tm[1], s.tm[2], s.tm[3], o[0] - t.rise * s.tm[2], o[1] - t.rise * s.tm[3]];
  let arr = ''; let hex = '';
  for (const it of items) { hex += it.hex; if (it.kern) { arr += `<${hex}> ${fmt(it.kern)} `; hex = ''; } }
  if (hex) arr += `<${hex}>`;
  return `q ${mtx(s.ctm)} cm ${s.gs ? s.gs + ' ' : ''}${g.fill || s.fill.join(' ')} BT ${fmt(t.tc)} Tc ${fmt(t.tw)} Tw ${fmt(t.th * 100)} Tz ${fmt(t.rise)} Ts ${fmt(t.tr)} Tr ${mtx(tm)} Tm /${g.res} ${fmt(g.size)} Tf [${arr}] TJ ET Q`;
}
