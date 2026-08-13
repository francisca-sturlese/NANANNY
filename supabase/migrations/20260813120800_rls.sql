-- NaNanny UAE — Row Level Security (PRD §41, §60)
--
-- Principle: every table is deny-by-default. Families and nannies see their own
-- rows plus the narrow slice the product requires. Public discovery goes through
-- SECURITY DEFINER views that expose only non-identifying columns.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.my_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.family_profiles where user_id = auth.uid();
$$;

create or replace function public.my_nanny_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.nanny_profiles where user_id = auth.uid();
$$;

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.conversations c
     where c.id = p_conversation_id
       and (c.family_id = public.my_family_id() or c.nanny_id = public.my_nanny_id())
  );
$$;

grant execute on function public.my_family_id() to authenticated;
grant execute on function public.my_nanny_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.users                  enable row level security;
alter table public.family_profiles        enable row level security;
alter table public.family_children        enable row level security;
alter table public.nanny_profiles         enable row level security;
alter table public.nanny_badges           enable row level security;
alter table public.nanny_documents        enable row level security;
alter table public.nanny_references       enable row level security;
alter table public.jobs                   enable row level security;
alter table public.job_applications       enable row level security;
alter table public.saved_profiles         enable row level security;
alter table public.matching_weights       enable row level security;
alter table public.matches                enable row level security;
alter table public.pricing_config         enable row level security;
alter table public.subscriptions          enable row level security;
alter table public.subscription_events    enable row level security;
alter table public.payments               enable row level security;
alter table public.conversations          enable row level security;
alter table public.family_nanny_contacts  enable row level security;
alter table public.messages               enable row level security;
alter table public.interviews             enable row level security;
alter table public.reviews                enable row level security;
alter table public.reports                enable row level security;
alter table public.blocks                 enable row level security;
alter table public.notifications          enable row level security;
alter table public.email_events           enable row level security;
alter table public.analytics_events       enable row level security;
alter table public.admin_notes            enable row level security;
alter table public.audit_logs             enable row level security;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

create policy users_select_self on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy users_admin_all on public.users
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- family profiles and children
-- ---------------------------------------------------------------------------

create policy family_profiles_owner on public.family_profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy family_profiles_admin on public.family_profiles
  for select to authenticated
  using (public.is_admin());

-- A nanny may see the family profiles it is already connected to
-- (conversation, application on one of their jobs, or an interview).
create policy family_profiles_connected_nanny on public.family_profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
       where c.family_id = family_profiles.id and c.nanny_id = public.my_nanny_id()
    )
    or exists (
      select 1 from public.job_applications a
        join public.jobs j on j.id = a.job_id
       where j.family_id = family_profiles.id and a.nanny_id = public.my_nanny_id()
    )
  );

create policy family_children_owner on public.family_children
  for all to authenticated
  using (family_id = public.my_family_id())
  with check (family_id = public.my_family_id());

create policy family_children_admin on public.family_children
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- nanny profiles
-- ---------------------------------------------------------------------------

create policy nanny_profiles_owner on public.nanny_profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy nanny_profiles_admin on public.nanny_profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Approved profiles are readable by any signed-in user. Sensitive attachments
-- live in nanny_documents, which stays owner/admin only.
create policy nanny_profiles_public_read on public.nanny_profiles
  for select to authenticated
  using (status = 'approved');

create policy nanny_badges_read on public.nanny_badges
  for select to authenticated
  using (
    exists (select 1 from public.nanny_profiles n
             where n.id = nanny_badges.nanny_id
               and (n.status = 'approved' or n.user_id = auth.uid()))
    or public.is_admin()
  );

create policy nanny_badges_admin_write on public.nanny_badges
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy nanny_documents_owner on public.nanny_documents
  for all to authenticated
  using (nanny_id = public.my_nanny_id())
  with check (nanny_id = public.my_nanny_id());

create policy nanny_documents_admin on public.nanny_documents
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy nanny_references_owner on public.nanny_references
  for all to authenticated
  using (nanny_id = public.my_nanny_id())
  with check (nanny_id = public.my_nanny_id());

create policy nanny_references_admin on public.nanny_references
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Contact details of a reference are never exposed to families; families see
-- the reference through the nanny_public_references view instead.

-- ---------------------------------------------------------------------------
-- jobs and applications
-- ---------------------------------------------------------------------------

create policy jobs_owner on public.jobs
  for all to authenticated
  using (family_id = public.my_family_id())
  with check (family_id = public.my_family_id());

create policy jobs_active_read on public.jobs
  for select to authenticated
  using (status = 'active');

