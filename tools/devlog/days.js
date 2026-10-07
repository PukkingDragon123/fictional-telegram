// The ten devlog videos. Each day: shots (background clips, at/dur in seconds) and cues
// (overlays + sounds). Clip time: `from` (frames) + (t - at) * 30 * speed.
// Clips: tools/devlog/clipdefs.mjs (dl_*: the greybox sandbox, g*_: the real game).
export const FPS = 30;
const end = (at, a, b, dur = 2.6) => ({ at, end: [a, b], dur });
const hook = (n, emoji, dur) => ({ at: 0, hook: `day ${n} of making\nmy dream game ${emoji}`, instant: true, dur });
const badge = (n, at, len) => ({ at, badge: `DAY ${n}`, dur: len - at - 0.05 });

export const DAYS = {};

// ---------------------------------------------------------------- day 1: the idea + greybox
DAYS.day01 = {
  file: 'day-01', length: 20.6,
  shots: [
    { color: '#3b2a1e', at: 0, dur: 4.8 },
    { clip: 'dl_d1_orbit', at: 4.8, dur: 3.5, speed: 1.6, zoom: [1.0, 1.05] },
    { clip: 'dl_d1_walk', at: 8.3, dur: 3.7, from: 10, speed: 1.35, punch: 0.06, sound: true },
    { clip: 'dl_d1_bug', at: 12.0, dur: 6.2, sound: true },
    { clip: 'dl_d1_bug', at: 18.2, dur: 2.4, still: 194, zoom: [1.0, 1.04] },
  ],
  cues: [
    { at: 0, music: 'morning', volume: 0.5 },
    hook(1, '🐻', 4.6),
    { at: 0.15, sketch: 'idea', dur: 4.65, draw: 4.1 },
    { at: 4.8, sfx: 'whoosh', volume: 0.35 },
    badge(1, 4.8, 20.6),
    { at: 4.85, cap: 'the idea: office bears get off work at 5pm…', dur: 1.9 },
    { at: 6.75, cap: '…and raid YOUR pond for fish 🐟', dur: 1.55 },
    { at: 8.35, cap: 'everything is just shapes rn', dur: 1.8, y: 1330 },
    { at: 8.7, note: 'this is a bear.', x: 90, y: 600, anchor: 'bear', dy: -30, dur: 3.2 },
    { at: 9.4, note: 'trust me', x: 150, y: 680, dur: 2.5 },
    { at: 10.2, cap: 'his only job: walk to the pond', dur: 1.75, y: 1330 },
    { at: 12.05, cap: 'first test… 👀', dur: 1.35 },
    { at: 13.3, circle: 'fox', r: [170, 210], dy: 70, dur: 1.9 },
    { at: 13.45, cap: 'no collisions yet 💀', dur: 1.7 },
    { at: 15.2, cap: 'he also walks on water now. sure, why not', dur: 2.9 },
    end(18.2, 'day 2: fish 🐟', 'follow if u wanna see it grow'),
  ],
};

