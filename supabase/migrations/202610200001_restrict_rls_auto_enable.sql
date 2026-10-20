begin;

-- Supabase's optional automatic-RLS event trigger is administrative, not a
-- visitor RPC. Keep its SECURITY DEFINER behavior and its event trigger intact.
-- Revoke PUBLIC as well as the API roles, because PUBLIC grants are inherited.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  else
    raise notice 'public.rls_auto_enable() is not installed; no permissions changed.';
  end if;
end;
$$;

-- No table policies, data, or submit_high_score permissions are changed.
notify pgrst, 'reload schema';
commit;
