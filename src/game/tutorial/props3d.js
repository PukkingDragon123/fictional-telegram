// [v33 tut] Things Reynard holds up during the tour, made from the game's own art (no new drawings):
//
//   makeProp('fish', { species, golden, morph })   the very sprite the pond shows (fishCanvasFor)
//   makeProp('pellets')   the Fish Pellets bag from the food picker (bagArt.bagCanvas)
//   makeProp('egg' | 'tag' | 'coins')              the game's own icons (sprites.spriteCanvas)
//   'scope' is not a card: Stage.hold('scope') puts the scientist's 3D magnifier (foxProps
//   'magnifier', the one the Fish Scope's Reynard holds) in his paw.
// Each card is a camera-facing pixel sprite (nearest filtering) in his paws (FoxRig.holdBoth), so it
// shows in the 3D world and in the close-ups. Returns a THREE.Group; disposeProp() frees it.
import * as THREE from 'three';
import { spriteCanvas, hasSprite } from '../../ui/sprites.js';
import { bagCanvas } from '../../ui/bagArt.js';
import { fishCanvasFor } from '../fishSprites.js';

// art px per world unit for each card (the fox stands ~1.6 units tall)
const PPU = { fish: 44, pellets: 120, egg: 56, tag: 56, coins: 56 };

function card(cv, ppu) {
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, transparent: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(cv.width / ppu, cv.height / ppu, 1);
  s.renderOrder = 14;
  const g = new THREE.Group();
  g.add(s);
  g.userData.dispose = () => { tex.dispose(); mat.dispose(); };
  return g;
}

export function makeProp(name, o = {}) {
  try {
    let cv = null;
    if (name === 'fish') cv = fishCanvasFor(o.species || 'bluegill', { morph: o.golden ? 'golden' : o.morph || 'normal', scale: 1 });
    else if (name === 'pellets') cv = bagCanvas('pellets', { scale: 1, fill: 1 });
    else if (hasSprite(name)) cv = spriteCanvas(name, 1);
    if (!cv) return null;
    const g = card(cv, PPU[name] || 56);
    g.userData.kind = name;
    return g;
  } catch (e) {
    console.warn('[tut] prop', name, e);
    return null;
  }
}

export function disposeProp(p) { try { p?.userData?.dispose?.(); } catch { /* ignore */ } }
