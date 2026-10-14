import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRapier } from './lib/load-rapier.mjs';
import { createDestinationGamePhysics, POCKETS } from '../src/game/physics.js';
import { createBoardPins } from '../src/game/board-settings.js';
import { createPlayRound, createRecordStore, INITIAL_RECORD } from '../src/game/play-round.js';
import { countryFlag, searchCountries } from '../src/game/countries.js';

const round = createPlayRound();
assert.equal(round.canLaunch, true);
assert.equal(round.ballNumber, 1);
assert.equal(round.land({ pocketId: 'about', bounces: 5 }), null, 'An unlaunched ball cannot score.');
let expectedScore = 0;
for (let index = 0; index < 10; index++) {
  assert.equal(round.beginBall(), true);
  assert.equal(round.beginBall(), false, 'Double clicks cannot consume a second ball.');
  for (let hit = 0; hit < 5; hit++) round.hitPin();
  assert.equal(round.hits, 5);
  assert.equal(round.land({ pocketId: 'unknown', bounces: 5 }), null);
  assert.equal(round.land({ pocketId: 'about', bounces: -1 }), null);
  assert.equal(round.inFlight, true, 'Invalid results must not consume a ball.');
  const pocketId = ['about', 'experiences', 'education', 'contact'][index % 4];
  const shot = round.land({ pocketId, bounces: 5 });
  const expected = [10, 15, 5, 10][index % 4];
  expectedScore += expected;
  assert.equal(shot.points, expected, 'Five pin hits times the landing multiplier earns the specified points.');
  assert.equal(round.score, expectedScore);
  assert.equal(round.land({ pocketId, bounces: 5 }), null, 'Duplicate landing callbacks cannot count twice.');
}
assert.equal(round.completed, true);
assert.equal(round.canLaunch, false);
assert.equal(round.beginBall(), false, 'There is no eleventh ball.');
assert.equal(round.shots.length, 10);
round.shots.pop();
assert.equal(round.shots.length, 10, 'Callers cannot mutate the round history.');
round.reset();
round.beginBall(); round.hitPin(); round.reset();
assert.equal(round.inFlight, false);
assert.equal(round.score, 0);
assert.equal(round.hits, 0);
assert.equal(round.ballNumber, 1);

let saved;
const storage = { getItem: () => saved || null, setItem: (_key, value) => { saved = value; } };
const records = createRecordStore(storage);
assert.deepEqual(records.best, INITIAL_RECORD);
assert.equal(records.save({ name: 'Visitor', score: 500, country: 'PH' }), false, 'A tie does not beat the record.');
assert.equal(records.save({ name: '   ', score: 501, country: 'PH' }), false);
assert.equal(records.save({ name: 'Visitor', score: 501, country: 'XX' }), false);
assert.equal(records.save({ name: '  Visitor  ', score: 501, country: 'PH' }), true);
assert.deepEqual(createRecordStore(storage).best, { name: 'Visitor', score: 501, country: 'PH' });
assert.equal(records.save({ name: 'Other', score: 400, country: 'US' }), false);
assert.deepEqual(createRecordStore({ getItem: () => '{broken' }).best, INITIAL_RECORD);
const blockedStorage = createRecordStore({ getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } });
assert.equal(blockedStorage.save({ name: 'Visitor', score: 502, country: 'JP' }), true, 'Disabled storage must not break the game.');
assert.equal(blockedStorage.best.score, 502);
assert.equal(countryFlag('PH'), '🇵🇭');
assert.equal(searchCountries('philipp')[0].code, 'PH');
assert.equal(searchCountries('JP')[0].code, 'JP');
assert.equal(searchCountries('nonexistent-country').length, 0);

const repository = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'portfolio-play-physics-'));
try {
  const RAPIER = await loadRapier(repository, temp);
  let result, hitCount = 0;
  const physics = createDestinationGamePhysics(RAPIER, createBoardPins(), landed => { result = landed; }, () => { hitCount++; });
  const outcomes = new Set();
  try {
    assert.equal(physics.launchFree(NaN), false);
    assert.equal(physics.launchFree(Infinity), false);
    for (let index = 0; index <= 26; index++) {
      const power = 0.5 + index * 13.5 / 26;
      result = null; hitCount = 0;
      assert.equal(physics.launchFree(power), true);
      assert.equal(physics.lastLaunchRoute, null, 'Play mode must not select a recorded destination.');
      assert.equal(physics.launchDestination('about'), false);
      assert.equal(physics.launchFree(5), false);
      for (let frame = 0; frame < 1800 && physics.inFlight; frame++) physics.step(1 / 60);
      assert.ok(result, `Free launch at ${power} must physically land.`);
      assert.equal(result.initialPower, power, 'Slider strength must directly control the launch.');
      assert.equal(result.routeId, undefined);
      assert.equal(result.bounces, hitCount, 'Scoring must count actual collision-start events.');
      outcomes.add(result.pocket.id);
    }
    assert.equal(outcomes.size, 4, 'Strength control must allow all four pockets.');
    assert.equal(physics.launchFree(8), true);
    for (let frame = 0; frame < 80; frame++) physics.step(1 / 60);
    physics.reset();
    assert.equal(physics.inFlight, false, 'Switching modes must cancel a ball immediately.');
    assert.equal(physics.hasBall, false);
    assert.equal(physics.phase, 'idle');
    for (const pocket of POCKETS) {
      result = null;
      assert.equal(physics.launchDestination(pocket.id), true);
      for (let frame = 0; frame < 1800 && physics.inFlight; frame++) physics.step(1 / 60);
      assert.equal(result?.pocket.id, pocket.id, 'Portfolio routes must still work after free play.');
      assert.ok(result.routeId);
    }
  } finally { physics.dispose(); }
  console.log(JSON.stringify({ passed: true, ballsPerRound: 10, freePowersVerified: 27, reachablePockets: [...outcomes], scoreExample: '5 hits × 2 = 10 points', seedRecord: INITIAL_RECORD }));
} finally { await rm(temp, { recursive: true, force: true }); }
