// Shared biped skeleton for the DeerGuy and MooseCourier rigs (fox-style
// layout): mover > hips > chest > head (+ ears), two-bone arms with swappable
// hand meshes and a grip, two-bone legs, a tail. Dimensions in voxels.
import * as THREE from 'three';
import { VS, CritterRig, armIK, ik2, intoChain, sin, cos, abs, max, PI, clamp } from './critterKit.js';

export const HAND_KINDS = ['relax', 'fist', 'open', 'point', 'thumb'];

/**
 * D: { HIP_Y, WAIST, NECK, SH: [x, y, z], L_UP, L_FORE, L_HAND, THIGH, SHIN, LEG_X, EAR: [x, y, z], TAIL: [y, z], MOUTH: [y, z] (head space) }
 * G: geometries { pelvis, torso, head, earL, earR, upper, fore, thigh, shin, tail, hand_<kind>L/R }
 */
export class BipedRig extends CritterRig {
  _buildBiped(G, D) {
    this.D = D;
    this.joint('mover', this.root);
    this.joint('hips', this.mover, 0, D.HIP_Y, 0);
    this.mesh(G.pelvis, this.hips);
    this.joint('chest', this.hips, 0, D.WAIST, 0);
    this.mesh(G.torso, this.chest);
    this.joint('head', this.chest, 0, D.NECK, D.NECK_Z || 0);
    this.headMesh = this.mesh(G.head, this.head);
    this.joint('earL', this.head, D.EAR[0], D.EAR[1], D.EAR[2]); this.mesh(G.earL, this.earL);
    this.joint('earR', this.head, -D.EAR[0], D.EAR[1], D.EAR[2]); this.mesh(G.earR, this.earR);
    this.hands = {};
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      const a = this.joint('arm' + n, this.chest, s * D.SH[0], D.SH[1], D.SH[2]);
      this.mesh(G.upper, a);
      const f = this.joint('fore' + n, a, 0, -D.L_UP, 0);
      this.mesh(G.fore, f);
      const w = this.joint('wrist' + n, f, 0, -D.L_FORE, 0);
      const hs = {};
      for (const k of HAND_KINDS) { hs[k] = this.mesh(G['hand_' + k + n], w); hs[k].visible = k === 'relax'; }
      this.hands[n] = hs;
      const grip = new THREE.Group();
      grip.position.set(-s * 0.2 * VS, -D.L_HAND * VS, 0.3 * VS);
      w.add(grip);
      this['grip' + n] = grip;
      const th = this.joint('thigh' + n, this.hips, s * D.LEG_X, 0, 0);
      this.mesh(G.thigh, th);
      const sh = this.joint('shin' + n, th, 0, -D.THIGH, 0);
      this.mesh(G.shin, sh);
    }
    this.joint('tail', this.hips, 0, D.TAIL[0], D.TAIL[1]);
    this.mesh(G.tail, this.tail);
    this.scalar('lookW', 1);
  }

  _setHands(p) {
    for (const n of ['L', 'R']) {
      const k = p['hand' + n] || 'relax';
      if (this['_hk' + n] === k) continue;
      this['_hk' + n] = k;
      for (const kk in this.hands[n]) this.hands[n][kk].visible = kk === k;
    }
  }

  // --- pose helpers (all voxels, chest space for arms)
  /** Wrist target in chest space for an arm; pole = elbow hint (side applied to x). */
  reach(p, side, x, y, z, pole = [0.8, -0.4, -1], w = 1) {
    const D = this.D, n = side > 0 ? 'L' : 'R';
    armIK(p, 'arm' + n, 'fore' + n, [side * D.SH[0], D.SH[1], D.SH[2]], [side * x, y, z], D.L_UP, D.L_FORE, [pole[0] * side, pole[1], pole[2]], w);
    // IK solves for a right-handed basis; mirror the twist for the right side so FK conventions match
  }
  /** Chest-space position (y, z) of a point given in head space (x ignored), following the head's rx. */
  headPoint(p, hy, hz, out = [0, 0]) {
    const D = this.D, a = p.head.rx;
    out[0] = D.NECK + p.head.y + hy * cos(a) - hz * sin(a);
    out[1] = (D.NECK_Z || 0) + p.head.z + hy * sin(a) + hz * cos(a);
    return out;
  }
  /** Breathing + idle sway. */
  life(t, p, amt = 1) {
    const br = sin(t * 2.2);
    p.chest.s = 1 + br * 0.012 * amt;
    p.chest.rx += br * 0.012 * amt;
    p.head.rx += -br * 0.014 * amt;
    p.armL.rz += sin(t * 2.2 + 0.6) * 0.03 * amt; p.armR.rz -= sin(t * 2.2 + 0.2) * 0.03 * amt;
    p.earL.rz += sin(t * 1.4) * 0.05 * amt; p.earR.rz -= sin(t * 1.4 + 0.8) * 0.05 * amt;
    p.tail.rx += sin(t * 1.7) * 0.1 * amt;
  }
  /** Relaxed standing arms. */
  armsDown(p, splay = 0.12) {
    p.armL.rz = splay; p.armR.rz = -splay; p.armL.rx = p.armR.rx = 0.05;
    p.foreL.rx = p.foreR.rx = -0.25;
  }
  /** Walk cycle legs. */
  walk(p, ph, amp = 0.55) {
    const sn = sin(ph), cs = cos(ph);
    p.thighL.rx = -sn * amp; p.thighR.rx = sn * amp;
    p.shinL.rx = max(0, cs) * 1.0 + 0.05; p.shinR.rx = max(0, -cs) * 1.0 + 0.05;
    p.hips.y = -0.5 + abs(cs) * 0.7;
  }
  /** Planar leg IK: foot target (y, z) in the mover frame (voxels), honours mover/hips rx and offsets. */
  legTo(p, side, fy, fz) {
    const D = this.D, n = side > 0 ? 'L' : 'R';
    const ch = [[p.mover.y, p.mover.z, p.mover.rx], [D.HIP_Y + p.hips.y, p.hips.z, p.hips.rx], [0, 0, 0]];
    const v = intoChain(fy, fz, ch);
    const r = ik2(D.THIGH, D.SHIN, v[0], v[1], 1);
    p['thigh' + n].rx = r[0]; p['shin' + n].rx = r[1];
  }
  /** Grounded stance: lower the hips by `crouch` voxels and keep both feet planted (zL/zR: foot z). */
  stance(p, crouch = 0, zL = 0.2, zR = 0.2, spread = 0.05) {
    p.hips.y -= crouch;
    this.legTo(p, 1, -p.mover.y, zL);
    this.legTo(p, -1, -p.mover.y, zR);
    p.thighL.rz = spread; p.thighR.rz = -spread;
  }
}
export { clamp, PI };
