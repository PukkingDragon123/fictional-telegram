// [v26 feast] Restaurant equipment acting up during the feast (the resort's own
// facilities break down in ./resort.js). Format + ctx: ./README.md
import { price, chance, spotNear, headingTo, pick } from '../feast/kit.js';

async function crewAt(ctx, s, { carry = null } = {}) {
  const c = await ctx.crew({ near: s });
  if (carry) c.carry(carry);
  const p = spotNear(ctx.game, { x: s.x + 0.5, z: s.z + 0.5 }, 1.1, headingTo({ x: s.x, z: s.z }, c));
  await c.go(p.x, p.z, { speed: 4.5 });
  c.face({ x: s.x + 0.5, z: s.z + 0.5 });
  return c;
}
const grumble = (ctx, s, lines) => {
  for (const b of ctx.feast.nearBears(s.x + 0.5, s.z + 0.5, 6, (x) => !x.script).slice(0, 2)) ctx.game.bears.say(b, pick(lines), 'emo_anger', null, 2.2);
};

export const EVENTS = [
  // ------------------------------------------------------------ BBQ flare-up
  {
    id: 'grill_fire', name: 'Grill Flare-Up', icon: 'fe_fire', kind: 'facility', weight: 7, ttl: 20, minDay: 3,
    text: 'Somebody dripped honey on the BBQ. The flames are now taller than the bears.',
    when: (game, f) => f.builtOf(['bbq']).length > 0,
    pick: (game, f) => pick(f.builtOf(['bbq'])),
    setup(ctx) {
      const s = ctx.s;
      const by = ctx.game.structures.baseY(s);
      ctx.data.fire = ctx.place(ctx.prop('flames', { n: 6, size: 0.42, spread: 0.5 }), s.x + 0.5, by + 0.55, s.z + 0.5);
      ctx.sfx('feast_sizzle', { volume: 0.45 });
      ctx.anim((dt) => { if (ctx.data.out) return false; if (Math.random() < dt * 4) ctx.fx.smoke(s.x + 0.5, by + 1.2, s.z + 0.5); if (Math.random() < dt * 0.5) ctx.sfx('feast_sizzle', { volume: 0.25 }); return true; });
      grumble(ctx, s, ['FIRE! Is that normal?!', 'My eyebrows!', 'Smells like burnt honey!']);
    },
    async scene(ctx) {
      ctx.cam(ctx.s, { zoom: 0.014 });
      ctx.word('FWOOSH!', ctx.data.fire, { color: 'red', size: 3, dy: 0.6 });
      ctx.sfx('feast_sizzle', { volume: 0.6 });
      await ctx.wait(1.6);
    },
    choices: () => [
      { id: 'ext', label: 'Fire extinguisher!', cost: { coins: 12 }, tone: 'good' },
      { id: 'mallow', label: 'Marshmallow party!', cost: { text: 'the grill suffers' }, tone: 'neutral', hint: 'Bears love it. The grill, less.' },
      { id: 'burn', label: 'It\'ll burn out', cost: { text: 'grill damage' }, tone: 'bad' },
    ],
    expire: 'burn',
    async resolve(ctx, ch) {
      const s = ctx.s, game = ctx.game, fire = ctx.data.fire;
      const dim = (to, dur) => ctx.anim((dt, t) => { fire.level += (to - fire.level) * Math.min(1, dt * 3); return t < dur; });
      if (ch === 'ext') {
        ctx.pay(12, s);
        const c = await crewAt(ctx, s, { carry: ctx.prop('extinguisher') });
        c.play('hammer');
        ctx.sfx('water_blast', { volume: 0.6 });
        await ctx.anim((dt, t) => { if (Math.random() < dt * 14) ctx.fx.puff(s.x + 0.5 + (Math.random() - 0.5) * 0.6, game.structures.baseY(s) + 0.6, s.z + 0.5 + (Math.random() - 0.5) * 0.6, 3, 0.3); fire.level = Math.max(0, 1 - t / 1.4); return t < 1.6; });
        ctx.data.out = true;
        ctx.word('FSSSH', s, { color: 'white' });
        c.play('cheer');
        await ctx.say(c, 'Fire\'s out! Grill\'s fine!', { voice: 'beaver' });
        ctx.sfx('feast_good');
        c.leave();
      } else if (ch === 'mallow') {
        dim(0.6, 1);
        const near = ctx.feast.nearBears(s.x + 0.5, s.z + 0.5, 7, (x) => !x.script).slice(0, 3);
        for (const b of near) { game.bears.say(b, pick(['MARSHMALLOWS!', 'Toasty!', 'Golden brown, perfect!']), 'emo_heart', null, 2.4); ctx.earn(price(game, 4, 0.3), b); }
        ctx.sfx('bear_cheer', { volume: 0.4 });
        await ctx.wait(2);
        game.structures.damage(s, 1);
        await dim(0, 1.2);
        ctx.data.out = true;
        ctx.sfx('feast_meh');
      } else {
        await ctx.wait(2);
        game.structures.damage(s, 2);
        ctx.word('CRACK!', s, { color: 'red' });
        ctx.sfx('smash', { volume: 0.5 });
        grumble(ctx, s, ['Who runs this place?!', 'That was a NICE grill.']);
        for (const b of ctx.feast.nearBears(s.x + 0.5, s.z + 0.5, 5)) ctx.patience(b, -0.15);
        await dim(0, 1.5);
        ctx.data.out = true;
        ctx.sfx('feast_bad');
      }
    },
  },

  // ------------------------------------------------------------ jukebox stuck on one song
  {
    id: 'jukebox', name: 'The Jukebox Is Stuck', icon: 'fe_jukebox', kind: 'facility', weight: 6, ttl: 22, minDay: 3,
    text: 'The jukebox has played "Salmon Serenade" eleven times in a row. The skip is right at the good part.',
    when: (game, f) => f.builtOf(['jukebox']).length > 0,
    pick: (game, f) => pick(f.builtOf(['jukebox'])),
    setup(ctx) {
      const s = ctx.s;
      const notes = (ctx.data.notes = ctx.place(ctx.prop('notes'), s.x + 0.5, ctx.game.structures.baseY(s) + 1.2, s.z + 0.5));
      notes.glitch = 1;
      ctx.anim((dt, t) => { if (ctx.data.fixed) return false; if (Math.floor(t / 1.3) !== ctx.data.k) { ctx.data.k = Math.floor(t / 1.3); ctx.sfx('feast_scratch', { volume: 0.3 }); } return true; });
      grumble(ctx, ctx.s, ['THIS SONG AGAIN?!', 'Make it STOP!', 'I know all the words now. ALL of them.']);
    },
    async scene(ctx) {
      ctx.cam(ctx.s, { zoom: 0.013 });
      ctx.sfx('feast_scratch', { volume: 0.6 });
      ctx.word('SKRRT', ctx.s, { color: 'pink', size: 3 });
      await ctx.wait(1.5);
    },
    choices: () => [
      { id: 'repair', label: 'Call the repair beaver', cost: { coins: 15 }, tone: 'good', hint: 'Bears dance and tip' },
      { id: 'kick', label: 'Give it a good kick', cost: { text: 'a coin flip' }, tone: 'neutral' },
      { id: 'unplug', label: 'Unplug it', cost: { text: 'silence' }, tone: 'bad' },
    ],
    expire: 'unplug',
    async resolve(ctx, ch) {
      const s = ctx.s, game = ctx.game, notes = ctx.data.notes;
      const party = async () => {
        ctx.data.fixed = true; notes.glitch = 0;
        ctx.sfx('feast_good');
        for (const b of ctx.feast.nearBears(s.x + 0.5, s.z + 0.5, 8, (x) => !x.script).slice(0, 3)) { game.bears.say(b, pick(['MY JAM!', 'Now we\'re talking!', 'Dance break!']), 'emo_music', null, 2.2); ctx.earn(price(game, 3, 0.3), b); }
        await ctx.wait(1.4);
      };
      if (ch === 'repair') {
        ctx.pay(15, s);
        const c = await crewAt(ctx, s);
        c.hand(ctx.prop('wrench'));
        c.play('hammer');
        ctx.sfx('hammer', { volume: 0.5 });
        await ctx.wait(1.6);
        c.play('cheer');
        await party();
        c.leave();
      } else if (ch === 'kick') {
        const c = await crewAt(ctx, s);
        c.play('plow');
        ctx.word('KICK!', s, { color: 'orange' });
        ctx.sfx('bonk', { volume: 0.6 });
        ctx.shake(0.2);
        await ctx.wait(0.6);
        if (chance(0.55)) { c.play('cheer'); await party(); }
        else { ctx.data.fixed = true; ctx.drop(notes); game.structures.damage(s, 1); ctx.word('CLUNK', s, { color: 'red' }); ctx.sfx('feast_bad'); grumble(ctx, s, ['You BROKE it!', 'Now there is no music at all.']); await ctx.wait(1); }
        c.leave();
      } else {
        ctx.data.fixed = true;
        ctx.drop(notes);
        ctx.sfx('feast_meh');
        grumble(ctx, s, ['Too quiet now.', 'At least it stopped.']);
        for (const b of ctx.feast.nearBears(s.x + 0.5, s.z + 0.5, 6)) ctx.patience(b, -0.1);
        await ctx.wait(1);
      }
    },
  },
];
