import { listTopics } from "@/lib/gemini/catalog";
import { ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "replay" ? "replay" : "live";
  const q = (url.searchParams.get("q") || "").trim();
  const { families, freshnessLabel, liveError } = await listTopics(mode, { q: q || undefined });
  return ok({ families, freshnessLabel, liveError, q });
}
