// BigClock: the one and only time UI. [v33 watch] Reynard's gold pocket watch, hanging from its
// chain in the top-right corner. A cute, chunky, detailed pixel-art object (src/ui/watch/watchArt.js),
// drawn at art resolution into a canvas shown at 2 CSS px per art pixel (snapped to whole device px).
//
//   const clock = new BigClock(container, { onSpeed, sfx, icon, game });
//   clock.update(dt, { hour, phase, day, weekday, speed, paused,
//                      sections: [{ from, to, kind: 'work'|'lunch'|'rush'|'night'|'off' }] });
//   clock.setVisible(on); clock.destroy();
//
// What it shows, at a glance:
//   - a 24-hour "day dial" (noon at the top, midnight at the bottom): the blued hour hand turns once
//     a day, the minute hand once an hour, a thin red seconds hand ticks (faster at 2x / 3x, stopped
//     when paused); the sun's glint on the glass follows the hour
//   - the day's schedule as candy enamel inlays round the dial (work, lunch, the 5 PM feast with a
//     bear-head pip, night)
//   - the countdown plaque under the hub: "2H15", "45M", then "EAT!" (the feast), "ZZZ" (night),
//     "OFF" (a day off / no feast)
//   - the weather window above the hub: a little painted disc (sky by time of day, today's weather,
//     the season's hills) that turns to the next scene when the day / weather changes
//   - the inside of the open lid: a tear-off calendar card (weekday, date, tomorrow's weather)
//   - the speed tag hanging under the case: 1-3 red chevrons, two blue bars when paused
//   - a ruby blood-moon pip on the case band with one dot per day to go
// Interaction (pointer):
//   - hover: the watch swings on its chain, the bell charm and the speed tag dangle, it ticks in
//     your ear, and a paper tag drops down with the exact time, countdown, weather and speed
//     (phones: a long press drops the tag)
//   - press the crown (or tap the dial / the speed tag): speed 1x -> 2x -> 3x -> 1x, onSpeed(n);
//     the crown squashes in with a click ("Tap the clock to speed time up" still works)
//   - click the lid: it snaps shut (a half-hunter: the time still shows through its window) or
//     springs open; remembered per player (localStorage)
//   - the bell charm / the chain: a little jingle
// Moods: calm -> (feast < 2h) pulse: the plaque bear hops, the watch gives a little hop each beat
//   -> (< 1h) wobble: it swings on its own, the countdown turns red -> (< 15 min until just after
//   the start) RING: the alarm goes off, the case shakes, the bell charm rings, the lid flies open.
//   paused: z's drift off the crown, the seconds hand stops.
//   weekday 0 / 'sun' / phase 'off': the inlays turn sky blue (day off).
// Root element keeps the .bclock class (other CSS hides it in some modes).
import './bigclock.css';
import { crispPx } from './uiScale.js';
import {
  P, Buf, SPR, geometry, buildCase, buildDial, buildLidOut, buildLidIn, drawHinge, drawAperture, drawPlaque, drawHand, drawRing,
  line, drawBow, drawCrown, drawPendant, drawChainUp, drawSwag, drawBell, drawTag, lighten, darken, tint, hourAngle, secAt, hex, hsh,
} from './watch/watchArt.js';
import { buildTagBuf, paintBuf, TAGC } from './watch/watchTag.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mod24 = (h) => ((h % 24) + 24) % 24;
const LS_LID = 'tbme.watch.lid';
const RING_DUR = 4.2;
let RM = null;
const reduced = () => { try { RM = RM || matchMedia('(prefers-reduced-motion: reduce)'); return RM.matches; } catch { return false; } };
const NIGHT_GLINT = hex('#b8c8ff');
const WXNAME = { clear: 'Clear', heat: 'Heatwave', rain: 'Rain', storm: 'Storm', snow: 'Snow', fog: 'Fog', wind: 'Windy' };

export class BigClock {
  constructor(container, { onSpeed, sfx, icon, game } = {}) {
    this.onSpeed = onSpeed || (() => {});
    this.sfx = sfx || (() => {});
    this.icon = icon;
    this.game = game || null;
    this.t = 0;
    this.speed = 1;
    this.st = { hour: 9, sections: [], speed: 1, paused: false };
    this.mode = 'calm';
    this.extra = {};
    // the physical bits: the watch swinging on its chain, the bell charm, the speed tag, the crown, the lid
    this.sw = { a: 0, v: 0 };
    this.fob = { a: 0, v: 0 };
    this.tg = { a: 0, v: 0 };
    this.crown = { x: 0, v: 0, held: false };
    this.lid = { a: 0, v: 0 };
    let open = true;
    try { open = localStorage.getItem(LS_LID) !== 'shut'; } catch { /* private mode */ }
    this.lidOpen = open;
    this.sparks = [];
    this.secT = 0;
    this.secIdx = 0;
    this._ringT = 99;
    this._bellT = 0;
    this._lastMode = '';
    this._glintT = 3;
    this._extraT = 0;
    this._hopT = 0;
    this._beatT = 0;
    this._wobT = 0;
    this._tagGlow = 0;
    this._showTagT = 0;
    this._slide = 0;
    this._acc = 1;
    this._jit = { x: 0, y: 0, a: 0 };
    this._press = null;
    this.hover = false;

    this.el = document.createElement('div');
    this.el.className = 'bclock bclock-watch';
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'bclock-btn';
    this.btn.setAttribute('aria-label', 'Pocket watch: game speed');
    this.cv = document.createElement('canvas');
    this.cv.className = 'bclock-cv';
    this.btn.appendChild(this.cv);
    this.el.appendChild(this.btn);
    this.tagCv = document.createElement('canvas');
    this.tagCv.className = 'bclock-tag';
    this.tagCv.setAttribute('aria-hidden', 'true');
    this.el.appendChild(this.tagCv);
    container.appendChild(this.el);
    this.ctx = this.cv.getContext('2d');

    this._mq = typeof matchMedia === 'function' ? matchMedia('(max-width: 640px), (max-height: 520px)') : null;
    this._onMq = () => this._resize();
    this._mq?.addEventListener?.('change', this._onMq);
    this._onWin = () => { const k = crispPx(2); if (k !== this.k) this._resize(); };
    window.addEventListener('resize', this._onWin);

    this.cv.addEventListener('pointerenter', (e) => this._enter(e));
    this.cv.addEventListener('pointerleave', () => this._leave());
    this.cv.addEventListener('pointermove', (e) => this._move(e));
    this.cv.addEventListener('pointerdown', (e) => this._down(e));
    for (const ev of ['pointerup', 'pointercancel']) this.cv.addEventListener(ev, () => this._up());
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press shows the paper tag instead
    this.btn.addEventListener('click', (e) => this._click(e));
    this._resize();
  }

