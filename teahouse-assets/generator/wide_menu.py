"""The main menu as a wide, slowly scrolling panorama at golden hour.

The pack's own outside art (outside.py, grove trees, meadow tufts), the
teahouse seen from outside (menu_teahouse.py) and the big blossoming tree
(menu_trees.py), swapped colour for colour into the golden-hour palette
(golden_palette.py), laid out as parallax planes that each tile across
TW px and scroll at their own rate while the camera pans:

  plane         rate   what
  sky           0      a new golden-hour sky: indigo overhead to gold over the low sun, the sun's disc
  clouds        0.05   the pack's cumulus, lit gold and rose (and they drift)
  mountains     0.08   the pack's ranges, lavender, the snow catching rose light
  hills         0.16   the far shore's forest
  lake          0.24   the pack's lake water, koi gliding and jumping, ducks
  shore         0.40   the pack's grown trees along the near shore, swaying; the flower bed
  meadow        0.62   a rolling meadow of the pack's tufts and flowers; the teahouse on it
  near          0.80   the big blossoming tree
  front         1.00   dark grass and pampas against the light along the bottom edge

The shader pass (wide_shader.glsl, and shade() here for previews) then adds
the light: the scene mirrored in the lake with ripples, sun rays fanning out
between the peaks, glow round the sun, the lanterns and the window, a warm
vignette - all snapped to the pixel grid and dithered, so it stays pixel art.

    python3 wide_menu.py                    # layers + previews into teahouse-assets/main_menu_wide/
    python3 wide_menu.py --page OUT.html    # the playable menu (WebGL shader) as one page"""
import json
import math
import os
import random
import subprocess
import sys
import numpy as np
from PIL import Image
import pixel
from pixel import Canvas, PAL
import golden_palette as G
import leaf_shapes
leaf_shapes.install()             # leaves you can see one by one, on every tree
import season
import outside
import meadow as MD
from shapes import shade_puffs

W, H = 640, 360
TW = 1280                     # every plane tiles every TW px
N = 96                        # animation frames per loop (12 fps)
FPS = 12
HORIZON = 196                 # the lake's far line
DY = HORIZON - outside.HORIZON
SUN = (328, 104)              # the sun's centre on screen (it does not scroll): where the passing trees
                              # and clouds leave it clear most of the time
SPEED = 8.0                   # camera pan, px per second at rate 1
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'main_menu_wide')
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
RATE = {'sky': 0.0, 'clouds': 0.05, 'mountains': 0.08, 'hills': 0.16, 'lake': 0.24, 'lake_life': 0.24,
        'birds': 0.2, 'shore': 0.40, 'flowers': 0.40, 'meadow': 0.62, 'ground_birds': 0.62, 'teahouse': 0.62, 'big_tree': 0.80, 'front': 1.0}
TEAHOUSE_X, TEAHOUSE_BASE = 330, 300        # in the meadow plane's tile
BIG_TREE_X = 980                            # its trunk's x in the near plane's tile


def ground_line(x):
    """The meadow's rolling top edge (meadow plane, tile x)."""
    t = 2 * math.pi * x / TW
    y = 268 + 7 * math.sin(t + 0.4) + 4 * math.sin(2 * t + 1.9) + 2 * math.sin(5 * t)
    d = (x - TEAHOUSE_X) / 150.0                       # the teahouse stands on a little rise
    return y - 10 * math.exp(-d * d)


# ---------------------------------------------------------------- the sky
def sky():
    a = np.zeros((H, W, 4), np.uint8)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ramp = np.array(G.GOLD['g_sky'], np.uint8)
    k = len(ramp) - 1
    d = np.hypot((xx - SUN[0]) / 1.6, (yy - SUN[1]))          # warmer round the sun
    v = np.clip(yy / 205.0, 0, 1) ** 1.25 * (k - 1.4) + np.clip(1 - d / 330, 0, 1) ** 1.8 * 2.2
    v = v + BAYER[yy.astype(int) % 4, xx.astype(int) % 4] - 0.5
    a[..., :3] = ramp[np.clip(np.floor(v + 0.5), 0, k).astype(int)]
    a[..., 3] = 255
    # thin streaks of high cloud catching the light
    rng = random.Random(7)
    for _ in range(16):
        x, y = rng.uniform(0, W), rng.uniform(30, 128)
        ln = rng.randint(40, 120)
        for i in range(ln):
            yy_ = int(y + math.sin(i * 0.05 + x) * 2)
            if rng.random() < 0.85:
                xi = int(x + i) % W
                lvl = int(np.clip(np.floor(v[yy_, xi] + 0.5), 0, k))
                a[yy_, xi, :3] = ramp[min(k, lvl + 1)]
                if 6 < i < ln - 8 and rng.random() < 0.5:
                    a[yy_ + 1, xi, :3] = ramp[min(k, lvl + 2)]
    # the sun: a soft disc low over the mountains
    sun = np.array(G.GOLD['g_sun'], np.uint8)
    r = np.hypot(xx - SUN[0], yy - SUN[1])
    for rr, c in ((15, 0), (12, 1), (9, 2)):
        m = r < rr + (BAYER[yy.astype(int) % 4, xx.astype(int) % 4] - 0.5) * (1.5 if c == 0 else 0)
        a[m, :3] = sun[c]
    return a


