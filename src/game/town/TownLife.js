// [v33 town] The neighbours' daily lives (game.town, owned by Villagers).
//
//  - ROUTINES: they wake up at their door (stretch, yawn), potter about at home
//    (their own work anims plus sweeping, reading, a sit on the porch, a nap
//    after lunch), and around midday some walk over to your pond along the
//    land you cleared and the paths you painted: they sit on your benches, fish
//    or sit at the shore, drop by Reynard's porch, or join a neighbour who is
//    already there. They walk home before the bears clock off, sit out on the
//    porch in the evening, and go indoors at night (owls stay up). Rain sends
//    most of them inside (Otis and Granny love it).
//  - CHATS: two neighbours who meet swap a two or three line exchange (pair
//    banter, small talk, or what just happened: your newest fish, last night's
//    feast, the weather).
//  - REYNARD: when the fox walks by they wave and say hello, or bring up your
//    newest fish, last night's feast or a quest you just finished. The beaver
//    crew shout "Hey boss!".
//  - HOMES: windows glow from dusk (and on gloomy days), chimneys smoke in the
//    mornings and evenings.
//
// Cheap: only on-screen neighbours animate (the 4 nearest at full rate, the
// rest at half), off-screen walkers just slide along their path, one path
// search per outing, at most two neighbours out at once, one conversation at a
// time. Never touches the camera. Nothing is said while a cutscene, the
// tutorial, a panel / card / full-screen UI, the feast or the night is on.
//
// Debug: game.town.enabled = false (all of it off), game.town.debug() (state),
// game.town.debugSetup() (open the near neighbours + clear walkways to the pond),
// game.town.send(id, 'bench' | 'shore' | 'porch' | 'meet'), game.town.chat(a, b).
import * as THREE from 'three';
import { TownPaths } from './townPath.js';
import { installTownAnims } from './townAnims.js';
import { GREET, GREET_NIGHT, GOSSIP, PAIR_CHATS, ANY_CHATS, TOPIC_CHATS, SOLO, BEAVER_GREET, BEAVER_NIGHT } from './townLines.js';
import { HUT, MEADOW } from '../../world/worldgen.js';
import { WATER_Y } from '../../world/grid.js';
import { grainMaterial, VS } from '../../entities/critterKit.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hasAnim = (r, n) => { const A = r?.anims; return !!A && (Array.isArray(A) ? A.includes(n) : !!A[n]); };
const angTo = (x0, z0, x1, z1) => Math.atan2(x1 - x0, z1 - z0); // rig faces +Z at rotation 0
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const first = (name) => String(name || '').split(' ').pop();

// who does what. out: chance of a walk to the pond on a fine day; work: what they do at home;
// fixed: never leaves the chair; owl: up at night; wet: likes the rain.
const ROLES = {
  clover: { out: 0.8, speed: 1.25, work: ['water_plants', 'dig', 'sniff', 'town_sweep', 'water_plants'] },
  otis: { out: 0.85, speed: 1.15, fish: true, wet: true, work: ['juggle_pebble', 'cast_line', 'town_sit', 'hold_fish'] },
  hazel: { out: 0.6, speed: 1.05, work: ['roll_dough', 'taste', 'town_sweep', 'town_sweep', 'roll_dough'] },
  chip: { out: 0.55, speed: 1.3, work: ['peck_wood', 'measure', 'saw', 'hammer', 'inspect', 'town_sweep'] },
  pip: { out: 0.5, speed: 1.3, work: ['count_logs', 'stuff_cheeks', 'haggle', 'town_sweep'] },
  hoot: { out: 0.35, speed: 1.1, owl: true, work: ['binoculars', 'head_turn', 'write_notes', 'town_read'] },
  rocco: { out: 0.4, speed: 1.15, owl: true, work: ['count_coins', 'rummage', 'show_item', 'town_read'] },
  shellby: { out: 0.3, speed: 0.6, work: ['sip_tea', 'doze', 'town_read', 'town_nap'] },
  flint: { out: 0, speed: 1, work: ['swing_pick', 'bite_nugget', 'town_stretch'] },
  dale: { fixed: true, wet: true },
  granny: { fixed: true, wet: true },
};
// run by other systems' scenes (dig / dive / the Long Talk): never touched
const HANDS_OFF = new Set(['longneck', 'snapp', 'noodles', 'buff']);
// chimney / smoke-hole tops (house group name -> local point) and their door-side
const CHIMNEY = { Home_clover: [0.45, 1.42, -0.25], Home_hazel: [0.55, 2.03, -0.2], Home_otis: [-0.05, 1.1, -0.1], LumberMill: [0.03, 1.55, -0.72] };

const MAX_OUT = 2;
const CHAT_GAP = [16, 30]; // s between two conversations (anywhere)
const GREET_GAP = 4.5; // s between two hellos (anywhere)
const SOLO_GAP = 14;

export class TownLife {
  constructor(game, villagers) {
    this.game = game;
    this.V = villagers;
    this.enabled = true;
    this.paths = new TownPaths(game);
    this.actors = new Map();
    this.time = 0;
    this.chatT = 8; this.greetT = 2; this.soloT = 6; this.beaverT = 3; this.thinkAll = 0;
    this.conv = null;
    this.handles = new Set();
    this.lights = null; // [{ mat }] emissive window materials of the homes
    this.smoke = null; // [{ obj, local, wp }]
    this.ranks = new Map();
    this._v = new THREE.Vector3();
    this._sp = { x: 0, y: 0, visible: false };
    this.wasQuiet = true;
    this.lastPhase = null;
    // memory for gossip: what happened lately (kept in game.state.town)
    game.on?.('questDone', (q) => { if (q?.title) this.remember('quest', { quest: q.title }); });
    game.on?.('weather', (w) => this.onWeather(w));
  }

  // ------------------------------------------------------------------ state
  get S() {
    const st = this.game.state;
    const S = (st.town ||= { mem: {}, said: {} });
    S.mem ||= {}; S.said ||= {};
    return S;
  }

  remember(kind, data = {}) {
    this.S.mem[kind] = { ...data, day: this.game.state.day || 1, at: this.game.time, id: (this.S.mem[kind]?.id || 0) + 1 };
  }

