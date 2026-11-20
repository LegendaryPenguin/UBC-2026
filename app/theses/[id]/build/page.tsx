"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, dataContextFromStorage } from "@/lib/client";
import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { compileView } from "@/lib/payoffs/compile";
import { estimateBasketCost } from "@/lib/payoffs/compare";
import { parseUsdc, formatUsdc, formatUsdcFixed, formatTime } from "@/lib/format";
import { PayoffChart } from "@/components/PayoffChart";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { WorkspaceAssistant } from "@/components/WorkspaceAssistant";
import { evidenceForSlug } from "@/lib/evidence";
import { ThesisWorkspaceTabs } from "@/components/ThesisWorkspaceTabs";
import { ThesisViewPanel } from "@/components/ThesisViewPanel";
import { useModeChange } from "@/lib/use-mode-change";
import { useResearchNotebook } from "@/lib/use-research-notebook";
import { marketThesisTitle } from "@/lib/research-range";
import { ResearchRangeNotice } from "@/components/ResearchBoard";

type BasketLegDraft = {
  contractId: string;
  side: "yes" | "no";
  payoutAmount: string;
  enabled: boolean;
};
type SavedConstruction = { basket: BasketLegDraft[]; max: string; thesisRevision: number; familyVersion: string; savedAt: string };

function initialLegs(thesis: ThesisRevision, family: MarketFamily, maximum: string): BasketLegDraft[] {
  const half = (() => {
    try { return formatUsdc(parseUsdc(maximum) / 2n); } catch { return "50"; }
  })();
  if (thesis.template === "binary" && family.predicates.length === 1) {
    return [{ contractId: family.predicates[0].contractId, side: thesis.direction || "yes", payoutAmount: maximum, enabled: true }];
  }
  if (thesis.template === "range" && thesis.lowerThreshold != null && thesis.upperThreshold != null) {
    const lower = family.predicates.find((predicate) => predicate.threshold === thesis.lowerThreshold);
    const upper = family.predicates.find((predicate) => predicate.threshold === thesis.upperThreshold);
    if (lower && upper) return [
      { contractId: lower.contractId, side: "yes", payoutAmount: half, enabled: true },
      { contractId: upper.contractId, side: "no", payoutAmount: half, enabled: true },
    ];
  }
  if (thesis.template === "directional" && thesis.lowerThreshold != null) {
    const predicate = family.predicates.find((item) => item.threshold === thesis.lowerThreshold);
    if (predicate) return [{ contractId: predicate.contractId, side: thesis.direction || "yes", payoutAmount: maximum, enabled: true }];
  }
  return [];
}

