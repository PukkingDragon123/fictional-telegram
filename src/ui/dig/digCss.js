// [v32 dig] Styles for the dig tray, the lab bench and the vial button (injected once).
// Pixel look: hard 2-3px ink borders, hard offset shadows, the game's pixel fonts,
// no blur and no smooth gradients.
let done = false;
export function injectDigCSS() {
  if (done) return;
  done = true;
  const st = document.createElement('style');
  st.id = 'dig-css';
  st.textContent = `
.dg-wrap{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(18,12,8,.72);pointer-events:auto;animation:dgIn .22s steps(4) both}
.dg-wrap.out{animation:dgOut .2s steps(4) both}
@keyframes dgIn{from{opacity:0}to{opacity:1}} @keyframes dgOut{to{opacity:0}}
.dg-box{display:flex;flex-direction:column;gap:6px;width:var(--dgw,680px)}
.dg-head,.dg-foot{display:flex;align-items:center;gap:10px;justify-content:space-between}
.dg-site{display:flex;flex-direction:column;line-height:1}
.dg-site b{font-family:var(--font-title);font-weight:400;font-size:24px;color:#fff6e4;text-shadow:2px 2px 0 #2a1a14}
.dg-site em{font-style:normal;font-family:var(--font-title);font-size:15px;text-shadow:1px 1px 0 #2a1a14}
.dg-cond{display:flex;align-items:center;gap:6px;background:#f4e8c8;border:3px solid #2a1a14;box-shadow:3px 3px 0 #2a1a14;padding:3px 8px 2px;transform:rotate(-1.5deg)}
.dg-cond canvas,.dg-tape canvas{image-rendering:pixelated;display:block}
.dg-cname{font-family:var(--font-title);font-size:16px;text-shadow:1px 1px 0 #2a1a14}
.dg-stage{position:relative}
.dg-cv{display:block;image-rendering:pixelated;cursor:none;touch-action:none}
.dg-tip{position:absolute;left:50%;top:-6px;transform:translate(-50%,-100%);font-family:var(--font-title);font-size:16px;color:#2a1a14;background:#fff6e4;border:3px solid #2a1a14;box-shadow:3px 3px 0 #2a1a14;padding:3px 10px 1px;white-space:nowrap;pointer-events:none}
.dg-tip.bad{background:#ffd8c8;color:#8a1a14}
.dg-tip.pop{animation:dgPop .3s steps(3)}
@keyframes dgPop{0%{transform:translate(-50%,-100%) scale(1.25)}100%{transform:translate(-50%,-100%) scale(1)}}
.dg-tools{display:flex;gap:6px}
.dg-tool,.dg-leave,.dg-rok{display:inline-flex;align-items:center;gap:5px;font-family:var(--font-title);font-size:17px;color:#2a1a14;background:#e8d4a8;border:3px solid #2a1a14;box-shadow:0 4px 0 #2a1a14;padding:3px 10px 2px;cursor:pointer;position:relative;top:0}
.dg-tool:hover,.dg-leave:hover,.dg-rok:hover{background:#f6e6c0;top:-1px}
.dg-tool:active,.dg-leave:active,.dg-rok:active{top:3px;box-shadow:0 1px 0 #2a1a14}
.dg-tool.on{background:#ffd23f;box-shadow:0 4px 0 #2a1a14,inset 0 0 0 2px #fff6c0}
.dg-tool kbd,.dg-leave kbd,.dg-rok kbd{font-family:var(--font-title);font-size:11px;background:#2a1a14;color:#f4e8c8;padding:0 3px;border-radius:0}
.dg-ico{image-rendering:pixelated}
.dg-leave{background:#c8a890}
.dg-tape{display:flex;align-items:center;gap:6px;font-family:var(--font-title);font-size:16px;color:#fff6e4;text-shadow:1px 1px 0 #2a1a14}
.dg-result{position:absolute;left:50%;bottom:8%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;background:#f4e8c8;border:3px solid #2a1a14;box-shadow:4px 4px 0 #2a1a14;padding:8px 16px 10px;animation:dgCard .35s steps(5) both;max-width:80%}
@keyframes dgCard{from{transform:translate(-50%,40px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
.dg-rtag{font-family:var(--font-title);font-size:14px;color:#fff;background:var(--rc);border:2px solid #2a1a14;padding:1px 8px 0;text-shadow:1px 1px 0 #2a1a14}
.dg-rname{font-family:var(--font-title);font-size:22px;color:#2a1a14}
.dg-rstamp{font-family:var(--font-title);font-size:20px;color:var(--sc);border:3px solid var(--sc);padding:0 8px;transform:rotate(-6deg);text-shadow:1px 1px 0 #2a1a14;animation:dgStamp .3s steps(3) .25s both}
@keyframes dgStamp{from{transform:rotate(-6deg) scale(2.2);opacity:0}to{transform:rotate(-6deg) scale(1);opacity:1}}
.dg-rline{font-family:var(--font-body);font-size:14px;color:#4a2a14;text-align:center}
/* ---------------- the lab bench */
.lb-wrap{position:fixed;inset:0;z-index:78;display:flex;align-items:center;justify-content:center;background:rgba(18,12,8,.6);pointer-events:auto;animation:dgIn .2s steps(4) both}
.lb-wrap.out{animation:dgOut .2s steps(4) both}
.lb-box{position:relative;width:min(860px,96vw);max-height:94vh;display:flex;flex-direction:column;background:#f4e8c8;border:3px solid #2a1a14;box-shadow:6px 6px 0 #2a1a14,inset 0 0 0 3px #e2cfa0;padding:10px 12px 12px;font-family:var(--font-body);color:#2a1a14}
.lb-top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.lb-top h2{flex:1;margin:0;font-family:var(--font-title);font-weight:400;font-size:24px;color:#6a3a14;text-shadow:2px 2px 0 #e2cfa0}
.lb-tab{font-family:var(--font-title);font-size:16px;padding:3px 10px 1px;border:3px solid #2a1a14;background:#e2cfa0;cursor:pointer;color:#2a1a14;position:relative;top:0}
.lb-tab.on{background:#ffd23f}
.lb-tab:hover{top:-1px}
.lb-x{font-family:var(--font-title);font-size:16px;border:3px solid #2a1a14;background:#e8b8a0;cursor:pointer;padding:2px 8px 0}
.lb-body{display:flex;gap:10px;min-height:0;overflow:auto}
.lb-crate{width:150px;flex:none;display:flex;flex-direction:column;gap:4px;background:#8b5a2b;border:3px solid #2a1a14;padding:6px;max-height:60vh;overflow:auto}
.lb-crate h3,.lb-side h3{margin:0 0 2px;font-family:var(--font-title);font-weight:400;font-size:15px;color:#fff6e4;text-shadow:1px 1px 0 #2a1a14}
.lb-spec{display:flex;align-items:center;gap:6px;background:#e8d4a8;border:2px solid #2a1a14;padding:2px 4px;cursor:pointer;font-family:var(--font-title);font-size:13px;line-height:1.05}
.lb-spec.on{background:#ffd23f}
.lb-spec img{image-rendering:pixelated}
.lb-spec i{display:block;width:8px;height:8px;border:2px solid #2a1a14;flex:none}
.lb-empty{font-size:13px;color:#fff6e4;opacity:.9}
.lb-mid{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}
.lb-cv{display:block;image-rendering:pixelated;cursor:none;border:3px solid #2a1a14;touch-action:none}
.lb-say{font-family:var(--font-title);font-size:15px;background:#fff;border:3px solid #2a1a14;padding:3px 10px 1px;box-shadow:3px 3px 0 #2a1a14;max-width:100%;text-align:center}
.lb-card{display:flex;gap:10px;align-items:center;background:#fffaf0;border:3px solid #2a1a14;padding:6px 10px;box-shadow:3px 3px 0 #2a1a14;width:100%;box-sizing:border-box}
.lb-card .nm{font-family:var(--font-title);font-size:20px}
.lb-card .er{font-size:13px;color:#7a5a3a}
.lb-card .fc{font-size:14px}
.lb-btns{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.lb-b{display:inline-flex;align-items:center;gap:4px;font-family:var(--font-title);font-size:16px;color:#2a1a14;border:3px solid #2a1a14;box-shadow:0 4px 0 #2a1a14;padding:3px 10px 1px;cursor:pointer;background:#e8d4a8;position:relative;top:0}
.lb-b:hover{top:-1px;background:#f6e6c0} .lb-b:active{top:3px;box-shadow:0 1px 0 #2a1a14}
.lb-b.gold{background:#ffd23f} .lb-b.green{background:#9ad86a} .lb-b.red{background:#f0a090}
.lb-b[disabled]{opacity:.5;cursor:default;top:0}
.lb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px;width:100%}
.lb-cell{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;background:#fffaf0;border:2px solid #2a1a14;padding:4px 2px 3px;font-family:var(--font-title);font-size:12px;line-height:1;text-align:center;cursor:pointer}
.lb-cell.unk{background:#e2cfa0;cursor:default}
.lb-cell.shown{background:#fff2b0;box-shadow:inset 0 0 0 2px #ffb020}
.lb-cell b{position:absolute;right:2px;top:2px;font-size:11px;background:#2a1a14;color:#fff6e4;padding:0 3px}
.lb-cell img{image-rendering:pixelated}
.lb-vial{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%}
.lb-slots{display:flex;gap:8px;align-items:center;font-family:var(--font-title);font-size:22px}
.lb-slot{width:58px;height:58px;display:flex;align-items:center;justify-content:center;border:3px dashed #8a6a44;background:#fffaf0}
.lb-slot.ok{border-style:solid;border-color:#2a1a14}
.lb-slot img{image-rendering:pixelated}
.lb-note{font-size:14px;text-align:center;max-width:520px}
.fsc-btn.vial{background:#c8f0a0}
`;
  document.head.appendChild(st);
}
