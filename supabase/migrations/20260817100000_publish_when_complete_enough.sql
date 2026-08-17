-- Publishing a profile that is complete enough, in the product rather than on
-- a laptop.
--
-- The rule is Federico's: a profile half filled in is worth showing, because a
-- family reading it judges better than a threshold does, and a marketplace with
-- nothing in it helps nobody. It has been running as a poll on the operator's
-- Mac, which worked and had two properties worth removing. It stopped when the
-- lid was closed, silently, and nobody could tell: one nanny sat unpublished
-- for an afternoon because of exactly that. And nothing could test it, so a
-- wrong threshold would have published people nobody meant to publish.
--
-- As a trigger it is also simply better. The poll ran hourly; this fires the
-- moment she crosses the line, which for somebody who has just finished filling
-- in her profile is the difference between being found today and tomorrow.
--
-- It only ever moves a draft to submitted. Approved, rejected and under review
-- are decisions a person made, and nothing automatic gets to undo them.

create table if not exists public.publishing_config (
  id boolean primary key default true check (id),

  /**
   * Off is a real setting, and the reason to have it is that the alternative to
   * a switch is a deploy. If this ever publishes somebody it should not, the
   * fix has to be available to whoever notices rather than to whoever can
   * release.
   */
  enabled boolean not null default true,

  -- How complete is complete enough. Fifty, by instruction.
  min_completion_percent int not null default 50
    check (min_completion_percent between 1 and 100),

  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.publishing_config (id) values (true)
on conflict (id) do nothing;

alter table public.publishing_config enable row level security;

create policy publishing_config_read on public.publishing_config
  for select to authenticated using (public.is_admin());

grant select on public.publishing_config to authenticated;

-- ---------------------------------------------------------------------------

/**
 * Moves a draft into the shop window once there is enough of it to be worth
 * reading.
 *
 * A BEFORE trigger, so the status is set on the row already being written
 * rather than by a second UPDATE. A second UPDATE would fire this again, and
 * the recursion guard on the completion trigger would not cover it.
 *
 * It runs on the inner write that `refresh_nanny_completion` performs, which is
 * where `profile_completion` gets its new value. Reading `new.profile_completion`
 * on the outer write would test the number from before she typed anything.
 *
 * Seed and test accounts are left alone. They are numerous, they are complete,
 * and publishing them would fill a real search page with people who do not
 * exist.
 */
create or replace function public.publish_when_complete_enough()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.publishing_config;
  v_email text;
begin
  if new.status is distinct from 'draft' then
    return new;
  end if;

  select * into cfg from public.publishing_config where id;

  if cfg is null or not cfg.enabled then
    return new;
  end if;

  if coalesce(new.profile_completion, 0) < cfg.min_completion_percent then
    return new;
  end if;

  select u.email into v_email from public.users u where u.id = new.user_id;

  if v_email is null or v_email like '%@nananny.example.test'
     or v_email like '%@test.local' then
    return new;
  end if;

  new.status := 'submitted';
  new.submitted_at := coalesce(new.submitted_at, now());

  -- The same shape `ops_set_nanny_status` writes, so the trail reads as one
  -- kind of thing however a profile got published. No actor: nobody pressed
  -- anything, and naming a person who did not would send whoever investigates
  -- to the wrong desk.
  insert into public.audit_logs (actor_id, action, entity_kind, entity_id,
                                 before_state, after_state)
  values (
    null,
    'nanny_status_changed',
    'nanny_profile',
    new.id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'status', 'submitted',
      'by', 'automatic',
      'reason', format(
        'profile reached %s%%, at or above the %s%% publishing threshold',
        new.profile_completion, cfg.min_completion_percent)));

  return new;
end;
$$;

drop trigger if exists nanny_profiles_publish_when_ready on public.nanny_profiles;
create trigger nanny_profiles_publish_when_ready
  before update on public.nanny_profiles
  for each row execute function public.publish_when_complete_enough();

-- ---------------------------------------------------------------------------
-- Changing it
-- ---------------------------------------------------------------------------

/** Admin control over the threshold, audited like every other setting. */
create or replace function public.admin_update_publishing(
  p_enabled boolean,
  p_min_completion_percent int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_before jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not permitted' using errcode = 'ROLE1';
  end if;

  select to_jsonb(c) into v_before from public.publishing_config c where id;

  update public.publishing_config
     set enabled = p_enabled,
         min_completion_percent = p_min_completion_percent,
         updated_by = auth.uid()
   where id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id,
                                 before_state, after_state)
  select auth.uid(), 'publishing_changed', 'publishing_config', null,
         v_before, to_jsonb(c)
    from public.publishing_config c where id;

  return (select to_jsonb(c) from public.publishing_config c where id);
end;
$$;

revoke execute on function public.admin_update_publishing(boolean, int) from public;
grant execute on function public.admin_update_publishing(boolean, int)
  to authenticated, service_role;

comment on function public.publish_when_complete_enough() is
  'Publishes a draft the moment it is complete enough, by instruction. Only ever draft to submitted: approved and rejected are decisions a person made.';
