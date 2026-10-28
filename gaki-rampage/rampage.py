"""GAKI - the rampage. A pixel-art film under the blood moon.

The valley painted as pixel art in the teahouse pack's style (sets.py), and in
it the Gaki in its true shape (giant.py): a starved giant in a man's shape,
posed in 3D and drawn as pixel art (pixmon.py), slotted between the painted
layers by depth, so the mountain hides what is behind it. The lake goes still
and the bats rise; antennae come up behind the ridge, then the head, against a
moon six times its size; its hands slam onto the ridge and it hauls itself
over and stands; it walks down through the forest and wades the lake; it
comes to the clearing, crouches over the old pine and tears it out of the
ground, roots and all; it screams and snaps it in two; its face; black.

    python rampage.py out.mp4
    python rampage.py --still 12 18.5 ...      test frames
"""
import math
import os
import subprocess
import sys
from multiprocessing import Pool

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'teahouse-assets', 'generator'))
from raster3d import Camera, rot                                                   # noqa: E402
import giant as G                                                                  # noqa: E402
import pixmon                                                                      # noqa: E402
import comp                                                                        # noqa: E402
import sets as SETS                                                                # noqa: E402

W, H, FPS = 1280, 720, 24
BAR = 44                         # letterbox
CACHE = os.environ.get('GAKI_SETS', os.path.join(HERE, 'sets.pkl'))
FONTS = '/usr/share/fonts/opentype/'
SHOTS = [('establish', 0.0, 6.5), ('calm', 6.5, 11.0), ('ridge', 11.0, 22.0), ('stand', 22.0, 27.0),
         ('descent', 27.0, 33.0), ('lake', 33.0, 40.0), ('arrive', 40.0, 43.5), ('rip', 43.5, 51.0),
         ('roar', 51.0, 55.5), ('face', 55.5, 59.5), ('title', 59.5, 65.0)]
END = SHOTS[-1][2]
SET_OF = dict(establish='valley', calm='lake', ridge='ridge', stand='ridge', descent='valley', lake='lake',
              arrive='forest', rip='forest', roar='face', face='ridge', title=None)
FOG = (np.array([70, 26, 52], np.float32), 9000.0)                  # BGR
SADDLE_V = (128.0, 713.0, 3200.0)
T_TREMOR = 9.0
T_SLAM = (16.5, 17.5)
T_RIP = 49.0
T_SNAP = 53.4
WALK_P = 1.6                     # seconds a stride cycle
STRIDE = 0.6
GRIP = np.array([0.0, 20.0, 152.0])                                   # where it takes hold of the pine


# ---------------------------------------------------------------- helpers
def sm(a, b, t):
    u = min(1.0, max(0.0, (t - a) / (b - a)))
    return u * u * (3 - 2 * u)


def kf(t, keys):
    """Piecewise eased keyframes: [(time, value), ...] (values: numbers or arrays)."""
    if t <= keys[0][0]:
        return np.asarray(keys[0][1], float)
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            u = sm(t0, t1, t)
            return np.asarray(v0, float) * (1 - u) + np.asarray(v1, float) * u
    return np.asarray(keys[-1][1], float)


class SetCam(Camera):
    """The 3D camera that matches a set: looking straight down +z from (cx, cy,
    0) with the set's focal length, its centre shifted to the set's horizon."""

    def __init__(self, s, cx, ty):
        f = s['f']
        super().__init__((cx, s['cy'], 0.0), (cx, s['cy'], 1.0), 2 * math.degrees(math.atan(H / 2 / f)), W, H)
        self.focal = f
        self.shift = (0.0, 2 * s['y_h'] + ty - H / 2)

    def project(self, p):
        x, y, z = super().project(p)
        return x + self.shift[0], y + self.shift[1], z


def to_body(p, pos, yaw):
    return rot((0, 1, 0), -yaw) @ (np.asarray(p, float) - pos) / G.SCALE


def walk_pos(t0, z0, t):
    """Where a walk toward the camera that began at t0 has got to, and its stride phase."""
    v = 2 * STRIDE * G.SCALE / WALK_P
    a = max(0.0, t - t0)
    return z0 - a * v, 2 * math.pi * a / WALK_P


def steps_between(t0, t1, start):
    """Times a foot comes down in a walk that started at `start`."""
    out, k = [], 0
    while True:
        tt = start + WALK_P * (0.5 * k + 0.02)
        if tt > t1:
            return out
        if tt >= t0:
            out.append(tt)
        k += 1


