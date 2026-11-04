"""Build the Copper Sky room: every layer, the animal sprites, the scene data
and previews, into teahouse-assets/copper_sky/.

    python3 cy_build.py            # everything
    python3 cy_build.py --quick    # layers and a still, no video

    copper_sky/
      scene.json                  layers in draw order, frame counts, fps, crops
      layers/outside/             the city (00-10), drawn behind the room
      layers/room/                the room (10-40)
      sprites/                    the pufferfish blimp, the spider, the koi airship:
                                  sheets of trimmed frames + where each frame's anchor is
      preview/                    the scene at 1x and 3x, a gif (1x), an mp4 (1080p)

    python3 cy_build.py --zip OUT.zip   # pack copper_sky/ into a plain zip (art and scene data only)
"""
import json
import math
import os
import subprocess
import sys
import time
import numpy as np
from PIL import Image
import cy_pal  # noqa: F401
from pixel import Canvas
import cy_city as C
import cy_room as R
import cy_beasts as B

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'copper_sky')
FPS = 12
MAX_SHEET = 16000


def _save(cv_or_arr, *p, scale=1):
    path = os.path.join(ROOT, *p)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    a = cv_or_arr.a if hasattr(cv_or_arr, 'a') else cv_or_arr
    im = Image.fromarray(a, 'RGBA')
    if scale > 1:
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    im.save(path, optimize=True)
    return os.path.relpath(path, ROOT).replace(os.sep, '/')


def _bbox(frames):
    m = np.zeros(frames[0].a.shape[:2], bool)
    for f in frames:
        m |= f.a[..., 3] > 0
    ys, xs = np.nonzero(m)
    if len(ys) == 0:
        return 0, 0, 1, 1
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _sheet(arrs):
    """Frames top to bottom, or in a grid of columns when one column would be
    taller than a texture can be."""
    h, w = arrs[0].shape[:2]
    cols = max(1, int(math.ceil(h * len(arrs) / MAX_SHEET)))
    rows = int(math.ceil(len(arrs) / cols))
    out = np.zeros((rows * h, cols * w, 4), np.uint8)
    for i, a in enumerate(arrs):
        c, r = i // rows, i % rows
        out[r * h:(r + 1) * h, c * w:(c + 1) * w] = a
    return out, cols, rows


def export_layer(name, v, group, info):
    frames = v if isinstance(v, list) else [v]
    x0, y0, x1, y1 = _bbox(frames)
    full = (x0, y0, x1, y1) == (0, 0, C.W, C.H) or (x1 - x0) * (y1 - y0) > 0.8 * C.W * C.H
    if full:
        x0, y0, x1, y1 = 0, 0, C.W, C.H
    crops = [f.a[y0:y1, x0:x1] for f in frames]
    rec = dict(name=name, group=group, frames=len(frames))
    rec['file'] = _save(crops[0], 'layers', group, name + '.png')
    if not full:
        rec.update(x=x0, y=y0, w=x1 - x0, h=y1 - y0)
    if len(frames) > 1:
        sh, cols, rows = _sheet(crops)
        rec['sheet'] = _save(sh, 'layers', group, name + '_sheet.png')
        rec['fps'] = FPS
        rec['sheet_columns'], rec['sheet_rows'] = cols, rows
    if name in ('02_searchlights', '09_puffer_beam', '10_near_glow', '11_glass', '40_light'):
        rec['blend'] = 'normal (soft alpha; screen also works for the light beams)'
    info.append(rec)


def export_sprites():
    """The animals on their own, trimmed, with the point each frame hangs from."""
    out = []
    pf, lamps = B.puffer_frames()
    sf, anchors = B.spider_frames()
    kf = B.koi_frames()
    for name, frames, extra, note in (
            ('pufferfish_blimp', pf, dict(searchlight=[[round(x, 1), round(y, 1)] for x, y in lamps]),
             'puffs up and lets the air out once a loop; propellers turn, tail swings, eyes blink'),
            ('copper_spider', sf, dict(cable_anchor=[[round(x, 1), round(y, 1)] for x, y in anchors]),
             'hangs and turns on its cable; legs curl and open, one leg tests the air; furnace core pulses'),
            ('koi_airship', kf, {}, 'swim cycle; move it across the sky yourself')):
        cvs = []
        for a in frames:
            c = Canvas(a.shape[1], a.shape[0])
            c.a = a
            cvs.append(c)
        x0, y0, x1, y1 = _bbox(cvs)
        crops = [a[y0:y1, x0:x1] for a in frames]
        sh, cols, rows = _sheet(crops)
        rec = dict(name=name, frames=len(frames), fps=FPS, frame_w=x1 - x0, frame_h=y1 - y0, sheet_columns=cols,
                   sheet_rows=rows, sheet=_save(sh, 'sprites', name + '_sheet.png'),
                   still=_save(crops[0], 'sprites', name + '.png'), note=note)
        for k, v in extra.items():                                   # in trimmed-frame pixels
            rec[k] = [[p[0] - x0, p[1] - y0] for p in v]
        out.append(rec)
    return out


