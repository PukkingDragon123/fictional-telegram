// The ten devlog days. Each day is a function of its voice-over timing (vo/<day>.json): V.s(id) /
// V.e(id) = when a line starts / ends, V.w(id, i) = when its i-th word starts, V.f(id, 'word') = when that word starts, V.len = narration
// length. It returns { length, shots, cues }: shots are clips (tools/video/clips/<name>, at/dur in
// seconds, clip frame = from + (t - at) * 30 * speed), cues are stickers and sounds.
// Clips: tools/devlog/clipdefs.mjs (dl_q*: the square prototype, g*: the real game).
export const FPS = 30;

export function voHelper(vo) {
  const L = (id) => { const l = vo.lines[id]; if (!l) throw new Error('no vo line ' + id); return l; };
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
  // f(id, 'word', n): when the n-th "word" of a line starts (so cues survive script rewrites)
  const f = (id, word, n = 0) => {
    const ws = L(id).words.filter((x) => norm(x[0]) === norm(word));
    if (!ws[n]) throw new Error(`no word "${word}" (#${n}) in line ${id}`);
    return ws[n][1];
  };
  return { s: (id) => L(id).t0, e: (id) => L(id).t1, w: (id, i) => L(id).words[i][1], f, len: vo.length };
}
// play a clip so that clip-time `ct` (s) lands on video time `vt`
const sync = (ct, vt, at, speed = 1) => Math.max(0, Math.round((ct - (vt - at) * speed) * FPS));
const hook = (n) => ({ at: 0, hook: `day ${n} of making\nmy dream game`, instant: true, dur: 2.3 });
const badge = (n, until) => ({ at: 2.3, badge: `DAY ${n}`, dur: until - 2.35 }); // gone before a day-1-vs-now split
const end = (at, len, a, b, icon) => ({ at, end: [a, b], icon, dur: len - at });

export const DAYS = {};

