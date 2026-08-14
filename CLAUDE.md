@AGENTS.md

# NaNanny UAE

Marketplace connecting families and nannies in the UAE. Next.js 16 + TypeScript
+ Tailwind v4 + Supabase. Everything runs locally first.

## Running it

```bash
npm run db:start     # Supabase in Docker (API 54421, Postgres 54422,
                     # Studio 54423, Mailpit 54424 — dedicated ports so this
                     # never collides with another project on the machine)
npm run dev          # http://127.0.0.1:3100
```

Seed accounts (development only, all `@nananny.example.test`):
`admin@…`, `family1..5@…`, `nanny1..20@…` — password `NaNannyDev2026!`.

## Tests — run these before calling anything done

```bash
npm run test:db        # 132 SQL checks across eleven suites
npm run test:e2e       # 29 + 20 + 15 + 28 + 15 + 29 end-to-end checks
npm run test:security  # headers, noindex, secrets, action guards
npm run test:seo       # robots, sitemap, canonicals, share preview, structured data
npm run test:mobile    # 252 viewport/engine combinations
npm run test:links     # every internal link as 4 audiences, plus no dashes in copy
npm run test:overlays  # sheets and menus actually cover the viewport
npm run test:all       # all of the above, plus typecheck and lint
```

The browser suites are much faster against a production build than the dev
server (`npm run build && npx next start -p 3100`), and closer to what a phone
will actually get.

**If a suite starts timing out on navigation, check Docker first.** When Docker
Desktop stops, nothing listens on 54421 and every Supabase call hangs for ~7s
before failing — pages still return 200, so it looks like slowness rather than
an outage.

## The rules that are not negotiable

**The free-contact gate is the business.** Three free contacts, then a paywall.
Free usage is *derived* from `family_nanny_contacts` rows, never stored in a
counter. `start_conversation()` is the only way a contact is ever recorded, and
it takes a per-family advisory lock so two concurrent requests cannot both spend
the last credit. Viewing, saving and shortlisting are free — only opening a new
conversation costs. Never change this without re-running
`free_contacts_gate.sql`.

**The launch window suspends the gate without touching how it counts.**
`pricing_config.promo_starts_at/ends_at` open a period in which
`start_conversation()` writes `consumed_free_credit = false`, exactly as it
already does for a subscriber. Nothing is stored differently and no counter
appears: the contacts simply were never in the derived count. When the window
closes every family still has its full allowance, which is the point.
Both dates default to null, so the mechanism ships switched off. Never change
this without re-running `free_contacts_gate.sql` and `launch_promo.sql`.

**Pricing is server-side config.** 3 / 89 / 250 live in `pricing_config`, read
through `lib/pricing.ts`. Never hardcode a price or a free-contact count in a
component.

**Authorization lives in the DAL and in RLS, never in a layout.** With partial
rendering a layout does not re-run on navigation and cannot stop the segments
below it rendering. Use `requireUser` / `requireRole` / `requireAdmin` from
`lib/auth/dal.ts`, inside the page or the action. `proxy.ts` only does an
optimistic cookie check.

**Server Actions are public endpoints.** Every one validates its own input and
re-checks the caller's role. The route guard is not a substitute.

**RLS decides rows; GRANT decides columns.** Both matter. A user owns their
profile row but not every field on it: `users.role` and `nanny_profiles.status`
are withheld by column-level grants, because RLS alone let a user promote
themselves to admin and a nanny approve her own profile. See
`20260813140000_privacy_hardening.sql`.

**Finishing family onboarding publishes their job post.** Onboarding already
asks for everything a post needs, and asking again on a page that was not in
the navigation is why the first real family never posted. See
`20260814230000_onboarding_is_the_job.sql`, which also backfills.

**Deleting an account empties rows, it does not drop them.** `conversations`
references both profile tables and `public.users` references `auth.users`, all
ON DELETE CASCADE, so deleting any of them takes the other person's messages
with it. Everything personal is wiped, the login is emptied and banned, and the
shells stay so nobody's history is rewritten. Payment and audit records are
kept deliberately. See `20260814250000_delete_my_account.sql`.

**`revoke ... from authenticated` does nothing. It has to be `from public`.**
PostgreSQL grants EXECUTE on every new function to PUBLIC, so revoking from a
role that inherits PUBLIC leaves the grant in place. Seven privileged functions
were reachable from any session that way, one of which granted subscriptions.
`20260814210000_revoke_from_public.sql` revokes from PUBLIC across every
SECURITY DEFINER function and re-grants an explicit list, and
`supabase/tests/function_grants.sql` fails when a new one appears on the wrong
side of it.

