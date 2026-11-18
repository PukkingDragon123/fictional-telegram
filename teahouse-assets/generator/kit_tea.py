"""The traveller's tea kit: a travelling tea-brewer's lacquer box (chabako)
on an indigo furoshiki, and the pieces inside it as items of their own.
Every piece is sculpted in 3D (sculpt.py: smooth-unioned ellipsoids,
capsules and boxes, carved by subtraction) so it turns in the hand, and
every frame is styled as pixel art the way you would draw it:

  - a few hue-shifted tones per material, cut into clean bands; matte
    things (clay, bark, cloth) get their band edges broken into small
    clusters, glossy things (glaze, lacquer, tin) keep them crisp and carry
    a sharp highlight: a glossy streak down the wall and a lit rim
  - details painted onto the object's own surface so they turn with it:
    glaze dips and drips, the unglazed foot ring, kintsugi, chips, stains,
    the maki-e pine, the furoshiki's asanoha, rune labels
  - a selective outline: a darker shade of the colour inside on the lit
    side, a warm near-black on the shadow side, a line wherever a near part
    crosses a far one; then lone specks cleaned away
  - steam, the tea stream and puffs of leaves drawn in 2D on top

Each piece is a set of parts traced separately and merged by depth, so a
lid can lift, a pot can tip and pour, a cord can slide off.

Props (each in four variants: clean = the main one with every animation,
worn, dirty, repaired), written to teahouse-assets/traveler_kit/<name>/:

  tea_kit_*    the chabako on its furoshiki: idle, turn, open (+ brew,
               turn_open on the clean one)
  kyusu_*      side-handled tokoname teapot: idle, turn, use (pours)
  yunomi_*     tall cup of sencha: idle (steam), turn, use (fills)
  chasen_*     bamboo whisk: idle, turn, use (whisks)
  chashaku_*   smoked bamboo scoop: idle, turn, use (scoops, tips)
  tea_caddy_*  cherry-bark caddy: idle, turn, use (lid lifts, leaves puff)
  tea_tin_*    travel tin with a rune label: idle, turn, use (lid pops)

    python3 kit_tea.py              everything
    python3 kit_tea.py kyusu yunomi only these props
"""
import math
import sys
import numpy as np
import pixel
from pixel import Canvas
from sculpt import Shapes, rot_x, rot_y, rot_z

# ---------------------------------------------------------------- colours (dark -> light, hue-shifted)
R = {
    # tokoname red clay: plum shadows, warm apricot lights
    'clay':    [(50, 22, 30), (86, 34, 34), (126, 52, 40), (166, 78, 50), (202, 112, 66), (230, 152, 98)],
    'kuro':    [(20, 16, 22), (36, 28, 34), (56, 44, 48), (82, 66, 64), (116, 96, 88)],        # black clay lid
    # shino: cream glaze with cool lilac-grey shadows and warm ivory lights
    'shino':   [(80, 66, 82), (120, 106, 116), (162, 150, 150), (202, 190, 174), (230, 222, 200),
                (248, 244, 228)],
    'ame':     [(30, 14, 20), (54, 24, 26), (86, 40, 30), (124, 64, 38), (166, 100, 52), (212, 150, 82)],  # iron glaze
    'nuka':    [(58, 64, 92), (90, 102, 130), (136, 150, 172), (182, 194, 206), (220, 228, 230),
                (246, 248, 242)],                                                            # milky ash glaze
    'seiji':   [(28, 46, 60), (42, 72, 82), (64, 106, 104), (96, 142, 126), (140, 180, 154),
                (194, 218, 194)],                                                            # celadon
    'foot':    [(76, 52, 50), (116, 84, 68), (158, 120, 90), (194, 158, 120)],                 # bare buff clay
    'inner':   [(48, 52, 78), (78, 88, 116), (120, 134, 158), (164, 178, 194), (204, 214, 222)],  # inside, nuka
    'innerj':  [(22, 36, 50), (34, 58, 70), (54, 88, 92), (84, 122, 114)],                    # inside, celadon
    'sencha':  [(52, 62, 24), (88, 104, 30), (132, 142, 44), (176, 176, 66), (214, 208, 112),
                (238, 234, 168)],
    'tealeaf': [(14, 26, 26), (22, 44, 34), (36, 66, 40), (58, 92, 46), (94, 124, 60)],
    'matcha':  [(40, 70, 34), (66, 104, 40), (104, 142, 52), (150, 180, 76)],
    'bamboo':  [(88, 66, 46), (130, 104, 66), (172, 148, 92), (206, 186, 128), (230, 216, 168),
                (248, 242, 212)],
    'susu':    [(34, 20, 22), (58, 34, 30), (90, 56, 38), (130, 88, 54), (170, 128, 80),
                (208, 172, 118)],                                                            # smoked bamboo
    'thread':  [(20, 14, 20), (40, 30, 36), (68, 54, 58)],
    'redthread': [(76, 16, 28), (128, 30, 36), (184, 58, 50), (222, 100, 74)],
    'bark':    [(34, 14, 22), (60, 22, 30), (92, 36, 38), (128, 56, 48), (166, 86, 62), (206, 128, 92)],
    'heart':   [(132, 92, 70), (176, 132, 96), (214, 174, 128), (238, 210, 164)],             # pale cherry wood
    'tin':     [(34, 36, 50), (58, 62, 80), (92, 96, 112), (134, 138, 148), (180, 182, 184),
                (226, 224, 214)],
    'copperlid': [(60, 26, 28), (102, 44, 34), (150, 76, 46), (196, 116, 66), (234, 168, 110)],
    'washi':   [(112, 92, 74), (156, 134, 106), (198, 180, 142), (226, 212, 176), (244, 236, 210)],
    'runeink': [(36, 26, 34), (58, 42, 46)],
    'stamp':   [(110, 26, 34), (166, 44, 42), (210, 76, 56)],
    'lacq':    [(12, 9, 15), (22, 16, 24), (36, 28, 38), (62, 52, 64), (110, 102, 114), (184, 178, 184)],
    'shu':     [(60, 14, 24), (98, 22, 30), (142, 34, 36), (186, 58, 46), (222, 100, 72), (244, 158, 118)],
    'gold':    [(80, 50, 26), (134, 90, 36), (188, 140, 52), (230, 190, 88), (250, 228, 156)],
    'paledgold': [(74, 60, 44), (112, 94, 62), (150, 130, 86), (186, 168, 116)],             # rubbed maki-e
    'cord':    [(40, 26, 62), (66, 44, 98), (100, 70, 138), (140, 108, 176), (184, 156, 212)],  # murasaki silk
    'twine':   [(82, 62, 44), (122, 98, 66), (164, 140, 96), (204, 184, 136)],
    'indigo':  [(16, 20, 42), (24, 34, 66), (38, 54, 98), (58, 82, 132), (88, 116, 164)],
    'cotton':  [(98, 108, 138), (146, 154, 176), (196, 200, 208), (232, 232, 226)],            # the cloth's white
    'linen':   [(128, 120, 118), (172, 166, 158), (212, 206, 192), (238, 234, 222)],
    'hole':    [(14, 10, 14), (26, 18, 22), (40, 30, 32)],
    'grime':   [(30, 24, 26), (50, 40, 40), (74, 62, 56), (100, 86, 74), (128, 112, 94)],
    'stain':   [(56, 30, 24), (86, 50, 30), (118, 74, 40), (150, 102, 58), (180, 134, 82)],
    'rust':    [(58, 24, 22), (96, 42, 30), (138, 68, 38), (176, 100, 54), (206, 136, 80)],
    'dust':    [(112, 104, 100), (150, 142, 132), (186, 178, 164), (214, 206, 190)],
    'sashiko': [(150, 156, 172), (206, 208, 210), (240, 238, 230)],
    'steam':   [(150, 148, 160), (196, 196, 204), (236, 236, 236)],
}
INK = (30, 18, 26)              # the warm near-black of the shadow-side outline


def _register():
    """Expose the ramps to the pack as pixel.RAMPS['tea_*'] (so step() and
    friends work on these colours too)."""
    for nm, cols in R.items():
        key = 'tea_' + nm
        pixel.RAMPS[key] = cols
        for i, c in enumerate(cols):
            pixel.PAL[f'{key}{i}'] = c
            pixel.LOOKUP.setdefault(c, (key, i))
    pixel.RAMPS['tea_ink'] = [INK]
    pixel.PAL['tea_ink'] = INK


_register()

# ---------------------------------------------------------------- materials
# id -> (ramp, kind, wrap, lift). kind: 'matte' clusters its band edges,
# 'glaze' / 'lacq' / 'metal' / 'liquid' are glossy and keep them crisp.
MATS = {}
MID = {}


def _mat(name, ramp, kind='matte', wrap=0.25, lift=0.0, fuzz=0.0):
    i = len(MATS) + 1
    MATS[i] = dict(name=name, ramp=ramp, kind=kind, wrap=wrap, lift=lift, fuzz=fuzz)
    MID[name] = i
    return i


CLAY = _mat('clay', 'clay', 'satin', 0.3, 0.1, 0.035)
KURO = _mat('kuro', 'kuro', 'satin', 0.3, 0.2, 0.06)
SHINO = _mat('shino', 'shino', 'glaze', 0.35, 0.25)
AME = _mat('ame', 'ame', 'glaze', 0.3, 0.15)
NUKA = _mat('nuka', 'nuka', 'glaze', 0.4, 0.25)
SEIJI = _mat('seiji', 'seiji', 'glaze', 0.35, 0.2)
FOOT = _mat('foot', 'foot', 'matte', 0.3, 0.2, 0.12)
INNER = _mat('inner', 'inner', 'glaze', 0.5, 0.1)
INNERJ = _mat('innerj', 'innerj', 'glaze', 0.5, 0.1)
TEA = _mat('tea', 'sencha', 'liquid', 0.4, 0.0)
LEAF = _mat('leaf', 'tealeaf', 'matte', 0.4, 0.2, 0.25)
MATCHA = _mat('matcha', 'matcha', 'matte', 0.4, 0.2, 0.15)
BAMBOO = _mat('bamboo', 'bamboo', 'satin', 0.35, 0.15, 0.04)
SUSU = _mat('susu', 'susu', 'satin', 0.3, 0.15, 0.05)
THREAD = _mat('thread', 'thread', 'matte', 0.4, 0.4)
REDTHREAD = _mat('redthread', 'redthread', 'matte', 0.4, 0.3)
BARK = _mat('bark', 'bark', 'satin', 0.3, 0.1, 0.06)
HEART = _mat('heart', 'heart', 'matte', 0.35, 0.2, 0.06)
TIN = _mat('tin', 'tin', 'metal', 0.2, 0.0)
COPPERLID = _mat('copperlid', 'copperlid', 'metal', 0.2, 0.0)
WASHI = _mat('washi', 'washi', 'matte', 0.45, 0.35, 0.05)
RUNE = _mat('rune', 'runeink', 'matte', 0.4, 0.3)
STAMP = _mat('stamp', 'stamp', 'matte', 0.4, 0.3)
LACQ = _mat('lacq', 'lacq', 'lacq', 0.15, 0.0)
SHU = _mat('shu', 'shu', 'lacq', 0.3, -0.9)
GOLD = _mat('gold', 'gold', 'metal', 0.3, 0.2)
PALEGOLD = _mat('palegold', 'paledgold', 'matte', 0.35, 0.3)
CORD = _mat('cord', 'cord', 'matte', 0.4, 0.2, 0.05)
TWINE = _mat('twine', 'twine', 'matte', 0.45, 0.25, 0.08)
INDIGO = _mat('indigo', 'indigo', 'matte', 0.45, -0.35, 0.06)
COTTON = _mat('cotton', 'cotton', 'matte', 0.45, -0.3, 0.0)
LINEN = _mat('linen', 'linen', 'matte', 0.5, 0.3, 0.06)
HOLE = _mat('hole', 'hole', 'matte', 0.2, 0.0)
GRIME = _mat('grime', 'grime', 'matte', 0.4, 0.2, 0.12)
STAIN = _mat('stain', 'stain', 'satin', 0.35, 0.1, 0.06)
RUST = _mat('rust', 'rust', 'matte', 0.35, 0.1, 0.15)
DUST = _mat('dust', 'dust', 'matte', 0.5, -0.2, 0.0)
SASHIKO = _mat('sashiko', 'sashiko', 'matte', 0.5, 0.3)
MAKIE = _mat('makie', 'gold', 'matte', 0.6, 0.9)
SILVER = _mat('silver', 'tin', 'matte', 0.6, 1.4)

GLOSSY = ('glaze', 'lacq', 'metal', 'liquid', 'satin')


def _n3(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


KEY = _n3((-0.55, 0.7, 0.6))                # upper left, in front (view space)
HALF = _n3(KEY + np.array((0, 0, 1.0)))     # the key's highlight
STREAK = _n3((-0.5, -0.36, 0.79))           # a tall window on the left: the glossy streak down a wall
BOUNCE = _n3((0.55, -0.75, 0.3))            # light thrown back up off the table, lower right

# ---------------------------------------------------------------- noise fixed to the surface
def _hash3(ix, iy, iz):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffff) / 65535.0


def vnoise(p, f):
    q = p * f
    i = np.floor(q).astype(np.int64)
    t = q - i
    t = t * t * (3 - 2 * t)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (t[..., 0] if dx else 1 - t[..., 0]) * (t[..., 1] if dy else 1 - t[..., 1]) * \
                    (t[..., 2] if dz else 1 - t[..., 2])
                out = out + w * _hash3(i[..., 0] + dx, i[..., 1] + dy, i[..., 2] + dz)
    return out


def fbm(p, f):
    return vnoise(p, f) * 0.6 + vnoise(p + 17.3, f * 2.1) * 0.4


# ---------------------------------------------------------------- easing
def clamp01(t):
    return max(0.0, min(1.0, t))


def ease_in(t):
    t = clamp01(t)
    return t * t


def ease_out(t):
    t = clamp01(t)
    return 1 - (1 - t) * (1 - t)


def ease_io(t):
    t = clamp01(t)
    return t * t * (3 - 2 * t)


def back_out(t, s=1.7):
    """Overshoot, then settle."""
    t = clamp01(t) - 1
    return t * t * ((s + 1) * t + s) + 1


def seg(f, a, b):
    """Where frame f is between frames a and b, 0..1."""
    return clamp01((f - a) / float(max(1e-6, b - a)))


def spring(t, freq=2.2, damp=4.0):
    """1 - a damped wobble: overshoot and settle (for landings)."""
    t = max(0.0, t)
    return 1 - math.exp(-damp * t) * math.cos(freq * 2 * math.pi * t)


# ---------------------------------------------------------------- the camera
PITCH = 0.52                    # a little from above: the tops show


def view(yaw, pitch=PITCH):
    return rot_x(pitch) @ rot_y(-yaw)


def project(p, V, scale, origin):
    """Object/world point -> (px, py, z) in a sprite."""
    v = V @ np.asarray(p, float)
    return origin[0] + v[0] * scale, origin[1] - v[1] * scale, v[2]


# ---------------------------------------------------------------- parts
class Part:
    """One rigid piece: shapes in its own space, placed by a rotation `rot`
    about its own origin and a translation `at` (world). paint(g, ctx) assigns
    materials and texture on the traced buffers (g['p'] is in the part's own
    space); nudge(g, idx, ctx) shifts tones after lighting."""

    def __init__(self, shapes, bound, at=(0, 0, 0), rot=None, paint=None, nudge=None, soft_edge=False,
                 name='', lines=None):
        self.S, self.bound = shapes, bound
        self.at = np.asarray(at, float)
        self.rot = np.eye(3) if rot is None else np.asarray(rot, float)
        self.paint, self.nudge = paint, nudge
        self.soft_edge = soft_edge      # draws no depth-break line on what is behind it (tea, steam)
        self.name = name
        self.lines = lines              # lines(ctx) -> [(points (N,3) in part space, colour, closed)]


