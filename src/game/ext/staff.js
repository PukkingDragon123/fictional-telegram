// [v26 staff] game.staff: hired beavers (see src/game/staff/StaffSystem.js for the API).
import { StaffSystem } from '../staff/StaffSystem.js';

export function install(game) {
  return new StaffSystem(game);
}
