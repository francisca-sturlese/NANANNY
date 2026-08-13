/**
 * Generates a placeholder avatar for every seeded nanny and uploads it to the
 * private nanny-photos bucket.
 *
 * Why this exists: a profile photo is a REQUIRED field for approval, so a seed
 * that marks profiles `approved` with photo_url null contradicts its own rules —
 * and every dev screen would render an empty circle.
 *
 * The avatars are abstract brand-coloured marks with an initial. They are not
 * photographs and they are not of anyone. Rendered through Playwright (already
 * a dev dependency) because the bucket only accepts real raster image types —
 * SVG is deliberately not in allowed_mime_types, since an SVG upload can carry
 * script.
 *
 * Run:  node scripts/seed-avatars.mjs
 */

import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PALETTES = [
  { bg: "#C7D2CC", fg: "#3d5147" },
  { bg: "#FCE1D8", fg: "#8f4a30" },
  { bg: "#FCF6CA", fg: "#6b5a11" },
];

function avatarHtml(initial, palette) {
  return `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  .a{width:320px;height:320px;display:grid;place-items:center;background:${palette.bg};
     font-family:-apple-system,system-ui,sans-serif;position:relative;overflow:hidden}
  .a::after{content:"";position:absolute;width:320px;height:320px;border-radius:50%;
     background:rgba(255,255,255,.35);top:120px;left:-90px}
  .i{position:relative;z-index:1;font-size:150px;font-weight:600;color:${palette.fg};
     letter-spacing:-.04em}
</style>
<div class="a"><span class="i">${initial}</span></div>`;
}

const { data: nannies, error } = await supabase
  .from("nanny_profiles")
  .select("id, user_id, first_name, photo_url, status")
  .order("created_at");

if (error) {
  console.error("Could not read nanny profiles:", error.message);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 320, height: 320 } });

let uploaded = 0;
let skipped = 0;

for (const [index, nanny] of nannies.entries()) {
  // Leave the draft profile without a photo on purpose: it keeps one seeded
  // nanny genuinely incomplete, so the submission gate is exercised by the
  // test suite instead of being skipped.
  if (nanny.photo_url || nanny.status === "draft") {
    skipped++;
    continue;
  }

  const initial = (nanny.first_name ?? "N").charAt(0).toUpperCase();
  const palette = PALETTES[index % PALETTES.length];

  await page.setContent(avatarHtml(initial, palette));
  const png = await page.locator(".a").screenshot({ type: "png" });

  // Same key shape the app uses: <owner uuid>/<file>. The storage policies pin
  // the first segment to auth.uid(), so seeded files sit exactly where a real
  // upload from that account would.
  const path = `${nanny.user_id}/seed-avatar.png`;

  const { error: uploadError } = await supabase.storage
    .from("nanny-photos")
    .upload(path, png, { contentType: "image/png", upsert: true });

  if (uploadError) {
    console.error(`  ✗ ${nanny.first_name}: ${uploadError.message}`);
    continue;
  }

  const { error: updateError } = await supabase
    .from("nanny_profiles")
    .update({ photo_url: path })
    .eq("id", nanny.id);

  if (updateError) {
    console.error(`  ✗ ${nanny.first_name}: ${updateError.message}`);
    continue;
  }

  uploaded++;
}

await browser.close();

console.log(`Seed avatars: ${uploaded} uploaded, ${skipped} already had a photo.`);
