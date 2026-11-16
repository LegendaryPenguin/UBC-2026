"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, modeFromStorage } from "@/lib/client";
import type { SignedQuote } from "@/lib/domain/types";
import { formatUsdc } from "@/lib/format";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { erc20Abi, escrowAbi } from "@/lib/escrow/abi";
import { arcTestnet, publicEscrow, publicUsdc } from "@/lib/chain";
import { useAccount, usePublicClient, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

export default function QuotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { address, chainId } = useAccount();
  const [quote, setQuote] = useState<SignedQuote | null>(null);
  const [error, setError] = useState("");
  const [manualHash, setManualHash] = useState("");
  const [acceptHash, setAcceptHash] = useState<`0x${string}`>();
  const [paperAccepting, setPaperAccepting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [step, setStep] = useState("");
  const syncStarted = useRef<string | null>(null);
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const { data: acceptanceReceipt, isLoading: waiting, isError: receiptError, error: waitError } =
    useWaitForTransactionReceipt({ hash: acceptHash, chainId: arcTestnet.id });

  useEffect(() => {
    api<{ quote: SignedQuote }>(`/api/quotes/${id}`)
      .then((result) => setQuote(result.quote))
      .catch((err) => setError(err instanceof Error ? err.message : "Quote could not be loaded"));
  }, [id]);

  async function paperAccept() {
    if (!quote || paperAccepting) return;
    setPaperAccepting(true);
    setError("");
    try {
      const result = await api<{ position: { id: string } }>("/api/positions", {
        method: "POST",
        body: JSON.stringify({ quoteId: quote.id, mode: "paper" }),
      });
      router.push(`/positions/${result.position.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paper acceptance failed.");
    } finally {
      setPaperAccepting(false);
    }
  }

  async function liveAccept() {
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

    setSyncing(true);
    try {
      const fresh = await api<{ quote: SignedQuote }>(`/api/quotes/${quote.id}`);
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
      setAcceptHash(hash);
      setStep("Waiting for the Arc acceptance receipt");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The Arc acceptance could not be sent.");
      setStep("");
      setSyncing(false);
    }
  }

  async function syncAcceptedPosition(hash: `0x${string}`) {
    if (!quote) return;
    setSyncing(true);
    setSyncFailed(false);
    setError("");
    setStep("Verifying the escrow event and recording your position");
    try {
      const result = await api<{ position: { id: string } }>("/api/positions", {
        method: "POST",
        body: JSON.stringify({ quoteId: quote.id, mode: "live", txHash: hash }),
      });
      router.push(`/positions/${result.position.id}`);
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
      return;
    }
    if (receiptError && waitError) {
      setError(`Arc transaction status could not be read yet: ${waitError.message}`);
      setStep("The transaction may still be pending. Check its status before taking another action.");
    }
  }, [acceptanceReceipt, receiptError, waitError]);

  if (error && !quote) return <p className="text-bad">{error}</p>;
  if (!quote) return <p>Loading quote…</p>;
  const mode = modeFromStorage();
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Quote {quote.id}</h1>
      <Card>
        <h2 className="font-serif text-xl">Exact terms</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>Pay {formatUsdc(BigInt(quote.premium))} USDC premium plus {formatUsdc(BigInt(quote.fee))} fee.</li>
          <li>Maximum loss is that total if every scenario pays 0.</li>
          <li>Maximum payout {formatUsdc(BigInt(quote.maxPayout))} USDC if the winning scenario is fully funded.</li>
          <li>Deadline {new Date(quote.deadline * 1000).toISOString()}</li>
          <li>Settlement longstop {quote.longstop ? new Date(quote.longstop * 1000).toISOString() : "not applicable to simulation"}.</li>
          {quote.signature !== "0x" ? <li>A proposed result has a {Math.ceil(quote.finalizationDelay / 3600)} hour correction window. After the delay, anyone may finalize before the longstop; any still-open position is refundable at the longstop.</li> : null}
          {quote.signature === "0x" ? <li>Simulation using recorded market data.</li> : <li>Chain {quote.chainId} · escrow {quote.escrow}</li>}
        </ul>
        <table className="mt-4 w-full text-sm">
          <thead><tr><th className="text-left">Scenario</th><th>Payout</th></tr></thead>
          <tbody>{quote.scenarioLabels.map((label, index) => (
            <tr key={label}><td className="py-1">{label}</td><td>{formatUsdc(BigInt(quote.payouts[index] || "0"))}</td></tr>
          ))}</tbody>
        </table>
      </Card>
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      {step ? <p role="status" className="text-sm text-muted">{step}</p> : null}
      {acceptHash ? <p className="break-all text-xs text-muted">Arc transaction: {acceptHash}</p> : null}
      {waiting ? <p>Waiting for confirmation…</p> : null}
      {syncFailed && acceptanceReceipt?.status === "success" && acceptHash ? (
        <Button onClick={() => void syncAcceptedPosition(acceptHash)} disabled={syncing}>{syncing ? "Verifying…" : "Retry position synchronization"}</Button>
      ) : null}
      {mode === "live" && quote.signature !== "0x" ? (
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
        {mode === "paper" && quote.signature === "0x" && quote.status === "available" ? <Button onClick={paperAccept} disabled={paperAccepting}>{paperAccepting ? "Creating paper position…" : "Accept paper quote"}</Button> : null}
        {mode === "live" && quote.signature !== "0x" && quote.status === "available" && !acceptHash ? <Button onClick={liveAccept} disabled={isPending || syncing}>{isPending || syncing ? "Preparing…" : "Accept exact offer"}</Button> : null}
        {mode === "live" && address && chainId !== arcTestnet.id && !acceptHash ? (
          <Button kind="secondary" onClick={async () => {
            try { await switchChainAsync({ chainId: arcTestnet.id }); setError(""); }
            catch { setError("Arc testnet was not selected. No transaction was sent."); }
          }}>Switch to Arc testnet</Button>
        ) : null}
        <Button href="/wallet" kind="ghost">Check funds</Button>
      </div>
    </div>
  );
}
