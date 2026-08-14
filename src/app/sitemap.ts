import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { absoluteUrl } from "@/lib/seo/site";

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
  { path: "/support", priority: 0.4, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = STATIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

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

  return pages;
}
