"""The soundtrack, synthesized: a night lake (crickets, lapping water, wind)
that falls silent at the tremor; bats screeching off; the drone underneath;
mandible clicks; a shrill note when the eyes catch; the slams on the ridge
with rock sliding after them; each footfall, each splash; wood creaking and
earth tearing as the pine comes out; the crack when it snaps; the screams;
a breath; the cut to silence; a low hit under the title.

    python sound.py out.wav
"""
import math
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter, fftconvolve

from rampage import END, T_TREMOR, T_SLAM, T_RIP, T_SNAP, steps_between

SR = 44100
N = int(END * SR)
t = np.arange(N) / SR
rng = np.random.RandomState(9)


def ramp(a, b):
    u = np.clip((t - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def env(a, b, fade=0.4):
    return ramp(a - fade, a + fade) * (1 - ramp(b - fade, b + fade))


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
    out = np.zeros(N)
    i0 = int(t0 * SR)
    n = min(int(dur * SR), N - i0)
    if n > 0:
        out[i0:i0 + n] = fn(np.arange(n) / SR)
    return out


def night():
    """Crickets and the lake, until the ground starts to shake."""
    quiet = 1 - ramp(T_TREMOR + 0.1, T_TREMOR + 0.35)
    chirp = np.sin(2 * math.pi * 4300 * t) * (np.sin(2 * math.pi * 28 * t) > 0.3) * \
        (np.sin(2 * math.pi * 1.7 * t) > 0.2)
    chirp2 = np.sin(2 * math.pi * 3900 * t + 1) * (np.sin(2 * math.pi * 31 * t + 2) > 0.4) * \
        (np.sin(2 * math.pi * 1.3 * t + 1) > 0.1)
    water = bp(rng.normal(size=N), 200, 900) * (0.6 + 0.4 * np.sin(2 * math.pi * 0.4 * t)) ** 2
    wind = lp(rng.normal(size=N), 400) * (0.5 + 0.5 * np.sin(2 * math.pi * 0.07 * t))
    return (0.08 * (chirp + chirp2) + 0.12 * water) * quiet * env(0, 11, 0.8) + 0.08 * wind


def drone():
    d = ramp(9, 50) * 0.8
    out = np.zeros(N)
    for f, a in ((41.2, 1.0), (61.7, 0.55), (82.4, 0.35), (43.6, 0.6 * d)):
        out += a * np.sin(2 * math.pi * f * t + 1.5 * np.sin(2 * math.pi * 0.05 * t))
    return out * (0.02 * env(0, 9, 0.5) + (0.08 + 0.12 * d) * env(9, 59.35, 0.5))


def rumble(t0, dur, amp):
    return hit(t0, dur, lambda x: lp(rng.normal(size=len(x)), 60) * np.sin(math.pi * x / dur) * amp * 14)


def boom(t0, amp=1.0, f=34, rocks=0.0):
    def fn(x):
        body = np.sin(2 * math.pi * f * x * (1 - 0.3 * x)) * np.exp(-x / 0.9)
        crack = lp(rng.normal(size=len(x)), 2000) * np.exp(-x / 0.06)
        slide = bp(rng.normal(size=len(x)), 300, 3000) * np.exp(-x / 1.2) * (0.5 + 0.5 * np.sin(x * 40) ** 2) * rocks
        return amp * (0.9 * body + 0.35 * crack + 0.25 * slide)
    return hit(t0, 4.0, fn)


def clicks(a, b, rate, amp, seed):
    """Mandibles: sharp dry clicks in bursts."""
    r = np.random.RandomState(seed)
    out = np.zeros(N)
    tt = a
    while tt < b:
        for k in range(r.randint(2, 6)):
            out += hit(tt + k * 0.045, 0.03, lambda x: hp(r.normal(size=len(x)), 2500) * np.exp(-x / 0.004) * amp)
        tt += r.exponential(1 / rate) + 0.15
    return out


def screech(t0, dur, amp=1.0, f0=420):
    """A scream that is part man, part insect: detuned saws through moving formants, a chitter on top."""
    def fn(x):
        vib = 1 + 0.04 * np.sin(2 * math.pi * 7 * x) + 0.02 * np.sin(2 * math.pi * 23 * x)
        glide = 1 + 0.35 * np.sin(math.pi * np.clip(x / dur, 0, 1))
        out = 0
        for k, det in enumerate((1.0, 1.007, 0.993, 1.5, 2.01)):
            ph = np.cumsum(f0 * det * vib * glide) / SR
            out = out + (2 * (ph % 1) - 1) * (0.5 if k < 3 else 0.25)
        out = bp(out, 600, 3800) + 0.6 * bp(out, 2200, 5200)
        chit = hp(rng.normal(size=len(x)), 3000) * (np.sin(2 * math.pi * 60 * x) > 0.6)
        e = np.clip(x / 0.08, 0, 1) * np.clip((dur - x) / 0.5, 0, 1)
        return (out * 0.5 + chit * 0.25) * e * amp
    return hit(t0, dur, fn)


def bats():
    out = np.zeros(N)
    r = np.random.RandomState(3)
    for k in range(40):
        t0 = T_TREMOR + 0.4 + r.uniform(0, 2.2)
        f = r.uniform(5000, 8000)
        out += hit(t0, 0.06, lambda x, f=f: np.sin(2 * math.pi * (f - 20000 * x) * x) * np.sin(math.pi * x / 0.06) * 0.05)
    flaps = bp(rng.normal(size=N), 300, 1500) * (np.sin(2 * math.pi * 11 * t) > 0.5) * env(T_TREMOR + 0.4, 12, 0.3)
    return out + flaps * 0.04


def eyes():
    fn = lambda x: (np.sin(2 * math.pi * 1980 * x) + 0.5 * np.sin(2 * math.pi * 2970 * x)) * np.exp(-x / 1.4) * \
        (1 - np.exp(-x / 0.01)) * 0.06
    return hit(15.4, 3.0, fn) + boom(15.4, 0.3, 50)


def steps():
    out = np.zeros(N)
    for t0 in steps_between(25.0, 33.0, 25.0):
        out += boom(t0, 0.22, 36)
    for t0 in steps_between(33.0, 40.0, 33.0):
        out += boom(t0, 0.35, 34)
        out += hit(t0, 1.4, lambda x: hp(rng.normal(size=len(x)), 700) * np.exp(-x / 0.35) * 0.18)
    return out


def wood(t0, dur, amp):
    """Creaking: a resonant grind sliding in pitch."""
    def fn(x):
        f = 90 + 60 * np.sin(2 * math.pi * 0.7 * x) + 30 * x
        ph = np.cumsum(f) / SR
        saw = 2 * (ph % 1) - 1
        g = bp(saw * (0.6 + 0.4 * rng.rand(len(x))), 150, 1200)
        return g * np.sin(math.pi * x / dur) * amp
    return hit(t0, dur, fn)


def crack(t0, amp=1.0):
    def fn(x):
        snap = hp(rng.normal(size=len(x)), 800) * np.exp(-x / 0.03)
        splint = bp(rng.normal(size=len(x)), 1500, 6000) * np.exp(-x / 0.4) * (rng.rand(len(x)) > 0.7)
        thud = np.sin(2 * math.pi * 55 * x) * np.exp(-x / 0.3)
        return (snap + 0.4 * splint + 0.6 * thud) * amp
    return hit(t0, 2.0, fn)


def breath(a, b, amp):
    br = lp(rng.normal(size=N), 380) * (0.5 + 0.5 * np.sin(2 * math.pi * 0.3 * t - 1)) ** 3
    return br * env(a, b, 0.3) * amp


def gong(t0):
    def fn(x):
        s = sum(a * np.sin(2 * math.pi * f * x) * np.exp(-x / d) for f, a, d in
                ((48.0, 1.0, 4.0), (73.2, 0.5, 3.0), (117.6, 0.3, 2.2), (181.0, 0.15, 1.4)))
        return s * (1 - np.exp(-x / 0.004)) * 0.35
    return hit(t0, END - t0, fn)


def reverb(x, secs=3.0):
    n = int(secs * SR)
    ir = rng.normal(size=n) * np.exp(-np.arange(n) / SR / (secs / 5))
    ir[0] = 1
    return fftconvolve(x, lp(ir, 3500) / np.sqrt((ir ** 2).sum()) * 6)[:N]


def mix():
    dry = (night() + drone() + rumble(T_TREMOR, 3.0, 0.5) + bats() + clicks(12.8, 16.0, 1.4, 0.25, 1) + eyes() +
           boom(T_SLAM[0], 1.0, 30, rocks=1.0) + boom(T_SLAM[1], 1.0, 32, rocks=1.0) + screech(20.3, 1.6, 0.9, 380) +
           rumble(22.0, 2.0, 0.4) + screech(23.95, 1.0, 0.7, 460) + steps() + boom(41.0, 0.8, 30) + boom(42.2, 0.8, 32) +
           clicks(43.5, 48.0, 1.8, 0.2, 2) + breath(43.5, 49.0, 0.35) + wood(47.9, 1.3, 0.25) +
           rumble(48.0, 1.2, 0.4) + crack(T_RIP, 0.9) + boom(T_RIP, 0.6, 40, rocks=0.8) + screech(51.6, 1.6, 1.0, 400) +
           crack(T_SNAP, 1.0) + clicks(55.5, 58.6, 2.2, 0.25, 3) + breath(55.5, 58.8, 0.4) +
           screech(57.4, 0.35, 0.5, 520) + screech(58.8, 0.6, 1.1, 360) + gong(59.6))
    dry *= 1 - ramp(59.33, 59.36) * (1 - ramp(59.55, 59.6))                    # the cut to black: silence
    wet = reverb(dry)
    L = dry * 0.8 + wet * 0.35
    R = np.roll(dry, int(0.011 * SR)) * 0.8 + np.roll(wet, int(0.017 * SR)) * 0.35
    out = np.stack([L, R], 1) * (1 - ramp(END - 1.0, END - 0.05))[:, None]
    return np.tanh(out / np.abs(out).max() * 1.3) * 0.9


if __name__ == '__main__':
    wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'rampage.wav', SR, (mix() * 32767).astype(np.int16))
