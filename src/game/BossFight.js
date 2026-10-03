// [v18 bear events] SUPER HARD BOSS every 5th day (day 5, 10, 15...).
//
// The boss is a normal BearSystem bear (it walks the trail, swims, hunts fish
// and raids snack bowls) with a HUNGER bar instead of an appetite:
//   - every fish it eats takes its meal value off the bar, its FAVOURITE snack
//     (stock the Snack Bowls!) counts x3 (+0.5), other snacks x1.2
//   - defenses wear it down a little too (15% of their damage, see Defense.js)
//   - calm it (bar empty) before its FURY timer runs out -> it pays, leaves a 5-star
//     review, you win a trophy + a big coin prize
//   - fail -> a final tantrum, it grabs coins from the till and leaves 0 stars
// Phases: 1 (normal) -> 2 ENRAGED at 50% (faster, attacks more, smashes harder;
// also when 75% of the fury timer is gone) -> 3 DESPERATE at 20%.
// Special attacks (per boss): ground SLAM (stuns beavers + defense towers nearby,
// cracks builds), STOMP (smashes everything within 3 tiles), ROAR (fish panic and
// scatter, beavers cower), SUMMON (calls its cubs, who eat your fish too) and
// CHARGE (runs at a build and flattens it).
// Bosses escalate: a new boss every time, the roster loops with +50% hunger.
import * as THREE from 'three';
import { BEAR_TYPES, WANT_INFO } from '../data/bears.js';
import { FOOD_ITEMS } from '../data/foods.js';
import { pick } from '../core/rng.js';

export const BOSS_EVERY = 5;
export const BOSS_ROSTER = [
  { type: 'hr_mama', fav: 'berries', attacks: ['slam', 'summon', 'stomp'], cubs: 2,
    intro: ['WHO IS IN CHARGE OF THIS POND?', 'I\'VE HEARD COMPLAINTS. LOTS.'], taunt: ['THIS IS A WRITE-UP!', 'MANDATORY TRAINING!', 'KIDS! FETCH!'] },
  { type: 'shareholder', fav: 'honey', attacks: ['stomp', 'roar', 'slam'], cubs: 0,
    intro: ['I OWN 51% OF THIS POND.', 'DIVIDENDS. NOW.'], taunt: ['BUY LOW!', 'SELL HIGH!', 'YOU\'RE FIRED!'] },
  { type: 'enforcer', fav: 'syrup', attacks: ['charge', 'slam', 'stomp'], cubs: 0,
    intro: ['SECURITY CHECK.', 'NOBODY LEAVES HUNGRY. ESPECIALLY ME.'], taunt: ['STAND BACK!', 'CLEAR THE AREA!', 'BREACH!'] },
  { type: 'auditor', fav: 'seaweed', attacks: ['roar', 'slam', 'stomp'], cubs: 0,
    intro: ['THE BOOKS DO NOT BALANCE.', 'I WILL AUDIT EVERY FISH.'], taunt: ['DISCREPANCY!', 'NON-COMPLIANT!', 'FROZEN ASSETS!'] },
  { type: 'tycoon', fav: 'mushroom', attacks: ['stomp', 'summon', 'roar', 'charge'], cubs: 3,
    intro: ['I\'M BUYING THIS POND.', 'EVERYTHING HAS A PRICE, FOX.'], taunt: ['HOSTILE TAKEOVER!', 'INTERNS! ATTACK!', 'MINE! ALL MINE!'] },
  { type: 'spirit', fav: 'rice', attacks: ['roar', 'slam', 'summon', 'stomp'], cubs: 3,
    intro: ['THE FOUNDER HAS RETURNED.', 'I REMEMBER WHEN THIS WAS ALL FOREST.'], taunt: ['NATURE PROVIDES!', 'FEEL THE NORTH!', 'AWOOO!'] },
  { type: 'ursa', fav: 'veggie', attacks: ['slam', 'roar', 'summon', 'stomp', 'charge'], cubs: 4,
    intro: ['I AM THE GREAT BEAR.', 'I HAVE WATCHED YOUR POND FROM THE SKY.'], taunt: ['STARFALL!', 'BEHOLD THE COSMOS!', 'LITTLE DIPPERS! TO ME!'] },
];
const FAV_ITEM_ICON = { berries: 'berry', honey: 'honey', syrup: 'syrup', seaweed: 'seaweed', mushroom: 'mushroom', rice: 'wildrice', veggie: 'carrot' };
const ATK_STATES = new Set(['walk', 'hunt', 'search']);

