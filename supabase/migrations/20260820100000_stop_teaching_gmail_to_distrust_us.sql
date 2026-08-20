-- Two ways this product was teaching Gmail to distrust it.
--
-- The domain was created on 14 August. Six days later it had sent five emails
-- each to two nannies who never returned, twice with two arriving in the same
-- minute, and the founder asked why nobody answers. Authentication was never
-- the problem: DKIM, SPF and DMARC are all in place. Behaviour was.
--
-- The first fault is structural. Every branch of due_reminders carries its own
-- dedupe key, so the once-per-window guard was once per REASON. A person with
-- unread messages and an unfinished profile qualified twice and heard from us
-- twice, seconds apart.
--
-- The second is a judgement, and the number is in the open where it can be
-- argued with: after three reminders with no sign in since the first, stop.
-- Somebody who has not come back after three is not going to be persuaded by a
-- fourth, and a fourth costs the deliverability of every other email the
-- product sends, including the one somebody needs in order to register.
--
-- Both are guards on the way out, deliberately: the reasons above still
-- describe who *could* be told. What changed is how often we are willing to.

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

  /**
   * One row per person, chosen by which reason matters most to them.
   *
   * The guard below stops a SECOND reminder in the next window. It does not
   * stop two born in the same instant, because at that moment neither has
   * been sent and there is nothing in email_events to find. That is precisely
   * what happened on 20 August: two nannies each qualified as "you have
   * unread messages" and "your profile is unfinished" in one pass, and got
   * both, seconds apart.
   *
   * Found by building the case rather than by reasoning about it: a nanny
   * with an incomplete profile and one unread message produced two rows with
   * the guard already in place. Whoever changes this next should build that
   * case again before believing the result.
   *
   * Somebody waiting for an answer beats a nudge about an unfinished profile,
   * every time: one is another person waiting, the other is our housekeeping.
   */
  select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) into result
    from (
      select distinct on (q.user_id) q.*
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
        ) q
       order by q.user_id,
                case q.reason
                  when 'unread' then 1
                  when 'waiting_apps' then 2
                  when 'nudge_family' then 3
                  else 4
                end
    ) r
   where not exists (
     select 1 from public.email_events e
      where e.idempotency_key = r.dedupe_key
   )
     and not exists (
     select 1 from public.email_optouts o
      where o.user_id = r.user_id
        and o.scope in ('all', 'reminders')
   )
     /**
      * One reminder per person per window, whatever the reason.
      *
      * Each branch above carries its own dedupe key, so the guard was per
      * kind rather than per person: on 20 August two nannies each received a
      * reminder about unread messages and a nudge to finish their profile
      * **in the same minute**. From a six day old domain, to Gmail and
      * iCloud. That is not a cosmetic annoyance, it is the behaviour that
      * teaches a mailbox provider to file everything we send, including the
      * confirmation mail somebody needs in order to sign up at all.
      */
     and not exists (
     select 1 from public.email_events e
      where e.user_id = r.user_id
        and e.email_type like 'reminder_%'
        and e.status = 'sent'
        and e.created_at > now() - make_interval(hours => cfg.min_gap_hours)
   )
     /**
      * And stop asking somebody who never comes back.
      *
      * Christina was emailed five times in three days and had last opened the
      * app three days before the first of them. Repeating an unanswered
      * message is the strongest negative signal a sender can produce, and it
      * is spent on the person least likely to read it.
      *
      * Three unanswered is the line, and unanswered means what it says: no
      * sign in since the first of them. Anybody who comes back resets it,
      * because somebody who returned is somebody worth telling.
      */
     and (
       select count(*) from public.email_events e
        where e.user_id = r.user_id
          and e.email_type like 'reminder_%'
          and e.status = 'sent'
          and e.created_at > coalesce(
                (select au.last_sign_in_at from auth.users au where au.id = r.user_id),
                '-infinity'::timestamptz)
     ) < 3
   limit greatest(p_limit, 1);

  return result;
end;
$$;