// ---------------------------------------------------------------- day 1: the idea (real-life references), then squares
// tools/devlog/refs/1-4.jpg: your reference photos (a pond, salmon, a bear catching salmon, a cute bear)
DAYS.day01 = (V) => {
  const len = V.e('cta') + 1.0;
  const tBug = V.s('test');
  const boardEnd = V.s('name');
  return {
    length: len,
    song: { file: 'octopus', from: 0.6, levels: { music: -22, duckMusic: 13 } },
    fox: [
      { at: 0.05, enter: 'br', expr: 'happy', anim: 'wave_hello', for: 1.4 },
      { at: V.s('idea1'), expr: 'excited', anim: 'think', for: 1.6 },
      { at: V.s('idea2'), expr: 'yum', fx: 'hearts', fxFor: 2.0 },
      { at: V.s('idea3'), expr: 'laugh', spot: 'bl' },
      { at: V.f('idea3', 'waterfall'), expr: 'dreamy', fx: 'notes', fxFor: 2.0 },
      { at: V.f('idea3', 'jump'), expr: 'shocked', fx: 'shock', anim: 'cheer', for: 1.0 },
      { at: V.s('idea4'), expr: 'happy', spot: 'c', scale: 1.3 },
      { at: V.f('idea4', 'cute'), expr: 'love', fx: 'hearts', anim: 'cheer', for: 1.4 },
      { at: V.s('name'), spot: 'br', scale: 1.15, expr: 'proud', anim: 'bow_fancy', fx: 'sparkle', for: 1.6 },
      { at: V.s('squares'), expr: 'embarrassed', anim: 'shrug', fx: 'sweat', for: 1.4 },
      { at: V.f('squares', 'know'), expr: 'laugh', anim: 'facepalm', for: 1.2 },
      { at: V.s('bear'), expr: 'happy', anim: 'point', for: 1.2 },
      { at: V.f('bear', 'yeah'), expr: 'wink', fx: 'sparkle' },
      { at: V.s('test'), expr: 'determined', spot: 'bl', run: true },
      { at: V.s('through') + 0.25, expr: 'horror', fx: 'shock', gag: 'popHat', shake: 0.7, sfx: 'fox_startle' },
      { at: V.s('water'), expr: 'shocked', fx: 'question' },
      { at: V.f('water', 'bro'), expr: 'ko', anim: 'facepalm', for: 1.4, fx: 'sweat' },
      { at: V.s('broken'), expr: 'embarrassed', anim: 'shrug', fx: 'sweat', for: 1.4 },
      { at: V.f('broken', 'fun'), expr: 'laugh', fx: 'notes' },
      { at: V.s('cta'), spot: 'br', scale: 1.15, expr: 'excited', anim: 'point', fx: 'question', for: 1.2 },
    ],
    shots: [
      { board: [
        { src: 'refs/1.jpg', at: 0.0, label: 'a pond', x: 540, y: 560, rot: -4, alt: 'g7_world' },
        { src: 'refs/2.jpg', at: V.s('idea2'), label: 'salmon', x: 360, y: 980, rot: 5, alt: 'sockeye' },
        { src: 'refs/3.jpg', at: V.s('idea3'), label: 'bears love salmon', x: 720, y: 760, rot: -3, alt: 'gb_title_eat' },
        { src: 'refs/4.jpg', at: V.s('idea4'), label: 'cute bears', x: 420, y: 1300, rot: 4, alt: 'dl_q5_lineup' },
      ], at: 0, dur: boardEnd },
      { clip: 'dl_q1_wide', at: boardEnd, dur: V.s('test') - boardEnd, speed: 6.9 / (V.s('test') - boardEnd), focus: 'fox', zoom: [[V.s('bear') - boardEnd - 0.05, 1], [V.s('bear') - boardEnd + 0.35, 2.0]] },
      { clip: 'dl_q1_walk', at: V.s('test'), dur: V.s('through') - 0.3 - V.s('test'), speed: 1.25, punch: 0.06 },
      { clip: 'dl_q1_bug', at: V.s('through') - 0.3, dur: V.s('cta') - V.s('through') + 0.3, from: sync(1.65, V.s('through') + 0.35, V.s('through') - 0.3), sound: true },
      { clip: 'dl_q2_fish', at: V.s('cta'), dur: len - V.s('cta'), dim: 0.25 },
    ],
    cues: [
      { at: 0, music: 'morning', volume: 0.55 },
      hook(1), badge(1, len),
      { at: 2.4, tag: 'the idea', style: 'dark', x: 44, y: 330, dur: boardEnd - 2.5 },
      { at: boardEnd, flash: 0.3 },
      { at: boardEnd, sfx: 'whoosh', volume: 0.35 },
      { at: V.s('bear') + 0.1, arrow: 'bear', label: 'bear', dur: 1.6 },
      { at: V.f('bear', 'orange') , arrow: 'fox', label: 'me', dur: V.e('bear') - V.f('bear', 'orange') + 0.3 },
      { at: V.s('through') + 0.1, ring: 'fox', r: 190, dy: -40, dur: 1.5 },
      { at: V.s('broken') + 0.1, tag: 'bug #1', style: 'red', x: 60, y: 330, dur: V.e('broken') - V.s('broken') + 0.3 },
      { at: V.s('cta'), sfx: 'whoosh', volume: 0.3 },
      end(V.s('cta') + 0.2, len, 'DAY 2: FISH', null, 'fish'),
    ],
  };
};

