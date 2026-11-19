import { redirect } from "next/navigation";

export default function LegacyCalendarPage() {
  redirect("/explore?view=timeline");
}
