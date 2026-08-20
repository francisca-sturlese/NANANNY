import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { InviteForm, RevokeInviteButton } from "@/components/admin/invite-actions";
import { whenDay } from "@/lib/admin/when";

export const metadata: Metadata = { title: "Invites" };

/**
 * Inviting people to run the platform.
 *
 * Every admin can read this page; only a super admin sees the form and the
 * revoke buttons, and the database enforces the same line independently. The
 * role never travels in the invite email: it is applied at signup, server
 * side, only when the registered address matches.
 */
export default async function AdminInvitesPage() {
  const admin = await requireAdmin("/admin/invites");
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("admin_invites")
    .select("id, email, role, created_at, expires_at, accepted_at, revoked_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const invites = data ?? [];
  const isSuper = admin.role === "super_admin";

  const stateOf = (invite: (typeof invites)[number]) => {
    if (invite.accepted_at) return "accepted";
    if (invite.revoked_at) return "revoked";
    if (new Date(invite.expires_at) < new Date()) return "expired";
    return "pending";
  };

  return (
    <AdminShell narrow active="/admin/invites" name={admin.firstName ?? "Admin"}>
      <h1 className="text-2xl font-semibold sm:text-3xl">Invites</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Invite somebody to the team by email. The role is attached to the address and
        applied automatically when that exact address signs up. Every invite,
        acceptance and revocation is written to the audit log.
      </p>

      {isSuper ? (
        <div className="mt-6">
          <InviteForm />
        </div>
      ) : (
        <p className="mt-6 rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted">
          Only a super admin can send or revoke invites.
        </p>
      )}

      <div className="mt-8 space-y-2">
        {invites.length === 0 && (
          <p className="rounded-md border border-border p-4 text-sm text-muted">
            No invites yet.
          </p>
        )}
        {invites.map((invite) => {
          const state = stateOf(invite);
          return (
            <div
              key={invite.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{invite.email}</p>
                <p className="text-xs text-muted">
                  {invite.role === "super_admin" ? "super admin" : "admin"} · invited{" "}
                  {whenDay(invite.created_at)}
                  {state === "pending" &&
                    ` · expires ${whenDay(invite.expires_at)}`}
                </p>
              </div>

              <Badge
                variant={state === "accepted" ? "sage" : state === "pending" ? "butter" : "neutral"}
                size="sm"
              >
                {state}
              </Badge>

              {isSuper && state === "pending" && <RevokeInviteButton inviteId={invite.id} />}
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