// ---------------------------------------------------------------- day 2: fish
DAYS.day02 = {
  file: 'day-02', length: 20.6,
  shots: [
    { clip: 'dl_d2_fish', at: 0, dur: 3.6, still: 0, blur: 10, dim: 0.5 },
    { clip: 'dl_d2_fish', at: 3.6, dur: 4.8, zoom: [1.0, 1.06], sound: true },
    { clip: 'dl_d2_bug', at: 8.4, dur: 5.0, speed: 1.1, punch: 0.05, zoom: [[0, 1.0], [1.6, 1.3]], pan: [[0, [0.5, 0.5]], [1.6, [0.82, 0.4]]] },
    { clip: 'dl_d2_fixed', at: 13.4, dur: 5.0, from: 15, speed: 1.2, sound: true },
    { clip: 'dl_d2_fixed', at: 18.4, dur: 2.2, still: 194 },
  ],
  cues: [
    { at: 0, music: 'day', volume: 0.5 },
    hook(2, '🐟', 3.4),
    { at: 0.3, code: 'fish', y: 600, dur: 3.3, type: 2.7 },
    badge(2, 3.4, 20.6),
    { at: 3.6, sfx: 'whoosh', volume: 0.3 },
    { at: 3.6, stats: true, dur: 14.8 },
    { at: 3.65, cap: 'today: fish!! 🐟', dur: 1.4 },
    { at: 5.1, cap: 'they wander around and when two of them meet…', dur: 2.0 },
    { at: 7.1, cap: '💕 baby fish 💕', dur: 1.3 },
    { at: 8.45, cap: 'then this happened', dur: 1.4 },
    { at: 9.9, circle: 'clump', r: [210, 170], dur: 3.4, follow: false },
    { at: 10.1, note: 'why are you ALL in the corner', x: 60, y: 560, anchor: 'clump', dy: -120, dur: 3.2, size: 66 },
    { at: 11.6, sticker: '💀', x: 820, y: 1060, dur: 1.7, rot: 8 },
    { at: 13.45, cap: 'forgot to normalize ONE vector', dur: 2.0 },
    { at: 13.45, hud: ['fish'], y: 470, dur: 4.9 },
    { at: 15.5, cap: 'fixed. now they actually spread out and make babies ✨', dur: 2.8 },
    end(18.4, 'day 3: the bears get hungry 🐻', 'follow for day 3'),
  ],
};

// ---------------------------------------------------------------- day 3: rush hour
DAYS.day03 = {
  file: 'day-03', length: 21.8,
  shots: [
    { clip: 'dl_d3_door', at: 0, dur: 5.0, sound: true },
    { clip: 'dl_d3_rush', at: 5.0, dur: 8.4, sound: 0.8, zoom: [[0, 1.0], [5, 1.0], [8.4, 1.14]], pan: [[0, [0.5, 0.5]], [8.4, [0.5, 0.62]]] },
    { clip: 'dl_d3_empty', at: 13.4, dur: 5.2, speed: 0.96, sound: true, punch: 0.06 },
    { clip: 'dl_d3_empty', at: 18.6, dur: 3.2, still: 149, zoom: [1.0, 1.04] },
  ],
  cues: [
    { at: 0, music: 'day', volume: 0.45 },
    hook(3, '🐻', 3.0),
    { at: 0.1, clock: true, dur: 4.9 },
    { at: 1.7, cap: 'at 5pm the office lets out…', dur: 2.6, y: 1330 },
    badge(3, 3.0, 21.8),
    { at: 5.0, music: 'rush', volume: 0.5, fade: 0.4 },
    { at: 5.0, sfx: 'whoosh', volume: 0.3 },
    { at: 5.05, cap: '…and EVERY bear runs straight to your pond', dur: 2.7 },
    { at: 5.0, hud: ['coins', 'fish'], y: 300, dur: 8.4 },
    { at: 7.9, cap: 'they cannonball in and eat your fish (+5 coins each)', dur: 2.8 },
    { at: 10.8, cap: 'this is so dumb i love it', dur: 2.5 },
    { at: 13.45, cap: 'they ate EVERYTHING 😭', dur: 2.0 },
    { at: 15.5, note: 'balance?\nnever heard of her', x: 90, y: 520, dur: 3.0, size: 76 },
    { at: 15.8, cap: '(fixing that later)', style: 'small', dur: 2.6, y: 1380 },
    end(18.6, 'day 4: making the main\ncharacter 🦊', "follow, he's cute i promise", 3.2),
  ],
};

