// NPC cutscenes: every neighbour gets a little stage moment.
//  - ARRIVAL: when their area's fog lifts (game event 'zone'), right after the
//    Zones.reveal() banner + hello, the camera glides in close, a caption card
//    names them, they do their signature bit, say a few lines in their own voice
//    and tell you what you can research now. (Pip's arrival is PipVisit's Day-2
//    walk-in, so his only plays when you cleared your way to the mill first.)
//  - FIRST VISIT: the first time you tap a neighbour, a short welcome scene with
//    Reynard chiming in from a little portrait, then their normal panel opens.
// Scenes queue up and only play when nothing else is going on (tutorial, title,
// lab, classroom, other cutscenes, open panels, night...). Skippable.
//  - [v19 npc] EVENTS (queueEvent): friendship milestones (3 / 6 / 10, at their home),
//    a neighbour walking over to your pond some mornings, two neighbours bickering at
//    your pond, and gift deliveries. Same queue + guard: never over another scene, the
//    tutorial, the lab, the classroom, bedtime, a boss fight or the blood moon.
// Remembered in game.state.npcScenes = { arrive: {id: 1}, visit: {id: 1}, queue: [zoneId], events: [evt], rolled: day }.
import { ZONE_BY_ID } from '../data/zones.js';
import * as RES from '../data/research.js';
import { DIALOGUE, BICKER } from '../data/npcDialogue.js'; // [v19 npc] friendship / visit / bicker scenes

const c3 = import.meta.glob('../entities/critters3d.js', { eager: true });
const C3 = c3['../entities/critters3d.js'] || {};

const ftk = import.meta.glob('../ui/FoxTalk3D.js', { eager: true });
const createFoxTalk = ftk['../ui/FoxTalk3D.js']?.createFoxTalk || null;

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const hasAnim = (r, n) => { const A = r?.anims; return !!A && (Array.isArray(A) ? A.includes(n) : !!A[n]); };
const listOf = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

