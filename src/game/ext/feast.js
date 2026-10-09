// [v26 feast] game.feast: the free-camera 5 PM feast + its event director.
// The system lives in src/game/feast/FeastSystem.js, the events in
// src/game/feastEvents/*.js (see the README there), the overlay in src/ui/FeastUI.js.
import { FeastSystem } from '../feast/FeastSystem.js';

export function install(game) {
  return new FeastSystem(game);
}
