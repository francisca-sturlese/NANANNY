import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  MapPin,
  Home,
  Clock,
  Languages as LanguagesIcon,
  GraduationCap,
  Car,
  ChefHat,
  Sparkles,
  HeartPulse,
  PawPrint,
} from "lucide-react";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { Badge, VERIFICATION_BADGES, type VerificationBadgeKey } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/nanny/save-button";
import { NannyVideo } from "@/components/nanny/nanny-video";
import { createServerSupabase } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage/private-assets";
import { getSession } from "@/lib/auth/dal";
import { loadSavedIds } from "@/lib/shortlist/actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("nanny_profiles")
    .select("first_name, headline, emirate, years_experience")
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle();

  if (!data) return { title: "Profile not found" };

  return {
    title: `${data.first_name ?? "Nanny"} — nanny in ${data.emirate ?? "the UAE"}`,
    description:
      data.headline ??
      `${data.first_name ?? "A nanny"} has ${data.years_experience} years of childcare experience in the UAE.`,
  };
}

export default async function NannyProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const user = await getSession();

  // RLS is what limits an anonymous visitor to the discovery columns; asking
  // for more here would simply be refused, so the query differs by audience.
  const columns = user
    ? "*"
    : [
        "id",
        "first_name",
        "headline",
        "description",
        "emirate",
        "nationality",
        "years_experience",
        "uae_experience_years",
        "arrangement",
        "employment_types",
        "available_from",
        "available_days",
        "salary_expectation_min_aed",
        "salary_expectation_max_aed",
        "languages",
        "english_level",
        "arabic_level",
        "newborn_experience",
        "toddler_experience",
        "school_age_experience",
        "special_needs_experience",
        "has_driving_licence",
        "can_cook",
        "can_housekeep",
        "pet_experience",
        "first_aid_certified",
        "education",
        "certificates",
        "photo_url",
        "status",
      ].join(", ");

  const { data } = await supabase
    .from("nanny_profiles")
    .select(columns)
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle();

  if (!data) notFound();

  const nanny = data as unknown as NannyRow;

  const [photoUrl, videoUrl, { data: badges }, savedIds] = await Promise.all([
    signedUrl("nanny-photos", nanny.photo_url),
    // Only a signed-in visitor gets a video URL at all.
    user ? signedUrl("nanny-videos", nanny.video_url ?? null) : Promise.resolve(null),
    supabase.from("nanny_badges").select("badge").eq("nanny_id", id),
    loadSavedIds([id]),
  ]);

  const isFamily = user?.role === "family";
  const arrangement =
    nanny.arrangement === "live_in"
      ? "Live in"
      : nanny.arrangement === "live_out"
        ? "Live out"
        : "Live in or live out";

  const ages = [
    nanny.newborn_experience && "Newborn (0–12 months)",
    nanny.toddler_experience && "Toddler (1–3 years)",
    nanny.school_age_experience && "School age (4–11 years)",
    nanny.special_needs_experience && "Special needs",
  ].filter(Boolean) as string[];

  const skills = [
    nanny.has_driving_licence && { icon: Car, label: "Driving licence" },
    nanny.can_cook && { icon: ChefHat, label: "Cooking" },
    nanny.can_housekeep && { icon: Sparkles, label: "Light housekeeping" },
    nanny.pet_experience && { icon: PawPrint, label: "Comfortable with pets" },
    nanny.first_aid_certified && { icon: HeartPulse, label: "First aid trained" },
  ].filter(Boolean) as { icon: typeof Car; label: string }[];

  return (
    <>
      <SiteHeader />

      {/* pb-28 reserves room for the sticky action bar so the last section is
          never hidden behind it. */}
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-28 sm:px-8 sm:pt-10 sm:pb-16">
        <Link
          href="/nannies"
          className="tap-target text-sm text-muted underline underline-offset-4"
        >
          ← Back to search
        </Link>

        {/* ---------------- Header ---------------- */}
        <header className="mt-4 flex gap-4 sm:gap-6">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={`${nanny.first_name ?? "Nanny"}'s profile photo`}
              width={112}
              height={112}
              className="size-24 shrink-0 rounded-lg object-cover sm:size-28"
            />
          ) : (
            <span className="grid size-24 shrink-0 place-items-center rounded-lg bg-sage-wash text-sage-deep sm:size-28">
              {nanny.first_name?.[0] ?? "N"}
            </span>
          )}

          <div className="min-w-0">
            <h1 className="text-2xl font-semibold sm:text-3xl">
              {nanny.first_name ?? "Nanny"}
            </h1>
            {nanny.headline && (
              <p className="mt-1 text-sm leading-snug text-muted sm:text-base">
                {nanny.headline}
              </p>
            )}
            <p className="mt-2 text-sm text-muted">
              {[
                nanny.emirate,
                nanny.nationality,
                `${nanny.years_experience} years' experience`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </header>

        {/* Badges are specific claims about what was actually reviewed. */}
        {badges && badges.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {badges.map((b) => {
              const meta = VERIFICATION_BADGES[b.badge as VerificationBadgeKey];
              if (!meta) return null;
              return (
                <Badge key={b.badge} variant={meta.variant} size="sm">
                  {meta.label}
                </Badge>
              );
            })}
          </div>
        )}

        {/* ---------------- Key facts ---------------- */}
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact icon={Home} label="Arrangement" value={arrangement} />
          <Fact
            icon={Clock}
            label="Available"
            value={
              nanny.available_from
                ? new Date(`${nanny.available_from}T00:00:00`) <= new Date()
                  ? "Now"
                  : new Date(`${nanny.available_from}T00:00:00`).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })
                : "Ask her"
            }
          />
          <Fact
            icon={MapPin}
            label="Based in"
            value={nanny.emirate ?? "UAE"}
          />
          <Fact
            icon={LanguagesIcon}
            label="Salary from"
            value={
              nanny.salary_expectation_min_aed
                ? `AED ${nanny.salary_expectation_min_aed.toLocaleString("en-AE")}`
                : "Ask her"
            }
          />
        </dl>

        {/* ---------------- Sections ---------------- */}
        {nanny.description && (
          <Section title="About">
            <p className="leading-relaxed whitespace-pre-line text-muted">
              {nanny.description}
            </p>
          </Section>
        )}

        <Section title="Experience">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-4 border-b border-border pb-2">
              <span className="text-muted">Total experience</span>
              <span className="font-medium">{nanny.years_experience} years</span>
            </li>
            <li className="flex justify-between gap-4 border-b border-border pb-2">
              <span className="text-muted">In the UAE</span>
              <span className="font-medium">{nanny.uae_experience_years} years</span>
            </li>
          </ul>

          {ages.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-medium">Ages cared for</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {ages.map((a) => (
                  <Badge key={a} variant="sage" size="sm">
                    {a}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </Section>

        {skills.length > 0 && (
          <Section title="Skills">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {skills.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5 text-sm">
                  <s.icon className="size-4 shrink-0 text-sage-deep" aria-hidden />
                  {s.label}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Languages">
          <div className="flex flex-wrap gap-2">
            {nanny.languages.map((l) => (
              <Badge key={l} variant="neutral" size="sm">
                {l}
              </Badge>
            ))}
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex justify-between gap-4">
              <span className="text-muted">English</span>
              <span className="font-medium capitalize">{nanny.english_level}</span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-muted">Arabic</span>
              <span className="font-medium capitalize">{nanny.arabic_level}</span>
            </li>
          </ul>
        </Section>

        {(nanny.available_days?.length ?? 0) > 0 && (
          <Section title="Availability">
            <div className="flex flex-wrap gap-2">
              {nanny.available_days!.map((d) => (
                <Badge key={d} variant="neutral" size="sm">
                  {d.slice(0, 3)}
                </Badge>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">{arrangement}</p>
          </Section>
        )}

        {/* Video is behind an account, and never preloads. */}
        {user ? (
          videoUrl && (
            <Section title="Video introduction">
              <NannyVideo src={videoUrl} posterAlt={nanny.first_name ?? "Nanny"} />
            </Section>
          )
        ) : (
          <Section title="Video introduction">
            <p className="text-sm text-muted">
              <Link href="/signup" className="underline underline-offset-4">
                Create a free account
              </Link>{" "}
              to watch her introduction.
            </p>
          </Section>
        )}

        {(nanny.education || (nanny.certificates?.length ?? 0) > 0) && (
          <Section title="Education & certificates">
            {nanny.education && (
              <p className="flex items-center gap-2.5 text-sm">
                <GraduationCap className="size-4 shrink-0 text-sage-deep" aria-hidden />
                {nanny.education}
              </p>
            )}
            {(nanny.certificates?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {nanny.certificates!.map((c) => (
                  <Badge key={c} variant="butter" size="sm">
                    {c}
                  </Badge>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs text-subtle">
              A certificate listed here is what {nanny.first_name ?? "she"} told us. A badge
              above means our team has seen the document itself.
            </p>
          </Section>
        )}

        <p className="mt-10 text-xs leading-relaxed text-subtle">
          NaNanny is a technology platform and is not {nanny.first_name ?? "this nanny"}
          &apos;s employer. Any arrangement is made directly between you and her.
        </p>
      </main>

      {/* Sticky action bar — always reachable, never covering the content
          because the page reserves space for it above. */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md sm:static sm:border-0 sm:bg-transparent">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-5 py-3 sm:px-8 sm:pb-10">
          {isFamily ? (
            <SaveButton nannyId={id} saved={savedIds.has(id)} withLabel />
          ) : !user ? (
            <Link href="/signup" className="shrink-0">
              <Button variant="outline" size="lg">
                Save
              </Button>
            </Link>
          ) : null}

          {user ? (
            <div className="min-w-0 flex-1">
              <Button size="lg" block disabled>
                Message {nanny.first_name ?? ""}
              </Button>
              <p className="mt-1 text-center text-[0.6875rem] text-subtle">
                Messaging opens in the next release
              </p>
            </div>
          ) : (
            <Link href="/signup" className="min-w-0 flex-1">
              <Button size="lg" block>
                Sign up to message
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Home;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

type NannyRow = {
  id: string;
  first_name: string | null;
  headline: string | null;
  description: string | null;
  emirate: string | null;
  nationality: string | null;
  years_experience: number;
  uae_experience_years: number;
  arrangement: string;
  employment_types: string[];
  available_from: string | null;
  available_days: string[] | null;
  salary_expectation_min_aed: number | null;
  salary_expectation_max_aed: number | null;
  languages: string[];
  english_level: string;
  arabic_level: string;
  newborn_experience: boolean;
  toddler_experience: boolean;
  school_age_experience: boolean;
  special_needs_experience: boolean;
  has_driving_licence: boolean;
  can_cook: boolean;
  can_housekeep: boolean;
  pet_experience: boolean;
  first_aid_certified: boolean;
  education: string | null;
  certificates: string[] | null;
  photo_url: string | null;
  video_url?: string | null;
  status: string;
};
