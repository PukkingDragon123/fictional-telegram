// Trailer v2 shots: cinematic camera work in the game's own high three-quarter view, no
// speech at all (c.noTalk), kinetic text / transitions / grade added in post (build2.py,
// edl_trailer2.json made by make_edl_trailer2.py). Every shot is rendered with margins
// (render_edl.py) so the overlap transitions have frames past the cut.
import * as THREE from 'three';
import { Bedtime } from '../../src/game/Bedtime.js';
import { makeMug } from '../../src/entities/foxOffice.js';
import { setCam, camAt, lerp, smooth, clamp, D2R } from './director.js';
import { prep, clearDecos, stockPond, addRig, addFox, bearAt, holdBear, bearParade, winterScene, beaverWork } from './shots_promo.js';
import { skyCurtain, skyCam, dawnLight } from './shots_trailer.js';
import { HUT_SPOTS } from '../../src/world/hut.js';
import { HUT } from '../../src/world/worldgen.js';

export const SHOTS = {};

// Reynard's cottage (src/world/hut.js, v28): world positions of the pane the camera dives through
// (HUT_SPOTS.dive: the left window's upper-right pane, the living room's lit lamp shade right behind
// it; NOT windows[0], which is the mullion crossing) and the door, from the model's own HUT_SPOTS
const SP = HUT_SPOTS, DV = SP.dive || SP.windows[0].panes[3];
export const HOUSE = {
  win: { x: HUT.x + DV.x, y: DV.y, z: HUT.z + DV.z },
  door: { x: HUT.x + SP.door.x, z: HUT.z + SP.door.z },
  front: { x: HUT.x + SP.door.x, z: HUT.z + SP.door.z + 0.4 },
};
// the rooms behind the windows glow (night look) whatever the hour
function litHouse(g, k = 0.85) {
  const fx = g.world.hutFx;
  if (!fx || fx.__vid) return;
  const up = fx.update.bind(fx);
  fx.update = (time, night) => up(time, Math.max(night || 0, typeof k === 'function' ? k() : k));
  fx.__vid = true;
}

