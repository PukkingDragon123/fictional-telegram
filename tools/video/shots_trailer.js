// Shots for the cinematic trailer: sunrise over the valley, the camera glides to
// Reynard's hut and dives through the window, Reynard wakes up and talks, then a
// short montage that only hints at what you will build. Driven by director.js.
import * as THREE from 'three';
import { TitleScene } from '../../src/game/TitleScene.js';
import { Bedtime } from '../../src/game/Bedtime.js';
import { makeMug } from '../../src/entities/foxOffice.js';
import { setCam, camAt, lerp, smooth, clamp, D2R, keepUI } from './director.js';
import { prep, clearDecos, stockPond, addRig, addFox, once, line, bearAt, holdBear } from './shots_promo.js';
import { FILL_GOLD, FILL_WHITE } from './overlay.js';

export const SHOTS = {};

// ------------------------------------------------------------------ the painted sky curtain (from the title screen)
// Starts the title diorama in the running game only for its sky curtain + grade, hides its cast.
export function skyCurtain(c) {
  const g = c.g;
  const T = new TitleScene(g);
  const keep = { hour: g.state.hour, phase: g.state.phase };
  T.start();
  g.state.hour = keep.hour; g.state.phase = keep.phase; // (the title diorama sets its own golden hour + 'day')
  for (const o of [T.fox?.root, T.deer?.root, T.foxChair?.base, T.deerChair?.base, T.cooler, T.floatCan, T.dfly, T.fishMesh]) if (o) o.visible = false;
  for (const d of T.ducks || []) d.d.root.visible = false;
  if (T.school?.batch?.mesh) T.school.batch.mesh.visible = false;
  for (const ch of T.chicks || []) if (ch.c?.root) ch.c.root.visible = false;
  if (g.fish.batch?.mesh) g.fish.batch.mesh.visible = true;
  g.titleMode = false;
  c.title = T;
  return T;
}
// camera + curtain together. sun = [x (fraction of the view width from the centre), y (fraction of the sky height)]
export function skyCam(c, cam, sun, t) {
  const g = c.g, rig = g.rig, rr = g.renderer, T = c.title;
  const pitch = cam.pitch * D2R, yaw = cam.yaw;
  setCam(rig, cam);
  const hh0 = (rr.rtH * cam.wupp) / 2;
  rig.dist = Math.max(24, (hh0 * Math.cos(pitch) + 0.8) / Math.sin(pitch));
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const SKY_D = cam.skyD ?? 3.4;
  T.skyMesh.position.set(cam.x - sy * SKY_D, cam.y || 0, cam.z - cy * SKY_D);
  T.skyMesh.rotation.set(0, yaw, 0);
  const hh = rr.rtH * cam.wupp * 0.5, viewW = rr.rtW * cam.wupp;
  const topH = (hh + (cam.y || 0) * Math.cos(pitch) - SKY_D * Math.sin(pitch)) / Math.cos(pitch);
  T.skyUniforms.uTop.value = Math.max(0.8, topH);
  T.skyUniforms.uSun.value.set(viewW * sun[0], topH * sun[1]);
  T.skyUniforms.uPx.value = cam.wupp;
  T.skyUniforms.uTime.value = 3 + t;
  T.skyUniforms.uNarrow.value = 1;
}
// dawn lighting: low warm sun rising from the right of the view (k = 0 first light .. 1 morning)
export function dawnLight(c, getK) {
  const g = c.g, sky = g.sky;
  const orig = Object.getPrototypeOf(sky).update;
  const dir = new THREE.Vector3(), col = new THREE.Color(), A = new THREE.Color(), B = new THREE.Color();
  sky.update = (hour, time, focus, yaw) => {
    orig.call(sky, hour, time, focus, yaw);
    const k = clamp(getK(), 0, 1);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const rx = cy, rz = -sy, fx = -sy, fz = -cy;
    const el = lerp(0.06, 0.42, k), h = Math.cos(el);
    dir.set((rx * 0.78 + fx * 0.3) * h, Math.sin(el), (rz * 0.78 + fz * 0.3) * h).normalize();
    sky.state.sunDir.copy(dir);
    const p = sky.sun.target.position;
    sky.sun.position.set(p.x + dir.x * 90, p.y + dir.y * 90, p.z + dir.z * 90);
    sky.sun.color.copy(A.setHex(0xff8a50).lerp(B.setHex(0xffd6a8), k));
    sky.sun.intensity = lerp(1.5, 2.9, k);
    sky.hemi.color.copy(A.setHex(0x8a74b8).lerp(B.setHex(0xd8bcd0), k));
    sky.hemi.groundColor.setHex(0x6a5040);
    sky.hemi.intensity = lerp(0.85, 1.25, k);
    sky.state.skyTint.copy(A.setHex(0xc890b8).lerp(B.setHex(0xffd0a8), k));
    sky.state.waterShallow.lerp(col.setHex(0x7a98b0), 0.55);
    sky.state.waterDeep.lerp(col.setHex(0x584f92), 0.6);
    sky.state.night = 0;
    if (sky.uniforms?.uTop?.value?.isColor) { sky.uniforms.uTop.value.setHex(0x8a6ab0); sky.uniforms.uBottom.value.setHex(0xffb08a); }
  };
}
// pre-dawn darkness: a multiply layer that lifts
function dawnVeil(c, t0, t1, from = 0.62) {
  const d = document.createElement('div');
  Object.assign(d.style, { position: 'absolute', inset: '0', background: 'linear-gradient(180deg, #2a2a6a 0%, #4a3a7a 55%, #6a4a6a 100%)', mixBlendMode: 'multiply', opacity: from });
  c.ov.root.appendChild(d);
  c.ov.fn((t) => { d.style.opacity = (from * (1 - smooth((t - t0) / (t1 - t0)))).toFixed(3); });
}
function letterbox(c, t0 = -1, t1 = 999, h = 0.1, inDur = 0.001) { c.ov.bars(Math.min(t0, -1), t1, h, inDur); }

