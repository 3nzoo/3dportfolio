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

The game uses the same two public environment settings as Contact. No extra client library or secret browser key is needed.

1. Run `supabase/migrations/202610160001_shared_high_scores.sql` in Supabase SQL Editor. It preserves existing `high_scores` rows, adds `country_code` and a unique retry identifier, enables public reads of visible scores, and provides the `submit_high_score` RPC for writes. It does not touch `portfolio_inquiries`. If there are no visible scores, it seeds Enzo / PH / 480. Existing records are never replaced by this seed.
2. Run `supabase/tests/high_scores.sql` in SQL Editor. Its test data and visibility changes are rolled back.
3. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`, then restart `npm run dev`. For Cloudflare Pages, keep the same build variables and redeploy.
4. Enter Play mode. The top score is loaded on startup, when entering Play, and after the tenth ball lands. Beat the shared record, enter your name/country, and save. Success is shown only after Supabase confirms the insert. The new result is a new `high_scores` row; the existing Enzo row is retained. Refresh or use another browser to verify the shared record.

The RPC recalculates the total from exactly ten shot results, serializes competing record submissions, and reuses the same submission ID on retries to prevent duplicate rows. New submissions are limited to one per minute per gateway-reported IP; people sharing a network share that limit. Rate-limit identifiers are kept in an unexposed private schema and old entries are pruned on new submissions. Visitors cannot directly insert, update, or delete scores.

This verifies score arithmetic and input shape, not that browser-reported pin hits came from an honest game. Full cheat resistance would require server-issued sessions and independent replay verification. No such guarantee is implied. Contact's public insert policy is unchanged; its spam controls are a separate feature.

A configured app never silently falls back to a local-only save on a network or database error. The form keeps the player's details and offers retry. An unconfigured app retains the existing browser-only mode. Shared records take precedence over stale browser records, including old 500-point starter records.

`npm run test:scores` checks requests, failure handling, retry IDs, and shared-record cache replacement. The SQL test checks writes, scoring, ties, idempotency, and rate limits. If a save says the migration is missing, apply the high-score migration to the same project as the configured URL.