function quiet(c, o) { prep(c, o); c.noTalk(); }
function path(c, keys) { c.every((t) => setCam(c.g.rig, camAt(keys, t))); }
// monotone cubic (Fritsch-Carlson) through pts [[t, v], ...]; d0 = slope at the first point (null: natural)
function pchip(pts, d0 = null) {
  const n = pts.length, h = [], m = [];
  for (let i = 0; i < n - 1; i++) { h[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / h[i]; }
  const d = new Array(n).fill(0);
  d[0] = d0 ?? m[0]; d[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) { d[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    d[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
  }
  return (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    if (t >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (t > pts[i + 1][0]) i++;
    const u = (t - pts[i][0]) / h[i], u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * pts[i][1] + (u3 - 2 * u2 + u) * h[i] * d[i] + (-2 * u3 + 3 * u2) * pts[i + 1][1] + (u3 - u2) * h[i] * d[i + 1];
  };
}

// ================================================================== the opening: dawn crane -> the house -> the window
SHOTS.t2_dawn = {
  dur: 22.2,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 6.4 });
    stockPond(g, 26);
    clearDecos(g, 60, 36, 86, 60);
    clearDecos(g, 75.5, 44, 81.5, 92);
    skyCurtain(c);
    g.fox.rig.root.visible = false;
    let K = 0;
    dawnLight(c, () => K);
    litHouse(g, 0.9);
    c.presim(1);
    const W = HOUSE.win;
    console.log('[dir] window', JSON.stringify(W));
    const keys = [
      { t: 0.0, x: 64.0, z: 29.5, y: 0.0, yaw: -0.55, pitch: 62, wupp: 0.03 },
      { t: 8.5, x: 69.5, z: 34.5, y: 0.3, yaw: -0.22, pitch: 13, wupp: 0.021 },
      { t: 13.5, x: 77.9, z: 41.0, y: 0.7, yaw: -0.04, pitch: 10, wupp: 0.0125 },
      { t: 17.0, x: W.x, z: W.z - 0.2, y: W.y + 0.05, yaw: 0.0, pitch: 8, wupp: 0.0058 },
      { t: 19.6, x: W.x, z: W.z, y: W.y, yaw: 0.0, pitch: 6.5, wupp: 0.0013 },
      { t: 22.2, x: W.x, z: W.z, y: W.y, yaw: 0.0, pitch: 6, wupp: 0.00058 },
    ];
    // one continuous push from 13.5 s (log wupp through these, monotone cubic, starting at rest)
    const zoomK = pchip([[13.5, 0.0125], [17.0, 0.0058], [19.6, 0.0013], [20.4, 0.00095], [21.2, 0.0007], [22.2, 0.00058]].map(([t, w]) => [t, Math.log(w)]), 0);
    // through the glass: the ortho eye comes in close so its near plane (1 unit ahead of the eye) sweeps
    // through the shutters (19.8 s), the glass (20.1 s) and the curtains, and stops just short of the lamp
    const eyeAt = (t) => (t < 19.3 ? null : 0.82 + 0.88 * (1 - clamp((t - 19.3) / 1.5, 0, 1)) ** 2);
    c.at(0, () => console.log('[dir] dawn rt', g.renderer.rtW, g.renderer.rtH));
    c.every((t) => {
      K = smooth(t / 12);
      const cam = camAt(keys, t);
      if (t > 13.5) cam.wupp = Math.exp(zoomK(t));
      // high up, the sky curtain hangs just past the top of the frame, so it rises into view as the crane comes down
      const rr = g.renderer, sp = Math.sin(cam.pitch * D2R), hh = (rr.rtH * cam.wupp) / 2;
      const skyD = Math.max(3.6, (hh + 0.6) / Math.max(0.05, sp)); // always behind the house
      skyCam(c, { ...cam, skyD }, [lerp(0.05, 0.22, smooth(t / 13)), lerp(0.04, 0.52, smooth(t / 14))], t);
      const ed = eyeAt(t);
      if (ed != null) { g.rig.dist = ed; g.rig.eyeGuard = (tx, ty, tz, yaw, pitch, hw, hh, d0) => d0; } // no rock to dodge here
      g.state.hour = 6.3 + t * 0.05;
    });
    // pre-dawn darkness lifting (multiply veil)
    const d = document.createElement('div');
    Object.assign(d.style, { position: 'absolute', inset: '0', background: 'linear-gradient(180deg, #2a2a6a 0%, #4a3a7a 55%, #6a4a6a 100%)', mixBlendMode: 'multiply' });
    c.ov.root.appendChild(d);
    c.ov.fn((t) => { d.style.opacity = (0.62 * (1 - smooth(t / 8))).toFixed(3); });
    c.ov.fade(0, 1.4, 1, 0, '#000');
    c.sfx('lake_morning', { vol: 0.9 });
    c.sfx('morning_birds', { vol: 0.8 });
  },
};

// ================================================================== Reynard wakes (wordless)
function anchorCam(bed, name, k = 1) {
  const a = bed.room.anchors['cam' + name[0].toUpperCase() + name.slice(1)];
  const r = bed.game.renderer;
  const wupp = Math.max(a.fit.w / Math.max(1, r.lowW), a.fit.h / Math.max(1, r.lowH)) * k;
  return { x: a.target.x, y: a.target.y, z: a.target.z, yaw: a.yaw || 0, pitch: a.pitch / D2R, wupp };
}
SHOTS.t2_wake = {
  dur: 8.4,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 7 });
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
    bed._fxOn();
    bed._selfDrive();
    for (let i = 0; i < 30; i++) bed._tick(1 / 30);
    const close = anchorCam(bed, 'bed', 0.62), wide = anchorCam(bed, 'wake', 1.0);
    const hp = new THREE.Vector3(); (f.head || f.root).getWorldPosition(hp);
    const face = { x: hp.x, y: hp.y - 0.05, z: hp.z, yaw: wide.yaw, pitch: wide.pitch, wupp: wide.wupp * 0.7 };
    const keys = [
      { t: 0, ...close, x: close.x + 0.15 },
      { t: 4.0, ...close, wupp: close.wupp * 1.15 },
      { t: 5.8, ...wide, wupp: wide.wupp * 0.92 },
      { t: 8.4, ...face },
    ];
    c.every((t) => setCam(bed.rig, camAt(keys, t)));
    c.at(3.38, () => { bed._fxOff(); O.ringAlarm(true); g.audio.play('alarm', { volume: 0.55 }); });
    c.at(4.1, () => { room.setQuilt(0); f.play('bed_wake', { fade: 0.05, restart: true }); });
    c.at(4.8, () => { O.ringAlarm(false); });
    c.at(5.3, () => f.play('stretch', { fade: 0.2, speed: 1.45, restart: true }));
    c.at(6.4, () => {
      const mug = makeMug(); mug.position.set(0, -0.1, 0.01); f.hold(mug);
      g.audio.play('pop_in', { volume: 0.3 });
      f.play('sip_coffee', { fade: 0.15, restart: true });
    });
    c.at(7.15, () => f.setExpression('smug', { hold: 3 }));
  },
};

