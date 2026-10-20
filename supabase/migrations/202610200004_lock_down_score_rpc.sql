-- Phase 2: run only after the Edge Function and updated website are live and tested.
-- Old browser bundles must be refreshed; they can no longer write through this RPC.
begin;
revoke execute on function public.submit_high_score(uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.submit_high_score_via_backend(uuid, text, text, jsonb, inet)
  from public, anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.submit_high_score(uuid,text,text,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.submit_high_score(uuid,text,text,jsonb)', 'EXECUTE') then
    raise exception 'A custom inherited role still grants public score execution; inspect role grants before cutover';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
