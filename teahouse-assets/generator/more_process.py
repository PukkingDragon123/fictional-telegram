"""More speedpaints, painted the same plain way as artist_process.py: the
Copper Sky room, and a model sheet of each copper animal.

    python3 teahouse-assets/generator/more_process.py OUT_DIR [room puffer spider koi]

Each writes <name>_speedpaint.mp4 (canvas only, 1920x1080, one frame per
stroke or dab), <name>_layers.psd and <name>_final.png:
  1 a loose sketch: for the room the perspective lines first, then the shape
    of everything; one shape drawn in the wrong spot and dragged over, an
    idea tried and rubbed out
  2 every piece on its own layer, back to front: line art, bucket fill, the
    big shapes, then worked up a small area at a time, dark to light, with
    now and then a dab in the wrong colour picked again; the canvas flipped
    to check
  3 the light with a soft brush
  4 then it is played: the finished picture starts to move.

Not part of the build or the asset zip."""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np                                      # noqa: E402
from PIL import Image                                   # noqa: E402
import artist_process as AP                             # noqa: E402
from artist_process import Doc, Timelapse, Painter, rub, grow, silhouette_paths, distort, outline_of  # noqa: E402

DK = (72, 58, 66)
PAPER = (244, 240, 230)


def _over(dst, src):
    a = src[..., 3:4].astype(np.float32) / 255.0
    dst[..., :3] = dst[..., :3] * (1 - a) + src[..., :3] * a
    return dst


