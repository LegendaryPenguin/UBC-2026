"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, dataContextFromStorage, executionEnvironmentFromStorage } from "@/lib/client";
import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { formatUsdc, formatUsdcFixed, parseUsdc } from "@/lib/format";
import { compileView } from "@/lib/payoffs/compile";
import { buildComparisons, estimateBasketCost, estimateSingleTicketCost } from "@/lib/payoffs/compare";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { WorkspaceAssistant } from "@/components/WorkspaceAssistant";
import { evidenceForSlug } from "@/lib/evidence";
import { PayoffChart } from "@/components/PayoffChart";
import { rangeScenarioGroups } from "@/lib/payoffs/display";
import { ThesisWorkspaceTabs } from "@/components/ThesisWorkspaceTabs";
import { ThesisViewPanel } from "@/components/ThesisViewPanel";
import { useModeChange } from "@/lib/use-mode-change";
import { useResearchNotebook } from "@/lib/use-research-notebook";
import { ResearchRangeNotice } from "@/components/ResearchBoard";

type BasketLeg = { contractId: string; side: "yes" | "no"; payoutAmount: string; enabled: boolean };
type ConstructionChoice = "gemini-basket" | "gemini-single" | "arc-custom";
type Mode = "replay" | "paper" | "live";
type ComparisonBasis = "per-construction" | "equal-budget" | "equal-max-payout";

function defaultBasket(thesis: ThesisRevision, family: MarketFamily, max: string): BasketLeg[] {
  let half = "50";
  try { half = formatUsdc(parseUsdc(max) / 2n); } catch { /* use the visible default */ }
  if (thesis.template === "binary" && family.predicates.length === 1) {
    return [{ contractId: family.predicates[0].contractId, side: thesis.direction || "yes", payoutAmount: max, enabled: true }];
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
    if (predicate) return [{ contractId: predicate.contractId, side: thesis.direction || "yes", payoutAmount: max, enabled: true }];
  }
  return [];
}

function belowCostLabels(values: bigint[], labels: string[], cost: bigint | null): string {
  if (cost == null) return "Cost is not known";
  const below = values.flatMap((value, index) => value < cost ? [labels[index]] : []);
  return below.length ? below.join("; ") : "None before fees";
}

function normalizePayouts(values: bigint[], target: bigint, base: bigint | null): bigint[] | null {
  if (base == null || base <= 0n) return null;
  return values.map((value) => value * target / base);
}