export class BossFight {
  constructor(game, ev) {
    this.game = game;
    this.ev = ev;
    this.active = null; // the boss bear currently fighting
    this.rings = [];
    this.group = new THREE.Group();
    this.group.name = 'bossFx';
    game.scene.add(this.group);
    game.on('bearSnack', (e) => this.onSnack(e));
  }

  get bears() { return this.game.bears; }

  isBossDay(day) { return day >= BOSS_EVERY && day % BOSS_EVERY === 0; }
  daysUntil(day) { return (BOSS_EVERY - (day % BOSS_EVERY)) % BOSS_EVERY; }
  nextBossDay(day) { return day + this.daysUntil(day) || BOSS_EVERY; }

  // the boss (and its numbers) for a boss day
  planFor(day, { force = false } = {}) {
    if (!force && !this.isBossDay(day)) return null;
    const k = Math.max(1, Math.floor(day / BOSS_EVERY));
    const R = BOSS_ROSTER[(k - 1) % BOSS_ROSTER.length];
    if (!BEAR_TYPES[R.type]) return null;
    const loop = Math.floor((k - 1) / BOSS_ROSTER.length);
    const lm = 1 + 0.5 * loop;
    return {
      ...R, k, loop, day,
      name: BEAR_TYPES[R.type].name + (loop ? ' ' + 'I'.repeat(Math.min(3, loop + 1)) : ''),
      job: BEAR_TYPES[R.type].job,
      hungerMax: Math.round((30 + 16 * (k - 1)) * lm),
      timer: Math.round((115 + 10 * Math.min(k, 6)) * (1 + 0.15 * loop)),
      reward: Math.round((150 + 100 * (k - 1)) * lm),
      favName: WANT_INFO[R.fav]?.name || R.fav,
      favIcon: FAV_ITEM_ICON[R.fav] || 'berry',
    };
  }

  // ------------------------------------------------------------ setup
  setup(b, plan) {
    b.bossFight = plan;
    b.hostile = true;
    b.hunger = b.hungerMax = plan.hungerMax;
    b.appetite = 9999;
    b.patience = b.maxPatience = 1e6;
    b.wants = [{ kind: plan.fav, done: false }];
    b.prefer = null;
    b.dept = plan.job;
    b.def = { ...b.def, lines: { ...(b.def.lines || {}), arrive: plan.intro, yum: ['MORE!', 'NOT ENOUGH!', 'IS THAT ALL?!', 'MMMF. MORE.'], snack: ['MORE!', 'TINY PORTIONS!'] } };
    b.bossPhase = 1;
    b.atkCd = 7;
    b.furyT = b.furyMax = plan.timer;
    b.speedK = 1;
    b.smashMult = 1.5;
    b.eatenSeen = 0;
    b.summons = 0;
    this.active = b;
  }

  // the boss stepped onto the trail: big intro instead of BearSystem.bossIntro
  intro(b) {
    const game = this.game;
    const P = b.bossFight;
    b.introT = 2.8;
    const seen = (game.state.bossesSeen ||= []);
    if (!seen.includes(b.typeId)) seen.push(b.typeId);
    game.audio.play('boss_sting', { volume: 0.7 });
    setTimeout(() => game.audio.play('boss_roar', { volume: 0.8, pitch: 0.95 }), 450);
    game.rig.shake = Math.max(game.rig.shake, 1.2);
    if (game.cine?.active) game.cine.cut('close', { bear: b, dur: 3.6, zoom: 0.03 });
    this.ev.hud?.bossCard(P);
    setTimeout(() => this.bears.say(b, pick(P.intro), 'emo_anger', null, 2.8), 900);
  }

