-- A category for the cold pitches, so filing one does not throw it away.
--
-- The contact form receives unsolicited sales mail, forever, and the one that
-- prompted this was sitting under "Needs a reply" with a badge on the
-- navigation, beside a family who could not sign in. Filing it under its own
-- category keeps it out of that queue without refusing it at the form, which
-- would only teach the senders which words to avoid.
--
-- The category list is a CHECK constraint, and writing 'sales' into it without
-- adding it here rejected the whole insert. The message was lost and the sender
-- was told we could not send it. Harmless for a pitch, and exactly the wrong
-- outcome for the case that matters: a wrong guess is a real person, and the
-- entire point of filing rather than blocking is that her message still exists
-- somewhere. Found by trying it rather than by reading the schema.

alter table public.support_requests
  drop constraint if exists support_requests_category_check;

alter table public.support_requests
  add constraint support_requests_category_check
  check (category = any (array[
    'account', 'profile', 'billing', 'safety', 'technical', 'other',
    -- Never chosen by the person writing: set on arrival, and only ever moves a
    -- request out of the queue and into its own tab.
    'sales'
  ]));
