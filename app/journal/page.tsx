"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Empty } from "@/components/ui";

export default function Journal() {
  const [rows, setRows] = useState<{ id: string; thesisId: string; reflection: string }[]>([]);
  useEffect(() => {
    api<{ positions: { id: string; thesisId: string }[] }>("/api/positions").then((r) => {
      setRows((r.positions || []).map((p) => ({ id: p.id, thesisId: p.thesisId, reflection: "" })));
    });
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Journal</h1>
      <p className="text-sm text-muted">A winning trade is not proof of sound reasoning. A losing trade is not proof of a bad process.</p>
      {rows.length === 0 ? <Empty title="No decision snapshots">Snapshots freeze when a quote is accepted.</Empty> : null}
      {rows.map((r) => (
        <div key={r.id} className="rounded-card border border-line bg-white p-4">
          <p>Position {r.id}</p>
          <Button href={`/journal/${r.id}`}>Open review</Button>
        </div>
      ))}
    </div>
  );
}
