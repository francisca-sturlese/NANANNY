import type { MetadataRoute } from "next";

/**
 * What a phone needs to keep this on a home screen.
 *
 * Not a step towards an app store listing. It is the part of that idea worth
 * having on its own: an icon, a full screen without the browser's chrome, and
 * an instant start. No commission on the subscription, no review queue between
 * a fix and the people who need it, and no separate build to keep in step.
 *
 * `start_url` is the family dashboard rather than the homepage. Somebody who
 * put this on their home screen has already signed up, so the marketing page is
 * the wrong first screen: the router sends a nanny to her own side and a signed
 * out visitor to the login, which is a better landing for all three than a page
 * explaining what the product is to somebody already using it.
 */
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NaNanny UAE",
    // Eleven characters. A home screen truncates at about twelve, and being cut
    // to "NaNanny U…" looks like a mistake rather than a brand.
    short_name: "NaNanny",
    description:
      "Find and message nannies across the UAE, and keep track of who has applied.",
    start_url: "/family",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "en-AE",
    dir: "ltr",
    categories: ["lifestyle", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android masks icons to the launcher's shape and can crop to a circle of
      // 80% of the width. These keep the mark inside the middle so nothing that
      // matters is cut off.
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Find a nanny", url: "/nannies" },
      { name: "Messages", url: "/family/messages" },
      { name: "Find a job", url: "/jobs" },
    ],
  };
}
