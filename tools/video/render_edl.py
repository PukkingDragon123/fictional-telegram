#!/usr/bin/env python3
"""Render every shot of an edit list at full quality (only the frames the cut uses), then
its game audio. One browser at a time; skips shots whose frames are already complete.

    python3 tools/video/render_edl.py tools/video/edl_promo.json <frames-root> [shot ...]
"""
import json, os, subprocess, sys, time, math

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
E = json.load(open(sys.argv[1]))
root = os.path.abspath(sys.argv[2])
only = set(sys.argv[3:])
shots = E['shots']
# per source dir: the union of the frame windows every cut of it needs, plus margins for
# overlap transitions (zoom / dissolve / whip need frames past the cut on both sides)
win = {}
for j, s in enumerate(shots):
    m0 = (s['tin'].get('dur', 0) / 2 + 0.1) if s.get('tin') else 0
    nx = shots[j + 1] if j + 1 < len(shots) else None
    m1 = (nx['tin'].get('dur', 0) / 2 + 0.1) if nx and nx.get('tin') else 0
    sid = s.get('src', s['id'])
    a0, a1 = max(0, s['in'] - m0), s['out'] + m1
    if sid in win:
        win[sid] = (min(win[sid][0], a0), max(win[sid][1], a1))
    else:
        win[sid] = (a0, a1)
for sid, (a0, a1) in win.items():
    s = {'in': a0, 'out': a1}
    if only and sid not in only:
        continue
    out = os.path.join(root, sid)
    f0, f1 = int(round(s['in'] * 30)), int(math.ceil(s['out'] * 30)) + 2
    need = min(f1 - 2, f0 + int(round((s['out'] - s['in']) * 30)))  # frames the cut takes
    have = all(os.path.exists(os.path.join(out, 'f%05d.jpg' % i)) for i in range(f0, need))
    if have and os.path.exists(os.path.join(out, 'game.wav')):
        print('skip', sid, flush=True)
        continue
    os.makedirs(out, exist_ok=True)
    t = time.time()
    print('[%s] render %s frames %d..%d' % (time.strftime('%H:%M:%S'), sid, f0, f1), flush=True)
    with open(os.path.join(out, 'render.log'), 'w') as log:
        cmd = ['timeout', '14400', 'node', os.path.join(HERE, 'render.mjs'), E['module'], sid, '--out', out, '--from', str(f0), '--to', str(f1)]
        if E.get('render_size'):
            cmd += ['--size', '%dx%d' % tuple(E['render_size'])]
        subprocess.run(cmd, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    tail = open(os.path.join(out, 'render.log')).read().splitlines()
    print('   ' + '\n   '.join([l for l in tail if 'done:' in l or 'rror' in l][:6]), flush=True)
    subprocess.run(['timeout', '1800', 'node', os.path.join(HERE, 'sfx.mjs'), out], cwd=ROOT)
    print('   %.1f min' % ((time.time() - t) / 60), flush=True)
print('all done', flush=True)
