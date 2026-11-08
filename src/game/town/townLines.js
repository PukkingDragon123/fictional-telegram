// [v33 town] What the neighbours say to each other and to Reynard while they
// go about their day. Short lines: they pop up as comic bubbles in the world.
// `{A}` / `{B}` = the two speakers' first names, `{fox}` = Reynard,
// `{fish}` = the newest fish, `{n}` = a number, `{quest}` = a finished quest.

// ---- hello, Reynard (a wave and one of these when the fox walks by)
export const GREET = {
  clover: ['Morning, Reynard!', 'Hi hi! Mind the radishes!', 'Ooh, you smell like pond!', 'Want a carrot? No? More for me!'],
  otis: ['Ahoy, Reynard!', 'Fish are biting, matey!', 'Nice day for a float, eh?', 'Reynard! Ever met Gerald?'],
  hazel: ['Hello, sweetie!', 'You look peckish, dear.', 'Pie later? Pie later.', 'Mind my spikes, love!'],
  chip: ['Tok-tok! Hey Reynard!', 'Measure twice, wave once!', 'Need a chair? I got chairs.', 'Hey! Nice monocle!'],
  pip: ['Howdy, partner!', 'Logs today, partner?', 'Business is booming, partner!', '*munch* Oh! Hi!'],
  hoot: ['Hoo! A fox! ...Oh, it\'s you.', 'Seen any warblers?', 'Hoo-hoo! Lovely weather for birds.'],
  rocco: ['Psst. Hey. Hi.', 'You didn\'t see me.', 'Got deals. Big deals.'],
  shellby: ['Ah... young Reynard...', 'Slow down, sonny.', 'Lovely day... for a nap...'],
  dale: ['Hey bud!', 'Grab a chair, bud!', 'Ayy, Reynard!'],
  granny: ['Ribbit! Hello, dearie!', 'Are you eating, dearie?', 'Come here, let me look at you.'],
  flint: ['Hrmph. Fox.', 'Mornin\'.', 'Mind the rocks.'],
  _: ['Hey, Reynard!', 'Hi there!', 'Oh! Hello!'],
};
export const GREET_NIGHT = ['Evenin\', Reynard.', 'Off to bed soon!', '*yawn* Night, Reynard.', 'Late one, eh?'];

// ---- comments on what's been going on lately (filled by TownLife's memory)
export const GOSSIP = {
  fish: ['Saw your new {fish}! Fancy!', 'A {fish}? In YOUR pond?', 'Heard you hatched a {fish}!', 'That {fish} of yours! Wow!'],
  rareFish: ['A {fish}?! Everyone\'s talking!', 'The whole forest heard about your {fish}!'],
  feastGood: ['Saw the bears last night. {n} fed!', 'Big feast last night, eh?', 'Those bears looked STUFFED.', 'Heard the feast from my porch!'],
  feastBad: ['Rough feast last night, huh?', 'I heard the bears got grumpy...', 'Was that a RAMPAGE last night?'],
  quest: ['Heard you did "{quest}"! Nice!', 'Word is you finished {quest}.', 'Congrats on {quest}, Reynard!'],
  rain: ['Wet one today!', 'Rain! The radishes love it.', 'Splish splash!', 'Brr, soggy!'],
  storm: ['Hold onto your hat!', 'Big storm coming!'],
  snow: ['Snow! Mind the ice!', 'Brrr! Bundle up!'],
  heat: ['Phew, what a scorcher!', 'Too hot for fur!'],
  fog: ['Can\'t see a thing!', 'Spooky fog today...'],
  wind: ['Windy! Hold your hat!', 'Whoosh!'],
  morning: ['Lovely morning!', 'Early bird, eh?'],
  evening: ['Bears coming soon!', 'Almost feast time!'],
};

