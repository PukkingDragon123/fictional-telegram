// [v26 feast] Customer problems: complaints, special guests, celebrations.
// Format + ctx: ./README.md
import { karenify, plainBear, price, chance, spotNear, headingTo } from '../feast/kit.js';

export const EVENTS = [
  // ------------------------------------------------------------ Karen
  {
    id: 'karen', name: 'Karen Wants a Refund', icon: 'fe_karen', kind: 'customer', weight: 10, ttl: 26, minDay: 2,
    text: (ctx) => `${ctx.bear.name} swears her berries are rotten. She wants her money back. Right now.`,
    pick: (game, f) => f.pickBear((b) => plainBear(b) && !b.def.hat, { land: true }) || f.pickBear(plainBear, { land: true }),
    setup(ctx) {
      const b = ctx.bear;
      karenify(ctx, b);
      ctx.pose(b, 'angry_stomp', { face: 'angry' });
      ctx.data.bowl = ctx.attach(ctx.prop('bowl', { rotten: true, scale: 1.7 }), b, 'hold', { z: 0.3, y: -0.12 });
      ctx.say(b, 'Excuse me? EXCUSE ME!', { mood: 'angry', wait: false });
    },
    async scene(ctx) {
      const b = ctx.bear, bowl = ctx.data.bowl;
      ctx.faceCam(b);
      ctx.pose(b, 'angry_stomp', { face: 'furious' });
      await ctx.say(b, 'These berries are ROTTEN! I need a refund!', { mood: 'shout' });
      // the close-up: brown, green, fuzzy berries, flies, stink lines
      ctx.cam(bowl, { zoom: 0.0078, dy: 0.25 });
      ctx.pose(b, 'idle', { face: 'disgusted' });
      ctx.sfx('feast_flies', { volume: 0.6 });
      await ctx.wait(1.4);
      ctx.word('EWW!', bowl, { color: 'green', dy: 0.35 });
      ctx.sfx('feast_flies', { volume: 0.5, pitch: 1.1 });
      await ctx.wait(1.3);
      ctx.cam(b, { zoom: 0.015 });
      ctx.pose(b, 'talk', { face: 'angry' });
      await ctx.say(b, 'And I want to speak to the MANAGER.', { mood: 'angry' });
    },
    choices(ctx) {
      const n = (ctx.data.refund ||= price(ctx.game, 12, 1.5));
      return [
        { id: 'refund', label: 'Refund her', cost: { coins: n }, tone: 'good', hint: 'Money back, peace restored' },
        { id: 'fresh', label: 'Fresh bowl, on the house', cost: { coins: Math.ceil(n / 3) }, tone: 'neutral', hint: 'Cheaper. Will she take it?' },
        { id: 'refuse', label: 'No refunds!', cost: { rating: -0.3 }, tone: 'bad', hint: 'She WILL review this' },
      ];
    },
    expire: 'refuse',
    async resolve(ctx, ch) {
      const b = ctx.bear, bowl = ctx.data.bowl;
      if (ch === 'refund') {
        ctx.pay(ctx.data.refund, b);
        ctx.pose(b, 'grab', { face: 'smug', restart: true });
        ctx.sfx('coins', { volume: 0.5 });
        await ctx.wait(0.7);
        ctx.drop(bowl);
        ctx.pose(b, 'idle', { face: 'smug' });
        await ctx.say(b, 'Hmph. FINALLY. Was that so hard?');
        ctx.review(b, 3, 'Rotten berries, but the refund was quick. Three stars.');
        ctx.sfx('feast_meh');
        ctx.release(b, 'decide');
        return;
      }
      if (ch === 'fresh') {
        ctx.pay(Math.ceil(ctx.data.refund / 3), b);
        const c = await ctx.crew();
        const fresh = ctx.prop('bowl', { rotten: false });
        c.carry(fresh);
        const p = spotNear(ctx.game, b, 0.9, headingTo(b, c));
        ctx.track(c, { zoom: 0.02 });
        await c.go(p.x, p.z, { speed: 4 });
        ctx.cam(b, { zoom: 0.014 });
        c.face(b);
        c.drop();
        ctx.drop(bowl);
        fresh.obj.scale.setScalar(1.7);
        ctx.data.bowl = ctx.attach(fresh, b, 'hold', { z: 0.3, y: -0.12 });
        c.play('wave');
        await ctx.say(c, 'Fresh from the bush, ma\'am!', { voice: 'beaver' });
        ctx.pose(b, 'search', { face: 'disgusted' });
        await ctx.wait(1.2);
        c.leave();
        if (chance(0.55)) {
          ctx.pose(b, 'yummy', { face: 'yummy', restart: true });
          await ctx.say(b, '...Acceptable.');
          ctx.review(b, 4, 'They replaced my rotten berries. Grudging four stars.');
          ctx.sfx('feast_good');
        } else {
          ctx.pose(b, 'angry_stomp', { face: 'angry' });
          await ctx.say(b, 'These are SMALLER than the rotten ones!', { mood: 'angry' });
          ctx.review(b, 2, 'Fresh bowl, tiny berries. Two stars, and I am being generous.');
          ctx.sfx('feast_meh');
        }
        ctx.release(b, 'decide');
        return;
      }
      // no refunds: a one-star review, written live, then she storms off
      ctx.pose(b, 'angry_stomp', { face: 'furious' });
      await ctx.say(b, 'UNBELIEVABLE!', { mood: 'shout' });
      ctx.drop(bowl);
      const pad = ctx.attach(ctx.prop('notepad'), b, 'hand');
      ctx.pose(b, 'talk', { face: 'angry' });
      ctx.sfx('pen', { volume: 0.5 });
      ctx.word('SCRIBBLE', b, { color: 'white', dy: -0.4 });
      await ctx.wait(1.3);
      ctx.drop(pad);
      ctx.review(b, 1, 'ROTTEN berries. RUDE fox. ONE STAR. I will be telling my book club.', { weight: 2.5 });
      ctx.sfx('feast_bad');
      ctx.pose(b, 'angry_stomp', { face: 'furious' });
      await ctx.wait(1.2);
      ctx.release(b, 'leave');
    },
  },
];
