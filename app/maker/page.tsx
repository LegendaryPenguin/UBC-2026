"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Field, inputCls } from "@/components/ui";

export default function Maker() {
  const [spread, setSpread] = useState("400");
  const [policy, setPolicy] = useState<{ paused: boolean; spreadBps: number } | null>(null);
  useEffect(() => {
    api<{ policy: { paused: boolean; spreadBps: number } }>("/api/maker").then((r) => setPolicy(r.policy));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Maker console</h1>
      <Card className="space-y-3">
        <p className="text-sm">Paused: {String(policy?.paused)} · spread {policy?.spreadBps} bps. A dashboard toggle does not revoke an already signed quote.</p>
        <Field label="Spread bps">
          <input className={inputCls()} value={spread} onChange={(e) => setSpread(e.target.value)} />
        </Field>
        <Button onClick={() => api("/api/maker", { method: "POST", body: JSON.stringify({ spreadBps: Number(spread) }) })}>Set policy</Button>
        <Button kind="secondary" onClick={() => api("/api/maker", { method: "POST", body: JSON.stringify({ paused: true }) })}>Pause new quotes</Button>
        <Button href="/wallet" kind="ghost">Deposit collateral</Button>
      </Card>
    </div>
  );
}
