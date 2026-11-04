"""The copper animals of the Copper Sky room, sculpted (cy_sdf) and drawn as
pixel art, one sprite per frame:

  puffer   a pufferfish blimp: a riveted copper hull gone green in the rain,
           big glass eyes, a beak, propeller pectoral fins, a rudder tail, a
           gondola slung under it with lit windows and a searchlight, and a
           band of lit portholes round its belly. Every so often it puffs up - the spines
           stand out - and slowly lets the air out again.
  spider   a copper automaton spider hanging from the rafters on its cable,
           eight jointed legs that slowly curl and open, a cluster of eyes,
           a furnace glowing through the slits of its abdomen. It bobs on the cable and turns.
  koi      a koi airship gliding through the far sky, its body rippling.

Lighting is the night city's: cold moonlight from the upper left, the
warm haze of the city's lamps from below, a pale rim of sky on the edges. Each material
has its own ramp, the light is cut into bands with a little ordered dither,
and every sprite gets the pack's selective outline."""
import math
import numpy as np
import cy_pal  # noqa: F401  (registers the city ramps)
from pixel import Canvas, PAL
from cy_sdf import Shapes, rot_x, rot_y, rot_z

BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47

# materials
CU, PATINA, STEEL, LENS, RIM, SCREEN, WINDOW, LAMP, BRASS, CORE, DARK, THREAD = range(1, 13)
EMISSIVE = {LENS, SCREEN, WINDOW, LAMP, CORE}

RAMP = {CU: 'cu', PATINA: 'verd', STEEL: 'steel', RIM: 'gold', BRASS: 'gold', DARK: 'cu', THREAD: 'steel'}


def _names(r):
    from pixel import RAMPS
    return [f'{r}{i}' for i in range(len(RAMPS[r]))]


