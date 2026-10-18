// [v27 title] WordBear: the bear that eats the title words (src/ui/TitleWords.js).
//
// A real 3D bear (the game's BearRig, suit and all) pops up BEHIND the floating
// words, eyes a letter, unhinges its maw, CHOMPS (a bite-shaped chunk of voxels
// is gone, crumbs fly), chews with stuffed cheeks, sometimes burps, and ducks
// away. Variants: a nibble, a big chomp, a whole-letter gulp (the letter gets
// slurped into the maw), and a lunge at a butterfly that misses (the butterfly
// teases it; sometimes it takes a grumpy nibble of the letter instead).
// Below the target line the bear is hidden by a depth-only occluder drawn
// before it, so it really looks like it rises from behind the words.
//
//   const b = new WordBear(host)   // host: see TitleWords.js `host`
//   b.start({ kind, L })           // -> false if there's nothing to eat
//   b.update(dt); b.busy; b.duck(); b.dispose()
import * as THREE from 'three';
import { BearRig } from '../entities/bearRig.js';
import { BEAR_TYPES } from '../data/bears.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const easeOutBack = (t, s = 1.70158) => { t = clamp01(t) - 1; return 1 + t * t * ((s + 1) * t + s); };
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;
const easeIn = (t) => clamp01(t) ** 2.2;
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const span = (t, a, b) => clamp01((t - a) / (b - a));

const CAST = ['office', 'cub', 'intern', 'tourist', 'hipster', 'grandma', 'lumberjack', 'accountant'];
const BEAR_H = 24; // head size in voxels of the words (the bear is about 2.5 lines tall)
const Z_BACK = -9; // behind the letters
const OCC_Z = 40;

export class WordBear {
  constructor(host) {
    this.h = host;
    this.busy = false;
    this.n = 0;
    this.typeI = 0;
    this.G = null;
    this.P = { pitch: 0, yaw: 0, roll: 0, lean: 0, jaw: 0, gape: 0, cheek: 0, face: 'neutral', lx: 0, ly: 0 };
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._m = new THREE.Vector3(); this._off = new THREE.Vector3();
    // the occluder: writes depth only, below the target line, after the words but before the bear
    this.occG = new THREE.Group();
    this.occG.renderOrder = 5;
    this.occ = new THREE.Mesh(new THREE.PlaneGeometry(900, 400), new THREE.MeshBasicMaterial({ colorWrite: false }));
    this.occ.renderOrder = 5;
    this.occ.visible = false;
    this.occG.add(this.occ);
    host.scene.add(this.occG);
    this._build(CAST[0]);
  }

  _build(type) {
    if (this.rig) { this.rig.dispose(); this.rig = null; }
    const def = BEAR_TYPES[type] || BEAR_TYPES.office;
    const rig = new BearRig(type, def);
    rig.personalize(7.3 + this.typeI * 3.1);
    // size via P.size (not the root scale) so the springs stay normalised to the bear's size
    rig.P.size = (BEAR_H / 0.95) / def.scale;
    rig._applyScale?.();
    for (const k in rig.sp) { const S = rig.sp[k]; if (S.k0 != null) { S.k = S.k0; S.c = S.c0; } }
    rig._springF = 1;
    rig.shadows = false;
    rig.root.renderOrder = 10;
    rig.scaler.renderOrder = 10;
    rig.root.visible = false;
    rig.layer = (F, c, name, B) => this._layer(F, c, B);
    this.h.scene.add(rig.root);
    this.rig = rig;
    this.type = type;
    // channel slots of the unhinged maw / cheeks in a pose frame (see bearRig.js Frame)
    const EX = rig.bones.length * 9;
    this.X_GAPE = EX + 8; this.X_CHEEK = EX + 10;
    this.nch = EX + 14;
  }

  /** compile this bear's shaders now (maw / cheek pieces too), between gags */
  warm() {
    const rig = this.rig;
    if (!rig || !this.h.compile) return;
    let parts = [];
    try { const k = rig._kit?.(); if (k) parts = [k.top, k.inner, k.bot, k.cheekL, k.cheekR]; } catch { /* older rigs */ }
    const vis = parts.map((m) => m.visible);
    rig.root.visible = true;
    for (const m of parts) { m.visible = true; m.material = rig.body.material; }
    try { this.h.compile(); } catch { /* warm-up only */ }
    parts.forEach((m, i) => { m.visible = vis[i]; });
    rig.root.visible = !!this.busy;
  }

