-- The role and status guard, judged by who is actually running.
--
-- It asked `current_setting('role')`, which is the GUC PostgREST sets and which
-- a SECURITY DEFINER function does not change. So a function running as the
-- table owner, on purpose, on behalf of the person it belongs to, was refused
-- along with everybody else: `delete_my_account` could not mark the row it was
-- deleting.
--
-- `current_user` is the right question. Inside a SECURITY DEFINER function it
-- is the owner; in a statement a client sent it is `authenticated`. It also
-- cannot be set by the caller, which the GUC can.

create or replace function public.guard_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- True only when this statement came from a client session rather than from
  -- a function we wrote and own.
  v_from_client boolean := current_user = 'authenticated'
                           and current_setting('role', true) = 'authenticated';
begin
  if new.role is distinct from old.role then
    if v_from_client and not public.is_admin() then
      raise exception 'Changing your own role is not permitted' using errcode = 'ROLE2';
    end if;
  end if;

  if new.status is distinct from old.status
     and v_from_client
     and not public.is_admin() then
    raise exception 'Changing your own account status is not permitted' using errcode = 'ROLE2';
  end if;

  return new;
end;
$$;
