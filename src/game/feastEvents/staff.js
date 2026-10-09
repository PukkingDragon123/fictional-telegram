// [v26 staff] Beaver staff incidents during the feast (format: ./README.md).
//   staff_break   a tired beaver downs tools and demands a break
//   staff_faint   a worn-out beaver faints from overwork
//   staff_crush   a beaver falls for a customer's fancy tie
const S = (g) => g.staff;
const first = (r) => String(r?.name || 'Beaver').split(' ')[0];

export const EVENTS = [
  {
    id: 'staff_break', name: 'Break Demand', icon: 'staff', kind: 'beaver', weight: 7, ttl: 24, minDay: 2,
    text: (ctx) => `${first(ctx.data.r)} put the tools down. "Fifteen minutes or I walk."`,
    when: (g) => !!S(g)?.pickTired(55),
    pick(g) { const r = S(g)?.pickTired(55); return r?.agent || null; },
    setup(ctx) {
      const r = ctx.data.r = ctx.actor.staff;
      S(ctx.game).hold(r, 'tap_foot');
      ctx.say?.(ctx.actor, 'I need a BREAK.', { mood: 'angry', wait: false });
    },
    async scene(ctx) {
      const st = S(ctx.game), r = ctx.data.r;
      ctx.cam(ctx.actor, { zoom: 0.011, dy: 0.2 });
      st.pose(r, 'tap_foot');
      await ctx.say(ctx.actor, 'Six hours of feast. My paws are numb. My TAIL is numb.', { mood: 'angry' });
      st.pose(r, 'sit');
      await ctx.say(ctx.actor, 'I am sitting down now. Watch me sit.', { mood: 'normal' });
    },
    choices: (ctx) => [
      { id: 'rest', label: 'Take ten', cost: { text: 'a slower feast' }, tone: 'good', hint: 'Energy back, happier' },
      { id: 'coffee', label: 'Coffee + pep talk', cost: { coins: 15 }, tone: 'neutral', hint: 'Back to it, a bit perkier' },
      { id: 'no', label: 'Back to work!', cost: { text: 'mood -15' }, tone: 'bad', hint: 'Might faint later' },
    ],
    expire: 'no',
    async resolve(ctx, id) {
      const st = S(ctx.game), r = ctx.data.r;
      if (!r) return;
      if (id === 'rest') { r.energy = Math.min(100, r.energy + 40); r.mood = Math.min(100, r.mood + 10); st.pose(r, 'sit'); if (!ctx.expired) await ctx.say(ctx.actor, 'Ahh. Bliss.', { mood: 'happy' }); }
      else if (id === 'coffee') { if (ctx.pay(15, ctx.actor)) { r.energy = Math.min(100, r.energy + 25); r.mood = Math.min(100, r.mood + 4); st.pose(r, 'cheer'); if (!ctx.expired) await ctx.say(ctx.actor, 'ZOOM. I can hear colours.', { mood: 'happy' }); } }
      else { r.mood = Math.max(0, r.mood - 15); r.energy = Math.max(0, r.energy - 10); st.pose(r, 'tap_foot'); if (!ctx.expired) await ctx.say(ctx.actor, 'Fine. FINE.', { mood: 'angry' }); }
    },
    cleanup(ctx) { S(ctx.game)?.unhold(ctx.data.r); },
  },
  {
    id: 'staff_faint', name: 'Fainted From Overwork', icon: 'st_hurt', kind: 'beaver', weight: 5, ttl: 30, minDay: 3,
    text: (ctx) => `${first(ctx.data.r)} worked straight through lunch, and dinner, and now the floor.`,
    when: (g) => !!S(g)?.pickTired(30),
    pick(g) { const r = S(g)?.pickTired(30); return r?.agent || null; },
    setup(ctx) {
      const r = ctx.data.r = ctx.actor.staff;
      S(ctx.game).injure(r, 'overwork');
    },
    async scene(ctx) {
      ctx.cam(ctx.actor, { zoom: 0.011 });
      await ctx.wait(0.8);
      ctx.word?.('THUD', ctx.actor, { color: 'red' });
      await ctx.say(ctx.actor, 'So... many... stars...', { mood: 'scared' });
    },
    choices: (ctx) => {
      const cost = ctx.data.r?.hurt?.cost || 150;
      return [
        { id: 'stretcher', label: 'Call the stretcher', cost: { coins: cost }, tone: 'good', hint: 'Back tomorrow' },
        { id: 'water', label: 'Splash of water', cost: { text: 'a coin flip' }, tone: 'neutral', hint: 'Free. Works... sometimes' },
        { id: 'later', label: 'Deal with it later', cost: { text: 'mood' }, tone: 'bad', hint: 'They lie there for now' },
      ];
    },
    expire: 'later',
    async resolve(ctx, id) {
      const st = S(ctx.game), r = ctx.data.r;
      if (!r?.hurt) return;
      if (id === 'stretcher') st.rescue(r);
      else if (id === 'water' && Math.random() < 0.55) {
        r.hurt = null; r.energy = Math.max(r.energy, 35); r.mood = Math.max(0, r.mood - 8); r.bandage = 1;
        ctx.fx?.splash?.(ctx.actor.x, ctx.actor.z, 8, 0.5);
        if (r.agent) r.agent.sx = { st: 'cheer', t: 0 };
        if (!ctx.expired) await ctx.say(ctx.actor, 'I AM AWAKE. Who threw that.', { mood: 'shout' });
      } else if (id === 'water') { ctx.fx?.splash?.(ctx.actor.x, ctx.actor.z, 8, 0.5); if (!ctx.expired) await ctx.say(ctx.actor, 'Five... more... minutes...', { mood: 'scared' }); }
      else r.mood = Math.max(0, r.mood - 10);
    },
  },
  {
    id: 'staff_crush', name: 'A Crush On A Tie', icon: 'staff', kind: 'beaver', weight: 6, ttl: 24, minDay: 2,
    text: (ctx) => `${first(ctx.data.r)} has seen ${ctx.data.bear?.name || 'a bear'}'s silk tie and cannot stop staring.`,
    when: (g) => (S(g)?.list.length || 0) > 0,
    pick(g, f) {
      const b = f.pickBear?.();
      if (!b) return null;
      let best = null, bd = Infinity;
      for (const r of S(g).list) {
        const a = r.agent;
        if (!a || r.hurt || r.train || !a.rig.root.visible || a.sx?.st === 'inside' || a.sx?.st === 'script') continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < bd) { bd = d; best = a; }
      }
      if (best) best._crushBear = b;
      return best;
    },
    setup(ctx) {
      const r = ctx.data.r = ctx.actor.staff;
      ctx.data.bear = ctx.actor._crushBear;
      S(ctx.game).hold(r, 'nervous');
      if (r.rig) r.rig.setExpression?.('love', { hold: 30 });
      ctx.fx?.hearts?.(ctx.actor.x, (ctx.actor.y || 0) + 0.8, ctx.actor.z, 3);
    },
    async scene(ctx) {
      const st = S(ctx.game), r = ctx.data.r, bear = ctx.data.bear;
      ctx.cam(ctx.actor, { zoom: 0.012, dy: 0.15 });
      st.pose(r, 'nervous');
      await ctx.say(ctx.actor, 'That tie. Is it silk? It is SILK.', { mood: 'happy' });
      if (bear) { ctx.cam(bear, { zoom: 0.016 }); await ctx.say(bear, 'This old thing? It is from the office.', { mood: 'normal' }); }
      ctx.cam(ctx.actor, { zoom: 0.012 });
      st.pose(r, 'celebrate');
      await ctx.say(ctx.actor, 'I would chew through a whole dam for that tie.', { mood: 'happy' });
    },
    choices: () => [
      { id: 'gush', label: 'Let them gush', cost: { text: 'a little time' }, tone: 'good', hint: 'Happy beaver, flattered bear' },
      { id: 'buy', label: 'Buy the tie', cost: { coins: 25 }, tone: 'neutral', hint: 'The bear is delighted' },
      { id: 'focus', label: 'Focus!', cost: { text: 'mood -5' }, tone: 'bad' },
    ],
    expire: 'gush',
    async resolve(ctx, id) {
      const r = ctx.data.r, bear = ctx.data.bear;
      if (!r) return;
      if (id === 'gush') { r.mood = Math.min(100, r.mood + 12); if (bear && !ctx.expired) ctx.earn?.(4, bear); }
      else if (id === 'buy') { if (ctx.pay(25, bear || ctx.actor)) { r.mood = Math.min(100, r.mood + 25); if (bear) ctx.review?.(bear, 5, 'A beaver bought my tie. Best dinner of my life.', { weight: 1 }); } }
      else r.mood = Math.max(0, r.mood - 5);
      r.rig?.setExpression?.(null);
    },
    cleanup(ctx) { S(ctx.game)?.unhold(ctx.data.r); },
  },
];