// Per neighbour: arrival `sig` (signature anims in order), `arrive` lines, the
// closing line (`{X}` = what you can research now), `visit` lines and Reynard's
// `fox` comment. A line is a string or { t, anim, fx, sfx, mood, fox }.
const SCENES = {
  hoot: {
    sig: ['binoculars'],
    arrive: [
      { t: 'Hold still. HOLD STILL.', anim: 'binoculars', mood: 'excited' },
      { t: '...Oh. You\'re not a rare warbler. You\'re a fox.', anim: 'head_turn' },
      { t: 'Entry #4,112: one fox. Slightly scruffy. Hoo!', anim: 'write_notes', sfx: 'paper' },
    ],
    closer: 'Hoo! Pop into your lab: you can research {X} now!',
    visit: [
      { t: 'Welcome to Lookout Ridge! Only 300 stairs. Hoo-hoo!', anim: 'wave' },
      { t: 'I\'ve counted every bird in this forest. Twice. Some thrice.', anim: 'write_notes', sfx: 'paper' },
      { t: 'Tap birds by your pond to spot them. I pay in shiny coins!', anim: 'binoculars' },
    ],
    fox: { t: 'He wrote me down as "scruffy". I am DISTINGUISHED.', mood: 'tsk' },
  },
  dale: {
    sig: ['cheers'],
    arrive: [
      { t: 'Whoa. Fog\'s gone. Thought that was just my eyes, bud.', anim: 'laugh' },
      { t: 'Been sittin\' here since Tuesday. Which Tuesday? Good question.', anim: 'drink' },
      { t: 'Here\'s to new neighbours! *crack* Ahhh. Daisy.', anim: 'cheers', fx: 'confetti', sfx: 'pop_in' },
    ],
    closer: 'Oh, and you can research {X} now, bud. Easy peasy.',
    visit: [
      { t: 'Welcome to the river, bud! Grab a chair. Not that one, that\'s the moose\'s.', anim: 'wave' },
      { t: 'Beavers love this river. Dams, gates, the whole deal, eh?', anim: 'drink' },
      { t: 'If you see the moose, tell him he owes me twenty bucks.', anim: 'point_laugh' },
    ],
    fox: { t: 'Note to self: never lend the moose money.', mood: 'think' },
  },
  granny: {
    sig: ['tongue_catch'],
    arrive: [
      { t: '*SHLURP* Mm! Fresh mayfly. Pardon me, dearie.', anim: 'tongue_catch', sfx: 'nibble' },
      { t: 'Now let me look at you. Skin and fur! Are you eating?', anim: 'talk' },
      { t: 'Swamp air makes fish go all funny colours. In a GOOD way!', anim: 'laugh' },
    ],
    closer: 'Now run along and research {X}, dearie!',
    visit: [
      { t: 'Come in, come in! Wipe your paws, the mud is new.', anim: 'wave' },
      { t: 'I\'m knitting a sweater for a beetle. Six sleeves!', anim: 'laugh' },
      { t: 'Bring me bugs and I\'ll make your fish fat and happy. Ribbit!', anim: 'tongue_catch', sfx: 'nibble' },
    ],
    fox: { t: 'Six sleeves. Respect.', mood: 'proud' },
  },
  rocco: {
    sig: ['rummage'],
    arrive: [
      { t: 'Psst. The fog lifting? Not my fault. Probably.', anim: 'talk', mood: 'whisper' },
      { t: '*rummage rummage* ...gadgets, gizmos, one slightly used egg.', anim: 'rummage' },
      { t: 'Ta-daa! Genuine article. Do NOT check the label.', anim: 'show_item', fx: 'sparkle', sfx: 'star_pop' },
    ],
    closer: 'Psst. You can research {X} now. You didn\'t hear it from me.',
    visit: [
      { t: 'A customer! Er, a FRIEND. Who buys things.', anim: 'wave' },
      { t: 'This? Found it. In a box. That I also found.', anim: 'show_item' },
      { t: 'No refunds, no questions, no receipts. Great deals!', anim: 'count_coins', sfx: 'coins' },
    ],
    fox: { t: 'I like him. I don\'t trust him. I like him.', mood: 'scheming' },
  },
  shellby: {
    sig: ['sip_tea'],
    arrive: [
      { t: 'Ahh. Willow-bark tea. Two hundred years and it\'s still too hot.', anim: 'sip_tea' },
      { t: 'I was going to tell you something very important... it was...', anim: 'talk' },
      { t: 'Zzz... zzz...', anim: 'doze', loop: true, mood: 'whisper', hold: 1.2, sfx: 'sleep' },
      { t: 'Hm? Oh! YES! The old fish. They\'re back!', anim: 'wake', mood: 'excited' },
    ],
    closer: 'Now... you may research {X}. Slowly. Like a turtle.',
    visit: [
      { t: 'Welcome to the Great Willow, young one.', anim: 'wave' },
      { t: 'This tree and I are the same age. She has aged better.', anim: 'sip_tea' },
      { t: 'Ancient fish lay eggs here. Mind the gar, they nibble.', anim: 'laugh' },
    ],
    fox: { t: 'Two hundred years and he naps more than me. Goals.', mood: 'sleepy' },
  },
  clover: {
    sig: ['dig'],
    arrive: [
      { t: '*dig dig dig* ...Oh! I dug up a neighbour!', anim: 'dig', sfx: 'dig', fx: 'puff' },
      { t: 'I\'m Clover! I grow carrots. And radishes. And opinions about compost.', anim: 'happy' },
      { t: 'Bears LOVE fresh veggies. Happy tummies, happy tips!', anim: 'water_plants' },
    ],
    closer: 'Now you can research {X}! Go go go!',
    visit: [
      { t: 'Welcome to my patch! Don\'t step on the lettuce, it\'s shy.', anim: 'wave' },
      { t: 'Plant crops by your pond and the bears smell them for miles!', anim: 'sniff' },
      { t: 'Water every morning. I sing to my turnips. La-laa!', anim: 'water_plants', fx: 'hearts' },
    ],
    fox: { t: 'She sings to turnips. ...Do turnips have a favourite song?', mood: 'think' },
  },
  otis: {
    sig: ['juggle_pebble'],
    arrive: [
      { t: 'Ahoy! Watch this: three pebbles, no paws! ...One paw.', anim: 'juggle_pebble' },
      { t: 'And this here is Gerald. He\'s a walleye. He\'s very proud.', anim: 'hold_fish', sfx: 'fish_flop' },
      { t: 'Walleye, pike, perch: I know \'em all by first name.', anim: 'laugh' },
    ],
    closer: 'Now you can research {X}! Reel it in!',
    visit: [
      { t: 'Welcome aboard! It\'s a dock. But I call it aboard.', anim: 'wave' },
      { t: 'Feed your fish well. Big fish, big coins, big Otis smile!', anim: 'cast_line', sfx: 'splash' },
      { t: 'Pike bite. Don\'t name the pike. Trust me.', anim: 'hold_fish' },
    ],
    fox: { t: 'He named a fish Gerald. My next fish is called Gerald.', mood: 'happy' },
  },
  hazel: {
    sig: ['roll_dough'],
    arrive: [
      { t: 'Oh! Flour everywhere! So sorry dear, I\'m mid-pie!', anim: 'roll_dough', fx: 'puff' },
      { t: 'Bears with full tummies tip like kings. Pie is BUSINESS.', anim: 'taste' },
      { t: 'Eek! *curl* ...Sorry, reflex. A leaf startled the spikes.', anim: 'curl_up', sfx: 'pop_in' },
    ],
    closer: 'Now you can research {X}, sweetie. Fresh out of the oven!',
    visit: [
      { t: 'Welcome to my bakery! Mind the spikes, sweetie.', anim: 'wave' },
      { t: 'Taste this: blueberry-honey. Too much honey? NEVER.', anim: 'taste', fx: 'hearts' },
      { t: 'Snacks by the tables keep the bears happy while they wait.', anim: 'roll_dough' },
    ],
    fox: { t: 'If that\'s "too much honey", I want too much honey.', mood: 'yum' },
  },
  chip: {
    sig: ['peck_wood'],
    arrive: [
      { t: 'Tok-tok-tok-tok! ...Sorry. The fog made me nervous.', anim: 'peck_wood', sfx: 'chip' },
      { t: 'Measure twice, peck once. That\'s the Chip way.', anim: 'measure' },
      { t: 'Logs from your beavers? I\'ll make chairs bears can\'t break. Mostly.', anim: 'hammer' },
    ],
    closer: 'Now you can research {X}! Tok-tok!',
    visit: [
      { t: 'Welcome to the workshop! Watch your head, I peck when I\'m happy.', anim: 'wave' },
      { t: 'Bring wood, pick a plan, I build it. Good furniture takes time.', anim: 'saw', sfx: 'saw' },
      { t: 'Old junk in the forest? Bring it here, I\'ll fix it right up!', anim: 'inspect' },
    ],
    fox: { t: 'His tree house has nicer furniture than my hut.', mood: 'sad' },
  },
  pip: {
    sig: ['count_logs'],
    arrive: [
      { t: 'Oh hey, partner! You cleared all the way to my mill!', anim: 'wave' },
      { t: '*munch munch* Sorry. Emergency acorn.', anim: 'stuff_cheeks' },
      { t: 'Logs, logs, lovely logs! I buy \'em ALL.', anim: 'count_logs', sfx: 'coins' },
    ],
    closer: 'Now you can research {X}, partner!',
    visit: [
      { t: 'Welcome to the mill, partner! Smell that? Sawdust and profit!', anim: 'wave' },
      { t: 'My log price changes every day. Sell when it\'s high!', anim: 'haggle' },
      { t: '*stuffs cheeks* ...These are for later. Business acorns.', anim: 'stuff_cheeks' },
    ],
    fox: { t: 'Business acorns. I need business acorns.', mood: 'greedy' },
  },
};

