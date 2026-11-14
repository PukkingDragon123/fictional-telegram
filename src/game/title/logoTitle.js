// [v33 title] The 3D title logo on the title screen (the logo itself: logo3d.js).
//
// Built a moment after the title scene starts (the pond shows first, the floating TitleWords hold
// the spot meanwhile), then handed to the menu through window.__tbmeLogo3d + a
// 'tbme-logo3d-ready' event: TitleMenu attaches its logo box (.tm-logo), the words float away and
// the island rises in their place. Every frame, right after the camera rig moves, the logo is
// placed in the world just in front of the camera, under that box: always the same size and
// spot on screen, lit by the world's sun, drawn with the world's outline pass. It leans back so the
// camera sees its fronts and a little of its grassy tops, and turns a touch from side to side.
// Pointer: hover a letter (wobble + rustle), click one (a fish leaps, water splashes or a flower
// pops). Hidden while the menu steps aside (save boxes, settings, credits).
//
//   const h = mountTitleLogo(game);  h.update(dt);  h.dispose();
//   window.__tbmeLogo3d.logo   the builder's handle (tests: .poke(i), .leap(), .letters)
import * as THREE from 'three';
import { buildTitleLogo } from './logo3d.js';

const REL = 0.3; // how far (radians) the camera looks down onto the logo
const DEPTH = 16; // world units in front of the camera's near plane

export function mountTitleLogo(game) {
  const rig = game.rig, R = game.renderer;
  const play = (n, o) => { try { game.audio?.play?.(n, { volume: 0.4, ...(o || {}) }); } catch { /* optional */ } };
  let logo = null, box = null, ext = null, dead = false, T = 0, rect = null, rectT = 0, hoverI = -1, want = false;
  const _p = new THREE.Vector3();

  // place the logo right after the rig moved this frame (no lag against the camera)
  const ownUpdate = Object.prototype.hasOwnProperty.call(rig, 'update') ? rig.update : null;
  const baseUpdate = ownUpdate || Object.getPrototypeOf(rig).update;
  rig.update = function (dt, r) {
    const out = baseUpdate.call(this, dt, r);
    try { place(); } catch (e) { console.warn('[logo3d]', e); }
    return out;
  };

  function boxRect() {
    if (!box) return null;
    if (!rect || T - rectT > 0.5) {
      const b = box.getBoundingClientRect();
      const c = game.canvas?.getBoundingClientRect?.() || document.getElementById('game')?.getBoundingClientRect() || { left: 0, top: 0 };
      rect = { x: b.left - c.left, y: b.top - c.top, w: b.width, h: b.height };
      rectT = T;
    }
    return rect;
  }

  function place() {
    if (!logo || !logo.group.visible) return;
    const b = boxRect();
    if (!b || b.w < 4) return;
    const ps = R.pixelScale || 1, dpr = R.dpr || 1;
    // size: fill the box (low-res px per voxel)
    const wLow = (b.w * dpr) / ps, hLow = (b.h * dpr) / ps;
    const ppv = Math.min(wLow / ext.w, hLow / ext.h);
    logo.setVoxel(ppv * rig.wupp);
    // spot: the box's centre, just past the near plane
    const cx = Math.round(b.x + b.w / 2), cy = Math.round(b.y + b.h / 2);
    const ray = rig.screenRay(cx, cy, R);
    logo.group.position.copy(_p.copy(ray.origin).addScaledVector(ray.direction, DEPTH));
    logo.group.rotation.set(-(rig.pitch - REL) + Math.sin(T * 0.21) * 0.025, rig.yaw + Math.sin(T * 0.17) * 0.09, 0, 'YXZ');
    logo.group.updateMatrixWorld(true);
  }

  // ---- pointer: hover / click a letter
  const canvasXY = (e) => { const c = game.canvas?.getBoundingClientRect?.() || document.getElementById('game')?.getBoundingClientRect() || { left: 0, top: 0 }; return [e.clientX - c.left, e.clientY - c.top]; };
  const blocked = (e) => !!e.target?.closest?.('button, .tbx, .stg, .tcr, a, input');
  const pickAt = (e) => {
    if (!logo || !logo.visible || blocked(e)) return -1;
    const [x, y] = canvasXY(e);
    return logo.pick(rig.screenRay(x, y, R));
  };
  let lastHover = 0;
  const onMove = (e) => {
    const i = pickAt(e);
    if (i !== hoverI) {
      hoverI = i;
      document.documentElement.classList.toggle('tmw-hand', i >= 0);
      if (i >= 0) {
        logo.hover(i);
        if (T - lastHover > 0.08) { lastHover = T; play('hover', { volume: 0.25, pitch: 0.8 + Math.random() * 0.5 }); }
      }
    }
  };
  const onDown = (e) => {
    const i = pickAt(e);
    if (i < 0) return;
    e.stopPropagation(); e.preventDefault();
    logo.poke(i);
    play('jump', { volume: 0.18, pitch: 1.2 + Math.random() * 0.4 });
  };
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerdown', onDown, true);
  const onResize = () => { rect = null; };
  window.addEventListener('resize', onResize);

  // ---- the menu bridge
  const bridge = {
    get logo() { return logo; },
    attach(el) { box = el; rect = null; },
    show(on) {
      want = on;
      if (!logo) return Promise.resolve();
      rect = null;
      if (on) logo.intro(); else logo.hide();
      return new Promise((res) => setTimeout(res, on ? 0 : 420));
    },
  };

  // ---- build a moment later (the pond first)
  const tBuild = setTimeout(() => {
    if (dead) return;
    try {
      logo = buildTitleLogo(game, { sfx: (n, o) => play(n, o) });
    } catch (e) { console.warn('[logo3d] build failed', e); return; }
    ext = logo.fitTilt(REL);
    game.scene.add(logo.group);
    window.__tbmeLogo3d = bridge;
    window.dispatchEvent(new CustomEvent('tbme-logo3d-ready'));
    if (want) logo.intro();
  }, 350);

  return {
    bridge,
    update(dt) { T += dt; logo?.update(dt); },
    dispose() {
      if (dead) return;
      dead = true;
      clearTimeout(tBuild);
      if (ownUpdate) rig.update = ownUpdate; else delete rig.update;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onResize);
      document.documentElement.classList.remove('tmw-hand');
      if (window.__tbmeLogo3d === bridge) delete window.__tbmeLogo3d;
      window.dispatchEvent(new CustomEvent('tbme-logo3d-gone'));
      logo?.dispose();
      logo = null;
    },
  };
}
