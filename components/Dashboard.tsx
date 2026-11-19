"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { MarketFamily, PositionRecord, ThesisRevision } from "@/lib/domain/types";
import { api, dataContextFromStorage } from "@/lib/client";
import { formatUsdc } from "@/lib/format";
import { formatTime } from "@/lib/format";
import { Button, Card } from "@/components/ui";
import { StartThesisDialog } from "@/components/StartThesisDialog";

type Watchlist = { id: string; name: string; slugs: string[] };
type DashboardData = {
  theses: ThesisRevision[];
  positions: PositionRecord[];
};

function titleFor(topicSlug: string) {
  return topicSlug.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function viewFor(thesis: ThesisRevision) {
  if (thesis.template === "binary") return `${thesis.direction?.toUpperCase() || "YES"} on the selected Gemini contract`;
  if (thesis.template === "directional") return `${thesis.direction === "no" ? "Below" : "At or above"} ${thesis.lowerThreshold ?? "an unset threshold"}`;
  if (thesis.template === "outside") return `Outside ${thesis.lowerThreshold ?? "?"}–${thesis.upperThreshold ?? "?"}`;
  return `Between ${thesis.lowerThreshold ?? "?"} and ${thesis.upperThreshold ?? "?"}`;
}

function resumeHref(thesis: ThesisRevision, saved?: string) {
  if (saved && saved.startsWith(`/theses/${thesis.id}`)) return saved;
  if (thesis.status === "draft") return `/theses/${thesis.id}`;
  if (thesis.status === "quoted") return `/theses/${thesis.id}/review`;
  return `/theses/${thesis.id}/build`;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>({ theses: [], positions: [] });
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [watchedFamilies, setWatchedFamilies] = useState<MarketFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [resumePaths, setResumePaths] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ theses: ThesisRevision[] }>("/api/theses"),
      api<{ positions: PositionRecord[] }>("/api/positions"),
      api<{ watchlists: Watchlist[] }>("/api/watchlists").catch(() => ({ watchlists: [] as Watchlist[] })),
    ]).then(([theses, positions, lists]) => {
      if (!active) return;
      setData({ theses: theses.theses || [], positions: positions.positions || [] });
      setWatchlists(lists.watchlists || []);
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : "Dashboard data could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setResumePaths(Object.fromEntries(data.theses.flatMap((thesis) => {
      const saved = localStorage.getItem(`thesis:last-workspace:${thesis.id}`);
      return saved && saved.startsWith(`/theses/${thesis.id}`) ? [[thesis.id, saved]] : [];
    })));
  }, [data.theses]);

  useEffect(() => {
    const slugs = [...new Set(watchlists.flatMap((list) => list.slugs))].slice(0, 3);
    if (!slugs.length) return;
    let active = true;
    const mode = dataContextFromStorage();
    Promise.all(slugs.map((slug) => api<{ families: MarketFamily[] }>(`/api/topics?mode=${mode}&q=${encodeURIComponent(slug)}`).catch(() => ({ families: [] })))).then((results) => {
      if (active) setWatchedFamilies(results.flatMap((result) => result.families).filter((family) => slugs.includes(family.slug)));
    });
    return () => { active = false; };
  }, [watchlists]);

  const theses = useMemo(() => [...data.theses].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [data.theses]);
  const prominent = theses[0];
  const recent = theses.slice(prominent ? 1 : 0, 5);
  const activePositions = data.positions.filter((position) => !["resolved", "claimed", "voided", "exited"].includes(position.status));
  const totalCost = activePositions.reduce((sum, position) => sum + BigInt(position.premium || "0") + BigInt(position.fee || "0"), 0n);
  async function duplicateThesis(thesis: ThesisRevision) {
    setDuplicateBusy(true);
    setActionError("");
    setNotice("");
    try {
      const result = await api<{ thesis: ThesisRevision }>(`/api/theses/${thesis.id}`, { method: "PATCH", body: JSON.stringify({ action: "duplicate" }) });
      setNotice("Created an independent draft. The original thesis and any positions are unchanged.");
      setData((current) => ({ ...current, theses: [result.thesis, ...current.theses] }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not duplicate this thesis.");
    } finally {
      setDuplicateBusy(false);
    }
  }

  function continueHref(thesis: ThesisRevision) {
    return resumeHref(thesis, resumePaths[thesis.id]);
  }

  const prominentPosition = prominent && data.positions.find((position) => position.thesisId === prominent.id);
  const stateLabel = prominentPosition ? "Traded" : prominent?.status === "quoted" ? "Reviewed" : prominent?.status === "confirmed" ? "Confirmed" : "Draft";
  const stageIndex = prominentPosition ? 2 : prominent?.status === "quoted" ? 2 : prominent?.status === "confirmed" ? 1 : 0;

  return (
    <div className="screen-dashboard space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="dashboard-title screen-heading">Your thinking, in progress.</h1>
          <p className="mt-2 max-w-2xl text-base text-muted">Pick up a question, follow the evidence, and decide later whether it should become a trade.</p>
        </div>
        <Button onClick={() => { setStartOpen(true); setActionError(""); }}>＋ Start a thesis</Button>
      </header>

      <StartThesisDialog open={startOpen} onClose={() => setStartOpen(false)} />

      {error ? <Card><p role="alert" className="text-sm text-bad">{error}</p><div className="mt-2"><Button onClick={() => window.location.reload()} kind="ghost">Retry</Button></div></Card> : null}
      {actionError ? <p role="alert" className="text-sm text-bad">{actionError}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{notice}</p> : null}
      {loading ? <p role="status" className="text-sm text-muted">Loading your dashboard…</p> : null}

      {!loading && !prominent ? (
        <Card className="grid min-h-56 place-items-center text-center">
          <div className="max-w-lg"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#E9EEFF] text-3xl text-action">✳</div><h2 className="mt-4 font-serif text-2xl">Your first question starts here</h2><p className="mt-2 text-sm text-muted">Explore a supported market, inspect its rules, and save a thesis when you are ready. Research does not require a wallet.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Button onClick={() => setStartOpen(true)}>Start a thesis</Button><Button href="/explore" kind="ghost">Explore markets</Button></div></div>
        </Card>
      ) : null}

      {prominent || recent.length || watchedFamilies.length || activePositions.length ? <div className="dashboard-layout">
        <div className="space-y-5">
          {prominent ? <Card className="dashboard-feature space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="status-pill">{stateLabel}</span><span className="text-sm text-muted">Last saved {formatTime(prominent.updatedAt)}</span></div><h2 className="mt-3 font-serif text-3xl font-bold tracking-tight">{prominent.title?.trim() || titleFor(prominent.topicSlug)}</h2><p className="mt-2 text-base font-medium">{viewFor(prominent)}</p>{prominent.rationale ? <p className="mt-2 max-w-2xl text-sm text-muted">{prominent.rationale}</p> : null}</div>
              <details className="relative"><summary aria-label="Thesis actions" className="grid min-h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-line bg-white text-xl">···</summary><div className="thesis-popover absolute right-0 z-10 mt-1 min-w-44 p-2"><Link className="block rounded-lg px-3 py-2 text-sm hover:bg-[#F4F2ED]" href={`/theses/${prominent.id}/history`}>Open history</Link><button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F4F2ED] disabled:opacity-50" onClick={() => void duplicateThesis(prominent)} disabled={duplicateBusy}>{duplicateBusy ? "Duplicating…" : "Duplicate thesis"}</button></div></details>
            </div>
            <div className="dashboard-stage" aria-label="Thesis progress">
              {["Research", "Build", "Review"].map((label, index) => <div key={label} className="dashboard-stage__item" data-state={index < stageIndex ? "complete" : index === stageIndex ? "current" : "upcoming"}><span aria-hidden="true">{index < stageIndex ? "✓" : index + 1}</span>{label}</div>)}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4"><Button href={prominentPosition ? `/positions/${prominentPosition.id}` : continueHref(prominent)}>{prominentPosition ? "Open position" : "Continue"} <span className="ml-2" aria-hidden="true">→</span></Button><Button href={`/theses/${prominent.id}/history`} kind="ghost">History</Button><span className="ml-auto text-xs text-muted">Compare is optional · trading is optional</span></div>
          </Card> : null}

          {recent.length ? <section className="space-y-3"><div className="flex items-end justify-between gap-3"><div><h2 className="section-label">Recent work</h2><p className="text-sm text-muted">Your research stays useful without a trade.</p></div><Link className="text-sm font-semibold text-action" href="/theses">View all →</Link></div><div className="grid gap-3 md:grid-cols-2">{recent.map((thesis) => <Card key={thesis.id} className="flex flex-col justify-between gap-4"><div><p className="text-xs capitalize text-muted">{thesis.status} · saved {formatTime(thesis.updatedAt)}</p><h3 className="mt-2 font-serif text-xl font-semibold">{thesis.title?.trim() || titleFor(thesis.topicSlug)}</h3><p className="mt-1 text-sm text-muted">{viewFor(thesis)}</p></div><div className="flex flex-wrap items-center justify-between gap-2"><Button href={continueHref(thesis)} kind="ghost">Continue →</Button><Link className="text-sm text-muted hover:text-action" href={`/theses/${thesis.id}/history`}>History</Link></div></Card>)}</div></section> : null}

          {watchedFamilies.length ? <section className="space-y-3"><div className="flex items-end justify-between gap-3"><div><h2 className="section-label">Watched markets</h2><p className="text-sm text-muted">Saved research shortcuts; no background monitoring is implied.</p></div><Link href="/explore?view=watched" className="text-sm font-semibold text-action">Open Explore →</Link></div><div className="grid gap-3 md:grid-cols-2">{watchedFamilies.map((family) => <Card key={family.id}><p className="text-xs text-muted">{family.mode === "live" ? "Gemini live data" : "Recorded replay"} · {family.freshness}</p><h3 className="mt-1 font-serif text-lg font-semibold">{family.title}</h3><p className="mt-1 text-xs text-muted">Retrieved {formatTime(family.fetchedAt)}</p><div className="mt-3"><Button href={`/topics/${family.slug}`} kind="ghost">Continue research →</Button></div></Card>)}</div></section> : null}
        </div>

        <aside className="space-y-4">
          <Card className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Since your last visit</p><h2 className="mt-1 font-serif text-2xl font-bold">A clear next step</h2></div>
            {recent.length ? <div className="border-t border-line pt-4"><p className="text-xs text-muted">Recently updated thesis</p><h3 className="mt-1 font-semibold">{recent[0].title?.trim() || titleFor(recent[0].topicSlug)}</h3><p className="mt-1 text-sm text-muted">Saved {formatTime(recent[0].updatedAt)} · {recent[0].status}</p><Link href={`/theses/${recent[0].id}?updates=1`} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-action px-3 text-sm font-semibold text-action">Review changes →</Link></div> : null}
            {watchedFamilies.slice(0, 2).map((family) => <div key={family.id} className="border-t border-line pt-4"><p className="text-xs text-muted">Watched · retrieved {formatTime(family.fetchedAt)}</p><h3 className="mt-1 font-semibold">{family.title}</h3><p className="mt-1 text-sm text-muted">{family.freshness} market reference</p><Link href={`/topics/${family.slug}`} className="mt-2 inline-flex text-sm font-semibold text-action">Review market →</Link></div>)}
            {!recent.length && !watchedFamilies.length ? <p className="border-t border-line pt-4 text-sm text-muted">There are no new market updates in this saved snapshot. Continue your latest thesis or explore a market.</p> : null}
            <div className="border-t border-line pt-4"><Link href="/explore" className="text-sm font-semibold text-action">Explore markets →</Link></div>
          </Card>
          {activePositions.length ? <Card><p className="text-xs font-semibold uppercase tracking-wide text-muted">Portfolio snapshot</p><h2 className="mt-1 font-serif text-2xl font-bold">{activePositions.length} open position{activePositions.length === 1 ? "" : "s"}</h2><p className="mt-1 text-sm text-muted">Paper and Arc records only. Gemini venue holdings are shown separately in Portfolio.</p><div className="mt-4 flex items-baseline justify-between border-t border-line pt-4"><span className="text-sm text-muted">Recorded cost</span><strong className="tabular-nums">{formatUsdc(totalCost)} USDC</strong></div><Link href="/portfolio" className="mt-4 inline-flex min-h-10 items-center font-semibold text-action">Open Portfolio →</Link></Card> : null}
        </aside>
      </div> : null}
    </div>
  );
}
