// Bear customers. Colours feed the voxel model builder; stats feed the AI.
export const BEAR_TYPES = {
  office: {
    name: 'Office Bear', job: 'Middle Management', icon: 'bear_office',
    fur: 0x7a4a2a, furLight: 0xc0925e, suit: 0x2a3550, suitDark: 0x1c2438, shirt: 0xf2f2ee, tie: 0xc0392b,
    hat: null, item: 'briefcase', scale: 1, appetite: [1.5, 2.5], patience: 38, pay: 1, speed: 1, fromDay: 1, weight: 10,
  },
  intern: {
    name: 'Intern', job: 'Unpaid Intern', icon: 'bear_intern',
    fur: 0xa4632e, furLight: 0xdcaa72, suit: 0xf0f0ec, suitDark: 0xd0d0cc, shirt: 0xf0f0ec, tie: 0x3a6ad0, lanyard: 0x2a5ad0,
    hat: null, item: 'coffee', scale: 0.84, appetite: [1, 1.5], patience: 46, pay: 0.8, speed: 1.1, fromDay: 1, weight: 6,
  },
  janitor: {
    name: 'Janitor', job: 'Facilities Management', icon: 'bear_janitor',
    fur: 0x6a4a30, furLight: 0xb08a60, suit: 0x3a5a8a, suitDark: 0x2a4470, shirt: 0x3a5a8a, tie: null, straps: 0x2a4470,
    hat: 'cap', hatColor: 0x7a7a80, item: 'mop', scale: 1, appetite: [1.5, 2.5], patience: 40, pay: 0.95, speed: 0.95, fromDay: 4, weight: 5,
    wants: ['seaweed'],
  },
  accountant: {
    name: 'Accountant', job: 'Accounts Payable', icon: 'bear_accountant',
    fur: 0x2c2622, furLight: 0xa88a66, suit: 0x3a6a4a, suitDark: 0x2a5038, shirt: 0xf0efe0, tie: null, bowtie: 0xc03040, glasses: 0x1a1a1a,
    hat: null, item: 'calculator', scale: 0.95, appetite: [2, 2.5], patience: 40, pay: 1.05, speed: 0.95, fromDay: 5, weight: 5,
    wants: ['honey'],
  },
  boss: {
    name: 'Big Boss', job: 'Regional Vice President', icon: 'bear_boss',
    fur: 0x5a3a22, furLight: 0xb89a78, suit: 0x3a3a42, suitDark: 0x2a2a30, shirt: 0xf2f2ee, tie: 0xd8a830, pinstripe: 0x5a5a64,
    hat: 'fedora', hatColor: 0x2a2a2e, cigar: true, item: 'briefcase', scale: 1.22, appetite: [3, 4.5], patience: 34, pay: 1.8, speed: 0.9, fromDay: 7, weight: 3,
  },
  construction: {
    name: 'Construction Bear', job: 'Site Foreman', icon: 'bear_construction',
    fur: 0x7a5030, furLight: 0xc49a6a, suit: 0xf07a20, suitDark: 0xc85a10, shirt: 0x6a7a8a, tie: null, vest: 0xf0f060,
    hat: 'hardhat', hatColor: 0xf2c230, item: 'lunchbox', scale: 1.1, appetite: [3, 4], patience: 30, pay: 1.2, speed: 1.05, fromDay: 8, weight: 4, rampage: 2,
  },
  lumberjack: {
    name: 'Lumberjack', job: 'Forestry Division', icon: 'bear_lumberjack',
    fur: 0x6a3a1a, furLight: 0xb07a4a, suit: 0xc0302a, suitDark: 0x1a1a1a, shirt: 0xc0302a, tie: null, flannel: true,
    hat: 'toque', hatColor: 0xd83a2a, item: 'thermos', scale: 1.08, appetite: [2.5, 3.5], patience: 36, pay: 1.15, speed: 1, fromDay: 10, weight: 4,
    wants: ['syrup'],
  },
  tourist: {
    name: 'Tourist', job: 'On Vacation (from HR)', icon: 'bear_tourist',
    fur: 0x8a5a30, furLight: 0xc8a070, suit: 0x2ab0a0, suitDark: 0x1a8a80, shirt: 0x2ab0a0, tie: null, hawaiian: true, shades: 0x101010,
    hat: null, item: 'camera', scale: 1, appetite: [2, 3], patience: 42, pay: 1.1, speed: 0.9, fromDay: 9, weight: 3,
    wants: ['berries'],
  },
  critic: {
    name: 'Food Critic', job: 'The Bear Street Journal', icon: 'bear_critic',
    fur: 0x8a6a4a, furLight: 0xd0b08a, suit: 0x5a2a4a, suitDark: 0x401e36, shirt: 0xf0e8e0, tie: null, scarf: 0xe0c040,
    hat: 'beret', hatColor: 0x2a2a30, item: 'notepad', scale: 1, appetite: [2, 2], patience: 34, pay: 1.3, speed: 0.9, fromDay: 9, weight: 0,
    critic: true, reviewWeight: 4,
  },
  ceo: {
    name: 'The CEO', job: 'Chairman of the Board', icon: 'bear_ceo',
    fur: 0xeeeee6, furLight: 0xffffff, suit: 0x18181c, suitDark: 0x0e0e10, shirt: 0xffffff, tie: null, bowtie: 0x101010, monocle: 0xe8c040,
    hat: 'tophat', hatColor: 0x151518, item: 'cane', scale: 1.42, appetite: [6, 8], patience: 46, pay: 2.6, speed: 0.85, fromDay: 12, weight: 0,
    boss: true, reviewWeight: 3, rampage: 3,
  },
  cub: {
    name: 'Bear Cub', job: 'Bring-Your-Cub-To-Work Day', icon: 'bear_cub',
    fur: 0x8a5a30, furLight: 0xd0a878, suit: 0x5ab0e0, suitDark: 0x3a90c0, shirt: 0x5ab0e0, tie: null,
    hat: 'propeller', hatColor: 0xe8403a, item: null, scale: 0.58, appetite: [1, 1], patience: 46, pay: 0.55, speed: 1.2, fromDay: 99, weight: 0,
    wants: ['berries'],
  },

  // ---------------------------------------------------------- everyday (v3)
  // Optional look fields read by entities/bearRig.js: outfit (force an outfit
  // style), shape (voxel proportions, see SHAPE in bearRig), beard, pearls,
  // skirt, sneakers, accent (extra accessory colour), grizzle, scar...
  jogger: {
    name: 'Jogger', job: 'Wellness Committee', icon: 'bear_jogger',
    fur: 0x9a6236, furLight: 0xd8aa76, suit: 0x7a3ab8, suitDark: 0x55247e, shirt: 0x7a3ab8, tie: null, outfit: 'tracksuit', stripe: 0xf6f2ff,
    sneakers: 0xf4f4f0, accent: 0x3ad0c0,
    hat: 'headband', hatColor: 0xe8403a, item: 'bottle', scale: 0.96, appetite: [2, 3], patience: 30, pay: 1, speed: 1.3, fromDay: 2, weight: 5,
    shape: { belly: { rx: 5.6, rz: 4.7 }, torso: { rx: 6.7 } },
  },
  grandma: {
    name: 'Grandma Bear', job: 'Retired (Still Visits)', icon: 'bear_grandma',
    fur: 0x9a826e, furLight: 0xe6d8c8, suit: 0xb894cc, suitDark: 0x8a6aa0, shirt: 0xf6eee2, tie: null, outfit: 'cardigan', pearls: 0xf8f4ec,
    glasses: 0x8a5a3a, skirt: 0x6a3a5a,
    hat: 'bun', hatColor: 0xdcd8d4, item: 'handbag', itemColor: 0x8a2a3a, scale: 0.88, appetite: [1.5, 2], patience: 52, pay: 1.2, speed: 0.75, fromDay: 3, weight: 4,
    wants: ['berries'],
    shape: { belly: { rx: 6.6, ry: 4.6, rz: 5.6 } },
  },
  hipster: {
    name: 'Hipster', job: 'Brand Storyteller', icon: 'bear_hipster',
    fur: 0x5a3a24, furLight: 0xb08a64, suit: 0x3a7a4a, suitDark: 0x16241c, shirt: 0x3a7a4a, tie: null, flannel: true, glasses: 0x24160e, beard: 0x3a2414,
    hat: 'beanie', hatColor: 0xd8a032, item: 'coffee', scale: 1.02, appetite: [1.5, 2.5], patience: 40, pay: 1.05, speed: 0.95, fromDay: 2, weight: 5,
    wants: ['mushroom'],
    shape: { belly: { rx: 5.7, rz: 4.9 }, torso: { rx: 6.8 } },
  },
  foreman_cub: {
    name: 'Little Foreman', job: 'Junior Site Supervisor', icon: 'bear_foreman_cub',
    fur: 0xb07a40, furLight: 0xe8c08a, suit: 0xf07a20, suitDark: 0xc85a10, shirt: 0x6a7a8a, tie: null, vest: 0xf0f060,
    hat: 'hardhat', hatColor: 0xf2c230, item: 'blueprint', scale: 0.62, appetite: [1, 1.5], patience: 44, pay: 0.7, speed: 1.15, fromDay: 4, weight: 3,
    wants: ['berries'],
  },

  // ---------------------------------------------------------- BOSSES (v3)
  // boss: true + hp (hits to calm down). weight 0: the game schedules them.
  shareholder: {
    name: 'The Shareholder', job: 'Majority Stake', icon: 'bear_shareholder',
    fur: 0x6a4224, furLight: 0xc49a6c, suit: 0x2e2836, suitDark: 0x1e1a24, shirt: 0xf4f0e6, tie: 0xe8b830, pinstripe: 0x7a6432,
    outfit: 'threepiece', waistcoat: 0x6a1e2a, grizzle: 0xd8c0a0, scar: true, cigar: true, watch: 0xf0c848,
    hat: 'tophat', hatColor: 0x1a161c, hatBand: 0xd8a830, item: 'moneybag', scale: 2.6, appetite: [10, 13], patience: 40, pay: 3.4, speed: 0.8, fromDay: 5, weight: 0,
    boss: true, hp: 7, reviewWeight: 4, rampage: 4, glow: 0xffb020,
    shape: {
      torso: { rx: 8.1, ry: 5.7, rz: 6.0, cy: 13.8, taper: 0.5 },
      belly: { rx: 7.6, ry: 5.6, rz: 6.6, cy: 12.0, cz: 3.0, p: 2.1 },
      arm: { rx: 2.6, rz: 2.6 }, off: { armL: [-1.4, 0, 0.4], armR: [1.4, 0, 0.4], legL: [-0.7, 0, 0], legR: [0.7, 0, 0], head: [0, 0.4, 0.9] },
      leg: { rx: 2.7, rz: 2.6 },
    },
  },
  enforcer: {
    name: 'Kodiak Enforcer', job: 'Head of Security', icon: 'bear_enforcer',
    fur: 0x5a3a20, furLight: 0xa88058, suit: 0x30344a, suitDark: 0x20232f, shirt: 0xf2f2ee, tie: 0x101014, shades: 0x0a0a10,
    earpiece: 0xd8dce4, armband: 0xf2c230, buzzcut: true,
    hat: null, item: null, scale: 2.8, appetite: [12, 15], patience: 32, pay: 3.0, speed: 0.95, fromDay: 9, weight: 0,
    boss: true, hp: 9, reviewWeight: 4, rampage: 6, glow: 0xff3030,
    shape: {
      torso: { rx: 10.6, ry: 6.8, rz: 6.2, cy: 14.6, p: 3.6, taper: -0.34, taperY: 13 },
      belly: { rx: 7.4, ry: 4.4, rz: 5.6, cy: 11.8, cz: 2.2 },
      arm: { rx: 3.1, rz: 3.1, ry: 6.6, cy: 12.0 }, off: { armL: [-4.9, 2.6, 0.2], armR: [4.9, 2.6, 0.2], legL: [-1.5, 0, 0], legR: [1.5, 0, 0], head: [0, 0.6, 1.6] },
      leg: { rx: 2.9, rz: 2.8 }, headScale: 0.8,
    },
  },
  auditor: {
    name: 'Polar Auditor', job: 'External Audit', icon: 'bear_auditor',
    fur: 0xf0eee4, furLight: 0xffffff, suit: 0x8a8e96, suitDark: 0x62666e, shirt: 0xeef4fa, tie: 0x2a4a7a, outfit: 'trench', halfmoon: 0xd8b860,
    icy: true, item: 'clipboard',
    hat: null, scale: 2.4, appetite: [9, 12], patience: 26, pay: 3.2, speed: 0.85, fromDay: 14, weight: 0,
    boss: true, hp: 10, reviewWeight: 6, rampage: 3, glow: 0x8fe8ff,
    shape: {
      torso: { rx: 7.0, ry: 7.6, rz: 5.0, cy: 15.0, taper: 0.3, taperY: 16.5 },
      belly: { rx: 5.9, ry: 5.0, rz: 5.1, cy: 13.4, cz: 2.0 },
      off: { head: [0, 3.4, 0.4], armL: [-0.4, 2.6, 0], armR: [0.4, 2.6, 0] },
      arm: { ry: 5.8, cy: 12.2 },
    },
  },
  spirit: {
    name: 'Spirit Bear Legend', job: 'Founder (Retired, Mythical)', icon: 'bear_spirit',
    fur: 0xf2eee0, furLight: 0xfffcf2, suit: 0xf2eee0, suitDark: 0xd8d2c0, shirt: 0xffffff, tie: 0x5ff0b0, outfit: 'fur', aurora: true,
    markings: 0x5ff8ff, spiritEyes: true,
    hat: null, item: null, scale: 3.0, appetite: [14, 18], patience: 48, pay: 5, speed: 0.8, fromDay: 20, weight: 0,
    boss: true, hp: 12, reviewWeight: 8, rampage: 5, glow: 0x5ff8ff,
    shape: {
      torso: { rx: 8.6, ry: 6.2, rz: 6.1, cy: 14.2, taper: 0.22 },
      hump: { cy: 18.8, cz: -2.6, rx: 6.6, ry: 3.6, rz: 4.4 },
      belly: { rx: 7.0, ry: 5.0, rz: 6.0, cy: 12.2, cz: 2.4 },
      arm: { rx: 2.8, rz: 2.8, ry: 5.8 }, off: { armL: [-1.6, 0.4, 0.4], armR: [1.6, 0.4, 0.4], legL: [-0.9, 0, 0], legR: [0.9, 0, 0], head: [0, 0.2, 1.8] },
      leg: { rx: 2.8, rz: 2.8 },
    },
  },
};

