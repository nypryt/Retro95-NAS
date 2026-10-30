/* Win95 NAS - authentic Windows 95 sound scheme (sample based) */
(function () {
  "use strict";

  // Each event maps to a real Windows 95 sample. `trim` fades the sample out
  // early so short UI feedback stays short.
  const FILES = {
    startup: { url: "/sounds/startup.mp3", gain: 1.0 },
    shutdown: { url: "/sounds/shutdown.mp3", gain: 1.0 },
    error: { url: "/sounds/error.mp3", gain: 0.9 },
    ding: { url: "/sounds/ding.wav", gain: 0.9 },
    tada: { url: "/sounds/tada.wav", gain: 0.9 },
    open: { url: "/sounds/chimes.wav", gain: 0.75, trim: 1.9 },
    close: { url: "/sounds/chord.wav", gain: 0.75, trim: 1.2 },
    minimize: { url: "/sounds/chord.wav", gain: 0.5, trim: 0.32 },
    maximize: { url: "/sounds/chimes.wav", gain: 0.5, trim: 0.32 },
    click: { url: "/sounds/ding.wav", gain: 0.28, trim: 0.09 },
    tick: { url: "/sounds/ding.wav", gain: 0.16, trim: 0.055 },
  };

  let ctx = null;
  let master = null;
  let lastPlayed = 0;
  const buffers = new Map();
  const pending = new Map();

  function audio() {
    if (!ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function config() {
    try {
      return (window.Settings && Settings.get().sound) || { enabled: true, volume: 0.35 };
    } catch (_e) {
      return { enabled: true, volume: 0.35 };
    }
  }

  function load(name) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name));
    if (pending.has(name)) return pending.get(name);
    const entry = FILES[name];
    if (!entry) return Promise.resolve(null);
    const ac = audio();
    if (!ac) return Promise.resolve(null);
    const job = fetch(entry.url, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("sound " + response.status);
        return response.arrayBuffer();
      })
      .then((data) => ac.decodeAudioData(data))
      .then((buffer) => {
        buffers.set(name, buffer);
        pending.delete(name);
        return buffer;
      })
      .catch(() => {
        pending.delete(name);
        return null;
      });
    pending.set(name, job);
    return job;
  }

  function start(name, buffer) {
    const ac = audio();
    if (!ac || !buffer) return;
    const entry = FILES[name];
    const src = ac.createBufferSource();
    const amp = ac.createGain();
    const t0 = ac.currentTime;
    const full = buffer.duration;
    const dur = entry.trim ? Math.min(entry.trim, full) : full;
    src.buffer = buffer;
    amp.gain.setValueAtTime(Math.max(0.0001, entry.gain), t0);
    if (dur < full) {
      const fadeAt = Math.max(t0 + 0.01, t0 + dur - 0.07);
      amp.gain.setValueAtTime(Math.max(0.0001, entry.gain), fadeAt);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }
    src.connect(amp);
    amp.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function play(name) {
    const cfg = config();
    if (!cfg.enabled) return;
    const entry = FILES[name];
    if (!entry) return;
    const ac = audio();
    if (!ac) return;
    const now = performance.now();
    if (now - lastPlayed < 25) return;
    lastPlayed = now;
    try {
      master.gain.value = Math.max(0.0001, Math.min(1, (typeof cfg.volume === "number" ? cfg.volume : 0.35) * 1.8));
      const ready = buffers.get(name);
      if (ready) start(name, ready);
      else load(name).then((buffer) => { if (buffer) start(name, buffer); });
    } catch (_e) {
      /* audio is a luxury, not a requirement */
    }
  }

  function preload() {
    audio();
    Object.keys(FILES).forEach((name) => { load(name); });
  }

  window.Sound = {
    play,
    resume() { preload(); },
    test(name) { play(name); },
    preload,
  };
})();
