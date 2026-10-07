"""Synthesize the soundtrack + sound effects for the Fomies motion graphic.

Music: original 120 BPM "sneaky office" groove in C minor (drums, bass, marimba
motif, pads), arranged to the scene timeline. SFX are placed from out/cues.json,
which render.mjs exports from the animation itself, so picture and sound stay in sync.

usage: python3 audio.py out/cues.json out/fomies_audio.wav
"""
import json
import sys

import numpy as np
from scipy import signal

SR = 44100
DUR = 61.5
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
rng = np.random.default_rng(7)


def t_arr(d):
    return np.arange(int(d * SR)) / SR


def env_exp(d, decay, attack=0.002):
    t = t_arr(d)
    e = np.exp(-t / decay)
    a = np.clip(t / attack, 0, 1) if attack > 0 else 1
    return e * a


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc / (SR / 2), 0.99), 'low')
    return signal.lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = signal.butter(order, min(fc / (SR / 2), 0.99), 'high')
    return signal.lfilter(b, a, x)


def bp(x, f1, f2, order=2):
    b, a = signal.butter(order, [f1 / (SR / 2), min(f2 / (SR / 2), 0.99)], 'band')
    return signal.lfilter(b, a, x)


def sweep_filter(x, f_start, f_end, q=0.7):
    """time-varying one-pole lowpass + highpass to create a swept band (cheap whoosh)."""
    n = len(x)
    fc = np.geomspace(f_start, f_end, n)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.zeros(n)
    z = 0.0
    for i in range(n):
        z = (1 - a[i]) * x[i] + a[i] * z
        y[i] = z
    return y - lp(y, max(80, min(f_start, f_end) * q))


def note_hz(n):
    names = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
    name, octv = n[:-1], int(n[-1])
    midi = 12 * (octv + 1) + names[name]
    return 440 * 2 ** ((midi - 69) / 12)


def saw(f, d, detune=0.0):
    t = t_arr(d)
    out = 2 * ((t * f) % 1) - 1
    if detune:
        out = 0.5 * out + 0.5 * (2 * ((t * f * (1 + detune)) % 1) - 1)
    return out


# ---------------------------------------------------------------- instruments
def kick(v=1.0):
    d = 0.45
    t = t_arr(d)
    f = 45 + 110 * np.exp(-t / 0.045)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * env_exp(d, 0.16, 0.001)
    click = hp(rng.standard_normal(len(t)), 3000) * env_exp(d, 0.004) * 0.25
    return np.tanh((x + click) * 1.6) * v


def snare(v=1.0):
    d = 0.3
    t = t_arr(d)
    n = bp(rng.standard_normal(len(t)), 1200, 9000) * env_exp(d, 0.07)
    tone = np.sin(2 * np.pi * 185 * t) * env_exp(d, 0.05) * 0.6
    return (n * 0.8 + tone) * v


def clap(v=1.0):
    d = 0.35
    t = t_arr(d)
    e = np.zeros(len(t))
    for k, off in enumerate([0, 0.011, 0.023]):
        i = int(off * SR)
        e[i:] += env_exp(d - off, 0.012 if k < 2 else 0.09)[: len(t) - i]
    return bp(rng.standard_normal(len(t)), 900, 6000) * e * v


def hat(v=1.0, open_=False):
    d = 0.3 if open_ else 0.06
    x = hp(rng.standard_normal(int(d * SR)), 7000, 4)
    return x * env_exp(d, 0.12 if open_ else 0.018) * v


def bass(f, d, v=1.0):
    t = t_arr(d)
    x = saw(f, d, 0.004) + 0.5 * np.sin(2 * np.pi * f * t)
    cut = 180 + 1400 * np.exp(-t / 0.08)
    # approximate time-varying cutoff with 3 static bands blended
    y = lp(x, 900) * np.exp(-t / 0.08) + lp(x, 300) * (1 - np.exp(-t / 0.08))
    e = np.clip(t / 0.004, 0, 1) * np.clip((d - t) / 0.03, 0, 1)
    del cut
    return np.tanh(y * 1.4) * e * v


def marimba(f, v=1.0, d=0.6):
    t = t_arr(d)
    x = np.sin(2 * np.pi * f * t) * env_exp(d, 0.28)
    x += 0.35 * np.sin(2 * np.pi * f * 4 * t) * env_exp(d, 0.04)
    x += 0.12 * np.sin(2 * np.pi * f * 9.2 * t) * env_exp(d, 0.012)
    return x * np.clip(t / 0.002, 0, 1) * v


