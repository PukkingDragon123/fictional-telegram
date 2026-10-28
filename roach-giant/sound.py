"""The soundtrack, synthesized.

Night at the lake: crickets, frogs, water, a little wind. The ground splits
with a deep crack, and the crickets stop. One roach: dry ticking legs. Then
the pour - thousands of legs, a hiss of chitin that swells as the tide
spreads, a drone underneath. While it climbs into its shape the clicking
rises into a roar and a low tone climbs with it; its eyes catch with a shrill
ring. It breathes in: a vast inhale and the sub-bass of the land dying. Each
footstep is a boom with the rattle of roaches raining off it. The pine
creaks, groans, and cracks as it is drunk. Close to its face the clicking is
wet and near; its mouth opens in a scream made of chittering. The swarm comes
over you, and cuts to silence. A low bell under the title.

    python sound.py out.wav
"""
import math
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter, fftconvolve

from film import END, T_CRACK, T_HERO, T_POUR, T_FORM, T_EYES, T_BREATH, T_DRINK, T_JAW, STEPS

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
    if n > 0 and i0 >= 0:
        out[i0:i0 + n] = fn(np.arange(n) / SR)
    return out


def night():
    """Crickets, frogs, the lake, until the ground splits."""
    quiet = 1 - ramp(T_CRACK + 0.1, T_CRACK + 0.5)
    chirp = np.sin(2 * math.pi * 4400 * t) * (np.sin(2 * math.pi * 30 * t) > 0.3) * (np.sin(2 * math.pi * 1.6 * t) > 0.1)
    chirp2 = np.sin(2 * math.pi * 3800 * t + 1) * (np.sin(2 * math.pi * 26 * t + 2) > 0.4) * \
        (np.sin(2 * math.pi * 1.1 * t + 1) > 0.2)
    frog = np.zeros(N)
    r = np.random.RandomState(4)
    for k in range(14):
        t0 = r.uniform(0.5, 8.0)
        f = r.uniform(180, 320)
        frog += hit(t0, 0.35, lambda x, f=f: np.sign(np.sin(2 * math.pi * f * x)) * np.sin(2 * math.pi * 18 * x) ** 2 *
                    np.sin(math.pi * x / 0.35) * 0.05)
    water = bp(rng.normal(size=N), 200, 900) * (0.6 + 0.4 * np.sin(2 * math.pi * 0.35 * t)) ** 2
    wind = lp(rng.normal(size=N), 380) * (0.5 + 0.5 * np.sin(2 * math.pi * 0.06 * t))
    return (0.07 * (chirp + chirp2) + lp(frog, 1500) + 0.1 * water) * quiet + 0.07 * wind


def drone():
    d = ramp(T_POUR, 50) * 0.8
    out = np.zeros(N)
    for f, a in ((36.7, 1.0), (55.0, 0.6), (73.4, 0.35), (38.9, 0.7 * d), (110.0, 0.15 * d)):
        out += a * np.sin(2 * math.pi * f * t + 1.5 * np.sin(2 * math.pi * 0.04 * t))
    return out * (0.015 + (0.08 + 0.12 * d) * env(T_CRACK, 61.95, 0.5))


def boom(t0, amp=1.0, f=34, rattle=0.0):
    def fn(x):
        body = np.sin(2 * math.pi * f * x * (1 - 0.3 * x)) * np.exp(-x / 0.9)
        crack = lp(rng.normal(size=len(x)), 2200) * np.exp(-x / 0.05)
        rat = bp(rng.normal(size=len(x)), 1500, 7000) * np.exp(-x / 0.8) * (rng.rand(len(x)) > 0.6) * rattle
        return amp * (0.9 * body + 0.35 * crack + 0.3 * rat)
    return hit(t0, 4.0, fn)


def rumble(t0, dur, amp):
    return hit(t0, dur, lambda x: lp(rng.normal(size=len(x)), 70) * np.sin(math.pi * x / dur) * amp * 12)


def earth_crack(t0):
    def fn(x):
        crackle = hp(rng.normal(size=len(x)), 600) * (rng.rand(len(x)) > 0.985) * 6 * np.exp(-x / 0.9)
        tear = bp(rng.normal(size=len(x)), 120, 900) * np.exp(-x / 0.6) * 1.2
        return crackle + tear
    return hit(t0, 2.5, fn) + rumble(t0 - 0.2, 2.2, 0.5)