// ---- two neighbours meet: little 2-3 line exchanges. by: 'a' | 'b'
export const PAIR_CHATS = [
  { a: 'clover', b: 'hazel', lines: [{ by: 'a', t: 'Carrot cake this week?' }, { by: 'b', t: 'Only if you bring carrots!' }, { by: 'a', t: 'Deal!', anim: 'happy' }] },
  { a: 'hazel', b: 'otis', lines: [{ by: 'a', t: 'Otis, no fish pie!' }, { by: 'b', t: 'Aw, c\'mon...' }] },
  { a: 'otis', b: 'pip', lines: [{ by: 'b', t: 'Need a new dock, partner?' }, { by: 'a', t: 'Only if it floats!' }, { by: 'b', t: 'Mostly floats.', anim: 'laugh' }] },
  { a: 'chip', b: 'pip', lines: [{ by: 'a', t: 'Got oak today?' }, { by: 'b', t: 'Oak, pine, birch! Price is up!' }, { by: 'a', t: 'Tok. Of course it is.' }] },
  { a: 'chip', b: 'clover', lines: [{ by: 'b', t: 'Can you make me a planter?' }, { by: 'a', t: 'A planter? I\'ll make a PALACE!' }] },
  { a: 'clover', b: 'otis', lines: [{ by: 'b', t: 'Caught a carrot once.' }, { by: 'a', t: 'That was MY carrot!' }, { by: 'b', t: 'Finders keepers!', anim: 'laugh' }] },
  { a: 'hazel', b: 'chip', lines: [{ by: 'a', t: 'Chip, my oven door squeaks.' }, { by: 'b', t: 'I\'ll peck by tomorrow!' }] },
  { a: 'pip', b: 'hazel', lines: [{ by: 'a', t: 'Trade you logs for pie?' }, { by: 'b', t: 'How many logs is a pie?' }, { by: 'a', t: '...Business acorns?' }] },
  { a: 'hoot', b: 'clover', lines: [{ by: 'a', t: 'A cardinal! In your lettuce!' }, { by: 'b', t: 'He\'s eating my lettuce!' }] },
  { a: 'rocco', b: 'pip', lines: [{ by: 'a', t: 'Psst. Wanna buy a log?' }, { by: 'b', t: 'That\'s MY log!' }, { by: 'a', t: 'Was.', anim: 'laugh' }] },
  { a: 'shellby', b: 'otis', lines: [{ by: 'a', t: 'In my day... fish... were bigger...' }, { by: 'b', t: 'Bigger than Gerald?!' }] },
  { a: 'otis', b: 'chip', lines: [{ by: 'b', t: 'How\'s the jetty holding up?' }, { by: 'a', t: 'Still wet!' }] },
  { a: 'clover', b: 'pip', lines: [{ by: 'b', t: 'Got any acorns, Clover?' }, { by: 'a', t: 'I grow CARROTS, Pip.' }, { by: 'b', t: 'Carrot acorns?' }] },
];

// any two neighbours (A speaks first)
export const ANY_CHATS = [
  [{ by: 'a', t: 'Morning, {B}!' }, { by: 'b', t: 'Morning, {A}! Lovely day!' }],
  [{ by: 'a', t: 'Did you see the bears yesterday?' }, { by: 'b', t: 'Those suits! So fancy!' }],
  [{ by: 'a', t: '{fox}\'s pond is getting busy!' }, { by: 'b', t: 'He\'s got big plans, that fox.' }],
  [{ by: 'a', t: 'Heard the frogs last night?' }, { by: 'b', t: 'Granny says they were singing.' }],
  [{ by: 'a', t: 'Nice hat, {B}.' }, { by: 'b', t: 'Thanks! It\'s my only hat.', anim: 'happy' }],
  [{ by: 'a', t: 'Busy day?' }, { by: 'b', t: 'Always! You?' }, { by: 'a', t: 'Nope!', anim: 'laugh' }],
  [{ by: 'a', t: 'The fox counts his coins a LOT.' }, { by: 'b', t: 'Twice before lunch!' }],
  [{ by: 'a', t: 'What\'s for supper, {B}?' }, { by: 'b', t: 'Whatever Hazel\'s baking.' }],
];

// about something that just happened (from TownLife's memory)
export const TOPIC_CHATS = {
  fish: [[{ by: 'a', t: 'Seen Reynard\'s new {fish}?' }, { by: 'b', t: 'Gorgeous! Very shiny.' }]],
  feastGood: [[{ by: 'a', t: 'Big feast last night!' }, { by: 'b', t: '{n} bears! I counted!' }]],
  feastBad: [[{ by: 'a', t: 'Those bears were LOUD.' }, { by: 'b', t: 'Somebody got grumpy...' }]],
  rain: [[{ by: 'a', t: 'Bit damp today, eh?' }, { by: 'b', t: 'Good for the garden!' }]],
  snow: [[{ by: 'a', t: 'Cold enough for ya?' }, { by: 'b', t: 'Brrrr!' }]],
  heat: [[{ by: 'a', t: 'Hot hot hot!' }, { by: 'b', t: 'Pond dip later?' }]],
};

// ---- talking to themselves while they potter about
export const SOLO = {
  sweep: ['Dust bunnies, begone!', 'Swish, swish...', 'Spotless!'],
  read: ['Hm... then the butler...', 'Ooh, plot twist!', 'Just one more chapter.'],
  nap: ['Zzz...', 'Mmm... pie...', 'Zzz... five more minutes...'],
  stretch: ['Mmmmh!', 'Ahh, that\'s the spot.'],
  yawn: ['*yaaawn*', '*yawn* ...sleepy.'],
  sit: ['What a view!', 'Ahh. Lovely.', 'Nice pond, Reynard.'],
  fish: ['Here fishy fishy...', 'Come on, Gerald...', 'Nibble... nibble...'],
  rain: ['Ooh, rain!', 'Better head in!', 'Splish!'],
  home: ['Home sweet home.', 'Back to work!'],
  bed: ['Night night!', 'Bedtime!'],
};

// ---- the beaver crew, when the boss walks by
export const BEAVER_GREET = ['Hey boss!', 'Boss!', 'Logs, boss!', 'Working hard, boss!', 'Hi boss!', 'Hardly working!'];
export const BEAVER_NIGHT = ['Night, boss...', '*yawn* Done for today!', 'Home time!'];
