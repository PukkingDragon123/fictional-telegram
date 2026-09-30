// Reynard the fox, beaver builders, loons and Canada geese.
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../core/voxel.js';

const OR = 0xe0662a, OR_D = 0xb84a1e, OR_L = 0xf28a3c, CREAM = 0xf6ead8, BLK = 0x1a1420;

// ---------------------------------------------------------------- fox
function foxTorso() {
  const v = new VoxelModel();
  // body y 0..5 (waistcoat), x -3..3, z -2..2
  for (let y = 0; y <= 5; y++)
    for (let x = -3; x <= 3; x++)
      for (let z = -2; z <= 2; z++) {
        if (Math.abs(x) === 3 && Math.abs(z) === 2) continue;
        let c = 0x5a2a6a; // purple waistcoat
        if (z === 2 && Math.abs(x) <= 1 && y >= 2) c = CREAM; // chest fluff
        if (y === 0) c = 0x3a1a4a;
        v.set(x, y, z, c);
      }
  v.set(-2, 3, 3, 0xe8c040); v.set(2, 1, 3, 0xe8c040); // gold watch chain
  v.set(-1, 2, 3, 0xe8c040); v.set(0, 2, 3, 0xe8c040); v.set(1, 1, 3, 0xe8c040);
  // bow tie
  v.set(-1, 5, 3, 0xd8302a); v.set(1, 5, 3, 0xd8302a); v.set(0, 5, 3, 0xa01e1a);
  // head y 6..11, pointy
  for (let y = 6; y <= 11; y++)
    for (let x = -3; x <= 3; x++)
      for (let z = -2; z <= 3; z++) {
        if ((Math.abs(x) === 3 && (z === -2 || z === 3)) || (y === 11 && Math.abs(x) === 3)) continue;
        let c = OR;
        if (y <= 7 && z >= 2 && Math.abs(x) <= 2) c = CREAM; // cheeks
        v.set(x, y, z, c);
      }
  // snout
  for (let x = -1; x <= 1; x++) { v.set(x, 7, 4, CREAM); v.set(x, 8, 4, OR_L); v.set(x, 7, 5, CREAM); }
  v.set(0, 8, 5, OR_L); v.set(0, 8, 6, BLK); v.set(0, 7, 6, CREAM);
  // sly eyes (half-lidded) + monocle
  v.set(-2, 9, 4, 0xf2c230); v.set(-1, 9, 4, BLK); v.set(-2, 10, 4, OR_D); v.set(-1, 10, 4, OR_D);
  v.set(2, 9, 4, 0xf2c230); v.set(1, 9, 4, BLK); v.set(2, 10, 4, OR_D); v.set(1, 10, 4, OR_D);
  for (const [dx, dy] of [[0, -1], [0, 2], [-1, 0], [2, 0], [-1, 1], [2, 1]]) v.set(1 + dx, 9 + dy, 5, 0xe8c040);
  v.set(3, 8, 4, 0xe8c040); v.set(3, 7, 3, 0xe8c040);
  // grin
  v.set(-1, 6, 4, BLK); v.set(0, 6, 5, BLK); v.set(1, 6, 4, BLK); v.set(1, 5, 4, 0xffffff);
  // ears
  for (const sx of [-1, 1]) {
    v.box(sx * 2, 12, 0, sx * 3, 12, 1, OR);
    v.set(sx * 2, 13, 0, OR); v.set(sx * 3, 13, 1, BLK); v.set(sx * 2, 14, 0, BLK);
    v.set(sx * 2, 12, 2, CREAM);
  }
  // top hat
  for (let x = -3; x <= 2; x++) for (let z = -2; z <= 3; z++) v.set(x, 12, z, 0x151518);
  for (let y = 13; y <= 16; y++) for (let x = -2; x <= 1; x++) for (let z = -1; z <= 2; z++) v.set(x, y, z, y === 13 ? 0xe8c040 : 0x151518);
  // bushy tail (behind, -z)
  for (let i = 0; i < 8; i++) {
    const y = 1 + Math.round(i * 0.6), z = -3 - i;
    const r = i < 2 ? 1 : i < 6 ? 2 : 1;
    for (let x = -r; x <= r; x++) for (let dy = -r; dy <= r; dy++) {
      if (Math.abs(x) + Math.abs(dy) > r + 1) continue;
      v.set(x, y + dy, z, i >= 6 ? CREAM : (x + dy) % 3 === 0 ? OR_D : OR);
    }
  }
  return v;
}
function foxArm() {
  const v = new VoxelModel();
  for (let y = -4; y <= 0; y++) v.box(0, y, 0, 0, y, 0, y <= -3 ? BLK : 0x5a2a6a);
  v.set(0, -1, 0, 0xffffff);
  return v;
}
function foxLeg() {
  const v = new VoxelModel();
  for (let y = -3; y <= -1; y++) v.box(0, y, 0, 1, y, 1, y === -3 ? BLK : 0x3a1a4a);
  v.set(0, -3, 2, BLK); v.set(1, -3, 2, BLK);
  return v;
}