def trace_part(part, w, h, scale, origin, V):
    Vp = V @ part.rot
    c = V @ part.at
    o = (origin[0] + c[0] * scale, origin[1] - c[1] * scale)
    g = part.S.trace(w, h, scale, o, Vp, bound=part.bound, steps=110)
    g['z'] = np.where(g['hit'], g['z'] + c[2], -1e9)
    g['Vp'] = Vp
    g['origin_px'] = o
    return g


# ---------------------------------------------------------------- styling
def light(g, ctx):
    """Normals -> a ramp index per pixel, per material."""
    h, w = g['hit'].shape
    hit, n, mat, ao, P = g['hit'], g['n'], g['mat'], g['ao'], g['p']
    nl = (n * KEY).sum(-1)
    idx = np.zeros((h, w), int)
    seed = ctx.get('noise_seed', 0.0)
    for m in np.unique(mat[hit]):
        M = MATS[int(m)]
        sel = hit & (mat == m)
        wrap = M['wrap']
        v = np.clip((nl + wrap) / (1 + wrap), 0, 1)
        v = 0.14 + 0.86 * v
        v = v * (0.8 + 0.2 * ao)
        if M['kind'] in ('glaze', 'satin', 'liquid', 'lacq', 'metal'):
            v = v + 0.16 * np.clip((n * BOUNCE).sum(-1), 0, 1)     # reflected light on the shadow side
        if M['fuzz']:
            nz = fbm(P * ctx.get('nscale', 1.0) + seed, 0.32)
            v = v + (nz - 0.5) * M['fuzz'] * 2
        k = len(R[M['ramp']])
        lo = 0.12
        i = np.floor((v - lo) / (1.0 - lo) * (k - 0.4) + M['lift']).astype(int)
        if M['kind'] == 'metal':
            # a polished cylinder reflects the room: sky above the horizon, a dark band, the bright table
            ry = 2 * n[..., 2] * n[..., 1]                      # reflection of the view ray, its height
            env = np.where(ry > 0.55, k - 2, np.where(ry > 0.18, k - 3, np.where(ry > -0.12, 1, 2)))
            i = np.round(0.45 * i + 0.55 * env).astype(int)
        if M['kind'] == 'lacq':
            ry = 2 * n[..., 2] * n[..., 1]
            base = np.where(nl > 0.45, 2, 1) if M['ramp'] == 'lacq' else np.clip(i, 1, 2)
            i = base + (ry > 0.7).astype(int)                       # deep, with the sky in the top faces
        idx[sel] = np.clip(i, 0, k - 1)[sel]
    return idx


def colourize(g, idx, keep):
    """Ramp indices -> RGBA, glints on top (marked in keep so tidy leaves them)."""
    h, w = g['hit'].shape
    out = np.zeros((h, w, 4), np.uint8)
    n, mat, hit = g['n'], g['mat'], g['hit']
    sp = (n * HALF).sum(-1)
    st = (n * STREAK).sum(-1)
    for m in np.unique(mat[hit]):
        M = MATS[int(m)]
        sel = hit & (mat == m)
        pal = np.array(R[M['ramp']], np.uint8)
        k = len(pal)
        out[sel, :3] = pal[np.clip(idx, 0, k - 1)[sel]]
        out[sel, 3] = 255
        kind = M['kind']
        if kind == 'lacq':
            # a window reflected in the urushi: two crisp diagonal bands, fixed to the view
            yy, xx = np.mgrid[0:h, 0:w]
            o = g.get('origin_px', (0, 0))
            dd = np.mod((xx - o[0]) + 0.9 * (yy - o[1]) + 400, 46)
            ry = 2 * n[..., 2] * n[..., 1]
            up = sel & (ry > 0.6) & g.get('glossmask', hit) & (M['ramp'] == 'lacq')
            b1 = up & (dd < 3)
            b2 = up & (dd >= 5) & (dd < 6)
            out[b1, :3] = pal[min(k - 2, 4)]
            out[b2, :3] = pal[min(k - 3, 3)]
            front = sel & (n[..., 2] > 0.8) & (np.abs(n[..., 0]) < 0.3) & g.get('glossmask', hit)
            fv = front & (np.mod((xx - o[0]) + 0.25 * (yy - o[1]) + 400, 46) < 2)
            out[fv, :3] = pal[min(k - 3, 3)]
            gl = sel & ((sp > 0.97) | (st > 0.98)) & g.get('bevelmask', g.get('glossmask', hit))
            if 'bevel' in g:
                gl &= g['bevel']
            out[gl, :3] = pal[-1]
            keep |= gl | b1
        elif kind in ('glaze', 'liquid'):
            gl = sel & ((sp > 0.975) | (st > 0.985)) & g.get('glossmask', hit)
            out[gl, :3] = pal[-1]
            keep |= gl
        elif kind == 'metal':
            gl = sel & ((sp > 0.96) | (st > 0.975))
            out[gl, :3] = pal[-1]
            keep |= gl
        elif kind == 'satin':
            gl = sel & (sp > 0.985) & g.get('glossmask', hit)
            out[gl, :3] = pal[-1]
            keep |= gl
    return out


def _shift(a, dy, dx, fill):
    out = np.full_like(a, fill)
    h, w = a.shape[:2]
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = \
        a[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def outline(rgba, mat, z, soft, inner, N=None, scale=1.0):
    """Selective outline (outside the silhouette) and depth-break lines
    inside: on the far side of a break, the darkest tone of what is there."""
    m = rgba[..., 3] > 0
    out = rgba.copy()
    matm = np.where(m, mat, 0)
    nbm = [_shift(m, dy, dx, False) for dy, dx in ((0, -1), (-1, 0), (0, 1), (1, 0))]
    nbmat = [_shift(matm, dy, dx, 0) for dy, dx in ((0, -1), (-1, 0), (0, 1), (1, 0))]
    edge = ~m & (nbm[0] | nbm[1] | nbm[2] | nbm[3])
    lit = (nbm[0] | nbm[1]) & ~(nbm[2] | nbm[3])        # the object lies right of / below: upper-left edge
    first = np.where(nbm[0], nbmat[0], np.where(nbm[1], nbmat[1], np.where(nbm[2], nbmat[2], nbmat[3])))
    dark = np.zeros(m.shape + (3,), np.uint8)
    dark[:] = INK
    for mm in np.unique(first[edge & lit]):
        if mm:
            r = R[MATS[int(mm)]['ramp']]
            dark[first == mm] = r[0] if len(r) < 5 else r[1]
    out[edge & lit, :3] = dark[edge & lit]
    out[edge & ~lit, :3] = INK
    out[edge, 3] = 255
    zz = np.where(m, z, -1e9)
    brk = np.zeros(m.shape, bool)
    if N is not None:
        nzc = np.maximum(N[..., 2], 0.22)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nz = _shift(zz, dy, dx, -1e9)          # nz[y, x] = zz[y - dy, x - dx]: the neighbour at (-dx, -dy)
        ns = _shift(soft, dy, dx, False)
        pred = 0.0
        if N is not None:
            # how much nearer that neighbour would be if the surface simply carried on
            pred = np.maximum(0.0, (N[..., 0] * dx - N[..., 1] * dy) / scale / nzc)
        brk |= m & (nz > zz + inner + pred) & ~ns
    for mm in np.unique(matm[brk]):
        if mm:
            sel = brk & (matm == mm)
            out[sel, :3] = R[MATS[int(mm)]['ramp']][0]
    return out


def tidy(rgba, keep=None, passes=2):
    """Lone specks - unlike all four neighbours, three of which agree - take
    their neighbours' colour (glints and painted details in keep stay)."""
    a = rgba
    for _ in range(passes):
        c = a.astype(np.int64)
        key = (c[..., 0] << 24) | (c[..., 1] << 16) | (c[..., 2] << 8) | c[..., 3]
        p = np.pad(key, 1, mode='edge')
        up, dn, lf, rt = p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]
        diff = (key != up) & (key != dn) & (key != lf) & (key != rt) & ((key & 255) > 0)
        if keep is not None:
            diff &= ~keep
        pa = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode='edge')
        srcs = {'u': pa[:-2, 1:-1], 'd': pa[2:, 1:-1], 'l': pa[1:-1, :-2], 'r': pa[1:-1, 2:]}
        for nm, nb in (('u', up), ('d', dn), ('l', lf), ('r', rt)):
            agree = (nb == up).astype(int) + (nb == dn) + (nb == lf) + (nb == rt)
            fix = diff & (agree >= 3) & ((nb & 255) > 0)
            a[fix] = srcs[nm][fix]
            diff &= ~fix
    return a


def render(parts, w, h, scale, origin, yaw=0.0, pitch=PITCH, ctx=None, inner=None):
    """Trace every part, paint, light and colour it, merge by depth, outline.
    Returns (rgba, info) - info has the merged z, mat and a 'proj' function."""
    ctx = dict(ctx or {})
    V = view(yaw, pitch)
    ctx.update(V=V, scale=scale, origin=origin, px=1.0 / scale)
    rgba = np.zeros((h, w, 4), np.uint8)
    Z = np.full((h, w), -1e9)
    MAT = np.zeros((h, w), np.int64)
    SOFT = np.zeros((h, w), bool)
    KEEP = np.zeros((h, w), bool)
    NRM = np.zeros((h, w, 3))
    PID = np.full((h, w), -1)
    for pi, part in enumerate(parts):
        g = trace_part(part, w, h, scale, origin, V)
        if not g['hit'].any():
            continue
        if part.paint:
            part.paint(g, ctx)
        idx = light(g, ctx)
        if part.nudge:
            part.nudge(g, idx, ctx)
        keep = np.zeros((h, w), bool)
        if 'keep' in g:
            keep |= g['keep']
        col = colourize(g, idx, keep)
        if 'over' in g:                                  # flat painted pixels (runes, kintsugi glints)
            om = g['over'][..., 3] > 0
            col[om] = g['over'][om]
            keep |= om
        win = g['hit'] & (g['z'] > Z)
        rgba[win] = col[win]
        Z[win] = g['z'][win]
        MAT[win] = g['mat'][win]
        NRM[win] = g['n'][win]
        SOFT[win] = part.soft_edge
        KEEP[win] = keep[win]
        PID[win] = pi
    if inner is None:
        inner = 1.2 + 0.6 / scale
    out = outline(rgba, MAT, Z, SOFT, inner, NRM, scale)
    out = tidy(out, keep=KEEP)
    for pi, part in enumerate(parts):
        if part.lines:
            ctx['Vpart'] = V @ part.rot
            for pts, colour, closed in part.lines(ctx):
                pw = np.asarray(pts, float) @ part.rot.T + part.at
                draw3d(out, Z, MAT, pw, V, scale, origin, colour, closed)
    info = dict(z=Z, mat=MAT, pid=PID, V=V, proj=lambda p: project(p, V, scale, origin))
    return out, info


def draw3d(out, Z, MAT, pts, V, scale, origin, colour, closed=False, tol=0.9):
    """A clean 1px line along a 3D polyline, drawn only where it lies on the
    visible surface. colour: an rgb, or ('dark', k) for tone k of whatever
    material it crosses."""
    h, w = Z.shape
    v = pts @ V.T
    sx = origin[0] + v[:, 0] * scale
    sy = origin[1] - v[:, 1] * scale
    sz = v[:, 2]
    n = len(pts)
    segs = list(zip(range(n - 1), range(1, n)))
    if closed:
        segs.append((n - 1, 0))
    done = set()
    for i0, i1 in segs:
        L = int(max(abs(sx[i1] - sx[i0]), abs(sy[i1] - sy[i0]))) + 1
        for k in range(L + 1):
            t = k / L
            x = int(math.floor(sx[i0] + (sx[i1] - sx[i0]) * t))
            y = int(math.floor(sy[i0] + (sy[i1] - sy[i0]) * t))
            if (x, y) in done or not (0 <= x < w and 0 <= y < h):
                continue
            z = sz[i0] + (sz[i1] - sz[i0]) * t
            if out[y, x, 3] == 0 or z < Z[y, x] - tol:
                continue
            done.add((x, y))
            if isinstance(colour, tuple) and colour and colour[0] == 'dark':
                m = int(MAT[y, x])
                ramp = R[MATS[m]['ramp']] if m else [INK]
                out[y, x, :3] = ramp[min(colour[1], len(ramp) - 1)]
            elif callable(colour):
                out[y, x, :3] = colour(y, x, t, out[y, x, :3])
            else:
                out[y, x, :3] = colour
    return out


def circle3d(c, radius, n=48, y=None):
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.stack([c[0] + radius * np.cos(a), np.full(n, c[1] if y is None else y), c[2] + radius * np.sin(a)], -1)


# ---------------------------------------------------------------- shape helpers
def lathe(S, prof, mat, k=0.8, op=0):
    """A turned body: a chain of capsules up the y axis, prof = [(y, r), ...]."""
    for (y0, r0), (y1, r1) in zip(prof[:-1], prof[1:]):
        S.cap((0, y0, 0), (0, y1, 0), r0, r1, k=k, mat=mat, op=op)


def cut_above(S, y, k=0.0, mat=0, big=80.0):
    S.box((0, y + big, 0), (big, big, big), k=k, mat=mat, op=1)


def cut_below(S, y, k=0.0, mat=0, big=80.0):
    S.box((0, y - big, 0), (big, big, big), k=k, mat=mat, op=1)


def frame_of(d):
    """An orthonormal frame (x, y, z columns) whose y axis points along d."""
    d = _n3(d)
    a = np.array((1.0, 0, 0)) if abs(d[0]) < 0.9 else np.array((0, 0, 1.0))
    x = _n3(np.cross(a, d))
    z = np.cross(x, d)
    return np.column_stack([x, d, z])


def cyl_coords(P):
    """Angle round the y axis and radius, for painting on turned things."""
    return np.arctan2(P[..., 2], P[..., 0]), np.hypot(P[..., 0], P[..., 2])


def facing(yaw, pitch=PITCH):
    """The angle round the y axis that faces the viewer at this yaw."""
    d = view(yaw, pitch).T @ np.array((0, 0, 1.0))
    return math.atan2(d[2], d[0])


def adiff(a, b):
    """Signed difference of two angles, wrapped to -pi..pi."""
    return np.mod(a - b + np.pi, 2 * np.pi) - np.pi


VARIANTS = ('clean', 'worn', 'dirty', 'repaired')


# ================================================================ yunomi
# a tall handleless cup; units are icon pixels. The main one is Mashiko-style:
# a glossy iron-brown body dipped rim-first in milky nuka (rice-husk ash)
# glaze that has run down in drips; the foot is bare buff clay.
YU_OUT = [(2.0, 6.3), (5.0, 7.35), (9.0, 7.85), (13.0, 7.8), (17.0, 7.78), (21.0, 7.8), (26.4, 8.15)]
YU_IN = [(10.4, 6.5), (15.5, 6.6), (21.0, 6.62), (34.0, 7.0)]
YU_RIM = 26.2


def yu_inner_r(y):
    ys = [a for a, _ in YU_IN]
    rs = [b for _, b in YU_IN]
    if y <= ys[0]:
        return max(0.5, math.sqrt(max(0.0, rs[0] ** 2 - (ys[0] - y) ** 2)))
    return float(np.interp(y, ys, rs))


