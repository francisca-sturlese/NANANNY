import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { MarketingPage } from "@/components/site/marketing-page";
import { renderBlogBody } from "@/lib/blog-render";
import { absoluteUrl, canonical, jsonLd } from "@/lib/seo/site";

/**
 * A post written from the back office.
 *
 * Read through the service client on the server: the table carries no
 * anonymous grants at all, and only published rows ever leave this file.
 * Posts that exist as code (the salary guide) keep their own routes; Next
 * prefers a static route over this dynamic one, so the two never collide.
 */

export const dynamic = "force-dynamic";

type PostRow = {
  slug: string;
  title: string;
  description: string;
  body: string;
  published: boolean;
  published_at: string | null;
};

async function loadPost(slug: string): Promise<PostRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any --
  // generated types have not met blog_posts yet.
  const service = createServiceClient() as any;
  const { data } = await service
    .from("blog_posts")
    .select("slug, title, description, body, published, published_at")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return (data as PostRow | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.description,
    alternates: canonical(`/blog/${post.slug}`),
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();

  const published = post.published_at
    ? new Date(post.published_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <>
      <script type="application/ld+json">
        {jsonLd({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.title,
          datePublished: post.published_at ?? undefined,
          author: { "@type": "Organization", name: "NaNanny UAE" },
          url: absoluteUrl(`/blog/${post.slug}`),
        })}
      </script>
      <MarketingPage
        eyebrow={published ? `Blog · ${published}` : "Blog"}
        title={post.title}
        intro={post.description || undefined}
        cta={{
          href: "/nannies",
          label: "Browse nannies on NaNanny",
          secondary: { href: "/blog", label: "More from the blog" },
        }}
      >
        <div>{renderBlogBody(post.body)}</div>
      </MarketingPage>
    </>
  );
}