// ---------------------------------------------------------------- day 2: square fish
DAYS.day02 = (V) => {
  const len = V.e('cta') + 1.0;
  return {
    length: len,
    song: { file: 'octopus', from: 20, levels: { music: -22, duckMusic: 13 } },
    fox: [
      { at: 0.05, enter: 'bl', expr: 'happy', anim: 'wave_hello', for: 1.0 },
      { at: V.s('wander'), expr: 'dreamy' },
      { at: V.s('wander') + 0.3, spot: 'br', run: true },
      { at: V.f('wander', 'alive'), expr: 'proud', fx: 'sparkle' },
      { at: V.f('babies', 'baby'), expr: 'love', anim: 'cheer', fx: 'hearts', for: 1.4 },
      { at: V.s('then'), spot: 'bl', expr: 'determined' },
      { at: V.s('corner'), expr: 'horror', fx: 'shock', shake: 0.5 },
      { at: V.f('corner', 'why'), spot: 'c', scale: 1.35, expr: 'confused', anim: 'shrug', fx: 'question', for: 1.4 },
      { at: V.s('vector'), spot: 'bl', scale: 1.15, expr: 'embarrassed', anim: 'facepalm', fx: 'sweat', for: 1.4 },
      { at: V.f('vector', 'one', 1), expr: 'ko' },
      { at: V.s('fixed'), expr: 'proud', fx: 'sparkle', anim: 'cheer', for: 1.2 },
      { at: V.s('cta'), spot: 'br', expr: 'excited', anim: 'point', fx: 'question', for: 1.2 },
    ],
    shots: [
      { clip: 'dl_q2_fish', at: 0, dur: V.s('then'), speed: 6.4 / V.s('then'), sound: true },
      { clip: 'dl_q2_bug', at: V.s('then'), dur: V.s('vector') - V.s('then'), speed: 5.4 / (V.s('vector') - V.s('then')), focus: 'clump', zoom: [[V.s('corner') - 0.6, 1], [V.s('corner') - 0.2, 1.9]], punch: 0.05 },
      { clip: 'dl_q2_fixed', at: V.s('vector'), dur: V.s('cta') - V.s('vector'), from: 15, speed: 1.1, sound: true },
      { clip: 'dl_q3_door', at: V.s('cta'), dur: len - V.s('cta'), dim: 0.25 },
    ],
    cues: [
      { at: 0, music: 'day', volume: 0.55 },
      hook(2), badge(2, len),
      { at: V.s('corner') - 0.15, ring: 'clump', r: 200, dur: V.e('corner') - V.s('corner') + 0.5 },
      { at: V.s('vector'), tag: 'bug #2', style: 'red', x: 60, y: 330, dur: V.e('vector') - V.s('vector') + 0.2 },
      { at: V.s('fixed'), hud: ['fish'], y: 330, dur: V.s('cta') - V.s('fixed') },
      end(V.s('cta') + 0.2, len, 'DAY 3: RUSH HOUR', null, 'bell'),
    ],
  };
};

// ---------------------------------------------------------------- day 3: 5 PM
DAYS.day03 = (V) => {
  const len = V.e('cta') + 1.0;
  return {
    length: len,
    song: { file: 'octopus', from: 38, levels: { music: -22, duckMusic: 13 } },
    fox: [
      { at: 0.05, enter: 'bl', expr: 'excited' },
      { at: V.s('office'), expr: 'alarmed', fx: 'sweat' },
      { at: V.s('run'), expr: 'horror', anim: 'panic', fx: 'shock', for: 1.8, shake: 0.4 },
      { at: V.s('run') + 0.1, spot: 'br', run: true },
      { at: V.s('eat'), expr: 'excited', anim: 'cheer', fx: 'stars', for: 1.4 },
      { at: V.s('love'), expr: 'love', fx: 'hearts' },
      { at: V.f('love', 'dumb'), expr: 'laugh', anim: 'dance', fx: 'notes', for: 1.8 },
      { at: V.s('later'), spot: 'bl', expr: 'neutral' },
      { at: V.s('empty'), expr: 'shocked', gag: 'dropMonocle', fx: 'shock', shake: 0.4 },
      { at: V.s('confused'), expr: 'confused', anim: 'shrug', fx: 'question', for: 1.4 },
      { at: V.s('cta'), spot: 'br', expr: 'embarrassed', gag: 'restore', anim: 'facepalm', fx: 'sweat', for: 1.4 },
    ],
    noCaptions: [[V.s('later') - 0.05, V.e('later') + 0.3]], // the "10 SECONDS LATER" card says it
    shots: [
      { clip: 'dl_q3_door', at: 0, dur: V.s('run'), sound: true },
      { clip: 'dl_q3_rush', at: V.s('run'), dur: V.s('later') - V.s('run'), sound: 0.8, zoom: [[0, 1], [V.s('eat') - V.s('run'), 1], [V.e('eat') - V.s('run'), 1.45]], pan: [[0, [0.5, 0.5]], [V.e('eat') - V.s('run'), [0.5, 0.62]]] },
      { clip: 'dl_q3_empty', at: V.s('later'), dur: V.s('cta') - V.s('later'), sound: true, dim: 0 },
      { clip: 'dl_q3_empty', at: V.s('cta'), dur: len - V.s('cta'), still: 149, dim: 0.2 },
    ],
    cues: [
      { at: 0, music: 'rush', volume: 0.5 },
      hook(3), badge(3, len),
      { at: 0.1, clock: true, dur: V.s('run') - 0.1 },
      { at: V.s('eat'), hud: ['coins', 'fish'], y: 330, dur: V.s('later') - V.s('eat') },
      { at: V.s('later'), card: '10 SECONDS LATER', dur: V.e('later') - V.s('later') + 0.3 },
      end(V.s('cta') + 0.2, len, 'DAY 4: THE FOX', 'replacing the orange square', 'fox'),
    ],
  };
};

