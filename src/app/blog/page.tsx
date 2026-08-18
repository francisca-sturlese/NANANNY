import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/site/marketing-page";
import { BLOG_POSTS } from "@/lib/blog";
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
export default function BlogPage() {
  const posts = [...BLOG_POSTS].sort((a, b) => b.published.localeCompare(a.published));

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
