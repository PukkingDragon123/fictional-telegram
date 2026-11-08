// [v32 class] Real 3D demos on Professor Reynard's science table (src/entities/classroomScene.js
// DEMO_TABLE). A lesson step with `show3d` sets one up and the ClassCam cuts to it
// (src/game/Classroom.js). Everything is voxels at half the room's grain (VD), plus the game's own
// rigs: BeaverChibi (src/entities/beaverChibi.js), BearRig (src/entities/bearRig.js), the voxel
// fish builder (src/entities/fishModels.js) and the critter ducks (src/entities/critters3d.js).
//
//   const demos = new ClassDemos(parentGroup, anchors.demo);   // anchors.demo = table-top centre
//   demos.show('courtship', 'date');   // build (once), swap in, run a beat
//   demos.update(dt, camera); demos.labels(['gills', 'fins']); demos.hide(); demos.dispose();
//
// Demos and their beats:
//   fishParts  a big bluegill in an aquarium: 'look' | 'gills' (water in, over the red gills, out)
//              | 'bladder' (x-ray: the swim bladder inflates and the fish rises) | 'food' (pellets, a gulp)
//   courtship  two bluegills over a gravel nest: 'date' (circling, hearts) | 'lay' (eggs drop into
//              the nest, dad fertilizes) | 'guard' (dad fans the nest)
//   hatch      the same tank: 'develop' (eye spots, the thermometer warms up) | 'hatch' (eggs crack,
//              fry with yolk sacs wriggle out) | 'cold' (the thermometer drops, everything slows)
//   dam        a stream through a meadow: 'stream' | 'build' (a beaver hauls logs, the dam grows and the
//              water rises) | 'wetland' (the flooded meadow fills with cattails, lilies, a duck, frogs)
//   bears      a mountain with Bear St. Holdings on top and Reynard's pond below: 'rush' (bears run
//              the trail and cannonball in) | 'omnivore' (berries, honey and fish) | 'rampage' (no
//              fish: stomping, smashing) | 'happy'
import * as THREE from 'three';
import { VoxelModel, shade, mix } from '../../core/voxel.js';
import { hash2, hash3, mulberry32, clamp } from '../../core/rng.js';
import { fishVoxels } from '../../entities/fishModels.js';
import { SPECIES_BY_ID } from '../../data/species.js';
import { BeaverChibi } from '../../entities/beaverChibi.js';
import { BearRig } from '../../entities/bearRig.js';
import { makeBearLook, lookDef } from '../../entities/bearLook.js';
import { BEAR_TYPES } from '../../data/bears.js';
import { Duck } from '../../entities/critterDuck.js';
import { pxTextBuf } from '../../ui/kinetic/pxfont.js';

export const VD = 0.025; // diorama voxel (the room is 0.05)
const TAU = Math.PI * 2;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const pickC = (arr, h) => arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];
const back = (t) => { const s = 1.9; t = clamp(t, 0, 1) - 1; return t * t * ((s + 1) * t + s) + 1; }; // overshoot pop

// ------------------------------------------------------------------ materials (shared)
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    lit: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    water: new THREE.MeshLambertMaterial({ color: 0x3a9ad0, transparent: true, opacity: 0.62, depthWrite: false, emissive: 0x0a3a5a, emissiveIntensity: 0.6 }),
    tankWater: new THREE.MeshBasicMaterial({ color: 0x5ac0e8, transparent: true, opacity: 0.1, depthWrite: false }),
    tankTop: new THREE.MeshBasicMaterial({ color: 0xaaf0ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    glass: new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.045, depthWrite: false }),
    fall: new THREE.MeshBasicMaterial({ color: 0xd8f6ff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
    ink: new THREE.LineBasicMaterial({ color: 0x2a1a10 }),
  };
  return MATS;
}
const build = (vm, { pivot = [0, 0, 0], ao = true, scale = VD } = {}) => vm.build({ pivot, scale, ao });
function vmesh(vm, mat = mats().lit, o = {}) {
  const m = new THREE.Mesh(build(vm, o), mat);
  m.castShadow = o.cast ?? true; m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ pixel sprites (hearts, sparks, tags)
function pxCanvasTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ART_CACHE = new Map();
function pxArt(name, rows, pal) {
  if (ART_CACHE.has(name)) return ART_CACHE.get(name);
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const k = r[x]; if (k === '.' || !pal[k]) continue; c.fillStyle = pal[k]; c.fillRect(x, y, 1, 1); } });
  const a = { tex: pxCanvasTex(cv), w, h };
  ART_CACHE.set(name, a);
  return a;
}
const P = { K: '#2a1410', R: '#e8364a', r: '#ff7a8a', W: '#ffffff', Y: '#ffd23a', y: '#fff3a0', O: '#f08a2a', B: '#6ad0ff', b: '#d8f6ff', G: '#7ad04a', g: '#c8f08a', D: '#a02020', S: '#8a8a96', s: '#d8d8e0', N: '#5a3a1a' };
const ART = {
  heart: ['.KK.KK.', 'KrRKRRK', 'KrRRRRK', 'KRRRRRK', '.KRRRK.', '..KRK..', '...K...'],
  spark: ['...Y...', '...y...', 'YyyWyyY', '...y...', '...Y...'],
  bubble: ['.bb.', 'b..b', 'b.Wb', '.bb.'],
  anger: ['K..K..K', '.KRKRK.', 'KRrRrRK', '.KRRRK.', 'KRrRrRK', '.KRKRK.', 'K..K..K'],
  coin: ['.KKKK.', 'KyYYYK', 'KYyOYK', 'KYyOYK', 'KYOOYK', '.KKKK.'],
  star: ['...K...', '..KYK..', 'KKKYKKK', 'KYYyYYK', '.KYYYK.', '.KYKYK.', 'KK...KK'],
  o2: ['.BB.', 'B..B', 'B..B', '.BB.'],
  zz: ['KKKK', '..K.', '.K..', 'KKKK'],
  note: ['..KK', '..KR', '..K.', 'KKK.', 'KKK.'],
};
function sprite(name, texel = 0.0045) {
  const a = pxArt(name, ART[name], P);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: a.tex, transparent: true, alphaTest: 0.5, depthWrite: false }));
  s.scale.set(a.w * texel, a.h * texel, 1);
  s.userData.sz = [a.w * texel, a.h * texel];
  s.renderOrder = 6;
  return s;
}

/** A paper tag with a pixel-font word, on a pin line to `at` (local point). */
function makeTag(text, color = '#3a2414') {
  const buf = pxTextBuf(text, { font: 'bold', color });
  const w = buf.w + 12, h = 15;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const box = (x, y, ww, hh, col) => { c.fillStyle = col; c.fillRect(x, y, ww, hh); };
  // tag body: cream card with a clipped corner, a dark outline, a shadow row and a punched hole
  box(1, 1, w - 2, h - 3, '#2a1410');
  box(2, 2, w - 4, h - 5, '#fbf1d6');
  box(2, h - 4, w - 4, 1, '#e2cfa2');
  box(w - 4, 2, 2, 1, '#2a1410'); box(w - 3, 3, 1, 1, '#2a1410');
  box(4, 6, 2, 2, '#2a1410'); box(4, 5, 2, 1, '#a08a60');
  box(1, h - 2, w - 2, 1, 'rgba(0,0,0,0.25)');
  const ic = document.createElement('canvas'); ic.width = buf.w; ic.height = buf.h;
  ic.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf.bytes), buf.w, buf.h), 0, 0);
  c.drawImage(ic, 8, Math.round((h - 3 - buf.h) / 2) + 1);
  const tex = pxCanvasTex(cv);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthTest: false, depthWrite: false }));
  const k = 0.0042;
  s.scale.set(w * k, h * k, 1);
  s.center.set(0.08, 0.5);
  s.renderOrder = 9;
  s.userData.sz = [w * k, h * k];
  return s;
}

// ------------------------------------------------------------------ voxel fish (wiggles)
function fishModel(spId, { male = true, L = 18, H = 12, W = 5, golden = false } = {}) {
  const sp = SPECIES_BY_ID[spId] || SPECIES_BY_ID.bluegill;
  const c = sp.colors || { back: 0x3a5f9c, side: 0x5b86c9, belly: 0xe8a34c, fin: 0x3f6aa8, accent: 0x16223a };
  const side = male ? c.side : mix(c.side, 0xc8d0b0, 0.35);
  return {
    L, H, W, shape: 'round', back: male ? c.back : mix(c.back, 0x8a9a70, 0.3), side, belly: male ? 0xf0862a : mix(c.belly, 0xf4e0b0, 0.5), fin: c.fin,
    pattern: [{ type: 'bars', from: 0.18, to: 0.72, count: 5, color: shade(side, 0.7) }, { type: 'patch', at: 0.72, y: 0.25, color: c.accent || 0x16223a }],
    dorsal: 'long', tail: 'fork', cheek: male ? 0x2a4a9a : null, eye: 0x101418, golden,
  };
}
function wiggleMat(k, { xray = false } = {}) {
  const u = { uPhase: { value: 0 }, uAmp: { value: 0 }, uK: { value: k } };
  const m = new THREE.MeshLambertMaterial(xray ? { vertexColors: true, transparent: true, opacity: 0.34, depthWrite: false, emissive: 0x18243a } : { vertexColors: true, emissive: 0x141c24 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float bend;\nuniform float uPhase;\nuniform float uAmp;\nuniform float uK;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += sin(uPhase - position.x * uK) * uAmp * bend;');
  };
  m.customProgramCacheKey = () => 'clsfish' + (xray ? 'x' : '');
  m.userData.u = u;
  return m;
}
class DemoFish {
  /** a voxel fish facing +x, centred; scale = world units per fish voxel */
  constructor(model, scale, { xray = false, edit = null } = {}) {
    const vm = fishVoxels(model, !!model.golden);
    edit?.(vm);
    const cx = (vm.minX + vm.maxX + 1) / 2;
    this.vm = vm; this.cx = cx; this.scale = scale;
    const geo = vm.build({ pivot: [cx, 0.5, 0.5], scale });
    const pos = geo.attributes.position;
    const headX = (vm.maxX + 1 - cx) * scale, tailX = (vm.minX - cx) * scale;
    this.len = headX - tailX; this.headX = headX; this.tailX = tailX;
    const bend = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) { const kk = Math.min(1, Math.max(0, (headX - pos.getX(i)) / this.len - 0.3) / 0.7); bend[i] = kk * kk; }
    geo.setAttribute('bend', new THREE.BufferAttribute(bend, 1));
    this.mat = wiggleMat(5.5 / this.len); // ~one body wave along the fish
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true;
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    if (xray) { this.xmat = wiggleMat(5.5 / this.len, { xray: true }); }
    this.phase = Math.random() * 6; this.speed = 6; this.amp = 0.06;
    this.heading = 0; this.pitch = 0;
  }
  setXray(on) {
    if (!this.xmat) return;
    this.mesh.material = on ? this.xmat : this.mat;
    this.mesh.castShadow = !on;
  }
  update(dt) {
    this.phase += dt * this.speed;
    for (const m of [this.mat, this.xmat]) if (m) { m.userData.u.uPhase.value = this.phase; m.userData.u.uAmp.value = this.amp * this.len; }
    this.root.rotation.set(0, -this.heading, this.pitch);
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.xmat?.dispose(); }
}

