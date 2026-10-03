// [v18 bear events] Orchestrates the special bear events and the defenses:
//   BossFight  (src/game/BossFight.js)   a SUPER HARD boss every 5th day
//   BloodMoon  (src/game/BloodMoon.js)   the weekly blood moon siege (every 7th day)
//   Defense    (src/game/Defense.js)     defense builds vs. hostile bears
//   EventsHud  (src/ui/EventsHud.js)     countdown pill, boss / siege bars, cards
//
// Hooks (all small, marked `[v18 bear events]`):
//   Game:        constructor (this.bearEvents), startDay -> onDayStart, startRush -> startRush,
//                update -> update, tapStructure -> tapStructure (repairs), morningQuote
//   BearSystem:  planWave (boss slot), spawnBear -> onSpawn, decide -> decide,
//                step -> preStep, moveToward (b.slowK), render -> poseFor, show -> onBossShown,
//                smash -> onSmash, scareOff (blood bears can't be scared), finishReview (noReview)
//   UI:          day card subtitle -> dayCardSub
// New state (saved with game.state): bossTrophies [{type, name, day, k}], bossWins,
// bossLosses, bloodMoons, bloodCalmed. Honey-trap servings / net re-arm timers live
// in the structure's saved `stock`.
import { BossFight } from './BossFight.js';
import { BloodMoon } from './BloodMoon.js';
import { Defense } from './Defense.js';
import { EventsHud } from '../ui/EventsHud.js';

export class BearEvents {
  constructor(game) {
    this.game = game;
    this.boss = new BossFight(game, this);
    this.moon = new BloodMoon(game, this);
    this.defense = new Defense(game, this);
    this.hud = null;
    this.warnedDay = 0;
  }

  // ------------------------------------------------------------ Game hooks
  onDayStart(day) {
    const game = this.game;
    this.defense.morningPatch();
    if (this.warnedDay === day || !game.started) return;
    this.warnedDay = day;
    const say = (text, expr, delay = 2600) => setTimeout(() => { if (game.state.day === day) game.ui?.foxSay?.(text, expr); }, delay);
    if (this.moon.isBloodDay(day)) {
      say('BLOOD MOON TONIGHT! At 5 PM the bears go feral: they ignore food and smash everything. Build defenses!', 'shocked');
      game.audio.play('bm_toll', { volume: 0.5 });
    } else if (this.moon.daysUntil(day) === 1) {
      say('Blood moon TOMORROW night! Barricades, traps, towers... get the Defense research going!', 'worried');
      game.notify?.('Blood moon tomorrow!', 'warn', { dur: 3 });
    }
    const bp = this.boss.isBossDay(day) ? this.boss.planFor(day) : this.boss.daysUntil(day) === 1 ? this.boss.planFor(day + 1) : null;
    if (bp && !this.moon.isBloodDay(day)) {
      if (bp.day === day) say(`BOSS DAY! ${bp.name} comes at 5 PM. Stock the snack bowls with ${bp.favName} and fill the pond with fish!`, 'shocked', 5200);
      else { say(`Tomorrow a BOSS comes: ${bp.name}. It loves ${bp.favName}. Prepare!`, 'worried', 5200); game.notify?.(`BOSS tomorrow: ${bp.name}!`, 'warn', { dur: 3 }); }
    }
  }

  // true = the blood moon replaces the normal 5 PM rush
  startRush() { return this.moon.start(); }

  update(simDt, realDt) {
    if (!this.hud && document.getElementById('ui') && this.game.started) {
      try { this.hud = new EventsHud(this.game, this); } catch (e) { console.warn('EventsHud', e); this.hud = {}; }
    }
    const phase = this.game.state.phase;
    const dt = phase === 'evening' ? realDt : simDt;
    this.defense.update(dt);
    this.boss.update(dt, realDt);
    this.moon.update(dt, realDt);
    this.hud?.update?.(realDt);
  }

  // tapping a damaged defense repairs it
  tapStructure(s) {
    if (!s.def.defense || !s.built || !this.defense.needsRepair(s)) return false;
    const c = this.defense.repairCost(s);
    if (!this.game.canAfford(c)) { this.game.notify(`Repairing the ${s.def.name} costs ${c} coins.`, 'no'); return true; }
    this.defense.repair(s);
    this.game.notify(`${s.def.name} repaired (${c} coins).`, 'info', { dur: 1.8 });
    return true;
  }

  // UI day card subtitle
  dayCardSub() {
    const day = this.game.state.day;
    if (this.moon.isBloodDay(day)) return 'BLOOD MOON TONIGHT';
    if (this.boss.isBossDay(day)) return `BOSS: ${this.boss.planFor(day)?.name || 'BOSS'}`;
    return null;
  }

  morningQuote() {
    const day = this.game.state.day;
    if (this.moon.isBloodDay(day)) return 'Sunday... but the moon will rise RED tonight. Barricade everything, partner.';
    if (this.boss.isBossDay(day)) { const p = this.boss.planFor(day); return `Boss day. ${p?.name} is coming. I hope we have enough ${p?.favName}...`; }
    return null;
  }

  // ------------------------------------------------------------ BearSystem hooks
  onSpawn(b, p) {
    if (p.bossPlan) this.boss.setup(b, p.bossPlan);
    else if (p.blood) this.moon.setup(b, p);
  }

  onBossShown(b) {
    if (!b.bossFight) return false;
    this.boss.intro(b);
    return true;
  }

  decide(b, field) {
    if (b.blood) return this.moon.decide(b, field);
    if (b.bossFight) return this.boss.decide(b, field);
    return false;
  }

  // true = skip BearSystem.step for this bear this frame
  preStep(b, dt) {
    if (!b.hostile && !b.knock && !(b.trapT > 0) && !(b.slowT > 0) && !(b.flashT > 0) && !b.netMesh) { if (b.slowK != null) b.slowK = null; return false; }
    if (this.defense.preStep(b, dt)) return true;
    if (b.bossFight) return this.boss.preStep(b, dt);
    if (b.blood) return this.moon.preStep(b, dt);
    return false;
  }

  onSmash(b, s) {
    this.defense.onSmash(b, s);
    if (b.bossFight) this.boss.onSmash(b, s);
  }

  // render: pose override (attacks, traps, knockback, calm)
  poseFor(b, o) {
    if (!b.poseOverride) return null;
    if (b.poseT01 != null) o.t01 = b.poseT01;
    return b.poseOverride;
  }

  onHide(b) { this.defense.forget(b); }
}
