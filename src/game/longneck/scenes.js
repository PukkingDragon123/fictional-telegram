// [v26 turtle] Old Longneck's stage moments: the arrival when Mistfall Hollow
// opens (a glide through the mist to the falls; he slowly... slowly... turns
// his head; his first line takes forever; Reynard reacts) and the finale when
// the last word of the Long Talk lands (the reward: The Old Ways).
import { LN, OLD_WAYS } from '../../data/longneck.js';
import { slowSay } from './ui.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const hasAnim = (r, n) => { const A = r?.anims; return !!A && (Array.isArray(A) ? A.includes(n) : !!A[n]); };

// where to aim so he (tall, on the sand) sits a little above the screen centre
function focusOn(game, v, lift = 1.2) {
  const rig = game.rig;
  const yaw = rig.yawGoal ?? rig.yaw ?? 0;
  const off = -(v.y + lift - (rig.goal?.y || 0)) / Math.tan(rig.pitch || 0.77) + 0.55;
  return { x: v.x + Math.sin(yaw) * off, z: v.z + Math.cos(yaw) * off };
}
export function headAnchor(v) {
  return { getWorldPos: (p) => { if (v.rig?.headFx) { v.rig.headFx.getWorldPosition(p); p.y += 0.42; } else p.set(v.x, v.y + 2.1, v.z); return p; } };
}

/** Plays a held cutscene around `body(ctx)`; ctx = { skipped(), fox(text, mood), npc(text, o), caption(t, s) }. */
async function staged(sys, v, shots, body) {
  const game = sys.game, cs = game.cutscene, scenes = game.npcScenes;
  if (!cs || cs.active) return false;
  if (scenes) scenes.busy = true;
  sys.sceneBusy = true;
  const oldT = v.t;
  v.t = 1e9;
  const shot = cs.play({ shots: [...shots, { at: shots[shots.length - 1].at, dur: 900 }], skippable: true });
  const skipped = () => cs.skipped || !cs.active;
  let portrait = null;
  const open = [];
  const ctx = {
    skipped,
    glide: shots.reduce((a, sh) => a + (sh.dur ?? 2), 0) * 0.65, // the camera lands (Cutscene runs shots at 65%)
    fox: async (text, mood = 'happy', hold = 1.4) => {
      if (skipped()) return;
      portrait ||= scenes?.portrait?.() || null;
      portrait?.setExpression?.(mood);
      const h = game.say(portrait?.anchor || headAnchor(v), text, { voice: 'fox', mood: 'happy', size: 'm', key: 'npcfox', dur: 1e9 });
      portrait?.talk?.(text);
      open.push(h);
      await waitOr(2 + text.length * 0.05 + hold, skipped);
      h?.close?.();
    },
    npc: async (text, { cps = 3, hold = 1.2, anim = null } = {}) => {
      if (skipped()) return;
      if (anim && hasAnim(v.rig, anim)) v.rig.play(anim, { loop: false, restart: true, onDone: () => v.rig.play('talk', { loop: true }) });
      const s = slowSay(game, headAnchor(v), text, { cps, hold, key: 'npclongneck' });
      if (s.h) open.push(s.h);
      game.audio?.play?.('ln_word', { volume: 0.35 });
      await waitOr(s.secs, skipped);
      s.h?.close?.();
    },
    caption: (t, s) => { if (!skipped()) cs.caption(t, s); },
  };
  try {
    await body(ctx);
  } finally {
    for (const h of open) h?.close?.();
    if (!cs.skipped) cs.skipped = true; // release the held shot
    try { await shot; } catch { /* ignore */ }
    portrait?.dispose?.();
    v.t = oldT;
    sys.sceneBusy = false;
    if (scenes) scenes.busy = false;
  }
  return true;
}
// pixel mist the camera glides through: two dithered cloud layers drifting apart and fading out
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function mistLayer(seed, W = 280, H = 175) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const img = x.createImageData(W, H);
  let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const blobs = Array.from({ length: 30 }, () => [rnd() * W, rnd() * H, 18 + rnd() * 44]);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let d = 0;
    for (const [bx, by, br] of blobs) { const q = 1 - Math.hypot(i - bx, (j - by) * 1.6) / br; if (q > d) d = q; }
    if (d * 26 > BAYER[(j % 4) * 4 + (i % 4)] + 1) { const k = (j * W + i) * 4; const hi = d > 0.55; img.data[k] = hi ? 248 : 222; img.data[k + 1] = hi ? 250 : 232; img.data[k + 2] = hi ? 246 : 236; img.data[k + 3] = 255; }
  }
  x.putImageData(img, 0, 0);
  c.style.cssText = 'position:absolute;inset:-10%;width:120%;height:120%;image-rendering:pixelated;transition:transform 5.5s ease-in, opacity 5.5s ease-in;';
  return c;
}
export function mist() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:6;pointer-events:none;overflow:hidden;';
  const a = mistLayer(3), b = mistLayer(11);
  a.style.opacity = '0.9'; b.style.opacity = '0.7';
  el.append(a, b);
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    a.style.transform = 'translateX(-38%) scale(1.3)'; a.style.opacity = '0';
    b.style.transform = 'translateX(34%) scale(1.5)'; b.style.opacity = '0';
  }));
  return { remove: () => el.remove() };
}
async function waitOr(secs, stop) {
  const t0 = performance.now();
  while (performance.now() - t0 < secs * 1000 && !stop()) await wait(0.08);
}

