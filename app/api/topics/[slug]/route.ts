import { getTopic } from "@/lib/gemini/catalog";
import { evidenceForSlug } from "@/lib/evidence";
import { fail, ok } from "@/lib/server/http";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const mode = new URL(req.url).searchParams.get("mode") === "replay" ? "replay" : "live";
  const family = await getTopic(params.slug, mode);
  if (!family) return fail("UNSUPPORTED_FAMILY", "Topic not found or not a compatible family.", 404);
  return ok({ family, evidence: evidenceForSlug(params.slug) });
}
