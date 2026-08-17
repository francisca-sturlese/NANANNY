-- Reading somebody's private messages leaves a mark.
--
-- The back office can now open the conversations a job post started, which is
-- the right tool for moderation and is also the most invasive power anybody
-- here has. Every other administrative act goes through a function that writes
-- to `audit_logs` so the trail cannot be skipped; reading has never been
-- recorded, because until today there was nothing to read.
--
-- What makes it worth the row is what we tell a nanny. She is asked to keep
-- her phone number out of her profile and to talk to families here instead,
-- on the promise that she keeps a record and can stop anyone. A product that
-- says that and then reads her messages without a record of its own is telling
-- her something it does not apply to itself.
--
-- This records, it does not prevent. An admin who needs to read a thread to
-- resolve a report should read it. The point is that afterwards there is an
-- answer to "who read this, and when", and that the answer exists before
-- anybody thinks to ask.

/**
 * Records that an administrator opened a conversation.
 *
 * One row per admin per conversation per hour. A page refresh is not a second
 * reading, and an audit log that fills up with the same fact is one nobody
 * reads, which is the same as not having it.
 *
 * Checks `is_admin()` itself, like every other capability here, so it cannot
 * be used to write plausible-looking entries about somebody else.
 */
create or replace function public.record_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_since timestamptz := now() - interval '1 hour';
begin
  if not public.is_admin() then
    raise exception 'Not permitted' using errcode = 'ROLE1';
  end if;

  if exists (
    select 1 from public.audit_logs
     where action = 'conversation_read'
       and entity_id = p_conversation_id
       and actor_id is not distinct from v_actor
       and created_at > v_since
  ) then
    return;
  end if;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id,
                                 before_state, after_state)
  values (v_actor, 'conversation_read', 'conversation', p_conversation_id,
          null,
          jsonb_build_object('read_at', now()));
end;
$$;

revoke execute on function public.record_conversation_read(uuid) from public, anon;
grant execute on function public.record_conversation_read(uuid)
  to authenticated, service_role;

comment on function public.record_conversation_read(uuid) is
  'Records that an admin opened a private conversation. Records rather than prevents: somebody resolving a report should read the thread. What has to exist afterwards is an answer to who read it and when, and it has to exist before anybody thinks to ask.';
