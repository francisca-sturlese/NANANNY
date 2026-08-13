import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const defaultRole = role === "nanny" ? "nanny" : "family";

  return (
    <AuthShell
      title="Create your NaNanny account"
      subtitle="Browsing is free. Families get their first three nanny contacts free too."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="tap-target font-medium text-foreground underline">
            Log in
          </Link>
        </>
      }
      aside={
        <blockquote className="max-w-sm">
          <p className="text-2xl leading-snug font-medium">Families pay. Nannies are free.</p>
          <footer className="mt-4 text-sm text-muted">
            Nannies never pay to create a profile, appear in search, receive matches or reply
            to families.
          </footer>
        </blockquote>
      }
    >
      <SignUpForm defaultRole={defaultRole} />
    </AuthShell>
  );
}
