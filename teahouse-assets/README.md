# Old Rundown Teahouse: pixel art asset pack (v3.3)

A first-person view of four rooms in an old, run-down teahouse. It comes with more than 120 separate drag-and-drop props, and Uncle Pong (an optional NPC). Each room is a box in perspective: you see the timber roof with its rafters running away from you, both side walls, the back wall and a plank floor. The palette follows the Spirited Away bathhouse: faded vermilion lacquer, jade trim, tarnished gold, indigo cloth and cream paper. Every word in the teahouse is written in its own rune script, like the enchanting-table language. Moss has crept over everything damp.

![The whole teahouse](preview/teahouse_full_2x.png)

**Native resolution:** 640×360 per room, 2560×360 for the whole panorama. That is one screen per room, and 3× gives exactly 1920×1080. Scale by whole numbers with nearest-neighbour filtering.

| Room | x range | What's there |
| --- | --- | --- |
| 1 Cook room | 0 to 640 | A big **stone furnace**, built rock by rock, with a thick wooden top and a wedge-stone arch with a carved keystone. Inside are burning coal, glowing embers, sparks, smoke, and the **talking fire spirit**: no eyes, just a toothless, wobbly frown. Herbs dry on an old bamboo pole above it. Also a big **chalkboard**, wiped clean, an apothecary chest with labelled jars on top, and a prep table. On the table: a hinoki cutting board with a nakiri knife and fresh leaves, a suribachi mortar, and a woven basket. Under it: a burlap sack with a rune stencil, end-grain firewood, a copper-hooped bucket, a basket of dried flowers, and an ash-glazed tsubo jar with a cloth lid |
| 2 Seating | 640 to 1280 | Big lattice **window** onto a garden of detailed green trees by a lake, with butterflies, jade drapes, paper lanterns, plants on the sill, menu tags, pendulum clock. A plain hinoki counter with a cup of tea and one yunomi |
| 3 Tea ritual | 1280 to 1920 | An empty **corkboard**. Where the shelf was there is now a **bell-shaped katōmado window**. On the counter: a new tea set straight on the hinoki (a squat kyusu with a side handle, a black raku chawan of matcha, a chasen whisk, a lacquered natsume with gold pines, a chashaku scoop), a tray of four yunomi, the **green alien lucky cat**, and a **brass call bell**. Ring it and an old **goat-dragon** rises behind the window and rests its chin on the sill. In the counter front is one drawer, the **journal drawer** |
| 4 Traveler's bedroom | 1920 to 2560 | A lived-in, run-down room drawn for realism. The walls are old mud plaster: softly mottled, sooty under the tie rail, streaked by rain with tide lines, hairline cracks and nail holes, and holes where the plaster has fallen to show the straw-and-clay coat and the woven bamboo lath behind. Below runs a wainscot of cedar boards. Moon window with a billowing curtain, a **silk bed**, desk, chair with a draped scarf, bookcase, cloak on a hook, and a big red paper lantern hanging from the beam. The chair stands at the desk, seen from behind, with a red scarf over its back. A wall shelf above the bed holds folded linen, a clay bottle, a small box, a candle stub, a rolled map and dried lavender. There is a round bronze mirror with a tassel, pegs with a coil of rope and a leather satchel, and dried herbs hanging on the post. The floor is kept clear apart from a woven rug. Under the bed it is dark, and something lives there: a **black axolotl-frog**. It is drawn as a 3D creature: a smooth tube of wet black skin with a soft shine and faint speckles, a broad head, frog-like golden eyes, feathery purple gills that sway, a tail fin, and four legs stepping in a diagonal gait with splayed toes. It crawls a slow loop on the floor. It turns in depth, so you see it side on, from behind and head on, and the tail passes behind the body. It dims as it goes deeper into the dark (48 frames at 12 fps; `preview/black_axolotl.gif`) |

## Uncle Pong (optional, not placed)

Uncle Pong is no longer in the scene by default. He is still exported (`props/room2/uncle_pong_*`) if you want to drag him back in.

