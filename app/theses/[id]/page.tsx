"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, dataContextFromStorage, modeFromStorage } from "@/lib/client";
import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { VoicePanel } from "@/components/VoicePanel";
import { Button, Card, Empty, Field, inputCls } from "@/components/ui";
import { ThesisWorkspaceTabs } from "@/components/ThesisWorkspaceTabs";
import { ThesisViewPanel } from "@/components/ThesisViewPanel";
import { MarketPriceHistory } from "@/components/MarketPriceHistory";
import { useModeChange } from "@/lib/use-mode-change";
import { useGeminiMarketStream } from "@/lib/gemini/use-market-stream";
import { GeminiLiveMarketFeed } from "@/components/GeminiLiveMarketFeed";
import { formatTime } from "@/lib/format";
import { AppDrawer } from "@/components/AppDrawer";

export default function ThesisEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"save" | "confirm" | "duplicate" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reviewingConfirmation, setReviewingConfirmation] = useState(false);
  const [editingView, setEditingView] = useState(false);
  const [pendingDestination, setPendingDestination] = useState("");
  const [evidenceFilter, setEvidenceFilter] = useState<"all" | "supports" | "challenges" | "saved">("all");
  const [savedEvidence, setSavedEvidence] = useState<EvidenceItem[]>([]);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [matchingMarkets, setMatchingMarkets] = useState<MarketFamily[]>([]);
  const [bindingMarket, setBindingMarket] = useState("");
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);
  const [updatesOpen, setUpdatesOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (new URLSearchParams(window.location.search).get("updates") === "1") setUpdatesOpen(true);
    setLoading(true);
    api<{ thesis: ThesisRevision }>(`/api/theses/${id}`)
      .then(async ({ thesis: current }) => {
        if (!active) return;
        setThesis(current);
        const mode = dataContextFromStorage();
        if (!current.topicSlug) {
          const result = await api<{ families: MarketFamily[] }>(`/api/topics?mode=${mode}&q=${encodeURIComponent(current.rationale || current.title || "")}`);
          if (active) setMatchingMarkets(result.families || []);
          return;
        }
        try {
          const topic = await api<{ family: MarketFamily; evidence: EvidenceItem[] }>(`/api/topics/${current.topicSlug}?mode=${mode}`);
          if (active) {
            setFamily(topic.family);
            setEvidence(topic.evidence);
            setSavedEvidence(topic.evidence.filter((item) => current.evidenceIds.includes(item.id)));
          }
        } catch {
          if (active) setNotice("Topic data is unavailable. Manual editing and saved-view recovery remain available.");
        }
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Thesis could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const refreshMarketData = useCallback(async () => {
    if (!thesis?.topicSlug) return;
    const mode = dataContextFromStorage();
    try {
      const topic = await api<{ family: MarketFamily; evidence: EvidenceItem[] }>(`/api/topics/${thesis.topicSlug}?mode=${mode}`);
      setFamily(topic.family);
      setEvidence(topic.evidence);
      setSavedEvidence(topic.evidence.filter((item) => thesis.evidenceIds.includes(item.id)));
      setNotice(`Market research refreshed for ${mode === "live" ? "Live data" : "Replay"}. Your view edits remain here.`);
    } catch (err) {
      setNotice(err instanceof Error ? `Market data could not refresh: ${err.message}. Your view edits remain here.` : "Market data could not refresh. Your view edits remain here.");
    }
  }, [thesis?.topicSlug]);

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
      const topic = await api<{ evidence: EvidenceItem[] }>(`/api/topics/${next.slug}?mode=${dataContextFromStorage()}`);
      setEvidence(topic.evidence || []);
      setMatchingMarkets([]);
      setNotice("Market attached. Review its exact rules and refine your view before confirming.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This market could not be attached.");
    } finally {
      setBindingMarket("");
    }
  }

  async function save(action: "save" | "confirm" | "duplicate" = "save"): Promise<boolean> {
    if (!thesis) return false;
    setSaving(action);
    setError("");
    setNotice("");
    try {
      const res = await api<{ thesis: ThesisRevision }>(`/api/theses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...thesis, action: action === "save" ? undefined : action, mode: modeFromStorage() }),
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
    if (!thesis) return;
    const next = savedEvidence.some((saved) => saved.id === item.id)
      ? savedEvidence.filter((saved) => saved.id !== item.id)
      : [...savedEvidence, item];
    setSavedEvidence(next);
    try {
      const result = await api<{ thesis: ThesisRevision }>(`/api/theses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ evidenceIds: next.map((saved) => saved.id), mode: dataContextFromStorage() }),
      });
      setThesis(result.thesis);
      setNotice(next.some((saved) => saved.id === item.id) ? "Evidence saved to this thesis." : "Evidence removed from this thesis.");
    } catch (cause) {
      setSavedEvidence(savedEvidence);
      setError(cause instanceof Error ? cause.message : "Evidence could not be saved.");
    }
  }

  if (loading) return <p role="status">Loading thesis…</p>;
  if (error && !thesis) return <Empty title="Thesis unavailable">{error}</Empty>;
  if (!thesis) return <Empty title="Thesis unavailable">This view could not be found.</Empty>;
  const workspaceTitle = thesis.title?.trim() || family?.title || thesis.topicSlug.replaceAll("-", " ") || "Untitled thesis";
  const viewValid = thesis.template === "binary"
    ? Boolean(family?.contracts[0] && (thesis.direction === "yes" || thesis.direction === "no"))
    : thesis.lowerThreshold != null && (thesis.template === "directional" || thesis.upperThreshold != null && thesis.upperThreshold > thesis.lowerThreshold);
  const shownEvidence = evidenceFilter === "saved" ? savedEvidence : evidenceFilter === "all" ? evidence : evidence.filter((item) => item.stance === evidenceFilter);
  return (
    <div className="screen-workspace space-y-4">
      <header className="workspace-header">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="workspace-title screen-heading">{workspaceTitle}</h1><p className="mt-2 text-sm text-muted">{family?.question || "Market question unavailable"}{family?.closeTime ? ` · Closes ${formatTime(family.closeTime)}` : ""} · {family?.mode === "live" ? "Gemini live market data" : "Illustrative replay"}</p></div>
          <div className="flex flex-wrap items-center gap-2">{family && evidence.length ? <button type="button" className="min-h-10 rounded-full bg-[#E9EEFF] px-3 text-sm font-semibold text-action" onClick={() => setUpdatesOpen(true)}>● {evidence.length} updates · New evidence</button> : null}<span role="status" className={`status-pill ${dirty ? "status-pill--warning" : "status-pill--good"}`}>{saving ? "Saving…" : dirty ? "Unsaved changes" : `Revision ${thesis.revision} · ${thesis.status}`}</span><button type="button" onClick={() => void refreshMarketData()} className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm font-semibold">Refresh data</button></div>
        </div>
      </header>
      <ThesisWorkspaceTabs thesisId={id} current="Research" lockedTabs={thesis.status === "draft" ? ["Build", "Compare"] : []} onNavigate={navigateSafely} />
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{notice}</p> : null}
      {family ? (
        <div className="workspace-layout">
          <div className="space-y-4">
            <MarketPriceHistory
              illustrative={family.mode === "replay"}
              liveSession={Boolean(liveContract)}
              series={selectedRuleContracts.map((contract, index) => ({
                label: contract!.label,
                color: index === 0 ? "#3559E0" : "#8D6CEB",
                points: [
                  ...(contract!.priceHistory || []),
                  ...(contract!.id === liveContract?.id ? marketFeed.trades.map((trade) => ({ timestamp: trade.eventAt, price: trade.price })) : []),
                ],
              }))}
            />
            {liveContract ? <GeminiLiveMarketFeed
              status={marketFeed.status}
              book={marketFeed.book}
              trades={marketFeed.trades}
              error={marketFeed.error}
              retry={marketFeed.retry}
              restBid={liveContract.bid}
              restAsk={liveContract.ask}
              lastBookUpdateAt={marketFeed.lastBookUpdateAt}
              connectedAt={marketFeed.connectedAt}
            /> : null}
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl font-bold">What does the market expect?</h2><p className="mt-1 text-sm text-muted">Gemini contract-price reference · cents</p></div><span className="source-pill">{family.mode === "replay" ? "Illustrative replay" : "Gemini live data"}</span></div>
              <p className="mt-2 text-xs text-muted">{family.freshness} · observed {family.observationTime ? formatTime(family.observationTime) : "time not provided"}</p>
              {family.mode === "replay" ? <p className="mt-2 rounded-lg bg-[#FFF8E7] p-3 text-xs text-muted">Replay prices and evidence are walkthrough fixtures. They are not current prices, news, or executable quotes.</p> : null}
              <div className="table-scroll mt-3">
                <table className="w-full text-left text-sm">
                  <thead><tr><th className="border-b border-line py-2 pr-3">Contract</th><th className="border-b border-line py-2 pr-3">Bid · YES</th><th className="border-b border-line py-2 pr-3">Ask · YES</th><th className="border-b border-line py-2">Last trade</th></tr></thead>
                  <tbody>{family.contracts.map((contract) => (
                    <tr key={contract.id}>
                      <td className="border-b border-line py-2 pr-3">{contract.label}</td>
                      <td className="border-b border-line py-2 pr-3">{contract.bid ?? "—"}</td>
                      <td className="border-b border-line py-2 pr-3">{contract.ask ?? "—"}</td>
                      <td className="border-b border-line py-2">{contract.lastTrade ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">Prices show market references only. They do not guarantee available size or execution.</p>
            </Card>
            <Card>
              <h2 className="font-serif text-xl">Resolution rules</h2>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Observation</dt><dd>{family.observationTime ? new Date(family.observationTime).toLocaleString() : "Not provided"}</dd></div>
                <div><dt className="text-muted">Market status</dt><dd className="capitalize">{family.sourceEvent.status}</dd></div>
                <div><dt className="text-muted">Trade cutoff</dt><dd>{family.closeTime ? new Date(family.closeTime).toLocaleString() : "Not provided"}</dd></div>
              </dl>
              <div className="mt-3 space-y-3">
                {selectedRuleContracts.length ? selectedRuleContracts.map((contract) => (
                  <div key={contract!.id} className="rounded-lg border border-line p-3 text-sm">
                    <p className="font-medium">{contract!.label}</p>
                    <p className="mt-2 text-xs font-medium text-muted">Exact Gemini contract wording</p>
                    <p className="mt-1 whitespace-pre-wrap">{contract!.description || "Gemini did not include contract-level wording in this response."}</p>
                    {contract!.strike ? <p className="mt-2 text-xs text-muted">Strike: {contract!.strike.type || "type not listed"} · {contract!.strike.value || "value not available"}{contract!.strike.availableAt ? ` · available ${new Date(contract!.strike.availableAt).toLocaleString()}` : ""}</p> : null}
                    <p className="mt-1 text-xs text-muted">Settlement source: {contract!.source || family.sourceEvent.sourceIndex || family.sourceEvent.sourceAgency || "not listed"}</p>
                    {contract!.termsUrl ? <a className="mt-2 inline-block text-sm text-action underline" href={contract!.termsUrl} target="_blank" rel="noreferrer">Open exact Gemini contract rules</a> : <p className="mt-2 text-xs text-muted">No contract-specific rules link was supplied.</p>}
                  </div>
                )) : <p className="rounded-lg border border-line p-3 text-sm text-muted">The current view has no mapped contract boundary. Refresh market data or choose listed boundaries before relying on a contract-level rule.</p>}
              </div>
              {family.sourceEvent.sourceUrl && !selectedRuleContracts.some((contract) => contract?.termsUrl === family.sourceEvent.sourceUrl) ? <a className="mt-3 inline-block text-sm text-action underline" href={family.sourceEvent.sourceUrl} target="_blank" rel="noreferrer">Open event-level Gemini terms</a> : null}
            </Card>
            <Card>
              <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-serif text-2xl font-bold">Evidence board</h2><p className="mt-1 text-sm text-muted">Source material stays separate from the assistant’s interpretation.</p></div>{family.mode === "replay" ? <span className="source-pill">Illustrative replay</span> : null}</div>
              <nav className="mt-4 flex flex-wrap gap-2" aria-label="Filter evidence">
                {([ ["all", `All (${evidence.length})`], ["supports", `Supports (${evidence.filter((item) => item.stance === "supports").length})`], ["challenges", `Challenges (${evidence.filter((item) => item.stance === "challenges").length})`], ["saved", `Saved (${savedEvidence.length})`] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={evidenceFilter === value} onClick={() => setEvidenceFilter(value)} className={`min-h-9 rounded-full border px-3 text-xs ${evidenceFilter === value ? "border-action bg-[#E9EEFF] font-semibold text-action" : "border-line bg-white text-muted"}`}>{label}</button>)}
              </nav>
              {shownEvidence.length ? <div className="evidence-grid mt-3">
                {shownEvidence.map((item) => {
                  const pinned = savedEvidence.some((saved) => saved.id === item.id);
                  return <article key={item.id} className="evidence-card">
                    <span className={`status-pill ${item.stance === "supports" ? "status-pill--good" : item.stance === "challenges" ? "status-pill--error" : ""}`}>{item.stance || "context"}</span>
                    <button type="button" onClick={() => setSelectedEvidence(item)} className="mt-2 block text-left font-semibold leading-tight hover:text-action">{item.title}</button>
                    <p className="mt-1 text-[11px] text-muted">{item.publisher} · retrieved {formatTime(item.retrievedAt)}</p>
                    <p className="mt-2 line-clamp-3 text-sm">{item.excerpt}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-xs">
                      <button type="button" className="font-semibold text-action" onClick={() => toggleSavedEvidence(item)}>{pinned ? "Unsave" : "Save"}</button>
                      <button type="button" className="font-semibold text-action" onClick={() => setAssistantPrompt(`Explain this source claim in the context of my view: “${item.excerpt}” Source: ${item.title} (${item.publisher}).`)}>Ask about this</button>
                      <a className="ml-auto text-muted underline" href={item.url} target="_blank" rel="noreferrer">Original ↗</a>
                    </div>
                  </article>;
                })}
              </div> : <div className="mt-4 rounded-lg border border-dashed border-line bg-[#FAF9F6] p-5 text-sm text-muted">{evidenceFilter === "saved" ? "No evidence is saved on this device yet." : evidence.length ? "No evidence matches this filter." : "No current evidence cards are available for this market. You can refresh the source or edit your view manually."}<div className="mt-3 flex flex-wrap gap-2">{evidenceFilter === "saved" ? null : <button type="button" className="font-semibold text-action underline" onClick={() => void refreshMarketData()}>Refresh evidence and market data</button>}{evidenceFilter !== "all" ? <button type="button" className="font-semibold text-action underline" onClick={() => setEvidenceFilter("all")}>Show all</button> : null}</div></div>}
              <p className="mt-3 text-xs text-muted">Evidence pins are saved with this guest or signed-in thesis. Original source text and retrieval time remain visible.</p>
            </Card>
          </div>
          <aside className="view-rail">
            <ThesisViewPanel
              thesis={thesis}
              family={family}
              action={thesis.status === "draft"
                ? { label: "Confirm view & build", onClick: () => setReviewingConfirmation(true), disabled: !viewValid }
                : { label: "Build a basket", href: `/theses/${id}/build` }}
              editAction={{ label: "Edit view", onClick: () => setEditingView(true) }}
            />
            <VoicePanel
              slug={family.slug}
              family={family}
              evidence={evidence}
              thesis={thesis}
              onThesisChange={(updated) => { setThesis(updated); setDirty(false); setEditingView(false); setNotice(`Voice-assisted edit saved as draft revision ${updated.revision}.`); }}
              context="view"
              title="Talk through your view"
              prefillQuestion={assistantPrompt}
              onPrefillConsumed={() => setAssistantPrompt("")}
            />
          </aside>
        </div>
      ) : (
        <div className="workspace-layout">
          <Card className="space-y-4">
            <div><p className="source-pill">Question-first draft</p><h2 className="mt-3 font-serif text-2xl font-bold">Attach a market when you are ready</h2><p className="mt-2 text-sm text-muted">Your question and notes are saved. Choose a compatible listed market to unlock exact rules, confirmation, Build, and Compare.</p></div>
            <div className="rounded-xl border border-[#CCD6F5] bg-[#F7F8FF] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Research question</p><p className="mt-2 whitespace-pre-wrap text-sm">{thesis.rationale || thesis.title}</p></div>
            {matchingMarkets.length ? <div className="grid gap-3">
              {matchingMarkets.map((market) => <article key={market.id} className="rounded-xl border border-line p-4"><p className="text-xs text-muted">{market.mode === "live" ? "Gemini live market" : "Illustrative replay"} · {market.contracts.length} contract{market.contracts.length === 1 ? "" : "s"}</p><h3 className="mt-1 font-serif text-xl font-bold">{market.title}</h3><p className="mt-1 text-sm text-muted">{market.question}</p><Button className="mt-3" disabled={Boolean(bindingMarket)} onClick={() => void bindMarket(market)}>{bindingMarket === market.id ? "Attaching…" : "Use this market"}</Button></article>)}
            </div> : <Empty title="No compatible market found">Keep this draft and browse Explore. You can return and attach a market when one becomes available.</Empty>}
            <Button href={`/explore?q=${encodeURIComponent(thesis.rationale || thesis.title || "")}`}>Browse all markets</Button>
          </Card>
          <aside className="view-rail"><Card><h2 className="font-serif text-xl font-bold">Your view</h2><p className="mt-2 text-sm text-muted">A view becomes confirmable after a listed market supplies supported boundaries and settlement rules.</p></Card></aside>
        </div>
      )}
      {editingView ? <Card className="space-y-3">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl font-bold">Edit your view</h2><p className="mt-1 text-sm text-muted">Choose only conditions supported by the listed contract rules. This changes the draft, not an existing position.</p></div><button type="button" className="min-h-10 rounded-lg px-3 text-2xl leading-none text-muted hover:bg-[#F4F2ED]" aria-label="Close view editor" onClick={() => { setEditingView(false); if (!dirty) setNotice(""); }}>×</button></div>
        </div>
        <Field label="Template">
          <select className={inputCls()} value={thesis.template} onChange={(event) => changeTemplate(event.target.value as ThesisRevision["template"])}>
            {family?.predicates.length === 1 && family.contracts.length === 1 ? <option value="binary">Single Gemini contract</option> : <option value="directional">Directional threshold</option>}
            {family && family.predicates.length >= 2 ? <><option value="range">Range</option><option value="outside">Outside range</option></> : null}
          </select>
        </Field>
        {thesis.template === "directional" || thesis.template === "binary" ? (
          <Field label="Direction">
            <select className={inputCls()} value={thesis.direction || "yes"} onChange={(event) => change("direction", event.target.value as "yes" | "no")}>
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
        <div className="flex flex-wrap gap-2 border-t border-line pt-3"><Button onClick={async () => { if (await save("save")) setEditingView(false); }} disabled={saving !== null}>{saving === "save" ? "Saving…" : "Save draft"}</Button><Button onClick={() => setReviewingConfirmation(true)} disabled={saving !== null || !viewValid}>Review confirmation</Button><Button kind="ghost" onClick={() => setEditingView(false)} disabled={saving !== null}>Cancel</Button></div>
      </Card> : null}
      {reviewingConfirmation ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setReviewingConfirmation(false); }}>
          <section className="dialog-panel space-y-4" role="dialog" aria-modal="true" aria-labelledby="confirm-view-title">
            <div className="flex items-start justify-between gap-3"><div><p className="source-pill">Review your view</p><h2 id="confirm-view-title" className="mt-3 font-serif text-2xl font-bold">Confirm this thesis view?</h2></div><button type="button" aria-label="Back to editing" className="min-h-10 px-3 text-2xl text-muted" onClick={() => setReviewingConfirmation(false)} disabled={saving !== null}>×</button></div>
            <div className="rounded-xl border border-[#CCD6F5] bg-[#F7F8FF] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{family?.question}</p><p className="mt-2 text-lg font-semibold">{thesis.template === "binary" ? `${thesis.direction?.toUpperCase() || "YES"} · ${family?.contracts[0]?.label || "selected contract"}` : thesis.template === "directional" ? `${thesis.direction === "no" ? "Below" : "At or above"} ${thesis.lowerThreshold ?? "an unset threshold"}` : `${thesis.template === "outside" ? "Outside" : "Between"} ${thesis.lowerThreshold ?? "an unset lower bound"} and ${thesis.upperThreshold ?? "an unset upper bound"}`}</p><p className="mt-1 text-xs text-muted">Settlement {family?.closeTime ? formatTime(family.closeTime) : "deadline not supplied"} · {family?.mode === "live" ? "Gemini live data" : "Illustrative replay"}</p></div>
            {thesis.rationale ? <div><p className="text-sm font-semibold">Your rationale</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{thesis.rationale}</p></div> : null}
            {!viewValid ? <p role="alert" className="rounded-lg border border-bad/30 bg-[#FFF5F4] p-3 text-sm text-bad">Choose valid boundaries from the listed contracts before confirming.</p> : <p className="text-sm text-muted">Confirming saves this version and opens Build. It does not request a quote, connect a wallet, or submit a trade.</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3"><Button onClick={() => setReviewingConfirmation(false)} kind="ghost" disabled={saving !== null}>Back to editing</Button><Button onClick={() => void save("confirm")} disabled={saving !== null || !viewValid}>{saving === "confirm" ? "Saving confirmed view…" : "Confirm view & build"}</Button></div>
          </section>
        </div>
      ) : null}
      {pendingDestination ? <div className="dialog-backdrop" role="presentation"><section className="dialog-panel space-y-4" role="dialog" aria-modal="true" aria-labelledby="unsaved-title"><div className="flex items-start justify-between gap-3"><div><p className="source-pill status-pill--warning">Unsaved changes</p><h2 id="unsaved-title" className="mt-3 font-serif text-2xl font-bold">Leave this research board?</h2></div><button type="button" aria-label="Stay on this thesis" className="min-h-10 px-3 text-2xl text-muted" onClick={() => setPendingDestination("")}>×</button></div><p className="text-sm text-muted">Your view edits have not been saved. Choose whether to keep them before leaving.</p><div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3"><Button kind="ghost" onClick={() => setPendingDestination("")}>Stay</Button><Button kind="danger" onClick={() => void resolvePendingNavigation("discard")}>Discard unsaved</Button><Button onClick={() => void resolvePendingNavigation("save")} disabled={saving !== null}>{saving === "save" ? "Saving…" : "Save and leave"}</Button></div></section></div> : null}
      <AppDrawer open={Boolean(selectedEvidence)} titleId="evidence-detail-title" onClose={() => setSelectedEvidence(null)}>
        {selectedEvidence ? <div className="space-y-4"><div className="flex items-start justify-between gap-3"><div><p className="source-pill">Evidence detail</p><h2 id="evidence-detail-title" className="mt-3 font-serif text-2xl font-bold">{selectedEvidence.title}</h2></div><button type="button" className="min-h-10 px-3 text-2xl text-muted" aria-label="Close evidence detail" onClick={() => setSelectedEvidence(null)}>×</button></div><p className="text-xs text-muted">{selectedEvidence.publisher} · retrieved {formatTime(selectedEvidence.retrievedAt)}</p><div className="rounded-xl border border-line p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Source claim</p><p className="mt-2 whitespace-pre-wrap text-sm">{selectedEvidence.excerpt}</p></div><div className="rounded-xl bg-[#EEF2FF] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-action">Relationship to view</p><p className="mt-2 text-sm">{selectedEvidence.stance === "supports" ? "Potentially supports the current view." : selectedEvidence.stance === "challenges" ? "Challenges an assumption in the current view." : "Adds context without changing the selected boundaries."}</p></div><div className="flex flex-wrap gap-2"><Button href={selectedEvidence.url}>Open original</Button><Button kind="secondary" onClick={() => toggleSavedEvidence(selectedEvidence)}>{savedEvidence.some((item) => item.id === selectedEvidence.id) ? "Remove from thesis" : "Save to thesis"}</Button><Button kind="ghost" onClick={() => { setAssistantPrompt(`Explain this source in the context of my view: ${selectedEvidence.excerpt}`); setSelectedEvidence(null); }}>Ask about this</Button></div></div> : null}
      </AppDrawer>
      <AppDrawer open={updatesOpen} titleId="research-updates-title" onClose={() => setUpdatesOpen(false)}>
        <div className="flex items-start justify-between gap-3"><div><p className="source-pill">Review updates</p><h2 id="research-updates-title" className="mt-3 font-serif text-2xl font-bold">Since your last snapshot</h2><p className="mt-2 text-sm text-muted">New source material is shown separately. Your confirmed boundaries remain unchanged until you explicitly edit and reconfirm them.</p></div><button type="button" className="min-h-10 px-3 text-2xl text-muted" aria-label="Close research updates" onClick={() => setUpdatesOpen(false)}>×</button></div>
        <div className="mt-5 grid gap-3">{evidence.map((item) => <article key={item.id} className="rounded-xl border border-line p-4"><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted">{item.publisher} · {formatTime(item.retrievedAt)}</p><p className="mt-2 line-clamp-3 text-sm">{item.excerpt}</p><div className="mt-3 flex gap-2"><Button kind="secondary" onClick={() => { setUpdatesOpen(false); setSelectedEvidence(item); }}>Review source</Button><Button kind="ghost" onClick={() => toggleSavedEvidence(item)}>{savedEvidence.some((saved) => saved.id === item.id) ? "Saved" : "Save"}</Button></div></article>)}</div>
      </AppDrawer>
    </div>
  );
}
