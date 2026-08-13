-- NaNanny UAE — private storage (PRD §41, §45)
--
-- Every bucket is private. Nothing is served from a public Supabase URL: the
-- app mints a short-lived signed URL server-side after checking who is asking.
--
-- Profile photos are private too, even though the photo itself is a public
-- discovery field. A public bucket hands out a permanent, guessable-forever URL
-- to a real person's face; a signed URL expires. The cost is losing CDN
-- caching on avatars, which is the right trade for this product.
--
-- Object keys are always `<owner_uuid>/<filename>`, and every policy below
-- pins the first path segment to auth.uid(). That is what stops one nanny from
-- writing into — or reading — another's folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('nanny-photos',    'nanny-photos',    false,  5 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('nanny-videos',    'nanny-videos',    false, 80 * 1024 * 1024,
   array['video/mp4', 'video/quicktime', 'video/webm']),
  ('nanny-documents', 'nanny-documents', false, 15 * 1024 * 1024,
   array['application/pdf', 'image/jpeg', 'image/png']),
  ('family-photos',   'family-photos',   false,  5 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Owner access: read, write, replace and delete inside your own folder only
-- ---------------------------------------------------------------------------

create policy "nanny owns their photo folder"
  on storage.objects for all to authenticated
  using (bucket_id = 'nanny-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'nanny-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "nanny owns their video folder"
  on storage.objects for all to authenticated
  using (bucket_id = 'nanny-videos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'nanny-videos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "nanny owns their document folder"
  on storage.objects for all to authenticated
  using (bucket_id = 'nanny-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'nanny-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "family owns their photo folder"
  on storage.objects for all to authenticated
  using (bucket_id = 'family-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'family-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Admin review access
-- ---------------------------------------------------------------------------

-- Admins read documents and videos to run the review. Read only: a reviewer
-- has no reason to modify or delete a nanny's evidence.
create policy "admins read nanny documents"
  on storage.objects for select to authenticated
  using (bucket_id in ('nanny-documents', 'nanny-videos') and public.is_admin());

-- ---------------------------------------------------------------------------
-- Notably absent
-- ---------------------------------------------------------------------------
-- There is no policy granting families direct access to any bucket. A family
-- sees a nanny's photo through a signed URL the server mints for an approved
-- profile — never by reading storage itself. Documents and videos are never
-- signed for a family at all.