  // ------------------------------------------------------------------ size
  _resize() {
    const small = !!this._mq?.matches;
    const G = geometry(small ? 'S' : 'L');
    const first = !this.G;
    this.G = G;
    this.k = crispPx(2);
    this.cv.width = G.W;
    this.cv.height = G.H;
    this.cv.style.width = G.W * this.k + 'px';
    this.cv.style.height = G.H * this.k + 'px';
    this.body = new Buf(G.W, G.H);
    this.out = new Buf(G.W, G.H);
    this.hb = new Buf(G.W, G.H);
    this.img = new ImageData(new Uint8ClampedArray(this.out.d.buffer), G.W, G.H);
    this.caseBuf = buildCase(G);
    this.lidOutBuf = buildLidOut(G);
    this._dialKey = '';
    this._lidKey = '';
    this.phiOpen = Math.acos(-G.lidA / G.R);
    if (first) this.lid.a = this.lidOpen ? this.phiOpen : 0;
    else this.lid.a = this.lidOpen ? this.phiOpen : 0;
    this._tagKey = '';
    this._draw();
  }

  setVisible(on) { this.el.classList.toggle('bclock-hidden', !on); }

  destroy() {
    clearTimeout(this._lpT);
    this._mq?.removeEventListener?.('change', this._onMq);
    window.removeEventListener('resize', this._onWin);
    this.el.remove();
  }

  // ------------------------------------------------------------------ input
  _art(e) {
    const r = this.cv.getBoundingClientRect();
    return [((e.clientX - r.left) * this.G.W) / (r.width || 1), ((e.clientY - r.top) * this.G.H) / (r.height || 1)];
  }

  _region(ax, ay) {
    const G = this.G, { cx, cy, R } = G;
    if (Math.abs(ax - cx) <= G.bowRx + 1.5 && ay >= G.bowY - G.bowRy - 2 && ay <= G.pend.y1 + 1.5) return 'crown';
    if (Math.hypot(ax - cx, ay - cy) <= R + 1) return this.lidOpen ? 'dial' : 'lid';
    if (this.lidOpen) {
      const ex = (ax - (cx - R - G.lidA)) / (G.lidA + 2), ey = (ay - cy) / (R + 1);
      if (ex * ex + ey * ey <= 1) return 'lid';
    }
    if (Math.abs(ax - cx) <= G.tag.w / 2 + 2 && ay > cy + R && ay <= cy + R + G.tag.h + 5) return 'tag';
    if (this._bellX != null && Math.hypot(ax - this._bellX, ay - this._bellY - 4) < (G.size === 'L' ? 6 : 5)) return 'bell';
    if (Math.abs(ax - cx) <= 3 && ay < G.bowY - G.bowRy) return 'chain';
    return null;
  }

  _enter(e) {
    if (e.pointerType === 'touch') { this._touch = true; return; }
    this._touch = false;
    this.hover = true;
    const [ax] = this._art(e);
    // brushed: it swings away from where the pointer came in, the charms jingle
    this.sw.v += (ax < this.G.cx ? 1 : -1) * 0.16;
    this.fob.v += 1.2;
    this.sfx('hover', { volume: 0.25 });
    this.sfx('chip', { volume: 0.12, pitch: 1.5 });
    this.el.classList.add('bclock-hover');
  }

  _leave() {
    this.hover = false;
    this._up();
    this.el.classList.remove('bclock-hover');
    this.cv.classList.remove('bclock-hot');
  }

  _move(e) {
    const [ax, ay] = this._art(e);
    const r = this._region(ax, ay);
    this.cv.classList.toggle('bclock-hot', !!r);
    if (r !== this._hoverRegion) {
      this._hoverRegion = r;
      if (r === 'crown' && this.hover) this.crown.v -= 14; // the crown peeks up
    }
    if (e.pointerType !== 'touch' && this._lastPX != null) {
      const vx = ax - this._lastPX;
      this.sw.v += clamp(vx, -4, 4) * -0.006;
    }
    this._lastPX = ax;
  }

