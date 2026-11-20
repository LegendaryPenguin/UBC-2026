// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { EvidenceItem, MarketFamily } from "@/lib/domain/types";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ slug: "btc-friday" }), useRouter: () => ({ push: navigation.push }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/VoicePanel", () => ({ VoicePanel: () => <div data-testid="research-voice-panel" /> }));

import TopicPage from "@/app/topics/[slug]/page";

const family: MarketFamily = {
  id: "btc-friday",
  slug: "btc-friday",
  version: "1",
  mode: "live",
  title: "Where will Bitcoin finish Friday?",
  question: "Bitcoin settlement at Friday's deadline",
  observationTime: "2026-11-20T23:59:00.000Z",
  sourceEvent: {
    id: "event-btc",
    ticker: "BTCFRIDAY",
    title: "Bitcoin Friday",
    description: "",
    sourceUrl: "https://gemini.example/event-rules",
    category: "Crypto",
    status: "active",
    expiryDate: "2026-11-20T23:59:00.000Z",
    effectiveDate: null,
    payloadHash: "0xeventhash",
    fetchedAt: "2026-11-16T10:00:00.000Z",
    sourceAgency: "Lukka",
    sourceIndex: "LS-LRRR-XBTUSD",
  },
  contracts: [{
    id: "contract-95",
    instrumentSymbol: "GEMI-BTCFRIDAY-HI95K",
    eventId: "event-btc",
    ticker: "HI95K",
    label: "$95,000 or above",
    description: "If BTC is at or above $95,000 at Friday's settlement, resolve YES; otherwise resolve NO.",
    termsUrl: "https://gemini.example/contracts/hi95k-rules",
    source: "LS-LRRR-XBTUSD",
    strike: { type: "above", value: "95000", availableAt: "2026-11-20T21:00:00.000Z" },
    expiryDate: "2026-11-20T23:59:00.000Z",
    effectiveDate: null,
    status: "active",
    resolutionSide: null,
    resolvedAt: null,
    bid: "0.45",
    ask: "0.5",
    noBid: "0.45",
    noAsk: "0.5",
    lastTrade: "0.47",
    priceHistory: [],
    orderBook: null,
  }],
  predicates: [{ id: "contract-95", contractId: "contract-95", instrumentSymbol: "GEMI-BTCFRIDAY-HI95K", label: "$95,000 or above", kind: "gte", threshold: 95_000, unit: "USD" }],
  scenarios: [
    { id: "no", index: 0, label: "NO · $95,000 or above", detail: "NO", minInclusive: null, maxExclusive: 1, predicateYes: { "contract-95": false } },
    { id: "yes", index: 1, label: "YES · $95,000 or above", detail: "YES", minInclusive: 1, maxExclusive: null, predicateYes: { "contract-95": true } },
  ],
  closeTime: "2026-11-20T23:59:00.000Z",
  longstopTime: null,
  familyHash: "0xfamily",
  quotesAvailable: false,
  freshness: "fresh",
  fetchedAt: "2026-11-16T10:00:00.000Z",
};

const evidence: EvidenceItem = {
  id: "evidence-inflows",
  stance: "supports",
  url: "https://example.com/inflows",
  publisher: "Market desk",
  title: "Demand strengthens",
  publishedAt: "2026-11-16T09:00:00.000Z",
  retrievedAt: "2026-11-16T09:10:00.000Z",
  excerpt: "Spot demand increased during the week.",
  mode: "live",
};

let fetchMock: ReturnType<typeof vi.fn>;
let failTopicReads: number;
let failDraftCreates: number;
let activeMode: "live" | "replay";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("thesis_mode", "live");
  activeMode = "live";
  failTopicReads = 0;
  failDraftCreates = 0;
  navigation.push.mockClear();
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/topics/btc-friday?")) {
      if (failTopicReads > 0) {
        failTopicReads -= 1;
        return new Response(JSON.stringify({ error: { message: "Gemini topic details could not be reached." } }), { status: 502 });
      }
      return new Response(JSON.stringify({ family: { ...family, mode: activeMode, freshness: activeMode === "replay" ? "replay" : "fresh" }, relatedContracts: [], evidence: [evidence] }), { status: 200 });
    }
    if (url === "/api/theses" && init?.method === "POST") {
      if (failDraftCreates > 0) {
        failDraftCreates -= 1;
        return new Response(JSON.stringify({ error: { message: "Draft could not be saved. Retry when the service is available." } }), { status: 503 });
      }
      return new Response(JSON.stringify({ thesis: { id: "thesis-42" } }), { status: 201 });
    }
    return new Response(JSON.stringify({ error: { message: `Unexpected request: ${url}` } }), { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Gemini Research topic flow", () => {
  it("keeps contract and event rules distinct, then retries manual draft creation", async () => {
    failDraftCreates = 1;
    render(<TopicPage />);

    expect(await screen.findByRole("heading", { name: "Where will Bitcoin finish Friday?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Read full rules" }));
    expect(screen.getByText(family.contracts[0].description!)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open exact Gemini contract rules" }).getAttribute("href")).toBe("https://gemini.example/contracts/hi95k-rules");
    expect(screen.getByRole("link", { name: "Open event-level Gemini rules" }).getAttribute("href")).toBe("https://gemini.example/event-rules");
    expect(screen.getByRole("link", { name: "Explore" }).getAttribute("href")).toBe("/explore");
    expect(screen.getByText("Demand strengthens")).toBeTruthy();
    expect(screen.getByText(/Gemini has not returned a history series/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close settlement rules" }));
    fireEvent.click(screen.getByRole("button", { name: /Demand strengthens/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save source" }));
    fireEvent.click(screen.getByRole("button", { name: "Close evidence detail" }));

    const create = screen.getByRole("button", { name: "Create draft" });
    expect(create.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "NO The proposition fails" }));
    fireEvent.click(create);
    expect((await screen.findByRole("alert")).textContent).toContain("Draft could not be saved. Retry when the service is available.");
    expect(screen.getByRole("button", { name: "Retry draft creation" }).hasAttribute("disabled")).toBe(false);
    const firstPayload = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/theses" && init?.method === "POST")?.[1]?.body));
    expect(firstPayload).toMatchObject({ topicSlug: "btc-friday", mode: "live", template: "binary", direction: "no", evidenceIds: ["evidence-inflows"] });

    fireEvent.click(screen.getByRole("button", { name: "Retry draft creation" }));
    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/theses/thesis-42"));
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/theses" && init?.method === "POST")).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers Retry market data and an Explore path when the initial topic read fails", async () => {
    failTopicReads = 1;
    render(<TopicPage />);

    expect((await screen.findByRole("alert")).textContent).toBe("Gemini topic details could not be reached.");
    expect(screen.getByRole("link", { name: "Explore" }).getAttribute("href")).toBe("/explore");
    fireEvent.click(screen.getByRole("button", { name: "Retry market data" }));
    expect(await screen.findByRole("heading", { name: "Where will Bitcoin finish Friday?" })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/topics/btc-friday?")).length).toBe(2);
  });

  it("refreshes topic data after a confirmed app mode change", async () => {
    render(<TopicPage />);
    expect(await screen.findByRole("heading", { name: "Gemini prices" })).toBeTruthy();
    activeMode = "replay";
    localStorage.setItem("thesis_mode", "replay");
    act(() => window.dispatchEvent(new CustomEvent("thesis:mode-change", { detail: { mode: "replay" } })));

    expect(await screen.findByText(/Illustrative replay market and evidence/)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/topics/btc-friday?mode=live")).toHaveLength(2);
  });
});
