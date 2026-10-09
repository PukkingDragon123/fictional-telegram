// [v26 feast] Bear trouble: choking, fights, thieving eagles, naps, sneezes,
// mud, bees, arm-wrestling. Format + ctx: ./README.md
import { price, chance, spotNear, headingTo, toss, glide, nearestWater, shoreNear, onShore, plainBear, pick } from '../feast/kit.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const partnerOf = (f, a, r = 7) => f.pickBear((x) => x !== a && dist(x, a) < r, { land: true });
// a crew beaver runs up to stand next to a bear
async function crewTo(ctx, b, { carry = null, r = 0.95, speed = 4 } = {}) {
  const c = await ctx.crew({ near: b });
  if (carry) c.carry(carry);
  const p = spotNear(ctx.game, b, r, headingTo(b, c));
  await c.go(p.x, p.z, { speed });
  c.face(b);
  return c;
}

export const EVENTS = [
  // ------------------------------------------------------------ choking on a fish bone
  {
    id: 'choking', name: 'Bone in the Throat', icon: 'fe_bone', kind: 'bear', weight: 9, ttl: 18, minDay: 2,
    text: (ctx) => `${ctx.bear.name} swallowed a fish bone sideways and is turning a funny colour.`,
    pick: (game, f) => f.pickBear(null, { land: true }),
    setup(ctx) {
      const b = ctx.bear;
      ctx.pose(b, 'stagger', { face: 'shocked' });
      ctx.anim((dt, t) => { // gasping fits
        if (ctx.data.free) return false;
        const k = Math.floor(t / 1.15);
        if (k !== ctx.data.k) { ctx.data.k = k; ctx.pose(b, k % 2 ? 'sad' : 'stagger', { face: 'shocked', restart: true }); if (k % 3 === 0) ctx.sfx('feast_cough', { volume: 0.35 }); }
        return true;
      });
      ctx.say(b, 'HKK! Hhkk!', { mood: 'scared', wait: false });
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.faceCam(b);
      ctx.cam(b, { zoom: 0.013 });
      ctx.word('HKK!', b, { color: 'blue' });
      ctx.sfx('feast_cough', { volume: 0.5 });
      await ctx.say(b, 'Bone... sideways... HKK!', { mood: 'scared' });
    },
    choices: (ctx) => [
      { id: 'heimlich', label: 'The Fish-lich maneuver', cost: { text: 'free, needs timing' }, tone: 'good', hint: 'Tap in the green!' },
      { id: 'medic', label: 'Call the medic', cost: { coins: (ctx.data.fee ||= price(ctx.game, 14, 1)) }, tone: 'neutral', hint: 'Safe and sure' },
      { id: 'wait', label: 'It\'ll come out', cost: { rating: -0.2 }, tone: 'bad' },
    ],
    expire: 'wait',
    async resolve(ctx, ch) {
      const b = ctx.bear, game = ctx.game;
      const spit = async (power = 1) => {
        ctx.data.free = true;
        const m = b.rig.mouthPos();
        const bone = ctx.prop('fishbone');
        const a = b.heading, d = 2.2 * power;
        ctx.sfx('feast_ptoo', { volume: 0.6 });
        ctx.word('PTOO!', b, { color: 'gold', size: 3 });
        ctx.pose(b, 'roar', { face: 'gape', restart: true });
        game.rig.shake = Math.max(game.rig.shake, 0.25);
        await toss(ctx, bone, { x: m.x, y: m.y, z: m.z }, { x: b.x + Math.cos(a) * d, y: 0.05, z: b.z + Math.sin(a) * d }, { dur: 0.75, height: 1.6 * power, spin: 14 });
        ctx.sfx('bone_clatter', { volume: 0.4 });
      };
      if (ch === 'heimlich') {
        const c = await crewTo(ctx, b, { r: 0.75 });
        const back = b.heading + Math.PI;
        await c.go(b.x + Math.cos(back) * 0.6, b.z + Math.sin(back) * 0.6, { speed: 3, stopAt: 0.05 });
        c.face(b);
        c.play('carry_log');
        ctx.cam(b, { zoom: 0.012 });
        let ok = -1;
        for (let i = 0; i < 3 && ok < 0; i++) {
          ok = await ctx.timing({ label: i ? 'AGAIN! TAP!' : 'SQUEEZE! TAP!', speed: 1.1 + i * 0.25, zone: 0.24 });
          ctx.sfx('feast_heave', { volume: 0.5 });
          b.rig?.squash(2.2);
          ctx.word(ok >= 0 ? 'HUP!' : 'OOF', c, { color: ok >= 0 ? 'green' : 'red', size: 2 });
          await ctx.wait(0.35);
        }
        await spit(ok >= 0 ? 1 : 0.6);
        c.play('cheer');
        ctx.pose(b, 'cheer', { face: ok >= 0 ? 'cheer' : 'dizzy' });
        await ctx.say(b, ok >= 0 ? 'I can BREATHE! You saved my life!' : 'Ow. My ribs. But... thanks.', { mood: 'happy' });
        if (ok >= 0) { ctx.earn(price(game, 8, 0.6), b); ctx.review(b, 5, 'Nearly choked. A beaver saved me. The trout was great too.'); ctx.sfx('feast_good'); }
        else { ctx.review(b, 3, 'Bone in the throat, bruised ribs. Got out alive. Three stars.'); ctx.sfx('feast_meh'); }
        c.leave();
      } else if (ch === 'medic') {
        ctx.pay(ctx.data.fee, b);
        const c = await crewTo(ctx, b, { carry: ctx.prop('medkit'), speed: 4.6 });
        c.drop();
        c.play('hammer');
        ctx.word('PAT PAT', b, { color: 'white', size: 2 });
        await ctx.wait(0.9);
        await spit(1);
        c.play('wave');
        ctx.pose(b, 'idle', { face: 'happy' });
        await ctx.say(b, 'Phew. Thank you, doc.', { mood: 'happy' });
        ctx.review(b, 4, 'Choked on a bone, medic was there in seconds. Good service.');
        ctx.sfx('feast_good');
        c.leave();
      } else {
        ctx.sfx('feast_cough', { volume: 0.5 });
        await ctx.wait(2.2);
        ctx.sfx('feast_cough', { volume: 0.5, pitch: 1.1 });
        await ctx.wait(1.8);
        await spit(0.8);
        ctx.pose(b, 'sad', { face: 'dizzy' });
        await ctx.say(b, 'Nobody helped. NOBODY.', { mood: 'angry' });
        ctx.review(b, 1, 'I choked and the staff just WATCHED. One star.', { weight: 1.5 });
        ctx.sfx('feast_bad');
      }
      ctx.release(b);
    },
  },

  // ------------------------------------------------------------ two bears, one golden fish
  {
    id: 'golden_fight', name: 'The Last Golden Fish', icon: 'fe_golden', kind: 'bear', weight: 8, ttl: 22, minDay: 3,
    text: (ctx) => `${ctx.bear.name} and ${ctx.data.b2?.name || 'a coworker'} both grabbed the same golden fish. Neither will let go.`,
    pick(game, f) { const a = f.pickBear(null, { land: true }); return a && partnerOf(f, a) ? a : null; },
    setup(ctx) {
      const a = ctx.bear, f = ctx.feast;
      const b2 = (ctx.data.b2 = partnerOf(f, a) || f.pickBear((x) => x !== a, { land: true }));
      ctx.hold(a);
      if (!b2) return;
      ctx.hold(b2);
      const h = headingTo(a, b2);
      const p = { x: a.x + Math.cos(h) * 1.15, z: a.z + Math.sin(h) * 1.15 };
      ctx.walk(b2, p.x, p.z, { speed: 2.4, pose: 'run' }).then(() => { ctx.turn(b2, a); ctx.turn(a, b2); });
      const fish = (ctx.data.fish = ctx.prop('golden_fish'));
      ctx.place(fish, (a.x + p.x) / 2, a.y + 1.0, (a.z + p.z) / 2);
      ctx.pose(a, 'grab', { t01: 0.55, face: 'strain' });
      ctx.pose(b2, 'grab', { t01: 0.55, face: 'strain' });
      ctx.anim((dt, t) => { // tug of war: the fish swings between them
        if (ctx.data.done) return false;
        const k = Math.sin(t * 3.2) * 0.18;
        const mx = (a.x + b2.x) / 2, mz = (a.z + b2.z) / 2, hh = headingTo(a, b2);
        fish.obj.position.set(mx + Math.cos(hh) * k, Math.max(a.y, b2.y) + 1.0, mz + Math.sin(hh) * k);
        fish.obj.rotation.y = -hh;
        return true;
      });
      ctx.say(a, 'MINE!', { mood: 'angry', wait: false });
      ctx.wait(0.9).then(() => ctx.say(b2, 'NO, MINE!', { mood: 'angry', wait: false }));
    },
    async scene(ctx) {
      const a = ctx.bear, b2 = ctx.data.b2;
      ctx.cam(ctx.data.fish, { zoom: 0.014, dy: -0.3 });
      await ctx.say(a, 'I saw it FIRST, Doug!', { mood: 'angry' });
      if (b2) await ctx.say(b2, 'I have SENIORITY!', { mood: 'angry' });
      ctx.word('GRRR', ctx.data.fish, { color: 'red', size: 2 });
      await ctx.wait(0.6);
    },
    choices: (ctx) => {
      const [big, small] = senior(ctx);
      return [
        { id: 'split', label: 'Split it down the middle', cost: { text: 'half a fish each' }, tone: 'good' },
        { id: 'senior', label: `Give it to ${big?.name || 'the elder'}`, cost: { text: `${small?.name || 'the other'} sulks` }, tone: 'neutral' },
        { id: 'fight', label: 'Let them fight', cost: { rating: -0.2, text: 'tips?' }, tone: 'bad', hint: 'The crowd loves it. Risky.' },
      ];
    },
    expire: 'fight',
    async resolve(ctx, ch) {
      const a = ctx.bear, b2 = ctx.data.b2, fish = ctx.data.fish;
      ctx.data.done = true;
      if (!b2) { ctx.release(a); return; }
      if (ch === 'split') {
        ctx.word('CHOP!', fish, { color: 'gold' });
        ctx.sfx('chop', { volume: 0.5 });
        ctx.drop(fish);
        for (const x of [a, b2]) {
          const half = ctx.attach(ctx.prop('golden_fish', { scale: 0.6 }), x, 'hold');
          x.eaten += 0.6; x.gotGolden = true;
          ctx.pose(x, 'eat', { face: 'chomp_open', restart: true });
          ctx.wait(1.3).then(() => ctx.drop(half));
        }
        ctx.sfx('chomp', { volume: 0.5 });
        await ctx.wait(1.5);
        ctx.pose(a, 'yummy', { face: 'yummy' }); ctx.pose(b2, 'yummy', { face: 'yummy' });
        await ctx.say(a, 'Fair is fair.', { mood: 'happy' });
        ctx.review(a, 4, 'Shared a golden fish with Doug. Character building.');
        ctx.review(b2, 4, 'Half a golden fish beats no golden fish.');
        ctx.sfx('feast_good');
      } else if (ch === 'senior') {
        const [big, small] = senior(ctx);
        ctx.drop(fish);
        const g = ctx.attach(ctx.prop('golden_fish'), big, 'hold');
        big.eaten += 1.2; big.gotGolden = true;
        ctx.pose(big, 'eat_gulp', { face: 'gape', restart: true });
        ctx.sfx('gulp', { volume: 0.5 });
        ctx.pose(small, 'sad', { face: 'sad' });
        await ctx.wait(1.6);
        ctx.drop(g);
        ctx.pose(big, 'cheer', { face: 'cheer' });
        ctx.word('GOLD!', big, { color: 'gold' });
        await ctx.say(small, 'Seniority. UGH.', { mood: 'angry' });
        ctx.review(big, 5, 'A GOLDEN fish, and the staff respects seniority. Five stars.');
        ctx.patience(small, -0.3);
        ctx.sfx('feast_meh');
      } else {
        // the fight: a cartoon dust cloud, the crowd cheers and tips
        ctx.drop(fish);
        const mx = (a.x + b2.x) / 2, mz = (a.z + b2.z) / 2;
        ctx.pose(a, 'charge', { face: 'furious' }); ctx.pose(b2, 'charge', { face: 'furious' });
        ctx.sfx('build_cloud', { volume: 0.6 });
        const words = ['POW!', 'BONK!', 'BAM!', 'SMASH!'];
        await ctx.anim((dt, t) => {
          const ang = t * 5;
          for (const [x, o] of [[a, 0], [b2, Math.PI]]) { x.x = mx + Math.cos(ang + o) * 0.6; x.z = mz + Math.sin(ang + o) * 0.6; x.heading = ang + o + Math.PI / 2; }
          if (Math.random() < dt * 9) ctx.fx.buildCloud(mx, Math.max(a.y, 0), mz, 1.6);
          if (Math.random() < dt * 2.2) { ctx.word(pick(words), { x: mx + (Math.random() - 0.5), y: a.y + 1.8, z: mz }, { color: 'red', size: 2 }); ctx.sfx('bonk', { volume: 0.35 }); }
          return t < 3;
        });
        const crowd = ctx.feast.nearBears(mx, mz, 7, (x) => x !== a && x !== b2 && !x.script).slice(0, 3);
        for (const c of crowd) { ctx.game.bears.say(c, pick(['FIGHT! FIGHT!', 'My money\'s on Doug!', 'Ten coins on the big one!']), null, null, 2); ctx.earn(price(ctx.game, 4, 0.3), c); }
        const [win, lose] = Math.random() < 0.5 ? [a, b2] : [b2, a];
        const gf = ctx.attach(ctx.prop('golden_fish'), win, 'hold');
        win.gotGolden = true; win.eaten += 1;
        ctx.pose(win, 'cheer', { face: 'cheer' });
        ctx.pose(lose, 'stagger', { face: 'dizzy', restart: true });
        await ctx.say(win, 'VICTORY! And DINNER!', { mood: 'shout' });
        ctx.drop(gf);
        ctx.review(lose, 1, 'Got beaten up over a fish. Staff did NOTHING.');
        if (chance(0.4)) { ctx.release(lose, 'rampage'); ctx.sfx('roar', { volume: 0.5 }); }
        else ctx.sfx('feast_meh');
      }
      ctx.release(a); ctx.release(b2);
    },
  },

  // ------------------------------------------------------------ the eagle
  {
    id: 'eagle', name: 'Eagle Heist', icon: 'fe_eagle', kind: 'customer', weight: 8, ttl: 22, minDay: 2,
    text: (ctx) => `A bald eagle snatched the fish right out of ${ctx.bear.name}'s paws. It is circling. Smugly.`,
    pick: (game, f) => f.pickBear(null, { land: true }),
    setup(ctx) {
      const b = ctx.bear;
      ctx.pose(b, 'idle', { face: 'happy' });
      const fish = (ctx.data.fish = ctx.attach(ctx.prop('fish'), b, 'hold'));
      const e = (ctx.data.eagle = ctx.prop('eagle'));
      ctx.place(e, b.x - 6, b.y + 7, b.z - 3);
      ctx.sfx('feast_screech', { volume: 0.5 });
      const t0 = ctx.time;
      ctx.anim((dt, t) => {
        const hp = b.rig.holdAnchor.getWorldPosition(e.obj.position.clone());
        if (!ctx.data.grabbed) {
          const u = Math.min(1, t / 1.4);
          const sx = b.x - 6, sy = b.y + 7, sz = b.z - 3;
          e.obj.position.set(sx + (hp.x - sx) * u, sy + (hp.y + 0.2 - sy) * u * u, sz + (hp.z - sz) * u);
          e.obj.rotation.y = Math.atan2(hp.x - sx, hp.z - sz);
          e.flap = 0.3;
          if (u >= 1) {
            ctx.data.grabbed = true;
            ctx.drop(fish);
            const f2 = (ctx.data.fish = ctx.prop('fish'));
            e.claw.add(f2.obj);
            ctx.word('SNATCH!', b, { color: 'red' });
            ctx.pose(b, 'angry_stomp', { face: 'furious' });
            ctx.say(b, 'HEY! THAT\'S MY DINNER!', { mood: 'shout', wait: false });
          }
          return true;
        }
        // circle above, laughing
        const a = (t - 1.4) * 0.9;
        e.flap = 1;
        e.obj.position.set(b.x + Math.cos(a) * 2.6, b.y + 4.5 + Math.sin(t * 2) * 0.3, b.z + Math.sin(a) * 2.6);
        e.obj.rotation.y = -a;
        return !ctx.data.leave;
      });
      void t0;
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.cam(ctx.data.eagle, { zoom: 0.02 });
      ctx.track(ctx.data.eagle, { zoom: 0.02 });
      ctx.sfx('feast_screech', { volume: 0.6 });
      await ctx.wait(1.6);
      ctx.cam(b, { zoom: 0.016, dy: 1 });
      await ctx.say(b, 'Come back here, you feathery thief!', { mood: 'angry' });
    },
    choices: (ctx) => [
      { id: 'replace', label: 'Comp a fresh fish', cost: { coins: (ctx.data.fee ||= price(ctx.game, 9, 0.6)) }, tone: 'good' },
      { id: 'cone', label: 'Throw a pinecone at it', cost: { text: 'a coin flip' }, tone: 'neutral', hint: 'Free. Aim is everything.' },
      { id: 'laugh', label: 'Laugh it off', cost: { rating: -0.15 }, tone: 'bad' },
    ],
    expire: 'laugh',
    async resolve(ctx, ch) {
      const b = ctx.bear, e = ctx.data.eagle;
      const flyOff = () => { ctx.data.leave = true; const p = e.obj.position.clone(); ctx.sfx('feast_screech', { volume: 0.4, pitch: 1.2 }); return glide(ctx, e, { x: p.x + 14, y: p.y + 6, z: p.z - 10 }, { dur: 1.6 }); };
      if (ch === 'replace') {
        ctx.pay(ctx.data.fee, b);
        flyOff();
        const c = await (async () => { const cc = await ctx.crew({ near: b }); cc.carry(ctx.prop('plate', { fish: 'plain' })); const p = spotNear(ctx.game, b, 0.95, headingTo(b, cc)); await cc.go(p.x, p.z, { speed: 4 }); cc.face(b); return cc; })();
        c.drop();
        const f = ctx.attach(ctx.prop('fish'), b, 'hold');
        b.eaten += 0.8;
        ctx.pose(b, 'eat_gulp', { face: 'gape', restart: true });
        ctx.sfx('gulp', { volume: 0.5 });
        await ctx.wait(1.4);
        ctx.drop(f);
        ctx.pose(b, 'yummy', { face: 'yummy' });
        await ctx.say(b, 'Now THAT is service.', { mood: 'happy' });
        ctx.review(b, 4, 'An eagle stole my fish. They replaced it right away. Classy.');
        ctx.sfx('feast_good');
        c.leave();
      } else if (ch === 'cone') {
        const c = await ctx.crew({ near: b });
        const p0 = spotNear(ctx.game, b, 1.4, headingTo(b, c));
        await c.go(p0.x, p0.z, { speed: 4 });
        c.face(e);
        c.play('chop');
        await ctx.wait(0.3);
        const cone = ctx.prop('pinecone');
        const from = { x: c.x, y: c.y + 0.6, z: c.z };
        const at = e.obj.position.clone();
        ctx.sfx('pinecone_throw', { volume: 0.5 });
        ctx.track(cone, { zoom: 0.022 });
        await toss(ctx, cone, from, { x: at.x, y: at.y, z: at.z }, { dur: 0.55, height: 1 });
        if (chance(0.55)) {
          ctx.sfx('bonk', { volume: 0.6 });
          ctx.word('BONK!', e, { color: 'gold' });
          ctx.drop(cone);
          const f = ctx.data.fish; e.claw.remove(f.obj);
          const fp = e.obj.position.clone();
          flyOff();
          await toss(ctx, f, fp, b.rig.holdAnchor.getWorldPosition(fp.clone()), { dur: 0.7, height: 0.6 });
          ctx.attach(f, b, 'hold');
          ctx.cam(b, { zoom: 0.015 });
          ctx.pose(b, 'cheer', { face: 'cheer' });
          c.play('cheer');
          await ctx.say(b, 'BULLSEYE! My fish is BACK!', { mood: 'happy' });
          ctx.earn(price(ctx.game, 6, 0.4), b);
          ctx.review(b, 5, 'A beaver pinecone-sniped an eagle to save my dinner. Legendary.');
          ctx.sfx('feast_good');
        } else {
          // a miss: the cone comes down on somebody's head
          const victim = ctx.feast.nearBears(b.x, b.z, 4, (x) => x !== b && !x.script)[0] || b;
          ctx.cam(victim, { zoom: 0.016 });
          await toss(ctx, cone, cone.obj.position.clone(), ctx.at(victim, 0), { dur: 0.6, height: 0.5 });
          ctx.sfx('bonk', { volume: 0.6 });
          ctx.word('BONK!', victim, { color: 'red' });
          ctx.drop(cone);
          ctx.game.bears.say(victim, 'OW! My HEAD!', 'emo_anger', null, 2);
          flyOff();
          await ctx.say(b, 'Missed. And now Gary is mad too.', { mood: 'angry' });
          ctx.review(b, 2, 'Eagle got my fish, the pinecone got my coworker.');
          ctx.sfx('feast_bad');
        }
        c.leave();
      } else {
        flyOff();
        ctx.pose(b, 'sad', { face: 'sad' });
        await ctx.say(b, 'Great. Just great.', { mood: 'angry' });
        ctx.review(b, 2, 'An eagle took my dinner. The fox LAUGHED.');
        ctx.sfx('feast_meh');
      }
      await ctx.wait(0.6);
      ctx.release(b);
    },
  },

  // ------------------------------------------------------------ the nap
  {
    id: 'nap', name: 'Food Coma', icon: 'fe_sleep', kind: 'bear', weight: 7, ttl: 26, minDay: 2,
    text: (ctx) => `${ctx.bear.name} ate so much that ${ctx.data.bench ? 'they fell asleep on the bench' : 'they fell asleep right on the path'}. The snoring rattles the cattails.`,
    pick: (game, f) => f.pickBear((b) => b.eaten >= b.appetite * 0.5, { land: true }) || f.pickBear(null, { land: true }),
    setup(ctx) {
      const b = ctx.bear;
      const seats = ctx.feast.builtOf(['bench', 'chair', 'hammock', 'rs_bench']).filter((s) => Math.hypot(s.x + 0.5 - b.x, s.z + 0.5 - b.z) < 7);
      const s = (ctx.data.bench = seats[0] || null);
      const go = s ? ctx.walk(b, s.x + 0.5, s.z + 0.5 + 0.6, { speed: 1.2 }) : Promise.resolve();
      ctx.say(b, '*yaaawn*', { wait: false });
      go.then(() => {
        ctx.pose(b, 'sit', { face: 'sleepy' });
        ctx.anim((dt, t) => {
          if (ctx.data.awake) return false;
          if (Math.floor(t / 1.6) !== ctx.data.zk) { ctx.data.zk = Math.floor(t / 1.6); const hp = ctx.at(b, -0.2); ctx.fx.zzz(hp.x, hp.y, hp.z); if (ctx.data.zk % 2 === 0) ctx.sfx('feast_snore', { volume: 0.3 }); }
          return true;
        });
      });
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.cam(b, { zoom: 0.013 });
      ctx.sfx('feast_snore', { volume: 0.6 });
      ctx.word('ZZZ', b, { color: 'blue' });
      await ctx.wait(1.4);
      await ctx.say(b, '...five more minutes, mom...', { mood: 'whisper' });
    },
    choices: () => [
      { id: 'wake', label: 'Wake him up', cost: { text: 'grumpy bear' }, tone: 'neutral', hint: 'He pays and goes' },
      { id: 'snore', label: 'Let him snore', cost: { text: 'blocks the spot' }, tone: 'good', hint: 'Neighbours get impatient' },
    ],
    expire: 'snore',
    async resolve(ctx, ch) {
      const b = ctx.bear;
      if (ch === 'wake') {
        const c = await crewTo(ctx, b, { carry: ctx.prop('bucket'), r: 0.9 });
        c.drop();
        c.play('hammer');
        ctx.sfx('splash', { volume: 0.5 });
        const p = ctx.at(b, -0.5);
        ctx.fx.splash(p.x, p.z, 14, 0.8);
        ctx.data.awake = true;
        ctx.pose(b, 'stagger', { face: 'shocked', restart: true });
        ctx.word('WAH!', b, { color: 'blue' });
        await ctx.wait(0.8);
        ctx.pose(b, 'idle', { face: 'angry' });
        await ctx.say(b, 'I was having the BEST dream. Fine. Check, please.', { mood: 'angry' });
        ctx.review(b, 3, 'Woken up with a bucket of pond water. Three stars, wet ones.');
        ctx.sfx('feast_meh');
        c.leave();
        ctx.release(b, 'pay');
        return;
      }
      // let him snore: a longer nap that outlives the event, the neighbours lose patience
      ctx.data.awake = true;
      for (const n of ctx.feast.nearBears(b.x, b.z, 4, (x) => x !== b)) ctx.patience(n, -0.2);
      ctx.release(b, 'none');
      let t = 14;
      b.state = 'search'; b.searchT = 1;
      b.script = {
        update(bb, dt) {
          t -= dt;
          bb.poseOverride = 'sit';
          bb.rig?.setFace?.('sleepy', { hold: 1 });
          if (Math.random() < dt * 0.6) { const hp = bb.rig?.headTop?.(); if (hp) ctx.game.particles.zzz(hp.x, hp.y, hp.z); }
          if (t > 0 && !bb.removed && ctx.game.state.phase === 'rush') return true;
          bb.poseOverride = null;
          if (!bb.review) { ctx.game.bears.say(bb, 'Best. Nap. EVER.', 'emo_heart', null, 2); }
          return false;
        },
        cancel() { t = 0; },
      };
      ctx.review(b, 5, 'Napped by the pond after dinner. Nobody woke me. Paradise.');
      ctx.sfx('feast_good');
    },
  },

  // ------------------------------------------------------------ sneezing fit
  {
    id: 'sneeze', name: 'Pollen Attack', icon: 'fe_sneeze', kind: 'bear', weight: 7, ttl: 18, minDay: 2,
    text: (ctx) => `${ctx.bear.name} walked through the flowers. The pollen is winning.`,
    when: (game) => game.seasons?.season !== 'winter',
    pick: (game, f) => f.pickBear(null, { land: true }),
    setup(ctx) {
      const b = ctx.bear;
      ctx.pose(b, 'search', { face: 'shocked' });
      ctx.anim((dt) => { if (ctx.data.done) return false; if (Math.random() < dt * 6) { const p = ctx.at(b, -0.6); ctx.fx.sparkle(p.x, p.y, p.z, 1, 0xffe060); } return true; });
      ctx.say(b, 'Ah... ahh...', { mood: 'scared', wait: false });
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.faceCam(b);
      ctx.cam(b, { zoom: 0.012, dy: 0.4 });
      ctx.pose(b, 'stagger', { face: 'shocked', restart: true });
      await ctx.say(b, 'Ahh... AHHH...', { mood: 'scared' });
      ctx.pose(b, 'roar', { t01: 0.2, face: 'gape' });
      await ctx.wait(0.6);
    },
    choices: () => [
      { id: 'tissues', label: 'Hand over tissues', cost: { coins: 3 }, tone: 'good' },
      { id: 'ignore', label: 'Stand well back', cost: { text: 'brace for impact' }, tone: 'bad' },
    ],
    expire: 'ignore',
    async resolve(ctx, ch) {
      const b = ctx.bear, game = ctx.game;
      ctx.data.done = true;
      if (ch === 'tissues') {
        ctx.pay(3, b);
        const t = ctx.attach(ctx.prop('tissues'), b, 'hold');
        ctx.pose(b, 'idle', { face: 'happy' });
        await ctx.wait(0.4);
        ctx.sfx('honk', { volume: 0.5, pitch: 0.7 });
        ctx.word('HONK!', b, { color: 'white' });
        await ctx.wait(0.8);
        ctx.drop(t);
        await ctx.say(b, 'Much better. Bless this pond.', { mood: 'happy' });
        ctx.review(b, 4, 'Pollen nearly killed me, but they had tissues. Nice touch.');
        ctx.sfx('feast_good');
      } else {
        ctx.sfx('feast_achoo', { volume: 0.7 });
        await ctx.wait(0.95);
        ctx.pose(b, 'roar', { face: 'gape', restart: true });
        ctx.word('ACHOO!', b, { color: 'gold', size: 4, life: 1.5 });
        game.rig.shake = Math.max(game.rig.shake, 0.7);
        const p = ctx.at(b, -1.2);
        for (let i = 0; i < 3; i++) ctx.fx.puff(p.x + Math.cos(b.heading) * (0.5 + i * 0.5), p.y, p.z + Math.sin(b.heading) * (0.5 + i * 0.5), 6, 0.4);
        // the gust knocks over the nearest decoration
        const s = game.structures.smashTargets().filter((x) => x.def.category === 'decor' || x.def.category === 'restaurant').sort((u, v) => Math.hypot(u.x - b.x, u.z - b.z) - Math.hypot(v.x - b.x, v.z - b.z))[0];
        if (s && Math.hypot(s.x - b.x, s.z - b.z) < 5) {
          ctx.cam(s, { zoom: 0.016 });
          game.structures.damage(s, 1);
          ctx.word('CRASH!', s, { color: 'red' });
          ctx.sfx('smash', { volume: 0.5 });
          await ctx.wait(1);
        } else {
          const n = ctx.feast.nearBears(b.x, b.z, 4, (x) => x !== b && !x.script)[0];
          if (n) { game.bears.say(n, 'EWWW! I\'m SOAKED!', 'emo_anger', null, 2.2); ctx.patience(n, -0.15); }
        }
        ctx.pose(b, 'idle', { face: 'dizzy' });
        await ctx.say(b, 'Oops. Excuse me.', { mood: 'normal' });
        ctx.review(b, 3, 'Sneezed so hard I broke something. Nobody offered a tissue.');
        ctx.sfx('feast_meh');
      }
      ctx.release(b);
    },
  },

  // ------------------------------------------------------------ stuck in the mud
  {
    id: 'mud', name: 'Stuck in the Mud', icon: 'fe_mud', kind: 'bear', weight: 7, ttl: 24, minDay: 3,
    text: (ctx) => `${ctx.bear.name} stepped into the soft shore mud and is now part of the landscape.`,
    pick: (game, f) => f.pickBear((b) => onShore(game, b), { land: true }),
    setup(ctx) {
      const b = ctx.bear;
      const p = ctx.hold(b);
      p.free = true;
      const gy = b.y;
      ctx.data.mud = ctx.place(ctx.prop('mud'), b.x, gy + 0.02, b.z);
      ctx.sfx('feast_squelch', { volume: 0.4 });
      ctx.pose(b, 'search', { face: 'strain' });
      ctx.anim((dt, t) => {
        if (ctx.data.out) return false;
        b.y = gy - Math.min(0.55, t * 0.25) + Math.sin(t * 9) * 0.03;
        if (Math.random() < dt * 1.2) { ctx.sfx('feast_squelch', { volume: 0.2 }); ctx.fx.debris(b.x, gy + 0.1, b.z, 3, [0x5a3a20, 0x3e2614, 0x7a5432]); }
        return true;
      });
      ctx.say(b, 'Uh. I can\'t move my legs.', { mood: 'scared', wait: false });
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.cam(b, { zoom: 0.014, dy: -0.4 });
      ctx.faceCam(b);
      await ctx.say(b, 'I\'m STUCK! Somebody PULL!', { mood: 'shout' });
    },
    choices: (ctx) => [
      { id: 'push', label: 'Beavers, heave!', cost: { text: 'free, slow' }, tone: 'good' },
      { id: 'tow', label: 'Pay for a tow rope', cost: { coins: (ctx.data.fee ||= price(ctx.game, 16, 0.8)) }, tone: 'neutral', hint: 'Quick and clean' },
      { id: 'wait', label: 'He\'ll wriggle free', cost: { rating: -0.2 }, tone: 'bad' },
    ],
    expire: 'wait',
    async resolve(ctx, ch) {
      const b = ctx.bear, game = ctx.game;
      const popOut = async () => {
        ctx.data.out = true;
        ctx.sfx('feast_squelch', { volume: 0.7 });
        ctx.word('SHLOOP!', b, { color: 'orange', size: 3 });
        game.particles.debris(b.x, b.y + 0.3, b.z, 18, [0x5a3a20, 0x3e2614, 0x7a5432]);
        const p = spotNear(game, b, 1.6);
        const y0 = b.y;
        ctx.pose(b, 'cannonball', { face: 'shocked' });
        await ctx.anim((dt, t) => { const u = Math.min(1, t / 0.7); b.y = y0 + Math.sin(u * Math.PI) * 1.6 + (game.grid.surfaceY(Math.floor(p.x), Math.floor(p.z)) - y0) * u; b.x += (p.x - b.x) * Math.min(1, dt * 3); b.z += (p.z - b.z) * Math.min(1, dt * 3); ctx.pose(b, 'cannonball', { t01: u }); return u < 1; });
        ctx.puppets.get(b).free = false;
        ctx.fx.dust(b.x, b.y, b.z, 6);
        ctx.shake(0.3);
      };
      if (ch === 'push') {
        const c1 = await ctx.crew({ near: b }), c2 = await ctx.crew({ near: b });
        const back = b.heading + Math.PI;
        await Promise.all([c1.go(b.x + Math.cos(back + 0.5) * 0.7, b.z + Math.sin(back + 0.5) * 0.7, { speed: 4 }), c2.go(b.x + Math.cos(back - 0.5) * 0.7, b.z + Math.sin(back - 0.5) * 0.7, { speed: 4 })]);
        c1.face(b); c2.face(b);
        c1.play('plow'); c2.play('plow');
        for (let i = 0; i < 3; i++) { ctx.sfx('feast_heave', { volume: 0.5, pitch: 1 + i * 0.1 }); ctx.word(['HEAVE!', 'HO!', 'HEAVE!'][i], c1, { color: 'green', size: 2 }); b.rig?.squash(1.4); await ctx.wait(0.8); }
        await popOut();
        c1.play('cheer'); c2.play('cheer');
        ctx.pose(b, 'cheer', { face: 'cheer' });
        await ctx.say(b, 'FREE! Thank you, little guys!', { mood: 'happy' });
        ctx.review(b, 4, 'Got stuck in the mud. Two tiny beavers pushed me out. Adorable.');
        ctx.sfx('feast_good');
        c1.leave(); c2.leave();
      } else if (ch === 'tow') {
        ctx.pay(ctx.data.fee, b);
        const c = await ctx.crew({ near: b });
        const p = spotNear(game, b, 3);
        await c.go(p.x, p.z, { speed: 4 });
        c.face(b);
        const rope = ctx.prop('rope', { len: Math.hypot(p.x - b.x, p.z - b.z) });
        ctx.place(rope, c.x, c.y + 0.35, c.z);
        rope.obj.lookAt(b.x, b.y + 0.8, b.z);
        c.play('carry_log');
        ctx.sfx('feast_heave', { volume: 0.5 });
        await ctx.wait(1);
        ctx.drop(rope);
        await popOut();
        ctx.pose(b, 'idle', { face: 'happy' });
        await ctx.say(b, 'Smooth tow. Worth every coin.', { mood: 'happy' });
        ctx.review(b, 4, 'Stuck in mud, towed out in seconds. Professional.');
        ctx.sfx('feast_good');
        c.leave();
      } else {
        await ctx.wait(3.5);
        await popOut();
        ctx.pose(b, 'angry_stomp', { face: 'furious' });
        await ctx.say(b, 'TWENTY MINUTES in the mud! Unbelievable!', { mood: 'angry' });
        ctx.review(b, 1, 'I was stuck in your mud and NOBODY came. One muddy star.', { weight: 1.5 });
        ctx.sfx('feast_bad');
        ctx.release(b, 'leave');
        return;
      }
      ctx.release(b);
    },
    cleanup(ctx) { const p = ctx.puppets.get(ctx.bear); if (p) p.free = false; },
  },

  // ------------------------------------------------------------ bees
  {
    id: 'bees', name: 'Bee Swarm!', icon: 'fe_bee', kind: 'bear', weight: 8, ttl: 16, minDay: 3,
    text: (ctx) => `${ctx.bear.name} went for the honey. The bees went for ${ctx.bear.name}.`,
    when: (game, f) => f.builtOf(['beehive']).length > 0 || game.state.day >= 6,
    pick: (game, f) => f.pickBear(null, { land: true }),
    setup(ctx) {
      const b = ctx.bear;
      const sw = (ctx.data.swarm = ctx.prop('bees', { n: 14 }));
      ctx.place(sw, b.x, b.y + 1.3, b.z);
      ctx.sfx('feast_buzz', { volume: 0.5 });
      const c0 = { x: b.x, z: b.z };
      ctx.data.c0 = c0;
      ctx.anim((dt, t) => {
        if (ctx.data.stop) return false;
        // run around in a panicky little loop
        const a = t * 2.4;
        const px = c0.x + Math.cos(a) * 1.3, pz = c0.z + Math.sin(a) * 1.3;
        const p = ctx.puppets.get(b);
        if (p) { b.x += (px - b.x) * Math.min(1, dt * 4); b.z += (pz - b.z) * Math.min(1, dt * 4); b.heading = a + Math.PI / 2; p.pose = 'run'; }
        sw.obj.position.set(b.x, b.y + 1.5, b.z);
        if (Math.random() < dt * 0.4) ctx.sfx('feast_buzz', { volume: 0.3 });
        return true;
      });
      ctx.pose(b, 'run', { face: 'shocked' });
      ctx.say(b, 'BEES! BEES! BEES!', { mood: 'scared', wait: false });
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.track(b, { zoom: 0.016 });
      ctx.sfx('feast_buzz', { volume: 0.6 });
      await ctx.say(b, 'They\'re in my FUR! Get them OFF!', { mood: 'scared' });
    },
    choices: () => [
      { id: 'water', label: 'Bucket of water!', cost: { coins: 4 }, tone: 'good' },
      { id: 'pond', label: 'Jump in the pond!', cost: { text: 'big splash' }, tone: 'neutral', hint: 'Free. The fish will hate it.' },
    ],
    expire: 'pond',
    async resolve(ctx, ch) {
      const b = ctx.bear, game = ctx.game, sw = ctx.data.swarm;
      const scatter = () => ctx.anim((dt, t) => { sw.r = 0.5 + t * 3; sw.obj.position.y += dt * 1.5; return t < 1.5 && !(sw.dead); }).then(() => ctx.drop(sw));
      if (ch === 'water') {
        ctx.pay(4, b);
        const c = await ctx.crew({ near: b });
        c.carry(ctx.prop('bucket'));
        await c.go(ctx.data.c0.x + 1.8, ctx.data.c0.z, { speed: 4.5 });
        ctx.data.stop = true;
        c.face(b);
        c.play('hammer');
        ctx.sfx('water_blast', { volume: 0.6 });
        ctx.fx.splash(b.x, b.z, 30, 1.3);
        ctx.word('SPLOOSH!', b, { color: 'blue' });
        scatter();
        ctx.pose(b, 'stagger', { face: 'shocked', restart: true });
        await ctx.wait(1.2);
        c.drop();
        ctx.pose(b, 'idle', { face: 'happy' });
        await ctx.say(b, 'Soaked... but bee-free. Thanks.', { mood: 'happy' });
        ctx.review(b, 4, 'Attacked by bees, rescued with a bucket. Damp but grateful.');
        ctx.sfx('feast_good');
        c.leave();
      } else {
        const w = nearestWater(game, b.x, b.z, 10);
        ctx.data.stop = true;
        if (w) {
          const s = shoreNear(game, w.x, w.z, 3) || { x: b.x, z: b.z };
          ctx.track(b, { zoom: 0.02 });
          await ctx.walk(b, s.x, s.z, { speed: 3.4, pose: 'run' });
          sw.obj.position.set(b.x, b.y + 1.5, b.z);
          const p = ctx.puppets.get(b);
          game.bears.startJump(b, w.x, w.z, true);
          if (p) p.free = true;
          await ctx.anim(() => !!b.jump);
          if (p) p.free = false;
          ctx.word('KER-SPLASH!', b, { color: 'blue', size: 3 });
          scatter();
          for (const f of game.fish.list) if (Math.hypot(f.x - b.x, f.z - b.z) < 4) { f.fleeT = 1; f.state = 'flee'; }
          ctx.pose(b, 'swim', { face: 'happy' });
          await ctx.wait(1);
          await ctx.say(b, 'Refreshing, actually!', { mood: 'happy' });
          ctx.review(b, 3, 'Bees chased me into the pond. Weirdly the best part of the night.');
        } else {
          scatter();
          await ctx.say(b, 'They... got bored. Ow.', { mood: 'angry' });
          ctx.review(b, 2, 'Stung eleven times. The honey was good though.');
        }
        ctx.sfx('feast_meh');
      }
      ctx.release(b);
    },
  },

  // ------------------------------------------------------------ arm-wrestling
  {
    id: 'armwrestle', name: 'Arm-Wrestling Showdown', icon: 'fe_arm', kind: 'bear', weight: 6, ttl: 24, minDay: 4,
    text: (ctx) => `${ctx.bear.name} challenged ${ctx.data.b2?.name || 'a coworker'} to arm-wrestle for the last napkin. A crowd is gathering.`,
    pick(game, f) { const a = f.pickBear((b) => b.def.scale >= 0.95, { land: true }); return a && partnerOf(f, a, 8) ? a : null; },
    setup(ctx) {
      const a = ctx.bear;
      const b2 = (ctx.data.b2 = partnerOf(ctx.feast, a, 8));
      ctx.hold(a);
      if (!b2) return;
      ctx.hold(b2);
      const h = headingTo(a, b2);
      const p = { x: a.x + Math.cos(h) * 1.05, z: a.z + Math.sin(h) * 1.05 };
      ctx.walk(b2, p.x, p.z, { speed: 2 }).then(() => { ctx.turn(a, b2); ctx.turn(b2, a); ctx.pose(a, 'grab', { t01: 0.5, face: 'strain' }); ctx.pose(b2, 'grab', { t01: 0.5, face: 'strain' }); });
      ctx.anim((dt, t) => { if (ctx.data.done) return false; for (const x of [a, b2]) if (x.rig) x.rig.squash(Math.sin(t * 13) * 0.08); return true; });
      ctx.say(a, 'You. Me. Right now.', { mood: 'angry', wait: false });
    },
    async scene(ctx) {
      const a = ctx.bear, b2 = ctx.data.b2;
      ctx.cam(a, { zoom: 0.015, dx: b2 ? (b2.x - a.x) / 2 : 0, dz: b2 ? (b2.z - a.z) / 2 : 0, dy: -0.3 });
      ctx.sfx('feast_drumroll', { volume: 0.5 });
      if (b2) await ctx.say(b2, 'Loser buys the next round of trout.', { mood: 'angry' });
      await ctx.say(a, 'Deal. HNNNGH!', { mood: 'shout' });
    },
    choices: (ctx) => [
      { id: 'host', label: 'Host it! Prize pot', cost: { coins: 15 }, tone: 'good', hint: 'The crowd tips the house' },
      { id: 'bet', label: `Bet on ${ctx.bear.name}`, cost: { coins: 20, text: 'win 45?' }, tone: 'neutral' },
      { id: 'stop', label: 'Break it up', cost: { text: 'grumpy bears' }, tone: 'bad' },
    ],
    expire: 'stop',
    async resolve(ctx, ch) {
      const a = ctx.bear, b2 = ctx.data.b2, game = ctx.game;
      if (!b2) { ctx.release(a); return; }
      if (ch === 'stop') {
        ctx.data.done = true;
        ctx.pose(a, 'angry_stomp', { face: 'angry' }); ctx.pose(b2, 'angry_stomp', { face: 'angry' });
        await ctx.say(a, 'Fine. Rematch at the office.', { mood: 'angry' });
        ctx.patience(a, -0.15); ctx.patience(b2, -0.15);
        ctx.sfx('feast_meh');
        ctx.release(a); ctx.release(b2);
        return;
      }
      if (!ctx.pay(ch === 'host' ? 15 : 20, a)) { ctx.data.done = true; ctx.release(a); ctx.release(b2); return; }
      const mx = (a.x + b2.x) / 2, mz = (a.z + b2.z) / 2;
      const jar = ch === 'host' ? ctx.place(ctx.prop('jar'), mx + 0.7, Math.max(a.y, 0), mz + 0.7) : null;
      const crowd = ctx.feast.nearBears(mx, mz, 9, (x) => x !== a && x !== b2 && !x.script).slice(0, 4);
      for (const c of crowd) game.bears.say(c, pick(['GO GO GO!', 'Come on, Brenda!', 'Arms like hams!', 'PUSH!']), 'emo_exclaim', null, 2.4);
      ctx.sfx('feast_drumroll', { volume: 0.6 });
      await ctx.wait(1.8);
      const win = Math.random() < (ch === 'bet' ? 0.5 + (a.def.scale - b2.def.scale) : 0.5) ? a : b2, lose = win === a ? b2 : a;
      ctx.data.done = true;
      ctx.word('SLAM!', lose, { color: 'red', size: 3 });
      ctx.shake(0.5);
      ctx.sfx('smash', { volume: 0.5 });
      ctx.pose(win, 'cheer', { face: 'cheer' });
      ctx.pose(lose, 'sad', { face: 'sad' });
      await ctx.say(win, 'UNDEFEATED!', { mood: 'shout' });
      if (ch === 'host') {
        for (const c of crowd) ctx.earn(price(game, 5, 0.4), c);
        if (jar) { ctx.drop(jar); ctx.attach(ctx.prop('jar'), win, 'hold'); }
        ctx.review(win, 5, 'Won an arm-wrestling prize pot at dinner. What a place.');
        ctx.sfx('feast_good');
      } else if (win === a) {
        ctx.earn(45, a);
        ctx.word('KA-CHING!', a, { color: 'gold' });
        ctx.sfx('feast_good');
      } else {
        ctx.sfx('feast_bad');
        game.notify?.('Lost the bet. Reynard is "not upset". He is VERY upset.', 'warn');
      }
      await ctx.wait(0.8);
      ctx.release(a); ctx.release(b2);
    },
  },
];

function senior(ctx) {
  const a = ctx.bear, b = ctx.data.b2;
  if (!b) return [a, null];
  return (b.def.scale > a.def.scale || (b.def.scale === a.def.scale && b.id < a.id)) ? [b, a] : [a, b];
}
void plainBear;