// ================================================================== montage
// a. BREED: top-down, slow push and quarter orbit over a couple in love; the eggs hatch
SHOTS.t2_hatch = {
  dur: 4.2,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 9.5 });
    clearDecos(g, 56, 36, 82, 60);
    stockPond(g, 34, ['aurora', 'mapleKoi', 'tiger', 'sockeye', 'brook', 'bluegill', 'rainbow']);
    c.presim(1.5);
    const near = (x, z) => g.fish.list.filter((f) => f.adult && !f.dead).sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z));
    const [a, b] = near(67.2, 33.0);
    a.x = 66.95; a.z = 33.0; b.x = 67.45; b.z = 33.0;
    let egg = null;
    c.at(0.55, () => { const n = g.fish.eggs.length; try { g.fish.mate(a, b); } catch (e) { console.warn('[dir] mate', e); } if (g.fish.eggs.length > n) egg = g.fish.eggs[g.fish.eggs.length - 1]; });
    c.at(1.95, () => { if (egg) g.fish.hatchNow(egg); });
    path(c, [
      { t: 0, x: 67.2, z: 33.25, y: 0, yaw: 0.35, pitch: 64, wupp: 0.0138 },
      { t: 4.2, x: 67.2, z: 33.05, y: 0, yaw: -0.05, pitch: 60, wupp: 0.0104, ease: 'linear' },
    ]);
  },
};

// b. THE BEARS ARE COMING: the parade at golden hour, low angle against the sky, the camera backs away
SHOTS.t2_march = {
  dur: 5.4,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 17.2 });
    stockPond(g, 24);
    clearDecos(g, 56, 14, 90, 70);
    bearParade(c, { x: 71, z0: 25.6, speed: 1.05, n: 9 });
    c.presim(0.3);
    skyCurtain(c);
    const keys = [
      { t: 0, x: 71, z: 26.8, y: 1.5, yaw: 0.16, pitch: 8, wupp: 0.0138 },
      { t: 5.4, x: 71, z: 30.4, y: 1.4, yaw: 0.04, pitch: 10, wupp: 0.0158, ease: 'linear' },
    ];
    c.every((t) => skyCam(c, { ...camAt(keys, t), skyD: 5.5 }, [-0.16, 0.36], t));
  },
};