  // the latest news worth mentioning: [kind, vars] or null (each neighbour says each piece once)
  news(a) {
    const S = this.S, day = this.game.state.day || 1;
    const out = [];
    const M = S.mem;
    // the newest fish (a fresh hatch in the last day or so)
    const f = this.newestFish();
    if (f) out.push([f.rare ? 'rareFish' : 'fish', { fish: f.name }, 'fish:' + f.id]);
    if (M.feast && day - M.feast.day <= 1) out.push([M.feast.bad ? 'feastBad' : 'feastGood', { n: M.feast.served }, 'feast:' + M.feast.day]);
    if (M.quest && day - M.quest.day <= 1) out.push(['quest', { quest: M.quest.quest }, 'quest:' + M.quest.id]);
    const wx = this.weather();
    if (wx && GOSSIP[wx]) out.push([wx, {}, 'wx:' + wx + ':' + day]);
    const said = a ? (S.said[a.id] ||= []) : [];
    const fresh = out.filter((n) => !said.includes(n[2]));
    return fresh.length ? fresh[0] : null;
  }

  markSaid(a, n) {
    if (!a || !n) return;
    const L = (this.S.said[a.id] ||= []);
    L.push(n[2]);
    if (L.length > 12) L.splice(0, L.length - 12);
  }

  newestFish() {
    const F = this.game.fish?.list;
    if (!F?.length) return null;
    let best = null;
    for (const f of F) if (!best || (f.id || 0) > (best.id || 0)) best = f;
    if (!best || (this._fishBase != null && (best.id || 0) <= this._fishBase)) return null;
    const sp = best.sp;
    const name = sp?.name || null;
    if (!name) return null;
    const r = Math.max(sp.tier || 0, (best.g?.stars || 1) - 1);
    return { id: best.id, name, rare: r >= 3 };
  }

  weather() {
    const s = this.game.seasons;
    if (!s) return null;
    const w = s.weather;
    if ((w === 'rain' || w === 'storm' || w === 'snow') && (s.intensity ?? 1) < 0.2) return null;
    return w && w !== 'clear' ? w : null;
  }
  raining() { const w = this.weather(); return (w === 'rain' || w === 'storm') && (this.game.seasons?.intensity ?? 1) > 0.3; }

  onWeather(w) {
    if (!this.enabled || this.quiet()) return;
    if (w?.weather === 'rain' || w?.weather === 'storm') {
      // whoever's outside and on screen says something about it
      for (const a of this.actors.values()) {
        if (a.hidden || !a.onScreen || a.conv) continue;
        this.say(a, pick(a.role.wet ? ['Ooh, rain!', 'Splish splash!', 'Lovely weather!'] : SOLO.rain), { mood: a.role.wet ? 'happy' : 'scared' });
        break;
      }
    }
  }

  // ------------------------------------------------------------------ quiet: no bubbles now
  quiet() {
    const g = this.game, st = g.state, ui = g.ui;
    if (!g.running || g.titleMode || st.paused) return true;
    if (g.director?.active || g.cutscene?.active || g.cine?.active || g.tutorial?.active) return true;
    if (g.lab?.active || g.classroom?.active || g.bedtime?.active || g.homes?.active || g.overrideScene) return true;
    if (g.npcScenes?.busy || g.zones?.busy || g.pipVisit?.busy || g.pipVisit?.view || g.workshop?.view || this.V.card) return true;
    if (g.feast?.active || g.dive?.mode?.active || g.nightTour?.active) return true;
    if (ui && (ui.panel || ui.ebuy || ui.book?.isOpen || ui.menu?.isOpen || ui.blueprint?.open || ui.bubbles?.busy)) return true;
    if (st.phase !== 'day' && st.phase !== 'morning' && st.phase !== 'evening' && st.phase !== 'bedtime') return true;
    const B = typeof document !== 'undefined' ? document.body.classList : null;
    if (B) for (const c of QUIET_CLASSES) if (B.contains(c)) return true;
    return false;
  }

  // the town is frozen in place (someone else is directing, or the world is paused)
  frozen() {
    const g = this.game;
    return !g.running || g.titleMode || g.state.paused || g.npcScenes?.busy || g.director?.active || g.homes?.active || !!this.V.card;
  }

  // ------------------------------------------------------------------ actors
  actor(v) {
    let a = this.actors.get(v.id);
    if (a) return a;
    if (!v.rig || HANDS_OFF.has(v.id)) return null;
    const role = ROLES[v.id] || { out: 0, speed: 1, work: [] };
    a = {
      v, id: v.id, role, name: first(v.name),
      home: { x: v.x, z: v.z, y: v.y, ry: v.rig.root.rotation.y },
      mode: 'home', task: null, taskT: rand(1, 4), path: null, pi: 0, goal: null, away: false,
      outDay: -1, actT: 0, pause: 0, greetT: rand(4, 10), chatT: rand(10, 20), hidden: false,
      onScreen: false, dist: 1e9, seat: 0, heading: v.rig.root.rotation.y, want: null, stuck: 0,
    };
    a.anims = installTownAnims(v.rig);
    this.actors.set(v.id, a);
    this.blockHome(v);
    return a;
  }

  // the neighbour's house / mill / stall / workbench are walls for everyone's footpaths
  blockHome(v) {
    if (!v.props || v._townBlocked) return;
    v._townBlocked = true;
    const box = new THREE.Box3();
    v.props.updateMatrixWorld(true);
    for (const c of v.props.children) {
      if (/dock|sign|mail|marker|cooler|cart/i.test(c.name || '')) continue;
      box.setFromObject(c);
      if (box.isEmpty()) continue;
      const sx = box.max.x - box.min.x, sz = box.max.z - box.min.z;
      if (sx < 0.9 && sz < 0.9) continue;
      this.paths.blockBox(box.min.x + 0.3, box.min.z + 0.3, box.max.x - 0.3, box.max.z - 0.45);
    }
    const g = this.game.grid;
    this.paths.blocked.delete(Math.floor(v.z) * g.w + Math.floor(v.x)); // their own spot stays open
    const d = this.game.homes?.doors?.get(v.id);
    if (d) this.paths.blocked.delete(Math.floor(d.pos.z + 0.4) * g.w + Math.floor(d.pos.x));
  }

  /** Villagers.update: is this neighbour indoors / out of sight? */
  hidden(v) {
    const a = this.actors.get(v.id);
    return !!(this.enabled && a?.hidden);
  }
  away(v) { return !!this.actors.get(v.id)?.away; }

  /** Villagers.idle: the town picks the pose while they're out / sitting. true = handled. */
  idleFor(v) {
    const a = this.actors.get(v.id);
    if (!this.enabled || !a || a.role.fixed) return false;
    const r = v.rig;
    if (a.mode === 'walk') { r.play('walk', { loop: true }); return true; }
    if (a.seat) { r._townSeat = a.seat; r.play(a.sitAnim || 'town_sit', { loop: true }); return true; }
    if (a.away) { r.play(a.loopAnim || 'idle', { loop: true }); return true; }
    return false;
  }

