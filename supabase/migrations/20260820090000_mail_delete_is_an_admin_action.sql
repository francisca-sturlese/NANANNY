-- Deleting mail, asked for as "per sempre".
--
-- Forwarding needs no schema: it is composing, with the original quoted by
-- the operator's own hand. Deleting is different: it is the first action in
-- the mailbox that destroys a record, so it goes the way every destructive
-- admin capability goes here: a definer function that checks is_admin()
-- itself and writes audit_logs, so "who deleted what, when" survives the
-- deletion it describes.

create or replace function public.admin_mail_delete_thread(p_thread_key text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_counterpart text;
begin
  if not public.is_admin() then
    raise exception 'ROLE1: Not permitted';
  end if;

  select count(*),
         -- One line of context for the audit row: who the thread was with.
         -- Never a subject and never a body: the audit log is readable more
         -- widely than the mailbox, and a stranger's words do not belong in it.
         max(case when direction = 'in' then from_address else to_address end)
    into v_count, v_counterpart
    from public.mail_messages
   where thread_key = p_thread_key;

  if v_count = 0 then
    return 0;
  end if;

  delete from public.mail_messages where thread_key = p_thread_key;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, before_state)
  values (
    (select auth.uid()),
    'mail_thread_deleted',
    'mail_thread',
    null,
    jsonb_build_object('counterpart', v_counterpart, 'messages', v_count)
  );

  return v_count;
end;
$$;

revoke execute on function public.admin_mail_delete_thread(text) from public, anon;
grant execute on function public.admin_mail_delete_thread(text) to authenticated, service_role;
