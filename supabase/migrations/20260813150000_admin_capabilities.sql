-- NaNanny UAE — admin capabilities
--
-- The privacy hardening migration revoked table-wide UPDATE and granted only
-- the columns a user may edit on themselves. That was right, and it also means
-- an admin cannot suspend an account or grant a badge by writing to the table:
-- the grant blocks them before any policy is consulted.
--
-- Rather than widen the grants, every administrative action gets an explicit
-- SECURITY DEFINER function. Each one checks is_admin() itself, so the
-- capability cannot be reached by a stolen anon key, and each one writes to
-- audit_logs, so there is always a record of who did what.

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status public.account_status,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.account_status;
  v_role public.user_role;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = 'ROLE1';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own account status' using errcode = 'ADMN1';
  end if;

  select status, role into v_before, v_role from public.users where id = p_user_id;
  if v_before is null then
    raise exception 'User not found' using errcode = 'ADMN2';
  end if;

  -- An admin must not be able to suspend another admin: that is an argument
  -- between people, not a moderation action, and it locks the platform out.
  if v_role in ('admin', 'super_admin') then
    raise exception 'Admin accounts cannot be suspended from here' using errcode = 'ADMN1';
  end if;

  if p_status = 'suspended' and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'A suspension must record why' using errcode = 'ADMN3';
  end if;

  update public.users
     set status = p_status,
         suspended_at = case when p_status = 'suspended' then now() else null end,
         suspended_reason = case when p_status = 'suspended' then p_reason else null end
   where id = p_user_id;

  -- A suspended nanny must also disappear from search, not merely be unable to
  -- log in. Reactivating does NOT auto-approve: it goes back to review.
  if v_role = 'nanny' then
    if p_status = 'suspended' then
      update public.nanny_profiles set status = 'suspended' where user_id = p_user_id;
    elsif p_status = 'active' then
      update public.nanny_profiles
         set status = 'submitted', submitted_at = now()
       where user_id = p_user_id and status = 'suspended';
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, before_state, after_state)
  values (auth.uid(), 'user_status_change', 'user', p_user_id,
          jsonb_build_object('status', v_before),
          jsonb_build_object('status', p_status, 'reason', p_reason));

  return jsonb_build_object('status', p_status, 'previous', v_before);
end;
$$;

