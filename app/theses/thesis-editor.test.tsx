// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";

const navigation = vi.hoisted(() => ({ push: vi.fn(), historySeries: [] as unknown[] }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "thesis-1" }), useRouter: () => ({ push: navigation.push }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/VoicePanel", () => ({ VoicePanel: () => <div data-testid="voice-panel" /> }));
vi.mock("@/components/MarketPriceHistory", () => ({ MarketPriceHistory: ({ series }: { series: unknown[] }) => { navigation.historySeries = series; return <div data-testid="price-history" />; } }));
vi.mock("@/components/GeminiLiveMarketFeed", () => ({ GeminiLiveMarketFeed: () => <div data-testid="live-market-feed" /> }));
vi.mock("@/lib/gemini/use-market-stream", () => ({ useGeminiMarketStream: () => ({ status: "connected", book: null, trades: [{ kind: "trade", instrumentSymbol: "GEMI-BTCFRIDAY-HI95K", eventAt: "2026-11-15T01:00:00.000Z", tradeId: "trade-1", price: "0.51", quantity: "1" }], error: null, retry: vi.fn() }) }));

import ThesisEditor from "@/app/theses/[id]/page";

const thesis: ThesisRevision = {
  id: "thesis-1",
  topicSlug: "btc-friday-contract",
  familyId: "btc-friday",
  familyVersion: "1",
  template: "binary",
  direction: "yes",
  lowerThreshold: null,
  upperThreshold: null,
  rationale: "Price may finish above the threshold.",
  invalidation: "",
  evidenceIds: [],
  status: "draft",
  revision: 1,
  createdAt: "2026-11-15T00:00:00.000Z",
  updatedAt: "2026-11-15T00:00:00.000Z",
};

const contract = {
  id: "contract-95",
  instrumentSymbol: "GEMI-BTCFRIDAY-HI95K",
  eventId: "event-btc",
  ticker: "HI95K",
  label: "$95,000 or above",
  description: "If BTC is $95,000 or above at Friday's 4pm UTC settlement, resolve YES. Otherwise, resolve NO.",
  termsUrl: "https://example.com/exact-contract-rules",
  source: "LS-LRRR-XBTUSD",
  strike: { value: "95000", type: "above", availableAt: "2026-11-20T21:00:00.000Z" },
  expiryDate: "2026-11-20T23:59:00.000Z",
  effectiveDate: null,
  status: "active",
  resolutionSide: null,
  resolvedAt: null,
  bid: "0.5",
  ask: "0.52",
  lastTrade: "0.51",
  noBid: null,
  noAsk: null,
  priceHistory: [],
  orderBook: null,
} satisfies MarketFamily["contracts"][number];

function family(overrides: Partial<MarketFamily["contracts"][number]> = {}): MarketFamily {
  return {
    id: "btc-friday",
    slug: "btc-friday-contract",
    version: "1",
    mode: "live",
    title: "Where will Bitcoin finish Friday?",
    question: "Where will Bitcoin finish Friday?",
    observationTime: "2026-11-20T23:59:00.000Z",
    sourceEvent: {
      id: "event-btc",
      ticker: "BTCFRIDAY",
      title: "Bitcoin Friday",
      description: "",
      sourceUrl: "https://example.com/event-rules",
      category: "Crypto",
      status: "active",
      expiryDate: "2026-11-20T23:59:00.000Z",
      effectiveDate: null,
      payloadHash: "0xhash",
      fetchedAt: "2026-11-15T00:00:00.000Z",
      sourceAgency: "Lukka",
      sourceIndex: "BTC-USD",
    },
    contracts: [{ ...contract, ...overrides }],
    predicates: [{ id: "contract-95", contractId: "contract-95", instrumentSymbol: contract.instrumentSymbol, label: contract.label, kind: "gte", threshold: 95_000, unit: "USD" }],
    scenarios: [
      { id: "no", index: 0, label: "NO · $95,000 or above", detail: "NO", minInclusive: null, maxExclusive: 1, predicateYes: { "contract-95": false } },
      { id: "yes", index: 1, label: "YES · $95,000 or above", detail: "YES", minInclusive: 1, maxExclusive: null, predicateYes: { "contract-95": true } },
    ],
    closeTime: "2026-11-20T23:59:00.000Z",
    longstopTime: null,
    familyHash: "0xfamily",
    quotesAvailable: false,
    freshness: "fresh",
    fetchedAt: "2026-11-15T00:00:00.000Z",
  };
}

let activeFamily: MarketFamily;
let failTopicRefresh: boolean;

beforeEach(() => {
  activeFamily = family();
  failTopicRefresh = false;
  navigation.historySeries = [];
  localStorage.setItem("thesis_mode", "live");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/topics/") && failTopicRefresh) return new Response(JSON.stringify({ error: { message: "Topic refresh failed." } }), { status: 502 });
    const body = url === "/api/theses/thesis-1"
      ? { thesis }
      : { family: activeFamily, evidence: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  navigation.push.mockClear();
});

describe("thesis research contract rules", () => {
  it("anchors a binary view to its contract history and appends streamed Gemini trade prints", async () => {
    render(<ThesisEditor />);
    expect(await screen.findByTestId("price-history")).toBeTruthy();
    expect(screen.getByTestId("live-market-feed")).toBeTruthy();
    const series = navigation.historySeries as { label: string; points: { timestamp: string; price: string }[] }[];
    expect(series).toHaveLength(1);
    expect(series[0].label).toBe(contract.label);
    expect(series[0].points).toEqual([{ timestamp: "2026-11-15T01:00:00.000Z", price: "0.51" }]);
  });

  it("shows exact selected-contract wording and keeps event terms separately labeled", async () => {
    render(<ThesisEditor />);

    expect(await screen.findByText(contract.description!)).toBeTruthy();
    expect(screen.getByText(/Strike: above · 95000/)).toBeTruthy();
    expect(screen.getByText("Settlement source: LS-LRRR-XBTUSD")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open exact Gemini contract rules" }).getAttribute("href"))
      .toBe("https://example.com/exact-contract-rules");
    expect(screen.getByRole("link", { name: "Open event-level Gemini terms" }).getAttribute("href"))
      .toBe("https://example.com/event-rules");
  });

  it("does not imply missing contract rules from the event-level link", async () => {
    activeFamily = family({ description: null, termsUrl: null, strike: null, source: null });
    render(<ThesisEditor />);

    expect(await screen.findByText("Gemini did not include contract-level wording in this response.")).toBeTruthy();
    expect(screen.getByText("No contract-specific rules link was supplied.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open exact Gemini contract rules" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open event-level Gemini terms" })).toBeTruthy();
  });

  it("refreshes market data on mode changes without losing edits when refresh fails", async () => {
    render(<ThesisEditor />);
    expect(await screen.findByText(contract.description!)).toBeTruthy();
    const rationale = screen.getByLabelText("Rationale") as HTMLTextAreaElement;
    fireEvent.change(rationale, { target: { value: "Keep my unsaved reasoning." } });

    activeFamily = { ...activeFamily, mode: "replay", freshness: "replay" };
    localStorage.setItem("thesis_mode", "replay");
    act(() => window.dispatchEvent(new CustomEvent("thesis:mode-change", { detail: { mode: "replay" } })));
    expect(await screen.findByText(/Market research refreshed for Replay/)).toBeTruthy();
    expect((screen.getByLabelText("Rationale") as HTMLTextAreaElement).value).toBe("Keep my unsaved reasoning.");

    failTopicRefresh = true;
    localStorage.setItem("thesis_mode", "live");
    act(() => window.dispatchEvent(new CustomEvent("thesis:mode-change", { detail: { mode: "live" } })));
    expect(await screen.findByText(/Market data could not refresh: Topic refresh failed/)).toBeTruthy();
    expect((screen.getByLabelText("Rationale") as HTMLTextAreaElement).value).toBe("Keep my unsaved reasoning.");
  });

  it("keeps a draft through confirmation cancel and provider failure, then confirms only on explicit retry", async () => {
    let patchCount = 0;
    let confirmationPayload: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/theses/thesis-1" && init?.method === "PATCH") {
        patchCount += 1;
        confirmationPayload = JSON.parse(String(init.body));
        if (patchCount === 1) return new Response(JSON.stringify({ error: { message: "Temporary save failure." } }), { status: 503 });
        return new Response(JSON.stringify({ thesis: { ...thesis, status: "confirmed", revision: 2, rationale: "Edited research rationale." } }), { status: 200 });
      }
      const body = url === "/api/theses/thesis-1" ? { thesis } : { family: activeFamily, evidence: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }));
    render(<ThesisEditor />);

    expect(await screen.findByText(contract.description!)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Rationale"), { target: { value: "Edited research rationale." } });
    fireEvent.click(screen.getByRole("button", { name: "Review confirmation" }));
    expect(screen.getByRole("heading", { name: "Review this view" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Review this view" })).toBeNull();
    expect(patchCount).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Review confirmation" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm view and open payoff design" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Temporary save failure.");
    expect(screen.getByRole("button", { name: "Confirm view and open payoff design" })).toBeTruthy();
    expect((screen.getByLabelText("Rationale") as HTMLTextAreaElement).value).toBe("Edited research rationale.");
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm view and open payoff design" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/theses/thesis-1/build"));
    expect(patchCount).toBe(2);
    expect(confirmationPayload).toMatchObject({ action: "confirm", rationale: "Edited research rationale." });
  });
});
