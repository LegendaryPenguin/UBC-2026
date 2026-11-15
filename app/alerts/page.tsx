"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, Field, inputCls } from "@/components/ui";
import type { AlertRule } from "@/lib/domain/types";

export default function Alerts() {
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("Price cross");
  const [type, setType] = useState("price");
  useEffect(() => {
    api<{ alerts: AlertRule[] }>("/api/alerts").then((r) => setAlerts(r.alerts || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Alerts could not be loaded"));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Alerts</h1>
      <p className="text-sm text-muted">Alerts never authorize trades. Vague invalidation text is stored as human review, not a deterministic trigger.</p>
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}{error === "Sign in required" ? <> · <a className="underline" href="/auth">Sign in</a></> : null}</p> : null}
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
            setError("");
            try {
              const res = await api<{ alert: AlertRule }>("/api/alerts", { method: "POST", body: JSON.stringify({ name, type }) });
              setAlerts((s) => [res.alert, ...s]);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Alert could not be created");
            }
          }}
        >
          Create
        </Button>
      </Card>
      {alerts.map((a) => (
        <Card key={a.id}>
          <div className="flex items-center justify-between">
            <span>{a.name} · {a.type} · {a.paused ? "paused" : "active"}</span>
            <Button kind="ghost" onClick={async () => {
              setError("");
              try {
                const res = await api<{ alert: AlertRule }>("/api/alerts", { method: "PATCH", body: JSON.stringify({ id: a.id, paused: !a.paused }) });
                setAlerts((items) => items.map((item) => item.id === a.id ? res.alert : item));
              } catch (err) {
                setError(err instanceof Error ? err.message : "Alert could not be updated");
              }
            }}>{a.paused ? "Resume" : "Pause"}</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