def jerky(T, seed, k=1.0):
    return np.array(G.jerk(T, seed)) * k


# ---------------------------------------------------------------- what it does, shot by shot
def monster(name, T):
    """(params for giant.pose, root position, yaw) for this moment, or None."""
    yaw = math.pi
    if name == 'ridge':
        pos = np.array([0.0, float(kf(T, [(11, 300), (13, 350), (15.5, 450), (16.5, 460), (17.5, 480), (21, 600)])),
                        float(kf(T, [(11, 3360), (16.0, 3340), (17.5, 3300), (21, 3240)]))])
        scream = sm(20.2, 20.5, T) * (1 - sm(21.3, 21.8, T))
        head = jerky(T, 3) * (1 - sm(15.0, 15.6, T)) + np.array([0, -0.45, 0.25 * math.sin(T * 13)]) * scream
        P = dict(lean=float(kf(T, [(11, 0.5), (16.5, 0.5), (17.5, 0.95), (20, 0.95), (21, 0.6)])), head=tuple(head),
                 jaw=0.1 + 0.25 * max(0, math.sin(T * 6.5)) ** 12 * sm(13, 14, T) + 0.9 * scream, small=1.0, t=T)
        for n, (tgt, ts) in dict(R=(np.array([-125.0, 716, 3185]), T_SLAM[0]),
                                 L=(np.array([130.0, 712, 3185]), T_SLAM[1])).items():
            if T < ts - 0.6:
                continue
            u = sm(ts - 0.6, ts - 0.12, T)
            lift = tgt + np.array([0.0, 70.0, 50.0])
            start = pos + rot((0, 1, 0), yaw) @ np.array([0.4 * (1 if n == 'R' else -1), 0.5, 0.4]) * G.SCALE
            w = start * (1 - u) + lift * u if T < ts - 0.12 else lift + (tgt - lift) * sm(ts - 0.12, ts, T)
            P['hand' + n] = tuple(to_body(w, pos, yaw))
            P['curl' + n] = 0.2 + 0.7 * sm(ts, ts + 0.25, T)
        return P, pos, yaw
    if name in ('stand', 'descent'):
        X, Yr, Zr = SADDLE_V
        if name == 'stand':
            X = 0.0
        if T < 25.0:
            pos = np.array([X, float(kf(T, [(22, 600), (23.6, Yr)])), float(kf(T, [(22, 3240), (23.6, 3175)]))])
            scream = sm(23.9, 24.1, T) * (1 - sm(24.8, 25.1, T))
            head = jerky(T, 4) * (1 - scream) + np.array([0, -0.4, 0.2 * math.sin(T * 14)]) * scream
            P = dict(lean=float(kf(T, [(22, 0.9), (23.6, 0.35), (25, 0.3)])), head=tuple(head),
                     jaw=0.1 + 0.9 * scream, small=1.0 + scream, t=T)
            if scream > 0:                                              # arms flung out as it screams
                P['handL'] = tuple(np.array([-0.36, 0.3, 0.25]) * (1 - scream) + np.array([-0.9, 1.3, 0.3]) * scream)
                P['handR'] = tuple(np.array([0.36, 0.3, 0.25]) * (1 - scream) + np.array([0.9, 1.3, 0.3]) * scream)
                P['curlL'] = P['curlR'] = 0.1
            for n, x in (('R', X - 125), ('L', X + 130)):
                if T < 23.0:
                    P['hand' + n] = tuple(to_body(np.array([x, 716.0, 3185.0]), pos, yaw))
                    P['curl' + n] = 0.9
            return P, pos, yaw
        z, ph = walk_pos(25.0, 3175.0, T)
        pos = np.array([X + 6 * math.sin(T * 0.4), float(np.interp(z, [2050, 3175], [80, Yr])), z])
        return G.walk(T, ph, stride=STRIDE, lean=0.5), pos, yaw
    if name == 'lake':
        z, ph = walk_pos(33.0, 1500.0, T)
        return G.walk(T, ph, stride=STRIDE, lean=0.5), np.array([40.0, -50.0, z]), yaw
    if name == 'arrive':
        u = sm(40.0, 42.6, T)
        pos = np.array([150 - 150 * u, 0.0, 650 - 290 * u])
        ph = min(2 * math.pi * (T - 40.0) / WALK_P, 3 * math.pi)
        P = G.walk(T, ph, stride=STRIDE * (1 - 0.6 * sm(42.2, 42.8, T)), lean=0.5)
        return P, pos, yaw - 0.3 * (1 - u)
    if name == 'rip':
        c = sm(43.5, 46.0, T)
        rise = sm(49.5, 51.0, T)
        pos = np.array([0.0, 0.0, 360.0])
        P = dict(pelvis=(0, 1.14 - 0.54 * c + 0.2 * rise, 0), lean=0.5 + 0.85 * c - 0.3 * rise,
                 head=tuple(jerky(T, 6, 0.5) + np.array([0, 0.3 * c - 0.35 * rise, 0])),
                 jaw=0.1 + 0.3 * max(0, math.sin(T * 7)) ** 10 + 0.5 * sm(48.6, 49.2, T) * (1 - rise),
                 footL=(-0.36, 0, 0.1), footR=(0.36, 0, 0.1), small=1.0, t=T, curlL=0.4,
                 curlR=float(kf(T, [(46, 0.4), (46.8, 0.05), (47.6, 0.05), (48.0, 0.95)])))
        hand = kf(T, [(45.6, (-70, 200, 280)), (46.8, (-20, 80, 200)), (47.6, (0, 30, 158)), (48.0, GRIP),
                      (48.6, GRIP + np.array([0, 3, 0])), (49.0, GRIP + np.array([0, 26, 4])),
                      (49.5, (0, 80, 200)), (51.0, (10, 200, 250))])
        hand = hand + np.array([0, 1.5, 0]) * math.sin(T * 40) * sm(48.0, 49.0, T) * (1 - sm(49.0, 49.1, T))
        if T > 45.6:
            P['handR'] = tuple(to_body(hand, pos, yaw))
        return P, pos, yaw
    if name == 'roar':
        pos = np.array([-20.0, 0.0, 440.0])
        up = sm(51.0, 52.0, T)
        scream = sm(51.6, 51.9, T) * (1 - sm(53.1, 53.5, T))
        turn = sm(54.6, 54.75, T)
        head = (np.array([0.15 * (1 - turn), -0.25 * up, 0]) + np.array([0, -0.4, 0.25 * math.sin(T * 13)]) * scream
                + jerky(T, 8, 0.3) * (1 - scream))
        P = dict(pelvis=(0, 0.95 + 0.15 * up, 0), lean=1.0 - 0.6 * up, head=tuple(head),
                 jaw=0.15 + 0.85 * scream + 0.4 * sm(53.4, 53.6, T) * (1 - sm(54, 54.5, T)), small=1.0 + scream, t=T,
                 curlL=0.4, curlR=1.0)
        hand = kf(T, [(51, (40, 200, 300)), (52, (40, 240, 290)), (53.3, (35, 250, 288)), (53.6, (30, 236, 290))])
        P['handR'] = tuple(to_body(hand, pos, yaw))
        P['handL'] = tuple(to_body(kf(T, [(51, (-80, 120, 400)), (53.2, (-60, 230, 300)), (53.6, (-30, 245, 290)),
                                          (54.4, (-90, 120, 380))]), pos, yaw))
        return P, pos, yaw
    if name == 'face':
        snap = sm(56.5, 56.62, T)
        lunge = sm(58.8, 59.35, T)
        pos = np.array([0.0, 70.0 - 190 * lunge, 1300 - 820 * lunge])
        head = (jerky(T, 9) * (1 - snap) + np.array([0, 0.1, 0]) * snap +
                np.array([0.0, 0.0, 0.18 * math.sin(T * 9)]) * sm(57.4, 57.6, T))
        P = dict(lean=0.5 + 0.3 * lunge, head=tuple(head), small=1.0, t=T,
                 jaw=0.12 + 0.5 * sm(57.4, 57.6, T) * (1 - sm(58.2, 58.5, T)) + 1.0 * lunge)
        return P, pos, yaw
    return None


