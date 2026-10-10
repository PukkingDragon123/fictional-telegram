// [v26 evening] Reynard's wardrobe: the inside of the walnut wardrobe (a brass rail of hangers,
// one per outfit; locked ones are dark silhouettes with the trophy that earns them) and a
// gilded oval mirror. The mirror's glass is a hole: the live 3D room shows through it, with
// Reynard framed inside wearing the hanger you picked (drag the mirror to turn him round).
//
//   const wd = openWardrobe(root, { items: [{ id, name, swatch, locked, earn, isNew }], current,
//     sfx, onPick(id), onWear(id), onClose(), onTurn(dx) });
//   wd.mirrorRect() -> CSS px rect of the glass;  wd.setCurrent(id);  wd.close()
import './homepc.css';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// a little coat on a hanger, in the outfit's colours (or a dark silhouette when locked)
function garment(sw, locked) {
  const c = document.createElement('canvas');
  c.width = 22; c.height = 26;
  const g = c.getContext('2d');
  const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const [main, trim, hat] = locked ? ['#2a1c16', '#3a2a20', '#2a1c16'] : sw;
  // hanger hook + bar
  px(10, 0, 2, 1, '#c8a040'); px(12, 1, 1, 2, '#c8a040'); px(10, 3, 2, 1, '#c8a040');
  px(4, 5, 14, 1, locked ? '#4a3626' : '#8a5a30'); px(6, 4, 10, 1, locked ? '#4a3626' : '#a8743e');
  // shoulders, body, sleeves
  px(4, 6, 14, 2, main); px(5, 8, 12, 13, main); px(2, 7, 3, 9, main); px(17, 7, 3, 9, main);
  px(2, 15, 3, 2, trim); px(17, 15, 3, 2, trim);
  // collar V + buttons / trim
  px(9, 6, 4, 1, trim); px(10, 7, 2, 4, locked ? main : '#f6eedc');
  px(10, 12, 2, 1, trim); px(10, 15, 2, 1, trim); px(10, 18, 2, 1, trim);
  px(5, 20, 12, 1, trim);
  // its hat, hooked on the hanger
  px(13, 1, 6, 2, hat); px(14, 0, 4, 1, hat);
  if (locked) { px(9, 11, 4, 4, '#c8a040'); px(10, 9, 2, 2, '#c8a040'); px(10, 12, 2, 1, '#2a1c16'); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(16, 9, 1, 11);
  return c;
}

class Wardrobe {
  constructor(root, o) {
    this.o = o;
    this.items = o.items || [];
    this.sel = o.current || 'default';
    this.worn = o.current || 'default';
    const el = document.createElement('div');
    el.className = 'wd';
    el.innerHTML = `
      <div class="wd-closet">
        <div class="wd-head"><b>WARDROBE</b><span class="wd-count"></span><button class="wd-x" data-a="close" aria-label="Close">✕</button></div>
        <div class="wd-rail"><i class="wd-bar"></i><div class="wd-hangers"></div></div>
        <div class="wd-info"></div>
        <div class="wd-btns"><button class="wd-btn" data-a="wear"></button></div>
      </div>
      <div class="wd-mirror" data-a="mirror"><i class="wd-glint"></i><span class="wd-hint">◀ drag to turn ▶</span></div>`;
    root.appendChild(el);
    this.el = el;
    this.$hang = el.querySelector('.wd-hangers');
    this.$info = el.querySelector('.wd-info');
    this.$btn = el.querySelector('.wd-btn');
    this.$mirror = el.querySelector('.wd-mirror');
    el.querySelector('.wd-count').textContent = `${this.items.filter((i) => !i.locked).length} / ${this.items.length}`;
    for (const it of this.items) {
      const b = document.createElement('button');
      b.className = `wd-hanger${it.locked ? ' locked' : ''}${it.isNew ? ' new' : ''}`;
      b.dataset.id = it.id;
      b.title = it.locked ? `Earn: ${it.earn}` : it.name;
      b.appendChild(garment(it.swatch, it.locked));
      const n = document.createElement('em');
      n.textContent = it.locked ? '???' : it.name;
      b.appendChild(n);
      this.$hang.appendChild(b);
    }
    el.addEventListener('click', (e) => this._click(e));
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target.closest('[data-a="mirror"]')) { this.drag = { x: e.clientX }; this.$mirror.setPointerCapture?.(e.pointerId); }
    });
    el.addEventListener('pointermove', (e) => { if (this.drag) { this.o.onTurn?.((e.clientX - this.drag.x) * 0.012); this.drag.x = e.clientX; } });
    el.addEventListener('pointerup', () => { this.drag = null; });
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this._onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.o.onClose?.(); } };
    addEventListener('keydown', this._onKey, true);
    this._layout();
    this._onResize = () => this._layout();
    addEventListener('resize', this._onResize);
    this.render();
  }

  _layout() {
    const vw = innerWidth, vh = innerHeight, wide = vw >= 720 && vw / vh >= 1.05;
    this.el.classList.toggle('wd-narrow', !wide);
    const m = this.$mirror.style;
    if (wide) {
      const w = Math.min(320, vw * 0.3), h = Math.min(vh - 80, w * 1.45);
      Object.assign(m, { left: `${Math.round(vw * 0.66 - w / 2)}px`, top: `${Math.round((vh - h) / 2)}px`, width: `${Math.round(w)}px`, height: `${Math.round(h)}px` });
    } else {
      const h = Math.min(vh * 0.42, 340), w = Math.min(vw - 60, h * 0.72);
      Object.assign(m, { left: `${Math.round((vw - w) / 2)}px`, top: '14px', width: `${Math.round(w)}px`, height: `${Math.round(h)}px` });
    }
  }

  mirrorRect() { const r = this.$mirror.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }

  setCurrent(id) { this.worn = id; this.render(); }

  render() {
    for (const b of this.$hang.children) {
      b.classList.toggle('on', b.dataset.id === this.sel);
      b.classList.toggle('worn', b.dataset.id === this.worn);
    }
    const it = this.items.find((i) => i.id === this.sel);
    if (!it) return;
    this.$info.innerHTML = it.locked
      ? `<b>???</b><span>Earn the trophy <u>${esc(it.earn)}</u>${it.earnDesc ? `: ${esc(it.earnDesc)}` : ''}</span>`
      : `<b>${esc(it.name)}</b><span>${it.id === this.worn ? 'Wearing it. Naturally.' : 'Looking sharp.'}</span>`;
    this.$btn.textContent = it.locked ? 'Locked' : it.id === this.worn ? 'Wearing' : 'Wear this';
    this.$btn.disabled = it.locked || it.id === this.worn;
  }

  _click(e) {
    const t = e.target.closest('[data-a], .wd-hanger');
    if (!t) return;
    e.stopPropagation();
    if (t.classList.contains('wd-hanger')) {
      const id = t.dataset.id, it = this.items.find((i) => i.id === id);
      this.sel = id;
      t.classList.remove('new');
      this.o.sfx?.(it?.locked ? 'error' : 'whoosh', { volume: it?.locked ? 0.25 : 0.3 });
      if (!it?.locked) this.o.onPick?.(id);
      this.render();
    } else if (t.dataset.a === 'wear') {
      if (this.$btn.disabled) return;
      this.o.onWear?.(this.sel);
      this.worn = this.sel;
      this.render();
    } else if (t.dataset.a === 'close') this.o.onClose?.();
  }

  close() {
    removeEventListener('keydown', this._onKey, true);
    removeEventListener('resize', this._onResize);
    this.el.classList.add('wd-out');
    setTimeout(() => this.el.remove(), 260);
  }
}

export function openWardrobe(root, opts = {}) { return new Wardrobe(root || document.body, opts); }
