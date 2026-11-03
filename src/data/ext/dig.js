// [v32 dig] THE DIG: Professor Snapp's research section in the lab tree. Picked
// up by src/data/research.js (import.meta.glob('./ext/*.js')). The first node
// lifts the fog over Bonebed Bluff (src/game/ext/digsite.js); the rest need you
// to have met Snapp there. Node ids are referenced by saves: never rename one.
export const BRANCHES = [
  { id: 'dig', name: 'The Dig', icon: 'dig_trowel', color: '#c0843a', key: { zone: 'tower', coins: 180 } },
];

export const RESEARCH = [
  { id: 'r_dig_survey', branch: 'dig', name: 'Survey the Bluff', icon: 'dig_survey', time: 150, req: [], feature: 'dig_bluff', featureName: 'Bonebed Bluff',
    desc: 'Hoot keeps hearing holes being dug in the Old Wood, and somebody yelling at rocks. Survey it: the fog over Bonebed Bluff lifts.' },
  { id: 'r_dig_brush', branch: 'dig', name: 'Camel-hair Brushes', icon: 'dig_brush', time: 120, req: ['r_dig_survey'], zone: 'bonebed',
    desc: 'Proper brushes. Brushing dirt off a find is twice as fast. Bones like a soft touch.' },
  { id: 'r_dig_amber', branch: 'dig', name: 'Amber Studies', icon: 'dig_amber', time: 200, req: ['r_dig_survey'], zone: 'bonebed',
    desc: 'Learn to spot amber: golden lumps of fossil tree sap start turning up in digs. Some have passengers.' },
  { id: 'r_dig_maps', branch: 'dig', name: 'Survey Maps', icon: 'dig_map', time: 260, req: ['r_dig_brush'], zone: 'bonebed',
    desc: 'Snapp\'s old maps, coffee stains and all. New fossil sites turn up around the valley, one at a time.' },
  { id: 'r_dig_lamp', branch: 'dig', name: 'Fossil Lamp', icon: 'dig_lamp', time: 240, req: ['r_dig_brush'], zone: 'bonebed',
    desc: 'An ultraviolet lamp for the dig tray: hold it and buried bone glows faintly through the dirt.' },
  { id: 'r_dig_pick', branch: 'dig', name: 'Precision Pick', icon: 'dig_pick', time: 300, req: ['r_dig_lamp'], zone: 'bonebed',
    desc: 'A finer pick. Hits next to the find crack it far less often. Direct hits still hurt.' },
  { id: 'r_dig_museum', branch: 'dig', name: 'Museum Wing', icon: 'dig_museum', time: 320, req: ['r_dig_amber'], zone: 'bonebed',
    desc: 'Snapp opens his display case to the public. Every find on display sells tickets each morning.' },
  { id: 'r_dig_vial', branch: 'dig', name: 'Primordial Vial', icon: 'dig_vial', time: 420, req: ['r_dig_amber', 'r_dig_maps'], zone: 'bonebed',
    desc: 'Amber, fossil dust and something Snapp will not tell you about. One drop wakes the ancient fish inside a modern one.' },
  { id: 'r_dig_deep', branch: 'dig', name: 'Deep Strata', icon: 'dig_deep', time: 480, req: ['r_dig_maps'], zone: 'bonebed',
    desc: 'Dig down to the oldest layers: rare, epic and legendary finds turn up far more often. Heartstone amber lives down there.' },
  { id: 'r_dig_blood', branch: 'dig', name: 'Ancient Bloodlines', icon: 'dig_dna', time: 540, req: ['r_dig_vial'], zone: 'bonebed',
    desc: 'Prehistoric fish pass their ancient form on to their fry more often, and bears pay 25% more to eat one.' },
];
