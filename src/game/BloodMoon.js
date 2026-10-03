// [v18 bear events] The BLOOD MOON: every 7th day (day 7, 14, 21...).
//
// Sundays are normally a day off. On a blood-moon Sunday the sky slowly reddens
// through the afternoon and at 5 PM the siege starts instead of a quiet evening:
//   - the sky, sun, water and light turn deep red (Sky.bloodMoon, see world/sky.js),
//     eerie drones and heartbeats replace the music
//   - BLOOD MOON BEARS (feral, red-eyed, glowing markings) come down the trail in
//     waves. They ignore snacks, menus and wants entirely: they go straight for
//     your fish (a couple each) and then smash structures (walls in the way first)
//   - they have hp: defenses (src/game/Defense.js) wear them down; at 0 they come
//     to their senses ("...huh? where am I?") and wander home
//   - the clock races from 5 PM to dawn; survive till sunrise -> rewards (more for
//     every bear calmed, a bonus for no fish lost / nothing smashed)
// The day before: "Blood moon tomorrow!" warning; the HUD pill counts down.
// On days that are both (35, 70...) the week's boss joins the last wave.
import { pick } from '../core/rng.js';
import { BEAR_TYPES } from '../data/bears.js';

export const BLOOD_EVERY = 7;
const HP = { blood_grunt: 7, blood_brute: 20, blood_runner: 3.5 };
const FISH_CAP = { blood_grunt: 1, blood_brute: 2, blood_runner: 1 }; // +1 from the 2nd blood moon on
const ARRIVE = ['RRRAAAGH!', 'FEED... ME...', 'SMAAASH!', 'THE MOON HUNGERS!', 'FIIISH!', 'GRRRR!'];
const YUM = ['MORE!', 'MOOORE!', 'GRRR!', 'NOT ENOUGH!'];
const CALM = ['...huh?', 'Where am I?', 'Why am I so sticky?', 'I need a nap.', 'Was I... growling?', 'My head...'];

export class BloodMoon {
  constructor(game, ev) {
    this.game = game;
    this.ev = ev;
    this.k = 0; // sky blend 0..1
    this.siege = null;
    this.droneT = 0;
    this.heartT = 0;
  }

  get bears() { return this.game.bears; }

  isBloodDay(day) { return day >= BLOOD_EVERY && day % BLOOD_EVERY === 0; }
  daysUntil(day) { return (BLOOD_EVERY - (day % BLOOD_EVERY)) % BLOOD_EVERY; }
  moonIndex(day) { return Math.max(1, Math.floor(day / BLOOD_EVERY)); }

  // waves for the n-th blood moon (escalates every week)
  planWaves(n) {
    const waves = Math.min(6, 3 + Math.floor((n - 1) / 1.5));
    const out = [];
    for (let i = 0; i < waves; i++) {
      const last = i === waves - 1;
      const list = [];
      const grunts = 1 + n + i;
      const runners = i > 0 ? i + Math.floor(n / 2) : 0;
      const brutes = last ? n : i >= 1 ? Math.floor(n / 2) : 0;
      for (let g = 0; g < grunts; g++) list.push('blood_grunt');
      for (let r = 0; r < runners; r++) list.push('blood_runner');
      for (let b = 0; b < brutes; b++) list.push('blood_brute');
      out.push({ i, list });
    }
    return out;
  }

  // ------------------------------------------------------------ the siege
  // Game.startRush hook: true = the blood moon took over 5 PM
  start() {
    const game = this.game;
    const st = game.state;
    if (!this.isBloodDay(st.day) || this.siege) return false;
    const n = this.moonIndex(st.day);
    const waves = this.planWaves(n);
    const T = waves.length * 34 + 16;
    this.siege = {
      n, waves, T, t: 0, next: 0, calmed: 0, spawned: 0,
      fish0: game.fish.count, smashed0: game.stats.smashed, ate0: game.stats.fishEaten,
      at: waves.map((w, i) => 3 + i * ((T - 16) / waves.length)),
    };
    st.hour = 17;
    st.phase = 'rush';
    game.setTool({ kind: 'feed' });
    game.ambient?.onRushStart?.();
    game.audio.play('bm_toll', { volume: 0.8 });
    setTimeout(() => game.audio.play('bm_toll', { volume: 0.6 }), 1600);
    game.audio.setMusic(null);
    game.ui?.onRushStart?.(game.wave);
    game.fox?.react?.('panic', 3);
    game.cine?.startFeast(game.wave);
    game.ui?.cineTitle?.('5:00 PM', 'BLOOD MOON');
    this.ev.hud?.siegeCard(n, waves.length);
    game.emit('bloodmoon', { n });
    return true;
  }

