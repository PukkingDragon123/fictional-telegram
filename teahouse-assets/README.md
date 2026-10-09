# Old Rundown Teahouse: pixel art asset pack (v3)

A first-person view of four rooms in an old, run-down teahouse. It comes with more than 120 separate drag-and-drop props and **Uncle Pong**, the first NPC. Each room is a box in perspective: you see the timber roof with its rafters running away from you, both side walls, the back wall and a plank floor. The palette follows the Spirited Away bathhouse: faded vermilion lacquer, jade trim, tarnished gold, indigo cloth and cream paper. Every word in the teahouse is written in its own rune script, like the enchanting-table language.

![The whole teahouse](preview/teahouse_full_2x.png)

**Native resolution:** 640×360 per room, 2560×360 for the whole panorama. That is one screen per room, and 3× gives exactly 1920×1080. Scale by whole numbers with nearest-neighbour filtering.

| Room | x range | What's there |
| --- | --- | --- |
| 1 Cook room | 0 to 640 | A big **stone furnace**, built rock by rock, with a thick wooden top and a wedge-stone arch with a carved keystone. Inside are burning coal, glowing embers, sparks, smoke, and the **talking fire spirit** (all mouth and teeth). Also a copper hood with drying herbs, the giant chalk **recipe board** with recipe cards, an apothecary chest with labelled jars on top, and a prep table with stores underneath |
| 2 Seating | 640 to 1280 | Big lattice **window** onto distant green trees, jade drapes, paper lanterns, wind chime, plants on the sill, menu tags, pendulum clock. **Uncle Pong** sits at a plain hinoki counter: his tea, one yunomi, a teapot |
| 3 Tea ritual | 1280 to 1920 | **Corkboard** of notes (receipts, an unpaid tab, a map scrap), hanging scroll, glazed cabinet, teaware shelf. On the counter: the tea set on an indigo runner, a tray of four yunomi, the **green alien lucky cat**, and the **journal drawer** |
| 4 Traveler's bedroom | 1920 to 2560 | The most run-down room. Plaster has fallen off the walls to show the bamboo lath, rain has streaked them, there is mould in the corners, boards are missing from the roof so daylight shows, and the floor is broken and bare. Indigo noren hanging in front, moon window with a billowing curtain, an old bed with a split, stained mattress under a **cloth-simulated patchwork quilt**, desk, chair with a draped scarf, bookcase, straw hat and cloak on the wall, oil lamp |

## Uncle Pong

