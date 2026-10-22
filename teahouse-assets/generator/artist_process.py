"""How it was drawn: layered files and a timelapse of the work, made the way a
digital painter makes a piece in Procreate - and filmed the way a painter
records a speedpaint, with the camera going in close for the detail.

    python3 teahouse-assets/generator/artist_process.py OUT_DIR [goat 0 1 2 3] [--cache=DIR] [--scene=PKL]

For the goat-dragon and for each room this writes
  - <name>_timelapse.mp4: 1080p, 30 fps. The camera glides to wherever the
    brush is working and zooms in for the small things (an eye, a hinge, a
    run of line art, a stray pixel), then pulls back out for the big passes.
    It ends with the finished picture coming apart into its layers in 3D,
    going back together, and then coming to life: the room starts to move,
    and goes through spring, summer, autumn, winter and the blood moon night
    (the goat-dragon breathes and blinks).
  - <name>_layers.psd: the working layers (opens in Procreate, Photoshop,
    Krita...). The thumbnails, roughs, value study and colour comp are kept but
    hidden. The file flattens to the finished art.
  - <name>_final.png

Nothing is revealed by a wipe or a filter. Every mark is a stroke: a path
that wobbles, overshoots its end, tapers, and is clipped to a selection the
way a clipping mask works. Fills are bucket fills, colour changes are slider
drags, and a scale-up is the transform tool.

A room goes: three thumbnails (one picked, the others struck out) - the pick
scaled up as an underlay - perspective guides - a rough sketch - a greyscale
value study - a colour comp on a Color-blend layer over it - the walls, floor
and ceiling - the view through the window - every piece on its own layer
(line art first, then flats, light and shadow, render, detail) - the posts and
the light - a zoomed-in pixel clean-up - a gradient map tried and thrown away.

The mistakes stay in:
  - thumbnails that didn't make it, struck through
  - a first idea roughed out, faded and hidden
  - lines gone over twice
  - an eye drawn too big and rubbed out
  - a jaw moved after flipping the canvas
  - doubled and stray pixels cleaned off afterwards
  - fur filled the wrong colour and adjusted
  - highlights pushed too far and pulled back
  - a sketch drawn in the wrong spot and dragged across
  - an item sketched then erased
  - a prop painted and then deleted
  - a few strokes undone
  - a colour grade tried and deleted

Not part of the build or the asset zip."""
import math
import os
import pickle
import random
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np                                      # noqa: E402
from PIL import Image, ImageFilter                      # noqa: E402
from pixel import Canvas, PAL                            # noqa: E402

FPS = 30
BACKDROP = (36, 34, 40)                                 # round the canvas when it doesn't fill the frame


def rgb(c):
    return np.array(PAL[c] if isinstance(c, str) else c[:3], np.float32)


def _lum(c):
    return c[..., 0] * 0.3 + c[..., 1] * 0.59 + c[..., 2] * 0.11


def _set_lum(c, lum):
    """The Color blend mode: this colour's hue and saturation at another luminance."""
    c = c + (lum - _lum(c))[..., None]
    L = _lum(c)[..., None]
    n = c.min(-1, keepdims=True)
    x = c.max(-1, keepdims=True)
    c = np.where(n < 0, L + (c - L) * L / np.maximum(L - n, 1e-6), c)
    c = np.where(x > 255, L + (c - L) * (255 - L) / np.maximum(x - L, 1e-6), c)
    return c


# ---------------------------------------------------------------- the document
class Doc:
    _uid = 0

    def __init__(self, w, h, paper):
        self.w, self.h = w, h
        self.layers = []
        self.flip = False
        self._prefix = []
        p = self.add('Paper', group='paper')
        p['a'][..., :3] = rgb(paper)
        p['a'][..., 3] = 255

    def add(self, name, below=None, above=None, opacity=1.0, blend='normal', group=None):
        Doc._uid += 1
        L = dict(name=name, a=np.zeros((self.h, self.w, 4), np.uint8), opacity=opacity, visible=True,
                 keep_hidden=False, ver=0, uid=Doc._uid, blend=blend, group=group)
        if below is not None:
            self.layers.insert(self.layers.index(below), L)
        elif above is not None:
            self.layers.insert(self.layers.index(above) + 1, L)
        else:
            self.layers.append(L)
        return L

    def remove(self, L):
        self.layers.remove(L)

    @staticmethod
    def touch(L):
        L['ver'] += 1

    def composite(self):
        """Flatten, reusing the stack below the first layer that changed."""
        out = None
        new = []
        valid = True
        for i, L in enumerate(self.layers):
            sig = (L['uid'], L['ver'], L['visible'], L['opacity'])
            if valid and i < len(self._prefix) and self._prefix[i][0] == sig:
                out = self._prefix[i][1]
                new.append(self._prefix[i])
                continue
            valid = False
            if out is None:
                out = np.zeros((self.h, self.w, 3), np.float32)
            if L['visible'] and L['opacity'] > 0:
                al = L['a'][..., 3:4].astype(np.float32) * (L['opacity'] / 255.0)
                src = L['a'][..., :3].astype(np.float32)
                if L['blend'] == 'color':
                    src = _set_lum(src, _lum(out))
                out = out * (1 - al) + src * al
            new.append((sig, out))
        self._prefix = new
        img = np.clip(out + 0.5, 0, 255).astype(np.uint8)
        return img[:, ::-1] if self.flip else img

    def sheet(self, group):
        """The visible layers of one group flattened (normal blend), RGBA."""
        out = np.zeros((self.h, self.w, 4), np.float32)
        for L in self.layers:
            if L['group'] != group or not L['visible'] or L['keep_hidden'] or L['blend'] != 'normal':
                continue
            al = L['a'][..., 3:4].astype(np.float32) / 255.0 * L['opacity']
            out[..., :3] = out[..., :3] * (1 - al) + L['a'][..., :3] * al
            out[..., 3:4] = out[..., 3:4] + al * (255 - out[..., 3:4])
        a = np.zeros((self.h, self.w, 4), np.uint8)
        m = out[..., 3] > 0
        a[m] = np.clip(out[m] + 0.5, 0, 255).astype(np.uint8)
        return a


def lay(L, m, color, alpha=1.0):
    """Paint a colour over the layer's pixels in m, building up like a real brush."""
    if not m.any():
        return
    a = L['a']
    src = a[m].astype(np.float32)
    A = src[:, 3] / 255.0
    Ao = A + alpha * (1 - A)
    col = (src[:, :3] * (A * (1 - alpha))[:, None] + rgb(color) * alpha) / np.maximum(Ao, 1e-6)[:, None]
    a[m, :3] = np.clip(col + 0.5, 0, 255).astype(np.uint8)
    a[m, 3] = np.clip(Ao * 255 + 0.5, 0, 255).astype(np.uint8)


def reveal(L, src, m):
    mm = m & (src[..., 3] > 0)
    L['a'][mm] = src[mm]


def rub(L, m):
    L['a'][m] = 0


def bbox(m):
    ys, xs = np.nonzero(m)
    if not len(ys):
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


# ---------------------------------------------------------------- the camera
class Camera:
    """The zoom and pan of a screen recording: it glides to wherever the work is,
    goes in close for small things and pulls back out for big ones. At rest it
    sits on whole screen pixels per canvas pixel, so the pixel art stays crisp."""

    def __init__(self, cw, ch, W, H, zmax=3.0):
        self.cw, self.ch, self.W, self.H = cw, ch, W, H
        self.fit = min(W / cw, H / ch)
        self.zmin = max(1.0, math.floor(self.fit)) / self.fit
        self.zmax = zmax
        self.cx, self.cy, self.z = cw / 2.0, ch / 2.0, self.zmin
        self.tx, self.ty, self.tz = self.cx, self.cy, self.z
        self.speed = 0.11

    def _clamp(self, cx, cy, z):
        s = self.fit * z
        vw, vh = self.W / s, self.H / s
        cx = self.cw / 2.0 if vw >= self.cw else min(max(cx, vw / 2), self.cw - vw / 2)
        cy = self.ch / 2.0 if vh >= self.ch else min(max(cy, vh / 2), self.ch - vh / 2)
        return cx, cy

    def view(self):
        s = self.fit * self.tz
        vw, vh = self.W / s, self.H / s
        return (self.tx - vw / 2, self.ty - vh / 2, self.tx + vw / 2, self.ty + vh / 2)

    def look(self, box, zmax=None, pad=0.2, force=False):
        x0, y0, x1, y1 = box
        bw, bh = max(10, x1 - x0) * (1 + 2 * pad), max(8, y1 - y0) * (1 + 2 * pad)
        z = min(self.W / (bw * self.fit), self.H / (bh * self.fit), zmax or self.zmax)
        z = max(self.zmin, math.floor(self.fit * z + 1e-6) / self.fit)
        if not force:                                   # already in view and not much smaller: stay
            vx0, vy0, vx1, vy1 = self.view()
            if x0 >= vx0 and y0 >= vy0 and x1 <= vx1 and y1 <= vy1 and z < self.tz * 1.6:
                return False
        cx, cy = self._clamp((x0 + x1) / 2.0, (y0 + y1) / 2.0, z)
        s = self.fit * z
        vw, vh = self.W / s, self.H / s
        if vw < self.cw:
            cx = round(cx - vw / 2) + vw / 2
        if vh < self.ch:
            cy = round(cy - vh / 2) + vh / 2
        moved = (cx, cy, z) != (self.tx, self.ty, self.tz)
        self.tx, self.ty, self.tz = cx, cy, z
        return moved

    def full(self):
        return self.look((0, 0, self.cw, self.ch), pad=0.0, force=True)

    def moving(self):
        return (self.cx, self.cy, self.z) != (self.tx, self.ty, self.tz)

    def step(self):
        k = self.speed
        self.z = math.exp(math.log(self.z) + (math.log(self.tz) - math.log(self.z)) * k)
        self.cx += (self.tx - self.cx) * k
        self.cy += (self.ty - self.cy) * k
        if abs(self.z - self.tz) < 2e-3 and abs(self.cx - self.tx) < 0.08 and abs(self.cy - self.ty) < 0.08:
            self.cx, self.cy, self.z = self.tx, self.ty, self.tz
        else:
            self.cx, self.cy = self._clamp(self.cx, self.cy, self.z)

    def render(self, img):
        s = self.fit * self.z
        x0 = self.cx - self.W / (2 * s)
        y0 = self.cy - self.H / (2 * s)
        xs = np.floor(x0 + (np.arange(self.W) + 0.5) / s).astype(int)
        ys = np.floor(y0 + (np.arange(self.H) + 0.5) / s).astype(int)
        vx = (xs >= 0) & (xs < self.cw)
        vy = (ys >= 0) & (ys < self.ch)
        sub = img[np.clip(ys, 0, self.ch - 1)][:, np.clip(xs, 0, self.cw - 1)]
        if vx.all() and vy.all():
            return sub
        out = np.empty((self.H, self.W, 3), np.uint8)
        out[:] = BACKDROP
        inside = vy[:, None] & vx[None, :]
        out[inside] = sub[inside]
        return out


