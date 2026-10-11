// [v26 class2] Pop quizzes on Professor Reynard's chalkboard (src/game/Classroom.js).
//
// A class step with `quiz` turns chalk doodles into things the player taps or drags:
//   { say: 'Which fish is ready for love? **Tap it!**', draw: [...items with ids...],
//     quiz: {
//       opts: ['a', 'b', 'c'],      // board item ids the player can pick (their hit box also
//                                   // covers an item with id `<id>_l`, e.g. its chalk label)
//       ok: 'b' | ['b', 'c'],       // the right one(s); with all: true every one must be tapped
//       all: false,
//       drop: 'plate',              // optional: drag the pick onto this board item (a tap works too)
//       timer: 7,                   // optional: seconds before time runs out (a mini-game)
//       no: 'joke' | { a: 'joke for a' },   // Reynard's line on a wrong pick
//       yes: 'line after the right answer', show: [items drawn after the answer],
//     } }
// Keys 1-9 pick an option. Skip / Escape ends the class as usual.
import * as THREE from 'three';

const V = new THREE.Vector3();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const WRONG_ANIMS = ['facepalm', 'laugh_evil', 'shrug'];
const RIGHT_ANIMS = ['cheer', 'count_coins', 'dance'];
const TIMEOUT = ['Too slow. At the feast, that one picks itself.'];
const HINT = ['Well? **Tap** your answer.', 'I am not getting any younger. **Tap one.**'];

/** Screen rect (CSS px) of a chalkboard item (+ its `_l` label). */
function rectOf(cls, id, pad = 3) {
  const b = cls.board;
  const it = b.item(id);
  if (!it) return null;
  let x0 = it.x0, y0 = it.y0, x1 = it.x1, y1 = it.y1;
  const lb = b.item(id + '_l');
  if (lb) { x0 = Math.min(x0, lb.x0); y0 = Math.min(y0, lb.y0); x1 = Math.max(x1, lb.x1); y1 = Math.max(y1, lb.y1); }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const r = cls.game.renderer;
  let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
  for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    cls.room.board.pxToWorld(px, py, V);
    const s = cls.rig.worldToScreen(V, r);
    L = Math.min(L, s.x); R = Math.max(R, s.x); T = Math.min(T, s.y); B = Math.max(B, s.y);
  }
  // fingers are fat: at least 44 css px
  const w = Math.max(44, R - L), h = Math.max(44, B - T), cx = (L + R) / 2, cy = (T + B) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, rw: R - L, rh: B - T, it };
}

