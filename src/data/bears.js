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
    wants: ['veggie'],
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

  // [v18 bear events] ------------------------------------------ 5-DAY BOSSES + BLOOD MOON BEARS
  // Scheduled by src/game/BossFight.js (day 5, 10, 15...) and src/game/BloodMoon.js (day 7, 14...).
  // fromDay 999 + weight 0: never rolled into a normal wave.
  hr_mama: {
    name: 'Mama Grizzly', job: 'Director of Human Resources', icon: 'bear_boss',
    fur: 0x7a4a26, furLight: 0xd8aa76, suit: 0xc0507a, suitDark: 0x8a3458, shirt: 0xf6eee2, tie: null, outfit: 'cardigan', pearls: 0xf8f4ec,
    glasses: 0x8a2a4a, skirt: 0x5a2a44, grizzle: 0xc8a882,
    hat: 'bun', hatColor: 0x6a4424, item: 'handbag', itemColor: 0x6a1a3a, scale: 2.5, appetite: [10, 12], patience: 40, pay: 3, speed: 0.85, fromDay: 999, weight: 0,
    boss: true, hp: 8, reviewWeight: 4, rampage: 4, glow: 0xff5aa0,
    shape: { belly: { rx: 7.4, ry: 5.2, rz: 6.4, cy: 12.2, cz: 2.6 }, torso: { rx: 7.8, ry: 5.6 }, arm: { rx: 2.6, rz: 2.6 }, leg: { rx: 2.6, rz: 2.5 } },
  },
  tycoon: {
    name: 'The Grizzly Tycoon', job: 'Owns The Company That Owns Your Company', icon: 'bear_boss',
    fur: 0x4a2c18, furLight: 0xb08458, suit: 0xc89a2a, suitDark: 0x8a6418, shirt: 0xfff8e8, tie: 0x7a1020, pinstripe: 0xf0d070,
    outfit: 'threepiece', waistcoat: 0x2a1a30, monocle: 0xf0d050, cigar: true, watch: 0xf0c848, grizzle: 0xd0b890, scar: true,
    hat: 'tophat', hatColor: 0x2a1e10, hatBand: 0xf0c040, item: 'cane', scale: 2.8, appetite: [14, 16], patience: 40, pay: 4.5, speed: 0.85, fromDay: 999, weight: 0,
    boss: true, hp: 11, reviewWeight: 6, rampage: 6, glow: 0xffd040,
    shape: {
      torso: { rx: 8.4, ry: 5.8, rz: 6.2, cy: 13.8, taper: 0.45 },
      belly: { rx: 8.0, ry: 5.8, rz: 7.0, cy: 12.0, cz: 3.2, p: 2.1 },
      arm: { rx: 2.7, rz: 2.7 }, off: { armL: [-1.6, 0, 0.4], armR: [1.6, 0, 0.4], legL: [-0.8, 0, 0], legR: [0.8, 0, 0], head: [0, 0.4, 1.0] },
      leg: { rx: 2.8, rz: 2.7 },
    },
  },
  ursa: {
    name: 'Ursa Major', job: 'The Great Bear (A Constellation)', icon: 'bear_boss',
    fur: 0x1e2246, furLight: 0x4a4e86, suit: 0x1e2246, suitDark: 0x14183a, shirt: 0x2a2e5a, tie: 0xfff0a0, outfit: 'fur', aurora: true,
    markings: 0xfff0a0, spiritEyes: true,
    hat: null, item: null, scale: 3.3, appetite: [16, 20], patience: 48, pay: 6, speed: 0.85, fromDay: 999, weight: 0,
    boss: true, hp: 14, reviewWeight: 8, rampage: 7, glow: 0xfff0a0,
    shape: {
      torso: { rx: 8.8, ry: 6.4, rz: 6.2, cy: 14.2, taper: 0.2 },
      hump: { cy: 19.0, cz: -2.6, rx: 7.0, ry: 3.8, rz: 4.6 },
      belly: { rx: 7.2, ry: 5.0, rz: 6.0, cy: 12.2, cz: 2.4 },
      arm: { rx: 2.9, rz: 2.9, ry: 6.0 }, off: { armL: [-1.8, 0.4, 0.4], armR: [1.8, 0.4, 0.4], legL: [-1.0, 0, 0], legR: [1.0, 0, 0], head: [0, 0.2, 1.8] },
      leg: { rx: 2.9, rz: 2.9 },
    },
  },
  // feral blood-moon bears: no suits, glowing red markings + eyes (outfit 'fur' + markings)
  blood_grunt: {
    name: 'Moon-Mad Bear', job: 'Unpaid Overtime', icon: 'bear_office', bloodmoon: true,
    fur: 0x3a2420, furLight: 0x7a5048, suit: 0x3a2420, suitDark: 0x241614, shirt: 0x3a2420, tie: null, outfit: 'fur', markings: 0xff2a2a, scar: true,
    hat: null, item: null, scale: 1.1, appetite: [2, 2], patience: 99, pay: 0, speed: 1.15, fromDay: 999, weight: 0,
  },
  blood_brute: {
    name: 'Blood Moon Brute', job: 'Night Shift Supervisor', icon: 'bear_office', bloodmoon: true,
    fur: 0x24161a, furLight: 0x5a3a3e, suit: 0x24161a, suitDark: 0x160c0e, shirt: 0x24161a, tie: null, outfit: 'fur', markings: 0xff3a1a, scar: true,
    hat: null, item: null, scale: 1.6, appetite: [3, 3], patience: 99, pay: 0, speed: 0.95, fromDay: 999, weight: 0,
    shape: { torso: { rx: 8.6, ry: 6.0, rz: 5.8, cy: 14.2, taper: -0.2, taperY: 13 }, arm: { rx: 2.8, rz: 2.8 }, off: { armL: [-1.4, 1, 0], armR: [1.4, 1, 0], head: [0, 0.2, 1.0] }, leg: { rx: 2.7, rz: 2.6 } },
  },
  blood_runner: {
    name: 'Frenzied Intern', job: 'Night Intern', icon: 'bear_intern', bloodmoon: true,
    fur: 0x5a2a22, furLight: 0x9a5a48, suit: 0x5a2a22, suitDark: 0x3a1a14, shirt: 0x5a2a22, tie: null, outfit: 'fur', markings: 0xff4a3a,
    hat: null, item: null, scale: 0.8, appetite: [1, 1], patience: 99, pay: 0, speed: 1.55, fromDay: 999, weight: 0,
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
  veggie: { name: 'fresh veggies', icon: 'carrot', bonus: 7 },
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
  veggie: ['No veggies? My trainer will be furious.', 'I asked for greens, not excuses!'],
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
  seaweed: 'Seaweed?', honey: 'Honey?', syrup: 'Syrup?', berries: 'Berries?', rice: 'Wild rice?', mushroom: 'Mushrooms?', veggie: 'Veggies?',
};