def pizz(f, v=1.0, d=0.4):
    # Karplus–Strong plucked string
    n = int(d * SR)
    p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * 0.994
    return lp(out, 3500) * v


def pad(freqs, d, v=1.0):
    t = t_arr(d)
    x = np.zeros(len(t))
    for f in freqs:
        x += saw(f, d, 0.006) + saw(f * 0.5, d, -0.004) * 0.4
    x = lp(x / len(freqs), 900, 2)
    e = np.clip(t / 0.35, 0, 1) * np.clip((d - t) / 0.4, 0, 1)
    return x * e * v


def bell(f, d=2.0, v=1.0):
    t = t_arr(d)
    x = np.zeros(len(t))
    for ratio, amp, dec in [(1, 1, 1.2), (2.76, 0.5, 0.6), (5.4, 0.25, 0.3), (8.93, 0.12, 0.15)]:
        x += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / dec)
    return x * np.clip(t / 0.001, 0, 1) * v * 0.6


# ---------------------------------------------------------------- sfx
def sfx(kind):
    if kind in ('pop', 'pop_big'):
        big = kind == 'pop_big'
        d = 0.14 if big else 0.09
        t = t_arr(d)
        f0, f1 = (260, 900) if big else (520, 1300)
        f = f0 + (f1 - f0) * (1 - np.exp(-t / 0.02))
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, 0.035 if big else 0.022, 0.001)
        if big:
            x += 0.5 * np.sin(2 * np.pi * np.cumsum(f * 0.5) / SR) * env_exp(d, 0.05)
        return x * 0.7
    if kind == 'boing':
        d = 0.32
        t = t_arr(d)
        f = 330 + 220 * np.sin(2 * np.pi * 14 * t) * np.exp(-t / 0.08) + 120 * t
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, 0.1) * 0.45
    if kind == 'blip':
        d = 0.06
        t = t_arr(d)
        return np.sign(np.sin(2 * np.pi * 1320 * t)) * env_exp(d, 0.02) * 0.18
    if kind == 'blink':
        d = 0.12
        x = np.zeros(int(d * SR))
        for off in (0, 0.06):
            i = int(off * SR)
            c = hp(rng.standard_normal(int(0.02 * SR)), 2500) * env_exp(0.02, 0.004)
            x[i:i + len(c)] += c
        return x * 0.5
    if kind in ('whoosh', 'whoosh_in', 'flip'):
        d = {'whoosh': 0.5, 'whoosh_in': 0.38, 'flip': 0.22}[kind]
        t = t_arr(d)
        n = rng.standard_normal(len(t))
        if kind == 'whoosh_in':
            y = sweep_filter(n, 400, 5000)
        else:
            y = sweep_filter(n, 4500, 350)
        e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
        return y * e * (1.6 if kind != 'flip' else 1.2)
    if kind == 'stamp':
        d = 0.5
        t = t_arr(d)
        thud = np.sin(2 * np.pi * np.cumsum(70 + 80 * np.exp(-t / 0.02)) / SR) * env_exp(d, 0.12)
        slap = lp(rng.standard_normal(len(t)), 2500) * env_exp(d, 0.03)
        clack = hp(rng.standard_normal(len(t)), 3000) * env_exp(d, 0.006)
        return np.tanh((thud * 1.2 + slap * 0.9 + clack * 0.6) * 1.5) * 0.9
    if kind == 'impact':
        d = 1.6
        t = t_arr(d)
        boom = np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-t / 0.05)) / SR) * env_exp(d, 0.5)
        crash = hp(rng.standard_normal(len(t)), 4000) * env_exp(d, 0.45) * 0.35
        return np.tanh((boom + crash) * 1.3) * 0.9
    if kind == 'end_hit':
        x = sfx('impact')
        b = sum(bell(note_hz(n), 1.6, 0.5) for n in ('C5', 'Eb5', 'G5'))
        out = np.zeros(max(len(x), len(b)))
        out[:len(x)] += x
        out[:len(b)] += b
        return out
    if kind in ('type', 'type2'):
        d = 0.05
        t = t_arr(d)
        c = hp(rng.standard_normal(len(t)), 1800) * env_exp(d, 0.005)
        body = np.sin(2 * np.pi * (1400 if kind == 'type' else 900) * t) * env_exp(d, 0.008) * 0.4
        return (c + body) * (0.35 if kind == 'type' else 0.5)
    if kind == 'ding':
        return bell(1568, 2.2, 1.0) + bell(1568 * 1.003, 2.2, 0.4)
    if kind == 'elevator_broken':
        a = bell(note_hz('E6') / 2, 1.0, 0.8)
        b = bell(note_hz('C6') / 2 * 0.97, 1.4, 0.8)
        out = np.zeros(int(0.35 * SR) + len(b))
        out[:len(a)] += a
        out[int(0.35 * SR):] += b
        t = t_arr(len(out) / SR)
        return out * (1 + 0.3 * np.sin(2 * np.pi * 7 * t))
    if kind == 'buzz':
        d = 0.35
        t = t_arr(d)
        x = np.sign(np.sin(2 * np.pi * 100 * t)) * 0.5 + rng.standard_normal(len(t)) * (rng.random(len(t)) > 0.97)
        return bp(x, 200, 6000) * env_exp(d, 0.12) * 0.6
    if kind == 'rattle':
        d = 0.95
        x = np.zeros(int(d * SR))
        for k in range(16):
            i = int((k * 0.05 + rng.random() * 0.01) * SR)
            c = bp(rng.standard_normal(int(0.03 * SR)), 1500, 7000) * env_exp(0.03, 0.006)
            x[i:i + len(c)] += c * (0.5 + 0.5 * rng.random())
        return x * 0.7
    if kind == 'print':
        d = 0.55
        t = t_arr(d)
        x = saw(95, d) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 28 * t)))
        x = bp(x, 300, 3000) + bp(rng.standard_normal(len(t)), 2000, 6000) * 0.3
        return x * np.clip((d - t) / 0.05, 0, 1) * np.clip(t / 0.01, 0, 1) * 0.35
    if kind in ('tick', 'tick_soft', 'click'):
        d = 0.05
        t = t_arr(d)
        f = {'tick': 1900, 'tick_soft': 1300, 'click': 3200}[kind]
        x = np.sin(2 * np.pi * f * t) * env_exp(d, 0.008) + hp(rng.standard_normal(len(t)), 3000) * env_exp(d, 0.002) * 0.6
        if kind == 'click':
            y = np.zeros(int(0.11 * SR))
            y[:len(x)] += x
            y[int(0.05 * SR):int(0.05 * SR) + len(x)] += x * 0.6
            x = y
        return x * (0.5 if kind != 'tick_soft' else 0.35)
    if kind == 'marker':
        d = 0.32
        t = t_arr(d)
        x = bp(rng.standard_normal(len(t)), 2500, 7000) * (0.6 + 0.4 * np.sin(2 * np.pi * 38 * t))
        return x * np.sin(np.pi * t / d) * 0.6
    if kind == 'hammer':
        d = 0.4
        t = t_arr(d)
        knock = np.sin(2 * np.pi * 210 * t) * env_exp(d, 0.05) + np.sin(2 * np.pi * 95 * t) * env_exp(d, 0.09)
        n = bp(rng.standard_normal(len(t)), 600, 4000) * env_exp(d, 0.02)
        return np.tanh((knock + n) * 1.5) * 0.85
    if kind in ('step', 'thud'):
        d = 0.25
        t = t_arr(d)
        x = np.sin(2 * np.pi * np.cumsum(60 + 60 * np.exp(-t / 0.02)) / SR) * env_exp(d, 0.06)
        x += lp(rng.standard_normal(len(t)), 900) * env_exp(d, 0.02) * 0.6
        return x * (0.6 if kind == 'step' else 0.8)
    if kind in ('riser', 'riser_short'):
        d = 0.6 if kind == 'riser' else 0.4
        t = t_arr(d)
        y = sweep_filter(rng.standard_normal(len(t)), 300, 9000)
        tone = np.sin(2 * np.pi * np.cumsum(200 + 1400 * (t / d) ** 2) / SR) * 0.25
        return (y + tone) * (t / d) ** 2 * 0.9
    if kind == 'riser_down':
        d = 1.4
        t = t_arr(d)
        tone = np.sin(2 * np.pi * np.cumsum(900 * np.exp(-t / 0.5) + 60) / SR)
        y = sweep_filter(rng.standard_normal(len(t)), 6000, 200) * 0.6
        return (tone * 0.4 + y) * np.sin(np.pi * t / d) * 0.8
    if kind == 'drone':
        d = 2.0
        x = pad([55, 82.4, 110.0 * 1.01], d, 1.0)
        return x * 0.9
    if kind == 'paper':
        d = 0.4
        t = t_arr(d)
        return bp(rng.standard_normal(len(t)), 1500, 8000) * np.sin(np.pi * t / d) ** 2 * 0.5
    if kind == 'crumple':
        d = 0.45
        x = np.zeros(int(d * SR))
        for k in range(40):
            i = int(rng.random() * (d - 0.03) * SR)
            c = bp(rng.standard_normal(int(0.02 * SR)), 1000, 8000) * env_exp(0.02, 0.004)
            x[i:i + len(c)] += c * rng.random()
        return x * 0.7
    if kind == 'door':
        d = 0.7
        t = t_arr(d)
        f = 320 + 120 * np.sin(2 * np.pi * 1.3 * t) + 30 * rng.standard_normal(len(t)).cumsum() / 300
        x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * (rng.random(len(t)) > 0.3)
        return bp(x, 400, 3000) * np.sin(np.pi * t / d) * 0.25
    if kind == 'chain':
        d = 0.6
        x = np.zeros(int(d * SR))
        for k in range(7):
            i = int((k * 0.06 + rng.random() * 0.02) * SR)
            f = 2500 + rng.random() * 2500
            c = np.sin(2 * np.pi * f * t_arr(0.12)) * env_exp(0.12, 0.03)
            x[i:i + len(c)] += c * 0.4
        return x
    if kind == 'shimmer':
        out = np.zeros(int(1.6 * SR))
        for k, n in enumerate(['C6', 'Eb6', 'G6', 'C7', 'Eb7']):
            b = bell(note_hz(n), 1.2, 0.35)
            i = int(k * 0.05 * SR)
            out[i:i + len(b)] += b[:len(out) - i]
        return out
    raise ValueError(kind)