export class NpcScenes {
  constructor(game) {
    this.game = game;
    this.busy = false;
    this.checkT = 1.5;
    game.on('zone', (Z) => this.onZone(Z));
    // Pip's Day-2 walk-in already was his arrival scene
    game.on('pipArrived', () => { const S = this.S; S.queue = S.queue.filter((id) => id !== 'mill'); S.arrive.pip = 1; });
  }

  get S() {
    const S = (this.game.state.npcScenes ||= {});
    S.arrive ||= {}; S.visit ||= {}; S.queue ||= []; S.events ||= [];
    return S;
  }

  onZone(Z) {
    if (!Z?.npc || !SCENES[Z.npc.id]) return;
    const S = this.S;
    if (S.arrive[Z.npc.id] || S.queue.includes(Z.id)) return;
    S.queue.push(Z.id);
    this.checkT = Math.min(this.checkT, 0.9); // a short beat after the reveal's hello
  }

  // nothing else is on stage?
  // [v19 npc] test helper: the first reason free() says no (or '')
  whyBusy() {
    const g = this.game, st = g.state, be = g.bearEvents;
    const R = { busy: this.busy, notRunning: !g.running, title: g.titleMode, cutscene: g.cutscene?.active, cine: g.cine?.active, lab: g.lab?.active, classroom: g.classroom?.active,
      bedtime: g.bedtime?.active, tutorial: g.tutorial?.active, zones: g.zones?.busy, pip: g.pipVisit?.busy || g.pipVisit?.view, workshop: g.workshop?.view, card: g.villagers?.card,
      bubbles: g.ui?.bubbles?.busy, phase: st.phase !== 'day' && st.phase !== 'morning', bear: be?.boss?.active || be?.moon?.siege, panel: g.ui?.panel, paused: st.paused };
    return Object.keys(R).filter((k) => R[k]).join(',');
  }

