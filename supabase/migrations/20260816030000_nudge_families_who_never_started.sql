-- The family who never started, seen at last.
--
-- Third appearance of the same blindness in three days: a query that starts
-- from a profile table cannot see the person who registered and never made a
-- profile. The admin panel had it on the 14th, the nanny nudge had it this
-- morning, and the family nudge has it now. Ilaria and Sara signed up,
-- confirmed, and closed the tab; the reminder built for exactly them could
-- not name them.
--
-- The new arm is disjoint from the existing one by construction: the old arm
-- starts from family_profiles, the new one requires that no such row exists,
-- so a family can appear in one or the other and never in both. No dedup is
-- needed and the union stays honest.

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

      -- A family that signed up and never opened the onboarding at all. No
      -- profile row exists, which is precisely why the arm above cannot see
      -- them, and why this arm requires its absence: one family, one arm.
      -- Never eligible while the audience is `paying`: no profile, no
      -- subscription.
      select u.id, u.email, coalesce(u.first_name, 'there'), 'nudge_family', 0, 0,
             format('reminder:nudge:%s:%s', u.id, v_bucket)
        from public.users u
       where cfg.audience = 'everyone'
         and u.role = 'family'
         and u.status = 'active'
         and u.created_at < now() - make_interval(hours => cfg.nudge_after_hours)
         and not exists (select 1 from public.family_profiles f where f.user_id = u.id)

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
