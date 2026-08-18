"use client";

import { useActionState } from "react";
import { saveBlogPostAction, deleteBlogPostAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/auth/actions";
import { Input, Textarea, Field } from "@/components/ui/field";
import { SubmitButton, FormError, FormMessage } from "@/components/auth/form-parts";

/**
 * The editor. Plain fields and a big box: the body speaks markdown-lite
 * (blank line between paragraphs, "## heading", "- list", **bold**,
 * [link](https://...)), which is the whole language on purpose — nothing an
 * admin types here can become running code on the public page.
 */
export function BlogPostForm({
  post,
}: {
  post?: {
    id: string;
    slug: string;
    title: string;
    description: string;
    body: string;
    published: boolean;
  };
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveBlogPostAction, {});
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(
    deleteBlogPostAction,
    {},
  );

  return (
    <div className="max-w-2xl space-y-6">
      <form action={action} className="space-y-4">
        {post && <input type="hidden" name="postId" value={post.id} />}

        <Field label="Title" htmlFor="title" required>
          <Input id="title" name="title" required defaultValue={post?.title ?? ""} />
        </Field>

        <Field
          label="Slug"
          htmlFor="slug"
          required
          hint="The address: nananny.com/blog/your-slug. Lowercase words joined by hyphens."
        >
          <Input id="slug" name="slug" required defaultValue={post?.slug ?? ""} />
        </Field>

        <Field
          label="Description"
          htmlFor="description"
          hint="One or two sentences. Shown on the blog index and to search engines."
        >
          <Textarea
            id="description"
            name="description"
            className="min-h-16"
            defaultValue={post?.description ?? ""}
          />
        </Field>

        <Field
          label="Body"
          htmlFor="body"
          hint="Blank line between paragraphs. ## for a heading, - for a list item, **bold**, [link text](https://...)."
        >
          <Textarea
            id="body"
            name="body"
            className="min-h-96 font-mono text-sm"
            defaultValue={post?.body ?? ""}
          />
        </Field>

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="published"
            defaultChecked={post?.published ?? false}
            className="size-4"
          />
          Published — visible to everyone on the blog
        </label>

        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        <FormError message={state.error} />
        <FormMessage message={state.message} />
      </form>

      {post && (
        <form action={deleteAction} className="border-t border-border pt-4">
          <input type="hidden" name="postId" value={post.id} />
          <SubmitButton variant="outline" size="sm" pendingLabel="…">
            Delete this post
          </SubmitButton>
          <FormError message={deleteState.error} />
          <FormMessage message={deleteState.message} />
        </form>
      )}
    </div>
  );
}