  /** Villagers.update: may the old random specials run for this one? (only unmanaged villagers) */
  managed(v) { return this.enabled && this.actors.has(v.id) && !this.actors.get(v.id).role.fixed; }

  /** Villagers.update -> dt for this rig this frame (0 = skip: off screen, LOD) */
  rigDt(v, dt) {
    if (!this.enabled) return dt;
    const a = this.actors.get(v.id);
    const vis = a ? a.onScreen : this.onScreen(v.x, v.y + 0.8, v.z);
    if (!vis) { if (a) a.acc = 0; return 0; }
    const rank = this.ranks.get(v.id) ?? 0;
    if (rank < 4 || !a) return dt;
    a.acc = (a.acc || 0) + dt;
    if ((this.frame + rank) % 2) return 0;
    const d = a.acc; a.acc = 0;
    return Math.min(0.1, d);
  }

  onScreen(x, y, z, pad = 70) {
    const g = this.game;
    if (!g.renderer || !g.rig?.worldToScreen) return true;
    const p = g.rig.worldToScreen(this._v.set(x, y, z), g.renderer, this._sp);
    const W = window.innerWidth, H = window.innerHeight;
    return p.visible && p.x > -pad && p.x < W + pad && p.y > -pad * 1.5 && p.y < H + pad;
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (!this.enabled) { if (this.lights) this.setLights(0.5); return; }
    try { this.tick(dt); } catch (e) { if (!this._err) { this._err = 1; console.warn('[town]', e); } }
  }

  tick(dt) {
    const game = this.game, st = game.state;
    this.time += dt;
    this._dt = dt;
    this.frame = (this.frame || 0) + 1;
    const quiet = this.quiet();
    if (quiet && !this.wasQuiet) this.hush();
    this.wasQuiet = quiet;
    if (st.phase !== this.lastPhase) { this.onPhase(st.phase, this.lastPhase); this.lastPhase = st.phase; }
    // who's around, who's on screen (for LOD + bubbles)
    const cam = game.rig?.target || { x: 70, z: 40 };
    const vis = [];
    for (const v of this.V.list) {
      if (!v.rig || !game.zones?.isOpen(v.zone.id)) continue;
      const a = this.actor(v);
      if (!a) continue;
      a.dist = Math.hypot(v.x - cam.x, v.z - cam.z);
      a.onScreen = !a.hidden && a.dist < 46 && this.onScreen(v.x, v.y + 0.8, v.z);
      if (a.onScreen) vis.push(a);
    }
    vis.sort((p, q) => p.dist - q.dist);
    this.ranks.clear();
    vis.forEach((a, i) => this.ranks.set(a.id, i));
    // the homes: lights + smoke
    this.homesFx(dt);
    if (this.frozen()) { this.thawed = false; return; }
    if (!this.thawed) { this.thawed = true; for (const a of this.actors.values()) a.want = null; }
    let out = 0;
    for (const a of this.actors.values()) if (a.away) out++;
    this.outCount = out;
    for (const a of this.actors.values()) this.think(a, dt);
    if (this.conv) this.tickConv(dt);
    this.chatT -= dt; this.greetT -= dt; this.soloT -= dt; this.beaverT -= dt;
    if (!quiet) {
      if (this.chatT <= 0 && !this.conv) this.findChat(vis);
      if (this.greetT <= 0) this.foxNear(vis);
      if (this.beaverT <= 0) this.beaverHello();
    }
  }

  onPhase(ph, prev) {
    const game = this.game;
    // last night's feast, for tomorrow's gossip
    if (ph === 'report' && game.day) {
      const d = game.day;
      if ((d.served || 0) > 0 || (d.rampages || 0) > 0) this.remember('feast', { served: d.served || 0, bad: (d.rampages || 0) > 0 || (d.happy || 0) < (d.served || 0) * 0.4 });
    }
    // fish already in the pond at load are old news
    if (this._fishBase == null) { const F = game.fish?.list || []; this._fishBase = F.reduce((m, f) => Math.max(m, f.id || 0), 0); }
  }

  // ------------------------------------------------------------------ the routine
  phaseOf() {
    const st = this.game.state, h = st.hour;
    const ph = st.phase;
    if (ph === 'report' || ph === 'bedtime' || ph === 'night' || ph === 'gameover') return 'night';
    if (ph === 'dawn') return h >= 7.2 ? 'wake' : 'night';
    if (h >= 20.2 || h < 6) return 'night';
    if (ph === 'rush' || ph === 'evening' || h >= 16.6) return 'evening';
    if (h < 9.8) return 'morning';
    return 'day';
  }

  think(a, dt) {
    const v = a.v, r = v.rig, game = this.game;
    if (!r) return;
    if (a.role.fixed) { this.thinkFixed(a, dt); return; }
    const P = this.phaseOf();
    const wet = this.raining() && !a.role.wet;
    a.pause = Math.max(0, a.pause - dt);
    a.greetT -= dt; a.chatT -= dt;
    // night: indoors (owls stay up), rain: most go in for a while
    const wantIn = (P === 'night' && !a.role.owl) || (wet && !a.away && a.mode !== 'walk');
    if (a.hidden) {
      if (!wantIn && (P !== 'night' || a.role.owl)) this.comeOut(a);
      return;
    }
    if (a.conv) { this.place(a); return; }
    if (a.mode === 'walk') { this.walk(a, dt); return; }
    // away from home: the outing
    if (a.away) {
      a.actT -= dt;
      const late = P === 'evening' || P === 'night' || wet;
      if (a.actT <= 0 || late) { this.goHome(a, late && wet); return; }
      this.doAct(a, dt);
      this.place(a);
      return;
    }
    if (wantIn) { this.goInside(a); return; }
    // at home: a walk to the pond around midday?
    const day = game.state.day || 1;
    const h = game.state.hour;
    if (P === 'day' && a.outDay !== day && h > 10.2 && h < 14.6 && !wet && a.role.out > 0) {
      a.outDay = day;
      if (Math.random() < a.role.out && this.outCount < MAX_OUT && !this.sceneSoon()) { if (this.goOut(a)) return; }
    }
    this.doHome(a, dt, P);
    this.place(a);
  }

  // dale / granny: in their chairs all day; specials + a doze at night
  thinkFixed(a, dt) {
    const r = a.v.rig;
    a.greetT -= dt; a.chatT -= dt;
    if (!a.onScreen) return;
    const night = this.phaseOf() === 'night';
    a.taskT -= dt;
    if (a.taskT > 0) return;
    a.taskT = rand(8, 14);
    if (night) { if (Math.random() < 0.6) this.zzz(a); return; }
    const sp = (a.v.cast.specials || []).filter((n) => hasAnim(r, n) && n !== 'sit_knit');
    if (sp.length && Math.random() < 0.6) {
      const n = pick(sp);
      r.play(n, { loop: false, onDone: () => this.V.idle(a.v) });
    }
  }

