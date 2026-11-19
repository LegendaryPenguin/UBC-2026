import { redirect } from "next/navigation";

export default function LegacyWatchlistDetail() {
  redirect("/explore?view=watched");
}
