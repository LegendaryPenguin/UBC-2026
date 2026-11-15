import { listTopics } from "@/lib/gemini/catalog";
import { ok } from "@/lib/server/http";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "replay" ? "replay" : "live";
  const search = (url.searchParams.get("q") || "").toLowerCase();
  const data = await listTopics(mode);
  const families = data.families.filter((f) => {
    if (!search) return true;
    return `${f.title} ${f.question} ${f.slug}`.toLowerCase().includes(search);
  });
  return ok({ ...data, families });
}