def _n3(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


KEY = _n3((-0.55, 0.62, 0.56))          # moonlight, upper left, toward us
UNDER = _n3((0.25, -1.0, 0.35))         # the city's glow from below
RIMV = _n3((-0.9, 0.15, -0.35))         # sky light from behind on the left


def light(g, look, mats=None, paint=None, emit=None):
    """Style the traced buffers: returns an RGBA array.
    look: 'amb', 'key', 'under' light strengths; optional 'haze' (0..1 toward
          'haze_col', snapped to 'haze_ramps') and 'rim_col'
    mats(g)              re-assigns materials first (patina, belly plates, screens)
    paint(g, idx)        nudges the ramp indices (seams, rivets, markings)
    emit(g) -> {mat: (ramp names, index array)} for the things that glow."""
    if mats is not None:
        mats(g)
    h, w = g['hit'].shape
    hit, n, mat, ao = g['hit'], g['n'], g['mat'], g['ao']
    yy, xx = np.mgrid[0:h, 0:w]
    keyv, underv, rimv = look.get('keyv', KEY), look.get('underv', UNDER), look.get('rimv', RIMV)
    nk = np.clip((n * keyv).sum(-1), 0, 1)
    nu = np.clip((n * underv).sum(-1), 0, 1)
    nr = np.clip((n * rimv).sum(-1), 0, 1)
    half = _n3(keyv + np.array([0, 0, 1.0]))
    sp = np.clip((n * half).sum(-1), 0, 1) ** 40
    v = look['amb'] + look['key'] * nk + look['under'] * nu * 0.45
    v = v * (0.5 + 0.5 * ao)
    v = v + BAYER[yy % 4, xx % 4] * 0.1
    out = np.zeros((h, w, 4), np.uint8)
    ramp_of = {}
    idx = np.zeros((h, w), int)
    for m, r in RAMP.items():
        sel = hit & (mat == m)
        if not sel.any():
            continue
        names = _names(r)
        k = len(names)
        i = np.clip((v * (k - 0.6) + look.get('lift', {}).get(m, 0)).astype(int), 0, k - 1)
        if m == DARK:
            i = np.clip(i - 2, 0, k - 1)
        idx[sel] = i[sel]
        ramp_of[m] = names
    if paint is not None:
        paint(g, idx)
    for m, names in ramp_of.items():
        sel = hit & (mat == m)
        pal = np.array([PAL[nm] for nm in names], np.uint8)
        out[sel, :3] = pal[np.clip(idx, 0, len(names) - 1)[sel]]
        out[sel, 3] = 255
        if m in (CU, BRASS, RIM, STEEL):                    # specular glint
            gl = sel & (sp > 0.5)
            out[gl, :3] = PAL[names[-1]]
    # the city glow under the belly: a band of pink-orange along the lowest curve
    metal = np.isin(mat, [CU, PATINA, BRASS, STEEL, RIM])
    under = hit & (nu > 0.8) & (n[..., 1] < -0.55) & metal & (mat != RIM) & (nk < 0.15) & (look['under'] > 0)
    pal = np.array([PAL[nm] for nm in _names(look.get('under_ramp', 'glow'))], np.uint8)
    gi = np.clip(((nu - 0.8) * 10 * look['under'] + BAYER[yy % 4, xx % 4] * 0.9).astype(int), 0, 2)
    out[under, :3] = pal[gi[under]]
    # the pale rim of sky on the edge facing back-left
    rim = hit & (nr > look.get('rim_t', 0.66)) & (n[..., 2] < 0.4) & metal
    out[rim, :3] = PAL[look.get('rim_col', 'haze2')]
    if emit is not None:
        for m, (names, ii) in emit(g).items():
            sel = hit & (mat == m)
            pal = np.array([PAL[nm] for nm in names], np.uint8)
            out[sel, :3] = pal[np.clip(ii, 0, len(names) - 1)[sel]]
            out[sel, 3] = 255
    if look.get('haze', 0) > 0:                              # far away: sink toward the sky
        a = look['haze']
        hc = np.array(look['haze_col'], float)
        mix = out[..., :3].astype(float) * (1 - a) + hc * a
        out[..., :3] = np.where(hit[..., None], _quant_to(mix, look['haze_ramps'], xx, yy), out[..., :3])
    return out


def _quant_to(rgb, ramps, xx, yy):
    names = [nm for r in ramps for nm in _names(r)]
    pal = np.array([PAL[nm] for nm in names], float)
    rgb = rgb + BAYER[yy % 4, xx % 4][..., None] * 10
    d = ((rgb[..., None, :] - pal[None, None]) ** 2).sum(-1)
    return pal[d.argmin(-1)].astype(np.uint8)


def outline(rgba, z=None, ink='ink', inner_step=0.6, lit_dark=None):
    """The pack's outline: a dark line round the silhouette (a darker shade of
    the colour inside on the lit upper-left, ink elsewhere), and a line where a
    nearer part crosses a farther one."""
    a = rgba
    h, w = a.shape[:2]
    m = a[..., 3] > 0
    p = np.pad(m, 1)
    edge_out = ~m & (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])
    out = a.copy()
    ink_c = PAL[ink]
    ys, xs = np.nonzero(edge_out)
    for y, x in zip(ys, xs):
        out[y, x, :3] = ink_c
        out[y, x, 3] = 255
    if z is not None:
        zz = np.where(m, z, -1e9)
        zp = np.pad(zz, 1, constant_values=-1e9)
        # a pixel on the far side of a depth break gets a line
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nb = zp[1 + dy:h + 1 + dy, 1 + dx:w + 1 + dx]
            brk = m & (nb > zz + inner_step) & (nb > -1e8)
            out[brk, :3] = (out[brk, :3].astype(int) * 0.45).astype(np.uint8)
    return out


def to_canvas(a):
    cv = Canvas(a.shape[1], a.shape[0])
    cv.a = a
    return cv


def lens_index(g):
    """Glass eyes: a bright cyan ring, a dark iris in the middle, a glint at the upper left."""
    n = g['n']
    face = np.clip(n[..., 2], 0, 1)
    i = np.where(face > 0.93, 1, np.where(face > 0.8, 2, 4))
    glint = (n[..., 0] < -0.15) & (n[..., 1] > 0.2) & (face > 0.75)
    return np.where(glint, 5, i)


# ---------------------------------------------------------------- the pufferfish blimp
PUFFER_N = 96
PUFFER_SIZE = (156, 132)
PUFFER_SCALE = 27.0
PUFFER_ORIGIN = (80, 58)


def _fib(n):
    pts = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        y = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(1 - y * y)
        a = ga * i
        pts.append((math.cos(a) * r, y, math.sin(a) * r))
    return np.array(pts)


