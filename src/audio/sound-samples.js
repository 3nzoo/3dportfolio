// Short, original mechanical effects, prepared once in a background worker.
const TAU = Math.PI * 2;

function noise(seed) {
  let value = seed;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 2147483648 - 1;
  };
}

function sample(duration, sampleRate, render) {
  const data = new Float32Array(Math.ceil(duration * sampleRate));
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    // Tiny fades avoid clicks at the ends; headroom allows overlapping impacts.
    const fade = Math.min(1, t / 0.0015, (duration - t) / 0.015);
    data[i] = Math.tanh(render(t)) * Math.max(0, fade) * 0.75;
  }
  return data;
}

export function createSoundSamples(sampleRate = 44100) {
  const springNoise = noise(71237), rollNoise = noise(82031);
  const pinNoise = noise(91009), landNoise = noise(31081), popupNoise = noise(61043);
  let springLow = 0, rollLow = 0, rollBand = 0, pinLow = 0, landLow = 0, popupLow = 0;
  const smooth = 1 - Math.exp(-TAU * 1300 / sampleRate);
  const rollSlow = 1 - Math.exp(-TAU * 650 / sampleRate);
  const rollFast = 1 - Math.exp(-TAU * 2600 / sampleRate);
  const landSmooth = 1 - Math.exp(-TAU * 850 / sampleRate);
  return {
    launch: sample(0.42, sampleRate, t => {
      springLow += smooth * (springNoise() - springLow);
      const latch = springLow * 0.62 * Math.exp(-t / 0.018);
      const coil = Math.sin(TAU * (155 * t - 48 * t * t)) * 0.24 * Math.exp(-t / 0.09);
      const metal = Math.sin(TAU * 610 * t) * 0.11 * Math.exp(-t / 0.055)
        + Math.sin(TAU * 1037 * t) * 0.07 * Math.exp(-t / 0.038);
      return latch + coil + metal;
    }),
    roll: sample(1.05, sampleRate, t => {
      const raw = rollNoise();
      rollLow += rollSlow * (raw - rollLow);
      rollBand += rollFast * (raw - rollBand);
      const pulse = 0.58 + 0.22 * Math.sin(TAU * (22 * t + 19 * t * t));
      const envelope = Math.min(1, t / 0.045, (1.05 - t) / 0.13);
      const friction = (rollBand - rollLow) * 0.25;
      const rattle = Math.sin(TAU * (730 * t + 280 * t * t)) * 0.018;
      return (friction * pulse + rattle) * envelope;
    }),
    pin: sample(0.24, sampleRate, t => {
      const raw = pinNoise();
      pinLow += smooth * (raw - pinLow);
      const strike = (raw - pinLow) * 0.16 * Math.exp(-t / 0.008);
      // Inharmonic modes give the pin a brass tap instead of a musical beep.
      return strike + Math.sin(TAU * 1470 * t) * 0.26 * Math.exp(-t / 0.044)
        + Math.sin(TAU * 2399 * t) * 0.15 * Math.exp(-t / 0.029)
        + Math.sin(TAU * 3671 * t) * 0.075 * Math.exp(-t / 0.019)
        + Math.sin(TAU * 5107 * t) * 0.035 * Math.exp(-t / 0.012);
    }),
    land: sample(0.25, sampleRate, t => {
      landLow += landSmooth * (landNoise() - landLow);
      return landLow * 0.42 * Math.exp(-t / 0.027)
        + Math.sin(TAU * 185 * t) * 0.25 * Math.exp(-t / 0.035)
        + Math.sin(TAU * 780 * t) * 0.08 * Math.exp(-t / 0.026);
    }),
    popup: sample(0.62, sampleRate, t => {
      popupLow += smooth * (popupNoise() - popupLow);
      const bloom = (1 - Math.exp(-t / 0.022)) * Math.exp(-t / 0.14);
      const upperTime = Math.max(0, t - 0.065);
      const upperBloom = (1 - Math.exp(-upperTime / 0.015)) * Math.exp(-upperTime / 0.13);
      return (Math.sin(TAU * 523.25 * t) * 0.2 + Math.sin(TAU * 1046.5 * t) * 0.035) * bloom
        + Math.sin(TAU * 783.99 * upperTime) * 0.12 * upperBloom
        + popupLow * 0.028 * bloom;
    }),
  };
}
