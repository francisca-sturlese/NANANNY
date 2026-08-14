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
npm run test:db        # 12 + 24 + 10 + 17 SQL checks
npm run test:e2e       # 29 + 20 + 15 + 28 + 15 end-to-end checks
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

**Administrative actions go through a database function, never a direct write.**
The column grants deliberately stop even an admin from setting `users.status` or
`nanny_profiles.status` by hand. Every capability is a SECURITY DEFINER function
that checks `is_admin()` itself and writes to `audit_logs`, so the audit trail
cannot be skipped and a stolen anon key gets nowhere. See
`20260813150000_admin_capabilities.sql`.

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

**Approved ≠ verified.** Approval means a profile is live. Verification badges
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
5. ⬜ Subscriptions, payments, webhooks
6. ✅ Matching and explainable scores. No LLM, by decision: the free text
   assistant in the PRD is out of scope and the score stays deterministic
7. ✅ Admin, moderation, analytics
8. ⬜ Security, performance, SEO, deployment
