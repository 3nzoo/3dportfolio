-- Run after the migration in SQL Editor. All test records are rolled back.
begin;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.portfolio_inquiries'::regclass) then
    raise exception 'Row Level Security must be enabled';
  end if;
end $$;

set local role anon;
insert into public.portfolio_inquiries (name, email, subject, message)
  values ('Permission test', 'test@example.com', 'Test inquiry', 'This is a temporary permissions check.');

do $$
begin
  begin
    perform * from public.portfolio_inquiries;
    raise exception 'FAIL: anonymous reads were allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.portfolio_inquiries set message = 'Modified';
    raise exception 'FAIL: anonymous updates were allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.portfolio_inquiries;
    raise exception 'FAIL: anonymous deletes were allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.portfolio_inquiries (name, email, subject, message, status)
      values ('Test', 'test@example.com', 'Test', 'Test', 'replied');
    raise exception 'FAIL: anonymous status injection was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.portfolio_inquiries (name, email, subject, message)
      values ('Test', 'not-an-email', 'Test', 'Test');
    raise exception 'FAIL: invalid email was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.portfolio_inquiries (name, email, subject, message)
      values ('Test', 'test@example.com', 'Test', '   ');
    raise exception 'FAIL: blank message was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.portfolio_inquiries (name, email, subject, message)
      values ('Test', 'test@example.com', 'Test', repeat('x', 5001));
    raise exception 'FAIL: oversized message was allowed';
  exception when check_violation then null;
  end;
end $$;

set local role authenticated;
do $$
begin
  begin
    perform * from public.portfolio_inquiries;
    raise exception 'FAIL: authenticated visitor reads were allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.portfolio_inquiries (name, email, subject, message)
      values ('Test', 'test@example.com', 'Test', 'Test');
    raise exception 'FAIL: authenticated visitor inserts were allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