// ------------------------------------------------------------------ the base class: pops, particles, labels
class Demo {
  constructor(name) {
    this.name = name;
    this.group = new THREE.Group();
    this.group.name = 'demo:' + name;
    this.t = 0; this.bt = 0; this.beatName = null;
    this.pops = []; this.fx = []; this.tags = new Map(); this.owned = [];
    this.fxGroup = new THREE.Group(); this.group.add(this.fxGroup);
    this.sfx = null;
  }
  own(x) { this.owned.push(x); return x; }
  beat(name) { this.beatName = name; this.bt = 0; this.onBeat?.(name); }
  /** pop an object in (scale 0 -> 1 with overshoot) after `delay` seconds */
  pop(obj, delay = 0, dur = 0.35) {
    obj.userData.popBase ||= obj.scale.clone();
    obj.scale.setScalar(0.0001); obj.visible = true;
    this.pops.push({ obj, t: -delay, dur });
  }
  /** a sprite particle: { name, at: Vector3, vel, life, grow, texel } */
  emit(name, at, { vel = [0, 0.12, 0], life = 1.2, texel = 0.0045, grow = 0, gravity = 0, fade = true } = {}) {
    const s = sprite(name, texel);
    s.position.copy(at);
    this.fxGroup.add(s);
    this.fx.push({ s, v: new THREE.Vector3(...vel), life, t: 0, grow, gravity, fade });
    return s;
  }
  tag(key, text, at, from) {
    if (this.tags.has(key)) return this.tags.get(key);
    const s = makeTag(text);
    s.position.copy(at);
    const g = new THREE.BufferGeometry().setFromPoints([from.clone(), at.clone()]);
    const line = new THREE.Line(g, mats().ink);
    line.renderOrder = 8;
    const grp = new THREE.Group(); grp.add(line, s);
    grp.visible = false;
    this.group.add(grp);
    const t = { grp, s, line, at, from, shown: false };
    this.tags.set(key, t);
    return t;
  }
  showTags(keys) {
    const want = new Set(keys || []);
    let i = 0;
    for (const [k, t] of this.tags) {
      if (want.has(k) && !t.shown) { t.shown = true; t.grp.visible = true; t.popT = -0.35 * i++; t.s.scale.setScalar(0.0001); this.sfx?.('class_pop', { volume: 0.35, pitch: 1.3, delay: 0.35 * (i - 1) }); }
      else if (!want.has(k) && t.shown) { t.shown = false; t.grp.visible = false; }
    }
  }
  tick(dt, camera) {
    this.t += dt; this.bt += dt;
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const k = p.t <= 0 ? 0.0001 : back(p.t / p.dur);
      p.obj.scale.copy(p.obj.userData.popBase).multiplyScalar(Math.max(0.0001, k));
      if (p.t >= p.dur) { p.obj.scale.copy(p.obj.userData.popBase); this.pops.splice(i, 1); }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t >= f.life) { f.s.removeFromParent(); f.s.material.dispose(); this.fx.splice(i, 1); continue; }
      f.v.y -= f.gravity * dt;
      f.s.position.addScaledVector(f.v, dt);
      const k = f.t < 0.12 ? back(f.t / 0.12) : 1 + f.grow * f.t;
      f.s.scale.set(f.s.userData.sz[0] * k, f.s.userData.sz[1] * k, 1);
      f.s.material.opacity = f.fade ? clamp((f.life - f.t) / 0.3, 0, 1) : 1;
    }
    for (const t of this.tags.values()) {
      if (!t.shown) continue;
      if (t.popT != null) {
        t.popT += dt;
        const k = t.popT <= 0 ? 0.0001 : back(t.popT / 0.3);
        t.s.scale.set(t.s.userData.sz[0] * k, t.s.userData.sz[1] * k, 1);
        t.line.visible = t.popT > 0;
        if (t.popT > 0.3) { t.s.scale.set(t.s.userData.sz[0], t.s.userData.sz[1], 1); t.popT = null; }
      }
      t.s.position.y = t.at.y + Math.sin(this.t * 2 + t.at.x * 9) * 0.004;
    }
    this.update?.(dt, camera);
  }
  dispose() {
    for (const f of this.fx) f.s.material.dispose();
    for (const t of this.tags.values()) { t.s.material.map?.dispose(); t.s.material.dispose(); t.line.geometry.dispose(); }
    this.group.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.geometry && !o.userData.shared) o.geometry.dispose(); });
    for (const x of this.owned) { try { x.dispose?.(); } catch { /* ignore */ } }
    this.group.removeFromParent();
  }
}

// ================================================================== the aquarium (fish demos)
// inner volume in VD voxels: x -22..21, z -12..11, gravel at y 2..3, water to y 24
const TK = { X0: -22, X1: 21, Z0: -12, Z1: 11, G: 3, H: 25 };
function buildAquarium(g, { nest = false, deco = true } = {}) {
  const R = new VoxelModel(), GLO = new VoxelModel();
  const { X0, X1, Z0, Z1, G, H } = TK;
  // walnut plinth with a brass rim
  R.box(X0 - 2, 0, Z0 - 2, X1 + 2, 1, Z1 + 2, (x, y, z) => {
    const e = x === X0 - 2 || x === X1 + 2 || z === Z0 - 2 || z === Z1 + 2;
    if (y === 1) return e ? 0xd8a838 : 0x6a3e22;
    return (x + z) % 9 === 0 ? 0x5a3018 : 0x6e4024;
  });
  // black frame: bottom ring, top ring, corner posts
  const FR = 0x24242c, FRL = 0x4a4a56;
  for (let x = X0 - 1; x <= X1 + 1; x++) for (const z of [Z0 - 1, Z1 + 1]) { R.set(x, 2, z, FR); R.set(x, H + 1, z, x % 6 === 0 ? FRL : FR); }
  for (let z = Z0 - 1; z <= Z1 + 1; z++) for (const x of [X0 - 1, X1 + 1]) { R.set(x, 2, z, FR); R.set(x, H + 1, z, FR); }
  for (const x of [X0 - 1, X1 + 1]) for (const z of [Z0 - 1, Z1 + 1]) for (let y = 2; y <= H + 1; y++) R.set(x, y, z, y % 7 === 0 ? FRL : FR);
  // gravel: speckled, with mounds toward the back
  const GRAV = [0xd8c09a, 0xc8a87e, 0xe8d6b0, 0xb89a72, 0xf0e2c0, 0x9a8a7a];
  for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
    const mound = Math.max(0, Math.round((Z1 - z) / 9 + Math.sin(x * 0.35) * 0.8 - 0.4));
    const top = G + mound;
    for (let y = 2; y <= top; y++) {
      let c = pickC(GRAV, hash3(x, y, z, 5));
      if (hash3(x, y, z, 9) < 0.06) c = pickC([0x6aa0c8, 0xd87a6a, 0x8ac06a], hash3(x, z, 1, 2)); // coloured pebbles
      R.set(x, y, z, c);
    }
  }
  if (nest) {
    // a saucer-shaped nest fanned clean in the gravel (bluegill dads dig these)
    for (let x = -6; x <= 6; x++) for (let z = -3; z <= 5; z++) {
      const d = Math.hypot(x / 6, (z - 1) / 4.2);
      if (d > 1.05) continue;
      R.set(x, G, z, null);
      R.set(x, G - 1, z, d > 0.8 ? 0xb89a72 : hash3(x, z, 3, 3) < 0.15 ? 0xfaf2dc : 0xefe4c8);
      if (d > 0.82 && d < 1.05) R.set(x, G + 1, z, pickC(GRAV, hash3(x, z, 7, 1)));
    }
  }
  if (deco) {
    // swaying plants are separate meshes (below); here: a mossy rock arch, a sunken log, a castle tower
    R.ellipsoid(X0 + 7, G + 3, Z0 + 4, 5, 3.5, 3.5, (x, y, z) => (y > G + 4 && hash3(x, y, z, 1) < 0.5 ? 0x6a9a4a : hash3(x, y, z, 2) < 0.4 ? 0x8a8a90 : 0x9c9ca4));
    R.ellipsoid(X0 + 12, G + 2, Z0 + 3, 3, 2.5, 3, (x, y, z) => (hash3(x, y, z, 3) < 0.3 ? 0x7a7a82 : 0x8e8e98));
    for (let x = X1 - 14; x <= X1 - 4; x++) for (const [dy, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) R.set(x, G + 1 + dy, Z0 + 3 + dz, x === X1 - 14 || x === X1 - 4 ? 0xc89a62 : (x + dy) % 3 ? 0x7a4a2a : 0x8a5634);
    const cx = X1 - 4, cz = Z0 + 6;
    for (let y = G + 1; y <= G + 9; y++) for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) {
      const ring = Math.abs(x - cx) === 2 || Math.abs(z - cz) === 2;
      if (!ring) continue;
      if (y === G + 9 && (x + z) % 2) continue;
      if (z === cz + 2 && x === cx && y <= G + 3) continue; // door
      R.set(x, y, z, (x + y * 2 + z) % 5 === 0 ? 0xa8a090 : 0xc8c0b0);
    }
    R.set(cx, G + 6, cz + 2, 0x2a2a30);
  }
  // a thermometer stuck inside the front glass, left corner (the red column is a separate mesh)
  const TX = X0 + 1, TZ = Z1;
  for (let y = G + 2; y <= G + 17; y++) { R.set(TX, y, TZ, 0xf4f4f0); if (y % 3 === 0) R.set(TX + 1, y, TZ, 0x3a3a40); }
  R.set(TX, G + 1, TZ, 0xd8302a); R.set(TX, G + 2, TZ, 0xe8443a);
  // glass glints (bright hand-placed streaks on the front pane, in front of the water)
  for (let i = 0; i < 6; i++) { GLO.set(X0 + 3 + i, H - 2 - i, Z1 + 1, 0xffffff); GLO.set(X0 + 5 + i, H - 2 - i, Z1 + 1, 0xe8fbff); }
  for (let i = 0; i < 3; i++) GLO.set(X1 - 8 + i, 7 - i, Z1 + 1, 0xffffff);
  // an open top with a lamp bar along the back (so the camera can look in from above)
  R.box(X0 - 1, H + 2, Z0 - 1, X1 + 1, H + 3, Z0 + 1, (x, y, z) => (y === H + 3 ? 0x3a3a44 : z === Z0 + 1 ? 0x34343c : 0x2a2a30));
  for (let x = X0 + 2; x <= X1 - 2; x++) GLO.set(x, H + 1, Z0 + 1, x % 4 ? 0xe8f8ff : 0xc8e8f8);
  const m = vmesh(R); g.add(m);
  const gm = vmesh(GLO, mats().glow, { cast: false }); gm.castShadow = false; g.add(gm);
  // water volume + surface + glass skin
  const w = (X1 - X0 + 1) * VD, d = (Z1 - Z0 + 1) * VD, wy0 = 2 * VD, wy1 = (H - 1) * VD;
  const vol = new THREE.Mesh(new THREE.BoxGeometry(w, wy1 - wy0, d), mats().tankWater);
  vol.position.set((X0 + X1 + 1) / 2 * VD, (wy0 + wy1) / 2, (Z0 + Z1 + 1) / 2 * VD); vol.renderOrder = 3;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats().tankTop);
  top.rotation.x = -Math.PI / 2; top.position.set(vol.position.x, wy1, vol.position.z); top.renderOrder = 4;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w + VD * 2, (H - 1) * VD, d + VD * 2), mats().glass);
  glass.position.set(vol.position.x, (2 + H) / 2 * VD, vol.position.z); glass.renderOrder = 5;
  g.add(vol, top, glass);
  // swaying plants: tall wavy strands, each its own mesh, hinged at the gravel
  const plants = [];
  const strand = (x, z, h, col) => {
    const vm = new VoxelModel();
    for (let y = 0; y < h; y++) {
      const k = y / h, ox = Math.round(Math.sin(y * 0.55 + x) * (0.6 + k));
      vm.set(ox, y, 0, y % 3 ? col : shade(col, 1.18));
      if (y > 2 && y % 4 === 1) vm.set(ox + (y % 8 < 4 ? 1 : -1), y, 0, shade(col, 1.1));
    }
    const pm = vmesh(vm); pm.position.set(x * VD, (G + 1) * VD, z * VD);
    g.add(pm); plants.push({ m: pm, ph: x * 0.7 + z, k: 0.06 + h * 0.003 });
  };
  for (const [x, z, h, c] of [[X0 + 2, Z0 + 2, 18, 0x3a9a4a], [X0 + 4, Z0 + 3, 13, 0x5aba4a], [X0 + 3, Z0 + 6, 16, 0x4aaa3a], [X1 - 2, Z0 + 2, 19, 0x3a9a4a], [X1 - 6, Z0 + 2, 12, 0x6ac04a], [X1 - 1, Z0 + 8, 15, 0x4aaa3a], [-4, Z0 + 1, 10, 0x5aba4a], [6, Z0 + 2, 14, 0x3a9a4a]]) strand(x, z, h, c);
  // a thermometer column we can raise / lower
  const thermo = new THREE.Mesh(new THREE.BoxGeometry(VD * 0.6, VD, VD * 0.6), new THREE.MeshBasicMaterial({ color: 0xe8443a }));
  thermo.position.set((X0 + 1) * VD + VD * 0.5, (G + 3) * VD, Z1 * VD + VD * 0.5 + VD * 0.3);
  g.add(thermo);
  return {
    plants, thermo, surfaceY: wy1, floorY: (G + 1) * VD, center: vol.position.clone(),
    setThermo(k) { const h = 1 + k * 13; thermo.scale.y = h; thermo.position.y = (G + 2) * VD + h * VD / 2; },
  };
}
function swayPlants(plants, t) { for (const p of plants) { p.m.rotation.z = Math.sin(t * 1.3 + p.ph) * p.k; p.m.rotation.x = Math.sin(t * 0.9 + p.ph * 2) * p.k * 0.5; } }