// ---------------------------------------------------------------- day 4: Reynard
DAYS.day04 = {
  file: 'day-04', length: 24.2,
  shots: [
    { color: '#3b2a1e', at: 0, dur: 4.4 },
    { clip: 'dl_d4_build', at: 4.4, dur: 7.2, speed: 1.25, sound: 0.6 },
    { clip: 'dl_d4_anims', at: 11.6, dur: 5.0, speed: 1.6, punch: 0.05 },
    { clip: 'dl_d4_swap', at: 16.6, dur: 5.0, speed: 1.15, sound: true },
    { clip: 'dl_d4_swap', at: 21.6, dur: 2.6, still: 179, zoom: [1.0, 1.04] },
  ],
  cues: [
    { at: 0, music: 'lab', volume: 0.5 },
    hook(4, '🦊', 4.2),
    { at: 0.1, sketch: 'fox', dur: 4.3, draw: 3.9 },
    badge(4, 4.4, 24.2),
    { at: 4.4, sfx: 'whoosh', volume: 0.3 },
    { at: 4.4, vxui: true, dur: 5.3 },
    { at: 4.6, cap: 'modeling him voxel by voxel', dur: 2.4, y: 1440 },
    { at: 7.1, cap: '(sped up. a LOT)', style: 'small', dur: 2.0, y: 1440 },
    { at: 9.68, flash: 0.25 },
    { at: 9.68, sfx: 'fanfare_small', volume: 0.45 },
    { at: 9.8, cap: 'meet reynard 🥹', dur: 1.8, y: 1440 },
    { at: 11.6, cap: 'then i animated him. he has a LOT of feelings', dur: 2.8, y: 1400 },
    { at: 11.6, panel: { title: 'reynard.anims', rows: [{ label: 'clip', dd: (v) => v.anim || 'idle' }, { label: 'speed', v: 1.0, max: 2, dp: 1 }, { label: 'blend', v: 0.15, dp: 2 }] }, dur: 5.0 },
    { at: 14.45, cap: 'the facepalm is so me 😭', dur: 2.1, y: 1400 },
    { at: 16.6, cap: 'ok. replacing the cube 🫡', dur: 1.6 },
    { at: 18.0, sfx: 'star_pop', volume: 0.4 },
    { at: 18.3, cap: 'MUCH better', dur: 2.0 },
    { at: 20.2, sticker: '✨', x: 760, y: 700, dur: 1.4 },
    end(21.6, 'day 5: the bears get real 🐻', 'follow for day 5'),
  ],
};

// ---------------------------------------------------------------- day 5: the bears
DAYS.day05 = {
  file: 'day-05', length: 22.0,
  shots: [
    { clip: 'dl_d5_turn', at: 0, dur: 6.4, speed: 1.28 },
    { clip: 'dl_d5_lineup', at: 6.4, dur: 5.0, speed: 1.3, sound: true, punch: 0.05 },
    { clip: 'dl_d5_world', at: 11.4, dur: 7.2, speed: 1.1, sound: true },
    { clip: 'dl_d5_world', at: 18.6, dur: 3.4, still: 239, zoom: [1.0, 1.04] },
  ],
  cues: [
    { at: 0, music: 'morning', volume: 0.5 },
    hook(5, '🐻', 3.6),
    { at: 0.8, tag: 'walk', x: 70, y: 1420, style: 'white', dur: 1.5 },
    { at: 2.35, tag: 'eat', x: 70, y: 1420, style: 'white', dur: 1.15 },
    { at: 3.5, tag: 'ROAR', x: 70, y: 1420, style: 'red', dur: 1.15 },
    { at: 4.7, tag: 'yay', x: 70, y: 1420, style: 'green', dur: 1.6 },
    badge(5, 3.6, 22.0),
    { at: 3.7, cap: 'office bear, fully animated', dur: 2.6, y: 1250 },
    { at: 6.45, cap: 'then i made a few more…', dur: 2.0 },
    { at: 8.6, cap: 'which one are you? 👀', dur: 2.6 },
    { at: 11.45, cap: 'the pills got promoted 🫡', dur: 2.3 },
    { at: 13.9, cap: 'walking, cannonballs, swimming, eating. all working', dur: 2.6 },
    { at: 16.6, note: '(fish are still balls lol)', x: 110, y: 1490, dur: 2.0, size: 62 },
    end(18.6, 'day 6: making it look\nlike pixel art ✨', 'follow for day 6', 3.4),
  ],
};

