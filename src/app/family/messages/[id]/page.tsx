import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { loadThread } from "@/lib/messaging/queries";
import { ThreadView } from "@/components/messaging/thread-view";

export const metadata: Metadata = { title: "Conversation" };

export default async function FamilyThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("family", `/family/messages/${id}`);
  if (!user.emailVerified) redirect("/verify-email");

  const thread = await loadThread(user, id);
  if (!thread) notFound();

  return <ThreadView thread={thread} backHref="/family/messages" />;
}
