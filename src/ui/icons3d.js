// Renders voxel models into small pixel-art icons (data URLs) using the main
// WebGL renderer, with a crisp 1px dark outline. Cached per key.
import * as THREE from 'three';
import { fishIconURL } from '../game/fishSprites.js';
import { BearRig } from '../entities/bearRig.js';
import { BEAR_TYPES } from '../data/bears.js';
import { voxelMaterial } from '../core/voxel.js';

export class Icons3D {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
    this.scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 2.3);
    sun.position.set(2, 5, 4);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x6a6a50, 1.25));
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.rts = new Map();
    this.box = new THREE.Box3();
  }

  rt(size) {
    let rt = this.rts.get(size);
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      this.rts.set(size, rt);
    }
    return rt;
  }

  renderObject(key, obj, { size = 40, yaw = -0.6, pitch = 0.45, pad = 1.08, outline = '#1a1420' } = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    const r = this.renderer.renderer;
    const scene = this.scene;
    scene.add(obj);
    obj.updateMatrixWorld(true);
    this.box.setFromObject(obj);
    const c = this.box.getCenter(new THREE.Vector3());
    const s = this.box.getSize(new THREE.Vector3());
    const cam = this.cam;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const radius = s.length() * 0.5;
    cam.position.copy(c).addScaledVector(dir, radius * 4 + 5);
    cam.lookAt(c);
    cam.updateMatrixWorld(true);
    // fit: project box corners in view space
    const inv = cam.matrixWorldInverse;
    let mx = 0, my = 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? this.box.max.x : this.box.min.x, i & 2 ? this.box.max.y : this.box.min.y, i & 4 ? this.box.max.z : this.box.min.z).applyMatrix4(inv);
      mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y));
    }
    const ext = Math.max(mx, my) * pad;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
    cam.near = 0.1; cam.far = radius * 10 + 20;
    cam.updateProjectionMatrix();
    const rt = this.rt(size);
    const prevRT = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevShadow = r.shadowMap.enabled;
    r.shadowMap.enabled = false;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    r.readRenderTargetPixels(rt, 0, 0, size, size, px);
    r.setRenderTarget(prevRT);
    r.setClearColor(prevClear, prevAlpha);
    r.shadowMap.enabled = prevShadow;
    scene.remove(obj);
    // flip + outline
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const img = ctx.createImageData(size, size);
    const A = (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : px[((size - 1 - y) * size + x) * 4 + 3]);
    const oc = new THREE.Color(outline);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const si = ((size - 1 - y) * size + x) * 4, di = (y * size + x) * 4;
        if (px[si + 3] > 40) {
          img.data[di] = px[si]; img.data[di + 1] = px[si + 1]; img.data[di + 2] = px[si + 2]; img.data[di + 3] = 255;
        } else if (A(x - 1, y) > 40 || A(x + 1, y) > 40 || A(x, y - 1) > 40 || A(x, y + 1) > 40) {
          img.data[di] = oc.r * 255; img.data[di + 1] = oc.g * 255; img.data[di + 2] = oc.b * 255; img.data[di + 3] = 255;
        }
      }
    ctx.putImageData(img, 0, 0);
    const url = cv.toDataURL();
    this.cache.set(key, url);
    return url;
  }

  fish(sp, golden = false) {
    return fishIconURL(sp.id, { morph: golden ? 'golden' : 'normal', scale: 2 });
  }

  structure(type, structures) {
    const key = `st:${type}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const obj = structures.previewObject(type);
    obj.traverse((o) => { if (o.isMesh && o.material?.isMeshBasicMaterial && !o.material.vertexColors) o.material = voxelMaterial(); });
    return this.renderObject(key, obj, { size: 44, yaw: -0.7, pitch: 0.55 });
  }

  bear(typeId, full = false) {
    const key = `bear:${typeId}:${full ? 1 : 0}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const rig = new BearRig(typeId, BEAR_TYPES[typeId]);
    if (!full) rig.setLegsVisible?.(false);
    rig.setFace?.('happy', { hold: 0 });
    for (let i = 0; i < 6; i++) rig.pose('idle', 0.1);
    rig.update?.(0.1);
    const obj = rig.root;
    obj.rotation.y = 0;
    return this.renderObject(key, obj, { size: full ? 48 : 36, yaw: 0.35, pitch: 0.15, pad: 1.02 });
  }
}