  // the pose layer: our head / jaw / maw / face on top of the idle pose
  _layer(F, c, B) {
    const P = this.P, a = F.a;
    const t = c.time;
    F.r(B.head, P.pitch, P.yaw, P.roll + Math.sin(t * 1.9) * 0.03);
    F.ar(B.spine, P.lean, P.yaw * 0.3, 0);
    F.jaw(P.jaw);
    if (a.length === this.nch) { a[this.X_GAPE] = P.gape; a[this.X_CHEEK] = P.cheek; }
    F.look(P.lx, P.ly);
    c.face = P.face;
  }

  get debug() { const G = this.G; return G ? { kind: G.kind, t: +G.t.toFixed(2), letter: G.L?.d.ch, type: this.type } : { type: this.type }; }

  /** start a bite: { kind: 'chomp' | 'nibble' | 'gulp' | 'miss', L } */
  start({ kind = 'chomp', L = null } = {}) {
    const h = this.h;
    if (this.busy || !this.rig) return false;
    const intact = (x) => x && !x.gone && x.missing === 0 && !x.regrowing && x.leaveT < 0 && h.T - x.delay > 1;
    let bug = null;
    if (kind === 'miss') {
      const sitting = h.bugs.filter((b) => b.mode === 'sit' && intact(b.L));
      if (sitting.length) { bug = sitting[(Math.random() * sitting.length) | 0]; L = bug.L; } else kind = 'nibble';
    }
    if (!intact(L)) L = null;
    if (!L) {
      const pool = h.letters.filter(intact);
      if (!pool.length) return false;
      L = pool[(Math.random() * pool.length) | 0];
    }
    const d = L.d;
    const side = (d.bx > 0 ? -1 : 1) * (Math.random() < 0.75 ? 1 : -1); // the bear leans in from the inner side mostly
    const G = {
      kind, L, bug, t: 0, side, burp: Math.random() < (kind === 'gulp' ? 0.85 : kind === 'chomp' ? 0.45 : 0.15),
      grumpBite: kind === 'miss' && Math.random() < 0.55, bitten: false, cues: new Set(),
      bx: 0, by: d.hh - 1.2, r: 4.6,
    };
    // bites come out of the top corner nearest the bear
    if (kind === 'nibble') { G.bx = side * d.hw * 0.7; G.by = d.hh - 0.6; G.r = 2.7; }
    else if (kind === 'chomp') { G.bx = side * d.hw * rand(0.35, 0.6); G.by = d.hh - 1.2; G.r = rand(4.3, 5.1); }
    else if (kind === 'miss') { G.bx = side * d.hw * 0.6; G.by = d.hh - 0.6; G.r = 2.7; }
    // the cut line under the target line, nudged up so the letters hide it
    const cut = h.words.lineBase[d.line] + 2.2;
    G.cut = cut;
    const D = 150; // CAM_D in TitleWords.js
    this.occ.position.set(0, (cut * (D - OCC_Z)) / D - 200, OCC_Z);
    this.occ.visible = true;
    // facing: towards the camera, turned a little towards the letter
    const rig = this.rig;
    rig.root.rotation.set(0, -side * 0.22, 0);
    rig.root.position.set(0, 0, 0);
    rig.root.scale.setScalar((150 - (d.z + Z_BACK)) / 150); // as big on screen at any depth
    Object.assign(this.P, { pitch: 0, yaw: 0, roll: 0, lean: 0, jaw: 0, gape: 0, cheek: 0, face: 'neutral', lx: 0, ly: 0 });
    if (rig._fidget) { rig._fidget.t = 1e9; rig._fidget.w = 0; rig._fidget.dur = 0; }
    rig.pose('idle', 0);
    rig.root.updateMatrixWorld(true);
    rig.mawPos(this._off); // maw offset from the root at rest
    rig.root.visible = true;
    this.G = G;
    this.busy = true;
    this.n++;
    // butterflies scatter (the one it's after stays put, oblivious)
    h.protect(bug);
    h.letterPoint(L, 0, d.hh, 0, this._v);
    h.scatter(this._v.x, this._v.y - 10, this._v.z, true);
    h.protect(bug);
    h.play('jump', { volume: 0.22, pitch: 0.75 });
    return true;
  }

