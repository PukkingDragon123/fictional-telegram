"""Baked shadows so nothing floats: a soft contact shadow under anything that
stands on a surface, and a drop shadow on the wall behind things that hang
or are pinned. Shadows are semi-transparent (they work wherever a prop is
dragged to); everything else stays solid palette pixels."""
import math
import numpy as np
from pixel import Canvas

SHADOW = (24, 12, 22)


def contact(cv, strength=1.0):
    """Returns (canvas, pad_left). Ellipse under the object's footprint."""
    a = cv.a[:, :, 3] > 0
    rows = np.nonzero(a.any(axis=1))[0]
    if len(rows) == 0:
        return cv, 0
    rb = rows[-1]
    foot = a[max(0, rb - 2):rb + 1].any(axis=0)
    xs = np.nonzero(foot)[0]
    x0, x1 = xs[0], xs[-1]
    cx = (x0 + x1) / 2 + 0.5
    rx = (x1 - x0) / 2 + 2.5
    ry = max(1.6, min(5.0, rx * 0.17))
    pad_l = max(0, int(math.ceil(rx - cx)) + 1)
    pad_r = max(0, int(math.ceil(cx + rx - cv.w)) + 1)
    pad_b = int(math.ceil(ry)) + 1
    out = Canvas(cv.w + pad_l + pad_r, cv.h + pad_b)
    ccx, ccy = cx + pad_l, rb + 0.5
    for y in range(int(ccy - ry) - 1, int(ccy + ry) + 2):
        for x in range(int(ccx - rx) - 1, int(ccx + rx) + 2):
            if not (0 <= x < out.w and 0 <= y < out.h):
                continue
            d = ((x + 0.5 - ccx) / rx) ** 2 + ((y + 0.5 - ccy) / ry) ** 2
            if d <= 1:
                al = 125 if d < 0.45 else (85 if d < 0.8 else 50)
                out.a[y, x] = (*SHADOW, int(al * strength))
    out.blit(cv, pad_l, 0)
    return out, pad_l


def drop(cv, dx=3, dy=3, alpha=62):
    """Silhouette offset onto the wall behind (light comes from upper left)."""
    out = Canvas(cv.w + dx, cv.h + dy)
    m = cv.a[:, :, 3] > 0
    sub = out.a[dy:dy + cv.h, dx:dx + cv.w]
    sub[m] = (*SHADOW, alpha)
    out.blit(cv, 0, 0)
    return out


def apply(prop, frames, surfaces):
    """Pick and apply the right shadow for a registered prop. Returns
    (frames, dx) where dx shifts the prop's scene x (left padding)."""
    kind = prop.get('shadow', 'auto')
    layer = prop['layer']
    if kind == 'auto':
        if layer in ('counter', 'floor'):
            kind = 'contact'
        elif layer == 'wall':
            bottom = prop['y'] + frames[0].h - 2
            kind = 'contact' if any(abs(bottom - s) <= 5 for s in surfaces) else 'drop'
        elif layer == 'ceiling':
            kind = 'drop_far'
        else:
            kind = 'none'
    if kind == 'none':
        return frames, 0
    if kind == 'contact':
        res = [contact(f) for f in frames]
        return [r[0] for r in res], res[0][1]
    if kind == 'drop_far':
        return [drop(f, 5, 6, 48) for f in frames], 0
    return [drop(f) for f in frames], 0
