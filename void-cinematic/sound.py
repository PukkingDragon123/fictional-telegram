"""The soundtrack, synthesized: a low drone under the lore, wind and birds in
the valley, the mountain cracking, the swarm's buzz swelling as the body
forms, a bright ring when the eyes light, every footfall (and every splash on
the water), the sky tearing, a held breath on its face, a gong under the title.

    python sound.py out.wav
"""
import math
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter, fftconvolve

from cinematic import END, ST, SW, T_CRACK, T_GROW, T_EYES, T_RUN, TEAR, smooth

SR = 44100
N = int(END * SR)
t = np.arange(N) / SR
rng = np.random.RandomState(5)


def env(a, b, fade=0.5):
    """1 between times a and b, easing in and out."""
    return smooth(a - fade, a + fade, t) * (1 - smooth(b - fade, b + fade, t))


def lp(x, hz, order=2):
    b, a = butter(order, hz / (SR / 2), 'low')
    return lfilter(b, a, x)


def hp(x, hz, order=2):
    b, a = butter(order, hz / (SR / 2), 'high')
    return lfilter(b, a, x)


def bp(x, lo, hi):
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return lfilter(b, a, x)


def hit(t0, dur, fn):
    """A one-shot sound fn(local_t) placed at t0."""
    out = np.zeros(N)
    i0 = int(t0 * SR)
    n = min(int(dur * SR), N - i0)
    if n > 0:
        out[i0:i0 + n] = fn(np.arange(n) / SR)
    return out


def drone():
    d = smooth(19, 50, t) * 0.7
    out = np.zeros(N)
    for f, a in ((55, 1.0), (82.4, 0.6), (110, 0.35), (58.3, 0.5 * d)):         # the last one sours as it comes
        out += a * np.sin(2 * math.pi * f * t + 2 * np.sin(2 * math.pi * 0.07 * t))
    lvl = 0.17 * env(0, 9.5, 0.8) + 0.05 * env(9.5, 12.5) + (0.09 + 0.16 * d) * env(13, 50, 0.6) + \
        0.14 * env(50, 55.5, 0.05)
    return out * lvl


def wind():
    n = lp(rng.normal(size=N), 500)
    sweep = 0.6 + 0.4 * np.sin(2 * math.pi * 0.11 * t)
    return n * sweep * (0.12 * env(9.5, 12.5, 0.3) + 0.08 * env(12.5, 50, 0.3))


def birds():
    out = np.zeros(N)
    for k in range(9):
        t0 = 9.8 + k * 0.31 + rng.uniform(0, 0.2)
        f0 = rng.uniform(2600, 3800)
        out += hit(t0, 0.12, lambda x, f0=f0: np.sin(2 * math.pi * (f0 + 900 * np.sin(x * 60)) * x)
                   * np.sin(math.pi * x / 0.12) ** 2 * 0.05)
    return out * (1 - smooth(12.6, 13.1, t))


def boom(t0, amp=1.0, f=34):
    def fn(x):
        body = np.sin(2 * math.pi * f * x * (1 - 0.3 * x)) * np.exp(-x / 0.9)
        crack = rng.normal(size=len(x)) * np.exp(-x / 0.08)
        return amp * (0.9 * body + 0.35 * lp(crack, 1800))
    return hit(t0, 3.5, fn)


def swarm():
    """Thousands of wings: detuned buzzing, swelling while the body is built."""
    out = np.zeros(N)
    for k in range(14):
        f = rng.uniform(170, 260)
        ph = rng.uniform(0, 6.3)
        saw = 2 * ((f * t + ph) % 1) - 1
        out += saw * (0.6 + 0.4 * np.sin(2 * math.pi * rng.uniform(5, 13) * t + ph))
    out = bp(out, 150, 2400) / 14
    lvl = 0.4 * smooth(T_CRACK, T_CRACK + 2, t) * (1 - smooth(T_GROW[1] - 0.5, T_GROW[1] + 1.2, t)) + \
        0.35 * smooth(T_GROW[0], T_GROW[1] - 1, t) * (1 - smooth(T_GROW[1] - 0.5, T_GROW[1] + 1.2, t))
    muff = lp(out, 600)
    card = env(15.5, 19.0, 0.2)                                     # muffled behind the lore card
    return (out * (1 - card) + muff * card * 1.4) * lvl + out * 0.05 * env(T_RUN, 50, 1.0)


def eyes():
    fn = lambda x: (np.sin(2 * math.pi * 1760 * x) * 0.5 + np.sin(2 * math.pi * 2637 * x) * 0.3 +
                    np.sin(2 * math.pi * 3520 * x) * 0.2) * np.exp(-x / 1.1) * (1 - np.exp(-x / 0.01)) * 0.18
    return hit(T_EYES, 3.0, fn) + boom(T_EYES, 0.35, 45)


def steps():
    out = np.zeros(N)
    for i in range(1, len(ST)):
        if not (T_RUN < ST[i] < 50):
            continue
        out += boom(ST[i], 0.3, 38)
        if SW[i]:                                                   # into the water
            out += hit(ST[i], 1.2, lambda x: hp(rng.normal(size=len(x)), 900) * np.exp(-x / 0.25) * 0.22)
    return out


def tear():
    n = rng.normal(size=N)
    rip = bp(n, 300, 5000) * (0.5 + 0.5 * np.abs(np.sin(2 * math.pi * 3.1 * t)) ** 3)
    return rip * 0.13 * smooth(TEAR[0], TEAR[1], t) * (1 - smooth(49.95, 50.0, t))


def face():
    """A held breath: slow, low air in and out."""
    br = lp(rng.normal(size=N), 300) * (0.5 + 0.5 * np.sin(2 * math.pi * 0.35 * t - 1)) ** 2
    return br * 0.25 * env(50.0, 55.5, 0.05)


def gong(t0):
    def fn(x):
        s = sum(a * np.sin(2 * math.pi * f * x) * np.exp(-x / d) for f, a, d in
                ((65.4, 1.0, 4.5), (98.7, 0.5, 3.5), (156.2, 0.35, 2.6), (233.1, 0.2, 1.8), (311.8, 0.12, 1.2)))
        return s * (1 - np.exp(-x / 0.004)) * 0.3
    return hit(t0, END - t0, fn)


def reverb(x, secs=2.6):
    n = int(secs * SR)
    ir = rng.normal(size=n) * np.exp(-np.arange(n) / SR / (secs / 5))
    ir[0] = 1
    return fftconvolve(x, lp(ir, 4000) / np.sqrt((ir ** 2).sum()) * 6)[:N]


def mix():
    dry = drone() + wind() + birds() + boom(T_CRACK, 1.0, 30) + swarm() + eyes() + steps() + tear() + face() + \
        gong(55.5)
    dry *= 1 - (smooth(49.98, 50.0, t) * (1 - smooth(50.0, 50.4, t)))   # a beat of silence at the cut
    wet = reverb(dry)
    L = dry * 0.8 + wet * 0.35
    R = np.roll(dry, int(0.011 * SR)) * 0.8 + np.roll(wet, int(0.017 * SR)) * 0.35
    out = np.stack([L, R], 1) * (1 - smooth(END - 1.0, END - 0.05, t))[:, None]
    out = np.tanh(out / np.abs(out).max() * 1.3) * 0.9                # a little soft clipping, then -1 dB
    return out


if __name__ == '__main__':
    wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'gaki.wav', SR, (mix() * 32767).astype(np.int16))
