-- Visa status, declared by the nanny.
--
-- In the UAE this is the first thing a family wants to know, because it decides
-- what hiring her actually involves. A nanny on her husband's visa can start
-- next week; one who needs sponsorship means paperwork, cost and months.
-- Families were filtering for it by asking in the first message, which spends a
-- contact to learn something that belongs on the card.
--
-- Two things this is not.
--
-- It is not a verification. The nanny says what her status is, the same way she
-- says how many years she has worked. The `visa` document in nanny_documents
-- and the human review behind it are what verification means here, and that
-- separation is the same one the badges already keep: approved is not verified.
--
-- It is not advice about whether she can legally be employed. The site shows
-- what she declared. Anything beyond that is between the family, the nanny and
-- whoever actually regulates this.

create type public.visa_status as enum (
  'own_visa',           -- Holds her own residence visa
  'family_visa',        -- On a husband's or family member's visa
  'cancelled_visa',     -- Visa cancelled, in the grace period or between jobs
  'needs_sponsorship',  -- Would need the employing family to sponsor her
  'not_said'            -- Has not answered. Never shown as a claim.
);

alter table public.nanny_profiles
  add column if not exists visa_status public.visa_status not null default 'not_said';

comment on column public.nanny_profiles.visa_status is
  'Self declared. Never treat as verified: that is what the visa document and its human review are for.';

-- The search filters on it, and always alongside status = approved.
create index if not exists nanny_profiles_approved_visa_idx
  on public.nanny_profiles (visa_status)
  where status = 'approved';

-- Readable by everyone who can already read a profile. It is not sensitive in
-- the way a document is: it is one of the first things a nanny writes on a job
-- board herself, and withholding it from the card only forces a family to spend
-- a contact asking.
grant select (visa_status) on public.nanny_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profile completion
-- ---------------------------------------------------------------------------

-- Required, and weighted like the other things a family decides on. A nanny
-- cannot submit a profile for review without saying what her status is.
--
-- `not_said` stays in the enum because it is the column default and the state a
-- half finished profile is genuinely in. It is not an answer she can submit,
-- and it is never rendered as a claim.
create or replace function public.nanny_profile_completion(p_nanny_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n record;
  required_missing text[] := '{}';
  optional_missing text[] := '{}';
  earned numeric := 0;
  total numeric := 0;
  checks jsonb;
begin
  select * into n from public.nanny_profiles where id = p_nanny_id;
  if n.id is null then
    return jsonb_build_object('percent', 0, 'missing', '[]'::jsonb,
                              'required_missing', '[]'::jsonb, 'can_submit', false);
  end if;

  checks := jsonb_build_array(
    jsonb_build_array('First name',            n.first_name is not null and btrim(n.first_name) <> '', 10, true),
    jsonb_build_array('Profile photo',         n.photo_url is not null,                                10, true),
    jsonb_build_array('Location',              n.emirate is not null,                                  10, true),
    jsonb_build_array('Nationality',           n.nationality is not null,                               5, true),
    jsonb_build_array('Date of birth',         n.date_of_birth is not null,                             5, true),
    jsonb_build_array('Years of experience',   n.years_experience > 0,                                 10, true),
    jsonb_build_array('Languages',             array_length(n.languages, 1) > 0,                        8, true),
    jsonb_build_array('English level',         n.english_level <> 'none',                               5, true),
    jsonb_build_array('Availability',          n.available_from is not null,                            7, true),
    jsonb_build_array('Salary expectation',    n.salary_expectation_min_aed is not null,                8, true),
    jsonb_build_array('About you',             n.description is not null and length(btrim(n.description)) >= 80, 12, true),
    jsonb_build_array('Visa status',           n.visa_status <> 'not_said',                             6, true),
    jsonb_build_array('Video introduction',    n.video_url is not null,                                 4, false),
    jsonb_build_array('UAE experience',        n.uae_experience_years > 0,                              2, false),
    jsonb_build_array('Education',             n.education is not null,                                 2, false),
    jsonb_build_array('Certificates',          array_length(n.certificates, 1) > 0,                     1, false),
    jsonb_build_array('Preferred locations',   array_length(n.preferred_locations, 1) > 0,              1, false)
  );

  declare
    item jsonb;
    label text;
    ok boolean;
    weight numeric;
    is_required boolean;
  begin
    for item in select * from jsonb_array_elements(checks) loop
      label       := item ->> 0;
      ok          := (item ->> 1)::boolean;
      weight      := (item ->> 2)::numeric;
      is_required := (item ->> 3)::boolean;

      total := total + weight;
      if ok then
        earned := earned + weight;
      elsif is_required then
        required_missing := required_missing || label;
      else
        optional_missing := optional_missing || label;
      end if;
    end loop;
  end;

  -- References are counted from their own table.
  total := total + 3;
  if exists (select 1 from public.nanny_references where nanny_id = p_nanny_id) then
    earned := earned + 3;
  else
    -- The ::text cast is load-bearing: against an untyped literal Postgres
    -- picks array || array and tries to parse the string as an array literal.
    optional_missing := optional_missing || 'At least one reference'::text;
  end if;

  return jsonb_build_object(
    'percent', round((earned / nullif(total, 0)) * 100)::int,
    'missing', to_jsonb(required_missing || optional_missing),
    'required_missing', to_jsonb(required_missing),
    'can_submit', cardinality(required_missing) = 0
  );
end;
$$;

-- The weights changed, so every stored percentage is now stale.
update public.nanny_profiles
   set profile_completion = (public.nanny_profile_completion(id) ->> 'percent')::int;