export default function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const { targetRange } = useResearchNotebook(`thesis:${id}`);
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [mode, setMode] = useState<Mode>("replay");
  const [budget, setBudget] = useState("100");
  const [lastValidBudget, setLastValidBudget] = useState("100");
  const [basket, setBasket] = useState<BasketLeg[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [selected, setSelected] = useState<ConstructionChoice>("gemini-basket");
  const [basis, setBasis] = useState<ComparisonBasis>("equal-max-payout");
  const [comparisonSpend, setComparisonSpend] = useState("100");
  const [quoteCapability, setQuoteCapability] = useState(false);
  const [showAllScenarios, setShowAllScenarios] = useState(false);
  const [geminiTradeState, setGeminiTradeState] = useState("unqualified");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useModeChange(() => window.location.reload());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const safeMode: Mode = executionEnvironmentFromStorage() === "paper" ? "paper" : dataContextFromStorage();
        const queryBudget = new URLSearchParams(window.location.search).get("maxPayout");
        const savedBudget = queryBudget !== null ? queryBudget : (() => {
          try { return sessionStorage.getItem(`thesis-build-max:${id}`) ?? "100"; } catch { return "100"; }
        })();
        const savedValidBudget = (() => {
          try {
            const remembered = sessionStorage.getItem(`thesis-build-max-valid:${id}`);
            if (remembered && parseUsdc(remembered) > 0n) return remembered;
            if (parseUsdc(savedBudget) > 0n) return savedBudget;
          } catch { /* use the safe default comparison basis */ }
          return "100";
        })();
        const [thesisResult, status] = await Promise.all([
          api<{ thesis: ThesisRevision }>(`/api/theses/${id}`),
          api<{ services: { id: string; state: string }[] }>("/api/status").catch(() => ({ services: [] })),
        ]);
        const topic = await api<{ family: MarketFamily; evidence: EvidenceItem[] }>(`/api/topics/${thesisResult.thesis.topicSlug}?mode=${dataContextFromStorage()}`);
        if (!active) return;
        setMode(safeMode);
        setBudget(savedBudget);
        setLastValidBudget(savedValidBudget);
        try { sessionStorage.setItem(`thesis-build-max-valid:${id}`, savedValidBudget); } catch { /* comparison remains usable without session storage */ }
        setThesis(thesisResult.thesis);
        setFamily(topic.family);
        setEvidence(topic.evidence);
        const requestedScenario = new URLSearchParams(window.location.search).get("scenario");
        const params = new URLSearchParams(window.location.search);
        const requestedBasis = params.get("basis");
        if (requestedBasis === "per-construction" || requestedBasis === "equal-budget" || requestedBasis === "equal-max-payout") setBasis(requestedBasis);
        setComparisonSpend(params.get("spend") || "100");
        setSelectedScenarioId(topic.family.scenarios.some((scenario) => scenario.id === requestedScenario)
          ? requestedScenario!
          : topic.family.scenarios[0]?.id || "");
        const allowed = new Set(topic.family.contracts.map((contract) => contract.id));
        let restored: BasketLeg[] | null = null;
        try {
          const candidate = JSON.parse(sessionStorage.getItem(`thesis-basket:${id}`) || "null") as BasketLeg[] | null;
          if (Array.isArray(candidate) && candidate.length <= 4 && candidate.every((leg) => allowed.has(leg.contractId) && (leg.side === "yes" || leg.side === "no") && typeof leg.payoutAmount === "string" && typeof leg.enabled === "boolean")) restored = candidate;
        } catch { /* use defaults if there is no valid session draft */ }
        setBasket(restored || defaultBasket(thesisResult.thesis, topic.family, savedBudget));
        setQuoteCapability(safeMode === "paper" || (safeMode === "live" && status.services.some((service) => service.id === "quotes" && service.state === "available")));
        setGeminiTradeState(status.services.find((service) => service.id === "geminiTrade")?.state || "unqualified");
        const savedChoice = sessionStorage.getItem(`thesis-construction:${id}`) as ConstructionChoice | null;
        if (savedChoice === "gemini-basket" || savedChoice === "gemini-single" || savedChoice === "arc-custom") setSelected(savedChoice);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Comparison could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const calculations = useMemo(() => {
    if (!thesis || !family) return null;
    try {
      const maxPayout = parseUsdc(lastValidBudget);
      const desired = compileView(
        family,
        thesis.template,
        { threshold: thesis.lowerThreshold, direction: thesis.direction, lower: thesis.lowerThreshold, upper: thesis.upperThreshold },
        maxPayout,
      );
      const alternatives = buildComparisons(family, desired, { lower: thesis.lowerThreshold, upper: thesis.upperThreshold, threshold: thesis.lowerThreshold, direction: thesis.direction });
      const basketRows = family.scenarios.map((scenario) => ({
        scenario,
        payout: basket.reduce((total, leg) => {
          if (!leg.enabled) return total;
          const predicate = family.predicates.find((item) => item.contractId === leg.contractId);
          if (!predicate) return total;
          const yes = scenario.predicateYes[predicate.id] === true;
          if ((leg.side === "yes" && !yes) || (leg.side === "no" && yes)) return total;
          return total + parseUsdc(leg.payoutAmount);
        }, 0n),
      }));
      const basketCost = estimateBasketCost(family, basket.map((leg) => ({ ...leg, payoutAmount: parseUsdc(leg.payoutAmount) })));
      const ticketSide = thesis.template === "range" ? "yes" : thesis.direction;
      const singleCost = estimateSingleTicketCost(family, alternatives.ticket?.sourceContractIds[0], ticketSide, maxPayout);
      return { desired, alternatives, basketRows, basketCost, singleCost, error: "" };
    } catch (err) {
      return { desired: null, alternatives: null, basketRows: [], basketCost: null, singleCost: null, error: err instanceof Error ? err.message : "The payoff could not be compared." };
    }
  }, [thesis, family, lastValidBudget, basket]);

  function choose(value: ConstructionChoice) {
    setSelected(value);
    try { sessionStorage.setItem(`thesis-construction:${id}`, value); } catch { /* selection is still active */ }
  }

  function updateBasis(value: ComparisonBasis) {
    setBasis(value);
    const url = new URL(window.location.href);
    url.searchParams.set("basis", value);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function updateComparisonSpend(value: string) {
    setComparisonSpend(value);
    const url = new URL(window.location.href);
    url.searchParams.set("spend", value);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function selectScenario(value: string) {
    if (!family?.scenarios.some((scenario) => scenario.id === value)) return;
    setSelectedScenarioId(value);
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", value);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function changeBudget(value: string) {
    setBudget(value);
    try {
      if (parseUsdc(value) > 0n) {
        setLastValidBudget(value);
        sessionStorage.setItem(`thesis-build-max-valid:${id}`, value);
      }
    } catch { /* keep the last valid comparison visible while the user corrects input */ }
    try { sessionStorage.setItem(`thesis-build-max:${id}`, value); } catch { /* comparison remains usable without session storage */ }
    const url = new URL(window.location.href);
    url.searchParams.set("maxPayout", value);
    window.history.replaceState({}, "", url);
  }

  const budgetValid = (() => {
    try { return budget.trim().length > 0 && parseUsdc(budget) > 0n; } catch { return false; }
  })();
  const comparisonSpendValid = (() => {
    try { return comparisonSpend.trim().length > 0 && parseUsdc(comparisonSpend) > 0n; } catch { return false; }
  })();

  if (loading) return <p role="status">Loading construction comparison…</p>;
  if (error && !thesis) return <Card><p role="alert" className="text-sm text-bad">{error}</p><div className="mt-3"><Button href="/workspace" kind="ghost">My Theses</Button></div></Card>;
  if (!thesis || !family) return <Card><p role="alert" className="text-sm text-bad">{error || "Thesis could not be loaded."}</p></Card>;
  if (targetRange) return <ResearchRangeNotice thesisId={id} range={targetRange} />;
  if (thesis.status === "draft") return (
    <div className="screen-workspace space-y-4">
      <header className="workspace-header"><h1 className="workspace-title screen-heading">Compare constructions</h1></header>
      <ThesisWorkspaceTabs thesisId={id} current="Compare" lockedTabs={["Build"]} />
      <Card><h2 className="font-serif text-xl">Confirm your view first</h2><p className="mt-2 text-sm text-muted">Comparison is based on a saved, confirmed view. Return to Research and review the proposed boundaries first.</p><div className="mt-3"><Button href={`/theses/${id}`}>Return to Research</Button></div></Card>
    </div>
  );

  const selectedIndex = family.scenarios.findIndex((scenario) => scenario.id === selectedScenarioId);
  const selectedScenario = family.scenarios[selectedIndex];
  const arcUseful = thesis.template === "range" || thesis.template === "outside";
  const showArc = arcUseful && quoteCapability && (mode === "paper" ? family.mode === "replay" : family.quotesAvailable && family.freshness === "fresh");
  const ticket = calculations?.alternatives?.ticket;
  const ticketContract = ticket ? family.contracts.find((contract) => contract.id === ticket.sourceContractIds[0]) : null;
  const activeConstruction: ConstructionChoice = selected === "arc-custom" && !showArc || selected === "gemini-single" && !ticketContract ? "gemini-basket" : selected;
  const labels = family.scenarios.map((scenario) => scenario.label);
  const basketValues = calculations?.basketRows.map((row) => row.payout) || [];
  const basketMaximum = basketValues.reduce((maximum, value) => value > maximum ? value : maximum, 0n);
  const canEqualBudget = Boolean(ticketContract && calculations?.basketCost && calculations.singleCost);
  const targetPayout = (() => {
    try { return basis === "equal-budget" ? parseUsdc(comparisonSpend) : parseUsdc(budget); } catch { return 0n; }
  })();
  const basisRows = (values: bigint[], maximum: bigint | null, cost: bigint | null) => basis === "per-construction"
    ? values
    : normalizePayouts(values, targetPayout, basis === "equal-budget" ? cost : maximum);
  const basketBasisRows = calculations ? basisRows(basketValues, basketMaximum, calculations.basketCost?.total ?? null) : null;
  const ticketBasisRows = ticket ? basisRows(ticket.rows.map((row) => row.payout), ticket.maxPayout, calculations?.singleCost?.total ?? null) : null;
  const desiredValues = calculations?.desired?.rows.map((row) => row.payout) || [];
  const desiredBasisRows = calculations?.desired ? basisRows(desiredValues, calculations.desired.maxPayout, null) : null;
  const arcBasisRows = basis === "equal-budget" ? null : desiredBasisRows;
  const selectedPayout = activeConstruction === "gemini-basket"
    ? basketBasisRows?.[selectedIndex]
    : activeConstruction === "gemini-single"
      ? ticketBasisRows?.[selectedIndex]
      : arcBasisRows?.[selectedIndex];
  const desiredPayout = desiredBasisRows?.[selectedIndex];
  const outcome = selectedScenario
    ? basis === "equal-budget"
      ? selectedPayout == null ? "Cost reference unavailable; this construction cannot be normalized to the same spend." : `${formatUsdcFixed(selectedPayout)} USDC payout · ${formatUsdc(targetPayout)} USDC reference spend`
      : activeConstruction === "arc-custom"
        ? `${formatUsdcFixed(selectedPayout || 0n)} USDC · matches the confirmed view`
        : `${formatUsdcFixed(selectedPayout || 0n)} USDC vs ${formatUsdcFixed(desiredPayout || 0n)} USDC desired · ${selectedPayout === desiredPayout ? "matches" : "differs"}`
    : undefined;
  const series = calculations?.desired ? [
    ...(basketBasisRows ? [{ name: "Gemini basket", values: basketBasisRows, color: "#C57A36" }] : []),
    ...(ticketBasisRows && ticket ? [{ name: "Single Gemini ticket", values: ticketBasisRows, color: "#718394" }] : []),
    ...(showArc && arcBasisRows ? [{ name: "Arc custom", values: arcBasisRows, color: "#3559E0" }] : []),
  ] : [];
  const compactGroups = rangeScenarioGroups(family, thesis, [
    ...series.map(({ values }) => values),
    ...(desiredBasisRows ? [desiredBasisRows] : []),
  ]);
  const scenarioGroups = showAllScenarios ? undefined : compactGroups;
  const scenarioRows = scenarioGroups?.map((group) => ({ ...group, index: group.indexes[0] }))
    || family.scenarios.map(({ id, label }, index) => ({ id, label, index, indexes: [index] }));
  const chartIndex = scenarioRows.findIndex(({ indexes }) => indexes.includes(selectedIndex));
  const displayedSeries = series.map((item) => ({ ...item, values: scenarioRows.map(({ index }) => item.values[index]) }));
  const basketShortfalls = belowCostLabels(basketValues, labels, calculations?.basketCost?.total ?? null);
  const singleShortfalls = belowCostLabels(ticket?.rows.map((row) => row.payout) || [], labels, calculations?.singleCost?.total ?? null);
  const arcShortfalls = belowCostLabels(calculations?.desired?.rows.map((row) => row.payout) || [], labels, null);
  const selectedName = activeConstruction === "gemini-basket" ? "Gemini basket" : activeConstruction === "gemini-single" ? "One Gemini position" : "Arc custom position";
  const selectedCost = activeConstruction === "gemini-basket"
    ? calculations?.basketCost ? `~${formatUsdc(calculations.basketCost.total)} USDC before fees` : "Reference cost unavailable"
    : activeConstruction === "gemini-single"
      ? calculations?.singleCost ? `~${formatUsdc(calculations.singleCost.total)} USDC before fees` : "Reference cost unavailable"
      : "Not quoted";
  const reviewHref = `/theses/${id}/review?construction=${activeConstruction}&maxPayout=${encodeURIComponent(budget)}&scenario=${encodeURIComponent(selectedScenarioId)}`;
  const action = { label: "Review selected construction", href: reviewHref, disabled: !budgetValid || basis === "equal-budget" && (!comparisonSpendValid || !canEqualBudget) };

  return (
    <div className="screen-workspace space-y-4">
      <header className="workspace-header"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted">{family.title} · {mode === "replay" ? "illustrative replay" : mode}</p><h1 className="workspace-title screen-heading">Compare constructions</h1><p className="mt-2 text-sm text-muted">Select an explicit basis, inspect each settlement scenario, then review one construction.</p></div><span className="status-pill status-pill--good">View confirmed · revision {thesis.revision}</span></div></header>
      <ThesisWorkspaceTabs thesisId={id} current="Compare" />
      {family.mode === "replay" ? <p className="rounded-lg bg-[#FFF8E7] p-3 text-xs text-muted">Replay prices are recorded demonstration fixtures, not current Gemini quotes. Paper mode can request a simulated Arc quote; no live Gemini order is supported from this data.</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Desired view maximum payout (USDC)" hint="Used by the confirmed view and equal maximum payout basis. An edited basket can have a different maximum.">
          <input className={inputCls()} type="number" min="0.01" step="0.01" value={budget} onChange={(event) => changeBudget(event.target.value)} />
        </Field>
        <Field label="Comparison basis" hint="Choose how scenario payouts are displayed. Cost based comparison requires current comparable reference costs.">
          <select className={inputCls()} value={basis} onChange={(event) => updateBasis(event.target.value as ComparisonBasis)}>
            <option value="per-construction">Per construction</option>
            <option value="equal-max-payout">Equal maximum payout</option>
            <option value="equal-budget" disabled={!canEqualBudget}>Equal spending budget{canEqualBudget ? "" : " · cost unavailable"}</option>
          </select>
        </Field>
        {basis === "equal-budget" ? <Field label="Shared reference spend (USDC)" hint="Normalized payouts use this same reference spend; they are not executable quotes."><input className={inputCls()} type="number" min="0.01" step="0.01" value={comparisonSpend} onChange={(event) => updateComparisonSpend(event.target.value)} /></Field> : null}
      </div>
      {basis === "equal-budget" && !canEqualBudget ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">Equal-spend normalization is unavailable until both Gemini constructions have comparable reference costs. An unquoted Arc position cannot be normalized to the same budget.</p> : null}
      {!budgetValid ? <p role="alert" className="text-sm text-bad">Enter a positive amount to update the comparison and review this construction.</p> : null}
      {basis === "equal-budget" && !comparisonSpendValid ? <p role="alert" className="text-sm text-bad">Enter a positive shared spend to update this comparison.</p> : null}
      {calculations?.error ? <p role="alert" className="text-sm text-bad">{calculations.error}</p> : null}
      {calculations?.desired ? (
        <div className="workspace-layout">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <button type="button" onClick={() => choose("gemini-basket")} aria-pressed={activeConstruction === "gemini-basket"} className={`rounded-card border p-4 text-left ${activeConstruction === "gemini-basket" ? "border-action bg-[#F2F5FF]" : "border-line bg-white"}`}>
                <span className="block font-semibold">Gemini basket</span><span className="mt-1 block text-sm text-muted">{basket.filter((leg) => leg.enabled).length} separate contract leg(s) · preferred market construction</span>
              </button>
              {ticket && ticketContract ? <button type="button" onClick={() => choose("gemini-single")} aria-pressed={activeConstruction === "gemini-single"} className={`rounded-card border p-4 text-left ${activeConstruction === "gemini-single" ? "border-action bg-[#F2F5FF]" : "border-line bg-white"}`}>
                <span className="block font-semibold">One Gemini position</span><span className="mt-1 block text-sm text-muted">{ticketContract.label} · easier to execute, may be a looser match</span>
              </button> : null}
              {showArc ? <button type="button" onClick={() => choose("arc-custom")} aria-pressed={activeConstruction === "arc-custom"} className={`rounded-card border p-4 text-left ${activeConstruction === "arc-custom" ? "border-action bg-[#F2F5FF]" : "border-line bg-white"}`}>
                <span className="block font-semibold">Arc custom range</span><span className="mt-1 block text-sm text-muted">Distinct payout shape · {mode === "paper" ? "paper quote available" : "firm quote service available"}</span>
              </button> : null}
            </div>
            <Card>
              <h2 className="font-serif text-xl">Payout by settlement scenario</h2>
              <p className="mt-1 text-sm text-muted">{basis === "per-construction" ? "Each construction keeps its own payout size." : basis === "equal-max-payout" ? `Normalized to ${budget} USDC maximum gross payout.` : `Normalized to ${comparisonSpend} USDC reference spend when comparable costs are available.`} Payout is gross; reference costs exclude fees and are not executable quotes.</p>
              <div className="mt-3">{series.length ? <PayoffChart labels={scenarioRows.map(({ label }) => label)} series={displayedSeries} selectedIndex={chartIndex} /> : <p role="status" className="rounded-lg bg-[#F4F2ED] p-4 text-sm text-muted">No comparable cost basis is available for the selected constructions. Switch to Per construction or Equal maximum payout.</p>}</div>
              {compactGroups ? <Button kind="ghost" onClick={() => setShowAllScenarios((value) => !value)}>{showAllScenarios ? "Show three ranges" : `Show all ${family.scenarios.length} scenarios`}</Button> : null}
            </Card>
            <Card>
              <h2 className="font-serif text-xl">Scenario comparison</h2>
              <p className="mt-1 text-sm text-muted">Choose a settlement state to keep it selected in the view rail. A missing cost is shown as not comparable.</p>
              <div className="table-scroll mt-3"><table className="min-w-[620px] text-left text-sm"><thead><tr><th>Settlement scenario</th>{basketBasisRows ? <th>Gemini basket</th> : <th>Gemini basket · unavailable</th>}{ticket ? <th>One Gemini position</th> : null}{showArc ? <th>Arc custom</th> : null}{basis !== "equal-budget" ? <th>Confirmed view</th> : null}</tr></thead><tbody>{scenarioRows.map((scenario, rowIndex) => <tr key={scenario.id} className={rowIndex === chartIndex ? "bg-[#E9EEFF]" : ""}><td><button type="button" className="font-medium underline decoration-dotted" aria-pressed={rowIndex === chartIndex} onClick={() => selectScenario(scenario.id)}>{scenario.label}</button></td><td className="tabular-nums">{basketBasisRows ? `${formatUsdcFixed(basketBasisRows[scenario.index] ?? 0n)} USDC` : "Not comparable"}</td>{ticket ? <td className="tabular-nums">{ticketBasisRows ? `${formatUsdcFixed(ticketBasisRows[scenario.index] ?? 0n)} USDC` : "Not comparable · cost unavailable"}</td> : null}{showArc ? <td className="tabular-nums">{arcBasisRows ? `${formatUsdcFixed(arcBasisRows[scenario.index] ?? 0n)} USDC` : "Not comparable · quote unavailable"}</td> : null}{basis !== "equal-budget" ? <td className="tabular-nums">{formatUsdcFixed(desiredBasisRows?.[scenario.index] ?? 0n)} USDC</td> : null}</tr>)}</tbody></table></div>
              {basis === "equal-budget" && showArc ? <p className="mt-2 text-xs text-muted">Arc is omitted from equal-spend values until an actual quote provides a comparable cost.</p> : null}
            </Card>
            <Card>
              <h2 className="font-serif text-xl">What each construction means</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr><th className="border-b border-line py-2 pr-3">Construction</th><th className="border-b border-line py-2 pr-3">Max gross payout</th><th className="border-b border-line py-2 pr-3">Cost / max loss</th><th className="border-b border-line py-2 pr-3">Payout below cost</th><th className="border-b border-line py-2 pr-3">Execution difference</th><th className="border-b border-line py-2">Status</th></tr></thead>
                  <tbody>
                    <tr><td className="border-b border-line py-3 pr-3">Gemini basket · {basket.filter((leg) => leg.enabled).length} legs</td><td className="border-b border-line py-3 pr-3">{formatUsdc(basketMaximum)} USDC</td><td className="border-b border-line py-3 pr-3">{calculations.basketCost ? `~${formatUsdc(calculations.basketCost.total)} before fees` : "Reference cost unavailable"}</td><td className="border-b border-line py-3 pr-3">{basketShortfalls}</td><td className="border-b border-line py-3 pr-3">Independent orders; may fill or fail separately</td><td className="border-b border-line py-3">{geminiTradeState === "available" ? "Native orders qualified" : "Research only · native orders gated"}</td></tr>
                    {ticket && ticketContract ? <tr><td className="border-b border-line py-3 pr-3">One Gemini position · {ticketContract.label}</td><td className="border-b border-line py-3 pr-3">{formatUsdc(ticket.maxPayout)} USDC</td><td className="border-b border-line py-3 pr-3">{calculations.singleCost ? `~${formatUsdc(calculations.singleCost.total)} before fees` : "Reference cost unavailable"}</td><td className="border-b border-line py-3 pr-3">{singleShortfalls}</td><td className="border-b border-line py-3 pr-3">One limit order; may miss range boundaries</td><td className="border-b border-line py-3">{geminiTradeState === "available" ? "Native order qualified" : "Research only · native order gated"}</td></tr> : null}
                    {showArc ? <tr><td className="border-b border-line py-3 pr-3">Arc custom position</td><td className="border-b border-line py-3 pr-3">{formatUsdc(calculations.desired.maxPayout)} USDC</td><td className="border-b border-line py-3 pr-3">Not quoted</td><td className="border-b border-line py-3 pr-3">{arcShortfalls}</td><td className="border-b border-line py-3 pr-3">One custom contract with the selected scenario schedule</td><td className="border-b border-line py-3">{mode === "paper" ? "Paper simulation available after review" : "Review available; quote depends on configured service"}</td></tr> : null}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted">“Payout below cost” lists losing scenarios when costs are known. Gemini cost estimates use displayed ask-side references, exclude fees, size, and slippage, and are not executable quotes. A Gemini basket uses independent orders, not an exchange combo.</p>
            </Card>
            {activeConstruction !== "arc-custom" ? <Card><h2 className="font-serif text-lg">No Gemini order submitted</h2><p className="mt-2 text-sm text-muted">{geminiTradeState === "available" ? "This comparison does not submit the basket, because its legs are independent and can partially fill. Review individual orders at the Gemini event." : "Native Gemini trading remains gated until a sandbox order, status lookup, and position/fill retrieval are verified. You can continue with market research and payoff comparisons."}</p></Card> : null}
            <WorkspaceAssistant slug={family.slug} family={family} evidence={evidence.length ? evidence : evidenceForSlug(family.slug, family.mode)} thesis={thesis} context="compare" maxPayout={budget} title="Talk through the comparison" />
          </div>
          <aside className="view-rail">
            <ThesisViewPanel thesis={thesis} family={family} selectedScenarioId={selectedScenarioId} onScenarioChange={selectScenario} scenarioGroups={scenarioGroups} scenarioOutcome={outcome} scenarioOutcomeLabel="Selected construction · scenario result" action={action} />
            <Card>
              <h2 className="font-serif text-lg">Selected option</h2>
              <p className="mt-2 font-medium">{selectedName}</p>
              <p className="mt-1 text-sm text-muted">Cost: {selectedCost}</p>
              <p className="mt-2 text-xs text-muted">Changing your selected construction does not change the confirmed thesis. Gemini basket legs are separate orders, not an exchange combo.</p>
            </Card>
            <Card>
              <h2 className="font-serif text-lg">Current mode</h2>
              <p className="mt-2 text-sm capitalize">{mode === "replay" ? "Illustrative replay" : mode === "paper" ? "Paper simulation" : "Live data"}</p>
              <p className="mt-1 text-xs text-muted">The mode is selected in the top bar. Switching it does not move orders, quotes, or positions between environments.</p>
            </Card>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
