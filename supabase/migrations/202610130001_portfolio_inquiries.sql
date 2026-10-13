begin;

create table public.portfolio_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  email text not null check (
    char_length(email) between 3 and 200
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  subject text not null check (char_length(btrim(subject)) between 1 and 200),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  status text not null default 'new' check (status in ('new', 'replied', 'archived'))
);

alter table public.portfolio_inquiries enable row level security;

-- Public clients can submit just these fields. No read/update/delete grants.
revoke all on public.portfolio_inquiries from public, anon, authenticated;
grant usage on schema public to anon;
grant insert (name, email, subject, message) on public.portfolio_inquiries to anon;
grant all on public.portfolio_inquiries to service_role;

create policy "Visitors can submit an inquiry"
  on public.portfolio_inquiries
  for insert to anon
  with check (status = 'new');

create index portfolio_inquiries_created_at_idx
  on public.portfolio_inquiries (created_at desc);

commit;
