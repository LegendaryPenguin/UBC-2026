import type { MarketFamily } from "@/lib/domain/types";
import recorded from "@/fixtures/gemini-crypto-nov20.json";
import settled from "@/fixtures/gemini-settled-binary.json";
import { binaryFromEvent, familyFromEvent } from "@/lib/gemini/families";
import { listEvents, type GeminiEvent } from "@/lib/gemini/client";

type Cache = {
  live: MarketFamily[];
  fetchedAt: string | null;
  error: string | null;
};

const cache: Cache = { live: [], fetchedAt: null, error: null };

function recordedFamilies(): MarketFamily[] {
  const fetchedAt = (recorded as { fetchedAt: string }).fetchedAt;
  const events = (recorded as { events: GeminiEvent[] }).events;
  return events
    .map((event) => familyFromEvent(event, fetchedAt, "recorded", false))
    .filter((f): f is MarketFamily => Boolean(f))
    .map((f) => ({ ...f, mode: "replay" as const, quotesAvailable: true, freshness: "replay" as const }));
}

function settledBinaries(): MarketFamily[] {
  const fetchedAt = (settled as { fetchedAt: string }).fetchedAt;
  const events = (settled as { events: GeminiEvent[] }).events;
  return events
    .map((event) => binaryFromEvent(event, fetchedAt, "settled", false))
    .filter((f): f is MarketFamily => Boolean(f))
    .map((f) => ({ ...f, mode: "replay" as const, quotesAvailable: false, freshness: "replay" as const }));
}

export async function refreshLiveFamilies(): Promise<Cache> {
  try {
    const { response, fetchedAt } = await listEvents({ status: "active", limit: 100 });
    const families: MarketFamily[] = [];
    for (const event of response.data) {
      if (event.category !== "Crypto") continue;
      const family = familyFromEvent(event, fetchedAt, "live", true);
      if (family) families.push(family);
    }
    cache.live = families;
    cache.fetchedAt = fetchedAt;
    cache.error = null;
  } catch (err) {
    cache.error = err instanceof Error ? err.message : "Gemini unavailable";
  }
  return cache;
}

export async function listTopics(mode: "live" | "replay"): Promise<{
  families: MarketFamily[];
  freshnessLabel: string;
  liveError: string | null;
}> {
  if (mode === "replay") {
    return {
      families: [...recordedFamilies(), ...settledBinaries()],
      freshnessLabel: "Labeled walkthrough snapshots",
      liveError: null,
    };
  }
  const age = cache.fetchedAt ? Date.now() - Date.parse(cache.fetchedAt) : Infinity;
  if (age > 30_000) await refreshLiveFamilies();
  if (cache.live.length === 0) {
    return {
      families: [],
      freshnessLabel: cache.error ? "Live Gemini data unavailable" : "No compatible families in the latest pull",
      liveError: cache.error,
    };
  }
  return {
    families: cache.live,
    freshnessLabel: cache.fetchedAt ? `Gemini snapshot ${cache.fetchedAt}` : "Live",
    liveError: cache.error,
  };
}

export async function getTopic(slug: string, mode: "live" | "replay"): Promise<MarketFamily | null> {
  const { families } = await listTopics(mode);
  return families.find((f) => f.slug === slug || f.id.toLowerCase() === slug.toLowerCase()) ?? null;
}

export function featuredSlug(): string {
  return "btc2611202200";
}
