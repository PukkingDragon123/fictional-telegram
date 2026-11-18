"""The traveller's two keepsakes you can pick up and turn in your hands: a
companion plush and an omamori charm. Each is sculpted in 3D (sculpt.py) so
it turns properly, and every frame is drawn as pixel art the way you would
draw it by hand:

  - a few colour bands per material, hue-shifted (warm lights, cool, purple
    shadows), the band edges broken into small clusters rather than smooth
    gradients or dither fields
  - details sewn onto the surface itself, so they turn with it: seams and
    running stitches, the tanuki's eye mask, its embroidered mouth, foot
    pads, the patches; on the charm the brocade, its gold thread and the
    embroidered crest
  - a selective outline: the darkest tone of what is inside on the lit side,
    a warm near-black on the shadow side, a dark line wherever a near part
    crosses a far one; then lone specks cleaned away

  plush   a sitting tanuki-bear: big round head, button eyes, the tanuki's
          dark mask, a cream muzzle with an embroidered mouth, round ears,
          stubby arms and legs with pink felt pads, a striped tail, a red
          tenugui scarf, a patched ear and a tea-leaf patch on its tummy.
  charm   an omamori: a brocade pouch, gold-bordered, a crest embroidered
          on the front and waves on the back, its cord tied in a knot with a
          hanging loop, and a little gold bell on a cord of its own.

render_plush(**pose) / render_charm(**pose) return one RGBA frame; the
animations in travel_kit.py are built from poses."""
import math
import numpy as np
from sculpt import Shapes, rot_x, rot_y, rot_z

BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47

# ---------------------------------------------------------------- colours (dark -> light, hue-shifted)
R = {
    'fur':    [(44, 28, 38), (72, 46, 50), (104, 70, 60), (140, 98, 72), (176, 132, 92), (206, 168, 118)],
    'mask':   [(28, 20, 30), (46, 32, 42), (68, 48, 54), (94, 68, 66)],
    'cream':  [(110, 86, 82), (152, 124, 106), (196, 168, 134), (226, 206, 168), (244, 232, 200)],
    'pink':   [(112, 58, 72), (160, 90, 98), (204, 128, 124), (230, 168, 152)],
    'nose':   [(30, 18, 26), (58, 34, 40), (96, 60, 58)],
    'button': [(12, 10, 18), (26, 22, 34), (52, 48, 66), (110, 108, 128)],
    'scarf':  [(64, 16, 34), (108, 26, 42), (156, 44, 50), (198, 76, 62), (230, 124, 92)],
    'thread': [(40, 24, 32), (66, 42, 46)],
    'leaf':   [(28, 50, 40), (48, 84, 52), (80, 120, 62), (126, 160, 84)],
    'indigo': [(22, 24, 48), (36, 42, 78), (56, 68, 112), (86, 104, 148)],
    'white':  [(150, 144, 150), (200, 196, 196), (238, 236, 226)],
    # the charm
    'silk':   [(52, 12, 30), (88, 20, 40), (132, 32, 48), (176, 54, 58), (214, 92, 76)],
    'gold':   [(84, 52, 26), (134, 92, 36), (188, 140, 52), (228, 190, 88), (250, 230, 160)],
    'cord':   [(46, 30, 72), (76, 52, 112), (112, 84, 152), (156, 126, 188)],
    'bead':   [(18, 46, 52), (28, 80, 80), (52, 122, 110), (110, 176, 152)],
}
INK = (28, 18, 24)

FUR, CREAM, MASK, PINK, NOSE, BUTTON, SCARF, THREAD, LEAF, INDIGO, WHITE, SILK, GOLD, CORD, BEAD = range(1, 16)
MAT_RAMP = {FUR: 'fur', CREAM: 'cream', MASK: 'mask', PINK: 'pink', NOSE: 'nose', BUTTON: 'button', SCARF: 'scarf',
            THREAD: 'thread', LEAF: 'leaf', INDIGO: 'indigo', WHITE: 'white', SILK: 'silk', GOLD: 'gold', CORD: 'cord',
            BEAD: 'bead'}
GLOSS = {BUTTON, NOSE, GOLD, BEAD}
SOFT = {FUR, CREAM, MASK, PINK, SCARF, LEAF, INDIGO, WHITE, SILK, CORD, THREAD}


def _n3(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


KEY = _n3((-0.55, 0.7, 0.6))


# ---------------------------------------------------------------- noise for the fabric
def _hash3(ix, iy, iz):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffff) / 65535.0


def vnoise(p, f):
    """Value noise in 3D at frequency f, for clusters fixed to the surface."""
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


# ---------------------------------------------------------------- styling
def style(g, idx_fn=None, fuzz=0.12, bands=None, spec_on=GLOSS, lift=None):
    """Buffers -> RGBA pixel art. idx_fn(g, idx) may nudge ramp indices after
    lighting (seams, prints)."""
    h, w = g['hit'].shape
    hit, n, mat, ao, P = g['hit'], g['n'], g['mat'], g['ao'], g['p']
    yy, xx = np.mgrid[0:h, 0:w]
    nl = (n * KEY).sum(-1)
    soft = np.isin(mat, list(SOFT))
    wrap = np.where(soft, 0.45, 0.15)
    v = np.clip((nl + wrap) / (1 + wrap), 0, 1)
    v = 0.16 + 0.84 * v
    v = v * (0.62 + 0.38 * ao)
    nz = vnoise(P + 3.1, 9.0) + 0.5 * vnoise(P - 7.7, 19.0)            # clusters on the fabric, fixed to it
    v = v + np.where(soft, (nz / 1.5 - 0.5) * fuzz * 2, 0) + BAYER[yy % 4, xx % 4] * 0.05
    idx = np.zeros((h, w), int)
    for m, rn in MAT_RAMP.items():
        sel = hit & (mat == m)
        if not sel.any():
            continue
        k = len(R[rn])
        lo = 0.12 if m not in (BUTTON, NOSE) else 0.0
        i = np.floor((v - lo) / (1.0 - lo) * (k - 0.35) + (lift or {}).get(m, 0)).astype(int)
        idx[sel] = np.clip(i, 0, k - 1)[sel]
    if idx_fn is not None:
        idx_fn(g, idx)
    out = np.zeros((h, w, 4), np.uint8)
    hv = _n3(KEY + np.array([0, 0, 1.0]))
    sp = np.clip((n * hv).sum(-1), 0, 1)
    for m, rn in MAT_RAMP.items():
        sel = hit & (g['mat'] == m)
        if not sel.any():
            continue
        pal = np.array(R[rn], np.uint8)
        out[sel, :3] = pal[np.clip(idx, 0, len(pal) - 1)[sel]]
        out[sel, 3] = 255
        if m in spec_on:
            gl = sel & (sp > (0.93 if m in (BUTTON, NOSE, BEAD) else 0.96))
            out[gl, :3] = (250, 246, 232) if m in (BUTTON, NOSE, BEAD) else pal[-1]
    return out


