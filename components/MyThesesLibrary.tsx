"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { ThesisRevision } from "@/lib/domain/types";
import { Button, Card, Empty, Field, inputCls } from "@/components/ui";
import { Icon } from "@/components/thesis";
import { formatTime } from "@/lib/format";
import { StartThesisDialog } from "@/components/StartThesisDialog";

type LibraryState = "draft" | "active" | "traded" | "archived";
type LibraryThesis = ThesisRevision & { libraryState: LibraryState; canDelete: boolean };
type Filter = "all" | "draft" | "confirmed" | "traded" | "archived";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "confirmed", label: "Confirmed" },
  { id: "traded", label: "Traded" },
  { id: "archived", label: "Archived" },
];

function nameOf(thesis: LibraryThesis) {
  return thesis.title?.trim() || thesis.topicSlug.replaceAll("-", " ");
}

export default function MyThesesLibrary() {
  const [theses, setTheses] = useState<LibraryThesis[]>([]);
  const [filter, setFilter] = useState<Filter>(() => {
    if (typeof window === "undefined") return "all";
    const value = new URLSearchParams(window.location.search).get("filter");
    return FILTERS.some((item) => item.id === value) ? value as Filter : "all";
  });
  const [query, setQuery] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("q") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [renamingId, setRenamingId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [notice, setNotice] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const [lastArchived, setLastArchived] = useState<LibraryThesis | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ theses: LibraryThesis[] }>("/api/theses");
      setTheses(result.theses || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saved theses could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (filter === "all") url.searchParams.delete("filter"); else url.searchParams.set("filter", filter);
    if (query.trim()) url.searchParams.set("q", query.trim()); else url.searchParams.delete("q");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [filter, query]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return theses.filter((thesis) => {
      const matchesFilter = filter === "all" ||
        filter === "draft" && thesis.status === "draft" ||
        filter === "confirmed" && (thesis.status === "confirmed" || thesis.status === "quoted") && thesis.libraryState !== "traded" ||
        filter === "traded" && thesis.libraryState === "traded" ||
        filter === "archived" && thesis.archived;
      return matchesFilter &&
        (!needle || `${nameOf(thesis)} ${thesis.topicSlug} ${thesis.rationale} ${thesis.status}`.toLowerCase().includes(needle));
    });
  }, [filter, query, theses]);

  async function patchThesis(thesis: LibraryThesis, action: "duplicate" | "archive" | "unarchive" | "rename") {
    setPendingId(thesis.id);
    setError("");
    setNotice("");
    try {
      const result = await api<{ thesis: ThesisRevision }>(`/api/theses/${thesis.id}`, {
        method: "PATCH",
        body: JSON.stringify(action === "rename" ? { action, title: renameDraft } : { action }),
      });
      if (action === "duplicate") {
        await load();
        setNotice("Created an independent draft. The original and any position records are unchanged.");
      } else if (action === "archive" || action === "unarchive") {
        if (action === "archive") setLastArchived(thesis);
        else setLastArchived(null);
        setTheses((current) => current.map((item) => item.id === thesis.id ? { ...item, ...result.thesis, archived: action === "archive", libraryState: action === "archive" ? "archived" : item.status === "draft" ? "draft" : "active" } : item));
        setNotice(action === "archive" ? "Archived this thesis. Any position and execution record remains unchanged." : "Returned this thesis to the active library.");
      } else {
        setTheses((current) => current.map((item) => item.id === thesis.id ? { ...item, ...result.thesis } : item));
        setRenamingId("");
        setNotice("Thesis title updated. No view revision or position terms were changed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The thesis action could not be completed.");
    } finally {
      setPendingId("");
    }
  }

  async function deleteDraft(thesis: LibraryThesis) {
    setPendingId(thesis.id);
    setError("");
    try {
      await api(`/api/theses/${thesis.id}`, { method: "DELETE" });
      setTheses((current) => current.filter((item) => item.id !== thesis.id));
      setLastArchived(null);
      setDeleteId("");
      setNotice("Deleted the unconfirmed draft. Financial records are never deleted with a thesis.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "This draft could not be deleted.");
    } finally {
      setPendingId("");
    }
  }

  return (
    <div className="screen-theses space-y-5">
      <header className="th-row th-between">
        <div><h1 className="library-title screen-heading">Your thesis library</h1><p className="mt-2 text-base th-muted">Questions, constructions, and positions you’re working on.</p></div>
        <Button icon="plus" onClick={() => setStartOpen(true)}>New thesis</Button>
      </header>
      <StartThesisDialog open={startOpen} onClose={() => setStartOpen(false)} />

      {notice ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm"><span>{notice}</span>{lastArchived ? <button type="button" className="font-semibold text-action underline" onClick={() => void patchThesis(lastArchived, "unarchive")}>Undo archive</button> : null}</div> : null}
      {error ? <Card><p role="alert" className="text-sm text-bad">{error}</p><div className="mt-2"><Button onClick={() => void load()} kind="ghost">Retry</Button></div></Card> : null}

      <div className="library-controls">
        <div className="explore-search-wrap">
          <label className="sr-only" htmlFor="thesis-library-search">Search theses</label>
          <input id="thesis-library-search" className={`${inputCls()} explore-search`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search theses…" />
        </div>
        <div className="flex min-h-11 flex-wrap items-center gap-1 rounded-full border border-line bg-white p-1" role="tablist" aria-label="Filter theses">
          {FILTERS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={`min-h-9 rounded-full px-3.5 text-sm ${filter === item.id ? "bg-[#E9EEFF] font-semibold text-action" : "text-muted hover:bg-[#F5F4F0]"}`} onClick={() => setFilter(item.id)}>{item.label}</button>)}
        </div>
      </div>

      {loading ? <div role="status" className="space-y-2"><span className="sr-only">Loading your theses…</span>{[0, 1, 2].map((item) => <div key={item} className="h-[76px] animate-pulse rounded-xl border border-line bg-white/70" />)}</div> : null}
      {!loading && !error && !rows.length ? <Card className="grid min-h-56 place-items-center text-center"><div className="max-w-lg"><h2 className="font-serif text-2xl font-bold">{query || filter !== "all" ? "No theses match this view" : "Your first question starts here"}</h2><p className="mt-2 text-sm text-muted">{query || filter !== "all" ? "Clear your search or choose another filter." : "Start with a question and a supported market. Your research stays yours even if you never trade."}</p><div className="mt-4 flex justify-center gap-2">{query || filter !== "all" ? <Button kind="ghost" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</Button> : <Button onClick={() => setStartOpen(true)}>Start a thesis</Button>}</div></div></Card> : null}

      {rows.length ? <section className="library-table" aria-label="Saved theses">
        <div className="library-table__head"><span>Thesis</span><span>Stage</span><span>Updated</span><span>Next action</span><span aria-label="Actions" /></div>
        {rows.map((thesis) => {
          const title = nameOf(thesis);
          const route = `/theses/${thesis.id}`;
          const stage = thesis.libraryState === "traded" ? "Traded" : thesis.status === "quoted" ? "Review" : thesis.status === "confirmed" ? "Build" : "Research";
          const nextHref = thesis.status === "quoted" ? `${route}/review` : thesis.status === "confirmed" ? `${route}/build` : route;
          const nextLabel = thesis.libraryState === "traded" ? "Open thesis" : thesis.status === "quoted" ? "Review trade" : thesis.status === "confirmed" ? "Continue build" : "Continue";
          return <div key={thesis.id} className="library-table__row">
            <div className="min-w-0"><Link href={route} className="block truncate font-semibold hover:text-action">{title}</Link><p className="mt-1 truncate text-sm text-muted">{thesis.rationale || thesis.topicSlug.replaceAll("-", " ")}</p><p className="mt-1 text-xs capitalize text-muted">{thesis.libraryState === "traded" ? "Position linked" : `${thesis.status} · revision ${thesis.revision}`}</p>
              {renamingId === thesis.id ? <div className="mt-3 rounded-lg border border-line bg-[#FAF9F6] p-3"><Field label="Thesis title"><input className={inputCls()} maxLength={100} value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} /></Field><div className="mt-2 flex gap-2"><Button onClick={() => void patchThesis(thesis, "rename")} disabled={!renameDraft.trim() || pendingId === thesis.id}>{pendingId === thesis.id ? "Saving…" : "Save"}</Button><Button kind="ghost" onClick={() => setRenamingId("")}>Cancel</Button></div></div> : null}
              {deleteId === thesis.id ? <div className="mt-3 rounded-lg border border-bad/30 bg-[#FFF7F6] p-3"><p className="text-sm font-semibold">Delete “{title}”?</p><p className="mt-1 text-xs text-muted">Only this unconfirmed draft is deleted. Quotes, positions, and execution history are kept.</p><div className="mt-2 flex gap-2"><Button kind="danger" onClick={() => void deleteDraft(thesis)} disabled={pendingId === thesis.id}>{pendingId === thesis.id ? "Deleting…" : "Delete draft"}</Button><Button kind="ghost" onClick={() => setDeleteId("")}>Cancel</Button></div></div> : null}
            </div>
            <span className="library-stage inline-flex items-center gap-1.5"><Icon name={stage === "Research" ? "research" : stage === "Build" ? "build" : stage === "Review" ? "receipt" : "compare"} size={14} />{stage}</span>
            <span className="inline-flex items-center gap-1.5 text-sm th-muted"><Icon name="clock" size={14} />{formatTime(thesis.updatedAt)}</span>
            <Link href={nextHref} className="th-button th-button--primary inline-flex min-h-10 items-center justify-center px-3 text-sm">{nextLabel}<Icon name="arrow-right" size={14} /></Link>
            <details className="relative"><summary aria-label={`Actions for ${title}`} className="th-button th-button--ghost th-button--icon list-none"><Icon name="more" /></summary><div className="thesis-popover absolute right-0 z-10 mt-1 min-w-44 p-2">
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--th-soft)]" onClick={() => { setRenamingId(thesis.id); setRenameDraft(title); }}><Icon name="edit" size={16} />Rename</button>
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--th-soft)] disabled:opacity-50" disabled={pendingId === thesis.id} onClick={() => void patchThesis(thesis, "duplicate")}><Icon name="duplicate" size={16} />{pendingId === thesis.id ? "Duplicating…" : "Duplicate"}</button>
              {thesis.archived ? <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--th-soft)] disabled:opacity-50" disabled={pendingId === thesis.id} onClick={() => void patchThesis(thesis, "unarchive")}><Icon name="restore" size={16} />Unarchive</button> : <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--th-soft)] disabled:opacity-50" disabled={pendingId === thesis.id} onClick={() => void patchThesis(thesis, "archive")}><Icon name="archive" size={16} />Archive</button>}
              {thesis.canDelete ? <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-bad hover:bg-[var(--th-danger-bg)]" onClick={() => setDeleteId(thesis.id)}><Icon name="trash" size={16} />Delete draft</button> : null}
            </div></details>
          </div>;
        })}
      </section> : null}
    </div>
  );
}
