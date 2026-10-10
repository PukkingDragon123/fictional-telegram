// [v26 tutorial] Reynard's progressive lessons: one new thing at a time, just in
// time. Each lesson
//   when(game, L)   -> true when it should be taught (polled while the day is quiet;
//                      L.flags holds "it happened" marks from game events, L.refs the
//                      fish / building it happened to)
//   beats(game, L)  -> 2-4 short beats { say, at?, mood? }: `at` is what the teacher
//                      runs to and circles: 'tool:x' | 'sel:css' | { fish } | { struct } | { x, z }
//   goal            -> a notebook quest (src/data/lessons.js) started when it ends
//   cls             -> the chalkboard class it unlocks (src/game/lessons/classes.js)
// Every number is the player's own, through src/game/lessons/econ.js.
import {
  fishPrice, bestFish, worstFish, fishLabel, starParts, mutationOdds, pct, liveFish, sizeLabel,
  TIP_4, TIP_5, MUTATIONS, MORPHS,
} from './econ.js';
import { HUT } from '../../world/worldgen.js';
import { daysToNextSeason } from '../seasons/calendar.js';

const B = (s) => `<b>${s}</b>`;
const stars = (n) => `${n} star${n === 1 ? '' : 's'}`;
const sizeTxt = (g) => `${sizeLabel(g.size)} ${g.size.toFixed(2)}`;
const built = (g, fn) => (g.structures?.list || []).find((s) => s.built && !s.removed && s.def && fn(s));
const has = (g, id) => (g.state.research || []).includes(id);
const questActive = (g, id) => (g.state.quests?.active || []).includes(id);
const seasonsOn = (g) => !!g.seasons?.season;

