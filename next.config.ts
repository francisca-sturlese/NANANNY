import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";
import { securityHeaders, PRIVATE_PATH_PREFIXES } from "./src/lib/security/headers";

/**
 * Every IPv4 address this machine currently has on the local network.
 *
 * Hardcoding one was a mistake. The address changes whenever the machine joins
 * a different network or a hotspot, and the phone testing the site then cannot
 * reach it at all, or reaches it and has its JavaScript refused. Both look like
 * a caching problem, which is a long way from where the cause actually is.
 */
function localAddresses(): string[] {
  const found = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) found.add(address.address);
    }
  }
  return [...found];
}

const nextConfig: NextConfig = {
  /**
   * The dev server initialises on `localhost` and blocks cross-origin requests
   * to dev-only assets. Reaching it any other way — on 127.0.0.1, which is what
   * Supabase's redirect URLs use, or on a LAN address from a real phone —
   * returns 403 for the JavaScript chunks. Pages then render and never hydrate:
   * forms look fine and silently do nothing.
   *
   * Development only, and recomputed at startup, so restarting after joining a
   * different network is all it takes.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.local", ...localAddresses()],

  // The version banner tells an attacker which advisories to try first.
  poweredByHeader: false,

  experimental: {
    /**
     * How big a form post can be.
     *
     * Next defaults this to 1 MB and it was never set, while the app accepted
     * photos up to 5 MB and videos up to 80 MB through the same server
     * actions. Every nanny who chose a real photo from a phone was rejected,
     * on a required field, at the first step of onboarding. It never showed up
     * in a test because no suite ever uploaded a real file: the seed avatars go
     * to storage directly.
     *
     * 6 MB covers the 5 MB photo limit with room for the rest of the form.
     * Video is deliberately not covered: 80 MB through a server action would
     * mean holding it all in memory on a worker, and that upload wants to go
     * straight to storage instead. Until it does, the video limit below is cut
     * to fit.
     */
    serverActions: { bodySizeLimit: "6mb" },
  },

  async headers() {
    const isDev = process.env.NODE_ENV === "development";

    return [
      { source: "/:path*", headers: securityHeaders(isDev) },

      /**
       * Signed-in areas and private files, kept out of search results.
       *
       * robots.txt asks a crawler not to fetch these; this header tells one
       * that fetched anyway not to index what it found. The two are not
       * interchangeable, which is why both exist.
       */
      ...PRIVATE_PATH_PREFIXES.map((prefix) => ({
        source: `${prefix}/:path*`,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
      ...PRIVATE_PATH_PREFIXES.map((prefix) => ({
        source: prefix,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),

      /**
       * Private files must never be cached by anything shared. `private` keeps
       * them out of a CDN; `no-store` keeps a passport out of the disk cache of
       * a borrowed laptop.
       */
      {
        source: "/media/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