def crack_path(seed, top, bottom, n=13, wander=0.11):
    """A crack's path round a turned thing: (heights, angle offsets), jagged
    the way fired clay breaks - mostly straight runs with sudden turns."""
    rs = np.random.RandomState(seed)
    ys = np.linspace(top, bottom, n)
    st = rs.uniform(-wander, wander, n) * (1 + 2.2 * (rs.uniform(0, 1, n) > 0.75))
    off = np.cumsum(st)
    off -= off[0]
    return ys[::-1], off[::-1]


def yunomi(variant='clean', glaze='nuka', fill=0.0, at=(0, 0, 0), rot=None, face=0.0, tag='icon', ripple=0.0):
    """Parts of a yunomi. glaze 'nuka' (iron-brown, dipped in white ash glaze)
    or 'seiji' (celadon). fill 0..1 of sencha. face = the angle round the cup
    that shows its story (chip, seam, drips) to the viewer at rest."""
    S = Shapes()
    lathe(S, YU_OUT, AME, k=1.0)
    cut_above(S, YU_RIM, k=0.7)
    cut_below(S, 2.2)
    S.ell((0, 1.3, 0), (5.7, 2.7, 5.7), k=0.6, mat=FOOT)
    cut_below(S, 0.0, k=0.35)
    lathe(S, YU_IN, INNER, k=0.6, op=1)
    chips = []
    if variant == 'worn' or (tag == 'kit' and glaze == 'nuka' and variant == 'clean'):
        chips.append((face - 0.45, 1.45))                                  # a bite out of the rim
    if variant == 'worn':
        chips.append((face + 2.0, 1.15))
        chips.append((face + 0.9, 0.8))
    for (a, r) in chips:
        rr = 8.0
        S.ell((rr * math.cos(a), YU_RIM + 0.35, rr * math.sin(a)), (r, r * 0.95, r), mat=FOOT, op=1)
    if variant == 'repaired':                                              # an old crack held with staples
        cs, co = crack_path(11, YU_RIM, 5.0, wander=0.05)
        for yy in (21.5, 15.5, 9.5):
            a = face + 1.05 + float(np.interp(yy, cs, co))
            rad = 7.8
            tang = np.array((-math.sin(a), 0, math.cos(a)))
            nrm = np.array((math.cos(a), 0, math.sin(a)))
            Rb = np.column_stack([tang, (0, 1, 0), nrm])
            S.box(tuple(nrm * (rad + 0.1) + (0, yy, 0)), (1.8, 0.45, 0.45), rot=Rb, round=0.2, mat=TIN)
            for s in (-1, 1):
                S.ell(tuple(nrm * (rad + 0.2) + tang * 1.7 * s + (0, yy, 0)), (0.6, 0.6, 0.6), mat=TIN)
    if glaze == 'nuka':
        body, dipm, inm = AME, NUKA, INNER
    else:
        body, dipm, inm = SEIJI, SEIJI, INNERJ
    drips = [(face - 0.3, 8.0), (face + 0.38, 3.2), (face + 0.95, 5.6), (face + 2.4, 6.5), (face - 1.9, 4.2),
             (face + 3.6, 3.0)]

    def paint(g, ctx):
        P, hit, mat = g['p'], g['hit'], g['mat']
        th, r = cyl_coords(P)
        y = P[..., 1]
        px = ctx['px']
        outer = hit & (mat == AME)
        inner = hit & (mat == INNER)
        mat[outer] = body
        mat[inner] = inm
        # the glaze stops short of the foot in a soft wavy line, pooling darker just above it
        gl = 3.1 + 0.45 * np.sin(2 * th + 0.5) + 0.25 * np.sin(5 * th + 1.3)
        bare = outer & (y < gl)
        mat[bare] = FOOT
        g['pool'] = outer & ~bare & (y < gl + 1.1 * px)
        g['halo'] = np.zeros(hit.shape, bool)
        if glaze == 'nuka':
            dip = YU_RIM - 7.0 + 0.6 * np.sin(3 * th + 1.0) + 0.35 * np.sin(7 * th)
            marg = y - dip
            for (a, L) in drips:
                s = adiff(th, a) * r
                bot = dip - L
                strip = np.minimum(0.85 - np.abs(s), y - bot)
                blob = (1 - np.sqrt((s / 1.25) ** 2 + ((y - bot) / 1.35) ** 2)) * 1.2
                marg = np.maximum(marg, np.maximum(strip, blob))
            white = outer & ~bare & (marg > 0)
            mat[white] = NUKA
            g['halo'] = white & (marg < 0.75 * px + 0.15)                 # thin at its edge: the brown shows
            g['rim_thin'] = hit & (y > YU_RIM - 0.45) & (r > 7.3)
        g['lip'] = hit & (y > YU_RIM - 0.5) & (r > 7.0)
        if variant == 'worn':
            q = np.stack([np.cos(th) * r, y, np.sin(th) * r], -1)
            f = vnoise(q * 0.62, 1.0)
            g['craze'] = hit & np.isin(mat, [NUKA, SEIJI, inm]) & (np.abs(f - 0.5) < 0.04)
            g['rub'] = hit & (y > YU_RIM - 0.8) & (vnoise(P * 1.3, 1.0) > 0.55) & ~np.isin(mat, [FOOT])
        if variant == 'dirty':
            lvl = 13.0 + 0.25 * np.sin(th * 3)
            ring = hit & (mat == inm) & (np.abs(y - lvl) < 0.5 * px + 0.25)
            tannin = hit & (mat == inm) & (y < lvl) & (vnoise(P * 0.9, 1.0) > 0.4)
            run = np.zeros(hit.shape, bool)
            for (a, L) in ((face + 0.15, 11.0), (face + 0.55, 6.0), (face - 1.3, 8.5)):
                s = adiff(th, a) * r
                wob = 0.3 * np.sin(y * 1.1 + a * 5)
                run |= (np.abs(s + wob) < 0.55) & (y > YU_RIM - L) & (y < YU_RIM + 0.5)
                run |= ((s / 0.9) ** 2 + ((y - (YU_RIM - L)) / 1.0) ** 2 < 1)
            mat[ring | tannin] = STAIN
            mat[run & outer] = STAIN
            gr = hit & (y < gl + 1.8) & (fbm(P * 0.7, 1.0) > 0.42)
            mat[gr] = GRIME
            g['spot'] = hit & outer & (vnoise(P * 2.2, 1.0) > 0.78)
        seam = np.zeros(hit.shape, bool)
        if variant == 'repaired' or (tag == 'kit' and glaze == 'seiji'):
            # kintsugi: the break filled with lacquer and dusted with gold, a branch splitting off
            cs, co = crack_path(5, YU_RIM + 0.5, 5.5)
            base = face - 0.15
            a0 = base + np.interp(y, cs, co)
            seam |= (np.abs(adiff(th, a0)) * r < 0.5 * px + 0.1) & (y > 6.5)
            bs, bo = crack_path(8, 17.5, 9.0, n=7)
            b0 = base + float(np.interp(17.5, cs, co)) + np.interp(y, bs, bo) + (17.5 - y) * 0.055
            seam |= (np.abs(adiff(th, b0)) * r < 0.5 * px + 0.08) & (y < 17.5) & (y > 9.5)
            seam &= hit
            mat[seam] = GOLD
        g['seam'] = seam
        if variant == 'repaired':
            cs, co = crack_path(11, YU_RIM, 5.0, wander=0.05)
            a1 = face + 1.05 + np.interp(y, cs, co)
            g['hair'] = hit & (np.abs(adiff(th, a1)) * r < 0.45 * px) & (y > 5.0) & (mat != TIN)
        g['glossmask'] = hit & ~((variant in ('worn', 'dirty')) & (r > 7.0) & (y < YU_RIM - 1))

    def nudge(g, idx, ctx):
        m = g['mat']
        idx[g['pool']] -= 1
        idx[g['halo']] -= 2
        idx[g['lip'] & np.isin(m, [NUKA, SEIJI, AME])] += 1
        if 'rim_thin' in g:
            idx[g['rim_thin'] & (m == NUKA)] -= 0
        if 'craze' in g:
            idx[g['craze']] -= 1
        if 'rub' in g:
            idx[g['rub']] += 1
        if 'hair' in g:
            idx[g['hair']] = 0
        if 'spot' in g:
            idx[g['spot']] -= 1
        idx[g['seam']] = np.maximum(idx[g['seam']], 2)
    parts = [Part(S, 30, at=at, rot=rot, paint=paint, nudge=nudge, name='yunomi')]
    if fill > 0.01:
        L = tea_level(fill)
        T = Shapes()
        lathe(T, [(yy, r + 0.3) for (yy, r) in YU_IN], TEA, k=0.6)
        cut_above(T, L)
        rr = yu_inner_r(L)

        def tpaint(g, ctx):
            th, r = cyl_coords(g['p'])
            top = g['hit'] & (g['p'][..., 1] > L - 0.6)
            g['men'] = top & (r > rr - 0.9 * ctx['px'] - 0.4)
            g['rip'] = top & (ripple > 0) & (np.abs(r - ripple) < 0.6 * ctx['px'])
            g['deep'] = top & (r < rr * 0.55)

        def tnudge(g, idx, ctx):
            idx[g['deep']] -= 1
            idx[g['men']] += 1
            idx[g['rip']] += 2
        parts.append(Part(T, 30, at=at, rot=rot, paint=tpaint, nudge=tnudge, soft_edge=True, name='tea'))
    return parts


def tea_level(fill):
    return 4.0 + (YU_RIM - 1.4 - 4.0) * fill


# ================================================================ kyusu
# tokoname red clay: a squat drum of a body with a flat shoulder, a low lid
# sitting in it, a short spout and the straight side handle at a right angle
# to it; units are icon pixels. Spout along +x, handle along +z.
KY_SH = 10.2                                   # the shoulder plane
KY_SPOUT = [((8.6, 4.2, 0.0), 3.1), ((14.0, 6.3, 0.0), 2.15), ((18.0, 9.4, 0.0), 1.45)]
KY_HDIR = _n3((-0.34, 0.22, 0.94))
KY_HBASE = np.array((-2.4, 4.9, 7.0))
KY_HLEN = 13.0
KY_TIP = np.array((18.4, 9.9, 0.0))          # where tea leaves the spout
KY_YAW = 0.26                                  # spout in profile, handle toward the viewer's left


def ring(S, c, radius, tube, mat, n=18, k=0.0):
    """A torus from capsules round the y axis (a rolled lip, a cord loop)."""
    pts = [(c[0] + radius * math.cos(2 * math.pi * i / n), c[1], c[2] + radius * math.sin(2 * math.pi * i / n))
           for i in range(n + 1)]
    for p0, p1 in zip(pts[:-1], pts[1:]):
        S.cap(p0, p1, tube, k=k, mat=mat)


def _ky_lid(S, variant, lift=0.0, tilt=None):
    """The lid and its knob, in their own little frame so a lid can lift.
    Repaired: a stand-in in black clay with a flat button knob."""
    lm = KURO if variant == 'repaired' else CLAY
    y0 = KY_SH - 0.6 + lift
    S.ell((0, y0, 0), (6.3, 2.6, 6.3), mat=lm)
    if variant == 'repaired':
        S.cap((0, y0 + 2.3, 0), (0, y0 + 3.1, 0), 1.1, 1.2, k=0.4, mat=lm)
        S.ell((0, y0 + 3.5, 0), (2.8, 1.1, 2.8), k=0.3, mat=lm)
    else:
        S.cap((0, y0 + 2.2, 0), (0, y0 + 3.2, 0), 1.3, 1.5, k=0.5, mat=lm)
        S.ell((0, y0 + 3.9, 0), (2.4, 1.75, 2.4), k=0.3, mat=lm)
    if variant == 'worn':
        S.ell((5.9 * math.cos(2.0), y0 + 1.0, 5.9 * math.sin(2.0)), (1.2, 1.1, 1.2), mat=FOOT, op=1)


def kyusu(variant='clean', at=(0, 0, 0), rot=None, face=0.0):
    S = Shapes()
    S.ell((0, 5.9, 0), (11.3, 6.5, 11.3), mat=CLAY)
    cut_above(S, KY_SH, k=2.4)
    cut_below(S, 1.4, k=0.4)
    S.ell((0, 1.4, 0), (7.6, 2.3, 7.6), k=0.5, mat=FOOT)
    cut_below(S, 0.0, k=0.3)
    (a, ra), (b, rb), (c, rc) = KY_SPOUT
    S.cap(a, b, ra, rb, k=1.6, mat=CLAY)
    S.cap(b, c, rb, rc, k=0.7, mat=CLAY)
    d = _n3(np.subtract(c, b))
    nrm = _n3(d + np.array((0.0, 0.45, 0.0)))
    tip = np.add(c, d * 0.5)
    S.box(tuple(tip + nrm * 5), (5, 5, 5), rot=frame_of(nrm), mat=CLAY, op=1)
    S.cap(b, tuple(np.add(c, d * 3)), 0.85, 0.75, mat=HOLE, op=1)
    if variant == 'worn':
        S.ell(tuple(tip + np.array((-0.3, 0.1, 1.0))), (0.95, 0.95, 0.95), mat=FOOT, op=1)
    hb, hd = KY_HBASE, KY_HDIR
    he = hb + hd * KY_HLEN
    S.cap(tuple(hb), tuple(hb + hd * 4), 2.7, 2.3, k=1.4, mat=CLAY)
    S.cap(tuple(hb + hd * 4), tuple(he), 2.3, 2.0, k=0.3, mat=CLAY)
    S.box(tuple(he - hd * 0.2 + hd * 5), (5, 5, 5), rot=frame_of(hd), k=0.3, mat=CLAY, op=1)
    S.cap(tuple(he - hd * 2.5), tuple(he + hd * 1), 0.85, mat=HOLE, op=1)
    if variant == 'repaired':                                           # the handle bound in twine
        S.cap(tuple(hb + hd * 5.0), tuple(hb + hd * 10.8), 2.6, 2.4, mat=TWINE)
    _ky_lid(S, variant)

    def paint(g, ctx):
        P, hit, mat = g['p'], g['hit'], g['mat']
        px = ctx['px']
        th, r = cyl_coords(P)
        y = P[..., 1]
        rel = P - hb
        t_h = (rel * hd).sum(-1)
        on_h = hit & (np.linalg.norm(rel - t_h[..., None] * hd, axis=-1) < 3.3) & (t_h > 2.0)
        on_sp = hit & (P[..., 0] > 8.5)
        body = hit & ~on_h & ~on_sp
        # the gap round the lid, and a fine line incised round the shoulder
        g['seam'] = body & (np.abs(r - 6.6) < 0.45 * px + 0.2) & (y > KY_SH - 1.0) & (y < KY_SH + 0.6)
        # the shoulder's edge catches the light
        g['shoulder'] = body & (mat == CLAY) & (r > 7.6) & (r < 9.4) & (y > KY_SH - 1.4) & (g['n'][..., 1] > 0.55)
        if variant == 'repaired':
            tw = hit & (mat == TWINE)
            ang = np.arctan2((rel * np.array((0, 1.0, 0))).sum(-1) - t_h * hd[1], P[..., 0] - hb[0])
            g['wrap'] = tw & (np.mod(t_h * 1.5 + ang * 0.32, 1) < 0.34)
            cs, co = crack_path(21, KY_SH + 0.2, 2.5, n=11, wander=0.13)
            a0 = face + 0.25 + np.interp(y, cs, co)
            seam = body & (mat == CLAY) & (np.abs(adiff(th, a0)) * r < 0.5 * px + 0.1) & (y > 2.5) & (y < KY_SH)
            bs, bo = crack_path(4, 8.0, 3.5, n=6)
            b0 = face + 0.25 + float(np.interp(8.0, cs, co)) - np.interp(y, bs, bo) - (8.0 - y) * 0.09
            seam |= body & (mat == CLAY) & (np.abs(adiff(th, b0)) * r < 0.5 * px + 0.08) & (y > 3.5) & (y < 8.0)
            mat[seam] = GOLD
        if variant == 'worn':
            g['rub'] = hit & np.isin(mat, [CLAY]) & (((r > 6.9) & (y > KY_SH - 1.0)) | (y > KY_SH + 3.6)) & \
                (vnoise(P * 1.3, 1.0) > 0.42)
        if variant == 'dirty':
            # tea run from the spout down the belly, a tannin ring at the lid, soot from the brazier
            ds = (np.abs(P[..., 2] - 0.3 * np.sin(y * 1.3)) < 0.75 + 0.2 * px) & (y < 8.5) & (y > 1.0) & \
                (P[..., 0] > 6.0)
            ds |= (np.abs(P[..., 2] - 1.3) < 0.5) & (y < 8.0) & (y > 4.0) & (P[..., 0] > 6.0)
            ds |= hit & (np.linalg.norm(P - np.array((16.5, 9.4, 0.0)), axis=-1) < 2.2)
            mat[hit & ds & (mat == CLAY)] = STAIN
            mat[g['seam'] & (mat == CLAY)] = STAIN
            soot = hit & (y < 4.2 + 1.6 * vnoise(P * 0.8, 1.0)) & np.isin(mat, [CLAY, FOOT])
            mat[soot] = GRIME
            dust = hit & (g['n'][..., 1] > 0.6) & (fbm(P * 0.5, 1.0) > 0.57) & (y > KY_SH - 1)
            mat[dust & np.isin(mat, [CLAY])] = DUST
        g['glossmask'] = hit & (variant not in ('worn', 'dirty'))

    def nudge(g, idx, ctx):
        if 'wrap' in g:
            idx[g['wrap']] -= 1
        if 'rub' in g:
            idx[g['rub']] += 1
        gold = g['hit'] & (g['mat'] == GOLD)
        idx[gold] = np.maximum(idx[gold], 2)
    def lines(ctx):
        return [(circle3d((0, 0, 0), 6.5, 72, y=KY_SH - 0.25), ('dark', 0), True)]
    return [Part(S, 34, at=at, rot=rot, paint=paint, nudge=nudge, name='kyusu', lines=lines)]


