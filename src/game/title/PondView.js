// [v33 menu] The title backdrop: just your pond. main.js loads your last save behind the menu (if there is
// one), and this only films it: the game's own afternoon light, a slow camera drift over the water, your
// fish swimming. No actors, no cinematic. A new player sees the starter pond with a few fish.
//
//   const v = new PondView(game);  v.start();  v.update(dt);  v.stop();
// The fish simulation runs here (they swim, get hungry, may breed): main.js reloads the page into
// whatever the player picks when a save was loaded, so none of it is ever saved.
import { mountTitleLogo } from './logoTitle.js'; // [v33 title] the 3D title logo (src/game/title/logo3d.js)
const lerp = (a, b, k) => a + (b - a) * k;

export class PondView {
  static isPondView = true; // main.js: load your save behind it (a class name is minified away)
  constructor(game) {
    this.game = game;
    this.T = 0;
    this.active = false;
  }

  /** the middle of your pond: where your fish are, else the starter pond */
  center() {
    const fish = this.game.fish?.list || [];
    if (fish.length) {
      let x = 0, z = 0;
      for (const f of fish) { x += f.x; z += f.z; }
      return { x: x / fish.length, z: z / fish.length };
    }
    return { x: 68.5, z: 36 };
  }

  start() {
    const g = this.game, rig = g.rig;
    this.saved = { wupp: rig.wupp, wuppGoal: rig.wuppGoal, yaw: rig.yaw, yawGoal: rig.yawGoal, goal: rig.goal.clone(), target: rig.target.clone() };
    this.c = this.center();
    rig.lookAt(this.c.x, this.c.z, true);
    rig.wupp = rig.wuppGoal = 0.034;
    this.yaw0 = rig.yawGoal;
    g.state.hour = 14.5; // a bright afternoon
    this.active = true;
    try { this.logo = mountTitleLogo(g); } catch (e) { console.warn('title logo', e); } // [v33 title]
  }

  update(dt) {
    if (!this.active) return;
    this.T += dt;
    const g = this.game, rig = g.rig, t = this.T;
    // a slow drift around the pond, never far from it
    rig.yawGoal = this.yaw0 + Math.sin(t * 0.035) * 0.3;
    rig.goal.x = lerp(rig.goal.x, this.c.x + Math.sin(t * 0.05) * 1.6, 0.02);
    rig.goal.z = lerp(rig.goal.z, this.c.z + Math.cos(t * 0.04) * 1.1, 0.02);
    rig.wuppGoal = 0.034 + Math.sin(t * 0.03) * 0.003;
    g.state.hour = 14.5;
    this.logo?.update(dt); // [v33 title]
    // they swim, but nobody starves while the menu is open
    for (const f of g.fish?.list || []) if (f.hunger > 0.4) f.hunger = 0.4;
    try { g.fish.update(dt); } catch { /* the pond still looks fine without */ }
    try { g.world.sim?.update?.(dt * 0.5, g.wind); } catch { /* water */ }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.logo?.dispose(); this.logo = null; // [v33 title]
    const rig = this.game.rig, s = this.saved;
    rig.wupp = s.wupp; rig.wuppGoal = s.wuppGoal; rig.yaw = s.yaw; rig.yawGoal = s.yawGoal;
    rig.goal.copy(s.goal); rig.target.copy(s.target);
  }
}
