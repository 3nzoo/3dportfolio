-- Run once in Supabase SQL Editor. Preserves existing scores and contact tables.
begin;

create table if not exists public.high_scores (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(btrim(player_name)) between 1 and 40),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now(),
  is_visible boolean not null default true
);
alter table public.high_scores add column if not exists country_code text
  check (country_code is null or country_code ~ '^[A-Z]{2}$');
alter table public.high_scores add column if not exists submission_id uuid;
create unique index if not exists high_scores_submission_id_idx
  on public.high_scores (submission_id) where submission_id is not null;
create index if not exists high_scores_public_ranking_idx
  on public.high_scores (score desc, created_at asc, id asc) where is_visible = true;

alter table public.high_scores enable row level security;
revoke all on public.high_scores from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.high_scores to anon, authenticated;
grant all on public.high_scores to service_role;
drop policy if exists "Read visible leaderboard entries" on public.high_scores;
create policy "Read visible leaderboard entries" on public.high_scores
  for select to anon, authenticated using (is_visible = true);

-- Existing Enzo seed rows have a known country; other legacy rows stay unknown.
update public.high_scores set country_code = 'PH'
  where player_name = 'Enzo' and country_code is null;
insert into public.high_scores (player_name, score, country_code)
  select 'Enzo', 480, 'PH'
  where not exists (select 1 from public.high_scores where is_visible = true);

create schema if not exists portfolio_private;
revoke all on schema portfolio_private from public, anon, authenticated;
create table if not exists portfolio_private.score_submission_limits (
  client_key text primary key,
  last_submission timestamptz not null
);
revoke all on portfolio_private.score_submission_limits from public, anon, authenticated;

create or replace function public.submit_high_score(
  p_submission_id uuid,
  p_player_name text,
  p_country_code text,
  p_shots jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_shot jsonb;
  v_total integer := 0;
  v_hits integer;
  v_multiplier integer;
  v_name text := btrim(p_player_name);
  v_best jsonb;
  v_existing public.high_scores%rowtype;
  v_ip text;
  v_client_key text;
  v_last timestamptz;
begin
  if p_submission_id is null or v_name is null or char_length(v_name) not between 1 and 24
    or v_name ~ '[[:cntrl:]]' or p_country_code is null or p_country_code !~ '^[A-Z]{2}$'
    or coalesce(jsonb_typeof(p_shots), 'null') <> 'array' then
    raise exception 'Invalid score submission' using errcode = '22023';
  end if;
  if jsonb_array_length(p_shots) <> 10 then
    raise exception 'A complete ten-ball round is required' using errcode = '22023';
  end if;
  foreach v_shot in array array(select value from jsonb_array_elements(p_shots)) loop
    if coalesce(jsonb_typeof(v_shot->'bounces'), 'null') <> 'number'
      or (v_shot->>'bounces') !~ '^[0-9]{1,5}$' then
      raise exception 'Invalid pin-hit count' using errcode = '22023';
    end if;
    v_hits := (v_shot->>'bounces')::integer;
    v_multiplier := case v_shot->>'pocket_id'
      when 'about' then 2 when 'experiences' then 3 when 'education' then 1 when 'contact' then 2 else 0 end;
    if v_hits > 10000 or v_multiplier = 0 then
      raise exception 'Invalid shot' using errcode = '22023';
    end if;
    v_total := v_total + v_hits * v_multiplier;
  end loop;

  -- Serialize comparison, idempotent retries, and rate-limit updates atomically.
  perform pg_advisory_xact_lock(844527480);
  select jsonb_build_object('player_name', player_name, 'score', score, 'country_code', country_code)
    into v_best from public.high_scores where is_visible = true
    order by score desc, created_at asc, id asc limit 1;
  select * into v_existing from public.high_scores where submission_id = p_submission_id;
  if found then
    if v_existing.player_name <> v_name or v_existing.country_code is distinct from p_country_code or v_existing.score <> v_total then
      raise exception 'Submission identifier already used' using errcode = '22023';
    end if;
    return jsonb_build_object('saved', true, 'best', v_best);
  end if;

  -- Supabase's REST gateway supplies this header; don't accept a client body IP.
  v_ip := nullif(btrim(split_part(
    coalesce(nullif(current_setting('request.headers', true), '')::jsonb->>'x-forwarded-for', ''), ',', 1)), '');
  if v_ip is null then
    raise exception 'Unable to verify submission connection' using errcode = '22023';
  end if;
  v_client_key := md5(v_ip);
  select last_submission into v_last from portfolio_private.score_submission_limits where client_key = v_client_key;
  if v_last > clock_timestamp() - interval '1 minute' then
    raise sqlstate 'PGRST' using
      message = '{"code":"PGRST","message":"Too many score submissions","details":null,"hint":null}',
      detail = '{"status":429,"headers":{"Retry-After":"60"}}';
  end if;
  delete from portfolio_private.score_submission_limits where last_submission < clock_timestamp() - interval '1 day';
  insert into portfolio_private.score_submission_limits (client_key, last_submission)
    values (v_client_key, clock_timestamp())
    on conflict (client_key) do update set last_submission = excluded.last_submission;

  if v_total <= coalesce((v_best->>'score')::integer, -1) then
    return jsonb_build_object('saved', false, 'best', v_best);
  end if;
  insert into public.high_scores (player_name, score, country_code, submission_id)
    values (v_name, v_total, p_country_code, p_submission_id);
  return jsonb_build_object('saved', true, 'best', jsonb_build_object(
    'player_name', v_name, 'score', v_total, 'country_code', p_country_code));
end;
$$;
revoke all on function public.submit_high_score(uuid, text, text, jsonb) from public;
grant execute on function public.submit_high_score(uuid, text, text, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