// ---------------------------------------------------------------- day 4: Reynard
DAYS.day04 = (V) => {
  const len = V.e('better') + 2.2;
  const buildDur = V.s('anims') - V.s('cubes');
  const swapAt = V.s('bye');
  return {
    length: len,
    song: { file: 'octopus', from: 108, levels: { music: -22, duckMusic: 13 } },
    fox: [
      { at: 0.05, enter: 'br', expr: 'happy' },
      { at: V.f('hook', 'me'), expr: 'embarrassed', anim: 'point', for: 1.0 },
      { at: V.s('me'), expr: 'sad', anim: 'shrug', fx: 'sweat', for: 1.4 },
      { at: V.f('me', 'deserve'), expr: 'determined' },
      { at: V.s('cubes'), expr: 'focused', scale: 0.85 },
      { at: V.s('rich'), expr: 'magnifique', anim: 'polish_monocle', fx: 'sparkle', for: 1.3 },
      { at: V.f('rich', 'yeah'), expr: 'laugh', fx: 'glint' },
      { at: V.s('anims'), spot: 'bl', expr: 'excited', anim: 'dance', for: 2.0 },
      { at: V.s('bye'), scale: 1.15, expr: 'happy', anim: 'wave_bye', for: 1.4 },
      { at: V.s('better'), spot: 'bl', expr: 'proud', anim: 'bow_fancy', fx: 'sparkle', for: 1.6 },
    ],
    shots: [
      { clip: 'dl_q4_swap', at: 0, dur: V.s('cubes'), still: 12, zoom: [1.0, 1.25] },
      { clip: 'dl_q4_build', at: V.s('cubes'), dur: buildDur, speed: 6.7 / (V.s('rich') + 0.05 - V.s('cubes')), sound: 0.6 },
      { clip: 'dl_q4_anims', at: V.s('anims'), dur: swapAt - V.s('anims'), speed: 2.2, punch: 0.05 },
      { clip: 'dl_q4_swap', at: swapAt, dur: len - swapAt, from: sync(1.4, V.e('bye') + 0.15, swapAt), sound: true },
    ],
    cues: [
      { at: 0, music: 'lab', volume: 0.55 },
      hook(4), badge(4, len),
      { at: V.s('me') + 0.2, arrow: 'fox', label: 'me', dur: V.e('me') - V.s('me') },
      { at: V.s('cubes') + 0.1, tag: 'timelapse', style: 'dark', x: 60, y: 330, dur: buildDur - 0.2 },
      { at: V.s('cubes'), capY: 1400 }, // under Reynard on the turntable
      { at: V.s('bye'), capY: 1200 },
      { at: V.e('bye') + 0.15, sfx: 'star_pop', volume: 0.4 },
      end(V.e('better') + 0.4, len, 'DAY 5: THE BEARS', 'the brown squares get promoted', 'star'),
    ],
  };
};

