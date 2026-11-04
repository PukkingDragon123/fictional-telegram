"""A speedpaint of the seasons: one picture - the garden and the lake as you see
them from the seating-room window - painted by hand, then painted again for
each season on a layer of its own.

    python3 teahouse-assets/generator/season_process.py OUT_DIR [--cache=DIR] [--set=weather]

--set=weather paints summer, then the rains, the eclipse and the blood moon
over it, and writes weather_* instead of seasons_*.

writes seasons_speedpaint.mp4 (the canvas only, like a Procreate timelapse,
1920x1080 - a 384x216 canvas at 5x - one frame per stroke or dab), seasons_layers.psd (the sketch kept
but hidden; one layer per piece of spring, then one each for summer, autumn
and winter), and seasons_<season>.png.

How it goes, the plain way a pixel artist works:
  1 a loose sketch: the horizon, the line of the mountains, the far shore, the
    shape of each tree, the flower bed. One tree is drawn in the wrong place
    and dragged over; an extra tree is tried and rubbed out.
  2 spring painted back to front: sky, clouds, mountains, lake, the far
    hills, the garden trees (line art first), the flowers - each one bucket
    filled, its big shapes blocked in, then worked up a small area at a time,
    dark to light. Now and then a dab in the wrong colour, picked again.
  3 summer, autumn, winter: a new layer each, and only what changes is
    painted on it. The autumn trees go down too red first and are slid back;
    a cloud is painted in summer and deleted; the canvas is flipped to check.
  4 then the season layers are switched on and off, so the year goes round.

Not part of the build or the asset zip."""
import math
import os
import pickle
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np                                      # noqa: E402
from PIL import Image                                   # noqa: E402
import artist_process as AP                             # noqa: E402
from artist_process import Doc, Timelapse, Painter, reveal, rub, grow, silhouette_paths, distort, outline_of  # noqa
import layout as LY                                     # noqa: E402

SEASONS = ('spring', 'summer', 'autumn', 'winter')
PREFIX = 'seasons'
SETS = {'seasons': ('spring', 'summer', 'autumn', 'winter'), 'weather': ('summer', 'rain', 'eclipse', 'bloodmoon')}
VW, VH = LY.SW, LY.SH                                            # the whole outside view
CAM = LY.WIN_MAIN['x'] + LY.WIN_MAIN['w'] // 2 - LY.SW // 2      # the camera on the seating-room window
CROP = (124, 0, 508, 216)            # the canvas: the garden round the window, 16:9 (the rest is under the room)
W, H = CROP[2] - CROP[0], CROP[3] - CROP[1]
SCALE = 5                            # 384x216 -> 1920x1080
NAMES = {'00_sky': 'Sky', '01_clouds': 'Clouds', '02_mountains': 'Mountains', '03_lake': 'Lake',
         '05_hills_trees': 'Far shore', '06_garden_trees': 'Garden trees', '07_flowers_close': 'Flower bed'}


def _place(frames, fac, off):
    """One outside layer as it sits in the window view (frame 0)."""
    from pixel import Canvas
    import outside
    cv = Canvas(CAM + VW, VH)
    ox, oy = off[0] if off else (0, 0)
    origin = int(round(CAM * (1 - fac)))
    x = origin % outside.OUT_W - outside.OUT_W
    while x < CAM + VW:
        cv.blit(frames[0], x + ox, oy)
        x += outside.OUT_W
    return cv.a[:, CAM:CAM + VW].copy()


def views(cache=None):
    """{season: (pieces [(name, rgba)], final rgba)} for the window view."""
    path = cache and os.path.join(cache, f'{PREFIX}_views_v1.pkl' if PREFIX != 'seasons' else 'season_views_v1.pkl')
    if path and os.path.exists(path):
        return pickle.load(open(path, 'rb'))
    import season
    import outside
    out = {}
    for s in SEASONS:
        season.set_season(s)
        pieces = []
        for name, frames, fac, *off in outside.all_layers():
            if name in NAMES:
                pieces.append((name, _place(frames, fac, off)))
        fin = np.zeros((VH, VW, 4), np.uint8)
        for _, p in pieces:
            m = p[..., 3] > 0
            fin[m] = p[m]
        out[s] = (pieces, fin)
        print(f'  {s} view drawn')
    season.set_season('summer')
    if path:
        os.makedirs(cache, exist_ok=True)
        pickle.dump(out, open(path, 'wb'), protocol=4)
    return out


def _top_edge(m):
    """The upper outline of a shape, as (x, y) points across it."""
    pts = []
    for x in range(0, m.shape[1], 3):
        ys = np.nonzero(m[:, x])[0]
        if len(ys):
            pts.append((x, int(ys[0])))
    return pts


def _simplify(pts, eps=2.0):
    return [tuple(p) for p in AP.rdp(np.asarray(pts, float), eps)] if len(pts) > 2 else pts


