// [v26 menu] Three save slots ("moving boxes" on the title screen).
//
// Slot 1 keeps the pre-slots key, so an old single save simply IS slot 1 (no copy,
// nothing to lose). Each slot also has a tiny meta record written with every save
// (day, coins, completion %, what goes in its box) so the title can show the boxes
// without parsing the big save; a save without meta (made before v26) gets one
// computed from its JSON the first time the boxes are shown.
//
//   slotKey(n)            localStorage key of slot n (1..3)
//   lastSlot() / setLastSlot(n)   the slot CONTINUE opens
//   hasSlot(n), deleteSlot(n), slotMeta(n), writeSlotMeta(n, meta)
//   metaOf(game, totals)  -> meta for the running game (Game.save calls it)
//   slotInfo(n)           -> Promise<{ n, empty, meta }> (computes missing meta)
//   boxItems(meta)        -> ids of the stuff in that slot's box, in packing order
//
// Nothing here imports game code: the title menu loads it before the game.
export const SLOTS = 3;
const KEYS = ['tbme.save.v3', 'tbme.save.v3.s2', 'tbme.save.v3.s3'];
const META = (n) => `tbme.slotmeta.${n}`;
const LAST = 'tbme.slot';
const META_V = 2;

function get(k) { try { return localStorage.getItem(k); } catch { return null; } }
function set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

export function clampSlot(n) { n = Math.round(+n || 1); return n >= 1 && n <= SLOTS ? n : 1; }
export function slotKey(n) { return KEYS[clampSlot(n) - 1]; }
export function hasSlot(n) { return !!get(slotKey(n)); }
export function lastSlot() {
  const n = +get(LAST);
  if (n >= 1 && n <= SLOTS && hasSlot(n)) return n;
  // the most recently saved slot
  let best = 0, bt = -1;
  for (let i = 1; i <= SLOTS; i++) {
    if (!hasSlot(i)) continue;
    const t = slotMeta(i)?.at || 0;
    if (t > bt) { bt = t; best = i; }
  }
  return best || 1;
}
export function setLastSlot(n) { set(LAST, String(clampSlot(n))); }
export function deleteSlot(n) { del(slotKey(n)); del(META(clampSlot(n))); }
export function slotMeta(n) {
  try { const m = JSON.parse(get(META(clampSlot(n))) || 'null'); return m && m.v === META_V ? m : null; } catch { return null; }
}
export function writeSlotMeta(n, meta) { if (meta) set(META(clampSlot(n)), JSON.stringify(meta)); }
export function anySave() { for (let i = 1; i <= SLOTS; i++) if (hasSlot(i)) return true; return false; }

const STARTERS = new Set(['seaweed', 'cattail']);
const has = (arr, re) => (arr || []).some((id) => re.test(id));

// completion: research 45%, neighbours met 25%, facilities built 15%, days run 15%
function computeMeta(st, stats, builtTypes, totals) {
  const research = (st.research || []).length, zones = (st.zones || []).length;
  const types = builtTypes.filter((t) => !STARTERS.has(t)).length;
  const r = Math.min(1, research / Math.max(1, totals.research || 120));
  const z = Math.min(1, zones / Math.max(1, totals.zones || 10));
  const f = Math.min(1, types / 30);
  const d = Math.min(1, Math.max(0, (st.day || 1) - 1) / 40);
  const pct = Math.min(100, Math.round(100 * (0.45 * r + 0.25 * z + 0.15 * f + 0.15 * d)));
  const R = st.research || [];
  return {
    v: META_V, at: Date.now(), day: st.day || 1, coins: Math.floor(st.coins || 0), earned: Math.floor(st.totalEarned || 0), pct,
    research, zones, types, rating: +(st.rating || 0).toFixed(1),
    served: stats?.bearsServed || 0, hatched: (stats?.eggsHatched || 0) + (stats?.hatched || 0),
    beavers: R.includes('r_beavers') || builtTypes.includes('lodge') || (st.beaverLevel || 1) > 1 || !!(st.staff?.list?.length),
    mining: has(R, /mine|ore|pick|quarry|drill/) || builtTypes.some((t) => /mine|drill|ore/.test(t)),
    industry: has(R, /gear|fab|forge|smelt|belt|power|industr/) || builtTypes.some((t) => /forge|smelt|belt|gear|fab/.test(t)),
    crops: Object.keys(st.harvested || {}).length > 0 || builtTypes.some((t) => /carrot|berr|potato|corn|pea/.test(t)),
    species: (st.discovered || []).length, achievements: (st.achievements || []).length,
  };
}

/** Meta for the running game (Game.save). totals: { research, zones } */
export function metaOf(game, totals) {
  const types = new Set();
  for (const s of game.structures?.list || []) if (s.built && !s.removed) types.add(s.type);
  return computeMeta(game.state, game.stats, [...types], totals);
}

let totalsP = null;
function totals() {
  totalsP ||= Promise.all([import('../data/research.js'), import('../data/zones.js')])
    .then(([r, z]) => ({ research: r.RESEARCH.length, zones: z.ZONES.length }))
    .catch(() => ({ research: 120, zones: 10 }));
  return totalsP;
}

/** { n, empty, meta } for slot n; builds and caches the meta of an old save */
export async function slotInfo(n) {
  n = clampSlot(n);
  const raw = get(slotKey(n));
  if (!raw) return { n, empty: true, meta: null };
  let meta = slotMeta(n);
  if (meta) return { n, empty: false, meta };
  try {
    const data = JSON.parse(raw);
    const types = [...new Set((data.structures || []).filter((r) => Array.isArray(r) && r[3]).map((r) => r[0]))];
    meta = computeMeta(data.state || {}, data.stats || {}, types, await totals());
    meta.at = 0; // unknown: older than anything saved since
    writeSlotMeta(n, meta);
  } catch {
    meta = { v: META_V, at: 0, day: 1, coins: 0, earned: 0, pct: 0, broken: true };
  }
  return { n, empty: false, meta };
}

/** What goes in the box, in packing order: more stuff the further along the save is. */
export function boxItems(m) {
  if (!m) return [];
  const out = ['fish'];
  out.push(m.coins >= 3000 ? 'coins3' : m.coins >= 600 ? 'coins2' : 'coins1');
  if (m.served > 0 || m.day >= 2) out.push('tie');
  if (m.research > 0) out.push('flask');
  if (m.beavers) out.push('beaverhat');
  if (m.zones > 0) out.push('map');
  if (m.hatched > 0) out.push('egg');
  if (m.crops) out.push('carrot');
  if (m.mining) out.push('pickaxe');
  if (m.industry) out.push('gear');
  if (m.species >= 6 || m.earned >= 5000) out.push('goldfish');
  if (m.zones >= 3 || m.achievements >= 6) out.push('trophy');
  if (m.pct >= 60) out.push('crown');
  return out;
}