export class FoxRig {
  constructor() {
    const mat = voxelMaterial();
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const mk = (geo, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.position.set(x, y, z); parent.add(m); return m; };
    const t = foxTorso().build({ pivot: [0.5, 0, 0.5] });
    const a = foxArm().build({ pivot: [0.5, 1, 0.5] });
    const l = foxLeg().build({ pivot: [1, 0, 1] });
    this.torso = mk(t, this.body, 0, 0.3, 0);
    this.armL = mk(a, this.body, -0.38, 0.85, 0);
    this.armR = mk(a, this.body, 0.38, 0.85, 0);
    this.legL = mk(l, this.root, -0.14, 0.3, 0);
    this.legR = mk(l, this.root, 0.14, 0.3, 0);
    this.root.scale.setScalar(0.72);
  }
}

// ---------------------------------------------------------------- beaver
function beaverBody() {
  const v = new VoxelModel();
  const BR = 0x7a4a26, BR_D = 0x5a3418, BR_L = 0xa06a3a;
  v.ellipsoid(0, 3, 0, 3, 3, 3.5, (x, y, z) => (y < 1 ? null : z > 2 && y < 4 ? BR_L : BR));
  // head
  v.ellipsoid(0, 6, 2.5, 2.4, 2, 2.2, BR);
  v.set(-1, 7, 4, BLK); v.set(1, 7, 4, BLK);
  v.box(-1, 5, 4, 1, 6, 5, BR_L);
  v.set(0, 6, 6, BLK);
  v.set(0, 4, 5, 0xfff4e0); v.set(-1, 4, 5, 0xf0a030); v.set(1, 4, 5, 0xf0a030); // big teeth
  v.set(0, 4, 5, 0xf0a030);
  v.set(-2, 8, 2, BR_D); v.set(2, 8, 2, BR_D);
  // hard hat
  v.ellipsoid(0, 8.4, 2.3, 2.6, 1.2, 2.5, (x, y) => (y < 8 ? null : 0xf2c230));
  v.box(-2, 8, 5, 2, 8, 5, 0xf2c230);
  // feet
  v.box(-2, 0, 1, -1, 0, 3, BR_D); v.box(1, 0, 1, 2, 0, 3, BR_D);
  return v;
}
function beaverTail() {
  const v = new VoxelModel();
  for (let z = -6; z <= 0; z++) {
    const w = z < -1 ? 2 : 1;
    for (let x = -w; x <= w; x++) v.set(x, 0, z, (x + z) % 2 === 0 ? 0x3a2a1e : 0x4a3626);
  }
  return v;
}

export class BeaverRig {
  constructor() {
    const mat = voxelMaterial();
    this.root = new THREE.Group();
    this.body = new THREE.Mesh(beaverBody().build({ pivot: [0.5, 0, 0.5] }), mat);
    this.body.castShadow = true;
    this.tail = new THREE.Mesh(beaverTail().build({ pivot: [0.5, 0.5, 1] }), mat);
    this.tail.position.set(0, 0.15, -0.3);
    this.tail.castShadow = true;
    this.root.add(this.body, this.tail);
    this.root.scale.setScalar(0.95);
  }
}

// ---------------------------------------------------------------- loon & goose
export function loonGeometry() {
  const v = new VoxelModel();
  // body along +x
  v.ellipsoid(0, 1, 0, 4, 1.6, 2, (x, y, z) => {
    if (y > 1) return (x + z) % 2 === 0 ? 0xffffff : 0x151515; // checkered back
    return y < 0 ? 0xf0f0f0 : 0x1a1a1a;
  });
  v.box(3, 2, 0, 4, 4, 0, 0x121212);
  v.box(4, 4, 0, 5, 5, 0, 0x121a18);
  v.set(6, 4, 0, 0x2a2a2a); v.set(7, 4, 0, 0x2a2a2a);
  v.set(5, 5, 1, 0xd02020); v.set(5, 5, -1, 0xd02020); // red eyes
  v.set(4, 3, 1, 0xffffff); v.set(4, 3, -1, 0xffffff); // necklace
  v.set(-4, 1, 0, 0x1a1a1a);
  return v.build({ pivot: [0.5, 0.5, 0.5] });
}

export function gooseGeometry(wingUp = true) {
  const v = new VoxelModel();
  v.ellipsoid(0, 0, 0, 3.5, 1.3, 1.4, (x, y) => (y < 0 ? 0xd8d0c0 : 0x7a6a58));
  v.box(3, 0, 0, 6, 0, 0, 0x151515);
  v.set(7, 0, 0, 0x151515); v.set(7, 0, 1, 0xffffff); v.set(7, 0, -1, 0xffffff); v.set(8, 0, 0, 0x151515);
  v.set(-4, 0, 0, 0x151515);
  const wy = wingUp ? 1 : -1;
  for (let z = 1; z <= 5; z++) for (let x = -1; x <= 1; x++) { v.set(x, z > 2 ? wy : 0, z, 0x5a4a3a); v.set(x, z > 2 ? wy : 0, -z, 0x5a4a3a); }
  return v.build({ pivot: [0.5, 0.5, 0.5] });
}
