// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "thesis-1" }),
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/VoicePanel", () => ({ VoicePanel: () => <div data-testid="voice-panel" /> }));
vi.mock("@/components/PayoffChart", () => ({ PayoffChart: () => <div data-testid="payoff-chart" /> }));
vi.mock("@/lib/use-mode-change", () => ({ useModeChange: () => undefined }));

import BuildPage from "@/app/theses/[id]/build/page";
import ComparePage from "@/app/theses/[id]/compare/page";

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
    { id: "bin-95000-100000", index: 1, label: "At least $95,000 and below $100,000", detail: "95000 ≤ value < 100000", minInclusive: 95_000, maxExclusive: 100_000, predicateYes: { "contract-95": true, "contract-100": false } },
    { id: "at-least-100000", index: 2, label: "At least $100,000", detail: "value ≥ 100000", minInclusive: 100_000, maxExclusive: null, predicateYes: { "contract-95": true, "contract-100": true } },
  ],
  closeTime: "2026-11-20T23:59:00.000Z",
  longstopTime: null,
  familyHash: "0xfamily",
  quotesAvailable: false,
  freshness: "replay",
  fetchedAt: "2026-11-15T00:00:00.000Z",
};

function mockApi() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url === "/api/theses/thesis-1"
      ? { thesis }
      : url === "/api/status"
        ? { services: [{ id: "quotes", state: "available" }, { id: "geminiTrade", state: "unqualified" }] }
        : { family: market, evidence: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
}

beforeEach(() => {
  navigation.push.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("thesis_mode", "replay");
  vi.stubGlobal("fetch", mockApi());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Build and Compare interaction sequence", () => {
  it("edits and restores a basket leg, selects a scenario, persists the draft, and continues to Compare", async () => {
    const view = render(<BuildPage />);
    expect(await screen.findByRole("heading", { name: "Does this basket match your view?" })).toBeTruthy();
    expect(screen.getAllByLabelText("Payout allocation (USDC)")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove leg" })[0]);
    expect(screen.getAllByRole("button", { name: "Restore leg" })).toHaveLength(1);
    expect(JSON.parse(sessionStorage.getItem("thesis-basket:thesis-1")!)[0].enabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "At least $100,000" }));
    expect(screen.getByText("Basket 0.00 · view 0.00 USDC · matches")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore leg" }));
    expect(screen.getByText("Basket 50.00 · view 0.00 USDC · differs")).toBeTruthy();

    const allocation = screen.getAllByLabelText("Payout allocation (USDC)")[0];
    fireEvent.change(allocation, { target: { value: "75" } });
    expect(JSON.parse(sessionStorage.getItem("thesis-basket:thesis-1")!)[0].payoutAmount).toBe("75");

    view.unmount();
    render(<BuildPage />);
    expect(await screen.findByDisplayValue("75")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Compare constructions" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/theses/thesis-1/compare?maxPayout=100"));
    expect(JSON.parse(sessionStorage.getItem("thesis-basket:thesis-1")!)[0].payoutAmount).toBe("75");
  });

  it("compares only available choices on the same payout basis and reviews without creating a quote", async () => {
    localStorage.setItem("thesis_mode", "paper");
    const view = render(<ComparePage />);
    expect(await screen.findByRole("heading", { name: "Compare constructions" })).toBeTruthy();
    expect(screen.getByText(/same maximum gross payout/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Arc custom range/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Arc custom range/ }));
    expect(screen.getByRole("button", { name: /Arc custom range/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText("Arc custom position")).toHaveLength(2);
    const review = screen.getByRole("link", { name: "Review selected construction" });
    expect(review.getAttribute("href")).toContain("construction=arc-custom");

    fireEvent.click(screen.getByRole("button", { name: /One Gemini position/ }));
    expect(screen.getByRole("button", { name: /One Gemini position/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: "Review selected construction" }).getAttribute("href")).toContain("construction=gemini-single");
    fireEvent.click(screen.getByRole("button", { name: /Arc custom range/ }));

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Review selected construction" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/Enter a positive amount/);
    expect(screen.getByText("Payout by settlement scenario")).toBeTruthy();

    view.unmount();
    const refreshed = render(<ComparePage />);
    expect(await screen.findByRole("heading", { name: "Compare constructions" })).toBeTruthy();
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("0");
    expect(screen.getByText("Payout by settlement scenario")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review selected construction" }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "" } });
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("alert").textContent).toMatch(/Enter a positive amount/);
    refreshed.unmount();
    render(<ComparePage />);
    expect(await screen.findByRole("heading", { name: "Compare constructions" })).toBeTruthy();
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Payout by settlement scenario")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review selected construction" }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /Gemini basket/ }));
    expect(screen.getByRole("link", { name: "Review selected construction" }).getAttribute("href")).toContain("construction=gemini-basket");
    expect(String(vi.mocked(fetch).mock.calls.map(([input]) => input).join(" "))).not.toContain("/api/quotes");
  });
});
