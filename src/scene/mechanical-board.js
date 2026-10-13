import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOARD_SETTINGS, createBoardPins } from '../game/board-settings.js';
import { launchChannel } from '../game/launch-channel.js';

// Visual layout only: the launch curve, pin field, and recorded physics stay fixed.
export const CABINET_LAYOUT = { bottomY: 0.64, topY: 11.07, centerY: 6.15, fitHeight: 11.9 };
export const NAMEPLATE_LAYOUT = { y: 10.1, z: 0.776, halfWidth: 3.3 };

export function createMechanicalBoard(scene) {
  const board = new THREE.Group();
  board.name = 'MechanicalPortfolioBoard';
  scene.add(board);
  const material = (color, metalness = 0, roughness = 0.5) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const brass = material(0xa88b55, 0.84, 0.4);
  const darkBrass = material(0x493b29, 0.78, 0.54);
  const channelLining = material(0x4b4031, 0.72, 0.48);
  channelLining.side = THREE.DoubleSide;
  const bronzeSkin = material(0x80623a, 0.8, 0.52);
  const wood = material(0x362216, 0.02, 0.72);
  const forest = material(0x0b2018, 0.12, 0.6);
  const playfield = material(0x0c251b, 0.08, 0.68);
  forest.envMapIntensity = playfield.envMapIntensity = 0.2;
  const steel = material(0xa8b4a1, 0.9, 0.22);
  const circuitInk = material(0x35412c, 0.2, 0.78);
  const shadow = new THREE.MeshBasicMaterial({ color: 0x05110b });
  function finishMaterial(mat, map, strength, base, relief, weathering) {
    mat.map = map;
    mat.bumpMap = map;
    mat.bumpScale = relief;
    mat.color.set(0xffffff);
    mat.userData.textureStrength = strength;
    mat.userData.textureBase = new THREE.Color(base);
    // Preserve broad grain and patina without making fine surface noise read
    // as pixels. The fallback uses the same blend before applying its lighting.
    mat.onBeforeCompile = shader => {
      shader.uniforms.finishStrength = { value: strength };
      shader.uniforms.finishBase = { value: mat.userData.textureBase };
      shader.uniforms.finishWeathering = { value: weathering };
      shader.fragmentShader = `uniform float finishStrength;\nuniform vec3 finishBase;\nuniform float finishWeathering;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
        THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;',
          'diffuseColor *= vec4(mix(finishBase, sampledDiffuseColor.rgb, finishStrength), sampledDiffuseColor.a);'));
      // Dark grain/patina stays rough; lighter worn edges catch a tighter glint.
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
        `${THREE.ShaderChunk.roughnessmap_fragment}\n#ifdef USE_MAP\nroughnessFactor = clamp(roughnessFactor + (0.28 - dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))) * finishWeathering, 0.24, 0.92);\n#endif`);
    };
    mat.customProgramCacheKey = () => 'classic-finish-v2';
    mat.needsUpdate = true;
  }
  const pins = createBoardPins();
  const pinReactions = pins.map(() => ({ age: 1, strength: 0, directionX: 0, directionY: 0 }));
  const pinMatrix = new THREE.Matrix4();
  const pinColor = new THREE.Color();
  const restingPinColors = pins.map((pin, index) => new THREE.Color(0xb29358).multiplyScalar(0.94 + Math.sin(index * 17.3) * 0.06));
  const struckPinColor = new THREE.Color(0xffd78c);
  const add = (geometry, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    board.add(mesh);
    return mesh;
  };
  const box = (w, h, d, mat, x, y, z, radius = 0) => {
    const geometry = radius ? new RoundedBoxGeometry(w, h, d, 1, radius) : new THREE.BoxGeometry(w, h, d);
    if (mat === wood) {
      // Run grain along each timber, keeping its scale on the narrow rails.
      const position = geometry.attributes.position, uv = geometry.attributes.uv;
      const vertical = h >= w, length = Math.max(w, h), across = Math.min(w, h);
      for (let i = 0; i < position.count; i++) {
        const along = vertical ? position.getY(i) : position.getX(i);
        const cross = vertical ? position.getX(i) : position.getY(i);
        uv.setXY(i, 0.1 + (cross + across / 2) / Math.max(2, across) * 0.8,
          (along + length / 2) / Math.max(8.72, length));
      }
    }
    return add(geometry, mat, x, y, z);
  };
  const engraving = (points, width) => {
    const positions = [], uv = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dx = -(b[1] - a[1]) / length * width / 2, dy = (b[0] - a[0]) / length * width / 2;
      const corners = [[a[0] + dx, a[1] + dy, a[2]], [a[0] - dx, a[1] - dy, a[2]],
        [b[0] + dx, b[1] + dy, b[2]], [b[0] - dx, b[1] - dy, b[2]]];
      for (const index of [0, 1, 2, 2, 1, 3]) { positions.push(...corners[index]); uv.push(index % 2, index > 1 ? 1 : 0); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    return add(geometry, circuitInk, 0, 0, 0);
  };
  const screwGeometry = new THREE.SphereGeometry(0.066, 8, 6);
  const washerGeometry = new THREE.RingGeometry(0.047, 0.093, 12);
  const screw = (x, y, z) => {
    add(washerGeometry, darkBrass, x, y, z - 0.007);
    const head = add(screwGeometry, brass, x, y, z);
    head.scale.z = 0.35;
    const slot = box(0.069, 0.01, 0.007, darkBrass, x, y, z + 0.025);
    slot.rotation.z = (x * 1.73 + y * 0.61) % Math.PI;
  };

  // Layered walnut case, recessed enamel bed, and raised brass mouldings.
  box(8.72, 10.3, 0.7, wood, 0, 5.85, -0.63, 0.18);
  box(7.68, 8.46, 0.12, darkBrass, 0, 5.35, -0.23, 0.055);
  box(7.5, 8.31, 0.12, playfield, 0, 5.35, -0.145, 0.035);
  // Muted etched traces use one batched material, without glossy overlays.
  for (let i = 0; i < 40; i++) {
    const x = -3.15 + (i % 8) * 0.84, y = 3.2 + Math.floor(i / 8) * 1.03;
    const direction = i % 2 ? 1 : -1;
    engraving([[x, y, -0.076], [x + direction * 0.19, y, -0.076], [x + direction * 0.37, y + 0.16, -0.076], [x + direction * 0.58, y + 0.16, -0.076]], 0.011);
  }
  // Dark inner rebates and a fine brass bead make the bed read as recessed.
  for (const x of [-3.69, 3.69]) {
    box(0.085, 6.7, 0.035, darkBrass, x, 5.98, -0.045);
    box(0.019, 6.7, 0.03, brass, x - Math.sign(x) * 0.06, 5.98, -0.021);
  }
  for (const x of [-4.04, 4.04]) {
    // Recess the right timber behind the open launch guide so it cannot cover
    // the ball. The left rail keeps its full cabinet depth.
    box(0.53, 10.18, x > 0 ? 0.3 : 0.66, wood, x, 5.85, x > 0 ? -0.4 : -0.19, 0.075);
    box(0.07, 10.0, 0.14, brass, x - Math.sign(x) * 0.255, 5.85, 0.11, 0.025);
    if (x < 0) {
      box(0.04, 10.11, 0.1, darkBrass, x + Math.sign(x) * 0.255, 5.85, 0.11);
      box(0.025, 9.87, 0.06, brass, x + Math.sign(x) * 0.17, 5.85, 0.16);
    }
    for (const y of [1.0, 2.5, 4.2, 5.95, 7.7, 10.68]) screw(x > 0 && y < 8.3 ? 3.8 : x, y, 0.16);
  }
  for (const y of [0.86, 10.85]) {
    box(8.66, 0.43, 0.7, wood, 0, y, -0.16, 0.085);
    box(8.25, 0.06, 0.12, brass, 0, y + (y < 5 ? 0.235 : -0.235), 0.18, 0.02);
    box(8.36, 0.022, 0.06, darkBrass, 0, y, 0.2);
  }
  // Corner shoes emphasize the joinery without adding lights.
  for (const x of [-4.04, 4.04]) for (const y of [1.11, 10.55]) {
    box(0.38, 0.31, 0.11, bronzeSkin, x, y, 0.21, 0.045);
    screw(x, y, 0.285);
  }
  box(7.63, 0.13, 0.24, bronzeSkin, 0, 2.67, 0.035, 0.035);
  box(7.73, 0.52, 0.3, forest, 0, 1.19, 0.0, 0.04);
  box(7.46, 0.035, 0.07, brass, 0, 1.48, 0.19);
  for (const x of [-3.45, 3.45]) screw(x, 1.16, 0.175);
  // Small corner fasteners frame the pocket plates without adding labels.
  for (const x of [-2.7, -0.9, 0.9, 2.7]) {
    for (const dx of [-0.72, 0.72]) screw(x + dx, 2.46, 0.03);
    box(1.47, 0.022, 0.015, darkBrass, x, 2.51, 0.018);
  }

  // Raise the taller nameplate above the elbow so its whole route is visible.
  const nameplateY = NAMEPLATE_LAYOUT.y;
  box(7.82, 1.64, 0.52, darkBrass, 0, nameplateY, 0.33, 0.12);
  const hood = box(7.65, 1.46, 0.15, bronzeSkin, 0, nameplateY, 0.64, 0.07);
  hood.name = 'LaunchHood';
  box(7.38, 1.34, 0.04, darkBrass, 0, nameplateY, 0.728, 0.025);
  box(7.16, 1.2, 0.035, forest, 0, nameplateY, 0.754, 0.02);
  for (const y of [nameplateY - 0.717, nameplateY + 0.717]) box(7.42, 0.026, 0.055, brass, 0, y, 0.745);
  for (const x of [-3.59, 3.59]) screw(x, nameplateY, 0.795);

  // Chamfered copper guides, outside the unchanged physics rails.
  for (let i = 0; i < 8; i++) {
    const y = 3.05 + i * 0.7;
    const shape = new THREE.Shape();
    shape.moveTo(-3.79, y - 0.34); shape.lineTo(-3.6, y); shape.lineTo(-3.79, y + 0.34); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.015, bevelSegments: 1 });
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox, positions = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, (positions.getX(j) - bounds.min.x) / (bounds.max.x - bounds.min.x), (positions.getY(j) - bounds.min.y) / (bounds.max.y - bounds.min.y));
    add(geometry, bronzeSkin, 0, 0, 0.025);
  }
  const headGeometry = new THREE.SphereGeometry(BOARD_SETTINGS.pinRadius, 12, 8);
  // One draw call for all moving pin heads; their colliders and bases stay fixed.
  const heads = new THREE.InstancedMesh(headGeometry, brass.clone(), pins.length);
  heads.material.color.set(0xffffff);
  heads.name = 'PortfolioPin-Heads';
  heads.frustumCulled = false;
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.userData.renderKind = 'pin';
  heads.userData.pulses = new Float32Array(pins.length);
  board.add(heads);
  const ripples = new THREE.InstancedMesh(new THREE.RingGeometry(0.145, 0.158, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), pins.length);
  ripples.name = 'PortfolioPin-Ripples';
  ripples.frustumCulled = false;
  ripples.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ripples.userData.renderKind = 'pin-ripple';
  ripples.userData.radius = 0.158;
  ripples.userData.opacity = new Float32Array(pins.length);
  board.add(ripples);
  const stemGeometry = new THREE.CylinderGeometry(0.042, 0.055, 0.18, 8);
  const baseGeometry = new THREE.CylinderGeometry(0.082, 0.082, 0.025, 12);
  const pinSeatGeometry = new THREE.RingGeometry(0.074, 0.115, 12);
  const shadowGeometry = new THREE.CircleGeometry(0.14, 10);
  for (const [index, pin] of pins.entries()) {
    add(shadowGeometry, shadow, pin.x + 0.035, pin.y - 0.035, -0.07);
    pinMatrix.makeTranslation(pin.x, pin.y, 0.12);
    heads.setMatrixAt(index, pinMatrix); heads.setColorAt(index, restingPinColors[index]);
    pinMatrix.makeScale(0, 0, 0); ripples.setMatrixAt(index, pinMatrix); ripples.setColorAt(index, restingPinColors[index]);
    add(pinSeatGeometry, darkBrass, pin.x, pin.y, -0.062);
    const stem = add(stemGeometry, darkBrass, pin.x, pin.y, 0.025); stem.rotation.x = Math.PI / 2;
    const base = add(baseGeometry, brass, pin.x, pin.y, -0.055); base.rotation.x = Math.PI / 2;
  }

  // Open-backed half-pipe: its mouth faces the camera, exposing the rising
  // ball. Narrow brass lips guide it into the closed elbow above.
  add(new THREE.CylinderGeometry(0.245, 0.245, 5.32, 12, 1, true, Math.PI / 2, Math.PI),
    channelLining, 4.12, 5.52, 0.12);
  for (const x of [3.865, 4.375]) box(0.035, 5.32, 0.08, brass, x, 5.52, 0.12, 0.012);
  for (const y of [3.05, 4.47, 5.89, 7.31]) {
    // Mounts flank the opening instead of crossing in front of the ball.
    for (const x of [3.83, 4.41]) box(0.105, 0.13, 0.09, bronzeSkin, x, y, 0.09, 0.018);
  }
  const elbowStart = 0.77;
  const bend = Array.from({ length: 25 }, (_, i) => {
    const point = launchChannel.getPointAt(elbowStart + i / 24 * (1 - elbowStart));
    return [point.x, point.y, point.z];
  });
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bend.map(point => new THREE.Vector3(...point))),
    32, 0.255, 20, false), bronzeSkin, 0, 0, 0);
  for (const progress of [elbowStart, 0.85, 0.94]) {
    const point = launchChannel.getPointAt(progress);
    const collar = add(new THREE.TorusGeometry(0.259, 0.028, 6, 20), brass, point.x, point.y, point.z);
    collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), launchChannel.getTangentAt(progress));
    const seam = add(new THREE.TorusGeometry(0.257, 0.009, 4, 20), darkBrass, point.x, point.y, point.z);
    seam.position.addScaledVector(launchChannel.getTangentAt(progress), 0.041);
    seam.quaternion.copy(collar.quaternion);
  }
  const outlet = add(new THREE.TorusGeometry(0.246, 0.027, 6, 20), brass, 3.1, 8.95, 0.12); outlet.rotation.y = Math.PI / 2;

  // Exposed spring, anchored at its bottom and drawn down for stronger shots.
  for (const x of [3.84, 4.4]) box(0.045, 2.05, 0.09, brass, x, 1.7, 0.0);
  box(0.7, 2.06, 0.12, forest, 4.12, 1.7, -0.18);
  const coilPoints = Array.from({ length: 177 }, (_, i) => {
    const t = i / 176, angle = t * Math.PI * 2 * BOARD_SETTINGS.springTurns;
    return new THREE.Vector3(Math.cos(angle) * 0.17, t, Math.sin(angle) * 0.17);
  });
  const spring = add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPoints), 176, 0.025, 5, false), steel, 4.12, 1.0, 0.18); spring.name = 'LaunchSpring';
  const plunger = add(new THREE.CylinderGeometry(0.225, 0.225, 0.13, 16), brass, 4.12, 1.0, 0.18); plunger.name = 'LaunchPlunger';
  box(0.1, 1.92, 0.1, darkBrass, 4.12, 1.65, -0.005);
  const cap = add(new THREE.CylinderGeometry(0.205, 0.205, 0.1, 16), brass, 4.12, 2.7, 0.18); cap.name = 'LaunchHead';
  function setSpring(length) {
    spring.scale.y = length; spring.position.y = BOARD_SETTINGS.springBaseY;
    plunger.position.y = BOARD_SETTINGS.springBaseY + length + 0.08;
    cap.position.y = BOARD_SETTINGS.springBaseY + length + 0.16;
  }
  setSpring(1.25);

  // Batch static pieces by material; keep moving parts and pin heads separate.
  const batches = new Map(), sourceGeometry = new Set();
  for (const mesh of [...board.children]) {
    if (!mesh.isMesh || mesh.name.startsWith('PortfolioPin-') || mesh.name.startsWith('Launch')) continue;
    mesh.updateMatrix();
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix); geometry.clearGroups();
    const parts = batches.get(mesh.material) || [];
    parts.push(geometry); batches.set(mesh.material, parts);
    sourceGeometry.add(mesh.geometry); board.remove(mesh);
  }
  for (const [mat, parts] of batches) {
    add(mergeGeometries(parts, false), mat, 0, 0, 0).name = `CabinetBatch-${mat.uuid}`;
    parts.forEach(part => part.dispose());
  }
  sourceGeometry.forEach(geometry => geometry.dispose());
  board.traverse(mesh => {
    if (!mesh.isMesh || mesh.material.isMeshBasicMaterial) return;
    mesh.receiveShadow = true;
    // Moving spring parts use their material shading; their baked shadow would
    // otherwise stay behind when the plunger is pulled down.
    mesh.castShadow = !['LaunchSpring', 'LaunchPlunger', 'LaunchHead'].includes(mesh.name);
  });
  return {
    pins,
    hitPin(hit) {
      const reaction = pinReactions[hit.index];
      if (!reaction) return;
      Object.assign(reaction, { age: 0, strength: hit.strength ?? 1,
        directionX: hit.directionX ?? 0, directionY: hit.directionY ?? -1 });
    },
    updatePinReactions(delta, reducedMotion = false) {
      let changed = false, active = 0;
      for (const [index, reaction] of pinReactions.entries()) {
        if (reaction.age >= 0.45) continue;
        changed = true;
        reaction.age = Math.min(0.45, reaction.age + delta);
        const t = reaction.age, ended = t >= 0.45;
        const pulse = ended ? 0 : Math.sin(Math.min(Math.PI, t * 23)) * Math.exp(-t * 5) * reaction.strength;
        const recoil = ended || reducedMotion ? 0 : Math.sin(t * 32) * Math.exp(-t * 11) * reaction.strength;
        const size = reducedMotion ? 1 : 1 + pulse * 0.36;
        pinMatrix.makeScale(size, size, 1);
        pinMatrix.setPosition(pins[index].x + recoil * 0.055 * reaction.directionX,
          pins[index].y + recoil * 0.055 * reaction.directionY, 0.12 - Math.abs(recoil) * 0.035);
        heads.setMatrixAt(index, pinMatrix);
        heads.setColorAt(index, pinColor.copy(restingPinColors[index]).lerp(struckPinColor, pulse));
        heads.userData.pulses[index] = pulse;
        const fade = ended || reducedMotion ? 0 : (1 - t / 0.45) ** 2 * reaction.strength;
        const ringSize = fade > 0 ? 1 + t * 4 : 0;
        pinMatrix.makeScale(ringSize, ringSize, 1); pinMatrix.setPosition(pins[index].x, pins[index].y, 0.26);
        ripples.setMatrixAt(index, pinMatrix);
        ripples.setColorAt(index, pinColor.copy(struckPinColor).multiplyScalar(fade));
        ripples.userData.opacity[index] = fade;
        if (!ended) active++;
      }
      if (changed) {
        heads.instanceMatrix.needsUpdate = heads.instanceColor.needsUpdate = true;
        ripples.instanceMatrix.needsUpdate = ripples.instanceColor.needsUpdate = true;
      }
      return active;
    },
    applyTextures(textures) {
      finishMaterial(wood, textures.walnut, 0.62, 0x332117, 0.022, 0.3);
      finishMaterial(bronzeSkin, textures.brass, 0.38, 0x806238, 0.006, 0.55);
      finishMaterial(forest, textures.enamel, 0.2, 0x0b2018, 0.003, 0.18);
      finishMaterial(playfield, textures.enamel, 0.22, 0x0c251b, 0.002, 0.18);
    },
    updateSpring(selection, recoil = 0) {
      const tension = 1 - THREE.MathUtils.clamp(selection, 0, 1);
      const length = THREE.MathUtils.lerp(BOARD_SETTINGS.springMaxLength, BOARD_SETTINGS.springMinLength, tension);
      const release = THREE.MathUtils.clamp(recoil, 0, 1), elapsed = 1 - release;
      const expansion = release > 0 ? (1 - Math.exp(-elapsed * 40)) * Math.exp(-elapsed * 4) : 0;
      setSpring(THREE.MathUtils.lerp(length, BOARD_SETTINGS.springMaxLength + 0.1, expansion));
      return length;
    },
    dispose() {
      const geometries = new Set(), mats = new Set();
      board.traverse(object => { if (object.isMesh) { geometries.add(object.geometry); mats.add(object.material); } });
      geometries.forEach(geometry => geometry.dispose()); mats.forEach(mat => mat.dispose());
      scene.remove(board);
    },
  };
}