export default function BuildPage() {
  const { id } = useParams<{ id: string }>();
  const { targetRange } = useResearchNotebook(`thesis:${id}`);
  const router = useRouter();
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [max, setMax] = useState("100");
  const [basket, setBasket] = useState<BasketLegDraft[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savedConstruction, setSavedConstruction] = useState<SavedConstruction | null>(null);
  const [constructionNotice, setConstructionNotice] = useState("");
  const [payoutBasis, setPayoutBasis] = useState<"gross" | "net">("gross");
  const [savingConstruction, setSavingConstruction] = useState(false);

  useModeChange(() => window.location.reload());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await api<{ thesis: ThesisRevision }>(`/api/theses/${id}`);
        const mode = dataContextFromStorage();
        const topic = await api<{ family: MarketFamily }>(`/api/topics/${result.thesis.topicSlug}?mode=${mode}`);
        if (!active) return;
        setThesis(result.thesis);
        setFamily(topic.family);
        try {
          const saved = result.thesis.savedConstruction as Partial<SavedConstruction> | null | undefined;
          const allowed = new Set(topic.family.predicates.map((predicate) => predicate.contractId));
          const validBasket = Array.isArray(saved?.basket) && saved.basket.length <= 4 && saved.basket.every((leg) => {
            if (!leg || typeof leg !== "object" || !allowed.has(leg.contractId) || (leg.side !== "yes" && leg.side !== "no") || typeof leg.payoutAmount !== "string" || typeof leg.enabled !== "boolean") return false;
            try { return parseUsdc(leg.payoutAmount) > 0n; } catch { return false; }
          });
          const validMaximum = typeof saved?.max === "string" && (() => { try { return parseUsdc(saved.max) > 0n; } catch { return false; } })();
          const validSavedAt = typeof saved?.savedAt === "string" && Number.isFinite(Date.parse(saved.savedAt));
          if (saved && saved.thesisRevision === result.thesis.revision && saved.familyVersion === topic.family.version && validBasket && validMaximum && validSavedAt) setSavedConstruction(saved as SavedConstruction);
        } catch { setSavedConstruction(null); }
        const storedMax = (() => {
          try { return sessionStorage.getItem(`thesis-build-max:${id}`) || "100"; } catch { return "100"; }
        })();
        setMax(storedMax);
        const defaults = initialLegs(result.thesis, topic.family, storedMax);
        try {
          const storedLegs = JSON.parse(sessionStorage.getItem(`thesis-basket:${id}`) || "null") as BasketLegDraft[] | null;
          const allowed = new Set(topic.family.contracts.map((contract) => contract.id));
          if (Array.isArray(storedLegs) && storedLegs.length <= 4 && storedLegs.every((leg) => allowed.has(leg.contractId) && (leg.side === "yes" || leg.side === "no") && typeof leg.payoutAmount === "string" && typeof leg.enabled === "boolean")) {
            setBasket(storedLegs);
          } else {
            setBasket(defaults);
          }
        } catch {
          setBasket(defaults);
        }
        setSelectedScenarioId(topic.family.scenarios[0]?.id || "");
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Payoff studio could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const construction = useMemo(() => {
    if (!thesis || !family) return null;
    try {
      const maximum = parseUsdc(max);
      const desired = compileView(
        family,
        thesis.template,
        { threshold: thesis.lowerThreshold, direction: thesis.direction, lower: thesis.lowerThreshold, upper: thesis.upperThreshold },
        maximum,
      );
      const basketRows = family.scenarios.map((scenario) => {
        const payout = basket.reduce((total, leg) => {
          if (!leg.enabled) return total;
          const predicate = family.predicates.find((item) => item.contractId === leg.contractId);
          if (!predicate) return total;
          const yes = scenario.predicateYes[predicate.id] === true;
          if ((leg.side === "yes" && !yes) || (leg.side === "no" && yes)) return total;
          return total + parseUsdc(leg.payoutAmount);
        }, 0n);
        return { ...scenario, payout };
      });
      const cost = estimateBasketCost(family, basket.map((leg) => ({ ...leg, payoutAmount: parseUsdc(leg.payoutAmount) })));
      return { desired, basketRows, cost, error: "" };
    } catch (err) {
      return { desired: null, basketRows: [], cost: null, error: err instanceof Error ? err.message : "Invalid amount or view." };
    }
  }, [thesis, family, max, basket]);

  function saveBasket(next: BasketLegDraft[]) {
    setBasket(next);
    try { sessionStorage.setItem(`thesis-basket:${id}`, JSON.stringify(next)); } catch { /* session persistence is optional */ }
  }

  function updateLeg(index: number, patch: Partial<BasketLegDraft>) {
    saveBasket(basket.map((leg, legIndex) => legIndex === index ? { ...leg, ...patch } : leg));
  }

  function updateMaximum(value: string) {
    setMax(value);
    try { sessionStorage.setItem(`thesis-build-max:${id}`, value); } catch { /* session persistence is optional */ }
  }

  function compareConstructions() {
    try {
      sessionStorage.setItem(`thesis-basket:${id}`, JSON.stringify(basket));
      sessionStorage.setItem(`thesis-build-max:${id}`, max);
    } catch { /* Compare still loads with its safe defaults */ }
    router.push(`/theses/${id}/compare?maxPayout=${encodeURIComponent(max)}`);
  }

  async function saveConstruction() {
    if (!thesis || !family || !construction?.desired || construction.error) return;
    const saved: SavedConstruction = { basket, max, thesisRevision: thesis.revision, familyVersion: family.version, savedAt: new Date().toISOString() };
    setSavingConstruction(true);
    try {
      const result = await api<{ thesis: ThesisRevision }>(`/api/theses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ savedConstruction: saved }),
      });
      setThesis(result.thesis);
      setSavedConstruction(saved);
      setConstructionNotice("Construction saved with this thesis, source revision, and market version.");
    } catch (cause) {
      setConstructionNotice(cause instanceof Error ? cause.message : "The construction could not be saved. Your current editor values remain available in this tab.");
    } finally {
      setSavingConstruction(false);
    }
  }

  function restoreConstruction() {
    if (!savedConstruction || !thesis || !family) return;
    if (savedConstruction.thesisRevision !== thesis.revision || savedConstruction.familyVersion !== family.version) {
      setConstructionNotice("The saved construction belongs to a different thesis revision or market version. Review it in History before restoring.");
      return;
    }
    saveBasket(savedConstruction.basket);
    updateMaximum(savedConstruction.max);
    setConstructionNotice("Saved construction restored. Review the scenario payouts again before comparing or reviewing.");
  }

  if (loading) return <p role="status">Loading basket builder…</p>;
  if (error || !thesis || !family) return <Card><p role="alert" className="text-sm text-bad">{error || "This thesis could not be loaded."}</p><div className="mt-3"><Button href="/workspace" kind="ghost">My Theses</Button></div></Card>;
  if (targetRange) return <ResearchRangeNotice thesisId={id} range={targetRange} />;

  if (thesis.status === "draft") {
    return (
      <div className="screen-workspace space-y-4">
        <header className="workspace-header"><div><p className="text-xs uppercase tracking-wide text-muted">{family.title}</p><h1 className="workspace-title screen-heading">Build a basket</h1><p className="mt-2 text-sm text-muted">{family.question}</p></div></header>
        <ThesisWorkspaceTabs thesisId={id} current="Build" lockedTabs={["Compare"]} />
        <Card>
          <h2 className="font-serif text-xl">Confirm your view first</h2>
          <p className="mt-2 text-sm text-muted">Review the question and confirm the view you want this basket to express. No quote or trade is created by confirming.</p>
          <div className="mt-3"><Button href={`/theses/${id}`}>Return to Research</Button></div>
        </Card>
      </div>
    );
  }

  const selectedIndex = family.scenarios.findIndex((scenario) => scenario.id === selectedScenarioId);
  const selectedScenario = family.scenarios[selectedIndex];
  const selectedBasketPayout = construction?.basketRows[selectedIndex]?.payout ?? 0n;
  const selectedDesiredPayout = construction?.desired?.rows[selectedIndex]?.payout ?? 0n;
  const referenceCost = construction?.cost?.total ?? null;
  const displayedPayout = (value: bigint) => payoutBasis === "net" && referenceCost !== null ? value - referenceCost : value;
  const scenarioOutcome = selectedScenario
    ? `Basket ${formatUsdcFixed(displayedPayout(selectedBasketPayout))} ${payoutBasis} · view ${formatUsdcFixed(selectedDesiredPayout)} gross USDC${payoutBasis === "gross" ? selectedBasketPayout === selectedDesiredPayout ? " · matches" : " · differs" : ""}`
    : undefined;
  const chartSeries = construction?.desired ? payoutBasis === "net" && referenceCost !== null
    ? [{ name: "Gemini basket · net estimate", values: construction.basketRows.map((row) => row.payout - referenceCost), color: "#3559E0" }]
    : [
      { name: "Confirmed view", values: construction.desired.rows.map((row) => row.payout), color: "#3559E0" },
      { name: "Gemini basket", values: construction.basketRows.map((row) => row.payout), color: "#C57A36" },
    ] : [];
  const basketMatchesView = construction?.desired?.rows.every((row, index) => row.payout === construction.basketRows[index]?.payout) || false;
  const legContractOptions = family.predicates.map((predicate) => family.contracts.find((contract) => contract.id === predicate.contractId)).filter((contract) => contract != null);
  const availableLegContracts = legContractOptions.filter((contract) => !basket.some((leg) => leg.contractId === contract!.id && leg.enabled));

  function addSupportedLeg() {
    const contract = availableLegContracts[0];
    if (!contract || basket.length >= 4) return;
    saveBasket([...basket, { contractId: contract.id, side: "yes", payoutAmount: max, enabled: true }]);
  }

  return (
    <div className="screen-workspace space-y-4">
      <header className="workspace-header"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="workspace-title screen-heading">{marketThesisTitle(thesis, family)}</h1><p className="mt-2 text-sm text-muted">{family.question}{family.closeTime ? ` · Closes ${new Date(family.closeTime).toLocaleString()}` : ""} · {family.mode === "replay" ? "Illustrative replay" : family.freshness}</p></div><span className="status-pill status-pill--good">Confirmed view · revision {thesis.revision}</span></div></header>
      <ThesisWorkspaceTabs thesisId={id} current="Build" />
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl font-bold">Does this construction match your view?</h2><span className="text-xs text-muted">Compare is optional · no order is submitted here</span></div>
      {family.mode === "replay" ? <p className="rounded-lg bg-[#FFF8E7] p-3 text-xs text-muted">This board uses recorded walkthrough data. Prices and cost estimates are illustrative. Build does not create an order; a paper Arc quote can be requested from Compare in Paper mode.</p> : null}
      {constructionNotice ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{constructionNotice}</p> : null}
      <div className="workspace-layout">
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
              <h2 className="font-serif text-xl">Your Gemini basket</h2>
              <p className="mt-1 text-sm text-muted">Each leg is a separate Gemini contract. Edit its side and payout allocation, or remove it to see how the scenario payouts change.</p>
              </div>
              <div className="inline-flex rounded-lg border border-line bg-white p-1" aria-label="Payout basis">
                <button type="button" aria-pressed={payoutBasis === "gross"} onClick={() => setPayoutBasis("gross")} className={`min-h-9 rounded-md px-3 text-sm ${payoutBasis === "gross" ? "bg-[#E9EEFF] font-semibold text-action" : "text-muted"}`}>Gross payout</button>
                <button type="button" aria-pressed={payoutBasis === "net"} disabled={referenceCost === null} onClick={() => setPayoutBasis("net")} className={`min-h-9 rounded-md px-3 text-sm disabled:opacity-40 ${payoutBasis === "net" ? "bg-[#E9EEFF] font-semibold text-action" : "text-muted"}`}>Net result</button>
              </div>
            </div>
            {basket.length === 0 ? <p className="rounded-lg border border-line p-3 text-sm text-muted">Gemini contracts for this view do not create a direct basket. Compare the compiled view and available alternatives instead.</p> : null}
            {basket.map((leg, index) => (
              <div key={`${index}-${leg.contractId}`} className={`rounded-lg border p-3 ${leg.enabled ? "border-line" : "border-dashed border-line opacity-70"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">Leg {index + 1} {leg.enabled ? "" : "· removed"}</h3>
                  <button type="button" className="min-h-10 px-2 text-sm text-action" onClick={() => updateLeg(index, { enabled: !leg.enabled })}>
                    {leg.enabled ? "Remove leg" : "Restore leg"}
                  </button>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <Field label="Contract">
                    <select className={inputCls()} value={leg.contractId} disabled={!leg.enabled} onChange={(event) => updateLeg(index, { contractId: event.target.value })}>
                      {legContractOptions.map((contract) => <option key={contract!.id} value={contract!.id}>{contract!.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Side">
                    <select className={inputCls()} value={leg.side} disabled={!leg.enabled} onChange={(event) => updateLeg(index, { side: event.target.value as "yes" | "no" })}>
                      <option value="yes">YES</option><option value="no">NO</option>
                    </select>
                  </Field>
                  <Field label="Payout allocation (USDC)">
                    <input className={inputCls()} type="number" min="0" step="0.01" value={leg.payoutAmount} disabled={!leg.enabled} onChange={(event) => updateLeg(index, { payoutAmount: event.target.value })} />
                  </Field>
                </div>
                {leg.enabled ? <p className="mt-2 text-xs text-muted">This leg pays its allocation when {leg.side.toUpperCase()} resolves for {legContractOptions.find((contract) => contract!.id === leg.contractId)?.label}.</p> : null}
              </div>
            ))}
            <Button kind="ghost" onClick={addSupportedLeg} disabled={!availableLegContracts.length || basket.length >= 4}>Add supported leg</Button>
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <Field label="Desired view maximum payout (USDC)" hint="Used to compare the basket against your confirmed view.">
                <input className={inputCls()} type="number" min="0.01" step="0.01" value={max} onChange={(event) => updateMaximum(event.target.value)} />
              </Field>
              <div className="self-end pb-2 text-xs text-muted">The contract payout shown here is gross payout, before subtracting costs or fees.</div>
            </div>
            {construction?.error ? <p role="alert" className="text-sm text-bad">{construction.error}</p> : null}
          </Card>
          {construction?.desired ? (
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div><h2 className="font-serif text-xl">{payoutBasis === "gross" ? "Gross payout" : "Estimated net result"} by settlement scenario</h2><p className="mt-1 text-sm text-muted">{payoutBasis === "gross" ? "Payout only; profit or loss requires subtracting the estimated cost." : `Reference cost of ${referenceCost === null ? "—" : `${formatUsdc(referenceCost)} USDC`} is subtracted from each payout. This is not an executable quote.`}</p></div>
                <p className={`text-xs ${basketMatchesView ? "text-good" : "text-muted"}`}>{basketMatchesView ? "Matches the confirmed view in every listed scenario" : "This basket differs from your view in at least one scenario"}</p>
              </div>
              <div className="mt-3">
                <PayoffChart labels={family.scenarios.map((scenario) => scenario.label)} series={chartSeries} selectedIndex={selectedIndex} />
              </div>
              <div className="table-scroll mt-4"><table className="text-left text-sm"><thead><tr><th>Settlement scenario</th><th>Your basket · {payoutBasis}</th><th>Confirmed view · gross</th><th>Fit</th></tr></thead><tbody>{family.scenarios.map((scenario, index) => { const basketPayout = construction.basketRows[index]?.payout ?? 0n; const desiredPayout = construction.desired?.rows[index]?.payout ?? 0n; return <tr key={scenario.id} className={scenario.id === selectedScenarioId ? "bg-[#E9EEFF]" : ""}><td><button type="button" className="text-left font-medium underline decoration-dotted" aria-pressed={scenario.id === selectedScenarioId} onClick={() => setSelectedScenarioId(scenario.id)}>{scenario.label}</button></td><td className="tabular-nums">{formatUsdcFixed(displayedPayout(basketPayout))} USDC</td><td className="tabular-nums">{formatUsdcFixed(desiredPayout)} USDC</td><td>{payoutBasis === "gross" ? basketPayout === desiredPayout ? "Matches" : "Differs" : "Net estimate"}</td></tr>; })}</tbody></table></div>
            </Card>
          ) : null}
          <Card>
            <h2 className="font-serif text-xl">Reference cost</h2>
            {construction?.cost ? (
              <>
                <p className="mt-2 text-lg font-semibold">About {formatUsdc(construction.cost.total)} USDC before fees</p>
                <p className="mt-1 text-sm text-muted">Uses displayed Gemini ask-side reference prices for the enabled legs. Maximum loss for a fully paid binary basket is the amount spent, before fees.</p>
              </>
            ) : <p className="mt-2 text-sm text-muted">A reference cost is unavailable for one or more legs. The scenario preview remains useful; do not treat it as an order cost.</p>}
            <p className="mt-2 text-xs text-muted">Reference prices do not promise available size or execution. Fees, slippage, order-size increments, and partial fills are not included. Gemini order submission remains gated pending sandbox qualification.</p>
          </Card>
          {construction?.desired ? <WorkspaceAssistant slug={family.slug} family={family} evidence={evidenceForSlug(family.slug, family.mode)} thesis={thesis} context="payoff" maxPayout={max} title="Ask about these scenario payouts" /> : null}
        </div>
        <aside className="view-rail">
          <ThesisViewPanel thesis={thesis} family={family} selectedScenarioId={selectedScenarioId} onScenarioChange={setSelectedScenarioId} scenarioOutcome={scenarioOutcome} scenarioOutcomeLabel="Basket · desired view payout" />
          <Card className="space-y-2"><h2 className="font-serif text-xl font-bold">Next step</h2><p className="text-sm text-muted">Save a named construction, compare another payoff, or review this basket directly.</p><Button kind="ghost" onClick={() => void saveConstruction()} disabled={savingConstruction || !construction?.desired || Boolean(construction.error)}>{savingConstruction ? "Saving…" : "Save construction"}</Button>{savedConstruction ? <button type="button" className="min-h-10 text-sm font-semibold text-action underline" onClick={restoreConstruction}>Restore saved version · {formatTime(savedConstruction.savedAt)}</button> : null}<Button onClick={compareConstructions} disabled={!construction?.desired || Boolean(construction.error)}>Compare options</Button><Button href={`/theses/${id}/review?construction=gemini-basket&maxPayout=${encodeURIComponent(max)}&scenario=${encodeURIComponent(selectedScenarioId)}`} kind="secondary" disabled={!construction?.desired || Boolean(construction.error)}>Review construction</Button><p className="text-xs text-muted">Review shows the venue, environment, terms, and quote path. No financial action happens until explicit review and authorization.</p></Card>
          <Card>
            <h2 className="font-serif text-lg">Execution status</h2>
            <p className="mt-2 text-sm text-muted">No Gemini execution happens in Build. The two basket legs would be separate orders and could fill differently. Review is required before any supported order.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