# ================================================================ chasen
# the whisk: a bamboo handle with its node, black thread at the waist, then
# outer tines bowing out and curling in at the tips round an inner bundle.
CH_N, CH_NI = 28, 14


def _tine_path(a, variant, k):
    """Points (x, y, z) of outer tine k at angle a."""
    prof = [(2.4, 15.0), (4.7, 12.4), (6.4, 8.6), (6.6, 5.0), (5.7, 2.5), (4.3, 1.3)]
    rs = np.random.RandomState(100 + k)
    if variant == 'worn':
        if k in (3, 11, 19):                       # snapped short
            prof = prof[:4]
            prof[-1] = (prof[-1][0] + 0.6, prof[-1][1] + 0.8)
        elif k in (6, 15, 24, 25):                 # sprung out of line
            prof = prof[:3] + [(7.6, 5.2), (7.9, 2.6), (7.4, 1.4)]
    if variant == 'repaired' and k in (5, 13):
        prof = prof[:4]
    out = []
    for (r, y) in prof:
        r = r + rs.uniform(-0.08, 0.08)
        out.append((r * math.cos(a), y, r * math.sin(a)))
    return out


def chasen(variant='clean', at=(0, 0, 0), rot=None, face=0.0, splay=0.0):
    S = Shapes()
    hm = BAMBOO
    S.cap((0, 16.5, 0), (0, 26.0, 0), 2.55, 2.5, mat=hm)
    cut_above(S, 27.4, k=0.3)
    S.ell((0, 22.4, 0), (2.85, 0.75, 2.85), k=0.4, mat=hm)                # the node
    S.cap((0, 25.0, 0), (0, 30.0, 0), 1.7, mat=HOLE, op=1)
    tm = REDTHREAD if variant == 'repaired' else THREAD
    ring(S, (0, 15.2, 0), 2.65, 0.5, tm, n=16)
    ring(S, (0, 15.85, 0), 2.6, 0.45, tm, n=16)
    for k in range(CH_N):
        a = 2 * math.pi * k / CH_N + 0.11 * (k % 2)
        pts = _tine_path(a, variant, k)
        if splay:
            pts = [(x * (1 + splay * (15 - y) / 15 * 0.25), y + splay * 0.4 * (15 - y) / 15, z * (1 + splay * (15 - y) / 15 * 0.25))
                   for (x, y, z) in pts]
        for i, (p0, p1) in enumerate(zip(pts[:-1], pts[1:])):
            S.cap(p0, p1, 0.5 - 0.03 * i, 0.47 - 0.03 * i, mat=BAMBOO)
    for k in range(CH_NI):
        a = 2 * math.pi * (k + 0.5) / CH_NI
        prof = [(1.3, 15.0), (2.3, 10.5), (2.1, 6.0), (1.5, 4.4)]
        pts = [(r * math.cos(a), y, r * math.sin(a)) for (r, y) in prof]
        for p0, p1 in zip(pts[:-1], pts[1:]):
            S.cap(p0, p1, 0.45, mat=BAMBOO)
    if variant == 'repaired':                                       # snapped tines bound with twine
        ring(S, (0, 11.6, 0), 4.9, 0.55, TWINE, n=20)
        ring(S, (0, 19.0, 0), 2.75, 0.5, TWINE, n=16)

    def paint(g, ctx):
        P, hit, mat = g['p'], g['hit'], g['mat']
        th, r = cyl_coords(P)
        y = P[..., 1]
        tine = hit & (mat == BAMBOO) & (y < 15.5)
        handle = hit & (mat == BAMBOO) & (y >= 15.5)
        # each tine: lit down its middle, darker in the grooves between
        f = np.mod(th / (2 * np.pi) * CH_N + 0.5, 1)
        g['groove'] = tine & (r > 3.2) & ((f < 0.2) | (f > 0.8))
        g['inner'] = tine & (r < 3.0)
        g['node'] = handle & (np.abs(y - 22.4) < 0.5)
        g['fibre'] = handle & (np.mod(th * 6.0, 1) < 0.18) & (np.abs(y - 22.4) > 0.9)
        if variant == 'dirty':
            stained = tine & (y < 5.2 + 1.6 * vnoise(P * 0.8, 1.0))
            mat[stained] = MATCHA
            mat[handle & (fbm(P * 0.3, 1.0) > 0.62) & (y < 21)] = GRIME
        if variant == 'worn':
            g['old'] = tine & (vnoise(P * 0.7, 1.0) > 0.5)

    def nudge(g, idx, ctx):
        idx[g['groove']] -= 1
        idx[g['inner']] -= 1
        idx[g['node']] -= 1
        idx[g['fibre']] -= 1
        if 'old' in g:
            idx[g['old']] -= 1
    return [Part(S, 32, at=at, rot=rot, paint=paint, nudge=nudge, name='chasen')]


# ================================================================ chashaku
# the scoop: a long sliver of smoked bamboo with its node in the middle and
# the tip bent up into a little spoon. Lies along x, tip at +x.
def _shaku_path(n=16, length=34.0):
    out = []
    for i in range(n + 1):
        t = i / n
        x = -length / 2 + length * t
        y = 0.7 * math.sin(math.pi * t)
        out.append((x, y))
    # the bent tip
    tip = []
    bx, by = out[-1]
    ang = 0.0
    for i in range(1, 5):
        ang += 0.32
        bx += 1.2 * math.cos(ang)
        by += 1.2 * math.sin(ang)
        tip.append((bx, by))
    return out, tip


SHAKU_NODE = 1.5


def chashaku(variant='clean', at=(0, 0, 0), rot=None, face=0.0, heap=0.0):
    S = Shapes()
    body, tip = _shaku_path()
    pts = body + tip
    snapped = variant == 'repaired'
    for i, ((x0, y0), (x1, y1)) in enumerate(zip(pts[:-1], pts[1:])):
        t = i / (len(pts) - 2)
        wdt = 1.5 + 0.3 * t + (0.3 if i >= len(body) - 1 else 0)
        c = ((x0 + x1) / 2, (y0 + y1) / 2, 0.0)
        ang = math.atan2(y1 - y0, x1 - x0)
        L = math.hypot(x1 - x0, y1 - y0) / 2 + 0.35
        S.box(c, (L, 0.62, wdt), rot=rot_z(ang), round=0.5, k=0.25, mat=SUSU)
    S.ell((SHAKU_NODE, 0.65, 0), (0.9, 0.85, 1.55), k=0.3, mat=SUSU)      # the node
    S.box((-17.6, 0, 0), (0.9, 2, 2.5), rot=rot_z(0.5), mat=SUSU, op=1)    # the butt, cut on a slant
    if variant == 'repaired':
        S.cap((SHAKU_NODE - 2.4, 0.7, 0), (SHAKU_NODE + 2.4, 0.7, 0), 1.05, mat=TWINE)
    if heap > 0.02:
        tx, ty = tip[1]
        S.ell((tx, ty + 0.7 * heap, 0), (1.9 * heap + 0.3, 1.1 * heap, 1.6 * heap + 0.2), k=0.3, mat=MATCHA)

    def paint(g, ctx):
        P, hit, mat = g['p'], g['hit'], g['mat']
        x = P[..., 0]
        px = ctx['px']
        bam = hit & (mat == SUSU)
        g['smoke'] = bam & (fbm(P * np.array((0.35, 1.0, 0.8)), 0.5) > 0.56)
        g['node'] = bam & (np.abs(x - SHAKU_NODE) < 0.5 * px + 0.25)
        g['scoop'] = bam & (x > 15.5) & (g['n'][..., 1] > 0.2)
        g['edge'] = bam & (np.abs(P[..., 2]) > 1.05)
        if variant == 'worn':
            g['rub'] = bam & ((x > 14.5) | (np.abs(P[..., 2]) > 1.0)) & (vnoise(P, 0.9) > 0.4)
        if variant == 'dirty':
            mat[bam & (x > 13.0 + 2 * vnoise(P, 0.7)) & (g['n'][..., 1] > -0.2)] = MATCHA
            mat[bam & (x < -6) & (fbm(P, 0.6) > 0.55)] = GRIME
        if variant == 'repaired':
            cs = SHAKU_NODE + 2.6 + 0.5 * np.sin(P[..., 2] * 2.2)
            mat[bam & (np.abs(x - cs) < 0.5 * px + 0.12)] = GOLD

    def nudge(g, idx, ctx):
        idx[g['smoke']] -= 1
        idx[g['node']] -= 2
        idx[g['scoop']] += 1
        if 'rub' in g:
            idx[g['rub']] += 1
        gold = g['hit'] & (g['mat'] == GOLD)
        idx[gold] = np.maximum(idx[gold], 2)
    return [Part(S, 30, at=at, rot=rot, paint=paint, nudge=nudge, name='chashaku')]


# ================================================================ tea caddy
# kabazaiku: a wooden canister skinned in glossy wild-cherry bark, a cherry
# blossom inlaid on the lid; the lid's cut edge shows the pale wood.
CA_R, CA_H, CA_LR = 6.3, 12.0, 6.65
CA_LID0, CA_LID1 = 9.6, 15.0


def caddy_body(variant='clean', at=(0, 0, 0), rot=None, leaves=True):
    S = Shapes()
    S.cap((0, 6, 0), (0, 8, 0), CA_R, CA_R, mat=BARK)
    cut_above(S, CA_H, k=0.3)
    cut_below(S, 0.0, k=0.45)
    S.cap((0, 1.6 + 5.4, 0), (0, 30, 0), 5.4, 5.4, mat=HEART, op=1)
    if leaves:
        S.ell((0, CA_H - 1.6, 0), (5.4, 1.6, 5.4), mat=LEAF)
        for k in range(9):
            a = k * 2.3
            rr = 1.0 + (k % 3) * 1.4
            S.ell((rr * math.cos(a), CA_H - 0.5, rr * math.sin(a)), (0.95, 0.55, 0.6), k=0.2, mat=LEAF)
    return S


def caddy_lid(variant='clean'):
    S = Shapes()
    S.cap((0, CA_LID0 + 3, 0), (0, CA_LID0 + 4, 0), CA_LR, CA_LR, mat=BARK if variant != 'repaired' else HEART)
    cut_above(S, CA_LID1, k=0.6)
    cut_below(S, CA_LID0, k=0.25)
    S.cap((0, CA_LID0 - 4 + 0.0, 0), (0, CA_LID1 - 0.8 - 5.9, 0), 5.9, 5.9, mat=HOLE, op=1)
    return S


def tea_caddy(variant='clean', at=(0, 0, 0), rot=None, face=0.0, lid_lift=0.0, lid_tilt=0.0, lid_spin=0.0):
    rs = np.random.RandomState(3)
    lent = [(rs.uniform(1.5, CA_H - 1.5), rs.uniform(-np.pi, np.pi), rs.uniform(0.2, 0.45)) for _ in range(18)]

    def paint(g, ctx, lid=False):
        P, hit, mat = g['p'], g['hit'], g['mat']
        th, r = cyl_coords(P)
        y = P[..., 1]
        px = ctx['px']
        bark = hit & (mat == BARK)
        # lenticels: short pale horizontal dashes in the bark
        lt = np.zeros(hit.shape, bool)
        for (ly, la, lw) in lent:
            for yy in ((ly,) if not lid else (CA_LID0 + 1.2 + (ly % 3.6),)):
                lt |= (np.abs(y - yy) < 0.5 * px) & (np.abs(adiff(th, la)) < lw)
        g['lent'] = bark & lt & (np.abs(g['n'][..., 1]) < 0.7)
        g['ring'] = np.zeros(hit.shape, bool)
        if lid:
            edge = hit & (y < CA_LID0 + 0.55 * px + 0.15) & (r > CA_LR - 0.9)
            mat[edge & np.isin(mat, [BARK])] = HEART                    # the cut edge: pale wood
            top = hit & (y > CA_LID1 - 0.6) & (r < CA_LR - 0.5)
            ang = th + face
            rose = 2.3 * np.abs(np.cos(2.5 * ang)) ** 0.6 + 0.35
            mat[top & (r < rose)] = HEART                               # a cherry blossom inlay
            g['ring'] = top & (r < 0.75)
        else:
            mat[hit & (mat == BARK) & (y > CA_H - 0.5) & (r > CA_R - 0.8)] = HEART
        if variant == 'worn':
            peel = bark & (fbm(P * 0.22, 1.0) > 0.58) & ((y < 3.0) | (y > CA_H - 3.5) | lid)
            mat[peel] = HEART
            g['peel'] = peel
        if variant == 'dirty':
            mat[bark & ((y < 2.2 + 1.2 * vnoise(P, 0.9)) | (fbm(P * 0.3, 1.0) > 0.7))] = GRIME
            if lid:
                mat[hit & (g['n'][..., 1] > 0.6) & (fbm(P * 0.45, 1.0) > 0.55)] = DUST
        if variant == 'repaired' and not lid:
            patch = hit & (np.abs(adiff(th, face + 0.4)) * r < 2.6) & (np.abs(y - 5.0) < 2.2)
            mat[patch] = HEART
            g['stitch'] = patch & ((np.abs(np.abs(adiff(th, face + 0.4)) * r - 2.1) < 0.5 * px) |
                                   (np.abs(np.abs(y - 5.0) - 1.75) < 0.5 * px)) & \
                (np.mod((th * r + y) * 1.2, 1) < 0.5)

    def nudge(g, idx, ctx):
        idx[g['lent']] += 1
        idx[g['ring']] -= 1
        if 'stitch' in g:
            idx[g['stitch']] = 0
        if 'peel' in g:
            idx[g['peel']] -= 1
    parts = [Part(caddy_body(variant), 24, at=at, rot=rot, paint=paint, nudge=nudge, name='caddy')]
    Rl = rot_y(lid_spin) @ rot_z(lid_tilt)
    piv = np.array((0, CA_LID0, 0.0))
    lat = np.asarray(at, float) + (np.eye(3) if rot is None else rot) @ (piv + np.array((0, lid_lift, 0)) - Rl @ piv)
    lrot = (np.eye(3) if rot is None else rot) @ Rl
    parts.append(Part(caddy_lid(variant), 24, at=lat, rot=lrot, paint=lambda g, c: paint(g, c, True), nudge=nudge,
                      name='caddylid'))
    return parts


