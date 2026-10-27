# GAKI — the hunger that walks

A one-minute cinematic (1280×720, 24 fps, with sound) in the void style: black crumpled-paper bodies, white scribbled outlines that boil on twos, white scribbled eyes, a deep cosmic nebula behind it all.

**The lore.** Long before the teahouse, people lived in this valley. They wanted more. They emptied the mountain, then the sea, then each other, and then they were gone. But greed does not die with the hungry. It sank into the stone and waited. It grew a thousand legs, and then two. It remembers their shape.

**The shots**

| Time | Shot |
|---|---|
| 0–9.5 s | The lore, hand-lettered on the nebula |
| 9.5–12.5 s | The valley, Ghibli green under big cumulus |
| 12.5–15.5 s | The mountain shoulder cracks; black bugs pour out |
| 15.5–19 s | "But greed does not die with the hungry…" |
| 19–30 s | The swarm circles the mountain, then builds the giant feet first. The ground under it rots into the void, the tendrils grow, it stands up, and its eyes light |
| 30–39 s | It runs down through the forest. The trees go black and drop their leaves, and its footprints rot |
| 39–50 s | It runs out across the sea, toward you. The water rots in black rings with white ripples, black spray flies up, and the sky tears open onto the nebula |
| 50–55.5 s | Its face, in the void: it turns to look at you |
| 55.5–61 s | 餓鬼 · GAKI · the hunger that walks |

**How it's made.** It's all procedural Python: no keyframes and no external assets.

- `raster3d.py` (in `teahouse-assets/generator/`) is a small numba z-buffer rasterizer for flat-shaded low-poly meshes. It also writes an id buffer, so 2D styling can be drawn on top.
- `world.py` holds the valley: a heightfield with mountains and a forest shoulder, 1,700 low-poly trees in one mesh (they sway, and as they rot they sag, shrink and blacken), an animated sea, and a painted sky with cumulus.
- `creature.py` holds the Gaki: a skeleton-driven running pose, a lumpy low-poly body with greed bands coiled round every limb, and 40 writhing tendrils. It also says where the eyes and the frown go.
- `style.py` draws the void look: the nebula, crumpled paper, and the boiling scribble outlines with hatching, glow, eyes and mouth.
- `cinematic.py` holds the story. It covers:
  - the path and the footfalls
  - the swarm (4,400 bugs, each flying out of the crack, round the vortex, and onto its own place on the body)
  - bugs shedding as it runs
  - per-pixel rot of the ground and water, rebuilt from the depth buffer
  - the sky tear, the cameras, the cards and the compositing
- `sound.py` synthesizes the soundtrack: drone, wind, birds, the crack, the swarm, the eyes, each footfall and splash, the tear, breath and a gong.
- `export_model.py` writes both low-poly models as OBJ with materials: the Gaki and the flying goat-dragon.

```
python cinematic.py gaki.mp4                 # the film, silent (about 20 min on 4 cores)
python sound.py gaki.wav                     # its soundtrack
ffmpeg -i gaki.mp4 -i gaki.wav -c:v copy -c:a aac -b:a 128k -shortest GAKI.mp4
python cinematic.py --still 24 33 47         # test frames
python cinematic.py --turntable turn.mp4     # the model, turning, in the void
python export_model.py models/               # OBJ + MTL
```
