import { createMusicSamples } from './music-samples.js';

const music = createMusicSamples();
self.postMessage(music, music.channels.map(channel => channel.buffer));
