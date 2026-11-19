"""Put the main menu together: the scene (menu_scene.py), the teahouse
(menu_teahouse.py), the trees (menu_trees.py) and the menu itself
(menu_ui.py), in draw order, into teahouse-assets/main_menu/.

    python3 menu_build.py              # scene layers, previews (png, gif, mp4), scene.json
    python3 menu_build.py --still      # just a still

    main_menu/
      scene.json         every layer in draw order: file, sheet, frames, fps, crop; the UI layout
      layers/<name>/     <name>_sheet.png (frames row by row), <name>.png (frame 0), <name>.json
      ui/                the title sign, the buttons in each state, the cursor, layout.json
      preview/           main_menu_3x.png, main_menu.gif (1x), main_menu.mp4 (1080p)

Everything loops in N frames at 12 fps, except the clouds' second pass if
an engine scrolls them."""
import json
import math
import os
import pickle
import subprocess
import sys
import numpy as np
from PIL import Image
import menu_layout as L

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'main_menu')
LAYERS = os.path.join(ROOT, 'layers')
N, FPS, W, H = L.N, L.FPS, L.W, L.H
MAX_SHEET = 16000

# draw order: (name, source) - 'scene' layers come from menu_scene, the rest from their folders
ORDER = ['00_sky', '01_clouds', '02_mountains', '03_lake', '04_lake_life', '04_birds', '05_hills_trees', 'far_trees',
         '06_ground', '06_river', '06_garden_trees', '07_flowers_close', '08_meadow_back', 'teahouse',
         '09_meadow_front', 'big_tree', 'foliage', 'falling', '10_wind']


def _grid(frames):
    h, w = frames[0].shape[:2]
    cols = max(1, int(math.ceil(h * len(frames) / MAX_SHEET)))
    rows = int(math.ceil(len(frames) / cols))
    out = np.zeros((rows * h, cols * w, 4), np.uint8)
    for i, a in enumerate(frames):
        r, c = i // cols, i % cols
        out[r * h:(r + 1) * h, c * w:(c + 1) * w] = a
    return out, cols, rows


def _bbox(frames):
    m = np.zeros(frames[0].shape[:2], bool)
    for a in frames:
        m |= a[..., 3] > 0
    ys, xs = np.nonzero(m)
    if not len(ys):
        return 0, 0, 1, 1
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def export_scene_layer(name, frames):
    """frames: full-screen RGBA arrays. Written cropped, as a row-major grid."""
    x0, y0, x1, y1 = _bbox(frames)
    crops = [a[y0:y1, x0:x1] for a in frames]
    d = os.path.join(LAYERS, name)
    os.makedirs(d, exist_ok=True)
    sheet, cols, rows = _grid(crops)
    Image.fromarray(sheet, 'RGBA').save(os.path.join(d, f'{name}_sheet.png'), optimize=True)
    Image.fromarray(crops[0], 'RGBA').save(os.path.join(d, f'{name}.png'), optimize=True)
    meta = dict(name=name, frames=len(frames), fps=FPS, x=x0, y=y0, w=x1 - x0, h=y1 - y0, screen=[W, H],
                sheet=f'{name}_sheet.png', sheet_columns=cols, sheet_rows=rows,
                sheet_order='row by row, left to right: frame i is at column i % sheet_columns, row i // sheet_columns',
                frame0=f'{name}.png', loops=True)
    if name == '01_clouds':
        meta['scroll'] = 'optional: the strip tiles sideways; scroll it slowly (0.25 px per frame) for drifting clouds'
    json.dump(meta, open(os.path.join(d, f'{name}.json'), 'w'), indent=1)


def load_layer(name):
    """A layer folder -> N full-screen RGBA frames."""
    d = os.path.join(LAYERS, name)
    meta = json.load(open(os.path.join(d, f'{name}.json')))
    sheet = np.asarray(Image.open(os.path.join(d, meta['sheet'])).convert('RGBA'))
    w, h = meta['w'], meta['h']
    cols = meta.get('sheet_columns', meta.get('sheet_cols', 1))
    out = []
    for i in range(meta['frames']):
        r, c = i // cols, i % cols
        a = np.zeros((H, W, 4), np.uint8)
        blk = sheet[r * h:(r + 1) * h, c * w:(c + 1) * w]
        x0, y0 = meta['x'], meta['y']
        ww, hh = min(w, W - x0), min(h, H - y0)
        a[y0:y0 + hh, x0:x0 + ww] = blk[:hh, :ww]
        out.append(a)
    return out


