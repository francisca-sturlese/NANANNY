# Mobile first — binding constraints

Most NaNanny traffic will come from phones. Mobile is therefore **the design**,
and desktop is that design given more room — never the other way round.

These are constraints for every milestone, not suggestions. Screens built from
Milestone 3 onwards (search, nanny cards, profile page, messaging, paywall,
checkout) must satisfy all of them before being called done.

## Enforced automatically

`node scripts/mobile-audit.mjs` runs every page at every target viewport in
WebKit (iPhone Safari) and Chromium (Android Chrome) and fails on:

- horizontal scrolling — it names the widest offending element
- interactive targets under 44px tall on a touch viewport
- text under 12px
- content sitting underneath a fixed bottom bar

Viewports covered: 375×667, 390×844, 393×852, 430×932, 360×800, 768×1024,
1440×900. Add new routes to the `PAGES` array as they are built.

Run with `--shots` to also write full-page screenshots to `screenshots/`.

## Foundations already in place

| Concern | Where |
|---|---|
| No sideways scroll, ever | `overflow-x: hidden` on `body` in `globals.css` |
| Home-indicator clearance | `.pb-safe` / `.mb-safe` (`env(safe-area-inset-bottom)`) |
| Space reserved for the bottom bar | `.pb-nav` on `<main>` |
| Notch clearance in landscape | `.px-safe` |
| 44px targets on touch only | `@media (pointer: coarse)` block |
| Thumb-sized standalone links | `.tap-target` utility |
| No iOS zoom-on-focus | inputs forced to 16px under 640px |

### Two traps worth remembering

**`min-height` does nothing to an inline element.** An `<a>` is inline by
default, so a bare `min-height: 44px` on a link changes nothing at all. That is
why `.tap-target` also sets `display: inline-flex`.

**A tap before hydration does nothing.** Anything driven by React state — the
child-count stepper, the filter sheet — is inert until the JavaScript loads. On
a slow phone that window is real. Prefer native form controls that work without
JavaScript wherever the interaction allows it.

## Navigation

Bottom bar on mobile, horizontal nav in the header from `md` up. Both come from
one definition in `components/app/app-shell.tsx`:

- **Family** — Home · Find Nanny · Matches · Messages · Profile
- **Nanny** — Home · Find Jobs · Applications · Messages · Profile

## Search

Never seven dropdowns stacked down a phone screen. The phone layout is
**location + Filters + Search**; the remaining filters live in a bottom sheet
with a grab handle, a close button, "Clear all" and "Show results". The same
fields lay out as a grid from `sm` up. One form, one set of query parameters,
one results URL.

See `components/site/search-module.tsx`.

## Images

`scripts/optimise-photos.mjs` pre-encodes every photo to WebP at 420/640/960/1440
and emits a manifest with a blurred placeholder. The `<Photo>` component renders
a plain `<img>` with `srcset`, `sizes`, `loading="lazy"` and a reserved aspect
ratio.

**Always pass a real `sizes`.** Without it the browser assumes the image fills
the viewport and downloads the 1440px rendition onto a phone — the exact failure
the pipeline exists to prevent.

Current cost per photo on a phone: 12–49 KB, against 0.9–3.6 MB originals.

Videos: never autoplay, never preload. Poster image only, load on request.

## Still to satisfy in later milestones

- **Messaging** — full-height thread, sticky composer, keyboard-aware layout.
  The composer must never be covered by the on-screen keyboard.
- **Paywall** — bottom sheet or full screen; the two price cards must be
  comfortably tappable without pinching.
- **Checkout** — minimum fields, wallet payments where available, no
  unnecessary redirects, verified on iOS Safari and Android Chrome.
- **Nanny cards** — photo, name, location, experience, availability,
  live in/out, salary, key skills, badges, match score and one primary CTA,
  all readable without opening the profile and without crowding.
- **Profile page** — sticky Message CTA that does not cover content.
- **Performance** — test under throttled slow 4G, keep the client bundle small,
  check Core Web Vitals on mobile specifically.
