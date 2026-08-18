import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/site/marketing-page";
import { BLOG_POSTS, type BlogPost } from "@/lib/blog";
import { createServiceClient } from "@/lib/supabase/service";
import { canonical } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Hiring a nanny in the UAE, explained with real numbers: salaries, contracts, and how families and nannies find each other without an agency.",
  alternates: canonical("/blog"),
};

/**
 * The blog index. Short on purpose: a young blog with three honest posts
 * reads better than one padded to look established.
 */
export const dynamic = "force-dynamic";

export default async function BlogPage() {
  // Posts written from the back office join the ones that live as code.
  const service = createServiceClient();
  const [{ data: dbPosts }, { data: hiddenRows }] = await Promise.all([
    service
      .from("blog_posts")
      .select("slug, title, description, published_at")
      .eq("published", true),
    service.from("blog_code_posts").select("slug, hidden").eq("hidden", true),
  ]);
  const hidden = new Set((hiddenRows ?? []).map((r) => r.slug));
  const fromDb: BlogPost[] = (dbPosts ?? []).map((p) => ({
    slug: p.slug,
    href: `/blog/${p.slug}`,
    title: p.title,
    description: p.description,
    published: (p.published_at ?? "").slice(0, 10),
  }));
  const posts = [...BLOG_POSTS.filter((p) => !hidden.has(p.slug)), ...fromDb].sort(
    (a, b) => b.published.localeCompare(a.published),
  );

  return (
    <MarketingPage
      eyebrow="Blog"
      title="Hiring help, with real numbers"
      intro="Everything here comes from running a live marketplace in the UAE: actual salary expectations, actual processes, no recycled advice."
    >
      <ul className="divide-y divide-border border-y border-border">
        {posts.map((post) => (
          <li key={post.slug} className="py-5">
            <Link href={post.href} className="group block">
              <p className="text-xs text-subtle">
                {new Date(post.published).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <h2 className="mt-1 text-lg font-semibold underline-offset-4 group-hover:underline">
                {post.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{post.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </MarketingPage>
  );
}