// the feast at the shore (bears eating, splashes) with a slow orbit
function feastScene(c, { day = 9 } = {}) {
  const g = c.g;
  stockPond(g, 38);
  clearDecos(g, 56, 36, 82, 60);
  g.state.day = day; g.wave = g.bears.planWave(day);
  g.state.hour = 16.95; g.startRush();
  for (const b of g.bears.list) b.t = Math.min(b.t ?? 0, 0.2 + Math.random());
  c.presim(1.6);
  for (const b of g.bears.list) if (b.state === 'commute') b.trailD = Math.max(b.trailD, g.bears.trailTotal - 2);
  c.presim(9);
}
// c. FEED
SHOTS.t2_feast = {
  dur: 4.0,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 17.5 });
    feastScene(c);
    path(c, [
      { t: 0, x: 68.0, z: 34.8, y: 0.3, yaw: -0.5, pitch: 34, wupp: 0.0145 },
      { t: 4.0, x: 68.4, z: 34.8, y: 0.3, yaw: -0.15, pitch: 30, wupp: 0.013, ease: 'linear' },
    ]);
  },
};

// d. GET RICH: Reynard in a rain of coins, push-in (no words)
SHOTS.t2_rich = {
  dur: 4.0,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 17.6 });
    feastScene(c);
    const fox = addFox(c, 69.6, 38.9, { ry: -0.15, anim: 'count_coins' });
    fox.setExpression('greedy', { hold: 9 });
    const vis = () => g.bears.list.filter((b) => b.visible && Math.abs(b.x - 68) < 5 && Math.abs(b.z - 35) < 4);
    for (const [t, k, amt] of [[0.2, 0, 22], [0.9, 1, 30], [1.6, 2, 41], [2.3, 3, 18], [3.0, 4, 26]]) c.at(t, () => { const b = vis()[k] || g.bears.list[k]; if (b) g.earn(amt, b); });
    for (const t of [0.5, 1.3, 2.1, 2.9]) c.at(t, () => g.particles.coins(69.6, 1.9, 38.9, 12));
    c.at(1.8, () => fox.play('greedy', { fade: 0.15 }));
    path(c, [
      { t: 0, x: 69.3, z: 38.2, y: 0.9, yaw: -0.25, pitch: 14, wupp: 0.0105 },
      { t: 4.0, x: 69.6, z: 38.9, y: 1.05, yaw: -0.08, pitch: 11, wupp: 0.0062, ease: 'smooth' },
    ]);
  },
};

// e. BUILD: crane up while the meadow fills (time-lapse pop-ins)
SHOTS.t2_build = {
  dur: 4.0,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 11.5 });
    stockPond(g, 20);
    clearDecos(g, 56, 36, 84, 56);
    c.presim(1);
    const builds = [
      [0.15, 'rs_umbrella', 63, 38], [0.3, 'picnic', 66, 39], [0.45, 'lantern', 68, 38], [0.6, 'flag', 71, 38], [0.75, 'rs_bench', 73, 39],
      [0.9, 'flowers', 62, 40], [1.05, 'picnic', 69, 40], [1.2, 'maple', 60, 39], [1.35, 'rs_campfire', 71, 40], [1.5, 'beehive', 75, 41],
      [1.65, 'flowers', 64, 41], [1.8, 'willow', 77, 39], [1.95, 'lantern', 65, 42], [2.1, 'rs_icecream', 67, 41], [2.25, 'flowers', 73, 42],
      [2.4, 'rs_photo', 62, 42], [2.55, 'lantern', 70, 42], [2.7, 'rs_souvenir', 75, 43], [2.85, 'flowers', 68, 43], [3.0, 'maple', 60, 43],
    ];
    for (const [t, type, x, z] of builds) {
      c.at(t, () => {
        let s = null;
        try { s = g.structures.place(type, x, z, { instant: true, free: true }); } catch (e) { console.warn('[dir] place', type, e); }
        if (!s) return;
        const y = c.ground(x + 0.5, z + 0.5);
        g.particles.popIn?.(x + 0.5, y + 0.2, z + 0.5, 1);
        g.particles.puff(x + 0.5, y + 0.3, z + 0.5, 8, 0.4);
        g.audio.play('place', { volume: 0.3, pitch: 0.9 + Math.random() * 0.4 });
      });
    }
    path(c, [
      { t: 0, x: 68.6, z: 40.2, y: 0.3, yaw: 0.5, pitch: 26, wupp: 0.0132 },
      { t: 4.0, x: 68.6, z: 40.6, y: 0.3, yaw: 0.2, pitch: 46, wupp: 0.0185, ease: 'smooth' },
    ]);
  },
};