def run(out_dir, name, pieces, size, scale, seed, play=None, vp=None, soft=(), lines_for=None, pace=1.0):
    """pieces: [(layer name, rgba)] back to front. play(f) -> rgb frame of the
    living picture for the ending. vp: (x, y) to start with perspective lines."""
    w, h = size
    rng = random.Random(seed)
    doc = Doc(w, h, PAPER)
    tl = Timelapse(doc, scale, os.path.join(out_dir, name + '_speedpaint.mp4'))
    pn = Painter(doc, tl, seed)
    tl.shot(12)
    ra = 0.75
    Pg = None
    if vp is not None:                                            # perspective lines, one undone
        Pg = doc.add('Perspective')
        blue = (110, 150, 215)
        VX, VY = vp
        pn.stroke(Pg, [(0, VY), (w - 1, VY)], color=blue, alpha=0.7, wob=0.25)
        for k, (px, py) in enumerate(((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (VX - 160, 0),
                                      (VX + 160, 0), (VX - 220, h - 1), (VX + 220, h - 1))):
            if k == 3:
                snap = pn.snapshot(Pg)
                pn.stroke(Pg, [(VX, VY), (px - 70, py)], color=blue, alpha=0.7, wob=0.2)
                tl.shot(4)
                pn.undo(Pg, snap, 2)
            pn.stroke(Pg, [(VX, VY), (px, py)], color=blue, alpha=0.7, wob=0.2)
        tl.shot(4)
    # 1 the sketch
    R = doc.add('Sketch')
    sk = [(nm, img) for nm, img in pieces if nm not in soft and (img[..., 3] > 0).sum() > 40]
    moved = False
    for i, (nm, img) in enumerate(sk):
        m = img[..., 3] > 0
        area = int(m.sum())
        paths = silhouette_paths(m, eps=2.2 if area > 3000 else 1.4, down=2 if area > 800 else 1, minlen=4)
        if not paths:
            continue
        ys, xs = np.nonzero(m)
        paths = distort(paths, rng, (xs.mean(), ys.mean()), scale=0.03, rot=1.5, off=1.5)
        every = 3 if area > 20000 else (2 if area > 2000 else 1)
        if not moved and 600 < area < 15000 and i > 0:
            moved = True
            dx = 34 if xs.mean() < w / 2 else -34
            tmp = doc.add('Sketch (copy)')
            for pth in paths:
                pn.curve(tmp, np.asarray(pth) - (dx, 0), seg=(16, 40), wob=0.8, over=3, color=DK, alpha=ra, every=every)
            tl.shot(6)
            pn.move(tmp, tmp['a'][..., 3] > 0, dx, 0, steps=7)
            tl.shot(3)
            mm = tmp['a'][..., 3] > 0
            R['a'][mm] = tmp['a'][mm]
            doc.remove(tmp)
            Doc.touch(R)
            continue
        for pth in paths:
            pn.curve(R, pth, seg=(16, 40), wob=0.8, over=3, color=DK, alpha=ra, every=every)
        if i == len(sk) // 2:                                     # an idea tried and rubbed out
            ex, ey = rng.randint(w // 5, w // 2), rng.randint(h // 5, h // 2)
            ew, eh = max(16, w // 9), max(12, h // 8)
            tried = np.zeros((h, w), bool)
            for c in ([(ex, ey), (ex + ew, ey + 2)], [(ex + ew, ey + 2), (ex + ew - 2, ey + eh)],
                      [(ex + ew - 2, ey + eh), (ex - 1, ey + eh - 1)], [(ex - 1, ey + eh - 1), (ex, ey)],
                      [(ex + 4, ey + eh // 3), (ex + ew - 4, ey + eh // 3 + 1)]):
                tried |= pn.curve(R, c, seg=(20, 60), wob=0.8, over=3, color=DK, alpha=ra)
            tl.shot(10)
            region = grow(tried, 2)
            for k in range(4):
                pn.stroke(R, [(ex - 4 + k * ew // 3, ey - 4), (ex + 2 + k * ew // 3, ey + eh + 4)],
                          size=max(4, ew // 6), erase=True, clip=region)
            rub(R, region)
            Doc.touch(R)
            tl.shot(3)
    tl.shot(8)
    if Pg is not None:
        pn.fade(Pg, 0.3)
    pn.flip(14)
    pn.fade(R, 0.45)
    # 2 the pieces, back to front
    for i, (nm, img) in enumerate(pieces):
        m = img[..., 3] > 0
        area = int(m.sum())
        if area < 6:
            continue
        L = doc.add(nm, below=R)
        if nm in soft:
            pn.soft(L, m, max(6, w // 40), math.radians(20), img, frames=16)
            tl.shot(3)
            continue
        if (lines_for is None or nm in lines_for) and area > 300:
            ol = outline_of(img, m)
            if ol.sum() > 12:
                pn.lines(L, img, ol, run=max(4, int(12 / pace)), frames=max(4, int(math.sqrt(ol.sum()) * 0.9 * pace)))
        pn.paint(L, img, m, frames=max(10, int(math.sqrt(area) * 1.1 * pace)),
                 tile=28 if area > 40000 else (14 if pace == 1 else 6))
        if i % 4 == 3:
            tl.shot(4)
        if i == int(len(pieces) * 0.6):
            pn.flip(12)
    pn.hide(R, 4)
    if Pg is not None:
        pn.hide(Pg, 2)
    tl.shot(10)
    pn.flip(14)
    tl.shot(int(AP.FPS * 1.5))
    comp = doc.composite()
    # 4 it comes alive: the real animation, each 12 fps frame held for the video's frame rate
    if play is not None:
        hold = AP.FPS // 12
        for f in range(12 * 6):
            img = play(f)
            data = np.repeat(np.repeat(img, scale, 0), scale, 1).tobytes()
            for _ in range(hold):
                tl.proc.stdin.write(data)
                tl.n += 1
    n = tl.close()
    AP.save_psd(doc, os.path.join(out_dir, name + '_layers.psd'), 2)
    Image.fromarray(comp).resize((w * 2, h * 2), Image.NEAREST).save(os.path.join(out_dir, name + '_final.png'))
    print('%s: %d frames (%.1f s), %d layers' % (name, n, n / AP.FPS, len(doc.layers)))


# ---------------------------------------------------------------- the Copper Sky room
def room(out_dir):
    import cy_city as C
    import cy_room as R
    L = dict(C.all_layers())
    Lr, _ = R.all_layers()
    L.update(Lr)
    pick = {'04_koi': 70, '07_train': 60}                        # frames where they are in view

    def fr(k, f=0):
        v = L[k]
        return v[(pick.get(k, 0) + f) % len(v)].a if isinstance(v, list) else v.a
    groups = [('Sky', ['00_sky', '01_clouds']), ('Searchlights', ['02_searchlights']),
              ('Far city', ['03_far', '03_far_lights']), ('Koi airship', ['04_koi']), ('Traffic', ['05_traffic']),
              ('Near towers', ['06_mid', '06_mid_lights']), ('Train', ['07_train']), ('Smoke', ['08_smoke']),
              ('Pufferfish blimp', ['09_puffer']), ('Searchlight beam', ['09_puffer_beam']),
              ('Roofs', ['10_near']), ('Lamp glow', ['10_near_glow']), ('Room', ['10_shell']),
              ('Glass', ['11_glass']), ('Pipes and cables', ['12_pipes_cables']), ('Plants', ['12_sill_plants']),
              ('Lanterns', ['13_lanterns']), ('Spider', ['14_spider']), ('Counter', ['20_counter']),
              ('Samovar, lamp, books', ['21_counter_props']), ('Posts', ['30_foreground']), ('Light', ['40_light'])]
    pieces = []
    for nm, ks in groups:
        a = np.zeros((C.H, C.W, 4), np.float32)
        for k in ks:
            s = fr(k).astype(np.float32)
            al = s[..., 3:4] / 255.0
            a[..., :3] = a[..., :3] * (1 - al) + s[..., :3] * al
            a[..., 3] = np.maximum(a[..., 3], s[..., 3])
        pieces.append((nm, np.clip(a + 0.5, 0, 255).astype(np.uint8)))
    soft = ('Searchlights', 'Searchlight beam', 'Lamp glow', 'Glass', 'Light')

    def play(f):
        out = np.zeros((C.H, C.W, 3), np.float32)
        out[:] = PAPER
        for k in sorted(L):
            out = _over(out, fr(k, f).astype(np.float32))
        return np.clip(out + 0.5, 0, 255).astype(np.uint8)
    run(out_dir, 'copper_sky', pieces, (C.W, C.H), 3, 811, play=play, vp=(C.VPX, C.HZ), soft=soft,
        lines_for=('Pufferfish blimp', 'Spider', 'Koi airship', 'Lanterns', 'Samovar, lamp, books', 'Plants', 'Counter'))


# ---------------------------------------------------------------- model sheets of the animals
CANVASES = [(192, 108, 10), (240, 135, 8), (320, 180, 6), (384, 216, 5), (480, 270, 4)]   # all 1920x1080


def _trim(frames):
    m = np.zeros(frames[0].shape[:2], bool)
    for a in frames:
        m |= a[..., 3] > 0
    ys, xs = np.nonzero(m)
    return [a[ys.min():ys.max() + 1, xs.min():xs.max() + 1] for a in frames]


def _layout(fw, fh, k):
    """The smallest canvas the poses fit on with room round them: in a row, or two rows."""
    for (w, h, sc) in CANVASES:
        for rows in (1, 2):
            cols = int(math.ceil(k / rows))
            if cols * fw * 1.25 + fw * 0.2 <= w and rows * fh * 1.3 + fh * 0.15 <= h:
                gx = (w - cols * fw) // (cols + 1)
                gy = (h - rows * fh) // (rows + 1)
                spots = [(gx + (i % cols) * (fw + gx), gy + (i // cols) * (fh + gy)) for i in range(k)]
                return (w, h, sc), spots
    raise ValueError('too big')


def sheet(out_dir, name, frames, poses, seed):
    """The animal in a few poses on one canvas, as big as they fit; then they move."""
    fr = _trim(frames)
    fh, fw = fr[0].shape[:2]
    (w, h, sc), spots = _layout(fw, fh, len(poses))
    pieces = []
    for k, (p, (x, y)) in enumerate(zip(poses, spots)):
        a = np.zeros((h, w, 4), np.uint8)
        a[y:y + fh, x:x + fw] = fr[p]
        pieces.append((f'{name} {k + 1}', a))
    n = len(fr)

    def play(f):
        out = np.zeros((h, w, 3), np.float32)
        out[:] = PAPER
        for k, (p, (x, y)) in enumerate(zip(poses, spots)):
            a = np.zeros((h, w, 4), np.uint8)
            a[y:y + fh, x:x + fw] = fr[(p + f) % n]
            out = _over(out, a.astype(np.float32))
        return np.clip(out + 0.5, 0, 255).astype(np.uint8)
    run(out_dir, name, pieces, (w, h), sc, seed, play=play, pace=3.0)


def main(out_dir, which):
    os.makedirs(out_dir, exist_ok=True)
    import cy_beasts as B
    if 'puffer' in which:
        f, _ = B.puffer_frames()
        sheet(out_dir, 'pufferfish_blimp', f, (0, 40), 901)
    if 'spider' in which:
        f, _ = B.spider_frames()
        sheet(out_dir, 'copper_spider', f, (0, 30, 60), 902)
    if 'koi' in which:
        sheet(out_dir, 'koi_airship', B.koi_frames(), (0, 12), 903)
    if 'room' in which:
        room(out_dir)


if __name__ == '__main__':
    args = [a for a in sys.argv[2:] if not a.startswith('--')]
    main(sys.argv[1], tuple(args) if args else ('puffer', 'spider', 'koi', 'room'))