// ------------------------------------------------------------------ fishParts
class FishPartsDemo extends Demo {
  constructor() {
    super('fishParts');
    const g = this.group;
    this.tank = buildAquarium(g, { deco: true });
    const L = 40, H = 25, W = 9, S = 0.0175;
    const gx = Math.round((L - 1) * 0.66); // the gill slit (front edge of the gill cover)
    const surfZ = (vm, x, y, s) => { let z = s * 8; while (Math.abs(z) > 0 && !vm.has(x, y, z)) z -= s; return z; };
    // the big bluegill, built by the game's voxel fish builder, then hand-finished: a gill pocket under
    // a hinged gill cover, a proper eye, a darker "ear" flap
    this.fish = new DemoFish(fishModel('bluegill', { male: true, L, H, W }), S, {
      xray: true,
      edit: (vm) => {
        for (const s of [1, -1]) {
          for (let y = -6; y <= 5; y++) for (let x = gx - 4; x <= gx; x++) {
            const z = surfZ(vm, x, y, s);
            if (!z) continue;
            vm.set(x, y, z, null); vm.set(x, y, z - s, null); // the pocket
            // feathery red gill filaments at the back of the pocket
            vm.set(x, y, z - s * 2, (x + y) % 2 ? 0xd02838 : x % 2 ? 0xff5a62 : 0xe83a4a);
          }
          // the eye: dark pupil, gold rim, a white glint
          const ex = Math.round((L - 1) * 0.83), ey = 3;
          const z = surfZ(vm, ex, ey, s);
          for (const [dx, dy, c] of [[0, 0, 0x101418], [1, 0, 0x101418], [0, 1, 0x101418], [1, 1, 0x101418], [-1, 0, 0xd8a838], [2, 0, 0xd8a838], [-1, 1, 0xd8a838], [2, 1, 0xd8a838], [0, -1, 0xd8a838], [1, -1, 0xd8a838], [0, 2, 0xd8a838], [1, 2, 0xd8a838]]) {
            const zz = surfZ(vm, ex + dx, ey + dy, s); if (zz) vm.set(ex + dx, ey + dy, zz, c);
          }
          const zz = surfZ(vm, ex + 1, ey + 1, s); if (zz) vm.set(ex + 1, ey + 1, zz, 0xffffff);
        }
      },
    });
    this.own(this.fish);
    this.fish.amp = 0.02; this.fish.speed = 3.2;
    this.fishHome = new THREE.Vector3(-0.02, 0.32, 0.0);
    this.fish.root.position.copy(this.fishHome);
    g.add(this.fish.root);
    const cx = this.fish.cx;
    const at = (vx, vy, vz = 0) => new THREE.Vector3((vx - cx + 0.5) * S, (vy + 0.5) * S, (vz + 0.5) * S);
    this.at = at;
    // the gill covers: a half-moon flap on each side, hinged at its front edge
    this.gillCovers = [];
    const side = 0x5b86c9;
    for (const s of [1, -1]) {
      const cv = new VoxelModel();
      for (let y = -7; y <= 6; y++) {
        const w = Math.round(5.6 * Math.sqrt(Math.max(0, 1 - ((y + 0.5) / 7.2) ** 2)));
        for (let k = 0; k <= w; k++) cv.set(-k, y, 0, k === w ? 0x24345a : (y === 1 || y === 2) && k > 1 && k < 4 ? 0x16223a : k === 0 ? shade(side, 1.1) : (k + y) % 4 === 0 ? shade(side, 0.88) : side);
      }
      const cm = new THREE.Mesh(build(cv, { scale: S, pivot: [0, 0, 0.5] }), mats().lit);
      const z = s * 4.1;
      cm.position.copy(at(gx + 0.5, 0, z)).add(new THREE.Vector3(0, 0, 0));
      cm.position.x = (gx + 1 - cx) * S;
      this.fish.mesh.add(cm);
      this.gillCovers.push({ m: cm, s });
    }
    // insides (seen in x-ray): swim bladder, spine, gut, heart
    const ins = new THREE.Group();
    const bl = new VoxelModel();
    bl.ellipsoid(0, 0, 0, 8.5, 3, 2.6, (x, y, z) => (y > 1.5 ? 0xffffff : hash3(x, y, z, 2) < 0.3 ? 0xd8e8f0 : 0xeaf4fa));
    this.bladder = new THREE.Mesh(build(bl, { scale: S }), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x6a8aa0, emissiveIntensity: 0.6 }));
    this.bladder.position.copy(at(L * 0.45, 2.5));
    this.own(this.bladder.material); this.own(this.bladder.geometry);
    const sp = new VoxelModel();
    for (let x = Math.round(L * 0.06); x <= Math.round(L * 0.78); x++) {
      const yy = 6 - Math.round(Math.sin((x / L) * Math.PI) * 1.5);
      sp.set(x, yy, 0, 0xf4f0e6);
      if (x % 2 === 0) for (let k = 1; k <= 3; k++) { sp.set(x, yy + k, 0, 0xe8e0d0); sp.set(x, yy - k, 0, k < 3 ? 0xe8e0d0 : null); }
    }
    const spine = new THREE.Mesh(build(sp, { scale: S, pivot: [cx - 0.5, -0.5, -0.5] }), mats().lit);
    const gu = new VoxelModel();
    gu.ellipsoid(L * 0.58, -4, 0, 4.2, 2.6, 2, (x, y, z) => (hash3(x, y, z, 1) < 0.4 ? 0xb06a4a : 0xc8805a));
    gu.ellipsoid(L * 0.71, -5, 0, 1.8, 1.6, 1.4, 0xd8303a); // heart
    const gut = new THREE.Mesh(build(gu, { scale: S, pivot: [cx - 0.5, -0.5, -0.5] }), mats().lit);
    ins.add(this.bladder, spine, gut);
    ins.visible = false;
    this.insides = ins;
    this.fish.mesh.add(ins);
    // label anchors (fish-local, follow the fish)
    const tagAt = (k, text, local, off) => { const t = this.tag(k, text, new THREE.Vector3(), new THREE.Vector3()); t.local = local; t.off = off; };
    tagAt('gills', 'GILLS', at(gx - 2, 1, 4.5), new THREE.Vector3(0.06, 0.24, 0.16));
    tagAt('mouth', 'MOUTH', at(L, -1, 1), new THREE.Vector3(0.12, -0.06, 0.14));
    tagAt('eye', 'EYE', at(Math.round(L * 0.83), 3, 4), new THREE.Vector3(0.1, 0.16, 0.14));
    tagAt('fins', 'FIN', at(Math.round(L * 0.45), 13, 0), new THREE.Vector3(-0.08, 0.1, 0.16));
    tagAt('pectoral', 'FIN', at(Math.round(L * 0.68), -4, 4.5), new THREE.Vector3(0.05, -0.17, 0.2));
    tagAt('tail', 'TAIL', at(-3, 0, 0), new THREE.Vector3(-0.14, 0.16, 0.14));
    tagAt('bladder', 'SWIM BLADDER', at(L * 0.45, 3, 0), new THREE.Vector3(-0.1, 0.3, 0.2));
    this.flow = 0; this.inflate = 0.5; this.rise = 0;
    this._v = new THREE.Vector3();
    this.L = L;
  }
  onBeat(b) {
    this.fish.setXray(b === 'bladder');
    this.insides.visible = b === 'bladder';
    for (const c of this.gillCovers) c.m.visible = b !== 'bladder'; // x-ray: no gill covers, the red gills show
    this.flowOn = b === 'gills';
  }
  update(dt) {
    const f = this.fish, t = this.t;
    swayPlants(this.tank.plants, t);
    this.tank.setThermo(0.5);
    // hover in place, side-on to the front camera; drift up / down with the bladder
    const b = this.beatName;
    if (b === 'bladder') {
      const cyc = (this.bt % 7) / 7; // inflate, hold, deflate, hold
      const k = cyc < 0.35 ? smooth(cyc / 0.35) : cyc < 0.5 ? 1 : cyc < 0.85 ? 1 - smooth((cyc - 0.5) / 0.35) : 0;
      this.inflate = 0.35 + k * 0.85;
      this.rise += (((k - 0.5) * 0.14) - this.rise) * Math.min(1, dt * 1.6);
      if (Math.random() < dt * 3) this.emit(k > 0.5 ? 'spark' : 'bubble', new THREE.Vector3(f.root.position.x, f.root.position.y + 0.15, 0.05), { vel: [0, 0.06, 0], life: 0.6, texel: 0.0028 });
    } else { this.inflate += (0.6 - this.inflate) * Math.min(1, dt * 2); this.rise += (0 - this.rise) * Math.min(1, dt * 2); }
    this.bladder.scale.set(0.75 + this.inflate * 0.3, this.inflate, this.inflate);
    f.root.position.set(this.fishHome.x + Math.sin(t * 0.5) * 0.015, this.fishHome.y + this.rise + Math.sin(t * 1.1) * 0.006, this.fishHome.z);
    f.heading = -0.42 + Math.sin(t * 0.3) * 0.08;
    f.pitch = b === 'bladder' ? (this.rise > 0.01 ? 0.05 : -0.03) : 0;
    f.update(dt);
    // gill covers pump (open as the mouth closes); wide open while we look at the gills
    const pump = b === 'gills' ? 0.35 + (Math.sin(t * 3.6) * 0.5 + 0.5) * 0.65 : (Math.sin(t * 1.6) * 0.5 + 0.5) * 0.12;
    for (const c of this.gillCovers) c.m.rotation.y = c.s * pump * 0.9;
    // water in through the mouth, over the gills (the oxygen soaks in), out under the gill cover
    if (this.flowOn) {
      this.flow -= dt;
      if (this.flow <= 0) {
        this.flow = 0.08;
        const head = this.at(this.L + 3, -1, (Math.random() - 0.5) * 3); f.mesh.localToWorld(head); this.group.worldToLocal(head);
        const dir = this._v.set(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -f.heading);
        const s = this.emit(Math.random() < 0.6 ? 'o2' : 'bubble', head, { vel: [dir.x * 0.13, (Math.random() - 0.5) * 0.02, dir.z * 0.13], life: 1.4, texel: 0.003 });
        s.userData.flow = true; s.userData.dir = dir.clone();
      }
      for (const fx of this.fx) {
        if (!fx.s.userData.flow) continue;
        // past the gills the water turns outward through the gill slit and the oxygen is gone
        if (fx.t > 0.62 && !fx.s.userData.out) {
          fx.s.userData.out = true;
          const d = fx.s.userData.dir, side = Math.random() < 0.5 ? 1 : -1;
          fx.v.set(d.x * 0.05 - d.z * side * 0.12, -0.01, d.z * 0.05 + d.x * side * 0.12);
          fx.s.material.color.setHex(0x8aa4b4);
        }
      }
    }
    // tags follow their anchors on the fish
    for (const tg of this.tags.values()) {
      if (!tg.local) continue;
      const p = this._v.copy(tg.local); f.mesh.localToWorld(p); this.group.worldToLocal(p);
      tg.at.copy(p).add(tg.off);
      tg.s.position.copy(tg.at);
      const pos = tg.line.geometry.attributes.position;
      pos.setXYZ(0, p.x, p.y, p.z); pos.setXYZ(1, tg.at.x, tg.at.y, tg.at.z); pos.needsUpdate = true;
      tg.line.geometry.computeBoundingSphere();
    }
  }
}