# ---------------------------------------------------------------- the pack's planes, swapped
def _tile(fr, off, dy=DY):
    """A pack layer frame (1280 wide) as a TW x H tile, moved down by dy."""
    a = np.zeros((H, TW, 4), np.uint8)
    ox, oy = off[0] if off else (0, 0)
    src = fr.a
    h, w = src.shape[:2]
    y0 = oy + dy
    ys, ye = max(0, y0), min(H, y0 + h)
    blk = src[ys - y0:ye - y0]
    for k in (0, 1):
        x = ox + k * outside.OUT_W
        xs, xe = max(0, x), min(TW, x + w)
        if xs < xe:
            sub = blk[:, xs - x:xe - x]
            m = sub[..., 3] > 0
            a[ys:ye, xs:xe][m] = sub[m]
    return a


def pack_planes():
    season.set_season('summer')
    P = {}
    for name, frames, fac, *off in outside.all_layers():
        P[name] = [_tile(f, off) for f in frames]
    out = {}
    out['clouds'] = [G.swap(P['01_clouds'][0])]
    # and a second, higher band of the same clouds from further along the tile
    hi = np.roll(P['01_clouds'][0], 610, axis=1)
    hi = np.roll(hi, -96, axis=0)
    hi[H - 96:] = 0
    c = out['clouds'][0]
    hg = G.swap(hi)
    m = (hg[..., 3] > 0) & (c[..., 3] == 0)
    c[m] = hg[m]
    out['mountains'] = [G.swap(P['02_mountains'][0])]
    out['hills'] = [G.swap(P['05_hills_trees'][0])]
    out['lake'] = [G.swap(a) for a in P['03_lake']]
    out['lake_life'] = [G.swap(a) for a in P['04_lake_life']]
    out['birds'] = [G.swap(a) for a in P['04_birds']]            # swallows over the water, egrets, sparrows
    trees = []
    for a in P['06_garden_trees']:                       # the trees without the garden's flat ground fill
        b = a.copy()
        flat = (b[..., 0] == PAL['leaf1'][0]) & (b[..., 1] == PAL['leaf1'][1]) & (b[..., 2] == PAL['leaf1'][2])
        b[(np.arange(H)[:, None] > outside.HORIZON + 64 + DY - 2) & flat] = 0
        trees.append(G.swap(b))
    out['shore'] = trees
    fl = []
    for a in P['07_flowers_close']:
        b = a.copy()
        b[outside.HORIZON + 66 + DY:] = 0
        fl.append(G.swap(b))
    out['flowers'] = fl
    return out


# ---------------------------------------------------------------- the meadow plane and the front
ROAD_W0, ROAD_K = 9.0, 0.24                    # the road's width at the meadow's far edge, and how it widens toward you


def road_y(x):
    """The middle of the dirt road that wanders the length of the meadow (meadow plane, tile x).
    It swings up to pass just below the teahouse's step."""
    t = 2 * math.pi * x / TW
    y = 316 + 8 * math.sin(t + 1.0) + 4 * math.sin(2 * t + 0.3) + 2 * math.sin(3 * t + 2.2)
    d = (x - TEAHOUSE_X) / 120.0
    return y - (y - (TEAHOUSE_BASE + 14)) * math.exp(-d * d)


def road_half(y):
    return (ROAD_W0 + (y - 262) * ROAD_K) / 2


def on_road(x, y, pad=0.0):
    """Within the road (or its door path) at meadow-plane (x, y), widened by pad."""
    if abs(y - road_y(x)) <= road_half(y) + pad:
        return True
    # the short path from the teahouse door down to the road
    y0, y1 = TEAHOUSE_BASE - 2, road_y(TEAHOUSE_X + 6)
    if y0 <= y <= y1 + 1:
        cx = TEAHOUSE_X + 6 + (y - y0) * 0.25
        return abs(x - cx) <= 4 + (y - y0) * 0.12 + pad
    return False


def _noise(x, y, s):
    """Tileable value noise on the TW-wide tile (x wraps)."""
    from grove import noise
    t = 2 * math.pi * x / TW
    return noise(np.cos(t) * TW / (2 * math.pi) / s[0] + 50, np.sin(t) * TW / (2 * math.pi) / s[0] + y / s[1], s[2])