  spawnWave(i) {
    const s = this.siege;
    const w = s.waves[i];
    const list = w.list.slice().sort(() => Math.random() - 0.5);
    let t = 0.3;
    for (const type of list) {
      if (!BEAR_TYPES[type]) continue;
      this.bears.spawnBear({ type, wants: [], prefer: null, delay: t, blood: true });
      t += type === 'blood_runner' ? 0.35 : 0.8 + Math.random() * 0.6;
      s.spawned++;
    }
    // boss days that land on a blood moon: the boss leads the last wave
    if (i === s.waves.length - 1) {
      const plan = this.ev.boss.isBossDay(this.game.state.day) ? this.ev.boss.planFor(this.game.state.day) : null;
      if (plan) {
        plan.blood = true;
        this.bears.spawnBear({ type: plan.type, wants: [plan.fav], prefer: null, delay: t + 3, bossPlan: plan, boss: true });
      }
    }
    this.game.audio.play('bm_toll', { volume: 0.55, pitch: 1.1 });
    setTimeout(() => this.game.audio.play('boss_roar', { volume: 0.35, pitch: 1.4 }), 700);
    this.ev.hud?.waveBanner(i + 1, s.waves.length);
  }

  // a blood-moon bear was spawned (BearSystem.spawnBear hook)
  setup(b) {
    const n = this.moonIndex(this.game.state.day);
    b.blood = true;
    b.hostile = true;
    b.angry = true;
    b.bhp = b.bhpMax = (HP[b.typeId] || 6) * (1 + 0.3 * (n - 1));
    b.appetite = (FISH_CAP[b.typeId] || 1) + (n >= 2 ? 1 : 0);
    b.patience = b.maxPatience = 1e6;
    b.wants = [];
    b.prefer = null;
    b.noReview = true;
    b.rampLeft = 99;
    b.dept = 'The Night Shift';
    b.def = { ...b.def, lines: { arrive: ARRIVE, yum: YUM, angry: ARRIVE, eat: YUM, leave: CALM } };
  }

  hostiles() {
    let n = 0;
    for (const b of this.bears.list) if ((b.blood && !b.calmed && b.state !== 'commuteUp') || (b.bossFight && !b.bossDone)) n++;
    return n;
  }

  // ------------------------------------------------------------ decisions
  // blood bears: fish first (a couple each), then smash; never snacks or menus
  decide(b, field) {
    const bears = this.bears;
    if (b.calmed) { if (b.goal?.kind !== 'leave') bears.beginLeave(b); return true; }
    const game = this.game;
    let fish = null, fd = Infinity;
    if (b.eaten < b.appetite) {
      for (const f of game.fish.list) {
        if (!game.fish.catchable(f) || game.structures.isSheltered(f.x, f.z, f)) continue;
        const d = field[bears.tileIdx(Math.floor(f.x), Math.floor(f.z))];
        if (!isFinite(d)) continue;
        const sc = d + Math.random() * 3;
        if (sc < fd) { fd = sc; fish = f; }
      }
    }
    let best = null, bp = null, bs = Infinity;
    for (const s of game.structures.smashTargets()) {
      const spot = bears.approachTile(field, s);
      if (!spot) continue;
      const sc = spot.d + (s.def.blocksBear || s.def.blocksFish ? -3 : 0) + (s.def.defense ? -1.5 : 0) + (s.def.food ? -1 : 0) + Math.random() * 2.5;
      if (sc < bs) { bs = sc; best = s; bp = spot; }
    }
    if (fish && fd < bs + 5) {
      b.goal = { kind: 'fish' }; b.fish = fish;
      if (b.inWater && fish.region === b.region) { b.state = 'hunt'; return true; }
      b.path = bears.pathTo(field, Math.floor(fish.x), Math.floor(fish.z));
      if (b.path) { b.pathI = 0; b.state = 'walk'; return true; }
    }
    if (best) {
      b.goal = { kind: 'smash' }; b.struct = best; b.fish = null;
      b.path = bears.pathTo(field, bp.x, bp.z) || [];
      b.pathI = 0; b.state = 'walk';
      return true;
    }
    b.goal = null; b.fish = null; b.path = null;
    b.state = 'search';
    b.searchT = 1.5 + Math.random() * 1.5;
    b.searchH = Math.random() * Math.PI * 2;
    return true;
  }

  preStep(b, dt) {
    if (b.calmT > 0) {
      b.calmT -= dt;
      b.moving = false;
      b.poseOverride = 'calm';
      if (b.calmT <= 0) { b.poseOverride = null; this.bears.beginLeave(b); }
      return true;
    }
    if (b.rig && !b.calmed && !(b.flashT > 0) && b.rig.matState !== 'angry') b.rig.setMaterial('angry');
    if (!b.calmed && Math.random() < dt * 0.25 && b.visible && b.state !== 'commute') this.bears.say(b, pick(['GRRR...', 'FIIISH...', 'SMASH!', 'RAAAH!']), null, null, 1.2);
    return false;
  }

