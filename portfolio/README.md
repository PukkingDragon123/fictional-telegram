# Pukking's portfolio

A cozy 3D classroom portfolio in the style of *The Bear Must Eat*. Reynard the fox plays **Pukking**: he walks to the chalkboard, draws in chalk, taps things with his pointer and explains the work, while a class of fish students reacts. It reuses the game's own classroom diorama, chalkboard engine, fox rig, pixel renderer, fonts, paper UI and synthesized audio from `src/`.

```bash
npm run dev:portfolio     # http://127.0.0.1:5174/
npm run build:portfolio   # static site in dist-portfolio/
```

`dist-portfolio/` is plain static files (relative paths): upload it to GitHub Pages, Netlify, or zip it for an itch.io HTML5 upload. It has to be served over http(s); opening `index.html` straight from disk (`file://`) is blocked by the browser's module rules.

Dev flags: `?chapter=games` jumps straight into a lesson, `?idle=1` skips the intro, `?intro=0` shows the old title sign instead of the intro, `?debug=1` shows renderer info, and `window.__pf` exposes the room for the console.

## What's inside

| Piece | What it does |
| --- | --- |
| Voxel intro | The opening (`VoxelIntro.js`): ~900 cubes fly in and snap into a chunky 3D "PUKKING" logo on a floating voxel island, then burst and rebuild into a new voxel model for each card: who I am, Thailand → Vancouver, what I make, my goals, come inside. Click the blocks to knock them apart; *Skip intro* or *Enter class* goes to the classroom with a block wipe. The words are `INTRO` in `content.js`. |
| Voxel effects | In the classroom (`VoxelFX.js`, `Icons3D.js`): 3D voxel icons float over everything you can click, cubes burst out of whatever you click and bounce on the floor, clicking the floor pops floorboard voxels, a lesson you finish ends in gold voxel confetti, and voxel dust drifts through the window light. |
| Title sign | The game's wooden title sign and kraft tag, rebranded (with `?intro=0`). "Enter class" starts the first lesson. |
| Class schedule | Six lessons (chapters): Hello, Toolkit, Games, Pixel Art, MC Mods, Hire Me. Finished lessons get a gold star; keys `1`-`6` also work. |
| Lessons | Real game lesson scripts: chalk text and doodles drawn stroke by stroke, the fox walks and taps, the speech box has the live 3D talking fox, gold-star stamp at the end. Click / Space / Enter to advance, `Esc` or *End lesson* to leave, *x3* to fast-forward. |
| Projector screen | A pull-down screen that rolls over the chalkboard and plays the gameplay clips and screenshots (*Watch bigger* opens them full size). |
| Pins | Clickable things in the free-roam room: the fox (quips), the desk bell (opens the hire-me letter), the window (day / night), the fish class (cheer), the globe (itch.io). |
| Fallback | Browsers without WebGL get a plain HTML version generated from the same content. |

## Editing the content

Everything the site says lives in **`content.js`**; you never need to touch the engine.

- `SITE` / `LINKS`: your name, tagline, itch.io links, and optional `email`, `discord` and `other` buttons for the hire-me letter (empty = hidden).
- `MEDIA`: the clips and images shown on the projector screen (files live in `media/`).
- `CHAPTERS`: each chapter is a list of steps: `say` (the fox's words, `**bold**` turns yellow), `draw` (chalk items on a 192x108 slate), `tap` (what the pointer touches), `screen: 'mediaId'`, `link`, `expr`, `react`, `cam`... See the header of `content.js` and `src/game/Classroom.js` for every key.
- `QUIPS`: what the fox says when you click him in free-roam.

New chalk doodles are generated in `doodles.js` (letter code: UPPERCASE = outline, lowercase = hatched fill, `K` = dark, `*` = highlight).

Two names in `content.js` are placeholders you may want to change: **Sunset Shore** (the second screen recording) and the Minecraft captions (**Custom dimension**, **Custom mob**).

## Files

```
index.html          page shell
main.js             boot, voxel intro, title, schedule, pins, bubbles, media viewer, hire-me letter
VoxelIntro.js       the opening: voxel logo + one voxel model per intro card
VoxelFX.js          voxel bursts, confetti and dust in the classroom
Icons3D.js          the floating voxel icons over the clickable things
PortfolioRoom.js    the game's Classroom, made persistent (extends src/game/Classroom.js)
ProjectorScreen.js  the roll-down screen (video / image on a canvas texture)
content.js          all words, links, media and chapter scripts
doodles.js          extra chalk doodles (fox, cube, </>, palette, grass block, ...)
icons.js            small pixel icons for pins and buttons
fallback.js         no-WebGL HTML version
portfolio.css       wooden signs, kraft tags, pins, modals
media/              gameplay clips (mp4 + webm), posters and screenshots
```
