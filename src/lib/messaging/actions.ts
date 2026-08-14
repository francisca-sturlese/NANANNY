"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { notifyNewMessage } from "@/lib/messaging/notify";
import { getSession, requireRole } from "@/lib/auth/dal";

/**
 * Messaging.
 *
 * The gate lives in the database, not here. `start_conversation()` decides
 * whether a contact is spent, takes a per-family advisory lock so two taps
 * cannot both spend the last credit, and raises PAYW1 when the allowance is
 * gone. This file translates that into something the UI can act on.
 */

export type ContactResult = {
  conversationId?: string;
  /** Set when the allowance is exhausted — the UI opens the paywall. */
  paywall?: boolean;
  error?: string;
  freeContactsUsed?: number;
  freeContactsLimit?: number;
};

/** Postgres error codes raised by start_conversation(). */
const PAYWALL = "PAYW1";
const NANNY_UNAVAILABLE = "NANN1";
const WRONG_ROLE = "ROLE1";

export async function startConversationAction(
  _prev: ContactResult,
  formData: FormData,
): Promise<ContactResult> {
  const user = await getSession();
  if (!user) return { error: "Please log in to message a nanny." };
  if (user.role !== "family") return { error: "Only families can start a conversation." };

  const nannyId = String(formData.get("nannyId") ?? "");
  const source = String(formData.get("source") ?? "profile");
  const firstMessage = String(formData.get("firstMessage") ?? "").trim();

  if (!z.string().uuid().safeParse(nannyId).success) return { error: "Invalid nanny." };
  if (firstMessage.length === 0) return { error: "Write a short message to start." };
  if (firstMessage.length > 5000) return { error: "That message is too long." };

  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("start_conversation", {
    p_nanny_id: nannyId,
    p_source: source as "profile" | "search" | "match" | "application" | "shortlist" | "job",
    p_first_message: firstMessage,
  });

  if (error) {
    if (error.code === PAYWALL) {
      // Not an error to show — it is the moment the product is designed around.
      const state = await loadContactState();
      return {
        paywall: true,
        freeContactsUsed: state?.free_contacts_used,
        freeContactsLimit: state?.free_contacts_limit,
      };
    }
    if (error.code === NANNY_UNAVAILABLE) {
      return { error: "This nanny is no longer available to contact." };
    }
    if (error.code === WRONG_ROLE) {
      return { error: "Only an active family account can start a conversation." };
    }
    console.error("[messaging] start_conversation failed:", error);
    return { error: "We could not start that conversation. Please try again." };
  }

  const result = data as { conversation_id: string } | null;
  if (!result?.conversation_id) return { error: "We could not start that conversation." };

  // The first message of a conversation is the one most worth telling somebody
  // about, and it does not go through sendMessageAction.
  if (firstMessage.length > 0) {
    await notifyNewMessage(result.conversation_id, user.id);
  }

  revalidatePath("/family/messages");
  revalidatePath("/family");
  redirect(`/family/messages/${result.conversation_id}`);
}

export async function sendMessageAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();
  if (!user) return { error: "Please log in." };

  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!z.string().uuid().safeParse(conversationId).success) return { error: "Invalid thread." };
  if (body.length === 0) return {};
  if (body.length > 5000) return { error: "That message is too long." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_body: body,
  });

  if (error) {
    if (error.code === "CONV2") return { error: "This conversation is blocked." };
    if (error.code === "ROLE1") return { error: "You are not part of this conversation." };
    // The database writes this one for a person to read, so it is passed
    // through instead of being replaced with a generic apology.
    if (error.code === "RATE1") return { error: error.message };
    console.error("[messaging] send_message failed:", error);
    return { error: "Message not sent. Please try again." };
  }

  // After the message is stored, and deliberately awaited: on a serverless
  // runtime there is nothing to keep a floating promise alive once the response
  // is returned, so firing and forgetting here would drop the email whenever
  // the worker finished first.
  await notifyNewMessage(conversationId, user.id);

  const base = user.role === "nanny" ? "/nanny/messages" : "/family/messages";
  revalidatePath(`${base}/${conversationId}`);
  revalidatePath(base);
  return {};
}

/**
 * Marks a thread read.
 *
 * Must be called from an effect or an action, never during render:
 * revalidatePath() during a render is unsupported and throws. Opening the
 * thread triggers it from the client instead.
 */
export async function markReadAction(conversationId: string): Promise<void> {
  const user = await getSession();
  if (!user) return;

  const supabase = await createServerSupabase();
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });

  const base = user.role === "nanny" ? "/nanny/messages" : "/family/messages";
  revalidatePath(base);
}

/** The signed-in family's contact allowance, or null for anyone else. */
export async function loadContactState() {
  const user = await getSession();
  if (!user || user.role !== "family") return null;

  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("my_contact_state");
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

/** Blocks a thread. Either side can do it, and it stops messages both ways. */
export async function blockConversationAction(
  _prev: { error?: string; message?: string },
  formData: FormData,
): Promise<{ error?: string; message?: string }> {
  const user = await requireRole(["family", "nanny"]);
  const conversationId = String(formData.get("conversationId") ?? "");
  if (!z.string().uuid().safeParse(conversationId).success) return { error: "Invalid thread." };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("conversations")
    .update({ blocked_by: user.id, blocked_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) return { error: "Could not block this conversation." };

  const base = user.role === "nanny" ? "/nanny/messages" : "/family/messages";
  revalidatePath(`${base}/${conversationId}`);
  return { message: "This conversation is blocked. Neither of you can send messages." };
}
