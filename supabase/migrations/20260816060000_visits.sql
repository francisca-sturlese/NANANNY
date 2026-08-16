-- Knowing whether nobody comes, or whether everybody comes and leaves.
--
-- Today those two are indistinguishable from the inside. Twenty five people
-- signed up on the day the founder did outreach and none since, and there is no
-- way to tell whether a thousand people looked at the site that day or twenty
-- six. Those two need opposite work, so every decision until now has been a
-- guess dressed as a plan.
--
-- Nothing here is a third party. The one script this product allows is its own,
-- and the analytics beacon Cloudflare injects is blocked by our own policy,
-- which is why the traffic dashboard has been reading zero. This writes to a
-- table we already had and nobody was using.
--
-- What is deliberately not recorded: no IP address, no user agent string, no
-- query strings, no path outside a fixed list. A visitor is a random id in a
-- first party cookie, which survives being cleared and means nothing anywhere
-- else. Enough to tell one person reading five pages from five people reading
-- one, which is the entire question, and not enough to follow anybody.

-- ---------------------------------------------------------------------------
-- Recording
-- ---------------------------------------------------------------------------

/**
 * One page view.
 *
 * Called by the backend, never by a session: it is written through the service
 * client from a route handler, so there is no grant here for anon and the
 * endpoint's own allowlist decides what counts as a path.
 *
 * `session_id` carries the visitor. It is the column that already existed for
 * exactly this and had never been written to.
 */
create or replace function public.record_visit(
  p_path text,
  p_source text,
  p_visitor text,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analytics_events (user_id, event, properties, session_id)
  values (
    p_user_id,
    'page_view',
    jsonb_build_object(
      'path', left(p_path, 120),
      -- The host only. "instagram.com", never the full URL somebody arrived
      -- from, which can carry their search terms or a private group's id.
      'source', left(coalesce(p_source, 'direct'), 60)),
    left(p_visitor, 40)
  );
end;
$$;

revoke execute on function public.record_visit(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_visit(text, text, text, uuid) to service_role;

/**
 * A thing somebody did, rather than a page they looked at.
 *
 * Signing up, finishing an onboarding step, applying. These are written from
 * the actions that already write to the database, so they cost one more
 * statement in a place that was already writing one, and they cannot be
 * blocked by anything in a browser.
 */
create or replace function public.record_event(
  p_event text,
  p_properties jsonb default '{}'::jsonb,
  p_user_id uuid default null,
  p_visitor text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analytics_events (user_id, event, properties, session_id)
  values (p_user_id, left(p_event, 60), coalesce(p_properties, '{}'::jsonb), left(p_visitor, 40));
end;
$$;

revoke execute on function public.record_event(text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.record_event(text, jsonb, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

/**
 * The two numbers the founder actually asked for, per day: how many people
 * looked, and how many signed up.
 *
 * People rather than page views. A page view count answers a question nobody
 * has: five people reading one page each and one person reading five look
 * identical, and only the first means anything is working.
 */
create or replace function public.admin_traffic(p_days int default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not permitted' using errcode = 'ROLE1';
  end if;

  select coalesce(jsonb_agg(row_to_json(d) order by d.day desc), '[]'::jsonb)
    into result
    from (
      select
        day::date as day,
        (select count(distinct a.session_id) from public.analytics_events a
          where a.event = 'page_view'
            and a.session_id is not null
            and (a.created_at at time zone 'Asia/Dubai')::date = day::date) as visitors,
        (select count(*) from public.analytics_events a
          where a.event = 'page_view'
            and (a.created_at at time zone 'Asia/Dubai')::date = day::date) as views,
        (select count(*) from public.users u
          where (u.created_at at time zone 'Asia/Dubai')::date = day::date) as signups
      from generate_series(
             (now() at time zone 'Asia/Dubai')::date - (greatest(p_days, 1) - 1),
             (now() at time zone 'Asia/Dubai')::date,
             interval '1 day') as day
    ) d;

  return result;
end;
$$;

revoke execute on function public.admin_traffic(int) from public;
grant execute on function public.admin_traffic(int) to authenticated, service_role;

/** Where those people came from, and which pages they landed on. */
create or replace function public.admin_traffic_sources(p_days int default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not permitted' using errcode = 'ROLE1';
  end if;

  select jsonb_build_object(
    'sources', (
      select coalesce(jsonb_agg(row_to_json(s) order by s.visitors desc), '[]'::jsonb)
        from (
          select properties ->> 'source' as source,
                 count(distinct session_id) as visitors
            from public.analytics_events
           where event = 'page_view'
             and created_at > now() - make_interval(days => greatest(p_days, 1))
           group by 1
           order by 2 desc
           limit 12
        ) s),
    'pages', (
      select coalesce(jsonb_agg(row_to_json(p) order by p.visitors desc), '[]'::jsonb)
        from (
          select properties ->> 'path' as path,
                 count(distinct session_id) as visitors,
                 count(*) as views
            from public.analytics_events
           where event = 'page_view'
             and created_at > now() - make_interval(days => greatest(p_days, 1))
           group by 1
           order by 2 desc
           limit 12
        ) p)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.admin_traffic_sources(int) from public;
grant execute on function public.admin_traffic_sources(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Keeping it small
-- ---------------------------------------------------------------------------

-- A row per page view grows without limit and answers nothing after a month.
-- Nothing here reads further back than the dashboard's own window, so the rows
-- past it are cost without use. Called from the same scheduled run as the
-- reminders.
create or replace function public.prune_visits(p_keep_days int default 90)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  delete from public.analytics_events
   where event = 'page_view'
     and created_at < now() - make_interval(days => greatest(p_keep_days, 7));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.prune_visits(int) from public, anon, authenticated;
grant execute on function public.prune_visits(int) to service_role;

create index if not exists analytics_events_visits_idx
  on public.analytics_events (created_at desc)
  where event = 'page_view';