  /** does a (world) ray hit the bear's head? */
  hit(ray) {
    const G = this.G;
    if (!G || !this.rig?.root.visible || G.duckAt != null || G.t < 0.3) return false;
    const m = this.rig.mawPos(this._m);
    m.y += 5;
    return ray.distanceSqToPoint(m) < 120;
  }

  /** tapped on the nose: a startled squeak and it's gone (no snack this time) */
  bonk() {
    const G = this.G;
    if (!G || G.bonked != null || G.duckAt != null) return;
    G.bonked = G.t;
    if (G.L && !G.L.gone) G.L.eatK = 0;
    rig_squash(this.rig, 1.4);
    this.h.play('bear_talk', { volume: 0.24, pitch: 1.5 });
    this.h.play('pop', { volume: 0.25, pitch: 1.3 });
  }

  /** hurry away (the menu is leaving) */
  duck() {
    const G = this.G;
    if (!G || G.duckAt != null) return;
    G.duckAt = G.t; G.fast = true;
  }

  // fire a beat once per bite (key), at time `at` on the bite's clock
  _cue(k, at) {
    const G = this.G;
    if (!G || G.t < at || G.cues.has(k)) return false;
    G.cues.add(k);
    return true;
  }

  // where the maw should be this frame (world), from the timeline
  _maw(G, out) {
    const h = this.h, L = G.L, d = L.d, t = G.t, P = this.P;
    const bite = h.letterPoint(L, G.bx, G.by, 0, this._w);
    const topY = bite.y + (d.hh - G.by);
    const hidden = G.cut - 24;
    const peekX = bite.x + G.side * 5.5, peekY = topY + 4.5, zl = d.z, zb = Z_BACK + zl;
    let x = peekX, y, z = zb;
    // pop up to peek over the letters (mouth still hidden), then sneak up a little
    const rise = easeOutBack(span(t, 0, 0.42), 2.2);
    y = lerp(hidden, topY - 2.5, rise) + 2.2 * smooth(span(t, 0.62, 1.0));
    const K = G.kind;
    if (K === 'gulp') {
      // rise right over the letter, maw wide open to the sky, and slurp it up
      const w = smooth(span(t, 1.05, 1.45));
      const center = h.letterPoint(L, 0, d.hh, 0, this._m);
      x = lerp(x, center.x + G.side * 1.5, w); y = lerp(y, center.y + 7.5, w); z = lerp(z, zl - 3, w);
      const back = smooth(span(t, 2.0, 2.5));
      x = lerp(x, peekX, back); y = lerp(y, peekY, back); z = lerp(z, zb, back);
    } else {
      // wind up (lean back, maw over the bite), snap down onto it, pull back behind to chew
      const w = smooth(span(t, 1.05, 1.38));
      x = lerp(x, bite.x + G.side * 1.2, w); y = lerp(y, bite.y + G.r + (d.line === 0 ? 3.5 : 6.5), w); z = lerp(z, zl - 2, w);
      let target = bite;
      if (K === 'miss' && G.bug) target = this._m.copy(G.missAt || G.bug.pos);
      const s = easeIn(span(t, 1.38, 1.5));
      x = lerp(x, target.x, s); y = lerp(y, target.y + (K === 'miss' ? 0.5 : 0.8), s); z = lerp(z, zl + 3, s);
      const back = smooth(span(t, 1.56, 1.95));
      x = lerp(x, peekX - G.side * 1.5, back); y = lerp(y, peekY + 0.5, back); z = lerp(z, zb + 1, back);
      if (K === 'miss' && G.grumpBite) {
        // fine, the letter then: a grumpy little snap
        const s2 = easeIn(span(t, 2.75, 2.86)), b2 = smooth(span(t, 2.92, 3.25));
        x = lerp(x, bite.x, s2); y = lerp(y, bite.y + 0.6, s2); z = lerp(z, zl + 3, s2);
        x = lerp(x, peekX, b2); y = lerp(y, peekY, b2); z = lerp(z, zb, b2);
      }
    }
    // duck away: a little hop first, then gone
    if (G.duckAt != null) {
      const dt = t - G.duckAt, f = G.fast ? 2.2 : 1;
      const hop = Math.sin(clamp01(dt * f / 0.16) * Math.PI) * 2.2 * (G.fast ? 0 : 1);
      const k = easeIn(span(dt * f, 0.12, 0.5));
      y = lerp(y + hop, hidden - 6, k);
      z = lerp(z, zb, k);
    }
    return out.set(x, y, z);
  }

