// [v32 dive] THE DIVE (game.dive): Loon Lake, Noodles the otter's catch, Chief Buff's dive
// lessons, the underwater scene and the fish farms. The system lives in src/game/dive/.
import { DiveSystem } from '../dive/DiveSystem.js';

export function install(game) { return new DiveSystem(game); }
