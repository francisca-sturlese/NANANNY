-- NaNanny UAE — extensions and enum types
-- Foundation types shared by every later migration.

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;

-- Who the account belongs to.
create type public.user_role as enum ('family', 'nanny', 'admin', 'super_admin');

-- Account level status (independent from nanny profile review status).
create type public.account_status as enum ('active', 'suspended', 'deleted');

-- Nanny profile review workflow (PRD §12).
create type public.nanny_profile_status as enum (
  'draft',
  'pending',
  'under_review',
  'approved',
  'rejected',
  'suspended',
  'expired'
);

-- Live-in / live-out arrangement.
create type public.care_arrangement as enum ('live_in', 'live_out', 'either');

-- Employment shape.
create type public.employment_type as enum ('full_time', 'part_time', 'weekend', 'night_care', 'temporary');

create type public.job_status as enum ('draft', 'active', 'paused', 'closed', 'filled');

create type public.application_status as enum (
  'applied',
  'viewed',
  'shortlisted',
  'interview',
  'rejected',
  'hired',
  'withdrawn'
);

-- Where a first contact originated. Never used to bypass contact counting.
create type public.contact_source as enum ('search', 'match', 'profile', 'application', 'shortlist', 'job');

create type public.shortlist_stage as enum ('interested', 'interview', 'finalists', 'hired');

create type public.subscription_plan as enum ('weekly', 'monthly');

-- PRD §20. `free` is modelled as "no subscription row", these are real subscription states.
create type public.subscription_status as enum (
  'active',
  'past_due',
  'cancelled',
  'expired',
  'refunded'
);

create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

create type public.interview_status as enum (
  'requested',
  'accepted',
  'declined',
  'rescheduled',
  'completed',
  'cancelled'
);

create type public.report_status as enum ('open', 'under_review', 'actioned', 'dismissed');

create type public.language_level as enum ('none', 'basic', 'conversational', 'fluent', 'native');
