// [v26 turtle] game.longneck: Old Longneck, the Old Wise Long-Neck Turtle who
// lives in the stone house behind the falls of Mistfall Hollow (zone 'deep').
//
// THE LONG TALK. Tap him and he begins the Old Ways: one conversation that takes
// exactly 3 IN-GAME DAYS (src/data/longneck.js SPEECH, timed by
// game/longneck/speech.js: a word lands every ~20-30 in-game minutes, with long
// "..." pauses). It runs on game time, so it keeps going while you play, through
// the night, and across save/load. A world-anchored pixel bubble over his head
// keeps typing (glacially); a small "still talking" pip sits under Reynard's quest
// notebook (tap it: the transcript scroll, also on a shelf in his house). Reynard
// gets impatient; a beaver and a bear nap on his moss pouf waiting. Not skippable
// (that's the joke) - you can play freely meanwhile. When the last word lands the
// finale plays and he gives you THE OLD WAYS (a permanent breeding bonus through
// game.zoneMods, two lucky ancient fish eggs, coins).
//
// Also: his arrival cutscene when the Hollow opens ('zone' event), his slow idle
// life at the falls (he drives his own rig; Villagers' chatter is held off), the
// yard props at the falls (Villagers.makeProps -> props()), his chat card offers.
//
// State: game.state.longneck = { phase: 'idle' | 'talking' | 'done', heard (in-game hours of
//   talk so far), last (abs. game hour seen last), arrivePending, arrived, finalePending, oldWays, rewarded }
// API: start(), fastForward(days) (tests), spoken() -> tokens said, info(), openTranscript(),
//   onTap(v), cardOffers(v, panel), props(v, put), intro(v), arrive() (tests: play the arrival now)
// Events: 'longneckStart', 'longneckWord' ({ n }), 'longneckDone', 'longneckReward'.
import * as THREE from 'three';
import { LN, OLD_WAYS } from '../../data/longneck.js';
import { TALK_HOURS, N_TOKENS, N_WORDS, TOKENS, spokenAt, wordsIn, bubbleText } from '../longneck/speech.js';
import { TalkPip, openTranscript, slowText, slowSay, slowAll, bubbleOf } from '../longneck/ui.js';
import { arrival, finale, headAnchor, focusOn } from '../longneck/scenes.js';
import { makeLongneckYard } from '../longneck/props.js';
import { SPECIES_BY_ID } from '../../data/species.js';
import { BEAR_TYPES } from '../../data/bears.js';
import { rollGenes } from '../genes.js';
import { spriteMat, ZZZ_ROWS } from '../../entities/critterKit.js';

const mods = import.meta.glob(['../../entities/critters3d.js', '../../entities/bearRig.js'], { eager: true });
const C3 = mods['../../entities/critters3d.js'] || {};
const BR = mods['../../entities/bearRig.js'] || {};

const ID = 'longneck', ZONE = 'deep';
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hasAnim = (r, n) => { const A = r?.anims; return !!A && (Array.isArray(A) ? A.includes(n) : !!A[n]); };
const fmt = (s, o) => s.replace(/\{(\w)\}/g, (_, k) => o[k] ?? '');

export function install(game) { return new Longneck(game); }

class Longneck {
  constructor(game) {
    this.game = game;
    this.n = -1; // tokens said (cached)
    this.bh = null; this.btext = '';
    this.pip = new TalkPip(game, { onTap: () => this.openTranscript() });
    this.sceneBusy = false;
    this.behT = 3; this.mutterT = 12;
    this.aud = null; // the napping audience
    this.yard = null;
    // The Old Ways: a permanent mods bonus once he has finished (rides on zoneMods, so
    // every refreshMods / load / research picks it up)
    const zm = game.zoneMods?.bind(game);
    if (zm) game.zoneMods = () => { const out = zm(); if (game.state?.longneck?.oldWays) out.push(OLD_WAYS.mods); return out; };
    game.on?.('zone', (Z) => { if (Z?.id === ZONE && !this.S.arrived) { this.S.arrivePending = true; } });
    game.on?.('day', () => this.morning());
  }

  get S() {
    const st = this.game.state;
    if (!st.longneck || typeof st.longneck !== 'object') st.longneck = { phase: 'idle', heard: 0, last: null };
    const S = st.longneck;
    if (!['idle', 'talking', 'done'].includes(S.phase)) S.phase = 'idle';
    if (!(S.heard >= 0)) S.heard = 0;
    return S;
  }
  get v() { return this.game.villagers?.get?.(ID) || null; }
  isOpen() { return !!this.game.zones?.isOpen?.(ZONE); }

