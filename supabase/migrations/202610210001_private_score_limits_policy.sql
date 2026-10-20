-- Rate-limit records are backend-only. Make the existing default-deny intent
-- explicit without granting visitor access or forcing RLS on the function owner.
begin;

alter table portfolio_private.score_submission_limits enable row level security;
revoke all on portfolio_private.score_submission_limits from public, anon, authenticated;

drop policy if exists "Block direct visitor access"
  on portfolio_private.score_submission_limits;
create policy "Block direct visitor access"
  on portfolio_private.score_submission_limits
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

commit;
