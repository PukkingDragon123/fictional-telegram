// Villagers living in the fogged areas: Dale the deer, Granny Ribbit, Professor
// Hoot, Rocco and Grandpa Shellby. Hidden until their area's fog lifts; then
// they idle at home with their props. Tap one for a chat card with what they
// unlocked and a daily gift (claiming it raises friendship hearts).
import * as THREE from 'three';
import { ZONES } from '../data/zones.js';
import { STRUCTURES } from '../data/structures.js';
import { SPECIES_BY_ID } from '../data/species.js';
import { rollGenes } from './genes.js';
import { NpcDialogue } from './NpcDialogue.js'; // [v19 npc]

const c3 = import.meta.glob('../entities/critters3d.js', { eager: true });
const C3 = c3['../entities/critters3d.js'] || {};
const np = import.meta.glob('../entities/npcProps.js', { eager: true });
const NP = np['../entities/npcProps.js'] || {};
const np2 = import.meta.glob('../entities/npcProps2.js', { eager: true });
const NP2 = np2['../entities/npcProps2.js'] || {};
const np3 = import.meta.glob('../entities/npcProps3.js', { eager: true });
const NP3 = np3['../entities/npcProps3.js'] || {};
const np4 = import.meta.glob('../entities/npcProps4.js', { eager: true });
const NP4 = np4['../entities/npcProps4.js'] || {};

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hasAnim = (r, n) => { const A = r?.anims; return !!A && (Array.isArray(A) ? A.includes(n) : !!A[n]); };

// which rig class + voice + what they do when idle
const CAST = {
  dale: { cls: 'DeerGuy', voice: 'deer', specials: ['drink', 'laugh', 'cheers'], seated: true, height: 1.9 },
  granny: { cls: 'FrogGranny', voice: 'beaver', specials: ['sit_knit', 'tongue_catch', 'laugh'], height: 1.4 },
  hoot: { cls: 'OwlRanger', voice: 'bear', specials: ['binoculars', 'head_turn', 'write_notes'], height: 1.6 },
  rocco: { cls: 'RaccoonMerchant', voice: 'fox', specials: ['count_coins', 'rummage', 'show_item'], height: 1.4 },
  shellby: { cls: 'TurtleElder', voice: 'ceo', specials: ['sip_tea', 'doze'], height: 1.3 },
  // the close neighbours
  clover: { cls: 'BunnyGardener', voice: 'cub', specials: ['water_plants', 'dig', 'sniff'], height: 1.6, sign: 'GARDEN' },
  otis: { cls: 'OtterFisher', voice: 'fox', specials: ['cast_line', 'hold_fish', 'juggle_pebble', 'float_back'], height: 1.45, sign: 'OTIS' },
  pip: { cls: 'ChipmunkTrader', voice: 'cub', specials: ['count_logs', 'stuff_cheeks', 'haggle'], height: 1.25, sign: 'LUMBER' },
  chip: { cls: 'WoodpeckerCarpenter', voice: 'cub', specials: ['peck_wood', 'measure', 'saw', 'inspect', 'hammer'], height: 1.45, sign: 'WORKSHOP' },
  hazel: { cls: 'HedgehogBaker', voice: 'cub', specials: ['roll_dough', 'taste', 'curl_up'], height: 1.5, sign: 'BAKERY' },
};

function fallbackRig(color) {
  const root = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.4), m);
  body.position.y = 0.45;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.38), m);
  head.position.y = 1.0;
  root.add(body, head);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, play() {}, update() {}, setExpression() {}, dispose() {}, current: 'idle', anims: {} };
}