// ================================================================== T1: sunrise -> the hut -> through the window
const WIN = { x: 77.7, y: 0.76, z: 43.12 }; // the left front window of Reynard's hut (hutModel voxels 5..8, y 6..9)
SHOTS.sunrise = {
  dur: 14.6,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 6.5 });
    stockPond(g, 24);
    clearDecos(g, 60, 36, 86, 60);
    // a clear corridor in front of the hut for the dive (the trees either side stay for depth)
    clearDecos(g, 75.5, 44, 81.5, 92);
    // the two shop signs hanging from the porch roof cover the front windows: take them down
    g.world.hut?.traverse((o) => { if (o.parent?.name === 'hutDecals' && o.position.z > 2.9 && o.position.y > 0.6) o.visible = false; });
    const T = skyCurtain(c);
    g.state.hour = 6.6;
    c.presim(1);
    g.fox.rig.root.visible = false;
    let K = 0;
    dawnLight(c, () => K);
    // the path: drift across the pond at first light, swing round to the hut, then the dive
    const keys = [
      { t: 0.0, x: 64.5, z: 31.5, y: 0.2, yaw: -0.42, pitch: 13, wupp: 0.024 },
      { t: 5.5, x: 70.0, z: 34.0, y: 0.3, yaw: -0.2, pitch: 13, wupp: 0.021 },
      { t: 9.6, x: 78.2, z: 41.6, y: 0.7, yaw: 0.0, pitch: 11, wupp: 0.0125 },
      { t: 11.4, x: 77.95, z: 42.6, y: 0.78, yaw: 0.0, pitch: 9, wupp: 0.0068 },
      { t: 13.9, x: WIN.x, z: WIN.z, y: WIN.y, yaw: 0.0, pitch: 6, wupp: 0.00045, ease: 'in' },
    ];
    c.every((t) => {
      K = smooth(t / 10.5);
      const cam = camAt(keys, t);
      // the sun rises behind the far range, drifting right as the camera swings
      const sun = [lerp(0.06, 0.24, smooth(t / 11)), lerp(0.08, 0.55, smooth(t / 12))];
      skyCam(c, { ...cam, skyD: cam.wupp < 0.008 ? 1.2 : 3.4 }, sun, t);
      g.state.hour = 6.4 + t * 0.06;
    });
    letterbox(c);
    dawnVeil(c, 0, 6.5, 0.6);
    // the window glow swallows the screen
    const glow = document.createElement('div');
    Object.assign(glow.style, { position: 'absolute', inset: '0', background: 'radial-gradient(circle at 50% 50%, #fff6d8 0%, #ffd890 35%, rgba(255,200,120,0) 70%)', opacity: 0 });
    c.ov.root.appendChild(glow);
    c.ov.fn((t) => { glow.style.opacity = smooth((t - 13.1) / 1.3).toFixed(3); });
    c.sfx('lake_morning', { vol: 1 });
    c.sfx('morning_birds', { vol: 0.8 });
  },
};

