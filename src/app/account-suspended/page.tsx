import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LogoutButton } from "@/components/auth/logout-button";

export const metadata: Metadata = { title: "Account suspended" };

export default function AccountSuspendedPage() {
  return (
    <AuthShell
      title="Your account is suspended"
      subtitle="Access has been paused while we review your account."
    >
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-muted">
          If you think this is a mistake, reply to the email we sent you or contact
          support and we will look into it.
        </p>
        <LogoutButton variant="outline" />
      </div>
    </AuthShell>
  );
}
