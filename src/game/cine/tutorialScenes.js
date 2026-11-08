// [v31 guide] [v33 tut: the hands-on fish scenes live in src/game/tutorial/fishCourse.js] The day-1 tour's opening
// cutscene, played by game.director (src/game/cine/Director.js): real world, real camera, letterbox.
// [v33 tut2] Reynard's lines go in the tour's dialogue box (Tutorial.boxScene); the old "who are you"
// question and the bears' gossip scenes are cut (the feast is taught in Tutorial.chFeast).
//
//   opening    after Reynard walks out of his hut: a crane over the valley at morning, the title
//              in Alagard, down the bears' trail to his (empty) pond
import { MEADOW } from '../../world/worldgen.js';

/** the middle of the pond (the water tiles of your meadow) */
function pondMid(game) {
  const g = game.grid;
  let sx = 0, sz = 0, n = 0;
  for (let z = MEADOW.z0; z <= MEADOW.z1; z++) for (let x = MEADOW.x0; x <= MEADOW.x1; x++) {
    if (g.inb?.(x, z) && g.isWater(x, z)) { sx += x + 0.5; sz += z + 0.5; n++; }
  }
  return n ? { x: sx / n, z: sz / n } : { x: (MEADOW.x0 + MEADOW.x1) / 2, z: (MEADOW.z0 + MEADOW.z1) / 2 };
}
export const TUT_SCENES = {
  async opening(c) {
    const g = c.game, O = c.office, f = g.fox;
    const P = pondMid(g);
    const home = { x: f.x, z: f.z };
    // the mountain and the tower first, the title over the valley
    await c.shot([O.x, O.z + 4], { zoom: 0.046, cut: true, lift: O.h - 1 });
    c.sfx('day_start', { volume: 0.4 });
    c.title({ kicker: 'REYNARD\'S FISH CO.', title: 'The Bear Must Eat', sub: 'Day 1. One pond. No fish. Big plans.', style: 'gold', y: 0.15, ms: 3600 });
    await c.shot([O.x, O.z + 6], { zoom: 0.04, dur: 2.6, lift: O.h - 3, ease: 'linear' });
    // down the trail the bears will run tomorrow, out over the pond
    c.caption('At 5 PM, the office empties...', { ms: 2600 });
    await c.shot([P.x, P.z - 4], { zoom: 0.034, dur: 2.6 });
    await c.shot([P.x, P.z], { zoom: 0.026, dur: 1.4 });
    // and onto Reynard by the water
    await c.shot([home.x - 0.6, home.z], { zoom: 0.02, dur: 1.4 });
    c.fox.lookAt(P.x, P.z);
    c.center(home.x, home.z);
    await c.say(c.fox, 'This is <b>our pond</b>. The bears will come down that trail from the office to eat here.', { style: 'happy', anim: 'run_point' });
    c.push(0.86, 1.4);
    await c.say(c.fox, 'Right now it has no fish at all. Today we stock it and get it ready for them.', { style: 'say', close: 0.012 });
  },
};
