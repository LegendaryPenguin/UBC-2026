"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, dataContextFromStorage, requestDataContextChange } from "@/lib/client";
import { flattenEvents, type GeminiEvent, type GeminiStatus } from "@/lib/gemini/types";
import { Button, Card, Empty, Field, inputCls } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { useModeChange } from "@/lib/use-mode-change";
import { AppDialog } from "@/components/AppDialog";
import type { ThesisRevision } from "@/lib/domain/types";

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

function historyFor(event: GeminiEvent) {
  return flattenEvents([event]).flatMap((item) => item.contracts || []).find((contract) => (contract.priceHistory?.length || 0) > 1)?.priceHistory || [];
}

function MarketHistoryLine({ event }: { event: GeminiEvent }) {
  const history = historyFor(event);
  if (history.length < 2) return <div className="mt-3 flex min-h-10 items-center border-y border-dashed border-line text-xs text-muted">Price history not available</div>;
  const values = history.map((item) => Number(item.price)).filter(Number.isFinite);
  if (values.length < 2) return <div className="mt-3 flex min-h-10 items-center border-y border-dashed border-line text-xs text-muted">Price history not available</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 320},${35 - ((value - min) / span) * 28}`).join(" ");
  return <div className="mt-3 border-y border-[#ECEAE5] py-1" aria-label={`Price history for ${event.title}`}><svg viewBox="0 0 320 40" preserveAspectRatio="none" className="h-10 w-full text-action" role="img"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" /></svg><p className="sr-only">Market contract price history is plotted from the returned Gemini data.</p></div>;
}

export function GeminiMarketCatalog({ embedded = false }: { embedded?: boolean }) {
  const [mode, setMode] = useState<"live" | "replay">("replay");
  const [kind, setKind] = useState<EventKind>("events");
  const [status, setStatus] = useState<GeminiStatus | "all">("active");
  const [category, setCategory] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<MarketResponse | null>(null);
  const [visibleEvents, setVisibleEvents] = useState<GeminiEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [urlInitialized, setUrlInitialized] = useState(false);
  const [attachEvent, setAttachEvent] = useState<GeminiEvent | null>(null);
  const [attachFamily, setAttachFamily] = useState<{ slug: string; familyId: string; familyVersion: string; contractLabel?: string } | null>(null);
  const [theses, setTheses] = useState<ThesisRevision[]>([]);
  const [attachPending, setAttachPending] = useState("");
  const [attachError, setAttachError] = useState("");
  const [researchPending, setResearchPending] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    setMode(dataContextFromStorage());
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q") || "";
    const initialKind = params.get("kind");
    const initialStatus = params.get("status");
    const initialOffset = Number(params.get("offset"));
    setKind(initialKind === "upcoming" || initialKind === "settled" ? initialKind : "events");
    if (STATUS_OPTIONS.some((option) => option.value === initialStatus)) setStatus(initialStatus as GeminiStatus | "all");
    setCategory(params.get("category") || "");
    setCategoryInput(params.get("category") || "");
    setOffset(Number.isSafeInteger(initialOffset) && initialOffset > 0 ? initialOffset : 0);
    if (initialQuery) {
      setSearchInput(initialQuery);
      setSearch(initialQuery);
    }
    setUrlInitialized(true);
  }, []);

  useEffect(() => {
    if (!urlInitialized) return;
    const url = new URL(window.location.href);
    if (kind === "events") url.searchParams.delete("kind"); else url.searchParams.set("kind", kind);
    if (status === "active") url.searchParams.delete("status"); else url.searchParams.set("status", status);
    if (category.trim()) url.searchParams.set("category", category.trim()); else url.searchParams.delete("category");
    if (search.trim()) url.searchParams.set("q", search.trim()); else url.searchParams.delete("q");
    if (offset > 0) url.searchParams.set("offset", String(offset)); else url.searchParams.delete("offset");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [urlInitialized, kind, status, category, search, offset]);

  useModeChange(() => setMode(dataContextFromStorage()));

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
        if (current === requestId.current) {
          setData(response);
          setVisibleEvents((items) => offset === 0 ? response.events : [
            ...items,
            ...response.events.filter((event) => !items.some((item) => item.ticker === event.ticker)),
          ]);
        }
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
  const events = visibleEvents;

  async function openAttach(event: GeminiEvent) {
    setAttachEvent(event);
    setAttachFamily(null);
    setAttachError("");
    try {
      const [detail, library] = await Promise.all([
        api<{ compatibleTopics: { slug: string; familyId: string; familyVersion: string; contractLabel?: string }[] }>(`/api/gemini/events/${encodeURIComponent(event.ticker)}?mode=${mode}`),
        api<{ theses: ThesisRevision[] }>("/api/theses"),
      ]);
      setAttachFamily(detail.compatibleTopics[0] || null);
      setTheses(library.theses || []);
      if (!detail.compatibleTopics.length) setAttachError("This listing does not map to a supported thesis construction yet.");
    } catch (cause) {
      setAttachError(cause instanceof Error ? cause.message : "Compatibility could not be checked.");
    }
  }

  async function attachToThesis(thesis: ThesisRevision) {
    if (!attachFamily) return;
    setAttachPending(thesis.id);
    setAttachError("");
    try {
      await api(`/api/theses/${thesis.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "bind", ...attachFamily, mode }),
      });
      window.location.href = `/theses/${thesis.id}`;
    } catch (cause) {
      setAttachError(cause instanceof Error ? cause.message : "This market could not be attached to the thesis.");
      setAttachPending("");
    }
  }

  async function researchAsNew(event: GeminiEvent) {
    setResearchPending(event.ticker);
    setError("");
    try {
      const detail = await api<{ compatibleTopics: { slug: string; familyId: string; familyVersion: string }[] }>(`/api/gemini/events/${encodeURIComponent(event.ticker)}?mode=${mode}`);
      const family = detail.compatibleTopics[0];
      if (!family) {
        window.location.href = `/gemini/${encodeURIComponent(event.ticker)}?mode=${mode}`;
        return;
      }
      const result = await api<{ thesis: ThesisRevision }>("/api/theses", {
        method: "POST",
        body: JSON.stringify({
          topicSlug: family.slug,
          familyId: family.familyId,
          familyVersion: family.familyVersion,
          mode,
          title: event.title,
          rationale: event.title,
          direction: "yes",
          evidenceIds: [],
        }),
      });
      window.location.href = `/theses/${result.thesis.id}`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The research workspace could not be opened.");
      setResearchPending("");
    }
  }

  return (
    <div className={`explore-catalog space-y-4 ${embedded ? "explore-catalog--embedded" : ""}`}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="section-label">Gemini market catalog</h2><p className="mt-1 text-sm text-muted">Actual event and contract listings. Reference prices are not certainty or executable offers.</p></div>
        {data ? <p className="text-xs text-muted">{data.mode === "live" ? "Live data" : "Illustrative replay"} · {data.source} · retrieved {formatTime(data.fetchedAt)}</p> : null}
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Market group">
        {([ ["events", "All markets"], ["upcoming", "Upcoming"], ["settled", "Recently settled"] ] as [EventKind, string][]).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={kind === value} onClick={() => chooseKind(value)} className={`min-h-10 rounded-full border px-4 text-sm ${kind === value ? "border-action bg-[#E9EEFF] font-semibold text-action" : "border-line bg-white text-muted hover:border-action"}`}>{label}</button>)}
      </div>

      <form className="grid gap-3 rounded-xl border border-line bg-white p-3 sm:grid-cols-[minmax(0,1fr)_190px_auto]" onSubmit={submitSearch}>
        <Field label="Search markets"><input className={inputCls()} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search a question, event, or contract" /></Field>
        <Field label="Category"><input className={inputCls()} value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} placeholder="Any category" /></Field>
        <div className="flex items-end"><Button type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</Button></div>
        {kind === "events" ? <Field label="Market status"><select className={inputCls()} value={status} onChange={(event) => { setStatus(event.target.value as GeminiStatus | "all"); setOffset(0); }}>
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></Field> : null}
        {search || category ? <button type="button" className="min-h-10 self-end text-left text-sm font-semibold text-action underline" onClick={() => { setSearchInput(""); setCategoryInput(""); setSearch(""); setCategory(""); setOffset(0); }}>Clear filters</button> : null}
      </form>

      {error ? <Empty title="Gemini data unavailable">
        <p>{error} {mode === "live" ? "Retry, switch to Replay, or return to Explore." : "Retry or return to Explore."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button kind="ghost" disabled={loading} onClick={() => setRetryCount((count) => count + 1)}>Retry</Button>
          {mode === "live" ? <Button kind="secondary" onClick={() => requestDataContextChange("replay")}>Switch to Replay</Button> : null}
          <Button href="/explore" kind="ghost">Back to Explore</Button>
        </div>
      </Empty> : null}
      {loading && !data ? <p className="text-sm text-muted" role="status">Loading Gemini markets…</p> : null}
      {data && events.length === 0 ? (
        <Empty title={kind === "upcoming" && mode === "replay" ? "No recorded upcoming markets" : "No markets found"}>
          {mode === "live" ? "Try another category, status, or search term." : "No market records match this saved data context. Try a broader status or search term."}
        </Empty>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {events.map((event) => {
          const nestedEvents = flattenEvents([event]).length - 1;
          const count = contractCount(event);
          return (
            <Card key={event.id || event.ticker} className="market-card p-4">
              <div className="market-card__body">
                <div className="flex items-center justify-between gap-2"><span className="source-pill capitalize">{event.category || "Market"}</span><span className={`status-pill ${event.status === "active" || event.status === "approved" ? "status-pill--good" : ""}`}>{event.status.replaceAll("_", " ")}</span></div>
                <Link href={`/gemini/${encodeURIComponent(event.ticker)}?mode=${mode}`} className="mt-3 block font-serif text-xl font-bold leading-tight hover:text-action">{event.title}</Link>
                <p className="mt-2 text-sm text-muted">{event.ticker} · {count} contract{count === 1 ? "" : "s"}{nestedEvents ? ` · ${nestedEvents} related event${nestedEvents === 1 ? "" : "s"}` : ""}</p>
                <MarketHistoryLine event={event} />
                <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg bg-[#F7F6F2] p-2"><p className="text-[11px] text-muted">Closes / result</p><p className="mt-1 text-xs font-medium">{dateLabel(event)}</p></div><div className="rounded-lg bg-[#F7F6F2] p-2"><p className="text-[11px] text-muted">Source</p><p className="mt-1 truncate text-xs font-medium">{event.sourceDetails?.agency || event.source || "Gemini listing"}</p></div></div>
                <p className="mt-2 text-[11px] text-muted">Updated {data?.fetchedAt ? formatTime(data.fetchedAt) : "time unavailable"} · {mode === "live" ? "Live data" : "Illustrative replay"}</p>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button kind="ghost" onClick={() => void openAttach(event)}>Use existing thesis</Button>
                <Button className="w-full" disabled={researchPending === event.ticker} onClick={() => void researchAsNew(event)}>{researchPending === event.ticker ? "Opening Research…" : "Research market →"}</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {data && total > events.length ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted">Showing {events.length} of {total}</p>
          <Button kind="ghost" disabled={loading} onClick={() => setOffset(events.length)}>{loading ? "Loading…" : "Load more"}</Button>
        </div>
      ) : null}
      <p className="text-xs text-muted">Listings, close times, and history come from the selected Gemini data source. Missing prices, rules, or outcomes remain unavailable.</p>
      <AppDialog open={Boolean(attachEvent)} titleId="attach-market-title" onClose={() => { if (!attachPending) setAttachEvent(null); }}>
        <div className="flex items-start justify-between gap-3"><div><p className="source-pill">Compatibility check</p><h2 id="attach-market-title" className="mt-3 font-serif text-2xl font-bold">Use an existing thesis</h2></div><button type="button" aria-label="Close thesis picker" className="min-h-10 px-3 text-2xl text-muted" onClick={() => setAttachEvent(null)}>×</button></div>
        <p className="mt-2 text-sm text-muted">{attachEvent?.title}</p>
        {attachFamily ? <p className="mt-3 rounded-lg bg-[#F1F5FF] p-3 text-sm">Compatible supported contract: <strong>{attachFamily.contractLabel || attachFamily.slug.replaceAll("-", " ")}</strong></p> : null}
        {attachError ? <p role="alert" className="mt-3 text-sm text-bad">{attachError}</p> : null}
        <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto">
          {theses.filter((thesis) => thesis.status === "draft").map((thesis) => {
            const canAttach = !thesis.topicSlug || thesis.familyId === attachFamily?.familyId;
            return <button key={thesis.id} type="button" disabled={!canAttach || Boolean(attachPending) || !attachFamily} onClick={() => void attachToThesis(thesis)} className="rounded-xl border border-line p-3 text-left disabled:opacity-50"><span className="font-semibold">{thesis.title || thesis.rationale.slice(0, 80)}</span><span className="mt-1 block text-xs text-muted">{canAttach ? thesis.topicSlug ? "Already uses this compatible market" : "Question-first draft · compatible" : "Different market family · unavailable"}</span></button>;
          })}
          {!theses.some((thesis) => thesis.status === "draft") ? <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No draft theses are available. Start a new thesis from this market instead.</p> : null}
        </div>
        <div className="mt-4 flex justify-end gap-2"><Button kind="ghost" onClick={() => setAttachEvent(null)}>Cancel</Button><Button disabled={!attachEvent || Boolean(researchPending)} onClick={() => { if (attachEvent) void researchAsNew(attachEvent); }}>Research as new thesis</Button></div>
      </AppDialog>
    </div>
  );
}
