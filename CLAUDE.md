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
npm run test:db        # 192 SQL checks across nineteen suites
npm run test:e2e       # 35 + 26 + 15 + 28 + 15 + 29 + 8 + 16 + 20 end-to-end checks
npm run test:security  # headers, noindex, secrets, action guards
npm run test:seo       # robots, sitemap, canonicals, share preview, structured data,
                       # and the free contact claim on every page that makes it
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

**A profile publishes itself when it is complete enough.** Federico's rule, at
fifty per cent, in `publishing_config` so the number and the switch are changed
from a screen rather than by a release. A BEFORE trigger on `nanny_profiles`,
firing on the inner write where `profile_completion` is recomputed, so it
publishes the moment she crosses the line instead of up to an hour later. Only
ever draft to submitted: approved and rejected are decisions a person made and
nothing automatic undoes one. See
`20260817100000_publish_when_complete_enough.sql`.

**No friction in registering a profile.** Federico's standing instruction, and
it is why zero years of experience is valid, why a profile publishes at half
complete, why documents are optional and why a missing photo gets the brand mark
rather than a gap. New required fields and new steps need his say-so; in doubt
the answer is optional, and the constraint lives downstream in review, badges
and ordering rather than upstream in the form. A revoke can break signing up
without anybody noticing, so `privacy_rls.sql` checks the write side next to the
read side.

**A table created in `public` is born closed to `anon`.** PostgreSQL grants
SELECT by default, which is how `publishing_config` was readable by strangers on
the day it was created. An event trigger revokes it at creation, the same way
`close_new_functions` handles functions: a one-time migration fixes one object,
only changing the default fixes the category. A table meant to be public is
opened deliberately, in `anon_readable()`.

**A stranger reads two tables, by column, and nothing else.** `jobs` and
`nanny_profiles`, listed in `anon_readable()`, which sets the grants and checks
them. Production had drifted to where an anonymous session could reach
`users.email`, `users.phone` and `messages.body` at the grant level. Nothing was
exposed, because RLS held on all of them, which is exactly the point: the design
is two locks and one had quietly stopped being there. `assert_anon_reads()`
compares the whole schema in both directions, because a missing grant empties a
page and gets noticed in hours, while an extra one shows nothing at all.

**A column added to `nanny_profiles` is two changes, and the second one fails
somewhere else.** A missing UPDATE grant threw away a nanny's entire first
onboarding step; a missing SELECT grant on `has_photo` emptied the search page
for signed-out visitors, because PostgREST refuses the whole query including an
ORDER BY, while it kept working for anybody signed in, who is who checks.
`assert_editable_columns()` and `assert_public_nanny_columns()` are the two
halves of the same guard, and both list what is deliberately withheld so that a
new column belonging to neither list is a failure rather than a silence.

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

**A backend script gets the same trail, through `ops_set_nanny_status()`.**
`admin_set_nanny_status()` checks `is_admin()`, which the service role can never
satisfy: it has no `auth.uid()`. That left a one-off with two bad options, write
the row directly and leave no trace, or write the audit row by hand and hope
somebody remembers. Four nanny profiles were published by hand in an afternoon
for a real reason that lived in a chat message. The function adds no power
anybody holding the key did not have; it makes the audited way the easy way,
which is the only form in which this rule survives a hurry. The reason is
required, and `actor_id` stays null rather than borrowing an administrator's:
recording a person who pressed nothing sends whoever investigates to the wrong
desk.

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

**Visits are counted first-party, and count people rather than views.** The
Cloudflare beacon that would have done this is blocked by our own script
policy, which is a rule worth keeping, so `/api/v` and `record_visit` do it
instead. A visitor is a random id in a first-party cookie: enough to tell one
person reading five pages from five people reading one, which is the whole
question, and nothing beyond it. No IP, no user agent, no query string, and no
path outside the allowlist in the route. The allowlist covers the way in, the
way through and the way back: the marketing pages, the two dashboards and the
two onboarding wizards by step. Nothing else behind a login, because messages
and billing answer questions nobody is asking. A profile is recorded as
`/nannies/:id`
because how many people read a profile is useful and which profile a particular
visitor read is not ours to keep. `admin_traffic` checks `is_admin()` itself:
the record of everywhere people went is not something a stolen key returns.

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

