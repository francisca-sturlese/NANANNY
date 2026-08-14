import type { MetadataRoute } from "next";
import { PRIVATE_PATH_PREFIXES } from "@/lib/security/headers";
import { siteUrl } from "@/lib/seo/site";

/**
 * What a crawler is asked not to fetch.
 *
 * The disallow list is the same constant the `X-Robots-Tag` rules use, because
 * the two drifting apart is exactly the mistake that puts a signed-in page in
 * search results. This file is a request; the header is the instruction. Both
 * are here because a crawler that ignores one may still respect the other.
 *
 * Individual nanny profiles are excluded as well, and that is a product
 * decision rather than an oversight. See `sitemap.ts`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE_PATH_PREFIXES.map((p) => `${p}/`), "/nannies/"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
