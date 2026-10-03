// Quest notebook preview (src/ui/QuestLog.js).
//   (default)            live; buttons bottom-right
//   ?manual=1            no rAF: window.__step(seconds, dt) advances the notebook, window.__seek(t) replays
//                        the reveal from the start up to t (for screenshots of single frames)
//   ?shot=1              hides the buttons
//   ?empty=1             start with no quests
import { createQuestLog } from '../src/ui/QuestLog.js';
import { spriteImg, hasSprite } from '../src/ui/sprites.js';
import audio from '../src/audio/audio.js';

const P = new URLSearchParams(location.search);
const manual = P.has('manual');
if (P.has('shot')) document.body.classList.add('shot');

const ql = createQuestLog(document.getElementById('ui'), {
  icon: (n, s) => (hasSprite(n) ? spriteImg(n, s) : ''),
  sfx: (n, o) => { try { audio.play(n, { volume: 0.4, ...(o || {}) }); } catch { /* no audio yet */ } },
  onClick: (id) => console.log('quest clicked', id),
  autoUpdate: !manual,
});
window.ql = ql;

// fake game state, shaped like Quests.view()
const Q = {
  lab: { id: 'lab', title: 'Science time!', icon: 'flask', reward: '60 coins', steps: [{ text: "Open Reynard's Lab", done: true }, { text: 'Research something new', done: false }] },
  friend: { id: 'friend', title: 'Meet the neighbours', icon: 'heart', reward: '50 coins', steps: [{ text: 'Clear the forest up to a fog bank', done: false }] },
  match: { id: 'match', title: 'Play Cupid', icon: 'heart', reward: '80 coins + Clover', steps: [{ text: 'Open the Matchmaker', done: true }, { text: 'Arrange a date', done: false }, { text: 'Let the couple lay eggs', done: false }] },
  tag: { id: 'tag', title: 'Save the rare fish!', icon: 'tag', reward: '40 coins', steps: [{ text: 'Pick the Tag tool', done: false }, { text: 'Tag a rare fish', done: false }] },
};
let active = P.has('empty') ? [] : ['lab', 'friend'];
let done = P.has('empty') ? [] : [{ id: 'tag', title: 'Save the rare fish!' }];
const view = () => active.map((id) => { const q = Q[id]; return { ...q, progress: [q.steps.filter((s) => s.done).length, q.steps.length] }; });
const sync = () => { ql.set(view()); ql.setDone(done); };
sync();

const B = {
  Open: () => ql.open(),
  Close: () => ql.close(),
  'Tick step': () => {
    for (const id of active) { const s = Q[id].steps.find((x) => !x.done); if (s) { s.done = true; break; } }
    sync();
  },
  'New quest': () => { const id = Object.keys(Q).find((k) => !active.includes(k) && !done.some((d) => d.id === k)); if (id) { active.push(id); sync(); } },
  Complete: () => {
    const id = active[0];
    if (!id) return;
    Q[id].steps.forEach((s) => { s.done = true; });
    sync();
    ql.complete(id);
    done = [...done, { id, title: Q[id].title }];
    ql.setDone(done);
    setTimeout(() => { active = active.filter((x) => x !== id); sync(); }, 1800);
  },
  Hide: () => ql.setVisible(false),
  Show: () => ql.setVisible(true),
  Collapse: () => ql.collapse(),
};
const ctl = document.getElementById('ctl');
for (const [k, fn] of Object.entries(B)) { const b = document.createElement('button'); b.textContent = k; b.onclick = fn; ctl.appendChild(b); }

// manual stepping for screenshots
window.__step = (sec, dt = 1 / 30) => { for (let t = 0; t < sec - 1e-6; t += dt) ql.update(Math.min(dt, sec - t)); };
window.__seek = async (t) => {
  if (ql.isOpen) { ql.close(); window.__step(1.2); }
  ql.open();
  window.__step(t);
};
window.__tick = B['Tick step'];
window.__complete = B.Complete;
window.__newQuest = B['New quest'];

// fox pose lab: window.__fox({ anim, speed, face, push, lean, lounge, P: {...}, t, x, y, expr })
window.__fox = (o = {}) => {
  const F = ql._fox;
  if (!F?.ok) return 'no fox';
  F.show(true);
  Object.assign(F.P, o.P || {});
  F.rig.root.rotation.y = o.face ?? 1.15;
  F.pose = null;
  F.play(o.anim || 'walk', { speed: o.speed ?? 1, fade: 0, restart: true });
  F.push = o.push ?? 0; F.lean = o.lean ?? 0; F.lounge = o.lounge ?? 0;
  if (o.expr !== undefined) F.rig.setExpression(o.expr);
  F.place(o.x ?? 300, o.y ?? 600);
  const n = Math.round((o.t ?? 0.5) * 30);
  for (let i = 0; i < n; i++) F.update(1 / 30);
  return F.pawReach();
};