  // ------------------------------------------------------------ food
  onSnack({ bear: b, item }) {
    if (!b?.bossFight || b.bossDone) return;
    const F = FOOD_ITEMS[item];
    if (!F) return;
    const meal = (F.bear?.meal ?? 0.5) * this.game.mods.snackMealMult;
    if (F.snack === b.bossFight.fav) {
      this.feed(b, meal * 2 + 0.5, true); // + the meal itself (eaten delta) = 3x
      this.bears.say(b, pick(['MY FAVOURITE!!', 'OHHH YES.', 'MORE OF THAT!']), 'emo_heart', F.icon, 1.8);
      const hp = this.bears.headTop(b);
      this.game.particles.hearts(hp.x, hp.y, hp.z, 5);
    } else this.feed(b, meal * 0.2);
  }

  feed(b, amt, big = false) {
    b.hunger = Math.max(0, b.hunger - amt);
    this.ev.hud?.bossHit(amt, big ? 'fav' : 'food');
    if (b.hunger <= 0) this.win(b);
  }

  // defenses (Defense.hit already applied the boss resistance)
  hit(b, amt, src) {
    if (b.bossDone || amt <= 0) return;
    b.hunger = Math.max(0, b.hunger - amt);
    this.ev.hud?.bossHit(amt, 'def');
    if (b.hunger <= 0) this.win(b);
  }

  phaseFor(b) {
    const f = b.hunger / b.hungerMax;
    let p = f <= 0.2 ? 3 : f <= 0.5 ? 2 : 1;
    if (b.furyT < b.furyMax * 0.25) p = Math.max(p, 2);
    return p;
  }

  // ------------------------------------------------------------ per frame (from BearSystem.step)
  preStep(b, dt) {
    const game = this.game;
    b.patience = b.maxPatience;
    if (b.bossOutro) return this.outro(b, dt);
    if (b.bossDone) return false;
    if (b.state === 'queued' || b.state === 'commute' || b.jump) return false;
    // food it ate since last frame
    if (b.eaten > b.eatenSeen) { const de = b.eaten - b.eatenSeen; b.eatenSeen = b.eaten; this.feed(b, de); }
    if (b.bossDone) return true;
    b.snacks = 0;
    if (b.wants[0]) b.wants[0].done = false;
    // fury timer
    b.furyT -= dt;
    if (b.furyT <= 0) { this.lose(b); return true; }
    // phases
    const ph = this.phaseFor(b);
    if (ph !== b.bossPhase) this.setPhase(b, ph);
    // attacks
    if (b.atk) return this.runAttack(b, dt);
    b.atkCd -= dt;
    if (b.atkCd <= 0 && ATK_STATES.has(b.state) && !b.lunge) {
      const kind = this.pickAttack(b);
      if (kind) { this.startAttack(b, kind); return true; }
      b.atkCd = 2;
    }
    // nothing to eat: go smash something instead of moping around
    if (b.state === 'search') {
      b.bossSearchT = (b.bossSearchT || 0) + dt;
      if (b.bossSearchT > 2.2) { b.bossSearchT = 0; b.forceSmash = true; this.bears.decide(b); }
    } else b.bossSearchT = 0;
    // charge / enraged run
    b.poseOverride = !b.inWater && b.moving && (b.charging || b.bossPhase >= 2) ? 'charge' : null;
    b.poseT01 = null;
    void game;
    return false;
  }

  setPhase(b, ph) {
    const game = this.game;
    const up = ph > b.bossPhase;
    b.bossPhase = ph;
    b.speedK = ph === 1 ? 1 : ph === 2 ? 1.3 : 1.45;
    b.smashMult = ph === 1 ? 1.5 : ph === 2 ? 2.5 : 3;
    b.matHold = ph >= 2;
    b.rig?.setMaterial(ph >= 2 ? 'angry' : 'normal');
    b.rig?.setFace?.(ph >= 2 ? 'furious' : 'angry');
    if (up) {
      this.ev.hud?.bossPhase(ph);
      game.audio.play('boss_roar', { volume: 0.7, pitch: 1.1 });
      game.rig.shake = Math.max(game.rig.shake, 0.9);
      game.particles.sprite('anger', b.x, b.y + 2.6 * b.def.scale, b.z, { vy: 0.6, life: 1.4, size: 0.6 });
      this.bears.say(b, ph === 2 ? 'NOW I\'M ANGRY!' : 'I WILL NOT BE DENIED!', 'emo_anger', null, 2);
      b.atkCd = Math.min(b.atkCd, 0.6);
      b.nextAtk = 'roar';
    }
  }

