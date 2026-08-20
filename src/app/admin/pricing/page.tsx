import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { PricingForm } from "@/components/admin/pricing-form";
import { PromoForm } from "@/components/admin/promo-form";
import { getPromo } from "@/lib/promo";
import { Card, CardBody } from "@/components/ui/card";
import { whenExact } from "@/lib/admin/when";

export const metadata: Metadata = { title: "Pricing" };

export default async function AdminPricingPage() {
  const admin = await requireAdmin("/admin/pricing");
  const supabase = await createServerSupabase();

  const [{ data: config }, { data: recentChanges }, promo] = await Promise.all([
    supabase.from("pricing_config").select("*").single(),
    supabase
      .from("audit_logs")
      .select("created_at, before_state, after_state")
      .eq("action", "pricing_changed")
      .order("created_at", { ascending: false })
      .limit(5),
    getPromo(),
  ]);

  if (!config) return null;

  return (
    <AdminShell narrow active="/admin/pricing" name={admin.firstName ?? "Admin"}>
      <h1 className="text-2xl font-semibold sm:text-3xl">Pricing</h1>
      <p className="mt-1 text-sm text-muted">
        These values are read by every screen that shows a price. Nothing is hardcoded, so
        a change here is live everywhere the moment you save it.
      </p>

      <div className="mt-6">
        <Card>
          <CardBody>
            <PricingForm
              freeContacts={config.free_contacts}
              weeklyPrice={Number(config.weekly_price_aed)}
              monthlyPrice={Number(config.monthly_price_aed)}
              weeklyEnabled={config.weekly_enabled}
              monthlyEnabled={config.monthly_enabled}
              monthlyIsBestValue={config.monthly_is_best_value}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardBody>
            <h2 className="text-base font-semibold">Launch window</h2>
            <p className="mt-1 mb-5 text-sm leading-relaxed text-muted">
              While this is open, contacting a nanny is free for everyone and none
              of it counts against a family&apos;s free contacts. When it closes,
              every family still has its full allowance.
            </p>
            <PromoForm
              startsAt={promo.startsAt}
              endsAt={promo.endsAt}
              label={promo.label}
              active={promo.active}
            />
          </CardBody>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="eyebrow">Recent changes</h2>
        {recentChanges && recentChanges.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {recentChanges.map((change, i) => {
              const before = change.before_state as Record<string, unknown> | null;
              const after = change.after_state as Record<string, unknown> | null;
              return (
                <li key={i} className="rounded-md border border-border bg-background p-3 text-sm">
                  <p className="text-xs text-subtle">
                    {whenExact(change.created_at)}
                  </p>
                  <p className="mt-1">
                    {String(before?.free_contacts ?? "?")} free contacts,{" "}
                    {String(before?.weekly_price_aed ?? "?")} /{" "}
                    {String(before?.monthly_price_aed ?? "?")}
                    {" → "}
                    {String(after?.free_contacts ?? "?")} free contacts,{" "}
                    {String(after?.weekly_price_aed ?? "?")} /{" "}
                    {String(after?.monthly_price_aed ?? "?")}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No changes recorded yet.</p>
        )}
      </section>
    </AdminShell>
  );
}
