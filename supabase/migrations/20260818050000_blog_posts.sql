-- The blog gets a back office.
--
-- Posts started life as pages in the repo, which kept quality high and the
-- founder dependent: publishing meant asking a machine. Posts now live here,
-- written from the admin panel, rendered by the site through the service
-- client -- so the table needs no anonymous grants at all and the read
-- guardian has nothing new to memorise. Writes go through a definer function
-- that checks is_admin() and leaves an audit row, like every administrative
-- act in this product.

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),
  title text not null check (length(title) between 3 and 160),
  description text not null default '' check (length(description) <= 300),
  -- Markdown-lite, rendered by a deliberately tiny renderer app-side.
  body text not null default '' check (length(body) <= 50000),
  published boolean not null default false,
  published_at timestamptz,
  author_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.blog_posts is
  'Blog posts written from the admin panel. Read by the site through the service client; no anonymous grants by design.';

alter table public.blog_posts enable row level security;
grant all on public.blog_posts to service_role;

create or replace function public.admin_save_blog_post(
  p_id uuid,
  p_slug text,
  p_title text,
  p_description text,
  p_body text,
  p_published boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_was_published boolean;
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
    select published into v_was_published from public.blog_posts where id = p_id;
    if not found then
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

revoke execute on function public.admin_save_blog_post(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_save_blog_post(uuid, text, text, text, text, boolean) to authenticated;

create or replace function public.admin_delete_blog_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ROLE1: Not permitted' using errcode = 'P0001';
  end if;

  delete from public.blog_posts where id = p_id;

  insert into public.audit_logs (actor_id, action, entity_kind, entity_id)
  values ((select auth.uid()), 'blog_post_deleted', 'blog_post', p_id);
end;
$$;

revoke execute on function public.admin_delete_blog_post(uuid) from public, anon;
grant execute on function public.admin_delete_blog_post(uuid) to authenticated;
