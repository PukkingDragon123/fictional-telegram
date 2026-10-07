# Devlog videos ("day N of making my dream game")

Ten vertical videos (1080x1920, 30 fps) for TikTok / Reels / Shorts that tell The Bear Must Eat's
story as a 10-day devlog: from a greybox prototype (shapes only) to the real game. Output:
`promo/devlog/day-01.mp4` … `day-10.mp4`, with ready-to-paste post captions in `promo/devlog/CAPTIONS.md`.

| day | what it shows | footage |
| --- | --- | --- |
| 1 | the idea on a notebook page, the greybox, a pill bear that walks through the fox and on water | sandbox |
| 2 | fish: wander + breeding, the "everyone in one corner" bug, the fix | sandbox |
| 3 | 5 PM rush: bears pour out of the office, cannonball in, eat everything | sandbox |
| 4 | Reynard: concept sketch, voxel-by-voxel build, animation test, replacing the cube | sandbox |
| 5 | the bears: turntable poses, the lineup, real bears in the greybox | sandbox |
| 6 | the pixel-art renderer step by step (low res, outlines, grade), before/after wipe | sandbox |
| 7 | the real world art + a day/night cycle | game |
| 8 | the building system and the restaurant in use | game |
| 9 | game feel: no juice vs juice | game |
| 10 | title screen, montage, day 1 vs day 10 | game + sandbox |

## Pieces

- `sandbox.html` / `sandbox.js` — the "prototype" builds: a greybox world (grid ground, blue pond,
  box office, cone trees) with pill bears, sphere fish and a cube fox; a voxel editor turntable
  (Reynard rebuilt voxel by voxel from his own models); the real rigs dropped into the greybox; and
  the same scene through the game's `PixelRenderer` with its stages switched on one by one.
  One shot per load: `sandbox.html?shot=d3_rush&skip=2.6`. Seeded, so shots that share a
  simulation (`d3_door` / `d3_rush` / `d3_empty`) line up.
- `clipdefs.mjs` — every clip (sandbox shots `dl_*`, real-game shots `g*_`), recorded with the
  gig-video recorder: `node tools/video/clips.mjs dl_d1_orbit … --defs tools/devlog/clipdefs.mjs`
  (frames land in `tools/video/clips/<name>/`, with per-frame anchors and the sounds they made).
- `director.html` / `director.js` — plays one day at 1080x1920: clips with zooms, wipes and
  splits, plus the overlays a person adds in a phone editor (white-box hook, outlined captions,
  red handwriting with arrows and circles, a notebook page drawing itself, a code editor typing,
  a stats box / debug HUD / tweak panel, stickers, end card). `doodles.js` has the notebook
  pages, `snippets.js` the on-screen code, `days.js` the ten timelines.
- `render.mjs` — `node tools/devlog/render.mjs day01 [day02 …]`: frames under virtual time,
  sound mix with the game's synth (`tools/video/mix.html`), two-pass H.264 into `promo/devlog/`.
- `peek.mjs` / `dpeek.mjs` — stills from a sandbox shot / from a day, for checking framing.

Needs the game's dev server: `npx vite --port 5281 --host 127.0.0.1 --strictPort`.
Fonts in `fonts/` are Nunito, Caveat and JetBrains Mono (SIL Open Font License, `fonts/OFL.txt`).
