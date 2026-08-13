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
npm run test:db        # 12 + 24 + 10 SQL checks
npm run test:e2e       # 29 + 20 end-to-end checks
npm run test:mobile    # 252 viewport/engine combinations
npm run test:links     # every internal link, as 4 different audiences
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

**Approved ≠ verified.** Approval means a profile is live. Verification badges
are granted one at a time, only for something a human actually reviewed. Never
render a blanket "background checked" claim.

**Storage is private.** Every bucket, including profile photos. Files are served
through short-lived signed URLs minted server-side by
`lib/storage/private-assets.ts`, after the caller has been authorised. Object
keys are always `<owner uuid>/<file>`; the storage policies pin that first
segment to `auth.uid()`.

**`position: fixed` is not always the viewport.** Any ancestor with
`backdrop-filter`, `filter`, `transform` or `contain` becomes its containing
block — and every sticky header and filter bar here uses `backdrop-blur`. Sheets
and menus must render through `components/ui/portal.tsx`, or they get clipped to
the bar they were opened from. `npm run test:overlays` guards this.

**Mobile is the primary target.** See `docs/mobile-first.md` — it is a set of
constraints, not advice, and `scripts/mobile-audit.mjs` enforces the mechanical
half of it.

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
4. ⬜ Messaging, contact counter, paywall
5. ⬜ Subscriptions, payments, webhooks
6. ⬜ AI assistant and matching
7. ⬜ Admin, moderation, analytics
8. ⬜ Security, performance, SEO, deployment
