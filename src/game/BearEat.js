// BearEat: one shared driver for the bear eating styles, used in game (BearSystem)
// and on the title screen. It holds the snack (src/entities/preyFx.js) in the
// bear's paws, tells you which BearRig pose to play each frame, flies the snack
// for the 'toss' style, flings a ripped-off head, and turns the rig's eat events
// into particles, comic words and sounds.
//
//   import { startEat, pickEatStyle } from './BearEat.js';
//   const style = pickEatStyle({ typeId, def, angry }, 'fish');
//   const eat = startEat(game, { rig, style, prey: makeFishPrey(game, fish, style) });
//   per frame:  rig.pose(eat.pose, dt, eat.poseParams)   (eat.poseParams.t01 is kept in sync)
//               eat.onRigEvent(name) for every rig event (rig.onEvent)
//               if (eat.update(dt)) -> finished (eat.leavesBone: toss a fish skeleton now)
//   eat.dispose()  (also called by update() when done unless keepPrey)
//
// Styles: chomp gulp rip slurp toss fancy shake crunch. EAT_STYLES lists the six
// headline ones (shake / crunch are extras in EAT_STYLES_ALL).
import * as THREE from 'three';
import { POSE_DURATION, EAT_CUES, VS } from '../entities/bearRig.js';
import { COMIC_WORDS } from './fxAtlas.js';
import { WATER_Y } from '../world/grid.js';

export const EAT_STYLES = ['chomp', 'gulp', 'rip', 'slurp', 'toss', 'fancy'];
export const EAT_STYLES_ALL = [...EAT_STYLES, 'shake', 'crunch'];
// style -> [[pose, seconds], ...]
const SEQ = {
  chomp: [['eat', POSE_DURATION.eat], ['yummy', POSE_DURATION.yummy]],
  gulp: [['eat_gulp', POSE_DURATION.eat_gulp]],
  rip: [['eat_rip', POSE_DURATION.eat_rip]],
  slurp: [['eat_slurp', POSE_DURATION.eat_slurp]],
  toss: [['eat_toss', POSE_DURATION.eat_toss]],
  fancy: [['eat_fancy', POSE_DURATION.eat_fancy]],
  shake: [['eat_shake', POSE_DURATION.eat_shake]],
  crunch: [['eat_crunch', POSE_DURATION.eat_crunch]],
};
// does a fish skeleton get tossed afterwards?
const BONE = { chomp: true, rip: true, fancy: true, crunch: true };

// Comic words for the particle atlas (fxAtlas pixel font: no F J Q V X). Registered at import,
// before the game builds its FX atlas; missing ones fall back to existing words at runtime.
const WORDS = {
  gulp: { text: 'GULP!', fill: '#fff0e0', shade: '#ff8a5a', ink: '#5a1e10' },
  rip: { text: 'RIIIP!', fill: '#ffe0d8', shade: '#ff4a4a', ink: '#4a0a0a' },
  slurp: { text: 'SLURP', fill: '#ffe8f4', shade: '#ff7ab8', ink: '#4a1030' },
  shloop: { text: 'SHLOOP!', fill: '#ffe8f4', shade: '#ff5aa8', ink: '#4a1030' },
  tada: { text: 'TADA!', fill: '#fffbd0', shade: '#ffd23a', ink: '#4a2a10' },
  ting: { text: 'TING!', fill: '#f0f8ff', shade: '#9ad0ff', ink: '#1a2a4a' },
  mmm: { text: 'MMM', fill: '#ffe3f0', shade: '#ff6aa8', ink: '#5a1030' },
  pop: { text: 'POP!', fill: '#fffbd0', shade: '#ffb84a', ink: '#5a2a10' },
  crunch: { text: 'CRUNCH', fill: '#fff4d0', shade: '#e8a040', ink: '#4a2a10' },
  ding: { text: 'DING!', fill: '#fffbd0', shade: '#ffd23a', ink: '#4a2a10' },
  nom: COMIC_WORDS.nom,
};
for (const [k, w] of Object.entries(WORDS)) if (w && !COMIC_WORDS[k]) COMIC_WORDS[k] = w;
const WORD_FALLBACK = { gulp: 'chomp', rip: 'smash', slurp: 'yum', shloop: 'yum', tada: 'wow', ting: 'wow', mmm: 'yum', pop: 'pow', crunch: 'munch', ding: 'wow' };