  update(dt) {
    const G = this.G, rig = this.rig;
    if (!G || !rig) return;
    const h = this.h, P = this.P, L = G.L, d = L.d;
    G.t += dt;
    const t = G.t, K = G.kind;
    // ---- the face / head acting
    const look = h.letterPoint(L, G.bx, G.by, 0, this._w);
    const mawNow = rig.mawPos(this._m);
    let lx = clamp((look.x - mawNow.x) * 0.12, -1.6, 1.6), ly = clamp((look.y - mawNow.y) * 0.1 - 0.4, -1.4, 1);
    P.yaw = clamp((look.x - mawNow.x) * 0.035, -0.45, 0.45);
    P.pitch = 0.12; P.roll = 0; P.lean = 0; P.jaw = 0; P.gape = 0; P.cheek = 0;
    if (t < 0.42) { P.face = 'excited'; P.jaw = 0.35; }
    else if (t < 1.05) {
      P.face = 'hungry';
      P.roll = Math.sin((t - 0.42) * 9) * 0.06; // a hungry little head waggle
      if (this._cue('sniff', 0.55)) h.play('bear_yum', { volume: 0.18, pitch: 1.1 });
    }
    if (G.bonked != null) {
      // bonked: eyes wide, then straight down
      P.face = 'shocked'; P.jaw = 0.7; P.pitch = -0.15; P.roll = Math.sin(t * 30) * 0.1 * Math.max(0, 1 - (t - G.bonked) * 3);
      if (G.duckAt == null && t - G.bonked > 0.28) { G.duckAt = t; G.fast = true; }
    } else if (K === 'gulp') this._gulp(G, t);
    else this._chomp(G, t);
    if (K === 'miss' && G.bug && G.bug.mode !== 'away') {
      // eyes on the butterfly
      lx = clamp((G.bug.pos.x - mawNow.x) * 0.12, -1.8, 1.8); ly = clamp((G.bug.pos.y - mawNow.y) * 0.1, -1.2, 1.4);
      if (t > 1.6) { P.yaw = clamp((G.bug.pos.x - mawNow.x) * 0.04, -0.5, 0.5); P.pitch = clamp(-(G.bug.pos.y - mawNow.y) * 0.03, -0.45, 0.2); }
    }
    P.lx = lx; P.ly = ly;
    // ---- when to leave
    const end = this._endAt(G);
    if (G.duckAt == null && t >= end) { G.duckAt = t; h.play('whoosh', { volume: 0.14, pitch: 1.3 }); }
    // ---- place the bear: its maw where the timeline wants it
    this._maw(G, this._v);
    rig.root.position.copy(this._v).sub(this._off);
    rig.pose('idle', dt);
    if (G.duckAt != null && t - G.duckAt > (G.fast ? 0.3 : 0.55)) this._finish();
  }

  _endAt(G) {
    if (G.kind === 'gulp') return G.burp ? 3.75 : 3.05;
    if (G.kind === 'miss') return G.grumpBite ? 3.9 : 3.15;
    if (G.kind === 'nibble') return G.burp ? 3.2 : 2.55;
    return G.burp ? 3.65 : 2.95;
  }

