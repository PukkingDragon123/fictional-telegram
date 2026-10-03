// Fish species. `meal` = how filling for a bear (meal points), `value` = coin
// multiplier, `size` = adult body length in world units (1 tile = 1 unit).
// `tier` 0..4 is the base rarity (common .. legendary) used by eggs.
// `look` + `colors` describe the pixel-art sprite (src/art/fishArt.js).
export const SPECIES = [
  // ---------------------------------------------------------------- panfish
  {
    id: 'bluegill', name: 'Bluegill', latin: 'Lepomis macrochirus', tier: 0,
    desc: 'A plucky little sunfish. Cheap, cheerful and breeds like crazy.',
    price: 10, meal: 1, value: 1, breed: 1.25, growth: 1.2, speed: 1.0, size: 0.95, unlock: 'start',
    look: 'Deep round sunfish body. Olive-blue back, blue-violet sides with 5 faint dark vertical bars, orange-yellow breast, dark navy "ear" flap behind the gill, long dorsal fin.',
    colors: { back: 0x3a5f9c, side: 0x5b86c9, belly: 0xe8a34c, fin: 0x3f6aa8, accent: 0x16223a },
  },
  {
    id: 'pumpkinseed', name: 'Pumpkinseed', latin: 'Lepomis gibbosus', tier: 0,
    desc: 'A pumpkin-orange sunfish with turquoise war paint. Cottage-dock royalty.',
    price: 14, meal: 1, value: 1.15, breed: 1.2, growth: 1.2, speed: 1.0, size: 0.9, unlock: 'r_pumpkinseed',
    look: 'Very round, flat sunfish. Olive-gold back, sides speckled orange and gold, bright orange belly, wavy turquoise lines on the cheek, small bright red spot on the black ear flap.',
    colors: { back: 0x6a7a3a, side: 0xd8a040, belly: 0xf07a2a, fin: 0x8a8a4a, accent: 0x3ad0c8 },
  },
  {
    id: 'goldfish', name: 'Pond Goldfish', latin: 'Carassius auratus', tier: 0,
    desc: 'Somebody flushed Mr. Bubbles. Now he lives here, rent-free. Bears think he\'s a snack-size treat.',
    price: 12, meal: 0.8, value: 1.3, breed: 1.3, growth: 1.3, speed: 0.9, size: 0.8, unlock: 'r_goldfish',
    look: 'Chubby egg-shaped body, glossy orange with a paler yellow belly, big round eye, flowing double tail and fins with lighter orange edges.',
    colors: { back: 0xd8501a, side: 0xf08a2a, belly: 0xffd070, fin: 0xf8a050, accent: 0xffe0a0 },
  },
  {
    id: 'perch', name: 'Yellow Perch', latin: 'Perca flavescens', tier: 1,
    desc: 'Golden with bold tiger stripes. A Great Lakes classic that bears adore.',
    price: 22, meal: 1.5, value: 1.25, breed: 1.1, growth: 1.1, speed: 1.05, size: 1.05, unlock: 'r_perch',
    look: 'Torpedo-ish body with a humped back. Golden-yellow sides with 6-7 dark olive vertical bars, pale belly, spiny dorsal fin, bright orange lower fins.',
    colors: { back: 0x5e6f2a, side: 0xe0c040, belly: 0xf6e8a8, fin: 0xe8743a, accent: 0x3c4a1e },
  },
  {
    id: 'smallmouth', name: 'Smallmouth Bass', latin: 'Micropterus dolomieu', tier: 1,
    desc: 'The bronzeback. Punches way above its weight class. Loves rocky shallows.',
    price: 34, meal: 2, value: 1.3, breed: 1.0, growth: 1.0, speed: 1.1, size: 1.15, unlock: 'r_smallmouth',
    look: 'Muscular bass body, bronze-brown with darker vertical bars, dark lines radiating from the red eye across the cheek, cream belly.',
    colors: { back: 0x5a4a28, side: 0xa8844a, belly: 0xe8dcb8, fin: 0x8a6a3a, accent: 0xc83028 },
  },
  {
    id: 'bass', name: 'Largemouth Bass', latin: 'Micropterus salmoides', tier: 1,
    desc: 'Big mouth, bigger attitude. A hearty meal for a hungry suit.',
    price: 42, meal: 2.5, value: 1.35, breed: 0.95, growth: 1.0, speed: 1.0, size: 1.25, unlock: 'r_bass',
    look: 'Chunky bass with a huge mouth reaching past the eye. Green back, lime-olive sides with a jagged dark horizontal stripe along the middle, white belly.',
    colors: { back: 0x3e5e2a, side: 0x7fa04a, belly: 0xe6ecd0, fin: 0x5a7a36, accent: 0x2a3e1c },
  },
  // ---------------------------------------------------------------- trout & char
  {
    id: 'brook', name: 'Brook Trout', latin: 'Salvelinus fontinalis', tier: 1,
    desc: 'The speckled jewel of northern streams. Red spots with blue halos!',
    price: 60, meal: 2, value: 1.6, breed: 0.9, growth: 0.95, speed: 1.15, size: 1.2, unlock: 'r_brook',
    look: 'Trout body. Dark olive back with pale wormy squiggles, sides with yellow spots and a few red spots ringed in blue, orange-red belly, lower fins orange with a crisp white leading edge.',
    colors: { back: 0x3f4f2e, side: 0x6a7a44, belly: 0xe86a2c, fin: 0xd8582a, accent: 0xd03030 },
  },
  {
    id: 'rainbow', name: 'Rainbow Trout', latin: 'Oncorhynchus mykiss', tier: 2,
    desc: 'Silver with a blushing pink stripe. Fights hard, tastes better.',
    price: 90, meal: 2.5, value: 1.8, breed: 0.85, growth: 0.9, speed: 1.2, size: 1.3, unlock: 'r_rainbow',
    look: 'Sleek trout. Green-grey back, silvery sides with a wide rosy-pink band from cheek to tail, small black spots all over back and tail, white belly.',
    colors: { back: 0x5a7a58, side: 0xc8d0cc, belly: 0xf2f4f0, fin: 0x9aa89a, accent: 0xe07a8a },
  },
  {
    id: 'laketrout', name: 'Lake Trout', latin: 'Salvelinus namaycush', tier: 2,
    desc: 'A deep, cold-water giant from the Shield lakes. Patient, grumpy, delicious.',
    price: 130, meal: 3, value: 1.9, breed: 0.75, growth: 0.8, speed: 1.05, size: 1.45, unlock: 'r_laketrout',
    look: 'Long heavy char body with a deeply forked tail. Grey-green back and sides covered in creamy pale spots, pale belly, pale fin edges.',
    colors: { back: 0x3a4a44, side: 0x6a7a70, belly: 0xe0e4d8, fin: 0x5a6a60, accent: 0xe8e4c8 },
  },
  {
    id: 'grayling', name: 'Arctic Grayling', latin: 'Thymallus arcticus', tier: 3,
    desc: 'Flies a huge purple sail fin like a tiny Viking ship. The Yukon\'s showoff.',
    price: 220, meal: 2.5, value: 2.8, breed: 0.7, growth: 0.85, speed: 1.2, size: 1.2, unlock: 'r_grayling',
    look: 'Slim silvery-lavender body with scattered black spots near the head, and an enormous tall sail-like dorsal fin: dark purple with turquoise and pink spots and a red edge.',
    colors: { back: 0x4a4a6a, side: 0xa8a8c8, belly: 0xe8e8f0, fin: 0x6a3a8a, accent: 0x3ac8b8 },
  },
  {
    id: 'char', name: 'Arctic Char', latin: 'Salvelinus alpinus', tier: 3,
    desc: 'From the far north: sapphire back, sunset belly. Pure luxury.',
    price: 480, meal: 4, value: 3, breed: 0.6, growth: 0.75, speed: 1.15, size: 1.35, unlock: 'r_char',
    look: 'Char body. Deep sapphire-blue back, blue-grey sides with pale pink spots, blazing red-orange belly, red lower fins with white leading edges.',
    colors: { back: 0x2a3a5a, side: 0x5a6a8a, belly: 0xf05a30, fin: 0xe8603a, accent: 0xf0b0b8 },
  },
  // ---------------------------------------------------------------- salmon & whitefish
  {
    id: 'whitefish', name: 'Lake Whitefish', latin: 'Coregonus clupeaformis', tier: 1,
    desc: 'A humble silver fish with a tiny head and a big hump. Every fish fry in Ontario owes it one.',
    price: 50, meal: 2, value: 1.5, breed: 1.0, growth: 1.0, speed: 1.05, size: 1.2, unlock: 'r_whitefish',
    look: 'Silvery body with a humped back behind a small pointy head, bright silver-white sides with a faint blue-grey back, clear greyish fins, small adipose fin.',
    colors: { back: 0x6a7a8a, side: 0xd0d8e0, belly: 0xf4f6f8, fin: 0xa8b0b8, accent: 0x8a98a8 },
  },
  {
    id: 'sockeye', name: 'Sockeye Salmon', latin: 'Oncorhynchus nerka', tier: 2,
    desc: 'Blazing red with a green head. The pride of British Columbia.',
    price: 150, meal: 3, value: 2.2, breed: 0.75, growth: 0.85, speed: 1.25, size: 1.4, unlock: 'r_sockeye',
    look: 'Spawning salmon: bright crimson body, olive-green head with a hooked jaw, humped back, greenish fins.',
    colors: { back: 0xb02828, side: 0xd83a30, belly: 0xe8604a, fin: 0x5a7a3a, accent: 0x4a7a3a },
  },
  {
    id: 'chinook', name: 'Chinook Salmon', latin: 'Oncorhynchus tshawytscha', tier: 3,
    desc: 'The king salmon. Chrome-bright, heavy as a briefcase full of quarterly reports.',
    price: 300, meal: 5, value: 2.4, breed: 0.65, growth: 0.75, speed: 1.2, size: 1.6, unlock: 'r_chinook',
    look: 'Big thick salmon. Blue-green back with black spots on the back and both tail lobes, bright chrome-silver sides, white belly, black gum line.',
    colors: { back: 0x3a5a6a, side: 0xc8d4dc, belly: 0xf4f6f8, fin: 0x6a7a80, accent: 0x1a2024 },
  },
  // ---------------------------------------------------------------- big game
  {
    id: 'walleye', name: 'Walleye', latin: 'Sander vitreus', tier: 2,
    desc: 'Glassy glow-in-the-dark eyes. Canada\'s favourite fish fry.',
    price: 200, meal: 4, value: 2.6, breed: 0.65, growth: 0.8, speed: 1.1, size: 1.4, unlock: 'r_walleye',
    look: 'Long perch-like body, olive-gold with darker saddles on the back, white belly, big glassy pale-silver eyes, white tip on the lower tail lobe, two dorsal fins (spiny then soft).',
    colors: { back: 0x6a6a30, side: 0xc4a848, belly: 0xf0ecd0, fin: 0xa89040, accent: 0xe8f0c0 },
  },
  {
    id: 'pike', name: 'Northern Pike', latin: 'Esox lucius', tier: 2,
    desc: 'A long, toothy ambush predator. Bears call it "the baguette".',
    price: 240, meal: 4, value: 2.2, breed: 0.7, growth: 0.8, speed: 1.35, size: 1.7, unlock: 'r_pike',
    look: 'Very long torpedo body with a duck-bill snout full of teeth. Dark green back, green sides covered in rows of pale yellow bean-shaped spots, cream belly, dorsal fin far back near the tail.',
    colors: { back: 0x3a5a2c, side: 0x5e8440, belly: 0xe8ecc8, fin: 0x8a8a3a, accent: 0xd8dc80 },
  },
  {
    id: 'burbot', name: 'Burbot', latin: 'Lota lota', tier: 2,
    desc: 'Nicknamed "the lawyer". Slimy, whiskered, and weirdly popular with the Legal department.',
    price: 180, meal: 3, value: 2.3, breed: 0.8, growth: 0.85, speed: 0.85, size: 1.45, unlock: 'r_burbot',
    look: 'Eel-like long body with a broad flat head and a single whisker (barbel) on the chin. Mottled brown and yellow-olive marbling, long low dorsal and anal fins running to a rounded tail.',
    colors: { back: 0x4a3a22, side: 0x8a7a44, belly: 0xd8cc98, fin: 0x5a4a2a, accent: 0x2a2014 },
  },
  {
    id: 'muskie', name: 'Muskellunge', latin: 'Esox masquinongy', tier: 3,
    desc: 'The fish of ten thousand casts. The CEO keeps one mounted in his office.',
    price: 600, meal: 6, value: 2.8, breed: 0.55, growth: 0.7, speed: 1.3, size: 1.9, unlock: 'r_muskie',
    look: 'Huge long pike-shaped body with a duck-bill jaw. Light olive-silver with bold dark vertical tiger bars, bronze-tinged fins with dark spots, cream belly.',
    colors: { back: 0x5a6a4a, side: 0xb8b890, belly: 0xece8d0, fin: 0xa8783a, accent: 0x3a4028 },
  },
  {
    id: 'sturgeon', name: 'Lake Sturgeon', latin: 'Acipenser fulvescens', tier: 4,
    desc: 'A living dinosaur armoured in bony plates. One of these feeds a CEO.',
    price: 1100, meal: 9, value: 3.4, breed: 0.4, growth: 0.55, speed: 0.75, size: 2.1, unlock: 'r_sturgeon',
    look: 'Prehistoric: long body with rows of bony white-grey plates (scutes) along the back and sides, pointed shovel snout with 4 whiskers underneath, shark-like tail with a longer upper lobe. Slate grey-brown, pale belly.',
    colors: { back: 0x5a5a4e, side: 0x7a786a, belly: 0xd8d4c4, fin: 0x5a5a4e, accent: 0xc4c0a8 },
  },
  // ---------------------------------------------------------------- panfish & minnows
  {
    id: 'crappie', name: 'Black Crappie', latin: 'Pomoxis nigromaculatus', tier: 0,
    desc: 'A speckled panfish with a dish-shaped face. Despite the name, bears rate it five stars.',
    price: 12, meal: 1.1, value: 1.1, breed: 1.25, growth: 1.2, speed: 1.0, size: 0.95, unlock: 'r_crappie',
    look: 'Deep, flat, diamond-ish body with a dished forehead and a big upturned mouth. Silvery olive-white sides covered in black speckles and blotches, dark olive back, big matching dorsal and anal fins set far back, dark olive fins with a pale band.',
    colors: { back: 0x3c4632, side: 0xc4c8b2, belly: 0xeef0e4, fin: 0x4a5040, accent: 0x20261c },
  },
  {
    id: 'rockbass', name: 'Rock Bass', latin: 'Ambloplites rupestris', tier: 0,
    desc: 'Red-eyed and grumpy, like an intern after the night shift. Lives under a rock and pays no rent.',
    price: 14, meal: 1.2, value: 1.1, breed: 1.2, growth: 1.15, speed: 0.95, size: 0.95, unlock: 'r_rockbass',
    look: 'Chunky deep bass-sunfish body with a big mouth and a huge blood-red eye. Brassy olive-brown sides with rows of dark dots and dusky blotches, dark back, cream belly, spiny dorsal, dark-edged anal fin.',
    colors: { back: 0x4a3c22, side: 0x9a8448, belly: 0xe2d4a4, fin: 0x7a6838, accent: 0xd62a1e },
  },
  {
    id: 'creekchub', name: 'Creek Chub', latin: 'Semotilus atromaculatus', tier: 0,
    desc: 'The humble creek minnow. Breeding males grow bumpy little head knobs and very big ambitions.',
    price: 9, meal: 0.9, value: 1.05, breed: 1.35, growth: 1.3, speed: 1.1, size: 1.0, unlock: 'r_creekchub',
    look: 'Torpedo minnow with a big head and wide mouth. Olive back, silvery sides with a dark stripe from snout to a black tail-base spot, rosy-orange blush on the lower flank and pelvic, anal and pectoral fins, white belly.',
    colors: { back: 0x7a7a4a, side: 0xc8c4ac, belly: 0xf4ece2, fin: 0xb0a678, accent: 0xe8846a },
  },
  {
    id: 'dace', name: 'Northern Redbelly Dace', latin: 'Chrosomus eos', tier: 0,
    desc: 'Tiny, zippy and wearing a red belly like a hockey jersey. Bears eat them like popcorn.',
    price: 8, meal: 0.6, value: 1.4, breed: 1.45, growth: 1.4, speed: 1.2, size: 0.8, unlock: 'r_dace',
    look: 'Tiny chubby minnow. Olive-brown back, two black stripes along the side (a thin upper one and a wide lower one through the eye), cream line between them, scarlet-red belly, yellow fins.',
    colors: { back: 0x6a5830, side: 0xd8c890, belly: 0xe83a26, fin: 0xe8c040, accent: 0x1c1a14 },
  },
  // ---------------------------------------------------------------- drum, goldeye & lake herring
  {
    id: 'drum', name: 'Freshwater Drum', latin: 'Aplodinotus grunniens', tier: 1,
    desc: 'Grunts and grumbles all day like a bear before his first coffee. Its ear stones are lucky charms.',
    price: 38, meal: 2.5, value: 1.3, breed: 1.0, growth: 1.0, speed: 0.95, size: 1.25, unlock: 'r_drum',
    look: 'Silver fish with a steep, high-humped back and a blunt overhanging snout. Blue-grey back with a violet sheen, bright silver sides, white belly, long two-part dorsal fin, pale pelvic fins, rounded pointy tail with the lateral line running into it.',
    colors: { back: 0x56607a, side: 0xc4ccd6, belly: 0xf2f2ee, fin: 0x98a0ac, accent: 0xa89cc8 },
  },
  {
    id: 'goldeye', name: 'Goldeye', latin: 'Hiodon alosoides', tier: 1,
    desc: 'Huge golden eyes and a smoky past. Winnipeg smokes it, the dining car serves it, bears expense it.',
    price: 45, meal: 1.5, value: 1.6, breed: 1.05, growth: 1.05, speed: 1.15, size: 1.1, unlock: 'r_goldeye',
    look: 'Flat herring-like body with a keeled belly, small head and an enormous shining gold eye. Steel blue-green back, silver sides with a golden sheen, white belly, small dorsal fin set far back over a long anal fin, deeply forked tail.',
    colors: { back: 0x3a6a72, side: 0xd8dccc, belly: 0xf6f6f0, fin: 0xc8c4a8, accent: 0xffc22a },
  },
  {
    id: 'cisco', name: 'Cisco', latin: 'Coregonus artedi', tier: 1,
    desc: 'The lake herring. Shy, shiny, and the reason every Lake Superior town has a Friday fish fry.',
    price: 32, meal: 1.5, value: 1.4, breed: 1.15, growth: 1.1, speed: 1.1, size: 1.05, unlock: 'r_cisco',
    look: 'Slim silvery torpedo with a pointy head and the lower jaw jutting out a touch. Dark navy-blue back sharply over bright silver sides, a violet-pink iridescent line along the back, dusky-tipped fins, small adipose fin, forked tail.',
    colors: { back: 0x2e4a72, side: 0xd8dce8, belly: 0xf6f6fa, fin: 0xa8b0c0, accent: 0xc8a0d8 },
  },
  // ---------------------------------------------------------------- catfish
  {
    id: 'bullhead', name: 'Brown Bullhead', latin: 'Ameiurus nebulosus', tier: 1,
    desc: 'A whiskered little mud-puppy that eats absolutely anything. Basically a bear in fish form.',
    price: 28, meal: 2, value: 1.25, breed: 1.15, growth: 1.1, speed: 0.85, size: 1.05, unlock: 'r_bullhead',
    look: 'Stout little catfish with a broad flat head and eight dark whiskers (barbels): two up from the nose, long ones from the lips, four under the chin. Mottled chocolate-olive back and sides, creamy yellow belly, square tail, fleshy adipose fin.',
    colors: { back: 0x3a2e1c, side: 0x6e5a36, belly: 0xe2d08c, fin: 0x4a3c26, accent: 0x261c10 },
  },
  {
    id: 'catfish', name: 'Channel Catfish', latin: 'Ictalurus punctatus', tier: 2,
    desc: 'Covered head to tail in taste buds, so it is basically a swimming tongue. Bears respect that.',
    price: 170, meal: 4, value: 2.1, breed: 0.75, growth: 0.85, speed: 0.95, size: 1.6, unlock: 'r_catfish',
    look: 'Sleek catfish with a rounded head, long sweeping whiskers from the lips plus chin and nose barbels. Slate blue-grey back, silvery blue-grey sides freckled with small black spots, white belly, tall spined dorsal fin, adipose fin, deeply forked tail.',
    colors: { back: 0x465868, side: 0x8a9ca8, belly: 0xeef0ee, fin: 0x5a6a74, accent: 0x1c2228 },
  },
  // ---------------------------------------------------------------- ancient fish
  {
    id: 'bowfin', name: 'Bowfin', latin: 'Amia calva', tier: 3,
    desc: 'A living fossil that gulps air and fears nothing. Older than the dinosaurs, grumpier than Accounting.',
    price: 380, meal: 4.5, value: 2.7, breed: 0.6, growth: 0.75, speed: 1.1, size: 1.55, unlock: 'r_bowfin',
    look: 'Prehistoric tube-shaped fish with a big blunt head and a long, low ribbon dorsal fin running along most of the back. Mottled olive-brown body, dark stripes behind the eye, pale olive belly, bright green fins, rounded tail with a black eye-spot ringed in orange at its base.',
    colors: { back: 0x3e4a26, side: 0x76804a, belly: 0xd8d8a4, fin: 0x3aa848, accent: 0xf08a20 },
  },
  {
    id: 'gar', name: 'Longnose Gar', latin: 'Lepisosteus osseus', tier: 3,
    desc: 'A needle-nosed relic in diamond armour with a beak full of teeth. HR has filed several complaints.',
    price: 420, meal: 4, value: 2.9, breed: 0.55, growth: 0.75, speed: 1.4, size: 1.85, unlock: 'r_gar',
    look: 'Long armoured torpedo with a very long thin beak lined with teeth. Olive back, tan-olive sides with a diamond scale mesh, cream belly, round black spots on the rear body and on the round tail and the dorsal and anal fins set far back.',
    colors: { back: 0x48522e, side: 0x9c9a66, belly: 0xe8e4c8, fin: 0x8a7a48, accent: 0x262214 },
  },
  {
    id: 'paddlefish', name: 'Paddlefish', latin: 'Polyodon spathula', tier: 3,
    desc: 'Cruises with its mouth wide open and a canoe paddle stuck to its face. Strains plankton, bills by the hour.',
    price: 650, meal: 6, value: 3, breed: 0.5, growth: 0.65, speed: 0.95, size: 2.0, unlock: 'r_paddlefish',
    look: 'Shark-like body with an enormous flat paddle-shaped snout (a third of its length) speckled with sensory pores, tiny eye, huge gaping mouth, long pointed gill flap. Blue-grey back, pale grey sides, white belly, tall pointy dorsal, deeply forked shark tail.',
    colors: { back: 0x4a5a6c, side: 0x8c9aa8, belly: 0xe4e8ec, fin: 0x5a6a7a, accent: 0xc8d0d8 },
  },
  {
    id: 'eel', name: 'American Eel', latin: 'Anguilla rostrata', tier: 3,
    desc: 'Commutes 6,000 km to the Sargasso Sea to spawn. Bears think that is a long way to go for one meeting.',
    price: 360, meal: 4, value: 2.8, breed: 0.5, growth: 0.7, speed: 1.25, size: 1.75, unlock: 'r_eel',
    look: 'Long snake-like body that wriggles as it swims, a small pointed head with a jutting lower jaw and a tiny round pectoral fin. Dark olive-brown back, olive-yellow sides, pale yellow belly, one low fin running along the back, around the tail and under the belly.',
    colors: { back: 0x3a3a1e, side: 0x7a7a3a, belly: 0xdcd48c, fin: 0x5a5628, accent: 0x2a2a14 },
  },
  // ---------------------------------------------------------------- river trout & salmon
  {
    id: 'bulltrout', name: 'Bull Trout', latin: 'Salvelinus confluentus', tier: 2,
    desc: 'A big-headed char that bullies everything in the river. Technically not a trout. Do not tell it.',
    price: 160, meal: 3.5, value: 2.2, breed: 0.7, growth: 0.8, speed: 1.15, size: 1.5, unlock: 'r_bulltrout',
    look: 'Long char with a broad flat bull head and big jaw. Olive-grey back and sides with pale yellow spots above and pink-orange spots below, no black spots, cream-peach belly, lower fins orange with crisp white leading edges, slightly forked tail.',
    colors: { back: 0x485848, side: 0x7a8a70, belly: 0xecd8bc, fin: 0x687a62, accent: 0xec8a50 },
  },
  {
    id: 'cutthroat', name: 'Cutthroat Trout', latin: 'Oncorhynchus clarkii', tier: 2,
    desc: 'Wears a red slash under its jaw like a very aggressive necktie. Bears approve of the dress code.',
    price: 110, meal: 2.5, value: 2, breed: 0.85, growth: 0.9, speed: 1.2, size: 1.3, unlock: 'r_cutthroat',
    look: 'Trout body. Olive back, golden-olive sides with a rosy cheek, peppered with black spots that get thicker toward the tail, cream belly, and a bright red-orange slash on the throat under the lower jaw.',
    colors: { back: 0x56603a, side: 0xc4ae6c, belly: 0xf0e2c2, fin: 0xa89a62, accent: 0xe2302a },
  },
  {
    id: 'coho', name: 'Coho Salmon', latin: 'Oncorhynchus kisutch', tier: 2,
    desc: 'Silver at sea, scarlet in the river. Leaps waterfalls like it is late for a board meeting.',
    price: 140, meal: 3, value: 2.1, breed: 0.8, growth: 0.85, speed: 1.3, size: 1.4, unlock: 'r_coho',
    look: 'Spawning salmon with a hooked jaw and a gentle hump. Dark bottle-green head and back with small black spots, a wide crimson band along the flanks, slate-grey belly, black spots on the upper tail lobe, white gums.',
    colors: { back: 0x2e4a3a, side: 0xc42838, belly: 0x6e6e78, fin: 0x3e5444, accent: 0x1a2420 },
  },
  {
    id: 'pinksalmon', name: 'Pink Salmon', latin: 'Oncorhynchus gorbuscha', tier: 2,
    desc: 'The humpy. Grows a ridiculous back hump to impress the ladies. It works, every two years like clockwork.',
    price: 95, meal: 2.5, value: 1.9, breed: 0.95, growth: 0.95, speed: 1.2, size: 1.25, unlock: 'r_pinksalmon',
    look: 'Spawning male with an enormous hump behind the head and hooked jaws. Olive-grey back, rosy-pink sides with dusky olive blotches, white belly, big oval black spots on the hump and all over the tail.',
    colors: { back: 0x4e5442, side: 0xd89ca2, belly: 0xf2ece8, fin: 0x6a6a58, accent: 0x1c1c18 },
  },
  {
    id: 'kokanee', name: 'Kokanee', latin: 'Oncorhynchus nerka kennerlyi', tier: 2,
    desc: 'A sockeye that skipped the ocean and stayed home in the lake. Small, scarlet and very proud of it.',
    price: 120, meal: 2, value: 2.4, breed: 0.85, growth: 0.9, speed: 1.25, size: 1.1, unlock: 'r_kokanee',
    look: 'Small slim spawning salmon: brilliant scarlet-red body, bright emerald-green head with a small hooked jaw and white chin, green fins and tail.',
    colors: { back: 0xd02a26, side: 0xf03e2c, belly: 0xf47452, fin: 0x3a8a4a, accent: 0x2e9a4e },
  },
  {
    id: 'browntrout', name: 'Brown Trout', latin: 'Salmo trutta', tier: 2,
    desc: 'Showed up from Europe with a fancy accent and haloed spots. Fussy eater, excellent tipper.',
    price: 150, meal: 3, value: 2.2, breed: 0.75, growth: 0.85, speed: 1.15, size: 1.4, unlock: 'r_browntrout',
    look: 'Trout body. Olive-brown back, golden-brown sides with big black spots and red spots, each spot ringed by a pale halo, buttery yellow belly, orange-tipped adipose fin, square tail.',
    colors: { back: 0x5a4824, side: 0xc89a48, belly: 0xf2da92, fin: 0xa8803a, accent: 0xd83a2a },
  },
  {
    id: 'goldentrout', name: 'Golden Trout', latin: 'Oncorhynchus aguabonita', tier: 3,
    desc: 'Lives way up where the mushrooms glow. Gold as a loonie, red as a maple leaf.',
    price: 520, meal: 3, value: 3.6, breed: 0.6, growth: 0.8, speed: 1.2, size: 1.2, unlock: 'r_goldentrout',
    look: 'Trout body in brilliant gold with a red band along the side, a row of olive oval parr marks over it, red-orange belly and cheeks, black spots on the back, dorsal fin and tail, white-tipped dorsal, anal and pelvic fins.',
    colors: { back: 0x7a6a28, side: 0xf2c232, belly: 0xec5a2a, fin: 0xd8a83a, accent: 0xe03428 },
  },
  {
    id: 'sabertooth', name: 'Sabertooth Salmon', latin: 'Oncorhynchus rastrosus', tier: 4,
    desc: 'Extinct for five million years, until the mushrooms got involved. Spike fangs, battle scars, and a hump like a filing cabinet.',
    price: 1600, meal: 10, value: 4, breed: 0.35, growth: 0.5, speed: 1.15, size: 2.2, unlock: 'r_sabertooth',
    look: 'Gigantic spawning salmon: a huge hooked kype jaw with two big white spike fangs hanging forward from the snout, towering hump. Dark olive head, deep crimson back and upper flanks fading into bright silver lower sides and belly, black spots on the back and tail, pale claw-mark battle scars on the flank, a torn notch in the dorsal fin and tail.',
    colors: { back: 0x7a1620, side: 0xc42a34, belly: 0xd2d8e0, fin: 0x5a2a2a, accent: 0xf6f0e0 },
  },
  // ---------------------------------------------------------------- hybrids (discovered by cross-breeding)
  {
    id: 'sunperch', name: 'Sunburst Perch', latin: 'Lepomis × Perca', tier: 2,
    desc: 'Bluegill × Perch. Turquoise and gold, like a sunrise on Georgian Bay.',
    price: 0, meal: 1.5, value: 2, breed: 1.1, growth: 1.1, speed: 1.05, size: 1.0, unlock: 'hybrid', parents: ['bluegill', 'perch'],
    look: 'Round-ish perch/sunfish mix. Turquoise back and sides with orange-gold vertical bars, sunny yellow belly, orange fins.',
    colors: { back: 0x2a8a8a, side: 0x48c0b0, belly: 0xf6d040, fin: 0xf08a3a, accent: 0xf0a030 },
  },
  {
    id: 'goldseed', name: 'Sunny Goldie', latin: 'Carassius × Lepomis', tier: 2,
    desc: 'Goldfish × Pumpkinseed. A glowing tangerine sunfish with a flowing tail. Pure cottage vibes.',
    price: 0, meal: 1.2, value: 2.2, breed: 1.2, growth: 1.2, speed: 0.95, size: 0.95, unlock: 'hybrid', parents: ['goldfish', 'pumpkinseed'],
    look: 'Round sunfish shape with a long flowing goldfish tail. Bright tangerine body, turquoise cheek squiggles, lemon belly, translucent orange fins.',
    colors: { back: 0xe06a1a, side: 0xf8a030, belly: 0xffe070, fin: 0xffb060, accent: 0x40d8d0 },
  },
  {
    id: 'bassgill', name: 'Bassgill', latin: 'Micropterus × Lepomis', tier: 2,
    desc: 'Bass × Bluegill. A chonky round boi with a big grin.',
    price: 0, meal: 2.5, value: 2, breed: 1.0, growth: 1.0, speed: 0.95, size: 1.15, unlock: 'hybrid', parents: ['bass', 'bluegill'],
    look: 'Very round, chubby body with a big bass mouth. Teal-green back, sea-green sides with 3 dark bars, orange belly, blue-grey fins.',
    colors: { back: 0x3a6a5a, side: 0x6aa07a, belly: 0xf0a040, fin: 0x4a7a8a, accent: 0x2a4e40 },
  },
  {
    id: 'tiger', name: 'Tiger Trout', latin: 'Salvelinus × Salmo', tier: 3,
    desc: 'Brook × Rainbow. A maze of golden tiger stripes. Rare and fierce.',
    price: 0, meal: 2.5, value: 3, breed: 0.85, growth: 0.9, speed: 1.2, size: 1.25, unlock: 'hybrid', parents: ['brook', 'rainbow'],
    look: 'Trout body covered in a dense maze of dark wavy vermiculations over golden-tan sides, cream belly, orange lower fins.',
    colors: { back: 0x6a5a28, side: 0xd8a848, belly: 0xf4e0b0, fin: 0xd8804a, accent: 0x3a3018 },
  },
  {
    id: 'splake', name: 'Splake', latin: 'S. namaycush × fontinalis', tier: 3,
    desc: 'Lake Trout × Brook Trout. A real Canadian hybrid, first bred in Ontario. Tough as a snowplow.',
    price: 0, meal: 3, value: 2.8, breed: 0.8, growth: 0.9, speed: 1.1, size: 1.35, unlock: 'hybrid', parents: ['laketrout', 'brook'],
    look: 'Char body with a slightly forked tail. Dark green-grey back with pale worm marks, sides with cream spots and a few red spots, peach-orange belly, lower fins with white edges.',
    colors: { back: 0x3a4a3a, side: 0x6a7a5a, belly: 0xf0a070, fin: 0xd87a4a, accent: 0xe8e0c0 },
  },
  {
    id: 'aurora', name: 'Aurora Salmon', latin: 'Oncorhynchus borealis', tier: 3,
    desc: 'Sockeye × Rainbow. Shimmers like the northern lights. Bears weep.',
    price: 0, meal: 3, value: 5, breed: 0.7, growth: 0.85, speed: 1.25, size: 1.4, unlock: 'hybrid', parents: ['sockeye', 'rainbow'],
    look: 'Salmon body that shifts from green at the head through cyan-blue to violet at the tail, like an aurora. Tiny white star-like spots, pale mint belly, violet fins.',
    colors: { back: 0x3a2a7a, side: 0x3ac8a0, belly: 0xb8f0e0, fin: 0x9a5ad8, accent: 0xe8fff0 },
  },
  {
    id: 'sparctic', name: 'Sparctic Char', latin: 'S. fontinalis × alpinus', tier: 3,
    desc: 'Brook × Arctic Char. A real Canadian hybrid with a molten-copper belly.',
    price: 0, meal: 4, value: 4, breed: 0.65, growth: 0.8, speed: 1.15, size: 1.3, unlock: 'hybrid', parents: ['brook', 'char'],
    look: 'Char body. Dark teal-grey back with pale squiggles, bronze sides with peach spots, molten copper-orange belly, orange fins with white edges.',
    colors: { back: 0x2e3e3a, side: 0x7a6a4a, belly: 0xff7a2a, fin: 0xff6a2a, accent: 0xffc0a0 },
  },
  {
    id: 'pikeeye', name: 'Pikeye', latin: 'Esox × Sander', tier: 3,
    desc: 'Pike × Walleye. Long, spotty and its eyes glow at night. Spooky!',
    price: 0, meal: 5, value: 4.5, breed: 0.6, growth: 0.75, speed: 1.3, size: 1.6, unlock: 'hybrid', parents: ['pike', 'walleye'],
    look: 'Long pike body with walleye colouring: olive-gold with dark saddles and pale yellow spots, huge glowing pale-green eyes, white tail tip.',
    colors: { back: 0x5a6a2c, side: 0xa8a848, belly: 0xf0ecd0, fin: 0xa89040, accent: 0xd8ffb0 },
  },
  {
    id: 'tigermuskie', name: 'Tiger Muskie', latin: 'Esox masquinongy × lucius', tier: 4,
    desc: 'Muskie × Pike. Nature\'s own hybrid apex predator. The interns are terrified of it.',
    price: 0, meal: 7, value: 5, breed: 0.5, growth: 0.7, speed: 1.35, size: 1.8, unlock: 'hybrid', parents: ['muskie', 'pike'],
    look: 'Huge pike body with sharp broken tiger stripes of dark olive over bright silver-green, rounded fin tips with dark spots, cream belly.',
    colors: { back: 0x4a5a3a, side: 0xc0c8a0, belly: 0xf0eee0, fin: 0xb08a4a, accent: 0x2a3420 },
  },
  {
    id: 'mapleKoi', name: 'Maple Leaf Koi', latin: 'Cyprinus canadensis', tier: 4,
    desc: 'Aurora × Sparctic. White as fresh snow with red maple-leaf patches. Legendary.',
    price: 0, meal: 6, value: 10, breed: 0.5, growth: 0.7, speed: 1.0, size: 1.45, unlock: 'hybrid', parents: ['aurora', 'sparctic'],
    look: 'Elegant koi: pearl-white body with bold crimson patches, one patch on the back shaped like a maple leaf, long flowing white fins with a red tint, two little whiskers, gold eye.',
    colors: { back: 0xf6f2ea, side: 0xfaf8f2, belly: 0xffffff, fin: 0xf0e8e0, accent: 0xd52b1e },
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

// Hybrid recipes, order-independent: "a|b" -> hybrid id
export const HYBRIDS = {};
for (const s of SPECIES) if (s.parents) {
  const [a, b] = s.parents;
  HYBRIDS[`${a}|${b}`] = s.id;
  HYBRIDS[`${b}|${a}`] = s.id;
}

export const GOLDEN_MULT = 5;

// ---------------------------------------------------------------- genes
// Rarity tiers shared by eggs, genes and the hatch ceremony.
export const RARITIES = [
  { id: 'common', name: 'Common', color: '#d8d2c0', glow: '#ffffff' },
  { id: 'uncommon', name: 'Uncommon', color: '#6cc04a', glow: '#b8ff90' },
  { id: 'rare', name: 'Rare', color: '#3c8ce0', glow: '#9ad4ff' },
  { id: 'epic', name: 'Epic', color: '#a050e0', glow: '#e0a8ff' },
  { id: 'legendary', name: 'Legendary', color: '#ffb020', glow: '#fff0a0' },
];

// Colour morphs (palette variants of every species sprite).
// `chance` = base roll per egg, `value` = coin multiplier, `stars` = rarity bump.
export const MORPHS = {
  normal: { name: 'Wild Type', chance: 1, value: 1, stars: 0 },
  albino: { name: 'Albino', chance: 0.035, value: 1.6, stars: 1, desc: 'Pale pink-white with ruby eyes.' },
  melanistic: { name: 'Melanistic', chance: 0.035, value: 1.6, stars: 1, desc: 'Smoky black with a shadowy sheen.' },
  calico: { name: 'Calico', chance: 0.025, value: 1.8, stars: 1, desc: 'Patchwork of white, orange and black, like a koi.' },
  ghost: { name: 'Ghost', chance: 0.012, value: 2.5, stars: 2, desc: 'Nearly see-through, glowing faintly blue.' },
  golden: { name: 'Golden', chance: 0.01, value: GOLDEN_MULT, stars: 2, desc: 'Solid gold shimmer. Worth five times as much.' },
  rainbow: { name: 'Prismatic', chance: 0.003, value: 8, stars: 3, desc: 'Every colour of the aurora at once. Once in a lifetime.' },
};
export const MORPH_IDS = Object.keys(MORPHS);

// Mutations: rare, flashy egg-roll bonuses on top of the morph. They push the
// fish's rarity up and multiply its value. tint = sprite colour multiplier,
// scale = size multiplier, fx = particle effect the fish trails.
export const MUTATIONS = {
  tiny: { name: 'Tiny', chance: 0.05, value: 0.9, stars: 0, color: '#9ad0ff', tint: [1, 1, 1], scale: 0.6, fx: 'none' },
  frozen: { name: 'Frozen', chance: 0.035, value: 2, stars: 1, color: '#8ee8ff', tint: [0.75, 0.95, 1.35], scale: 1, fx: 'frost' },
  candy: { name: 'Candy', chance: 0.03, value: 2, stars: 1, color: '#ff8ad8', tint: [1.35, 0.85, 1.15], scale: 1, fx: 'sprinkles' },
  hot: { name: 'Hot', chance: 0.025, value: 2.5, stars: 1, color: '#ff6a2a', tint: [1.4, 0.8, 0.6], scale: 1, fx: 'flame' },
  zombie: { name: 'Zombie', chance: 0.02, value: 1.8, stars: 1, color: '#8ad050', tint: [0.8, 1.25, 0.7], scale: 1, fx: 'stink' },
  shiny: { name: 'Shiny', chance: 0.015, value: 3, stars: 2, color: '#fff27a', tint: [1.2, 1.15, 0.95], scale: 1, fx: 'sparkle' },
  titan: { name: 'Titan', chance: 0.012, value: 3.5, stars: 2, color: '#c0a070', tint: [1, 1, 1], scale: 1.9, fx: 'stomp' },
  doge: { name: 'Doge', chance: 0.01, value: 4, stars: 2, color: '#f0b040', tint: [1.35, 1.1, 0.65], scale: 1.05, fx: 'wow' },
  doublehot: { name: 'Double Hot', chance: 0.006, value: 5, stars: 3, color: '#ff2a2a', tint: [1.6, 0.6, 0.45], scale: 1.1, fx: 'bigflame' },
  galaxy: { name: 'Galaxy', chance: 0.003, value: 8, stars: 3, color: '#a070ff', tint: [0.8, 0.7, 1.5], scale: 1.1, fx: 'stars' },
};
export const MUTATION_IDS = Object.keys(MUTATIONS);

// Personality traits a fish can be born with (0-2 each).
export const TRAITS = {
  fertile: { name: 'Fertile', icon: 'heart', desc: 'Breeds 50% more often.', good: true },
  chonky: { name: 'Chonky', icon: 'food', desc: '+35% meal & value. A proper unit.', good: true },
  speedy: { name: 'Speedy', icon: 'bolt', desc: 'Much harder for bears to catch.', good: true },
  lucky: { name: 'Lucky', icon: 'clover', desc: 'Bears that eat it tip double.', good: true },
  sparkly: { name: 'Sparkly', icon: 'sparkle', desc: 'So pretty it adds +1 beauty to the pond.', good: true },
  hardy: { name: 'Hardy', icon: 'shield', desc: 'Grows up fast and rarely goes hungry.', good: true },
  glutton: { name: 'Glutton', icon: 'food', desc: 'Always hungry. Eats twice as much food.', good: false },
  shy: { name: 'Shy', icon: 'question', desc: 'Hides under lily pads and platforms.', good: false },
};
export const TRAIT_IDS = Object.keys(TRAITS);
