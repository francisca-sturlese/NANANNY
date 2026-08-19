-- A family that brings a family. One extra free contact each.
--
-- Federico's mechanic, word for word: famiglia porta famiglia, +1 contatto
-- gratuito a testa, valido dal 5 settembre. Nannies get no material reward,
-- only an easy way to share, which is a product decision rather than a
-- limitation: a nanny is not paying for anything, so a credit would buy her
-- nothing at all.
--
-- The date needs no mechanism. The launch window closes on 4 September at
-- 20:00 UTC, which is midnight in Dubai on the fifth, and while it is open
-- every contact is written with consumed_free_credit = false. A credit is
-- therefore worth nothing until that moment and worth exactly one contact
-- immediately afterwards. Building a start date into the reward would be a
-- second source of truth for the same fact, and the two would disagree the
-- first time somebody moved the window.
--
-- THE INVARIANT THIS MUST NOT BREAK: free usage is derived from the rows in
-- family_nanny_contacts and is never held in a counter. So the reward is not
-- a credit granted to a balance. It is a larger allowance, derived by counting
-- referral rows, and recomputed from scratch on every read. Nothing is
-- incremented, so nothing can be incremented twice: the classic failure of a
-- referral scheme, where a retry or a double submit mints real money, is not
-- possible here because there is no addition anywhere in this file.
--
-- The obvious fraud is a family inviting itself with a throwaway address. That
-- is not hypothetical: a disposable account already turned up in this product
-- while somebody was testing normally. So the invitation pays nothing at
-- signup. It pays when the invited family finishes onboarding, which in this
-- product publishes their job post, which means a real posting a real nanny
-- can answer. Making fake families is still possible; it now costs the work of
-- looking like a family, and it leaves a job post an administrator can read.

-- ---------------------------------------------------------------------------
-- Configuration, off by default
-- ---------------------------------------------------------------------------

-- Ships switched off, the same way the launch promotion did. Deploying this
-- changes nothing until somebody turns it on, which keeps the decision to
-- start giving away contacts separate from the decision to release the code.
alter table public.pricing_config
  add column if not exists referral_enabled boolean not null default false,
  add column if not exists referral_bonus_contacts int not null default 1,
  add column if not exists referral_bonus_max int not null default 10;

comment on column public.pricing_config.referral_enabled is
  'Whether invitations earn anything at all. False means the invite link still works and still records who invited whom; it simply grants nothing.';
comment on column public.pricing_config.referral_bonus_contacts is
  'Extra free contacts per qualifying invitation, for both sides.';
comment on column public.pricing_config.referral_bonus_max is
  'Ceiling on the extra contacts one family can earn. A referral reward with no ceiling is an unpriced liability.';

alter table public.pricing_config
  drop constraint if exists pricing_config_referral_sane;
alter table public.pricing_config
  add constraint pricing_config_referral_sane
  check (referral_bonus_contacts >= 0 and referral_bonus_max >= 0);

-- ---------------------------------------------------------------------------
-- Who invited whom
-- ---------------------------------------------------------------------------

create table if not exists public.family_referrals (
  -- The invited family is the primary key, not a surrogate id. One family is
  -- invited by one family, once, for ever: expressed as a constraint rather
  -- than as a rule somebody has to remember when writing the next insert.
  referred_family_id uuid primary key
    references public.family_profiles (id) on delete cascade,
  referrer_family_id uuid not null
    references public.family_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint family_referrals_not_self check (referred_family_id <> referrer_family_id)
);

comment on table public.family_referrals is
  'Which family invited which. Read through definer functions; the reward is derived from these rows and never stored.';

create index if not exists family_referrals_referrer_idx
  on public.family_referrals (referrer_family_id);

alter table public.family_referrals enable row level security;
grant all on public.family_referrals to service_role;

-- Deliberately no policies for authenticated. Everything a family needs to
-- know about its own invitations comes back from my_referral_summary(), which
-- returns counts. The list of addresses somebody invited is not something the
-- table should hand out row by row, and a policy written now would be a policy
-- nobody re-reads later.

