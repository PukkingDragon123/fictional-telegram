"""The traveller's papers, as real objects you can turn over in your hands:
the world map (a hand scroll), the train ticket, the ferry pass and the
postcard.

Each face is drawn by hand, flat, in kit_papers_art.py. Here the faces are
laid onto thin sheets in 3D (kit_papers_render.py) - the map onto a scroll
that rolls up round its roller, the cards onto stiff boards with a cut edge -
and every frame is rasterised, lit in palette steps, outlined and cleaned.

    python3 kit_papers.py            # writes teahouse-assets/traveler_kit/<prop>/

Props (each also as _clean, _worn, _dirty, _repaired):
  world_map      idle, turn, unroll, route
  train_ticket   idle, turn, punch
  boat_pass      idle, turn, stamp
  postcard       idle, turn, flip
"""
import math
import sys
import numpy as np
from pixel import PAL, RAMPS
import kit_papers_render as KR
import kit_papers_art as A
from kit_export import export_prop

FPS = 12

# ---------------------------------------------------------------- materials of the solid parts
WOOD, KNOB, CORD, STEEL, HANKO, INKFACE, BRASS, STRING, CHAD = 3, 4, 5, 6, 7, 8, 10, 12, 13
KR.add_ramps({
    # dark lacquered roller ends with a warm sheen
    'pap_lacq': [(30, 16, 22), (54, 26, 30), (86, 40, 40), (126, 62, 50), (170, 98, 70)],
    # pale boxwood for the stave and the stamp
    'pap_box': [(98, 62, 44), (140, 96, 60), (184, 136, 84), (216, 174, 112), (238, 208, 148)],
    # blued steel of the ticket punch
    'pap_steel': [(28, 30, 44), (48, 54, 72), (78, 88, 108), (122, 134, 150), (178, 188, 198), (232, 236, 236)],
    # the scroll's silk cord
    'pap_silk': [(44, 26, 64), (76, 44, 104), (116, 72, 148), (164, 116, 188)],
})
MATS = {
    WOOD: dict(ramp='pap_box', cuts=(0.3, 0.5, 0.68, 0.86)),
    KNOB: dict(ramp='pap_lacq', cuts=(0.3, 0.5, 0.68, 0.84), spec=0.94, spec_col=PAL['pap_lacq4']),
    STEEL: dict(ramp='pap_steel', cuts=(0.25, 0.42, 0.58, 0.74, 0.88), spec=0.95, spec_col=PAL['pap_steel5']),
    CHAD: dict(ramp='pap_card', cuts=(0.3, 0.55, 0.75, 0.9)),
    HANKO: dict(ramp='pap_box', cuts=(0.3, 0.48, 0.66, 0.84)),
    INKFACE: dict(ramp='pap_seal', cuts=(0.4, 0.7)),
    BRASS: dict(ramp='gold', cuts=(0.3, 0.5, 0.7, 0.88)),
    STRING: dict(ramp='pap_jute', cuts=(0.35, 0.6, 0.82)),
}


# ---------------------------------------------------------------- the render pipeline
def render(mesh, cam, front, back, rim_ramp='pap_parch', rim_base=3, cast=None, ground=None, overlay=None,
           lines=True, clean=True, receiver_z=0.8, lit=True):
    """One frame. front/back: RGBA images of the two faces (the back drawn
    as seen from behind). cast: mesh whose lifted parts throw a shadow on the
    sheet / table (z = 0). overlay(rgba, g, cam): 2D-drawn extras with the
    depth buffer (cords). Returns RGBA."""
    af = front[..., 3] > 0
    ab = back[..., 3] > 0
    g = KR.raster(mesh, cam, front.shape[:2], af, ab)
    h, w = g['z'].shape
    rgba, sheet, exact = KR.lookup(g, front, back)
    rgb = rgba[..., :3].copy()
    if lit:
        KR.ramp_shift(rgb, sheet, KR.bands(g, sheet))
    # the cut edge of the paper
    rim = g['mat'] == KR.RIM
    if rim.any():
        cols = RAMPS[rim_ramp]
        sub = [cols[max(0, rim_base - 2)], cols[max(0, rim_base - 1)], cols[rim_base], cols[min(len(cols) - 1, rim_base + 1)]]
        rgb[rim] = KR.solid_shade(g, rim, sub, cuts=(0.35, 0.55, 0.75))[rim]
    for m, st in MATS.items():
        sel = g['mat'] == m
        if sel.any():
            rgb[sel] = KR.solid_shade(g, sel, st['ramp'], st['cuts'], st.get('spec'), st.get('spec_col'))[sel]
    solid = g['mat'] > 0
    rgba[..., :3] = rgb
    rgba[solid, 3] = 255
    rgba[~solid, 3] = 0
    sh = None
    if cast is not None:
        H = KR.shadow_height(cast, cam)
        recv = KR.shadowed(H, g['z'], sheet | (g['mat'] == KR.RIM))
        rgb = rgba[..., :3].copy()
        KR.ramp_shift(rgb, recv, -1)
        rgba[..., :3] = rgb
        sh = H > 1.0
    if overlay is not None:
        overlay(rgba, g, cam)
    if lines:
        KR.depth_lines(rgba, np.where(rgba[..., 3] > 0, g['z'], -1e9))
    keep = exact | ~(sheet)
    if clean:
        KR.tidy(rgba, keep=keep)
    out = KR.outline(rgba)
    if ground is not None or sh is not None:
        gm = np.zeros((h, w), bool)
        if sh is not None:
            gm |= sh
        if ground is not None:
            gm |= ground
        gm &= out[..., 3] == 0
        out[gm] = KR.SHADOW_RGBA
    return out


def line3d(rgba, g, cam, pts, cols, bias=0.7, width_mask=None):
    """A cord: a 3D polyline drawn 1 px wide, hidden where something nearer
    covers it. cols(i, n_dir) -> palette rgb for the i-th pixel."""
    P = np.asarray(pts, float)
    sx, sy, sz = cam.project(P)
    h, w = g['z'].shape
    k = 0
    last = None
    for i in range(len(P) - 1):
        x0, y0, x1, y1 = sx[i], sy[i], sx[i + 1], sy[i + 1]
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 1.5) + 1
        for j in range(n + 1):
            t = j / n
            x = int(math.floor(x0 + (x1 - x0) * t))
            y = int(math.floor(y0 + (y1 - y0) * t))
            if (x, y) == last:
                continue
            last = (x, y)
            if not (0 <= x < w and 0 <= y < h):
                continue
            z = sz[i] + (sz[i + 1] - sz[i]) * t
            if rgba[y, x, 3] and z < g['z'][y, x] - bias:
                continue
            c = cols(k, (x1 - x0, y1 - y0), z)
            rgba[y, x, :3] = c
            rgba[y, x, 3] = 255
            g['z'][y, x] = max(g['z'][y, x], z)
            k += 1


