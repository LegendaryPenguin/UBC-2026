"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, createMarketResearchDraft, dataContextFromStorage, findRecordedRangeMarket, OPEN_ASSISTANT_EVENT, startRecordedRehearsal } from "@/lib/client";
import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { WorkspaceAssistant } from "@/components/WorkspaceAssistant";
import type { ResearchUpdate } from "@/components/VoicePanel";
import { Icon } from "@/components/thesis";
import { Button, Empty, Field, inputCls } from "@/components/ui";
import { ThesisWorkspaceTabs } from "@/components/ThesisWorkspaceTabs";
import {
  hasResearchHistory, ResearchChart, ResearchEvidenceDrawer, ResearchEvidenceList,
  ResearchArticleSourceTile, ResearchOutcomes, ResearchPrices, ResearchRelatedContracts, ResearchRules, ResearchSavedTile, ResearchTile, researchTime, type RelatedContract,
} from "@/components/ResearchBoard";
import { thesisViewLabel } from "@/components/ThesisViewPanel";
import { useModeChange } from "@/lib/use-mode-change";
import { useGeminiMarketStream } from "@/lib/gemini/use-market-stream";
import { GeminiLiveMarketFeed } from "@/components/GeminiLiveMarketFeed";
import { formatTime } from "@/lib/format";
import { AppDrawer } from "@/components/AppDrawer";
import { AppDialog } from "@/components/AppDialog";
import { useResearchNotebook } from "@/lib/use-research-notebook";
import { marketThesisTitle, researchRangeLabel } from "@/lib/research-range";
import { asksForCounterargument, marketObservation } from "@/lib/research";

type ResearchMarket = { family: MarketFamily; evidence: EvidenceItem[]; relatedContracts?: RelatedContract[] };

