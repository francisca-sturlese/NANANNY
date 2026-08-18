import { createServiceClient } from "@/lib/supabase/service";
import {
  verifyUnsubscribeToken,
  unsubscribeUrl,
  type OptoutScope,
} from "@/lib/email/unsubscribe";

/**
 * The unsubscribe landing, scope-aware.
 *
 * One click from an email, no login, no confirmation step: the person already
 * said what she wants by clicking. The link's scope decides how much goes
 * quiet — the reminder link stops reminders, the activity link stops
 * application and message mail, and either page offers the bigger switch for
 * whoever wanted that instead. Links from before scopes existed keep meaning
 * "everything", exactly as they promised when they were sent.
 *
 * Idempotent on purpose. Clicking twice, or on an old email after already
 * opting out, lands on the same quiet page.
 */

export const dynamic = "force-dynamic";

function page(title: string, lines: string[]): Response {
  const body = lines.map((line) => `<p style="color:#555555; line-height:1.6;">${line}</p>`).join("");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title></head>
<body style="font-family: Arial, Helvetica, sans-serif; background:#ffffff; color:#111111; display:grid; place-items:center; min-height:90vh; margin:0; padding:24px;">
<div style="max-width:440px; text-align:center;">
<h1 style="font-size:22px;">${title}</h1>
${body}
<p style="margin-top:28px;"><a href="https://nananny.com" style="color:#111111; font-weight:700;">Back to NaNanny</a></p>
</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

const SCOPES: OptoutScope[] = ["all", "reminders", "applications"];

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const rawScope = url.searchParams.get("s") ?? "all";
  const scope: OptoutScope = (SCOPES as string[]).includes(rawScope)
    ? (rawScope as OptoutScope)
    : "all";

  if (!userId || !token || !(await verifyUnsubscribeToken(userId, token, scope))) {
    return page("This link is not valid", [
      "The unsubscribe link looks incomplete or expired. If you keep receiving email you do not want, write to support@nananny.com and a person will turn it off for you.",
    ]);
  }

  const service = createServiceClient();
  const { error } = await service
    .from("email_optouts")
    .upsert({ user_id: userId, scope }, { onConflict: "user_id,scope", ignoreDuplicates: true });

  if (error) {
    return page("Something went wrong", [
      "We could not save your choice just now. Please try the link again in a minute, or write to support@nananny.com.",
    ]);
  }

  // The bigger switch, offered rather than assumed: the person who wanted
  // total silence gets it in one more click, signed server-side.
  const allUrl = scope === "all" ? null : await unsubscribeUrl(userId, "all");

  if (scope === "reminders") {
    return page("Reminders are off", [
      "You will not receive reminder emails from NaNanny any more. Emails about real activity, like a nanny applying to your job or a new message, still arrive, and so do emails about signing in and your account.",
      allUrl
        ? `Want to stop those too? <a href="${allUrl}" style="color:#111111;">Stop all NaNanny email</a>.`
        : "",
    ]);
  }

  if (scope === "applications") {
    return page("Activity emails are off", [
      "You will not be emailed when somebody applies to your job or sends you a message. Everything still appears in the app, and reminder and account emails still arrive.",
      allUrl
        ? `Want silence across the board? <a href="${allUrl}" style="color:#111111;">Stop all NaNanny email</a>.`
        : "",
    ]);
  }

  return page("You are unsubscribed", [
    "You will not receive reminder or activity emails from NaNanny any more. Emails about signing in and your own account still arrive.",
    "Changed your mind about part of it? Write to support@nananny.com and a person will put things back the way you want.",
  ]);
}
