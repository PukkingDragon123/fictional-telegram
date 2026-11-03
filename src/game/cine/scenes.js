// [v31 cine] Cinematic talk scenes, run by game.director (src/game/cine/Director.js).
// Each scene is async (c) => {...} with the director's toolbox (c.say, c.shot, c.bear, c.title...).
// Quest intros end by starting their quest; outros pay nothing extra (the quest already paid)
// but show the payoff. Words float in the kinetic pixel text: pick the style that sells the line.

// ------------------------------------------------------------------ staging helpers
/** Reynard a step out from his door, the camera on the two-shot: the usual stage for a visitor */
async function atHut(c, { zoom = 0.019 } = {}) {
  const f = c.game.fox;
  const hx = f.home.x, hz = f.home.z + 1.3;
  await c.dip(true);
  c.fox.place(hx, hz, Math.PI);
  c.fox.lookAt(hx - 3, hz);
  c.center(hx - 1.05, hz + 0.1);
  await c.shot([hx - 1.05, hz + 0.1], { zoom, cut: true, yaw: 0 });
  await c.dip(false);
  return { hx, hz };
}
/** a bear walks in from the left of the hut and stops facing Reynard */
async function walkIn(c, type, { name, from = 9, stop = 2.1, run = false, scale } = {}) {
  const f = c.game.fox;
  const b = c.bear(type, { at: [f.x - from, f.z + 0.4], heading: 0, name, scale });
  await b.walkTo(f.x - stop, f.z + 0.1, { run });
  b.lookAt(f.x, f.z);
  c.fox.lookAt(b.x, b.z);
  return b;
}
async function walkOut(c, b, { run = false, dir = -1 } = {}) {
  b.walkTo(b.x + dir * 10, b.z + 0.6, { run });
  await c.beat(run ? 1.1 : 1.6);
}