export const FIRST_NAMES = ['Gary', 'Brenda', 'Doug', 'Linda', 'Barry', 'Kevin', 'Deb', 'Bjorn', 'Ursula', 'Theo', 'Bruno', 'Marge', 'Stan', 'Carol',
  'Wayne', 'Gord', 'Sheila', 'Rhonda', 'Murray', 'Trevor', 'Darlene', 'Chad', 'Tiff', 'Dale', 'Cheryl', 'Norm', 'Bev', 'Clive', 'Pam', 'Rolf',
  'Hank', 'Gail', 'Ted', 'Bernie', 'Wendy', 'Lorne', 'Yvonne', 'Denis', 'Marcel', 'Sylvie', 'Kody', 'Brad', 'Joanne', 'Otis', 'Mabel'];
export const DEPARTMENTS = ['Accounts Payable', 'HR', 'Legal', 'Marketing', 'IT', 'Sales', 'Compliance', 'Synergy', 'Q3 Projections', 'Mailroom',
  'Payroll', 'Logistics', 'R&D', 'Customer Success', 'Risk', 'Procurement', 'the C-Suite', 'Middle Management', 'Honey Futures', 'Salmon Derivatives'];

export const WANT_INFO = {
  seaweed: { name: 'seaweed salad', icon: 'seaweed', bonus: 6 },
  honey: { name: 'honey', icon: 'honey', bonus: 10 },
  syrup: { name: 'maple syrup', icon: 'syrup', bonus: 12 },
  berries: { name: 'blueberries', icon: 'berry', bonus: 7 },
  rice: { name: 'wild rice', icon: 'wildrice', bonus: 8 },
  mushroom: { name: 'chanterelles', icon: 'mushroom', bonus: 11 },
};