// ---------------------------------------------------------------- day 6: the pixel-art renderer
DAYS.day06 = {
  file: 'day-06', length: 25.0,
  shots: [
    { clip: 'dl_d6_plain', at: 0, dur: 3.2 },
    { clip: 'dl_d6_plain', at: 3.2, dur: 4.2, from: 96, blur: 10, dim: 0.5 },
    { clip: 'dl_d6_low', at: 7.4, dur: 3.4, from: 40, zoom: [[0, 1.0], [0.6, 2.2]], pan: [[0, [0.5, 0.5]], [0.6, [0.62, 0.4]]] },
    { clip: 'dl_d6_outline', at: 10.8, dur: 3.4, from: 40, zoom: 2.2, pan: [[0, [0.62, 0.4]]] },
    { clip: 'dl_d6_pixel', at: 14.2, dur: 3.4, from: 40, zoom: [[0, 2.2], [2.4, 2.2], [3.4, 1.0]], pan: [[0, [0.62, 0.4]], [2.4, [0.62, 0.4]], [3.4, [0.5, 0.5]]] },
    { wipe: true, a: { clip: 'dl_d6_plain', from: 60, speed: 0.8 }, b: { clip: 'dl_d6_pixel', from: 60, speed: 0.8 }, at: 17.6, dur: 4.8, x: [[0, 1080], [1.1, 160], [2.3, 920], [3.4, 540]] },
    { clip: 'dl_d6_pixel', at: 22.4, dur: 2.6, still: 179 },
  ],
  cues: [
    { at: 0, music: 'night', volume: 0.5 },
    hook(6, '✨', 3.0),
    { at: 0.25, tag: 'how it looked yesterday', x: 40, y: 400, style: 'white', dur: 2.9 },
    badge(6, 3.0, 25.0),
    { at: 3.2, code: 'pixel', y: 560, dur: 4.2, type: 3.0 },
    { at: 3.3, cap: 'the trick: render it TINY…', dur: 2.0, y: 1330 },
    { at: 5.35, cap: '…then blow it up and draw outlines', dur: 2.0, y: 1330 },
    { at: 7.4, sfx: 'whoosh', volume: 0.3 },
    { at: 7.45, tag: '1. render at 1/3 res', x: 40, y: 330, style: 'white', dur: 3.35 },
    { at: 10.8, tag: '2. + outlines', x: 40, y: 330, style: 'white', dur: 3.35 },
    { at: 14.2, tag: '3. + color grade + bloom', x: 40, y: 330, style: 'white', dur: 3.35 },
    { at: 7.4, panel: { title: 'post fx', top: 430, rows: [{ label: 'pixelScale', v: 3, max: 4, dp: 0 }, { label: 'outline', v: (lt) => (lt < 3.4 ? 0 : 0.55), dp: 2 }, { label: 'bloom', v: (lt) => (lt < 6.8 ? 0 : 0.42), dp: 2 }, { label: 'saturation', v: (lt) => (lt < 6.8 ? 1 : 1.1), max: 2, dp: 2 }] }, dur: 10.2 },
    { at: 10.8, sfx: 'click', volume: 0.35 },
    { at: 14.2, sfx: 'click', volume: 0.35 },
    { at: 17.6, tag: 'before', x: 40, y: 330, style: 'white', dur: 4.8 },
    { at: 17.6, tag: 'after', x: 840, y: 330, style: 'red', dur: 4.8 },
    { at: 18.0, cap: 'same 3D scene. i keep staring at it 🥹', dur: 3.2 },
    end(22.4, 'day 7: drawing the world 🌲', 'follow for day 7'),
  ],
};

