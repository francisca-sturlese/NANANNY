import { createServiceClient } from "@/lib/supabase/service";
import { getSession } from "@/lib/auth/dal";

/**
 * One page view.
 *
 * Called by a small first-party script, because the alternative is worse. The
 * Cloudflare beacon that would have done this is blocked by our own content
 * policy, which is why the traffic dashboard has been reading zero for weeks:
 * the rule that keeps third-party scripts out is one worth keeping, so the
 * answer is to measure ourselves rather than to open the policy.
 *
 * Named `/api/v` and not `/api/track` or `/api/analytics` on purpose. Several
 * blocklists match those two words in a path and would drop the request, which
 * would leave us with numbers that are wrong in a way nobody would notice: a
 * quiet undercount looks exactly like quiet traffic.
 *
 * What is deliberately not recorded: no IP address, no user agent, no query
 * string, and no path outside the list below. A visitor is a random id in a
 * first-party cookie. It survives being cleared, it means nothing anywhere
 * else, and it exists to tell one person reading five pages from five people
 * reading one. That distinction is the entire question being asked, and
 * everything beyond it would be collection for its own sake.
 */

export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "nn_v";
const SIX_MONTHS = 60 * 60 * 24 * 180;

/**
 * The pages worth counting: the way in, and the way through.
 *
 * A fixed list rather than whatever the browser sends, so a stray URL cannot
 * write a row, and so the table stays readable. A profile or a job post is
 * recorded as its shape, never its id: how many people read a nanny's profile
 * is a useful number, which nanny a particular visitor read is surveillance.
 */
const COUNTED = new Set([
  "/",
  "/for-families",
  "/for-nannies",
  "/nannies",
  "/jobs",
  "/pricing",
  "/how-it-works",
  "/signup",
  "/login",
  "/faq",
]);

function shape(path: string): string | null {
  if (COUNTED.has(path)) return path;
  if (/^\/nannies\/[^/]+$/.test(path)) return "/nannies/:id";
  if (/^\/jobs\/[^/]+$/.test(path)) return "/jobs/:id";
  if (/^\/(dubai|abu-dhabi|sharjah|ajman|fujairah|ras-al-khaimah|umm-al-quwain)(\/|$)/.test(path)) {
    return "/:emirate";
  }
  return null;
}

/** The host somebody arrived from, never the URL. */
function source(referer: string | null, host: string): string {
  if (!referer) return "direct";
  try {
    const from = new URL(referer).hostname.replace(/^www\./, "");
    if (from === host.replace(/^www\./, "")) return "internal";
    return from;
  } catch {
    return "direct";
  }
}

function newVisitor(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

export async function POST(request: Request): Promise<Response> {
  let path = "";
  try {
    const body = (await request.json()) as { path?: unknown };
    path = typeof body.path === "string" ? body.path : "";
  } catch {
    return new Response(null, { status: 204 });
  }

  const counted = shape(path.split("?")[0]);
  // Not an error. A page nobody asked to count is simply not counted, and
  // saying so with a status would only invite somebody to fix it.
  if (!counted) return new Response(null, { status: 204 });

  const cookies = request.headers.get("cookie") ?? "";
  const existing = /(?:^|;\s*)nn_v=([A-Za-z0-9]{8,40})/.exec(cookies)?.[1];
  const visitor = existing ?? newVisitor();

  // A signed-in visitor is still one visitor. The id links a session to a
  // person only after they have an account with us anyway.
  const user = await getSession().catch(() => null);

  try {
    const service = createServiceClient();
    await service.rpc("record_visit", {
      p_path: counted,
      p_source: source(request.headers.get("referer"), new URL(request.url).host),
      p_visitor: visitor,
      p_user_id: user?.id ?? undefined,
    });
  } catch (error) {
    // Never worth a visible failure. A missing row is a missing row.
    console.error("[visits] could not record:", error);
  }

  const response = new Response(null, { status: 204 });

  if (!existing) {
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    response.headers.set(
      "set-cookie",
      `${VISITOR_COOKIE}=${visitor}; Path=/; Max-Age=${SIX_MONTHS}; SameSite=Lax; HttpOnly${secure}`,
    );
  }

  return response;
}
