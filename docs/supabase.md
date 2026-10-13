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
