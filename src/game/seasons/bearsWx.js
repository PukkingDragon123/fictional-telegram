// [v26 seasons] Bears react physically to the weather.
//
//   b.cold 0..1  shivering (fast small jitter), arms hugging the body, rubbing
//                paws, chattering teeth, steam-breath puffs, a blue-ish face and
//                a red nose, a slower walk. Cold bears beeline to warm spots
//                (game.seasons.warmSpots(): fire pits, patio heaters, spas, hot
//                tubs, saunas...) and huddle round them, paws out. Without any,
//                they lose patience, leave early and write FREEZING reviews.
//   b.hot  0..1  sweat drops, fanning themselves, tongue out; they look for a
//                misting fan, shade or a dip in the pond.
//   rain         umbrellas and newspapers over heads; soaked bears look for a
//                Rain Shelter and shake the water off.
// The look is a pose overlay (rig.layer, called by BearRig.pose) plus props on
// rig anchors; the behaviour uses the b.script hook of BearSystem.step.
import * as THREE from 'three';
import { VoxelModel } from '../../core/voxel.js';
import { FX } from '../Particles.js';
import './faces.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const smooth = (t) => t * t * (3 - 2 * t);

// poses whose arms the overlay may take over (no eating / smashing / swimming)
const FREE_POSES = new Set(['idle', 'walk', 'run', 'search', 'sad', 'talk', 'wave', 'sit', 'pay']);
const PATIENCE = new Set(['walk', 'hunt', 'search', 'walkDirect']);
const SEEK_FROM = new Set(['walk', 'search', 'hunt', 'walkDirect']);

const LINES = {
  cold: ['Brrr!', 'F-f-freezing!', 'My t-teeth!', 'Heater? Anyone?', 'Cold butt. Cold butt.', 'I can see my breath!', 'My fur is frozen stiff.'],
  coldLeave: ['Too cold. I\'m going home.', 'Nope. Frozen. Bye.', 'My paws are ice. Leaving.'],
  warm: ['Ahhh, toasty.', 'Cozy!', 'That\'s the stuff.', 'Warm paws, happy bear.', 'Ooh, a fire!'],
  hot: ['Too hot!', 'I\'m melting!', 'Shade... please...', 'Is it hot or is it me?', 'Need a fan!'],
  cool: ['Ahh, mist.', 'Sweet relief.', 'Cool breeze!'],
  rain: ['My suit!', 'Soggy!', 'Ugh, rain.', 'My hair!', 'Wet fish, wet bear.'],
  dry: ['Dry at last.', 'Nice roof.', 'Phew.'],
  thunder: ['EEK!', 'What was that?!', 'Thunder!', 'Mommy!'],
};
export const WX_REVIEWS = {
  freezing: ['FREEZING. Fish good, butt frozen.', 'FREEZING! My tie froze to my chin.', 'Two stars. FREEZING. Bring a heater.', 'Lovely pond. FREEZING. Never again in winter.', 'FREEZING out there. Where is the fire, fox?', 'FREEZING. I chewed my fish with chattering teeth.'],
  cozy: ['Cozy fire, hot fish. Perfect evening.', 'Warmed my paws by the heater. Love it.', 'Toasty! Came for fish, stayed for the fire.', 'Snow outside, warm inside. Five stars from my toes.'],
  melting: ['Too hot to eat. I melted onto the bench.', 'Heat wave and no shade. Sad bear.', 'My fur is 90% sweat now.', 'Hot. So hot. The fish were sweating too.'],
  cooled: ['The misting fan saved my life.', 'Cool mist, cold fish. Summer done right.'],
  soggy: ['Soggy suit, soggy mood. Get a roof.', 'It rained on my fish. And my hat.', 'Wet. Very wet. A shelter would be nice.', 'Rain in my soup. I did not order soup.'],
};

