import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BlogPostForm } from "@/components/admin/blog-post-form";

export const metadata: Metadata = { title: "Blog" };

type AdminPostRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  published: boolean;
  published_at: string | null;
  updated_at: string;
};

/**
 * Write the blog from the phone if need be.
 *
 * One page: the list, and below it the editor for whichever post ?edit
 * names, or a blank one for ?new. Posts that live as code in the repo are
 * not listed here; they are edited where they live.
 */
export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string }>;
}) {
  const { edit, new: isNew } = await searchParams;
  const admin = await requireAdmin("/admin/blog");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any --
  // generated types have not met blog_posts yet.
  const service = createServiceClient() as any;
  const { data } = await service
    .from("blog_posts")
    .select("id, slug, title, description, body, published, published_at, updated_at")
    .order("updated_at", { ascending: false });
  const posts = (data ?? []) as AdminPostRow[];
  const editing = edit ? posts.find((p) => p.id === edit) : undefined;

  return (
    <AdminShell active="/admin/blog" name={admin.firstName ?? "Admin"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">Blog</h1>
        <Link href="/admin/blog?new=1">
          <Button size="sm">New post</Button>
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Drafts stay yours; published posts appear on{" "}
        <Link href="/blog" className="underline underline-offset-4">
          nananny.com/blog
        </Link>{" "}
        the moment you save them.
      </p>

      {posts.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-center text-sm text-muted">
          No posts from the back office yet. The salary guide lives in the code;
          everything you write here joins it on the blog.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-background">
          {posts.map((post) => (
            <li key={post.id} className="flex flex-wrap items-center gap-2.5 px-4 py-3">
              <Link
                href={`/admin/blog?edit=${post.id}`}
                className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-4 hover:underline"
              >
                {post.title}
              </Link>
              <Badge variant={post.published ? "sage" : "neutral"} size="sm">
                {post.published ? "published" : "draft"}
              </Badge>
              {post.published && (
                <Link
                  href={`/blog/${post.slug}`}
                  className="text-xs text-muted underline underline-offset-4"
                >
                  view
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {(editing || isNew) && (
        <section className="mt-8 border-t border-border pt-6">
          <h2 className="text-lg font-semibold">
            {editing ? `Editing: ${editing.title}` : "New post"}
          </h2>
          <div className="mt-4">
            <BlogPostForm post={editing} />
          </div>
        </section>
      )}
    </AdminShell>
  );
}