# ---------------------------------------------------------------- arrangement
N = int(DUR * SR)
drums = np.zeros(N)
bassb = np.zeros(N)
lead = np.zeros(N)
padb = np.zeros(N)
fx = np.zeros(N)
fx_wet = np.zeros(N)


def put(buf, x, t, v=1.0):
    i = int(t * SR)
    if i >= len(buf) or i + len(x) <= 0:
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i] * v


CHORDS = [  # per bar: (bass root, pad notes)
    ('C2', ['C4', 'Eb4', 'G4']),
    ('Ab1', ['Ab3', 'C4', 'Eb4']),
    ('F1', ['F3', 'Ab3', 'C4']),
    ('G1', ['G3', 'B3', 'D4']),
]
# marimba motifs (8th-note grid, None = rest)
MOTIF_A = ['G4', None, 'C5', None, 'Eb5', 'D5', 'C5', None]
MOTIF_B = ['Ab4', None, 'C5', 'Eb5', None, 'F5', 'Eb5', None]
MOTIF_C = ['F4', None, 'Ab4', 'C5', None, 'Eb5', 'D5', 'C5']
MOTIF_D = ['G4', 'B4', 'D5', None, 'F5', None, 'D5', 'B4']
MOTIFS = [MOTIF_A, MOTIF_B, MOTIF_C, MOTIF_D]
SWING = 0.035


