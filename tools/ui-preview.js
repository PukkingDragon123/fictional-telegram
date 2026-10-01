// Preview for src/ui/frames.js (+ sprites): http://127.0.0.1:5173/tools/ui-preview.html
//   ?mod=next   use src/ui/sprites.next.js instead of src/ui/sprites.js
//   ?zoom=4     scale of the raw frame sheet
import { FRAMES, frameURL, frameStyle, injectFrameCSS } from '/src/ui/frames.js';

const q = new URLSearchParams(location.search);
const S = await import(q.get('mod') === 'next' ? '/src/ui/sprites.next.js' : '/src/ui/sprites.js');
const { spriteImg, hasSprite } = S;
injectFrameCSS();
const app = document.getElementById('app');
const ico = (n, s = 2) => (hasSprite(n) ? spriteImg(n, s) : '');
const fz = +(q.get('zoom') || 4);

let h = '<h1>The Bear Must Eat &mdash; UI frames</h1>';

// raw sheet
h += '<h2>All frames (raw, ' + fz + 'x)</h2><div class="sheet">';
for (const [n, f] of Object.entries(FRAMES)) {
  h += `<div class="fc"><img src="${frameURL(n, fz)}" width="${f.w * fz}" height="${f.h * fz}"><span>${n} ${f.w}x${f.h}${f.fixed ? ' fixed' : ' [' + f.slice + ']'}</span></div>`;
}
h += '</div>';

// mock panels
const panel = (title, body, w = 300, cls = 'f-parchment', rib = 'f-ribbon_green') =>
  `<div style="width:${w}px;position:relative;padding-top:18px">
     <div class="${cls}" style="padding:18px 6px 6px">${body}</div>
     <div class="${rib} ribbon" style="position:absolute;left:24px;right:24px;top:0;height:34px">${title}</div>
   </div>`;
const slots = (names, cls = 'f-slot_gold') => `<div class="row" style="gap:4px">${names.map((n) => `<div class="${cls} slot">${ico(n, 2)}</div>`).join('')}</div>`;

h += '<h2>Panels</h2><div class="row">';
h += panel('BUILD', `
  ${slots(['dam', 'fence', 'feeder', 'lilypad'])}
  <div style="height:6px"></div>
  ${slots(['chair', 'gnome', 'canoe', 'campfire'])}
  <div style="height:8px"></div>
  <div class="row" style="gap:6px">
    <button class="btn f-button_green" style="line-height:14px">BUILD ${ico('hammer', 1)}</button>
    <button class="btn f-button_green_hover" style="line-height:14px">HOVER</button>
    <button class="btn f-button_green_down" style="line-height:14px">DOWN</button>
  </div>
  <div style="height:6px"></div>
  <div class="row" style="gap:6px">
    <button class="btn f-button_red" style="line-height:14px">SELL</button>
    <button class="btn f-button_gold" style="line-height:14px;color:#7a4a12;text-shadow:none">BUY ${ico('coin', 1)}</button>
    <button class="btn f-button_disabled" style="line-height:14px">LOCKED</button>
  </div>`, 320);
h += panel('LEVELS', `
  <div class="row" style="gap:6px;justify-content:center">
    ${[1, 2, 3, 4, 5, 6].map((k) => `<div class="f-medallion" style="display:flex;align-items:center;justify-content:center;font-family:Silkscreen;font-size:22px;color:#fbf0d0;text-shadow:2px 2px 0 #3b2414">${k}</div>`).join('')}
  </div>
  <div style="height:8px"></div>
  <div class="f-bar_track" style="height:20px;width:100%;position:relative"><div class="f-bar_fill_green" style="position:absolute;inset:-4px auto -4px -4px;width:60%"></div></div>
  <div style="height:6px"></div>
  <div class="f-bar_track" style="height:20px;width:100%;position:relative"><div class="f-bar_fill_red" style="position:absolute;inset:-4px auto -4px -4px;width:30%"></div></div>
  <div style="height:6px"></div>
  <div class="f-bar_track" style="height:20px;width:100%;position:relative"><div class="f-bar_fill_gold" style="position:absolute;inset:-4px auto -4px -4px;width:85%"></div></div>
  <div style="height:8px"></div>
  <div class="f-input" style="height:30px;display:flex;align-items:center;font-size:14px">Reynard's Pond</div>
  <div style="height:8px"></div>
  <div class="row" style="gap:4px"><span class="f-chip lbl" style="padding:0 2px">rare</span><span class="f-chip lbl">tasty</span><span class="f-chip lbl">DO NOT EAT</span></div>
  `, 300, 'f-parchment_dark', 'f-ribbon_red');
h += `<div style="width:260px">
  <div class="row" style="gap:0;align-items:flex-end;padding-left:10px"><div class="f-tab_active lbl" style="height:32px;padding:0 4px">Fish</div><div class="f-tab lbl" style="height:32px">Bears</div><div class="f-tab lbl" style="height:32px">Lab</div></div>
  <div class="f-wood" style="padding:6px;color:#fbf0d0">${slots(['fish', 'fish_gold', 'egg', 'honey'])}<div style="height:6px"></div>
    <div class="row" style="gap:6px"><div class="f-plaque" style="color:#fbf0d0;font-family:Silkscreen;font-size:13px;display:flex;align-items:center;gap:4px">${ico('coin', 1)} 1,240</div><div class="f-plaque" style="color:#fbf0d0;font-family:Silkscreen;font-size:13px;display:flex;align-items:center;gap:4px">${ico('fish', 1)} 37</div></div>
  </div>
  <div style="height:10px"></div>
  <div class="f-wood_dark" style="padding:6px;color:#fbf0d0;font-size:13px">Dark wood panel: night shift report.</div>
  <div style="height:10px"></div>
  <div class="f-tooltip" style="color:#fbf0d0;font-size:12px;display:inline-block">Tooltip: Muskoka chair<br><span style="color:#ffd23f">+3 beauty</span></div>
</div>`;
h += '</div>';

