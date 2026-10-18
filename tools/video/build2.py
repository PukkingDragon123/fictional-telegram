#!/usr/bin/env python3
"""Compositor v2: game frames + transitions + light leaks + overlay track (titles.mjs)
-> graded, grained, letterboxed H.264 + AAC mp4.

    python3 tools/video/build2.py <edl.json> [--preview] [--frames DIR] [--out FILE] [--from S --to S]

EDL (JSON), on top of build.py's audio fields (music, duck, sfx, game_gain_db, ext_gain_db, mute_game):
  module          shots module (render_edl2.py)
  frames          root of the per-shot frame dirs
  render_size     [w, h] of the game frames, size: [w, h] of the output (nearest-neighbour upscale)
  letterbox       e.g. 2.39 (black bars drawn last) or null
  grade           ffmpeg filter chain applied before the bars (e.g. eq/colorbalance/vignette/noise)
  shots           [{ id, src?, in, out, tin?: { type, dur, cx, cy, dir } }]   tin = transition INTO this shot
                  types: cut | whip (dir +1/-1) | zoom (zoom-through, overlap) | dissolve (overlap) | flash | dip
  titles          overlay items for titles.js (timeline seconds)
  leaks           [{ t0, t1, x, y, r, amp, color: [r,g,b], drift: [dx, dy] }]  warm light leaks (screen blend)
  kbps            video bitrate (2-pass)
"""
import json, os, subprocess, sys, shutil, tempfile, math
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build as B  # audio helpers (decode, add, fades, db, rel) + FF

FF = B.FF
ROOT = B.ROOT
SR = B.SR
VIDEO_URL = os.environ.get('VIDEO_URL', 'http://127.0.0.1:5245')


def arg(k, d=None):
    return sys.argv[sys.argv.index('--' + k) + 1] if '--' + k in sys.argv else d


def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


class Timeline:
    def __init__(self, E, frames_root, fps):
        self.E, self.root, self.fps = E, frames_root, fps
        t = 0.0
        for s in E['shots']:
            s['at'] = t
            s['len'] = s['out'] - s['in']
            s['dir'] = os.path.join(frames_root, s.get('src', s['id']))
            t += s['len']
        self.total = t
        self.cache = {}

    def frame(self, s, t):
        """game frame of shot s at timeline time t (may run past its in/out: transition margins)"""
        fi = int(round((s['in'] + (t - s['at'])) * self.fps))
        for d in range(0, 90):
            for f in (fi - d, fi + d):
                p = os.path.join(s['dir'], 'f%05d.jpg' % f)
                if os.path.exists(p):
                    return p
        return None

    def shot_at(self, t):
        for i, s in enumerate(self.E['shots']):
            if s['at'] <= t < s['at'] + s['len']:
                return i
        return len(self.E['shots']) - 1


def load(p, size):
    key = (p, size)
    im = Image.open(p).convert('RGB')
    if im.size != tuple(size):
        im = im.resize(tuple(size), Image.NEAREST)
    return np.asarray(im, dtype=np.float32) / 255.0


def hblur(a, w):
    """horizontal box blur, width w px"""
    w = int(w)
    if w < 2:
        return a
    c = np.cumsum(np.pad(a, ((0, 0), (w, w), (0, 0)), mode='edge'), axis=1)
    out = (c[:, w + w // 2: w + w // 2 + a.shape[1]] - c[:, w // 2: w // 2 + a.shape[1]]) / w
    return out.astype(np.float32)


def shift(a, dx):
    dx = int(round(dx))
    if dx == 0:
        return a
    return np.roll(a, dx, axis=1)


def zoom(a, s, cx=0.5, cy=0.5):
    if abs(s - 1) < 1e-3:
        return a
    H, W = a.shape[:2]
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    w, h = W / s, H / s
    x0 = min(max(cx * W - w / 2, 0), W - w)
    y0 = min(max(cy * H - h / 2, 0), H - h)
    im = im.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + w, y0 + h))
    return np.asarray(im, dtype=np.float32) / 255.0