  sceneSoon() {
    const S = this.game.state.npcScenes;
    return !!(S?.events?.length || S?.queue?.length || this.game.npcScenes?.visitors?.size);
  }

  // at home: one thing after another
  doHome(a, dt, P) {
    const r = a.v.rig;
    if (a.pause > 0) return;
    a.taskT -= dt;
    if (a.task && a.taskT > 0) {
      if (a.task === 'town_nap' && Math.random() < dt * 0.6) this.zzz(a);
      return;
    }
    if (a.task) {
      // the loop ends; back on their feet
      const was = a.task;
      a.task = null; a.seat = 0; r._townSeat = 0;
      if (was.startsWith('town_') && (was === 'town_sit' || was === 'town_nap' || was === 'town_read')) this.anim(a, 'idle', true);
      else this.V.idle(a.v);
      a.taskT = rand(2, 5);
      return;
    }
    // a little stroll round the yard now and then
    if (a.anims && Math.random() < 0.18 && a.role.out > 0) {
      const p = this.yardPoint(a);
      if (p) { this.startWalk(a, [{ x: a.v.x, z: a.v.z }, p], { kind: 'yard' }); return; }
    }
    const h = this.game.state.hour;
    const opts = [];
    const add = (n, w = 1) => { if (hasAnim(r, n)) for (let i = 0; i < w; i++) opts.push(n); };
    for (const n of a.role.work || a.v.cast.specials || []) add(n, 2);
    if (a.anims) {
      if (P === 'morning' || P === 'wake') { add('town_stretch', 3); add('town_yawn', 2); }
      if (P === 'evening') { add('town_sit', 4); add('town_read', 3); add('town_yawn', 2); }
      if (h > 12.8 && h < 14.5) add('town_nap', 2);
      if (this.weather() === 'heat') add('town_nap', 3);
      add('town_stretch', 1);
    }
    if (!opts.length) { a.taskT = rand(6, 10); return; }
    const n = pick(opts);
    this.doTask(a, n);
  }

  doTask(a, n) {
    const r = a.v.rig;
    if (!a.away && Math.hypot(a.v.x - a.home.x, a.v.z - a.home.z) < 0.3) a.heading = a.home.ry;
    const loops = n === 'town_sit' || n === 'town_nap' || n === 'town_read' || n === 'town_sweep' || n === 'doze' || n === 'cast_line' || n === 'water_plants' || n === 'float_back';
    a.task = n;
    if (n === 'town_sit' || n === 'town_nap' || n === 'town_read') {
      a.seat = n === 'town_read' && Math.random() < 0.5 ? 0 : 1;
      if (n === 'town_nap') a.seat = Math.random() < 0.6 ? 1 : 0;
      r._townSeat = a.seat;
    }
    r.play(n, { loop: loops, restart: !loops, onDone: loops ? undefined : () => { if (a.task === n) { a.task = null; a.taskT = rand(2, 5); } this.V.idle(a.v); } });
    a.taskT = loops ? rand(7, 14) : 7;
    // a word to themselves, if you're watching
    const S = n === 'town_sweep' ? 'sweep' : n === 'town_read' ? 'read' : n === 'town_nap' ? 'nap' : n === 'town_stretch' ? 'stretch' : n === 'town_yawn' ? 'yawn' : null;
    if (S && Math.random() < 0.35) this.solo(a, pick(SOLO[S]), S === 'nap' || S === 'yawn' ? 'whisper' : 'normal');
    if (n === 'town_yawn' && a.onScreen && a.dist < 22) this.game.audio.play('bed_yawn', { volume: 0.12, pitch: rand(1.1, 1.4) });
  }

  // a spot in their own yard (cleared ground near home)
  yardPoint(a) {
    const g = this.game.grid;
    for (let k = 0; k < 10; k++) {
      const ang = Math.random() * Math.PI * 2, d = rand(1.2, 2.8);
      const x = a.home.x + Math.cos(ang) * d, z = a.home.z + Math.sin(ang) * d * 0.8 + 0.6;
      if (this.paths.tileCost(Math.floor(x), Math.floor(z)) <= 2 && this.paths.tileCost(Math.floor((x + a.home.x) / 2), Math.floor((z + a.home.z) / 2)) <= 2) return { x, z };
    }
    return null;
  }

  // ------------------------------------------------------------------ outings
  pondSpots() {
    const game = this.game;
    const out = [];
    for (const s of game.structures.list) {
      if (!s.built || s.removed || s.type !== 'bench' || !s.obj) continue;
      if ([...this.actors.values()].some((b) => b.goal?.bench === s)) continue;
      const o = s.obj;
      o.updateMatrixWorld(true);
      const seat = o.localToWorld(new THREE.Vector3(-0.05, 0, -0.02));
      const front = o.localToWorld(new THREE.Vector3(0, 0, 0.75));
      if (Math.hypot(seat.x - (HUT.x + 1), seat.z - (HUT.z + 1)) > 40) continue;
      out.push({ kind: 'bench', bench: s, x: front.x, z: front.z, sx: seat.x, sz: seat.z, sy: game.structures.baseY(s) + 0.5, ry: o.rotation.y });
    }
    return out;
  }

  shoreSpot(a) {
    const sh = this.game.ambient?.shore;
    if (!sh?.length) return null;
    const bears = this.game.bears?.list || [];
    for (let k = 0; k < 14; k++) {
      const p = pick(sh);
      if (Math.hypot(p.x - (HUT.x + 1), p.z - (HUT.z + 1)) > 30) continue;
      if ([...this.actors.values()].some((b) => b !== a && b.goal && Math.hypot(b.goal.x - p.x, b.goal.z - p.z) < 2.5)) continue;
      if (bears.some((b) => b.visible && Math.hypot(b.x - p.x, b.z - p.z) < 3)) continue;
      return { kind: 'shore', x: p.x, z: p.z, wx: p.wx, wz: p.wz };
    }
    return null;
  }

