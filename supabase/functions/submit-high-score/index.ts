import { createScoreHandler } from './handler.js';

// Supabase injects these server-only keys. Prefer the current secret-key map;
// keep the legacy service_role environment variable as a compatibility fallback.
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
Deno.serve(createScoreHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
  serviceRoleKey: secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
}));
