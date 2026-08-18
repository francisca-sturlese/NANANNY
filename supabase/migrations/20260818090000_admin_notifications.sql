-- The operator's phone learns what the queues already know.
--
-- The founder sat with nannies waiting for review and heard nothing: admin
-- events never wrote notification rows, so the push engine had nothing to
-- carry. Two triggers close that. A profile arriving for review and a real
-- support message now notify every administrator, and the push kind filter
-- learns the two new kinds -- both are good news by the bus test: "she
-- finished her profile" and "somebody wrote to us" are exactly what an
-- operator wants to feel buzz.

create or replace function public.notify_admins_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.notifications (user_id, kind, href, metadata)
    select u.id, 'admin_review_pending', '/admin/review',
           jsonb_build_object('nanny_name', coalesce(new.first_name, 'A nanny'))
      from public.users u
     where u.role in ('admin', 'super_admin')
       and u.status = 'active';
  end if;
  return null;
end;
$$;

revoke execute on function public.notify_admins_review() from public, anon, authenticated;

create trigger nanny_profiles_notify_admins
  after insert or update of status on public.nanny_profiles
  for each row execute function public.notify_admins_review();

create or replace function public.notify_admins_support()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sales pitches are filed, not announced.
  if coalesce(new.category, '') <> 'sales' then
    insert into public.notifications (user_id, kind, href, metadata)
    select u.id, 'admin_support_request', '/admin/support',
           jsonb_build_object('subject', left(coalesce(new.subject, 'No subject'), 80))
      from public.users u
     where u.role in ('admin', 'super_admin')
       and u.status = 'active';
  end if;
  return null;
end;
$$;

revoke execute on function public.notify_admins_support() from public, anon, authenticated;

create trigger support_requests_notify_admins
  after insert on public.support_requests
  for each row execute function public.notify_admins_support();

-- The push filter learns the two admin kinds. The function body is the
-- existing one with two lines added to the allowlist.
create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  if new.kind not in (
    'new_message',
    'application_received',
    'application_shortlisted',
    'application_interview',
    'application_hired',
    'profile_approved',
    'admin_review_pending',
    'admin_support_request'
  ) then
    return null;
  end if;

  select secret into v_secret from public.push_dispatch_config where id;
  if v_secret is null then
    return null;
  end if;

  begin
    perform net.http_post(
      url := 'https://nananny.com/api/push/dispatch',
      body := jsonb_build_object('notification_id', new.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      )
    );
  exception when others then
    null;
  end;

  return null;
end;
$$;

revoke execute on function public.notify_push() from public, anon, authenticated;
