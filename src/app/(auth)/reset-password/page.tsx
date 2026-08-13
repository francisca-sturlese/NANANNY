import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { getSession } from "@/lib/auth/dal";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The recovery link signs the user in before landing here. No session means
  // the link was never followed, or it expired.
  const user = await getSession();

  if (!user) {
    return (
      <AuthShell
        title="This link has expired"
        subtitle="Password reset links are single use and time limited."
        footer={
          <Link href="/forgot-password" className="tap-target font-medium text-foreground underline">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-muted">
          Request a fresh link and we&apos;ll email it straight away.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle={`You're resetting the password for ${user.email}.`}
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
