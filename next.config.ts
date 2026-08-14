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