-- ---------------------------------------------------------------------------
-- The code
-- ---------------------------------------------------------------------------

alter table public.family_profiles
  add column if not exists referral_code text;

-- Unique, but only where it exists: most families will never open the invite
-- screen, and a partial index keeps the nulls out of the way.
create unique index if not exists family_profiles_referral_code_key
  on public.family_profiles (referral_code)
  where referral_code is not null;

-- The column is written by the function below and by nothing else. Without
-- this a family could set its own code to a string it had already given out,
-- or overwrite somebody else's by guessing.
revoke update (referral_code) on public.family_profiles from authenticated;
grant select (referral_code) on public.family_profiles to authenticated;

/**
 * The caller's invite code, made on first use.
 *
 * Generated lazily rather than at signup, because most families will never
 * invite anybody and a code nobody has seen is a row of noise. Six characters
 * from an alphabet with no O, 0, I or 1 in it: this gets read aloud over
 * WhatsApp and typed by somebody on a phone, and the pairs that look alike are
 * the ones that turn an invitation into a support message.
 */
create or replace function public.my_referral_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_family_id uuid;
  v_code text;
  v_candidate text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt int := 0;
begin
  select f.id, f.referral_code into v_family_id, v_code
    from public.family_profiles f
   where f.user_id = (select auth.uid());

  if v_family_id is null then
    raise exception 'Only a family account has an invite code' using errcode = 'ROLE1';
  end if;

  if v_code is not null then
    return v_code;
  end if;

  -- Collisions are vanishingly unlikely at this size and catastrophic if
  -- ignored, so the loop is real rather than decorative. It gives up rather
  -- than spinning: a code that cannot be minted is a broken button, while a
  -- loop that never ends is a held connection and a page that never answers.
  loop
    v_attempt := v_attempt + 1;
    v_candidate := '';
    for _ in 1..6 loop
      v_candidate := v_candidate ||
        substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    begin
      update public.family_profiles
         set referral_code = v_candidate
       where id = v_family_id
         and referral_code is null;
      if found then
        return v_candidate;
      end if;
      -- Somebody else minted one for this family between the select and the
      -- update. Theirs is as good as ours.
      select referral_code into v_code from public.family_profiles where id = v_family_id;
      if v_code is not null then
        return v_code;
      end if;
    exception when unique_violation then
      null; -- taken; go round again
    end;

    if v_attempt >= 12 then
      raise exception 'Could not mint an invite code' using errcode = 'REFR1';
    end if;
  end loop;
end;
$$;

revoke execute on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Accepting an invitation
-- ---------------------------------------------------------------------------

/**
 * Records that this family arrived through somebody's code.
 *
 * Idempotent and safe to call on every dashboard load, which is how it is
 * called: the primary key says a family can only ever be invited once, and a
 * second attempt returns the same answer as the first rather than raising.
 *
 * It refuses the two cases that matter. A family cannot claim its own code,
 * which is the check constraint as well, and a code that does not resolve
 * returns false rather than an error: an invitation link mistyped by a real
 * person should not put an error on the screen of somebody who has just
 * signed up.
 */
create or replace function public.claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_referrer_id uuid;
begin
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('claimed', false, 'reason', 'no_code');
  end if;

  select f.id into v_family_id
    from public.family_profiles f
    join public.users u on u.id = f.user_id
   where f.user_id = (select auth.uid())
     and u.role = 'family'
     and u.status = 'active';

  if v_family_id is null then
    return jsonb_build_object('claimed', false, 'reason', 'not_a_family');
  end if;

  if exists (select 1 from public.family_referrals where referred_family_id = v_family_id) then
    return jsonb_build_object('claimed', false, 'reason', 'already');
  end if;

  select id into v_referrer_id
    from public.family_profiles
   where referral_code = upper(btrim(p_code));

  if v_referrer_id is null then
    return jsonb_build_object('claimed', false, 'reason', 'unknown_code');
  end if;

  if v_referrer_id = v_family_id then
    return jsonb_build_object('claimed', false, 'reason', 'self');
  end if;

  insert into public.family_referrals (referred_family_id, referrer_family_id)
  values (v_family_id, v_referrer_id)
  on conflict (referred_family_id) do nothing;

  return jsonb_build_object('claimed', true);