// ------------------------------------------------------------------ the scenes
export const SCENES = {
  // ================================================================ The Newsletter (intern)
  async intern_in(c) {
    await atHut(c);
    c.caption('A visitor? Hours before the feast?!', { ms: 2200 });
    const b = await walkIn(c, 'intern', { name: 'Kevin', run: true });
    c.fx('dust', b.x, b.y + 0.1, b.z, 4);
    await c.say(b, 'H-hello? Is this... the break room?', { style: 'scared', face: 'shocked' });
    await c.say(c.fox, 'This is a *fish pond*. Owned by a fox. Very exclusive.', { anim: 'polish_monocle' });
    await c.say(b, 'They said follow the smell of snacks...', { style: 'whisper' });
    await c.say(c.fox, 'An early customer. How... *profitable*.', { style: 'think' });
    c.push(0.86, 1.6);
    await c.say(b, 'I\'m Kevin! The intern! I also write the company newsletter!', { style: 'excited', face: 'excited' });
    await c.say(b, 'And fetch coffee. And I AM the newsletter.', { style: 'sad', face: 'sad' });
    await c.say(c.fox, 'Kevin. Write THIS down.', { anim: 'point' });
    await c.say(c.fox, 'FRESH FISH! 5 PM! BRING COINS!', { style: 'shout', anim: 'greedy' });
    await c.say(b, 'Wow. Okay. Front page! If you can feed enough of us...', { style: 'happy', face: 'happy' });
    await walkOut(c, b, { run: true });
    c.game.quests?.start?.('bq_intern');
  },
  async intern_out(c) {
    await atHut(c);
    const b = await walkIn(c, 'intern', { name: 'Kevin', run: true });
    await c.say(b, 'MR. FOX! You made the paper!', { style: 'excited', face: 'excited' });
    await c.say(c.fox, 'The FRONT page?', { style: 'happy', anim: 'greedy' });
    await c.say(b, 'Page six. Under the horoscopes.', { style: 'whisper', face: 'sad' });
    await c.card({ kicker: 'THE BEAR STREET JOURNAL', title: 'FOX POND: FIN-TASTIC!', sub: '"Four paws up." - Kevin, intern', style: 'gold', y: 0.18, ms: 2600 });
    await c.say(c.fox, 'Hmph. Horoscopes are very popular.', { anim: 'shrug' });
    await c.say(b, 'Yours says: "A stranger brings money." That\'s US!', { style: 'laugh', face: 'cheer' });
    c.fx('confetti', c.fox.x, c.fox.headY, c.fox.z, 30);
    c.sfx('fanfare', { volume: 0.4 });
    await walkOut(c, b, { run: true });
  },

  // ================================================================ Bulk Season (gym bro)
  async gym_in(c) {
    await atHut(c);
    const b = await walkIn(c, 'gymbro', { name: 'Chad', run: true });
    c.sfx('footsteps', { volume: 0.4 });
    b.act('cheer', 1.4);
    await c.say(b, 'BRO.', { style: 'shout', face: 'excited' });
    await c.say(c.fox, '...Hello?', { style: 'scared', anim: 'cower' });
    await c.say(b, 'Bro. I need PROTEIN. Like forty grams. Per BITE.', { style: 'excited' });
    await c.say(b, 'Your fish are... how do I say this... *skinny*.', { style: 'whisper', face: 'disgusted' });
    await c.say(c.fox, 'My fish are ELEGANT.', { style: 'angry', anim: 'angry_stomp' });
    await c.say(b, 'Feed \'em, bro. Bulk season. Twenty-five meals. Let\'s GO!', { style: 'shout', face: 'roar' });
    await c.say(c.fox, 'Twenty-five meals is a lot of free food...', { style: 'think' });
    await c.say(c.fox, '...for fish that bears pay me for. FINE.', { anim: 'greedy' });
    await walkOut(c, b, { run: true });
    c.game.quests?.start?.('bq_gym');
  },
  async gym_out(c) {
    await atHut(c);
    const b = await walkIn(c, 'gymbro', { name: 'Chad', run: true });
    await c.say(b, 'Bro... BRO. Look at those fish.', { style: 'whisper', face: 'love' });
    c.push(0.8, 2.4);
    await c.card({ title: 'GAINS!', style: 'shout', y: 0.22, ms: 1800 });
    await c.say(b, 'They\'re SHREDDED. I\'m so proud. I\'m not crying. You\'re crying.', { style: 'sad', face: 'sad' });
    await c.say(c.fox, 'I am absolutely not crying.', { anim: 'facepalm' });
    b.act('cheer', 1.6);
    c.fx('hearts', b.x, b.headY, b.z, 4);
    await c.say(b, 'Here, bro. A lucky clover. For the GAINS.', { style: 'happy', face: 'happy' });
    await walkOut(c, b, { run: true });
  },

  // ================================================================ Bring Your Cub to Work
  async cub_in(c) {
    await atHut(c, { zoom: 0.02 });
    const b = await walkIn(c, 'cub', { name: 'Pip Jr.', run: true, stop: 1.6 });
    b.act('cheer', 1.2);
    await c.say(b, 'IS THAT A REAL FISH POND?!', { style: 'shout', face: 'excited' });
    await c.say(c.fox, 'It is. Where is your parent, small bear?', { anim: 'talk' });
    await c.say(b, 'Bring-Your-Cub-To-Work Day! Dad\'s in a meeting about meetings.', { style: 'happy' });
    await c.say(b, 'Can I name a fish? Can I? Can I? CAN I?', { style: 'excited', face: 'excited' });
    await c.say(c.fox, 'Naming rights are... normally very expensive.', { style: 'think' });
    b.face('sad', 3);
    await c.say(b, '...', { style: 'sad' });
    c.push(0.9, 1.2);
    await c.say(c.fox, 'Oh, don\'t do the eyes. Not the EYES.', { style: 'scared', anim: 'horror' });
    await c.say(c.fox, 'FINE. Three babies. You may name three.', { anim: 'shrug' });
    b.act('cheer', 1.5);
    await c.say(b, 'BEST. DAY. EVER!', { style: 'laugh', face: 'cheer' });
    await walkOut(c, b, { run: true });
    c.game.quests?.start?.('bq_cub');
  },
  async cub_out(c) {
    await atHut(c, { zoom: 0.02 });
    const b = await walkIn(c, 'cub', { name: 'Pip Jr.', run: true, stop: 1.6 });
    await c.say(b, 'I have the NAMES.', { style: 'shout', face: 'excited' });
    await c.say(b, 'Number one: Mister Bubbles.', { style: 'happy' });
    await c.say(b, 'Number two: Sir Splashington the Third.', { style: 'happy' });
    await c.say(b, 'Number three: Steve.', { style: 'whisper' });
    await c.say(c.fox, '...Steve?', { anim: 'think' });
    await c.say(b, 'He LOOKS like a Steve.', { style: 'say', face: 'smug' });
    c.fx('hearts', b.x, b.headY, b.z, 5);
    await c.say(c.fox, 'He does look like a Steve.', { style: 'whisper', anim: 'shrug' });
    await walkOut(c, b, { run: true });
  },

  // ================================================================ Hard to Please (food critic)
  async critic_in(c) {
    await atHut(c);
    const b = await walkIn(c, 'critic', { name: 'Bearington III' });
    b.act('search', 2);
    c.sfx('pen', { volume: 0.4 });
    await c.say(b, 'Hmm. Hmmmm. *sniff*', { style: 'whisper', face: 'disgusted' });
    await c.say(c.fox, 'Welcome, sir, to the finest pond in the...', { anim: 'bow_fancy' });
    await c.say(b, 'Bartholomew Bearington the Third. The Bear Street Journal.', { style: 'say', face: 'smug' });
    await c.say(b, 'I have eaten at four hundred ponds. All of them... *adequate*.', { style: 'sad' });
    c.push(0.86, 2);
    await c.say(b, 'Impress me tonight, fox. Five stars, or I write about your HAT.', { style: 'angry', face: 'angry' });
    await c.say(c.fox, 'Not... the HAT.', { style: 'scared', anim: 'horror' });
    await walkOut(c, b);
    await c.say(c.fox, 'Five stars. Big fish, happy bears, nobody mentions the hat.', { style: 'think', anim: 'idle_scheme' });
    c.game.quests?.start?.('bq_critic');
  },
  async critic_out(c) {
    await atHut(c);
    const b = await walkIn(c, 'critic', { name: 'Bearington III' });
    await c.say(b, 'Fox. I have written my review.', { style: 'say', face: 'neutral' });
    await c.say(c.fox, '*gulp*', { style: 'scared', anim: 'cower' });
    c.sfx('heartbeat', { volume: 0.5 });
    c.push(0.8, 2.2);
    await c.beat(0.6);
    await c.card({ kicker: 'THE BEAR STREET JOURNAL', title: '★★★★★', sub: '"The fox is insufferable. The fish is DIVINE."', style: 'gold', y: 0.18, ms: 3000 });
    await c.say(c.fox, 'FIVE STARS!', { style: 'shout', anim: 'dance' });
    await c.say(b, 'Don\'t let it go to your hat.', { style: 'whisper', face: 'smug' });
    c.fx('confetti', c.fox.x, c.fox.headY, c.fox.z, 40);
    c.sfx('fanfare', { volume: 0.45 });
    await walkOut(c, b);
  },

  // ================================================================ Synergy Monday (big boss)
  async boss_in(c) {
    await atHut(c, { zoom: 0.024 });
    const b = await walkIn(c, 'boss', { name: 'Mr. Grizzwald' });
    await c.say(b, 'Fox! Let\'s touch base. Let\'s circle back. Let\'s take this offline.', { style: 'say', face: 'smug' });
    await c.say(c.fox, 'We are... outside.', { anim: 'shrug' });
    await c.say(b, 'Exactly. Thinking outside the box. Love it.', { style: 'happy', face: 'happy' });
    await c.say(b, 'My team\'s morale is down. I need a WIN. A synergy win.', { style: 'sad' });
    c.push(0.88, 1.5);
    await c.say(b, 'Six happy reviews. Four stars or more. Let\'s ideate!', { style: 'excited', face: 'excited' });
    await c.say(c.fox, 'Does he even know what ideate means?', { style: 'whisper', anim: 'talk' });
    await c.say(b, 'NOBODY knows what ideate means.', { style: 'whisper', face: 'smug' });
    await walkOut(c, b);
    c.game.quests?.start?.('bq_boss');
  },
  async boss_out(c) {
    await atHut(c, { zoom: 0.024 });
    const b = await walkIn(c, 'boss', { name: 'Mr. Grizzwald' });
    b.act('cheer', 1.2);
    await c.say(b, 'Morale is UP! Productivity is UP! Cholesterol is UP!', { style: 'excited', face: 'cheer' });
    await c.card({ kicker: 'QUARTERLY REPORT', title: 'SYNERGY ACHIEVED', style: 'gold', y: 0.2, ms: 2400 });
    await c.say(b, 'Let\'s put a pin in this and call it a partnership.', { style: 'happy' });
    await c.say(c.fox, 'Partnership means you pay me. Right?', { style: 'think', anim: 'count_coins' });
    await c.say(b, 'Let\'s... circle back on that.', { style: 'whisper', face: 'shocked' });
    await walkOut(c, b, { run: true });
  },

  // ================================================================ Grandma's Pie
  async grandma_in(c) {
    await atHut(c);
    const b = await walkIn(c, 'grandma', { name: 'Grandma Ursula' });
    await c.say(b, 'Ooh, look at you. Skin and bones! Are you eating, dearie?', { style: 'happy', face: 'content' });
    await c.say(c.fox, 'I am a fox of refined appetite, madam.', { anim: 'bow' });
    await c.say(b, 'Back in my day, we picked our berries ourselves. Uphill. Both ways.', { style: 'say' });
    await c.say(b, 'In the SNOW.', { style: 'shout', face: 'angry' });
    await c.say(c.fox, 'Berries grow... uphill?', { style: 'scared', anim: 'think' });
    await c.say(b, 'Plant me a blueberry bush and I\'ll bake you my famous pie.', { style: 'happy', face: 'happy' });
    await walkOut(c, b);
    c.game.quests?.start?.('bq_grandma');
  },
  async grandma_out(c) {
    await atHut(c);
    const b = await walkIn(c, 'grandma', { name: 'Grandma Ursula' });
    await c.say(b, 'One blueberry pie. Still warm. Eat it ALL.', { style: 'happy', face: 'content' });
    c.fx('hearts', c.fox.x, c.fox.headY, c.fox.z, 4);
    await c.say(c.fox, '*munch*... Madam. This pie is... a masterpiece.', { style: 'whisper', anim: 'chef_taste' });
    await c.say(b, 'The secret is love. And a stick of butter.', { style: 'say', face: 'smug' });
    await c.say(b, 'Three sticks of butter.', { style: 'whisper' });
    await walkOut(c, b);
  },

  // ================================================================ The Golden Order (the CEO, on the phone)
  async ceo_in(c) {
    const g = c.game, O = c.office;
    await atHut(c);
    c.sfx('alarm', { volume: 0.25, pitch: 1.6 });
    await c.say(c.fox, 'The phone? Nobody calls the pond phone.', { style: 'scared', anim: 'wake_startle' });
    await c.dip(true);
    await c.shot([O.x, O.z + 2], { zoom: 0.028, cut: true, lift: O.h + 4.5 });
    await c.dip(false);
    const tower = c.spot(O.x, O.h + 4, O.z + 2, 'The CEO', '#bfe6ff', 'ceo');
    c.push(0.8, 3);
    await c.say(tower, 'This is the CEO.', { style: 'radio' });
    await c.say(tower, 'I am told your pond has fish. I want GOLDEN fish.', { style: 'radio' });
    await c.say(tower, 'Gold scales. Gold fins. Gold... everything.', { style: 'radio' });
    await c.dip(true);
    await atHut(c, { zoom: 0.02 });
    await c.say(c.fox, 'Golden fish are very rare, sir. Very... *expensive*.', { anim: 'greedy' });
    await c.say(tower, 'Money is no object. Money is MY object.', { style: 'radio' });
    await c.say(c.fox, 'Music to my ears.', { style: 'laugh', anim: 'laugh_evil' });
    await c.say(c.fox, 'Breed well, feed fancy food, pray to the fish gods.', { style: 'think' });
    g.quests?.start?.('bq_ceo');
  },
  async ceo_out(c) {
    await atHut(c, { zoom: 0.02 });
    c.sfx('alarm', { volume: 0.25, pitch: 1.6 });
    const O = c.office;
    const tower = c.spot(O.x, O.h + 4, O.z + 2, 'The CEO', '#bfe6ff', 'ceo');
    await c.say(tower, 'Fox. My scouts have seen it. A golden fish.', { style: 'radio' });
    await c.say(tower, 'Magnificent. Put it on my tab.', { style: 'radio' });
    await c.say(c.fox, 'Your TAB?!', { style: 'shout', anim: 'angry_stomp' });
    await c.say(tower, 'Kidding. The money\'s in the mailbox. Heh. Heh. Heh.', { style: 'radio' });
    c.fx('coins', c.fox.x, c.fox.headY, c.fox.z, 14);
    await c.card({ title: 'FILTHY RICH', style: 'gold', y: 0.2, ms: 2200 });
    await c.say(c.fox, 'I love capitalism.', { style: 'happy', anim: 'count_coins' });
  },

  // ================================================================ talk scenes without a quest
  // two bears sneak down at lunch and gossip about the CEO
  async gossip(c) {
    await atHut(c, { zoom: 0.024 });
    const f = c.game.fox;
    const a = c.bear('office', { at: [f.x - 9, f.z + 1.2], heading: 0, name: 'Brenda' });
    const b = c.bear('accountant', { at: [f.x - 10.5, f.z + 0.2], heading: 0, name: 'Doug' });
    a.walkTo(f.x - 3.2, f.z + 1.1);
    await b.walkTo(f.x - 2.0, f.z + 0.1);
    a.lookAt(b.x, b.z); b.lookAt(a.x, a.z);
    c.fox.lookAt(a.x, a.z);
    await c.say(a, 'Doug. DOUG. Did you hear about the CEO?', { style: 'whisper' });
    await c.say(b, 'The toupee?', { style: 'whisper', face: 'shocked' });
    await c.say(a, 'It\'s a SQUIRREL. A live one. It signs the cheques.', { style: 'whisper', face: 'excited' });
    await c.say(b, 'That explains the acorn budget.', { style: 'whisper', face: 'smug' });
    await c.say(c.fox, 'I can hear you, you know.', { anim: 'talk' });
    a.act('stagger', 0.8); b.act('stagger', 0.8);
    await c.say(a, 'WE WERE NEVER HERE!', { style: 'shout', face: 'shocked' });
    a.walkTo(f.x - 13, f.z + 2, { run: true });
    await walkOut(c, b, { run: true });
    await c.say(c.fox, '...A squirrel. That explains SO much.', { style: 'think' });
  },
  // the janitor finds something in the reeds
  async janitor(c) {
    await atHut(c, { zoom: 0.024 });
    const b = await walkIn(c, 'janitor', { name: 'Mop' });
    await c.say(b, 'Found this in your reeds. Mop found it. I\'m Mop.', { style: 'say' });
    await c.say(c.fox, 'A coin! Kind of you to... return it.', { anim: 'greedy' });
    await c.say(b, 'Mop sees everything, fox. EVERYTHING.', { style: 'spooky', face: 'smug' });
    await c.say(b, 'The bears who skip the line. The bears who don\'t tip...', { style: 'whisper' });
    await c.say(c.fox, 'I like you, Mop.', { style: 'happy', anim: 'laugh_evil' });
    c.give({ coins: 15 });
    c.fx('coins', c.fox.x, c.fox.headY, c.fox.z, 6);
    await walkOut(c, b);
  },
};

// talk scenes that can drop by on a quiet day (no quest): id -> { day, chance }
export const DROP_INS = {
  gossip: { day: 3, chance: 0.35 },
  janitor: { day: 4, chance: 0.3 },
};
