// Overall volume and per-effect levels can be adjusted here (0–1).
export const SOUND_LEVELS = {
  master: 0.65,
  launch: 0.9,
  roll: 0.65,
  pin: 0.72,
  land: 0.8,
  popup: 0.75,
};
const MUTE_KEY = 'florenzo:board-sound-muted';
const MAX_VOICES = 12;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createBoardAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const supported = Boolean(AudioContext && window.Worker);
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* Storage may be unavailable. */ }
  let context, master, buffers, resumePending, rollVoice, sampleWorker, finishSamples;
  let disposed = false, generation = 0, rollRequest = 0, lastPinTime = -Infinity;
  const voices = new Set();
  // Preparation runs while the board loads, without delaying a click or frame.
  // The worker transfers ownership of the small sample buffers, then terminates.
  const samplesReady = new Promise(resolve => {
    finishSamples = data => {
      sampleWorker?.terminate();
      sampleWorker = null;
      resolve(data);
    };
    if (!supported) { finishSamples(null); return; }
    try {
      sampleWorker = new Worker(new URL('./sound-worker.js', import.meta.url), { type: 'module' });
      sampleWorker.onmessage = event => finishSamples(event.data);
      sampleWorker.onerror = () => finishSamples(null);
    } catch { finishSamples(null); }
  });

  function unlock() {
    if (disposed || muted || document.hidden || !supported) return Promise.resolve(false);
    try {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = SOUND_LEVELS.master;
        master.connect(context.destination);
      }
      if (context.state === 'running' && buffers) return Promise.resolve(true);
      if (context.state !== 'running' && !resumePending) {
        resumePending = context.resume().then(() => context.state === 'running', () => false)
          .finally(() => { resumePending = null; });
      }
      return Promise.all([resumePending || Promise.resolve(true), samplesReady]).then(([ready, data]) => {
        if (!ready || !data || disposed || muted || document.hidden || context.state !== 'running') return false;
        if (!buffers) buffers = Object.fromEntries(Object.entries(data.samples).map(([name, samples]) => {
          const buffer = context.createBuffer(1, samples.length, data.sampleRate);
          buffer.getChannelData(0).set(samples);
          return [name, buffer];
        }));
        return true;
      }).catch(() => false);
    } catch {
      // Audio support never prevents the board or its content from working.
      return Promise.resolve(false);
    }
  }

  function stopVoice(voice) {
    if (!voice) return;
    voice.source.onended = null;
    try { voice.source.stop(); } catch { /* Already finished. */ }
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.pan?.disconnect();
    voices.delete(voice);
    if (rollVoice === voice) rollVoice = null;
  }

  function silence() {
    generation++;
    for (const voice of voices) stopVoice(voice);
    lastPinTime = -Infinity;
  }

  function play(name, { rate = 1, level = 1, pan = 0, delay = 0 } = {}) {
    if (disposed || muted || document.hidden || !supported) return;
    const requestedGeneration = generation, requestedAt = performance.now();
    const requestedRoll = rollRequest;
    const start = () => {
      // Do not replay old effects after a permission delay, mute, or tab change.
      if (disposed || muted || document.hidden || !buffers || context?.state !== 'running'
        || requestedGeneration !== generation || (name === 'roll' && requestedRoll !== rollRequest)
        || performance.now() - requestedAt > 250) return;
      try {
        if (voices.size >= MAX_VOICES) stopVoice(voices.values().next().value);
        const source = context.createBufferSource(), gain = context.createGain();
        source.buffer = buffers[name];
        source.playbackRate.value = rate;
        gain.gain.value = SOUND_LEVELS[name] * level;
        source.connect(gain);
        const panner = context.createStereoPanner?.();
        if (panner) {
          panner.pan.value = clamp(pan, -0.8, 0.8);
          gain.connect(panner);
          panner.connect(master);
        } else gain.connect(master);
        const voice = { source, gain, pan: panner };
        voices.add(voice);
        if (name === 'roll') rollVoice = voice;
        source.onended = () => stopVoice(voice);
        source.start(context.currentTime + delay);
      } catch { /* Continue silently if audio output is unavailable. */ }
    };
    if (context?.state === 'running' && buffers) start();
    else void unlock().then(ready => { if (ready) start(); });
  }

  function handleInteraction() { void unlock(); }
  function handleVisibility() {
    if (document.hidden) {
      silence();
      if (context?.state === 'running') void context.suspend().catch(() => {});
    } else if (context) void unlock();
  }
  document.addEventListener('pointerdown', handleInteraction, { capture: true, passive: true });
  document.addEventListener('keydown', handleInteraction, { capture: true });
  document.addEventListener('visibilitychange', handleVisibility);

  return {
    get muted() { return muted; },
    get supported() { return supported; },
    unlock,
    setMuted(value) {
      muted = Boolean(value);
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* Keep the in-memory preference. */ }
      if (muted) silence();
      else void unlock();
    },
    launch(power, channelSeconds) {
      const strength = clamp((power - 0.5) / 13.5, 0, 1);
      lastPinTime = -Infinity;
      stopVoice(rollVoice);
      play('launch', { rate: 0.92 + strength * 0.25, level: 0.75 + strength * 0.25, pan: 0.55 });
      play('roll', { rate: 1.05 / channelSeconds, pan: 0.55 });
    },
    stopRoll() { rollRequest++; stopVoice(rollVoice); },
    pin(hit) {
      const now = performance.now();
      // Cap clustered same-frame collisions; each audible tap remains tied to a hit.
      if (now - lastPinTime < 28) return;
      lastPinTime = now;
      play('pin', { rate: 0.91 + Math.random() * 0.18,
        level: 0.48 + clamp(hit.strength, 0, 1) * 0.52, pan: hit.x / 3.6 * 0.6 });
    },
    land(x) { play('land', { pan: x / 3.6 * 0.6 }); },
    popup() { play('popup', { delay: 0.06 }); },
    dispose() {
      disposed = true;
      silence();
      finishSamples(null);
      document.removeEventListener('pointerdown', handleInteraction, true);
      document.removeEventListener('keydown', handleInteraction, true);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    },
  };
}
