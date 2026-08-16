-- Making the audited path the convenient one.
--
-- `admin_set_nanny_status()` is how a status changes, and it writes to
-- `audit_logs` so the trail cannot be skipped. It checks `is_admin()`, which
-- means the backend key cannot call it: the service role has no `auth.uid()`.
--
-- So an operator running a one-off from a script had two options, and both were
-- bad. Write the row directly with the service key, which works and leaves no
-- trace of who did it or why. Or write the audit row by hand afterwards, which
-- is what happened today and depended entirely on somebody remembering.
--
-- Four nanny profiles were published by hand this afternoon. That was a real
-- decision with a real reason, and the reason lived in a chat message. In three
-- months, when one of those nannies asks why her half-finished profile was on
-- the site, the answer needs to be in the database.
--
-- This adds no power. Anybody holding the service key can already write that
-- row. What it adds is that the audited way is now the easy way, which is the
-- only form in which a rule like this survives contact with a hurry.

/**
 * Changes a nanny's status from a backend script, and records why.
 *
 * The reason is required and checked. A blank one defeats the entire purpose,
 * and making it optional is how it ends up blank.
 *
 * `actor_id` is null on purpose rather than borrowing an administrator's id.
 * Nobody was signed in. Recording a person who did not press anything is worse
 * than recording nobody, because it reads as an account taking an action and
 * would send whoever investigates to ask the wrong person.
 */
create or replace function public.ops_set_nanny_status(
  p_nanny_id uuid,
  p_status public.nanny_profile_status,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required for an operational status change'
      using errcode = 'OPSR1';
  end if;

  select to_jsonb(n) into v_before from public.nanny_profiles n where n.id = p_nanny_id;

  if v_before is null then
    raise exception 'No such nanny profile' using errcode = 'OPSR2';
  end if;

  update public.nanny_profiles
     set status = p_status,
         -- Submitting is a moment, and the review queue orders by it. Set only
         -- when it is not already there, so a second change does not make an
         -- old submission look new and jump the queue.
         submitted_at = case
           when p_status = 'submitted' then coalesce(submitted_at, now())
           else submitted_at
         end
   where id = p_nanny_id;

  select to_jsonb(n) into v_after from public.nanny_profiles n where n.id = p_nanny_id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id,
                                 before_state, after_state)
  values (
    null,
    'nanny_status_changed',
    'nanny_profile',
    p_nanny_id,
    jsonb_build_object('status', v_before ->> 'status'),
    jsonb_build_object(
      'status', v_after ->> 'status',
      'by', 'ops',
      'reason', btrim(p_reason))
  );

  return jsonb_build_object(
    'id', p_nanny_id,
    'from', v_before ->> 'status',
    'to', v_after ->> 'status');
end;
$$;

comment on function public.ops_set_nanny_status(uuid, public.nanny_profile_status, text) is
  'For a backend script, when no administrator is signed in. Same audit trail as admin_set_nanny_status, and the reason is required rather than optional.';

-- The backend only. A session that wants this has admin_set_nanny_status, which
-- checks who is asking.
revoke execute on function public.ops_set_nanny_status(uuid, public.nanny_profile_status, text)
  from public, anon, authenticated;
grant execute on function public.ops_set_nanny_status(uuid, public.nanny_profile_status, text)
  to service_role;
