# THE HUNGER — a giant made of roaches

A one-minute pixel-art horror film (1280×720, 30 fps, with sound). It is set in a real 3D valley that is drawn the way a pixel artist would paint it.

**The story.**
1. It's night over the rice fields at the foot of the mountains: young rice in rows, the moon in the flooded fields, fireflies.
2. One cockroach sits on a dike, cleaning its feelers. It turns and looks at you.
3. The water starts to boil. Roaches come up out of it everywhere, and as they feed on the rice it browns and slumps and they grow, from the length of a finger to the length of a cart.
4. They spread over the fields in a black tide, and lights of life lift out of everything they touch. The moon goes red.
5. They turn, run back in, and climb each other to build it: a man a hundred and twenty metres tall, skinny past starving, with arms far too long and a beautiful face.
6. They crawl off its face. It opens its eyes and smiles.
7. It breathes in, and the valley dies in a ring around it.
8. It walks wrong: loose, its spine swaying, its arms flopping and rippling, its head snapping from angle to angle. Every step kills the ground and shakes the trees, and roaches rain off it.
9. It drinks the old pine dry and the pine falls.
10. It turns its face to you. Its smile keeps going, its jaw comes off its hinges, and they pour out. It reaches for you.

## How it's made

**3D that reads as 2D (`hd2d.py`).** Everything is drawn at 640×360 into a g-buffer, which holds per pixel:
- depth, normal and material;
- the object it belongs to;
- variation, surface coordinates, colour and occlusion.

These draw into it:

| Drawer | What it draws |
|---|---|
| Triangle rasterizer | the land and the water |
| Ray-cast capsules | trunks, branches, grass, rice, dikes, the creature's bones |
| Ray-cast ellipsoids | leaves, stones, the creature's body |
| A ray-marched distance field | the creature's face |
| Billboards | pixel-art sprites |

Then it is lit like pixel art:
- Moonlight is cut into six bands, with ordered dither where the bands meet.
- Each band is a hue-shifted colour.
- Shadows come from shadow maps, one of which follows the giant.
- A rim light comes from the moon, and a soft fill from the camera.
- Every edge where something stands in front of something else gets a dark line.

**The valley (`terrain.py`, `world.py`, `flora.py`, `valley.py`).**
- **Land:** a 16 km valley of gradient-noise ranges worn by simulated rain, with snow on the peaks.
- **Rice fields:** flooded and levelled, banked with dikes, planted in rows. Close up, each seedling is a clump of blades; far off, the rows are drawn into the water.
- **Lake and fields:** both reflect the whole world upside down, broken by ripples, with the moon's road glittering. Rings spread where roaches surface.
- **Sky:** banded and dithered, with stars, cloud lit on the moon's side, and a moon with seas and craters.
- **Air:** blue haze far off and mist lying low.
- **Trees:** grown as real skeletons (cedar, zelkova, maple, black pine). Their crowns are made of individually turned and lit leaves, darker deep inside the crown and glowing where the moon comes through. Further off they are drawn as clumps, and far off as a few clumps on a stick.
- **The pack's own art:** the teahouse pack's pixel-art flowers and pampas stand in the meadows as billboards (`sprites2d.py`).
- **Death:** everything alive has a dying state, so the drain can pass over it.

**The roaches (`roach2d.py`).** Every roach is a pixel-art sprite, made from a small model of an American cockroach for its size, the angle it is seen from, its heading and its step:
- folded glossy wings with the seam, veins and highlight;
- the dark shield behind the head with its pale ring;
- six spiny legs walking in a tripod gait;
- antennae longer than the body.

Each sprite is drawn eight times too big as labelled parts, brought down part by part so legs and feelers stay a pixel wide, coloured from the pack's palette and outlined. About 4,300 are made once and cached. The first roach, seen close, gets its own full-size sprites.

**The creature (`creature.py`, `face_sdf.py`).**
- **Body:** pale skin over ribs, collarbones, hip bones and knobbed knees; stilt legs; 60 m arms with too many joints; long twitching fingers.
- **Face:** one sculpted surface, ray-marched: brow, high cheekbones over hollow cheeks, a narrow nose, a hard jaw, lips, and eyes set deep under heavy lids. Its grin is cut too wide and lined with too many teeth. The jaw comes unhinged.
- **The roaches on it:** they cover it evenly while they build it. Then each crawls to its place in one of the bands that wind around its limbs, ribs and neck like living bandages, plus a cap over the skull and a band across the jaw.
- **Movement:** its spine, neck and arms are chains simulated with inertia and gravity. The spine sways like a snake standing up, the arms swing and ripple like seaweed, and the head snaps to new angles and overshoots on springs. The legs lift high and buckle. It is all simulated once over the whole timeline and kept.

**The physics (`physics.py`).**
- **The swarm:** a flock. Each roach keeps its distance from its neighbours, turns with them, and steers out over the fields while it feeds, then back to the feet of the thing it is becoming. It grows as it feeds.
- **The pine:** a rigid body falling around its foot under gravity, bouncing when it lands.
- **The camera:** a spring knocked by footsteps, the breath and the pine's fall.
- **The trees:** each rings from the footsteps near it.

`film.py` holds the shots and the effects:
- the life drain, motes of life, fireflies and falling leaves;
- roaches dropping off the creature, tumbling and bouncing;
- clods and dust at its feet, roaches pouring from its mouth and crawling over the lens;
- depth of field, bloom, burning eyes and the title.

`sound.py` synthesizes the soundtrack. `timeline.py` says when everything happens.

```
python film.py raw.mp4                  # the film, silent (builds .cache/ the first time)
python sound.py hunger.wav              # its soundtrack
ffmpeg -i raw.mp4 -i hunger.wav -c:v copy -c:a aac -b:a 128k -shortest THE_HUNGER.mp4
python film.py --still 4 30 54          # test frames (seconds)
```
