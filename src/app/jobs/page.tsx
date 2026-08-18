import Link from "next/link";
import type { Metadata } from "next";
import { canonical } from "@/lib/seo/site";
import { MapPin, Home, Clock, Baby } from "lucide-react";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/dal";
import { EMIRATES, EMPLOYMENT_TYPES, ARRANGEMENTS } from "@/lib/uae";

export const metadata: Metadata = {
  alternates: canonical("/jobs"),
  title: "Nanny jobs in the UAE",
  description:
    "Browse live nanny jobs posted directly by families across Dubai, Abu Dhabi, Sharjah and the rest of the UAE. Free for nannies, always.",
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createServerSupabase();
  const user = await getSession();

  let query = supabase
    .from("jobs")
    .select(
      "id, title, emirate, area, arrangement, employment_type, start_date, working_days, salary_min_aed, salary_max_aed, children_count, children_ages, required_languages, driving_required, published_at",
      { count: "exact" },
    )
    .eq("status", "active")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(40);

  // Query parameters are user input: validate against the enum rather than
  // passing a raw string into the filter.
  const ARRANGEMENT_VALUES = ["live_in", "live_out"] as const;
  const EMPLOYMENT_VALUES = [
    "full_time",
    "part_time",
    "weekend",
    "night_care",
    "temporary",
  ] as const;

  if (params.emirate) query = query.eq("emirate", params.emirate);

  const arrangement = ARRANGEMENT_VALUES.find((v) => v === params.arrangement);
  if (arrangement) query = query.in("arrangement", [arrangement, "either"]);

  const employment = EMPLOYMENT_VALUES.find((v) => v === params.employment);
  if (employment) query = query.eq("employment_type", employment);

  const { data: jobs, count } = await query;
  const rows = jobs ?? [];

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-5 pt-6 pb-16 sm:px-8 sm:pt-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold sm:text-4xl">Nanny jobs</h1>
            <p className="mt-1.5 text-sm text-muted sm:text-base">
              Posted directly by families. Applying is free and always will be.
            </p>
          </div>

          {/* This page is mostly read by nannies, but a family who lands here
              is one who has already decided to post rather than search. Sending
              her to sign up is a shorter path than making her find the family
              area first. */}
          <Link href="/family/jobs/new" className="shrink-0">
            <Button variant="outline">Post a job</Button>
          </Link>
        </div>

        {/* Three filters only, laid out as a grid. A scrolling row put half the
            controls off screen with nothing to say they were there. */}
        <form
          action="/jobs"
          method="get"
          className="sticky top-14 z-30 -mx-5 mt-5 grid grid-cols-2 gap-2 border-b border-border bg-background/95 px-5 py-3 backdrop-blur-md sm:top-16 sm:-mx-8 sm:flex sm:px-8"
        >
          <Select name="emirate" defaultValue={params.emirate ?? ""} className="sm:min-w-40 sm:flex-1">
            <option value="">Anywhere</option>
            {EMIRATES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
          <Select
            name="arrangement"
            defaultValue={params.arrangement ?? ""}
            className="sm:min-w-36 sm:flex-1"
          >
            <option value="">Live in or out</option>
            {ARRANGEMENTS.filter((a) => a.value !== "either").map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
          <Select
            name="employment"
            defaultValue={params.employment ?? ""}
            className="sm:min-w-36 sm:flex-1"
          >
            <option value="">Any schedule</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Button type="submit" className="sm:shrink-0">
            Filter
          </Button>
        </form>

        <p className="mt-4 text-sm text-muted" aria-live="polite">
          {count === 0 ? "No jobs match those filters" : `${count} open ${count === 1 ? "job" : "jobs"}`}
        </p>

        {rows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center sm:p-12">
            <h2 className="text-lg font-semibold">No open jobs right now</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
              New jobs are posted regularly. Complete your profile so families can find you
              directly in the meantime.
            </p>
            <Link href={user ? "/nanny" : "/signup?role=nanny"} className="mt-5 inline-block">
              <Button>{user ? "Go to my profile" : "Create a free profile"}</Button>
            </Link>
          </div>
        ) : (
          /* Cards in a grid, founder's brief: salary first, because it is
             the first thing a nanny scans for; uniform heights; and an
             explicit way in at the bottom of every card. */
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {rows.map((job) => {
              const isNew =
                job.published_at &&
                // eslint-disable-next-line react-hooks/purity -- server component rendered per request: "posted in the last 48h" needs the current time
                Date.now() - new Date(job.published_at).getTime() < 48 * 3600 * 1000;
              return (
                <li key={job.id} className="h-full">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex h-full flex-col rounded-lg border border-border bg-surface-raised p-4 transition-shadow hover:shadow-card sm:p-5"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="sage" size="sm">
                        {job.emirate}
                      </Badge>
                      {isNew ? (
                        <Badge variant="butter" size="sm">
                          New
                        </Badge>
                      ) : (
                        job.published_at && (
                          <span className="text-xs text-subtle">
                            {timeAgo(job.published_at)}
                          </span>
                        )
                      )}
                    </div>

                    {job.salary_min_aed != null && (
                      <p className="mt-2.5 text-lg font-semibold">
                        AED {job.salary_min_aed.toLocaleString("en-AE")}
                        {job.salary_max_aed != null &&
                          ` to ${job.salary_max_aed.toLocaleString("en-AE")}`}
                        <span className="text-sm font-normal text-muted"> / month</span>
                      </p>
                    )}

                    <h2 className="mt-1 line-clamp-2 text-base font-semibold">
                      {job.title}
                    </h2>

                    <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted">
                      <li className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        {[job.area, job.emirate].filter(Boolean).join(", ")}
                      </li>
                      <li className="inline-flex items-center gap-1">
                        <Home className="size-3.5 shrink-0" aria-hidden />
                        {job.arrangement === "live_in"
                          ? "Live in"
                          : job.arrangement === "live_out"
                            ? "Live out"
                            : "Either"}
                      </li>
                      {job.children_count > 0 && (
                        <li className="inline-flex items-center gap-1">
                          <Baby className="size-3.5 shrink-0" aria-hidden />
                          {job.children_count} {job.children_count === 1 ? "child" : "children"}
                        </li>
                      )}
                      {job.start_date && (
                        <li className="inline-flex items-center gap-1">
                          <Clock className="size-3.5 shrink-0" aria-hidden />
                          from{" "}
                          {new Date(`${job.start_date}T00:00:00`).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                        </li>
                      )}
                    </ul>

                    {(job.required_languages.length > 0 || job.driving_required) && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {job.required_languages.slice(0, 3).map((l) => (
                          <Badge key={l} variant="neutral" size="sm">
                            {l}
                          </Badge>
                        ))}
                        {job.driving_required && (
                          <Badge variant="sage" size="sm">
                            Driving
                          </Badge>
                        )}
                      </div>
                    )}

                    <p className="mt-auto pt-3 text-sm font-medium underline-offset-4 group-hover:underline">
                      View and apply
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