create policy jobs_admin on public.jobs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy job_applications_nanny on public.job_applications
  for all to authenticated
  using (nanny_id = public.my_nanny_id())
  with check (nanny_id = public.my_nanny_id());

create policy job_applications_family_read on public.job_applications
  for select to authenticated
  using (exists (
    select 1 from public.jobs j
     where j.id = job_applications.job_id and j.family_id = public.my_family_id()
  ));

create policy job_applications_family_update on public.job_applications
  for update to authenticated
  using (exists (
    select 1 from public.jobs j
     where j.id = job_applications.job_id and j.family_id = public.my_family_id()
  ))
  with check (exists (
    select 1 from public.jobs j
     where j.id = job_applications.job_id and j.family_id = public.my_family_id()
  ));

create policy job_applications_admin on public.job_applications
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- shortlist and matches
-- ---------------------------------------------------------------------------

create policy saved_profiles_owner on public.saved_profiles
  for all to authenticated
  using (family_id = public.my_family_id())
  with check (family_id = public.my_family_id());

create policy matches_family_read on public.matches
  for select to authenticated
  using (family_id = public.my_family_id());

create policy matches_nanny_read on public.matches
  for select to authenticated
  using (nanny_id = public.my_nanny_id());

create policy matches_admin on public.matches
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy matching_weights_read on public.matching_weights
  for select to authenticated
  using (true);

create policy matching_weights_admin_write on public.matching_weights
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- pricing, subscriptions, payments
-- ---------------------------------------------------------------------------

-- Pricing is public information; only admins may change it.
create policy pricing_config_read on public.pricing_config
  for select to anon, authenticated
  using (true);

create policy pricing_config_admin_write on public.pricing_config
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Subscriptions are read-only for families: they are created and mutated by
-- the service role from verified payment webhooks (PRD §31).
create policy subscriptions_family_read on public.subscriptions
  for select to authenticated
  using (family_id = public.my_family_id());

create policy subscriptions_admin on public.subscriptions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy subscription_events_family_read on public.subscription_events
  for select to authenticated
  using (family_id = public.my_family_id());

create policy subscription_events_admin on public.subscription_events
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy payments_family_read on public.payments
  for select to authenticated
  using (family_id = public.my_family_id());

create policy payments_admin on public.payments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- conversations, contacts, messages
-- ---------------------------------------------------------------------------

-- No INSERT policy on purpose: conversations may only be created through
-- start_conversation(), which enforces the paywall.
create policy conversations_participant_read on public.conversations
  for select to authenticated
  using (family_id = public.my_family_id() or nanny_id = public.my_nanny_id());

create policy conversations_participant_update on public.conversations
  for update to authenticated
  using (family_id = public.my_family_id() or nanny_id = public.my_nanny_id())
  with check (family_id = public.my_family_id() or nanny_id = public.my_nanny_id());

create policy conversations_admin on public.conversations
  for select to authenticated
  using (public.is_admin());

-- Read-only for the family. Rows are written exclusively by start_conversation().
create policy family_nanny_contacts_family_read on public.family_nanny_contacts
  for select to authenticated
  using (family_id = public.my_family_id());

create policy family_nanny_contacts_admin on public.family_nanny_contacts
  for select to authenticated
  using (public.is_admin());

create policy messages_participant_read on public.messages
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));

create policy messages_participant_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and not exists (
      select 1 from public.conversations c
       where c.id = conversation_id and c.blocked_at is not null
    )
  );

create policy messages_admin_read on public.messages
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- interviews, reviews
-- ---------------------------------------------------------------------------

create policy interviews_participant on public.interviews
  for all to authenticated
  using (family_id = public.my_family_id() or nanny_id = public.my_nanny_id())
  with check (family_id = public.my_family_id() or nanny_id = public.my_nanny_id());

create policy interviews_admin on public.interviews
  for select to authenticated
  using (public.is_admin());

create policy reviews_public_read on public.reviews
  for select to anon, authenticated
  using (is_published);

create policy reviews_author on public.reviews
  for all to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy reviews_admin on public.reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- safety, notifications, analytics, audit
-- ---------------------------------------------------------------------------

create policy reports_author_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

create policy reports_author_read on public.reports
  for select to authenticated
  using (reporter_id = auth.uid());

create policy reports_admin on public.reports
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy blocks_owner on public.blocks
  for all to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

create policy notifications_owner on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_owner_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy email_events_admin on public.email_events
  for select to authenticated
  using (public.is_admin());

create policy analytics_events_admin on public.analytics_events
  for select to authenticated
  using (public.is_admin());

create policy admin_notes_admin on public.admin_notes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy audit_logs_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin());
