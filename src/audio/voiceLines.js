// [v32] Voice lines: characters SAY their dialogue out loud through the browser's own speech
// synthesis (no audio files), each with their own pitch and pace: Reynard bright and quick, bears
// low and slow, the CEO very low, cubs high. Falls back to the game's babble voices when speech
// isn't available or Settings > Voice lines is off.
//
//   import { speakLine, stopVoice, voiceAvailable } from '../audio/voiceLines.js';
//   speakLine('Class! Today: fish.', { who: 'fox', mood: 'excited' }) -> seconds (an estimate) | 0
//   stopVoice()            cut whoever is talking (skips, scene ends)
// Markup is stripped (<b>, *emphasis*, {icons}); "..." pauses read naturally.
import { voiceLinesOn } from '../ui/settings.js';

const VOICE = {
  fox: { pitch: 1.45, rate: 1.08, pref: ['Samantha', 'Google UK English Male', 'Daniel', 'Alex', 'en-GB', 'en-US'] },
  bear: { pitch: 0.55, rate: 0.9, pref: ['Fred', 'Google US English', 'en-US'] },
  cub: { pitch: 1.9, rate: 1.12, pref: ['Google US English', 'en-US'] },
  ceo: { pitch: 0.2, rate: 0.78, pref: ['Daniel', 'Google UK English Male', 'en-GB'] },
  turtle: { pitch: 0.35, rate: 0.72, pref: ['en-GB', 'en-US'] },
  otter: { pitch: 1.6, rate: 1.15, pref: ['en-US'] },
  duck: { pitch: 1.3, rate: 1.2, pref: ['en-US'] },
  npc: { pitch: 1.1, rate: 1, pref: ['en-US', 'en-GB'] },
};
const MOOD = { shout: { pitch: 1.05, rate: 1.1, vol: 1 }, angry: { pitch: 0.95, rate: 1.08, vol: 1 }, whisper: { pitch: 1, rate: 0.92, vol: 0.55 }, scared: { pitch: 1.15, rate: 1.15, vol: 0.85 }, sad: { pitch: 0.88, rate: 0.85, vol: 0.8 }, excited: { pitch: 1.1, rate: 1.12, vol: 1 }, happy: { pitch: 1.06, rate: 1.04, vol: 0.95 }, think: { pitch: 0.96, rate: 0.9, vol: 0.75 } };

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];
function loadVoices() { try { voices = (synth?.getVoices?.() || []).filter((v) => /^en/i.test(v.lang)); } catch { voices = []; } }
if (synth) { loadVoices(); try { synth.addEventListener?.('voiceschanged', loadVoices); } catch { /* old browsers */ } }

export function voiceAvailable() { return !!synth && voices.length > 0; }

function pickVoice(who) {
  const P = (VOICE[who] || VOICE.npc).pref;
  for (const p of P) {
    const v = voices.find((x) => x.name.includes(p)) || voices.find((x) => x.lang === p || x.lang.replace('_', '-') === p);
    if (v) return v;
  }
  return voices[0] || null;
}

export function plainLine(text) {
  return String(text ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{[a-z0-9_]+\}/gi, '')
    .replace(/[*_]/g, '')
    .replace(/[♂]/g, ' boy ').replace(/[♀]/g, ' girl ').replace(/[♥]/g, ' heart ')
    .replace(/[★✓✗✕▸▶◀▲▼→←↑↓█✎•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let volume = 0.9;
export function setVoiceVolume(v) { volume = Math.max(0, Math.min(1, v)); }

/** speak a line; returns an estimated duration in seconds (0 = not spoken: use the babble instead) */
export function speakLine(text, { who = 'fox', mood = 'normal', interrupt = true } = {}) {
  if (!synth || !voiceLinesOn()) return 0;
  if (!voices.length) loadVoices();
  if (!voices.length) return 0;
  const line = plainLine(text);
  if (!line || line.length < 2) return 0;
  try {
    if (interrupt) synth.cancel();
    const u = new SpeechSynthesisUtterance(line);
    const V = VOICE[who] || VOICE.npc, M = MOOD[mood] || { pitch: 1, rate: 1, vol: 0.95 };
    const v = pickVoice(who);
    if (v) u.voice = v;
    u.lang = v?.lang || 'en-US';
    u.pitch = Math.max(0, Math.min(2, V.pitch * M.pitch));
    u.rate = Math.max(0.5, Math.min(1.6, V.rate * M.rate));
    u.volume = volume * (M.vol ?? 1);
    synth.speak(u);
    // ~14 characters a second at rate 1
    return line.length / (14 * u.rate);
  } catch { return 0; }
}

export function stopVoice() { try { synth?.cancel(); } catch { /* ignore */ } }
