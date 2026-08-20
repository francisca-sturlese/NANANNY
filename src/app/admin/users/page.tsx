import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { UserActions } from "@/components/admin/user-actions";
import { whenDay } from "@/lib/admin/when";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string }>;
}) {
  const { q, role, status } = await searchParams;
  const admin = await requireAdmin("/admin/users");
  const supabase = await createServerSupabase();

  let query = supabase
    .from("users")
    .select("id, email, role, status, first_name, last_name, phone, location, created_at, suspended_reason")
    .order("created_at", { ascending: false })
    .limit(100);

  // Search across the fields an operator actually has to hand: an email from a
  // support message, or a name from a report.
  if (q) {
    const term = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(`email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`);
  }
  if (role === "family" || role === "nanny" || role === "admin") query = query.eq("role", role);
  if (status === "active" || status === "suspended") query = query.eq("status", status);

  const { data: users } = await query;
  const rows = users ?? [];

  return (
    <AdminShell active="/admin/users" name={admin.firstName ?? "Admin"}>
      <h1 className="text-2xl font-semibold sm:text-3xl">Users</h1>

      <form method="get" className="mt-5 flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Email or name"
          className="min-w-48 flex-1"
        />
        <Select name="role" defaultValue={role ?? ""} className="w-auto min-w-32">
          <option value="">Any role</option>
          <option value="family">Family</option>
          <option value="nanny">Nanny</option>
          <option value="admin">Admin</option>
        </Select>
        <Select name="status" defaultValue={status ?? ""} className="w-auto min-w-32">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Button type="submit">Search</Button>
      </form>

      <p className="mt-4 text-sm text-muted">
        {rows.length === 100 ? "First 100 matches" : `${rows.length} ${rows.length === 1 ? "user" : "users"}`}
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border-strong bg-background p-8 text-center text-sm text-muted">
          Nobody matches that search.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {rows.map((user) => (
            <li key={user.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
                      </Link>
                    </h2>
                    <Badge variant="neutral" size="sm">
                      {user.role}
                    </Badge>
                    {user.status === "suspended" && (
                      <Badge variant="peach" size="sm">
                        suspended
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">{user.email}</p>
                  <p className="mt-0.5 text-xs text-subtle">
                    {[
                      user.location,
                      user.phone,
                      `joined ${whenDay(user.created_at)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {user.suspended_reason && (
                    <p className="mt-2 text-xs text-peach-deep">
                      Suspended: {user.suspended_reason}
                    </p>
                  )}
                </div>

                {user.role !== "admin" && user.role !== "super_admin" && (
                  <UserActions userId={user.id} status={user.status} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
