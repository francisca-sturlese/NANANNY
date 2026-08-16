import { createServiceClient } from "@/lib/supabase/service";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

/**
 * The unsubscribe landing.
 *
 * One click from an email, no login, no confirmation step: the person already
 * said what she wants by clicking. The token proves the link came from one of
 * our emails; without a valid one this endpoint does nothing at all.
 *
 * Idempotent on purpose. Clicking twice, or on an old email after already
 * opting out, lands on the same quiet page.
 */

export const dynamic = "force-dynamic";

function page(title: string, line: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title></head>
<body style="font-family: Arial, Helvetica, sans-serif; background:#ffffff; color:#111111; display:grid; place-items:center; min-height:90vh; margin:0; padding:24px;">
<div style="max-width:420px; text-align:center;">
<h1 style="font-size:22px;">${title}</h1>
<p style="color:#555555; line-height:1.6;">${line}</p>
<p style="margin-top:28px;"><a href="https://nananny.com" style="color:#111111; font-weight:700;">Back to NaNanny</a></p>
</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";

  if (!userId || !token || !(await verifyUnsubscribeToken(userId, token))) {
    return page(
      "This link is not valid",
      "The unsubscribe link looks incomplete or expired. If you keep receiving email you do not want, write to support@nananny.com and a person will turn it off for you.",
    );
  }

  const service = createServiceClient();
  const { error } = await service
    .from("email_optouts")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

  if (error) {
    return page(
      "Something went wrong",
      "We could not save your choice just now. Please try the link again in a minute, or write to support@nananny.com.",
    );
  }

  return page(
    "You are unsubscribed",
    "You will not receive reminder emails from NaNanny any more, and you will not be told when a nanny applies to your job. Emails about signing in and your own account still arrive. If you only meant to stop the reminders, write to support@nananny.com and a person will put the application emails back.",
  );
}
