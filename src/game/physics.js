import { BOARD_SETTINGS, LAUNCH_ORIGIN, RELEASE_POINT } from './board-settings.js';
import { channelPoint } from './launch-channel.js';
import { RECORDED_ROUTES } from './recorded-routes.js';

export const FIXED_TIMESTEP = 1 / 60;
export const BALL_RADIUS = 0.16;
// Increment this version when collider/restitution/gravity behavior changes.
export function routeConfiguration(pins) {
  return { version: 1, timestep: FIXED_TIMESTEP, ballRadius: BALL_RADIUS,
    settings: BOARD_SETTINGS, launchOrigin: LAUNCH_ORIGIN, releasePoint: RELEASE_POINT,
    pins: pins.map(({ x, y, radius }) => ({ x, y, radius })) };
}
export const POCKETS = [
  { id: 'about', label: 'About', x: -2.7, color: '#79dcc6' },
  { id: 'experiences', label: 'Experiences', x: -0.9, color: '#e5c16a' },
  { id: 'education', label: 'Education', x: 0.9, color: '#98b9ff' },
  { id: 'contact', label: 'Contact', x: 2.7, color: '#a5e8b1' },
];

export function pocketForX(x) {
  return POCKETS[Math.max(0, Math.min(3, Math.floor((x + 3.6) / 1.8)))];
}

// Fixed-step Rapier simulation shares the procedural board's peg positions.
// The channel guides the rising ball; free physics begins at its outlet.
export function createGamePhysics(RAPIER, pins, onLand = () => {}, onPinHit = () => {}) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_TIMESTEP;
  const events = new RAPIER.EventQueue(true);
  const pinRotation = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
  pins.forEach(({ x, y, radius = 0.16 }, index) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, 0.12).setRotation(pinRotation));
    body.userData = { type: 'pin', index, x, y };
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.6, radius)
      .setRestitution(0.5).setFriction(0.18)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
  });
  const wall = (x, y, hx, hy) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, 0.12));
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, 0.6).setRestitution(0.22).setFriction(0.2), body);
  };
  wall(-3.65, 6, 0.05, 5.2);
  wall(3.65, 6, 0.05, 5.2);
  wall(0, 1.72, 3.6, 0.06);
  [-1.8, 0, 1.8].forEach(x => wall(x, 2.18, 0.045, 0.46));

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(LAUNCH_ORIGIN.x, LAUNCH_ORIGIN.y, LAUNCH_ORIGIN.z).enabledTranslations(true, true, false)
    .setCcdEnabled(true).setEnabled(false));
  body.userData = { type: 'ball' };
  world.createCollider(RAPIER.ColliderDesc.ball(BALL_RADIUS)
    .setRestitution(0.5).setFriction(0.2)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);

  let inFlight = false, hasBall = false, accumulator = 0, age = 0, bounces = 0, initialPower = 0, resting = 0, channelAge = 0, channelDuration = BOARD_SETTINGS.channelSeconds, phase = 'idle';
  return {
    world,
    get inFlight() { return inFlight; },
    get hasBall() { return hasBall; },
    get position() { return body.translation(); },
    get phase() { return phase; },
    launch(power) {
      if (inFlight) return false;
      initialPower = Math.max(0.5, Math.min(14, power));
      const strength = (initialPower - 0.5) / 13.5;
      channelDuration = BOARD_SETTINGS.channelSeconds
        + (BOARD_SETTINGS.channelFastSeconds - BOARD_SETTINGS.channelSeconds) * strength;
      body.setTranslation(LAUNCH_ORIGIN, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setLinearDamping(0);
      body.setAngularDamping(0);
      body.setEnabled(false);
      hasBall = inFlight = true;
      phase = 'channel';
      channelAge = 0;
      age = bounces = resting = accumulator = 0;
      return true;
    },
    step(deltaSeconds) {
      if (!hasBall || (phase === 'landed' && body.isSleeping())) return;
      accumulator += Math.min(deltaSeconds, 0.1);
      while (accumulator >= FIXED_TIMESTEP) {
        if (phase === 'channel') {
          channelAge += FIXED_TIMESTEP;
          body.setTranslation(channelPoint(channelAge / channelDuration), true);
          if (channelAge >= channelDuration) {
            body.setTranslation(RELEASE_POINT, true);
            body.setLinvel({ x: -initialPower, y: BOARD_SETTINGS.releaseVerticalSpeed, z: 0 }, true);
            body.setEnabled(true);
            phase = 'field';
          }
          accumulator -= FIXED_TIMESTEP;
          continue;
        }
        // Short substeps keep fast arrivals from visibly sinking into the
        // pocket floor. The total elapsed time stays at one fixed timestep.
        const substeps = phase === 'landed' ? 4 : 1;
        world.timestep = FIXED_TIMESTEP / substeps;
        for (let step = 0; step < substeps; step++) world.step(events);
        age += FIXED_TIMESTEP;
        events.drainCollisionEvents((a, b, started) => {
          if (!started || phase !== 'field') return;
          const bodies = [world.getCollider(a)?.parent()?.userData, world.getCollider(b)?.parent()?.userData];
          const pin = bodies.find(item => item?.type === 'pin');
          if (pin && bodies.some(item => item?.type === 'ball')) {
            bounces++;
            const position = body.translation(), velocity = body.linvel();
            const dx = pin.x - position.x, dy = pin.y - position.y;
            const distance = Math.hypot(dx, dy) || 1;
            onPinHit({ index: pin.index, x: pin.x, y: pin.y, directionX: dx / distance, directionY: dy / distance,
              strength: Math.max(0.45, Math.min(1, Math.hypot(velocity.x, velocity.y) / 8)) });
          }
        });
        accumulator -= FIXED_TIMESTEP;
        // Landing selects the page once, but the ball keeps its momentum and
        // collides with the pocket until it naturally sleeps. Never nudge it
        // or dispatch another page/pin event after it has reached its pocket.
        if (phase === 'landed') continue;
        const position = body.translation();
        if (position.y < 2.22) {
          inFlight = false;
          phase = 'landed';
          body.setLinearDamping(0.8);
          body.setAngularDamping(0.8);
          onLand({ pocket: pocketForX(position.x), x: position.x, initialX: LAUNCH_ORIGIN.x, initialPower, bounces });
          break;
        }
        const velocity = body.linvel();
        resting = Math.hypot(velocity.x, velocity.y) < 0.05 ? resting + FIXED_TIMESTEP : 0;
        // Give a balanced ball a small physical nudge instead of fabricating a result.
        if (resting > 0.65 || age > 18) {
          body.setLinvel({ x: position.x < 0 ? 0.28 : -0.28, y: -0.2, z: 0 }, true);
          resting = 0;
          age = 0;
        }
      }
    },
    dispose() { events.free(); world.free(); },
  };
}

