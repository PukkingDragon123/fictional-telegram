// Pip the chipmunk, lumber trader. On the morning of Day 2 he comes down the
// trail pushing his lumber cart, explains the wood business (garage, Chip's
// furniture, selling logs to him) and the Terraform kit, then the fog over
// his mill lifts and he moves in there. Tap him at the mill to sell wood.
import * as THREE from 'three';
import { HUT, MEADOW } from '../world/worldgen.js';
import { ZONE_BY_ID } from '../data/zones.js';

const c3 = import.meta.glob('../entities/critters3d.js', { eager: true });
const C3 = c3['../entities/critters3d.js'] || {};
const np4 = import.meta.glob('../entities/npcProps4.js', { eager: true });
const NP4 = np4['../entities/npcProps4.js'] || {};
const tr = import.meta.glob('../ui/LumberTrade.js', { eager: true });
const ntk = import.meta.glob('../ui/NpcTalk3D.js', { eager: true }); // [v19 npc] live 3D Pip at the counter
const createNpcTalk = ntk['../ui/NpcTalk3D.js']?.createNpcTalk || null;
const TR = tr['../ui/LumberTrade.js'] || null;
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

export class PipVisit {
  constructor(game) {
    this.game = game;
    this.checkT = 2;
    this.busy = false;
    game.on('zone', (Z) => { if (Z?.id === 'mill') this.onMillOpen(); });
  }

  // today's log price: 5..9 coins, changes every day
  price() {
    const d = this.game.state.day || 1;
    return 5 + Math.floor((Math.sin(d * 12.9898) * 43758.5453 % 1 + 1) % 1 * 5);
  }

  onMillOpen() {
    const game = this.game;
    game.state.pipCame = true;
    game.unlockFeature('terraform');
  }

  update(dt) {
    const game = this.game;
    if (this.busy) { this.tick?.(dt); return; }
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1.5;
    const st = game.state;
    if (st.pipCame || (st.day || 1) < 2) return;
    if (!(st.tutorialDone || game.skipTutorial) || game.tutorial?.active || game.cutscene?.active || game.titleMode) return;
    if (st.phase !== 'day' && st.phase !== 'morning') return;
    // he comes down the trail in the morning, never right before the evening rush
    if (st.phase === 'day' && (st.hour || 0) >= 13) return;
    if ((st.zones || []).includes('mill')) { this.onMillOpen(); return; }
    this.arrive().catch((e) => { console.warn('pip visit', e); this.busy = false; this.tick = null; st.pipCame = true; game.unlockFeature('terraform'); });
  }

