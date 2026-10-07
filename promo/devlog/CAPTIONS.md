# Devlog posts: captions, hashtags, voice-over

Ten vertical videos (1080x1920, 30 fps, 15–21 s each, -14 LUFS). One a day, same time each day
(evenings work well). Every video is narrated (voice-over from `tools/devlog/vo/script.json`), with
word-by-word captions burned in, so post with the video's original sound. The music and sound
effects are the game's own synth, so there is nothing to license.

- **Cover:** the first frame already has the "day N of making my dream game" hook, so pick an early frame.
- **Comments:** reply to every comment in the first hour. Day 7 is built from a comment
  ("add a banana fish"). When real comments come in, use TikTok's "reply with video" on the one
  you build next. That is the format this series is set up for.
- **Hashtags:** 3–5 on TikTok; the longer set on Instagram.

**TikTok:** `#gamedev #indiedev #devlog #pixelart #cozygames`
**Instagram:** `#gamedev #indiedev #devlog #indiegame #pixelart #cozygames #gamedevelopment #solodev #indiegamedev #gamedevlog #cozygaming #threejs`

---

### Day 1 — `day-01.mp4`
day 1 of making my dream game 🐻 the bear walked through me and then on water. great start 😭 #gamedev #indiedev #devlog #pixelart #cozygames

### Day 2 — `day-02.mp4`
day 2: square fish 🐟 one missing line of code and every fish went to the corner 💀 what fish should i add?

### Day 3 — `day-03.mp4`
day 3: 5 PM 🕔 every office bear runs to my pond. it took them 10 seconds to eat everything

### Day 4 — `day-04.mp4`
day 4: the orange square is now Reynard 🦊🎩 built him cube by cube. goodbye square 🫡

### Day 5 — `day-05.mp4`
day 5: the brown squares got promoted 🐻 office bear, grandma, construction, the CEO… which one are you?

### Day 6 — `day-06.mp4`
day 6: drew the whole world 🌲 same pond as day 1. night is my favorite 🌙

### Day 7 — `day-07.mp4`
replying to your comments: you asked for a banana fish 🍌🐟 so it's in the game now. it hatches from an egg. the bears eat it. what should i add next? 👇

### Day 8 — `day-08.mp4`
day 8: you can build a little restaurant around the pond now 🔨 at 5 PM the bears actually use it 🥹

### Day 9 — `day-09.mp4`
day 9: the game worked but felt dead, so i added juice 🧃 before vs after. which one would you play?

### Day 10 — `day-10.mp4`
day 10 🐻🐟 ten days ago this was a brown square walking on water. should i keep going? 🫶

---

## Voice-over

The narration is generated offline with Kokoro-82M, an open-weights text-to-speech model, using the
`af_heart` voice. The scripts are in `tools/devlog/vo/script.json`.

Your own voice will always feel more real. Read a day's lines in one take, in order, with about
half a second between lines, then run `vo.py --own day01 my-day01.wav` and re-render with
`node tools/devlog/render.mjs day01`. The captions and cuts follow your timing (see
`tools/devlog/README.md`).