// ------------------------------------------------------------------ courtship + hatching (one tank)
class NurseryDemo extends Demo {
  constructor() {
    super('nursery');
    const g = this.group;
    this.tank = buildAquarium(g, { nest: true, deco: true });
    this.nest = new THREE.Vector3(0, this.tank.floorY - VD * 0.4, VD * 1.5);
    this.dad = new DemoFish(fishModel('bluegill', { male: true, L: 17, H: 11, W: 5 }), 0.017);
    this.mum = new DemoFish(fishModel('bluegill', { male: false, L: 16, H: 11, W: 5 }), 0.016);
    for (const f of [this.dad, this.mum]) { this.own(f); g.add(f.root); f.root.position.set(0, 0.3, 0); }
    // a clutch of eggs in the nest
    this.eggs = [];
    // eggs drawn far bigger than life (real ones are a millimetre) so the class can see them
    const eggGeo = (() => { const v = new VoxelModel(); v.ellipsoid(0, 0, 0, 1.6, 1.5, 1.6, (x, y, z) => (y > 0.5 && x < 0.5 ? 0xfff6c8 : y < -0.5 ? 0xd89a28 : 0xf2c040)); return build(v, { scale: 0.0085 }); })();
    this.own(eggGeo);
    const eyeGeo = new THREE.BoxGeometry(0.009, 0.009, 0.009); this.own(eyeGeo);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a20 }); this.own(eyeMat);
    const rnd = mulberry32(42);
    for (let i = 0; i < 22; i++) {
      // a golden mound of eggs in the middle of the nest: a wide bottom layer, a few on top
      const top = i >= 15, a = rnd() * TAU, r = Math.sqrt(rnd()) * (top ? 0.035 : 0.075);
      const e = new THREE.Mesh(eggGeo, mats().lit); e.userData.shared = true;
      e.position.set(this.nest.x + Math.cos(a) * r * 1.2, this.nest.y + 0.012 + (top ? 0.024 : 0), this.nest.z + Math.sin(a) * r * 0.9);
      e.visible = false;
      const eye = new THREE.Mesh(eyeGeo, eyeMat); eye.userData.shared = true; eye.position.set(0.006, 0.006, 0.01); eye.visible = false; e.add(eye);
      g.add(e);
      this.eggs.push({ m: e, eye, ph: rnd() * 6, hatched: false, base: e.position.clone() });
    }
    // fry with yolk sacs
    this.fry = [];
    for (let i = 0; i < 9; i++) {
      const fr = new DemoFish(fishModel('bluegill', { male: false, L: 11, H: 6, W: 3 }), 0.012);
      const yv = new VoxelModel(); yv.ellipsoid(0, 0, 0, 2, 1.6, 1.6, (x, y) => (y > 0.5 ? 0xfff09a : y < -0.5 ? 0xe8a020 : 0xffd040));
      const yolk = new THREE.Mesh(build(yv, { scale: 0.012 }), mats().lit);
      yolk.position.set(0.018, -0.026, 0); fr.root.add(yolk);
      fr.root.visible = false; fr.speed = 14; fr.amp = 0.12;
      g.add(fr.root);
      this.own(fr); this.own(yolk.geometry);
      this.fry.push({ f: fr, yolk, ph: i * 0.7, egg: this.eggs[i * 2 + 1] || this.eggs[i] });
    }
    this.thermoK = 0.45;
    this.develop = 0; this.laid = 0; this.speedK = 1;
    this.tag('egg', 'EGGS', new THREE.Vector3(-0.12, 0.2, 0.25), this.nest.clone().add(new THREE.Vector3(-0.03, 0.01, 0.03)));
    this.tag('dad', 'DAD', new THREE.Vector3(0.24, 0.42, 0.2), new THREE.Vector3(0.12, 0.3, 0));
    this.tag('nest', 'NEST', new THREE.Vector3(0.22, 0.14, 0.27), this.nest.clone().add(new THREE.Vector3(0.1, 0.0, 0.05)));
    this.tag('thermo', 'WARM', new THREE.Vector3(-0.42, 0.5, 0.36), new THREE.Vector3(-21 * VD, 0.32, 11.5 * VD));
    this.tag('yolk', 'YOLK SAC', new THREE.Vector3(-0.2, 0.36, 0.25), new THREE.Vector3(-0.05, 0.2, 0.05));
  }
  onBeat(b) {
    if (b === 'date') { this.laid = 0; this.develop = 0; for (const e of this.eggs) { e.m.visible = false; e.hatched = false; e.eye.visible = false; } for (const f of this.fry) f.f.root.visible = false; }
    if (b === 'develop' || b === 'hatch' || b === 'cold' || b === 'guard') {
      // the eggs are there already (a beat can be played on its own)
      for (const e of this.eggs) if (!e.hatched) e.m.visible = true;
      this.laid = this.eggs.length;
    }
    if (b === 'hatch') this.develop = Math.max(this.develop, 0.7);
    if (b === 'lay') this.laid = 0;
  }
  update(dt) {
    const t = this.t, b = this.beatName, bt = this.bt, N = this.nest;
    swayPlants(this.tank.plants, t);
    const thermoGoal = b === 'develop' || b === 'hatch' ? 0.85 : b === 'cold' ? 0.12 : 0.45;
    this.thermoK += (thermoGoal - this.thermoK) * Math.min(1, dt * 1.2);
    this.tank.setThermo(this.thermoK);
    const dad = this.dad, mum = this.mum;
    const place = (f, x, y, z, faceX, faceZ, k = 3) => {
      const p = f.root.position;
      const ox = p.x, oz = p.z;
      p.x += (x - p.x) * Math.min(1, dt * k); p.y += (y - p.y) * Math.min(1, dt * k); p.z += (z - p.z) * Math.min(1, dt * k);
      const dx = faceX != null ? faceX - p.x : p.x - ox, dz = faceZ != null ? faceZ - p.z : p.z - oz;
      if (Math.abs(dx) + Math.abs(dz) > 1e-5) { let d = Math.atan2(dz, dx) - f.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); f.heading += d * Math.min(1, dt * 6); }
    };
    if (!b || b === 'date') {
      // circling each other over the nest, hearts popping between them
      const a = t * 0.9;
      place(dad, N.x + Math.cos(a) * 0.16, N.y + 0.16 + Math.sin(t * 1.7) * 0.02, N.z + Math.sin(a) * 0.1, null, null);
      place(mum, N.x + Math.cos(a + Math.PI) * 0.16, N.y + 0.14 + Math.sin(t * 1.5 + 1) * 0.02, N.z + Math.sin(a + Math.PI) * 0.1, null, null);
      dad.speed = 7; mum.speed = 7;
      this._ht = (this._ht || 0) - dt;
      if (this._ht <= 0) { this._ht = 0.55; const mid = dad.root.position.clone().lerp(mum.root.position, 0.5); this.emit('heart', mid.add(new THREE.Vector3(0, 0.06, 0)), { vel: [0, 0.09, 0], life: 1.3, texel: 0.0042 }); this.sfx?.('heart', { volume: 0.12, pitch: 1.4 }); }
    } else if (b === 'lay') {
      // mum quivers low over the nest and drops eggs; dad right beside her, a milky cloud fertilizes them
      place(mum, N.x - 0.02 + Math.sin(t * 9) * 0.004, N.y + 0.07, N.z - 0.07, N.x + 1, N.z - 0.07, 2.5);
      place(dad, N.x + 0.04, N.y + 0.13, N.z - 0.15, N.x + 1, N.z - 0.15, 2.5);
      mum.speed = 16; dad.speed = 10;
      if (bt > 0.8 && this.laid < this.eggs.length) {
        this._lt = (this._lt || 0) - dt;
        if (this._lt <= 0) {
          this._lt = 0.11;
          const e = this.eggs[this.laid++];
          e.m.position.copy(e.base); this.pop(e.m, 0, 0.25);
          if (this.laid % 4 === 0) this.sfx?.('class_pop', { volume: 0.18, pitch: 1.8 });
        }
      }
      if (bt > 2.2 && bt < 4.5) { this._mt = (this._mt || 0) - dt; if (this._mt <= 0) { this._mt = 0.12; this.emit('spark', N.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.18, 0.04 + Math.random() * 0.04, (Math.random() - 0.5) * 0.1)), { vel: [0, 0.03, 0], life: 0.9, texel: 0.003 }); } }
    } else if (b === 'guard' || b === 'develop' || b === 'cold' || b === 'hatch') {
      // dad hovers over the nest fanning it with his tail (fresh, oxygen-rich water); mum is gone
      place(dad, N.x + Math.sin(t * 0.7) * 0.05, N.y + 0.12, N.z - 0.15, N.x + Math.sin(t * 0.7 + 1) * 0.1 + 0.2, N.z - 0.15, 2);
      dad.speed = b === 'cold' ? 5 : 13; dad.amp = 0.1;
      place(mum, 0.4, 0.42, -0.15, 0.6, -0.2, 0.8); mum.speed = 4;
      if (b !== 'cold' && Math.random() < dt * 4) this.emit('bubble', N.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.02, (Math.random() - 0.5) * 0.1)), { vel: [0, 0.05, 0], life: 1, texel: 0.0025 });
    }
    dad.update(dt); mum.update(dt);
    // eggs: develop (eye spots), wobble, hatch
    const warm = b === 'develop' || b === 'hatch';
    if (warm) this.develop = Math.min(1.2, this.develop + dt * (b === 'hatch' ? 0.35 : 0.2));
    for (const e of this.eggs) {
      if (!e.m.visible || e.hatched) continue;
      e.eye.visible = this.develop > 0.35;
      const wob = this.develop > 0.6 ? Math.sin(t * 18 + e.ph) * 0.25 * (b === 'cold' ? 0.2 : 1) : 0;
      e.m.rotation.z = wob; e.m.rotation.x = wob * 0.5;
    }
    if (b === 'hatch') {
      for (let i = 0; i < this.fry.length; i++) {
        const F = this.fry[i];
        const due = 0.6 + i * 0.32;
        if (!F.f.root.visible && bt > due) {
          F.egg.hatched = true; F.egg.m.visible = false;
          F.f.root.visible = true; F.f.root.position.copy(F.egg.m.position);
          F.t = 0;
          for (let k = 0; k < 3; k++) this.emit('spark', F.egg.m.position.clone().add(new THREE.Vector3(0, 0.01, 0)), { vel: [(Math.random() - 0.5) * 0.1, 0.06, (Math.random() - 0.5) * 0.1], life: 0.5, texel: 0.0025 });
          this.sfx?.('egg_crack', { volume: 0.2, pitch: 1.4 + Math.random() * 0.3 });
        }
        if (F.f.root.visible) {
          F.t += dt;
          // wriggle up from the nest, then hang around in a loose little school
          const up = smooth(F.t / 1.6);
          const a = t * 0.8 + F.ph;
          F.f.root.position.set(N.x + Math.cos(a) * 0.08 * up + (i - 4) * 0.012 * up, N.y + 0.02 + up * (0.08 + (i % 3) * 0.025), N.z + Math.sin(a) * 0.05 * up);
          F.f.heading = a + Math.PI / 2;
          F.f.pitch = Math.sin(t * 6 + i) * 0.2 * (1 - up * 0.6);
          F.f.update(dt);
        }
      }
    }
  }
}

