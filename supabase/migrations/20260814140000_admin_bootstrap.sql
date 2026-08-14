-- Making an administrator, in production.
--
-- Until now the only account with a role above `nanny` was the one the
-- development seed creates with a direct UPDATE, running as superuser. That
-- does not exist in production, and the column grants deliberately stop even a
-- signed-in admin from writing `users.role` by hand, so there was no supported
-- way to appoint anyone at all.
--
-- Two halves, on purpose.
--
-- The first administrator is created by a human with database access, running
-- the statement documented in docs/deployment.md. Bootstrapping the first one
-- should require the credentials that own the database, not a form.
--
-- Every administrator after that is appointed through this function by a
-- super_admin, and every appointment is audited. An `admin` cannot appoint
-- anyone: that separation is the point. If it were otherwise, one compromised
-- moderator account would be enough to mint more.

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role public.user_role,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.user_role;
  v_before public.user_role;
begin
  select role into v_actor_role from public.users where id = v_actor;

  if v_actor_role is distinct from 'super_admin' then
    raise exception 'Only a super admin can change a role' using errcode = 'ROLE1';
  end if;

  if p_user_id = v_actor then
    -- Removing your own last super_admin is how an organisation locks itself
    -- out of its own moderation queue at the worst possible moment.
    raise exception 'You cannot change your own role' using errcode = 'ROLE3';
  end if;

  select role into v_before from public.users where id = p_user_id;
  if v_before is null then
    raise exception 'No such user' using errcode = 'ROLE4';
  end if;

  update public.users set role = p_role where id = p_user_id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id,
                                 before_state, after_state)
  values (v_actor, 'user_role_change', 'user', p_user_id,
          jsonb_build_object('role', v_before),
          jsonb_build_object('role', p_role, 'reason', p_reason));
end;
$$;

grant execute on function public.admin_set_user_role(uuid, public.user_role, text) to authenticated;

comment on function public.admin_set_user_role(uuid, public.user_role, text) is
  'Appoints or demotes an administrator. Callable only by a super_admin, never on yourself, always audited. The first super_admin is created by SQL, see docs/deployment.md.';
