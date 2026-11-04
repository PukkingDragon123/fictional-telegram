// [v32 class] The classroom's film shots for the perspective ClassCam (./ClassCam.js), framed from
// inside the room (src/entities/classroomScene.js: back wall + board at -z, the open front at +z).
//
//   const shots = classShots(room, fox);   // { wide, board, teacher, students, desk, demo, demoClose, paper, ... }
//   cam.cut(shots.board) | cam.move(shots.teacher, 0.8)
//
// A shot is { pos, look, fov, drift?, driftLook?, zoom?, hand? } (see ClassCam.cut). `pos` / `look`
// may be functions (follow a moving subject). Every shot holds with a slow push so nothing is ever
// a frozen frame.
import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

export function classShots(room, getFox) {
  const A = room.anchors;
  const B = A.boardCenter; // (-0.35, 1.125, -2.84)
  const T = A.teacherSpot.position;
  const D = A.demo; // science-table top centre
  const P = A.paperDesk;
  const foxHead = (out = new THREE.Vector3()) => {
    const f = getFox?.();
    if (!f) return out.copy(T).setY(1.05);
    return out.set(f.root.position.x, f.root.position.y + 0.95, f.root.position.z);
  };
  const S = {
    // establishing: from the back corner by the door, over the class to the board
    wide: { pos: v(2.55, 2.2, 2.05), look: v(-1.0, 0.8, -2.05), fov: 58, drift: [-0.035, -0.008, -0.02], driftFor: 10, hand: 0.8 },
    // the board, square on, with Reynard's spot on its right
    board: { pos: v(0.33, 1.45, -0.15), look: v(0.3, 1.0, -2.84), fov: 44, drift: [0, 0, -0.02], driftFor: 8, hand: 0.5 },
    // the left half of the board (wide drawings) / a close-up on the middle of it
    boardClose: { pos: v(-0.35, 1.2, -0.7), look: v(-0.35, 1.12, -2.84), fov: 40, drift: [0, 0, -0.02], driftFor: 6, hand: 0.4 },
    // a medium shot on Reynard (follows him)
    teacher: { pos: () => { const h = foxHead(new THREE.Vector3()); return h.set(Math.max(-1.2, Math.min(1.15, h.x - 0.5)), 1.36, -0.55); }, look: () => foxHead(new THREE.Vector3()).add(v(0, -0.2, 0)), fov: 44, hand: 1 },
    // the class, from beside the board
    students: { pos: v(-0.3, 1.62, -2.35), look: v(-0.45, 0.55, 0.5), fov: 54, drift: [0, -0.012, 0.03], driftFor: 6, hand: 1.1 },
    // Reynard's desk
    desk: { pos: v(1.55, 1.45, -0.6), look: v(2.75, 0.75, -2.35), fov: 40, drift: [0.02, -0.01, -0.02], driftFor: 6, hand: 0.8 },
    // the science table with its 3D demo: a three-quarter view and a close-up
    demo: { pos: v(D.x + 0.95, D.y + 0.8, D.z + 1.62), look: v(D.x - 0.02, D.y + 0.22, D.z - 0.05), fov: 34, drift: [-0.02, -0.004, -0.015], driftFor: 9, hand: 0.6 },
    demoClose: { pos: v(D.x + 0.5, D.y + 0.55, D.z + 1.25), look: v(D.x, D.y + 0.14, D.z + 0.03), fov: 28, drift: [-0.012, 0, -0.01], driftFor: 9, hand: 0.5 },
    demoHead: { pos: v(D.x + 0.78, D.y + 0.55, D.z + 1.3), look: v(D.x + 0.2, D.y + 0.32, D.z), fov: 26, drift: [-0.01, 0, -0.008], driftFor: 9, hand: 0.5 },
    demoTop: { pos: v(D.x + 0.45, D.y + 1.75, D.z + 1.25), look: v(D.x - 0.03, D.y + 0.05, D.z - 0.1), fov: 36, drift: [-0.015, -0.01, 0], driftFor: 9, hand: 0.5 },
    // the test paper: looking down on Bubbles' desk
    paper: { pos: v(P.x + 0.05, P.y + 1.15, P.z + 0.75), look: v(P.x, P.y, P.z - 0.05), fov: 40, drift: [0, -0.01, -0.006], driftFor: 10, hand: 0.6 },
  };
  /** a slow swing around the demo table between angles a0 and a1 (radians from the front), r away */
  S.demoOrbit = (a0 = 0.55, a1 = 1.2, period = 22, r = 1.75, h = 0.75, lookY = 0.22, fov = 34) => {
    const t0 = performance.now() / 1000;
    return {
      pos: () => { const k = 0.5 - 0.5 * Math.cos(((performance.now() / 1000 - t0) / period) * Math.PI * 2); const a = a0 + (a1 - a0) * k; return v(D.x + Math.sin(a) * r, D.y + h, D.z + Math.cos(a) * r); },
      look: v(D.x, D.y + lookY, D.z - 0.02), fov, hand: 0.3,
    };
  };
  return S;
}
