// [v32 cine] Floating 3D words in the world: chunky voxel letters extruded from a pixel font
// (Alagard by Hewett Tsoi, src/ui/kinetic/alagard.js, or the game's own TBME Goofy title glyphs),
// built with the game's VoxelModel so they get its lighting, ambient occlusion, shadows and ink
// outline. Each letter drops in on its own with a bounce, bobs and sways, and the whole word turns
// to face the camera. Used by cutscenes (Director.words3d / c.words3d): the camera can push right
// into them.
//
//   const w = new Words3D(game, 'FEAST!', { at: { x, y, z } | () => ({ x, y, z }), size, pal, font, ms, hold })
//   w.update(dt) -> false once it has flown away;  w.dismiss();  w.dispose()
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../../core/voxel.js';
import { ALAGARD_SRC } from '../../ui/kinetic/alagard.js';
import { GOOFY_HI } from '../../ui/goofyFont.js';

// palettes: face rows from the top down (lit -> warm -> deep), then the extruded side
export const WORD_PALS = {
  gold: { face: [0xfff6c8, 0xffe07a, 0xffc040, 0xf09a2a], side: 0xb8641e, back: 0x7a3c14 },
  red: { face: [0xffd6c8, 0xff8a6a, 0xf04a3a, 0xc02a2a], side: 0x8a1c1c, back: 0x5a1010 },
  green: { face: [0xe8ffd8, 0x9df07a, 0x5ac84a, 0x38943a], side: 0x26662a, back: 0x14401a },
  blue: { face: [0xe0f6ff, 0x9ee0ff, 0x5ab4f0, 0x3a7ac8], side: 0x284e90, back: 0x18305a },
  amber: { face: [0xfff0c0, 0xffc860, 0xe89028, 0xb85e18], side: 0x7a3a12, back: 0x4a220a },
  white: { face: [0xffffff, 0xf2eee4, 0xdcd4c4, 0xbab0a0], side: 0x8a8070, back: 0x5a5248 },
  pink: { face: [0xffe8f2, 0xffaad0, 0xff6aa8, 0xd04a86], side: 0x96305e, back: 0x5e1c3a },
};

// a glyph as rows of '#' (top first) with its row offset from the cap line and its advance
function glyph(font, ch) {
  if (font === 'goofy') {
    const g = GOOFY_HI.g[ch] || GOOFY_HI.g[ch.toUpperCase()];
    if (!g) return null;
    return { rows: g, top: -1, adv: Math.max(...g.map((r) => r.length)) };
  }
  const src = ALAGARD_SRC[ch];
  if (!src) return null;
  const i = src.indexOf(':');
  const rows = src.slice(i + 1).split('|');
  return { rows, top: +src.slice(0, i), adv: Math.max(...rows.map((r) => r.length)) + 1 };
}

const CAP = { alagard: 11, goofy: 14 };
const SPACE = { alagard: 5, goofy: 6 };
const DEPTH = 3; // extrusion, voxels

function letterModel(font, ch, pal) {
  const g = glyph(font, ch);
  if (!g) return null;
  const m = new VoxelModel();
  const cap = CAP[font];
  const n = g.rows.length;
  for (let r = 0; r < n; r++) {
    const row = g.rows[r];
    // y: the cap line sits at `cap`, rows run downward (descenders go below 0)
    const y = cap - 1 - (g.top + r);
    const k = Math.max(0, Math.min(3, Math.floor(((g.top + r) / cap) * 4)));
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      const lit = r > 0 && g.rows[r - 1][x] !== '#'; // a lit top edge on every stroke
      m.set(x, y, DEPTH - 1, lit ? pal.face[0] : pal.face[Math.max(1, k)]);
      for (let z = 0; z < DEPTH - 1; z++) m.set(x, y, z, z === 0 ? pal.back : pal.side);
    }
  }
  return { m, adv: g.adv };
}

const easeOutBack = (t) => { t = Math.min(1, Math.max(0, t)) - 1; return 1 + t * t * (2.70158 * t + 1.70158); };

export class Words3D {
  constructor(game, text, { at, size = 0.07, pal = 'gold', font = 'alagard', ms = 2600, hold = false, stagger = 0.06, spin = true } = {}) {
    this.game = game;
    this.at = at;
    this.hold = hold;
    this.life = ms / 1000;
    this.t = 0;
    this.out = -1;
    this.done = false;
    this.spin = spin;
    const P = WORD_PALS[pal] || WORD_PALS.gold;
    this.root = new THREE.Group();
    this.root.name = 'words3d';
    const inner = new THREE.Group();
    this.root.add(inner);
    this.letters = [];
    const mat = voxelMaterial();
    let x = 0;
    const chars = [...String(text)];
    chars.forEach((ch, i) => {
      if (ch === ' ') { x += SPACE[font]; return; }
      const L = letterModel(font, ch, P);
      if (!L) { x += SPACE[font]; return; }
      const geo = L.m.build({ scale: size });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      const pivot = new THREE.Group();
      pivot.add(mesh);
      // centre each letter on its own pivot so it can hop and turn in place
      mesh.position.set(-(L.adv - 1) * size / 2, 0, -DEPTH * size / 2);
      pivot.position.x = (x + (L.adv - 1) / 2) * size;
      pivot.userData.i = i;
      pivot.userData.delay = i * stagger;
      pivot.scale.setScalar(0.001);
      inner.add(pivot);
      this.letters.push(pivot);
      x += L.adv;
    });
    inner.position.x = -x * size / 2;
    this.width = x * size;
    game.scene.add(this.root);
    this.place();
  }

  place() {
    const a = typeof this.at === 'function' ? this.at() : this.at;
    if (a) this.root.position.set(a.x, a.y ?? 2, a.z);
    // face the camera (billboard), the way a title card faces the viewer
    const cam = (this.game.overrideRig || this.game.rig)?.camera;
    if (cam) this.root.quaternion.copy(cam.quaternion);
  }

  dismiss() { if (this.out < 0) this.out = this.t; }

  update(dt) {
    if (this.done) return false;
    this.t += dt;
    const t = this.t;
    if (!this.hold && this.out < 0 && t > this.life) this.dismiss();
    this.place();
    for (const p of this.letters) {
      const i = p.userData.i, d = p.userData.delay;
      const k = (t - d) / 0.42;
      let s = k <= 0 ? 0.001 : easeOutBack(k);
      let y = k <= 0 ? 1.2 : (1 - Math.min(1, k)) * 1.2;
      // idle: a bob and a sway that shows the extruded sides
      y += Math.sin(t * 2.2 + i * 0.6) * 0.035;
      let ry = this.spin ? Math.sin(t * 1.3 + i * 0.5) * 0.18 : 0;
      if (this.out >= 0) {
        const o = (t - this.out - i * 0.03) / 0.45;
        if (o > 0) { y += o * o * 1.6; s *= Math.max(0.001, 1 - o); ry += o * 2.4; }
      }
      p.position.y = y;
      p.rotation.y = ry;
      p.scale.setScalar(Math.max(0.001, s));
    }
    if (this.out >= 0 && t - this.out > 0.45 + this.letters.length * 0.03 + 0.1) { this.dispose(); return false; }
    return true;
  }

  dispose() {
    if (this.done) return;
    this.done = true;
    this.game.scene.remove(this.root);
    for (const p of this.letters) for (const m of p.children) m.geometry?.dispose?.();
  }
}
