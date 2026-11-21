"""Speedpaints of the traveler's props and the teahouse, painted the way artist_process.py
paints the goat-dragon and the gecko: a loose construction sketch, a redo, line art a run of
pixels at a time, bucket-filled flats, then the shading worked up area by area from dark to
light, the highlights last, a canvas flip to check, and the finished piece held.

    python3 teahouse-assets/generator/prop_speedpaint.py OUT_DIR [seal omamori tea_kit suitcase teahouse]
"""
import os
import sys
import math
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import artist_process as AP                                 # noqa: E402
from artist_process import Doc, Timelapse, Painter, silhouette_paths, distort, outline_of, _lum, FPS  # noqa: E402
from pixel import PAL                                       # noqa: E402

A = os.path.join(HERE, '..')
PIECES = {
    'seal': ('traveler_kit/seal_plush_clean/seal_plush_clean.png', 6),
    'omamori': ('traveler_kit/omamori_charm_clean/omamori_charm_clean.png', 6),
    'tea_kit': ('traveler_kit/tea_kit_clean/tea_kit_clean.png', 6),
    'suitcase': ('traveler_kit/suitcase_clean/suitcase_clean.png', 6),
    'teahouse': ('main_menu/layers/teahouse/teahouse.png', 5),
}


def _groups(final, solid, k=6, seed=3):
    """The piece's colours split into k material groups (k-means on colour), each with a flat
    mid-tone, the way a painter blocks in local colour before any light."""
    P = final[solid][:, :3].astype(np.float32)
    rng = np.random.default_rng(seed)
    cen = P[rng.choice(len(P), k, replace=False)]
    for _ in range(16):
        lab = ((P[:, None] - cen[None]) ** 2).sum(-1).argmin(1)
        for j in range(k):
            if (lab == j).any():
                cen[j] = P[lab == j].mean(0)
    lab_img = np.full(solid.shape, -1)
    lab_img[solid] = lab
    flat = final.copy()
    for j in range(k):
        m = lab_img == j
        if m.any():
            cols = final[m][:, :3].astype(np.float32)
            med = cols[np.argsort(_lum(cols))[len(cols) // 2]]           # a real colour from the piece
            flat[m, :3] = med.astype(np.uint8)
    order = sorted(range(k), key=lambda j: -int((lab_img == j).sum()))   # big shapes first
    return lab_img, flat, order


def speedpaint(name, path, scale, out_dir, seed=0):
    img = np.asarray(Image.open(os.path.join(A, path)).convert('RGBA'))
    pad = 10
    h, w = img.shape[0] + 2 * pad, img.shape[1] + 2 * pad
    h, w = h + h % 2, w + w % 2                                  # the video wants even sizes
    final = np.zeros((h, w, 4), np.uint8)
    final[pad:pad + img.shape[0], pad:pad + img.shape[1]] = img
    final[..., 3] = np.where(final[..., 3] > 0, 255, 0)
    solid = final[..., 3] > 0
    paper = PAL['paper4']
    doc = Doc(w, h, paper)
    tl = Timelapse(doc, scale, os.path.join(out_dir, f'{name}_speedpaint.mp4'))
    pn = Painter(doc, tl, 31 + seed)
    tl.shot(12)
    ys, xs = np.nonzero(solid)
    cx, cy = xs.mean(), ys.mean()
    blue, ink = (96, 140, 210), (70, 60, 72)

    # 1 construction: the box it sits in, its middle line, an ellipse for the main mass
    C = doc.add('Construction')
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    pn.curve(C, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], closed=True, seg=(20, 50), wob=0.9, over=3, color=blue,
             alpha=0.7)
    pn.curve(C, [(cx, y0 - 4), (cx, y1 + 4)], seg=(20, 50), wob=0.8, over=2, color=blue, alpha=0.6)
    rx, ry = (x1 - x0) * 0.42, (y1 - y0) * 0.36
    ell = [(cx + math.cos(t) * rx, cy + math.sin(t) * ry) for t in np.linspace(0, 2 * math.pi, 13)[:-1]]
    pn.curve(C, ell, closed=True, seg=(14, 30), wob=0.6, over=2, color=blue, alpha=0.6)
    tl.shot(8)
    pn.fade(C, 0.35)

    # 2 the sketch: first a bit too big and rubbed out, then the shape for real
    S = doc.add('Sketch')
    paths = silhouette_paths(solid, eps=1.2, down=1, minlen=3)
    snap = pn.snapshot(S)
    for p in paths[:max(1, len(paths) // 2)]:
        q = (np.asarray(p) - (cx, cy)) * 1.12 + (cx, cy)
        pn.curve(S, q, seg=(10, 24), wob=0.7, over=1.5, color=ink, alpha=0.8)
    tl.shot(8)
    pn.undo(S, snap, 4)
    for p in distort(paths, pn.rng, (cx, cy), scale=0.02, rot=1.0, off=0.6):
        pn.curve(S, p, seg=(10, 24), wob=0.6, over=1.5, color=ink, alpha=0.85)
    inner = outline_of(final, solid, dark=70) & ~AP.edge_of(solid)          # the main inner shapes, sketched
    for p in silhouette_paths(inner, eps=1.4, down=1, minlen=6)[:40]:
        pn.curve(S, p, seg=(10, 24), wob=0.6, over=1, color=ink, alpha=0.6)
    tl.shot(6)
    pn.flip(12)
    pn.hide(C)
    pn.fade(S, 0.3)

    # 3 line art
    Ln = doc.add('Lines')
    lines = outline_of(final, solid, dark=75)
    pn.lines(Ln, final, lines, run=10, frames=max(40, int(lines.sum() / 14)))
    tl.shot(6)

    # 4 flats: each material bucket-filled with its local colour
    Fl = doc.add('Flats', below=Ln)
    lab, flat, order = _groups(final, solid)
    free = solid & ~lines
    for j in order:
        pn.fill(Fl, free & (lab == j), src=flat, hold=3)
    pn.hide(S)

    # 5 rendering, material by material, dark to light, a cluster of pixels per dab
    Sh = doc.add('Shading', below=Ln)
    lum = _lum(final[..., :3].astype(np.float32))
    hi = solid & (lum > np.percentile(lum[solid], 88)) & ~lines
    for j in order:
        m = free & (lab == j) & ~hi
        if m.sum() > 6:
            pn.paint(Sh, final, m, frames=max(10, int(m.sum() / 14)), tile=10, base=False)
            tl.shot(3)
    pn.flip(10)

    # 6 the highlights and the last touches
    Hi = doc.add('Highlights')
    pn.paint(Hi, final, hi, frames=max(8, int(hi.sum() / 5)), tile=8, base=False, shapes=False, slips=0)
    rest = solid & (np.abs(doc.composite().astype(int) - final[..., :3].astype(int)).sum(-1) > 0)
    if rest.any():
        pn.paint(Hi, final, rest, frames=max(6, int(rest.sum() / 10)), tile=8, base=False, shapes=False, slips=0)
    tl.shot(int(FPS * 2.5))
    n = tl.close()
    comp = doc.composite()
    Image.fromarray(comp).resize((w * 4, h * 4), Image.NEAREST).save(os.path.join(out_dir, f'{name}_final_4x.png'))
    ref = np.where(final[..., 3:4] > 0, final[..., :3], np.array(paper, np.uint8))
    print(f'{name}: {n} frames ({n / FPS:.1f} s), matches the art: {bool((comp == ref).all())}')


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(A, 'process', 'props')
    os.makedirs(out, exist_ok=True)
    for i, k in enumerate(sys.argv[2:] or PIECES):
        speedpaint(k, *PIECES[k], out, seed=i)