# ================================================================ tea tin
# a travel tin of leaves: tinplate with a rolled bead round the lid, a washi
# label lettered in runes with a red seal, tied with a paper band on top.
TN_R, TN_H, TN_LR = 6.4, 14.0, 6.75
TN_LID0, TN_LID1 = 10.4, 15.6
TN_WORD = 'SENCHA'


def _label_bitmap(word, stamp=True):
    w = pixel.text_width(word) + (6 if stamp else 0) + 2
    cv = Canvas(w, 7)
    pixel.text(cv, 1, 1, word, (255, 255, 255))
    a = cv.a[..., 3] > 0
    st = np.zeros_like(a)
    if stamp:
        st[1:6, w - 6:w - 1] = True
        ins = Canvas(5, 5)
        pixel.text(ins, 1, 0, 'T', (255, 255, 255))
        st[1:6, w - 6:w - 1] &= ~(ins.a[..., 3] > 0)[0:5, 0:5]
    return a, st


def tin_body(variant='clean'):
    S = Shapes()
    S.cap((0, 6, 0), (0, 8, 0), TN_R, TN_R, mat=TIN)
    cut_above(S, TN_H, k=0.2)
    cut_below(S, 0.0, k=0.5)
    S.cap((0, 1.6 + 5.6, 0), (0, 30, 0), 5.6, 5.6, mat=HOLE, op=1)
    ring(S, (0, 0.55, 0), TN_R - 0.15, 0.55, TIN, n=22)
    if variant == 'worn':
        S.ell((TN_R * math.cos(1.2), 5.5, TN_R * math.sin(1.2)), (1.6, 1.9, 1.6), mat=TIN, op=1)
    if variant == 'repaired':
        S.ell((TN_R * math.cos(1.2), 5.5, TN_R * math.sin(1.2)), (1.8, 2.0, 1.8), k=0.4, mat=GOLD)
    return S


def tin_lid(variant='clean'):
    S = Shapes()
    lm = COPPERLID if variant == 'repaired' else TIN
    S.cap((0, TN_LID0 + 3, 0), (0, TN_LID0 + 4, 0), TN_LR, TN_LR, mat=lm)
    cut_above(S, TN_LID1, k=0.5)
    cut_below(S, TN_LID0, k=0.2)
    ring(S, (0, TN_LID0 + 0.5, 0), TN_LR, 0.55, lm, n=24)
    S.cap((0, TN_LID0 - 6.1, 0), (0, TN_LID1 - 0.8 - 6.1, 0), 6.1, mat=HOLE, op=1)
    return S


def tea_tin(variant='clean', at=(0, 0, 0), rot=None, face=0.0, lid_lift=0.0, lid_tilt=0.0, lid_spin=0.0, word=TN_WORD):
    txt, stp = _label_bitmap(word)
    TH, TW = txt.shape

    def paint(g, ctx, lid=False):
        P, hit, mat = g['p'], g['hit'], g['mat']
        th, r = cyl_coords(P)
        y = P[..., 1]
        px = ctx['px']
        metal = hit & np.isin(mat, [TIN, COPPERLID])
        if not lid:
            lab = metal & (y > 2.6) & (y < 9.6) & (np.abs(adiff(th, face)) < 2.45) & (r > TN_R - 0.6)
            if variant == 'worn':
                lab &= ~((adiff(th, face) > 1.6) & (y < 5.5 + 2 * vnoise(P, 0.8)))   # a torn corner
            mat[lab] = WASHI
            sc = ctx['scale']
            u = adiff(th, face) * TN_R * sc + TW / 2.0
            v = (9.4 - y) * sc - max(0.0, (7.0 * sc - TH) / 2)
            ui, vi = np.floor(u).astype(int), np.floor(v).astype(int)
            ok = lab & (ui >= 0) & (ui < TW) & (vi >= 0) & (vi < TH)
            ink = np.zeros(hit.shape, bool)
            seal = np.zeros(hit.shape, bool)
            ink[ok] = txt[vi[ok], ui[ok]]
            seal[ok] = stp[vi[ok], ui[ok]]
            if variant == 'repaired':                           # the label redone by hand on a fresh scrap
                mat[lab & (np.abs(adiff(th, face + 0.15)) < 1.25) & (y > 3.2) & (y < 8.9)] = LINEN
            mat[ink & (mat != LINEN)] = RUNE
            mat[seal & (mat != LINEN)] = STAMP
            if variant == 'repaired':
                hand = lab & (mat == LINEN)
                uu = adiff(th, face + 0.15) * TN_R
                mat[hand & (np.abs(y - 6.0 - 0.35 * np.sin(uu * 1.7)) < 0.5 * px) & (np.abs(uu) < 5.0)] = RUNE
            g['labedge'] = lab & ((np.abs(y - 2.6) < 0.5 * px + 0.1) | (np.abs(y - 9.6) < 0.5 * px + 0.1))
            if variant == 'dirty':
                mat[lab & (np.abs(np.hypot(adiff(th, face - 0.6) * TN_R, y - 5.2) - 2.2) < 0.55)] = STAIN
                mat[metal & (y < 2.6) & (vnoise(P, 0.8) > 0.35)] = RUST
                mat[metal & (mat == TIN) & (fbm(P * 0.4, 1.0) > 0.64)] = RUST
        else:
            if variant == 'dirty':
                mat[metal & (g['n'][..., 1] > 0.5) & (fbm(P * 0.45, 1.0) > 0.55)] = DUST
                mat[metal & (mat == TIN) & (fbm(P * 0.4, 1.0) > 0.66)] = RUST
        if variant == 'worn':
            g['scratch'] = metal & (np.abs(np.mod(P[..., 1] * 1.3 + th * 2.1, 3.0) - 1.5) < 0.12) & (vnoise(P, 0.7) > 0.55)
        if variant == 'repaired' and not lid:
            g['twine'] = hit & (np.abs(y - 11.0) < 0.6)

    def nudge(g, idx, ctx):
        if 'labedge' in g:
            idx[g['labedge']] -= 1
        if 'scratch' in g:
            idx[g['scratch']] += 1
    parts = [Part(tin_body(variant), 24, at=at, rot=rot, paint=paint, nudge=nudge, name='tin')]
    Rl = rot_y(lid_spin) @ rot_z(lid_tilt)
    piv = np.array((0, TN_LID0, 0.0))
    lat = np.asarray(at, float) + (np.eye(3) if rot is None else rot) @ (piv + np.array((0, lid_lift, 0)) - Rl @ piv)
    lrot = (np.eye(3) if rot is None else rot) @ Rl
    parts.append(Part(tin_lid(variant), 24, at=lat, rot=lrot, paint=lambda g, c: paint(g, c, True), nudge=nudge,
                      name='tinlid'))
    return parts


# ================================================================ the chabako and its furoshiki
# a travelling tea box: a shallow tray with a deep covering lid, black urushi
# outside (over a red undercoat that shows where it is rubbed), red inside, a
# gold maki-e pine and full moon on the lid, tied with a purple silk cord in
# a bow. It sits on an indigo furoshiki printed with asanoha. Kit units = icon
# units; the kit is drawn at KIT_SCALE.
KIT_SCALE = 0.8
BX_W, BX_D, BX_TH = 46.0, 29.0, 11.0          # tray half width, half depth, height
BX_FLOOR = 2.6
LD_W, LD_D, LD_H = 47.9, 30.9, 15.0           # lid half extents
LD_REST = 5.0 + LD_H                          # the lid's centre height when it is on
CL_HALF = 50.0                                # the furoshiki's half side


def asanoha(u, v, cell, width):
    """Distance-mask of the hemp-leaf pattern: a triangle lattice whose
    triangles are each split into three by lines from corners to centre."""
    s3 = math.sqrt(3)
    a = u / cell - v / (cell * s3)
    b = 2 * v / (cell * s3)
    i, j = np.floor(a), np.floor(b)
    fa, fb = a - i, b - j
    up = (fa + fb) > 1

    def cart(ai, bj):
        return (ai + bj * 0.5) * cell, bj * s3 / 2 * cell
    p0 = cart(i + up, j + up)
    p1 = cart(i + 1, j)
    p2 = cart(i, j + 1)
    cx = (p0[0] + p1[0] + p2[0]) / 3
    cy = (p0[1] + p1[1] + p2[1]) / 3

    def seg(ax, ay, bx, by):
        dx, dy = bx - ax, by - ay
        t = np.clip(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1)
        return np.hypot(u - ax - dx * t, v - ay - dy * t)
    d = np.minimum.reduce([seg(*p0, *p1), seg(*p1, *p2), seg(*p2, *p0),
                           seg(*p0, cx, cy), seg(*p1, cx, cy), seg(*p2, cx, cy)])
    return d < width


def seigaiha(u, v, R_, width):
    """Blue-sea waves: rows of overlapping fans of concentric arcs, each row
    half a fan over from the last, each fan hiding the one behind it."""
    best = np.full(u.shape, 1e9)
    hitr = np.full(u.shape, -1.0)
    row_h = R_ * 0.5
    j0 = np.floor(v / row_h)
    for dj in (0, 1, 2):
        j = j0 + dj
        cy = j * row_h
        off = np.where(np.mod(j, 2) == 1, R_, 0.0)
        i = np.round((u - off) / (2 * R_))
        cx = i * 2 * R_ + off
        r = np.hypot(u - cx, v - cy)
        inside = (r < R_) & (v <= cy) & (hitr < 0)
        hitr = np.where(inside, r, hitr)
    rings = np.zeros(u.shape, bool)
    for k in (0.45, 0.97):
        rings |= (hitr >= 0) & (np.abs(hitr - k * R_) < width)
    return rings | ((hitr >= 0) & (hitr < 0.16 * R_))


def dots(u, v, step, r):
    """Mame-shibori: white dots on a staggered grid."""
    j = np.round(v / step)
    off = np.where(np.mod(j, 2) == 1, step / 2, 0.0)
    i = np.round((u - off) / step)
    return np.hypot(u - (i * step + off), v - j * step) < r


def furoshiki(variant='clean', yaw_cloth=0.7854):
    S = Shapes()
    Rc = rot_y(yaw_cloth)
    S.box((0, -0.7, 0), (CL_HALF, 0.7, CL_HALF), rot=Rc, round=0.6, mat=INDIGO)
    # a few soft folds where it was unwrapped
    for (x0, z0, x1, z1, r) in ((-30, 30, 8, 44, 1.2), (24, -38, 44, -12, 1.1), (-44, -6, -30, -30, 1.0),
                                (30, 30, 46, 12, 0.9)):
        a = Rc @ np.array((x0, 0, z0))
        b = Rc @ np.array((x1, 0, z1))
        S.cap(tuple(a + (0, -0.6, 0)), tuple(b + (0, -0.6, 0)), r, k=1.6, mat=INDIGO)
    cut_below(S, -1.4)

    def paint(g, ctx):
        P, hit, mat = g['p'], g['hit'], g['mat']
        Q = P @ Rc                                   # into the cloth's own square
        u, v = Q[..., 0], Q[..., 2]
        px = ctx['px']
        top = hit & (P[..., 1] > -0.9)
        edge = np.maximum(np.abs(u), np.abs(v))
        hem = top & (edge > CL_HALF - 3.2)
        pat = top & ~hem & dots(u, v, 7.0, 1.55)
        mat[pat] = COTTON
        g['hem'] = hem & (np.abs(edge - (CL_HALF - 3.2)) < 0.5 * px + 0.1)
        g['stitch'] = top & (np.abs(edge - (CL_HALF - 1.9)) < 0.5 * px) & (np.mod((u + v) * 0.55, 1) < 0.5)
        g['shadow'] = np.zeros(hit.shape, bool)
        if 'shadow_fn' in ctx:
            g['shadow'] = top & ctx['shadow_fn'](P)
        if variant == 'dirty':
            st = top & (fbm(P * 0.12, 1.0) > 0.6)
            mat[st & (mat == INDIGO)] = GRIME
            for (sx, sz, rr) in ((-36, 18, 5.0), (30, 34, 3.5)):
                d = np.hypot(P[..., 0] - sx, P[..., 2] - sz) / rr
                mat[top & (np.abs(d - 1) < 0.18 + 0.1 * vnoise(P, 1.0))] = STAIN
        if variant == 'repaired':
            pu, pv = u - 22.0, v + 30.0
            patch = top & (np.abs(pu) < 11) & (np.abs(pv) < 8)
            mat[patch] = INDIGO
            g['patch'] = patch
            g['sashiko'] = patch & (((np.abs(np.mod(pv, 2.6) - 1.3) < 0.5 * px) & (np.mod(pu * 0.6, 1) < 0.55)) |
                                    (np.abs(np.abs(pu) - 10.3) < 0.5 * px) | (np.abs(np.abs(pv) - 7.3) < 0.5 * px))
            mat[g['sashiko']] = SASHIKO
        if variant == 'worn':
            g['fade'] = top & (fbm(P * 0.08, 1.0) > 0.55)

    def nudge(g, idx, ctx):
        idx[g['hem']] -= 1
        idx[g['stitch']] += 1
        idx[g['shadow']] -= 2
        if 'patch' in g:
            idx[g['patch'] & (g['mat'] == INDIGO)] += 1
        if 'fade' in g:
            idx[g['fade']] += 1
    return Part(S, 90, paint=paint, nudge=nudge, name='cloth')


def tray(variant='clean'):
    S = Shapes()
    S.box((0, BX_TH / 2, 0), (BX_W, BX_TH / 2, BX_D), round=1.1, mat=LACQ)
    S.box((0, BX_FLOOR + 20, 0), (BX_W - 2.0, 20, BX_D - 2.0), round=0.6, mat=LACQ, op=1)
    return S


def lid_shapes(variant='clean'):
    S = Shapes()
    S.box((0, 0, 0), (LD_W, LD_H, LD_D), round=1.4, mat=LACQ)
    S.box((0, -3.2, 0), (LD_W - 2.0, LD_H, LD_D - 2.0), round=0.6, mat=SHU, op=1)
    return S


