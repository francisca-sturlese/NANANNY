import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The dev server initialises on `localhost` and blocks cross-origin requests
   * to dev-only assets. Reaching it on `127.0.0.1` — which is what Supabase's
   * redirect URLs and the test scripts use — therefore returned 403 for the
   * JavaScript chunks, so pages rendered but never hydrated: forms looked fine
   * and simply did nothing.
   *
   * The two are the same machine; naming both is what makes them the same
   * origin as far as the dev server is concerned. Development only.
   */
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    // The Mac's address on the local network, so a real phone on the same
    // Wi-Fi can load the dev server. Mobile is the primary target and a
    // simulator is not the same as a thumb on glass.
    "192.168.1.161",
    "*.local",
  ],
};

export default nextConfig;
