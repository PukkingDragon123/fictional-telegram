"""The giant and the roaches it is made of.

Every roach is a little 3D model drawn into the g-buffer like everything else,
so the moon lights it, its shell catches a glint, it throws a shadow and gets
its outline: a glossy domed back (the folded wings), the pale-rimmed shield
behind the head, the head, and - when it is big enough on screen to see them
- six legs walking in a tripod gait and two long antennae feeling about.

The giant is a gaunt man 110 m tall: a dark core (capsules for the limbs and
fingers, ellipsoids for skull, jaw, ribcage and pelvis) with thousands of
roaches crawling over it, along the limbs and round them. The face is roaches
too: they keep out of the eye sockets, where the eyes burn deep inside, and
out of the mouth when it opens.

Positions are in body units (the giant's skeleton from gaki-rampage's
giant.py); `GS` metres a unit when it is placed in the world.
"""
import math
import os
import sys

import numpy as np

import hd2d as K

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'gaki-rampage'))
sys.path.insert(0, os.path.join(HERE, '..', 'teahouse-assets', 'generator'))
import giant as G                                                     # noqa: E402
from raster3d import rot                                              # noqa: E402

ROACH, CORE, EYE, MOUTH = 12, 8, 9, 13
GS = 52.0


def _n(v):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)


# ---------------------------------------------------------------- one roach, as primitives
def roach_prims(P, N, Hd, L, ph, cam, oid0, legs_px=10.0, rng_ids=None):
    """Primitives for roaches at P (n,3) on surfaces with normal N, heading Hd,
    length L (metres), gait phase ph. Returns (ellipsoids, capsules) as dicts."""
    n = len(P)
    N = _n(N)
    Hd = Hd - N * (Hd * N).sum(1, keepdims=True)
    bad = np.linalg.norm(Hd, axis=1) < 1e-6                 # heading along the normal: pick any way across
    if bad.any():
        alt = np.cross(N[bad], np.array([0.31, 0.0, 0.95]))
        alt2 = np.cross(N[bad], np.array([1.0, 0.0, 0.0]))
        alt = np.where((np.linalg.norm(alt, axis=1) > 1e-3)[:, None], alt, alt2)
        Hd[bad] = alt
    Hd = _n(Hd)
    S = _n(np.cross(Hd, N))
    Lc = L[:, None]
    ids = np.arange(n) if rng_ids is None else rng_ids
    Rm = np.stack([Hd, N, S], 2)                            # columns: the roach's axes
    # body bob as it runs
    bob = (0.02 * np.sin(ph * 2))[:, None] * Lc * N
    shell_c = P + N * 0.14 * Lc - Hd * 0.08 * Lc + bob
    pron_c = P + N * 0.11 * Lc + Hd * 0.3 * Lc + bob
    head_c = P + N * 0.08 * Lc + Hd * 0.44 * Lc + bob
    E = dict(C=np.concatenate([shell_c, pron_c, head_c]),
             R=np.concatenate([np.c_[0.43 * L, 0.14 * L, 0.23 * L], np.c_[0.15 * L, 0.09 * L, 0.2 * L],
                               np.c_[0.07 * L, 0.055 * L, 0.075 * L]]),
             Rm=np.concatenate([Rm, Rm, Rm]),
             var=np.concatenate([np.full(n, 0.1), np.full(n, 0.5), np.full(n, 0.9)]).astype(np.float32),
             oid=np.concatenate([oid0 + ids * 4, oid0 + ids * 4 + 1, oid0 + ids * 4 + 2]).astype(np.int32))
    caps = dict(A=[], B=[], r=[], var=[], oid=[])
    if cam is not None:
        d = np.linalg.norm(P - cam.eye, axis=1)
        px = L * cam.focal / np.maximum(d, 0.1)
        big = px > legs_px
        if big.any():
            b = np.where(big)[0]
            P2, N2, H2, S2, L2, ph2 = P[b] + bob[b], N[b], Hd[b], S[b], L[b][:, None], ph[b]
            for side in (-1, 1):
                for j, (u0, reach) in enumerate(((0.26, 0.42), (0.04, 0.5), (-0.18, 0.56))):
                    gait = np.sin(ph2 + (j % 2) * math.pi + (side > 0) * math.pi)
                    lift = np.clip(np.cos(ph2 + (j % 2) * math.pi + (side > 0) * math.pi), 0, 1)
                    base = P2 + H2 * u0 * L2 + S2 * side * 0.12 * L2 + N2 * 0.1 * L2
                    sweep = (j - 1) * 0.22 + 0.16 * gait
                    foot = P2 + H2 * (u0 + sweep[:, None] * 1.0) * L2 + S2 * side * reach * L2 + \
                        N2 * (lift[:, None] * 0.1 - 0.02) * L2
                    knee = (base + foot) / 2 + N2 * 0.16 * L2 + S2 * side * 0.06 * L2
                    for a, c in ((base, knee), (knee, foot)):
                        caps['A'].append(a)
                        caps['B'].append(c)
                        caps['r'].append(L[b] * 0.016)
                        caps['var'].append(np.full(len(b), 0.95))
                        caps['oid'].append(oid0 + ids[b] * 4 + 3)
            ant = px[b] > legs_px * 1.8
            if ant.any():
                q_ = np.where(ant)[0]
                for side in (-1, 1):                                 # antennae, feeling about
                    w = 0.2 * np.sin(ph2[q_] * 0.7 + side)[:, None]
                    a = P2[q_] + H2[q_] * 0.5 * L2[q_] + N2[q_] * 0.08 * L2[q_] + S2[q_] * side * 0.03 * L2[q_]
                    m = a + (H2[q_] * 0.32 + S2[q_] * side * (0.14 + w * 0.5) + N2[q_] * 0.07) * L2[q_]
                    e = m + (H2[q_] * 0.22 + S2[q_] * side * (0.3 + w) - N2[q_] * 0.03) * L2[q_]
                    for p, q in ((a, m), (m, e)):
                        caps['A'].append(p)
                        caps['B'].append(q)
                        caps['r'].append(L[b][q_] * 0.006)
                        caps['var'].append(np.full(len(q_), 0.97))
                        caps['oid'].append(oid0 + ids[b][q_] * 4 + 3)
    if caps['A']:
        caps = {k: np.concatenate(v) for k, v in caps.items()}
    else:
        caps = None
    return E, caps


