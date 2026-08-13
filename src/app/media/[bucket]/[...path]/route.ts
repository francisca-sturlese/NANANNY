import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSession } from "@/lib/auth/dal";

/**
 * Serves a private file through the app.
 *
 * Previously the browser was handed a signed Supabase URL. That worked on the
 * machine running Supabase and nowhere else: the local stack listens on
 * 127.0.0.1 only, so every photo was a broken image on a real phone over Wi-Fi.
 *
 * Streaming through here is also the better shape regardless of that. The
 * browser never learns the storage address, the ownership check stays in the
 * app on every single request rather than only at the moment a URL was minted,
 * and the response is cacheable because the address no longer rotates hourly.
 *
 * Object keys are always `<owner uuid>/<file>`, which is what makes the owner
 * knowable from the path alone.
 */

const BUCKETS = ["nanny-photos", "nanny-videos", "nanny-documents", "family-photos"] as const;
type Bucket = (typeof BUCKETS)[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bucket: string; path: string[] }> },
) {
  const { bucket, path } = await params;

  if (!BUCKETS.includes(bucket as Bucket)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const objectPath = path.join("/");
  const ownerId = path[0];

  // A key that is not `<uuid>/…` cannot be reasoned about, so it is refused
  // rather than served on the assumption it is harmless.
  if (!/^[0-9a-f-]{36}$/i.test(ownerId ?? "")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const allowed = await mayRead(bucket as Bucket, ownerId);
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  const service = createServiceClient();
  const { data, error } = await service.storage.from(bucket).download(objectPath);

  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isPublicish = bucket === "nanny-photos";

  return new NextResponse(data.stream(), {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      "Content-Length": String(data.size),
      // A profile photo rarely changes and is shown on every card, so it is
      // worth caching. Documents are not: they are sensitive and read once.
      "Cache-Control": isPublicish
        ? "private, max-age=3600, stale-while-revalidate=86400"
        : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Never let a stored file be rendered as a page in its own right.
      "Content-Disposition": bucket === "nanny-documents" ? "attachment" : "inline",
    },
  });
}

/**
 * Who may read what.
 *
 * Deliberately explicit rather than clever: each bucket has different rules and
 * writing them out is what makes them checkable.
 */
async function mayRead(bucket: Bucket, ownerId: string): Promise<boolean> {
  const user = await getSession();

  // Your own files, always.
  if (user?.id === ownerId) return true;

  // The lookups below use the service client on purpose. They are the
  // authorization decision, so they must be able to see the row: an anonymous
  // client is not granted `user_id` on nanny_profiles, and filtering on a
  // column it cannot read fails the query and denies a photo that should be
  // public. Nothing from these rows is returned to the caller, only a verdict.
  const supabase = createServiceClient();

  switch (bucket) {
    case "nanny-photos": {
      // The photo is part of the public discovery card, so an approved profile's
      // photo is readable by anyone, signed in or not. An unapproved one is not.
      const { data } = await supabase
        .from("nanny_profiles")
        .select("id")
        .eq("user_id", ownerId)
        .eq("status", "approved")
        .maybeSingle();
      if (data) return true;
      return isAdmin(user?.role);
    }

    case "nanny-videos": {
      // Behind an account, as the profile page says.
      if (!user) return false;
      if (isAdmin(user.role)) return true;
      const { data } = await supabase
        .from("nanny_profiles")
        .select("id")
        .eq("user_id", ownerId)
        .eq("status", "approved")
        .maybeSingle();
      return Boolean(data);
    }

    case "family-photos": {
      if (!user) return false;
      if (isAdmin(user.role)) return true;

      // A nanny sees it only if SHE is in conversation with THIS family. The
      // first version checked only that the family had some conversation, which
      // would have shown their photo to every nanny on the platform.
      const { data } = await supabase
        .from("conversations")
        .select("id, family:family_profiles!inner(user_id), nanny:nanny_profiles!inner(user_id)")
        .eq("family.user_id", ownerId)
        .eq("nanny.user_id", user.id)
        .limit(1);

      return Boolean(data && data.length > 0);
    }

    case "nanny-documents":
      // The owner and the review team, nobody else. A family never sees these.
      return isAdmin(user?.role);
  }
}

function isAdmin(role?: string): boolean {
  return role === "admin" || role === "super_admin";
}
