"""Seamless 64x64 tiles for the teahouse: floors, walls, roof, ground, water, mats, paper.

Every tile repeats cleanly in both directions. They are built from the pack's own colour
ramps (pixel.RAMPS), laid down the way the pack's rooms are: board by board and tile by tile,
with a lit top-left edge and a dark seam, ordered-dithered tones in between, and a handful of
hand-placed marks (knots, cracks, pebbles, blades). The 4x4 dither matrix divides 64, so the
dither tiles too.

    from tile_textures import TILES; TILES['wood_floor']()      # -> (64, 64, 3) uint8
    python3 tile_textures.py OUT_DIR                            # writes every tile, 1x and 3x
"""
import os
import sys
import numpy as np
from PIL import Image
import pixel

S = 64
_B = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
BAY = np.tile(_B, (S // 4, S // 4))
YY, XX = np.mgrid[0:S, 0:S]


def R(name):
    return np.array(pixel.RAMPS[name], np.uint8)


def pnoise(cx, cy, seed):
    """Value noise that repeats every S px: a cx x cy lattice wrapped round."""
    g = np.random.default_rng(seed).random((cy, cx))
    u, v = XX / S * cx, YY / S * cy
    x0, y0 = np.floor(u).astype(int), np.floor(v).astype(int)
    fx, fy = u - x0, v - y0
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = g[y0 % cy, x0 % cx], g[y0 % cy, (x0 + 1) % cx]
    c, d = g[(y0 + 1) % cy, x0 % cx], g[(y0 + 1) % cy, (x0 + 1) % cx]
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


def fbm(seed, cx, cy, octs=3):
    t, w, tot = 0.0, 1.0, 0.0
    for o in range(octs):
        t = t + w * pnoise(cx * 2 ** o, cy * 2 ** o, seed + 17 * o)
        tot += w
        w *= 0.5
    return t / tot


def tone(v, ramp, dith=0.6, lo=0, hi=None):
    """Float 0..1 -> ramp colours, ordered-dithered between neighbouring tones."""
    n = len(ramp)
    hi = n - 1 if hi is None else hi
    f = lo + np.clip(v, 0, 1) * (hi - lo)
    idx = np.clip(np.floor(f + (BAY - 0.5) * dith + 0.5), lo, hi).astype(int)
    return ramp[idx]


def wrap_d(a, b):
    """Shortest signed distance on the S-wide torus."""
    return (a - b + S / 2) % S - S / 2


# ------------------------------------------------------------------ floors and walls
def wood_floor(seed=3):
    """Horizontal boards 8 px tall, each with its own butt joints, grain along the board, a lit top edge,
    a dark seam under it, and two knots."""
    rng = np.random.default_rng(seed)
    grain = fbm(seed, 3, 36, 2)
    v = np.zeros((S, S))
    for b in range(S // 8):
        y0 = b * 8
        j1 = int(rng.integers(0, S))
        j2 = (j1 + int(rng.integers(22, 42))) % S
        t = [rng.uniform(0.4, 0.62), rng.uniform(0.34, 0.66)]
        rows = np.s_[y0:y0 + 8]
        a_first = ((XX[rows] - j1) % S) < ((j2 - j1) % S)                    # which of the row's two boards
        base = np.where(a_first, t[0], t[1])
        v[rows] = base + (grain[rows] - 0.5) * 0.42
        v[y0] += 0.16                                                         # lit top edge
        v[y0 + 7] -= 0.32                                                     # seam
        for j in (j1, j2):
            v[y0:y0 + 8, j] -= 0.3                                            # butt joint
            v[y0:y0 + 8, (j + 1) % S] += 0.08
        for k in (j1 + 4, j2 + 4):                                            # nails
            v[y0 + 3, k % S] -= 0.28
    for (kx, ky) in ((int(rng.integers(0, S)), int(rng.integers(4, S - 4))), (int(rng.integers(0, S)), 40)):
        d = np.hypot(wrap_d(XX, kx), (YY - ky) * 1.7)
        v[(d > 1.6) & (d < 2.8)] -= 0.18
        v[d <= 1.6] -= 0.3
    return tone(v, R('wood'), 0.5, 1, 6)


def plank_wall(ramp='red', seed=5, sheen=True, peel=0.0, rail=False):
    """Vertical planks 4-6 px wide, a lit left edge, a dark seam, grain down the board, butt joints,
    and (peel) patches where the lacquer has come away to grey wood."""
    rng = np.random.default_rng(seed)
    widths = [6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 5, 4]
    grain = fbm(seed, 30, 3, 2)
    v = np.zeros((S, S))
    x0 = 0
    for w in widths:
        cols = np.s_[:, x0:x0 + w]
        v[cols] = rng.uniform(0.38, 0.7) + (grain[cols] - 0.5) * 0.45
        if sheen:
            v[:, x0] += 0.2
        v[:, x0 + w - 1] -= 0.38
        jy = int(rng.integers(0, S))
        v[jy, x0:x0 + w] -= 0.3
        v[(jy + 1) % S, x0:x0 + w] += 0.1
        x0 += w
    rgb = tone(v, R(ramp), 0.55, 0, len(R(ramp)) - 1)
    if peel:
        flake = pnoise(16, 16, seed + 3) + (pnoise(34, 34, seed + 4) - 0.5) * 0.5
        near_seam = (v < 0.2) | (np.roll(v, 1, 1) < 0.2) | (np.roll(v, 1, 0) < 0.15)
        m = (flake > 1 - peel * 0.62) & (near_seam | (flake > 0.93))
        g = tone(np.clip(v * 0.9 + 0.1, 0, 1), R('fgrey'), 0.6, 1, 4)
        rgb[m] = g[m]
    return rgb


def plaster_wall(seed=7):
    """Old lime plaster: mottled, with trowel streaks, specks and two hairline cracks."""
    rng = np.random.default_rng(seed)
    v = 0.6 + (fbm(seed, 4, 4, 3) - 0.5) * 0.5 + (pnoise(2, 22, seed + 1) - 0.5) * 0.14
    v = v - (rng.random((S, S)) < 0.025) * 0.22
    v = v + (rng.random((S, S)) < 0.01) * 0.16
    for _ in range(2):
        x, y = int(rng.integers(0, S)), int(rng.integers(0, S))
        for _ in range(int(rng.integers(18, 30))):
            v[y % S, x % S] -= 0.42
            v[(y + 1) % S, x % S] += 0.08
            x += int(rng.choice((-1, 0, 1)))
            y += 1
    return tone(v, R('paper'), 0.6, 1, 4)


def roof_kawara(moss=False, seed=9):
    """Roof tiles in courses of 8: each tile lit down its left, a dark seam on its right, the shadow of the
    tile above on its top, a bright lip along its lower edge; the courses offset by half a tile."""
    rng = np.random.default_rng(seed)
    grain = fbm(seed, 8, 8, 2)
    v = np.zeros((S, S))
    for r in range(8):
        off = 4 * (r % 2)
        for c in range(8):
            x0 = (c * 8 + off) % S
            t = rng.uniform(0.34, 0.6)
            for dy in range(8):
                for dx in range(8):
                    x, y = (x0 + dx) % S, r * 8 + dy
                    val = t + (grain[y, x] - 0.5) * 0.2
                    if dy < 2:
                        val -= 0.26 - 0.1 * dy                            # the tile above shades this one
                    if dy == 7:
                        val += 0.26                                       # the lit lip
                    if dx == 0:
                        val -= 0.3
                    elif dx in (1, 2):
                        val += 0.12                                       # the curve of the pan catching light
                    elif dx >= 6:
                        val -= 0.08
                    v[y, x] = val
    rgb = tone(v, R('stone'), 0.45, 0, 4)
    if moss:
        patch = pnoise(3, 3, seed + 5) + (pnoise(9, 9, seed + 8) - 0.5) * 0.5
        m = (patch > 0.64) & ((YY % 8) < 3 + (pnoise(16, 16, seed + 9) * 3).astype(int))
        mv = 0.38 + (pnoise(24, 24, seed + 6) - 0.5) * 0.7 + 0.08 * (YY % 8 < 1)
        rgb[m] = tone(mv, R('leaf'), 0.6, 1, 4)[m]
    return rgb


def stone_paving(seed=11):
    """Cobbles: a jittered grid of stones, a mortar line between, each stone lit on its upper left."""
    rng = np.random.default_rng(seed)
    pts = np.array([((i + rng.uniform(0.2, 0.8)) * 16, (j + rng.uniform(0.2, 0.8)) * 16) for j in range(4) for i in range(4)])
    tones = rng.uniform(0.36, 0.7, len(pts))
    d = np.stack([np.hypot(wrap_d(XX, px), wrap_d(YY, py)) for px, py in pts])
    order = np.argsort(d, 0)
    d1 = np.take_along_axis(d, order[:1], 0)[0]
    d2 = np.take_along_axis(d, order[1:2], 0)[0]
    cell = order[0]
    dx = np.array([wrap_d(XX, pts[i, 0]) for i in range(len(pts))])
    dy = np.array([wrap_d(YY, pts[i, 1]) for i in range(len(pts))])
    cdx = np.take_along_axis(dx, order[:1], 0)[0]
    cdy = np.take_along_axis(dy, order[:1], 0)[0]
    v = tones[cell] - 0.016 * (cdx + cdy) + (fbm(seed, 6, 6, 2) - 0.5) * 0.25
    edge = d2 - d1
    v = np.where(edge < 1.5, 0.0, v)                                          # mortar
    v = np.where((edge >= 1.5) & (edge < 2.8) & (cdx + cdy < 0), v + 0.14, v)  # lit rim
    return tone(v, R('stone'), 0.5, 0, 4)


# ------------------------------------------------------------------ ground
def grass_lawn(seed=13):
    """Short lawn: swathes of light and shade, over them hundreds of little blades, each with a dark root,
    a body and a lit tip."""
    rng = np.random.default_rng(seed)
    sw = fbm(seed, 3, 3, 2)
    base = tone(0.12 + 0.5 * sw, R('leaf'), 0.5, 1, 3)
    rgb = base.copy()
    ramp = R('leaf')
    for _ in range(120):
        x, y = int(rng.integers(0, S)), int(rng.integers(0, S))
        band = sw[y, x]
        hgt = int(rng.integers(3, 7))
        lean = rng.uniform(-0.6, 0.6)
        k = int(np.clip(round(1 + 2.4 * band), 1, 3))
        for b in range(2 if rng.random() < 0.5 else 1):                       # a pair of blades leaning apart
            for j in range(hgt + 1):
                xx, yy = int(round(x + b + lean * j * (1 if b == 0 else -0.6))) % S, (y - j) % S
                rgb[yy, xx] = ramp[k - 1] if j == 0 else (ramp[min(5, k + 2)] if j == hgt else ramp[k])
    return rgb


def dirt_path(seed=15):
    """Packed earth: mottled, two worn wheel ruts, grit and pebbles with a lit top and a shadow."""
    rng = np.random.default_rng(seed)
    v = 0.52 + (fbm(seed, 4, 4, 3) - 0.5) * 0.5
    rut = np.minimum(np.abs(wrap_d(YY, 16 + 3 * np.sin(XX / S * 6.283 * 2))),
                     np.abs(wrap_d(YY, 48 + 3 * np.sin(XX / S * 6.283 * 2 + 1.7))))
    v = v - 0.2 * np.clip(1 - rut / 4.5, 0, 1) * (0.6 + 0.8 * pnoise(8, 8, seed + 2))
    v = v + (rng.random((S, S)) < 0.03) * 0.2 - (rng.random((S, S)) < 0.04) * 0.2
    rgb = tone(v, R('hinoki'), 0.6, 1, 4)
    st = R('stone')
    for _ in range(9):
        x, y = int(rng.integers(0, S)), int(rng.integers(0, S))
        w = int(rng.integers(2, 4))
        for dx in range(w):
            rgb[(y + 1) % S, (x + dx) % S] = R('hinoki')[0]                  # its shadow
            rgb[y % S, (x + dx) % S] = st[2]
            rgb[(y - 1) % S, (x + dx) % S] = st[4] if dx < w - 1 else st[3]  # lit top
    return rgb


def moss(seed=17):
    """A carpet of moss: lumpy cushions, lit on top, dark between, a few spore flecks."""
    rng = np.random.default_rng(seed)
    v = 0.3 + 0.55 * fbm(seed, 4, 4, 2) + (pnoise(14, 14, seed + 2) - 0.5) * 0.4
    v = v + (rng.random((S, S)) < 0.03) * 0.25
    rgb = tone(v, R('leaf'), 0.7, 1, 5)
    sp = rng.random((S, S)) < 0.006
    rgb[sp] = R('alien')[3]
    return rgb


def water(frames=4, seed=19):
    """Still water with slow ripple lines that drift one ripple in `frames` frames: loops exactly."""
    ramp = np.concatenate([R('water'), R('sky')[3:4], R('cloud')[3:4]])
    wob = fbm(seed, 4, 4, 2)
    out = []
    for f in range(frames):
        ph = f / frames
        s = np.sin(2 * np.pi * (YY / 16.0 + 1.1 * wob + ph))
        v = 0.34 + 0.2 * s + 0.16 * (fbm(seed + 7, 5, 5, 2) - 0.5)
        v = np.where(s > 0.93, 0.92, v)                                       # a bright crest
        out.append(tone(v, ramp, 0.5, 0, len(ramp) - 1))
    return out


# ------------------------------------------------------------------ mats and paper
def tatami(seed=21):
    """Two tatami mats, 2:1, the second offset half a mat; rush weave in rows, a dark indigo heri along
    each long edge, a seam at each short end."""
    rng = np.random.default_rng(seed)
    v = np.zeros((S, S))
    g = fbm(seed, 6, 20, 2)
    for m in range(2):
        y0, off = m * 32, m * 32
        for y in range(32):
            row = y0 + y
            weave = 0.52 + (0.2 if y % 2 == 0 else -0.12)
            v[row] = weave + (g[row] - 0.5) * 0.36
        v[y0 + 3:y0 + 29] += (((XX[y0 + 3:y0 + 29] + (YY[y0 + 3:y0 + 29] // 2) * 3) % 6) == 0) * -0.1   # weave ticks
    rgb = tone(v, R('hinoki'), 0.55, 2, 4)             # aged straw
    ind = R('indigo')
    for m in range(2):
        y0 = m * 32
        for k, c in enumerate((ind[2], ind[1], ind[1])):
            rgb[y0 + k] = c                                                    # heri on the upper edge: lit then deep
            rgb[y0 + 31 - k] = (ind[1], ind[0], ind[0])[k]
        sx = (m * 32) % S
        rgb[y0 + 3:y0 + 29, sx] = R('hinoki')[1]                              # the short-end seam
        rgb[y0 + 3:y0 + 29, (sx + 1) % S] = R('hinoki')[4]
    return rgb


def shoji(seed=23, n=32):
    """A paper screen cell: paper with fibre flecks inside a wooden lattice, lit top-left, dark bottom-right."""
    global S, BAY, XX, YY
    keep = (S, BAY, XX, YY)
    S = n
    BAY = np.tile(_B, (n // 4, n // 4))
    YY, XX = np.mgrid[0:n, 0:n]
    try:
        rng = np.random.default_rng(seed)
        v = 0.72 + (fbm(seed, 4, 4, 2) - 0.5) * 0.2
        rgb = tone(v, R('paper'), 0.5, 2, 4)
        pa = R('paper')
        for _ in range(26):
            x, y = int(rng.integers(0, n)), int(rng.integers(0, n))
            for k in range(int(rng.integers(2, 5))):
                rgb[y, (x + k) % n] = pa[2]
        wd = R('wood')
        for k, c in enumerate((wd[5], wd[4], wd[2], wd[1])):                    # a 4-px bar: lit, body, shade, dark
            for pos in (0, n // 2):
                rgb[(pos + k) % n, :] = c
                rgb[:, (pos + k) % n] = c
        for pos in (0, n // 2):                                                  # the crossing: the bar above is lit
            rgb[pos:pos + 4, pos:pos + 4] = wd[3]
        return rgb
    finally:
        S, BAY, XX, YY = keep


TILES = {
    'wood_floor': wood_floor,
    'plank_wall_red': lambda: plank_wall('red', 5, True, 0.0),
    'plank_wall_red_peeling': lambda: plank_wall('red', 6, True, 0.3),
    'plank_wall_grey': lambda: plank_wall('fgrey', 8, False, 0.0),
    'plaster_wall': plaster_wall,
    'roof_tiles': lambda: roof_kawara(False),
    'roof_tiles_mossy': lambda: roof_kawara(True),
    'stone_paving': stone_paving,
    'grass_lawn': grass_lawn,
    'dirt_path': dirt_path,
    'moss': moss,
    'tatami': tatami,
    'shoji_screen': shoji,
}


def tiles():
    """name -> (frames, h, w, 3) uint8: every tile, water as 4 frames."""
    out = {k: [f()] for k, f in TILES.items()}
    out['water'] = water()
    return out


def save_all(out_dir, palette_swap=None, scales=(1, 3)):
    os.makedirs(out_dir, exist_ok=True)
    for name, frames in tiles().items():
        arrs = [np.dstack([f, np.full(f.shape[:2], 255, np.uint8)]) for f in frames]
        if palette_swap is not None:
            arrs = [palette_swap(a) for a in arrs]
        h, w = arrs[0].shape[:2]
        sheet = np.concatenate(arrs, 1)
        tag = f'_{len(arrs)}f' if len(arrs) > 1 else ''
        for sc in scales:
            im = Image.fromarray(sheet)
            if sc > 1:
                im = im.resize((sheet.shape[1] * sc, sheet.shape[0] * sc), Image.NEAREST)
            sub = '' if sc == 1 else f'{sc}x_'
            im.save(os.path.join(out_dir, f'{sub}{name}{tag}_{w * sc}x{h * sc}.png'), optimize=True)


def contact(path, names=None, n=3):
    """Every tile repeated n x n, to check the seams by eye."""
    t = tiles()
    names = names or list(t)
    cells = []
    for k in names:
        f = t[k][0]
        cells.append(np.tile(f, (n, n, 1)))
    cols = 4
    rows = -(-len(cells) // cols)
    th, tw = cells[0].shape[:2]
    sheet = np.full((rows * (th + 6), cols * (tw + 6), 3), (24, 22, 30), np.uint8)
    for i, c in enumerate(cells):
        r, k = divmod(i, cols)
        h, w = c.shape[:2]
        sheet[r * (th + 6):r * (th + 6) + h, k * (tw + 6):k * (tw + 6) + w] = c
    Image.fromarray(sheet).save(path)


if __name__ == '__main__':
    save_all(sys.argv[1] if len(sys.argv) > 1 else 'tiles_out')