SPINES = _fib(110)


def puff_amount(f, n=PUFFER_N):
    """0 = let down, 1 = puffed. Rests, puffs up fast, holds, lets the air out slowly."""
    u = (f % n) / n
    if u < 0.30:
        return 0.0
    if u < 0.38:
        s = (u - 0.30) / 0.08
        return 1 - (1 - s) ** 3 + 0.08 * math.sin(s * math.pi)      # a little overshoot
    if u < 0.58:
        return 1.0 + 0.03 * math.sin((u - 0.38) * 40)
    if u < 0.95:
        s = (u - 0.58) / 0.37
        return 1 - (s * s * (3 - 2 * s))
    return 0.0


def _puffer_shapes(f, n=PUFFER_N):
    t = f / n
    p = puff_amount(f, n)
    S = Shapes()
    rx = 1.22 - 0.12 * p
    ry = 0.86 + 0.18 * p
    rz = 0.9 + 0.15 * p
    S.ell((0, 0, 0), (rx, ry, rz), mat=CU)
    # a blunt snout, a brass beak, and the mouth cut across it
    S.ell((rx * 0.86, -0.18, 0), (0.3, 0.24, 0.3), k=0.14, mat=CU)
    S.ell((rx * 0.86 + 0.24, -0.2, 0), (0.17, 0.17, 0.21), k=0.05, mat=BRASS)
    S.cut('ell', (rx * 0.86 + 0.4, -0.21, 0), (0.14, 0.035, 0.24), k=0.02, mat=DARK)
    # eyes: brass rims standing out of the hull, glass lenses in them, blinking now and then
    blink = 1.0
    bu = (t * 3.0) % 1.0
    if 0.62 < bu < 0.66:
        blink = 0.12
    for s in (-1, 1):
        c = np.array((rx * 0.52, ry * 0.4, s * rz * 0.72))
        nrm = c / np.array((rx, ry, rz)) ** 2
        nrm /= np.linalg.norm(nrm)
        S.ell(tuple(c), (0.29, 0.29, 0.29), k=0.06, mat=RIM)
        S.ell(tuple(c + nrm * 0.11), (0.21, 0.21 * blink, 0.21), mat=LENS)
    # ducted propellers for pectoral fins: a brass ring on a stub, three blades turning in it
    spin = t * 2 * math.pi * 6
    for s in (-1, 1):
        base = np.array((0.02, -0.14, s * rz * 0.94))
        hub = base + np.array((0, 0, s * 0.26))
        S.cap(tuple(base), tuple(hub), 0.09, 0.07, k=0.05, mat=STEEL)
        S.ell(tuple(hub), (0.07, 0.07, 0.07), mat=BRASS)
        nseg = 14
        for k in range(nseg):
            a0, a1 = 2 * math.pi * k / nseg, 2 * math.pi * (k + 1) / nseg
            p0 = hub + np.array((math.cos(a0) * 0.3, math.sin(a0) * 0.3, 0))
            p1 = hub + np.array((math.cos(a1) * 0.3, math.sin(a1) * 0.3, 0))
            S.cap(tuple(p0), tuple(p1), 0.045, mat=BRASS)
        for bl in range(3):
            a = spin * s + bl * 2 * math.pi / 3
            R = rot_z(a)
            off = R @ np.array((0, 0.14, 0))
            S.box(tuple(hub + off), (0.06, 0.13, 0.012), rot=R @ rot_y(0.55 * s), round=0.012, mat=CU)
    # dorsal and anal fins, set back
    S.ell((-rx * 0.62, ry * 0.86, 0), (0.3, 0.2, 0.035), rot=rot_z(-0.45), k=0.06, mat=CU)
    S.ell((-rx * 0.62, -ry * 0.86, 0), (0.28, 0.18, 0.035), rot=rot_z(0.45), k=0.06, mat=CU)
    # the tail: a rounded rudder fan on a short peduncle, swinging
    sway = 0.35 * math.sin(t * 2 * math.pi * 3)
    tb = np.array((-rx * 0.96, 0.02, 0))
    S.cap(tuple(tb), tuple(tb + np.array((-0.34, 0, 0))), 0.2, 0.11, k=0.08, mat=CU)
    Rt = rot_y(-sway)
    S.ell(tuple(tb + Rt @ np.array((-0.66, 0, 0))), (0.34, 0.48, 0.035), rot=Rt, k=0.06, mat=CU)
    for k in (-1, 0, 1):                                     # ribs of the fan
        tip = tb + Rt @ np.array((-0.95, 0.38 * k, 0))
        S.cap(tuple(tb + np.array((-0.3, 0, 0))), tuple(tip), 0.035, 0.02, mat=BRASS)
    # spines: lying back along the hull when let down, standing out when puffed
    for q in SPINES:
        e = q * np.array((rx, ry, rz))
        nn = q / np.array((rx, ry, rz))
        nn /= np.linalg.norm(nn)
        if q[0] > 0.5 and abs(q[1]) < 0.8:                   # keep the face clear
            continue
        if abs(q[2]) > 0.75 and abs(q[1]) < 0.5 and q[0] > -0.35:   # and the propellers
            continue
        if q[1] < -0.35 and abs(q[0]) < 0.6:                 # and where the gondola hangs
            continue
        back = _n3(nn * 0.25 + np.array((-1.0, 0, 0)))
        d = _n3(nn * (0.2 + 0.8 * p) + back * (1 - p) * 0.9)
        L = 0.12 + 0.3 * p
        base = e - nn * 0.05
        S.cap(tuple(base), tuple(base + d * L), 0.075, 0.014, mat=CU)
    # the gondola under it on four struts, with a searchlight at the nose
    gy = -ry - 0.5
    S.box((0.05, gy, 0), (0.46, 0.13, 0.2), round=0.08, mat=STEEL)
    S.box((0.05, gy + 0.12, 0), (0.5, 0.03, 0.23), round=0.02, mat=BRASS)
    S.box((0.05, gy - 0.12, 0), (0.42, 0.025, 0.18), round=0.02, mat=BRASS)
    for sx in (-0.3, 0.38):
        for sz in (-0.14, 0.14):
            S.cap((sx, gy + 0.1, sz), (sx * 0.8, -ry * 0.7, sz * 2.4), 0.025, mat=STEEL)
    S.ell((0.52, gy - 0.04, 0), (0.08, 0.08, 0.08), mat=LAMP)
    return S, p, (rx, ry, rz)