def _darker(c, k=0.55):
    return tuple(int(v * k) for v in c)


def _shift(a, dy, dx, fill):
    """a moved by (dy, dx): out[y, x] = a[y - dy, x - dx]."""
    out = np.full_like(a, fill)
    h, w = a.shape[:2]
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = a[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def outline(rgba, g, inner=1.6):
    """Selective outline. Outside the silhouette: the darkest tone of the
    material it borders on the lit (upper-left) side, warm near-black below and
    right. Inside: a darker line on the far side of every depth break."""
    a = rgba
    m = a[..., 3] > 0
    out = a.copy()
    mat = np.where(m, g['mat'], 0)
    # neighbour to the right, below, left, above
    nbm = [_shift(m, dy, dx, False) for dy, dx in ((0, -1), (-1, 0), (0, 1), (1, 0))]
    nbmat = [_shift(mat, dy, dx, 0) for dy, dx in ((0, -1), (-1, 0), (0, 1), (1, 0))]
    edge = ~m & (nbm[0] | nbm[1] | nbm[2] | nbm[3])
    lit = (nbm[0] | nbm[1]) & ~(nbm[2] | nbm[3])
    first = np.where(nbm[0], nbmat[0], np.where(nbm[1], nbmat[1], np.where(nbm[2], nbmat[2], nbmat[3])))
    darkest = np.zeros(m.shape + (3,), np.uint8)
    darkest[:] = INK
    for mm, rn in MAT_RAMP.items():
        darkest[first == mm] = R[rn][0]
    out[edge & lit, :3] = darkest[edge & lit]
    out[edge & ~lit, :3] = INK
    out[edge, 3] = 255
    z = np.where(m, g['z'], -1e9)
    brk = np.zeros(m.shape, bool)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        brk |= m & (_shift(z, dy, dx, -1e9) > z + inner)
    out[brk, :3] = (out[brk, :3].astype(np.float32) * 0.5).astype(np.uint8)
    return out


def tidy(rgba, keep=None):
    """Lone specks - a pixel unlike all four neighbours, three of which agree -
    take their colour (keep: mask of pixels to leave alone, like glints)."""
    a = rgba
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


# ---------------------------------------------------------------- the plush: a seal beast
R.update({
    'seal':  [(34, 32, 48), (56, 56, 74), (84, 86, 104), (116, 120, 136), (152, 158, 168), (190, 196, 200),
              (224, 228, 224)],
    'spot':  [(28, 28, 42), (44, 46, 62), (64, 68, 86), (88, 94, 110), (112, 120, 134)],
    'belly': [(112, 114, 132), (156, 160, 170), (198, 202, 204), (232, 234, 228)],
    'felt':  [(112, 88, 82), (166, 140, 118), (214, 196, 164), (242, 232, 204)],
    'maw':   [(40, 12, 26), (84, 26, 44), (140, 52, 66)],
})
R['cotton'] = [(132, 126, 140), (182, 178, 184), (220, 216, 212), (244, 242, 232)]
R['hole'] = [(22, 18, 28), (40, 32, 42), (64, 52, 60)]
SEAL, SPOT, BELLY, FELT, MAW, COTTON, HOLE = 16, 17, 18, 19, 20, 21, 22
MAT_RAMP.update({SEAL: 'seal', SPOT: 'spot', BELLY: 'belly', FELT: 'felt', MAW: 'maw', COTTON: 'cotton', HOLE: 'hole'})
SOFT |= {SEAL, SPOT, BELLY, FELT, COTTON}


def _tears(damage):
    """Where it has worn through: (centre, outward normal, radius, puffs).
    damage 0 whole, 1 worn (a rip on the flank), 2 torn (and the back seam
    split, a flipper torn, an eye pulled off)."""
    out = []
    if damage >= 1:
        out.append((_on_body(np.array((-0.25, 0.15, 1.0))), None, 0.17, 4))
    if damage >= 2:
        out.append((_on_body(np.array((-0.55, 1.0, 0.25))), None, 0.2, 6))
        out.append((_on_head(np.array((-0.1, 0.25, 1.0))), 'head', 0.13, 3))
    res = []
    for c, kind, r, n in out:
        if kind == 'head':
            nrm = _n3((c - HEAD_C) / HEAD_R ** 2)
        else:
            nrm = _n3((c - BODY_C) / BODY_R ** 2)
        res.append((c, nrm, r, n))
    return res

PLUSH_SIZE = (176, 128)
PLUSH_SCALE = 40.0
PLUSH_ORIGIN = (88, 112)        # where the ground under its middle lands


def _fib(n):
    ga = math.pi * (3 - math.sqrt(5))
    out = []
    for i in range(n):
        y = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(1 - y * y)
        out.append((math.cos(ga * i) * r, y, math.sin(ga * i) * r))
    return np.array(out)


BODY_C, BODY_R = np.array((-0.12, 0.8, 0.0)), np.array((1.18, 0.8, 0.86))
HEAD_C, HEAD_R = np.array((0.56, 0.92, 0.0)), np.array((0.8, 0.86, 0.86))


def _on_head(d, lift=0.0):
    """The point on the head dome in direction d from its centre (plus lift outward)."""
    d = _n3(d)
    t = 1.0 / math.sqrt(((d / HEAD_R) ** 2).sum())
    return HEAD_C + d * (t + lift)


def _on_body(d, lift=0.0):
    d = _n3(d)
    t = 1.0 / math.sqrt(((d / BODY_R) ** 2).sum())
    return BODY_C + d * (t + lift)


def _tufts():
    """Where the shaggy fur grows: a mane round the back of the head, a crest
    down the spine, brows over the eyes, a frill on the cheeks."""
    rng = np.random.RandomState(5)
    out = []
    for i in range(170):                        # the mane: a collar behind the head dome
        a = rng.uniform(-1.15, 1.15) * math.pi * 0.62
        d = np.array((-0.25 + rng.uniform(-0.25, 0.2), math.cos(a), math.sin(a)))
        base = _on_head(d, -0.03)
        if base[0] > 0.45 or base[1] < 0.55:
            continue
        nrm = _n3((base - HEAD_C) / HEAD_R ** 2)
        L = rng.uniform(0.2, 0.34)
        out.append((base, _n3(nrm * 0.8 + np.array((-0.65, 0.05, 0)) + rng.normal(0, 0.12, 3)), L, 0.075))
    for i in range(70):                         # a ragged crest along the back
        x = rng.uniform(-1.05, 0.0)
        zz = rng.uniform(-0.25, 0.25)
        base = _on_body(np.array((x - BODY_C[0], 0.8, zz)), -0.03)
        nrm = _n3((base - BODY_C) / BODY_R ** 2)
        out.append((base, _n3(nrm + np.array((-0.7, 0.0, 0)) + rng.normal(0, 0.15, 3)), rng.uniform(0.12, 0.2),
                    0.065))
    for s in (-1, 1):                           # heavy brows, cheek frills
        for k in range(6):
            base = _on_head(np.array((0.62, 0.58 + 0.03 * k, (0.24 + 0.06 * k) * s)), -0.02)
            out.append((base, _n3(np.array((0.35, 0.75, (0.25 + 0.1 * k) * s)) + rng.normal(0, 0.08, 3)),
                        0.13 + 0.015 * k, 0.05))
        for k in range(7):
            base = _on_head(np.array((0.35, -0.05 - 0.07 * k, 0.9 * s)), -0.03)
            out.append((base, _n3(np.array((-0.4, -0.25, 0.9 * s)) + rng.normal(0, 0.12, 3)),
                        rng.uniform(0.12, 0.2), 0.06))
    return out


TUFTS = _tufts()


def _plush_shapes(squash=(1.0, 1.0), head=0.0, wiggle=0.0, flap=0.0, roar=0.0, fluff=0.0, damage=0,
                  lost_eye=0, eye_swing=0.0, spill=0.0, odd_eye=False):
    """The seal lying on its belly, head toward +x. squash (sx, sy) for hugs,
    head turns the front of it, wiggle sways the body, flap lifts the flippers,
    roar opens the mouth, fluff makes the fur stand up."""
    sx, sy = squash
    S = Shapes()

    def T(p):                                   # the squash, the head turning, the body swaying
        p = np.asarray(p, float)
        x, y, z = p
        z = z + wiggle * ((x + 1.3) / 2.6) ** 2 * 0.3 - wiggle * 0.12
        if x > 0.1:
            u = min(1.0, (x - 0.1) / 0.8)
            ang = head * u
            c, s_ = math.cos(ang), math.sin(ang)
            x, z = 0.1 + (x - 0.1) * c + z * s_, -(x - 0.1) * s_ + z * c
        return (x * sx, y * sy, z * sx)

    def Rr(r):
        return (r[0] * sx, r[1] * sy, r[2] * sx)
    RH = rot_y(head)
    S.ell(T(BODY_C), Rr(BODY_R), mat=SEAL)
    S.ell(T(HEAD_C), Rr(HEAD_R), rot=RH, k=0.32, mat=SEAL)
    # the face on the front of the dome
    jaw = roar * 0.2
    for s in (-1, 1):
        pad = _on_head(np.array((0.95, -0.12, 0.2 * s)), 0.0)
        S.ell(T(pad + (0, jaw * 0.25, 0)), Rr((0.19, 0.16, 0.17)), rot=RH, k=0.07, mat=BELLY)
        tb = pad + (0.04, -0.13 - jaw * 0.3, -0.06 * s)
        S.cap(T(tb), T(tb + (0.06, -0.15 - jaw * 0.6, 0.03 * s)), 0.055 * sx, 0.02 * sx, mat=FELT)
    nose = _on_head(np.array((1.0, 0.0, 0.0)), 0.13)
    S.ell(T(nose + (0, jaw * 0.25, 0)), Rr((0.07, 0.06, 0.09)), rot=RH, mat=NOSE)
    chin = _on_head(np.array((0.8, -0.5, 0.0)), -0.02)
    S.ell(T(chin + (0, -jaw * 0.7, 0)), Rr((0.2, 0.1, 0.2)), rot=RH, k=0.08, mat=BELLY)
    if roar > 0.05:
        mo = _on_head(np.array((0.9, -0.3, 0.0)), 0.05)
        S.ell(T(mo + (0, -jaw * 0.2, 0)), Rr((0.2, 0.03 + jaw * 0.7, 0.2)), rot=RH, mat=MAW, op=1)
        for k in range(-2, 3):                                      # a row of felt fangs
            tp = mo + (0.02, 0.06 + jaw * 0.15, 0.06 * k)
            S.cap(T(tp), T(tp + (0.02, -0.08, 0)), 0.026 * sx, 0.006 * sx, mat=FELT)
    for s in (-1, 1):
        if lost_eye and s == lost_eye:                              # pulled off: hanging by its thread
            ec = _on_head(np.array((0.78, 0.33, 0.44 * s)), 0.0)
            hang = ec + (0.12, -0.3 - 0.04 * math.sin(eye_swing), 0.05 * s + 0.08 * math.sin(eye_swing))
            S.cap(T(ec), T(hang), 0.012 * sx, mat=THREAD)
            S.ell(T(hang + (0, -0.05, 0)), Rr((0.06, 0.06, 0.06)), rot=RH, mat=BUTTON)
            continue
        ec = _on_head(np.array((0.78, 0.33, 0.44 * s)), 0.01)
        S.ell(T(ec), Rr((0.058, 0.062, 0.058)), rot=RH, mat=GOLD if (odd_eye and s > 0) else BUTTON)
    # little felt horns, curled back
    for s in (-1, 1):
        b = _on_head(np.array((0.15, 1.0, 0.4 * s)), -0.03)
        m1 = b + (-0.06, 0.16, 0.05 * s)
        S.cap(T(b), T(m1), 0.085 * sx, 0.06 * sx, k=0.04, mat=FELT)
        S.cap(T(m1), T(m1 + (-0.16, 0.05, 0.04 * s)), 0.06 * sx, 0.018 * sx, mat=FELT)
    # the tea-brewer's headband: a flat strip of cloth lying on the crown, knotted on the side
    u, v = np.array((0, 0, 1.0)), _n3((0.45, 0.89, 0))
    pts = [_on_head(u * math.cos(math.radians(-12 + 204 * k / 28)) + v * math.sin(math.radians(-12 + 204 * k / 28)),
                    0.02) for k in range(29)]
    for k in range(28):
        p0, p1 = pts[k], pts[k + 1]
        t = _n3(p1 - p0)
        nrm = _n3(((p0 + p1) / 2 - HEAD_C) / HEAD_R ** 2)
        nrm = _n3(nrm - t * np.dot(nrm, t))
        bn = np.cross(t, nrm)
        Rb = RH @ np.column_stack([t, nrm, bn])
        S.box(T((p0 + p1) / 2), (np.linalg.norm(p1 - p0) * 0.62 * sx, 0.022 * sy, 0.1 * sx), rot=Rb, round=0.012,
              mat=INDIGO)
    kn = _on_head(u * math.cos(math.radians(-6)) + v * math.sin(math.radians(-6)), 0.06)
    S.ell(T(kn), Rr((0.085, 0.075, 0.06)), rot=RH, mat=INDIGO)
    for k, (dx, dy, rz) in enumerate(((-0.2, -0.05, -0.4), (-0.12, -0.2, -1.1))):
        S.box(T(kn + (dx, dy - 0.06 * flap, 0.05)), Rr((0.15, 0.05, 0.014)),
              rot=RH @ rot_z(rz - 0.35 * flap * (k + 1)), round=0.012, mat=INDIGO)
    # front flippers with felt claws
    for s in (-1, 1):
        sh = np.array((0.5, 0.28, 0.66 * s))
        tip = sh + (0.02, 0.05 + 0.22 * flap, 0.42 * s)
        S.cap(T(sh), T(tip), 0.15 * sx, 0.1 * sx, k=0.12, mat=SEAL)
        S.ell(T(tip), Rr((0.2, 0.06, 0.16)), rot=RH @ rot_x(0.3 * s), k=0.05, mat=SEAL)
        for c in (-1, 0, 1):
            cp = tip + (0.13 + 0.03 * c, -0.02, 0.06 * c * s)
            S.cap(T(cp), T(cp + (0.09, -0.04, 0.02 * c * s)), 0.028 * sx, 0.008 * sx, mat=FELT)
    # hind flippers, fanned up behind
    for s in (-1, 1):
        b = np.array((-1.14, 0.62, 0.14 * s))
        tp = b + (-0.42, 0.34 + 0.14 * flap, 0.3 * s)
        S.cap(T(b), T(tp), 0.16 * sx, 0.07 * sx, k=0.12, mat=SEAL)
        S.ell(T(tp + (-0.04, 0.05, 0.0)), Rr((0.12, 0.28, 0.05)), rot=rot_z(0.6) @ rot_y(-0.5 * s), k=0.05,
              mat=SPOT)
    # stuffing bulging out of the rips (more of it when squeezed)
    rng = np.random.RandomState(31)
    for (c, nrm, r, n) in _tears(damage):
        tg = _n3(np.cross(nrm, (0, 1.0, 0)) + 1e-6)
        bt = np.cross(nrm, tg)
        for k in range(n):
            a = 2 * math.pi * k / n + rng.uniform(-0.4, 0.4)
            off = (tg * math.cos(a) + bt * math.sin(a)) * r * rng.uniform(0.15, 0.55)
            pr = r * rng.uniform(0.45, 0.62) * (1 + 0.35 * spill)
            S.ell(T(c + off + nrm * (0.03 + 0.07 * spill + rng.uniform(0, 0.04))), Rr((pr, pr * 0.85, pr)), k=0.04,
                  mat=COTTON)
        if spill > 0.3:                                             # a wisp pulled further out
            S.ell(T(c + nrm * (0.12 + 0.14 * spill) + tg * 0.05), Rr((0.06, 0.05, 0.06)), mat=COTTON)
    # the shaggy fur
    for (base, d, L, r) in TUFTS:
        L2 = L * (1 + 0.7 * fluff)
        d2 = _n3(d + np.array((0, 0.5 * fluff, 0)))
        S.cap(T(base), T(base + d2 * L2), r * sx, 0.012 * sx, k=0.02, mat=SEAL)
    return S


R['dirt'] = [(40, 32, 38), (66, 56, 56), (96, 84, 76), (128, 114, 98), (158, 144, 120)]
R['check'] = [(70, 20, 32), (120, 36, 44), (170, 62, 56), (212, 104, 78)]
DIRT, CHECK = 23, 24
MAT_RAMP.update({DIRT: 'dirt', CHECK: 'check'})
SOFT |= {DIRT, CHECK}
VARIANTS = {
    'clean':    dict(damage=0, patch=False, faded=False, dirt=0.0, mended=False),
    'worn':     dict(damage=1, patch=False, faded=True, dirt=0.15, mended=False),
    'dirty':    dict(damage=0, patch=False, faded=True, dirt=1.0, mended=False),
    'repaired': dict(damage=0, patch=True, faded=True, dirt=0.1, mended=True),
    'torn':     dict(damage=2, patch=False, faded=True, dirt=0.45, mended=False),
}


def render_plush(yaw=0.75, pitch=0.22, squash=(1.0, 1.0), head=0.0, wiggle=0.0, flap=0.0, roar=0.0, fluff=0.0,
                 bob=0.0, variant='clean', eye_swing=0.0, spill=0.0, scale=PLUSH_SCALE, size=PLUSH_SIZE,
                 origin=PLUSH_ORIGIN):
    vr = VARIANTS[variant]
    damage = vr['damage']
    lost_eye = 1 if damage >= 2 else 0
    S = _plush_shapes(squash, head, wiggle, flap, roar, fluff, damage, lost_eye, eye_swing, spill, vr['mended'])
    V = rot_x(pitch) @ rot_y(-yaw)
    w, h = size
    g = S.trace(w, h, scale, (origin[0], origin[1] - bob * scale), V, bound=2.4, steps=120)
    sx, sy = squash
    P = g['p'] / np.array((sx, sy, sx))
    Hh = np.einsum('ij,hwj->hwi', rot_y(-head), P - (0.1, 0, 0)) + (0.1, 0, 0)    # the front, unturned
    Q = np.where((P[..., 0:1] > 0.1), Hh, P)
    hit, mat = g['hit'], g['mat']
    fur = hit & (mat == SEAL)
    D = (Q - HEAD_C) / HEAD_R
    front = (Q[..., 0] > 0.75)
    # the pale belly and throat, the face a shade lighter round the muzzle
    belly = fur & ((Q[..., 1] < 0.36 - 0.1 * np.clip(Q[..., 0], 0, 1)) |
                   (front & (D[..., 1] < -0.25) & (np.abs(D[..., 2]) < 0.6)))
    mat[belly] = BELLY
    # dapples: small dark spots, crowded on the back, sparse on the face
    n1 = vnoise(Q + 11.3, 6.5) * 0.6 + vnoise(Q - 2.9, 13.0) * 0.4
    face = front & (np.abs(D[..., 2]) < 0.75) & (D[..., 1] > -0.4) & (D[..., 1] < 0.75)
    thr = 0.6 - 0.07 * np.clip(Q[..., 1] - 0.9, 0, 1) + np.where(face, 0.08, 0) + (0.05 if vr['faded'] else 0)
    spot = fur & ~belly & (n1 > thr)
    mat[spot] = SPOT
    # mended: a patch sewn over the flank where it wore through, a checked patch on the back
    pu, pv = Q[..., 0] + 0.25, Q[..., 1] - 0.95
    patch = fur & vr['patch'] & (Q[..., 2] > 0.3) & (np.abs(pu * 0.97 + pv * 0.24) < 0.21) & \
        (np.abs(-pu * 0.24 + pv * 0.97) < 0.17)
    mat[patch] = INDIGO
    cu_, cv_ = Q[..., 0] + 0.75, Q[..., 1] - 0.55
    chk = hit & vr['patch'] & np.isin(mat, [SEAL, SPOT, BELLY]) & (Q[..., 2] > 0.2) & \
        (np.abs(cu_ * 0.9 + cv_ * 0.43) < 0.19) & (np.abs(-cu_ * 0.43 + cv_ * 0.9) < 0.16)
    mat[chk] = CHECK
    # dirt: road grime soaking up from the bottom, a few tea stains with darker rims
    if vr['dirt'] > 0:
        cloth = hit & np.isin(mat, [SEAL, SPOT, BELLY, FELT, INDIGO])
        dn = vnoise(Q + 40.0, 6.0) * 0.55 + vnoise(Q - 9.0, 15.0) * 0.45
        low = np.clip((0.75 - Q[..., 1]) / 0.6, 0, 1)
        grime = cloth & (dn + low * 0.55 * vr['dirt'] > 1.02 - 0.12 * vr['dirt'])
        stains = np.zeros(hit.shape, bool)
        rs = np.random.RandomState(8)
        for k in range(int(round(5 * vr['dirt']))):
            c = _on_body(rs.normal(0, 1, 3) * (1, 0.6, 1) + (0, 0.5, 0))
            rr = rs.uniform(0.1, 0.18)
            dd = np.linalg.norm(Q - c, axis=-1) / rr * (0.9 + 0.2 * vnoise(Q, 20.0))
            stains |= cloth & (dd < 1)
        mat[grime | stains] = DIRT
        # the rips: a dark ragged hole round the stuffing, the fabric edge frayed
    rip_rim = np.zeros(hit.shape, bool)
    for (c, nrm, r, n) in _tears(damage):
        dd = np.linalg.norm(Q - c, axis=-1) / r
        rag = 0.85 + 0.3 * vnoise(Q * 1.0 + 5.0, 24.0)
        cloth = np.isin(mat, [SEAL, SPOT, BELLY, INDIGO])
        mat[hit & cloth & (dd < rag)] = HOLE
        rip_rim |= hit & cloth & (dd >= rag) & (dd < rag + 0.22)
    if lost_eye:
        ec = _on_head(np.array((0.78, 0.33, 0.44 * lost_eye)), 0.0)
        dd = np.linalg.norm(Q - ec, axis=-1) / 0.075
        mat[hit & np.isin(mat, [SEAL, SPOT]) & (dd < 0.9 + 0.3 * vnoise(Q, 30.0))] = HOLE
    # a tea leaf embroidered on the front of the headband
    band = hit & (mat == INDIGO) & ~patch
    hd = _n3((0.45, 0.89, 0))
    top = band & ((D * hd).sum(-1) > 0.75)
    lu, lv = Q[..., 2] / 0.17, (Q[..., 0] - 1.0) / 0.1
    leaf = top & (lu ** 2 + (lv / (np.sqrt(np.clip(1 - lu ** 2, 0, 1)) + 1e-3)) ** 2 < 1)
    mat[leaf] = WHITE
    g['mat'] = mat

    def idx_fn(g, idx):
        m = g['mat']
        cloth = hit & np.isin(m, [SEAL, SPOT, BELLY])
        # the seam right round its middle, behind the head, with its stitches
        sq = Q[..., 0] - 0.05 - 0.05 * Q[..., 1]
        idx[cloth & (np.abs(sq) < 0.022)] -= 2
        idx[cloth & (np.abs(sq - 0.06) < 0.02) & (np.mod(np.arctan2(Q[..., 1] - 0.84, Q[..., 2]) * 10, 1) < 0.5)] -= 1
        # fur combed back toward the tail: short dark dashes
        comb = hit & np.isin(m, [SEAL, SPOT]) & \
            (np.mod(Q[..., 0] * 11 + np.sin(Q[..., 2] * 13 + Q[..., 1] * 7) * 0.7, 1) < 0.1) & (vnoise(Q, 17.0) > 0.52)
        idx[comb] -= 1
        # lids: a darker ring round each eye
        for s_ in (-1, 1):
            ec = _on_head(np.array((0.78, 0.33, 0.44 * s_)), 0.0)
            dd = np.linalg.norm((Q - ec) / (1, 1.1, 1), axis=-1)
            idx[hit & np.isin(m, [SEAL, SPOT]) & (dd < 0.1)] -= 2
        # the patch's cross-stitch, the headband's woven stripe
        idx[patch & ((np.mod((pu + pv) * 28, 1) < 0.16) | (np.mod((pu - pv) * 28, 1) < 0.16))] = 3
        edge = patch & ~((np.abs(pu * 0.97 + pv * 0.24) < 0.17) & (np.abs(-pu * 0.24 + pv * 0.97) < 0.13))
        idx[edge & (np.mod((pu + pv) * 22, 1) < 0.5)] = 0
        idx[(m == CHECK) & ((np.mod(cu_ * 14, 1) < 0.3) ^ (np.mod(cv_ * 14, 1) < 0.3))] -= 1
        cedge = chk & ~((np.abs(cu_ * 0.9 + cv_ * 0.43) < 0.16) & (np.abs(-cu_ * 0.43 + cv_ * 0.9) < 0.13))
        idx[cedge & (np.mod((cu_ - cv_) * 22, 1) < 0.5)] = 0
        if vr['mended']:                                           # a darned seam on the side of the head
            dc = _on_head(np.array((-0.1, 0.25, 1.0)))
            dv = Q - dc
            along = np.abs(dv[..., 1] - 0.3 * dv[..., 0])
            xs = hit & np.isin(m, [SEAL, SPOT]) & (np.linalg.norm(dv, axis=-1) < 0.2) & (along < 0.022)
            idx[xs] = 0
            ticks = hit & np.isin(m, [SEAL, SPOT]) & (np.linalg.norm(dv, axis=-1) < 0.18) & (along < 0.07) & \
                (np.abs(np.mod(dv[..., 0] * 14, 1) - 0.5) < 0.12)
            idx[ticks] = 0
        if vr['faded']:                                            # matted fur: more combed clumps
            mt = hit & np.isin(m, [SEAL, SPOT]) & (np.mod(Q[..., 0] * 7 - Q[..., 1] * 3, 1) < 0.1) & (vnoise(Q, 9.0) > 0.5)
            idx[mt] -= 1
        idx[band & ~top & (np.mod((D * hd).sum(-1) * 14, 1) < 0.15)] = 3
        idx[rip_rim] += 1                                           # the frayed, lighter edge of each rip
        idx[rip_rim & (vnoise(Q, 40.0) > 0.7)] -= 3                 # loose threads

    rgba = style(g, idx_fn, fuzz=0.15, lift={BELLY: 0.25, FELT: 0.3, WHITE: 0.4, COTTON: 0.5})
    # whisker spots on the pads, the stitched mouth
    F = hit & (g['mat'] == BELLY) & front
    for s_ in (-1, 1):
        pad = _on_head(np.array((0.95, -0.12, 0.2 * s_)), 0.0)
        for (dy, dz) in ((0.06, 0.02), (0.0, 0.08), (0.07, 0.11), (-0.04, 0.14)):
            d = (np.abs(Q[..., 1] - pad[1] - dy) < 0.022) & (np.abs(Q[..., 2] - pad[2] - s_ * dz) < 0.022)
            rgba[F & d, :3] = R['spot'][2]
    if roar < 0.05:
        mline = F & (np.abs(Q[..., 1] - (0.66 + 1.2 * Q[..., 2] ** 2)) < 0.022) & (np.abs(Q[..., 2]) < 0.22)
        rgba[mline, :3] = R['thread'][0]
    keep = np.isin(g['mat'], [BUTTON, NOSE, FELT, MAW, THREAD])
    rgba = outline(rgba, g, inner=0.07 * scale)
    rgba = _whiskers(rgba, g, V, Q, scale, origin, bob, head, squash)
    return tidy(rgba, keep=keep)


def _whiskers(rgba, g, V, Q, scale, origin, bob, head, squash):
    sx, sy = squash
    h, w = rgba.shape[:2]
    oy = origin[1] - bob * scale

    def proj(p):
        p = np.asarray(p, float)
        if p[0] > 0.1:
            p = rot_y(head) @ (p - (0.1, 0, 0)) + (0.1, 0, 0)
        p = p * (sx, sy, sx)
        v = V @ p
        return origin[0] + v[0] * scale, oy - v[1] * scale, v[2]
    out = rgba
    for s in (-1, 1):
        pad = _on_head(np.array((0.95, -0.12, 0.2 * s)), 0.12)
        for k, (ang, ln) in enumerate(((0.22, 0.42), (0.02, 0.5), (-0.2, 0.42))):
            a = proj(pad + (0, 0.04 - 0.04 * k, 0.04 * s))
            b = proj(pad + (0.12, ang * 0.7, ln * s))
            n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
            for i in range(1, n + 1):
                u = i / n
                x = int(round(a[0] + (b[0] - a[0]) * u))
                y = int(round(a[1] + (b[1] - a[1]) * u + 1.5 * u * u))
                if not (0 <= x < w and 0 <= y < h):
                    continue
                zz = a[2] + (b[2] - a[2]) * u
                if out[y, x, 3] and g['z'][y, x] > zz * scale + 2 and g['hit'][y, x]:
                    continue                                   # behind the head
                if u < 0.85 or (x + y) % 2:
                    out[y, x, :3] = R['belly'][3] if u < 0.6 else R['belly'][2]
                    out[y, x, 3] = 255
    return out


# ---------------------------------------------------------------- the omamori charm
CHARM_SIZE = (96, 148)
CHARM_SCALE = 38.0
CHARM_ORIGIN = (46, 14)         # the top of the hanging loop


def _charm_shapes(swing=0.0, bell=0.0, flutter=0.0, twine=False):
    """Hung from the top of its loop (the origin); `swing` turns it about there."""
    S = Shapes()
    Rs = rot_z(swing)

    def T(p):
        return tuple(Rs @ np.asarray(p, float))
    # the hanging loop and the knot
    for k in range(14):
        a0, a1 = 2 * math.pi * k / 14, 2 * math.pi * (k + 1) / 14
        p0 = (0.22 * math.sin(a0), -0.24 - 0.22 * math.cos(a0), 0.02 * math.sin(a0 * 2))
        p1 = (0.22 * math.sin(a1), -0.24 - 0.22 * math.cos(a1), 0.02 * math.sin(a1 * 2))
        S.cap(T(p0), T(p1), 0.04, mat=FELT if twine else CORD)
    for s in (-1, 1):                                              # the knot's two loops
        for k in range(10):
            a0, a1 = 2 * math.pi * k / 10, 2 * math.pi * (k + 1) / 10
            c = np.array((0.17 * s, -0.62, 0.0))
            p0 = c + (0.13 * math.cos(a0), 0.09 * math.sin(a0), 0.03 * math.sin(a0))
            p1 = c + (0.13 * math.cos(a1), 0.09 * math.sin(a1), 0.03 * math.sin(a1))
            S.cap(T(p0), T(p1), 0.042, mat=CORD)
    S.ell(T((0, -0.62, 0.01)), (0.09, 0.09, 0.07), mat=CORD)
    S.cap(T((0, -0.68, 0)), T((0, -0.82, 0)), 0.05, mat=CORD)
    # the pouch: flat, its top drawn in like a little roof
    top = -0.82
    S.box(T((0, top - 0.86, 0)), (0.42, 0.72, 0.075), rot=Rs, round=0.06, mat=SILK)
    S.ell(T((0, top - 0.2, 0)), (0.42, 0.2, 0.075), rot=Rs, k=0.05, mat=SILK)
    # the bell on its own cord, swinging a little later than the charm
    bp = np.array((0.2, -0.66, 0.08))
    ba = 0.55 - swing * 0.7 + bell
    bc = bp + np.array((0.6 * math.sin(ba), -0.6 * math.cos(ba), 0.12))
    S.cap(T(bp), T(bc + (0, 0.13, 0)), 0.026, mat=CORD)
    S.ell(T(bc), (0.15, 0.15, 0.15), mat=GOLD)
    S.box(T(bc + (0, -0.07, 0.09)), (0.12, 0.016, 0.1), rot=Rs, mat=GOLD, op=1)    # the bell's slit
    S.ell(T(bc + (0, 0.15, 0)), (0.05, 0.035, 0.05), mat=GOLD)
    # a tassel at the bottom, swinging a beat behind
    bt = np.array((0, top - 1.62, 0.0))
    S.ell(T(bt), (0.1, 0.08, 0.08), mat=CORD)
    S.cap(T(bt + (0, 0.05, 0)), T(bt + (0, -0.08, 0)), 0.07, 0.085, mat=CORD)
    for k in range(7):
        a = (k - 3) * 0.09 + flutter * 0.5 - swing * 0.4
        S.cap(T(bt + (0, -0.08, 0)), T(bt + (math.sin(a) * 0.42, -0.08 - math.cos(a) * 0.44, (k - 3) * 0.015)),
              0.04, 0.026, mat=CORD)
    return S, dict(Rs=Rs, top=top)


R['tarnish'] = [(52, 40, 30), (88, 70, 44), (126, 104, 60), (168, 146, 92), (204, 186, 128)]
R['silkfade'] = [(62, 22, 40), (96, 34, 50), (132, 54, 60), (164, 80, 74), (192, 114, 96)]
TARNISH, SILKFADE = 25, 26
MAT_RAMP.update({TARNISH: 'tarnish', SILKFADE: 'silkfade'})
SOFT |= {SILKFADE}
GLOSS |= {TARNISH}
CHARM_VARIANTS = {
    'clean':    dict(faded=False, fray=0.0, dirt=0.0, mended=False),
    'worn':     dict(faded=True, fray=1.0, dirt=0.2, mended=False),
    'dirty':    dict(faded=True, fray=0.4, dirt=1.0, mended=False),
    'repaired': dict(faded=True, fray=0.3, dirt=0.15, mended=True),
}


def render_charm(yaw=0.4, pitch=0.12, swing=0.0, bell=0.0, flutter=0.0, variant='clean', scale=CHARM_SCALE,
                 size=CHARM_SIZE, origin=CHARM_ORIGIN):
    vr = CHARM_VARIANTS[variant]
    S, rig = _charm_shapes(swing, bell, flutter, vr['mended'])
    V = rot_x(pitch) @ rot_y(-yaw)
    w, h = size
    g = S.trace(w, h, scale, origin, V, bound=3.2, steps=120)
    Q = np.einsum('ij,hwj->hwi', rig['Rs'].T, g['p'])
    top = rig['top']
    hit, mat = g['hit'], g['mat']
    pouch = hit & (mat == SILK)
    front = pouch & (Q[..., 2] > 0.03)
    back = pouch & (Q[..., 2] < -0.03)
    px, py = Q[..., 0], Q[..., 1] - (top - 0.8)                  # pouch face coordinates, centre at 0
    fray = vr['fray'] * (vnoise(Q, 26.0) > 0.55)                  # worn: the gold border rubbed through in places
    edge = pouch & ((np.abs(px) > 0.31) | (py < -0.66) | (py > 0.6 - 0.25 * (np.abs(px) / 0.42) ** 2)) & \
        ((np.abs(px) < 0.37) & (py > -0.72)) & ~(fray > 0)
    mat[edge] = GOLD
    cr = np.hypot(px, (py - 0.1) * 1.05)
    ring = front & (np.abs(cr - 0.21) < 0.03)
    cup = front & (np.abs(px) < 0.1 - 0.04 * ((py - 0.06) / 0.08)) & (py < 0.12) & (py > -0.02)
    steam = front & (np.abs(px - 0.03 * np.sin(py * 40)) < 0.018) & (py > 0.15) & (py < 0.26)
    handle = front & (np.abs(np.hypot(px - 0.11, py - 0.06) - 0.04) < 0.016) & (px > 0.1)
    mat[ring | cup | steam | handle] = GOLD
    for k, yv in enumerate((-0.2, -0.32, -0.44)):
        ln = front & (np.abs(py - yv) < 0.022) & (np.abs(px) < 0.2) & (np.mod(px * 18 + k * 0.4, 1) < 0.62)
        mat[ln] = GOLD
    wav = back & ~edge
    sw = np.mod(py * 8.5, 1.0)
    rr = np.hypot(np.mod(px * 6 + np.floor(py * 8.5) * 0.5, 1) - 0.5, sw * 0.7)
    mat[wav & (np.abs(rr - 0.38) < 0.06)] = GOLD
    # repaired: a corner patched in indigo with big stitches
    patch = pouch & vr['mended'] & (px < -0.08) & (py < -0.38) & (px - py * 0.3 < 0.05)
    mat[patch] = INDIGO
    if vr['faded']:
        mat[pouch & (mat == SILK)] = SILKFADE
        bellm = hit & (mat == GOLD) & ~pouch
        mat[bellm] = TARNISH
    if vr['dirt'] > 0:
        dn = vnoise(Q + 4.0, 7.0) * 0.6 + vnoise(Q, 16.0) * 0.4
        low = np.clip((-(py) - 0.2) / 0.6, 0, 1) * pouch
        mat[pouch & (dn + low * 0.5 * vr['dirt'] > 1.0 - 0.15 * vr['dirt'])] = DIRT
    g['mat'] = mat

    def idx_fn(g, idx):
        m = g['mat']
        silk = np.isin(m, [SILK, SILKFADE])
        idx[silk & (np.mod(px * 22 + py * 22, 1) < 0.18)] -= 1         # the brocade's twill
        gold = (m == GOLD) & pouch
        idx[gold & (np.mod(px * 40, 1) < 0.35)] -= 1                  # gold thread, stitch by stitch
        cord = np.isin(m, [CORD, FELT]) & ~pouch
        idx[cord & (np.mod((Q[..., 0] + Q[..., 1]) * 30, 1) < 0.35)] -= 1
        if vr['mended']:
            pe = patch & ((px > -0.12) | (py > -0.42))
            idx[pe & (np.mod((px + py) * 30, 1) < 0.5)] = 0
            idx[patch & (np.mod((px - py) * 26, 1) < 0.15)] = 3
        if vr['fray']:
            fz = pouch & (fray > 0) & ((np.abs(px) > 0.36) | (py < -0.68))
            idx[fz] += 1

    rgba = style(g, idx_fn, fuzz=0.06, lift={GOLD: 0.2})
    rgba = outline(rgba, g, inner=0.05 * scale)
    keep = np.isin(g['mat'], [GOLD, TARNISH]) & ~pouch
    return tidy(rgba, keep=keep)


if __name__ == '__main__':
    import sys
    from PIL import Image
    which = sys.argv[2] if len(sys.argv) > 2 else 'plush'
    if which == 'plush':
        frs = [render_plush(variant=v) for v in VARIANTS]
    else:
        frs = [render_charm(variant=v) for v in CHARM_VARIANTS] + [render_charm(yaw=3.3)]
    sheet = np.concatenate(frs, 1)
    bg = np.zeros(sheet.shape[:2] + (3,), np.uint8)
    bg[:] = (232, 224, 206)
    m = sheet[..., 3:4] / 255.0
    img = (sheet[..., :3] * m + bg * (1 - m)).astype(np.uint8)
    Image.fromarray(img).resize((img.shape[1] * 4, img.shape[0] * 4), Image.NEAREST).save(sys.argv[1])
