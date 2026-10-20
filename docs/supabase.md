# Contact records in Supabase

The form saves name, email, subject, message, submission time, and a status (`new`, `replied`, or `archived`). It does not send an email notification. Visitors do not need an account.

## Connect your project

1. In the Supabase SQL Editor, run `supabase/migrations/202610130001_portfolio_inquiries.sql` once. It creates `public.portfolio_inquiries` with validation, Row Level Security, and public insert-only permissions. Existing tables are unaffected.
2. Copy `.env.example` to `.env.local`. Fill in the project's HTTPS URL and **publishable** key from the Supabase Connect dialog / API Keys settings. A legacy **anon** key also works. Never use a secret or `service_role` key.
3. Restart `npm run dev`. Submit a test message, then confirm it appears under **Table Editor → portfolio_inquiries**.
4. In Cloudflare Pages, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build environment variables, then redeploy. Set them for Preview deployments too if you want the form available there.

The `VITE_` values are embedded into the browser bundle. They identify the project; they are not passwords and do not make records public. Privacy depends on applying the SQL permissions before enabling the form. Environment files are ignored by Git.

The build rejects secret/service-role keys and incomplete or non-HTTPS settings. With both settings empty, the form stays unavailable and the email link remains accessible.

## Review and manage inquiries

Open `portfolio_inquiries` in the Supabase dashboard. Sort by `created_at` descending to see the latest messages. Reply using the submitted email address, and update `status` to `replied` or `archived` as appropriate. There is no visitor-facing inbox or login screen.

## Replace a key later

Create a replacement publishable key in Supabase, update `.env.local` and Cloudflare's environment variables, restart locally, and redeploy. Verify a submission with the replacement before revoking the old key. Changing the key does not delete your table or existing inquiries.

## Access and verification

The migration grants `anon` INSERT on the four input columns only. Visitors cannot select, update, or delete records, or set the ID, timestamp, or status. The client sends `Prefer: return=minimal`, so submission does not require reading back a saved row. Dashboard administrators retain access. Requests use HTTPS.

After setup, verify that a valid form submission succeeds and that SELECT, UPDATE, and DELETE requests with the same public key are denied. `supabase/tests/portfolio_inquiries.sql` also checks database permissions and constraints inside a rolled-back transaction; run it in SQL Editor after the migration.

Submission is intentionally public. RLS protects record access; it is not a spam filter. If you need spam protection, use a server-verified CAPTCHA through an Edge Function rather than granting more database permissions.

References: [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Shared high scores

The game reads the visible leaderboard with the existing two public project settings. Score submissions now go to the `submit-high-score` Edge Function, which uses a server-only database bridge. No elevated key belongs in the browser. Contact remains a separate public insert-only flow.

Follow [the score backend deployment guide](score-backend-deployment.md) in order: prepare the database, deploy the Edge Function, deploy and test the website, then revoke direct database RPC access. Existing projects already have `202610160001_shared_high_scores.sql`; new projects need that original schema before the backend migrations. Do not remove anon execution from the original RPC until the new website and Edge path are working.

The database still computes the total from ten shots, serializes competing records, preserves idempotent retries, and limits each visitor connection to one valid submission per minute. People sharing a network share this limit. Old records remain, and the browser does not silently switch to local-only saves or back to the legacy RPC on errors. The server role, not anon or authenticated, retains execution after cutover. Public reads stay subject to the visible-row RLS policy.

`npm run test:scores` tests the browser client, `npm run test:score-edge` tests the HTTP backend, and `supabase/tests/high_scores.sql` checks final database permissions and scoring in a rolled-back transaction after all migrations. Browser-reported pin hits remain a trust limitation; this is not independent server replay verification.

## Restrict the automatic-RLS administrative function

If Security Advisor flags `public.rls_auto_enable()` as executable by API roles, run `supabase/migrations/202610200001_restrict_rls_auto_enable.sql` in SQL Editor as the database administrator. This optional Supabase event-trigger function is not part of the portfolio API. The migration revokes EXECUTE from PUBLIC, anon, and authenticated only on this function; it preserves SECURITY DEFINER, its owner, the event trigger, table RLS, contact data, and the score-submission functions. It skips projects that have not installed automatic RLS and can be rerun.

After applying it, verify both results are false, then refresh Security Advisor:

```sql
select
  has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') as authenticated_can_execute;
```

Applying this SQL changes the database directly; deploying the website alone does not apply migrations. No website rebuild is needed for this permission fix.


## Earlier signed-in-only restriction

`202610200002_restrict_high_score_authenticated.sql` was the intermediate restriction for the old browser RPC. The complete Edge cutover supersedes it by revoking both anon and authenticated execution in `202610200004_lock_down_score_rpc.sql`. See [the deployment guide](score-backend-deployment.md) before applying the final restriction.
