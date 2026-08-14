# Deployment

Target: Cloudflare Workers, free plan, packaged by OpenNext. The domain
`nananny.com` is on Cloudflare Registrar with DNS there.

## Not ready yet

`sharp` cannot load on Workers. It is a native Node module, so every onboarding
page answers 500 in the worker even though the bundle builds and the size is
comfortable. This is a blocker, not a warning. It was found by running the
worker in workerd, which is the only way to find it: `wrangler deploy --dry-run`
reports a healthy bundle.

The fix is to resize the uploaded photo in the browser before it is sent, and
keep the type and size check on the server as the real guard. See
`lib/onboarding/nanny-actions.ts` and `lib/onboarding/family-actions.ts`, the
only two places `sharp` is imported at runtime. The build scripts that use it
(`scripts/optimise-photos.mjs`, `scripts/make-og-image.mjs`) run on Node and are
fine as they are.

## Why middleware.ts and not proxy.ts

Next 16 renamed the convention to `proxy.ts` and deprecated `middleware.ts`, so
the build prints a deprecation warning on every run. The old name is used here
because `proxy.ts` runs on the Node runtime and refuses a `runtime` config
outright, and OpenNext fails with "Node.js middleware is not currently
supported". This is a constraint of the host, not a preference. If the host
changes, rename the file and the exported function and nothing else.

## Checking a build without deploying

```bash
npm run cf:check     # builds the worker and runs wrangler deploy --dry-run
npm run cf:preview   # runs the worker locally in workerd, on port 3105
```

Run the suites against the preview, not only against `next start`. They point at
whatever `BASE_URL` says:

```bash
BASE_URL=http://127.0.0.1:3105 npm run test:security
BASE_URL=http://127.0.0.1:3105 npm run test:seo
BASE_URL=http://127.0.0.1:3105 npm run test:e2e
```

This is how the missing `X-Robots-Tag` was found: header rules in
`next.config.ts` are applied to rendered routes and are lost on a response the
proxy produces, so every private path answered its redirect with no noindex at
all on Workers while behaving correctly under `next start`. The header is now
set on the way out of `middleware.ts`.

## Environment

`NEXT_PUBLIC_*` values are inlined into the client bundle at build time, so they
belong in the build environment rather than in worker vars.

**`NEXT_PUBLIC_SITE_URL` must be `https://nananny.com` in production.** HSTS and
`upgrade-insecure-requests` are gated on that value starting with `https://`,
not on `NODE_ENV`. Get it wrong and the site runs without either, silently. The
gate reads the site URL because the browser suites run a production build over
plain http on 127.0.0.1, where `NODE_ENV` is already "production".

`SUPABASE_SERVICE_ROLE_KEY` is a worker secret, set with `wrangler secret put`.
It is needed at runtime: the support form writes through the service client so
that somebody locked out of their account can still ask for help, and the
sitemap reads job ids without a session.

## The first administrator

The development seed makes one with a direct `UPDATE`, running as superuser.
That does not exist in production, and the column grants stop even a signed-in
admin from writing `users.role` by hand, which is deliberate.

So the first one is created by a human with database credentials. Sign up
through the site normally, then, connected to the production database as the
`postgres` role:

```sql
update public.users
   set role = 'super_admin'
 where email = 'the.address@you.signed.up.with';
```

Everyone after that is appointed from within the app through
`admin_set_user_role()`, which only a `super_admin` may call, never on
themselves, and which writes to `audit_logs` every time. A plain `admin`
moderates but cannot appoint: without that separation, one compromised
moderator account is enough to mint more, and nobody has to notice. Proven by
`supabase/tests/admin_roles.sql`.

## Email

Addresses are `@nananny.com`. The repository used to say `@nananny.ae`, which
was never registered, so every address printed on the privacy page and the
support page bounced.

## Order of operations for a first deploy

1. Push the migrations to the production Supabase project.
2. Set the auth redirect URLs and the site URL in Supabase to the real domain.
3. Configure SMTP, or verification emails never arrive.
4. Build and deploy the worker, then attach the custom domain.
5. Create the first `super_admin` with the statement above.
6. Smoke test the paths that matter: sign up, verify, complete onboarding,
   search, open a conversation, hit the paywall on the fourth contact.
