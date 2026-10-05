// A pull-down projector screen that rolls over the classroom chalkboard and
// shows a video or image from content.js (MEDIA). It is a real object in the
// scene: a roller on the wall, black-bordered cloth and a pull bar, with the
// picture painted into a 384 x 216 canvas texture (so it goes through the same
// pixel-art renderer as the rest of the room).
//
//   const screen = new ProjectorScreen(room.group, { sfx });
//   screen.show(MEDIA.mudkips);   // roll down + play
//   screen.hide();                // roll up + pause
//   screen.update(dt);            // every frame
//   screen.def / screen.on        // what is showing
import * as THREE from 'three';
import { BOARD } from '../src/entities/classroomScene.js';
import { pixelText } from '../src/ui/Chalkboard.js';

const TW = 384, TH = 216;
const PAD = 14; // clear strip under the roller: the picture starts below it

export class ProjectorScreen {
  constructor(parent, { sfx } = {}) {
    this.sfx = sfx || (() => {});
    this.def = null;
    this.on = false;
    this.k = 0; // 0 = rolled up, 1 = fully down
    this.src = null; // { el, w, h, video }
    this._media = new Map();
    this._drawT = 0;
    this._noise = 0;

    this.cv = document.createElement('canvas');
    this.cv.width = TW; this.cv.height = TH;
    this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;

    const W = BOARD.w, H = BOARD.h;
    const top = BOARD.cy + H / 2 + 0.05;
    this.W = W; this.H = H;
    this.group = new THREE.Group();
    this.group.name = 'projectorScreen';
    this.group.position.set(BOARD.cx, top, BOARD.z + 0.12);
    this.group.visible = false;
    parent.add(this.group);

    const hang = (geo) => { geo.translate(0, -geo.parameters.height / 2, 0); return geo; }; // top edge at y = 0
    this.sheet = new THREE.Group();
    const border = new THREE.Mesh(hang(new THREE.PlaneGeometry(W + 0.1, H + 0.1)), new THREE.MeshBasicMaterial({ color: 0x0b0a10 }));
    border.position.y = 0.02;
    const cloth = new THREE.Mesh(hang(new THREE.PlaneGeometry(W, H)), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    cloth.position.set(0, -0.03, 0.004);
    this.sheet.add(border, cloth);
    this.group.add(this.sheet);

    const metal = new THREE.MeshLambertMaterial({ color: 0x2c2c36 });
    const cap = new THREE.MeshLambertMaterial({ color: 0xc4c4d0 });
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, W + 0.22, 10), metal);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, 0.0, 0.01);
    this.group.add(roller);
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.16), cap);
      c.position.set(sx * (W / 2 + 0.12), 0, 0.01);
      this.group.add(c);
    }
    this.bar = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, 0.05, 0.06), metal);
    this.bar.position.z = 0.02;
    this.group.add(this.bar);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 5, 8), cap);
    ring.position.set(0, -0.06, 0.02);
    this.bar.add(ring);
    this._layout();
    this._placeholder();
  }

  // ------------------------------------------------------------------ control
  show(def) {
    if (!def) return;
    const same = this.def === def;
    this.def = def;
    if (!this.on) { this.on = true; this.sfx('class_whoosh', { volume: 0.35 }); }
    if (!same || !this.src) this._load(def);
    else this._resume();
  }

  hide() {
    if (!this.on) return;
    this.on = false;
    this.sfx('class_whoosh', { volume: 0.3, pitch: 1.25 });
    this._pause();
  }

  dispose() {
    this._pause();
    for (const m of this._media.values()) { if (m.video) { m.el.removeAttribute('src'); m.el.load(); } }
    this._media.clear();
    this.tex.dispose();
    this.group.removeFromParent();
  }

  // ------------------------------------------------------------------ media
  _load(def) {
    this._pause();
    this.src = null;
    this._placeholder();
    let m = this._media.get(def);
    if (!m) {
      if (def.type === 'video') {
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
        v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
        for (const [src, type] of def.sources) { const s = document.createElement('source'); s.src = src; s.type = type; v.appendChild(s); }
        m = { el: v, video: true, ready: false, w: 0, h: 0 };
        const ok = () => { m.ready = true; m.w = v.videoWidth || 16; m.h = v.videoHeight || 9; };
        v.addEventListener('loadeddata', ok);
        if (v.readyState >= 2) ok();
      } else {
        const img = new Image();
        m = { el: img, video: false, ready: false, w: 0, h: 0 };
        img.onload = () => { m.ready = true; m.w = img.naturalWidth; m.h = img.naturalHeight; m.bg = null; if (this.def === def && this.on) this._attach(m); };
        img.src = def.src;
      }
      this._media.set(def, m);
    }
    this._cur = m;
    if (m.ready) this._attach(m);
  }

  _attach(m) {
    this.src = m;
    this._drawT = 0;
    if (m.video) { m.el.currentTime = 0; const p = m.el.play(); if (p?.catch) p.catch(() => {}); }
    this._draw();
  }

  _pause() { const m = this._cur; if (m?.video) { try { m.el.pause(); } catch { /* ignore */ } } }
  _resume() { const m = this._cur; if (m?.video) { const p = m.el.play(); if (p?.catch) p.catch(() => {}); } }

  // ------------------------------------------------------------------ painting
  _layout() { /* sheet height is animated in update() */ }

  _placeholder() {
    const c = this.ctx;
    c.fillStyle = '#16111d'; c.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 420; i++) { const v = (Math.random() * 90) | 0; c.fillStyle = `rgb(${v},${v},${v + 12})`; c.fillRect((Math.random() * TW) | 0, (Math.random() * TH) | 0, 2, 2); }
    pixelText(c, 'TUNING IN...', TW / 2, TH / 2 - 4, '#f7e07a', { font: 'big', scale: 2, align: 'center' });
    this.tex.needsUpdate = true;
  }

  _draw() {
    const m = this.src, def = this.def;
    if (!m || !def) return;
    const c = this.ctx;
    let bg = def.bg || '#16111d';
    if (bg === 'auto') {
      if (!m.bg) {
        try {
          const t = document.createElement('canvas'); t.width = t.height = 2;
          const tc = t.getContext('2d'); tc.drawImage(m.el, 0, 0, 2, 2);
          const d = tc.getImageData(0, 0, 1, 1).data;
          m.bg = `rgb(${d[0]},${d[1]},${d[2]})`;
        } catch { m.bg = '#16111d'; }
      }
      bg = m.bg;
    }
    c.fillStyle = bg; c.fillRect(0, 0, TW, TH);
    const AH = TH - PAD; // picture area: below the roller
    const ar = m.w / m.h, tar = TW / AH;
    let dw, dh;
    if (Math.abs(ar - tar) < 0.25) { // close to the screen shape: cover (crop a sliver)
      if (ar > tar) { dh = AH; dw = AH * ar; } else { dw = TW; dh = TW / ar; }
    } else if (ar > tar) { dw = TW; dh = TW / ar; } else { dh = AH; dw = AH * ar; }
    c.save();
    c.beginPath(); c.rect(0, PAD, TW, AH); c.clip();
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    try { c.drawImage(m.el, (TW - dw) / 2, PAD + (AH - dh) / 2, dw, dh); } catch { /* frame not ready */ }
    c.restore();
    // caption plate
    if (def.caption) {
      c.fillStyle = 'rgba(20,12,28,0.82)'; c.fillRect(0, TH - 17, TW, 17);
      c.fillStyle = '#f7e07a'; c.fillRect(0, TH - 18, TW, 1);
      pixelText(c, def.caption, 8, TH - 13, '#ffe27a', { font: 'big' });
      if (def.sub) pixelText(c, def.sub, TW - 8, TH - 12, '#f6a8c4', { font: 'small', align: 'right' });
    }
    this.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const goal = this.on ? 1 : 0;
    if (this.k !== goal) {
      this.k += (goal - this.k) * Math.min(1, dt * 5.5);
      if (Math.abs(goal - this.k) < 0.003) this.k = goal;
      const k = this.k;
      this.sheet.scale.y = Math.max(0.0001, k);
      this.bar.position.y = -(this.H + 0.06) * k - 0.02;
      this.group.visible = k > 0.002;
      this.bar.visible = k > 0.02;
    }
    if (!this.on || this.k < 0.05) return;
    const m = this.src;
    if (m?.video && !m.el.paused && m.el.readyState >= 2) {
      this._drawT -= dt;
      if (this._drawT <= 0) { this._drawT = 1 / 30; this._draw(); }
    } else if (!m && this._cur?.ready) {
      this._attach(this._cur);
    } else if (!m) {
      this._noise -= dt;
      if (this._noise <= 0) { this._noise = 0.12; this._placeholder(); }
    }
  }
}