// ================================================================== land dioramas
// footprint (VD voxels): x -26..25, z -18..17 on a wooden tray (y 0..1); terrain from y 2 up
const LX0 = -26, LX1 = 25, LZ0 = -18, LZ1 = 17;
const GRASS = [0x6ab04a, 0x76bc52, 0x5ea444, 0x82c45a];
const DIRT = [0x8a5a34, 0x7a4e2c, 0x96643a];
const SOIL = [0x6a4428, 0x5e3a22, 0x74482a];
const ROCK = [0x8e8a84, 0x9c968e, 0x7e7a74];
/** Fill a heightfield h(x,z) (top voxel y) into R with soil layers on the cut sides. colorTop(x,z,h) */
function buildTerrain(R, hf, colorTop) {
  for (let x = LX0 - 1; x <= LX1 + 1; x++) for (let z = LZ0 - 1; z <= LZ1 + 1; z++) {
    const e = x === LX0 - 1 || x === LX1 + 1 || z === LZ0 - 1 || z === LZ1 + 1;
    R.set(x, 0, z, e ? 0x5e3519 : 0x6e4024);
    R.set(x, 1, z, e ? 0xb87a48 : 0x8a5430);
    if (e) continue;
    const h = hf(x, z);
    for (let y = 2; y <= h; y++) {
      let c;
      if (y === h) c = colorTop(x, z, h);
      else if (y >= h - 1 && colorTop(x, z, h) !== null) c = shade(colorTop(x, z, h) ?? 0x6ab04a, 0.8);
      else c = (y + Math.floor(hash2(x, z, 4) * 2)) % 5 === 0 ? pickC(ROCK, hash3(x, y, z, 2)) : pickC(SOIL, hash3(x, y, z, 1));
      R.set(x, y, z, c);
    }
  }
}
function pine(R, x, y, z, h, seed = 1) {
  for (let k = 0; k < Math.max(2, Math.round(h * 0.25)); k++) R.set(x, y + k, z, 0x6a4428);
  const top = y + h;
  for (let yy = y + 2; yy <= top; yy++) {
    const r = Math.max(0, (top - yy) * 0.38 + ((top - yy) % 3 === 0 ? 0.6 : 0));
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (dx * dx + dz * dz > r * r + 0.3) continue;
      const hsh = hash3(x + dx, yy, z + dz, seed);
      R.set(x + dx, yy, z + dz, hsh < 0.18 ? 0x2a6a3a : hsh > 0.85 ? 0x5aa05a : (yy - y) % 3 === 0 ? 0x2e7a40 : 0x3a8a48);
    }
  }
  R.set(x, top + 1, z, 0x5aa05a);
}
function birch(R, x, y, z, h) {
  for (let k = 0; k < h; k++) R.set(x, y + k, z, k % 3 === 1 ? 0x2a2a2a : 0xf0ece0);
  R.ellipsoid(x, y + h + 1, z, 2.6, 2.2, 2.6, (xx, yy, zz) => (hash3(xx, yy, zz, 6) < 0.3 ? 0xe8c840 : hash3(xx, yy, zz, 7) < 0.5 ? 0x9ac83a : 0x7ab03a));
}
function stump(R, x, y, z) {
  // a beaver-chewed stump: hourglass point, pale chewed wood, chips around
  R.box(x, y, z, x + 1, y + 1, z + 1, 0x7a4a2a);
  R.set(x, y + 2, z, 0xe8c890); R.set(x + 1, y + 2, z + 1, 0xd8b078); R.set(x, y + 3, z + 1, 0xe8c890);
  for (const [dx, dz] of [[2, 0], [-1, 1], [1, 2], [-1, -1]]) R.set(x + dx, y, z + dz, 0xf0d8a0);
}
function logMesh(len = 9, r = 1.2, cap = 0xe8c890) {
  const v = new VoxelModel();
  for (let x = 0; x < len; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) {
    if (y * y + z * z > r * r + 0.6) continue;
    v.set(x, y, z, x === 0 || x === len - 1 ? (y === 0 && z === 0 ? 0xc89a62 : cap) : hash3(x, y, z, 3) < 0.25 ? 0x6a3e22 : (x + y) % 3 ? 0x7a4a2a : 0x8a5634);
  }
  return v;
}

