// [v32 dig] The prehistoric forms the Primordial Vial wakes up. Every species maps
// to one ancient archetype; the archetype reshapes the species' own fish-art
// definition (src/art/fishArt.js DEFS: body profile, fins, tail, fangs, plates,
// patterns) and recolours it, so the result goes through the game's real fish
// renderer (same outline, shading, swim frames, flop pose and fry) and every
// species gets its own ancient sprite: new fangs, armour, spines and colours,
// not a tint. fishArt.js calls ancientDef(def) for the morph 'ancient' and
// ancientColors(def) for its palette (two marked inserts).
//
//   ARCHETYPES      { id: { name, prefix, latin, blurb, era } }
//   archetypeOf(speciesId) -> archetype id
//   ancientName(species) -> 'Sabre-tooth Sockeye'
//   ancientDef(def) -> a new def      ancientColors(def) -> { colors: {back, side, ...}, outK? }
export const ARCHETYPES = {
  sabre: { name: 'Sabre-tooth', prefix: 'Sabre-tooth', latin: 'Oncorhynchus rastrosus', era: 'Miocene', pal: 'red',
    blurb: 'Two-metre salmon with spiked fangs, back from the Miocene. Bears pay a LOT.' },
  armour: { name: 'Armoured', prefix: 'Armoured', latin: 'Dunkleosteus minor', era: 'Devonian', pal: 'amber',
    blurb: 'A head of bone plates and self-sharpening blade jaws. Dunkleosteus would be proud.' },
  fossil: { name: 'Fossil', prefix: 'Fossil', latin: 'Lithichthys vivus', era: 'Jurassic', pal: 'white',
    blurb: 'A living fossil: stone-grey skin with its old skeleton shining through.' },
  lobe: { name: 'Lobe-fin', prefix: 'Lobe-fin', latin: 'Latimeria lacustris', era: 'Devonian', pal: 'blue',
    blurb: 'Coelacanth blood: heavy blue scales with white flecks, fleshy lobed fins, a three-lobed tail.' },
  thorn: { name: 'Thornback', prefix: 'Thornback', latin: 'Acanthodes minimus', era: 'Silurian', pal: 'green',
    blurb: 'A spine in front of every fin and a bony helmet, like the spiny sharks of the Silurian.' },
};
const BY_SPECIES = {
  sabre: ['sockeye', 'chinook', 'coho', 'pinksalmon', 'kokanee', 'sabertooth', 'aurora'],
  armour: ['pike', 'muskie', 'walleye', 'bass', 'smallmouth', 'perch', 'burbot', 'tigermuskie', 'pikeeye', 'drum'],
  fossil: ['brook', 'rainbow', 'laketrout', 'char', 'bulltrout', 'cutthroat', 'browntrout', 'goldentrout', 'splake', 'tiger', 'grayling', 'whitefish', 'cisco', 'goldeye', 'sparctic'],
  lobe: ['sturgeon', 'paddlefish', 'gar', 'bowfin', 'eel', 'catfish', 'bullhead'],
  thorn: ['bluegill', 'pumpkinseed', 'goldfish', 'crappie', 'rockbass', 'creekchub', 'dace', 'sunperch', 'goldseed', 'bassgill', 'mapleKoi'],
};
const ARCH_OF = {};
for (const [a, ids] of Object.entries(BY_SPECIES)) for (const id of ids) ARCH_OF[id] = a;
export const archetypeOf = (id) => ARCH_OF[id] || 'thorn';
export function ancientName(sp) {
  if (!sp) return 'Prehistoric fish';
  if (sp.id === 'sabertooth') return 'Primeval Sabertooth';
  const A = ARCHETYPES[archetypeOf(sp.id)];
  return `${A.prefix} ${sp.name}`;
}
export const ancientInfo = (id) => ARCHETYPES[archetypeOf(id)];

