"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, dataContextFromStorage } from "@/lib/client";
import { flattenEvents, geminiRichText, type GeminiEvent } from "@/lib/gemini/types";
import { Button, Card, Empty, Field, inputCls } from "@/components/ui";
import { formatTime } from "@/lib/format";
import type { ThesisRevision } from "@/lib/domain/types";
import { useModeChange } from "@/lib/use-mode-change";

type GeminiDetail = {
  event: GeminiEvent;
  mode: "live" | "replay";
  source: string;
  fetchedAt: string;
  payloadHash: string;
  compatibleTopicSlug: string | null;
  compatibleTopics?: { slug: string; contractId?: string; contractLabel?: string }[];
};

type GeminiConnectionStatus = {
  configured: boolean;
  connection: null | { canTrade: boolean; canReadOrders: boolean };
};
type TradeCapability = { state: string; note: string };

type TermsResponse = {
  status: { hasAcceptedLatest: boolean; latestVersion?: number };
  terms: { content?: string; termsType?: string; version?: number; updatedAt?: string } | null;
};

type SubmittedIntent = {
  status: string;
  venueOrderId: string | null;
  symbol: string;
  side: string;
  outcome: string;
  quantity: string;
  price: string;
  message: string;
};

function contractsFor(event: GeminiEvent) {
  const seen = new Set<string>();
  return flattenEvents([event]).flatMap((child) =>
    (child.contracts ?? []).flatMap((contract) => {
      if (seen.has(contract.id)) return [];
      seen.add(contract.id);
      return [{ ...contract, eventTitle: child.title }];
    }),
  );
}

