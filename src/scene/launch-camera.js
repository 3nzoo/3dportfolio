import { MathUtils, Spherical, Vector3 } from 'three';

// A slow, bounded lean and recovery, independent of the ball's physics.
export const LAUNCH_CAMERA_SETTINGS = {
  leanSeconds: 0.7,
  settleSeconds: 1.65,
  minYaw: 0.045,
  maxYaw: 0.09,
  minPitch: 0.015,
  maxPitch: 0.035,
};
const ease = value => value * value * (3 - 2 * value);

export function createLaunchCamera(camera, controls) {
  const offset = new Vector3(), orbit = new Spherical();
  let active = false, elapsed = 0, yaw = 0, pitch = 0;
  let baseYaw = 0, basePitch = 0, radius = 0;
  const settings = LAUNCH_CAMERA_SETTINGS;

  return {
    get active() { return active; },
    start(power, scale = 1) {
      orbit.setFromVector3(offset.copy(camera.position).sub(controls.target));
      baseYaw = MathUtils.clamp(orbit.theta, controls.minAzimuthAngle, controls.maxAzimuthAngle);
      basePitch = MathUtils.clamp(orbit.phi, controls.minPolarAngle, controls.maxPolarAngle);
      radius = orbit.radius;
      const strength = MathUtils.clamp((power - 0.5) / 13.5, 0, 1);
      const yawAmount = MathUtils.lerp(settings.minYaw, settings.maxYaw, strength) * scale;
      const pitchAmount = MathUtils.lerp(settings.minPitch, settings.maxPitch, strength) * scale;
      // Prefer a leftward lean from the right launcher. At an edge, lean inward
      // so the reaction remains visible without expanding the existing limits.
      const yawDirection = baseYaw - controls.minAzimuthAngle >= yawAmount ? -1 : 1;
      const pitchDirection = controls.maxPolarAngle - basePitch >= pitchAmount ? 1 : -1;
      yaw = MathUtils.clamp(baseYaw + yawDirection * yawAmount,
        controls.minAzimuthAngle, controls.maxAzimuthAngle) - baseYaw;
      pitch = MathUtils.clamp(basePitch + pitchDirection * pitchAmount,
        controls.minPolarAngle, controls.maxPolarAngle) - basePitch;
      elapsed = 0;
      active = radius > 0;
    },
    update(delta) {
      if (!active) return;
      elapsed = Math.min(elapsed + delta, settings.leanSeconds + settings.settleSeconds);
      const amount = elapsed < settings.leanSeconds
        ? ease(elapsed / settings.leanSeconds)
        : 1 - ease(Math.min(1, (elapsed - settings.leanSeconds) / settings.settleSeconds));
      orbit.set(radius,
        MathUtils.clamp(basePitch + pitch * amount, controls.minPolarAngle, controls.maxPolarAngle),
        MathUtils.clamp(baseYaw + yaw * amount, controls.minAzimuthAngle, controls.maxAzimuthAngle));
      camera.position.copy(controls.target).add(offset.setFromSpherical(orbit));
      camera.lookAt(controls.target);
      if (elapsed >= settings.leanSeconds + settings.settleSeconds) active = false;
    },
    // Cancel at the current angle when dragging, reframing, or opening a panel.
    stop() { active = false; },
  };
}
