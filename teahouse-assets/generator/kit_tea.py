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
    'ame':     [(36, 16, 20), (64, 28, 26), (100, 48, 30), (140, 78, 40), (184, 120, 58)],     # iron-amber glaze
    'seiji':   [(28, 46, 60), (42, 72, 82), (64, 106, 104), (96, 142, 126), (140, 180, 154),
                (194, 218, 194)],                                                            # celadon
    'foot':    [(76, 52, 50), (116, 84, 68), (158, 120, 90), (194, 158, 120)],                 # bare buff clay
    'inner':   [(56, 46, 62), (92, 80, 92), (134, 122, 126), (176, 166, 158)],                # inside a cup, shino
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
    'lacq':    [(16, 10, 16), (30, 18, 24), (48, 30, 34), (76, 50, 50), (118, 86, 80), (180, 150, 136)],
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


CLAY = _mat('clay', 'clay', 'satin', 0.3, 0.1, 0.10)
KURO = _mat('kuro', 'kuro', 'satin', 0.3, 0.2, 0.06)
SHINO = _mat('shino', 'shino', 'glaze', 0.35, 0.25)
AME = _mat('ame', 'ame', 'glaze', 0.3, 0.2)
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
SHU = _mat('shu', 'shu', 'lacq', 0.3, 0.1)
GOLD = _mat('gold', 'gold', 'metal', 0.3, 0.2)
PALEGOLD = _mat('palegold', 'paledgold', 'matte', 0.35, 0.3)
CORD = _mat('cord', 'cord', 'matte', 0.4, 0.2, 0.05)
TWINE = _mat('twine', 'twine', 'matte', 0.45, 0.25, 0.08)
INDIGO = _mat('indigo', 'indigo', 'matte', 0.45, 0.2, 0.08)
COTTON = _mat('cotton', 'cotton', 'matte', 0.45, 0.2, 0.0)
LINEN = _mat('linen', 'linen', 'matte', 0.5, 0.3, 0.06)
HOLE = _mat('hole', 'hole', 'matte', 0.2, 0.0)
GRIME = _mat('grime', 'grime', 'matte', 0.4, 0.2, 0.12)
STAIN = _mat('stain', 'stain', 'satin', 0.35, 0.1, 0.06)
RUST = _mat('rust', 'rust', 'matte', 0.35, 0.1, 0.15)
DUST = _mat('dust', 'dust', 'matte', 0.5, 0.2, 0.1)
SASHIKO = _mat('sashiko', 'sashiko', 'matte', 0.5, 0.3)

GLOSSY = ('glaze', 'lacq', 'metal', 'liquid', 'satin')


def _n3(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


KEY = _n3((-0.55, 0.7, 0.6))                # upper left, in front (view space)
HALF = _n3(KEY + np.array((0, 0, 1.0)))     # the key's highlight
STREAK = _n3((-0.42, 0.18, 0.89))           # a tall window on the left: the glossy streak down a wall
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
PITCH = 0.46                    # a little from above: the tops show


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
                 name=''):
        self.S, self.bound = shapes, bound
        self.at = np.asarray(at, float)
        self.rot = np.eye(3) if rot is None else np.asarray(rot, float)
        self.paint, self.nudge = paint, nudge
        self.soft_edge = soft_edge      # draws no depth-break line on what is behind it (tea, steam)
        self.name = name


def trace_part(part, w, h, scale, origin, V):
    Vp = V @ part.rot
    c = V @ part.at
    o = (origin[0] + c[0] * scale, origin[1] - c[1] * scale)
    g = part.S.trace(w, h, scale, o, Vp, bound=part.bound, steps=110)
    g['z'] = np.where(g['hit'], g['z'] + c[2], -1e9)
    g['Vp'] = Vp
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
        v = v * (0.6 + 0.4 * ao)
        if M['kind'] in ('glaze', 'satin', 'liquid', 'lacq', 'metal'):
            v = v + 0.16 * np.clip((n * BOUNCE).sum(-1), 0, 1)     # reflected light on the shadow side
        if M['fuzz']:
            nz = fbm(P * ctx.get('nscale', 1.0) + seed, 0.55)
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
            i = np.minimum(i, k - 3) + (ry > 0.62).astype(int)  # deep, with the sky in the top faces
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
        if kind in ('glaze', 'lacq', 'liquid'):
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


def outline(rgba, mat, z, soft, inner):
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
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nz = _shift(zz, dy, dx, -1e9)
        ns = _shift(soft, dy, dx, False)
        brk |= m & (nz > zz + inner) & ~ns
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
        SOFT[win] = part.soft_edge
        KEEP[win] = keep[win]
        PID[win] = pi
    if inner is None:
        inner = 2.2
    out = outline(rgba, MAT, Z, SOFT, inner)
    out = tidy(out, keep=KEEP)
    info = dict(z=Z, mat=MAT, pid=PID, V=V, proj=lambda p: project(p, V, scale, origin))
    return out, info


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
# a tall handleless cup, thrown with soft ribs; units are icon pixels
YU_OUT = [(2.0, 6.3), (5.0, 7.4), (9.0, 7.95), (12.5, 7.75), (15.5, 7.85), (19.0, 7.65), (22.5, 7.9),
          (26.4, 8.2)]