def scene_layers(cache=None):
    if cache and os.path.exists(cache):
        return pickle.load(open(cache, 'rb'))
    import menu_scene as M
    Ls = {k: [c.a for c in v] for k, v in M.all_layers().items()}
    if cache:
        pickle.dump(Ls, open(cache, 'wb'), protocol=4)
    return Ls


def ui_frames(hover='new_journey'):
    """The menu drawn over the scene: title (animated), signpost, buttons (one hovered), cursor."""
    U = os.path.join(ROOT, 'ui')
    lay = json.load(open(os.path.join(U, 'layout.json')))
    t = lay['title']
    tm = json.load(open(os.path.join(U, t['anim']['json'])))
    tsheet = np.asarray(Image.open(os.path.join(U, tm['sheet'])).convert('RGBA'))
    fw, fh, cols = tm['frame_w'], tm['frame_h'], tm['sheet_cols']
    post = np.asarray(Image.open(os.path.join(U, lay['signpost']['image'])).convert('RGBA'))
    btns = []
    for b in lay['buttons']:
        st = 'hover' if b['id'] == hover else 'normal'
        if st == 'hover':
            strip = np.asarray(Image.open(os.path.join(U, f'btn_{b["id"]}_hover_strip.png')).convert('RGBA'))
            n = strip.shape[1] // b['w']
            ims = [strip[:, k * b['w']:(k + 1) * b['w']] for k in range(n)]
        else:
            ims = [np.asarray(Image.open(os.path.join(U, f'btn_{b["id"]}_normal.png')).convert('RGBA'))]
        btns.append((b, ims, st == 'hover'))
    cur = np.asarray(Image.open(os.path.join(U, 'cursor.png')).convert('RGBA'))
    out = []
    for f in range(N):
        a = np.zeros((H, W, 4), np.uint8)

        def put(img, x, y):
            h_, w_ = img.shape[:2]
            x0, y0 = max(0, x), max(0, y)
            x1, y1 = min(W, x + w_), min(H, y + h_)
            if x0 >= x1 or y0 >= y1:
                return
            s = img[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32)
            d = a[y0:y1, x0:x1].astype(np.float32)
            al = s[..., 3:4] / 255.0
            d[..., :3] = d[..., :3] * (1 - al) + s[..., :3] * al
            d[..., 3] = np.maximum(d[..., 3], s[..., 3])
            a[y0:y1, x0:x1] = d.astype(np.uint8)
        r, c = f // cols, f % cols
        put(tsheet[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw], t['x'], t['y'])
        put(post, lay['signpost']['x'], lay['signpost']['y'])
        for b, ims, hv in sorted(btns, key=lambda q: q[2]):
            put(ims[(f // (FPS // 8 or 1)) % len(ims)] if hv else ims[0], b['x'], b['y'])
        hb = [b for b, _, hv in btns if hv][0]
        put(cur, hb['x'] + hb['w'] - 34, hb['y'] + 16 + (1 if (f // 3) % 4 == 1 else 0))
        out.append(a)
    return out


def compose(all_frames, f, order):
    out = np.zeros((H, W, 3), np.float32)
    for k in order:
        v = all_frames.get(k)
        if v is None:
            continue
        a = v[f % len(v)]
        al = a[..., 3:4].astype(np.float32) / 255.0
        out = out * (1 - al) + a[..., :3] * al
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def main():
    still = '--still' in sys.argv
    cache = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--cache=')), None)
    S = scene_layers(cache)
    if not still:
        for k, v in S.items():
            export_scene_layer(k, v)
    F = dict(S)
    for name in ('far_trees', 'teahouse', 'big_tree', 'foliage', 'falling'):
        if os.path.exists(os.path.join(LAYERS, name, f'{name}.json')):
            F[name] = load_layer(name)
        else:
            print('  (no layer yet:', name + ')')
    F['ui'] = ui_frames()
    order = ORDER + ['ui']
    os.makedirs(os.path.join(ROOT, 'preview'), exist_ok=True)
    fr0 = compose(F, 30, order)
    Image.fromarray(fr0).resize((W * 3, H * 3), Image.NEAREST).save(os.path.join(ROOT, 'preview', 'main_menu_3x.png'))
    Image.fromarray(compose(F, 30, ORDER)).resize((W * 3, H * 3), Image.NEAREST).save(
        os.path.join(ROOT, 'preview', 'main_menu_scene_3x.png'))
    if still:
        return
    frames = [compose(F, f, order) for f in range(N)]
    pal = Image.fromarray(np.concatenate(frames[::12], 0)).quantize(colors=255, method=Image.MEDIANCUT,
                                                                   dither=Image.NONE)
    ims = [Image.fromarray(fr).quantize(palette=pal, dither=Image.NONE) for fr in frames]
    ims[0].save(os.path.join(ROOT, 'preview', 'main_menu.gif'), save_all=True, append_images=ims[1:],
                duration=1000 // FPS, loop=0)
    mp4 = os.path.join(ROOT, 'preview', 'main_menu.mp4')
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r',
                          str(FPS), '-i', '-', '-vf', 'scale=1920:1080:flags=neighbor', '-c:v', 'libx264', '-crf', '21',
                          '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', '24', '-movflags', '+faststart', mp4],
                         stdin=subprocess.PIPE)
    for _ in range(2):                                        # two loops: 16 s
        for fr in frames:
            p.stdin.write(fr.tobytes())
    p.stdin.close()
    p.wait()
    scene = dict(name='Main menu', screen=[W, H], recommended_scale='integer (3x -> 1920x1080), nearest-neighbour',
                 frames=N, fps=FPS, draw_order=[k for k in ORDER if k in F] + ['ui (see ui/layout.json)'],
                 layers={k: f'layers/{k}/{k}.json' for k in ORDER if k in F}, ui='ui/layout.json')
    json.dump(scene, open(os.path.join(ROOT, 'scene.json'), 'w'), indent=1)
    print('done ->', ROOT)


if __name__ == '__main__' and '--page' not in sys.argv:
    main()


# ---------------------------------------------------------------- a playable page
PAGE = r'''<title>Old Rundown Teahouse</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400&display=swap">
<style>
/* One screen: the game's main menu, scaled up crisp, on a dark lacquer surround. */
:root { --bg: #15111a; --ink: #e9dfc8; --muted: #9c9187; --gold: #d9b45c; color-scheme: dark;
  --ui: "Pixelify Sans", "Courier New", monospace; }
html, body { height: 100%; }
body { background: var(--bg); color: var(--ink); font-family: var(--ui); margin: 0;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.wrap { min-height: 100%; display: grid; place-items: center; padding-block: 16px; gap: 10px; align-content: center; }
.screen { width: min(100%, 1920px, calc((100vh - 90px) * 16 / 9)); aspect-ratio: 16 / 9; max-width: 100%; position: relative;
  box-shadow: 0 0 0 3px #2c2330, 0 18px 50px rgba(0,0,0,.55); }
canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; cursor: none; touch-action: manipulation; }
.toast { position: absolute; left: 50%; bottom: 6%; transform: translateX(-50%); background: rgba(21,17,26,.82);
  color: var(--gold); padding: 6px 14px; border: 2px solid #5a4632; font-size: clamp(12px, 1.6vw, 20px); }
p { margin: 0; color: var(--muted); font-size: 14px; text-align: center; }
@media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
</style>
<div class="wrap">
  <div class="screen"><canvas id="c" width="640" height="360" aria-label="Main menu"></canvas>
    <div class="toast" id="toast" hidden></div></div>
  <p>Hover the signpost and click a board.</p>
</div>
<script id="data" type="application/json">__DATA__</script>
<script>
(function () {
  const D = JSON.parse(document.getElementById('data').textContent);
  const c = document.getElementById('c'), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const load = src => { const im = new Image(); im.src = src; return im; };
  D.layers.forEach(l => l.im = load(l.src));
  D.title.im = load(D.title.src);
  D.post.im = load(D.post.src);
  D.buttons.forEach(b => { b.ims = {}; for (const k in b.states) b.ims[k] = load(b.states[k]); b.strip = b.hover_strip && load(b.hover_strip); });
  D.cursor.im = load(D.cursor.src);
  let hover = null, press = null, mx = -99, my = -99, f = 0, last = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function at(e) { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * 640 / r.width, (e.clientY - r.top) * 360 / r.height]; }
  function hit(x, y) { return D.buttons.find(b => !b.disabled && x >= b.hit[0] && x < b.hit[0] + b.hit[2] && y >= b.hit[1] && y < b.hit[1] + b.hit[3]) || null; }
  c.addEventListener('pointermove', e => { [mx, my] = at(e); hover = hit(mx, my); });
  c.addEventListener('pointerleave', () => { hover = null; press = null; mx = my = -99; });
  c.addEventListener('pointerdown', e => { [mx, my] = at(e); hover = hit(mx, my); press = hover; });
  c.addEventListener('pointerup', () => {
    if (press && press === hover) { const t = document.getElementById('toast'); t.textContent = press.label; t.hidden = false;
      clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 1400); }
    press = null; });
  function frame(im, l, i) {
    const cols = l.cols, r = Math.floor(i / cols), k = i % cols;
    g.drawImage(im, k * l.w, r * l.h, l.w, l.h, l.x, l.y, l.w, l.h);
  }
  function draw(t) {
    if (t - last >= 1000 / D.fps) { last = t; if (!reduce) f = (f + 1) % D.frames; }
    g.clearRect(0, 0, 640, 360);
    for (const l of D.layers) if (l.im.complete) frame(l.im, l, f % l.frames);
    const T = D.title; if (T.im.complete) frame(T.im, T, f % T.frames);
    if (D.post.im.complete) g.drawImage(D.post.im, D.post.x, D.post.y);
    const order = D.buttons.slice().sort((a, b) => (a === hover || a === press) - (b === hover || b === press));
    for (const b of order) {
      let im = b.disabled ? b.ims.disabled : (b === press ? b.ims.pressed : (b === hover ? null : b.ims.normal));
      if (!im && b.strip && b.strip.complete) { const n = b.strip_frames, i = Math.floor(f / 1.5) % n;
        g.drawImage(b.strip, i * b.w, 0, b.w, b.h, b.x, b.y, b.w, b.h); continue; }
      if (!im) im = b.ims.hover;
      if (im && im.complete) g.drawImage(im, b.x, b.y);
    }
    if (mx > -50 && D.cursor.im.complete) { const cw = D.cursor.w, i = Math.floor(f / 3) % D.cursor.frames;
      g.drawImage(D.cursor.im, i * cw, 0, cw, D.cursor.h, Math.round(mx) - D.cursor.hx, Math.round(my) - D.cursor.hy, cw, D.cursor.h); }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
</script>
'''


def page(out_html):
    """One self-contained page: every layer sheet and UI image inlined."""
    import base64

    def uri(path):
        return 'data:image/png;base64,' + base64.b64encode(open(path, 'rb').read()).decode()
    sc = json.load(open(os.path.join(ROOT, 'scene.json')))
    layers = []
    for k in sc['draw_order']:
        if k.startswith('ui'):
            continue
        d = os.path.join(LAYERS, k)
        m = json.load(open(os.path.join(d, f'{k}.json')))
        layers.append(dict(src=uri(os.path.join(d, m['sheet'])), x=m['x'], y=m['y'], w=m['w'], h=m['h'],
                           cols=m.get('sheet_columns', m.get('sheet_cols', 1)), frames=m['frames']))
    U = os.path.join(ROOT, 'ui')
    lay = json.load(open(os.path.join(U, 'layout.json')))
    tm = json.load(open(os.path.join(U, lay['title']['anim']['json'])))
    title = dict(src=uri(os.path.join(U, tm['sheet'])), x=lay['title']['x'], y=lay['title']['y'], w=tm['frame_w'],
                 h=tm['frame_h'], cols=tm['sheet_cols'], frames=tm['frames'])
    post = dict(src=uri(os.path.join(U, lay['signpost']['image'])), x=lay['signpost']['x'], y=lay['signpost']['y'])
    buttons = []
    for b in lay['buttons']:
        states = {}
        for st in ('normal', 'hover', 'pressed', 'disabled'):
            pth = os.path.join(U, f'btn_{b["id"]}_{st}.png')
            if os.path.exists(pth):
                states[st] = uri(pth)
        strip = os.path.join(U, f'btn_{b["id"]}_hover_strip.png')
        sw = Image.open(strip).width if os.path.exists(strip) else 0
        hitr = b.get('hit_rect') or [b['x'] + 7, b['y'] + 7, b['w'] - 15, 19]
        buttons.append(dict(id=b['id'], label=b['label'], x=b['x'], y=b['y'], w=b['w'], h=b['h'], states=states,
                            hover_strip=uri(strip) if sw else None, strip_frames=max(1, sw // b['w']), hit=hitr,
                            disabled=False))
    cj = json.load(open(os.path.join(U, 'cursor.json')))
    cim = Image.open(os.path.join(U, 'cursor_strip.png'))
    cfr = cj.get('frames', 4)
    hs = cj.get('hotspot', [2, 2])
    cursor = dict(src=uri(os.path.join(U, 'cursor_strip.png')), w=cim.width // cfr, h=cim.height, frames=cfr,
                  hx=hs[0], hy=hs[1])
    data = dict(fps=FPS, frames=N, layers=layers, title=title, post=post, buttons=buttons, cursor=cursor)
    html = PAGE.replace('__DATA__', json.dumps(data))
    os.makedirs(os.path.dirname(out_html), exist_ok=True)
    open(out_html, 'w').write(html)
    print(f'{out_html}: {os.path.getsize(out_html) / 2 ** 20:.1f} MiB')


if __name__ == '__main__' and '--page' in sys.argv:
    page(sys.argv[sys.argv.index('--page') + 1])