  pickDest(a, want = null) {
    const opts = [];
    // join a neighbour who's already out
    for (const b of this.actors.values()) {
      if (b === a || !b.away || b.mode === 'walk' || b.hidden || !b.goal || b.goal.kind === 'meet') continue;
      const ang = rand(0, Math.PI * 2);
      const tx = (b.goal.sx ?? b.v.x) + Math.cos(ang) * 1.3, tz = (b.goal.sz ?? b.v.z) + 1.0;
      if (this.paths.tileCost(Math.floor(tx), Math.floor(tz)) <= 2) opts.push({ w: 3, d: { kind: 'meet', with: b, x: tx, z: tz } });
    }
    for (const b of this.pondSpots()) opts.push({ w: 2.5, d: b });
    const sh = this.shoreSpot(a);
    if (sh) opts.push({ w: a.role.fish ? 6 : 1.5, d: sh });
    opts.push({ w: 0.8, d: { kind: 'porch', x: HUT.x + 1.5 + rand(-0.8, 0.8), z: HUT.z + 4.9 + rand(0, 0.6) } });
    const f = want ? opts.filter((o) => o.d.kind === want) : opts;
    if (!f.length) return null;
    let tot = f.reduce((s, o) => s + o.w, 0), x = Math.random() * tot;
    for (const o of f) { x -= o.w; if (x <= 0) return o.d; }
    return f[0].d;
  }

  goOut(a, want = null) {
    const d = this.pickDest(a, want);
    if (!d) return false;
    const path = this.paths.find({ x: a.v.x, z: a.v.z }, { x: d.x, z: d.z });
    if (!path) return false;
    a.away = true;
    a.task = null;
    this.startWalk(a, path, d);
    a.actT = d.kind === 'meet' ? rand(25, 40) : rand(35, 60);
    return true;
  }

  goHome(a, hurry = false) {
    this.endAct(a);
    const path = this.paths.find({ x: a.v.x, z: a.v.z }, { x: a.home.x, z: a.home.z });
    if (path) this.startWalk(a, path, { kind: 'home' }, hurry ? 1.6 : 1);
    else { a.goal = { kind: 'home' }; a.mode = 'walk'; a.path = null; } // walk() teleports once nobody's looking
    if (hurry && a.onScreen) this.solo(a, pick(SOLO.rain), 'scared', true);
  }

  startWalk(a, path, goal, speedK = 1) {
    a.mode = 'walk'; a.path = path; a.pi = 1; a.goal = goal; a.speedK = speedK; a.stuck = 0;
    a.task = null; a.seat = 0; a.v.rig._townSeat = 0;
    this.anim(a, 'walk', true);
  }