// ---------------------------------------------------------------- day 7: the real world + day/night
DAYS.day07 = {
  file: 'day-07', length: 22.2,
  shots: [
    { clip: 'dl_d6_pixel', at: 0, dur: 3.0, from: 60 },
    { clip: 'g7_world', at: 3.0, dur: 6.4, punch: 0.06 },
    { clip: 'g7_cycle', at: 9.4, dur: 7.6, speed: 1.05 },
    { stack: [{ clip: 'dl_d1_orbit', still: 120, zoom: 1.15 }, { clip: 'g7_world', from: 150 }], at: 17.0, dur: 2.6 },
    { clip: 'g7_world', at: 19.6, dur: 2.6, still: 239 },
  ],
  cues: [
    { at: 0, music: 'morning', volume: 0.5 },
    hook(7, '🌲', 3.0),
    { at: 0.2, tag: 'yesterday', x: 40, y: 400, style: 'white', dur: 2.8 },
    { at: 0.5, cap: 'the world was still flat green…', dur: 2.4 },
    badge(7, 3.0, 22.2),
    { at: 3.0, flash: 0.3 },
    { at: 3.0, sfx: 'star_pop', volume: 0.4 },
    { at: 3.05, cap: 'so i drew the whole world 🌲', dur: 2.3 },
    { at: 5.4, cap: 'grass, trees, flowers, rocks, lily pads… all pixel art', dur: 2.6 },
    { at: 8.0, cap: '(the fish are real now too)', style: 'small', dur: 1.4 },
    { at: 9.45, cap: '+ a day/night cycle', dur: 2.4 },
    { at: 12.9, music: 'night', volume: 0.5, fade: 1.5 },
    { at: 12.95, cap: 'night is my favorite 🌙', dur: 2.6 },
    { at: 17.0, tag: 'day 1', x: 40, y: 300, style: 'white', dur: 2.6 },
    { at: 17.0, tag: 'day 7', x: 40, y: 1260, style: 'red', dur: 2.6 },
    end(19.6, 'day 8: building stuff 🔨', 'follow for day 8'),
  ],
};

// ---------------------------------------------------------------- day 8: building
DAYS.day08 = {
  file: 'day-08', length: 21.0,
  shots: [
    { clip: 'g8_build', at: 0, dur: 2.8, still: 0, blur: 10, dim: 0.5 },
    { clip: 'g8_build', at: 2.8, dur: 8.8, sound: true },
    { clip: 'g8_use', at: 11.6, dur: 6.8, speed: 1.15, sound: 0.7, punch: 0.05 },
    { clip: 'g8_use', at: 18.4, dur: 2.6, still: 239 },
  ],
  cues: [
    { at: 0, music: 'day', volume: 0.5 },
    hook(8, '🔨', 2.8),
    { at: 0.3, code: 'build', y: 620, dur: 2.5, type: 2.0 },
    badge(8, 2.8, 21.0),
    { at: 2.85, cap: 'building system!! 🔨', dur: 1.9 },
    { at: 4.8, cap: 'every placement gets a squash, a dust puff and a POW', dur: 2.8 },
    { at: 7.7, cap: 'tables, a bbq, a jukebox…', dur: 2.2 },
    { at: 9.95, cap: 'it looks like a restaurant now', dur: 1.6 },
    { at: 11.65, cap: 'and at 5pm… they actually use it 🥹', dur: 2.9 },
    { at: 14.7, cap: 'my little bear restaurant', dur: 2.6 },
    end(18.4, 'day 9: adding JUICE 🧃', 'follow for day 9'),
  ],
};

// ---------------------------------------------------------------- day 9: juice
DAYS.day09 = {
  file: 'day-09', length: 23.0,
  shots: [
    { clip: 'g9_plain', at: 0, dur: 4.6 },
    { clip: 'g9_juice', at: 4.6, dur: 3.0, still: 0, blur: 10, dim: 0.5 },
    { clip: 'g9_juice', at: 7.6, dur: 8.0, sound: true },
    { stack: [{ clip: 'g9_plain', from: 60, zoom: 1.2 }, { clip: 'g9_juice', from: 90, zoom: 1.2 }], at: 15.6, dur: 4.8 },
    { clip: 'g9_juice', at: 20.4, dur: 2.6, still: 239 },
  ],
  cues: [
    { at: 0, music: 'feast', volume: 0.45 },
    hook(9, '🧃', 3.0),
    { at: 0.3, tag: 'no juice', x: 40, y: 420, style: 'white', dur: 4.2 },
    { at: 1.0, cap: 'it worked… but it felt dead', dur: 3.0 },
    badge(9, 3.0, 23.0),
    { at: 4.6, code: 'juice', y: 600, dur: 3.0, type: 2.4 },
    { at: 4.7, cap: 'so i added JUICE 🧃', dur: 2.8, y: 1420 },
    { at: 7.6, sfx: 'whoosh', volume: 0.3 },
    { at: 7.7, cap: 'comic words ✅', dur: 1.3 },
    { at: 9.0, cap: 'squash & stretch ✅', dur: 1.3 },
    { at: 10.3, cap: 'screen shake ✅', dur: 1.3 },
    { at: 11.6, cap: 'particles + coins ✅', dur: 1.3 },
    { at: 12.9, cap: 'SO many sound effects ✅', dur: 1.4 },
    { at: 14.3, cap: 'night and day 😭', dur: 1.3 },
    { at: 15.6, tag: 'before', x: 40, y: 300, style: 'white', dur: 4.8 },
    { at: 15.6, tag: 'after', x: 40, y: 1260, style: 'red', dur: 4.8 },
    { at: 16.0, cap: 'which one would you play? 👀', dur: 4.3, y: 930 },
    end(20.4, 'day 10: is it a real game now? 👀', 'follow for day 10'),
  ],
};

