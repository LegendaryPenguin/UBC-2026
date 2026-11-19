"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, dataContextFromStorage, OPEN_ASSISTANT_EVENT } from "@/lib/client";
import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { AppDialog } from "@/components/AppDialog";

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

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => questionRef.current?.focus());
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !creating) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("keydown", onKey); };
  }, [open, creating, onClose]);

  async function searchMarkets(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!question.trim()) {
      setError("Enter the question you want to research first.");
      questionRef.current?.focus();
      return;
    }
    setSelected(null);
    setError("");
    setSearching(true);
    setSearchState("");
    try {
      const mode = dataContextFromStorage();
      const result = await api<{ families: MarketFamily[] }>(`/api/topics?mode=${mode}&q=${encodeURIComponent(question.trim())}`);
      setResults(result.families || []);
      setSearchState(result.families?.length ? "Choose the exact listed market that matches your question." : "No compatible market matched. Try a more specific term or browse Explore.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Market search failed. Your question is still here; retry or browse Explore.");
    } finally { setSearching(false); }
  }

  async function createDraft() {
    if (question.trim().length < 8) return;
    setCreating(true);
    setError("");
    try {
      const mode = dataContextFromStorage();
      const single = Boolean(selected && selected.predicates.length === 1 && selected.contracts.length === 1);
      const result = await api<{ thesis: ThesisRevision }>("/api/theses", {
        method: "POST",
        body: JSON.stringify({
          topicSlug: selected?.slug,
          familyId: selected?.id,
          familyVersion: selected?.version,
          mode,
          title: title.trim() || undefined,
          ...(selected ? {
            template: single ? "binary" : selected.predicates.length >= 2 ? "range" : "directional",
            lowerThreshold: single ? null : selected.predicates[0]?.threshold ?? null,
            upperThreshold: !single && selected.predicates.length >= 2 ? selected.predicates[1]?.threshold ?? null : null,
          } : {}),
          direction: "yes",
          rationale: question.trim(),
          evidenceIds: [],
        }),
      });
      onClose();
      router.push(`/theses/${result.thesis.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Draft could not be saved. Your question is still here to retry.");
      setCreating(false);
    }
  }

  function talkItThrough() {
    const savedQuestion = question.trim();
    onClose();
    window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { detail: { question: savedQuestion } }));
  }

  return (
    <AppDialog open={open} titleId="start-thesis-title" describedBy="start-thesis-description" onClose={() => { if (!creating) onClose(); }} closeOnBackdrop={!creating}>
      <header className="flex items-start justify-between gap-4">
        <div><p className="source-pill">New research</p><h2 id="start-thesis-title" className="mt-3 font-serif text-3xl font-bold tracking-tight">What question are you exploring?</h2><p id="start-thesis-description" className="mt-2 text-sm text-muted">Turn a question into a research draft. You can explore without a wallet or funding.</p></div>
        <button type="button" aria-label="Close new thesis" className="min-h-10 rounded-lg px-3 text-2xl leading-none text-muted hover:bg-[#F4F2ED] disabled:opacity-50" onClick={onClose} disabled={creating}>×</button>
      </header>
      <form onSubmit={(event) => void searchMarkets(event)} className="mt-5 space-y-4">
        <label className="app-field block"><span className="mb-1 block text-sm font-semibold">Your question</span><textarea ref={questionRef} className="app-input min-h-28 w-full resize-y px-3 py-3 text-sm" maxLength={1500} value={question} onChange={(event) => { setQuestion(event.target.value); setSelected(null); setError(""); }} placeholder="Describe the question, event, or market you want to explore…" /></label>
        <label className="app-field block"><span className="mb-1 block text-sm font-semibold">Title <span className="font-normal text-muted">· optional</span></span><input className="app-input min-h-11 w-full px-3 text-sm" value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder="A short name for this thesis" /></label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={!question.trim() || searching || creating} className="app-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold disabled:opacity-50"><span aria-hidden="true">⌕</span>{searching ? "Searching markets…" : "Search Gemini markets"}</button>
          <button type="button" onClick={talkItThrough} disabled={!question.trim() || creating} className="app-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#E9EEFF] px-4 text-sm font-semibold text-action disabled:opacity-50"><span aria-hidden="true">♩</span>Talk it through</button>
        </div>
        {searchState ? <p role="status" className="text-sm text-muted">{searchState}</p> : null}
        {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-[#FFF5F4] p-3 text-sm text-bad">{error}{error.toLowerCase().includes("failed") || error.toLowerCase().includes("could not") ? <button type="button" className="ml-2 font-semibold underline" onClick={() => void searchMarkets()}>Retry</button> : null}</p> : null}
        {results.length ? <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-line p-2" aria-label="Matching markets">
          {results.map((family) => <button key={family.id} type="button" aria-pressed={selected?.id === family.id} onClick={() => { setSelected(family); setError(""); }} className={`block w-full rounded-lg border p-3 text-left transition-colors ${selected?.id === family.id ? "border-action bg-[#EEF2FF]" : "border-line hover:border-action"}`}>
            <span className="block text-xs text-muted">{family.mode === "live" ? "Gemini live market" : "Illustrative replay"} · {family.freshness}</span><span className="mt-1 block font-semibold">{family.title}</span><span className="mt-1 block text-sm text-muted">{family.question}</span><span className="mt-2 block text-xs text-muted">{family.contracts.length} listed contract{family.contracts.length === 1 ? "" : "s"} · observed {family.observationTime ? new Date(family.observationTime).toLocaleString() : "time unavailable"}</span>
          </button>)}
        </div> : null}
        {selected ? <div className="rounded-lg border border-[#CCD6F5] bg-[#F7F8FF] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-action">Selected market</p><p className="mt-1 font-medium">{selected.title}</p><p className="mt-1 text-sm text-muted">The draft will open on Research with these exact Gemini contract identities. You can refine the supported view before confirming.</p></div> : null}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} disabled={creating} className="app-button min-h-11 rounded-lg border border-line px-4 text-sm font-semibold">Cancel</button>
          <button type="button" onClick={() => void createDraft()} disabled={question.trim().length < 8 || creating} className="app-button min-h-11 rounded-lg bg-action px-5 text-sm font-semibold text-white disabled:opacity-50">{creating ? "Creating draft…" : selected ? "Create market-linked draft" : "Create draft"}</button>
        </footer>
        <p className="text-center text-xs text-muted">Market selection is optional. An unbound draft opens in Research so you can attach a compatible market later. Creating a draft never places or authorizes a trade.</p>
      </form>
    </AppDialog>
  );
}
