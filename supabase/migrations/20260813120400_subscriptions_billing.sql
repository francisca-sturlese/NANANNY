-- NaNanny UAE — pricing configuration, subscriptions, payments (PRD §19, §20, §31, §39)

-- Pricing is server-side configuration, never hardcoded in the UI (PRD §39, §61).
-- Single-row table: the `id = true` trick makes a second row impossible.
create table public.pricing_config (
  id boolean primary key default true check (id),
  free_contacts int not null default 3 check (free_contacts >= 0),
  weekly_price_aed numeric(10, 2) not null default 89.00 check (weekly_price_aed >= 0),
  monthly_price_aed numeric(10, 2) not null default 250.00 check (monthly_price_aed >= 0),
  currency text not null default 'AED',
  weekly_enabled boolean not null default true,
  monthly_enabled boolean not null default true,
  monthly_is_best_value boolean not null default true,
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.pricing_config (id) values (true);

create trigger pricing_config_set_updated_at
  before update on public.pricing_config
  for each row execute function public.set_updated_at();

create table public.subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.family_profiles (id) on delete cascade,
  plan public.subscription_plan not null,
  status public.subscription_status not null default 'active',
  price_aed numeric(10, 2) not null,
  currency text not null default 'AED',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_period_valid check (current_period_end > current_period_start)
);

comment on table public.subscriptions is 'Access stays granted until current_period_end even after cancellation (PRD §20).';

create index subscriptions_family_idx on public.subscriptions (family_id);
create index subscriptions_period_end_idx on public.subscriptions (current_period_end);
create unique index subscriptions_provider_sub_uniq
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Append-only audit of every state transition, driven by webhooks.
create table public.subscription_events (
  id uuid primary key default extensions.gen_random_uuid(),
  subscription_id uuid references public.subscriptions (id) on delete set null,
  family_id uuid references public.family_profiles (id) on delete set null,
  event_type text not null,
  from_status public.subscription_status,
  to_status public.subscription_status,
  payload jsonb not null default '{}'::jsonb,
  provider_event_id text,
  created_at timestamptz not null default now()
);

create index subscription_events_family_idx on public.subscription_events (family_id, created_at desc);

-- Idempotency guard: a replayed webhook must never double-apply (PRD §60).
create unique index subscription_events_provider_event_uniq
  on public.subscription_events (provider_event_id)
  where provider_event_id is not null;

create table public.payments (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.family_profiles (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  amount_aed numeric(10, 2) not null check (amount_aed >= 0),
  currency text not null default 'AED',
  status public.payment_status not null default 'pending',
  provider text,
  provider_payment_id text,
  provider_intent_id text,
  failure_reason text,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_family_idx on public.payments (family_id, created_at desc);
create unique index payments_provider_payment_uniq
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- Single source of truth for "can this family contact without spending a free credit".
create or replace function public.has_active_subscription(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.family_id = p_family_id
      and s.status in ('active', 'past_due', 'cancelled')
      and s.current_period_end > now()
  );
$$;
