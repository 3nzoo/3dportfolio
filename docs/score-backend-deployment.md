# Deploy the server-only score submission path

This replaces anonymous direct database RPC calls with a public HTTP Edge Function. Visitors still play without an account. Public leaderboard reads stay on the Data API, and Contact is unchanged.

The database function remains SECURITY DEFINER because it performs controlled writes. After the final migration, only the server role can execute it. The Edge handler bounds requests, validates ten shots, obtains a connection IP from the hosted gateway, and calls a service-role-only SECURITY INVOKER bridge. The existing database logic still recomputes scores, locks competing submissions, preserves retry IDs, and enforces a per-visitor IP limit. The bridge does not use the Edge server's shared egress IP as the visitor identity.

## 1. Prepare the database without disabling the old website

In your existing Supabase project's SQL Editor, run:

`supabase/migrations/202610200003_prepare_score_backend.sql`

The original high-score migration must already be installed. Preparation adds the server-only bridge and service-role execution grants. Existing visitor grants are not removed yet. Existing records and inquiry data are preserved.

Do not run `202610200004_lock_down_score_rpc.sql` yet. When deploying these changes to an existing project, apply the two phases separately rather than pushing every pending migration before the Edge Function and website are ready.

## 2. Deploy the Edge Function

From the `3dportfolio` folder, run:

```sh
npx supabase login
npx supabase functions deploy submit-high-score --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

Replace `YOUR_PROJECT_REF` with the project identifier in `https://YOUR_PROJECT_REF.supabase.co`. Use the same project as the portfolio's `VITE_SUPABASE_URL`.

The files are `supabase/functions/submit-high-score/index.ts` and `handler.js`. `supabase/config.toml` also sets `verify_jwt = false` for this public game endpoint: players are not signed in, and a publishable API key is not a user JWT. This setting does not grant browser access to the database RPC.

Supabase injects the server environment. The entry point reads `SUPABASE_URL`, prefers the `default` key from `SUPABASE_SECRET_KEYS`, and falls back to `SUPABASE_SERVICE_ROLE_KEY` for projects using legacy keys. If the project only has custom-named secret keys and no legacy key, adjust the map key in `index.ts` to the secret key's name. Do not put any elevated key in `.env.local`, Cloudflare build variables, or any `VITE_` variable. Never paste a secret into chat.

The hosted gateway must overwrite `CF-Connecting-IP` or append the actual visitor to `X-Forwarded-For`. The handler prefers the Cloudflare header, otherwise uses the last forwarded hop, and rejects missing or invalid addresses. If self-hosting behind another proxy, configure and verify trusted forwarding before accepting scores. Local function testing needs an explicit connection header because the hosted gateway is absent.

In Supabase's Edge Function tester, POST `{}` as JSON to `submit-high-score`. A `400` response saying `Invalid ten-ball score submission` confirms the handler is deployed; this test writes no scores. A `401` JWT response means platform JWT verification was not disabled. A `503` on a valid request indicates missing server environment, the bridge migration, or connection forwarding; inspect the Edge logs without printing secret values.

## 3. Deploy the updated website and verify a real save

Commit and push the frontend changes and rebuild the Cloudflare deployment. The existing two public build variables stay the same; no additional frontend secret is needed. Cloudflare deploys the website, not the Supabase Edge Function.

Refresh the website. Score POSTs must go to `/functions/v1/submit-high-score`, while public leaderboard GETs still go to `/rest/v1/high_scores`. Complete a real ten-ball round, beat the current record, save, and confirm the row appears. The browser deliberately does not fall back to the old direct RPC if the backend is unavailable.

Only continue after the new submission path works. The original RPC is still available to old browser bundles during this transition.

## 4. Remove direct browser RPC access

In SQL Editor, run:

`supabase/migrations/202610200004_lock_down_score_rpc.sql`

This revokes EXECUTE from PUBLIC, anon, and authenticated on both score functions. The existing service-role grants remain. Existing data, RLS policies, and public leaderboard reads are unchanged. Visitors with an older already-open page must refresh to load the new submission client.

Verify:

```sql
select
  has_function_privilege('anon', 'public.submit_high_score(uuid,text,text,jsonb)', 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', 'public.submit_high_score(uuid,text,text,jsonb)', 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon', 'public.submit_high_score_via_backend(uuid,text,text,jsonb,inet)', 'EXECUTE') as anon_bridge_access,
  has_function_privilege('authenticated', 'public.submit_high_score_via_backend(uuid,text,text,jsonb,inet)', 'EXECUTE') as authenticated_bridge_access,
  has_function_privilege('service_role', 'public.submit_high_score_via_backend(uuid,text,text,jsonb,inet)', 'EXECUTE') as backend_can_execute;
```

The first four values must be false, and the last must be true. Run `supabase/tests/high_scores.sql` and `supabase/tests/portfolio_inquiries.sql` for transaction-rolled-back database checks. Refresh Security Advisor: neither API role should be flagged for `submit_high_score`.

## Verification and limits

Run `npm run test:scores`, `npm run test:score-edge`, and `npm run build` locally. Database checks require the migrations and a PostgreSQL instance; they are not applied by the frontend build.

This controls privileged access and validates score arithmetic. It does not independently prove the browser's pin-hit reports came from an honest game, and an Edge rate limit does not eliminate invocation costs. No full anti-cheat or abuse-prevention guarantee is implied.

If you must restore an older website deployment after cutover, the older frontend also needs its original anonymous RPC permission restored temporarily. That reintroduces the advisor warning. Prefer repairing the Edge path instead of leaving both submission paths enabled.

Official references: [deploying Edge Functions](https://supabase.com/docs/guides/functions/deploy), [function authentication](https://supabase.com/docs/guides/functions/auth), [server-only environment variables](https://supabase.com/docs/guides/functions/secrets), [database function privileges](https://supabase.com/docs/guides/database/functions).