def section(t):
    """returns dict of which layers play at time t."""
    if t < 2.0:
        return dict(kick=0, snare=0, hats=0, bass=0, lead=0, pad=1)
    if t < 5.0:
        return dict(kick=0, snare=0, hats=1, bass=0, lead=1, pad=1)
    if t < 17.0:
        return dict(kick=1, snare=1, hats=1, bass=1, lead=1, pad=0)
    if t < 21.0:
        return dict(kick=0, snare=0, hats=1, bass=1, lead=0, pad=1)
    if t < 43.0:
        return dict(kick=1, snare=1, hats=1, bass=1, lead=1, pad=0 if t < 27 or t > 35 else 1)
    if t < 47.0:
        return dict(kick=1, snare=0, hats=1, bass=1, lead=0, pad=1)
    if t < 59.5:
        return dict(kick=1, snare=1, hats=1, bass=1, lead=1, pad=1 if t > 54 else 0)
    return dict(kick=0, snare=0, hats=0, bass=0, lead=0, pad=0)


K = kick()
SN = snare()
CL = clap()
H_C = [hat(1.0) for _ in range(4)]
H_O = hat(1.0, True)

nbars = int(DUR / BAR) + 1
for b in range(nbars):
    bt = b * BAR
    root, chord = CHORDS[b % 4]
    for s in range(8):  # 8th notes
        t = bt + s * BEAT / 2 + (SWING if s % 2 else 0)
        if t >= 59.5:
            continue
        L = section(t)
        if L['kick'] and s in (0, 4, 5 if b % 2 else 0):
            if not (s == 5 and b % 2 == 0):
                put(drums, K, t, 0.95 if s != 5 else 0.6)
        if L['snare'] and s in (2, 6):
            put(drums, SN, t, 0.55)
            put(drums, CL, t, 0.45)
        if L['hats']:
            v = 0.22 if s % 2 else 0.32
            if s == 7 and b % 2 == 1:
                put(drums, H_O, t, 0.2)
            else:
                put(drums, H_C[s % 4], t, v)
        if L['bass']:
            f = note_hz(root)
            pat = {0: (f, 0.22), 2: (f * 2, 0.12), 3: (f, 0.2), 5: (f * 1.5, 0.15), 6: (f * 2, 0.12), 7: (f * 1.335, 0.12)}
            if s in pat:
                ff, dd = pat[s]
                put(bassb, bass(ff, dd + 0.05), t, 0.55)
        if L['lead']:
            m = MOTIFS[b % 4]
            n = m[s]
            if n:
                # brighter octave in the final sections
                f = note_hz(n) * (2 if 47 <= t < 59.5 and b % 2 else 1)
                put(lead, marimba(f, 0.5), t)
                if t >= 27 and s % 2 == 0:
                    put(lead, pizz(f / 2, 0.35, 0.35), t)
    L = section(bt + 0.01)
    if L['pad']:
        put(padb, pad([note_hz(n) for n in chord], BAR + 0.3, 0.32), bt)

