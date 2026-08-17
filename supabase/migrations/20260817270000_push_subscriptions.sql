-- Web push: the phone learns what the bell already knows.
--
-- A nanny answered a family at 13:24 and the family found out hours later by
-- opening a tab. The bell was live the whole time; nobody was looking at it.
-- This is the half of push that lives in the database: where subscriptions
-- are kept, and the nudge that tells the worker to send the moment a
-- notification row is born.

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Where a person's devices live. One row per browser/device subscription;
-- the endpoint is the identity, and a re-subscribe upserts over it.
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failed_count int not null default 0
);

comment on table public.push_subscriptions is
  'Web push subscriptions, one per device. Written by the person from her own session; read by the dispatch route through the service role.';

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Her devices are hers: insert, see, and remove only rows carrying her id.
create policy push_subscriptions_own_insert on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_subscriptions_own_select on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_own_update on public.push_subscriptions
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- RLS decides rows, grants decide columns: both, as everywhere else.
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- The dispatch secret, held where only definer functions and the service key
-- can read it. A config table rather than the vault so this migration can
-- ship without a secret literal in the repo: the value is inserted
-- out-of-band with the service role after the push.
-- ---------------------------------------------------------------------------
create table public.push_dispatch_config (
  id boolean primary key default true check (id),
  secret text not null,
  updated_at timestamptz not null default now()
);

comment on table public.push_dispatch_config is
  'Bearer secret the notify trigger presents to /api/push/dispatch. Inserted out-of-band; readable by nobody but definer functions and the service role.';

alter table public.push_dispatch_config enable row level security;
grant all on public.push_dispatch_config to service_role;

-- ---------------------------------------------------------------------------
-- The nudge. AFTER INSERT on notifications: if this kind belongs on a phone,
-- ask the worker to send it. Asynchronous by construction (pg_net queues the
-- request), and never allowed to break the insert that carries the actual
-- notification: the bell must ring even when the push cannot.
-- ---------------------------------------------------------------------------
create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  /**
   * Not every notification deserves a vibration. Rejections are read when
   * she decides to look, not on the bus; the contact-details notice is a
   * service note. Good news and messages are what a phone is for.
   */
  if new.kind not in (
    'new_message',
    'application_received',
    'application_shortlisted',
    'application_interview',
    'application_hired',
    'profile_approved'
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
    -- The push is best-effort; the notification row is not.
    null;
  end;

  return null;
end;
$$;

revoke execute on function public.notify_push() from public, anon, authenticated;

create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.notify_push();
