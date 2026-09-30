// Bear customers. Colours feed the voxel model builder; stats feed the AI.
export const BEAR_TYPES = {
  office: {
    name: 'Office Bear', job: 'Middle Management', icon: 'bear_office',
    fur: 0x7a4a2a, furLight: 0xc0925e, suit: 0x2a3550, suitDark: 0x1c2438, shirt: 0xf2f2ee, tie: 0xc0392b,
    hat: null, item: 'briefcase', scale: 1, appetite: [2, 3], patience: 34, pay: 1, speed: 1, fromDay: 1, weight: 10,
  },
  intern: {
    name: 'Intern', job: 'Unpaid Intern', icon: 'bear_intern',
    fur: 0xa4632e, furLight: 0xdcaa72, suit: 0xf0f0ec, suitDark: 0xd0d0cc, shirt: 0xf0f0ec, tie: 0x3a6ad0, lanyard: 0x2a5ad0,
    hat: null, item: 'coffee', scale: 0.84, appetite: [1, 2], patience: 44, pay: 0.75, speed: 1.1, fromDay: 2, weight: 6,
  },
  janitor: {
    name: 'Janitor', job: 'Facilities Management', icon: 'bear_janitor',
    fur: 0x6a4a30, furLight: 0xb08a60, suit: 0x3a5a8a, suitDark: 0x2a4470, shirt: 0x3a5a8a, tie: null, straps: 0x2a4470,
    hat: 'cap', hatColor: 0x7a7a80, item: 'mop', scale: 1, appetite: [2, 3], patience: 36, pay: 0.95, speed: 0.95, fromDay: 3, weight: 5,
    wants: ['seaweed'],
  },
  accountant: {
    name: 'Accountant', job: 'Accounts Payable', icon: 'bear_accountant',
    fur: 0x2c2622, furLight: 0xa88a66, suit: 0x3a6a4a, suitDark: 0x2a5038, shirt: 0xf0efe0, tie: null, bowtie: 0xc03040, glasses: 0x1a1a1a,
    hat: null, item: 'calculator', scale: 0.95, appetite: [2, 3], patience: 36, pay: 1.05, speed: 0.95, fromDay: 4, weight: 5,
    wants: ['honey'],
  },
  boss: {
    name: 'Big Boss', job: 'Regional Vice President', icon: 'bear_boss',
    fur: 0x5a3a22, furLight: 0xb89a78, suit: 0x3a3a42, suitDark: 0x2a2a30, shirt: 0xf2f2ee, tie: 0xd8a830, pinstripe: 0x5a5a64,
    hat: 'fedora', hatColor: 0x2a2a2e, cigar: true, item: 'briefcase', scale: 1.22, appetite: [5, 7], patience: 30, pay: 1.8, speed: 0.9, fromDay: 5, weight: 3,
  },
  construction: {
    name: 'Construction Bear', job: 'Site Foreman', icon: 'bear_construction',
    fur: 0x7a5030, furLight: 0xc49a6a, suit: 0xf07a20, suitDark: 0xc85a10, shirt: 0x6a7a8a, tie: null, vest: 0xf0f060,
    hat: 'hardhat', hatColor: 0xf2c230, item: 'lunchbox', scale: 1.1, appetite: [4, 5], patience: 24, pay: 1.2, speed: 1.05, fromDay: 6, weight: 4, rampage: 2,
  },
  lumberjack: {
    name: 'Lumberjack', job: 'Forestry Division', icon: 'bear_lumberjack',
    fur: 0x6a3a1a, furLight: 0xb07a4a, suit: 0xc0302a, suitDark: 0x1a1a1a, shirt: 0xc0302a, tie: null, flannel: true,
    hat: 'toque', hatColor: 0xd83a2a, item: 'thermos', scale: 1.08, appetite: [3, 4], patience: 32, pay: 1.15, speed: 1, fromDay: 8, weight: 4,
    wants: ['syrup'],
  },
  tourist: {
    name: 'Tourist', job: 'On Vacation (from HR)', icon: 'bear_tourist',
    fur: 0x8a5a30, furLight: 0xc8a070, suit: 0x2ab0a0, suitDark: 0x1a8a80, shirt: 0x2ab0a0, tie: null, hawaiian: true, shades: 0x101010,
    hat: null, item: 'camera', scale: 1, appetite: [2, 3], patience: 38, pay: 1.1, speed: 0.9, fromDay: 9, weight: 3,
    wants: ['berries'],
  },
  critic: {
    name: 'Food Critic', job: 'The Bear Street Journal', icon: 'bear_critic',
    fur: 0x8a6a4a, furLight: 0xd0b08a, suit: 0x5a2a4a, suitDark: 0x401e36, shirt: 0xf0e8e0, tie: null, scarf: 0xe0c040,
    hat: 'beret', hatColor: 0x2a2a30, item: 'notepad', scale: 1, appetite: [2, 2], patience: 30, pay: 1.3, speed: 0.9, fromDay: 7, weight: 0,
    critic: true, reviewWeight: 4,
  },
  ceo: {
    name: 'The CEO', job: 'Chairman of the Board', icon: 'bear_ceo',
    fur: 0xeeeee6, furLight: 0xffffff, suit: 0x18181c, suitDark: 0x0e0e10, shirt: 0xffffff, tie: null, bowtie: 0x101010, monocle: 0xe8c040,
    hat: 'tophat', hatColor: 0x151518, item: 'cane', scale: 1.42, appetite: [9, 12], patience: 42, pay: 2.6, speed: 0.85, fromDay: 5, weight: 0,
    boss: true, reviewWeight: 3, rampage: 3,
  },
  cub: {
    name: 'Bear Cub', job: 'Bring-Your-Cub-To-Work Day', icon: 'bear_cub',
    fur: 0x8a5a30, furLight: 0xd0a878, suit: 0x5ab0e0, suitDark: 0x3a90c0, shirt: 0x5ab0e0, tie: null,
    hat: 'propeller', hatColor: 0xe8403a, item: null, scale: 0.58, appetite: [1, 1], patience: 46, pay: 0.55, speed: 1.2, fromDay: 99, weight: 0,
    wants: ['berries'],
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
  species: ['That wasn\'t what I ordered.', 'I specifically wanted something else.'],
};

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