export const REVIEWS = {
  5: ['Best fish this side of Hudson Bay!', 'Fresh, fast and fishy. 10/10.', 'Worth skipping overtime for.', 'The fox is shady but the trout is not.',
    'Chef\'s kiss. Well, bear\'s kiss.', 'Came for the fish, stayed for the fish.', 'I\'m telling the whole floor about this place!', 'Five stars. Would cannonball again.'],
  4: ['Solid catch. Would dive again.', 'Good eats, bit pricey. Classic fox.', 'Tasty! Needs more napkins.', 'A lovely end to a long day of spreadsheets.',
    'Almost perfect. Almost.', 'The pond is cozy and the fish are plump.'],
  3: ['It was... fine.', 'Decent, but I\'m still a little peckish.', 'Average pond, average fish, average fox.', 'Meh. The fish kept running away.'],
  2: ['Still hungry. Disappointed.', 'The fish ran away faster than my stocks.', 'Barely a snack. Do better, fox.', 'Not worth the commute.'],
  1: ['Empty pond, empty promises.', 'I\'ve had better fish from a vending machine.', 'One star. The star is for the sunset.', 'Where were the FISH?!'],
  0: ['RAWR!!! NO FISH?! ZERO STARS!', 'I\'m telling everyone at the office.', 'Worst pond in the valley. Avoid!', 'This fox is a fraud. A FRAUD!',
    'I demand to speak to the manager. Oh, it\'s the fox. Ugh.', 'Smashed a thing. Feel better. Still zero stars.'],
};

