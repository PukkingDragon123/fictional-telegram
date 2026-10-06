# Gig video (tools/video)

A ~74 s Fiverr gig video, made from the real games running frame by frame, with
The Bear Must Eat's own UI on top. Output: `promo/fiverr/pukking-gig-video.mp4`
(1280x720, 30 fps, H.264 + AAC).

## How it works

1. **Virtual time** (`vtime.js`, injected by `rec.mjs`): `requestAnimationFrame`,
   `performance.now`, `Date`, timers and CSS animations only move when the recorder
   steps the clock, so every frame renders fully, even at seconds per frame on a
   software GPU.
2. **Clips** (`clips.mjs` + `clipdefs.mjs`): each clip loads a game page, sets up a
   scene, then steps and saves `clips/<name>/fNNNN.jpg`. Its `meta.json` holds
   per-frame anchors (Reynard's head on screen) and every game sound call.
   - The Bear Must Eat (dev server on :5281): the title-pond bear gag, the 5 PM rush
     (a staged pond, our own camera moves), the bedroom wake-up, the classroom
     chalkboard (portfolio), and the duck/fox/bear line-up (`tools/promo/stage.js`).
   - Deli-very-dead (its own dev server on :5290): the title dollies, an autopilot
     ride on the forest road, a front tracking shot on the road to the covered bridge,
     and a wheelie on Main Street.
   - `mudkip` / `shore` are frames extracted from `portfolio/media/*.mp4` with ffmpeg:
     `ffmpeg -i portfolio/media/mudkips-garden.mp4 -vf fps=30,scale=1280:-2 -q:v 3 -start_number 0 tools/video/clips/mudkip/f%04d.jpg`
     (and `-t 3` on `sunset-shore.mp4` -> `clips/shore`).
3. **Director** (`director.html` / `director.js` / `timeline.js` / `overlays.js`):
   plays the clips as a timeline and drives the game's own UI over them:
   - Reynard climbing into the corner (FoxNotifier), and speech bubbles with
     babble (Bubbles);
   - the pixel wipes (Transition) and the "new area" scroll (ZoneBanner);
   - the parcel unboxing (Unbox) and the title sign (TitleMenu);
   - paper tags and polaroids (paper.js).
4. **Sound** (`mix.html` / `mix.js`): the director's sound log plus the clips' game
   sounds are re-rendered with the game's synth (`src/audio/audio.js`): music moods,
   SFX and babble, in an OfflineAudioContext. The result is mixed to a WAV.
5. **Encode** (`render.mjs`): screenshots every director frame, mixes the sound, and
   runs ffmpeg.

## Run

```bash
npx vite --port 5281 --host 127.0.0.1                     # this repo
(cd ../redesigned-octo-adventure && NOHMR=1 npx vite --port 5290 --host 127.0.0.1)
node tools/video/clips.mjs tb_gag tb_wake tb_bears tb_ideas tb_lineup
node tools/video/clips.mjs dv_title dv_ride dv_bridge dv_wheelie   # slow: ~4 s/frame
node tools/video/render.mjs main            # --every N for a quick preview, --audio-only
```

`clips/` and `out/` are scratch (gitignored).
