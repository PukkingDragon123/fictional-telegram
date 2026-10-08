// Reynard as the devlog's host. The game's own FoxRig is rendered small with an ink outline
// (the FoxNotifier look) and drawn pixelated onto a full-screen overlay canvas, so he can hop
// around the frame, pull faces, play gags (stomp, facepalm, faint, hat pop, monocle drop...),
// get cartoon FX around his head (anger veins, sweat, "!", "?", hearts, $$$, notes) and flap
// his mouth while the voice-over talks.
//
//   const host = new FoxHost(canvas, { beats, lines, sfx });
//   host.frame(t, dt);          // every video frame; host.head = {x, y} above his head
//
// beats (sorted by `at`, seconds):
//   { at, enter: 'bl' }                     jump in from below the screen to a spot
//   { at, spot: 'br', run: true }           hop (or run) to another spot
//   { at, expr: 'angry' }                   face (src/entities/foxFace.js EXPRESSIONS), held
//   { at, anim: 'facepalm', for: 1.2 }      body gag (FoxRig animation), back to talk / idle after
//   { at, fx: 'anger', fxFor: 2 }           cartoon FX around his head
//   { at, gag: 'popHat' | 'dropMonocle' }   rig gags
//   { at, shake: 0.6 }                      tremble
//   { at, scale: 1.3 }                      grow / shrink (eased)
//   { at, exit: true }                      jump off the bottom of the screen
// lines: [{ t0, t1, text }] the voice-over lines: he lip-flaps through each one.
// Everything is driven by frame time, so renders are reproducible (tools/video/vtime.js).
import * as THREE from 'three';
import { FoxRig } from '../../src/entities/foxRig.js';
import { FOX_FX_ROWS, FOX_FX_PAL } from '../../src/ui/FoxTalk3D.js';

const IW = 168, IH = 228; // rendered pixels
const PX = 3; // screen pixels per rendered pixel (the game's own pixel scale at 1080 wide)
export const SPOTS = {
  bl: { x: 250, y: 1575 }, br: { x: 830, y: 1575 }, bc: { x: 540, y: 1590 },
  ml: { x: 240, y: 1300 }, mr: { x: 840, y: 1300 }, c: { x: 540, y: 1420 },
};

