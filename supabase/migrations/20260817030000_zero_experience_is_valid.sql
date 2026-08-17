-- Zero years of experience is an answer, not an omission.
--
-- Founder's decision: whether no formal experience is acceptable is the
-- family's judgement to make, reading the profile -- not a gate the form
-- enforces. This reverses this morning's min=1 fix in the other direction:
-- the rule now accepts zero, so the form and the rule agree again, which was
-- the actual defect (a zero passed the form and failed the rule, stranding
-- the nanny on a field that looked filled). The row keeps its weight so the
-- answer still counts toward the percentage, but it no longer blocks submit.

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
    jsonb_build_array('Years of experience',   n.years_experience is not null,                        10, false),
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