// ------------------------------------------------------------------ props
let PROPS = null;
function props() {
  if (PROPS) return PROPS;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const umbrellas = [[0xd8343a, 0xf6f0e6], [0x2a5ad0, 0xffd23f], [0x2e8a4a, 0xf6f0e6], [0x6a3ab0, 0xf08ac0], [0x1e1e24, 0x3a3a44]].map(([a, b]) => {
    // the grip is the origin; the shaft runs along -Y (the arm's direction, up over the head)
    const v = new VoxelModel();
    for (let y = -10; y <= 0; y++) v.set(0, y, 0, 0x5a3a24);
    v.set(1, 0, 0, 0x5a3a24); v.set(1, 1, 0, 0x5a3a24); v.set(0, 1, 0, 0x5a3a24); // hook handle
    const R = 8;
    for (let dy = 0; dy <= 3; dy++) {
      const r = R * Math.sqrt(Math.max(0, 1 - (dy / 3.6) ** 2));
      for (let x = -R; x <= R; x++)
        for (let z = -R; z <= R; z++) {
          const d = Math.hypot(x, z);
          if (d > r || (dy === 0 && d < r - 1.6)) continue;
          const panel = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8) % 2;
          v.set(x, -10 - dy, z, panel ? a : b);
        }
    }
    v.set(0, -14, 0, 0x5a3a24);
    return v.build({ pivot: [0.5, 0, 0.5], scale: 0.07 });
  });
  // a folded newspaper held over the head like a little tent
  const paper = (() => {
    const v = new VoxelModel();
    for (let x = -7; x <= 7; x++)
      for (let z = -5; z <= 5; z++) {
        const y = -Math.abs(x) * 0.25;
        const line = (z === -3 || z === -1 || z === 1 || z === 3) && Math.abs(x) > 1 && (x * 7 + z * 3) % 5 !== 0;
        const head = z === -4 && x > -6 && x < 6;
        v.set(x, Math.round(y), z, head ? 0x2a2a30 : line ? 0x9a9aa4 : (x + z) & 1 ? 0xf2efe6 : 0xe6e2d6);
      }
    return v.build({ pivot: [0.5, 0, 0.5], scale: 0.075 });
  })();
  const nose = new THREE.BoxGeometry(0.15, 0.09, 0.05);
  const noseMat = new THREE.MeshBasicMaterial({ color: 0xff4050 });
  PROPS = { mat, umbrellas, paper, nose, noseMat };
  return PROPS;
}

const _base = new THREE.Color();
const _tmpC = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);
const _arm = new Float32Array(9);
const COLD_TINT = new THREE.Color(0.8, 0.9, 1.14);
const HOT_TINT = new THREE.Color(1.12, 0.93, 0.88);

export class BearWeather {
  constructor(game, seasons) {
    this.game = game;
    this.S = seasons;
    this.warm = [];
    this.cool = [];
    this.dry = [];
    this.huddle = new Map(); // structure id -> Set(bear id)
    this.stats = { warmed: 0, cooled: 0, dried: 0, leftCold: 0 };
  }

  // per-bear weather record
  init(b) {
    const d = b.def || {};
    const t = b.typeId || '';
    const h = ((b.id * 2654435761) >>> 0) / 4294967296;
    const skip = !!(d.boss || b.hostile || b.blood || b.bossFight);
    // who carries what in the rain
    let cover = h < 0.48 ? 'umbrella' : h < 0.78 ? 'paper' : null;
    if (t === 'cub' || t === 'foreman_cub') cover = h < 0.5 ? 'umbrella' : null;
    if (t === 'lumberjack' || t === 'construction' || t === 'jogger') cover = null;
    return {
      skip, cover, uIdx: Math.floor(h * 997) % 5,
      coldK: t === 'lumberjack' ? 0.7 : t === 'cub' || t === 'foreman_cub' ? 1.2 : t === 'grandma' ? 1.15 : t === 'auditor' ? 0.5 : 1,
      hotK: t === 'jogger' || t === 'gymbro' ? 1.2 : t === 'auditor' ? 1.3 : 1,
      coldMax: 0, hotMax: 0, soakMax: 0, rain: 0, warmed: false, cooled: false, dried: false,
      steamT: Math.random() * 1.5, sweatT: Math.random(), dripT: Math.random(), sayT: 2 + Math.random() * 5, seekCd: 1 + Math.random() * 2,
      shakeT: 0, wasWater: false, mode: null, cx: 0, cz: 0, phase: h * 20, rub: h < 0.5,
    };
  }