// ------------------------------------------------------------------ dam: a stream becomes a wetland
// The stream runs from a hill at the back (z-) down a little fall, through a shallow meadow basin
// in the middle, over a low front bank where the beaver builds, and out at the front edge. Water
// levels are plane heights in VD units: a plane at L covers every column whose top (h + 1) is under L.
const sxDam = (z) => Math.round(Math.sin(z * 0.2 + 0.6) * 2.2);
const DAMZ = 9; // the dam line
const LV = { stream: 5.6, pond: 10.6, inflow: 13.5, down: 5.4 };
function damH(x, z) {
  const n = hash2(x >> 1, z >> 1, 3);
  const dx = x - sxDam(z), ad = Math.abs(dx);
  const bx = x / 19.5, bz = (z + 2) / 11.5;
  const ib = bx * bx + bz * bz;
  let h;
  if (ib < 1) h = 7 + Math.round(Math.max(0, ib - 0.7) * 9 + n * 0.7); // the meadow floor, 7..9
  else h = 11 + Math.round(Math.min(4, (ib - 1) * 5) + n * 1.2); // the rim, 11..15
  if (z < -13) h = Math.max(h, 13 + Math.round(n * 2)); // the hill at the back
  if (z >= DAMZ && ib >= 1) h = Math.min(h, 10 + Math.round(n)); // the low front bank (holds the pond)
  if (z >= -13) {
    if (ad <= 1.5) h = Math.min(h, 4); // stream bed
    else if (ad <= 2.6) h = Math.min(h, 5);
    else if (z > DAMZ + 1 && ad <= 4) h = Math.min(h, 7); // downstream banks
  } else if (ad <= 1.5) h = Math.min(h, 12); // the inflow ledge up on the hill
  return h;
}
class DamDemo extends Demo {
  constructor() {
    super('dam');
    const g = this.group;
    const R = new VoxelModel();
    buildTerrain(R, damH, (x, z, h) => {
      const ad = Math.abs(x - sxDam(z));
      if (h <= 5 && z >= -13) return hash2(x, z, 9) < 0.3 ? 0xc8b08a : 0xa89070; // stream bed: sand and pebbles
      if (z < -13 && ad <= 1.5) return 0x8a8078;
      if (hash2(x, z, 2) < 0.05) return pickC([0xffffff, 0xf2c230, 0xe86a9a], hash2(z, x, 3)); // flowers
      if (ad <= 3.6 && h <= 8) return pickC(DIRT, hash2(x, z, 5));
      return pickC(GRASS, hash2(x >> 1, z, 4));
    });
    // trees at the back and on the left; the front stays open for the camera
    for (const [x, z, h] of [[-22, -16, 13], [-16, -16, 10], [-9, -17, 12], [9, -17, 11], [16, -16, 10], [22, -15, 14], [-23, -6, 11], [23, -4, 9]]) pine(R, x, damH(x, z) + 1, z, h, x * 3 + z);
    for (const [x, z, h] of [[-20, 3, 8], [20, -9, 7], [-23, 12, 6]]) birch(R, x, damH(x, z) + 1, z, h);
    for (const [x, z] of [[-17, 14], [-21, 9], [-13, 15]]) stump(R, x, damH(x, z) + 1, z);
    const pileY = damH(-15, 12) + 1;
    for (const [dy, dz] of [[0, 0], [0, 2], [1, 1]]) for (let x = -18; x <= -12; x++) R.set(x, pileY + dy, 11 + dz, x === -18 || x === -12 ? 0xe8c890 : 0x7a4a2a);
    for (const [x, z] of [[-8, -9], [9, -5], [6, 13], [-10, 3], [12, -11]]) R.ellipsoid(x, damH(x, z) + 1, z, 1.4, 1, 1.2, (xx, yy, zz) => pickC(ROCK, hash3(xx, yy, zz, 1)));
    g.add(vmesh(R));
    // water planes
    const wplane = (x0, x1, z0, z1, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0 + 1) * VD, (z1 - z0 + 1) * VD), mats().water);
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1 + 1) / 2 * VD, y, (z0 + z1 + 1) / 2 * VD); m.renderOrder = 2;
      g.add(m); return m;
    };
    this.inflow = wplane(sxDam(-16) - 2, sxDam(-16) + 2, LZ0, -14, LV.inflow * VD);
    this.basin = wplane(-21, 20, -14, DAMZ, LV.stream * VD);
    this.down = wplane(-8, 8, DAMZ + 1, LZ1, LV.down * VD);
    this.fall = new THREE.Mesh(new THREE.PlaneGeometry(3 * VD, 1), mats().fall);
    this.fall.position.set((sxDam(-13.5) + 0.5) * VD, 0, -13.6 * VD); this.fall.renderOrder = 3;
    g.add(this.fall);
    this.level = LV.stream; this.levelGoal = LV.stream;
    // the dam: logs across the channel (they appear one by one), then mud packed in on top
    this.damLogs = [];
    const dcx = sxDam(DAMZ);
    this.dcx = dcx;
    const spots = [[dcx - 4, 4.6, DAMZ - 0.6, 0.05], [dcx - 4, 4.8, DAMZ + 0.8, -0.06], [dcx - 5, 6.4, DAMZ, 0.1], [dcx - 3, 7.8, DAMZ - 0.4, -0.08], [dcx - 4, 9, DAMZ + 0.4, 0.06]];
    for (const [x, y, z, rz] of spots) {
      const m = vmesh(logMesh(9, 1.3), mats().lit, { pivot: [0, 0, 0] });
      m.position.set(x * VD, (y + 1) * VD, z * VD); m.rotation.y = rz; m.visible = false;
      g.add(m); this.damLogs.push(m);
    }
    const mud = new VoxelModel();
    for (let x = dcx - 4; x <= dcx + 4; x++) for (let z = DAMZ - 1; z <= DAMZ + 1; z++) for (let y = 5; y <= 10; y++) {
      if (y > 9 && (x + z) % 2) continue;
      mud.set(x, y, z, hash3(x, y, z, 2) < 0.2 ? 0x8a5634 : hash3(x, y, z, 3) < 0.15 ? 0x5a8a3a : 0x6a4a30);
    }
    for (let x = dcx - 4; x <= dcx + 4; x += 2) mud.set(x, 11, DAMZ, 0x8a6a40); // sticks poking out
    this.mud = vmesh(mud); this.mud.visible = false; g.add(this.mud);
    // the beaver
    this.bv = new BeaverChibi({ outfit: 'overalls', seed: 7, shadows: true });
    this.bv.root.scale.setScalar(0.24);
    this.own(this.bv);
    g.add(this.bv.root);
    this.pile = new THREE.Vector3(-13.5 * VD, (pileY + 1) * VD, 14.5 * VD);
    this.damL = new THREE.Vector3((dcx - 6) * VD, 0, (DAMZ + 1.5) * VD);
    this.bvPos = this.pile.clone(); this.bvHead = 0;
    this.bv.play('idle', { loop: true, fade: 0 });
    // wetland life (pops in on 'wetland')
    this.life = [];
    const addLife = (obj, delay) => { obj.visible = false; g.add(obj); this.life.push({ obj, delay }); };
    const catt = (x, z) => {
      const v = new VoxelModel();
      for (let k = 0; k < 4; k++) { const ox = k % 2, oz = k >> 1; const hh = 6 + ((x + k) % 3); for (let y = 0; y < hh; y++) v.set(ox * 2, y, oz, y > hh - 3 ? 0x6a3a1a : 0x5a9a3a); v.set(ox * 2, hh, oz, 0x8ab04a); }
      for (let y = 0; y < 4; y++) { v.set(-1, y, 1, 0x7ac04a); v.set(3, y, -1, 0x6ab03a); }
      const m = vmesh(v); m.position.set(x * VD, (damH(x, z) + 1) * VD, z * VD); return m;
    };
    let dl = 0.2;
    for (const [x, z] of [[-16, -7], [-15, 1], [15, -6], [17, 0], [-9, -11], [8, -12], [-18, -3], [4, 6]]) addLife(catt(x, z), dl += 0.12);
    const lily = (x, z, flower) => {
      const v = new VoxelModel();
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { if (dx * dx + dz * dz > 5 || (dx === 1 && dz === 0) || (dx === 2 && dz === 0)) continue; v.set(dx, 0, dz, (dx + dz) % 3 ? 0x4a9a3a : 0x5aaa44); }
      if (flower) { v.set(0, 1, 0, 0xf6a8c4); v.set(-1, 1, 0, 0xffffff); v.set(0, 1, 1, 0xf6a8c4); v.set(0, 2, 0, 0xffe070); }
      const m = vmesh(v, mats().lit, { cast: false }); m.position.set(x * VD, (LV.pond + 0.05) * VD, z * VD); return m;
    };
    for (const [x, z, f] of [[-6, -4, true], [6, -7, false], [10, 0, true], [-3, -9, false], [-11, -1, false], [2, 2, true]]) addLife(lily(x, z, f), dl += 0.1);
    // a frog on a lily pad
    const fv = new VoxelModel();
    fv.box(-1, 0, -1, 1, 1, 1, 0x5ab040); fv.box(-1, 2, 0, 1, 2, 1, 0x6ac04a); fv.set(-1, 3, 1, 0xffffff); fv.set(1, 3, 1, 0xffffff); fv.set(-1, 3, 2, 0x1a1a1a); fv.set(1, 3, 2, 0x1a1a1a);
    fv.set(-2, 0, 1, 0x4a9a30); fv.set(2, 0, 1, 0x4a9a30); fv.set(0, 1, 2, 0xe8d890);
    this.frog = vmesh(fv); this.frog.position.set(-6 * VD, (LV.pond + 1) * VD, -4 * VD); this.frog.scale.setScalar(0.8);
    addLife(this.frog, dl += 0.2);
    // a mallard drake paddling across the new pond
    try {
      this.duck = new Duck({ sex: 'm', breed: 'mallard', shadows: false, fx: false });
      this.duck.root.scale.setScalar(0.3);
      this.duck.play?.('swim', { loop: true, fade: 0 });
      this.own(this.duck);
      addLife(this.duck.root, dl += 0.3);
    } catch { this.duck = null; }
    // fish in the pond
    this.pondFish = [];
    for (let i = 0; i < 3; i++) {
      const f = new DemoFish(fishModel(i === 1 ? 'pumpkinseed' : 'bluegill', { L: 9, H: 6, W: 3 }), 0.009);
      f.speed = 9; this.own(f); addLife(f.root, dl += 0.15);
      this.pondFish.push({ f, ph: i * 2.1 });
    }
    this.tag('dam', 'DAM', new THREE.Vector3((dcx + 9) * VD, 0.32, (DAMZ + 9) * VD), new THREE.Vector3((dcx + 2) * VD, 10.5 * VD, DAMZ * VD));
    this.tag('pond', 'NEW POND', new THREE.Vector3(-0.32, 0.46, 0.0), new THREE.Vector3(-5 * VD, 10.6 * VD, -3 * VD));
    this.tag('wetland', 'WETLAND', new THREE.Vector3(0.26, 0.48, -0.12), new THREE.Vector3(15 * VD, 10.6 * VD, -5 * VD));
    this.tag('stream', 'STREAM', new THREE.Vector3(0.18, 0.34, 0.06), new THREE.Vector3(sxDam(-4) * VD, 5.6 * VD, -4 * VD));
  }
  onBeat(b) {
    if (b === 'stream') {
      this.levelGoal = LV.stream; this.level = LV.stream; this.placed = 0;
      for (const m of this.damLogs) m.visible = false; this.mud.visible = false;
      for (const l of this.life) l.obj.visible = false;
      this.bvPos.copy(this.pile); this.trip = null;
    }
    if (b === 'build') { this.placed = this.placed || 0; this.trip = { phase: 'load', t: 0 }; }
    if (b === 'wetland') {
      for (let i = this.placed || 0; i < this.damLogs.length; i++) this.pop(this.damLogs[i], i * 0.05);
      this.placed = this.damLogs.length; if (!this.mud.visible) this.pop(this.mud, 0.2);
      this.levelGoal = LV.pond;
      for (const l of this.life) this.pop(l.obj, l.delay + 0.5, 0.4);
      this.trip = null;
    }
  }
  update(dt) {
    const t = this.t, b = this.beatName;
    // the beaver hauls logs: pile -> dam end -> drop (a log appears) -> back
    const bv = this.bv;
    let anim = 'idle';
    const tr = this.trip;
    const goto = (target, speed) => {
      const d = new THREE.Vector3(target.x - this.bvPos.x, 0, target.z - this.bvPos.z);
      const L = d.length();
      if (L < 0.01) return true;
      const st = Math.min(L, speed * dt);
      this.bvPos.x += d.x / L * st; this.bvPos.z += d.z / L * st;
      let a = Math.atan2(d.z, d.x) - this.bvHead; a = Math.atan2(Math.sin(a), Math.cos(a)); this.bvHead += a * Math.min(1, dt * 8);
      return false;
    };
    const N = this.damLogs.length;
    if (tr && b === 'build') {
      tr.t += dt;
      if (tr.phase === 'load') { anim = 'pickup'; if (tr.t > 0.45) { tr.phase = 'carry'; tr.t = 0; } }
      else if (tr.phase === 'carry') { anim = 'carry_log'; if (goto(this.damL, 0.3)) { tr.phase = 'drop'; tr.t = 0; } }
      else if (tr.phase === 'drop') {
        anim = 'idle';
        if (tr.t > 0.12 && !tr.dropped && this.placed < N) {
          tr.dropped = true;
          this.pop(this.damLogs[this.placed++], 0, 0.3);
          this.sfx?.('class_tap', { volume: 0.3, pitch: 0.7 });
          this.levelGoal = LV.stream + (LV.pond - LV.stream) * (this.placed / N) * 0.8;
          for (let k = 0; k < 3; k++) this.emit('bubble', new THREE.Vector3((this.dcx - 2 + k * 2) * VD, 6 * VD, (DAMZ + 1) * VD), { vel: [0, 0.08, 0], life: 0.5, texel: 0.003 });
        }
        if (tr.t > 0.45) { tr.phase = this.placed >= N ? 'done' : 'back'; tr.t = 0; tr.dropped = false; }
      } else if (tr.phase === 'back') { anim = 'walk'; if (goto(this.pile, 0.36)) { tr.phase = 'load'; tr.t = 0; } }
      else if (tr.phase === 'done') { anim = 'cheer'; if (!this.mud.visible) { this.pop(this.mud, 0, 0.4); this.levelGoal = LV.pond; this.sfx?.('class_pop', { volume: 0.3 }); } }
    } else if (b === 'wetland') {
      anim = (t % 7) < 5 ? 'sit' : 'cheer';
      goto(new THREE.Vector3((this.dcx - 7) * VD, 0, (DAMZ + 3) * VD), 0.3);
    } else {
      anim = (t % 6) < 4 ? 'idle' : 'stretch';
      goto(this.pile, 0.3);
    }
    if (bv.current !== anim) bv.play(anim, { loop: anim !== 'pickup', fade: 0.15 });
    const gx = Math.round(this.bvPos.x / VD), gz = Math.round(this.bvPos.z / VD);
    this.bvPos.y += ((damH(gx, gz) + 1) * VD - this.bvPos.y) * Math.min(1, dt * 10);
    bv.root.position.copy(this.bvPos);
    bv.root.rotation.y = Math.PI / 2 - this.bvHead;
    bv.update(dt);
    // the water rises behind the dam; the fall gets shorter
    this.level += (this.levelGoal - this.level) * Math.min(1, dt * 0.9);
    this.basin.position.y = this.level * VD;
    const top = LV.inflow * VD, bot = this.level * VD;
    this.fall.scale.y = Math.max(0.001, top - bot); this.fall.position.y = (top + bot) / 2;
    this.fall.material.opacity = 0.55 + Math.sin(t * 20) * 0.08;
    if (Math.random() < dt * 6) this.emit('bubble', new THREE.Vector3(sxDam(-13) * VD + (Math.random() - 0.3) * 0.06, bot + 0.004, -12.8 * VD + Math.random() * 0.03), { vel: [0, 0.02, 0.03], life: 0.6, texel: 0.0025 });
    // wetland life
    if (b === 'wetland') {
      const k = this.bt;
      if (this.duck) { const a = k * 0.35; this.duck.root.position.set(Math.cos(a) * 0.2, LV.pond * VD, -0.05 + Math.sin(a) * 0.1); this.duck.root.rotation.y = -a; this.duck.update?.(dt); }
      for (const p of this.pondFish) { const a = t * 0.7 + p.ph; p.f.root.position.set(Math.cos(a) * 0.15, 9.4 * VD, -0.05 + Math.sin(a * 1.3) * 0.07); p.f.heading = a + Math.PI / 2; p.f.update(dt); }
      this.frog.position.y = (LV.pond + 0.5) * VD + Math.max(0, Math.sin(t * 2.2)) * 0.01;
      if (Math.random() < dt * 1.5) this.emit('spark', new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.36 + Math.random() * 0.1, -0.05 + (Math.random() - 0.5) * 0.3), { vel: [(Math.random() - 0.5) * 0.3, 0.02, (Math.random() - 0.5) * 0.2], life: 0.8, texel: 0.0025 });
      if (Math.random() < dt * 0.6) this.emit('note', new THREE.Vector3(-6 * VD, (LV.pond + 3) * VD, -4 * VD), { vel: [0.01, 0.06, 0], life: 1.2, texel: 0.0035 });
    }
  }
}