  cooldown(b) {
    const k = b.bossFight.k;
    const base = b.bossPhase === 1 ? 11 : b.bossPhase === 2 ? 7 : 5;
    return base * Math.max(0.65, 1 - 0.05 * (k - 1)) * (0.85 + Math.random() * 0.3);
  }

  pickAttack(b) {
    const P = b.bossFight;
    if (b.nextAtk) { const a = b.nextAtk; b.nextAtk = null; return a; }
    let opts = P.attacks.filter((a) => a !== b.lastAtk);
    if (b.summons >= (b.bossPhase >= 3 ? 3 : 2)) opts = opts.filter((a) => a !== 'summon');
    if (!opts.length) opts = P.attacks.slice();
    return pick(opts);
  }

  startAttack(b, kind) {
    const game = this.game;
    b.lastAtk = kind;
    b.atkCd = this.cooldown(b);
    if (kind === 'charge') {
      // pick a build to flatten, then run at it (BearSystem walks the path)
      if (this.chargeAt(b)) { this.bears.say(b, pick(b.bossFight.taunt), 'emo_anger', null, 1.6); return; }
      kind = 'stomp';
    }
    b.atk = { kind, t: 0, hits: 0 };
    b.prevState = b.state;
    b.state = 'bossAtk';
    b.path = null;
    b.lunge = 0;
    b.moving = false;
    if (game.cine?.active) game.cine.focusQueue.unshift({ kind: 'rampage', bear: b });
    this.bears.say(b, pick(b.bossFight.taunt), 'emo_anger', null, 1.6);
  }

  runAttack(b, dt) {
    const a = b.atk;
    a.t += dt;
    b.moving = false;
    const D = { slam: 1.7, stomp: 2.3, roar: 1.9, summon: 2.3 }[a.kind] || 1.5;
    switch (a.kind) {
      case 'slam':
        b.poseOverride = 'slam'; b.poseT01 = Math.min(1, a.t / 1.15);
        if (!a.hits && a.t >= 0.62) { a.hits = 1; this.slamFx(b); }
        break;
      case 'stomp':
        b.poseOverride = 'angry_stomp'; b.poseT01 = null;
        for (const at of [0.45, 1.15, 1.85]) if (a.t >= at && a.hits < [0.45, 1.15, 1.85].indexOf(at) + 1) { a.hits++; this.stompFx(b); }
        break;
      case 'roar':
        b.poseOverride = 'roar'; b.poseT01 = Math.min(1, a.t / 1.5);
        if (!a.hits && a.t >= 0.35) { a.hits = 1; this.roarFx(b); }
        break;
      case 'summon':
        b.poseOverride = 'roar'; b.poseT01 = Math.min(1, a.t / 1.5);
        if (!a.hits && a.t >= 0.9) { a.hits = 1; this.summonFx(b); }
        break;
      default: break;
    }
    if (a.t >= D) {
      b.atk = null;
      b.poseOverride = null; b.poseT01 = null;
      b.state = 'search'; b.searchT = 0.2;
      this.bears.decide(b);
    }
    return true;
  }

