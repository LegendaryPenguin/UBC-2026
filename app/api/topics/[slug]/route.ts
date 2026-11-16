import { getTopic, listTopics } from "@/lib/gemini/catalog";
import { evidenceForSlug } from "@/lib/evidence";
import { fail, ok } from "@/lib/server/http";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const mode = new URL(req.url).searchParams.get("mode") === "replay" ? "replay" : "live";
  const family = await getTopic(params.slug, mode);
  if (!family) return fail("UNSUPPORTED_FAMILY", "Topic not found or not a compatible family.", 404);
  const catalog = await listTopics(mode);
  const relatedContracts = catalog.families
    .filter((candidate) => candidate.sourceEvent.id === family.sourceEvent.id && candidate.slug !== family.slug)
    .flatMap((candidate) => candidate.contracts.slice(0, 1).map((contract) => ({
      slug: candidate.slug,
      label: contract.label,
      instrumentSymbol: contract.instrumentSymbol,
      bid: contract.bid,
      ask: contract.ask,
    })));
  return ok({ family, relatedContracts, evidence: evidenceForSlug(family.sourceEvent.ticker.toLowerCase(), mode) });
}