// f. EXPAND: beavers chop the forest, slow orbit
SHOTS.t2_beavers = {
  dur: 4.0,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 14.5 });
    beaverWork(c, { presim: 8 });
    path(c, [
      { t: 0, x: 75.9, z: 26.4, y: 0.5, yaw: -0.55, pitch: 30, wupp: 0.0128 },
      { t: 4.0, x: 76.1, z: 26.2, y: 0.5, yaw: -0.2, pitch: 28, wupp: 0.0118, ease: 'linear' },
    ]);
  },
};

// g. LUXURY: the resort at night, lanterns + steam, slow orbit
SHOTS.t2_resort = {
  dur: 4.0,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 15 });
    clearDecos(g, 58, 20, 86, 34);
    const put = (t, x, z) => { try { return g.structures.place(t, x, z, { instant: true, free: true }); } catch { return null; } };
    const S = { spa: put('rs_spa', 65, 24), tub: put('rs_hottub', 74, 25), towels: put('rs_towels', 78, 25), sauna: put('rs_sauna', 70, 24), bench: put('rs_bench', 61, 27) };
    for (const [x, z] of [[63, 27], [68, 27], [72, 27], [76, 27], [67, 22], [79, 23], [60, 25]]) put('lantern', x, z);
    put('rs_campfire', 69, 28); put('rs_massagechair', 62, 23); put('rs_umbrella', 77, 28);
    c.presim(3);
    const bs = [bearAt(g, 65.5, 27.5), bearAt(g, 66.5, 27.6, 'intern'), bearAt(g, 75, 28.2, 'hipster'), bearAt(g, 74.5, 28.6, 'office'), bearAt(g, 70.5, 27.5, 'jogger')];
    try { g.resort.visit(bs[0], S.spa); g.resort.visit(bs[1], S.spa); g.resort.visit(bs[2], S.tub); g.resort.visit(bs[3], S.tub); g.resort.visit(bs[4], S.sauna); } catch (e) { console.warn('[dir] visits', e); }
    c.presim(5);
    c.hour = 20.6; c.phase = 'night';
    path(c, [
      { t: 0, x: 71.6, z: 25.6, y: 0.4, yaw: -0.7, pitch: 26, wupp: 0.0158 },
      { t: 4.0, x: 71.6, z: 25.4, y: 0.4, yaw: -0.25, pitch: 24, wupp: 0.0142, ease: 'linear' },
    ]);
  },
};

// h. EVERY SEASON: snow, the campfire, a steaming hot tub; a slow sideways dolly
SHOTS.t2_winter = {
  dur: 4.0,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 12.5 });
    winterScene(c);
    c.presim(1);
    path(c, [
      { t: 0, x: 66.0, z: 41.4, y: 0.4, yaw: 0.4, pitch: 26, wupp: 0.0142 },
      { t: 4.0, x: 67.6, z: 41.2, y: 0.4, yaw: 0.2, pitch: 24, wupp: 0.0132, ease: 'linear' },
    ]);
  },
};

