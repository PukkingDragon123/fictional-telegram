#!/usr/bin/env python3
"""Cut the rendered shots together and mix the soundtrack -> an H.264 + AAC mp4.

    python3 tools/video/build.py tools/video/edl_promo.json [--preview] [--no-video]

Edit list (JSON):
  out            output mp4 path (relative to the repo root)
  frames         directory holding one frames dir per shot (render.mjs --out <frames>/<id>)
  size           [w, h] of the output (frames are scaled with nearest-neighbour: crisp pixels)
  kbps           target video bitrate (2-pass), keeps the file size predictable
  shots          [{ id, in, out, src? }]  in/out = seconds of that shot's own clock;
                 they play back to back (src = frames dir name if different from id)
  music          [{ file, at, from, to, gain_db, fade_in, fade_out }]   at = timeline seconds
  duck           [{ from, to, db }]  music gain dips (timeline seconds)
  sfx            [{ name, at, gain_db?, rate? }]  extra cues from the SFX library, timeline seconds
  game_gain_db   level of the game's own SFX + babble (rendered by sfx.mjs into <shot>/game.wav)
  ext_gain_db    level of the shots' own external cues (c.sfx(...) in shots_*.js)
  mute_game      [{ from, to }] timeline ranges where the game audio is silenced
Library: tools/video/sfxlib.json maps cue names to files (+ trim / gain).
Downloaded files are only read (decoded by ffmpeg), never executed.
"""
import json, os, subprocess, sys, shutil, tempfile
import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SR = 48000
FPS = 30
# third-party audio (music + SFX downloads), see promo/video/CREDITS.txt
os.environ.setdefault('DL', '/tmp/claude-0/-home-user-fictional-telegram/6488fa50-ab23-5a01-b3f9-ea75799e5abf/scratchpad/dl')


def rel(p):
    p = os.path.expandvars(os.path.expanduser(p))
    return p if os.path.isabs(p) else os.path.join(ROOT, p)


