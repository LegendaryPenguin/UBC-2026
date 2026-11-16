'use client';

import { useEffect, useState } from "react";
import type { GeminiMarketFeedStatus } from "@/lib/gemini/use-market-stream";
import type { GeminiMarketStreamUpdate } from "@/lib/gemini/market-stream";
import { Button, Card } from "@/components/ui";

type BookUpdate = Extract<GeminiMarketStreamUpdate, { kind: "book" }>;
type TradeUpdate = Extract<GeminiMarketStreamUpdate, { kind: "trade" }>;

const STATUS_LABEL: Record<GeminiMarketFeedStatus, string> = {
  disabled: "Unavailable",
  connecting: "Connecting to Gemini…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  unavailable: "Unavailable",
};

function cents(value: string | null) {
  return value == null ? "Not listed" : `${(Number(value) * 100).toFixed(1)}¢`;
}

function size(value: string | null) {
  return value == null ? "size not listed" : `${value} contracts`;
}

export function GeminiLiveMarketFeed({
  status,
  book,
  trades,
  error,
  retry,
  restBid,
  restAsk,
  lastUpdateAt = null,
  connectedAt = null,
}: {
  status: GeminiMarketFeedStatus;
  book: BookUpdate | null;
  trades: TradeUpdate[];
  error: string | null;
  retry: () => void;
  restBid: string | null;
  restAsk: string | null;
  lastUpdateAt?: number | null;
  connectedAt?: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const freshnessTime = lastUpdateAt ?? connectedAt;
  const dataIsStale = freshnessTime != null && now - freshnessTime > 30_000;
  const liveBid = book ? book.bid : restBid;
  const liveAsk = book ? book.ask : restAsk;
  const bookTime = book ? new Date(book.eventAt).toLocaleTimeString() : null;
  const statusLabel = status === "connected"
    ? dataIsStale ? "Connected · no recent market updates" : book ? "Live market updates" : trades.length ? "Connected · trade updates received" : "Connected · waiting for first update"
    : STATUS_LABEL[status];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl">Live Gemini market data</h2>
          <p className="mt-1 text-xs text-muted" role="status" aria-live="polite">
            {statusLabel}{bookTime ? ` · last book update ${bookTime}` : ""}
          </p>
        </div>
        {status === "unavailable" || dataIsStale ? <Button kind="secondary" onClick={retry}>Retry stream</Button> : null}
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line p-3"><dt className="text-xs text-muted">YES bid</dt><dd className="mt-1 font-semibold">{cents(liveBid)}</dd><dd className="text-xs text-muted">{book ? book.bid != null ? size(book.bidSize) : "No live bid listed" : "REST snapshot or not listed"}</dd></div>
        <div className="rounded-lg border border-line p-3"><dt className="text-xs text-muted">YES ask</dt><dd className="mt-1 font-semibold">{cents(liveAsk)}</dd><dd className="text-xs text-muted">{book ? book.ask != null ? size(book.askSize) : "No live ask listed" : "REST snapshot or not listed"}</dd></div>
        <div className="rounded-lg border border-line p-3"><dt className="text-xs text-muted">Last streamed trade</dt><dd className="mt-1 font-semibold">{trades.length ? cents(trades[trades.length - 1].price) : book?.lastTrade ? cents(book.lastTrade) : "No trade received"}</dd><dd className="text-xs text-muted">{trades.length ? `${trades[trades.length - 1].quantity} contracts` : book?.lastTradeSize ? size(book.lastTradeSize) : "No execution implied"}</dd></div>
      </dl>
      {dataIsStale ? <p role="alert" className="mt-3 rounded-lg border border-warn/30 bg-white p-3 text-sm">{lastUpdateAt == null ? "No market data has arrived for 30 seconds." : "The last streamed values may be outdated."} Retry the public feed before relying on them.</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}</p> : null}
      <p className="mt-3 text-xs text-muted">Public Gemini YES-space market data. Prices and displayed size are references only, not a Thesis quote or guaranteed execution. Recent trade points below are collected only while this page is connected.</p>
    </Card>
  );
}
