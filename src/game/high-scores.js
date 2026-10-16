import { createInquiryClient } from '../contact/inquiries.js';
import { BALLS_PER_ROUND, MULTIPLIERS } from './play-round.js';
import { COUNTRY_CODES } from './countries.js';

const UNAVAILABLE = 'The shared leaderboard is unavailable. Please try saving again shortly.';
const SETUP = 'The leaderboard database needs its high-score migration. Your score has not been saved online.';

function readRecord(row) {
  if (!row || typeof row.player_name !== 'string' || !row.player_name.trim()
    || !Number.isSafeInteger(row.score) || row.score < 0) throw new Error(UNAVAILABLE);
  return { name: row.player_name, score: row.score, country: COUNTRY_CODES.includes(row.country_code) ? row.country_code : null };
}

export function createHighScoreClient({ url = '', key = '', timeoutMs = 10000 } = {}, fetchRequest = globalThis.fetch) {
  const configured = createInquiryClient({ url, key }, fetchRequest).configured;
  const headers = { apikey: key.trim(), 'Content-Type': 'application/json' };
  if (key.trim().split('.').length === 3) headers.Authorization = `Bearer ${key.trim()}`;

  async function request(path, options = {}) {
    if (!configured) throw new Error(UNAVAILABLE);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchRequest(new URL(path, url.trim()).href, {
        ...options, headers, signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        if (response.status === 429 || failure.code === 'PGRST' && failure.message === 'Too many score submissions') {
          throw new Error('Please wait one minute before submitting another score.');
        }
        if (['PGRST202', 'PGRST205', '42703', '42P01'].includes(failure.code) || response.status === 404) throw new Error(SETUP);
        if (response.status === 400) throw new Error('The score could not be validated. Please complete a new ten-ball round.');
        throw new Error(UNAVAILABLE);
      }
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error(UNAVAILABLE);
      throw error;
    } finally { clearTimeout(timeout); }
  }

  return {
    configured,
    async loadBest() {
      const rows = await request('/rest/v1/high_scores?select=player_name,score,country_code&is_visible=eq.true&order=score.desc,created_at.asc,id.asc&limit=1');
      if (!Array.isArray(rows)) throw new Error(UNAVAILABLE);
      return rows.length ? readRecord(rows[0]) : null;
    },
    async submit({ submissionId, name, country, shots }) {
      name = Array.from(String(name).replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 24).join('');
      if (!name || !COUNTRY_CODES.includes(country) || !Array.isArray(shots) || shots.length !== BALLS_PER_ROUND
        || shots.some(shot => !Object.hasOwn(MULTIPLIERS, shot.pocketId) || !Number.isInteger(shot.bounces) || shot.bounces < 0 || shot.bounces > 10000)
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId || '')) {
        throw new Error('Please enter your name, choose a country, and complete all ten balls.');
      }
      const result = await request('/rest/v1/rpc/submit_high_score', {
        method: 'POST', body: JSON.stringify({
          p_submission_id: submissionId, p_player_name: name, p_country_code: country,
          p_shots: shots.map(({ pocketId, bounces }) => ({ pocket_id: pocketId, bounces })),
        }),
      });
      if (typeof result?.saved !== 'boolean') throw new Error(UNAVAILABLE);
      return { saved: result.saved, best: result.best ? readRecord(result.best) : null };
    },
  };
}
