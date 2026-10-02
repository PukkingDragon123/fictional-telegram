// Land plots for sale around your meadow (8 x 8 tiles). Pick the Land tool,
// tap a plot with a FOR SALE sign and buy it: it's yours, so the beavers can
// clear its trees from anywhere inside it (no need to work in from the edge),
// and its open grass is usable straight away. Owned plots get corner posts.
// Plots next to your land (or another plot you own) are for sale; plots under
// the thick fog wait until that area is discovered.
import * as THREE from 'three';
import { KIND } from '../world/grid.js';
import { WORLD_W, WORLD_H, OFFICE } from '../world/worldgen.js';

export const PLOT = 8;
const BASE_PRICE = 140;

export class Land {
  constructor(game) {
    this.game = game;
    this.owned = new Set(); // 'px,pz'
    this.group = new THREE.Group();
    this.group.name = 'land';
    game.scene.add(this.group);
    this.overlay = null;
    this.postMat = new THREE.MeshLambertMaterial({ color: 0x8a5a30 });
    this.flagMat = new THREE.MeshLambertMaterial({ color: 0xe8483a });
    this.postGeo = new THREE.BoxGeometry(0.08, 0.5, 0.08);
    this.flagGeo = new THREE.BoxGeometry(0.2, 0.12, 0.02);
  }

  key(px, pz) { return px + ',' + pz; }
  plotOf(x, z) { return [Math.floor(x / PLOT), Math.floor(z / PLOT)]; }
  ownsTile(i) {
    const g = this.game.grid;
    const x = i % g.w, z = (i / g.w) | 0;
    return this.owned.has(this.key(Math.floor(x / PLOT), Math.floor(z / PLOT)));
  }

  *tiles(px, pz) {
    const g = this.game.grid;
    for (let z = pz * PLOT; z < (pz + 1) * PLOT; z++) for (let x = px * PLOT; x < (px + 1) * PLOT; x++) if (g.inb(x, z)) yield [x, z, z * g.w + x];
  }

