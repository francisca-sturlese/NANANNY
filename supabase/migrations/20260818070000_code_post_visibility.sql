-- The founder's hand reaches the posts that live in code.
--
-- Two articles exist as pages in the repo, with layouts a textarea cannot
-- express. They stay there, but the admin list must show every post with an
-- action on it ("postato da me o meno" -- the brief), so the one action that
-- makes sense for a code post without a deploy gets a home: visible or not.

create table public.blog_code_posts (
  slug text primary key,
  hidden boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.blog_code_posts is
  'Visibility switches for blog posts that live as code. Read by the site through the service client; written by admins through the definer function.';

alter table public.blog_code_posts enable row level security;
grant all on public.blog_code_posts to service_role;

create or replace function public.admin_set_code_post_hidden(
  p_slug text,
  p_hidden boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ROLE1: Not permitted' using errcode = 'P0001';
  end if;

  insert into public.blog_code_posts (slug, hidden, updated_at)
  values (p_slug, p_hidden, now())
  on conflict (slug) do update set hidden = excluded.hidden, updated_at = now();

  insert into public.audit_logs (actor_id, action, entity_kind, after_state)
  values (
    (select auth.uid()),
    'blog_code_post_visibility',
    'blog_post',
    jsonb_build_object('slug', p_slug, 'hidden', p_hidden)
  );
end;
$$;

revoke execute on function public.admin_set_code_post_hidden(text, boolean) from public, anon;
grant execute on function public.admin_set_code_post_hidden(text, boolean) to authenticated;
