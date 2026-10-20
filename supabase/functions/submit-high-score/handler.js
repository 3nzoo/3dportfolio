const MAX_BODY_BYTES = 8192;
const POCKETS = new Set(['about', 'experiences', 'education', 'contact']);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Retry-After',
};

function reply(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...CORS, 'Cache-Control': 'no-store', ...headers } });
}

function validSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !['p_submission_id', 'p_player_name', 'p_country_code', 'p_shots'].includes(key))) return false;
  return typeof body.p_submission_id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.p_submission_id)
    && typeof body.p_player_name === 'string'
    && Array.from(body.p_player_name.trim()).length >= 1
    && Array.from(body.p_player_name.trim()).length <= 24
    && !/[\u0000-\u001f\u007f]/.test(body.p_player_name)
    && typeof body.p_country_code === 'string' && /^[A-Z]{2}$/.test(body.p_country_code)
    && Array.isArray(body.p_shots) && body.p_shots.length === 10
    && body.p_shots.every(shot => shot && POCKETS.has(shot.pocket_id)
      && Number.isInteger(shot.bounces) && shot.bounces >= 0 && shot.bounces <= 10000);
}

// Hosted Supabase is behind Cloudflare. Never take a connection IP from JSON.
// If CF-Connecting-IP is unavailable, use the last hop appended by the gateway,
// rather than an arbitrary client-prepended X-Forwarded-For value.
function connectionIp(headers) {
  const ip = (headers.get('cf-connecting-ip')
    || headers.get('x-forwarded-for')?.split(',').at(-1) || '').trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return ip.split('.').every(part => Number(part) <= 255) ? ip : '';
  }
  if (!/^[a-f0-9:.]+$/i.test(ip) || !ip.includes(':')) return '';
  try { new URL(`http://[${ip}]/`); return ip; } catch { return ''; }
}

async function readSubmission(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Public HTTP endpoint; elevated database credentials remain inside the Edge Function. */
export function createScoreHandler({ supabaseUrl = '', serviceRoleKey = '', timeoutMs = 10000 } = {}, fetchRequest = fetch) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return reply({ message: 'Method not allowed' }, 405, { Allow: 'POST, OPTIONS' });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return reply({ message: 'Expected JSON' }, 415);
    }
    let body;
    try { body = await readSubmission(request); } catch (error) {
      return reply({ message: error instanceof RangeError ? 'Request too large' : 'Invalid JSON' }, error instanceof RangeError ? 413 : 400);
    }
    if (!validSubmission(body)) return reply({ message: 'Invalid ten-ball score submission' }, 400);
    const ip = connectionIp(request.headers);
    if (!ip) return reply({ message: 'Unable to verify the submission connection' }, 503);
    if (!supabaseUrl || !serviceRoleKey) return reply({ message: 'Score backend is not configured' }, 503);
    try {
      const headers = { apikey: serviceRoleKey, 'Content-Type': 'application/json' };
      if (serviceRoleKey.split('.').length === 3) headers.Authorization = `Bearer ${serviceRoleKey}`;
      const response = await fetchRequest(new URL('/rest/v1/rpc/submit_high_score_via_backend', supabaseUrl), {
        method: 'POST', headers,
        body: JSON.stringify({ ...body, p_player_name: body.p_player_name.trim(), p_client_ip: ip }),
        signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 429) return reply({ message: 'Too many score submissions' }, 429, { 'Retry-After': '60' });
        if (response.status === 400 && result?.code === '22023') return reply({ message: 'Invalid score submission' }, 400);
        if (response.status === 404 || result?.code === 'PGRST202') {
          return reply({ message: 'Score backend needs its database migration', code: 'SCORE_BACKEND_NOT_READY' }, 503);
        }
        return reply({ message: 'Unable to save the score right now' }, 502);
      }
      if (typeof result?.saved !== 'boolean') return reply({ message: 'Invalid score service response' }, 502);
      return reply({ saved: result.saved, best: result.best ?? null });
    } catch {
      return reply({ message: 'Unable to confirm the score was saved. Retry with the same submission.' }, 502);
    }
  };
}
