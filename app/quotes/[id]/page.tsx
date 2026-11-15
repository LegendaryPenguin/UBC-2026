"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, modeFromStorage } from "@/lib/client";
import type { SignedQuote } from "@/lib/domain/types";
import { formatUsdc } from "@/lib/format";
import { Button, Card } from "@/components/ui";
import { erc20Abi, escrowAbi } from "@/lib/escrow/abi";
import { publicEscrow, publicUsdc } from "@/lib/chain";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";

export default function QuotePage() {
  const { id } = useParams<{ id: string }>();
  const { address } = useAccount();
  const [quote, setQuote] = useState<SignedQuote | null>(null);
  const [error, setError] = useState("");
  const [thesisId, setThesisId] = useState("");
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: waiting, isSuccess } = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    api<{ quote: SignedQuote }>(`/api/quotes/${id}`).then((r) => setQuote(r.quote)).catch((e) => setError(e.message));
    setThesisId(new URLSearchParams(window.location.search).get("thesis") || "");
  }, [id]);

  async function paperAccept() {
    if (!quote) return;
    try {
      const res = await api<{ position: { id: string } }>("/api/positions", {
        method: "POST",
        body: JSON.stringify({ quoteId: quote.id, mode: "paper" }),
      });
      window.location.href = `/positions/${res.position.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paper acceptance failed.");
    }
  }

  async function liveAccept() {
    if (!quote || !address) {
      setError("Connect a wallet on Arc testnet first.");
      return;
    }
    const escrow = publicEscrow();
    if (!escrow || quote.signature === "0x") {
      setError(quote.unavailableReason || "Live acceptance is unavailable until the escrow and maker key are configured.");
      return;
    }
    const total = BigInt(quote.premium) + BigInt(quote.fee);
    await writeContractAsync({
      address: publicUsdc(),
      abi: erc20Abi,
      functionName: "approve",
      args: [escrow, total],
    });
    await writeContractAsync({
      address: escrow,
      abi: escrowAbi,
      functionName: "accept",
      args: [
        {
          maker: quote.maker,
          taker: quote.taker,
          escrow: quote.escrow,
          token: quote.token,
          familyHash: quote.familyHash,
          payoffHash: quote.payoffHash,
          maxPayout: BigInt(quote.maxPayout),
          premium: BigInt(quote.premium),
          fee: BigInt(quote.fee),
          nonce: BigInt(quote.nonce),
          issuedAt: BigInt(quote.issuedAt),
          deadline: BigInt(quote.deadline),
          chainId: BigInt(quote.chainId),
        },
        quote.payouts.map((p) => BigInt(p)),
        quote.signature,
      ],
    });
  }

  useEffect(() => {
    if (!isSuccess || !hash || !quote) return;
    api("/api/positions", {
      method: "POST",
      body: JSON.stringify({
        quoteId: quote.id,
        thesisId,
        mode: "hackathon",
        txHash: hash,
        topicSlug: "topic",
        familyId: "family",
      }),
    }).then((r: unknown) => {
      const id = (r as { position: { id: string } }).position.id;
      window.location.href = `/positions/${id}`;
    });
  }, [isSuccess, hash, quote, thesisId]);

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
          {quote.signature === "0x" ? <li>Simulation using recorded market data.</li> : <li>Chain {quote.chainId} · escrow {quote.escrow}</li>}
        </ul>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr><th className="text-left">Scenario</th><th>Payout</th></tr>
          </thead>
          <tbody>
            {quote.scenarioLabels.map((l, i) => (
              <tr key={l}><td>{l}</td><td>{formatUsdc(BigInt(quote.payouts[i] || "0"))}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {waiting ? <p>Waiting for confirmation… {hash}</p> : null}
      <div className="flex flex-wrap gap-2">
        {mode === "paper" && quote.signature === "0x" && quote.status === "available" ? <Button onClick={paperAccept}>Accept paper quote</Button> : null}
        {mode === "live" && quote.signature !== "0x" && quote.status === "available" ? <Button onClick={liveAccept} disabled={isPending}>Accept exact offer</Button> : null}
        <Button href="/wallet" kind="ghost">Check funds</Button>
      </div>
    </div>
  );
}