// [v18 bear looks] ============================================================ NEW TYPES + VARIANTS
// Every customer gets a procedural look (src/entities/bearLook.js) layered on its type. Per type:
//   variants  colour ways / sub-jobs: partial type fields merged over the type (picked per bear, seeded)
//   lookPool  biases for the look generator: fur / pattern / acc weights (override the defaults in
//             bearLook.js; furOnly / accOnly = use only the listed ones), accN [min, max] accessories,
//             block [slots], face {...}, dye (dyed frosted tips), old (white brows), typeFurW
//   lines     extra speech lines per bubble kind (arrive / eat / yum / angry / full / leave), mixed with LINES
//   rampDays  a new type fades in over this many days after fromDay; dowW { dayOfWeek: weightMult }
// New types use the same look fields as the old ones plus the v18 outfits in entities/bearRig.js:
//   outfit 'apron' (apron, stripes, logo) | 'tank' (logo) | 'hoodie' (print, printShape) | 'western' (yoke,
//   westVest, check, bolo, buckle) | 'chef' (kerchief) | 'pirate' (trim) | 'spacesuit' (stripe, patch) |
//   'argyle' (stripe, logo), and pants / shorts / boots / shoe / sleeves / gloves / pantsCheck / plaid.
Object.assign(BEAR_TYPES, {
  barista: {
    name: 'Barista', job: 'Third-Wave Coffee Artisan', icon: 'bear_barista',
    fur: 0x8a5634, furLight: 0xd4a878, suit: 0x2a2a30, suitDark: 0x1a1a20, shirt: 0x2a2a30, tie: null, outfit: 'apron', apron: 0x3a6a4a, logo: 0xf2f2ee,
    pants: 0x2a2a34, sneakers: 0xf0f0ea, accent: 0x2a2a30,
    hat: 'beanie', hatColor: 0x8a3a2a, item: 'cup', scale: 0.96, appetite: [1.5, 2.5], patience: 40, pay: 1.05, speed: 1.05, fromDay: 3, weight: 4, rampDays: 3,
    wants: ['honey'],
    shape: { belly: { rx: 5.6, rz: 4.8 }, torso: { rx: 6.7 } },
    variants: [
      { id: 'breton', name: 'Breton Stripes', suit: 0xf2f0ea, shirt: 0xf2f0ea, suitDark: 0xd8d4cc, stripes: 0x2a3a6a, apron: 0x6a4428, hatColor: 0x2a3a6a },
      { id: 'denim', name: 'Denim Apron', apron: 0x4a6a9a, suit: 0xe8e0d0, shirt: 0xe8e0d0, suitDark: 0xc8c0b0, hatColor: 0xd8a032 },
      { id: 'mint', name: 'Mint Cafe', apron: 0x6ac0a0, suit: 0x3a2a2a, shirt: 0x3a2a2a, suitDark: 0x2a1a1a, hat: null },
    ],
    lookPool: { acc: { earring: 2.5, studs: 2, nosering: 4, glasses: 2, flowers: 1.5, badge: 3, pin: 2.5, tie: 0, bowtie: 0 }, pattern: { tips: 2 }, face: { freckles: 0.3 } },
    lines: {
      arrive: ['Oat milk fish?', 'Double shot of trout!', 'Off the clock!', 'Name\'s on the cup.'],
      eat: ['Notes of... salmon.', 'Bold roast!', 'Smooth finish!'],
      yum: ['Single origin!', 'Latte art level!'],
      angry: ['This is DECAF?!', 'I\'m spilling TEA!'],
      leave: ['Brew-tiful!', 'Back to the grind!'],
    },
  },
  gymbro: {
    name: 'Gym Bro', job: 'Sales (Crushing It)', icon: 'bear_gymbro',
    fur: 0x7a4628, furLight: 0xc89a6a, suit: 0xe83a3a, suitDark: 0xb82a2a, shirt: 0xe83a3a, tie: null, outfit: 'tank', logo: 0xffffff,
    pants: 0x2a2a34, shorts: true, sneakers: 0xf4f4f0, accent: 0xe83a3a,
    hat: 'backcap', hatColor: 0x1a1a22, hatColor2: 0xe83a3a, item: 'dumbbell', scale: 1.1, appetite: [3, 4], patience: 28, pay: 1.15, speed: 1.15, fromDay: 4, weight: 4, rampDays: 3,
    wants: ['veggie'], rampage: 2,
    shape: {
      torso: { rx: 8.6, ry: 5.8, cy: 14.0, taper: -0.22, taperY: 13 },
      belly: { rx: 5.8, ry: 4.0, rz: 4.8, cz: 2.0 },
      arm: { rx: 2.7, rz: 2.7 }, off: { armL: [-1.5, 0.6, 0], armR: [1.5, 0.6, 0] },
    },
    variants: [
      { id: 'neon', name: 'Neon Pump', suit: 0x9ad040, suitDark: 0x6a9a20, shirt: 0x9ad040, logo: 0x1e1e24, hatColor: 0x9ad040, hatColor2: 0x1e1e24, accent: 0x9ad040 },
      { id: 'black', name: 'Beast Mode', suit: 0x1e1e24, suitDark: 0x121216, shirt: 0x1e1e24, logo: 0xe8c040, hatColor2: 0xe8c040 },
      { id: 'legday', name: 'Skipped Leg Day', suit: 0xf07aa8, suitDark: 0xc85a88, shirt: 0xf07aa8, hat: 'headband', hatColor: 0xf2f2ee },
    ],
    lookPool: { acc: { wristband: 5, chain: 3, shades: 3, neckphones: 2, watch: 1.5, earring: 1, studs: 1, tie: 0, bowtie: 0, pearls: 0, flowers: 0 }, accN: [1, 3] },
    lines: {
      arrive: ['PROTEIN!', 'Gains o\'clock!', 'Do you even fish?', 'Cardio = running here.'],
      eat: ['30g protein!', 'Macros!', 'Bulking!'],
      yum: ['GAINS!', 'Swole food!'],
      angry: ['NO PROTEIN?!', 'I\'ll bench this pond!'],
      full: ['Cheat day...', 'Food coma gains.'],
      leave: ['Hit the showers!', 'Go team!'],
    },
  },
  goth: {
    name: 'Goth Teen', job: 'Summer Job (Under Protest)', icon: 'bear_goth',
    fur: 0x2c2622, furLight: 0x8a7a70, suit: 0x1e1c24, suitDark: 0x141218, shirt: 0x1e1c24, tie: null, outfit: 'hoodie', print: 0xe8e4f0, printShape: 'skull',
    pants: 0x16141a, boots: 0x1a1a1e,
    hat: null, item: 'phone', scale: 0.86, appetite: [1, 2], patience: 34, pay: 0.9, speed: 0.9, fromDay: 5, weight: 3, rampDays: 3,
    wants: ['berries'],
    shape: { belly: { rx: 5.4, rz: 4.6 }, torso: { rx: 6.5 } },
    variants: [
      { id: 'hoodup', name: 'Hood Up', hat: 'hood', hatColor: 0x4a4458, suit: 0x4a4458, suitDark: 0x302c3a, shirt: 0x4a4458 },
      { id: 'purple', name: 'Purple Phase', suit: 0x3a2450, suitDark: 0x241632, shirt: 0x3a2450, print: 0x9af0c0, printShape: 'bat' },
      { id: 'moon', name: 'Moon Child', print: 0xf0e0a0, printShape: 'moon' },
    ],
    lookPool: {
      fur: { black: 6, lilac: 5, silvertip: 1, chocolate: 2, pastel: 1, panda: 1 }, furOnly: true, typeFurW: 1, dye: true,
      pattern: { tips: 8, none: 0.5 },
      acc: { earring: 4, studs: 4, nosering: 6, chain: 3, shades: 1.5, eyepatch: 0.6, neckphones: 2, beanie: 2, earbow: 0, cap: 0, backcap: 0, visor: 0, party: 0, flowers: 0, bucket: 0, cowboy: 0, bowtie: 0, pearls: 0, medal: 0, badge: 0, pin: 2, flower: 0, wristband: 0, crown: 0.6, wheat: 0, lollipop: 0, toothpick: 0, star: 0 },
      accN: [1, 3], face: { brows: { thin: 3, none: 4, angry: 2 }, iris: { red: 3, violet: 4, grey: 3, none: 6 }, blush: 0 },
    },
    lines: {
      arrive: ['Ugh. Fish.', 'Whatever.', 'It\'s not a phase.', 'My mom drove me.'],
      eat: ['...fine.', 'Mid.', 'Dark fish.'],
      yum: ['Okay, slaps.', 'Lowkey good.'],
      angry: ['You don\'t GET me!', 'RAWR. Literally.'],
      leave: ['Bye, I guess.', 'Don\'t post this.'],
    },
  },
  cowboy: {
    name: 'Cowboy', job: 'Rodeo Logistics', icon: 'bear_cowboy',
    fur: 0x8a5a34, furLight: 0xd0a878, suit: 0xc8443a, suitDark: 0x8a2a24, shirt: 0xc8443a, tie: null, outfit: 'western', yoke: 0xf0e8d8, westVest: 0x6a4428, buckle: 0xe8c040,
    pants: 0x3a5a8a, boots: 0x8a5a30,
    hat: 'cowboy', hatColor: 0xc8a070, hatColor2: 0x5a3a22, item: 'lasso', scale: 1.05, appetite: [2.5, 3.5], patience: 38, pay: 1.15, speed: 1, fromDay: 6, weight: 3, rampDays: 3,
    wants: ['syrup'],
    variants: [
      { id: 'blackhat', name: 'Black Hat', hatColor: 0x1e1e22, hatColor2: 0xd0d4dc, suit: 0x2a2a30, suitDark: 0x1a1a20, shirt: 0x2a2a30, yoke: 0x8a2a2a, westVest: null, buckle: 0xd0d4dc },
      { id: 'sky', name: 'Gingham', suit: 0x6aa0d8, shirt: 0x6aa0d8, suitDark: 0x4a80b8, yoke: 0xf2f2ee, westVest: null, check: 0x9ac4ec, bolo: 0x5ab0c8 },
      { id: 'sheriff', name: 'Sheriff', suit: 0xd8c8a0, shirt: 0xd8c8a0, suitDark: 0xb8a880, yoke: 0xb8a880, westVest: 0x5a3a22, hatColor: 0xeadcb8 },
    ],
    lookPool: { acc: { kerchief: 7, wheat: 5, toothpick: 3, star: 4, watch: 0.5, earring: 0.3, glasses: 0.3, chain: 0, pearls: 0, neckphones: 0 }, accN: [1, 2], face: { stache: { walrus: 3, curly: 2, pencil: 1, none: 6 } } },
    lines: {
      arrive: ['Howdy!', 'Yee-haw!', 'Giddy up!', 'Rustlin\' up fish!'],
      eat: ['Mighty fine!', 'Tasty vittles!', 'Dang!'],
      yum: ['YEE-HAW!', 'Best in the west!'],
      angry: ['Draw, fox!', 'This town ain\'t big enough!'],
      leave: ['Happy trails!', 'See ya, partner!'],
    },
  },
  astro: {
    name: 'Astronaut Intern', job: 'Space Program (Unpaid)', icon: 'bear_astro',
    fur: 0xa4632e, furLight: 0xdcaa72, suit: 0xf2f2f4, suitDark: 0xd8d8dc, shirt: 0xf2f2f4, tie: null, outfit: 'spacesuit', stripe: 0xf07a20, patch: 0x2a4ab0,
    gloves: 0xe8e8ec, shoe: 0xc8ccd4,
    hat: null, item: 'helmet', scale: 0.9, appetite: [1.5, 2.5], patience: 44, pay: 0.95, speed: 1.05, fromDay: 7, weight: 3, rampDays: 3,
    wants: ['berries'],
    shape: { belly: { rx: 6.4, rz: 5.4 }, torso: { rx: 7.3 } },
    variants: [
      { id: 'orange', name: 'Rescue Orange', suit: 0xf08a30, suitDark: 0xc86a1a, shirt: 0xf08a30, stripe: 0xf2f2f4, gloves: 0xf2f2f4 },
      { id: 'cosmo', name: 'Cosmonaut', suit: 0xe8ecdc, suitDark: 0xc8ccbc, stripe: 0xd83a32, patch: 0xd83a32 },
    ],
    lookPool: { acc: { backcap: 2, cap: 1, glasses: 2, headphones: 0, flowers: 0, cowboy: 0, crown: 0, chain: 0 }, block: ['neck', 'chest'], face: { freckles: 0.25 } },
    lines: {
      arrive: ['Houston, FISH!', 'One small step...', 'Zero-G snacks!', 'T-minus dinner!'],
      eat: ['Space food!', 'Not freeze-dried!', 'Astro-nomical!'],
      yum: ['Out of this world!', 'Stellar!'],
      angry: ['Houston, problem!', 'ABORT MISSION!'],
      leave: ['Liftoff!', 'Back to orbit!'],
    },
  },
  chef: {
    name: 'Head Chef', job: 'Executive Chef (Cafeteria)', icon: 'bear_chef',
    fur: 0x7a4a2a, furLight: 0xc8a070, suit: 0xf8f8f2, suitDark: 0xe0e0d8, shirt: 0xf8f8f2, tie: null, outfit: 'chef', kerchief: 0xd83a32,
    pants: 0x2a2a30, pantsCheck: 0xd8d8d0, shoe: 0x1a1a1e,
    hat: 'chef', hatColor: 0xffffff, item: 'ladle', scale: 1.06, appetite: [2.5, 3.5], patience: 32, pay: 1.35, speed: 0.95, fromDay: 8, weight: 3, rampDays: 3,
    wants: ['mushroom'], reviewWeight: 2,
    shape: { belly: { rx: 6.8, ry: 4.6, rz: 6.0 } },
    variants: [
      { id: 'black', name: 'Black Jacket', suit: 0x2a2a30, suitDark: 0x1a1a20, shirt: 0x2a2a30, kerchief: 0xf2c230 },
      { id: 'pastry', name: 'Pastry Chef', kerchief: 0xf07aa8, pantsCheck: 0xf0c8d8, pants: 0xf8f8f2 },
      { id: 'sous', name: 'Sous Chef', kerchief: 0x3a6ad0 },
    ],
    lookPool: { acc: { watch: 2, earring: 1, glasses: 1.5, pin: 0, badge: 0, flower: 0 }, face: { stache: { walrus: 3, curly: 5, pencil: 2, none: 6 } } },
    lines: {
      arrive: ['Oui, oui! Fish!', 'Mise en place!', 'Taste test time!', 'YES, CHEF!'],
      eat: ['Needs salt.', 'A bit underdone.', 'Ah, the terroir!'],
      yum: ['Magnifique!', 'Michelin pond!'],
      angry: ['IT\'S RAW!', 'Get out of my kitchen!'],
      leave: ['Bon appetit!', 'Service is over!'],
    },
  },
  golfer: {
    name: 'Retired Golfer', job: 'Former CFO (Retired)', icon: 'bear_golfer',
    fur: 0x8a8078, furLight: 0xe0d8cc, suit: 0x3a6ab0, suitDark: 0x24467a, shirt: 0xf8f8f4, tie: null, outfit: 'argyle', stripe: 0xf2e8d0, logo: 0x2a8a4a,
    pants: 0xe8dcb8, sneakers: 0xf8f8f4, accent: 0x6a4428,
    hat: 'visor', hatColor: 0xf2f2ee, hatColor2: 0x3a9a5a, item: 'golfclub', scale: 0.98, appetite: [2, 3], patience: 50, pay: 1.4, speed: 0.8, fromDay: 9, weight: 3, rampDays: 3, dowW: { 4: 2 },
    wants: ['honey'],
    shape: { belly: { rx: 6.8, ry: 4.6, rz: 6.0 } },
    variants: [
      { id: 'plaid', name: 'Loud Plaid', pants: 0xc83a3a, plaid: 0x1e2a4a, suit: 0x2a5a3a, suitDark: 0x1a3a26, stripe: 0xd8c050, hatColor2: 0xd83a32 },
      { id: 'links', name: 'Links Classic', hat: 'flatcap', hatColor: 0x8a7a5a, suit: 0x7a2a3a, suitDark: 0x521a26, stripe: 0xe0c8a0 },
      { id: 'pastel', name: 'Pastel Pro', suit: 0xf0a8c0, suitDark: 0xd08aa4, pants: 0xf8f8f4, stripe: 0x8ad0e0, hatColor2: 0xf07aa8 },
    ],
    lookPool: {
      fur: { silver: 6, silvertip: 3, grizzly: 2, polar: 1, brown: 1, glacier: 1 }, furOnly: true, old: true,
      acc: { glasses: 3, halfmoon: 3, watch: 3, pin: 0.5, flower: 1 }, face: { stache: { walrus: 3, pencil: 2, curly: 1, none: 4 }, brows: { bushy: 4, none: 4 } },
    },
    lines: {
      arrive: ['FORE!', 'Tee time!', 'In my day...', 'Hole in one!'],
      eat: ['Par for the course.', 'Birdie!', 'Mulligan!'],
      yum: ['Eagle!', 'Ace!'],
      angry: ['Back in MY day...', 'I want the manager!'],
      leave: ['Nap time.', 'Back to the club!'],
    },
  },
  pirate: {
    name: 'Pirate', job: 'Mergers & Acquisitions', icon: 'bear_pirate',
    fur: 0x6a4224, furLight: 0xb88a5a, suit: 0x8a1e24, suitDark: 0x5a1218, shirt: 0xf4f0e6, tie: null, outfit: 'pirate', trim: 0xe8c040,
    pants: 0x2a2420, boots: 0x2a1e18,
    hat: 'tricorn', hatColor: 0x1a1a1e, hatColor2: 0xe8c040, item: 'spyglass', scale: 1.08, appetite: [3, 4], patience: 30, pay: 1.3, speed: 1, fromDay: 10, weight: 3, rampDays: 3, rampage: 2,
    wants: ['seaweed'],
    variants: [
      { id: 'navy', name: 'Navy Captain', suit: 0x1e2a4a, suitDark: 0x141c34 },
      { id: 'green', name: 'Sea Dog', suit: 0x2a5a4a, suitDark: 0x1a3a30, trim: 0xd0d4dc, hatColor2: 0xd0d4dc },
    ],
    lookPool: { acc: { eyepatch: 12, earring: 6, toothpick: 1, chain: 0, nosering: 1 }, accN: [1, 2], block: ['chest', 'hat'], face: { scar: 0.4, stache: { curly: 3, walrus: 2, none: 5 }, beard: 0.3 } },
    lines: {
      arrive: ['Arrr! Fish!', 'Ahoy!', 'Shiver me timbers!', 'Booty call... er, dinner!'],
      eat: ['Arrr, tasty!', 'Fit for a captain!', 'Yo ho ho!'],
      yum: ['TREASURE!', 'Arrr-mazing!'],
      angry: ['Walk the plank!', 'MUTINY!'],
      leave: ['Anchors aweigh!', 'Fair winds!'],
    },
  },
});

