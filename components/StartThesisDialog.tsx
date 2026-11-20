"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, dataContextFromStorage, OPEN_ASSISTANT_EVENT } from "@/lib/client";
import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { extractMarketQuery } from "@/lib/research";
import { AppDialog } from "@/components/AppDialog";
import { BrandMark, Icon } from "@/components/thesis";
import { Button } from "@/components/ui";

export function StartThesisDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [title, setTitle] = useState("");
  const [results, setResults] = useState<MarketFamily[]>([]);
  const [selected, setSelected] = useState<MarketFamily | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [searchState, setSearchState] = useState("");
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const searchTimer = useRef<number | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const lastSearch = useRef("");
  const savePending = useRef(false);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => questionRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      searchRequest.current?.abort();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    const needle = extractMarketQuery(question);
    if (needle.length < 2 || lastSearch.current === question) return;
    searchTimer.current = window.setTimeout(() => { void runSearch(); }, 400);
    return () => { if (searchTimer.current !== null) window.clearTimeout(searchTimer.current); };
  }, [question, open]);

  function changeQuestion(next: string) {
    if (next === question) return;
    searchRequest.current?.abort();
    lastSearch.current = "";
    setQuestion(next);
    setSelected(null);
    setResults([]);
    setSearching(false);
    setSearchState("");
    setError("");
  }

  async function runSearch() {
    if (savePending.current) return;
    const query = question.trim();
    if (extractMarketQuery(query).length < 2) {
      setError("Enter a team, event, or market question first.");
      questionRef.current?.focus();
      return;
    }
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setError("");
    setSearching(true);
    setSearchState("Searching Gemini markets…");
    try {
      const mode = dataContextFromStorage();
      const params = new URLSearchParams({ mode, discovery: "1", q: query });
      const result = await api<{ families: MarketFamily[]; liveError?: string }>(`/api/topics?${params}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.liveError) throw new Error("Gemini search is unavailable. You can still save your question.");
      const families = result.families || [];
      lastSearch.current = question;
      setResults(families);
      setSelected((current) => families.find((family) => family.id === current?.id) ?? null);
      setSearchState(families.length
        ? `Found ${families.length} market${families.length === 1 ? "" : "s"}. Choose one if you want to link it now.`
        : "No matching market yet. You can save the question and find a market later.");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Market search failed. Your question is still here; retry or browse Explore.");
      setSearchState("");
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  async function createDraft() {
    if (savePending.current) return;
    if (question.trim().length < 8) {
      setError("Add a short research question (at least 8 characters).");
      questionRef.current?.focus();
      return;
    }
    savePending.current = true;
    searchRequest.current?.abort();
    setCreating(true);
    setSearching(false);
    setError("");
    try {
      const mode = dataContextFromStorage();
      const result = await api<{ thesis: ThesisRevision }>("/api/theses", {
        method: "POST",
        body: JSON.stringify({
          ...(selected ? { topicSlug: selected.slug, familyId: selected.id, familyVersion: selected.version } : {}),
          mode,
          title: title.trim() || selected?.title.slice(0, 100) || question.trim().slice(0, 100),
          rationale: question.trim(),
          evidenceIds: [],
        }),
      });
      changeQuestion("");
      setTitle("");
      onClose();
      router.push(`/theses/${result.thesis.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Draft could not be saved. Your question is still here to retry.");
    } finally {
      savePending.current = false;
      setCreating(false);
    }
  }

  function talkItThrough() {
    const savedQuestion = question.trim();
    closeForm();
    window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { detail: { question: savedQuestion } }));
  }

  function closeForm() {
    if (savePending.current) return;
    searchRequest.current?.abort();
    setSearching(false);
    setSearchState((current) => current === "Searching Gemini markets…" ? "" : current);
    onClose();
  }

  return (
    <AppDialog open={open} titleId="start-thesis-title" describedBy="start-thesis-description" onClose={closeForm} closeOnBackdrop={!creating}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="th-brand">
            <BrandMark size={24} />
            Thesis
          </div>
          <h2 id="start-thesis-title" className="mt-4 font-serif text-[34px] font-bold leading-tight tracking-tight">What question are you exploring?</h2>
          <p id="start-thesis-description" className="mt-2 text-sm th-muted">Turn a question or view into a researchable thesis.</p>
        </div>
        <button type="button" aria-label="Close new thesis" className="th-button th-button--ghost th-button--icon" onClick={closeForm} disabled={creating}><Icon name="close" /></button>
      </header>
      <form onSubmit={(event) => { event.preventDefault(); void runSearch(); }} className="mt-5 space-y-4">
        <label className="app-field block">
          <span className="mb-1 block text-sm font-semibold">Your question</span>
          <textarea
            ref={questionRef}
            className="app-input min-h-24 w-full resize-y px-3 py-3 text-sm"
            maxLength={1500}
            value={question}
            disabled={creating}
            onChange={(event) => changeQuestion(event.target.value)}
            placeholder="Describe the question, event, or market you want to explore…"
          />
        </label>
        <div className="flex flex-wrap gap-2" aria-label="Example questions">
          {([
            ["Bitcoin price by Friday?", "chart"],
            ["ETH above $3,500?", "bars"],
            ["Rate cut this quarter?", "news"],
            ["S&P 500 higher this month?", "calendar"],
          ] as const).map(([label, icon]) => (
            <button
              key={label}
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-[var(--th-soft)] px-3 text-sm hover:border-action"
              onClick={() => changeQuestion(label)}
              disabled={creating}
            >
              <Icon name={icon} size={14} />
              {label}
            </button>
          ))}
        </div>
        <label className="app-field block">
          <span className="mb-1 block text-sm font-semibold">Title <span className="font-normal text-muted">· optional</span></span>
          <input className="app-input min-h-11 w-full px-3 text-sm" value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder="Defaults to your question or selected market" disabled={creating} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" kind="secondary" icon="search" disabled={!question.trim() || searching || creating} loading={searching}>
            {searching ? "Searching markets…" : "Search Gemini markets"}
          </Button>
          <Button type="button" kind="ghost" icon="mic" onClick={talkItThrough} disabled={!question.trim() || creating}>Talk it through</Button>
        </div>
        {searchState ? <p role="status" className="text-sm text-muted">{searchState}</p> : null}
        {error ? (
          <p role="alert" className="rounded-lg border border-bad/30 bg-[#FFF5F4] p-3 text-sm text-bad">
            {error}
          </p>
        ) : null}
        {results.length ? (
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-line bg-[var(--th-canvas)] p-2" aria-label="Matching markets">
            {results.map((family) => (
              <button
                key={family.id}
                type="button"
                aria-pressed={selected?.id === family.id}
                disabled={creating}
                onClick={() => { setSelected((current) => current?.id === family.id ? null : family); setError(""); }}
                className={`block w-full rounded-xl border p-3 text-left transition-colors ${selected?.id === family.id ? "border-action bg-white shadow-[inset_0_0_0_1px_var(--action)]" : "border-transparent bg-white/80 hover:border-action/40"}`}
              >
                <span className="block text-xs text-muted">{family.mode === "live" ? "Gemini live market" : "Recorded replay"} · {family.freshness}</span>
                <span className="mt-1 block font-semibold">{family.title}</span>
                <span className="mt-1 block text-sm text-muted">{family.question}</span>
                <span className="mt-2 block text-xs text-muted">{family.contracts.length} listed contract{family.contracts.length === 1 ? "" : "s"} · observed {family.observationTime ? new Date(family.observationTime).toLocaleString() : "time unavailable"}</span>
              </button>
            ))}
          </div>
        ) : null}
        {selected ? (
          <div className="rounded-xl border border-[#CCD6F5] bg-[#F7F8FF] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-action">Selected market</p>
            <p className="mt-1 font-medium">{selected.title}</p>
            <button type="button" className="text-sm text-action underline" disabled={creating} onClick={() => setSelected(null)}>Remove market</button>
          </div>
        ) : null}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button kind="ghost" onClick={closeForm} disabled={creating}>Cancel</Button>
          <Button icon="plus" onClick={() => void createDraft()} disabled={question.trim().length < 8 || creating} loading={creating}>
            {creating ? "Creating draft…" : "Create draft"}
          </Button>
        </footer>
        <p className="text-center text-xs text-muted">{selected ? "You can refine your view in Research after saving." : "Save your question now and link a market when you’re ready."}</p>
      </form>
    </AppDialog>
  );
}
