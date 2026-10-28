# THE HUNGER — a giant made of roaches

A one-minute pixel-art horror film (1280×720, 30 fps, with sound). It is set in a real 3D valley that is drawn the way a pixel artist would paint it.

**The story.** It is night over the valley and everything is alive:
- fireflies over the lake;
- the moon glittering on the water;
- spider lilies in the grass;
- the old pine standing alone.

The ground splits. One roach the size of a cart pulls itself out of the crack, feeling the air. Then a hundred follow, then a black tide of thousands pours across the meadow. Where it runs, the grass bleaches and dies, and little lights of life lift out of it and are pulled into the crack. The moon goes red.

The tide turns and runs back, and climbs itself: feet, legs, a body, arms, a head. It is a gaunt man a hundred metres tall, made of roaches crawling over each other, and its eyes catch fire. It breathes in, and the valley dies in a ring around it. It walks, and every step kills the ground under it as roaches rain off it. It lays a hand on the old pine and drinks it until the pine is grey. It turns its face to you, its mouth opens, and they pour out. It reaches for you.

## How it's made

**3D that reads as 2D (`hd2d.py`).** Everything is drawn at 640×360 into a g-buffer, which holds per pixel:
- depth, normal and material;
- the object it belongs to;
- a variation value and surface coordinates.

Three numba kernels fill it:

| Kernel | Draws |
|---|---|
| Triangles (rasterizer with near-plane clipping) | the land and the lake |
| Ray-cast capsules | trunks, branches, grass blades, stems, roach legs, the giant's limbs and fingers |
| Ray-cast ellipsoids | leaf clumps, flower heads, stones, roach shells, the giant's skull, jaw and ribcage |

Leaf clumps get a ragged, leafy pixel edge and lose leaves in clumps as they die. Thin things are always kept at least a pixel wide.

Then it is lit like pixel art:
- Moonlight is cut into six bands, with ordered dither where the bands meet.
- Each band is a hue-shifted colour: cool and dark in shadow, pale in the light.
- Shadows come from shadow maps rendered with the same kernels: one for the valley, one for the film's ground, and one that follows the giant.
- Rim light comes from the moon.
- Every edge where one thing stands in front of another gets a dark line.

**The world (`terrain.py`, `world.py`, `flora.py`, `valley.py`).**
- **Land:** a 16 km valley from gradient-noise heights, with ridged, domain-warped ranges lightly worn by simulated rain. It shows meadow, forest floor, rock, snow and shore.
- **Lake:** its reflection is the whole world drawn upside down and broken by ripples, with the moon's road glittering on it.
- **Sky:** banded and dithered, with stars, stratus cloud lit on the moon's side, and a moon with seas, craters and rays.
- **Air:** blue haze far off, and patches of mist lying low in the valley.
- **Trees:** grown as real skeletons with leaf clumps at the twigs, in four kinds: cedar, zelkova, autumn maple and black pine. Far trees are simplified stand-ins.
- **Grass:** regrown each frame around the camera, in rings that get coarser with distance.
- **Death:** everything alive has a dying state. Grass bleaches and droops; leaves brown, grey, thin out and fall; bark greys.

**The giant and the roaches (`swarm.py`).**
- **Each roach is a 3D model:** a glossy domed back with the wing seam, a dark shield behind the head with a pale rim, and a head. When it is big enough on screen it also gets six legs walking in a tripod gait and two antennae.
- **The giant:** a dark core (capsules and ellipsoids on the skeleton from `../gaki-rampage/giant.py`) with thousands of roaches crawling along and around it.
- **The face:** packed with smaller roaches. They keep out of the eye sockets, where the eyes burn, and out of the mouth when it opens.
- **The tide:** pours out of the crack, spreads, turns, and climbs into its place on the body, feet first.

**The film (`film.py`).**
- **Shots:** lake, crack, tide, rise, breath, walk, pine, face, reach, title.
- **Life drain:** a field over the land and time, driven by the tide's front, the breath's ring, each footstep and the drinking of the pine.
- **Effects:** lights of life streaming into the crack, the giant's mouth and its hand; fireflies; falling leaves; heaved clods; roaches dropping off it as it walks, pouring from its mouth, and crawling over the lens.
- **Finishing:** depth of field on the doubled image, bloom, burning eyes, vignette and letterbox.

`sound.py` synthesizes the soundtrack.

```
python film.py raw.mp4                  # the film, silent (builds .cache/ the first time)
python sound.py hunger.wav              # its soundtrack
ffmpeg -i raw.mp4 -i hunger.wav -c:v copy -c:a aac -b:a 128k -shortest THE_HUNGER.mp4
python film.py --still 9.5 30 53        # test frames (seconds)
```