// ------------------------------------------------------------------ bears: the mountain, the trail, the pond
const PEAK = [-14, -10], POND = [11, 7, 7.5];
function bearH(x, z) {
  const n = hash2(x >> 1, z >> 1, 11);
  const r = Math.hypot(x - PEAK[0], (z - PEAK[1]) * 1.15);
  let h = 6 + Math.round(16 * Math.pow(Math.max(0, 1 - r / 19), 1.25) + n * 1.2);
  if (r < 4.5) h = 21; // the office lot
  const pr = Math.hypot(x - POND[0], (z - POND[1]) * 1.1);
  if (pr < POND[2]) h = Math.min(h, pr < POND[2] - 2 ? 3 : 5);
  else if (pr < POND[2] + 1.5) h = Math.min(h, 6);
  return h;
}
// switchbacks from the office door down to Reynard's dock
const TRAIL = [[-14, -5], [-5, -7], [-15, -1], [-4, 1], [-9, 6], [2, 6], [5, 5]];
class BearsDemo extends Demo {
  constructor() {
    super('bears');
    const g = this.group;
    // trail mask
    const onTrail = (x, z) => {
      for (let i = 0; i < TRAIL.length - 1; i++) {
        const [ax, az] = TRAIL[i], [bx, bz] = TRAIL[i + 1];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
        const k = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
        if (Math.hypot(x - (ax + dx * k), z - (az + dz * k)) < 1.3) return true;
      }
      return false;
    };
    const R = new VoxelModel();
    buildTerrain(R, bearH, (x, z, h) => {
      if (h <= 5) return hash2(x, z, 2) < 0.3 ? 0xc8b08a : 0xa89070;
      if (h === 21 && Math.hypot(x - PEAK[0], z - PEAK[1]) < 4.5) return (x + z) % 4 === 0 ? 0x6a6a72 : 0x7a7a84; // parking lot
      if (onTrail(x, z)) return pickC([0xb88a5a, 0xa87a4a, 0xc89a68], hash2(x, z, 6));
      if (h >= 17) return hash2(x, z, 8) < 0.35 ? pickC(ROCK, hash2(z, x, 1)) : 0xe8eef4; // snowy rocky top
      if (h >= 14) return pickC([0x5a9a4a, 0x6aa050, 0x8a8a84], hash2(x, z, 3));
      if (hash2(x, z, 2) < 0.04) return pickC([0xffffff, 0xf2c230, 0xd85a9a], hash2(z, x, 3));
      return pickC(GRASS, hash2(x >> 1, z, 4));
    });
    // Bear St. Holdings: a little glass tower on the summit
    const ox = PEAK[0], oz = PEAK[1], oy = 22;
    for (let y = oy; y < oy + 13; y++) for (let x = ox - 3; x <= ox + 3; x++) for (let z = oz - 3; z <= oz + 2; z++) {
      const edge = Math.abs(x - ox) === 3 || z === oz - 3 || z === oz + 2;
      if (!edge) continue;
      const win = (y - oy) % 3 !== 0 && Math.abs(x - ox) !== 3 && (x - ox) % 2 !== 0;
      R.set(x, y, z, y === oy + 12 ? 0x4a4a56 : win ? ((x * 7 + y * 3) % 5 === 0 ? 0xffe08a : 0x6aa0d0) : 0xb8bcc8);
    }
    R.box(ox - 1, oy, oz + 2, ox + 1, oy + 2, oz + 2, 0x3a2a1a); // doors
    R.box(ox - 2, oy + 13, oz - 1, ox + 2, oy + 13, oz - 1, 0xd8302a); // the red sign
    R.set(ox, oy + 14, oz - 1, 0xd8302a); R.set(ox + 3, oy + 15, oz - 2, 0x8a8a96); R.set(ox + 3, oy + 16, oz - 2, 0xff4040); // antenna
    // pines on the slopes, a berry bush and a beehive tree near the pond, Reynard's dock + sign
    for (const [x, z, h] of [[-23, -15, 10], [-21, -4, 9], [-7, -15, 9], [-2, -12, 8], [-24, 6, 9], [-18, 12, 8], [22, -15, 10], [24, -6, 8]]) pine(R, x, bearH(x, z) + 1, z, h, x * 5 + z);
    const bush = (x, z) => { const y = bearH(x, z) + 1; R.ellipsoid(x, y + 1, z, 2.4, 1.8, 2.2, (xx, yy, zz) => (hash3(xx, yy, zz, 4) < 0.22 ? 0x3a4ac8 : hash3(xx, yy, zz, 5) < 0.1 ? 0x6a7ae8 : 0x3a8a3a)); };
    bush(19, -5); bush(21, -2);
    birch(R, 21, bearH(21, -11) + 1, -11, 8);
    R.ellipsoid(19.5, bearH(21, -11) + 7, -11, 1.3, 1.8, 1.3, (xx, yy) => ((yy % 2) ? 0xf0c030 : 0xb88a20)); // beehive
    for (let x = 1; x <= 6; x++) R.set(x, 6, 7, 0x9a6a3a); R.set(1, 5, 7, 0x6a4428); R.set(6, 5, 7, 0x6a4428); // dock
    g.add(vmesh(R));
    // Reynard's pond sign (a separate mesh: it gets knocked over in a rampage): a post, a board, a painted fish
    {
      const sv = new VoxelModel();
      for (let y = 0; y < 5; y++) sv.set(0, y, 0, 0x6a4428);
      for (let x = -3; x <= 3; x++) for (let y = 4; y <= 7; y++) sv.set(x, y, 0, x === -3 || x === 3 || y === 4 || y === 7 ? 0x8a5430 : 0xf0e0b0);
      for (const [x, y] of [[-1, 5], [0, 5], [1, 5], [-1, 6], [0, 6], [1, 6], [-2, 5], [-2, 6]]) sv.set(x, y, 1, x === -2 ? 0x3a6ab8 : 0x5a8ad8);
      sv.set(2, 5, 1, 0x3a6ab8); sv.set(2, 6, 1, 0x3a6ab8); sv.set(1, 6, 1, 0x1a1a1a);
      this.sign = vmesh(sv, mats().lit, { pivot: [0, 0, 0.5] });
      this.sign.position.set(-1 * VD, (bearH(-1, 9) + 1) * VD, 9.5 * VD);
      this.sign.rotation.y = 0.35;
      g.add(this.sign);
    }
    this.pond = new THREE.Mesh(new THREE.CircleGeometry(POND[2] * VD, 20), mats().water);
    this.pond.rotation.x = -Math.PI / 2; this.pond.scale.y = 1 / 1.1; this.pond.position.set((POND[0] + 0.5) * VD, 5.5 * VD, (POND[1] + 0.5) * VD); this.pond.renderOrder = 2;
    g.add(this.pond);
    // the pond's fish (bears eat them; on 'rampage' there are none left)
    this.fish = [];
    for (let i = 0; i < 4; i++) { const f = new DemoFish(fishModel(['bluegill', 'goldfish', 'pumpkinseed', 'bluegill'][i] || 'bluegill', { L: 9, H: 6, W: 3, golden: i === 1 }), 0.0085); f.speed = 9; this.own(f); g.add(f.root); this.fish.push({ f, ph: i * 1.6 }); }
    // the bears
    this.bears = [];
    const kinds = ['office', 'construction', 'office'];
    kinds.forEach((type, i) => {
      try {
        const T = BEAR_TYPES[type] ? type : 'office';
        const def0 = BEAR_TYPES[T];
        const look = makeBearLook(T, def0, 1234 + i * 77);
        const rig = new BearRig(T, lookDef(def0, look));
        try { rig.personalize?.((1234 + i * 77) * 7.31); } catch { /* */ }
        rig.root.scale.setScalar(0.072);
        g.add(rig.root);
        this.own({ dispose: () => rig.dispose() });
        this.bears.push({ rig, i, pos: new THREE.Vector3(), head: 0, pose: 'idle', seg: 0, k: 0, delay: i * 0.9, done: false });
      } catch (e) { console.warn('[class demo] bear', e); }
    });
    this.trailW = TRAIL.map(([x, z]) => new THREE.Vector3(x * VD, 0, z * VD));
    this.spots = { berry: new THREE.Vector3(17 * VD, 0, -3 * VD), honey: new THREE.Vector3(19 * VD, 0, -9 * VD), fish: new THREE.Vector3(10 * VD, 0, 6 * VD) };
    this.tag('office', 'BEAR ST.', new THREE.Vector3((ox - 6) * VD, 0.92, (oz + 1) * VD), new THREE.Vector3(ox * VD, (oy + 10) * VD, oz * VD));
    this.tag('berries', 'BERRIES', new THREE.Vector3(0.38, 0.36, -0.1), new THREE.Vector3(19 * VD, 9 * VD, -5 * VD));
    this.tag('honey', 'HONEY', new THREE.Vector3(0.3, 0.5, -0.32), new THREE.Vector3(19.5 * VD, (bearH(21, -11) + 8) * VD, -11 * VD));
    this.tag('fish', 'FISH', new THREE.Vector3(0.12, 0.3, 0.4), new THREE.Vector3(11 * VD, 6 * VD, 7 * VD));
    this._v = new THREE.Vector3();
  }
  groundY(p) { return (bearH(Math.round(p.x / VD), Math.round(p.z / VD)) + 1) * VD; }
  onBeat(b) {
    for (const B of this.bears) {
      B.done = false; B.t = 0;
      if (b === 'rush') { B.seg = 0; B.pos.copy(this.trailW[0]); B.pos.x += (B.i - 1) * 0.03; B.inWater = false; }
      if (b === 'omnivore' || b === 'rampage' || b === 'happy') {
        const target = b === 'omnivore' ? [this.spots.fish, this.spots.berry, this.spots.honey][B.i] : this.spots.fish.clone().add(new THREE.Vector3((B.i - 1) * 0.12, 0, (B.i % 2) * 0.1 - 0.12));
        if (B.pos.lengthSq() === 0) B.pos.copy(target);
        B.target = target.clone(); B.inWater = false;
      }
    }
    for (const F of this.fish) F.f.root.visible = b !== 'rampage';
    this.signFall = b === 'rampage' ? 0 : null;
    if (b !== 'rampage') this.sign.rotation.set(0, 0.35, 0);
  }
  update(dt) {
    const t = this.t, b = this.beatName || 'rush';
    // a rampage knocks the pond sign flat
    if (this.signFall != null) {
      this.signFall = Math.min(1, this.signFall + dt * (this.bt > 1.2 ? 1.6 : 0));
      const k = this.signFall;
      this.sign.rotation.set(0, 0.35, -Math.min(1.45, k * k * 1.5));
      if (k > 0.98 && !this._thud) { this._thud = true; this.sfx?.('class_rumble', { volume: 0.3 }); for (let i = 0; i < 4; i++) this.emit('bubble', this.sign.position.clone().add(new THREE.Vector3(0.08, 0.01, 0)), { vel: [(Math.random() - 0.5) * 0.1, 0.06, (Math.random() - 0.5) * 0.1], life: 0.5, texel: 0.003 }); }
    } else this._thud = false;
    for (const F of this.fish) {
      if (!F.f.root.visible) continue;
      const a = t * 0.6 + F.ph;
      F.f.root.position.set((POND[0] + Math.cos(a) * 4) * VD, 4.4 * VD, (POND[1] + Math.sin(a) * 3.2) * VD);
      F.f.heading = a + Math.PI / 2; F.f.update(dt);
    }
    for (const B of this.bears) {
      B.t += dt;
      let pose = 'idle', speed = 0;
      const moveTo = (target, spd) => {
        const d = this._v.set(target.x - B.pos.x, 0, target.z - B.pos.z);
        const L = d.length();
        if (L < 0.012) return true;
        const st = Math.min(L, spd * dt);
        B.pos.x += d.x / L * st; B.pos.z += d.z / L * st;
        let a = Math.atan2(d.z, d.x) - B.head; a = Math.atan2(Math.sin(a), Math.cos(a)); B.head += a * Math.min(1, dt * 10);
        return false;
      };
      if (b === 'rush') {
        if (B.t < B.delay) { pose = 'idle'; B.pos.copy(this.trailW[0]); }
        else if (B.seg < this.trailW.length - 1) {
          pose = 'run'; speed = 0.36;
          if (moveTo(this.trailW[B.seg + 1], speed)) B.seg++;
        } else if (!B.done) {
          // the cannonball
          B.jt = (B.jt || 0) + dt;
          pose = 'cannonball';
          const k = Math.min(1, B.jt / 0.7);
          moveTo(new THREE.Vector3((POND[0] - 1 + B.i * 2) * VD, 0, (POND[1] - 1 + B.i) * VD), 0.3);
          B.lift = Math.sin(k * Math.PI) * 0.09;
          if (k >= 1) {
            B.done = true; B.jt = 0; B.lift = 0; B.inWater = true;
            for (let s = 0; s < 8; s++) this.emit('bubble', B.pos.clone().setY(5.6 * VD), { vel: [(Math.random() - 0.5) * 0.25, 0.2 + Math.random() * 0.1, (Math.random() - 0.5) * 0.25], life: 0.7, gravity: 0.6, texel: 0.004 });
            this.sfx?.('splash', { volume: 0.25, pitch: 1.5 });
          }
        } else { pose = 'swim'; }
      } else if (b === 'omnivore') {
        if (moveTo(B.target, 0.3)) { pose = B.i === 0 ? 'eat_gulp' : B.i === 1 ? 'eat_crunch' : 'eat_slurp'; B.inWater = B.i === 0; }
        else pose = 'walk', speed = 0.3;
        if (B.i === 1 && Math.random() < dt * 1.2) this.emit('note', B.pos.clone().setY(B.pos.y + 0.22), { vel: [0, 0.06, 0], life: 0.9, texel: 0.003 });
      } else if (b === 'rampage') {
        if (moveTo(B.target, 0.35)) pose = (Math.floor(B.t / 1.6) + B.i) % 2 ? 'smash' : 'angry_stomp';
        else pose = 'run', speed = 0.35;
        if (Math.random() < dt * 2.2) this.emit('anger', B.pos.clone().setY(B.pos.y + 0.24), { vel: [0, 0.05, 0], life: 0.7, texel: 0.004 });
        B.rig.setFace?.('angry', { hold: 1 });
      } else if (b === 'happy') {
        if (moveTo(B.target, 0.3)) pose = (Math.floor(B.t / 2) + B.i) % 2 ? 'yummy' : 'pay';
        else pose = 'walk', speed = 0.3;
        if (Math.random() < dt * 1.4) this.emit(Math.random() < 0.5 ? 'coin' : 'star', B.pos.clone().setY(B.pos.y + 0.24), { vel: [(Math.random() - 0.5) * 0.06, 0.1, 0], life: 1, texel: 0.0035 });
        B.rig.setFace?.('happy', { hold: 1 });
      }
      const gy = B.inWater ? 4.2 * VD : this.groundY(B.pos);
      B.y = B.y == null ? gy : B.y + (gy - B.y) * Math.min(1, dt * 12);
      B.rig.root.position.set(B.pos.x, B.y + (B.lift || 0), B.pos.z);
      B.rig.root.rotation.set(0, Math.PI / 2 - B.head, 0);
      try { B.rig.pose(pose, dt, { speed: speed * 6, inWater: !!B.inWater }); B.rig.update?.(dt); } catch { /* ignore */ }
    }
  }
}