def _pine_mask(x, z, px):
    """Gold maki-e on the lid's top: a pine bough sweeping in from the left
    with fans of needles, a full moon, and a scatter of gold dust."""
    def segd(ax, az, bx, bz):
        dx, dz = bx - ax, bz - az
        t = np.clip(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1)
        return np.hypot(x - ax - dx * t, z - az - dz * t)
    br = [(-52, 14), (-42, 9), (-31, 11), (-21, 6), (-12, 8), (-4, 3)]
    d = np.full(x.shape, 1e9)
    wid = np.full(x.shape, 1e9)
    for j, ((a, b), (c, e)) in enumerate(zip(br[:-1], br[1:])):
        dj = segd(a, b, c, e)
        d = np.minimum(d, dj - (1.3 - 0.18 * j))
    twig = [((-31, 11), (-27, 22)), ((-21, 6), (-17, -6)), ((-42, 9), (-40, -2)), ((-12, 8), (-9, 18))]
    for (a, b) in twig:
        d = np.minimum(d, segd(a[0], a[1], b[0], b[1]) - 0.5)
    branch = d < 0.5 * px
    fans = np.zeros(x.shape, bool)
    for (fx, fz, R_, ph) in ((-27, 22, 4.6, 0.2), (-17, -6, 4.2, 0.9), (-4, 3, 4.8, 0.4), (-40, -2, 3.6, 1.3),
                             (-9, 18, 3.9, 0.0), (-46, 13, 3.0, 0.6), (-21, 14, 2.6, 1.1)):
        rr = np.hypot(x - fx, z - fz)
        an = np.arctan2(z - fz, x - fx) + ph
        petal = R_ * (0.62 + 0.38 * np.abs(np.cos(2.5 * an)) ** 0.5)       # five round petals
        fans |= (rr < petal) & ~((rr < R_ * 0.34) & (rr > R_ * 0.2))       # a ring of stamens left dark
    for (bx_, bz_) in ((-33, 17), (-12, 0), (-24, 1), (-1, 12), (-36, 6)):  # buds
        fans |= np.hypot(x - bx_, z - bz_) < 1.3
    moon_r = np.hypot(x - 28, z + 13)
    moon = moon_r < 10.5
    dust = (vnoise(np.stack([x, np.zeros_like(x), z], -1) * 0.9, 1.0) > 0.86) & (z < 25) & (x < 45)
    return branch | fans, moon, dust


def kit_box_parts(variant, lid_T=None, lid_R=None, closed=True):
    """The tray, and the lid placed by (rotation, translation) in kit space."""
    worn, dirty, rep = variant == 'worn', variant == 'dirty', variant == 'repaired'

    def edge_dist(Q, half):
        """How far a point is from the nearest edge of a box with these half extents."""
        dd = np.abs(Q) - np.asarray(half)
        s = np.sort(np.abs(dd), -1)
        return s[..., 1]

    def tpaint(g, ctx):
        P, hit, mat = g['p'], g['hit'], g['mat']
        lac = hit & (mat == LACQ)
        if worn:
            ed = edge_dist(P - (0, BX_TH / 2, 0), (BX_W, BX_TH / 2, BX_D))
            patchy = np.clip((fbm(P * 0.12, 1.0) - 0.45) / 0.25, 0, 1)
            mat[lac & (ed < 0.15 + 3.0 * patchy)] = SHU
        if dirty:
            mat[lac & (P[..., 1] < 3.0 + 2 * vnoise(P * 0.3, 1.0))] = GRIME
            mat[hit & (mat == SHU) & (fbm(P * 0.3, 1.0) > 0.6)] = GRIME
        g['bevel'] = lac & (edge_dist(P - (0, BX_TH / 2, 0), (BX_W, BX_TH / 2, BX_D)) < 0.9)
        g['glossmask'] = g['bevel'] | (hit & (P[..., 1] < BX_FLOOR + 0.5))
        mat[hit & (P[..., 1] > BX_TH - 0.7) & np.isin(mat, [LACQ])] = SHU       # a vermilion rim

    def tnudge(g, idx, ctx):
        idx[g['bevel'] & (g['n'][..., 1] > 0.3)] += 1

    def lpaint(g, ctx):
        P, hit, mat = g['p'], g['hit'], g['mat']
        px = ctx['px']
        lac = hit & (mat == LACQ)
        top = lac & (P[..., 1] > LD_H - 0.6)
        x, z = P[..., 0], P[..., 2]
        gold, moon, dust = _pine_mask(-x, z, px)          # the plum comes in from the right, the moon on the left
        gm = PALEGOLD if worn else MAKIE
        sel = top & gold
        if worn:
            sel &= vnoise(P * 0.8, 1.0) > 0.32
        mat[sel] = gm
        mat[top & moon & ~gold] = SILVER if not worn else PALEGOLD
        g['dust'] = top & dust & ~gold & ~moon
        g['moonedge'] = top & (np.abs(np.hypot(-x - 28, z + 13) - 10.0) < 0.5 * px + 0.2)
        g['moonmark'] = top & moon & (np.hypot(-x - 31, z + 16) < 3.2)
        if worn:
            ed = edge_dist(P, (LD_W, LD_H, LD_D))
            patchy = np.clip((fbm(P * 0.12, 1.0) - 0.45) / 0.25, 0, 1)
            mat[lac & (ed < 0.15 + 3.4 * patchy)] = SHU
            mat[top & (np.hypot(x - 20, z - 4) < 7 + 4 * vnoise(P * 0.3, 1.0)) & (mat == LACQ)] = SHU
        if dirty:
            mat[top & (fbm(P * 0.09, 1.0) > 0.6)] = DUST
            for (sx, sz) in ((-24, -14), (14, 18)):
                d = np.hypot(x - sx, z - sz)
                mat[top & (np.abs(d - 7.0) < 0.6 + 0.4 * vnoise(P, 1.0))] = STAIN
            mat[lac & (P[..., 1] < -LD_H + 3.5 + 2 * vnoise(P * 0.3, 1.0))] = GRIME
        if rep:
            cs = 10 + 6 * np.sin(z * 0.15) + 2.5 * np.sin(z * 0.6)
            crack = lac & (np.abs(x - cs) < 0.5 * px + 0.12) & ((P[..., 1] > LD_H - 0.6) | (z > LD_D - 0.6)) & (z > -8)
            mat[crack] = GOLD
        g['bevel'] = lac & (edge_dist(P, (LD_W, LD_H, LD_D)) < 1.0)
        g['glossmask'] = g['bevel'] | (hit & (P[..., 1] > LD_H - 0.3) & (edge_dist(P, (LD_W, LD_H, LD_D)) > 1.0) &
                                       (np.abs(g['n'][..., 2]) < 0.75))

    def lnudge(g, idx, ctx):
        idx[g['dust']] += 2
        g['mat'][g['moonedge'] & (g['mat'] == SILVER)] = MAKIE
        idx[g['moonmark'] & (g['mat'] == SILVER)] -= 1
        idx[g['bevel'] & (g['n'][..., 1] > 0.3) & np.isin(g['mat'], [LACQ])] += 1
        gold = g['hit'] & np.isin(g['mat'], [GOLD])
        idx[gold] = np.maximum(idx[gold], 2)
    parts = [Part(tray(variant), 64, paint=tpaint, nudge=tnudge, name='tray')]
    if lid_T is None:
        lid_T, lid_R = np.array((0, LD_REST, 0.0)), np.eye(3)
    parts.append(Part(lid_shapes(variant), 64, at=lid_T, rot=lid_R, paint=lpaint, nudge=lnudge, name='lid'))
    return parts


# ---------------------------------------------------------------- the cord
def cord_paths(lid_T, lid_R):
    """The two loops of cord round the lid (kit space), as point lists."""
    pts_x, pts_z = [], []
    o = 0.8
    for t in np.linspace(0, 1, 26):                      # over the top and down both sides, along x
        if t < 0.25:
            u = t / 0.25
            p = (-LD_W - o, -LD_H + 2 + (2 * LD_H - 2) * u, 0.0)
        elif t < 0.75:
            u = (t - 0.25) / 0.5
            p = (-LD_W - o + (2 * LD_W + 2 * o) * u, LD_H + o, 0.0)
        else:
            u = (t - 0.75) / 0.25
            p = (LD_W + o, LD_H - (2 * LD_H - 2) * u, 0.0)
        pts_x.append(p)
    for t in np.linspace(0, 1, 22):
        if t < 0.25:
            u = t / 0.25
            p = (0.0, -LD_H + 2 + (2 * LD_H - 2) * u, LD_D + o)
        elif t < 0.75:
            u = (t - 0.25) / 0.5
            p = (0.0, LD_H + o, LD_D + o - (2 * LD_D + 2 * o) * u)
        else:
            u = (t - 0.75) / 0.25
            p = (0.0, LD_H - (2 * LD_H - 2) * u, -LD_D - o)
        pts_z.append(p)
    tf = lambda ps: [tuple(lid_R @ np.array(p) + lid_T) for p in ps]
    return tf(pts_x), tf(pts_z)


def cord_fallen():
    """Where the cord ends up: a loose loop lying on the cloth in front."""
    a = []
    for t in np.linspace(0, 1, 26):
        x = -62 + 70 * t
        z = 40 + 6 * math.sin(t * 5.0) + 4 * t
        a.append((x, 0.75, z))
    b = []
    for t in np.linspace(0, 1, 22):
        x = 8 + 34 * t + 4 * math.sin(t * 6)
        z = 44 - 8 * t + 3 * math.sin(t * 9)
        b.append((x, 0.75, z))
    return a, b


def cord_part(variant, blend=0.0, bow=1.0, lid_T=None, lid_R=None, sway=0.0):
    """The cord: wrapped and tied (blend 0) to fallen loose on the cloth (1),
    peeling off from the bow outward so it slides rather than teleports."""
    cm = TWINE if variant == 'repaired' else CORD
    if lid_T is None:
        lid_T, lid_R = np.array((0, LD_REST, 0.0)), np.eye(3)
    S = Shapes()
    wx, wz = cord_paths(lid_T, lid_R)
    fx, fz = cord_fallen()
    knot = lid_R @ np.array((0, LD_H + 1.6, 0)) + lid_T
    for w, f in ((wx, fx), (wz, fz)):
        n = len(w)
        pts = []
        for i in range(n):
            c = abs(i - (n - 1) / 2) / ((n - 1) / 2)          # 0 at the bow .. 1 at the ends
            tt = clamp01((blend - 0.25 * (1 - c)) / 0.75)
            e = ease_io(tt)
            p0, p1 = np.array(w[i]), np.array(f[i])
            p = p0 + (p1 - p0) * e
            p = p + np.array((0, 9.0, 6.0)) * math.sin(math.pi * e) * (0.4 + 0.6 * (1 - c))
            pts.append(p)
        for p0, p1 in zip(pts[:-1], pts[1:]):
            S.cap(tuple(p0), tuple(p1), 0.95, mat=cm)
    if bow > 0.02 and blend < 0.3:
        R0 = lid_R
        S.ell(tuple(knot), (2.6 * bow + 0.6, 1.9, 2.3), rot=R0, mat=cm)
        for s in (-1, 1):                                  # two loops, flopping a little
            c = R0 @ np.array((s * 7.2 * bow, 0.9, -1.2)) + knot
            nloop = 14
            loop = []
            for i in range(nloop + 1):
                a = 2 * math.pi * i / nloop
                q = np.array((s * (6.2 * bow) * math.cos(a), 2.6 * bow * math.sin(a) + 0.8 * bow,
                              2.4 * math.sin(a) - 1.0 * math.cos(a) * s + sway * s))
                loop.append(R0 @ q + c)
            for p0, p1 in zip(loop[:-1], loop[1:]):
                S.cap(tuple(p0), tuple(p1), 0.85, mat=cm)
        for s, (dx, dz) in ((-1, (-3.5, 9.0)), (1, (4.0, 10.5))):   # the tails, lying over the front edge
            a = knot
            b = R0 @ np.array((dx * bow + sway, 0.0, dz * bow)) + knot
            c = R0 @ np.array((dx * 1.3 * bow + sway * 1.5, -3.0 * bow, LD_D + 1.0 - (1 - bow) * 10)) + lid_T + \
                np.array((0, LD_H, 0)) * 0
            c = np.array((c[0], lid_T[1] + LD_H - 3.0 * bow, c[2])) if bow > 0.6 else c
            S.cap(tuple(a), tuple(b), 0.9, mat=cm)
            S.cap(tuple(b), tuple(c), 0.85, 0.9, mat=cm)
            S.ell(tuple(c), (1.2, 1.2, 1.2), mat=cm)

    def paint(g, ctx):
        P = g['p']
        g['twist'] = g['hit'] & (np.mod((P[..., 0] + P[..., 1] + P[..., 2]) * 0.9, 1) < 0.35)

    def nudge(g, idx, ctx):
        idx[g['twist']] -= 1
    return Part(S, 90, paint=paint, nudge=nudge, name='cord')


# ---------------------------------------------------------------- the folded tea cloth (chakin)
def chakin(variant='clean', at=(0, 0, 0)):
    S = Shapes()
    S.box((0, 1.6, 0), (7.5, 1.4, 4.6), round=1.0, mat=LINEN)
    S.box((-0.5, 3.3, 0.3), (6.6, 0.8, 3.9), rot=rot_y(0.05), round=0.7, k=0.4, mat=LINEN)

    def paint(g, ctx):
        P, hit = g['p'], g['hit']
        g['fold'] = hit & (np.abs(P[..., 2] - 0.3) < 0.45 * ctx['px']) & (P[..., 1] > 3.6)
        g['hemline'] = hit & (np.abs(P[..., 0] + 6.0) < 0.45 * ctx['px'])
        if variant == 'dirty':
            g['mat'][hit & (vnoise(P * 0.5, 1.0) > 0.6)] = STAIN

    def nudge(g, idx, ctx):
        idx[g['fold']] -= 1
        idx[g['hemline']] -= 1
    return Part(S, 16, at=at, paint=paint, nudge=nudge, name='chakin')


# ---------------------------------------------------------------- the kit, put together
KIT_LAYOUT = dict(
    caddy=(-30.0, -17.0, 0.0),
    chasen=(-12.0, -18.0, 0.0),
    kyusu=(6.0, -9.0, 0.0),
    cupB=(33.5, -10.0, 0.0),           # the one the tea is poured into (celadon)
    cupA=(-35.0, 12.0, 0.0),           # nuka over iron, the folded chakin resting in its mouth
    shaku=(29.0, 20.5, 0.42),          # laid across the front corner of the tray
)


def _ray_box(P, L, lo, hi):
    """Does a ray from each point P along L hit the axis-aligned box lo..hi?"""
    with np.errstate(divide='ignore', invalid='ignore'):
        inv = 1.0 / np.where(np.abs(L) < 1e-9, 1e-9, L)
        t0 = (np.asarray(lo) - P) * inv
        t1 = (np.asarray(hi) - P) * inv
    tmin = np.max(np.minimum(t0, t1), -1)
    tmax = np.min(np.maximum(t0, t1), -1)
    return (tmax > np.maximum(tmin, 0.05))


KY_PIVOT = np.array((6.5, 0.0, 0.0))


def kyusu_pose(base, lift=0.0, tilt=0.0, spin=0.0):
    """Placement of a kyusu that lifts and tips forward over its spout-side foot."""
    R = rot_y(spin) @ rot_z(-tilt)
    at = np.asarray(base, float) + np.array((0, lift, 0)) + KY_PIVOT - R @ KY_PIVOT
    return at, R


