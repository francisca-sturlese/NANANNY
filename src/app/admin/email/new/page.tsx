import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { AdminShell } from "@/components/admin/admin-shell";
import { MailComposer } from "@/components/admin/mail-composer";

export const metadata: Metadata = { title: "New email" };

export default async function ComposeMailPage() {
  const admin = await requireAdmin("/admin/email/new");

  return (
    <AdminShell active="/admin/email" name={admin.firstName ?? "Admin"} narrow>
      <Link href="/admin/email" className="text-sm text-muted underline underline-offset-4">
        Back to the mailbox
      </Link>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">New email</h1>
      <p className="mt-1 text-sm text-muted">
        Sent from hello@nananny.com. Replies come back to this mailbox.
      </p>
      <div className="mt-6">
        <MailComposer />
      </div>
    </AdminShell>
  );
}
