// A single camera-facing fish sprite as a normal Object3D, so bears (and
// the fox) can hold a fish in their paws. Shares the fish atlas texture.
import * as THREE from 'three';
import { FISH_TPU } from './fishSprites.js';

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export function makeFishQuad(game, f, { frame = 4, scale = 1 } = {}) {
  const fs = game.fish;
  const fr = fs.atlas.frame(f.sp.id, f.g?.morph || 'normal', frame, false);
  const img = fs.tex.image;
  const tex = fs.tex.clone();
  tex.repeat.set(fr.w / img.width, fr.h / img.height);
  tex.offset.set(fr.x / img.width, 1 - (fr.y + fr.h) / img.height);
  tex.needsUpdate = true;
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  const size = (f.g?.size || 1) * (f.adult === false ? 0.6 : 1) * scale;
  const w = (fr.w / FISH_TPU) * size, h = (fr.h / FISH_TPU) * size;
  const geo = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.userData.fish = { id: f.sp.id, morph: f.g?.morph, size: f.sp.size, w, h };
  mesh.userData.wiggle = 0;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    // keep the parent's position but face the camera (billboard)
    mesh.matrixWorld.decompose(_p, _q, _s);
    const wig = Math.sin(performance.now() / 70) * 0.35 * (mesh.userData.wiggle || 1);
    _q.copy(camera.quaternion);
    _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), wig + (mesh.userData.tilt || 0)));
    mesh.matrixWorld.compose(_p, _q, _s);
  };
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); tex.dispose(); };
  return mesh;
}
