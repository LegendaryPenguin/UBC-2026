import { redirect } from "next/navigation";

export default function LegacyWatchlistsPage() {
  redirect("/explore?view=watched");
}