# ---------------------------------------------------------------- the giant, as pixel art
class Beast:
    def __init__(self):
        self.body = G.Body()

    def render(self, s, cx, ty, P, pos, yaw, water=False, bright=0.0):
        J = G.pose(**P)
        mesh = G.place_mesh(self.body.build(J), pos, yaw)
        cam = SetCam(s, cx, ty)
        art, dep = pixmon.draw(cam, [mesh], bright=bright)
        rgba = np.repeat(np.repeat(art, 2, 0), 2, 1)
        d = np.repeat(np.repeat(dep, 2, 0), 2, 1)
        a = rgba[..., 3].astype(np.float32) / 255
        col = rgba[..., 2::-1].astype(np.float32)
        f = (1 - np.exp(-np.minimum(d, 1e6) / FOG[1]))[..., None] * 0.8     # distance: into the night air
        col = col * (1 - f) + FOG[0] * f
        if water:                                                       # under the lake, nothing shows
            Yw = comp.to_world(s, cx, ty, 0, np.arange(H)[:, None] + 0.5, np.maximum(d, 1))[1]
            a = a * (Yw > 0)
        return (col, a, d), J, cam


def eye_points(J, pos, yaw):
    return [G.place((J['head'] + J['Rh'] @ np.array([0.045 * s, 0.022, 0.117]))[None], pos, yaw)[0] for s in (-1, 1)]


