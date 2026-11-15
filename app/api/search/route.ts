import { listTopics } from "@/lib/gemini/catalog";
import { ok } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate } from "@/lib/server/store";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").toLowerCase();
  const mode = new URL(req.url).searchParams.get("mode") === "live" ? "live" : "replay";
  const { families } = await listTopics(mode);
  const topics = families.filter((f) => `${f.title} ${f.slug}`.toLowerCase().includes(q)).slice(0, 8);
  const ctx = currentSession();
  const theses = ctx
    ? mutate((s) => s.theses.filter((t) => t.rationale.toLowerCase().includes(q) || t.topicSlug.includes(q)).slice(0, 8))
    : [];
  return ok({ topics, theses, help: q ? [{ title: "What a quote is", href: "/help/quotes" }] : [] });
}
