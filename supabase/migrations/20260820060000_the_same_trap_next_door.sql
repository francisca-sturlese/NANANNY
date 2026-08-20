-- The same trap, one trigger along, disarmed before it costs anything.
--
-- `notify_profile_reviewed` tells a nanny her profile was approved or
-- rejected, and it was declared `after update of status`. That is the exact
-- shape that had just cost four silent publications: the filter watches the
-- columns named in the UPDATE, so a status changed by a BEFORE trigger never
-- reaches it.
--
-- Today it is harmless, and only by luck. The BEFORE trigger that publishes a
-- complete enough profile writes 'submitted', and this function ignores
-- everything except 'approved' and 'rejected'. So the one status set behind
-- the AFTER trigger's back happens to be the one it does not care about.
--
-- That is a coincidence, not a design. The day anything publishes or approves
-- a profile from a trigger, the nanny is never told, every test still passes,
-- and nobody finds out until somebody asks why she was not informed. Which is
-- how the last one was found: Federico noticing a silence.
--
-- Nothing observable changes now. The function's first line already returns
-- early when the status has not changed, so dropping the column filter costs
-- one comparison per write and removes a class of failure that is invisible
-- until it is expensive.

drop trigger if exists nanny_profiles_notify_review on public.nanny_profiles;

create trigger nanny_profiles_notify_review
  after update on public.nanny_profiles
  for each row execute function public.notify_profile_reviewed();
