import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Job conversations" };

/**
 * The conversations a job post started, readable by an admin.
 *
 * Read-only on purpose: the operator's job here is moderation and support,
 * never speaking as either side. These are private messages between real
 * people; the page exists because the person running the marketplace answers
 * for what happens on it, and it says so out loud at the top rather than
 * pretending the reading is not happening.
 */
export default async function AdminJobConversationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin(`/admin/jobs/${id}/conversations`);
  const service = createServiceClient();

  const { data: job } = await service
    .from("jobs")
    .select("id, title, status, family_id, family_profiles(display_name, user_id)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();

  // "The chats for this job" means, to the operator, the chats of the family
  // that posted it: a family hiring through a post talks to nannies wherever
  // the conversation technically started, and a strict job_id match showed
  // an empty page next to four real conversations.
  const { data: conversations } = await service
    .from("conversations")
    .select(
      "id, created_at, blocked_at, job_id, nanny_id, nanny_profiles!conversations_nanny_id_fkey(first_name), messages(id, body, sender_id, created_at)",
    )
    .eq("family_id", job.family_id)
    .order("created_at", { ascending: false });

  const rows = conversations ?? [];

  /**
   * Reading is recorded, like every other administrative act.
   *
   * We ask a nanny to keep her phone number out of her profile and to talk to
   * families here instead, on the promise that she keeps a record and can stop
   * anyone. A product that says that and then reads her messages with no record
   * of its own is telling her something it does not apply to itself.
   *
   * It records rather than prevents: somebody resolving a report should read
   * the thread. What has to exist afterwards is an answer to who read it and
   * when, and it has to exist before anybody thinks to ask.
   *
   * Through the admin's own session, not the service client, so the row carries
   * who did it. Deduped to one an hour inside the function, because a refresh
   * is not a second reading.
   */
  const supabase = await createServerSupabase();
  await Promise.all(
    rows.map((conversation) =>
      supabase.rpc("record_conversation_read", { p_conversation_id: conversation.id }),
    ),
  );
  const family = job.family_profiles as { display_name?: string; user_id?: string } | null;
  const familyName = family?.display_name ?? "The family";
  const familyUserId = family?.user_id ?? null;

  return (
    <AdminShell active="/admin/jobs" name={admin.firstName ?? "Admin"}>
      <Link
        href="/admin/jobs"
        className="tap-target text-sm text-muted underline underline-offset-4"
      >
        ← All jobs
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold sm:text-3xl">{job.title}</h1>
        <Badge variant={job.status === "active" ? "sage" : "neutral"} size="sm">
          {job.status}
        </Badge>
      </div>

      <p className="mt-3 max-w-2xl rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted">
        Private messages between {familyName} and the nannies on this post, shown
        read-only for moderation and support. Neither side is told an admin read
        them; treat them accordingly.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-muted">
          No conversations started from this job yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-background">
          {rows.map((conversation) => {
            const nannyName =
              (conversation.nanny_profiles as { first_name?: string | null } | null)
                ?.first_name ?? "Nanny";
            const messages = [...(conversation.messages ?? [])].sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            );
            return (
              <li key={conversation.id} className="px-4">
                {/* One line per thread, closed: the page is an index first
                    and a reader second. Density is what keeps fifty threads
                    scannable. */}
                <details className="group py-2.5">
                  <summary className="tap-target flex cursor-pointer list-none items-baseline gap-2.5 [&::-webkit-details-marker]:hidden">
                    <span className="truncate text-sm font-medium underline-offset-4 hover:underline group-open:no-underline">
                      {nannyName}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {messages.length} msg
                    </span>
                    {conversation.blocked_at && (
                      <Badge variant="peach" size="sm">
                        blocked
                      </Badge>
                    )}
                    {messages.length > 0 && (
                      <span className="ml-auto shrink-0 text-xs text-subtle">
                        {new Date(messages[messages.length - 1].created_at).toLocaleDateString("en-GB")}
                      </span>
                    )}
                  </summary>

                <ul className="mt-3 space-y-2">
                  {messages.map((message) => {
                    const fromFamily =
                      familyUserId !== null && message.sender_id === familyUserId;
                    return (
                      <li
                        key={message.id}
                        className={`rounded-md px-3 py-2 ${
                          fromFamily ? "bg-surface" : "bg-sage-wash"
                        }`}
                      >
                        <p className="text-xs font-medium text-muted">
                          {fromFamily ? familyName : nannyName}
                        </p>
                        <p className="mt-0.5 text-sm leading-relaxed">{message.body}</p>
                        <p className="mt-1 text-[0.65rem] text-subtle">
                          {new Date(message.created_at).toLocaleString("en-GB")}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
