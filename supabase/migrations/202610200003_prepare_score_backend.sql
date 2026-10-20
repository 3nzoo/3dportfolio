-- Phase 1: apply before deploying the Edge Function and updated website.
-- This does not remove the existing browser RPC yet.
begin;

create or replace function public.submit_high_score_via_backend(
  p_submission_id uuid,
  p_player_name text,
  p_country_code text,
  p_shots jsonb,
  p_client_ip inet
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_client_ip is null then
    raise exception 'Missing submission connection' using errcode = '22023';
  end if;
  -- The Edge Function supplies its gateway-derived visitor IP. The REST call
  -- itself originates from the Edge server, so do not rate-limit its egress IP.
  perform pg_catalog.set_config('request.headers',
    pg_catalog.jsonb_build_object('x-forwarded-for', pg_catalog.host(p_client_ip))::text, true);
  return public.submit_high_score(p_submission_id, p_player_name, p_country_code, p_shots);
end;
$$;

revoke all on function public.submit_high_score_via_backend(uuid, text, text, jsonb, inet)
  from public, anon, authenticated;
grant execute on function public.submit_high_score_via_backend(uuid, text, text, jsonb, inet) to service_role;
grant execute on function public.submit_high_score(uuid, text, text, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
