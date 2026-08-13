-- NaNanny UAE — display names on the profile tables
--
-- RLS deliberately stops a family from reading a nanny's `users` row (it holds
-- her email and phone, which are private per PRD §41). That left the public
-- profile with no name to render.
--
-- The fix is not to loosen the policy but to put the *display* identity on the
-- profile itself: first name only, exactly what PRD §11 specifies a nanny card
-- shows. Her legal identity stays in `users`, readable only by herself and
-- admins.

alter table public.nanny_profiles
  add column first_name text;

comment on column public.nanny_profiles.first_name is
  'Display name shown to families. First name only by design — never the surname.';

-- Same for families: a nanny sees "The Al Marri family", never an email.
-- (family_profiles.display_name already exists and serves this purpose.)

-- Backfill from the account record for any profile created before this column.
update public.nanny_profiles n
   set first_name = u.first_name
  from public.users u
 where u.id = n.user_id and n.first_name is null;

-- Keep it in step when a nanny renames herself on the account, unless she has
-- deliberately set a different display name on the profile.
create or replace function public.sync_nanny_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.nanny_profiles
     set first_name = new.first_name
   where user_id = new.id
     and (first_name is null or first_name = old.first_name);
  return new;
end;
$$;

create trigger users_sync_nanny_display_name
  after update of first_name on public.users
  for each row
  when (new.role = 'nanny' and new.first_name is distinct from old.first_name)
  execute function public.sync_nanny_display_name();

-- Populate it at creation time too, so a profile row is never nameless.
create or replace function public.set_nanny_display_name_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.first_name is null then
    select first_name into new.first_name from public.users where id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger nanny_profiles_set_display_name
  before insert on public.nanny_profiles
  for each row execute function public.set_nanny_display_name_on_insert();

-- The name is part of the public discovery card.
grant select (first_name) on public.nanny_profiles to anon;

-- Searchable by name as well.
create or replace function public.nanny_profiles_refresh_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.first_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.headline, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.nationality, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.emirate, '') || ' ' || coalesce(new.area, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(new.languages, ' ')), 'C') ||
    setweight(to_tsvector('simple', coalesce(new.description, '')), 'D');
  return new;
end;
$$;
