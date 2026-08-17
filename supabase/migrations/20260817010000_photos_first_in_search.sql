-- A face before a placeholder, in every ordering.
--
-- Founder's call: profiles with a photo rank above profiles without one,
-- whatever sort the family picked. With auto-published half-finished profiles
-- now in the window, the grid otherwise fills its top rows with brand-mark
-- placeholders, and the first screen a family sees is the least convincing.
--
-- A stored generated column rather than an expression in the query, because
-- PostgREST orders by columns, not expressions, and because "has she a photo"
-- is a fact worth indexing the day the list grows.

alter table public.nanny_profiles
  add column if not exists has_photo boolean
  generated always as (photo_url is not null) stored;

comment on column public.nanny_profiles.has_photo is
  'Generated: photo_url is not null. Exists so search can rank faces above placeholders.';
