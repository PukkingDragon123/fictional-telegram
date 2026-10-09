// [v26 resort] game.resort: bears visiting the Bear Resort facilities.
//
// Flow: a bear reaches the trail head -> if there's a Ticket Booth it queues there
// and buys a ticket (coins) -> eats as usual -> before / after eating it picks a
// facility by its needs (cold -> hot tub / sauna / campfire, wet -> towels, tired ->
// spa / bench / massage chair, fun -> photo booth / souvenirs, hot -> ice cream /
// shade, after three fish -> the restroom...), walks there along the paths, queues
// if it's full, uses it (sits in the tub, lies on a massage table with cucumbers on
// its eyes, disappears into the sauna...), pays per use and walks off happier: in a
// robe, a towel round the neck, a foam fish hat, licking a cone. Happiness, gripes
// ("closed", "no path", long lines, soaking wet) and raves go into the review.
// Everything runs through the b.script hook of BearSystem.step.
//
// Staff: game.staff?.boost(s) speeds service up (0 = a required job with nobody on
// it: the CLOSED sign goes up). Rampaging bears knock beavers flying
// (game.staff.injure, or a simple tumble for the old crew). game.breakage is the
// debris physics (src/game/Breakage.js).
//
// API: visit(b, s) -> bool, decide(b, field) (BearSystem hook), review(b, stars, text),
// isOpen(s), dayIncome { type: coins }, careSpot(x, z), recoveryMult(), close(s, kind, on).
import { STRUCTURES } from '../../data/structures.js';
import { Breakage } from '../Breakage.js';
import { attachProp, detachProp } from '../resort/props.js';

