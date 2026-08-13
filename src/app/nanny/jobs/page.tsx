import { redirect } from "next/navigation";

/** Job search is the same list for everyone; /jobs is its address. */
export default function NannyJobsPage() {
  redirect("/jobs");
}