def puffer_frames(n=PUFFER_N, yaw0=-0.85):
    """n RGBA frames (h, w, 4) of the pufferfish blimp, and per frame the
    pixel its searchlight shines from (for the light cone)."""
    w, h = PUFFER_SIZE
    frames, lamps = [], []
    for f in range(n):
        t = f / n
        S, p, (rx, ry, rz) = _puffer_shapes(f, n)
        yaw = yaw0 + 0.12 * math.sin(2 * math.pi * t)
        pitch = 0.2 + 0.03 * math.sin(2 * math.pi * t * 2 + 1)
        roll = 0.04 * math.sin(2 * math.pi * t + 0.6)
        V = rot_x(pitch) @ rot_z(roll) @ rot_y(yaw)
        bob = 1.6 * math.sin(2 * math.pi * t)
        org = (PUFFER_ORIGIN[0], PUFFER_ORIGIN[1] + bob)
        g = S.trace(w, h, PUFFER_SCALE, org, V, bound=2.6)
        gy = -ry - 0.5

        def mats(g, rx=rx, ry=ry, rz=rz):
            P, hit, mat = g['p'], g['hit'], g['mat']
            q = P / np.array((rx, ry, rz))
            lon = np.arctan2(q[..., 2], q[..., 0])
            hull = hit & (mat == CU) & (np.linalg.norm(q, axis=-1) < 1.08)
            g['q'], g['lon'], g['hull'] = q, lon, hull
            # verdigris: running down from the seams on top, pooled in the saddles
            nz = np.sin(P[..., 0] * 9.1 + P[..., 2] * 3.3) * np.sin(P[..., 1] * 11.7 - P[..., 0] * 4.1) + \
                0.6 * np.sin(P[..., 2] * 17 + P[..., 1] * 5) + 0.4 * np.sin(P[..., 0] * 23 - P[..., 1] * 31)
            drip = np.sin(lon * 23) > 0.55
            pat = hull & ((nz > 1.15 - 0.45 * np.clip(q[..., 1], 0, 1)) | (drip & (nz > 0.55) & (q[..., 1] > 0.0)))
            mat[pat] = PATINA
            # the belly: pale brass plates; a screen running round it
            mat[hull & (q[..., 1] < -0.62) & ~pat] = BRASS
            mat[hull & (q[..., 1] > -0.5) & (q[..., 1] < -0.2) & (np.abs(lon) < 2.5)] = SCREEN

        def paint(g, idx):
            hit, mat = g['hit'], g['mat']
            q, lon = g['q'], g['lon']
            lat = np.arcsin(np.clip(q[..., 1] / np.maximum(np.linalg.norm(q, axis=-1), 1e-6), -1, 1))
            hull = hit & np.isin(mat, [CU, PATINA, BRASS]) & (np.linalg.norm(q, axis=-1) < 1.08)
            seam_lon = np.abs(((lon / (2 * math.pi) * 14) % 1) - 0.5) > 0.45
            seam_lat = np.abs(((lat / math.pi * 7 + 0.5) % 1) - 0.5) > 0.44
            idx[hull & (seam_lon | seam_lat)] -= 1
            rv = hull & seam_lat & (((lon / (2 * math.pi) * 60) % 1) < 0.3)
            idx[rv] += 2
            sad = hull & (mat == CU) & (q[..., 1] > 0.1) & (np.sin(lon * 5 + 1.3) * np.cos(lat * 3) > 0.5)
            idx[sad] -= 1

        def emit(g, t=t, rx=rx, ry=ry, rz=rz):
            P = g['p']
            lon = np.arctan2(P[..., 2] / rz, P[..., 0] / rx)
            # a band of riveted plate with round portholes, lamplit inside, one or two dark
            u = (lon / (2 * math.pi) + 0.5) * 26
            cu_ = (u % 1) - 0.5
            vv = (P[..., 1] / ry + 0.35) / 0.15
            hole = cu_ ** 2 + (vv * 0.42) ** 2 < 0.09
            lit = (np.floor(u).astype(int) * 7 + 3) % 9 != 0
            flick = (np.floor(u).astype(int) * 5 + int(t * 12)) % 23 == 0
            ring = (cu_ ** 2 + (vv * 0.42) ** 2 < 0.16) & ~hole
            scr = np.where(hole & lit & ~flick, 3, np.where(hole, 0, np.where(ring, 5, 2)))
            scr = np.where(hole & lit & ~flick & (cu_ < -0.12) & (vv > 0.1), 4, scr)
            band_names = ['amber0', 'amber1', 'cu2', 'amber3', 'amber4', 'gold3']
            lens_i = lens_index(g)
            return {SCREEN: (band_names, scr), LENS: (_names('haze'), lens_i),
                    LAMP: (['paper4'], np.zeros_like(scr))}

        look = dict(amb=0.16, key=0.74, under=0.55, lift={BRASS: 0.4}, under_ramp='glow')
        rgba = light(g, look, mats=mats, paint=paint, emit=emit)
        P = g['p']                                           # amber windows along the gondola
        win = g['hit'] & (g['mat'] == STEEL) & (np.abs(P[..., 1] - gy) < 0.06) & \
            (np.floor((P[..., 0] + 0.62) / 0.15) % 2 == 0) & (np.abs(P[..., 0] - 0.05) < 0.36)
        rgba[win, :3] = PAL['amber3']
        rgba = outline(rgba, g['z'] * PUFFER_SCALE, inner_step=2.5)
        frames.append(rgba)
        vp_ = V @ np.array((0.52, gy - 0.04, 0))
        lamps.append((org[0] + vp_[0] * PUFFER_SCALE, org[1] - vp_[1] * PUFFER_SCALE))
    return frames, lamps