  _down(e) {
    if (e.pointerType === 'touch') this._touch = true;
    const [ax, ay] = this._art(e);
    const r = this._region(ax, ay);
    this._press = r;
    if (r === 'crown') { this.crown.held = true; this.sfx('set_tick', { volume: 0.35, pitch: 1.15 }); }
    // phones: a long press drops the paper tag (and doesn't change the speed)
    clearTimeout(this._lpT);
    if (e.pointerType === 'touch') {
      this._lpT = setTimeout(() => {
        this._longPress = true;
        this._showTagT = 3;
        this.crown.held = false;
        this._press = null;
        this.fob.v += 2;
        this.sfx('paper', { volume: 0.3 });
      }, 450);
    }
  }

  _up() {
    clearTimeout(this._lpT);
    if (this.crown.held) { this.crown.held = false; this.crown.v = -34; }
    this._press = null;
  }

  _click(e) {
    if (this._longPress) { this._longPress = false; return; }
    if (!e.detail) { this._speedUp('key'); return; } // keyboard / programmatic click: the old behaviour
    const [ax, ay] = this._art(e);
    const r = this._region(ax, ay);
    if (r === 'crown' || r === 'dial' || r === 'tag') this._speedUp(r);
    else if (r === 'lid') this._toggleLid();
    else if (r === 'bell' || r === 'chain') this._jingle();
  }

  _speedUp(from) {
    const n = ((this.st.speed || this.speed) % 3) + 1;
    this.speed = n;
    this.st.speed = n;
    this.st.paused = false;
    this.sfx('click', { pitch: 0.9 + n * 0.15 });
    this.sfx('set_tick', { volume: 0.3, pitch: 0.85 + n * 0.12 });
    if (from !== 'crown') { this.crown.x = 2; this.crown.v = -20; } // the crown clicks in anyway
    this.tg.v += n % 2 ? 5 : -5;
    this._tagGlow = 0.45;
    const G = this.G, L = G.size === 'L';
    const tx = G.cx - 5 + (n - 1) * 4 + 1, ty = G.cy + G.R + (L ? 3 : 2) + (L ? 1 : 1);
    this._spark(tx, ty, 2);
    this.onSpeed(n);
    this._acc = 1;
  }

  _toggleLid(force) {
    const open = force != null ? force : !this.lidOpen;
    if (open === this.lidOpen) return;
    this.lidOpen = open;
    try { localStorage.setItem(LS_LID, open ? 'open' : 'shut'); } catch { /* private mode */ }
    const G = this.G;
    if (open) {
      this.lid.v = Math.max(this.lid.v, 7);
      this.sfx('clink', { volume: 0.3, pitch: 1.25 });
      this.sfx('tick', { volume: 0.3, pitch: 1.3 });
      this._spark(G.cx - G.R - G.lidA, G.cy - G.R + 6, 1);
      this.sw.v -= 0.08;
    } else {
      this.lid.v = Math.min(this.lid.v, -2);
      this.sfx('whoosh', { volume: 0.12, pitch: 1.8 });
    }
    this._acc = 1;
  }

  _jingle() {
    this.fob.v += this.fob.a > 0 ? -5 : 5;
    this.sw.v += 0.05;
    this.sfx('clink', { volume: 0.22, pitch: 1.6 });
    this.sfx('chip', { volume: 0.15, pitch: 1.9 });
  }

  _spark(x, y, n = 1) {
    for (let i = 0; i < n; i++) this.sparks.push({ x: Math.round(x + (i ? (Math.random() - 0.5) * 8 : 0)), y: Math.round(y + (i ? (Math.random() - 0.5) * 6 : 0)), t: -i * 0.08 });
  }

  // ------------------------------------------------------------------ game state
  // weather / season / blood moon, read from the game now and then (all optional)
  _readExtras() {
    const g = this.game, s = this.st;
    const x = { wx: null, season: null, label: '', temp: null, tomorrow: null, tomorrowLabel: '', moon: null };
    try {
      const se = g?.seasons;
      if (se) {
        x.wx = se.weather || null;
        x.season = se.season || null;
        const f = se.forecast?.(2);
        x.tomorrow = f?.[1]?.weather || null;
        x.label = f?.[0]?.label || WXNAME[se.weather] || '';
        x.tomorrowLabel = f?.[1]?.label || WXNAME[x.tomorrow] || '';
        if (Number.isFinite(se.temp)) x.temp = Math.round(se.temp);
      }
      const m = g?.bearEvents?.moon;
      if (m?.daysUntil && s.day != null) x.moon = { tonight: !!m.isBloodDay?.(s.day), days: m.daysUntil(s.day) };
    } catch { /* optional */ }
    this.extra = x;
    this._extraN = (this._extraN || 0) + 1;
  }