const PI = Math.PI;
const NEEDS = ['warm', 'dry', 'relax', 'clean', 'fun', 'cool', 'care'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const RAVES = {
  rs_hottub: ['The hot tub! I live there now.', 'Soaked till I was a prune. Bliss.', 'Bubbles. So many bubbles.'],
  rs_spa: ['Cucumbers on my eyes. Ten out of ten.', 'The massage fixed my spreadsheet back.', 'I came for fish, I left reborn.'],
  rs_sauna: ['Sweated out a whole fiscal quarter.', 'The sauna. Steamy. Perfect.'],
  rs_towels: ['Fluffy towels! FLUFFY!', 'They had towels. Warm ones.'],
  rs_lockers: ['Changed into dry clothes. Civilized.'],
  rs_photo: ['Got a photo strip. Framing it.', 'Four photos, four chins. Love it.'],
  rs_souvenir: ['Bought the fish hat. No regrets.', 'Great gift shop. Got a mug.'],
  rs_icecream: ['Mint chip, fish-free. Perfect.', 'Ice cream after fish? Genius.'],
  rs_campfire: ['Marshmallows by the fire. Cozy.', 'Toasty campfire. Stayed for ages.'],
  rs_massagechair: ['That chair unknotted my spine.', 'Vrrrrr. Best four coins ever.'],
  rs_bench: ['Nice bench. Great pond views.'],
  rs_umbrella: ['Lounged in the shade like a CEO.'],
  rs_restroom: ['Clean restrooms. Rare for a pond.'],
  rs_firstaid: ['Bandaged my paw. Nice nurse.'],
  any: ['What a resort!', 'Five-star facilities. Mostly.'],
};
const GRIPES = {
  path: ['No paths. My loafers are ruined.', 'Had to hike through the weeds.', 'Where are the PATHS?'],
  closed: ['Half the place was CLOSED.', 'Closed?! I wanted that.', 'Nobody working. At all.'],
  queue: ['Waited forever in line.', 'The line! THE LINE!'],
  wet: ['Left soaking wet. No towels?', 'Dripped all the way home.'],
  gone: ['Something got smashed while I waited.'],
};
const SAY = {
  ticket: ['One ticket, please.', 'Admit one!', 'Here\'s my coin.'],
  closed: ['CLOSED?!', 'Nobody\'s here?', 'Closed. Typical.'],
  free: ['Booth\'s closed. Free entry!', 'Nobody at the booth? Score!'],
  queue: ['Ugh, a line.', 'How long is this line?', 'Tick tock...'],
  enter: { rs_hottub: 'Hot tub time!', rs_spa: 'Pamper me.', rs_sauna: 'Sauna!', rs_towels: 'Towel, please!', rs_restroom: 'Excuse me...', rs_photo: 'Photo time!', rs_icecream: 'Two scoops!', rs_souvenir: 'Souvenirs!', rs_campfire: 'Ooh, a fire.', rs_massagechair: 'My back...', rs_bench: 'Ahh, a bench.', rs_lockers: 'Need dry clothes.', rs_umbrella: 'Shade!', rs_infoboard: 'Where\'s the hot tub?', rs_firstaid: 'Ow. Help.' },
  done: { rs_hottub: 'Ahhh...', rs_spa: 'I am reborn.', rs_sauna: 'Phew! Toasty.', rs_towels: 'So fluffy!', rs_restroom: 'Much better.', rs_photo: 'Say fish!', rs_icecream: 'Mmm!', rs_souvenir: 'Love my hat!', rs_campfire: 'Toasty!', rs_massagechair: 'Vrrrr... wow.', rs_lockers: 'Dry at last!' },
};

export function install(game) { return new Resort(game); }

class Resort {
  constructor(game) {
    this.game = game;
    this.dayIncome = {};
    this.dayVisits = 0;
    this.rt = new Map(); // s.id -> { users: [], queue: [], door, doorT, turn }
    this.time = 0;
    this.fxT = 0;
    if (!('breakage' in game)) game.breakage = new Breakage(game);
    this.breakage = game.breakage;
    game.on('staffHurt', (e) => { if (e?.cause === 'bear' && e.staff?.agent) { const a = e.staff.agent; game.particles.stars?.(a.x, (a.y || 0) + 0.6, a.z, 6); game.rig.shake = Math.max(game.rig.shake, 0.35); game.audio.play('rs_bonk', { volume: 0.5 }); } });
    game.on('day', () => { this.dayIncome = {}; this.dayVisits = 0; for (const s of game.structures.list) if (s._rsEvent && !s._rsEvent.keep) s._rsEvent = null; });
  }

  // ------------------------------------------------------------ facilities
  types() { return this._types || (this._types = Object.keys(STRUCTURES).filter((t) => STRUCTURES[t].visit)); }
  list() { return this.game.structures.list.filter((s) => s.def.visit && s.built && !s.removed); }
  rtOf(s) {
    let r = this.rt.get(s.id);
    if (!r || r.s !== s) { r = { s, users: [], queue: [], door: 0, turn: 0, flash: 0 }; this.rt.set(s.id, r); }
    return r;
  }
  boost(s) {
    const st = this.game.staff;
    if (!st?.boost) return 1;
    try { const v = st.boost(s); return typeof v === 'number' && isFinite(v) ? v : 1; } catch { return 1; }
  }
  isOpen(s) {
    if (!s || s.removed || !s.built) return false;
    if (s.hp <= s.maxHp * 0.25) return false;
    if (s._rsEvent?.closed) return false;
    if (s.def.jobs?.required && this.boost(s) <= 0) return false;
    return true;
  }
  // close / reopen by hand (feast events)
  close(s, kind, on = true) { if (s) s._rsEvent = on ? { kind, closed: true } : null; }

  // model frame: local (lx, lz) -> world
  toWorld(s, lx, lz) {
    const o = s.obj;
    const [fw, fd] = s.def.size || [1, 1];
    const ox = o ? o.position.x : s.x + fw / 2, oz = o ? o.position.z : s.z + fd / 2, th = o ? o.rotation.y : 0;
    const c = Math.cos(th), sn = Math.sin(th);
    return { x: ox + lx * c + lz * sn, z: oz - lx * sn + lz * c, th, y: o ? o.position.y : this.game.structures.baseY(s) };
  }
  ud(s) { return s.extraModel?.userData?.rs || null; }
  frontPoint(s) { const u = this.ud(s); const f = u?.front || [0, ((s.def.size || [1, 1])[1]) / 2 + 0.3]; return this.toWorld(s, f[0], f[1]); }
  frontDir(s) { const th = s.obj ? s.obj.rotation.y : 0; return { x: Math.sin(th), z: Math.cos(th) }; }
  spotsOf(s) {
    const u = this.ud(s);
    const list = u?.spots?.length ? u.spots : [{ x: 0, z: ((s.def.size || [1, 1])[1]) / 2 + 0.25, yaw: PI, y: 0, pose: 'stand' }];
    return list.map((p) => { const w = this.toWorld(s, p.x, p.z); return { x: w.x, z: w.z, y: w.y + (p.y || 0), yaw: w.th + p.yaw, pose: p.pose || 'stand' }; });
  }
  // tile a bear walks to (in front of the service point)
  approach(s, field) {
    const g = this.game.grid, B = this.game.bears;
    const fp = this.frontPoint(s);
    const tx = Math.floor(fp.x), tz = Math.floor(fp.z);
    if (g.bearPassable(tx, tz) && isFinite(field[tx + tz * g.w])) return { x: tx, z: tz, d: field[tx + tz * g.w] };
    return B.approachTile(field, s);
  }

  // ------------------------------------------------------------ bears
  initBear(b) {
    if (b.rs) return b.rs;
    const t = b.typeId, game = this.game, sea = game.seasons;
    const r = () => Math.random();
    const cold = (b.cold || 0) + (sea?.season === 'winter' ? 0.35 : sea?.season === 'autumn' ? 0.15 : 0);
    const hot = (b.hot || 0) + (sea?.season === 'summer' ? 0.3 : 0) + ((sea?.temp ?? 15) > 26 ? 0.3 : 0);
    const needs = {
      warm: Math.min(1, 0.2 + r() * 0.4 + cold * 0.8),
      dry: 0,
      relax: Math.min(1, 0.25 + r() * 0.5 + (t === 'ceo' || t === 'accountant' || t === 'critic' ? 0.25 : 0)),
      clean: r() * 0.15,
      fun: Math.min(1, 0.2 + r() * 0.5 + (t === 'tourist' ? 0.35 : t === 'cub' || t === 'intern' ? 0.25 : 0)),
      cool: Math.min(1, hot * 0.9 + r() * 0.15),
      care: Math.min(1, b.hurt || 0),
    };
    b.rs = { ticket: null, needs, joy: 0, gripes: [], visits: 0, visited: [], wet: 0, props: {}, propT: {}, best: null, steamT: 0, preT: 0 };
    return b.rs;
  }

  gripe(b, kind) {
    const rs = this.initBear(b);
    if (!rs.gripes.includes(kind)) rs.gripes.push(kind);
  }

  // BearSystem.decide hook: the ticket booth first, then a facility if a need is pressing
  decide(b, field) {
    const game = this.game;
    if (b.def.boss || b.hostile || b.blood || b.noReview || b.script) return false;
    if (game.state.hour >= 19.3) return false;
    const rs = this.initBear(b);
    // 1) the ticket booth at the trail head
    if (rs.ticket == null) {
      const booths = this.list().filter((s) => s.type === 'rs_ticket');
      if (!booths.length) rs.ticket = 'none';
      else {
        let best = null, bd = Infinity;
        for (const s of booths) { const ap = this.approach(s, field); if (ap && ap.d < bd) { bd = ap.d; best = s; } }
        if (!best) rs.ticket = 'none';
        else if (!this.isOpen(best)) { rs.ticket = 'free'; this.gripe(b, 'closed'); game.bears.say(b, pick(SAY.free), 'emo_exclaim', null, 1.8); }
        else return this.visit(b, best, field);
      }
    }
    // 2) facilities by need (pressing needs before dinner, nice-to-haves after)
    if (rs.visits >= 3) return false;
    const hungry = b.eaten < b.appetite;
    // hungry bears only break off for something pressing, and only now and then
    if (hungry && (rs.preT || 0) > this.time) return false;
    if (hungry) rs.preT = this.time + 10;
    rs.needs.dry = Math.max(rs.needs.dry, rs.wet);
    rs.needs.clean = Math.min(1, rs.needs.clean + 0);
    rs.needs.care = Math.max(rs.needs.care, Math.min(1, b.hurt || 0));
    if (b.cold) rs.needs.warm = Math.max(rs.needs.warm, b.cold);
    if (b.hot) rs.needs.cool = Math.max(rs.needs.cool, b.hot);
    const thr = hungry ? 0.72 : 0.34;
    let best = null, bs = -Infinity;
    const all = this.list();
    if (!all.length) return false;
    for (const s of all) {
      const V = s.def.visit;
      if (V.need === 'ticket') continue;
      const need = rs.needs[V.need] || 0;
      if (need < thr) continue;
      if (rs.visited.includes(s.type)) continue;
      if (V.need === 'care' && !(b.hurt > 0)) continue;
      const open = this.isOpen(s);
      const ap = this.approach(s, field);
      if (!ap || !isFinite(ap.d)) continue;
      const rt = this.rtOf(s);
      let sc = need * 12 - ap.d * 0.12 - rt.queue.length * 2.5 + (V.joy || 0) * 2 + Math.random() * 2;
      if (!open) sc -= 6; // they may still walk up and find it CLOSED
      if (sc > bs) { bs = sc; best = s; }
    }
    if (!best) return false;
    return this.visit(b, best, field);
  }

  // public: send bear b to facility s (returns true if the visit started)
  visit(b, s, field = null) {
    const game = this.game;
    if (!b || !s || s.removed || !s.def.visit || b.angry || b.hostile) return false;
    const rs = this.initBear(b);
    const B = game.bears;
    const [bx, bz] = B.tileOf(b);
    field ||= B.fieldFrom(bx, bz, b);
    const ap = this.approach(s, field);
    if (!ap) return false;
    const path = B.pathTo(field, ap.x, ap.z) || [];
    const v = { s, kind: s.def.visit.need === 'ticket' ? 'ticket' : 'visit', phase: 'go', t: 0, path, pathI: 0, spot: -1, replans: 0, said: false };
    v.update = (bb, dt) => this.step(v, bb, dt);
    v.pose = (bb) => this.poseFor(v, bb);
    b.script = v;
    b.state = 'resort';
    b.goal = { kind: 'resort' };
    b.path = null;
    game.paths?.checkRoute?.(b, path);
    if (v.kind === 'visit') { const line = SAY.enter[s.type]; if (line && Math.random() < 0.55) B.say(b, line, null, null, 1.6); }
    rs.current = s.type;
    return true;
  }

  poseFor(v, b) {
    const sp = v.spotInfo;
    if (v.phase === 'use' || (v.phase === 'enter' && v.t > 0.35)) {
      if (!sp) return 'idle';
      if (sp.pose === 'sit' || sp.pose === 'tub') return 'sit';
      if (sp.pose === 'lie') return 'idle';
      if (v.kind === 'ticket' && v.phase === 'use' && v.t > 0.5) return 'pay';
      if (v.s.type === 'rs_infoboard') return 'search';
      return 'idle';
    }
    if (v.phase === 'queue' && !b.moving) return 'idle';
    return null;
  }

  // walk the planned path (bear tiles), keeping to the ground; 'arrived' | 'walk' | 'stuck'
  walk(v, b, dt) {
    const B = this.game.bears;
    if (b.jump) { B.updateJump(b, dt); return 'walk'; }
    // already standing on the next tile(s)? skip ahead (other bears may keep us off the exact centre)
    const ctx = Math.floor(b.x), ctz = Math.floor(b.z);
    while (v.pathI < v.path.length && v.path[v.pathI][0] === ctx && v.path[v.pathI][1] === ctz && (v.pathI < v.path.length - 1 || Math.hypot(ctx + 0.5 - b.x, ctz + 0.5 - b.z) < 0.45)) v.pathI++;
    if (v.pathI >= v.path.length) return 'arrived';
    const [tx, tz] = v.path[v.pathI];
    const loose = v.stuckT > 1.2; // squeezing past someone: don't stop at tile edges
    const ok = B.moveToward(b, tx + 0.5, tz + 0.5, dt, 2.5 * (b.def.speed || 1), loose);
    B.ground(b, dt, true);
    const prog = Math.hypot(tx + 0.5 - b.x, tz + 0.5 - b.z);
    if (prog < (v.lastProg ?? 9) - 0.01) v.stuckT = Math.max(0, (v.stuckT || 0) - dt * 2); else v.stuckT = (v.stuckT || 0) + dt;
    v.lastProg = prog;
    if (!ok && !loose) return 'stuck';
    if (prog < 0.22) { v.pathI++; v.lastProg = 9; }
    return v.stuckT > 4 ? 'stuck' : 'walk';
  }

  step(v, b, dt) {
    const r = this.step0(v, b, dt);
    if (r && !v.done) { v.px = b.x; v.pz = b.z; }
    return r;
  }

  step0(v, b, dt) {
    const game = this.game, B = game.bears, s = v.s, rs = this.initBear(b);
    if (b.angry || b.hostile || b.removed) { this.release(v, b); return false; }
    if (s.removed || !s.built) { this.gripe(b, 'gone'); this.finish(v, b, false); return false; }
    v.t += dt;
    const closing = game.state.hour >= 19.45;
    switch (v.phase) {
      case 'go': {
        if (closing) { this.finish(v, b, false); return false; }
        const st = this.walk(v, b, dt);
        if (st === 'stuck' || v.t > 40) {
          if (v.replans++ > 2) { this.finish(v, b, false); return false; }
          const [bx, bz] = B.tileOf(b);
          const field = B.fieldFrom(bx, bz, b);
          const ap = this.approach(s, field);
          v.path = (ap && B.pathTo(field, ap.x, ap.z)) || []; v.pathI = 0; v.t = 0; v.stuckT = 0; v.lastProg = 9;
        } else if (st === 'arrived') { v.phase = 'queue'; v.t = 0; this.rtOf(s).queue.push(b); }
        return true;
      }
      case 'queue': {
        const rt = this.rtOf(s);
        if (!this.isOpen(s)) {
          this.gripe(b, 'closed');
          if (v.kind === 'ticket') { rs.ticket = 'free'; B.say(b, pick(SAY.free), 'emo_exclaim', null, 1.6); }
          else B.say(b, pick(SAY.closed), 'emo_anger', null, 1.6);
          this.finish(v, b, false);
          return false;
        }
        let pos = rt.queue.indexOf(b);
        if (pos < 0) { rt.queue.push(b); pos = rt.queue.length - 1; }
        const cap = s.def.visit.cap || 1;
        if (pos === 0 && rt.users.length < cap) {
          const spots = this.spotsOf(s);
          const taken = new Set(rt.users.map((u) => u.script?.spot));
          let k = 0; while (k < spots.length - 1 && taken.has(k)) k++;
          v.spot = k; v.spotInfo = spots[k] || spots[0];
          rt.queue.shift(); rt.users.push(b);
          v.phase = 'enter'; v.t = 0; v.from = { x: b.x, z: b.z, y: b.y };
          if (v.spotInfo.pose === 'hide') rt.door = 1;
          return true;
        }
        // stand in line, facing the counter
        const fp = this.frontPoint(s), dir = this.frontDir(s);
        const off = 0.45 + pos * 0.85, side = ((b.id % 3) - 1) * 0.12;
        const qx = fp.x + dir.x * off + dir.z * side, qz = fp.z + dir.z * off - dir.x * side;
        let moving = false;
        if (Math.hypot(qx - b.x, qz - b.z) > 0.12) moving = B.moveToward(b, qx, qz, dt, 1.6, true);
        else b.heading += (Math.atan2(fp.z - b.z, fp.x - b.x) - b.heading) * Math.min(1, dt * 4);
        B.ground(b, dt, moving);
        b.patience -= dt * (pos > 0 ? 0.5 : 0.15);
        if (pos >= 3 && !v.said) { v.said = true; this.gripe(b, 'queue'); B.say(b, pick(SAY.queue), 'emo_question', null, 1.6); }
        if (b.patience <= 0 || closing) {
          this.gripe(b, 'queue');
          if (v.kind === 'ticket') rs.ticket = 'skipped';
          this.finish(v, b, false, true);
          return false;
        }
        return true;
      }
      case 'enter': {
        const sp = v.spotInfo, T = sp.pose === 'hide' ? 0.45 : 0.6;
        const k = Math.min(1, v.t / T), e = k * k * (3 - 2 * k);
        b.x = v.from.x + (sp.x - v.from.x) * e; b.z = v.from.z + (sp.z - v.from.z) * e;
        const hop = sp.pose === 'tub' || sp.pose === 'lie' || sp.pose === 'sit' ? Math.sin(k * PI) * 0.35 * b.def.scale : 0;
        b.y = v.from.y + (this.restY(b, sp) - v.from.y) * e + hop;
        const yawH = this.headingFor(sp);
        b.heading += (yawH - b.heading) * Math.min(1, dt * 8);
        b.moving = k < 1 && sp.pose !== 'tub' && sp.pose !== 'lie';
        if (k >= 1) this.beginUse(v, b);
        return true;
      }
      case 'use': {
        const sp = v.spotInfo;
        b.x = sp.x; b.z = sp.z; b.y = this.restY(b, sp); b.heading = this.headingFor(sp); b.moving = false;
        this.useFx(v, b, dt);
        if (v.t >= v.dur || (closing && v.t > 1)) { v.phase = 'exit'; v.t = 0; this.beginExit(v, b); }
        return true;
      }
      case 'exit': {
        const sp = v.spotInfo, fp = this.frontPoint(s), dir = this.frontDir(s);
        const tx = fp.x + dir.x * 0.45, tz = fp.z + dir.z * 0.45;
        const k = Math.min(1, v.t / 0.5), e = k * k * (3 - 2 * k);
        b.x = sp.x + (tx - sp.x) * e; b.z = sp.z + (tz - sp.z) * e;
        const hop = sp.pose === 'tub' || sp.pose === 'lie' || sp.pose === 'sit' ? Math.sin(k * PI) * 0.3 * b.def.scale : 0;
        b.y = this.restY(b, sp) + (B.groundY(b, tx, tz) - this.restY(b, sp)) * e + hop;
        b.moving = true;
        if (k >= 1) { this.finish(v, b, true); return false; }
        return true;
      }
    }
    return false;
  }

  headingFor(sp) {
    // seat yaw (0 = facing +z) -> bear heading; lying bears face the sky with their head toward yaw
    const yaw = sp.pose === 'lie' ? sp.yaw + PI : sp.yaw;
    return Math.atan2(Math.cos(yaw), Math.sin(yaw));
  }

  restY(b, sp) {
    const sc = b.def.scale * (b.rig?.P?.size || 1);
    if (sp.pose === 'sit' || sp.pose === 'tub') return sp.y - 0.04 * sc;
    if (sp.pose === 'lie') return sp.y + 0.3 * sc;
    return this.game.bears.groundY(b, sp.x, sp.z);
  }

  beginUse(v, b) {
    const game = this.game, s = v.s, sp = v.spotInfo, rt = this.rtOf(s), V = s.def.visit;
    v.phase = 'use'; v.t = 0;
    const boost = Math.max(0.5, this.boost(s) || 1);
    v.boost = boost;
    v.dur = (V.dur || 4) / Math.min(1.8, boost) * (0.85 + Math.random() * 0.3);
    if (game.state.hour >= 19.2) v.dur *= 0.5;
    if (sp.pose === 'hide') { if (b.rig) b.rig.root.visible = false; v.hidden = true; rt.door = 0; game.audio.play('rs_door', { volume: 0.35 }); }
    if (sp.pose === 'tub') { game.particles.splash(b.x, b.z, 8, 0.6); game.audio.play('splash', { volume: 0.35, pitch: 1.2 }); }
    if (s.type === 'rs_spa' && b.rig) { b.rs.props.cuke = attachProp(b.rig, 'cucumbers'); b.rig.setFace?.('sleepy', { hold: v.dur }); }
    if (sp.pose === 'lie' && s.type !== 'rs_spa') b.rig?.setFace?.('sleepy', { hold: v.dur });
    if (sp.pose === 'tub' || s.type === 'rs_massagechair') b.rig?.setFace?.('happy', { hold: v.dur });
    try { game.staff?.task?.(s, { kind: V.need === 'ticket' ? 'sell' : s.type === 'rs_spa' ? 'massage' : 'serve', dur: Math.min(v.dur, 6), anim: 'work' }); } catch { /* staff is optional */ }
    game.emit('resortUse', { bear: b, s });
  }

  beginExit(v, b) {
    const s = v.s, rt = this.rtOf(s);
    if (v.hidden) { rt.door = 1; if (b.rig) b.rig.root.visible = true; v.hidden = false; this.game.audio.play('rs_door', { volume: 0.35, pitch: 1.1 }); }
    if (v.spotInfo.pose === 'tub') this.game.particles.splash(b.x, b.z, 8, 0.6);
    if (b.rs.props.cuke) { detachProp(b.rs.props.cuke); b.rs.props.cuke = null; }
    this.pay(v, b);
  }

  // the bill for one use, plus what the bear leaves with
  pay(v, b) {
    const game = this.game, s = v.s, V = s.def.visit, rs = b.rs;
    const boost = v.boost || 1;
    let coins = Math.round((V.pay || 0) * (game.mods?.payMult || 1) * (1 + Math.max(0, boost - 1) * 0.25) * (rs.needs.cool > 0.6 && V.need === 'cool' ? 1.25 : 1));
    if (s._rsEvent?.kind === 'heater' && V.need === 'warm') coins = Math.round(coins * 0.5);
    if (coins > 0) {
      game.earnMisc(coins, 'resort');
      this.dayIncome[s.type] = (this.dayIncome[s.type] || 0) + coins;
      const st = (game.state.resort ||= { visits: 0, income: 0, tickets: 0 });
      st.income += coins;
      const p = this.frontPoint(s);
      game.particles.coins(p.x, p.y + 1.1, p.z, Math.min(8, 2 + coins));
      game.ui?.floatTextAt?.(p.x, p.y + 1.5, p.z, `+${coins}`, '#ffe070');
      game.audio.play('coin', { volume: 0.35, pitch: 1.1 + Math.random() * 0.2 });
    }
    if (v.kind === 'ticket') {
      rs.ticket = 'paid';
      (game.state.resort ||= { visits: 0, income: 0, tickets: 0 }).tickets++;
      this.rtOf(s).turn = 1;
      game.audio.play('rs_ticket', { volume: 0.4 });
      return;
    }
    // happiness, tips, needs
    const q = 0.7 + 0.3 * Math.min(2, boost) - (s._rsEvent ? 0.4 : 0);
    rs.joy += (V.joy || 0) * q;
    if (V.tip) b.tips += V.tip * (b.def.pay || 1) * Math.min(2, boost);
    rs.needs[V.need] = 0;
    if (V.need === 'warm') { rs.needs.relax = Math.max(0, rs.needs.relax - 0.3); if (b.cold) b.cold = Math.max(0, b.cold - 0.8); }
    if (V.need === 'relax') rs.needs.warm = Math.max(0, rs.needs.warm - 0.3);
    if (V.need === 'cool' && b.hot) b.hot = Math.max(0, b.hot - 0.8);
    if (V.need === 'care' && b.hurt) b.hurt = 0;
    if (!rs.best || (V.joy || 0) > (STRUCTURES[rs.best]?.visit?.joy || 0)) rs.best = s.type;
    rs.visits++; rs.visited.push(s.type);
    this.dayVisits++;
    (game.state.resort ||= { visits: 0, income: 0, tickets: 0 }).visits++;
    // after-effects + the props they leave with
    const rig = b.rig;
    switch (V.after) {
      case 'wet': rs.wet = 1; rs.needs.dry = 1; break;
      case 'towel': rs.wet = 0; rs.needs.dry = 0; if (rig && !rs.props.towel) rs.props.towel = attachProp(rig, 'towel', { color: b.id % 5 }); this.dryFx(b); break;
      case 'dry': rs.wet = 0; rs.needs.dry = 0; game.particles.sparkle(b.x, b.y + 1.2 * b.def.scale, b.z, 6); break;
      case 'robe': if (rig && !rs.props.robe) rs.props.robe = attachProp(rig, 'robe'); break;
      case 'hat': if (rig && !rs.props.hat) rs.props.hat = attachProp(rig, 'hat'); break;
      case 'cone': if (rig && !rs.props.cone) { rs.props.cone = attachProp(rig, 'cone'); rs.propT.cone = 9; } break;
      case 'mallow': if (rig && !rs.props.mallow) { rs.props.mallow = attachProp(rig, 'mallow'); rs.propT.mallow = 7; } break;
      case 'steamy': rs.steamT = 7; rs.wet = Math.max(rs.wet, 0.4); break;
      case 'photo': game.particles.sparkle(b.x, b.y + 1.6 * b.def.scale, b.z, 10, 0xffffff); break;
      default: break;
    }
    const line = SAY.done[s.type];
    if (line && Math.random() < 0.7) game.bears.say(b, line, Math.random() < 0.5 ? 'emo_happy_face' : null, null, 1.8);
    const hp = game.bears.headTop(b);
    game.particles.hearts(hp.x, hp.y, hp.z, 2);
  }

  dryFx(b) {
    const P = this.game.particles;
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * 6.28;
      P.fx.spawn('drop', b.x + Math.cos(a) * 0.3, b.y + (0.6 + Math.random()) * b.def.scale, b.z + Math.sin(a) * 0.3, { vx: Math.cos(a) * 1.5, vy: 1 + Math.random() * 1.5, vz: Math.sin(a) * 1.5, grav: 9, life: 0.9, size: 0.07, flags: 1, bright: true });
    }
  }

  useFx(v, b, dt) {
    const game = this.game, s = v.s, P = game.particles;
    const r = Math.random();
    switch (s.type) {
      case 'rs_hottub': if (r < dt * 4) P.bubbles(b.x + (Math.random() - 0.5) * 0.4, v.spotInfo.y + 0.45, b.z + (Math.random() - 0.5) * 0.4, 1); if (r < dt * 0.6) P.word?.('zzz', b.x, b.y + 1.8 * b.def.scale, b.z, { size: 0.2, life: 1 }); break;
      case 'rs_spa': if (r < dt * 0.7) P.hearts(b.x, b.y + 0.6, b.z, 1); break;
      case 'rs_photo': { const rt = this.rtOf(s); if (Math.floor(v.t / 0.8) !== Math.floor((v.t - dt) / 0.8) && v.t > 0.6) { rt.flash = 0.15; game.audio.play('rs_flash', { volume: 0.4 }); } break; }
      case 'rs_restroom': if (Math.abs(v.t - v.dur * 0.7) < dt) game.audio.play('rs_flush', { volume: 0.4 }); break;
      case 'rs_sauna': if (r < dt * 2) P.smoke(s.obj.position.x + 0.2, s.obj.position.y + 2.1, s.obj.position.z - 0.3); break;
      case 'rs_campfire': if (r < dt * 0.5) P.word?.('yum', b.x, b.y + 1.6 * b.def.scale, b.z, { size: 0.2, life: 0.8 }); break;
      case 'rs_towels': if (r < dt * 6) this.dryFx(b); break;
      default: break;
    }
  }

  // visit over: back to the bear's own AI
  finish(v, b, done, impatient = false) {
    this.release(v, b);
    if (b.removed) return;
    b.state = 'search'; b.searchT = 0.1; b.t = 0;
    if (impatient) { b.patience = 0; return; }
    if (b.patience < 4) b.patience = 4; // a visit is time well spent, not waiting
    this.game.bears.decide(b);
  }

  release(v, b) {
    const s = v.s, rt = this.rt.get(s.id);
    if (rt) { rt.users = rt.users.filter((u) => u !== b); rt.queue = rt.queue.filter((u) => u !== b); }
    if (b.rig && !b.rig.root.visible) b.rig.root.visible = true;
    if (b.rs?.props?.cuke) { detachProp(b.rs.props.cuke); b.rs.props.cuke = null; }
    if (b.rig?.root) { b.rig.root.rotation.x = 0; b.rig.root.rotation.order = 'XYZ'; }
    if (b.rs) b.rs.current = null;
    v.done = true;
    if (b.script === v) b.script = null;
    if (b.state === 'resort') b.state = 'search';
  }

  // ------------------------------------------------------------ reviews (BearSystem.finishReview hook)
  review(b, stars, text) {
    const rs = b.rs;
    if (!rs || b.angry || stars <= 0) return null;
    let st = stars, tx = text;
    const pathBad = (b.pathGripes || 0) >= 2 || (b.trampled || 0) >= 3;
    const gripes = [...rs.gripes];
    if (pathBad) gripes.push('path');
    if (rs.wet > 0.5 && this.list().some((s) => s.def.visit.need === 'dry')) gripes.push('wet');
    if (rs.joy >= 1.2 && st < 5 && gripes.length < 2) { st++; tx = pick(RAVES[rs.best] || RAVES.any); }
    else if (rs.joy >= 0.5 && st >= 4 && Math.random() < 0.6) tx = pick(RAVES[rs.best] || RAVES.any);
    if (gripes.length >= 2 && st > 1) { st--; tx = pick(GRIPES[gripes[0]] || GRIPES.closed); }
    else if (gripes.length && st <= 3) tx = pick(GRIPES[gripes[0]] || GRIPES.closed);
    return st === stars && tx === text ? null : { stars: st, text: tx };
  }

  // ------------------------------------------------------------ first aid (staff can use these)
  careSpot(x = 0, z = 0) {
    let best = null, bd = Infinity;
    for (const s of this.list()) {
      if (s.type !== 'rs_firstaid' || !this.isOpen(s)) continue;
      const p = this.frontPoint(s), d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = { s, x: p.x, z: p.z }; }
    }
    return best;
  }
  recoveryMult() { return this.list().some((s) => s.type === 'rs_firstaid' && this.isOpen(s) && this.boost(s) > 0) ? 2 : 1; }

  // ------------------------------------------------------------ rampages hurt beavers
  knockBeavers(dt) {
    const game = this.game;
    for (const b of game.bears.list) {
      if (!b.visible || !(b.angry || b.hostile) || !b.moving && b.state !== 'smash') continue;
      const r = 0.55 * b.def.scale + 0.35;
      const staff = game.staff;
      if (staff?.bearHits) continue; // the staff system knocks its beavers over itself (StaffSystem.bearHits)
      if (staff?.nearby && staff?.injure) {
        let near = [];
        try { near = staff.nearby(b.x, b.z, r) || []; } catch { near = []; }
        for (const bv of near) {
          if (!bv || bv.hurt || (bv._rsKnockT || 0) > this.time) continue;
          bv._rsKnockT = this.time + 3;
          try { staff.injure(bv, 'bear'); } catch (e) { console.warn('[resort] injure', e); }
          this.knockFx(b, bv);
        }
        continue;
      }
      for (const bv of game.beavers.list) {
        if (bv.knock || (bv._rsKnockT || 0) > this.time) continue;
        if (Math.hypot(bv.x - b.x, bv.z - b.z) > r) continue;
        bv._rsKnockT = this.time + 6;
        const dx = bv.x - b.x, dz = bv.z - b.z, d = Math.hypot(dx, dz) || 1;
        if (bv.job) try { game.beavers.release(bv); } catch { /* ignore */ }
        bv.knock = { t: 0, vx: (dx / d) * 3.2, vz: (dz / d) * 3.2, vy: 4.2, y: bv.y || 0, spin: (Math.random() < 0.5 ? -1 : 1) * 9, down: 0 };
        bv.state = 'knocked';
        this.knockFx(b, bv);
      }
    }
  }

  knockFx(b, bv) {
    const game = this.game;
    game.particles.stars?.(bv.x, (bv.y || 0) + 0.6, bv.z, 6);
    game.particles.word?.(Math.random() < 0.5 ? 'bonk' : 'pow', bv.x, (bv.y || 0) + 1.1, bv.z, { size: 0.3, life: 0.8 });
    game.rig.shake = Math.max(game.rig.shake, 0.35);
    game.audio.play('rs_bonk', { volume: 0.55 });
    game.emit('beaverKnocked', { bear: b, beaver: bv });
  }

  // the old crew's tumble (only when the staff system isn't there)
  updateKnocked(dt) {
    const g = this.game.grid;
    for (const bv of this.game.beavers.list) {
      const k = bv.knock;
      if (!k) continue;
      k.t += dt;
      if (!k.landed) {
        k.vy -= 12 * dt;
        const nx = bv.x + k.vx * dt, nz = bv.z + k.vz * dt;
        if (g.inb(Math.floor(nx), Math.floor(nz))) { bv.x = nx; bv.z = nz; }
        k.y += k.vy * dt;
        const gy = g.isWater(Math.floor(bv.x), Math.floor(bv.z)) ? -0.5 : g.surfaceY(Math.floor(bv.x), Math.floor(bv.z));
        if (k.y <= gy && k.vy < 0) { k.y = gy; k.landed = true; k.down = 2.6; this.game.particles.dust(bv.x, gy, bv.z, 4); }
        bv.y = k.y;
      } else {
        k.down -= dt;
        if (Math.random() < dt * 3) this.game.particles.stars?.(bv.x, bv.y + 0.5, bv.z, 1);
        if (k.down <= 0) { bv.knock = null; bv.state = 'idle'; bv.t = 0.5; }
      }
    }
  }

  // ------------------------------------------------------------ hooks
  update(simDt, dt) {
    const game = this.game;
    this.time += simDt;
    this.breakage.update(simDt);
    // facility parts: CLOSED signs, clerks, doors, turnstiles, flashes, ambient steam
    this.fxT -= simDt;
    const fx = this.fxT <= 0;
    if (fx) this.fxT = 0.25;
    for (const s of game.structures.list) {
      if (!s.def.visit || s.removed) continue;
      const u = this.ud(s);
      if (!u) continue;
      const P = u.parts, rt = this.rtOf(s);
      if (fx) {
        const open = this.isOpen(s) || !s.built;
        if (P.closed) P.closed.visible = !open;
        if (P.clerk) P.clerk.visible = open && !game.staff;
        if (P.water) P.water.position.y = s._rsEvent?.kind === 'leak' ? -0.18 : 0;
      }
      if (P.door) { const tgt = rt.door ? -1.5 : 0; P.door.userData.open = rt.door > 0; P.door.rotation.y += (tgt - P.door.rotation.y) * Math.min(1, dt * 8); }
      if (P.door2) { const tgt = rt.door ? -1.5 : 0; P.door2.rotation.y += (tgt - P.door2.rotation.y) * Math.min(1, dt * 8); }
      if (P.curtain) { const tgt = rt.door ? 0.35 : 1; P.curtain.scale.x += (tgt - P.curtain.scale.x) * Math.min(1, dt * 8); }
      if (rt.door > 0 && !rt.users.some((u2) => u2.script?.phase === 'enter' || u2.script?.phase === 'exit')) rt.door = Math.max(0, rt.door - dt * 1.5);
      if (P.turnstile && rt.turn > 0) { rt.turn -= dt * 1.4; P.turnstile.rotation.y += dt * 4.2; }
      if (P.flash) { rt.flash -= dt; P.flash.visible = rt.flash > 0; }
      if (fx && s.built && simDt) {
        const o = s.obj?.position;
        if (!o) continue;
        if (s.type === 'rs_hottub' && Math.random() < 0.7) game.particles.smoke(o.x + (Math.random() - 0.5) * 1.2, o.y + 0.65, o.z + (Math.random() - 0.5) * 1.2);
        if (s.type === 'rs_hottub' && rt.users.length && Math.random() < 0.8) game.particles.bubbles(o.x + (Math.random() - 0.5) * 1.1, o.y + 0.5, o.z + (Math.random() - 0.5) * 1.1, 2);
        if (s.type === 'rs_sauna' && Math.random() < 0.5) game.particles.smoke(o.x + 0.42, o.y + 2.15, o.z - 0.3);
        if (s.type === 'rs_campfire' && Math.random() < 0.6) { game.particles.smoke(o.x, o.y + 0.8, o.z); if (Math.random() < 0.5) game.particles.glow.spawn(o.x + (Math.random() - 0.5) * 0.2, o.y + 0.5, o.z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4, 1.2, 0.03, 0xffa040, 0, 0.2, 0); }
      }
    }
    if (!simDt) return;
    // bears: wet from swimming, drying off slowly, cones eaten, steam fading
    for (const b of game.bears.list) {
      if (!b.visible) continue;
      const rs = b.rs || (b.state !== 'commute' && b.state !== 'queued' ? this.initBear(b) : null);
      if (!rs) continue;
      if (b.inWater) rs.wet = 1;
      else if (rs.wet > 0) rs.wet = Math.max(0, rs.wet - simDt * 0.012);
      if (b.state === 'eat' && !rs._ateFlag) { rs._ateFlag = true; rs.needs.clean = Math.min(1, rs.needs.clean + 0.24); }
      if (b.state !== 'eat') rs._ateFlag = false;
      for (const k of ['cone', 'mallow']) if (rs.propT[k] > 0) { rs.propT[k] -= simDt; if (rs.propT[k] <= 0 && rs.props[k]) { detachProp(rs.props[k]); rs.props[k] = null; } }
      if (rs.steamT > 0) rs.steamT -= simDt;
    }
    this.knockBeavers(simDt);
    if (!game.staff) this.updateKnocked(simDt);
    // bears on a visit ignore the shoving between bears (it jams narrow paths and queues):
    // undo what BearSystem's separation did to them this frame, pin seated ones to their seat
    for (const b of game.bears.list) {
      const v = b.script;
      if (!v || v.done || v.px == null) continue;
      if (v.phase === 'use' && v.spotInfo) { b.x = v.spotInfo.x; b.z = v.spotInfo.z; }
      else { b.x = v.px; b.z = v.pz; }
    }
  }

  render(dt) {
    const game = this.game;
    for (const b of game.bears.list) {
      if (!b.visible || !b.rig) continue;
      const v = b.script, rs = b.rs, root = b.rig.root;
      // lying on a table / cot: tip the whole bear onto its back
      if (v && !v.done && v.spotInfo?.pose === 'lie' && (v.phase === 'use' || (v.phase === 'enter' && v.t > 0.3))) {
        root.rotation.order = 'YXZ';
        root.rotation.x = -PI / 2;
      } else if (root.rotation.order !== 'XYZ') { root.rotation.order = 'XYZ'; root.rotation.x = 0; }
      if (v && !v.done && v.phase === 'use' && v.s.type === 'rs_massagechair') { root.position.x += Math.sin(game.time * 70) * 0.014; root.position.z += Math.cos(game.time * 53) * 0.01; }
      if (!rs) continue;
      // wet bears drip and shiver; steamy bears steam
      if (rs.wet > 0.3 && !b.inWater && !(v && v.phase === 'use' && v.spotInfo?.pose === 'tub')) {
        if (Math.random() < dt * 7 * rs.wet) game.particles.fx.spawn('drop', b.x + (Math.random() - 0.5) * 0.4 * b.def.scale, b.y + (0.3 + Math.random() * 0.9) * b.def.scale, b.z + (Math.random() - 0.5) * 0.4 * b.def.scale, { vy: -0.6, grav: 9, life: 0.8, size: 0.06, flags: 1, bright: true });
        if (!b.moving && !b.angry) root.position.x += Math.sin(game.time * 62 + b.id) * 0.012 * b.def.scale;
      }
      if (rs.steamT > 0 && Math.random() < dt * 4) game.particles.smoke(b.x + (Math.random() - 0.5) * 0.3, b.y + 1.2 * b.def.scale, b.z + (Math.random() - 0.5) * 0.3);
    }
    // the old crew's tumbles (staff draws its own)
    if (!game.staff) for (const bv of game.beavers.list) {
      const k = bv.knock;
      if (!k || !bv.rig?.root) continue;
      const r = bv.rig.root;
      r.position.set(bv.x, bv.y, bv.z);
      if (!k.landed) { r.rotation.x = k.t * k.spin; r.rotation.z = k.t * k.spin * 0.6; }
      else { r.rotation.x = PI / 2 * 0.95; r.rotation.z = 0; }
    }
  }

  onNewGame() { this.game.state.resort = { visits: 0, income: 0, tickets: 0 }; }
  onLoad() {
    this.game.state.resort ||= { visits: 0, income: 0, tickets: 0 };
    this.rt.clear();
    this.dayIncome = {};
  }
}

export { NEEDS };
