// [v32 dig] Professor Ambrose Snapp: an old alligator snapping turtle, paleontologist,
// a hundred and forty years old and grumpy about every one of them. Obsessed with
// fossils. Has a pink worm-shaped lure on his tongue called Gerald, which wiggles
// at fish whether he likes it or not ("Gerald, NOT NOW."). Calls everything young.
// Secretly delighted you showed up.
//
// SNAPP: lines for his scenes (src/game/dig/scenes.js), barks, the dig and the bench.
// Side effect: DIALOGUE.snapp (his chat card topics, NpcDialogue). No emoji.
import { DIALOGUE } from './npcDialogue.js';

export const SNAPP = {
  name: 'Prof. Snapp',
  full: 'Professor Ambrose Snapp',
  title: 'Grumpy paleontologist',
  // yard mutters (near him, now and then)
  idle: ['Hm. Jurassic. Obviously.', 'Gerald, NOT NOW.', 'Brush. Don\'t bash.', 'Kids today. Only four hundred million years of history and they skim it.', 'That rock owes me an answer.', 'Nnngh. My knees are Pleistocene.', 'Where did I put my trowel. I am holding my trowel.'],
  // when you tap a dig site he is near
  siteHints: ['Careful! Brush near the bone, pick the hard stuff.', 'Slowly. It waited a hundred million years. It can wait for you.', 'If you crack it I will know. I will FEEL it.'],
  // after a dig: by condition
  dug: {
    perfect: ['Not a scratch. ...Fine. That was good. Don\'t let it go to your head.', 'MINT. Do you know how rare that is? I do. I wrote it down.'],
    good: ['Good. A little scuffed, like me.', 'Acceptable. Bring it to the bench.'],
    chipped: ['You chipped it. I heard it. From here.', 'It\'s fine. It\'s FINE. It has character now.'],
    broken: ['...In pieces. I have glue. I always have glue.', 'You dug it up with your face, didn\'t you.'],
  },
  bench: ['Let\'s see what you dragged in.', 'Under the lamp. Gently.', 'Clean it like you mean it.'],
  sold: ['Selling history. For COINS. ...Fair price, though.', 'Into the museum gift shop it goes.'],
  shown: ['Ooh. On the shelf. Next to my good jaw.', 'The public will love it. The public is idiots, but they will love it.'],
  vial: ['Amber. Bone dust. A dash of something I will NOT discuss.', 'Shake it. No, gently. NO, GENTLY.'],
  // the vial's work: Snapp on seeing a prehistoric fish
  ancient: ['Look at it. LOOK at it. A hundred and forty years I waited.', 'It has its grandmother\'s teeth. Its great-great-great... very great grandmother.', 'I need to sit down. I am sitting down. I need to sit down MORE.'],
  // morning ticket money from the museum: {n} finds on display, {c} coins
  tickets: ['Museum tickets: {c} coins. {n} finds on display. Somebody touched the glass.', 'The museum made {c} coins. A cub licked the ammonite. Again.'],
  newSite: ['New dig site spotted: {s}. Go. GO. Bring a brush.', 'Snapp\'s map has a new X on it: {s}. "Probably bones. Possibly snacks."'],
  // bears and their prehistoric fish
  bears: ['IS THAT A DINOSAUR FISH?!', 'That fish has TEETH teeth.', 'Mom said there\'d be fish. She did NOT say prehistoric.', 'I\'m not eating that. ...I\'m eating that.', 'It looked at me. It looked at me like it knew my ancestors.', 'Five stars. It bit me. Six stars.', 'Is this... farm to table, but the farm is the Devonian?'],
  bearReview: 'A DINOSAUR FISH?! ',
};

// ------------------------------------------------------------------ chat card (NpcDialogue)
DIALOGUE.snapp = {
  topics: {
    about: {
      label: 'About you',
      lines: ['Professor Ambrose Snapp. Paleontology, palaeobotany, grumbling.', 'Hundred and forty years old. Young, by the standards of my work.'],
      choices: [
        { t: 'A hundred and forty?!', r: ['Snapping turtles live a long time. Mostly out of spite.'], f: 1, anim: 'grumble' },
        { t: 'Why are you so grumpy?', r: ['I am not grumpy. I am PRECISE.', '...And my knees hurt.'], mood: 'tsk' },
        { t: 'Nice helmet.', r: ['Pith helmet. 1902. Survived three expeditions and a goose.', 'Here. Found this in the brim.'], coins: 20, unlock: 'gerald' },
      ],
    },
    home: {
      label: 'The Bluff',
      lines: ['Fern Brook cut this bank open. Four hundred million years in one wall.', 'Read it bottom to top. Sea. Swamp. Forest. Ice. Fox.'],
      choices: [
        { t: 'What are the stripes?', r: ['Strata. Layers. Each one a few thousand years of mud.', 'The dark one is coal. The shiny one is my lunch.'], f: 1, anim: 'loupe' },
        { t: 'Can I see your lab?', r: ['The hut. Wipe your paws. Don\'t lick anything.'], anim: 'point' },
      ],
    },
    tips: {
      label: 'Tips',
      lines: ['Pick the hard rock. Brush near the bone. Never pick a bone. NEVER.', 'Amber shines through the dirt if you squint. Squint more.', 'Bring finds to my bench. Clean them, then sell, show or keep.'],
    },
    gossip: {
      label: 'Gossip',
      lines: ['Old Longneck once borrowed my trowel. In 1931. Still waiting.', 'Flint licks his rocks. Amateur. I only lick the important ones.'],
      choices: [
        { t: 'You lick rocks too?', r: ['Wet bone sticks to your tongue. Rock doesn\'t. It\'s SCIENCE.'], f: 1, anim: 'snap' },
        { t: 'Want me to get the trowel back?', r: ['No. ...Yes. ...No. It\'s a matter of principle now.'], mood: 'smug' },
      ],
    },
    gerald: {
      label: 'Gerald', hidden: true,
      lines: ['The worm on my tongue is a lure. His name is Gerald.', 'Snapping turtles open their mouths and fish swim right in. Gerald does the wiggling.'],
      choices: [
        { t: 'Can I pet Gerald?', r: ['NO. ...He liked that you asked.'], f: 1, anim: 'lure' },
        { t: 'Does Gerald have opinions?', r: ['Gerald thinks the Devonian was overrated.', 'Gerald is wrong.'], anim: 'grumble' },
      ],
    },
  },
  daily: [
    'Found a trilobite before breakfast. Then breakfast. Then another trilobite.',
    'The bluff dropped a pebble on my helmet. That means "good morning" in rock.',
    'Rain tonight. Rain washes bones out. Rain is my favourite intern.',
    'Gerald is restless. Fish nearby. Probably yours.',
    'Today I will catalogue. Then I will catalogue the catalogue.',
    'Don\'t step on the orange flag. Or the red one. Or any flag.',
  ],
  ms: {
    3: { lines: ['You have the hands of a digger. Small. Annoying. Useful.', 'A tooth from my own collection. Don\'t lose it.'], gift: { coins: 80 } },
    6: { lines: ['I named a layer after you. The dull one. ...It\'s a compliment.', 'Museum money. You earned it.'], gift: { coins: 160 } },
    10: { lines: ['Friend. There. I said it. Into the strata it goes.', 'Gerald says friend too. Gerald, NOT NOW.'], gift: { coins: 300 } },
  },
  visit: { lines: ['Heard you have fish. Gerald heard it first.', 'Brought a shark tooth. Don\'t ask whose.'], gift: { coins: 45 } },
};
