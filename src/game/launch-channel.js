import { CatmullRomCurve3, Vector3 } from 'three';
import { CHANNEL_POINTS } from './board-settings.js';

export const launchChannel = new CatmullRomCurve3(
  CHANNEL_POINTS.map(point => new Vector3(...point)), false, 'centripetal',
);
export function channelPoint(progress) {
  return launchChannel.getPointAt(Math.max(0, Math.min(1, progress)));
}