grant execute on function public.admin_set_user_status(uuid, public.account_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Verification badges
-- ---------------------------------------------------------------------------

-- Granting a badge is a claim NaNanny makes in public, so it is deliberately a
-- separate action from approving a profile and it records who made it.
create or replace function public.admin_grant_badge(
  p_nanny_id uuid,
  p_badge text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = 'ROLE1';
  end if;

  insert into public.nanny_badges (nanny_id, badge, granted_by, note)
  values (p_nanny_id, p_badge, auth.uid(), p_note)
  on conflict (nanny_id, badge) do update
    set granted_by = auth.uid(), granted_at = now(), note = excluded.note;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, after_state)
  values (auth.uid(), 'badge_granted', 'nanny_profile', p_nanny_id,
          jsonb_build_object('badge', p_badge, 'note', p_note));

  return jsonb_build_object('badge', p_badge, 'granted', true);
end;
$$;

create or replace function public.admin_revoke_badge(p_nanny_id uuid, p_badge text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = 'ROLE1';
  end if;

  delete from public.nanny_badges where nanny_id = p_nanny_id and badge = p_badge;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, before_state)
  values (auth.uid(), 'badge_revoked', 'nanny_profile', p_nanny_id,
          jsonb_build_object('badge', p_badge));

  return jsonb_build_object('badge', p_badge, 'granted', false);
end;
$$;

grant execute on function public.admin_grant_badge(uuid, text, text) to authenticated;
grant execute on function public.admin_revoke_badge(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create or replace function public.admin_resolve_report(
  p_report_id uuid,
  p_status public.report_status,
  p_resolution text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_before public.report_status;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = 'ROLE1';
  end if;

  select status into v_before from public.reports where id = p_report_id;
  if v_before is null then
    raise exception 'Report not found' using errcode = 'ADMN2';
  end if;

  -- Closing a report without saying what was decided leaves the next reviewer
  -- with no idea whether it was looked at properly.
  if p_status in ('actioned', 'dismissed')
     and (p_resolution is null or btrim(p_resolution) = '') then
    raise exception 'Say what was decided before closing a report' using errcode = 'ADMN3';
  end if;

  update public.reports
     set status = p_status,
         resolution = p_resolution,
         handled_by = auth.uid(),
         handled_at = now()
   where id = p_report_id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, before_state, after_state)
  values (auth.uid(), 'report_resolved', 'report', p_report_id,
          jsonb_build_object('status', v_before),
          jsonb_build_object('status', p_status, 'resolution', p_resolution));

  return jsonb_build_object('status', p_status);
end;
$$;

grant execute on function public.admin_resolve_report(uuid, public.report_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pricing
-- ---------------------------------------------------------------------------

-- Pricing is the commercial model. Changing it is audited like everything else,
-- and the free allowance cannot be set to something the product cannot honour.
create or replace function public.admin_update_pricing(
  p_free_contacts int,
  p_weekly_price numeric,
  p_monthly_price numeric,
  p_weekly_enabled boolean default true,
  p_monthly_enabled boolean default true,
  p_monthly_is_best_value boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_before jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = 'ROLE1';
  end if;

  if p_free_contacts < 0 or p_free_contacts > 50 then
    raise exception 'Free contacts must be between 0 and 50' using errcode = 'ADMN3';
  end if;
  if p_weekly_price < 0 or p_monthly_price < 0 then
    raise exception 'A price cannot be negative' using errcode = 'ADMN3';
  end if;
  if not p_weekly_enabled and not p_monthly_enabled then
    raise exception 'At least one plan must stay available, or nobody can ever pay'
      using errcode = 'ADMN3';
  end if;

  select to_jsonb(p) into v_before from public.pricing_config p where id;

  update public.pricing_config
     set free_contacts = p_free_contacts,
         weekly_price_aed = p_weekly_price,
         monthly_price_aed = p_monthly_price,
         weekly_enabled = p_weekly_enabled,
         monthly_enabled = p_monthly_enabled,
         monthly_is_best_value = p_monthly_is_best_value,
         updated_by = auth.uid()
   where id;

  insert into public.audit_logs (actor_id, action, entity_kind, before_state, after_state)
  values (auth.uid(), 'pricing_changed', 'pricing_config', v_before,
          jsonb_build_object('free_contacts', p_free_contacts,
                             'weekly_price_aed', p_weekly_price,
                             'monthly_price_aed', p_monthly_price));

  return jsonb_build_object('free_contacts', p_free_contacts);
end;
$$;

grant execute on function public.admin_update_pricing(int, numeric, numeric, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_job_status(
  p_job_id uuid,
  p_status public.job_status,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_before public.job_status;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = 'ROLE1';
  end if;

  select status into v_before from public.jobs where id = p_job_id;
  if v_before is null then
    raise exception 'Job not found' using errcode = 'ADMN2';
  end if;

  update public.jobs set status = p_status where id = p_job_id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, before_state, after_state)
  values (auth.uid(), 'job_moderated', 'job', p_job_id,
          jsonb_build_object('status', v_before),
          jsonb_build_object('status', p_status, 'reason', p_reason));

  return jsonb_build_object('status', p_status);
end;
$$;

grant execute on function public.admin_set_job_status(uuid, public.job_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Metrics
-- ---------------------------------------------------------------------------

-- One round trip for the whole dashboard. Fifteen separate queries from the
-- page would be fifteen network hops before anything renders.
create or replace function public.admin_metrics()
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
    'families', (select count(*) from public.family_profiles),
    'families_onboarded', (select count(*) from public.family_profiles
                            where onboarding_completed_at is not null),
    'nannies_total', (select count(*) from public.nanny_profiles),
    'nannies_by_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status::text, count(*) n from public.nanny_profiles group by 1) s
    ),
    'jobs_active', (select count(*) from public.jobs where status = 'active'),
    'jobs_total', (select count(*) from public.jobs),
    'applications', (select count(*) from public.job_applications),
    'conversations', (select count(*) from public.conversations),
    'messages', (select count(*) from public.messages),
    'saved_profiles', (select count(*) from public.saved_profiles),
    'reports_open', (select count(*) from public.reports where status in ('open', 'under_review')),
    -- Free-contact usage is the leading indicator of revenue.
    'free_contacts_used', (select count(*) from public.family_nanny_contacts
                            where consumed_free_credit),
    'paid_contacts', (select count(*) from public.family_nanny_contacts
                       where not consumed_free_credit),
    'subscriptions_active', (
      select count(*) from public.subscriptions
       where status in ('active', 'past_due', 'cancelled') and current_period_end > now()
    ),
    'subscriptions_by_plan', (
      select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb)
        from (select plan::text, count(*) n from public.subscriptions
               where current_period_end > now() group by 1) s
    ),
    'revenue_aed', (
      select coalesce(sum(amount_aed), 0) from public.payments where status = 'succeeded'
    ),
    'pending_review', (
      select count(*) from public.nanny_profiles where status in ('submitted', 'under_review')
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_metrics() to authenticated;

-- The funnel the business actually turns on (PRD §34, §64):
-- how many families reach each contact, and how many meet the paywall.
create or replace function public.admin_contact_funnel()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  limit_n int;
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = 'ROLE1';
  end if;

  select free_contacts into limit_n from public.pricing_config where id;

  with per_family as (
    select f.id,
           f.onboarding_completed_at is not null as onboarded,
           (select count(*) from public.family_nanny_contacts c where c.family_id = f.id) as contacts,
           exists (
             select 1 from public.subscriptions s
              where s.family_id = f.id and s.current_period_end > now()
                and s.status in ('active', 'past_due', 'cancelled')
           ) as subscribed
      from public.family_profiles f
  )
  select jsonb_build_object(
    'free_contact_limit', limit_n,
    'signed_up', (select count(*) from per_family),
    'profile_completed', (select count(*) from per_family where onboarded),
    'contacted_at_least', (
      select coalesce(jsonb_object_agg(step::text, n), '{}'::jsonb)
        from (
          select step, (select count(*) from per_family where contacts >= step) as n
            from generate_series(1, greatest(limit_n + 1, 1)) as step
        ) s
    ),
    'exhausted_allowance', (select count(*) from per_family where contacts >= limit_n),
    'subscribed', (select count(*) from per_family where subscribed),
    -- The number the business lives on: of the families that used every free
    -- contact, how many went on to pay.
    'free_to_paid_rate', (
      select case
        when count(*) filter (where contacts >= limit_n) = 0 then null
        else round(
          100.0 * count(*) filter (where contacts >= limit_n and subscribed)
          / count(*) filter (where contacts >= limit_n), 1)
      end
      from per_family
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_contact_funnel() to authenticated;
