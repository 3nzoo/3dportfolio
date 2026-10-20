begin;

-- The portfolio submits with its public key, not a signed-in user session.
-- Remove unused signed-in access and inherited PUBLIC execution. Preserve the
-- existing anon grant, SECURITY DEFINER validation, and direct-write restrictions.
revoke execute on function public.submit_high_score(uuid, text, text, jsonb)
  from public, authenticated;

notify pgrst, 'reload schema';
commit;
