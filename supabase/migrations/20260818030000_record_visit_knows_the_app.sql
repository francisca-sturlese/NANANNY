-- The visit knows whether it came through the installed app.
--
-- The founder asked how many people actually use the PWA, and the honest
-- metric on iOS -- where no install event exists -- is visits arriving in
-- standalone display mode. One more argument, one more property; everything
-- else is the original function verbatim (session_id, truncations, the
-- host-only source rule). Old callers omit the flag and mean "not the app",
-- so nothing breaks mid-deploy.

create or replace function public.record_visit(
  p_path text,
  p_source text,
  p_visitor text,
  p_user_id uuid default null,
  p_standalone boolean default false
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
      'source', left(coalesce(p_source, 'direct'), 60))
      || case when p_standalone then jsonb_build_object('standalone', true) else '{}'::jsonb end,
    left(p_visitor, 40)
  );
end;
$$;

revoke execute on function public.record_visit(text, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_visit(text, text, text, uuid, boolean) to service_role;

-- The four-argument version would linger as an overload and PostgREST would
-- refuse the ambiguity.
drop function if exists public.record_visit(text, text, text, uuid);