  _chomp(G, t) {
    const h = this.h, P = this.P, L = G.L, K = G.kind;
    // wind-up: lean back, the maw unhinges wide
    if (t >= 1.05 && t < 1.5) {
      const w = easeOut(span(t, 1.05, 1.3));
      P.gape = (K === 'nibble' ? 0.55 : 0.95) * w;
      P.pitch = lerp(0.12, -0.3, w);
      P.face = 'gape';
      if (this._cue('unhinge', 1.08)) h.play('unhinge', { volume: 0.26 });
      if (K === 'miss' && G.bug && this._cue('dodge', 1.3)) {
        // the butterfly notices at the last moment
        G.missAt = G.bug.pos.clone();
        h.protect(null);
        G.bug.mode = 'tease'; G.bug.t = 0; G.bug.L = null;
        G.bug.flee.copy(G.missAt).add(this._v.set(0, 6, 0));
        G.bug.vel.set(rand(-6, 6), 30, 6);
      }
      const s = span(t, 1.38, 1.5);
      if (s > 0) { P.gape *= 1 - s; P.pitch = lerp(-0.3, 0.16, s); }
    }
    // CHOMP
    if (this._cue('chomp', 1.5)) {
      P.gape = 0;
      if (K === 'miss') {
        h.play('chomp', { volume: 0.32, pitch: 1.25 });
        rig_squash(this.rig, 1.2);
      } else {
        const n = h.biteLetter(L, G.bx, G.by, G.r, { dir: -G.side });
        G.bitten = n > 0;
        h.play('chomp', { volume: 0.45, pitch: K === 'nibble' ? 1.3 : 0.95 });
        h.play('crunch', { volume: 0.22, pitch: 1.2 });
        rig_squash(this.rig, 1.6);
      }
    }
    if (t >= 1.5 && t < 1.62) { P.pitch = 0.16; P.face = 'chomp_closed'; P.cheek = K === 'miss' ? 0 : 0.75; }
    if (K === 'miss') {
      // ...nothing in it. The butterfly flutters round its head.
      if (t >= 1.62 && t < 2.2) { P.face = 'shocked'; P.jaw = 0.5; P.pitch = -0.1; if (this._cue('huh', 1.66)) h.play('bear_talk', { volume: 0.2, pitch: 1.25 }); }
      else if (t >= 2.2 && t < 2.75) { P.face = G.grumpBite ? 'angry' : 'sad'; P.roll = Math.sin(t * 14) * 0.08; if (this._cue('grr', 2.25)) h.play('growl', { volume: 0.14, pitch: 1.4 }); }
      if (G.grumpBite) {
        if (t >= 2.6 && t < 2.86) { P.face = 'chomp_open'; P.jaw = 1; P.pitch = 0.3; }
        if (this._cue('grump', 2.86)) {
          const n = h.biteLetter(L, G.bx, G.by, 2.4, { dir: -G.side });
          G.bitten = n > 0;
          h.play('nibble', { volume: 0.4, pitch: 0.9 });
          rig_squash(this.rig, 1);
        }
        if (t >= 2.86) { P.face = t < 3.5 ? 'stuffed' : 'smug'; P.cheek = t < 3.4 ? 0.6 : 0; P.jaw = 0.15 * Math.abs(Math.sin(t * 13)); if (this._cue('m1', 3.1)) h.play('nibble', { volume: 0.2, pitch: 1.3 }); }
      }
      if (G.bug && G.bug.mode === 'tease' && t > (G.grumpBite ? 3.3 : 2.8)) { G.bug.mode = 'fly'; G.bug.t = 0; G.bug.landAt = rand(4, 8); }
      return;
    }
    // chew, chew, chew
    const chewEnd = K === 'nibble' ? 2.4 : 2.9;
    if (t >= 1.62 && t < chewEnd) {
      const c = t - 1.62;
      P.face = c < 0.5 ? 'stuffed' : K === 'nibble' ? 'yummy' : 'bliss';
      P.cheek = lerp(0.75, 0.1, c / (chewEnd - 1.62));
      P.jaw = 0.18 * Math.abs(Math.sin(c * 13));
      P.roll = Math.sin(c * 6.5) * 0.09;
      P.pitch = 0.08 + Math.sin(c * 13) * 0.04;
      if (this._cue('m1', 1.8)) h.play('nibble', { volume: 0.28, pitch: rand(0.9, 1.3) });
      if (this._cue('m2', 2.15)) h.play('nibble', { volume: 0.24, pitch: rand(0.9, 1.3) });
      if (K !== 'nibble' && this._cue('m3', 2.5)) h.play('nibble', { volume: 0.22, pitch: rand(0.9, 1.3) });
      if (Math.random() < 0.06) this._mouthCrumb(L);
    }
    if (t >= chewEnd) this._afterMeal(G, t - chewEnd);
  }