Two things that migration must keep granting, both learned by breaking them:
`service_role` needs EXECUTE on everything, because the Stripe webhook and the
notification sender run as it. And any function named inside an RLS policy
needs EXECUTE for the role the policy is evaluated as, or the policy raises and
the query returns nothing at all, which looks like missing rows rather than a
permission error. Losing `is_conversation_participant` made every message in
every thread invisible to the two people in it.

**Administrative actions go through a database function, never a direct write.**
The column grants deliberately stop even an admin from setting `users.status` or
`nanny_profiles.status` by hand. Every capability is a SECURITY DEFINER function
that checks `is_admin()` itself and writes to `audit_logs`, so the audit trail
cannot be skipped and a stolen anon key gets nowhere. See
`20260813150000_admin_capabilities.sql`.

**Security headers live in `lib/security/headers.ts`, not in next.config.**
One source of truth for the CSP, the noindex prefixes and the cache rules on
`/media`. The CSP allows `'unsafe-inline'` for scripts, deliberately: the strict
alternative is a per-request nonce, which forces every static page to render on
the server. That trade is only defensible while there is no
`dangerouslySetInnerHTML` and no third-party script anywhere in `src/`, and
`npm run test:security` fails if either appears.

**`upgrade-insecure-requests` and HSTS are gated on the site URL, not NODE_ENV.**
The browser suites run against a production build on http://127.0.0.1, where
NODE_ENV is "production" and https does not exist. Emitting the directive there
rewrote every script URL to https and the app stopped loading its own
JavaScript.

**Rate limits are in the database, applied by triggers.**
Not in the app: the deployment target keeps nothing between requests, and these
paths are database functions an attacker could call directly. Triggers rather
than edited function bodies, because copying a function to insert one line is
how a `btrim` goes missing. Support requests are counted against the row's
`user_id`, since that form is submitted through the service client and
`auth.uid()` is null inside the trigger.

**Individual nanny profiles are readable but never indexed.**
Noindex in the page metadata, disallowed in robots.txt, absent from the
sitemap. A family should see who is available before signing up; that is not
the same as leaving a real person's photo, first name and emirate in a search
index after she has found a job. Job posts are indexed, since they carry no
personal detail and a family posting one wants it found.

**Administrators are appointed, not self-declared.** The first `super_admin`
is created by SQL against the production database, documented in
`docs/deployment.md`. Everyone after that goes through
`admin_set_user_role()`, which only a `super_admin` may call, never on
themselves, always audited. A plain `admin` moderates but cannot appoint.

**Deployment notes live in `docs/deployment.md`**, including why this repo uses
the deprecated `middleware.ts` and the one environment variable that silently
turns off HTTPS enforcement if it is wrong.

**A subscription becomes real in the webhook, never in the browser.**
`lib/billing/actions.ts` only sends a family to Stripe. Access is granted by
`api/stripe/webhook`, after the signature is verified against the raw request
body, through `apply_subscription_event()`, which is idempotent on the
provider's event id. Stripe retries, so applying twice must be impossible
rather than unlikely. `scripts/e2e-billing.mjs` signs its own payloads, so the
signature check, the handler and the database function are all under test
without a Stripe account.

**Prices go to Stripe as `price_data`, not as a dashboard Price.** A Price
created in Stripe's dashboard would be a second place 89 and 250 live, and an
admin changing the number in our admin screen would change what the pricing
page advertises without changing what the card is charged.

**`past_due` does not end access.** Stripe retries a failed renewal for days
and most of those succeed. Cutting a family off on the first failure drops them
out of a conversation they are in the middle of, over an expired card.

**Plans are listed cheapest first.** Sorted by amount in `plansFrom()` so the
rule survives a price change. Which one carries "best value" is a separate
question.

**Nothing in the request path may be a native Node module.** The deployment
target is a worker runtime where those cannot load, and the failure is a 500 at
request time with a green build. Photos are shrunk in the browser by
`components/ui/photo-input.tsx`; the server check in `lib/storage/images.ts` is
the control. `sharp` is a devDependency for build scripts only.

**An email never carries text another user typed.** The new message email says
a message arrived and links to it. Including the body would let any stranger
put arbitrary text into somebody's inbox inside an email that genuinely came
from us and passes every authentication check a mail client makes, which is a
better phishing envelope than an attacker could build on their own. The
cooldown is the unique index on `email_events.idempotency_key` with a fifteen
minute bucket in the key, not a timer: nothing is shared between requests on
the deployment target. Proven by `supabase/tests/notifications.sql`.

**No LLM anywhere in this product.** Decided 2026-08-14. The free text
assistant described in the PRD is out of scope, and nothing that reaches a
family may be generated. If a feature seems to need a model, it needs a
different design instead.

**The match score is computed in the database, never by a model.**
`compute_match()` reads the weights from `matching_weights`, which an admin can
change, and returns the score together with the sentences that produced it. A
dimension the family has not answered is reported as unknown rather than scored
as half a fit. `refresh_matches()` is the only writer of `matches`; the table is
read only for `authenticated`. Anything that would make the number unexplainable
breaks the product requirement, not just the tests.

