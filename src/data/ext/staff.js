// [v26 staff] Hiring + homes for the beaver staff (src/game/ext/staff.js).
// Pure data (merged by src/data/structures.js and src/data/research.js).
//
//   jobs: { slots, skill, title, outfit?, anim?, required? }  -> beavers can be assigned to work here
//   home: { beds, comfort }                                     -> beavers can live here
//   staff: { posters: n }                                       -> raises how many / how good the candidates are
export const STRUCTURES = {
  st_tent: {
    name: 'Interview Tent', icon: 'st_tent', cost: 80, place: 'land', category: 'beaver', unlock: 'r_st_tent', size: [2, 2],
    builder: 'beaver', buildTime: 5, hp: 99, smashable: false, beauty: 0.5,
    jobs: { slots: 1, skill: 'serve', title: 'Recruiter', outfit: 'apron', anim: 'type' },
    desc: 'Job seekers walk out of the forest and wait here. Tap it to interview them. A Recruiter brings better candidates.',
  },
  st_poster: {
    name: 'Help Wanted Poster', icon: 'st_poster', cost: 20, place: 'landOrPlatform', category: 'beaver', unlock: 'r_st_posters',
    hp: 2, smashable: true, staff: { posters: 1 },
    desc: 'NOW HIRING! Each poster brings one more candidate a day (up to 5), and better ones.',
  },
  st_burrow: {
    name: 'Beaver Burrow', icon: 'st_burrow', cost: 60, place: 'land', category: 'beaver', unlock: 'r_st_burrow',
    builder: 'beaver', buildTime: 4, hp: 99, smashable: false, beauty: 0.5, home: { beds: 2, comfort: 1 },
    desc: 'A snug mound with a round door. Home for 2 beavers. Tap it to upgrade the comfort.',
  },
  st_bunk: {
    name: 'Bunkhouse', icon: 'st_bunk', cost: 150, place: 'land', category: 'beaver', unlock: 'r_st_bunk', size: [2, 1],
    builder: 'beaver', buildTime: 7, hp: 99, smashable: false, home: { beds: 6, comfort: 0 },
    desc: 'Bunk beds, a woodstove and somebody snoring. Home for 6 beavers. Cramped: low comfort.',
  },
  st_cabin: {
    name: 'Cozy Cabin', icon: 'st_cabin', cost: 260, place: 'land', category: 'beaver', unlock: 'r_st_cabin', size: [2, 2],
    builder: 'beaver', buildTime: 9, hp: 99, smashable: false, beauty: 2, home: { beds: 3, comfort: 3 },
    desc: 'A log cabin with a porch, a chimney and quilts. Home for 3 very happy beavers.',
  },
};

export const RESEARCH = [
  { id: 'r_st_tent', branch: 'beaver', name: 'Now Hiring', icon: 'st_tent', time: 25, req: [], build: 'st_tent', desc: 'An Interview Tent. Beavers walk out of the forest looking for work: hire the good ones.' },
  { id: 'r_st_posters', branch: 'beaver', name: 'Help Wanted', icon: 'st_poster', time: 30, req: ['r_st_tent'], build: 'st_poster', desc: 'Posters on the trees: more candidates every day, and better ones.' },
  { id: 'r_st_burrow', branch: 'beaver', name: 'Beaver Burrows', icon: 'st_burrow', time: 35, req: ['r_st_tent'], build: 'st_burrow', desc: 'Snug burrows: a bed for every new hire. Homeless beavers get grumpy.' },
  { id: 'r_st_training', branch: 'beaver', name: 'Staff Training', icon: 'st_build', time: 60, req: ['r_st_tent'], feature: 'st_training', desc: 'Send a beaver to a course: coins and a day off for +1 in a skill.' },
  { id: 'r_st_bunk', branch: 'beaver', name: 'Bunkhouse', icon: 'st_bunk', time: 70, req: ['r_st_burrow'], build: 'st_bunk', desc: 'Six bunks and a woodstove. Cheap beds, low comfort.' },
  { id: 'r_st_medic', branch: 'beaver', name: 'Stretcher Crew', icon: 'st_care', time: 90, req: ['r_st_training'], mods: { staffRescue: -0.25 }, desc: 'A trained stretcher crew: rescuing a hurt beaver costs 25% less.' },
  { id: 'r_st_cabin', branch: 'beaver', name: 'Cozy Cabins', icon: 'st_cabin', time: 120, req: ['r_st_bunk'], build: 'st_cabin', desc: 'Quilts, a porch and a chimney: happy, well-rested beavers.' },
];
