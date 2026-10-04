// [v19 npc] Conversations with the neighbours (VillagerCard topics + choices) and
// the lines for the friendship cutscenes (NpcScenes).
//
// Per neighbour:
//   topics: { id: { label, lines: [..], choices?: [choice], hidden?: true (unlocked by a choice) } }
//     the card always shows: about, home, tips, gossip (+ any unlocked hidden topic) and 'today'
//   daily:  lines for the "Today" topic; one per day, rotating
//   choice: { t: label, r: [reply lines], f?: friendship +n (once), coins?, wood?, food?: { id, n },
//             unlock?: hidden topic id, mood?: rig expression, anim?: rig anim }
//     Rewards and friendship are given once per choice (remembered in game.state.villagers[id].picked).
//   ms:     friendship milestone scenes at 3 / 6 / 10 friendship: { 3: { lines, gift }, ... }
//   visit:  morning visit lines at your pond; gift: { coins?, wood?, food? }
// Lines are short and in character. No emoji.

export const DIALOGUE = {
  // -------------------------------------------------------------------- Dale
  dale: {
    topics: {
      about: {
        label: 'About you',
        lines: ['Me? Retired, bud. From what? Never told me.', 'Now I sit, I sip, I watch the river. Busy schedule.'],
        choices: [
          { t: 'Sounds like a good life.', r: ['Best life, bud. Pull up a chair sometime.'], f: 1, mood: 'happy', anim: 'cheers' },
          { t: 'Do you ever work?', r: ['Once. Didn\'t care for it.', 'Gave it a real fair shot, too. Whole afternoon.'], anim: 'laugh' },
          { t: 'What\'s in the cooler?', r: ['Daisy Beer, ice, one mystery sandwich.', 'Here, take some ice money. Long story.'], coins: 15, unlock: 'cooler' },
        ],
      },
      home: {
        label: 'The river',
        lines: ['Daisy River runs right through the camp.', 'Salmon in spring, trout all year, moose on Tuesdays.'],
        choices: [
          { t: 'Any good fishing spots?', r: ['Where the water bends, bud. Fish like a corner.', 'Same as people at a party.'], f: 1 },
          { t: 'Why Tuesdays?', r: ['That\'s when he comes to not pay me back.'], unlock: 'moose', mood: 'smug' },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Beavers clear trees for ya. More lodges, more beavers.', 'Dams slow the water down. Fish like slow water.', 'And clearing near the river pays double. My doing, eh.'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['That Rocco sold me a "lucky" can opener.', 'It\'s a spoon, bud. He bent a spoon.'],
        choices: [
          { t: 'Did it work?', r: ['Opened three cans. Spoon\'s lucky after all.'], f: 1, anim: 'laugh' },
          { t: 'Want me to talk to him?', r: ['Nah. I\'m keepin\' the spoon. It\'s grown on me.'] },
        ],
      },
      moose: {
        label: 'The moose', hidden: true,
        lines: ['Twenty bucks. For a lawn chair. Three summers ago.', 'He sat in it ONE time. Chair\'s never been the same.'],
        choices: [
          { t: 'I\'ll keep an eye out for him.', r: ['You\'re a real one, bud. Here, for your trouble.'], coins: 20, f: 1 },
          { t: 'Maybe let it go?', r: ['Let it go? Twenty BUCKS, bud.', '...Ok, maybe nineteen. He brought chips once.'] },
        ],
      },
      cooler: {
        label: 'The cooler', hidden: true,
        lines: ['The mystery sandwich has been in there since May.', 'Nobody knows whose it is. I\'m too scared to check.'],
        choices: [
          { t: 'Let me look.', r: ['Brave. Real brave.', '...Huh. It\'s just logs. Who keeps logs in a cooler? Take \'em.'], wood: 4, f: 1, anim: 'laugh' },
          { t: 'Some things should stay closed.', r: ['Wise words, bud. Wise words.'] },
        ],
      },
    },
    daily: [
      'River\'s high today. Good day for doin\' nothing near it.',
      'Saw a heron steal a fish from a bear. Respect.',
      'Chair squeaks on the left now. Character, eh.',
      'Ran out of ice. Day\'s not ruined. It\'s challenged.',
      'Wind\'s coming off the water. Fish\'ll be biting.',
      'The moose waved at me. Waved! With my twenty bucks in his pocket!',
      'Today\'s plan: sit. Tomorrow\'s plan: also sit.',
    ],
    ms: {
      3: { lines: ['Hey bud, c\'mere. Saved you the good chair.', 'Not the moose\'s chair. The GOOD one.'], gift: { coins: 30 } },
      6: { lines: ['Brought you a can of Daisy. Sealed. Fresh. Special edition.', 'Kidding, it\'s regular. But I picked it myself.'], gift: { coins: 50, wood: 6 } },
      10: { lines: ['Bud. You\'re my best neighbour. Don\'t tell the moose.', 'Here. My fishing hat. Well, money for a hat. Buy a nice one.'], gift: { coins: 120 } },
    },
    visit: { lines: ['Mornin\', bud! Walked all the way here. Need a sit.', 'Nice pond. Fish look happy. Happier than the moose\'s fish.'], gift: { wood: 3 } },
  },

  // -------------------------------------------------------------------- Granny Ribbit
  granny: {
    topics: {
      about: {
        label: 'About you',
        lines: ['I\'ve raised four hundred tadpoles, dearie.', 'Every one of them still calls on Sundays. Most of them.'],
        choices: [
          { t: 'Four hundred? Amazing.', r: ['Oh, stop it. Four hundred and TWELVE.'], f: 1, mood: 'happy' },
          { t: 'Which one is your favourite?', r: ['A granny doesn\'t have favourites.', '...It\'s Gary. Don\'t tell the others.'], mood: 'smug' },
        ],
      },
      home: {
        label: 'The swamp',
        lines: ['The swamp water makes fish change colour.', 'Mud, moss, mayflies. Everything a body needs.'],
        choices: [
          { t: 'Is it safe for my fish?', r: ['Safe as a nap, dearie. Just more spots.'], f: 1 },
          { t: 'What\'s cooking?', r: ['Mealworm stew. Here, take a jar home.'], food: { id: 'bugbites', n: 2 }, unlock: 'recipe' },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Build bog pools and rotting logs. Bugs grow on their own.', 'Grind the bugs into fish food. Free food, happy fish.', 'Swamp water doubles mutations. Pretty colours!'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['Hazel puts too much honey in her pies.', 'I told her so. She gave me a pie to prove it. ...She was right.'],
        choices: [
          { t: 'So it wasn\'t too much?', r: ['It was exactly too much. Perfect.'], f: 1, anim: 'laugh' },
          { t: 'You two should bake together.', r: ['A bug pie! Oh, she\'d faint. Ribbit!'], anim: 'laugh' },
        ],
      },
      recipe: {
        label: 'Granny\'s recipe', hidden: true,
        lines: ['One beetle, two mayflies, a pinch of moss.', 'And a secret ingredient. It\'s love. And a second beetle.'],
        choices: [
          { t: 'Can I write it down?', r: ['Only if you promise to feed your fish twice a day.'], f: 1 },
          { t: 'I\'ll stick to pellets.', r: ['Pellets! Hmph. Fine. Skin and fur, I tell you.'], mood: 'worried' },
        ],
      },
    },
    daily: [
      'Knitting a scarf for a snail today. He\'s very cold.',
      'The mayflies are early. Spring is in a hurry.',
      'My knees say rain. My knees are never wrong.',
      'Did you eat breakfast? You look like you didn\'t.',
      'A heron looked at me funny. I looked back funnier.',
      'Gary called. He\'s a frog now. They grow up so fast.',
      'Fresh moss on the porch. Wipe your paws.',
    ],
    ms: {
      3: { lines: ['Dearie! Come here, let me look at you.', 'Still thin. Here, a basket of bugs for your fish.'], gift: { food: { id: 'bugbites', n: 3 } } },
      6: { lines: ['I knitted you something. It\'s a sock.', 'Just one. The other is for a beetle.'], gift: { coins: 60 } },
      10: { lines: ['You\'re family now, dearie. Tadpole number four hundred and thirteen.', 'Family gets the good jar. Don\'t open it indoors.'], gift: { coins: 100, food: { id: 'bugbites', n: 5 } } },
    },
    visit: { lines: ['Morning, dearie! I walked. My knees are furious.', 'Brought you some bugs. Your ducks looked hungry.'], gift: { food: { id: 'bugbites', n: 2 } } },
  },

  // -------------------------------------------------------------------- Professor Hoot
  hoot: {
    topics: {
      about: {
        label: 'About you',
        lines: ['Ranger, ornithologist, and amateur poet.', 'Thirty years in this tower. The stairs keep me young.'],
        choices: [
          { t: 'Read me a poem?', r: ['"Oh warbler, small and yellow, you are a nice fellow." The end.', 'It\'s a work in progress.'], f: 1, anim: 'write_notes' },
          { t: 'Thirty years? Ever get lonely?', r: ['Never. I have four thousand birds and one fox. Hoo!'], mood: 'happy' },
        ],
      },
      home: {
        label: 'The ridge',
        lines: ['Lookout Ridge sees the whole forest.', 'On a clear day you can see Dale not working.'],
        choices: [
          { t: 'Can I look through the telescope?', r: ['Of course. That dot? Your pond. That smaller dot? You.'], f: 1, anim: 'binoculars' },
          { t: 'Seen anything strange lately?', r: ['A goose wearing a hat. I wrote it down. Nobody believes me.'], unlock: 'goose' },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Tap birds near your pond to log them. New species pay coins.', 'Feeders and birdhouses bring the rare ones.', 'Wood ducks love tall grass. So do I, frankly.'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['Otis claims he caught a pike as long as a canoe.', 'I measured the canoe. It was a small canoe.'],
        choices: [
          { t: 'Still a big pike.', r: ['A respectable pike. I logged it as "medium-large".'], f: 1 },
          { t: 'Fishermen exaggerate.', r: ['And rangers measure. That\'s the balance of nature.'] },
        ],
      },
      goose: {
        label: 'The hat goose', hidden: true,
        lines: ['Grey goose. Small green hat. Walking with purpose.', 'If you see it, log it. I\'ll pay double.'],
        choices: [
          { t: 'I\'ll watch for it.', r: ['Splendid! Here, an advance. For science.'], coins: 25, f: 1 },
          { t: 'Are you sure it was a hat?', r: ['It was a leaf. Probably. Let me dream, fox.'], mood: 'worried' },
        ],
      },
    },
    daily: [
      'Spotted a cedar waxwing at dawn. Splendid crest.',
      'The wind is from the north. Expect geese.',
      'I climbed the stairs twice today. Once on purpose.',
      'A crow stole my pencil. I have eleven more.',
      'Fog in the valley. The birds are whispering.',
      'Entry for today: one fox, looking well. Less scruffy.',
      'Woodpecker drumming at sunrise. Chip, probably. Or a fan.',
    ],
    ms: {
      3: { lines: ['Fox! I\'ve updated your entry.', '"Fox, local. Helpful. Mildly scruffy." That\'s a compliment, hoo.'], gift: { coins: 35 } },
      6: { lines: ['A gift from the ranger station.', 'Our budget is small, but our gratitude is large.'], gift: { coins: 70 } },
      10: { lines: ['I named a bird after you. A small brown one. Very clever.', 'Entry #5,000: the best neighbour on the ridge.'], gift: { coins: 120 } },
    },
    visit: { lines: ['Good morning! I followed a kingfisher and found your pond.', 'Your pond is a fine bird spot. Keep the grass long.'], gift: { coins: 20 } },
  },

  // -------------------------------------------------------------------- Rocco
  rocco: {
    topics: {
      about: {
        label: 'About you',
        lines: ['Me? Businessman. Importer. Finder of things.', 'Mostly finder. Sometimes keeper. Never loser.'],
        choices: [
          { t: 'Where do you find things?', r: ['A good merchant never reveals his bins.'], mood: 'sly' },
          { t: 'You seem honest.', r: ['...Nobody ever said that to me before.', 'Here. A discount. On the house. Don\'t make it weird.'], f: 1, coins: 15, mood: 'happy' },
          { t: 'Got anything rare?', r: ['Psst. Come back when we\'re friends. Real friends.'], unlock: 'deal' },
        ],
      },
      home: {
        label: 'The hollow',
        lines: ['Mushroom Hollow. Glowing spores, fast eggs, no taxes.', 'The mushrooms don\'t ask questions. That\'s why I like \'em.'],
        choices: [
          { t: 'Do the spores really help?', r: ['Eggs hatch way faster here. Science. Or magic. Same price.'], f: 1 },
          { t: 'Can I take a mushroom?', r: ['Take two. They multiply when you\'re not looking.'], food: { id: 'chanterelle', n: 2 } },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Gadgets save you work: feeders, sprinklers, incubators.', 'Firefly Meadows grow glow bugs. Glow bugs hatch eggs fast.', 'Buy low, sell high. That\'s the whole secret. Don\'t tell nobody.'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['Pip thinks he\'s the best trader in the forest.', 'He sells logs. LOGS. Trees do that for free.'],
        choices: [
          { t: 'He seems nice though.', r: ['He IS nice. That\'s the problem. Can\'t compete with nice.'], f: 1, mood: 'worried' },
          { t: 'Want to team up?', r: ['Rocco and Pip. Pip and Rocco. ...Nah, I\'d want top billing.'], anim: 'count_coins' },
        ],
      },
      deal: {
        label: 'A special deal', hidden: true,
        lines: ['Ok, friend. A gnome. Genuine. Fell off a moose.', 'For you? Free. Because I like your face.'],
        choices: [
          { t: 'Thank you, Rocco.', r: ['Don\'t thank me. Thank the moose.'], coins: 30, f: 1, anim: 'show_item' },
          { t: 'What\'s the catch?', r: ['No catch! ...The gnome stares. That\'s it. That\'s the catch.'], mood: 'sly' },
        ],
      },
    },
    daily: [
      'New stock today. Don\'t ask from where.',
      'Psst. Prices are good. Because I\'m in a good mood.',
      'Someone keeps leaving acorns at my stall. Pip, I\'m looking at you.',
      'Lost a gizmo. Found two. Business is booming.',
      'The mushrooms glowed brighter last night. Good omen. Or bad. Good for sales.',
      'I counted my coins. Then I counted them again. Still good.',
      'A customer! Oh wait, it\'s you. Even better.',
    ],
    ms: {
      3: { lines: ['Friend! You come by a lot. I like that in a customer.', 'Here. A little something. Fell off a cart.'], gift: { coins: 40 } },
      6: { lines: ['Ok. Real talk. You\'re my favourite customer.', 'Don\'t tell the others. I have three others.'], gift: { coins: 80 } },
      10: { lines: ['Partner. That\'s what you are now. Partner.', 'Fifty-fifty. On everything. Starting with this bag of coins.'], gift: { coins: 150 } },
    },
    visit: { lines: ['Psst. Morning delivery. No questions.', 'It\'s coins. Legit coins. Probably.'], gift: { coins: 25 } },
  },

  // -------------------------------------------------------------------- Grandpa Shellby
  shellby: {
    topics: {
      about: {
        label: 'About you',
        lines: ['Two hundred years old. Two hundred and three, if you count the naps.', 'I\'ve seen ice ages. Well, one cold week. Felt like an age.'],
        choices: [
          { t: 'What was the pond like back then?', r: ['A puddle. A proud puddle. You made it a pond.'], f: 1, mood: 'happy' },
          { t: 'What\'s your secret to a long life?', r: ['Tea. Naps. Never run. Never.'], anim: 'sip_tea' },
        ],
      },
      home: {
        label: 'The willow',
        lines: ['The Great Willow keeps the old fish safe.', 'She makes your pond prettier. She told me so.'],
        choices: [
          { t: 'The willow talks?', r: ['Only to those who sit long enough. Usually me.'], f: 1 },
          { t: 'Tell me about the old fish.', r: ['Gar, paddlefish, eel. Older than me. Ruder too.'], unlock: 'oldfish' },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Ancient fish eggs come from here. Be patient with them.', 'Decor makes the pond beautiful. Beauty brings bears with fat wallets.', 'And slow down. Fish feel it when you hurry.'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['Clover sings to her turnips every morning.', 'Two hundred years, and I\'ve never heard a turnip sing back.'],
        choices: [
          { t: 'Maybe they\'re shy.', r: ['Heh. Maybe. I was shy once. In 1840.'], f: 1, anim: 'laugh' },
          { t: 'Does it help them grow?', r: ['Her turnips are enormous. So... yes?'] },
        ],
      },
      oldfish: {
        label: 'The old fish', hidden: true,
        lines: ['The gar remembers everything. Holds grudges.', 'The paddlefish? Lovely fellow. Terrible singer.'],
        choices: [
          { t: 'Can I raise one?', r: ['Here. An old coin from the willow roots. For eggs.'], coins: 40, f: 1 },
          { t: 'Grudges about what?', r: ['I sat on him in 1902. By accident. He hasn\'t forgotten.'], anim: 'laugh' },
        ],
      },
    },
    daily: [
      'Tea is still too hot. Two hundred years, same problem.',
      'The snow geese send their regards.',
      'I had a dream about a fish with a top hat. Hm.',
      'Zzz... Oh! Good morning. Or afternoon.',
      'The willow dropped a leaf on my head. A sign. Of autumn.',
      'Slow and steady. That\'s how you win. Or at least finish.',
      'I\'ve been sitting here since breakfast. Excellent day.',
    ],
    ms: {
      3: { lines: ['Ah, young one. Sit. Slowly.', 'This shell button is older than your pond. Keep it.'], gift: { coins: 40 } },
      6: { lines: ['The willow likes you. I can tell.', 'She dropped this for you. Willow-bark tea money.'], gift: { coins: 70 } },
      10: { lines: ['In two hundred years, I\'ve had three real friends.', 'You make four. Here. The willow\'s blessing, in coin.'], gift: { coins: 140 } },
    },
    visit: { lines: ['Good morning... I started walking here yesterday.', 'Lovely pond. I\'ll just rest here a moment. Or an hour.'], gift: { coins: 30 } },
  },

  // -------------------------------------------------------------------- Clover
  clover: {
    topics: {
      about: {
        label: 'About you',
        lines: ['I\'m Clover! I grow things. Mostly carrots. Sometimes trouble.', 'My garden won a ribbon. I made the ribbon. Still counts!'],
        choices: [
          { t: 'It definitely counts.', r: ['Thank you! You get a ribbon too. Ok, a carrot.'], f: 1, food: { id: 'carrot', n: 2 }, mood: 'happy' },
          { t: 'What\'s your favourite veggie?', r: ['Radish. Spicy and round. Like me!'], anim: 'sniff' },
        ],
      },
      home: {
        label: 'The garden',
        lines: ['Lettuce on the left, peas on the right, carrots in the middle.', 'The middle is the place of honour.'],
        choices: [
          { t: 'Can I help water?', r: ['Yes! Pour gently. They\'re sensitive.'], f: 1, anim: 'water_plants' },
          { t: 'What\'s that big one?', r: ['Shh. That\'s Gerald. He\'s going to be a giant pumpkin.'], unlock: 'pumpkin' },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Plant crops by your pond. Bears smell them from far away.', 'Water in the morning. Harvest when they shine.', 'Veggies make bears happy, and happy bears tip more!'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['Otis named a fish Gerald. I named my pumpkin Gerald first!', 'We are not speaking. Well, a little. He brings me worms.'],
        choices: [
          { t: 'Two Geralds can share.', r: ['Hmm. Gerald the Fish and Gerald the Pumpkin. ...Ok, that\'s cute.'], f: 1, mood: 'happy' },
          { t: 'You were first. Stand firm.', r: ['YES. Thank you! Justice for Gerald!'], anim: 'dig' },
        ],
      },
      pumpkin: {
        label: 'Gerald the pumpkin', hidden: true,
        lines: ['He\'s three weeks old and already heavier than me.', 'I sing to him every night. He likes the slow songs.'],
        choices: [
          { t: 'Sing one now?', r: ['La-laa, grow big and round... La-laa, stay off the ground...', 'He grew a little! Here, his seeds from last year.'], food: { id: 'pumpkin', n: 1 }, f: 1, anim: 'water_plants' },
          { t: 'Isn\'t Otis\'s Gerald a fish?', r: ['Don\'t. Just don\'t.'], mood: 'worried' },
        ],
      },
    },
    daily: [
      'The radishes came up overnight! Tiny pink hats!',
      'Something nibbled my lettuce. I have suspects.',
      'Rain tonight, I can smell it. The carrots are excited.',
      'I dug a hole, then forgot why. It\'s a nice hole though.',
      'Gerald gained a pound! Proud garden mom.',
      'Sunflowers are following the sun. So am I, a bit.',
      'Compost day. Don\'t come too close. Love you though.',
    ],
    ms: {
      3: { lines: ['You came back! My favourite visitor!', 'Take some carrots. Fresh dug, extra crunchy.'], gift: { food: { id: 'carrot', n: 4 } } },
      6: { lines: ['I planted a row just for you. It spells your name. Badly.', 'Here, the first harvest!'], gift: { food: { id: 'lettuce', n: 3 }, coins: 40 } },
      10: { lines: ['Best friends! Officially! I made you a ribbon!', 'And Gerald wanted you to have this. He\'s a pumpkin, he can\'t say it.'], gift: { food: { id: 'giant_pumpkin', n: 1 }, coins: 80 } },
    },
    visit: { lines: ['Good morning! I hopped over with veggies!', 'Your bears will go wild for these.'], gift: { food: { id: 'carrot', n: 3 } } },
  },

  // -------------------------------------------------------------------- Otis
  otis: {
    topics: {
      about: {
        label: 'About you',
        lines: ['Born in the river, raised on the dock.', 'I can hold my breath for four minutes. Or one long story.'],
        choices: [
          { t: 'Tell me the long story.', r: ['There was a pike. It was big. It got away.', 'That\'s the long version. The short one is just "pike".'], f: 1, anim: 'hold_fish' },
          { t: 'Four minutes? Show me.', r: ['...Not on land, friend. My lungs are wet-only.'], mood: 'worried' },
        ],
      },
      home: {
        label: 'The bend',
        lines: ['Otter Bend. Best water in the forest.', 'Cold, clear, and full of fish with opinions.'],
        choices: [
          { t: 'Teach me to cast?', r: ['Wrist, not arm. Then wait. Waiting is the whole trick.'], f: 1, anim: 'cast_line' },
          { t: 'Which fish has opinions?', r: ['Gerald. He thinks he runs the place.'], unlock: 'gerald' },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Feed fish well and they grow big. Big fish, big coins.', 'Walleye, pike, perch: the bend lets you raise them.', 'Don\'t overstock. Crowded fish get grumpy.'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['Hoot logged my pike as "medium-large".', 'Medium-large! It ate a duck! A small duck. A toy duck. Still!'],
        choices: [
          { t: 'I believe you, Otis.', r: ['Finally. Somebody who gets it. Here, a pebble. My best one.'], f: 1, coins: 10 },
          { t: 'A toy duck?', r: ['...It looked real from the dock.'], anim: 'laugh' },
        ],
      },
      gerald: {
        label: 'Gerald the walleye', hidden: true,
        lines: ['Gerald. Walleye. Twelve years old. Never been caught.', 'Well. Caught daily. Never kept. We have an arrangement.'],
        choices: [
          { t: 'What arrangement?', r: ['I catch him, say hi, let him go. He brings his friends.', 'Here, a little bonus from the bend.'], coins: 20, f: 1, anim: 'hold_fish' },
          { t: 'Clover says her pumpkin is Gerald.', r: ['There can be two Geralds. Gerald is a big name.'], mood: 'content' },
        ],
      },
    },
    daily: [
      'Perch are schooling by the reeds. Lovely day.',
      'Lost my lucky hook. Found my luckier hook.',
      'Gerald said hi. Well, he blew a bubble. Same thing.',
      'Water\'s warm. Float day. Don\'t tell anyone.',
      'Caught a boot. Size eleven. Anybody missing a boot?',
      'The pike is back. I\'m not naming him. NOT naming him.',
      'Juggled four pebbles today. Dropped three. Personal best.',
    ],
    ms: {
      3: { lines: ['Hey friend! Brought you something from the bend.', 'Shiny coins from the river bottom. Finders keepers.'], gift: { coins: 35 } },
      6: { lines: ['I taught Gerald a trick. He jumps on command.', 'Well, on snacks. Here, you\'ve earned a share of the luck.'], gift: { coins: 70 } },
      10: { lines: ['You\'re crew now. Dock crew. Lifetime member.', 'The crew gets the treasure chest. Ok, it\'s a tackle box of coins.'], gift: { coins: 130 } },
    },
    visit: { lines: ['Ahoy! Swam the whole way. Well, walked. Wet walked.', 'Your fish look great. Big and grumpy. Perfect.'], gift: { coins: 20 } },
  },

  // -------------------------------------------------------------------- Hazel
  hazel: {
    topics: {
      about: {
        label: 'About you',
        lines: ['I\'ve baked since I was a hoglet, sweetie.', 'Pies, tarts, buns. If it fits in an oven, I bake it.'],
        choices: [
          { t: 'What\'s your best pie?', r: ['Blueberry-honey. Too much honey, they say. NEVER.'], f: 1, anim: 'taste' },
          { t: 'Do the spikes get in the way?', r: ['Only when I hug the dough. I do hug the dough.'], anim: 'laugh' },
        ],
      },
      home: {
        label: 'The bakery',
        lines: ['My little bakery cart. Warm all day, cosy all night.', 'The smell travels. Bears follow it like a map.'],
        choices: [
          { t: 'Can I try something?', r: ['Here, a honey bun. And a jar for later, sweetie.'], food: { id: 'honey', n: 2 }, f: 1, anim: 'taste' },
          { t: 'Where did you learn?', r: ['From my grandmother. She had a secret recipe book.'], unlock: 'book' },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Snacks near the tables keep bears happy while they wait.', 'Honey and syrup make any food fancier.', 'A happy bear tips like a king. A hungry bear sulks.'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['Granny Ribbit asked me for a bug pie.', 'A BUG pie, sweetie. I said I\'d think about it. I\'m still thinking.'],
        choices: [
          { t: 'Could be a hit.', r: ['You think? Crunchy crust... Oh no. I\'m thinking about it.'], f: 1, mood: 'surprised' },
          { t: 'Please don\'t.', r: ['Thank you. Somebody had to say it.'], mood: 'happy' },
        ],
      },
      book: {
        label: 'Grandma\'s book', hidden: true,
        lines: ['The recipe book has one page missing. The famous pie.', 'Nobody knows what was on it. I\'ve tried two hundred versions.'],
        choices: [
          { t: 'Maybe it had extra honey?', r: ['...Oh my. Oh MY. You might be right!', 'Take this, sweetie. For your genius.'], food: { id: 'syrup', n: 2 }, f: 1, anim: 'roll_dough' },
          { t: 'Every version is good though.', r: ['You\'re sweet. Sweeter than my pies, even.'], mood: 'love' },
        ],
      },
    },
    daily: [
      'Fresh buns at dawn. The early bear gets the bun.',
      'Oven\'s running hot today. So am I, sweetie.',
      'Tried a new tart. Rhubarb. Bit brave. Bit bitter.',
      'Flour on my nose again. It lives there now.',
      'Dropped a pie. The ants threw a party.',
      'Honey delivery came. I already used half.',
      'Rolled into a ball when a leaf fell. Still embarrassed.',
    ],
    ms: {
      3: { lines: ['Sweetie! I baked you a pie. Your name\'s on the crust.', 'Well, an "R". Running out of crust.'], gift: { food: { id: 'honey', n: 3 } } },
      6: { lines: ['A whole basket for you. Buns, tarts, syrup.', 'The bears will follow you home. In a good way.'], gift: { food: { id: 'syrup', n: 3 }, coins: 40 } },
      10: { lines: ['I found the missing recipe page! It was in the flour bin!', 'The famous pie. First slice is yours. And these coins, from the bakery fund.'], gift: { food: { id: 'royal_jelly', n: 1 }, coins: 90 } },
    },
    visit: { lines: ['Morning delivery, sweetie! Still warm!', 'Put these by your tables. Watch the bears smile.'], gift: { food: { id: 'honey', n: 2 } } },
  },

  // -------------------------------------------------------------------- Chip
  chip: {
    topics: {
      about: {
        label: 'About you',
        lines: ['Carpenter. Woodpecker. Professional knocker.', 'I built my tree house by hand. Well, by beak.'],
        choices: [
          { t: 'By beak? Impressive.', r: ['Tok-tok! Thank you! Took forty thousand pecks.'], f: 1, anim: 'peck_wood' },
          { t: 'Does your head hurt?', r: ['What? Sorry, couldn\'t hear you. Tok.'], anim: 'inspect' },
        ],
      },
      home: {
        label: 'The workshop',
        lines: ['Bench, saw, hammer, and the smell of fresh pine.', 'Bring wood, pick a plan, I build. Simple as that.'],
        choices: [
          { t: 'What are you working on?', r: ['A chair for a bear. Bear-proof. Mostly.'], f: 1, anim: 'measure' },
          { t: 'Any broken antiques around?', r: ['The forest is full of them. Bring them here, I fix them.'], unlock: 'antique' },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Chopped trees and fallen logs give wood.', 'Furniture takes time. Start an order, come back later.', 'Fixed antiques make your pond look fancy. Bears notice.'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['Pip sells me logs. Then buys my sawdust. Then sells it back.', 'I think he\'s winning. I\'m not sure how.'],
        choices: [
          { t: 'Want me to check the math?', r: ['Yes! ...No. I don\'t want to know. Tok.'], f: 1, mood: 'worried' },
          { t: 'He\'s just good at business.', r: ['Too good. Suspiciously good. Cheerfully good.'] },
        ],
      },
      antique: {
        label: 'Antiques', hidden: true,
        lines: ['Old chairs, broken clocks, a rocking horse with three legs.', 'Every piece has a story. I fix the story.'],
        choices: [
          { t: 'What\'s your favourite fix?', r: ['A music box. Played one note. Now it plays two.', 'Here, I had extra planks from that job.'], wood: 5, f: 1, anim: 'hammer' },
          { t: 'Three legs is fine for a horse.', r: ['Ha! You sound like Dale. Tok-tok.'], anim: 'laugh' },
        ],
      },
    },
    daily: [
      'New saw blade. It sings. Tok!',
      'Measured twice, cut once. Then measured again. Habit.',
      'A squirrel moved into my spare drawer. Rent is acorns.',
      'Pecked the wrong tree this morning. Apologized.',
      'Sanding day. Everything is soft and dusty.',
      'Fixed my own ladder. Then fell off it. Fixed myself.',
      'Fresh pine smell. Best smell. Fight me. Gently.',
    ],
    ms: {
      3: { lines: ['Tok-tok! Made you something! A little stool.', 'Ok, the stool broke. Here are the planks.'], gift: { wood: 8 } },
      6: { lines: ['You\'re my best customer! And my only friend who brings wood.', 'Take these. Spare planks and a tip.'], gift: { wood: 10, coins: 40 } },
      10: { lines: ['I carved your name on the workshop door!', 'Spelled it right this time. Here, a whole stack of the good wood.'], gift: { wood: 20, coins: 60 } },
    },
    visit: { lines: ['Tok-tok! House call! Anything need fixing?', 'Here, leftover planks. Wood is love.'], gift: { wood: 4 } },
  },

  // -------------------------------------------------------------------- Pip
  pip: {
    topics: {
      about: {
        label: 'About you',
        lines: ['Pip! Lumber trader, acorn collector, partner to all!', 'I came here with one cart and a dream. Now I have two carts.'],
        choices: [
          { t: 'Two carts! Big success.', r: ['Right?! Expanding! Next year, three carts!'], f: 1, anim: 'haggle' },
          { t: 'What\'s in your cheeks?', r: ['*mmf* ...Business acorns. Rainy day fund.'], anim: 'stuff_cheeks' },
        ],
      },
      home: {
        label: 'The mill',
        lines: ['My mill! Logs in, coins out!', 'The saw goes zzzz, the coins go clink. Lovely music.'],
        choices: [
          { t: 'How does the price work?', r: ['Changes every day, partner. Sell high, wait low!'], f: 1, anim: 'count_logs' },
          { t: 'Got a secret?', r: ['I always have a secret. Come closer...'], unlock: 'secret', mood: 'sly' },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Check my slate every day. When the arrow\'s up, sell!', 'Keep some logs for Chip. Furniture pays too.', 'Beavers bring logs. More beavers, more logs!'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['Rocco says I can\'t compete with him.', 'He sells mystery boxes. I sell LOGS. Logs are never a mystery!'],
        choices: [
          { t: 'Logs are reliable.', r: ['Exactly! Reliable! Honest! Round!'], f: 1, mood: 'happy' },
          { t: 'Mystery boxes are fun though.', r: ['...Ok, they are a little fun. Don\'t tell him.'], mood: 'worried' },
        ],
      },
      secret: {
        label: 'Pip\'s secret', hidden: true,
        lines: ['I bury acorns all over the forest. Then forget where.', 'So the forest keeps growing. My mistake becomes trees!'],
        choices: [
          { t: 'That\'s actually beautiful.', r: ['Aw, partner. Here, a few logs from my "mistakes".'], wood: 5, f: 1, mood: 'love' },
          { t: 'So you plant your own stock?', r: ['...Oh. OH. I\'m a genius by accident.'], coins: 15, anim: 'count_logs' },
        ],
      },
    },
    daily: [
      'Fresh price on the slate! Go look, go look!',
      'Found an acorn I buried last spring! Old friend!',
      'The saw\'s humming nice today. Good sign.',
      'Rocco bought a log. He said it was "for research".',
      'Counted my logs. Then counted my coins. Both good!',
      'Cheeks full, heart full, cart full. Great day, partner.',
      'Chip owes me a shelf. I owe Chip a log. Business!',
    ],
    ms: {
      3: { lines: ['Partner! You sell to me so much, I made you a deal.', 'Bonus coins. Loyal customer program. I just made it up.'], gift: { coins: 40 } },
      6: { lines: ['Two carts and one best customer. That\'s you!', 'Here, a bundle of logs, on the house. Sell \'em back if you like!'], gift: { wood: 10, coins: 30 } },
      10: { lines: ['I named my third cart after you! It doesn\'t exist yet!', 'But this money does. Partnership bonus!'], gift: { coins: 120 } },
    },
    visit: { lines: ['Morning, partner! Door-to-door service!', 'Got logs for ya. Free sample. First one\'s always free!'], gift: { wood: 4 } },
  },
};

// Two neighbours meet at your pond and argue a little. a = first speaker, b = second; `fox` = Reynard's last word.
export const BICKER = [
  { a: 'dale', b: 'otis', lines: [
    { by: 'a', t: 'Otis, bud. That pike story. Three feet? Really?' },
    { by: 'b', t: 'FOUR feet. It grew. Fish grow, Dale.', anim: 'hold_fish' },
    { by: 'a', t: 'Not after you tell the story, they don\'t.', anim: 'laugh' },
    { by: 'b', t: 'Says the guy who\'s been "about to go fishing" for nine years.' },
  ], fox: 'Gentlemen. Fish are grown HERE. Professionally.' },
  { a: 'clover', b: 'hazel', lines: [
    { by: 'a', t: 'Hazel! You used my carrots in a CAKE?' },
    { by: 'b', t: 'Carrot cake, sweetie. It\'s a classic!', anim: 'roll_dough' },
    { by: 'a', t: 'A classic? ...Is there a slice left?', anim: 'sniff' },
    { by: 'b', t: 'For the carrot farmer? Always.', anim: 'taste' },
  ], fox: 'And for the pond owner? ...Nobody? Ok.' },
  { a: 'pip', b: 'rocco', lines: [
    { by: 'b', t: 'Psst. Pip. Wanna buy a log? Genuine. Slightly used.' },
    { by: 'a', t: 'That\'s MY log! It has my stamp on it!', anim: 'haggle' },
    { by: 'b', t: 'Finders keepers. Twelve coins.', anim: 'show_item' },
    { by: 'a', t: 'I sold it to you for eight! ...Ten. Final offer.' },
  ], fox: 'I should charge admission for this.' },
  { a: 'granny', b: 'hoot', lines: [
    { by: 'a', t: 'Professor, you\'re skin and feathers. Are you eating?' },
    { by: 'b', t: 'I eat. Mostly notes. Sometimes a seed.', anim: 'write_notes' },
    { by: 'a', t: 'Seeds! Have a beetle, dear. Full of goodness.', anim: 'tongue_catch' },
    { by: 'b', t: 'I... will log that as a kindness. Hoo.' },
  ], fox: 'She will feed us all. Resistance is futile.' },
  { a: 'chip', b: 'pip', lines: [
    { by: 'a', t: 'Pip, the last logs were full of acorns!', anim: 'inspect' },
    { by: 'b', t: 'Bonus acorns! Free of charge!', anim: 'stuff_cheeks' },
    { by: 'a', t: 'I built a chair. It grew a tree.' },
    { by: 'b', t: 'So it\'s a chair AND a tree! Two for one!' },
  ], fox: 'Honestly? I\'d buy that chair.' },
  { a: 'shellby', b: 'dale', lines: [
    { by: 'b', t: 'Gramps! Race you to the cooler!' },
    { by: 'a', t: 'Young deer. I have never lost a race.', anim: 'sip_tea' },
    { by: 'b', t: 'You\'ve never RUN a race.', anim: 'laugh' },
    { by: 'a', t: 'Exactly. Undefeated.' },
  ], fox: 'That is the smartest thing I\'ve heard all week.' },
];

// [F&S mining] Flint the badger prospector (Flint's Quarry) + his bickering with Pip
DIALOGUE.flint = {
  topics: {
    about: {
      label: 'About you',
      lines: ['Flint. Prospector. Forty years on this mountain.', 'Came for the gold. Stayed for the rocks. They don\'t talk back.'],
      choices: [
        { t: 'Forty years! Found much gold?', r: ['Enough to bite. Not enough to retire.', 'Here. A nugget for the asking. Don\'t spend it on fish.'], coins: 20, f: 1, anim: 'bite_nugget' },
        { t: 'Why do you lick the rocks?', r: ['Copper tastes like pennies. Iron tastes like blood.', 'Coal tastes like regret. Science, kid.'], anim: 'laugh' },
        { t: 'Nice helmet.', r: ['Carbide lamp. Lights up a tunnel and my good side.', 'Both sides are my good side.'], unlock: 'lamp', mood: 'proud' },
      ],
    },
    home: {
      label: 'The quarry',
      lines: ['Coal down low, copper in the middle, gold up where the goats live.', 'And crystals at the top. Bring a scarf.'],
      choices: [
        { t: 'Could I dig a mine here?', r: ['A mine? With BEARS? Ha!', '...They do work hard. When they\'re fed. Research it, I\'ll show you the seam.'], f: 1, anim: 'swing_pick' },
        { t: 'Is it dangerous?', r: ['Only the dynamite. And the goats. Mostly the goats.'], unlock: 'goats', mood: 'surprised' },
      ],
    },
    tips: {
      label: 'Tips',
      lines: ['Mark a vein, your beavers dig it. One sack a job.', 'No Ore Shed, no hauling. Sacks just sit there looking sad.', 'Bears dig more than beavers. Bears also eat more than beavers. Lunch pails, kid.'],
    },
    gossip: {
      label: 'Gossip',
      lines: ['That raccoon tried to sell me my own pickaxe.', 'I bit it. It was brass. So was the raccoon\'s smile.'],
      choices: [
        { t: 'Did you buy it back?', r: ['For three coins and a stern look. Got the look back too.'], f: 1, anim: 'laugh' },
        { t: 'Rocco does that to everyone.', r: ['Hrmph. Then everyone should bite more.'] },
      ],
    },
    lamp: {
      label: 'The carbide lamp', hidden: true,
      lines: ['Water drips on carbide, makes gas, gas makes light.', 'Smells like garlic. Lights like the sun. Mostly smells.'],
      choices: [
        { t: 'Can I try it on?', r: ['Ha! Hold still... there. You look like a miner. A small, greedy miner.', 'Keep this for the trouble.'], coins: 15, f: 1, anim: 'happy' },
        { t: 'Garlic? Really?', r: ['Bears hate it. Best guard dog I ever had.'], mood: 'smug' },
      ],
    },
    goats: {
      label: 'The goats', hidden: true,
      lines: ['Mountain goats. They stare. They judge.', 'One ate my map. I drew a new one. It ate that too.'],
      choices: [
        { t: 'Want me to scare them off?', r: ['With what, your hat? ...Actually, the monocle might work.', 'Here, slingshot money. Aim for the beard.'], coins: 12, f: 1, anim: 'laugh' },
        { t: 'Maybe they like maps.', r: ['...Huh. I never asked them.'], mood: 'think' },
      ],
    },
  },
  daily: [
    'Found a vein of copper this morning. It found me first.',
    'Coffee\'s strong today. Strong enough to dig with.',
    'Goat stole my sandwich. Third time this week.',
    'Lamp ran out of carbide. Dug in the dark. Found my other boot.',
    'Bit a nugget. It was a pebble. Still tasty.',
    'Rocks are quiet today. Suspicious.',
    'Dynamite fizzled again. Gentle as a lamb, that batch.',
  ],
  ms: {
    3: { lines: ['Kid. You\'re alright. For a fox.', 'Take some ore. And these coins. Don\'t make it weird.'], gift: { coins: 40 } },
    6: { lines: ['Forty years, nobody visits. Then you. Twice a week!', 'My lucky nugget. Well, half. I bit the other half.'], gift: { coins: 70 } },
    10: { lines: ['I\'m naming a seam after you. "Fox Vein." Richest one up there.', 'And this, from my coffee can. Forty years of savings.'], gift: { coins: 150 } },
  },
  visit: { lines: ['Hrmph. Came down the mountain. Knees hate me.', 'Brought you something from the quarry. Don\'t lick it.'], gift: { coins: 30 } },
};
BICKER.push({ a: 'flint', b: 'pip', lines: [ // [F&S mining]
  { by: 'b', t: 'Flint! Wanna sell some rocks, partner? I buy anything round!' },
  { by: 'a', t: 'They\'re not round. They\'re ORE. There\'s a difference.', anim: 'bite_nugget' },
  { by: 'b', t: 'Is the difference... the price?', anim: 'haggle' },
  { by: 'a', t: 'The difference is I bite them and they don\'t bite back. Mostly.' },
], fox: 'Note to self: never sell Flint a coin. He\'ll eat it.' });
