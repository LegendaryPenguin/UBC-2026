"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import type { PositionRecord } from "@/lib/domain/types";
import { formatUsdc } from "@/lib/format";
import { Button, Card } from "@/components/ui";
import { escrowAbi } from "@/lib/escrow/abi";
import { publicEscrow } from "@/lib/chain";
import { useWriteContract } from "wagmi";

export default function PositionPage() {
  const { id } = useParams<{ id: string }>();
  const [position, setPosition] = useState<PositionRecord | null>(null);
  const [tab, setTab] = useState("overview");
  const { writeContractAsync, isPending } = useWriteContract();
  useEffect(() => {
    api<{ position: PositionRecord }>(`/api/positions/${id}`).then((r) => setPosition(r.position));
  }, [id]);
  if (!position) return <p>Loading position…</p>;
  async function claim() {
    if (!position) return;
    if (position.mode === "paper") {
      const res = await api<{ position: PositionRecord }>(`/api/positions/${id}`, { method: "PATCH", body: JSON.stringify({ action: "claim" }) });
      setPosition(res.position);
      return;
    }
    const escrow = publicEscrow();
    if (!escrow || !position.chainPositionId) {
      alert("Live claim needs the escrow address and onchain id. Direct contract claim remains available in the wallet.");
      return;
    }
    const hash = await writeContractAsync({
      address: escrow,
      abi: escrowAbi,
      functionName: "claim",
      args: [BigInt(position.chainPositionId)],
    });
    const res = await api<{ position: PositionRecord }>(`/api/positions/${id}`, { method: "PATCH", body: JSON.stringify({ action: "claim", txHash: hash }) });
    setPosition(res.position);
  }
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Position</h1>
      <p className="text-sm text-muted">{position.status} · {position.mode} · tx {position.txHash || "paper"}</p>
      <div className="flex gap-2">
        {["overview", "thesis", "rules", "transactions"].map((t) => (
          <button key={t} className={`min-h-11 rounded-lg border px-3 ${tab === t ? "bg-ink text-white" : "border-line"}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <Card>
        <table className="w-full text-sm">
          <tbody>
            {position.labels.map((l, i) => (
              <tr key={l}><td className="py-1">{l}</td><td>{formatUsdc(BigInt(position.payouts[i] || "0"))} USDC</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="flex flex-wrap gap-2">
        {(position.status === "resolved" || position.status === "voided") ? (
          <Button onClick={claim} disabled={isPending}>Claim payout</Button>
        ) : null}
        <Button href={`/positions/${id}/exit`} kind="ghost">Request exit</Button>
        <Button href={`/alerts`} kind="ghost">Add alert</Button>
      </div>
    </div>
  );
}