def main(out_dir, cache=None):
    from scipy import ndimage
    os.makedirs(out_dir, exist_ok=True)
    x0, y0, x1, y1 = CROP
    V = {s: ([(nm, p[y0:y1, x0:x1].copy()) for nm, p in pcs], fin[y0:y1, x0:x1].copy())
         for s, (pcs, fin) in views(cache).items()}
    rng = random.Random(77 if PREFIX == 'seasons' else 91)
    paper = (244, 240, 230)
    doc = Doc(W, H, paper)
    tl = Timelapse(doc, SCALE, os.path.join(out_dir, f'{PREFIX}_speedpaint.mp4'))
    pn = Painter(doc, tl, 501)
    tl.shot(14)
    pieces, spring = V[SEASONS[0]]
    P = dict(pieces)
    dk = (72, 58, 66)
    ra = 0.75
    yy, xx = np.mgrid[0:H, 0:W]

    # 1 the sketch
    Sk = doc.add('Sketch')
    hz = 150
    for nm in ('03_lake',):
        ys = np.nonzero((P[nm][..., 3] > 0).any(1))[0]
        if len(ys):
            hz = int(ys[0])
    pn.curve(Sk, [(0, hz), (W - 1, hz)], seg=(80, 200), wob=0.6, over=6, color=dk, alpha=ra)
    mt = P['02_mountains'][..., 3] > 0
    ridge = _simplify(_top_edge(mt & (yy < hz)), 2.5)
    if len(ridge) > 2:
        pn.curve(Sk, ridge, seg=(30, 70), passes=2, wob=0.9, over=3, color=dk, alpha=ra, every=2)
    shore = P['05_hills_trees'][..., 3] > 0
    sl = _simplify(_top_edge(shore), 2.5)
    if len(sl) > 2:
        pn.curve(Sk, sl, seg=(30, 70), wob=0.9, over=3, color=dk, alpha=ra, every=2)
    trees = P['06_garden_trees'][..., 3] > 0
    lab, n = ndimage.label(trees, np.ones((3, 3), int))
    sizes = ndimage.sum(trees, lab, range(1, n + 1)) if n else []
    big = [i + 1 for i in np.argsort(sizes)[::-1] if sizes[i] > 300]
    moved = False
    for k, li in enumerate(big):
        m = lab == li
        paths = silhouette_paths(m, eps=2.4, down=2, minlen=4)
        ys_, xs_ = np.nonzero(m)
        paths = distort(paths, rng, (xs_.mean(), ys_.mean()), scale=0.03, rot=1.5, off=1.5)
        if not moved and 2000 < m.sum() < 40000:                      # drawn in the wrong spot, dragged over
            moved = True
            dx = 40 if xs_.mean() < W / 2 else -40
            tmp = doc.add('Sketch (copy)')
            for pth in paths:
                pn.curve(tmp, np.asarray(pth) - (dx, 0), seg=(16, 40), wob=0.8, over=3, color=dk, alpha=ra, every=2)
            tl.shot(8)
            pn.move(tmp, tmp['a'][..., 3] > 0, dx, 0, steps=8)
            tl.shot(3)
            mm = tmp['a'][..., 3] > 0
            Sk['a'][mm] = tmp['a'][mm]
            doc.remove(tmp)
            Doc.touch(Sk)
            continue
        for pth in paths:
            pn.curve(Sk, pth, seg=(16, 40), wob=0.8, over=3, color=dk, alpha=ra, every=2)
        if k == 1:                                                    # an extra tree tried, rubbed out
            ex, ey = rng.randint(120, 260), hz + 20
            tried = np.zeros((H, W), bool)
            for c in ([(ex, ey + 70), (ex + 2, ey + 30)], [(ex - 26, ey + 32), (ex - 30, ey - 6), (ex, ey - 26),
                                                           (ex + 32, ey - 4), (ex + 28, ey + 32), (ex - 26, ey + 32)]):
                tried |= pn.curve(Sk, c, seg=(20, 50), wob=0.9, over=3, color=dk, alpha=ra)
            tl.shot(12)
            region = grow(tried, 2)
            for j in range(5):
                pn.stroke(Sk, [(ex - 40 + j * 18, ey - 30), (ex - 30 + j * 18, ey + 74)], size=9, erase=True,
                          clip=region)
            rub(Sk, region)
            Doc.touch(Sk)
            tl.shot(4)
    fl = P['07_flowers_close'][..., 3] > 0
    fe = _simplify(_top_edge(fl), 3.0)
    if len(fe) > 2:
        pn.curve(Sk, fe, seg=(40, 90), wob=1.0, over=4, color=dk, alpha=ra, every=2)
    tl.shot(10)
    pn.flip(14)
    pn.fade(Sk, 0.4)

    # 2 spring, back to front
    layers = {}
    for name, img in pieces:
        m = img[..., 3] > 0
        area = int(m.sum())
        if area < 20:
            continue
        L = doc.add(SEASONS[0].capitalize() + ' - ' + NAMES[name], below=Sk)
        layers[name] = L
        if name in ('06_garden_trees', '07_flowers_close', '05_hills_trees', '02_mountains'):
            ol = outline_of(img, m)
            if ol.sum() > 12:
                pn.lines(L, img, ol, run=14, frames=max(6, int(math.sqrt(ol.sum()) * 0.9)))
        fr = int(math.sqrt(area) * (0.75 if name in ('00_sky', '03_lake') else 1.15))
        pn.paint(L, img, m, frames=max(16, fr), tile=32 if area > 40000 else 18)
        tl.shot(4)
        if name == '03_lake':
            pn.flip(12)
    tl.shot(16)
    pn.hide(Sk, 4)
    season_layers = {SEASONS[0]: [L for L in doc.layers if L['name'].startswith(SEASONS[0].capitalize())]}

    # 3 the other seasons: only what changes, on a layer of its own
    prev = spring
    for s in SEASONS[1:]:
        pcs, fin = V[s]
        G = doc.add(s.capitalize(), below=Sk)
        season_layers[s] = [G]
        diff = (fin[..., :3] != prev[..., :3]).any(-1) | ((fin[..., 3] > 0) != (prev[..., 3] > 0))
        top = np.full((H, W), -1)
        for i, (_, img) in enumerate(pcs):
            top[img[..., 3] > 0] = i
        tl.shot(10)
        for i, (name, img) in enumerate(pcs):
            region = diff & (top == i)
            area = int(region.sum())
            if area < 24:
                continue
            base_src = None
            if s == 'autumn' and name == '06_garden_trees':           # too red first, then slid back
                base_src = fin.copy()
                base_src[..., 0] = np.clip(fin[..., 0].astype(int) + 60, 0, 255)
                base_src[..., 1] = np.clip(fin[..., 1].astype(int) - 40, 0, 255)
                base_src[..., 3] = 255
            if name in ('06_garden_trees', '07_flowers_close'):
                ol = outline_of(fin, region)
                if ol.sum() > 12:
                    pn.lines(G, fin, ol & region, run=14, frames=max(6, int(math.sqrt(ol.sum()) * 0.7)))
            fr = int(math.sqrt(area) * (0.6 if name in ('00_sky', '03_lake') else 0.95))
            pn.paint(G, fin, region, frames=max(12, fr), tile=28 if area > 30000 else 16, base_src=base_src)
            if s == SEASONS[1] and name == '01_clouds':                 # a cloud painted, then deleted
                Lx = doc.add('cloud?', below=Sk)
                cx, cy = rng.randint(80, 300), rng.randint(30, 60)
                blob = (((xx - cx) / 38.0) ** 2 + ((yy - cy) / 13.0) ** 2 < 1) | \
                    (((xx - cx - 22) / 22.0) ** 2 + ((yy - cy + 9) / 12.0) ** 2 < 1)
                src = np.zeros((H, W, 4), np.uint8)
                src[..., :3] = (250, 250, 244)
                src[..., 3] = 255
                src[blob & (yy > cy + 4), :3] = (214, 220, 232)
                pn.paint(Lx, src, blob, frames=24, tile=14, shapes=False, slips=0)
                tl.shot(14)
                Lx['visible'] = False
                Doc.touch(Lx)
                tl.shot(8)
                doc.remove(Lx)
                tl.shot(2)
        tl.shot(12)
        pn.flip(12)
        prev = fin

    # 4 the year goes round: the season layers switched on and off
    order = list(SEASONS)

    def show(upto):
        for k, s in enumerate(order[1:], 1):
            for L in season_layers[s]:
                L['visible'] = k <= upto
                Doc.touch(L)
    for rnd in range(2):
        for k in range(4):
            show(k)
            tl.shot(int(AP.FPS * (1.1 if rnd == 0 else 0.7)))
    show(0)
    tl.shot(int(AP.FPS * 1.2))
    show(3)
    tl.shot(int(AP.FPS * 2.5))
    n = tl.close()
    AP.save_psd(doc, os.path.join(out_dir, f'{PREFIX}_layers.psd'), 2)
    for k, s in enumerate(order):
        show(k)
        Image.fromarray(doc.composite()).resize((W * 2, H * 2), Image.NEAREST).save(
            os.path.join(out_dir, f'{PREFIX}_{s}.png'))
        err = int(np.abs(doc.composite().astype(int) - V[s][1][..., :3].astype(int)).max())
        print(f'  {s}: max diff from the window view {err}')
    print(PREFIX + ': %d frames (%.1f s), %d layers' % (n, n / AP.FPS, len(doc.layers)))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    cache = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--cache=')), None)
    PREFIX = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--set=')), 'seasons')
    SEASONS = SETS[PREFIX]
    main(args[0] if args else os.path.join(HERE, '..', 'process'), cache)
