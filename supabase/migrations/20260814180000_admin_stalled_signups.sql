-- People who signed up and then stopped.
--
-- Every number on the admin overview counts profile rows, and a profile row is
-- only created when somebody opens onboarding. So an account that signed up and
-- never got that far appears nowhere: not in the counts, not in the review
-- queue, not in the funnel. The panel says "0 nannies" while a real nanny has
-- an account, and the operator has no way to tell the difference between nobody
-- signing up and everybody stopping immediately after.
--
-- That distinction is the whole question in the first weeks of a marketplace,
-- and it is the one the panel could not answer.

create or replace function public.admin_stalled_signups()
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

  select jsonb_build_object(
    -- Signed up, never opened onboarding: no profile row exists at all.
    'families_no_profile', (
      select count(*) from public.users u
       where u.role = 'family'
         and not exists (select 1 from public.family_profiles f where f.user_id = u.id)
    ),
    'nannies_no_profile', (
      select count(*) from public.users u
       where u.role = 'nanny'
         and not exists (select 1 from public.nanny_profiles n where n.user_id = u.id)
    ),
    -- Started onboarding and stopped part way. Distinct from the above,
    -- because the fix is different: one is a navigation problem, the other is
    -- a form that is too long or asks for something they do not have.
    'families_incomplete', (
      select count(*) from public.family_profiles
       where onboarding_completed_at is null
    ),
    'nannies_draft', (
      select count(*) from public.nanny_profiles where status = 'draft'
    ),
    -- Never confirmed the address, so nothing else can happen for them.
    'unverified_emails', (
      select count(*) from auth.users
       where email_confirmed_at is null
         and created_at < now() - interval '1 hour'
    ),
    -- The list itself, newest first, so an operator can actually reach out.
    'stalled', (
      select coalesce(jsonb_agg(row_to_json(s) order by s.created_at desc), '[]'::jsonb)
        from (
          select u.id, u.email, u.first_name, u.last_name, u.role::text, u.created_at,
                 case
                   when u.role = 'family'
                        and not exists (select 1 from public.family_profiles f where f.user_id = u.id)
                     then 'never opened onboarding'
                   when u.role = 'nanny'
                        and not exists (select 1 from public.nanny_profiles n where n.user_id = u.id)
                     then 'never opened onboarding'
                   when u.role = 'family' then 'onboarding unfinished'
                   else 'profile still a draft'
                 end as stage
            from public.users u
           where u.role in ('family', 'nanny')
             and (
               (u.role = 'family' and (
                 not exists (select 1 from public.family_profiles f where f.user_id = u.id)
                 or exists (select 1 from public.family_profiles f
                             where f.user_id = u.id and f.onboarding_completed_at is null)))
               or
               (u.role = 'nanny' and (
                 not exists (select 1 from public.nanny_profiles n where n.user_id = u.id)
                 or exists (select 1 from public.nanny_profiles n
                             where n.user_id = u.id and n.status = 'draft')))
             )
           order by u.created_at desc
           limit 50
        ) s
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_stalled_signups() to authenticated;

comment on function public.admin_stalled_signups() is
  'Accounts that signed up and stopped. Invisible in every other metric, because those count profile rows and a profile is only created once onboarding is opened.';
