"""GAKI - the hunger that walks.

A one-minute cinematic in the void style: black crumpled paper, boiling white
scribbled outlines, scribbled eyes, a cosmic nebula. The lore; the valley; the
mountain cracking and a swarm pouring out of it; the swarm building a giant;
the giant running down through the forest and out across the sea, everything
it passes rotting into the void; the sky tearing open; its face.

    python cinematic.py out.mp4                 the film
    python cinematic.py --still 24.5 31 ...     test frames (png) at those times
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
from raster3d import Camera, render                                                    # noqa: E402
from style import nebula, crumple, scribble, glow, grade, void_figure, fbm            # noqa: E402
from creature import Rig, pose, place, SCALE                                           # noqa: E402
from world import World, sky, height, shore, smooth, FORM                              # noqa: E402

W, H, FPS, SS = 1280, 720, 24, 2
FONTS = '/usr/share/fonts/opentype/'
FONT, FONT_THIN, FONT_JP = FONTS + 'inter/Inter-ExtraLight.otf', FONTS + 'inter/Inter-Thin.otf', \
    FONTS + 'ipafont-gothic/ipagp.ttf'
INK = np.array([242, 246, 250], np.float32)                     # BGR, a warm white
LIGHT = (0.7, 0.62, -0.2)

# ---------------------------------------------------------------- the story, in seconds
SHOTS = [('card1', 0.0, 4.5), ('card2', 4.5, 9.5), ('valley', 9.5, 12.5), ('crack', 12.5, 15.5),
         ('card3', 15.5, 19.0), ('forming', 19.0, 30.0), ('forest', 30.0, 39.0), ('sea', 39.0, 50.0),
         ('face', 50.0, 55.5), ('title', 55.5, 61.0)]
END = SHOTS[-1][2]
CARDS = {'card1': ["Long before the teahouse,", "people lived in this valley."],
         'card2': ["They wanted more.", "They emptied the mountain. Then the sea. Then each other.",
                   "Then they were gone."],
         'card3': ["But greed does not die with the hungry.", "It sank into the stone, and waited."]}
SUBS = [(26.6, 29.6, "It remembers their shape.")]
T_CRACK = 13.1                   # the mountain opens
T_GROW = (20.0, 26.8)            # the swarm builds the body, feet first
T_TEND = (25.4, 29.0)            # the tendrils grow out
T_RISE = (25.0, 28.4)            # it stands
T_EYES = 27.8                    # the eyes light
T_RUN = 29.3                     # it runs
V_RUN, STRIDE = 95.0, 110.0      # m/s, m per stride (two steps)
TEAR = (42.0, 49.6)              # the sky tears open
GY = float(height(*FORM))
CENTRE = np.array([FORM[0], GY, FORM[1]])


# ---------------------------------------------------------------- where it is
def _distance_table():
    ts = np.arange(T_GROW[0] - 2, END + 1, 1 / 96)
    v = V_RUN * smooth(T_RUN, T_RUN + 1.6, ts)
    return ts, np.concatenate([[0], np.cumsum((v[1:] + v[:-1]) / 2 * np.diff(ts))])


_TS, _S = _distance_table()


def dist(T):
    return float(np.interp(T, _TS, _S))


def speed(T):
    return V_RUN * float(smooth(T_RUN, T_RUN + 1.6, T))


def track(s):
    """Its path: down from the mountain shoulder, through the forest, out to sea."""
    return FORM[0] + 70 * math.sin(s / 420), FORM[1] - s


def heading(s):
    return math.atan2(70 / 420 * math.cos(s / 420), -1)


def ground(x, z):
    return max(float(height(x, z)), 0.0)                     # at sea it runs on the water


def giant(T):
    """Its state at time T: joints, root position and heading, and how far it
    has formed."""
    s = dist(T)
    x, z = track(s)
    run = speed(T) / V_RUN
    crouch = 1 - float(smooth(*T_RISE, T))
    sway = 0.3 * math.sin(T * 0.8) * crouch if T < T_RUN else 0.0
    look = 0.25 * math.sin(T * 0.5) * crouch
    J = pose(2 * math.pi * s / STRIDE, run=run, lean=0.32, crouch=crouch, look=look, sway=sway)
    yaw = heading(s)
    fwd = np.array([math.sin(yaw), 0, math.cos(yaw)])
    return dict(J=J, pos=np.array([x, ground(x, z) - (2.0 if z > shore(x) else 3.5), z]), yaw=yaw, run=run,
                vel=fwd * speed(T), grow=(T - T_GROW[0]) / (T_GROW[1] - T_GROW[0]) * 1.12,
                tgrow=float(smooth(*T_TEND, T)), eyes=float(smooth(T_EYES, T_EYES + 0.35, T)), t=T,
                drag=np.array([0, 0.25, -1.0]) * run + np.array([0, 0.2, -0.15]) * (1 - run))


def idle(T):
    """Standing in the void, for the close-up: it breathes, and turns to look."""
    look = 0.55 * (1 - float(smooth(51.2, 52.6, T))) - 0.08
    J = pose(0.0, run=0.0, lean=0.0, crouch=0.06 + 0.03 * math.sin(T * 1.4), look=look,
             sway=0.06 * math.sin(T * 0.7))
    return dict(J=J, pos=np.zeros(3), yaw=-0.5, run=0.0, vel=np.zeros(3), grow=2.0, tgrow=1.0, eyes=1.0, t=T,
                drag=np.array([0, 0.3, -0.25]))


def _steps():
    """Every footfall: where, when, on land or water, and how far its rot spreads.
    The first is the mountain shoulder itself, dying as the body forms on it."""
    out = [(FORM[0], FORM[1], T_GROW[0] - 0.5, False, 170.0, 3.5)]
    ts = np.arange(T_RUN + 0.6, END, 1 / 96)
    for n in 'LR':
        ys, ps = [], []
        for T in ts:
            st = giant(T)
            ys.append(st['J']['toe' + n][1])
            ps.append(place(st['J']['toe' + n][None], st['pos'], st['yaw'])[0])
        ys = np.array(ys)
        for i in range(1, len(ys) - 1):
            if ys[i] <= ys[i - 1] and ys[i] < ys[i + 1] and ys[i] < 0.2:
                x, z = ps[i][0], ps[i][2]
                water = z < shore(x) - 8
                out.append((x, z, ts[i], water, 36.0, 0.8))
    return np.array(out, dtype=object)


STEPS = _steps()
SX, SZ = STEPS[:, 0].astype(float), STEPS[:, 1].astype(float)
ST, SW = STEPS[:, 2].astype(float), STEPS[:, 3].astype(bool)
SR, STAU = STEPS[:, 4].astype(float), STEPS[:, 5].astype(float)


def water_radius(a):
    return np.minimum(16 + 24 * np.maximum(a, 0) ** 0.8, 320)


def rot_field(X, Z, T, water):
    """> 0 where the ground (or the water) has rotted by time T."""
    r = np.full(len(X), -1.0)
    for i in np.where((SW == water) & (ST <= T))[0]:
        a = T - ST[i]
        rad = water_radius(a) if water else SR[i] * (1 - math.exp(-a / STAU[i]))
        d = np.hypot(X - SX[i], Z - SZ[i])
        r = np.maximum(r, (rad - d) / (0.3 * rad + 3))
    n = np.sin(X * 0.08 + np.sin(Z * 0.05) * 2.0) * np.sin(Z * 0.09 + np.sin(X * 0.06) * 2.0)
    return r + 0.35 * n


def shake(T, amp):
    """Camera shake from each footfall (and the mountain cracking)."""
    k = 0.0
    for t in list(ST[1:][ST[1:] <= T][-6:]) + ([T_CRACK] if T >= T_CRACK else []):
        k += math.exp(-(T - t) / 0.3)
    k = amp * min(k, 1.6)
    return np.array([math.sin(T * 53), math.sin(T * 41 + 1), math.sin(T * 37 + 2)]) * k


def crack(T):
    """The fissure across the mountain shoulder: its two lips, opening."""
    op = float(smooth(T_CRACK, T_CRACK + 1.4, T))
    u = np.linspace(-1, 1, 41)
    x = FORM[0] + u * 80
    zc = FORM[1] + 9 * np.sin(u * 5.0) + 4 * np.sin(u * 13)
    w = op * 11 * (1 - u ** 2) ** 0.7 * (0.7 + 0.3 * np.sin(u * 17) ** 2) + 0.4
    lip = lambda dz: np.stack([x, height(x, zc + dz) + 0.8, zc + dz], 1)
    return lip(-w / 2), lip(w / 2), op


# ---------------------------------------------------------------- what it's made of
class Swarm:
    """The bugs it is made of: out of the crack, round and round the mountain in
    a dark vortex, then down onto the body, each to its own place on it."""

    def __init__(self, keys, F, n=3200, seed=21):
        r = np.random.RandomState(seed)
        T0, T1 = T_GROW
        self.k = np.sort(r.uniform(0, 1.0, n))
        self.tA = T0 + self.k / 1.12 * (T1 - T0)
        self.dur = r.uniform(0.9, 2.1, n)
        self.s = self.tA - self.dur
        self.e = np.minimum(r.uniform(T_CRACK + 0.15, T0 + 2.5, n), self.s - 1.0)
        order = np.argsort(keys)
        j = np.clip(np.searchsorted(keys[order], self.k) + r.randint(-40, 40, n), 0, len(keys) - 1)
        self.vert = F[order[j], r.randint(0, 3, n)]
        a, b, _ = crack(T_CRACK + 2)
        u = r.uniform(0.1, 0.9, n)
        i = (u * (len(a) - 1)).astype(int)
        self.src = (a[i] + b[i]) / 2
        self.rad = r.uniform(12, 110, n)
        self.hgt = r.uniform(15, 175, n)
        self.w = r.choice([-1, 1], n) * r.uniform(0.5, 1.4, n)
        self.th = r.uniform(0, 2 * math.pi, n)
        self.wob = r.uniform(0, 6.3, n)
        self.size = r.uniform(1.0, 2.3, n)

    def _orbit(self, t):
        a = self.th + self.w * (t - self.e)
        rr = self.rad * (1 + 0.15 * np.sin(t * 0.9 + self.wob))
        return np.stack([CENTRE[0] + rr * np.cos(a), CENTRE[1] + self.hgt + 9 * np.sin(t * 1.7 + self.wob),
                         CENTRE[2] + rr * np.sin(a)], 1)

    def at(self, T, V=None):
        p = self._orbit(T)
        q = np.clip((T - self.e) / np.minimum(1.6, self.s - self.e), 0, 1)[:, None]
        q = q * q * (3 - 2 * q)
        p = self.src + (p - self.src) * q + np.array([0, 25.0, 0]) * np.sin(q * math.pi)
        if V is not None:
            g = np.clip((T - self.s) / self.dur, 0, 1)[:, None]
            g = g * g * (3 - 2 * g)
            O, tgt = self._orbit(self.s), V[self.vert]
            ctrl = (O + tgt) / 2 + np.array([0, 35.0, 0])
            b = (1 - g) ** 2 * O + 2 * (1 - g) * g * ctrl + g ** 2 * tgt
            p = np.where((T >= self.s)[:, None], b, p)
        return p, (T >= self.e) & (T < self.tA)


class Shed:
    """Bugs coming loose from the body as it runs, trailing behind it."""

    def __init__(self, nv, n=5200, seed=22):
        r = np.random.RandomState(seed)
        self.b = np.sort(r.uniform(T_GROW[1] - 1.5, END, n))
        self.life = r.uniform(0.9, 2.2, n)
        self.vert = r.randint(0, nv, n)
        d = r.normal(size=(n, 3))
        self.dir = d / np.linalg.norm(d, axis=1, keepdims=True)
        self.wob = r.uniform(0, 6.3, n)
        self.size = r.uniform(0.8, 1.8, n)

    def at(self, T, V, vel, scale=1.0):
        a = T - self.b
        alive = (a >= 0) & (a < self.life)
        a = a[alive][:, None]
        p = V[self.vert[alive]] - vel * a * 0.9 + (self.dir[alive] * 9 + np.array([0, 5.0, 0])) * a * scale + \
            np.stack([np.sin(a[:, 0] * 5 + self.wob[alive]), np.cos(a[:, 0] * 4 + self.wob[alive]), 0 * a[:, 0]], 1) \
            * 3 * scale
        return p, self.size[alive] * scale


def _keys(rig):
    """When each face of the body is built: from the feet up, ragged."""
    v, f, _, _ = rig.body(pose(0.0, run=0.0)).arrays()
    y = v[f].mean(1)[:, 1]
    r = np.random.RandomState(4)
    return (y - y.min()) / np.ptp(y) + r.uniform(-0.06, 0.06, len(f)), f


def starfield(seed=11):
    r = np.random.RandomState(seed)
    s = np.zeros((H, W, 3), np.float32)
    cols = [(255, 255, 255), (255, 200, 170), (200, 150, 255), (120, 120, 255)]
    for _ in range(W * H // 700):
        cv2.circle(s, (r.randint(W), r.randint(H)), 0, [c * r.uniform(0.4, 1) for c in cols[r.randint(4)]], -1)
    return s + cv2.GaussianBlur(s, (0, 0), 2) * 1.5


def dread(T):
    return float(np.interp(T, [19, 30, 39, 50], [0, 0.3, 0.5, 0.85]))


def graded(img, d):
    """Draining the colour as the hunger comes: greyer, darker, violet."""
    if d <= 0:
        return img
    lum = img.mean(-1, keepdims=True)
    out = img + (lum - img) * (0.6 * d)
    return out * (1 - 0.42 * d) + np.array([70, 22, 46], np.float32) * (0.35 * d)


# ---------------------------------------------------------------- the scene
class Scene:
    def __init__(self):
        self.world = World()
        self.rig = Rig(tendrils=40)
        self.keys, self.F = _keys(self.rig)
        self.swarm = Swarm(self.keys, self.F)
        self.shed = Shed(int(self.F.max()) + 1)
        self.neb = nebula(W + 256, H + 144, seed=7)
        self.paper = crumple(W, H)
        self.paper_rot = crumple(W, H, seed=8, cells=420)
        self.stars = starfield()
        self.canvas = (0.95 + 0.1 * fbm(H, W, 31, 60))[..., None]
        yy = np.linspace(0, 1, H)[:, None]
        self.tearn = fbm(H, W, 41, 4) * 0.65 + (1 - yy) * 0.35
        ts = np.arange(T_GROW[0], END, 1 / 24)
        self.path = ts, np.array([[*track(dist(t))[:1], 0, track(dist(t))[1]] for t in ts])
        r = np.random.RandomState(9)
        n = len(self.world.trees)
        self.leaf = r.uniform(-0.3, 0.3, (n, 6, 2)), r.uniform(0, 6.3, (n, 6))
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        self.warps = [(xx + (fbm(H, W, 60 + k, 24) - 0.5) * 1.8, yy + (fbm(H, W, 70 + k, 24) - 0.5) * 1.8)
                      for k in range(4)]
        self._text = {}

    # ------------------------------------------------------------ text
    def text(self, key, lines, size, font=FONT, ys=None, spacing=1.75, track_=0):
        """One mask per line, centred."""
        if key not in self._text:
            f = ImageFont.truetype(font, size)
            y0 = (H - len(lines) * size * spacing) / 2 + size * 0.3
            out = []
            for i, ln in enumerate(lines):
                im = Image.new('L', (W, H), 0)
                d = ImageDraw.Draw(im)
                y = ys[i] if ys else y0 + i * size * spacing
                if track_:                                           # spaced-out capitals
                    ws = [d.textlength(c, font=f) for c in ln]
                    x = (W - sum(ws) - track_ * (len(ln) - 1)) / 2
                    for c, wc in zip(ln, ws):
                        d.text((x, y), c, font=f, fill=255)
                        x += wc + track_
                else:
                    d.text(((W - d.textlength(ln, font=f)) / 2, y), ln, font=f, fill=255)
                out.append(np.asarray(im, np.float32) / 255)
            self._text[key] = out
        return self._text[key]

    def ink_text(self, img, masks, alphas, fi):
        """White hand-lettered text that boils a little, on twos."""
        fx, fy = self.warps[(fi // 2) % 4]
        for m, a in zip(masks, alphas):
            if a <= 0:
                continue
            m = cv2.remap(m, fx, fy, cv2.INTER_LINEAR) * a
            g = cv2.GaussianBlur(m, (0, 0), 7) * 0.55
            al = np.clip(m + g, 0, 1)[..., None]
            img[:] = img * (1 - al) + INK * al
        return img

    def neb_at(self, T, speed=1.0):
        ox = int(128 + 100 * math.sin(T * 0.05 * speed))
        oy = int(72 + 60 * math.sin(T * 0.037 * speed + 1))
        return self.neb[oy:oy + H, ox:ox + W].copy()

    # ------------------------------------------------------------ the figure
    def creature(self, st, cam):
        """The giant's meshes (as far as it is built) and its body vertices in
        the world."""
        J = st['J']
        v, f, c, o = self.rig.body(J).arrays()
        Vw = place(v, st['pos'], st['yaw']).astype(np.float32)
        if st['grow'] < 1.2:
            keep = self.keys < st['grow']
            f, c, o = f[keep], c[keep], o[keep]
        meshes = [(Vw, f, c, o)]
        if st['tgrow'] > 0.02:
            tm = self.rig.tendrils(J, st['t'], st['drag'], grow=st['tgrow'])
            meshes.append(place(tm, st['pos'], st['yaw']))
        return meshes, Vw

    def face(self, st, cam, dep):
        """The eyes and the frown on screen, where they can be seen."""
        if st['eyes'] < 0.03:
            return [], 0, None
        J = st['J']
        eyes, mouth, front = self.rig.face(J)
        head = place(J['head'][None], st['pos'], st['yaw'])[0]
        E = place(np.array(eyes), st['pos'], st['yaw'])
        out = []
        for e in E:
            n = e - head
            if np.dot(n, cam.eye - e) <= 0:
                continue
            x, y, z = cam.project(e[None])
            xi, yi = int(x[0]), int(y[0])
            if 0 <= xi < W and 0 <= yi < H and z[0] <= dep[yi, xi] + 0.08 * SCALE:
                out.append((x[0], y[0]))
        r = 0.034 * SCALE * cam.focal / max(1.0, cam.to_cam(E.mean(0))[2]) * st['eyes']
        M = place(np.array(mouth), st['pos'], st['yaw'])
        fw = place(front[None], st['pos'], st['yaw'])[0]
        mo = None
        if np.dot(fw - head, cam.eye - fw) > 0 and st['eyes'] > 0.9:
            x, y, _ = cam.project(M)
            mo = np.stack([x, y], 1)
        return out, r, mo

    # ------------------------------------------------------------ drawing things
    def bugs(self, img, cam, P, P2, size, dep, edge=0.8, dark=(10, 8, 12)):
        """Little black bugs (white-rimmed when near), heading where they fly."""
        if not len(P):
            return
        x, y, z = cam.project(P)
        x2, y2, _ = cam.project(P2)
        ok = (z > 2) & (x > -8) & (x < W + 8) & (y > -8) & (y < H + 8)
        xi, yi = np.clip(x, 0, W - 1).astype(int), np.clip(y, 0, H - 1).astype(int)
        r = size * cam.focal / np.maximum(z, 1)
        ok &= (dep[yi, xi] > z - 4) & (r > 0.3)
        small = ok & (r < 1.2)
        a = np.clip(r[small], 0.3, 1)[:, None] * 0.9
        img[yi[small], xi[small]] = img[yi[small], xi[small]] * (1 - a) + np.array(dark, np.float32) * a
        for i in np.where(ok & (r >= 1.2))[0][np.argsort(-z[ok & (r >= 1.2)])]:
            ang = math.degrees(math.atan2(y2[i] - y[i], x2[i] - x[i]))
            c = (int(x[i] * 4), int(y[i] * 4))
            ax = (int(r[i] * 4), int(max(r[i] * 0.55, 0.6) * 4))
            if r[i] > 1.8:
                cv2.ellipse(img, c, (ax[0] + 4, ax[1] + 4), ang, 0, 360, (INK * edge).tolist(), -1, cv2.LINE_AA, 2)
            cv2.ellipse(img, c, ax, ang, 0, 360, dark, -1, cv2.LINE_AA, 2)
            if r[i] > 3:                                             # wings, a blur of them
                for s in (-1, 1):
                    wa = math.radians(ang + s * (80 + 25 * math.sin(i + x[i])))
                    e = (int((x[i] + math.cos(wa) * r[i] * 1.3) * 4), int((y[i] + math.sin(wa) * r[i] * 1.3) * 4))
                    cv2.line(img, c, e, (INK * 0.6).tolist(), 1, cv2.LINE_AA, 2)

    def rings(self, ink, cam, T, rng):
        """White scribbled ripples running out ahead of the rot on the water."""
        layer = np.zeros((H, W), np.uint8)
        ang = np.linspace(0, 2 * math.pi, 120)
        for i in np.where(SW & (ST <= T) & (ST > T - 7))[0]:
            a = T - ST[i]
            for k, f in enumerate((1.12, 1.3, 1.55)):
                rad = water_radius(a) * f + 6 * k * a
                al = int(255 * 0.85 * (1 - a / 7) * (1 - 0.25 * k))
                P = np.stack([SX[i] + rad * np.cos(ang), np.full_like(ang, 0.6), SZ[i] + rad * np.sin(ang)], 1)
                sea = P[:, 2] < shore(P[:, 0]) - 2
                x, y, z = cam.project(P)
                vis = sea & (z > 2) & (np.abs(x) < 4 * W) & (np.abs(y) < 4 * H)
                for _ in range(2):
                    q = np.stack([x, y], 1) + rng.normal(0, 0.8, (len(x), 2))
                    run = []
                    for j in range(len(q)):
                        if vis[j]:
                            run.append(q[j])
                        elif len(run) > 1:
                            cv2.polylines(layer, [np.round(np.array(run) * 4).astype(np.int32)], False, al, 1,
                                          cv2.LINE_AA, 2)
                            run = []
                        else:
                            run = []
                    if len(run) > 1:
                        cv2.polylines(layer, [np.round(np.array(run) * 4).astype(np.int32)], False, al, 1,
                                      cv2.LINE_AA, 2)
        np.maximum(ink, layer.astype(np.float32) / 255, out=ink)

    def splashes(self, T):
        """Black void spray thrown up by each step in the water."""
        P, P2, S = [], [], []
        for i in np.where(SW & (ST <= T) & (ST > T - 2.6))[0]:
            r = np.random.RandomState(i)
            n = 30
            v = np.stack([r.normal(0, 13, n), r.uniform(18, 46, n), r.normal(0, 13, n)], 1)
            for dt, out in ((0, P), (0.04, P2)):
                a = T - ST[i] + dt
                out.append(np.array([SX[i], 0, SZ[i]]) + v * a - np.array([0, 15.0, 0]) * a * a)
            S.append(r.uniform(1.4, 3.2, n))
        if not P:
            return np.zeros((0, 3)), np.zeros((0, 3)), np.zeros(0)
        P, P2, S = np.concatenate(P), np.concatenate(P2), np.concatenate(S)
        k = P[:, 1] > -1
        return P[k], P2[k], S[k]

    def leaves(self, T, t0):
        """Black leaves dropping off the rotting trees."""
        w = self.world
        i = np.where((t0 < T) & (t0 > T - 5))[0]
        if not len(i):
            return np.zeros((0, 3)), np.zeros((0, 3))
        off, ph = self.leaf
        out = []
        for dt in (0, 0.05):
            a = T + dt - (t0[i][:, None] + np.arange(6)[None] * 0.6)
            x = w.tx[i][:, None] + off[i, :, 0] * w.ts[i][:, None] + np.sin(a * 2 + ph[i]) * 2.5
            z = w.tz[i][:, None] + off[i, :, 1] * w.ts[i][:, None]
            y = w.ty[i][:, None] + w.ts[i][:, None] * 0.7 - 4 * a - 1.2 * a * a
            out.append((np.stack([x, y, z], -1), (a > 0) & (a < 2.8)))
        k = out[0][1].ravel()
        return out[0][0].reshape(-1, 3)[k], out[1][0].reshape(-1, 3)[k]

    # ------------------------------------------------------------ a 3D shot
    def shot(self, T, fi, eye, tgt, fov, st=None, world=True, figure=None):
        rng = np.random.RandomState(fi // 2 + 7)                    # the scribbles boil on twos
        cam = Camera(eye, tgt, fov, W, H)
        camh = Camera(eye, tgt, fov, W * SS, H * SS)
        dep = np.full((H * SS, W * SS), 1e30, np.float32)
        ids = np.zeros((H * SS, W * SS), np.int32)
        d = dread(T)
        if world:
            sk, _ = sky(W, H, cam, T)
            rgb = cv2.resize(sk.astype(np.float32), (W * SS, H * SS), interpolation=cv2.INTER_LINEAR)
            trot, t0 = self.world.tree_rot(*self.path, T) if T > T_GROW[0] else (np.zeros(len(self.world.trees)),
                                                                                 np.full(len(self.world.trees), 1e9))
            render(camh, [self.world.land, self.world.sea_mesh(T), self.world.tree_mesh(T, trot)], light=LIGHT,
                   ambient=0.55, sky=(60, 40, 20), ground=(0, 20, 30), rgb=rgb, depth=dep, ids=ids)
            f = (1 - np.exp(-np.minimum(dep, 1e5) / 2800))[..., None] * (ids > 0)[..., None]
            rgb = rgb * (1 - f) + np.array([224, 222, 228], np.float32) * f
            wids, wdep = ids[::SS, ::SS].copy(), dep[::SS, ::SS].copy()
        else:
            rgb = np.zeros((H * SS, W * SS, 3), np.float32)
            wids = np.zeros((H, W), np.int32)
        V = None
        if st is not None:
            meshes, V = self.creature(st, cam)
            render(camh, meshes, light=LIGHT, ambient=0.5, rgb=rgb, depth=dep, ids=ids)
        img = cv2.resize(rgb, (W, H), interpolation=cv2.INTER_AREA)
        dep1 = dep[::SS, ::SS]
        ink = np.zeros((H, W), np.float32)
        halo = np.zeros((H, W), np.float32)
        if world:
            img = img * self.canvas
            sea = wids == 5
            land = wids == 4
            if sea.any() or land.any():                              # back to the world, per pixel
                py, px = np.nonzero(sea | land)
                dd = wdep[py, px]
                P = np.stack([(px + 0.5 - W / 2) / cam.focal, -(py + 0.5 - H / 2) / cam.focal, np.ones_like(dd)],
                             1) * dd[:, None] @ cam.R + cam.eye
                X, Z = P[:, 0], P[:, 2]
                iss = sea[py, px]
                dz = shore(X) - Z                                   # foam along the shore
                foam = iss & (dz > -2) & (dz < 7 + 4 * np.sin(X * 0.04 + T * 1.5)) & (dd < 2500)
                img[py[foam], px[foam]] = img[py[foam], px[foam]] * 0.25 + np.array([245, 245, 240]) * 0.75
                k = np.where(iss)[0]                                # sparkles on the sea
                if len(k):
                    sp = np.random.RandomState(fi).choice(k, min(len(k), 260), replace=False)
                    img[py[sp], px[sp]] = img[py[sp], px[sp]] * 0.3 + 235 * 0.7
            img = graded(img, d)
            rot = np.zeros((H, W), bool)
            if T > T_GROW[0] - 0.5 and (sea.any() or land.any()):
                r = np.full(len(py), -1.0)
                if iss.any():
                    r[iss] = rot_field(X[iss], Z[iss], T, True)
                if (~iss).any():
                    r[~iss] = rot_field(X[~iss], Z[~iss], T, False)
                rot[py[r > 0], px[r > 0]] = True
            tr = wids >= 1000
            if tr.any() and T > T_GROW[0]:
                rot |= tr & (trot[np.clip(wids - 1000, 0, len(trot) - 1)] > 0.6)
            if world and T >= T_CRACK:                              # the fissure
                a, b, op = crack(T)
                xa, ya, _ = cam.project(a)
                xb, yb, _ = cam.project(b)
                poly = np.concatenate([np.stack([xa, ya], 1), np.stack([xb, yb], 1)[::-1]])
                cm = np.zeros((H, W), np.uint8)
                cv2.fillPoly(cm, [np.round(poly * 4).astype(np.int32)], 1, cv2.LINE_AA, 2)
                cm = cm.astype(bool) & (wids == 4)
                rot |= cm
                halo += glow(cm, 6) * 0.9 * op
            if rot.any():                                           # the rot: the void, showing through
                pv = 6 + 16 * self.paper_rot
                vc = np.repeat(pv[..., None], 3, -1) + self.stars * 0.25 + np.array([18, 2, 10]) * sea[..., None]
                img[rot] = vc[rot]
                scribble(ink, rot, rng, strokes=3, amp=1.3, alpha=0.8, min_len=10, step=2)
                halo += glow(rot, 3) * 0.35
            tear = float(smooth(*TEAR, T))
            if tear > 0:                                            # the sky tears open
                tm = (wids == 0) & (self.tearn > 1 - 0.95 * tear)
                if tm.any():
                    img[tm] = self.neb_at(T)[tm]
                    scribble(ink, tm, rng, strokes=4, amp=2.2, alpha=0.9, min_len=16)
                    halo += glow(tm, 8) * 0.5
        else:
            img[:] = self.neb_at(T, 0.6)
        if halo.any():
            h = np.clip(halo, 0, 1)[..., None]
            img = img * (1 - h) + np.array([255, 205, 235], np.float32) * h
        if ink.any():
            a = np.clip(ink, 0, 1)[..., None]
            img = img * (1 - a) + INK * a
        if st is not None:                                          # the giant
            cm = np.isin(ids, (2, 3)).astype(np.float32)
            cov = cv2.resize(cm, (W, H), interpolation=cv2.INTER_AREA)
            lum = rgb.mean(-1) * cm
            m = cov > 0.45
            if m.any():
                sh = cv2.resize(lum, (W, H), interpolation=cv2.INTER_AREA) / np.maximum(cov, 1e-3)
                lo, hi = np.percentile(sh[m], (3, 97))
                shade = np.clip((sh - lo) / max(hi - lo, 1e-3), 0, 1)
                c = cam.project(st['pos'][None] + np.array([0, SCALE, 0]))
                pz = max(1.0, cam.to_cam(st['pos'] + np.array([0, SCALE, 0]))[2])
                hpx = 2.15 * SCALE * cam.focal / pz
                ox, oy = int(c[0][0]) % W, int(c[1][0]) % H
                paper = np.roll(self.paper, (oy, ox), (0, 1))
                stars = np.roll(self.stars, (oy, ox), (0, 1))
                eyes, er, mouth = self.face(st, cam, dep1)
                p = dict(glow_r=float(np.clip(hpx / 28, 2.5, 12)), amp=float(np.clip(hpx / 120, 0.8, 3.2)),
                         strokes=5 if hpx < 150 else 7, hatch=1.1 if hpx > 220 else 0.4)
                p.update(figure or {})
                void_figure(img, shade, m, paper, rng, eyes=eyes, eye_r=er, mouth=mouth, stars=stars, **p)
                if T_EYES <= T < T_EYES + 0.7 and eyes:              # the eyes light: a flash
                    fl = (1 - (T - T_EYES) / 0.7) * 0.8
                    g = np.zeros((H, W), np.float32)
                    for (ex, ey) in eyes:
                        cv2.circle(g, (int(ex), int(ey)), int(er * 3 + 4), 1.0, -1)
                    g = cv2.GaussianBlur(g, (0, 0), er * 2 + 6)[..., None] * fl
                    img = img * (1 - g) + 255 * g
        # what flies
        if st is not None or (world and T >= T_CRACK):
            if T < T_GROW[1] + 0.2:
                P, alive = self.swarm.at(T, V)
                P2, _ = self.swarm.at(T + 0.04, V)
                self.bugs(img, cam, P[alive], P2[alive], self.swarm.size[alive], dep1)
            if V is not None and T > T_GROW[1] - 1.5:
                sc = 1.0 if world else 0.12
                P, S = self.shed.at(T, V, st['vel'], sc)
                P2, _ = self.shed.at(T + 0.04, V, st['vel'], sc)
                n = min(len(P), len(P2))
                self.bugs(img, cam, P[:n], P2[:n], S[:n] * (1 if world else 0.25), dep1)
        if world and T > T_GROW[0]:
            P, P2 = self.leaves(T, t0)
            self.bugs(img, cam, P, P2, np.full(len(P), 0.9), dep1, edge=0.0, dark=(22, 18, 24))
            P, P2, S = self.splashes(T)
            self.bugs(img, cam, P, P2, S, dep1)
            ink2 = np.zeros((H, W), np.float32)
            self.rings(ink2, cam, T, rng)
            a = ink2[..., None]
            img = img * (1 - a) + INK * a
        return img

    # ------------------------------------------------------------ the shots
    def frame(self, fi):
        T = fi / FPS
        name, t0, t1 = next(s for s in SHOTS if s[1] <= T < s[2]) if T < END else SHOTS[-1]
        u = (T - t0) / (t1 - t0)
        if name.startswith('card'):
            img = self.neb_at(T)
            lines = CARDS[name]
            masks = self.text(name, lines, 34)
            al = [float(smooth(t0 + 0.4 + k * 1.0, t0 + 1.3 + k * 1.0, T) * (1 - smooth(t1 - 0.8, t1 - 0.2, T)))
                  for k in range(len(lines))]
            self.ink_text(img, masks, al, fi)
        elif name == 'valley':
            sh = np.zeros(3)
            img = self.shot(T, fi, np.array([-260 + 40 * u, 95 + 8 * u, -420 + 90 * u]) + sh,
                            np.array([0, 300 + 6 * u, 1500.0]), 45)
        elif name == 'crack':
            sh = shake(T, 1.6)
            img = self.shot(T, fi, np.array([-250 + 15 * u, 360 + 4 * u, 1020 + 25 * u]) + sh,
                            np.array([0, GY + 30, FORM[1]]) + sh * 0.5, 40)
        elif name == 'forming':
            ang = -0.55 + 0.35 * u
            dd = 300 - 50 * u
            eye = np.array([FORM[0] + dd * math.sin(ang), GY + 25 + 10 * u, FORM[1] - dd * math.cos(ang)])
            tgt = np.array([FORM[0], GY + 28 + 12 * float(smooth(*T_RISE, T)), FORM[1]])
            sh = shake(T, 0.6) + np.array([math.sin(T * 31), math.sin(T * 23), 0]) * 0.25
            img = self.shot(T, fi, eye + sh, tgt + sh * 0.3, 38 - 4 * u, st=giant(T))
        elif name == 'forest':
            st = giant(T)
            gx, gz = track(dist(T))
            gy = ground(gx, gz)
            ex, ez = gx + 330, gz - 40
            eye = np.array([ex, max(gy + 55, ground(ex, ez) + 40), ez])
            sh = shake(T, 0.9)
            img = self.shot(T, fi, eye + sh, np.array([gx, gy + 35, gz - 30]) + sh * 0.4, 42, st=st)
        elif name == 'sea':
            st = giant(T)
            ez = -830 + 220 * u
            gx, gz = track(dist(T))
            tgt = np.array([gx, ground(gx, gz) + 35, gz])
            near = np.hypot(gz - ez, gx - 25)
            sh = shake(T, float(np.clip(260 / near, 0.2, 2.2)))
            img = self.shot(T, fi, np.array([25, 26, ez]) + sh, tgt + sh * 0.4, 31 - 3 * u, st=st)
        elif name == 'face':
            st = idle(T)
            head = place(st['J']['head'][None], st['pos'], st['yaw'])[0]
            eye = head + np.array([-22 + 3 * u, -4 + 2 * u, 26 - 4 * u])
            cam0 = Camera(eye, head, 34, W, H)
            img = self.shot(T, fi, eye, head + cam0.R[0] * 7 - np.array([0, 4.0, 0]), 34, st=st, world=False,
                            figure=dict(glow_r=12, amp=3.2, strokes=7, hatch=1.1))
        else:                                                       # the title
            img = self.neb_at(T, 0.5)
            a = float(smooth(t0 + 0.3, t0 + 1.6, T))
            jp = self.text('jp', ['餓鬼'], 46, font=FONT_JP, ys=[214])
            ti = self.text('title', ['GAKI'], 150, font=FONT_THIN, ys=[262], track_=36)
            sub = self.text('sub', ['the hunger that walks'], 28, ys=[470])
            self.ink_text(img, jp + ti + sub, [a * 0.8, a, float(smooth(t0 + 1.4, t0 + 2.6, T))], fi)
        for (s0, s1, line) in SUBS:                                 # a line of narration over the picture
            if s0 <= T < s1:
                m = self.text('sub%.1f' % s0, [line], 30, ys=[H - 120])
                self.ink_text(img, m, [float(smooth(s0, s0 + 0.6, T) * (1 - smooth(s1 - 0.6, s1, T)))], fi)
        b = cv2.GaussianBlur(np.clip(img - 200, 0, 55), (0, 0), 8)   # bloom
        img = img + b * 0.6
        fade = 1.0
        for (a0, a1) in ((0, 0.8), (9.5, 10.1)):
            if a0 <= T < a1:
                fade = float(smooth(a0, a1, T))
        fade *= 1 - float(smooth(END - 1.2, END - 0.1, T))
        if 50.0 <= T < 50.12:                                       # the cut to its face: a flash
            img = img * 0.3 + 255 * 0.7
        img = img * fade
        return grade(img, np.random.RandomState(fi + 99), grain=2.6, vignette=0.32)


_SCENE = None


def _init():
    global _SCENE
    _SCENE = Scene()


def _frame(i):
    return _SCENE.frame(i).tobytes()


def film(out, workers=4, a=0, b=None):
    n = int(END * FPS)
    b = n if b is None else b
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s',
                           '%dx%d' % (W, H), '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf',
                           '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
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
        s = Scene()
        for t in args[1:]:
            cv2.imwrite('still_%s.png' % t, s.frame(int(round(float(t) * FPS))))
    else:
        film(args[0] if args else 'gaki.mp4')