  update(dt, st = {}) {
    dt = clamp(+dt || 0, 0, 0.1);
    this.t += dt;
    this.st = { ...this.st, ...st };
    if (st.speed != null) this.speed = st.speed;
    const s = this.st;
    this._extraT -= dt;
    if (this._extraT <= 0) { this._extraT = 0.5; this._readExtras(); }
    const hour = mod24(s.hour ?? 0);
    const sections = s.sections || [];
    const wd = s.weekday;
    this.dayOff = wd === 0 || (typeof wd === 'string' && /^sun/i.test(wd)) || s.phase === 'off' || s.phase === 'dayoff' || !!s.dayOff ||
      (sections.length > 0 && sections.every((x) => x.kind === 'off'));
    let toRush = Infinity;
    for (const x of sections) {
      if (x.kind !== 'rush') continue;
      let d = x.from - hour;
      if (d < -12) d += 24;
      if (d > 12) d -= 24;
      if (d > -0.25 && d < toRush) toRush = d;
    }
    if (s.phase === 'rush' && toRush === Infinity) toRush = -0.1;
    let mode = 'calm';
    if (s.paused) mode = 'sleep';
    else if (this.dayOff) mode = 'sun';
    else if (toRush <= 0.25 && toRush > -0.25) mode = 'ring';
    else if (toRush <= 1) mode = 'wobble';
    else if (toRush <= 2) mode = 'pulse';
    else if (secAt(sections, hour)?.kind === 'rush') mode = 'busy';
    else if (secAt(sections, hour)?.kind === 'night') mode = 'night';
    if (mode !== this._lastMode) {
      this.el.classList.remove('bclock-pulse', 'bclock-wobble', 'bclock-ring', 'bclock-sleep');
      if (mode === 'pulse' || mode === 'wobble' || mode === 'ring' || mode === 'sleep') this.el.classList.add('bclock-' + mode);
      if (mode === 'ring' && this._lastMode) {
        // 5 PM: the alarm goes off, the lid flies open
        this._ringT = 0;
        this._bellT = 0;
        this.sfx('alarm', { volume: 0.5 });
        this.sfx('bell');
        if (!this.lidOpen) this._toggleLid(true);
      }
      this._lastMode = mode;
    }
    this.mode = mode;
    if (mode === 'ring') {
      this._ringT += dt;
      this._bellT += dt;
      const gap = this._ringT < RING_DUR ? 0.42 : 3.2;
      if (this._bellT > gap) { this._bellT = 0; this.sfx('bell', { volume: this._ringT < RING_DUR ? 0.6 : 0.3, pitch: Math.floor(this._ringT / 0.42) % 2 ? 1.12 : 1 }); }
    }
    // the escapement: the seconds hand ticks with the game speed, stops when paused
    if (!s.paused) {
      this.secT += dt * clamp(s.speed || this.speed || 1, 1, 3);
      const idx = Math.floor(this.secT) % 60;
      if (idx !== this.secIdx) {
        this.secIdx = idx;
        if (this.hover) this.sfx(idx % 2 ? 'tick' : 'tock', { volume: 0.12 });
      }
    }
    this._step(dt);
    this._acc += dt;
    if (this._acc >= 1 / 30) { this._acc = 0; this._draw(); }
    this._updateTag(dt);
  }

