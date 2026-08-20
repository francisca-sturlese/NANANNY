-- The referral gets a screen, like everything else that gives something away.
--
-- The mechanic shipped switched off and correct, and with no way to switch it
-- on: the three settings existed only as columns, so turning it on meant a hand
-- in the production database. That contradicts the rule the rest of this
-- product follows. Prices, the launch window and the publishing threshold all
-- live in config precisely so they are changed from a screen rather than by a
-- release, and the one thing that hands out free contacts was the exception.
--
-- Audited like every other administrative capability, and for a stronger
-- reason than most: this is the moment somebody starts giving away contacts
-- that would otherwise be sold, and the row in audit_logs is how anybody ever
-- answers who did it and when.

create or replace function public.admin_update_referral(
  p_enabled boolean,
  p_bonus_contacts int,
  p_bonus_max int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_admin() then
    raise exception 'ROLE1: Not permitted' using errcode = 'P0001';
  end if;

  -- Refused here rather than clamped silently. A negative reward or a ceiling
  -- of minus one is a typing mistake, and a screen that quietly corrects one
  -- teaches nobody what it did.
  if p_bonus_contacts is null or p_bonus_contacts < 0 or p_bonus_contacts > 10 then
    raise exception 'A referral is worth between 0 and 10 contacts' using errcode = 'P0001';
  end if;
  if p_bonus_max is null or p_bonus_max < 0 or p_bonus_max > 100 then
    raise exception 'The ceiling is between 0 and 100 contacts' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
           'enabled', referral_enabled,
           'bonus_contacts', referral_bonus_contacts,
           'bonus_max', referral_bonus_max)
    into v_before
    from public.pricing_config where id;

  update public.pricing_config
     set referral_enabled = p_enabled,
         referral_bonus_contacts = p_bonus_contacts,
         referral_bonus_max = p_bonus_max
   where id;

  select jsonb_build_object(
           'enabled', referral_enabled,
           'bonus_contacts', referral_bonus_contacts,
           'bonus_max', referral_bonus_max)
    into v_after
    from public.pricing_config where id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, before_state, after_state)
  values ((select auth.uid()), 'referral_updated', 'pricing_config', null, v_before, v_after);

  return v_after;
end;
$$;

revoke execute on function public.admin_update_referral(boolean, int, int) from public, anon;
grant execute on function public.admin_update_referral(boolean, int, int) to authenticated, service_role;

/**
 * What the back office shows next to the switch.
 *
 * Counts across the whole product rather than for one family, so an admin can
 * see whether the thing is working at all: invitations sent, invitations that
 * turned into a family who finished setting up, and the contacts given away
 * because of it. The last number is the cost, and it belongs on the same screen
 * as the switch that creates it.
 */
create or replace function public.admin_referral_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'ROLE1: Not permitted' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'claimed', (select count(*) from public.family_referrals),
    'qualified', (
      select count(*)
        from public.family_referrals r
        join public.family_profiles f on f.id = r.referred_family_id
       where f.onboarding_completed_at is not null
    ),
    'families_earning', (
      select count(distinct r.referrer_family_id)
        from public.family_referrals r
        join public.family_profiles f on f.id = r.referred_family_id
       where f.onboarding_completed_at is not null
    ),
    'contacts_granted', (
      select coalesce(sum(public.family_referral_bonus(f.id)), 0)
        from public.family_profiles f
    )
  ) into v;

  return v;
end;
$$;

revoke execute on function public.admin_referral_stats() from public, anon;
grant execute on function public.admin_referral_stats() to authenticated, service_role;
