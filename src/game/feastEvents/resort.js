// [v26 resort] Bear Resort breakdowns during the feast (format: ./README.md).
//   resort_tub_leak   the hot tub springs a leak
//   resort_heater     the sauna / hot tub heater conks out
//   resort_clog       Bear Necessities is clogged
//   resort_jam        the ticket booth turnstile jams, the line backs up
//   resort_towels     the towel room runs out of towels
// Closures go through game.resort.close(s, kind) (the CLOSED sign shows, bears grumble)
// and last until the next morning.
const R = (g) => g.resort;
const built = (g, type) => (g.structures?.list || []).filter((s) => s.type === type && s.built && !s.removed && !s._rsEvent);
const any = (g, types) => types.flatMap((t) => built(g, t));
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const userOf = (g, s) => g.resort?.rtOf?.(s)?.users?.[0] || null;
const fix = (ctx) => { ctx.s && (ctx.s._rsEvent = null); };
const shut = (ctx, kind) => { if (ctx.s) ctx.game.resort?.close(ctx.s, kind, true); };

// water spraying out of a structure for `sec` game seconds
async function spray(ctx, sec = 1.4, k = 1) {
  const s = ctx.s, P = ctx.game.particles;
  if (!s?.obj) return;
  const o = s.obj.position;
  const n = Math.round(sec * 12);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28;
    P.fx.spawn('drop', o.x + Math.cos(a) * 0.8, o.y + 0.3, o.z + Math.sin(a) * 0.8, { vx: Math.cos(a) * 2 * k, vy: 2.5 + Math.random() * 2, vz: Math.sin(a) * 2 * k, grav: 9, life: 1.2, size: 0.08, flags: 1, bright: true });
    if (i % 4 === 0) P.splash(o.x + Math.cos(a) * 1.1, o.z + Math.sin(a) * 1.1, 4, 0.4);
    await ctx.wait(sec / n);
  }
}