  free() {
    const game = this.game;
    const st = game.state;
    if (this.busy || !game.running || game.titleMode) return false;
    if (game.cutscene?.active || game.cine?.active || game.lab?.active || game.classroom?.active || game.bedtime?.active || game.tutorial?.active) return false;
    if (game.zones?.busy || game.pipVisit?.busy || game.pipVisit?.view || game.workshop?.view || game.villagers?.card) return false;
    if (game.ui?.bubbles?.busy) return false;
    if (st.phase !== 'day' && st.phase !== 'morning') return false;
    // [v19 npc] no neighbour scenes during bear events or with a panel open
    const be = game.bearEvents;
    if (be?.boss?.active || be?.moon?.siege || (be?.moon?.isBloodDay?.(st.day) && st.hour >= 14)) return false;
    if (game.ui?.panel || st.paused) return false;
    return true;
  }

  update(dt) {
    this.tickVisitors(dt); // [v19 npc]
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    const S = this.S;
    if (!S.queue.length) { this.events(); return; } // [v19 npc]
    if (!this.free()) return;
    const zid = S.queue.shift();
    const Z = ZONE_BY_ID[zid];
    const v = Z && this.game.villagers?.get(Z.npc.id);
    if (!v || S.arrive[v.id]) return;
    this.arrival(v).catch((e) => { console.warn('npc arrival', e); this.busy = false; });
  }

  // research nodes this neighbour opens up (data/research.js is shared; read defensively)
  researchFor(Z) {
    const list = Array.isArray(RES.RESEARCH) ? RES.RESEARCH : [];
    const done = this.game.state.research || [];
    return list.filter((r) => r && r.zone === Z.id && !done.includes(r.id)).map((r) => r.name || r.id);
  }

  // ------------------------------------------------------------------ playback
  // runs `lines` while a cutscene holds the camera on the NPC; resolves when done or skipped
  async stage(v, { caption, sub, lines, end, fox, other = null, focusAt = null }) {
    const game = this.game;
    const V = game.villagers;
    const cs = game.cutscene;
    const r = v.rig;
    if (cs.active) return;
    this.busy = true;
    const oldT = v.t;
    v.t = 1e9; // no random idle specials / chatter mid-scene
    // aim so the NPC (standing on raised ground) sits a bit above screen centre, clear of the caption
    const rig = game.rig;
    const yaw = rig.yawGoal ?? rig.yaw ?? 0;
    const off = -(v.y + 0.9 - (rig.goal?.y || 0)) / Math.tan(rig.pitch || 0.77) + 0.55;
    const fx0 = focusAt ? focusAt.x : v.x, fz0 = focusAt ? focusAt.z : v.z;
    const focus = { x: fx0 + Math.sin(yaw) * off, z: fz0 + Math.cos(yaw) * off };
    let portrait = null;
    const shot = cs.play({
      shots: [
        { at: focus, wupp: 0.019, dur: 2, caption, sub, sfx: 'whoosh' },
        { at: focus, dur: 900 }, // held until the dialogue is over
      ],
      skippable: true,
    });
    const skipped = () => cs.skipped || !cs.active;
    let cur = null;
    const line = async (L, anchor, voice, key, actor = v) => {
      if (skipped()) return;
      L = typeof L === 'string' ? { t: L } : L;
      const r = actor.rig;
      if (L.anim && hasAnim(r, L.anim)) {
        const loop = !!L.loop;
        r.play(L.anim, { loop, restart: true, onDone: loop ? undefined : () => { if (!skipped()) r.play(hasAnim(r, 'talk') ? 'talk' : 'idle', { loop: true }); } });
      } else if (key === 'npcfox') V.idle(v);
      else if (hasAnim(r, 'talk')) r.play('talk', { loop: true });
      if (L.sfx) game.audio.play(L.sfx, { volume: 0.45 });
      if (L.fx) this.fx(actor, L.fx);
      cur = game.say(anchor, L.t, { voice, mood: L.mood || 'happy', size: 'm', key, wait: true });
      if (key === 'npcfox') portrait?.talk(L.t);
      const T = (2.6 + L.t.length * 0.045 + (L.hold || 0)) * (this.slow || 1); // `slow`: test knob for screenshots
      const t0 = performance.now();
      await Promise.race([cur?.done || wait(T), wait(T), new Promise((res) => {
        const tick = () => { if (skipped() || performance.now() - t0 > T * 1000) res(); else setTimeout(tick, 80); };
        tick();
      })]);
      cur?.close?.();
      cur = null;
      await wait(0.15);
    };
    try {
      await wait(1.25); // the glide lands
      const voice = v.cast.voice || 'fox';
      const npcAnchor = V.anchor(v);
      for (const L of lines) {
        if (skipped()) break;
        if (L?.fox) { portrait ||= this.portrait(); portrait?.setExpression?.(L.mood || 'happy'); await line(L, portrait?.anchor || npcAnchor, 'fox', 'npcfox'); continue; }
        if (L?.by === 'b' && other) { await line(L, V.anchor(other), other.cast.voice || 'fox', 'npc' + other.id, other); if (v.rig && hasAnim(v.rig, 'idle') && v.rig.current === 'talk') v.rig.play('idle', { loop: true }); continue; }
        await line(L, npcAnchor, voice, 'npc' + v.id);
        if (other?.rig?.current === 'talk') other.rig.play('idle', { loop: true });
      }
      if (fox && !skipped()) {
        portrait ||= this.portrait();
        portrait?.setExpression?.(fox.mood || 'happy');
        await line({ t: fox.t, mood: 'happy' }, portrait?.anchor || npcAnchor, 'fox', 'npcfox');
      }
      if (end && !skipped()) await end(line, npcAnchor, voice);
    } finally {
      cur?.close?.();
      if (!cs.skipped) cs.skipped = true; // release the held shot
      try { await shot; } catch { /* ignore */ }
      portrait?.dispose();
      v.t = Math.max(3, Math.min(oldT, 12));
      if (r) { r.setExpression?.(null); if (v.visitor) r.play?.('idle', { loop: true }); else V.idle(v); }
      if (other?.rig) other.rig.play?.('idle', { loop: true });
      this.busy = false;
    }
  }

