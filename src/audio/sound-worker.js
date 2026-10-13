import { createSoundSamples } from './sound-samples.js';

const sampleRate = 44100;
const samples = createSoundSamples(sampleRate);
self.postMessage({ sampleRate, samples }, Object.values(samples).map(data => data.buffer));
