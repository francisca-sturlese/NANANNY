/**
 * The webhook, driven the way Stripe drives it.
 *
 * No Stripe account is needed for any of this. Payloads are signed here with
 * the same secret the app verifies against, so what is under test is the real
 * signature check, the real handler and the real database function. Forging a
 * signature is exactly what an attacker would try, and this proves it fails.
 *
 * What a Stripe account would add is confidence that Stripe's own payloads have
 * the shape assumed here. That gap is real and is named at the end of the run.
 *
 * Run:  node scripts/e2e-billing.mjs
 */

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const FAMILY = "family3@nananny.example.test";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SECRET = env.STRIPE_WEBHOOK_SECRET;
if (!SECRET) {
  console.error(
    "STRIPE_WEBHOOK_SECRET is not set in .env.local. Set any value locally: the\n" +
      "point of this suite is that the app verifies against whatever it is given.",
  );
  process.exit(1);
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Stripe's scheme: the signed payload is `${timestamp}.${body}`. */
function sign(body, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function post(event, { secret, timestamp, signature } = {}) {
  const body = JSON.stringify(event);
  const header = signature ?? sign(body, secret ?? SECRET, timestamp);
  const response = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body,
  });
  return { status: response.status, body: await response.text() };
}

// ------------------------------------------------------------------ fixtures
const { data: familyUser } = await db.from("users").select("id").eq("email", FAMILY).single();
const { data: family } = await db
  .from("family_profiles")
  .select("id")
  .eq("user_id", familyUser.id)
  .single();

// Start from a clean slate so a rerun measures this run.
await db.from("subscription_events").delete().eq("family_id", family.id);
await db.from("payments").delete().eq("family_id", family.id);
await db.from("subscriptions").delete().eq("family_id", family.id);

const now = Math.floor(Date.now() / 1000);
const subId = `sub_test_${now}`;
const custId = `cus_test_${now}`;

function subscriptionEvent(id, type, overrides = {}) {
  return {
    id,
    type,
    object: "event",
    data: {
      object: {
        id: subId,
        object: "subscription",
        customer: custId,
        status: "active",
        cancel_at_period_end: false,
        metadata: { family_id: family.id, plan: "monthly" },
        items: {
          data: [
            {
              current_period_start: now,
              current_period_end: now + 30 * 86400,
              price: { unit_amount: 25000, recurring: { interval: "month" } },
            },
          ],
        },
        ...overrides,
      },
    },
  };
}

// ------------------------------------------------------------ the signature
console.log("\n--- THE SIGNATURE ---\n");

