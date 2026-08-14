/**
 * Builds the Open Graph card, once, into a static file.
 *
 * Not generated per request with next/og. That pulls a font shaper and an SVG
 * renderer into the server bundle for an image that never changes, and the
 * deployment target is a worker with a hard bundle ceiling. A file on disk
 * costs nothing to serve and cannot fail at the moment somebody shares a link.
 *
 * Run:  node scripts/make-og-image.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const PHOTOS = new URL("../public/photos/", import.meta.url).pathname;
const OUT = new URL("../public/og.png", import.meta.url).pathname;

// The size every platform crops from.
const WIDTH = 1200;
const HEIGHT = 630;

const photo = await readFile(`${PHOTOS}family-sunset-1440.webp`);

/**
 * The wordmark and the line under it, drawn as SVG.
 *
 * Text is drawn as paths would be ideal, but Satoshi is a variable font and
 * sharp resolves `font-family` through fontconfig, which is not something to
 * rely on across machines. A generic sans stack keeps the output identical
 * everywhere, and this is a social card rather than a page of the site.
 */
const overlay = Buffer.from(`
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="veil" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.97"/>
      <stop offset="52%" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="78%" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.12"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#veil)"/>

  <!-- The mark: two figures and a heart, the same shapes as the site logo. -->
  <g transform="translate(80, 150)">
    <circle cx="20" cy="20" r="19" fill="#C7D2CC"/>
    <circle cx="60" cy="20" r="19" fill="#FCE1D8"/>
    <path d="M40 86 C 12 64, 12 40, 28 40 C 36 40, 40 46, 40 50
             C 40 46, 44 40, 52 40 C 68 40, 68 64, 40 86 Z" fill="#FCF6CA"/>
  </g>

  <text x="80" y="330" font-family="Helvetica, Arial, sans-serif" font-size="86"
        font-weight="700" fill="#0b0b0b">NaNanny UAE</text>
  <text x="80" y="396" font-family="Helvetica, Arial, sans-serif" font-size="36"
        fill="#2e2e2e">Find the right nanny for your family</text>
  <text x="80" y="470" font-family="Helvetica, Arial, sans-serif" font-size="26"
        fill="#5a5a5a">Browse for free. Your first contacts cost nothing.</text>
</svg>
`);

await sharp(photo)
  // Anchored right: the left half is covered by the text panel.
  .resize(WIDTH, HEIGHT, { fit: "cover", position: "right top" })
  .composite([{ input: overlay, top: 0, left: 0 }])
  .png({ quality: 90, compressionLevel: 9 })
  .toFile(OUT);

const { size } = await sharp(OUT).metadata().then(async (m) => ({
  size: (await readFile(OUT)).length,
  ...m,
}));

await writeFile(OUT, await readFile(OUT));
console.log(`og.png written, ${Math.round(size / 1024)} KB`);
