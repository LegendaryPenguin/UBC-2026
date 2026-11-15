import type { DataMode, EvidenceItem } from "@/lib/domain/types";

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
