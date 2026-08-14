"use client";

import * as React from "react";
import { Input } from "@/components/ui/field";

/**
 * A file input that shrinks the picture before it leaves the phone.
 *
 * This used to happen on the server with sharp. Sharp is a native Node module
 * and cannot load on the deployment target at all, which took down every
 * onboarding page in the worker while the build stayed green. Moving the work
 * here removes that dependency from the request path entirely.
 *
 * It is also the better place for it. A phone camera produces three to five
 * megabytes; uploading that over mobile data and then throwing away 95% of it
 * server-side wastes the bandwidth of the person we are asking to sign up.
 * Resizing first means a photo upload costs about 60 KB.
 *
 * The server still checks type and size. This is a convenience, not a control:
 * the form can be posted without ever running this code, and anything that
 * decides whether a file is acceptable has to live where a request cannot
 * skip it.
 */

/** Longest edge. More than any place a profile photo is shown. */
const MAX_EDGE = 800;
const QUALITY = 0.82;

export function PhotoInput({
  id,
  name,
  onPreview,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type" | "onChange"> & {
  /** Called with an object URL when a picture is chosen, for a live preview. */
  onPreview?: (url: string | null) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      onPreview?.(null);
      return;
    }

    setBusy(true);
    try {
      const resized = await shrink(file);
      if (resized && inputRef.current) {
        // Replacing the input's own FileList is what makes the smaller file the
        // one the form posts. Without this the original is still submitted and
        // the work here achieves nothing.
        const transfer = new DataTransfer();
        transfer.items.add(resized);
        inputRef.current.files = transfer.files;
      }
      onPreview?.(URL.createObjectURL(inputRef.current?.files?.[0] ?? file));
    } catch {
      // A picture we cannot decode here is left exactly as the person chose it.
      // The server will refuse it with a message, which is better than this
      // component deciding silently that their photo is unusable.
      onPreview?.(URL.createObjectURL(file));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Input
        {...props}
        id={id}
        name={name}
        ref={inputRef}
        type="file"
        onChange={handleChange}
        aria-busy={busy}
      />
      {busy && (
        <p className="mt-2 text-xs text-muted" role="status">
          Preparing your photo…
        </p>
      )}
    </>
  );
}

/**
 * Draws the picture into a canvas at the target size and reads it back as WebP.
 *
 * `createImageBitmap` is used rather than an `<img>` because it applies EXIF
 * orientation itself. Without that, a photo taken in portrait on an iPhone
 * arrives rotated ninety degrees, which is the single most common complaint
 * about any upload form.
 *
 * Returns null when the picture is already small enough, so a file that needs
 * nothing done to it is passed through untouched.
 */
async function shrink(file: File): Promise<File | null> {
  if (!file.type.startsWith("image/")) return null;

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  // Already small and already a format we want: leave it alone.
  if (scale === 1 && (file.type === "image/webp" || file.type === "image/jpeg")) {
    bitmap.close();
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return null;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", QUALITY),
  );
  if (!blob) return null;

  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.webp`, { type: "image/webp" });
}
