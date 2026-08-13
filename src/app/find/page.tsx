import { redirect } from "next/navigation";

/** The PRD lists /find; search lives at /nannies. Keep both addresses working. */
export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  const qs = query.toString();
  redirect(qs ? `/nannies?${qs}` : "/nannies");
}
