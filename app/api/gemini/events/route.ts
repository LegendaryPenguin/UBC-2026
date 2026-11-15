import { fail, ok } from "@/lib/server/http";
import recorded from "@/fixtures/gemini-crypto-nov20.json";
import settled from "@/fixtures/gemini-settled-binary.json";
import { listPublicEvents } from "@/lib/gemini/client";
import { flattenEvents, type GeminiCollection, type GeminiEvent, type GeminiStatus } from "@/lib/gemini/types";

export const dynamic = "force-dynamic";

const STATUSES: GeminiStatus[] = ["approved", "active", "closed", "under_review", "settled", "invalid"];
const DEFAULT_PAGE_SIZE = 50;

function pageNumber(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

function localEvents(kind: string): GeminiEvent[] {
  if (kind === "settled") {
    return flattenEvents((settled as { events: GeminiEvent[] }).events);
  }
  if (kind === "upcoming") return [];
  return flattenEvents((recorded as { events: GeminiEvent[] }).events);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "replay" ? "replay" : "live";
  const kind = ["events", "upcoming", "settled"].includes(url.searchParams.get("kind") || "")
    ? url.searchParams.get("kind")!
    : "events";
  const requestedStatus = url.searchParams.get("status");
  const status = requestedStatus === "all"
    ? undefined
    : requestedStatus && STATUSES.includes(requestedStatus as GeminiStatus)
      ? requestedStatus as GeminiStatus
      : kind === "events" ? "active" : undefined;
  const category = (url.searchParams.get("category") || "").trim().slice(0, 80);
  const search = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const limit = pageNumber(url.searchParams.get("limit"), DEFAULT_PAGE_SIZE, 500) || DEFAULT_PAGE_SIZE;
  const offset = pageNumber(url.searchParams.get("offset"), 0, 1_000_000);

  if (mode === "replay") {
    const all = localEvents(kind).filter((event) => {
      if (status && event.status !== status) return false;
      if (category && event.category?.toLowerCase() !== category.toLowerCase()) return false;
      if (search && !`${event.title} ${event.ticker} ${event.description || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    const fetchedAt = kind === "settled"
      ? (settled as { fetchedAt: string }).fetchedAt
      : (recorded as { fetchedAt: string }).fetchedAt;
    return ok({
      events: all.slice(offset, offset + limit),
      pagination: { limit, offset, total: all.length },
      mode,
      source: "Recorded Gemini snapshot",
      fetchedAt,
      live: false,
    });
  }

  const collection: GeminiCollection = kind === "upcoming"
    ? "events/upcoming"
    : kind === "settled" ? "events/recently-settled" : "events";
  try {
    const { response, fetchedAt, hash } = await listPublicEvents(collection, {
      status,
      category: category || undefined,
      search: search || undefined,
      limit,
      offset,
    });
    return ok({
      events: response.data,
      pagination: response.pagination ?? { limit, offset, total: response.data.length },
      mode,
      source: "Gemini public prediction markets API",
      fetchedAt,
      payloadHash: hash,
      live: true,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Gemini market data request failed";
    return fail("GEMINI_UNAVAILABLE", `${reason}. Switch to Replay to inspect the recorded walkthrough.`, 503);
  }
}