def decode(path, start=0.0, dur=None, rate=1.0):
    """Any audio file -> float32 stereo array (n, 2) at SR (optionally sped up by `rate`)."""
    cmd = [FF, '-v', 'error', '-ss', str(max(0.0, start))]
    if dur is not None:
        cmd += ['-t', str(dur * rate)]
    cmd += ['-i', path]
    if abs(rate - 1) > 1e-3:
        cmd += ['-af', 'asetrate=%d,aresample=%d' % (int(SR * rate), SR)]
    cmd += ['-ac', '2', '-ar', str(SR), '-f', 'f32le', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def db(x):
    return 10 ** (x / 20)


def add(mix, sig, at, gain=1.0):
    i0 = int(round(at * SR))
    if i0 < 0:
        sig = sig[-i0:]
        i0 = 0
    n = min(len(sig), len(mix) - i0)
    if n > 0:
        mix[i0:i0 + n] += sig[:n] * gain


def fades(sig, fin, fout):
    n = len(sig)
    if fin > 0:
        k = min(n, int(fin * SR))
        sig[:k] *= np.linspace(0, 1, k)[:, None]
    if fout > 0:
        k = min(n, int(fout * SR))
        sig[n - k:] *= np.linspace(1, 0, k)[:, None]
    return sig


def main():
    edl_path = sys.argv[1]
    preview = '--preview' in sys.argv
    E = json.load(open(edl_path))
    lib = json.load(open(os.path.join(os.path.dirname(__file__), 'sfxlib.json')))
    frames_root = rel(E['frames'])
    if '--frames' in sys.argv:
        frames_root = rel(sys.argv[sys.argv.index('--frames') + 1])
    if '--out' in sys.argv:
        E['out'] = sys.argv[sys.argv.index('--out') + 1]
    shots = E['shots']
    t = 0.0
    for s in shots:
        s['at'] = t
        s['len'] = s['out'] - s['in']
        t += s['len']
    total = t
    print('timeline %.2f s, %d shots' % (total, len(shots)))
    for s in shots:
        print('  %-14s at %6.2f  len %5.2f' % (s['id'], s['at'], s['len']))
    n = int((total + 0.5) * SR)
    music = np.zeros((n, 2), np.float32)
    game = np.zeros((n, 2), np.float32)
    ext = np.zeros((n, 2), np.float32)

    # music
    for m in E.get('music', []):
        sig = decode(rel(m['file']), m.get('from', 0), m['to'] - m.get('from', 0))
        sig = fades(sig, m.get('fade_in', 0), m.get('fade_out', 0))
        add(music, sig, m['at'], db(m.get('gain_db', 0)))
    env = np.ones(n, np.float32)
    for d in E.get('duck', []):
        a, b = int(d['from'] * SR), int(d['to'] * SR)
        ramp = int(0.15 * SR)
        g = db(d['db'])
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
        sig = decode(rel(L['file']), L.get('from', 0), L.get('dur'), rate * L.get('rate', 1))
        sig = fades(sig, L.get('fade_in', 0.003), L.get('fade_out', 0.02))
        add(ext, sig, at - L.get('lead', 0), db(L.get('gain_db', 0) + gain_db))

    # per shot: game audio + the shot's own external cues
    for s in shots:
        d = os.path.join(frames_root, s.get('src', s['id']))
        gw = os.path.join(d, 'game.wav')
        if os.path.exists(gw):
            sig = decode(gw, s['in'], s['len'] + 0.8)
            sig = fades(sig, 0.004, 0.0)
            # hard cut at the shot end, short tail fade
            k = int(s['len'] * SR)
            tail = sig[k:]
            tail *= np.linspace(1, 0, len(tail))[:, None] ** 3 if len(tail) else 1
            sig[k:] = tail
            add(game, sig, s['at'], db(E.get('game_gain_db', 0) + s.get('game_db', 0)))
        else:
            print('  ! no game.wav for', s['id'])
        aj = os.path.join(d, 'audio.json')
        if os.path.exists(aj):
            for ev in json.load(open(aj))['audio']:
                if ev['kind'] == 'ext' and s['in'] - 0.05 <= ev['t'] < s['out']:
                    cue(ev['name'], s['at'] + ev['t'] - s['in'], 20 * np.log10(max(1e-4, ev.get('vol', 1))) + E.get('ext_gain_db', 0), ev.get('rate', 1))
    for c in E.get('sfx', []):
        cue(c['name'], c['at'], c.get('gain_db', 0), c.get('rate', 1))
    for r in E.get('mute_game', []):
        a, b = int(r['from'] * SR), int(r['to'] * SR)
        game[a:b] *= 0

    mix = music + game + ext
    # soft-knee limiter on the sum
    peak = float(np.abs(mix).max())
    print('raw peak %.1f dBFS' % (20 * np.log10(peak + 1e-9)))
    thr = 0.7
    a = np.abs(mix)
    over = a > thr
    mix[over] = np.sign(mix[over]) * (thr + (1 - thr) * np.tanh((a[over] - thr) / (1 - thr)))
    out = rel(E['out'])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='tbme_build_')
    wav = os.path.join(tmp, 'mix.f32')
    mix.astype(np.float32).tofile(wav)
    # stems for checking
    for nm, st in (('music', music), ('game', game), ('ext', ext)):
        r = float(np.sqrt(np.mean(st ** 2)) + 1e-12)
        print('  %-5s rms %.1f dBFS  peak %.1f dBFS' % (nm, 20 * np.log10(r), 20 * np.log10(float(np.abs(st).max()) + 1e-9)))

    if '--no-video' in sys.argv:
        audio_out = out.replace('.mp4', '.wav')
        subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', wav, '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11,alimiter=limit=0.8:level=false', '-ar', str(SR), audio_out], check=True)
        print('wrote', audio_out)
        return

    # video: sequential symlinks to the chosen frames
    seq = os.path.join(tmp, 'seq')
    os.makedirs(seq)
    black = os.path.join(tmp, 'black.jpg')
    subprocess.run([FF, '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720', '-frames:v', '1', black], check=True)
    k = 0
    missing = 0
    for s in shots:
        d = os.path.join(frames_root, s.get('src', s['id']))
        i0 = int(round(s['in'] * FPS))
        nfr = int(round(s['len'] * FPS))
        last = None
        for i in range(i0, i0 + nfr):
            f = os.path.join(d, 'f%05d.jpg' % i)
            if not os.path.exists(f):
                # previews: hold the latest available frame
                cand = [x for x in range(i, max(-1, i - 60), -1) if os.path.exists(os.path.join(d, 'f%05d.jpg' % x))]
                f = os.path.join(d, 'f%05d.jpg' % cand[0]) if cand else last
                missing += 1
            if f is None:
                f = black
            last = f
            os.symlink(f, os.path.join(seq, '%06d.jpg' % k))
            k += 1
    print('frames %d (%d held/missing)' % (k, missing))
    W, H = E.get('size', [1920, 1080])
    vf = 'scale=%d:%d:flags=neighbor,format=yuv420p' % (W, H)
    vid = os.path.join(tmp, 'video.mp4')
    kbps = E.get('kbps', 4200)
    base = [FF, '-v', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(seq, '%06d.jpg'), '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast' if preview else 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', '60', '-tune', 'animation']
    if preview:
        subprocess.run(base + ['-crf', '26', vid], check=True)
    else:
        log = os.path.join(tmp, 'x264')
        subprocess.run(base + ['-b:v', '%dk' % kbps, '-pass', '1', '-passlogfile', log, '-an', '-f', 'mp4', os.devnull], check=True)
        subprocess.run(base + ['-b:v', '%dk' % kbps, '-maxrate', '%dk' % int(kbps * 1.8), '-bufsize', '%dk' % int(kbps * 2), '-pass', '2', '-passlogfile', log, vid], check=True)
    subprocess.run([FF, '-v', 'error', '-y', '-i', vid, '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', wav,
                    '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11,aresample=%d,alimiter=limit=0.8:level=false:attack=3:release=60' % SR, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                    '-movflags', '+faststart', '-shortest', out], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    sz = os.path.getsize(out) / 1e6
    print('wrote %s  (%.1f MB, %.2f s)' % (out, sz, total))


if __name__ == '__main__':
    main()
