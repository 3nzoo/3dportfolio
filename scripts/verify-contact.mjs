import assert from 'node:assert/strict';
import { createInquiryClient } from '../src/contact/inquiries.js';

const settings = { url: 'https://portfolio-test.supabase.co', key: 'sb_publishable_test' };
const fields = { name: ' Sample Visitor ', email: 'visitor@example.com', subject: 'Project', message: 'Hello from a test.' };
let requests = [];
const success = async (url, options) => { requests.push({ url, options }); return { ok: true, status: 201 }; };
const client = createInquiryClient(settings, success);
assert.equal(client.configured, true);
await client.submit({ ...fields, status: 'replied', created_at: '2000-01-01' });
assert.equal(requests.length, 1);
assert.equal(requests[0].url, 'https://portfolio-test.supabase.co/rest/v1/portfolio_inquiries');
assert.equal(requests[0].options.headers.Prefer, 'return=minimal');
assert.equal(requests[0].options.headers.Authorization, undefined);
assert.equal(requests[0].options.credentials, 'omit');
assert.equal(requests[0].options.redirect, 'error');
assert.deepEqual(JSON.parse(requests[0].options.body), { ...fields, name: 'Sample Visitor' });

const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
const anon = createInquiryClient({ ...settings, key: jwt('anon') }, success);
await anon.submit(fields);
assert.equal(requests[1].options.headers.Authorization, `Bearer ${jwt('anon')}`);

for (const config of [
  {}, { ...settings, key: 'sb_secret_private' }, { ...settings, key: jwt('service_role') },
  { ...settings, url: 'http://portfolio-test.supabase.co' }, { ...settings, url: 'https://user:password@portfolio-test.supabase.co' },
  { ...settings, url: 'https://portfolio-test.supabase.co?key=private' },
]) {
  const unavailable = createInquiryClient(config, success);
  assert.equal(unavailable.configured, false);
  await assert.rejects(unavailable.submit(fields), /unavailable/);
}

const previousRequests = requests.length;
for (const invalid of [
  { ...fields, name: '   ' }, { ...fields, message: 'x'.repeat(5001) },
  { ...fields, email: 'not-an-email' }, { ...fields, subject: '' },
]) await assert.rejects(client.submit(invalid), /valid/);
assert.equal(requests.length, previousRequests, 'Invalid input must not make a request');

for (const status of [401, 403, 404, 429, 500]) {
  const failure = createInquiryClient(settings, async () => ({ ok: false, status }));
  await assert.rejects(failure.submit(fields), status === 429 ? /wait a moment/ : status === 500 ? /couldn’t confirm/ : /unavailable/);
}
const offline = createInquiryClient(settings, async () => { throw new Error('Internal detail must not reach the visitor'); });
await assert.rejects(offline.submit(fields), /couldn’t confirm/);
const slow = createInquiryClient({ ...settings, timeoutMs: 5 }, (_url, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
}));
await assert.rejects(slow.submit(fields), /couldn’t confirm/);
assert.equal(fields.name, ' Sample Visitor ', 'Failures and normalization must not alter the saved draft');
console.log('Contact checks passed: public keys, HTTPS, minimal inserts, validation, failures and timeout.');
