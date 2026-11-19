import { redirect } from "next/navigation";

export default function LegacySearchPage() {
  redirect("/explore?focus=search");
}
