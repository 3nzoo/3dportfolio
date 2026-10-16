import { COUNTRY_CODES } from './countries.js';

export const BALLS_PER_ROUND = 10;
export const MULTIPLIERS = Object.freeze({ about: 2, experiences: 3, education: 1, contact: 2 });
export const INITIAL_RECORD = Object.freeze({ name: 'Enzo', score: 480, country: 'PH' });
const RECORD_KEY = 'enzo-portfolio.play-record.v1';

export function createPlayRound() {
  let shots = [], inFlight = false, hits = 0;
  return {
    get shots() { return shots.slice(); },
    get score() { return shots.reduce((sum, shot) => sum + shot.points, 0); },
    get inFlight() { return inFlight; },
    get hits() { return hits; },
    get completed() { return shots.length === BALLS_PER_ROUND; },
    get canLaunch() { return !inFlight && shots.length < BALLS_PER_ROUND; },
    get ballNumber() { return Math.min(shots.length + 1, BALLS_PER_ROUND); },
    beginBall() {
      if (!this.canLaunch) return false;
      inFlight = true;
      hits = 0;
      return true;
    },
    hitPin() { if (inFlight) hits++; },
    land({ pocketId, bounces }) {
      if (!inFlight || !Object.hasOwn(MULTIPLIERS, pocketId) || !Number.isInteger(bounces) || bounces < 0) return null;
      const shot = { number: shots.length + 1, bounces, multiplier: MULTIPLIERS[pocketId], points: bounces * MULTIPLIERS[pocketId], pocketId };
      shots.push(shot);
      hits = bounces;
      inFlight = false;
      return shot;
    },
    reset() { shots = []; inFlight = false; hits = 0; },
  };
}

function validRecord(record) {
  return record && typeof record.name === 'string' && record.name.trim().length > 0 && record.name.length <= 48
    && Number.isSafeInteger(record.score) && record.score >= 0
    && (record.country === null || COUNTRY_CODES.includes(record.country));
}

// Browser cache and offline fallback; a loaded shared record replaces this value.
export function createRecordStore(storage) {
  let best = { ...INITIAL_RECORD };
  try {
    storage ??= globalThis.localStorage;
    const saved = JSON.parse(storage?.getItem(RECORD_KEY) || 'null');
    if (validRecord(saved) && saved.score > best.score) best = saved;
  } catch { /* Private browsing or damaged storage: keep the starter record. */ }
  return {
    get best() { return { ...best }; },
    replace(record) {
      if (!validRecord(record)) return false;
      best = { name: record.name, score: record.score, country: record.country };
      try { storage?.setItem(RECORD_KEY, JSON.stringify(best)); } catch { /* Keep the shared record for this visit. */ }
      return true;
    },
    save({ name, country, score }) {
      const record = { name: Array.from(String(name).replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 24).join(''), country, score };
      if (!validRecord(record) || !COUNTRY_CODES.includes(country) || score <= best.score) return false;
      best = record;
      try { storage?.setItem(RECORD_KEY, JSON.stringify(best)); } catch { /* Keep the record for this visit. */ }
      return true;
    },
  };
}
