# Pukking's portfolio

A cozy 3D classroom portfolio in the style of *The Bear Must Eat*. Reynard the fox plays **Pukking**: he walks to the chalkboard, draws in chalk, taps things with his pointer and explains the work, while a class of fish students reacts. It reuses the game's own classroom diorama, chalkboard engine, fox rig, pixel renderer, fonts, paper UI and synthesized audio from `src/`.

```bash
npm run dev:portfolio     # http://127.0.0.1:5174/
npm run build:portfolio   # static site in dist-portfolio/
```

`dist-portfolio/` is plain static files (relative paths): upload it to GitHub Pages, Netlify, or zip it for an itch.io HTML5 upload. It has to be served over http(s); opening `index.html` straight from disk (`file://`) is blocked by the browser's module rules.

Dev flags: `?chapter=games` jumps straight into a lesson, `?idle=1` skips the title sign and the bedroom, `?debug=1` shows renderer info and any errors, and `window.__pf` exposes the rooms for the console. Visitors never see an error box for harmless browser noise; only a 3D view that keeps failing shows a short "reload" note.

## What's inside

| Piece | What it does |
| --- | --- |
| Bedroom | Pukking asleep in bed, voxel Zs floating up. Click him: stars burst out, he jumps up, changes into his teacher suit and walks you to class. |
| Hello lesson | The introduction, all in the classroom: who I am; where I'm from (chalk Thai temple, plane and maple leaf on the board while a voxel Earth pops up above it, `Globe3D.js`: Thai and Canadian flag pins, a plane flying the dotted Thailand → Vancouver route, labels on the pins); how I build; what I make; my goals as a chalk checklist. It starts by itself the first time you reach the classroom. |
| Classroom | Almost no UI: every object is a lesson. The fox (hello), the chalkboard (skills), the globe (games), the bookshelf (pixel art), the desk (Minecraft mods), the bell (hire me), the wall frames (gallery), the window (day / night), the door (the pond outside). Floating 3D voxel icons mark them (`Icons3D.js`); hovered ones grow, spin and sparkle. |
| Voxel particles | `VoxelFX.js`: cubes burst out of whatever you click and bounce on the floor, clicking the floor pops floorboard voxels, chalk dust falls from the chalk while the fox writes, a finished lesson ends in gold voxel confetti, and dust drifts through the window light. The camera leans a little with the mouse. |
| Lessons | Real game lesson scripts: chalk text and doodles drawn stroke by stroke, the fox walks and taps, the speech box has the live 3D talking fox, gold-star stamp at the end. Click / Space / Enter to advance, `Esc` to leave. |
| Projector screen | A pull-down screen that rolls over the chalkboard and plays the gameplay clips and screenshots. |
| Gallery | The framed pictures on the walls (Minecraft dimension and mob, Mudkip's Garden, Sunset Shore) open full size. |
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
main.js             boot, title, bedroom, classroom, hotspots, labels, particles, bubbles, hire-me letter
Globe3D.js          the voxel Earth with the Thailand -> Vancouver flight (hello lesson)
VoxelFX.js          voxel bursts, confetti, chalk dust, sleepy Zs and dust in the rooms
Icons3D.js          the floating voxel icons over the clickable things
Bedroom.js          the fox's bedroom (the game's bedroom scene): wake him up
Gallery.js          the wall frames and the full-size picture viewer
PortfolioRoom.js    the game's Classroom, made persistent (extends src/game/Classroom.js)
ProjectorScreen.js  the roll-down screen (video / image on a canvas texture)
content.js          all words, links, media and chapter scripts
doodles.js          extra chalk doodles (fox, cube, </>, palette, grass block, ...)
icons.js            small pixel icons for pins and buttons
fallback.js         no-WebGL HTML version
portfolio.css       wooden signs, kraft tags, pins, modals
media/              gameplay clips (mp4 + webm), posters and screenshots
```
