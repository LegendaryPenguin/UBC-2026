"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { MarketFamily, PositionRecord, ThesisRevision } from "@/lib/domain/types";
import { api, dataContextFromStorage, OPEN_ASSISTANT_EVENT } from "@/lib/client";
import { formatUsdc } from "@/lib/format";
import { formatTime } from "@/lib/format";
import { Badge, Button, Card } from "@/components/ui";
import { BrandMark, Icon } from "@/components/thesis";
import { StartThesisDialog } from "@/components/StartThesisDialog";
import { MarketDiscoveryComposer } from "@/components/MarketDiscoveryComposer";

type Watchlist = { id: string; name: string; slugs: string[] };
type DashboardData = {
  theses: ThesisRevision[];
  positions: PositionRecord[];
};

function titleFor(topicSlug: string) {
  return topicSlug.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function isBound(thesis: ThesisRevision) {
  return Boolean(thesis.topicSlug && thesis.familyId);
}

function viewFor(thesis: ThesisRevision) {
  if (!isBound(thesis)) return "No Gemini market attached yet — open Research to pick one";
  if (thesis.template === "binary") return `${thesis.direction?.toUpperCase() || "YES"} on the selected Gemini contract`;
  if (thesis.template === "directional") {
    if (thesis.lowerThreshold == null) return "Directional view not set — open Research to propose thresholds";
    return `${thesis.direction === "no" ? "Below" : "At or above"} ${thesis.lowerThreshold}`;
  }
  if (thesis.lowerThreshold == null || thesis.upperThreshold == null) {
    return `${thesis.template === "outside" ? "Outside" : "Range"} bounds not set — open Research to propose listed thresholds`;
  }
  if (thesis.template === "outside") return `Outside ${thesis.lowerThreshold}–${thesis.upperThreshold}`;
  return `Between ${thesis.lowerThreshold} and ${thesis.upperThreshold}`;
}

function resumeHref(thesis: ThesisRevision, saved?: string) {
  if (saved && saved.startsWith(`/theses/${thesis.id}`)) return saved;
  if (thesis.status === "draft") return `/theses/${thesis.id}`;
  if (thesis.status === "quoted") return `/theses/${thesis.id}/review`;
  return `/theses/${thesis.id}/build`;
}

function savedLabel(value: string) {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed)) return "Saved draft";
  if (elapsed < 60_000) return "Saved just now";
  const unit = elapsed < 3_600_000 ? "minute" : elapsed < 86_400_000 ? "hour" : "day";
  const unitMs = { minute: 60_000, hour: 3_600_000, day: 86_400_000 }[unit];
  return `Saved ${new Intl.RelativeTimeFormat("en", { numeric: "always" }).format(-Math.floor(elapsed / unitMs), unit)}`;
}

function DraftIllustration() {
  return <div className="draft-art" aria-hidden="true">
    <span className="draft-art__line draft-art__line--top" />
    <span className="draft-art__line draft-art__line--bottom" />
    <span className="draft-art__paper"><span>?</span></span>
    <span className="draft-art__market draft-art__market--top"><i /></span>
    <span className="draft-art__market draft-art__market--bottom"><i /></span>
    <Icon name="assistant" className="draft-art__spark" />
    <BrandMark size={51} className="draft-art__mark" />
  </div>;
}

