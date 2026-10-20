-- Run after the complete backend cutover. All fixture changes are rolled back.
begin;
do $$
begin
  if has_function_privilege('anon', 'public.submit_high_score(uuid,text,text,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.submit_high_score(uuid,text,text,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.submit_high_score_via_backend(uuid,text,text,jsonb,inet)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.submit_high_score_via_backend(uuid,text,text,jsonb,inet)', 'EXECUTE') then
    raise exception 'API roles must not call either score RPC directly';
  end if;
  if not has_function_privilege('service_role', 'public.submit_high_score_via_backend(uuid,text,text,jsonb,inet)', 'EXECUTE') then
    raise exception 'The Edge backend must retain score access';
  end if;
end $$;
set local role anon;
do $$
begin
  if has_table_privilege(current_user, 'public.high_scores', 'INSERT,UPDATE,DELETE') then
    raise exception 'Visitors must not write directly to high_scores';
  end if;
  if not has_table_privilege(current_user, 'public.high_scores', 'SELECT') then
    raise exception 'Visitors must be able to read the leaderboard';
  end if;
  if has_schema_privilege(current_user, 'portfolio_private', 'USAGE') then
    raise exception 'Visitors must not access rate-limit records';
  end if;
  begin
    perform public.submit_high_score('00000000-0000-4000-8000-000000000001', 'Test', 'PH', '[]');
    raise exception 'Anonymous direct RPC must be denied';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.high_scores set is_visible = false;
insert into public.high_scores (player_name, score, country_code) values ('Enzo', 480, 'PH');
set local role service_role;
do $$
declare
  v_result jsonb;
  v_shots jsonb := (select jsonb_agg(jsonb_build_object('pocket_id', 'experiences', 'bounces', 20)) from generate_series(1, 10));
begin
  begin
    perform public.submit_high_score_via_backend('00000000-0000-4000-8000-000000000001', 'Test', 'PH', '[]', '192.0.2.16');
    raise exception 'Incomplete rounds must be rejected';
  exception when invalid_parameter_value then null;
  end;
  v_result := public.submit_high_score_via_backend('00000000-0000-4000-8000-000000000001', 'Test', 'PH', v_shots, '192.0.2.16');
  if v_result->>'saved' <> 'true' or (v_result->'best'->>'score')::integer <> 600 then
    raise exception 'The function must recompute ten shots as 600 points';
  end if;
  v_result := public.submit_high_score_via_backend('00000000-0000-4000-8000-000000000001', 'Test', 'PH', v_shots, '192.0.2.16');
  if v_result->>'saved' <> 'true' then raise exception 'Retries must be idempotent'; end if;
  if (select count(*) from public.high_scores where submission_id = '00000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'A retry must not create a duplicate';
  end if;
  begin
    perform public.submit_high_score_via_backend('00000000-0000-4000-8000-000000000002', 'Test', 'PH', v_shots, '192.0.2.16');
    raise exception 'Repeat submissions from the same visitor must be rate limited';
  exception when sqlstate 'PGRST' then null;
  end;
  v_result := public.submit_high_score_via_backend('00000000-0000-4000-8000-000000000003', 'Other', 'JP',
    (select jsonb_agg(jsonb_build_object('pocket_id', 'experiences', 'bounces', 21)) from generate_series(1, 10)), '192.0.2.17');
  if (v_result->'best'->>'score')::integer <> 630 then
    raise exception 'A different visitor must not share the Edge server rate limit';
  end if;
  v_result := public.submit_high_score_via_backend('00000000-0000-4000-8000-000000000004', 'Tied', 'JP',
    (select jsonb_agg(jsonb_build_object('pocket_id', 'experiences', 'bounces', 21)) from generate_series(1, 10)), '2001:db8::1');
  if v_result->>'saved' <> 'false' or v_result->'best'->>'player_name' <> 'Other' then
    raise exception 'A tie must not replace the current record';
  end if;
end $$;
reset role;
rollback;
