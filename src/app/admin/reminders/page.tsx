import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { RemindersForm } from "@/components/admin/reminders-form";
import { Card, CardBody } from "@/components/ui/card";

export const metadata: Metadata = { title: "Reminders" };
export const dynamic = "force-dynamic";

/**
 * The reminder settings, and the evidence of what they have actually done.
 *
 * The form on its own would be a page that always looks fine. The list of what
 * was sent is what tells somebody the difference between a setting that works
 * and one that has been quietly reaching nobody for a fortnight, which is the
 * failure this feature is most likely to have.
 */
export default async function AdminRemindersPage() {
  const admin = await requireAdmin("/admin/reminders");
  const supabase = await createServerSupabase();

  const [{ data: config }, { count: subscriberCount }, { data: recent }] = await Promise.all([
    supabase.from("reminder_config").select("*").single(),
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "past_due"]),
    supabase
      .from("email_events")
      .select("created_at, email_type, recipient, status")
      .like("email_type", "reminder_%")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (!config) return null;

  return (
    <AdminShell active="/admin/reminders" name={admin.firstName ?? "Admin"}>
      <h1 className="text-2xl font-semibold sm:text-3xl">Reminders</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
        Two emails, sent to people who have gone quiet. One says somebody made a
        profile and then posted nothing. The other says a message is waiting that
        has not been opened. Nothing here is a marketing email, and there is no
        third one.
      </p>

      <div className="mt-6 max-w-xl">
        <Card>
          <CardBody>
            <RemindersForm
              audience={config.audience}
              nudgeAfterHours={config.nudge_after_hours}
              unreadAfterHours={config.unread_after_hours}
              minGapHours={config.min_gap_hours}
              subscriberCount={subscriberCount ?? 0}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 max-w-xl">
        <Card>
          <CardBody>
            <h2 className="text-base font-semibold">What has gone out</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              The last ten. A failure stays on this list with its reason rather
              than disappearing, so &quot;she never got it&quot; is a question
              with an answer.
            </p>

            {recent && recent.length > 0 ? (
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {recent.map((event, index) => (
                  <li
                    key={`${event.created_at}-${index}`}
                    className="flex items-baseline justify-between gap-4 py-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{event.recipient}</span>
                      <span className="text-xs text-muted">
                        {event.email_type.replace("reminder_", "").replace("_", " ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={
                          event.status === "failed" ? "text-danger" : "text-muted"
                        }
                      >
                        {event.status}
                      </span>
                      <span className="block text-xs text-subtle">
                        {new Date(event.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted">
                Nothing has been sent yet. Either nobody has been quiet long
                enough, or nothing is calling the scheduled run. See
                docs/deployment.md for what has to be pointed at it.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
