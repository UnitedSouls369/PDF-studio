// Converteren naar Office: PDF → Word (.docx), Excel (.xlsx), PowerPoint (.pptx) — volledig lokaal
import { L } from './i18n.js';
import { el, F, PDFLib, fflate, loadPdf, openPdfJs, bytesToPdfJs, pdfjsLib, parseRange, baseName } from './core.js';

const enc = new TextEncoder();
const X = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
const plural = (n) => `${n} pagina${n === 1 ? '' : "'s"}`;
const pack = (files) => { const o = {}; for (const [k, v] of Object.entries(files)) o[k] = typeof v === 'string' ? enc.encode(v) : v; return fflate.zipSync(o, { level: 6 }); };
const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/* ================= Lay-outanalyse ================= */
const PS_FAMILY = [[/arial|helvetica|arimo|liberationsans/i, 'Arial'], [/times|tinos|liberationserif|nimbusrom/i, 'Times New Roman'], [/courier|cousine|liberationmono/i, 'Courier New'], [/calibri|carlito/i, 'Calibri'], [/cambria|caladea/i, 'Cambria'], [/verdana/i, 'Verdana'], [/tahoma/i, 'Tahoma'], [/georgia/i, 'Georgia'], [/segoe/i, 'Segoe UI'], [/garamond/i, 'Garamond'], [/montserrat/i, 'Montserrat'], [/inter\b|inter-/i, 'Inter'], [/roboto/i, 'Roboto'], [/opensans|open sans/i, 'Open Sans'], [/dejavusans/i, 'DejaVu Sans'], [/symbol/i, 'Symbol']];
function fontInfo(page, name) {
  let raw = '', fo = null; try { if (page.commonObjs.has(name)) { fo = page.commonObjs.get(name); raw = fo.name || fo.loadedName || ''; } } catch {}
  const base = raw.replace(/^[A-Z]{6}\+/, '');
  const fam = (PS_FAMILY.find(([re]) => re.test(base)) || [, null])[1] || base.split(/[-,]/)[0].replace(/(PSMT|MT|PS)$/,'').replace(/([a-z])([A-Z])/g, '$1 $2') || 'Arial';
  return { fam, bold: !!(fo && (fo.bold || fo.black)) || /bold|black|heavy|semibold|demi/i.test(base), italic: !!(fo && fo.italic) || /italic|oblique/i.test(base) };
}
// Tekst, lijnen, cellen en afbeeldingen van één pagina
export async function analyzePage(page, { images = false } = {}) {
  const vp = page.getViewport({ scale: 1 });
  const opl = await page.getOperatorList(); // laadt ook de lettertypen in commonObjs
  const tc = await page.getTextContent();
  const spans = [];
  for (const it of tc.items) {
    if (!it.str) continue;
    const t = pdfjsLib.Util.transform(vp.transform, it.transform); const size = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]);
    if (Math.abs(t[1]) > 0.05 * size || Math.abs(t[2]) > 0.05 * size || t[0] <= 0) continue; // alleen horizontale tekst
    const fi = fontInfo(page, it.fontName);
    spans.push({ str: it.str, x: t[4], y: t[5], w: it.width * vp.scale, size, ...fi });
  }
  spans.sort((a, b) => a.y - b.y || a.x - b.x);
  // regels
  const lines = [];
  for (const s of spans) {
    if (!s.str.trim() && !lines.length) continue;
    const ln = lines.find((l) => Math.abs(l.y - s.y) < Math.max(2, Math.min(l.size, s.size) * 0.4) && s.y >= l.y - l.size);
    if (ln) { ln.spans.push(s); ln.size = Math.max(ln.size, s.size); } else lines.push({ y: s.y, size: s.size, spans: [s] });
  }
  for (const l of lines) {
    l.spans.sort((a, b) => a.x - b.x); const cells = []; let cur = null;
    for (const s of l.spans) {
      if (!s.str.trim()) { if (cur) cur.pendingSpace = true; continue; }
      const gap = cur ? s.x - cur.x1 : 0;
      if (!cur || gap > Math.max(s.size * 1.1, 6)) { cur = { x0: s.x, x1: s.x + s.w, runs: [] }; cells.push(cur); }
      else if ((gap > s.size * 0.12 || cur.pendingSpace) && !/\s$/.test(cur.runs.at(-1).text) && !/^\s/.test(s.str)) cur.runs.at(-1).text += ' ';
      cur.pendingSpace = false;
      const last = cur.runs.at(-1);
      if (last && last.bold === s.bold && last.italic === s.italic && Math.abs(last.size - s.size) < 0.3 && last.fam === s.fam) last.text += s.str;
      else cur.runs.push({ text: s.str, bold: s.bold, italic: s.italic, size: s.size, fam: s.fam });
      cur.x1 = Math.max(cur.x1, s.x + s.w);
    }
    cells.forEach((c) => { c.runs.forEach((r) => { r.text = r.text.replace(/\s+/g, ' '); }); c.runs[0] && (c.runs[0].text = c.runs[0].text.replace(/^\s+/, '')); c.runs.at(-1) && (c.runs.at(-1).text = c.runs.at(-1).text.replace(/\s+$/, '')); c.text = c.runs.map((r) => r.text).join(''); });
    l.cells = cells.filter((c) => c.text);
    const BUL = /^([•·▪●○■◦\-–*]|[\ue000-\uf8ff])$/;
    if (l.cells.length > 1 && BUL.test(l.cells[0].text)) { const b = l.cells.shift(); const n = l.cells[0]; n.runs.unshift({ ...n.runs[0], text: '• ' }); n.text = '• ' + n.text; n.x0 = b.x0; }
    l.x0 = l.cells.length ? l.cells[0].x0 : 0; l.x1 = l.cells.length ? l.cells.at(-1).x1 : 0;
  }
  const L2 = lines.filter((l) => l.cells.length);
  // afbeeldingen (positie via de transformatiematrix)
  const imgs = [];
  if (images) {
    const O = pdfjsLib.OPS; let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    for (let i = 0; i < opl.fnArray.length; i++) {
      const fn = opl.fnArray[i], a = opl.argsArray[i];
      if (fn === O.save) stack.push(ctm); else if (fn === O.restore) ctm = stack.pop() || ctm;
      else if (fn === O.transform) ctm = mul(ctm, a);
      else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); if (a[0]) ctm = mul(ctm, a[0]); }
      else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || ctm;
      else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject) {
        const m = mul(vp.transform, ctm); const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]], ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
        const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        if (box.w < 12 || box.h < 12) continue;
        let obj = fn === O.paintInlineImageXObject ? a[0] : null;
        try { if (!obj) obj = page.objs.get(a[0]); } catch { obj = null; }
        if (obj) imgs.push({ ...box, obj });
      }
    }
  }
  return { w: vp.width, h: vp.height, lines: L2, images: imgs };
}
async function imageToPng(obj) {
  const w = obj.width, h = obj.height; if (!w || !h) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (obj.bitmap) g.drawImage(obj.bitmap, 0, 0);
  else if (obj.data) {
    const id = g.createImageData(w, h); const d = obj.data; const n = w * h;
    if (d.length === n * 4) id.data.set(d); else if (d.length === n * 3) { for (let i = 0, j = 0; i < n; i++) { id.data[j++] = d[i * 3]; id.data[j++] = d[i * 3 + 1]; id.data[j++] = d[i * 3 + 2]; id.data[j++] = 255; } }
    else if (d.length === n) { for (let i = 0, j = 0; i < n; i++) { id.data[j++] = id.data[j++] = id.data[j++] = d[i]; id.data[j++] = 255; } }
    else return null;
    g.putImageData(id, 0, 0);
  } else return null;
  const b = await new Promise((r) => c.toBlob(r, 'image/png')); return b ? new Uint8Array(await b.arrayBuffer()) : null;
}
// Tabellen: aaneengesloten regels met meerdere cellen; kolommen = samengevoegde x-intervallen
export function findBlocks(lines, { minRows = 2 } = {}) {
  const blocks = []; let i = 0;
  while (i < lines.length) {
    if (lines[i].cells.length >= 2) {
      let j = i + 1; while (j < lines.length && lines[j].cells.length >= 1 && (lines[j].y - lines[j - 1].y) < Math.max(lines[j].size, lines[j - 1].size) * 2.6 && (lines[j].cells.length >= 2 || (j + 1 < lines.length && lines[j + 1].cells.length >= 2 && lines[j].cells[0].x0 > lines[i].x0 - 2))) j++;
      const rows = lines.slice(i, j);
      if (rows.filter((r) => r.cells.length >= 2).length >= minRows) {
        const iv = rows.flatMap((r) => r.cells.map((c) => [c.x0, c.x1])).sort((a, b) => a[0] - b[0]); const cols = [];
        for (const [a, b] of iv) { const last = cols.at(-1); if (last && a <= last[1] + 2) last[1] = Math.max(last[1], b); else cols.push([a, b]); }
        if (cols.length >= 2) {
          const grid = rows.map((r) => { const row = cols.map(() => []); r.cells.forEach((c) => { const m = (c.x0 + c.x1) / 2; let k = cols.findIndex(([a, b]) => m >= a - 1 && m <= b + 1); if (k < 0) k = cols.reduce((best, [a, b], q) => Math.abs((a + b) / 2 - m) < Math.abs((cols[best][0] + cols[best][1]) / 2 - m) ? q : best, 0); row[k].push(c); }); return row; });
          blocks.push({ type: 'table', y: rows[0].y - rows[0].size, y1: rows.at(-1).y, cols, rows: grid, lines: rows }); i = j; continue;
        }
      }
    }
    const last = blocks.at(-1); if (last && last.type === 'text') last.lines.push(lines[i]); else blocks.push({ type: 'text', y: lines[i].y - lines[i].size, lines: [lines[i]] });
    i++;
  }
  return blocks;
}
// Regels samenvoegen tot alinea's
function paragraphs(lines, pageW) {
  const out = []; let cur = null; const sizes = lines.map((l) => l.size).sort((a, b) => a - b); const body = sizes[Math.floor(sizes.length / 2)] || 11;
  lines.forEach((l, k) => {
    const prev = lines[k - 1]; const runs = l.cells.flatMap((c, q) => q ? [{ ...c.runs[0], text: '\t' }, ...c.runs] : c.runs).filter((r) => r.text);
    const bullet = /^[•·▪●○■◦\-–]\s|^\(?\d{1,2}[.)]\s|^[a-z][.)]\s/.test(l.cells[0].text);
    const gap = prev ? l.y - prev.y : 0;
    const center = Math.abs((l.x0 + l.x1) / 2 - pageW / 2) < pageW * 0.04 && l.x0 > pageW * 0.2;
    const newPara = !cur || bullet || gap > Math.max(l.size, prev.size) * 1.75 || Math.abs(l.size - prev.size) > 1 || Math.abs(l.x0 - cur.x0) > l.size * 2.5 && !cur.hang || /[.:!?]$/.test(prev.cells.at(-1).text) && prev.x1 < cur.maxX1 - l.size * 4 || center !== cur.center;
    if (newPara) { cur = { lines: [l], runs: runs.map((r) => ({ ...r })), x0: l.x0, maxX1: l.x1, size: l.size, center, hang: bullet, heading: l.size >= body * 1.6 ? 1 : l.size >= body * 1.22 ? 2 : 0, gapBefore: gap - l.size * 1.2 }; out.push(cur); }
    else {
      const lastRun = cur.runs.at(-1); const first = runs[0];
      if (/[a-zà-ÿ]-$/.test(lastRun.text) && /^[a-zà-ÿ]/.test(first.text)) lastRun.text = lastRun.text.slice(0, -1); else lastRun.text += ' ';
      runs.forEach((r) => { const lr = cur.runs.at(-1); if (lr.bold === r.bold && lr.italic === r.italic && Math.abs(lr.size - r.size) < 0.3 && lr.fam === r.fam) lr.text += r.text; else cur.runs.push({ ...r }); });
      cur.lines.push(l); cur.maxX1 = Math.max(cur.maxX1, l.x1);
    }
  });
  out.forEach((p) => { p.align = p.center ? 'center' : (p.lines.length > 2 && p.lines.slice(0, -1).every((l) => Math.abs(l.x1 - p.maxX1) < 2)) ? 'both' : 'left'; });
  return out;
}