def compose(L, f):
    out = np.zeros((C.H, C.W, 3), np.float32)
    for k in sorted(L):
        v = L[k]
        cv = v[f % len(v)] if isinstance(v, list) else v
        a = cv.a[..., 3:4].astype(np.float32) / 255.0
        out = out * (1 - a) + cv.a[..., :3] * a
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def previews(L, anims=True):
    os.makedirs(os.path.join(ROOT, 'preview'), exist_ok=True)
    still = compose(L, 40)
    Image.fromarray(still).resize((C.W * 3, C.H * 3), Image.NEAREST).save(os.path.join(ROOT, 'preview',
                                                                                         'copper_sky_3x.png'))
    Image.fromarray(still).save(os.path.join(ROOT, 'preview', 'copper_sky_1x.png'))
    if not anims:
        return
    n = C.LONG
    frames = [compose(L, f) for f in range(n)]
    ims = [Image.fromarray(fr) for fr in frames]
    pal_src = Image.fromarray(np.concatenate(frames[::12], 0)).quantize(colors=255, method=Image.MEDIANCUT,
                                                                        dither=Image.NONE)
    gif = [im.quantize(palette=pal_src, dither=Image.NONE) for im in ims]           # 1x: the native pixels
    gif[0].save(os.path.join(ROOT, 'preview', 'copper_sky.gif'), save_all=True, append_images=gif[1:],
                duration=1000 // FPS, loop=0, optimize=False)
    mp4 = os.path.join(ROOT, 'preview', 'copper_sky.mp4')
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{C.W}x{C.H}',
                          '-r', str(FPS), '-i', '-', '-vf', 'scale=1920:1080:flags=neighbor', '-c:v', 'libx264',
                          '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', '24', '-movflags', '+faststart',
                          mp4], stdin=subprocess.PIPE)
    for _ in range(2):                                              # two loops: 32 s
        for fr in frames:
            p.stdin.write(fr.tobytes())
    p.stdin.close()
    p.wait()


def package(out):
    """A plain zip any phone opens: the art and scene.json, nothing else."""
    import package as PK
    import shutil
    import tempfile
    tmp = tempfile.mkdtemp()
    shutil.copytree(ROOT, os.path.join(tmp, 'Copper_Sky'), ignore=shutil.ignore_patterns('*.mp4'))   # video sent apart
    PK._zip(tmp, out)
    shutil.rmtree(tmp)
    print(f'{out}: {os.path.getsize(out) / 2 ** 20:.1f} MiB')


def main():
    if '--zip' in sys.argv:
        package(sys.argv[sys.argv.index('--zip') + 1])
        return
    quick = '--quick' in sys.argv
    t0 = time.time()
    import shutil
    shutil.rmtree(ROOT, ignore_errors=True)
    Lc = C.all_layers()
    Lr, hole = R.all_layers()
    L = dict(Lc)
    L.update(Lr)
    print(f'layers built in {time.time() - t0:.0f}s')
    info = []
    for name in sorted(L):
        group = 'outside' if (name[:2] < '10' or name.startswith('10_near')) else 'room'
        export_layer(name, L[name], group, info)
    sprites = export_sprites()
    scene = dict(
        name='Copper Sky', note_style='made to sit with the Old Rundown Teahouse pack: same palette rules, '
                                      'same room box, same 640x360 screen',
        native_resolution=[C.W, C.H], recommended_scale='integer (3x -> 1920x1080), nearest-neighbour filtering',
        eye_line_y=C.HZ, vanishing_point=[C.VPX, C.HZ],
        window=dict(near=R.WIN, far=dict(zip(('x0', 'y0', 'x1', 'y1'), R._far_rect()))),
        surfaces=dict(counter_top_y=R.COUNTER_Y, counter=R.COUNTER, window_sill_y=R.WIN['y'] + R.WIN['h'] + 6),
        draw_order='layers sorted by name: outside 00-10, then room 10_shell-40_light',
        loop=dict(fps=FPS, frames=C.LONG, note='most layers loop every 96 frames, the koi, traffic and train every '
                                                '192; play every layer at 12 fps and they line up'),
        crop_note='layers with x, y, w, h are cropped: draw them at (x, y)',
        layers=info, sprites=sprites)
    with open(os.path.join(ROOT, 'scene.json'), 'w') as fh:
        json.dump(scene, fh, indent=1)
    previews(L, anims=not quick)
    print(f'done in {time.time() - t0:.0f}s -> {ROOT}')


if __name__ == '__main__':
    main()