// ---------------------------------------------------------------- helpers
const clone = (o) => JSON.parse(JSON.stringify(o));
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const prof = (pts, fn) => (pts || []).map(([s, t]) => [s, Math.max(0.002, fn(s, t))]);
const at = (pts, s) => {
  if (!pts?.length) return 0.05;
  if (s <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (s <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return va + (vb - va) * ((s - a) / (b - a || 1)); }
  return pts[pts.length - 1][1];
};
// where the jaw line sits near the snout (t), for hanging fangs from
function jawT(def) { const m = def.mouth?.pts; return m ? Math.min(...m.map((p) => p[1])) : -0.01; }

// ---------------------------------------------------------------- the transforms
const SHAPE = {
  // spawning-hook salmon: a humped back, a hooked snout, two long ivory fangs, a deeper fork
  sabre(d) {
    d.top = prof(d.top, (s, t) => t * (1 + 0.24 * smooth(0.08, 0.3, s) * (1 - smooth(0.36, 0.7, s))));
    const j = jawT(d), sn = 0.03;
    d.fangs = [
      { pts: [[sn + 0.015, j + 0.01], [sn + 0.055, j + 0.008], [sn + 0.045, j - 0.06], [sn + 0.032, j - 0.125], [sn + 0.018, j - 0.122], [sn + 0.028, j - 0.06]], mat: 'teeth' },
      { pts: [[sn + 0.07, j + 0.004], [sn + 0.1, j + 0.002], [sn + 0.09, j - 0.05], [sn + 0.078, j - 0.095], [sn + 0.066, j - 0.093], [sn + 0.074, j - 0.05]], mat: 'teeth' },
    ];
    for (const f of d.dorsal || []) if (!f.flat) { f.h = f.h.map(([a, h]) => [a, h * 1.35]); f.rays = Math.max(f.rays || 0, 4); }
    d.tail = { ...(d.tail || {}), type: 'deep', spread: (d.tail?.spread || 0.12) * 1.18, rays: 4 };
    d.pats = (d.pats || []).filter((p) => p.op !== 'spots' && p.op !== 'bars');
    d.pats.push(
      { op: 'head', mat: 'head', s: [[-1, 0.2], [0, 0.23], [1, 0.21]], belly: true },
      { op: 'spots', mat: 'p1', shape: ['dot', 'bean'], spacing: 0.055, region: 'body', n0: 0.25, n1: 1.1, s0: 0.24, s1: 0.84, seed: 41 },
      { op: 'lines', mat: 'p4', lines: [[[0.3, 0.1], [0.36, 0.0]], [[0.38, 0.11], [0.44, 0.01]], [[0.46, 0.1], [0.52, 0.01]], [[0.54, 0.08], [0.6, 0.0]]] },
    );
    d.eye = { ...(d.eye || { s: 0.12, t: 0.04 }), px: Math.max(3, d.eye?.px || 3) };
    d.mouth = { ...(d.mouth || {}), teethOpen: true };
  },
  // Dunkleosteus: a blunt plated head shield, blade jaws instead of teeth, back plates
  armour(d) {
    d.top = prof(d.top, (s, t) => t * (1 + 0.32 * (1 - smooth(0.06, 0.32, s))) + 0.006 * (1 - smooth(0, 0.1, s)));
    d.bot = prof(d.bot, (s, t) => t * (1 + 0.2 * (1 - smooth(0.06, 0.3, s))));
    const j = jawT(d);
    d.fangs = [
      { pts: [[0.004, j + 0.012], [0.08, j + 0.006], [0.07, j - 0.022], [0.035, j - 0.05], [0.012, j - 0.03]], mat: 'scute' }, // the upper shear
      { pts: [[0.09, j + 0.004], [0.13, j], [0.115, j - 0.03], [0.096, j - 0.038]], mat: 'scute' },
    ];
    d.scutes = { s0: 0.3, s1: 0.68, step: 0.055, w: 0.024, h: 0.02 };
    d.pats = (d.pats || []).filter((p) => p.op !== 'spots');
    d.pats.push(
      { op: 'head', mat: 'scute', s: [[-1, 0.27], [-0.3, 0.3], [0.4, 0.31], [1, 0.28]], belly: true },
      { op: 'plates', s0: 0.05, s1: 0.28, step: 0.05, n: 0.5, big: true },
      { op: 'plates', s0: 0.07, s1: 0.27, step: 0.06, n: -0.2 },
      { op: 'lines', mat: 'p2', lines: [[[0.17, 0.08], [0.2, -0.06]], [[0.24, 0.07], [0.26, -0.05]], [[0.06, 0.04], [0.16, 0.05]]] },
      { op: 'mottle', mat: 'p1', scale: 0.06, th: 0.62, n0: -0.2, n1: 1, s0: 0.3, s1: 0.85, seed: 43 },
    );
    if (d.gill) d.gill = { ...d.gill, s: Math.max(d.gill.s, 0.3) };
    d.mouth = { ...(d.mouth || {}), teethOpen: false };
  },
  // a living fossil: the ribs and spine glow through, a blunt bony skull
  fossil(d) {
    d.pats = (d.pats || []).filter((p) => p.op === 'head');
    d.pats.push(
      { op: 'head', mat: 'p3', s: [[-1, 0.17], [0, 0.2], [1, 0.18]], belly: true },
      { op: 'bars', mat: 'p6', n: 11, s0: 0.24, s1: 0.76, hw: 0.007, hwBot: 0.006, nTop: 0.78, nBot: -0.72, slant: -0.25, over: true, tone: 3 },
      { op: 'band', mat: 'p6', n0: [[0, 0.04], [1, 0.04]], n1: [[0, 0.15], [1, 0.15]], s0: 0.2, s1: 0.82 },
      { op: 'mottle', mat: 'p1', scale: 0.05, th: 0.66, s0: 0.2, s1: 0.86, seed: 44 },
      { op: 'stamp', mat: 'p6', s: 0.12, t: 0.05, rows: ['.##.', '#..#', '#.##', '.#..'] },
    );
    for (const f of d.dorsal || []) { f.rays = Math.max(f.rays || 0, 4); f.edge = 'finx'; }
    d.tail = { ...(d.tail || {}), rays: 5, type: d.tail?.type === 'fork' ? 'square' : d.tail?.type };
    d.scales = null;
  },
  // coelacanth: deeper body, fleshy lobed fins, the three-lobed tail, white flecks
  lobe(d) {
    d.top = prof(d.top, (s, t) => t * 1.16);
    d.bot = prof(d.bot, (s, t) => t * 1.12);
    d.tail = {
      poly: [[0.3, 0.7], [0.6, 1.0], [0.78, 0.86], [0.74, 0.46], [0.84, 0.24], [0.98, 0.2], [1, 0], [0.98, -0.2], [0.84, -0.24], [0.74, -0.46], [0.78, -0.86], [0.6, -1.0], [0.3, -0.7]],
      spread: Math.max(0.12, (d.tail?.spread || 0.12) * 1.1), rays: 5,
    };
    const lobeFin = (s0, s1, h) => ({ s0, s1, h: [[0, h * 0.5], [0.25, h], [0.6, h * 0.95], [1, h * 0.3]], rake: 0.9, rays: 3, edge: 'finx' });
    d.dorsal = [lobeFin(0.3, 0.42, 0.11), lobeFin(0.58, 0.68, 0.09)];
    d.ventral = [lobeFin(0.4, 0.5, 0.1), lobeFin(0.6, 0.7, 0.085)];
    d.pec = { s: 0.24, t: -0.05, len: 0.16, w: 0.075, ang: 32, lead: 'finx' };
    d.scutes = null;
    d.barbels = null;
    d.pats = (d.pats || []).filter((p) => p.op === 'head');
    d.pats.push(
      { op: 'spots', mat: 'p6', shape: ['dot', 'dot', 'bean'], spacing: 0.06, region: 'body', s0: 0.12, s1: 0.86, p: 0.75, seed: 45 },
      { op: 'mottle', mat: 'p1', scale: 0.045, th: 0.6, s0: 0.1, s1: 0.86, seed: 46 },
    );
    d.scales = { per: 3, s0: 0.2 };
    d.swim = { ...(d.swim || {}), wave: d.swim?.wave ? d.swim.wave * 0.6 : undefined };
    if (!d.swim.wave) delete d.swim.wave;
  },
  // spiny shark: a tall spine leading every fin, a bony helmet, a ridge of thorns
  thorn(d) {
    for (const f of d.dorsal || []) { f.h = f.h.map(([a, h], i) => [a, h * (i === 0 ? 1.9 : 1.25)]); f.spines = Math.max(f.spines || 0, 4); f.dip = 0.55; f.lead = 'p6'; f.leadW = 0.12; }
    for (const f of d.ventral || []) { f.h = f.h.map(([a, h], i) => [a, h * (i === 0 ? 1.5 : 1.1)]); f.lead = 'p6'; f.leadW = 0.15; }
    d.scutes = { s0: 0.22, s1: 0.7, step: 0.045, w: 0.02, h: 0.024 };
    const j = jawT(d);
    d.fangs = [{ pts: [[0.012, j + 0.008], [0.04, j + 0.006], [0.028, j - 0.05], [0.02, j - 0.048]], mat: 'teeth' }];
    d.pats = (d.pats || []).filter((p) => p.op !== 'blob');
    d.pats.push(
      { op: 'head', mat: 'scute', s: [[-1, 0.2], [0, 0.24], [1, 0.22]], belly: false },
      { op: 'plates', s0: 0.04, s1: 0.2, step: 0.05, n: 0.55 },
      { op: 'saddles', mat: 'p2', n: 4, s0: 0.28, s1: 0.78, hw: 0.028, nD: 0.2 },
    );
  },
};

/** The fish-art definition of a species' prehistoric form (fishArt.js spriteSet). */
export function ancientDef(def) {
  const d = clone(def);
  d.top = d.top || [[0, 0.02], [0.4, 0.1], [0.8, 0.05]];
  d.bot = d.bot || [[0, 0.02], [0.4, 0.09], [0.8, 0.05]];
  d.dorsal = d.dorsal || []; d.ventral = d.ventral || []; d.pats = d.pats || [];
  const a = archetypeOf(def.id);
  try { SHAPE[a](d); } catch (e) { console.warn('[dig] ancient shape', def.id, e); }
  d.ancient = a;
  return d;
}

// palettes: tuned per archetype, nudged by the species' own colours so a Sabre-tooth
// Sockeye and a Sabre-tooth Coho are cousins, not clones
const PALS = {
  sabre: { back: '#5a1018', side: '#a8202a', belly: '#d8c8b8', head: '#2a3426', fin: '#4a1418', fin2: '#5a2a24', finx: '#e8c8a8', p1: '#12080a', p4: '#f0b8a8', scute: '#f2ead2', teeth: '#fff8e8', iris: '#ffc030', mouth: '#2a0c10' },
  armour: { back: '#2a3038', side: '#4a5260', belly: '#c8c4b4', head: '#6a5a3a', fin: '#3a4048', fin2: '#3a4048', finx: '#9aa2ac', p1: '#20262e', p2: '#3a2a14', scute: '#b89a5a', teeth: '#e8dcb8', iris: '#ff6a2a', mouth: '#1a1418' },
  fossil: { back: '#4a4c50', side: '#6a6a66', belly: '#a8a498', head: '#8a8678', fin: '#5a5a58', fin2: '#5a5a58', finx: '#e8dcc0', p1: '#3a3c40', p3: '#c8bea4', p6: '#f2e6c8', scute: '#e8dcc0', iris: '#e8e0c8', pupil: '#2a2420', mouth: '#2a2826' },
  lobe: { back: '#1a2e5a', side: '#2a4a86', belly: '#6a86b8', head: '#1e3464', fin: '#2a4a86', fin2: '#2a4a86', finx: '#8ab0e8', p1: '#14244a', p6: '#f4f8ff', scute: '#c8d8f0', iris: '#a8ff7a', mouth: '#0e1a34' },
  thorn: { back: '#5a3a1a', side: '#a8622a', belly: '#e8d0a0', head: '#7a5a3a', fin: '#8a4a22', fin2: '#8a4a22', finx: '#f0dcb0', p2: '#3a2010', p6: '#fff4dc', scute: '#e8d8b0', teeth: '#fff8e8', iris: '#ffe04a', mouth: '#2a1408' },
};
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixH = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
/** Palette of the 'ancient' morph for this species (named fish-art materials). */
export function ancientColors(def) {
  const a = archetypeOf(def.id);
  const base = { ...PALS[a] };
  const own = def.colors || {};
  // a little of the species' own side colour bleeds back into the body (cousins, not clones)
  if (own.side && /^#[0-9a-f]{6}$/i.test(own.side)) { base.side = mixH(base.side, own.side, 0.18); base.back = mixH(base.back, own.back || own.side, 0.12); }
  return { colors: base, outK: a === 'fossil' ? 0.5 : 0.42 };
}
