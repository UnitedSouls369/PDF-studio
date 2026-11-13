// Paginaraster: miniaturen tonen, selecteren of ordenen
import { el, icon, openPdfJs, renderPage, parseRange, rangeString } from './core.js';

export class PageGrid {
  // mode: 'select' | 'organize'
  constructor(ctx, mode, { selStyle = 'sel', initialAll = false } = {}) {
    this.ctx = ctx; this.mode = mode; this.selStyle = selStyle; this.initialAll = initialAll;
    this.items = []; this.selected = new Set(); this.cache = new Map(); this.lastClick = null;
    this.el = el('div', { class: 'gridwrap', style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
    this.io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { this.io.unobserve(e.target); this.paint(e.target); } }), { rootMargin: '300px' });
  }
  sync() { // na wijziging van ctx.files
    const files = this.mode === 'organize' ? this.ctx.files : this.ctx.files.slice(0, 1);
    if (this.mode === 'select') {
      const f = files[0];
      const key = f ? f.id : null;
      if (key !== this._key) { this._key = key; this.items = f ? Array.from({ length: f.pages }, (_, p) => ({ f, p, rot: 0 })) : []; this.selected = new Set(this.initialAll ? this.items.map((_, i) => i) : []); }
    } else {
      const ids = new Set(files.map((f) => f.id));
      this.items = this.items.filter((it) => it.blank || ids.has(it.f.id));
      for (const f of files) if (!this.items.some((it) => it.f && it.f.id === f.id)) for (let p = 0; p < f.pages; p++) this.items.push({ f, p, rot: 0 });
    }
    this.render();
  }
  count() { return this.items.length; }
  selection() { return [...this.selected].sort((a, b) => a - b); }
  setSelection(idx) { this.selected = new Set(idx); this.render(); }
  render() {
    this.el.innerHTML = '';
    if (!this.items.length) return;
    const bar = el('div', { class: 'gridbar' });
    if (this.mode === 'select') {
      const rin = el('input', { type: 'text', id: 'sel-range', placeholder: 'bv. 1-3, 5', value: rangeString(this.selection()), style: { height: '34px', width: '160px', padding: '0 10px', border: '1px solid #BFBFBF', borderRadius: '6px' } });
      const apply = () => { try { const r = parseRange(rin.value, this.items.length) || []; this.setSelection(r); this.ctx.changed && this.ctx.changed('selection'); } catch (e) { rin.setCustomValidity(e.message); rin.reportValidity(); } };
      rin.addEventListener('change', apply); rin.addEventListener('input', () => rin.setCustomValidity(''));
      bar.append(
        el('button', { class: 'btn sm', type: 'button', onclick: () => { this.setSelection(this.items.map((_, i) => i)); this.ctx.changed('selection'); } }, 'Alles'),
        el('button', { class: 'btn sm', type: 'button', onclick: () => { this.setSelection([]); this.ctx.changed('selection'); } }, 'Geen'),
        el('button', { class: 'btn sm', type: 'button', onclick: () => { this.setSelection(this.items.map((_, i) => i).filter((i) => !this.selected.has(i))); this.ctx.changed('selection'); } }, 'Omkeren'),
        el('label', { for: 'sel-range', class: 'flabel', style: { marginLeft: '8px' } }, 'Pagina\'s'), rin,
        el('span', { class: 'cnt' }, `${this.selected.size} van ${this.items.length} geselecteerd`));
    } else {
      bar.append(
        el('button', { class: 'btn sm', type: 'button', onclick: () => { this.items.forEach((it) => it.rot = (it.rot + 90) % 360); this.render(); } }, icon('rotate', 16), 'Alles roteren'),
        el('button', { class: 'btn sm', type: 'button', onclick: () => { this.items.reverse(); this.render(); } }, 'Volgorde omkeren'),
        el('button', { class: 'btn sm', type: 'button', onclick: () => { this.items.push({ blank: true, rot: 0 }); this.render(); } }, icon('plus', 16), 'Lege pagina'),
        el('span', { class: 'cnt' }, `${this.items.length} pagina's · sleep of gebruik de pijlen om te ordenen`));
    }
    const g = el('div', { class: 'pgrid' });
    this.items.forEach((it, i) => g.append(this.thumb(it, i)));
    this.el.append(bar, g);
  }
  thumb(it, i) {
    const sel = this.selected.has(i);
    const cls = 'pg' + (sel ? (this.selStyle === 'del' ? ' sel mark-del' : ' sel') : '');
    const cv = el('div', { class: 'cv' });
    const label = it.blank ? 'Lege pagina' : (this.mode === 'organize' && this.ctx.files.length > 1 ? `${this.ctx.files.indexOf(it.f) + 1}·${it.p + 1}` : `Pagina ${it.p + 1}`);
    const node = el('div', { class: cls, 'data-i': i }, cv, el('span', { class: 'lb' }, label));
    node._item = it;
    if (this.mode === 'select') {
      node.prepend(el('span', { class: 'ck', 'aria-hidden': 'true' }, sel ? icon('check', 14, '#fff', 3) : null));
      node.append(el('button', { class: 'selbtn', type: 'button', 'aria-pressed': String(sel), 'aria-label': `Pagina ${it.p + 1} ${sel ? 'deselecteren' : 'selecteren'}`,
        onclick: (e) => this.toggle(i, e.shiftKey) }));
    } else {
      node.setAttribute('draggable', 'true'); node.tabIndex = 0; node.setAttribute('aria-label', label + ' — Alt + pijltjes om te verplaatsen');
      node.append(el('div', { class: 'acts' },
        el('button', { type: 'button', class: 'mv', 'aria-label': 'Naar voren', onclick: () => this.move(i, i - 1) }, icon('back', 16)),
        el('button', { type: 'button', 'aria-label': 'Linksom draaien', onclick: () => { it.rot = (it.rot + 270) % 360; this.render(); } }, icon('rotl', 16)),
        el('button', { type: 'button', 'aria-label': 'Rechtsom draaien', onclick: () => { it.rot = (it.rot + 90) % 360; this.render(); } }, icon('rotate', 16)),
        el('button', { type: 'button', 'aria-label': 'Pagina verwijderen', onclick: () => { this.items.splice(i, 1); this.render(); } }, icon('trash', 16)),
        el('button', { type: 'button', class: 'mv', 'aria-label': 'Naar achteren', onclick: () => this.move(i, i + 1) }, el('span', { style: { display: 'flex', transform: 'scaleX(-1)' } }, icon('back', 16)))));
      node.addEventListener('keydown', (e) => {
        if (!e.altKey) return;
        const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
        if (!d) return; e.preventDefault(); this.move(i, i + d); const n = this.el.querySelector(`.pg[data-i="${i + d}"]`); n && n.focus();
      });
      node.addEventListener('dragstart', (e) => { this.dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
      node.addEventListener('dragover', (e) => { e.preventDefault(); node.classList.add('dragover'); });
      node.addEventListener('dragleave', () => node.classList.remove('dragover'));
      node.addEventListener('drop', (e) => { e.preventDefault(); node.classList.remove('dragover'); if (this.dragFrom != null) this.move(this.dragFrom, i); this.dragFrom = null; });
    }
    this.io.observe(node);
    return node;
  }
  move(from, to) {
    if (to < 0 || to >= this.items.length || from === to) return;
    const [x] = this.items.splice(from, 1); this.items.splice(to, 0, x); this.render();
  }
  toggle(i, shift) {
    if (shift && this.lastClick != null) {
      const [a, b] = [Math.min(this.lastClick, i), Math.max(this.lastClick, i)];
      for (let k = a; k <= b; k++) this.selected.add(k);
    } else if (this.selected.has(i)) this.selected.delete(i); else this.selected.add(i);
    this.lastClick = i; this.render(); this.ctx.changed && this.ctx.changed('selection');
  }
  async paint(node) {
    const it = node._item; const cv = node.querySelector('.cv'); if (!cv) return;
    if (it.blank) { cv.append(el('div', { style: { width: '106px', height: '150px', background: '#fff', boxShadow: '0 1px 4px rgba(0,73,116,.2)' } })); return; }
    const key = it.f.id + ':' + it.p;
    try {
      let src = this.cache.get(key);
      if (!src) { const pdf = await openPdfJs(it.f); src = await renderPage(pdf, it.p + 1, { width: 220 }); this.cache.set(key, src); }
      const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
      c.style.transform = `rotate(${it.rot}deg)`; if (it.rot % 180) { c.style.maxWidth = '150px'; c.style.maxHeight = '110px'; }
      cv.innerHTML = ''; cv.append(c);
    } catch (e) { cv.textContent = '—'; }
  }
}