  // absolute game hours (the night's small hours count as the day after)
  absHours() {
    const st = this.game.state;
    let h = +st.hour || 0;
    if (st.phase === 'night' && h < 12) h += 24;
    return ((st.day | 0) - 1) * 24 + h;
  }
  spoken() { const S = this.S; return S.phase === 'done' ? N_TOKENS : S.phase === 'talking' ? spokenAt(S.heard) : 0; }
  talkDay() { return Math.min(3, Math.floor(this.S.heard / 24) + 1); }
  info() { const n = this.spoken(); return { phase: this.S.phase, n, words: wordsIn(n), of: N_WORDS, day: this.talkDay(), heard: +this.S.heard.toFixed(2), text: bubbleText(n), oldWays: !!this.S.oldWays }; }

  // ------------------------------------------------------------ lifecycle
  onNewGame() { this.reset(); }
  onLoad() {
    this.reset();
    this.S.last = this.absHours();
    if (this.S.oldWays) this.game.refreshMods?.();
  }
  reset() {
    this.n = -1;
    this.bh?.close?.(); this.bh = null; this.btext = '';
    this.pip.hide();
    this.dropAudience();
    this.sceneBusy = false;
  }

  // ------------------------------------------------------------ the talk
  start(v = this.v) {
    const S = this.S, game = this.game;
    if (S.phase !== 'idle' || !v) return false;
    S.phase = 'talking'; S.heard = 0; S.last = this.absHours(); S.startDay = game.state.day;
    this.n = -1;
    v.rig?.play?.('nod', { loop: false, restart: true, onDone: () => this.idle(v) });
    game.audio?.play?.('ln_chime', { volume: 0.4 });
    game.notify?.(LN.begin.fox, 'happy', { dur: 3.2 });
    game.emit?.('longneckStart', { day: game.state.day });
    game.save?.();
    return true;
  }
  /** Tests / debug: let `days` in-game days of talking pass at once. */
  fastForward(days = 1) {
    const S = this.S;
    if (S.phase === 'idle') this.start();
    if (S.phase !== 'talking') return this.info();
    S.heard = Math.min(TALK_HOURS, S.heard + days * 24);
    S.last = this.absHours();
    this.tick(0);
    return this.info();
  }

  update(simDt, dt) {
    const S = this.S;
    // game time -> talk time (only forward; big jumps are a night going by)
    const now = this.absHours();
    if (S.last == null || !Number.isFinite(S.last)) S.last = now;
    const d = now - S.last;
    S.last = now;
    if (S.phase === 'talking' && d > 0 && d < 30) S.heard = Math.min(TALK_HOURS, S.heard + d);
    this.tick(dt || 0);
  }

  tick(dt) {
    const game = this.game, S = this.S;
    const v = this.v;
    const open = this.isOpen();
    if (v?.rig && open) {
      v.t = 1e9; // Villagers' random specials + chatter stay off: he runs his own (slow) life
      if (v.rig.__lnTurned !== true) { v.rig.root.rotation.y = 0.55; v.rig.__lnTurned = true; }
    }
    // words landing
    const n = this.spoken();
    if (n !== this.n) { const prev = this.n; this.n = n; if (prev >= 0 && S.phase === 'talking' && n > prev) this.onWords(prev, n, v); }
    if (S.phase === 'talking' && n >= N_TOKENS) this.finish();
    if (!open || !v?.rig) { this.bubble(false); this.pip.set(false); this.dropAudience(); return; }
    slowAll(game, 'npclongneck', 9); // his lines from other systems (gift scenes, pond visits) come out slowly too
    // stage moments
    if (S.arrivePending && this.canStage()) { S.arrivePending = false; S.arrived = true; this.play(arrival(this, v)); }
    else if (S.finalePending && this.canStage()) { S.finalePending = false; this.play(finale(this, v)); }
    // his life at the falls
    if (!this.sceneBusy) this.behave(v, dt);
    // the bubble, the pip, the audience
    const cs = game.cutscene?.active, over = !!game.overrideScene;
    const near = Math.hypot(v.x - game.rig.target.x, v.z - game.rig.target.z) < 26 && (game.rig.wupp || 0) < 0.07;
    this.bubble(S.phase === 'talking' && near && !cs && !over && !this.sceneBusy && !game.villagers?.card && !game.titleMode && game.state.phase !== 'night', v, n);
    this.pip.set(S.phase === 'talking' && !game.titleMode && !cs && game.state.phase !== 'night', { n, day: this.talkDay() });
    if (S.phase === 'talking') this.audience(v, dt, near && !over); else this.dropAudience();
    if (this.yard && near && !over) this.yard.update(dt);
  }