/* ================= PDF → Word ================= */
const half = (pt) => Math.max(2, Math.round(pt * 2));
const tw = (pt) => Math.round(pt * 20);
const emu = (pt) => Math.round(pt * 12700);
function runXml(r) {
  const props = `<w:rPr><w:rFonts w:ascii="${X(r.fam)}" w:hAnsi="${X(r.fam)}" w:cs="${X(r.fam)}"/>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}<w:sz w:val="${half(r.size)}"/><w:szCs w:val="${half(r.size)}"/></w:rPr>`;
  return r.text.split('\t').map((t, i) => (i ? `<w:r>${props}<w:tab/></w:r>` : '') + (t ? `<w:r>${props}<w:t xml:space="preserve">${X(t)}</w:t></w:r>` : '')).join('');
}
function paraXml(p, marginL) {
  const style = p.heading ? `<w:pStyle w:val="Heading${p.heading}"/>` : '';
  const ind = !p.center && p.x0 - marginL > 8 ? `<w:ind w:left="${tw(p.x0 - marginL)}"/>` : '';
  const before = Math.max(0, Math.min(24, p.gapBefore || 0));
  return `<w:p><w:pPr>${style}<w:spacing w:before="${tw(before)}" w:after="${tw(4)}" w:line="${Math.round(240 * 1.08)}" w:lineRule="auto"/>${ind}<w:jc w:val="${p.align}"/></w:pPr>${p.runs.map(runXml).join('')}</w:p>`;
}
function tableXml(b) {
  let W = b.cols.map(([a, c], i) => Math.max((b.cols[i + 1] ? b.cols[i + 1][0] : c + 6) - a, c - a + 16));
  const tot = W.reduce((x, y) => x + y, 0); if (b.maxW && tot > b.maxW) W = W.map((w) => w * b.maxW / tot);
  const rows = b.rows.map((row) => `<w:tr>${row.map((cells, i) => `<w:tc><w:tcPr><w:tcW w:w="${tw(W[i])}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${cells.length && b.cols[i] && cells[0].x0 > b.cols[i][0] + 8 && Math.abs(cells.at(-1).x1 - b.cols[i][1]) < 2 ? '<w:jc w:val="right"/>' : ''}</w:pPr>${cells.flatMap((c, q) => (q ? [{ ...c.runs[0], text: ' ' }] : []).concat(c.runs)).map(runXml).join('')}</w:p></w:tc>`).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="A6B4BC"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${W.map((w) => `<w:gridCol w:w="${tw(w)}"/>`).join('')}</w:tblGrid>${rows}</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;
}
function imageXml(rid, id, wpt, hpt) {
  return `<w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emu(wpt)}" cy="${emu(hpt)}"/><wp:docPr id="${id}" name="Afbeelding ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(wpt)}" cy="${emu(hpt)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
const DOCX_STYLES = (font, size) => XMLH + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${X(font)}" w:hAnsi="${X(font)}" w:cs="${X(font)}" w:eastAsia="${X(font)}"/><w:sz w:val="${half(size)}"/><w:szCs w:val="${half(size)}"/><w:lang w:val="nl-BE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
const CORE_XML = (title, app) => XMLH + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(title)}</dc:title><dc:creator>${X(app)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`;
const APPNAME = () => (document.title.includes('ABN') ? 'ABN PDF Studio' : 'PDF Studio');

async function pdfToDocx(pdf, { pages, images = true, pageBreaks = true, ocrTexts = [], progress } = {}) {
  const body = []; const media = {}; let imgN = 0; let first = null; const fontCount = new Map(), sizeCount = new Map(); let minX = 1e9, maxX = 0;
  const analyzed = [];
  for (const [k, i] of pages.entries()) {
    progress && progress(L(`Pagina ${i + 1} analyseren…`, `Analysing page ${i + 1}…`));
    const page = await pdf.getPage(i + 1); const a = await analyzePage(page, { images: images && ocrTexts[i] == null }); a.ocr = ocrTexts[i]; if (a.ocr != null) a.lines = []; analyzed.push(a); if (!first) first = a;
    a.lines.forEach((l) => { minX = Math.min(minX, l.x0); maxX = Math.max(maxX, l.x1); l.cells.forEach((c) => c.runs.forEach((r) => { fontCount.set(r.fam, (fontCount.get(r.fam) || 0) + r.text.length); const s = Math.round(r.size * 2) / 2; sizeCount.set(s, (sizeCount.get(s) || 0) + r.text.length); })); });
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  const mainFont = (top(fontCount) || ['Calibri'])[0], mainSize = (top(sizeCount) || [11])[0];
  const marginL = Math.max(36, Math.min(90, minX < 1e9 ? minX : 72)); const marginR = Math.max(36, Math.min(90, first.w - maxX));
  const contentW = first.w - marginL - marginR;
  for (const [k, a] of analyzed.entries()) {
    if (a.ocr != null) { // gescande pagina: alinea's uit de OCR-tekst (lege regel = nieuwe alinea)
      let buf = []; const flush = () => { if (buf.length) body.push(paraXml({ runs: [{ text: buf.join(' '), fam: mainFont, size: mainSize, bold: false, italic: false }], align: 'left', x0: marginL, heading: 0, gapBefore: 0 }, marginL)); buf = []; };
      ocrLines(a.ocr).forEach((l) => { if (!l) flush(); else buf.push(l.cells.join(' ')); }); flush();
      if (pageBreaks && k < analyzed.length - 1) body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      continue;
    }
    const items = findBlocks(a.lines).map((b) => ({ ...b, sortY: b.y }));
    if (images) for (const im of a.images) {
      const full = im.w > a.w * 0.9 && im.h > a.h * 0.9; if (full && a.lines.length > 3) continue; // achtergrond van een pagina met tekst
      const png = await imageToPng(im.obj); if (!png) continue;
      imgN++; media[`word/media/image${imgN}.png`] = png; const sc = Math.min(1, contentW / im.w); items.push({ type: 'image', sortY: im.y, rid: 'rIdImg' + imgN, id: imgN, w: im.w * sc, h: im.h * sc });
    }
    // tekstblokken opsplitsen waar een afbeelding tussen de regels staat
    const imgYs = items.filter((x) => x.type === 'image').map((x) => x.sortY);
    for (const b of items.filter((x) => x.type === 'text')) {
      const parts = [[]]; b.lines.forEach((l, q) => { const prev = b.lines[q - 1]; if (prev && imgYs.some((y) => y > prev.y && y < l.y - l.size * 0.5)) parts.push([]); parts.at(-1).push(l); });
      if (parts.length > 1) { b.lines = parts[0]; parts.slice(1).forEach((ls) => items.push({ type: 'text', lines: ls, sortY: ls[0].y - ls[0].size })); }
    }
    items.sort((p, q) => p.sortY - q.sortY);
    for (const b of items) {
      if (b.type === 'table') body.push(tableXml({ ...b, maxW: contentW }));
      else if (b.type === 'image') body.push(imageXml(b.rid, b.id, b.w, b.h));
      else paragraphs(b.lines, a.w).forEach((p) => body.push(paraXml(p, marginL)));
    }
    if (pageBreaks && k < analyzed.length - 1) body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  }
  const sect = `<w:sectPr><w:pgSz w:w="${tw(first.w)}" w:h="${tw(first.h)}"${first.w > first.h ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${tw(56)}" w:right="${tw(marginR)}" w:bottom="${tw(56)}" w:left="${tw(marginL)}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
  const doc = XMLH + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join('')}${sect}</w:body></w:document>`;
  const rels = XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${Object.keys(media).map((m, q) => `<Relationship Id="rIdImg${q + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.split('/').pop()}"/>`).join('')}</Relationships>`;
  const files = {
    '[Content_Types].xml': XMLH + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'word/document.xml': doc, 'word/styles.xml': DOCX_STYLES(mainFont, mainSize), 'word/_rels/document.xml.rels': rels, 'docProps/core.xml': CORE_XML('', APPNAME()), ...media
  };
  return { bytes: pack(files), stats: { images: imgN, tables: body.filter((b) => b.startsWith('<w:tbl>')).length, emptyPages: analyzed.filter((a) => !a.lines.length).length } };
}

/* ================= OCR-hulp voor gescande pagina's ================= */
const FX = { fontExtraProperties: true }; // echte lettertypenamen (vet, cursief, familie)
async function maybeOcr(ctx, f) {
  const pdf0 = await bytesToPdfJs(f.bytes, f.password || undefined, FX);
  if (!ctx.opts.ocr) return { pdf: pdf0, texts: [] };
  const scanned = [];
  for (let i = 1; i <= pdf0.numPages; i++) { const tc = await (await pdf0.getPage(i)).getTextContent(); if (tc.items.reduce((n, x) => n + (x.str || '').trim().length, 0) < 20) scanned.push(i - 1); }
  if (!scanned.length) return { pdf: pdf0, texts: [] };
  const { ocrDocument } = await import('./tools-ocr.js'); const doc = await loadPdf(f);
  const r = await ocrDocument(doc, pdf0, { langs: ['nld', 'eng'], pages: scanned, skipText: false, progress: ctx.progress });
  return { pdf: pdf0, ocr: r.done, texts: r.texts };
}
// OCR-tekst (met behouden spaties) naar regels met cellen
function ocrLines(text) {
  return text.split('\n').map((t) => t.replace(/\s+$/, '')).map((t) => t.trim() ? { text: t.trim(), cells: t.trim().split(/\s{3,}/) } : null);
}

const pdfToWord = {
  runLabel: 'Omzetten naar Word', lead: 'Zet de tekst, koppen, tabellen en afbeeldingen om naar een bewerkbaar Word-document (.docx). Ingewikkelde opmaak wordt benaderd.',
  options: (ctx) => [
    F.text(ctx, 'range', 'Pagina\'s', '', { placeholder: 'alle' }),
    F.check(ctx, 'images', 'Afbeeldingen meenemen', true),
    F.check(ctx, 'breaks', 'Elke PDF-pagina op een nieuwe pagina', true),
    F.check(ctx, 'ocr', 'Gescande pagina\'s eerst herkennen (OCR)', true)
  ],
  summary: (ctx) => ctx.files[0] ? plural(ctx.files[0].pages) : 'Nog geen bestand gekozen',
  validate: (ctx) => { try { parseRange(ctx.opts.range, ctx.files[0].pages); } catch (e) { return e.message; } },
  async run(ctx) {
    const f = ctx.files[0]; const { pdf, ocr, texts } = await maybeOcr(ctx, f);
    const pages = parseRange(ctx.opts.range, f.pages) || Array.from({ length: f.pages }, (_, i) => i);
    const { bytes, stats } = await pdfToDocx(pdf, { pages, images: ctx.opts.images, pageBreaks: ctx.opts.breaks, ocrTexts: texts, progress: ctx.progress });
    const notes = []; if (stats.tables) notes.push(`${stats.tables} tabel(len)`); if (stats.images) notes.push(`${stats.images} afbeelding(en)`); if (ocr) notes.push(`${ocr} gescande pagina('s) herkend met OCR`);
    if (stats.emptyPages && !ocr) notes.push(`${stats.emptyPages} pagina('s) zonder tekst (scan? zet OCR aan)`);
    return { title: `${plural(pages.length)} omgezet naar Word`, note: notes.join(' · '), outputs: [{ name: `${baseName(f.name)}.docx`, data: bytes }] };
  }
};

/* ================= PDF → Excel ================= */
const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function numberParser(allText) {
  const commaDec = (allText.match(/\d,\d{1,2}(?!\d)/g) || []).length, dotDec = (allText.match(/\d\.\d{1,2}(?!\d)/g) || []).length;
  const nl = commaDec >= dotDec;
  return (s) => {
    let t = s.trim().replace(/^€\s?|\s?€$|^\$\s?|\s?(EUR|USD)$/g, ''); const pct = /%$/.test(t); if (pct) t = t.slice(0, -1).trim();
    const neg = /^\(.*\)$/.test(t); if (neg) t = t.slice(1, -1);
    const re = nl ? /^[-+]?\d{1,3}([.   ]\d{3})*(,\d+)?$|^[-+]?\d+(,\d+)?$/ : /^[-+]?\d{1,3}([,   ]\d{3})*(\.\d+)?$|^[-+]?\d+(\.\d+)?$/;
    if (!re.test(t)) return null;
    const v = nl ? +t.replace(/[.   ]/g, '').replace(',', '.') : +t.replace(/[,   ]/g, '');
    if (!isFinite(v)) return null; return { v: (neg ? -v : v) / (pct ? 100 : 1), pct };
  };
}
function sheetXml(rows, widths) {
  const r = rows.map((cells, ri) => `<row r="${ri + 1}">${cells.map((c, ci) => { if (c == null || c.t === '') return ''; const ref = colName(ci) + (ri + 1); const s = c.bold ? (c.n != null ? (c.pct ? 4 : 3) : 1) : (c.n != null ? (c.pct ? 5 : 2) : 0);
    return c.n != null ? `<c r="${ref}" s="${s}"><v>${c.n}</v></c>` : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${X(c.t)}</t></is></c>`; }).join('')}</row>`).join('');
  return XMLH + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(8, w + 2))}" customWidth="1"/>`).join('') || '<col min="1" max="1" width="10"/>'}</cols><sheetData>${r}</sheetData></worksheet>`;
}
function xlsxPack(sheets) { // [{name, rows, widths}]
  const files = {
    '[Content_Types].xml': XMLH + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'xl/workbook.xml': XMLH + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${X(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': XMLH + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="10" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    'docProps/core.xml': CORE_XML('', APPNAME())
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.rows, s.widths); });
  return pack(files);
}
const pdfToExcel = {
  runLabel: 'Omzetten naar Excel', lead: 'Haalt tabellen en getallen uit de PDF en zet ze in een Excel-werkmap (.xlsx). Getallen worden echte getallen waarmee u kunt rekenen.',
  options: (ctx) => [
    F.text(ctx, 'range', 'Pagina\'s', '', { placeholder: 'alle' }),
    F.seg(ctx, 'mode', 'Werkbladen', [['page', 'Eén per pagina'], ['one', 'Alles op één blad']], 'page'),
    F.check(ctx, 'tablesOnly', 'Alleen tabellen (gewone tekst overslaan)', false),
    F.check(ctx, 'ocr', 'Gescande pagina\'s eerst herkennen (OCR)', true)
  ],
  summary: (ctx) => ctx.files[0] ? plural(ctx.files[0].pages) : 'Nog geen bestand gekozen',
  validate: (ctx) => { try { parseRange(ctx.opts.range, ctx.files[0].pages); } catch (e) { return e.message; } },
  async run(ctx) {
    const f = ctx.files[0]; const { pdf, ocr, texts } = await maybeOcr(ctx, f);
    const pages = parseRange(ctx.opts.range, f.pages) || Array.from({ length: f.pages }, (_, i) => i);
    const analyzed = []; for (const i of pages) { ctx.progress(L(`Pagina ${i + 1} analyseren…`, `Analysing page ${i + 1}…`)); analyzed.push({ i, a: texts[i] != null ? { lines: [], ocr: texts[i] } : await analyzePage(await pdf.getPage(i + 1)) }); }
    const parse = numberParser(analyzed.flatMap(({ a }) => a.lines.flatMap((l) => l.cells.map((c) => c.text)).concat(a.ocr ? [a.ocr] : [])).join(' '));
    const toCell = (cells) => { const t = cells.map((c) => c.text).join(' '); if (!t) return null; const n = parse(t); return { t, n: n ? n.v : null, pct: n && n.pct, bold: cells.every((c) => c.runs.every((r) => r.bold)) }; };
    const sheets = []; let cur = null; let tables = 0, numbers = 0;
    for (const { i, a } of analyzed) {
      if (!cur || ctx.opts.mode === 'page') { cur = { name: ctx.opts.mode === 'page' ? `${L('Pagina', 'Page')} ${i + 1}` : L('Gegevens', 'Data'), rows: [] }; sheets.push(cur); }
      else if (cur.rows.length) cur.rows.push([]);
      if (a.ocr != null) { ocrLines(a.ocr).forEach((l) => cur.rows.push(l ? l.cells.map((t) => toCell([{ text: t, runs: [{ bold: false }] }])) : [])); }
      for (const b of findBlocks(a.lines)) {
        if (b.type === 'table') { tables++; b.rows.forEach((row) => cur.rows.push(row.map(toCell))); cur.rows.push([]); }
        else if (!ctx.opts.tablesOnly) b.lines.forEach((l) => cur.rows.push(l.cells.map((c) => toCell([c]))));
      }
      while (cur.rows.length && !cur.rows.at(-1).length) cur.rows.pop();
    }
    sheets.forEach((s) => { s.widths = []; s.rows.forEach((r) => r.forEach((c, k) => { if (c) { if (c.n != null) numbers++; s.widths[k] = Math.max(s.widths[k] || 0, Math.min(60, c.t.length * 1.1)); } })); for (let k = 0; k < s.widths.length; k++) s.widths[k] = s.widths[k] || 8; });
    return { title: `${plural(pages.length)} omgezet naar Excel`, note: `${tables} tabel(len) herkend, ${numbers} getal(len) als getal ingevuld.` + (ocr ? ` ${ocr} gescande pagina('s) herkend met OCR.` : ''), outputs: [{ name: `${baseName(f.name)}.xlsx`, data: xlsxPack(sheets) }] };
  }
};

