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
  const [problem, setProblem] = React.useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      onPreview?.(null);
      return;
    }

    setBusy(true);
    setProblem(null);
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
      /**
       * If the picture could not be shrunk, the original is not sent.
       *
       * That was the old behaviour and it was wrong twice over: the original is
       * what was too large to begin with, so the upload fails anyway, and it
       * fails with a message about file types that has nothing to do with what
       * happened. Saying so here is worse for nobody and clearer for everybody.
       */
      setProblem(
        "We could not prepare that photo. Please try a different one, or a smaller version.",
      );
      if (inputRef.current) inputRef.current.value = "";
      onPreview?.(null);
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
      {problem && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {problem}
        </p>
      )}
    </>
  );
}

/**
 * Shrinks a picture without ever holding it at full size.
 *
 * The first version used `createImageBitmap`, which decodes the whole image
 * before anything is scaled. A photo from a modern phone is 18 megapixels, and
 * decoded that is about 72 MB of pixels. WebKit does not throw on that, it
 * kills the rendering process: the tab dies, the form never posts, and Safari
 * shows "This page couldn't load". No server ever saw a request, which is why
 * every fix on the server changed nothing.
 *
 * A renderer crash cannot be caught, so the answer is not to handle it but to
 * never ask for the full decode. An `<img>` element is what browsers optimise
 * for exactly this: Safari downsamples large JPEGs while decoding and manages
 * the memory itself, and `drawImage` scales as it rasterises.
 *
 * EXIF orientation is applied by the browser for an `<img>` by default, which
 * is what `imageOrientation: "from-image"` was there for.
 */
async function shrink(file: File): Promise<File | null> {
  if (!file.type.startsWith("image/")) return null;

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);

    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);

    // Already small, and already a format the server accepts.
    if (scale === 1 && (file.type === "image/jpeg" || file.type === "image/png")) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);

    /**
     * What the browser actually produced, not what it was asked for.
     *
     * `toBlob` takes a type as a request, not an instruction. WebKit cannot
     * encode WebP and quietly returns a PNG, and naming that .webp with a webp
     * mime type produced a file whose declared type and first bytes disagreed.
     * The server checks exactly that and refused it.
     *
     * JPEG is asked for rather than WebP: every browser can encode it, a
     * photograph is what JPEG is for, and a PNG of a photograph is several
     * times larger for no benefit.
     */
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) return null;

    const produced = blob.type || "image/jpeg";
    const extension =
      produced === "image/webp" ? "webp" : produced === "image/png" ? "png" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";

    return new File([blob], `${base}.${extension}`, { type: produced });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** An image that has finished loading, or a rejection. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("could not read that image"));
    image.src = url;
  });
}
