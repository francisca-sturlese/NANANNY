-- Cold sales mail is filed, not refused, and never lost.
--
-- The contact form receives it forever and no version of this product stops
-- that. What can change is whether it sits under "Needs a reply" with a badge
-- on the navigation, beside a family who cannot sign in.
--
-- Everything here is about the failure that matters, which is not letting a
-- pitch through. It is hiding a real person. The classifier is a word list, it
-- is wrong sometimes, and it may only ever move a request into its own tab.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f this-file
-- Rolled back at the end.

begin;

\set QUIET on
\set ON_ERROR_STOP on
\set QUIET off

-- ---------------------------------------------------------------------------
-- 1. The category exists, so filing one cannot throw it away
-- ---------------------------------------------------------------------------
-- Writing 'sales' before the constraint allowed it rejected the whole insert:
-- the message was lost and the sender was told we could not send it. Harmless
-- for a pitch, and exactly the wrong outcome for a wrong guess.
do $$
declare stored text;
begin
  insert into public.support_requests (contact_email, contact_name, category, subject, message)
  values ('pitch@test.local', 'Someone', 'sales', 'Re: your website',
          'A message long enough to pass the length check on this table.')
  returning category into stored;

  if stored = 'sales' then
    raise notice 'PASS 1  a filed pitch is stored rather than refused';
  else
    raise notice 'FAIL 1  stored as %', stored;
  end if;
exception when others then
  raise notice 'FAIL 1  the insert was rejected: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The categories a person chooses still work
-- ---------------------------------------------------------------------------
do $$
declare ok int := 0; c text;
begin
  foreach c in array array['account','profile','billing','safety','technical','other'] loop
    begin
      insert into public.support_requests (contact_email, category, subject, message)
      values ('person@test.local', c, 'Subject here',
              'A message long enough to pass the length check on this table.');
      ok := ok + 1;
    exception when others then null;
    end;
  end loop;

  if ok = 6 then
    raise notice 'PASS 2  every category a person can choose still saves';
  else
    raise notice 'FAIL 2  only % of 6 saved', ok;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. And nothing outside the list gets in
-- ---------------------------------------------------------------------------
do $$
declare refused boolean := false;
begin
  begin
    insert into public.support_requests (contact_email, category, subject, message)
    values ('person@test.local', 'anything-at-all', 'Subject here',
            'A message long enough to pass the length check on this table.');
  exception when others then refused := true;
  end;

  if refused then
    raise notice 'PASS 3  an unknown category is still refused';
  else
    raise notice 'FAIL 3  anything can be written into category';
  end if;
end $$;

rollback;