  fx(v, kind) {
    const P = this.game.particles;
    const y = v.y + (v.cast.height || 1.5);
    try {
      if (kind === 'confetti') P.confetti(v.x, y, v.z, 30);
      else if (kind === 'hearts') P.hearts?.(v.x, y, v.z, 4);
      else if (kind === 'sparkle') P.sparkle?.(v.x, y - 0.3, v.z, 10);
      else if (kind === 'puff') P.puff?.(v.x, v.y + 0.4, v.z, 10, 0.6);
      else if (kind === 'stars') P.stars?.(v.x, y, v.z, 8);
    } catch { /* fx are optional */ }
  }

  // Reynard chiming in from a small talking bust in the corner
  portrait() {
    injectCSS();
    const el = document.createElement('div');
    el.className = 'npcs-fox';
    el.innerHTML = '<div class="npcs-fox-pic"></div><b>Reynard</b>';
    document.body.appendChild(el);
    let ft = null;
    try { ft = createFoxTalk ? createFoxTalk(el.querySelector('.npcs-fox-pic'), { outfit: this.game.fox?.outfit || 'default', game: this.game }) : null; } catch (e) { console.warn('npc fox portrait', e); ft = null; }
    if (!ft) el.querySelector('.npcs-fox-pic').classList.add('flat');
    requestAnimationFrame(() => el.classList.add('on'));
    return {
      anchor: () => { const b = el.getBoundingClientRect(); return { x: b.left + b.width * 0.62, y: b.top + 4, visible: true }; },
      setExpression: (n) => { try { ft?.setExpression(n); } catch { /* ignore */ } },
      talk: (t) => { try { ft?.talk(t); } catch { /* ignore */ } },
      dispose: () => { el.classList.remove('on'); setTimeout(() => { try { ft?.dispose(); } catch { /* ignore */ } el.remove(); }, 300); },
    };
  }

  // ---- 1. the neighbour moves in (after Zones.reveal's banner + hello)
  async arrival(v) {
    const game = this.game;
    const D = SCENES[v.id];
    const Z = v.zone;
    this.S.arrive[v.id] = 1;
    if (!D || !v.rig) return;
    const research = this.researchFor(Z);
    const shown = research.slice(0, 3);
    const X = shown.length ? listOf(research.length > 3 ? [...shown, `${research.length - 3} more`] : shown) : null;
    const sig = D.sig.find((n) => hasAnim(v.rig, n));
    if (sig) v.rig.play(sig, { loop: false, restart: true });
    await this.stage(v, {
      caption: v.name,
      sub: `${Z.npc.title} · ${Z.name}`,
      lines: D.arrive,
      end: async (line, anchor, voice) => {
        // what they unlock now
        const subs = X ? research.slice(0, 4).join(' · ') + (research.length > 4 ? ' ...' : '') : Z.unlocks.slice(0, 3).map((u) => u.title).join(' · ');
        game.cutscene.caption(X ? 'Now you can research' : `New with ${v.name}`, subs);
        game.audio.play(X ? 'research' : 'levelup', { volume: 0.4 });
        this.fx(v, 'confetti');
        const t = X ? D.closer.replace('{X}', X) : `Come visit anytime! I've got ${listOf(Z.unlocks.slice(0, 2).map((u) => u.title.split(':')[0]))} for you.`;
        await line({ t, anim: 'happy', mood: 'excited' }, anchor, voice, 'npc' + v.id);
      },
    });
    game.save?.();
  }