export const LESSONS = [
  // ------------------------------------------------------------------ money
  {
    id: 'l_price', title: 'What a fish is worth', icon: 'coin', cls: 'money101', goal: 'lq_keeper',
    when: (g) => g.state.day >= 2 && liveFish(g).filter((f) => f.adult).length >= 2,
    beats: (g) => {
      const best = bestFish(g, (f) => f.adult), worst = worstFish(g, (f) => f.adult && f !== best);
      if (!best) return null;
      const out = [
        { at: { fish: best }, say: `This ${fishLabel(best)}: ${stars(best.g.stars)}, size ${sizeTxt(best.g)}. A bear pays ${B(fishPrice(g, best) + ' coins')} per bite.`, mood: 'excited' },
      ];
      if (worst && fishPrice(g, worst) < fishPrice(g, best)) out.push({ at: { fish: worst }, say: `This ${fishLabel(worst)}? ${B(fishPrice(g, worst) + ' coins')}. Same pond. Same food. Different ${B('genes')}.`, mood: 'smug' });
      out.push({ say: `Bears pay for ${B('size')}, ${B('colour')} and ${B('mutations')}: Golden x5, Galaxy x8. Stars are just the label.`, mood: 'happy' });
      out.push({ at: 'tool:tag', say: `So: tag your best ${B('DO NOT EAT')} and breed MORE of it. Babies take after their parents!`, mood: 'excited' });
      return out;
    },
  },
  {
    id: 'l_tips', title: 'Happy bears tip', icon: 'star', cls: 'money101', goal: 'lq_side',
    when: (g, L) => L.flags.review && g.state.day >= 2,
    beats: (g) => {
      const r = +(g.state.rating || 0).toFixed(1);
      return [
        { at: 'sel:.hud2-stars', say: `Your rating: ${B(r)}. Every bear rates how ${B('FULL')} it got, and if it got its ${B('side dish')}.`, mood: 'normal' },
        { at: 'sel:.hud2-stars', say: `4 stars: a ${B('+' + TIP_4 * 100 + '%')} tip. 5 stars: ${B('+' + TIP_5 * 100 + '%')}. A Golden fish bumps a review up a star!`, mood: 'excited' },
        { say: `Rating 4.5+ brings ${B('25% more bears')}. Under 2? Only 70%. Full bears today = more bears tomorrow.`, mood: 'smug' },
        { say: `Side dishes: berries, honey, syrup in a ${B('Snack Bowl')}. A wanted one adds up to 12 coins!`, mood: 'happy' },
      ];
    },
  },
  // ------------------------------------------------------------------ genetics
  {
    id: 'l_stars', title: 'Where stars come from', icon: 'star', cls: 'breeding', // [v26 class2] Genetics merged into Smart Breeding
    goal: 'lq_3star',
    when: (g, L) => !!L.flags.hatch2,
    beats: (g, L) => {
      const f = (L.refs.hatch2 && !L.refs.hatch2.dead && L.refs.hatch2) || bestFish(g);
      if (!f) return null;
      const sp = starParts(f.sp.id, f.g);
      const sum = sp.parts.map((p) => (p.k === 'base' ? '1' : `${p.v >= 0 ? '+' : ''}${p.v.toFixed(1)} ${p.label}`)).join(' ');
      return [
        { at: { fish: f }, say: `A ${B(f.g.stars + "-star")} baby! Stars are maths, not magic. Watch:`, mood: 'excited' },
        { at: { fish: f }, say: `${sum} = ${B(sp.stars)}. Size counts x5: 1.2 is a whole star!`, mood: 'think' },
        { say: `Babies get the ${B('average size')} of mum and dad, plus a little. Big x big = big.`, mood: 'happy' },
        { say: `Breed your best with your next best. Go for ${B('3 stars')}!`, mood: 'excited' },
      ];
    },
  },
  {
    id: 'l_mutant', title: 'Mutants', icon: 'sparkle', cls: 'mutations', goal: 'lq_luck',
    when: (g, L) => !!L.flags.mutant || liveFish(g).some((f) => f.g.mut),
    beats: (g, L) => {
      const f = (L.refs.mutant && !L.refs.mutant.dead && L.refs.mutant) || liveFish(g).find((x) => x.g.mut && x.g.mut !== 'tiny') || liveFish(g).find((x) => x.g.mut);
      if (!f) return null;
      const M = MUTATIONS[f.g.mut];
      const o0 = mutationOdds(g), o1 = mutationOdds(g, { nurtured: true }), o3 = mutationOdds(g, { arranged: true, food: 1 });
      return [
        f.g.mut === 'tiny'
          ? { at: { fish: f }, say: `A ${B('Tiny')} mutant. Cute. Worth LESS (x0.9). The good ones go up to ${B('x8')}!`, mood: 'think' }
          : { at: { fish: f }, say: `A ${B(M.name)} mutant! Bears pay ${B('x' + M.value)}: ${B(fishPrice(g, f) + ' coins')} a bite.`, mood: 'excited' },
        { say: `A bred egg mutates ${B(pct(o0.any))} of the time. Pet the parents first: ${B(pct(o1.any))}.`, mood: 'normal' },
        { say: `Matchmaker + ${B('lucky food')} (Royal Pearls, Clovers, Moonberries) in both parents: ${B(pct(o3.any))}!`, mood: 'excited' },
        { say: `And a mutant parent passes it on ${B('30%')} of the time. Don't let a bear eat it!`, mood: 'shout' },
      ];
    },
  },
  {
    id: 'l_select', title: 'Selective breeding', icon: 'heart', cls: 'breeding', goal: 'lq_match',
    when: (g) => g.isOpen?.('match') && g.state.day >= 3,
    beats: (g) => {
      const best = bestFish(g, (f) => f.adult);
      return [
        { at: 'tool:match', say: `My ${B('Matchmaker')}: YOU pick the parents. No more random dates.`, mood: 'excited' },
        { say: `Pick the ${B('biggest, rarest')} pair. Arranged dates count as petted: ${B('x1.6 luck')}, plus a bonus.`, mood: 'normal' },
        best ? { at: { fish: best }, say: `Your best parent right now: this ${fishLabel(best)}, size ${sizeTxt(best.g)}.`, mood: 'happy' } : null,
        { say: `Keep the best baby, tag it, let the bears eat the rest. ${B('Repeat')}. That's how legends are bred.`, mood: 'smug' },
      ].filter(Boolean);
    },
  },
  // ------------------------------------------------------------------ unlocking
  {
    id: 'l_sections', title: 'Sections and keys', icon: 'flask', cls: 'unlocking', goal: 'lq_bench',
    when: (g, L) => !!L.flags.section,
    beats: (g, L) => {
      let next = null;
      try { next = g.researchSections?.().find((k) => k && !k.open); } catch { next = null; }
      const idle = (g.researchJobs?.() || []).length < (g.labSlots?.() || 1);
      return [
        { at: 'tool:lab', say: `${B(L.flags.section)} decrypted! A whole new branch of things to research.`, mood: 'excited' },
        next ? { at: 'tool:lab', say: `Locked sections need a ${B('key')}. Next: ${B(next.name)}: ${next.needs.map((n) => n.text).join(', ')}.`, mood: 'think' } : null,
        { say: `Research is ${B('FREE')}. It only costs time. Rushing costs coins: about half a coin per second left.`, mood: 'normal' },
        idle ? { at: 'tool:lab', say: `And your bench is ${B('idle')}! An idle bench is a lazy bench. Start something.`, mood: 'shout' } : { say: 'Keep the benches busy. Always.', mood: 'smug' },
      ].filter(Boolean);
    },
  },
  // ------------------------------------------------------------------ the feast
  {
    id: 'l_feast', title: 'The feast', icon: 'bear', cls: 'feastClass', goal: 'lq_feast',
    when: (g, L) => !!g.feast && !L.flags.feastDone && g.state.day >= 2 && g.state.hour >= 14 && g.state.hour < 16.4,
    beats: () => [
      { at: 'sel:#clockwrap', say: `At ${B('5 PM')} the feast starts and the camera is ${B('YOURS')}: drag, zoom, spy on customers.`, mood: 'excited' },
      { say: `Little ${B('icons')} pop up over bears and beavers. ${B('Tap')} one, watch, pick a choice.`, mood: 'normal' },
      { say: `Ignore one for about ${B('24 seconds')} and it picks the ${B('WORST')} choice for you. Don't.`, mood: 'shout' },
    ],
  },
  {
    id: 'l_feast2', title: 'Feast report', icon: 'bear',
    when: (g, L) => L.flags.feastEvt && L.flags.feastDone && (g.state.day > (L.flags.feastDay || 0)),
    beats: (g) => {
      const s = g.feast?.st?.stats || {};
      return [
        { say: `Feast events so far: you handled ${B(s.handled || 0)}, ${B(s.expired || 0)} expired.`, mood: (s.expired || 0) > (s.handled || 0) ? 'angry' : 'happy' },
        { say: `Expired ones always pick the worst ending. Good choices save ${B('rating')} or earn ${B('coins')}.`, mood: 'normal' },
      ];
    },
  },
  // ------------------------------------------------------------------ seasons
  {
    id: 'l_weather', title: 'Weather and seasons', icon: 'sun', cls: 'weather',
    when: (g, L) => seasonsOn(g) && g.state.day >= 3 && (L.flags.wx || g.state.day >= 4),
    beats: (g) => {
      const S = g.seasons;
      const m = S.fishMod?.('bluegill') || {};
      const name = S.season[0].toUpperCase() + S.season.slice(1);
      return [
        { at: 'sel:#clockwrap', say: `The clock shows today's ${B('weather')} and ${B("tomorrow's")}. It's ${B(name)}, ${Math.round(S.temp)}°C.`, mood: 'normal' },
        { say: `Seasons change the fish: in ${name.toLowerCase()} sunfish eat x${(m.appetite ?? 1).toFixed(2)} and breed x${(m.breed ?? 1).toFixed(2)}.`, mood: 'think' },
        { say: `Each season lasts ${B('7 days')}. Spring is for love, autumn for eating, winter for... shivering.`, mood: 'happy' },
      ];
    },
  },
  {
    id: 'l_winter', title: 'Winter is coming', icon: 'snowflake', cls: 'weather', goal: 'lq_warm',
    when: (g) => {
      const S = g.seasons;
      if (!S?.season) return false;
      return (S.season === 'autumn' && daysToNextSeason(g.state.day) <= 3) || S.season === 'winter';
    },
    beats: (g) => {
      const warm = !!built(g, (s) => s.def.warm);
      const key = (() => { try { return g.sectionKey?.('weather'); } catch { return null; } })();
      const S = g.seasons;
      try { const t = S.st?.tips; if (t) { t.gear_hint = 1; t.fuel_tip = 1; } } catch { /* ignore */ } // the seasons notes skip what this lesson covers
      return [
        { at: 'sel:#clockwrap', say: S.season === 'winter' ? `${B('Winter')}. Bears feel the cold under about ${B('6°C')}.` : `${B('Winter')} is close. Bears feel the cold under about ${B('6°C')}.`, mood: 'scared' },
        { say: `Cold bears lose patience fast and ${B('go home')}. No full belly, no bill, no tip.`, mood: 'angry' },
        { say: `${B('Fire pits')}, heaters, hot tubs and saunas warm them. A fire burns ${B('1 wood')} each cold day.`, mood: 'normal' },
        warm ? { say: 'You have a warm spot. Build a couple more near the pond.', mood: 'happy' }
          : { at: 'tool:lab', say: key && !key.open ? `Decrypt ${B('Weather Gear')} in the Lab (${key.coins} coins) and build one!` : `Research a ${B('Fire Pit')} or heater and build one!`, mood: 'excited' },
      ];
    },
  },
  // ------------------------------------------------------------------ resort & staff
  {
    id: 'l_staff', title: 'Hiring staff', icon: 'beaver', cls: 'resortStaff', goal: 'lq_hire',
    when: (g) => !!g.staff && (has(g, 'r_st_tent') || !!built(g, (s) => s.type === 'st_tent')),
    beats: (g) => {
      const tent = built(g, (s) => s.type === 'st_tent');
      return [
        tent ? { at: { struct: tent }, say: `The ${B('Interview Tent')}! Beavers wander in looking for work. Tap it to interview them.`, mood: 'excited' }
          : { at: 'tool:build', say: `Place the ${B('Interview Tent')}. Beavers wander in looking for work.`, mood: 'excited' },
        { say: `Skills go ${B('1 to 5')}: build, chop, haul, serve, fab, mine, care. Match the skill to the job.`, mood: 'normal' },
        { say: `A skilled, happy beaver works up to ${B('x2')} faster. They want a ${B('bed')} and ${B('wages')} each morning.`, mood: 'think' },
        { say: `Keep them clear of rampaging bears. A ${B('rescue')} costs a fortune. My fortune.`, mood: 'scared' },
      ];
    },
  },
  {
    id: 'l_resort', title: 'The resort', icon: 'heart', cls: 'resortStaff', goal: 'lq_path',
    when: (g) => !!built(g, (s) => s.def.visit),
    beats: (g) => {
      const s = built(g, (x) => x.def.visit);
      if (!s) return null;
      const v = s.def.visit;
      const need = { warm: 'cold', dry: 'wet', relax: 'tired', clean: 'messy', fun: 'bored', ticket: 'arriving' }[v.need] || 'happy';
      return [
        { at: { struct: s }, say: `Your ${B(s.def.name)}! ${v.pay ? `Each visit pays ${B(v.pay + ' coins')}.` : 'Bears love it.'} ${v.cap ? `${v.cap} at a time.` : ''}`, mood: 'excited' },
        { at: { struct: s }, say: `Bears pick facilities by ${B('need')}: this one is for ${B(need)} bears. Happy visits = better reviews.`, mood: 'normal' },
        { say: `Paint ${B('paths')} to it. Once any path exists, bears stick to them. Off-path they trample flowers.`, mood: 'think' },
      ];
    },
  },
  // ------------------------------------------------------------------ industry
  {
    id: 'l_power', title: 'Power shortage', icon: 'gear', cls: 'industry', goal: 'lq_power',
    when: (g) => {
      const P = g.power;
      if (!P?.status || !P.isConsumer) return false;
      return !!built(g, (s) => { try { return P.isConsumer(s) && ['dark', 'nogrid', 'brown'].includes(P.status(s)); } catch { return false; } });
    },
    beats: (g) => {
      const P = g.power;
      const s = built(g, (x) => { try { return P.isConsumer(x) && ['dark', 'nogrid', 'brown'].includes(P.status(x)); } catch { return false; } });
      if (!s) return null;
      const st = P.status(s), info = P.info?.(s);
      return [
        { at: { struct: s }, say: st === 'brown' ? `This ${s.def.name} is in a ${B('brownout')}: only ${Math.round((info?.ratio || 0) * 100)}% power. Slow!` : `This ${s.def.name} has ${B('no power')}. It just sits there. Like a beaver on Sunday.`, mood: 'angry' },
        { say: `Its grid: supply ${B((info?.supply ?? P.supply()).toFixed(1))}, demand ${B((info?.demand ?? P.demand()).toFixed(1))}. Supply must beat demand.`, mood: 'think' },
        { say: `Solar makes 3 (daytime only), wind 3.5, a water wheel needs a ${B('river')}. ${B('Poles')} reach 4 tiles, link 8.`, mood: 'normal' },
      ];
    },
  },
  {
    id: 'l_storage', title: 'Storage full', icon: 'coins', cls: 'industry', goal: 'lq_store',
    when: (g) => { const S = g.storage; return !!S?.list?.some?.((s) => s.built && !s.removed && !S.isPile?.(s) && S.full?.(s)); },
    beats: (g) => {
      const S = g.storage;
      const s = S.list.find((x) => x.built && !x.removed && !S.isPile?.(x) && S.full?.(x));
      if (!s) return null;
      return [
        { at: { struct: s }, say: `The ${s.def.name} is ${B('FULL')}: ${S.used(s)}/${S.cap(s)}.`, mood: 'scared' },
        { say: `Full storage = machines ${B('stop')} making things. Extra ore spills onto a Supply Pile.`, mood: 'angry' },
        { say: `Build ${B('more storage')} or sell some. Stock you can't store is money you can't make.`, mood: 'normal' },
      ];
    },
  },
  // ------------------------------------------------------------------ home PC, the road south, Old Longneck
  {
    id: 'l_homepc', title: 'The books', icon: 'coin',
    when: (g) => !!g.homePC && g.state.day >= 4,
    beats: () => [
      { at: { x: HUT.x + 1.5, z: HUT.z + 1.5 }, say: `Every evening my ${B('home PC')} graphs the day: bills, tips, costs, bears.`, mood: 'smug' },
      { at: { x: HUT.x + 1.5, z: HUT.z + 1.5 }, say: `Tap my ${B('hut door')} anytime to see them. Watch what makes money... and what eats it.`, mood: 'normal' },
    ],
  },
  {
    id: 'l_expedition', title: 'The road south', icon: 'map',
    when: (g) => !!g.expedition && (questActive(g, 'ln_rumor') || g.sectionOpen?.('expedition') === true && (g.state.sections || []).includes('expedition')),
    beats: (g) => {
      const nx = g.expedition.next?.();
      return [
        { at: 'tool:lab', say: `The ${B('Deepwood Expedition')}: four barriers stand between us and ${B('Mistfall Hollow')}.`, mood: 'excited' },
        { say: `Each needs its research. The bridge and the Fallen Giant also need your ${B('land')} to reach them.`, mood: 'think' },
        nx ? { say: `First up: ${B(nx.name)}. ${nx.hint || ''}`, mood: 'normal' } : null,
      ].filter(Boolean);
    },
  },
  {
    id: 'l_longneck', title: 'The Long Talk', icon: 'heart',
    when: (g) => questActive(g, 'ln_listen'),
    beats: () => [
      { say: `Old Longneck talks... slowly. One talk lasts ${B('3 days')}. Visit him and listen to the end.`, mood: 'whisper' },
      { say: `The reward: ${B('The Old Ways')}. Mutations ${B('2.5x')} as often, forever. Worth every... second.`, mood: 'excited' },
    ],
  },
];

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
// the day-1 classes stay in the book too
export const DAY1_CLASSES = [['pondlife', 'Pond Life 101'], ['builder', 'Builder Beavers'], ['customers', 'Customers = Money']];
void MORPHS;