const unsigned = await fetch(`${BASE}/api/stripe/webhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(subscriptionEvent("evt_nosig", "customer.subscription.created")),
});
check("an unsigned event is refused", unsigned.status === 400, String(unsigned.status));

const forged = await post(subscriptionEvent("evt_forged", "customer.subscription.created"), {
  secret: "whsec_something_an_attacker_guessed",
});
check("an event signed with the wrong secret is refused", forged.status === 400, forged.body);

const tampered = await (async () => {
  const event = subscriptionEvent("evt_tampered", "customer.subscription.created");
  const header = sign(JSON.stringify(event));
  // Same signature, different body: the exact shape of a replay with the
  // amount edited.
  event.data.object.items.data[0].price.unit_amount = 1;
  return post(event, { signature: header });
})();
check("an edited body invalidates the signature", tampered.status === 400, tampered.body);

const stale = await post(subscriptionEvent("evt_stale", "customer.subscription.created"), {
  timestamp: Math.floor(Date.now() / 1000) - 3600,
});
check("an hour old signature is refused", stale.status === 400, stale.body);

const { count: leakedRows } = await db
  .from("subscriptions")
  .select("id", { count: "exact", head: true })
  .eq("family_id", family.id);
check("none of those wrote anything", leakedRows === 0, `${leakedRows} rows`);

// ------------------------------------------------------------- the happy path
console.log("\n--- A SUBSCRIPTION STARTS ---\n");

const created = await post(subscriptionEvent("evt_created_1", "customer.subscription.created"));
check("a properly signed event is accepted", created.status === 200, created.body);

const { data: subscription } = await db
  .from("subscriptions")
  .select("status, plan, price_aed, provider, provider_subscription_id, current_period_end")
  .eq("family_id", family.id)
  .maybeSingle();

check("the subscription was stored", Boolean(subscription), subscription?.status ?? "nothing");
check("on the right plan", subscription?.plan === "monthly", subscription?.plan ?? "");
check(
  "at the price the event carried",
  Number(subscription?.price_aed) === 250,
  String(subscription?.price_aed),
);
check(
  "linked to the provider's own id",
  subscription?.provider === "stripe" && subscription?.provider_subscription_id === subId,
);

const { data: active } = await db.rpc("has_active_subscription", { p_family_id: family.id });
check("the free contact gate now sees a subscriber", active === true, String(active));

// ------------------------------------------------------------- idempotency
console.log("\n--- STRIPE RETRIES ---\n");

const replay = await post(subscriptionEvent("evt_created_1", "customer.subscription.created"));
check("a replayed event is accepted, not refused", replay.status === 200, replay.body);
check("and reports itself as a duplicate", replay.body.includes("duplicate"), replay.body);

const { count: rowsAfterReplay } = await db
  .from("subscriptions")
  .select("id", { count: "exact", head: true })
  .eq("family_id", family.id);
check("no second subscription was created", rowsAfterReplay === 1, `${rowsAfterReplay} rows`);

const { count: eventRows } = await db
  .from("subscription_events")
  .select("id", { count: "exact", head: true })
  .eq("family_id", family.id);
check("the replay was not recorded twice either", eventRows === 1, `${eventRows} events`);

// ------------------------------------------------------------- cancellation
console.log("\n--- A FAMILY CANCELS ---\n");

const cancelled = await post(
  subscriptionEvent("evt_cancel_1", "customer.subscription.updated", {
    cancel_at_period_end: true,
  }),
);
check("the cancellation was accepted", cancelled.status === 200, cancelled.body);

const { data: afterCancel } = await db
  .from("subscriptions")
  .select("status, cancel_at_period_end")
  .eq("family_id", family.id)
  .maybeSingle();

check("it is marked as ending", afterCancel?.cancel_at_period_end === true);
check("but the status is still active", afterCancel?.status === "active", afterCancel?.status ?? "");

const { data: stillActive } = await db.rpc("has_active_subscription", {
  p_family_id: family.id,
});
check(
  "access continues to the end of the paid period",
  stillActive === true,
  "PRD 20: a family that cancels on day two has paid for the month",
);

// ------------------------------------------------------------ the period ends
console.log("\n--- THE PERIOD RUNS OUT ---\n");

const ended = await post(
  subscriptionEvent("evt_deleted_1", "customer.subscription.deleted", {
    status: "canceled",
    items: {
      data: [
        {
          current_period_start: now - 60 * 86400,
          current_period_end: now - 86400,
          price: { unit_amount: 25000, recurring: { interval: "month" } },
        },
      ],
    },
  }),
);
check("the ending was accepted", ended.status === 200, ended.body);

const { data: expired } = await db.rpc("has_active_subscription", { p_family_id: family.id });
check("access stops once the period is behind us", expired === false, String(expired));

// ------------------------------------------------------------------ payments
console.log("\n--- PAYMENTS ---\n");

const invoiceId = `in_test_${now}`;
const paid = await post({
  id: "evt_invoice_paid_1",
  type: "invoice.paid",
  object: "event",
  data: {
    object: {
      id: invoiceId,
      object: "invoice",
      customer: custId,
      amount_paid: 25000,
      amount_due: 25000,
      metadata: { family_id: family.id },
    },
  },
});
check("a paid invoice was accepted", paid.status === 200, paid.body);

const { data: payment } = await db
  .from("payments")
  .select("amount_aed, status, paid_at")
  .eq("family_id", family.id)
  .maybeSingle();

check("the payment was recorded", Boolean(payment), payment?.status ?? "nothing");
check("for the right amount", Number(payment?.amount_aed) === 250, String(payment?.amount_aed));
check("and stamped as paid", Boolean(payment?.paid_at));

const paidAgain = await post({
  id: "evt_invoice_paid_2",
  type: "invoice.paid",
  object: "event",
  data: {
    object: {
      id: invoiceId,
      object: "invoice",
      customer: custId,
      amount_paid: 25000,
      amount_due: 25000,
      metadata: { family_id: family.id },
    },
  },
});
const { count: paymentRows } = await db
  .from("payments")
  .select("id", { count: "exact", head: true })
  .eq("family_id", family.id);
check(
  "the same invoice is never recorded twice",
  paidAgain.status === 200 && paymentRows === 1,
  `${paymentRows} rows`,
);

// -------------------------------------------------------- a failed renewal
console.log("\n--- A CARD FAILS ---\n");

await post(subscriptionEvent("evt_pastdue_1", "customer.subscription.updated", {
  status: "past_due",
  items: {
    data: [
      {
        current_period_start: now,
        current_period_end: now + 30 * 86400,
        price: { unit_amount: 25000, recurring: { interval: "month" } },
      },
    ],
  },
}));

const { data: pastDue } = await db
  .from("subscriptions")
  .select("status")
  .eq("family_id", family.id)
  .maybeSingle();
check("the subscription is marked past due", pastDue?.status === "past_due", pastDue?.status ?? "");

const { data: stillIn } = await db.rpc("has_active_subscription", { p_family_id: family.id });
check(
  "a failed payment does not lock the family out mid conversation",
  stillIn === true,
  "Stripe retries for days and most of those succeed",
);

// ----------------------------------------------------------- unknown events
console.log("\n--- EVERYTHING ELSE ---\n");

const unknown = await post({
  id: "evt_unknown_1",
  type: "customer.discount.created",
  object: "event",
  data: { object: {} },
});
check(
  "an event we do not handle is acknowledged, not retried forever",
  unknown.status === 200,
  unknown.body,
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
console.log(
  "\nNot covered here: that Stripe's real payloads match the shapes above.\n" +
    "That needs `stripe listen` against a test account and is the one thing\n" +
    "this suite cannot prove on its own.",
);
process.exit(failed.length === 0 ? 0 : 1);
