import { getEvent, payloadHash } from "@/lib/gemini/client";
import { flattenEvents, type GeminiEvent } from "@/lib/gemini/types";
import { binaryFromEvent, familyFromEvent } from "@/lib/gemini/families";
import recorded from "@/fixtures/gemini-crypto-nov20.json";
import settled from "@/fixtures/gemini-settled-binary.json";
import { fail, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { ticker: string } }) {
  const mode = new URL(req.url).searchParams.get("mode") === "replay" ? "replay" : "live";
  const ticker = params.ticker;
  let event: GeminiEvent;
  let fetchedAt: string;
  let hash: string;

  if (mode === "replay") {
    const candidates = flattenEvents([
      ...(recorded as { events: GeminiEvent[] }).events,
      ...(settled as { events: GeminiEvent[] }).events,
    ]);
    const match = candidates.find((item) => item.ticker.toLowerCase() === ticker.toLowerCase());
    if (!match) return fail("NOT_FOUND", "This event is not in the recorded Gemini walkthrough.", 404);
    event = match;
    fetchedAt = match.status === "settled"
      ? (settled as { fetchedAt: string }).fetchedAt
      : (recorded as { fetchedAt: string }).fetchedAt;
    hash = payloadHash(event);
  } else {
    try {
      const result = await getEvent(ticker);
      event = result.event;
      fetchedAt = result.fetchedAt;
      hash = result.hash;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Gemini event request failed";
      if (reason === "Gemini event 404") return fail("NOT_FOUND", "Gemini could not find this event ticker.", 404);
      return fail("GEMINI_EVENT_UNAVAILABLE", reason, 503);
    }
  }

  const compatibleTopics = flattenEvents([event]).flatMap((candidate) => {
    const family = familyFromEvent(candidate, fetchedAt, hash, mode === "live");
    if (family) return [family];
    return (candidate.contracts ?? []).flatMap((contract) => {
      const binary = binaryFromEvent(candidate, fetchedAt, hash, mode === "live", contract.id);
      return binary ? [binary] : [];
    });
  });
  return ok({
    event,
    mode,
    source: mode === "live" ? "Gemini public prediction markets API" : "Recorded Gemini snapshot",
    fetchedAt,
    payloadHash: hash,
    compatibleTopicSlug: compatibleTopics[0]?.slug ?? null,
    compatibleTopics: compatibleTopics.map((family) => ({
      slug: family.slug,
      familyId: family.id,
      familyVersion: family.version,
      contractId: family.contracts[0]?.id,
      contractLabel: family.contracts[0]?.label,
    })),
  });
}