  onWords(prev, n, v) {
    const game = this.game;
    const near = v && Math.hypot(v.x - game.rig.target.x, v.z - game.rig.target.z) < 18 && !game.overrideScene;
    if (near && dt0(game)) game.audio?.play?.('ln_word', { volume: 0.3 });
    // a new paragraph: a slow nod first
    if (v?.rig && TOKENS[n - 1] && TOKENS[prev] && TOKENS[n - 1].p !== TOKENS[prev].p && !this.sceneBusy) v.rig.play('nod', { loop: false, restart: true, onDone: () => this.idle(v) });
    game.emit?.('longneckWord', { n });
  }

  finish() {
    const S = this.S, game = this.game;
    if (S.phase !== 'talking') return;
    S.phase = 'done'; S.heard = TALK_HOURS; S.done = true; S.finalePending = true;
    this.n = N_TOKENS;
    game.emit?.('longneckDone', {});
    game.save?.();
  }

  canStage() {
    const g = this.game;
    if (this.sceneBusy || g.cutscene?.active || g.homes?.active || g.titleMode) return false;
    const sc = g.npcScenes;
    return sc?.free ? sc.free() : g.state.phase === 'day';
  }
  play(p) { p.catch((e) => { console.warn('longneck scene', e); this.sceneBusy = false; if (this.game.npcScenes) this.game.npcScenes.busy = false; }); }
  /** Tests: play the arrival cutscene now. */
  arrive() { const v = this.v; if (!v?.rig) return false; this.S.arrivePending = false; this.S.arrived = true; this.play(arrival(this, v)); return true; }

  // ------------------------------------------------------------ the bubble
  bubble(want, v, n) {
    if (!want) { if (this.bh) { this.bh.close(); this.bh = null; this.btext = ''; } return; }
    if (this._btN !== n) { this._btN = n; this._bt = bubbleText(n); }
    const text = this._bt;
    const alive = bubbleOf(this.bh);
    if (!alive) {
      this.bh = this.game.say(headAnchor(v), text, { key: 'lnTalk', size: 'm', mood: 'normal', dur: 1e9 });
      slowText(this.bh, text, text.length, 2.2);
      this.btext = text;
      return;
    }
    if (text === this.btext) return;
    const keep = text.startsWith(this.btext) ? this.btext.length : Math.max(0, text.lastIndexOf(' ') + 1);
    slowText(this.bh, text, keep, 2.2);
    this.btext = text;
  }

  // ------------------------------------------------------------ his slow life
  idle(v = this.v) {
    const r = v?.rig;
    if (!r || this.sceneBusy) return;
    r.play(this.S.phase === 'talking' ? 'talk' : 'idle', { loop: true });
  }
  behave(v, dt) {
    const r = v.rig, S = this.S, game = this.game;
    const talking = S.phase === 'talking';
    if (talking && (r.current === 'idle' || r.current === 'doze' || r.current === 'hide')) r.play('talk', { loop: true });
    if (!talking && r.current === 'talk') r.play('idle', { loop: true });
    this.behT -= dt;
    if (this.behT <= 0) {
      this.behT = talking ? 22 + Math.random() * 18 : 14 + Math.random() * 10;
      const list = talking ? ['sip_tea', 'point', 'nod'] : ['sip_tea', 'doze', 'nod', 'point', 'retract'];
      const sp = pick(list.filter((a) => hasAnim(r, a)));
      if (sp === 'doze') {
        r.play('doze', { loop: true });
        setTimeout(() => { if (r.current === 'doze') r.play('wake', { loop: false, onDone: () => this.idle(v) }); }, 9000);
      } else if (sp) r.play(sp, { loop: false, restart: true, onDone: () => this.idle(v) });
    }
    // a slow mutter now and then (not in the middle of the Long Talk)
    this.mutterT -= dt;
    if (this.mutterT <= 0) {
      this.mutterT = 24 + Math.random() * 20;
      const near = Math.hypot(v.x - game.rig.target.x, v.z - game.rig.target.z) < 14;
      if (!talking && near && !game.overrideScene && !game.cutscene?.active && Math.random() < 0.6) slowSay(game, headAnchor(v), pick(S.phase === 'done' ? LN.after : LN.idle), { cps: 1.2, hold: 2 });
    }
  }

