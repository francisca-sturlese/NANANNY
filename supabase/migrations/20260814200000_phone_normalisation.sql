-- One person, one phone number, however they typed it.
--
-- A nanny made three accounts with the same number written three ways:
-- 971541869704, +971 54 186 9704, 0541869704. She did not want three accounts.
-- She thought the first one had not worked, because the confirmation link was
-- broken, and each time she started again the site cheerfully let her.
--
-- Two halves. The number is stored in one shape, so the same phone always looks
-- the same. And signing up with a number that already has an account says so,
-- and offers the way back in, instead of quietly making another one.
--
-- Not a unique constraint. Three reasons, in order of how much they matter:
-- there are already duplicates in production and the migration would simply
-- fail; a couple or a family sharing one number is a real thing and locking
-- them out would be a worse bug than the one being fixed; and the problem here
-- is somebody who is lost, not somebody who is cheating. The fix for lost is a
-- signpost, not a wall.

/**
 * A phone number in one shape.
 *
 * Defaults to the UAE, because that is where every user is and because the
 * common local forms are unambiguous:
 *
 *   +971 54 186 9704  ->  +971541869704
 *   971541869704      ->  +971541869704
 *   00971541869704    ->  +971541869704
 *   0541869704        ->  +971541869704   (national trunk zero dropped)
 *   541869704         ->  +971541869704   (bare mobile, always 9 digits)
 *
 * Anything already carrying a different country code is left as it is with the
 * punctuation stripped: an expat's number from home is still their number, and
 * guessing at it would be worse than leaving it alone.
 *
 * Returns null for anything that cannot be a phone number, so a junk value is
 * stored as nothing rather than as a number nobody can call.
 */
create or replace function public.normalise_phone(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
  v_had_plus boolean;
begin
  if p_raw is null or btrim(p_raw) = '' then
    return null;
  end if;

  v_had_plus := left(btrim(p_raw), 1) = '+';
  v_digits := regexp_replace(p_raw, '[^0-9]', '', 'g');

  if v_digits = '' then
    return null;
  end if;

  -- 00 is the other way of writing +.
  if left(v_digits, 2) = '00' then
    v_digits := substr(v_digits, 3);
    v_had_plus := true;
  end if;

  -- Already the UAE country code.
  if left(v_digits, 3) = '971' and length(v_digits) between 12 and 13 then
    return '+' || v_digits;
  end if;

  -- National form: a trunk zero then nine digits.
  if left(v_digits, 1) = '0' and length(v_digits) = 10 and not v_had_plus then
    return '+971' || substr(v_digits, 2);
  end if;

  -- Bare UAE mobile, nine digits starting with 5.
  if length(v_digits) = 9 and left(v_digits, 1) = '5' and not v_had_plus then
    return '+971' || v_digits;
  end if;

  -- Somebody else's country, or something we cannot place. Kept as given,
  -- because a wrong guess is worse than an unchanged number.
  if v_had_plus and length(v_digits) between 8 and 15 then
    return '+' || v_digits;
  end if;

  if length(v_digits) between 8 and 15 then
    return v_digits;
  end if;

  return null;
end;
$$;

comment on function public.normalise_phone(text) is
  'One shape for a phone number, defaulting to the UAE. Returns null for anything that cannot be one.';

-- ---------------------------------------------------------------------------
-- Store it normalised, from now on and retrospectively
-- ---------------------------------------------------------------------------

create or replace function public.normalise_user_phone()
returns trigger
language plpgsql
as $$
begin
  new.phone := public.normalise_phone(new.phone);
  return new;
end;
$$;

create trigger users_normalise_phone
  before insert or update of phone on public.users
  for each row execute function public.normalise_user_phone();

-- Existing rows, including the three accounts this was written for.
update public.users
   set phone = public.normalise_phone(phone)
 where phone is not null
   and phone is distinct from public.normalise_phone(phone);

-- Not unique, deliberately. See the note at the top of this file.
create index if not exists users_phone_idx on public.users (phone)
  where phone is not null;

/**
 * Whether this number already has an account.
 *
 * Called before a signup, through the service role, because the answer is about
 * somebody else's row and the person asking has no session yet. It returns a
 * boolean and never the account: telling an anonymous caller which email owns a
 * phone number would turn this into a lookup service.
 */
create or replace function public.phone_already_registered(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
     where phone is not null
       and phone = public.normalise_phone(p_phone)
  );
$$;

revoke execute on function public.phone_already_registered(text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- What an admin needs to see
-- ---------------------------------------------------------------------------

/**
 * Accounts that share a phone number.
 *
 * Grouped rather than flagged, because the answer is usually "this is one
 * person who got stuck", and what an operator needs is to see all of them at
 * once so they can merge the story rather than guess at it.
 */
create or replace function public.admin_duplicate_phones()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = 'ROLE1';
  end if;

  select coalesce(jsonb_agg(g order by g.accounts desc), '[]'::jsonb) into result
    from (
      select phone,
             count(*)::int as accounts,
             jsonb_agg(
               jsonb_build_object(
                 'id', id, 'email', email, 'role', role,
                 'name', btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')),
                 'created_at', created_at
               ) order by created_at
             ) as people
        from public.users
       where phone is not null
       group by phone
      having count(*) > 1
    ) g;

  return result;
end;
$$;

grant execute on function public.admin_duplicate_phones() to authenticated;
