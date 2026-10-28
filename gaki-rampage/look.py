"""Lighting for the monster: glossy, iridescent chitin lit by the blood moon
from behind (a hard red rim on every edge), a cold sky fill, an optional warm
point light (the shrine lanterns), glowing eyes, and depth fog."""
import numpy as np

# material: shininess, specular, iridescence, emissive, wrap
MATP = {1: (70, 0.9, 0.6, 0.0, 0.15), 2: (45, 0.7, 0.4, 0.0, 0.15), 3: (25, 0.4, 0.1, 0.0, 0.2),
        4: (140, 1.6, 0.0, 0.32, 0.3), 5: (40, 0.9, 0.0, 0.15, 0.3), 6: (20, 0.4, 0.3, 0.0, 0.5),
        7: (12, 0.25, 0.0, 0.0, 0.35), 8: (110, 1.1, 0.5, 0.0, 0.1), 9: (60, 1.0, 0.0, 1.2, 0.3),
        10: (160, 1.6, 0.0, 0.05, 0.2)}
IRID = (np.array([150, 255, 120], np.float32) / 255, np.array([255, 90, 190], np.float32) / 255)   # BGR green, violet


def _n(a):
    return a / np.maximum(np.linalg.norm(a, axis=-1, keepdims=True), 1e-9)


def rays(cam):
    """World-space view rays for every pixel."""
    W, H = cam.W, cam.H
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.stack([(xx + 0.5 - W / 2 - getattr(cam, 'shift', (0, 0))[0]) / cam.focal,
                  -(yy + 0.5 - H / 2 - getattr(cam, 'shift', (0, 0))[1]) / cam.focal, np.ones_like(xx)], -1)
    return _n(d @ cam.R.astype(np.float32))


def light(cam, depth, ids, nrm, alb, moon=(-0.3, 0.45, 0.85), moon_col=(70, 60, 255), moon_k=1.0,
          fill=(0.2, 0.9, -0.5), fill_col=(120, 60, 40), ambient=0.05, point=None, fog=None, rim_k=1.4):
    """BGR float image (0..255) and alpha mask for the lit monster. point: (pos,
    BGR colour, intensity, range) a warm light; fog: (BGR colour, distance)."""
    m = ids > 0
    out = np.zeros(alb.shape, np.float32)
    if not m.any():
        return out, m
    V = -rays(cam)[m]
    N = _n(nrm[m])
    flip = (N * V).sum(-1) < 0
    N[flip] *= -1
    A = alb[m] / 255.0
    sh, sp, ir, em, wrap = (np.array([MATP.get(int(i), MATP[1])[k] for i in ids[m]], np.float32) for k in range(5))
    NV = np.clip((N * V).sum(-1), 0, 1)
    col = A * ambient * 255 + A * np.array(fill_col, np.float32) * np.clip(N @ _n(np.array(fill, np.float32)), 0, 1)[
        :, None] * 0.6
    lights = [(_n(np.array(moon, np.float32)), np.array(moon_col, np.float32) * moon_k),
              (_n(np.array(fill, np.float32)), np.array(fill_col, np.float32) * 0.5)]     # cold sky on the plates
    if point is not None:
        pos, pc, pk, rng = point
        P = cam.eye + (-V) * depth[m][:, None] / np.maximum(NV[:, None] * 0 + (-V @ cam.R[2])[:, None], 1e-3)
        Ld = np.asarray(pos, np.float32) - P
        dist = np.linalg.norm(Ld, axis=-1)
        att = pk / (1 + (dist / rng) ** 2)
        lights.append((_n(Ld), np.array(pc, np.float32), att))
    for L in lights:
        Ldir, C = L[0], L[1]
        att = L[2] if len(L) > 2 else 1.0
        NL = (N * Ldir).sum(-1) if Ldir.ndim > 1 else N @ Ldir
        diff = np.clip((NL + wrap) / (1 + wrap), 0, 1)
        Hh = _n(Ldir + V)
        spec = np.clip((N * Hh).sum(-1), 0, 1) ** sh * sp
        tint = IRID[0][None] * (0.5 + 0.5 * np.cos(NV * 7.0))[:, None] + IRID[1][None] * (0.5 - 0.5 * np.cos(NV * 7.0))[:, None]
        scol = (1 - ir[:, None]) + ir[:, None] * tint
        a = att if np.isscalar(att) else att[:, None]
        col += (A * diff[:, None] * C + spec[:, None] * scol * C * 1.2) * a
    back = np.clip(-(V @ lights[0][0]), 0, 1) * 0.6 + 0.4                 # the rim, strongest against the moon
    col += ((1 - NV) ** 3.5 * back * rim_k)[:, None] * lights[0][1] * 0.9
    col += A * em[:, None] * 255
    if fog is not None:
        fc, fd = fog
        f = 1 - np.exp(-depth[m] / fd)
        col = col * (1 - f[:, None]) + np.array(fc, np.float32) * f[:, None]
    out[m] = col
    return out, m