end;
$$;

revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The reward, derived
-- ---------------------------------------------------------------------------

/**
 * How many extra free contacts this family has earned.
 *
 * Counted, never accumulated. Both sides are paid on the same condition: the
 * invited family has finished onboarding, which in this product is what
 * publishes their job post. An invitation that produced a signup and nothing
 * else has produced nothing, and pays nothing.
 *
 * Deleting an account cascades these rows away, so a family that leaves takes
 * its half of the arithmetic with it and the other side stops being paid for
 * somebody who is no longer here.
 */
create or replace function public.family_referral_bonus(p_family_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select referral_enabled, referral_bonus_contacts, referral_bonus_max
      from public.pricing_config where id
  ),
  invited as (
    select count(*)::int as n
      from public.family_referrals r
      join public.family_profiles f on f.id = r.referred_family_id
     where r.referrer_family_id = p_family_id
       and f.onboarding_completed_at is not null
  ),
  welcomed as (
    select count(*)::int as n
      from public.family_referrals r
      join public.family_profiles me on me.id = r.referred_family_id
     where r.referred_family_id = p_family_id
       and me.onboarding_completed_at is not null
  )
  select case
           when not cfg.referral_enabled then 0
           else least(
             (invited.n + welcomed.n) * cfg.referral_bonus_contacts,
             cfg.referral_bonus_max
           )
         end
    from cfg cross join invited cross join welcomed;
$$;

revoke execute on function public.family_referral_bonus(uuid) from public, anon;
grant execute on function public.family_referral_bonus(uuid) to authenticated, service_role;

/**
 * What to show a family on its own invite screen.
 *
 * Counts, never addresses. Who accepted an invitation is the other family's
 * business, and a screen that named them would be telling one customer about
 * another.
 */
create or replace function public.my_referral_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'code', f.referral_code,
    'joined', (
      select count(*) from public.family_referrals r
       where r.referrer_family_id = f.id
    ),
    'qualified', (
      select count(*) from public.family_referrals r
        join public.family_profiles g on g.id = r.referred_family_id
       where r.referrer_family_id = f.id
         and g.onboarding_completed_at is not null
    ),
    'bonus', public.family_referral_bonus(f.id),
    'enabled', (select referral_enabled from public.pricing_config where id),
    'reward', (select referral_bonus_contacts from public.pricing_config where id),
    'max', (select referral_bonus_max from public.pricing_config where id)
  )
  from public.family_profiles f
  where f.user_id = (select auth.uid());
$$;

revoke execute on function public.my_referral_summary() from public, anon;
grant execute on function public.my_referral_summary() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The allowance, now including what was earned
-- ---------------------------------------------------------------------------

-- The return type gains a column, so the old signatures have to go first.
drop function if exists public.my_contact_state();
drop function if exists public.family_contact_state(uuid);

create or replace function public.family_contact_state(p_family_id uuid)
returns table (
  family_id uuid,
  free_contacts_limit int,
  free_contacts_used int,
  free_contacts_remaining int,
  subscription_active boolean,
  can_contact boolean,
  plan public.subscription_plan,
  current_period_end timestamptz,
  promo_active boolean,
  promo_ends_at timestamptz,
  referral_bonus int
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select free_contacts, promo_ends_at from public.pricing_config where id
  ),
  promo as (
    select public.promo_active() as active
  ),
  bonus as (
    -- The whole of the referral mechanic, as far as the gate is concerned.
    -- The allowance grows; the way usage is counted does not change at all.
    select public.family_referral_bonus(p_family_id) as n
  ),
  used as (
    select count(*)::int as n
      from public.family_nanny_contacts c
     where c.family_id = p_family_id
       and c.consumed_free_credit
  ),
  sub as (
    select s.plan, s.current_period_end
      from public.subscriptions s
     where s.family_id = p_family_id
       and s.status in ('active', 'past_due', 'cancelled')
       and s.current_period_end > now()
     order by s.current_period_end desc
     limit 1
  )
  select
    p_family_id,
    cfg.free_contacts + bonus.n,
    used.n,
    greatest(cfg.free_contacts + bonus.n - used.n, 0),
    sub.plan is not null,
    promo.active or (sub.plan is not null) or (used.n < cfg.free_contacts + bonus.n),
    sub.plan,
    sub.current_period_end,
    promo.active,
    cfg.promo_ends_at,
    bonus.n
  from cfg
  cross join promo
  cross join bonus
  cross join used
  left join sub on true;
