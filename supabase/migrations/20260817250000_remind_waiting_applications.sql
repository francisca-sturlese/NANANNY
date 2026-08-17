-- Applications that wait are told about, more than once.
--
-- The application email is event-driven with a daily cap: it fires when a
-- nanny applies, and never again if the family goes quiet. Two applications
-- arrived this morning for families whose daily email had already gone out,
-- and nothing would ever have mentioned them again. This arm says "you still
-- have N applications waiting" after the nudge window, weekly at most, and
-- never on a day the person already received mail from us.

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

      -- Applications still waiting on a family's posts, said again after the
      -- first day. The application email fires when a nanny applies and never
      -- again if the family goes quiet; a nanny who waits usually takes
      -- another job, so the silence costs the exact thing the marketplace
      -- sells. The 24-hour guard keeps the founder's rule, never more than
      -- one email a day, true across systems and not only inside each one.
      select u.id as user_id,
             u.email,
             coalesce(u.first_name, 'there') as name,
             'waiting_apps'::text as reason,
             count(distinct j.id)::int as conversations,
             count(*)::int as messages,
             format('reminder:apps:%s:%s', u.id, v_bucket) as dedupe_key
        from public.job_applications a
        join public.jobs j on j.id = a.job_id
        join public.family_profiles f on f.id = j.family_id
        join public.users u on u.id = f.user_id
       where a.status = 'applied'
         and a.created_at < now() - make_interval(hours => cfg.nudge_after_hours)
         and j.status = 'active'
         and u.status = 'active'
         and (cfg.audience = 'everyone' or public.has_active_subscription(f.id))
         and not exists (
           select 1 from public.email_events e2
            where e2.user_id = u.id
              and e2.created_at > now() - interval '24 hours'
              and e2.status = 'sent'
         )
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

      -- A nanny whose profile cannot be submitted yet, whatever its status.
      -- The condition is NOT "not approved": it is "cannot yet submit".
      -- Excluding approved assumed the invariant "approved implies complete",
      -- which broke the day incomplete profiles were published and approved
      -- by hand to fill the shop window -- status stopped indicating
      -- completeness, and the four most incomplete visible profiles fell out
      -- of the one email that tells them what is missing. If you are tempted
      -- to filter on status again, this is why it was wrong the first time.
      -- Only `rejected` stays out: a rejected nanny is owed an explanation,
      -- not an invitation to finish.
      -- (nanny_profile_completion runs once per candidate row per tick;
      -- fine at tens of nannies, worth a materialised flag at thousands.)
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
         and (n.id is null or n.status <> 'rejected')
         and (n.id is null
              or not (public.nanny_profile_completion(n.id) ->> 'can_submit')::boolean)
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
