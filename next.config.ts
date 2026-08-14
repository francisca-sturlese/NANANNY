import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

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
};

export default nextConfig;
