-- Run after the shared-high-score migration. No test rows are retained.
begin;
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
end $$;
reset role;
-- Ensure this test beats any existing record without persisting changes.
update public.high_scores set is_visible = false;
insert into public.high_scores (player_name, score, country_code) values ('Enzo', 480, 'PH');
set local request.headers = '{"x-forwarded-for":"192.0.2.16"}';
set local role anon;
do $$
declare
  v_result jsonb;
  v_shots jsonb := (select jsonb_agg(jsonb_build_object('pocket_id', 'experiences', 'bounces', 20)) from generate_series(1, 10));
begin
  begin
    perform public.submit_high_score('00000000-0000-4000-8000-000000000001', 'Test', 'PH', '[]');
    raise exception 'Incomplete rounds must be rejected';
  exception when invalid_parameter_value then null;
  end;
  v_result := public.submit_high_score('00000000-0000-4000-8000-000000000001', 'Test', 'PH', v_shots);
  if v_result->>'saved' <> 'true' or (v_result->'best'->>'score')::integer <> 600 then
    raise exception 'The function must recompute ten shots as 600 points';
  end if;
  v_result := public.submit_high_score('00000000-0000-4000-8000-000000000001', 'Test', 'PH', v_shots);
  if v_result->>'saved' <> 'true' then raise exception 'Retries must be idempotent'; end if;
  if (select count(*) from public.high_scores where submission_id = '00000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'A retry must not create a duplicate';
  end if;
  begin
    perform public.submit_high_score('00000000-0000-4000-8000-000000000002', 'Test', 'PH', v_shots);
    raise exception 'Repeat submissions must be rate limited';
  exception when sqlstate 'PGRST' then null;
  end;
end $$;
reset role;
set local request.headers = '{"x-forwarded-for":"192.0.2.17"}';
set local role anon;
do $$
declare v_result jsonb;
begin
  v_result := public.submit_high_score('00000000-0000-4000-8000-000000000003', 'Tied', 'JP',
    (select jsonb_agg(jsonb_build_object('pocket_id', 'experiences', 'bounces', 20)) from generate_series(1, 10)));
  if v_result->>'saved' <> 'false' or v_result->'best'->>'player_name' <> 'Test' then
    raise exception 'A tie must not replace the current record';
  end if;
  begin
    perform public.submit_high_score('00000000-0000-4000-8000-000000000004', 'Test', 'PH',
      '[{"pocket_id":"about","bounces":-1}]');
    raise exception 'Invalid shots must not save';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
rollback;
