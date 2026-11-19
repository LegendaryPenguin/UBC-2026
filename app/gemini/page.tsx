import { redirect } from "next/navigation";

export default function LegacyGeminiCatalog() {
  redirect("/explore?view=gemini");
}
