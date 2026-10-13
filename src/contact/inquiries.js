const LENGTHS = { name: 100, email: 200, subject: 200, message: 5000 };
const UNAVAILABLE = 'The message form is currently unavailable. Please use the email link above.';
const UNCONFIRMED = 'We couldn’t confirm your message was saved. Your details are still here; please try again or use the email link above.';

function publicKeyType(key) {
  if (/^sb_publishable_[\w-]+$/.test(key)) return 'publishable';
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    if (key.split('.').length === 3 && JSON.parse(atob(payload)).role === 'anon') return 'anon';
  } catch { /* Reject invalid or elevated keys without logging them. */ }
  return '';
}

export function createInquiryClient({ url = '', key = '', timeoutMs = 15000 } = {}, fetchRequest = globalThis.fetch) {
  let endpoint = '';
  try {
    const project = new URL(url.trim());
    if (project.protocol === 'https:' && !project.username && !project.password && project.pathname === '/' && !project.search && !project.hash) {
      endpoint = new URL('/rest/v1/portfolio_inquiries', project).href;
    }
  } catch { /* Missing settings leave the form unavailable. */ }
  const publicKey = key.trim();
  const keyType = publicKeyType(publicKey);
  const configured = Boolean(endpoint && keyType && fetchRequest);

  return {
    configured,
    async submit(fields) {
      if (!configured) throw new Error(UNAVAILABLE);
      const record = {};
      for (const [name, maximum] of Object.entries(LENGTHS)) {
        const value = String(fields[name] || '').trim();
        if (!value || value.length > maximum) throw new Error(`Please enter a valid ${name}.`);
        record[name] = value;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) throw new Error('Please enter a valid email address.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers = { apikey: publicKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
        // Publishable keys aren't JWTs. Only the legacy anon JWT belongs here.
        if (keyType === 'anon') headers.Authorization = `Bearer ${publicKey}`;
        const response = await fetchRequest(endpoint, {
          method: 'POST', headers, body: JSON.stringify(record), signal: controller.signal,
          credentials: 'omit', redirect: 'error',
        });
        if (!response.ok) {
          if (response.status === 429) throw new Error('Too many messages at once. Please wait a moment and try again.');
          if ([401, 403, 404].includes(response.status)) throw new Error(UNAVAILABLE);
          throw new Error(UNCONFIRMED);
        }
      } catch (error) {
        if ([UNAVAILABLE, UNCONFIRMED].includes(error.message) || error.message.startsWith('Too many messages')) throw error;
        throw new Error(UNCONFIRMED);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