// ================================================================== T3: Reynard wakes up (his bedroom, the morning)
SHOTS.wake = {
  dur: 12.4,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 7 });
    const bed = (c.bed = g.bedtime || (g.bedtime = new Bedtime(g)));
    bed._build();
    const room = bed.room, A = room.anchors, f = bed.fox, O = room.office;
    bed._active = true; bed._skip = false; bed.clock = 0;
    g.overrideScene = bed.scene; g.overrideRig = bed.rig;
    g.state.paused = true; g.inputLocked = true;
    document.body.classList.add('bedtime-mode');
    room.setMood('morning', true); room.setSky('morning'); room.setQuilt(1, true); room.setPajamasHung(false); room.setMonocle(true);
    O.setPC('off'); O.ringAlarm(false); O.setDeskLamp(false, true);
    f.setOutfit('pajamas'); f.holdProp(null); f.hold(null); f.setExpression(null);
    f.root.position.copy(A.bed.position); f.root.rotation.y = bed.walk.yaw = A.bed.rotationY;
    f.play('sleep_bed', { fade: 0, restart: true });
    bed._fxOff();
    bed.cam('window', true);
    bed._selfDrive();
    for (let i = 0; i < 20; i++) bed._tick(1 / 30);
    bed.cam('window', true);
    const head = { getWorldPos: (p) => { (f.head || f.root).getWorldPosition(p); p.y += 0.42; return p; } };
    c.at(0.0, () => bed._glideTo('wake', 1.6));
    c.at(1.7, () => { O.ringAlarm(true); g.audio.play('alarm', { volume: 0.55 }); });
    c.at(2.5, () => { room.setQuilt(0); f.play('bed_wake', { fade: 0.05, restart: true }); });
    c.at(3.25, () => { O.ringAlarm(false); g.audio.play('bed_ding', { volume: 0.4, pitch: 0.7 }); });
    c.at(3.6, () => { f.setExpression('sleepy', { hold: 2.4 }); f.talk('Mmh... morning already?'); c.say(head, 'Mmh... morning already?', { voice: 'fox', mood: 'whisper', dur: 2.3, size: 'm' }); });
    c.at(5.0, () => f.play('stretch', { fade: 0.2, speed: 1.45, restart: true }));
    c.at(6.6, () => {
      const mug = makeMug(); mug.position.set(0, -0.1, 0.01); f.hold(mug);
      f.puff('star', new THREE.Vector3(-0.25, 0.55, 0.3), { vel: new THREE.Vector3(0, 0.3, 0.1), life: 0.6, size: 0.07 });
      g.audio.play('pop_in', { volume: 0.35 });
      f.play('sip_coffee', { fade: 0.15, restart: true });
    });
    c.at(7.6, () => { f.setExpression('scheming', { hold: 2 }); f.talk('The bears must eat...'); c.say(head, 'The bears must eat...', { voice: 'fox', mood: 'normal', dur: 2.0, size: 'm' }); });
    c.at(9.8, () => { f.setExpression('evil_grin', { hold: 3 }); f.talk('...and the bears must PAY.'); c.say(head, '...and the bears must *PAY*.', { voice: 'fox', mood: 'excited', dur: 2.5, size: 'l' }); });
    // a slow push-in on Reynard for his lines
    let P = null;
    c.every((t) => {
      if (t < 7.0) return;
      const rig = bed.rig;
      if (!P) { const hp = new THREE.Vector3(); (f.head || f.root).getWorldPosition(hp); P = { t0: target(rig), w0: rig.wupp, t1: new THREE.Vector3(hp.x, hp.y + 0.3, hp.z), w1: rig.wupp * 0.84 }; }
      const k = smooth((t - 7.0) / 3.6);
      rig.goal.lerpVectors(P.t0, P.t1, k); rig.target.copy(rig.goal);
      rig.wupp = rig.wuppGoal = P.w0 + (P.w1 - P.w0) * k;
    });
    function target(rig) { return rig.target.clone(); }
    letterbox(c);
    const glow = document.createElement('div');
    Object.assign(glow.style, { position: 'absolute', inset: '0', background: 'radial-gradient(circle at 50% 50%, #fff6d8 0%, #ffd890 35%, rgba(255,200,120,0) 70%)', opacity: 1 });
    c.ov.root.appendChild(glow);
    c.ov.fn((t) => { glow.style.opacity = (1 - smooth(t / 0.9)).toFixed(3); });
  },
};

