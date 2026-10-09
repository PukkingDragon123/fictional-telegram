// What Reynard says on the lab computer: short, specific, greedy lines built from
// the live tree state (src/ui/LabTree.js passes itself as `T`).
// T: nodes, sections, st(N), jobs, slots(), coins(), secKey(S), sealed(S), unlocks(d), zoneName(z), fmt(s)
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** why a node is worth researching, in a few words */
export function whyLine(T, N) {
  const d = N.d;
  const gate = T.sections.filter((S) => S.sealed && S.b.key?.node === N.id);
  if (gate.length) return `it's the key to ${gate.map((S) => S.b.name).join(' and ')}`;
  const m = d.mods || {};
  if (m.labSlots) return 'another lab bench. Two schemes at once';
  if (m.researchSpeed) return 'all research runs faster';
  const u = T.unlocks(d);
  const b = u.find((x) => x.kind === 'Build');
  if (d.species) return `new fish: ${u.find((x) => x.fish)?.name || 'eggs'} on e-Buy`;
  if (b) return `we get to build the ${b.name}`;
  if (u.length) return u[0].name.toLowerCase();
  const kids = N.kids.filter((K) => T.st(K) !== 'sealed').map((K) => K.d.name);
  return kids.length ? `it opens ${kids.slice(0, 2).join(' and ')}` : 'pure, profitable knowledge';
}

/** the best thing to research right now (or null) */
export function bestNext(T) {
  let best = null, bs = -1e9;
  for (const N of T.nodes) {
    if (T.st(N) !== 'avail') continue;
    const d = N.d, m = d.mods || {};
    let s = 0;
    if (T.sections.some((S) => S.sealed && S.b.key?.node === N.id)) s += 60;
    if (m.labSlots) s += 70;
    if (m.researchSpeed) s += 45;
    if (d.build) s += 30;
    if (d.species) s += 22;
    s += Math.min(20, N.kids.length * 6);
    s -= Math.min(60, (Number(d.time) || 0) / 6);
    s -= N.S.i * 0.5;
    if (s > bs) { bs = s; best = N; }
  }
  return best;
}

/** a line about node N in state st */
export function nodeLine(T, N, st) {
  const d = N.d;
  if (st === 'done') {
    const u = T.unlocks(d);
    const b = u.find((x) => x.kind === 'Build');
    if (b) return pick([`Ours already. The ${b.name} is in the Build menu.`, `Done and dusted. Go build a ${b.name}!`]);
    if (d.species) return pick(['Already ours. Order the eggs on e-Buy.', 'Researched. Those fish are on e-Buy now.']);
    return pick(['Already researched. My genius is permanent.', 'Done! On to the next scheme.']);
  }
  if (st === 'run') {
    const j = T.job(N);
    const p = T.rushPrice(N.id, 'half'), q = T.rushPrice(N.id, 'now');
    const left = j ? T.fmt(j.left) : '...';
    if (p != null && q != null) return `${left} to go. Rush it: -50% for ${p}, or done now for ${q} coins.`;
    return `${left} to go. Patience, partner. Science is cooking.`;
  }
  if (st === 'avail') {
    if (T.jobs.length >= T.slots()) return `${d.name}: ${whyLine(T, N)}. The bench is busy, though.`;
    return pick([`${d.name}! ${cap(whyLine(T, N))}. Hit RESEARCH, it's free.`, `Ooh, ${d.name}: ${whyLine(T, N)}. Free, just ${T.fmt(T.time(N))}.`]);
  }
  if (st === 'zone') return `We need ${T.zoneName(d.zone)} for this one. Go explore the forest!`;
  if (st === 'locked') {
    const miss = N.req.map((q) => T.byId.get(q)).filter((P) => P && T.st(P) !== 'done');
    if (miss.length) return `Not yet. Research ${miss.slice(0, 2).map((P) => P.d.name).join(' and ')} first.`;
    return 'Locked. Something else comes first.';
  }
  if (st === 'sealed') return sectionLine(T, N.S);
  return '';
}

/** a line about a locked section's key */
export function sectionLine(T, S) {
  const k = T.secKey(S);
  const miss = (k.needs || []).filter((x) => x.kind !== 'coins' && !x.ok);
  if (k.canUnlock) return `${S.b.name} is ready to crack open. ${k.coins ? `${k.coins} coins` : 'Free'}, and it's ours!`;
  if (!miss.length && k.coins) return `${S.b.name} just needs ${k.coins} coins. Go sell some fish!`;
  const parts = miss.map((x) => x.kind === 'node' ? `research ${x.text.replace(/^Research /, '')}` : x.kind === 'zone' ? x.text.replace(/^Meet/, 'meet') : x.text);
  return `${S.b.name} is locked. Key: ${parts.join(', ')}${k.coins ? `, then ${k.coins} coins` : ''}.`;
}

/** what to say when the computer switches on */
export function greeting(T) {
  if (T.jobs.length >= T.slots() && T.jobs.length) {
    const j = T.jobs.reduce((a, b) => (b.left < a.left ? b : a));
    return { line: `${j.n ? j.n.d.name : 'The project'} is cooking: ${T.fmt(j.left)} left. Coins make it go faster. Heh.`, at: j.n };
  }
  const ready = T.sections.find((S) => S.sealed && T.secKey(S).canUnlock);
  if (ready) return { line: `Psst! ${sectionLine(T, ready)}`, sec: ready };
  const N = bestNext(T);
  if (N) return { line: `Bench is free! Try ${N.d.name}: ${whyLine(T, N)}.`, at: N };
  if (T.jobs.length) return { line: 'Everything is cooking. Come back later, partner.', at: T.jobs[0].n };
  return { line: 'Nothing to research right now. Meet the neighbours, then come back.', at: null };
}

export const QUIPS = {
  start: ['On it!', 'SCIENCE!', 'Ooh, a new scheme!', 'To the keyboard!'],
  done: ['EUREKA!', 'IT WORKS!', 'Mwahaha! Done!', 'Genius. As usual.', 'Ka-ching! Research complete.'],
  free: ['Bench free!', 'A bench is free! Pick something.', 'Bench is empty. Feed it science.'],
  rush: ['Ka-ching! Faster!', 'OVERCLOCK!', 'Money well spent. Mostly.'],
  rushnow: ['DONE! Money talks.', 'Instant genius. Expensive genius.'],
  unlock: ['ACCESS GRANTED!', 'New section, new schemes!', 'Cracked it!'],
  poke: ["Don't touch the goggles!", "I'm WORKING here!", 'Hehe, that tickles!', 'Science waits for no fox!', 'Coins make research faster. Just saying.', 'Hi, partner!'],
  wake: ["Wha-?! I wasn't sleeping!", 'Huh?! Science time!', 'Mmf... five more minutes...'],
  idle: ['So much to invent...', 'Pick something, partner.', 'Hmm hmm hmm.', '*sip*'],
  denied: ['Not enough coins. Sell more fish!', 'Denied! We need more coins.'],
};
export { pick };

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