def draw_roaches(g, cam, P, N, Hd, L, ph, oid0, legs_px=10.0, ids=None):
    if not len(P):
        return
    d = np.linalg.norm(P - cam.eye, axis=1)
    c = cam.to_cam(P)
    zz = np.maximum(c[:, 2], 1e-3)
    vis = (c[:, 2] > -L) & (np.abs(c[:, 0]) < cam.W / 2 / cam.focal * zz + L * 2) & \
        (np.abs(c[:, 1]) < cam.H / 2 / cam.focal * zz + L * 2)
    if not vis.any():
        return
    sel = np.where(vis)[0]
    ids = sel if ids is None else ids[sel]
    E, C = roach_prims(P[sel], N[sel], Hd[sel], L[sel], ph[sel], cam, oid0, legs_px, ids)
    K.draw_ellipsoids(g, cam, E['C'], E['R'], ROACH, E['oid'], E['var'], Rm=E['Rm'])
    if C is not None:
        K.draw_capsules(g, cam, C['A'], C['B'], C['r'], ROACH, C['oid'], C['var'])


# ---------------------------------------------------------------- the body
CAPS = [  # name, joint a, joint b, radius at a, at b, roach share
    ('thighL', 'hipL', 'kneeL', 0.095, 0.062, 0.075), ('thighR', 'hipR', 'kneeR', 0.095, 0.062, 0.075),
    ('shinL', 'kneeL', 'ankleL', 0.06, 0.038, 0.06), ('shinR', 'kneeR', 'ankleR', 0.06, 0.038, 0.06),
    ('footL', 'ankleL', 'toeL', 0.045, 0.03, 0.02), ('footR', 'ankleR', 'toeR', 0.045, 0.03, 0.02),
    ('upperL', 'shL', 'elL', 0.068, 0.046, 0.05), ('upperR', 'shR', 'elR', 0.068, 0.046, 0.05),
    ('foreL', 'elL', 'wrL', 0.05, 0.032, 0.045), ('foreR', 'elR', 'wrR', 0.05, 0.032, 0.045),
    ('handL', 'wrL', 'paL', 0.04, 0.038, 0.015), ('handR', 'wrR', 'paR', 0.04, 0.038, 0.015),
    ('waist', 'pelvis', 'chest', 0.13, 0.11, 0.07), ('neck', 'neck', 'nktop', 0.055, 0.048, 0.02),
    ('shoulders', 'shL', 'shR', 0.075, 0.075, 0.04)]
