-- NaNanny UAE — core identity tables

-- Mirror of auth.users carrying the application role and shared contact fields.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext not null unique,
  role public.user_role not null default 'family',
  status public.account_status not null default 'active',
  first_name text,
  last_name text,
  phone text,
  location text,
  avatar_url text,
  suspended_at timestamptz,
  suspended_reason text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'Application-level user record, 1:1 with auth.users. Role lives here, never in client-controlled metadata alone.';

create index users_role_idx on public.users (role);
create index users_status_idx on public.users (status);

-- Shared updated_at trigger used by every mutable table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Provision the public.users row when Supabase Auth creates an account.
-- The role is taken from signup metadata but clamped: nobody can self-assign admin.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'family');
  resolved_role public.user_role;
begin
  if requested_role in ('family', 'nanny') then
    resolved_role := requested_role::public.user_role;
  else
    resolved_role := 'family';
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

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Role helpers. SECURITY DEFINER so RLS policies can call them without recursing
-- into public.users' own policies.
create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_family()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'family'
  );
$$;

create or replace function public.is_nanny()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'nanny'
  );
$$;