/**
 * Pick a style for a bear: fancy for executives, gulp for the big ones, chomp most for regulars.
 * bear: { typeId, def, angry }; preyKind 'fish' | 'duck'.
 */
export function pickEatStyle(bear, preyKind = 'fish') {
  const id = bear.typeId || '', d = bear.def || {};
  const w = { chomp: 5, gulp: 1.2, rip: 1, slurp: 1.2, toss: 1.2, fancy: 0.4, shake: 0.8, crunch: 1 };
  if (id === 'ceo' || id === 'critic' || id === 'shareholder' || d.monocle || d.hat === 'tophat') { w.fancy = 7; w.chomp = 1.5; }
  if (id === 'grandma' || id === 'accountant') w.fancy = 3;
  if (d.boss || (d.scale || 1) >= 1.2) { w.gulp = 5; w.chomp = 2; }
  if (id === 'lumberjack' || id === 'construction' || id === 'enforcer') { w.rip = 4; w.shake = 2; }
  if (id === 'jogger' || id === 'tourist' || id === 'intern' || id === 'cub' || id === 'foreman_cub') { w.toss = 4; w.slurp = 2; }
  if (id === 'hipster') { w.slurp = 4; w.crunch = 2; }
  if (id === 'janitor') w.crunch = 4;
  if (bear.angry) { w.rip += 3; w.shake += 3; w.fancy = 0; }
  if (preyKind === 'duck') { w.crunch = 0; w.shake *= 0.5; }
  let tot = 0;
  for (const k in w) tot += w[k];
  let x = Math.random() * tot;
  for (const k in w) { x -= w[k]; if (x <= 0) return k; }
  return 'chomp';
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

/**
 * Start eating. opts:
 *   rig        BearRig (the snack is put in its paws with rig.hold)
 *   style      one of EAT_STYLES_ALL
 *   prey       from makeFishPrey / makeDuckPrey
 *   parent     Object3D for flying bits (default game.scene)
 *   speed      timeline speed (1 = the authored timing)
 *   camera     defaults to game.rig.camera
 *   groundAt   (x, z) -> { y, water } for flung heads (default: the game grid)
 *   fx         { word(id, x, y, z, size), sfx(name, opts) } overrides (default: game.particles / game.audio)
 *   quiet      no sounds
 * Returns the eat object (see the header).
 */
export function startEat(game, { rig, style = 'chomp', prey, parent = null, speed = 1, camera = null, groundAt = null, fx = null, quiet = false } = {}) {
  if (!SEQ[style]) style = 'chomp';
  const seq = SEQ[style];
  const total = seq.reduce((s, x) => s + x[1], 0);
  const scale = rig.def.scale * rig.P.size;
  const P = game.particles;
  const par = parent || game.scene;
  const cam = camera || game.rig?.camera || null;
  const sizeK = 0.26 + 0.06 * scale;
  const word = (id, p, size = 1) => {
    if (fx?.word) return fx.word(id, p.x, p.y, p.z, size);
    if (!P) return;
    const has = (k) => !P.atlas || P.atlas.frames['word_' + k];
    const w = has(id) ? id : WORD_FALLBACK[id] || 'yum';
    P.word(w, p.x, p.y + 0.3, p.z, { size: sizeK * size, life: 1.1 });
  };
  const sfx = (name, o = {}) => {
    if (quiet) return;
    if (fx?.sfx) return fx.sfx(name, o);
    game.audio?.play?.(name, { volume: 0.4, pitch: 1.1 - scale * 0.15 + Math.random() * 0.1, ...o });
  };
  const ground = groundAt || ((x, z) => {
    const g = game.grid;
    if (!g) return { y: 0, water: false };
    const tx = Math.floor(x), tz = Math.floor(z);
    const wet = g.isWater?.(tx, tz);
    return { y: wet ? WATER_Y : g.surfaceY(tx, tz), water: !!wet };
  });
  const fish = prey.kind === 'fish';
  prey.camera = cam;
  rig.hold(prey.root);
  const preyLen = prey.len / (0.1 * VS * scale);
  const eat = {
    style, prey, rig, duration: total / speed, t: 0, speed,
    leavesBone: fish && !!BONE[style],
    poseParams: { t01: 0, preyLen },
    pose: seq[0][0], done: false, flying: null,
    get t01() { return this.poseParams.t01; },
    update(dt) {
      if (this.done) return true;
      this.t += dt * speed;
      // current segment
      let tt = this.t, i = 0;
      while (i < seq.length - 1 && tt >= seq[i][1]) { tt -= seq[i][1]; i++; }
      this.pose = seq[i][0];
      this.poseParams.t01 = Math.min(1, tt / seq[i][1]);
      // toss: the snack flies from the paw to the mouth (driven by time so it works without rendering)
      if (style === 'toss') {
        const C = EAT_CUES.eat_toss;
        if (this.t >= C.toss && this.t < C.catch && !this.flying && rig.held === prey.root) {
          rig.release();
          prey.root.getWorldPosition(_a);
          par.attach(prey.root);
          prey.setFree(true);
          this.flying = { p0: _a.clone(), t0: C.toss, t1: C.catch, h: (1.5 + 0.9 * scale) };
          sfx('whoosh', { volume: 0.3, pitch: 1.5 });
        }
        if (this.flying && this.t < C.catch) {
          const F = this.flying, u = (this.t - F.t0) / (F.t1 - F.t0);
          rig.mawPos(_b);
          prey.root.position.lerpVectors(F.p0, _b, u);
          prey.root.position.y += 4 * F.h * u * (1 - u);
          par.worldToLocal?.(prey.root.position);
          prey.spinFree?.(dt * speed);
        }
        if (this.t >= C.catch && this.flying) {
          this.flying = null;
          prey.setFree(false);
          rig.hold(prey.root);
        }
      }
      prey.update?.(dt, ground, (p, water, bounce) => {
        if (water) P?.splash(p.x, p.z, bounce ? 4 : 7, 0.45);
        else if (fish) P?.decal?.('splat_s', p.x, p.y, p.z, 0.22, 10);
        if (!water && !fish) P?.feathers(p.x, p.y + 0.05, p.z, 1);
        if (!bounce) sfx(water ? 'plop' : 'drop', { volume: 0.25 });
      });
      if (this.t >= total) { this.finish(); return true; }
      return false;
    },
    finish() {
      if (this.done) return;
      this.done = true;
      if (!this._said) this.onRigEvent('done');
      rig.afterPose = null;
    },
    onRigEvent(name) {
      const m = rig.mouthPos(_a);
      const dir = { x: 0, z: 0 };
      rig.root.getWorldDirection(_b); dir.x = _b.x * 0.8; dir.z = _b.z * 0.8;
      const gore = (n, power = 0.8) => (fish ? P?.blood(m.x, m.y, m.z, n, dir, power) : P?.feathers(m.x, m.y, m.z, Math.ceil(n / 2)));
      switch (name) {
        case 'bite': {
          const n = rig.biteN || 1;
          if (style === 'crunch') { sfx('crunch', { volume: 0.35, pitch: 1 + Math.random() * 0.3 }); if (n === 1 || n === 5 || n === 9) word('crunch', m, 0.8); P?.fx?.spawn?.('chunk', m.x, m.y, m.z, { vx: (Math.random() - 0.5) * 2, vy: 2, vz: (Math.random() - 0.5) * 2, grav: 10, life: 1, size: 0.07, spin: 8, flags: 1 | 16 }); break; }
          if (style === 'chomp') break; // the classic pose fires 'chomp' too
          gore(style === 'fancy' ? 2 : 6, style === 'fancy' ? 0.4 : 0.8);
          sfx(style === 'fancy' ? 'nibble' : n % 2 ? 'squelch' : 'chomp', { volume: style === 'fancy' ? 0.3 : 0.45 });
          word(style === 'fancy' ? 'nom' : n === 1 ? 'chomp' : 'munch', m, style === 'fancy' ? 0.7 : 1);
          if (style === 'rip' && n === 3) setTimeout(() => word('mmm', rig.headTop(_a), 0.9), 250);
          break;
        }
        case 'chomp': {
          const n = rig.chomps;
          gore(5 + n * 2, 0.9);
          sfx(n === 3 ? 'crunch' : 'squelch', { volume: 0.45 });
          sfx('chomp', { volume: 0.32 });
          word(n === 2 ? (Math.random() < 0.5 ? 'munch' : 'nom') : 'chomp', m);
          break;
        }
        case 'unhinge': sfx('unhinge', { volume: 0.4, pitch: 0.9 + Math.random() * 0.2 }); break;
        case 'drop': sfx('whoosh', { volume: 0.25, pitch: 1.8 }); break;
        case 'gulp': sfx('gulp', { volume: 0.55 }); word('gulp', m, 1.25); if (!fish) P?.feathers(m.x, m.y, m.z, 3); break;
        case 'swallow': sfx('swallow', { volume: 0.45 }); break;
        case 'pat': sfx('pet', { volume: 0.2, pitch: 0.8 }); break;
        case 'rip': {
          // the head flies off towards the bear's right, spinning; a splat of cartoon gore
          const v = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.root.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(2.2 * Math.sqrt(scale));
          v.y = 3.6 + Math.random();
          const hp = prey.detachHead(par, v);
          if (fish) P?.blood(hp.x, hp.y, hp.z, 12, { x: v.x * 0.3, z: v.z * 0.3 }, 1);
          else { P?.feathers(hp.x, hp.y, hp.z, 9); P?.feathers(m.x, m.y - 0.3, m.z, 4); sfx('pop', { volume: 0.5 }); word('pop', hp, 1); }
          sfx('rip', { volume: 0.55 });
          word('rip', hp, 1.3);
          break;
        }
        case 'slurp': sfx('slurp', { volume: 0.35, pitch: 0.9 + Math.random() * 0.3 }); if (!this._slurpW) { this._slurpW = 1; word('slurp', m, 1); } break;
        case 'shloop': sfx('shloop', { volume: 0.55 }); word('shloop', m, 1.25); if (!fish) P?.feathers(m.x, m.y, m.z, 4); break;
        case 'toss': sfx('whoosh', { volume: 0.3, pitch: 1.3 }); break;
        case 'catch': sfx('chomp', { volume: 0.55 }); word('chomp', m, 1.2); gore(4, 0.6); break;
        case 'tada': { const h = rig.headTop(_a); word('tada', h, 1.1); P?.stars?.(h.x, h.y, h.z, 6); sfx('cheer', { volume: 0.25 }); break; }
        case 'napkin': sfx('napkin', { volume: 0.4 }); break;
        case 'cutlery': { sfx('cutlery', { volume: 0.4 }); const h = rig.handPos('L', _a); P?.sparkle(h.x, h.y + 0.2, h.z, 6, 0xffffff); word('ting', h, 0.8); break; }
        case 'cut': sfx('nibble', { volume: 0.15, pitch: 1.8 }); break;
        case 'dab': sfx('napkin', { volume: 0.3, pitch: 1.3 }); P?.sparkle(m.x, m.y, m.z, 2, 0xffffff); break;
        case 'poof': P?.puff?.(m.x, m.y - 0.4, m.z, 6, 0.2); sfx('pop', { volume: 0.25, pitch: 1.4 }); break;
        case 'shake': sfx('whoosh', { volume: 0.18, pitch: 1.6 + Math.random() * 0.4 }); if (fish && Math.random() < 0.5) P?.blood(m.x, m.y, m.z, 2, dir, 0.5); else if (!fish) P?.feathers(m.x, m.y, m.z, 1); break;
        case 'ding': sfx('ding', { volume: 0.45 }); word('ding', m, 1); break;
        case 'done': {
          if (this._said) break;
          this._said = true;
          const h = rig.headTop(_a);
          P?.hearts(h.x, h.y - 0.2, h.z, 2);
          if (style !== 'chomp') sfx('bear_yum', { volume: 0.45 });
          if (style === 'chomp' || style === 'slurp' || style === 'crunch') word('yum', h, 1.3);
          break;
        }
      }
    },
    dispose() {
      if (rig.afterPose === sync) rig.afterPose = null;
      if (rig.held === prey.root) rig.hold(null); else prey.dispose();
    },
  };
  // after every pose: the snack follows what the pose wants (attachment, angle, bites...)
  const sync = (r) => { prey.camera = cam || prey.camera; prey.sync(r); };
  rig.afterPose = sync;
  return eat;
}