// ---------------------------------------------------------------- day 5: the bears
DAYS.day05 = (V) => {
  const len = V.e('cta') + 1.0;
  return {
    length: len,
    song: { file: 'octopus', from: 56, levels: { music: -22, duckMusic: 13 } },
    fox: [
      { at: 0.05, enter: 'bl', expr: 'excited', anim: 'wave_hello', for: 1.2 },
      { at: V.s('office'), expr: 'proud' },
      { at: V.f('office', 'roars'), expr: 'alarmed', fx: 'shock', shake: 0.5, anim: 'cower', for: 0.9 },
      { at: V.s('more'), spot: 'br', expr: 'happy' },
      { at: V.f('more', 'tips'), expr: 'love', fx: 'hearts' },
      { at: V.s('you'), spot: 'bc', expr: 'wink', anim: 'point', fx: 'question', for: 1.2 },
      { at: V.s('promo'), spot: 'bl', expr: 'proud', fx: 'sparkle' },
      { at: V.s('swim'), expr: 'excited', anim: 'cheer', for: 1.2 },
      { at: V.f('swim', 'watch'), expr: 'dreamy', fx: 'hearts' },
      { at: V.s('cta'), spot: 'br', expr: 'embarrassed', anim: 'shrug', for: 1.2 },
    ],
    shots: [
      { clip: 'dl_q5_turn', at: 0, dur: V.s('more'), speed: 1.45 },
      { clip: 'dl_q5_lineup', at: V.s('more'), dur: V.s('promo') - V.s('more'), speed: 6.4 / (V.s('promo') - V.s('more')), sound: true, punch: 0.05 },
      { clip: 'dl_q5_swap', at: V.s('promo'), dur: V.s('cta') - V.s('promo'), from: sync(1.0, V.e('promo') + 0.1, V.s('promo')), sound: true },
      { clip: 'dl_q5_swap', at: V.s('cta'), dur: len - V.s('cta'), from: 200, dim: 0.15 },
    ],
    cues: [
      { at: 0, music: 'morning', volume: 0.55 },
      hook(5), badge(5, len),
      { at: V.e('promo') + 0.1, sfx: 'star_pop', volume: 0.35 },
      end(V.s('cta') + 0.3, len, 'DAY 6: THE WORLD', null, 'tree'),
    ],
  };
};

// ---------------------------------------------------------------- day 6: drawing the world
DAYS.day06 = (V) => {
  const len = V.e('same') + 2.4;
  return {
    length: len,
    song: { file: 'octopus', from: 74, levels: { music: -22, duckMusic: 13 } },
    fox: [
      { at: 0.05, enter: 'bl', expr: 'tsk' },
      { at: 0.9, anim: 'shrug', fx: 'sweat', for: 1.2 },
      { at: V.s('drew'), expr: 'determined' },
      { at: V.s('drew') + 0.6, expr: 'magnifique', anim: 'cheer', fx: 'sparkle', for: 1.4 },
      { at: V.s('list'), expr: 'proud' },
      { at: V.f('list', 'fish'), expr: 'yum', fx: 'hearts' },
      { at: V.s('cycle'), spot: 'br', run: true, expr: 'happy' },
      { at: V.s('night'), expr: 'dreamy', fx: 'hearts', fxFor: 2.2 },
      { at: V.s('same'), spot: 'bl', expr: 'proud', anim: 'bow_fancy', fx: 'glint', for: 1.4 },
    ],
    shots: [
      { clip: 'dl_q5_swap', at: 0, dur: V.s('drew') + 0.6, from: 120, zoom: [1.0, 1.08] },
      { clip: 'g7_world', at: V.s('drew') + 0.6, dur: V.s('cycle') - V.s('drew') - 0.6, punch: 0.08 },
      { clip: 'g7_cycle', at: V.s('cycle'), dur: V.s('same') - V.s('cycle'), speed: 7.9 / (V.s('same') - V.s('cycle')) },
      { stack: [{ clip: 'dl_q1_wide', still: 60, zoom: 1.15 }, { clip: 'g7_world', from: 120 }], at: V.s('same'), dur: len - V.s('same') },
    ],
    cues: [
      { at: 0, music: 'day', volume: 0.55 },
      hook(6), badge(6, V.s('same')),
      { at: V.s('drew') + 0.6, flash: 0.35 },
      { at: V.s('drew') + 0.6, sfx: 'fanfare_small', volume: 0.45 },
      { at: V.s('night') - 0.2, music: 'night', volume: 0.5, fade: 1.0 },
      { at: V.s('same'), tag: 'day 1', style: 'dark', x: 44, y: 300, dur: len - V.s('same') },
      { at: V.s('same'), tag: 'day 6', style: 'red', x: 44, y: 1000, dur: len - V.s('same') },
      { at: V.s('same'), capY: 860 },
      end(V.e('same') + 0.5, len, 'DAY 7: YOUR COMMENTS', 'i add what you ask for', 'chat'),
    ],
  };
};