def ground_tex():
    """The meadow's ground, in pack colours: short grass with sunlit and shaded swathes, worn
    patches of bare earth with pebbles, clover; and the road: packed earth in two wheel ruts with
    a grass ridge between them, stones, a lit lip along its far edge and grass overhanging its near edge."""
    yy, xx = np.mgrid[0:H, 0:TW].astype(np.float64)
    g = np.array([ground_line(x) for x in range(TW)])
    below = yy >= np.round(g)[None, :]
    depth = np.clip((yy - 262) / 98.0, 0.05, 1)                          # 0 far .. 1 at the bottom edge
    h = lambda k: ((np.sin(xx * 12.9898 + yy * 78.233 + k) * 43758.5453) % 1.0)
    out = np.empty((H, TW), object)
    out[:] = None
    sw = _noise(xx, yy, (34, 9, 3.1))                                     # swathes of light and shade
    lawn = np.where(sw > 0.6, 'leaf3', np.where(sw < 0.36, 'leaf1', 'leaf2')).astype(object)
    blade = h(1) < 0.16 + 0.1 * depth                                    # short blades, upright strokes
    up = np.roll(blade, -1, 0)
    lawn = np.where(blade & (sw > 0.45), 'leaf4', lawn)
    lawn = np.where(up & ~blade & (sw <= 0.45), 'leaf1', lawn)
    lawn = np.where((h(2) < 0.012) & (sw > 0.5), 'leaf5', lawn)          # clover leaves catching the light
    # worn patches of bare earth
    sn = _noise(xx, yy, (16, 5, 7.7))
    bayer = BAYER[yy.astype(int) % 4, xx.astype(int) % 4]
    soil = (sn + (bayer - 0.5) * 0.06 > 0.76) & (yy > g[None, :] + 5)
    earth = np.where(h(3) < 0.3, 'wood3', 'wood4').astype(object)
    earth = np.where(soil & ~np.roll(soil, 1, 0) & (h(10) < 0.6), 'wood5', earth)   # its far lip in the sun
    lawn = np.where(soil, earth, lawn)
    # the road
    ry = np.array([road_y(x) for x in range(TW)])[None, :]
    half = (ROAD_W0 + (yy - 262) * ROAD_K) / 2
    door = np.zeros_like(below)
    for y in range(H):
        for x in range(int(TEAHOUSE_X - 30), int(TEAHOUSE_X + 40)):
            if on_road(x, y) and abs(y - ry[0, x]) > half[y, x]:
                door[y, x] = True
    dist = np.abs(yy - ry) / half
    road = (dist <= 1) | door
    ragged = (dist > 0.8) & (dist <= 1) & (_noise(xx, yy, (3, 2, 9.1)) < 0.5)                # the edges eaten by grass
    road &= ~ragged
    across = (yy - ry) / half                                             # -1 far edge .. +1 near edge
    wear = _noise(xx, yy, (9, 3, 2.2))                                    # where the ruts are worn deep
    rut = (np.abs(np.abs(across) - 0.48) < 0.11 + 0.08 * wear) & (wear > 0.38) & ~door
    ridge = (np.abs(across) < 0.12) & (h(5) < 0.35) & (wear > 0.45) & ~door
    tone = _noise(xx, yy, (12, 4, 4.4)) + (h(6) - 0.5) * 0.25
    dirt = np.where(tone > 0.62, 'hinoki4', np.where(tone > 0.36, 'hinoki3', 'hinoki2')).astype(object)
    dirt = np.where(rut, np.where(h(7) < 0.3, 'hinoki1', 'hinoki2'), dirt)
    dirt = np.where(ridge, np.where(h(8) < 0.5, 'leaf2', 'leaf3'), dirt)
    under = road & ~np.roll(road, -1, 0)
    dirt = np.where(under & (h(11) < 0.7), 'hinoki1', dirt)                # the near edge drops a little
    lawn = np.where(road, dirt, lawn)
    # pebbles on the road and the bare earth: a dark stone with a lit top
    peb = (road | soil) & (h(9) < 0.008) & ~rut
    peb |= np.roll(peb, 1, 1) & (h(12) < 0.5)                            # some two wide
    lawn = np.where(peb, 'hinoki1', lawn)
    lawn = np.where(np.roll(peb, -1, 0) & ~peb, 'hinoki5', lawn)        # the lit top
    lawn = np.where(np.roll(peb, 1, 0) & ~peb & road, 'hinoki0', lawn)  # its shadow
    # the meadow's top edge: a lit rim
    rim = below & ~np.roll(below, 1, 0)
    lawn = np.where(rim, 'leaf3', lawn)
    lawn = np.where(np.roll(rim, 1, 0), 'leaf2', lawn)
    a = np.zeros((H, TW, 4), np.uint8)
    cols = {}
    for name in set(lawn[below].tolist()):
        cols[name] = PAL[name]
    for name, c in cols.items():
        m = below & (lawn == name)
        a[m, :3] = c
        a[m, 3] = 255
    return a


