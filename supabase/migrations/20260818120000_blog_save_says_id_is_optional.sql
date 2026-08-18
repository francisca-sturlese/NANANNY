-- The save function accepts no id when the post is new. Its signature did not
-- say so.
--
-- `p_id is null` has always meant "create this one", but the parameter was
-- declared without a default, so every generated client insisted on a uuid the
-- caller does not have yet. The admin action worked around it by casting the
-- whole Supabase client to `any`, which silenced the argument that was wrong
-- and the five that were right along with it.
--
-- PostgreSQL only allows defaults on trailing parameters, so p_id moves to the
-- end. That changes the function's identity, which is why this drops rather
-- than replaces: two overloads sharing every parameter name would leave
-- PostgREST unable to choose between them, and it would fail at the moment
-- somebody presses Save rather than here. The only caller passes arguments by
-- name, so the order is invisible to it.

drop function if exists public.admin_save_blog_post(uuid, text, text, text, text, boolean);

create function public.admin_save_blog_post(
  p_slug text,
  p_title text,
  p_description text,
  p_body text,
  p_published boolean,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'ROLE1: Not permitted' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.blog_posts (slug, title, description, body, published, published_at, author_id)
    values (
      p_slug, p_title, coalesce(p_description, ''), coalesce(p_body, ''), p_published,
      case when p_published then now() end,
      (select auth.uid())
    )
    returning id into v_id;
  else
    if not exists (select 1 from public.blog_posts where id = p_id) then
      raise exception 'Post not found';
    end if;
    update public.blog_posts
       set slug = p_slug,
           title = p_title,
           description = coalesce(p_description, ''),
           body = coalesce(p_body, ''),
           published = p_published,
           -- The first publication date survives edits; unpublishing and
           -- publishing again is an edit, not a new article.
           published_at = case
             when p_published and published_at is null then now()
             else published_at
           end,
           updated_at = now()
     where id = p_id;
    v_id := p_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id, after_state)
  values (
    (select auth.uid()),
    'blog_post_saved',
    'blog_post',
    v_id,
    jsonb_build_object('slug', p_slug, 'published', p_published)
  );

  return v_id;
end;
$$;

revoke execute on function public.admin_save_blog_post(text, text, text, text, boolean, uuid) from public, anon;
grant execute on function public.admin_save_blog_post(text, text, text, text, boolean, uuid) to authenticated;
