// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseGeminiMarketStreamMessage } from "@/lib/gemini/market-stream";
import { useGeminiMarketStream } from "@/lib/gemini/use-market-stream";

const SYMBOL = "GEMI-BTC-FRIDAY-HI95K";

describe("Gemini public market stream messages", () => {
  it("accepts book ticker data only for the exact instrument and validates YES prices", () => {
    const update = parseGeminiMarketStreamMessage(JSON.stringify({
      E: 1_751_508_438_600_119_168,
      s: SYMBOL,
      b: "0.48",
      B: "5000",
      a: "0.52",
      A: "3200",
      c: "0.50",
      C: "10",
    }), SYMBOL);
    expect(update).toMatchObject({ kind: "book", instrumentSymbol: SYMBOL, bid: "0.48", bidSize: "5000", ask: "0.52", askSize: "3200", lastTrade: "0.50" });
    expect(parseGeminiMarketStreamMessage(JSON.stringify({ E: 1_751_508_438_600_119_168, s: "GEMI-OTHER", b: "0.48" }), SYMBOL)).toBeNull();
    expect(parseGeminiMarketStreamMessage(JSON.stringify({ E: 1_751_508_438_600_119_168, s: SYMBOL, b: "1.01" }), SYMBOL)).toMatchObject({ bid: null });
    expect(parseGeminiMarketStreamMessage("not-json", SYMBOL)).toBeNull();
  });

  it("accepts valid trades with provider time and ignores malformed trade payloads", () => {
    const update = parseGeminiMarketStreamMessage(JSON.stringify({ E: 1_759_873_803_503_029_248, s: SYMBOL, t: 2840140956529623, p: "0.50", q: "10" }), SYMBOL);
    expect(update).toMatchObject({ kind: "trade", tradeId: "2840140956529623", price: "0.50", quantity: "10" });
    expect(parseGeminiMarketStreamMessage(JSON.stringify({ E: 1_759_873_803_503_029_248, s: SYMBOL, t: 1, p: "0.50", q: "0" }), SYMBOL)).toBeNull();
  });
});

class FakeWebSocket {
  static readonly CLOSED = 3;
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  send(data: string) { this.sent.push(data); }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(new Event("open")); }
  message(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent); }
  close() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(new CloseEvent("close")); }
}

function FeedProbe({ enabled = true, symbol = SYMBOL }: { enabled?: boolean; symbol?: string }) {
  const feed = useGeminiMarketStream(symbol, enabled);
  return <div>
    <p data-testid="feed-status">{feed.status}</p>
    <p data-testid="feed-book">{JSON.stringify(feed.book)}</p>
    <p data-testid="feed-trades">{JSON.stringify(feed.trades)}</p>
    <p data-testid="feed-error">{feed.error || ""}</p>
    <button onClick={feed.retry}>Retry</button>
  </div>;
}

describe("Gemini public market feed lifecycle", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not connect when the selected data mode is Replay", () => {
    render(<FeedProbe enabled={false} />);
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(screen.getByTestId("feed-status").textContent).toBe("disabled");
  });

  it("subscribes to exact book and trade streams, retains their data, and cleans up", () => {
    const view = render(<FeedProbe />);
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe("wss://ws.gemini.com");
    act(() => socket.open());
    expect(JSON.parse(socket.sent[0])).toEqual({
      id: "thesis-public-market",
      method: "SUBSCRIBE",
      params: [`${SYMBOL}@bookTicker`, `${SYMBOL}@trade`],
    });
    act(() => socket.message({ E: 1_751_508_438_600_119_168, s: SYMBOL, b: "0.48", B: "5", a: "0.52", A: "7" }));
    act(() => socket.message({ E: 1_759_873_803_503_029_248, s: SYMBOL, t: 18, p: "0.50", q: "2" }));
    expect(screen.getByTestId("feed-status").textContent).toBe("connected");
    expect(screen.getByTestId("feed-book").textContent).toContain('"bid":"0.48"');
    expect(screen.getByTestId("feed-trades").textContent).toContain('"price":"0.50"');
    view.unmount();
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("reconnects after a dropped connection and lets the user retry", () => {
    vi.useFakeTimers();
    render(<FeedProbe />);
    const first = FakeWebSocket.instances[0];
    act(() => { first.open(); first.close(); });
    expect(screen.getByTestId("feed-status").textContent).toBe("reconnecting");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(FakeWebSocket.instances).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(screen.getByTestId("feed-status").textContent).toBe("connecting");
  });
});
