import type { MarketFamily } from "@/lib/domain/types";
import recorded from "@/fixtures/gemini-crypto-nov20.json";
import settled from "@/fixtures/gemini-settled-binary.json";
import { binaryFromEvent, familyFromEvent } from "@/lib/gemini/families";
import { getEvent, listEvents } from "@/lib/gemini/client";
import { flattenEvents, type GeminiEvent } from "@/lib/gemini/types";
import { rankMarketMatches, type marketDiscovery } from "@/lib/research";

type Cache = {
  live: MarketFamily[];
  search: MarketFamily[];
  fetchedAt: string | null;
  error: string | null;
};

const runtime = globalThis as typeof globalThis & { __thesisTopicCatalog?: Cache };
const cache: Cache = runtime.__thesisTopicCatalog ??= { live: [], search: [], fetchedAt: null, error: null };

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

function dedupeFamilies(families: MarketFamily[]) {
  const seen = new Set<string>();
  return families.filter((family) => {
    if (seen.has(family.slug)) return false;
    seen.add(family.slug);
    return true;
  });
}

function familiesFromEvents(events: GeminiEvent[], fetchedAt: string, hash: string, live: boolean): MarketFamily[] {
  const families: MarketFamily[] = [];
  for (const event of flattenEvents(events)) {
    if (!live) {
      const family = familyFromEvent(event, fetchedAt, hash, false);
      if (family) {
        families.push(family);
        continue;
      }
    }
    for (const contract of event.contracts ?? []) {
      const binary = binaryFromEvent(event, fetchedAt, hash, live, contract.id);
      if (binary) families.push(binary);
    }
  }
  return dedupeFamilies(families);
}

function mergeSearchCache(families: MarketFamily[]) {
  const bySlug = new Map(cache.search.map((family) => [family.slug, family]));
  for (const family of families) bySlug.set(family.slug, family);
  cache.search = [...bySlug.values()].sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt)).slice(0, 2_000);
}

export async function refreshLiveFamilies(): Promise<Cache> {
  try {
    const families: MarketFamily[] = [];
    let fetchedAt = new Date().toISOString();
    let offset = 0;
    for (let page = 0; page < 8; page += 1) {
      const { response, fetchedAt: at, hash } = await listEvents({ status: "active", limit: 100, offset });
      fetchedAt = at;
      families.push(...familiesFromEvents(response.data, at, hash, true));
      const total = response.pagination?.total ?? response.data.length;
      offset += response.data.length || 100;
      if (!response.data.length || offset >= total) break;
    }
    cache.live = dedupeFamilies(families);
    cache.fetchedAt = fetchedAt;
    cache.error = null;
  } catch (err) {
    cache.error = err instanceof Error ? err.message : "Gemini unavailable";
  }
  return cache;
}

export async function searchLiveTopics(query: string): Promise<{
  families: MarketFamily[];
  freshnessLabel: string;
  liveError: string | null;
}> {
  const needle = query.trim();
  if (!needle) return listTopics("live");
  try {
    const { response, fetchedAt, hash } = await listEvents({
      status: "active",
      search: needle.slice(0, 120),
      limit: 100,
    });
    const families = familiesFromEvents(response.data, fetchedAt, hash, true);
    mergeSearchCache(families);
    return {
      families,
      freshnessLabel: `Gemini search · ${fetchedAt}`,
      liveError: null,
    };
  } catch (err) {
    return {
      families: [],
      freshnessLabel: "Live Gemini search unavailable",
      liveError: err instanceof Error ? err.message : "Gemini unavailable",
    };
  }
}

export async function listTopics(
  mode: "live" | "replay",
  options?: { q?: string },
): Promise<{
  families: MarketFamily[];
  freshnessLabel: string;
  liveError: string | null;
}> {
  const query = options?.q?.trim();
  if (mode === "replay") {
    const families = [...recordedFamilies(), ...settledBinaries()];
    const filtered = query
      ? families.filter((family) => `${family.title} ${family.question} ${family.slug} ${family.sourceEvent.category}`.toLowerCase().includes(query.toLowerCase()))
      : families;
    return {
      families: filtered,
      freshnessLabel: "Labeled walkthrough snapshots",
      liveError: null,
    };
  }

  if (query) return searchLiveTopics(query);

  const age = cache.fetchedAt ? Date.now() - Date.parse(cache.fetchedAt) : Infinity;
  if (age > 30_000) await refreshLiveFamilies();
  if (cache.live.length === 0) {
    return {
      families: [],
      freshnessLabel: cache.error ? "Live Gemini data unavailable" : "No compatible markets in the latest pull",
      liveError: cache.error,
    };
  }
  return {
    families: cache.live,
    freshnessLabel: cache.fetchedAt ? `Gemini snapshot ${cache.fetchedAt}` : "Live",
    liveError: cache.error,
  };
}

export async function getTopic(slug: string, mode: "live" | "replay", eventTicker?: string): Promise<MarketFamily | null> {
  if (mode === "live") {
    const match = cache.search.find((family) => family.slug === slug && Date.now() - Date.parse(family.fetchedAt) < 30_000);
    if (match) return match;
    if (eventTicker && /^[a-z0-9._:-]{1,180}$/i.test(eventTicker)) {
      try {
        const { event, fetchedAt, hash } = await getEvent(eventTicker);
        const families = familiesFromEvents([event], fetchedAt, hash, true);
        mergeSearchCache(families);
        return families.find((family) => family.slug === slug) || null;
      } catch {
        // Try the catalog if the direct event lookup is unavailable.
      }
    }
  }
  const { families } = await listTopics(mode);
  const direct = families.find((f) => f.slug === slug || f.id.toLowerCase() === slug.toLowerCase());
  if (direct) return direct;
  if (mode !== "live") return null;
  return cache.search.find((f) => f.slug === slug || f.id.toLowerCase() === slug.toLowerCase())
    || cache.live.find((f) => f.slug === slug || f.id.toLowerCase() === slug.toLowerCase())
    || null;
}

export function relatedLiveTopics(family: MarketFamily) {
  return dedupeFamilies([...cache.search, ...cache.live])
    .filter((item) => item.sourceEvent.id === family.sourceEvent.id && item.slug !== family.slug);
}

export async function discoverTopics(mode: "live" | "replay", discovery: ReturnType<typeof marketDiscovery>) {
  const results = await Promise.all(discovery.queries.map((q) => listTopics(mode, { q })));
  const failed = results.find((result) => result.liveError);
  return {
    families: rankMarketMatches(results.flatMap((result) => result.families), discovery),
    freshnessLabel: results.find((result) => !result.liveError)?.freshnessLabel || "Market search unavailable",
    liveError: results.every((result) => result.liveError) ? failed?.liveError ?? null : null,
  };
}

export function featuredSlug(): string {
  return recordedFamilies()[0]?.slug ?? "btc2611202200";
}
