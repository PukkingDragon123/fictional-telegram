// [v26 staff] Little pop-up bubbles over the world (DOM, positioned every frame):
// the clipboard over an Interview Tent with job seekers waiting, and a red cross
// with the rescue price over every hurt beaver. Tap = open the card.
import '../../ui/staff.css';
import { spriteImg, hasSprite } from '../../ui/sprites.js';

const HIDE = ['cine', 'lt-pc', 'home-mode', 'pc-mode', 'lab-full', 'title-mode'];

export class Popups {
  constructor(sys) {
    this.sys = sys;
    this.items = new Map(); // key -> { el, used }
    this.root = null;
  }
  ensureRoot() {
    if (this.root?.isConnected) return this.root;
    const host = this.sys.game.ui?.overlay || document.getElementById('overlay') || document.body;
    this.root = document.createElement('div');
    this.root.className = 'st-pops';
    host.appendChild(this.root);
    return this.root;
  }
  item(key, make) {
    let it = this.items.get(key);
    if (!it) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'st-pop';
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => { e.stopPropagation(); it.onClick?.(); });
      this.ensureRoot().appendChild(el);
      it = { el, used: true, html: '' };
      this.items.set(key, it);
      make?.(it);
    }
    it.used = true;
    return it;
  }
  place(it, x, y, z, html, cls) {
    if (it.html !== html) { it.el.innerHTML = html; it.html = html; }
    if (it.cls !== cls) { it.el.className = `st-pop ${cls}`; it.cls = cls; }
    const ui = this.sys.game.ui;
    const q = ui?.screenOf ? ui.screenOf(x, y, z) : null;
    if (!q || q.x < -40 || q.y < -40 || q.x > innerWidth + 40 || q.y > innerHeight + 40) { it.el.style.display = 'none'; return; }
    it.el.style.display = '';
    it.el.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px) translate(-50%, -100%)`;
  }
  update() {
    const sys = this.sys, game = sys.game;
    if (!game.ui) return;
    const cl = document.body.classList;
    const hidden = HIDE.some((c) => cl.contains(c)) || game.titleMode || !game.started;
    for (const it of this.items.values()) it.used = false;
    if (!hidden) {
      const ico = (n, s = 2) => (hasSprite(n) ? spriteImg(n, s) : '');
      // job seekers waiting at the tent
      const feast = cl.contains('feast-cam');
      const t = sys.tents()[0];
      const n = t ? sys.cands.waiting().length : 0;
      if (t && n && !feast) {
        const it = this.item('tent', (i) => { i.onClick = () => sys.ui?.openInterview?.(sys.tents()[0]); });
        const d = sys.door(t);
        const bob = Math.sin(sys.time * 3) * 0.04;
        this.place(it, d.x, sys.groundAt(d.x, d.z).gy + 1.35 + bob, d.z - 0.4, `${ico('st_clip', 2)}<b>${n}</b>`, 'tent');
      }
      // hurt beavers
      for (const r of sys.list) {
        const H = r.hurt, b = r.agent;
        if (!H || !b || (H.state !== 'down' && H.state !== 'limp') || !b.rig.root.visible) continue;
        const it = this.item('hurt' + r.id, (i) => { i.onClick = () => sys.ui?.openRescue?.(i.rec); });
        it.rec = r;
        const cost = H.cost || sys.rescueCost(r);
        this.place(it, b.x, (b.y || 0) + 0.85, b.z, `${ico('st_hurt', 2)}<i>${ico('coin', 1)}${cost}</i>`, 'hurt');
      }
    }
    for (const [k, it] of this.items) if (!it.used) { it.el.remove(); this.items.delete(k); }
  }
}
