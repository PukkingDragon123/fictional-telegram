"""How it was drawn: a speedpaint of each piece, the way a pixel artist paints it
by hand, and the layered file.

    python3 teahouse-assets/generator/artist_process.py OUT_DIR [goat gecko 0 1 2 3] [--cache=DIR]

For the goat-dragon, the black axolotl-frog ("the gecko") and each room this
writes
  - <name>_speedpaint.mp4: the canvas only, like a Procreate timelapse export,
    one frame per stroke or dab
  - <name>_layers.psd: the working layers (opens in Procreate, Photoshop,
    Krita...); the sketches are kept but hidden. The file flattens to the
    finished art.
  - <name>_final.png

How it is painted - by hand, the plain way:
  1 a loose sketch: perspective lines, the box of the room, the shape of each
    thing (for the gecko, its spine and the rings of its body in each view)
  2 line art: dark outlines put down a run of pixels at a time
  3 flat colour: each shape bucket-filled with its main colour
  4 the big shadow and light shapes blocked in
  5 then worked up a small area at a time: in each, the colours laid in from
    dark to light, a cluster of pixels per dab - so the detail grows across
    the picture the way it does under a pencil tool
  6 the light, with a soft brush

Every mark is one colour. The mistakes stay in: a sketch drawn in the wrong spot
and dragged across, an idea sketched and rubbed out, a wall started in the
wrong colour and adjusted, a piece painted and deleted, now and then a dab in
the wrong colour picked and then corrected, and the canvas flipped to check.

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


def rgb(c):
    return np.array(PAL[c] if isinstance(c, str) else c[:3], np.float32)


def _lum(c):
    return c[..., 0] * 0.3 + c[..., 1] * 0.59 + c[..., 2] * 0.11


# ---------------------------------------------------------------- the document
class Doc:
    _uid = 0

    def __init__(self, w, h, paper):
        self.w, self.h = w, h
        self.layers = []
        self.flip = False
        self._prefix = []
        p = self.add('Paper')
        p['a'][..., :3] = rgb(paper)
        p['a'][..., 3] = 255

    def add(self, name, below=None, above=None, opacity=1.0):
        Doc._uid += 1
        L = dict(name=name, a=np.zeros((self.h, self.w, 4), np.uint8), opacity=opacity, visible=True,
                 keep_hidden=False, ver=0, uid=Doc._uid)
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
                out = out * (1 - al) + L['a'][..., :3].astype(np.float32) * al
            new.append((sig, out))
        self._prefix = new
        img = np.clip(out + 0.5, 0, 255).astype(np.uint8)
        return img[:, ::-1] if self.flip else img


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


# ---------------------------------------------------------------- the recording
class Timelapse:
    """Canvas only, one frame per stroke (or per few strokes), like Procreate's export."""

    def __init__(self, doc, scale, path):
        self.doc, self.s, self.path = doc, scale, path
        self.W, self.H = doc.w * scale, doc.h * scale
        self.proc = subprocess.Popen(
            ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (self.W, self.H),
             '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-tune', 'animation',
             '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path], stdin=subprocess.PIPE)
        self.n = 0
        self.pending = 0
        self.every = 1

    def shot(self, hold=1):
        img = self.doc.composite()
        data = np.repeat(np.repeat(img, self.s, 0), self.s, 1).tobytes()
        for _ in range(hold):
            self.proc.stdin.write(data)
            self.n += 1
        self.pending = 0

    def tick(self, every=None):
        self.pending += 1
        if self.pending >= (every or self.every):
            self.shot()

    def close(self):
        if self.pending:
            self.shot()
        self.proc.stdin.close()
        self.proc.wait()
        return self.n


def save_psd(doc, path, scale):
    from psd_tools import PSDImage
    from psd_tools.api.layers import PixelLayer
    W, H = doc.w * scale, doc.h * scale
    psd = PSDImage.new('RGBA', (W, H))
    for L in doc.layers:
        im = Image.fromarray(L['a']).resize((W, H), Image.NEAREST)
        lay_ = PixelLayer.frompil(im, psd, L['name'], 0, 0)
        lay_.opacity = int(round(255 * L['opacity']))
        lay_.visible = bool(L['visible']) and not L['keep_hidden']
        psd.append(lay_)
    psd.save(path)


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

    def soft(self, L, region, size, angle, src, frames=12):
        """A soft brush: a few broad passes building the light up."""
        if not region.any():
            return
        paths = scribble_paths(region, size, angle, self.hand.r, max_len=140, rows=(2, 4), spacing=0.7)
        every = max(1, int(math.ceil(len(paths) / max(1, frames))))
        for pts in paths:
            self.stroke(L, pts, src=src, size=size, wob=1.0, clip=region, every=every, taper=0.1)
        reveal(L, src, region)
        Doc.touch(L)
        self.tl.shot()

    def fill(self, L, region, color=None, src=None, hold=2):
        """Bucket fill or lasso fill: one go."""
        if src is not None:
            reveal(L, src, region)
        else:
            lay(L, region, color)
        Doc.touch(L)
        self.tl.shot(hold)

    def adjust(self, L, region, target, steps=10, hold_end=4):
        """Hue/saturation/brightness: the slider dragged until the colour sits right."""
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

    def lines(self, L, src, mask, run=16, frames=None, start=None):
        """Pixel line art put down one run at a time, the pen moving on from where
        it lifted."""
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
        h, w = self.shape
        for r_ in runs:
            m = np.zeros((h, w), bool)
            arr = np.array(r_)
            m[arr[:, 1], arr[:, 0]] = True
            reveal(L, src, m)
            Doc.touch(L)
            self.tl.tick(every)

    def paint(self, L, img, mask, frames, tile=24, base=True, shapes=True, slips=0.025, base_src=None):
        """Paint a shape the way a pixel artist does, ending exactly on img (RGBA):
        bucket-fill its main colour, block in the big one-colour shapes (the main
        shadows and lights), then work it up a small area at a time - in each, the
        colours laid in from dark to light, one cluster of pixels per dab. Now and
        then a dab goes down in the wrong colour and is picked again."""
        from scipy import ndimage
        m = mask & (img[..., 3] > 0)
        if not m.any():
            return
        tl = self.tl
        a = L['a']
        code = (img[..., 0].astype(np.int64) << 16) | (img[..., 1].astype(np.int64) << 8) | img[..., 2]
        todo = lambda: m & (a != img).any(-1)
        if base:                                                  # 1 the flat colour, bucket-filled
            left = todo()
            if left.any():
                vals, counts = np.unique(code[left], return_counts=True)
                bc = int(vals[counts.argmax()])
                flat = img.copy()
                flat[left, 0], flat[left, 1], flat[left, 2] = bc >> 16, (bc >> 8) & 255, bc & 255
                if base_src is not None:                          # a first colour, adjusted after
                    self.fill(L, left, src=base_src, hold=8)
                    self.adjust(L, left, flat, steps=10, hold_end=4)
                else:
                    self.fill(L, left, src=flat, hold=3)
        left = todo()
        if not left.any():
            return
        n_px = int(left.sum())
        groups = []
        if shapes:                                                # 2 the big shapes
            big_min = max(18, int(0.012 * m.sum()))
            for c in np.unique(code[left]):
                mc = left & (code == c)
                lab, n = ndimage.label(mc, np.ones((3, 3), int))
                if not n:
                    continue
                sizes = ndimage.sum(mc, lab, range(1, n + 1))
                objs = ndimage.find_objects(lab)
                for i in np.nonzero(sizes >= big_min)[0]:
                    sl = objs[i]
                    sub = lab[sl] == i + 1
                    ys, xs = np.nonzero(sub)
                    groups.append((float(sizes[i]), ys + sl[0].start, xs + sl[1].start))
            groups.sort(key=lambda g: -g[0])
            n_shape = sum(g[0] for g in groups)
            f_shape = max(1, int(frames * min(0.35, 0.15 + n_shape / max(1, n_px) * 0.4)))
            every = max(1, int(math.ceil(len(groups) / f_shape)))
            for k, (_, ys, xs) in enumerate(groups):
                a[ys, xs] = img[ys, xs]
                Doc.touch(L)
                tl.tick(every)
            tl.shot(2)
            frames = max(1, frames - f_shape)
        left = todo()
        if not left.any():
            return
        # 3 worked up area by area: tiles in a wandering order, in each the colours dark to light
        ys, xs = np.nonzero(left)
        tkey = (ys // tile) * 100000 + xs // tile
        keys = np.unique(tkey)
        centres = {int(k): ((k % 100000) * tile + tile / 2, (k // 100000) * tile + tile / 2) for k in keys}
        rng = self.rng
        order, rest = [], set(int(k) for k in keys)
        cur = min(rest, key=lambda k: centres[k][0] * 0.4 + centres[k][1])
        while rest:
            rest.discard(cur)
            order.append(cur)
            if not rest:
                break
            near = sorted(rest, key=lambda k: math.hypot(centres[k][0] - centres[cur][0],
                                                         centres[k][1] - centres[cur][1]))[:3]
            cur = near[0] if rng.random() < 0.7 else rng.choice(near)
        lum = _lum(img[..., :3].astype(np.float32))
        dabs = []
        sort_idx = np.argsort(tkey, kind='stable')
        tk_sorted = tkey[sort_idx]
        for k in order:
            lo, hi = np.searchsorted(tk_sorted, k), np.searchsorted(tk_sorted, k, 'right')
            idx = sort_idx[lo:hi]
            ty, tx = ys[idx], xs[idx]
            cc = code[ty, tx]
            for c in sorted(np.unique(cc), key=lambda c: lum[ty[cc == c][0], tx[cc == c][0]]):
                sel = cc == c
                dabs.append((ty[sel], tx[sel]))
        every = max(1, int(math.ceil(len(dabs) / max(1, frames))))
        for (dy, dx) in dabs:
            if slips and rng.random() < slips / every:            # the wrong colour picked, then picked again
                wrong = img[dy, dx].astype(int)
                wrong[:, :3] = np.clip(wrong[:, :3] + rng.choice((-1, 1)) * rng.randint(28, 48), 0, 255)
                a[dy, dx] = wrong
                Doc.touch(L)
                tl.shot(3)
            a[dy, dx] = img[dy, dx]
            Doc.touch(L)
            tl.tick(every)
        reveal(L, img, m)
        Doc.touch(L)
        tl.shot()


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


def outline_of(img, m, dark=95):
    """The dark pixels round the edge of a shape: its line art."""
    lum = _lum(img[..., :3].astype(np.float32))
    edge = m & ~(shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1) & shift(m, 0, -1))
    return edge & (lum < dark)


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

    flats, render, tex = P['flats'].a, P['render'].a, P['texture'].a
    final = fin_cv.a.copy()
    paper = PAL['paper4']
    solid = flats[..., 3] > 0

    doc = Doc(w, h, paper)
    tl = Timelapse(doc, 6, os.path.join(out_dir, 'goat_dragon_speedpaint.mp4'))
    pn = Painter(doc, tl, 11)
    tl.shot(12)

    # 1 a first rough with the head held flat - faded down, then hidden
    R1 = doc.add('Rough 1')
    blue = (96, 140, 210)
    for c in old['g']:
        pn.curve(R1, c, seg=(30, 60), wob=1.3, over=6, color=blue, alpha=0.8)
    pn.curve(R1, old['cr'], closed=True, seg=(20, 40), wob=1.0, over=4, color=blue, alpha=0.8)
    for c in old['cl'][:3]:
        pn.curve(R1, c, seg=(20, 50), wob=0.6, over=5, color=blue, alpha=0.7)
    tl.shot(8)
    pn.flip(10)
    pn.fade(R1, 0.3)

    # 2 the second rough, at the real angle; a horn swept too tall, rubbed out, drawn again
    R2 = doc.add('Rough 2')
    for k, c in enumerate(now['g']):
        if k == 3:
            bad = [(58, 64), (60, 34), (82, 24), (101, 36)]
            m = pn.curve(R2, bad, seg=(40, 70), wob=1.2, over=5, color=blue, alpha=0.8)
            tl.shot(6)
            for piece in split_curve(resample(catmull(bad), 0.5), pn.rng, (14, 22)):
                pn.stroke(R2, piece[::3], size=3, erase=True, clip=grow(m, 1), wob=0.6)
            tl.shot(3)
        pn.curve(R2, c, seg=(30, 60), wob=1.3, over=6, color=blue, alpha=0.8)
    pn.curve(R2, now['cr'], closed=True, seg=(18, 40), wob=1.0, over=4, color=blue, alpha=0.8)
    for c in now['cl']:
        pn.curve(R2, c, seg=(20, 50), wob=0.6, over=5, color=blue, alpha=0.7)
    pn.hide(R1)
    pn.fade(R2, 0.4)

    # 3 the sketch: parts gone over, an eye too big, the jaw drawn low and moved after a flip
    S = doc.add('Sketch')
    ink = (70, 60, 72)
    jaw_mask = np.zeros((h, w), bool)
    for key in ('head', 'brow', 'muzzle', 'jaw', 'cheek', 'socket', 'eye', 'nostril', 'beard', 'ear_in', 'neck', 'spike'):
        pts = a['pts'][key]
        if key == 'eye':
            cx, cy = np.mean(pts, axis=0)
            big = [(cx + (x - cx) * 1.9, cy + (y - cy) * 1.7) for x, y in pts]
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
    tl.shot(6)
    pn.flip(18)                                                     # the jaw hangs too low: lasso it, nudge it up
    pn.move(S, grow(jaw_mask, 0) & (S['a'][..., 3] > 0), 0, -3, steps=5)
    tl.shot(4)
    pn.hide(R2)
    pn.fade(S, 0.3)

    # 4 pixel line art: one run at a time, a run put down wrong and redone, doubled pixels cleaned up after
    Ln = doc.add('Lines')
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
        m = np.zeros((h, w), bool)
        arr = np.array(run)
        m[arr[:, 1], arr[:, 0]] = True
        if k == len(runs) // 3:
            wrong = shift(m, 1, 1)
            lay(Ln, wrong, linec)
            Doc.touch(Ln)
            tl.shot(6)
            rub(Ln, wrong & ~(Ln['a'][..., 3] > 0) | (wrong & ~m))
            Doc.touch(Ln)
            tl.shot(3)
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
    tl.shot(8)
    pn.flip(10)
    for (y, x) in zip(*np.nonzero(extras)):                          # pixel cleanup
        mm = np.zeros((h, w), bool)
        mm[y, x] = True
        rub(Ln, mm)
        Doc.touch(Ln)
        tl.tick(2)
    stray = P['ink'] & (final[..., 3] == 0)
    rub(Ln, stray)
    Doc.touch(Ln)
    tl.shot(6)

    # 5 flats under the lines: bucket fills; the fur first tried brown, then slid to white
    Fl = doc.add('Flats', below=Ln)
    fur = solid & (a['head'] | a['neck'] | a['jaw'] | a['brow'] | a['cheek'])
    brown = np.zeros_like(flats)
    brown[..., :3] = rgb('wood2')
    brown[..., 3] = 255
    pn.fill(Fl, fur, src=brown, hold=6)
    pn.adjust(Fl, fur, flats, steps=14, hold_end=6)
    for key in ('horn_near', 'horn_far', 'spike', 'beard', 'muzzle', 'mane', 'eye', 'socket', 'plates', 'belly',
                'frills', 'spurs', 'mouth', 'nostril', 'ear_in', 'throat'):
        if key in a:
            m = solid & a[key] & ~(Fl['a'][..., 3] > 0)
            if m.sum() > 2:
                pn.fill(Fl, m, src=flats, hold=2)
    rest = solid & ~(Fl['a'][..., 3] > 0)
    if rest.any():
        pn.fill(Fl, rest, src=flats, hold=2)
    pn.hide(S)

    # 6 the shading, part by part, colour by colour; highlights last
    Sh = doc.add('Shading', below=Ln)
    diff = lambda x, y: (x[..., 3] > 0) & (np.abs(x[..., :3].astype(int) - y[..., :3].astype(int)).sum(-1) > 0)
    shade = diff(render, flats)
    done = np.zeros((h, w), bool)
    for key in ('head', 'neck', 'jaw', 'horn_near', 'horn_far', 'beard', 'muzzle', 'brow', 'cheek'):
        if key in a:
            m = shade & a[key] & ~done
            if m.sum() > 6:
                pn.paint(Sh, render, m, frames=max(8, int(m.sum() / 22)), tile=10, base=False)
                done |= m
    m = shade & ~done
    if m.any():
        pn.paint(Sh, render, m, frames=max(8, int(m.sum() / 22)), tile=10, base=False)
    tl.shot(6)

    # 7 fur and scales, close in
    T = doc.add('Fur & scales', below=Ln)
    texm = diff(tex, render) | ((tex[..., 3] > 0) & (render[..., 3] == 0))
    pn.paint(T, tex, texm, frames=max(30, int(texm.sum() / 14)), tile=8, base=False, shapes=False)
    tl.shot(6)

    # 8 the lines coloured into the form, then the eye and the last details
    lc = Ln['a'][..., 3] > 0
    pn.paint(Ln, final, lc, frames=max(12, int(lc.sum() / 20)), tile=12, base=False, shapes=False, slips=0)
    D = doc.add('Details')
    cur = doc.composite()
    want = final[..., 3] > 0
    det = want & (np.abs(cur.astype(int) - final[..., :3].astype(int)).sum(-1) > 0)
    pn.paint(D, final, det, frames=max(20, int(det.sum() / 10)), tile=8, base=False, shapes=False)
    gone = (final[..., 3] == 0)
    for L in doc.layers[1:]:
        if L['visible']:
            rub(L, gone)
            Doc.touch(L)
    tl.shot(4)
    pn.flip(16)
    tl.shot(int(FPS * 2.5))
    n = tl.close()
    save_psd(doc, os.path.join(out_dir, 'goat_dragon_layers.psd'), 4)
    comp = doc.composite()
    Image.fromarray(comp).resize((w * 4, h * 4), Image.NEAREST).save(os.path.join(out_dir, 'goat_dragon_final.png'))
    ref = np.where(final[..., 3:4] > 0, final[..., :3], np.array(paper, np.uint8))
    print('goat-dragon: %d frames (%.1f s), matches model: %s' % (n, n / FPS, bool((comp == ref).all())))


# ---------------------------------------------------------------- the gecko
GECKO_W, GECKO_H = 240, 135
VIEWS = (('side', 0.0, 6, (10, 18)), ('three quarter', -0.6, 6, (128, 8)), ('front', -math.pi / 2, 30, (40, 62)),
         ('back', math.pi / 2, 30, (160, 62)))


def gecko_views():
    """The black axolotl-frog from four sides, for a model sheet: side on, three
    quarters, coming at you and going away, all lit the same, plus the points of
    its spine in each view (for the construction sketch)."""
    import axolotl as A
    keep = (A.W, A.H, A.BASE_Y, A._dim, A._path)
    A.W, A.H, A.BASE_Y = 240, 140, 120
    A._dim = lambda Z: 1.0
    plen = 2 * math.pi * math.sqrt((A.RX ** 2 + A.RZ ** 2) / 2)
    out = []
    try:
        for name, hd, f, (ox, oy) in VIEWS:
            dx, dz = math.cos(hd), math.sin(hd)

            def path(u, f=f, dx=dx, dz=dz, hd=hd):
                uu = ((u - f / A.N + 0.5) % 1.0) - 0.5
                return 120 + dx * uu * plen, 40 + dz * uu * plen, hd
            A._path = path
            cv = A.frame(f)
            ys, xs = np.nonzero(cv.a[..., 3])
            crop = cv.a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            spine = []
            length = 64.0 * A.SC
            for k in range(12):
                s = k / 11
                x, z, _ = path((f / A.N - s * length / plen) % 1.0)
                px, py, _ = A._proj(x, A._radius(s) * 0.8 + 0.6, z)
                spine.append((px - xs.min() + ox, py - ys.min() + oy, A._radius(s)))
            out.append((name, crop, (ox, oy), spine))
    finally:
        A.W, A.H, A.BASE_Y, A._dim, A._path = keep
    return out


def gecko(out_dir):
    views = gecko_views()
    w, h = GECKO_W, GECKO_H
    final = np.zeros((h, w, 4), np.uint8)
    for name, crop, (ox, oy), _ in views:
        ch, cw = crop.shape[:2]
        m = crop[..., 3] > 0
        final[oy:oy + ch, ox:ox + cw][m] = crop[m]
    paper = PAL['paper4']
    doc = Doc(w, h, paper)
    tl = Timelapse(doc, 8, os.path.join(out_dir, 'gecko_speedpaint.mp4'))
    pn = Painter(doc, tl, 21)
    tl.shot(12)
    solid = final[..., 3] > 0
    blue, ink = (96, 140, 210), (70, 60, 72)

    # 1 construction: the line of the spine in each view and rings round the body, like a 3D model's sections
    C = doc.add('Construction')
    for name, crop, (ox, oy), spine in views:
        pts = [(x, y) for x, y, _ in spine]
        pn.curve(C, pts, seg=(20, 50), wob=0.9, over=3, color=blue, alpha=0.8)
        for (x, y, r) in spine[1:-2:2]:
            ring = [(x + math.cos(t) * r * 1.05, y + math.sin(t) * r * 0.6) for t in np.linspace(0, 2 * math.pi, 9)[:-1]]
            pn.curve(C, ring, closed=True, seg=(14, 30), wob=0.5, over=1.5, color=blue, alpha=0.7)
        tl.shot(4)
    tl.shot(8)
    pn.fade(C, 0.35)

    # 2 the sketch of each view, the head and the gills first; one view drawn too big and redone
    S = doc.add('Sketch')
    for i, (name, crop, (ox, oy), spine) in enumerate(views):
        m = np.zeros((h, w), bool)
        ch, cw = crop.shape[:2]
        m[oy:oy + ch, ox:ox + cw] = crop[..., 3] > 0
        paths = silhouette_paths(m, eps=1.2, down=1, minlen=3)
        ys, xs = np.nonzero(m)
        if i == 2:                                                  # the head-on view, first too big
            snap = pn.snapshot(S)
            for p in distort(paths, pn.rng, (xs.mean(), ys.mean()), scale=0.0, rot=0, off=0):
                q = (np.asarray(p) - (xs.mean(), ys.mean())) * 1.25 + (xs.mean(), ys.mean())
                pn.curve(S, q, seg=(10, 24), wob=0.6, over=1.5, color=ink, alpha=0.85)
            tl.shot(10)
            pn.undo(S, snap, 4)
        for p in distort(paths, pn.rng, (xs.mean(), ys.mean()), scale=0.02, rot=1.0, off=0.6):
            pn.curve(S, p, seg=(10, 24), wob=0.6, over=1.5, color=ink, alpha=0.85)
        tl.shot(4)
    pn.flip(12)
    pn.hide(C)
    pn.fade(S, 0.3)

    # 3 line art, then the flat black of the skin, the gills, the eyes
    Ln = doc.add('Lines')
    pn.lines(Ln, final, outline_of(final, solid, dark=60), run=10, frames=60)
    tl.shot(6)
    Fl = doc.add('Flats', below=Ln)
    lum = _lum(final[..., :3].astype(np.float32))
    pink = solid & (final[..., 0].astype(int) > final[..., 1].astype(int) + 30)
    gold = solid & (final[..., 0].astype(int) > 150) & (final[..., 2].astype(int) < 120)
    skin = solid & ~pink & ~gold
    flat = final.copy()
    flat[skin, :3] = PAL['gloss1']
    flat[pink, :3] = PAL['purp1']
    flat[gold, :3] = PAL['gold2']
    for name, crop, (ox, oy), _ in views:
        box = np.zeros((h, w), bool)
        box[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = True
        pn.fill(Fl, skin & box & ~(Ln['a'][..., 3] > 0), src=flat, hold=3)
    pn.fill(Fl, pink & ~(Ln['a'][..., 3] > 0), src=flat, hold=3)
    pn.fill(Fl, gold & ~(Ln['a'][..., 3] > 0), src=flat, hold=3)
    pn.hide(S)

    # 4 the wet black skin rendered view by view, dark to light; the gills; the eyes and the shine last
    Sh = doc.add('Shading', below=Ln)
    shine = solid & (lum > 160)
    body = solid & ~pink & ~gold & ~shine & ~(Ln['a'][..., 3] > 0)
    for name, crop, (ox, oy), _ in views:
        box = np.zeros((h, w), bool)
        box[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = True
        m = body & box
        pn.paint(Sh, final, m, frames=max(16, int(m.sum() / 9)), tile=8, base=False)
        tl.shot(4)
    G = doc.add('Gills & eyes', below=Ln)
    pn.paint(G, final, pink, frames=max(14, int(pink.sum() / 3)), tile=6, base=False, shapes=False)
    pn.paint(G, final, gold, frames=max(10, int(gold.sum() / 2)), tile=6, base=False, shapes=False, slips=0)
    Hi = doc.add('Shine')
    pn.paint(Hi, final, shine, frames=max(8, int(shine.sum() / 2)), tile=8, base=False, shapes=False, slips=0)
    rest = solid & (np.abs(doc.composite().astype(int) - final[..., :3].astype(int)).sum(-1) > 0)
    pn.paint(Hi, final, rest, frames=max(6, int(rest.sum() / 6)), tile=8, base=False, shapes=False, slips=0)
    tl.shot(4)
    pn.flip(14)
    tl.shot(int(FPS * 2.5))
    n = tl.close()
    save_psd(doc, os.path.join(out_dir, 'gecko_layers.psd'), 4)
    comp = doc.composite()
    Image.fromarray(comp).resize((w * 4, h * 4), Image.NEAREST).save(os.path.join(out_dir, 'gecko_final.png'))
    ref = np.where(final[..., 3:4] > 0, final[..., :3], np.array(paper, np.uint8))
    print('gecko: %d frames (%.1f s), matches model: %s' % (n, n / FPS, bool((comp == ref).all())))


# ---------------------------------------------------------------- a room
NAMES = {0: 'room1_cook_room', 1: 'room2_seating_room', 2: 'room3_counter_room', 3: 'room4_bedroom'}


def room_pieces(sc, ri):
    """The finished room taken apart: the view outside, walls, each prop, posts, light."""
    import build
    import layout as LY
    import propkit
    sc.use_season(None)
    cam = ri * LY.SW
    w = LY.SW
    crop = lambda cv: cv.a[:, cam:cam + w].copy()
    blank = lambda: Canvas(LY.W, LY.H)
    view = blank()
    for name, frames, fac, *off in sc.outs:
        if name.startswith(('04_', '08_')):                     # birds, fish and drift are animation only
            continue
        origin = int(round(cam * (1 - fac)))
        ox, oy = off[0] if off else (0, 0)
        x = origin % 1280 - 1280
        while x < LY.W:
            view.blit(frames[0], x + ox, oy)
            x += 1280
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
    return dict(view=crop(view), shell=crop(sc.shell), props=props, extra=extra, fg=crop(sc.fg[0]),
                light=crop(sc.light[0]) if isinstance(sc.light, list) else crop(sc.light),
                final=sc.view(0, cam, light=True).a.copy())


def room(d, ri, out_dir):
    import layout as LY
    w, h = LY.SW, LY.SH
    rng = random.Random(200 + ri)
    name = NAMES[ri]
    final = d['final']
    shell = d['shell']
    paper = (244, 240, 230)
    doc = Doc(w, h, paper)
    tl = Timelapse(doc, 3, os.path.join(out_dir, name + '_speedpaint.mp4'))
    pn = Painter(doc, tl, 300 + ri)
    tl.shot(12)
    VX, VY = w / 2.0, LY.EYE_Y
    BX0, BX1, TOP, FL = LY.BX, w - LY.BX, LY.WALL_TOP, LY.FLOOR
    corners = [(BX0, TOP), (BX1, TOP), (BX0, FL), (BX1, FL)]
    yy, xx = np.mgrid[0:h, 0:w]

    def to_edge(px, py):
        dx, dy = px - VX, py - VY
        t = min([v for v in ((-VX / dx) if dx < 0 else ((w - 1 - VX) / dx) if dx > 0 else 1e9,
                             (-VY / dy) if dy < 0 else ((h - 1 - VY) / dy) if dy > 0 else 1e9) if v > 0])
        return (VX + dx * t, VY + dy * t)

    # 1 perspective: horizon and rays from the vanishing point; one ray undone
    Pg = doc.add('Perspective')
    blue = (110, 150, 215)
    pn.stroke(Pg, [(0, VY), (w - 1, VY)], color=blue, alpha=0.7, wob=0.25)
    for k, (px, py) in enumerate(corners + [(VX - 150, 0), (VX + 150, 0), (VX - 200, h - 1), (VX + 200, h - 1)]):
        if k == 2:
            snap = pn.snapshot(Pg)
            pn.stroke(Pg, [(VX, VY), to_edge(px + 60, py + 20)], color=blue, alpha=0.7, wob=0.2)
            tl.shot(4)
            pn.undo(Pg, snap, 2)
        pn.stroke(Pg, [(VX, VY), to_edge(px, py)], color=blue, alpha=0.7, wob=0.2)
    tl.shot(4)

    # 2 the sketch: the box of the room, the windows, then every piece - one drawn in the
    #   wrong spot and dragged over, one idea sketched and rubbed out
    R = doc.add('Sketch')
    dk = (72, 58, 66)
    ra = 0.75
    for c in ([(BX0, TOP), (BX1, TOP)], [(BX1, TOP), (BX1, FL)], [(BX1, FL), (BX0, FL)], [(BX0, FL), (BX0, TOP)]):
        pn.curve(R, c, seg=(60, 140), wob=0.8, over=6, color=dk, alpha=ra)
    for c in corners:
        pn.curve(R, [c, to_edge(*c)], seg=(50, 120), wob=0.7, over=4, color=dk, alpha=ra)
    for yl in (LY.RAIL[0], LY.WAINS[1], LY.CEIL_Y):
        pn.curve(R, [(BX0 - 2, yl), (BX1 + 2, yl)], seg=(70, 160), wob=0.8, over=5, color=dk, alpha=ra * 0.8)
    holes = (shell[..., 3] < 255)
    for c in silhouette_paths(grow(holes, 3), eps=2.0, down=3, minlen=5):
        pn.curve(R, c, seg=(20, 50), passes=2, wob=0.9, over=3, color=dk, alpha=ra, every=2)
    props = [(nm, img, kind) for nm, img, kind in d['props'] if (img[..., 3] > 0).sum() > 30]
    moved_i = None
    for i, (nm, img, kind) in enumerate(props):
        m = img[..., 3] > 0
        area = m.sum()
        paths = silhouette_paths(m, eps=2.2 if area > 3000 else 1.5, down=2 if area > 600 else 1, minlen=4)
        ys, xs = np.nonzero(m)
        paths = distort(paths, rng, (xs.mean(), ys.mean()), scale=0.03, rot=1.5, off=1.5)
        every = 2 if area > 2000 else 1
        if moved_i is None and 1500 < area < 20000 and i > 0:
            moved_i = i
            dx = 46 if xs.mean() < w / 2 else -46
            tmp = doc.add('Sketch (copy)')
            for pth in paths:
                pn.curve(tmp, np.asarray(pth) - (dx, 0), seg=(16, 40), wob=0.8, over=3, color=dk, alpha=ra, every=every)
            tl.shot(6)
            pn.move(tmp, tmp['a'][..., 3] > 0, dx, 0, steps=7)
            tl.shot(3)
            mm = tmp['a'][..., 3] > 0
            R['a'][mm] = tmp['a'][mm]
            doc.remove(tmp)
            Doc.touch(R)
            continue
        for pth in paths:
            pn.curve(R, pth, seg=(16, 40), wob=0.8, over=3, color=dk, alpha=ra, every=every)
        if i == len(props) // 2:                                    # an idea tried and rubbed out
            ex, ey = rng.randint(120, w - 200), rng.randint(90, 160)
            snap_m = np.zeros((h, w), bool)
            for c in ([(ex, ey), (ex + 70, ey + 2)], [(ex + 70, ey + 2), (ex + 68, ey + 46)],
                      [(ex + 68, ey + 46), (ex - 1, ey + 44)], [(ex - 1, ey + 44), (ex, ey)],
                      [(ex + 6, ey + 14), (ex + 62, ey + 15)], [(ex + 30, ey + 2), (ex + 32, ey + 44)]):
                snap_m |= pn.curve(R, c, seg=(30, 80), wob=0.8, over=4, color=dk, alpha=ra)
            tl.shot(10)
            region = grow(snap_m, 2)
            for k in range(4):
                pn.stroke(R, [(ex - 6 + k * 22, ey - 4), (ex + 4 + k * 22, ey + 50)], size=8, erase=True, clip=region)
            rub(R, region)
            Doc.touch(R)
            tl.shot(3)
    tl.shot(8)
    pn.fade(Pg, 0.3)
    pn.flip(14)
    pn.fade(R, 0.45)

    # 3 the view through the window first, the furthest thing back
    V = doc.add('Window view', above=doc.layers[0])
    vis = grow(holes, 2)
    if vis.any():
        pn.paint(V, d['view'], vis, frames=max(40, int(math.sqrt(vis.sum()) * 1.1)), tile=20)
        tl.shot(6)

    # 4 the walls, floor and ceiling: each part bucket-filled, its big shapes blocked in, then worked up
    Wl = doc.add('Walls, floor & ceiling', above=V)
    inside = (xx >= BX0) & (xx <= BX1) & (yy >= TOP) & (yy <= FL)
    ang = np.arctan2(yy - VY, xx - VX)
    a_c = [math.atan2(cy - VY, cx - VX) for cx, cy in corners]           # TL, TR, BL, BR
    ceil_ = ~inside & (ang > a_c[0] - 2 * math.pi) & (ang < a_c[1]) & (yy < TOP)
    floor_ = ~inside & (yy > FL) & (ang > a_c[3]) & (ang < a_c[2])
    left_ = ~inside & (xx < BX0) & ~ceil_ & ~floor_
    right_ = ~inside & (xx > BX1) & ~ceil_ & ~floor_
    sh_m = shell[..., 3] > 0
    for k, (nm, m) in enumerate((('back', inside & sh_m), ('ceiling', ceil_ & sh_m), ('floor', floor_ & sh_m),
                                 ('left', left_ & sh_m), ('right', right_ & sh_m))):
        if m.sum() < 50:
            continue
        base_src = None
        if nm == 'back':                                              # first too cold, then slid warmer
            col = np.array(mean_colour(shell, m), float)
            base_src = shell.copy()
            base_src[..., :3] = np.clip(col * np.array([0.7, 0.85, 1.25]) + np.array([0, 0, 30]), 0, 255).astype(np.uint8)
            base_src[..., 3] = 255
        pn.paint(Wl, shell, m, frames=max(40, int(math.sqrt(m.sum()) * 1.6)), tile=32, base_src=base_src)
    reveal(V, d['view'], np.ones((h, w), bool))                     # the view the walls now hide, for the parallax
    Doc.touch(V)
    tl.shot(6)

    # 5 every piece on its own layer: line art, flat, big shapes, then worked up
    deleted = False
    for i, (nm, img, kind) in enumerate(props):
        m = img[..., 3] > 0
        area = int(m.sum())
        L = doc.add(nm, below=R)
        if area > 400:
            ol = outline_of(img, m)
            if ol.sum() > 12:
                pn.lines(L, img, ol, run=12, frames=max(4, int(math.sqrt(ol.sum()))))
        pn.paint(L, img, m, frames=max(10, int(math.sqrt(area) * 1.3)), tile=16 if area > 3000 else 10)
        if i % 4 == 2:
            tl.shot(4)                                               # stepping back to look
        if not deleted and d['extra'] is not None and i > len(props) // 2:
            enm, eimg = d['extra']
            em = eimg[..., 3] > 0
            if em.any():
                Le = doc.add(enm, below=R)
                pn.paint(Le, eimg, em, frames=max(8, int(math.sqrt(em.sum()))), tile=12)
                tl.shot(12)
                Le['visible'] = False
                Doc.touch(Le)
                tl.shot(8)
                doc.remove(Le)
                tl.shot(2)
            deleted = True
        if i == int(len(props) * 0.7):
            pn.flip(12)

    # 6 the posts in front, then the light with a soft brush
    Fg = doc.add('Posts', below=R)
    fm = d['fg'][..., 3] > 0
    if fm.any():
        pn.paint(Fg, d['fg'], fm, frames=max(20, int(math.sqrt(fm.sum()))), tile=16)
    Lt = doc.add('Light', below=R)
    lm = d['light'][..., 3] > 0
    if lm.any():
        pn.soft(Lt, lm, 14, math.radians(20), d['light'], frames=18)
    pn.hide(R, 4)
    pn.hide(Pg, 2)
    tl.shot(6)
    pn.flip(16)
    tl.shot(int(FPS * 2.5))
    n = tl.close()
    save_psd(doc, os.path.join(out_dir, name + '_layers.psd'), 2)
    comp = doc.composite()
    Image.fromarray(comp).resize((w * 2, h * 2), Image.NEAREST).save(os.path.join(out_dir, name + '_final.png'))
    print('%s: %d frames (%.1f s), %d layers, max diff from the room: %d (birds, fish and rain are animation only)' % (
        name, n, n / FPS, len(doc.layers), int(np.abs(comp.astype(int) - final[..., :3]).max())))


def main(out_dir, which=('goat', 'gecko', 0, 1, 2, 3), cache=None):
    os.makedirs(out_dir, exist_ok=True)
    if 'goat' in which:
        goat(out_dir)
    if 'gecko' in which:
        gecko(out_dir)
    rooms = [r for r in which if r not in ('goat', 'gecko')]
    sc = None
    for ri in rooms:
        path = cache and os.path.join(cache, 'room%d_v4.pkl' % ri)
        if path and os.path.exists(path):
            d = pickle.load(open(path, 'rb'))
        else:
            if sc is None:
                import build
                sc = build.Scene()
            d = room_pieces(sc, ri)
            if path:
                pickle.dump(d, open(path, 'wb'), protocol=4)
        room(d, ri, out_dir)


if __name__ == '__main__':
    args = [a for a in sys.argv[2:] if not a.startswith('--')]
    cache = next((a.split('=', 1)[1] for a in sys.argv[2:] if a.startswith('--cache=')), None)
    which = tuple(a if a in ('goat', 'gecko') else int(a) for a in args) if args else ('goat', 'gecko', 0, 1, 2, 3)
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'process'), which, cache)
