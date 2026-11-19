"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import type { PositionRecord } from "@/lib/domain/types";
import { formatUsdc } from "@/lib/format";
import { Button, Card, Empty } from "@/components/ui";
import { escrowAbi } from "@/lib/escrow/abi";
import { arcTestnet, publicEscrow } from "@/lib/chain";
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

type PositionResponse = { position: PositionRecord; walletAddress: string | null; syncWarning?: string };
type Transaction = { id: string; type: string; status: string; hash: string | null; amount: string; unit: string; related: string | null; createdAt: string };
const TABS = ["overview", "thesis", "rules", "transactions"] as const;

export default function PositionPage() {
  const { id } = useParams<{ id: string }>();
  const { address, chainId } = useAccount();
  const [position, setPosition] = useState<PositionRecord | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]>("overview");
  const [claimHash, setClaimHash] = useState<`0x${string}`>();
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const syncStarted = useRef<string | null>(null);
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const { data: claimReceipt, isLoading: claimWaiting, isError: receiptError, error: waitError } =
    useWaitForTransactionReceipt({ hash: claimHash, chainId: arcTestnet.id });

  async function refreshPosition() {
    const result = await api<PositionResponse>(`/api/positions/${id}`);
    setPosition(result.position);
    setWalletAddress(result.walletAddress);
    setSyncWarning(result.syncWarning || "");
  }

  async function refreshTransactions() {
    const result = await api<{ transactions: Transaction[] }>("/api/activity");
    setTransactions(result.transactions.filter((transaction) => transaction.related === id));
  }

  useEffect(() => {
    Promise.all([refreshPosition(), refreshTransactions()]).catch((err) => {
      setError(err instanceof Error ? err.message : "Position details could not be loaded");
    });
  }, [id]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some((item) => item === requested)) setTab(requested as (typeof TABS)[number]);
  }, []);

  function selectTab(value: (typeof TABS)[number]) {
    setTab(value);
    const url = new URL(window.location.href);
    if (value === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function syncClaim(txHash: `0x${string}`) {
    setSyncing(true);
    setSyncFailed(false);
    setError("");
    try {
      const result = await api<{ position: PositionRecord }>(`/api/positions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "claim", txHash }),
      });
      setPosition(result.position);
      setSyncWarning("");
      await refreshTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The confirmed claim could not be synchronized.");
      setSyncFailed(true);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!claimHash || !claimReceipt || claimReceipt.status !== "success" || syncStarted.current === claimHash) return;
    syncStarted.current = claimHash;
    void syncClaim(claimHash);
  }, [claimHash, claimReceipt]);

  useEffect(() => {
    if (claimReceipt?.status === "reverted") {
      setError("Arc reverted the claim. The position remains claimable if the contract state has not changed.");
      return;
    }
    if (receiptError && waitError) setError(`Arc claim status could not be read yet: ${waitError.message}`);
  }, [claimReceipt, receiptError, waitError]);

  async function claim() {
    if (!position) return;
    setError("");
    if (position.mode === "paper") {
      try {
        const result = await api<{ position: PositionRecord }>(`/api/positions/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "claim" }),
        });
        setPosition(result.position);
        await refreshTransactions();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Paper claim failed.");
      }
      return;
    }
    const escrow = publicEscrow();
    if (!escrow || !position.chainPositionId) {
      setError("The Arc escrow or onchain position ID is unavailable. No claim was sent.");
      return;
    }
    if (!address || !walletAddress || address.toLowerCase() !== walletAddress.toLowerCase()) {
      setError("Connect the wallet that accepted this position before claiming it.");
      return;
    }
    if (chainId !== arcTestnet.id) {
      setError("Switch your wallet to Arc testnet before claiming.");
      return;
    }
    try {
      setSyncing(true);
      const latest = await api<PositionResponse>(`/api/positions/${id}`);
      setPosition(latest.position);
      setSyncWarning(latest.syncWarning || "");
      if (latest.syncWarning) throw new Error("Arc could not verify the latest position status. No claim was sent.");
      if (latest.position.status !== "resolved" && latest.position.status !== "voided") {
        throw new Error("The onchain position is not claimable yet.");
      }
      const hash = await writeContractAsync({
        address: escrow,
        abi: escrowAbi,
        functionName: "claim",
        args: [BigInt(position.chainPositionId)],
        chainId: arcTestnet.id,
      });
      setClaimHash(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arc claim could not be sent.");
    } finally {
      setSyncing(false);
    }
  }

  if (!position && error) return <Empty title="Position unavailable">{error}</Empty>;
  if (!position) return <p>Loading position…</p>;
  const claimable = position.status === "resolved" || position.status === "voided";
  const totalCost = BigInt(position.premium) + BigInt(position.fee);
  const explorer = arcTestnet.blockExplorers.default.url;

  return (
    <div className="screen-position space-y-4">
      <div className="workspace-header">
        <p className="text-xs uppercase tracking-wide text-muted">{position.topicSlug} · {position.mode}</p>
        <h1 className="workspace-title screen-heading">Position</h1>
        <p className="text-sm text-muted">{position.status.replaceAll("_", " ")} · escrow #{position.chainPositionId || "paper"}</p>
      </div>
      {syncWarning ? <p role="status" className="rounded-lg border border-line bg-white p-3 text-sm text-muted">{syncWarning} Stored status is shown until Arc is reachable.</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}</p> : null}
      {claimHash ? <p className="break-all text-xs text-muted">Claim transaction: <a className="underline" href={`${explorer}/tx/${claimHash}`} target="_blank" rel="noreferrer">{claimHash}</a></p> : null}
      {claimWaiting ? <p role="status" className="text-sm text-muted">Waiting for Arc to confirm the claim…</p> : null}
      {syncFailed && claimHash && claimReceipt?.status === "success" ? <Button onClick={() => void syncClaim(claimHash)} disabled={syncing}>{syncing ? "Verifying…" : "Retry claim synchronization"}</Button> : null}

      <div className="position-tabs" role="tablist" aria-label="Position details">
        {TABS.map((item) => (
          <button key={item} role="tab" aria-selected={tab === item} className="position-tab" onClick={() => selectTab(item)}>{item}</button>
        ))}
      </div>

      {tab === "overview" ? (
        <Card>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Premium + fee</dt><dd>{formatUsdc(totalCost)} USDC</dd></div>
            <div><dt className="text-xs text-muted">Maximum loss</dt><dd>{formatUsdc(totalCost)} USDC</dd></div>
            <div><dt className="text-xs text-muted">Maximum payout</dt><dd>{formatUsdc(BigInt(position.maxPayout))} USDC</dd></div>
            <div><dt className="text-xs text-muted">Accepted</dt><dd>{new Date(position.createdAt).toLocaleString()}</dd></div>
          </dl>
          <h2 className="mt-5 font-serif text-xl">Payout schedule</h2>
          <table className="mt-2 w-full text-left text-sm">
            <thead><tr><th className="border-b border-line py-2">Scenario</th><th className="border-b border-line py-2">Payout</th></tr></thead>
            <tbody>{position.labels.map((label, index) => (
              <tr key={`${index}-${label}`}><td className="border-b border-line py-2">{label}</td><td className="border-b border-line py-2">{formatUsdc(BigInt(position.payouts[index] || "0"))} USDC</td></tr>
            ))}</tbody>
          </table>
        </Card>
      ) : null}
      {tab === "thesis" ? (
        <Card className="space-y-3">
          <h2 className="font-serif text-xl">Source thesis</h2>
          <p className="text-sm">This position was created from thesis <span className="font-mono">{position.thesisId}</span>.</p>
          <Button href={`/theses/${position.thesisId}`}>Open thesis</Button>
        </Card>
      ) : null}
      {tab === "rules" ? (
        <Card className="space-y-3">
          <h2 className="font-serif text-xl">Settlement boundary</h2>
          <p className="text-sm">The escrow enforces this recorded payout schedule after an authorized resolver proposes a scenario. Proposals can be corrected during the recorded window; anyone can finalize an unchanged proposal after that window. If the position remains open at longstop, the contract permits only a refund. Arc verifies the transaction and collateral; it does not independently verify Gemini’s offchain result.</p>
          {position.mode === "live" ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Correction window</dt><dd>{Math.ceil(position.finalizationDelay / 3600)} hour after each proposal or correction</dd></div>
              <div><dt className="text-xs text-muted">Refund longstop</dt><dd>{new Date(position.longstop * 1000).toISOString()}</dd></div>
            </dl>
          ) : <p className="text-xs text-muted">Paper simulation; no Arc outcome or refund is available.</p>}
          <p className="text-xs text-muted">Market family: {position.familyId} · topic: {position.topicSlug}</p>
          <Button href={`/topics/${position.topicSlug}`} kind="ghost">Review topic evidence and rules</Button>
        </Card>
      ) : null}
      {tab === "transactions" ? (
        <Card>
          <h2 className="font-serif text-xl">Position activity</h2>
          {transactions.length === 0 ? <Empty title="No activity recorded">Arc confirmation history will appear here when transactions are synchronized.</Empty> : (
            <div className="mt-3 space-y-3">{transactions.map((transaction) => (
              <div key={transaction.id} className="rounded-lg border border-line p-3">
                <p className="font-medium">{transaction.type.replaceAll("_", " ")} · {transaction.status}</p>
                <p className="text-sm text-muted">{formatUsdc(BigInt(transaction.amount || "0"))} {transaction.unit} · {new Date(transaction.createdAt).toLocaleString()}</p>
                {transaction.hash ? <a className="break-all text-xs text-action underline" href={`${explorer}/tx/${transaction.hash}`} target="_blank" rel="noreferrer">{transaction.hash}</a> : <p className="text-xs text-muted">Paper record</p>}
              </div>
            ))}</div>
          )}
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {claimable ? <Button onClick={() => void claim()} disabled={isPending || syncing || claimWaiting || Boolean(claimHash)}>{isPending || syncing ? "Preparing claim…" : "Claim payout"}</Button> : null}
        {position.mode === "live" && claimable && address && chainId !== arcTestnet.id ? (
          <Button kind="secondary" onClick={async () => {
            try { await switchChainAsync({ chainId: arcTestnet.id }); setError(""); }
            catch { setError("Arc testnet was not selected. No claim was sent."); }
          }}>Switch to Arc testnet</Button>
        ) : null}
        <Button href={`/positions/${id}/exit`} kind="ghost">Exit options</Button>
        <Button href={`/portfolio?view=alerts&positionId=${encodeURIComponent(position.id)}`} kind="ghost">Set settlement alert</Button>
      </div>
    </div>
  );
}