// ================================================================== the manager
const MAKE = { fishParts: () => new FishPartsDemo(), nursery: () => new NurseryDemo(), dam: () => new DamDemo(), bears: () => new BearsDemo() };
// show3d ids -> (demo, default beat)
export const SHOW3D = {
  fishParts: ['fishParts', 'look'], gills: ['fishParts', 'gills'], bladder: ['fishParts', 'bladder'],
  courtship: ['nursery', 'date'], spawn: ['nursery', 'lay'], guard: ['nursery', 'guard'], develop: ['nursery', 'develop'], hatch: ['nursery', 'hatch'], cold: ['nursery', 'cold'],
  stream: ['dam', 'stream'], dam: ['dam', 'build'], wetland: ['dam', 'wetland'],
  bears: ['bears', 'rush'], omnivore: ['bears', 'omnivore'], rampage: ['bears', 'rampage'], happyBears: ['bears', 'happy'],
};

export class ClassDemos {
  constructor(parent, at) {
    this.root = new THREE.Group();
    this.root.name = 'classDemos';
    this.root.position.copy(at);
    parent.add(this.root);
    this.cache = new Map();
    this.cur = null;
    this.sfx = null;
  }
  /** show3d id (see SHOW3D) or [demo, beat]; returns the demo */
  show(id, beat) {
    const [name, def] = SHOW3D[id] || [id, null];
    let d = this.cache.get(name);
    if (!d) {
      const make = MAKE[name];
      if (!make) { console.warn('[class demo] unknown', id); return null; }
      try { d = make(); } catch (e) { console.warn('[class demo] build failed', name, e); return null; }
      d.sfx = (n, o) => this.sfx?.(n, o);
      this.cache.set(name, d);
    }
    if (this.cur !== d) {
      if (this.cur) this.cur.group.removeFromParent();
      this.root.add(d.group);
      this.cur = d;
      d.group.scale.setScalar(0.0001);
      this._in = 0; // the diorama pops onto the table
      this.sfx?.('class_whoosh', { volume: 0.35, pitch: 0.9 });
    }
    d.beat(beat || def || 'look');
    return d;
  }
  labels(keys) { this.cur?.showTags(keys || []); }
  hide() { if (this.cur) { this.cur.group.removeFromParent(); this.cur = null; } }
  update(dt, camera) {
    const d = this.cur;
    if (!d) return;
    if (this._in != null) {
      this._in += dt;
      const k = back(this._in / 0.45);
      d.group.scale.setScalar(Math.max(0.0001, k));
      if (this._in >= 0.45) { d.group.scale.setScalar(1); this._in = null; }
    }
    d.tick(dt, camera);
  }
  dispose() {
    for (const d of this.cache.values()) d.dispose();
    this.cache.clear(); this.cur = null;
    this.root.removeFromParent();
  }
}
