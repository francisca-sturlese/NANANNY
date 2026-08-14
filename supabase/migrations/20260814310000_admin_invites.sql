-- Inviting an administrator, instead of asking them to sign up as a stranger.
--
-- Until now appointing an admin took two steps in the wrong order: the person
-- had to register as a normal user first, then a super_admin promoted them
-- from the Users panel. This adds the missing half: a super_admin invites an
-- email address with a role, and when that exact address signs up, the role is
-- applied at creation, server side.
--
-- The security shape, agreed before a line was written: the role never
-- travels in a link or a token. It lives only in this table, keyed by email,
-- and is applied by the same trigger that creates the user row. A link can be
-- forwarded, quoted or tampered with; a row here cannot. If somebody signs up
-- with any other address, nothing happens.

create table public.admin_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  email text not null,
  role public.user_role not null check (role in ('admin', 'super_admin')),
  invited_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_user_id uuid references public.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.users (id) on delete set null
);

-- One live invite per address. Accepted or revoked ones stay as history.
create unique index admin_invites_one_pending
  on public.admin_invites (lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.admin_invites enable row level security;

-- Admins can read the list; nobody writes rows directly. Creation and
-- revocation go through the functions below, acceptance through the signup
-- trigger, all of which run as definer.
create policy admin_invites_admin_read on public.admin_invites
  for select using (public.is_admin());

-- RLS decides the rows, the grant opens the table: both are needed, and rows
-- are written only by the definer functions, so authenticated gets SELECT and
-- nothing else.
grant select on public.admin_invites to authenticated;

create or replace function public.admin_invite_create(
  p_email text,
  p_role public.user_role,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.user_role;
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  select role into v_actor_role from public.users where id = v_actor;
  if v_actor_role is distinct from 'super_admin' then
    raise exception 'Only a super admin can invite an administrator' using errcode = 'ROLE1';
  end if;

  if p_role not in ('admin', 'super_admin') then
    raise exception 'Only admin roles can be invited' using errcode = 'INVT1';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That does not look like an email address' using errcode = 'INVT2';
  end if;

  if exists (select 1 from public.users where lower(email) = v_email) then
    raise exception 'That email already has an account. Change their role from the Users page instead.'
      using errcode = 'INVT3';
  end if;

  insert into public.admin_invites (email, role, invited_by)
  values (v_email, p_role, v_actor)
  returning id into v_id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, after_state)
  values (v_actor, 'admin_invite_created', 'admin_invite', v_id,
          jsonb_build_object('email', v_email, 'role', p_role, 'reason', p_reason));

  return v_id;
exception
  when unique_violation then
    raise exception 'There is already a pending invite for that email' using errcode = 'INVT4';
end;
$$;

create or replace function public.admin_invite_revoke(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.user_role;
  v_invite public.admin_invites%rowtype;
begin
  select role into v_actor_role from public.users where id = v_actor;
  if v_actor_role is distinct from 'super_admin' then
    raise exception 'Only a super admin can revoke an invite' using errcode = 'ROLE1';
  end if;

  select * into v_invite from public.admin_invites where id = p_invite_id;
  if v_invite.id is null then
    raise exception 'No such invite' using errcode = 'INVT5';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'That invite was already accepted. Change their role from the Users page.'
      using errcode = 'INVT6';
  end if;

  update public.admin_invites
     set revoked_at = now(), revoked_by = v_actor
   where id = p_invite_id and revoked_at is null;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, before_state)
  values (v_actor, 'admin_invite_revoked', 'admin_invite', p_invite_id,
          jsonb_build_object('email', v_invite.email, 'role', v_invite.role));
end;
$$;

-- The event trigger from 20260814240000 has already stripped PUBLIC from both
-- functions and granted service_role. Signed-in users get them back on
-- purpose; the super_admin check lives inside.
grant execute on function public.admin_invite_create(text, public.user_role, text) to authenticated;
grant execute on function public.admin_invite_revoke(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Applying the invite at signup.
--
-- Same trigger that creates the user row. The email comparison happens here,
-- server side, against auth.users' own record of the address that was
-- actually registered; nothing the client sends can influence it.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := new.raw_user_meta_data ->> 'role';
  resolved_role public.user_role;
  v_invite public.admin_invites%rowtype;
begin
  if requested = 'nanny' then
    resolved_role := 'nanny';
  else
    resolved_role := 'family';
  end if;

  select * into v_invite
    from public.admin_invites
   where lower(email) = lower(new.email)
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
   order by created_at desc
   limit 1;

  if v_invite.id is not null then
    resolved_role := v_invite.role;
  end if;

  insert into public.users (id, email, role, first_name, last_name, phone, location)
  values (
    new.id,
    new.email,
    resolved_role,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'location'
  )
  on conflict (id) do nothing;

  if v_invite.id is not null then
    update public.admin_invites
       set accepted_at = now(), accepted_user_id = new.id
     where id = v_invite.id;

    insert into public.audit_logs (actor_id, action, entity_kind, entity_id, after_state)
    values (v_invite.invited_by, 'admin_invite_accepted', 'admin_invite', v_invite.id,
            jsonb_build_object('email', v_invite.email, 'role', v_invite.role,
                               'user_id', new.id));
  end if;

  return new;
end;
$$;

-- CREATE OR REPLACE above made the event trigger strip PUBLIC from this
-- function, and the auth service executes it through that grant. Without the
-- line below, every signup on the site fails the moment this migration runs.
grant execute on function public.handle_new_auth_user() to supabase_auth_admin;

comment on table public.admin_invites is
  'Standing invitations to join the team. The role is applied at signup, server side, only when the registered email matches. Created and revoked exclusively through admin_invite_create/revoke by a super_admin, audited.';