def leak_layer(leaks, t, W, H):
    acc = None
    for L in leaks:
        if not (L['t0'] <= t <= L['t1']):
            continue
        u = (t - L['t0']) / max(1e-6, L['t1'] - L['t0'])
        a = L.get('amp', 0.35) * math.sin(math.pi * u) ** 2
        if a <= 0.002:
            continue
        w, h = W // 8, H // 8
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        dx, dy = L.get('drift', [0.1, 0])
        cx = (L['x'] + dx * u) * w
        cy = (L['y'] + dy * u) * h
        r = L.get('r', 0.35) * w
        g = np.exp(-(((xx - cx) ** 2) * L.get('sx', 1.0) + ((yy - cy) ** 2) * L.get('sy', 1.0)) / (2 * r * r))
        col = np.array(L.get('color', [255, 160, 80]), np.float32) / 255.0
        lay = g[..., None] * col[None, None, :] * a
        acc = lay if acc is None else acc + lay
    if acc is None:
        return None
    im = Image.fromarray((np.clip(acc, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)
    return np.asarray(im, dtype=np.float32) / 255.0


def compose(TL, k, size, titles_dir, title_idx):
    E, fps = TL.E, TL.fps
    W, H = size
    t = k / fps
    shots = E['shots']
    i = TL.shot_at(t)
    s = shots[i]
    img = None
    # transitions around the cut INTO shot i (t just after) or INTO shot i+1 (t just before)
    tr_in = s.get('tin') if i > 0 else None
    nxt = shots[i + 1] if i + 1 < len(shots) else None
    tr_out = nxt.get('tin') if nxt else None
    base = lambda sh, tt: load(TL.frame(sh, tt), size)
    done = False
    for tr, A, Bsh, T in ((tr_in, shots[i - 1] if i > 0 else None, s, s['at']), (tr_out, s, nxt, nxt['at'] if nxt else 0)):
        if not tr or done or A is None or Bsh is None:
            continue
        d = tr.get('dur', 0.3)
        typ = tr.get('type', 'cut')
        if typ in ('zoom', 'dissolve'):
            if T - d / 2 <= t < T + d / 2:
                u = (t - (T - d / 2)) / d
                a_img, b_img = base(A, t), base(Bsh, t)
                if typ == 'zoom':
                    cx, cy = tr.get('cx', 0.5), tr.get('cy', 0.5)
                    a_img = zoom(a_img, 1 + tr.get('za', 1.6) * u ** 2, cx, cy)
                    b_img = zoom(b_img, 1 + tr.get('zb', 0.45) * (1 - u) ** 2, tr.get('bx', 0.5), tr.get('by', 0.5))
                    bright = tr.get('glow', 0.25) * math.sin(math.pi * u)
                    m = smooth((u - 0.25) / 0.5)
                    img = a_img * (1 - m) + b_img * m
                    img = 1 - (1 - img) * (1 - bright * np.array(tr.get('glowColor', [1.0, 0.85, 0.6]), np.float32))
                else:
                    m = smooth(u)
                    img = a_img * (1 - m) + b_img * m
                done = True
        elif typ == 'whip':
            if T - d / 2 <= t < T + d / 2:
                dirn = tr.get('dir', 1)
                if t < T:
                    u = (t - (T - d / 2)) / (d / 2)  # 0..1 into the cut
                    im0 = base(A, t)
                    img = shift(hblur(im0, 2 + 220 * u ** 2), -dirn * W * 0.35 * u ** 2)
                else:
                    u = 1 - (t - T) / (d / 2)  # 1..0 out of the cut
                    im0 = base(Bsh, t)
                    img = shift(hblur(im0, 2 + 220 * u ** 2), dirn * W * 0.35 * u ** 2)
                done = True
        elif typ in ('flash', 'dip'):
            if T - d / 2 <= t < T + d / 2:
                im0 = base(A if t < T else Bsh, t)
                u = 1 - abs(t - T) / (d / 2)
                if typ == 'flash':
                    img = im0 + (1 - im0) * (u ** 1.5) * tr.get('amt', 0.9)
                else:
                    img = im0 * (1 - u ** 1.2)
                done = True
    if img is None:
        img = base(s, t)
    # light leaks (screen)
    lk = leak_layer(E.get('leaks', []), t, W, H)
    if lk is not None:
        img = 1 - (1 - np.clip(img, 0, 1)) * (1 - lk)
    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    if k in title_idx:
        ov = Image.open(os.path.join(titles_dir, 't%05d.png' % k)).convert('RGBA')
        if ov.size != (W, H):
            ov = ov.resize((W, H), Image.NEAREST)
        out = out.convert('RGBA')
        out.alpha_composite(ov)
        out = out.convert('RGB')
    return out


def mix_audio(E, TL, total, wav):
    n = int((total + 0.5) * SR)
    music = np.zeros((n, 2), np.float32)
    game = np.zeros((n, 2), np.float32)
    ext = np.zeros((n, 2), np.float32)
    lib = json.load(open(os.path.join(HERE, 'sfxlib.json')))
    for m in E.get('music', []):
        sig = B.decode(B.rel(m['file']), m.get('from', 0), m['to'] - m.get('from', 0))
        sig = B.fades(sig, m.get('fade_in', 0), m.get('fade_out', 0))
        B.add(music, sig, m['at'], B.db(m.get('gain_db', 0)))
    env = np.ones(n, np.float32)
    for d in E.get('duck', []):
        a, b = int(d['from'] * SR), int(d['to'] * SR)
        ramp = int(0.15 * SR)
        g = B.db(d['db'])
        seg = np.full(max(0, b - a), g, np.float32)
        if len(seg) > 2 * ramp:
            seg[:ramp] = np.linspace(1, g, ramp)
            seg[-ramp:] = np.linspace(g, 1, ramp)
        env[a:a + len(seg)] = np.minimum(env[a:a + len(seg)], seg[: max(0, min(len(seg), n - a))])
    music *= env[:, None]

    def cue(name, at, gain_db=0.0, rate=1.0):
        L = lib.get(name)
        if not L:
            print('  ! unknown sfx', name)
            return
        sig = B.decode(B.rel(L['file']), L.get('from', 0), L.get('dur'), rate * L.get('rate', 1))
        sig = B.fades(sig, L.get('fade_in', 0.003), L.get('fade_out', 0.02))
        B.add(ext, sig, at - L.get('lead', 0), B.db(L.get('gain_db', 0) + gain_db))

    for s in E['shots']:
        gw = os.path.join(s['dir'], 'game.wav')
        if os.path.exists(gw) and s.get('game', True):
            sig = B.decode(gw, s['in'], s['len'] + 0.5)
            sig = B.fades(sig, 0.01, 0.0)
            k = int(s['len'] * SR)
            tail = sig[k:]
            if len(tail):
                tail *= np.linspace(1, 0, len(tail))[:, None] ** 3
            sig[k:] = tail
            B.add(game, sig, s['at'], B.db(E.get('game_gain_db', 0) + s.get('game_db', 0)))
        aj = os.path.join(s['dir'], 'audio.json')
        if os.path.exists(aj) and s.get('ext', True):
            for ev in json.load(open(aj))['audio']:
                if ev['kind'] == 'ext' and s['in'] - 0.05 <= ev['t'] < s['out']:
                    cue(ev['name'], s['at'] + ev['t'] - s['in'], 20 * np.log10(max(1e-4, ev.get('vol', 1))) + E.get('ext_gain_db', 0), ev.get('rate', 1))
    for c in E.get('sfx', []):
        cue(c['name'], c['at'], c.get('gain_db', 0), c.get('rate', 1))
    for r in E.get('mute_game', []):
        a, b = int(r['from'] * SR), int(r['to'] * SR)
        game[a:b] *= 0
    mix = music + game + ext
    for nm, st in (('music', music), ('game', game), ('ext', ext)):
        r = float(np.sqrt(np.mean(st ** 2)) + 1e-12)
        print('  %-5s rms %.1f dBFS  peak %.1f dBFS' % (nm, 20 * np.log10(r), 20 * np.log10(float(np.abs(st).max()) + 1e-9)))
    thr = 0.7
    a = np.abs(mix)
    over = a > thr
    mix[over] = np.sign(mix[over]) * (thr + (1 - thr) * np.tanh((a[over] - thr) / (1 - thr)))
    mix.astype(np.float32).tofile(wav)


LOUD = 'I=-14:TP=-1.5:LRA=11'


def mux(vid, wav, ss, out):
    """Masters the f32 mix to -14 LUFS with two-pass loudnorm (measure, then a linear gain, so the
    level lands on target instead of drifting like the one-pass dynamic mode) and muxes it as AAC."""
    src = ['-ss', str(ss), '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', wav]
    r = subprocess.run([FF, '-hide_banner', '-nostats'] + src + ['-af', 'loudnorm=%s:print_format=json' % LOUD, '-f', 'null', '-'], capture_output=True, text=True, check=True)
    js = r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1]
    m = json.loads(js)
    ln = ('loudnorm=%s:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true'
          % (LOUD, m['input_i'], m['input_tp'], m['input_lra'], m['input_thresh'], m['target_offset']))
    print('  loudness in %s LUFS (tp %s) -> -14' % (m['input_i'], m['input_tp']), flush=True)
    subprocess.run([FF, '-v', 'error', '-y', '-i', vid] + src +
                   ['-map', '0:v:0', '-map', '1:a:0', '-af', ln + ',aresample=192000,lowpass=f=17000,alimiter=limit=0.84:level=false:attack=3:release=60,aresample=%d' % SR,  # limit at 192 kHz: catches inter-sample peaks
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out], check=True)


def main():
    E = json.load(open(sys.argv[1]))
    preview = '--preview' in sys.argv
    fps = E.get('fps', 30)
    frames_root = B.rel(arg('frames', E['frames']))
    out = B.rel(arg('out', E['out']))
    size = tuple(E.get('size', [1920, 1080]))
    TL = Timeline(E, frames_root, fps)
    total = TL.total
    print('timeline %.2f s, %d shots' % (total, len(E['shots'])))
    for s in E['shots']:
        print('  %-14s at %6.2f  len %5.2f  %s' % (s['id'], s['at'], s['len'], (s.get('tin') or {}).get('type', '')))
    tmp = tempfile.mkdtemp(prefix='tbme_b2_')
    if '--remux' in sys.argv:  # audio only: remix + re-master the sound under the existing picture
        vid = os.path.join(tmp, 'video.mp4')
        subprocess.run([FF, '-v', 'error', '-y', '-i', out, '-map', '0:v:0', '-c', 'copy', vid], check=True)
        wav = os.path.join(tmp, 'mix.f32')
        mix_audio(E, TL, total, wav)
        mux(vid, wav, 0.0, out)
        shutil.rmtree(tmp, ignore_errors=True)
        print('remuxed %s  (%.1f MB)' % (out, os.path.getsize(out) / 1e6))
        return
    # overlay track
    titles_dir = os.path.join(tmp, 'titles')
    title_idx = set()
    nfr = int(round(total * fps))
    if E.get('titles'):
        tf = os.path.join(tmp, 'track.json')
        json.dump(E['titles'], open(tf, 'w'))
        subprocess.run(['node', os.path.join(HERE, 'titles.mjs'), tf, titles_dir, '%dx%d' % size, str(nfr), '--scale', str(E.get('title_scale', size[0] / 1280))], check=True, cwd=ROOT)
        title_idx = set(json.load(open(os.path.join(titles_dir, 'index.json'))))
    k0 = int(float(arg('from', 0)) * fps)
    k1 = int(float(arg('to', total)) * fps) if arg('to') else nfr
    seq = os.path.join(tmp, 'seq')
    os.makedirs(seq)
    for j, k in enumerate(range(k0, k1)):
        im = compose(TL, k, size, titles_dir, title_idx)
        im.save(os.path.join(seq, '%06d.jpg' % j), quality=95)
        if j % 300 == 0:
            print('  composed', k, '/', k1, flush=True)
    wav = os.path.join(tmp, 'mix.f32')
    mix_audio(E, TL, total, wav)
    W, H = size
    vf = [E['grade']] if E.get('grade') else []
    if E.get('letterbox'):
        bh = int(round((H - W / E['letterbox']) / 2))
        vf.append('drawbox=x=0:y=0:w=iw:h=%d:color=black:t=fill,drawbox=x=0:y=ih-%d:w=iw:h=%d:color=black:t=fill' % (bh, bh, bh))
    vf.append('format=yuv420p')
    vf = ','.join(vf)
    vid = os.path.join(tmp, 'video.mp4')
    kbps = E.get('kbps', 4200)
    base = [FF, '-v', 'error', '-y', '-framerate', str(fps), '-i', os.path.join(seq, '%06d.jpg'), '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast' if preview else 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', '60']
    if preview:
        subprocess.run(base + ['-crf', '24', vid], check=True)
    else:
        log = os.path.join(tmp, 'x264')
        subprocess.run(base + ['-b:v', '%dk' % kbps, '-pass', '1', '-passlogfile', log, '-an', '-f', 'mp4', os.devnull], check=True)
        subprocess.run(base + ['-b:v', '%dk' % kbps, '-maxrate', '%dk' % int(kbps * 1.8), '-bufsize', '%dk' % int(kbps * 2), '-pass', '2', '-passlogfile', log, vid], check=True)
    mux(vid, wav, k0 / fps, out)
    shutil.rmtree(tmp, ignore_errors=True)
    print('wrote %s  (%.1f MB, %.2f s)' % (out, os.path.getsize(out) / 1e6, (k1 - k0) / fps))


if __name__ == '__main__':
    main()
