"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { PositionRecord } from "@/lib/domain/types";
import { Button, Card, Empty } from "@/components/ui";
import { formatUsdc } from "@/lib/format";
import { PortfolioOrders } from "@/components/PortfolioOrders";
import { PortfolioActivity } from "@/components/PortfolioActivity";
import { PortfolioAlerts } from "@/components/PortfolioAlerts";

type PortfolioTab = "positions" | "settled" | "orders" | "activity" | "alerts";
type GeminiPosition = {
  symbol?: string;
  outcome?: string;
  totalQuantity?: string;
  positionQuantity?: string;
  avgPrice?: string;
  marketValue?: string;
  unrealizedPnl?: string;
  unrealizedPct?: number;
  realizedPl?: string;
  payout?: string;
  costBasis?: string;
  netProfit?: string;
  settledAt?: string;
  thesisId?: string;
  thesisLinkAmbiguous?: boolean;
  resolutionSide?: string | null;
  contractMetadata?: {
    contractName?: string;
    eventTicker?: string;
    eventName?: string;
    expiryDate?: string | null;
    resolvedAt?: string | null;
  };
};

function dollars(value?: string | number | null) {
  if (value == null || value === "") return "Not provided";
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Not provided";
}

function usdc(value: string | bigint) {
  return `${formatUsdc(typeof value === "bigint" ? value : BigInt(value))} USDC`;
}