// ================================================================== the montage (Fireflies and Stardust): glimpses, no spoilers
// a quick look: letterbox + a slow camera drift between two framings
function glimpse(c, a, b) {
  c.path([{ t: 0, ...a }, { t: c.dur, ...b, ease: 'linear' }]);
  letterbox(c);
}

// a. new life: two fish fall in love, the eggs hatch
SHOTS.m_hatch = {
  dur: 3.0,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 8.2 });
    clearDecos(g, 56, 36, 82, 60);
    stockPond(g, 30, ['aurora', 'mapleKoi', 'tiger', 'sockeye', 'brook', 'bluegill']);
    c.presim(1.5);
    const near = (x, z) => g.fish.list.filter((f) => f.adult && !f.dead).sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z));
    const [a, b] = near(67.2, 33.4);
    a.x = 66.95; a.z = 33.4; b.x = 67.45; b.z = 33.4;
    let egg = null;
    c.at(0.25, () => { const n = g.fish.eggs.length; try { g.fish.mate(a, b); } catch (e) { console.warn('[dir] mate', e); } if (g.fish.eggs.length > n) egg = g.fish.eggs[g.fish.eggs.length - 1]; });
    c.at(1.6, () => { if (egg) g.fish.hatchNow(egg); });
    glimpse(c, { x: 67.2, z: 33.9, y: 0, yaw: 0.2, pitch: 36, wupp: 0.0092 }, { x: 67.2, z: 33.6, y: 0, yaw: 0.12, pitch: 38, wupp: 0.0078 });
  },
};

// b. five o'clock: the vintage clock rings
SHOTS.m_clock = {
  dur: 1.6,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 16.97 });
    stockPond(g, 20);
    c.presim(0.5);
    keepUI('.bigclock-host', { position: 'fixed', left: '50%', top: '50%', right: 'auto', bottom: 'auto', margin: '0', transition: 'none', transform: 'translate(-50%,-50%) scale(3.4)', transformOrigin: '50% 50%', zIndex: 60 });
    c.at(0.15, () => { g.state.hour = 17.0; try { g.startRush(); } catch (e) { console.warn('[dir] rush', e); } });
    glimpse(c, { x: 68, z: 33, y: 0, yaw: 0, pitch: 40, wupp: 0.02 }, { x: 68, z: 33, y: 0, yaw: 0.02, pitch: 40, wupp: 0.019 });
    c.ov.fade(0, 0.01, 0.45, 0.45, '#120818');
  },
  update(c, t) { if (t < 0.15) c.g.state.hour = 16.97 + t * 0.15; },
};

