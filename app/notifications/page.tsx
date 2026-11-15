"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Empty } from "@/components/ui";
import type { NotificationItem } from "@/lib/domain/types";

export default function Inbox() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ notifications: NotificationItem[] }>("/api/alerts").then((r) => setItems(r.notifications || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Notifications could not be loaded"));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">Inbox</h1>
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}{error === "Sign in required" ? <> · <a className="underline" href="/auth">Sign in</a></> : null}</p> : null}
      {items.length === 0 ? <Empty title="No messages">Notifications never place trades.</Empty> : null}
      {items.map((n) => (
        <div key={n.id} className={`rounded-card border border-line bg-white p-4 ${n.read ? "opacity-70" : ""}`}>
          <Link href={n.href} className="font-medium">{n.title}</Link>
          <p className="text-sm text-muted">{n.body}</p>
          <Button kind="ghost" onClick={async () => {
            setError("");
            try {
              const action = n.read ? "unread" : "read";
              const result = await api<{ notification: NotificationItem }>("/api/alerts", { method: "PATCH", body: JSON.stringify({ id: n.id, action }) });
              setItems((current) => current.map((item) => item.id === n.id ? result.notification : item));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Notification could not be updated");
            }
          }}>{n.read ? "Mark unread" : "Mark read"}</Button>
        </div>
      ))}
    </div>
  );
}