ELLS = [  # name, joint, frame, offset (in frame), radii, roach share
    ('chest', 'chest', 'R2', (0, 0.03, 0.0), (0.19, 0.2, 0.14), 0.12),
    ('pelvisb', 'pelvis', 'R', (0, 0.0, -0.01), (0.16, 0.11, 0.11), 0.05),
    ('head', 'head', 'Rh', (0, 0.03, 0.0), (0.1, 0.135, 0.115), 0.13),
    ('jaw', 'head', 'Rh', (0, -0.075, 0.035), (0.075, 0.05, 0.08), 0.03),
    ('brow', 'head', 'Rh', (0, 0.045, 0.085), (0.085, 0.024, 0.04), 0.012),
    ('nose', 'head', 'Rh', (0, -0.005, 0.11), (0.018, 0.04, 0.02), 0.004)]
SOCKETS = [(-0.042, 0.02, 0.1), (0.042, 0.02, 0.1)]       # in the head frame
MOUTH_AT = (0.0, -0.062, 0.1)


def joints(J):
    """The skeleton plus a few points the body needs."""
    J = dict(J)
    for s in 'LR':
        fd = _n(J['wr' + s] - J['el' + s])
        J['pa' + s] = J['wr' + s] + fd * 0.09
    J['nktop'] = J['head'] + J['Rh'] @ np.array([0, -0.09, -0.03])
    return J


def fingers(J):
    """Five long fingers a hand, three bones each, curled by J['curl*']."""
    out = []
    for s, n in ((-1, 'L'), (1, 'R')):
        el, wr = J['el' + n], J['wr' + n]
        fd = _n(wr - el)
        side = _n(np.cross(fd, (0, 1, 0)))
        up = _n(np.cross(side, fd))
        palm = J['pa' + n]
        curl = J['curl' + n]
        for k in range(5):
            thumb = k == 4
            spread = (k - 1.5) * 0.22 if not thumb else 1.3
            d = rot(up, spread * s * 0.5) @ fd
            base = palm + side * ((k - 1.5) * 0.02 if not thumb else 0.04 * s) + d * 0.02
            seg = (0.085, 0.07, 0.055) if not thumb else (0.055, 0.045, 0.035)
            p = base
            for j, L in enumerate(seg):
                d = rot(_n(np.cross(d, up)), -(0.15 + 0.85 * curl) * 0.55) @ d
                q = p + d * L
                out.append((n, k, j, p, q, 0.017 - 0.003 * j))
                p = q
    return out


