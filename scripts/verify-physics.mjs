import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRapier } from './lib/load-rapier.mjs';
import { RECORDED_ROUTES } from '../src/game/recorded-routes.js';
import * as THREE from 'three';
import { BOARD_SETTINGS, createBoardPins, LAUNCH_ORIGIN } from '../src/game/board-settings.js';
import { createMechanicalBoard, NAMEPLATE_LAYOUT } from '../src/scene/mechanical-board.js';
import { launchChannel } from '../src/game/launch-channel.js';
import { createGamePhysics, createDestinationGamePhysics, FIXED_TIMESTEP, BALL_RADIUS, POCKETS } from '../src/game/physics.js';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function readActualPins() {
  const scene = new THREE.Scene();
  const board = createMechanicalBoard(scene);
  scene.updateMatrixWorld(true);
  const pins = board.pins;
  const exitDirection = launchChannel.getTangentAt(1);
  assert.ok(exitDirection.x < -0.99 && exitDirection.y > 0, 'The channel must turn smoothly left into the existing release direction.');
  const ray = new THREE.Raycaster();
  const nameplate = scene.getObjectByName('LaunchHood');
  const nameplateBounds = new THREE.Box3().setFromObject(nameplate);
  assert.ok(nameplateBounds.getSize(new THREE.Vector3()).y >= 1.3, 'The raised nameplate must have room for larger name and role text.');
  assert.equal(nameplate.position.y, NAMEPLATE_LAYOUT.y, 'The text and its plate must share the same vertical anchor.');
  const elbowTop = Math.max(...Array.from({length: 25}, (_, index) => launchChannel.getPointAt(0.77 + index / 24 * 0.23).y)) + 0.287;
  assert.ok(nameplateBounds.min.y > elbowTop, 'The raised nameplate must leave the full upper brass elbow visible below it.');
  // The rising ball must be exposed throughout the straight guide, including
  // both sides of its silhouette, rather than just through a narrow center slit.
  for (const progress of [0, 0.15, 0.25, 0.5, 0.7, 0.75]) {
    const point = launchChannel.getPointAt(progress);
    for (const dx of [-0.09, 0, 0.09]) {
      ray.set(new THREE.Vector3(point.x + dx, point.y, 5), new THREE.Vector3(0, 0, -1));
      const surface = ray.intersectObjects(scene.children, true)[0];
      assert.ok(!surface || surface.point.z < point.z - 0.16,
        'The straight right guide must expose the launched ball.');
    }
  }
  for (const progress of [0.8, 0.85, 0.95, 1]) {
    const point = launchChannel.getPointAt(progress);
    ray.set(new THREE.Vector3(point.x, point.y, 5), new THREE.Vector3(0, 0, -1));
    const cover = ray.intersectObjects(scene.children, true)[0];
    assert.ok(cover && cover.point.z > point.z + 0.16, 'The brass tube must contain the ball as it turns toward the pin field.');
  }
  ray.set(new THREE.Vector3(0, 7.95, 5), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObjects(scene.children, true)[0].point.z < 0.12, 'The cover must leave the pin field unobstructed.');
  let meshCount = 0, triangleCount = 0;
  scene.traverse(mesh => { if (mesh.isMesh) { meshCount++; triangleCount += (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3 * (mesh.isInstancedMesh ? mesh.count : 1); } });
  assert.ok(meshCount < 90 && triangleCount < 33364, 'The detailed board must stay lighter than the previous cabinet.');
  assert.equal(pins.length, 60, 'The experimental board must have eight staggered rows of seven/eight pins.');
  const heads = scene.getObjectByName('PortfolioPin-Heads');
  assert.equal(heads.count, pins.length, 'Every collider must have an instanced visible pin head.');
  assert.equal(heads.geometry.parameters.radius, BOARD_SETTINGS.pinRadius);
  const matrix = new THREE.Matrix4(), center = new THREE.Vector3(), scale = new THREE.Vector3();
  for (const [index, pin] of pins.entries()) {
    heads.getMatrixAt(index, matrix); center.setFromMatrixPosition(matrix);
    assert.ok(Math.hypot(pin.x - center.x, pin.y - center.y) < 0.00001, 'Visible pin must match collider coordinates at rest.');
  }
  board.hitPin({ index: 0, strength: 1, directionX: 1, directionY: 0 });
  assert.equal(board.updatePinReactions(0.05), 1);
  heads.getMatrixAt(0, matrix); center.setFromMatrixPosition(matrix); scale.setFromMatrixScale(matrix);
  assert.ok(center.x > pins[0].x + 0.015 && scale.x > 1.1, 'A struck pin must recoil and spring outward.');
  assert.ok(scene.getObjectByName('PortfolioPin-Ripples').userData.opacity[0] > 0, 'A real hit must create a brief brass ripple.');
  board.updatePinReactions(0.5);
  heads.getMatrixAt(0, matrix); center.setFromMatrixPosition(matrix); scale.setFromMatrixScale(matrix);
  assert.ok(Math.hypot(center.x - pins[0].x, center.y - pins[0].y) < 0.00001 && Math.abs(scale.x - 1) < 0.00001,
    'Pin animation must return to its exact original position and size.');
  board.hitPin({ index: 0, strength: 1, directionX: 1, directionY: 0 }); board.updatePinReactions(0.05, true);
  heads.getMatrixAt(0, matrix); center.setFromMatrixPosition(matrix); scale.setFromMatrixScale(matrix);
  assert.ok(Math.abs(center.x - pins[0].x) < 0.00001 && scale.x === 1, 'Reduced motion must suppress pin displacement and scaling.');
  board.updatePinReactions(0.5);
  const spring = scene.getObjectByName('LaunchSpring');
  const plunger = scene.getObjectByName('LaunchPlunger');
  const anchorY = spring.position.y;
  board.updateSpring(1);
  const relaxedHeadY = plunger.position.y;
  const relaxedCoilHeight = new THREE.Box3().setFromObject(spring).getSize(new THREE.Vector3()).y;
  board.updateSpring(0);
  assert.ok(plunger.position.y < relaxedHeadY - 0.8, 'The stronger left target must pull the plunger down.');
  assert.ok(new THREE.Box3().setFromObject(spring).getSize(new THREE.Vector3()).y < relaxedCoilHeight * 0.5, 'Charging must compress the rendered coils.');
  assert.equal(spring.position.y, anchorY, 'The bottom of the spring must stay anchored.');
  const chargedHeadY = plunger.position.y;
  board.updateSpring(0, 0.8);
  assert.ok(plunger.position.y > chargedHeadY + 0.3, 'The charged spring must snap upward on release.');
  board.dispose();
  return pins;
}

function verifyColliders(game, pins) {
  let count = 0;
  game.world.forEachCollider((collider) => {
    if (collider.parent()?.userData?.type !== 'pin') return;
    count += 1;
    const position = collider.parent().translation();
    const pin = pins.find((item) => Math.hypot(item.x - position.x, item.y - position.y) < 0.00001);
    assert.ok(pin, 'A peg collider must share the visible peg center.');
    assert.ok(Math.abs(collider.shape.radius - pin.radius) < 0.00001, 'Peg collider radius must match the imported geometry.');
  });
  assert.equal(count, pins.length, 'Every visible peg needs one collider.');
}

function finishLaunch(game, x, deltaSeconds, readResult) {
  assert.equal(game.launch(x), true, 'A completed game must accept the next ball.');
  assert.ok(Math.abs(game.position.x - LAUNCH_ORIGIN.x) < 0.00001 && Math.abs(game.position.y - LAUNCH_ORIGIN.y) < 0.00001, 'Ball must begin in the bottom launcher.');
  assert.equal(game.phase, 'channel', 'A ball must enter the launch channel before the peg field.');
  assert.equal(game.launch(x), false, 'A second launch must be refused while a ball is in flight.');
  let frames = 0;
  while (game.inFlight && frames * deltaSeconds < 30) {
    game.step(deltaSeconds);
    frames += 1;
  }
  const result = readResult();
  assert.ok(result && !game.inFlight, `Launch at x=${x.toFixed(3)} must land within 30 simulated seconds.`);
  assert.ok(result.x >= -3.6 && result.x <= 3.6, 'A landed ball must stay inside the board rails.');
  return { ...result, seconds: frames * deltaSeconds };
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'florenzo-physics-'));
try {
  const [RAPIER, pins] = await Promise.all([loadRapier(repository, temporaryDirectory), readActualPins()]);
  const strong = createGamePhysics(RAPIER, pins);
  const gentle = createGamePhysics(RAPIER, pins);
  try {
    strong.launch(14); gentle.launch(0.5);
    for (let i = 0; i < 5; i++) { strong.step(0.1); gentle.step(0.1); }
    assert.equal(strong.phase, 'field', 'Strong launches must exit the rising channel sooner.');
    assert.equal(gentle.phase, 'channel', 'Gentle launches must visibly rise more slowly.');
  } finally { strong.dispose(); gentle.dispose(); }
  let lastResult;
  const game = createGamePhysics(RAPIER, pins, (result) => { lastResult = result; });
  const results = [];
  const histogram = Object.fromEntries(POCKETS.map((pocket) => [pocket.id, 0]));
  try {
    verifyColliders(game, pins);
    for (let index = 0; index <= 256; index += 1) {
      lastResult = null;
      const result = finishLaunch(game, 0.5 + index * 13.5 / 256, FIXED_TIMESTEP, () => lastResult);
      histogram[result.pocket.id] += 1;
      results.push(result);
    }
    for (const pocket of POCKETS) assert.ok(histogram[pocket.id] > 0, `${pocket.label} must be physically reachable.`);
  } finally {
    game.dispose();
  }

  const partitionResults = [];
  for (const delta of [1 / 60, 1 / 30, 1 / 15]) {
    let result;
    const partitionGame = createGamePhysics(RAPIER, pins, (landed) => { result = landed; });
    try {
      partitionResults.push(finishLaunch(partitionGame, 5.37, delta, () => result));
    } finally {
      partitionGame.dispose();
    }
  }
  for (const result of partitionResults.slice(1)) {
    assert.equal(result.pocket.id, partitionResults[0].pocket.id, 'Pocket result must be independent of render frame rate.');
    assert.equal(result.bounces, partitionResults[0].bounces, 'Bounce counting must be independent of render frame rate.');
    assert.ok(Math.abs(result.x - partitionResults[0].x) < 0.00001, 'Landing position must be independent of render frame rate.');
  }
  const times = results.map((result) => result.seconds).sort((a, b) => a - b);
  const destinationResults = [];
  let selectedResult;
  let landingEvents = 0;
  let pinHits = [];
  let seed = 92741;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const destinationGame = createDestinationGamePhysics(RAPIER, pins, result => { selectedResult = result; landingEvents++; }, hit => { pinHits.push(hit); }, { random });
  assert.equal(pinHits.length, 0, 'Loading recorded routes must not trigger visible pin reactions.');
  assert.equal(destinationGame.launchDestination('missing'), false, 'An unknown destination must not launch or consume a route.');
  const previousRoutes = new Map(), previousOrders = new Map();
  try {
    // Play all forty recordings at every frame rate, interleaving destinations
    // and crossing shuffled-set boundaries to catch state leaking between drops.
    for (const delta of [1 / 60, 1 / 30, 1 / 15]) {
      const visited = new Map(POCKETS.map(pocket => [pocket.id, []]));
      for (let round = 0; round < 10; round++) {
        for (const pocket of POCKETS) {
          selectedResult = null; pinHits = []; landingEvents = 0;
          assert.equal(destinationGame.launchDestination(pocket.id), true);
          assert.ok(Math.hypot(destinationGame.position.x - LAUNCH_ORIGIN.x, destinationGame.position.y - LAUNCH_ORIGIN.y) < 0.00001,
            'The next launch must replace the old ball at the launcher.');
          let ballBodies = 0;
          destinationGame.world.forEachRigidBody(body => { if (body.userData?.type === 'ball') ballBodies++; });
          assert.equal(ballBodies, 1, 'A new launch must remove the previous pocket ball.');
          const route = destinationGame.lastLaunchRoute;
          assert.notEqual(route.id, previousRoutes.get(pocket.id), 'Successive launches for a destination must use different routes, even across shuffled sets.');
          previousRoutes.set(pocket.id, route.id);
          visited.get(pocket.id).push(route.id);
          assert.equal(destinationGame.launchDestination(pocket.id), false);
          assert.equal(destinationGame.launchDestination(POCKETS.find(item => item.id !== pocket.id).id), false);
          assert.equal(destinationGame.lastLaunchRoute.id, route.id, 'Blocked launches must not consume or change the active route.');
          let frames = 0;
          while (frames * delta < 15 && destinationGame.inFlight) { destinationGame.step(delta); frames++; }
          assert.equal(selectedResult?.pocket.id, pocket.id, 'Every recorded route must physically land in its selected pocket.');
          assert.equal(selectedResult.routeId, route.id);
          assert.equal(selectedResult.initialPower, route.power);
          assert.ok(selectedResult.bounces >= 5, 'Every destination launch needs at least five real pin bounces.');
          assert.equal(selectedResult.bounces, route.bounces, 'Actual bounce count must match the recording.');
          assert.ok(Math.abs(selectedResult.x - route.landingX) < 0.00001, 'Live physics must reproduce the recorded landing position.');
          assert.ok(Math.abs(frames * delta - route.seconds) <= delta + 0.0001, 'Recorded duration must reproduce without slowing the simulation.');
          assert.deepEqual(pinHits.map(hit => hit.index), route.pinSequence, 'Every recording must reproduce its exact physical pin collision order.');
          assert.equal(pinHits.length, selectedResult.bounces, 'Each actual peg collision must trigger one pin reaction.');
          for (const hit of pinHits) {
            assert.ok(pins[hit.index] && hit.x === pins[hit.index].x && hit.y === pins[hit.index].y, 'Reaction must identify the pin actually hit.');
            assert.ok(hit.strength >= 0.45 && hit.strength <= 1, 'Reaction strength must remain bounded.');
          }
          const landingPosition = { ...destinationGame.position };
          let moved = false, rebounded = false, previousY = landingPosition.y;
          for (let frame = 0; frame < Math.ceil(10 / delta); frame++) {
            destinationGame.step(delta);
            const position = destinationGame.position;
            moved ||= Math.hypot(position.x - landingPosition.x, position.y - landingPosition.y) > 0.02;
            rebounded ||= position.y > previousY + 0.001;
            previousY = position.y;
            assert.ok(Math.abs(position.x - pocket.x) <= 0.9 - BALL_RADIUS + 0.015,
              `${route.id}: The settled ball must stay inside its selected pocket.`);
            assert.ok(position.y >= 1.78 + BALL_RADIUS - 0.025, `${route.id}: The ball must stay above the floor within solver contact tolerance (y=${position.y}, t=${frame * delta}).`);
          }
          assert.ok(moved && rebounded, `${route.id}: The landed ball must move and bounce naturally instead of freezing.`);
          assert.equal(destinationGame.phase, 'landed');
          assert.equal(destinationGame.hasBall, true, 'The pocket ball must remain until the next launch.');
          assert.equal(landingEvents, 1, 'Settling must not reopen or switch the popup.');
          assert.equal(pinHits.length, selectedResult.bounces, 'Settling must not add pin reactions to a completed route.');
          const restingPosition = { ...destinationGame.position };
          for (let frame = 0; frame < Math.ceil(2 / delta); frame++) destinationGame.step(delta);
          assert.ok(Math.hypot(destinationGame.position.x - restingPosition.x, destinationGame.position.y - restingPosition.y) < 0.005,
            'The pocket ball must settle rather than keep jittering or receive an anti-stall nudge.');
          const beforeRejectedLaunch = { ...destinationGame.position };
          assert.equal(destinationGame.launchDestination('missing'), false);
          assert.deepEqual({ ...destinationGame.position }, beforeRejectedLaunch, 'A rejected launch must leave the pocket ball in place.');
          destinationResults.push({ destination: pocket.id, routeId: route.id, launchPower: selectedResult.initialPower, bounces: selectedResult.bounces });
        }
      }
      for (const pocket of POCKETS) {
        const recordings = RECORDED_ROUTES.destinations[pocket.id];
        assert.equal(recordings.length, 10);
        assert.equal(new Set(recordings.map(route => route.power)).size, 10, 'Every destination needs ten different launch speeds.');
        assert.equal(new Set(recordings.map(route => route.pinSequence.join(','))).size, 10, 'Every destination needs ten genuinely different pin paths.');
        assert.deepEqual([...visited.get(pocket.id)].sort(), recordings.map(route => route.id).sort(), 'A shuffled set must include every route exactly once.');
        if (previousOrders.has(pocket.id)) {
          assert.notDeepEqual(visited.get(pocket.id), previousOrders.get(pocket.id), 'A new set must reshuffle the route order.');
        }
        previousOrders.set(pocket.id, visited.get(pocket.id));
      }
    }
  } finally {
    destinationGame.dispose();
  }
  console.log(JSON.stringify({
    passed: true,
    rapierVersion: RAPIER.version(),
    pegCount: pins.length,
    rows: BOARD_SETTINGS.rows,
    bottomLaunchOrigin: LAUNCH_ORIGIN,
    launches: results.length,
    pockets: histogram,
    medianLandingSeconds: Number(times[Math.floor(times.length / 2)].toFixed(2)),
    maxLandingSeconds: Number(times.at(-1).toFixed(2)),
    frameRatesVerified: [60, 30, 15],
    selectedDestinationLaunchesVerified: destinationResults.length,
    pocketSettlingSecondsVerifiedPerRoute: 12,
    destinationRoutes: Object.fromEntries(POCKETS.map(pocket => {
      const routes = RECORDED_ROUTES.destinations[pocket.id];
      return [pocket.id, { count: routes.length, minBounces: Math.min(...routes.map(route => route.bounces)),
        maxBounces: Math.max(...routes.map(route => route.bounces)),
        minSeconds: Math.min(...routes.map(route => route.seconds)), maxSeconds: Math.max(...routes.map(route => route.seconds)) }];
    })),
  }, null, 2));
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