def _meadow_plane(rows, ground=None, dark_shift=0, seed=5, flowers=0.16, susuki=0.04, avoid=None):
    rng = random.Random(seed)
    items = []
    for (yo, th, nb, dark, spc) in rows:
        x = rng.uniform(0, spc)
        while x < TW:
            gy = ground_line(x) + yo + rng.randint(-1, 1)
            if avoid is None or not avoid(x, gy):
                MD._GUST = -2 * math.pi * x / (TW / 4.0)
                r = rng.random()
                if r < susuki:
                    fr = MD.susuki(rng, int(th * rng.uniform(1.5, 2.1)))
                elif r < susuki + flowers:
                    fr = MD.flower_plant(rng, rng.choice(('daisy', 'cosmos_white', 'bellflower', 'cosmos')),
                                         h=int(th * rng.uniform(0.9, 1.5)))
                else:
                    fr = MD.tuft(rng, int(th * rng.uniform(0.7, 1.15)), nb + rng.randint(-1, 2), dark + dark_shift)
                items.append((gy, x, fr))
            x += spc * rng.uniform(0.55, 1.1)
    MD._GUST = 0.0
    items.sort(key=lambda it: it[0])
    frames = []
    for f in range(MD.F):
        cv = Canvas(TW, H, wrap=True)
        if ground is not None:
            m = ground[..., 3] > 0
            cv.a[m] = ground[m]
        for (gy, x, fr) in items:
            s = fr[f]
            cv.blit(s, int(x - s.w / 2), int(gy) - s.h + 1)
        frames.append(G.swap(cv.a))
    return frames


def meadow_plane():
    """Clumps of grass and flowers with the ground showing between them, thicker along the
    road's edges and at the meadow's far rim, none on the road or round the teahouse."""
    def avoid(x, y):
        if abs(x - TEAHOUSE_X) < 78 and y < TEAHOUSE_BASE + 4:
            return True
        if on_road(x, y, pad=1.5):
            return True
        # open ground: thin the meadow away from the road and the far rim, in drifts
        near_road = abs(y - road_y(x)) - road_half(y) < 9
        far_rim = y < ground_line(x) + 9
        thin = _noise(np.array(x), np.array(y), (60, 20, 5.3))
        return not (near_road or far_rim) and float(thin) < 0.55
    rows = [(2, 11, 6, 1, 9), (7, 13, 6, 0, 14), (15, 16, 7, 1, 19), (27, 20, 7, 0, 22), (42, 24, 8, 1, 26),
            (60, 28, 8, 0, 30), (82, 32, 9, 1, 34)]
    return _meadow_plane(rows, ground_tex(), 0, 5, avoid=avoid)


# ---------------------------------------------------------------- birds on the ground
# a house sparrow seen side-on, facing right: c grey crown, n chestnut nape, w white cheek, e eye,
# k beak, d black bib, b chestnut back, s dark wing streaks, p pale breast, t tail, l legs
SPARROW = dict(
    stand=['.....cc..', '....nccek', '...bnwwd.', 'tbbssbpd.', '.tbbsppp.', '...bppp..', '...l.l...'],
    look=['....cc...', '...ncce..', '...bnwwk.', 'tbbssbwd.', '.tbbsppp.', '...bppp..', '...l.l...'],
    peck=['.........', '.........', '...bbn...', 'tbbssncc.', '.tbbspwce', '...bppddk', '...l.l...'],
    hop=['.....cc..', '....nccek', '...bnwwd.', 'tbbssbpd.', '.tbbsppp.', '...bppp..', '.........'])
SPARROW_COL = dict(c='stone2', n='wood4', w='paper4', e='ink0', k='ink1', d='ink1', b='wood4', s='wood1',
                   p='paper3', t='wood2', l='wood1')


def _sparrow(a, x, y, pose, flip):
    rows = SPARROW[pose]
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch == '.':
                continue
            xx = x + ((len(row) - 1 - c) if flip else c)
            yy = y + r
            if 0 <= yy < H:
                a[yy, xx % TW, :3] = PAL[SPARROW_COL[ch]]
                a[yy, xx % TW, 3] = 255