**The nanny's visa status is required, the family's preference is not.** She
always knows hers. A family often has not decided whether it would sponsor
until it meets somebody worth sponsoring, and forcing the question turns a real
"we are open to it" into a wrong answer. Both live in `lib/uae.ts`, and the
family side is written for the nanny reading it rather than as the family's
setting.

**Visa status is declared, never verified.** `nanny_profiles.visa_status` is
what the nanny said, the same way years of experience is. The `visa` document
and its human review are what verification means. It is required to submit a
profile because families filter on it, it is rendered in neutral colours rather
than a badge's, and the profile says in plain words that nobody checked it.
Labels live in `lib/nanny/visa.ts` and are written twice: once for the family
reading a card, once for the nanny reading her own profile.

**A finished profile is visible before anybody reviews it.** Approval used to
mean both "a human looked at this" and "families can see it", which left a
nanny who finished at nine in the evening invisible until somebody woke up.
`is_discoverable()` in the database and `DISCOVERABLE_STATUSES` in
`lib/nanny/discoverable.ts` say what is findable, and the two must agree.
Draft stays hidden: incomplete, and she has not asked for it to be shown.
Applying follows the same rule, because being findable and unable to act is
the dead end this removed.

**Approved ≠ verified.** Approval means a profile has been reviewed. Verification badges
are granted one at a time, only for something a human actually reviewed. Never
render a blanket "background checked" claim.

**Storage is private.** Every bucket, including profile photos. Files are served
through short-lived signed URLs minted server-side by
`lib/storage/private-assets.ts`, after the caller has been authorised. Object
keys are always `<owner uuid>/<file>`; the storage policies pin that first
segment to `auth.uid()`.

**A `"use server"` file may export only async functions.** Exporting a constant
from one breaks the entire server-action graph at runtime, and it fails as
"nothing happens when I press the button" rather than as a build error. Put
shared constants in their own module — see `lib/safety/reasons.ts`.

**Private files are served by the app, not by signed Supabase URLs.**
`/media/<bucket>/<key>` re-checks the caller on every request and works from any
device; a signed URL points at 127.0.0.1 and is a broken image on a real phone.
`lib/storage/private-assets.ts` builds those paths.

**`position: fixed` is not always the viewport.** Any ancestor with
`backdrop-filter`, `filter`, `transform` or `contain` becomes its containing
block — and every sticky header and filter bar here uses `backdrop-blur`. Sheets
and menus must render through `components/ui/portal.tsx`, or they get clipped to
the bar they were opened from. `npm run test:overlays` guards this.

**Mobile is the primary target.** See `docs/mobile-first.md` — it is a set of
constraints, not advice, and `scripts/mobile-audit.mjs` enforces the mechanical
half of it.

## Copy

Plain sentences. **No em or en dashes anywhere a user can read** — not in
labels, not in help text, not in ranges. Use a full stop, a comma, a colon, or
the word "to" for a range ("AED 4,000 to 5,000", "0 to 12 months"). This matches
how the client writes and keeps the product from reading as machine-written.
`npm run test:links` fails the build if a dash appears in rendered copy.

Also avoid the usual machine tells: seamless, unlock, empower, leverage,
elevate, robust, effortless, "it's not just X, it's Y". Say the plain thing.

## Brand

White background, black text. Sage `#C7D2CC`, peach `#FCE1D8`, butter
`#FCF6CA` — supporting colours only, never for body text (use the `-deep`
tokens for anything that has to be read). Satoshi, self-hosted. Logo marks are
vectors in `components/brand/logo.tsx`.

## Where things are

```
src/lib/auth/          DAL, server actions, request-origin helper
src/lib/onboarding/    wizard step definitions + per-role save actions
src/lib/supabase/      browser / server / service-role clients
supabase/migrations/   schema, RLS, grants, functions
supabase/tests/        SQL test suites
scripts/               photo pipeline, seed avatars, e2e, mobile audit
docs/                  mobile-first constraints, reuse notes
```

## Milestones

1. ✅ Setup, schema, RLS, free-contact gate, design system
2. ✅ Auth, onboarding, profiles, completion, review states, seed, mobile pass
3. ✅ Search, filters, jobs, applications, shortlist
4. ✅ Messaging, contact counter, paywall
5. 🔶 Subscriptions, checkout, webhooks, billing portal. Test mode only,
   and never verified against real Stripe payloads
6. ✅ Matching and explainable scores. No LLM, by decision: the free text
   assistant in the PRD is out of scope and the score stays deterministic
7. ✅ Admin, moderation, analytics
8. 🔶 Security, SEO, indexes and Workers packaging done and verified in
   workerd. Deploy itself not run. See `docs/deployment.md`
