import type { DataMode, EvidenceItem, MarketFamily } from "@/lib/domain/types";

export const FEATURED_EVIDENCE: EvidenceItem[] = [
  {
    id: "ev-demand",
    stance: "supports",
    url: "https://www.gemini.com/predictions",
    publisher: "Gemini market terms",
    title: "BTC November 20 observation uses the listed Gemini index source",
    publishedAt: "2026-11-13T10:30:00.000Z",
    retrievedAt: "2026-11-15T01:38:00.000Z",
    excerpt:
      "The listed contracts resolve from the same observation window and source index. Thresholds are inclusive at the printed dollar level.",
    mode: "replay",
  },
  {
    id: "ev-range",
    stance: "challenges",
    url: "https://www.gemini.com/predictions",
    publisher: "Market structure note",
    title: "A YES ticket on a lower threshold still pays above the next threshold",
    publishedAt: "2026-11-14T16:00:00.000Z",
    retrievedAt: "2026-11-15T01:38:00.000Z",
    excerpt:
      "Buying YES on $95,000 or above pays in every higher bin. A range view that stops before $100,000 is a different payoff.",
    mode: "replay",
  },
  {
    id: "ev-challenge",
    stance: "challenges",
    url: "https://www.gemini.com/predictions",
    publisher: "Counter-argument card",
    title: "Spot can print outside a preferred interval even if implied odds look calm",
    publishedAt: "2026-11-14T18:00:00.000Z",
    retrievedAt: "2026-11-15T01:38:00.000Z",
    excerpt:
      "Threshold odds are not a density. They do not bound path, only the listed observation. Treat implied interval math as a quote, not a forecast.",
    mode: "replay",
  },
];

export function evidenceForSlug(slug: string, mode: DataMode = "replay"): EvidenceItem[] {
  if (mode !== "replay") return [];
  if (slug.includes("btc") || slug.includes("eth") || slug.includes("crypto")) return FEATURED_EVIDENCE;
  return FEATURED_EVIDENCE.slice(0, 2);
}

/** Build source cards from the live Gemini listing itself — never invent news headlines. */
export function evidenceForFamily(family: MarketFamily | null | undefined): EvidenceItem[] {
  if (!family) return [];
  const retrievedAt = family.fetchedAt || new Date().toISOString();
  const publishedAt = family.sourceEvent.effectiveDate || family.observationTime || retrievedAt;
  const contract = family.contracts[0];
  const items: EvidenceItem[] = [];

  const wording = contract?.description?.trim() || family.question?.trim();
  const rulesUrl = contract?.termsUrl || family.sourceEvent.sourceUrl || "https://www.gemini.com/predictions";
  const reference = family.contracts.find((item) => item.ask != null && item.noAsk != null &&
    [item.ask, item.noAsk].every((value) => Boolean(value?.trim()) && Number(value) >= 0 && Number(value) <= 1));
  const cents = (value: string | null | undefined) => Number((Number(value) * 100).toFixed(2));
  if (reference) items.push({
    id: "ev-gemini-reference",
    stance: "context",
    url: reference.termsUrl || family.sourceEvent.sourceUrl || rulesUrl,
    publisher: family.mode === "live" ? "Gemini API market snapshot" : "Recorded Gemini API snapshot",
    title: `Both sides of ${reference.label}`,
    publishedAt: retrievedAt,
    retrievedAt,
    excerpt: `Gemini listed ${cents(reference.ask)}¢ YES ask and ${cents(reference.noAsk)}¢ NO ask for “${reference.label}.” These are reference prices for that proposition at its listed observation, so a price move alone does not resolve the outcome.`,
    mode: family.mode,
  });
  if (family.mode === "replay") {
    return [...items, ...evidenceForSlug(family.sourceEvent.ticker.toLowerCase() || family.slug, "replay")];
  }
  if (wording) {
    items.push({
      id: "ev-contract-wording",
      stance: "supports",
      url: rulesUrl,
      publisher: "Gemini contract wording",
      title: `${family.title}: exact listed proposition`,
      publishedAt,
      retrievedAt,
      excerpt: wording,
      mode: "live",
    });
  }

  const source = contract?.source || family.sourceEvent.sourceIndex || family.sourceEvent.sourceAgency;
  if (source) {
    items.push({
      id: "ev-settlement-source",
      stance: "supports",
      url: rulesUrl,
      publisher: "Gemini settlement source",
      title: `Settlement source for ${contract?.label || family.title}`,
      publishedAt,
      retrievedAt,
      excerpt: `Listed settlement source: ${source}. Gemini reference prices are not Arc quotes or certainty.`,
      mode: "live",
    });
  }

  if (contract?.termsUrl || family.sourceEvent.sourceUrl) {
    items.push({
      id: "ev-rules",
      stance: "challenges",
      url: rulesUrl,
      publisher: "Gemini rules link",
      title: "Open the exact contract rules before confirming a view",
      publishedAt,
      retrievedAt,
      excerpt: "Event-level marketing copy is not a substitute for the contract-specific resolution rule. Review the linked terms.",
      mode: "live",
    });
  }

  if (!items.length) {
    items.push({
      id: "ev-listing",
      stance: "challenges",
      url: "https://www.gemini.com/predictions",
      publisher: "Gemini listing",
      title: `${family.title} is listed on Gemini`,
      publishedAt,
      retrievedAt,
      excerpt: "Live news ingestion is not configured. Use the Gemini listing, contract wording, and rules link as primary evidence.",
      mode: "live",
    });
  }

  return items;
}
