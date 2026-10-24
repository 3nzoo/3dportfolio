import { MathUtils, Spherical, Vector3 } from 'three';

// A pronounced, bounded perspective lean that keeps the camera distance fixed.
export const LAUNCH_CAMERA_SETTINGS = {
  leanSeconds: 0.85,
  settleSeconds: 1.9,
  minYaw: 0.09,
  maxYaw: 0.18,
  minPitch: 0.03,
  maxPitch: 0.06,
};
const ease = value => value * value * (3 - 2 * value);

export function createLaunchCamera(camera, controls) {
  const offset = new Vector3(), orbit = new Spherical();
  let active = false, elapsed = 0, yaw = 0, pitch = 0;
  let baseYaw = 0, basePitch = 0, radius = 0;
  let leanSeconds = 0, settleSeconds = 0, previousPattern = -1;
  const settings = LAUNCH_CAMERA_SETTINGS;

  return {
    get active() { return active; },
    start(power, scale = 1) {
      orbit.setFromVector3(offset.copy(camera.position).sub(controls.target));
      baseYaw = MathUtils.clamp(orbit.theta, controls.minAzimuthAngle, controls.maxAzimuthAngle);
      basePitch = MathUtils.clamp(orbit.phi, controls.minPolarAngle, controls.maxPolarAngle);
      radius = orbit.radius;
      const strength = MathUtils.clamp((power - 0.5) / 13.5, 0, 1);
      // Pick a fresh yaw/pitch pairing, avoiding the previous launch's pairing.
      const pattern = previousPattern < 0 ? Math.floor(Math.random() * 4)
        : (previousPattern + 1 + Math.floor(Math.random() * 3)) % 4;
      previousPattern = pattern;
      const yawAmount = MathUtils.lerp(settings.minYaw, settings.maxYaw, strength) * scale * MathUtils.lerp(0.85, 1, Math.random());
      const pitchAmount = MathUtils.lerp(settings.minPitch, settings.maxPitch, strength) * scale * MathUtils.lerp(0.85, 1, Math.random());
      leanSeconds = settings.leanSeconds * MathUtils.lerp(0.9, 1.15, Math.random());
      settleSeconds = settings.settleSeconds * MathUtils.lerp(0.9, 1.15, Math.random());
      let yawDirection = pattern & 1 ? 1 : -1;
      let pitchDirection = pattern & 2 ? 1 : -1;
      // An outward lean near an orbit limit turns inward instead of becoming flat.
      if ((yawDirection < 0 ? baseYaw - controls.minAzimuthAngle : controls.maxAzimuthAngle - baseYaw) < yawAmount) yawDirection *= -1;
      if ((pitchDirection < 0 ? basePitch - controls.minPolarAngle : controls.maxPolarAngle - basePitch) < pitchAmount) pitchDirection *= -1;
      yaw = MathUtils.clamp(baseYaw + yawDirection * yawAmount,
        controls.minAzimuthAngle, controls.maxAzimuthAngle) - baseYaw;
      pitch = MathUtils.clamp(basePitch + pitchDirection * pitchAmount,
        controls.minPolarAngle, controls.maxPolarAngle) - basePitch;
      elapsed = 0;
      active = radius > 0;
    },
    update(delta) {
      if (!active) return;
      elapsed = Math.min(elapsed + delta, leanSeconds + settleSeconds);
      const amount = elapsed < leanSeconds
        ? ease(elapsed / leanSeconds)
        : 1 - ease(Math.min(1, (elapsed - leanSeconds) / settleSeconds));
      orbit.set(radius,
        MathUtils.clamp(basePitch + pitch * amount, controls.minPolarAngle, controls.maxPolarAngle),
        MathUtils.clamp(baseYaw + yaw * amount, controls.minAzimuthAngle, controls.maxAzimuthAngle));
      camera.position.copy(controls.target).add(offset.setFromSpherical(orbit));
      camera.lookAt(controls.target);
      if (elapsed >= leanSeconds + settleSeconds) active = false;
    },
    // Cancel at the current angle when dragging, reframing, or opening a panel.
    stop() { active = false; },
  };
}