  walk(a, dt) {
    const v = a.v, game = this.game;
    if (a.pause > 0) { if (a.v.rig.current === 'walk') this.anim(a, 'idle'); this.place(a); return; }
    const sp = (a.role.speed || 1.1) * (a.speedK || 1) * (a.onScreen ? 1 : 1.8);
    if (!a.path) {
      // no way back: pop home once nobody's looking
      if (!a.onScreen) { v.x = a.home.x; v.z = a.home.z; this.arrive(a); }
      return;
    }
    let left = sp * dt;
    while (left > 0 && a.pi < a.path.length) {
      const p = a.path[a.pi];
      const dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz);
      if (d <= left) { v.x = p.x; v.z = p.z; left -= d; a.pi++; continue; }
      v.x += (dx / d) * left; v.z += (dz / d) * left;
      a.heading = this.turn(a.heading, Math.atan2(dx, dz), dt * 8);
      left = 0;
    }
    if (a.onScreen && a.v.rig.current !== 'walk' && !a.pause) this.anim(a, 'walk', true);
    if (a.pi >= a.path.length) { this.arrive(a); return; }
    // footsteps on screen, now and then
    if (a.onScreen && a.dist < 16 && Math.random() < dt * 0.6) game.particles?.dust?.(v.x, v.y, v.z, 1);
    this.place(a);
  }

  arrive(a) {
    const g = a.goal || {};
    a.mode = a.away ? 'act' : 'home';
    a.path = null;
    if (g.kind === 'home') {
      a.away = false; a.goal = null; a.mode = 'home';
      a.heading = a.home.ry;
      this.place(a);
      this.V.idle(a.v);
      a.taskT = rand(1, 3);
      if (Math.random() < 0.3) this.solo(a, pick(SOLO.home));
      if (a.wantIn) { a.wantIn = false; this.goInside(a); }
      return;
    }
    if (g.kind === 'yard') { a.mode = 'home'; a.goal = null; this.V.idle(a.v); a.taskT = rand(1.5, 4); return; }
    if (g.kind === 'door') { this.hide(a); return; }
    this.startAct(a);
  }

  startAct(a) {
    const g = a.goal, v = a.v, r = v.rig;
    a.mode = 'act';
    a.loopAnim = null; a.sitAnim = null;
    if (g.kind === 'bench' && a.anims) {
      a.seat = 2; r._townSeat = 2;
      a.seatY = g.sy - 2.3 * VS * (r.BS || 0.8);
      a.slide = { x0: v.x, z0: v.z, y0: v.y, x1: g.sx, z1: g.sz, y1: a.seatY, t: 0, dur: 0.6 };
      a.heading = g.ry;
      a.sitAnim = Math.random() < 0.3 ? 'town_read' : 'town_sit';
      r.play(a.sitAnim, { loop: true });
      if (Math.random() < 0.4) this.solo(a, pick(SOLO.sit));
    } else if (g.kind === 'shore') {
      a.heading = angTo(v.x, v.z, g.wx, g.wz);
      if (a.role.fish && hasAnim(r, 'cast_line')) { a.loopAnim = 'cast_line'; r.play('cast_line', { loop: true }); if (Math.random() < 0.5) this.solo(a, pick(SOLO.fish)); }
      else if (a.anims) { a.seat = 1; r._townSeat = 1; a.sitAnim = 'town_sit'; r.play('town_sit', { loop: true }); }
      else this.anim(a, 'idle');
    } else if (g.kind === 'meet' && g.with) {
      a.heading = angTo(v.x, v.z, g.with.v.x, g.with.v.z);
      this.anim(a, 'idle');
      a.chatT = 0; g.with.chatT = Math.min(g.with.chatT, 0);
      this.chatT = Math.min(this.chatT, 0.5);
    } else {
      // Reynard's porch: have a look around
      a.heading = angTo(v.x, v.z, HUT.x + 1.5, HUT.z + 1.5);
      this.anim(a, 'idle');
      a.greetT = Math.min(a.greetT, 0);
    }
    this.place(a);
  }

  // things to do while out
  doAct(a, dt) {
    const g = a.goal, r = a.v.rig;
    if (!g || a.pause > 0) return;
    a.taskT -= dt;
    if (a.taskT > 0) return;
    a.taskT = rand(8, 14);
    if (a.seat && a.anims) {
      // on the bench / the bank: sit, read, doze off
      const n = pick(['town_sit', 'town_sit', 'town_read', 'town_nap']);
      a.sitAnim = n; r._townSeat = a.seat; r.play(n, { loop: true });
      if (n === 'town_nap') this.zzz(a);
    } else if (a.loopAnim === 'cast_line' && Math.random() < 0.35 && hasAnim(r, 'hold_fish')) {
      r.play('hold_fish', { loop: false, onDone: () => r.play('cast_line', { loop: true }) });
      if (a.onScreen) { this.solo(a, pick(['Got one!', 'A whopper!', 'Hello, gorgeous!']), 'excited', true); this.game.audio.play('fish_flop', { volume: 0.2 }); }
    } else if (!a.loopAnim) {
      const sp = (a.role.work || []).filter((n) => hasAnim(r, n) && !/sweep|dough|saw|peck|swing|count_logs|water/.test(n));
      const n = sp.length && Math.random() < 0.5 ? pick(sp) : a.anims && Math.random() < 0.4 ? 'town_stretch' : null;
      if (n) r.play(n, { loop: false, onDone: () => this.anim(a, 'idle', true) });
    }
  }

  endAct(a) {
    const r = a.v.rig;
    a.seat = 0; r._townSeat = 0; a.loopAnim = null; a.sitAnim = null;
    if (a.goal?.kind === 'bench') { a.v.x = a.goal.x; a.v.z = a.goal.z; a.slide = null; }
  }

  // ------------------------------------------------------------------ indoors
  goInside(a) {
    const d = this.game.homes?.doors?.get(a.id);
    if (a.away) { a.wantIn = true; this.goHome(a); return; }
    if (!d || !a.onScreen) { this.hide(a); return; }
    const to = { x: d.pos.x, z: d.pos.z + 0.25 };
    if (Math.hypot(to.x - a.v.x, to.z - a.v.z) > 6) { this.hide(a); return; }
    if (Math.random() < 0.35) this.solo(a, pick(this.raining() ? SOLO.rain : SOLO.bed), 'whisper', true);
    this.startWalk(a, [{ x: a.v.x, z: a.v.z }, to], { kind: 'door' });
  }

  hide(a) {
    a.hidden = true; a.mode = 'home'; a.away = false; a.path = null; a.goal = null; a.task = null; a.seat = 0;
    a.v.rig._townSeat = 0;
    a.v.x = a.home.x; a.v.z = a.home.z;
    a.inAt = this.time;
    if (a.onScreen && a.dist < 24) { this.game.audio.play('rs_door', { volume: 0.12 }); this.game.particles?.puff?.(a.v.x, a.v.y + 0.2, a.v.z, 4, 0.2); }
  }

  comeOut(a) {
    if (this.time - (a.inAt || 0) < 6 && this.raining()) return; // stay in a while
    a.hidden = false;
    const d = this.game.homes?.doors?.get(a.id);
    if (d && this.onScreen(d.pos.x, d.pos.y + 0.6, d.pos.z)) {
      a.v.x = d.pos.x; a.v.z = d.pos.z + 0.3;
      this.startWalk(a, [{ x: a.v.x, z: a.v.z }, { x: a.home.x, z: a.home.z }], { kind: 'home' });
      if (this.phaseOf() === 'wake' || this.phaseOf() === 'morning') a.taskT = 0.5;
    } else { a.v.x = a.home.x; a.v.z = a.home.z; a.mode = 'home'; this.V.idle(a.v); }
    a.v.rig.root.visible = true;
  }

  // ------------------------------------------------------------------ pose in the world
  place(a) {
    const v = a.v, r = v.rig, g = this.game.grid;
    let y;
    if (a.slide) {
      // hop up onto the bench (or back down)
      const S = a.slide;
      S.t += this._dt || 1 / 60;
      const k = Math.min(1, S.t / S.dur), e = k * k * (3 - 2 * k);
      v.x = S.x0 + (S.x1 - S.x0) * e; v.z = S.z0 + (S.z1 - S.z0) * e;
      y = S.y0 + (S.y1 - S.y0) * e + Math.sin(k * Math.PI) * 0.12;
      if (k >= 1) a.slide = null;
    } else if (a.seat === 2 && a.seatY != null) y = a.seatY;
    else {
      const tx = Math.floor(v.x), tz = Math.floor(v.z);
      y = g.isWater(tx, tz) ? (this.game.paths?.deckY?.(v.x, v.z) ?? WATER_Y + 0.25) : (g.surfaceAtVisual ? g.surfaceAtVisual(v.x, v.z) : g.groundAt(v.x, v.z));
      if (a.mode === 'home' && !a.away && Math.hypot(v.x - a.home.x, v.z - a.home.z) < 0.05) y = a.home.y;
    }
    v.y = y;
    r.root.position.set(v.x, y, v.z);
    if (a.face != null) { a.heading = this.turn(a.heading, a.face, 0.2); }
    const cur = r.root.rotation.y;
    r.root.rotation.y = cur + wrapA(a.heading - cur) * 0.25;
  }

  turn(h, to, k) { return h + wrapA(to - h) * Math.min(1, k); }

  anim(a, name, force = false) {
    const r = a.v.rig;
    if (!r || !hasAnim(r, name)) return;
    if (!force && r.current === name) return;
    r.play(name, { loop: name === 'walk' || name === 'idle' || name === 'talk' || name === 'town_sit' });
  }

  // ------------------------------------------------------------------ bubbles
  say(a, text, o = {}) {
    if (!text || this.quiet()) return null;
    const v = a.v;
    const h = this.game.say(this.V.anchor(v), text, {
      voice: v.cast?.voice || 'fox', mood: o.mood || 'normal', size: 's', key: 'npc' + v.id, chat: true,
      dur: o.dur ?? Math.min(4.2, 1.5 + text.length * 0.045),
    });
    if (h) { this.handles.add(h); h.done?.then?.(() => this.handles.delete(h)); }
    return h;
  }

  solo(a, text, mood = 'normal', force = false) {
    if (!a.onScreen || a.dist > 26 || a.conv) return;
    if (!force && this.soloT > 0) return;
    this.soloT = SOLO_GAP * rand(0.8, 1.3);
    this.say(a, text, { mood });
  }

  hush() {
    for (const h of this.handles) { try { h.close?.(); } catch { /* ignore */ } }
    this.handles.clear();
    if (this.conv) this.endConv();
  }

  zzz(a) { if (a.onScreen) this.game.particles?.zzz?.(a.v.x + 0.15, a.v.y + (a.v.cast.height || 1.4) * (a.seat ? 0.75 : 1), a.v.z); }

  // ------------------------------------------------------------------ Reynard walks by
  foxNear(vis) {
    const fox = this.game.fox;
    if (!fox || fox.bed || fox.asleep || fox.cine) return;
    this.greetT = 0.3;
    for (const a of vis) {
      if (a.greetT > 0 || a.conv || a.hidden || a.dist > 30) continue;
      const d = Math.hypot(fox.x - a.v.x, fox.z - a.v.z);
      if (d > 2.7) continue;
      this.greet(a);
      this.greetT = GREET_GAP;
      return;
    }
  }

  greet(a) {
    const v = a.v, r = v.rig, fox = this.game.fox;
    a.greetT = rand(40, 70);
    const n = this.news(a);
    let text;
    if (this.phaseOf() === 'evening' && Math.random() < 0.5) text = pick(GREET_NIGHT);
    else if (n && Math.random() < 0.75) { text = this.fill(pick(GOSSIP[n[0]]), n[1], a); this.markSaid(a, n); }
    else text = pick(GREET[a.id] || GREET._);
    if (!a.role.fixed) {
      a.face = angTo(v.x, v.z, fox.x, fox.z);
      setTimeout(() => { a.face = null; }, 2600);
      if (!a.seat && hasAnim(r, 'wave')) {
        a.pause = Math.max(a.pause, 1.6);
        r.play('wave', { loop: false, restart: true, onDone: () => this.V.idle(v) });
      }
    }
    this.say(a, text, { mood: n ? 'excited' : 'happy' });
    // Reynard answers now and then
    if (Math.random() < 0.4) {
      const reply = pick([`Hey, ${a.name}!`, 'Morning!', 'Got any coins?', 'Busy busy!', `Looking sharp, ${a.name}.`]);
      setTimeout(() => {
        if (this.quiet()) return;
        const h = this.game.say({ getWorldPos: (p) => p.set(fox.x, fox.y + 1.75, fox.z) }, reply, { voice: 'fox', mood: 'happy', size: 's', key: 'fox', chat: true, dur: 2 });
        if (h) this.handles.add(h);
      }, 1500);
    }
  }

  fill(t, vars = {}, a = null, b = null) {
    return t.replace(/\{(\w+)\}/g, (m, k) => (k === 'A' ? a?.name : k === 'B' ? b?.name : k === 'fox' ? 'Reynard' : vars[k] != null ? String(vars[k]) : m) || m);
  }

  beaverHello() {
    this.beaverT = 0.5;
    const game = this.game, fox = game.fox;
    if (!fox || fox.bed || fox.asleep) return;
    for (const b of game.beavers?.list || []) {
      if (!b.rig?.root?.visible || (b.townT || 0) > game.time) continue;
      const d = Math.hypot(b.x - fox.x, b.z - fox.z);
      if (d > 2.2) continue;
      if (!this.onScreen(b.x, (b.y || 0) + 0.8, b.z)) continue;
      b.townT = game.time + rand(50, 90);
      this.beaverT = rand(10, 16);
      const night = this.phaseOf() !== 'day' && this.phaseOf() !== 'morning';
      const text = night ? pick(BEAVER_NIGHT) : b.carry ? 'Logs, boss!' : pick(BEAVER_GREET);
      const h = game.say({ getWorldPos: (p) => p.set(b.x, (b.y || 0) + 1.05, b.z) }, text, { voice: 'beaver', mood: 'happy', size: 's', key: 'beav' + (b.id ?? ''), chat: true, dur: 1.8 });
      if (h) this.handles.add(h);
      return;
    }
  }

  // ------------------------------------------------------------------ conversations
  findChat(vis) {
    this.chatT = 0.5;
    for (let i = 0; i < vis.length; i++) {
      const a = vis[i];
      if (a.chatT > 0 || a.mode === 'walk' || a.hidden || a.dist > 28) continue;
      for (let j = i + 1; j < vis.length; j++) {
        const b = vis[j];
        if (b.chatT > 0 || b.mode === 'walk' || b.hidden) continue;
        if (Math.hypot(a.v.x - b.v.x, a.v.z - b.v.z) > 3.2) continue;
        if (this.chat(a, b)) return;
      }
    }
  }

  /** start a conversation between two actors (or ids) */
  chat(a, b) {
    if (typeof a === 'string') a = this.actors.get(a);
    if (typeof b === 'string') b = this.actors.get(b);
    if (!a || !b || this.conv || this.quiet() || !a.onScreen || !b.onScreen) return false;
    let lines = null;
    const P = PAIR_CHATS.filter((p) => (p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id));
    const n = this.news(null);
    const r = Math.random();
    if (P.length && r < 0.55) {
      const p = pick(P);
      if (p.a !== a.id) [a, b] = [b, a];
      lines = p.lines;
    } else if (n && TOPIC_CHATS[n[0]] && r < 0.8) lines = pick(TOPIC_CHATS[n[0]]).map((L) => ({ ...L, vars: n[1] }));
    else lines = pick(ANY_CHATS);
    this.conv = { a, b, lines, i: -1, t: 0, h: null };
    a.conv = b.conv = this.conv;
    a.chatT = b.chatT = rand(60, 100);
    a.face = angTo(a.v.x, a.v.z, b.v.x, b.v.z);
    b.face = angTo(b.v.x, b.v.z, a.v.x, a.v.z);
    return true;
  }

  tickConv(dt) {
    const C = this.conv;
    if (this.quiet() || C.a.hidden || C.b.hidden || !C.a.onScreen || !C.b.onScreen) { this.endConv(); return; }
    C.t -= dt;
    if (C.t > 0) return;
    // the previous speaker settles
    const prev = C.lines[C.i];
    if (prev) {
      const sp = prev.by === 'b' ? C.b : C.a;
      if (prev.anim && hasAnim(sp.v.rig, prev.anim) && !sp.seat) sp.v.rig.play(prev.anim, { loop: false, onDone: () => this.V.idle(sp.v) });
      else if (sp.v.rig.current === 'talk') this.V.idle(sp.v);
    }
    C.i++;
    if (C.i >= C.lines.length) { this.endConv(); return; }
    const L = C.lines[C.i];
    const sp = L.by === 'b' ? C.b : C.a, other = sp === C.a ? C.b : C.a;
    const text = this.fill(L.t, L.vars || {}, sp, other);
    if (!sp.seat && !sp.loopAnim && hasAnim(sp.v.rig, 'talk')) sp.v.rig.play('talk', { loop: true });
    C.h = this.say(sp, text, { mood: L.mood || (/!$/.test(text) ? 'happy' : 'normal') });
    C.t = Math.min(4.2, 1.6 + text.length * 0.05) + 0.35;
  }

  endConv() {
    const C = this.conv;
    if (!C) return;
    this.conv = null;
    for (const x of [C.a, C.b]) {
      x.conv = null;
      x.face = null;
      if (x.v.rig?.current === 'talk') this.V.idle(x.v);
      if (x.goal?.kind === 'meet') x.actT = Math.min(x.actT, rand(4, 10));
    }
    this.chatT = rand(...CHAT_GAP);
  }

  // ------------------------------------------------------------------ the homes: windows + chimneys
  collectHomes() {
    const mats = new Set();
    const smoke = [];
    for (const v of this.V.list) {
      if (!v.props) continue;
      v.props.traverse((o) => {
        if (o.isMesh && o.material?.emissive && o.material.emissive.getHex() !== 0 && !o.castShadow) mats.add(o.material);
        const c = CHIMNEY[o.name];
        if (c) smoke.push({ obj: o, v, local: new THREE.Vector3(...c), wp: new THREE.Vector3() });
      });
    }
    // the cottages' window glow (shared material, see homeExteriors.js)
    try { mats.add(grainMaterial(VS, [0, 0, 0], 0.02, 0xffc860)); } catch { /* ignore */ }
    this.lights = [...mats].map((m) => ({ m, base: m.emissiveIntensity ?? 1 }));
    this.smoke = smoke;
    this.homesN = this.V.list.filter((v) => v.props).length;
  }

  setLights(k) {
    for (const L of this.lights || []) L.m.emissiveIntensity = L.base * k;
  }

  homesFx(dt) {
    const game = this.game;
    const n = this.V.list.filter((v) => v.props).length;
    if (!this.lights || n !== this.homesN) this.collectHomes();
    const night = game.sky?.state?.night ?? 0;
    const gloom = this.raining() || this.weather() === 'fog' || this.weather() === 'snow' ? 0.35 : 0;
    const lit = Math.min(1, Math.max(night * 1.4, gloom));
    // dim-but-warm by day, glowing after dusk; a soft flicker like an oil lamp
    const k = 0.22 + lit * (1.15 + Math.sin(this.time * 7.3) * 0.04 + Math.sin(this.time * 2.1) * 0.03);
    this.setLights(k);
    // chimneys: breakfast, supper, cold and wet days
    const P = this.phaseOf();
    const cold = (game.seasons?.temp ?? 15) < 8;
    const rate = P === 'morning' || P === 'wake' || P === 'evening' || P === 'night' || cold || gloom ? 2.2 : 0.35;
    const cam = game.rig?.target;
    for (const s of this.smoke || []) {
      if (!s.obj.parent || (cam && Math.hypot(s.v.x - cam.x, s.v.z - cam.z) > 34)) continue;
      const a = this.actors.get(s.v.id);
      const home = !a || a.hidden || !a.away;
      if (Math.random() > dt * rate * (home ? 1 : 0.3)) continue;
      s.obj.updateMatrixWorld();
      s.obj.localToWorld(s.wp.copy(s.local));
      game.particles?.smoke?.(s.wp.x, s.wp.y, s.wp.z);
    }
    // night owls glow too: a firefly or two round a lit home after dark
    if (lit > 0.6 && Math.random() < dt * 0.8) {
      const v = pick(this.V.list);
      if (v?.props && cam && Math.hypot(v.x - cam.x, v.z - cam.z) < 24) game.particles?.firefly?.(v.x + rand(-2.5, 2.5), (v.y || 0) + rand(0.4, 1.4), v.z + rand(-1, 2.5));
    }
  }

  // ------------------------------------------------------------------ debug
  debug() {
    const out = { enabled: this.enabled, quiet: this.quiet(), phase: this.phaseOf(), out: this.outCount, conv: this.conv ? `${this.conv.a.id}+${this.conv.b.id} #${this.conv.i}` : null, actors: {} };
    for (const a of this.actors.values()) out.actors[a.id] = { mode: a.mode, away: a.away, hidden: a.hidden, goal: a.goal?.kind || null, task: a.task, seat: a.seat, on: a.onScreen, x: +a.v.x.toFixed(1), z: +a.v.z.toFixed(1), anim: a.v.rig?.current };
    return out;
  }

  /** send a neighbour out now ('bench' | 'shore' | 'porch' | 'meet' | null = any) */
  send(id, kind = null, { skip = false } = {}) {
    const a = this.actors.get(id);
    if (!a) return false;
    if (a.hidden) { a.hidden = false; a.v.rig.root.visible = true; }
    a.outDay = this.game.state.day;
    const ok = this.goOut(a, kind);
    if (ok && skip && a.path?.length > 1) {
      // tests: start the walk a couple of tiles before the end
      const P = a.path, q = P[P.length - 1], p = P[P.length - 2];
      const d = Math.hypot(q.x - p.x, q.z - p.z) || 1, k = Math.min(1, 2.2 / d);
      a.v.x = q.x + (p.x - q.x) * k; a.v.z = q.z + (p.z - q.z) * k; a.pi = P.length - 1;
    }
    return ok;
  }

  /** tests: fast-forward the town by `sec` seconds (movement + routine only, no rendering) */
  ff(sec = 10, step = 0.1) {
    for (let t = 0; t < sec; t += step) this.tick(step);
    return this.debug();
  }

  /** test setup: open the close neighbours' areas (quietly) and clear walkways from each to the pond */
  debugSetup(ids = ['clover', 'pip', 'chip', 'otis']) {
    const game = this.game;
    const S = game.npcScenes?.S;
    for (const id of ids) {
      const v = this.V.get(id);
      if (!v) continue;
      if (!game.zones.isOpen(v.zone.id)) game.zones.reveal(v.zone, null, { quiet: true });
      if (S) { S.arrive[id] = 1; S.visit[id] = 1; S.queue = S.queue.filter((z) => z !== v.zone.id); }
      this.V.revealed(v.zone);
      const st = this.V.vstate(v); st.met = true;
      this.actor(v);
      // a 3-wide walkway to the pond's edge
      const tx = HUT.x - 4, tz = MEADOW.z1 - 3;
      const n = Math.ceil(Math.hypot(tx - v.x, tz - v.z) * 2);
      for (let k = 0; k <= n; k++) {
        const x = v.x + ((tx - v.x) * k) / n, z = v.z + ((tz - v.z) * k) / n + 1.5;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) game.beavers.clearInstant(Math.floor(x) + dx, Math.floor(z) + dz);
      }
    }
    this.paths._costT = -1;
    return ids.map((id) => [id, !!this.V.get(id)?.rig]);
  }
}

const QUIET_CLASSES = ['cine', 'cutscene-on', 'feast-cam', 'feast-focus', 'lab-mode', 'lab-full', 'lt-pc', 'pc-mode', 'class-mode', 'bedtime-mode', 'ebuy-open', 'wd-open', 'mbk-reading', 'qn-open', 'blueprint', 'at-title', 'demo-over'];