// ---------------------------------------------------------------- day 7: adding your comments: a banana fish
// gb_hatch: the egg in the pond, tapped at frame 10, cracked by taps at 64 / 82 / 100 (the banana
// bursts out with NEW SPECIES at ~110), the "new species discovered" card from ~262.
// gb_pond: bananas leaping out of the water at frames 105 (followed), 140, 178 (followed).
// gb_title_eat: the title-screen bear roars up, snaps a leaping banana fish (~frame 112) and eats it.
DAYS.day07 = (V) => {
  const len = V.e('cta') + 1.6;
  const drawAt = V.s('draw') - 0.2;
  const cardAt = V.s('beautiful') + 0.05, fishAt = V.f('beautiful', "it's", 1) - 0.05;
  return {
    length: len,
    song: { file: 'octopus', from: 128, levels: { music: -22, duckMusic: 13 } },
    fox: [
      { at: 0.05, enter: 'bl', expr: 'happy', anim: 'wave_hello', for: 1.2 },
      { at: V.s('banana'), expr: 'shocked', fx: 'question' },
      { at: V.f('banana', 'okay'), expr: 'laugh', anim: 'cheer', fx: 'sparkle', for: 1.0 },
      { at: V.s('draw'), expr: 'focused', scale: 0.85 },
      { at: V.s('draw') + 0.2, spot: 'br' },
      { at: V.s('pond'), spot: 'bl', scale: 1.15, expr: 'excited' },
      { at: V.s('beautiful'), expr: 'love', fx: 'hearts', anim: 'cheer', for: 1.2 },
      { at: V.f('beautiful', 'beautiful'), expr: 'magnifique', fx: 'sparkle' },
      { at: V.s('eat') - 0.1, spot: 'br', expr: 'horror', fx: 'shock', shake: 0.6, anim: 'cower', for: 1.2 },
      { at: V.f('eat', 'everything'), expr: 'laugh' },
      { at: V.s('cta'), spot: 'bc', expr: 'happy', anim: 'point', fx: 'question', for: 1.2 },
    ],
    shots: [
      { clip: 'g7_world', at: 0, dur: drawAt, from: 30, dim: 0.35, zoom: [1.0, 1.1] },
      { color: '#1b1420', at: drawAt, dur: V.s('pond') - drawAt },
      { clip: 'gb_hatch', at: V.s('pond'), dur: cardAt - V.s('pond'), sound: true, skip: ['levelup'], zoom: [[0, 1.0], [0.45, 1.0], [1.1, 1.3]], pan: [[0, [0.5, 0.5]], [0.45, [0.5, 0.5]], [1.1, [0.45, 0.42]]] },
      { clip: 'gb_hatch', at: cardAt, dur: fishAt - cardAt, from: 262, zoom: [1.45, 1.5], pan: [[0, [0.44, 0.47]], [1, [0.44, 0.47]]] },
      { clip: 'gb_pond', at: fishAt, dur: V.s('eat') - 0.1 - fishAt, from: sync(105 / 30, fishAt + 0.15, fishAt, 1.25), speed: 1.25, sound: true, skip: ['levelup'], punch: 0.06, zoom: [[0, 1.0], [V.f('beautiful', 'beautiful') - fishAt - 0.1, 1.0], [V.f('beautiful', 'beautiful') - fishAt + 0.3, 1.2]] },
      { clip: 'gb_title_eat', at: V.s('eat') - 0.1, dur: len - V.s('eat') + 0.1, from: sync(108 / 30, V.f('eat', 'eat') + 0.1, V.s('eat') - 0.1), sound: true, punch: 0.06, zoom: 1.5, pan: [[0, [0, 0.47]], [1, [0, 0.47]]] },
    ],
    cues: [
      { at: 0, music: 'title', volume: 0.5 },
      hook(7), badge(7, len),
      { at: V.s('banana') - 0.35, comment: 'add a banana fish', y: 420, dur: drawAt - V.s('banana') + 0.35 },
      { at: drawAt, draw: 'banana', file: 'banana_fish.png', speed: 'x12', dur: V.s('pond') - drawAt, drawT: V.e('draw') - drawAt - 0.3 },
      { at: drawAt, capY: 1340 },
      { at: V.s('pond'), capY: 1200 },
      { at: cardAt, capY: 1450 },
      { at: fishAt, capY: 1380 },
      { at: V.s('eat') - 0.1, capY: 1200 },
      end(V.s('cta') + 0.05, len, 'DAY 8: BUILDING', 'comment what i add next', 'chat'),
    ],
  };
};