// Routes are recorded offline against this exact board and Rapier version.
// Only their launch speeds drive playback; all bounces still use live physics.
export function createDestinationGamePhysics(RAPIER, pins, onLand = () => {}, onPinHit = () => {}, { random = Math.random } = {}) {
  if (RAPIER.version() !== RECORDED_ROUTES.rapierVersion
    || JSON.stringify(routeConfiguration(pins)) !== JSON.stringify(RECORDED_ROUTES.configuration)) {
    throw new Error('The board physics changed. Run npm run record:paths, then npm run test:physics to refresh its destinations.');
  }
  const pools = new Map(POCKETS.map(pocket => [pocket.id, RECORDED_ROUTES.destinations[pocket.id]]));
  for (const [destination, routes] of pools) {
    if (routes?.length !== 10 || routes.some(route => route.bounces < 5)
      || new Set(routes.map(route => route.power)).size !== 10
      || new Set(routes.map(route => route.pinSequence.join(','))).size !== 10) {
      throw new Error(`Expected ten distinct verified routes with at least five bounces for ${destination}.`);
    }
  }
  const bags = new Map(), lastRoutes = new Map();
  let lastLaunchRoute = null;
  const landed = result => onLand({ ...result, routeId: lastLaunchRoute?.id });
  let game = createGamePhysics(RAPIER, pins, landed, onPinHit);
  function nextRoute(destination) {
    let bag = bags.get(destination);
    if (!bag?.length) {
      bag = [...pools.get(destination)];
      for (let i = bag.length - 1; i > 0; i--) {
        const index = Math.floor(random() * (i + 1));
        [bag[i], bag[index]] = [bag[index], bag[i]];
      }
      // Also avoid repeating the last route when starting the next shuffled set.
      if (bag.at(-1).id === lastRoutes.get(destination)) {
        const index = Math.floor(random() * (bag.length - 1));
        [bag[bag.length - 1], bag[index]] = [bag[index], bag[bag.length - 1]];
      }
      bags.set(destination, bag);
    }
    const route = bag.pop();
    lastRoutes.set(destination, route.id);
    return route;
  }
  return {
    get world() { return game.world; },
    get inFlight() { return game.inFlight; },
    get hasBall() { return game.hasBall; },
    get position() { return game.position; },
    get phase() { return game.phase; },
    get lastLaunchRoute() { return lastLaunchRoute; },
    launchDestination(destination) {
      if (game.inFlight || !pools.has(destination)) return false;
      game.dispose();
      game = createGamePhysics(RAPIER, pins, landed, onPinHit);
      lastLaunchRoute = nextRoute(destination);
      return game.launch(lastLaunchRoute.power);
    },
    step(delta) { game.step(delta); },
    dispose() { game.dispose(); },
  };
}
