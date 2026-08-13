import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { signedUrls, signedUrl } from "@/lib/storage/private-assets";
import type { SessionUser } from "@/lib/auth/dal";

/**
 * Reads for the messaging screens.
 *
 * Both sides use the same shape — a thread has "the other person" — so the
 * conversation list and the thread view are written once rather than twice.
 */

export type ThreadSummary = {
  id: string;
  otherName: string;
  otherPhotoUrl: string | null;
  otherHref: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
  blocked: boolean;
};

export async function loadThreads(user: SessionUser): Promise<ThreadSummary[]> {
  const supabase = await createServerSupabase();
  const isNanny = user.role === "nanny";

  const { data, error } = await supabase
    .from("conversations")
    .select(
      `id, last_message_at, last_message_preview, family_unread_count, nanny_unread_count,
       blocked_at,
       nanny:nanny_profiles!inner(id, first_name, photo_url),
       family:family_profiles!inner(id, display_name, photo_url)`,
    )
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("[messaging] could not load threads:", error.message);
    return [];
  }

  type Row = NonNullable<typeof data>[number];
  const rows = (data ?? []) as Row[];

  // Only a nanny's photo is ever signed here — a family photo is optional and
  // the nanny sees a display name, not a face, unless one was uploaded.
  const photoMap = await signedUrls(
    isNanny ? "family-photos" : "nanny-photos",
    rows.map((r) => (isNanny ? r.family?.photo_url : r.nanny?.photo_url) ?? null),
  );

  return rows.map((row) => {
    const otherPhoto = (isNanny ? row.family?.photo_url : row.nanny?.photo_url) ?? null;
    return {
      id: row.id,
      otherName: isNanny
        ? (row.family?.display_name ?? "A family")
        : (row.nanny?.first_name ?? "Nanny"),
      otherPhotoUrl: otherPhoto ? (photoMap.get(otherPhoto) ?? null) : null,
      otherHref: isNanny ? `/nanny/messages/${row.id}` : `/nannies/${row.nanny?.id}`,
      lastMessage: row.last_message_preview,
      lastMessageAt: row.last_message_at,
      unread: isNanny ? row.nanny_unread_count : row.family_unread_count,
      blocked: Boolean(row.blocked_at),
    };
  });
}

export type ThreadDetail = {
  id: string;
  otherName: string;
  otherPhotoUrl: string | null;
  otherProfileHref: string | null;
  /** The account on the other side, needed to block or report them. */
  otherUserId: string | null;
  blocked: boolean;
  messages: {
    id: string;
    body: string;
    mine: boolean;
    createdAt: string;
    readAt: string | null;
  }[];
};

export async function loadThread(
  user: SessionUser,
  conversationId: string,
): Promise<ThreadDetail | null> {
  const supabase = await createServerSupabase();
  const isNanny = user.role === "nanny";

  // RLS restricts this to threads the caller participates in, so a guessed id
  // simply returns nothing.
  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      `id, blocked_at,
       nanny:nanny_profiles!inner(id, user_id, first_name, photo_url),
       family:family_profiles!inner(id, user_id, display_name, photo_url)`,
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) return null;

  const { data: messages } = await supabase
    .from("messages")
    .select("id, body, sender_id, created_at, read_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);

  const otherPhotoPath =
    (isNanny ? conversation.family?.photo_url : conversation.nanny?.photo_url) ?? null;

  return {
    id: conversation.id,
    otherName: isNanny
      ? (conversation.family?.display_name ?? "A family")
      : (conversation.nanny?.first_name ?? "Nanny"),
    otherPhotoUrl: await signedUrl(
      isNanny ? "family-photos" : "nanny-photos",
      otherPhotoPath,
    ),
    // A nanny has no public family page to link to.
    otherProfileHref: isNanny ? null : `/nannies/${conversation.nanny?.id}`,
    otherUserId:
      (isNanny ? conversation.family?.user_id : conversation.nanny?.user_id) ?? null,
    blocked: Boolean(conversation.blocked_at),
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.sender_id === user.id,
      createdAt: m.created_at,
      readAt: m.read_at,
    })),
  };
}