// ---------------------------------------------------------------- day 8: building
DAYS.day08 = (V) => {
  const len = V.e('mine') + 1.8;
  return {
    length: len,
    song: { file: 'octopus', from: 92, levels: { music: -22, duckMusic: 13 } },
    fox: [
      { at: 0.05, enter: 'bl', expr: 'excited' },
      { at: V.s('build'), expr: 'proud' },
      { at: V.s('plonk'), expr: 'excited', anim: 'cheer', for: 1.0 },
      { at: V.f('plonk', 'satisfying'), expr: 'dreamy', fx: 'stars', fxFor: 1.2 },
      { at: V.s('list'), spot: 'br', run: true, expr: 'happy' },
      { at: V.s('sign'), expr: 'magnifique', anim: 'bow_fancy', fx: 'sparkle', for: 1.4 },
      { at: V.s('five'), spot: 'bl', expr: 'alarmed', fx: 'shock' },
      { at: V.f('five', 'actually'), expr: 'love', fx: 'hearts' },
      { at: V.s('mine'), spot: 'br', expr: 'love', anim: 'cheer', fx: 'hearts', for: 1.4 },
      { at: V.f('mine', 'happy'), expr: 'laugh', anim: 'dance', fx: 'notes', for: 1.4 },
    ],
    shots: [
      { clip: 'g8_build', at: 0, dur: V.s('sign'), sound: true, speed: 8.6 / V.s('sign') },
      { clip: 'g8_build', at: V.s('sign'), dur: V.s('five') - V.s('sign'), still: 269, zoom: [[0, 1.0], [0.35, 1.75]], pan: [[0, [0.5, 0.5]], [0.35, [0.8, 0.36]]] },
      { clip: 'g8_use', at: V.s('five'), dur: len - V.s('five'), sound: 0.7, punch: 0.06 },
    ],
    cues: [
      { at: 0, music: 'day', volume: 0.55 },
      hook(8), badge(8, len),
      { at: V.s('sign'), sfx: 'star_pop', volume: 0.4 },
      end(V.e('mine') + 0.3, len, 'DAY 9: JUICE', 'making it feel good', 'star'),
    ],
  };
};

// ---------------------------------------------------------------- day 9: juice
DAYS.day09 = (V) => {
  const len = V.e('cta') + 1.6;
  const juiceAt = V.e('juice') + 0.05;
  return {
    length: len,
    song: { file: 'octopus', from: 146, levels: { music: -22, duckMusic: 13 } },
    fox: [
      { at: 0.05, enter: 'bl', expr: 'sleepy' },
      { at: V.f('hook', 'dead'), expr: 'ko', anim: 'faint', for: V.s('juice') - V.f('hook', 'dead'), fx: 'zzz', fxFor: 1.6 },
      { at: V.s('juice'), expr: 'excited', anim: 'wake_startle', fx: 'shock', for: 1.0 },
      { at: V.s('list'), expr: 'excited', fx: 'sparkle' },
      { at: V.s('list') + 0.2, spot: 'br', run: true },
      { at: V.f('list', 'screen'), expr: 'dizzy', fx: 'stars', shake: 0.5 },
      { at: V.f('list', 'way'), expr: 'laugh', anim: 'dance', fx: 'notes', for: 1.8 },
      { at: V.s('compare'), spot: 'bl', expr: 'proud' },
      { at: V.s('cta'), spot: 'br', expr: 'happy', anim: 'point', fx: 'question', for: 1.2 },
    ],
    shots: [
      { clip: 'g9_plain', at: 0, dur: juiceAt },
      { clip: 'g9_juice', at: juiceAt, dur: V.s('compare') - juiceAt, sound: true, punch: 0.08 },
      { stack: [{ clip: 'g9_plain', from: 60, zoom: 1.2 }, { clip: 'g9_juice', from: 90, zoom: 1.2 }], at: V.s('compare'), dur: V.s('cta') - V.s('compare') },
      { clip: 'g9_juice', at: V.s('cta'), dur: len - V.s('cta'), from: 200, dim: 0.15 },
    ],
    cues: [
      { at: 0, music: 'feast', volume: 0.45 },
      hook(9), badge(9, V.s('compare')),
      { at: 0.2, tag: 'no juice', style: 'dark', x: 44, y: 520, dur: juiceAt - 0.2 },
      { at: juiceAt, flash: 0.3 },
      { at: juiceAt, sfx: 'fanfare_small', volume: 0.4 },
      { at: V.s('list') - 0.1, list: [[V.f('list', 'comic'), 'comic words'], [V.f('list', 'squash'), 'squash & stretch'], [V.f('list', 'screen'), 'screen shake'], [V.f('list', 'coins'), 'coins'], [V.f('list', 'way'), 'way too many sfx']], y: 520, dur: V.s('compare') - V.s('list') + 0.1 },
      { at: V.f('list', 'screen') + 0.05, shake: 0.5, amp: 24 },
      { at: V.s('compare'), tag: 'before', style: 'dark', x: 44, y: 300, dur: V.s('cta') - V.s('compare') },
      { at: V.s('compare'), tag: 'after', style: 'red', x: 44, y: 1000, dur: V.s('cta') - V.s('compare') },
      { at: V.s('compare'), capY: 860 },
      { at: V.s('cta'), capY: 1200 },
      end(V.s('cta') + 0.2, len, 'DAY 10', 'is it a real game yet?', 'gamepad'),
    ],
  };
};

