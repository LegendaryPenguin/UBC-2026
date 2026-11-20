"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, dataContextFromStorage } from "@/lib/client";
import type { Direction, EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { Button, Card } from "@/components/ui";
import { Icon } from "@/components/thesis";
import { WorkspaceAssistant } from "@/components/WorkspaceAssistant";
import { AppDrawer } from "@/components/AppDrawer";
import {
  hasResearchHistory,
  ResearchChart,
  ResearchEvidenceDrawer,
  ResearchEvidenceList,
  ResearchPrices,
  ResearchRelatedContracts,
  ResearchRules,
  ResearchSavedTile,
  ResearchTile,
  researchTime,
  type RelatedContract,
} from "@/components/ResearchBoard";
import { useModeChange } from "@/lib/use-mode-change";
import { copyMarketReplies, useResearchNotebook } from "@/lib/use-research-notebook";

export default function TopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [relatedContracts, setRelatedContracts] = useState<RelatedContract[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);
  const [sourceSaveError, setSourceSaveError] = useState("");
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [direction, setDirection] = useState<Direction | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [topicError, setTopicError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const bookTitleId = useId();
  const requestId = useRef(0);
  const savingDraft = useRef(false);
  const notebook = useResearchNotebook(`market:${family?.slug || slug}`);

  const loadTopic = useCallback(async () => {
    const current = ++requestId.current;
    const params = new URLSearchParams({ mode: dataContextFromStorage() });
    const eventTicker = new URLSearchParams(window.location.search).get("event");
    if (eventTicker) params.set("event", eventTicker);
    setTopicError("");
    setRefreshing(true);
    try {
      const res = await api<{ family: MarketFamily; relatedContracts: RelatedContract[]; evidence: EvidenceItem[] }>(`/api/topics/${slug}?${params}`);
      if (current !== requestId.current) return;
      setFamily(res.family);
      setRelatedContracts(res.relatedContracts || []);
      setEvidence(res.evidence || []);
    } catch (err) {
      if (current === requestId.current) setTopicError(err instanceof Error ? err.message : "Topic data could not be loaded.");
    } finally {
      if (current === requestId.current) setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    setFamily(null);
    setDirection(null);
    setDraftError("");
    setSelectedEvidence(null);
    setBookOpen(false);
    void loadTopic();
    return () => { requestId.current += 1; };
  }, [loadTopic]);
  useModeChange(() => { void loadTopic(); });

  const singleBinary = family?.predicates.length === 1 && family.contracts.length === 1;

  async function formView() {
    if (!family || savingDraft.current || (singleBinary && !direction)) return;
    savingDraft.current = true;
    setBusy(true);
    setDraftError("");
    try {
      const { thesis } = await api<{ thesis: ThesisRevision }>("/api/theses", {
        method: "POST",
        body: JSON.stringify({
          topicSlug: family.slug,
          familyId: family.id,
          familyVersion: family.version,
          mode: dataContextFromStorage(),
          ...(singleBinary ? { template: "binary", direction } : {}),
          title: family.title,
          rationale: "",
          evidenceIds: notebook.sourceIds,
        }),
      });
      copyMarketReplies(family.slug, thesis.id);
      router.push(`/theses/${thesis.id}${singleBinary ? "" : "?edit=1"}`);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Could not create draft");
    } finally {
      savingDraft.current = false;
      setBusy(false);
    }
  }

  if (topicError && !family) return <Card><p role="alert" className="text-sm text-bad">{topicError}</p><div className="mt-3 flex gap-2"><Button onClick={() => void loadTopic()} kind="secondary">Retry market data</Button><Button href="/explore" kind="ghost">Explore</Button></div></Card>;
  if (!family) return <p role="status">Loading Gemini research…</p>;

  const series = family.contracts.slice(0, 2).map((contract, index) => ({
    label: contract.label,
    color: index === 0 ? "#3559E0" : "#8D6CEB",
    points: contract.priceHistory || [],
  }));
  const hasHistory = hasResearchHistory(series);
  const depth = family.contracts[0]?.orderBook;
  const hasDepth = Boolean(depth && (depth.bids.length || depth.asks.length));
  const savedSources = evidence.filter((item) => notebook.sourceIds.includes(item.id));
  function openSource(item: EvidenceItem) {
    setSourceSaveError("");
    setSelectedEvidence(item);
  }
  const view = (
    <ResearchTile title="Your view" icon="target" kind="view" detail={<span className="status-pill">New draft</span>} footer={
      <Button onClick={() => void formView()} icon="arrow-right" disabled={busy || (singleBinary && !direction)} loading={busy}>
        {busy ? "Saving draft…" : draftError ? "Retry draft creation" : "Create draft"}
      </Button>
    }>
      <h3 className="research-view__question">{singleBinary ? family.contracts[0].label : "What do you expect at settlement?"}</h3>
      {singleBinary ? (
        <div className="research-view__directions" role="group" aria-label="Choose an outcome">
          {(["yes", "no"] as const).map((side) => (
            <button key={side} type="button" aria-pressed={direction === side} disabled={busy} onClick={() => { setDirection(side); setDraftError(""); }}>
              <strong>{side.toUpperCase()}</strong><span>{side === "yes" ? "The proposition holds" : "The proposition fails"}</span>
            </button>
          ))}
        </div>
      ) : <p className="research-tile__muted mt-3">Save a draft to choose a direction or a range from the listed Gemini thresholds.</p>}
      {draftError ? <p role="alert" className="text-sm text-bad mt-2">{draftError}</p> : null}
    </ResearchTile>
  );
  return (
    <div className="screen-market-research">
      <header className="research-board-heading">
        <Link className="research-board-heading__back" href="/explore"><Icon name="arrow-left" size={16} />Explore</Link>
        <div className="research-board-heading__main">
          <div><h1 className="workspace-title screen-heading">{family.title}</h1><p className="research-workspace__meta text-sm th-muted"><span>{family.mode === "replay" ? "Illustrative replay market and evidence" : "Gemini market"}</span><span>{family.sourceEvent.category}</span><span className="capitalize">{family.sourceEvent.status.replaceAll("_", " ")}</span></p></div>
          <Button icon="refresh" kind="secondary" onClick={() => void loadTopic()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh data"}</Button>
        </div>
      </header>
      {topicError ? <p role="alert" className="th-alert th-alert--warning my-3 text-sm">{topicError} Showing the last loaded snapshot. <button type="button" className="text-action underline" onClick={() => void loadTopic()}>Retry market data</button></p> : null}
      <div className="research-board">
        <div className="research-board__grid">
          {hasHistory ? <ResearchChart family={family} series={series} /> : null}
          {hasHistory ? view : null}
          <ResearchPrices family={family} hasHistory={hasHistory} footer={hasDepth ? <Button kind="secondary" icon="bars" onClick={() => setBookOpen(true)}>View order book</Button> : null} />
          <ResearchRules family={family} />
          {!hasHistory ? view : null}
          <ResearchTile title={family.mode === "live" ? "Evidence & sources" : "Evidence"} icon="news" detail={<span className="status-pill">{evidence.length}</span>}>
            {evidence.length ? <ResearchEvidenceList items={evidence} onSelect={openSource} /> : <p className="research-tile__muted">No evidence has been returned for this market.</p>}
          </ResearchTile>
          {relatedContracts.length ? <ResearchRelatedContracts ticker={family.sourceEvent.ticker} contracts={relatedContracts} /> : null}
          <ResearchSavedTile usedColumns={4 + (hasHistory ? 2 : 0) + (relatedContracts.length ? 1 : 0)} sources={savedSources} replies={notebook.replies} onSelectSource={openSource} onRemoveReply={notebook.removeReply} />
        </div>
      </div>
      <WorkspaceAssistant key={family.id} slug={family.slug} family={family} evidence={evidence} title="Talk through this market" onSaveReply={notebook.saveReply} preparedEvidenceIds={notebook.sourceIds}
        prefillQuestion={assistantPrompt} onPrefillConsumed={() => setAssistantPrompt("")} />
      <ResearchEvidenceDrawer item={selectedEvidence} onClose={() => setSelectedEvidence(null)} saved={notebook.sourceIds.includes(selectedEvidence?.id || "")} saveLabel="Save source" saveError={sourceSaveError}
        onSave={(item) => {
          setSourceSaveError("");
          try { notebook.toggleSource(item.id); }
          catch (cause) { setSourceSaveError(cause instanceof Error ? cause.message : "Could not save the source."); }
        }} onAsk={(item) => {
        setSelectedEvidence(null);
        setAssistantPrompt(`Explain this source for the selected Gemini market: ${item.title}. ${item.excerpt}`);
      }} />
      <AppDrawer open={bookOpen && hasDepth} titleId={bookTitleId} onClose={() => setBookOpen(false)}>
        {depth ? <>
          <header className="research-drawer__header"><h2 id={bookTitleId}>Gemini order book</h2><button type="button" className="th-button th-button--ghost th-button--icon" aria-label="Close order book" onClick={() => setBookOpen(false)}><Icon name="close" /></button></header>
          <p className="text-sm th-muted">Snapshot received {researchTime(depth.receivedAt)}{depth.sourceTime ? ` · Source time ${researchTime(depth.sourceTime)}` : ""}.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([["Bids", depth.bids], ["Asks", depth.asks]] as const).map(([label, levels]) => (
              <div className="research-drawer__block" key={label}><h3>{label}</h3>
                {levels.length ? <table className="w-full mt-2 text-left text-sm"><thead><tr><th>Price</th><th className="text-right">Quantity</th></tr></thead><tbody>{levels.map((level, index) => <tr key={`${level.price}-${index}`}><td>{level.price}</td><td className="text-right">{level.quantity}</td></tr>)}</tbody></table> : <p className="mt-2 text-sm th-muted">No levels returned.</p>}
              </div>
            ))}
          </div>
        </> : null}
      </AppDrawer>
    </div>
  );
}
