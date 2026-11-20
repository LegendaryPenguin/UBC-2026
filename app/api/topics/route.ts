import { discoverTopics, listTopics } from "@/lib/gemini/catalog";
import { marketDiscovery } from "@/lib/research";
import { ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "replay" ? "replay" : "live";
  const search = (url.searchParams.get("q") || "").trim();
  const data = search && url.searchParams.get("discovery") === "1"
    ? await discoverTopics(mode, marketDiscovery(search.slice(0, 300)))
    : await listTopics(mode, { q: search || undefined });
  return ok(data);
}
