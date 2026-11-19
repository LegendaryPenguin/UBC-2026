"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import type { ThesisHistoryRecord } from "@/lib/domain/types";
import { Button, Card, Empty } from "@/components/ui";
import { ThesisWorkspaceTabs } from "@/components/ThesisWorkspaceTabs";
import { formatUsdc } from "@/lib/format";
import { formatTime } from "@/lib/format";
import { AppDialog } from "@/components/AppDialog";

type HistoryEvent = {
  id: string;
  kind: "quote" | "position";
  at: string;
  status: string;
  mode: string;
  premium: string;
  fee: string;
  maxPayout: string;
  scenarioLabel?: string | null;
  href?: string;
};

function versionLabel(version: ThesisHistoryRecord) {
  return version.reason || (version.snapshot.status === "confirmed" ? "View confirmed" : "Draft saved");
}

export default function History() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [versions, setVersions] = useState<ThesisHistoryRecord[]>([]);
  const [currentRevision, setCurrentRevision] = useState(0);
  const [timeline, setTimeline] = useState<HistoryEvent[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"restore" | "duplicate" | "">("");
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [reflection, setReflection] = useState("");
  const [reflectionSavedAt, setReflectionSavedAt] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ versions: ThesisHistoryRecord[]; currentRevision: number; timeline: HistoryEvent[] }>(`/api/theses/${id}/history`);
      const nextVersions = result.versions || [];
      setVersions(nextVersions);
      setCurrentRevision(result.currentRevision);
      setTimeline(result.timeline || []);
      setSelectedRevision((current) => current && nextVersions.some((version) => version.revision === current) ? current : nextVersions[nextVersions.length - 1]?.revision ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "History could not be loaded.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const selected = versions.find((version) => version.revision === selectedRevision) || null;
  const previous = selected ? versions.find((version) => version.revision === selected.revision - 1) || null : null;
  const changes = useMemo(() => {
    if (!selected || !previous) return [];
    const fields: [string, string][] = [
      ["Payoff", "template"], ["Direction", "direction"], ["Lower boundary", "lowerThreshold"], ["Upper boundary", "upperThreshold"], ["Rationale", "rationale"], ["Reconsider if", "invalidation"],
    ];
    return fields.flatMap(([label, key]) => {
      const oldValue = String((previous.snapshot as unknown as Record<string, unknown>)[key] ?? "Not set");
      const newValue = String((selected.snapshot as unknown as Record<string, unknown>)[key] ?? "Not set");
      return oldValue === newValue ? [] : [{ label, oldValue, newValue }];
    });
  }, [selected, previous]);

  useEffect(() => {
    if (!selected) { setReflection(""); setReflectionSavedAt(""); return; }
    setReflection(selected.reflection || "");
    setReflectionSavedAt(selected.reflectionUpdatedAt || "");
  }, [id, selected?.revision]);

  async function saveReflection() {
    if (!selected) return;
    try {
      const result = await api<{ version: ThesisHistoryRecord }>(`/api/theses/${id}/history`, {
        method: "PATCH",
        body: JSON.stringify({ revision: selected.revision, reflection }),
      });
      setVersions((items) => items.map((item) => item.id === result.version.id ? result.version : item));
      setReflectionSavedAt(result.version.reflectionUpdatedAt || "");
      setNotice("Reflection saved with this thesis revision.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This reflection could not be saved; your text remains here so you can copy or retry.");
    }
  }

  async function restore() {
    if (!selected) return;
    setPending("restore");
    setError("");
    try {
      const result = await api<{ thesis: { id: string } }>(`/api/theses/${id}`, { method: "PATCH", body: JSON.stringify({ action: "restore", revision: selected.revision }) });
      router.push(`/theses/${result.thesis.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revision could not be restored. The historical version is unchanged.");
      setPending("");
      setRestoreOpen(false);
    }
  }

  async function duplicate() {
    setPending("duplicate");
    setError("");
    try {
      const result = await api<{ thesis: { id: string } }>(`/api/theses/${id}`, { method: "PATCH", body: JSON.stringify({ action: "duplicate" }) });
      router.push(`/theses/${result.thesis.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Thesis could not be duplicated. History remains unchanged.");
      setPending("");
    }
  }

  return (
    <div className="screen-history screen-workspace space-y-4">
      <header className="workspace-header flex flex-wrap items-end justify-between gap-3"><div><h1 className="workspace-title screen-heading">Thesis history</h1><p className="mt-2 text-sm text-muted">Revision {currentRevision} is current. Each saved view stays frozen with its original reasoning and evidence references.</p></div><span className="source-pill">History snapshot</span></header>
      <ThesisWorkspaceTabs thesisId={id} current="History" />
      {error ? <Card><p role="alert" className="text-sm text-bad">{error}</p><div className="mt-2"><Button onClick={() => void load()} kind="ghost">Retry</Button></div></Card> : null}
      {notice ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{notice}</p> : null}
      {loading ? <div role="status" className="grid gap-4 lg:grid-cols-[220px_1fr_300px]"><span className="sr-only">Loading revisions…</span><div className="h-64 animate-pulse rounded-card border border-line bg-white"/><div className="h-96 animate-pulse rounded-card border border-line bg-white"/><div className="h-72 animate-pulse rounded-card border border-line bg-white"/></div> : null}
      {!loading && !versions.length && !error ? <Empty title="No saved versions yet">Save or confirm a view to create its first frozen snapshot. Your current draft remains available in Research.<div className="mt-3"><Button href={`/theses/${id}`}>Back to Research</Button></div></Empty> : null}
      {!loading && versions.length && selected ? <div className="grid items-start gap-4 lg:grid-cols-[minmax(205px,.75fr)_minmax(0,2fr)_minmax(280px,.95fr)]">
        <Card className="space-y-4"><div><h2 className="section-label">History</h2><p className="mt-1 text-xs text-muted">Select a frozen milestone.</p></div><ol className="relative space-y-2 border-l border-[#D8DCE5] pl-4">
          {versions.map((version) => <li key={version.id} className="relative"><span aria-hidden="true" className={`absolute -left-[21px] top-4 h-3 w-3 rounded-full border-2 ${selected.revision === version.revision ? "border-action bg-white ring-4 ring-[#E9EEFF]" : "border-[#AEB7C0] bg-white"}`}/><button type="button" aria-current={selected.revision === version.revision ? "true" : undefined} onClick={() => setSelectedRevision(version.revision)} className={`w-full rounded-lg p-3 text-left ${selected.revision === version.revision ? "bg-[#E9EEFF]" : "hover:bg-[#F7F6F2]"}`}><span className="block font-semibold">{versionLabel(version)}</span><span className="mt-1 block text-xs text-muted">Revision {version.revision} · {formatTime(version.recordedAt)}</span></button></li>)}
          {timeline.map((item) => <li key={`${item.kind}-${item.id}`} className="relative"><span aria-hidden="true" className="absolute -left-[21px] top-4 h-3 w-3 rounded-full border-2 border-[#AEB7C0] bg-white"/><div className="rounded-lg p-3"><span className="block font-semibold">{item.kind === "quote" ? "Quote" : "Position"} · {item.status}</span><span className="mt-1 block text-xs text-muted">{formatTime(item.at)} · {item.mode}</span><p className="mt-2 text-xs">Cost {formatUsdc(BigInt(item.premium) + BigInt(item.fee))} USDC · gross payout {formatUsdc(BigInt(item.maxPayout))} USDC</p>{item.scenarioLabel ? <p className="mt-1 text-xs text-muted">Outcome · {item.scenarioLabel}</p> : null}{item.href ? <Link href={item.href} className="mt-2 inline-flex text-xs font-semibold text-action">View in Portfolio →</Link> : null}</div></li>)}
        </ol></Card>

        <Card className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="status-pill status-pill--good">Frozen snapshot</span><h2 className="mt-3 font-serif text-2xl font-bold">{versionLabel(selected)} · revision {selected.revision}</h2><p className="mt-1 text-sm text-muted">Saved {formatTime(selected.recordedAt)} · current revision {currentRevision}</p></div><Link href={`/theses/${id}`} className="text-sm font-semibold text-action">Back to current Research →</Link></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-line bg-[#FAF9F6] p-3"><p className="text-xs text-muted">Payoff</p><p className="mt-1 font-semibold capitalize">{selected.snapshot.template}</p></div><div className="rounded-lg border border-line bg-[#FAF9F6] p-3"><p className="text-xs text-muted">Revision status</p><p className="mt-1 font-semibold capitalize">{selected.snapshot.status}</p></div><div className="rounded-lg border border-line bg-[#FAF9F6] p-3"><p className="text-xs text-muted">Direction</p><p className="mt-1 font-semibold">{selected.snapshot.direction?.toUpperCase() || "Not set"}</p></div><div className="rounded-lg border border-line bg-[#FAF9F6] p-3"><p className="text-xs text-muted">Boundaries</p><p className="mt-1 font-semibold">{selected.snapshot.lowerThreshold ?? "Not set"}{selected.snapshot.upperThreshold != null ? ` – ${selected.snapshot.upperThreshold}` : ""}</p></div></div>
          <div><h3 className="font-semibold">User-stated rationale</h3><p className="mt-2 whitespace-pre-wrap rounded-lg border border-line p-3 text-sm">{selected.snapshot.rationale || "No rationale was recorded for this revision."}</p></div>
          <div><h3 className="font-semibold">Reconsider if</h3><p className="mt-2 whitespace-pre-wrap rounded-lg border border-line p-3 text-sm">{selected.snapshot.invalidation || "No reconsideration note was recorded."}</p></div>
          <div><h3 className="font-semibold">Evidence saved at this revision</h3>{selected.snapshot.evidenceIds.length ? <ul className="mt-2 flex flex-wrap gap-2">{selected.snapshot.evidenceIds.map((evidenceId) => <li key={evidenceId} className="source-pill">{evidenceId}</li>)}</ul> : <p className="mt-1 text-sm text-muted">No evidence IDs were attached to this view snapshot.</p>}</div>
          <div className="rounded-lg border border-line bg-[#FAF9F6] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Market snapshot</p><p className="mt-1 text-sm">Question and contract terms are preserved with the linked thesis and source IDs. Live values are not inserted into this historical record.</p><p className="mt-2 break-all text-xs text-muted">Market family: {selected.snapshot.familyId} · version: {selected.snapshot.familyVersion}</p></div>
        </Card>

        <aside className="space-y-4"><Card className="space-y-4"><div><h2 className="section-label">What changed?</h2><p className="mt-1 text-xs text-muted">Compared with the previous saved revision.</p></div>{previous ? changes.length ? <dl className="space-y-3">{changes.map((change) => <div key={change.label} className="border-b border-line pb-3"><dt className="text-xs font-semibold text-muted">{change.label}</dt><dd className="mt-1 text-sm"><span className="rounded bg-[#F4F2ED] px-2 py-1">{change.oldValue}</span><span className="mx-2 text-muted">→</span><span className="rounded bg-[#E9EEFF] px-2 py-1 text-action">{change.newValue}</span></dd></div>)}</dl> : <p className="rounded-lg bg-[#F7F8FF] p-3 text-sm">No tracked view fields changed.</p> : <p className="rounded-lg bg-[#F7F8FF] p-3 text-sm">This is the first saved snapshot.</p>}
            <p className="rounded-lg bg-[#F7F8FF] p-3 text-xs text-muted">Existing positions use their original confirmed revision and stay unchanged.</p>
            <Button onClick={() => setRestoreOpen(true)} disabled={pending !== ""}>Restore as new draft</Button><Button kind="ghost" onClick={() => void duplicate()} disabled={pending !== ""}>{pending === "duplicate" ? "Creating draft…" : "Duplicate thesis"}</Button>
          </Card>
          <Card className="space-y-3"><div><h2 className="font-serif text-xl font-bold">Reflection</h2><p className="mt-1 text-sm text-muted">Add a note about what changed or what you’ll watch next. It stays attached to this guest or signed-in revision.</p></div><textarea className="app-input min-h-28 w-full resize-y p-3 text-sm" maxLength={2000} value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="Why I changed the view, what I learned, or what I’ll monitor next…"/><Button onClick={() => void saveReflection()} disabled={!reflection.trim()}>Save reflection</Button>{reflectionSavedAt ? <p role="status" className="text-xs text-muted">Saved {formatTime(reflectionSavedAt)}</p> : null}</Card></aside>
      </div> : null}
      <AppDialog open={restoreOpen && Boolean(selected)} titleId="restore-history-title" onClose={() => { if (!pending) setRestoreOpen(false); }} closeOnBackdrop={!pending}>
        {selected ? <div className="space-y-4"><div><p className="source-pill">Restore snapshot</p><h2 id="restore-history-title" className="mt-3 font-serif text-2xl font-bold">Restore revision {selected.revision} as a new draft?</h2></div><p className="text-sm text-muted">A new draft will be created from this saved view and open in Research. This does not rewrite history or change any existing quote, order, or position.</p><div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3"><Button kind="ghost" onClick={() => setRestoreOpen(false)} disabled={pending === "restore"}>Cancel</Button><Button onClick={() => void restore()} disabled={pending !== ""}>{pending === "restore" ? "Creating draft…" : "Restore as new draft"}</Button></div></div> : null}
      </AppDialog>
    </div>
  );
}