def glow(img, pts, colour, radius, k):
    g = np.zeros((H, W), np.float32)
    for (x, y, w) in pts:
        if -radius < x < W + radius and -radius < y < H + radius:
            cv2.circle(g, (int(x), int(y)), max(1, int(radius * 0.25)), float(w), -1)
    if g.any():
        g = cv2.GaussianBlur(g, (0, 0), radius * 0.45)
        img += g[..., None] * np.array(colour, np.float32) * k


# ---------------------------------------------------------------- what flies
class Debris:
    """Stones, clods, splinters and torn needles thrown by an event, with
    gravity: 2D sprites in the 3D world."""

    def __init__(self, sprites):
        self.sp = {k: [comp.x2(a) for a in v] for k, v in sprites.items()}
        self.events = []

    def burst(self, t0, at, n, kinds, speed, up, seed, g=40.0, life=3.0, spread=1.0, scale=1.0):
        r = np.random.RandomState(seed)
        for i in range(n):
            k = kinds[r.randint(len(kinds))]
            v = np.array([r.normal(0, speed * spread), r.uniform(0.3, 1.0) * up, r.normal(0, speed * spread * 0.4)])
            self.events.append(dict(t0=t0 + r.uniform(0, 0.25), p0=np.asarray(at, float) + r.normal(0, 3, 3) * spread,
                                    v=v * (0.6 if k == 'leaf' else 1), k=k, i=r.randint(6), spin=r.uniform(-8, 8),
                                    g=g if k != 'leaf' else 10.0, life=life * r.uniform(0.6, 1.2),
                                    flut=r.uniform(0, 6.3), sc=scale))

    def draw(self, img, T, s, cx, ty):
        for e in self.events:
            a = T - e['t0']
            if a < 0 or a > e['life']:
                continue
            p = e['p0'] + e['v'] * a - np.array([0, 0.5 * e['g'] * a * a, 0])
            if e['k'] == 'leaf':
                p = p + np.array([math.sin(a * 3 + e['flut']) * 6, 0, 0])
            if p[2] < 2:
                continue
            x, y = comp.to_screen(s, cx, ty, p[0], p[1], p[2])
            spr = self.sp[e['k']][e['i']]
            if e['sc'] != 1.0:
                spr = cv2.resize(spr, None, fx=e['sc'], fy=e['sc'], interpolation=cv2.INTER_NEAREST)
            h_, w_ = spr.shape[:2]
            M = cv2.getRotationMatrix2D((w_ / 2, h_ / 2), e['spin'] * a * 30, 1.0)
            spr = cv2.warpAffine(spr, M, (w_, h_), flags=cv2.INTER_NEAREST)
            comp.over(img, spr, int(x - w_ / 2), int(y - h_ / 2), alpha=min(1.0, (e['life'] - a) * 2))


def dust(img, T, events, s, cx, ty):
    """Dust rolling out from where things hit: flat, round, painted puffs."""
    for (t0, X, Y, Z, size, seed) in events:
        a = T - t0
        if a < 0 or a > 4:
            continue
        r = np.random.RandomState(seed)
        layer = np.zeros((H, W), np.float32)
        for k in range(12):
            ang = r.uniform(0, 2 * math.pi)
            d = size * (0.3 + a * r.uniform(0.3, 0.8))
            p = (X + math.cos(ang) * d, Y + a * size * 0.12 * r.uniform(0.5, 1.5), Z + math.sin(ang) * d * 0.4)
            x, y = comp.to_screen(s, cx, ty, *p)
            rad = (size * (0.3 + 0.5 * a)) * s['f'] / max(p[2], 1)
            if rad >= 1 and -rad < x < W + rad and -rad < y < H + rad:
                cv2.circle(layer, (int(x), int(y)), int(rad), 1.0, -1)
        layer = (cv2.GaussianBlur(layer, (0, 0), 2) > 0.5).astype(np.float32) * 0.35 * (1 - a / 4)
        img[:] = img * (1 - layer[..., None]) + np.array([62, 40, 74], np.float32) * layer[..., None]


