import crypto from "node:crypto";
import type { GeminiCollection, GeminiEvent, GeminiListParams, GeminiListResponse, GeminiStatus } from "@/lib/gemini/types";

export type {
  GeminiCollection,
  GeminiContract,
  GeminiEvent,
  GeminiListParams,
  GeminiListResponse,
  GeminiOrderbook,
  GeminiOrderbookLevel,
  GeminiPrices,
  GeminiStatus,
} from "@/lib/gemini/types";

const BASE = "https://api.gemini.com/v1/prediction-markets";
type GeminiApiCheck = { at: string; failed: boolean };
type GeminiRuntime = typeof globalThis & { __thesisGeminiApiCheck?: GeminiApiCheck };
const runtime = globalThis as GeminiRuntime;

export function geminiApiHealth() {
  const lastApiCheck = runtime.__thesisGeminiApiCheck ?? null;
  const at = lastApiCheck?.at ?? null;
  const fresh = at != null && Date.now() - Date.parse(at) < 5 * 60_000;
  const state = !fresh ? "unqualified" : lastApiCheck?.failed ? "degraded" : "available";
  const note = !at
    ? "No live public API request has been recorded in this process."
    : `${lastApiCheck?.failed ? "Most recent live request failed" : "Most recent live request succeeded"} at ${at}.`;
  return { state, note };
}
function recordApiCheck(failed: boolean) {
  // Next bundles API routes separately; globalThis shares the observation
  // between the market route and /api/status within the same Node runtime.
  runtime.__thesisGeminiApiCheck = { at: new Date().toISOString(), failed };
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
  return listPublicEvents("events", params);
}

export async function listPublicEvents(
  collection: GeminiCollection,
  params: GeminiListParams = {},
): Promise<{ response: GeminiListResponse; fetchedAt: string; hash: string }> {
  const url = new URL(`${BASE}/${collection}`);
  if (Array.isArray(params.status)) {
    for (const status of params.status) url.searchParams.append("status", status);
  } else if (params.status) {
    url.searchParams.set("status", params.status);
  }
  if (params.category) url.searchParams.set("category", params.category);
  if (params.search) url.searchParams.set("search", params.search);
  url.searchParams.set("limit", String(params.limit ?? 100));
  url.searchParams.set("offset", String(params.offset ?? 0));

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    if (!res.ok) throw new Error(`Gemini ${collection} ${res.status}`);
    const json = (await res.json()) as GeminiListResponse;
    if (!Array.isArray(json.data)) throw new Error("Gemini returned an invalid events response");
    const fetchedAt = new Date().toISOString();
    recordApiCheck(false);
    return { response: json, fetchedAt, hash: payloadHash(json) };
  } catch (error) {
    recordApiCheck(true);
    throw error;
  }
}

export async function getEvent(ticker: string): Promise<{ event: GeminiEvent; fetchedAt: string; hash: string }> {
  try {
    const res = await fetch(`${BASE}/events/${encodeURIComponent(ticker)}`, {
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Gemini event ${res.status}`);
    const event = (await res.json()) as GeminiEvent;
    const fetchedAt = new Date().toISOString();
    recordApiCheck(false);
    return { event, fetchedAt, hash: payloadHash(event) };
  } catch (error) {
    recordApiCheck(true);
    throw error;
  }
}