  // ---- 2. the first tap on a neighbour; returns true when it took over open()
  firstVisit(v) {
    const game = this.game;
    const S = this.S;
    if (!v?.rig || S.visit[v.id] || !SCENES[v.id]) return false;
    if (this.busy || game.cutscene?.active || game.lab?.active || game.tutorial?.active) return false;
    S.visit[v.id] = 1;
    const D = SCENES[v.id];
    (async () => {
      try {
        await this.stage(v, { caption: `Visiting ${v.name}`, sub: v.zone.name, lines: D.visit, fox: D.fox });
      } catch (e) { console.warn('npc visit', e); this.busy = false; }
      game.save?.();
      game.villagers.open(v); // now the normal panel
    })();
    return true;
  }

  // ================================================================== [v19 npc] events
  queueEvent(e) {
    if (!e?.kind) return;
    const S = this.S;
    const k = `${e.kind}:${e.id || ''}:${e.b || ''}:${e.level || ''}`;
    if (S.events.some((x) => `${x.kind}:${x.id || ''}:${x.b || ''}:${x.level || ''}` === k)) return;
    S.events.push(e);
    this.checkT = Math.min(this.checkT, 1.5);
  }

  // neighbours you have met whose area is open
  friends() {
    const game = this.game;
    return (game.villagers?.list || []).filter((v) => game.zones?.isOpen(v.zone.id) && DIALOGUE[v.id] && (game.state.villagers?.[v.id]?.met || this.S.visit[v.id] || this.S.arrive[v.id]));
  }

  // once a day, in the morning: maybe a neighbour drops by / two of them bicker / a gift delivery
  rollMorning() {
    const game = this.game, st = game.state, S = this.S;
    if (S.rolled === st.day || st.day < 2 || st.hour > 11.5 || game.tutorial?.active) return;
    S.rolled = st.day;
    const fr = this.friends();
    if (!fr.length || Math.random() > 0.55) return;
    const ids = new Set(fr.map((v) => v.id));
    const pairs = BICKER.filter((p) => ids.has(p.a) && ids.has(p.b));
    const fv = (v) => game.villagers.vstate(v).friend || 0;
    const close = fr.filter((v) => fv(v) >= 4);
    const r = Math.random();
    if (pairs.length >= 1 && r < 0.3) { const p = pairs[(Math.random() * pairs.length) | 0]; this.queueEvent({ kind: 'bicker', id: p.a, b: p.b }); }
    else if (close.length && r < 0.55) this.queueEvent({ kind: 'gift', id: close[(Math.random() * close.length) | 0].id });
    else this.queueEvent({ kind: 'visit', id: fr[(Math.random() * fr.length) | 0].id });
  }

  events() {
    const S = this.S;
    if (this.game.state.phase === 'day') this.rollMorning();
    if (!S.events.length || !this.free()) return;
    const e = S.events.shift();
    this.playEvent(e).catch((err) => { console.warn('npc event', err); this.busy = false; });
  }

  async playEvent(e) {
    const game = this.game;
    const v = game.villagers?.get(e.id);
    if (!v || !DIALOGUE[v.id]) return;
    if (!v.rig) game.villagers.revealed(v.zone);
    if (e.kind === 'milestone') await this.milestone(v, e.level);
    else if (e.kind === 'visit' || e.kind === 'gift') await this.pondVisit(v, e.kind === 'gift');
    else if (e.kind === 'bicker') { const w = game.villagers.get(e.b); if (w) await this.bicker(v, w); }
    game.save?.();
  }

  // hand over a gift { coins, wood, food: {id, n} } at world spot p; returns 'a, b and c'
  giveGift(G, p) {
    const game = this.game;
    const parts = [];
    if (!G) return '';
    if (G.coins) { game.earnMisc?.(G.coins, 'gifts'); parts.push(`${G.coins} coins`); }
    if (G.wood) { game.state.wood = (game.state.wood || 0) + G.wood; game.emit?.('wood', game.state.wood); parts.push(`${G.wood} wood`); }
    if (G.food) { try { game.foodStore?.add?.(G.food.id, G.food.n || 1); } catch { /* ignore */ } parts.push(`${G.food.n || 1} ${game.foodStore?.info?.(G.food.id)?.name || G.food.id}`); }
    game.audio.play('coins', { volume: 0.45 });
    try { game.particles.confetti(p.x, p.y + 1.2, p.z, 30); } catch { /* ignore */ }
    try { game.ui?.floatTextAt?.(p.x, p.y + 1.7, p.z, parts.join(' + '), '#fff3a0'); } catch { /* ignore */ }
    return listOf(parts);
  }