// skill nodes
h += '<h2>Skill nodes</h2><div class="row" style="gap:6px;align-items:center">';
h += ['dna', 'flask', 'gear', 'egg'].map((n, i) => `<div class="${i === 1 ? 'f-slot_gold_active' : 'f-slot_brass'} slot">${ico(n, 2)}</div>`).join('<div style="width:16px;height:4px;background:#e5c06a;border:1px solid #5c4219"></div>');
h += '<div style="width:16px;height:4px;background:#5e5c6c"></div>';
h += ['lock', 'lock'].map((n) => `<div class="f-slot_locked slot">${ico(n, 2)}</div>`).join('');
h += '</div>';

// bubbles
h += '<h2>Comic bubbles</h2><div class="row" style="align-items:flex-end">';
const emos = Object.keys(S.SPRITES).filter((n) => n.startsWith('emo_'));
for (let k = 0; k < emos.length; k += 5) {
  h += `<div style="position:relative;padding-bottom:16px"><div class="f-bubble_bw sb">${emos.slice(k, k + 5).map((n) => ico(n, 2)).join('')}</div><div class="f-bubble_tail" style="position:absolute;left:18px;bottom:0px"></div></div>`;
}
h += `<div style="position:relative;padding-bottom:22px"><div class="f-bubble_think sb" style="font-size:13px">${ico('emo_fish', 2)} fish&hellip;</div><div class="f-think_tail" style="position:absolute;left:10px;bottom:0"></div></div>`;
h += `<div class="f-bubble_bw" style="font-size:14px;max-width:180px">Hey! That fish is <b>mine</b>! ${ico('emo_anger', 2)}</div>`;
h += '</div>';

// ledger with stamps & stickers
h += '<h2>Ledger, stamps &amp; stickers</h2><div class="row">';
h += `<div class="f-wood" style="padding:8px"><div class="f-paper_ledger" style="width:520px;height:250px;position:relative;font-size:14px;line-height:24px">
  <div style="position:absolute;left:4px;top:0">Q3 &mdash; Fish sales ........ 1,240<br>Bear damage ........... -380<br>Syrup imports ......... -60<br>Profit ................ <b>800</b></div>
  <div style="position:absolute;right:6px;top:4px;transform:rotate(-8deg)">${ico('stamp_Aplus', 2)}</div>
  <div style="position:absolute;right:110px;top:110px;transform:rotate(5deg)">${ico('stamp_approved', 2)}</div>
  <div style="position:absolute;left:10px;top:150px;transform:rotate(-4deg)">${ico('stamp_overdue', 2)}</div>
  <div style="position:absolute;left:260px;top:4px;transform:rotate(-12deg)">${ico('sticker_good', 2)}</div>
  <div style="position:absolute;left:330px;top:180px;transform:rotate(10deg)">${ico('sticker_wow', 2)}</div>
  <div class="f-sticky_note" style="position:absolute;left:150px;top:150px;width:110px;height:84px;font-size:12px;line-height:14px;transform:rotate(3deg)">${ico('fox_smug', 1)} See me after work. &mdash;R</div>
</div></div>`;
h += `<div class="f-parchment" style="width:340px;padding:4px"><div class="row" style="gap:6px">${Object.keys(S.SPRITES).filter((n) => n.startsWith('sticker_')).map((n) => ico(n, 2)).join('')}</div>
  <div style="height:8px"></div><div class="row" style="gap:6px">${Object.keys(S.SPRITES).filter((n) => n.startsWith('stamp_')).map((n) => ico(n, 1)).join('')}</div></div>`;
h += '</div>';

// eggs
h += '<h2>Eggs by rarity &times; crack stage</h2><div class="f-wood_dark" style="display:inline-block;padding:8px">';
for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
  h += `<div class="row" style="gap:8px;align-items:center"><span style="width:90px;color:#fbf0d0;font-size:12px">${r}</span>${[0, 1, 2, 3].map((s) => ico(`egg_${r}_${s}`, 3)).join('')}</div>`;
}
h += '</div>';

// CRT
h += '<h2>CRT</h2><div class="f-crt" style="width:300px;height:160px;color:#7dffa8;font-family:Silkscreen;font-size:13px;padding:2px 4px;text-shadow:0 0 4px #2f8a4a">REYNARD CORP<br>&gt; fish: 37<br>&gt; bears: hungry_</div>';
h += `<h2>frameStyle('button_green', 3)</h2><div class="sub" style="font-family:monospace;font-size:11px;color:#fbf0d0;word-break:break-all;max-width:900px">${frameStyle('button_green', 3).replace(/url\("data:[^"]+"\)/, 'url("data:…")')}</div>`;

app.innerHTML = h;
window.__ready = true;