export const WANT_COMPLAINTS = {
  seaweed: ['Where\'s my seaweed salad?!', 'No greens? My doctor will hear of this.'],
  honey: ['Where\'s the HONEY, fox?!', 'A pond with no honey. Unbearable.'],
  syrup: ['No maple syrup? How unpatriotic.', 'Sorry, but no syrup is a crime in Canada.'],
  berries: ['I was promised blueberries!', 'No berries for the cubs? Harsh.'],
  rice: ['No wild rice? What is this, a strip mall?', 'I wanted manoomin, not excuses.'],
  mushroom: ['Not a single chanterelle. Tragic.', 'Where are the foraged mushrooms?!'],
  species: ['That wasn\'t what I ordered.', 'I specifically wanted something else.'],
};

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ---------------------------------------------------------------- speech bubbles
// Short lines for the comic speech bubbles (kept tiny so they fit).
export const LINES = {
  arrive: ['FOOD!', 'Finally!', 'Shift\'s over!', 'Last one in pays!', 'Fish o\'clock!', 'So hungry...', 'TGIF!', 'Yahoo!', 'Cannonball!', 'Snack time!'],
  hunt: ['Here fishy...', 'Come to papa!', 'Mine!', 'Gotcha... almost!', 'Stay still!', 'Slippery!'],
  eat: ['NOM', 'Mmmf!', 'So fresh!', 'Crunchy!', 'Juicy!', 'Delish!'],
  yum: ['YUMMY!', 'Heavenly!', 'Chef\'s kiss!', 'Perfection!', 'Oh wow!', 'More!'],
  snack: ['Berry nice!', 'Sweet!', 'So good!', 'Mmm, sides!', 'Healthy-ish!'],
  angry: ['RAWR!!', 'NO FISH?!', 'I\'m FURIOUS!', 'Manager!', 'Unacceptable!', 'SMASH!'],
  full: ['So full...', 'Burp!', '*pat pat*', 'Worth it.', 'Food coma...', 'Ahh...'],
  leave: ['See ya!', 'Back to work...', 'Worth it!', 'Night, fox!', 'Bye!'],
  golden: ['GOLD?!', 'Is that... gold?', 'Rich taste!'],
};