  _gulp(G, t) {
    const h = this.h, P = this.P, L = G.L, rig = this.rig;
    if (t >= 1.05 && t < 1.9) {
      P.gape = 1.1 * easeOut(span(t, 1.05, 1.35));
      P.pitch = lerp(0.12, -0.28, smooth(span(t, 1.05, 1.4)));
      P.face = 'gape';
      if (this._cue('unhinge', 1.08)) h.play('unhinge', { volume: 0.3, pitch: 0.9 });
    }
    // the letter is slurped into the maw
    if (t >= 1.5 && t < 1.85 && !L.gone) {
      if (this._cue('shloop', 1.5)) h.play('shloop', { volume: 0.32 });
      L.eatK = span(t, 1.5, 1.82);
      rig.mawPos(L.eatTo);
      L.eatTo.z += 1.5;
    }
    if (this._cue('gone', 1.85)) {
      h.swallowLetter(L);
      L.eatK = 0;
      h.play('gulp', { volume: 0.45 });
      rig_squash(rig, 2);
    }
    if (t >= 1.85 && t < 2.6) {
      const c = t - 1.85;
      P.gape = 1.15 * (1 - smooth(c / 0.12));
      P.face = c < 0.45 ? 'stuffed' : 'bliss';
      P.cheek = c < 0.5 ? 0.85 * Math.min(1, c / 0.08) : lerp(0.85, 0, smooth((c - 0.5) / 0.25));
      P.pitch = 0.1 - Math.min(1, c / 0.3) * 0.2;
      if (this._cue('swallow', 2.3)) h.play('swallow', { volume: 0.3 });
    }
    if (t >= 2.6) this._afterMeal(G, t - 2.6);
  }

  // a contented moment, maybe a burp, then away
  _afterMeal(G, c) {
    const P = this.P, h = this.h;
    if (G.burp) {
      if (c < 0.25) { P.face = 'content'; P.pitch = -0.05; }
      else if (c < 0.8) {
        P.face = 'happy'; P.jaw = 0.75; P.pitch = -0.32;
        if (this._cue('burp', G.t - c + 0.3)) {
          h.play('burp', { volume: 0.42, pitch: rand(0.9, 1.15) });
          const m = this.rig.mawPos(this._m);
          h.spark(m.x, m.y + 2, m.z + 4, { n: 6, spread: 2.5, up: 10, big: 7, cols: ['#f4f0ff', '#ffe8f4', '#e8fff0'], life: 0.9 });
          rig_squash(this.rig, -1.2);
        }
      } else { P.face = 'content'; P.pitch = 0.05; }
    } else {
      P.face = G.kind === 'nibble' ? 'smug' : 'content';
      P.pitch = 0.05;
    }
  }

  _mouthCrumb(L) {
    const m = this.rig.mawPos(this._m);
    const pal = L.pal;
    this.h.crumb(m.x + rand(-1.5, 1.5), m.y - 1, m.z + 3, rand(-6, 6), rand(2, 9), rand(2, 6), Math.random() < 0.5 ? pal.low : pal.top, rand(0.45, 0.7), 1);
  }

  _finish() {
    const G = this.G;
    this.G = null;
    this.busy = false;
    this.occ.visible = false;
    if (this.rig) this.rig.root.visible = false;
    this.h.protect(null);
    if (G?.bug && (G.bug.mode === 'tease')) { G.bug.mode = 'fly'; G.bug.t = 0; G.bug.landAt = rand(4, 8); }
    if (G?.L && G.L.eatK > 0 && !G.L.gone) G.L.eatK = 0;
    // a new bear in a while (built now, between gags)
    if (this.n % 2 === 0 && !G?.fast) {
      this.typeI = (this.typeI + 1) % CAST.length;
      try { this._build(CAST[this.typeI]); this.warm(); } catch (e) { console.warn('TitleWords bear', e); }
    }
  }

  dispose() {
    this.rig?.dispose();
    this.rig = null;
    this.h.scene.remove(this.occG);
    this.occ.geometry.dispose();
    this.occ.material.dispose();
    this.G = null;
    this.busy = false;
  }
}

function rig_squash(rig, k) { try { rig.squash(k); } catch { /* older rigs */ } }