/* ================= PDF → PowerPoint ================= */
function pptxPack(slides, W, H) { // slides: [{jpg, w, h}]
  const ex = emu(W), ey = emu(H);
  const nsP = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const emptyTree = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>';
  const theme = XMLH + `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Studio"><a:themeElements><a:clrScheme name="Studio"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="004974"/></a:dk2><a:lt2><a:srgbClr val="E8F4F6"/></a:lt2><a:accent1><a:srgbClr val="1B93A5"/></a:accent1><a:accent2><a:srgbClr val="00C7E5"/></a:accent2><a:accent3><a:srgbClr val="86BCBF"/></a:accent3><a:accent4><a:srgbClr val="6499A2"/></a:accent4><a:accent5><a:srgbClr val="AFDCDF"/></a:accent5><a:accent6><a:srgbClr val="476A7E"/></a:accent6><a:hlink><a:srgbClr val="1B93A5"/></a:hlink><a:folHlink><a:srgbClr val="004974"/></a:folHlink></a:clrScheme><a:fontScheme name="Studio"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Studio"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  const files = {
    '[Content_Types].xml': XMLH + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'ppt/presentation.xml': XMLH + `<p:presentation ${nsP} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdM"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdS${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${ex}" cy="${ey}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdM" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>${slides.map((_, i) => `<Relationship Id="rIdS${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`,
    'ppt/slideMasters/slideMaster1.xml': XMLH + `<p:sldMaster ${nsP}>${emptyTree}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdL"/></p:sldLayoutIdLst></p:sldMaster>`,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
    'ppt/slideLayouts/slideLayout1.xml': XMLH + `<p:sldLayout ${nsP} type="blank" preserve="1">${emptyTree.replace('<p:cSld>', '<p:cSld name="Leeg">')}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
    'ppt/theme/theme1.xml': theme, 'docProps/core.xml': CORE_XML('', APPNAME())
  };
  slides.forEach((s, i) => {
    const k = Math.min(W / s.w, H / s.h); const w = s.w * k, h = s.h * k; const x = (W - w) / 2, y = (H - h) / 2;
    files[`ppt/media/image${i + 1}.jpeg`] = s.jpg;
    files[`ppt/slides/slide${i + 1}.xml`] = XMLH + `<p:sld ${nsP}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="${X(L('Pagina', 'Page'))} ${i + 1}" descr="${X((s.text || '').slice(0, 1000))}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdI"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = XMLH + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdI" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.jpeg"/></Relationships>`;
  });
  return pack(files);
}
const pdfToPpt = {
  runLabel: 'Omzetten naar PowerPoint', lead: 'Elke pagina wordt een dia in een PowerPoint-presentatie (.pptx), scherp en met dezelfde opmaak. Ideaal om tekeningen of rapporten te presenteren.',
  options: (ctx) => [
    F.text(ctx, 'range', 'Pagina\'s', '', { placeholder: 'alle' }),
    F.seg(ctx, 'format', 'Diaformaat', [['wide', 'Breedbeeld 16:9'], ['std', 'Standaard 4:3'], ['page', 'Zoals de pagina']], 'wide'),
    F.seg(ctx, 'q', 'Beeldkwaliteit', [[1.5, 'Normaal'], [2.5, 'Hoog']], 1.5)
  ],
  summary: (ctx) => ctx.files[0] ? plural(ctx.files[0].pages) : 'Nog geen bestand gekozen',
  validate: (ctx) => { try { parseRange(ctx.opts.range, ctx.files[0].pages); } catch (e) { return e.message; } },
  async run(ctx) {
    const f = ctx.files[0]; const pdf = await openPdfJs(f); const pages = parseRange(ctx.opts.range, f.pages) || Array.from({ length: f.pages }, (_, i) => i);
    const slides = []; let W, H;
    for (const i of pages) {
      ctx.progress(L(`Dia ${slides.length + 1} van ${pages.length}…`, `Slide ${slides.length + 1} of ${pages.length}…`));
      const p = await pdf.getPage(i + 1); const vp1 = p.getViewport({ scale: 1 }); const vp = p.getViewport({ scale: (+ctx.opts.q || 1.5) * 96 / 72 * Math.min(1, 1600 / Math.max(vp1.width, vp1.height) * 72 / 96 * 1.4) });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: g, viewport: vp }).promise;
      const jpg = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88))).arrayBuffer()); c.width = c.height = 0;
      const tc = await p.getTextContent(); slides.push({ jpg, w: vp1.width, h: vp1.height, text: tc.items.map((x) => x.str).join(' ').replace(/\s+/g, ' ') });
      if (!W) { if (ctx.opts.format === 'std') { W = 720; H = 540; } else if (ctx.opts.format === 'page') { const k = 720 / Math.max(vp1.width, vp1.height); W = vp1.width * k; H = vp1.height * k; } else { W = 960; H = 540; } }
    }
    return { title: `${slides.length} dia('s) gemaakt`, outputs: [{ name: `${baseName(f.name)}.pptx`, data: pptxPack(slides, W, H) }] };
  }
};

export const OFFICE = { 'pdf-to-word': pdfToWord, 'pdf-to-excel': pdfToExcel, 'pdf-to-ppt': pdfToPpt };