/** Run one quiz. Resolves { right (first try), coins } — or { skipped } when the class is skipped. */
export function runQuiz(cls, q, drawn = []) {
  const game = cls.game, board = cls.board;
  const opts = [].concat(q.opts || []);
  const ok = new Set([].concat(q.ok));
  const all = !!q.all;
  const need = new Set(all ? ok : []);
  const score = (cls._score ||= { right: 0, total: 0 });
  score.total++;
  let firstTry = true, wrongs = 0, closed = false, res;
  const result = new Promise((r) => { res = r; });

  // ---- the overlay: one chalk ring per option (+ the drop target)
  const layer = document.createElement('div');
  layer.className = 'cls-quiz' + (q.drop ? ' drag' : '');
  const zones = new Map();
  opts.forEach((id, i) => {
    const z = document.createElement('button');
    z.type = 'button';
    z.className = 'cls-opt';
    z.dataset.id = id;
    z.innerHTML = `<span class="cls-opt-n">${i + 1}</span>`;
    z.style.animationDelay = `${i * 0.07}s`;
    layer.appendChild(z);
    zones.set(id, z);
  });
  let dropEl = null;
  if (q.drop) {
    dropEl = document.createElement('div');
    dropEl.className = 'cls-drop';
    dropEl.innerHTML = '<span>DROP HERE</span>';
    layer.appendChild(dropEl);
  }
  let timerEl = null;
  if (q.timer) {
    timerEl = document.createElement('div');
    timerEl.className = 'cls-timer';
    timerEl.innerHTML = '<i></i>';
    layer.appendChild(timerEl);
  }
  cls.ui?.appendChild(layer);

  const place = () => {
    for (const [id, z] of zones) {
      const r = rectOf(cls, id);
      if (!r) { z.style.display = 'none'; continue; }
      z.style.display = '';
      if (z.classList.contains('drag')) continue;
      z.style.left = `${r.x}px`; z.style.top = `${r.y}px`; z.style.width = `${r.w}px`; z.style.height = `${r.h}px`;
    }
    if (dropEl) {
      const r = rectOf(cls, q.drop, 5);
      if (r) Object.assign(dropEl.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    }
  };
  place();

  // Reynard points at the board while the class thinks
  const f = cls.fox;
  const aimAt = (id) => {
    if (!f) return;
    const p = cls.room.board.itemWorld(id);
    if (p) { cls.aimV.copy(p); f.setAim?.(cls.aimV); }
  };
  if (f) { f.holdProp?.('pointer'); f.play(cls._anim('teach_point', 'idle'), { loop: true, fade: 0.25 }); }

  let hinted = false;
  const r0 = performance.now();
  const quiz = {
    tick() {
      if (closed) return;
      place();
      if (q.timer && timerEl) {
        const k = Math.max(0, 1 - (performance.now() - r0) / 1000 / q.timer);
        timerEl.firstChild.style.width = `${k * 100}%`;
        timerEl.classList.toggle('low', k < 0.3);
        if (k <= 0) finish(false, true);
      } else if (!hinted && (performance.now() - r0) > 12000) {
        // a nudge: he taps the options one by one
        hinted = true;
        cls._say(pick(HINT), 'smug');
        opts.forEach((id, i) => setTimeout(() => { if (!closed) { board.highlight(id, { mode: 'pulse', color: 'yellow' }); cls._sfx('class_tap', { volume: 0.4 }); } }, i * 350));
        f?.play(cls._anim('teach_tap', 'point'), { loop: false, onDone: () => { if (!closed) f.play(cls._anim('teach_point', 'idle'), { loop: true, fade: 0.2 }); } });
      }
    },
    key(n) { const id = opts[n - 1]; if (id) choose(id); },
    abort() { if (closed) return; closed = true; layer.remove(); cls._quiz = null; res({ skipped: true }); },
  };
  cls._quiz = quiz;

  function mark(id, good) {
    const it = board.item(id);
    if (!it) return;
    if (good) board.draw({ circle: id, color: 'green', pad: 2 }, { speed: 3 });
    else board.draw({ cross: [it.cx, it.cy, Math.min(7, Math.max(4, (it.x1 - it.x0) / 3))], color: 'red' }, { speed: 3 });
  }

  function react(good) {
    if (!f) return;
    const a = cls._anim(pick(good ? RIGHT_ANIMS : WRONG_ANIMS), good ? 'cheer' : 'shrug');
    f.play(a, { loop: false, fade: 0.15, onDone: () => { if (!closed) f.play(cls._anim('teach_point', 'idle'), { loop: true, fade: 0.2 }); else cls._idle(); } });
  }

  function choose(id) {
    if (closed || !zones.has(id)) return;
    const z = zones.get(id);
    if (z.classList.contains('used')) return;
    game.audio?.unlock?.();
    aimAt(id);
    if (ok.has(id)) {
      z.classList.add('used', 'good');
      if (all) {
        need.delete(id);
        mark(id, true);
        cls._sfx('class_right', { volume: 0.45, pitch: 1 + (ok.size - need.size) * 0.12 });
        cls.room.students.react('heart', { stagger: 0.05 });
        if (need.size) return;
      }
      finish(true);
    } else {
      firstTry = false;
      wrongs++;
      z.classList.add('used', 'bad');
      mark(id, false);
      cls._sfx('class_wrong', { volume: 0.5 });
      cls._react({ kind: 'laugh' });
      react(false);
      const joke = typeof q.no === 'object' && q.no ? (q.no[id] || q.no._) : q.no;
      cls._say(joke || 'No. Look again.', pick(['smug', 'laugh', 'shocked']));
      if (!all && wrongs >= 2) setTimeout(() => finish(false), 900);
    }
  }

  async function finish(right, timeout = false) {
    if (closed) return;
    closed = true;
    cls._quiz = null;
    for (const z of zones.values()) z.classList.add('done');
    setTimeout(() => layer.remove(), 300);
    // reveal the answer(s) on the board
    for (const id of ok) if (!all || !zones.get(id)?.classList.contains('good')) mark(id, true); // all-mode picks are circled as they're tapped
    if (right && firstTry) score.right++;
    if (right) {
      cls._sfx('class_right', { volume: 0.55 });
      setTimeout(() => cls._sfx('class_star', { volume: 0.4 }), 180);
      cls._react('cheer');
      react(true);
      cls.fox?.setExpression?.(firstTry ? 'proud' : 'happy', { hold: 2 });
    } else {
      cls._react(timeout ? 'gasp' : 'sweat');
      cls.fox?.setExpression?.('smug', { hold: 2 });
    }
    if (q.drop && right) {
      // the pick lands on the target: a chalk copy, drawn in a flash
      const src = drawn.find((d) => d && d.id === [...ok][0]);
      const tgt = board.item(q.drop);
      if (src && tgt && src.doodle) board.draw({ ...src, id: undefined, x: tgt.cx, y: tgt.y0 - 6, scale: 1 }, { speed: 3 });
    }
    if (q.show) board.draw(q.show, { speed: 2.2 });
    const lead = right ? '' : timeout ? pick(TIMEOUT) + ' ' : 'It was this one. ';
    const line = cls._say(lead + (q.yes || 'Correct!'), right ? (firstTry ? 'excited' : 'happy') : 'smug');
    await line.typed;
    res({ right: right && firstTry });
  }

  // ---- input: tap, or drag onto the drop target
  for (const [id, z] of zones) {
    z.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (closed || z.classList.contains('used')) return;
      if (!q.drop) { choose(id); return; }
      const r = rectOf(cls, id);
      const sx = e.clientX, sy = e.clientY;
      let moved = false, ghost = null;
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 8) return;
        if (!moved) {
          moved = true;
          ghost = ghostOf(cls, id, r);
          if (ghost) layer.appendChild(ghost);
          z.classList.add('lift');
          cls._sfx('class_pop', { volume: 0.3, pitch: 1.4 });
        }
        if (ghost) { ghost.style.left = `${ghost._ox + dx}px`; ghost.style.top = `${ghost._oy + dy}px`; }
        dropEl?.classList.toggle('over', overDrop(ev.clientX, ev.clientY));
      };
      const up = (ev) => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        z.classList.remove('lift');
        dropEl?.classList.remove('over');
        const hit = !moved || overDrop(ev.clientX, ev.clientY);
        if (ghost) {
          if (hit && ok.has(id)) ghost.remove();
          else { ghost.classList.add('back'); Object.assign(ghost.style, { left: `${ghost._ox}px`, top: `${ghost._oy}px` }); setTimeout(() => ghost.remove(), 260); }
        }
        if (hit) choose(id);
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
  }
  function overDrop(x, y) {
    if (!dropEl) return false;
    const b = dropEl.getBoundingClientRect();
    return x >= b.left - 16 && x <= b.right + 16 && y >= b.top - 16 && y <= b.bottom + 16;
  }
  return result;
}

// a chalk cut-out of the board item that follows the finger
function ghostOf(cls, id, r) {
  const it = cls.board.item(id), src = cls.board.canvas;
  if (!it || !src || !r) return null;
  const x0 = Math.max(0, Math.floor(it.x0 - 2)), y0 = Math.max(0, Math.floor(it.y0 - 2));
  const w = Math.min(src.width - x0, Math.ceil(it.x1 - it.x0 + 4)), h = Math.min(src.height - y0, Math.ceil(it.y1 - it.y0 + 4));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, x0, y0, w, h, 0, 0, w, h);
  c.className = 'cls-ghost';
  const k = Math.min(r.rw / (it.x1 - it.x0 + 6), r.rh / (it.y1 - it.y0 + 6)) || 3;
  c._w = w * k; c._h = h * k; c._ox = r.cx - c._w / 2; c._oy = r.cy - c._h / 2;
  Object.assign(c.style, { left: `${c._ox}px`, top: `${c._oy}px`, width: `${c._w}px`, height: `${c._h}px` });
  return c;
}