export default function ThesisEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [relatedContracts, setRelatedContracts] = useState<RelatedContract[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"save" | "confirm" | "duplicate" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reviewingConfirmation, setReviewingConfirmation] = useState(false);
  const [editingView, setEditingView] = useState(false);
  const editSnapshot = useRef<{ thesis: ThesisRevision; dirty: boolean } | null>(null);
  function beginViewEdit() {
    if (thesis) editSnapshot.current = { thesis: structuredClone(thesis), dirty };
    setEditingView(true);
  }
  function cancelViewEdit() {
    if (editSnapshot.current) { setThesis(editSnapshot.current.thesis); setDirty(editSnapshot.current.dirty); }
    setEditingView(false);
  }
  const [pendingDestination, setPendingDestination] = useState("");
  const [evidenceFilter, setEvidenceFilter] = useState<"all" | "supports" | "challenges">("all");
  const [savedEvidence, setSavedEvidence] = useState<EvidenceItem[]>([]);
  const [sourceSaveError, setSourceSaveError] = useState("");
  const [savingEvidence, setSavingEvidence] = useState(false);
  const evidencePending = useRef(false);
  const notebook = useResearchNotebook(`thesis:${id}`);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantRequest, setAssistantRequest] = useState(0);
  const [researchUpdate, setResearchUpdate] = useState<ResearchUpdate | null>(null);
  const [counterargument, setCounterargument] = useState<ResearchUpdate | null>(null);
  const [matchingMarkets, setMatchingMarkets] = useState<MarketFamily[]>([]);
  const [marketQuery, setMarketQuery] = useState("");
  const [marketSearching, setMarketSearching] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [bindingMarket, setBindingMarket] = useState("");
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [marketFeedOpen, setMarketFeedOpen] = useState(false);
  const [refreshingMarket, setRefreshingMarket] = useState(false);
  const [openingRehearsal, setOpeningRehearsal] = useState(false);

  const searchMarkets = useCallback(async (question: string, signal?: AbortSignal) => {
    setMarketSearching(true);
    setMarketError("");
    setMatchingMarkets([]);
    try {
      const result = await api<{ families: MarketFamily[]; liveError?: string }>(
        `/api/topics?mode=${dataContextFromStorage()}&discovery=1&q=${encodeURIComponent(question)}`, { signal },
      );
      if (signal?.aborted) return;
      setMatchingMarkets(result.families || []);
      if (result.liveError) setMarketError("Gemini search is unavailable. Try searching again.");
    } catch {
      if (!signal?.aborted) setMarketError("Markets could not be loaded. Try searching again.");
    } finally {
      if (!signal?.aborted) setMarketSearching(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    if (params.get("updates") === "1") setUpdatesOpen(true);
    setEditingView(params.get("edit") === "1");
    setFamily(null);
    setRelatedContracts([]);
    setSavedEvidence([]);
    setResearchUpdate(null);
    setCounterargument(null);
    setLoading(true);
    api<{ thesis: ThesisRevision }>(`/api/theses/${id}`)
      .then(async ({ thesis: current }) => {
        if (!active) return;
        setThesis(current);
        const mode = dataContextFromStorage();
        if (!current.topicSlug) {
          const query = (current.rationale || current.title || "").slice(0, 300);
          setMarketQuery(query);
          const selected = params.get("market");
          if (selected && /^[a-z0-9][a-z0-9-]{0,79}$/.test(selected)) {
            try {
              const event = params.get("event");
              const result = await api<{ family: MarketFamily }>(`/api/topics/${selected}?mode=${mode}${event ? `&event=${encodeURIComponent(event)}` : ""}`, { signal: controller.signal });
              if (active && result.family) {
                setMatchingMarkets([result.family]);
                return;
              }
            } catch {
              if (active) setNotice("That market could not be loaded. Try another listed market below.");
            }
          }
          if (active && query) void searchMarkets(query, controller.signal);
          return;
        }
        try {
          const topic = await api<ResearchMarket>(`/api/topics/${current.topicSlug}?mode=${mode}`);
          if (active) {
            setFamily(topic.family);
            setRelatedContracts(topic.relatedContracts || []);
            setEvidence(topic.evidence);
            setSavedEvidence(topic.evidence.filter((item) => current.evidenceIds.includes(item.id)));
          }
        } catch {
          if (active) setNotice("Topic data is unavailable. Manual editing and saved-view recovery remain available.");
        }
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Thesis could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [id, searchMarkets]);

  const refreshMarketData = useCallback(async () => {
    if (!thesis?.topicSlug) return;
    const mode = dataContextFromStorage();
    setRefreshingMarket(true);
    try {
      const topic = await api<ResearchMarket>(`/api/topics/${thesis.topicSlug}?mode=${mode}`);
      setFamily(topic.family);
      setRelatedContracts(topic.relatedContracts || []);
      setEvidence(topic.evidence);
      setSavedEvidence(topic.evidence.filter((item) => thesis.evidenceIds.includes(item.id)));
      setNotice(`Market research refreshed for ${topic.family.mode === "live" ? "Live data" : "Replay"}. Your view edits remain here.`);
    } catch (err) {
      setNotice(err instanceof Error ? `Market data could not refresh: ${err.message}. Your view edits remain here.` : "Market data could not refresh. Your view edits remain here.");
    } finally {
      setRefreshingMarket(false);
    }
  }, [thesis?.topicSlug, thesis?.evidenceIds]);

  useModeChange(() => { void refreshMarketData(); });

  const historyPredicates = thesis
    ? [thesis.lowerThreshold, thesis.upperThreshold]
      .filter((threshold): threshold is number => threshold != null)
      .map((threshold) => family?.predicates.find((predicate) => predicate.threshold === threshold))
      .filter((predicate) => predicate != null)
    : [];
  const historyContracts = historyPredicates
    .map((predicate) => family?.contracts.find((contract) => contract.id === predicate.contractId))
    .filter((contract) => contract != null);
  const selectedRuleContracts = !family || !thesis
    ? []
    : thesis.template === "binary" ? family.contracts.slice(0, 1) : historyContracts;
  const liveContract = family?.mode === "live" ? selectedRuleContracts[0] ?? null : null;
  const marketFeed = useGeminiMarketStream(liveContract?.instrumentSymbol ?? null, Boolean(liveContract));

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function change<K extends keyof ThesisRevision>(key: K, value: ThesisRevision[K]) {
    if (!thesis) return;
    setThesis({ ...thesis, [key]: value });
    setDirty(true);
    setNotice("");
  }

  function changeTemplate(template: ThesisRevision["template"]) {
    if (!thesis) return;
    const next = template === "binary"
      ? { ...thesis, template, lowerThreshold: null, upperThreshold: null, direction: thesis.direction || "yes" }
      : template === "directional"
        ? { ...thesis, template, lowerThreshold: family?.predicates[0]?.threshold ?? null, upperThreshold: null, direction: thesis.direction || "yes" }
        : { ...thesis, template, lowerThreshold: family?.predicates[0]?.threshold ?? null, upperThreshold: family?.predicates[1]?.threshold ?? null, direction: null };
    setThesis(next);
    setDirty(true);
    setNotice("");
  }

  async function bindMarket(next: MarketFamily) {
    setBindingMarket(next.id);
    setError("");
    try {
      const result = await api<{ thesis: ThesisRevision }>(`/api/theses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "bind",
          topicSlug: next.slug,
          familyId: next.id,
          familyVersion: next.version,
          mode: dataContextFromStorage(),
        }),
      });
      setThesis(result.thesis);
      setFamily(next);
      const topic = await api<ResearchMarket>(`/api/topics/${next.slug}?mode=${dataContextFromStorage()}`);
      setEvidence(topic.evidence || []);
      setRelatedContracts(topic.relatedContracts || []);
      setMatchingMarkets([]);
      setNotice("Market attached. Review its exact rules and refine your view before confirming.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This market could not be attached.");
    } finally {
      setBindingMarket("");
    }
  }

  async function openRecordedRange(observation: string) {
    setOpeningRehearsal(true);
    setError("");
    try {
      const example = await findRecordedRangeMarket(observation);
      if (!example) throw new Error("A recorded range for this observation is unavailable.");
      const draft = await createMarketResearchDraft(example, observation, "replay", thesis?.articleSource, thesis?.title);
      startRecordedRehearsal();
      router.push(`/theses/${draft.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The paper rehearsal could not be opened.");
    } finally {
      setOpeningRehearsal(false);
    }
  }

  async function save(action: "save" | "confirm" | "duplicate" = "save"): Promise<boolean> {
    if (!thesis || (action === "confirm" && notebook.targetRange)) return false;
    setSaving(action);
    setError("");
    setNotice("");
    try {
      const res = await api<{ thesis: ThesisRevision }>(`/api/theses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...thesis, action: action === "save" ? undefined : action, mode: dataContextFromStorage() }),
      });
      if (action === "duplicate") {
        router.push(`/theses/${res.thesis.id}`);
        return true;
      }
      setThesis(res.thesis);
      setDirty(false);
      if (action === "confirm") {
        router.push(`/theses/${id}/build`);
        return true;
      }
      setNotice(`Saved as revision ${res.thesis.revision}. Your existing view remains a draft until you confirm it.`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "View could not be saved. Your edits remain here so you can retry.");
      return false;
    } finally {
      setSaving(null);
    }
  }

  function navigateSafely(destination: string) {
    if (dirty) {
      setPendingDestination(destination);
      return false;
    }
    return true;
  }

  async function resolvePendingNavigation(choice: "save" | "discard") {
    if (!pendingDestination) return;
    if (choice === "save" && !(await save("save"))) return;
    if (choice === "discard") setDirty(false);
    const destination = pendingDestination;
    setPendingDestination("");
    router.push(destination);
  }

  async function toggleSavedEvidence(item: EvidenceItem) {
    if (!thesis || evidencePending.current) return;
    const remove = thesis.evidenceIds.includes(item.id);
    const ids = remove ? thesis.evidenceIds.filter((sourceId) => sourceId !== item.id) : [...thesis.evidenceIds, item.id];
    evidencePending.current = true;
    setSavingEvidence(true);
    setSourceSaveError("");
    try {
      const result = await api<{ thesis: ThesisRevision }>(`/api/theses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ evidenceIds: ids, mode: dataContextFromStorage() }),
      });
      setThesis((current) => current?.id === id ? { ...current, evidenceIds: result.thesis.evidenceIds, updatedAt: result.thesis.updatedAt, status: result.thesis.status, revision: result.thesis.revision } : current);
      setSavedEvidence((current) => remove ? current.filter((saved) => saved.id !== item.id) : [...current.filter((saved) => saved.id !== item.id), item]);
      setNotice(remove ? "Evidence removed from this thesis." : "Evidence saved to this thesis.");
    } catch (cause) {
      setSourceSaveError(cause instanceof Error ? cause.message : "Evidence could not be saved.");
    } finally {
      evidencePending.current = false;
      setSavingEvidence(false);
    }
  }

  function openSource(item: EvidenceItem) {
    setSourceSaveError("");
    setSelectedEvidence(item);
  }

  if (loading) return <p role="status">Loading thesis…</p>;
  if (error && !thesis) return <Empty title="Thesis unavailable">{error}</Empty>;
  if (!thesis) return <Empty title="Thesis unavailable">This view could not be found.</Empty>;
  const workspaceTitle = marketThesisTitle(thesis, family);
  const customRange = notebook.targetRange;
  const hasDirection = thesis.direction === "yes" || thesis.direction === "no";
  const hasLower = family?.predicates.some((predicate) => predicate.threshold === thesis.lowerThreshold);
  const hasUpper = family?.predicates.some((predicate) => predicate.threshold === thesis.upperThreshold);
  const viewValid = thesis.template === "binary"
    ? Boolean(family?.contracts[0] && hasDirection)
    : Boolean(hasLower && (thesis.template === "directional" ? hasDirection : hasUpper && thesis.lowerThreshold != null && thesis.upperThreshold != null && thesis.upperThreshold > thesis.lowerThreshold));
  const shownEvidence = evidenceFilter === "all" ? evidence : evidence.filter((item) => item.stance === evidenceFilter);
  const chartContracts = selectedRuleContracts.length ? selectedRuleContracts : family?.contracts.slice(0, 2) || [];
  const observation = family?.observationTime ? new Date(family.observationTime) : null;
  const naturalView = marketObservation(thesis.rationale);
  const offerRehearsal = family?.mode === "live" && family.predicates.length === 1 && naturalView.asset && naturalView.view;
  const counterargumentSources = evidence.filter((item) => counterargument?.sourceIds.includes(item.id));
  const chartSeries = chartContracts.map((contract, index) => ({
    label: contract!.label,
    color: index === 0 ? "#3559E0" : "#8D6CEB",
    points: [
      ...(contract!.priceHistory || []),
      ...(contract!.id === liveContract?.id ? marketFeed.trades.map((trade) => ({ timestamp: trade.eventAt, price: trade.price })) : []),
    ],
  }));
  const hasHistory = hasResearchHistory(chartSeries);
  const viewTile = (
    <ResearchTile title="Your view" icon="target" kind="view"
      detail={<span className={`status-pill ${customRange ? "status-pill--warning" : thesis.status === "draft" ? "" : "status-pill--good"}`}>{customRange ? "Research only" : thesis.status === "draft" ? "Draft" : "Confirmed"}</span>}
      footer={<div className="flex flex-wrap items-center gap-2">
        {customRange ? <Button kind="secondary" onClick={() => {
          try { notebook.setTargetRange(null); setError(""); }
          catch (cause) { setError(cause instanceof Error ? cause.message : "Could not clear the research range."); }
        }}>Return to listed Gemini view</Button> : <>
          {thesis.status === "draft" ? <Button icon="check" onClick={() => setReviewingConfirmation(true)} disabled={!viewValid}>Confirm view & build</Button> : <Button href={`/theses/${id}/build`} icon="build">Build a basket</Button>}
          <Button kind="secondary" icon="edit" onClick={beginViewEdit}>Edit view</Button>
        </>}
      </div>}
    >
      <p className="research-view__question">{customRange ? `YES · ${researchRangeLabel(customRange)}` : thesisViewLabel(thesis, family, { exact: viewValid })}</p>
      {viewValid && !customRange && family?.observationTime ? <p className="mt-2 text-xs th-muted">At Gemini settlement · {researchTime(family.observationTime)}</p> : null}
      {viewValid && !customRange && thesis.template === "range" ? <p className="mt-2 text-xs th-muted">Below the lower bound or at or above the upper bound falls outside your view.</p> : null}
      {customRange ? <p className="research-tile__muted mt-3">An Arc quote needs a verified settlement source for both boundaries. You can inspect what matches this view in Settlement outcomes.</p> : null}
      {thesis.rationale ? <div className="research-view__rationale"><h3>Rationale</h3><p className="whitespace-pre-wrap text-sm th-muted">{thesis.rationale}</p></div> : null}
      {thesis.invalidation ? <div className="research-view__rationale"><h3>What would change my mind</h3><p className="whitespace-pre-wrap text-sm th-muted">{thesis.invalidation}</p></div> : null}
      {!viewValid && thesis.status === "draft" ? <p className="research-tile__muted mt-3">Edit your view to select supported Gemini conditions.</p> : null}
    </ResearchTile>
  );
  return (
    <div className="screen-workspace screen-research screen-market-research space-y-4">
      <header className="workspace-header">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="workspace-title screen-heading">{workspaceTitle}</h1>
            <p className="research-workspace__meta text-sm th-muted">
              {family ? <>
                <span>{family.mode === "live" ? "Gemini market" : "Recorded Gemini · Paper rehearsal"}</span>
                {observation && Number.isFinite(observation.getTime()) ? <span>Settlement <time dateTime={observation.toISOString()} title={observation.toISOString()}>{observation.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</time></span> : null}
              </> : <span>{thesis.topicSlug ? "Market data unavailable" : "Question-first draft · No market linked"}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{family && evidence.length ? <button type="button" className="min-h-10 rounded-full bg-[#E9EEFF] px-3 text-sm font-semibold text-action" onClick={() => setUpdatesOpen(true)}>Review sources · {evidence.length}</button> : null}<span role="status" className={`status-pill ${dirty ? "status-pill--warning" : "status-pill--good"}`}>{saving ? "Saving…" : dirty ? "Unsaved changes" : `Revision ${thesis.revision} · ${thesis.status}`}</span>{thesis.topicSlug ? <Button kind="secondary" icon="refresh" disabled={refreshingMarket} onClick={() => void refreshMarketData()}>{refreshingMarket ? "Refreshing…" : "Refresh data"}</Button> : null}</div>
        </div>
      </header>
      <ThesisWorkspaceTabs thesisId={id} current="Research" lockedTabs={customRange || thesis.status === "draft" ? ["Build", "Compare"] : []} onNavigate={navigateSafely} />
      {error && !editingView && !reviewingConfirmation ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{notice}</p> : null}
      {family ? (
        <>
          <div className="demo-research-layout"><div className="research-board">
            <div className="research-board__grid">
              {hasHistory ? <ResearchChart family={family} series={chartSeries} liveSession={Boolean(liveContract)} /> : null}
              {thesis.articleSource ? <ResearchArticleSourceTile source={thesis.articleSource} /> : null}

              <ResearchPrices family={family} hasHistory={hasHistory} footer={liveContract ? <Button kind="secondary" icon="bars" onClick={() => setMarketFeedOpen(true)}>View live market feed</Button> : null} />
              <ResearchRules family={family} contracts={selectedRuleContracts.length ? selectedRuleContracts : family.contracts} />

              <ResearchTile title="Research focus" icon="research" detail={researchUpdate ? <span className="status-pill">{researchUpdate.clarification ? "Clarify" : researchUpdate.hasProposal ? "View ready" : "Latest question"}</span> : null}
                footer={<div className="flex flex-wrap gap-2"><Button kind="secondary" icon="assistant" onClick={() => setAssistantRequest((value) => value + 1)}>{researchUpdate?.hasProposal && thesis.status === "draft" ? "Review suggested view" : "Open research assistant"}</Button>{offerRehearsal ? <Button kind="ghost" onClick={() => void openRecordedRange(thesis.rationale)} disabled={openingRehearsal || dirty}>{openingRehearsal ? "Opening rehearsal…" : "Rehearse a range in Paper"}</Button> : null}</div>}>
                {researchUpdate ? <div className="space-y-3" aria-live="polite">
                  <p className="research-rules__question">{researchUpdate.question}</p>
                  <p className="whitespace-pre-wrap text-sm">{researchUpdate.answer}</p>
                  {researchUpdate.clarification ? <p className="research-view__question">{researchUpdate.clarification}</p> : null}
                  {[...new Set(researchUpdate.sourceIds)].map((sourceId) => evidence.find((item) => item.id === sourceId)).filter((item): item is EvidenceItem => Boolean(item)).map((item) => (
                    <Button key={item.id} kind="ghost" icon="news" onClick={() => openSource(item)}>{item.title}</Button>
                  ))}
                  {counterargument && counterargument !== researchUpdate ? <details className="research-drawer__block"><summary className="cursor-pointer text-sm font-semibold">What challenges the view</summary><p className="mt-2 text-sm">{counterargument.answer}</p>{counterargumentSources.map((item) => <Button key={item.id} kind="ghost" icon="news" onClick={() => openSource(item)}>{item.title}</Button>)}</details> : null}
                </div> : <><p className="research-rules__question">{family.question}</p><p className="mt-3 text-sm th-muted">Ask what would challenge your view, or clarify the exact outcome you expect at settlement.</p></>}
                {offerRehearsal ? <p className="mt-3 text-xs th-muted">This listing is a single YES/NO outcome. A separate Paper draft can explore a bounded range using recorded Gemini thresholds.</p> : null}
              </ResearchTile>
              <ResearchTile title="Evidence board" icon="news" detail={<span className="status-pill">{evidence.length} sources</span>} footer={
                <div className="research-filters" role="group" aria-label="Filter evidence">
                  {([["all", "All"], ["supports", "Supports"], ["challenges", "Challenges"]] as const).map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={evidenceFilter === value} onClick={() => setEvidenceFilter(value)}>{label}</button>
                  ))}
                </div>
              }>
                {shownEvidence.length ? <ResearchEvidenceList items={shownEvidence} onSelect={openSource} /> : <p className="research-tile__muted">{evidence.length ? "No evidence matches this filter." : "No evidence has been returned for this market."}</p>}
              </ResearchTile>
              {relatedContracts.length ? <ResearchRelatedContracts ticker={family.sourceEvent.ticker} contracts={relatedContracts} /> : null}
              <ResearchOutcomes family={family} range={customRange} listedRange={thesis.template === "range" && viewValid && thesis.lowerThreshold != null && thesis.upperThreshold != null ? [thesis.lowerThreshold, thesis.upperThreshold] : undefined} />
              <ResearchSavedTile usedColumns={6 + (hasHistory ? 2 : 0) + (relatedContracts.length ? 1 : 0)} sources={savedEvidence} replies={notebook.replies} onSelectSource={openSource} onRemoveReply={notebook.removeReply} />
            </div>
          </div>
          <aside className="demo-research-rail">{viewTile}<WorkspaceAssistant slug={family.slug} family={family} evidence={evidence} thesis={thesis} context="view" title="Talk through your view"
            onThesisChange={(updated) => { setThesis(updated); setDirty(false); setEditingView(false); setNotice(`Voice-assisted edit saved as draft revision ${updated.revision}.`); }}
            openRequest={assistantRequest} onResearchUpdate={(update) => { setResearchUpdate(update); if (asksForCounterargument(update.question)) setCounterargument(update); }}
            prefillQuestion={assistantPrompt} onPrefillConsumed={() => setAssistantPrompt("")} onSaveReply={notebook.saveReply} targetRange={customRange} onSaveRange={notebook.setTargetRange} /></aside></div>
          <AppDrawer open={marketFeedOpen && Boolean(liveContract)} titleId="research-market-feed-title" onClose={() => setMarketFeedOpen(false)}>
            <header className="research-drawer__header"><h2 id="research-market-feed-title">Gemini live market</h2><button type="button" className="th-button th-button--ghost th-button--icon" aria-label="Close live market feed" onClick={() => setMarketFeedOpen(false)}><Icon name="close" /></button></header>
            {liveContract ? <GeminiLiveMarketFeed status={marketFeed.status} book={marketFeed.book} trades={marketFeed.trades} error={marketFeed.error} retry={marketFeed.retry}
              restBid={liveContract.bid} restAsk={liveContract.ask} lastBookUpdateAt={marketFeed.lastBookUpdateAt} connectedAt={marketFeed.connectedAt} /> : null}
          </AppDrawer>
        </>
      ) : (
        <div className="research-board"><div className="research-board__grid">
          <ResearchTile title="Attach a market when you are ready" icon="search" kind="market-search" footer={<Button href="/explore" kind="secondary">Browse all markets</Button>}>
            <p className="research-tile__muted mb-3">Choose a listed Gemini market to use its prices and settlement rules in your draft.</p>
            <div className="rounded-xl border border-[#CCD6F5] bg-[#F7F8FF] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Research question</p><p className="mt-2 whitespace-pre-wrap text-sm">{thesis.rationale || thesis.title}</p></div>
            <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (marketQuery.trim()) void searchMarkets(marketQuery.trim()); }}>
              <div className="min-w-0 flex-1"><Field label="Search Gemini markets"><input className={inputCls()} value={marketQuery} maxLength={300} onChange={(event) => setMarketQuery(event.target.value)} /></Field></div>
              <Button type="submit" icon="search" disabled={marketSearching || Boolean(bindingMarket) || !marketQuery.trim()}>{marketSearching ? "Searching…" : "Search"}</Button>
            </form>
            {marketError ? <p role="alert" className="mt-2 text-sm text-bad">{marketError}</p> : null}
            {!marketSearching && matchingMarkets.length ? <div className="mt-3 grid gap-3">
              {matchingMarkets.map((market) => <article key={market.id} className="rounded-xl border border-line p-4"><p className="text-xs text-muted">{market.mode === "live" ? "Gemini live market" : "Illustrative replay"} · {market.contracts.length} contract{market.contracts.length === 1 ? "" : "s"}</p><h3 className="mt-1 font-serif text-xl font-bold">{market.title}</h3><p className="mt-1 text-sm text-muted">{market.question}</p><Button className="mt-3" disabled={Boolean(bindingMarket)} onClick={() => void bindMarket(market)}>{bindingMarket === market.id ? "Attaching…" : "Use this market"}</Button></article>)}
            </div> : !marketSearching && !marketError ? <p className="research-tile__muted mt-3">No matching market. Try a team, event, or ticker.</p> : null}
          </ResearchTile>
          <ResearchTile title="Your view" icon="target" kind="view" detail={<span className="status-pill">Draft</span>}>
            {thesis.rationale ? <p className="research-view__question">{thesis.rationale}</p> : null}
            <p className="research-tile__muted mt-3">Link a market to confirm a view using its settlement conditions.</p>
          </ResearchTile>
          <ResearchSavedTile usedColumns={3} sources={[]} replies={notebook.replies} onSelectSource={openSource} onRemoveReply={notebook.removeReply} />
          <button type="button" className="workspace-assistant-dock" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { detail: { thesisId: id, question: marketQuery.trim() || thesis.rationale || thesis.title } }))}>
            <Icon name="assistant" size={20} /><span>Ask Thesis</span><Icon name="chevron-up" size={19} />
          </button>
        </div></div>
      )}
      <AppDrawer open={editingView && !reviewingConfirmation && Boolean(family)} titleId="edit-thesis-view" onClose={() => { if (!saving) cancelViewEdit(); }}>
      <div className="space-y-3">
        <header className="research-drawer__header"><div><h2 id="edit-thesis-view">Edit your view</h2><p className="mt-1 text-sm text-muted">Use the conditions supported by this Gemini market.</p></div><button type="button" className="th-button th-button--ghost th-button--icon" aria-label="Close view editor" disabled={saving !== null} onClick={cancelViewEdit}><Icon name="close" /></button></header>
        {error ? <p role="alert" className="th-alert th-alert--warning text-sm">{error}</p> : null}
        <Field label="Template">
          <select className={inputCls()} value={thesis.template} onChange={(event) => changeTemplate(event.target.value as ThesisRevision["template"])}>
            {family?.predicates.length === 1 && family.contracts.length === 1 ? <option value="binary">Single Gemini contract</option> : <option value="directional">Directional threshold</option>}
            {family && family.predicates.length >= 2 ? <><option value="range">Range</option><option value="outside">Outside range</option></> : null}
          </select>
        </Field>
        {thesis.template === "directional" || thesis.template === "binary" ? (
          <Field label="Direction">
            <select className={inputCls()} value={thesis.direction || ""} onChange={(event) => change("direction", event.target.value === "" ? null : event.target.value as "yes" | "no")}>
              <option value="">Choose a direction</option>
              {thesis.template === "binary" ? <><option value="yes">YES · contract resolves YES</option><option value="no">NO · contract resolves NO</option></> : <><option value="yes">Pays at or above the threshold</option><option value="no">Pays below the threshold</option></>}
            </select>
          </Field>
        ) : null}
        {thesis.template !== "binary" ? <Field label={thesis.template === "directional" ? "Listed threshold" : "Lower threshold"}>
          <select className={inputCls()} value={thesis.lowerThreshold ?? ""} onChange={(event) => change("lowerThreshold", event.target.value === "" ? null : Number(event.target.value))}>
            <option value="">Choose a listed threshold</option>
            {family?.predicates.map((predicate) => <option key={predicate.id} value={predicate.threshold}>{predicate.label}</option>)}
          </select>
        </Field> : <p className="text-sm text-muted">This view is tied to: {family?.contracts[0]?.label || "the selected Gemini contract"}</p>}
        {thesis.template === "range" || thesis.template === "outside" ? (
          <Field label="Upper threshold">
            <select className={inputCls()} value={thesis.upperThreshold ?? ""} onChange={(event) => change("upperThreshold", event.target.value === "" ? null : Number(event.target.value))}>
              <option value="">Choose an upper threshold</option>
              {family?.predicates.filter((predicate) => thesis.lowerThreshold == null || predicate.threshold > thesis.lowerThreshold).map((predicate) => <option key={predicate.id} value={predicate.threshold}>{predicate.label}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Rationale">
          <textarea className={`${inputCls()} min-h-24 py-2`} maxLength={4_000} value={thesis.rationale} onChange={(event) => change("rationale", event.target.value)} />
        </Field>
        <Field label="I would reconsider if">
          <textarea className={`${inputCls()} min-h-20 py-2`} maxLength={2_000} value={thesis.invalidation} onChange={(event) => change("invalidation", event.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2 border-t border-line pt-3"><Button onClick={async () => { if (await save("save")) setEditingView(false); }} disabled={saving !== null}>{saving === "save" ? "Saving…" : "Save draft"}</Button><Button onClick={() => setReviewingConfirmation(true)} disabled={saving !== null || !viewValid}>Review confirmation</Button><Button kind="ghost" onClick={cancelViewEdit} disabled={saving !== null}>Cancel</Button></div>
      </div>
      </AppDrawer>
      <AppDialog open={reviewingConfirmation} titleId="confirm-view-title" onClose={() => { if (!saving) setReviewingConfirmation(false); }} closeOnBackdrop={!saving}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3"><div><p className="source-pill">Review your view</p><h2 id="confirm-view-title" className="mt-3 font-serif text-2xl font-bold">Confirm this thesis view?</h2></div><button type="button" aria-label="Back to editing" className="min-h-10 px-3 text-2xl text-muted" onClick={() => setReviewingConfirmation(false)} disabled={saving !== null}>×</button></div>
          <div className="rounded-xl border border-[#CCD6F5] bg-[#F7F8FF] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{family?.question}</p><p className="mt-2 text-lg font-semibold">{thesisViewLabel(thesis, family, { exact: true })}</p><p className="mt-1 text-xs text-muted">Settlement {researchTime(family?.observationTime, "deadline not supplied")} · {family?.mode === "live" ? "Gemini live data" : "Recorded Gemini"}</p></div>
          {selectedRuleContracts.length ? <div className="research-drawer__block"><h3>Selected Gemini contracts</h3><ul className="mt-2 space-y-1 text-sm">{selectedRuleContracts.map((contract) => <li key={contract!.id}>{contract!.label}</li>)}</ul></div> : null}
          {thesis?.rationale ? <div><p className="text-sm font-semibold">Your rationale</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{thesis.rationale}</p></div> : null}
          {counterargument ? <details className="research-drawer__block"><summary className="cursor-pointer text-sm font-semibold">Counterargument and sources</summary><p className="mt-2 text-sm">{counterargument.answer}</p>{counterargumentSources.length ? <ul className="mt-2 list-inside list-disc text-xs text-muted">{counterargumentSources.map((item) => <li key={item.id}>{item.title}</li>)}</ul> : null}</details> : null}
          {thesis.invalidation ? <div><p className="text-sm font-semibold">What would change your mind</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{thesis.invalidation}</p></div> : null}
          {error ? <p role="alert" className="th-alert th-alert--warning text-sm">{error}</p> : null}
          {!viewValid ? <p role="alert" className="rounded-lg border border-bad/30 bg-[#FFF5F4] p-3 text-sm text-bad">Choose valid boundaries from the listed contracts before confirming.</p> : <p className="text-sm text-muted">Confirming saves this version and opens Build. It does not request a quote, connect a wallet, or submit a trade.</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3"><Button onClick={() => setReviewingConfirmation(false)} kind="ghost" disabled={saving !== null}>Back to editing</Button><Button onClick={() => void save("confirm")} disabled={saving !== null || !viewValid}>{saving === "confirm" ? "Saving confirmed view…" : "Confirm view & build"}</Button></div>
        </div>
      </AppDialog>
      <AppDialog open={Boolean(pendingDestination)} titleId="unsaved-title" onClose={() => setPendingDestination("")} closeOnBackdrop={false}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3"><div><p className="source-pill status-pill--warning">Unsaved changes</p><h2 id="unsaved-title" className="mt-3 font-serif text-2xl font-bold">Leave this research board?</h2></div><button type="button" aria-label="Stay on this thesis" className="min-h-10 px-3 text-2xl text-muted" onClick={() => setPendingDestination("")}>×</button></div>
          <p className="text-sm text-muted">Your view edits have not been saved. Choose whether to keep them before leaving.</p>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3"><Button kind="ghost" onClick={() => setPendingDestination("")}>Stay</Button><Button kind="danger" onClick={() => void resolvePendingNavigation("discard")}>Discard unsaved</Button><Button onClick={() => void resolvePendingNavigation("save")} disabled={saving !== null}>{saving === "save" ? "Saving…" : "Save and leave"}</Button></div>
        </div>
      </AppDialog>

      <ResearchEvidenceDrawer item={selectedEvidence} onClose={() => setSelectedEvidence(null)}
        onSave={(item) => void toggleSavedEvidence(item)} saved={thesis.evidenceIds.includes(selectedEvidence?.id || "")} saving={savingEvidence} saveError={sourceSaveError}
        onAsk={(item) => { setSelectedEvidence(null); setAssistantPrompt(`Explain this source in the context of my view: ${item.title}. ${item.excerpt}`); }} />
      <AppDrawer open={updatesOpen} titleId="research-updates-title" onClose={() => setUpdatesOpen(false)}>
        <div className="flex items-start justify-between gap-3"><div><p className="source-pill">Review updates</p><h2 id="research-updates-title" className="mt-3 font-serif text-2xl font-bold">Research sources</h2><p className="mt-2 text-sm text-muted">Review the sources attached to the current Gemini snapshot.</p></div><button type="button" className="min-h-10 px-3 text-2xl text-muted" aria-label="Close research updates" onClick={() => setUpdatesOpen(false)}>×</button></div>
        <div className="mt-5 grid gap-3">{evidence.map((item) => <article key={item.id} className="rounded-xl border border-line p-4"><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted">{item.publisher} · {formatTime(item.retrievedAt)}</p><p className="mt-2 line-clamp-3 text-sm">{item.excerpt}</p><div className="mt-3 flex gap-2"><Button kind="secondary" onClick={() => { setUpdatesOpen(false); setSelectedEvidence(item); }}>Review source</Button><Button kind="ghost" onClick={() => toggleSavedEvidence(item)}>{savedEvidence.some((saved) => saved.id === item.id) ? "Saved" : "Save"}</Button></div></article>)}</div>
      </AppDrawer>
    </div>
  );
}
