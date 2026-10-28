# GAKI — the rampage

A one-minute pixel-art film under the blood moon (1280×720, 24 fps, with sound). It's set in the teahouse's valley, painted in the pack's own style.

Something stirs at the lake, and the crickets stop. Antennae rise behind the mountain, then a head against a moon six times its size. Its hands slam onto the ridge and it hauls itself over. It walks down through the forest and wades the lake. At the clearing it crouches over the old black pine and tears it out of the ground, roots and all. It screams, snaps the pine in two, and looks at you.

**The giant.** It's a starved giant in a man's shape, about 340 m tall: pale skin over long bones, ribs you can count, arms that hang past its knees, and five long fingers. It's also wrong:

- a centipede's plates and spines down its back;
- a second pair of thin insect arms folded under the ribs;
- a long skull with no nose and deep sockets full of small burning eyes;
- antennae;
- a lower jaw split in two that opens sideways like mandibles.

It is posed in 3D (`giant.py`: a skeleton with IK, a lumpy low-poly body) and drawn as pixel art (`pixmon.py`). Each art pixel takes the material its block shows and is shaded with that material's ramp from the blood-moon night palette. Then come the pixel artist's finishing touches: contour lines where one part passes in front of another, the red rim of moonlight on edges facing the sky, burning eyes, and the pack's selective outline.

**The world.** `sets.py` paints one set of layers per camera setup, like the backgrounds of a 2D film:

- **Valley:** the mountain, the forest, the lake and a grassy rise.
- **Ridge:** the ridge on a long lens, with the huge moon behind it.
- **Lake:** down at the water's edge.
- **Clearing:** the forest clearing with the old pine.
- **Looking up:** the sky from the clearing.

Everything is drawn by hand:

- **Moon:** a flat disc with soft painted seas and a few small craters.
- **Clouds:** long flat bands, lit red underneath.
- **Mountains:** ridge lines with spurs, lit and shadow faces in flat tones, and snow on the caps.

The land reuses the pack itself:

- its palette and dithering;
- its grove trees (black pines, cypresses, oaks, zelkovas, swaying);
- its meadow of grass, pampas and spider lilies;
- its blood-moon bats;
- its night re-light, `bloodmoon.grade`.

**The film.** `comp.py` lays the layers out as a multiplane, so each layer slides by its depth, and slots the giant between them by depth. That way the ridge hides it until it climbs over, and the trees stand in front of its legs. `rampage.py` holds the shots, the choreography, and the debris, dust, spray, ripples, flies and camera shake. `sound.py` synthesizes the soundtrack.

```
python rampage.py raw.mp4                  # the film, silent (about 10 min on 4 cores; builds sets.pkl first)
python sound.py rampage.wav                # its soundtrack
ffmpeg -i raw.mp4 -i rampage.wav -c:v copy -c:a aac -b:a 128k -shortest GAKI_rampage.mp4
python rampage.py --still 19 24 48         # test frames
```