def ripples(img, T, s, cx, ty, rings, colour=(110, 70, 150)):
    """Rings on the water (flat ellipses, drawn), each (time, X, Z, speed)."""
    for (t0, X, Z, v) in rings:
        a = T - t0
        if a < 0 or a > 3.5:
            continue
        x, y = comp.to_screen(s, cx, ty, X, 0.0, Z)
        for k in range(3):
            rx = (4 + v * a) * (1 + 0.35 * k) * s['f'] / Z
            ry = max(1.0, rx * s['cy'] / Z * 2.5)
            fade = (1 - a / 3.5) * (1 - 0.25 * k)
            cv2.ellipse(img, (int(x), int(y)), (int(rx), int(ry)), 0, 0, 360, tuple(float(c) * fade for c in colour),
                        2, cv2.LINE_8)


def swarm(img, J, pos, yaw, cam, T, n=300, seed=3, depth=None):
    """Flies, always round it: dark specks, two pixels square."""
    r = np.random.RandomState(seed)
    base = r.normal(0, 1, (n, 3)) * np.array([0.5, 0.6, 0.5])
    ph = r.uniform(0, 6.3, n)
    sp = r.uniform(0.6, 1.6, n)
    c = (J['chest'] + J['head']) / 2
    p = c + base + 0.18 * np.stack([np.sin(T * sp + ph), np.cos(T * sp * 1.3 + ph), np.sin(T * sp * 0.7 + ph * 2)], 1)
    x, y, z = cam.project(G.place(p, pos, yaw))
    ok = (z > 5) & (x > 1) & (x < W - 2) & (y > 1) & (y < H - 2)
    xi, yi = (x[ok] // 2 * 2).astype(int), (y[ok] // 2 * 2).astype(int)
    if depth is not None:
        vis = depth[yi, xi] > z[ok] - 2
        xi, yi = xi[vis], yi[vis]
    for dy in (0, 1):
        for dx in (0, 1):
            img[yi + dy, xi + dx] = np.array([16, 10, 18])


# ---------------------------------------------------------------- the film
class Film:
    def __init__(self):
        self.S = SETS.load(CACHE)
        self.beast = Beast()
        fo = self.S['forest']
        self.slam = Debris(fo['debris'])
        self.slam.burst(T_SLAM[0], (-125, 716, 3180), 40, ['stone', 'clod'], 25, 40, 1, g=60, life=4, scale=3.0)
        self.slam.burst(T_SLAM[1], (130, 712, 3180), 36, ['stone', 'clod'], 25, 40, 2, g=60, life=4, scale=3.0)
        self.rip = Debris(fo['debris'])
        self.rip.burst(T_RIP, (0, 2, 150), 80, ['stone', 'clod', 'clod', 'leaf'], 9, 26, 3, g=30, life=3.5)
        self.snap = Debris(fo['debris'])
        self.dust_ridge = [(T_SLAM[0], -125, 716, 3185, 60, 1), (T_SLAM[1], 130, 712, 3185, 60, 2)]
        self.dust_forest = [(T_RIP, 0, 0, 150, 18, 3), (41.0, 60, 0, 520, 50, 4), (42.2, 20, 0, 420, 50, 5)]
        self.up = comp.x2(fo['uprooted'])
        self.hole = comp.x2(fo['hole'])
        bx, by = fo['uprooted_base']
        self.grip_px = (2 * bx, 2 * by * 0.78)                          # where the trunk is held, in the sprite
        self.split = int(2 * by * 0.55)                                 # where it snaps
        self.fonts = {}
        self.shake_ev = [(T_SLAM[0], 9, 0.8), (T_SLAM[1], 9, 0.8), (24.0, 4, 1.2), (41.0, 10, 0.7), (42.2, 10, 0.7),
                         (T_RIP, 12, 1.0), (T_SNAP, 6, 0.6), (51.6, 5, 1.4), (58.9, 14, 0.6)]
        self.shake_ev += [(t0, 2.5, 0.4) for t0 in steps_between(25.0, 33.0, 25.0)]
        self.shake_ev += [(t0, 4, 0.5) for t0 in steps_between(33.0, 40.0, 33.0)]
        self.lake_steps = steps_between(33.0, 40.0, 33.0)
        r = np.random.RandomState(12)                                   # the tremor: rings all over the still lake
        self.tremor_rings = [(T_TREMOR + r.uniform(0, 2), r.uniform(-500, 500), r.uniform(60, 600), 12)
                             for _ in range(26)]

    def shake(self, T):
        k = 0.0
        for (t0, amp, dur) in self.shake_ev:
            if t0 <= T < t0 + dur:
                k += amp * (1 - (T - t0) / dur) ** 2
        if T_TREMOR <= T < 11.0:
            k += 1.2 + 1.5 * sm(T_TREMOR, 11.0, T)
        return np.array([math.sin(T * 61) + 0.5 * math.sin(T * 37), math.cos(T * 53) + 0.5 * math.sin(T * 29)]) * k

    def text(self, key, s, size, font):
        if key not in self.fonts:
            f = ImageFont.truetype(font, size)
            im = Image.new('L', (W, size * 2), 0)
            d = ImageDraw.Draw(im)
            d.text(((W - d.textlength(s, font=f)) / 2, size * 0.3), s, font=f, fill=255)
            self.fonts[key] = np.asarray(im, np.float32) / 255
        return self.fonts[key]

    def frame(self, fi):
        T = fi / FPS
        name, t0, t1 = next((s for s in SHOTS if s[1] <= T < s[2]), SHOTS[-1])
        img = self.title(T, t0) if name == 'title' else self.shot(name, T, (T - t0) / (t1 - t0))
        return self.finish(img, T, fi)

    def camera(self, name, T, u):
        if name == 'establish':
            return -150 + 220 * sm(0, 6.5, T), -10 + 10 * u
        if name == 'calm':
            return -20 + 40 * u, 0.0
        if name == 'ridge':
            return 0.0, float(kf(T, [(11, -20), (15, 0), (21, 50), (22, 60)]))
        if name == 'stand':
            return 0.0, float(kf(T, [(22, 60), (23.6, 330), (25, 330), (27, 250)]))
        if name == 'descent':
            return float(kf(T, [(27, 40), (33, 140)])), float(kf(T, [(27, 0), (33, -20)]))
        if name == 'lake':
            return float(kf(T, [(33, 0), (40, 20)])), 0.0
        if name in ('arrive', 'rip'):
            return float(kf(T, [(40, 0.4), (43.5, 0.0)])), float(kf(T, [(40, 0), (42.6, 160), (43.5, 150), (49.3, 150),
                                                                         (51, 700)]))
        if name == 'roar':
            return 0.0, float(kf(T, [(51, 190), (55.5, 250)]))
        return 0.0, 0.0

    def shot(self, name, T, u):
        s = self.S[SET_OF[name]]
        cx, ty = self.camera(name, T, u)
        hide = ['bats'] if (name == 'establish' or (name == 'calm' and T < T_TREMOR + 0.4)) else []
        sprites = []
        M = monster(name, T)
        mon = J = cam = None
        if M is not None:
            P, pos, yaw = M
            mon, J, cam = self.beast.render(s, cx, ty, P, pos, yaw, water=(name == 'lake'),
                                            bright=0.08 if name in ('face', 'roar') else 0.0)
        if name in ('rip', 'roar') and T >= T_RIP:                    # the pine, torn out, in its fist
            hide.append('oldtree')
            hp = J['wrR'] + (J['wrR'] - J['elR']) * 0.15
            Pw = G.place(hp[None], pos, yaw)[0]
            x, y = comp.to_screen(s, cx, ty, *Pw)
            k = float(np.clip(150.0 / max(Pw[2], 1), 0.2, 1.5))
            tilt = -10 * sm(T_RIP, T_RIP + 0.8, T) + 4 * math.sin(T * 2.1) - 25 * sm(51, 52.5, T)
            spr = self.up if T < T_SNAP else self.up[self.split:]
            gy = self.grip_px[1] - (0 if T < T_SNAP else self.split)
            self.place_sprite(sprites, spr, k, tilt, x, y, self.grip_px[0], gy, Pw[2] - 8)
            if T >= T_SNAP:                                             # the top half, flung away
                a = T - T_SNAP
                Pt = Pw + np.array([-60 * a, 30 * a - 35 * a * a, 15 * a])
                xt, yt = comp.to_screen(s, cx, ty, *Pt)
                self.place_sprite(sprites, self.up[:self.split], k, tilt - 160 * a, xt, yt, self.grip_px[0],
                                  self.split, Pt[2])
        extra = {}
        if name == 'rip' and T >= T_RIP - 0.05:                        # the hole it leaves
            bx, by = s['tree_px']

            def hole_fn(img, s=s, cx=cx, ty=ty, bx=bx, by=by):
                lay = [l for l in s['layers'] if l['name'] == 'ground'][0]
                x0, y0 = comp.offset(s, lay, cx, ty)
                comp.over(img, self.hole, x0 + 2 * bx - self.hole.shape[1] // 2, y0 + 2 * by - self.hole.shape[0] // 2)
            extra['ground'] = hole_fn
        img = comp.composite(s, cx, ty, T, monster=mon, hide=hide, extra=extra, sprites=sprites)
        if name in ('establish', 'calm'):                               # fireflies
            r = np.random.RandomState(5)
            n = 60
            bx, by, ph = r.uniform(0, W, n), r.uniform(H * 0.5, H * 0.85, n), r.uniform(0, 6.3, n)
            pts = [(bx[i] + 20 * math.sin(T * 0.7 + ph[i]), by[i] + 12 * math.sin(T * 1.1 + ph[i] * 2),
                    max(0.0, math.sin(T * 2.2 + ph[i] * 3)) ** 3 * (1 - sm(T_TREMOR, T_TREMOR + 1, T))) for i in range(n)]
            glow(img, pts, (60, 200, 255), 10, 1.4)
        if name == 'calm':
            ripples(img, T, s, cx, ty, self.tremor_rings)
        if J is not None:
            pts = []
            for p in eye_points(J, pos, yaw):
                x, y, z = cam.project(p[None])
                xi, yi = int(np.clip(x[0], 0, W - 1)), int(np.clip(y[0], 0, H - 1))
                if z[0] > 0 and mon[2][yi, xi] >= z[0] - 30:
                    pts.append((x[0], y[0], 1.0 if name != 'ridge' else sm(15.2, 15.7, T) * 1.4 + 0.2))
            zmin = mon[2][mon[1] > 0].min() if (mon[1] > 0).any() else 1e9
            glow(img, pts, (30, 70, 255), max(8, 0.06 * G.SCALE * cam.focal / max(1, zmin)), 0.5)
            swarm(img, J, pos, yaw, cam, T, depth=mon[2])
        if name == 'ridge':
            self.slam.draw(img, T, s, cx, ty)
            dust(img, T, self.dust_ridge, s, cx, ty)
        if name in ('arrive', 'rip'):
            dust(img, T, self.dust_forest, s, cx, ty)
            self.rip.draw(img, T, s, cx, ty)
        if name == 'roar':
            self.snap_draw(img, T, s, cx, ty)
        if name == 'lake':
            self.lake_fx(img, T, s, cx, ty, J, pos, yaw)
        return img

    def place_sprite(self, sprites, spr, k, tilt, x, y, gx, gy, Z):
        """A sprite held at its point (gx, gy), scaled and turned, as a depth-sorted sprite."""
        if abs(k - 1) > 0.05:
            spr = cv2.resize(spr, None, fx=k, fy=k, interpolation=cv2.INTER_NEAREST)
            gx, gy = gx * k, gy * k
        h_, w_ = spr.shape[:2]
        pad = int(max(h_, w_))
        big = np.zeros((h_ + 2 * pad, w_ + 2 * pad, 4), np.uint8)
        big[pad:pad + h_, pad:pad + w_] = spr
        Mr = cv2.getRotationMatrix2D((gx + pad, gy + pad), tilt, 1.0)
        big = cv2.warpAffine(big, Mr, (big.shape[1], big.shape[0]), flags=cv2.INTER_NEAREST)
        sprites.append((Z, big, int(x - gx - pad), int(y - gy - pad)))

    def snap_draw(self, img, T, s, cx, ty):
        if not self.snap.events:
            P, ps, yw = monster('roar', T_SNAP)
            Jc = G.pose(**P)
            hp = G.place((Jc['wrR'] + (Jc['wrR'] - Jc['elR']) * 0.15)[None], ps, yw)[0]
            self.snap.burst(T_SNAP, hp + np.array([0, 25, 0]), 90, ['splinter', 'splinter', 'leaf', 'leaf', 'clod'],
                            14, 10, 7, g=18, life=3.0, scale=1.6)
        self.snap.draw(img, T, s, cx, ty)

    def lake_fx(self, img, T, s, cx, ty, J, pos, yaw):
        """Spray where its feet come down, rings on the water, foam round the shins."""
        rings = []
        for i, ts in enumerate(self.lake_steps):
            a = T - ts
            if a < 0 or a > 4:
                continue
            Pf = G.place(J['ankle' + ('R' if i % 2 else 'L')][None], pos, yaw)[0]
            rings.append((ts, Pf[0], Pf[2], 55))
            if a < 2.2:
                r = np.random.RandomState(i)
                v = np.stack([r.normal(0, 14, 140), r.uniform(25, 75, 140), r.normal(0, 8, 140)], 1)
                for q in Pf * np.array([1, 0, 1]) + v * a - np.array([0, 0.5 * 38 * a * a, 0]):
                    if q[1] < 0:
                        continue
                    x, y = comp.to_screen(s, cx, ty, *q)
                    if 0 <= x < W - 2 and 0 <= y < H - 2:
                        img[int(y) // 2 * 2:int(y) // 2 * 2 + 2, int(x) // 2 * 2:int(x) // 2 * 2 + 2] = (150, 120, 225)
        ripples(img, T, s, cx, ty, rings)
        for side in 'LR':
            for jn in ('ankle', 'knee'):
                p = G.place(J[jn + side][None], pos, yaw)[0]
                if p[1] > 0:
                    continue
                x, y = comp.to_screen(s, cx, ty, p[0], 0, p[2])
                w = 22 * s['f'] / p[2]
                cv2.ellipse(img, (int(x), int(y)), (int(w), max(2, int(w * 0.08))), 0, 0, 360, (130, 100, 210), -1)

    def title(self, T, t0):
        img = np.zeros((H, W, 3), np.float32)
        a = sm(t0 + 0.6, t0 + 1.8, T)
        jp = self.text('jp', '餓鬼', 96, FONTS + 'ipafont-gothic/ipagp.ttf')
        en = self.text('en', 'G A K I', 40, FONTS + 'inter/Inter-Thin.otf')
        for m, y, col, k in ((jp, 230, (40, 30, 210), a), (en, 380, (150, 150, 200), sm(t0 + 1.6, t0 + 2.8, T))):
            al = m[..., None] * k
            g = cv2.GaussianBlur(m, (0, 0), 10)[..., None] * k * 0.6
            img[y:y + m.shape[0]] = img[y:y + m.shape[0]] * (1 - al) + np.array(col, np.float32) * (al + g)
        return img

    def finish(self, img, T, fi):
        sh = self.shake(T)
        if np.abs(sh).max() > 0.3:
            img = cv2.warpAffine(img, np.float32([[1, 0, round(sh[0])], [0, 1, round(sh[1])]]), (W, H),
                                 borderMode=cv2.BORDER_REFLECT)
        b = cv2.GaussianBlur(np.clip(img - 170, 0, 85), (0, 0), 9)          # bloom: moon, eyes, fire
        img = img + b * 0.6
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        img = img * (1 - 0.14 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2))[..., None]
        fade = sm(0, 1.4, T) * (1 - sm(END - 1.0, END - 0.1, T))
        if 59.35 <= T < 59.5:                                                # the cut to black
            fade = 0
        img = img * fade
        img[:BAR] = 0
        img[H - BAR:] = 0
        return np.clip(img, 0, 255).astype(np.uint8)


_FILM = None


def _init():
    global _FILM
    _FILM = Film()


def _frame(i):
    return _FILM.frame(i).tobytes()


def film(out, workers=4, a=0, b=None, crf=20):
    n = int(END * FPS)
    b = n if b is None else b
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s',
                           '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf',
                           str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    SETS.load(CACHE)
    with Pool(workers, initializer=_init) as pool:
        for k, fr in enumerate(pool.imap(_frame, range(a, b), chunksize=2)):
            ff.stdin.write(fr)
            if k % 48 == 0:
                print('frame', a + k, '/', b, flush=True)
    ff.stdin.close()
    ff.wait()


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--still':
        f = Film()
        for t in args[1:]:
            cv2.imwrite('still_%s.png' % t, f.frame(int(round(float(t) * FPS))))
    else:
        film(args[0] if args else 'gaki_rampage.mp4')
