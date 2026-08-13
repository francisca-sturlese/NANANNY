import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only a relative path survives; the action re-checks this too.
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to pick up where you left off."
      footer={
        <>
          New to NaNanny?{" "}
          <Link href="/signup" className="tap-target font-medium text-foreground underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={safeNext} />
    </AuthShell>
  );
}