**A stored provider customer id can stop existing.** Test and live are separate
worlds, so an id created under test keys is unknown once live keys are in use,
and the family it belongs to gets "No such customer" on their first real
checkout. `openCheckoutAction` detects that and starts again without it: the id
only buys keeping one family's history under one customer record, and being
unable to pay costs more than that is worth. The portal cannot recover the same
way, so it says something true instead of "try again".

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

**A notification is written by a trigger, and says nothing until it is read.**
The row records that something happened; the sentence is built in
`lib/notifications/copy.ts` when somebody opens the bell. That keeps the
wording changeable without a migration that rewrites history, and it keeps text
one user typed from ever being stored as something the platform said. Triggers
rather than calls in the actions, for the same reason the rate limits are
triggers: the row is what happened, an action is one of several ways to write
it. See `20260814320000_notification_events.sql`.

**A table missing from `supabase_realtime` fails silently.** The subscription
connects, reports SUBSCRIBED, and delivers nothing for the rest of time, which
looks exactly like an account with no notifications. The publication is asserted
in `supabase/tests/notification_events.sql`, and the bell carries `data-live`
so `scripts/e2e-notifications.mjs` can wait for the socket instead of sleeping
and hoping. A test that sleeps here does not test realtime, it tests the sleep.

**A family is emailed about applications once a day, whatever arrives.** It is
the one event that genuinely warrants interrupting somebody, and it is also the
one that turns into a filter rule if a busy afternoon sends four. The cap is a
daily bucket in `email_events.idempotency_key`, in Dubai time rather than UTC
so a day means the day where the reader lives. Because the mail covers
everything that arrives afterwards, the copy is an aggregate read at send time:
a subject naming one nanny stops being true the moment the second applies. See
`20260816020000_application_email.sql`.

**Skipped is not failed, and in production it is not skipped either.** A
machine with no mail key composes the email and has nowhere to hand it, which
is every development machine. A worker serving nananny.com with no key is a
product that has silently stopped telling anybody anything: `EMAIL_FROM` was
missing from the worker vars for a day, two real applications were composed and
never sent, and the row said exactly that in a colour that reads as fine. So
`sendEmail` returns a failure, named, when the site URL is https and the
configuration is absent.

**Skipped is not failed.** A machine with no mail key composes the email and
has nowhere to hand it. That is every development machine, and recording it as
`failed` put a red row next to every message this product has ever composed.
`sendEmail` returns a `skipped` reason, the callers record `status = 'skipped'`,
and the composed subject and body are kept on the row. These emails carry
nothing a user typed, so storing the text leaks nothing and is the only way the
copy is ever read before it reaches a real person.

**`paying` is about the conversation, not about the recipient.** A nanny never
pays. If it meant "only write to people who pay", an unread message reminder
could never reach the side of the marketplace that most needs it, and the person
losing by that would be the family who paid to send it. Both directions are
pinned in `supabase/tests/reminders.sql`.

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

**A Continue button in a form with no action is a silent dead end.** It
submits a GET to the page it is already on: the page reloads, nothing is saved,
and nothing says so. It shipped that way on the Documents step and a real nanny
sat on step six. `scripts/e2e-onboarding.mjs` now asserts every step of the
nanny wizard renders its Continue inside a form React wired to a server action.
Structural rather than a click, because a click only proves a step whose
required fields are filled, so a click based check goes green on a validation
error and stops testing.

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

## Git hooks

`npm install` installs them, through the `prepare` script. The only one is a
pre-commit that refuses a macOS duplicate file: `bell 2.tsx` and friends.
Twelve of those reached the remote once, one being a copy of a migration whose
version was already in the ledger, which the next `db push` would have picked
up. `npm run clean:dupes` removes them from disk, but the disk is not where
they do harm.

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
5. ✅ Subscriptions, checkout, webhooks, billing portal. Verified against real
   Stripe in test mode on 16 August: hosted checkout, test card, signature
   check, subscription active, payment recorded, portal opens. Live keys not
   in use yet, which is a switch rather than work
6. ✅ Matching and explainable scores. No LLM, by decision: the free text
   assistant in the PRD is out of scope and the score stays deterministic
7. ✅ Admin, moderation, analytics
8. ✅ Security, SEO, indexes and Workers packaging. Deployed and serving on
   nananny.com. See `docs/deployment.md`

9. 🔶 Email. Application notifications, inactivity reminders and unsubscribe
   are live. The opt-out is one row per person, so refusing the reminders also
   refuses the application email: it needs a scope before anybody relies on it