// ---------------------------------------------------------------- day 10: title screen + look back
DAYS.day10 = (V) => {
  const len = V.e('cta') + 2.2;
  const m0 = V.s('now') + 0.7, mEnd = V.s('vs');
  const cuts = [['gb_hatch', 112], ['g8_build', 200], ['g7_cycle', 150], ['dl_q4_build', 228], ['dl_q5_lineup', 150], ['g9_juice', 100]];
  const step = (mEnd - m0) / cuts.length;
  return {
    length: len,
    song: { file: 'octopus', from: Math.max(0, 170.2 - len), levels: { music: -22, duckMusic: 13 } },
    fox: [
      { at: 0.05, enter: 'bl', expr: 'proud' },
      { at: V.f('hook', 'title'), expr: 'magnifique', anim: 'cheer', fx: 'sparkle', for: 1.4 },
      { at: V.f('bear', 'always'), expr: 'horror', anim: 'cower', fx: 'shock', shake: 0.8, for: 1.4 },
      { at: V.f('bear', 'always', 1), expr: 'laugh' },
      { at: V.s('ago'), spot: 'br', run: true, expr: 'dreamy' },
      { at: V.s('now'), expr: 'magnifique', anim: 'cheer', fx: 'sparkle', for: 1.4 },
      { at: V.s('vs'), spot: 'bl', expr: 'proud' },
      { at: V.s('cta'), expr: 'love', anim: 'wave_hello', fx: 'hearts', for: 1.6 },
      { at: V.f('cta', 'keep'), expr: 'happy', anim: 'point', fx: 'question', for: 1.2 },
    ],
    shots: [
      { clip: 'g10_title', at: 0, dur: V.s('ago'), sound: true, from: sync(3.75, V.f('bear', 'always') + 0.1, 0) },
      { clip: 'dl_q1_bug', at: V.s('ago'), dur: m0 - V.s('ago'), from: sync(3.4, V.f('ago', 'on'), V.s('ago')) },
      ...cuts.map(([clip, from], i) => ({ clip, from, at: m0 + i * step, dur: step, punch: 0.07, sound: i === 0 ? 0.6 : 0 })),
      { stack: [{ clip: 'dl_q1_wide', still: 60, zoom: 1.15 }, { clip: 'g8_use', from: 60, speed: 0.9 }], at: V.s('vs'), dur: V.s('cta') - V.s('vs') },
      { clip: 'g10_title', at: V.s('cta'), dur: len - V.s('cta'), still: 30 },
    ],
    cues: [
      { at: 0, music: 'title', volume: 0.55 },
      hook(10), badge(10, V.s('vs')),
      ...cuts.map((c, i) => ({ at: m0 + i * step, sfx: 'whoosh', volume: 0.18, pitch: 1 + i * 0.05 })),
      { at: V.s('vs'), tag: 'day 1', style: 'dark', x: 44, y: 300, dur: V.s('cta') - V.s('vs') },
      { at: V.s('vs'), tag: 'day 10', style: 'red', x: 44, y: 1000, dur: V.s('cta') - V.s('vs') },
      { at: V.s('vs'), capY: 860 },
      { at: V.s('cta'), capY: 1200 },
      end(V.s('cta') + 0.3, len, 'THE BEAR MUST EAT', 'follow to see where it goes', 'fox'),
    ],
  };
};
