-- Contact details do not stay in free text.
--
-- A nanny published her mobile number and her email at the bottom of her own
-- profile, in a careful advert ending "serious families are welcome to contact
-- me". She was doing what she does on every other board she has used.
--
-- Two reasons it cannot stand, and the first is hers. Her number was readable
-- by anybody, and `description` is a column an anonymous session may read, so
-- it was in the API and not only on the page. A woman looking for work in a
-- foreign country with her mobile in public is the person who gets the calls
-- nobody wants. The second is that it walks around the record of who contacted
-- whom that both sides rely on if something goes wrong.
--
-- What is being tested here is mostly restraint. Erasing a salary, a date or
-- somebody's working hours out of the middle of a sentence is worse than the
-- thing being prevented, because it happens to people who did nothing and they
-- cannot tell why.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on
\set uid '''6a999999-9999-4999-8999-99999999999a'''

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values (:uid::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'redact@test.local', '', now(), '{}'::jsonb,
        '{"role":"nanny","first_name":"Redact"}'::jsonb, now(), now());

\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. The advert that prompted this
-- ---------------------------------------------------------------------------
do $$
declare out text;
begin
  out := public.redact_contact_details(
    'Hello Parents, my name is NAKASI, a caring nanny with 6 years of ' ||
    'childcare experience in the UAE. Employment Visa valid until July 2027. ' ||
    'Call/WhatsApp: 0555816563. Jonerthanjulie@gmail.com. Serious families welcome.');

  if out not like '%0555816563%' and out not like '%@gmail.com%'
     and out like '%6 years%' and out like '%July 2027%' then
    raise notice 'PASS 1  the number and the address go, the advert survives';
  else
    raise notice 'FAIL 1  %', out;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Every way somebody writes a number here
-- ---------------------------------------------------------------------------
do $$
declare bad text[] := array[
  '0555816563', '055 581 6563', '055-581-6563', '+971 55 581 6563',
  '+971555816563', '(055) 581 6563', '04 123 4567'
];
  n text;
  failed text[] := '{}';
begin
  foreach n in array bad loop
    if public.redact_contact_details('reach me on ' || n || ' any time') like ('%' || n || '%') then
      failed := failed || n;
    end if;
  end loop;

  if cardinality(failed) = 0 then
    raise notice 'PASS 2  every common way of writing it is caught';
  else
    raise notice 'FAIL 2  survived: %', array_to_string(failed, ', ');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. And the numbers people are supposed to write
-- ---------------------------------------------------------------------------
-- This is the half that matters more. A rule that eats a salary is a rule that
-- gets switched off.
do $$
declare kept text := 'AED 4,000 to 5,000 per month. Working hours 08.00 - 17.00. ' ||
                     'With families from 2021 to 2025, children aged 3 and 6, born 17/08/1995.';
  out text;
begin
  out := public.redact_contact_details(kept);

  if out = kept then
    raise notice 'PASS 3  salaries, hours, dates and ages are left alone';
  else
    raise notice 'FAIL 3  %', out;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A number hiding behind something innocent
-- ---------------------------------------------------------------------------
-- The first version walked left to right and stopped at the first run that was
-- too short, so a set of working hours in front of a mobile number hid it.
do $$
declare out text;
begin
  out := public.redact_contact_details('Hours 08.00 - 17.00. My number is 0555816563, call me.');

  if out not like '%0555816563%' and out like '%08.00 - 17.00%' then
    raise notice 'PASS 4  a number behind a set of working hours is still found';
  else
    raise notice 'FAIL 4  %', out;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. It happens where the text is stored, not where it is shown
-- ---------------------------------------------------------------------------
-- `description` is readable by an anonymous session, so hiding it at render
-- time would leave it in every API response. This is the assertion that the
-- fix is in the right layer.
do $$
declare stored text;
begin
  insert into public.nanny_profiles (user_id, status, first_name, description)
  values ('6a999999-9999-4999-8999-99999999999a', 'draft', 'Redact',
          'Call me on 0555816563 or write to me@example.com');

  select description into stored from public.nanny_profiles
   where user_id = '6a999999-9999-4999-8999-99999999999a';

  if stored not like '%0555816563%' and stored not like '%me@example.com%' then
    raise notice 'PASS 5  the row itself never holds the contact details';
  else
    raise notice 'FAIL 5  stored as %', stored;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. And on the way back in, when she edits it again
-- ---------------------------------------------------------------------------
do $$
declare stored text;
begin
  update public.nanny_profiles
     set description = 'Actually my WhatsApp is +971 55 581 6563'
   where user_id = '6a999999-9999-4999-8999-99999999999a';

  select description into stored from public.nanny_profiles
   where user_id = '6a999999-9999-4999-8999-99999999999a';

  if stored not like '%581%' then
    raise notice 'PASS 6  an edit is cleaned like the first write';
  else
    raise notice 'FAIL 6  stored as %', stored;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. A job post, which is the same problem from the family's side
-- ---------------------------------------------------------------------------
do $$
declare stored text; v_family uuid;
begin
  select id into v_family from public.family_profiles limit 1;

  insert into public.jobs (family_id, title, emirate, status, additional_information)
  values (v_family, 'Nanny needed, call 0555816563', 'Dubai', 'draft',
          'Email us at family@example.com to arrange a meeting')
  returning additional_information into stored;

  if stored not like '%@example.com%' then
    raise notice 'PASS 7  a family cannot publish its own contact details either';
  else
    raise notice 'FAIL 7  %', stored;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. A family's own free text, which was left out for no reason
-- ---------------------------------------------------------------------------
-- Smaller than a nanny publishing hers, and the same problem: a home phone on a
-- public page, and no record of who contacted whom.
do $$
declare stored text; v_user uuid;
begin
  select user_id into v_user from public.family_profiles limit 1;

  update public.family_profiles
     set description = 'We are lovely. Ring us on 0555816563 or family@example.com'
   where user_id = v_user;

  select description into stored from public.family_profiles where user_id = v_user;

  if stored not like '%0555816563%' and stored not like '%@example.com%' then
    raise notice 'PASS 8  a family cannot leave its number in its own description';
  else
    raise notice 'FAIL 8  %', stored;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. And we can tell whose text we edited, so we can say so
-- ---------------------------------------------------------------------------
-- The form warns before somebody types, which covers everybody arriving from
-- today and nobody whose advert was cleaned this morning. Finding "[number
-- removed]" in your own profile with no explanation reads as being told off by
-- a machine.
do $$
begin
  if public.was_redacted('call me on [number removed]')
     and public.was_redacted('write to [email removed]')
     and not public.was_redacted('a perfectly ordinary sentence about children')
  then
    raise notice 'PASS 9  the person whose text was edited can be told why';
  else
    raise notice 'FAIL 9  was_redacted does not distinguish';
  end if;
end $$;

rollback;