def ground_birds():
    """Little flocks of sparrows on the road: pecking, looking round, hopping a step and back."""
    rng = random.Random(17)
    birds = []
    for gx in (110, 520, 760, 1110):
        xs, n, tries = [], rng.randint(2, 4), 0
        while len(xs) < n and tries < 200:
            tries += 1
            x = gx + rng.uniform(-36, 36)
            if any(abs(x - q) < 13 for q in xs):
                continue
            xs.append(x)
        for x in xs:
            y = road_y(x) + rng.uniform(-0.7, 0.1) * road_half(road_y(x)) - 6
            birds.append(dict(x=x, y=y, flip=rng.random() < 0.5, ph=rng.randrange(N), hop=rng.choice((3, 4)),
                              seq=rng.choice(('ppslpp', 'pslspp', 'llppss'))))
    frames = []
    for f in range(N):
        a = np.zeros((H, TW, 4), np.uint8)
        for b in sorted(birds, key=lambda b: b['y']):
            t = (f + b['ph']) % N
            # a 96-frame day: hop forward at 24, back (turned round) at 72
            out = 24 <= t < 72
            dx = 0
            if t in (24, 25):
                dx, pose = b['hop'] * (t - 23) / 2, 'hop'
            elif t in (72, 73):
                dx, pose = b['hop'] * (1 - (t - 71) / 2), 'hop'
            else:
                dx = b['hop'] if out else 0
                pose = {'p': 'peck', 's': 'stand', 'l': 'look'}[b['seq'][(t // 4) % len(b['seq'])]]
            flip = b['flip'] ^ out
            lift = -2 if pose == 'hop' else 0
            sgn = -1 if b['flip'] else 1
            bx, by = int(round(b['x'] + sgn * dx)), int(round(b['y']))
            for k in range(-1, 6):                                     # its shadow on the dirt
                a[by + 7, (bx + 2 + k) % TW] = (*PAL['hinoki1'], 255)
            _sparrow(a, bx, by + lift, pose, flip)
        # a dark outline round every bird, so it reads against the road at a glance
        body = a[..., 3] > 0
        bird = body & ~np.all(a[..., :3] == PAL['hinoki1'], -1)
        ring = (np.roll(bird, 1, 0) | np.roll(bird, -1, 0) | np.roll(bird, 1, 1) | np.roll(bird, -1, 1)) & ~bird
        a[ring, :3] = PAL['wood0']
        a[ring, 3] = 255
        frames.append(G.swap(a))
    return frames


def front_plane():
    """Grass and pampas right in front, dark against the light (only along the bottom edge)."""
    rng = random.Random(9)
    items = []
    x = 0.0
    while x < TW:
        gy = H + 4 + rng.randint(0, 6)
        r = rng.random()
        if r < 0.08:
            fr = MD.susuki(rng, rng.randint(46, 64))
        else:
            fr = MD.tuft(rng, rng.randint(22, 44), rng.randint(8, 13), 0)
        items.append((gy, x, fr))
        x += rng.uniform(9, 22) * (3 if (int(x) // 300) % 2 else 1)          # gaps, so the meadow shows
    frames = []
    for f in range(MD.F):
        cv = Canvas(TW, H, wrap=True)
        for (gy, x, fr) in items:
            s = fr[f]
            cv.blit(s, int(x - s.w / 2), gy - s.h + 1)
        a = cv.a
        # against the light: every green goes to the two darkest leaves; the plumes keep a gold edge
        m = a[..., 3] > 0
        lum = a[..., :3].astype(np.float32) @ [0.3, 0.59, 0.11]
        a[m & (lum < 120), :3] = PAL['leaf0']
        a[m & (lum >= 120) & (lum < 170), :3] = PAL['leaf1']
        frames.append(G.swap(a))
    return frames


def sprite_layer(name, x_at, y_shift, tile_x):
    """An agent-drawn animated layer (main_menu/layers/<name>) as frames + where it sits in its plane's tile."""
    d = os.path.join(os.path.dirname(ROOT), 'main_menu', 'layers', name)
    meta = json.load(open(os.path.join(d, f'{name}.json')))
    sheet = np.asarray(Image.open(os.path.join(d, meta['sheet'])).convert('RGBA'))
    w, h = meta['w'], meta['h']
    cols = meta.get('sheet_columns', meta.get('sheet_cols', 1))
    frames = []
    for i in range(meta['frames']):
        r, c = i // cols, i % cols
        frames.append(G.swap(sheet[r * h:(r + 1) * h, c * w:(c + 1) * w]))
    return dict(frames=frames, x=tile_x + (meta['x'] - x_at), y=meta['y'] + y_shift, w=w, h=h)


def hero_tree():
    """menu_trees.py's big blossoming tree, grown in a box wide enough for its whole crown
    (the original was framed to run off the right edge of the screen)."""
    import menu_trees as MT
    MT.HW = 520
    MT._HERO.clear()
    T = MT.hero()
    frames = [G.swap(T.frame(f)) for f in range(N)]
    trunk = 586 - MT.HX0                               # the trunk foot's x inside the box
    return dict(frames=frames, x=BIG_TREE_X - trunk, y=0, w=MT.HW, h=frames[0].shape[0])


def build_planes():
    pp = pack_planes()
    planes = {
        'sky': [sky()], 'clouds': pp['clouds'], 'mountains': pp['mountains'], 'hills': pp['hills'],
        'lake': pp['lake'], 'lake_life': pp['lake_life'], 'shore': pp['shore'], 'flowers': pp['flowers'],
        'birds': pp['birds'], 'meadow': meadow_plane(), 'ground_birds': ground_birds(), 'front': front_plane(),
    }
    th = sprite_layer('teahouse', 238, TEAHOUSE_BASE - 246, TEAHOUSE_X)
    return planes, {'teahouse': th, 'big_tree': hero_tree()}


ORDER = ['sky', 'clouds', 'mountains', 'hills', 'lake', 'lake_life', 'birds', 'shore', 'flowers', 'meadow',
         'ground_birds', 'teahouse', 'big_tree', 'front']


# ---------------------------------------------------------------- composing a frame
def compose(planes, sprites, f, cam):
    """The screen at loop frame f with the camera panned cam px (at rate 1).
    Returns (rgb float, lake mask, sky mask)."""
    out = np.zeros((H, W, 3), np.float32)
    lake = np.zeros((H, W), bool)
    skym = np.zeros((H, W), bool)
    for name in ORDER:
        rate = RATE[name]
        ox = int(math.floor(cam * rate)) % TW
        if name in sprites:
            s = sprites[name]
            a = s['frames'][f % len(s['frames'])]
            for k in (-1, 0, 1):
                x = s['x'] - ox + k * TW
                if x + s['w'] <= 0 or x >= W:
                    continue
                x0, x1 = max(0, x), min(W, x + s['w'])
                y0, y1 = max(0, s['y']), min(H, s['y'] + s['h'])
                blk = a[y0 - s['y']:y1 - s['y'], x0 - x:x1 - x].astype(np.float32)
                al = blk[..., 3:4] / 255.0
                out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - al) + blk[..., :3] * al
                cov = al[..., 0] > 0.5
                lake[y0:y1, x0:x1] &= ~cov
                skym[y0:y1, x0:x1] &= ~cov
            continue
        fr = planes[name]
        a = fr[f % len(fr)]
        if name == 'sky':
            view = a
        else:
            idx = (np.arange(W) + ox) % TW
            view = a[:, idx]
        al = view[..., 3:4].astype(np.float32) / 255.0
        out = out * (1 - al) + view[..., :3] * al
        cov = al[..., 0] > 0.5
        if name == 'sky':
            skym |= cov
        else:
            skym &= ~cov
        if name == 'lake':
            lake |= cov
        else:
            lake &= ~cov
    return out, lake, skym


# ---------------------------------------------------------------- the shader, in numpy (wide_shader.glsl does the same)
def shade(rgb, lake, skym, t):
    """Reflections in the lake, sun rays, glow, vignette - on the pixel grid, dithered."""
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    out = rgb.copy()
    # 1 the lake mirrors what stands above it, broken by ripples that grow toward you
    ly = yy[lake]
    lx = xx[lake]
    depth = ly - HORIZON
    amp = np.clip(depth * 0.12, 0, 3)
    rip = np.round(np.sin(ly * 0.9 + t * 3.1) * amp + np.sin(ly * 2.3 - t * 4.7) * amp * 0.4).astype(int)
    sy = np.clip(2 * HORIZON - ly - 1, 0, h - 1)
    sx = np.clip(lx + rip, 0, w - 1)
    refl = rgb[sy, sx] * np.array([0.82, 0.8, 0.95])
    water = rgb[ly, lx]
    k = np.clip(0.62 - depth * 0.006, 0.25, 0.62)[:, None]
    out[ly, lx] = water * (1 - k) + refl * k
    # the sun's road: glints across the water under the sun
    road = np.exp(-((lx - SUN[0]) / (8 + depth * 1.4)) ** 2)
    sparkle = np.sin(np.floor(lx / 3) * 2.1 + ly * 5.3 + t * 6) * np.sin(np.floor(lx / 3) * 0.9 - ly * 3.1 - t * 4.4)
    glint = (sparkle > 0.8 - 0.45 * road) & (road > 0.2) & (ly % 2 == 0) & (lx % 3 != 2)     # short dashes
    out[ly[glint], lx[glint]] = np.array(G.GOLD['g_sun'][1], np.float32)
    # 2 sun rays: the bright sky smeared out from the sun, fanning past the peaks and through the leaves
    lum = rgb @ np.array([0.3, 0.59, 0.11])
    bright = np.where(skym, np.clip((lum - 150) / 90, 0, 1), 0)
    acc = np.zeros((h, w), np.float32)
    dx, dy = (SUN[0] - xx), (SUN[1] - yy)
    for i in range(28):
        s_ = i / 28.0
        px = np.clip((xx + dx * s_).astype(int), 0, w - 1)
        py = np.clip((yy + dy * s_).astype(int), 0, h - 1)
        acc += bright[py, px] * (1 - s_ * 0.6)
    acc /= 28.0
    dist = np.hypot(dx, dy)
    rays = acc * np.clip(1 - dist / 560, 0, 1) * 1.5
    # 3 glow round bright things (the sun, the lanterns, the window, the glints): three box blurs
    hot = np.clip((lum - 200) / 55, 0, 1) * ((rgb[..., 0] > rgb[..., 2] + 20) | skym)

    def box(m, r):
        c = np.cumsum(np.pad(m, ((r + 1, r), (0, 0))), 0)
        m = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
        c = np.cumsum(np.pad(m, ((0, 0), (r + 1, r))), 1)
        return (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    glow = (box(hot, 2) + box(hot, 4) + box(hot, 8)) / 3
    light = np.clip(rays + glow * 1.0, 0, 1)
    # dithered into steps so the light lands as pixel clusters
    steps = 6
    light = np.floor(light * steps + BAYER[yy % 4, xx % 4]) / steps
    warm = np.array([255, 196, 140], np.float32)
    out = out + (warm - out * 0.5) * light[..., None] * 0.55
    # 4 the warm vignette
    v = np.hypot((xx - w / 2) / (w * 0.62), (yy - h * 0.45) / (h * 0.75))
    vig = np.clip(v - 0.55, 0, 1) ** 1.5 * 0.55
    out = out * (1 - vig[..., None]) + np.array([40, 26, 58], np.float32) * vig[..., None]
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def motes(rgb, f_abs):
    """Dust and seeds drifting in the low light (screen space)."""
    rng = random.Random(3)
    for i in range(46):
        x0, y0, sp, ph = rng.uniform(0, W), rng.uniform(40, 300), rng.uniform(0.15, 0.45), rng.uniform(0, 6.28)
        x = (x0 + f_abs * sp) % W
        y = y0 + 6 * math.sin(f_abs * 0.05 + ph)
        tw = 0.5 + 0.5 * math.sin(f_abs * 0.3 + ph)
        if tw > 0.35 and 0 <= int(y) < H:
            near = math.hypot(x - SUN[0], y - SUN[1]) < 260
            c = G.GOLD['g_sun'][1] if near else G.GOLD['gold'][3]
            rgb[int(y), int(x)] = c
    return rgb


# ---------------------------------------------------------------- export
def _crop(frames):
    """Common bbox of a frame list's alpha: (x0, y0, x1, y1)."""
    al = np.zeros(frames[0].shape[:2], bool)
    for a in frames:
        al |= a[..., 3] > 0
    ys, xs = np.where(al)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def export(planes, sprites):
    """layers/<name>/<name>_sheet.png + <name>.json for every plane and sprite, scene.json."""
    out = {}
    for name in ORDER:
        if name in sprites:
            s = sprites[name]
            fr, tile, x_off, y_off = s['frames'], None, s['x'], s['y']
        else:
            fr, x_off, y_off = planes[name], 0, 0
            tile = None if name == 'sky' else TW
        x0, y0, x1, y1 = _crop(fr)
        if tile:                                  # a tiling plane keeps its whole width
            x0, x1 = 0, fr[0].shape[1]
        w, h = x1 - x0, y1 - y0
        cols = max(1, min(len(fr), 4096 // w))
        rows = -(-len(fr) // cols)
        sheet = np.zeros((rows * h, cols * w, 4), np.uint8)
        for i, a in enumerate(fr):
            r, c = divmod(i, cols)
            sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = a[y0:y1, x0:x1]
        d = os.path.join(ROOT, 'layers', name)
        os.makedirs(d, exist_ok=True)
        Image.fromarray(sheet).save(os.path.join(d, f'{name}_sheet.png'), optimize=True)
        meta = dict(name=name, sheet=f'{name}_sheet.png', frames=len(fr), fps=FPS, w=int(w), h=int(h),
                    sheet_cols=cols, x=int(x_off + x0), y=int(y_off + y0), parallax=RATE[name],
                    tile_w=TW if name != 'sky' else 0)
        json.dump(meta, open(os.path.join(d, f'{name}.json'), 'w'), indent=1)
        out[name] = meta
        print(f'{name:10s} {len(fr):3d}f {w}x{h} sheet {sheet.shape[1]}x{sheet.shape[0]} '
              f'{os.path.getsize(os.path.join(d, name + "_sheet.png")) / 2 ** 20:.2f} MiB')
    scene = dict(name='Main menu - golden hour', screen=[W, H], scale='integer, nearest-neighbour', fps=FPS,
                 frames=N, tile_w=TW, scroll_px_per_s=SPEED, horizon=HORIZON, sun=list(SUN),
                 draw_order=ORDER, layers={k: f'layers/{k}/{k}.json' for k in ORDER},
                 shader='wide_shader.glsl', ui='ui/layout.json',
                 how=("Each layer's screen x = x - floor(cam * parallax) mod tile_w (also drawn one tile_w to "
                      "the right); cam grows by scroll_px_per_s. Then the shader pass over the 640x360 frame, "
                      "with a mask of the open sky and of the lake's water."))
    json.dump(scene, open(os.path.join(ROOT, 'scene.json'), 'w'), indent=1)
    return out


def export_ui():
    """The pack's menu UI (main_menu/ui) swapped into the golden palette."""
    src = os.path.join(os.path.dirname(ROOT), 'main_menu', 'ui')
    dst = os.path.join(ROOT, 'ui')
    os.makedirs(dst, exist_ok=True)
    import shutil
    for fn in os.listdir(src):
        p = os.path.join(src, fn)
        if fn.endswith('.json'):
            shutil.copy(p, dst)
        elif fn.endswith('.png') and not fn.startswith('menu_preview'):
            a = np.asarray(Image.open(p).convert('RGBA'))
            Image.fromarray(G.swap(a)).save(os.path.join(dst, fn), optimize=True)


# ---------------------------------------------------------------- previews
def ui_overlay():
    """The golden menu (title sign at loop frame 0..N, signpost, buttons) as N RGBA overlays."""
    U = os.path.join(ROOT, 'ui')
    lay = json.load(open(os.path.join(U, 'layout.json')))
    tm = json.load(open(os.path.join(U, lay['title']['anim']['json'])))
    tsheet = np.asarray(Image.open(os.path.join(U, tm['sheet'])).convert('RGBA'))
    base = Image.new('RGBA', (W, H))
    base.alpha_composite(Image.open(os.path.join(U, lay['signpost']['image'])).convert('RGBA'),
                         (lay['signpost']['x'], lay['signpost']['y']))
    for b in lay['buttons']:
        base.alpha_composite(Image.open(os.path.join(U, f'btn_{b["id"]}_normal.png')).convert('RGBA'), (b['x'], b['y']))
    fw, fh, cols = tm['frame_w'], tm['frame_h'], tm['sheet_cols']
    outs = []
    for i in range(tm['frames']):
        r, c = divmod(i, cols)
        im = base.copy()
        im.alpha_composite(Image.fromarray(tsheet[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw]),
                           (lay['title']['x'], lay['title']['y']))
        outs.append(np.asarray(im))
    return outs


def render(planes, sprites, t, cam, ui=None):
    f = int(t * FPS)
    rgb, lake, skym = compose(planes, sprites, f, cam)
    rgb = motes(rgb, f)
    out = shade(rgb, lake, skym, t)
    if ui is not None:
        o = ui[f % len(ui)]
        al = o[..., 3:4] / 255.0
        out = (out * (1 - al) + o[..., :3] * al + 0.5).astype(np.uint8)
    return out


def previews(planes, sprites, seconds=32, fps=30, pan=36.0):
    """preview/: 3x stills, a 1080p glide along the whole panorama, a small GIF."""
    import subprocess
    P = os.path.join(ROOT, 'preview')
    os.makedirs(P, exist_ok=True)
    ui = ui_overlay()
    for i, cam in enumerate((300, 1000, 1700)):
        im = render(planes, sprites, 1.7, cam, ui)
        Image.fromarray(im).resize((W * 3, H * 3), Image.NEAREST).save(os.path.join(P, f'still_{i + 1}_3x.png'))
        im = render(planes, sprites, 1.7, cam)
        Image.fromarray(im).resize((W * 3, H * 3), Image.NEAREST).save(os.path.join(P, f'scene_{i + 1}_3x.png'))
    mp4 = os.path.join(P, 'golden_hour_scroll_1080p.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                          '-r', str(fps), '-i', '-', '-vf', 'scale=1920:1080:flags=neighbor', '-c:v', 'libx264',
                          '-preset', 'slow', '-crf', '28', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
                         stdin=subprocess.PIPE)
    gif = []
    for k in range(seconds * fps):
        t = k / fps
        im = render(planes, sprites, t, 200 + t * pan, ui)
        p.stdin.write(im.tobytes())
        if k % (fps // 10) == 0 and t < 10:
            gif.append(Image.fromarray(im))
    p.stdin.close()
    p.wait()
    pal = gif[0].quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q = [g.quantize(palette=pal, dither=Image.Dither.NONE) for g in gif]
    q[0].save(os.path.join(P, 'golden_hour_scroll.gif'), save_all=True, append_images=q[1:], duration=100, loop=0,
              optimize=True)


if __name__ == '__main__':
    planes, sprites = build_planes()
    export(planes, sprites)
    export_ui()
    previews(planes, sprites)
