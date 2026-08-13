-- NaNanny UAE — platform tables: safety, notifications, email, analytics, audit
-- (PRD §32, §33, §34, §40, §41, §43 + email spec)

create table public.reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_id uuid not null references public.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('profile', 'message', 'job', 'review', 'user')),
  target_id uuid not null,
  reported_user_id uuid references public.users (id) on delete set null,
  reason text not null,
  details text,
  status public.report_status not null default 'open',
  resolution text,
  handled_by uuid references public.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_status_idx on public.reports (status, created_at desc);

create table public.blocks (
  id uuid primary key default extensions.gen_random_uuid(),
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- Centralised email pipeline (email spec §10, §11). Every send is a row here,
-- so open/click performance is measurable per event type.
create table public.email_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  email_type text not null,
  recipient extensions.citext not null,
  subject text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped')),
  provider text default 'resend',
  provider_message_id text,
  error text,
  -- Guards against double sends for one-shot lifecycle emails.
  idempotency_key text,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_events_type_idx on public.email_events (email_type, created_at desc);
create index email_events_user_idx on public.email_events (user_id, created_at desc);
create unique index email_events_idempotency_uniq
  on public.email_events (idempotency_key)
  where idempotency_key is not null;

-- Product funnel events (PRD §34, §64). Kept separate from email_events.
create table public.analytics_events (
  id bigserial primary key,
  user_id uuid references public.users (id) on delete set null,
  family_id uuid references public.family_profiles (id) on delete set null,
  event text not null,
  properties jsonb not null default '{}'::jsonb,
  session_id text,
  created_at timestamptz not null default now()
);

create index analytics_events_event_idx on public.analytics_events (event, created_at desc);
create index analytics_events_family_idx on public.analytics_events (family_id, created_at desc);

create table public.admin_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  subject_user_id uuid not null references public.users (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index admin_notes_subject_idx on public.admin_notes (subject_user_id, created_at desc);

create table public.audit_logs (
  id bigserial primary key,
  actor_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_kind text,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_kind, entity_id);