// variants, look pools and lines for the older types
const V18_EXTRA = {
  office: {
    variants: [
      { id: 'charcoal', name: 'Charcoal Suit', suit: 0x3a3a42, suitDark: 0x2a2a30, tie: 0x3a8ad0 },
      { id: 'tweed', name: 'Brown Tweed', suit: 0x6a4a32, suitDark: 0x4a3222, tie: 0x2e6a3a },
      { id: 'casual', name: 'Casual Friday', suit: 0x8ab8e0, shirt: 0x8ab8e0, suitDark: 0x6a98c0, tie: 0x2a3a6a },
      { id: 'power', name: 'Power Tie', tie: 0xe8c040, suit: 0x1e2236, suitDark: 0x141828 },
    ],
    lookPool: { acc: { badge: 2, pin: 1.5, watch: 2.5, glasses: 2, flower: 1 } },
    lines: { arrive: ['Out of office!', 'Meeting adjourned!'], angry: ['I\'ll escalate this!'], leave: ['Synergy!'] },
  },
  intern: {
    variants: [
      { id: 'pink', name: 'Pastel Shirt', suit: 0xf4c8d4, shirt: 0xf4c8d4, suitDark: 0xd8a8b4, tie: 0x7a3ab8 },
      { id: 'mint', name: 'Mint Shirt', suit: 0xc8ecd8, shirt: 0xc8ecd8, suitDark: 0xa8ccb8, tie: 0x2a8a6a },
      { id: 'summer', name: 'Summer Intern', suit: 0xf2c230, shirt: 0xf2c230, suitDark: 0xc89a20, tie: null },
    ],
    lookPool: { acc: { glasses: 2.5, headphones: 1.5, studs: 1.5, earbow: 1, cap: 1, backcap: 1 }, face: { freckles: 0.25, blush: 0.25 } },
    lines: { arrive: ['Is this paid?', 'Free food?!'], eat: ['Exposure meal!'] },
  },
  janitor: {
    variants: [
      { id: 'green', name: 'Grounds Crew', suit: 0x4a7a4a, suitDark: 0x3a6a3a, shirt: 0x4a7a4a, straps: 0x2a5030 },
      { id: 'night', name: 'Night Shift', suit: 0x6a6e78, suitDark: 0x4a4e58, shirt: 0x6a6e78, straps: 0x3a3e48, hatColor: 0x2a2a30 },
    ],
    lookPool: { acc: { toothpick: 2, glasses: 1, watch: 1.5, earring: 0.5 }, face: { stache: { walrus: 2, none: 8 } } },
  },
  accountant: {
    variants: [
      { id: 'burgundy', name: 'Burgundy', suit: 0x6a2a3a, suitDark: 0x4a1a28, bowtie: 0x2a6ad0 },
      { id: 'tweed', name: 'Tweed', suit: 0x8a6a4a, suitDark: 0x6a4a32, bowtie: 0x2e6a3a },
    ],
    lookPool: { acc: { watch: 3, pin: 1, badge: 2 } },
  },
  boss: {
    variants: [
      { id: 'navy', name: 'Navy Pinstripe', suit: 0x26304a, suitDark: 0x1a2236, pinstripe: 0x4a5a7a, tie: 0xd83a32 },
      { id: 'cream', name: 'Cream Linen', suit: 0xe8e0c8, suitDark: 0xc8c0a8, pinstripe: null, tie: 0x7a1e2e, hatColor: 0xe8e0c8 },
    ],
    lookPool: { acc: { watch: 3, flower: 2, chain: 0, earring: 0.5 } },
  },
  construction: {
    variants: [
      { id: 'lime', name: 'Lime Vest', vest: 0xc8f040, suit: 0x3a8a4a, suitDark: 0x2a6a3a },
      { id: 'manager', name: 'Site Manager', hatColor: 0xf2f2ee, suit: 0x3a5a8a, suitDark: 0x2a4470 },
    ],
    lookPool: { acc: { toothpick: 1.5, watch: 1, wristband: 1 } },
  },
  lumberjack: {
    variants: [
      { id: 'blue', name: 'Blue Flannel', suit: 0x2a5ab0, shirt: 0x2a5ab0, suitDark: 0x1a1a1a, hatColor: 0x2a5ab0 },
      { id: 'green', name: 'Green Flannel', suit: 0x3a7a3a, shirt: 0x3a7a3a, suitDark: 0x1a1a1a, hatColor: 0x2a2a2a },
      { id: 'yellow', name: 'Mustard Flannel', suit: 0xd8a020, shirt: 0xd8a020, suitDark: 0x3a2414, hatColor: 0xd8a020 },
    ],
    lookPool: { acc: { toothpick: 1, wheat: 1, watch: 1 }, face: { beard: 0.4, stache: { walrus: 2, none: 6 } } },
  },
  tourist: {
    variants: [
      { id: 'pink', name: 'Flamingo Shirt', suit: 0xf07aa8, suitDark: 0xc85a88, shirt: 0xf07aa8 },
      { id: 'sunset', name: 'Sunset Shirt', suit: 0xf09a3a, suitDark: 0xc87a1a, shirt: 0xf09a3a },
      { id: 'navy', name: 'Navy Shirt', suit: 0x2a3a8a, suitDark: 0x1a2a6a, shirt: 0x2a3a8a },
    ],
    lookPool: { acc: { bucket: 6, cap: 3, visor: 3, flowers: 2, party: 0.6, lollipop: 0.5, watch: 1 }, accN: [1, 3] },
    lines: { arrive: ['Selfie time!', 'Is this the pond?!'], yum: ['Five stars on BearAdvisor!'] },
  },
  critic: {
    variants: [
      { id: 'navy', name: 'Navy Blazer', suit: 0x2a3a5a, suitDark: 0x1a2a40, scarf: 0xd83a32 },
      { id: 'camel', name: 'Camel Coat', suit: 0xb08a5a, suitDark: 0x8a6a40, scarf: 0x2a2a30, hatColor: 0x7a1e2e },
    ],
    lookPool: { acc: { monocle: 3, halfmoon: 2, glasses: 2, flower: 1.5 } },
  },
  cub: {
    variants: [
      { id: 'pink', name: 'Pink Romper', suit: 0xf07aa8, suitDark: 0xc85a88, shirt: 0xf07aa8 },
      { id: 'green', name: 'Frog Romper', suit: 0x6ac070, suitDark: 0x4aa050, shirt: 0x6ac070 },
      { id: 'yellow', name: 'Sunny Romper', suit: 0xf2c230, suitDark: 0xc89a20, shirt: 0xf2c230 },
    ],
    lookPool: { acc: { earbow: 4, lollipop: 3, badge: 1, glasses: 0.5 }, accN: [0, 2] },
  },
  jogger: {
    variants: [
      { id: 'red', name: 'Red Tracksuit', suit: 0xd83a32, suitDark: 0x9a2a24, accent: 0xf2f2ee },
      { id: 'teal', name: 'Teal Tracksuit', suit: 0x2aa8a0, suitDark: 0x1a7a74, accent: 0xf2c230 },
      { id: 'neon', name: 'Neon Runner', suit: 0x9ad040, suitDark: 0x5a8a20, stripe: 0x1e1e24, hatColor: 0x1e1e24 },
    ],
    lookPool: { acc: { wristband: 4, watch: 3, neckphones: 2, studs: 1 } },
  },
  grandma: {
    variants: [
      { id: 'mint', name: 'Mint Cardigan', suit: 0x9ad8c0, suitDark: 0x6ab8a0 },
      { id: 'rose', name: 'Rose Cardigan', suit: 0xe8a0b0, suitDark: 0xc88090 },
      { id: 'mustard', name: 'Mustard Cardigan', suit: 0xd8b040, suitDark: 0xb08a20 },
    ],
    lookPool: { acc: { earring: 2, studs: 3, flower: 3, pin: 2, earbow: 1 }, old: true, face: { blush: 0.5 } },
  },
  hipster: {
    variants: [
      { id: 'mustard', name: 'Mustard Flannel', suit: 0xc8902a, shirt: 0xc8902a, suitDark: 0x3a2414, hatColor: 0x2a3a6a },
      { id: 'burgundy', name: 'Burgundy Flannel', suit: 0x7a2a34, shirt: 0x7a2a34, suitDark: 0x1a1a1a, hatColor: 0x6a8a5a },
    ],
    lookPool: { acc: { earring: 2, studs: 2, nosering: 3, flower: 1, chain: 0.3 }, pattern: { tips: 1.5 } },
  },
  foreman_cub: {
    variants: [{ id: 'lime', name: 'Lime Vest', vest: 0xc8f040 }],
    lookPool: { acc: { earbow: 1, lollipop: 2, badge: 1 }, accN: [0, 1] },
  },
  ceo: { lookPool: { fur: { polar: 1 }, furOnly: true, typeFurW: 1, acc: { watch: 2, flower: 2, chain: 0 }, accN: [0, 1] } },
};
for (const [id, extra] of Object.entries(V18_EXTRA)) if (BEAR_TYPES[id]) Object.assign(BEAR_TYPES[id], extra);

// Spawn weight of a type on a day (0 = not in today's waves). Used by BearSystem.planWave / planLunch.
export function bearSpawnWeight(d, day) {
  if (!d || !(d.weight > 0) || d.boss || d.bloodmoon || (d.fromDay ?? 1) > day || (d.untilDay && day > d.untilDay)) return 0;
  let w = d.weight;
  if (d.rampDays) w *= Math.min(1, 0.35 + 0.65 * (day - d.fromDay) / d.rampDays);
  const dow = (day - 1) % 7;
  if (d.dowW && d.dowW[dow]) w *= d.dowW[dow];
  return w;
}
// [/v18 bear looks]