// Coworker banter during the feast (pairs: speaker line, reply line)
export const CHATTER = [
  ['Karen, you HAVE to try the bluegill.', 'Is it gluten free?'],
  ['This perch really moves the needle.', 'Let\'s circle back to dessert.'],
  ['Best synergy all quarter!', 'Agreed. Put it in the minutes.'],
  ['Don\'t tell HR I\'m on my fourth fish.', 'Your secret\'s safe. Pass the trout.'],
  ['Is this... organic?', 'It\'s a pond, Gary.'],
  ['The fox is shady.', 'The fish is not. Eat.'],
  ['Deadline tomorrow?', 'Not tonight. Tonight we FEAST.'],
  ['Pass the tartar sauce!', 'We\'re bears, Doug.'],
  ['Those trout are premium!', 'Expense it as a team offsite.'],
  ['My doctor said more fish.', 'Your doctor is a genius.'],
  ['I love this job.', 'You love the pond.'],
  ['Honey on fish? Bold.', 'Innovation, Brenda!'],
  ['That fish looked at me!', 'Then it\'s a meeting. Eat it.'],
  ['Q3 numbers are up!', 'So is my cholesterol.'],
  ['Who ordered the pike?', 'The baguette? Me!'],
  ['Should we tip the fox?', 'He\'ll take it either way.'],
  ['This is my lunch AND dinner.', 'And breakfast. No judgement.'],
  ['Selfie with the salmon!', '#PondLife'],
];

export const BEAR_WANT_LINES = {
  seaweed: 'Seaweed?', honey: 'Honey?', syrup: 'Syrup?', berries: 'Berries?', rice: 'Wild rice?', mushroom: 'Mushrooms?',
};
