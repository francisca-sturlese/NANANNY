-- Closing every function that gets written from now on.
--
-- The sweep in 20260814210000 fixed the functions that existed when it ran, and
-- three written afterwards were immediately reachable again, one of which would
-- publish a job post on behalf of any family whose id you could guess. A
-- one-time migration cannot fix a default; only changing the default can.
--
-- So this changes it. Every function created in `public` from now on has its
-- PUBLIC grant removed the moment it is created, and gets it back only if
-- somebody grants it on purpose. The test in supabase/tests/function_grants.sql
-- is still there as the second line: this stops the accident, the test catches
-- the deliberate mistake.

create or replace function public.revoke_public_on_new_function()
returns event_trigger
language plpgsql
as $$
declare obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
  loop
    if obj.command_tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
       and obj.schema_name = 'public' then
      execute format('revoke execute on function %s from public', obj.object_identity);
      -- The backend's own key keeps everything, as it does everywhere else.
      execute format('grant execute on function %s to service_role', obj.object_identity);
    end if;
  end loop;
end;
$$;

drop event trigger if exists close_new_functions;
create event trigger close_new_functions
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
  execute function public.revoke_public_on_new_function();

-- ---------------------------------------------------------------------------
-- The three that slipped through
-- ---------------------------------------------------------------------------

-- A trigger function. Triggers run as the table owner and never need this.
revoke execute on function public.publish_job_on_onboarding() from public;

/**
 * Takes a family id and publishes a post for it.
 *
 * It was granted to `authenticated`, which meant any signed-in user could
 * publish a job on behalf of any family whose id they had. The id is not
 * secret: it appears in a job listing. Only the trigger and the backend need
 * this, and both run as roles that already have it.
 */
revoke execute on function public.publish_job_from_requirements(uuid) from public, authenticated;
grant execute on function public.publish_job_from_requirements(uuid) to service_role;

-- Checks is_admin() itself, like every other admin capability, so it is
-- reachable by a session on purpose.
revoke execute on function public.admin_update_reminders(text, int, int, int) from public;
grant execute on function public.admin_update_reminders(text, int, int, int)
  to authenticated, service_role;

-- The reminder functions, which the event trigger did not exist to catch.
revoke execute on function public.due_reminders(int) from public;
grant execute on function public.due_reminders(int) to service_role;

revoke execute on function public.claim_reminder(uuid, text, text, text) from public;
grant execute on function public.claim_reminder(uuid, text, text, text) to service_role;
