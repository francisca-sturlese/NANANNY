import "server-only";

/**
 * What the server will accept as a profile photo.
 *
 * The picture is resized in the browser before it is sent, which is where the
 * bandwidth saving belongs. None of that is trusted here: the form can be
 * posted by anything, and the browser is not where a rule is enforced.
 *
 * What this cannot do any more is decode the image. That used to happen with
 * sharp, which also had the effect of rejecting a file that was not really a
 * picture. Sharp cannot load on the deployment target, so the check is now
 * structural: the declared type, the size, and the first bytes of the file
 * itself, which a renamed executable does not have.
 */

const MAX_BYTES = 5 * 1024 * 1024;

const ACCEPTED = new Map<string, number[][]>([
  // JPEG
  ["image/jpeg", [[0xff, 0xd8, 0xff]]],
  // PNG
  ["image/png", [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  // WebP is RIFF....WEBP: the first four bytes, then the tag at offset 8.
  ["image/webp", [[0x52, 0x49, 0x46, 0x46]]],
]);

export type ImageCheck = { ok: true; contentType: string } | { ok: false; error: string };

export async function checkImage(file: File): Promise<ImageCheck> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `That image is too large. The limit is ${MAX_BYTES / 1024 / 1024} MB.`,
    };
  }

  const signatures = ACCEPTED.get(file.type);
  if (!signatures) {
    return { ok: false, error: "Please choose a JPG, PNG or WebP image." };
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  const matches = signatures.some((signature) =>
    signature.every((byte, index) => head[index] === byte),
  );
  if (!matches) {
    return { ok: false, error: "That file is not the kind of image it claims to be." };
  }

  // RIFF alone is also AVI and WAV. The WEBP tag at offset 8 is what separates
  // them, and without it a media file renamed to .webp would pass.
  if (file.type === "image/webp") {
    const tag = String.fromCharCode(...head.slice(8, 12));
    if (tag !== "WEBP") {
      return { ok: false, error: "That file is not a WebP image." };
    }
  }

  return { ok: true, contentType: file.type };
}

/**
 * The extension the stored object should carry, taken from the verified type
 * rather than from the name the browser sent.
 */
export function extensionFor(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}
