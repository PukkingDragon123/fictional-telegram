// Voxel critters in the foxRig style (0.05 voxels, Lambert + per-voxel grain,
// canvas pixel faces, keyframed procedural animations with crossfades, jiggle
// springs on fixed 1/60 s substeps). Root at the feet, facing +Z.
//
// Every character: { root, play(name, { loop, fade, speed, onDone, restart }), current, anims, expressions,
//                    setExpression(name, { hold }), update(dt), dispose(), onEvent(name, rig, data) }
//   MooseCourier  ride ring_bell brake hop_off toss_package wave thumbs_up hop_on ride_away (+ idle_bike, idle)
//                 hold(obj, 'basket' | 'hand'), held, speed (ground speed: move the root by it), mounted
//   DeerGuy       idle sit_chair drink laugh point_laugh wave cheers stand talk (+ walk); seated, showCan(on)
//   FrogGranny / OwlRanger / RaccoonMerchant / TurtleElder: villagers (idle wave talk laugh walk happy + specials)
//   Duck          new Duck({ sex, breed: 'mallard' | 'pekin' | 'wood' })  idle waddle peck quack(=honk) flap swim dive chase_flee sit sleep brood; one-shots eat happy
//   Goose         new Goose({ sex, breed: 'canada' | 'snow' })  idle waddle swim peck honk(=quack) flap sit sleep brood chase hiss; one-shots eat happy
//   Chick         new Chick({ kind: 'duckling' | 'gosling', breed })  idle waddle follow swim peck sleep peep(=honk); one-shots eat happy
//   makeNest('duck' | 'goose') -> { root, setEggs(n, { colors }), setBrooding, setGolden, setHatching, eggPosition, update, dispose }; makeEggMesh(kind, opts)
//   BeaverRig     idle run chop carry_log hammer eat_berry cheer sleep swim plow wave
//                 expressions happy focused sleepy love surprised; events chop_hit hammer_hit step munch
// Geometry is built lazily on first use and shared (ref counted) between instances.
export { MooseCourier, MOOSE_STAND_X } from './critterMoose.js';
export { DeerGuy } from './critterDeer.js';
export { FrogGranny } from './critterFrog.js';
export { OwlRanger } from './critterOwl.js';
export { RaccoonMerchant } from './critterRaccoon.js';
export { TurtleElder } from './critterTurtle.js';
export { Duck, DUCK_ANIMS, DUCK_BREEDS } from './critterDuck.js';
export { Goose, GOOSE_ANIMS, GOOSE_BREEDS } from './critterGoose.js';
export { Chick, CHICK_ANIMS, CHICK_BREEDS, CHICK_SIZE } from './critterChick.js';
export { makeNest, makeEggMesh, NEST_KINDS, NEST_SIZE } from './critterNest.js';
export { BeaverRig, BEAVER_CHOP_DIST, BEAVER_HAMMER_DIST } from './critterBeaver.js';
export { makePackage, makeLawnChair, makeDaisyBeerCan, makeCooler, LAWN_CHAIR_SEAT } from './critterProps.js';
export { makeBicycle, BIKE } from './critterBike.js';
export { BunnyGardener } from './critterBunny.js';
export { OtterFisher } from './critterOtter.js';
export { HedgehogBaker } from './critterHedgehog.js';
export { WoodpeckerCarpenter } from './critterWoodpecker.js';
export { ChipmunkTrader, CHIPMUNK_ANIMS, PIP_WALK_SPEED, PIP_CART_SPEED, PIP_CART_Z } from './critterChipmunk.js';