  // ---- friendship milestone: at their home
  async milestone(v, level) {
    const game = this.game;
    const D = DIALOGUE[v.id];
    const M = D?.ms?.[level];
    const st = game.villagers.vstate(v);
    if (!M || st.ms?.[level] || !v.rig) return;
    st.ms[level] = 1;
    const title = level >= 10 ? 'Best friends' : level >= 6 ? 'Good friends' : 'Friends';
    await this.stage(v, {
      caption: `${title}: ${v.name}`,
      sub: `Friendship ${level} / 10`,
      lines: [{ t: M.lines[0], anim: 'wave', mood: 'excited' }, ...M.lines.slice(1).map((t, i) => ({ t, anim: i === M.lines.length - 2 ? 'happy' : 'talk' }))],
      fox: { t: level >= 10 ? 'Best friends. And all it took was showing up.' : level >= 6 ? 'I think the neighbours actually like me.' : 'Friendship! Also, free stuff.', mood: level >= 10 ? 'love' : 'happy' },
      end: async (line, anchor, voice) => {
        const what = this.giveGift(M.gift, v);
        game.cutscene.caption(`Gift from ${v.name}`, what);
        game.audio.play('levelup', { volume: 0.4 });
        this.fx(v, 'hearts');
        await line({ t: level >= 10 ? 'Come by anytime. Door\'s always open.' : 'See you soon, neighbour!', anim: 'happy' }, anchor, voice, 'npc' + v.id);
      },
    });
  }

