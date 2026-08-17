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
import { ContactSheet } from "@/components/messaging/contact-sheet";
import { loadContactState } from "@/lib/messaging/actions";
import { ReportButton } from "@/components/safety/report-button";
import { getPricingConfig } from "@/lib/pricing";
import { visaLabel, visaNote } from "@/lib/nanny/visa";
import { experienceLong, experienceClause } from "@/lib/nanny/experience";
import { isVerified } from "@/lib/nanny/discoverable";
import { DISCOVERABLE_STATUSES } from "@/lib/nanny/discoverable";
import { NannyPhotoFallback } from "@/components/nanny/photo-fallback";

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
    .in("status", DISCOVERABLE_STATUSES)
    .maybeSingle();

  if (!data) return { title: "Profile not found" };

  return {
    title: `${data.first_name ?? "Nanny"}, nanny in ${data.emirate ?? "the UAE"}`,
    description:
      data.headline ??
      [
        data.first_name ?? "A nanny",
        experienceClause(data.years_experience)
          ? `has ${experienceClause(data.years_experience)} in the UAE.`
          : "is looking for her first family in the UAE.",
      ].join(" "),
    /**
     * Readable without an account, but never indexed.
     *
     * A family should be able to see who is available before signing up. That
     * is not the same as leaving a real person's photo, first name and emirate
     * in a search index long after she has found a job. The search page carries
     * the same value for a visitor arriving from Google without pinning anyone
     * to a URL. Mirrored in robots.ts and sitemap.ts.
     */
    robots: { index: false, follow: true },
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
        "visa_status",
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
    .in("status", DISCOVERABLE_STATUSES)
    .maybeSingle();

  if (!data) notFound();

  const nanny = data as unknown as NannyRow;

  const [photoUrl, videoUrl, { data: badges }, savedIds, contacts, pricing] = await Promise.all([
    signedUrl("nanny-photos", nanny.photo_url),
    // Only a signed-in visitor gets a video URL at all.
    user ? signedUrl("nanny-videos", nanny.video_url ?? null) : Promise.resolve(null),
    supabase.from("nanny_badges").select("badge").eq("nanny_id", id),
    loadSavedIds([id]),
    loadContactState(),
    getPricingConfig(),
  ]);

  const isFamily = user?.role === "family";
  const arrangement =
    nanny.arrangement === "live_in"
      ? "Live in"
      : nanny.arrangement === "live_out"
        ? "Live out"
        : "Live in or live out";

  const ages = [
    nanny.newborn_experience && "Newborn (0 to 12 months)",
    nanny.toddler_experience && "Toddler (1 to 3 years)",
    nanny.school_age_experience && "School age (4 to 11 years)",
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
            <NannyPhotoFallback className="size-24 rounded-lg sm:size-28" />
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
                experienceLong(nanny.years_experience),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </header>

        {/* Founder's call: the earlier version ("nobody has looked at this
            profile") read as a warning and pushed families away from exactly
            the people who just arrived. One neutral line keeps the honesty —
            no badge is claimed that was not earned — without the deterrent. */}
        {!isVerified(nanny.status) && (
          <div className="mt-5 rounded-md border border-border bg-surface px-4 py-3">
            <p className="text-sm leading-relaxed text-muted">
              Verification in progress. Verified badges appear here as our team
              completes its checks.
            </p>
          </div>
        )}

        {/* Kept apart from the badges below, and worded as hers rather than
            ours. A family reading this must not come away thinking anyone
            checked it: the visa document and its review are what verification
            means, and this is not that. */}
        {visaLabel(nanny.visa_status) && (
          <div className="mt-5 rounded-md border border-border bg-surface px-4 py-3">
            <p className="text-sm font-medium">
              Visa: {visaLabel(nanny.visa_status)}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {visaNote(nanny.visa_status)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-subtle">
              She told us this herself. We have not checked it. Ask to see the
              document before you agree anything.
            </p>
          </div>
        )}

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
              <span className="font-medium">
                {nanny.years_experience > 0 ? `${nanny.years_experience} years` : "First role"}
              </span>
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

        {user && (
          <div className="mt-10 border-t border-border pt-5">
            <ReportButton targetKind="profile" targetId={id} what="this profile" />
          </div>
        )}

        <p className="mt-6 text-xs leading-relaxed text-subtle">
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

          {isFamily ? (
            <div className="min-w-0 flex-1">
              <ContactSheet
                nannyId={id}
                nannyName={nanny.first_name ?? "her"}
                contactsRemaining={contacts?.free_contacts_remaining ?? pricing.freeContacts}
                subscribed={Boolean(contacts?.subscription_active)}
                promoActive={Boolean(contacts?.promo_active)}
                pricing={pricing}
                source="profile"
              />
            </div>
          ) : user?.role === "nanny" ? (
            // A nanny on a colleague's profile: conversations start from
            // families, so her door is the job board, not a dead sentence.
            <Link href="/jobs" className="min-w-0 flex-1">
              <Button size="lg" block>
                See open jobs
              </Button>
            </Link>
          ) : user ? (
            <p className="flex-1 text-center text-sm text-muted">
              Only families can start a conversation.
            </p>
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
  visa_status: string;
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