// c. the bears march in against the evening sky (camera south of the herd, the sky curtain behind it)
SHOTS.m_march = {
  dur: 3.0,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 17.1 });
    stockPond(g, 24);
    clearDecos(g, 56, 14, 90, 70);
    const { bearParade } = await import('./shots_promo.js');
    bearParade(c, { x: 71, z0: 21.5, speed: 1.2 });
    c.presim(0.3);
    skyCurtain(c);
    const keys = [{ t: 0, x: 71, z: 22.6, y: 0.7, yaw: 0.1, pitch: 9, wupp: 0.0155 }, { t: 3.0, x: 71, z: 23.8, y: 0.7, yaw: 0.06, pitch: 9, wupp: 0.0145, ease: 'linear' }];
    c.every((t) => { skyCam(c, { ...camAt(keys, t), skyD: 5.5 }, [-0.16, 0.4], t); });
    letterbox(c);
  },
};

// d. the feast: bears eat, Reynard cashes in
SHOTS.m_feast = {
  dur: 2.9,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 17.6 });
    stockPond(g, 34);
    clearDecos(g, 56, 38, 80, 56);
    g.state.day = 9; g.wave = g.bears.planWave(9);
    g.state.hour = 16.95; g.startRush();
    for (const b of g.bears.list) b.t = Math.min(b.t ?? 0, 0.2 + Math.random());
    c.presim(1.6);
    for (const b of g.bears.list) if (b.state === 'commute') b.trailD = Math.max(b.trailD, g.bears.trailTotal - 2);
    c.presim(9);
    const fox = addFox(c, 69.8, 39.0, { ry: -0.2, anim: 'cheer' });
    fox.setExpression('greedy', { hold: 9 });
    const vis = () => g.bears.list.filter((b) => b.visible && Math.abs(b.x - 68) < 5 && Math.abs(b.z - 34) < 4);
    for (const [t, k, amt] of [[0.3, 0, 22], [1.0, 1, 30], [1.7, 2, 41], [2.3, 3, 18]]) c.at(t, () => { const b = vis()[k] || g.bears.list[k]; if (b) g.earn(amt, b); });
    glimpse(c, { x: 68.2, z: 35.8, y: 0.4, yaw: -0.25, pitch: 24, wupp: 0.0165 }, { x: 68.6, z: 35.8, y: 0.4, yaw: -0.15, pitch: 24, wupp: 0.0152 });
  },
};

// e. beavers clear the forest (a tree comes down)
SHOTS.m_beavers = {
  dur: 2.9,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 14.5 });
    const { beaverWork } = await import('./shots_promo.js');
    beaverWork(c, { presim: 8 });
    glimpse(c, { x: 75.8, z: 26.6, y: 0.5, yaw: -0.35, pitch: 26, wupp: 0.0135 }, { x: 76.0, z: 26.3, y: 0.5, yaw: -0.25, pitch: 26, wupp: 0.0125 });
  },
};

// f. building: the meadow fills up (a time-lapse of pop-ins)
SHOTS.m_build = {
  dur: 2.9,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 11.5 });
    stockPond(g, 20);
    clearDecos(g, 56, 36, 84, 56);
    c.presim(1);
    const builds = [
      [0.1, 'rs_umbrella', 63, 40], [0.35, 'picnic', 66, 40], [0.55, 'lantern', 69, 39], [0.75, 'flag', 72, 39], [0.95, 'rs_bench', 74, 41],
      [1.15, 'flowers', 62, 42], [1.3, 'picnic', 68, 42], [1.45, 'maple', 60, 41], [1.6, 'rs_campfire', 71, 42], [1.75, 'beehive', 75, 43],
      [1.9, 'flowers', 65, 43], [2.05, 'willow', 77, 40], [2.2, 'lantern', 64, 44], [2.35, 'rs_icecream', 69, 44], [2.5, 'flowers', 73, 45],
    ];
    for (const [t, type, x, z] of builds) {
      c.at(t, () => {
        let s = null;
        try { s = g.structures.place(type, x, z, { instant: true, free: true }); } catch (e) { console.warn('[dir] place', type, e); }
        if (!s) return;
        const y = c.ground(x + 0.5, z + 0.5);
        g.particles.popIn?.(x + 0.5, y + 0.2, z + 0.5, 1);
        g.particles.puff(x + 0.5, y + 0.3, z + 0.5, 8, 0.4);
        g.audio.play('place', { volume: 0.35, pitch: 0.9 + Math.random() * 0.4 });
      });
    }
    glimpse(c, { x: 68.5, z: 40.2, y: 0.3, yaw: 0.35, pitch: 30, wupp: 0.0205 }, { x: 68.5, z: 40.6, y: 0.3, yaw: 0.25, pitch: 31, wupp: 0.019 });
  },
};

