"use client";

import { useActionState, useEffect, useOptimistic, useRef, startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, ChevronLeft } from "lucide-react";
import { markReadAction, sendMessageAction } from "@/lib/messaging/actions";
import type { ThreadDetail } from "@/lib/messaging/queries";
import { Button } from "@/components/ui/button";
import { ReportButton } from "@/components/safety/report-button";
import { BlockButton } from "@/components/safety/block-button";

/**
 * A conversation, built like a phone chat rather than a page with a form.
 *
 * The layout is a fixed-height column: header, scrolling messages, composer
 * pinned to the bottom. `100dvh` rather than `100vh` — on iOS Safari `vh`
 * ignores the browser chrome, which pushes the composer under it. The
 * VisualViewport listener does the same job for the on-screen keyboard, which
 * would otherwise cover the field the user is typing into.
 */
export function ThreadView({
  thread,
  backHref,
}: {
  thread: ThreadDetail;
  backHref: string;
}) {
  const [state, action] = useActionState<{ error?: string }, FormData>(sendMessageAction, {});
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  // Sent messages appear instantly; the server confirms a moment later.
  const [optimistic, addOptimistic] = useOptimistic(
    thread.messages,
    (current, body: string) => [
      ...current,
      {
        id: `pending-${current.length}`,
        body,
        mine: true,
        createdAt: new Date().toISOString(),
        readAt: null,
      },
    ],
  );

  // Opening the thread is what marks it read. Done here rather than in the
  // page: the action calls revalidatePath, which throws if run during render.
  useEffect(() => {
    void markReadAction(thread.id);
  }, [thread.id]);

  // A chat opens at the bottom, always.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [optimistic.length]);

  // Keep the composer above the on-screen keyboard. Without this the field is
  // hidden behind it on iOS the moment it is focused.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !composerRef.current) return;

    const reposition = () => {
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      composerRef.current!.style.transform = `translateY(-${Math.max(overlap, 0)}px)`;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    };

    vv.addEventListener("resize", reposition);
    vv.addEventListener("scroll", reposition);
    return () => {
      vv.removeEventListener("resize", reposition);
      vv.removeEventListener("scroll", reposition);
    };
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2.5">
        <Link
          href={backHref}
          aria-label="Back to messages"
          className="grid size-11 shrink-0 place-items-center rounded-pill text-muted"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>

        {thread.otherPhotoUrl ? (
          <img
            src={thread.otherPhotoUrl}
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sage-wash text-sm text-sage-deep">
            {thread.otherName[0]}
          </span>
        )}

        <div className="min-w-0 flex-1">
          {thread.otherProfileHref ? (
            <Link href={thread.otherProfileHref} className="truncate font-semibold">
              {thread.otherName}
            </Link>
          ) : (
            <p className="truncate font-semibold">{thread.otherName}</p>
          )}
        </div>
      </header>

      {/* Quiet, but always in the same place. Someone who needs it should not
          have to hunt, and nobody else should be nudged towards it. */}
      {thread.otherUserId && (
        <div className="flex shrink-0 items-center justify-end gap-4 border-b border-border px-4 py-1.5">
          <ReportButton
            targetKind="user"
            targetId={thread.otherUserId}
            what={`${thread.otherName}`}
          />
          <BlockButton userId={thread.otherUserId} name={thread.otherName} />
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {optimistic.length === 0 && (
          <p className="mx-auto max-w-xs py-10 text-center text-sm text-muted">
            Say hello. Messages here are between the two of you.
          </p>
        )}

        <ul className="space-y-2">
          {optimistic.map((message, i) => {
            const previous = optimistic[i - 1];
            const newDay =
              !previous || dayOf(previous.createdAt) !== dayOf(message.createdAt);

            return (
              <li key={message.id}>
                {newDay && (
                  <p className="py-3 text-center text-xs text-subtle">
                    {formatDay(message.createdAt)}
                  </p>
                )}
                <div className={message.mine ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      message.mine
                        ? "max-w-[80%] rounded-lg rounded-br-sm bg-foreground px-3.5 py-2.5 text-background"
                        : "max-w-[80%] rounded-lg rounded-bl-sm bg-surface px-3.5 py-2.5"
                    }
                  >
                    <p className="text-[0.9375rem] leading-snug whitespace-pre-wrap">
                      {message.body}
                    </p>
                    <p
                      className={
                        message.mine
                          ? "mt-1 text-right text-[0.625rem] text-background/60"
                          : "mt-1 text-right text-[0.625rem] text-subtle"
                      }
                    >
                      {formatTime(message.createdAt)}
                      {message.mine && message.readAt && " · Read"}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        ref={composerRef}
        className="pb-safe shrink-0 border-t border-border bg-background transition-transform duration-150"
      >
        {thread.blocked ? (
          <p className="px-4 py-4 text-center text-sm text-muted">
            This conversation is blocked. Neither of you can send messages.
          </p>
        ) : (
          <form
            ref={formRef}
            action={(formData) => {
              const body = String(formData.get("body") ?? "").trim();
              if (!body) return;
              startTransition(() => addOptimistic(body));
              formRef.current?.reset();
              action(formData);
              // Pull the server's version so read receipts and ordering settle.
              setTimeout(() => router.refresh(), 400);
            }}
            className="flex items-end gap-2 px-3 py-2.5"
          >
            <input type="hidden" name="conversationId" value={thread.id} />
            <textarea
              name="body"
              rows={1}
              placeholder="Write a message"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-lg border border-border bg-background px-3.5 py-2.5 text-[16px] leading-snug placeholder:text-subtle focus:border-foreground focus:outline-none"
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
              onKeyDown={(e) => {
                // Enter sends on a physical keyboard; on a phone it should
                // insert a newline, so only the modifier form sends there.
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
            />
            <Button type="submit" size="md" aria-label="Send" className="size-11 shrink-0 px-0">
              <Send className="size-[1.15rem]" aria-hidden />
            </Button>
          </form>
        )}

        {state.error && (
          <p role="alert" className="px-4 pb-3 text-xs text-danger">
            {state.error}
          </p>
        )}
      </div>
    </div>
  );
}

function dayOf(iso: string) {
  return new Date(iso).toDateString();
}

function formatDay(iso: string) {
  const date = new Date(iso);
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  if (date.toDateString() === today) return "Today";
  if (date.toDateString() === yesterday) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
