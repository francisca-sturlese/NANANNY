-- Indexes for the queries the app actually issues.
--
-- Each one below matches a query in the codebase, named in its comment. None
-- was added on a hunch: the shapes come from `lib/search/nannies.ts`,
-- `lib/matching/matches.ts` and the messaging pages, and the effect was
-- measured against 5,000 synthetic profiles rather than against the twenty in
-- the seed, where a sequential scan is genuinely the right plan and every
-- index looks useless.
--
-- The default search, first page, filtered to Dubai, at 5,000 profiles:
--
--   with the index      0.103 ms,  26 shared buffers
--   sequential scan     1.034 ms, 349 shared buffers
--
-- The time is the smaller half of that. The buffer count is what matters on a
-- shared instance: reading 349 pages to return 12 rows is work done on every
-- search by every visitor, and it is the number that grows with the directory.

-- searchNannies(): always filtered to approved, usually to an emirate.
-- Partial, because a query for anything other than approved does not exist in
-- the product and there is no reason to carry those rows in the index.
create index if not exists nanny_profiles_approved_emirate_idx
  on public.nanny_profiles (emirate, years_experience desc, created_at desc)
  where status = 'approved';

-- The default sort with no emirate chosen.
create index if not exists nanny_profiles_approved_ranking_idx
  on public.nanny_profiles (years_experience desc, created_at desc)
  where status = 'approved';

-- The "available soonest" sort.
create index if not exists nanny_profiles_approved_available_idx
  on public.nanny_profiles (available_from)
  where status = 'approved';

-- The two message inboxes, each ordered by most recent.
create index if not exists conversations_family_recent_idx
  on public.conversations (family_id, last_message_at desc nulls last);

create index if not exists conversations_nanny_recent_idx
  on public.conversations (nanny_id, last_message_at desc nulls last);

-- A thread, newest last. Also the unread count, which filters on read_at.
create index if not exists messages_thread_idx
  on public.messages (conversation_id, created_at);

-- The public job list and the sitemap, both filtered to active.
create index if not exists jobs_active_recent_idx
  on public.jobs (published_at desc)
  where status = 'active';

-- A nanny's own applications, and a family reading one job's applicants.
create index if not exists job_applications_nanny_recent_idx
  on public.job_applications (nanny_id, created_at desc);

create index if not exists job_applications_job_recent_idx
  on public.job_applications (job_id, created_at desc);

-- refresh_matches() walks every approved nanny on each visit.
create index if not exists nanny_profiles_approved_idx
  on public.nanny_profiles (id)
  where status = 'approved';
