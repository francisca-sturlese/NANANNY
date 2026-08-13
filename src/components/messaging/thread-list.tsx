import Link from "next/link";
import type { ThreadSummary } from "@/lib/messaging/queries";
import { Badge } from "@/components/ui/badge";

/**
 * The conversation list. One tap target per row, the unread count where a
 * thumb can see it, and the last message truncated to one line so the list
 * stays scannable.
 */
export function ThreadList({ threads, basePath }: { threads: ThreadSummary[]; basePath: string }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
      {threads.map((thread) => (
        <li key={thread.id}>
          <Link
            href={`${basePath}/${thread.id}`}
            className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface"
          >
            {thread.otherPhotoUrl ? (
              <img
                src={thread.otherPhotoUrl}
                alt=""
                loading="lazy"
                width={48}
                height={48}
                className="size-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-sage-wash text-sage-deep">
                {thread.otherName[0]}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-semibold">{thread.otherName}</p>
                {thread.lastMessageAt && (
                  <span className="shrink-0 text-xs text-subtle">
                    {relativeTime(thread.lastMessageAt)}
                  </span>
                )}
              </div>
              <p
                className={
                  thread.unread > 0
                    ? "truncate text-sm font-medium"
                    : "truncate text-sm text-muted"
                }
              >
                {thread.blocked ? "Blocked" : (thread.lastMessage ?? "No messages yet")}
              </p>
            </div>

            {thread.unread > 0 && (
              <Badge variant="solid" size="sm">
                {thread.unread}
              </Badge>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function relativeTime(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  const days = Math.floor(minutes / (60 * 24));
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
