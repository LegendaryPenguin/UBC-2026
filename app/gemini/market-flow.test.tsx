// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GeminiEvent } from "@/lib/gemini/types";

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));

import GeminiMarketsPage from "@/app/gemini/page";

const bitcoinEvent: GeminiEvent = {
  id: "event-btc",
  title: "Bitcoin Friday",
  ticker: "BTCFRIDAY",
  status: "active",
  category: "Crypto",
  expiryDate: "2026-11-20T23:59:00.000Z",
  termsLink: "https://gemini.example/events/btc-rules",
  contracts: [{ id: "contract-95", label: "BTC at or above $95,000", instrumentSymbol: "GEMI-BTCFRIDAY-HI95K", status: "active" }],
};
const etherEvent: GeminiEvent = {
  id: "event-eth",
  title: "Ether Friday",
  ticker: "ETHFRIDAY",
  status: "active",
  category: "Crypto",
  expiryDate: "2026-11-20T23:59:00.000Z",
  contracts: [{ id: "contract-eth", label: "ETH above $3,000", instrumentSymbol: "GEMI-ETHFRIDAY-HI3K", status: "active" }],
};
const settledEvent: GeminiEvent = { ...bitcoinEvent, id: "event-settled", title: "Bitcoin November settlement", ticker: "BTCNOVSETTLED", status: "settled" };

let fetchMock: ReturnType<typeof vi.fn>;
let failLiveReads: number;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("thesis_mode", "live");
  failLiveReads = 0;
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.startsWith("/api/gemini/events?")) return new Response(JSON.stringify({ error: { message: `Unexpected request: ${url}` } }), { status: 500 });
    const params = new URL(url, "http://localhost").searchParams;
    const mode = params.get("mode") === "live" ? "live" : "replay";
    if (mode === "live" && failLiveReads > 0) {
      failLiveReads -= 1;
      return new Response(JSON.stringify({ error: { message: "Gemini feed timed out." } }), { status: 502 });
    }
    const offset = Number(params.get("offset") || 0);
    const status = params.get("status");
    const events = mode === "replay" ? [settledEvent] : status === "settled" ? [settledEvent] : [offset ? etherEvent : bitcoinEvent];
    const total = mode === "live" && status !== "settled" ? 2 : 1;
    return new Response(JSON.stringify({ events, pagination: { limit: 1, offset, total }, mode, source: mode === "live" ? "Gemini API" : "Recorded walkthrough", fetchedAt: "2026-11-16T10:00:00.000Z", live: mode === "live" }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Gemini full-catalog route", () => {
  it("searches the catalog, inspects a market, and pages through results", async () => {
    render(<GeminiMarketsPage />);
    const bitcoin = await screen.findByRole("link", { name: "Bitcoin Friday" });
    expect(bitcoin.getAttribute("href")).toBe("/gemini/BTCFRIDAY?mode=live");
    expect(screen.getByRole("link", { name: "Inspect event" }).getAttribute("href")).toBe("/gemini/BTCFRIDAY?mode=live");

    fireEvent.change(screen.getByLabelText("Search Gemini events"), { target: { value: "Bitcoin" } });
    fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: "crypto" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => {
      const params = new URL(String(url), "http://localhost").searchParams;
      return params.get("q") === "Bitcoin" && params.get("category") === "crypto";
    })).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("link", { name: "Ether Friday" })).toBeTruthy();
    expect(screen.getByText("Showing 2–2 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByRole("link", { name: "Bitcoin Friday" })).toBeTruthy();
  });

  it("recovers from a Gemini read failure by retrying or confirming Replay", async () => {
    failLiveReads = 2;
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    render(<GeminiMarketsPage />);

    expect(await screen.findByText(/Gemini feed timed out\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Explore" }).getAttribute("href")).toBe("/explore");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/Gemini feed timed out\./)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => new URL(String(url), "http://localhost").searchParams.get("mode") === "live").length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("button", { name: "Switch to Replay" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(localStorage.getItem("thesis_mode")).toBe("live");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch to Replay" }));
    expect(localStorage.getItem("thesis_mode")).toBe("replay");
    expect(await screen.findByRole("link", { name: "Bitcoin November settlement" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Inspect event" }).getAttribute("href")).toBe("/gemini/BTCNOVSETTLED?mode=replay");
  });
});
