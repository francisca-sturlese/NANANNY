import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Chats" };

/**
 * Every conversation on the platform, read-only.
 *
 * The per-job view only sees chats born from a job post; the four real ones
 * so far all started from profiles, which made "where are the chats" a fair
 * question with an empty answer. This page answers it without a filter.
 * Same rules as the job view: read for moderation and disputes, said out
 * loud, and every look is logged.
 */
export default async function AdminConversationsPage() {
  const admin = await requireAdmin("/admin/conversations");
  const service = createServiceClient();
  const supabase = await createServerSupabase();

  const { data: conversations } = await service
    .from("conversations")
    .select(
      "id, created_at, blocked_at, last_message_at, job_id, jobs(title), family_profiles(display_name, user_id), nanny_profiles!conversations_nanny_id_fkey(first_name), messages(id, body, sender_id, created_at)",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false });

  const rows = conversations ?? [];

  // One row per conversation shown, deduplicated inside the function: the
  // reading is happening, so the log says so, attributed to this session.
  await Promise.all(
    rows.map((c) =>
      supabase.rpc("record_conversation_read", { p_conversation_id: c.id }),
    ),
  );

  return (
    <AdminShell active="/admin/conversations" name={admin.firstName ?? "Admin"}>
      <h1 className="text-2xl font-semibold sm:text-3xl">Chats</h1>
      <p className="mt-3 max-w-2xl rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted">
        Private messages between real people, shown read-only for moderation and
        dispute resolution. Every time this page is opened, the reading is
        recorded.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-muted">
          No conversations yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((conversation) => {
            const family = conversation.family_profiles as {
              display_name?: string;
              user_id?: string;
            } | null;
            const familyName = family?.display_name ?? "Family";
            const familyUserId = family?.user_id ?? null;
            const nannyName =
              (conversation.nanny_profiles as { first_name?: string | null } | null)
                ?.first_name ?? "Nanny";
            const jobTitle = (conversation.jobs as { title?: string } | null)?.title;
            const messages = [...(conversation.messages ?? [])].sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            );
            return (
              <li
                key={conversation.id}
                className="rounded-lg border border-border bg-background p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">
                    {familyName} ↔ {nannyName}
                  </h2>
                  <span className="text-xs text-muted">
                    {messages.length} {messages.length === 1 ? "message" : "messages"}
                  </span>
                  {jobTitle ? (
                    <Badge variant="neutral" size="sm">
                      {jobTitle}
                    </Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">
                      from profile
                    </Badge>
                  )}
                  {conversation.blocked_at && (
                    <Badge variant="peach" size="sm">
                      blocked
                    </Badge>
                  )}
                </div>

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
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
