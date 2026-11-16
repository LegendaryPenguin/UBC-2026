// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiLiveMarketFeed } from "@/components/GeminiLiveMarketFeed";

describe("Gemini live market feed panel", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("uses the REST snapshot while reconnecting and offers a manual retry after failure", () => {
    const retry = vi.fn();
    render(<GeminiLiveMarketFeed
      status="unavailable"
      book={null}
      trades={[]}
      error="Gemini market data disconnected. Retry to reconnect."
      retry={retry}
      restBid="0.48"
      restAsk="0.52"
    />);

    expect(screen.getByText("48.0¢")).toBeTruthy();
    expect(screen.getByText("52.0¢")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Retry to reconnect");
    fireEvent.click(screen.getByRole("button", { name: "Retry stream" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows streamed prices, displayed size, and trade data with a clear non-execution label", () => {
    render(<GeminiLiveMarketFeed
      status="connected"
      book={{ kind: "book", feed: "bookTicker", instrumentSymbol: "GEMI-BTC-HI95", eventAt: "2026-11-15T01:00:00.000Z", receivedAt: "2026-11-15T01:00:00.100Z", bid: "0.48", bidSize: "25", ask: "0.52", askSize: "18", lastTrade: "0.51", lastTradeSize: "3" }}
      trades={[{ kind: "trade", instrumentSymbol: "GEMI-BTC-HI95", eventAt: "2026-11-15T01:01:00.000Z", tradeId: "t1", price: "0.51", quantity: "3" }]}
      error={null}
      retry={vi.fn()}
      restBid="0.45"
      restAsk="0.55"
    />);

    expect(screen.getByRole("status").textContent).toContain("Live market updates");
    expect(screen.getByText("48.0¢")).toBeTruthy();
    expect(screen.getByText("25 contracts")).toBeTruthy();
    expect(screen.getByText("51.0¢")).toBeTruthy();
    expect(screen.getByText(/not a Thesis quote or guaranteed execution/)).toBeTruthy();
  });

  it("does not carry an old REST side forward when the live book reports no price", () => {
    render(<GeminiLiveMarketFeed
      status="connected"
      book={{ kind: "book", feed: "bookTicker", instrumentSymbol: "GEMI-BTC-HI95", eventAt: "2026-11-15T01:00:00.000Z", receivedAt: "2026-11-15T01:00:00.100Z", bid: null, bidSize: null, ask: "0.52", askSize: "18", lastTrade: null, lastTradeSize: null }}
      trades={[]}
      error={null}
      retry={vi.fn()}
      restBid="0.45"
      restAsk="0.55"
    />);

    expect(screen.getByText("Not listed")).toBeTruthy();
    expect(screen.getByText("No live bid listed")).toBeTruthy();
    expect(screen.getByText("52.0¢")).toBeTruthy();
  });

  it("marks a connected stream stale after updates stop and offers a refresh", () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    const lastBookUpdateAt = Date.now();
    render(<GeminiLiveMarketFeed
      status="connected"
      book={{ kind: "book", feed: "depth5", instrumentSymbol: "GEMI-BTC-HI95", eventAt: null, receivedAt: "2026-11-15T01:00:00.100Z", bid: "0.48", bidSize: "25", ask: "0.52", askSize: "18", lastTrade: null, lastTradeSize: null }}
      trades={[]}
      error={null}
      retry={retry}
      restBid="0.45"
      restAsk="0.55"
      lastBookUpdateAt={lastBookUpdateAt}
    />);

    expect(screen.getByRole("status").textContent).toContain("Live market updates");
    act(() => {
      vi.setSystemTime(lastBookUpdateAt + 30_001);
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByRole("status").textContent).toContain("no recent market updates");
    expect(screen.getByRole("alert").textContent).toContain("may be outdated");
    fireEvent.click(screen.getByRole("button", { name: "Retry stream" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("offers recovery when a connected stream never delivers its first update", () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    const connectedAt = Date.now();
    render(<GeminiLiveMarketFeed
      status="connected"
      book={null}
      trades={[]}
      error={null}
      retry={retry}
      restBid={null}
      restAsk={null}
      connectedAt={connectedAt}
    />);

    act(() => {
      vi.setSystemTime(connectedAt + 30_001);
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByRole("alert").textContent).toContain("No book snapshot has arrived");
    fireEvent.click(screen.getByRole("button", { name: "Retry stream" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