def clicks(rate_fn, amp_fn, seed, lo=2500, hi=7500):
    """Legs on dry ground: clicks at a rate that can swell to a hiss."""
    r = np.random.RandomState(seed)
    rate = rate_fn(t)
    p = np.clip(rate / SR, 0, 1)
    imp = (r.rand(N) < p) * r.uniform(0.3, 1.0, N) * np.where(r.rand(N) < 0.5, -1, 1)
    k = np.arange(int(0.004 * SR)) / SR
    kern = np.sin(2 * math.pi * 4200 * k) * np.exp(-k / 0.0007)
    out = fftconvolve(imp, kern)[:N]
    return bp(out, lo, hi) * amp_fn(t)


def swarm():
    """The pour and the tide: from a few legs to a sea of them."""
    n_out = np.clip((t - T_POUR) / 4.5, 0, 1) ** 1.5
    rate = 30 * ramp(T_HERO, T_HERO + 0.5) * (1 - ramp(T_POUR, T_POUR + 1)) + \
        6000 * n_out * (1 - 0.55 * ramp(T_FORM[1], T_FORM[1] + 2)) + 2200 * ramp(51, 52) + 9000 * ramp(58.5, 61.5)
    amp = lambda tt: (0.5 + 0.25 * np.sin(2 * math.pi * 0.3 * tt)) * (1 - ramp(61.94, 61.96))
    hiss = clicks(lambda tt: rate, amp, 3)
    body = bp(rng.normal(size=N), 1200, 5000) * (0.05 * n_out * (1 - 0.5 * ramp(T_FORM[1], T_FORM[1] + 2)) +
                                                  0.12 * ramp(58.5, 61.5)) * (1 - ramp(61.94, 61.96))
    return hiss * 0.7 + body


def riser(a, b, f0, f1, amp):
    def fn(x):
        u = x / (b - a)
        f = f0 * (f1 / f0) ** u
        ph = np.cumsum(f) / SR
        s = np.sin(2 * math.pi * ph) + 0.4 * np.sin(4 * math.pi * ph + 0.3)
        return s * u ** 1.5 * amp
    return hit(a, b - a, fn)


def ring(t0, amp=0.08):
    fn = lambda x: (np.sin(2 * math.pi * 1980 * x) + 0.5 * np.sin(2 * math.pi * 2973 * x)) * np.exp(-x / 1.6) * \
        (1 - np.exp(-x / 0.01)) * amp
    return hit(t0, 3.5, fn)


def inhale(t0, dur, amp):
    def fn(x):
        u = x / dur
        n = rng.normal(size=len(x))
        b, a = butter(2, [300 / (SR / 2), 2400 / (SR / 2)], 'band')
        s = lfilter(b, a, n) * np.sin(math.pi * u) ** 1.5
        sub = np.sin(2 * math.pi * (28 + 14 * u) * x) * u ** 2
        return (s * 1.2 + sub * 0.6) * amp
    return hit(t0, dur, fn)


def wood(t0, dur, amp):
    def fn(x):
        f = 80 + 50 * np.sin(2 * math.pi * 0.6 * x) + 25 * x
        ph = np.cumsum(f) / SR
        g = bp((2 * (ph % 1) - 1) * (0.6 + 0.4 * rng.rand(len(x))), 140, 1100)
        return g * np.sin(math.pi * x / dur) * amp
    return hit(t0, dur, fn)


def snap(t0, amp=1.0):
    def fn(x):
        s = hp(rng.normal(size=len(x)), 800) * np.exp(-x / 0.03)
        splint = bp(rng.normal(size=len(x)), 1500, 6000) * np.exp(-x / 0.4) * (rng.rand(len(x)) > 0.7)
        thud = np.sin(2 * math.pi * 55 * x) * np.exp(-x / 0.3)
        return (s + 0.4 * splint + 0.6 * thud) * amp
    return hit(t0, 2.0, fn)


