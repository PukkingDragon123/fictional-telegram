// Forwards to src/audio/audio.js when present; silent no-op otherwise.
// (import.meta.glob keeps the build working even if the module is missing.)
const noop = () => {};
const pending = {}; // music/ambience requested before the module loaded
const proxy = {
  ready: false,
  unlock: noop,
  play: noop,
  setMuted: noop,
  isMuted: () => false,
  toggleMute: () => false,
  setVolumes: noop,
  getVolumes: () => ({ master: 0.8, sfx: 0.9, music: 0.5, ambience: 0.6 }),
  setMusic: (mood) => { pending.music = mood; },
  getMusic: () => pending.music ?? null,
  setAmbience: (o) => { pending.ambience = o; },
  update: noop,
  babble: () => 0,
  stopBabble: noop,
};

const mods = import.meta.glob('../audio/audio.js');
const load = mods['../audio/audio.js'];
if (load) {
  load()
    .then((m) => {
      const a = m.default || m.audio;
      if (!a) return;
      for (const k of Object.keys(proxy)) {
        if (typeof a[k] === 'function') proxy[k] = (...args) => { try { return a[k](...args); } catch { return undefined; } };
      }
      proxy.ready = true;
      if ('music' in pending) proxy.setMusic(pending.music);
      if (pending.ambience) proxy.setAmbience(pending.ambience);
    })
    .catch(noop);
}

export default proxy;
