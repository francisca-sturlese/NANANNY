"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Portal, useScrollLock } from "@/components/ui/portal";

/**
 * A photo that grows when asked.
 *
 * A family deciding about a person wants to see her face properly, not at
 * card size. Click opens the full image over the page; click anywhere or
 * Escape closes it. No zoom library: one state, one portal, and the same
 * signed URL the thumbnail already loaded.
 */
export function LightboxImage({
  src,
  alt,
  className,
  width,
  height,
}: {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  const [open, setOpen] = useState(false);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element --
          signed URLs are short-lived; next/image cannot cache them */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={`cursor-zoom-in ${className ?? ""}`}
        onClick={() => setOpen(true)}
      />
      {open && (
        <Portal>
          <div
            role="dialog"
            aria-label={alt}
            className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-foreground/80 p-4 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              aria-label="Close"
              className="absolute top-4 right-4 grid size-11 place-items-center rounded-pill bg-background/90 text-foreground"
              onClick={() => setOpen(false)}
            >
              <X className="size-5" aria-hidden />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-xl"
            />
          </div>
        </Portal>
      )}
    </>
  );
}
