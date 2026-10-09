// [v26 evening] game.homePC: Reynard's home office.
//
// - Keeps the books: a per-day history in game.state.homePC.history (capped, see record()).
// - END OF DAY (UI.showReport -> evening()): Reynard walks into his hut (short world shot),
//   cut to his room, he sits at his chunky 386 and the day comes up as graphs
//   (src/ui/HomePC.js). He reacts in 3D about the actual numbers: a desk slam, a swivel
//   round in the big red chair and a finger in your face on a bad day ("WHO approved
//   THIS?"), fingertips steepled and smug on a good one. "View full detail" opens the
//   ledger on the PC; "Go to bed" hands the room straight to the bedtime cutscene
//   (src/game/Bedtime.js, which starts from the desk).
// - ANYTIME: a bobbing door marker on his hut; tap the door -> his room (game paused,
//   Back / Esc leaves); click the PC -> the same app in browse mode (pick a day,
//   all-time graphs). A few other props do little things.
//
//   game.homePC.history            [entry] oldest first
//   game.homePC.record(report)     (Game.startReport) -> entry
//   game.homePC.evening(report, done)   (UI.showReport)
//   game.homePC.enterHouse() / leaveHouse()
//   game.homePC.roomActive / handover   (Input.js / Game.startBedtime hooks)
import * as THREE from 'three';
import { HUT } from '../../world/worldgen.js';
import { Bedtime } from '../Bedtime.js';
import { openHomePC } from '../../ui/HomePC.js';
import { makeDoorMarker } from '../../entities/homes/homeExteriors.js';

