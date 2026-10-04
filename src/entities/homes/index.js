// [v20 npc homes] One interior builder per neighbour: (kit, { game, v, day, night }) -> spec
// spec: { title, bg, light, npc: { x, z, rot }, fox: { x, z }, greet, bye, chatter, idle, specials, music, update(dt, t, mode) }
import { buildHoot } from './hoot.js';
import { buildShellby } from './shellby.js';
import { buildDale } from './dale.js';
import { buildGranny } from './granny.js';
import { buildRocco } from './rocco.js';
import { buildOtis } from './otis.js';
import { buildClover } from './clover.js';
import { buildHazel } from './hazel.js';
import { buildChip } from './chip.js';
import { buildPip } from './pip.js';

export const HOME_BUILDERS = {
  hoot: buildHoot, shellby: buildShellby, dale: buildDale, granny: buildGranny, rocco: buildRocco,
  otis: buildOtis, clover: buildClover, hazel: buildHazel, chip: buildChip, pip: buildPip,
};
