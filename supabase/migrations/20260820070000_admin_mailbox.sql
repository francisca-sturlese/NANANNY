-- The admin mailbox.
--
-- Federico's ask, verbatim: a section in the back office that works like a
-- Gmail box for nananny.com mail. Receiving already existed as a forward to a
-- personal Gmail, which works until the day the business needs its own record
-- of what was said to whom. This table is that record: every message in and
-- out of hello@nananny.com, stored where the product can show it.
--
-- Inbound rows are written by the mail worker (service role) when Cloudflare
-- Email Routing hands it a message. Outbound rows are written by the admin
-- send action after Resend accepts the message. The mail keeps flowing to the
-- personal Gmail as well, so nothing depends on this table being right yet.

create table if not exists public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'out')),
  -- RFC message id when we have one, Resend id for outbound. Used for
  -- threading replies, never shown.
  message_id text,
  in_reply_to text,
  -- One thread = one counterpart + one subject, normalised. Cheap Gmail-style
  -- threading without storing the whole References chain.
  thread_key text not null,
  from_address text not null,
  to_address text not null,
  subject text not null default '',
  text_body text not null default '',
  -- Attachment names and sizes only. The files themselves are not stored:
  -- the full original still lands in the forwarded Gmail copy, and storing
  -- strangers' files needs its own thinking before it happens.
  attachments jsonb not null default '[]'::jsonb,
  read_at timestamptz,
  provider_id text,
  created_at timestamptz not null default now()
);

comment on table public.mail_messages is
  'Every email in and out of the product''s own addresses. Bodies are stored as text; rendering escapes everything, because the sender of an inbound mail is the definition of untrusted.';

create index if not exists mail_messages_list_idx
  on public.mail_messages (direction, created_at desc);
create index if not exists mail_messages_thread_idx
  on public.mail_messages (thread_key, created_at);
create index if not exists mail_messages_unread_idx
  on public.mail_messages (created_at)
  where direction = 'in' and read_at is null;

alter table public.mail_messages enable row level security;
grant all on public.mail_messages to service_role;

-- No policies for authenticated on purpose: the mailbox is read through the
-- definer functions below, which check is_admin() themselves. A table this
-- sensitive gets one door.

/** The inbox or the sent list, newest first. */
create or replace function public.admin_mail_list(p_direction text default 'in', p_limit int default 50)
returns setof public.mail_messages
language sql
stable
security definer
set search_path = public
as $$
  select m.*
    from public.mail_messages m
   where public.is_admin()
     and m.direction = p_direction
   order by m.created_at desc
   limit least(greatest(p_limit, 1), 200);
$$;

/** One conversation, oldest first, the way a thread reads. */
create or replace function public.admin_mail_thread(p_thread_key text)
returns setof public.mail_messages
language sql
stable
security definer
set search_path = public
as $$
  select m.*
    from public.mail_messages m
   where public.is_admin()
     and m.thread_key = p_thread_key
   order by m.created_at asc;
$$;

/**
 * Opening a thread marks its inbound mail read.
 *
 * Volatile and separate from the read function, because a stable function
 * runs inside the calling query's snapshot and cannot write.
 */
create or replace function public.admin_mail_mark_read(p_thread_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ROLE1: Not permitted';
  end if;
  update public.mail_messages
     set read_at = now()
   where thread_key = p_thread_key
     and direction = 'in'
     and read_at is null;
end;
$$;

/** For the badge in the rail: how many inbound messages nobody has opened. */
create or replace function public.admin_mail_unread_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin()
              then (select count(*)::int from public.mail_messages
                     where direction = 'in' and read_at is null)
              else 0 end;
$$;

revoke execute on function public.admin_mail_list(text, int) from public, anon;
revoke execute on function public.admin_mail_thread(text) from public, anon;
revoke execute on function public.admin_mail_mark_read(text) from public, anon;
revoke execute on function public.admin_mail_unread_count() from public, anon;
grant execute on function public.admin_mail_list(text, int) to authenticated, service_role;
grant execute on function public.admin_mail_thread(text) to authenticated, service_role;
grant execute on function public.admin_mail_mark_read(text) to authenticated, service_role;
grant execute on function public.admin_mail_unread_count() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The send limit lives here, like every other rate limit
-- ---------------------------------------------------------------------------
--
-- Fifty outbound mails a day. The number is not for Federico, who will never
-- reach it; it is for a stolen admin session, which otherwise sends from our
-- domain until Resend closes the account, and with it the signup confirmation
-- mail of every future user. In the database and as a trigger, for the same
-- reason the support request limit is: the deployment target keeps nothing
-- between requests, and a limit in the action is a limit only for the polite.

create or replace function public.mail_send_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'out' and (
    select count(*) from public.mail_messages
     where direction = 'out'
       and created_at > now() - interval '24 hours'
  ) >= 50 then
    raise exception 'MAIL1: daily outbound mail limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists mail_messages_send_limit on public.mail_messages;
create trigger mail_messages_send_limit
  before insert on public.mail_messages
  for each row execute function public.mail_send_limit();

-- ---------------------------------------------------------------------------
-- The phone rings for new mail
-- ---------------------------------------------------------------------------
--
-- Reissued in full with one kind added: admin_mail_received. The mail worker
-- inserts a notifications row per admin when something arrives, and this
-- allowlist is what lets that row become a push. Everything else unchanged,
-- copied from the live definition rather than from memory.

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
    'admin_support_request',
    'admin_mail_received'
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
