// Forwards to src/audio/audio.js when present; silent no-op otherwise.
// (import.meta.glob keeps the build working even if the module is missing.)
const noop = () => {};
const proxy = {
  ready: false,
  unlock: noop,
  play: noop,
  setMuted: noop,
  isMuted: () => false,
  toggleMute: () => false,
  setVolumes: noop,
  getVolumes: () => ({ master: 0.8, sfx: 0.9, music: 0.5, ambience: 0.6 }),
  setMusic: noop,
  setAmbience: noop,
  update: noop,
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
      if (proxy._pendingMusic !== undefined) proxy.setMusic(proxy._pendingMusic);
    })
    .catch(noop);
}

export default proxy;
