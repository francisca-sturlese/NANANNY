/**
 * The icons a phone uses once the site is on somebody's home screen.
 *
 * Built from the same geometry as `components/brand/logo.tsx` rather than by
 * exporting an image from a design tool, so there is one source for the mark
 * and a colour change cannot leave the app icon behind. The logo is drawn on a
 * page with a white background; an icon has no page under it, so the background
 * is painted here.
 *
 * Two shapes, because phones ask for different things.
 *
 * Android masks icons to whatever shape the launcher uses, and crops to a
 * circle of 80% of the width in the worst case, so the maskable icon keeps the
 * mark inside a safe middle and lets the background take the loss. Feeding it
 * the tight artwork gets the figures' heads sliced off.
 *
 * iOS applies its own rounded corners to a square and does not crop, so that
 * one is drawn tight. Anything transparent there comes out black.
 *
 * Run:  node scripts/make-app-icons.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

/**
 * The deep tones, not the pastels the site header uses.
 *
 * The brand rule is that sage, peach and butter are supporting colours and the
 * `-deep` variants are for anything that has to be read. An icon sixty pixels
 * wide, sitting on somebody's home screen between a bank and a messaging app,
 * has to be read. Rendered in the pastels it is a pale smudge: compared side by
 * side at that size, the figures and the heart stop separating.
 *
 * The geometry is identical to `components/brand/logo.tsx`, so it is plainly
 * the same mark. Only the fills differ, and they differ in the direction the
 * brand sheet already prescribes.
 */
const MARK = `
  <circle cx="31" cy="21" r="11.5" fill="#5F7A6D" />
  <circle cx="69" cy="19" r="12.5" fill="#C26A4A" />
  <path d="M50 90C34.5 81.5 18 70.5 18 55.5C18 43.5 26 35.5 36 35.5C43.5 35.5 49 41 50 47.5Z" fill="#5F7A6D" />
  <path d="M50 90C65.5 81.5 82 70.5 82 55.5C82 43.5 74 35.5 64 35.5C56.5 35.5 51 41 50 47.5Z" fill="#C26A4A" />
  <path d="M50 81.5C42.5 76.5 33 69.5 33 60.5C33 53.8 37.4 49.5 43 49.5C46.4 49.5 48.9 51.6 50 54.4C51.1 51.6 53.6 49.5 57 49.5C62.6 49.5 67 53.8 67 60.5C67 69.5 57.5 76.5 50 81.5Z" fill="#FCF6CA" />
`;

/**
 * @param inset how much of the canvas the mark occupies, 1 meaning edge to edge
 */
function svg(inset) {
  const size = 100 / inset;
  const offset = (size - 100) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-offset} ${-offset} ${size} ${size}" width="1024" height="1024">
  <rect x="${-offset}" y="${-offset}" width="${size}" height="${size}" fill="#FFFFFF" />
  ${MARK}
</svg>`;
}

// Tight for iOS, and for the plain Android icon.
const tight = Buffer.from(svg(0.78));
// Everything inside the middle 60%, which survives any launcher mask.
const maskable = Buffer.from(svg(0.56));

mkdirSync("public/icons", { recursive: true });

const outputs = [
  ["public/icons/icon-192.png", tight, 192],
  ["public/icons/icon-512.png", tight, 512],
  ["public/icons/maskable-192.png", maskable, 192],
  ["public/icons/maskable-512.png", maskable, 512],
  /**
   * Written into `src/app`, not `public`.
   *
   * Next emits the `<link rel="apple-touch-icon">` tag from a file it finds by
   * convention in the app directory. The same bytes sitting in `public` are
   * served on request and referenced by nothing, so iOS falls back to a
   * screenshot of the page, which is what an installed icon looked like before
   * this moved.
   */
  ["src/app/apple-icon.png", tight, 180],
];

for (const [path, source, size] of outputs) {
  const png = await sharp(source).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(path, png);
  console.log(`${path}  ${size}x${size}  ${Math.round(png.length / 1024)} KB`);
}
