// Timelines for the gig video (seconds). shots = background clips, cues = things that happen.
export const FPS = 30;
export const TIMELINES = {};

const UNBOX_ITEMS = [
  { name: '3D models', sub: 'characters, props, whole worlds', art: 'dragon', rarity: 3 },
  { name: 'Animated characters', sub: 'they walk, talk, dance, roar', art: 'fox', rarity: 4 },
  { name: '2D pixel art', sub: 'sprites, icons, UI', art: 'heart', rarity: 2 },
  { name: 'Sound effects + music', sub: 'made for your game', art: 'speaker', rarity: 2 },
  { name: 'Full source code', sub: 'JavaScript + Three.js, yours', art: 'brackets', rarity: 3 },
];
// ------------------------------------------------------------------ the gig video (74 s)
const W = 'blocks';
TIMELINES.main = {
  length: 74.2,
  file: 'pukking-gig-video',
  mix: { music: 0.9, sfx: 1, voice: 1.7 },
  shots: [
    // 1 cold open: Reynard fishing at sunset... then the bear
    { clip: 'tb_gag', at: 0, dur: 6.0, frames: 180, sound: true },
    // 2 hello: the bedroom, he oversleeps and changes into his teacher suit
    { clip: 'tb_wake', at: 6.0, dur: 8.2, from: 6, frames: 300, zoom: [1.15, 1.15], sound: true, anchors: true },
    // 3 The Bear Must Eat: the 5 PM rush
    { clip: 'tb_bears', at: 14.2, dur: 3.6, from: 0, frames: 480, sound: 0.6 },
    { clip: 'tb_bears', at: 17.8, dur: 2.8, from: 122, frames: 480, sound: 0.6 },
    { clip: 'tb_bears', at: 20.6, dur: 2.8, from: 250, frames: 480, sound: 0.6 },
    { clip: 'tb_bears', at: 23.4, dur: 4.2, from: 350, frames: 480, sound: 0.6 },
    // 4 Deli-very Dead
    { clip: 'dv_title', at: 27.6, dur: 3.4, from: 2, frames: 110 },
    { clip: 'dv_ride', at: 31.0, dur: 3.0, from: 8, frames: 100 },
    { clip: 'dv_bridge', at: 34.0, dur: 2.8, from: 4, frames: 90 },
    { clip: 'dv_wheelie', at: 36.8, dur: 2.6, from: 11, frames: 90 },
    { clip: 'dv_title', at: 39.4, dur: 1.6, from: 114, frames: 180, zoom: [1.22, 1.3], pan: [[0.5, 0.9], [0.5, 0.9]] },
    // 5 more work: Mudkip's Garden, Sunset Shore, Minecraft mods
    { clip: 'mudkip', at: 41.0, dur: 2.8, frames: 93, zoom: [1.0, 1.06] },
    { clip: 'shore', at: 43.8, dur: 2.6, frames: 90, zoom: [1.04, 1.1] },
    // 6 what you get: the parcel
    { clip: 'tb_gag', at: 46.4, dur: 12.0, from: 0, frames: 180, speed: 0.12 },
    // 7 game ideas on the chalkboard
    { clip: 'tb_ideas', at: 58.4, dur: 9.0, from: 15, frames: 300, sound: true, babble: true },
    // 8 outro: the duck, the fox and the bear
    { clip: 'tb_lineup', at: 67.4, dur: 6.8, frames: 210, anchors: true },
  ],
  cues: [
    { at: 0, music: 'title', volume: 0.55 },
    { at: 0.6, fx: { kind: 'sign', l1: 'PUKKING', l2: 'GAME DEV', scale: 1.3 } },
    { at: 5.5, wipe: 'iris', sfx: 'iris', volume: 0.5 },
    { at: 5.6, fx: { kind: 'unsign' } },

    { at: 6.0, music: 'morning', fade: 0.8, volume: 0.5 },
    { at: 6.65, say: "GAH! what time is it?!", x: 420, y: 170, bubble: 'shout', dur: 1.7 },
    { at: 8.85, say: "wait... we're recording?!", anchor: 'fox', bubble: 'scared', dur: 1.9 },
    { at: 11.45, say: "oh hi! i'm Pukking. i make games!", x: 640, y: 250, bubble: 'excited', dur: 2.6 },
    { at: 13.75, wipe: W, sfx: 'whoosh', volume: 0.45 },

    { at: 14.2, music: 'rush', fade: 0.5, volume: 0.4 },
    { at: 14.5, zone: { title: 'The Bear Must Eat', sub: 'a cozy restaurant tycoon', npc: 'dale' }, stamp: 'MY GAME!' },
    { at: 18.2, notify: "5pm. the bears clock out... and they're STARVING.", mood: 'excited', bubble: 'excited', dur: 3.0 },
    { at: 21.9, notify: 'you build the restaurants. they eat. you get rich.', mood: 'happy', dur: 3.0 },
    { at: 27.15, wipe: 'rain', sfx: 'whoosh', volume: 0.45 },

    { at: 27.6, music: 'day', fade: 0.5, volume: 0.6 },
    { at: 27.9, zone: { title: 'Deli-very Dead', sub: 'a skeleton delivers hot cocoa', npc: 'granny' }, stamp: 'MY GAME!' },
    { at: 31.9, notify: "you're a skeleton. you deliver hot cocoa. on a bike.", mood: 'happy', dur: 3.0 },
    { at: 35.6, notify: 'wheelies, flips, a whole autumn town. all in your browser!', mood: 'excited', bubble: 'excited', dur: 3.2 },
    { at: 40.55, wipe: 'zoom', sfx: 'whoosh', volume: 0.45 },

    { at: 41.2, fx: { kind: 'label', text: "Mudkip's Garden", sub: 'pixel-art adventure', x: 40, y: 40, life: 2.5 } },
    { at: 41.4, notify: 'i make cozy pixel-art games too...', mood: 'happy', dur: 2.2 },
    { at: 43.9, fx: { kind: 'polaroid', src: '../../portfolio/media/mc-dimension.jpg', caption: 'custom dimension', x: 380, y: 70, w: 400, h: 240, rot: -6, life: 2.5, seed: 4 } },
    { at: 44.25, fx: { kind: 'polaroid', src: '../../portfolio/media/mc-mob.jpg', caption: 'custom mob', x: 830, y: 110, w: 330, h: 240, rot: 5, pos: '3% 50%', size: 'auto 100%', life: 2.15, tape: 'yellow', seed: 8 } },
    { at: 43.95, notify: '...and Minecraft mods! new mobs, new worlds.', mood: 'excited', dur: 2.2 },
    { at: 45.95, wipe: W, sfx: 'whoosh', volume: 0.45 },

    { at: 46.4, music: 'feast', fade: 0.4, volume: 0.5 },
    { at: 46.6, notify: 'ok ok. so what do YOU get?', mood: 'excited', bubble: 'excited', dur: 1.8 },
    { at: 47.0, unbox: { label: 'YOUR GAME', items: UNBOX_ITEMS } },
    { at: 48.6, tap: [640, 470] }, { at: 49.2, tap: [640, 470] }, { at: 49.8, tap: [640, 470] },
    { at: 57.95, wipe: 'iris', sfx: 'iris', volume: 0.5 },
    { at: 58.05, unboxClose: true },

    { at: 58.4, music: 'day', fade: 0.5, volume: 0.55 },
    { at: 66.95, wipe: W, sfx: 'whoosh', volume: 0.45 },

    { at: 67.4, music: 'title', fade: 0.5, volume: 0.55 },
    { at: 67.6, fx: { kind: 'sign', l1: "LET'S MAKE", l2: 'YOUR GAME!', width: 430, scale: 1.15 } },
    { at: 68.1, fx: { kind: 'tag', text: '$75', sub: 'DUCK TIER', x: 268, y: 640, rot: -4, seed: 1 } },
    { at: 68.4, fx: { kind: 'tag', text: '$150', sub: 'FOX TIER', x: 640, y: 655, rot: 3, seed: 2, pitch: 1.1 } },
    { at: 68.7, fx: { kind: 'tag', text: '$350', sub: 'BEAR TIER', x: 1004, y: 645, rot: -3, seed: 3, pitch: 1.2 } },
    { at: 69.7, say: 'message me on Fiverr. see ya!', anchor: 'fox', bubble: 'excited', dur: 3.0 },
    { at: 73.2, wipe: 'iris', sfx: 'iris', volume: 0.5, opts: { inDur: 0.7, hold: 9, outDur: 0.2 } },
  ],
};