  // the walk down the trail with the cart, a chat at the hut, then off to the mill
  async arrive() {
    const game = this.game;
    this.busy = true;
    game.state.pipCame = true;
    const g = game.grid;
    const start = { x: HUT.x + 0.5, z: MEADOW.z0 - 1.5 };
    const stop = { x: HUT.x + 3.2, z: HUT.z + 2.6 };
    let rig = null;
    try { rig = C3.ChipmunkTrader ? new C3.ChipmunkTrader() : null; } catch (e) { console.warn('pip rig', e); }
    if (!rig) {
      const root = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.35), new THREE.MeshLambertMaterial({ color: 0xb8783a }));
      m.position.y = 0.3; root.add(m);
      rig = { root, play() {}, update() {} };
    }
    let cart = null;
    try { cart = NP4.makeLumberCart ? NP4.makeLumberCart() : null; } catch { cart = null; }
    const grp = new THREE.Group();
    grp.add(rig.root);
    if (cart) { if (rig.attachCart) rig.attachCart(cart); else { cart.position.set(0, 0, 0.75); grp.add(cart); } }
    game.scene.add(grp);
    const pos = { x: start.x, z: start.z };
    const place = () => {
      grp.position.set(pos.x, g.groundAt(pos.x, pos.z), pos.z);
      grp.rotation.y = Math.atan2(stop.x - start.x, stop.z - start.z);
    };
    place();
    const SPEED = 1.0;
    rig.play?.(rig.attachCart ? 'push_cart' : 'walk', { loop: true, speed: SPEED / (C3.PIP_CART_SPEED || 0.55) });
    // walk while the camera watches (driven by the game loop)
    let walking = true;
    this.tick = (dt) => {
      rig.update?.(dt);
      if (!walking) return;
      const dx = stop.x - pos.x, dz = stop.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { walking = false; rig.play?.('cart_rest', { loop: true }); return; }
      const v = Math.min(d, dt * SPEED);
      pos.x += (dx / d) * v; pos.z += (dz / d) * v;
      place();
    };
    const anchor = { getWorldPos: (v) => v.set(pos.x, g.groundAt(pos.x, pos.z) + 1.45, pos.z) };
    const say = async (t, dur = 3.2) => {
      rig.play?.('talk', { loop: true });
      const h = game.say(anchor, t, { voice: 'cub', mood: 'happy', size: 'm', key: 'pip', wait: true, dur });
      if (h?.done) await Promise.race([h.done, wait(dur + 4)]); else await wait(dur);
    };
    game.notify('Someone is coming down the trail...', 'thinking', { dur: 3 });
    await game.cutscene.play({
      shots: [
        { at: { x: start.x, z: start.z + 1 }, wupp: 0.022, cut: true, dur: 2.4, caption: 'Day 2: a visitor!', sub: 'Pip the chipmunk, lumber trader' },
        { at: () => ({ x: pos.x, z: pos.z + 0.6 }), wupp: 0.02, dur: 9 },
      ],
      skippable: true,
    });
    // in case the walk got cut short, finish it
    pos.x = stop.x; pos.z = stop.z; place(); walking = false;
    game.rig.lookAt(pos.x, pos.z + 0.5);
    game.rig.wuppGoal = 0.02;
    try { rig.parkCart?.(grp); } catch { /* ignore */ }
    rig.play?.('wave', { loop: false, onDone: () => rig.play?.('idle', { loop: true }) });
    await say('Howdy, neighbour! Name\'s Pip. I buy LOGS!');
    await say('Chop trees, beavers haul the logs to your Wood Garage...');
    await say('...then Chip turns wood into furniture. Or sell it to me for cash!');
    await say('And here: my Terraform kit! Hills, paths, even new ponds.');
    rig.play?.(rig.anims?.includes?.('haggle') ? 'haggle' : 'happy', { loop: false });
    await say('Come visit my mill, just south of your pond!', 2.6);
    game.unlockFeature('terraform');
    // he heads off; the fog over his mill lifts
    grp.removeFromParent();
    this.tick = null;
    this.busy = false;
    const Z = ZONE_BY_ID.mill;
    if (Z && !game.zones.isOpen('mill')) await game.zones.reveal(Z, { x: Z.cx, z: Z.cz - Z.r });
    this.onMillOpen();
    game.emit('pipArrived');
    game.save();
  }

  // tap Pip at his mill: the lumber counter
  openTrade() {
    const game = this.game;
    if (this.view) return;
    const st = game.state;
    if (!TR?.openLumberTrade) {
      // fallback: sell everything at today's price
      const n = Math.floor(st.wood || 0);
      if (!n) { game.notify('Pip: "No logs? Chop some trees, partner!"', 'no'); return; }
      st.wood -= n; game.earnMisc(n * this.price(), 'trade');
      game.notify(`Sold ${n} logs to Pip for ${n * this.price()} coins!`, 'excited');
      return;
    }
    const wasPaused = st.paused;
    st.paused = true;
    // [v19 npc] Pip's booth shows his real 3D rig (crisp: integer device px per rendered px)
    const pipEl = document.createElement('div');
    pipEl.className = 'lt-pip3d';
    pipEl.style.cssText = 'position:relative;width:64px;height:76px;';
    let p3 = null;
    this.view = TR.openLumberTrade(game.ui?.root || document.body, {
      chipEl: pipEl,
      onTalk: (t) => { p3?.talk(t); try { game.audio.babble?.('cub', t, { pitch: 1.4, volume: 0.4 }); } catch { /* ignore */ } },
      wood: Math.floor(st.wood || 0),
      price: this.price(),
      chat: ['Logs, logs, lovely logs!', `Today: ${this.price()} coins a log!`, 'Keep some for Chip, eh?'],
      icon: (n, sc) => game.ui?.icon?.(n, sc) || '',
      sfx: (n, o) => game.audio.play(n, { volume: 0.45, ...(o || {}) }),
      onSell: (n) => {
        const have = Math.floor(st.wood || 0);
        n = Math.min(n, have);
        if (n <= 0) return { ok: false, msg: 'No logs to sell!' };
        const coins = n * this.price();
        st.wood = have - n;
        game.earnMisc(coins, 'trade');
        game.emit('woodSold', { n, coins });
        p3?.play?.(n >= 10 ? 'happy' : 'count_logs'); // [v19 npc]
        this.view?.refresh?.({ wood: Math.floor(st.wood), price: this.price() });
        return { ok: true, msg: `+${coins} coins!`, coins };
      },
      onClose: () => { this.view = null; st.paused = wasPaused; p3?.dispose(); p3 = null; },
    });
    try { p3 = createNpcTalk?.(pipEl, { npc: 'pip', frame: 'half', ps: 0.5, turn: 0.35 }) || null; } catch (e) { console.warn('pip 3d', e); }

  }
}