  // everything the shop sign needs to know about a plot
  info(px, pz) {
    const game = this.game;
    const g = game.grid;
    let n = 0, mine = 0, water = 0, forest = 0, fog = 0, rock = 0, edge = false;
    for (const [x, z, i] of this.tiles(px, pz)) {
      n++;
      if (g.meadow[i]) mine++;
      if (g.kind[i] === KIND.WATER) water++;
      if (g.kind[i] === KIND.FOREST || g.deco[i] >= 0) forest++;
      if (g.kind[i] === KIND.ROCK || g.kind[i] === KIND.SNOW) rock++;
      if ((game.zones?.fogAt(x, z) || 0) > 0.45) fog++;
      if (!edge) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (Math.floor(nx / PLOT) === px && Math.floor(nz / PLOT) === pz) continue;
        if (!g.inb(nx, nz)) continue;
        const ni = nz * g.w + nx;
        if (g.meadow[ni] || this.ownsTile(ni)) { edge = true; break; }
      }
    }
    const owned = this.owned.has(this.key(px, pz));
    const out = { px, pz, x: px * PLOT + PLOT / 2, z: pz * PLOT + PLOT / 2, owned, n, mine, forest, fog, edge, price: 0, forSale: false, reason: '' };
    if (owned) return out;
    if (!n || px < 1 || pz < 1 || (px + 1) * PLOT > WORLD_W - 2 || (pz + 1) * PLOT > WORLD_H - 2) { out.reason = 'edge of the map'; return out; }
    if (pz * PLOT < OFFICE.z + 9) { out.reason = 'the mountain belongs to the bears'; return out; }
    if (mine >= n * 0.9) { out.reason = 'already yours'; return out; }
    if (rock > n * 0.5 || water > n * 0.7) { out.reason = 'too rocky'; return out; }
    if (fog > n * 0.4) { out.reason = 'lost in the fog: explore there first'; return out; }
    if (!edge) { out.reason = 'buy the land next to it first'; return out; }
    out.forSale = true;
    out.price = this.price(out);
    return out;
  }

  price(info) {
    const k = this.owned.size;
    return Math.round((BASE_PRICE * Math.pow(1.32, k) * (1 + (info.forest / info.n) * 0.25)) / 5) * 5;
  }

  forSale() {
    const out = [];
    const g = this.game.grid;
    for (let pz = 0; pz * PLOT < g.h; pz++) for (let px = 0; px * PLOT < g.w; px++) {
      const I = this.info(px, pz);
      if (I.forSale) out.push(I);
    }
    return out;
  }

  // ------------------------------------------------------------ buying
  async buy(px, pz) {
    const game = this.game;
    const I = this.info(px, pz);
    if (!I.forSale) { game.notify(I.owned ? 'You already own this plot!' : `Not for sale: ${I.reason}.`, 'no'); return false; }
    if (!game.spend(I.price, 'shop')) { game.audio.play('error', { volume: 0.4 }); game.notify(`Need ${I.price} coins for this plot!`, 'no'); return false; }
    this.owned.add(this.key(px, pz));
    const g = game.grid;
    let open = 0;
    // open grass is ready to use; trees and rocks wait for the beavers
    for (const [, , i] of this.tiles(px, pz)) {
      if (!g.meadow[i] && g.kind[i] === KIND.GRASS && g.deco[i] < 0) { g.meadow[i] = 1; open++; }
    }
    if (open) { game.world.landVersion++; game.world.rebuildTerrain(); game.world.buildClutter(); game.onTopologyChanged?.(); }
    this.buildPosts();
    this.refreshOverlay();
    game.emit('landBought', I);
    game.audio.play('buy', { volume: 0.5 });
    await this.soldCutscene(I);
    game.save();
    return true;
  }

  // a little ceremony: the camera flies over the new plot, SOLD! stamp, confetti
  async soldCutscene(I) {
    const game = this.game;
    const gy = game.grid.height[Math.floor(I.z) * game.grid.w + Math.floor(I.x)] || 0;
    const burst = () => {
      game.particles.confetti(I.x, gy + 1.2, I.z, 50);
      game.particles.word('sold', I.x, gy + 1.8, I.z, { size: 0.5, life: 1.8, vy: 0.6 });
      game.particles.coins(I.x, gy + 1.2, I.z, 10);
      game.audio.play('levelup', { volume: 0.5 });
      game.fox?.react?.('cheer', 1.5);
    };
    if (game.cutscene) {
      await game.cutscene.play({
        shots: [
          { at: { x: I.x, z: I.z }, wupp: 0.034, yaw: game.rig.yaw - 0.4, dur: 1.6, caption: 'New land!', sub: `Plot ${I.px}-${I.pz} · ${PLOT}×${PLOT} tiles` },
          { at: { x: I.x, z: I.z }, wupp: 0.024, yaw: game.rig.yaw + 0.2, dur: 2.2, call: burst, caption: 'SOLD!', sub: I.forest ? 'Send the beavers to clear the trees (Destroy tool)' : 'Ready to build!' },
        ],
      });
    } else burst();
  }

  // corner posts with red flags around every plot you own
  buildPosts() {
    const g = this.game.grid;
    this.group.clear();
    for (const k of this.owned) {
      const [px, pz] = k.split(',').map(Number);
      for (const [cx, cz] of [[0, 0], [PLOT, 0], [0, PLOT], [PLOT, PLOT]]) {
        const x = px * PLOT + cx, z = pz * PLOT + cz;
        const tx = Math.min(g.w - 1, Math.max(0, x - (cx ? 1 : 0))), tz = Math.min(g.h - 1, Math.max(0, z - (cz ? 1 : 0)));
        if (g.kind[tz * g.w + tx] === KIND.WATER) continue;
        const y = g.height[tz * g.w + tx];
        const post = new THREE.Mesh(this.postGeo, this.postMat);
        post.position.set(x + (cx ? -0.1 : 0.1), y + 0.25, z + (cz ? -0.1 : 0.1));
        post.castShadow = true;
        const flag = new THREE.Mesh(this.flagGeo, this.flagMat);
        flag.position.set(0.1, 0.18, 0);
        post.add(flag);
        this.group.add(post);
      }
    }
  }

  // ------------------------------------------------------------ land view (Land tool)
  showOverlay(on) {
    const game = this.game;
    if (!on) { if (this.overlay) { this.overlay.lines.removeFromParent(); this.overlay.tags.forEach((t) => t.el.remove()); this.overlay = null; } return; }
    if (this.overlay) return;
    this.overlay = { lines: new THREE.Group(), tags: [] };
    game.scene.add(this.overlay.lines);
    this.refreshOverlay();
  }

  refreshOverlay() {
    const O = this.overlay;
    if (!O) return;
    const game = this.game;
    const g = game.grid;
    O.lines.clear();
    O.tags.forEach((t) => t.el.remove());
    O.tags = [];
    const draw = (px, pz, color) => {
      const pts = [];
      const y = (x, z) => (g.inb(Math.min(g.w - 1, x), Math.min(g.h - 1, z)) ? Math.max(g.height[Math.min(g.h - 1, z) * g.w + Math.min(g.w - 1, x)], -0.05) + 0.08 : 0.1);
      const x0 = px * PLOT, z0 = pz * PLOT, x1 = x0 + PLOT, z1 = z0 + PLOT;
      const edge = (ax, az, bx, bz) => { for (let k = 0; k < PLOT; k++) { const t0 = k / PLOT, t1 = (k + 1) / PLOT; const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0], p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1]; pts.push(new THREE.Vector3(p0[0], y(Math.floor(p0[0]), Math.floor(p0[1])), p0[1]), new THREE.Vector3(p1[0], y(Math.floor(p1[0]), Math.floor(p1[1])), p1[1])); } };
      edge(x0, z0, x1, z0); edge(x1, z0, x1, z1); edge(x1, z1, x0, z1); edge(x0, z1, x0, z0);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
      line.renderOrder = 40;
      O.lines.add(line);
    };
    for (const k of this.owned) { const [px, pz] = k.split(',').map(Number); draw(px, pz, 0x7aff8a); }
    for (const I of this.forSale()) {
      draw(I.px, I.pz, 0xffd23a);
      const el = document.createElement('div');
      el.className = 'landtag';
      el.innerHTML = `<b>FOR SALE</b><span>${game.ui?.icon?.('coin', 1) || '$'}${I.price}</span>`;
      el.addEventListener('click', (ev) => { ev.stopPropagation(); game.ui?.confirmLand?.(I); });
      (game.ui?.overlay || document.body).appendChild(el);
      O.tags.push({ el, I });
    }
  }

  // DOM tags follow the plots on screen
  update() {
    const O = this.overlay;
    if (!O || !this.game.ui) return;
    const g = this.game.grid;
    for (const t of O.tags) {
      const i = Math.floor(t.I.z) * g.w + Math.floor(t.I.x);
      const q = this.game.ui.screenOf(t.I.x, (g.height[i] || 0) + 0.6, t.I.z);
      t.el.style.display = q.visible === false ? 'none' : '';
      t.el.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px) translate(-50%, -50%)`;
    }
  }

  // ------------------------------------------------------------ save
  serialize() { return [...this.owned]; }
  load(list) {
    this.owned = new Set(Array.isArray(list) ? list : []);
    this.buildPosts();
  }
}