  morning() {
    const S = this.S, game = this.game;
    if (S.phase !== 'talking' || S.heard < 1) return;
    const n = this.spoken();
    setTimeout(() => { if (this.S.phase === 'talking') game.notify?.(fmt(pick(LN.morning), { n: wordsIn(n), N: N_WORDS, d: this.talkDay() }), 'info', { dur: 4.5 }); }, 6000);
  }

  // ------------------------------------------------------------ the napping audience
  audience(v, dt, show) {
    const game = this.game;
    if (!this.aud) {
      const A = (this.aud = { list: [] });
      const g = game.grid;
      const at = (x, z) => new THREE.Vector3(x, g.groundAt(x, z), z);
      try {
        if (C3.BeaverRig) {
          const b = new C3.BeaverRig({ shadows: true });
          const p = this.yard?.group?.userData?.pouf || at(39.45, 196.6);
          b.root.position.copy(p);
          b.root.rotation.y = -1.9;
          b.root.scale.setScalar(0.9);
          b.play(hasAnim(b, 'sleep') ? 'sleep' : 'idle', { loop: true });
          game.villagers.group.add(b.root);
          A.list.push({ kind: 'beaver', rig: b, voice: 'cub', y: 0.75 });
        }
        if (BR.BearRig && BEAR_TYPES.intern) {
          const bear = new BR.BearRig('intern', BEAR_TYPES.intern);
          const p = at(40.5, 197.45);
          bear.root.position.copy(p);
          bear.root.rotation.y = Math.atan2(v.x - p.x, v.z - p.z) * 0.45; // half towards him, half towards us (so we see it nod off)
          bear.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
          bear.setFace?.('sleepy');
          game.villagers.group.add(bear.root);
          const z = new THREE.Sprite(spriteMat(ZZZ_ROWS));
          z.scale.setScalar(0.16);
          game.villagers.group.add(z);
          A.list.push({ kind: 'bear', rig: bear, voice: 'bear', y: 1.5, zzz: z });
        }
      } catch (e) { console.warn('longneck audience', e); }
    }
    const t = (this.audT = (this.audT || 0) + dt);
    for (const a of this.aud.list) {
      a.rig.root.visible = show;
      if (a.zzz) a.zzz.visible = show;
      if (!show) continue;
      if (a.kind === 'bear') {
        a.rig.pose('sit', dt);
        a.rig.setFace?.('sleepy');
        a.rig.update?.(dt);
        const u = (t * 0.35) % 1;
        a.rig.headTop?.(a.zzz.position);
        a.zzz.position.x += 0.15 + u * 0.2; a.zzz.position.y += 0.1 + u * 0.4;
        a.zzz.scale.setScalar((0.1 + u * 0.12) * (u < 0.85 ? 1 : (1 - u) / 0.15));
      } else a.rig.update?.(dt);
    }
  }
  dropAudience() {
    if (!this.aud) return;
    for (const a of this.aud.list) { a.rig.root.removeFromParent(); a.zzz?.removeFromParent(); try { a.rig.dispose?.(); } catch { /* ignore */ } }
    this.aud = null;
  }
  answerFrom() { return this.aud?.list?.find((a) => a.rig.root.visible) || null; }