function DashboardDraft({ thesis, duplicate, duplicating }: {
  thesis: ThesisRevision;
  duplicate: () => void;
  duplicating: boolean;
}) {
  const bound = isBound(thesis);
  const workspace = `/theses/${thesis.id}`;
  const question = thesis.rationale.trim();
  const title = thesis.title?.trim() || (bound ? titleFor(thesis.topicSlug) : "Untitled draft");
  function refine() {
    window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, {
      detail: { thesisId: thesis.id, question: `Help me refine this research question: ${question || title}`.slice(0, 3_000) },
    }));
  }
  return <>
    <div className="dashboard-layout dashboard-draft-grid">
      <Card className="dashboard-draft">
        <div className="dashboard-draft__meta">
          <Badge tone="primary">Draft</Badge>
          <span><Icon name="clock" size={17} /><time dateTime={thesis.updatedAt} title={formatTime(thesis.updatedAt)}>{savedLabel(thesis.updatedAt)}</time></span>
          <details className="relative">
            <summary aria-label="Thesis actions" className="th-button th-button--ghost th-button--icon list-none"><Icon name="more" /></summary>
            <div className="thesis-popover absolute right-0 z-10 mt-1 min-w-44 p-2">
              <Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--th-soft)]" href={`${workspace}/history`}><Icon name="history" size={16} />Open history</Link>
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--th-soft)] disabled:opacity-50" onClick={duplicate} disabled={duplicating}><Icon name="duplicate" size={16} />{duplicating ? "Duplicating…" : "Duplicate thesis"}</button>
            </div>
          </details>
        </div>
        <div className="dashboard-draft__body">
          <div className="dashboard-draft__text">
            <h2>{title}</h2>
            {question ? <blockquote>“{question}”</blockquote> : null}
            <p className="th-muted">{bound ? "Your question is saved. Continue researching the linked Gemini market." : "Your question is saved. Find a Gemini market to explore it."}</p>
            <div className="dashboard-draft__actions">
              <Button href={workspace}>{bound ? "Continue research" : "Find matching markets"}<Icon name="arrow-right" size={18} /></Button>
              <Button kind="secondary" onClick={refine}>Ask Thesis</Button>
            </div>
          </div>
          <DraftIllustration />
        </div>
        <div className="dashboard-draft__footer">
          <div className="dashboard-stage" aria-label="Thesis progress">
            <Link href={workspace} className="dashboard-stage__item" data-state="current" aria-current="step"><Icon name="research" size={17} />Research</Link>
            <span className="dashboard-draft__connector" aria-hidden="true" />
            <span className="dashboard-stage__item" data-state="upcoming"><Icon name="build" size={17} />Build</span>
            <span className="dashboard-draft__connector" aria-hidden="true" />
            <span className="dashboard-stage__item" data-state="upcoming"><Icon name="receipt" size={17} />Review</span>
          </div>
          <Link href={`${workspace}/history`} className="dashboard-draft__history"><Icon name="history" size={22} />History</Link>
        </div>
      </Card>
      <Card className="dashboard-draft-next">
        <p className="th-label th-muted">Your next step</p>
        <h2>Continue your research</h2>
        <Link className="dashboard-draft-next__row" href={workspace}>
          <span className="dashboard-draft-next__icon"><Icon name="build" size={24} /></span>
          <span><strong>{bound ? "Review your Gemini market" : "Find related Gemini markets"}</strong><small>{bound ? "Open the linked contract and its rules" : "Explore contracts connected to your question"}</small></span>
          <Icon name="arrow-right" size={20} />
        </Link>
        <button className="dashboard-draft-next__row" type="button" onClick={refine}>
          <span className="dashboard-draft-next__icon"><Icon name="edit" size={24} /></span>
          <span><strong>Refine my question</strong><small>Work through your idea with Thesis</small></span>
          <Icon name="arrow-right" size={20} />
        </button>
      </Card>
    </div>
    <p className="dashboard-draft__note"><Icon name="info" size={20} />Start with curiosity. You can save a thesis without making a trade.</p>
  </>;
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
  const draftHero = prominent?.status === "draft" && !prominentPosition ? prominent : null;
  const stateLabel = prominentPosition ? "Traded" : prominent?.status === "quoted" ? "Reviewed" : prominent?.status === "confirmed" ? "Confirmed" : "Draft";
  // Research → Build → Compare (optional) → Review — art notes replace Refine with Review
  const stageIndex = prominentPosition ? 3 : prominent?.status === "quoted" ? 3 : prominent?.status === "confirmed" ? 1 : 0;

  return (
    <div className="screen-dashboard space-y-6">
      <header className={`th-row th-between ${draftHero ? "dashboard-draft-heading" : ""}`}>
        <div>
          <h1 className="dashboard-title screen-heading">Your thinking, in progress.</h1>
          <p className="mt-2 text-base th-muted">{draftHero ? "Pick up a question. Follow the evidence. Shape your view." : "Pick up a question, follow the evidence, and decide later whether it should become a trade."}</p>
        </div>
        {prominent ? <Button kind={draftHero ? "secondary" : "primary"} icon="plus" onClick={() => { setStartOpen(true); setActionError(""); }}>Start a thesis</Button> : null}
      </header>

      <StartThesisDialog open={startOpen} onClose={() => setStartOpen(false)} />

      {error ? <Card><p role="alert" className="text-sm text-bad">{error}</p><div className="mt-2"><Button onClick={() => window.location.reload()} kind="ghost">Retry</Button></div></Card> : null}
      {actionError ? <p role="alert" className="text-sm text-bad">{actionError}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{notice}</p> : null}
      {loading ? <p role="status" className="text-sm text-muted">Loading your dashboard…</p> : null}

      {!loading && !prominent ? <MarketDiscoveryComposer onStart={() => setStartOpen(true)} /> : null}
      {prominent ? <details className="dashboard-discovery"><summary>Research a new observation</summary><MarketDiscoveryComposer onStart={() => setStartOpen(true)} /></details> : null}

      {draftHero ? <DashboardDraft thesis={draftHero} duplicating={duplicateBusy} duplicate={() => void duplicateThesis(draftHero)} /> : null}

      {(prominent && !draftHero) || recent.length || watchedFamilies.length || activePositions.length ? <div className="dashboard-layout">
        <div className="space-y-5">
          {prominent && !draftHero ? <Card variant="hero" className="dashboard-feature space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="primary">{stateLabel}</Badge>
                  {!isBound(prominent) ? <Badge tone="warning">Needs market</Badge> : null}
                  <span className="inline-flex items-center gap-1.5 text-sm th-muted"><Icon name="clock" size={14} />Last saved {formatTime(prominent.updatedAt)}</span>
                </div>
                <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight">{prominent.title?.trim() || (isBound(prominent) ? titleFor(prominent.topicSlug) : "Untitled draft")}</h2>
                <p className="mt-2 inline-flex items-start gap-2 text-base font-medium"><Icon name="target" size={16} className="mt-0.5 shrink-0" />{viewFor(prominent)}</p>
                {prominent.rationale ? <p className="mt-2 max-w-2xl text-sm th-muted line-clamp-3">{prominent.rationale}</p> : null}
                {!isBound(prominent) ? (
                  <p className="mt-3 rounded-xl border border-[var(--th-warning)]/30 bg-[var(--th-warning-bg)] px-3 py-2 text-sm text-[var(--th-warning)]">
                    This draft has no linked Gemini contract. Continue into Research and attach a live market before proposing a view.
                  </p>
                ) : null}
              </div>
              <details className="relative">
                <summary aria-label="Thesis actions" className="th-button th-button--ghost th-button--icon list-none"><Icon name="more" /></summary>
                <div className="thesis-popover absolute right-0 z-10 mt-1 min-w-44 p-2">
                  <Link className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--th-soft)]" href={`/theses/${prominent.id}/history`}><Icon name="history" size={16} />Open history</Link>
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--th-soft)] disabled:opacity-50" onClick={() => void duplicateThesis(prominent)} disabled={duplicateBusy}><Icon name="duplicate" size={16} />{duplicateBusy ? "Duplicating…" : "Duplicate thesis"}</button>
                </div>
              </details>
            </div>
            <div className="dashboard-stage" aria-label="Thesis progress">
              {([
                ["Research", "research"],
                ["Build", "build"],
                ["Compare", "compare"],
                ["Review", "receipt"],
              ] as const).map(([label, icon], index, stages) => (
                <span key={label} className="contents">
                  <div className="dashboard-stage__item" data-state={index < stageIndex ? "complete" : index === stageIndex ? "current" : "upcoming"}>
                    <Icon name={index < stageIndex ? "check" : icon} size={14} />
                    {label}
                  </div>
                  {index < stages.length - 1 ? <span className="dashboard-stage__sep" aria-hidden="true"><Icon name="chevron-right" size={14} /></span> : null}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Button href={prominentPosition ? `/positions/${prominentPosition.id}` : continueHref(prominent)} icon="arrow-right">
                {prominentPosition ? "Open position" : !isBound(prominent) ? "Attach market" : prominent.status === "draft" ? "Continue Research" : "Continue"}
              </Button>
              <Button href={`/theses/${prominent.id}/history`} kind="ghost" icon="history">History</Button>
              <span className="ml-auto text-xs th-muted">Compare is optional · trading is optional</span>
            </div>
          </Card> : null}

          {recent.length ? <section className="space-y-3"><div className="flex items-end justify-between gap-3"><div><h2 className="section-label">Recent work</h2><p className="text-sm text-muted">Your research stays useful without a trade.</p></div><Link className="text-sm font-semibold text-action" href="/theses">View all →</Link></div><div className="grid gap-3 md:grid-cols-2">{recent.map((thesis) => <Card key={thesis.id} className="flex flex-col justify-between gap-4"><div><p className="text-xs capitalize text-muted">{thesis.status} · saved {formatTime(thesis.updatedAt)}</p><h3 className="mt-2 font-serif text-xl font-semibold">{thesis.title?.trim() || titleFor(thesis.topicSlug)}</h3><p className="mt-1 text-sm text-muted">{viewFor(thesis)}</p></div><div className="flex flex-wrap items-center justify-between gap-2"><Button href={continueHref(thesis)} kind="ghost">Continue →</Button><Link className="text-sm text-muted hover:text-action" href={`/theses/${thesis.id}/history`}>History</Link></div></Card>)}</div></section> : null}

          {watchedFamilies.length ? <section className="space-y-3"><div className="flex items-end justify-between gap-3"><div><h2 className="section-label">Watched markets</h2><p className="text-sm text-muted">Saved research shortcuts; no background monitoring is implied.</p></div><Link href="/explore?view=watched" className="text-sm font-semibold text-action">Open Explore →</Link></div><div className="grid gap-3 md:grid-cols-2">{watchedFamilies.map((family) => <Card key={family.id}><p className="text-xs text-muted">{family.mode === "live" ? "Gemini live data" : "Recorded replay"} · {family.freshness}</p><h3 className="mt-1 font-serif text-lg font-semibold">{family.title}</h3><p className="mt-1 text-xs text-muted">Retrieved {formatTime(family.fetchedAt)}</p><div className="mt-3"><Button href={`/topics/${family.slug}`} kind="ghost">Continue research →</Button></div></Card>)}</div></section> : null}

          {activePositions.length ? <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl font-bold">Paper portfolio</h2>
                <p className="mt-1 text-sm text-muted">A sandbox to test ideas with illustrative positions.</p>
              </div>
              <Button href="/portfolio?venue=paper" kind="ghost">Open portfolio →</Button>
            </div>
            <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <div><p className="text-xs text-muted">Recorded cost</p><p className="mt-1 font-semibold tabular-nums">{formatUsdc(totalCost)} USDC</p></div>
              <div><p className="text-xs text-muted">Positions</p><p className="mt-1 font-semibold">{activePositions.length}</p></div>
              <div><p className="text-xs text-muted">Context</p><p className="mt-1 text-sm font-medium">Paper, not a live account</p></div>
            </div>
          </Card> : null}
        </div>

        <aside className="space-y-4">
          <Card className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Since your last visit</p><h2 className="mt-1 font-serif text-2xl font-bold">A clear next step</h2></div>
            {recent.length ? <div className="border-t border-line pt-4"><p className="text-xs text-muted">Recently updated thesis</p><h3 className="mt-1 font-semibold">{recent[0].title?.trim() || titleFor(recent[0].topicSlug)}</h3><p className="mt-1 text-sm text-muted">Saved {formatTime(recent[0].updatedAt)} · {recent[0].status}</p><Link href={`/theses/${recent[0].id}?updates=1`} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-action px-3 text-sm font-semibold text-action">Review changes →</Link></div> : null}
            {watchedFamilies.slice(0, 2).map((family) => <div key={family.id} className="border-t border-line pt-4"><p className="text-xs text-muted">Watched · retrieved {formatTime(family.fetchedAt)}</p><h3 className="mt-1 font-semibold">{family.title}</h3><p className="mt-1 text-sm text-muted">{family.freshness} market reference</p><Link href={`/topics/${family.slug}`} className="mt-2 inline-flex text-sm font-semibold text-action">Review market →</Link></div>)}
            {!recent.length && !watchedFamilies.length ? <p className="border-t border-line pt-4 text-sm text-muted">There are no new market updates in this saved snapshot. Continue your latest thesis or explore a market.</p> : null}
            <div className="border-t border-line pt-4"><Link href="/explore" className="text-sm font-semibold text-action">Explore markets →</Link></div>
          </Card>
        </aside>
      </div> : null}
    </div>
  );
}
