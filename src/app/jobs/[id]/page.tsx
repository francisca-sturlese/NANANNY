import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, Home, Clock, Baby, Car, ChefHat, Sparkles, PawPrint } from "lucide-react";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApplyPanel } from "@/components/jobs/apply-panel";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/dal";
import { ReportButton } from "@/components/safety/report-button";

type JobRow = {
  id: string;
  title: string;
  status: string;
  emirate: string | null;
  area: string | null;
  arrangement: string;
  employment_type: string;
  start_date: string | null;
  working_days: string[];
  working_hours_start: string | null;
  working_hours_end: string | null;
  schedule_notes: string | null;
  salary_min_aed: number | null;
  salary_max_aed: number | null;
  children_count: number;
  children_ages: number[];
  responsibilities: string | null;
  required_experience_years: number | null;
  required_languages: string[];
  required_skills: string[];
  driving_required: boolean;
  cooking_required: boolean;
  housekeeping_required: boolean;
  has_pets: boolean;
  additional_information: string | null;
  published_at: string | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("jobs")
    .select("title, emirate")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();

  if (!data) return { title: "Job not found" };
  return {
    title: data.title,
    description: `Nanny job in ${data.emirate ?? "the UAE"}, posted directly by the family.`,
  };
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const user = await getSession();

  // `select("*")` would ask for family_id, which anon is not granted — and a
  // column-level refusal fails the whole query, so the page 404s for every
  // signed-out visitor. Ask only for what the audience may read.
  const JOB_PUBLIC_COLUMNS = [
    "id",
    "title",
    "status",
    "emirate",
    "area",
    "arrangement",
    "employment_type",
    "start_date",
    "working_days",
    "working_hours_start",
    "working_hours_end",
    "schedule_notes",
    "salary_min_aed",
    "salary_max_aed",
    "children_count",
    "children_ages",
    "responsibilities",
    "required_experience_years",
    "required_languages",
    "required_skills",
    "driving_required",
    "cooking_required",
    "housekeeping_required",
    "has_pets",
    "additional_information",
    "published_at",
  ].join(", ");

  const { data: rawJob } = await supabase
    .from("jobs")
    .select(JOB_PUBLIC_COLUMNS)
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();

  const job = rawJob as unknown as JobRow | null;

  if (!job) notFound();

  // Only meaningful for a nanny; a family looking at someone else's job simply
  // sees no apply panel.
  let existingApplication: { status: string } | null = null;
  let nannyStatus: string | null = null;

  if (user?.role === "nanny") {
    const { data: nanny } = await supabase
      .from("nanny_profiles")
      .select("id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    nannyStatus = nanny?.status ?? null;

    if (nanny) {
      const { data: application } = await supabase
        .from("job_applications")
        .select("status")
        .eq("job_id", id)
        .eq("nanny_id", nanny.id)
        .maybeSingle();
      existingApplication = application;
    }
  }

  const requirements = [
    job.driving_required && { icon: Car, label: "Driving licence required" },
    job.cooking_required && { icon: ChefHat, label: "Cooking required" },
    job.housekeeping_required && { icon: Sparkles, label: "Light housekeeping" },
    job.has_pets && { icon: PawPrint, label: "The household has pets" },
  ].filter(Boolean) as { icon: typeof Car; label: string }[];

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-5 pt-6 pb-32 sm:px-8 sm:pt-10 sm:pb-16">
        <Link href="/jobs" className="tap-target text-sm text-muted underline underline-offset-4">
          ← All jobs
        </Link>

        <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">{job.title}</h1>

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted">
          <li className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {/* Area only — never the family's address. */}
            {[job.area, job.emirate].filter(Boolean).join(", ")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Home className="size-4 shrink-0" aria-hidden />
            {job.arrangement === "live_in"
              ? "Live in"
              : job.arrangement === "live_out"
                ? "Live out"
                : "Live in or out"}
          </li>
          {job.children_count > 0 && (
            <li className="inline-flex items-center gap-1.5">
              <Baby className="size-4 shrink-0" aria-hidden />
              {job.children_count} {job.children_count === 1 ? "child" : "children"}
              {job.children_ages.length > 0 && ` (${job.children_ages.join(", ")} yrs)`}
            </li>
          )}
          {job.start_date && (
            <li className="inline-flex items-center gap-1.5">
              <Clock className="size-4 shrink-0" aria-hidden />
              Starts{" "}
              {new Date(`${job.start_date}T00:00:00`).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
              })}
            </li>
          )}
        </ul>

        {job.salary_min_aed != null && (
          <p className="mt-5 rounded-lg border border-border bg-surface px-4 py-3 text-lg font-semibold">
            AED {job.salary_min_aed.toLocaleString("en-AE")}
            {job.salary_max_aed != null && ` to ${job.salary_max_aed.toLocaleString("en-AE")}`}
            <span className="text-base font-normal text-muted"> / month</span>
          </p>
        )}

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="mb-3 text-lg font-semibold">The role</h2>
          <p className="leading-relaxed whitespace-pre-line text-muted">
            {job.responsibilities}
          </p>
        </section>

        {job.working_days.length > 0 && (
          <section className="mt-8 border-t border-border pt-6">
            <h2 className="mb-3 text-lg font-semibold">Schedule</h2>
            <div className="flex flex-wrap gap-2">
              {job.working_days.map((d) => (
                <Badge key={d} variant="neutral" size="sm">
                  {d.slice(0, 3)}
                </Badge>
              ))}
            </div>
            {job.working_hours_start && job.working_hours_end && (
              <p className="mt-3 text-sm text-muted">
                {job.working_hours_start.slice(0, 5)} to {job.working_hours_end.slice(0, 5)}
              </p>
            )}
            {job.schedule_notes && (
              <p className="mt-2 text-sm text-muted">{job.schedule_notes}</p>
            )}
          </section>
        )}

        {(requirements.length > 0 ||
          job.required_languages.length > 0 ||
          job.required_experience_years) && (
          <section className="mt-8 border-t border-border pt-6">
            <h2 className="mb-3 text-lg font-semibold">What the family is looking for</h2>

            {job.required_experience_years != null && (
              <p className="text-sm">
                <span className="text-muted">Experience:</span>{" "}
                <span className="font-medium">{job.required_experience_years}+ years</span>
              </p>
            )}

            {job.required_languages.length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-muted">Languages</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {job.required_languages.map((l) => (
                    <Badge key={l} variant="sage" size="sm">
                      {l}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {requirements.length > 0 && (
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {requirements.map((r) => (
                  <li key={r.label} className="flex items-center gap-2.5 text-sm">
                    <r.icon className="size-4 shrink-0 text-sage-deep" aria-hidden />
                    {r.label}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {job.additional_information && (
          <section className="mt-8 border-t border-border pt-6">
            <h2 className="mb-3 text-lg font-semibold">Anything else</h2>
            <p className="leading-relaxed whitespace-pre-line text-muted">
              {job.additional_information}
            </p>
          </section>
        )}

        {user && (
          <div className="mt-10 border-t border-border pt-5">
            <ReportButton targetKind="job" targetId={id} what="this job" />
          </div>
        )}

        <p className="mt-6 text-xs leading-relaxed text-subtle">
          NaNanny is a technology platform. This job is offered by the family directly, not
          by NaNanny, and any employment arrangement is between you and them. Applying is
          free.
        </p>
      </main>

      {/* Sticky apply bar. The page reserves pb-32 so nothing hides beneath it. */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md sm:static sm:border-0 sm:bg-transparent">
        <div className="mx-auto max-w-3xl px-5 py-3 sm:px-8 sm:pb-10">
          {user?.role === "nanny" ? (
            <ApplyPanel
              jobId={id}
              alreadyApplied={Boolean(existingApplication)}
              applicationStatus={existingApplication?.status ?? null}
              profileApproved={nannyStatus === "approved"}
            />
          ) : user?.role === "family" ? (
            <p className="text-center text-sm text-muted">
              This is how nannies see your job post.
            </p>
          ) : (
            <Link href="/signup?role=nanny" className="block">
              <Button size="lg" block>
                Sign up to apply
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="hidden sm:block">
        <SiteFooter />
      </div>
    </>
  );
}