export default function GeminiEventPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const [data, setData] = useState<GeminiDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [connection, setConnection] = useState<GeminiConnectionStatus | null>(null);
  const [tradeCapability, setTradeCapability] = useState<TradeCapability | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [outcome, setOutcome] = useState<"yes" | "no">("yes");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [terms, setTerms] = useState<TermsResponse | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderNotice, setOrderNotice] = useState("");
  const [intentId, setIntentId] = useState("");
  const [submittedIntent, setSubmittedIntent] = useState<SubmittedIntent | null>(null);
  const [linkedThesis, setLinkedThesis] = useState<ThesisRevision | null>(null);
  const [thesisLinkError, setThesisLinkError] = useState("");

  useModeChange(() => {
    const nextMode = dataContextFromStorage();
    const url = new URL(window.location.href);
    url.searchParams.set("mode", nextMode);
    window.history.replaceState({}, "", url);
    window.location.reload();
  });

  useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    const mode = requestedMode === "live"
      ? "live"
      : requestedMode === "replay"
        ? "replay"
        : dataContextFromStorage();
    setLoading(true);
    setError("");
    api<GeminiDetail>(`/api/gemini/events/${encodeURIComponent(ticker)}?mode=${mode}`)
      .then((response) => {
        setData(response);
        const markets = contractsFor(response.event).filter((contract) => contract.instrumentSymbol?.startsWith("GEMI-"));
        const query = new URLSearchParams(window.location.search);
        const requestedSymbol = query.get("symbol");
        const requestedOutcome = query.get("outcome");
        const selected = markets.find((contract) => contract.instrumentSymbol === requestedSymbol) || markets[0];
        if (selected) {
          const selectedOutcome = requestedOutcome === "no" ? "no" : "yes";
          setSelectedSymbol(selected.instrumentSymbol || selected.ticker || "");
          setOutcome(selectedOutcome);
          setQuantity(selected.quantityMinimum || "");
          setPrice(selected.prices?.buy?.[selectedOutcome] || selected.priceMinimum || "");
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Event details could not be loaded"))
      .finally(() => setLoading(false));
  }, [ticker, retryCount]);

  useEffect(() => {
    let active = true;
    const requestedThesisId = new URLSearchParams(window.location.search).get("thesisId");
    if (!requestedThesisId) return;
    api<{ thesis: ThesisRevision }>(`/api/theses/${encodeURIComponent(requestedThesisId)}`)
      .then(({ thesis }) => { if (active) setLinkedThesis(thesis); })
      .catch(() => { if (active) setThesisLinkError("The linked thesis is unavailable for this account. This market can still be inspected without that link."); });
    return () => { active = false; };
  }, [ticker]);

  useEffect(() => {
    api<GeminiConnectionStatus>("/api/gemini/oauth").then(setConnection).catch(() => setConnection(null));
    api<{ services: { id: string; state: string; note: string }[] }>("/api/status")
      .then(({ services }) => {
        const service = services.find((item) => item.id === "geminiTrade");
        setTradeCapability(service ? { state: service.state, note: service.note } : { state: "unqualified", note: "Native Gemini orders are unavailable until sandbox behavior is verified." });
      })
      .catch(() => setTradeCapability({ state: "unqualified", note: "Native Gemini order qualification could not be checked. Order submission remains disabled." }));
  }, []);

  if (loading) return <p className="text-sm text-muted">Loading Gemini event…</p>;
  if (error) return (
    <Empty title="Event unavailable">
      <p role="alert">{error}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setRetryCount((current) => current + 1)}>Retry</Button>
        <Button href="/gemini" kind="ghost">Return to Gemini markets</Button>
      </div>
    </Empty>
  );
  if (!data) return <Empty title="Event unavailable">Gemini did not return an event.</Empty>;

  const { event } = data;
  const contracts = contractsFor(event);
  const description = geminiRichText(event.description);
  const sourceUrl = event.termsLink ?? null;
  const resolved = event.status === "settled" || contracts.some((contract) => contract.resolutionSide != null);
  const tradeableContracts = contracts.filter((contract) => contract.instrumentSymbol?.startsWith("GEMI-"));
  const activeContracts = tradeableContracts.filter((contract) => contract.status?.toLowerCase() === "active");
  const selectedContract = activeContracts.find((contract) => contract.instrumentSymbol === selectedSymbol);
  const canTradeOnGemini = data.mode === "live" && event.status.toLowerCase() === "active" &&
    tradeCapability?.state === "available" && Boolean(connection?.connection?.canTrade) && selectedContract?.status?.toLowerCase() === "active";
  const unresolvedIntent = submittedIntent?.status === "unknown" || submittedIntent?.status === "submitting";

  async function reviewOrder() {
    setOrderError("");
    setOrderNotice("");
    if (!selectedContract || !quantity || !price) {
      setOrderError("Choose a contract and enter its quantity and limit price.");
      return;
    }
    try {
      const response = await api<TermsResponse>("/api/gemini/terms");
      setTerms(response);
      setAcceptTerms(false);
      setReviewing(response.status.hasAcceptedLatest);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Gemini terms could not be checked");
    }
  }

  async function acceptLatestTerms() {
    setOrderError("");
    setOrderNotice("");
    try {
      await api("/api/gemini/terms", {
        method: "POST",
        body: JSON.stringify({ reviewedVersion: terms?.terms?.version }),
      });
      setTerms((current) => current ? { ...current, status: { ...current.status, hasAcceptedLatest: true } } : current);
      setOrderNotice("Gemini confirmed terms acceptance. Review the order again before submitting it.");
      setAcceptTerms(false);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Gemini did not confirm terms acceptance");
    }
  }

  async function placeOrder() {
    if (!selectedContract || !canTradeOnGemini) return;
    setPlacing(true);
    setOrderError("");
    setOrderNotice("");
    let currentIntentId = intentId;
    if (!currentIntentId) {
      currentIntentId = window.crypto.randomUUID();
      setIntentId(currentIntentId);
    }
    try {
      const result = await api<{ intent: SubmittedIntent | null; message: string }>("/api/gemini/orders", {
        method: "POST",
        body: JSON.stringify({
          action: "place",
          intentId: currentIntentId,
          ...(linkedThesis ? { thesisId: linkedThesis.id } : {}),
          ticker: event.ticker,
          symbol: selectedSymbol,
          side,
          outcome,
          quantity,
          price,
        }),
      });
      if (result.intent) setSubmittedIntent(result.intent);
      setOrderNotice(result.message);
      setReviewing(false);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Gemini order submission could not be confirmed");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted"><Link href="/gemini">Gemini markets</Link> / {event.ticker}</p>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{event.category || "Uncategorized"} · {event.status.replaceAll("_", " ")}</p>
        <h1 className="font-serif text-3xl">{event.title}</h1>
        <p className="mt-2 text-sm text-muted">{event.ticker} · {event.type || "Prediction market"} · {data.mode === "live" ? "Live Gemini data" : "Recorded replay"}</p>
      </div>

      {description ? <Card><h2 className="font-serif text-xl">Market question and rules</h2><p className="mt-2 whitespace-pre-wrap text-sm">{description}</p></Card> : null}
      {linkedThesis ? <Card><h2 className="font-serif text-lg">From your thesis</h2><p className="mt-1 text-sm text-muted">This market was opened from <Link className="text-action underline" href={`/theses/${linkedThesis.id}`}>{linkedThesis.topicSlug.replaceAll("-", " ")}</Link>. If a Gemini order is later submitted, its local order record will retain this thesis link.</p></Card> : null}
      {thesisLinkError ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{thesisLinkError}</p> : null}

      <Card>
        <h2 className="font-serif text-xl">Event details</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Starts / effective</dt><dd>{formatTime(event.effectiveDate || event.startTime)}</dd></div>
          <div><dt className="text-xs text-muted">Expiry</dt><dd>{formatTime(event.expiryDate)}</dd></div>
          <div><dt className="text-xs text-muted">Result published</dt><dd>{formatTime(event.resolvedAt)}</dd></div>
          <div><dt className="text-xs text-muted">Source</dt><dd>{event.sourceDetails?.agency || event.source || "Not listed"}{event.sourceDetails?.index ? ` · ${event.sourceDetails.index}` : ""}</dd></div>
          <div><dt className="text-xs text-muted">Trading volume</dt><dd>{event.volume || "Not listed"}</dd></div>
          <div><dt className="text-xs text-muted">Liquidity</dt><dd>{event.liquidity || "Not listed"}</dd></div>
        </dl>
        {sourceUrl ? <a className="mt-4 inline-block text-sm text-action underline" href={sourceUrl} target="_blank" rel="noreferrer">Open Gemini event-level terms</a> : <p className="mt-4 text-xs text-muted">Gemini did not include an event-level terms link. Contract-specific links, when supplied, are shown with each contract.</p>}
      </Card>

      {resolved ? (
        <Card>
          <h2 className="font-serif text-xl">Gemini resolution</h2>
          <p className="mt-1 text-sm text-muted">The outcome below is shown only when Gemini provides a settled status or resolution field.</p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {event.settlement?.value != null ? <div><dt className="text-xs text-muted">Event settlement value</dt><dd>{event.settlement.value}</dd></div> : null}
            {contracts.filter((contract) => contract.resolutionSide || contract.settlementValue).map((contract) => (
              <div key={contract.id}>
                <dt className="text-xs text-muted">{contract.label}</dt>
                <dd>{contract.resolutionSide ? `Resolved ${contract.resolutionSide.toUpperCase()}` : "Resolved"}{contract.settlementValue ? ` · value ${contract.settlementValue}` : ""}{contract.resolvedAt ? ` · ${formatTime(contract.resolvedAt)}` : ""}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      <Card>
        <h2 className="font-serif text-xl">Contracts</h2>
        {contracts.length === 0 ? <p className="mt-2 text-sm text-muted">Gemini did not include contracts in this event response.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead><tr>
                <th className="border-b border-line py-2 pr-3">Contract</th>
                <th className="border-b border-line py-2 pr-3">Instrument</th>
                <th className="border-b border-line py-2 pr-3">Status</th>
                <th className="border-b border-line py-2 pr-3">YES bid / ask</th>
                <th className="border-b border-line py-2 pr-3">NO bid / ask</th>
                <th className="border-b border-line py-2 pr-3">Last trade</th>
                <th className="border-b border-line py-2">Outcome</th>
              </tr></thead>
              <tbody>{contracts.map((contract) => (
                <tr key={contract.id}>
                  <td className="border-b border-line py-2 pr-3">
                    {contract.label}
                    <span className="block text-xs text-muted">{contract.eventTitle}</span>
                    {geminiRichText(contract.description) ? (
                      <span className="mt-1 block max-w-lg whitespace-normal text-xs text-muted">{geminiRichText(contract.description)}</span>
                    ) : <span className="mt-1 block text-xs text-muted">Contract wording not included in this response.</span>}
                    {contract.strike ? (
                      <span className="mt-1 block text-xs text-muted">
                        Strike: {contract.strike.type || "type not listed"} · {contract.strike.value || "value not available"}
                        {contract.strike.availableAt ? ` · available ${formatTime(contract.strike.availableAt)}` : ""}
                      </span>
                    ) : null}
                    {contract.source ? <span className="mt-1 block text-xs text-muted">Settlement source: {contract.source}</span> : null}
                    {contract.termsAndConditionsUrl ? (
                      <a className="mt-1 inline-block text-xs text-action underline" href={contract.termsAndConditionsUrl} target="_blank" rel="noreferrer">Exact contract rules</a>
                    ) : <span className="mt-1 block text-xs text-muted">No contract-specific rules link supplied.</span>}
                  </td>
                  <td className="border-b border-line py-2 pr-3 font-mono text-xs">{contract.instrumentSymbol || contract.ticker || "Not listed"}</td>
                  <td className="border-b border-line py-2 pr-3">{contract.status || event.status}</td>
                  <td className="whitespace-nowrap border-b border-line py-2 pr-3">{contract.prices?.sell?.yes ?? contract.prices?.bestBid ?? "—"} / {contract.prices?.buy?.yes ?? contract.prices?.bestAsk ?? "—"}</td>
                  <td className="whitespace-nowrap border-b border-line py-2 pr-3">{contract.prices?.sell?.no ?? "—"} / {contract.prices?.buy?.no ?? "—"}</td>
                  <td className="border-b border-line py-2 pr-3">{contract.prices?.lastTradePrice || "—"}</td>
                  <td className="border-b border-line py-2">{contract.resolutionSide ? contract.resolutionSide.toUpperCase() : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Displayed prices are Gemini reference data, not firm Thesis quotes and not proof of executable liquidity.</p>
      </Card>

      {data.mode === "replay" ? (
        <Card>
          <h2 className="font-serif text-xl">Native Gemini order</h2>
          <p className="mt-2 text-sm text-muted">Order entry is disabled in Replay. Switch to Live data and inspect a current Gemini event before connecting an account.</p>
        </Card>
      ) : null}
      {data.mode === "live" && tradeCapability && tradeCapability.state !== "available" ? (
        <Card>
          <h2 className="font-serif text-xl">Gemini live data · native orders gated</h2>
          <p className="mt-2 text-sm text-muted">{tradeCapability.note}</p>
        </Card>
      ) : null}
      {data.mode === "live" && tradeCapability?.state === "available" && !connection?.connection ? (
        <Card>
          <h2 className="font-serif text-xl">Connect Gemini to trade</h2>
          <p className="mt-2 text-sm text-muted">A live market listing does not connect your Gemini account or authorize an order.</p>
          <div className="mt-3"><Button href="/settings/connections">Connection settings</Button></div>
        </Card>
      ) : null}
      {data.mode === "live" && tradeCapability?.state === "available" && connection?.connection && !connection.connection.canTrade ? (
        <Card>
          <h2 className="font-serif text-xl">Trading permission required</h2>
          <p className="mt-2 text-sm text-muted">This account connection is read-only. Add Gemini's separate <code>orders:create</code> permission to submit a native order.</p>
          <div className="mt-3"><Button href="/settings/connections">Review permissions</Button></div>
        </Card>
      ) : null}
      {data.mode === "live" && connection?.connection?.canTrade && event.status.toLowerCase() !== "active" ? (
        <Card>
          <h2 className="font-serif text-xl">Market is not active</h2>
          <p className="mt-2 text-sm text-muted">Gemini currently lists this event as {event.status}. Order entry is unavailable.</p>
        </Card>
      ) : null}
      {data.mode === "live" && connection?.connection?.canTrade && event.status.toLowerCase() === "active" && activeContracts.length === 0 ? (
        <Card><p className="text-sm text-muted">No orderable contract instrument was returned for this event.</p></Card>
      ) : null}

      {canTradeOnGemini && selectedContract && !submittedIntent ? (
        <Card className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Gemini native order</p>
            <h2 className="font-serif text-xl">Place a limit order</h2>
            <p className="mt-1 text-sm text-muted">This creates a position on Gemini, separate from any Arc Thesis quote. Gemini may partially fill or reject it.</p>
          </div>
          <Field label="Contract">
            <select className={inputCls()} value={selectedSymbol} onChange={(change) => {
              const next = activeContracts.find((contract) => contract.instrumentSymbol === change.target.value);
              setSelectedSymbol(change.target.value);
              setQuantity(next?.quantityMinimum || "");
              setPrice(next?.prices?.buy?.[outcome] || next?.priceMinimum || "");
            }}>
              {activeContracts.map((contract) => <option key={contract.id} value={contract.instrumentSymbol}>{contract.label} · {contract.instrumentSymbol}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Side">
              <select className={inputCls()} value={side} onChange={(change) => {
                const next = change.target.value as "buy" | "sell";
                setSide(next);
                const reference = selectedContract.prices?.[next]?.[outcome];
                if (reference) setPrice(reference);
              }}>
                <option value="buy">Buy</option><option value="sell">Sell</option>
              </select>
            </Field>
            <Field label="Outcome">
              <select className={inputCls()} value={outcome} onChange={(change) => {
                const next = change.target.value as "yes" | "no";
                setOutcome(next);
                const reference = selectedContract.prices?.[side]?.[next];
                if (reference) setPrice(reference);
              }}>
                <option value="yes">Yes</option><option value="no">No</option>
              </select>
            </Field>
            <Field label="Quantity" hint={`Minimum ${selectedContract.quantityMinimum || "not listed"} · increment ${selectedContract.quantityIncrement || "not listed"}`}>
              <input className={inputCls()} type="number" min={selectedContract.quantityMinimum || undefined} step={selectedContract.quantityIncrement || "any"} value={quantity} onChange={(change) => setQuantity(change.target.value)} />
            </Field>
            <Field label="Limit price per contract" hint={`Minimum ${selectedContract.priceMinimum || "not listed"} · increment ${selectedContract.priceIncrement || "not listed"} · must be between 0 and 1`}>
              <input className={inputCls()} type="number" min={selectedContract.priceMinimum || undefined} step={selectedContract.priceIncrement || "any"} value={price} onChange={(change) => setPrice(change.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-muted">Reference quotes may be stale and do not promise a fill. Fees and account-specific collateral are determined by Gemini. The server rechecks event status and the contract's price and quantity increments before sending.</p>
          {orderError ? <p role="alert" className="text-sm text-bad">{orderError}</p> : null}
          {orderNotice ? <p role="status" className="text-sm text-muted">{orderNotice}</p> : null}
          <Button onClick={reviewOrder}>Review limit order</Button>
        </Card>
      ) : null}

      {terms && !terms.status.hasAcceptedLatest && terms.terms ? (
        <Card className="space-y-3">
          <h2 className="font-serif text-xl">Review Gemini terms</h2>
          <p className="text-xs text-muted">{terms.terms.termsType || "Prediction Markets"} · version {terms.terms.version ?? terms.status.latestVersion ?? "unknown"}{terms.terms.updatedAt ? ` · updated ${formatTime(terms.terms.updatedAt)}` : ""}</p>
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-white p-3 text-sm">{terms.terms.content || "Gemini did not return the terms text."}</div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={acceptTerms} onChange={(change) => setAcceptTerms(change.target.checked)} />
            <span>I reviewed these terms and want Gemini to record my acceptance.</span>
          </label>
          <Button onClick={acceptLatestTerms} disabled={!acceptTerms}>Accept Gemini terms</Button>
        </Card>
      ) : null}

      {reviewing && selectedContract && !submittedIntent ? (
        <Card className="space-y-3">
          <h2 className="font-serif text-xl">Confirm Gemini order</h2>
          <p className="text-sm">{side.toUpperCase()} {outcome.toUpperCase()} · {quantity} contracts · limit {price} per contract</p>
          <p className="break-all text-xs text-muted">{selectedContract.instrumentSymbol} · good til canceled</p>
          <p className="text-sm text-muted">This sends one limit order to Gemini after a final market and terms check. It may remain open, fill partially, or fail. No replacement or automatic retry will be sent.</p>
          {orderError ? <p role="alert" className="text-sm text-bad">{orderError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button kind="ghost" onClick={() => setReviewing(false)} disabled={placing}>Back to edit</Button>
            <Button onClick={placeOrder} disabled={placing}>{placing ? "Submitting…" : "Place Gemini limit order"}</Button>
          </div>
        </Card>
      ) : null}

      {submittedIntent ? (
        <Card>
          <h2 className="font-serif text-xl">Gemini order intent</h2>
          <p className="mt-2 text-sm">{submittedIntent.status === "unknown" || submittedIntent.status === "submitting" ? "Submission status unknown" : `Status: ${submittedIntent.status}`}</p>
          <p className="mt-1 text-sm text-muted">{submittedIntent.message}</p>
          {submittedIntent.venueOrderId ? <p className="mt-2 font-mono text-xs">Gemini order #{submittedIntent.venueOrderId}</p> : null}
          <div className="mt-3">{unresolvedIntent ? <Button href="/orders">Inspect Native orders</Button> : <Button kind="ghost" onClick={() => { setSubmittedIntent(null); setIntentId(""); setReviewing(false); setOrderNotice(""); }}>Create another order</Button>}</div>
        </Card>
      ) : null}

      <Card>
        <h2 className="font-serif text-xl">Data provenance</h2>
        <p className="mt-2 break-all text-xs text-muted">{data.source} · retrieved {formatTime(data.fetchedAt)} · SHA-256 {data.payloadHash}</p>
        <p className="mt-2 text-sm text-muted">Resolution terms, finality, and corrections must be qualified before this event can back a Thesis quote or payout.</p>
      </Card>

      {data.compatibleTopics?.length ? (
        <Card>
          <h2 className="font-serif text-xl">Research a contract</h2>
          <p className="mt-1 text-sm text-muted">Each contract opens its own YES/NO view. Related thresholds stay separate until their settlement rules are verified together.</p>
          <div className="mt-3 grid gap-2">
            {data.compatibleTopics.map((topic) => <Button key={topic.slug} href={`/topics/${topic.slug}`} kind="secondary">Research · {topic.contractLabel || topic.contractId || "Gemini contract"}</Button>)}
          </div>
        </Card>
      ) : <p className="text-xs text-muted">No contract in this event has a current, documented instrument symbol for a Thesis view.</p>}
    </div>
  );
}