// g. the resort at night: lanterns, steam, bears in the hot tub (luxury)
SHOTS.m_resort = {
  dur: 3.0,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 15 });
    clearDecos(g, 58, 20, 86, 34);
    const put = (t, x, z) => { try { return g.structures.place(t, x, z, { instant: true, free: true }); } catch { return null; } };
    const S = { spa: put('rs_spa', 65, 24), tub: put('rs_hottub', 74, 25), towels: put('rs_towels', 78, 25), sauna: put('rs_sauna', 70, 24), bench: put('rs_bench', 61, 27) };
    for (const [x, z] of [[63, 27], [68, 27], [72, 27], [76, 27], [67, 22], [79, 23]]) put('lantern', x, z);
    put('rs_campfire', 69, 28); put('rs_massagechair', 62, 23);
    c.presim(3);
    const bs = [bearAt(g, 65.5, 27.5), bearAt(g, 66.5, 27.6, 'intern'), bearAt(g, 75, 28.2, 'hipster'), bearAt(g, 74.5, 28.6, 'office'), bearAt(g, 70.5, 27.5, 'jogger')];
    try { g.resort.visit(bs[0], S.spa); g.resort.visit(bs[1], S.spa); g.resort.visit(bs[2], S.tub); g.resort.visit(bs[3], S.tub); g.resort.visit(bs[4], S.sauna); } catch (e) { console.warn('[dir] visits', e); }
    c.presim(5);
    c.hour = 19.9; c.phase = 'night';
    glimpse(c, { x: 70.6, z: 25.4, y: 0.4, yaw: -0.3, pitch: 24, wupp: 0.0175 }, { x: 71.4, z: 25.4, y: 0.4, yaw: -0.2, pitch: 24, wupp: 0.0162 });
  },
};

// h. winter: snow over the pond, shivering bears, the hot tub steams
SHOTS.m_winter = {
  dur: 2.9,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 12.5 });
    const { winterScene } = await import('./shots_promo.js');
    winterScene(c);
    glimpse(c, { x: 66.8, z: 41.0, y: 0.4, yaw: 0.3, pitch: 22, wupp: 0.0145 }, { x: 66.9, z: 41.2, y: 0.4, yaw: 0.2, pitch: 22, wupp: 0.0135 });
  },
};

// i. a feast event: Karen wants the manager (one line)
SHOTS.m_karen = {
  dur: 10.6,
  async setup(c) {
    await (await import('./shots_promo.js')).SHOTS.karen.setup(c);
    letterbox(c);
  },
};

// j. rampage: the hot tub goes flying
SHOTS.m_rampage = {
  dur: 2.4,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 15.8 });
    clearDecos(g, 60, 20, 84, 40);
    const tub = g.structures.place('rs_hottub', 72, 24, { instant: true, free: true });
    g.structures.place('rs_ticket', 68, 24, { instant: true, free: true });
    g.structures.place('lodge', 76, 27, { instant: true, free: true });
    c.presim(2);
    const b = bearAt(g, 70.6, 26.2, 'office');
    for (const bv of g.beavers.list) { bv.x = 71 + Math.random() * 2; bv.z = 26.5 + Math.random(); }
    try { g.bears.startRampage(b); } catch (e) { console.warn('[dir] rampage', e); }
    c.presim(0.5);
    c.at(0.35, () => { try { g.structures.damage(tub, 99); } catch (e) { console.warn('[dir] dmg', e); } g.rig.shake = 1.0; });
    glimpse(c, { x: 72.2, z: 26.4, y: 0.4, yaw: 0.25, pitch: 26, wupp: 0.0145 }, { x: 72.5, z: 26.2, y: 0.4, yaw: 0.2, pitch: 26, wupp: 0.0132 });
  },
};