export default function Portfolio() {
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [geminiActive, setGeminiActive] = useState<GeminiPosition[]>([]);
  const [geminiSettled, setGeminiSettled] = useState<GeminiPosition[]>([]);
  const [tab, setTab] = useState<PortfolioTab>("positions");
  const [loading, setLoading] = useState(true);
  const [geminiLoading, setGeminiLoading] = useState(true);
  const [settledLoading, setSettledLoading] = useState(false);
  const [error, setError] = useState("");
  const [geminiError, setGeminiError] = useState("");
  const [settledError, setSettledError] = useState("");

  const loadLocal = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ positions: PositionRecord[] }>("/api/positions");
      setPositions(result.positions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thesis positions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGeminiActive = useCallback(async () => {
    setGeminiLoading(true);
    setGeminiError("");
    try {
      const result = await api<{ positions: GeminiPosition[] }>("/api/gemini/positions?bucket=active");
      setGeminiActive(result.positions || []);
    } catch (err) {
      setGeminiError(err instanceof Error ? err.message : "Gemini positions could not be loaded.");
    } finally {
      setGeminiLoading(false);
    }
  }, []);

  const loadGeminiSettled = useCallback(async () => {
    setSettledLoading(true);
    setSettledError("");
    try {
      const result = await api<{ positions: GeminiPosition[] }>("/api/gemini/positions?bucket=settled");
      setGeminiSettled(result.positions || []);
    } catch (err) {
      setSettledError(err instanceof Error ? err.message : "Gemini settlement history could not be loaded.");
    } finally {
      setSettledLoading(false);
    }
  }, []);

  useEffect(() => { void loadLocal(); void loadGeminiActive(); }, [loadLocal, loadGeminiActive]);
  useEffect(() => { if (tab === "settled" && geminiSettled.length === 0 && !settledError) void loadGeminiSettled(); }, [tab, geminiSettled.length, settledError, loadGeminiSettled]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested === "orders" || requested === "activity" || requested === "alerts") setTab(requested);
    else if (requested === "settled") setTab("settled");
  }, []);

  function selectTab(value: PortfolioTab) {
    setTab(value);
    const url = new URL(window.location.href);
    if (value === "positions") url.searchParams.delete("view");
    else url.searchParams.set("view", value);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  const cost = positions.reduce((sum, position) => sum + BigInt(position.premium || "0") + BigInt(position.fee || "0"), 0n);
  const settledLocal = positions.filter((position) => ["resolved", "claimed", "voided", "exited"].includes(position.status));
  const openLocal = positions.filter((position) => !["resolved", "claimed", "voided", "exited"].includes(position.status));

  return (
    <div className="screen-portfolio space-y-4">
      <div>
        <h1 className="portfolio-title screen-heading">Portfolio</h1>
        <p className="mt-1 text-sm text-muted">Positions stay linked to the thesis and venue that created them. Gemini values come from Gemini account data; no value is inferred from stale prices.</p>
      </div>
      <Card>
        <p className="text-sm text-muted">Arc and paper cost basis: <span className="font-medium text-ink">{usdc(cost)}</span></p>
        <p className="mt-1 text-xs text-muted">Unrealized value for Arc positions is shown only when a supported exit quote exists. Gemini mark values are supplied by Gemini.</p>
      </Card>
      <div className="portfolio-tabs-row">
        <nav className="portfolio-tabs" aria-label="Portfolio views" role="tablist">
          {(["positions", "settled", "orders", "activity", "alerts"] as PortfolioTab[]).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className="portfolio-tab" onClick={() => selectTab(value)}>
              {{ positions: "Open positions", settled: "Settled history", orders: "Orders", activity: "Activity", alerts: "Alerts" }[value]}
            </button>
          ))}
        </nav>
        <div className="portfolio-actions">
          {tab === "settled" ? <Button onClick={() => selectTab("positions")} kind="secondary">Back to open positions</Button> : null}
          {tab === "positions" || tab === "settled" ? <Button onClick={() => { void loadLocal(); if (tab === "positions") void loadGeminiActive(); else void loadGeminiSettled(); }} kind="ghost">Refresh</Button> : null}
        </div>
      </div>

      {tab === "orders" ? <PortfolioOrders embedded /> : null}
      {tab === "activity" ? <PortfolioActivity embedded /> : null}
      {tab === "alerts" ? <PortfolioAlerts embedded /> : null}
      {tab === "positions" ? (
        <div className="space-y-4">
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-serif text-2xl">Gemini positions</h2><button className="text-sm text-action" onClick={() => setTab("orders")}>View orders</button></div>
            {geminiError ? <Card><p role="alert" className="text-sm text-bad">{geminiError}</p><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void loadGeminiActive()} kind="ghost">Retry</Button><Button href={geminiError.toLowerCase().includes("sign in") ? "/auth" : "/settings/connections"} kind="secondary">{geminiError.toLowerCase().includes("sign in") ? "Sign in" : "Connect Gemini"}</Button></div></Card> : null}
            {geminiLoading ? <p role="status" className="text-sm text-muted">Loading positions from Gemini…</p> : null}
            {!geminiLoading && !geminiError && !geminiActive.length ? <Empty title="No active Gemini positions">
              <p>No current positions are reported for this connected account. Orders and Arc positions remain separate.</p>
            </Empty> : null}
            {geminiActive.map((position, index) => (
              <Card key={`${position.symbol}-${position.outcome}-${index}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-serif text-lg">{position.contractMetadata?.eventName || position.contractMetadata?.contractName || position.symbol}</p>
                    <p className="text-sm capitalize text-muted">Gemini · {position.outcome || "outcome not provided"} · {position.contractMetadata?.eventTicker || "event"}</p>
                  </div>
                  {position.contractMetadata?.eventTicker ? <Button href={`/gemini/${position.contractMetadata.eventTicker}`} kind="ghost">Open market</Button> : null}
                </div>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-muted">Quantity</dt><dd>{position.totalQuantity || position.positionQuantity || "Not provided"}</dd></div>
                  <div><dt className="text-muted">Average entry</dt><dd>{dollars(position.avgPrice)}</dd></div>
                  <div><dt className="text-muted">Current market value</dt><dd>{dollars(position.marketValue)}</dd></div>
                  <div><dt className="text-muted">Unrealized P/L</dt><dd className={position.unrealizedPnl == null ? "text-muted" : Number(position.unrealizedPnl) >= 0 ? "text-good" : "text-bad"}>{dollars(position.unrealizedPnl)}{position.unrealizedPct != null ? ` · ${position.unrealizedPct.toFixed(2)}%` : ""}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted">Settlement {position.contractMetadata?.expiryDate ? new Date(position.contractMetadata.expiryDate).toLocaleString() : "time not provided"}. This holding is read from Gemini and is not an Arc contract.</p>
                {position.thesisId ? <><Link href={`/theses/${position.thesisId}`} className="mt-2 inline-block text-sm text-action">Revisit related thesis</Link><p className="mt-1 text-xs text-muted">Gemini aggregates holdings by contract; this position may include other orders.</p></> : position.thesisLinkAmbiguous ? <p className="mt-2 text-xs text-muted">More than one thesis links to orders for this contract, so this aggregated holding is not assigned to a single thesis.</p> : null}
              </Card>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl">Arc and paper positions</h2>
            {error ? <Card><p role="alert" className="text-sm text-bad">{error}</p><Button onClick={() => void loadLocal()} kind="ghost">Retry</Button></Card> : null}
            {loading ? <p role="status" className="text-sm text-muted">Loading Arc and paper positions…</p> : null}
            {!loading && !error && !openLocal.length ? <Empty title="No open Arc or paper positions">
              <p>Research first. A connected wallet is not a position.</p>
              <div className="mt-3"><Button href="/explore" kind="secondary">Explore markets</Button></div>
            </Empty> : null}
            {openLocal.map((position) => (
              <Card key={position.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{position.topicSlug} · {position.status} · {position.mode}</p>
                    <p className="text-sm text-muted">Paid {usdc(BigInt(position.premium) + BigInt(position.fee))} · maximum payout {usdc(position.maxPayout)}</p>
                    <Link href={`/theses/${position.thesisId}`} className="mt-1 inline-block text-sm text-action">Revisit thesis</Link>
                  </div>
                  <Button href={`/positions/${position.id}`}>Open position</Button>
                </div>
              </Card>
            ))}
          </section>
        </div>
      ) : tab === "settled" ? (
        <div className="space-y-4">
          <section className="space-y-3">
            <h2 className="font-serif text-2xl">Gemini settlement history</h2>
            {settledError ? <Card><p role="alert" className="text-sm text-bad">{settledError}</p><div className="mt-3"><Button onClick={() => void loadGeminiSettled()} kind="ghost">Retry</Button></div></Card> : null}
            {settledLoading ? <p role="status" className="text-sm text-muted">Loading settled Gemini positions…</p> : null}
            {!settledLoading && !settledError && !geminiSettled.length ? <Empty title="No settled Gemini positions">
              <p>Settled positions appear here after Gemini reports their outcome.</p>
            </Empty> : null}
            {geminiSettled.map((position, index) => (
              <Card key={`${position.symbol}-${position.settledAt}-${index}`}>
                <p className="font-medium">{position.contractMetadata?.eventName || position.contractMetadata?.contractName || position.symbol}</p>
                <p className="mt-1 text-sm capitalize text-muted">{position.outcome} position · resolved {position.resolutionSide || "side not provided"} · {position.settledAt ? new Date(position.settledAt).toLocaleString() : "date not provided"}</p>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted">Cost basis</dt><dd>{dollars(position.costBasis)}</dd></div><div><dt className="text-muted">Payout</dt><dd>{dollars(position.payout)}</dd></div><div><dt className="text-muted">Net profit</dt><dd>{dollars(position.netProfit)}</dd></div></dl>
                {position.contractMetadata?.eventTicker ? <div className="mt-3"><Button href={`/gemini/${position.contractMetadata.eventTicker}`} kind="ghost">Review market rules</Button></div> : null}
              </Card>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="font-serif text-2xl">Arc and paper outcomes</h2>
            {settledLocal.length ? settledLocal.map((position) => (
              <Card key={position.id}>
                <p className="font-medium">{position.topicSlug} · {position.status} · {position.mode}</p>
                <p className="mt-1 text-sm text-muted">Maximum payout {usdc(position.maxPayout)} · cost {usdc(BigInt(position.premium) + BigInt(position.fee))}</p>
                <div className="mt-3 flex flex-wrap gap-2"><Button href={`/positions/${position.id}`} kind="ghost">Review outcome</Button><Button href={`/theses/${position.thesisId}`} kind="ghost">Revisit thesis</Button></div>
              </Card>
            )) : <Empty title="No settled Arc or paper positions">
              <p>Resolved positions and claims will appear here with their original thesis.</p>
            </Empty>}
          </section>
        </div>
      ) : null}
    </div>
  );
}
