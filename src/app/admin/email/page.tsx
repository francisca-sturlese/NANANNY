import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Email" };

/**
 * The product's own mailbox.
 *
 * Inbound rows are written by the mail worker the moment Cloudflare hands it
 * a message; outbound rows by the send action. Everything renders as text:
 * the sender of an inbound mail is the definition of untrusted, and this page
 * lives inside the session that can suspend users and change prices.
 */

type MailRow = {
  id: string;
  direction: string;
  thread_key: string;
  from_address: string;
  to_address: string;
  subject: string;
  text_body: string;
  read_at: string | null;
  created_at: string;
};

export default async function AdminEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ box?: string }>;
}) {
  const admin = await requireAdmin("/admin/email");
  const { box } = await searchParams;
  const direction = box === "sent" ? "out" : "in";

  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("admin_mail_list", {
    p_direction: direction,
    p_limit: 200,
  });
  const rows = (data ?? []) as MailRow[];

  // One line per thread, newest first, like any mailbox. Grouped here rather
  // than in SQL because two hundred rows is nothing and the page already has
  // them in hand.
  const threads = new Map<string, { latest: MailRow; unread: number; count: number }>();
  for (const row of rows) {
    const entry = threads.get(row.thread_key);
    if (!entry) {
      threads.set(row.thread_key, {
        latest: row,
        unread: row.direction === "in" && !row.read_at ? 1 : 0,
        count: 1,
      });
    } else {
      entry.count += 1;
      if (row.direction === "in" && !row.read_at) entry.unread += 1;
      if (row.created_at > entry.latest.created_at) entry.latest = row;
    }
  }
  const list = [...threads.values()].sort((a, b) =>
    b.latest.created_at.localeCompare(a.latest.created_at),
  );

  return (
    <AdminShell active="/admin/email" name={admin.firstName ?? "Admin"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">Email</h1>
        <Link
          href="/admin/email/new"
          className="rounded-pill bg-foreground px-4 py-2 text-sm font-semibold text-background"
        >
          Compose
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        hello@nananny.com. Everything that arrives is also forwarded to the usual
        Gmail, so nothing here is the only copy.
      </p>

      <div className="mt-6 flex gap-2">
        <TabLink href="/admin/email" active={direction === "in"}>
          Inbox
        </TabLink>
        <TabLink href="/admin/email?box=sent" active={direction === "out"}>
          Sent
        </TabLink>
      </div>

      <div className="mt-4 space-y-2">
        {list.length === 0 && (
          <p className="rounded-md border border-border bg-background p-4 text-sm text-muted">
            {direction === "in" ? "Nothing in the inbox yet." : "Nothing sent from here yet."}
          </p>
        )}
        {list.map(({ latest, unread, count }) => {
          const counterpart = direction === "in" ? latest.from_address : latest.to_address;
          return (
            <Link
              key={latest.thread_key}
              href={`/admin/email/thread/${encodeURIComponent(latest.thread_key)}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-border bg-background p-4 hover:border-border-strong"
            >
              <span
                className={`min-w-0 flex-shrink-0 truncate text-sm sm:w-56 ${unread ? "font-semibold" : "text-muted"}`}
              >
                {counterpart}
              </span>
              <span className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-semibold" : ""}`}>
                {latest.subject || "(no subject)"}
                <span className="ml-2 font-normal text-subtle">
                  {latest.text_body.slice(0, 90)}
                </span>
              </span>
              {count > 1 && (
                <Badge variant="neutral" size="sm">
                  {count}
                </Badge>
              )}
              {unread > 0 && (
                <Badge variant="butter" size="sm">
                  new
                </Badge>
              )}
              <span className="text-xs whitespace-nowrap text-subtle">
                {new Date(latest.created_at).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </Link>
          );
        })}
      </div>
    </AdminShell>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-pill px-4 py-1.5 text-sm font-medium ${
        active ? "bg-foreground text-background" : "border border-border text-muted"
      }`}
    >
      {children}
    </Link>
  );
}
