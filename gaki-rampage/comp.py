"""Putting a frame together: the 2D layers of a set, laid out for the camera
(a multiplane: each layer slides by its depth), with the 3D monster slotted in
between them by depth, so the mountain hides what is behind it."""
import math

import numpy as np

W, H = 1280, 720
_X2 = {}


def x2(a):
    """Art pixels to screen pixels: 2x, nearest (kept crisp)."""
    key = id(a)
    if key not in _X2:
        _X2[key] = (np.repeat(np.repeat(a, 2, 0), 2, 1), a)
    return _X2[key][0]


def offset(s, lay, cx, ty):
    aw = lay['frames'][0].shape[1]
    x0 = W / 2 - aw - cx * s['f'] / lay['Z'] + 2 * lay.get('x', 0)
    y0 = ty + 2 * lay.get('y', 0)
    return int(round(x0)), int(round(y0))


def over(img, rgba, x0, y0, alpha=1.0, mask=None):
    """Alpha-blend an RGBA (RGB order, uint8) image onto img (BGR float) at x0, y0."""
    h, w = rgba.shape[:2]
    X0, Y0 = max(0, x0), max(0, y0)
    X1, Y1 = min(W, x0 + w), min(H, y0 + h)
    if X1 <= X0 or Y1 <= Y0:
        return
    src = rgba[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
    a = src[..., 3:4].astype(np.float32) / 255.0 * alpha
    if mask is not None:
        a = a * mask[Y0:Y1, X0:X1, None]
    dst = img[Y0:Y1, X0:X1]
    dst[:] = dst * (1 - a) + src[..., 2::-1].astype(np.float32) * a


def frame_of(lay, T):
    fr = lay['frames']
    return fr[int(T * lay.get('fps', 8)) % len(fr)]


def composite(s, cx, ty, T, monster=None, wings=None, hide=(), extra=None):
    """The set at camera pan cx (metres) and tilt ty (screen px). monster:
    (bgr float, alpha 0..1, depth) drawn between the layers by depth; wings the
    same, see-through. extra: {layer name: fn(img)} drawn right after a layer."""
    img = np.zeros((H, W, 3), np.float32)
    layers = [l for l in s['layers'] if l['name'] not in hide]
    Zs = [l['Z'] for l in layers]
    prev = 1e12
    for lay, Z in zip(layers, Zs):
        if monster is not None:                                     # the parts of it behind this layer
            m = monster[1] * ((monster[2] > Z) & (monster[2] <= prev))
            if m.any():
                img = img * (1 - m[..., None]) + monster[0] * m[..., None]
            if wings is not None:
                m = wings[1] * ((wings[2] > Z) & (wings[2] <= prev))
                if m.any():
                    img = img * (1 - m[..., None]) + wings[0] * m[..., None]
        x0, y0 = offset(s, lay, cx, ty)
        over(img, x2(frame_of(lay, T)), x0, y0)
        if extra and lay['name'] in extra:
            extra[lay['name']](img)
        prev = Z
    if monster is not None:
        m = monster[1] * (monster[2] <= prev)
        img = img * (1 - m[..., None]) + monster[0] * m[..., None]
        if wings is not None:
            m = wings[1] * (wings[2] <= prev)
            img = img * (1 - m[..., None]) + wings[0] * m[..., None]
    return img


def to_screen(s, cx, ty, X, Y, Z):
    """World point -> screen, for this set and camera."""
    f = s['f']
    return W / 2 + (X - cx) * f / Z, 2 * s['y_h'] + ty + (s['cy'] - Y) * f / Z


def to_world(s, cx, ty, sx, sy, Z):
    f = s['f']
    return cx + (sx - W / 2) * Z / f, s['cy'] - (sy - 2 * s['y_h'] - ty) * Z / f