# ---------------------------------------------------------------- the recording
class Timelapse:
    """The recording: one frame per stroke (or per few strokes), seen through the camera."""

    def __init__(self, doc, size, path, zmax=3.0):
        self.doc = doc
        self.W, self.H = size
        self.cam = Camera(doc.w, doc.h, self.W, self.H, zmax)
        self.proc = subprocess.Popen(
            ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % size,
             '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-tune', 'animation',
             '-pix_fmt', 'yuv420p',
             '-movflags', '+faststart', path], stdin=subprocess.PIPE)
        self.n = 0
        self.pending = 0
        self.every = 1

    def _out(self, img):
        self.cam.step()
        self.raw(self.cam.render(img))

    def raw(self, frame):
        self.proc.stdin.write(np.ascontiguousarray(frame).tobytes())
        self.n += 1

    def shot(self, hold=1):
        img = self.doc.composite()
        for _ in range(hold):
            self._out(img)
        self.pending = 0

    def tick(self, every=None):
        self.pending += 1
        if self.pending >= (every or self.every):
            self.shot()

    def settle(self, most=24):
        """Let the camera arrive before the next stroke."""
        img = self.doc.composite()
        k = 0
        while self.cam.moving() and k < most:
            self._out(img)
            k += 1

    def look(self, box, zmax=None, settle=0, force=False, pad=0.2):
        if box is None:
            return
        if self.cam.look(box, zmax, pad=pad, force=force) and settle:
            self.settle(settle)

    def look_at(self, m, **kw):
        self.look(bbox(m), **kw)

    def full(self, settle=0):
        if self.cam.full() and settle:
            self.settle(settle)

    def close(self):
        if self.pending:
            self.shot()
        self.proc.stdin.close()
        self.proc.wait()
        return self.n


def save_psd(doc, path, scale):
    from psd_tools import PSDImage
    from psd_tools.api.layers import PixelLayer
    from psd_tools.constants import BlendMode
    W, H = doc.w * scale, doc.h * scale
    psd = PSDImage.new('RGBA', (W, H))
    for L in doc.layers:
        im = Image.fromarray(L['a']).resize((W, H), Image.NEAREST)
        lay_ = PixelLayer.frompil(im, psd, L['name'], 0, 0)
        lay_.opacity = int(round(255 * L['opacity']))
        lay_.visible = bool(L['visible']) and not L['keep_hidden']
        if L['blend'] == 'color':
            lay_.blend_mode = BlendMode.COLOR
        psd.append(lay_)
    psd.save(path)


# ---------------------------------------------------------------- after the last stroke
def explode(tl, sheets, spread=0.4):
    """The finished picture comes apart into its layers - each a pane of glass,
    seen at an angle, far enough apart that each one shows on its own - turns a
    little, and goes back together. sheets: RGBA arrays, bottom to top."""
    W, H = tl.W, tl.H
    ch, cw = sheets[0].shape[:2]
    n = len(sheets)
    s0 = tl.cam.fit * tl.cam.z
    gap = spread * max(cw, ch)                                  # in canvas pixels, so it scales with the panes
    content = [Image.fromarray(a, 'RGBA') for a in sheets]
    pane = np.zeros((ch, cw, 4), np.uint8)
    pane[..., :3] = 255
    pane[..., 3] = 16
    pane[0, :] = pane[-1, :] = pane[:, 0] = pane[:, -1] = (236, 230, 246, 170)

    def axes(e, yaw):
        psi, th = math.radians(40 * e + yaw), math.radians(26 * e)
        ex = np.array([math.cos(psi), math.sin(psi) * math.sin(th)])
        ey = np.array([0.0, math.cos(th)])
        ez = np.array([math.sin(psi), -math.cos(psi) * math.sin(th)])
        return ex, ey, ez

    def extent(s, e, yaw):
        ex, ey, ez = axes(e, yaw)
        pts = [ex * s * u + ey * s * v + ez * s * gap * e * i for u in (0, cw) for v in (0, ch) for i in (0, n - 1)]
        pts = np.array(pts)
        return np.ptp(pts[:, 0]), np.ptp(pts[:, 1])

    s1 = s0
    while s1 > 0.2 and (extent(s1, 1, 0)[0] > 0.9 * W or extent(s1, 1, 0)[1] > 0.88 * H):
        s1 *= 0.98

    def frame(t, yaw=0.0):
        e = t * t * (3 - 2 * t)
        s = s0 + (s1 - s0) * e
        ex, ey, ez = axes(e, yaw * e)
        M = np.array([[ex[0], ey[0]], [ex[1], ey[1]]]) * s
        Mi = np.linalg.inv(M)
        mid = ex * s * cw / 2 + ey * s * ch / 2 + ez * s * gap * e * (n - 1) / 2
        C0 = np.array([W / 2.0, H / 2.0]) - mid
        img = Image.new('RGBA', (W, H), BACKDROP + (255,))
        pa = pane.copy()
        pa[..., 3] = (pane[..., 3].astype(np.float32) * e).astype(np.uint8)
        pane_im = Image.fromarray(pa, 'RGBA')
        for i in range(n):
            Ci = C0 + ez * s * gap * e * i
            a, b = Mi[0]
            d, f_ = Mi[1]
            coef = (a, b, -(a * Ci[0] + b * Ci[1]), d, f_, -(d * Ci[0] + f_ * Ci[1]))
            for im in ((pane_im, content[i]) if i else (content[i],)):
                img.alpha_composite(im.transform((W, H), Image.AFFINE, coef, resample=Image.NEAREST))
        return np.array(img.convert('RGB'))

    for k in range(46):                                         # coming apart
        tl.raw(frame(k / 45.0))
    for k in range(80):                                         # turning, slowly
        tl.raw(frame(1.0, -14 * math.sin(math.pi * k / 79) ** 2))
    for k in range(10):
        tl.raw(frame(1.0))
    for k in range(40):                                         # and back together
        tl.raw(frame(1 - k / 39.0))


def come_alive(tl, seqs, fps=12, xfade=14):
    """The finished picture starts to move. seqs: [(frames, seconds)] of RGB
    canvas-size frames at fps; each one crossfades into the next."""
    prev, k_prev = None, 0
    for frames, secs in seqs:
        n_out = int(secs * FPS)
        for k in range(n_out):
            src = frames[int(k * fps / FPS) % len(frames)].astype(np.float32)
            if prev is not None and k < xfade:
                w = (k + 1) / (xfade + 1.0)
                old = prev[int((k_prev + k) * fps / FPS) % len(prev)].astype(np.float32)
                src = old * (1 - w) + src * w
            tl.raw(tl.cam.render(np.clip(src + 0.5, 0, 255).astype(np.uint8)))
        prev, k_prev = frames, n_out


# ---------------------------------------------------------------- geometry helpers
def catmull(pts, closed=False):
    P = [np.asarray(p, float) for p in pts]
    if len(P) < 3:
        return np.array(P, float)
    if closed:
        ext = [P[-1]] + P + [P[0], P[1]]
    else:
        ext = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        m = max(2, int(np.hypot(*(p2 - p1)) * 1.5))
        for t in np.linspace(0, 1, m, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(ext[-2])
    return np.array(out)


def resample(d, step):
    if len(d) < 2:
        return d
    seg = np.hypot(*np.diff(d, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    if s[-1] < step:
        return d[[0, -1]]
    t = np.arange(0, s[-1], step)
    return np.stack([np.interp(t, s, d[:, 0]), np.interp(t, s, d[:, 1])], 1)


def rdp(pts, eps):
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    L = np.hypot(*ab)
    if L == 0:
        d = np.hypot(*(pts - a).T)
    else:
        d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / L
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([rdp(pts[:i + 1], eps)[:-1], rdp(pts[i:], eps)])
    return np.vstack([a, b])


def shift(m, dy, dx):
    out = np.zeros_like(m)
    h, w = m.shape[:2]
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = m[ys, xs]
    return out


def grow(m, r=1):
    out = m.copy()
    for _ in range(r):
        out = out | shift(out, 1, 0) | shift(out, -1, 0) | shift(out, 0, 1) | shift(out, 0, -1)
    return out


def edge_of(m):
    inner = m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1) & shift(m, 0, -1)
    return m & ~inner


N8 = [(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)]


def chains(mask):
    """Walk a thin mask into ordered pixel runs (x, y), the way a pen would follow them."""
    m = mask.copy()
    h, w = m.shape
    cnt = sum(shift(m, dy, dx).astype(int) for dy, dx in N8)
    ends = list(zip(*np.nonzero(m & (cnt <= 1))))
    rest = list(zip(*np.nonzero(m)))
    out = []
    for (y, x) in ends + rest:
        if not m[y, x]:
            continue
        ch = [(x, y)]
        m[y, x] = False
        pd = None
        while True:
            best, bs = None, 99
            for dy, dx in N8:
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx]:
                    sc = (0 if pd is None else abs(dy - pd[0]) + abs(dx - pd[1])) + (0.4 if dy and dx else 0)
                    if sc < bs:
                        best, bs = (dy, dx), sc
            if best is None:
                break
            y, x = y + best[0], x + best[1]
            pd = best
            m[y, x] = False
            ch.append((x, y))
        out.append(ch)
    return out


def nearest_order(items, start, key_start, key_end):
    """Greedy order: always continue from where the hand last lifted."""
    left = list(items)
    out = []
    cur = np.asarray(start, float)
    while left:
        d = [min(np.hypot(*(np.asarray(key_start(it)) - cur)), np.hypot(*(np.asarray(key_end(it)) - cur)) + 0.5)
             for it in left]
        i = int(np.argmin(d))
        it = left.pop(i)
        out.append(it)
        cur = np.asarray(key_end(it), float)
    return out


def tones(img, mask, k=3, smooth=5):
    """A first pass of light and shadow: the colours in mask grouped into k values,
    softened into simple shapes."""
    out = np.zeros_like(img)
    if mask.sum() < 4:
        out[mask] = img[mask]
        return out
    px = img[mask][:, :3].astype(np.float32)
    lum = px @ np.array([0.3, 0.59, 0.11], np.float32)
    qs = np.quantile(lum, np.linspace(0, 1, k + 1)[1:-1])
    lab = np.digitize(lum, qs)
    cols = np.array([px[lab == i].mean(0) if (lab == i).any() else px.mean(0) for i in range(k)])
    li = np.zeros(mask.shape, np.uint8)
    li[mask] = lab * 60 + 40
    if smooth:
        f = np.array(Image.fromarray(li).filter(ImageFilter.ModeFilter(smooth)))
        ok = mask & (f >= 40)
        li[ok] = f[ok]
    lab2 = np.clip((li[mask].astype(int) - 40) // 60, 0, k - 1)
    out[mask, :3] = np.clip(cols[lab2], 0, 255).astype(np.uint8)
    out[mask, 3] = 255
    return out


def mean_colour(img, mask):
    return tuple(int(c) for c in img[mask][:, :3].mean(0)) if mask.any() else (128, 128, 128)


# ---------------------------------------------------------------- the hand
_DISC = {}


def _disc(r):
    if r not in _DISC:
        R = int(math.ceil(r))
        dy, dx = np.mgrid[-R:R + 1, -R:R + 1]
        k = dx * dx + dy * dy <= r * r + 0.3
        _DISC[r] = (dy[k], dx[k])
    return _DISC[r]


def raster(shape, p, size=1.0, taper=0.3, pp=True):
    h, w = shape
    m = np.zeros(shape, bool)
    if len(p) == 0:
        return m
    if size <= 1.01:
        q = np.round(p).astype(int)
        pts = [tuple(q[0])]
        for x, y in q[1:]:
            x0, y0 = pts[-1]
            n = max(abs(x - x0), abs(y - y0))
            for k in range(1, n + 1):
                pts.append((int(round(x0 + (x - x0) * k / n)), int(round(y0 + (y - y0) * k / n))))
        if pp and len(pts) > 2:                                  # pixel-perfect: no L-shaped corners
            keep = [pts[0]]
            for i in range(1, len(pts) - 1):
                a, b, c = keep[-1], pts[i], pts[i + 1]
                if abs(c[0] - a[0]) == 1 and abs(c[1] - a[1]) == 1 and (b[0] == a[0] or b[1] == a[1]):
                    continue
                keep.append(b)
            keep.append(pts[-1])
            pts = keep
        arr = np.array(pts)
        ok = (arr[:, 0] >= 0) & (arr[:, 0] < w) & (arr[:, 1] >= 0) & (arr[:, 1] < h)
        m[arr[ok, 1], arr[ok, 0]] = True
        return m
    n = len(p)
    t = np.linspace(0, 1, n)
    pr = np.ones(n) if taper <= 0 else np.clip(np.minimum(t / taper, (1 - t) / taper), 0, 1) * 0.5 + 0.5
    rad = size / 2.0 * pr
    k = max(1, int(size * 0.25 / 0.4))
    ys, xs = [], []
    for i in range(0, n, k):
        rq = max(0.5, round(rad[i] * 2) / 2)
        dy, dx = _disc(rq)
        ys.append(int(round(p[i, 1])) + dy)
        xs.append(int(round(p[i, 0])) + dx)
    ys, xs = np.concatenate(ys), np.concatenate(xs)
    ok = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
    m[ys[ok], xs[ok]] = True
    return m


class Hand:
    def __init__(self, seed):
        self.r = np.random.RandomState(seed)

    def path(self, pts, wob=0.5, over=0.0, closed=False, step=0.4, drift=None):
        r = self.r
        d = catmull(pts, closed) if len(pts) > 2 else np.asarray(pts, float)
        d = resample(d, step)
        if len(d) < 2:
            return d
        if over:
            for end in (0, 1):
                e = over * r.uniform(-0.25, 1.25)
                a, b = (d[0], d[min(3, len(d) - 1)]) if end == 0 else (d[-1], d[max(0, len(d) - 4)])
                tg = a - b
                tg = tg / (np.hypot(*tg) or 1)
                if e > 0:
                    ext = np.array([a + tg * s for s in np.arange(step, e, step)])
                    if len(ext):
                        d = np.vstack([ext[::-1], d]) if end == 0 else np.vstack([d, ext])
                elif len(d) > 8:
                    cut = min(int(-e / step), len(d) // 4)
                    d = d[cut:] if end == 0 else d[:len(d) - cut]
        tg = np.gradient(d, axis=0)
        tg = tg / np.maximum(np.hypot(tg[:, 0], tg[:, 1]), 1e-6)[:, None]
        nm = np.stack([-tg[:, 1], tg[:, 0]], 1)
        s = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(d, axis=0).T))])
        L = max(s[-1], 1)
        f1, f2 = r.uniform(0.6, 1.3) * max(22.0, L), r.uniform(5, 9)
        p1, p2 = r.uniform(0, 2 * math.pi, 2)
        env = np.clip(s / 4.0, 0, 1)
        off = (wob * np.sin(2 * math.pi * s / f1 + p1) + min(0.25 * wob, 0.2) * np.sin(2 * math.pi * s / f2 + p2)) * env
        off += (wob if drift is None else drift) * r.normal() * (s / L) ** 2
        return d + nm * off[:, None]