export const EVENTS = [
  {
    id: 'resort_tub_leak', name: 'The Hot Tub Is Leaking', icon: 'rs_tub', kind: 'facility', weight: 6, ttl: 26, minDay: 3,
    text: 'A stave popped. Warm water is squirting all over the deck, and the customers.',
    when: (g) => built(g, 'rs_hottub').length > 0,
    pick: (g) => rnd(built(g, 'rs_hottub')),
    setup(ctx) { ctx.s._rsEvent = { kind: 'leak' }; spray(ctx, 1, 0.6); },
    async scene(ctx) {
      ctx.cam(ctx.s, { zoom: 0.013, dy: 0.3 });
      spray(ctx, 2.2);
      ctx.sfx('splash', { volume: 0.5 });
      ctx.word?.('SPLOOSH', ctx.s, { color: 'blue' });
      const b = userOf(ctx.game, ctx.s);
      if (b) await ctx.say(b, 'My toes are getting COLD!', { mood: 'scared' });
      else await ctx.wait(1.2);
    },
    choices: () => [
      { id: 'patch', label: 'Patch it properly', cost: { coins: 40 }, tone: 'good', hint: 'Good as new' },
      { id: 'tape', label: 'Duct tape', cost: { coins: 8 }, tone: 'neutral', hint: 'Holds... probably' },
      { id: 'close', label: 'Close it tonight', cost: { text: 'grumpy bears' }, tone: 'bad', hint: 'No soaks till morning' },
    ],
    expire: 'close',
    async resolve(ctx, id) {
      if (id === 'patch' && ctx.pay(40, ctx.s)) { fix(ctx); ctx.fx.sparkle(ctx.at(ctx.s).x, ctx.at(ctx.s).y, ctx.at(ctx.s).z, 10); if (!ctx.expired) ctx.float('Fixed!', ctx.s, '#c8ff9a'); return; }
      if (id === 'tape' && ctx.pay(8, ctx.s)) {
        if (Math.random() < 0.6) { fix(ctx); if (!ctx.expired) ctx.float('It holds!', ctx.s, '#fff3a0'); }
        else { shut(ctx, 'leak'); if (!ctx.expired) { await spray(ctx, 1); ctx.float('It did not hold.', ctx.s, '#ffb0a0'); } }
        return;
      }
      shut(ctx, 'leak');
      for (const b of [...(R(ctx.game)?.rtOf(ctx.s).users || [])]) b.rs && (b.rs.gripes.includes('closed') || b.rs.gripes.push('closed'));
    },
  },
  {
    id: 'resort_heater', name: 'Heater on the Fritz', icon: 'rs_sauna', kind: 'facility', weight: 5, ttl: 26, minDay: 3,
    text: (ctx) => `The ${ctx.s?.def?.name || 'sauna'} heater coughed, sputtered and went cold.`,
    when: (g) => any(g, ['rs_sauna', 'rs_hottub', 'rs_spa']).length > 0,
    pick: (g) => rnd(any(g, ['rs_sauna', 'rs_hottub', 'rs_spa'])),
    setup(ctx) { ctx.s._rsEvent = { kind: 'heater' }; },
    async scene(ctx) {
      ctx.cam(ctx.s, { zoom: 0.013, dy: 0.4 });
      const o = ctx.at(ctx.s, 1.2);
      for (let k = 0; k < 4; k++) { ctx.fx.smoke(o.x, o.y, o.z); await ctx.wait(0.25); }
      ctx.sfx('rs_crack', { volume: 0.4, pitch: 0.6 });
      ctx.word?.('CLUNK', ctx.s, { color: 'grey' });
      const b = userOf(ctx.game, ctx.s);
      if (b) await ctx.say(b, 'Why is the warm thing COLD?', { mood: 'angry' });
      else await ctx.wait(1);
    },
    choices: () => [
      { id: 'repair', label: 'Call the repair beaver', cost: { coins: 35 }, tone: 'good', hint: 'Toasty again' },
      { id: 'plunge', label: 'Sell it as a "cold plunge"', cost: { text: 'half price' }, tone: 'neutral', hint: 'Reynard: it is a FEATURE' },
      { id: 'close', label: 'Close it', cost: { text: 'grumpy bears' }, tone: 'bad' },
    ],
    expire: 'plunge',
    async resolve(ctx, id) {
      if (id === 'repair' && ctx.pay(35, ctx.s)) { fix(ctx); if (!ctx.expired) ctx.float('Warm again!', ctx.s, '#ffd080'); return; }
      if (id === 'plunge') { ctx.s._rsEvent = { kind: 'heater' }; if (!ctx.expired) ctx.float('Cold plunge! Half price!', ctx.s, '#bfe8ff'); return; }
      shut(ctx, 'heater');
    },
  },
  {
    id: 'resort_clog', name: 'Bear Necessities: Clogged', icon: 'rs_restroom', kind: 'facility', weight: 5, ttl: 24, minDay: 2,
    text: 'Someone ate four trout and then visited the restroom. It did not go well.',
    when: (g) => built(g, 'rs_restroom').length > 0,
    pick: (g) => rnd(built(g, 'rs_restroom')),
    setup(ctx) { shut(ctx, 'clog'); },
    async scene(ctx) {
      ctx.cam(ctx.s, { zoom: 0.012, dy: 0.4 });
      ctx.sfx('rs_flush', { volume: 0.5, pitch: 0.6 });
      await ctx.wait(0.6);
      ctx.word?.('GLORP', ctx.s, { color: 'green' });
      const b = ctx.feast?.nearBears?.(ctx.at(ctx.s).x, ctx.at(ctx.s).z, 3)?.[0];
      if (b) await ctx.say(b, 'Out of order?! I NEED it!', { mood: 'scared' });
      else await ctx.wait(1);
    },
    choices: () => [
      { id: 'plumber', label: 'Call a plumber', cost: { coins: 25 }, tone: 'good', hint: 'Flowing again' },
      { id: 'plunger', label: 'Reynard grabs the plunger', cost: { text: 'his dignity' }, tone: 'neutral', hint: 'Free. Works half the time' },
      { id: 'sign', label: 'OUT OF ORDER sign', cost: { text: 'grumpy bears' }, tone: 'bad' },
    ],
    expire: 'sign',
    async resolve(ctx, id) {
      if (id === 'plumber' && ctx.pay(25, ctx.s)) { fix(ctx); if (!ctx.expired) ctx.float('Flushed!', ctx.s, '#c8ff9a'); return; }
      if (id === 'plunger') {
        if (!ctx.expired) ctx.word?.('PLUNK', ctx.s, { color: 'red' });
        if (Math.random() < 0.5) { fix(ctx); if (!ctx.expired) ctx.float('Not in my job description.', ctx.s, '#fff3a0'); }
        else if (!ctx.expired) ctx.float('Still clogged. Ugh.', ctx.s, '#ffb0a0');
      }
    },
  },
  {
    id: 'resort_jam', name: 'The Turnstile Jammed', icon: 'rs_ticket', kind: 'facility', weight: 6, ttl: 22, minDay: 2,
    text: 'The ticket turnstile is stuck and the line of hungry bears is getting long.',
    when: (g) => built(g, 'rs_ticket').length > 0,
    pick: (g) => rnd(built(g, 'rs_ticket')),
    setup(ctx) { ctx.s._rsEvent = { kind: 'jam', closed: true }; },
    async scene(ctx) {
      ctx.cam(ctx.s, { zoom: 0.012, dy: 0.3 });
      ctx.sfx('rs_crack', { volume: 0.4, pitch: 1.4 });
      ctx.word?.('CLANK', ctx.s, { color: 'grey' });
      const q = R(ctx.game)?.rtOf(ctx.s)?.queue?.[0];
      if (q) await ctx.say(q, 'It won\'t turn! I PAID!', { mood: 'angry' });
      else await ctx.wait(1);
    },
    choices: () => [
      { id: 'fix', label: 'Oil it', cost: { coins: 15 }, tone: 'good', hint: 'Smooth as butter' },
      { id: 'kick', label: 'Kick it', cost: { text: 'a coin flip' }, tone: 'neutral', hint: 'Reynard\'s classic repair' },
      { id: 'wave', label: 'Wave them through', cost: { text: 'free entry tonight' }, tone: 'bad' },
    ],
    expire: 'wave',
    async resolve(ctx, id) {
      if (id === 'fix' && ctx.pay(15, ctx.s)) { fix(ctx); if (!ctx.expired) ctx.float('Click-clack!', ctx.s, '#c8ff9a'); return; }
      if (id === 'kick') {
        if (!ctx.expired) { ctx.word?.('BONK', ctx.s, { color: 'red' }); ctx.shake(0.3); }
        if (Math.random() < 0.55) { fix(ctx); if (!ctx.expired) ctx.float('It spins!', ctx.s, '#fff3a0'); return; }
      }
      shut(ctx, 'jam');
      if (!ctx.expired) ctx.float('Free entry tonight...', ctx.s, '#ffb0a0');
    },
  },
  {
    id: 'resort_towels', name: 'Out of Towels', icon: 'rs_towel', kind: 'facility', weight: 4, ttl: 24, minDay: 3,
    text: 'The towel shelves are bare and a queue of dripping bears is forming.',
    when: (g) => built(g, 'rs_towels').length > 0,
    pick: (g) => rnd(built(g, 'rs_towels')),
    setup(ctx) { shut(ctx, 'towels'); },
    async scene(ctx) {
      ctx.cam(ctx.s, { zoom: 0.012, dy: 0.3 });
      const b = ctx.feast?.nearBears?.(ctx.at(ctx.s).x, ctx.at(ctx.s).z, 4)?.[0];
      if (b) await ctx.say(b, 'I am DRIPPING here.', { mood: 'angry' });
      else await ctx.wait(1);
    },
    choices: () => [
      { id: 'buy', label: 'Rush order of towels', cost: { coins: 30 }, tone: 'good', hint: 'Fluffy again' },
      { id: 'curtains', label: 'Use the hut curtains', cost: { text: 'Reynard sulks' }, tone: 'neutral', hint: 'Free, slightly velvet' },
      { id: 'drip', label: 'Let them drip', cost: { text: 'soggy reviews' }, tone: 'bad' },
    ],
    expire: 'drip',
    async resolve(ctx, id) {
      if (id === 'buy' && ctx.pay(30, ctx.s)) { fix(ctx); if (!ctx.expired) ctx.float('Fresh towels!', ctx.s, '#c8ff9a'); return; }
      if (id === 'curtains') { fix(ctx); if (!ctx.expired) ctx.float('My good curtains...', ctx.s, '#fff3a0'); }
    },
  },
];