def scream(t0, dur, amp=1.0, f0=300):
    """A scream made of chittering: detuned saws through moving formants,
    chopped by thousands of clicks."""
    def fn(x):
        vib = 1 + 0.05 * np.sin(2 * math.pi * 6 * x) + 0.03 * np.sin(2 * math.pi * 23 * x)
        glide = 1 + 0.45 * np.sin(math.pi * np.clip(x / dur, 0, 1))
        out = 0
        for k, det in enumerate((1.0, 1.008, 0.992, 1.5, 2.02)):
            ph = np.cumsum(f0 * det * vib * glide) / SR
            out = out + (2 * (ph % 1) - 1) * (0.5 if k < 3 else 0.25)
        out = bp(out, 500, 3600) + 0.6 * bp(out, 2000, 5400)
        chop = (np.sin(2 * math.pi * 47 * x) > -0.2) * 0.6 + 0.4
        chit = hp(rng.normal(size=len(x)), 3000) * (rng.rand(len(x)) > 0.85)
        e = np.clip(x / 0.15, 0, 1) * np.clip((dur - x) / 0.6, 0, 1)
        return (out * chop * 0.5 + chit * 0.35) * e * amp
    return hit(t0, dur, fn)


def heart(a, b, bpm0, bpm1, amp):
    out = np.zeros(N)
    tt = a
    while tt < b:
        u = (tt - a) / (b - a)
        bpm = bpm0 + (bpm1 - bpm0) * u
        for d, k in ((0.0, 1.0), (0.18, 0.6)):
            out += hit(tt + d, 0.25, lambda x, k=k: np.sin(2 * math.pi * 48 * x) * np.exp(-x / 0.07) * k * amp)
        tt += 60 / bpm
    return out


def bell(t0):
    def fn(x):
        s = sum(a * np.sin(2 * math.pi * f * x) * np.exp(-x / d) for f, a, d in
                ((46.0, 1.0, 4.0), (71.5, 0.5, 3.0), (113.0, 0.3, 2.2), (179.0, 0.15, 1.4), (262.0, 0.08, 1.0)))
        return s * (1 - np.exp(-x / 0.004)) * 0.4
    return hit(t0, END - t0, fn)


def reverb(x, secs=3.2):
    n = int(secs * SR)
    ir = rng.normal(size=n) * np.exp(-np.arange(n) / SR / (secs / 5))
    ir[0] = 1
    return fftconvolve(x, lp(ir, 3200) / np.sqrt((ir ** 2).sum()) * 6)[:N]


def mix():
    dry = night() + drone() + swarm()
    dry += earth_crack(T_CRACK) + boom(T_CRACK + 0.05, 0.5, 40)
    dry += heart(T_POUR, T_FORM[0], 58, 96, 0.35)
    dry += riser(T_FORM[0] - 0.5, T_EYES, 40, 160, 0.12)
    dry += ring(T_EYES, 0.09) + boom(T_EYES, 0.5, 46)
    dry += inhale(T_BREATH - 0.2, 3.4, 0.5) + rumble(T_BREATH + 0.5, 3.0, 0.6)
    for (x, z, t0) in STEPS:
        dry += boom(t0, 0.55, 32, rattle=1.0)
    dry += wood(T_DRINK[0] - 0.4, 1.8, 0.3) + wood(T_DRINK[0] + 1.2, 2.0, 0.35) + snap(T_DRINK[1] - 0.2, 0.8)
    dry += inhale(T_DRINK[0], T_DRINK[1] - T_DRINK[0] + 0.4, 0.25)
    dry += scream(T_JAW + 0.1, 2.6, 1.0, 290) + scream(59.4, 2.4, 0.9, 340)
    dry += boom(53.8, 0.3, 50)
    dry *= 1 - ramp(61.94, 61.96)                                       # the cut to black: silence
    dry += bell(62.2)
    wet = reverb(dry)
    L = dry * 0.8 + wet * 0.32
    R = np.roll(dry, int(0.011 * SR)) * 0.8 + np.roll(wet, int(0.017 * SR)) * 0.32
    out = np.stack([L, R], 1) * (1 - ramp(END - 1.2, END - 0.05))[:, None]
    return np.tanh(out / np.abs(out).max() * 1.4) * 0.9


if __name__ == '__main__':
    wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'hunger.wav', SR, (mix() * 32767).astype(np.int16))
