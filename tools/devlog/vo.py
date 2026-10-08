"""Voice-over for the devlog days: tools/devlog/vo/script.json -> vo/<day>.wav + vo/<day>.json.

  HOME=<dir with an espeak-ng-data link> python -I tools/devlog/vo.py <kokoro.onnx> <voices.npz> day01 [day02 ...]
  HOME=<...> python -I tools/devlog/vo.py --own day01 my-day01.wav [day02 my-day02.wav ...]
  HOME=<...> python -I tools/devlog/vo.py --retime day01 [day02 ...]   (word timings again, same audio)

Every line is spoken by Kokoro-82M (kokoro-onnx, one sentence at a time so it keeps its natural
intonation), trimmed, and laid end to end with the gap the script asks for. Word timings for the
captions: the line's audio is split at its pauses (low-energy runs), the pauses are matched to the
punctuation in the text, and inside each phrase every word gets time in proportion to its phonemes.

--own: your own recording of a day's lines instead (one take, in script order, a short pause
between lines). The lines are found at the pauses that best match where each line should end, the
words are timed the same way, and your audio is kept as it is (the edit follows your pacing).

The JSON: { length, lines: { id: { t0, t1, words: [[word, t0, t1], ...] } }, order: [ids] }.
"""
import json
import os
import re
import sys

import espeakng_loader
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from phonemizer.backend import EspeakBackend
from phonemizer.backend.espeak.wrapper import EspeakWrapper

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = json.load(open(os.path.join(HERE, 'vo', 'script.json')))
OWN = sys.argv[1] == '--own'
RETIME = sys.argv[1] == '--retime'
if OWN:
    pairs = sys.argv[2:]
    days = pairs[0::2]
elif RETIME:
    days = sys.argv[2:]
else:
    model, voices, *days = sys.argv[1:]
    kok = Kokoro(model, voices)
# the espeak-ng that ships with kokoro-onnx (espeakng_loader), also when Kokoro isn't loaded (--own)
EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
EspeakWrapper.set_library(espeakng_loader.get_library_path())
ph = EspeakBackend('en-us', preserve_punctuation=False, with_stress=False)
SR = 24000
HOP = 240  # 10 ms


def frames_rms(x, hop=HOP):
    n = len(x) // hop
    f = x[: n * hop].reshape(n, hop)
    return np.sqrt((f ** 2).mean(axis=1) + 1e-12)


def voiced_runs(x, thr_k=0.06, min_gap=0.09, sr=SR):
    """[(start_s, end_s)] of speech, split wherever it goes quiet for >= min_gap."""
    hop = sr // 100
    r = frames_rms(x, hop)
    thr = max(r.max() * thr_k, 1e-3)
    on = r > thr
    runs, i, n = [], 0, len(on)
    while i < n:
        if not on[i]:
            i += 1
            continue
        j = i
        while j < n and on[j]:
            j += 1
        runs.append([i, j])
        i = j
    merged = []
    for a, b in runs:
        if merged and (a - merged[-1][1]) * hop / sr < min_gap:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    return [(a * hop / sr, b * hop / sr) for a, b in merged]


def phones(word):
    w = re.sub(r"[^\w']", '', word)
    if not w:
        return 1
    p = ph.phonemize([w], strip=True)[0].replace(' ', '')
    return max(1, len(p))


def word_times(text, runs, dur):
    words = text.split()
    w_ph = [phones(w) + 1.5 for w in words]  # + a little per word for the transitions
    # phrases end at punctuation
    phrases, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        wc = w.replace('*', '')  # *word* = shouted (the bubble shows it big; the voice just reads it)
        if re.search(r'[,.!?;:…]$', wc) or wc.endswith('...'):
            phrases.append(cur)
            cur = []
    if cur:
        phrases.append(cur)
    t0, t1 = (runs[0][0], runs[-1][1]) if runs else (0.0, dur)
    total = sum(w_ph)
    # expected phrase boundaries (by phoneme share), snapped to the nearest real pause
    gaps = [(runs[k][1], runs[k + 1][0]) for k in range(len(runs) - 1)]
    bounds = []
    acc = 0
    prev = t0
    for n, p in enumerate(phrases[:-1]):
        acc += sum(w_ph[i] for i in p)
        exp = t0 + (t1 - t0) * acc / total
        best = None
        for g in gaps:
            if g[0] < prev + 0.12:  # in order: after the previous phrase, which keeps some length
                continue
            c = (g[0] + g[1]) / 2
            if abs(c - exp) < 0.45 and (best is None or abs(c - exp) < abs((best[0] + best[1]) / 2 - exp)):
                best = g
        if best is None:
            e = min(max(exp, prev + 0.12), t1 - 0.12 * (len(phrases) - 1 - n))
            best = (e, e)
        bounds.append(best)
        prev = best[1]
    out = []
    starts = [t0] + [b[1] for b in bounds]
    ends = [b[0] for b in bounds] + [t1]
    for p, s, e in zip(phrases, starts, ends):
        tot = sum(w_ph[i] for i in p)
        t = s
        for i in p:
            d = (e - s) * w_ph[i] / tot
            out.append([words[i], round(t, 3), round(t + d, 3)])
            t += d
    return out


