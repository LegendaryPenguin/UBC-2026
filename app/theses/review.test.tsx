// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "thesis-1" }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: undefined }) }));
vi.mock("@/components/VoicePanel", () => ({ VoicePanel: () => <div data-testid="voice-panel" /> }));
vi.mock("@/components/ThesisViewPanel", () => ({ ThesisViewPanel: ({ scenarioOutcome }: { scenarioOutcome: string }) => <aside>{scenarioOutcome}</aside> }));
vi.mock("@/lib/use-mode-change", () => ({ useModeChange: () => undefined }));

import ReviewPage from "@/app/theses/[id]/review/page";

const thesis: ThesisRevision = {
  id: "thesis-1",
  topicSlug: "btc-friday",
  familyId: "btc-friday",
  familyVersion: "1",
  template: "range",
  direction: null,
  lowerThreshold: 95_000,
  upperThreshold: 100_000,
  rationale: "Settlement finishes inside the range.",
  invalidation: "",
  evidenceIds: [],
  status: "confirmed",
  revision: 2,
  createdAt: "2026-11-15T00:00:00.000Z",
  updatedAt: "2026-11-15T00:00:00.000Z",
};

const market: MarketFamily = {
  id: "btc-friday",
  slug: "btc-friday",
  version: "1",
  mode: "replay",
  title: "Where will Bitcoin finish Friday?",
  question: "Bitcoin settlement at Friday's deadline",
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
  contracts: [
    { id: "contract-95", instrumentSymbol: "GEMI-BTC-HI95", eventId: "event-btc", ticker: "HI95", label: "$95,000 or above", description: "BTC resolves at or above $95,000.", termsUrl: "https://example.com/95-rules", source: "BTC-USD", strike: { type: "above", value: "95000", availableAt: null }, expiryDate: "2026-11-20T23:59:00.000Z", effectiveDate: null, status: "active", resolutionSide: null, resolvedAt: null, bid: "0.45", ask: "0.5", noBid: "0.45", noAsk: "0.5", lastTrade: "0.47", priceHistory: [], orderBook: null },
    { id: "contract-100", instrumentSymbol: "GEMI-BTC-HI100", eventId: "event-btc", ticker: "HI100", label: "$100,000 or above", description: "BTC resolves at or above $100,000.", termsUrl: "https://example.com/100-rules", source: "BTC-USD", strike: { type: "above", value: "100000", availableAt: null }, expiryDate: "2026-11-20T23:59:00.000Z", effectiveDate: null, status: "active", resolutionSide: null, resolvedAt: null, bid: "0.2", ask: "0.25", noBid: "0.7", noAsk: "0.75", lastTrade: "0.22", priceHistory: [], orderBook: null },
  ],
  predicates: [
    { id: "contract-95", contractId: "contract-95", instrumentSymbol: "GEMI-BTC-HI95", label: "$95,000 or above", kind: "gte", threshold: 95_000, unit: "USD" },
    { id: "contract-100", contractId: "contract-100", instrumentSymbol: "GEMI-BTC-HI100", label: "$100,000 or above", kind: "gte", threshold: 100_000, unit: "USD" },
  ],
  scenarios: [
    { id: "below-95000", index: 0, label: "Below $95,000", detail: "value < 95000", minInclusive: null, maxExclusive: 95_000, predicateYes: { "contract-95": false, "contract-100": false } },
    { id: "between", index: 1, label: "At least $95,000 and below $100,000", detail: "95000 ≤ value < 100000", minInclusive: 95_000, maxExclusive: 100_000, predicateYes: { "contract-95": true, "contract-100": false } },
    { id: "at-least-100000", index: 2, label: "At least $100,000", detail: "value ≥ 100000", minInclusive: 100_000, maxExclusive: null, predicateYes: { "contract-95": true, "contract-100": true } },
  ],
  closeTime: "2026-11-20T23:59:00.000Z",
  longstopTime: null,
  familyHash: "0xfamily",
  quotesAvailable: false,
  freshness: "replay",
  fetchedAt: "2026-11-15T00:00:00.000Z",
};

let fetchMock: ReturnType<typeof vi.fn>;
let failFirstTopicRead = false;

beforeEach(() => {
  failFirstTopicRead = false;
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("thesis_mode", "paper");
  window.history.replaceState({}, "", "/theses/thesis-1/review?construction=gemini-basket&maxPayout=100&scenario=between");
  sessionStorage.setItem("thesis-basket:thesis-1", JSON.stringify([
    { contractId: "contract-95", side: "yes", payoutAmount: "50", enabled: true },
    { contractId: "contract-100", side: "no", payoutAmount: "50", enabled: true },
  ]));
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/theses/thesis-1") return new Response(JSON.stringify({ thesis }), { status: 200 });
    if (url === "/api/status") return new Response(JSON.stringify({ services: [{ id: "quotes", state: "available" }, { id: "geminiTrade", state: "unqualified" }] }), { status: 200 });
    if (url.startsWith("/api/topics/") && failFirstTopicRead) {
      failFirstTopicRead = false;
      return new Response(JSON.stringify({ error: { message: "Market data is temporarily unavailable." } }), { status: 503 });
    }
    return new Response(JSON.stringify({ family: market, evidence: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("selected construction review", () => {
  it("shows exact basket terms, updates the selected scenario, and cancels without requesting a quote", async () => {
    render(<ReviewPage />);
    expect(await screen.findByRole("heading", { name: "Review Gemini basket" })).toBeTruthy();
    expect(screen.getByText("Paper simulation")).toBeTruthy();
    expect(screen.getByText("BTC resolves at or above $95,000.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Open Gemini contract rules" }).map((link) => link.getAttribute("href")))
      .toContain("https://example.com/95-rules");
    expect(screen.getByText("2 independent order(s); may fill separately")).toBeTruthy();
    expect(screen.getByText("The basket is 2 separate Gemini order(s). Coordinated submission and partial-fill recovery are not qualified, so this basket cannot be submitted as one action. You can return to Build, or select a supported single-contract or Arc construction in Compare.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Below $95,000" }));
    expect(screen.getByRole("button", { name: "Below $95,000" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Selected scenario · Below \$95,000/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Return to Build" }).getAttribute("href")).toBe("/theses/thesis-1/build");
    expect(screen.getByRole("link", { name: "Cancel review and return to Compare" }).getAttribute("href"))
      .toContain("/theses/thesis-1/compare?maxPayout=100&scenario=below-95000");
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain("/api/quotes");
    expect(screen.queryByRole("button", { name: "Request paper quote" })).toBeNull();
  });

  it("offers retry after a market-data failure and restores the selected review", async () => {
    failFirstTopicRead = true;
    render(<ReviewPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Market data is temporarily unavailable.");
    expect(screen.getByRole("link", { name: "Cancel review" }).getAttribute("href")).toBe("/theses/thesis-1/compare");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Review Gemini basket" })).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/topics/")).length).toBe(2));
  });
});
