import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { DISCOVERABLE_STATUSES } from "@/lib/nanny/discoverable";
import { Badge } from "@/components/ui/badge";
import { UserActions } from "@/components/admin/user-actions";

export const metadata: Metadata = { title: "User" };

/**
 * One person, one page.
 *
 * The Users list answers "who is here"; this answers "who is this". Identity
 * and contacts, then whatever their role makes of them: a nanny gets her
 * profile state and the jump to the page families see, a family gets its
 * household and its job posts. The actions are the same ones the list has,
 * because suspending somebody is naturally done while looking at them.
 */
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin(`/admin/users/${id}`);
  const supabase = await createServerSupabase();

  const { data: user } = await supabase
    .from("users")
    .select(
      "id, email, role, status, first_name, last_name, phone, location, created_at, suspended_reason",
    )
    .eq("id", id)
    .maybeSingle();

  if (!user) notFound();

  const [{ data: nanny }, { data: family }, { data: notes }] = await Promise.all([
    supabase
      .from("nanny_profiles")
      .select(
        "id, status, profile_completion, first_name, headline, emirate, nationality, years_experience, visa_status, created_at",
      )
      .eq("user_id", id)
      .maybeSingle(),
    supabase
      .from("family_profiles")
      .select("id, display_name, emirate, area, children_count, created_at")
      .eq("user_id", id)
      .maybeSingle(),
    supabase
      .from("admin_notes")
      .select("id, body, created_at")
      .eq("subject_user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const { data: jobs } = family
    ? await supabase
        .from("jobs")
        .select("id, title, status, created_at")
        .eq("family_id", family.id)
        .order("created_at", { ascending: false })
    : { data: null };

  const fullName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  return (
    <AdminShell active="/admin/users" name={admin.firstName ?? "Admin"}>
      <Link
        href="/admin/users"
        className="tap-target text-sm text-muted underline underline-offset-4"
      >
        ← All users
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold sm:text-3xl">{fullName}</h1>
        <Badge variant="neutral" size="sm">
          {user.role}
        </Badge>
        {user.status === "suspended" && (
          <Badge variant="peach" size="sm">
            suspended
          </Badge>
        )}
      </div>

      <div className="mt-4 space-y-1 text-sm">
        <p className="text-muted">{user.email}</p>
        {user.phone && <p className="text-muted">{user.phone}</p>}
        <p className="text-muted">
          {user.location ? `${user.location} · ` : ""}joined{" "}
          {new Date(user.created_at).toLocaleDateString("en-GB")}
        </p>
        {user.suspended_reason && (
          <p className="rounded-md border border-peach bg-peach-wash px-3 py-2">
            Suspended: {user.suspended_reason}
          </p>
        )}
      </div>

      {nanny && (
        <section className="mt-6 rounded-lg border border-border bg-background p-4">
          <h2 className="font-semibold">Nanny profile</h2>
          <p className="mt-1 text-sm text-muted">
            {[
              `status ${nanny.status}`,
              `${nanny.profile_completion}% complete`,
              nanny.emirate,
              nanny.nationality,
              nanny.visa_status ? `visa: ${nanny.visa_status.replace(/_/g, " ")}` : null,
              `${nanny.years_experience} yrs experience`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {nanny.headline && <p className="mt-2 text-sm">{nanny.headline}</p>}
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {/* Only when the page exists. A rejected or draft profile is not
                discoverable, so this link answered 404, and an admin reading
                "open her profile page" next to a rejected profile reasonably
                concludes the rejected profile is still up. Federico did. */}
            {DISCOVERABLE_STATUSES.includes(
              nanny.status as (typeof DISCOVERABLE_STATUSES)[number],
            ) ? (
              <Link href={`/nannies/${nanny.id}`} className="underline underline-offset-4">
                Open her profile page
              </Link>
            ) : (
              <span className="text-muted">
                Not visible to families while {nanny.status.replace("_", " ")}
              </span>
            )}
            {nanny.status === "submitted" && (
              <Link href="/admin/review" className="underline underline-offset-4">
                She is waiting in the review queue
              </Link>
            )}
          </div>
        </section>
      )}

      {family && (
        <section className="mt-6 rounded-lg border border-border bg-background p-4">
          <h2 className="font-semibold">{family.display_name}</h2>
          <p className="mt-1 text-sm text-muted">
            {[family.area, family.emirate].filter(Boolean).join(", ") || "No area given"}
            {` · ${family.children_count} ${family.children_count === 1 ? "child" : "children"}`}
            {` · family since ${new Date(family.created_at).toLocaleDateString("en-GB")}`}
          </p>
          {(jobs ?? []).length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {(jobs ?? []).map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/jobs?q=${encodeURIComponent(job.title)}`}
                    className="underline underline-offset-4"
                  >
                    {job.title}
                  </Link>
                  <Badge variant={job.status === "active" ? "sage" : "neutral"} size="sm">
                    {job.status}
                  </Badge>
                  <Link
                    href={`/admin/jobs/${job.id}/applications`}
                    className="text-xs text-muted underline underline-offset-4"
                  >
                    applications
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No job posts.</p>
          )}
        </section>
      )}

      {!nanny && !family && user.role !== "admin" && user.role !== "super_admin" && (
        <p className="mt-6 rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted">
          Signed up and never opened the onboarding. The reminder system knows about
          them.
        </p>
      )}

      <section className="mt-6">
        <h2 className="font-semibold">Actions</h2>
        <div className="mt-3">
          <UserActions userId={user.id} status={user.status} />
        </div>
      </section>

      {(notes ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">Notes</h2>
          <ul className="mt-2 space-y-2">
            {(notes ?? []).map((note) => (
              <li key={note.id} className="rounded-md border border-border p-3 text-sm">
                <p>{note.body}</p>
                <p className="mt-1 text-xs text-muted">
                  {new Date(note.created_at).toLocaleDateString("en-GB")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AdminShell>
  );
}
