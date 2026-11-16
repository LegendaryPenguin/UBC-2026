// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MarketFamily } from "@/lib/domain/types";

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));

import Explore from "@/app/explore/page";

const market: MarketFamily = {
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
  contracts: [{ id: "contract-95", instrumentSymbol: "GEMI-BTC-HI95", eventId: "event-btc", ticker: "HI95", label: "$95,000 or above", description: "BTC resolves at or above $95,000.", termsUrl: "https://example.com/95-rules", source: "BTC-USD", strike: { type: "above", value: "95000", availableAt: null }, expiryDate: "2026-11-20T23:59:00.000Z", effectiveDate: null, status: "active", resolutionSide: null, resolvedAt: null, bid: "0.45", ask: "0.5", noBid: "0.45", noAsk: "0.5", lastTrade: "0.47", priceHistory: [], orderBook: null }],
  predicates: [{ id: "contract-95", contractId: "contract-95", instrumentSymbol: "GEMI-BTC-HI95", label: "$95,000 or above", kind: "gte", threshold: 95_000, unit: "USD" }],
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

let liveCatalogError = false;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("thesis_mode", "live");
  liveCatalogError = false;
  let postCount = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/topics?")) {
      const mode = new URL(url, "http://localhost").searchParams.get("mode");
      if (mode === "live" && liveCatalogError) return new Response(JSON.stringify({ families: [], freshnessLabel: "Live Gemini data unavailable", liveError: "Gemini API connection timed out." }), { status: 200 });
      return new Response(JSON.stringify({ families: [{ ...market, mode: mode === "replay" ? "replay" : "live" }], freshnessLabel: mode === "replay" ? "Labeled walkthrough snapshots" : "Live Gemini data", liveError: null }), { status: 200 });
    }
    if (url === "/api/watchlists" && init?.method === undefined) return new Response(JSON.stringify({ watchlists: [] }), { status: 200 });
    if (url === "/api/watchlists" && init?.method === "POST") {
      postCount += 1;
      if (postCount === 1) return new Response(JSON.stringify({ error: { message: "Sign in is required to save watched topics." } }), { status: 401 });
      return new Response(JSON.stringify({ watchlist: { id: "watch-1", name: "Research topics", slugs: ["btc-friday"] } }), { status: 200 });
    }
    if (url === "/api/watchlists/watch-1" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ watchlist: { id: "watch-1", name: "Research topics", slugs: body.slugs } }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "Unexpected Explore request." } }), { status: 500 });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Explore to research flow", () => {
  it("searches Gemini markets, recovers from sign-in-required watch, then adds, removes, and opens research", async () => {
    render(<Explore />);
    expect(await screen.findByRole("link", { name: "Where will Bitcoin finish Friday?" })).toBeTruthy();
    expect(screen.getByText(/1 selected Gemini contract · observes/)).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Search markets or topics" }), { target: { value: "Bitcoin" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input) === "/api/topics?mode=live&q=Bitcoin")).toBe(true));
    expect(await screen.findByText("Live Gemini data")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Watch topic" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Sign in to save watched topics.");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth");
    expect(screen.getByRole("button", { name: "Watch topic" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Watch topic" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Watched topics" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove from watchlist" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove from watchlist" }));
    expect((await screen.findByRole("status")).textContent).toContain("Removed Where will Bitcoin finish Friday?");
    expect(await screen.findByRole("button", { name: "Watch topic" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open research" }).getAttribute("href")).toBe("/topics/btc-friday");
  });

  it("keeps a confirmed Replay recovery when live Gemini discovery is unavailable", async () => {
    liveCatalogError = true;
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    render(<Explore />);

    await screen.findByRole("button", { name: "Switch to Replay" });
    const liveError = screen.getByRole("status");
    expect(liveError.textContent).toContain("Gemini API connection timed out.");
    expect(liveError.textContent).toContain("Replay uses labeled walkthrough data.");
    const switchButton = screen.getByRole("button", { name: "Switch to Replay" });
    fireEvent.click(switchButton);
    expect(confirm).toHaveBeenCalledOnce();
    expect(localStorage.getItem("thesis_mode")).toBe("live");
    expect(screen.getByRole("button", { name: "Switch to Replay" })).toBeTruthy();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch to Replay" }));
    expect(localStorage.getItem("thesis_mode")).toBe("replay");
    expect(await screen.findByText("Labeled walkthrough snapshots")).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Open research" })).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input) === "/api/topics?mode=replay&q=")).toBe(true);
    expect(screen.queryByRole("button", { name: "Switch to Replay" })).toBeNull();
  });
});