# ---------------------------------------------------------------- the copper spider
SPIDER_N = 96
SPIDER_SIZE = (120, 100)
SPIDER_SCALE = 25.0
SPIDER_ORIGIN = (60, 52)
# leg roots round the head-body: angle from straight ahead (+z) toward the side
LEG_AZ = (0.42, 0.95, 1.6, 2.25)


def _leg(S, base, az, s, curl, lift, i):
    out = np.array((s * math.sin(az), 0.0, math.cos(az)))
    up = np.array((0, 1.0, 0))
    reach = 1.0 - 0.38 * curl
    knee = base + out * 0.42 * reach + up * (0.5 + 0.1 * lift)
    ankle = knee + out * (0.62 * reach) - up * (0.2 + 0.25 * curl)
    tip = ankle + out * (0.22 * reach - 0.18 * curl) - up * (0.62 - 0.1 * lift) + np.array((0, 0, -0.12 * curl * math.cos(az)))
    S.cap(tuple(base), tuple(knee), 0.075, 0.06, k=0.03, mat=CU)
    S.cap(tuple(knee), tuple(ankle), 0.058, 0.042, mat=CU)
    S.cap(tuple(ankle), tuple(tip), 0.042, 0.014, mat=DARK)
    S.ell(tuple(knee), (0.072, 0.072, 0.072), mat=BRASS)
    S.ell(tuple(ankle), (0.05, 0.05, 0.05), mat=BRASS)
    S.ell(tuple(base), (0.08, 0.08, 0.08), mat=STEEL)


