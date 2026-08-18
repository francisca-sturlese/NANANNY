import "server-only";

import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Makes the admin's hide switch mean what it says for the posts that live
 * as code.
 *
 * Hiding removed a post from the blog index and the sitemap, but the page
 * itself kept answering 200 with indexable metadata: Google would keep what
 * it had already taken. This reads the switch at request time and answers
 * with noindex while hidden, which is the deindex signal crawlers respect.
 * The cost is that these pages render per request instead of statically --
 * a database read for a switch used twice a year, priced honestly and paid.
 */
export async function withCodePostVisibility(
  slug: string,
  base: Metadata,
): Promise<Metadata> {
  const { data } = await createServiceClient()
    .from("blog_code_posts")
    .select("hidden")
    .eq("slug", slug)
    .maybeSingle();

  if (data?.hidden) {
    return { ...base, robots: { index: false, follow: false } };
  }
  return base;
}
