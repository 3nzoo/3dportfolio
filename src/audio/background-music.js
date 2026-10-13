import { MUSIC_SETTINGS } from './music-samples.js';

const MUTE_KEY = 'florenzo:background-music-muted';

export function createBackgroundMusic() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const supported = Boolean(AudioContext && window.Worker);
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* Optional storage. */ }
  let context, buffer, voice, worker, finishSamples;
  let disposed = false, interacted = false, starting = false, generation = 0, offset = 0;
  const voices = new Set();
  const samplesReady = new Promise(resolve => {
    finishSamples = data => { worker?.terminate(); worker = null; resolve(data); };
    if (!supported) { finishSamples(null); return; }
    try {
      worker = new Worker(new URL('./music-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = event => finishSamples(event.data);
      worker.onerror = () => finishSamples(null);
    } catch { finishSamples(null); }
  });

  function release(item) {
    item.source.onended = null;
    item.source.disconnect(); item.gain.disconnect(); voices.delete(item);
  }
  function stop(fade = false) {
    generation++; starting = false;
    if (voice) offset = (voice.offset + Math.max(0, context.currentTime - voice.started)) % buffer.duration;
    voice = null;
    for (const item of voices) {
      if (fade && context.state === 'running') {
        item.gain.gain.cancelAndHoldAtTime?.(context.currentTime);
        if (!item.gain.gain.cancelAndHoldAtTime) {
          item.gain.gain.cancelScheduledValues(context.currentTime);
          item.gain.gain.setValueAtTime(item.gain.gain.value, context.currentTime);
        }
        item.gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.35);
        try { item.source.stop(context.currentTime + 0.4); } catch { release(item); }
      } else {
        try { item.source.stop(); } catch { /* Already stopped. */ }
        release(item);
      }
    }
  }
  async function start() {
    if (!supported || disposed || muted || !interacted || document.hidden || voice || starting) return;
    starting = true;
    const request = ++generation;
    try {
      context ||= new AudioContext();
      const resume = context.state === 'running' ? Promise.resolve() : context.resume();
      const [, data] = await Promise.all([resume, samplesReady]);
      if (!data || request !== generation || disposed || muted || document.hidden || context.state !== 'running') return;
      if (!buffer) {
        buffer = context.createBuffer(2, data.channels[0].length, data.sampleRate);
        data.channels.forEach((channel, index) => buffer.getChannelData(index).set(channel));
      }
      // Clear any previous fade-out before starting a fresh, quiet fade-in.
      for (const old of voices) { try { old.source.stop(); } catch {} release(old); }
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.loop = true;
      source.connect(gain); gain.connect(context.destination);
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(MUSIC_SETTINGS.volume, context.currentTime + 2);
      voice = { source, gain, offset, started: context.currentTime };
      const item = voice;
      voices.add(item); source.onended = () => release(item);
      source.start(context.currentTime, offset);
    } catch { /* Music must never block the board or content. */ }
    finally { if (request === generation) starting = false; }
  }
  function interaction() { interacted = true; void start(); }
  function visibility() {
    if (document.hidden) {
      stop();
      if (context?.state === 'running') void context.suspend().catch(() => {});
    } else void start();
  }
  document.addEventListener('pointerdown', interaction, { capture: true, passive: true });
  document.addEventListener('keydown', interaction, { capture: true });
  document.addEventListener('visibilitychange', visibility);
  return {
    get supported() { return supported; },
    get muted() { return muted; },
    setMuted(value) {
      muted = Boolean(value);
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* Optional storage. */ }
      if (muted) stop(true);
      else { interacted = true; void start(); }
    },
    dispose() {
      disposed = true; stop(); finishSamples(null);
      document.removeEventListener('pointerdown', interaction, true);
      document.removeEventListener('keydown', interaction, true);
      document.removeEventListener('visibilitychange', visibility);
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    },
  };
}