def kit_parts(variant='clean', lid_T=None, lid_R=None, cord=0.0, bow=1.0, ky_lift=0.0, ky_tilt=0.0, fill=0.0,
              ripple=0.0, items=True, sway=0.0, yaw=0.0, jig=None):
    """Every part of the kit in kit space."""
    jig = jig or {}
    if lid_T is None:
        lid_T, lid_R = np.array((0, LD_REST, 0.0)), np.eye(3)
    fl = BX_FLOOR
    V = view(yaw)
    Lw = V.T @ KEY

    def shadow_fn(P):
        sh = _ray_box(P, Lw, (-BX_W, 0, -BX_D), (BX_W, BX_TH, BX_D))
        Q = (P - lid_T) @ lid_R                         # into the lid's frame
        Ll = lid_R.T @ Lw
        sh |= _ray_box(Q, Ll, (-LD_W, -LD_H, -LD_D), (LD_W, LD_H, LD_D))
        return sh
    cloth = furoshiki(variant)
    base_paint = cloth.paint

    def cpaint(g, ctx):
        ctx = dict(ctx)
        ctx['shadow_fn'] = shadow_fn
        base_paint(g, ctx)
    cloth.paint = cpaint
    parts = [cloth]
    parts += kit_box_parts(variant, lid_T, lid_R)
    if cord < 0.999 or True:
        parts.append(cord_part(variant, cord, bow, lid_T, lid_R, sway))
    if items:
        L = KIT_LAYOUT
        f0 = facing(yaw)
        cv = {'clean': 'clean', 'worn': 'worn', 'dirty': 'dirty', 'repaired': 'repaired'}[variant]

        def J(name, p):
            return np.asarray(p, float) + np.array((0, jig.get(name, 0.0), 0))
        x, z, _ = L['caddy']
        parts += tea_caddy(cv, at=J('caddy', (x, fl, z)), face=f0)
        x, z, _ = L['chasen']
        parts += chasen(cv, at=J('chasen', (x, fl, z)), face=f0)
        x, z, _ = L['kyusu']
        at, R = kyusu_pose((x, fl + jig.get('kyusu', 0.0), z), ky_lift, ky_tilt)
        parts += kyusu(cv, at=at, rot=R, face=f0)
        x, z, _ = L['cupB']
        parts += yunomi(cv, 'seiji', fill=fill, at=J('cupB', (x, fl, z)), face=f0 + 0.3, tag='kit', ripple=ripple)
        x, z, _ = L['cupA']
        parts += yunomi(cv, 'nuka', fill=0.0, at=J('cupA', (x, fl, z)), face=f0, tag='kit')
        x, z, _ = L['cupA']
        parts.append(chakin(cv, at=J('cupA', (x, fl + YU_RIM - 2.2, z))))
        x, z, a = L['shaku']
        parts += chashaku(cv, at=J('shaku', (x, BX_TH + 0.7, z)), rot=rot_y(a), face=f0)
    return parts


KIT_YAW = 0.32


def lid_open_pose(t):
    """The lid from on (t=0) to standing on its long edge behind the tray (t=1)."""
    ang = math.radians(82) * t
    R = rot_x(ang)
    # its front-bottom edge pivots; in the end the lid stands with its top facing us, behind the tray
    end_T = np.array((0.0, LD_D * math.sin(math.radians(82)) * 0 + 0.0, 0.0))
    return R


# ================================================================ 2D effects drawn over the frames
STEAM = [(236, 236, 234), (204, 204, 210), (168, 168, 180)]
LEAFP = [(22, 44, 34), (38, 66, 40), (62, 94, 46)]
TEA2D = [(132, 142, 44), (176, 176, 66), (214, 208, 112), (238, 234, 168)]


def _put(out, x, y, c, a=255):
    h, w = out.shape[:2]
    x, y = int(round(x)), int(round(y))
    if not (0 <= x < w and 0 <= y < h):
        return
    if a >= 255 or out[y, x, 3] == 0:
        out[y, x, :3] = c
        out[y, x, 3] = max(int(out[y, x, 3]), a)
    else:
        f = a / 255.0
        out[y, x, :3] = (np.array(c) * f + out[y, x, :3] * (1 - f)).astype(np.uint8)


def steam(out, x0, y0, t, n=3, height=16, seed=0, strength=1.0, spread=2.0):
    """Wisps rising from (x0, y0), curling as they go; t in 0..1 loops."""
    rs = np.random.RandomState(seed)
    for k in range(n):
        ph = (t + k / n) % 1.0
        amp = rs.uniform(1.0, 2.2)
        freq = rs.uniform(0.32, 0.5)
        off = (k - (n - 1) / 2) * spread * 0.8 + rs.uniform(-0.6, 0.6)
        L = int(height * rs.uniform(0.55, 0.85))
        head = ph * (height + L)                       # the wisp's top rises; it is L long
        for s in range(L):
            yy = head - s
            if yy < 0 or yy > height:
                continue
            life = yy / height
            x = x0 + off + amp * math.sin(yy * freq + k * 2.1 + t * 2 * math.pi) * (0.3 + life)
            if life < 0.12:
                continue
            if (s + k) % 5 == 4 and life > 0.5:
                continue                               # broken into puffs as it thins
            if life < 0.45:
                c, a = STEAM[0], 190
            elif life < 0.75:
                c, a = STEAM[1], 150
            else:
                c, a = STEAM[2], 100
            _put(out, x, y0 - yy, c, int(a * strength))


def sparkle(out, x, y, size):
    """A glint: a dot, a small cross, a long cross."""
    if size <= 0:
        return
    W = (255, 252, 236)
    _put(out, x, y, W)
    if size >= 2:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            _put(out, x + dx, y + dy, (236, 228, 196))
    if size >= 3:
        for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)):
            _put(out, x + dx, y + dy, (200, 190, 160), 200)


def stream3d(out, info, tip, vel, t_len, target_y, scale, origin, head=1.0, tail=0.0, wob=0.0):
    """A thin stream of tea from `tip` (kit space) along a parabola, stopping
    at height target_y; drawn 2px wide with the depth test so a cup's near rim
    hides its foot. head/tail 0..1 trim it (it starts and it breaks off)."""
    V = info['V']
    g = np.array((0, -60.0, 0))
    pts = []
    for i in range(80):
        s = i / 79 * t_len
        p = tip + vel * s + 0.5 * g * s * s
        if p[1] < target_y:
            break
        pts.append(p)
    if len(pts) < 2:
        return None
    pts = np.array(pts)
    n = len(pts)
    a, b = int(tail * (n - 1)), int(math.ceil(head * (n - 1)))
    if b <= a:
        return None
    pts = pts[a:b + 1]
    Z = info['z']
    h, w = Z.shape
    v = pts @ V.T
    sx = origin[0] + v[:, 0] * scale
    sy = origin[1] - v[:, 1] * scale
    for i in range(len(pts) - 1):
        L = int(max(abs(sx[i + 1] - sx[i]), abs(sy[i + 1] - sy[i]))) + 1
        for k in range(L + 1):
            u = k / L
            x = sx[i] + (sx[i + 1] - sx[i]) * u + wob * math.sin((sy[i] + k) * 0.9)
            y = sy[i] + (sy[i + 1] - sy[i]) * u
            z = v[i, 2] + (v[i + 1, 2] - v[i, 2]) * u
            xi, yi = int(math.floor(x)), int(math.floor(y))
            for dx, c in ((0, TEA2D[2]), (1, TEA2D[1])):
                xx = xi + dx
                if 0 <= xx < w and 0 <= yi < h:
                    if out[yi, xx, 3] and info['mat'][yi, xx] and z < Z[yi, xx] - 1.2:
                        continue
                    out[yi, xx, :3] = c
                    out[yi, xx, 3] = 255
    end = pts[-1] @ V.T
    return origin[0] + end[0] * scale, origin[1] - end[1] * scale


def leaves2d(out, x0, y0, t, n=7, seed=1, power=1.0):
    """A puff of rolled tea leaves thrown up out of an opening, falling back."""
    rs = np.random.RandomState(seed)
    for k in range(n):
        vx = rs.uniform(-1.0, 1.0) * 9 * power
        vy = rs.uniform(14, 24) * power
        delay = rs.uniform(0, 0.15)
        tt = max(0.0, t - delay) * 1.4
        if tt <= 0:
            continue
        x = x0 + vx * tt + rs.uniform(-1.5, 1.5)
        y = y0 - (vy * tt - 0.5 * 48 * tt * tt)
        if y > y0 + 1 and tt > 0.3:
            continue
        c = LEAFP[k % 3]
        _put(out, x, y, LEAFP[0])
        _put(out, x + (1 if k % 2 else -1), y, c)
        if k % 3 == 0:
            _put(out, x, y - 1, LEAFP[2])


# ================================================================ keyframes
def keys(f, table):
    """Smooth (Catmull-Rom) interpolation through keyframes {frame: value or tuple}."""
    ks = sorted(table)
    if f <= ks[0]:
        return np.asarray(table[ks[0]], float)
    if f >= ks[-1]:
        return np.asarray(table[ks[-1]], float)
    i = max(j for j in range(len(ks)) if ks[j] <= f)
    f0, f1 = ks[i], ks[i + 1]
    p1, p2 = np.asarray(table[f0], float), np.asarray(table[f1], float)
    p0 = np.asarray(table[ks[i - 1]], float) if i > 0 else p1
    p3 = np.asarray(table[ks[i + 2]], float) if i + 2 < len(ks) else p2
    t = (f - f0) / float(f1 - f0)
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


# ================================================================ the props' frames
ICON = dict(
    kyusu=dict(scale=0.95, size=(72, 64), origin=(36, 40), yaw=KY_YAW),
    yunomi=dict(scale=1.25, size=(56, 72), origin=(28, 58), yaw=0.35),
    chasen=dict(scale=1.35, size=(56, 64), origin=(28, 54), yaw=0.4),
    chashaku=dict(scale=1.32, size=(80, 72), origin=(40, 40), yaw=0.55),
    tea_caddy=dict(scale=2.0, size=(64, 72), origin=(32, 52), yaw=0.4),
    tea_tin=dict(scale=2.0, size=(64, 72), origin=(32, 52), yaw=0.4),
    tea_kit=dict(scale=KIT_SCALE, size=(168, 160), origin=(84, 100), yaw=KIT_YAW),
)
LID_END_ANG = math.radians(82)
LID_END_T = np.array((0.0, LD_D * math.sin(LID_END_ANG) + 0.5, -BX_D - LD_H - 3.0))
SHAKU_TILT = 0.5


def _lid(y, z, ang):
    return np.array((0.0, y, z)), rot_x(math.radians(ang))


def kit_frame(variant, anim, f, n):
    I = ICON['tea_kit']
    sc, (w, h), o, yaw = I['scale'], I['size'], I['origin'], I['yaw']
    kw = dict(variant=variant, yaw=yaw)
    overlay = []
    if anim in ('idle', 'turn'):
        t = f / n
        sway = 0.7 * math.sin(2 * math.pi * t)
        if anim == 'turn':
            yaw = yaw + 2 * math.pi * f / n
            kw['yaw'] = yaw
            sway = 0.0
        parts = kit_parts(items=False, sway=sway, **kw)
        rgba, info = render(parts, w, h, sc, o, yaw=yaw)
        if anim == 'idle':
            # a glint running along the lid's front top edge
            u = (f - 3) / 5.0
            if 0 <= u <= 1:
                p = np.array((-LD_W + 6 + (2 * LD_W - 12) * ease_io(u), LD_REST + LD_H, LD_D))
                x, y, z = project(p, info['V'], sc, o)
                sz = 3 if 0.3 < u < 0.7 else (2 if 0.1 < u < 0.9 else 1)
                if info['z'][int(y), int(x)] < z + 2:
                    sparkle(rgba, int(x), int(y), sz)
        return rgba
    if anim in ('open',):
        tab_y = {0: LD_REST, 8: LD_REST, 9: LD_REST - 0.9, 10: LD_REST + 2, 13: LD_REST + 19, 16: LD_REST + 24,
                 18: LID_END_T[1] + 3, 19: LID_END_T[1], 23: LID_END_T[1]}
        tab_z = {0: 0.0, 12: 0.0, 13: -3.0, 16: -28.0, 18: LID_END_T[2], 23: LID_END_T[2]}
        tab_a = {0: 0.0, 9: 0.0, 10: -3.0, 13: 10.0, 16: 52.0, 18: 88.0, 19: 85.0, 20: 79.5, 21: 83.0, 22: 81.6, 23: 82.0}
        y = float(keys(f, tab_y))
        z = float(keys(f, tab_z))
        a = float(keys(f, tab_a))
        T, R = _lid(y, z, a)
        bow = 1.0 - ease_in(seg(f, 1, 5))
        cord = ease_io(seg(f, 3, 11))
        jig = {}
        if 19 <= f <= 21:
            jig = {k: [0.0, 0.7, 0.2][f - 19] for k in ('cupA', 'cupB', 'caddy', 'chasen', 'kyusu')}
        parts = kit_parts(lid_T=T, lid_R=R, cord=cord, bow=bow, items=f >= 9, sway=1.5 * math.sin(f * 1.3) * bow,
                          jig=jig, **kw)
        rgba, info = render(parts, w, h, sc, o, yaw=yaw)
        return rgba
    if anim in ('turn_open', 'brew'):
        T, R = LID_END_T, rot_x(LID_END_ANG)
        if anim == 'turn_open':
            yaw = yaw + 2 * math.pi * f / n
            kw['yaw'] = yaw
            parts = kit_parts(lid_T=T, lid_R=R, cord=1.0, bow=0.0, **kw)
            return render(parts, w, h, sc, o, yaw=yaw)[0]
        # brew: lean back, lift and tip, pour, right itself with an overshoot, settle
        tilt = float(keys(f, {0: 0, 2: -7, 3: -6, 6: -2, 9: 8, 11: 44, 12: 52, 18: 56, 24: 62, 25: 54, 27: -9,
                              28: -6, 31: 2, 32: -1, 33: 0, 35: 0}))
        lift = float(keys(f, {0: 0, 2: -0.6, 3: 1.0, 6: 22, 9: 33, 12: 33.5, 24: 34.5, 26: 34, 27: 31, 29: 14,
                              31: 0.6, 32: 0, 33: 0.4, 34: 0, 35: 0}))
        fill = 0.92 * ease_out(seg(f, 13, 26))
        ripple = 0.0
        parts = kit_parts(lid_T=T, lid_R=R, cord=1.0, bow=0.0, ky_lift=lift, ky_tilt=math.radians(tilt), fill=fill,
                          **kw)
        rgba, info = render(parts, w, h, sc, o, yaw=yaw)
        x, z, _ = KIT_LAYOUT['kyusu']
        at, Rk = kyusu_pose((x, BX_FLOOR, z), lift, math.radians(tilt))
        tip = Rk @ KY_TIP + at
        sp_dir = Rk @ _n3(np.array((0.8, 0.6, 0.0)))
        cx, cz, _ = KIT_LAYOUT['cupB']
        level = BX_FLOOR + tea_level(max(fill, 0.05))
        if 11 <= f <= 27:
            head = ease_out(seg(f, 11, 13))
            tail = ease_in(seg(f, 25, 27.5))
            stream3d(rgba, info, tip, sp_dir * 7.0, 2.0, level, sc, o, head=head, tail=tail,
                     wob=0.4 if 14 <= f <= 23 and f % 2 else 0.0)
        cup_top = project(np.array((cx, BX_FLOOR + YU_RIM, cz)), info['V'], sc, o)
        if f >= 16:
            steam(rgba, cup_top[0], cup_top[1] - 2, ((f - 16) / 20.0) * 1.4, n=3, height=20, seed=3,
                  strength=min(1.0, (f - 15) / 6.0))
        if 7 <= f <= 16:
            sx, sy, _ = project(tip, info['V'], sc, o)
            steam(rgba, sx, sy - 1, (f - 7) / 10.0, n=1, height=8, seed=9, strength=0.8)
        return rgba
    raise ValueError(anim)