// k. a glimpse of something old behind the falls (a silhouette, nothing more)
SHOTS.m_falls = {
  dur: 3.2,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 18.7 });
    D_noFog(false);
    try {
      const { ZONE_BY_ID } = await import('../../src/data/zones.js');
      for (const id of ['bridge', 'thorns', 'log', 'cliff']) g.expedition?.open?.(id, { quiet: true });
      await g.zones.reveal(ZONE_BY_ID.deep, null, { quiet: true });
    } catch (e) { console.warn('[dir] reveal deep', e); }
    c.presim(2);
    const v = g.villagers.get('longneck');
    if (v) v.t = 1e9;
    c.hour = 18.7; c.phase = 'night';
    clearDecos(g, 29, 197.5, 45, 232);
    // a short eye distance: the default one would sit out in the mountains south of the valley
    glimpse(c, { x: 36.0, z: 195.6, y: 1.6, yaw: 0.1, pitch: 13, wupp: 0.0122 }, { x: 36.2, z: 195.3, y: 1.6, yaw: 0.05, pitch: 13, wupp: 0.0108 });
    c.every(() => { c.g.rig.dist = 16; });
    // dusk + mist: only the silhouette reads
    const veil = document.createElement('div');
    Object.assign(veil.style, { position: 'absolute', inset: '0', background: 'radial-gradient(ellipse at 50% 42%, rgba(40,50,90,0.0) 0%, rgba(20,22,48,0.35) 50%, rgba(8,8,20,0.85) 100%)' });
    c.ov.root.appendChild(veil);
    c.ov.fade(0, 0.6, 1, 0, '#000');
    c.ov.fade(2.6, 3.2, 0, 1, '#000');
  },
};
function D_noFog(on) { window.__dir.noFog = on; }

// l. Reynard, at night, very pleased with himself
SHOTS.m_reynard = {
  dur: 3.0,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 21.5 });
    clearDecos(g, 60, 39, 90, 56);
    clearDecos(g, 75.5, 44, 81.5, 92);
    stockPond(g, 12);
    const fox = addFox(c, 78.6, 45.5, { ry: 0.0, anim: 'laugh_evil' });
    fox.setExpression('mwaha', { hold: 9 });
    c.presim(0.5);
    c.hour = 21.5; c.phase = 'night';
    c.at(0.4, () => g.particles.coins(78.6, 1.7, 45.5, 14));
    c.at(1.4, () => g.particles.coins(78.6, 1.7, 45.5, 14));
    glimpse(c, { x: 78.6, z: 45.5, y: 0.75, yaw: 0.0, pitch: 16, wupp: 0.0078 }, { x: 78.6, z: 45.5, y: 0.72, yaw: 0.0, pitch: 15, wupp: 0.0068 });
  },
};

// the title card over a slow golden-hour drift above the pond
SHOTS.title = {
  dur: 9.0,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 18.2 });
    stockPond(g, 24);
    const T = skyCurtain(c);
    const keys = [{ t: 0, x: 70.5, z: 35.8, y: 0.3, yaw: -0.6, pitch: 15, wupp: 0.02 }, { t: 9, x: 71.5, z: 35.2, y: 0.3, yaw: -0.5, pitch: 15, wupp: 0.018, ease: 'linear' }];
    c.every((t) => { skyCam(c, camAt(keys, t), [-0.08, 0.5], t); g.state.hour = 18.2; });
    letterbox(c);
    c.ov.fade(0, 0.8, 1, 0.35, '#000');
    c.ov.card(['THE BEAR', 'MUST EAT'], { t0: 0.6, t1: 99, anim: 'slam', y: 0.45, size: 125, sizes: [104.17, 145.83], gap: -14, outline: 5, outer: 4, outlineColor: '#3a1408', outerColor: '#fff6e0', fill: FILL_GOLD, rot: -3 });
    c.at(0.58, () => c.sfx('dramatic_boom', { vol: 0.55 }));
    c.ov.text('Music: "Morning" and "Fireflies and Stardust" by Kevin MacLeod (incompetech.com), CC BY 4.0', { t0: 2.0, t1: 99, x: 0.5, y: 0.935, size: 20.83, anim: 'fade', color: '#e8dcc8', outline: 2 });
  },
};
