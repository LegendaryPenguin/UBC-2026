"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatUsdc } from "@/lib/format";
import { Button, Card, Empty } from "@/components/ui";
import type { PositionRecord } from "@/lib/domain/types";

export default function Portfolio() {
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [tab, setTab] = useState("positions");
  useEffect(() => {
    api<{ positions: PositionRecord[] }>("/api/positions").then((r) => setPositions(r.positions || []));
  }, []);
  const cost = positions.reduce((s, p) => s + BigInt(p.premium || "0"), 0n);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Portfolio</h1>
      <p className="text-sm text-muted">Cost basis {formatUsdc(cost)} USDC. Unrealized value is hidden unless an exit quote exists.</p>
      <div className="flex gap-2">
        {["positions", "exposure", "claims"].map((t) => (
          <button key={t} className={`min-h-11 rounded-lg border px-3 ${tab === t ? "bg-ink text-white" : "border-line"}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {positions.length === 0 ? <Empty title="No positions">Research first. A connected wallet is not a position.</Empty> : null}
      {positions.map((p) => (
        <Card key={p.id}>
          <div className="flex items-center justify-between">
            <div>
              <p>{p.topicSlug} · {p.status} · {p.mode}</p>
              <p className="text-sm text-muted">Premium {formatUsdc(BigInt(p.premium))} · max {formatUsdc(BigInt(p.maxPayout))}</p>
            </div>
            <Button href={`/positions/${p.id}`}>View</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
