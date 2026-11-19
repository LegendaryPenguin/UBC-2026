"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { AlertRule, NotificationItem, PositionRecord } from "@/lib/domain/types";
import { Button, Card, Empty, Field, inputCls } from "@/components/ui";

export function PortfolioAlerts({ embedded = false }: { embedded?: boolean }) {
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [positionId, setPositionId] = useState("");
  const [name, setName] = useState("Position settlement update");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [alertResult, positionResult] = await Promise.all([
        api<{ alerts: AlertRule[]; notifications: NotificationItem[] }>("/api/alerts"),
        api<{ positions: PositionRecord[] }>("/api/positions"),
      ]);
      setAlerts(alertResult.alerts || []);
      setNotifications(alertResult.notifications || []);
      setPositions(positionResult.positions || []);
      const requested = new URLSearchParams(window.location.search).get("positionId") || "";
      setPositionId((current) => current || (positionResult.positions.some((item) => item.id === requested) ? requested : positionResult.positions[0]?.id || ""));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Alerts could not be loaded. Retry to check the saved rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createAlert() {
    if (!positionId || !name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await api<{ alert: AlertRule }>("/api/alerts", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), type: "claim", positionId }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Alert could not be created. Your position is unchanged.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAlert(alert: AlertRule) {
    setError("");
    try {
      const result = await api<{ alert: AlertRule }>("/api/alerts", {
        method: "PATCH",
        body: JSON.stringify({ id: alert.id, paused: !alert.paused }),
      });
      setAlerts((current) => current.map((item) => item.id === alert.id ? result.alert : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Alert could not be updated. Retry without changing your position.");
    }
  }

  async function toggleNotification(item: NotificationItem) {
    setError("");
    try {
      const result = await api<{ notification: NotificationItem }>("/api/alerts", {
        method: "PATCH",
        body: JSON.stringify({ id: item.id, action: item.read ? "unread" : "read" }),
      });
      setNotifications((current) => current.map((entry) => entry.id === item.id ? result.notification : entry));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notification could not be updated.");
    }
  }

  const selectedPosition = positions.find((item) => item.id === positionId);
  const activePositions = positions.filter((item) => !["claimed", "exited"].includes(item.status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>{embedded ? <h2 className="font-serif text-2xl">Alerts and updates</h2> : <h1 className="font-serif text-3xl">Position alerts</h1>}<p className="mt-1 text-sm text-muted">Follow a position’s settlement state without changing or authorizing a trade.</p></div>
        <Button onClick={() => void load()} kind="ghost" disabled={loading}>{loading ? "Checking…" : "Refresh"}</Button>
      </div>
      <Card className="space-y-3">
        <h2 className="font-serif text-xl">Set a settlement alert</h2>
        <p className="text-sm text-muted">Thesis checks for a resolved, voided, or claimed status when you open or refresh this page. This MVP uses the in-app inbox; it does not send push notifications or run a background monitor.</p>
        {!loading && positions.length === 0 ? <Empty title="No positions to follow">Create a position from a reviewed, supported quote first. Research and saved theses do not require a wallet.</Empty> : null}
        {positions.length > 0 ? <>
          <Field label="Position">
            <select className={inputCls()} value={positionId} onChange={(event) => setPositionId(event.target.value)} disabled={saving}>
              {activePositions.map((item) => <option key={item.id} value={item.id}>{item.topicSlug} · {item.mode} · {item.status}</option>)}
              {selectedPosition && !activePositions.some((item) => item.id === selectedPosition.id) ? <option value={selectedPosition.id}>{selectedPosition.topicSlug} · {selectedPosition.mode} · {selectedPosition.status}</option> : null}
            </select>
          </Field>
          <Field label="Alert name"><input className={inputCls()} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} disabled={saving} /></Field>
          {selectedPosition ? <p className="text-xs text-muted">Linked thesis <Link className="text-action underline" href={`/theses/${selectedPosition.thesisId}`}>revisit</Link> · Position <Link className="text-action underline" href={`/positions/${selectedPosition.id}`}>inspect</Link></p> : null}
          <Button onClick={() => void createAlert()} disabled={saving || !positionId || !name.trim()}>{saving ? "Saving alert…" : "Set alert"}</Button>
        </> : null}
      </Card>

      {error ? <Card><p role="alert" className="text-sm text-bad">{error}</p><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void load()} kind="secondary">Retry</Button>{error.toLowerCase().includes("sign in") ? <Button href="/auth">Sign in</Button> : null}<Button href="/portfolio" kind="ghost">Return to Portfolio</Button></div></Card> : null}
      {loading ? <p role="status" className="text-sm text-muted">Loading positions and checking saved alerts…</p> : null}

      <section className="space-y-3">
        <h2 className="font-serif text-2xl">Saved alerts</h2>
        {!loading && !alerts.length ? <Empty title="No saved alerts">Choose a position above to follow its settlement state.</Empty> : null}
        {alerts.map((alert) => (
          <Card key={alert.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{alert.name} · {alert.triggeredAt ? "triggered" : alert.paused ? "paused" : "active"}</p>
              <p className="text-sm text-muted">{alert.topicSlug || "Position"} · in-app settlement update</p>
              {alert.positionId ? <Link className="mt-1 inline-block text-sm text-action" href={`/positions/${alert.positionId}`}>Open linked position</Link> : null}
              {alert.triggeredAt ? <p className="mt-1 text-xs text-muted">Checked {new Date(alert.triggeredAt).toLocaleString()}</p> : null}
            </div>
            {!alert.triggeredAt ? <Button kind="ghost" onClick={() => void toggleAlert(alert)}>{alert.paused ? "Resume" : "Pause"}</Button> : null}
          </Card>
        ))}
      </section>

      <section id="inbox" className="space-y-3">
        <h2 className="font-serif text-2xl">Inbox</h2>
        {!loading && !notifications.length ? <Empty title="No position updates yet">When a saved alert sees a final position state, its update appears here.</Empty> : null}
        {notifications.map((item) => (
          <Card key={item.id} className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-medium">{item.title} · {item.read ? "read" : "unread"}</p><p className="mt-1 text-sm text-muted">{item.body}</p><Link className="mt-1 inline-block text-sm text-action" href={item.href}>Open position</Link></div>
            <Button kind="ghost" onClick={() => void toggleNotification(item)}>{item.read ? "Mark unread" : "Mark read"}</Button>
          </Card>
        ))}
      </section>
    </div>
  );
}