def _spider_shapes(f, n=SPIDER_N):
    t = f / n
    S = Shapes()
    S.ell((0, 0.02, 0.3), (0.4, 0.28, 0.46), mat=CU)                      # head-body
    S.ell((0, 0.12, 0.56), (0.28, 0.2, 0.22), k=0.08, mat=CU)
    S.cap((0, 0.04, 0.0), (0, 0.1, -0.2), 0.12, k=0.06, mat=STEEL)       # waist
    S.ell((0, 0.16, -0.66), (0.5, 0.42, 0.62), k=0.05, mat=CU)            # abdomen
    S.cap((0, 0.42, -0.9), (0, 0.5, -1.02), 0.08, 0.05, k=0.05, mat=BRASS)   # spinneret, where the cable is
    for s in (-1, 1):                                                     # fangs
        S.cap((s * 0.08, -0.06, 0.7), (s * 0.07, -0.28, 0.8), 0.075, 0.045, k=0.04, mat=CU)
        S.cap((s * 0.07, -0.3, 0.74), (s * 0.03, -0.38, 0.7), 0.04, 0.012, mat=BRASS)
        S.cap((s * 0.16, -0.04, 0.6), (s * 0.24, -0.18, 0.86), 0.05, 0.035, mat=CU)     # palps
    # eyes: two big, two middling, four small, glowing
    for (x, y, z, r) in ((0.085, 0.16, 0.74, 0.085), (0.2, 0.19, 0.67, 0.06), (0.07, 0.28, 0.66, 0.045),
                         (0.22, 0.28, 0.56, 0.042)):
        for s in (-1, 1):
            S.ell((s * x, y, z), (r, r, r), mat=LENS)
    for i, az in enumerate(LEG_AZ):
        for s in (-1, 1):
            ph = 2 * math.pi * (t * 2 + i * 0.13 + (0.5 if s > 0 else 0))
            curl = 0.32 + 0.22 * math.sin(ph)
            lift = math.sin(ph + 1.0)
            if i == 0 and s > 0 and 0.55 < t < 0.75:             # the front leg tests the air
                u = (t - 0.55) / 0.2
                lift += 2.2 * math.sin(math.pi * u)
                curl -= 0.25 * math.sin(math.pi * u)
            base = np.array((s * 0.3 * math.sin(az), 0.02, 0.3 + 0.36 * math.cos(az)))
            _leg(S, base, az, s, curl, lift, i)
    return S