def ease(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = min(1.0, max(0.0, t))
    return 1 - (1 - t) ** 3


def ease_in(t):
    t = min(1.0, max(0.0, t))
    return t ** 3


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def turn_pose(k, n, tilt=0.26):
    """Angle and tilt of frame k of a full turn: eases through the faces (so
    the eye can read them) and speeds through the edges."""
    t = k / n
    a = 2 * math.pi * t - 0.55 * math.sin(4 * math.pi * t) / 4 * 2
    return a, tilt * math.sin(a) ** 2 * (1 if math.cos(a) >= 0 else 1)


# ================================================================ the world map: a hand scroll
MAP_W, MAP_H = A.MAP_W, A.MAP_H
MAP_FW, MAP_FH = 152, 104
MAP_OX, MAP_OY = 22, 18
MAP_TAU = 1.0
JIKU_R = 2.4                 # the roller the paper ends on
HASSO_R = 1.3                # the thin stave the paper starts at
LAYER = 0.42                 # how much each turn of paper adds to the roll's radius
KNOB_OUT = 4.5               # how far the roller ends stand out past the paper
MAP_ZREF = MAP_TAU / 2


def roll_radius(length, core):
    return math.sqrt(core * core + max(0.0, length) * LAYER / math.pi)


def _spiral(s, R0):
    a = LAYER / (4 * math.pi)
    psi = (R0 - np.sqrt(np.maximum(R0 * R0 - 4 * a * s, 0))) / (2 * a)
    r = R0 - LAYER * psi / (2 * math.pi)
    return psi, r


class Scroll:
    """The scroll's shape: flat between ul and ur (texels), rolled up round the
    stave left of ul and round the roller right of ur. lift raises the whole
    roll (bounce)."""

    def __init__(self, ul=0.0, ur=MAP_W, ox=MAP_OX, oy=MAP_OY, lift_r=0.0, lift_l=0.0):
        self.ul, self.ur, self.ox, self.oy = ul, ur, ox, oy
        self.cl = HASSO_R + MAP_TAU / 2
        self.cr = JIKU_R + MAP_TAU / 2
        self.Rl = roll_radius(ul, self.cl) if ul > 0 else self.cl
        self.Rr = roll_radius(MAP_W - ur, self.cr)
        self.lift_r, self.lift_l = lift_r, lift_l

    def surf(self, U, V):
        U = np.asarray(U, float)
        V = np.asarray(V, float)
        x = self.ox + U.copy()
        z = np.zeros_like(U)
        nx = np.zeros_like(U)
        nz = np.ones_like(U)
        # right roll
        m = U > self.ur
        if m.any():
            psi, r = _spiral(U[m] - self.ur, self.Rr)
            x[m] = self.ox + self.ur + r * np.sin(psi)
            z[m] = self.Rr + self.lift_r - r * np.cos(psi)
            nx[m] = -np.sin(psi)
            nz[m] = np.cos(psi)
        # left roll
        m = U < self.ul
        if m.any():
            psi, r = _spiral(self.ul - U[m], self.Rl)
            x[m] = self.ox + self.ul - r * np.sin(psi)
            z[m] = self.Rl + self.lift_l - r * np.cos(psi)
            nx[m] = np.sin(psi)
            nz[m] = np.cos(psi)
        # a lifted roll pulls the paper next to it up into a short ramp
        for side, lift, edge, R in (('r', self.lift_r, self.ur, self.Rr), ('l', self.lift_l, self.ul, self.Rl)):
            if lift > 0:
                d = (edge - U) if side == 'r' else (U - edge)
                ramp = (d >= 0) & (d < 10)
                k = 1 - d[ramp] / 10
                z[ramp] += lift * k * k
                slope = lift * 2 * k / 10 * (1 if side == 'l' else -1)      # dz/du of the ramp
                nx[ramp] = slope * nz[ramp]
                nn = np.sqrt(nx[ramp] ** 2 + nz[ramp] ** 2)
                nx[ramp] /= nn
                nz[ramp] = nz[ramp] / nn
        P = np.stack([x, self.oy + V, z], 1)
        N = np.stack([nx, np.zeros_like(nx), nz], 1)
        return P, N

    def jiku_axis(self):
        """Centre of the roller (x, z)."""
        return self.ox + self.ur, self.Rr + self.lift_r

    def hasso_axis(self):
        return self.ox + self.ul, self.Rl + self.lift_l


def scroll_mesh(sc, alpha, du=1.0):
    parts = []
    W, H = MAP_W, MAP_H
    # the flat part is coarse; the rolled parts fine
    if sc.ul > 0:
        parts.append(KR.sheet_mesh(sc.surf, W, H, 0.5, 4.0, alpha, MAP_TAU, (0, min(1, (sc.ul + 0.0) / W))))
    a, b = sc.ul / W, sc.ur / W
    if b > a:
        parts.append(KR.sheet_mesh(sc.surf, W, H, 4.0, 4.0, alpha, MAP_TAU, (a, b)))
    if sc.ur < W:
        parts.append(KR.sheet_mesh(sc.surf, W, H, 0.5, 4.0, alpha, MAP_TAU, (b, 1.0)))
    # the roller with its lacquered ends
    jx, jz = sc.jiku_axis()
    y0, y1 = sc.oy - KNOB_OUT, sc.oy + H + KNOB_OUT
    L = y1 - y0
    k = KNOB_OUT / L
    prof = [(0, 0.0), (0.0, 2.2), (0.02, 3.3), (k * 0.75, 3.3), (k, 2.6), (k + 0.001, JIKU_R),
            (1 - k - 0.001, JIKU_R), (1 - k, 2.6), (1 - k * 0.75, 3.3), (0.98, 3.3), (1.0, 2.2)]
    body = KR.lathe([(t, r) for t, r in prof[5:7]], (jx, y0 + k * L, jz), (jx, y0 + (1 - k) * L, jz), WOOD, seg=20,
                    cap_top=False, cap_bot=False)
    ends = [KR.lathe([(0, 2.4), (0.15, 3.4), (0.85, 3.4), (1, 2.6)], (jx, y0, jz), (jx, sc.oy, jz), KNOB, seg=20),
            KR.lathe([(0, 2.6), (0.15, 3.4), (0.85, 3.4), (1, 2.4)], (jx, sc.oy + H, jz), (jx, y1, jz), KNOB, seg=20)]
    hx, hz = sc.hasso_axis()
    hasso = KR.lathe([(0, HASSO_R), (1, HASSO_R)], (hx, sc.oy - 1.5, hz), (hx, sc.oy + H + 1.5, hz), WOOD, seg=12)
    return KR.Mesh.join(parts + [body] + ends + [hasso])


CORD_COLS = [PAL['pap_silk1'], PAL['pap_silk2'], PAL['pap_silk3'], PAL['pap_silk2']]


def _cord_col(i, d, z):
    return CORD_COLS[i % 4] if i % 4 != 0 else PAL['pap_silk1']


def cord_hanging(sc, sway=0.0):
    """The cord from the stave, lying in a lazy curve to the left, a tassel
    at its end."""
    hx, hz = sc.hasso_axis()
    y = sc.oy + MAP_H * 0.5
    pts = []
    for i in range(15):
        t = i / 14
        x = hx - 1.5 - 9 * math.sin(t * 2.1) * (1 - 0.25 * t) - sway * t * t * 3
        yy = y + t * 22 + math.sin(t * 3.2) * 1.5
        pts.append((x, yy, max(0.4, hz * (1 - t * 3))))
    return pts


def draw_tassel(rgba, g, cam, p, sway=0.0):
    sx, sy, sz = cam.project(np.array([p], float))
    x, y = int(round(sx[0])), int(round(sy[0]))
    shape = [(0, 0, 'pap_silk2'), (-1, 1, 'pap_silk3'), (0, 1, 'pap_silk2'), (1, 1, 'pap_silk1'),
             (-1, 2, 'pap_silk2'), (0, 2, 'pap_silk1'), (1, 2, 'pap_silk1'), (-1, 3, 'pap_silk1'),
             (1, 3, 'pap_silk0'), (0, 4, 'pap_silk0'), (-2, 4, 'pap_silk1'), (1, 4, 'pap_silk0')]
    for dx, dy, c in shape:
        xx = x + dx + (int(round(sway * dy / 4)) if dy > 2 else 0)
        yy = y + dy
        if 0 <= xx < rgba.shape[1] and 0 <= yy < rgba.shape[0]:
            rgba[yy, xx, :3] = PAL[c]
            rgba[yy, xx, 3] = 255


def map_faces(variant='hero', route=1.0, pulse=0, mark=None):
    f = A.map_front(variant, route, pulse, mark=mark)
    b = A.map_back()
    A.damage('map', variant, f, b)
    fa, ba = f.a.copy(), b.a.copy()
    ba[..., 3] = np.where(fa[:, ::-1, 3] > 0, ba[..., 3], 0)
    return fa, ba


def map_frame(sc, faces, cam=None, R=None, about=None, cast=True, sway=0.0, cord='hang', cord_state=None,
              ground=None):
    cam = cam or KR.Camera(MAP_FW, MAP_FH, f=420, zref=MAP_ZREF)
    front, back = faces
    alpha = front[..., 3] > 0
    mesh = scroll_mesh(sc, alpha)
    cord_pts = cord_hanging(sc, sway) if cord == 'hang' else (cord_state or [])
    if R is not None:
        about = about if about is not None else (MAP_OX + MAP_W / 2, MAP_OY + MAP_H / 2, 0)
        mesh = mesh.transformed(R, about=about)
        if cord_pts:
            cp = np.asarray(cord_pts, float)
            a_ = np.asarray(about, float)
            cord_pts = list((cp - a_) @ np.asarray(R).T + a_)

    def over(rgba, g, cam_):
        if cord_pts:
            line3d(rgba, g, cam_, cord_pts, _cord_col)
            if cord == 'hang':
                draw_tassel(rgba, g, cam_, cord_pts[-1], sway)
    return render(mesh, cam, front, back, cast=mesh if cast else None, overlay=over, ground=ground)


def cord_tied(sc, loosen=0.0, slide=0.0, spin=0.0):
    """Two wraps of cord round the roll and the bow on top."""
    jx, jz = sc.jiku_axis()
    R = sc.Rr + 0.7 + loosen
    ym = sc.oy + MAP_H * 0.5 + slide
    pts = []
    n = 64
    for i in range(n + 1):
        a = 4 * math.pi * i / n + spin
        pts.append((jx + R * math.sin(a), ym - 2.2 + 4.4 * i / n + loosen * 0.6 * math.sin(a * 0.5),
                    jz - R * math.cos(a)))
    return pts


def draw_bow(rgba, g, cam, sc, slide=0.0, undone=0.0):
    """The bow tied on top of the rolled scroll; undone 0..1 lets it go."""
    jx, jz = sc.jiku_axis()
    top = np.array([[jx, sc.oy + MAP_H * 0.5 + slide, jz + sc.Rr + 1.0]])
    sx, sy, _ = cam.project(top)
    x, y = int(round(sx[0])), int(round(sy[0]))
    if undone < 0.5:
        rows = ['.LL.LL.', 'L.lKl.L', '.LL.LL.', '..l.l..', '.l...l.']
    else:
        rows = ['.......', '...l...', '..lKl..', '...L...', '...l...']
    cols = {'L': 'pap_silk3', 'l': 'pap_silk1', 'K': 'pap_silk0'}
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in cols:
                xx, yy = x - 3 + i, y - 2 + j
                if 0 <= xx < rgba.shape[1] and 0 <= yy < rgba.shape[0]:
                    rgba[yy, xx, :3] = PAL[cols[ch]]
                    rgba[yy, xx, 3] = 255


def map_idle(faces, n=16):
    """The stave end of the scroll wants to roll back up: it lifts and curls a
    few pixels and lies down again; the cord sways with it."""
    out = []
    for k in range(n):
        t = k / n
        c = 0.5 - 0.5 * math.cos(2 * math.pi * t)
        ul = 8.0 * c ** 1.3
        sc = Scroll(ul=ul, lift_l=2.6 * c)
        out.append(map_frame(sc, faces, sway=1.2 * math.sin(2 * math.pi * t - 0.9)))
    return out


def map_turn(faces, n=28):
    out = []
    for k in range(n):
        a, tl = turn_pose(k, n)
        out.append(map_frame(Scroll(), faces, R=rot_x(tl * 0.36) @ rot_y(a), cast=False))
    return out


def map_unroll(faces):
    """Tied scroll -> the cord slips off -> it unrolls left to right, the roll
    travelling across -> lands with a hop and settles."""
    frames = []
    # (ur, roll lift, cord state, loosen, slide, bow undone, x nudge, sway)
    keys = [
        (0, 0, 'tied', 0, 0, 0, 0, 0),
        (0, 0, 'tied', 0, 0, 0, 0, 0),
        (0, 0.6, 'tied', 0.1, 0, 0, -1, 0),        # anticipation: a little rock back
        (0, 0, 'tied', 0.6, 0, 1, 0, 0),           # the bow pops
        (0, 0, 'tied', 1.4, 3, 1, 0, 0),           # wraps loosen and slide
        (0, 0, 'tied', 2.2, 10, 1, 0, 0),
        (0, 0, 'tied', 3.0, 22, 1, 0, 0),
        (0, 0, 'hang', 0, 0, 1, 0, 1.8),           # off: the cord drops to the table
    ]
    for (ur, lift, cs, lo, sl, und, nx, sw) in keys:
        frames.append((Scroll(ur=ur, lift_r=lift, ox=MAP_OX + nx), cs, lo, sl, und, sw))
    # the unroll: ease in, fast through the middle, ease out
    m = 12
    for k in range(1, m + 1):
        t = k / m
        e = t * t * (3 - 2 * t)
        e = e ** 0.85
        ur = MAP_W * e
        lift = 1.6 * math.sin(math.pi * t) + 0.5 * abs(math.sin(3 * math.pi * t))
        frames.append((Scroll(ur=ur, lift_r=lift), 'hang', 0, 0, 1, -2.0 * math.cos(math.pi * t)))
    # the landing: a hop, a smaller one, rest
    for (lift, sw) in ((2.2, 1.5), (0.0, 0.8), (0.9, -0.6), (0.0, -0.3), (0.3, 0.2), (0.0, 0.0), (0.0, 0.0)):
        frames.append((Scroll(lift_r=lift), 'hang', 0, 0, 1, sw))
    out = []
    for (sc, cs, lo, sl, und, sw) in frames:
        if cs == 'tied':
            pts = cord_tied(sc, lo, sl, spin=0.25 * lo)

            def over(rgba, g, cam_, pts=pts, sc=sc, sl=sl, und=und):
                line3d(rgba, g, cam_, pts, _cord_col)
                if sl < 8:
                    draw_bow(rgba, g, cam_, sc, sl, und)
            cam = KR.Camera(MAP_FW, MAP_FH, f=420, zref=MAP_ZREF)
            alpha = faces[0][..., 3] > 0
            mesh = scroll_mesh(sc, alpha)
            out.append(render(mesh, cam, faces[0], faces[1], cast=mesh, overlay=over))
        else:
            out.append(map_frame(sc, faces, sway=sw))
    return out


def map_route(variant='hero', n=22):
    """The route draws itself stop by stop; the tea bowl pops in and pulses."""
    out = []
    # leg ends at 0.25, 0.5, 0.75, 1.0 of the way; each leg eases, with a beat at each stop
    sched = []
    for leg in range(4):
        for f in (0.35, 0.75, 1.0, 1.0):
            sched.append((leg + f) / 4)
    sched = [0.0, 0.0] + sched[:-1]
    for k in range(n):
        if k < len(sched):
            r, pulse = sched[k], 0
        else:
            r = 1.0
            pulse = [0, 6.0, 7.5, 9.0, 0, 0][min(5, k - len(sched))]
        faces = map_faces(variant, r, pulse, k >= len(sched))
        out.append(map_frame(Scroll(), faces, sway=0.0))
    return out


# ================================================================ cards
class Card:
    """A stiff card W x H texels with its top-left at (ox, oy). curl: a corner
    lifting about a diagonal fold (corner, size px, angle rad, radius); bow:
    the whole card arching; lift: raised off the table; dent: pressed in
    under a stamp (u, v, radius, depth)."""

    def __init__(self, W, H, ox, oy, curl=None, bow=0.0, lift=0.0, dent=None):
        self.W, self.H, self.ox, self.oy = W, H, ox, oy
        self.curl, self.bow, self.lift, self.dent = curl, bow, lift, dent

    def surf(self, U, V):
        U = np.asarray(U, float)
        V = np.asarray(V, float)
        x, y = U.copy(), V.copy()
        z = np.full_like(U, self.lift)
        n = np.zeros((len(U), 3))
        n[:, 2] = 1
        if self.bow:
            k = (U - self.W / 2) / (self.W / 2)
            z += self.bow * (1 - k * k)
            n[:, 0] = self.bow * 2 * k / (self.W / 2)
        if self.dent is not None:
            cx, cy, r, depth = self.dent
            bump = np.exp(-((U - cx) ** 2 + (V - cy) ** 2) / (r * r) * 1.5)
            z -= depth * bump
            n[:, 0] += depth * bump * 3.0 * (U - cx) / (r * r)
            n[:, 1] += depth * bump * 3.0 * (V - cy) / (r * r)
        if self.curl is not None:
            corner, size, ang, rad = self.curl
            cx = self.W if corner[1] == 'r' else 0.0
            cy = self.H if corner[0] == 'b' else 0.0
            d = np.array([1.0 if cx == 0 else -1.0, 1.0 if cy == 0 else -1.0]) / math.sqrt(2)
            e = size - ((U - cx) * d[0] + (V - cy) * d[1])         # how far into the corner flap
            m = e > 0
            if m.any() and ang > 0:
                ee = e[m]
                phi = np.minimum(ee / rad, ang)
                arc = ee <= rad * ang
                delta = np.where(arc, rad * np.sin(phi), rad * math.sin(ang) + (ee - rad * ang) * math.cos(ang))
                zz = np.where(arc, rad * (1 - np.cos(phi)), rad * (1 - math.cos(ang)) + (ee - rad * ang) * math.sin(ang))
                x[m] += d[0] * (ee - delta)
                y[m] += d[1] * (ee - delta)
                z[m] += zz
                n[m] = np.stack([d[0] * np.sin(phi), d[1] * np.sin(phi), np.cos(phi)], 1)
        n /= np.linalg.norm(n, axis=1, keepdims=True)
        return np.stack([self.ox + x, self.oy + y, z], 1), n


def card_render(card, faces, fw, fh, tau, rim=('pap_card', 2), R=None, about=None, extras=(), overlay=None,
                table=True, f=200.0, lit=True):
    front, back = faces
    mesh = KR.sheet_mesh(card.surf, card.W, card.H, 1.0, 1.0, front[..., 3] > 0, tau)
    full = KR.Mesh.join([mesh] + [e for e in extras if e is not None])
    if R is not None:
        about = about if about is not None else (card.ox + card.W / 2, card.oy + card.H / 2, 0)
        full = full.transformed(R, about=about)
    cam = KR.Camera(fw, fh, f=f, zref=tau / 2)
    return render(full, cam, front, back, rim_ramp=rim[0], rim_base=rim[1], cast=full if table else None,
                  overlay=overlay, lit=lit)


def faces_of(front, back):
    """RGBA of both faces; the back's outline is the front's, mirrored."""
    fa, ba = front.a.copy(), back.a.copy()
    ba[..., 3] = np.where(fa[:, ::-1, 3] > 0, 255, 0)
    return fa, ba


def card_idle(card_args, faces, fw, fh, tau, rim, corner, n=16, base=0.12, amp=0.42, size=8, rad=2.6,
              overlay_fn=None):
    """A corner of the card lifts in the draught and lies back down."""
    out = []
    for k in range(n):
        t = k / n
        c = 0.5 - 0.5 * math.cos(2 * math.pi * t)
        card = Card(*card_args, curl=(corner, size, base + amp * c ** 1.4, rad))
        out.append(card_render(card, faces, fw, fh, tau, rim, overlay=overlay_fn(t, card) if overlay_fn else None))
    return out


def card_turn(card_args, faces, fw, fh, tau, rim, n=28, tilt=0.3, overlay_fn=None, f=200.0):
    """All the way round in the hand: front, edge, back, edge, front, tipping
    toward the viewer as it goes side-on."""
    out = []
    for k in range(n):
        a, tl = turn_pose(k, n, tilt)
        card = Card(*card_args)
        R = rot_x(tl) @ rot_y(a)
        out.append(card_render(card, faces, fw, fh, tau, rim, R=R, table=False,
                               overlay=overlay_fn(card, R) if overlay_fn else None, f=f))
    return out


def accent(frame, x, y, kind, col=None):
    """Hand-drawn impact marks: little snap lines round a bite, puffs either
    side of a slam."""
    col = col or PAL['white']
    h, w = frame.shape[:2]
    if kind == 'snap':
        pts = [(-3, -3), (-4, -4), (3, -3), (4, -4), (-4, 0), (-5, 0), (4, 1), (5, 1)]
    else:
        pts = [(-7, 1), (-8, 1), (-9, 0), (7, 1), (8, 1), (9, 0), (-6, 3), (6, 3)]
    for dx, dy in pts:
        xx, yy = int(x + dx), int(y + dy)
        if 0 <= xx < w and 0 <= yy < h:
            frame[yy, xx, :3] = col
            frame[yy, xx, 3] = 255


# ---------------------------------------------------------------- the train ticket
TK_FW, TK_FH = 84, 60
TK_OX, TK_OY = 10, 18
TK_TAU = 1.3
TK_RIM = ('pap_card', 2)
TK_ARGS = (A.TK_W, A.TK_H, TK_OX, TK_OY)


def ticket_faces(variant='hero', punched=True):
    f, b = A.ticket_front(punched), A.ticket_back(punched)
    A.damage('ticket', variant, f, b)
    return faces_of(f, b)


def punch_tool(open_, hx, hy, approach=0.0, tau=TK_TAU):
    """A conductor's punch, crossed like pliers, built in the ticket's own
    frame (card in the x-y plane, front toward +z): the pivot sits just off
    the card's right edge, the jaws reach in over (hx, hy), the handles run
    off to the right. open_ is the jaw angle; approach slides it in from the
    right."""
    parts = []
    piv = np.array([hx + 9.0 + approach, hy + 0.5, 0.0])
    for sgn in (1, -1):
        R = rot_y(-sgn * open_)                    # about the pivot axis (local y)
        arm = [KR.box((-4.6, 0, sgn * (tau / 2 + 1.6)), (4.6, 2.4, 1.4), mat=STEEL),       # the jaw
               KR.box((-9.0, 0, sgn * (tau / 2 + 1.9)), (1.8, 2.8, 1.8), mat=STEEL),       # its fat beak
               KR.box((8.0, 0, -sgn * 3.0), (8.0, 2.0, 1.2), R=rot_y(sgn * 0.2), mat=STEEL),  # the handle crosses over
               KR.box((20.0, 0, -sgn * 5.6), (5.0, 2.6, 1.9), R=rot_y(sgn * 0.14), mat=KNOB)]  # lacquered grip
        for m_ in arm:
            parts.append(m_.transformed(R).transformed(None, t=piv))
    parts.append(KR.lathe([(0, 2.0), (1, 2.0)], piv + (0, -3.0, 0), piv + (0, 3.0, 0), BRASS, seg=12))
    return KR.Mesh.join(parts)


def chad_mesh(x, y, z, a, b):
    m = KR.box((0, 0, 0), (1.6, 1.6, 0.45), mat=CHAD)
    return m.transformed(rot_x(a) @ rot_z(b), t=(x, y, z))


def ticket_punch(variant='hero'):
    """Picked up and tipped back to the light; the punch comes in from the
    side in profile, opens wide, bites the edge, lets go and pulls away; the
    chad tumbles out of the die and the ticket drops back flat with a
    wobble."""
    before = ticket_faces(variant, punched=False)
    after = ticket_faces(variant, punched=True)
    hx, hy = A.TK_HOLE
    hx_w, hy_w = TK_OX + hx, TK_OY + hy
    about = (TK_OX + A.TK_W / 2, TK_OY + A.TK_H / 2, 0)
    cam = KR.Camera(TK_FW, TK_FH, f=200.0, zref=TK_TAU / 2)
    # (tip-back angle, lift, jaw open, tool approach, hole?, chad t or None, card dx)
    keys = [(0.0, 0, None, None, 0, None, 0),
            (-0.08, 0.6, None, None, 0, None, 0),     # anticipation: dips toward us
            (0.45, 1.6, 0.38, 22.0, 0, None, 0),
            (0.86, 2.0, 0.42, 5.0, 0, None, 0),
            (0.92, 2.0, 0.52, 0.0, 0, None, 0),       # jaws wide over the edge
            (0.98, 1.6, 0.0, -0.5, 0, None, -1),      # BITE: the ticket jolts
            (0.95, 1.8, 0.0, -0.3, 0, None, 0),
            (0.92, 2.0, 0.36, 0.5, 1, 0.0, 0),        # let go: the hole, the chad drops
            (0.88, 2.0, 0.42, 7.0, 1, 0.14, 0),
            (0.70, 1.8, 0.42, 24.0, 1, 0.28, 0),
            (0.36, 1.3, None, None, 1, 0.44, 0),
            (-0.10, 0.4, None, None, 1, 0.62, 0),     # overshoot past flat
            (0.05, 0.0, None, None, 1, 0.82, 0),
            (-0.02, 0.0, None, None, 1, 1.0, 0),
            (0.0, 0.0, None, None, 1, None, 0),
            (0.0, 0.0, None, None, 1, None, 0)]
    out = []
    for (tip, lift, jaw, appr, hole, ch, dx) in keys:
        card = Card(A.TK_W, A.TK_H, TK_OX + dx, TK_OY, lift=lift)
        extras = [punch_tool(jaw, hx_w + dx, hy_w, appr).transformed(None, t=(0, 0, lift))] if jaw is not None else []
        R = rot_x(tip)
        frame = card_render(card, after if hole else before, TK_FW, TK_FH, TK_TAU, TK_RIM, R=R, about=about,
                            extras=extras)
        if ch is not None:
            # the chad: out of the die under the card, falling free and tumbling
            t = ch
            hp = (np.array([hx_w + 0.5, hy_w + 0.5, lift - 2.0]) - about) @ R.T + about
            g = KR.raster(chad_mesh(hp[0] + 5 * t, hp[1] + 4 + 40 * t * t, hp[2], 9 * t + 0.6, 6 * t), cam)
            sel = g['mat'] == CHAD
            if sel.any():
                col = KR.solid_shade(g, sel, 'pap_card', (0.3, 0.55, 0.75, 0.9))
                layer = np.zeros_like(frame)
                layer[sel, :3] = col[sel]
                layer[sel, 3] = 255
                layer = KR.outline(layer)
                mm = layer[..., 3] > 0
                frame[mm] = layer[mm]
        if jaw == 0.0 and dx != 0:
            hp = (np.array([[hx_w + dx + 0.5, hy_w + 0.5, lift]]) - about) @ R.T + about
            sx_, sy_, _ = cam.project(hp)
            accent(frame, sx_[0], sy_[0] - 2, 'snap')
        out.append(frame)
    return out


# ---------------------------------------------------------------- the ferry pass
BP_FW, BP_FH = 104, 64
BP_OX, BP_OY = 26, 16
BP_TAU = 1.1
BP_RIM = ('pap_aqua', 2)
BP_ARGS = (A.BP_W, A.BP_H, BP_OX, BP_OY)
JUTE = [PAL['pap_jute2'], PAL['pap_jute1'], PAL['pap_jute3'], PAL['pap_jute1']]


def pass_faces(variant='hero', stamped=True):
    f, b = A.pass_front(stamped), A.pass_back()
    A.damage('pass', variant, f, b)
    return faces_of(f, b)


def pass_string(sway=0.0, ox=BP_OX, oy=BP_OY, z=0.6):
    """The jute string: through the eyelet, round the tag's point, and its two
    ends lying out to the left in a loose curl with a knot."""
    ex, ey = ox + A.BP_EYE[0] + 0.5, oy + A.BP_EYE[1] + 0.5
    loop = [(ex, ey, BP_TAU / 2 + 0.3), (ex - 3, ey - 0.5, BP_TAU / 2 + 0.4), (ox - 0.5, ey - 1, z + 0.4),
            (ox - 3, ey - 1.5, z)]
    strands = []
    for off in (0.0, 1.6):
        pts = []
        for i in range(12):
            t = i / 11
            pts.append((ox - 3 - t * 14 - sway * t * t * 2.5,
                        ey - 1.5 + off * (1 - t * 0.6) + t * 13 + math.sin(t * 3.0 + off) * 2.0, z))
        strands.append(pts)
    return loop, strands


def draw_string(rgba, g, cam, loop, strands, R=None, about=None):
    def tr(pts):
        if R is None:
            return pts
        p = np.asarray(pts, float)
        a = np.asarray(about, float)
        return list((p - a) @ np.asarray(R).T + a)
    col = lambda i, d, z: JUTE[i % 4]
    line3d(rgba, g, cam, tr(loop), col, bias=0.4)
    for st in strands:
        line3d(rgba, g, cam, tr(loop[-1:] + st), col, bias=0.4)
    # the knot and the frayed ends
    sx, sy, sz = cam.project(np.asarray(tr([strands[0][7], strands[0][-1], strands[1][-1]]), float))
    h, w = rgba.shape[:2]
    marks = [((0, 0, 'pap_jute1'), (1, 0, 'pap_jute2'), (0, 1, 'pap_jute0'), (1, 1, 'pap_jute1'), (-1, 0, 'pap_jute2'))]
    marks += [((-1, 1, 'pap_jute3'), (0, 1, 'pap_jute2'), (-2, 1, 'pap_jute2'))] * 2
    for i, mk in enumerate(marks):
        px_, py_ = int(sx[i]), int(sy[i])
        for dx, dy, c in mk:
            if 0 <= px_ + dx < w and 0 <= py_ + dy < h:
                rgba[py_ + dy, px_ + dx, :3] = PAL[c]
                rgba[py_ + dy, px_ + dx, 3] = 255


def pass_overlay(sway=0.0, R=None, about=None, dx=0, dy=0):
    loop, strands = pass_string(sway, BP_OX + dx, BP_OY + dy)

    def over(rgba, g, cam):
        draw_string(rgba, g, cam, loop, strands, R, about)
    return over


def hanko_mesh(cx, cy, h, sq=1.0, tau=BP_TAU):
    """The wooden stamp, standing on the card's normal: red rubber face, a
    boxwood body, a waisted neck and a lacquered knob. sq < 1 squashes it
    (and fattens it, keeping its volume)."""
    ws = 1.0 / math.sqrt(sq)
    z0 = tau / 2 + h
    H = 17.0 * sq
    face = KR.lathe([(0, 5.2 * ws), (1, 5.2 * ws)], (cx, cy, z0), (cx, cy, z0 + 1.1 * sq), INKFACE, seg=24)
    body = KR.lathe([(0, 4.8 * ws), (0.5, 4.8 * ws), (0.72, 4.2 * ws), (1.0, 2.4 * ws)],
                    (cx, cy, z0 + 1.1 * sq), (cx, cy, z0 + H * 0.68), HANKO, seg=24)
    knob = KR.lathe([(0, 2.4 * ws), (0.25, 3.9 * ws), (0.7, 4.0 * ws), (1.0, 1.4 * ws)],
                    (cx, cy, z0 + H * 0.68), (cx, cy, z0 + H), KNOB, seg=24)
    return KR.Mesh.join([face, body, knob])


def pass_stamp(variant='hero'):
    """Tipped back toward us, the hanko comes down on the box, squashes,
    lifts off with a stretch; the seal is left a little crooked and the pass
    drops back flat with a wobble."""
    before = pass_faces(variant, stamped=False)
    after = pass_faces(variant, stamped=True)
    sx, sy = BP_OX + A.BP_SEAL[0] + 0.5, BP_OY + A.BP_SEAL[1] + 0.5
    about = (BP_OX + A.BP_W / 2, BP_OY + A.BP_H / 2, 0)
    cam = KR.Camera(BP_FW, BP_FH, f=200.0, zref=BP_TAU / 2)
    # (tip, hanko height or None, squash, stamped?, dent, dy)
    keys = [(0.0, None, 1, 0, 0, 0),
            (0.22, 22, 1.0, 0, 0, 0),
            (0.52, 14, 1.0, 0, 0, 0),
            (0.66, 8, 1.1, 0, 0, 0),          # anticipation: hangs, stretched
            (0.72, 0, 0.72, 0, 0.9, 1),       # SLAM
            (0.70, 0, 0.86, 0, 0.5, 0),
            (0.68, 3, 1.12, 1, 0, 0),         # lift off with a stretch: the seal
            (0.62, 11, 1.04, 1, 0, 0),
            (0.46, 19, 1.0, 1, 0, 0),
            (0.20, None, 1, 1, 0, 0),
            (-0.08, None, 1, 1, 0, 0),        # overshoot past flat
            (0.04, None, 1, 1, 0, 0),
            (-0.01, None, 1, 1, 0, 0),
            (0.0, None, 1, 1, 0, 0)]
    out = []
    for (tip, hh, sq, st, dent, dy) in keys:
        card = Card(A.BP_W, A.BP_H, BP_OX, BP_OY + dy,
                    dent=(A.BP_SEAL[0] + 0.5, A.BP_SEAL[1] + 0.5, 6.0, dent) if dent else None)
        extras = [hanko_mesh(sx, sy + dy, hh, sq)] if hh is not None else []
        R = rot_x(tip)
        fr = card_render(card, after if st else before, BP_FW, BP_FH, BP_TAU, BP_RIM, R=R, about=about,
                         extras=extras, overlay=pass_overlay(0.0, R, about, 0, dy))
        if sq < 0.8:
            hp = (np.array([[sx, sy + dy, BP_TAU / 2]]) - about) @ R.T + about
            sx_, sy_, _ = cam.project(hp)
            accent(fr, sx_[0], sy_[0], 'puff', PAL['pap_aqua4'])
        out.append(fr)
    return out


# ---------------------------------------------------------------- the postcard
PC_FW, PC_FH = 96, 80
PC_OX, PC_OY = 16, 16
PC_TAU = 0.9
PC_RIM = ('pap_cream', 1)
PC_ARGS = (A.PC_W, A.PC_H, PC_OX, PC_OY)


def postcard_faces(variant='hero'):
    f, b = A.postcard_front(), A.postcard_back()
    A.damage('postcard', variant, f, b)
    return faces_of(f, b)


def postcard_flip(variant='hero'):
    """Lifted by one edge, flipped over in the air with the card flexing
    behind the turn, landed on its back with a bounce; then turned home."""
    faces = postcard_faces(variant)
    about_c = (PC_OX + A.PC_W / 2, PC_OY + A.PC_H / 2, 0)
    # (angle, lift, bow): anticipation, rise, the turn, the landing bounce
    half = [(-0.08, 0.0, -0.8), (0.24, 3.5, 1.8), (0.70, 7.0, 2.8), (1.24, 9.5, 2.6), (1.82, 10.0, 1.6),
            (2.38, 8.5, 0.4), (2.86, 5.5, -1.0), (3.24, 2.0, -1.6), (3.10, 0.0, 0.6), (3.1416, 1.0, 0.0),
            (3.1416, 0.0, 0.0)]
    seq = [(0.0, 0.0, 0.0)] + half + [(math.pi, 0.0, 0.0)] + [(a + math.pi, l, b) for (a, l, b) in half]
    out = []
    for (a, lift, bow) in seq:
        card = Card(*PC_ARGS, bow=bow, lift=lift)
        out.append(card_render(card, faces, PC_FW, PC_FH, PC_TAU, PC_RIM, R=rot_y(a),
                               about=(about_c[0], about_c[1], lift), f=220.0))
    return out


def contact(frames, path, cols=8, scale=3, bg=(34, 28, 36)):
    from PIL import Image
    fr = [np.asarray(f) for f in frames]
    h, w = fr[0].shape[:2]
    rows = (len(fr) + cols - 1) // cols
    sheet = Image.new('RGB', (w * cols, h * rows), bg)
    for i, f in enumerate(fr):
        im = Image.fromarray(f, 'RGBA')
        sheet.paste(im, ((i % cols) * w, (i // cols) * h), im)
    sheet.resize((w * cols * scale, h * rows * scale), Image.NEAREST).save(path)


def export_all(which=None, variants=('hero',) + A.VARIANTS):
    """Write every prop and its states to teahouse-assets/traveler_kit/."""
    done = []
    names = {'hero': '', 'clean': '_clean', 'worn': '_worn', 'dirty': '_dirty', 'repaired': '_repaired'}
    for v in variants:
        sfx = names[v]
        if which in (None, 'map'):
            faces = map_faces(v)
            anims = {'idle': map_idle(faces), 'turn': map_turn(faces)}
            if v in ('hero', 'clean', 'worn', 'dirty'):
                anims['unroll'] = map_unroll(faces)
            if v in ('hero', 'repaired'):
                anims['route'] = map_route(v)
            done.append(export_prop('world_map' + sfx, anims, FPS, note=NOTES['map'] + f' State: {v}.'))
        if which in (None, 'ticket'):
            faces = ticket_faces(v, punched=(v != 'clean'))
            anims = {'idle': card_idle(TK_ARGS, faces, TK_FW, TK_FH, TK_TAU, TK_RIM, 'br'),
                     'turn': card_turn(TK_ARGS, faces, TK_FW, TK_FH, TK_TAU, TK_RIM),
                     'punch': ticket_punch(v)}
            done.append(export_prop('train_ticket' + sfx, anims, FPS, note=NOTES['ticket'] + f' State: {v}.'))
        if which in (None, 'pass'):
            faces = pass_faces(v, stamped=(v != 'clean'))
            about = (BP_OX + A.BP_W / 2, BP_OY + A.BP_H / 2, 0)
            anims = {'idle': card_idle(BP_ARGS, faces, BP_FW, BP_FH, BP_TAU, BP_RIM, 'tr', size=7, base=0.1, amp=0.35,
                                       overlay_fn=lambda t, c: pass_overlay(1.4 * math.sin(2 * math.pi * t))),
                     'turn': card_turn(BP_ARGS, faces, BP_FW, BP_FH, BP_TAU, BP_RIM,
                                       overlay_fn=lambda c, R: pass_overlay(0, R, about)),
                     'stamp': pass_stamp(v)}
            done.append(export_prop('boat_pass' + sfx, anims, FPS, note=NOTES['pass'] + f' State: {v}.'))
        if which in (None, 'postcard'):
            faces = postcard_faces(v)
            anims = {'idle': card_idle(PC_ARGS, faces, PC_FW, PC_FH, PC_TAU, PC_RIM, 'tr', size=11, base=0.2,
                                       amp=0.75),
                     'turn': card_turn(PC_ARGS, faces, PC_FW, PC_FH, PC_TAU, PC_RIM, f=240.0, tilt=0.2),
                     'flip': postcard_flip(v)}
            done.append(export_prop('postcard' + sfx, anims, FPS, note=NOTES['postcard'] + f' State: {v}.'))
    return done


NOTES = {
    'map': 'The traveller\'s world map, a hand scroll on washi: an island chain with a snow volcano, forests, '
           'compass rose, rune labels and the dotted route by foot, ferry and rail to where the tea grows. '
           'idle: the stave end curls up and settles; turn: a full 3D turn (front, edge, back with the title slip '
           'and notes); unroll: the cord slips off and it unrolls left to right; route: the route draws itself.',
    'ticket': 'An Edmondson train ticket: salmon card, blue-black print, a vermilion class stripe, the loco, '
              'a violet date. idle: a corner lifts; turn: full 3D turn; punch: the conductor\'s punch bites a hole.',
    'pass': 'A ferry pass tag on jute string: sea-glass card, brass eyelet, a ship roundel, corner punched. '
            'idle: corner and string stir; turn: full 3D turn; stamp: a wooden hanko leaves a crooked red seal.',
    'postcard': 'A postcard: a dusk volcano over a lake with a torii in the water and black pines; the back '
                'has the message, a stamp and postmark. idle: a dog-ear flutters; turn: full 3D turn; flip: '
                'it is flipped over in the air and back.',
}


if __name__ == '__main__':
    if len(sys.argv) == 1 or sys.argv[1] == 'all':
        for d in export_all():
            print(d)
        sys.exit(0)
    if sys.argv[1] in ('map', 'ticket', 'pass', 'postcard'):
        for d in export_all(sys.argv[1]):
            print(d)
        sys.exit(0)
    if len(sys.argv) > 1 and sys.argv[1] == 'tkcheck':
        d = sys.argv[2]
        faces = ticket_faces()
        contact(card_idle(TK_ARGS, faces, TK_FW, TK_FH, TK_TAU, TK_RIM, 'br'), f'{d}/tk_idle.png', 8, 3)
        contact(card_turn(TK_ARGS, faces, TK_FW, TK_FH, TK_TAU, TK_RIM), f'{d}/tk_turn.png', 7, 3)
        contact(ticket_punch(), f'{d}/tk_punch.png', 8, 3)
    elif len(sys.argv) > 1 and sys.argv[1] == 'bpcheck':
        d = sys.argv[2]
        faces = pass_faces()
        contact(card_idle(BP_ARGS, faces, BP_FW, BP_FH, BP_TAU, BP_RIM, 'tr',
                          overlay_fn=lambda t, c: pass_overlay(1.2 * math.sin(2 * math.pi * t))), f'{d}/bp_idle.png', 8, 3)
        contact(card_turn(BP_ARGS, faces, BP_FW, BP_FH, BP_TAU, BP_RIM,
                          overlay_fn=lambda c, R: pass_overlay(0, R, (BP_OX + A.BP_W / 2, BP_OY + A.BP_H / 2, 0))),
                f'{d}/bp_turn.png', 7, 3)
        contact(pass_stamp(), f'{d}/bp_stamp.png', 7, 3)
    elif len(sys.argv) > 1 and sys.argv[1] == 'pccheck':
        d = sys.argv[2]
        faces = postcard_faces()
        contact(card_idle(PC_ARGS, faces, PC_FW, PC_FH, PC_TAU, PC_RIM, 'tr', size=11, base=0.2, amp=0.7),
                f'{d}/pc_idle.png', 8, 2)
        contact(card_turn(PC_ARGS, faces, PC_FW, PC_FH, PC_TAU, PC_RIM, f=240.0), f'{d}/pc_turn.png', 7, 2)
        contact(postcard_flip(), f'{d}/pc_flip.png', 8, 2)
    elif len(sys.argv) > 1 and sys.argv[1] == 'mapcheck':
        faces = map_faces()
        d = sys.argv[2]
        contact(map_idle(faces), f'{d}/m_idle.png', cols=8, scale=2)
        contact(map_turn(faces), f'{d}/m_turn.png', cols=7, scale=2)
        contact(map_unroll(faces), f'{d}/m_unroll.png', cols=7, scale=2)
        contact(map_route(), f'{d}/m_route.png', cols=6, scale=2)
