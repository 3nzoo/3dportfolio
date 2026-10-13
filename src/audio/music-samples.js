// Original, slow piano miniature in C major. Circular rendering carries the
// final notes/reverb across the loop boundary instead of cutting their tails.
export const MUSIC_SETTINGS = { bpm: 66, bars: 16, beatsPerBar: 3, sampleRate: 32000, volume: 0.16 };

export function createMusicSamples(sampleRate = MUSIC_SETTINGS.sampleRate) {
  const beat = 60 / MUSIC_SETTINGS.bpm;
  const length = Math.round(MUSIC_SETTINGS.bars * MUSIC_SETTINGS.beatsPerBar * beat * sampleRate);
  const dry = new Float32Array(length);
  const chords = [
    [48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 57, 60], [43, 50, 55, 62],
    [48, 55, 59, 64], [45, 52, 60, 64], [41, 48, 57, 60], [43, 50, 59, 62],
    [40, 47, 55, 59], [45, 52, 57, 60], [41, 48, 57, 60], [43, 50, 55, 60],
    [41, 48, 57, 60], [43, 50, 59, 62], [48, 55, 60, 64], [43, 50, 55, 62],
  ];
  const melody = [76, 72, 69, 71, 74, 72, 69, 67, 71, 72, 76, 74, 72, 71, 67, 71];
  function note(midi, seconds, velocity, duration = 3.6) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const start = Math.round(seconds * sampleRate);
    const count = Math.round(duration * sampleRate);
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate;
      const attack = 1 - Math.exp(-t * 95);
      const release = Math.min(1, (duration - t) / 0.25);
      let sound = 0;
      for (let partial = 1; partial <= 4; partial++) {
        const decay = Math.exp(-t * (1.05 + partial * 0.6));
        const phase = 2 * Math.PI * frequency * partial * (1 + (partial - 1) * 0.00018) * t;
        sound += Math.sin(phase) * decay / (partial * partial);
      }
      dry[(start + i) % length] += sound * attack * release * velocity;
    }
  }
  chords.forEach((chord, bar) => {
    const time = bar * 3 * beat;
    note(chord[0], time, 0.28, 4.4);
    [1, 2, 3, 2, 1].forEach((tone, i) => {
      note(chord[tone], time + (i + 1) * beat / 2, 0.13 + (i === 2 ? 0.025 : 0));
    });
    // Leave breathing room every fourth bar rather than filling every beat.
    if (bar % 4 !== 3) note(melody[bar], time + beat * 0.12, 0.18, 4.2);
  });
  const left = new Float32Array(length), right = new Float32Array(length);
  const delays = [0.073, 0.131, 0.223, 0.367, 0.541, 0.787];
  const taps = delays.map((seconds, i) => ({
    l: Math.round(seconds * sampleRate), r: Math.round((seconds + 0.019) * sampleRate),
    gain: 0.14 * Math.exp(-i * 0.36),
  }));
  let peak = 0;
  for (let i = 0; i < length; i++) {
    let l = dry[i] * 0.85, r = dry[i] * 0.85;
    for (const tap of taps) {
      l += dry[(i - tap.l + length) % length] * tap.gain;
      r += dry[(i - tap.r + length) % length] * tap.gain;
    }
    left[i] = l; right[i] = r;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  const level = 0.72 / Math.max(peak, 0.01);
  for (let i = 0; i < length; i++) { left[i] *= level; right[i] *= level; }
  return { sampleRate, channels: [left, right] };
}