def item_parts(prop, variant, **pose):
    face = facing(ICON[prop]['yaw'])
    if prop == 'kyusu':
        at, R = kyusu_pose((0, 0, 0), pose.get('lift', 0.0), pose.get('tilt', 0.0))
        return kyusu(variant, at=at, rot=R, face=face)
    if prop == 'yunomi':
        return yunomi(variant, 'nuka', fill=pose.get('fill', 0.92), face=face, ripple=pose.get('ripple', 0.0),
                      at=(0, pose.get('lift', 0.0), 0))
    if prop == 'chasen':
        R = rot_z(pose.get('tilt', 0.0)) @ rot_y(pose.get('spin', 0.0))
        at = np.array((0, pose.get('lift', 0.0), 0)) + np.array((0, 14, 0)) - R @ np.array((0, 14, 0))
        return chasen(variant, at=at, rot=R, face=face, splay=pose.get('splay', 0.0))
    if prop == 'chashaku':
        R = rot_z(SHAKU_TILT + pose.get('tilt', 0.0))
        return chashaku(variant, at=(0, pose.get('lift', 0.0), 0), rot=R, face=face, heap=pose.get('heap', 0.0))
    if prop == 'tea_caddy':
        return tea_caddy(variant, face=face, lid_lift=pose.get('lid', 0.0), lid_tilt=pose.get('ltilt', 0.0),
                         lid_spin=pose.get('lspin', 0.0), at=(0, pose.get('lift', 0.0), 0))
    if prop == 'tea_tin':
        return tea_tin(variant, face=face, lid_lift=pose.get('lid', 0.0), lid_tilt=pose.get('ltilt', 0.0),
                       lid_spin=pose.get('lspin', 0.0), at=(0, pose.get('lift', 0.0), 0))
    raise ValueError(prop)


def item_frame(prop, variant, anim, f, n):
    I = ICON[prop]
    sc, (w, h), o, yaw = I['scale'], I['size'], I['origin'], I['yaw']
    t = f / n
    if anim == 'turn':
        yaw = yaw + 2 * math.pi * f / n
        pose = {}
        if prop == 'chashaku':
            pose = {}
        rgba, info = render(item_parts(prop, variant, **pose), w, h, sc, o, yaw=yaw)
        if prop == 'yunomi':
            top = project(np.array((0, YU_RIM, 0)), info['V'], sc, o)
            steam(rgba, top[0], top[1] - 2, t * 2, n=2, height=14, seed=2, strength=0.8)
        return rgba
    if prop == 'kyusu':
        if anim == 'idle':
            rgba, info = render(item_parts(prop, variant), w, h, sc, o, yaw=yaw)
            tip = project(KY_TIP + np.array((0, 0.6, 0)), info['V'], sc, o)
            steam(rgba, tip[0], tip[1] - 1, t, n=2, height=12, seed=4, strength=0.85, spread=1.2)
            return rgba
        tilt = float(keys(f, {0: 0, 2: -6, 3: -5, 6: 40, 8: 46, 10: 48, 11: 30, 12: -7, 13: 3, 14: -1, 15: 0}))
        lift = float(keys(f, {0: 0, 2: -0.3, 3: 1, 6: 6, 10: 6.5, 12: 1.5, 13: 0, 15: 0}))
        rgba, info = render(item_parts(prop, variant, lift=lift, tilt=math.radians(tilt)), w, h, sc, o, yaw=yaw)
        at, Rk = kyusu_pose((0, 0, 0), lift, math.radians(tilt))
        tip = Rk @ KY_TIP + at
        if 6 <= f <= 12:
            sp_dir = Rk @ _n3(np.array((0.8, 0.6, 0.0)))
            stream3d(rgba, info, tip, sp_dir * 8.0, 2.0, -6.0, sc, o, head=ease_out(seg(f, 6, 8)),
                     tail=ease_in(seg(f, 10.5, 12.5)))
        return rgba
    if prop == 'yunomi':
        if anim == 'idle':
            rgba, info = render(item_parts(prop, variant), w, h, sc, o, yaw=yaw)
            top = project(np.array((0, YU_RIM, 0)), info['V'], sc, o)
            steam(rgba, top[0], top[1] - 2, t, n=3, height=18, seed=2)
            return rgba
        fill = 0.92 * ease_out(seg(f, 2, 11))
        lift = float(keys(f, {0: 0, 11: 0, 12: -0.5, 13: 0.4, 14: 0, 15: 0}))
        rgba, info = render(item_parts(prop, variant, fill=max(0.0, fill), lift=lift,
                                       ripple=(1.5 + (f % 4) * 1.6) if 3 <= f <= 11 else 0.0), w, h, sc, o, yaw=yaw)
        if 1 <= f <= 12:
            top = np.array((0.5, YU_RIM + 9, 0.0))
            stream3d(rgba, info, top, np.array((0, -4.0, 0)), 1.0, tea_level(max(fill, 0.05)), sc, o,
                     head=ease_out(seg(f, 1, 3)), tail=ease_in(seg(f, 10, 12.5)))
        if f >= 6:
            top = project(np.array((0, YU_RIM, 0)), info['V'], sc, o)
            steam(rgba, top[0], top[1] - 2, (f - 6) / 12.0, n=3, height=16, seed=5, strength=min(1, (f - 5) / 4))
        return rgba
    if prop == 'chasen':
        if anim == 'idle':
            tl = 0.035 * math.sin(2 * math.pi * t)
            rgba, info = render(item_parts(prop, variant, tilt=tl), w, h, sc, o, yaw=yaw)
            u = seg(f, 3, 8)
            if 0 < u < 1:
                p = rot_z(tl) @ np.array((-2.2, 17 + 9 * u, 1.4)) + np.array((0, 14, 0)) - rot_z(tl) @ np.array((0, 14, 0))
                x, y, _ = project(p, info['V'], sc, o)
                sparkle(rgba, int(x), int(y), 2 if 0.3 < u < 0.7 else 1)
            return rgba
        # whisking: a quick M stroke back and forth, the tines lagging and splaying, then a flourish
        tilt = float(keys(f, {0: 0, 1: 0.12, 3: -0.3, 5: 0.3, 7: -0.3, 9: 0.25, 10: 0.05, 11: 0}))
        spin = 0.9 * math.sin(2 * math.pi * f / n * 2)
        splay = float(keys(f, {0: 0, 2: 0.6, 3: 1.0, 4: 0.3, 5: 1.0, 6: 0.3, 7: 1.0, 8: 0.3, 9: 0.8, 10: 0.2, 11: 0}))
        rgba, info = render(item_parts(prop, variant, tilt=tilt, spin=spin, splay=splay), w, h, sc, o, yaw=yaw)
        rs = np.random.RandomState(f)
        if 2 <= f <= 9:
            bx, by, _ = project(np.array((0, 1.0, 0)), info['V'], sc, o)
            for k in range(3):
                _put(rgba, bx + rs.uniform(-12, 12), by + rs.uniform(-4, 3), R['matcha'][rs.randint(1, 4)])
        return rgba
    if prop == 'chashaku':
        if anim == 'idle':
            rgba, info = render(item_parts(prop, variant), w, h, sc, o, yaw=yaw)
            u = seg(f, 2, 9)
            if 0 < u < 1:
                p = rot_z(SHAKU_TILT) @ np.array((-14 + 28 * ease_io(u), 1.6, 0.0))
                x, y, _ = project(p, info['V'], sc, o)
                sparkle(rgba, int(x), int(y), 2 if 0.3 < u < 0.7 else 1)
            return rgba
        tilt = float(keys(f, {0: 0, 2: -0.38, 4: -0.42, 5: 0.12, 6: 0.06, 8: 0.05, 9: -0.5, 10: -0.6, 11: 0}))
        lift = float(keys(f, {0: 0, 2: -3, 4: -3.5, 5: 3, 6: 2, 8: 2, 9: 0, 11: 0}))
        heap = float(keys(f, {0: 0, 3: 0, 4: 0.8, 5: 1.0, 8: 1.0, 9: 0.5, 10: 0.0, 11: 0}))
        rgba, info = render(item_parts(prop, variant, tilt=tilt, lift=lift, heap=heap), w, h, sc, o, yaw=yaw)
        if 9 <= f <= 11:
            body, tip = _shaku_path()
            p = rot_z(SHAKU_TILT + tilt) @ np.array((tip[1][0], tip[1][1], 0)) + np.array((0, lift, 0))
            x, y, _ = project(p, info['V'], sc, o)
            rs = np.random.RandomState(7)
            for k in range(9):
                d = (f - 8) * rs.uniform(2, 4)
                _put(rgba, x + rs.uniform(-2, 2) + (f - 9), y + d + rs.uniform(0, 2), R['matcha'][rs.randint(1, 4)])
        return rgba
    if prop in ('tea_caddy', 'tea_tin'):
        top_y = CA_LID1 if prop == 'tea_caddy' else TN_LID1
        if anim == 'idle':
            rgba, info = render(item_parts(prop, variant), w, h, sc, o, yaw=yaw)
            u = seg(f, 2, 9)
            if 0 < u < 1:
                a = facing(yaw) - 0.9
                rr = CA_R if prop == 'tea_caddy' else TN_R
                p = np.array((rr * math.cos(a), 2.0 + 10 * ease_io(u), rr * math.sin(a)))
                x, y, _ = project(p, info['V'], sc, o)
                sparkle(rgba, int(x), int(y), 2 if 0.3 < u < 0.7 else 1)
            return rgba
        if prop == 'tea_caddy':
            lid = float(keys(f, {0: 0, 2: -0.3, 3: 0.0, 5: 4.5, 7: 5.8, 9: 5.4, 11: 3, 12: 0.0, 13: 0.5, 14: 0, 15: 0}))
            ltilt = float(keys(f, {0: 0, 3: 0, 5: 0.35, 7: 0.5, 9: 0.3, 11: 0.1, 12: 0, 15: 0}))
            lspin = float(keys(f, {0: 0, 3: 0, 9: 0.8, 12: 1.0, 15: 1.0}))
            lift = float(keys(f, {0: 0, 2: -0.4, 3: 0, 12: 0, 13: -0.3, 14: 0, 15: 0}))
        else:
            lid = float(keys(f, {0: 0, 1: -0.2, 2: 0.2, 3: -0.2, 4: 5.0, 6: 6.8, 8: 5.6, 10: 2.2, 11: 0.0, 12: 0.9,
                                13: 0, 14: 0.25, 15: 0}))
            ltilt = float(keys(f, {0: 0, 3: 0, 4: -0.5, 6: -0.8, 8: -0.4, 10: -0.1, 11: 0, 15: 0}))
            lspin = 0.0
            lift = float(keys(f, {0: 0, 1: 0.3, 2: -0.3, 3: 0.3, 4: 0, 11: 0, 12: -0.4, 13: 0, 15: 0}))
        rgba, info = render(item_parts(prop, variant, lid=lid, ltilt=ltilt, lspin=lspin, lift=lift), w, h, sc, o,
                            yaw=yaw)
        if lid > 3 or 4 <= f <= 11:
            x, y, _ = project(np.array((0, top_y - 4.5, 0)), info['V'], sc, o)
            leaves2d(rgba, x, y, seg(f, 4, 13) * 1.3, n=8, seed=3 if prop == 'tea_caddy' else 5,
                     power=1.0 if prop == 'tea_caddy' else 0.8)
        return rgba
    raise ValueError((prop, anim))


ANIMS = {
    'tea_kit': {'idle': 12, 'open': 24, 'brew': 36, 'turn': 32, 'turn_open': 32},
    'kyusu': {'idle': 12, 'use': 16, 'turn': 24},
    'yunomi': {'idle': 12, 'use': 16, 'turn': 24},
    'chasen': {'idle': 12, 'use': 12, 'turn': 24},
    'chashaku': {'idle': 12, 'use': 12, 'turn': 24},
    'tea_caddy': {'idle': 12, 'use': 16, 'turn': 24},
    'tea_tin': {'idle': 12, 'use': 16, 'turn': 24},
}
MAIN_ONLY = {'tea_kit': ('brew', 'turn_open')}


def anims_for(prop, variant):
    a = dict(ANIMS[prop])
    if variant != 'clean':
        for k in MAIN_ONLY.get(prop, ()):
            a.pop(k, None)
    return a


def frame(job):
    prop, variant, anim, f, n = job
    if prop == 'tea_kit':
        return kit_frame(variant, anim, f, n)
    return item_frame(prop, variant, anim, f, n)


def crop_all(anims, pad=1):
    """One frame size for every animation of a prop: the union of where
    anything is drawn, plus a pixel."""
    m = None
    for frs in anims.values():
        for a in frs:
            al = a[..., 3] > 0
            m = al if m is None else (m | al)
    ys, xs = np.nonzero(m)
    y0, y1 = max(0, ys.min() - pad), ys.max() + 1 + pad
    x0, x1 = max(0, xs.min() - pad), xs.max() + 1 + pad
    return {k: [a[y0:y1, x0:x1] for a in v] for k, v in anims.items()}


def build(props=None, variants=VARIANTS, procs=4, outdir=None):
    from multiprocessing import Pool
    from kit_export import export_prop
    props = props or list(ANIMS)
    jobs = []
    for p in props:
        for v in variants:
            for an, n in anims_for(p, v).items():
                for f in range(n):
                    jobs.append((p, v, an, f, n))
    with Pool(procs) as pool:
        res = pool.map(frame, jobs, chunksize=2)
    by = {}
    for (p, v, an, f, n), a in zip(jobs, res):
        by.setdefault((p, v), {}).setdefault(an, [None] * n)[f] = a
    written = []
    for (p, v), anims in by.items():
        anims = crop_all(anims)
        order = ['idle', 'turn', 'open', 'use', 'brew', 'turn_open']
        anims = {k: anims[k] for k in order if k in anims}
        kw = {} if outdir is None else {'root': outdir}
        note = NOTES.get(p, '') + ' Variant: ' + VARIANT_NOTES[v]
        written.append(export_prop(f'{p}_{v}', anims, fps=12, note=note, **kw))
    return written


NOTES = {
    'tea_kit': 'A travelling tea-brewer\'s chabako: black urushi box with a vermilion rim, gold maki-e plum and a '
               'silver moon on the lid, tied in purple silk cord, on an indigo seigaiha furoshiki.',
    'kyusu': 'Tokoname red-clay kyusu with a side handle.',
    'yunomi': 'Yunomi: iron-brown glaze dipped in white nuka ash glaze that ran in drips; bare foot ring; sencha.',
    'chasen': 'Bamboo tea whisk: a handle with its node, black thread, curled tines.',
    'chashaku': 'Smoked-bamboo tea scoop with a node and a bent tip.',
    'tea_caddy': 'Kabazaiku tea caddy skinned in wild-cherry bark, a blossom inlaid on the lid.',
    'tea_tin': 'Travel tin of sencha with a washi label lettered in runes and a red seal.',
}
VARIANT_NOTES = {
    'clean': 'clean - lovingly kept (the main one, every animation).',
    'worn': 'worn - rubbed edges, faded finish, chips.',
    'dirty': 'dirty - tea stains, soot, grime, dust.',
    'repaired': 'repaired - kintsugi, twine wraps, staples, a mismatched part.',
}


# ---------------------------------------------------------------- previews
def preview(frames, path, scale=4, bg=(34, 28, 36), gap=4):
    """Frames side by side over a card, enlarged: for looking at."""
    from PIL import Image
    h = max(f.shape[0] for f in frames)
    w = sum(f.shape[1] for f in frames) + gap * (len(frames) - 1)
    out = np.zeros((h, w, 3), np.float32)
    out[:] = bg
    x = 0
    for f in frames:
        a = f[..., 3:4] / 255.0
        out[:f.shape[0], x:x + f.shape[1]] = f[..., :3] * a + out[:f.shape[0], x:x + f.shape[1]] * (1 - a)
        x += f.shape[1] + gap
    im = Image.fromarray(out.astype(np.uint8))
    im.resize((im.width * scale, im.height * scale), Image.NEAREST).save(path)


if __name__ == '__main__':
    import time
    t0 = time.time()
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    out = build(args or None)
    for p in out:
        print(p)
    print('%d props in %.0fs' % (len(out), time.time() - t0))
