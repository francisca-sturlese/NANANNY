import "server-only";

/**
 * Addresses for private storage.
 *
 * Files are served through this app at /media/<bucket>/<key>, not by handing
 * the browser a signed Supabase URL. Two reasons:
 *
 *   1. The local Supabase stack listens on 127.0.0.1 only, so a signed URL is
 *      a broken image on any device that is not the machine running it. That
 *      made testing on a real phone impossible.
 *   2. The route re-checks who is asking on every request, rather than trusting
 *      a URL minted an hour ago and possibly forwarded to someone else since.
 *
 * These functions therefore return app paths. They keep their names and shapes
 * so every caller is unchanged.
 */

export type PrivateBucket =
  | "nanny-photos"
  | "nanny-videos"
  | "nanny-documents"
  | "family-photos";

export async function signedUrl(
  bucket: PrivateBucket,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  return mediaUrl(bucket, path);
}

/** The app-served address for a stored object. */
export function mediaUrl(bucket: PrivateBucket, path: string): string {
  // Each segment is encoded separately so the slashes in the key survive.
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `/media/${bucket}/${encoded}`;
}

/**
 * Addresses for many objects at once.
 *
 * No longer a network call at all: building a path is arithmetic. Pages that
 * showed twelve cards used to wait on a batch signing request before rendering.
 */
export async function signedUrls(
  bucket: PrivateBucket,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const path of paths) {
    if (path) out.set(path, mediaUrl(bucket, path));
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
