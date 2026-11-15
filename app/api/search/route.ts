import { listTopics } from "@/lib/gemini/catalog";
import { ok } from "@/lib/server/http";
import { thesisOwner } from "@/lib/server/session";
import { readStore } from "@/lib/server/store";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100).toLowerCase();
  const mode = new URL(req.url).searchParams.get("mode") === "live" ? "live" : "replay";
  const { families } = await listTopics(mode);
  const topics = families.filter((f) => `${f.title} ${f.slug}`.toLowerCase().includes(q)).slice(0, 8);
  const owner = thesisOwner();
  const theses = owner
    ? readStore().theses
      .filter((thesis) => (thesis as typeof thesis & { accountId?: string }).accountId === owner &&
        (thesis.rationale.toLowerCase().includes(q) || thesis.topicSlug.includes(q)))
      .slice(0, 8)
    : [];
  return ok({ topics, theses, help: q ? [{ title: "What a quote is", href: "/help/quotes" }] : [] });
}
