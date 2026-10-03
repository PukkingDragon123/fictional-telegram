// Sounds for Reynard's research computer (src/ui/LabTree.js, v19 "R&D-OS"):
// the holo-terminal booting up and powering down, a holographic select blip,
// a digital glitch for switching views and a radar ping on encrypted sectors.
// Built with the audio.js kit (see EXTRA_SFX there).

// power-on: relay clunk, a rising hum, a fast square-wave boot arpeggio and a soft shimmer
function labBoot(ctx, dest, o, { Voice, SOFT }) {
  const v = new Voice(ctx, dest, o, 0.18, 0.02);
  v.noise({ buf: 'pink', ft: 'lowpass', f: 900, q: 0.6, a: 0.001, rel: 0.06, peak: 0.6 }); // relay
  v.tone({ f: 70, f2: 140, gl: 0.45, a: 0.05, hold: 0.25, rel: 0.25, peak: 0.22, type: 'sawtooth', lp: 400, lp2: 1400, lpt: 0.5 }); // hum
  v.tone({ t: 0.02, f: 220, f2: 1760, gl: 0.35, a: 0.01, hold: 0.05, rel: 0.12, peak: 0.07, type: 'sine' }); // sweep
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => v.tone({ t: 0.32 + i * 0.055, type: 'square', f, a: 0.004, hold: 0.025, rel: 0.05, peak: 0.045, lp: 3200 }));
  [2093, 2637].forEach((f, i) => v.bell({ t: 0.62 + i * 0.07, f, parts: SOFT, peak: 0.07, rel: 0.6 }));
  v.noise({ t: 0.3, buf: 'white', ft: 'highpass', f: 5000, q: 0.5, a: 0.05, rel: 0.4, peak: 0.05 });
  return v.end;
}

// power-off: a CRT "thwump": a falling zap, the flyback whine dying out and a tiny click
function labOff(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.12, 0.02);
  v.tone({ f: 1400, f2: 60, gl: 0.28, a: 0.002, rel: 0.3, peak: 0.16, type: 'sine' });
  v.tone({ f: 7800, f2: 5200, gl: 0.45, a: 0.002, hold: 0.08, rel: 0.4, peak: 0.018, type: 'sine' }); // whine
  v.noise({ buf: 'pink', ft: 'lowpass', f: 1600, f2: 200, gl: 0.25, q: 0.7, a: 0.002, rel: 0.25, peak: 0.35 });
  v.noise({ t: 0.32, buf: 'white', f: 3000, q: 2, bursts: [[0, 0.3, 0.01]] }); // click
  return v.end;
}

// holographic select: a short glassy upward blip with a sparkle
function labBlip(ctx, dest, o, { Voice, rr }) {
  const v = new Voice(ctx, dest, o, 0.1, 0.03);
  const f = 880 * rr(0.97, 1.03);
  v.tone({ f, f2: f * 1.5, gl: 0.05, a: 0.002, hold: 0.02, rel: 0.08, peak: 0.16, type: 'triangle' });
  v.tone({ t: 0.045, f: f * 2, a: 0.002, rel: 0.12, peak: 0.06, type: 'sine' });
  return v.end;
}

// digital glitch: a few bit-crushed noise stutters and a square chirp
function labGlitch(ctx, dest, o, { Voice, rr }) {
  const v = new Voice(ctx, dest, o, 0.05, 0.05);
  v.noise({ buf: 'white', f: 2400 * rr(0.9, 1.1), q: 1.4, bursts: [[0, 0.32, 0.018], [0.03, 0.22, 0.012], [0.06, 0.3, 0.02], [0.1, 0.16, 0.01]] });
  v.tone({ t: 0.01, type: 'square', f: 180, f2: 1200, gl: 0.06, a: 0.002, rel: 0.05, peak: 0.05, lp: 2600 });
  v.tone({ t: 0.08, type: 'square', f: 900, f2: 300, gl: 0.05, a: 0.002, rel: 0.05, peak: 0.04, lp: 2600 });
  return v.end;
}

// radar ping: a sonar-like sine with a long soft tail and an echo
function labScan(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.35, 0.01);
  v.tone({ f: 1320, f2: 1250, gl: 0.6, a: 0.003, hold: 0.02, rel: 0.7, peak: 0.12, type: 'sine' });
  v.tone({ t: 0.32, f: 1320, f2: 1250, gl: 0.5, a: 0.003, rel: 0.5, peak: 0.04, type: 'sine' });
  v.noise({ buf: 'white', ft: 'highpass', f: 4000, q: 0.5, a: 0.002, rel: 0.05, peak: 0.08 });
  return v.end;
}

export const EXTRA_SFX = {
  lab_boot: { fn: labBoot, max: 1, gap: 0.4, g: 1.4 },
  lab_off: { fn: labOff, max: 1, gap: 0.3, g: 1.5 },
  lab_blip: { fn: labBlip, max: 3, gap: 0.04, g: 2.2 },
  lab_glitch: { fn: labGlitch, max: 2, gap: 0.08, g: 1.8 },
  lab_scan: { fn: labScan, max: 1, gap: 0.3, g: 1.6 },
};
