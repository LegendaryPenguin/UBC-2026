"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, modeFromStorage, requestModeChange } from "@/lib/client";
import { flattenEvents, type GeminiEvent, type GeminiStatus } from "@/lib/gemini/types";
import { Button, Card, Empty, Field, inputCls } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { useModeChange } from "@/lib/use-mode-change";

type EventKind = "events" | "upcoming" | "settled";
type MarketResponse = {
  events: GeminiEvent[];
  pagination: { limit: number; offset: number; total: number };
  mode: "live" | "replay";
  source: string;
  fetchedAt: string;
  live: boolean;
};

const STATUS_OPTIONS: { value: GeminiStatus | "all"; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "approved", label: "Approved" },
  { value: "closed", label: "Closed" },
  { value: "settled", label: "Settled" },
  { value: "under_review", label: "Under review" },
  { value: "invalid", label: "Invalid" },
  { value: "all", label: "All statuses" },
];

function contractCount(event: GeminiEvent) {
  return flattenEvents([event]).reduce((count, item) => count + (item.contracts?.length || 0), 0);
}

function dateLabel(event: GeminiEvent) {
  const date = event.expiryDate || event.resolvedAt || event.effectiveDate;
  return date ? formatTime(date) : "Not listed";
}

export default function GeminiMarketsPage() {
  const [mode, setMode] = useState<"live" | "replay">("replay");
  const [kind, setKind] = useState<EventKind>("events");
  const [status, setStatus] = useState<GeminiStatus | "all">("active");
  const [category, setCategory] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<MarketResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    setMode(modeFromStorage() === "live" ? "live" : "replay");
  }, []);

  useModeChange(() => setMode(modeFromStorage() === "live" ? "live" : "replay"));

  useEffect(() => {
    const current = ++requestId.current;
    const params = new URLSearchParams({ mode, kind, limit: "50", offset: String(offset) });
    if (kind === "events") params.set("status", status);
    if (category.trim()) params.set("category", category.trim());
    if (search.trim()) params.set("q", search.trim());
    setLoading(true);
    setError("");
    api<MarketResponse>(`/api/gemini/events?${params}`)
      .then((response) => {
        if (current === requestId.current) setData(response);
      })
      .catch((err) => {
        if (current === requestId.current) {
          setData(null);
          setError(err instanceof Error ? err.message : "Gemini markets could not be loaded");
        }
      })
      .finally(() => {
        if (current === requestId.current) setLoading(false);
      });
    return () => {
      requestId.current += 1;
    };
  }, [mode, kind, status, category, search, offset, retryCount]);

  function chooseKind(next: EventKind) {
    setKind(next);
    setOffset(0);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setSearch(searchInput);
    setCategory(categoryInput);
  }

  const total = data?.pagination.total ?? 0;
  const pageSize = data?.pagination.limit ?? 50;
  const events = data?.events ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Gemini prediction markets</p>
        <h1 className="font-serif text-3xl">Market explorer</h1>
      </div>
      <p className="text-sm text-muted">
        Gemini event and contract data. Reference prices are not executable Thesis offers. Live acceptance stays disabled until the market rules, Arc contract, and receipts are qualified.
      </p>
      {data ? (
        <p className="text-xs text-muted">
          {data.source} · {data.mode === "live" ? "retrieved" : "recorded"} {formatTime(data.fetchedAt)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2" aria-label="Market group">
        <Button kind={kind === "events" ? "primary" : "ghost"} onClick={() => chooseKind("events")}>Events</Button>
        <Button kind={kind === "upcoming" ? "primary" : "ghost"} onClick={() => chooseKind("upcoming")}>Upcoming</Button>
        <Button kind={kind === "settled" ? "primary" : "ghost"} onClick={() => chooseKind("settled")}>Recently settled</Button>
      </div>

      <form className="grid gap-3 sm:grid-cols-[1fr_220px_auto]" onSubmit={submitSearch}>
        <Field label="Search Gemini events">
          <input className={inputCls()} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Title, ticker, or description" />
        </Field>
        <Field label="Category" hint="Uses Gemini's category filter.">
          <input className={inputCls()} value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} placeholder="For example, crypto" />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={loading}>Search</Button>
        </div>
      </form>

      {kind === "events" ? (
        <Field label="Event status">
          <select className={inputCls("max-w-sm")} value={status} onChange={(event) => { setStatus(event.target.value as GeminiStatus | "all"); setOffset(0); }}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
      ) : null}

      {error ? <Empty title="Gemini data unavailable">
        <p>{error} {mode === "live" ? "Retry, switch to Replay, or return to Explore." : "Retry or return to Explore."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button kind="ghost" disabled={loading} onClick={() => setRetryCount((count) => count + 1)}>Retry</Button>
          {mode === "live" ? <Button kind="secondary" onClick={() => requestModeChange("replay")}>Switch to Replay</Button> : null}
          <Button href="/explore" kind="ghost">Back to Explore</Button>
        </div>
      </Empty> : null}
      {loading && !data ? <p className="text-sm text-muted" role="status">Loading Gemini markets…</p> : null}
      {data && events.length === 0 ? (
        <Empty title={kind === "upcoming" && mode === "replay" ? "No recorded upcoming markets" : "No markets found"}>
          {mode === "live" ? "Try another category, status, or search term." : "The saved walkthrough only includes one active family and one settled binary event."}
        </Empty>
      ) : null}

      <div className="grid gap-3">
        {events.map((event) => {
          const nestedEvents = flattenEvents([event]).length - 1;
          return (
            <Card key={event.id || event.ticker}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {event.category || "Uncategorized"} · {event.status.replaceAll("_", " ")}
                  </p>
                  <Link href={`/gemini/${encodeURIComponent(event.ticker)}?mode=${mode}`} className="mt-1 block font-serif text-xl hover:underline">
                    {event.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted">{event.ticker} · {contractCount(event)} contracts{nestedEvents ? ` · ${nestedEvents} related events` : ""}</p>
                  <p className="mt-1 text-xs text-muted">Expiry or result time: {dateLabel(event)}</p>
                </div>
                <Button href={`/gemini/${encodeURIComponent(event.ticker)}?mode=${mode}`} kind="ghost">Inspect event</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                {event.volume ? <span>Volume {event.volume}</span> : null}
                {event.liquidity ? <span>Liquidity {event.liquidity}</span> : null}
                {event.sourceDetails?.agency ? <span>Source {event.sourceDetails.agency}{event.sourceDetails.index ? ` · ${event.sourceDetails.index}` : ""}</span> : null}
              </div>
            </Card>
          );
        })}
      </div>

      {data && total > pageSize ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Showing {offset + 1}–{Math.min(offset + events.length, total)} of {total}</p>
          <div className="flex gap-2">
            <Button kind="ghost" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(value - pageSize, 0))}>Previous</Button>
            <Button kind="ghost" disabled={offset + pageSize >= total || loading} onClick={() => setOffset((value) => value + pageSize)}>Next</Button>
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted">Only event and contract data returned by Gemini is presented as a Gemini fact. Missing terms, prices, or outcomes stay blank.</p>
    </div>
  );
}