// ---------------------------------------------------------------- day 10: title screen + look back
DAYS.day10 = {
  file: 'day-10', length: 26.0,
  shots: [
    { clip: 'g10_title', at: 0, dur: 6.0, sound: true },
    { clip: 'g9_juice', at: 6.0, dur: 1.0, from: 120, punch: 0.06, sound: 0.6 },
    { clip: 'g8_build', at: 7.0, dur: 1.0, from: 190, punch: 0.06, sound: 0.6 },
    { clip: 'g7_cycle', at: 8.0, dur: 1.0, from: 150, punch: 0.06 },
    { clip: 'dl_d4_build', at: 9.0, dur: 1.0, from: 225, punch: 0.06 },
    { clip: 'dl_d5_lineup', at: 10.0, dur: 1.0, from: 150, punch: 0.06 },
    { clip: 'g8_use', at: 11.0, dur: 1.0, from: 100, punch: 0.06, sound: 0.6 },
    { clip: 'g7_world', at: 12.0, dur: 1.2, from: 60, punch: 0.06 },
    { stack: [{ clip: 'dl_d1_walk', from: 60, speed: 0.7, zoom: 1.1 }, { clip: 'g8_use', from: 60, speed: 0.9, zoom: 1.15 }], at: 13.2, dur: 6.2 },
    { clip: 'g10_title', at: 19.4, dur: 6.6, still: 239 },
  ],
  cues: [
    { at: 0, music: 'title', volume: 0.55 },
    hook(10, '🐻', 3.0),
    { at: 0.5, cap: 'made a title screen 🥹', dur: 2.0, y: 1330 },
    badge(10, 3.0, 26.0),
    { at: 2.6, cap: "there's always a bear in the pond", dur: 2.8, y: 1330 },
    { at: 6.0, tag: 'juice', x: 40, y: 330, style: 'white', dur: 0.95 },
    { at: 7.0, tag: 'building', x: 40, y: 330, style: 'white', dur: 0.95 },
    { at: 8.0, tag: 'day & night', x: 40, y: 330, style: 'white', dur: 0.95 },
    { at: 9.0, tag: 'reynard', x: 40, y: 330, style: 'white', dur: 0.95 },
    { at: 10.0, tag: 'the bears', x: 40, y: 330, style: 'white', dur: 0.95 },
    { at: 11.0, tag: 'the rush', x: 40, y: 330, style: 'white', dur: 0.95 },
    { at: 12.0, tag: 'the world', x: 40, y: 330, style: 'white', dur: 1.15 },
    { at: 6.0, sfx: 'whoosh', volume: 0.25 },
    { at: 13.2, sfx: 'whoosh', volume: 0.3 },
    { at: 13.2, tag: 'day 1', x: 40, y: 300, style: 'white', dur: 6.2 },
    { at: 13.2, tag: 'day 10', x: 40, y: 1260, style: 'red', dur: 6.2 },
    { at: 13.5, cap: 'day 1 vs day 10', dur: 2.8, y: 930 },
    { at: 16.4, cap: 'still SO much to do. but i love it', dur: 2.9, y: 930 },
    end(19.4, 'The Bear Must Eat 🐻🐟', 'thank u for following along 🫶<br>should i keep going?', 6.6),
  ],
};