$$;

comment on function public.family_contact_state(uuid) is
  'Authoritative contact entitlement for a family. Never compute this in the client.';

create or replace function public.my_contact_state()
returns table (
  family_id uuid,
  free_contacts_limit int,
  free_contacts_used int,
  free_contacts_remaining int,
  subscription_active boolean,
  can_contact boolean,
  plan public.subscription_plan,
  current_period_end timestamptz,
  promo_active boolean,
  promo_ends_at timestamptz,
  referral_bonus int
)
language sql
stable
security definer
set search_path = public
as $$
  select s.*
    from public.family_profiles f
    cross join lateral public.family_contact_state(f.id) s
   where f.user_id = (select auth.uid());
$$;

grant execute on function public.family_contact_state(uuid) to authenticated, service_role;
grant execute on function public.my_contact_state() to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- The guard is told what the new column is for
-- ---------------------------------------------------------------------------
--
-- assert_editable_columns() fails on any column that is neither writable by
-- the person nor declared as deliberately withheld, which is exactly what it
-- is for: a column nobody thought about is the one that breaks a form or
-- opens a hole. referral_code is withheld on purpose. A family that could
-- write its own code could set it to a string somebody else had already
-- given out, and collect their invitations.
--
-- Reissued in full rather than patched, because this is the check that stops
-- the next column from slipping through and it should read as one piece.

create or replace function public.assert_editable_columns()
returns text
language plpgsql
-- Volatile, not stable. A stable function reads the calling query's snapshot,
-- so a grant changed earlier in the same transaction is invisible to it, and
-- the self check that proves this guard can fail would always pass.
volatile
as $$
declare
  -- table name -> columns a user is not meant to write
  withheld jsonb := jsonb_build_object(
    'nanny_profiles', jsonb_build_array(
      'id', 'user_id', 'status', 'profile_completion', 'search_vector',
      'rejection_reason', 'created_at', 'updated_at', 'submitted_at',
      'reviewed_at', 'reviewed_by', 'display_name'),
    'family_profiles', jsonb_build_array(
      'id', 'user_id', 'profile_completion', 'created_at', 'updated_at',
      'search_vector', 'referral_code'),
    'family_requirements', jsonb_build_array(
      'id', 'family_id', 'created_at', 'updated_at'),
    'family_children', jsonb_build_array(
      'id', 'family_id', 'created_at', 'updated_at'),
    'jobs', jsonb_build_array(
      'id', 'family_id', 'created_at', 'updated_at', 'published_at',
      'search_vector')
  );
  problems text[] := '{}';
  t text;
  missing text[];
begin
  for t in select jsonb_object_keys(withheld) loop
    select coalesce(array_agg(c.column_name order by c.column_name), '{}')
      into missing
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = t
       -- A generated or identity column is computed by the database and
       -- refuses an UPDATE from everybody. Listing it as withheld would be a
       -- claim about intent; skipping it here is a statement of fact, and it
       -- covers the next one somebody adds without anybody remembering.
       and c.is_generated = 'NEVER'
       and c.is_identity = 'NO'
       and not (c.column_name in (
             select jsonb_array_elements_text(withheld -> t)))
       and not has_column_privilege('authenticated', 'public.' || t,
                                    c.column_name, 'UPDATE');

    if cardinality(missing) > 0 then
      problems := problems || format('%s: %s', t, array_to_string(missing, ', '));
    end if;
  end loop;

  if cardinality(problems) = 0 then
    return 'ok';
  end if;

  return array_to_string(problems, ' | ');
end;
$$;
