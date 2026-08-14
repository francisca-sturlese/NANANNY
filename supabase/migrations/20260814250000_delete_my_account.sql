-- Leaving, properly.
--
-- The privacy page already promises this and told people to send an email. Made
-- self service, because a right you have to ask a stranger to exercise for you
-- is not much of a right.
--
-- What goes, what stays, and why.
--
-- Goes: the profile and everything on it, photos, documents, video, references,
-- children's ages, requirements, saved profiles, applications, job posts,
-- notifications. Everything that exists only because they were here.
--
-- Stays, anonymised: the `users` row, with the name replaced and the email and
-- phone cleared. Conversations have two people in them, and hard deleting one
-- would tear holes in the other person's history: a family would open a thread
-- and find their own messages answering nobody. So the account becomes "Deleted
-- account" and the messages stay where the other person left them.
--
-- Stays, untouched: payment records and audit logs. A business in the UAE has
-- to keep proof of what it charged, and an audit trail somebody can erase by
-- closing their account is not an audit trail. Neither carries anything about
-- the person beyond what the transaction was.
--
-- Not reversible, and not a "deactivate". Somebody asking to be deleted is
-- asking to be gone.
--
-- The login is emptied rather than dropped, and the reason is in the comment
-- next to it: deleting the auth row cascades all the way into the messages the
-- other person is still reading.

create or replace function public.delete_my_account(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_family_id uuid;
  v_nanny_id uuid;
  v_removed jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = 'ROLE1';
  end if;

  -- Typed, not ticked. A checkbox is too easy to tap by accident for something
  -- that cannot be undone.
  if lower(btrim(coalesce(p_confirmation, ''))) <> 'delete' then
    raise exception 'Type delete to confirm' using errcode = 'DELE1';
  end if;

  select role into v_role from public.users where id = v_user_id;

  -- An administrator closing their own account could leave nobody able to
  -- moderate. Somebody else has to demote them first.
  if v_role in ('admin', 'super_admin') then
    raise exception 'An administrator cannot delete their own account'
      using errcode = 'DELE2';
  end if;

  select id into v_family_id from public.family_profiles where user_id = v_user_id;
  select id into v_nanny_id from public.nanny_profiles where user_id = v_user_id;

  if v_family_id is not null then
    delete from public.saved_profiles where family_id = v_family_id;
    delete from public.matches where family_id = v_family_id;
    delete from public.family_requirements where family_id = v_family_id;
    delete from public.family_children where family_id = v_family_id;
    -- Job posts go, and with them the applications nannies made to them: an
    -- application to a job that no longer exists is noise in somebody's list.
    delete from public.job_applications
     where job_id in (select id from public.jobs where family_id = v_family_id);
    delete from public.jobs where family_id = v_family_id;

    v_removed := v_removed || jsonb_build_object('family_profile', true);
  end if;

  if v_nanny_id is not null then
    delete from public.saved_profiles where nanny_id = v_nanny_id;
    delete from public.matches where nanny_id = v_nanny_id;
    delete from public.job_applications where nanny_id = v_nanny_id;
    delete from public.nanny_references where nanny_id = v_nanny_id;
    delete from public.nanny_badges where nanny_id = v_nanny_id;
    delete from public.nanny_documents where nanny_id = v_nanny_id;

    v_removed := v_removed || jsonb_build_object('nanny_profile', true);
  end if;

  delete from public.notifications where user_id = v_user_id;
  delete from public.blocks where blocker_id = v_user_id or blocked_id = v_user_id;

  -- The conversation stays for the other person; nothing new can arrive in it.
  update public.conversations
     set blocked_at = coalesce(blocked_at, now())
   where family_id = v_family_id or nanny_id = v_nanny_id;

  /**
   * The profile rows are emptied, not dropped, for the same reason as the
   * login: `conversations` references both with ON DELETE CASCADE, so removing
   * a profile takes the conversation and every message in it, including the
   * ones the other person wrote and is still reading.
   *
   * What is left is a shell with nothing personal on it. A nanny's goes to
   * suspended so she disappears from search, which is what leaving means.
   */
  update public.family_profiles
     set display_name = 'Deleted account',
         description = null, emirate = null, area = null,
         latitude = null, longitude = null,
         children_count = 0, photo_url = null,
         ai_brief = null, ai_structured = '{}'::jsonb,
         onboarding_completed_at = null, profile_completion = 0
   where id = v_family_id;

  update public.nanny_profiles
     set status = 'suspended',
         first_name = 'Deleted account',
         headline = null, description = null, photo_url = null, video_url = null,
         emirate = null, area = null, nationality = null, date_of_birth = null,
         languages = '{}', certificates = '{}', preferred_locations = '{}',
         salary_expectation_min_aed = null, salary_expectation_max_aed = null,
         available_from = null, education = null, profile_completion = 0
   where id = v_nanny_id;

  -- What is left of them in the users table. Kept so the messages the other
  -- person received still have a sender, and so payments still have an owner.
  update public.users
     set first_name = 'Deleted',
         last_name  = 'account',
         phone      = null,
         email      = format('deleted+%s@nananny.invalid', v_user_id),
         status     = 'deleted',
         avatar_url = null,
         location   = null
   where id = v_user_id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, after_state)
  values (v_user_id, 'account_deleted', 'user', v_user_id, v_removed);

  /**
   * The login itself.
   *
   * Emptied rather than deleted. `public.users.id` references `auth.users` with
   * ON DELETE CASCADE, so removing the row there takes the anonymised row with
   * it, and the cascade continues into conversations and messages: the nanny
   * opens her thread and finds her own replies answering nobody. The first
   * version of this did exactly that.
   *
   * So the account is emptied instead. The address is moved aside, which frees
   * the real one if they ever want to come back; the password is replaced with
   * something no input can produce; and the ban makes every remaining path
   * refuse. Nothing they can type gets in.
   */
  update auth.users
     set email = format('deleted+%s@nananny.invalid', v_user_id),
         phone = null,
         encrypted_password = format('deleted-%s', gen_random_uuid()),
         email_change = '',
         phone_change = '',
         raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '100 years',
         updated_at = now()
   where id = v_user_id;

  return jsonb_build_object('deleted', true, 'removed', v_removed);
end;
$$;

revoke execute on function public.delete_my_account(text) from public;
grant execute on function public.delete_my_account(text) to authenticated;

comment on function public.delete_my_account(text) is
  'Erases everything that exists only because this person was here, anonymises what another person''s history depends on, and keeps payment and audit records. Not reversible.';
