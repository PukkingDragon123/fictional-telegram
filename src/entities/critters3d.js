// Voxel critters in the foxRig style (0.05 voxels, Lambert + per-voxel grain,
// canvas pixel faces, keyframed procedural animations with crossfades, jiggle
// springs on fixed 1/60 s substeps). Root at the feet, facing +Z.
//
// Every character: { root, play(name, { loop, fade, speed, onDone, restart }), current, anims, expressions,
//                    setExpression(name, { hold }), update(dt), dispose(), onEvent(name, rig, data) }
//   MooseCourier  ride ring_bell brake hop_off toss_package wave thumbs_up hop_on ride_away (+ idle_bike, idle)
//                 hold(obj, 'basket' | 'hand'), held, speed (ground speed: move the root by it), mounted
//   DeerGuy       idle sit_chair drink laugh point_laugh wave cheers stand (+ walk); seated, showCan(on)
//   Duck          new Duck({ sex: 'm' | 'f' })  waddle peck quack flap swim chase_flee sit (+ idle)
//   BeaverRig     idle run chop carry_log hammer eat_berry cheer sleep swim plow wave
//                 expressions happy focused sleepy love surprised; events chop_hit hammer_hit step munch
// Geometry is built lazily on first use and shared (ref counted) between instances.
export { MooseCourier, MOOSE_STAND_X } from './critterMoose.js';
export { DeerGuy } from './critterDeer.js';
export { Duck } from './critterDuck.js';
export { BeaverRig, BEAVER_CHOP_DIST, BEAVER_HAMMER_DIST } from './critterBeaver.js';
export { makePackage, makeLawnChair, makeDaisyBeerCan, makeCooler, LAWN_CHAIR_SEAT } from './critterProps.js';
export { makeBicycle, BIKE } from './critterBike.js';