// ------------------------------------------------------------------ arrival
export async function arrival(sys, v) {
  const game = sys.game;
  const r = v.rig;
  if (!r) return false;
  // he is looking away at the falls when we arrive
  if (hasAnim(r, 'turn_head')) r.play('turn_head', { loop: false, restart: true, fade: 0, speed: 0 });
  // the camera glides in through the mist
  let fog = null;
  try { fog = mist(); } catch { fog = null; }
  setTimeout(() => fog?.remove(), 7000);
  const focus = focusOn(game, v);
  game.audio?.play?.('ln_roar', { volume: 0.5 });
  const ok = await staged(sys, v, [
    { at: { x: 34, z: 213 }, wupp: 0.042, dur: 2.6, caption: 'Mistfall Hollow', sub: 'Where the mist never lifts', sfx: 'whoosh' },
    { at: { x: 35.2, z: 201 }, wupp: 0.028, dur: 3.2 },
    { at: focus, wupp: 0.016, dur: 2.6, call: () => game.audio?.play?.('ln_chime', { volume: 0.45 }) },
  ], async (c) => {
    await waitOr(c.glide - 0.4, c.skipped);
    if (c.skipped()) return;
    // slowly... slowly... he turns his head
    if (r.current === 'turn_head' && r._cur) r._cur.speed = 1;
    c.caption(null);
    await c.npc(LN.arrive.first, { cps: 1, hold: 1.6 });
    await c.npc(LN.arrive.hello, { cps: 1.4, hold: 1.0 });
    r.play('talk', { loop: true });
    const welcome = c.npc(LN.arrive.welcome, { cps: 4.6, hold: 0.8 });
    await wait(3.4);
    await c.fox(LN.arrive.fox1, 'confused', 0.4);
    await welcome;
    await c.fox(LN.arrive.fox2, 'sleepy', 0.8);
    await c.npc(LN.arrive.last, { cps: 6, hold: 0.8, anim: 'nod' });
    await c.fox(LN.arrive.fox3, 'happy', 0.4);
    c.caption(LN.arrive.caption, LN.arrive.hint);
    game.audio?.play?.('ln_chime', { volume: 0.45 });
    await waitOr(3.4, c.skipped);
  });
  fog?.remove();
  if (r.current === 'turn_head' && r._cur && !r._cur.speed) r._cur.speed = 1;
  sys.idle(v);
  return ok;
}

// ------------------------------------------------------------------ finale
export async function finale(sys, v) {
  const game = sys.game;
  const r = v.rig;
  const focus = focusOn(game, v);
  let given = false;
  const give = () => { if (!given) { given = true; sys.reward(v); } };
  const ok = await staged(sys, v, [
    { at: focus, wupp: 0.017, dur: 2.2, caption: 'Old Longneck', sub: 'has finished talking', sfx: 'whoosh' },
  ], async (c) => {
    await waitOr(c.glide, c.skipped);
    await c.npc('...Be... ... brief.', { cps: 6, hold: 1.2 });
    await c.fox(LN.finale.fox1, 'shocked', 0.4);
    await c.npc(LN.finale.npc1, { cps: 2, hold: 1.0, anim: 'nod' });
    await c.npc(LN.finale.npc2, { cps: 7, hold: 0.6, anim: 'point' });
    if (c.skipped()) return;
    give();
    r?.play?.('happy', { loop: false, restart: true, onDone: () => sys.idle(v) });
    c.caption(LN.finale.caption, sys.rewardText());
    await waitOr(4.2, c.skipped);
    await c.fox(LN.finale.fox2, 'love', 1.2);
  });
  give(); // skipped or no cutscene: still paid
  sys.idle(v);
  return ok;
}

export { OLD_WAYS };
