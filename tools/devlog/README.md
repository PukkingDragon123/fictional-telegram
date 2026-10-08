# Devlog videos ("day N of making my dream game")

Ten vertical videos (1080x1920, 30 fps, 15–30 s each) for TikTok / Reels / Shorts that tell The Bear
Must Eat's story as a 10-day devlog, narrated: from a prototype made of nothing but squares to the
real game. Output: `promo/devlog/day-01.mp4` … `day-10.mp4`, with ready-to-paste post captions
in `promo/devlog/CAPTIONS.md`.

Built the way devlogs that do well are built: the voice starts on frame one, the action is already
moving, one idea per video (a bug, a new system, a before/after), word-by-word captions, and a
question at the end for the comments. Day 7 is a "replying to your comments" video: a viewer asks
for a banana fish, and the banana fish is now actually in the game (`src/data/species.js`,
`src/art/fishArt.js`).

| day | what it shows | footage |
| --- | --- | --- |
| 1 | the idea, the square prototype, bug #1: the bear walks through the fox and on water | squares |
| 2 | square fish wander and breed, bug #2: every fish swims into one corner, the fix | squares |
| 3 | 5 PM: every bear runs to the pond, cannonballs in, eats everything in 10 seconds | squares |
| 4 | Reynard built cube by cube, too many animations, replacing the orange square | squares |
| 5 | the bears: turnaround, the lineup, the brown squares get promoted | squares |
| 6 | the world gets drawn: grass, trees, lily pads, real fish, day/night | squares → game |
| 7 | replying to a comment: drawing a banana fish pixel by pixel and putting it in the pond | game |
| 8 | the building system and the bears' diner in use | game |
| 9 | game feel: no juice vs juice | game |
| 10 | title screen, montage, day 1 vs day 10 | game + squares |

## Pieces

- `vo/script.json` — every day's narration, line by line (`[id, text, pause after]`).
  `vo.py` speaks it with Kokoro-82M (open-weights TTS, run offline with `kokoro-onnx`, voice
  `am_fenrir`) into `vo/<day>.wav`, and writes `vo/<day>.json` with the start/end of every line and
  every word (for the captions and for timing the edit):
  `HOME=<dir with an espeak-ng-data link> python -I tools/devlog/vo.py kokoro.onnx voices.npz day01 …`.
  To use your own voice instead, read a day's lines in one take (in script order, about half a
  second between lines) and run `vo.py --own day01 my-day01.wav`: it finds the lines at the
  pauses, times the words for the captions, and keeps your audio as it is. Then re-render.
- `sandbox.html` / `sandbox.js` — the prototype: a world made only of squares and cubes (checker
  tiles, a blocky pond, cube trees and office, a brown-square bear, an orange-square fox, flat
  square fish), drawn through the game's own `PixelRenderer` so it is pixel art from day one.
  Also the cube-by-cube Reynard build, the bear turnaround/lineup and the "squares become real"
  swaps. One shot per load: `sandbox.html?shot=q3_rush&skip=2.6`. Seeded, so shots that share a
  simulation (`q3_door` / `q3_rush` / `q3_empty`) line up.
- `clipdefs.mjs` — every clip (prototype shots `dl_q*`, real-game shots `g*` / `gb_*`), recorded
  with the gig-video recorder: `node tools/video/clips.mjs dl_q1_wide … --defs tools/devlog/clipdefs.mjs`
  (frames land in `tools/video/clips/<name>/`, with per-frame anchors and the sounds they made).
- `days.js` — the ten edits, each a function of its voice-over timing (cuts land on words).
- `foxhost.js` — Reynard as the host: the game's FoxRig rendered small with an ink outline and
  drawn pixelated over the video. He hops / runs between spots, pulls faces, plays gags (stomp,
  facepalm, faint, hat pop, monocle drop) and gets cartoon FX (anger veins, sweat, "!", "?",
  hearts, $$$), all from per-day `fox` beats in `days.js`, and lip-flaps through every line.
- `director.html` / `director.js` — plays one day at 1080x1920: clips with punch-ins, follow-zooms
  and splits; Reynard's speech bubble typed out word by word in the game's pixel font
  (TBME Goofy, lowercase, `*shouted*` words big and red); pixel-art stickers
  (arrow, ring, bug tags, the "reply to comment" bubble, the 5 PM clock, a pixel editor drawing
  the banana fish, the end card).
- `render.mjs` — `node tools/devlog/render.mjs day01 [day02 …]`: frames under virtual time, music
  and sound effects from the game's own synth (`tools/video/mix.html`), the voice-over on top
  (cleaned up: low cut, compression, presence) with the music dipping under it, the whole mix at
  -14 LUFS, two-pass H.264 into `promo/devlog/`. A day's `song` (`tools/devlog/music/<file>.mp3`,
  your own files, git-ignored) gives a second version in `promo/devlog/with-music/`.
- `peek.mjs` / `dpeek.mjs` — stills from a sandbox shot / from a day, for checking framing.

Needs the game's dev server: `npx vite --port 5281 --host 127.0.0.1 --strictPort`
(or point `VIDEO_TB` at another port).

Fonts: the captions and stickers use the game's own TBME Goofy; `fonts/` has Nunito and JetBrains
Mono for the sandbox's labels (SIL Open Font License, `fonts/OFL.txt`).
