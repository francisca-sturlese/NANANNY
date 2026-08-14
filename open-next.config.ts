import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Packages the Next build for Cloudflare Workers.
 *
 * Deliberately the default configuration. The optional caches OpenNext offers
 * (KV for the incremental cache, D1 for tag revalidation, a queue for on demand
 * revalidation) each need a paid or separately provisioned resource, and this
 * app has almost nothing to cache: the pages worth caching are static and
 * served straight from Workers Assets, and everything behind a login is
 * per-request by nature.
 *
 * Revisit if the public pages start being regenerated rather than built.
 */
export default defineCloudflareConfig();