  // ---------------------------------------------------------------- per frame
  update(simDt, dt) {
    const game = this.game, S = this.S;
    const bears = game.bears?.list;
    if (!bears || !bears.length) return;
    const ph = game.state.phase;
    const t = simDt > 0 ? simDt : ph === 'evening' ? dt : 0;
    this.warm = S.warmSpots();
    this.cool = S.coolSpots();
    this.dry = S.dryZones();
    const temp = S.temp, W = S.info, inten = S.intensity;
    const raining = !!W.precip && S.snowShare < 0.6 && inten > 0.12;
    const windChill = Math.max(0, S.wind - 1) * 2.4;
    for (const b of bears) {
      if (!b.visible || !b.rig) continue;
      const w = b.wx || (b.wx = this.init(b));
      if (w.skip) { b.cold = 0; b.hot = 0; continue; }
      this.dress(b, w);
      if (!(t > 0)) { this.look(b, w, 0); continue; }
      const warmth = this.warmthAt(b.x, b.z);
      const coolth = this.coolAt(b.x, b.z);
      const shelter = this.shelterAt(b.x, b.z);
      const covered = raining && this.coverOn(b, w);
      // --- wetness: rain soaks the uncovered, swimming soaks everyone
      if (raining && !shelter && !b.inWater && !(covered && w.cover === 'umbrella')) w.rain = Math.min(1, w.rain + t * 0.22 * inten * (covered ? 0.3 : 1));
      else w.rain = Math.max(0, w.rain - t * (shelter ? 0.12 : 0.025) - warmth * t * 0.2);
      if (b.inWater) b.wet = 1;
      else b.wet = Math.max(w.rain, (b.wet || 0) - t * (0.04 + warmth * 0.3 + (temp > 20 ? 0.06 : 0)));
      if (w.wasWater && !b.inWater && !b.jump && b.wet > 0.6 && (temp < 16 || raining)) w.shakeT = 0.75;
      w.wasWater = !!b.inWater;
      w.soakMax = Math.max(w.soakMax, w.rain);
      // --- felt temperature
      const felt = temp - windChill * (shelter ? 0.4 : 1) - b.wet * 3 - (b.inWater ? 3 : 0) + warmth * 22;
      const coldT = Math.min(1, clamp((6 - felt) / 12, 0, 1) * w.coldK);
      const feltHot = temp - (shelter ? 4 : 0) - coolth * 12 - (b.inWater ? 10 : 0) - b.wet * 4;
      const hotT = Math.min(1, clamp((feltHot - 27) / 9, 0, 1) * w.hotK);
      b.cold = b.cold ?? 0; b.hot = b.hot ?? 0;
      b.cold += (coldT - b.cold) * Math.min(1, t * (coldT < b.cold ? (warmth > 0 ? 1.1 : 0.3) : 0.32));
      b.hot += (hotT - b.hot) * Math.min(1, t * (hotT < b.hot ? 0.9 : 0.28));
      if (b.cold < 0.002) b.cold = 0;
      if (b.hot < 0.002) b.hot = 0;
      // the visit counts from arrival at the pond (the trail down is part of the trip, but gentler)
      if (b.state !== 'commute') { w.coldMax = Math.max(w.coldMax, b.cold); w.hotMax = Math.max(w.hotMax, b.hot); }
      if (b.cold > 0.5) S.teach.firstBear('cold');
      else if (b.hot > 0.55) S.teach.firstBear('hot');
      else if (w.rain > 0.55) S.teach.firstBear('soak');
      // --- mood: patience drains in the cold / heat / rain, bubbles
      if (!b.angry && PATIENCE.has(b.state) && b.goal?.kind !== 'leave' && !b.script) {
        let drain = 0;
        if (b.cold > 0.45 && warmth < 0.2) drain += 0.45 * (b.cold - 0.3);
        if (b.hot > 0.45 && coolth < 0.2 && !b.inWater) drain += 0.35 * (b.hot - 0.3);
        if (w.rain > 0.45 && !shelter) drain += 0.2;
        if (drain) b.patience = Math.max(0.05, b.patience - t * drain);
        // frozen and fed up: they go home (no rampage, just a FREEZING review)
        if (b.cold > 0.55 && !w.warmed && b.patience < 2.2 && game.bears.satisfaction(b) < 0.55 && b.state !== 'walkDirect') {
          this.stats.leftCold++;
          S.teach.firstBear('left');
          game.bears.say(b, pick(LINES.coldLeave), 'emo_sweat', null, 2);
          game.bears.beginLeave(b);
          continue;
        }
      }
      w.sayT -= t;
      if (w.sayT <= 0) {
        w.sayT = 7 + Math.random() * 9;
        const busy = b.state === 'eat' || b.state === 'pay' || b.state === 'commute';
        if (!busy && !b.angry) {
          if (b.cold > 0.5 && warmth < 0.3) game.bears.say(b, pick(LINES.cold), 'emo_sweat', null, 1.8);
          else if (b.hot > 0.5 && coolth < 0.3) game.bears.say(b, pick(LINES.hot), 'emo_sweat', null, 1.8);
          else if (w.rain > 0.5 && !shelter) game.bears.say(b, pick(LINES.rain), null, null, 1.6);
        }
      }
      // --- go somewhere nicer
      w.seekCd -= t;
      if (w.seekCd <= 0 && !b.script) {
        w.seekCd = 1.2 + Math.random();
        if (this.canSeek(b)) {
          if (b.cold > 0.42 && this.warm.length) this.seek(b, w, 'warm');
          else if (b.hot > 0.5 && (this.cool.length || this.dry.length)) this.seek(b, w, 'cool');
          else if (raining && w.rain > 0.4 && this.dry.length) this.seek(b, w, 'dry');
        }
      }
      this.look(b, w, t);
    }
  }

  canSeek(b) {
    if (b.script || b.angry || b.hostile || b.jump || b.lunge > 0 || b.boss) return false;
    if (!SEEK_FROM.has(b.state) || b.goal?.kind === 'leave' || b.closing) return false;
    if (b.state === 'walkDirect') return false;
    return true;
  }