def spider_frames(n=SPIDER_N):
    """n RGBA frames of the spider hanging on its cable, and per frame the pixel
    of its spinneret (where the cable meets it)."""
    w, h = SPIDER_SIZE
    frames, anchors = [], []
    for f in range(n):
        t = f / n
        S = _spider_shapes(f, n)
        yaw = 0.2 + 0.38 * math.sin(2 * math.pi * t)
        pitch = 0.5 + 0.05 * math.sin(2 * math.pi * t * 2)
        roll = 0.06 * math.sin(2 * math.pi * t + 1.1)
        V = rot_x(pitch) @ rot_z(roll) @ rot_y(yaw)
        org = (SPIDER_ORIGIN[0], SPIDER_ORIGIN[1])
        g = S.trace(w, h, SPIDER_SCALE, org, V, bound=2.2)

        def mats(g):
            P, hit, mat = g['p'], g['hit'], g['mat']
            ab = hit & (mat == CU) & (((P[..., 0] / 0.5) ** 2 + ((P[..., 1] - 0.16) / 0.42) ** 2 +
                                       ((P[..., 2] + 0.66) / 0.62) ** 2) < 1.15)
            g['ab'] = ab
            # the furnace inside shows through slits running round the abdomen
            ring = np.abs(((P[..., 2] + 0.66) / 0.62 * 3.0 + 0.5) % 1 - 0.5) < 0.1
            slit = ab & ring & (np.abs(P[..., 2] + 0.66) < 0.5) & (np.sin(np.arctan2(P[..., 1] - 0.16, P[..., 0]) * 9) > -0.2)
            mat[slit] = CORE
            nz = np.sin(P[..., 0] * 13 + P[..., 2] * 5) * np.sin(P[..., 1] * 15 - P[..., 2] * 7)
            body = ab | (((P[..., 0] / 0.42) ** 2 + (P[..., 1] / 0.3) ** 2 + ((P[..., 2] - 0.3) / 0.48) ** 2) < 1.2)
            mat[hit & (mat == CU) & (nz > 0.72) & body] = PATINA

        def paint(g, idx):
            P, hit, mat = g['p'], g['hit'], g['mat']
            plate = g['ab'] & (np.abs(((P[..., 0] / 0.5) * 3 + 0.5) % 1 - 0.5) > 0.44)
            idx[plate] -= 1
            head = hit & (mat == CU) & (P[..., 2] > 0.0) & (np.abs(P[..., 0]) < 0.4)
            idx[head & (np.abs(P[..., 0]) < 0.025)] -= 1             # the seam down the middle of the head

        pulse = 0.5 + 0.5 * math.sin(2 * math.pi * t * 4)

        def emit(g, pulse=pulse):
            n_ = g['n']
            face = np.clip(n_[..., 2], 0, 1)
            eyes = np.where(face > 0.85, 4, np.where(face > 0.5, 3, 2))
            eyes = np.where((n_[..., 0] < -0.2) & (n_[..., 1] > 0.2), 4, eyes)
            core = np.full(g['hit'].shape, 3 + int(round(pulse)))
            return {LENS: (_names('warn'), eyes), CORE: (_names('fire'), core)}

        look = dict(amb=0.14, key=0.7, under=0.0, rim_t=0.5, rim_col='haze2',
                    keyv=_n3((0.55, 0.45, 0.7)), rimv=_n3((-0.2, 0.5, -1.0)), lift={BRASS: 0.3})
        rgba = light(g, look, mats=mats, paint=paint, emit=emit)
        rgba = outline(rgba, g['z'] * SPIDER_SCALE, inner_step=2.0)
        frames.append(rgba)
        a = V @ np.array((0, 0.55, -1.05))
        anchors.append((org[0] + a[0] * SPIDER_SCALE, org[1] - a[1] * SPIDER_SCALE))
    return frames, anchors


# ---------------------------------------------------------------- the koi airship
KOI_N = 24
KOI_SIZE = (104, 46)
KOI_SCALE = 17.0
KOI_ORIGIN = (52, 23)
KOI_PROFILE = [(-1.6, 0.1), (-1.25, 0.16), (-0.6, 0.36), (0.1, 0.48), (0.7, 0.46), (1.15, 0.36), (1.45, 0.2)]


