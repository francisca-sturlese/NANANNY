import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { absoluteUrl } from "@/lib/seo/site";
import { availableLandings, emirateSlug } from "@/lib/seo/landings";

/**
 * The sitemap.
 *
 * Two deliberate absences.
 *
 * Individual nanny profiles are not listed and are disallowed in robots.txt.
 * They are readable without an account, because a family should be able to see
 * who is available before signing up, but readable and indexed are different
 * things. A nanny looking for work in the UAE does not expect her photo, her
 * first name and the emirate she lives in to sit in a search index long after
 * she has found a job and moved on. The search page carries the same value for
 * a visitor arriving from Google, without pinning a person to a URL.
 *
 * Job posts are listed. Those are written by a family about a role, they carry
 * no personal detail, and a family posting a job wants it found.
 *
 * Read through the service client because a crawler has no session and the
 * anon role is granted only a narrow set of columns. Only ids and timestamps
 * of already public rows leave this file.
 */

/**
 * Generated per request, not baked at build.
 *
 * A prerendered sitemap freezes the job list at the moment of the last deploy:
 * jobs posted since then are invisible to a crawler, and jobs closed since then
 * are advertised and answer 404. That is not hypothetical, it is what this file
 * did until the check caught it. A crawler fetches this a handful of times a
 * day, so one query per fetch is the cheaper side of the trade.
 */
export const dynamic = "force-dynamic";

const STATIC_PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/for-families", priority: 0.9, changeFrequency: "monthly" },
  { path: "/for-nannies", priority: 0.9, changeFrequency: "monthly" },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/nannies", priority: 0.8, changeFrequency: "daily" },
  { path: "/jobs", priority: 0.8, changeFrequency: "daily" },
  { path: "/find", priority: 0.6, changeFrequency: "monthly" },
  { path: "/nanny-in/dubai", priority: 0.7, changeFrequency: "monthly" },
  { path: "/nanny-in/abu-dhabi", priority: 0.7, changeFrequency: "monthly" },
  { path: "/nanny-in/sharjah", priority: 0.6, changeFrequency: "monthly" },
  { path: "/nanny-in/ajman", priority: 0.5, changeFrequency: "monthly" },
  { path: "/nanny-in/ras-al-khaimah", priority: 0.5, changeFrequency: "monthly" },
  { path: "/nanny-in/fujairah", priority: 0.5, changeFrequency: "monthly" },
  { path: "/nanny-in/umm-al-quwain", priority: 0.5, changeFrequency: "monthly" },
  { path: "/guides/hire-a-nanny-in-dubai-without-an-agency", priority: 0.7, changeFrequency: "monthly" },
  { path: "/partnerships", priority: 0.5, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.6, changeFrequency: "weekly" },
  { path: "/blog/nanny-salary-dubai-2026", priority: 0.7, changeFrequency: "monthly" },
  { path: "/blog/live-in-vs-live-out-nanny-dubai", priority: 0.7, changeFrequency: "monthly" },
  { path: "/blog/nanny-interview-questions", priority: 0.7, changeFrequency: "monthly" },
  { path: "/support", priority: 0.4, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /**
   * The filter landings, counted rather than listed.
   *
   * Each one only exists while enough profiles sit behind it, and the page
   * itself returns 404 below that line. Listing them by hand would mean the
   * sitemap advertising a page that has thinned out, which is the specific way
   * a crawler learns to stop trusting a sitemap. Counting here keeps the two
   * answers the same answer.
   */
  const landings = await availableLandings();

  const pages: MetadataRoute.Sitemap = STATIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  for (const landing of landings) {
    pages.push({
      url: absoluteUrl(`/nanny-in/${emirateSlug(landing.emirate)}/${landing.filter.slug}`),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  /**
   * The posts written from the back office.
   *
   * The salary guide lives in `STATIC_PAGES` because it lives in code. Anything
   * Federico writes in the admin editor exists only as a row, and a post that
   * is not in the sitemap is a post a crawler finds weeks late or not at all,
   * which defeats the reason for writing it.
   *
   * `lastModified` is the row's own timestamp rather than now. Every entry
   * claiming it changed this minute is how a sitemap stops being believed, and
   * here there is a real date to give.
   *
   * Deduplicated by URL at the end, because a row whose slug matches a coded
   * post resolves to the same page: Next serves the static route and the
   * dynamic one never runs, so listing both would advertise one page twice.
   */
  try {
    const service = createServiceClient();
    const [{ data: posts }, { data: hiddenRows }] = await Promise.all([
      service
        .from("blog_posts")
        .select("slug, updated_at, published_at")
        .eq("published", true)
        .order("published_at", { ascending: false })
        .limit(500),
      service.from("blog_code_posts").select("slug").eq("hidden", true),
    ]);

    /**
     * A post the founder has hidden is not advertised either.
     *
     * The two coded posts can be switched off from the back office without a
     * deploy, and their routes keep answering because they are pages in the
     * repo. Leaving them in the sitemap would mean a crawler kept sending
     * people to an article somebody deliberately took off the blog, which is
     * the same disagreement between page and sitemap the filter landings
     * already avoid.
     *
     * If that read fails the posts stay listed. Hiding here is editorial
     * rather than a privacy matter, and dropping three good articles every
     * time the database blinks costs more than the rare day a hidden one is
     * still advertised.
     */
    const hidden = new Set((hiddenRows ?? []).map((row) => `/blog/${row.slug}`));
    if (hidden.size > 0) {
      for (let i = pages.length - 1; i >= 0; i -= 1) {
        if (hidden.has(new URL(pages[i].url).pathname)) pages.splice(i, 1);
      }
    }

    for (const post of posts ?? []) {
      pages.push({
        url: absoluteUrl(`/blog/${post.slug}`),
        lastModified: new Date(post.updated_at ?? post.published_at ?? Date.now()),
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  } catch (error) {
    console.error("[sitemap] could not list blog posts:", error);
  }

  try {
    const supabase = createServiceClient();
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(2000);

    for (const job of jobs ?? []) {
      pages.push({
        url: absoluteUrl(`/jobs/${job.id}`),
        lastModified: job.updated_at ? new Date(job.updated_at) : new Date(),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch (error) {
    // A sitemap missing its job posts is a worse sitemap. A build that fails
    // because the database was briefly unreachable is a worse outage.
    console.error("[sitemap] could not list jobs:", error);
  }

  const seen = new Set<string>();
  return pages.filter((page) => {
    if (seen.has(page.url)) return false;
    seen.add(page.url);
    return true;
  });
}
