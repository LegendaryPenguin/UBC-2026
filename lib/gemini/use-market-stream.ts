"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseGeminiMarketStreamMessage, type GeminiMarketStreamUpdate } from "@/lib/gemini/market-stream";

export type GeminiMarketFeedStatus = "disabled" | "connecting" | "connected" | "reconnecting" | "unavailable";

type FeedState = {
  status: GeminiMarketFeedStatus;
  book: Extract<GeminiMarketStreamUpdate, { kind: "book" }> | null;
  trades: Extract<GeminiMarketStreamUpdate, { kind: "trade" }>[];
  error: string | null;
  lastBookUpdateAt: number | null;
  connectedAt: number | null;
};

const EMPTY: FeedState = { status: "disabled", book: null, trades: [], error: null, lastBookUpdateAt: null, connectedAt: null };
const MAX_TRADES = 60;

export function useGeminiMarketStream(instrumentSymbol: string | null, enabled: boolean) {
  const [feed, setFeed] = useState<FeedState>(EMPTY);
  const retryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !instrumentSymbol) {
      setFeed(EMPTY);
      return;
    }
    if (!/^[A-Za-z0-9-]+$/.test(instrumentSymbol) || typeof WebSocket === "undefined") {
      setFeed({ ...EMPTY, status: "unavailable", error: "This browser cannot open the Gemini market-data stream." });
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempts = 0;
    setFeed({ ...EMPTY, status: "connecting" });

    const connect = () => {
      if (disposed) return;
      setFeed((current) => ({ ...current, status: attempts ? "reconnecting" : "connecting", error: null }));
      try {
        socket = new WebSocket("wss://ws.gemini.com");
      } catch {
        scheduleReconnect("Gemini market data could not connect.");
        return;
      }
      const currentSocket = socket;
      currentSocket.onopen = () => {
        if (disposed) return;
        setFeed((current) => ({ ...current, status: "connected", error: null, connectedAt: Date.now() }));
        currentSocket.send(JSON.stringify({
          id: "thesis-public-market",
          method: "SUBSCRIBE",
          params: [`${instrumentSymbol}@depth5`, `${instrumentSymbol}@bookTicker`, `${instrumentSymbol}@trade`],
        }));
      };
      currentSocket.onmessage = (event) => {
        if (disposed || typeof event.data !== "string") return;
        let response: unknown;
        try {
          response = JSON.parse(event.data);
        } catch {
          return;
        }
        if (response && typeof response === "object") {
          const ack = response as { id?: unknown; status?: unknown };
          if (ack.id === "thesis-public-market" && typeof ack.status === "number") {
            if (ack.status >= 400) {
              setFeed((current) => ({ ...current, status: "reconnecting", error: "Gemini rejected the public market-data subscription." }));
              currentSocket.close();
              return;
            }
            if (ack.status === 200) attempts = 0;
          }
        }
        const update = parseGeminiMarketStreamMessage(event.data, instrumentSymbol);
        if (!update) return;
        attempts = 0;
        setFeed((current) => update.kind === "book"
          ? { ...current, status: "connected", book: update, error: null, lastBookUpdateAt: Date.now() }
          : {
              ...current,
              status: "connected",
              trades: [...current.trades.filter((trade) => trade.tradeId !== update.tradeId), update].slice(-MAX_TRADES),
              error: null,
            });
      };
      currentSocket.onerror = () => {
        if (disposed) return;
        setFeed((current) => ({ ...current, error: "Gemini market data connection was interrupted." }));
        currentSocket.close();
      };
      currentSocket.onclose = () => scheduleReconnect("Gemini market data disconnected.");
    };

    const scheduleReconnect = (message: string) => {
      if (disposed) return;
      if (attempts >= 5) {
        setFeed((current) => ({ ...current, status: "unavailable", error: `${message} Retry to reconnect.` }));
        return;
      }
      const delay = Math.min(1000 * 2 ** attempts, 8000);
      attempts += 1;
      setFeed((current) => ({ ...current, status: "reconnecting", error: message }));
      reconnectTimer = window.setTimeout(connect, delay);
    };

    const retry = () => {
      if (disposed) return;
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      attempts = 0;
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.onclose = null;
        socket.close();
      }
      connect();
    };
    retryRef.current = retry;
    connect();

    return () => {
      disposed = true;
      retryRef.current = null;
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState !== WebSocket.CLOSED) socket.close();
      }
    };
  }, [enabled, instrumentSymbol]);

  const retry = useCallback(() => retryRef.current?.(), []);
  return { ...feed, retry };
}
