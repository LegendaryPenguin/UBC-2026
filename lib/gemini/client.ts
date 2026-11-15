import crypto from "node:crypto";

const BASE = "https://api.gemini.com/v1/prediction-markets";

export type GeminiStatus =
  | "approved"
  | "active"
  | "closed"
  | "under_review"
  | "settled"
  | "invalid";

export interface GeminiPrices {
  buy?: { yes?: string; no?: string };
  sell?: { yes?: string; no?: string };
  bestBid?: string;
  bestAsk?: string;
  lastTradePrice?: string;
}

export interface GeminiContract {
  id: string;
  label: string;
  ticker?: string;
  instrumentSymbol?: string;
  status?: string;
  expiryDate?: string | null;
  effectiveDate?: string | null;
  resolutionSide?: string | null;
  resolvedAt?: string | null;
  termsAndConditionsUrl?: string | null;
  prices?: GeminiPrices | null;
}

export interface GeminiEvent {
  id: string;
  title: string;
  slug?: string;
  description?: string | null;
  category?: string;
  ticker: string;
  status: string;
  type?: string;
  expiryDate?: string | null;
  effectiveDate?: string | null;
  termsLink?: string | null;
  sourceDetails?: { agency?: string; index?: string } | null;
  contracts?: GeminiContract[];
}

export interface GeminiListResponse {
  data: GeminiEvent[];
  pagination?: { limit: number; offset: number; total: number };
}

export function payloadHash(value: unknown): string {
  return "0x" + crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function listEvents(params: {
  status?: GeminiStatus;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ response: GeminiListResponse; fetchedAt: string; hash: string }> {
  const url = new URL(`${BASE}/events`);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.search) url.searchParams.set("search", params.search);
  url.searchParams.set("limit", String(params.limit ?? 100));
  url.searchParams.set("offset", String(params.offset ?? 0));

  const res = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Gemini events ${res.status}`);
  const json = (await res.json()) as GeminiListResponse;
  const fetchedAt = new Date().toISOString();
  return { response: json, fetchedAt, hash: payloadHash(json) };
}

export async function getEvent(ticker: string): Promise<{ event: GeminiEvent; fetchedAt: string; hash: string }> {
  const res = await fetch(`${BASE}/events/${encodeURIComponent(ticker)}`, {
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gemini event ${res.status}`);
  const event = (await res.json()) as GeminiEvent;
  const fetchedAt = new Date().toISOString();
  return { event, fetchedAt, hash: payloadHash(event) };
}
