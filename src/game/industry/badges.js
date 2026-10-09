// [v26 power] Little pixel icons floating over buildings: the flashing plug (no power),
// a bolt (brownout), a stuffed crate (storage full), a beaver (nobody on shift).
// Immediate mode: call set() every frame for every badge that should show, then
// frame(dt) once; badges that were not set this frame go away.
//
//   const b = new Badges(game);
//   b.set(key, 'pw_plug', x, y, z, { blink: true });
//   b.frame(dt);
import * as THREE from 'three';
import { spriteCanvas, hasSprite } from '../../ui/sprites.js';

const TEX = new Map();
function texOf(name) {
  let t = TEX.get(name);
  if (t) return t;
  if (!hasSprite(name)) return null;
  t = new THREE.CanvasTexture(spriteCanvas(name, 1));
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  TEX.set(name, t);
  return t;
}

export class Badges {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'badges';
    game.scene.add(this.group);
    this.map = new Map();
    this.stamp = 1;
    this.t = 0;
  }

  set(key, name, x, y, z, { blink = false, size = 0.46 } = {}) {
    let b = this.map.get(key);
    if (!b || b.name !== name) {
      if (b) this.drop(key, b);
      const map = texOf(name);
      if (!map) return;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false }));
      sp.renderOrder = 26;
      this.group.add(sp);
      b = { sp, name, born: this.t };
      this.map.set(key, b);
    }
    b.stamp = this.stamp;
    b.blink = blink;
    b.size = size;
    b.x = x; b.y = y; b.z = z;
  }

  has(key) { return this.map.has(key); }
  drop(key, b = this.map.get(key)) {
    if (!b) return;
    this.group.remove(b.sp);
    b.sp.material.dispose();
    this.map.delete(key);
  }
  clear() { for (const k of [...this.map.keys()]) this.drop(k); }

  frame(dt) {
    this.t += dt;
    const hide = !!this.game.overrideScene;
    for (const [k, b] of this.map) {
      if (b.stamp !== this.stamp) { this.drop(k, b); continue; }
      const age = this.t - b.born;
      // pop in, bob, blink
      const pop = Math.min(1, age / 0.2);
      const s = b.size * (pop < 1 ? 0.4 + 0.6 * pop + Math.sin(pop * Math.PI) * 0.25 : 1);
      b.sp.scale.set(s, s, 1);
      b.sp.position.set(b.x, b.y + Math.sin(this.t * 3 + b.x) * 0.04, b.z);
      b.sp.visible = !hide && (!b.blink || Math.floor(this.t * 2.6) % 2 === 0);
    }
    this.stamp++;
  }
}
