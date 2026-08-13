-- NaNanny UAE — CVs, documents and the family photo
--
-- The nanny_documents table and the private bucket existed from Milestone 1,
-- but nothing could put a file in them: there was no upload anywhere in the
-- product. Same for the family photo — the column was there, the upload was not.

-- A CV is the document a nanny is most likely to already have, and it was not
-- in the allowed kinds.
alter table public.nanny_documents drop constraint nanny_documents_kind_check;

alter table public.nanny_documents
  add constraint nanny_documents_kind_check check (kind in (
    'cv',
    'id',
    'passport',
    'visa',
    'certificate',
    'reference',
    'first_aid',
    'police_clearance',
    'other'
  ));

comment on column public.nanny_documents.kind is
  'What the file is. Uploading a certificate is a claim; the matching badge is only granted once an admin has actually opened it.';

-- A friendly label the nanny types, so a list of five PDFs is readable.
alter table public.nanny_documents add column label text;

-- The review queue needs to know at a glance whether there is anything to look
-- at, without joining on every render.
create index nanny_documents_unreviewed_idx
  on public.nanny_documents (nanny_id)
  where not reviewed;

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

comment on column public.nanny_profiles.photo_url is
  'Required before a profile can be submitted for review — see nanny_profile_completion(). Storage key, never a URL.';

comment on column public.family_profiles.photo_url is
  'Optional. A family is identified to nannies by its display name; a photo only makes the introduction warmer.';

-- ---------------------------------------------------------------------------
-- Admin: reviewing a document
-- ---------------------------------------------------------------------------

create or replace function public.admin_mark_document_reviewed(
  p_document_id uuid,
  p_reviewed boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_nanny uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = 'ROLE1';
  end if;

  update public.nanny_documents
     set reviewed = p_reviewed,
         reviewed_by = case when p_reviewed then auth.uid() else null end,
         reviewed_at = case when p_reviewed then now() else null end
   where id = p_document_id
  returning nanny_id into v_nanny;

  if v_nanny is null then
    raise exception 'Document not found' using errcode = 'ADMN2';
  end if;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, after_state)
  values (auth.uid(), 'document_reviewed', 'nanny_document', p_document_id,
          jsonb_build_object('reviewed', p_reviewed));

  -- Marking a document reviewed is NOT the same as granting a badge. The badge
  -- says what was verified; this only records that somebody opened the file.
  return jsonb_build_object('reviewed', p_reviewed);
end;
$$;

grant execute on function public.admin_mark_document_reviewed(uuid, boolean) to authenticated;

-- Admins already have a select policy on nanny_documents; they need the grant
-- to update the reviewed flag through the function's own audit path.
grant select on public.nanny_documents to authenticated;