const CAP = 60; // days kept
const DETAIL_DAYS = 14; // reviews / events kept for the most recent days only
const INCOME = {
  bills: ['Fish dinners', 'fish'], snacks: ['Snack bar', 'berry'], tips: ['Tips', 'coins'], trophies: ['Trophy prizes', 'trophy'],
  refunds: ['Refunds', 'trash'], clearing: ['Land clearing', 'trash'], gifts: ['Gifts', 'heart'], facilities: ['Resort', 'rs_spa'],
  resort: ['Resort', 'rs_spa'], feast: ['Feast events', 'bell'], events: ['Feast events', 'bell'], ore: ['Ore & parts', 'res_iron'], mining: ['Ore & parts', 'res_iron'],
  sales: ['Sales', 'coin'], shop: ['Sales', 'coin'], tickets: ['Tickets', 'rs_ticket'],
};
const EXPENSE = {
  eggs: ['Fish eggs', 'egg'], builds: ['Construction', 'hammer'], research: ['Research', 'flask'], digging: ['Digging', 'shovel'],
  clearing: ['Land clearing', 'trash'], shop: ['e-Buy shopping', 'coin'], ebuy: ['e-Buy shopping', 'coin'], food: ['Fish food', 'food'],
  wages: ['Staff wages', 'beaver'], staff: ['Staff wages', 'beaver'], rescue: ['Rescues', 'beaver'], repairs: ['Repairs', 'hammer'],
  power: ['Power bill', 'pw_bolt'], fuel: ['Fuel', 'res_coal'], feast: ['Feast events', 'bell'], events: ['Feast events', 'bell'], rush: ['Rush fees', 'fastforward'],
};
const FOX_LINES = {
  enter: ['Home sweet home. Don\'t touch the ledger.', 'Wipe your paws. This rug was imported.', 'My humble den. Emphasis on DEN.'],
  bed: ['A nap? At this hour? ...Tempting.', 'That quilt took my nan three winters.', 'Not sleepy. Fine. A LITTLE sleepy.'],
  alarm: ['Don\'t. Touch. The alarm.', 'That thing has ruined more mornings than bears.'],
  piggy: ['My retirement fund. Hands off.', 'Every coin in there has a name.'],
  chart: ['Up and to the right. Always.', 'I drew that chart myself. Before the numbers came in.'],
  window: ['Lovely view. Of MY pond.', 'Somewhere out there, a bear is hungry. Good.'],
  cabinet: ['Receipts. Thousands of them. Alphabetical.', 'Top drawer: invoices. Bottom drawer: snacks.'],
  idle: ['So. Are we looking at the books or not?', 'The computer won\'t check itself.', 'Smell that? Leather chair. Success.'],
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmt = (n) => Math.round(+n || 0).toLocaleString('en-US');
const title = (k) => String(k).replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

function cats(obj, table) {
  const out = [];
  const seen = new Map();
  for (const [k, raw] of Object.entries(obj || {})) {
    const v = Math.round(+raw || 0);
    if (v <= 0) continue;
    const [label, icon] = table[k] || [title(k), 'coin'];
    const prev = seen.get(label);
    if (prev) { prev.v += v; continue; }
    const c = { k, label, icon, v };
    seen.set(label, c);
    out.push(c);
  }
  return out;
}

export function install(game) { return new HomePCSystem(game); }

class HomePCSystem {
  constructor(game) {
    this.game = game;
    this.roomActive = false; // Reynard's room is on screen and takes the canvas input
    this.handover = false; // evening: the room stays up for the bedtime cutscene
    this.busy = false;
    this.mode = null; // 'evening' | 'visit'
    this.state = 'off';
    this.timers = [];
    this.t = 0;
    this.pc = null;
    this.marker = null;
    this._ray = new THREE.Ray();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  // ---------------------------------------------------------------- save data
  get st() {
    const s = this.game.state;
    if (!s.homePC || typeof s.homePC !== 'object') s.homePC = { history: [] };
    if (!Array.isArray(s.homePC.history)) s.homePC.history = [];
    return s.homePC;
  }
  get history() { return this.st.history; }
  onNewGame() { this.game.state.homePC = { history: [] }; }
  onLoad() { void this.st; }

  // ---------------------------------------------------------------- the books
  /** Snapshot today's numbers (call after Game.buildReport). Returns the history entry. */
  record(report) {
    const g = this.game, st = g.state, d = g.day || {};
    if (!report) return null;
    const inc = cats(d.income, INCOME), exp = cats(d.expense, EXPENSE);
    const inTotal = inc.reduce((s, c) => s + c.v, 0), outTotal = exp.reduce((s, c) => s + c.v, 0);
    const fac = (() => {
      const v = g.resort?.dayIncome;
      if (typeof v === 'number') return Math.round(v);
      if (v && typeof v === 'object') return Math.round(Object.values(v).reduce((s, x) => s + (+x || 0), 0));
      return null;
    })();
    const log = g.feast?.dayLog;
    const events = Array.isArray(log) ? log.slice(0, 10).map((x) => ({
      name: String(x.name || x.id || 'Event'), icon: typeof x.icon === 'string' ? x.icon : null,
      ok: !(x.choice === 'expired' || (+x.rating || 0) < 0 || (+x.coins || 0) < 0),
      note: x.coins ? `${x.coins > 0 ? '+' : '−'}${fmt(Math.abs(x.coins))}` : '',
    })) : null;
    const list = g.staff?.list;
    const staff = Array.isArray(list) ? { n: list.length, hurt: list.filter((s) => s.hurt).length } : null;
    const names = (d.discoveries || []).map((id) => g.speciesById?.(id)?.name || id);
    const e = {
      d: report.day, wd: report.weekday, off: !!report.dayOff, blood: !!g.bearEvents?.moon?.isBloodDay?.(report.day),
      inc, exp, inTotal, outTotal, net: inTotal - outTotal, coins: Math.round(st.coins),
      r0: Math.round((d.ratingStart ?? st.rating) * 100) / 100, r1: Math.round(st.rating * 100) / 100,
      served: report.served || 0, happy: report.happy || 0, rampages: report.rampages || 0, stars: report.avgStars || 0,
      eaten: report.fishEaten || 0, born: report.fishBorn || 0, fish: report.fish || 0, cap: report.capacity || 0,
      grade: report.grade, comment: report.comment || '', golden: !!d.golden,
      reviews: (report.reviews || []).slice(0, 6).map((r) => ({ s: r.stars, t: r.text || '', n: r.name || '', dept: r.dept || '' })),
      stickers: (report.stickers || []).map((s) => ({ id: s.id, caption: s.caption })), disc: names,
      record: (report.stickers || []).some((s) => s.id === 'sticker_crown'),
      fac, events, staff,
    };
    const H = this.history;
    const i = H.findIndex((x) => x.d === e.d);
    if (i >= 0) H[i] = e; else H.push(e);
    H.sort((a, b) => a.d - b.d);
    while (H.length > CAP) H.shift();
    for (const x of H.slice(0, Math.max(0, H.length - DETAIL_DAYS))) { if (x.reviews?.length) x.reviews = []; if (x.events?.length > 3) x.events = x.events.slice(0, 3); }
    return e;
  }

  latest(day) { const H = this.history; return (day != null ? H.find((x) => x.d === day) : null) || H[H.length - 1] || null; }

  // ---------------------------------------------------------------- what Reynard says about it
  // -> { mood: 'awful'|'bad'|'meh'|'good'|'great'|'off', lines: [{ text, hi, kind }] }
  analyze(e) {
    const H = this.history, prev = H[H.indexOf(e) - 1] || null;
    const lines = [];
    const worst = (e.exp || []).slice().sort((a, b) => b.v - a.v)[0] || null;
    const best = (e.inc || []).slice().sort((a, b) => b.v - a.v)[0] || null;
    const dr = Math.round(((e.r1 ?? 0) - (e.r0 ?? 0)) * 10) / 10;
    const grade = e.grade || 'C';
    let mood;
    if (e.off) mood = 'off';
    else if (grade === 'F' || (e.net < -150 && dr <= -0.3) || e.rampages >= 3) mood = 'awful';
    else if (grade === 'D' || (e.net < 0 && e.outTotal > 60) || dr <= -0.25) mood = 'bad';
    else if (grade === 'C') mood = 'meh';
    else if (grade === 'B') mood = 'good';
    else mood = 'great';
    if (e.record && mood !== 'awful' && mood !== 'off') mood = 'great';
    const add = (text, hi = null, kind = 'talk') => lines.push({ text, hi, kind });
    const bad = mood === 'awful' || mood === 'bad';

    // opening
    if (mood === 'off') add(pick(['Sunday. No bears, no bills, no screaming.', 'A day off. My favourite kind of day. Cheap.']), 'money');
    else if (mood === 'awful') add(pick(['WHO approved THIS?!', 'Look at this. LOOK AT IT.', 'My books! My BEAUTIFUL books!']), 'net', 'scold');
    else if (mood === 'bad') add(pick(['WHO approved THIS?', 'Do you see this line? It goes DOWN.', 'Partner. We need to talk. About THIS.']), 'net', 'scold');
    else if (mood === 'meh') add(pick(['Hmm. Hmmmmm.', 'Mediocre. My least favourite word.', 'Average. I did not get into fish to be AVERAGE.']), 'net', 'meh');
    else if (mood === 'good') add(pick(['Ohhh, look at that curve.', 'Now THAT is a spreadsheet.', 'Mmm. Smell those numbers.']), 'net', 'praise');
    else add(e.record ? 'Record day! I am framing this screen.' : pick(['MWAHAHA! Look at it! LOOK AT IT!', 'I should give myself a raise. Again.', 'Exquisite. Like a fine trout.']), 'net', 'praise');

    // specifics, most damning (or most flattering) first
    const spec = [];
    if (e.blood) spec.push([9, `We survived the blood moon. Barely. ${e.rampages ? `${e.rampages} rampages, though.` : 'Not a scratch!'}`, 'bears']);
    if (bad || mood === 'meh' || mood === 'off') {
      if (worst && worst.v >= Math.max(60, e.inTotal * 0.35)) {
        const v = fmt(worst.v);
        const L = {
          builds: [`${v} coins on construction?! Are we building a PALACE?`, `Construction: minus ${v}. I said a FENCE, not a CASTLE.`],
          research: [`Research ate ${v} coins. I want results, not bubbling beakers.`],
          eggs: [`${v} coins of fish eggs. They had better hatch made of GOLD.`],
          digging: [`We spent ${v} digging holes. In the DIRT. On purpose.`],
          clearing: [`${v} coins to clear land. The trees were FREE, partner.`],
          shop: [`${v} on e-Buy. I saw the cart. I saw EVERYTHING.`], ebuy: [`${v} on e-Buy. I saw the cart. I saw EVERYTHING.`],
          wages: [`${v} in wages. Do beavers even NEED money?`], staff: [`${v} in wages. Do beavers even NEED money?`],
          rescue: [`${v} on rescues. Tell them to stop falling over.`],
        }[worst.k] || [`${worst.label}: minus ${v}. Who signs these cheques? ...Me. Ugh.`];
        spec.push([8, pick(L), `out:${worst.k}`]);
      }
      if (dr <= -0.2) spec.push([7, pick([`Rating down ${Math.abs(dr).toFixed(1)} stars. Do you know what that does to my beauty sleep?`, `${(e.r1 ?? 0).toFixed(1)} stars. The Bear Street Journal will EAT us alive.`]), 'rating']);
      if (e.rampages >= 2) spec.push([7.5, `${e.rampages} rampages. ${e.rampages}! I can still hear the screaming.`, 'bears']);
      else if (e.rampages === 1) spec.push([5, 'A bear went on a rampage. In MY pond. On MY watch.', 'bears']);
      if (!e.off && e.served === 0 && !e.blood) spec.push([8.5, 'Zero bears served. ZERO. Did we even open?', 'bears']);
      else if (e.served >= 4 && e.happy / e.served < 0.4) spec.push([6, `Only ${e.happy} of ${e.served} bears left happy. The rest left REVIEWS.`, 'bears']);
      if (e.eaten >= e.born + 6 && e.cap && e.fish < e.cap * 0.45) spec.push([6.5, `They ate ${e.eaten} fish and we hatched ${e.born}. That is not a business, that is a buffet.`, 'fish']);
      if (e.staff?.hurt) spec.push([5.5, `${e.staff.hurt} beaver${e.staff.hurt > 1 ? 's' : ''} hurt. The paperwork alone!`, 'extra']);
      const flop = (e.events || []).find((x) => x.ok === false);
      if (flop) spec.push([4.5, `And that "${flop.name}" business... we never speak of it again.`, 'extra']);
      if (prev && e.coins < prev.coins - 80) spec.push([4, `We went to bed with ${fmt(prev.coins)} coins yesterday. Now? ${fmt(e.coins)}.`, 'coins']);
      if (e.off && e.born > 0) spec.push([6, `Still, ${e.born} fry hatched. The pond keeps working. Unlike some.`, 'fish']);
      if (e.off && e.outTotal > 50) spec.push([7, `We still spent ${fmt(e.outTotal)}. On a SUNDAY.`, `out:${worst?.k || ''}`]);
    } else {
      if (best) {
        const v = fmt(best.v);
        const L = {
          bills: [`Fish dinners brought in ${v}. The bears ADORE me.`, `${v} in fish dinners. Every bite, a coin.`],
          tips: [`${v} in tips! Happy bears, heavy wallets.`], snacks: [`${v} from the snack bar. Berries: the gateway fish.`],
          facilities: [`The resort made ${v}. Bears in bathrobes. PROFITABLE bears in bathrobes.`], resort: [`The resort made ${v}. Bears in bathrobes. PROFITABLE bears in bathrobes.`],
          trophies: [`${v} in prizes. Trophies AND money. Both shiny.`],
        }[best.k] || [`${best.label}: plus ${v}. Lovely, lovely ${best.label.toLowerCase()}.`];
        spec.push([7, pick(L), `in:${best.k}`]);
      }
      if (dr >= 0.15) spec.push([6.5, `Rating up to ${(e.r1 ?? 0).toFixed(1)}. I am basically a celebrity chef now.`, 'rating']);
      if (e.served >= 5 && e.rampages === 0) spec.push([5.5, 'Not a single rampage. Civilised. Delicious. Lucrative.', 'bears']);
      if (e.happy >= 5) spec.push([5, `${e.happy} happy bears. That is ${e.happy} bears coming back with friends.`, 'bears']);
      if (e.fac > 0) spec.push([4.5, `The resort chipped in ${fmt(e.fac)}. Bathrobes were a GENIUS idea. Mine.`, 'extra']);
      if (prev && e.coins > prev.coins + 100) spec.push([4, `${fmt(e.coins)} coins in the vault. I can hear it jingling from here.`, 'coins']);
      if (e.golden) spec.push([6, 'A GOLDEN fish served! The critics will weep.', 'money']);
      // even good days get one jab if something leaked
      if (worst && worst.v >= e.inTotal * 0.5 && worst.v > 80) spec.push([3, `Still. ${worst.label}: ${fmt(worst.v)}. I noticed. I always notice.`, `out:${worst.k}`]);
    }
    spec.sort((a, b) => b[0] - a[0]);
    for (const [, text, hi] of spec.slice(0, 2)) add(text, hi, bad ? 'scold' : mood === 'meh' ? 'meh' : 'praise');

    // sign-off
    if (mood === 'awful') add(pick(['Go to bed. Think about what you did.', 'Tomorrow: more fish, less NONSENSE.']), null, 'scold');
    else if (mood === 'bad') add(pick(['Fix it tomorrow. Or else... more paperwork.', 'Tomorrow we do better. YOU do better.']), null, 'scold');
    else if (mood === 'meh') add(pick(['We can do better. Much better. Tomorrow.', 'Not a disaster. Not a triumph. Ugh.']), null, 'meh');
    else if (mood === 'great') add(pick(['Do that again tomorrow. Exactly that. Forever.', 'Keep this up and I am buying a second monocle.']), null, 'praise');
    else if (mood === 'good') add(pick(['Good. Now do it AGAIN.', 'Tomorrow: the same, but MORE.']), null, 'praise');
    return { mood, lines };
  }

  // ---------------------------------------------------------------- shared room (Bedtime owns it)
  get bed() { return (this.game.bedtime ||= new Bedtime(this.game)); }
  get room() { return this.bed.room; }
  get fox() { return this.bed.fox; }
  get rig() { return this.bed.rig; }

  showRoom() {
    const g = this.game, bed = this.bed;
    bed.preload();
    g.overrideScene = bed.scene;
    g.overrideRig = bed.rig;
    this.roomActive = true;
    bed.onFoxEvent = (n) => this.onFoxEvent(n);
    document.body.classList.add('lab-mode', 'home-mode', 'pc-room');
  }

  /** Bedtime.play() calls this when it takes the room over at bedtime (it drives it from here on). */
  releaseRoom() {
    this.handover = false;
    this.roomActive = false;
    if (this.bed) this.bed.onFoxEvent = null;
    document.body.classList.remove('lab-mode', 'home-mode', 'pc-room', 'pc-mode', 'lab-trans');
  }

  hideRoom() {
    const g = this.game;
    if (g.overrideScene === this.bed.scene) { g.overrideScene = null; g.overrideRig = null; }
    this.roomActive = false;
    if (this.bed) this.bed.onFoxEvent = null;
    document.body.classList.remove('lab-mode', 'home-mode', 'pc-room', 'pc-mode', 'lab-trans');
    try { g.renderer.setIris(0, 0, -1); } catch { /* ignore */ }
  }

  // the room as it should look right now (lamp at night, sun in the day)
  dressRoom(night) {
    const room = this.room, f = this.fox;
    room.setMood(night ? 'lamp' : 'morning', true);
    room.setSky(night ? 'night' : 'morning');
    room.setQuilt(0, true); room.setPajamasHung(true); room.setMonocle(false);
    room.office.setPC('off');
    room.office.ringAlarm(false);
    if (f) {
      f.setOutfit('default'); f.holdProp(null); f.hold(null); f.setAim(null); f.setExpression(null); f.stopTalking?.();
      f.root.visible = true;
    }
  }

  seatFox(facing = 'desk') {
    const f = this.fox, O = this.room.office;
    if (!f) return;
    f.root.position.copy(O.seat.position);
    const yaw = facing === 'desk' ? Math.PI : 0;
    f.root.rotation.y = yaw; O.chair.rotation.y = yaw;
    this.swivel = null;
    this.walk = null;
    this.seated = true;
  }

  // swivel the chair (with him in it) to face the desk or the room; resolves when done
  turnChair(to, dur = 0.55) {
    const f = this.fox, O = this.room.office;
    if (!f || !this.seated) return Promise.resolve();
    const goal = to === 'desk' ? Math.PI : 0;
    const from = f.root.rotation.y;
    if (Math.abs(from - goal) < 0.01) return Promise.resolve();
    this.sfx('bed_creak', 0.35, { pitch: 1.6 });
    return new Promise((res) => { this.swivel = { from, to: goal, t: 0, dur, res }; void O; });
  }

  // ---------------------------------------------------------------- per frame
  update(simDt, dt) {
    this.t += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    this.updateMarker(dt);
    if (this.iris) this.tickIris(dt);
    if (this.state === 'zoom' || this.state === 'irisin' || this.state === 'leaving') this.updateVisitIris(dt);
    if (!this.roomActive || this.bed.active) return;
    const g = this.game, f = this.fox, room = this.room;
    // swivel chair
    const sw = this.swivel;
    if (sw && f) {
      sw.t += dt;
      const k = clamp(sw.t / sw.dur, 0, 1), c = 1.7, e = 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2;
      const yaw = sw.from + (sw.to - sw.from) * e;
      f.root.rotation.y = yaw; room.office.chair.rotation.y = yaw;
      if (k >= 1) { this.swivel = null; sw.res(); }
    }
    // walking about the room (visits)
    if (this.walk && f) {
      const w = this.walk, p = f.root.position;
      const dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.04) {
        const sp = Math.min(d, 1.5 * dt);
        p.x += (dx / d) * sp; p.z += (dz / d) * sp;
        this.turnFox(Math.atan2(dx, dz), dt * 10);
        if (f.current !== 'walk') f.play('walk', { fade: 0.15 });
      } else {
        this.walk = null;
        if (f.current === 'walk') f.play('idle', { fade: 0.2 });
        w.done?.();
      }
    } else if (f && !this.seated && this.lookAt) this.turnFox(Math.atan2(this.lookAt.x - f.root.position.x, this.lookAt.z - f.root.position.z), dt * 5);
    // steam off the desk mug, the room, the fox, the camera
    room.update(dt, this.t);
    f?.update(dt);
    if (this.camK != null && this.camFrom && this.camTo) {
      this.camK = Math.min(1, this.camK + dt / (this.camDur || 0.8));
      const k = this.camK, e = k * k * (3 - 2 * k), a = this.camFrom, b = this.camTo, rig = this.rig;
      rig.target.lerpVectors(a.target, b.target, e); rig.goal.copy(rig.target);
      rig.wupp = rig.wuppGoal = a.wupp + (b.wupp - a.wupp) * e;
      rig.pitch = rig.pitchGoal = a.pitch + (b.pitch - a.pitch) * e;
      rig.yaw = rig.yawGoal = a.yaw + (b.yaw - a.yaw) * e;
      if (k >= 1) this.camK = null;
    }
    if (this.mode === 'visit' && this.state === 'inside' && !this.pc && this.camK == null && f) {
      // gentle drift following Reynard a little
      const base = this.viewOf('camRoom');
      this.rig.goal.set(base.target.x + (f.root.position.x - 1) * 0.06, base.target.y, base.target.z);
    }
    this.rig.update(dt, g.renderer);
    this.updateMarkerPC(dt);
  }

  turnFox(yaw, k) {
    const r = this.fox.root;
    let d = yaw - r.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    r.rotation.y += d * Math.min(1, k);
  }

  wait(sec) {
    const tk = this.tk;
    return new Promise((res) => { this.timers.push({ t: sec, fn: res }); if (tk) tk.waits.push(res); });
  }
  later(sec, fn) { this.timers.push({ t: sec, fn }); }

  sfx(name, volume = 0.4, o = {}) { try { this.game.audio.play(name, { volume, ...o }); } catch { /* optional */ } }

  // ---------------------------------------------------------------- camera helpers
  viewOf(anchorName) {
    const a = this.room.anchors[anchorName] || this.room.anchors.camRoom;
    const r = this.game.renderer;
    const wupp = Math.max(a.fit.w / Math.max(1, r.lowW), a.fit.h / Math.max(1, r.lowH));
    const target = a.target.clone();
    // never show past the room's right edge (the office is the last thing on that side)
    const halfW = (wupp * r.lowW) / 2;
    const maxX = 4.36 - halfW;
    if (target.x > maxX && halfW < 3.4) target.x = Math.max(maxX, -2.2 + halfW);
    return { target, wupp, pitch: a.pitch, yaw: a.yaw || 0 };
  }

  setView(v, dur = 0) {
    const rig = this.rig;
    rig.minWupp = 0.0003; rig.maxWupp = 1; rig.freeBounds = true;
    if (!dur) {
      rig.goal.copy(v.target); rig.target.copy(v.target);
      rig.wupp = rig.wuppGoal = v.wupp; rig.pitch = rig.pitchGoal = v.pitch; rig.yaw = rig.yawGoal = v.yaw;
      this.camK = null;
      return;
    }
    this.camFrom = { target: rig.target.clone(), wupp: rig.wupp, pitch: rig.pitch, yaw: rig.yaw };
    this.camTo = v; this.camDur = dur; this.camK = 0;
  }

  // frame Reynard (seated) inside a screen rect (CSS px), e.g. the space next to the PC monitor
  viewForRect(rect) {
    const g = this.game, r = g.renderer, base = this.viewOf('camOffice');
    const W = innerWidth, H = innerHeight;
    const k = Math.min((rect.h * 0.56) / 1.75, (rect.w * 0.78) / 1.25); // CSS px per world unit (room above his head for the speech bubble)
    const wpc = 1 / Math.max(1, k);
    const wupp = (wpc * r.pixelScale) / (r.dpr || 1);
    const yaw = base.yaw, pitch = base.pitch;
    const dir = _v.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const U = new THREE.Vector3().crossVectors(dir, R).normalize();
    const P = this.room.office.seat.position.clone().add(_v2.set(0, 0.8, 0.1));
    const ox = rect.x + rect.w / 2 - W / 2, oy = rect.y + rect.h * 0.64 - H / 2;
    const target = P.addScaledVector(R, -ox * wpc).addScaledVector(U, oy * wpc);
    return { target, wupp, pitch, yaw };
  }

  // ---------------------------------------------------------------- fox events (Bedtime forwards them while we drive)
  onFoxEvent(name) {
    const room = this.room;
    if (name === 'slam') {
      room.office.joltDesk(1);
      this.pc?.glitch(1);
      this.rig.shake = Math.max(this.rig.shake, 0.55);
      this.sfx('ev_slam', 0.6);
      room.office.setPC('alert');
      this.later(0.9, () => { if (room.office.screen.mode === 'alert') room.office.setPC('on'); });
    } else if (name === 'type' && Math.random() < 0.6) this.sfx('ev_key', 0.12, { pitch: 0.8 + Math.random() * 0.5 });
    else if (name === 'enter') this.sfx('ev_key', 0.2, { pitch: 0.6 });
    else if (name === 'mwaha') this.sfx('fox_laugh', 0.4);
  }

  // ---------------------------------------------------------------- END OF DAY
  async evening(report, done) {
    const g = this.game;
    if (this.busy) { done?.(); return; }
    this.busy = true;
    this.mode = 'evening';
    const entry = this.latest(report?.day) || this.record(report);
    const wasPaused = g.state.paused;
    let entered = false;
    try {
      await this.walkHome();
      await this.irisTo(() => { this.enterEvening(); entered = true; });
      await this.session('evening', entry);
      this.handover = true; // Game.startBedtime -> straight to the night, Bedtime starts at the desk
    } catch (e) {
      console.warn('[homePC] evening', e);
      this.cleanupEvening(entered);
    }
    this.busy = false;
    this.mode = null;
    g.state.paused = wasPaused; // Bedtime pauses / locks again for its own cutscene and restores these
    g.inputLocked = false;
    done?.();
    // if nothing took the room over (no bedtime cutscene), give the world back
    this.later(0.5, () => {
      if (this.handover && !this.bed.active && g.state.phase !== 'bedtime' && g.state.phase !== 'night') { this.handover = false; this.hideRoom(); }
    });
  }

  cleanupEvening(entered) {
    const g = this.game;
    this.pc?.destroy(); this.pc = null;
    this.restoreWorldCam();
    document.body.classList.remove('cine', 'pc-walk', 'pc-mode');
    this.skipBtn?.remove(); this.skipBtn = null;
    if (entered) this.hideRoom();
    g.inputLocked = false;
    g.fox.bed = null; g.fox.rig.root.visible = true;
  }

  // a short shot of Reynard walking into his hut (world camera)
  async walkHome() {
    const g = this.game, fox = g.fox, rig = g.rig;
    this.savedCam = { x: rig.goal.x, z: rig.goal.z, wupp: rig.wuppGoal, yaw: rig.yawGoal, pitch: rig.pitchGoal ?? rig.pitch, free: rig.freeBounds, follow: rig.follow, paused: g.state.paused };
    g.inputLocked = true;
    document.body.classList.add('cine', 'pc-walk');
    this.skippable(true);
    const door = { x: HUT.x + 1.45, z: HUT.z + 2.2 };
    fox.errands = [];
    fox.bed = { stage: 'pc', t: 0 }; // keeps him from wandering off; updateBed ignores this stage
    fox.mood = 'idle'; fox.moodT = 0;
    fox.rig.root.visible = true;
    // cut to the porch: he comes up the path
    fox.x = door.x + 1.2; fox.z = door.z + 3.6; fox.heading = -Math.PI / 2;
    fox.target = { x: door.x, z: door.z + 0.45 };
    rig.follow = null; rig.freeBounds = true;
    // low and close: under the porch roof, the door in view
    rig.goal.set(door.x + 0.3, 0.7, door.z + 1.4); rig.target.copy(rig.goal);
    rig.wupp = rig.wuppGoal = 0.016; rig.yaw = rig.yawGoal = 0.3; rig.pitch = rig.pitchGoal = 0.36;
    this.sfx('footsteps', 0.25);
    const t0 = this.t;
    while (fox.target && this.t - t0 < 2.6 && !this.skipped) await this.wait(0.05);
    if (!this.skipped) {
      fox.heading = -Math.PI / 2;
      this.doorFx(true);
      this.sfx('gate', 0.35);
      await this.wait(0.25);
      fox.target = { x: door.x, z: door.z - 0.2 };
      await this.wait(0.35);
    }
    fox.target = null;
    fox.rig.root.visible = false;
    this.doorFx(false);
    if (!this.skipped) { this.sfx('drop', 0.3, { pitch: 0.7 }); await this.wait(0.3); }
  }

  // the hut door swings open: a warm-lit doorway on the hut front
  doorFx(on) {
    const g = this.game;
    if (!this.doorway) {
      const c = document.createElement('canvas');
      c.width = 8; c.height = 14;
      const x = c.getContext('2d');
      for (let y = 0; y < 14; y++) { x.fillStyle = y < 3 ? '#3a2412' : y < 9 ? '#ffb85a' : '#ffd890'; x.fillRect(0, y, 8, 1); }
      x.fillStyle = '#2a160a'; x.fillRect(0, 0, 1, 14); x.fillRect(7, 0, 1, 14); x.fillRect(0, 0, 8, 1);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.82), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(HUT.x + 1.45, 0.62, HUT.z + 2.115);
      this.doorway = m;
    }
    if (on) g.scene.add(this.doorway); else this.doorway.removeFromParent();
  }

  restoreWorldCam() {
    const g = this.game, rig = g.rig, s = this.savedCam;
    if (!s) return;
    rig.freeBounds = s.free; rig.follow = s.follow;
    rig.goal.set(s.x, 0, s.z); rig.clampGoal?.();
    rig.wuppGoal = s.wupp; rig.yawGoal = s.yaw;
    if (s.pitch != null) rig.pitch = rig.pitchGoal = s.pitch;
    this.savedCam = null;
  }

  skippable(on) {
    this.skipped = false;
    this.skipBtn?.remove(); this.skipBtn = null;
    if (!on) return;
    const b = document.createElement('button');
    b.className = 'bt-skip';
    b.textContent = 'SKIP ▸▸';
    b.onclick = (e) => { e.stopPropagation(); this.skipped = true; b.remove(); };
    document.body.appendChild(b);
    this.skipBtn = b;
  }

  // chunky iris close on screen centre -> mid() -> iris open
  irisTo(mid, { close = 0.55, open = 0.6 } = {}) {
    return new Promise((res, rej) => {
      this.iris = { k: 0, phase: 'close', close, open, mid, res, rej };
      this.sfx('iris', 0.35);
    });
  }

  // evening: close on the hut door in the world, switch to the room, open on the room
  tickIris(dt) {
    const I = this.iris, r = this.game.renderer;
    const R = Math.hypot(innerWidth, innerHeight);
    I.k += dt;
    if (I.phase === 'close') {
      const k = Math.min(1, I.k / I.close), d = this.doorPos();
      const p = this.game.rig.worldToScreen(_v.set(d.x, 0.6, d.z), r);
      r.setIris(p.x, p.y, R * (1 - k) * (1 - k) + 1);
      if (k >= 1) { try { I.mid?.(); } catch (e) { I.err = e; } I.phase = 'open'; I.k = 0; }
    } else {
      const k = Math.min(1, I.k / I.open);
      r.setIris(innerWidth / 2, innerHeight / 2, R * k * k);
      if (k >= 1) { r.setIris(0, 0, -1); this.iris = null; if (I.err) I.rej(I.err); else I.res(); }
    }
  }

  // ---------------------------------------------------------------- the PC session
  enterEvening() {
    const g = this.game;
    this.skipBtn?.remove(); this.skipBtn = null;
    document.body.classList.remove('cine', 'pc-walk');
    this.showRoom();
    this.dressRoom(true);
    this.seatFox('desk');
    this.fox.play('sit_type', { fade: 0 });
    this.setView(this.viewOf('camOffice'));
    this.restoreWorldCam();
    g.state.paused = true;
  }

  async session(mode, entry) {
    const g = this.game, room = this.room, f = this.fox, O = room.office;
    this.tk = { cancelled: false, waits: [] };
    const tk = this.tk;
    O.setPC('boot');
    this.sfx('ev_boot', 0.35);
    await this.wait(mode === 'evening' ? 0.9 : 0.6);
    O.setPC('on');
    const H = this.history;
    const index = entry ? Math.max(0, H.indexOf(entry)) : H.length - 1;
    let resolveEnd;
    const ended = new Promise((res) => { resolveEnd = res; });
    const root = document.getElementById('ui') || document.body;
    this.pc = openHomePC(root, {
      mode, history: H, index,
      sfx: (n, o) => this.sfx(n, (o && o.volume) || 0.35, o || {}),
      onBed: () => resolveEnd('bed'),
      onClose: () => resolveEnd('close'),
    });
    document.body.classList.add('pc-mode');
    this.setView(this.viewForRect(this.pc.freeRect()), 0.8);
    this._onResize = () => { if (this.pc && this.camK == null) this.setView(this.viewForRect(this.pc.freeRect()), 0.3); };
    addEventListener('resize', this._onResize);
    if (mode === 'evening' && entry) this.react(entry, tk).catch((e) => { if (!tk.cancelled) console.warn('[homePC] react', e); });
    else if (mode === 'visit') this.browseChat(tk);
    const how = await ended;
    tk.cancelled = true;
    for (const r of tk.waits) r();
    try { g.ui?.bubbles?.clear?.((b) => b.key === 'homepc'); } catch { /* ignore */ }
    f?.stopTalking?.();
    removeEventListener('resize', this._onResize);
    const pc = this.pc; this.pc = null;
    document.body.classList.remove('pc-mode');
    await pc?.close();
    O.setPC('off');
    return how;
  }

  say(text, o = {}) {
    const f = this.fox;
    if (!f || !text) return null;
    const dur = Math.min(5.2, 1.6 + text.length * 0.055);
    f.talk?.(text);
    return this.game.say({ getWorldPos: (v) => { f.headTop(v); v.y -= 0.02; return v; } }, text, { voice: 'fox', size: 'm', key: 'homepc', dur, ...o });
  }

  // Reynard reads the screen and lets you have it (or basks in it)
  async react(entry, tk) {
    const f = this.fox, room = this.room;
    if (!f) return;
    const { mood, lines } = this.analyze(entry);
    const bad = mood === 'awful' || mood === 'bad';
    await this.wait(1.0);
    if (tk.cancelled) return;
    // first, a beat facing the screen
    if (bad) {
      f.play('sit_fume', { fade: 0.25 });
      this.pc?.highlight(lines[0]?.hi || 'net', 1.6);
      await this.wait(0.7);
      if (tk.cancelled) return;
      f.play('sit_slam', { fade: 0.1, restart: true });
      await this.wait(1.35);
    } else if (mood === 'great' || mood === 'good') {
      f.play('sit_laugh', { fade: 0.2, restart: true });
      this.pc?.highlight(lines[0]?.hi || 'net', 1.8);
      await this.wait(1.3);
    } else {
      f.play('sit', { fade: 0.25 });
      await this.wait(0.6);
    }
    if (tk.cancelled) return;
    // swivel round to face you
    f.play('sit', { fade: 0.2 });
    await this.turnChair('room', bad ? 0.42 : 0.7);
    if (tk.cancelled) return;
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (tk.cancelled) return;
      const anim = L.kind === 'scold' ? 'sit_rant' : L.kind === 'praise' ? (i % 2 ? 'sit_steeple' : 'sit_scheme') : 'sit_talk';
      f.play(anim, { fade: 0.2 });
      const expr = L.kind === 'scold' ? (mood === 'awful' && i === 0 ? null : null) : L.kind === 'praise' ? (i === 0 ? 'greedy' : 'smug') : (mood === 'off' ? 'proud' : 'tsk');
      f.setExpression(expr, { hold: 3 });
      if (L.hi) this.pc?.highlight(L.hi, 2.6);
      const bm = L.kind === 'scold' ? (i === 0 ? 'shout' : 'angry') : L.kind === 'praise' ? 'happy' : 'normal';
      this.say(L.text, { mood: bm });
      await this.wait(Math.min(5, 1.7 + L.text.length * 0.05));
    }
    if (tk.cancelled) return;
    f.setExpression(null);
    f.play(bad ? 'sit_fume' : 'sit', { fade: 0.3 });
    if (bad) await this.turnChair('desk', 0.6);
  }

  // browse mode: he swivels round now and then with a remark about what you're looking at
  async browseChat(tk) {
    const f = this.fox;
    await this.wait(1.2);
    if (tk.cancelled || !f) return;
    f.play('sit_type', { fade: 0.25 });
    const e = this.latest();
    if (!e) { await this.turnChair('room'); this.say('No books yet? Finish a day first, partner.'); f.play('sit_talk', { fade: 0.2 }); return; }
    const { lines } = this.analyze(e);
    await this.wait(2.5);
    if (tk.cancelled) return;
    await this.turnChair('room');
    f.play('sit_talk', { fade: 0.2 });
    this.say(lines[1]?.text || lines[0]?.text || 'The numbers never lie. I do, but they never do.');
    await this.wait(3.4);
    if (tk.cancelled) return;
    f.play('sit', { fade: 0.25 });
    await this.turnChair('desk');
    if (!tk.cancelled) f.play('sit_type', { fade: 0.25 });
  }

  // ---------------------------------------------------------------- ANYTIME: Reynard's door
  doorPos() { return { x: HUT.x + 1.45, y: 0, z: HUT.z + 2.25 }; }

  blocked() {
    const g = this.game;
    if (this.roomActive || this.busy || this.state !== 'off') return 'busy';
    if (g.homes?.active || g.lab?.active || g.classroom?.active || g.bedtime?.active || g.cutscene?.active || g.cine?.active || g.tutorial?.active || g.npcScenes?.busy || g.titleMode) return 'busy';
    if (g.inputLocked || g.zones?.busy || g.pipVisit?.view || g.workshop?.view || g.feast?.active) return 'busy';
    if (g.bearEvents?.boss?.active || g.bearEvents?.moon?.siege) return 'danger';
    const ph = g.state.phase;
    if (ph !== 'day' && ph !== 'morning') return 'closed';
    return null;
  }

  markerShown() {
    const g = this.game;
    if (!g.started || g.titleMode || g.overrideScene || g.cine?.active || g.tutorial?.active) return false;
    if (!g.state.tutorialDone && !g.skipTutorial && (g.state.tutorial || 0) < 99 && !this.history.length) return false;
    const ph = g.state.phase;
    return (ph === 'day' || ph === 'morning') && g.rig.wupp < 0.05;
  }

  updateMarker(dt) {
    const g = this.game;
    if (!g.scene || !g.started) return;
    if (!this.marker) {
      try { this.marker = makeDoorMarker(); } catch { this.marker = null; return; }
      this.marker.visible = false;
      g.scene.add(this.marker);
    }
    const d = this.doorPos();
    const near = this.markerShown() && Math.hypot(d.x - g.rig.target.x, d.z - g.rig.target.z) < 9;
    this.marker.visible = near;
    if (near) { this.mT = (this.mT || 0) + dt; this.marker.position.set(d.x, 1.75 + Math.sin(this.mT * 3) * 0.08, d.z + 0.1); }
  }

  /** world tap (HomeMode.tapDoor delegates here first): Reynard's front door -> his room */
  tapDoor(sx, sy) {
    const g = this.game;
    if (!this.marker?.visible) return false;
    const d = this.doorPos();
    let bd = Infinity;
    for (const y of [0.35, 0.8, 1.75]) {
      const p = g.rig.worldToScreen(_v.set(d.x, d.y + y, d.z), g.renderer);
      bd = Math.min(bd, (p.x - sx) ** 2 + (p.y - sy) ** 2);
    }
    if (bd > 34 * 34) return false;
    return this.enterHouse();
  }

  enterHouse() {
    const g = this.game;
    const why = this.blocked();
    if (why) {
      if (why === 'closed') g.ui?.toast?.('Reynard is busy. Visit in the daytime!');
      else if (why === 'danger') g.ui?.toast?.('Not now. Bears!');
      return false;
    }
    this.mode = 'visit';
    this.state = 'zoom';
    this.vt = 0;
    const rig = g.rig;
    this.savedCam = { x: rig.goal.x, z: rig.goal.z, wupp: rig.wuppGoal, yaw: rig.yawGoal, free: rig.freeBounds, follow: rig.follow };
    this.wasPaused = g.state.paused;
    g.state.paused = true;
    g.inputLocked = true;
    g.ui?.closePanel?.();
    g.setTool?.({ kind: 'feed' });
    const d = this.doorPos();
    rig.follow = null; rig.freeBounds = true;
    rig.goal.set(d.x, 0.5, d.z); rig.wuppGoal = 0.012;
    this.sfx('whoosh', 0.45);
    document.body.classList.add('lab-trans');
    try { g.ui?.bubbles?.clear?.((b) => b.key === 'notify'); } catch { /* ignore */ }
    this.doorFx(true);
    return true;
  }

  leaveHouse() {
    if (this.mode !== 'visit' || this.state !== 'inside' || this.pc) return;
    this.sfx('iris', 0.4);
    this.state = 'leaving';
    this.vt = 0;
  }

  updateVisitIris(dt) {
    const g = this.game, r = g.renderer;
    this.vt += dt;
    const R = Math.hypot(innerWidth, innerHeight);
    if (this.state === 'zoom') {
      const k = Math.min(1, this.vt / 0.9), d = this.doorPos();
      const p = g.rig.worldToScreen(_v.set(d.x, 0.6, d.z), r);
      r.setIris(p.x, p.y, R * (1 - k * k) + 1);
      if (k >= 1) {
        this.doorFx(false);
        try { this.enterVisit(); } catch (e) { console.warn('[homePC] room', e); this.state = 'leaving'; this.vt = 1; this.finishVisit(); return; }
        this.state = 'irisin'; this.vt = 0;
      }
    } else if (this.state === 'irisin') {
      const k = Math.min(1, this.vt / 0.7);
      r.setIris(innerWidth / 2, innerHeight / 2, R * k * k);
      if (k >= 1) { r.setIris(0, 0, -1); this.state = 'inside'; document.body.classList.remove('lab-trans'); }
    } else if (this.state === 'leaving') {
      const k = Math.min(1, this.vt / 0.8);
      r.setIris(innerWidth / 2, innerHeight / 2, R * (1 - k) * (1 - k) + 1);
      if (k >= 1) this.finishVisit();
    }
  }

  enterVisit() {
    const g = this.game;
    const night = g.state.hour >= 18.5 || g.state.hour < 6.5;
    this.showRoom();
    this.dressRoom(night);
    this.seated = false;
    const f = this.fox, A = this.room.anchors;
    if (f) {
      f.root.position.set(A.door.x, 0, A.door.z);
      f.root.rotation.y = -Math.PI / 2;
      f.play('walk', { fade: 0 });
      this.walk = { x: 1.95, z: 0.35, done: () => { this.lookAt = new THREE.Vector3(1.95, 0, 3); if (Math.random() < 0.7) this.say(pick(FOX_LINES.enter), { size: 's' }); } };
      this.room.office.chair.rotation.y = Math.PI;
    }
    this.setView(this.viewOf('camRoom'));
    g.audio.setMusic?.(night ? 'sleep' : 'morning');
    this.buildVisitUI();
    this.idleT = 14;
  }

  finishVisit() {
    const g = this.game;
    this.removeVisitUI();
    this.hideRoom();
    const s = this.savedCam, rig = g.rig;
    if (s) { rig.freeBounds = s.free; rig.follow = s.follow; rig.goal.set(s.x, 0, s.z); rig.clampGoal?.(); rig.wuppGoal = s.wupp; rig.yawGoal = s.yaw; }
    this.savedCam = null;
    g.state.paused = this.wasPaused ?? false;
    g.inputLocked = false;
    g.audio.setMusic?.(g.state.phase === 'rush' ? 'feast' : 'day');
    this.state = 'off';
    this.mode = null;
    this.walk = null; this.seated = false;
    document.body.classList.remove('lab-trans');
    g.save?.();
  }

  buildVisitUI() {
    const g = this.game;
    const root = document.getElementById('ui') || document.body;
    const el = document.createElement('div');
    el.className = 'labui homeui pcroom-ui';
    el.innerHTML = `<div class="lab-top"><span data-h="back"></span><div class="home-name">Reynard's Den</div></div><div class="home-tip hidden" data-h="tip"></div>`;
    root.appendChild(el);
    const back = g.ui?.arrowButton?.('left') || Object.assign(document.createElement('button'), { textContent: '<', className: 'btn small' });
    back.dataset.a = 'exit';
    el.querySelector('[data-h="back"]')?.replaceWith(back);
    el.addEventListener('click', (e) => { if (e.target.closest('[data-a="exit"]')) { this.sfx('click', 0.35); this.leaveHouse(); } });
    this.vui = el;
    const cv = g.renderer?.domElement || document.querySelector('canvas');
    this.canvas = cv;
    this._onMove = (e) => this.onMove(e);
    cv?.addEventListener('pointermove', this._onMove);
    this._onKey = (e) => { if (e.key === 'Escape' && this.state === 'inside' && !this.pc) { e.preventDefault(); this.leaveHouse(); } };
    addEventListener('keydown', this._onKey);
  }

  removeVisitUI() {
    this.canvas?.removeEventListener('pointermove', this._onMove);
    if (this.canvas) this.canvas.style.cursor = '';
    removeEventListener('keydown', this._onKey);
    this.vui?.remove(); this.vui = null;
    this.pcMark?.remove(); this.pcMark = null;
  }

  tip(text, x, y) {
    const t = this.vui?.querySelector('[data-h="tip"]');
    if (!t) return;
    if (!text) { t.classList.add('hidden'); return; }
    t.textContent = text;
    t.style.left = `${x}px`; t.style.top = `${y}px`;
    t.classList.remove('hidden');
  }

  // a bouncing pixel hand over the PC until you've used it once
  updateMarkerPC() {
    if (this.mode !== 'visit' || this.state !== 'inside' || this.pc) { if (this.pcMark) this.pcMark.style.display = 'none'; return; }
    if (!this.pcMark) {
      const m = document.createElement('div');
      m.className = 'pcroom-mark';
      m.textContent = '▼';
      this.vui?.appendChild(m);
      this.pcMark = m;
    }
    const O = this.room.office;
    const p = this.rig.worldToScreen(_v.set(O.pc.position.x, O.pc.position.y + 0.62, O.pc.position.z), this.game.renderer);
    this.pcMark.style.display = '';
    this.pcMark.style.left = `${Math.round(p.x)}px`; this.pcMark.style.top = `${Math.round(p.y)}px`;
  }

  props() {
    const O = this.room.office, A = this.room.anchors;
    const box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    if (!this._props) {
      this._props = [
        { id: 'pc', label: 'Computer', box: box(2.5, 0.75, -1.62, 3.25, 1.35, -1.05) },
        { id: 'chair', label: 'Computer', box: box(2.8, 0, -1.05, 3.45, 1.15, -0.4) },
        { id: 'alarm', label: 'Alarm clock', box: box(1.28, 0.5, -1.45, 1.55, 0.95, -1.15) },
        { id: 'piggy', label: 'Piggy bank', box: box(3.45, 0.78, -1.45, 3.78, 1.05, -1.15) },
        { id: 'chart', label: 'Profit chart', box: box(2.95, 1.1, -1.65, 3.75, 1.7, -1.55) },
        { id: 'cabinet', label: 'Filing cabinet', box: box(3.88, 0, -1.62, 4.3, 1.1, -1.18) },
        { id: 'bed', label: 'Bed', box: box(0.25, 0, -1.62, 1.3, 1.0, -0.05) },
        { id: 'window', label: 'Window', box: box(-0.62, 0.92, -1.66, 0.25, 1.8, -1.5) },
      ];
    }
    void O; void A;
    return this._props;
  }

  pickAt(sx, sy) {
    const ray = this.rig.screenRay(sx, sy, this.game.renderer, this._ray);
    let best = null, bd = Infinity;
    const hit = new THREE.Vector3();
    for (const p of this.props()) {
      if (ray.intersectBox(p.box, hit)) { const d = hit.distanceTo(ray.origin); if (d < bd) { bd = d; best = p; } }
    }
    return best;
  }

  local(e) {
    const r = (this.canvas || this.game.renderer.domElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onMove(e) {
    if (this.mode !== 'visit' || this.state !== 'inside' || this.pc || e.pointerType === 'touch') { this.tip(null); return; }
    const q = this.local(e);
    const p = this.pickAt(q.x, q.y);
    if (p?.id !== this.hoverId) { this.hoverId = p?.id; if (p) this.sfx('tick', 0.12); }
    if (this.canvas) this.canvas.style.cursor = p ? 'pointer' : '';
    this.tip(p ? p.label : null, q.x + 14, q.y - 30);
  }

  /** Input.js: every canvas press while the room is up comes here */
  onDown(e) {
    if (!this.roomActive) return false;
    this.game.ui?.advanceBubble?.();
    if (this.mode !== 'visit' || this.state !== 'inside' || this.pc || this.sitting) return true;
    const q = this.local(e);
    const p = this.pickAt(q.x, q.y);
    if (p) { this.use(p); return true; }
    const ray = this.rig.screenRay(q.x, q.y, this.game.renderer, this._ray);
    const hit = ray.intersectPlane(this._plane, _v);
    if (hit && this.fox && !this.seated) this.walk = { x: clamp(hit.x, -1.9, 4.1), z: clamp(hit.z, -0.7, 1.0) };
    return true;
  }

  use(p) {
    const f = this.fox;
    this.sfx('click', 0.3);
    this.tip(null);
    if (p.id === 'pc' || p.id === 'chair') { this.sitAndBrowse(); return; }
    const c = p.box.getCenter(new THREE.Vector3());
    this.lookAt = c;
    const lines = FOX_LINES[p.id];
    if (p.id === 'alarm') {
      this.room.office.ringAlarm(true); this.sfx('alarm', 0.35);
      this.later(0.9, () => this.room.office.ringAlarm(false));
      f?.setExpression('alarmed', { hold: 1.2 });
    } else if (p.id === 'piggy') { this.sfx('coins', 0.4); this.room.office.joltDesk(0.35); }
    if (!this.seated && f) this.walk = { x: clamp(c.x + (c.x > 1.5 ? -0.5 : 0.45), -1.9, 4.0), z: clamp(c.z + 0.75, -0.6, 0.9), done: () => { if (lines) this.say(pick(lines), { size: 's' }); } };
    else if (lines) this.say(pick(lines), { size: 's' });
  }

  // walk to the chair, sit, swivel to the desk, the PC comes on (browse mode)
  async sitAndBrowse() {
    if (this.sitting) return;
    this.sitting = true;
    const f = this.fox, O = this.room.office;
    try {
      if (!this.seated && f) {
        await new Promise((res) => { this.walk = { x: O.seat.position.x - 0.45, z: O.seat.position.z + 0.45, done: res }; });
        await new Promise((res) => { this.walk = { x: O.seat.position.x, z: O.seat.position.z, done: res }; });
        O.chair.rotation.y = 0;
        this.seatFox('room');
        f.play('sit', { fade: 0.2 });
        this.sfx('bed_creak', 0.3, { pitch: 1.4 });
        await this.turnChair('desk', 0.6);
      }
      f?.play('sit_type', { fade: 0.2 });
      this.setView(this.viewOf('camOffice'), 0.6);
      await this.session('visit', this.latest());
      // done browsing: swivel back round, stay seated, the room view returns
      f?.play('sit', { fade: 0.25 });
      await this.turnChair('room', 0.5);
      this.setView(this.viewOf('camRoom'), 0.7);
      if (f) { this.seated = false; f.play('walk', { fade: 0.2 }); this.walk = { x: O.seat.position.x - 0.3, z: O.seat.position.z + 0.7 }; this.later(0.2, () => { O.chair.rotation.y = Math.PI; }); }
    } catch (e) { console.warn('[homePC] browse', e); }
    this.sitting = false;
  }
}
