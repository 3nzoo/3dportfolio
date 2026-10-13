import assert from 'node:assert/strict';
import { createMusicSamples, MUSIC_SETTINGS } from '../src/audio/music-samples.js';
import { createBackgroundMusic } from '../src/audio/background-music.js';

const samples = createMusicSamples();
assert.equal(samples.channels.length, 2);
assert.ok(Math.abs(samples.channels[0].length / samples.sampleRate - 16 * 3 * 60 / 66) < 0.001);
for (const channel of samples.channels) {
  let peak = 0, sum = 0;
  for (const value of channel) { assert.ok(Number.isFinite(value)); peak = Math.max(peak, Math.abs(value)); sum += value * value; }
  assert.ok(peak > 0.4 && peak <= 0.721, 'Music should have usable headroom without clipping.');
  assert.ok(Math.sqrt(sum / channel.length) * MUSIC_SETTINGS.volume < 0.04, 'Background music must stay quiet.');
  assert.ok(Math.abs(channel[0] - channel.at(-1)) < 0.02, 'The loop seam must not introduce a click.');
}

const contexts = [], workers = [], stored = new Map();
class Parameter {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  cancelAndHoldAtTime() {}
}
class Context {
  state = 'suspended'; currentTime = 0; destination = {}; sources = [];
  constructor() { contexts.push(this); }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  createGain() { return { gain: new Parameter(), connect() {}, disconnect() {} }; }
  createBuffer(channels, length, rate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / rate, getChannelData: index => data[index] };
  }
  createBufferSource() {
    const source = { connect() {}, disconnect() {}, start(time, offset) { this.started = { time, offset }; }, stop(time = 0) { this.stopped = time; } };
    this.sources.push(source); return source;
  }
}
class SampleWorker {
  constructor() { workers.push(this); }
  terminate() { this.terminated = true; }
  complete() { this.onmessage({ data: samples }); }
}
globalThis.window = { AudioContext: Context, Worker: SampleWorker };
globalThis.Worker = SampleWorker;
globalThis.document = Object.assign(new EventTarget(), { hidden: false });
globalThis.localStorage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const interact = () => document.dispatchEvent(new Event('pointerdown'));
const music = createBackgroundMusic();
assert.equal(contexts.length, 0, 'Loading must not autoplay audio.');
interact(); music.setMuted(true); workers[0].complete(); await flush();
assert.equal(contexts[0].sources.length, 0, 'Muting during preparation must cancel pending playback.');
music.setMuted(false); await flush();
const context = contexts[0];
assert.equal(context.sources.length, 1);
assert.equal(context.sources[0].loop, true);
interact(); interact(); await flush();
assert.equal(context.sources.length, 1, 'Repeated interactions must not layer music loops.');
context.currentTime = 7;
document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); await flush();
assert.equal(context.state, 'suspended');
document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); await flush();
assert.equal(context.sources.at(-1).started.offset, 7, 'Returning should resume the passage instead of restarting.');
music.setMuted(true);
assert.equal(context.sources.at(-1).stopped, 7.4, 'Muting should allow a short fade-out.');
assert.equal(stored.get('florenzo:background-music-muted'), '1');
music.dispose(); await flush();
assert.equal(context.state, 'closed');
interact(); await flush();
assert.equal(context.sources.length, 2, 'Disposal must remove interaction listeners.');
const remembered = createBackgroundMusic();
assert.equal(remembered.muted, true);
remembered.dispose();
window.AudioContext = undefined;
const unsupported = createBackgroundMusic();
assert.equal(unsupported.supported, false);
unsupported.setMuted(false); unsupported.dispose();
console.log('Music verified: stereo levels and loop seam, gesture start, cancellation, single playback, mute persistence, hidden-tab pause/resume, cleanup, and unsupported browsers.');