![Uncle Pong's moods](preview/uncle_pong_moods.png)

Uncle Pong is an old warrior elephant crossed with the Siamese fireback, Thailand's national bird:

- **From the bird:** slate-blue feathered fur with fine barring, its scarlet face skin around his eyes, and two crest ponytails. Each ponytail is a gold ring with a fan of black quills, and every quill ends in a tuft.
- **Thai warrior dress:** a gold diadem, a pointed forehead plate and a spire, and a gold *krong kor* collar over a purple ruffle. He wears a red-and-gold vest patterned like a ceremonial elephant's caparison, with flared gold shoulder guards and gold bands on his arms, wrists and tusks.

The style is chunky and simple: clean shapes, three or four tones per material and a dark outline around every part. A warm rim of window light catches him from behind, and he casts soft shadows on the counter.

| Mood | What happens (12 frames, 8 fps) |
| --- | --- |
| `idle` | Breathes, ears and quills sway, trunk swings, glances left and right, blinks |
| `talk` | The trunk lifts out of the way so you see his mouth make different shapes. His brows jump on the loud words and one hand gestures |
| `happy` | Eyes squeeze shut, he laughs open-mouthed, his trunk curls up and he blushes. He bounces and claps while his ears flap, with sparkles |
| `angry` | Brows crash down into a V, eyelids narrow, teeth grit and an anger mark pulses. His ears fan out (an elephant's threat display), his trunk tenses into an S, and he slams a fist on the counter and shakes |
| `surprised` | Eyes go wide, his mouth makes an O and the trunk shoots up. The quills spring up, both hands lift, and shock lines and a sweat drop appear |
| `sad` | Worried brows, heavy lids and eyes looking down. His trunk, ears and quills droop while a tear runs down his face |
| `sip` | He lifts a yunomi to his mouth, curls his trunk out of the way, closes his eyes to drink, gives a pleased "ahh" and puts the cup down |

**Placing NPCs:** the sprite is 150×184. His body stops at the counter's back edge, and only his forearms, hands and their shadows reach onto the counter top. So draw NPCs **after** `20_counter`, with the sprite's top at `y = 114`. Slide them along x to seat them anywhere on the counter. Uncle Pong's default seat is x = 885.

## What moves

Everything loops seamlessly. Animated props have `_sheet.png` files (frames side by side); full-width layers stack their frames vertically.

| Thing | Frames | How |
| --- | --- | --- |
| Uncle Pong: 7 moods | 12 each | See above |
| Furnace fire | 12 | Firebrick lit by the coals; each coal's embers breathe on their own beat; small flames lick up at the sides; sparks rise. Smoke curls up, spills out of the arch and pools under the wooden top. The smoke is the only part with partial alpha, in four steps |
| Fire spirit: `idle`, `talk`, `happy` | 12 each | Sits down in the coals. Flame body is a noise field rising through a teardrop. A jagged maw of uneven teeth opens and closes as it talks; zigzag grin when shut; fangs when it laughs |
| Cloth: noren, curtains, moon curtain, cloak, quilt, scarf, towel | 12 | **Real cloth physics**: Verlet particles with stretch/shear/bend constraints, pins, gravity, a looping breeze, and collisions (the quilt settles over the mattress and pools on the floor). One wind period is captured so the loop closes |
| Alien lucky cat | 8 | Eased beckoning paw, pulsing antenna lights, a blink, a glint that travels across the coin |
| Garden trees, flower bed, ivy | 8 | Each leaf mass sways on its own phase |
| Lanterns, oil lamp, herb bundles, wind chime | 8 | Swing |
| Candles, steam | 8 | Flicker and curl |
| Light overlay | 8 | The furnace glow flickers; dust drifts in the window shafts |

## How it's drawn

- **Rooms in perspective:** each room is a box with its vanishing point at the centre of the room, on the eye line at y=150.
  - The back wall is inset (x 48 to 592 in each room) and topped by a girder.
  - Rafters run from the girder towards you and converge.
  - The side walls carry the planks, the jade rail and the wainscot round in perspective.
  - Floorboards run towards the vanishing point.
  - The windows are cut through a thick wall, so you see their inner faces.
  - Dark posts in the foreground hide the joins between rooms.
- **Furniture in perspective:** you look down onto the furnace, table and counter. Their far edges recede, and you see the side that faces the middle of the room.
- **Simpler style:** flat tones and clean seams on walls, floor and roof. A clean-up pass removes stray single pixels.
- **A Japanese counter:** a pale hinoki top over a dark lattice of vertical slats (*tategoshi*), with only a few things on it.
- **3D shading from silhouettes:** ceramics, iron, brass, the cat and Uncle Pong are lit from a height field. Glossy surfaces get a specular glint.
- **Teaware:** cool blue-grey shadows on white glaze, reflected light on the shadow side, a crisp rim, and a glossy tea surface.
- **Nothing floats:** props that stand on something carry a soft contact shadow. Wall and hanging pieces carry a drop shadow on the wall behind them. These shadows are semi-transparent, so they work wherever a prop is dropped.
- **A fantasy script:** every word in the teahouse is written in its own runes, angular glyphs like the enchanting-table alphabet. That covers the recipe steps, recipe cards, jar labels, menu tags, receipts, the unpaid tab and the fire charm. The strings in the code are plain English (SENCHA 80C 2 MIN), so you can read what each sign says. `RUNES` in `pixel.py` holds the alphabet; `text(..., script='latin')` writes readable letters.

## Folder map

```
layers/outside/   window view: 6 parallax layers (1280 px wide, tile horizontally)
layers/room/      10 shell (window panes transparent) / 11 shell with wall props baked in
                  20 furnace + prep table + counter / 30 foreground posts + ivy / 40 light overlay
props/roomN/      every prop at 1x (+ _sheet.png; Uncle Pong and the fire spirit have one sheet per mood)
props_3x/roomN/   the same at 3x (1080p size)
atlas/            all prop frames packed into one PNG + JSON (anims, fps, layer, default spot)
nature/           stand-alone green trees, flowers, grass, pampas, falling-leaf particles
palette/          the palette (.gpl for Aseprite/GIMP, .hex, swatch PNG)
scene.json        draw order, parallax, vanishing points, surfaces, every prop with its default x/y
demo/index.html   open in a browser: drag props, pan the rooms, cycle Uncle Pong's and the fire's moods
preview/          full panorama, each room at 1080p, animated GIFs, a parallax pan (.webp)
generator/        the Python that draws all of it (deterministic, seeded)
```

## Putting it in a game

Draw these back to front:

1. `layers/outside/00_sky` to `05_flowers_close`, each at `screen_x = -camera_x * parallax` and repeated every 1280 px. They only show through the window panes.
2. `layers/room/10_room_shell.png`
3. props with `layer: wall`, then `layer: ceiling`
4. `layers/room/20_counter.png`
5. props with `layer: npc` (**your customers**, e.g. Uncle Pong)
6. props with `layer: floor`, then `layer: counter`, then `layer: front`
7. `layers/room/30_foreground` (the posts between rooms, parallax 1)
8. `layers/room/40_light_overlay` (normal or screen blend)

Default positions are in `scene.json` (`x`, `y` = top-left in scene pixels). Drop surfaces (y where an object's bottom sits) are under `surfaces`: prep table 284, counter 292, window sill 212, top of the apothecary chest 96, room-3 shelf 184, floor 265. The furnace's wooden top runs from y 198 (back) to 222 (front).

Some props are exported but not placed by default, which keeps the counter and shelves clean. You can drag any of them in:

- **Counter extras:** menu tent card, bud vase, dango plate, sugar pot, green-tea cup, service bell, incense burner, candle.
- **Cook room:** the kama pot, the iron kettle and their steam (for the furnace top, later). Also the long wall shelf, spare jars and tins, small sacks, scroll bundle, spare mortar, open jar, tea brick, torn sack and crate of jars.
- **Bedroom:** the rug, pack, boots, book pile, scattered papers, walking staff and potted plant, plus the route map and the sketch (posters). The floor and walls are bare by default.
- **Single cups:** `yunomi_*`, to drag off the tray.
- **Journal drawer:** `drawer_open` is the swap-in for the closed journal drawer (the demo's *open drawer* button). `journal_closed` and `journal_open` are the item and UI versions of the journal.

## Previews

- `preview/room_1_3x.png` to `room_4_3x.png`: each room at 1920×1080
- `preview/room1_cook_anim.gif` to `room4_bedroom_anim.gif`: every room animated (2 s loops)
- `preview/uncle_pong_<mood>.gif` and `uncle_pong_moods.png`: Uncle Pong close up
- `preview/fire_spirit_idle.gif`, `fire_spirit_talk.gif`, `fire_spirit_happy.gif`, `alien_lucky_cat.gif`: close-ups
- `preview/pan_parallax.webp`: a camera pan across the four rooms
- `preview/props_contact_sheet.png`: every prop, labelled

## Regenerating / tweaking

```bash
python3 teahouse-assets/generator/build.py          # a few minutes, needs Pillow + numpy
python3 teahouse-assets/generator/build.py --quick  # skip the animated previews
```

| What | Where |
| --- | --- |
| Layout, perspective | `generator/layout.py` |
| Rooms | `room.py` (perspective boxes, walls, windows, posts, wear), `counter.py` (stone furnace, table, counter), `furnace.py` (fire, coals, smoke) |
| Props | `props_cook.py`, `props_seating.py`, `props_ritual.py`, `props_bedroom.py` |
| NPCs | `npc.py` (the rig, poses per mood, Uncle Pong) |
| Cloth | `cloth.py` (simulation), `cloth_props.py` |
| Teaware | `teaware.py` |
| Fire spirit | `fire.py` |
| Trees and garden | `trees.py`, `leaves.py`, `outside.py` |
| Colours | `RAMPS` in `pixel.py` |

You can also drag props around in `demo/index.html` and press **copy layout JSON** to get their new positions.
