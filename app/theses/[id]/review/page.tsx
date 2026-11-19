"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { api, dataContextFromStorage, executionEnvironmentFromStorage } from "@/lib/client";
import type { EvidenceItem, MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { formatUsdc, formatUsdcFixed, parseUsdc } from "@/lib/format";
import { compileView } from "@/lib/payoffs/compile";
import { buildComparisons, estimateBasketCost, estimateSingleTicketCost } from "@/lib/payoffs/compare";
import { evidenceForSlug } from "@/lib/evidence";
import { Button, Card, Empty } from "@/components/ui";
import { ThesisWorkspaceTabs } from "@/components/ThesisWorkspaceTabs";
import { ThesisViewPanel } from "@/components/ThesisViewPanel";
import { VoicePanel } from "@/components/VoicePanel";
import { useModeChange } from "@/lib/use-mode-change";

type ConstructionChoice = "gemini-basket" | "gemini-single" | "arc-custom";
type Mode = "replay" | "paper" | "live";
type BasketLeg = { contractId: string; side: "yes" | "no"; payoutAmount: string; enabled: boolean };

function defaultBasket(thesis: ThesisRevision, family: MarketFamily, maximum: string): BasketLeg[] {
  let half = "50";
  try { half = formatUsdc(parseUsdc(maximum) / 2n); } catch { /* keep the visible default */ }
  if (thesis.template === "binary" && family.predicates.length === 1) {
    return [{ contractId: family.predicates[0].contractId, side: thesis.direction || "yes", payoutAmount: maximum, enabled: true }];
  }
  if (thesis.template === "range" && thesis.lowerThreshold != null && thesis.upperThreshold != null) {
    const lower = family.predicates.find((item) => item.threshold === thesis.lowerThreshold);
    const upper = family.predicates.find((item) => item.threshold === thesis.upperThreshold);
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

function readBasket(thesisId: string, family: MarketFamily, fallback: BasketLeg[]): BasketLeg[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(`thesis-basket:${thesisId}`) || "null") as BasketLeg[] | null;
    const allowed = new Set(family.contracts.map((contract) => contract.id));
    if (Array.isArray(parsed) && parsed.length <= 4 && parsed.every((leg) => allowed.has(leg.contractId) &&
      (leg.side === "yes" || leg.side === "no") && typeof leg.payoutAmount === "string" && typeof leg.enabled === "boolean")) return parsed;
  } catch { /* use the confirmed-view construction */ }
  return fallback;
}

function labelFor(choice: ConstructionChoice) {
  return choice === "gemini-basket" ? "Gemini basket" : choice === "gemini-single" ? "One Gemini position" : "Arc custom position";
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { address } = useAccount();
  const [thesis, setThesis] = useState<ThesisRevision | null>(null);
  const [family, setFamily] = useState<MarketFamily | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [basket, setBasket] = useState<BasketLeg[]>([]);
  const [choice, setChoice] = useState<ConstructionChoice>("gemini-basket");
  const [mode, setMode] = useState<Mode>("replay");
  const [budget, setBudget] = useState("100");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [quoteCapability, setQuoteCapability] = useState(false);
  const [geminiTradeState, setGeminiTradeState] = useState("unqualified");
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  useModeChange(() => window.location.reload());

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams(window.location.search);
        const requestedChoice = query.get("construction");
        const savedChoice = (() => { try { return sessionStorage.getItem(`thesis-construction:${id}`); } catch { return null; } })();
        const currentChoice = requestedChoice === "gemini-basket" || requestedChoice === "gemini-single" || requestedChoice === "arc-custom"
          ? requestedChoice
          : savedChoice;
        const nextChoice: ConstructionChoice = currentChoice === "gemini-single" || currentChoice === "arc-custom" ? currentChoice : "gemini-basket";
        const nextMode: Mode = executionEnvironmentFromStorage() === "paper" ? "paper" : dataContextFromStorage();
        const savedBudget = query.get("maxPayout") || (() => {
          try { return sessionStorage.getItem(`thesis-build-max:${id}`) || "100"; } catch { return "100"; }
        })();
        const requestedScenario = query.get("scenario");
        const [thesisResult, status] = await Promise.all([
          api<{ thesis: ThesisRevision }>(`/api/theses/${id}`),
          api<{ services: { id: string; state: string }[] }>("/api/status").catch(() => ({ services: [] })),
        ]);
        const topic = await api<{ family: MarketFamily; evidence: EvidenceItem[] }>(`/api/topics/${thesisResult.thesis.topicSlug}?mode=${dataContextFromStorage()}`);
        if (!active) return;
        setMode(nextMode);
        setChoice(nextChoice);
        setBudget(savedBudget);
        setThesis(thesisResult.thesis);
        setFamily(topic.family);
        setEvidence(topic.evidence || []);
        setSelectedScenarioId(topic.family.scenarios.some((scenario) => scenario.id === requestedScenario)
          ? requestedScenario!
          : topic.family.scenarios[0]?.id || "");
        setBasket(readBasket(id, topic.family, defaultBasket(thesisResult.thesis, topic.family, savedBudget)));
        setQuoteCapability(nextMode === "paper" || (nextMode === "live" && status.services.some((service) => service.id === "quotes" && service.state === "available")));
        setGeminiTradeState(status.services.find((service) => service.id === "geminiTrade")?.state || "unqualified");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Review could not be loaded. Your construction is unchanged.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id, loadAttempt]);

  const calculations = useMemo(() => {
    if (!thesis || !family) return null;
    try {
      const maxPayout = parseUsdc(budget);
      if (maxPayout <= 0n || maxPayout > 1_000_000_000_000n) throw new Error("Maximum payout must be greater than zero and at most 1,000,000 USDC.");
      const desired = compileView(family, thesis.template, {
        threshold: thesis.lowerThreshold,
        direction: thesis.direction,
        lower: thesis.lowerThreshold,
        upper: thesis.upperThreshold,
      }, maxPayout);
      const alternatives = buildComparisons(family, desired, {
        lower: thesis.lowerThreshold,
        upper: thesis.upperThreshold,
        threshold: thesis.lowerThreshold,
        direction: thesis.direction,
      });
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
    } catch (cause) {
      return { desired: null, alternatives: null, basketRows: [], basketCost: null, singleCost: null, error: cause instanceof Error ? cause.message : "The selected construction could not be reviewed." };
    }
  }, [thesis, family, basket, budget]);

  const budgetValid = (() => {
    try { return parseUsdc(budget) > 0n; } catch { return false; }
  })();

  async function requestArcQuote() {
    if (!thesis || !family || choice !== "arc-custom" || mode === "replay" || !quoteCapability || !budgetValid) return;
    if (mode === "live" && !address) {
      setActionError("Connect the wallet for the selected live Arc quote. No quote or transaction was created.");
      return;
    }
    setPending(true);
    setActionError("");
    try {
      const result = await api<{ quote: { id: string } }>("/api/quotes", {
        method: "POST",
        body: JSON.stringify({ thesisId: id, mode, maxPayout: budget, ...(address ? { taker: address } : {}) }),
      });
      router.push(`/quotes/${result.quote.id}`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Quote request failed. Your review remains available; retry when ready.");
    } finally {
      setPending(false);
    }
  }

  if (loading) return <p role="status">Loading exact construction terms…</p>;
  if (error) return <Card><p role="alert" className="text-sm text-bad">{error}</p><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => setLoadAttempt((n) => n + 1)} kind="secondary">Retry</Button><Button href={`/theses/${id}/compare`} kind="ghost">Cancel review</Button></div></Card>;
  if (!thesis || !family) return <Empty title="Review unavailable">Return to Compare and retry loading the selected construction.</Empty>;
  if (thesis.status === "draft") return <Card><h1 className="font-serif text-2xl">Confirm your view first</h1><p className="mt-2 text-sm text-muted">The view changed while you were reviewing. Your saved proposal is now a draft and must be reviewed and confirmed in Research before a quote can be requested.</p><div className="mt-3 flex flex-wrap gap-2"><Button href={`/theses/${id}`}>Review draft in Research</Button><Button href={`/theses/${id}/compare`} kind="ghost">Return to Compare</Button></div></Card>;

  const scenarioIndex = family.scenarios.findIndex((scenario) => scenario.id === selectedScenarioId);
  const activeScenarioIndex = scenarioIndex >= 0 ? scenarioIndex : 0;
  const selectedScenario = family.scenarios[activeScenarioIndex];
  const ticket = calculations?.alternatives?.ticket;
  const singleContract = ticket ? family.contracts.find((contract) => contract.id === ticket.sourceContractIds[0]) : undefined;
  const activeLegs = basket.filter((leg) => leg.enabled);
  const selectedRows = choice === "gemini-basket"
    ? calculations?.basketRows || []
    : choice === "gemini-single"
      ? ticket?.rows.map((row) => ({ scenario: family.scenarios.find((scenario) => scenario.id === row.scenarioId)!, payout: row.payout })) || []
      : calculations?.desired?.rows.map((row) => ({ scenario: family.scenarios.find((scenario) => scenario.id === row.scenarioId)!, payout: row.payout })) || [];
  const selectedPayout = selectedRows[activeScenarioIndex]?.payout ?? 0n;
  const desiredPayout = calculations?.desired?.rows[activeScenarioIndex]?.payout ?? 0n;
  const basketMaximum = (calculations?.basketRows || []).reduce((maximum, row) => row.payout > maximum ? row.payout : maximum, 0n);
  const selectedMaximum = choice === "gemini-basket" ? basketMaximum : calculations?.desired?.maxPayout ?? 0n;
  const selectedCost = choice === "gemini-basket"
    ? calculations?.basketCost?.total ?? null
    : choice === "gemini-single"
      ? calculations?.singleCost?.total ?? null
      : null;
  const arcAvailable = (thesis.template === "range" || thesis.template === "outside") && quoteCapability && mode !== "replay";
  const selectedContracts = choice === "gemini-basket"
    ? activeLegs.map((leg) => ({ contract: family.contracts.find((item) => item.id === leg.contractId), side: leg.side, payout: leg.payoutAmount }))
    : choice === "gemini-single" && singleContract
      ? [{ contract: singleContract, side: thesis.template === "range" ? "yes" : thesis.direction || "yes", payout: budget }]
      : [];
  const quoteAllowed = choice === "arc-custom" && arcAvailable;
  const geminiSingleAllowed = choice === "gemini-single" && mode === "live" && geminiTradeState === "available" && Boolean(singleContract);
  const quoteAvailability = mode === "paper"
    ? "Paper quote path is available. Requesting it creates a quote only; accepting it is a separate explicit action."
    : mode === "live" && quoteCapability
      ? "A firm quote can be requested after connecting the wallet; the request does not accept or fund the offer."
      : "No qualified quote service is available in this mode. Return to Compare or switch to Paper.";
  const sourceIds = selectedContracts.flatMap(({ contract }) => contract ? [contract.id] : []);
  const quoteHref = `/theses/${id}/compare?maxPayout=${encodeURIComponent(budget)}&scenario=${encodeURIComponent(selectedScenarioId)}`;
  const evidenceItems = evidence.length ? evidence : evidenceForSlug(family.slug, family.mode);

  return (
    <div className="screen-workspace space-y-4">
      <header className="workspace-header"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted">{family.title} · {mode === "replay" ? "illustrative replay" : mode === "paper" ? "paper simulation" : "live data"}</p><h1 className="workspace-title screen-heading">Review {labelFor(choice)}</h1><p className="mt-2 text-sm text-muted">Review exact contracts, costs, execution details, and settlement rules before deciding.</p></div><span className="status-pill status-pill--good">View confirmed · revision {thesis.revision}</span></div></header>
      <ThesisWorkspaceTabs thesisId={id} current="Compare" />
      <p className="rounded-lg border border-line bg-white p-3 text-sm text-muted">Review is read-only. Opening it does not create a quote, order, or position. Cancel returns to the same comparison.</p>
      {calculations?.error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{calculations.error}</p> : null}
      <div className="workspace-layout">
        <div className="space-y-4">
          <Card>
            <h2 className="font-serif text-xl">What you selected</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Construction</dt><dd>{labelFor(choice)}</dd></div>
              <div><dt className="text-xs text-muted">Venue</dt><dd>{choice === "arc-custom" ? "Arc custom position" : "Gemini contracts"}</dd></div>
              <div><dt className="text-xs text-muted">Environment</dt><dd>{mode === "replay" ? "Illustrative replay · no execution" : mode === "paper" ? "Paper simulation" : "Live data"}</dd></div>
              <div><dt className="text-xs text-muted">Confirmed view</dt><dd>{thesis.template} · revision {thesis.revision}</dd></div>
              <div><dt className="text-xs text-muted">Maximum gross payout</dt><dd>{formatUsdc(selectedMaximum)} USDC</dd></div>
              <div><dt className="text-xs text-muted">Maximum loss</dt><dd>{selectedCost == null ? "Unknown until valid quote" : `~${formatUsdc(selectedCost)} USDC before fees; reference estimate only`}</dd></div>
              <div><dt className="text-xs text-muted">Fees</dt><dd>{choice === "arc-custom" ? "Shown on exact quote before acceptance" : "Venue fees and slippage are not included in reference costs"}</dd></div>
              <div><dt className="text-xs text-muted">Execution shape</dt><dd>{choice === "gemini-basket" ? `${activeLegs.length} independent order(s); may fill separately` : choice === "gemini-single" ? "One Gemini contract position" : "One custom payout schedule"}</dd></div>
            </dl>
            {choice === "arc-custom" ? <p className="mt-3 text-sm text-muted">{quoteAvailability}</p> : null}
          </Card>

          <Card>
            <h2 className="font-serif text-xl">Exact contracts and settlement rules</h2>
            {choice === "arc-custom" ? <p className="mt-2 text-sm text-muted">This construction has no Gemini contract legs. The payout schedule below follows the confirmed thesis and its selected scenario rules.</p> : null}
            {selectedContracts.length ? (
              <ul className="mt-3 space-y-3">
                {selectedContracts.map(({ contract, side, payout }, index) => contract ? (
                  <li key={`${contract.id}-${index}`} className="rounded-lg border border-line p-3">
                    <p className="font-medium">{contract.label}</p>
                    <p className="mt-1 text-sm text-muted">{contract.instrumentSymbol || contract.id} · {side.toUpperCase()} · target payout {payout} USDC</p>
                    <p className="mt-1 text-xs text-muted">Status: {contract.status.replaceAll("_", " ")} · expiry {contract.expiryDate ? new Date(contract.expiryDate).toLocaleString() : "not supplied"}</p>
                    {contract.description ? <p className="mt-2 whitespace-pre-wrap text-sm">{contract.description}</p> : <p className="mt-2 text-xs text-muted">Contract-level resolution wording was not included in this response.</p>}
                    {contract.strike ? <p className="mt-1 text-xs text-muted">Gemini strike: {contract.strike.type || "type not listed"} · {contract.strike.value || "value not available"}{contract.strike.availableAt ? ` · available ${new Date(contract.strike.availableAt).toLocaleString()}` : ""}</p> : null}
                    {contract.source ? <p className="mt-1 text-xs text-muted">Settlement source: {contract.source}</p> : null}
                    {contract.termsUrl ? <a className="mt-2 inline-block text-sm text-action underline" href={contract.termsUrl} target="_blank" rel="noreferrer">Open Gemini contract rules</a> : <p className="mt-2 text-xs text-muted">Gemini did not provide a separate contract rules link.</p>}
                  </li>
                ) : <li key={index} className="rounded-lg border border-line p-3 text-sm text-bad">A selected contract is no longer present. Return to Compare and reload the market.</li>)}
              </ul>
            ) : choice === "gemini-single" ? <p className="mt-2 text-sm text-muted">No supported single Gemini ticket matches this view. Return to Compare to choose another construction.</p> : null}
            {family.sourceEvent.sourceUrl ? <a className="mt-3 inline-block text-sm text-action underline" href={family.sourceEvent.sourceUrl} target="_blank" rel="noreferrer">Open event source and settlement details</a> : <p className="mt-3 text-xs text-muted">Source event rules link was not supplied.</p>}
            {sourceIds.length ? <p className="mt-2 break-all text-xs text-muted">Contract IDs: {sourceIds.join(", ")}</p> : null}
          </Card>

          <Card>
            <h2 className="font-serif text-xl">Payout by settlement scenario</h2>
            <p className="mt-1 text-sm text-muted">Gross payout only. Compare it with the confirmed view; a reference price is not an executable cost.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead><tr><th className="border-b border-line py-2 pr-3">Scenario</th><th className="border-b border-line py-2 pr-3">Selected payout</th><th className="border-b border-line py-2">Confirmed view</th></tr></thead>
                <tbody>{family.scenarios.map((scenario, index) => {
                  const payout = selectedRows[index]?.payout ?? 0n;
                  const target = calculations?.desired?.rows[index]?.payout ?? 0n;
                  return <tr key={scenario.id} className={scenario.id === selectedScenarioId ? "bg-[#E9EEFF]" : ""}>
                    <td className="border-b border-line py-2 pr-3"><button type="button" className="text-left underline decoration-dotted" aria-pressed={scenario.id === selectedScenarioId} onClick={() => setSelectedScenarioId(scenario.id)}>{scenario.label}</button></td>
                    <td className="border-b border-line py-2 pr-3">{formatUsdcFixed(payout)} USDC</td>
                    <td className="border-b border-line py-2">{formatUsdcFixed(target)} USDC · {payout === target ? "matches" : "differs"}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {selectedScenario ? <p className="mt-3 rounded-lg bg-[#F4F2ED] p-3 text-sm"><span className="text-xs text-muted">Selected scenario · {selectedScenario.label}</span><br />{formatUsdcFixed(selectedPayout)} USDC selected · {formatUsdcFixed(desiredPayout)} USDC confirmed view</p> : null}
          </Card>

          {actionError ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{actionError}</p> : null}
          <Card className="space-y-3">
            <h2 className="font-serif text-lg">Next action</h2>
            {choice === "arc-custom" ? (
              quoteAllowed ? <>
                <p className="text-sm text-muted">Continue to an exact quote. The next page shows premium, fee, payout schedule, expiry, and environment. No position is created until you explicitly accept there.</p>
                <Button onClick={() => void requestArcQuote()} disabled={pending || !budgetValid}>{pending ? "Requesting quote…" : mode === "paper" ? "Request paper quote" : "Request Arc quote"}</Button>
                {mode === "live" && !address ? <p className="text-xs text-muted">Connect a wallet before requesting a live quote. You can still cancel review.</p> : null}
              </> : <p className="text-sm text-muted">Arc custom quoting is unavailable for the selected mode or view. Switch to Paper or return to Compare to choose a supported construction.</p>
            ) : choice === "gemini-single" ? (
              geminiSingleAllowed && singleContract ? <>
                <p className="text-sm text-muted">Gemini order review opens with this contract selected. You must enter the order size and limit price, review Gemini's current terms, and explicitly submit. This review has not sent an order.</p>
                <Button href={`/gemini/${encodeURIComponent(family.sourceEvent.ticker)}?mode=live&thesisId=${encodeURIComponent(id)}&symbol=${encodeURIComponent(singleContract.instrumentSymbol)}&outcome=${thesis.template === "range" ? "yes" : thesis.direction || "yes"}`}>Continue to Gemini order review</Button>
              </> : <p className="text-sm text-muted">Native Gemini order submission is unavailable in this mode or has not passed sandbox qualification. Research and this review remain available; no order was submitted.</p>
            ) : <p className="text-sm text-muted">The basket is {activeLegs.length} separate Gemini order(s). Coordinated submission and partial-fill recovery are not qualified, so this basket cannot be submitted as one action. You can return to Build, or select a supported single-contract or Arc construction in Compare.</p>}
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              {choice === "gemini-basket" ? <Button href={`/theses/${id}/build`} kind="secondary">Return to Build</Button> : null}
              <Button href={quoteHref} kind="ghost">Cancel review and return to Compare</Button>
            </div>
          </Card>

          <VoicePanel
            slug={family.slug}
            family={family}
            evidence={evidenceItems}
            thesis={thesis}
            onThesisChange={(updated) => { setThesis(updated); setActionError("Your view was saved as a draft. Return to Research and confirm it before requesting a quote."); }}
            context="compare"
            maxPayout={budget}
            title="Talk through this construction"
          />
        </div>
        <aside className="view-rail">
          <ThesisViewPanel
            thesis={thesis}
            family={family}
            selectedScenarioId={selectedScenario?.id}
            onScenarioChange={setSelectedScenarioId}
            scenarioOutcome={`${formatUsdcFixed(selectedPayout)} USDC selected · ${payoutMatches(selectedPayout, desiredPayout) ? "matches" : "differs from"} your confirmed view`}
            scenarioOutcomeLabel="Reviewed construction · selected scenario"
          />
          <Card><h2 className="font-serif text-lg">Your confirmed view stays unchanged</h2><p className="mt-2 text-sm text-muted">Reviewing or selecting a construction does not edit your thesis or any position you already hold.</p></Card>
        </aside>
      </div>
    </div>
  );
}

function payoutMatches(selected: bigint, desired: bigint) {
  return selected === desired;
}
