import { redirect } from "next/navigation";

/** The nanny's settings live on her profile page; keep the old path working. */
export default function NannySettingsPage() {
  redirect("/nanny/profile");
}