def own_day(day, path):
    """Time the script's lines and words in your own recording of the day."""
    lines = SCRIPT['days'][day]
    audio, sr = sf.read(path, dtype='float32', always_2d=True)
    audio = audio.mean(axis=1)
    peak = float(np.abs(audio).max()) or 1.0
    runs = voiced_runs(audio / peak, thr_k=0.08, min_gap=0.12, sr=sr)
    if len(runs) < len(lines):
        sys.exit(f'{day}: found {len(runs)} bits of speech for {len(lines)} lines: leave a short pause between lines')
    t0, t1 = runs[0][0], runs[-1][1]
    # where each line should end, by its share of the phonemes
    w = [sum(phones(x) + 1.5 for x in spec[1].split()) for spec in lines]
    exp = [t0 + (t1 - t0) * sum(w[:k + 1]) / sum(w) for k in range(len(lines) - 1)]
    gaps = [(runs[k][1], runs[k + 1][0]) for k in range(len(runs) - 1)]
    # pick len(lines)-1 gaps in order: long pauses near the expected line ends win
    G, L = len(gaps), len(exp)
    score = lambda g, k: (gaps[g][1] - gaps[g][0]) - 0.35 * abs((gaps[g][0] + gaps[g][1]) / 2 - exp[k])
    best = [[-1e9] * G for _ in range(L)]
    back = [[-1] * G for _ in range(L)]
    for g in range(G):
        best[0][g] = score(g, 0)
    for k in range(1, L):
        run, arg = -1e9, -1
        for g in range(G):
            if g > 0 and best[k - 1][g - 1] > run:
                run, arg = best[k - 1][g - 1], g - 1
            if arg >= 0:
                best[k][g] = run + score(g, k)
                back[k][g] = arg
    g = max(range(G), key=lambda j: best[L - 1][j]) if L else -1
    cut = []
    for k in range(L - 1, -1, -1):
        cut.append(g)
        g = back[k][g]
    cut = cut[::-1]
    spans, s0 = [], t0
    for gi in cut:
        spans.append((s0, gaps[gi][0]))
        s0 = gaps[gi][1]
    spans.append((s0, t1))
    meta, order = {}, []
    for spec, (a, b) in zip(lines, spans):
        lid, text = spec[0], spec[1]
        lr = [(max(r0, a) - a, min(r1, b) - a) for r0, r1 in runs if r1 > a and r0 < b]
        words = word_times(text, lr, b - a)
        meta[lid] = {'t0': round(a, 3), 't1': round(b, 3), 'text': text, 'words': [[x, round(a + w0, 3), round(a + w1, 3)] for x, w0, w1 in words]}
        order.append(lid)
        print(f'{day} {lid:10s} {a:6.2f}-{b:6.2f}  {text}', flush=True)
    sf.write(os.path.join(HERE, 'vo', f'{day}.wav'), audio, sr)
    json.dump({'length': round(len(audio) / sr, 3), 'voice': 'own', 'lines': meta, 'order': order},
              open(os.path.join(HERE, 'vo', f'{day}.json'), 'w'), indent=1)
    print(day, 'length', round(len(audio) / sr, 2), 's', flush=True)


def retime_day(day):
    """Word timings again from the day's existing audio and line spans (the audio is untouched)."""
    path = os.path.join(HERE, 'vo', f'{day}.json')
    m = json.load(open(path))
    audio, sr = sf.read(os.path.join(HERE, 'vo', f'{day}.wav'), dtype='float32', always_2d=True)
    audio = audio.mean(axis=1)
    for lid in m['order']:
        l = m['lines'][lid]
        clip = audio[int(round(l['t0'] * sr)): int(round(l['t1'] * sr))]
        runs = voiced_runs(clip, sr=sr) if m.get('voice') != 'own' else voiced_runs(clip / (float(np.abs(audio).max()) or 1.0), thr_k=0.08, min_gap=0.12, sr=sr)
        words = word_times(l['text'], runs, len(clip) / sr)
        l['words'] = [[w, round(l['t0'] + w0, 3), round(l['t0'] + w1, 3)] for w, w0, w1 in words]
    json.dump(m, open(path, 'w'), indent=1)
    print(day, 'retimed', flush=True)


if OWN:
    for day, path in zip(pairs[0::2], pairs[1::2]):
        own_day(day, path)
    sys.exit(0)
if RETIME:
    for day in days:
        retime_day(day)
    sys.exit(0)

for day in days:
    lines = SCRIPT['days'][day]
    pieces, meta, order = [], {}, []
    t = 0.0
    for spec in lines:
        lid, text = spec[0], spec[1]
        gap = spec[2] if len(spec) > 2 else SCRIPT['gap']
        audio, sr = kok.create(text.replace('*', ''), voice=SCRIPT['voice'], speed=SCRIPT['speed'], lang='en-us')
        assert sr == SR
        audio = np.asarray(audio, dtype=np.float32)
        runs = voiced_runs(audio)
        a = max(0.0, runs[0][0] - 0.03) if runs else 0.0
        b = min(len(audio) / SR, runs[-1][1] + 0.06) if runs else len(audio) / SR
        clip = audio[int(a * SR): int(b * SR)]
        runs = [(r0 - a, r1 - a) for r0, r1 in runs]
        words = word_times(text, runs, len(clip) / SR)
        meta[lid] = {'t0': round(t, 3), 't1': round(t + len(clip) / SR, 3), 'text': text,
                     'words': [[w, round(t + w0, 3), round(t + w1, 3)] for w, w0, w1 in words]}
        order.append(lid)
        pieces.append(clip)
        t += len(clip) / SR
        pad = np.zeros(int(gap * SR), dtype=np.float32)
        pieces.append(pad)
        t += gap
        print(f'{day} {lid:10s} {meta[lid]["t0"]:6.2f}-{meta[lid]["t1"]:6.2f}  {text}', flush=True)
    wav = np.concatenate(pieces)
    sf.write(os.path.join(HERE, 'vo', f'{day}.wav'), wav, SR)
    json.dump({'length': round(len(wav) / SR, 3), 'voice': SCRIPT['voice'], 'lines': meta, 'order': order},
              open(os.path.join(HERE, 'vo', f'{day}.json'), 'w'), indent=1)
    print(day, 'length', round(len(wav) / SR, 2), 's', flush=True)
