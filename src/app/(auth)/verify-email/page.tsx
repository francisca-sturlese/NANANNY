import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { getSession, homeForRole } from "@/lib/auth/dal";
import { redirect } from "next/navigation";
import { ResendVerificationForm } from "./resend-form";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const { email, error } = await searchParams;
  const user = await getSession();

  // Already verified — nothing to do here.
  if (user?.emailVerified) redirect(homeForRole(user.role));

  const address = user?.email ?? email;

  return (
    <AuthShell
      title="Check your inbox"
      subtitle={
        address
          ? `We sent a verification link to ${address}. Click it to activate your account.`
          : "We sent you a verification link. Click it to activate your account."
      }
      footer={
        <>
          Wrong address?{" "}
          <Link href="/signup" className="tap-target font-medium text-foreground underline">
            Sign up again
          </Link>{" "}
          ·{" "}
          <Link href="/login" className="tap-target font-medium text-foreground underline">
            Log in
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        {error === "invalid_link" && (
          <p
            role="alert"
            className="rounded-md border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger"
          >
            That link is no longer valid. Verification links can only be used once and
            expire after a while — request a new one below.
          </p>
        )}

        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Didn&apos;t get it?</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>Check your spam or promotions folder.</li>
            <li>The link is valid for one hour.</li>
          </ul>
        </div>

        <ResendVerificationForm defaultEmail={address} />
      </div>
    </AuthShell>
  );
}
