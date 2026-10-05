// PortfolioRoom: the game's own Classroom (src/game/Classroom.js), turned into a
// persistent place you can walk around in. The base class is a cutscene: it
// wipes into the room for one lesson and wipes out again. Here the room, the fox
// and the camera stay alive all the time, chapters (content.js) play as lessons
// inside it, and the page can talk to the room through `hooks`:
//
//   const room = new PortfolioRoom(game, { media: MEDIA, hooks: { onLink, onContact, onChapterStart, onChapterEnd } });
//   room.start();                     // build the room, Reynard waves from his desk
//   await room.runChapter(script);    // plays a chapter; resolves { completed, skipped }
//   room.skip();                      // end the running chapter early
//   room.update(dt);                  // every frame (always ticks, chapter or not)
//   room.screen                       // the projector screen (ProjectorScreen.js)
//
// Extra step keys on top of the game's (see content.js): screen, link, contact.
import * as THREE from 'three';
import { Classroom } from '../src/game/Classroom.js';
import { ProjectorScreen } from './ProjectorScreen.js';

export class PortfolioRoom extends Classroom {
  constructor(game, { media = {}, hooks = {} } = {}) {
    super(game);
    this.media = media;
    this.hooks = hooks;
    this.selfDrive = false; // main.js calls update() every frame
    this.ready = false;
    this._script = null;
  }

  // ---------------------------------------------------------------- build / idle
  _build() {
    if (this.room) return;
    super._build();
    this.screen = new ProjectorScreen(this.room.group, { sfx: (n, o) => this._sfx(n, o) });
  }

  /** Build the room and put the fox at his desk, waving, camera wide. */
  start() {
    this._build();
    const f = this.fox, a = this.room.anchors.deskSpot;
    f.root.position.copy(a.position);
    f.root.rotation.y = this.foxState.yaw = a.rotationY;
    f.setAim?.(null);
    f.holdProp?.('pointer');
    f.play(this._anim('wave_hello', 'wave'), { loop: false, fade: 0, onDone: () => this._idle() });
    this.room.students.setSleepy(true);
    this.room.students.lookAtX(this.room.anchors.teacherSpot.position.x);
    const now = new Date();
    this.room.setClock(now.getHours() + now.getMinutes() / 60);
    this.cam('wide', true);
    this.ready = true;
    return this;
  }

  /** Always ticks (the base class only ticks while a lesson is active). */
  update(dt) {
    if (!this.room) return;
    this._ext = performance.now();
    this._tick(dt);
    this.screen?.update(dt);
  }

  // On a tall phone screen the whole room would be a postage stamp, so the 'wide'
  // shot crops to the middle of the room (board, students, desk).
  _portrait() {
    const r = this.game.renderer;
    return !!r && r.lowW / Math.max(1, r.lowH) < 0.85;
  }
  cam(name, instant = false) {
    this._camName = typeof name === 'string' ? name : null;
    let a = name;
    if (name === 'wide' && this._portrait()) {
      const w = this.room.anchors.camWide;
      this._wideP ||= { ...w, target: new THREE.Vector3(0.45, w.target.y, w.target.z), fit: { w: 7.4, h: w.fit.h } };
      a = this._wideP;
    }
    return super.cam(a, instant);
  }

  /** Re-fit the current camera framing after a resize / rotation. */
  refitCamera() {
    if (!this.room) return;
    if (this._camName) { this._camA = null; this.cam(this._camName, true); return; }
    const a = this._camA;
    if (!a) return;
    this._camA = null;
    super.cam(a, true);
  }

  // ---------------------------------------------------------------- chapters
  async runChapter(script) {
    if (this._active) return { completed: false, skipped: false, busy: true };
    this._build();
    this._script = script;
    this._skip = false;
    this._active = true;
    this.ff = false; // every lesson starts at normal speed
    document.body.classList.add('class-mode');
    this._buildUI();
    const f = this.fox;
    f.setAim?.(null);
    f.holdProp?.('pointer');
    this.board.clear();
    this.room.students.setSleepy(true);
    this.room.students.lookAtX(this.room.anchors.teacherSpot.position.x);
    this._sfx('class_bell', { volume: 0.5 });
    this.hooks.onChapterStart?.(script);
    const result = { completed: false, skipped: false };
    try {
      await this._intro(script);
      for (const st of script.steps) { this._check(); await this._step(st); }
      this._check();
      await this._outro(script);
      result.completed = true;
    } catch (e) {
      result.skipped = !!this._skip;
      if (!this._skip) console.warn('PortfolioRoom: chapter error', e);
    }
    // wrap up: lights, screen, tags and UI back to free-roam
    this._skip = false;
    this._busy = false;
    this.screen.hide();
    this.hooks.onLink?.(null);
    this.room.setDim?.(0);
    f.setAim?.(null);
    f.holdProp?.('pointer');
    this.game.audio?.stopBabble?.();
    this._removeUI();
    document.body.classList.remove('class-mode');
    this._active = false;
    this.foxState.follow = null;
    if (f.current === 'walk' && !this.foxState.goal) f.play(this._anim('teach_point', 'idle'), { loop: true, fade: 0.2 });
    this.cam('wide');
    const wantContact = this._wantContact && result.completed;
    this._wantContact = false;
    this.hooks.onChapterEnd?.(script, result);
    if (wantContact) this.hooks.onContact?.();
    return result;
  }

  async _step(st) {
    const hasBoard = !!(st.draw || st.erase);
    const wantScreen = st.screen && st.screen !== 'hide' ? this.media[st.screen] : null;
    if (wantScreen) {
      this.screen.show(wantScreen);
      st = { ...st, cam: st.cam || 'board', at: st.at || 'teacher' };
    } else if (st.screen === 'hide' || (st.screen === undefined && hasBoard)) {
      this.screen.hide();
    }
    if (st.link !== undefined) this.hooks.onLink?.(st.link);
    if (st.contact) this._wantContact = true; // the card opens once the chapter wraps up
    this._tapsLeft = st.tap ? [].concat(st.tap).length : 0;
    return super._step(st);
  }

  // After the last tap of a step Reynard steps back to his spot beside the board,
  // so he is not standing in front of the chalk he just pointed at.
  async _tap(id, mode) {
    await super._tap(id, mode);
    if (this._tapsLeft > 0) this._tapsLeft--;
    const f = this.fox;
    if (this._tapsLeft !== 0 || !f || this._skip) return;
    const a = this.room.anchors.teacherSpot;
    if (f.root.position.distanceTo(a.position) <= 0.3) return;
    f.setAim?.(null);
    await this.walkTo(a.position, a.rotationY);
    this._check();
    this._idle(true);
  }

  // ---------------------------------------------------------------- game UI tweaks
  _buildUI() {
    super._buildUI();
    const name = this.ui?.querySelector('.cls-name');
    if (name) name.textContent = 'PUKKING';
  }

  _stamp() {
    super._stamp();
    const s = this._script?.stamp;
    const el = this.q('stamp');
    if (s && el) {
      const b = el.querySelector('b'), i = el.querySelector('i');
      if (b) b.textContent = s[0];
      if (i) i.textContent = s[1];
    }
  }
}
