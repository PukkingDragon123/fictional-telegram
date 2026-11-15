// [v33 title] THE POND TIMES devlog: one entry per update, newest first (src/ui/PondTimes.js).
// Each entry: version, date, a headline (a bit of humour is fine), a one-line summary, 4-8 bullets.

// ---- feedback: where reports go. Empty = hidden (the report is only copied to the clipboard).
export const FEEDBACK_EMAIL = ''; // e.g. 'hello@example.com': shows a "Send by email" link
export const ITCH_URL = ''; // e.g. 'https://you.itch.io/the-bear-must-eat': shows "Open itch.io page"
export const GAME_VERSION = 'v33';

export const ISSUES = [
  { v: 'v33', date: 'Nov 14, 2026', title: 'Fresh Paint on Everything', sum: 'A big polish pass over the whole game.',
    list: ['New title screen: your own pond, a 3D logo island you can poke', 'Research Lab on Reynard\'s computer', 'e-Buy online store, free Moose Express delivery', 'Hands-on day-1 tutorial', 'Neighbours have daily routines and visit your pond', 'Classroom with 3D demos; Fish Scope field kit', 'Real recorded sound effects', 'Loading screen: a bear eats a salmon'] },
  { v: 'v32', date: 'Nov 4, 2026', title: 'Dig & Dive', sum: 'Local turtle yells at rocks, finds a 100-million-year-old fish.',
    list: ['Prof. Snapp and fossil digs at Bonebed Bluff', 'Lab bench: brew a Primordial Vial', 'Prehistoric fish: Sabre-tooth, Armoured, Fossil, Lobe-fin, Thornback', 'Loon Lake, Noodles the otter and his daily catch', 'Chief Buff\'s dive school and underwater farms', 'NPC voice lines'] },
  { v: 'v31', date: 'Nov 3, 2026', title: 'The Cinematic Update', sum: 'The pond, shot like a movie.',
    list: ['Cinematic talk scenes with close-ups and speech bubbles', 'Bear errands: a bear knocks most mornings', 'Nine secrets hidden around the pond', 'Time-of-day light, cloud shadows and pixel particles'] },
  { v: 'v26', date: 'Oct 10, 2026', title: 'The Big Feast', sum: 'Dinner rush with events, a resort and staff.',
    list: ['5 PM feast events: critics, birthdays, raccoons, inspectors', 'Bear Resort: hot tub, sauna and breakdowns', 'Hire beaver staff', 'Terraform your land, seasons and weather', 'Bigger valley, power grid and storage buildings'] },
  { v: 'F&S', date: 'Autumn 2026', title: 'Flint & Steel', sum: 'Badger finds rocks; bears in hard hats strike over lunch.',
    list: ['Ore veins and beaver miners', 'The Bear Mine with hired worker bears', 'Smelter, Machine Shop, Circuit Fab, conveyor belts', 'Pollution that murks the pond'] },
  { v: 'v1', date: 'Grand Opening', title: 'Fox Opens All-You-Can-Eat Pond', sum: 'Bears in suits attend.',
    list: ['Bears clock off at 5 PM and eat your fish', 'Breed fish and cross-breed hybrids', 'Beavers build dams, fences and feeders', 'Research, ratings and the Friday CEO'] },
];

export const LATEST = ISSUES[0];
