"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, modeFromStorage } from "@/lib/client";
import { flattenEvents, type GeminiEvent } from "@/lib/gemini/types";
import { Button, Card, Empty } from "@/components/ui";
import { formatTime } from "@/lib/format";

type GeminiDetail = {
  event: GeminiEvent;
  mode: "live" | "replay";
  source: string;
  fetchedAt: string;
  payloadHash: string;
  compatibleTopicSlug: string | null;
};

function richText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(richText).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.value === "string") return record.value;
    return [record.text, record.content, record.children].map(richText).filter(Boolean).join(" ");
  }
  return "";
}

function contractsFor(event: GeminiEvent) {
  const seen = new Set<string>();
  return flattenEvents([event]).flatMap((child) =>
    (child.contracts ?? []).flatMap((contract) => {
      if (seen.has(contract.id)) return [];
      seen.add(contract.id);
      return [{ ...contract, eventTitle: child.title }];
    }),
  );
}

export default function GeminiEventPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const [data, setData] = useState<GeminiDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    const mode = requestedMode === "live"
      ? "live"
      : requestedMode === "replay"
        ? "replay"
        : modeFromStorage() === "live" ? "live" : "replay";
    setLoading(true);
    setError("");
    api<GeminiDetail>(`/api/gemini/events/${encodeURIComponent(ticker)}?mode=${mode}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Event details could not be loaded"))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) return <p className="text-sm text-muted">Loading Gemini event…</p>;
  if (error) return <Empty title="Event unavailable">{error} <Link href="/gemini" className="text-action underline">Return to Gemini markets</Link></Empty>;
  if (!data) return <Empty title="Event unavailable">Gemini did not return an event.</Empty>;

  const { event } = data;
  const contracts = contractsFor(event);
  const description = richText(event.description);
  const sourceUrl = event.termsLink || contracts.find((contract) => contract.termsAndConditionsUrl)?.termsAndConditionsUrl;
  const resolved = event.status === "settled" || contracts.some((contract) => contract.resolutionSide != null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted"><Link href="/gemini">Gemini markets</Link> / {event.ticker}</p>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{event.category || "Uncategorized"} · {event.status.replaceAll("_", " ")}</p>
        <h1 className="font-serif text-3xl">{event.title}</h1>
        <p className="mt-2 text-sm text-muted">{event.ticker} · {event.type || "Prediction market"} · {data.mode === "live" ? "Live Gemini data" : "Recorded replay"}</p>
      </div>

      {description ? <Card><h2 className="font-serif text-xl">Market question and rules</h2><p className="mt-2 whitespace-pre-wrap text-sm">{description}</p></Card> : null}

      <Card>
        <h2 className="font-serif text-xl">Event details</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Starts / effective</dt><dd>{formatTime(event.effectiveDate || event.startTime)}</dd></div>
          <div><dt className="text-xs text-muted">Expiry</dt><dd>{formatTime(event.expiryDate)}</dd></div>
          <div><dt className="text-xs text-muted">Result published</dt><dd>{formatTime(event.resolvedAt)}</dd></div>
          <div><dt className="text-xs text-muted">Source</dt><dd>{event.sourceDetails?.agency || event.source || "Not listed"}{event.sourceDetails?.index ? ` · ${event.sourceDetails.index}` : ""}</dd></div>
          <div><dt className="text-xs text-muted">Trading volume</dt><dd>{event.volume || "Not listed"}</dd></div>
          <div><dt className="text-xs text-muted">Liquidity</dt><dd>{event.liquidity || "Not listed"}</dd></div>
        </dl>
        {sourceUrl ? <a className="mt-4 inline-block text-sm text-action underline" href={sourceUrl} target="_blank" rel="noreferrer">Open Gemini terms</a> : <p className="mt-4 text-xs text-muted">Gemini did not include a terms link in this response.</p>}
      </Card>

      {resolved ? (
        <Card>
          <h2 className="font-serif text-xl">Gemini resolution</h2>
          <p className="mt-1 text-sm text-muted">The outcome below is shown only when Gemini provides a settled status or resolution field.</p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {event.settlement?.value != null ? <div><dt className="text-xs text-muted">Event settlement value</dt><dd>{event.settlement.value}</dd></div> : null}
            {contracts.filter((contract) => contract.resolutionSide || contract.settlementValue).map((contract) => (
              <div key={contract.id}>
                <dt className="text-xs text-muted">{contract.label}</dt>
                <dd>{contract.resolutionSide ? `Resolved ${contract.resolutionSide.toUpperCase()}` : "Resolved"}{contract.settlementValue ? ` · value ${contract.settlementValue}` : ""}{contract.resolvedAt ? ` · ${formatTime(contract.resolvedAt)}` : ""}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      <Card>
        <h2 className="font-serif text-xl">Contracts</h2>
        {contracts.length === 0 ? <p className="mt-2 text-sm text-muted">Gemini did not include contracts in this event response.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead><tr>
                <th className="border-b border-line py-2 pr-3">Contract</th>
                <th className="border-b border-line py-2 pr-3">Instrument</th>
                <th className="border-b border-line py-2 pr-3">Status</th>
                <th className="border-b border-line py-2 pr-3">YES bid / ask</th>
                <th className="border-b border-line py-2 pr-3">Last trade</th>
                <th className="border-b border-line py-2">Outcome</th>
              </tr></thead>
              <tbody>{contracts.map((contract) => (
                <tr key={contract.id}>
                  <td className="border-b border-line py-2 pr-3">{contract.label}<span className="block text-xs text-muted">{contract.eventTitle}</span></td>
                  <td className="border-b border-line py-2 pr-3 font-mono text-xs">{contract.instrumentSymbol || contract.ticker || "Not listed"}</td>
                  <td className="border-b border-line py-2 pr-3">{contract.status || event.status}</td>
                  <td className="border-b border-line py-2 pr-3">{contract.prices?.bestBid || contract.prices?.sell?.yes || "—"} / {contract.prices?.bestAsk || contract.prices?.buy?.yes || "—"}</td>
                  <td className="border-b border-line py-2 pr-3">{contract.prices?.lastTradePrice || "—"}</td>
                  <td className="border-b border-line py-2">{contract.resolutionSide ? contract.resolutionSide.toUpperCase() : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Displayed prices are Gemini reference data, not firm Thesis quotes and not proof of executable liquidity.</p>
      </Card>

      <Card>
        <h2 className="font-serif text-xl">Data provenance</h2>
        <p className="mt-2 break-all text-xs text-muted">{data.source} · retrieved {formatTime(data.fetchedAt)} · SHA-256 {data.payloadHash}</p>
        <p className="mt-2 text-sm text-muted">Resolution terms, finality, and corrections must be qualified before this event can back a Thesis quote or payout.</p>
      </Card>

      {data.compatibleTopicSlug ? <Button href={`/topics/${data.compatibleTopicSlug}`}>Form a Thesis view</Button> : <p className="text-xs text-muted">This event does not match a currently supported multi-threshold Thesis family.</p>}
    </div>
  );
}
