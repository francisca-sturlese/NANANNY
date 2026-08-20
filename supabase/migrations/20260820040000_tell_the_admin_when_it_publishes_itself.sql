-- The one case that most needs telling was the one that never told.
--
-- Federico: "per mercedes non mi è arrivato nulla proprio". True, and the
-- cause is a corner of PostgreSQL rather than a missing feature.
--
-- `after update of status` fires on the columns named in the UPDATE statement,
-- not on what the row ended up containing. A nanny filling in her profile
-- updates description, languages, salary. The BEFORE trigger that publishes a
-- complete enough profile then sets status itself, inside that same write. The
-- status changes, the row is saved as submitted, and the AFTER trigger never
-- runs, because `status` was never in the SET list.
--
-- So every profile that published itself notified nobody. A nanny who submits
-- by pressing the button was announced; a nanny carried over the line by the
-- rule Federico asked for arrived in silence. That is exactly backwards: the
-- automatic case is the one where no human already knows.
--
-- Reproduced before fixing, on a real completion path: a draft filled in past
-- the threshold reached submitted at 76% and left admin_review_pending at zero.
--
-- The fix is to stop filtering by column and compare the values instead, which
-- the function already did on its first line.

drop trigger if exists nanny_profiles_notify_admins on public.nanny_profiles;

create trigger nanny_profiles_notify_admins
  after insert or update on public.nanny_profiles
  for each row execute function public.notify_admins_review();
