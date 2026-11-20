import { getTopic, listTopics, relatedLiveTopics } from "@/lib/gemini/catalog";
import { evidenceForFamily } from "@/lib/evidence";
import { fail, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const query = new URL(req.url).searchParams;
  const mode = query.get("mode") === "replay" ? "replay" : "live";
  const family = await getTopic(params.slug, mode, query.get("event") || undefined);
  if (!family) return fail("UNSUPPORTED_FAMILY", "Topic not found or not a compatible family.", 404);
  const related = mode === "live" ? relatedLiveTopics(family) : (await listTopics(mode)).families;
  const relatedContracts = related
    .filter((candidate) => candidate.sourceEvent.id === family.sourceEvent.id && candidate.slug !== family.slug)
    .flatMap((candidate) => candidate.contracts.slice(0, 1).map((contract) => ({
      slug: candidate.slug,
      label: contract.label,
      instrumentSymbol: contract.instrumentSymbol,
      bid: contract.bid,
      ask: contract.ask,
    })));
  return ok({ family, relatedContracts, evidence: evidenceForFamily(family) });
}
