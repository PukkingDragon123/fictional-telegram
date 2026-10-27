"""The low-poly models as OBJ files with materials: the Gaki standing, tendrils
out (2.15 units tall; the film scales him by 30), and the goat-dragon gliding.

    python export_model.py OUT_DIR
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'teahouse-assets', 'generator'))
from creature import Rig, pose                                     # noqa: E402
import goat_flight                                                  # noqa: E402


def write_obj(path, parts):
    """parts: [(name, verts, faces, rgb 0..1)] -> path.obj + path.mtl"""
    base = os.path.splitext(os.path.basename(path))[0]
    with open(os.path.splitext(path)[0] + '.mtl', 'w') as m:
        for name, _, _, c in parts:
            m.write('newmtl %s\nKd %.4f %.4f %.4f\nKa 0 0 0\nKs 0 0 0\nd 1\nillum 1\n\n' % (name, *c))
    with open(path, 'w') as o:
        o.write('mtllib %s.mtl\n' % base)
        n = 1
        for name, v, f, _ in parts:
            o.write('o %s\nusemtl %s\n' % (name, name))
            o.write(''.join('v %.4f %.4f %.4f\n' % tuple(p) for p in v))
            o.write(''.join('f %d %d %d\n' % tuple(q + n) for q in f))
            n += len(v)


def gaki(path):
    rig = Rig(tendrils=40)
    J = pose(0.0, run=0.0, lean=0.0)
    v, f, _, _ = rig.body(J).arrays()
    tv, tf, _, _ = rig.tendrils(J, 1.3, np.array([0, 0.3, -0.25])).arrays()
    eyes, mouth, _ = rig.face(J)
    ev, ef = [], []
    from raster3d import blob
    for e in eyes:
        bv, bf = blob(e, (0.032, 0.032, 0.012), sub=1)
        ef.append(bf + len(np.concatenate(ev)) if ev else bf)
        ev.append(bv)
    write_obj(path, [('void_body', v, f, (0.02, 0.02, 0.025)), ('void_tendrils', tv, tf, (0.02, 0.02, 0.025)),
                     ('eyes', np.concatenate(ev), np.concatenate(ef), (1, 1, 1))])


def goat(path):
    m = goat_flight.build(1.0, 'glide')
    v, f, _, o = m.arrays()
    names = list(goat_flight.MATS)
    parts = []
    for k in np.unique(o):
        name = names[k - 1]
        sel = f[o == k]
        used, inv = np.unique(sel, return_inverse=True)
        c = goat_flight.RAMP[name][len(goat_flight.RAMP[name]) * 2 // 3] / 255
        parts.append((name, v[used] / 40.0, inv.reshape(-1, 3), c))      # about 5 units nose to tail
    write_obj(path, parts)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out, exist_ok=True)
    gaki(os.path.join(out, 'gaki_lowpoly.obj'))
    goat(os.path.join(out, 'goat_dragon_lowpoly.obj'))
