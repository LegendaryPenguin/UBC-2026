"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, modeFromStorage } from "@/lib/client";
import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { compileView } from "@/lib/payoffs/compile";
import { estimateBasketCost } from "@/lib/payoffs/compare";
import { parseUsdc, formatUsdc, formatUsdcFixed } from "@/lib/format";
import { PayoffChart } from "@/components/PayoffChart";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { VoicePanel } from "@/components/VoicePanel";
import { evidenceForSlug } from "@/lib/evidence";
import { ThesisWorkspaceTabs } from "@/components/ThesisWorkspaceTabs";
import { ThesisViewPanel } from "@/components/ThesisViewPanel";
import { useModeChange } from "@/lib/use-mode-change";

type BasketLegDraft = {
  contractId: string;
  side: "yes" | "no";
  payoutAmount: string;
  enabled: boolean;
};

function initialLegs(thesis: ThesisRevision, family: MarketFamily, maximum: string): BasketLegDraft[] {
  const half = (() => {
    try { return formatUsdc(parseUsdc(maximum) / 2n); } catch { return "50"; }
  })();
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
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [max, setMax] = useState("100");
  const [basket, setBasket] = useState<BasketLegDraft[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useModeChange(() => window.location.reload());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await api<{ thesis: ThesisRevision }>(`/api/theses/${id}`);
        const mode = modeFromStorage() === "live" ? "live" : "replay";
        const topic = await api<{ family: MarketFamily }>(`/api/topics/${result.thesis.topicSlug}?mode=${mode}`);
        if (!active) return;
        setThesis(result.thesis);
        setFamily(topic.family);
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
    window.location.href = `/theses/${id}/compare?maxPayout=${encodeURIComponent(max)}`;
  }

  if (loading) return <p role="status">Loading basket builder…</p>;
  if (error || !thesis || !family) return <Card><p role="alert" className="text-sm text-bad">{error || "This thesis could not be loaded."}</p><div className="mt-3"><Button href="/workspace" kind="ghost">My Theses</Button></div></Card>;

  if (thesis.status === "draft") {
    return (
      <div className="space-y-4">
        <p className="text-xs uppercase tracking-wide text-muted">{family.title}</p>
        <h1 className="font-serif text-3xl">Build a basket</h1>
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
  const scenarioOutcome = selectedScenario
    ? `Basket ${formatUsdcFixed(selectedBasketPayout)} · view ${formatUsdcFixed(selectedDesiredPayout)} USDC${selectedBasketPayout === selectedDesiredPayout ? " · matches" : " · differs"}`
    : undefined;
  const chartSeries = construction?.desired ? [
    { name: "Confirmed view", values: construction.desired.rows.map((row) => row.payout), color: "#3559E0" },
    { name: "Gemini basket", values: construction.basketRows.map((row) => row.payout), color: "#C57A36" },
  ] : [];
  const basketMatchesView = construction?.desired?.rows.every((row, index) => row.payout === construction.basketRows[index]?.payout) || false;
  const legContractOptions = family.predicates.map((predicate) => family.contracts.find((contract) => contract.id === predicate.contractId)).filter((contract) => contract != null);

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-wide text-muted">{family.title} · Gemini references · {family.mode === "replay" ? "illustrative replay" : family.freshness}</p>
      <h1 className="font-serif text-3xl">Does this basket match your view?</h1>
      <ThesisWorkspaceTabs thesisId={id} current="Build" />
      {family.mode === "replay" ? <p className="rounded-lg bg-[#FFF8E7] p-3 text-xs text-muted">This board uses recorded walkthrough data. Prices and cost estimates are illustrative. Build does not create an order; a paper Arc quote can be requested from Compare in Paper mode.</p> : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.85fr)]">
        <div className="space-y-4">
          <Card className="space-y-3">
            <div>
              <h2 className="font-serif text-xl">Your Gemini basket</h2>
              <p className="mt-1 text-sm text-muted">Each leg is a separate Gemini contract. Edit its side and payout allocation, or remove it to see how the scenario payouts change.</p>
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
                <div><h2 className="font-serif text-xl">Gross payout by settlement scenario</h2><p className="mt-1 text-sm text-muted">Payout only; profit or loss requires subtracting the estimated cost.</p></div>
                <p className={`text-xs ${basketMatchesView ? "text-good" : "text-muted"}`}>{basketMatchesView ? "Matches the confirmed view in every listed scenario" : "This basket differs from your view in at least one scenario"}</p>
              </div>
              <div className="mt-3">
                <PayoffChart labels={family.scenarios.map((scenario) => scenario.label)} series={chartSeries} selectedIndex={selectedIndex} />
              </div>
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
          {construction?.desired ? <VoicePanel slug={family.slug} family={family} evidence={evidenceForSlug(family.slug, family.mode)} thesis={thesis} context="payoff" maxPayout={max} title="Ask about these scenario payouts" /> : null}
          <div className="flex flex-wrap gap-2"><Button onClick={compareConstructions} disabled={!construction?.desired || Boolean(construction.error)}>Compare constructions</Button><Button href={`/theses/${id}`} kind="ghost">Edit confirmed view</Button></div>
        </div>
        <aside className="space-y-4">
          <ThesisViewPanel thesis={thesis} family={family} selectedScenarioId={selectedScenarioId} onScenarioChange={setSelectedScenarioId} scenarioOutcome={scenarioOutcome} scenarioOutcomeLabel="Basket · desired view payout" action={{ label: "Compare constructions", href: `/theses/${id}/compare?maxPayout=${encodeURIComponent(max)}`, disabled: !construction?.desired || Boolean(construction.error) }} />
          <Card>
            <h2 className="font-serif text-lg">Execution status</h2>
            <p className="mt-2 text-sm text-muted">No Gemini execution happens in Build. The two basket legs would be separate orders and could fill differently. Review is required before any supported order.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