export class Villagers {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.talk = new NpcDialogue(game); // [v19 npc] topics + choices + friendship
    this.list = ZONES.map((Z) => ({ zone: Z, id: Z.npc.id, name: Z.npc.name, x: Z.npc.x, z: Z.npc.z, y: 0, rig: null, props: null, t: 4 + Math.random() * 6, cast: CAST[Z.npc.id] || {} }));
  }

  get(id) { return this.list.find((v) => v.id === id) || null; }

  ensure(v) {
    if (v.rig) return;
    const game = this.game;
    const g = game.grid;
    // nudge onto a free land tile near the planned spot
    let best = null, bd = 1e9;
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = Math.floor(v.x) + dx, z = Math.floor(v.z) + dz;
        if (!g.inb(x, z) || g.isWater(x, z)) continue;
        const i = z * g.w + x;
        if (g.occ[i] >= 0 || g.occ[i] === -2) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; }
      }
    if (best) { v.x = best.x; v.z = best.z; }
    v.y = g.groundAt(v.x, v.z);
    const Cls = C3[v.cast.cls];
    try { v.rig = Cls ? new Cls() : fallbackRig(v.zone.npc.color); } catch (e) { console.warn('villager rig', v.id, e); v.rig = fallbackRig(v.zone.npc.color); }
    v.rig.root.position.set(v.x, v.y, v.z);
    v.rig.root.rotation.y = 0.3; // face the camera-ish (+Z)
    this.group.add(v.rig.root);
    v.props = this.makeProps(v);
    this.idle(v);
  }

  makeProps(v) {
    const game = this.game;
    const g = new THREE.Group();
    const put = (obj, dx, dz, ry = 0) => { if (!obj) return; obj.position.set(v.x + dx, game.grid.groundAt(v.x + dx, v.z + dz), v.z + dz); obj.rotation.y = ry; g.add(obj); };
    const tryMake = (fn, ...a) => { try { return fn ? fn(...a) : null; } catch (e) { console.warn('prop', e); return null; } };
    if (v.id === 'dale') {
      // Dale lounges in his lawn chair by the river with a cooler of Daisy Beer
      const chair = tryMake(C3.makeLawnChair, 'green');
      if (chair) { put(chair, 0, 0, 0.3); v.seat = C3.LAWN_CHAIR_SEAT ?? 0.3; }
      put(tryMake(C3.makeCooler), 0.8, 0.2, -0.4);
    } else if (v.id === 'granny') {
      const rc = tryMake(NP.makeRockingChair);
      if (rc) { put(rc, 0, 0, 0.3); v.seat = NP.ROCKING_CHAIR_SEAT ?? null; try { v.rig.useChair?.(rc); } catch { /* ignore */ } }
      put(tryMake(NP.makeBugJarShelf), -1.1, -0.4, 0.2);
    } else if (v.id === 'hoot') put(tryMake(NP.makeTelescope), 1.0, -0.3, -0.6);
    else if (v.id === 'rocco') put(tryMake(NP.makeMerchantStall), -1.2, -0.6, 0.15);
    else if (v.id === 'shellby') put(tryMake(NP.makeTeaTable), 0.9, 0.1, -0.2);
    else if (v.id === 'clover') put(tryMake(NP2.makeGardenPatch), 1.15, -0.45, 0.05);
    else if (v.id === 'pip') {
      const mill = tryMake(NP4.makeLumberMill);
      put(mill, 0.45, -0.7, 0); // Pip stands in front of the door
      put(tryMake(NP4.makeLumberCart), 1.5, 0.55, -0.6);
      if (mill?.userData?.update) v.propUpdate = mill.userData.update;
    }
    else if (v.id === 'chip') {
      put(tryMake(NP3.makeTreeHouse), -0.7, -1.45, 0); // he stands front-right of his door
      put(tryMake(NP3.makeWorkbench), 1.6, 0.15, -0.3);
    }
    else if (v.id === 'hazel') put(tryMake(NP2.makeBakeryCart), 1.1, -0.55, 0.0);
    else if (v.id === 'otis') {
      const dock = tryMake(NP2.makeFishingDock);
      put(dock, 0.85, 0.0, Math.PI + 0.3); // the jetty and its little pond run out front-right of him
      if (dock && v.rig.castTarget && dock.userData.cast) {
        v.rig.root.updateMatrixWorld(true); dock.updateMatrixWorld(true);
        v.rig.castTarget.copy(dock.localToWorld(dock.userData.cast.clone()));
        v.rig.root.worldToLocal(v.rig.castTarget);
      }
    }
    put(tryMake(NP.makeSignpost, v.cast.sign || v.name.split(' ').pop().toUpperCase()), v.id === 'rocco' ? 1.3 : -1.4, 1.1, 0.2);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g);
    return g;
  }

  idle(v) {
    const r = v.rig;
    if (!r) return;
    if (v.id === 'dale' && hasAnim(r, 'sit_chair')) { r.play('sit_chair', { loop: true }); return; }
    if (v.id === 'granny' && hasAnim(r, 'sit_knit') && v.seat != null) { r.play('sit_knit', { loop: true }); return; }
    r.play?.('idle', { loop: true });
  }

  revealed(Z) {
    const v = this.list.find((x) => x.zone === Z);
    if (!v) return;
    this.homestead(v);
    this.ensure(v);
    v.rig.root.visible = true;
    if (v.props) v.props.visible = true;
  }

  // a little clearing around the villager's spot so you can actually see them
  homestead(v) {
    const B = this.game.beavers;
    if (!B?.clearInstant || v.cleared) return;
    v.cleared = true;
    // an oval that opens towards the camera (south), so tall trees don't hide them
    let n = 0;
    for (let dz = -3; dz <= 8; dz++)
      for (let dx = -5; dx <= 5; dx++) {
        const ez = dz < 0 ? dz / 3 : dz / 8;
        if ((dx / 4.6) ** 2 + ez * ez > 1) continue;
        const x = Math.floor(v.x) + dx, z = Math.floor(v.z) + dz;
        if (B.clearInstant(x, z)) n++;
        (this.homeTiles ||= new Set()).add(z * this.game.grid.w + x);
      }
    if (n) this.game.particles.puff?.(v.x, this.game.grid.groundAt(v.x, v.z) + 0.6, v.z, 18, 0.8);
  }

  anchor(v) { return { getWorldPos: (p) => p.set(v.x, v.y + (v.cast.height || 1.6) + 0.35, v.z) }; }

  sayLine(v, text, opts = {}) {
    return this.game.say(this.anchor(v), text, { voice: v.cast.voice || 'fox', mood: 'happy', size: 'm', key: 'npc' + v.id, ...opts });
  }

  async intro(v) {
    const r = v.rig;
    r?.play?.('wave', { loop: false, onDone: () => this.idle(v) });
    for (const line of v.zone.intro) {
      r?.play?.('talk', { loop: true });
      const h = this.sayLine(v, line, { wait: true });
      if (h?.done) await Promise.race([h.done, wait(8)]);
      else await wait(2.2);
    }
    r?.play?.('happy', { loop: false, onDone: () => this.idle(v) });
    this.game.say(this.game.ui?.foxAnchorWorld?.() || { getWorldPos: (p) => p.set(this.game.fox.x, this.game.fox.y + 1.75, this.game.fox.z) }, pick(['A new friend! (Customer.)', 'Friends = discounts!', 'Pleasure doing business!']), { voice: 'fox', mood: 'happy', dur: 2.4 });
    const st = this.vstate(v);
    st.met = true;
  }

  vstate(v) { return this.talk.state(v); } // [v19 npc] friendship 0..10 (hearts = friend / 2)

  giftReady(v) { return this.vstate(v).giftDay !== this.game.state.day; }

  // tap: chat card with unlocks + the daily gift
  open(v) {
    const game = this.game;
    // [npc cutscenes] the first tap plays a short welcome scene, then comes back here
    if (game.npcScenes?.firstVisit?.(v)) return;
    // [v19 npc] Pip and Chip get the same chat card; their counter / workshop is the first offer
    const ui = game.ui;
    const st = this.vstate(v);
    const Z = v.zone;
    const VC = ui?.comp?.('VillagerCard');
    v.rig?.play?.('wave', { loop: false, onDone: () => this.idle(v) });
    game.audio.play('pop_in', { volume: 0.4 });
    const greet = { pip: ['Step right up, partner!', 'Fresh price today!'], chip: ['Tok-tok! Come in, come in!', 'What are we building today?'] }[v.id];
    const lines = [pick(greet || Z.lines), ...(v.id === 'hoot' ? [`Bird log: ${(game.state.birdsSpotted || []).length} species. Tap birds to spot them!`] : []), ...(this.giftReady(v) ? ['Got a little something for you today!'] : [])];
    if (!VC?.openVillager) {
      this.sayLine(v, lines[0], { dur: 3 });
      if (this.giftReady(v)) this.claimGift(v);
      return;
    }
    const offers = Z.unlocks.map((u) => ({ icon: u.icon, title: u.title, desc: this.unlockDesc(u), tag: 'UNLOCKED' }));
    // [v19 npc] the shop panels open from the card
    const panel = (fn) => () => { this.card?.close?.(); setTimeout(fn, 380); };
    if (v.id === 'pip' && game.pipVisit) offers.unshift({ icon: 'tree', title: 'Sell logs', desc: `Today: ${game.pipVisit.price?.() ?? '?'} coins a log`, tag: 'OPEN', onClick: panel(() => game.pipVisit.openTrade()) });
    if (v.id === 'chip' && game.workshop) offers.unshift({ icon: 'hammer', title: 'Open the workshop', desc: 'Furniture orders and repairs', tag: 'OPEN', onClick: panel(() => game.workshop.open()) });
    if (this.card) this.card.close?.();
    const talk = this.talk;
    let card = null;
    this.card = card = VC.openVillager(ui.root, {
      npc: v.id, name: v.name, title: Z.npc.title, lines, offers, hearts: st.hearts,
      topics: talk.topics(v), onTopic: (id, card) => talk.showTopic(v, id, card),
      gift: { ready: this.giftReady(v), label: this.giftLabel(v), onClaim: () => this.claimGift(v) },
      sfx: (n, o) => game.audio.play(n, { volume: 0.35, ...(o || {}) }),
      icon: (n, sc) => ui.icon?.(n, sc) || '',
      onClose: () => { if (this.card === card) this.card = null; }, // [v19 npc] a late close must not drop the next card
    });
    v.rig?.play?.('talk', { loop: true });
    setTimeout(() => this.idle(v), 3500);
  }

  unlockDesc(u) {
    if (u.kind === 'species') return u.ids.map((id) => SPECIES_BY_ID[id]?.name).filter(Boolean).join(', ') + ' — on e-Buy now';
    if (u.kind === 'build') return u.ids.map((id) => STRUCTURES[id]?.name).filter(Boolean).join(', ') + ' — in Build & e-Buy';
    if (u.kind === 'breed') return 'Find it in e-Buy ▸ Farm';
    if (u.kind === 'feature') return 'New in the Build menu!';
    return 'Active!';
  }

  giftLabel(v) {
    const G = v.zone.gift;
    const parts = [`${G.coins} coins`];
    if (G.wood) parts.push(`${G.wood} wood`);
    if (G.items?.length) parts.push(STRUCTURES[G.items[this.game.state.day % G.items.length]]?.name || 'a present');
    for (const f of G.food || []) parts.push(`${f.n || 1} ${this.game.foodStore?.info?.(f.id)?.name || f.id}`);
    if (G.egg) parts.push(G.eggPool ? 'a fish egg' : 'an ancient egg');
    return parts.join(' + ');
  }

  claimGift(v) {
    const game = this.game;
    if (!this.giftReady(v)) return false;
    const st = this.vstate(v);
    const G = v.zone.gift;
    st.giftDay = game.state.day;
    this.talk.addFriend(v, 1); // [v19 npc]
    this.card?.update?.({ hearts: st.hearts });
    game.earnMisc(G.coins, 'gifts');
    if (G.wood) { game.state.wood = (game.state.wood || 0) + G.wood; game.emit('wood', game.state.wood); }
    if (G.items?.length) {
      const type = G.items[game.state.day % G.items.length];
      const inv = (game.state.inventory ||= {});
      inv[type] = (inv[type] || 0) + 1;
      game.emit('inventory', inv);
    }
    for (const f of G.food || []) {
      game.foodStore?.add?.(f.id, f.n || 1);
      game.ui?.floatTextAt?.(v.x, v.y + 1.6, v.z, `+${f.n || 1} ${game.foodStore?.info?.(f.id)?.name || f.id}`, '#fff3a0');
    }
    if (G.egg) {
      const pool = (G.eggPool || ['gar', 'paddlefish', 'eel', 'sturgeon', 'bowfin']).filter((id) => SPECIES_BY_ID[id] && game.speciesUnlocked(id));
      const id = pool.length ? pick(pool) : 'bluegill';
      try { game.fish.addBoughtEgg(id, rollGenes(id, game.mods), 40); game.notify(`${SPECIES_BY_ID[id].name} egg in the pond!`, 'excited'); } catch (e) { console.warn(e); }
    }
    v.rig?.play?.('happy', { loop: false, onDone: () => this.idle(v) });
    game.particles.confetti(v.x, v.y + 1.2, v.z, 30);
    game.audio.play('coins', { volume: 0.5 });
    game.save();
    return true;
  }

  // screen pick for taps
  pick(sx, sy, ui) {
    let best = null, bd = 40 * 40;
    for (const v of this.list) {
      if (!v.rig || !v.rig.root.visible) continue;
      const p = ui.screenOf(v.x, v.y + 0.8, v.z);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  update(dt) {
    const game = this.game;
    for (const v of this.list) {
      const open = game.zones?.isOpen(v.zone.id);
      if (!open) { if (v.rig) v.rig.root.visible = false; continue; }
      if (!v.cleared || !v.rig) this.revealed(v.zone);
      // only animate when near the camera
      const near = Math.hypot(v.x - game.rig.target.x, v.z - game.rig.target.z) < 40;
      v.rig.root.visible = true;
      if (!near) continue;
      v.t -= dt;
      if (v.t <= 0) {
        v.t = 7 + Math.random() * 8;
        const sp = v.cast.specials?.filter((n) => hasAnim(v.rig, n)) || [];
        if (sp.length && !this.card) {
          const n = pick(sp);
          const loop = n === 'doze' || n === 'sit_knit';
          v.rig.play(n, { loop, onDone: loop ? undefined : () => this.idle(v) });
          if (loop) setTimeout(() => { if (v.rig?.current === n) { v.rig.play(n === 'doze' && hasAnim(v.rig, 'wake') ? 'wake' : 'idle', { loop: false, onDone: () => this.idle(v) }); } }, 6000);
        }
        if (Math.random() < 0.25 && Math.hypot(v.x - game.rig.target.x, v.z - game.rig.target.z) < 14) this.sayLine(v, pick(v.zone.lines), { dur: 2.6 });
      }
      v.rig.update?.(dt);
      v.propUpdate?.(dt);
    }
  }

  onLoad() {
    for (const v of this.list) if (this.game.zones?.isOpen(v.zone.id)) this.revealed(v.zone);
  }
}
