import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * What stands in for a profile photo that does not exist yet.
 *
 * The brand mark rather than an initial: a lone letter in a box reads as a
 * broken image, while the mark makes the empty slot look deliberate and keeps
 * the search grid warm. One component so every surface shows the same thing —
 * pass the same size and radius classes the real photo would get.
 */
export function NannyPhotoFallback({ className }: { className?: string }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center bg-sage-wash", className)}
      aria-hidden
    >
      <LogoMark className="size-1/2" title="" />
    </span>
  );
}