const POST_VERT = `varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = `
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 size; uniform vec3 ink; uniform float cNear; uniform float cFar;
varying vec2 vUv;
float A(vec2 o) { return texture2D(tColor, vUv + o).a; }
float Z(vec2 o) { return -perspectiveDepthToViewZ(texture2D(tDepth, vUv + o).x, cNear, cFar); }
void main() {
  vec2 px = 1.0 / size;
  vec4 c = texture2D(tColor, vUv);
  if (c.a < 0.5) {
    float n = max(max(A(vec2(px.x, 0.0)), A(vec2(-px.x, 0.0))), max(A(vec2(0.0, px.y)), A(vec2(0.0, -px.y))));
    gl_FragColor = n > 0.5 ? vec4(ink, 1.0) : vec4(0.0);
  } else {
    float z = Z(vec2(0.0));
    float zn = min(min(Z(vec2(px.x, 0.0)), Z(vec2(-px.x, 0.0))), min(Z(vec2(0.0, px.y)), Z(vec2(0.0, -px.y))));
    vec3 col = c.rgb;
    if (z - zn > 0.09) col = mix(col, ink, 0.6);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}`;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const backOut = (u) => { u = clamp(u, 0, 1); const c = 1.7; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };

// pixel FX art (the game's FoxTalk3D sprites), cached as canvases
const _art = {};
function art(name) {
  if (_art[name]) return _art[name];
  const rows = FOX_FX_ROWS[name];
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (FOX_FX_PAL[ch]) { x.fillStyle = FOX_FX_PAL[ch]; x.fillRect(i, j, 1, 1); } }));
  return (_art[name] = c);
}
// FX kind -> sprite + motion
const FX = {
  anger: { art: 'vein', n: 1, motion: 'pulse', dx: 0.55, dy: 0.15 },
  sweat: { art: 'sweat', n: 2, motion: 'drip', dx: 0.6, dy: 0.35 },
  shock: { art: 'bang', n: 1, motion: 'pop', dx: 0.0, dy: -0.25 },
  question: { art: 'question', n: 1, motion: 'bob', dx: 0.5, dy: -0.15 },
  hearts: { art: 'heart', n: 3, motion: 'rise' },
  dollars: { art: 'dollar', n: 3, motion: 'rise' },
  notes: { art: 'note', n: 2, motion: 'rise' },
  sparkle: { art: 'twinkle', n: 3, motion: 'twinkle' },
  glint: { art: 'twinkle', n: 1, motion: 'twinkle' },
  stars: { art: 'star', n: 3, motion: 'orbit' },
  zzz: { art: 'zed', n: 2, motion: 'rise' },
  puff: { art: 'puff', n: 2, motion: 'rise' },
};

export class FoxHost {
  constructor(canvas, { beats = [], lines = [], sfx = () => {} } = {}) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.beats = beats.slice().sort((a, b) => a.at - b.at);
    this.lines = lines;
    this.sfx = sfx;
    this.fired = 0;
    this.lineI = 0;
    this.visible = false;
    this.pos = { x: SPOTS.bl.x, y: 2400 };
    this.move = null;
    this.scale = 1; this.scaleTo = 1;
    this.face = 0.35;
    this.gag = null; // { name, until }
    this.fx = [];
    this.shakeUntil = 0;
    this.head = null;
    this._build();
  }

  _build() {
    const r = (this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(1);
    r.setSize(IW, IH, false);
    r.setClearColor(0x000000, 0);
    const scene = (this.scene = new THREE.Scene());
    scene.add(new THREE.HemisphereLight(0xffe4c4, 0x6a4a7a, 1.35));
    const L = (c, i, x, y, z) => { const l = new THREE.DirectionalLight(c, i); l.position.set(x, y, z); scene.add(l); };
    L(0xfff0d6, 2.3, -1.6, 2.6, 3.2); L(0xffc6a0, 0.55, 2.5, 0.4, 2); L(0xffd27a, 2.6, 2.4, 1.8, -2.6); L(0xff9fd0, 1.4, -2.6, 1.2, -2.2);
    const rig = (this.rig = new FoxRig({ shadows: false }));
    scene.add(rig.root);
    rig.play('idle', { fade: 0 });
    rig.onEvent = (n) => { if (n === 'stomp') this.sfx('smash', { volume: 0.25, pitch: 1.4 }); };
    // view: 2.5 units tall, feet near the bottom, room above for arms, hops and a flying hat
    const cam = (this.cam = new THREE.PerspectiveCamera(24, IW / IH, 0.5, 30));
    const D = 2.5 / (2 * Math.tan(THREE.MathUtils.degToRad(12)));
    cam.position.set(0, 1.05, D);
    cam.lookAt(0, 1.05, 0);
    cam.updateMatrixWorld();
    rig.lookAt(cam.position);
    this.rt = new THREE.WebGLRenderTarget(IW, IH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(IW, IH);
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG,
      uniforms: { tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, size: { value: new THREE.Vector2(IW, IH) }, ink: { value: new THREE.Color(0x150910) }, cNear: { value: cam.near }, cFar: { value: cam.far } },
      depthTest: false, depthWrite: false,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    this.post = new THREE.Scene();
    this.post.add(m);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // where his feet land in the rendered image
    const f = new THREE.Vector3(0, 0, 0).project(cam);
    this.feet = { x: ((f.x + 1) / 2) * IW, y: ((1 - f.y) / 2) * IH };
  }

  _beat(b, t) {
    const rig = this.rig;
    if (b.enter) {
      this.visible = true;
      const to = SPOTS[b.enter] || b.enter;
      this.pos = { x: to.x, y: 2300 };
      this.move = { from: { ...this.pos }, to, t0: t, dur: 0.55, h: 260, enter: true };
      this.sfx('whoosh', { volume: 0.35, pitch: 1.2 });
    }
    if (b.spot) {
      const to = SPOTS[b.spot] || b.spot;
      const dist = Math.abs(to.x - this.pos.x) + Math.abs(to.y - this.pos.y);
      if (b.run && dist > 200) { this.move = { from: { ...this.pos }, to, t0: t, dur: dist / 1300, h: 0, run: true }; }
      else { this.move = { from: { ...this.pos }, to, t0: t, dur: 0.42, h: 190 }; this.sfx('jump', { volume: 0.3, pitch: 1.25 }); }
    }
    if (b.exit) {
      this.move = { from: { ...this.pos }, to: { x: this.pos.x, y: 2400 }, t0: t, dur: 0.5, h: 220, exit: true };
      this.sfx('jump', { volume: 0.3, pitch: 1.1 });
    }
    if (b.expr !== undefined) rig.setExpression(b.expr || null);
    if (b.anim) {
      this.gag = { name: b.anim, until: t + (b.for ?? 1.6) };
      rig.play(b.anim, { fade: 0.15, restart: true, onDone: () => { if (this.gag && this.gag.name === b.anim) this.gag = null; } });
    }
    if (b.fx) this.fx.push({ kind: b.fx, t0: t, dur: b.fxFor ?? 1.8, seed: this.fired * 7.13 });
    if (b.gag === 'popHat') { rig.popHat(1.35, 2); this.sfx('pop_in', { volume: 0.4, pitch: 0.9 }); }
    if (b.gag === 'dropMonocle') { rig.dropMonocle(); this.sfx('tick', { volume: 0.4, pitch: 1.6 }); }
    if (b.gag === 'restore') rig.restoreMonocle();
    if (b.shake) this.shakeUntil = t + b.shake;
    if (b.scale) this.scaleTo = b.scale;
    if (b.sfx) this.sfx(b.sfx, { volume: b.volume ?? 0.4, pitch: b.pitch ?? 1 });
    if (b.face !== undefined) this.faceFix = b.face; // fixed turn (radians), null = auto
  }

  frame(t, dt) {
    const rig = this.rig;
    while (this.fired < this.beats.length && this.beats[this.fired].at <= t + 1e-6) this._beat(this.beats[this.fired++], t);
    // lip-flap through each voice-over line, timed to its length
    while (this.lineI < this.lines.length && this.lines[this.lineI].t0 <= t + 1e-6) {
      const l = this.lines[this.lineI++];
      const txt = l.text.replace(/\*/g, '');
      rig.talk(txt, { cps: txt.length / Math.max(0.3, l.t1 - l.t0) });
    }
    if (this.gag && t > this.gag.until) this.gag = null;
    // movement
    let lift = 0, squash = 0;
    const M = this.move;
    if (M) {
      const u = clamp((t - M.t0) / M.dur, 0, 1);
      const k = M.run ? u : ease(u);
      this.pos = { x: M.from.x + (M.to.x - M.from.x) * k, y: M.from.y + (M.to.y - M.from.y) * k };
      lift = M.h * 4 * u * (1 - u);
      squash = u < 0.12 ? 0.18 * (u / 0.12) : u > 0.88 ? 0.18 * ((u - 0.88) / 0.12) : -0.12;
      if (M.run) squash = 0;
      if (u >= 1) {
        if (M.exit) this.visible = false;
        if (!M.run && !M.exit) this.sfx('plop', { volume: 0.3, pitch: 1.3 });
        this.landT = t;
        this.move = null;
      }
    }
    if (this.landT != null && t - this.landT < 0.18) squash = 0.2 * (1 - (t - this.landT) / 0.18);
    this.scale += (this.scaleTo - this.scale) * (1 - Math.exp(-dt * 9));
    // body: gag > run > talk > idle
    const base = this.gag ? null : M && M.run ? 'run' : rig.talking ? 'talk' : 'idle';
    if (base) rig.play(base, { fade: 0.2 });
    const dir = M && (M.run || Math.abs(M.to.x - M.from.x) > 40) ? Math.sign(M.to.x - M.from.x) : 0;
    const want = this.faceFix != null ? this.faceFix : dir ? dir * 1.25 : this.pos.x < 540 ? 0.38 : -0.38;
    this.face += (want - this.face) * (1 - Math.exp(-dt * 10));
    rig.root.rotation.y = this.face;
    rig.update(dt);

    const g = this.g;
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!this.visible) { this.head = null; return; }
    const r = this.renderer;
    r.setRenderTarget(this.rt); r.render(this.scene, this.cam);
    r.setRenderTarget(null); r.render(this.post, this.postCam);
    const s = this.scale * PX;
    const sx = s * (1 + squash), sy = s * (1 - squash);
    let ox = 0, oy = 0;
    if (t < this.shakeUntil) { ox = Math.round(Math.sin(t * 91) * 6); oy = Math.round(Math.cos(t * 77) * 4); }
    const x0 = Math.round(this.pos.x - this.feet.x * sx + ox), y0 = Math.round(this.pos.y - lift - this.feet.y * sy + oy);
    // ground shadow (shrinks while he's in the air)
    const sh = 1 - clamp(lift / 300, 0, 0.7);
    g.fillStyle = 'rgba(20,10,24,0.32)';
    const ew = Math.round(70 * this.scale * sh) * 2, eh = Math.round(9 * this.scale * sh) * 2;
    for (let j = 0; j < eh; j += 3) { const w = Math.round(ew * Math.sqrt(1 - ((j - eh / 2) / (eh / 2)) ** 2) / 3) * 3; g.fillRect(this.pos.x - w / 2, this.pos.y - eh / 2 + j, w, 3); }
    g.imageSmoothingEnabled = false;
    g.drawImage(r.domElement, x0, y0, Math.round(IW * sx), Math.round(IH * sy));
    // head point (screen) for the FX and the speech bubble
    const h = rig.headTop(new THREE.Vector3()).project(this.cam);
    const hx = x0 + ((h.x + 1) / 2) * IW * sx, hy = y0 + ((1 - h.y) / 2) * IH * sy;
    this.head = { x: hx, y: hy, s: this.scale };
    this._fx(t, hx, hy + 40 * this.scale);
  }

  _fx(t, hx, hy) {
    const g = this.g;
    const P = 5 * this.scale; // FX pixel size
    this.fx = this.fx.filter((f) => t - f.t0 < f.dur);
    for (const f of this.fx) {
      const d = FX[f.kind];
      if (!d) continue;
      const a = art(d.art), lt = t - f.t0, fade = clamp((f.dur - lt) / 0.25, 0, 1);
      for (let i = 0; i < d.n; i++) {
        let x = hx + (d.dx ?? 0) * 120 * this.scale, y = hy + (d.dy ?? 0) * 120 * this.scale, k = 1, al = fade;
        const ph = lt - i * 0.22;
        if (ph < 0) continue;
        if (d.motion === 'pulse') { k = 1 + 0.25 * Math.abs(Math.sin(lt * 9)); x += i * 40; }
        else if (d.motion === 'drip') { const c = (ph % 0.9) / 0.9; x += (i ? -1.15 : 0) * 120 * this.scale; y += c * 70; al *= 1 - c; }
        else if (d.motion === 'pop') { k = 0.4 + 0.8 * backOut(ph / 0.2); y -= Math.abs(Math.sin(lt * 6)) * 10; }
        else if (d.motion === 'bob') y -= Math.abs(Math.sin(lt * 5)) * 16;
        else if (d.motion === 'rise') { const c = (ph % 1.1) / 1.1; x += ((i % 3) - 1) * 60 * this.scale + Math.sin(ph * 6 + i) * 10; y -= 40 + c * 170; al *= 1 - c; }
        else if (d.motion === 'twinkle') { const ang = i * 2.1 + 0.6; x += Math.cos(ang) * 110 * this.scale; y += Math.sin(ang) * 70 * this.scale - 20; k = 0.5 + 0.6 * Math.abs(Math.sin(ph * 7 + i)); }
        else if (d.motion === 'orbit') { const ang = lt * 5 + (i * Math.PI * 2) / d.n; x += Math.cos(ang) * 80 * this.scale; y += Math.sin(ang) * 22 - 30; }
        if (al <= 0.02) continue;
        const w = Math.round(a.width * P * k), h = Math.round(a.height * P * k);
        g.globalAlpha = al;
        g.drawImage(a, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
        g.globalAlpha = 1;
      }
    }
  }
}
