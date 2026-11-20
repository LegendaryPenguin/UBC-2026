"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, dataContextFromStorage } from "@/lib/client";
import type { GeminiEvent, GeminiStatus } from "@/lib/gemini/types";
import { Button, Empty, Field, inputCls } from "@/components/ui";
import { Icon } from "@/components/thesis";
import { useModeChange } from "@/lib/use-mode-change";
import { AppDialog } from "@/components/AppDialog";
import { exploreMarkets, ExploreMarketCard, marketDetailHref, selectionTopic, type MarketSelection } from "@/components/ExploreMarketCard";
import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";

type EventKind = "events" | "upcoming" | "settled";
type MarketSort = "closing" | "listed";
type MarketResponse = {
  events: GeminiEvent[];
  pagination: { limit: number; offset: number; total: number };
  mode: "live" | "replay";
  source: string;
  fetchedAt: string;
  live: boolean;
};
type CompatibleTopic = { slug: string; familyId: string; familyVersion: string; contractId?: string; contractLabel?: string };
type LibraryThesis = ThesisRevision & { libraryState?: "archived" | "draft" | "traded" | "active" };

const categories = ["Sports", "Crypto", "Economics", "Politics"];
const statuses: { value: GeminiStatus | "all"; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "approved", label: "Approved" },
  { value: "closed", label: "Closed" },
  { value: "settled", label: "Settled" },
  { value: "under_review", label: "Under review" },
  { value: "invalid", label: "Invalid" },
  { value: "all", label: "All statuses" },
];

function topicHref(topic: CompatibleTopic, event: GeminiEvent) {
  return "/topics/" + encodeURIComponent(topic.slug) + "?event=" + encodeURIComponent(event.ticker);
}