  // ------------------------------------------------------------ taps, card, home
  /** Villagers.open hook: true when it handled the tap. */
  onTap(v) {
    const S = this.S, game = this.game;
    if (this.sceneBusy) return true;
    this.frameHead(v);
    if (S.phase === 'idle') { if (!game.villagers.vstate(v).met) game.villagers.vstate(v).met = true; this.start(v); return true; }
    if (S.phase === 'talking') {
      const now = performance.now();
      if (now - (this.tapT || 0) < 8000) { this.tapT = 0; return false; } // a second tap: his card
      this.tapT = now;
      game.notify?.(pick(LN.fox), 'info', { dur: 3 });
      game.audio?.play?.('pop_in', { volume: 0.3 });
      setTimeout(() => {
        const a = this.answerFrom();
        const anchor = a ? { getWorldPos: (p) => p.copy(a.rig.root.position).setY(a.rig.root.position.y + a.y) } : headAnchor(v);
        game.say?.(anchor, pick(LN.answer), { voice: a?.voice || 'cub', mood: 'whisper', size: 's', dur: 3, key: 'lnAnswer' });
      }, 2300);
      return true;
    }
    return false;
  }
  cardOffers(v, panel) {
    const S = this.S;
    const n = this.spoken();
    if (S.phase === 'talking') return [{ icon: 'speech', title: 'The Long Talk', desc: `Word ${wordsIn(n)} of ${N_WORDS}. Day ${this.talkDay()} of 3. Read it so far.`, tag: 'LISTENING', onClick: panel(() => this.openTranscript()) }];
    if (S.phase === 'idle') return [{ icon: 'speech', title: 'Hear the Old Ways', desc: 'He has something to tell you. It will not take long.', tag: 'NEW', onClick: panel(() => this.start(v)) }];
    return [{ icon: 'speech', title: OLD_WAYS.name, desc: OLD_WAYS.desc, tag: 'YOURS', onClick: panel(() => this.openTranscript()) }];
  }
  openTranscript() {
    const S = this.S, game = this.game;
    if (S.phase === 'idle') { game.notify?.('He hasn\'t started yet. Go and tap him. Bring a snack.', 'info', { dur: 3 }); return null; }
    return openTranscript(game, { n: this.spoken(), day: this.talkDay(), done: S.phase === 'done', onLook: () => this.lookAt() });
  }
  lookAt() {
    const v = this.v, game = this.game;
    if (!v || game.homes?.active || game.cutscene?.active) return;
    game.ui?.stopTracking?.();
    const f = focusOn(game, v);
    game.rig.lookAt(f.x, f.z);
    game.rig.wuppGoal = 0.022;
  }
  /** On a tap: if the camera is already near him, ease it up so his head and face are in view. */
  frameHead(v = this.v) {
    const game = this.game, r = game.rig;
    if (!v || game.cutscene?.active || game.homes?.active || Math.hypot(r.target.x - v.x, r.target.z - v.z) > 12) return;
    const f = focusOn(game, v);
    r.goal.x = f.x; r.goal.z = f.z;
  }
  /** Villagers.intro hook (Zones.reveal): he only manages a very slow "..." */
  async intro(v) {
    const game = this.game;
    v.rig?.play?.('idle', { loop: true });
    const f = focusOn(game, v); // the reveal looked at his feet: up to his face
    game.rig.lookAt(f.x, f.z);
    const s = slowSay(game, headAnchor(v), '...', { cps: 0.9, hold: 1.2 });
    await s.done;
    game.villagers.vstate(v).met = true;
  }
  /** Villagers.makeProps hook: his yard at the falls (and the door point for HomeMode). */
  props(v, put) {
    this.yard = makeLongneckYard(this.game, v);
    put(this.yard.group, 0, 0, 0);
    return this.yard.group;
  }
  /** For his home interior: what he is saying right now. */
  homeLine() {
    const S = this.S;
    if (S.phase === 'talking') return bubbleText(this.spoken(), 70);
    return null;
  }

  // ------------------------------------------------------------ the reward
  reward(v = this.v) {
    const S = this.S, game = this.game;
    if (S.rewarded) return false;
    S.rewarded = true; S.oldWays = true;
    game.refreshMods?.();
    game.earnMisc?.(OLD_WAYS.coins, 'gifts');
    for (const id of OLD_WAYS.eggs) {
      if (!SPECIES_BY_ID[id]) continue;
      try { game.fish?.addBoughtEgg?.(id, rollGenes(id, game.mods, { luck: OLD_WAYS.eggLuck }), 40); } catch (e) { console.warn('longneck egg', e); }
    }
    if (v) {
      try { game.villagers.talk?.addFriend?.(v, 2); } catch { /* ignore */ }
      try { game.particles?.confetti?.(v.x, v.y + 1.6, v.z, 50); game.particles?.sparkle?.(v.x, v.y + 1.4, v.z, 14); } catch { /* fx optional */ }
    }
    game.audio?.play?.('ln_gong', { volume: 0.5 });
    game.audio?.play?.('levelup', { volume: 0.4 });
    game.emit?.('longneckReward', { mods: OLD_WAYS.mods });
    game.save?.();
    return true;
  }
  rewardText() {
    const eggs = OLD_WAYS.eggs.map((id) => SPECIES_BY_ID[id]?.name).filter(Boolean);
    return `${OLD_WAYS.desc} + ${eggs.join(' and ')} eggs + ${OLD_WAYS.coins} coins`;
  }
}

// sounds only while the game actually runs (not on the title screen)
function dt0(game) { return !game.titleMode && game.running !== false; }
