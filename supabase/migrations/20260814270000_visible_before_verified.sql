-- A finished profile is visible before anybody has reviewed it.
--
-- Until now `approved` meant two things at once: a human has looked at this,
-- and families can find it. Tying them together meant a nanny who finished her
-- profile at nine in the evening was invisible until somebody woke up and
-- clicked, and in the meantime she had no reason to believe the site worked.
--
-- The repository already insists that approved is not verified. This finishes
-- that thought: being findable is the default once she has finished, and review
-- is what turns "not verified yet" into a badge that means something.
--
-- Draft stays invisible, and that is not an oversight. A draft is incomplete by
-- definition and she has not asked for it to be shown. Rejected and suspended
-- stay invisible for the obvious reason.
--
-- What this costs: an unreviewed profile is publicly readable, so anything
-- unpleasant in one is public until a moderator gets there. That is a real
-- trade and it is the reason the review queue exists at all. It is made
-- survivable by the profile carrying, in plain words, that nobody has checked
-- it yet.

/**
 * The statuses a family can find.
 *
 * One function rather than the same list written into four policies and five
 * queries, which is how one of them gets missed.
 */
create or replace function public.is_discoverable(p_status public.nanny_profile_status)
returns boolean
language sql
immutable
as $$
  select p_status in ('submitted', 'under_review', 'approved');
$$;

grant execute on function public.is_discoverable(public.nanny_profile_status)
  to anon, authenticated, service_role;

drop policy if exists nanny_profiles_public_read on public.nanny_profiles;
create policy nanny_profiles_public_read on public.nanny_profiles
  for select to authenticated
  using (public.is_discoverable(status));

drop policy if exists nanny_profiles_anon_read on public.nanny_profiles;
create policy nanny_profiles_anon_read on public.nanny_profiles
  for select to anon
  using (public.is_discoverable(status));

-- The badges and references hanging off a profile follow it.
drop policy if exists nanny_badges_public_read on public.nanny_badges;
create policy nanny_badges_public_read on public.nanny_badges
  for select to anon, authenticated
  using (exists (
    select 1 from public.nanny_profiles n
     where n.id = nanny_id and public.is_discoverable(n.status)
  ));

-- ---------------------------------------------------------------------------
-- Retroactively
-- ---------------------------------------------------------------------------

/**
 * Submits the profiles that were already finished.
 *
 * Only the ones where every required answer is present, which is exactly the
 * condition `submit_nanny_profile` checks: she filled it all in and the only
 * thing missing is the last button. The same judgement as publishing a family's
 * post from their onboarding, and the same reason.
 *
 * A half finished draft is left alone. Nobody's unfinished writing gets
 * published on their behalf.
 */
do $$
declare n record; moved int := 0;
begin
  for n in
    select id from public.nanny_profiles where status = 'draft'
  loop
    if (public.nanny_profile_completion(n.id) ->> 'can_submit')::boolean then
      update public.nanny_profiles
         set status = 'submitted',
             submitted_at = coalesce(submitted_at, now())
       where id = n.id;
      moved := moved + 1;
    end if;
  end loop;

  raise notice 'Submitted % finished profiles that were still drafts', moved;
end $$;
