-- Letting people say no to reminder email, and reaching the nannies the
-- reminder could not see.
--
-- Two things in one migration because the second is unsafe without the first:
-- the nudge for nannies is about to start reaching real inboxes, and an email
-- somebody cannot turn off is not a reminder, it is a nuisance with a logo.
--
-- The opt out is per user and covers reminder mail only. Transactional mail
-- about the account itself (confirmation, password reset) and about things
-- that happened to you specifically (an application to your job) stays,
-- because those are the product working, not the product marketing itself.

create table public.email_optouts (
  user_id uuid primary key references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.email_optouts enable row level security;

-- Rows are written by the unsubscribe endpoint through the service client and
-- read by due_reminders as definer. Nobody needs direct access from a session.

-- ---------------------------------------------------------------------------
-- due_reminders, take two. Same shape, two changes:
--
--   1. Anybody in email_optouts is excluded from every branch.
--   2. The nanny branch also reaches a nanny who signed up and never opened
--      the onboarding at all. The original only saw profiles in draft, which
--      quietly excluded the larger group: on launch day, 12 of 19 registered
--      nannies had no profile row. Same root as the admin panel bug of the
--      14th: a person who exists only in users is invisible to a query that
--      starts from a profile table.
-- ---------------------------------------------------------------------------

create or replace function public.due_reminders(p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.reminder_config;
  v_bucket text;
  result jsonb;
begin
  select * into cfg from public.reminder_config where id;

  if cfg.audience = 'off' then
    return '[]'::jsonb;
  end if;

  -- One bucket per gap window, so the key repeats until the window rolls over.
  v_bucket := to_char(
    to_timestamp(floor(extract(epoch from now()) / (cfg.min_gap_hours * 3600))
                 * cfg.min_gap_hours * 3600),
    'YYYYMMDDHH24');

  select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) into result
    from (
      -- Unread messages waiting.
      select u.id as user_id,
             u.email,
             coalesce(u.first_name, 'there') as name,
             'unread'::text as reason,
             count(distinct m.conversation_id)::int as conversations,
             count(*)::int as messages,
             format('reminder:unread:%s:%s', u.id, v_bucket) as dedupe_key
        from public.messages m
        join public.conversations c on c.id = m.conversation_id
        join public.family_profiles f on f.id = c.family_id
        join public.nanny_profiles n on n.id = c.nanny_id
        join public.users u
          on u.id = case when m.sender_id = f.user_id then n.user_id else f.user_id end
       where m.read_at is null
         and m.created_at < now() - make_interval(hours => cfg.unread_after_hours)
         and c.blocked_at is null
         and u.status = 'active'
         and (cfg.audience = 'everyone' or public.has_active_subscription(f.id))
       group by u.id, u.email, u.first_name

      union all

      -- A family that made a profile and never posted or messaged anybody.
      select u.id, u.email, coalesce(u.first_name, 'there'), 'nudge_family', 0, 0,
             format('reminder:nudge:%s:%s', u.id, v_bucket)
        from public.family_profiles f
        join public.users u on u.id = f.user_id
       where f.created_at < now() - make_interval(hours => cfg.nudge_after_hours)
         and u.status = 'active'
         and (cfg.audience = 'everyone' or public.has_active_subscription(f.id))
         and not exists (select 1 from public.jobs j where j.family_id = f.id)
         and not exists (select 1 from public.conversations c where c.family_id = f.id)

      union all

      -- A nanny who has not finished her profile. Two shapes of not finished:
      -- a profile sitting in draft, and no profile at all. The second is the
      -- person who signed up, confirmed, and closed the tab; she is exactly
      -- who the reminder is for, and the original query could not see her.
      -- Never eligible while the audience is `paying`, because a nanny does
      -- not pay.
      select u.id, u.email, coalesce(u.first_name, 'there'), 'nudge_nanny', 0, 0,
             format('reminder:nudge:%s:%s', u.id, v_bucket)
        from public.users u
        left join public.nanny_profiles n on n.user_id = u.id
       where cfg.audience = 'everyone'
         and u.role = 'nanny'
         and u.status = 'active'
         and u.created_at < now() - make_interval(hours => cfg.nudge_after_hours)
         and (n.id is null or n.status = 'draft')
         and (n.id is null or n.created_at < now() - make_interval(hours => cfg.nudge_after_hours))
    ) r
   where not exists (
     select 1 from public.email_events e
      where e.idempotency_key = r.dedupe_key
   )
     and not exists (
     select 1 from public.email_optouts o
      where o.user_id = r.user_id
   )
   limit greatest(p_limit, 1);

  return result;
end;
$$;

comment on table public.email_optouts is
  'Users who asked reminder email to stop. Written by the unsubscribe endpoint, honoured by due_reminders. Account and application mail is not affected.';
