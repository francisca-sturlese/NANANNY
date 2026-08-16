-- What `paying` actually means, written down where it cannot drift again.
--
-- The comment on this column claimed a reminder "never reaches a nanny, because
-- nannies do not pay". The code has never done that. The unread reminder checks
-- the family in the conversation, not the person being written to, so a nanny
-- sitting on an unread message from a subscriber is reminded, and one sitting
-- on an identical message from a family that does not pay is not.
--
-- The code is right and the comment was wrong, which is the direction worth
-- being explicit about. A reminder about an unread message is a service to the
-- family that paid to send it: the alternative rule, "only write to people who
-- pay", makes it structurally impossible to reach the side of a marketplace
-- that most needs reaching, and the person who loses by it is the subscriber.
--
-- Both directions are now pinned in supabase/tests/reminders.sql, with two
-- nannies in identical states who differ only in who wrote to them.

comment on column public.reminder_config.audience is
  $doc$Who is eligible at all.

  paying    the reminder has to serve a subscriber. For an unread message that
            means the family in the conversation is subscribed, whichever side
            is being written to. For a nudge it means the family being nudged is
            subscribed. A nanny whose profile never left draft is never in this
            set, because nobody has paid anything on her behalf.
  everyone  anybody who meets the other conditions.
  off       nobody.

  Ships as `paying`, which is what was asked for. Worth knowing what that means
  in practice: while the launch window is open nothing is being charged, so the
  set of subscribers is empty and this setting reaches nobody at all. That is a
  working feature sending zero mail, not a broken one, and /admin/reminders
  says so on the page rather than leaving it to be discovered.$doc$;