  // hp ran out (or the sun came up): the red fades, the bear wanders home
  calm(b, src = null, { dawn = false } = {}) {
    if (b.calmed) return;
    const game = this.game;
    b.calmed = true; // (stays `angry` so the feast camera doesn't make it chat about Q3 numbers)
    b.matHold = false;
    b.rig?.setMaterial('normal');
    b.rig?.setFace?.('sad', { hold: 1.5 });
    if (this.siege) this.siege.calmed += src ? 1 : 0;
    if (src) game.stats.bloodCalmed = (game.stats.bloodCalmed || 0) + 1;
    const hp = this.bears.headTop(b);
    game.particles.sparkle(hp.x, hp.y, hp.z, 10, 0xffffff);
    game.particles.word(dawn ? 'zzz' : 'pow', hp.x, hp.y + 0.3, hp.z, { size: 0.3 });
    this.bears.say(b, dawn ? pick(['The sun! ...huh?', 'Morning already?', 'What a night...']) : pick(CALM), 'emo_question', null, 2);
    if (b.trapT > 0) this.ev.defense.release(b);
    b.knock = null;
    if (b.state === 'eat' || b.state === 'yummy' || b.state === 'toss' || b.state === 'queued' || b.state === 'commute' || b.jump) return; // they head home when done
    b.calmT = 1.2;
    b.state = 'calm';
    b.path = null;
  }

  // ------------------------------------------------------------ per frame
  update(dt, realDt) {
    const game = this.game;
    const st = game.state;
    const s = this.siege;
    // sky: reddens through the afternoon of a blood-moon day, full red during the siege
    let want = 0;
    if (s) want = s.done ? 0 : 1;
    else if (this.isBloodDay(st.day) && st.phase === 'day') want = Math.max(0, Math.min(0.55, (st.hour - 15) / 2 * 0.55));
    this.k += (want - this.k) * Math.min(1, realDt * (s ? 0.6 : 1.5));
    if (Math.abs(want - this.k) < 0.002) this.k = want;
    game.sky.bloodMoon = this.k;
    if (!s) return;
    if (st.phase !== 'rush') { this.siege = null; return; }
    s.t += dt;
    // the clock races through the night: 5 PM -> 5:30 AM
    const h = 17 + 12.5 * Math.min(1, s.t / s.T);
    st.hour = h >= 24 ? h - 24 : h;
    while (s.next < s.waves.length && s.t >= s.at[s.next]) this.spawnWave(s.next++);
    // eerie soundtrack
    this.droneT -= realDt;
    if (this.droneT <= 0) { this.droneT = 4.6; game.audio.play('bm_drone', { volume: 0.55 }); }
    const n = this.hostiles();
    this.heartT -= realDt;
    if (this.heartT <= 0) { this.heartT = n > 6 ? 0.9 : n > 2 ? 1.3 : 2.2; if (n > 0) game.audio.play('bm_heart', { volume: 0.35 + Math.min(0.3, n * 0.03) }); }
    s.hostile = n;
    // dawn: everyone left calms down; the siege ends once the last wave is done
    const allOut = s.next >= s.waves.length;
    if (allOut && s.t >= s.T && (n === 0 || s.t >= s.T + 24)) this.finish();
    else if (allOut && n === 0 && s.t > s.at[s.at.length - 1] + 10) s.t += dt * 5; // everyone calmed early: the night flies by
  }

  finish() {
    const game = this.game;
    const st = game.state;
    const s = this.siege;
    if (!s || s.done) return;
    s.done = true;
    for (const b of this.bears.list) {
      if (b.blood && !b.calmed) this.calm(b, null, { dawn: true });
      if (b.bossFight && !b.bossDone) this.ev.boss.lose(b);
    }
    const fishLost = Math.max(0, game.stats.fishEaten - s.ate0);
    const smashed = Math.max(0, game.stats.smashed - s.smashed0);
    const coins = Math.round(50 * s.n + 12 * s.calmed + (fishLost === 0 ? 40 * s.n : 0) + (smashed === 0 ? 30 * s.n : 0));
    game.earnMisc(coins, 'trophies');
    st.bloodMoons = (st.bloodMoons || 0) + 1;
    st.bloodCalmed = (st.bloodCalmed || 0) + s.calmed;
    game.audio.play('bm_dawn', { volume: 0.7 });
    game.fox?.react?.('cheer', 3);
    this.ev.hud?.bloodResult({ n: s.n, calmed: s.calmed, fishLost, smashed, coins, perfect: fishLost === 0 && smashed === 0 });
    game.emit('bloodmoonEnd', { n: s.n, calmed: s.calmed, fishLost, smashed, coins });
    // sunrise, then the day's ledger
    st.phase = 'evening';
    game.transition = { kind: 'evening', from: st.hour, to: Math.min(6.6, st.hour + 1), t: 0, dur: 3.2 };
    this.siege = null;
  }

  // the blood moon took the 5 PM slot today (the day card / quotes)
  dayInfo(day) {
    if (this.isBloodDay(day)) return { tonight: true, n: this.moonIndex(day) };
    if (this.daysUntil(day) === 1) return { tomorrow: true, n: this.moonIndex(day + 1) };
    return null;
  }
}
