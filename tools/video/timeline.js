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
const TIER_FEATS = (days, lv, pl, rev) => [`${days}-day delivery`, `${lv} level${lv > 1 ? 's' : ''}`, `${pl} plugin${pl > 1 ? 's' : ''}`, 'design + animation', 'source code included', `${rev} revision${rev > 1 ? 's' : ''}`];
TIMELINES.main = {
  length: 74.4,
  file: 'pukking-gig-video',
  mix: { music: 0.9, sfx: 1.1, voice: 1.7 },
  shots: [
    // 1 cold open: the bear bursts out of the pond
    { clip: 'tb_gag', at: 0, dur: 4.6, from: 39, frames: 180, sound: true },
    // 2 hello: the bedroom
    { clip: 'tb_wake', at: 4.6, dur: 8.2, from: 6, frames: 300, zoom: [1.15, 1.15], sound: true, anchors: true },
    // 3 my story (hand-drawn pixel art over the pond)
    { clip: 'tb_lineup', at: 12.8, dur: 10.8, from: 0, frames: 210, speed: 0.3, dim: 0.35 },
    // 4 game showcase
    { clip: 'tb_bears', at: 23.6, dur: 2.8, from: 0, frames: 480, sound: 0.6 },
    { clip: 'tb_bears', at: 26.4, dur: 2.2, from: 352, frames: 480, sound: 0.6 },
    { clip: 'dv_title', at: 28.6, dur: 1.8, from: 4, frames: 110 },
    { clip: 'dv_bridge', at: 30.4, dur: 1.8, from: 10, frames: 90 },
    { clip: 'dv_wheelie', at: 32.2, dur: 2.2, from: 14, frames: 90 },
    { clip: 'mudkip', at: 34.4, dur: 2.0, frames: 93, zoom: [1.0, 1.05] },
    { clip: 'shore', at: 36.4, dur: 2.2, frames: 90, zoom: [1.04, 1.1] },
    // 5 what you get
    { clip: 'tb_gag', at: 38.6, dur: 12.4, from: 0, frames: 180, speed: 0.12 },
    // 6 tiers + extras
    { clip: 'tb_lineup', at: 51.0, dur: 14.0, from: 0, frames: 210, speed: 0.3, dim: 0.45 },
    // 7 outro
    { clip: 'tb_lineup', at: 65.0, dur: 9.4, from: 0, frames: 210, speed: 0.72, anchors: true },
  ],
  cues: [
    // ---- 1
    { at: 0, music: 'title', volume: 0.55 },
    { at: 0.3, fx: { kind: 'sign', l1: 'PUKKING', l2: 'GAME DEV', scale: 1.3 } },
    { at: 4.15, wipe: 'iris', sfx: 'iris', volume: 0.5 },
    { at: 4.5, fx: { kind: 'unsign' } },
    // ---- 2
    { at: 4.6, music: 'morning', fade: 0.8, volume: 0.5 },
    { at: 5.25, say: 'GAH! what time is it?!', x: 420, y: 170, bubble: 'shout', dur: 1.7 },
    { at: 7.45, say: "wait... we're recording?!", anchor: 'fox', bubble: 'scared', dur: 1.9 },
    { at: 10.1, say: "oh hi! i'm Pukking!", x: 640, y: 250, bubble: 'excited', dur: 2.2 },
    { at: 12.35, wipe: W, sfx: 'whoosh', volume: 0.45 },
    // ---- 3 my story
    { at: 12.8, fx: { kind: 'rays', life: 10.8, color: 'rgba(255,220,140,.12)', mid: 'rgba(40,20,50,.2)', edge: 'rgba(18,8,24,.75)' } },
    { at: 13.0, fx: { kind: 'pix', scene: 'map', x: 560, y: 320, w: 672, life: 4.4, seed: 2,
      labels: [{ text: 'THAILAND', x: 24, y: 94, at: 0.4, sound: 'sticker', rot: -4 }, { text: 'VANCOUVER, CANADA', x: 78, y: 48, at: 3.4, sound: 'levelup', rot: 3 }],
      sfxAt: [{ t: 0.9, name: 'whoosh', v: 0.5 }, { t: 2.2, name: 'whoosh', v: 0.35, p: 1.3 }, { t: 3.7, name: 'heart', v: 0.5 }] } },
    { at: 13.15, notify: "i live in Vancouver, Canada... but i'm from Thailand!", mood: 'happy', dur: 3.6 },
    { at: 17.4, fx: { kind: 'pix', scene: 'kid', x: 560, y: 320, w: 560, life: 3.0, seed: 6, title: 'drawing + making games since i was a kid',
      sfxAt: [{ t: 0.2, name: 'chalk_draw', v: 0.5 }, { t: 0.9, name: 'chalk_draw', v: 0.5, p: 1.1 }, { t: 1.6, name: 'chalk_draw', v: 0.5, p: 0.9 }, { t: 1.3, name: 'coin', v: 0.35 }, { t: 2.45, name: 'star_pop', v: 0.6 }, { t: 2.6, name: 'jump', v: 0.4 }] } },
    { at: 17.5, notify: "i've been drawing and making games since i was a kid.", mood: 'happy', dur: 2.7 },
    { at: 20.4, fx: { kind: 'pix', scene: 'study', x: 560, y: 320, w: 560, life: 3.2, seed: 9, title: 'every order helps me study abroad', sub: '...and keep up with Vancouver rent!',
      sfxAt: [0.3, 0.55, 0.8, 1.05, 1.3, 1.55, 1.8, 2.05, 2.3].map((t, i) => ({ t, name: 'coin', v: 0.32, p: 1 + i * 0.04 })).concat([{ t: 2.6, name: 'heart', v: 0.5 }]) } },
    { at: 20.3, notify: 'your orders help me study abroad + pay rent. love y\'all!', mood: 'excited', bubble: 'excited', dur: 2.6 },
    { at: 23.15, wipe: 'rain', sfx: 'whoosh', volume: 0.45 },
    // ---- 4 game showcase
    { at: 23.6, music: 'rush', fade: 0.4, volume: 0.42 },
    { at: 23.7, fx: { kind: 'title', text: 'MY GAMES', sub: 'all made with JavaScript + Three.js', x: 640, y: 92, size: 83.33, life: 2.3, sound: 'fanfare_small' } },
    { at: 24.0, fx: { kind: 'label', text: 'The Bear Must Eat', sub: 'cozy restaurant tycoon · 3D', x: 40, y: 580, life: 4.4 } },
    { at: 24.6, notify: 'bears clock out at 5pm and eat EVERYTHING.', mood: 'excited', dur: 3.0 },
    { at: 28.8, fx: { kind: 'label', text: 'Deli-very Dead', sub: 'skeleton bike delivery · 3D', x: 40, y: 580, life: 5.3, tape: 'pink' } },
    { at: 29.6, notify: 'a skeleton delivering hot cocoa. on a bike!', mood: 'happy', dur: 3.0 },
    { at: 32.7, sfx: 'whistle', volume: 0.4 },
    { at: 34.5, fx: { kind: 'label', text: "Mudkip's Garden", sub: 'pixel-art adventure · 2D', x: 40, y: 40, life: 1.8, tape: 'blue' } },
    { at: 34.6, notify: 'pixel adventures... and Minecraft mods too!', mood: 'excited', dur: 3.0 },
    { at: 36.5, fx: { kind: 'polaroid', src: '../../portfolio/media/mc-dimension.jpg', caption: 'MC mod: new dimension', x: 380, y: 70, w: 400, h: 240, rot: -6, life: 2.1, seed: 4 } },
    { at: 36.75, fx: { kind: 'polaroid', src: '../../portfolio/media/mc-mob.jpg', caption: 'MC mod: new mob', x: 830, y: 110, w: 330, h: 240, rot: 5, pos: '3% 50%', size: 'auto 100%', life: 1.85, tape: 'yellow', seed: 8 } },
    { at: 38.15, wipe: 'zoom', sfx: 'whoosh', volume: 0.45 },
    // ---- 5 what you get
    { at: 38.6, music: 'feast', fade: 0.4, volume: 0.5 },
    { at: 38.7, notify: 'so what do YOU get when you order?', mood: 'excited', bubble: 'excited', dur: 2.0 },
    { at: 39.0, unbox: { label: 'YOUR GAME', items: UNBOX_ITEMS } },
    { at: 40.6, tap: [640, 470] }, { at: 41.1, tap: [640, 470] }, { at: 41.6, tap: [640, 470] },
    { at: 42.1, wipe: 'iris', sfx: 'reveal_epic', volume: 0.55, opts: { inDur: 0.2, hold: 0.1, outDur: 0.35, color: '#fff6e0' } },
    { at: 42.32, unboxClose: true }, { at: 42.32, unnotify: true },
    { at: 42.3, fx: { kind: 'rays', life: 8.7 } },
    { at: 42.4, fx: { kind: 'title', text: 'WHAT YOU GET', x: 640, y: 64, size: 72.9, life: 8.6, sound: 'fanfare_small' } },
    { at: 42.7, fx: { kind: 'pix', scene: 'models', x: 230, y: 268, w: 288, scale: 0.92, title: '3D MODELS', sub: 'characters, props, worlds', life: 8.3, seed: 11, rot: -2, sfxAt: [0.25, 0.5, 0.75, 1.0, 1.25, 1.5].map((t) => ({ t, name: 'build', v: 0.25 })) } },
    { at: 43.9, fx: { kind: 'pix', scene: 'chars', x: 640, y: 268, w: 288, scale: 0.92, title: 'ANIMATED CHARACTERS', sub: 'they walk, talk, wave, dance', life: 7.1, seed: 12, pitch: 1.1, sfxAt: [{ t: 0.3, name: 'footsteps', v: 0.3 }, { t: 0.9, name: 'bear_talk', v: 0.35 }] } },
    { at: 45.1, fx: { kind: 'pix', scene: 'pixels', x: 1050, y: 268, w: 288, scale: 0.92, title: '2D PIXEL ART', sub: 'sprites, icons, UI', life: 5.9, seed: 13, rot: 2, pitch: 1.2, sfxAt: [0.2, 0.5, 0.8, 1.1].map((t) => ({ t, name: 'pen', v: 0.3 })) } },
    { at: 46.3, fx: { kind: 'pix', scene: 'sound', x: 435, y: 565, w: 288, scale: 0.92, title: 'SOUND FX + MUSIC', sub: 'made for your game', life: 4.7, seed: 14, rot: -1, pitch: 1.3, sfxAt: [{ t: 0.3, name: 'bell', v: 0.25 }, { t: 0.7, name: 'chip', v: 0.3 }, { t: 1.0, name: 'bubble', v: 0.3 }] } },
    { at: 47.5, fx: { kind: 'pix', scene: 'code', x: 845, y: 565, w: 288, scale: 0.92, title: 'FULL SOURCE CODE', sub: 'JavaScript + Three.js, yours', life: 3.5, seed: 15, rot: 1, pitch: 1.4, sfxAt: [{ t: 0.2, name: 'typing', v: 0.4 }, { t: 1.0, name: 'typing', v: 0.4 }, { t: 2.6, name: 'levelup', v: 0.4 }] } },
    { at: 48.9, fx: { kind: 'title', text: 'IN EVERY', sub: 'TIER!', subSize: 54, x: 1130, y: 560, size: 54, life: 2.1, rot: -8, sound: 'stamp' } },
    { at: 50.55, wipe: W, sfx: 'whoosh', volume: 0.45 },
    // ---- 6 tiers
    { at: 51.0, music: 'day', fade: 0.4, volume: 0.55 },
    { at: 51.0, fx: { kind: 'rays', life: 14.0, color: 'rgba(255,220,140,.14)', mid: 'rgba(40,20,50,.25)', edge: 'rgba(18,8,24,.7)' } },
    { at: 51.1, fx: { kind: 'title', text: 'PICK YOUR TIER', x: 640, y: 56, size: 66.67, life: 7.5, sound: 'fanfare_small' } },
    { at: 51.3, fx: { kind: 'tier', scene: 'duck', x: 228, y: 408, name: 'DUCK TIER', level: 'BASIC', price: '$75', days: '3 days', color: '#3aa8e0', dark: '#1a6aa0', seed: 21, rot: -1.5, life: 7.3,
      desc: 'a prototype 3D JavaScript mini game: the main mechanic + custom assets', feats: TIER_FEATS(3, 1, 1, 1) } },
    { at: 51.8, fx: { kind: 'tier', scene: 'fox', x: 640, y: 408, name: 'FOX TIER', level: 'STANDARD', price: '$150', days: '5 days', color: '#ff8a2a', dark: '#c0501a', seed: 22, life: 6.8,
      desc: 'a detailed 3D JavaScript game with custom systems, characters and art', feats: TIER_FEATS(5, 2, 2, 2) } },
    { at: 52.3, fx: { kind: 'tier', scene: 'bear', x: 1052, y: 408, name: 'BEAR TIER', level: 'PREMIUM', price: '$350', days: '10 days', color: '#b04ad8', dark: '#6a2a98', seed: 23, rot: 1.5, life: 6.3,
      desc: 'a full Steam-style game: your own OCs, custom assets, real progression', feats: TIER_FEATS(10, 3, 3, 3) } },
    { at: 55.6, fx: { kind: 'title', text: 'every tier = a real, playable game!', x: 640, y: 708, size: 29.17, out: 3, color: '#fff6e0', life: 3.0, sound: 'levelup', rot: -1 } },
    { at: 58.15, wipe: W, sfx: 'whoosh', volume: 0.45 },
    // ---- extras
    { at: 58.65, fx: { kind: 'title', text: 'EXTRAS', sub: 'need it sooner? want more?', x: 640, y: 76, size: 75, life: 6.3, sound: 'fanfare_small' } },
    { at: 58.9, fx: { kind: 'rows', title: 'EXTRA-FAST DELIVERY', tag: 'per tier', color: '#ff4d6d', dark: '#c0204a', x: 372, y: 420, w: 620, rot: -1, life: 6.1, seed: 31,
      rows: [{ scene: 'duck', label: 'DUCK TIER', sub: 'delivered in 1 day', price: '+$10' }, { scene: 'fox', label: 'FOX TIER', sub: 'delivered in 2 days', price: '+$25' }, { scene: 'bear', label: 'BEAR TIER', sub: 'delivered in 3 days', price: '+$35' }] } },
    { at: 60.0, fx: { kind: 'rows', title: 'EXTRA LEVEL', tag: 'any tier', color: '#4cc05a', dark: '#2a8a3a', x: 985, y: 300, w: 500, rot: 1.5, life: 5.0, seed: 32, rowSound: 'levelup',
      rows: [{ scene: 'level', label: '+1 LEVEL', sub: 'adds 1 day to delivery', price: '+$5' }] } },
    { at: 60.9, notify: 'need it faster? i got you.', mood: 'happy', dur: 2.2 },
    { at: 64.55, wipe: W, sfx: 'whoosh', volume: 0.45 },
    { at: 64.6, unnotify: true },
    // ---- 7 outro
    { at: 65.0, music: 'title', fade: 0.5, volume: 0.55 },
    { at: 65.2, fx: { kind: 'sign', l1: "LET'S MAKE", l2: 'YOUR GAME!', width: 430, scale: 1.15 } },
    { at: 65.8, fx: { kind: 'tag', text: '$75', sub: 'DUCK TIER', x: 268, y: 640, rot: -4, seed: 1 } },
    { at: 66.1, fx: { kind: 'tag', text: '$150', sub: 'FOX TIER', x: 640, y: 655, rot: 3, seed: 2, pitch: 1.1 } },
    { at: 66.4, fx: { kind: 'tag', text: '$350', sub: 'BEAR TIER', x: 1004, y: 645, rot: -3, seed: 3, pitch: 1.2 } },
    { at: 67.2, say: 'message me on Fiverr and tell me your idea!', anchor: 'fox', bubble: 'excited', dur: 2.6 },
    { at: 70.4, say: "love y'all! see ya!", anchor: 'fox', bubble: 'happy', dur: 2.6 },
    { at: 70.3, fx: { kind: 'title', text: 'OPEN FOR ORDERS!', x: 1010, y: 120, size: 50, color: '#ff8a8a', life: 3.4, rot: 6, sound: 'stamp' } },
    { at: 73.5, wipe: 'iris', sfx: 'iris', volume: 0.5, opts: { inDur: 0.7, hold: 9, outDur: 0.2 } },
  ],
};
