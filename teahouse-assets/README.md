# Old Rundown Teahouse: pixel art asset pack (v2)

A seamless first-person panorama of four rooms in an old, run-down teahouse, plus more than 120 separate drag-and-drop props. The palette follows the Spirited Away bathhouse: faded vermilion lacquer, jade trim, tarnished gold, indigo cloth and cream paper. Outside the windows is a green garden that runs back to a lake.

![The whole teahouse](preview/teahouse_full_2x.png)

**Native resolution:** 640×360 per room, 2560×360 for the whole panorama. That is one screen per room, and 3× gives exactly 1920×1080. Scale by whole numbers with nearest-neighbour filtering.

| Room | x range | What's there |
| --- | --- | --- |
| 1 Cook room | 0 to 640 | Clay hearth whose firebox holds the **talking fire spirit** (all mouth and teeth). Kama pot and cast-iron kettle on the burners, copper hood with drying herbs, giant chalk **recipe board** with recipe cards, storage shelf with labelled jars, apothecary chest, prep table, stores under the table, a towel draped over the table edge |
| 2 Seating | 640 to 1280 | Big lattice **window** onto distant green trees, jade drapes, paper lanterns, glass wind chime, a bonsai and plants on the sill, menu tags, pendulum clock. The counter is laid out with one place setting per seat |
| 3 Tea ritual | 1280 to 1920 | **Corkboard** of notes (receipts, an unpaid tab, a map scrap), hanging scroll, glazed cabinet, teaware shelf. The tea set sits on an indigo runner next to a tray of four yunomi, plus incense, a candle, the **journal drawer** and the **green alien lucky cat** |
| 4 Traveler's bedroom | 1920 to 2560 | Indigo noren at the doorway, moon window with a billowing curtain, messy bed with a **cloth-simulated patchwork quilt**, desk, chair with a draped scarf, bookcase, cloak on a hook, oil lamp, rug, pack, boots |

## What moves

Everything loops seamlessly. Animated props have `_sheet.png` files (frames side by side); full-width layers stack their frames vertically.

| Thing | Frames | How |
| --- | --- | --- |
| Fire spirit: `idle`, `talk`, `happy` | 12 each | Flame body is a noise field rising through a teardrop. A jagged maw of uneven teeth opens and closes as it talks; zigzag grin when shut; fangs when it laughs |
| Cloth: noren, curtains, moon curtain, cloak, quilt, scarf, towel | 12 | **Real cloth physics**: Verlet particles with stretch/shear/bend constraints, pins, gravity, a looping breeze, and collisions (the quilt settles over the mattress and pools on the floor). One wind period is captured so the loop closes |
| Alien lucky cat | 8 | Eased beckoning paw, pulsing antenna lights, a blink, a glint that travels across the coin |
| Garden trees, flower bed, ivy | 8 | Each leaf mass sways on its own phase |
| Lanterns, oil lamp, herb bundles, wind chime | 8 | Swing |
| Candles, steam, incense | 8 | Flicker and curl |
| Light overlay | 8 | The hearth glow flickers; dust drifts in the window shafts |

## How it's drawn

- **Furniture in perspective:** the eye line is at y=150. You look down onto the counter, table, desk and bed, and up at the high shelves.
- **3D shading from silhouettes:** ceramics, iron, brass and the cat are lit from a height-field, with a specular glint on glossy surfaces.
- **Hand-thrown shapes:** pots, cups and jars have uneven left and right profiles, and round shapes carry a slight hand-drawn wobble.
- **Teaware:** cool blue-grey shadows on white glaze, reflected light on the shadow side, a crisp rim, and a glossy tea surface. The set includes a cup with saucer and the ribbed yunomi cups (matcha, hojicha, sencha, water).
- **Polished outlines:** dark and crisp on the shadow side, softer on the lit side.
- **Nothing floats:** props that stand on something carry a soft contact shadow. Wall and hanging pieces carry a drop shadow on the wall behind them. These shadows are semi-transparent, so they work wherever a prop is dropped.
- **Papers carry real text:** recipe steps on the board, the recipe cards (SENCHA 80C 2 MIN), jar labels, the menu tags, receipts, the unpaid tab, map labels.
- **Trees:** organic masses built from hundreds of individual spiky leaves, on twisted bark trunks with flared roots. They stand far back, with atmospheric haze.

## Folder map

```
layers/outside/   window view: 6 parallax layers (1280 px wide, tile horizontally)
layers/room/      10 shell (window panes transparent) / 11 shell with wall props baked in
                  20 hearth + prep table + counter / 30 foreground ivy / 40 light overlay
props/roomN/      every prop at 1x (+ _sheet.png; the fire spirit has _idle/_talk/_happy sheets)
props_3x/roomN/   the same at 3x (1080p size)
atlas/            all prop frames packed into one PNG + JSON (anims, fps, layer, default spot)
nature/           stand-alone green trees, flowers, grass, pampas, falling-leaf particles
palette/          the palette (.gpl for Aseprite/GIMP, .hex, swatch PNG)
scene.json        draw order, parallax factors, surfaces, every prop with its default x/y
demo/index.html   open in a browser: drag props, pan the rooms, cycle the fire's mood
preview/          full panorama, each room at 1080p, animated GIFs, a parallax pan (.webp)
generator/        the Python that draws all of it (deterministic, seeded)
```

## Putting it in a game

Draw these back to front:

1. `layers/outside/00_sky` to `05_flowers_close`, each at `screen_x = -camera_x * parallax` and repeated every 1280 px. They only show through the window panes.
2. `layers/room/10_room_shell.png`
3. props with `layer: wall`, then `layer: ceiling`
4. **your customers**
5. `layers/room/20_counter.png`
6. props with `layer: floor`, then `layer: counter`, then `layer: front` (steam)
7. `layers/room/30_foreground` (parallax about 1.12)
8. `layers/room/40_light_overlay` (normal or screen blend)

Default positions are in `scene.json` (`x`, `y` = top-left in scene pixels). Drop surfaces (y where an object's bottom sits) are under `surfaces`: prep table 284, counter 292, window sill 212, room-1 shelf 66, room-3 shelf 176, floor 265.

A few props are exported but not placed by default:

- `drawer_open` is the swap-in for the counter's journal drawer.
- `journal_closed` and `journal_open` are the item and UI versions of the journal.
- `yunomi_*` are single cups you can drag off the tray.

## Previews

- `preview/room_1_3x.png` to `room_4_3x.png`: each room at 1920×1080
- `preview/room1_cook_anim.gif` to `room4_bedroom_anim.gif`: every room animated (2 s loops)
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
| Layout | `generator/layout.py` |
| Rooms | `room.py` (walls, windows), `counter.py` (hearth, table, counter) |
| Props | `props_cook.py`, `props_seating.py`, `props_ritual.py`, `props_bedroom.py` |
| Cloth | `cloth.py` (simulation), `cloth_props.py` |
| Teaware | `teaware.py` |
| Fire spirit | `fire.py` |
| Trees and garden | `trees.py`, `leaves.py`, `outside.py` |
| Colours | `RAMPS` in `pixel.py` |

You can also drag props around in `demo/index.html` and press **copy layout JSON** to get their new positions.