# basement: sub drone + ticking clock instead of drums
for i in range(16):
    put(drums, sfx('tick_soft'), 17.0 + i * 0.25, 0.25)

# sfx from cues
cues = json.load(open(sys.argv[1]))
WET = {'ding', 'stamp', 'impact', 'end_hit', 'shimmer', 'elevator_broken', 'pop_big', 'boing', 'hammer'}
for c in cues:
    x = sfx(c['type'])
    t = c['t']
    put(fx, x, t, c['vol'])
    if c['type'] in WET:
        put(fx_wet, x, t, c['vol'])

# ducking: lower music under stamps / impacts
duck = np.ones(N)
for c in cues:
    if c['type'] in ('stamp', 'impact', 'end_hit', 'ding'):
        i = int(c['t'] * SR)
        n = int(0.4 * SR)
        seg = 1 - 0.45 * np.exp(-np.arange(n) / (0.12 * SR))
        duck[i:i + n] = np.minimum(duck[i:i + n], seg[: len(duck[i:i + n])])


# reverb (noise-tail convolution)
def reverb(x, rt=1.6, mix=1.0):
    n = int(rt * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (rt / 6.9 * SR))
    ir = lp(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    return signal.fftconvolve(x, ir)[: len(x)] * mix


music = drums * 0.9 + bassb * 0.85 + lead * 0.42 + padb * 0.5
music_wet = reverb(lead * 0.42 + padb * 0.3 + drums * 0.08, 1.4, 0.35)
music = (music + music_wet) * duck

# master fade at the very end
tt = np.arange(N) / SR
music *= np.clip((60.6 - tt) / 1.2, 0, 1)
fx_mix = fx * 0.85 + reverb(fx_wet, 1.8, 0.4)

L = music * 0.75 + fx_mix
# subtle stereo: delay the wet layer a bit on the right
R = np.copy(L)
d = int(0.012 * SR)
R[d:] = (music * 0.75)[:-d] * 0.15 + R[d:] * 0.85
stereo = np.stack([L, R], 1)
stereo = hp(stereo.T, 30).T
peak = np.max(np.abs(stereo))
stereo = np.tanh(stereo / peak * 1.35) / np.tanh(1.35) * 0.93

out = sys.argv[2]
from scipy.io import wavfile  # noqa: E402

wavfile.write(out, SR, (stereo * 32767).astype(np.int16))
print('wrote', out, stereo.shape[0] / SR, 's')