  // ---------------------------------------------------------------- places
  center(s) { const [w, d] = s.def?.size || [1, 1]; return { x: s.x + w / 2, z: s.z + d / 2 }; }
  warmthAt(x, z) {
    let best = 0;
    for (const s of this.warm) {
      const r = this.S.warmRadius(s), c = this.center(s);
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < r) best = Math.max(best, 1 - (d / r) * 0.55);
    }
    return best;
  }
  coolAt(x, z) {
    let best = 0;
    for (const s of this.cool) {
      const r = s.def?.cool || 1, c = this.center(s);
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < r) best = Math.max(best, 1 - (d / r) * 0.5);
    }
    return best;
  }
  shelterAt(x, z) {
    for (const s of this.dry) {
      const r = s.def?.dry || 1, c = this.center(s);
      if (Math.hypot(x - c.x, z - c.z) < r) return true;
    }
    return false;
  }

  // umbrella / newspaper up? (not while eating, swimming or jumping)
  coverOn(b, w) {
    if (!w.cover || b.inWater || b.jump || b.angry) return false;
    const st = b.state;
    return st !== 'eat' && st !== 'snack' && st !== 'toss' && st !== 'yummy' && st !== 'smash' && !(b.lunge > 0);
  }

  // ---------------------------------------------------------------- scripts
  seek(b, w, kind) {
    const game = this.game;
    const list = kind === 'warm' ? this.warm : kind === 'cool' ? (this.cool.length ? this.cool : this.dry) : this.dry;
    let best = null, bd = 26;
    for (const s of list) {
      const c = this.center(s);
      const d = Math.hypot(c.x - b.x, c.z - b.z);
      const cap = this.cap(s, kind);
      const used = this.huddle.get(s.id)?.size || 0;
      if (used >= cap) continue;
      const sc = d + used * 1.5;
      if (sc < bd) { bd = sc; best = s; }
    }
    if (!best) return false;
    // resort facilities run their own visit (spa, hot tub, sauna...)
    if (best.def?.visit && game.resort?.visit) {
      try { if (game.resort.visit(b, best)) { w.mode = kind; return true; } } catch (e) { console.warn('[seasons] resort visit', e); }
    }
    const spot = this.slotFor(b, best, kind);
    if (!spot) return false;
    const bs = game.bears;
    const field = bs.fieldFrom(Math.floor(b.x), Math.floor(b.z));
    const path = bs.pathTo(field, Math.floor(spot.x), Math.floor(spot.z));
    if (!path && Math.hypot(spot.x - b.x, spot.z - b.z) > 3) return false;
    let set = this.huddle.get(best.id);
    if (!set) this.huddle.set(best.id, (set = new Set()));
    set.add(b.id);
    if (b.state === 'search') { b.state = 'walk'; b.path = null; }
    const sc = { kind: 'wx-' + kind, wx: kind, s: best, x: spot.x, z: spot.z, path, pi: 0, phase: 'go', t: 0, dur: 0, sit: false };
    sc.update = (bb, sdt) => this.step(bb, sdt, sc);
    b.script = sc;
    w.mode = null;
    if (kind === 'warm' && Math.random() < 0.6) game.bears.say(b, pick(['Fire!', 'Heat! Over there!', 'Warm spot!', 'Toasty corner!']), null, null, 1.4);
    return true;
  }

  cap(s, kind) {
    if (kind === 'dry') return s.def?.size ? 5 : 2;
    const r = kind === 'warm' ? this.S.warmRadius(s) : s.def?.cool || 1.2;
    return Math.max(2, Math.round(r * 2.3));
  }

  // a free place round the spot (a ring around heaters, under the roof of shelters)
  slotFor(b, s, kind) {
    const g = this.game.grid;
    const c = this.center(s);
    const set = this.huddle.get(s.id);
    const n = set?.size || 0;
    const cap = this.cap(s, kind);
    const sc = b.def?.scale || 1;
    for (let k = 0; k < cap; k++) {
      const i = (n + k) % cap;
      let x, z;
      if (kind === 'dry' && s.def?.size) {
        const a = (i / cap) * Math.PI * 2 + (s.seed || 0);
        x = c.x + Math.cos(a) * 0.45; z = c.z + Math.sin(a) * 0.45;
      } else {
        const r = kind === 'warm' ? this.S.warmRadius(s) : s.def?.cool || 1.2;
        const ring = clamp(r * 0.42, 0.95, 1.45) + 0.12 * sc;
        const a = (i / cap) * Math.PI * 2 + ((s.seed || 0) % 7) * 0.9;
        x = c.x + Math.cos(a) * ring; z = c.z + Math.sin(a) * ring;
      }
      const tx = Math.floor(x), tz = Math.floor(z);
      if (!g.inb(tx, tz) || !g.bearPassable(tx, tz) || g.isWater(tx, tz)) continue;
      return { x, z };
    }
    return null;
  }

  step(b, dt, sc) {
    const game = this.game, bs = game.bears, w = b.wx;
    const s = sc.s;
    if (!w || !s || s.removed || !s.built || (sc.wx === 'warm' && !this.S.isLit(s)) || b.angry) return this.end(b, sc, false);
    if (b.jump) { bs.updateJump(b, dt); return true; }
    sc.t += dt;
    let moving = false;
    if (sc.phase === 'go') {
      let tx = sc.x, tz = sc.z;
      if (sc.path && sc.pi < sc.path.length) {
        tx = sc.path[sc.pi][0] + 0.5; tz = sc.path[sc.pi][1] + 0.5;
        if (Math.hypot(tx - b.x, tz - b.z) < 0.3) sc.pi++;
      }
      const sp = 2.3 * (b.def?.speed || 1);
      const ok = bs.moveToward(b, tx, tz, dt, sp, false);
      moving = true;
      if (!ok && sc.pi < (sc.path?.length || 0)) sc.pi++;
      if (Math.hypot(sc.x - b.x, sc.z - b.z) < 0.22 || (sc.t > 12 && Math.hypot(sc.x - b.x, sc.z - b.z) < 1.2)) {
        sc.phase = 'stay';
        sc.dur = sc.wx === 'warm' ? 4.5 + Math.random() * 3 : sc.wx === 'cool' ? 3.5 + Math.random() * 2 : 4 + Math.random() * 3;
        sc.t = 0;
        const c = this.center(s);
        w.cx = c.x; w.cz = c.z;
        w.mode = sc.wx;
        // fire pits: some bears sit down round the fire
        if (sc.wx === 'warm' && (s.type === 'firepit' || s.type === 'campfire' || s.type === 'hangout') && Math.random() < 0.45) { sc.sit = true; b.poseOverride = 'sit'; }
        if (b.wet > 0.5 || w.rain > 0.4) w.shakeT = 0.7;
        if (sc.wx === 'warm' && Math.random() < 0.7) bs.say(b, pick(LINES.warm), 'emo_happy_face', null, 1.8);
        else if (sc.wx === 'cool' && Math.random() < 0.6) bs.say(b, pick(LINES.cool), null, null, 1.6);
        else if (sc.wx === 'dry' && Math.random() < 0.5) bs.say(b, pick(LINES.dry), null, null, 1.6);
      } else if (sc.t > 18) return this.end(b, sc, false);
    } else {
      const c = this.center(s);
      const want = Math.atan2(c.z - b.z, c.x - b.x);
      let dh = want - b.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      b.heading += dh * Math.min(1, dt * 6);
      b.speed = 0;
      const done = sc.t >= sc.dur || (sc.wx === 'warm' && b.cold < 0.05 && sc.t > 2.5) || (sc.wx === 'cool' && b.hot < 0.05 && sc.t > 2) || (sc.wx === 'dry' && !this.S.info.precip && sc.t > 1.5);
      if (done) return this.end(b, sc, true);
    }
    bs.ground(b, dt, moving);
    return true;
  }

  end(b, sc, ok) {
    const game = this.game, w = b.wx;
    this.huddle.get(sc.s?.id)?.delete(b.id);
    if (sc.sit && b.poseOverride === 'sit') b.poseOverride = null;
    if (w) {
      w.mode = null;
      w.seekCd = ok ? 22 + Math.random() * 10 : 6;
      if (ok) {
        if (sc.wx === 'warm') { w.warmed = true; this.stats.warmed++; b.tips = (b.tips || 0) + 1.5 * (b.def?.pay || 1); this.S.teach.firstBear('warmed'); }
        else if (sc.wx === 'cool') { w.cooled = true; this.stats.cooled++; b.tips = (b.tips || 0) + 1 * (b.def?.pay || 1); }
        else { w.dried = true; this.stats.dried++; }
        const hp = game.bears.headTop(b);
        game.particles.hearts(hp.x, hp.y - 0.1, hp.z, 1);
      }
    }
    if (b.script === sc) b.script = null;
    try { if (!b.angry && b.goal?.kind !== 'leave') game.bears.decide(b); } catch (e) { console.warn('[seasons] decide', e); }
    return false;
  }

  // ---------------------------------------------------------------- look
  // props on the rig + body / face tint + breath, sweat and drip particles
  dress(b, w) {
    const r = b.rig;
    if (r.layer && r._wxB === b) return;
    r._wxB = b;
    r.layer = (F, c, name, B, dt) => this.layer(b, F, c, name, B, dt);
  }

  look(b, w, dt) {
    const game = this.game, r = b.rig, S = this.S;
    const P = props();
    const cold = b.cold || 0, hot = b.hot || 0;
    // rain cover props
    const W = S.info;
    const raining = !!W.precip && S.snowShare < 0.6 && S.intensity > 0.12;
    const showU = raining && w.cover === 'umbrella' && this.coverOn(b, w) && !w.mode;
    const showP = raining && w.cover === 'paper' && this.coverOn(b, w) && !w.mode;
    w.showU = showU; w.showP = showP;
    if (showU && !w.umb) {
      w.umb = new THREE.Mesh(P.umbrellas[w.uIdx], P.mat);
      w.umb.castShadow = true;
      r.handAnchorR.add(w.umb);
    }
    if (w.umb) w.umb.visible = showU;
    if (showP && !w.paper) {
      w.paper = new THREE.Mesh(P.paper, P.mat);
      w.paper.position.set(0, 0.16, 0.04);
      w.paper.rotation.set(-0.12, 0, 0);
      r.topAnchor.add(w.paper);
    }
    if (w.paper) w.paper.visible = showP;
    // red nose
    if (cold > 0.3 && !w.nose) {
      const head = r.bones.findIndex((x) => x.name === 'head');
      if (head >= 0 && r._anchor) {
        const a = r._anchor(head, 0, 22.55, 9.9);
        w.nose = new THREE.Mesh(P.nose, P.noseMat);
        a.add(w.nose);
      }
    }
    if (w.nose) { w.nose.visible = cold > 0.3; w.nose.scale.setScalar(0.6 + cold * 0.6); }
    // tint: frosty blue in the cold, flushed in the heat, darker when soaked
    if (r.matState === 'normal') {
      if (r.ownMat) {
        if (!w.base) w.base = r.ownMat.color.clone();
        _base.copy(w.base);
        if (cold > 0.01) _base.lerp(_tmpC.copy(w.base).multiply(COLD_TINT), cold * 0.55);
        if (hot > 0.01) _base.multiply(_tmpC.copy(HOT_TINT).lerp(WHITE, 1 - hot * 0.5));
        if (b.wet > 0.05) _base.multiplyScalar(1 - b.wet * 0.12);
        r.ownMat.color.copy(_base);
      }
      const fc = r.faceMat.color;
      fc.setRGB(1, 1, 1);
      if (cold > 0.01) fc.lerp(COLD_TINT, cold * 0.7);
      if (hot > 0.01) fc.lerp(HOT_TINT, hot * 0.6);
    }
    if (!(dt > 0)) return;
    // steam breath in the cold
    const mouthCold = S.temp < 6;
    if (mouthCold && (cold > 0.15 || S.temp < 0)) {
      w.steamT -= dt;
      if (w.steamT <= 0) {
        w.steamT = 1.1 + Math.random() * 0.7 - cold * 0.3;
        const mp = game.bears.mouthPos(b);
        const fx = Math.cos(b.heading), fz = Math.sin(b.heading);
        for (let i = 0; i < 2; i++) {
          game.particles.fx.spawn('dust', mp.x + fx * 0.12, mp.y + 0.02, mp.z + fz * 0.12, {
            vx: fx * (0.35 + Math.random() * 0.2), vy: 0.22 + Math.random() * 0.15, vz: fz * (0.35 + Math.random() * 0.2), drag: 1.6,
            life: 0.8 + Math.random() * 0.3, size: 0.11 + i * 0.04, fps: 5, flags: FX.FADE | FX.GROW, tint: [1.5, 1.55, 1.65], bright: true,
          });
        }
      }
    }
    // warming up: the fur steams
    if (w.mode === 'warm' && cold > 0.12 && Math.random() < dt * 3) {
      const hp = game.bears.headTop(b);
      game.particles.fx.spawn('dust', hp.x + (Math.random() - 0.5) * 0.6, hp.y - 0.6 - Math.random() * 0.6, hp.z + (Math.random() - 0.5) * 0.6, { vy: 0.5, drag: 0.8, life: 1.1, size: 0.12, fps: 5, flags: FX.FADE | FX.GROW | FX.WOBBLE, tint: [1.4, 1.42, 1.5], bright: true });
    }
    // sweat drops in the heat
    if (hot > 0.25) {
      w.sweatT -= dt;
      if (w.sweatT <= 0) {
        w.sweatT = 0.5 + Math.random() * 0.6 - hot * 0.25;
        const hp = game.bears.headTop(b);
        const sd = Math.random() < 0.5 ? -1 : 1;
        const rx = Math.sin(b.heading) * 0.3 * sd, rz = -Math.cos(b.heading) * 0.3 * sd;
        game.particles.fx.spawn('sweat', hp.x + rx, hp.y - 0.15, hp.z + rz, { vx: rx * 1.2, vy: 1.1, vz: rz * 1.2, grav: 6, life: 0.7, size: 0.13, flags: FX.FADE, bright: true });
      }
    }
    // dripping wet
    if (b.wet > 0.45 && !b.inWater) {
      w.dripT -= dt;
      if (w.dripT <= 0) {
        w.dripT = 0.25 + Math.random() * 0.35;
        const sc = b.def?.scale || 1;
        game.particles.fx.spawn('drop_s', b.x + (Math.random() - 0.5) * 0.7 * sc, b.y + (0.3 + Math.random() * 1.2) * sc, b.z + (Math.random() - 0.5) * 0.7 * sc, { vy: -0.3, grav: 9, life: 0.6, size: 0.06, flags: FX.WATER | FX.FADE, bright: true });
      }
    }
    // shaking off: a burst of droplets
    if (w.shakeT > 0) {
      const was = w.shakeT;
      w.shakeT -= dt;
      if (Math.floor(was * 10) !== Math.floor(w.shakeT * 10)) {
        const sc = b.def?.scale || 1;
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 1.5;
          game.particles.fx.spawn(Math.random() < 0.5 ? 'drop' : 'drop_s', b.x, b.y + (0.7 + Math.random() * 0.8) * sc, b.z, { vx: Math.cos(a) * sp, vy: 1 + Math.random() * 1.5, vz: Math.sin(a) * sp, grav: 9, drag: 0.5, life: 0.8, size: 0.07, flags: FX.WATER | FX.FADE, bright: true });
        }
        if (was >= 0.7) game.audio.play('splash', { volume: 0.18, pitch: 1.6 });
      }
      if (w.shakeT <= 0) b.wet = Math.min(b.wet, 0.35);
    }
  }

  // ---------------------------------------------------------------- pose overlay
  // runs inside BearRig.pose after the pose wrote its frame (F), before the face is picked
  layer(b, F, c, name, B, dt) {
    const w = b.wx;
    if (!w || w.skip) return;
    const cold = b.cold || 0, hot = b.hot || 0;
    const t = c.time + w.phase;
    const free = FREE_POSES.has(name) && !c.inWater;
    // --- shaking off water (dog shake)
    if (w.shakeT > 0 && free) {
      const k = smooth(Math.min(1, w.shakeT / 0.25)) * Math.min(1, (0.75 - w.shakeT) * 8 + 0.2);
      F.ar(B.base, 0, Math.sin(t * 42) * 0.32 * k, 0);
      F.ar(B.head, 0, Math.sin(t * 42 + 1.2) * 0.45 * k, Math.sin(t * 42 + 0.6) * 0.2 * k);
      F.ar(B.earL, 0, 0, Math.sin(t * 42) * 0.6 * k); F.ar(B.earR, 0, 0, -Math.sin(t * 42) * 0.6 * k);
      c.face = 'strain';
      return;
    }
    // --- warming up at a fire / heater: paws out to the heat, rubbing
    if (w.mode === 'warm' && free) {
      const rub = Math.sin(t * 13) * 1.1;
      const sitting = name === 'sit';
      F.aim(B.armL, -2.2 + rub * 0.4, sitting ? 13.5 : 15.2, 12.5 + c.bz, 0.65);
      F.aim(B.armR, 2.2 - rub * 0.4, sitting ? 13.5 : 15.2 + rub * 0.3, 12.5 + c.bz, 0.65);
      F.ar(B.spine, 0.1, 0, 0);
      F.ar(B.head, -0.06, 0, Math.sin(t * 0.9) * 0.05);
      if (cold > 0.25) this.shiver(F, B, t, cold * 0.5);
      c.face = cold > 0.3 ? 'cold' : 'content';
      if (cold > 0.3) F.jaw(chatter(t, cold * 0.6));
      return;
    }
    if (w.mode === 'cool' && free) {
      F.aim(B.armL, -9, 24, 4, 0.5); F.aim(B.armR, 9, 24, 4, 0.5); // arms out in the mist
      F.ar(B.head, -0.18, 0, 0);
      c.face = 'content';
      return;
    }
    // --- rain cover
    if (w.showU && free && name !== 'sit') {
      // right paw up over the head with the umbrella; the left arm swings on
      F.aim(B.armR, 3.2, 30.5 + c.hy, 3.5 + c.hz, 0.35);
    } else if (w.showP && free && name !== 'sit') {
      F.aim(B.armL, -3.5, 29.5 + c.hy, 2.5 + c.hz, 0.35);
      F.aim(B.armR, 3.5, 29.5 + c.hy, 2.5 + c.hz, 0.35);
      F.ar(B.head, 0.08, 0, 0);
    }
    // --- cold
    if (cold > 0.12) {
      this.shiver(F, B, t, cold);
      // hunch, ears pinned back
      F.ar(B.spine, 0.12 * cold, 0, 0);
      F.ar(B.head, 0.1 * cold, 0, 0);
      F.ar(B.earL, -0.25 * cold, 0, 0.35 * cold); F.ar(B.earR, -0.25 * cold, 0, -0.35 * cold);
      F.mulS(B.base, 1 + 0.02 * cold, 1 - 0.03 * cold, 1 + 0.02 * cold);
      if (free && cold > 0.32 && !w.showU && !w.showP) {
        const k = clamp((cold - 0.32) * 3, 0, 1);
        // alternate: hugging themselves / rubbing paws together and blowing on them
        const rubbing = w.rub && Math.sin(t * 0.55) > 0.35 && name !== 'walk' && name !== 'run';
        const sw = name === 'walk' || name === 'run' ? Math.sin(c.phase) * 0.6 : 0;
        if (rubbing) {
          const r = Math.sin(t * 15) * 1.3;
          aimMix(F, B.armL, -1.2 + r, 18.8 + c.hy * 0.6, 10.5 + c.bz * 0.6, 0.55, k, c.restArms[0], B);
          aimMix(F, B.armR, 1.2 - r, 18.6 + c.hy * 0.6, 10.6 + c.bz * 0.6, 0.55, k, c.restArms[1], B);
          F.ar(B.head, 0.18 * k, 0, 0);
        } else {
          const r = Math.sin(t * 7) * 0.5;
          aimMix(F, B.armL, 3.6 + r, 15.6 + sw, 6.6 + c.bz, 0.5, k, c.restArms[0], B);
          aimMix(F, B.armR, -3.6 - r, 15.1 - sw, 7.0 + c.bz, 0.5, k, c.restArms[1], B);
        }
      }
      if (free && cold > 0.3) { c.face = 'cold'; F.jaw(chatter(t, cold)); }
      else if (cold > 0.5 && (name === 'eat' || name.startsWith('eat_'))) F.ar(B.head, 0, 0, Math.sin(t * 50) * 0.02);
      return;
    }
    // --- hot
    if (hot > 0.15) {
      F.ar(B.spine, 0.05 * hot, 0, 0);
      F.mulS(B.belly, 1 + 0.03 * Math.sin(t * 10) * hot, 1, 1 + 0.04 * Math.sin(t * 10) * hot); // panting
      if (free && hot > 0.3 && !w.showU && !w.showP) {
        const f = Math.sin(t * 17);
        F.aim(B.armL, -3.4 + f * 2.2, 21.5 + c.hy, 9.5 + c.hz, 0.5);
        F.ar(B.armL, 0, 0, f * 0.25);
        F.ar(B.head, -0.1 * hot, 0.12, 0);
        c.face = 'hot';
        F.jaw(0.38 + 0.18 * Math.abs(Math.sin(t * 7)));
      }
    }
  }

  shiver(F, B, t, k) {
    F.ar(B.spine, Math.sin(t * 57) * 0.018 * k, 0, Math.sin(t * 61) * 0.035 * k);
    F.ar(B.head, Math.sin(t * 53) * 0.03 * k, Math.sin(t * 43) * 0.025 * k, Math.sin(t * 47) * 0.04 * k);
    F.ap(B.base, Math.sin(t * 67) * 0.22 * k, 0, Math.sin(t * 71) * 0.1 * k);
  }

  // ---------------------------------------------------------------- reviews
  reviewMod(b, stars, text) {
    const w = b.wx;
    if (!w || w.skip || b.angry) return null;
    if (w.coldMax > 0.55 && !w.warmed) return { stars: Math.max(1, stars - (w.coldMax > 0.8 ? 2 : 1)), text: pick(WX_REVIEWS.freezing) };
    if (w.warmed && w.coldMax > 0.4) return { stars: Math.min(5, stars + (stars >= 3 ? 1 : 0)), text: stars >= 3 ? pick(WX_REVIEWS.cozy) : text };
    if (w.hotMax > 0.6 && !w.cooled) return { stars: Math.max(1, stars - 1), text: pick(WX_REVIEWS.melting) };
    if (w.cooled && w.hotMax > 0.4 && stars >= 3) return { stars, text: pick(WX_REVIEWS.cooled) };
    if (w.soakMax > 0.6 && !w.dried) return { stars: Math.max(1, stars - 1), text: pick(WX_REVIEWS.soggy) };
    return null;
  }

  // a lightning strike / thunder clap: bears jump
  startle() {
    const game = this.game;
    let n = 0;
    for (const b of game.bears?.list || []) {
      if (!b.visible || !b.rig || b.wx?.skip || Math.random() < 0.4) continue;
      b.rig.setFace?.('shocked', { hold: 0.8 });
      b.rig.squash?.(-1.4);
      if (n++ < 2) game.bears.say(b, pick(LINES.thunder), 'emo_exclaim', null, 1.2);
    }
  }
}

// chattering teeth: jaw snaps open / shut very fast
function chatter(t, k) { return (Math.sin(t * 38) > 0 ? 0.22 : 0.02) * Math.min(1, k * 1.6); }

// aim an arm, blended with its rest pose by k (so the hug fades in)
function aimMix(F, bone, x, y, z, st, k, rest, B) {
  if (k >= 0.999) { F.aim(bone, x, y, z, st); return; }
  const o = bone * 9;
  for (let i = 0; i < 9; i++) _arm[i] = F.a[o + i];
  F.aim(bone, x, y, z, st);
  for (let i = 0; i < 9; i++) F.a[o + i] = _arm[i] + (F.a[o + i] - _arm[i]) * k;
  void rest; void B;
}