class Colossus:
    """The giant: its core and the roaches on it."""

    def __init__(self, n=6500, n_face=1400, seed=5):
        r = np.random.RandomState(seed)
        names = [c[0] for c in CAPS] + [e[0] for e in ELLS] + ['finger']
        share = np.array([c[5] for c in CAPS] + [e[5] for e in ELLS] + [0.05])
        share /= share.sum()
        self.part = r.choice(len(names), n, p=share)
        self.names = names
        self.u = r.rand(n)
        self.th = r.uniform(0, 2 * math.pi, n)
        self.phi = np.arccos(r.uniform(-1, 1, n))
        self.du = r.normal(0, 0.05, n) + np.where(r.rand(n) < 0.4, r.choice([-1, 1], n) * 0.16, 0)
        self.dth = r.normal(0, 0.35, n)
        self.size = r.uniform(0.042, 0.06, n)
        self.gait = r.uniform(7, 12, n)
        self.ph0 = r.uniform(0, 6.3, n)
        self.fing = r.randint(0, 30, n)
        # the face, close up: smaller roaches packed over the front of the head
        m = n_face
        self.f_th = r.uniform(-1.25, 1.25, m)                     # round from the front
        self.f_y = r.uniform(-1, 1, m)
        self.f_size = r.uniform(0.022, 0.034, m)
        self.f_dth = r.normal(0, 0.12, m)
        self.f_gait = r.uniform(8, 13, m)
        self.f_ph0 = r.uniform(0, 6.3, m)
        self.n, self.m = n, m

    # ---- the core
    def core(self, J):
        J = joints(J)
        A, B, R, mat = [], [], [], []
        for (name, a, b, ra, rb, _) in CAPS:
            A.append(J[a])
            B.append(J[b])
            R.append((ra + rb) / 2 * 0.9)
            mat.append(CORE)
        for (h, k, j, p, q, rr) in fingers(J):
            A.append(p)
            B.append(q)
            R.append(rr)
            mat.append(CORE)
        C, Rad, Rm = [], [], []
        for (name, jn, fr, off, rad, _) in ELLS:
            M = J[fr]
            c = J[jn] + M @ np.array(off)
            if name == 'jaw':
                c = c + M @ np.array([0, -0.04 * J['jaw'], 0.01 * J['jaw']])
            C.append(c)
            Rad.append(np.array(rad) * 0.93)
            Rm.append(M)
        return np.array(A), np.array(B), np.array(R), np.array(C), np.array(Rad), np.array(Rm)

    # ---- where every roach is
    def roaches(self, J, t):
        """Body-frame positions, normals, headings and sizes of every roach."""
        J = joints(J)
        n = self.n
        P = np.zeros((n, 3))
        Nn = np.zeros((n, 3))
        Hh = np.zeros((n, 3))
        for k, (name, a, b, ra, rb, _) in enumerate(CAPS):
            sel = self.part == k
            if not sel.any():
                continue
            Aj, Bj = J[a], J[b]
            ax = Bj - Aj
            L = np.linalg.norm(ax) + 1e-9
            axn = ax / L
            ref = np.array([0, 0, 1.0]) if abs(axn[2]) < 0.9 else np.array([1.0, 0, 0])
            e1 = _n(np.cross(axn, ref))
            e2 = np.cross(axn, e1)
            u = (self.u[sel] + self.du[sel] * t / max(L, 0.2)) % 2
            u = np.where(u > 1, 2 - u, u)
            th = self.th[sel] + self.dth[sel] * t
            r_ = ra + (rb - ra) * u
            nrm = np.outer(np.cos(th), e1) + np.outer(np.sin(th), e2)
            P[sel] = Aj + np.outer(u, ax) + nrm * r_[:, None]
            Nn[sel] = nrm
            Hh[sel] = np.outer(np.sign(self.du[sel] + 1e-6), axn) + (np.outer(-np.sin(th), e1) +
                                                                       np.outer(np.cos(th), e2)) * \
                self.dth[sel][:, None] * 0.4
        base = len(CAPS)
        for k, (name, jn, fr, off, rad, _) in enumerate(ELLS):
            sel = self.part == base + k
            if not sel.any():
                continue
            M = J[fr]
            c = J[jn] + M @ np.array(off)
            if name == 'jaw':
                c = c + M @ np.array([0, -0.04 * J['jaw'], 0.01 * J['jaw']])
            ph = self.phi[sel] + 0.12 * np.sin(t * 0.3 + self.th[sel])
            th = self.th[sel] + self.dth[sel] * t * 0.5
            loc = np.stack([np.sin(ph) * np.cos(th) * rad[0], np.cos(ph) * rad[1], np.sin(ph) * np.sin(th) * rad[2]], 1)
            P[sel] = c + loc @ M.T
            Nn[sel] = _n((loc / np.array(rad) ** 2) @ M.T)
            loc2 = np.stack([np.sin(ph) * np.cos(th + 0.1) * rad[0], np.cos(ph + 0.04) * rad[1],
                             np.sin(ph) * np.sin(th + 0.1) * rad[2]], 1)
            Hh[sel] = (loc2 - loc) @ M.T
        sel = self.part == len(self.names) - 1
        if sel.any():
            F = fingers(J)
            idx = self.fing[sel] % len(F)
            for q, i in enumerate(np.where(sel)[0]):
                h, kk, j, p, qq, rr = F[idx[q]]
                ax = qq - p
                axn = ax / (np.linalg.norm(ax) + 1e-9)
                e1 = _n(np.cross(axn, [0, 1.0, 0]) + 1e-6)
                e2 = np.cross(axn, e1)
                u = (self.u[i] + 0.3 * t * self.du[i]) % 1
                th = self.th[i] + self.dth[i] * t
                nr = e1 * math.cos(th) + e2 * math.sin(th)
                P[i] = p + ax * u + nr * rr
                Nn[i] = nr
                Hh[i] = axn
        # keep out of the eye sockets and the open mouth: push them to the rim
        hd = J['head']
        Rh = J['Rh']
        loc = (P - hd) @ Rh
        for sx, sy, sz in SOCKETS:
            d = loc - np.array([sx, sy, sz])
            rr = np.sqrt(d[:, 0] ** 2 + d[:, 1] ** 2)
            inside = (rr < 0.03) & (d[:, 2] > -0.06)
            if inside.any():
                k = 0.03 / np.maximum(rr[inside], 1e-4)
                loc[inside, 0] = sx + d[inside, 0] * k
                loc[inside, 1] = sy + d[inside, 1] * k
        jaw = J['jaw']
        if jaw > 0.05:
            mx, my, mz = MOUTH_AT
            hw, hh = 0.045, 0.012 + 0.045 * jaw
            d = loc - np.array([mx, my - 0.02 * jaw, mz])
            e = (d[:, 0] / hw) ** 2 + (d[:, 1] / hh) ** 2
            inside = (e < 1) & (d[:, 2] > -0.06)
            if inside.any():
                k = 1 / np.sqrt(np.maximum(e[inside], 1e-4))
                loc[inside, 0] = mx + d[inside, 0] * k
                loc[inside, 1] = my - 0.02 * jaw + d[inside, 1] * k
        P = hd + loc @ Rh.T
        return P, Nn, Hh, self.size.copy()

    def face(self, J, t):
        """The packed small roaches over the front of the head (for the close-ups)."""
        J = joints(J)
        Rh = J['Rh']
        c = J['head'] + Rh @ np.array([0, 0.03, 0.0])
        rad = np.array([0.1, 0.135, 0.115]) * 1.02
        th = self.f_th + self.f_dth * t
        y = np.clip(self.f_y + 0.05 * np.sin(t * 0.4 + self.f_ph0), -0.98, 0.98)
        rr = np.sqrt(1 - y * y)
        loc = np.stack([np.sin(th) * rr * rad[0], y * rad[1], np.cos(th) * rr * rad[2]], 1)
        keep = np.ones(len(th), bool)
        for sx, sy, sz in SOCKETS:
            keep &= np.hypot(loc[:, 0] - sx, loc[:, 1] - (sy - 0.03)) > 0.032
        jaw = J['jaw']
        mx, my, mz = MOUTH_AT
        if jaw > 0.05:
            e = ((loc[:, 0] - mx) / 0.048) ** 2 + ((loc[:, 1] - (my - 0.03 - 0.02 * jaw)) / (0.014 + 0.045 * jaw)) ** 2
            keep &= e > 1
        P = c + loc @ Rh.T
        N = _n((loc / rad ** 2) @ Rh.T)
        Hh = np.stack([np.cos(th), np.sin(t * 0.7 + self.f_ph0) * 0.5, -np.sin(th)], 1) @ Rh.T
        return P[keep], N[keep], Hh[keep], self.f_size[keep], np.where(keep)[0]

    # ---- drawing it
    def draw(self, g, cam, J, pos, yaw, t, fill=2.0, arrive=None, ground_pts=None, face=False, eyes=1.0,
             shadow=False):
        """Draw the giant at pos/yaw. fill < 1 while it forms: the core shows
        from the feet up to that height; roaches still climbing are passed in
        ground_pts (positions they climb from)."""
        Rw = rot((0, 1, 0), yaw)

        def place(p):
            return p @ (Rw * GS).T + pos
        A, B, R, C, Rad, Rm = self.core(J)
        hmin = 0.0
        hmax = 2.3
        cut = hmin + (hmax - hmin) * fill
        if fill > 0:
            ka = np.minimum(A[:, 1], B[:, 1]) < cut
            kc = C[:, 1] - Rad.max(1) < cut
            if ka.any():
                # while it forms, a limb only goes up as far as the roaches have got
                A2, B2 = A[ka].copy(), B[ka].copy()
                lo = np.where((A2[:, 1] <= B2[:, 1])[:, None], A2, B2)
                hi = np.where((A2[:, 1] <= B2[:, 1])[:, None], B2, A2)
                k = np.clip((cut - lo[:, 1]) / np.maximum(hi[:, 1] - lo[:, 1], 1e-6), 0, 1)[:, None]
                hi = lo + (hi - lo) * k
                K.draw_capsules(g, cam, place(lo), place(hi), R[ka] * GS * np.clip((cut - lo[:, 1]) * 6, 0.25, 1),
                                CORE, 8000100 + np.where(ka)[0], 0.3, widen=not shadow)
            if kc.any():
                K.draw_ellipsoids(g, cam, place(C[kc]), Rad[kc] * GS * np.clip((cut - C[kc, 1]) * 4, 0.2, 1)[:, None],
                                  CORE, 8000002 + np.arange(kc.sum()), 0.3, Rm=np.einsum('ij,njk->nik', Rw, Rm[kc]),
                                  widen=not shadow)
            # eye sockets and the mouth: dark hollows, the eyes burning in them
            hd, Rh = J['head'], J['Rh']
            if C[2, 1] < cut and not shadow:
                for k, (sx, sy, sz) in enumerate(SOCKETS):
                    p = hd + Rh @ np.array([sx, sy, sz + 0.012])
                    K.draw_ellipsoids(g, cam, place(p[None]), np.array([[0.026, 0.02, 0.012]]) * GS, MOUTH,
                                      8000020 + k, 0.0, Rm=(Rw @ Rh)[None])
                    e = hd + Rh @ np.array([sx * 0.95, sy - 0.003, sz + 0.03])
                    K.draw_ellipsoids(g, cam, place(e[None]), np.array([[0.008, 0.0065, 0.005]]) * GS * max(eyes, 0.05),
                                      EYE, 8000030 + k, float(eyes), Rm=(Rw @ Rh)[None])
                if J['jaw'] > 0.05:
                    mx, my, mz = MOUTH_AT
                    p = hd + Rh @ np.array([mx, my - 0.02 * J['jaw'], mz + 0.006])
                    K.draw_ellipsoids(g, cam, place(p[None]),
                                      np.array([[0.046, 0.012 + 0.045 * J['jaw'], 0.02]]) * GS, MOUTH, 8000040, 0.0,
                                      Rm=(Rw @ Rh)[None])
        if shadow:
            return
        P, Nn, Hh, S = self.roaches(J, t)
        Pw = place(P)
        Nw = Nn @ Rw.T
        Hw = Hh @ Rw.T
        L = S * GS
        ph = t * self.gait + self.ph0
        if arrive is not None:
            on = t >= arrive
            climb = ~on & (t >= arrive - 1.3)
            if climb.any() and ground_pts is not None:
                e = np.clip((t - (arrive[climb] - 1.3)) / 1.3, 0, 1)
                e = e * e * (3 - 2 * e)
                g0 = ground_pts[climb]
                arc = np.sin(math.pi * e)[:, None] * 8
                Pw[climb] = g0 * (1 - e[:, None]) + Pw[climb] * e[:, None] + _n(Pw[climb] - g0) * 0 + \
                    np.array([0, 1.0, 0]) * arc
                Hw[climb] = Pw[climb] - g0
                side = np.cross(Hw[climb], [0, 1, 0])
                side = np.where((np.linalg.norm(side, axis=1) > 1e-3)[:, None], side, np.array([1.0, 0, 0]))
                Nw[climb] = _n(np.cross(side, Hw[climb]))
            sel = on | climb
            Pw, Nw, Hw, L, ph = Pw[sel], Nw[sel], Hw[sel], L[sel], ph[sel]
            ids = np.where(sel)[0]
        else:
            ids = np.arange(len(Pw))
        draw_roaches(g, cam, Pw, Nw, Hw, L, ph, 20000000, ids=ids)
        if face and fill > 1.5:
            P2, N2, H2, S2, ids2 = self.face(J, t)
            draw_roaches(g, cam, place(P2), N2 @ Rw.T, H2 @ Rw.T, S2 * GS, t * self.f_gait[ids2] + self.f_ph0[ids2],
                         30000000, ids=ids2)


