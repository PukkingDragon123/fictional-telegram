// [v26 seasons] game.seasons: the year, the weather, and what they do to the
// world, the fish, the crops and the bears. See src/game/seasons/Seasons.js
// for the contract other systems code against.
import { Seasons } from '../seasons/Seasons.js';

export function install(game) {
  return new Seasons(game);
}
