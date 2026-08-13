import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Signed URLs for private storage.
 *
 * No bucket in this project is public, so nothing is ever linked directly. The
 * server checks who is asking, then mints a short-lived URL. The check belongs
 * to the caller — this module only signs, and callers must not hand it a path
 * they have not authorised.
 */

const DEFAULT_TTL_SECONDS = 60 * 60; // one hour

export type PrivateBucket =
  | "nanny-photos"
  | "nanny-videos"
  | "nanny-documents"
  | "family-photos";

export async function signedUrl(
  bucket: PrivateBucket,
  path: string | null | undefined,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  if (!path) return null;

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds);

  if (error) {
    // A broken avatar must never take a page down with it.
    console.error(`[storage] could not sign ${bucket}/${path}:`, error.message);
    return null;
  }

  return data.signedUrl;
}

/** Signs many paths from one bucket in a single round trip. */
export async function signedUrls(
  bucket: PrivateBucket,
  paths: (string | null | undefined)[],
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<Map<string, string>> {
  const real = paths.filter((p): p is string => Boolean(p));
  const out = new Map<string, string>();
  if (real.length === 0) return out;

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(real, ttlSeconds);

  if (error || !data) {
    console.error(`[storage] batch sign failed for ${bucket}:`, error?.message);
    return out;
  }

  for (const entry of data) {
    if (entry.signedUrl && entry.path) out.set(entry.path, entry.signedUrl);
  }
  return out;
}

/**
 * Object keys are always `<owner uuid>/<name>`. The storage policies pin the
 * first segment to auth.uid(), so this shape is what makes one user's folder
 * unreachable from another's session.
 */
export function ownedPath(userId: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "-").slice(-80);
  return `${userId}/${Date.now()}-${safe}`;
}
