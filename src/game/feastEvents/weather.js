// [v26 seasons] Weather incidents during the feast (format: ./README.md).
//   season_blanket    a freezing bear begs for a blanket
//   season_umbrella   the wind steals a bear's umbrella
//   season_lightning  lightning strikes right next to a customer
//   season_melting    a bear melts in the heat wave
import * as THREE from 'three';

const S = (g) => g.seasons;
const raining = (g) => !!S(g)?.info?.precip && S(g).snowShare < 0.6 && S(g).intensity > 0.2;
const warmSpot = (g, b) => {
  let best = null, bd = 30;
  for (const s of S(g)?.warmSpots?.() || []) { const d = Math.hypot(s.x + 0.5 - b.x, s.z + 0.5 - b.z); if (d < bd) { bd = d; best = s; } }
  return best;
};
const seek = (ctx, b, kind) => { try { ctx.game.seasons?.bears?.seek(b, b.wx || {}, kind); } catch { /* ignore */ } };

export const EVENTS = [
  {
    id: 'season_blanket', name: 'Freezing Customer', icon: 'wx_cold', kind: 'customer', weight: 9, ttl: 24, minDay: 2,
    text: 'Teeth chattering like castanets. This bear wants a blanket. Or a refund. Or both.',
    when: (g) => S(g)?.temp < 3,
    pick: (g, feast) => feast.pickBear((b) => (b.cold || 0) > 0.4) || feast.pickBear(),
    async scene(ctx) {
      const b = ctx.bear;
      ctx.hold(b);
      ctx.cam(b, { zoom: 0.013, dy: 0.4 });
      b.cold = Math.max(b.cold || 0, 0.85);
      ctx.sfx('teeth_chatter', { volume: 0.5 });
      await ctx.wait(0.6);
      ctx.sfx('brrr', { volume: 0.45 });
      await ctx.say(b, 'C-c-could I get a b-b-blanket?', { mood: 'scared' });
    },
    choices: (ctx) => [
      { id: 'blanket', label: 'Wrap them in a blanket', cost: { coins: 10 }, tone: 'good', hint: 'Cozy bear, big tip' },
      { id: 'fire', label: warmSpot(ctx.game, ctx.bear) ? 'Point to the fire' : 'Rub your paws, pal', cost: { text: 'free' }, tone: 'neutral' },
      { id: 'tough', label: 'Fur is a blanket', cost: { rating: -0.15 }, tone: 'bad' },
    ],
    expire: 'tough',
    async resolve(ctx, id) {
      const b = ctx.bear;
      if (id === 'blanket' && ctx.pay(10, b)) {
        const shawl = ctx.prop?.('shawl');
        if (shawl) ctx.attach(shawl, b, 'head');
        b.cold = 0.1;
        if (b.wx) { b.wx.warmed = true; b.wx.coldMax = Math.min(b.wx.coldMax, 0.5); }
        ctx.fx.hearts(ctx.at(b).x, ctx.at(b).y, ctx.at(b).z, 3);
        if (!ctx.expired) { ctx.face(b, 'love', 1.5); await ctx.say(b, 'Ooh. Toasty. You are a saint, fox.', { mood: 'happy' }); }
        ctx.earn(6, b);
        ctx.release(b);
        return;
      }
      if (id === 'fire' && warmSpot(ctx.game, b)) {
        ctx.release(b);
        seek(ctx, b, 'warm');
        return;
      }
      if (!ctx.expired) await ctx.say(b, id === 'fire' ? 'Rub my... ok. Still cold.' : 'Fur is NOT a blanket.', { mood: 'angry' });
      ctx.review(b, 2, 'FREEZING. The fox told me my fur is a blanket.');
      ctx.rating(-0.05);
      ctx.release(b);
    },
  },
  {
    id: 'season_umbrella', name: 'Gone With the Wind', icon: 'wx_wind', kind: 'customer', weight: 8, ttl: 22, minDay: 2,
    text: 'A gust snatched a customer\'s umbrella. It is halfway to the office already.',
    when: (g) => raining(g) && S(g).wind > 1.3,
    pick: (g, feast) => feast.pickBear((b) => b.wx?.cover === 'umbrella') || null,
    setup(ctx) {
      // the umbrella flies off into the sky
      const b = ctx.bear, w = b.wx;
      if (!w?.umb) return;
      const u = w.umb;
      const p = u.getWorldPosition(new THREE.Vector3());
      const q = u.getWorldQuaternion(new THREE.Quaternion());
      const sc = u.getWorldScale(new THREE.Vector3());
      u.parent?.remove(u);
      w.umb = null; w.cover = null;
      ctx.game.scene.add(u);
      u.position.copy(p); u.quaternion.copy(q); u.scale.copy(sc);
      ctx.sfx('umbrella_pop', { volume: 0.5 });
      ctx.data.flying = u;
      let t = 0;
      const fly = () => {
        if (!u.parent || t > 6) { u.parent?.remove(u); return; }
        t += 0.016;
        u.position.x += 0.06; u.position.y += 0.03 + Math.sin(t * 5) * 0.02; u.position.z -= 0.025;
        u.rotation.z += 0.12; u.rotation.x += 0.05;
        globalThis.requestAnimationFrame(fly);
      };
      fly();
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.hold(b);
      ctx.cam(b, { zoom: 0.015, dy: 0.5 });
      ctx.word?.('WHOOSH', b, { color: 'blue' });
      ctx.face(b, 'shocked', 1.2);
      await ctx.say(b, 'MY UMBRELLA! It was a gift from my mother!', { mood: 'scared' });
    },
    choices: (ctx) => [
      { id: 'lend', label: 'Lend them Reynard\'s umbrella', cost: { coins: 6 }, tone: 'good', hint: 'Dry bear, happy bear' },
      { id: 'shelter', label: S(ctx.game)?.dryZones?.().length ? 'Point to the shelter' : 'Hold a newspaper', cost: { text: 'free' }, tone: 'neutral' },
      { id: 'laugh', label: 'Laugh. Loudly.', cost: { rating: -0.2 }, tone: 'bad' },
    ],
    expire: 'laugh',
    async resolve(ctx, id) {
      const b = ctx.bear;
      if (id === 'lend' && ctx.pay(6, b)) {
        if (b.wx) { b.wx.cover = 'umbrella'; b.wx.uIdx = 4; b.wx.rain = 0; }
        ctx.sfx('umbrella_pop', { volume: 0.4 });
        if (!ctx.expired) await ctx.say(b, 'A black umbrella. Very villain. I love it.', { mood: 'happy' });
        ctx.earn(4, b);
        ctx.release(b);
        return;
      }
      if (id === 'shelter') {
        if (S(ctx.game)?.dryZones?.().length) { ctx.release(b); seek(ctx, b, 'dry'); return; }
        if (b.wx) b.wx.cover = 'paper';
        ctx.release(b);
        return;
      }
      if (!ctx.expired) { ctx.face(b, 'angry', 1.5); await ctx.say(b, 'Rude. And wet. Mostly wet.', { mood: 'angry' }); }
      if (b.wx) b.wx.rain = 1;
      ctx.review(b, 2, 'Lost my umbrella, the fox laughed. Soggy AND humiliated.');
      ctx.release(b);
    },
  },
  {
    id: 'season_lightning', name: 'Lightning Scare', icon: 'wx_storm', kind: 'customer', weight: 7, ttl: 20, minDay: 2,
    text: 'KA-BOOM. Lightning hit a tree right next to a customer. Their fur is standing straight up.',
    when: (g) => S(g)?.weather === 'storm',
    pick: (g, feast) => feast.pickBear(),
    async scene(ctx) {
      const b = ctx.bear;
      ctx.hold(b);
      ctx.cam(b, { zoom: 0.018, dy: 0.5 });
      await ctx.wait(0.4);
      ctx.game.seasons?.fx?.strike?.(b.x + 1.6, b.z - 1.2);
      ctx.shake(0.6);
      ctx.pose(b, 'stagger');
      ctx.face(b, 'shocked', 2);
      await ctx.wait(0.8);
      ctx.pose(b, null);
      await ctx.say(b, 'THE SKY IS ANGRY AT ME SPECIFICALLY!', { mood: 'scared' });
    },
    choices: (ctx) => [
      { id: 'cocoa', label: 'Free cocoa, on the house', cost: { coins: 8 }, tone: 'good', hint: 'Calm and grateful' },
      { id: 'shelter', label: S(ctx.game)?.dryZones?.().length ? 'Under the shelter, quick' : 'Stand under a tree. Wait, no.', cost: { text: 'free' }, tone: 'neutral' },
      { id: 'insure', label: 'Sell lightning insurance', cost: { rating: -0.2 }, tone: 'bad', hint: '+15 coins, very legal' },
    ],
    expire: 'shelter',
    async resolve(ctx, id) {
      const b = ctx.bear;
      if (id === 'cocoa' && ctx.pay(8, b)) {
        if (!ctx.expired) { ctx.face(b, 'content', 1.5); await ctx.say(b, 'Cocoa. Thunder. Fish. Best night ever.', { mood: 'happy' }); }
        ctx.earn(5, b);
        ctx.release(b);
        return;
      }
      if (id === 'insure') {
        ctx.earn(15, b);
        if (!ctx.expired) await ctx.say(b, 'Wait, what does it cover? Hello?', { mood: 'think' });
        ctx.review(b, 2, 'Bought lightning insurance from a fox. Read the fine print. It is a drawing of a fox.');
        ctx.release(b);
        return;
      }
      ctx.release(b);
      if (S(ctx.game)?.dryZones?.().length) seek(ctx, b, 'dry');
    },
  },
  {
    id: 'season_melting', name: 'Melting Customer', icon: 'wx_hot', kind: 'customer', weight: 8, ttl: 22, minDay: 2,
    text: 'One customer is melting into a puddle of fur and regret.',
    when: (g) => S(g)?.temp > 27,
    pick: (g, feast) => feast.pickBear((b) => (b.hot || 0) > 0.35) || feast.pickBear(),
    async scene(ctx) {
      const b = ctx.bear;
      ctx.hold(b);
      ctx.cam(b, { zoom: 0.013, dy: 0.4 });
      b.hot = Math.max(b.hot || 0, 0.85);
      ctx.pose(b, 'sad');
      await ctx.say(b, 'So... hot... I can taste my own fur...', { mood: 'scared' });
      ctx.pose(b, null);
    },
    choices: () => [
      { id: 'bucket', label: 'A bucket of pond water', cost: { coins: 4 }, tone: 'good', hint: 'Refreshing!' },
      { id: 'pond', label: 'Shove them in the pond', cost: { text: 'free' }, tone: 'neutral', hint: 'Could go either way' },
      { id: 'fan', label: 'Sell them a paper fan', cost: { rating: -0.1 }, tone: 'bad', hint: '+10 coins' },
    ],
    expire: 'fan',
    async resolve(ctx, id) {
      const b = ctx.bear;
      const o = ctx.at(b, 0.5);
      if (id === 'bucket' && ctx.pay(4, b)) {
        for (let i = 0; i < 18; i++) ctx.fx.fx.spawn('drop', o.x + (Math.random() - 0.5) * 0.4, o.y + 1.2, o.z + (Math.random() - 0.5) * 0.4, { vx: (Math.random() - 0.5) * 2, vy: 0.5 + Math.random(), vz: (Math.random() - 0.5) * 2, grav: 9, life: 1, size: 0.08, flags: 1, bright: true });
        ctx.sfx('splash', { volume: 0.5 });
        b.hot = 0; b.wet = 1;
        if (b.wx) b.wx.cooled = true;
        if (!ctx.expired) { ctx.face(b, 'love', 1.5); await ctx.say(b, 'AHHH. Do it again.', { mood: 'happy' }); }
        ctx.earn(5, b);
        ctx.release(b);
        return;
      }
      if (id === 'pond') {
        ctx.word?.('SHOVE', b, { color: 'orange' });
        ctx.release(b, 'decide');
        b.hot = 0;
        if (b.wx) b.wx.cooled = Math.random() < 0.6;
        if (!b.wx?.cooled) ctx.review(b, 2, 'Got shoved in a pond by a fox. Cooler, yes. Dignity, no.');
        return;
      }
      ctx.earn(10, b);
      ctx.review(b, 3, 'Paid 10 coins for a paper fan. It is a folded menu.');
      ctx.release(b);
    },
  },
];