  // springs and timers (sub-stepped: the lid's snap is stiff)
  _step(dt) {
    const calm = reduced();
    const mode = this.mode;
    // the moods push the watch around
    if (!calm) {
      if (mode === 'wobble') {
        this._wobT -= dt;
        if (this._wobT <= 0) { this._wobT = 1.6; this._wobS = -(this._wobS || 1); this.sw.v += this._wobS * 0.13; this.fob.v += this._wobS * 2; }
      }
      if (mode === 'pulse' || mode === 'wobble') {
        this._beatT -= dt;
        if (this._beatT <= 0) { this._beatT = mode === 'pulse' ? 1.2 : 0.8; this._hopT = 0.12; }
      }
    }
    if (this._hopT > 0) this._hopT -= dt;
    if (this._tagGlow > 0) this._tagGlow -= dt;
    if (this._showTagT > 0) this._showTagT -= dt;
    if (this._slide > 0) { this._slide += dt / 0.75; if (this._slide >= 1) { this._slide = 0; this._prevScene = null; } }
    this._glintT -= dt;
    if (this._glintT < -0.6) this._glintT = 6 + Math.random() * 5;
    for (const p of this.sparks) p.t += dt;
    this.sparks = this.sparks.filter((p) => p.t < 0.5);
    const ringing = mode === 'ring' && this._ringT < RING_DUR && !calm;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const S = this.sw, F = this.fob, T = this.tg, C = this.crown, Ld = this.lid;
      S.v += (-26 * S.a - 1.8 * S.v) * h; S.a += S.v * h;
      if (Math.abs(S.a) > 0.06) { S.a = Math.sign(S.a) * 0.06; S.v *= -0.3; }
      if (ringing) { F.a = Math.sin(this._ringT * 26) * 0.8; F.v = 0; }
      else { F.v += (-34 * (F.a + 1.4 * S.a) - 2.4 * F.v) * h; F.a += F.v * h; F.a = clamp(F.a, -0.9, 0.9); }
      T.v += (-46 * (T.a + 1.2 * S.a) - 3.2 * T.v) * h; T.a += T.v * h; T.a = clamp(T.a, -0.7, 0.7);
      if (C.held) { C.x += (2 - C.x) * Math.min(1, h * 40); C.v = 0; }
      else { C.v += (-520 * C.x - 16 * C.v) * h; C.x += C.v * h; }
      // the lid: springs open with an overshoot, snaps shut with a bounce
      const tgt = this.lidOpen ? this.phiOpen + 0.2 : -0.6;
      const k = this.lidOpen ? 150 : 300, c = this.lidOpen ? 8 : 3;
      Ld.v += (k * (tgt - Ld.a) - c * Ld.v) * h; Ld.a += Ld.v * h;
      if (!this.lidOpen && Ld.a <= 0) {
        if (Ld.v < -3) {
          this.sfx('tock', { volume: 0.45, pitch: 0.8 });
          this.sfx('clink', { volume: 0.2, pitch: 0.75 });
          this.sw.v += 0.12; this.fob.v += 2;
          this._spark(this.G.cx + this.G.R - 2, this.G.cy - this.G.R + 8, 1);
          Ld.v = -Ld.v * 0.2;
        } else Ld.v = 0;
        Ld.a = 0;
      }
      // it can't open further than its hinge stop: it knocks against it and bounces back a little
      if (this.lidOpen && Ld.a > this.phiOpen) { Ld.a = this.phiOpen; if (Ld.v > 1.5) { Ld.v = -Ld.v * 0.28; this.sw.v -= 0.05; } else Ld.v = 0; }
      if (this.lidOpen && Math.abs(Ld.a - this.phiOpen) < 0.002 && Math.abs(Ld.v) < 0.02) { Ld.a = this.phiOpen; Ld.v = 0; }
    }
    // the case shakes while the alarm rings
    if (ringing) {
      const fr = Math.floor(this._ringT * 16);
      this._jit = { x: fr % 2 ? 1 : -1, y: fr % 4 < 2 ? 0 : -1, a: (fr % 2 ? 1 : -1) * 0.022 };
    } else this._jit = { x: 0, y: 0, a: 0 };
  }

  // ------------------------------------------------------------------ drawing
  _dial() {
    const s = this.st, sections = s.sections || [];
    const key = `${this.G.size}|${this.dayOff ? 1 : 0}|` + sections.map((x) => `${x.from},${x.to},${x.kind}`).join(';');
    if (key !== this._dialKey) { this._dialKey = key; this._dialBuf = buildDial(this.G, sections, this.dayOff); }
    return this._dialBuf;
  }

  _lidIn() {
    const s = this.st, x = this.extra;
    const key = `${this.G.size}|${s.day}|${s.weekday}|${this.dayOff ? 1 : 0}|${x.tomorrow}`;
    if (key !== this._lidKey) { this._lidKey = key; this._lidInBuf = buildLidIn(this.G, s.day, typeof s.weekday === 'string' ? s.weekday : '', this.dayOff, x.tomorrow); }
    return this._lidInBuf;
  }

  _scene(hour) {
    const x = this.extra;
    const sky = hour >= 5 && hour < 7 ? 'dawn' : hour >= 7 && hour < 17.5 ? 'day' : hour >= 17.5 && hour < 20.5 ? 'dusk' : 'night';
    const sc = { sky, wx: x.wx || 'clear', season: x.season || 'summer', blood: !!x.moon?.tonight, t: this.t };
    const key = `${sc.wx}|${sc.season}|${this.st.day}|${sc.blood}`;
    // the disc only turns for a real change (not when the game's data first arrives)
    if (key !== this._sceneKey && this._extraN > 1) {
      if (this._sceneKey && this._lastScene && !reduced()) { this._prevScene = { ...this._lastScene }; this._slide = 0.001; }
      this._sceneKey = key;
    } else if (this._extraN <= 1) this._sceneKey = key;
    this._lastScene = sc;
    if (this._prevScene) this._prevScene.t = this.t;
    return sc;
  }

  _plaque(hour) {
    const s = this.st, sections = s.sections || [];
    if (this.dayOff) return { kind: 'off', text: 'OFF' };
    const rush = sections.find((q) => q.kind === 'rush');
    if (!rush) return { kind: 'off', text: 'OFF' };
    if (s.phase === 'rush' || secAt(sections, hour)?.kind === 'rush') return { kind: 'feast', text: 'EAT!' };
    const d = rush.from - hour;
    if (d <= 0 || s.phase === 'night') return { kind: 'night', text: 'ZZZ' };
    const H = Math.floor(d), M = Math.floor((d - H) * 60);
    const text = H >= 10 ? `${H}h` : H >= 1 ? `${H}h${String(M).padStart(2, '0')}` : `${Math.max(1, M)}m`;
    return { kind: 'count', text, red: d < 1, blink: d < 2, d };
  }

  _draw() {
    const G = this.G, b = this.body, s = this.st;
    if (!G) return;
    const hour = mod24(s.hour ?? 0);
    b.clear();
    b.blit(this.caseBuf, 0, 0);
    b.blit(this._dial(), 0, 0);
    drawAperture(b, G, this._scene(hour), this._slide, this._prevScene);
    drawPlaque(b, G, this._plaque(hour), this.t);
    this._bloodPip(b);
    this._hands(b, hour);
    if (this.lid.a > 0.05) this._glass(b, hour, G.rd);
    this._lid(b);
    if (this.lid.a <= 0.05) this._glass(b, hour, G.rw + 0.5);
    drawHinge(b, G);
    drawPendant(b, G);
    drawBow(b, G);
    drawCrown(b, G, this.crown.x);
    drawChainUp(b, G);
    this._swag(b);
    drawTag(b, G, s.speed || this.speed, !!s.paused, this.tg.a, this._tagGlow);
    this._compose();
  }

  _compose() {
    const G = this.G, out = this.out, body = this.body, W = G.W, H = G.H;
    out.clear();
    const press = this._press === 'dial' || this._press === 'lid' ? 1 : 0;
    const a = this.sw.a + this._jit.a, ox = this._jit.x, oy = this._jit.y + (this._hopT > 0 ? -1 : 0) + press;
    if (Math.abs(a) < 0.006) out.blit(body, ox, oy);
    else {
      // swing from the top of the chain: rotate the whole watch, nearest pixel (it stays on the art grid)
      const ca = Math.cos(a), sa = Math.sin(a), px = G.cx, bd = body.d, od = out.d;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - px - ox, dy = y + 0.5 - oy;
        const sx = Math.floor(ca * dx + sa * dy + px), sy = Math.floor(-sa * dx + ca * dy);
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        const c = bd[sy * W + sx];
        if (c) od[y * W + x] = c;
      }
    }
    this._ringLines(out);
    this._zs(out);
    this._sparks(out);
    // a crisp drop shadow, two art px down
    const d = out.d, sh = P.shadow;
    for (let y = H - 1; y >= 2; y--) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!d[i]) { const c = d[i - 2 * W]; if (c && c >>> 24 === 255) d[i] = sh; }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  _hands(b, hour) {
    const G = this.G, hb = this.hb, L = G.size === 'L', H = G.hands, { cx, cy } = G;
    hb.clear();
    const ah = hourAngle(hour), am = (hour % 1) * TAU, as = (this.secIdx / 60) * TAU;
    const blue = [P.b0, P.b1, P.b2];
    drawHand(hb, cx, cy, am, L ? -4 : -3, H.min, (t) => (t < H.min * 0.62 ? 2.05 : 1.2), blue);
    drawHand(hb, cx, cy, ah, L ? -3 : -2, H.hour, (t) => (t < 0 ? 2.2 : t < H.hour * 0.5 ? 3.1 : t < H.hour * 0.82 ? 2.1 : 1.3), blue);
    if (L) { const mt = H.hour * 0.66; drawRing(hb, cx + Math.sin(ah) * mt, cy - Math.cos(ah) * mt, 1.05, 2.45, P.b1); }
    // the seconds needle: thin dark red, a bright tip, a ring counterweight
    drawHand(hb, cx, cy, as, L ? -6 : -4, H.sec, () => 1.05, [P.r0, P.r0, P.r0]);
    drawHand(hb, cx, cy, as, H.sec - (L ? 4 : 3), H.sec, () => 1.05, [P.r1, P.r1, P.r1]);
    if (L) drawRing(hb, cx - Math.sin(as) * 4.5, cy + Math.cos(as) * 4.5, -1, 1.25, P.r0);
    // the hands' crisp shadow on the enamel (one pixel down right), then the hands, then the hub
    const W = G.W, d = hb.d, bd = b.d;
    for (let i = 0; i < d.length - W - 1; i++) if (d[i] && !d[i + W + 1] && bd[i + W + 1]) bd[i + W + 1] = darken(bd[i + W + 1], 0.2);
    b.blit(hb);
    if (L) b.rows(['.oo.', 'ohmo', 'ommo', '.oo.'], cx - 2, cy - 2, { o: P.ink, h: P.g5, m: P.g3 });
    else b.rows(['hm', 'md'], cx - 1, cy - 1, { h: P.g5, m: P.g3, d: P.g1 });
  }

  // the glass: the sun's glint follows the hour round the crystal (a pale moon glint at night),
  // and now and then a bright sweep crosses it
  _glass(b, hour, rmax) {
    const G = this.G, { cx, cy } = G, L = G.size === 'L';
    const night = hour < 6 || hour >= 20;
    const sa = hourAngle(hour);
    const r0 = rmax - (L ? 4.2 : 3), r1 = rmax - 1.2, spread = L ? 0.36 : 0.42;
    for (let y = Math.floor(cy - rmax); y <= cy + rmax; y++) for (let x = Math.floor(cx - rmax); x <= cx + rmax; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
      if (r > rmax) continue;
      const i = y * G.W + x, c = b.d[i];
      if (!c) continue;
      if (r >= r0 && r <= r1) {
        const ang = Math.atan2(dx, -dy), da = Math.abs(((ang - sa + Math.PI) % TAU + TAU) % TAU - Math.PI);
        const w = 1 - da / spread;
        if (w + (hsh(x, y) - 0.5) * 0.3 > 0.32) b.d[i] = night ? tint(c, NIGHT_GLINT, 0.4) : lighten(c, w > 0.6 ? 0.62 : 0.4);
      }
      if (this._glintT < 0) {
        const k = clamp(-this._glintT / 0.6, 0, 1), pos = -rmax * 1.5 + k * rmax * 3;
        const pr = (dx + dy) * 0.7071 - pos;
        if (Math.abs(pr) < 0.9) b.d[i] = lighten(b.d[i], 0.5);
        else if (pr > 0.9 && pr < 2) b.d[i] = lighten(b.d[i], 0.22);
      }
    }
    if (!night && L) {
      const rr = (r0 + r1) / 2;
      const gx = Math.round(cx + Math.sin(sa) * rr - 0.5), gy = Math.round(cy - Math.cos(sa) * rr - 0.5);
      if (Math.floor(this.t * 1.3) % 3 !== 0) b.rows(SPR.sparkS, gx - 1, gy - 1, { w: P.w });
    }
  }

  _lid(b) {
    const G = this.G, a = this.lid.a, { cx, cy, R } = G, hx = cx - R;
    if (a <= 0.004) { b.blit(this.lidOutBuf, cx - R, cy - R); return; }
    const li = this._lidIn();
    if (Math.abs(a - this.phiOpen) < 0.003) { b.blit(li.buf, cx - R - 2 * G.lidA - 2, cy - R); return; }
    const co = Math.cos(a), aw = R * Math.abs(co);
    if (aw < 1.3) { // edge on: just the rim
      const ex = Math.round(hx + R * co);
      for (let y = cy - R + 2; y < cy + R - 1; y++) { b.set(ex - 1, y, P.ink); b.set(ex, y, P.g4); b.set(ex + 1, y, P.ink); }
      b.set(ex, cy - R + 1, P.ink); b.set(ex, cy + R - 1, P.ink);
      return;
    }
    const y0 = cy - R;
    if (co > 0) {
      // the outside, foreshortened as it swings
      const ecx = hx + aw, src = this.lidOutBuf, c0 = R + 0.5;
      for (let y = y0; y <= cy + R; y++) {
        let first = null;
        for (let x = Math.floor(ecx - aw - 1); x <= ecx + aw + 1; x++) {
          const u = (x + 0.5 - ecx) / aw;
          if (u < -1.04 || u > 1.04) continue;
          const c = src.get(Math.floor(c0 + u * R), y - y0);
          if (c) { b.set(x, y, c); if (first == null) first = x; }
        }
        // the lid's thickness shows as a sliver of rim on the hinge side
        if (first != null && y > y0 + 1 && y < cy + R - 1) b.set(first - 1, y, P.g1);
      }
    } else {
      // the inside (and the calendar card), squashed or stretched from its resting look
      const src = li.buf, s = aw / G.lidA, ecx = hx - aw;
      const xa = Math.floor(ecx - li.cx * s) - 1, xb = Math.ceil(ecx + (src.w - li.cx) * s) + 1;
      for (let y = y0; y <= cy + R; y++) for (let x = xa; x <= xb; x++) {
        const xc = li.cx + (x + 0.5 - ecx) / s;
        const c = src.get(Math.floor(xc), y - y0);
        if (c) b.set(x, y, c);
      }
    }
  }

  _bloodPip(b) {
    const m = this.extra.moon;
    if (!m || !(m.tonight || (m.days > 0 && m.days <= 6))) return;
    const G = this.G, { cx, cy, R } = G, L = G.size === 'L';
    const a = 0.74 * Math.PI, rr = R - G.band / 2 - 0.5;
    const mx = cx + Math.sin(a) * rr, my = cy - Math.cos(a) * rr;
    const hot = m.tonight || m.days <= 1, on = !hot || Math.floor(this.t * 3) % 2 === 0;
    const mr = L ? 2.3 : 1.6;
    for (let y = Math.floor(my - mr - 2); y <= my + mr + 2; y++) for (let x = Math.floor(mx - mr - 2); x <= mx + mr + 2; x++) {
      const d = Math.hypot(x + 0.5 - mx, y + 0.5 - my);
      if (d <= mr) {
        const sh = Math.hypot(x + 0.5 - mx - 1, y + 0.5 - my + 0.7) > mr - 0.4;
        b.set(x, y, sh ? P.r0 : on ? P.r1 : P.r0);
      } else if (d <= mr + 0.95) b.set(x, y, P.ink);
    }
    if (on && L) b.set(Math.floor(mx - 1), Math.floor(my - 1), P.r2);
    if (!m.tonight) for (let i = 0; i < Math.min(6, m.days); i++) {
      const aa = a - (i + 1) * (L ? 0.105 : 0.15) - (L ? 0.06 : 0.05);
      b.set(cx + Math.sin(aa) * rr - 0.5 + 0.5, cy - Math.cos(aa) * rr, i === 0 && hot ? P.r1 : P.r0);
    }
  }

  _swag(b) {
    const G = this.G, { cx, cy, R } = G, L = G.size === 'L';
    const hx = cx + R + (L ? 4 : 3), hy = cy - R + (L ? 11 : 8);
    drawSwag(b, G, cx + G.bowRx, G.legY, hx, hy, L ? 6 : 4);
    drawBell(b, G, hx, hy, this.fob.a);
    this._bellX = hx;
    this._bellY = hy;
  }

  _ringLines(out) {
    if (this.mode !== 'ring' || this._ringT > RING_DUR) return;
    const G = this.G, { cx, cy, R } = G, L = G.size === 'L', fr = Math.floor(this.t * 12) % 2;
    const sets = [[-0.62, 3], [0.62, 3], [1.95, 2]];
    if (!this.lidOpen) sets.push([-1.95, 2]);
    for (const [a, n] of sets) for (let k = 0; k < n; k++) {
      const aa = a + (k - (n - 1) / 2) * (L ? 0.2 : 0.26);
      const r0 = R + 3 + fr, r1 = r0 + (L ? 4 : 3);
      line(out, cx + Math.sin(aa) * r0 - 0.5, cy - Math.cos(aa) * r0 - 0.5, cx + Math.sin(aa) * r1 - 0.5, cy - Math.cos(aa) * r1 - 0.5, P.ink);
    }
  }

  _zs(out) {
    if (this.mode !== 'sleep') return;
    const G = this.G, L = G.size === 'L';
    for (let i = 0; i < 3; i++) {
      const p = (this.t * 0.38 + i / 3) % 1;
      if (p > 0.95) continue;
      const zx = Math.round(G.cx + (L ? 9 : 6) + p * (L ? 20 : 13) + Math.sin(p * 8 + i * 2) * 1.6);
      const zy = Math.round(G.bowY + (L ? 2 : 1) - p * (L ? 22 : 14));
      const spr = p < 0.3 ? SPR.zS : p < 0.62 ? SPR.zM : SPR.zL;
      for (let y = 0; y < spr.length; y++) for (let x = 0; x < spr[y].length; x++) {
        if (spr[y][x] !== 'k') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = zx + x + dx, Y = zy + y + dy; if (!(spr[y + dy]?.[x + dx] === 'k')) out.set(X, Y, P.ink); }
      }
      out.rows(spr, zx, zy, { k: P.w });
    }
  }

  _sparks(out) {
    for (const p of this.sparks) {
      if (p.t < 0) continue;
      const big = p.t > 0.1 && p.t < 0.32 && this.G.size === 'L';
      if (big) out.rows(SPR.spark, p.x - 2, p.y - 2, { w: P.w });
      else out.rows(SPR.sparkS, p.x - 1, p.y - 1, { w: p.t > 0.32 ? P.g5 : P.w });
    }
  }

  // ------------------------------------------------------------------ the paper tag (hover / after a tap)
  _tagLines() {
    const s = this.st, x = this.extra, hour = mod24(s.hour ?? 0);
    const H = Math.floor(hour), M = Math.floor((hour - H) * 60);
    const h12 = ((H + 11) % 12) + 1, ap = H < 12 ? 'AM' : 'PM';
    const wd = typeof s.weekday === 'string' ? s.weekday.slice(0, 3) : '';
    const lines = [[{ text: `${h12}:${String(M).padStart(2, '0')} ${ap}`, color: TAGC.ink }, { text: `  ${wd}${wd ? ' ' : ''}day ${s.day ?? 1}`, color: TAGC.grey }]];
    const p = this._plaque(hour);
    if (p.kind === 'count') {
      const hh = Math.floor(p.d), mm = Math.floor((p.d - hh) * 60);
      lines.push([{ text: 'Feast in ', color: TAGC.ink }, { text: hh ? `${hh}h ${mm}m` : `${Math.max(1, mm)} min!`, color: p.red ? TAGC.red : TAGC.gold }]);
    } else if (p.kind === 'feast') lines.push([{ text: 'Feast time!', color: TAGC.red }]);
    else if (p.kind === 'night') lines.push([{ text: 'Night: feast tomorrow', color: TAGC.blue }]);
    else lines.push([{ text: this.dayOff ? 'Day off: no feast' : 'No feast today', color: TAGC.blue }]);
    if (x.wx || x.label) {
      lines.push([{ text: `${x.label || WXNAME[x.wx] || ''}${x.temp != null ? ` ${x.temp}\u00b0C` : ''}`, color: TAGC.ink }, ...(x.season ? [{ text: ` ${x.season}`, color: TAGC.green }] : [])]);
      if (x.tomorrowLabel) lines.push([{ text: `Tomorrow: ${x.tomorrowLabel}`, color: TAGC.grey }]);
    }
    if (x.moon && (x.moon.tonight || (x.moon.days > 0 && x.moon.days <= 6))) lines.push([{ text: x.moon.tonight ? 'Blood moon tonight!' : `Blood moon in ${x.moon.days}d`, color: TAGC.red }]);
    lines.push(s.paused ? [{ text: 'Paused', color: TAGC.blue }, { text: ' (tap crown)', color: TAGC.grey }]
      : [{ text: `Speed ${s.speed || this.speed || 1}x`, color: TAGC.red }, { text: ' (tap crown)', color: TAGC.grey }]);
    return lines;
  }

  _updateTag(dt) {
    const show = (this.hover || this._showTagT > 0) && !this.el.classList.contains('bclock-hidden');
    if (show !== this._tagOn) {
      this._tagOn = show;
      this.tagCv.classList.toggle('on', show);
      this._tagKey = '';
    }
    this._tagT = (this._tagT || 0) - dt;
    // the aria label stays current for screen readers
    if (this._tagT > 0) return;
    this._tagT = 0.25;
    const lines = this._tagLines();
    const key = lines.map((L) => L.map((r) => r.text).join('')).join('|');
    if (this._ariaKey !== key) { this._ariaKey = key; this.btn.setAttribute('aria-label', `Pocket watch. ${lines.map((L) => L.map((r) => r.text).join('')).join('. ')}`); }
    if (!show || key === this._tagKey) return;
    this._tagKey = key;
    const tb = buildTagBuf(lines);
    paintBuf(this.tagCv, tb);
    const k = this.k;
    this.tagCv.style.width = tb.w * k + 'px';
    this.tagCv.style.height = tb.h * k + 'px';
    // hang it under the watch, kept on screen
    let left = (this.G.cx - (tb.w >> 1)) * k;
    try {
      const r = this.el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || innerWidth;
      const over = r.left + left + tb.w * k - (vw - 6);
      if (over > 0) left -= Math.ceil(over / k) * k;
      if (r.left + left < 6) left += Math.ceil((6 - r.left - left) / k) * k;
    } catch { /* layout not ready */ }
    this.tagCv.style.left = left + 'px';
  }
}
