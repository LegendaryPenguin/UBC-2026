"use client";

import { Button, Card, Field, inputCls } from "@/components/ui";
import { api } from "@/lib/client";
import { useState } from "react";

export default function Ops() {
  const [id, setId] = useState("");
  const [idx, setIdx] = useState("0");
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Operations</h1>
      <Card className="space-y-3">
        <p className="text-sm">Hackathon resolver model: an authorized relayer publishes a source-backed scenario. This is labeled trust, not a decentralized oracle.</p>
        <Field label="Position id"><input className={inputCls()} value={id} onChange={(e) => setId(e.target.value)} /></Field>
        <Field label="Scenario index"><input className={inputCls()} value={idx} onChange={(e) => setIdx(e.target.value)} /></Field>
        <Button onClick={() => api("/api/ops/settle", { method: "POST", body: JSON.stringify({ positionId: id, action: "resolve", scenarioIndex: Number(idx) }) })}>Resolve</Button>
        <Button kind="ghost" onClick={() => api("/api/ops/settle", { method: "POST", body: JSON.stringify({ positionId: id, action: "void" }) })}>Void</Button>
      </Card>
    </div>
  );
}
