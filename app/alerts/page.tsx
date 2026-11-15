"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Field, inputCls } from "@/components/ui";
import type { AlertRule } from "@/lib/domain/types";

export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [name, setName] = useState("Price cross");
  const [type, setType] = useState("price");
  useEffect(() => {
    api<{ alerts: AlertRule[] }>("/api/alerts").then((r) => setAlerts(r.alerts || []));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Alerts</h1>
      <p className="text-sm text-muted">Alerts never authorize trades. Vague invalidation text is stored as human review, not a deterministic trigger.</p>
      <Card className="space-y-3">
        <Field label="Name"><input className={inputCls()} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Type">
          <select className={inputCls()} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="price">Reference price</option>
            <option value="quote">Quote in budget</option>
            <option value="source">Source status</option>
            <option value="cutoff">Trading cutoff</option>
            <option value="claim">Claim available</option>
          </select>
        </Field>
        <Button
          onClick={async () => {
            const res = await api<{ alert: AlertRule }>("/api/alerts", { method: "POST", body: JSON.stringify({ name, type }) });
            setAlerts((s) => [res.alert, ...s]);
          }}
        >
          Create
        </Button>
      </Card>
      {alerts.map((a) => (
        <Card key={a.id}>
          <div className="flex items-center justify-between">
            <span>{a.name} · {a.type} · {a.paused ? "paused" : "active"}</span>
            <Button kind="ghost" onClick={() => api("/api/alerts", { method: "PATCH", body: JSON.stringify({ id: a.id, paused: !a.paused }) })}>Pause</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
