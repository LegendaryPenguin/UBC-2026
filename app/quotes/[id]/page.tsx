"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, dataContextFromStorage, executionEnvironmentFromStorage } from "@/lib/client";
import type { PositionRecord, SignedQuote } from "@/lib/domain/types";
import { formatUsdc } from "@/lib/format";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { Icon } from "@/components/thesis";
import { erc20Abi, escrowAbi } from "@/lib/escrow/abi";
import { arcTestnet, publicEscrow, publicUsdc } from "@/lib/chain";
import { useAccount, usePublicClient, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

type QuoteDetail = SignedQuote & { thesisId?: string; mode?: string };
type RecordedPosition = Pick<PositionRecord, "id" | "thesisId" | "premium" | "fee">;

function readAttempt(key: string) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function rememberAttempt(key: string, value: string | null) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch { /* The current page can still reconcile the attempt. */ }
}

async function recordedPosition(quoteId: string) {
  const { positions } = await api<{ positions: PositionRecord[] }>("/api/positions", { cache: "no-store" });
  return positions.find((item) => item.quoteId === quoteId) ?? null;
}

export default function QuotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { address, chainId } = useAccount();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [error, setError] = useState("");
  const [manualHash, setManualHash] = useState("");
  const [acceptHash, setAcceptHash] = useState<`0x${string}`>();
  const [paperAccepting, setPaperAccepting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [step, setStep] = useState("");
  const [position, setPosition] = useState<RecordedPosition | null>(null);
  const [now, setNow] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [paperUnknown, setPaperUnknown] = useState(false);
  const [freshTerms, setFreshTerms] = useState(false);
  const operation = useRef(false);
  const paperKey = `thesis:paper-accept:${id}`;
  const arcKey = `thesis:arc-accept:${id}`;
  const syncStarted = useRef<string | null>(null);
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const { data: acceptanceReceipt, isFetching: waiting, isError: receiptError, error: waitError, refetch: retryReceipt } =
    useWaitForTransactionReceipt({ hash: acceptHash, chainId: arcTestnet.id });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setQuote(null);
    setPosition(null);
    setAcceptHash(undefined);
    setSyncFailed(false);
    setPaperUnknown(false);
    setStep("");
    setError("");
    syncStarted.current = null;
    setNow(Date.now());
    setFreshTerms(new URLSearchParams(window.location.search).get("refreshed") === "1");
    api<{ quote: QuoteDetail }>(`/api/quotes/${id}`, { cache: "no-store", signal: controller.signal })
      .then(async ({ quote: current }) => {
        if (!active) return;
        const priorPaper = current.signature === "0x" && readAttempt(paperKey) === "pending";
        const priorHash = current.signature !== "0x" ? readAttempt(arcKey) : null;
        setPaperUnknown(priorPaper);
        setQuote(current);
        if (priorHash && /^0x[a-fA-F0-9]{64}$/.test(priorHash) && current.status !== "accepted") {
          setAcceptHash(priorHash as `0x${string}`);
          setStep("Checking the previously submitted Arc transaction.");
        }
        if (current.status !== "accepted" && !priorPaper) return;
        setChecking(true);
        try {
          const found = await recordedPosition(current.id);
          if (!active) return;
          if (found) {
            setPosition(found);
            setPaperUnknown(false);
            rememberAttempt(paperKey, null);
            rememberAttempt(arcKey, null);
          } else if (priorPaper && current.status === "expired") {
            setPaperUnknown(false);
            rememberAttempt(paperKey, null);
          }
        } catch {
          if (active) setError("The position status could not be loaded. Check again before taking another action.");
        } finally {
          if (active) setChecking(false);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Quote could not be loaded");
      });
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [id, loadAttempt, paperKey, arcKey]);

  async function paperAccept() {
    if (!quote || operation.current || quote.signature !== "0x" ||
      executionEnvironmentFromStorage() !== "paper" ||
      (!paperUnknown && (quote.status !== "available" || quote.deadline * 1000 <= Date.now()))) return;
    operation.current = true;
    const key = `thesis:paper-accept:${quote.id}`;
    rememberAttempt(key, "pending");
    setPaperAccepting(true);
    setError("");
    try {
      const result = await api<{ position: RecordedPosition }>("/api/positions", {
        method: "POST",
        body: JSON.stringify({ quoteId: quote.id, mode: "paper" }),
      });
      setPosition(result.position);
      setPaperUnknown(false);
      rememberAttempt(key, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paper acceptance failed.");
      setPaperUnknown(true);
    } finally {
      operation.current = false;
      setPaperAccepting(false);
    }
  }

  async function liveAccept() {
    if (operation.current || acceptHash || position) return;
    if (!quote || !address) {
      setError("Connect a wallet on Arc testnet first.");
      return;
    }
    setError("");
    setSyncFailed(false);
    if (chainId !== arcTestnet.id) {
      setError("Switch your wallet to Arc testnet before accepting this quote.");
      return;
    }
    if (address.toLowerCase() !== quote.taker.toLowerCase()) {
      setError("The connected wallet does not match the wallet this quote was issued to. Request a fresh quote.");
      return;
    }
    const escrow = publicEscrow();
    if (!escrow || quote.signature === "0x") {
      setError(quote.unavailableReason || "Live acceptance is unavailable until the escrow and maker key are configured.");
      return;
    }
    if (!publicClient) {
      setError("Arc RPC is unavailable. No acceptance transaction was sent.");
      return;
    }
    if (executionEnvironmentFromStorage() !== "arc" || dataContextFromStorage() !== "live" ||
      quote.status !== "available" || quote.deadline * 1000 <= Date.now()) return;

    operation.current = true;
    setSyncing(true);
    try {
      const fresh = await api<{ quote: QuoteDetail }>(`/api/quotes/${quote.id}`, { cache: "no-store" });
      if (fresh.quote.status !== "available" || fresh.quote.deadline * 1000 <= Date.now()) {
        setQuote(fresh.quote);
        throw new Error("This quote is no longer available. Return to your thesis and request a fresh offer.");
      }
      if (fresh.quote.taker.toLowerCase() !== address.toLowerCase() || fresh.quote.chainId !== arcTestnet.id) {
        throw new Error("The quote wallet or network changed. No acceptance transaction was sent.");
      }
      const total = BigInt(fresh.quote.premium) + BigInt(fresh.quote.fee);
      const allowance = await publicClient.readContract({
        address: publicUsdc(),
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, escrow],
      });
      if (allowance < total) {
        setStep("Confirming the exact USDC allowance");
        const approvalHash = await writeContractAsync({
          address: publicUsdc(),
          abi: erc20Abi,
          functionName: "approve",
          args: [escrow, total],
          chainId: arcTestnet.id,
        });
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== "success") throw new Error("The USDC allowance transaction reverted. The quote was not accepted.");
        const confirmedAllowance = await publicClient.readContract({
          address: publicUsdc(),
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, escrow],
        });
        if (confirmedAllowance < total) throw new Error("Arc did not confirm enough allowance for the premium and fee. The quote was not accepted.");
      }
      if (fresh.quote.deadline * 1000 <= Date.now()) {
        setNow(Date.now());
        throw new Error("The quote expired before Arc acceptance was sent.");
      }
      setStep("Confirm the Arc escrow acceptance in your wallet");
      const hash = await writeContractAsync({
        address: escrow,
        abi: escrowAbi,
        functionName: "accept",
        args: [
          {
            maker: fresh.quote.maker,
            taker: fresh.quote.taker,
            escrow: fresh.quote.escrow,
            token: fresh.quote.token,
            familyHash: fresh.quote.familyHash,
            payoffHash: fresh.quote.payoffHash,
            maxPayout: BigInt(fresh.quote.maxPayout),
            premium: BigInt(fresh.quote.premium),
            fee: BigInt(fresh.quote.fee),
            nonce: BigInt(fresh.quote.nonce),
            issuedAt: BigInt(fresh.quote.issuedAt),
            deadline: BigInt(fresh.quote.deadline),
            chainId: BigInt(fresh.quote.chainId),
            longstop: BigInt(fresh.quote.longstop),
            finalizationDelay: fresh.quote.finalizationDelay,
          },
          fresh.quote.payouts.map((payout) => BigInt(payout)),
          fresh.quote.signature,
        ],
        chainId: arcTestnet.id,
      });
      rememberAttempt(`thesis:arc-accept:${quote.id}`, hash);
      setAcceptHash(hash);
      setStep("Waiting for the Arc acceptance receipt");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The Arc acceptance could not be sent.");
      setStep("");
      setSyncing(false);
    } finally {
      operation.current = false;
    }
  }

  async function syncAcceptedPosition(hash: `0x${string}`) {
    if (!quote) return;
    setSyncing(true);
    setSyncFailed(false);
    setError("");
    setStep("Verifying the escrow event and recording your position");
    try {
      const result = await api<{ position: RecordedPosition }>("/api/positions", {
        method: "POST",
        body: JSON.stringify({ quoteId: quote.id, mode: "live", txHash: hash }),
      });
      setPosition(result.position);
      setStep("");
      rememberAttempt(arcKey, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The confirmed position could not be synchronized.");
      setSyncFailed(true);
      setStep("Arc confirmed the transaction. Retry synchronization; do not accept the quote again.");
    } finally {
      setSyncing(false);
    }
  }

  async function syncManualAcceptance() {
    const hash = manualHash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      setError("Enter the full Arc transaction hash from your wallet.");
      return;
    }
    await syncAcceptedPosition(hash as `0x${string}`);
  }

  useEffect(() => {
    if (!acceptanceReceipt || acceptanceReceipt.status !== "success" || !acceptHash || syncStarted.current === acceptHash) return;
    syncStarted.current = acceptHash;
    void syncAcceptedPosition(acceptHash);
  }, [acceptanceReceipt, acceptHash]);

  useEffect(() => {
    if (acceptanceReceipt?.status === "reverted") {
      setError("The Arc acceptance reverted. No position was recorded.");
      setStep("");
      setSyncing(false);
      setAcceptHash(undefined);
      rememberAttempt(arcKey, null);
      return;
    }
    if (receiptError && waitError) {
      setError(`Arc transaction status could not be read yet: ${waitError.message}`);
      setStep("The transaction may still be pending. Check its status before taking another action.");
    }
  }, [acceptanceReceipt, receiptError, waitError, arcKey]);

  async function checkPosition() {
    if (!quote || operation.current || syncing) return;
    operation.current = true;
    setChecking(true);
    setError("");
    try {
      const { quote: latest } = await api<{ quote: QuoteDetail }>(`/api/quotes/${quote.id}`, { cache: "no-store" });
      setQuote(latest);
      const found = await recordedPosition(quote.id);
      if (found) {
        setPosition(found);
        setPaperUnknown(false);
        rememberAttempt(paperKey, null);
        rememberAttempt(arcKey, null);
      } else if (latest.signature === "0x" && ["expired", "invalidated", "unavailable"].includes(latest.status)) {
        setPaperUnknown(false);
        rememberAttempt(paperKey, null);
      } else {
        setError("There is no position recorded for this quote yet.");
      }
    } catch {
      setError("The position status is unavailable. Try checking it again.");
    } finally {
      operation.current = false;
      setChecking(false);
    }
  }

  async function refreshQuote() {
    if (!quote?.thesisId || operation.current || checking || syncing || acceptHash || paperUnknown || position) return;
    const paper = quote.signature === "0x";
    const execution = executionEnvironmentFromStorage();
    if (paper ? execution !== "paper" : execution !== "arc" || dataContextFromStorage() !== "live" || address?.toLowerCase() !== quote.taker.toLowerCase()) return;
    operation.current = true;
    setRefreshing(true);
    setError("");
    try {
      const { quote: latest } = await api<{ quote: QuoteDetail }>(`/api/quotes/${quote.id}`, { cache: "no-store" });
      if (latest.status !== "expired" && latest.status !== "available") {
        setQuote(latest);
        if (latest.status === "accepted") setPosition(await recordedPosition(quote.id));
        return;
      }
      const result = await api<{ quote: SignedQuote }>("/api/quotes", {
        method: "POST",
        body: JSON.stringify({
          thesisId: quote.thesisId,
          mode: paper ? "paper" : "live",
          maxPayout: formatUsdc(BigInt(quote.maxPayout)),
          ...(!paper && address ? { taker: address } : {}),
        }),
      });
      setQuote({ ...result.quote, thesisId: quote.thesisId, mode: quote.mode });
      setFreshTerms(true);
      setNow(Date.now());
      router.replace(`/quotes/${encodeURIComponent(result.quote.id)}?refreshed=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "A fresh quote could not be requested.");
    } finally {
      operation.current = false;
      setRefreshing(false);
    }
  }

  if (error && !quote) return <Card><p role="alert" className="text-bad">{error}</p><Button kind="secondary" onClick={() => setLoadAttempt((value) => value + 1)}>Retry loading quote</Button></Card>;
  if (!quote) return <p role="status">Loading quote…</p>;
  const paper = quote.signature === "0x";
  const execution = executionEnvironmentFromStorage();
  const dataContext = dataContextFromStorage();
  const remaining = Math.max(0, Math.ceil((quote.deadline * 1000 - (now || Date.now())) / 1000));
  const expired = quote.status === "expired" || (quote.status === "available" && remaining === 0);
  const available = quote.status === "available" && !expired;
  const accepted = quote.status === "accepted";
  const busy = checking || refreshing || syncing || isPending || paperAccepting;
  const canAcceptPaper = execution === "paper" && paper && available && !paperUnknown;
  const arcContext = execution === "arc" && dataContext === "live" && !paper;
  const canAcceptLive = arcContext && available && !acceptHash;
  const canRefresh = Boolean(quote.thesisId) && (available || expired) && !acceptHash && !paperUnknown &&
    (paper ? execution === "paper" : arcContext && address?.toLowerCase() === quote.taker.toLowerCase());
  const quoteCost = BigInt(quote.premium) + BigInt(quote.fee);
  const reviewHref = quote.thesisId ? `/theses/${quote.thesisId}/review?construction=arc-custom&maxPayout=${encodeURIComponent(formatUsdc(BigInt(quote.maxPayout)))}` : "/theses";
  const scenarioAmounts = quote.scenarioLabels.map((label, index) => {
    const value = quote.payouts[index];
    return { label, payout: typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : null };
  });
  const hasFullSchedule = scenarioAmounts.length > 0 && scenarioAmounts.length === quote.payouts.length && scenarioAmounts.every(({ payout }) => payout !== null);
  const worstLoss = hasFullSchedule ? scenarioAmounts.reduce((worst, row) => {
    const loss = quoteCost - row.payout!;
    return loss > worst ? loss : worst;
  }, 0n) : null;

  if (position) {
    const resultThesis = position.thesisId || quote.thesisId;
    const resultCost = BigInt(position.premium ?? quote.premium) + BigInt(position.fee ?? quote.fee);
    return (
      <Card className="quote-result">
        <div className="flex items-start gap-3"><Icon name="success" className="text-good" size={27} /><div>
          <h1 className="font-serif text-2xl font-bold">{paper ? "Paper position created" : "Arc position recorded"}</h1>
          <p className="text-sm th-muted">{paper ? "Your simulated position is ready to track." : "Your confirmed Arc acceptance is linked to this position."}</p>
        </div></div>
        <dl className="quote-receipt">
          <div><dt>Position ID</dt><dd>{position.id}</dd></div>
          <div><dt>Quote ID</dt><dd>{quote.id}</dd></div>
          <div><dt>{paper ? "Simulated cost" : "Total cost"}</dt><dd>{formatUsdc(resultCost)} USDC</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2"><Button href={`/positions/${position.id}`} icon="arrow-right">Open position</Button><Button href={resultThesis ? `/theses/${resultThesis}` : "/theses"} kind="secondary">Return to thesis</Button></div>
      </Card>
    );
  }

  return (
    <div className="quote-review space-y-4">
      <header>
        <span className="source-pill">{paper ? "Paper simulation" : "Arc testnet"}</span>
        <h1 className="font-serif text-3xl">{paper ? "Simulated quote" : "Arc quote"}</h1>
        <p className="break-all text-xs th-muted">Quote {quote.id}</p>
      </header>
      {freshTerms ? <p role="status" className="th-alert text-sm">Fresh quote ready. Review the amounts and settlement payouts before accepting.</p> : null}
      {expired && !acceptHash ? <div className="th-alert th-alert--warning quote-expired">
        <Icon name="warning" size={23} /><div><h2>Quote expired</h2><p className="text-sm">This offer can no longer be accepted. {paperUnknown ? "Check whether your earlier attempt created a position." : "Request a fresh quote to review the latest terms."}</p></div>
      </div> : null}
      {quote.status === "invalidated" ? <p role="status" className="th-alert th-alert--warning text-sm">This offer is no longer valid. Review the current thesis before requesting a new quote.</p> : null}
      {quote.status === "unavailable" ? <p role="status" className="th-alert th-alert--warning text-sm">{quote.unavailableReason || "This offer is unavailable."}</p> : null}
      {accepted ? <p role="status" className="th-alert text-sm">{checking ? "Finding the recorded position…" : "This quote was already accepted. Check for the recorded position."}</p> : null}
      <Card>
        <h2 className="font-serif text-xl">Exact terms</h2>
        <dl className="quote-terms">
          <div><dt>Premium</dt><dd>{formatUsdc(BigInt(quote.premium))} USDC</dd></div>
          <div><dt>{paper ? "Simulated fee" : "Fee"}</dt><dd>{formatUsdc(BigInt(quote.fee))} USDC</dd></div>
          <div><dt>Total cost</dt><dd>{formatUsdc(quoteCost)} USDC</dd></div>
          <div><dt>{expired ? "Expired at" : "Deadline"}</dt><dd><time dateTime={new Date(quote.deadline * 1000).toISOString()}>{new Date(quote.deadline * 1000).toLocaleString()}</time></dd></div>
        </dl>
        {available ? <p className="quote-countdown"><Icon name="clock" size={16} /> Expires in <strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong></p> : null}
        <ul className="mt-2 space-y-1 text-sm th-muted">
          <li>Issued {new Date(quote.issuedAt * 1000).toLocaleString()} · {paper ? "Recorded market data" : `Chain ${quote.chainId}`}</li>
          {quote.longstop ? <li>Settlement longstop {new Date(quote.longstop * 1000).toISOString()}.</li> : null}
          {quote.signature !== "0x" ? <li>A proposed result has a {Math.ceil(quote.finalizationDelay / 3600)} hour correction window. After the delay, anyone may finalize before the longstop; any still-open position is refundable at the longstop.</li> : null}
          {!paper ? <li className="break-all">Escrow {quote.escrow}</li> : null}
        </ul>
        <div className="table-scroll mt-4 max-h-60 overflow-y-auto overscroll-contain" tabIndex={0} aria-label="Full quoted payout schedule">
          <table className="quote-scenarios text-sm">
            <thead><tr><th>Settlement scenario</th><th>Gross payout</th><th>Net result</th></tr></thead>
            <tbody>{scenarioAmounts.map(({ label, payout }, index) => (
              <tr key={`${index}-${label}`}><td>{label}</td><td>{payout === null ? "—" : `${formatUsdc(payout)} USDC`}</td><td>{payout === null ? "—" : `${formatUsdc(payout - quoteCost, { signed: true })} USDC`}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {worstLoss !== null ? <p className="quote-loss text-sm"><Icon name="shield" size={19} /><span>Largest loss in the listed settlement scenarios</span><strong>{formatUsdc(worstLoss)} USDC</strong></p> : null}
      </Card>
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      {step ? <p role="status" className="text-sm text-muted">{step}</p> : null}
      {acceptHash ? <p className="break-all text-xs text-muted">Arc transaction: {acceptHash}</p> : null}
      {waiting ? <p>Waiting for confirmation…</p> : null}
      {receiptError && acceptHash && !acceptanceReceipt ? (
        <Button onClick={() => { setError(""); setStep("Checking the existing Arc transaction."); void retryReceipt(); }} kind="secondary" icon="refresh" disabled={waiting}>Check Arc transaction status</Button>
      ) : null}
      {syncFailed && acceptanceReceipt?.status === "success" && acceptHash ? (
        <Button onClick={() => void syncAcceptedPosition(acceptHash)} disabled={syncing}>{syncing ? "Verifying…" : "Retry position synchronization"}</Button>
      ) : null}
      {arcContext && !accepted && !acceptHash ? (
        <Card className="space-y-3">
          <h2 className="font-serif text-xl">Already submitted an Arc transaction?</h2>
          <p className="text-sm text-muted">Paste its hash to verify and record the position. This never submits or retries a transaction.</p>
          <Field label="Arc transaction hash">
            <input className={inputCls("font-mono")} value={manualHash} onChange={(event) => setManualHash(event.target.value)} placeholder="0x…" autoComplete="off" />
          </Field>
          <Button onClick={() => void syncManualAcceptance()} disabled={syncing}>{syncing ? "Checking receipt…" : "Verify and record position"}</Button>
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canAcceptPaper ? <Button onClick={paperAccept} disabled={busy}>{paperAccepting ? "Creating paper position…" : "Accept paper quote"}</Button> : null}
        {canAcceptLive ? <Button onClick={liveAccept} disabled={busy}>{isPending || syncing ? "Preparing…" : "Accept exact offer"}</Button> : null}
        {canRefresh ? <Button onClick={() => void refreshQuote()} kind={expired ? "primary" : "secondary"} icon="refresh" disabled={busy}>{refreshing ? "Requesting…" : "Refresh quote"}</Button> : null}
        {paperUnknown || accepted ? <Button onClick={() => void checkPosition()} kind="secondary" disabled={busy}>{checking ? "Checking…" : "Check position status"}</Button> : null}
        {paperUnknown && available && execution === "paper" ? <Button onClick={paperAccept} kind="ghost" disabled={busy}>Retry same acceptance</Button> : null}
        {canAcceptLive && address && chainId !== arcTestnet.id && !acceptHash ? (
          <Button kind="secondary" onClick={async () => {
            try { await switchChainAsync({ chainId: arcTestnet.id }); setError(""); }
            catch { setError("Arc testnet was not selected. No transaction was sent."); }
          }}>Switch to Arc testnet</Button>
        ) : null}
        {!paper ? <Button href="/wallet" kind="ghost">Check funds</Button> : null}
        <Button href={reviewHref} kind="ghost">Back to review</Button>
      </div>
    </div>
  );
}