  // a stand-in rig of the neighbour that walks over to your pond (their home rig stays put)
  visitor(v, slot = 0) {
    const game = this.game;
    const Cls = C3[v.cast.cls];
    if (!Cls) return null;
    const g = game.grid;
    const fox = game.fox || { x: g.w / 2, z: g.h / 2 };
    const land = (x, z) => g.inb(Math.floor(x), Math.floor(z)) && !g.isWater(Math.floor(x), Math.floor(z));
    // a dry spot a few tiles in front of (south of) Reynard, side by side for two visitors
    let spot = null;
    for (let r = 2.5; r < 9 && !spot; r += 0.5)
      for (let a = 0; a < 12 && !spot; a++) {
        const ang = (a % 2 ? 1 : -1) * Math.ceil(a / 2) * 0.35;
        const x = fox.x + Math.sin(ang) * r + (slot ? 1.6 : 0), z = fox.z + Math.cos(ang) * r;
        if (land(x, z) && land(x + 0.6, z) && land(x - 0.6, z)) spot = { x, z };
      }
    if (!spot) return null;
    const rig = new Cls();
    const vis = { id: `${v.id}@pond`, name: v.name, zone: v.zone, cast: v.cast, rig, visitor: true, x: spot.x, z: spot.z, y: g.groundAt(spot.x, spot.z), t: 1e9 };
    // walk in from further out
    const from = { x: spot.x + (slot ? 5 : -5), z: spot.z + 3 };
    rig.root.position.set(from.x, g.groundAt(from.x, from.z), from.z);
    rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    game.villagers.group.add(rig.root);
    vis.walk = (to, dur = 1.6) => new Promise((res) => {
      const p0 = rig.root.position.clone();
      const t0 = performance.now();
      rig.root.rotation.y = Math.atan2(to.x - p0.x, to.z - p0.z);
      if (hasAnim(rig, 'walk')) rig.play('walk', { loop: true });
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
        const x = p0.x + (to.x - p0.x) * k, z = p0.z + (to.z - p0.z) * k;
        rig.root.position.set(x, g.groundAt(x, z), z);
        if (k >= 1 || vis.gone) { rig.play('idle', { loop: true }); res(); return; }
        requestAnimationFrame(step);
      };
      step();
    });
    vis.face = () => { rig.root.rotation.y = slot ? -0.5 : 0.5; };
    // the rig needs updating while out of its home slot
    vis.tick = (dt) => rig.update(dt);
    (this.visitors ||= new Set()).add(vis);
    vis.remove = () => { vis.gone = true; this.visitors.delete(vis); rig.root.removeFromParent(); try { rig.dispose(); } catch { /* ignore */ } };
    return vis;
  }

  tickVisitors(dt) { if (this.visitors) for (const v of this.visitors) v.tick(dt); }

  async pondVisit(v, gift) {
    const D = DIALOGUE[v.id];
    const vis = this.visitor(v);
    if (!vis) return;
    const walking = vis.walk({ x: vis.x, z: vis.z }, 1.3).then(() => vis.face());
    const G = gift ? { ...(v.zone.gift?.coins ? { coins: Math.round(v.zone.gift.coins * 0.6) } : {}), ...(D.visit.gift || {}) } : D.visit.gift;
    const lines = gift
      ? [{ t: `Special delivery for ${this.game.state.pondName || 'the pond'}!`, anim: 'wave' }, { t: D.visit.lines[1], anim: 'happy' }]
      : D.visit.lines.map((t, i) => ({ t, anim: i ? 'talk' : 'wave' }));
    try {
      await this.stage(vis, {
        caption: gift ? `A gift from ${v.name}` : `${v.name} drops by`,
        sub: gift ? 'Delivered to your door' : 'Morning visit',
        lines,
        end: async (line, anchor, voice) => {
          await walking;
          const what = this.giveGift(G, vis);
          if (what) this.game.cutscene.caption(gift ? 'Delivered' : `${v.name} left you`, what);
          await line({ t: gift ? 'Enjoy, neighbour!' : 'Well, see you around!', anim: 'happy' }, anchor, voice, 'npc' + vis.id);
        },
      });
    } finally {
      this.game.villagers.talk?.addFriend?.(v, 0.5);
      await vis.walk({ x: vis.x - 6, z: vis.z + 4 }, 1.8);
      vis.remove();
    }
  }

  async bicker(a, b) {
    const P = BICKER.find((p) => p.a === a.id && p.b === b.id);
    if (!P) return;
    const va = this.visitor(a, 0), vb = va && this.visitor(b, 1);
    if (!va || !vb) { va?.remove(); return; }
    const w1 = va.walk({ x: va.x, z: va.z }, 1.2).then(() => va.face());
    const w2 = vb.walk({ x: vb.x, z: vb.z }, 1.4).then(() => vb.face());
    try {
      await this.stage(va, {
        caption: `${a.name} and ${b.name}`,
        sub: 'A friendly argument at your pond',
        focusAt: { x: (va.x + vb.x) / 2, z: (va.z + vb.z) / 2 },
        other: vb,
        lines: [...P.lines.map((L) => (L.by === 'b' ? L : { ...L, by: undefined })), { t: P.fox, fox: true, mood: 'smug' }],
        end: async () => { await Promise.all([w1, w2]); },
      });
    } finally {
      await Promise.all([va.walk({ x: va.x - 6, z: va.z + 4 }, 1.8), vb.walk({ x: vb.x + 6, z: vb.z + 4 }, 1.8)]);
      va.remove(); vb.remove();
    }
  }

  // debug / test hooks
  playEventNow(e) { this.busy = false; return this.playEvent(e); }
  playArrival(id) {
    const v = this.game.villagers.get(id);
    if (!v) return null;
    if (!this.game.zones.isOpen(v.zone.id)) this.game.zones.reveal(v.zone, null, { quiet: true });
    this.game.villagers.revealed(v.zone);
    delete this.S.arrive[id];
    return this.arrival(v);
  }
  playVisit(id) {
    const v = this.game.villagers.get(id);
    if (!v) return false;
    if (!this.game.zones.isOpen(v.zone.id)) this.game.zones.reveal(v.zone, null, { quiet: true });
    this.game.villagers.revealed(v.zone);
    delete this.S.visit[id];
    return this.firstVisit(v);
  }
}

let cssDone = false;
function injectCSS() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
.npcs-fox { position: fixed; left: 16px; bottom: calc(11vh + 14px); z-index: 71; width: 132px; display: flex; flex-direction: column; align-items: center;
  pointer-events: none; opacity: 0; transform: translateY(24px) rotate(-3deg); transition: opacity .25s, transform .35s cubic-bezier(.2,1.5,.4,1); }
.npcs-fox.on { opacity: 1; transform: translateY(0) rotate(-2deg); }
.npcs-fox-pic { width: 120px; height: 120px; background: #fbf3dc; border: 3px solid #2a1a14; box-shadow: 0 4px 0 #2a1a14, inset 0 -6px 0 #e8d8b0; overflow: hidden; position: relative; }
.npcs-fox-pic.flat::after { content: 'R'; position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--font-title); font-size: 64px; color: #c8442a; }
.npcs-fox b { margin-top: -6px; padding: 1px 10px; background: #c8442a; color: #fff4dc; border: 3px solid #2a1a14; font-family: var(--font-title); font-size: 18px; position: relative; }
@media (max-width: 720px) { .npcs-fox { width: 96px; } .npcs-fox-pic { width: 84px; height: 84px; } }
`;
  document.head.appendChild(s);
}