  // ------------------------------------------------------------ attack fx
  ring(x, y, z, R, color = 0xf0e0c0, dur = 0.6) {
    const geo = this._ringGeo || (this._ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.set(x, y + 0.06, z);
    m.renderOrder = 15;
    this.group.add(m);
    this.rings.push({ m, R, t: 0, dur });
  }

  slamFx(b) {
    const game = this.game;
    const R = 5.5 + b.bossFight.k * 0.2;
    game.audio.play('boss_slam', { volume: 0.85 });
    game.rig.shake = Math.max(game.rig.shake, 1.4);
    game.particles.puff(b.x, b.y + 0.1, b.z, 26, 0.55);
    game.particles.word('bam', b.x, b.y + 2.4 * b.def.scale, b.z, { size: 0.5 });
    game.world.sim.disturb(b.x, b.z, 2.6, 1.3);
    this.ring(b.x, b.y, b.z, R);
    this.ring(b.x, b.y, b.z, R * 0.6, 0xffc080, 0.45);
    // beavers and defense crews within reach get stunned
    let stunned = 0;
    for (const bv of game.beavers.list) if (Math.hypot(bv.x - b.x, bv.z - b.z) < R) { bv.stunT = 4; bv.stunX = bv.x; bv.stunZ = bv.z; stunned++; }
    for (const s of game.structures.list) {
      if (!s.built || s.removed) continue;
      const d = Math.hypot(s.x + 0.5 - b.x, s.z + 0.5 - b.z);
      const k = s.def.defense?.kind;
      if ((k === 'tower' || k === 'cannon') && d < R + 1) s.stunT = 5;
      if (d < 2 && s.def.smashable && !s.platform) game.structures.damage(s, 2 * b.smashMult);
    }
    for (const f of game.fish.list) if (!f.tank && Math.hypot(f.x - b.x, f.z - b.z) < 4) { f.fleeT = 2.5; f.state = 'flee'; f.heading = Math.atan2(f.z - b.z, f.x - b.x); }
    if (stunned) game.notify?.(`${stunned} beaver${stunned > 1 ? 's' : ''} stunned by the slam!`, 'warn', { dur: 1.6 });
  }

  stompFx(b) {
    const game = this.game;
    const R = 3.2;
    game.audio.play('boss_stomp', { volume: 0.8, pitch: 0.9 + Math.random() * 0.2 });
    game.rig.shake = Math.max(game.rig.shake, 0.8);
    game.particles.dust(b.x, b.y + 0.05, b.z, 10);
    this.ring(b.x, b.y, b.z, R, 0xe0c8a0, 0.4);
    for (const s of [...game.structures.list]) {
      if (!s.built || s.removed || !s.def.smashable || s.platform) continue;
      if (Math.hypot(s.x + 0.5 - b.x, s.z + 0.5 - b.z) > R) continue;
      game.structures.damage(s, 1.5 * b.smashMult);
    }
  }

  roarFx(b) {
    const game = this.game;
    const R = 10;
    game.audio.play('boss_roar', { volume: 0.9 });
    game.rig.shake = Math.max(game.rig.shake, 1.1);
    game.particles.word('rawr', b.x, b.y + 2.6 * b.def.scale, b.z, { size: 0.55 });
    this.ring(b.x, b.y + 1, b.z, R, 0xff9a80, 0.7);
    // fish panic and scatter (out of their hiding spots), beavers cower
    for (const f of game.fish.list) {
      if (f.tank || f.held || Math.hypot(f.x - b.x, f.z - b.z) > R) continue;
      f.fleeT = 4; f.state = 'flee'; f.heading = Math.atan2(f.z - b.z, f.x - b.x) + (Math.random() - 0.5);
      if (f.mate) { f.mate.mate = null; f.mate = null; }
    }
    for (const bv of game.beavers.list) if (Math.hypot(bv.x - b.x, bv.z - b.z) < R) { bv.stunT = Math.max(bv.stunT || 0, 2); bv.stunX = bv.x; bv.stunZ = bv.z; }
    // the roar shakes the boss loose from traps and soaks
    b.slowT = 0;
  }

  summonFx(b) {
    const game = this.game;
    const P = b.bossFight;
    const n = Math.max(1, (P.cubs || 2) + (b.bossPhase - 1));
    b.summons++;
    game.audio.play('whistle', { volume: 0.5 });
    for (let i = 0; i < n; i++) {
      const blood = !!P.blood;
      const type = blood ? 'blood_runner' : 'cub';
      const c = this.bears.spawnBear({ type, wants: blood ? [] : ['berries'], prefer: null, delay: 0, blood });
      const a = (i / n) * Math.PI * 2 + Math.random();
      let x = b.x + Math.cos(a) * 1.4, z = b.z + Math.sin(a) * 1.4;
      if (!game.grid.bearPassable(Math.floor(x), Math.floor(z))) { x = b.x; z = b.z; }
      c.x = x; c.z = z; c.y = this.bears.groundY(c, x, z);
      c.summoned = true;
      c.noReview = true;
      c.appetite = blood ? c.appetite : 2;
      c.state = 'search'; c.searchT = 0.3 + i * 0.2; c.searchH = a;
      this.bears.show(c);
      game.particles.popIn(x, c.y, z, 0.8);
      setTimeout(() => this.bears.say(c, pick(['Yes, Mom!', 'SNACKS!', 'Me first!', 'Fishies!']), null, null, 1.4), 300 + i * 250);
    }
  }

  chargeAt(b) {
    const game = this.game;
    const bears = this.bears;
    const [bx, bz] = bears.tileOf(b);
    const field = bears.fieldFrom(bx, bz);
    let best = null, bp = null, bs = Infinity;
    for (const s of game.structures.smashTargets()) {
      const d0 = Math.hypot(s.x + 0.5 - b.x, s.z + 0.5 - b.z);
      if (d0 < 3 || d0 > 14) continue;
      const spot = bears.approachTile(field, s);
      if (!spot) continue;
      const sc = spot.d + (s.def.defense ? -5 : 0) + (s.def.blocksBear || s.def.blocksFish ? -2 : 0) + Math.random() * 3;
      if (sc < bs) { bs = sc; best = s; bp = spot; }
    }
    if (!best) return false;
    b.goal = { kind: 'smash' }; b.struct = best;
    b.path = bears.pathTo(field, bp.x, bp.z) || [];
    b.pathI = 0; b.state = 'walk';
    b.charging = true;
    b.speedK = (b.speedK || 1) * 2;
    game.audio.play('boss_roar', { volume: 0.5, pitch: 1.25 });
    if (game.cine?.active) game.cine.focusQueue.unshift({ kind: 'rampage', bear: b });
    return true;
  }

  // BearSystem 'smash' landed (after the normal damage)
  onSmash(b, s) {
    if (!b.charging) return;
    b.charging = false;
    b.speedK = b.bossPhase === 1 ? 1 : b.bossPhase === 2 ? 1.3 : 1.45;
    const game = this.game;
    if (s && !s.removed) game.structures.damage(s, 4 * b.smashMult);
    game.particles.word('smash', b.x, b.y + 2.2 * b.def.scale, b.z, { size: 0.45 });
    game.rig.shake = Math.max(game.rig.shake, 1);
    this.stompFx(b);
  }

  // boss-specific decisions (BearEvents.decide): smash something when it's frustrated
  decide(b, field) {
    if (b.bossDone) { if (!b.bossOutro && b.goal?.kind !== 'leave') this.bears.beginLeave(b); return true; }
    const frustrated = b.forceSmash || (b.bossPhase >= 2 && Math.random() < 0.25);
    b.forceSmash = false;
    if (!frustrated) return false;
    const bears = this.bears;
    let best = null, bp = null, bs = Infinity;
    for (const s of this.game.structures.smashTargets()) {
      const spot = bears.approachTile(field, s);
      if (!spot) continue;
      const sc = spot.d + (s.def.defense ? -4 : 0) + (s.def.blocksFish ? -3 : 0) + Math.random() * 3;
      if (sc < bs) { bs = sc; best = s; bp = spot; }
    }
    if (!best || bs > 30) return false;
    b.goal = { kind: 'smash' }; b.struct = best;
    b.path = bears.pathTo(field, bp.x, bp.z) || [];
    b.pathI = 0; b.state = 'walk'; b.rampLeft = 1;
    return true;
  }

  // ------------------------------------------------------------ the end
  win(b) {
    if (b.bossDone) return;
    const game = this.game;
    const P = b.bossFight;
    b.bossDone = 'win';
    b.atk = null; b.charging = false;
    b.hunger = 0;
    b.appetite = Math.max(1, b.eaten);
    for (const w of b.wants) w.done = true;
    b.bossOutro = { t: 0, dur: 3.4, win: true };
    b.state = 'bossOutro';
    b.path = null; b.knock = null;
    if (b.trapT) this.ev.defense.release(b);
    b.matHold = false;
    b.rig?.setMaterial('normal');
    b.rig?.setFace?.('yummy', { hold: 3 });
    game.audio.play('boss_win', { volume: 0.7 });
    game.fox.react('cheer', 3);
    const hp = this.bears.headTop(b);
    game.particles.hearts(hp.x, hp.y, hp.z, 10);
    game.particles.confetti(b.x, b.y + 2, b.z, 50);
    game.particles.word('wow', hp.x, hp.y + 0.4, hp.z, { size: 0.5 });
    this.bears.say(b, pick(['...I\'m FULL. Fine. FINE. Five stars.', 'Burp. You win, fox.', 'Best. Pond. EVER.']), 'emo_heart', null, 3);
    game.earnMisc(P.reward, 'trophies');
    game.particles.coins(b.x, b.y + 2.4 * b.def.scale, b.z, 18);
    const st = game.state;
    (st.bossTrophies ||= []).push({ type: b.typeId, name: P.name, day: st.day, k: P.k });
    st.bossWins = (st.bossWins || 0) + 1;
    this.ev.hud?.bossResult({ win: true, plan: P, coins: P.reward });
    game.emit('bossWin', { bear: b, plan: P });
    if (game.cine?.active) game.cine.cut('close', { bear: b, dur: 3.2, zoom: 0.026 });
  }

  lose(b) {
    if (b.bossDone) return;
    const game = this.game;
    const P = b.bossFight;
    b.bossDone = 'lose';
    b.atk = null; b.charging = false;
    b.bossOutro = { t: 0, dur: 2.6, win: false };
    b.state = 'bossOutro';
    b.path = null;
    if (b.trapT) this.ev.defense.release(b);
    const st = game.state;
    const stolen = Math.max(0, Math.min(Math.floor(st.coins * 0.15), 50 + 40 * P.k));
    st.coins -= stolen;
    if (stolen) game.emit('coins', { delta: -stolen });
    P.stolen = stolen;
    this.bears.say(b, pick(['THIS POND IS A DISGRACE!', 'I\'M TAKING THIS FOR MY TROUBLE.', 'ZERO STARS!!']), 'emo_anger', null, 2.6);
    this.ev.hud?.bossResult({ win: false, plan: P, coins: stolen });
    st.bossLosses = (st.bossLosses || 0) + 1;
    if (game.cine?.active) game.cine.cut('close', { bear: b, dur: 2.6, zoom: 0.026 });
  }

  outro(b, dt) {
    const o = b.bossOutro;
    o.t += dt;
    b.moving = false;
    if (o.win) {
      b.poseOverride = o.t < 1.8 ? 'calm' : 'cheer';
      b.poseT01 = null;
      if (Math.random() < dt * 3) { const hp = this.bears.headTop(b); this.game.particles.hearts(hp.x, hp.y, hp.z, 1); }
    } else {
      b.poseOverride = o.t < 1.1 ? 'roar' : 'slam';
      b.poseT01 = o.t < 1.1 ? Math.min(1, o.t / 1.5) : Math.min(1, (o.t - 1.1) / 1.15);
      if (!o.slammed && o.t >= 1.75) { o.slammed = true; this.slamFx(b); }
    }
    if (o.t >= o.dur) {
      b.bossOutro = null;
      b.poseOverride = null; b.poseT01 = null;
      if (this.active === b) this.active = null;
      if (o.win) this.bears.beginPay(b);
      else { b.angry = true; b.rampLeft = 0; this.bears.beginLeave(b); }
    }
    return true;
  }

  // ------------------------------------------------------------ misc per frame
  update(dt, realDt) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += realDt;
      const k = Math.min(1, r.t / r.dur);
      r.m.scale.setScalar(0.3 + r.R * (1 - (1 - k) * (1 - k)));
      r.m.material.opacity = 0.8 * (1 - k);
      if (k >= 1) { this.group.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    // stunned beavers: frozen in place, seeing stars
    for (const bv of this.game.beavers.list) {
      if (!(bv.stunT > 0)) continue;
      bv.stunT -= dt;
      if (bv.stunX != null) { bv.x = bv.stunX; bv.z = bv.stunZ; }
      bv.moving = false;
      if (Math.random() < dt * 5) this.game.particles.sprite('star', bv.x + (Math.random() - 0.5) * 0.3, (bv.y || 0) + 0.7, bv.z + (Math.random() - 0.5) * 0.3, { vy: 0.3, life: 0.5, size: 0.16 });
      if (bv.stunT <= 0) { bv.stunT = 0; bv.stunX = null; }
    }
    const a = this.active;
    if (a && (a.removed || !this.game.bears.list.includes(a))) this.active = null;
  }

  // the HUD bar's numbers
  barInfo() {
    const b = this.active;
    if (!b || !b.bossFight || b.state === 'queued') return null;
    return { b, plan: b.bossFight, hunger: b.hunger / b.hungerMax, fury: Math.max(0, b.furyT) / b.furyMax, phase: b.bossPhase, done: b.bossDone, arrived: b.state !== 'commute' };
  }
}