def _koi_shapes(f, n=KOI_N):
    t = f / n
    S = Shapes()
    xs = np.linspace(-1.5, 1.4, 12)
    pts = []
    for x in xs:
        u = (1.4 - x) / 2.9                                  # 0 at the head, 1 at the tail
        z = 0.22 * u ** 1.6 * math.sin(2 * math.pi * t - x * 2.2)
        pts.append(np.array((x, 0.0, z)))
    rs = [float(np.interp(p[0], *zip(*KOI_PROFILE))) for p in pts]
    for i in range(len(pts) - 1):
        S.cap(tuple(pts[i]), tuple(pts[i + 1]), rs[i], rs[i + 1], k=0.08, mat=CU)
    S.ell(tuple(pts[-1] + np.array((0.05, -0.02, 0))), (0.24, 0.3, 0.32), k=0.12, mat=CU)    # head
    tail = pts[0]
    sw = 0.5 * math.sin(2 * math.pi * t - 2.6)
    for s in (-1, 1):                                        # forked tail
        tip = tail + rot_y(sw) @ np.array((-0.62, 0.42 * s, 0))
        S.cap(tuple(tail), tuple(tip), 0.12, 0.05, k=0.06, mat=BRASS)
        S.ell(tuple((tail + tip) / 2), (0.32, 0.12, 0.03), rot=rot_y(sw) @ rot_z(-0.6 * s), k=0.04, mat=CU)
    S.ell((0.05, 0.46, pts[6][2]), (0.55, 0.14, 0.03), k=0.05, mat=CU)             # dorsal fin
    for s in (-1, 1):                                                              # pectorals and barbels
        S.ell((0.85, -0.3, s * 0.4), (0.22, 0.05, 0.14), rot=rot_x(0.5 * s), k=0.04, mat=BRASS)
        S.cap((1.6, -0.12, s * 0.1), (1.8, -0.3, s * 0.18), 0.03, 0.012, mat=BRASS)
    S.box((0.1, -0.62, 0), (0.42, 0.08, 0.12), round=0.06, mat=STEEL)            # gondola
    S.cap((-0.1, -0.54, 0), (-0.1, -0.4, 0), 0.03, mat=STEEL)
    S.cap((0.35, -0.54, 0), (0.35, -0.4, 0), 0.03, mat=STEEL)
    return S


def koi_frames(n=KOI_N, haze=0.25):
    w, h = KOI_SIZE
    frames = []
    for f in range(n):
        S = _koi_shapes(f, n)
        V = rot_x(0.12) @ rot_y(-0.08)
        g = S.trace(w, h, KOI_SCALE, KOI_ORIGIN, V, bound=2.3)

        def mats(g):
            P, hit, mat = g['p'], g['hit'], g['mat']
            # koi markings: dark bronze patches on the copper, like a kohaku's red on white
            spot = np.sin(P[..., 0] * 3.1 + 1.0) * np.cos(P[..., 2] * 2.0 + P[..., 1] * 3) > 0.35
            mat[hit & (mat == CU) & spot & (P[..., 1] > -0.1)] = PATINA

        def paint(g, idx):
            P, hit, mat = g['p'], g['hit'], g['mat']
            sc = hit & np.isin(mat, [CU, PATINA]) & ((np.floor(P[..., 0] * 9) + np.floor(P[..., 1] * 9)) % 2 == 0) & \
                ((P[..., 0] * 9) % 1 < 0.3)
            idx[sc] -= 1

        def emit(g):
            P = g['p']
            port = g['hit'] & (g['mat'] == STEEL) & (np.floor(P[..., 0] * 8) % 2 == 0) & (np.abs(P[..., 1] + 0.62) < 0.05)
            g['mat'][port] = WINDOW
            return {WINDOW: (_names('amber'), np.full(port.shape, 3))}

        look = dict(amb=0.2, key=0.65, under=0.6, haze=haze, haze_col=PAL['smog4'],
                    haze_ramps=('smog', 'glow', 'cu', 'verd', 'amber', 'steel'))
        rgba = light(g, look, mats=mats, paint=paint, emit=emit)
        rgba = outline(rgba, None, ink='smog1')
        frames.append(rgba)
    return frames


if __name__ == '__main__':
    import sys
    from PIL import Image
    out = sys.argv[1]
    which = sys.argv[2] if len(sys.argv) > 2 else 'puffer'
    fn = dict(puffer=lambda: puffer_frames(n=8)[0], spider=lambda: spider_frames(n=8)[0],
              koi=lambda: koi_frames(n=8))[which]
    fr = fn()
    sheet = np.concatenate(fr, 1)
    bg = np.zeros(sheet.shape[:2] + (3,), np.uint8)
    bg[:] = PAL['smog2']
    m = sheet[..., 3:4] / 255.0
    img = (sheet[..., :3] * m + bg * (1 - m)).astype(np.uint8)
    Image.fromarray(img).resize((img.shape[1] * 3, img.shape[0] * 3), Image.NEAREST).save(out)