YU_IN = [(10.4, 6.5), (15.5, 6.6), (19.0, 6.45), (22.5, 6.7), (34.0, 7.0)]
YU_RIM = 26.2


def yu_inner_r(y):
    ys = [a for a, _ in YU_IN]
    rs = [b for _, b in YU_IN]
    if y <= ys[0]:
        return max(0.5, math.sqrt(max(0.0, rs[0] ** 2 - (ys[0] - y) ** 2)))
    return float(np.interp(y, ys, rs))


def _yu_crack(seed):
    """A crack's path round the cup: angle offset as a function of height."""
    rs = np.random.RandomState(seed)
    ys = np.linspace(YU_RIM + 0.5, 6.0, 9)
    off = np.cumsum(rs.uniform(-0.07, 0.07, len(ys)))
    off -= off[0]
    return ys[::-1], off[::-1]


def yunomi(variant='clean', glaze='shino', fill=0.0, at=(0, 0, 0), rot=None, face=0.0, tag='a'):
    """Parts of a yunomi. glaze 'shino' (cream, an iron-amber dip at the rim
    with drips) or 'seiji' (celadon). fill 0..1 of sencha. face = the angle
    round the cup that should show the cup's story (chip, seam) to the viewer."""
    S = Shapes()
    lathe(S, YU_OUT, SHINO, k=1.0)
    cut_above(S, YU_RIM, k=0.7)
    cut_below(S, 2.2)
    S.ell((0, 1.3, 0), (5.7, 2.7, 5.7), k=0.6, mat=FOOT)
    cut_below(S, 0.0, k=0.35)
    lathe(S, YU_IN, INNER, k=0.6, op=1)
    chips = []
    if variant in ('worn', 'clean') and glaze == 'shino' and tag == 'kit' or variant == 'worn':
        chips.append((face - 0.35, 1.5))                                   # a bite out of the rim
    if variant == 'worn':
        chips.append((face + 2.2, 1.2))
    for (a, r) in chips:
        rr = 8.1
        S.ell((rr * math.cos(a), YU_RIM + 0.3, rr * math.sin(a)), (r, r * 0.9, r), mat=FOOT, op=1)
    staples = []
    if variant == 'repaired':
        cs, co = _yu_crack(11)
        for yy in (18.5, 13.5, 8.5):
            a = face + 0.9 + float(np.interp(yy, cs, co))
            rad = 8.55 if yy > 9 else 8.3
            tang = np.array((-math.sin(a), 0, math.cos(a)))
            nrm = np.array((math.cos(a), 0, math.sin(a)))
            Rb = np.column_stack([tang, (0, 1, 0), nrm])
            S.box(tuple(nrm * (rad + 0.15) + (0, yy, 0)), (1.7, 0.42, 0.42), rot=Rb, round=0.2, mat=TIN)
            for s in (-1, 1):
                S.ell(tuple(nrm * (rad + 0.25) + tang * 1.6 * s + (0, yy, 0)), (0.55, 0.55, 0.55), mat=TIN)
    body_glaze = SHINO if glaze == 'shino' else SEIJI
    in_glaze = INNER if glaze == 'shino' else INNERJ
    rs = np.random.RandomState(7 if glaze == 'shino' else 9)
    drips = [(face - 0.32, 7.5), (face + 0.42, 3.4), (face + 2.6, 6.0), (face - 2.2, 4.0)]

    def paint(g, ctx):
        P, hit, mat = g['p'], g['hit'], g['mat']
        th, r = cyl_coords(P)
        y = P[..., 1]
        px = ctx['px']
        outer = hit & (mat == SHINO)
        inner = hit & (mat == INNER)
        mat[outer] = body_glaze
        mat[inner] = in_glaze
        # the glaze stops short of the foot in a soft wavy line
        gl = 3.1 + 0.45 * np.sin(2 * th + 0.5) + 0.25 * np.sin(5 * th + 1.3)
        bare = outer & (y < gl)
        mat[bare] = FOOT
        g['pool'] = outer & ~bare & (y < gl + 1.1 * px)
        if glaze == 'shino':
            # dipped in iron-amber glaze at the rim, run down in drips
            dip = YU_RIM - 2.4 + 0.5 * np.sin(3 * th + 1.0) + 0.3 * np.sin(7 * th)
            amber = outer & (y > dip)
            for (a, L) in drips:
                s = adiff(th, a) * r
                bot = dip - L
                amber |= outer & (np.abs(s) < 0.75) & (y > bot) & (y < dip + 0.5)
                amber |= outer & ((s / 1.15) ** 2 + ((y - bot) / 1.3) ** 2 < 1)
            amber |= hit & (mat == in_glaze) & (y > YU_RIM - 2.0 + 0.4 * np.sin(4 * th))
            amber |= hit & np.isin(mat, [SHINO, body_glaze]) & (y > YU_RIM - 0.9)
            mat[amber & ~bare] = AME
        # the rim: whatever glaze is there, the very lip reads a shade lighter
        g['lip'] = hit & (y > YU_RIM - 0.5) & (r > 7.6)
        if variant == 'worn':
            # crazing: a fine crackle in the glaze
            u, v = th * 8.5, y
            cr = np.zeros(hit.shape, bool)
            for k in range(3):
                q = np.stack([np.cos(th) * r, y, np.sin(th) * r], -1) * (0.55 + 0.25 * k) + 9.1 * k
                f = vnoise(q, 1.0)
                cr |= np.abs(f - 0.5) < 0.035
            g['craze'] = cr & np.isin(mat, [body_glaze]) & (y > 4) & (y < 19)
            g['rub'] = hit & (mat == AME) & (y > YU_RIM - 0.7) & (vnoise(P * 1.3, 1.0) > 0.55)
        if variant == 'dirty':
            ring = hit & (mat == in_glaze) & (np.abs(y - (12.5 + 0.2 * np.sin(th * 3))) < 0.55)
            tannin = hit & (mat == in_glaze) & (y < 12.5) & (vnoise(P * 0.9, 1.0) > 0.42)
            run = np.zeros(hit.shape, bool)
            for (a, L) in ((face + 0.25, 9.0), (face + 0.6, 5.0), (face - 1.4, 7.0)):
                s = adiff(th, a) * r
                wob = 0.25 * np.sin(y * 1.3 + a * 5)
                run |= (np.abs(s + wob) < 0.6) & (y > YU_RIM - L) & (y < YU_RIM + 0.5)
                run |= ((s / 0.95) ** 2 + ((y - (YU_RIM - L)) / 1.0) ** 2 < 1)
            mat[ring | tannin] = STAIN
            mat[run & np.isin(mat, [body_glaze, AME, FOOT])] = STAIN
            gr = hit & (y < gl + 1.5) & (fbm(P * 0.7, 1.0) > 0.45)
            mat[gr] = GRIME
            dust = hit & (g['n'][..., 1] > 0.4) & (vnoise(P * 2.4, 1.0) > 0.66) & ~inner
            mat[dust & (y > 15)] = DUST
        if variant == 'repaired' or (tag == 'kit' and glaze == 'seiji'):
            # kintsugi: the crack filled with lacquer and dusted in gold
            cs, co = _yu_crack(5)
            base = face - 0.2
            a0 = base + np.interp(y, cs, co)
            seam = (np.abs(adiff(th, a0)) * r < 0.5 * px + 0.12) & (y > 6.5)
            b0 = base + 0.05 + (np.interp(y, cs, co) * 0.4) + (15.5 - y) * 0.07
            seam |= (np.abs(adiff(th, b0)) * r < 0.5 * px + 0.1) & (y < 15.5) & (y > 10.0)
            seam &= hit & ~np.isin(mat, [HOLE])
            mat[seam] = GOLD
            g['seam'] = seam
        if variant == 'repaired':
            cs, co = _yu_crack(11)
            a1 = face + 0.9 + np.interp(y, cs, co)
            hair = hit & (np.abs(adiff(th, a1)) * r < 0.45 * px) & (y > 6.0) & (mat != TIN)
            g['hair'] = hair
        g['glossmask'] = hit & ~((variant == 'worn') & (r > 7.5) & (y < 19))

    def nudge(g, idx, ctx):
        hit = g['hit']
        idx[g['pool']] -= 1
        idx[g['lip'] & np.isin(g['mat'], [SHINO, SEIJI, AME])] += 1
        if 'craze' in g:
            idx[g['craze']] -= 1
        if 'rub' in g:
            idx[g['rub']] += 1
        if 'hair' in g:
            idx[g['hair']] = 0
        if 'seam' in g:
            idx[g['seam']] = np.maximum(idx[g['seam']], 2)
    parts = [Part(S, 30, at=at, rot=rot, paint=paint, nudge=nudge, name='yunomi')]
    if fill > 0.01:
        L = 4.2 + (YU_RIM - 2.6 - 4.2) * fill
        rr = yu_inner_r(L) + 0.3
        T = Shapes()
        lathe(T, [(y, r + 0.3) for (y, r) in YU_IN], TEA, k=0.6)
        cut_above(T, L)

        def tpaint(g, ctx):
            th, r = cyl_coords(g['p'])
            g['men'] = g['hit'] & (r > rr - 1.0 * ctx['px'] - 0.5)

        def tnudge(g, idx, ctx):
            idx[g['men']] += 1
        parts.append(Part(T, 30, at=at, rot=rot, paint=tpaint, nudge=tnudge, soft_edge=True, name='tea'))
    return parts


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