// i. UH-OH: a rampaging bear, the hot tub explodes; a snap push-in on the hit
SHOTS.t2_rampage = {
  dur: 3.6,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 15.8 });
    clearDecos(g, 60, 20, 84, 40);
    const tub = g.structures.place('rs_hottub', 72, 24, { instant: true, free: true });
    g.structures.place('rs_ticket', 68, 24, { instant: true, free: true });
    g.structures.place('lodge', 76, 27, { instant: true, free: true });
    c.presim(2);
    const b = bearAt(g, 70.4, 26.4, 'office');
    for (const bv of g.beavers.list) { bv.x = 71 + Math.random() * 2; bv.z = 26.5 + Math.random(); }
    try { g.bears.startRampage(b); } catch (e) { console.warn('[dir] rampage', e); }
    c.presim(0.4);
    c.at(0.75, () => { try { g.structures.damage(tub, 99); } catch (e) { console.warn('[dir] dmg', e); } g.rig.shake = 1.1; });
    path(c, [
      { t: 0, x: 72.4, z: 26.6, y: 0.4, yaw: 0.3, pitch: 28, wupp: 0.0158 },
      { t: 0.7, x: 72.5, z: 26.4, y: 0.4, yaw: 0.28, pitch: 28, wupp: 0.0148 },
      { t: 0.95, x: 72.6, z: 26.0, y: 0.4, yaw: 0.26, pitch: 30, wupp: 0.0112, ease: 'out' },
      { t: 3.6, x: 72.7, z: 25.9, y: 0.4, yaw: 0.2, pitch: 30, wupp: 0.0102, ease: 'linear' },
    ]);
  },
};

// j. something old behind the falls: a silhouette in the mist, nothing more
SHOTS.t2_falls = {
  dur: 3.8,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 18.7 });
    window.__dir.noFog = false;
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
    path(c, [
      { t: 0, x: 36.2, z: 195.9, y: 1.6, yaw: 0.14, pitch: 13, wupp: 0.0128 },
      { t: 3.8, x: 36.3, z: 195.3, y: 1.6, yaw: 0.04, pitch: 13, wupp: 0.0102, ease: 'linear' },
    ]);
    c.every(() => { g.rig.dist = 16; });
    const veil = document.createElement('div');
    Object.assign(veil.style, { position: 'absolute', inset: '0', background: 'radial-gradient(ellipse at 50% 46%, rgba(40,50,90,0.0) 0%, rgba(20,22,48,0.4) 48%, rgba(8,8,20,0.88) 100%)' });
    c.ov.root.appendChild(veil);
  },
};

// k. Reynard's one moment: an evil laugh at night, coins everywhere (a laugh sound, no words)
SHOTS.t2_laugh = {
  dur: 2.6,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 21.5 });
    clearDecos(g, 60, 39, 90, 56);
    clearDecos(g, 75.5, 44, 81.5, 92);
    stockPond(g, 12);
    litHouse(g, 1);
    const fox = addFox(c, HOUSE.front.x, HOUSE.front.z + 1.3, { ry: 0.0, anim: 'laugh_evil' });
    fox.setExpression('mwaha', { hold: 9 });
    c.presim(0.3);
    c.hour = 21.5; c.phase = 'night';
    c.at(0.2, () => { g.audio.play('fox_laugh', { volume: 0.6 }); g.particles.coins(fox.root.position.x, 1.8, fox.root.position.z, 18); });
    c.at(1.0, () => g.particles.coins(fox.root.position.x, 1.8, fox.root.position.z, 18));
    const p = fox.root.position;
    path(c, [
      { t: 0, x: p.x, z: p.z - 0.2, y: 0.95, yaw: 0.0, pitch: 14, wupp: 0.0086 },
      { t: 2.6, x: p.x, z: p.z - 0.1, y: 0.85, yaw: 0.0, pitch: 12, wupp: 0.0062, ease: 'linear' },
    ]);
  },
};

// l. the title plate: golden hour over the pond, a slow drift (the title is added in post)
SHOTS.t2_title = {
  dur: 9.4,
  async setup(c) {
    const g = c.g;
    quiet(c, { hour: 18.2 });
    stockPond(g, 26);
    clearDecos(g, 56, 36, 84, 56);
    skyCurtain(c);
    c.presim(0.5);
    const keys = [{ t: 0, x: 69.8, z: 35.2, y: 0.3, yaw: -0.75, pitch: 13, wupp: 0.0172 }, { t: 9.4, x: 71.2, z: 35.0, y: 0.3, yaw: -0.5, pitch: 14, wupp: 0.0196, ease: 'linear' }];
    c.every((t) => skyCam(c, camAt(keys, t), [-0.06, 0.48], t));
  },
};