def split_curve(dense, rng, seg=(16, 36), overlap=(1, 4)):
    """A long line drawn the way people draw it: in several strokes that overlap a little."""
    s = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(dense, axis=0).T))])
    out = []
    a = 0.0
    while a < s[-1] - 1:
        b = min(s[-1], a + rng.uniform(*seg))
        if s[-1] - b < seg[0] * 0.5:
            b = s[-1]
        idx = (s >= a) & (s <= b)
        if idx.sum() >= 2:
            out.append(dense[idx])
        if b >= s[-1]:
            break
        a = max(a + 2, b - rng.uniform(*overlap))
    return out


def scribble_paths(region, size, angle, rng, max_len=60, rows=(2, 5), spacing=0.85):
    """Back-and-forth strokes that cover a region, laid in small patches, like a
    painter filling an area: a few rows per stroke, ends that over- and undershoot."""
    ys, xs = np.nonzero(region)
    if not len(ys):
        return []
    ca, sa = math.cos(angle), math.sin(angle)
    u = xs * ca + ys * sa
    v = -xs * sa + ys * ca
    sp = max(1.0, size * spacing)
    v0 = v.min()
    vb = np.floor((v - v0) / sp).astype(int)
    runs = []                                                       # (row, u0, u1)
    order = np.lexsort((u, vb))
    vb_s, u_s = vb[order], u[order]
    brk = np.nonzero((np.diff(vb_s) != 0) | (np.diff(u_s) > sp * 1.5 + 1))[0]
    starts = np.concatenate([[0], brk + 1])
    ends = np.concatenate([brk, [len(u_s) - 1]])
    for a_, b_ in zip(starts, ends):
        row, u0, u1 = vb_s[a_], u_s[a_], u_s[b_]
        n = max(1, int(math.ceil((u1 - u0) / max_len)))
        cuts = np.linspace(u0, u1, n + 1)
        for k in range(n):
            runs.append([row, cuts[k], cuts[k + 1], False])
    by_row = {}
    for rr in runs:
        by_row.setdefault(rr[0], []).append(rr)
    strokes = []
    for rr in sorted(runs, key=lambda q: (q[0], q[1])):
        if rr[3]:
            continue
        group = [rr]
        rr[3] = True
        want = rng.randint(rows[0], rows[1] + 1)
        cur = rr
        while len(group) < want:
            nxt = [q for q in by_row.get(cur[0] + 1, []) if not q[3] and min(q[2], cur[2]) - max(q[1], cur[1]) > -sp]
            if not nxt:
                break
            q = min(nxt, key=lambda q: abs((q[1] + q[2]) - (cur[1] + cur[2])))
            q[3] = True
            group.append(q)
            cur = q
        pts = []
        for j, (row, u0, u1, _) in enumerate(group):
            vv = v0 + (row + 0.5) * sp + rng.normal(0, 0.12 * sp)
            e0 = u0 - size * rng.uniform(-0.2, 0.7)
            e1 = u1 + size * rng.uniform(-0.2, 0.7)
            seq = [(e0, vv), (e1, vv)] if j % 2 == 0 else [(e1, vv), (e0, vv)]
            pts += seq
        xy = [(uu * ca - vv * sa, uu * sa + vv * ca) for uu, vv in pts]
        strokes.append((group[0][0], (group[0][1] + group[0][2]) / 2, xy))
    # paint patch by patch, snaking, with the odd jump elsewhere
    band = max(1, rows[1] * 3)
    col = max_len * 1.6
    strokes.sort(key=lambda q: (q[0] // band, (q[1] // col) * (1 if (q[0] // band) % 2 == 0 else -1)))
    out = [q[2] for q in strokes]
    for _ in range(len(out) // 25):
        i, j = rng.randint(len(out)), rng.randint(len(out))
        out[i], out[j] = out[j], out[i]
    return out


# ---------------------------------------------------------------- the painter
class Painter:
    def __init__(self, doc, tl, seed):
        self.doc, self.tl = doc, tl
        self.hand = Hand(seed)
        self.rng = random.Random(seed)
        self.shape = (doc.h, doc.w)
        self.follow = True                      # the camera goes to each area as it is painted

    def _look(self, m, zmax=None):
        if self.follow:
            self.tl.look_at(m, zmax=zmax)

    # one stroke
    def stroke(self, L, pts, color=None, src=None, size=1.0, alpha=1.0, wob=0.5, over=0.0, closed=False,
               clip=None, pp=True, erase=False, frame=True, raw=False, taper=0.3, every=None):
        if raw:
            p = np.asarray(pts, float)
        else:
            p = self.hand.path(pts, wob=wob, over=over, closed=closed)
        m = raster(self.shape, p, size, taper=taper, pp=pp)
        if clip is not None:
            m &= clip
        if erase:
            rub(L, m)
        elif src is not None:
            reveal(L, src, m)
        else:
            lay(L, m, color, alpha)
        Doc.touch(L)
        if frame:
            self.tl.tick(every)
        return m

    def curve(self, L, pts, closed=False, seg=(16, 36), passes=1, wob=0.6, over=2.5, every=None, **kw):
        """A contour drawn in short overlapping strokes; passes=2 goes over it again, searching."""
        dense = resample(catmull(pts, closed) if len(pts) > 2 else np.asarray(pts, float), 0.5)
        if closed and len(dense) > 2:
            dense = np.vstack([dense, dense[:6]])
        drawn = np.zeros(self.shape, bool)
        for k in range(passes):
            for piece in split_curve(dense, self.rng, seg):
                ctrl = piece[::max(1, len(piece) // 5)]
                if len(ctrl) < 2:
                    ctrl = piece[[0, -1]]
                ctrl = np.vstack([ctrl, piece[-1:]])
                drawn |= self.stroke(L, ctrl, wob=wob * (1 + 0.4 * k), over=over * (1 + 0.5 * k), every=every, **kw)
        return drawn

    def scribble(self, L, region, size, angle=0.0, src=None, color=None, alpha=1.0, frames=20, max_len=60,
                 rows=(2, 5), clip=True, touch=True, wob=None, spacing=0.85, zmax=None):
        """Cover a region with strokes. With clip the strokes stay inside it, like
        painting inside a selection; without, they spill a little past the edge."""
        if not region.any():
            return
        self._look(region, zmax)
        paths = scribble_paths(region, size, angle, self.hand.r, max_len=max_len, rows=rows, spacing=spacing)
        every = max(1, int(math.ceil(len(paths) / max(1, frames))))
        cl = region if clip else None
        done = np.zeros(self.shape, bool)
        for pts in paths:
            done |= self.stroke(L, pts, color=color, src=src, size=size, alpha=alpha, wob=wob if wob is not None else min(1.2, size * 0.12),
                                clip=cl, every=every, taper=0.15)
        if touch:
            self._touch_up(L, region & ~done, size, src, color, alpha, cl, every)
        self.tl.shot()

    def _touch_up(self, L, left, size, src, color, alpha, clip, every):
        """Go back over the bits the strokes missed with small dabs."""
        cell = max(4, int(size * 5))
        for it in range(3):
            if not left.any():
                return
            ys, xs = np.nonzero(left)
            keys = (ys // cell) * 10000 + xs // cell
            sz = max(1.0, size * (0.6 if it < 2 else 0.0))
            for kk in np.unique(keys):
                sel = keys == kk
                pts = np.stack([xs[sel], ys[sel]], 1).astype(float)
                if it < 2:
                    pts = pts[np.argsort(pts[:, 0] + pts[:, 1] * 0.3)][::max(1, int(sel.sum() // 8))]
                    if len(pts) == 1:
                        pts = np.vstack([pts, pts + 0.3])
                    m = self.stroke(L, pts, color=color, src=src, size=sz, alpha=alpha, wob=0.3, clip=clip,
                                    every=every * 2, taper=0)
                else:
                    m = np.zeros(self.shape, bool)
                    m[pts[:, 1].astype(int), pts[:, 0].astype(int)] = True
                    if src is not None:
                        reveal(L, src, m)
                    else:
                        lay(L, m, color, alpha)
                    Doc.touch(L)
                    self.tl.tick(every * 3)
                left = left & ~m

    def fill(self, L, region, color=None, src=None, hold=2):
        """Bucket fill or lasso fill: one go."""
        self._look(region)
        if src is not None:
            reveal(L, src, region)
        else:
            lay(L, region, color)
        Doc.touch(L)
        self.tl.shot(hold)

    def adjust(self, L, region, target, steps=10, hold_end=4):
        """Hue/saturation/brightness: the slider dragged until the colour sits right."""
        self._look(region)
        start = L['a'][region].astype(np.float32)
        tgt = target[region].astype(np.float32)
        for k in range(1, steps + 1):
            t = k / steps
            t = t * t * (3 - 2 * t)
            L['a'][region] = np.clip(start + (tgt - start) * t + 0.5, 0, 255).astype(np.uint8)
            Doc.touch(L)
            self.tl.shot()
        self.tl.shot(hold_end)

    def fade(self, L, to, steps=6):
        a = L['opacity']
        for k in range(1, steps + 1):
            L['opacity'] = a + (to - a) * k / steps
            Doc.touch(L)
            self.tl.shot()

    def hide(self, L, hold=3, keep_hidden=True):
        L['visible'] = False
        L['keep_hidden'] = keep_hidden
        Doc.touch(L)
        self.tl.shot(hold)

    def move(self, L, mask, dx, dy, steps=6):
        """Lasso, then drag with the transform tool: the selection slides into place."""
        b = bbox(mask)
        if b:
            self.tl.look((min(b[0], b[0] + dx), min(b[1], b[1] + dy), max(b[2], b[2] + dx), max(b[3], b[3] + dy)))
        piece = np.where(mask[..., None], L['a'], 0)
        L['a'][mask] = 0
        base = L['a'].copy()
        for k in range(1, steps + 1):
            t = k / steps
            t = 1 - (1 - t) ** 2
            ox, oy = int(round(dx * t)), int(round(dy * t))
            moved = np.zeros_like(piece)
            mm = shift(mask, oy, ox)
            for c in range(4):
                moved[..., c] = shift(piece[..., c], oy, ox)
            L['a'] = base.copy()
            L['a'][mm] = moved[mm]
            Doc.touch(L)
            self.tl.shot()

    def snapshot(self, L):
        return L['a'].copy()

    def undo(self, L, snap, hold=2):
        L['a'] = snap
        Doc.touch(L)
        self.tl.shot(hold)

    def flip(self, hold=14):
        self.doc.flip = True
        self.tl.shot(hold)
        self.doc.flip = False
        self.tl.shot(2)

    def lines(self, L, src, mask, run=16, frames=None, start=None, zmax=None):
        """Pixel line art put down one run at a time, the pen moving on from where it
        lifted; the camera follows the pen in batches."""
        runs = []
        for ch in chains(mask):
            for i in range(0, len(ch), run):
                piece = ch[i:i + run + 1]
                if piece:
                    runs.append(piece)
        if not runs:
            return
        runs = nearest_order(runs, start or runs[0][0], lambda r: r[0], lambda r: r[-1])
        every = max(1, int(math.ceil(len(runs) / frames))) if frames else 1
        batch = max(6, every * 8)
        h, w = self.shape
        for k, r_ in enumerate(runs):
            if self.follow and k % batch == 0:
                pts = np.array([p for q in runs[k:k + batch] for p in q])
                self.tl.look((pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max() + 1, pts[:, 1].max() + 1), zmax=zmax)
            m = np.zeros((h, w), bool)
            arr = np.array(r_)
            m[arr[:, 1], arr[:, 0]] = True
            reveal(L, src, m)
            Doc.touch(L)
            self.tl.tick(every)


def silhouette_paths(mask, eps=1.6, down=2, minlen=4):
    """The outline of a shape as a few control polylines, as you'd sketch it."""
    ys, xs = np.nonzero(mask)
    if not len(ys):
        return []
    y0, y1, x0, x1 = max(0, ys.min() - 2), ys.max() + 3, max(0, xs.min() - 2), xs.max() + 3
    sub = mask[y0:y1, x0:x1]
    if down > 1:
        hh, ww = (sub.shape[0] + down - 1) // down * down, (sub.shape[1] + down - 1) // down * down
        pad = np.zeros((hh, ww), bool)
        pad[:sub.shape[0], :sub.shape[1]] = sub
        sub = pad.reshape(hh // down, down, ww // down, down).mean((1, 3)) > 0.4
    out = []
    for c in chains(edge_of(sub)):
        if len(c) < minlen:
            continue
        pts = np.array([(x * down + down / 2.0 + x0, y * down + down / 2.0 + y0) for x, y in c])
        out.append(rdp(pts, eps))
    return out


def distort(paths, rng, centre, scale=0.04, rot=2.0, off=1.5):
    """Sketches never sit exactly where the finished thing ends up."""
    s = 1 + rng.gauss(0, scale)
    a = math.radians(rng.gauss(0, rot))
    ox, oy = rng.gauss(0, off), rng.gauss(0, off)
    cx, cy = centre
    out = []
    for p in paths:
        q = np.asarray(p, float) - (cx, cy)
        q = np.stack([q[:, 0] * math.cos(a) - q[:, 1] * math.sin(a), q[:, 0] * math.sin(a) + q[:, 1] * math.cos(a)], 1) * s
        out.append(q + (cx + ox, cy + oy))
    return out


def grey(img):
    """A greyscale copy (RGBA) for the value study."""
    out = img.copy()
    g = np.clip(_lum(img[..., :3].astype(np.float32)) + 0.5, 0, 255).astype(np.uint8)
    out[..., 0] = out[..., 1] = out[..., 2] = g
    return out


def gradient_map(img, dark=(28, 36, 72), mid=(176, 92, 84), light=(255, 226, 170)):
    """A gradient-map adjustment: every colour replaced by its place on a ramp."""
    t = np.clip(_lum(img.astype(np.float32)) / 255.0, 0, 1)[..., None]
    lo = np.array(dark, np.float32) * (1 - t * 2) + np.array(mid, np.float32) * (t * 2)
    hi = np.array(mid, np.float32) * (2 - t * 2) + np.array(light, np.float32) * (t * 2 - 1)
    return np.clip(np.where(t < 0.5, lo, hi) + 0.5, 0, 255).astype(np.uint8)


def strays_round(pn, L, m, n, rng, colour):
    """A few pixels dropped just outside a shape by a quick stroke - to be cleaned up later."""
    ring = grow(m, 1) & ~m
    ys, xs = np.nonzero(ring)
    out = []
    if not len(ys):
        return out
    for _ in range(n):
        i = rng.randrange(len(ys))
        mm = np.zeros(m.shape, bool)
        mm[ys[i], xs[i]] = True
        lay(L, mm, colour)
        out.append((L, int(ys[i]), int(xs[i])))
    Doc.touch(L)
    return out


def clean_up(pn, tl, strays, zmax=4.0):
    """Zoomed right in: the stray pixels picked off one by one."""
    left = list(strays)
    while left:
        L, y, x = left.pop(0)
        near = [s for s in left if abs(s[1] - y) < 14 and abs(s[2] - x) < 24]
        for s in near:
            left.remove(s)
        group = [(L, y, x)] + near
        ys = [g[1] for g in group]
        xs = [g[2] for g in group]
        tl.look((min(xs) - 6, min(ys) - 4, max(xs) + 7, max(ys) + 5), zmax=zmax, settle=18, force=True, pad=0.4)
        tl.shot(4)
        for (Lg, yy, xx) in group:
            mm = np.zeros((pn.doc.h, pn.doc.w), bool)
            mm[yy, xx] = True
            rub(Lg, mm)
            Doc.touch(Lg)
            tl.shot(3)
        tl.shot(3)


# ---------------------------------------------------------------- the goat-dragon
def goat(out_dir):
    import wyvern as V
    s = V._state(lid=0.5, look=-1)
    s['oy'] = 0
    V.set_pose(0.0)
    P = V.draw(s, stages=True)
    a = P['a']
    fin_cv = P['final'].copy()
    V.jewelry(a, fin_cv)
    w, h = V.W, V.H

    def gesture(oy=0):
        G = lambda pts: [(x, y + oy) for x, y in pts]
        Lp = lambda pts: [V.LP(p, oy) for p in pts]
        return [G([(132, 140), (110, 87), (84, 63), (62, 59)]) + Lp([(-11, -4.5), (-45, 2), (-66, 10), (-71, 19)]),
                Lp([(-68, 25), (-52, 27.5), (-34, 32), (-12, 37)]),
                Lp([(-65, 30), (-50, 35), (-30, 38), (-8, 34), (0, 14)]),
                G([(58, 64), (61, 48), (72, 43), (80, 58)]), G([(65, 62), (69, 48), (79, 45), (85, 58)]),
                G([(74, 94), (78, 118), (72, 150)]), G([(122, 110), (134, 152)]),
                G([(64, 69), (84, 80)])]
    now = dict(g=gesture(), cr=V._cranium(0, 12), cl=V._construction_lines(0))
    V.ANG = math.radians(-18)                       # the first idea: the head held flat
    V.POLL = (66.0, 56.0)
    old = dict(g=gesture(), cr=V._cranium(0, 12), cl=V._construction_lines(0))
    V.set_pose(0.0)

    flats, two, render, tex = P['flats'].a, P['two'].a, P['render'].a, P['texture'].a
    final = fin_cv.a.copy()
    paper = PAL['paper4']
    solid = flats[..., 3] > 0
    lum = lambda x: x[..., :3].astype(int).sum(-1)
    diff = lambda x, y: (x[..., 3] > 0) & (np.abs(x[..., :3].astype(int) - y[..., :3].astype(int)).sum(-1) > 0)

    doc = Doc(w, h, paper)
    tl = Timelapse(doc, (1080, 1350), os.path.join(out_dir, 'goat_dragon_timelapse.mp4'), zmax=2.6)
    pn = Painter(doc, tl, 11)
    tl.shot(16)

    # 1 a first rough with the head held flat - faded down, then hidden
    R1 = doc.add('Rough 1', group='rough')
    blue = (96, 140, 210)
    pn.follow = False
    for c in old['g']:
        pn.curve(R1, c, seg=(30, 60), wob=1.3, over=6, color=blue, alpha=0.8)
    pn.curve(R1, old['cr'], closed=True, seg=(20, 40), wob=1.0, over=4, color=blue, alpha=0.8)
    for c in old['cl'][:3]:
        pn.curve(R1, c, seg=(20, 50), wob=0.6, over=5, color=blue, alpha=0.7)
    tl.shot(8)
    pn.flip(10)
    pn.fade(R1, 0.3)

    # 2 the second rough, at the real angle; a horn swept too tall, rubbed out, drawn again
    R2 = doc.add('Rough 2', group='rough')
    for k, c in enumerate(now['g']):
        if k == 3:
            bad = [(58, 64), (60, 34), (82, 24), (101, 36)]
            tl.look((50, 18, 108, 70), settle=14)
            m = pn.curve(R2, bad, seg=(40, 70), wob=1.2, over=5, color=blue, alpha=0.8)
            tl.shot(6)
            for piece in split_curve(resample(catmull(bad), 0.5), pn.rng, (14, 22)):
                pn.stroke(R2, piece[::3], size=3, erase=True, clip=grow(m, 1), wob=0.6)
            tl.shot(3)
            tl.full(settle=10)
        pn.curve(R2, c, seg=(30, 60), wob=1.3, over=6, color=blue, alpha=0.8)
    pn.curve(R2, now['cr'], closed=True, seg=(18, 40), wob=1.0, over=4, color=blue, alpha=0.8)
    for c in now['cl']:
        pn.curve(R2, c, seg=(20, 50), wob=0.6, over=5, color=blue, alpha=0.7)
    pn.hide(R1)
    pn.fade(R2, 0.4)

    # 3 the sketch: parts gone over, an eye too big, the jaw drawn low and moved after a flip
    S = doc.add('Sketch', group='rough')
    ink = (70, 60, 72)
    jaw_mask = np.zeros((h, w), bool)
    for key in ('head', 'brow', 'muzzle', 'jaw', 'cheek', 'socket', 'eye', 'nostril', 'beard', 'ear_in', 'neck', 'spike'):
        pts = a['pts'][key]
        P_ = np.array(pts, float)
        tl.look((P_[:, 0].min(), P_[:, 1].min(), P_[:, 0].max(), P_[:, 1].max()), zmax=2.2, settle=8)
        if key == 'eye':
            cx, cy = np.mean(pts, axis=0)
            big = [(cx + (x - cx) * 1.9, cy + (y - cy) * 1.7) for x, y in pts]
            tl.look((cx - 14, cy - 12, cx + 14, cy + 12), zmax=2.6, settle=10)
            m = pn.curve(S, big, closed=True, seg=(10, 20), wob=0.5, over=1.5, color=ink, alpha=0.85)
            tl.shot(8)
            for k in range(3):
                pn.stroke(S, [(cx - 7 + k * 5, cy - 6), (cx - 4 + k * 5, cy + 6), (cx - 1 + k * 5, cy - 6)],
                          size=3, erase=True, clip=grow(m, 1), wob=0.5)
            tl.shot(4)
        if key == 'jaw':
            low = [(x, y + 3) for x, y in pts]
            jaw_mask = pn.curve(S, low, closed=True, seg=(14, 32), passes=2, wob=0.8, over=3, color=ink, alpha=0.85)
            continue
        passes = 2 if key in ('head', 'beard', 'muzzle') else 1
        pn.curve(S, pts, closed=key not in ('spike',), seg=(14, 32), passes=passes, wob=0.8, over=2.5,
                 color=ink, alpha=0.85)
    for key, (pts, r) in a['lines'].items():
        c = np.array(V.spline(pts, closed=False))
        tl.look((c[:, 0].min() - r, c[:, 1].min() - r, c[:, 0].max() + r, c[:, 1].max() + r), zmax=2.2, settle=8)
        for side in (-1, 1):
            off = []
            for k, (x, y) in enumerate(c):
                q0, q1 = c[max(0, k - 1)], c[min(len(c) - 1, k + 1)]
                dx, dy = q1[0] - q0[0], q1[1] - q0[1]
                ln = math.hypot(dx, dy) or 1
                rr = r * (1 - 0.75 * k / max(1, len(c) - 1))
                off.append((x - dy / ln * rr * side, y + dx / ln * rr * side))
            off = np.array(off)[::max(1, len(off) // 10)]
            pn.curve(S, off, seg=(16, 34), wob=0.6, over=2, color=ink, alpha=0.85)
        rings = 7
        for k in range(1, rings):                                   # the horn's ridges
            i = int(k / rings * (len(c) - 1))
            q0, q1 = c[max(0, i - 1)], c[min(len(c) - 1, i + 1)]
            dx, dy = q1[0] - q0[0], q1[1] - q0[1]
            ln = math.hypot(dx, dy) or 1
            rr = r * (1 - 0.75 * i / max(1, len(c) - 1))
            x, y = c[i]
            pn.stroke(S, [(x - dy / ln * rr, y + dx / ln * rr), (x + dy / ln * rr * 0.9, y - dx / ln * rr * 0.9)],
                      color=ink, alpha=0.7, wob=0.3, over=0.8)
    teeth = np.zeros((h, w), bool)
    for t in a['teeth']:
        teeth |= t
    tl.look_at(teeth, zmax=2.6, settle=10)
    for t in a['teeth']:
        for ch in chains(edge_of(t)):
            if len(ch) > 1:
                pn.stroke(S, ch, color=ink, alpha=0.8, raw=True, every=2)
    tl.shot(6)
    tl.full(settle=12)
    pn.flip(18)                                                     # the jaw hangs too low: lasso it, nudge it up
    pn.move(S, grow(jaw_mask, 0) & (S['a'][..., 3] > 0), 0, -3, steps=5)
    tl.shot(4)
    shade = V._shade_region(a)
    ys, xs = np.nonzero(shade)
    if len(ys):
        tl.look_at(shade, zmax=1.6, settle=10)
        idx = np.argsort(xs + ys * 0.5)[::max(1, len(ys) // 70)]
        for i in idx:
            x, y = xs[i], ys[i]
            ln = pn.rng.uniform(3, 6)
            pn.stroke(S, [(x - ln * 0.5, y + ln * 0.5), (x + ln * 0.5, y - ln * 0.5)], color=ink, alpha=0.5,
                      wob=0.2, clip=shade, every=2)
    tl.shot(6)
    tl.full(settle=10)
    pn.hide(R2)
    pn.fade(S, 0.3)
    pn.follow = True

    # 4 pixel line art: one run at a time, a run put down wrong and redone, doubled pixels cleaned up after
    Ln = doc.add('Lines', group='lines')
    linec = rgb(V.INK)
    runs = []
    for ch in chains(P['ink']):
        for i in range(0, len(ch), 18):
            piece = ch[i:i + 19]
            if len(piece) >= 1:
                runs.append(piece)
    runs = nearest_order(runs, (10, 110), lambda r: r[0], lambda r: r[-1])
    extras = np.zeros((h, w), bool)
    for k, run in enumerate(runs):
        if k % 6 == 0:
            pts = np.array([p for q in runs[k:k + 6] for p in q])
            tl.look((pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max() + 1, pts[:, 1].max() + 1), zmax=2.6)
        m = np.zeros((h, w), bool)
        arr = np.array(run)
        m[arr[:, 1], arr[:, 0]] = True
        if k == len(runs) // 3:
            wrong = shift(m, 1, 1)
            lay(Ln, wrong, linec)
            Doc.touch(Ln)
            tl.shot(8)
            rub(Ln, wrong & ~(Ln['a'][..., 3] > 0) | (wrong & ~m))
            Doc.touch(Ln)
            tl.shot(4)
        if k % 5 == 2 and len(run) > 4:                              # drawn quickly: a doubled corner
            j = len(run) // 2
            x, y = run[j]
            for dx_, dy_ in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                xx, yy = x + dx_, y + dy_
                if 0 <= xx < w and 0 <= yy < h and not P['ink'][yy, xx] and not m[yy, xx]:
                    extras[yy, xx] = True
                    m[yy, xx] = True
                    break
        lay(Ln, m, linec)
        Doc.touch(Ln)
        tl.tick(1)
    tl.full(settle=12)
    tl.shot(8)
    pn.flip(10)
    clean_up(pn, tl, [(Ln, int(y), int(x)) for (y, x) in zip(*np.nonzero(extras))][:14], zmax=2.6)
    for (y, x) in zip(*np.nonzero(extras)):                          # and the rest, quicker
        mm = np.zeros((h, w), bool)
        mm[y, x] = True
        rub(Ln, mm)
        Doc.touch(Ln)
        tl.tick(2)
    stray = P['ink'] & (final[..., 3] == 0)
    for ch in chains(stray):
        mm = np.zeros((h, w), bool)
        arr = np.array(ch)
        mm[arr[:, 1], arr[:, 0]] = True
        rub(Ln, mm)
        Doc.touch(Ln)
        tl.tick(2)
    tl.full(settle=12)
    tl.shot(6)

    # 5 flats under the lines: bucket fills; the fur first tried brown, then slid to white
    Fl = doc.add('Flats', below=Ln, group='flats')
    fur = solid & (a['head'] | a['neck'] | a['jaw'] | a['brow'] | a['cheek'])
    brown = np.zeros_like(flats)
    brown[..., :3] = rgb('wood2')
    brown[..., 3] = 255
    pn.fill(Fl, fur, src=brown, hold=6)
    tan = np.zeros_like(flats)
    tan[..., :3] = rgb('wood3')
    tan[..., 3] = 255
    pn.adjust(Fl, fur, tan, steps=8, hold_end=8)
    pn.adjust(Fl, fur, flats, steps=12, hold_end=6)
    for key in ('horn_near', 'horn_far', 'spike', 'beard', 'muzzle', 'mane', 'eye', 'socket', 'plates', 'belly',
                'frills', 'spurs', 'mouth', 'nostril', 'ear_in', 'throat'):
        if key in a:
            m = solid & a[key] & ~(Fl['a'][..., 3] > 0)
            if m.sum() > 2:
                pn.fill(Fl, m, src=flats, hold=3)
    rest = solid & ~(Fl['a'][..., 3] > 0)
    if rest.any():
        pn.fill(Fl, rest, src=flats, hold=2)
    tl.full(settle=10)
    pn.hide(S)

    # 6 shading, clipped to the flats: a patch on the wrong side and erased, two-tone shapes, then rendered
    Sh = doc.add('Shading', below=Ln, group='shading')
    wrong = solid & (np.abs(np.mgrid[0:h, 0:w][1] - 46) < 7) & (np.abs(np.mgrid[0:h, 0:w][0] - 94) < 6)
    pn.scribble(Sh, wrong, 2, 0.6, color=two[wrong][0][:3] if wrong.any() else 'stone2', frames=5, touch=False)
    tl.shot(8)
    pn.scribble(Sh, grow(wrong, 1) & (Sh['a'][..., 3] > 0), 4, 0.6, color=(0, 0, 0), frames=3, touch=False)
    rub(Sh, wrong | grow(wrong, 2))
    Doc.touch(Sh)
    tl.shot(3)
    dark2 = diff(two, flats)
    dark_r = diff(render, flats) & (lum(render) < lum(flats))
    light_r = diff(render, flats) & (lum(render) >= lum(flats))
    tl.full(settle=10)
    pn.follow = False
    pn.scribble(Sh, dark2, 2.5, math.radians(60), src=two, frames=40, max_len=22, rows=(2, 4))
    tl.shot(6)
    pn.follow = True
    for key in ('head', 'neck', 'jaw', 'horn_near', 'beard'):     # rendered part by part, close up
        if key in a:
            m = (dark2 | dark_r) & a[key]
            if m.sum() > 8:
                pn.scribble(Sh, m, 1.5, math.radians(35), src=render, frames=max(6, int(m.sum() / 30)), max_len=14,
                            rows=(1, 3), zmax=2.4)
    m = (dark2 | dark_r) & ~(Sh['a'][..., 3] > 0) | diff(render, Sh['a']) & (dark2 | dark_r)
    pn.scribble(Sh, m, 1.5, math.radians(35), src=render, frames=20, max_len=14, rows=(1, 3))
    tl.shot(6)
    # highlights pushed too bright, then pulled back
    Hi = doc.add('Highlights', below=Ln, group='shading')
    hot = render.copy()
    hot[..., :3] = np.clip(render[..., :3].astype(int) * 0.45 + 255 * 0.55, 0, 255).astype(np.uint8)
    pn.scribble(Hi, light_r, 1.5, math.radians(-30), src=hot, frames=25, max_len=12, rows=(1, 3))
    tl.shot(12)
    pn.adjust(Hi, light_r & (Hi['a'][..., 3] > 0), render, steps=10, hold_end=6)

    # 7 fur and scales: short strokes that follow the hair, close up
    T = doc.add('Fur & scales', below=Ln, group='texture')
    texm = diff(tex, render) | ((tex[..., 3] > 0) & (render[..., 3] == 0))
    flow = [('horn_near', 120), ('horn_far', 120), ('beard', 95), ('mane', 70), ('neck', 80), ('jaw', 170),
            ('muzzle', 175), ('head', 190), ('brow', 200), ('cheek', 160)]
    done = np.zeros((h, w), bool)
    for key, ang in flow:
        if key not in a:
            continue
        m = texm & a[key] & ~done
        if m.sum() < 3:
            continue
        pn.scribble(T, m, 1.0, math.radians(ang), src=tex, frames=max(6, int(m.sum() / 30)), max_len=7, rows=(1, 2),
                    wob=0.35, zmax=2.6)
        done |= m
    m = texm & ~done
    if m.any():
        pn.scribble(T, m, 1.0, math.radians(45), src=tex, frames=max(4, int(m.sum() / 40)), max_len=7, rows=(1, 2))
    tl.full(settle=12)
    tl.shot(6)

    # 8 the lines coloured into the form (alpha lock), the eye, then the last details
    pn.scribble(Ln, Ln['a'][..., 3] > 0, 1.5, math.radians(20), src=final, frames=25, max_len=10, rows=(1, 2))
    D = doc.add('Details', group='texture')
    cur = doc.composite()
    want = final[..., 3] > 0
    over_paper = final[..., :3].astype(int)
    det = want & (np.abs(cur.astype(int) - over_paper).sum(-1) > 0)
    eye = det & a['eye'] if 'eye' in a else np.zeros((h, w), bool)
    if eye.any():
        pn.scribble(D, eye, 1.0, math.radians(10), src=final, frames=16, max_len=4, rows=(1, 2), wob=0.25, zmax=2.6)
        tl.shot(10)
    pn.scribble(D, det & ~eye, 1.0, math.radians(10), src=final, frames=40, max_len=6, rows=(1, 2), wob=0.3)
    gone = (final[..., 3] == 0)
    for L in doc.layers[1:]:
        if L['visible']:
            rub(L, gone)
            Doc.touch(L)
    tl.full(settle=16)
    tl.shot(4)
    pn.flip(16)
    tl.shot(int(FPS * 1.5))
    save_psd(doc, os.path.join(out_dir, 'goat_dragon_layers.psd'), 4)
    comp = doc.composite()
    Image.fromarray(comp).resize((w * 4, h * 4), Image.NEAREST).save(os.path.join(out_dir, 'goat_dragon_final.png'))
    ref = np.where(final[..., 3:4] > 0, final[..., :3], np.array(paper, np.uint8))
    exact = bool((comp == ref).all())

    # the layers, apart and back together
    explode(tl, [doc.sheet(g) for g in ('paper', 'flats', 'shading', 'texture', 'lines')])
    tl.shot(8)
    # and it comes alive: breathes, blinks, glances about
    states = ([{}] * 4 + [dict(breath=1), dict(breath=2), dict(breath=3)] + [{}] * 3 +
              [dict(lid=0.8), dict(lid=1.0), dict(lid=1.0, membrane=0.6), dict(lid=0.72, membrane=0.3)] + [{}] * 3 +
              [dict(look=-0.5), dict(look=0.0), dict(look=0.0), dict(look=0.0, lid=0.85), dict(look=0.0),
               dict(look=-0.5)] + [{}] * 2 + [dict(jaw=0.15), dict(jaw=0.25), dict(jaw=0.12)] + [{}] * 3)
    cache = {}
    frames = []
    for st in states:
        key = tuple(sorted(st.items()))
        if key not in cache:
            ss = V._state(lid=0.5, look=-1)
            ss.update(st)
            ss['oy'] = 0
            cv = V.draw(ss)
            fa = cv.a
            cache[key] = np.where(fa[..., 3:4] > 0, fa[..., :3], np.array(paper, np.uint8))
        frames.append(cache[key])
    come_alive(tl, [(frames, len(frames) / 6.0 * 2)], fps=6)
    n = tl.close()
    print('goat-dragon: %d frames (%.1f s), matches model: %s' % (n, n / FPS, exact))


# ---------------------------------------------------------------- a room
NAMES = {0: 'room1_cook_room', 1: 'room2_seating_room', 2: 'room3_counter_room', 3: 'room4_bedroom'}
ALIVE = [('summer', 48), ('spring', 30), ('autumn', 30), ('winter', 30), ('bloodmoon', 48)]


def room_pieces(sc, ri):
    """The finished room taken apart: outside layers, walls, each prop, posts, light;
    and the room moving, in each season."""
    import build
    import layout as LY
    import propkit
    sc.use_season(None)
    cam = ri * LY.SW
    w = LY.SW
    crop = lambda cv: cv.a[:, cam:cam + w].copy()
    blank = lambda: Canvas(LY.W, LY.H)
    outs = []
    for name, frames, fac, *off in sc.outs:
        c = blank()
        origin = int(round(cam * (1 - fac)))
        ox, oy = off[0] if off else (0, 0)
        x = origin % 1280 - 1280
        while x < LY.W:
            c.blit(frames[0], x + ox, oy)
            x += 1280
        nice = {'00_sky': 'Sky', '01_clouds': 'Clouds', '02_mountains': 'Mountains', '03_lake': 'Lake',
                '05_hills_trees': 'Far shore', '06_garden_trees': 'Garden trees',
                '07_flowers_close': 'Flower bed'}.get(name)          # birds, fish and drift are animation only
        if nice:
            outs.append((nice, crop(c)))
    props = []
    for layer in build.LAYER_ORDER:
        if layer == 'counter_layer':
            cc = crop(sc.counter)
            if (cc[..., 3] > 0).any():
                props.append(('Counter', cc, 'counter'))
            continue
        for p in sc.props:
            if p['layer'] == layer and p.get('preview', True) and p['room'] == ri + 1 and p['layer'] != 'outside':
                c = blank()
                c.blit(p['frames'][0], p['sx'], p['sy'])
                props.append((p['name'].replace('_', ' '), crop(c), p['layer']))
    extra = None
    for e in propkit.PROPS:
        if e['room'] == ri + 1 and not e['preview'] and e['layer'] in ('wall', 'floor', 'counter'):
            out = e['fn']()
            fr = out[0] if isinstance(out, list) else (next(iter(out.values()))[0] if isinstance(out, dict) else out)
            if isinstance(fr, list):
                fr = fr[0]
            c = blank()
            c.blit(fr, e['x'], e['y'])
            extra = (e['name'].replace('_', ' '), crop(c))
            break
    d = dict(outs=outs, shell=crop(sc.shell), props=props, extra=extra, fg=crop(sc.fg[0]),
             light=crop(sc.light[0]) if isinstance(sc.light, list) else crop(sc.light),
             final=sc.view(0, cam, light=True).a.copy())
    alive = {}
    for s, n in ALIVE:
        sc.use_season(None if s == 'summer' else s)
        alive[s] = np.stack([sc.view(k / 12.0, cam).a[..., :3] for k in range(n)])
    sc.use_season(None)
    d['alive'] = alive
    return d


def room(d, ri, out_dir):
    import layout as LY
    w, h = LY.SW, LY.SH
    rng = random.Random(200 + ri)
    name = NAMES[ri]
    final = d['final']
    shell = d['shell']
    paper = (244, 240, 230)
    doc = Doc(w, h, paper)
    tl = Timelapse(doc, (1920, 1080), os.path.join(out_dir, name + '_timelapse.mp4'), zmax=3.0)
    pn = Painter(doc, tl, 300 + ri)
    tl.shot(14)
    VX, VY = w / 2.0, LY.EYE_Y
    BX0, BX1, TOP, FL = LY.BX, w - LY.BX, LY.WALL_TOP, LY.FLOOR
    corners = [(BX0, TOP), (BX1, TOP), (BX0, FL), (BX1, FL)]
    yy, xx = np.mgrid[0:h, 0:w]

    def to_edge(px, py):
        dx, dy = px - VX, py - VY
        t = min([v for v in ((-VX / dx) if dx < 0 else ((w - 1 - VX) / dx) if dx > 0 else 1e9,
                             (-VY / dy) if dy < 0 else ((h - 1 - VY) / dy) if dy > 0 else 1e9) if v > 0])
        return (VX + dx * t, VY + dy * t)

    # 1 thumbnails: three quick value sketches of the room, small; the third one is picked
    pn.follow = False
    Th = doc.add('Thumbnails', group='rough')
    tw_, th_ = 96, 54
    small = np.array(Image.fromarray(final[..., :3]).resize((tw_, th_), Image.BOX))
    zoomed = np.array(Image.fromarray(small).resize((int(tw_ * 1.4), int(th_ * 1.4)), Image.BOX))
    oz = (zoomed.shape[1] - tw_) // 2 + (12 if ri % 2 else -12), (zoomed.shape[0] - th_) // 2 + 4
    variants = [small[:, ::-1], zoomed[oz[1]:oz[1] + th_, oz[0]:oz[0] + tw_], small]
    boxes = [(14 + i * (tw_ + 14), 16) for i in range(3)]
    tl.look((6, 6, boxes[-1][0] + tw_ + 8, 16 + th_ + 8), zmax=2.4, settle=24, force=True, pad=0.04)
    pencil = (62, 58, 64)
    for (bx, by), v in zip(boxes, variants):
        src = np.zeros((h, w, 4), np.uint8)
        g = grey(np.dstack([v, np.full(v.shape[:2], 255, np.uint8)]))
        box = np.zeros((h, w), bool)
        box[by:by + th_, bx:bx + tw_] = True
        src[by:by + th_, bx:bx + tw_] = tones(g, np.ones(g.shape[:2], bool), k=4, smooth=3)
        for (p0, p1) in (((bx, by), (bx + tw_, by)), ((bx + tw_, by), (bx + tw_, by + th_)),
                         ((bx + tw_, by + th_), (bx, by + th_)), ((bx, by + th_), (bx, by))):
            pn.stroke(Th, [p0, p1], color=pencil, alpha=0.9, wob=0.5, over=2.0)
        pn.scribble(Th, box, 3, math.radians(rng.choice((20, 35, -25))), src=src, frames=16, max_len=36,
                    rows=(2, 4), touch=False, wob=0.5)
        tl.shot(6)
    red = (196, 64, 54)
    bx, by = boxes[2]
    ring = [(bx + tw_ / 2 + math.cos(t) * (tw_ / 2 + 7), by + th_ / 2 + math.sin(t) * (th_ / 2 + 7))
            for t in np.linspace(0.3, 0.3 + 2 * math.pi, 9)[:-1]]
    pn.curve(Th, ring, closed=True, seg=(40, 80), wob=1.0, over=4, color=red, alpha=0.9)
    for (x0, y0) in boxes[:2]:                                      # the other two struck through
        pn.stroke(Th, [(x0 - 3, y0 - 2), (x0 + tw_ + 3, y0 + th_ + 2)], color=red, alpha=0.85, wob=0.8, over=3)
        pn.stroke(Th, [(x0 + tw_ + 2, y0 - 3), (x0 - 2, y0 + th_ + 3)], color=red, alpha=0.85, wob=0.8, over=3)
    tl.shot(16)
    # the pick, scaled up to the whole canvas with the transform tool, as an underlay
    pick = Th['a'][by:by + th_, bx:bx + tw_].copy()
    Sc = doc.add('Thumbnail, scaled up', above=Th, group='rough')
    tl.full()
    for k in range(1, 21):
        t = k / 20.0
        t = t * t * (3 - 2 * t)
        rx, ry = bx * (1 - t), by * (1 - t)
        rw, rh = tw_ + (w - tw_) * t, th_ + (h - th_) * t
        im = np.array(Image.fromarray(pick).resize((max(1, int(round(rw))), max(1, int(round(rh)))), Image.NEAREST))
        Sc['a'][:] = 0
        x0, y0 = int(round(rx)), int(round(ry))
        ih, iw = min(h - y0, im.shape[0]), min(w - x0, im.shape[1])
        Sc['a'][y0:y0 + ih, x0:x0 + iw] = im[:ih, :iw]
        Doc.touch(Sc)
        tl.shot()
    pn.hide(Th, hold=4)
    pn.fade(Sc, 0.35)
    tl.shot(8)

    # 2 perspective: horizon, rays from the vanishing point, floor and ceiling lines; one ray undone
    Pg = doc.add('Perspective', group='rough')
    blue = (110, 150, 215)
    pn.stroke(Pg, [(0, VY), (w - 1, VY)], color=blue, alpha=0.7, wob=0.25)
    rays = corners + [(VX - 150, 0), (VX + 150, 0), (VX - 200, h - 1), (VX + 200, h - 1)]
    for k, (px, py) in enumerate(rays):
        if k == 2:
            snap = pn.snapshot(Pg)
            pn.stroke(Pg, [(VX, VY), to_edge(px + 60, py + 20)], color=blue, alpha=0.7, wob=0.2)
            tl.shot(5)
            pn.undo(Pg, snap, 3)
        pn.stroke(Pg, [(VX, VY), to_edge(px, py)], color=blue, alpha=0.7, wob=0.2)
    for sd in (0.84, 0.68, 0.56):                                   # boards and beams stepping toward you
        for yl, x0_, x1_ in ((VY + (FL - VY) / sd, BX0, BX1), (VY - (VY - TOP) / sd, BX0, BX1)):
            if 0 < yl < h:
                pn.stroke(Pg, [(VX + (x0_ - VX) / sd, yl), (VX + (x1_ - VX) / sd, yl)], color=blue, alpha=0.5,
                          wob=0.3)
    tl.shot(6)
    pn.follow = True

    # 3 rough sketch: the box of the room, the windows, then every piece - one drawn in
    #   the wrong spot and dragged over, one idea sketched and rubbed out
    R = doc.add('Rough', group='rough')
    dk = (72, 58, 66)
    ra = 0.75
    pn.follow = False
    box = [[(BX0, TOP), (BX1, TOP)], [(BX1, TOP), (BX1, FL)], [(BX1, FL), (BX0, FL)], [(BX0, FL), (BX0, TOP)]]
    for c in box:
        pn.curve(R, c, seg=(60, 140), wob=0.8, over=6, color=dk, alpha=ra)
    for c in corners:
        e = to_edge(*c)
        pn.curve(R, [c, e], seg=(50, 120), wob=0.7, over=4, color=dk, alpha=ra)
    for yl in (LY.RAIL[0], LY.WAINS[1], LY.CEIL_Y):
        pn.curve(R, [(BX0 - 2, yl), (BX1 + 2, yl)], seg=(70, 160), wob=0.8, over=5, color=dk, alpha=ra * 0.8)
    holes = (shell[..., 3] < 255)
    if holes.any():
        tl.look_at(grow(holes, 6), zmax=2.0, settle=12)
    for c in silhouette_paths(grow(holes, 3), eps=2.0, down=3, minlen=5):
        pn.curve(R, c, seg=(20, 50), passes=2, wob=0.9, over=3, color=dk, alpha=ra, every=2)
    props = [(nm, img, kind) for nm, img, kind in d['props'] if (img[..., 3] > 0).sum() > 30]
    moved_i = None
    for i, (nm, img, kind) in enumerate(props):
        m = img[..., 3] > 0
        area = m.sum()
        tl.look_at(grow(m, 4), zmax=2.0, settle=6)
        paths = silhouette_paths(m, eps=2.2 if area > 3000 else 1.5, down=2 if area > 600 else 1, minlen=4)
        ys, xs = np.nonzero(m)
        paths = distort(paths, rng, (xs.mean(), ys.mean()), scale=0.03, rot=1.5, off=1.5)
        every = 2 if area > 2000 else 1
        if moved_i is None and 1500 < area < 20000 and i > 0:
            moved_i = i
            dx = 46 if xs.mean() < w / 2 else -46
            tl.look((xs.min() - abs(dx) - 6, ys.min() - 6, xs.max() + abs(dx) + 6, ys.max() + 6), zmax=2.0,
                    settle=10, force=True)
            tmp = doc.add('Rough (copy)')
            for pth in paths:
                pn.curve(tmp, np.asarray(pth) - (dx, 0), seg=(16, 40), wob=0.8, over=3, color=dk, alpha=ra, every=every)
            tl.shot(8)
            pn.move(tmp, tmp['a'][..., 3] > 0, dx, 0, steps=8)
            tl.shot(4)
            mm = tmp['a'][..., 3] > 0
            R['a'][mm] = tmp['a'][mm]
            doc.remove(tmp)
            Doc.touch(R)
            continue
        for pth in paths:
            pn.curve(R, pth, seg=(16, 40), wob=0.8, over=3, color=dk, alpha=ra, every=every)
        if i == len(props) // 2:                                    # an idea tried and rubbed out
            ex, ey = rng.randint(120, w - 200), rng.randint(90, 160)
            tl.look((ex - 10, ey - 10, ex + 80, ey + 56), zmax=2.2, settle=12, force=True)
            snap_m = np.zeros((h, w), bool)
            for c in ([(ex, ey), (ex + 70, ey + 2)], [(ex + 70, ey + 2), (ex + 68, ey + 46)],
                      [(ex + 68, ey + 46), (ex - 1, ey + 44)], [(ex - 1, ey + 44), (ex, ey)],
                      [(ex + 6, ey + 14), (ex + 62, ey + 15)], [(ex + 30, ey + 2), (ex + 32, ey + 44)]):
                snap_m |= pn.curve(R, c, seg=(30, 80), wob=0.8, over=4, color=dk, alpha=ra)
            tl.shot(12)
            region = grow(snap_m, 2)
            pn.scribble(R, region, 6, math.radians(20), color=(0, 0, 0), frames=6, clip=True, touch=False, rows=(3, 6))
            rub(R, region)
            Doc.touch(R)
            tl.shot(4)
    tl.full(settle=16)
    tl.shot(8)
    pn.fade(Pg, 0.3)
    pn.flip(14)

    # 4 a value study under the sketch: greys only, big loose strokes, the light worked out first
    Va = doc.add('Values', above=doc.layers[0], group='study')
    inside = (xx >= BX0) & (xx <= BX1) & (yy >= TOP) & (yy <= FL)
    ang = np.arctan2(yy - VY, xx - VX)
    a_c = [math.atan2(cy - VY, cx - VX) for cx, cy in corners]           # TL, TR, BL, BR
    ceil_ = ~inside & (ang > a_c[0] - 2 * math.pi) & (ang < a_c[1]) & (yy < TOP)
    floor_ = ~inside & (yy > FL) & (ang > a_c[3]) & (ang < a_c[2])
    left_ = ~inside & (xx < BX0) & ~ceil_ & ~floor_
    right_ = ~inside & (xx > BX1) & ~ceil_ & ~floor_
    sh_m = shell[..., 3] > 0
    regions = [('back', inside & sh_m, 9, 90), ('ceiling', ceil_ & sh_m, 9, 0), ('floor', floor_ & sh_m, 9, 0),
               ('left', left_ & sh_m, 9, 70), ('right', right_ & sh_m, 9, 110)]
    sky = d['outs'][0][1] if d['outs'] else final
    gs = grey(shell)
    for nm, m, sz, an in regions:
        if m.sum() < 50:
            continue
        pn.scribble(Va, m, sz, math.radians(an), src=tones(gs, m, k=4, smooth=7), frames=9, clip=False, touch=False,
                    rows=(3, 6), max_len=120, spacing=0.6, wob=0.6)
    if holes.any():
        pn.scribble(Va, holes, 7, 0.0, color=tuple(int(c) for c in grey(sky)[holes][:, :3].mean(0)), frames=6,
                    clip=False, touch=False, rows=(2, 5), spacing=0.6, wob=0.6)
    for nm, img, kind in sorted(props, key=lambda p: -(p[1][..., 3] > 0).sum()):
        m = img[..., 3] > 0
        if m.sum() < 120:
            continue
        sz = 5 if m.sum() > 3000 else 3
        pn.scribble(Va, m, sz, math.radians(rng.choice((30, 60, 120, 150))), src=tones(grey(img), m, 3, 5),
                    frames=max(2, int(math.sqrt(m.sum()) / 16)), clip=False, touch=False, rows=(2, 5), spacing=0.65,
                    wob=0.5, zmax=1.6)
    tl.full(settle=14)
    pn.hide(Sc, hold=4)
    tl.shot(12)

    # 5 the colour comp: a Color-blend layer over the values - the greys take on colour
    Co = doc.add('Colour', above=Va, blend='color', group='study')
    for k, (nm, m, sz, an) in enumerate(regions):
        if m.sum() < 50:
            continue
        col = mean_colour(shell, m)
        if nm == 'back':                                              # first too cold and too strong
            cold = (int(col[0] * 0.6), int(col[1] * 0.85), min(255, int(col[2] * 1.5 + 40)))
            pn.scribble(Co, m, sz + 2, math.radians(an), color=cold, frames=12, clip=True, touch=False, rows=(3, 6),
                        max_len=140, spacing=0.6, wob=0.6)
            tl.shot(12)
            tgt = Co['a'].copy()
            tgt[..., :3] = col
            pn.adjust(Co, m & (Co['a'][..., 3] > 0), tgt, steps=12, hold_end=6)
        else:
            pn.scribble(Co, m, sz + 2, math.radians(an), color=col, frames=7, clip=False, touch=False, rows=(3, 6),
                        max_len=140, spacing=0.6, wob=0.6)
    if holes.any():
        pn.scribble(Co, holes, 8, 0.0, color=mean_colour(sky, holes), frames=6, clip=False, touch=False, rows=(2, 5),
                    spacing=0.6, wob=0.6)
    for nm, img, kind in props:
        m = img[..., 3] > 0
        if m.sum() < 120:
            continue
        sz = 6 if m.sum() > 3000 else 4
        pn.scribble(Co, m, sz, math.radians(rng.choice((30, 60, 120, 150))), color=mean_colour(img, m),
                    frames=max(2, int(math.sqrt(m.sum()) / 18)), clip=False, touch=False, rows=(2, 5), spacing=0.65,
                    wob=0.5, zmax=1.6)
    tl.full(settle=14)
    tl.shot(14)
    pn.flip(12)

    # 6 the walls, floor and ceiling: value shapes first, then rendered; a few strokes undone
    Wl = doc.add('Walls, floor & ceiling', above=Co, group='walls')
    for k, (nm, m, sz, an) in enumerate(regions):
        if m.sum() < 50:
            continue
        tn = tones(shell, m, k=4, smooth=7)
        pn.scribble(Wl, m, 6, math.radians(an), src=tn, frames=10, max_len=70, rows=(2, 4))
    tl.shot(6)
    for k, (nm, m, sz, an) in enumerate(regions):
        if m.sum() < 50:
            continue
        if k == 1:
            snap = pn.snapshot(Wl)
            pn.scribble(Wl, m & (yy < TOP - 4), 3, math.radians(an + 30), color=(40, 26, 22), frames=4, touch=False,
                        rows=(2, 3))
            tl.shot(5)
            pn.undo(Wl, snap, 3)
        pn.scribble(Wl, m, 3, math.radians(an), src=tones(shell, m, k=8, smooth=3), frames=18, max_len=40,
                    rows=(1, 3))
    tl.full(settle=12)
    tl.shot(6)
    # then the grain, the cracks and the wear, close up, a patch at a time
    for k, (nm, m, sz, an) in enumerate(regions):
        if m.sum() < 50:
            continue
        ys, xs = np.nonzero(m)
        nx, ny = {'back': (3, 2), 'left': (1, 2), 'right': (1, 2)}.get(nm, (3, 1))
        cells = [(i, j) for j in range(ny) for i in (range(nx) if j % 2 == 0 else range(nx - 1, -1, -1))]
        for (i, j) in cells:
            x0_ = xs.min() + (xs.max() + 1 - xs.min()) * i // nx
            x1_ = xs.min() + (xs.max() + 1 - xs.min()) * (i + 1) // nx
            y0_ = ys.min() + (ys.max() + 1 - ys.min()) * j // ny
            y1_ = ys.min() + (ys.max() + 1 - ys.min()) * (j + 1) // ny
            patch = m & (xx >= x0_) & (xx < x1_) & (yy >= y0_) & (yy < y1_)
            if patch.sum() < 20:
                continue
            tl.look_at(patch, zmax=2.4, settle=8)
            pn.scribble(Wl, patch, 1.5, math.radians(an + rng.choice((80, 100))), src=shell, frames=10, max_len=12,
                        rows=(1, 2), wob=0.3, zmax=2.4)
        reveal(Wl, shell, m)
        Doc.touch(Wl)
    tl.full(settle=14)
    tl.shot(6)

    # 7 the view through the windows, layer by layer under the walls; what the walls
    #   hide is filled in after, for the parallax
    vis = grow(holes, 2)
    if holes.any():
        tl.look_at(grow(holes, 4), zmax=2.2, settle=14)
    pn.follow = False
    for nm, img in d['outs']:
        Lo = doc.add(nm, below=Wl, group='view')
        m = img[..., 3] > 0
        big = nm in ('Sky', 'Lake')
        sz = {'Sky': 9, 'Clouds': 4, 'Mountains': 3, 'Lake': 5, 'Far shore': 3, 'Garden trees': 2,
              'Flower bed': 2}.get(nm, 3)
        mv = m & vis
        if nm in ('Clouds', 'Mountains', 'Garden trees', 'Far shore'):
            pn.scribble(Lo, mv, sz + 2, math.radians(rng.choice((10, -15, 30))), src=tones(img, m, 3, 5), frames=6,
                        max_len=40, rows=(2, 3))
        pn.scribble(Lo, mv, sz, 0.0 if big else math.radians(rng.choice((15, -20, 40, 70))), src=img,
                    frames=12 if big else 10, max_len=100 if big else 30, rows=(2, 4) if big else (1, 3))
        reveal(Lo, img, m)
        Doc.touch(Lo)
    tl.shot(8)
    pn.follow = True
    tl.full(settle=12)
    pn.fade(R, 0.45)

    # 8 every piece on its own layer, close up: line art, flat, light and shadow, render, detail
    deleted = False
    strays = []
    for i, (nm, img, kind) in enumerate(props):
        m = img[..., 3] > 0
        area = int(m.sum())
        grp = 'props_wall' if kind in ('wall', 'ceiling') else 'props'
        tl.look_at(grow(m, 3), zmax=3.0 if area < 3000 else 2.4, settle=10)
        L = doc.add(nm, below=R, group=grp)
        flat = np.zeros_like(img)
        flat[m, :3] = mean_colour(img, m)
        flat[m, 3] = 255
        if nm == 'Counter' and ri in (1, 2):                         # the counter first painted too light
            pale = img.copy()
            pale[m, :3] = np.clip(img[m, :3].astype(int) * 0.8 + 70, 0, 255).astype(np.uint8)
            pn.fill(L, m, src=tones(pale, m, 3, 7), hold=3)
            pn.scribble(L, m, 2.5, math.radians(10), src=pale, frames=24, max_len=40, rows=(1, 3))
            tl.shot(10)
            pn.adjust(L, m, img, steps=12, hold_end=6)
            continue
        Ll = None
        if area > 700:                                               # line art first, on its own layer
            Ll = doc.add(nm + ' lines', above=L, group=grp)
            pn.lines(Ll, img, edge_of(m), run=14, frames=max(8, int(math.sqrt(area) / 3)),
                     zmax=3.0 if area < 3000 else 2.4)
            tl.shot(3)
        pn.fill(L, m, src=flat, hold=2)
        f1 = max(2, int(math.sqrt(area) / 9))
        f2 = max(4, int(math.sqrt(area) / 4))
        an = rng.choice((25, 60, 115, 150, 0, 90))
        if area > 150:
            pn.scribble(L, m, 3 if area > 2500 else 2, math.radians(an), src=tones(img, m, 3, 5), frames=f1,
                        max_len=40, rows=(2, 3))
        pn.scribble(L, m, 2 if area > 2500 else 1.5, math.radians(an + rng.choice((-30, 30))), src=img, frames=f2,
                    max_len=24 if area > 2500 else 12, rows=(1, 3))
        det = m & (np.abs(L['a'][..., :3].astype(int) - img[..., :3].astype(int)).sum(-1) > 0)
        if det.sum() > 20:                                           # the last details, a pixel or two at a time
            pn.scribble(L, det, 1.0, math.radians(an + 90), src=img, frames=max(4, int(math.sqrt(det.sum()) / 2)),
                        max_len=5, rows=(1, 2), wob=0.25, zmax=3.0)
        reveal(L, img, m)
        Doc.touch(L)
        if Ll is not None:                                           # lines merged down
            mm = Ll['a'][..., 3] > 0
            L['a'][mm] = Ll['a'][mm]
            doc.remove(Ll)
            Doc.touch(L)
            tl.shot(2)
        if i % 3 == 1 and area > 300:                                # a quick stroke leaves a stray pixel or two
            strays += strays_round(pn, L, m, rng.choice((1, 2, 2, 3)), rng, mean_colour(img, m))
            tl.shot(1)
        if not deleted and d['extra'] is not None and i > len(props) // 2:
            enm, eimg = d['extra']
            em = eimg[..., 3] > 0
            if em.any():
                tl.look_at(grow(em, 3), zmax=2.4, settle=10)
                Le = doc.add(enm, below=R, group='props')
                ef = np.zeros_like(eimg)
                ef[em, :3] = mean_colour(eimg, em)
                ef[em, 3] = 255
                pn.fill(Le, em, src=ef, hold=2)
                pn.scribble(Le, em, 2, math.radians(45), src=eimg, frames=max(3, int(math.sqrt(em.sum()) / 6)),
                            max_len=16, rows=(1, 3))
                tl.shot(14)
                Le['visible'] = False
                Doc.touch(Le)
                tl.shot(10)
                doc.remove(Le)
                tl.shot(2)
            deleted = True
        if i == int(len(props) * 0.7):
            tl.full(settle=12)
            pn.flip(12)
    tl.full(settle=14)

    # 9 posts in front, then the light
    Fg = doc.add('Posts', below=R, group='posts')
    fm = d['fg'][..., 3] > 0
    if fm.any():
        pn.fill(Fg, fm, src=tones(d['fg'], fm, 2, 5), hold=3)
        pn.scribble(Fg, fm, 2, math.radians(90), src=d['fg'], frames=12, max_len=30, rows=(1, 3))
        reveal(Fg, d['fg'], fm)
    tl.full(settle=10)
    Lt = doc.add('Light', below=R, group='light')
    lm = d['light'][..., 3] > 0
    if lm.any():
        pn.follow = False
        pn.scribble(Lt, lm, 12, math.radians(20), src=d['light'], frames=16, max_len=120, rows=(2, 4))
        reveal(Lt, d['light'], lm)
        Doc.touch(Lt)
        pn.follow = True
    pn.hide(R, 4)
    pn.hide(Pg, 2)
    tl.shot(8)

    # 10 zoomed right in: the stray pixels picked off
    clean_up(pn, tl, strays, zmax=4.0)
    tl.full(settle=16)

    # 11 a gradient map tried over everything, and thrown away
    Gm = doc.add('Gradient map', opacity=0.0)
    Gm['a'][..., :3] = gradient_map(doc.composite())
    Gm['a'][..., 3] = 255
    pn.fade(Gm, 0.7, steps=12)
    tl.shot(20)
    pn.fade(Gm, 0.0, steps=8)
    doc.remove(Gm)
    tl.shot(6)
    Va['keep_hidden'] = Co['keep_hidden'] = True
    Va['visible'] = Co['visible'] = False
    Doc.touch(Va)
    pn.flip(16)
    tl.shot(int(FPS * 1.5))
    save_psd(doc, os.path.join(out_dir, name + '_layers.psd'), 2)
    comp = doc.composite()
    Image.fromarray(comp).resize((w * 2, h * 2), Image.NEAREST).save(os.path.join(out_dir, name + '_final.png'))
    diff_ = int(np.abs(comp.astype(int) - final[..., :3]).max())

    # 12 the layers apart and back together, then the room comes alive and goes round the year
    explode(tl, [doc.sheet(g) for g in ('paper', 'view', 'walls', 'props_wall', 'props', 'posts', 'light')
                 if g == 'paper' or (doc.sheet(g)[..., 3] > 0).any()])
    tl.shot(6)
    al = d['alive']
    come_alive(tl, [(al[s], 4.0 if s in ('summer', 'bloodmoon') else 2.6) for s, _ in ALIVE])
    n = tl.close()
    print('%s: %d frames (%.1f s), %d layers, max diff from the room: %d' % (name, n, n / FPS, len(doc.layers), diff_))


def main(out_dir, which=('goat', 0, 1, 2, 3), cache=None, scene=None):
    os.makedirs(out_dir, exist_ok=True)
    if 'goat' in which:
        goat(out_dir)
    rooms = [r for r in which if r != 'goat']
    sc = None
    for ri in rooms:
        path = cache and os.path.join(cache, 'room%d_v3.pkl' % ri)
        if path and os.path.exists(path):
            d = pickle.load(open(path, 'rb'))
        else:
            if sc is None:
                if scene:
                    sys.setrecursionlimit(100000)
                    sc = pickle.load(open(scene, 'rb'))
                else:
                    import build
                    sc = build.Scene()
            d = room_pieces(sc, ri)
            if path:
                pickle.dump(d, open(path, 'wb'), protocol=4)
        room(d, ri, out_dir)


if __name__ == '__main__':
    args = [a for a in sys.argv[2:] if not a.startswith('--')]
    opt = lambda k: next((a.split('=', 1)[1] for a in sys.argv[2:] if a.startswith('--%s=' % k)), None)
    which = tuple('goat' if a == 'goat' else int(a) for a in args) if args else ('goat', 0, 1, 2, 3)
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'process'), which, opt('cache'), opt('scene'))