![Uncle Pong's moods](preview/uncle_pong_moods.png)

Uncle Pong is a big, bare-chested uncle, an elephant crossed with the Siamese fireback (Thailand's national bird). He has broad shoulders, a heavy chest, a six-pack and big arms. From the bird he takes his slate-blue fur, the scarlet skin round his eyes, a **collar of feathers** (golden "fire" feathers flaring behind a glossy blue-black ruff and grey hackles), and its crest, worn as a topknot ponytail. He wears nothing but a red checked **pha khao ma** (ผ้าขาวม้า) tied round his waist.

**Style:** chunky. He is drawn on a 56×72 grid and scaled up 3× with nearest neighbour, so his pixels are big like a classic pixel NPC's:

- flat colours with three tones per material
- one black outline round the silhouette, with darker fur lines between the muscles
- bead eyes with a shine, and thick brows that carry most of each expression
- a soft shadow where his forearms rest on the counter

| Mood | What happens (12 frames, 8 fps) |
| --- | --- |
| `idle` | Chest rises as he breathes, trunk swings, topknot sways, he glances aside and blinks. Forearms rest on the counter with his fists together |
| `talk` | Trunk lifts so you see his mouth shapes, brows jump on the loud words, one big hand gestures |
| `happy` | Eyes squeeze to ^^, he laughs with a grin, trunk curls up, he bounces and gives a thumbs up, sparkles |
| `angry` | Brows crash into a V, teeth grit, ears flare, an anger mark pulses, and he slams his fist on the counter with impact lines |
| `surprised` | Eyes go wide, brows shoot up, mouth makes an O, trunk goes up, both palms come up |
| `sad` | Worried brows, eyes looking down, droopy trunk and ears, a tear |
| `sip` | Lifts a small cup of matcha under his curled trunk, eyes closed, then a pleased look |
| `flex` | Double-biceps pose: arms up, biceps pump, eyes squeeze, sparkles |

**Placing NPCs:** the sprite is 168×216. His body stops at the counter's back edge; only his forearms, hands and their shadows reach onto the counter top. So draw NPCs **after** `20_counter`, with the sprite's top at `y = 83`. Slide them along x to seat them anywhere on the counter. Uncle Pong's default seat is x = 876.

## The silk bed

![The silk bed](preview/silk_bed.png)

A low lacquered bed with brass fittings and a torii-style headboard (the top rail turns up at the ends). A crimson **silk quilt** embroidered with gold plum blossoms spills over the front in soft folds, with a gold border and piped hem. Its head end is turned down to show the gold silk lining and a cream silk sheet.

The silk is modelled, not hand-dotted. The top is a height field and the front is a row of hanging folds, with rounded crests and sharp creases between them. Both are lit with a diffuse term plus a tight specular term, then snapped to the palette. That gives deep shadow in the creases, a broad bright band where a fold turns to the light, and a near-white streak on the crest.

## The garden trees

The trees outside are grown, not stamped (`grove.py`):

- **Branches:** space colonisation in 3D. A cloud of points fills the crown, and the trunk grows up into it, forking toward the points until they are used up. The big limbs fork from the top of the trunk. Branch thickness follows the pipe model, so the trunk flares at the foot and the limbs taper to twigs.
- **Bark:** each branch is lit across its width from the upper left, with fissures stretched along the grain. The birches are white, with black marks.
- **Leaves:** painted the way a pixel artist blocks in a tree. The leaf clusters on the twigs are gathered into a few big clumps. Each clump is a rounded mass with big lobes and a notched, leafy edge, lit as one form: bright at the top left, its underside in its own shade, and a sunlit rim along the upper-left edge. Small leaf shapes run over it, lighter on the lit side and darker in the shade, with very little dither, so the tones read cleanly. Clumps further back and inside the crown are darker, and every clump takes its own shade of the tree's colour, so no crown is one flat green. Gaps between clumps show the limbs and the sky, and a fringe of small tufts breaks the outline.
- **Wind:** each tree sways slowly with a quicker flutter on top, more toward the crown, over 16 frames. Trees further right bend a little later, so you see the gust go across the garden. The grass leans together in the same gusts.
- **Species:** a Japanese black pine with flat pads of needles (each pad painted as one cloud, with needle strokes), a zelkova, oaks, a weeping willow with hanging strands, white birches and conical hinoki cypresses. A hazed back row of smaller trees stands behind them.
- **Garden life:** butterflies flap and fly looping figure-eights over the flowers, and dragonflies dart and hover over the lake. In spring petals, and in autumn leaves, come off the trees and turn as they fall, and lie in a carpet on the ground under them. Every path loops over the layer's 16 frames.

## The lake, the fish and the birds

- **The lake** (`03_lake`, 12 frames) is a mirror. Every row reflects the sky, clouds and mountains, flipped, and broken by ripples that run along the rows, stronger toward the shore. Near the horizon it is nearly all reflection; nearer the shore its own deep blue-teal shows through. Bands of light ride the ripple crests toward the shore, and glitter sparkles on and off.
- **Life on the lake** (`04_lake_life`, 96 frames, 8 s at 12 fps):
  - fish glide under the surface on slow loops with their tails beating: dark carp, and orange-and-white koi
  - now and then a fish jumps clear, bending as it goes, with a splash where it leaves and lands and rings spreading
  - a pair of mandarin ducks paddles round with a V of ripples behind them (swans in winter)
- **Birds** (`04_birds`, 144 frames, 12 s at 12 fps) fly over the lake:
  - swallows swoop and dart low over the water
  - small birds cross, and in summer a white egret flaps slowly across
  - the flocks that cross go once round the 1280 px tile per loop, so the layer loops seamlessly
- **Wind:** faint gust strokes sweep across in front of the garden (`08_wind` in summer, and in the seasons' drift layers).
- `preview/window_life.gif` shows 8 s of it through the seating-room window.
- Both life layers are cropped bands: their records have `x`, `y`, `w`, `h`. The birds' sheet is a grid with `sheet_columns`, because a single column would be taller than a texture can be.

`generator/polish_gifs.py OUT_DIR` renders long, smooth GIFs of rooms 1, 2 and 4: 2x, 10 fps, every animation running, one shared palette, no dithering. The seating room runs 12 s, so the birds and ducks go by. Add `--season=winter` (or any season) to draw the rooms in that season.

`generator/artist_process.py OUT_DIR [goat 0 1 2 3]` paints the goat-dragon model and each room from a blank canvas, stroke by stroke, and records it like a Procreate timelapse: canvas only, one frame per stroke. Each line is a wobbling, overshooting path. Big areas are covered in back-and-forth strokes inside a selection. Fills are bucket fills, and colour changes are slider drags.

The order is a painter's order: rough, sketch, flat colour, light and shadow, detail. The mistakes stay in:
- a first idea faded and hidden
- an eye drawn too big and rubbed out
- the jaw moved after a canvas flip
- doubled pixels cleaned off the line art
- fur filled brown and slid to white
- highlights pushed too bright and pulled back
- a sketch dragged into place
- an idea erased
- a prop painted then deleted
- strokes undone

Each piece writes `*_timelapse.mp4`, `*_timelapse.gif`, a layered `*_layers.psd` and `*_final.png`. The PSD keeps the rough layers, hidden, and flattens to the finished art. Pass `--cache=DIR` to keep the room data between runs.

## The four seasons

The base scene is summer. `seasons/<season>/` holds what changes for spring, summer, autumn and winter. `scene.json` lists it under `seasons`.

**Outside, through every window**
- **Spring:** cherry blossom on the zelkovas and some of the oaks, fresh green, azaleas, daisies and cosmos. Petals turn in the air and float on the lake. The sky goes pale toward a pink horizon, and late snow is left on the high peaks.
- **Summer:** the base garden: deep green, hydrangeas, butterflies and dragonflies, seeds drifting on the wind.
- **Autumn:** the maples go red, orange and gold, the birches gold and the willow yellow, while the pines and cypresses stay green. The far forest turns rust and red. The grass is gold, with pampas and red spider lilies. Red dragonflies fly, leaves blow on the wind and float on the lake, and the sky is clear with a warm horizon.
- **Winter:** the broadleaf trees are bare, with snow on every branch. Snow caps the pines and cypresses. Snow covers the ground and the flower bed, with dry stalks poking through. The mountains are white to their feet, there is ice along the near shore, the sky is a low grey snow-cloud, and snow is falling.

The new layer `08_petals` / `08_leaves` / `08_snowfall` (24 frames, parallax 0.75) is the drift in front of the garden.

**Life outside** changes with the season too:
- **Spring:** cherry petals come off the blossom trees and lie pink on the ground under them. Swallows swoop low over the lake, and small birds cross.
- **Summer:** swallows, and a white egret.
- **Autumn:** leaves fall from the red and gold trees and carpet the ground. A skein of geese crosses in a V, with a flock of sparrows.
- **Winter:** a pair of red-crowned cranes glides across, crows fly over, fewer fish move under the cold water, and swans replace the ducks.

**The rooms**
- **The glass** (`layers/room/09_window_glass.png`) is drawn between the outside and the room shell, so it only shows in the panes:
  - spring: petals on the sills and the glass
  - autumn: maple leaves
  - winter: frost growing in from the edge of every pane, snow heaped on the outer sills, and icicles
- **The light** (`40_light_overlay`) changes with the season: soft in spring, low golden autumn sun that reaches further across the floor, and cool snow-light in winter, with the hearth and the lantern glowing warmer against it.
- **Seasonal things** in the rooms (`props`):
  - **Spring:** a cherry branch in an indigo vase (seating counter), hanami dango (tea counter), bamboo shoots in a basket (prep table).
  - **Summer:** shaved ice with strawberry syrup, a paper fan, watermelon.
  - **Autumn:** strings of dried persimmons on the drying pole, a bowl of persimmons, a moon-viewing offering of dango and pampas grass.
  - **Winter:** daikon hung to dry, a bowl of mandarins, a snow rabbit on the window sill, kagami mochi.
- `preview/seasons_overview.png` shows the seating room in all four seasons. `seasons/<season>/preview/` has the whole teahouse, each room, and `window_life.gif`.

## The pendulum clock

`pendulum_clock` runs: 120 frames at 4 fps. The brass pendulum swings tick-tock, and the red second hand ticks once per swing, all the way round, so the loop is seamless.

## The bell and the goat-dragon

![Ring the bell](preview/dragon_bell_peek.gif)

The **goat-dragon** (a hybrid of a goat and a dragon) is drawn by hand at full scene resolution (one sprite pixel is one scene pixel). It's old, calm and realistic, not a cartoon. It has a goat's head, held nose-down, with dragon parts: a long face with a gently roman nose, a bare pink muzzle, a round cheek, a floppy pink-lined ear, ridged horns sweeping back, a white goatee and a goat's eye (pale amber, with a wide horizontal bar pupil). Thick white fur and a shaggy mane cover it. The dragon shows in pearly scales with teal edges down the nose bridge, along the lips, and round the eye; a bony brow ridge with two spurs; spiked frills at the back of the jaw; cream belly plates down the throat; three fangs (two upper, one lower, pointing up); and big grey spines along the mane. Only its head and neck show at the window; there is no arm. Its ears twitch and flick. It wears gold hoops along the ear and a stud near the root, and a ring through its nose. The pupils are a goat's: a horizontal bar flaring at both ends. The horns sweep back close over the skull and mane. It leans in and puts its head over the sill into the room, in front of the window frame, casting a soft shadow on the wall, and it can turn its head to face you. It rests there, and only its eye, breath and jaw move.

![How the wyvern is drawn](preview/wyvern_process.png)

**Turning to face you.** For a turned head the goat is drawn as a solid:
- the profile outline is lofted out to a width that grows from the narrow muzzle, bulges round the eyes and is broadest at the cheeks
- the eyes, sockets, nostrils, muzzle, brow and scales are painted onto that surface by where they sit on the profile, once on each side
- the horns, ears, brow spurs, jaw frills and fangs sit on both sides
- it is projected with the head's tilt, turned toward you, and the nearest surface wins

The masks then go through the same shading, fur and eye passes, so the front view matches the side view. Facing you, both eyes, both ears, both horns, the scaled stripe down the face, the two nostrils and the beard all show.

**The drawing process** (`wyvern.py` keeps every stage). `preview/wyvern_process.gif` is a timelapse of it being drawn, stroke by stroke:

1. **Gesture:** a few loose sweeps for the action of the head, the neck and the horns.
2. **Construction:** a circle for the cranium, a box for the snout, the eye line and the head axis, drawn over the gesture.
3. **Sketch:** pencil over the turned-down construction. Short, overlapping strokes bow a little off the line and overshoot their ends, and the main contours are gone over twice. Shadows are hatched with short diagonal strokes.
4. **Ink:** clean lines over the faded sketch, one pixel on the lit side and two on the shadow side.
5. **Flats:** local colour, part by part.
6. **Shadow shapes:** the shadows blocked in with one darker tone, before any rendering.
7. **Render:** planes with rounded edges, cast shadows under the brow, jaw, head and horns, and reflected light on the lip.
8. **Texture:** white fur, stroke by stroke, following the lie of the hair: down the face toward the nose, down the cheek, jaw and neck, long strands in the beard. Locks of the mane stand off the outline. Growth rings across the horns, fine scales on the dragon's hand and spines.
9. **Final:** the lines folded into the colours, contact shadows, worn highlights, the wet glint in the eye and the sky rim.

**The anatomy** is drawn from hand-placed points (smooth spline curves):

- a goat's head, drawn in its own frame and tipped nose-down: a long face with a gently roman nose, a soft brow over the eye, a bare pink muzzle with slit nostrils
- a detailed eye: a goat's wide horizontal bar pupil with hot gold round it, an amber iris with radial fibres and gold flecks inside a dark limbal ring, a window glint and a second small one, a scaly upper lid with a black lash line, a lower lid, and small scales round it
- a floppy ear with a pink inside, and a white goatee hanging from the chin
- one small dragon fang over the lower lip
- a round cheek, and a thick neck under a shaggy white mane with grey dragon spines poking through
- ridged goat horns that rise from the poll and sweep back

It lives on its own layer, **`outside`**. Draw it after the window view and before the room shell, so the window frame hides the rest of its body. When it leans in, its head is also drawn on **`dragon_peek_front`** (layer `wall`, right after the room shell), so the head comes in front of the frame and sill. Play both props' anims together; the front one is empty while the goat is outside.

`dragon_bell` carries an **`on_click`** list in `scene.json`. Each entry names a prop, a one-shot anim to `play`, the anim to go back to (`then`), and an optional fps. Clicking the bell plays `ring` on the bell (then `idle`) and `peek` on `dragon_peek` (then `hidden`). If you want the wyvern to stay at the window, switch it to its `rest` loop after the peek instead. The demo has a *ring the bell* button too.

## Moss

`moss.py` grows moss wherever it is damp:

- cushions on the skirting, the rail and the window sills
- curtains hanging off the girders and round the bedroom roof gaps
- carpets creeping across the floor along the walls
- patches in the back corners, on the side walls and up the posts
- moss on the cool stones of the furnace (never by the fire) and along the bottom of the counter
- a few tufts on old props (the jar, bucket, firewood, bookcase and boards)

Each clump is shaded like a little cushion: a lit rim at the top left, a bumpy body, a dark rim at the bottom right and a contact shadow. Some put up spore stalks with copper capsules. It is all in the room layers, so nothing extra needs placing.

## What moves

Everything loops seamlessly. Animated props have `_sheet.png` files (frames side by side); full-width layers stack their frames vertically.

| Thing | Frames | How |
| --- | --- | --- |
| Uncle Pong: 8 moods | 12 each | See above |
| Furnace fire | 12 | Firebrick lit by the coals; each coal's embers breathe on their own beat; small flames lick up at the sides; sparks rise. Smoke curls up, spills out of the arch and pools under the wooden top. The smoke is the only part with partial alpha, in four steps |
| Fire spirit: `idle`, `talk`, `happy` | 12 each | Sits down in the coals. Flame body is a noise field rising through a teardrop. No eyes and no teeth: just a soft, wobbly, downturned mouth whose rim ripples all the way round, opening into a dark throat glowing red as it talks (and wider as it wails) |
| Cloth: noren, curtains, moon curtain, cloak, scarf, towel | 12 | **Real cloth physics**: Verlet particles with stretch/shear/bend constraints, pins, gravity, a looping breeze, and collisions. One wind period is captured so the loop closes |
| Silk bed | 12 | The quilt's hanging folds sway, so the sheen slides across the silk |
| Bell and goat-dragon | 10 + 63 (+ a 37-frame `rest` loop) | Click the bell: it rings. The goat-dragon slowly rises behind the window with its eyes shut and settles its chin on the sill (dust falls). Its eye opens as the third eyelid slides back, and it looks at the bell. Then it leans in and puts its head over the sill into the room and breathes out a long cloud of breath. It turns its head to face you, looks at you with both eyes, blinks and huffs, turns back, parts its jaws with a sigh, glances at you, leans back out and sinks down. In the `rest` loop it keeps its head in over the sill and now and then turns to look at you. Both are one-shot animations (see below) |
| Alien lucky cat | 8 | Eased beckoning paw, pulsing antenna lights, a blink, a glint that travels across the coin |
| Garden trees, flower bed, ivy | 8 | Each tree's crown sways, more toward the top. Butterflies (white, yellow, blue, orange) flap and fly looping paths over the meadow, and dragonflies dart and hover over the lake |
| Lanterns, herb bundles, wind chime | 8 | Swing. The chochin lanterns glow from inside, flicker softly and swing their tassels |
| Candles, steam | 8 | Flicker and curl |
| Light overlay | 8 | The furnace glow flickers, dust drifts in the window shafts, and every window pane has a soft glass reflection: two faint diagonal bands of sky light, brighter toward the top, and nothing else |

## How it's drawn

- **Rooms in perspective:** each room is a box with its vanishing point at the centre of the room, on the eye line at y=150.
  - The back wall is inset (x 48 to 592 in each room) and topped by a girder.
  - Rafters run from the girder towards you and converge.
  - The side walls carry the planks, the jade rail and the wainscot round in perspective.
  - Floorboards run towards the vanishing point.
  - The windows are cut through a thick wall, so you see their inner faces.
  - Dark posts in the foreground hide the joins between rooms.
- **Furniture in perspective:** you look down onto the furnace, table and counter. Their far edges recede, and you see the side that faces the middle of the room.
- **Old and run-down:** flat, simple tones, but everything has decades of neglect:
  - The lacquered walls are peeling back to grey bare wood, streaked by rain, grimy above the rail and rotting at the skirting.
  - Boards are broken or missing, some old holes are boarded over, and the nails bleed rust.
  - Wooden and metal props get a weathering pass (`weather.py`): grime in the creases, paint worn through on the edges, tarnished brass, scratches and water stains.
- **No ruler-straight shapes (`organic.py`):** the room layers and every prop go through an organic pass. A smooth noise field bends long straight edges by a pixel or so, the way old timber sags and a hand wobbles. Hard silhouette corners are worn off. Every frame of an animated prop bends the same way, so nothing shimmers. The characters and the fire are left as drawn.
- **The lucky cat** is drawn from hand-placed curves:
  - a pear-shaped sitting body with haunches and a curling tail
  - a soft head with cheek fluff, and curved ears with fur tufts
  - almond eyes, curved antennae with glazed bulbs; the beckoning arm casts a shadow on the head, and the whole cat (arm included) casts a shadow on the counter that moves with the paw, a bent beckoning arm (elbow at its side, paw held up beside the head)
  - a squashy cushion with tassels
- **Real wood grain (`woodgrain.py`):**
  - Each board is modelled as a cut through a log: the growth rings sliced by the board's surface.
  - That gives flat-sawn cathedral arches where the cut runs close to the pith, and straight lines further out.
  - Knots have the rings swirling round them, with dark latewood lines, sheen and dark streaks, and pores.
  - Every board gets its own pith, depth and tone, so neighbours differ.
  - It runs over everything wooden:
    - the lacquered plank walls (the grain shows faintly through the red, and strongly where the lacquer has peeled)
    - the wainscot, skirting, girders, corner posts and sills
    - the floor and ceiling boards in perspective
    - the counter top (fine, straight grain, stained dark), the counter slats, the prep table and the furnace's wooden top
    - every piece of wooden furniture
  - The counter is dark old wood, split along the grain, ringed with tea stains, chipped on the edge, and missing slats.
  - A clean-up pass removes stray single pixels.
- **A Japanese counter:** a dark wooden top over a dark lattice of vertical slats (*tategoshi*), with only a few things on it.
- **3D shading from silhouettes:** ceramics, iron, brass and the cat are lit from a height field. Glossy surfaces get a specular glint.
- **Teaware:** cool blue-grey shadows on white glaze, reflected light on the shadow side, a crisp rim, and a glossy tea surface.
- **Nothing floats:** props that stand on something carry a soft contact shadow. Wall and hanging pieces carry a drop shadow on the wall behind them. These shadows are semi-transparent, so they work wherever a prop is dropped.
- **A fantasy script:** every word in the teahouse is written in its own runes, angular glyphs like the enchanting-table alphabet. That covers the recipe steps, recipe cards, jar labels, menu tags, receipts, the unpaid tab and the fire charm. The strings in the code are plain English (SENCHA 80C 2 MIN), so you can read what each sign says. `RUNES` in `pixel.py` holds the alphabet; `text(..., script='latin')` writes readable letters.

## Folder map

```
layers/outside/   window view: 8 parallax layers (1280 px wide, tile horizontally): a dithered sky with
                  cirrus and cumulus, snow-capped far peaks, hazy ranges, a forested ridge over a
                  still lake, a canopy of tree crowns, then the garden: grown trees (a black pine,
                  zelkova, white birches, a weeping willow, oaks, hinoki cypresses) with butterflies,
                  fish and ducks on the lake, birds over it
                  and dragonflies
layers/room/      10 shell (window panes transparent) / 11 shell with wall props baked in
                  20 furnace + prep table + counter / 30 foreground posts + ivy / 40 light overlay
props/roomN/      every prop at 1x (+ _sheet.png; Uncle Pong and the fire spirit have one sheet per mood)
props_3x/roomN/   the same at 3x (1080p size)
atlas/            all prop frames packed into one PNG + JSON (anims, fps, layer, default spot)
nature/           stand-alone grown trees (black pine, zelkova, oaks, weeping willow, white birch,
                  hinoki cypress, a shrub), flowers, grass, pampas, falling-leaf particles
palette/          the palette (.gpl for Aseprite/GIMP, .hex, swatch PNG)
seasons/<season>/ spring, summer, autumn, winter: layers/outside (the view, its birds and fish), layers/room
                  (09_window_glass, 40_light_overlay), props + props_3x (seasonal things), preview
scene.json        draw order, parallax, vanishing points, surfaces, every prop with its default x/y
demo/index.html   open in a browser: drag props, pan the rooms, cycle the fire's moods, ring the bell
preview/          full panorama, each room at 1080p, animated GIFs, a parallax pan (.webp)
generator/        the Python that draws all of it (deterministic, seeded)
```

## Putting it in a game

Draw these back to front:

1. `layers/outside/00_sky` to `07_flowers_close`, each at `screen_x = -camera_x * parallax` and repeated every 1280 px. They only show through the window panes. `04_lake_life` and `04_birds` are cropped bands that run at 12 fps: their records have `x`, `y`, `w`, `h`, so draw each frame at (`x`, `y`) inside every 1280 px tile. When a record has `sheet_columns`, its sheet is a grid (left to right, then down).
2. props with `layer: outside` (the goat-dragon behind the bell window)
3. `layers/room/10_room_shell.png`
4. props with `layer: wall`, then `layer: ceiling`
5. `layers/room/20_counter.png`
6. props with `layer: npc` (**your customers**, e.g. Uncle Pong)
7. props with `layer: floor`, then `layer: counter`, then `layer: front`
8. `layers/room/30_foreground` (the posts between rooms, parallax 1)
9. `layers/room/40_light_overlay` (normal or screen blend)

**Seasons:** for a season, take `scene.json` → `seasons.<season>`:
- Use its `outside_layers` in place of the base ones in step 1 (summer points at the base files). Some sheets are grids (`sheet_columns`), and the life layers have their own `fps`.
- Draw its `window_glass` between steps 2 and 3.
- Use its `light_overlay` in step 9.
- Draw its `props` with the others of the same layer.

Props with an `on_click` list in `scene.json` are interactive: on a click, play each listed one-shot anim once, then switch that prop to its `then` anim.

Default positions are in `scene.json` (`x`, `y` = top-left in scene pixels). Drop surfaces (y where an object's bottom sits) are under `surfaces`: prep table 284, counter 292, window sill 212, top of the apothecary chest 96, room-3 shelf 184, floor 265. The furnace's wooden top runs from y 198 (back) to 222 (front).

Some props are exported but not placed by default, which keeps the counter and shelves clean. You can drag any of them in:

- **Tea room:** the old glazed cabinet, the teaware shelf and the corkboard notes (receipts, an unpaid tab, a map scrap).
- **Uncle Pong** (the elephant NPC, all his moods) and the white teapot in the seating room.
- **All the tea:** the tea set (kyusu, chawan, chasen, natsume, chashaku), the yunomi tray and cups, the cup of tea and its steam, the tea jars on the apothecary chest, and the tea leaves on the cutting board and in the basket.
- **Bedroom:** the indigo noren hanging at the top left.
- **Tea room:** the hanging scroll with CHAI TEA brushed down it.
- **Cook room:** the recipe cards and the tsubo jar. The chalkboard itself is wiped clean.
- **Cloth:** the indigo tenugui towel (prep table) and the seigaiha tea runner (tea counter), and the glass wind chime.
- **Counter extras:** menu tent card, bud vase, dango plate, sugar pot, green-tea cup, service bell, incense burner, candle.
- **Cook room:** the copper smoke hood, the kama pot, the iron kettle and their steam (for the furnace top, later). Also the long wall shelf, spare jars and tins, small sacks, scroll bundle, spare mortar, open jar, tea brick, torn sack and crate of jars.
- **Bedroom:** the rug, pack, boots, book pile, scattered papers, walking staff and potted plant, plus the route map and the sketch (posters). The floor and walls are bare by default.
- **Single cups:** `yunomi_*`, to drag off the tray.
- **Journal drawer:** `drawer_open` is the swap-in for the closed journal drawer (the demo's *open drawer* button). `journal_closed` and `journal_open` are the item and UI versions of the journal.

## Previews

- `preview/room_1_3x.png` to `room_4_3x.png`: each room at 1920×1080
- `preview/room1_cook_anim.gif` to `room4_bedroom_anim.gif`: every room animated (2 s loops)
- `preview/uncle_pong_<mood>.gif` and `uncle_pong_moods.png`: Uncle Pong close up
- `preview/dragon_bell_peek.gif`: the bell and the goat-dragon
- `preview/wyvern_process.png` and `wyvern_process.gif`: how the wyvern is drawn, stage by stage
- `preview/wyvern_peek.gif` and `wyvern_rest.gif`: the wyvern on its own in its window (the peek, and a resting loop of it breathing and blinking)
- `preview/silk_bed.png`: the silk bed close up
- `preview/fire_spirit_idle.gif`, `fire_spirit_talk.gif`, `fire_spirit_happy.gif`, `alien_lucky_cat.gif`: close-ups
- `preview/pan_parallax.webp`: a camera pan across the four rooms
- `preview/seasons_overview.png`: the seating room in spring, summer, autumn and winter
- `preview/props_contact_sheet.png`: every prop, labelled

## Regenerating / tweaking

```bash
python3 teahouse-assets/generator/build.py          # a few minutes, needs Pillow + numpy
python3 teahouse-assets/generator/build.py --quick  # skip the animated previews
python3 teahouse-assets/generator/package.py out.zip  # the tidy game-ready zip (Old_Rundown_Teahouse/)
```

| What | Where |
| --- | --- |
| Layout, perspective | `generator/layout.py` |
| Rooms | `room.py` (perspective boxes, walls, windows, posts, wear), `counter.py` (stone furnace, table, counter), `furnace.py` (fire, coals, smoke), `weather.py` (aging for props), `moss.py` (moss), `woodgrain.py` (wood grain) |
| Props | `props_cook.py`, `props_seating.py`, `props_ritual.py`, `props_bedroom.py`; `crafted.py` (cook-room baskets, sacks, firewood, bucket, jar), `tea_set.py` (the tea-room set), `silk_bed.py` |
| NPCs | `npc.py` (chunky 3× rig, pixel templates for eyes, brows, mouths and hands, poses per mood), `dragon.py` (the bell), `wyvern.py` (the hand-drawn goat-dragon and its drawing process) |
| Cloth | `cloth.py` (simulation), `cloth_props.py` |
| Teaware | `teaware.py` |
| Fire spirit | `fire.py` |
| Trees and garden | `grove.py` (grown trees, butterflies, dragonflies), `life.py` (birds, fish, ducks, falling leaves, wind), `outside.py`, `meadow.py`, `trees.py`, `leaves.py` |
| Colours | `RAMPS` in `pixel.py` |

You can also drag props around in `demo/index.html` and press **copy layout JSON** to get their new positions.