# ---------------------------------------------------------------- the tide
class Tide:
    """Roaches pouring out of the crack and over the meadow, then running back
    to climb into the giant. Each has: when it comes out, where it runs to, a
    swirl, and when it turns back (to arrive at its place on the body)."""

    def __init__(self, n, crack, seed, t_out, t_turn, arrive, spread=(15, 220)):
        r = np.random.RandomState(seed)
        self.n = n
        self.crack = np.asarray(crack, float)
        self.e = np.sort(r.uniform(*t_out, n)) if np.ndim(t_out) == 1 else np.asarray(t_out)
        self.rho = spread[0] + (spread[1] - spread[0]) * np.sqrt(r.rand(n))
        self.alpha = r.uniform(0, 2 * math.pi, n)
        self.swirl = r.normal(0, 0.5, n)
        self.turn = t_turn + r.uniform(0, 2.0, n)
        self.arrive = np.asarray(arrive, float)
        self.speed = r.uniform(0.75, 1.25, n)
        self.wob = r.uniform(0, 6.3, n)
        self.size = r.uniform(0.042, 0.06, n) * GS
        self.gait = r.uniform(9, 14, n)
        self.slot = r.uniform(-1, 1, n)                     # sideways place in the crack

    def ground(self, t, land, target=None):
        """Positions (on the ground), headings, and who is out."""
        a = np.clip((t - self.e) * 0.3 * self.speed, 0, 1)
        a = 1 - (1 - a) ** 2.2
        back = np.clip((t - self.turn) / np.maximum(self.arrive - 1.3 - self.turn, 0.3), 0, 1)
        back = back * back * (3 - 2 * back)
        rr = self.rho * a * (1 - back) + 2.0
        ang = self.alpha + self.swirl * (a + back * 0.6) * 0.9 + 0.06 * np.sin(t * 3 * self.speed + self.wob)
        x = self.crack[0] + np.cos(ang) * rr + self.slot * 5 * (1 - a)
        z = self.crack[2] + np.sin(ang) * rr
        if target is not None:                              # in the last stretch, run to the foot of the giant
            k = np.clip((t - (self.arrive - 2.4)) / 1.1, 0, 1)[:, None]
            tx = target[:, [0, 2]]
            xz = np.stack([x, z], 1) * (1 - k) + tx * k
            x, z = xz[:, 0], xz[:, 1]
        y = land.height(x, z) + 0.05
        # heading: along the motion
        a2 = np.clip((t + 0.05 - self.e) * 0.3 * self.speed, 0, 1)
        a2 = 1 - (1 - a2) ** 2.2
        back2 = np.clip((t + 0.05 - self.turn) / np.maximum(self.arrive - 1.3 - self.turn, 0.3), 0, 1)
        back2 = back2 * back2 * (3 - 2 * back2)
        rr2 = self.rho * a2 * (1 - back2) + 2.0
        ang2 = self.alpha + self.swirl * (a2 + back2 * 0.6) * 0.9 + 0.06 * np.sin((t + 0.05) * 3 * self.speed +
                                                                                    self.wob)
        hx = self.crack[0] + np.cos(ang2) * rr2 - x + self.slot * 5 * (1 - a2)
        hz = self.crack[2] + np.sin(ang2) * rr2 - z
        H = np.stack([hx, np.zeros_like(hx), hz], 1)
        still = np.linalg.norm(H, axis=1) < 1e-4
        H[still] = np.stack([np.cos(ang[still]), 0 * ang[still], np.sin(ang[still])], 1)
        out = t >= self.e
        return np.stack([x, y, z], 1), H, out

    def draw(self, g, cam, t, land, until=None, target=None, oid0=40000000):
        P, H, out = self.ground(t, land, target)
        if until is not None:
            out &= t < until
        if not out.any():
            return
        idx = np.where(out)[0]
        N = land.normal(P[idx, 0], P[idx, 2])
        # coming out of the crack: rising out of the ground
        rise = np.clip((t - self.e[idx]) * 2.5, 0, 1)
        Pp = P[idx] - N * (1 - rise[:, None]) * self.size[idx, None] * 0.6
        draw_roaches(g, cam, Pp, N, H[idx], self.size[idx], t * self.gait[idx] + self.wob[idx], oid0, ids=idx)
        return P, out
