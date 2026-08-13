import { largestSrc, srcSet, type Photo as PhotoMeta } from "@/lib/photos";
import { cn } from "@/lib/utils";

/**
 * Brand photography, sized for the device that is actually asking.
 *
 * A plain <img> with srcset rather than next/image: these are static, known
 * assets already pre-encoded to WebP at four widths by
 * scripts/optimise-photos.mjs, so there is nothing left for a runtime
 * optimiser to do — and this ships no JavaScript at all.
 *
 * `sizes` is the important prop. Without it the browser assumes the image
 * fills the viewport and downloads the largest rendition on a phone, which is
 * exactly the failure this component exists to prevent.
 */
export function Photo({
  photo,
  sizes,
  priority = false,
  className,
  imgClassName,
  rounded = "lg",
}: {
  photo: PhotoMeta;
  /** e.g. "(min-width: 768px) 50vw, 100vw" — always pass a real value. */
  sizes: string;
  /** Only for an above-the-fold hero image. Everything else lazy-loads. */
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  rounded?: "none" | "md" | "lg" | "xl" | "full";
}) {
  const radius = {
    none: "",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full",
  }[rounded];

  return (
    <div
      className={cn("relative overflow-hidden bg-surface", radius, className)}
      // Reserving the aspect ratio is what stops the page shifting as photos
      // arrive — the single biggest cause of a janky mobile scroll.
      style={{
        aspectRatio: photo.aspect,
        backgroundImage: `url(${photo.blurDataURL})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element --
          Deliberate: these are static assets already encoded to WebP at four
          widths by scripts/optimise-photos.mjs, so next/image would re-optimise
          work that is already done and add a runtime cost for nothing. */}
      <img
        src={largestSrc(photo)}
        srcSet={srcSet(photo)}
        sizes={sizes}
        alt={photo.alt}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
        className={cn("absolute inset-0 size-full object-cover", imgClassName)}
      />
    </div>
  );
}