export function GeminiMarketCatalog({ embedded = false, watchedSlugs, watchBusy, onWatch }: {
  embedded?: boolean;
  watchedSlugs?: Set<string>;
  watchBusy?: boolean;
  onWatch?: (slug: string, title: string) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"live" | "replay">("live");
  const [kind, setKind] = useState<EventKind>("events");
  const [status, setStatus] = useState<GeminiStatus | "all">("active");
  const [category, setCategory] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<MarketSort>("closing");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<MarketResponse | null>(null);
  const [visibleEvents, setVisibleEvents] = useState<GeminiEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [urlInitialized, setUrlInitialized] = useState(false);
  const [now, setNow] = useState(0);
  const [attach, setAttach] = useState<MarketSelection | null>(null);
  const [attachFamily, setAttachFamily] = useState<CompatibleTopic | null>(null);
  const [theses, setTheses] = useState<LibraryThesis[]>([]);
  const [checking, setChecking] = useState(false);
  const [attachPending, setAttachPending] = useState("");
  const [attachError, setAttachError] = useState("");
  const [researchPending, setResearchPending] = useState("");
  const requestId = useRef(0);
  const attachRequest = useRef(0);
  const searchField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMode(dataContextFromStorage());
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q") || params.get("idea") || "";
    const initialKind = params.get("kind");
    const initialStatus = params.get("status");
    const initialOffset = Number(params.get("offset"));
    setKind(initialKind === "upcoming" || initialKind === "settled" ? initialKind : "events");
    if (statuses.some((option) => option.value === initialStatus)) setStatus(initialStatus as GeminiStatus | "all");
    setCategory(params.get("category") || "");
    setCategoryInput(params.get("category") || "");
    setOffset(Number.isSafeInteger(initialOffset) && initialOffset > 0 ? initialOffset : 0);
    setSearchInput(initialQuery);
    setSearch(initialQuery);
    setSort(params.get("sort") === "listed" ? "listed" : "closing");
    setNow(Date.now());
    setUrlInitialized(true);
    if (params.get("focus") === "search") searchField.current?.focus();
    const timeout = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timeout);
  }, []);

  useEffect(() => {
    if (!urlInitialized) return;
    const url = new URL(window.location.href);
    const filters = {
      kind: kind !== "events" ? kind : "",
      status: kind === "events" && status !== "active" ? status : "",
      category: category.trim(),
      q: search.trim(),
      offset: offset > 0 ? String(offset) : "",
      sort: sort === "listed" ? sort : "",
    };
    for (const [key, value] of Object.entries(filters)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [urlInitialized, kind, status, category, search, offset, sort]);

  useModeChange(() => { setMode(dataContextFromStorage()); setOffset(0); });

  useEffect(() => {
    if (!urlInitialized) return;
    const current = ++requestId.current;
    const controller = new AbortController();
    const params = new URLSearchParams({ mode, kind, limit: "50", offset: String(offset) });
    if (kind === "events") params.set("status", status);
    if (category) params.set("category", category);
    if (search) params.set("q", search);
    setLoading(true);
    setError("");
    if (!offset) { setData(null); setVisibleEvents([]); }
    api<MarketResponse>("/api/gemini/events?" + params, { signal: controller.signal })
      .then((response) => {
        if (current !== requestId.current) return;
        setData(response);
        setVisibleEvents((items) => offset === 0 ? response.events : [...new Map([...items, ...response.events].map((event) => [event.ticker, event])).values()]);
      })
      .catch((cause) => {
        if (!controller.signal.aborted && current === requestId.current) setError(cause instanceof Error ? cause.message : "Gemini markets could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted && current === requestId.current) setLoading(false);
      });
    return () => { controller.abort(); requestId.current += 1; };
  }, [urlInitialized, mode, kind, status, category, search, offset, retryCount]);

  const cards = useMemo(() => {
    const next = exploreMarkets(visibleEvents, now);
    return sort === "closing" ? next.sort((a, b) => a.closesAt === b.closesAt ? 0 : a.closesAt - b.closesAt) : next;
  }, [visibleEvents, now, sort]);
  const nextOffset = data ? data.pagination.offset + data.pagination.limit : 0;
  const selectedCategory = categories.find((value) => value.toLowerCase() === category.toLowerCase());
  const heading = search ? `Results for “${search}”` : category ? category + " markets" : kind === "upcoming" ? "Upcoming markets" : kind === "settled" ? "Recently settled markets" : "Explore markets";

  function applyCategory(next: string) {
    setCategory(next.trim());
    setCategoryInput(next.trim());
    setOffset(0);
  }

  function changeStatus(value: string) {
    if (value === "upcoming" || value === "recently-settled") {
      setKind(value === "upcoming" ? "upcoming" : "settled");
    } else {
      setKind("events");
      setStatus(value as GeminiStatus | "all");
    }
    setOffset(0);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setOffset(0);
  }

  async function compatibleTopic(selection: MarketSelection): Promise<CompatibleTopic | null> {
    const { event, contract } = selection;
    const slug = selectionTopic(selection, mode);
    if (slug) {
      const result = await api<{ family: MarketFamily }>(
        "/api/topics/" + slug + "?" + new URLSearchParams({ mode, event: event.ticker }),
      );
      const family = result.family;
      return { slug: family.slug, familyId: family.id, familyVersion: family.version, contractId: contract?.id, contractLabel: contract?.label };
    }
    const detail = await api<{ compatibleTopics: CompatibleTopic[] }>("/api/gemini/events/" + encodeURIComponent(event.ticker) + "?mode=" + mode);
    return (contract ? detail.compatibleTopics.find((item) => item.contractId === contract.id) : detail.compatibleTopics[0]) || null;
  }

  async function openResearch(selection: MarketSelection) {
    const { event } = selection;
    if (researchPending) return;
    setResearchPending(event.ticker);
    try {
      const topic = await compatibleTopic(selection);
      router.push(topic ? topicHref(topic, event) : marketDetailHref(selection, mode));
    } catch {
      router.push(marketDetailHref(selection, mode));
    } finally {
      setResearchPending("");
    }
  }

  async function openAttach(selection: MarketSelection) {
    const id = ++attachRequest.current;
    setAttach(selection);
    setAttachFamily(null);
    setTheses([]);
    setAttachError("");
    setChecking(true);
    try {
      const [topic, library] = await Promise.all([compatibleTopic(selection), api<{ theses: LibraryThesis[] }>("/api/theses")]);
      if (id !== attachRequest.current) return;
      setAttachFamily(topic);
      setTheses(library.theses || []);
      if (!topic) setAttachError("This contract is unavailable for a thesis. You can still inspect its Gemini listing.");
    } catch (cause) {
      if (id === attachRequest.current) setAttachError(cause instanceof Error ? cause.message : "Compatibility could not be checked.");
    } finally {
      if (id === attachRequest.current) setChecking(false);
    }
  }

  function closeAttach() {
    if (attachPending) return;
    attachRequest.current += 1;
    setAttach(null);
  }

  async function saveThesis(thesis?: ThesisRevision) {
    if (!attachFamily || !attach || attachPending) return;
    setAttachPending(thesis?.id || "new");
    setAttachError("");
    const binding = { topicSlug: attachFamily.slug, familyId: attachFamily.familyId, familyVersion: attachFamily.familyVersion, mode };
    try {
      if (thesis) {
        if (!thesis.topicSlug || thesis.familyId !== attachFamily.familyId) {
          await api("/api/theses/" + thesis.id, { method: "PATCH", body: JSON.stringify({ action: "bind", ...binding }) });
        }
        router.push("/theses/" + thesis.id);
      } else {
        const title = attach.event.title;
        const rationale = attach.contract ? title + " · " + attach.contract.label : title;
        const result = await api<{ thesis: ThesisRevision }>("/api/theses", {
          method: "POST",
          body: JSON.stringify({ ...binding, title: title.slice(0, 100), rationale: rationale.slice(0, 4_000), evidenceIds: [] }),
        });
        router.push("/theses/" + result.thesis.id);
      }
      setAttach(null);
    } catch (cause) {
      setAttachError(cause instanceof Error ? cause.message : "This contract could not be saved to the thesis.");
    } finally {
      setAttachPending("");
    }
  }

  const drafts = theses.filter((thesis) => thesis.status === "draft" && thesis.libraryState !== "archived");

  return (
    <div className="explore-catalog">
      {!embedded ? <header><h1 className="explore-title screen-heading">Gemini prediction markets</h1></header> : null}
      <form className="explore-catalog__search" onSubmit={submitSearch} role="search">
        <Icon name="search" size={22} />
        <label className="sr-only" htmlFor="gemini-market-search">Search markets</label>
        <input ref={searchField} id="gemini-market-search" value={searchInput} maxLength={120} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search a team, event, or question…" />
        {searchInput || search ? <button type="button" className="explore-catalog__clear" aria-label="Clear search" onClick={() => { setSearchInput(""); setSearch(""); setOffset(0); searchField.current?.focus(); }}><Icon name="close" size={18} /></button> : null}
        <button className="explore-catalog__submit" type="submit">Search</button>
      </form>

      <div className="explore-catalog__bar">
        <div className="explore-catalog__categories" role="group" aria-label="Market category">
          <button type="button" aria-pressed={!category} onClick={() => applyCategory("")}>All markets</button>
          {categories.map((value) => <button key={value} type="button" aria-pressed={selectedCategory === value} onClick={() => applyCategory(value)}>{value}</button>)}
        </div>
        <div className="explore-catalog__controls">
          <details className="explore-catalog__category-menu">
            <summary className="explore-catalog__select" title="More categories"><Icon name="filter" size={15} /><span>{category && !selectedCategory ? category : "More"}</span><Icon name="chevron-down" size={15} /></summary>
            <form className="explore-catalog__category-popover" onSubmit={(event) => { event.preventDefault(); applyCategory(categoryInput); event.currentTarget.closest("details")?.removeAttribute("open"); }}>
              <Field label="Category"><input className={inputCls()} value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} list="gemini-category-suggestions" maxLength={80} placeholder="e.g. Culture" /></Field>
              <datalist id="gemini-category-suggestions"><option value="Culture" /><option value="Technology" /><option value="Sports" /><option value="Crypto" /><option value="Economics" /><option value="Politics" /></datalist>
              <Button type="submit" kind="secondary">Apply category</Button>
            </form>
          </details>
          <select aria-label="Market status" className="explore-catalog__select" value={kind === "upcoming" ? "upcoming" : kind === "settled" ? "recently-settled" : status} onChange={(event) => changeStatus(event.target.value)}>
            <option value="active">Active</option><option value="upcoming">Upcoming</option><option value="recently-settled">Recently settled</option>
            {statuses.filter(({ value }) => value !== "active").map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Sort loaded markets" className="explore-catalog__select" value={sort} onChange={(event) => setSort(event.target.value as MarketSort)}>
            <option value="closing">Closing soon</option><option value="listed">Gemini order</option>
          </select>
        </div>
      </div>

      <div className="explore-catalog__heading">
        <h2>{heading}</h2>
        {data ? <span title={data.source + " · " + new Date(data.fetchedAt).toLocaleString()}>{data.live ? "Gemini reference prices" : "Recorded reference prices"}</span> : null}
      </div>
      {error ? <Empty title="Gemini data unavailable"><p role="alert">{error}</p><Button kind="secondary" disabled={loading} onClick={() => setRetryCount((count) => count + 1)}>Retry</Button></Empty> : null}
      {loading && !data ? <p className="text-sm th-muted" role="status">Loading Gemini markets…</p> : null}
      {data && !loading && !error && cards.length === 0 ? <Empty title="No markets found">Try another category, status, or search term.</Empty> : null}

      <div className="explore-catalog-grid">
        {cards.map((card) => (
          <ExploreMarketCard key={card.id} card={card} mode={mode} now={now} watchedSlugs={watchedSlugs} watchBusy={watchBusy} onWatch={onWatch}
            researchBusy={Boolean(researchPending) && card.sections.some(({ selections }) => selections.some(({ event }) => event.ticker === researchPending))}
            onResearch={(selection) => void openResearch(selection)} onAttach={(selection) => void openAttach(selection)} />
        ))}
      </div>

      {data && nextOffset < data.pagination.total ? (
        <div className="explore-catalog__more">
          <span>{cards.length} cards · {visibleEvents.length} of {data.pagination.total} listings loaded</span>
          <Button kind="secondary" disabled={loading || Boolean(error)} onClick={() => setOffset(nextOffset)}>{loading ? "Loading…" : "Load more markets"}</Button>
        </div>
      ) : null}

      <AppDialog open={Boolean(attach)} titleId="attach-market-title" onClose={closeAttach} closeOnBackdrop={!attachPending}>
        <div className="flex items-start justify-between gap-3">
          <div><h2 id="attach-market-title" className="font-serif text-2xl font-bold">Add to thesis</h2><p className="text-sm th-muted">{attach?.event.title}{attach?.contract ? " · " + attach.contract.label : ""}</p></div>
          <button type="button" aria-label="Close thesis picker" className="th-button th-button--ghost th-button--icon" onClick={closeAttach} disabled={Boolean(attachPending)}><Icon name="close" /></button>
        </div>
        {checking ? <p role="status" className="text-sm th-muted">Checking this contract and loading your drafts…</p> : null}
        {attachError ? <p role="alert" className="th-alert th-alert--error text-sm">{attachError}</p> : null}
        {!checking && attachFamily ? (
          <div className="grid max-h-80 gap-2 overflow-y-auto">
            {drafts.map((thesis) => {
              const compatible = !thesis.topicSlug || thesis.familyId === attachFamily.familyId;
              return <button key={thesis.id} type="button" disabled={!compatible || Boolean(attachPending)} onClick={() => void saveThesis(thesis)} className="rounded-xl border border-line p-3 text-left disabled:opacity-50">
                <span className="font-semibold">{thesis.title || thesis.rationale.slice(0, 80)}</span>
                <span className="mt-1 block text-xs th-muted">{attachPending === thesis.id ? "Opening…" : !compatible ? "Uses a different market" : thesis.topicSlug ? "Open the linked draft" : "Attach to this draft"}</span>
              </button>;
            })}
            {!drafts.length ? <p className="text-sm th-muted">No saved drafts yet. You can start a new one with this contract.</p> : null}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button kind="ghost" onClick={closeAttach} disabled={Boolean(attachPending)}>Cancel</Button>
          {!checking && !attachFamily && attach ? <Link className="th-button th-button--secondary" href={marketDetailHref(attach, mode)}>View Gemini listing</Link> : null}
          {attachFamily ? <Button disabled={Boolean(attachPending)} onClick={() => void saveThesis()}>{attachPending === "new" ? "Creating draft…" : "Start new thesis"}</Button> : null}
        </div>
      </AppDialog>
    </div>
  );
}
