-- NaNanny UAE — the monetisation core: contacts, conversations, messaging
-- (PRD §15, §16, §22, §26, §44)

create table public.conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.family_profiles (id) on delete cascade,
  nanny_id uuid not null references public.nanny_profiles (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  last_message_at timestamptz,
  last_message_preview text,
  family_unread_count int not null default 0 check (family_unread_count >= 0),
  nanny_unread_count int not null default 0 check (nanny_unread_count >= 0),
  family_archived boolean not null default false,
  nanny_archived boolean not null default false,
  blocked_by uuid references public.users (id) on delete set null,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One thread per family/nanny pair: reopening a thread must never cost a second credit.
  unique (family_id, nanny_id)
);

create index conversations_family_idx on public.conversations (family_id, last_message_at desc nulls last);
create index conversations_nanny_idx on public.conversations (nanny_id, last_message_at desc nulls last);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- THE table the whole business model rests on (PRD §22, §44).
create table public.family_nanny_contacts (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.family_profiles (id) on delete cascade,
  nanny_id uuid not null references public.nanny_profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  source public.contact_source not null default 'profile',
  -- true  = this contact spent one of the free credits
  -- false = the family was on an active subscription at the time
  -- Free usage is therefore counted from rows, never from a counter that can drift.
  consumed_free_credit boolean not null default true,
  first_contacted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint family_nanny_contacts_unique_pair unique (family_id, nanny_id)
);

comment on table public.family_nanny_contacts is
  'One row per unique family→nanny first contact. The unique (family_id, nanny_id) constraint is what guarantees a nanny is never charged twice against the free allowance (PRD §22, §44).';

create index family_nanny_contacts_family_idx on public.family_nanny_contacts (family_id);
create index family_nanny_contacts_free_idx
  on public.family_nanny_contacts (family_id)
  where consumed_free_credit;

create table public.messages (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 5000),
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  read_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Keep the conversation header in sync and maintain unread counters.
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_role public.user_role;
begin
  select role into v_sender_role from public.users where id = new.sender_id;

  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(new.body, 140),
         family_unread_count = case when v_sender_role = 'nanny'
                                    then family_unread_count + 1 else family_unread_count end,
         nanny_unread_count  = case when v_sender_role = 'nanny'
                                    then nanny_unread_count else nanny_unread_count + 1 end,
         updated_at = now()
   where id = new.conversation_id;

  return new;
end;
$$;

create trigger messages_after_insert_sync
  after insert on public.messages
  for each row execute function public.messages_after_insert();

create table public.interviews (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.family_profiles (id) on delete cascade,
  nanny_id uuid not null references public.nanny_profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  status public.interview_status not null default 'requested',
  scheduled_at timestamptz,
  timezone text not null default 'Asia/Dubai',
  duration_minutes int not null default 30 check (duration_minutes between 5 and 240),
  mode text not null default 'video' check (mode in ('video', 'phone', 'in_person')),
  location text,
  note text,
  requested_by uuid not null references public.users (id) on delete cascade,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index interviews_family_idx on public.interviews (family_id, scheduled_at);
create index interviews_nanny_idx on public.interviews (nanny_id, scheduled_at);

create trigger interviews_set_updated_at
  before update on public.interviews
  for each row execute function public.set_updated_at();

create table public.reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  author_id uuid not null references public.users (id) on delete cascade,
  subject_user_id uuid not null references public.users (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text not null check (length(btrim(body)) > 0),
  is_published boolean not null default false,
  moderated_by uuid references public.users (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_no_self check (author_id <> subject_user_id),
  unique (author_id, subject_user_id)
);

create index reviews_subject_idx on public.reviews (subject_user_id) where is_published;

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();
